import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createSupabaseClient, getAuthUser, corsHeaders } from '../_shared/utils.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient();
    const url = new URL(req.url);
    const pathname = url.pathname;

    // --------------------------
    // POST /api-albums → 앨범 생성
    // --------------------------
    if (req.method === 'POST' && pathname === '/api-albums') {
      const user = await getAuthUser(req);
      const body = await req.json().catch(() => null);

      const title = body?.title;
      if (!title || typeof title !== 'string') {
        return new Response(JSON.stringify({ success: false, error: 'title is required' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from('albums')
        .insert({
          user_id: user.id,
          title,
          created_at: now,
          updated_at: now,
        })
        .select('*')
        .maybeSingle();

      if (error || !data) {
        return new Response(JSON.stringify({ success: false, error: error?.message || 'Failed to create album' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // --------------------------
    // GET /api-albums → 내 앨범 목록 조회 (리스트)
    //  - 각 앨범에 대해 최신 album_post 기준 썸네일 정보(thumbnail) 포함
    // --------------------------
    if (req.method === 'GET' && pathname === '/api-albums') {
      const user = await getAuthUser(req);

      const { data, error } = await supabase
        .from('albums')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      const albums = data || [];
      console.log(`[api-albums GET] Found ${albums.length} albums`);

      if (albums.length === 0) {
        return new Response(JSON.stringify({ success: true, data: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      const albumIds = albums.map((a: any) => a.id);

      // 각 앨범별 게시글 수 조회
      const { data: albumPosts, error: apError } = await supabase
        .from('album_posts')
        .select('album_id')
        .in('album_id', albumIds);

      if (apError) {
        return new Response(JSON.stringify({ success: false, error: apError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      const countMap = new Map<string, number>(); // album_id -> post count
      for (const ap of albumPosts || []) {
        const aid = ap.album_id as string;
        countMap.set(aid, (countMap.get(aid) ?? 0) + 1);
      }

      // 저장된 thumbnail을 사용 - storage path면 signed URL 생성
      const result = await Promise.all(albums.map(async (a: any) => {
        const count = countMap.get(a.id) ?? 0;
        let thumbnail = null;
        
        if (a.thumbnail) {
          // video-thumbnail: prefix가 있으면 video-thumbnail 버킷에서 signed URL 생성
          if (a.thumbnail.startsWith('video-thumbnail:')) {
            const storagePath = a.thumbnail.replace('video-thumbnail:', '');
            const { data: signedData } = await supabase
              .storage
              .from('video-thumbnail')
              .createSignedUrl(storagePath, 3600);
            thumbnail = signedData?.signedUrl || null;
          }
          // storage: prefix가 있으면 post-media 버킷에서 signed URL 생성
          else if (a.thumbnail.startsWith('storage:')) {
            const storagePath = a.thumbnail.replace('storage:', '');
            const { data: signedData } = await supabase
              .storage
              .from('post-media')
              .createSignedUrl(storagePath, 3600);
            thumbnail = signedData?.signedUrl || null;
          } else {
            // 이미 URL인 경우 그대로 사용
            thumbnail = a.thumbnail;
          }
        }
        
        return {
          ...a,
          thumbnail,
          count,
        };
      }));

      return new Response(JSON.stringify({ success: true, data: result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // --------------------------
    // GET /api-albums/list → 내 앨범 목록 조회 (리스트 전용 엔드포인트)
    //  - /api-albums 와 동일하게 thumbnail 정보 포함
    // --------------------------
    if (req.method === 'GET' && pathname === '/api-albums/list') {
      const user = await getAuthUser(req);

      const { data, error } = await supabase
        .from('albums')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      const albums = data || [];

      if (albums.length === 0) {
        return new Response(JSON.stringify({ success: true, data: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        });
      }

      const albumIds = albums.map((a: any) => a.id);

      // 각 앨범별 게시글 수 조회
      const { data: albumPosts, error: apError } = await supabase
        .from('album_posts')
        .select('album_id')
        .in('album_id', albumIds);

      if (apError) {
        return new Response(JSON.stringify({ success: false, error: apError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      const countMap = new Map<string, number>(); // album_id -> post count
      for (const ap of albumPosts || []) {
        const aid = ap.album_id as string;
        countMap.set(aid, (countMap.get(aid) ?? 0) + 1);
      }

      // 저장된 thumbnail을 사용 - storage path면 signed URL 생성
      const result = await Promise.all(albums.map(async (a: any) => {
        const count = countMap.get(a.id) ?? 0;
        let thumbnail = null;
        
        if (a.thumbnail) {
          // video-thumbnail: prefix가 있으면 video-thumbnail 버킷에서 signed URL 생성
          if (a.thumbnail.startsWith('video-thumbnail:')) {
            const storagePath = a.thumbnail.replace('video-thumbnail:', '');
            const { data: signedData } = await supabase
              .storage
              .from('video-thumbnail')
              .createSignedUrl(storagePath, 3600);
            thumbnail = signedData?.signedUrl || null;
          }
          // storage: prefix가 있으면 post-media 버킷에서 signed URL 생성
          else if (a.thumbnail.startsWith('storage:')) {
            const storagePath = a.thumbnail.replace('storage:', '');
            const { data: signedData } = await supabase
              .storage
              .from('post-media')
              .createSignedUrl(storagePath, 3600);
            thumbnail = signedData?.signedUrl || null;
          } else {
            // 이미 URL인 경우 그대로 사용
            thumbnail = a.thumbnail;
          }
        }
        
        return {
          ...a,
          thumbnail,
          count,
        };
      }));

      return new Response(JSON.stringify({ success: true, data: result }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // --------------------------
    // PUT /api-albums → 앨범 제목 수정
    //  - album_id + title
    //  - 앨범 소유자만 수정 가능
    // --------------------------
    if (req.method === 'PUT' && pathname === '/api-albums') {
      const user = await getAuthUser(req);
      const body = await req.json().catch(() => null);

      const queryAlbumId = url.searchParams.get('album_id') || url.searchParams.get('albumId');
      const bodyAlbumId = body?.album_id || body?.albumId;
      const albumId = queryAlbumId || bodyAlbumId;

      const title = body?.title;

      if (!albumId || typeof albumId !== 'string') {
        return new Response(JSON.stringify({ success: false, error: 'album_id is required' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      if (!title || typeof title !== 'string') {
        return new Response(JSON.stringify({ success: false, error: 'title is required' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      // 앨범 소유권 확인
      const { data: album, error: albumError } = await supabase
        .from('albums')
        .select('id, user_id')
        .eq('id', albumId)
        .maybeSingle();

      if (albumError || !album) {
        return new Response(JSON.stringify({ success: false, error: 'Album not found' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        });
      }

      if (album.user_id !== user.id) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        });
      }

      const now = new Date().toISOString();

      const { data: updated, error: updateError } = await supabase
        .from('albums')
        .update({ title, updated_at: now })
        .eq('id', albumId)
        .select('*')
        .maybeSingle();

      if (updateError || !updated) {
        return new Response(JSON.stringify({ success: false, error: updateError?.message || 'Failed to update album' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      return new Response(JSON.stringify({ success: true, data: updated }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // --------------------------
    // DELETE /api-albums → 앨범 삭제
    //  - query/body 의 album_id 를 기준으로 삭제
    //  - 앨범 소유자만 삭제 가능
    //  - album_posts 의 관련 데이터도 함께 삭제
    // --------------------------
    if (req.method === 'DELETE' && pathname === '/api-albums') {
      const user = await getAuthUser(req);

      // album_id 는 query 또는 body 로 받을 수 있도록 처리
      const queryAlbumId = url.searchParams.get('album_id') || url.searchParams.get('albumId');
      const body = await req.json().catch(() => null);
      const bodyAlbumId = body?.album_id || body?.albumId;

      const albumId = queryAlbumId || bodyAlbumId;

      if (!albumId || typeof albumId !== 'string') {
        return new Response(JSON.stringify({ success: false, error: 'album_id is required' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      // 앨범 소유권 확인
      const { data: album, error: albumError } = await supabase
        .from('albums')
        .select('id, user_id')
        .eq('id', albumId)
        .maybeSingle();

      if (albumError || !album) {
        return new Response(JSON.stringify({ success: false, error: 'Album not found' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        });
      }

      if (album.user_id !== user.id) {
        return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        });
      }

      // 1) album_posts 삭제
      const { error: relError } = await supabase
        .from('album_posts')
        .delete()
        .eq('album_id', albumId);

      if (relError) {
        return new Response(JSON.stringify({ success: false, error: relError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      // 2) 앨범 삭제
      const { error: deleteError } = await supabase
        .from('albums')
        .delete()
        .eq('id', albumId);

      if (deleteError) {
        return new Response(JSON.stringify({ success: false, error: deleteError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        });
      }

      return new Response(JSON.stringify({ success: true }), {
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


