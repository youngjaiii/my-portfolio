import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createSupabaseClient, corsHeaders, getAuthUser } from '../_shared/utils.ts';

declare const Deno: typeof globalThis.Deno;

/**
 * 날짜를 YYYY-MM-DD 형식으로 변환
 */
function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 날짜에 개월 수를 더함
 */
function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

/**
 * 멤버십 자동 연장 및 만료 알림 처리
 * 
 * GET: 현재 사용자의 멤버십 알림 정보 조회 (만료 예정, 연장 실패 등)
 * PATCH: 알림 확인 처리 (다시 표시하지 않음)
 * POST: 매일 실행되는 크론잡 (자동 연장 처리 및 알림)
 */
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ==========================================
    // PATCH: 알림 확인 처리 (다시 표시하지 않음)
    // ==========================================
    if (req.method === 'PATCH') {
      const user = await getAuthUser(req);
      if (!user) {
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
        );
      }

      const supabase = createSupabaseClient();
      const body = await req.json();
      const { 
        expiry_subscription_ids,
        renewal_failed_subscription_ids,
        renewed_subscription_ids,
      } = body as { 
        expiry_subscription_ids?: string[];
        renewal_failed_subscription_ids?: string[];
        renewed_subscription_ids?: string[];
      };

      const now = new Date().toISOString();
      let totalDismissed = 0;

      // 만료 예정 알림 확인 처리
      if (expiry_subscription_ids && expiry_subscription_ids.length > 0) {
        const { error } = await supabase
          .from('membership_subscriptions')
          .update({ expiry_notification_dismissed_at: now })
          .eq('user_id', user.id)
          .in('id', expiry_subscription_ids);

        if (error) {
          console.error('Error dismissing expiry notifications:', error);
        } else {
          totalDismissed += expiry_subscription_ids.length;
        }
      }

      // 연장 실패 알림 확인 처리
      if (renewal_failed_subscription_ids && renewal_failed_subscription_ids.length > 0) {
        const { error } = await supabase
          .from('membership_subscriptions')
          .update({ renewal_failed_notification_dismissed_at: now })
          .eq('user_id', user.id)
          .in('id', renewal_failed_subscription_ids);

        if (error) {
          console.error('Error dismissing renewal_failed notifications:', error);
        } else {
          totalDismissed += renewal_failed_subscription_ids.length;
        }
      }

      // 연장 성공 알림 확인 처리
      if (renewed_subscription_ids && renewed_subscription_ids.length > 0) {
        const { error } = await supabase
          .from('membership_subscriptions')
          .update({ renewed_notification_dismissed_at: now })
          .eq('user_id', user.id)
          .in('id', renewed_subscription_ids);

        if (error) {
          console.error('Error dismissing renewed notifications:', error);
        } else {
          totalDismissed += renewed_subscription_ids.length;
        }
      }

      return new Response(
        JSON.stringify({ success: true, dismissed_count: totalDismissed }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // ==========================================
    // GET: 현재 사용자의 멤버십 알림 정보 조회
    // ==========================================
    if (req.method === 'GET') {
      const user = await getAuthUser(req);
      if (!user) {
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
        );
      }

      const supabase = createSupabaseClient();
      const now = new Date();
      const today = formatDateOnly(now);
      const tomorrow = formatDateOnly(new Date(now.getTime() + 24 * 60 * 60 * 1000));
      const threeDaysLater = formatDateOnly(new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000));

      // 프론트엔드 MembershipNotificationData 형식에 맞춘 결과
      const results = {
        renewed: [] as Array<{
          subscription_id: string;
          user_id: string;
          user_name: string;
          membership_id: string;
          membership_name: string;
          price: number;
          new_expired_at: string;
        }>,
        renewal_failed: [] as Array<{
          subscription_id: string;
          membership_name: string;
          reason: string;
        }>,
        expiry_notified: [] as Array<{
          subscription_id: string;
          membership_name: string;
          expired_at: string;
        }>,
        errors: [] as string[],
      };

      // 1. 만료 예정 알림 (3일 이내 만료, auto_renewal_enabled=false, 아직 확인하지 않은 것만)
      const { data: expiringSubscriptions } = await supabase
        .from('membership_subscriptions')
        .select(`
          id,
          expired_at,
          auto_renewal_enabled,
          expiry_notification_dismissed_at,
          membership:membership_id(
            id,
            name,
            monthly_price,
            discount_rate
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .eq('auto_renewal_enabled', false)
        .is('expiry_notification_dismissed_at', null)
        .gte('expired_at', today)
        .lte('expired_at', threeDaysLater);

      if (expiringSubscriptions && expiringSubscriptions.length > 0) {
        for (const sub of expiringSubscriptions) {
          const membership = sub.membership as any;
          if (!membership) continue;

          results.expiry_notified.push({
            subscription_id: sub.id,
            membership_name: membership.name,
            expired_at: formatDateOnly(new Date(sub.expired_at)),
          });
        }
      }

      // 2. 자동 연장 실패 알림 (오늘 만료되어 취소된 구독, 아직 확인하지 않은 것만)
      // 최근 24시간 내에 canceled 상태로 변경된 구독 중 포인트 부족으로 취소된 것
      const { data: failedRenewals } = await supabase
        .from('membership_subscriptions')
        .select(`
          id,
          expired_at,
          renewal_failed_notification_dismissed_at,
          membership:membership_id(
            id,
            name,
            monthly_price,
            discount_rate
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'canceled')
        .eq('expired_at', today)
        .is('renewal_failed_notification_dismissed_at', null);

      // 유저 포인트 조회
      const { data: memberData } = await supabase
        .from('members')
        .select('total_points, name')
        .eq('id', user.id)
        .maybeSingle();

      const currentPoints = memberData?.total_points || 0;
      const userName = memberData?.name || '';

      if (failedRenewals && failedRenewals.length > 0) {
        for (const sub of failedRenewals) {
          const membership = sub.membership as any;
          if (!membership) continue;

          const basePrice = membership.monthly_price || 0;
          const discountRate = membership.discount_rate || 0;
          let totalPrice = basePrice;
          if (discountRate > 0) {
            totalPrice = Math.round(basePrice * (1 - discountRate / 100));
          }

          // 포인트 부족으로 취소된 경우에만 알림
          if (currentPoints < totalPrice) {
            results.renewal_failed.push({
              subscription_id: sub.id,
              membership_name: membership.name,
              reason: `포인트 부족 (필요: ${totalPrice}P, 보유: ${currentPoints}P)`,
            });
          }
        }
      }

      // 3. 자동 연장 성공 알림 (오늘 갱신된 구독, 아직 확인하지 않은 것만)
      // membership_subscriptions에서 오늘 연장되고 아직 알림 확인하지 않은 구독 조회
      const { data: renewedSubscriptions } = await supabase
        .from('membership_subscriptions')
        .select(`
          id,
          user_id,
          membership_id,
          expired_at,
          renewed_notification_dismissed_at,
          membership:membership_id(
            id,
            name,
            monthly_price,
            discount_rate
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .is('renewed_notification_dismissed_at', null);

      // member_points_logs에서 오늘 membership_renewal 로그 확인
      const { data: renewalLogs } = await supabase
        .from('member_points_logs')
        .select('log_id, amount, description, created_at')
        .eq('member_id', user.id)
        .eq('type', 'spend')
        .like('log_id', `membership_renewal_%_${today}`)
        .gte('created_at', `${today}T00:00:00.000Z`);

      if (renewalLogs && renewalLogs.length > 0 && renewedSubscriptions) {
        // 연장된 구독 ID 목록 생성 (membership_id -> subscription 매핑)
        const renewedSubMap = new Map<string, typeof renewedSubscriptions[0]>();
        for (const sub of renewedSubscriptions) {
          renewedSubMap.set(sub.membership_id, sub);
        }

        for (const log of renewalLogs) {
          // description에서 멤버십 이름 추출: "{멤버십이름} 멤버십 자동 연장"
          const match = log.description?.match(/^(.+) 멤버십 자동 연장$/);
          const membershipName = match ? match[1] : '멤버십';
          
          // log_id에서 membership_id 추출: membership_renewal_{membership_id}_{user_id}_{date}
          const logIdMatch = log.log_id?.match(/^membership_renewal_([^_]+)_/);
          const membershipId = logIdMatch ? logIdMatch[1] : '';

          // 해당 구독이 아직 알림 확인되지 않은 경우에만 추가
          const sub = renewedSubMap.get(membershipId);
          if (sub) {
            results.renewed.push({
              subscription_id: sub.id, // 실제 구독 ID 사용
              user_id: user.id,
              user_name: userName,
              membership_id: membershipId,
              membership_name: membershipName,
              price: log.amount,
              new_expired_at: sub.expired_at ? formatDateOnly(new Date(sub.expired_at)) : '',
            });
          }
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          results,
          today,
          tomorrow,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // ==========================================
    // POST: 크론잡 - 자동 연장 처리 및 알림
    // ==========================================
    const supabase = createSupabaseClient();
    const now = new Date();
    const today = formatDateOnly(now);
    const tomorrow = formatDateOnly(new Date(now.getTime() + 24 * 60 * 60 * 1000));

    const results = {
      renewed: [] as Array<{
        subscription_id: string;
        user_id: string;
        user_name: string;
        membership_id: string;
        membership_name: string;
        price: number;
        new_expired_at: string;
      }>,
      renewal_failed: [] as Array<{
        subscription_id: string;
        membership_name: string;
        reason: string;
      }>,
      expiry_notified: [] as Array<{
        subscription_id: string;
        membership_name: string;
        expired_at: string;
      }>,
      errors: [] as string[],
    };

    // ==========================================
    // 1. 자동 연장 처리 (expired_at = 오늘, auto_renewal_enabled = true, status = 'active')
    // ==========================================
    const { data: renewalSubscriptions, error: renewalError } = await supabase
      .from('membership_subscriptions')
      .select(`
        id,
        user_id,
        membership_id,
        expired_at,
        membership:membership_id(
          id,
          name,
          monthly_price,
          discount_rate,
          partner_id,
          is_active,
          renewal_message,
          renewal_media_info
        )
      `)
      .eq('status', 'active')
      .eq('auto_renewal_enabled', true)
      .lte('expired_at', today);

    if (renewalError) {
      console.error('Error fetching renewal subscriptions:', renewalError);
      results.errors.push(`Renewal fetch error: ${renewalError.message}`);
    }

    if (renewalSubscriptions && renewalSubscriptions.length > 0) {
      for (const sub of renewalSubscriptions) {
        try {
          const membership = sub.membership as any;
          if (!membership || !membership.is_active) {
            // 멤버십이 비활성화된 경우 구독 취소
            await supabase
              .from('membership_subscriptions')
              .update({ status: 'canceled' })
              .eq('id', sub.id);
            results.renewal_failed.push({
              subscription_id: sub.id,
              membership_name: membership?.name || '알 수 없음',
              reason: '멤버십 비활성화',
            });
            continue;
          }

          // 가격 계산
          const basePrice = membership.monthly_price || 0;
          const discountRate = membership.discount_rate || 0;
          let totalPrice = basePrice;
          if (discountRate > 0) {
            totalPrice = Math.round(basePrice * (1 - discountRate / 100));
          }
          if (totalPrice < 0) totalPrice = 0;

          // 유저 포인트 조회
          const { data: memberData, error: memberError } = await supabase
            .from('members')
            .select('total_points, name')
            .eq('id', sub.user_id)
            .maybeSingle();

          if (memberError || !memberData) {
            results.renewal_failed.push({
              subscription_id: sub.id,
              membership_name: membership.name,
              reason: '회원 조회 실패',
            });
            continue;
          }

          const currentPoints = memberData.total_points || 0;

          // 포인트 부족 시
          if (currentPoints < totalPrice) {
            // 자동 연장 실패 - 포인트 부족 알림
            await sendNotification(supabase, req, sub.user_id, {
              title: '멤버십 자동 연장 실패',
              body: `포인트가 부족하여 ${membership.name} 멤버십이 연장되지 않았습니다. (필요: ${totalPrice}P, 보유: ${currentPoints}P)`,
              url: '/membership/subscriptions',
              notification_type: 'membership_renewal_failed',
            });

            // 구독 상태를 'canceled'로 변경
            await supabase
              .from('membership_subscriptions')
              .update({ status: 'canceled' })
              .eq('id', sub.id);

            results.renewal_failed.push({
              subscription_id: sub.id,
              membership_name: membership.name,
              reason: `포인트 부족 (필요: ${totalPrice}P, 보유: ${currentPoints}P)`,
            });
            continue;
          }

          // 포인트 차감
          const newTotalPoints = currentPoints - totalPrice;
          await supabase
            .from('members')
            .update({ total_points: newTotalPoints })
            .eq('id', sub.user_id);

          // member_points_logs 기록
          const logId = `membership_renewal_${sub.membership_id}_${sub.user_id}_${today}`;
          await supabase
            .from('member_points_logs')
            .insert({
              member_id: sub.user_id,
              type: 'spend',
              amount: totalPrice,
              description: `${membership.name} 멤버십 자동 연장`,
              log_id: logId,
            });

          // 멤버십 소유 파트너에게 포인트 적립 (partners.total_points만 증가)
          // 참고: members.total_points는 충전/사용 포인트, partners.total_points는 번 포인트 (분리됨)
          if (membership.partner_id) {
            const { data: ownerPartner } = await supabase
              .from('partners')
              .select('id, total_points')
              .eq('id', membership.partner_id)
              .maybeSingle();

            if (ownerPartner) {
              // 파트너 포인트 적립 (partners.total_points만)
              await supabase
                .from('partners')
                .update({ total_points: (ownerPartner.total_points || 0) + totalPrice })
                .eq('id', ownerPartner.id);

              // partner_points_logs 기록
              await supabase
                .from('partner_points_logs')
                .insert({
                  partner_id: ownerPartner.id,
                  type: 'earn',
                  amount: totalPrice,
                  description: `${memberData.name || '회원'} ${membership.name} 자동 연장`,
                  log_id: logId,
                });
            }
          }

          // 만료일 갱신 (+1개월)
          const newExpiredAt = formatDateOnly(addMonths(new Date(sub.expired_at), 1));
          await supabase
            .from('membership_subscriptions')
            .update({ expired_at: newExpiredAt })
            .eq('id', sub.id);

          // 자동 연장 성공 알림
          await sendNotification(supabase, req, sub.user_id, {
            title: '멤버십 자동 연장 완료',
            body: `${membership.name} 멤버십이 자동 연장되었습니다. (${totalPrice}P 차감)`,
            url: '/membership/subscriptions',
            notification_type: 'membership_renewed',
          });

          // 자동 갱신 메시지 발송 (renewal_message 또는 renewal_media_info가 있는 경우)
          if (membership.renewal_message || membership.renewal_media_info) {
            try {
              // 파트너의 member_id 조회
              const { data: partnerData } = await supabase
                .from('partners')
                .select('member_id')
                .eq('id', membership.partner_id)
                .single();

              const partnerMemberId = partnerData?.member_id;

              if (partnerMemberId) {
                // chat_room 찾기 또는 생성
                let chatRoomId: string | null = null;
                
                const { data: existingRoom } = await supabase
                  .from('chat_rooms')
                  .select('id')
                  .or(`and(created_by.eq.${sub.user_id},partner_id.eq.${partnerMemberId}),and(created_by.eq.${partnerMemberId},partner_id.eq.${sub.user_id})`)
                  .eq('is_active', true)
                  .maybeSingle();

                if (existingRoom) {
                  chatRoomId = existingRoom.id;
                } else {
                  const { data: newRoom } = await supabase
                    .from('chat_rooms')
                    .insert({
                      created_by: partnerMemberId,
                      partner_id: sub.user_id,
                      is_active: true,
                    })
                    .select('id')
                    .single();

                  if (newRoom) {
                    chatRoomId = newRoom.id;
                  }
                }

                if (chatRoomId) {
                  // renewal_media_info가 있으면 미디어 메시지 발송
                  const mediaPaths = membership.renewal_media_info;
                  const mediaList = typeof mediaPaths === 'string' 
                    ? [mediaPaths] 
                    : (Array.isArray(mediaPaths) ? mediaPaths : []);
                  
                  if (mediaList.length > 0) {
                    for (const mediaItem of mediaList) {
                      const mediaPath = typeof mediaItem === 'string' ? mediaItem : mediaItem.path;
                      if (mediaPath) {
                        const { data: fileData, error: downloadError } = await supabase.storage
                          .from('membership_info_media')
                          .download(mediaPath);

                        if (!downloadError && fileData) {
                          const ext = mediaPath.split('.').pop()?.toLowerCase() || '';
                          const isVideo = ['mp4', 'mov', 'avi', 'webm'].includes(ext);
                          const mediaType = isVideo ? 'video' : 'image';

                          const timestamp = Date.now();
                          const randomStr = Math.random().toString(36).substring(2, 8);
                          const fileName = mediaPath.split('/').pop() || `media.${ext}`;
                          const chatMediaPath = `${chatRoomId}/${timestamp}_${randomStr}_${fileName}`;

                          const { error: uploadError } = await supabase.storage
                            .from('chat-media')
                            .upload(chatMediaPath, fileData, {
                              contentType: fileData.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
                            });

                          if (!uploadError) {
                            const { data: newMessage } = await supabase
                              .from('member_chats')
                              .insert({
                                sender_id: partnerMemberId,
                                receiver_id: sub.user_id,
                                message: '',
                                is_read: false,
                                chat_room_id: chatRoomId,
                              })
                              .select('id')
                              .single();

                            if (newMessage) {
                              await supabase
                                .from('chat_media')
                                .insert({
                                  chat_id: newMessage.id,
                                  chat_room_id: chatRoomId,
                                  media_url: chatMediaPath,
                                  media_type: mediaType,
                                  file_name: fileName,
                                });
                            }
                          }
                        }
                      }
                    }
                  }

                  // renewal_message가 있으면 텍스트 메시지 발송
                  if (membership.renewal_message) {
                    await supabase
                      .from('member_chats')
                      .insert({
                        sender_id: partnerMemberId,
                        receiver_id: sub.user_id,
                        message: membership.renewal_message,
                        is_read: false,
                        chat_room_id: chatRoomId,
                      });
                  }
                }
              }
            } catch (renewalMsgErr) {
              console.error('Failed to send renewal message:', renewalMsgErr);
            }
          }

          results.renewed.push({
            subscription_id: sub.id,
            user_id: sub.user_id,
            user_name: memberData.name || '회원',
            membership_id: sub.membership_id,
            membership_name: membership.name,
            price: totalPrice,
            new_expired_at: newExpiredAt,
          });
        } catch (err: any) {
          console.error(`Error processing renewal for ${sub.id}:`, err);
          results.errors.push(`${sub.id}: ${err.message}`);
        }
      }
    }

    // ==========================================
    // 2. 만료 예정 알림 (expired_at = 내일, auto_renewal_enabled = false, status = 'active')
    // ==========================================
    const { data: expirySubscriptions, error: expiryError } = await supabase
      .from('membership_subscriptions')
      .select(`
        id,
        user_id,
        membership_id,
        expired_at,
        membership:membership_id(
          id,
          name,
          partner_id
        )
      `)
      .eq('status', 'active')
      .eq('auto_renewal_enabled', false)
      .eq('expired_at', tomorrow);

    if (expiryError) {
      console.error('Error fetching expiry subscriptions:', expiryError);
      results.errors.push(`Expiry fetch error: ${expiryError.message}`);
    }

    if (expirySubscriptions && expirySubscriptions.length > 0) {
      for (const sub of expirySubscriptions) {
        try {
          const membership = sub.membership as any;
          if (!membership) continue;

          // 만료 예정 알림
          await sendNotification(supabase, req, sub.user_id, {
            title: '멤버십 만료 예정',
            body: `${membership.name} 멤버십이 내일 만료됩니다. 자동 연장을 설정하시면 편리하게 이용하실 수 있습니다.`,
            url: '/membership/subscriptions',
            notification_type: 'membership_expiry_reminder',
          });

          results.expiry_notified.push({
            subscription_id: sub.id,
            membership_name: membership.name,
            expired_at: sub.expired_at,
          });
        } catch (err: any) {
          console.error(`Error sending expiry notification for ${sub.id}:`, err);
          results.errors.push(`${sub.id}: ${err.message}`);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Membership renewal cron completed',
        results,
        today,
        tomorrow,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (err: any) {
    console.error('Cron error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

/**
 * 네이티브 푸시 알림 전송 헬퍼 함수
 */
async function sendNotification(
  supabase: any,
  req: Request,
  userId: string,
  options: {
    title: string;
    body: string;
    url: string;
    notification_type: string;
  }
) {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !anonKey) return;

    const authHeader = req.headers.get('Authorization') || `Bearer ${anonKey}`;

    await fetch(`${supabaseUrl}/functions/v1/push-native`, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        apikey: anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'enqueue_notification',
        user_id: userId,
        target_member_id: userId,
        title: options.title,
        body: options.body,
        icon: null,
        url: options.url,
        notification_type: options.notification_type,
        data: {
          type: options.notification_type,
          url: options.url,
        },
        process_immediately: true,
      }),
    });
  } catch (err) {
    console.error('Failed to send notification:', err);
  }
}

