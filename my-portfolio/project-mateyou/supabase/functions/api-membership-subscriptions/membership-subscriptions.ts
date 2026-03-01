import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  corsHeaders,
  createSupabaseClient,
  successResponse,
  errorResponse,
  getAuthUser,
  parseRequestBody,
} from '../_shared/utils.ts';

// Deno 전역 타입 선언 (로컬 TS 환경에서 Deno 인식용)
declare const Deno: typeof globalThis.Deno;

interface SubscriptionRequestBody {
  membership_id?: string;
  status?: 'active' | 'inactive';  // active: 구독 중, inactive: 기간 만료/자동연장 실패
  next_billing_at?: string;
  expired_at?: string;
  auto_renewal_enabled?: boolean;
}

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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createSupabaseClient();
    const user = await getAuthUser(req);

    // ------------------------
    // POST /api-membership-subscriptions → 멤버십 구독 생성
    //  - membership_id 기준으로 멤버십 정보 조회
    //  - monthly_price 만큼 유저 포인트 차감 (members.total_points)
    //  - member_points_logs(type='spend') 생성
    //  - 멤버십 소유 파트너의 total_points 적립 (partners.total_points)
    // ------------------------
    if (req.url.endsWith('/api-membership-subscriptions') && req.method === 'POST') {
      const body: SubscriptionRequestBody = await parseRequestBody(req);
      if (!body?.membership_id) {
        return errorResponse('VALIDATION_ERROR', 'membership_id is required');
      }

      // auto_renewal_enabled 기본값 true
      const autoRenewalEnabled = body.auto_renewal_enabled !== false;

      // 1) 멤버십 정보 조회 (가격, 할인율 및 파트너 정보용)
      const { data: membership, error: membershipError } = await supabase
        .from('membership')
        .select('id, name, monthly_price, is_active, partner_id, discount_rate, subscription_count, info_media_paths, membership_message')
        .eq('id', body.membership_id)
        .maybeSingle();

      if (membershipError) throw membershipError;
      if (!membership || membership.is_active === false) {
        return errorResponse('INVALID_MEMBERSHIP', '유효하지 않은 멤버십입니다');
      }

      const monthlyPrice: number = membership.monthly_price ?? 0;
      if (!monthlyPrice || monthlyPrice <= 0) {
        return errorResponse('INVALID_PRICE', '멤버십 가격이 올바르지 않습니다');
      }

      // 총 결제 금액 계산 (월 가격 기준, subscription_cycle_months 제거)
      const basePrice: number = monthlyPrice;

      // 멤버십 할인율 적용 (discount_rate: 0 ~ 100, 퍼센트)
      const discountRate: number = (membership as any).discount_rate ?? 0;
      let totalPrice: number = basePrice;
      if (discountRate && discountRate > 0) {
        totalPrice = Math.round(basePrice * (1 - discountRate / 100));
      }
      if (totalPrice < 0) {
        totalPrice = 0;
      }

      // 2) 유저 포인트 조회 및 부족 여부 체크
      const { data: memberData, error: memberError } = await supabase
        .from('members')
        .select('total_points, name')
        .eq('id', user.id)
        .maybeSingle();

      if (memberError) throw memberError;
      const currentPoints: number = memberData?.total_points ?? 0;

      if (currentPoints < totalPrice) {
        return errorResponse(
          'INSUFFICIENT_POINTS',
          `포인트가 부족합니다. 필요 포인트: ${totalPrice}, 보유 포인트: ${currentPoints}`,
        );
      }

      // 3) 멤버십 소유 파트너 정보 조회 (로그 description 용)
      let partnerNameForLog = '파트너';

      let partnerOwnerMemberId: string | null = null;

      if (membership.partner_id) {
        const { data: partnerData, error: partnerError } = await supabase
          .from('partners')
          .select('partner_name, member_id')
          .eq('id', membership.partner_id)
          .maybeSingle();

        if (partnerError) throw partnerError;

        if (partnerData?.partner_name) {
          partnerNameForLog = partnerData.partner_name;
        }
        if (partnerData?.member_id) {
          partnerOwnerMemberId = partnerData.member_id;
        }
      }

      // 로그 description: "파트너이름 멤버십이름 구독"
      const description = `${partnerNameForLog} ${membership.name} 구독`;
      // post_unlocks 와 동일한 패턴의 log_id 사용
      const logId = `membership_subscription_${body.membership_id}_${user.id}`;

      // 이미 구독했는지 확인
      const { data: existing, error: existingError } = await supabase
        .from('membership_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .eq('membership_id', body.membership_id)
        .maybeSingle();
      if (existingError) throw existingError;

      // 4) 구독 레코드 생성 또는 재활성화
      // started_at: 오늘 날짜 (YYYY-MM-DD)
      const now = new Date();
      const startedAt = formatDateOnly(now);
      
      // expired_at: started_at + 1개월 (고정) (YYYY-MM-DD)
      const expiredAt = formatDateOnly(addMonths(now, 1));

      let subscription: any;

      if (existing) {
        // 기존 구독이 있는 경우
        if (existing.status === 'active') {
          // 이미 활성 구독 중이면 오류 반환
          return errorResponse('ALREADY_SUBSCRIBED', '이미 구독 중인 멤버십입니다');
        }

        // inactive 상태면 재활성화 (status, 만료일, next_billing_at 업데이트)
        const { data: updatedData, error: updateError } = await supabase
          .from('membership_subscriptions')
          .update({
            status: 'active',
            started_at: startedAt,
            expired_at: expiredAt,
            next_billing_at: expiredAt,
            auto_renewal_enabled: autoRenewalEnabled,
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (updateError) throw updateError;
        subscription = updatedData;
      } else {
        // 기존 구독이 없으면 새로 생성
        const { data, error } = await supabase
          .from('membership_subscriptions')
          .insert([{
            user_id: user.id,
            membership_id: body.membership_id,
            status: 'active',
            started_at: startedAt,
            expired_at: expiredAt,
            next_billing_at: expiredAt,
            auto_renewal_enabled: autoRenewalEnabled,
          }])
          .select()
          .single();

        if (error) throw error;
        subscription = data;
      }

      // 5) member_points_logs 생성 (type = 'spend')
      // post_unlocks 로직과 동일하게 log_id 포함 + insert 결과까지 검증
      const { data: logRows, error: logError } = await supabase
        .from('member_points_logs')
        .insert({
          member_id: user.id, // member_id 는 members.id (user_id) 와 동일
          type: 'spend',
          amount: totalPrice, // 총 결제 금액 (월 가격 기준)
          description,
          log_id: logId,
          related_review_id: null,
        })
        .select();

      const insertedLog = Array.isArray(logRows) ? logRows[0] : logRows;

      if (logError || !insertedLog) {
        // 로그 생성 실패 시 구독 롤백
        await supabase
          .from('membership_subscriptions')
          .delete()
          .eq('id', subscription.id);

        throw logError || new Error('Failed to insert member_points_logs');
      }

      // 6) members.total_points 차감 (총 결제 금액만큼)
      const newTotalPoints: number = currentPoints - totalPrice;
      const { error: memberUpdateError } = await supabase
        .from('members')
        .update({ total_points: newTotalPoints })
        .eq('id', user.id);

      if (memberUpdateError) {
        // 롤백: 포인트 로그 + 구독 삭제 (post_unlocks 와 동일 패턴)
        await supabase
          .from('member_points_logs')
          .delete()
          .eq('member_id', user.id)
          .eq('log_id', logId);

        await supabase
          .from('membership_subscriptions')
          .delete()
          .eq('id', subscription.id);

        throw memberUpdateError;
      }

      // 7) 멤버십 소유 파트너에게 포인트 적립 (partners.total_points만 증가)
      // 참고: members.total_points는 충전/사용 포인트, partners.total_points는 번 포인트 (분리됨)
      if (membership.partner_id) {
        const { data: ownerPartner, error: ownerPartnerError } = await supabase
          .from('partners')
          .select('id, total_points')
          .eq('id', membership.partner_id)
          .maybeSingle();

        if (ownerPartnerError) throw ownerPartnerError;

        if (ownerPartner) {
          const ownerCurrentPoints: number = ownerPartner.total_points ?? 0;
          const ownerNewPoints = ownerCurrentPoints + totalPrice;

          const { error: ownerUpdateError } = await supabase
            .from('partners')
            .update({ total_points: ownerNewPoints })
            .eq('id', ownerPartner.id);

          if (ownerUpdateError) throw ownerUpdateError;

          // partner_points_logs에 수익 기록
          const { error: partnerLogError } = await supabase
            .from('partner_points_logs')
            .insert({
              partner_id: ownerPartner.id,
              type: 'earn',
              amount: totalPrice,
              description: `${memberData?.name || '회원'} ${membership.name} 구독`,
              log_id: logId,
            });

          if (partnerLogError) {
            console.error('Failed to insert partner points log:', partnerLogError);
            // 로그 실패는 치명적이지 않으므로 경고만 남기고 계속 진행
          }
        }
      }

      // 7-1) album_posts의 썸네일 업데이트 (멤버십 전용 게시글 중 썸네일이 null인 것들)
      try {
        // 1) 해당 파트너의 멤버십 전용 게시글 ID 목록 조회
        const { data: membershipPosts, error: postsError } = await supabase
          .from('posts')
          .select('id')
          .eq('partner_id', membership.partner_id)
          .eq('is_subscribers_only', true);

        if (!postsError && membershipPosts && membershipPosts.length > 0) {
          const postIds = membershipPosts.map((p: any) => p.id);

          // 2) 이 유저가 저장한 album_posts 중 썸네일이 null인 것들 찾기 (album_id 포함)
          const { data: savedPosts, error: savedPostsError } = await supabase
            .from('album_posts')
            .select('id, post_id, album_id')
            .eq('user_id', user.id)
            .in('post_id', postIds)
            .is('thumbnail', null);

          if (!savedPostsError && savedPosts && savedPosts.length > 0) {
            const albumIdsToUpdate = new Set<string>();

            for (const savedPost of savedPosts) {
              const postId = savedPost.post_id;
              const albumId = savedPost.album_id;
              if (!postId || !albumId) continue;

              // 게시글의 미디어 조회
              const { data: postMedia } = await supabase
                .from('post_media')
                .select('id, media_type, media_url, sort_order')
                .eq('post_id', postId)
                .order('sort_order', { ascending: true })
                .limit(1);

              if (postMedia && postMedia.length > 0) {
                const m = postMedia[0];
                let thumbnailUrl: string | null = null;

                // 이제 멤버십을 구독했으므로 권한이 있음
                if (m.media_url) {
                  try {
                    if (m.media_type === 'video') {
                      const thumbnailPath = `${postId}/thumbnails/${m.id}.jpg`;
                      const { data: signedThumbnail } = await supabase
                        .storage
                        .from('post-media')
                        .createSignedUrl(thumbnailPath, 3600);
                      thumbnailUrl = signedThumbnail?.signedUrl || null;
                    } else {
                      const { data: signed } = await supabase
                        .storage
                        .from('post-media')
                        .createSignedUrl(m.media_url, 3600);
                      thumbnailUrl = signed?.signedUrl || null;
                    }
                  } catch {
                    thumbnailUrl = null;
                  }
                }

                // album_posts 썸네일 업데이트
                if (thumbnailUrl) {
                  await supabase
                    .from('album_posts')
                    .update({ thumbnail: thumbnailUrl })
                    .eq('id', savedPost.id);
                  
                  // 앨범 ID 수집 (나중에 albums.thumbnail 업데이트용)
                  albumIdsToUpdate.add(albumId);
                }
              }
            }

            // 각 앨범의 썸네일 업데이트 (최신 게시글 기준)
            for (const albumIdToUpdate of albumIdsToUpdate) {
              // 해당 앨범의 최신 album_post 조회
              const { data: latestAlbumPost } = await supabase
                .from('album_posts')
                .select('post_id, thumbnail')
                .eq('album_id', albumIdToUpdate)
                .order('order', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (latestAlbumPost && latestAlbumPost.thumbnail) {
                // albums 테이블의 thumbnail 업데이트
                await supabase
                  .from('albums')
                  .update({
                    thumbnail: latestAlbumPost.thumbnail,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', albumIdToUpdate);
              }
            }
          }
        }
      } catch (thumbnailUpdateError) {
        console.error('Failed to update album_posts thumbnail:', thumbnailUpdateError);
        // 썸네일 업데이트 실패해도 구독은 성공으로 처리
      }

      // 8) 해당 멤버십의 구독 수(subscription_count) 증가 (통계/수정 제한용)
      try {
        const currentSubCount: number = (membership as any).subscription_count ?? 0;
        const { error: subCountError } = await supabase
          .from('membership')
          .update({ subscription_count: currentSubCount + 1 })
          .eq('id', membership.id);

        if (subCountError) {
          console.error('Failed to increment membership.subscription_count:', subCountError);
        }
      } catch (e) {
        console.error('Unexpected error while incrementing subscription_count:', e);
      }

      // 9) 네이티브 푸시: 파트너(멤버십 소유자)에게 새 구독 알림
      // 9) 네이티브 푸시: 파트너(멤버십 소유자)에게 새 구독 알림
      try {
        if (partnerOwnerMemberId && partnerOwnerMemberId !== user.id) {
          const supabaseUrl = Deno.env.get('SUPABASE_URL');
          const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

          if (supabaseUrl && anonKey) {
            const authHeader =
              (req.headers.get('Authorization') as string | null) ||
              `Bearer ${anonKey}`;

            const headers = {
              Authorization: authHeader,
              apikey: anonKey,
              'Content-Type': 'application/json',
            };

            const subscriberName = memberData?.name || '회원';
            const url = '/membership/subscribers';

            await fetch(`${supabaseUrl}/functions/v1/push-native`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                action: 'enqueue_notification',
                user_id: partnerOwnerMemberId,
                target_member_id: partnerOwnerMemberId,
                title: '새로운 멤버십 구독',
                body: `${subscriberName}님이 ${partnerNameForLog}의 ${membership.name} 멤버십을 구독했습니다.`,
                icon: null,
                url,
                notification_type: 'membership_subscription',
                data: {
                  type: 'membership_subscription',
                  membership_id: body.membership_id,
                  subscriber_id: user.id,
                  url,
                },
                process_immediately: true, // 즉시 FCM 전송
              }),
            });
          }
        }
      } catch (pushErr) {
        console.error('Failed to enqueue membership subscription notification:', pushErr);
      }

      // 10) 구독자에게 환영 메시지 발송 (member_chats 테이블 사용)
      // sender_id: 파트너의 member_id, receiver_id: 구독한 유저
      try {
        console.log('[WelcomeMsg] partnerOwnerMemberId:', partnerOwnerMemberId);
        console.log('[WelcomeMsg] membership_message:', membership.membership_message);
        console.log('[WelcomeMsg] info_media_paths:', membership.info_media_paths);
        console.log('[WelcomeMsg] subscriber user.id:', user.id);

        if (partnerOwnerMemberId && (membership.membership_message || membership.info_media_paths)) {
          // chat_room 찾기 또는 생성
          let chatRoomId: string | null = null;
          
          const { data: existingRoom, error: roomError } = await supabase
            .from('chat_rooms')
            .select('id')
            .or(`and(created_by.eq.${user.id},partner_id.eq.${partnerOwnerMemberId}),and(created_by.eq.${partnerOwnerMemberId},partner_id.eq.${user.id})`)
            .eq('is_active', true)
            .maybeSingle();

          console.log('[WelcomeMsg] existingRoom:', existingRoom, 'error:', roomError);

          if (existingRoom) {
            chatRoomId = existingRoom.id;
          } else {
            const { data: newRoom, error: newRoomError } = await supabase
              .from('chat_rooms')
              .insert({
                created_by: partnerOwnerMemberId,
                partner_id: user.id,
                is_active: true,
              })
              .select('id')
              .single();

            console.log('[WelcomeMsg] newRoom:', newRoom, 'error:', newRoomError);

            if (newRoom) {
              chatRoomId = newRoom.id;
            }
          }

          console.log('[WelcomeMsg] chatRoomId:', chatRoomId);

          // info_media_paths가 있으면 이미지 메시지 발송 (문자열 또는 배열 모두 처리)
          const mediaPaths = membership.info_media_paths;
          const mediaList = typeof mediaPaths === 'string' 
            ? [mediaPaths] 
            : (Array.isArray(mediaPaths) ? mediaPaths : []);
          
          if (mediaList.length > 0 && chatRoomId) {
            for (const mediaItem of mediaList) {
              const mediaPath = typeof mediaItem === 'string' ? mediaItem : mediaItem.path;
              if (mediaPath) {
                // membership_info_media에서 파일 다운로드
                const { data: fileData, error: downloadError } = await supabase.storage
                  .from('membership_info_media')
                  .download(mediaPath);

                if (downloadError || !fileData) {
                  console.error('Failed to download media:', downloadError);
                  continue;
                }

                // 미디어 타입 판별
                const ext = mediaPath.split('.').pop()?.toLowerCase() || '';
                const isVideo = ['mp4', 'mov', 'avi', 'webm'].includes(ext);
                const mediaType = isVideo ? 'video' : 'image';

                // chat-media에 복사 업로드
                const timestamp = Date.now();
                const randomStr = Math.random().toString(36).substring(2, 8);
                const fileName = mediaPath.split('/').pop() || `media.${ext}`;
                const chatMediaPath = `${chatRoomId}/${timestamp}_${randomStr}_${fileName}`;

                const { error: uploadError } = await supabase.storage
                  .from('chat-media')
                  .upload(chatMediaPath, fileData, {
                    contentType: fileData.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
                  });

                if (uploadError) {
                  console.error('Failed to upload to chat-media:', uploadError);
                  continue;
                }

                // member_chats에 메시지 레코드 생성 (미디어용)
                const { data: newMessage } = await supabase
                  .from('member_chats')
                  .insert({
                    sender_id: partnerOwnerMemberId,
                    receiver_id: user.id,
                    message: '',
                    is_read: false,
                    chat_room_id: chatRoomId,
                  })
                  .select('id')
                  .single();

                if (newMessage) {
                  // chat_media에 미디어 레코드 저장
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

          // membership_message가 있으면 텍스트 메시지 발송
          if (membership.membership_message && chatRoomId) {
            console.log('[WelcomeMsg] Sending text message...');
            const { data: msgData, error: msgError } = await supabase
              .from('member_chats')
              .insert({
                sender_id: partnerOwnerMemberId,
                receiver_id: user.id,
                message: membership.membership_message,
                is_read: false,
                chat_room_id: chatRoomId,
              })
              .select('id')
              .single();
            
            console.log('[WelcomeMsg] Text message result:', msgData, 'error:', msgError);
          }
        }
      } catch (welcomeMsgErr) {
        console.error('Failed to send welcome message:', welcomeMsgErr);
        // 환영 메시지 발송 실패해도 구독은 성공으로 처리
      }

      // 응답에서 날짜 필드를 YYYY-MM-DD 형식으로 변환
      const formattedSubscription = {
        ...subscription,
        started_at: subscription.started_at ? subscription.started_at.split('T')[0] : null,
        expired_at: subscription.expired_at ? subscription.expired_at.split('T')[0] : null,
      };

      return successResponse({
        subscription: formattedSubscription,
        remaining_points: newTotalPoints,
      });
    }

    // ------------------------
    // GET /api-membership-subscriptions/check-subscriber?user_id=xxx → 특정 사용자가 나(파트너)를 구독중인지 확인
    // ------------------------
    if (req.url.includes('/api-membership-subscriptions/check-subscriber') && req.method === 'GET') {
      const urlObj = new URL(req.url, 'http://localhost');
      const targetUserId = urlObj.searchParams.get('user_id');
      const todayStr = formatDateOnly(new Date());
      
      if (!targetUserId) {
        return errorResponse('INVALID_REQUEST', 'user_id query parameter is required');
      }

      // 현재 사용자가 파트너인지 확인
      const { data: myPartnerData, error: partnerError } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', user.id)
        .maybeSingle();

      if (partnerError) throw partnerError;
      
      if (!myPartnerData?.id) {
        return successResponse({ isSubscribed: false, reason: 'not_a_partner' });
      }

      // 해당 사용자가 나의 멤버십을 구독중인지 확인 (상세 포함)
      const { data: subscriptions, error: subError } = await supabase
        .from('membership_subscriptions')
        .select('id, status, auto_renewal_enabled, started_at, expired_at, membership:membership_id(id, name, partner_id, monthly_price)')
        .eq('user_id', targetUserId)
        .eq('status', 'active');

      if (subError) throw subError;

      // 자동연장 OFF이면서 기간 만료된 구독 필터링
      const activeSub = subscriptions?.find((sub: any) => {
        if (sub.membership?.partner_id !== myPartnerData.id) return false;
        if (sub.auto_renewal_enabled) return true;
        if (sub.expired_at) return sub.expired_at >= todayStr;
        return true;
      });

      const isSubscribed = !!activeSub;

      console.log('[check-subscriber]', { targetUserId, myPartnerId: myPartnerData.id, isSubscribed });

      if (isSubscribed && activeSub) {
        return successResponse({
          isSubscribed: true,
          subscription: {
            id: activeSub.id,
            membership_name: activeSub.membership?.name ?? null,
            membership_id: activeSub.membership?.id ?? null,
            monthly_price: activeSub.membership?.monthly_price ?? null,
            started_at: activeSub.started_at ? String(activeSub.started_at).split('T')[0] : null,
            expired_at: activeSub.expired_at ? String(activeSub.expired_at).split('T')[0] : null,
            auto_renewal_enabled: activeSub.auto_renewal_enabled,
          },
        });
      }
      return successResponse({ isSubscribed: false });
    }

    // ------------------------
    // GET /api-membership-subscriptions/my-subscribers → 내 멤버십 구독자 목록 조회 (파트너 전용)
    // 쿼리 파라미터: membership_id (optional) - 특정 멤버십의 구독자만 필터링
    // ------------------------
    if (req.url.includes('/api-membership-subscriptions/my-subscribers') && req.method === 'GET') {
      const todayStr = formatDateOnly(new Date());
      const url = new URL(req.url);
      const membershipIdFilter = url.searchParams.get('membership_id');

      // 1) 현재 사용자가 파트너인지 확인
      const { data: myPartnerData, error: partnerError } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', user.id)
        .maybeSingle();

      if (partnerError) throw partnerError;

      if (!myPartnerData?.id) {
        return errorResponse('NOT_A_PARTNER', '파트너만 구독자 목록을 조회할 수 있습니다', null, 403);
      }

      // 2) 멤버십 ID 목록 결정
      let membershipIds: string[];

      if (membershipIdFilter) {
        // 특정 멤버십 ID로 필터링하는 경우, 해당 멤버십이 본인 소유인지 검증
        const { data: targetMembership, error: targetError } = await supabase
          .from('membership')
          .select('id')
          .eq('id', membershipIdFilter)
          .eq('partner_id', myPartnerData.id)
          .maybeSingle();

        if (targetError) throw targetError;

        if (!targetMembership) {
          return errorResponse('FORBIDDEN', '해당 멤버십에 대한 권한이 없습니다', null, 403);
        }

        membershipIds = [membershipIdFilter];
      } else {
        // 모든 활성 멤버십 조회
        const { data: myMemberships, error: membershipError } = await supabase
          .from('membership')
          .select('id')
          .eq('partner_id', myPartnerData.id)
          .eq('is_active', true);

        if (membershipError) throw membershipError;

        if (!myMemberships || myMemberships.length === 0) {
          return successResponse([]);
        }

        membershipIds = myMemberships.map((m: any) => m.id);
      }

      // membership_id 필터가 있을 경우 내 멤버십인지 검증
      if (membershipIdFilter && !membershipIds.includes(membershipIdFilter)) {
        return errorResponse('INVALID_MEMBERSHIP', '해당 멤버십에 대한 권한이 없습니다', null, 403);
      }

      // 3) 해당 멤버십들을 구독 중인 구독 목록 조회
      let subscriptionsQuery = supabase
        .from('membership_subscriptions')
        .select(`
          id,
          user_id,
          started_at,
          expired_at,
          auto_renewal_enabled,
          membership:membership_id (
            id,
            name
          )
        `)
        .eq('status', 'active');

      if (membershipIdFilter) {
        subscriptionsQuery = subscriptionsQuery.eq('membership_id', membershipIdFilter);
      } else {
        subscriptionsQuery = subscriptionsQuery.in('membership_id', membershipIds);
      }

      const { data: subscriptions, error: subscribersError } = await subscriptionsQuery.order('started_at', { ascending: false });

      if (subscribersError) throw subscribersError;

      if (!subscriptions || subscriptions.length === 0) {
        return successResponse([]);
      }

      // 자동연장 OFF이면서 기간 만료된 구독 필터링
      const validSubscriptions = subscriptions.filter((sub: any) => {
        if (sub.auto_renewal_enabled) return true;
        if (sub.expired_at) return sub.expired_at >= todayStr;
        return true;
      });

      if (validSubscriptions.length === 0) {
        return successResponse([]);
      }

      // 4) 구독자(user_id) 목록으로 members 정보 별도 조회
      const userIds = [...new Set(validSubscriptions.map((s: any) => s.user_id))];
      
      const { data: membersData, error: membersError } = await supabase
        .from('members')
        .select('id, name, profile_image')
        .in('id', userIds);

      if (membersError) throw membersError;

      // 5) members 정보를 Map으로 변환
      const membersMap: Record<string, any> = {};
      if (membersData) {
        for (const member of membersData) {
          membersMap[member.id] = member;
        }
      }

      // 6) 구독 데이터에 members 정보 병합
      const subscribers = validSubscriptions.map((sub: any) => ({
        ...sub,
        members: membersMap[sub.user_id] || null,
      }));

      return successResponse(subscribers);
    }

    // ------------------------
    // GET /api-subscriptions → 사용자의 구독 조회
    // ------------------------
    if (req.url.endsWith('/api-membership-subscriptions') && req.method === 'GET') {
      const todayStr = formatDateOnly(new Date()); // YYYY-MM-DD 형식

      const { data: subscriptions, error } = await supabase
        .from('membership_subscriptions')
        .select(`*, membership(id, name, description, monthly_price, is_active, partner_id)`)
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (error) throw error;

      // 자동연장 OFF이면서 기간 만료된 구독 필터링
      // - auto_renewal_enabled = true → 보임 (만료되어도 갱신 예정)
      // - auto_renewal_enabled = false이면서 expired_at >= 오늘 → 보임
      // - auto_renewal_enabled = false이면서 expired_at < 오늘 → 안 보임
      const validSubscriptions = subscriptions.filter((sub: any) => {
        if (sub.auto_renewal_enabled) {
          return true; // 자동연장 ON인 경우 항상 보임
        }
        // 자동연장 OFF인 경우, 만료일이 오늘 이후인 것만 보임
        if (sub.expired_at) {
          return sub.expired_at >= todayStr;
        }
        return true; // expired_at이 없으면 일단 보여줌
      });

      // 파트너 ID 목록 추출
      const partnerIds = [...new Set(
        validSubscriptions
          .map((sub: any) => sub.membership?.partner_id)
          .filter(Boolean)
      )];

      // 파트너 정보 조회 (members 정보 포함)
      let partnersMap: Record<string, any> = {};
      if (partnerIds.length > 0) {
        const { data: partners, error: partnersError } = await supabase
          .from('partners')
          .select(`
            id,
            partner_name,
            partner_message,
            member_id,
            member:members(
              id,
              member_code,
              name,
              profile_image,
              current_status
            )
          `)
          .in('id', partnerIds);

        if (!partnersError && partners) {
          partnersMap = partners.reduce((acc: any, p: any) => {
            acc[p.id] = p;
            return acc;
          }, {});
        }
      }

      // 구독 데이터에 파트너 정보 추가
      const enrichedData = validSubscriptions.map((sub: any) => ({
        ...sub,
        membership: sub.membership ? {
          ...sub.membership,
          partner: partnersMap[sub.membership.partner_id] || null,
        } : null,
      }));

      return successResponse(enrichedData);
    }

    // ------------------------
    // PATCH /api-subscriptions/:id → 구독 상태 수정
    //  - auto_renewal_enabled: 자동 연장 켜기/끄기
    //  - status: 상태 변경
    // ------------------------
    if (req.url.match(/\/api-membership-subscriptions\/[a-zA-Z0-9-]+$/) && req.method === 'PATCH') {
      const subscriptionId = req.url.split('/').pop()!;
      const body: SubscriptionRequestBody = await parseRequestBody(req);
      if (!body || Object.keys(body).length === 0) {
        return errorResponse('INVALID_REQUEST', 'At least one field to update is required');
      }

      // 허용된 필드만 업데이트 데이터에 포함
      const updateData: Record<string, any> = {};
      if (body.status !== undefined) updateData.status = body.status;
      if (body.next_billing_at !== undefined) updateData.next_billing_at = body.next_billing_at;
      if (body.expired_at !== undefined) updateData.expired_at = body.expired_at;
      if (body.auto_renewal_enabled !== undefined) updateData.auto_renewal_enabled = body.auto_renewal_enabled;

      if (Object.keys(updateData).length === 0) {
        return errorResponse('INVALID_REQUEST', 'No valid fields to update');
      }

      const { error } = await supabase
        .from('membership_subscriptions')
        .update(updateData)
        .eq('id', subscriptionId)
        .eq('user_id', user.id);

      if (error) throw error;
      return successResponse({ message: 'Updated successfully' });
    }

    // DELETE 엔드포인트 제거 - 사용자가 직접 멤버십 취소 불가
    // 멤버십은 기간 만료 또는 자동 연장 실패 시에만 inactive로 변경됨

    // ------------------------
    // GET /api-membership-subscriptions/my-subscribers → 내 멤버십 구독자 목록 조회 (파트너 전용)
    // 기존 API (중복 코드 - 위의 엔드포인트에서 이미 처리됨)
    // ------------------------
    // 주석: 이 블록은 위의 my-subscribers 핸들러가 먼저 처리하므로 실행되지 않음

    return errorResponse('NOT_FOUND', 'Endpoint not found', null, 404);

  } catch (err: any) {
    return errorResponse('SERVER_ERROR', err.message ?? 'Unknown server error', err, 500);
  }
});