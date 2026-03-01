import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createSupabaseClient, getAuthUser } from '../_shared/utils.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient();
    const url = new URL(req.url);
    const pathname = url.pathname;

    const user = await getAuthUser(req);

    // --------------------------
    // POST /api-posts-saved → 게시글 보관 (is_published=false)
    //  - 토큰 기준 현재 유저의 파트너 게시글만 보관 가능
    //  - 현재 is_published=true 인 게시글만 보관 대상
    // --------------------------
    if (req.method === 'POST' && pathname === '/api-posts-saved') {
      const body = await req.json().catch(() => null);
      const postId = body?.post_id || body?.postId;

      if (!postId || typeof postId !== 'string') {
        return new Response(
          JSON.stringify({ success: false, error: 'post_id is required' }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          },
        );
      }

      // 현재 사용자의 파트너 정보 조회
      const { data: partner, error: partnerError } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', user.id)
        .maybeSingle();

      if (partnerError || !partner) {
        return new Response(
          JSON.stringify({ success: false, error: 'Partner not found' }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 404,
          },
        );
      }

      // 게시글이 본인 소유이며 현재 게시 상태인지 확인
      const { data: post, error: postError } = await supabase
        .from('posts')
        .select('id, partner_id, is_published')
        .eq('id', postId)
        .maybeSingle();

      if (postError || !post) {
        return new Response(
          JSON.stringify({ success: false, error: 'Post not found' }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 404,
          },
        );
      }

      if (post.partner_id !== partner.id) {
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized' }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 403,
          },
        );
      }

      if (post.is_published === false) {
        // 이미 보관된 상태이면 그대로 성공 처리
        return new Response(JSON.stringify({ success: true, data: { id: postId, is_published: false } }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      // 게시글 보관: is_published=false 로 변경
      const { data: updatedPost, error: updateError } = await supabase
        .from('posts')
        .update({ is_published: false })
        .eq('id', postId)
        .select('id, is_published')
        .maybeSingle();

      if (updateError) {
        return new Response(
          JSON.stringify({ success: false, error: updateError.message }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          },
        );
      }

      return new Response(JSON.stringify({ success: true, data: updatedPost }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // --------------------------
    // DELETE /api-posts-saved → 보관 취소 (다시 게시: is_published=true)
    //  - 토큰 기준 현재 유저의 파트너 게시글만 복원 가능
    // --------------------------
    if (req.method === 'DELETE' && pathname === '/api-posts-saved') {
      const body = await req.json().catch(() => null);
      const postId = body?.post_id || body?.postId;

      if (!postId || typeof postId !== 'string') {
        return new Response(
          JSON.stringify({ success: false, error: 'post_id is required' }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          },
        );
      }

      // 현재 사용자의 파트너 정보 조회
      const { data: partner, error: partnerError } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', user.id)
        .maybeSingle();

      if (partnerError || !partner) {
        return new Response(
          JSON.stringify({ success: false, error: 'Partner not found' }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 404,
          },
        );
      }

      // 게시글이 본인 소유인지 확인
      const { data: post, error: postError } = await supabase
        .from('posts')
        .select('id, partner_id, is_published')
        .eq('id', postId)
        .maybeSingle();

      if (postError || !post) {
        return new Response(
          JSON.stringify({ success: false, error: 'Post not found' }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 404,
          },
        );
      }

      if (post.partner_id !== partner.id) {
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized' }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 403,
          },
        );
      }

      if (post.is_published === true) {
        // 이미 게시 상태이면 그대로 성공 처리
        return new Response(JSON.stringify({ success: true, data: { id: postId, is_published: true } }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      // 게시글 복원: is_published=true 로만 변경 (published_at 은 그대로 유지)
      const { data: restoredPost, error: restoreError } = await supabase
        .from('posts')
        .update({ is_published: true })
        .eq('id', postId)
        .select('id, is_published, published_at')
        .maybeSingle();

      if (restoreError) {
        return new Response(
          JSON.stringify({ success: false, error: restoreError.message }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          },
        );
      }

      return new Response(JSON.stringify({ success: true, data: restoredPost }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // --------------------------
    // GET /api-posts-saved → 보관된 게시글 목록 조회
    //  - 토큰 기준 현재 유저(파트너)의 게시글 중 is_published=false 인 것만
    //  - 각 게시글에 대해 media 정보 + 멤버십/단건 유료 여부 플래그 포함
    // --------------------------
    if (req.method === 'GET' && pathname === '/api-posts-saved') {
      const { data: partner, error: partnerError } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', user.id)
        .maybeSingle();

      if (partnerError || !partner) {
        return new Response(
          JSON.stringify({ success: false, error: 'Partner not found' }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 404,
          },
        );
      }

      const { data: posts, error: postsError } = await supabase
        .from('posts')
        .select('*')
        .eq('partner_id', partner.id)
        .eq('is_published', false)
        .order('created_at', { ascending: false });

      if (postsError) {
        return new Response(
          JSON.stringify({ success: false, error: postsError.message }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          },
        );
      }

      if (!posts || posts.length === 0) {
        return new Response(JSON.stringify({ success: true, data: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      // 보관된 게시글의 media 조회
      const postIds = posts.map((p: any) => p.id);
      const { data: mediaRows, error: mediaError } = await supabase
        .from('post_media')
        .select('id, post_id, media_type, media_url, sort_order, created_at')
        .in('post_id', postIds)
        .order('sort_order', { ascending: true });

      if (mediaError) {
        return new Response(
          JSON.stringify({ success: false, error: mediaError.message }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          },
        );
      }

      // signed URL 생성 (post-media 버킷)
      const storage = supabase.storage.from('post-media');
      const paths = (mediaRows || []).map((m: any) => m.media_url);
      const signedUrlMap: Map<string, string> = new Map();

      if (paths.length > 0) {
        const { data: signedUrls, error: signedErr } = await storage.createSignedUrls(
          paths,
          60 * 60 * 24 * 7, // 7일
        );
        if (!signedErr && signedUrls) {
          (signedUrls || []).forEach((s: any, idx: number) => {
            const p = paths[idx];
            if (p && s?.signedUrl) {
              signedUrlMap.set(p, s.signedUrl);
            }
          });
        }
      }

      const mediaMap: Record<string, any[]> = {};
      for (const m of mediaRows || []) {
        if (!mediaMap[m.post_id]) mediaMap[m.post_id] = [];
        mediaMap[m.post_id].push({
          id: m.id,
          media_type: m.media_type,
          media_url: m.media_url,
          media_full_url: signedUrlMap.get(m.media_url) || null,
          sort_order: m.sort_order,
          created_at: m.created_at,
        });
      }

      // 멤버십/단건 유료 여부 플래그 포함해서 최종 응답 구성
      const result = posts.map((p: any) => {
        const isSubscribersOnly = !!p.is_subscribers_only;
        const isPaidPost = p.point_price != null && p.point_price > 0;

        return {
          id: p.id,
          content: p.content,
          partner_id: p.partner_id,
          published_at: p.published_at,
          is_published: p.is_published,
          // 유료/멤버십 설정 정보
          is_subscribers_only: isSubscribersOnly,
          is_paid_post: isPaidPost,
          point_price: p.point_price ?? null,
          // media 정보
          files: mediaMap[p.id] || [],
        };
      });

      return new Response(JSON.stringify({ success: true, data: result }), {
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


