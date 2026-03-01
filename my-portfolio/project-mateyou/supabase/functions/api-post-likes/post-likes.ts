import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  createSupabaseClient,
  getAuthUser,
} from '../_shared/utils.ts';

// Deno 전역 타입 선언 (로컬 TS 환경에서 Deno 인식용)
declare const Deno: typeof globalThis.Deno;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createSupabaseClient();

  try {
    const user = await getAuthUser(req);

    // ---------------------------------------------------
    // 👍 POST /api-post-likes → 좋아요 추가
    // ---------------------------------------------------
    if (req.method === 'POST' && req.url.endsWith('/api-post-likes')) {
      const body = await req.json();
      const post_id = body.post_id;

      if (!post_id) {
        return new Response(JSON.stringify({ success: false, error: 'post_id is required' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      // post_likes 삽입
      const { error: insertErr } = await supabase
        .from('post_likes')
        .insert([{ user_id: user.id, post_id }]);

      // 23505 → 중복 좋아요
      if (insertErr && insertErr.code !== '23505') {
        return new Response(JSON.stringify({ success: false, error: insertErr.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      // like_count 증가 (RPC)
      const { error: updateErr } = await supabase.rpc(
        'increment_like_count',
        { post_id_param: post_id }
      );

      if (updateErr) {
        return new Response(JSON.stringify({ success: false, error: updateErr.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      // -----------------------------
      // 네이티브 푸시: 게시글 작성자에게 좋아요 알림
      // -----------------------------
      try {
        // 게시글 + 파트너(작성자) 정보 조회
        const { data: post, error: postErr } = await supabase
          .from('posts')
          .select(`
            id,
            partner_id,
            partner:partners!partner_id(
              id,
              member:members!member_id(
                id,
                name,
                profile_image
              )
            )
          `)
          .eq('id', post_id)
          .maybeSingle();

        if (!postErr && post?.partner?.member?.id && post.partner.member.id !== user.id) {
          const targetUserId = post.partner.member.id;

          // 좋아요 누른 사용자 정보
          let likerName = '회원';
          let likerProfileImage: string | null = null;
          try {
            const { data: liker } = await supabase
              .from('members')
              .select('name, profile_image')
              .eq('id', user.id)
              .maybeSingle();

            if (liker) {
              likerName = liker.name || likerName;
              likerProfileImage = liker.profile_image || null;
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

            const postUrl = `/feed/${post_id}`;
            const tag = `post_like_${post_id}_${user.id}`;

            await fetch(`${supabaseUrl}/functions/v1/push-native`, {
              method: 'POST',
              headers,
              body: JSON.stringify({
                action: 'enqueue_notification',
                user_id: targetUserId,
                target_member_id: targetUserId,
                title: '새로운 좋아요',
                body: `${likerName}님이 내 게시글에 좋아요를 눌렀습니다.`,
                icon: likerProfileImage,
                url: postUrl,
                notification_type: 'post_like',
                tag,
                data: {
                  type: 'post_like',
                  post_id,
                  liker_id: user.id,
                  url: postUrl,
                },
                process_immediately: true, // 즉시 FCM 전송
              }),
            });
          }
        }
      } catch (pushErr) {
        console.error('Failed to enqueue like notification:', pushErr);
      }

      return new Response(JSON.stringify({ success: true, liked: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // ---------------------------------------------------
    // 💔 DELETE /api-post-likes/:post_id → 좋아요 취소
    // ---------------------------------------------------
    if (req.method === 'DELETE' && req.url.includes('/api-post-likes/')) {
      const urlParts = req.url.split('/');
      const post_id = urlParts[urlParts.length - 1];

      if (!post_id) {
        return new Response(JSON.stringify({ success: false, error: 'post_id is required' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      // 좋아요 삭제
      const { error: deleteErr } = await supabase
        .from('post_likes')
        .delete()
        .eq('user_id', user.id)
        .eq('post_id', post_id);

      if (deleteErr) {
        return new Response(JSON.stringify({ success: false, error: deleteErr.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      // like_count 감소 (RPC)
      const { error: updateErr } = await supabase.rpc(
        'decrement_like_count',
        { post_id_param: post_id }
      );

      if (updateErr) {
        return new Response(JSON.stringify({ success: false, error: updateErr.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      return new Response(JSON.stringify({ success: true, liked: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'Endpoint not found' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 404,
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
