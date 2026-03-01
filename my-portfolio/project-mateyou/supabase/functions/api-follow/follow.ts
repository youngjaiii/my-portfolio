import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createSupabaseClient, getAuthUser, parseRequestBody } from '../_shared/utils.ts';

// Deno 전역 타입 선언 (로컬 TS 환경에서 Deno 인식용)
declare const Deno: typeof globalThis.Deno;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
};

interface FollowRequestBody {
  partner_id?: string; // partners.id 기준
  skip_welcome_message?: boolean; // 환영 메시지 발송 스킵 (멤버십 자동 팔로우 등)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient();
    const user = await getAuthUser(req);
    const url = new URL(req.url);
    const pathname = url.pathname;

    // ------------------------
    // POST /api-follow → 팔로우
    // ------------------------
    if (pathname === '/api-follow' && req.method === 'POST') {
      const body: FollowRequestBody = await parseRequestBody(req);
      if (!body?.partner_id) {
        return new Response(JSON.stringify({ success: false, error: 'partner_id is required' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      const { data, error } = await supabase
        .from('follow')
        .insert([{ follower_id: user.id, partner_id: body.partner_id }])
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          return new Response(JSON.stringify({ success: false, error: 'Already following this partner' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          });
        }
        throw error;
      }

      // partners 테이블 follow_count 증가 + welcome_message 조회
      const { data: partnerData, error: partnerErr } = await supabase
        .from('partners')
        .select('follow_count, member_id, partner_name, welcome_message')
        .eq('id', body.partner_id)
        .maybeSingle();

      if (partnerErr) throw partnerErr;

      const newCount = (partnerData?.follow_count || 0) + 1;

      const { error: updateErr } = await supabase
        .from('partners')
        .update({ follow_count: newCount })
        .eq('id', body.partner_id);

      if (updateErr) throw updateErr;

      // -----------------------------
      // 네이티브 푸시: 파트너에게 새 팔로우 알림
      // -----------------------------
      try {
        const targetUserId = partnerData?.member_id;

        if (targetUserId && targetUserId !== user.id) {
          // 팔로워 정보 조회
          let followerName = '회원';
          let followerProfileImage: string | null = null;
          try {
            const { data: follower } = await supabase
              .from('members')
              .select('name, profile_image')
              .eq('id', user.id)
              .maybeSingle();

            if (follower) {
              followerName = follower.name || followerName;
              followerProfileImage = follower.profile_image || null;
            }
          } catch {
            // ignore profile lookup errors
          }

          const supabaseUrl = Deno.env.get('SUPABASE_URL');
          const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

          if (supabaseUrl && anonKey) {
            const authHeader = req.headers.get('Authorization') || `Bearer ${anonKey}`;
            const headers = {
              Authorization: authHeader,
              apikey: anonKey,
              'Content-Type': 'application/json',
            };

            const partnerName = partnerData?.partner_name || '파트너';
            const url = `/partners/${body.partner_id}`;
            const tag = `partner_follow_${body.partner_id}_${user.id}`;

            await fetch(`${supabaseUrl}/functions/v1/push-native`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                action: 'enqueue_notification',
                user_id: targetUserId,
                target_member_id: targetUserId,
                title: '새로운 팔로워',
                body: `${followerName}님이 ${partnerName}를 팔로우하기 시작했습니다.`,
                icon: followerProfileImage,
                url,
                notification_type: 'partner_follow',
                tag,
                data: {
                  type: 'partner_follow',
                  partner_id: body.partner_id,
                  follower_id: user.id,
                  url,
                },
                process_immediately: true, // 즉시 FCM 전송
              }),
            });
          }
        }
      } catch (pushErr) {
        console.error('Failed to enqueue follow notification:', pushErr);
      }

      // -----------------------------
      // 환영 메시지 발송 (skip_welcome_message가 아니고, welcome_message가 있는 경우)
      // -----------------------------
      if (!body.skip_welcome_message && partnerData?.welcome_message && partnerData?.member_id) {
        try {
          const partnerMemberId = partnerData.member_id;
          const followerId = user.id;

          // 채팅방 조회 또는 생성
          let chatRoomId: string | null = null;

          // 기존 채팅방 조회
          const { data: existingRoom } = await supabase
            .from('chat_rooms')
            .select('id')
            .or(`and(created_by.eq.${followerId},partner_id.eq.${partnerMemberId}),and(created_by.eq.${partnerMemberId},partner_id.eq.${followerId})`)
            .maybeSingle();

          if (existingRoom) {
            chatRoomId = existingRoom.id;
          } else {
            // 새 채팅방 생성
            const { data: newRoom } = await supabase
              .from('chat_rooms')
              .insert([{ created_by: followerId, partner_id: partnerMemberId, is_active: true }])
              .select('id')
              .single();

            if (newRoom) {
              chatRoomId = newRoom.id;
            }
          }

          // 채팅방이 있으면 환영 메시지 발송
          if (chatRoomId) {
            await supabase
              .from('member_chats')
              .insert({
                chat_room_id: chatRoomId,
                sender_id: partnerMemberId,
                receiver_id: followerId,
                message: partnerData.welcome_message,
                message_type: 'text',
                is_read: false
              });

            console.log(`[환영 메시지] 발송 완료 - 파트너: ${partnerData.partner_name}, 팔로워: ${followerId}`);
          }
        } catch (welcomeErr) {
          console.error('Failed to send welcome message:', welcomeErr);
        }
      }

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // ------------------------
    // DELETE /api-follow → 언팔
    // ------------------------
    if (pathname === '/api-follow' && req.method === 'DELETE') {
      const body: FollowRequestBody = await parseRequestBody(req);
      if (!body?.partner_id) {
        return new Response(JSON.stringify({ success: false, error: 'partner_id is required' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      // follow 테이블 삭제
      const { error } = await supabase
        .from('follow')
        .delete()
        .eq('follower_id', user.id)
        .eq('partner_id', body.partner_id);

      if (error) throw error;

      // partners 테이블 follow_count 감소, 0 미만 방지
      const { data: partnerData, error: partnerErr } = await supabase
        .from('partners')
        .select('follow_count')
        .eq('id', body.partner_id)
        .maybeSingle();

      if (partnerErr) throw partnerErr;

      const newCount = Math.max((partnerData?.follow_count || 0) - 1, 0);

      const { error: updateErr } = await supabase
        .from('partners')
        .update({ follow_count: newCount })
        .eq('id', body.partner_id);

      if (updateErr) throw updateErr;

      return new Response(JSON.stringify({ success: true, unfollowed: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // ------------------------
    // GET /api-follow → 팔로우 조회
    // ------------------------
    if (pathname === '/api-follow' && req.method === 'GET') {
      const partnerId = url.searchParams.get('partner_id');

      if (partnerId) {
        // 특정 파트너를 팔로우한 유저 목록 조회
        const { data: follows, error: followErr } = await supabase
          .from('follow')
          .select('follower_id')
          .eq('partner_id', partnerId);

        if (followErr) throw followErr;

        const followerIds = follows.map(f => f.follower_id);

        if (followerIds.length === 0) {
          return new Response(JSON.stringify({ success: true, data: [] }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        }

        // members 테이블에서 follower 정보 조회
        const { data: users, error: usersErr } = await supabase
          .from('members')
          .select('id, name, profile_image')
          .in('id', followerIds);

        if (usersErr) throw usersErr;

        const result = users.map(u => ({
          id: u.id,
          name: u.name,
          profile_image: u.profile_image || null,
        }));

        return new Response(JSON.stringify({ success: true, data: result }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      } else {
        // 토큰 기준 → 유저가 팔로우한 파트너 목록 조회
        const { data: follows, error: followErr } = await supabase
          .from('follow')
          .select('partner_id')
          .eq('follower_id', user.id);

        if (followErr) throw followErr;

        const followedIds = follows.map(f => f.partner_id);

        if (followedIds.length === 0) {
          return new Response(JSON.stringify({ success: true, data: [] }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          });
        }

        const { data: partners, error: partnersErr } = await supabase
          .from('partners')
          .select(`
            id,
            member_id,
            partner_name,
            follow_count,
            member:members!member_id(
              id,
              profile_image,
              member_code,
              current_status
            )
          `)
          .in('id', followedIds)
          .order('created_at', { ascending: false });

        if (partnersErr) throw partnersErr;

        const result = partners.map(p => ({
          id: p.member_id || p.member?.id || p.id, // member_id를 반환! (members 테이블 ID)
          partner_id: p.id, // partners 테이블 ID (필요시 사용)
          partner_name: p.partner_name,
          profile_image: p.member?.profile_image || null,
          member_code: p.member?.member_code || null,
          current_status: p.member?.current_status || 'offline',
          follow_count: p.follow_count,
          is_followed: true,
        }));

        return new Response(JSON.stringify({ success: true, data: result }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }
    }

    // ------------------------
    // 기타 라우트 → 404
    // ------------------------
    return new Response(JSON.stringify({ success: false, error: 'Endpoint not found' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 404,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Unknown server error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
