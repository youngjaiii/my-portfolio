import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createSupabaseClient, getAuthUser, parseMultipartFormData } from '../_shared/utils.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

const PAGE_SIZE = 30;
const STORAGE_BUCKET = "event-banners";
const SUPABASE_URL = "https://rmooqijhkmomdtkvuzrr.supabase.co";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient();
    const url = new URL(req.url);
    const pathname = url.pathname;

    // --------------------------
    // GET /api-notice → 공지사항 목록 조회 (페이지네이션)
    // query: page, category, pinned_only, active_events_only
    // --------------------------
    if (req.method === "GET" && (pathname === "/api-notice" || pathname.endsWith("/api-notice"))) {
      const page = parseInt(url.searchParams.get("page") || "1", 10);
      const category = url.searchParams.get("category");
      const pinnedOnly = url.searchParams.get("pinned_only") === "true";
      
      // 인증 시도 (관리자 여부 확인용)
      let isAdmin = false;
      try {
        const user = await getAuthUser(req);
        if (user) {
          const { data: memberData } = await supabase
            .from("members")
            .select("role")
            .eq("id", user.id)
            .single();
          isAdmin = memberData?.role === 'admin';
        }
      } catch {
        // 비로그인 사용자
      }

      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      // 쿼리 빌드
      let query = supabase
        .from("notice")
        .select(`
          id,
          title,
          content,
          category,
          is_pinned,
          is_active,
          view_count,
          image_url,
          start_date,
          end_date,
          created_by,
          created_at,
          updated_at,
          author:members!created_by(id, name, profile_image)
        `, { count: 'exact' });

      // 관리자가 아니면 활성화된 공지만 조회
      if (!isAdmin) {
        query = query.eq("is_active", true);
      }

      // 카테고리 필터
      if (category) {
        query = query.eq("category", category);
      }

      // 고정 공지만 조회
      if (pinnedOnly) {
        query = query.eq("is_pinned", true);
      }

      // 이벤트 카테고리: end_date가 지나지 않은 것만 조회
      if (category === 'event') {
        query = query.or(`end_date.is.null,end_date.gte.${today}`);
      }

      // 정렬: 고정 공지 우선 + 최신순
      query = query
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });

      // 이벤트는 페이지네이션 없이 전체 리스트 반환
      if (category !== 'event') {
        const from = (page - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        query = query.range(from, to);
      }

      const { data: notices, error, count } = await query;

      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500
        });
      }

      // image_url을 public URL로 변환
      const noticesWithUrls = (notices || []).map(notice => ({
        ...notice,
        image_url: notice.image_url 
          ? `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${notice.image_url}`
          : null
      }));

      // 이벤트는 페이지네이션 정보 없이 반환
      if (category === 'event') {
        return new Response(JSON.stringify({
          success: true,
          data: noticesWithUrls
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200
        });
      }

      const totalPages = Math.ceil((count || 0) / PAGE_SIZE);

      return new Response(JSON.stringify({
        success: true,
        data: noticesWithUrls,
        pagination: {
          page,
          page_size: PAGE_SIZE,
          total_count: count,
          total_pages: totalPages,
          has_next: page < totalPages,
          has_prev: page > 1
        }
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      });
    }

    // --------------------------
    // GET /api-notice/:id → 공지사항 상세 조회
    // --------------------------
    const getMatch = pathname.match(/\/api-notice\/([a-zA-Z0-9-]+)$/);
    if (req.method === "GET" && getMatch) {
      const noticeId = getMatch[1];

      // 인증 시도 (관리자 여부 확인용)
      let isAdmin = false;
      try {
        const user = await getAuthUser(req);
        if (user) {
          const { data: memberData } = await supabase
            .from("members")
            .select("role")
            .eq("id", user.id)
            .single();
          isAdmin = memberData?.role === 'admin';
        }
      } catch {
        // 비로그인 사용자
      }

      // 공지사항 조회
      let query = supabase
        .from("notice")
        .select(`
          id,
          title,
          content,
          category,
          is_pinned,
          is_active,
          view_count,
          image_url,
          start_date,
          end_date,
          created_by,
          created_at,
          updated_at,
          author:members!created_by(id, name, profile_image)
        `)
        .eq("id", noticeId);

      // 관리자가 아니면 활성화된 공지만 조회
      if (!isAdmin) {
        query = query.eq("is_active", true);
      }

      const { data: notice, error } = await query.single();

      if (error || !notice) {
        return new Response(JSON.stringify({ success: false, error: "Notice not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404
        });
      }

      // image_url을 public URL로 변환
      const noticeWithUrl = {
        ...notice,
        image_url: notice.image_url 
          ? `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${notice.image_url}`
          : null
      };

      // 조회수 증가 (비동기, 실패해도 무시)
      supabase
        .from("notice")
        .update({ view_count: (notice.view_count || 0) + 1 })
        .eq("id", noticeId)
        .then(() => {});

      return new Response(JSON.stringify({ success: true, data: noticeWithUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      });
    }

    // --------------------------
    // POST /api-notice → 공지사항 생성 (관리자 전용, multipart/form-data)
    // fields: title, content, category?, is_pinned?, is_active?, link_url?, link_type?, display_order?, start_date?, end_date?
    // files: image? (이미지 파일, category=event일 때 주로 사용)
    // --------------------------
    if (req.method === "POST" && (pathname === "/api-notice" || pathname.endsWith("/api-notice"))) {
      const user = await getAuthUser(req);

      // 관리자 권한 확인
      const { data: memberData, error: memberError } = await supabase
        .from("members")
        .select("role")
        .eq("id", user.id)
        .single();

      if (memberError || memberData?.role !== 'admin') {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized: Admin only" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403
        });
      }

      // Content-Type 확인
      const contentType = req.headers.get('content-type') || '';
      
      let title: string;
      let content: string;
      let category: string;
      let isPinned: boolean;
      let isActive: boolean;
      let startDate: string | null;
      let endDate: string | null;
      let imagePath: string | null = null;

      if (contentType.includes('multipart/form-data')) {
        // multipart/form-data 처리
        let form;
        try {
          form = await parseMultipartFormData(req);
        } catch (error: any) {
          return new Response(JSON.stringify({ success: false, error: "Invalid form data: " + error.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400
          });
        }

        title = form.fields["title"] || "";
        content = form.fields["content"] || "";
        category = form.fields["category"] || "general";
        isPinned = form.fields["is_pinned"] === "true" || form.fields["is_pinned"] === "1";
        isActive = form.fields["is_active"] !== "false" && form.fields["is_active"] !== "0";
        startDate = form.fields["start_date"] || null;
        endDate = form.fields["end_date"] || null;

        // 이미지 업로드
        const files = form.files || [];
        if (files.length > 0) {
          const imageFile = files[0];
          try {
            const ext = imageFile.filename.split('.').pop() || 'jpg';
            imagePath = `notice/${crypto.randomUUID()}.${ext}`;

            const upload = await supabase.storage
              .from(STORAGE_BUCKET)
              .upload(imagePath, imageFile.content, {
                upsert: false,
                contentType: imageFile.mimetype
              });

            if (upload.error) {
              throw upload.error;
            }
          } catch (uploadError: any) {
            return new Response(JSON.stringify({ success: false, error: "Image upload failed: " + uploadError.message }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 500
            });
          }
        }
      } else {
        // JSON 처리
        const body = await req.json();
        title = body.title || "";
        content = body.content || "";
        category = body.category || "general";
        isPinned = body.is_pinned || false;
        isActive = body.is_active !== false;
        startDate = body.start_date || null;
        endDate = body.end_date || null;
      }

      if (!title || !content) {
        // 이미지가 업로드된 경우 삭제
        if (imagePath) {
          await supabase.storage.from(STORAGE_BUCKET).remove([imagePath]);
        }
        return new Response(JSON.stringify({ success: false, error: "title and content are required" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400
        });
      }

      const { data: notice, error } = await supabase
        .from("notice")
        .insert([{
          title,
          content,
          category,
          is_pinned: isPinned,
          is_active: isActive,
          image_url: imagePath,
          start_date: startDate,
          end_date: endDate,
          created_by: user.id,
        }])
        .select(`
          id,
          title,
          content,
          category,
          is_pinned,
          is_active,
          view_count,
          image_url,
          start_date,
          end_date,
          created_by,
          created_at,
          updated_at
        `)
        .single();

      if (error) {
        // DB 저장 실패 시 업로드된 이미지 삭제
        if (imagePath) {
          await supabase.storage.from(STORAGE_BUCKET).remove([imagePath]);
        }
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500
        });
      }

      // 응답에 public URL 포함
      const noticeWithUrl = {
        ...notice,
        image_url: notice.image_url 
          ? `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${notice.image_url}`
          : null
      };

      return new Response(JSON.stringify({ success: true, data: noticeWithUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 201
      });
    }

    // --------------------------
    // PUT /api-notice/:id → 공지사항 수정 (관리자 전용, multipart/form-data)
    // fields: title?, content?, category?, is_pinned?, is_active?, link_url?, link_type?, display_order?, start_date?, end_date?
    // files: image? (새 이미지 업로드 시)
    // --------------------------
    const putMatch = pathname.match(/\/api-notice\/([a-zA-Z0-9-]+)$/);
    if (req.method === "PUT" && putMatch) {
      const noticeId = putMatch[1];
      const user = await getAuthUser(req);

      // 관리자 권한 확인
      const { data: memberData, error: memberError } = await supabase
        .from("members")
        .select("role")
        .eq("id", user.id)
        .single();

      if (memberError || memberData?.role !== 'admin') {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized: Admin only" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403
        });
      }

      // 기존 공지 조회 (이미지 경로 확인용)
      const { data: existingNotice, error: fetchError } = await supabase
        .from("notice")
        .select("image_url")
        .eq("id", noticeId)
        .single();

      if (fetchError || !existingNotice) {
        return new Response(JSON.stringify({ success: false, error: "Notice not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404
        });
      }

      // Content-Type 확인
      const contentType = req.headers.get('content-type') || '';
      const updateData: Record<string, any> = {};
      let newImagePath: string | null = null;

      if (contentType.includes('multipart/form-data')) {
        // multipart/form-data 처리
        let form;
        try {
          form = await parseMultipartFormData(req);
        } catch (error: any) {
          return new Response(JSON.stringify({ success: false, error: "Invalid form data: " + error.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400
          });
        }

        if (form.fields["title"] !== undefined) updateData.title = form.fields["title"];
        if (form.fields["content"] !== undefined) updateData.content = form.fields["content"];
        if (form.fields["category"] !== undefined) updateData.category = form.fields["category"];
        if (form.fields["is_pinned"] !== undefined) {
          updateData.is_pinned = form.fields["is_pinned"] === "true" || form.fields["is_pinned"] === "1";
        }
        if (form.fields["is_active"] !== undefined) {
          updateData.is_active = form.fields["is_active"] !== "false" && form.fields["is_active"] !== "0";
        }
        if (form.fields["start_date"] !== undefined) updateData.start_date = form.fields["start_date"] || null;
        if (form.fields["end_date"] !== undefined) updateData.end_date = form.fields["end_date"] || null;

        // 새 이미지 업로드
        const files = form.files || [];
        if (files.length > 0) {
          const imageFile = files[0];
          try {
            const ext = imageFile.filename.split('.').pop() || 'jpg';
            newImagePath = `notice/${crypto.randomUUID()}.${ext}`;

            const upload = await supabase.storage
              .from(STORAGE_BUCKET)
              .upload(newImagePath, imageFile.content, {
                upsert: false,
                contentType: imageFile.mimetype
              });

            if (upload.error) {
              throw upload.error;
            }

            updateData.image_url = newImagePath;
          } catch (uploadError: any) {
            return new Response(JSON.stringify({ success: false, error: "Image upload failed: " + uploadError.message }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 500
            });
          }
        }
      } else {
        // JSON 처리
        const body = await req.json();
        if (body.title !== undefined) updateData.title = body.title;
        if (body.content !== undefined) updateData.content = body.content;
        if (body.category !== undefined) updateData.category = body.category;
        if (body.is_pinned !== undefined) updateData.is_pinned = body.is_pinned;
        if (body.is_active !== undefined) updateData.is_active = body.is_active;
        if (body.start_date !== undefined) updateData.start_date = body.start_date;
        if (body.end_date !== undefined) updateData.end_date = body.end_date;
      }

      updateData.updated_at = new Date().toISOString();

      if (Object.keys(updateData).length === 1) { // only updated_at
        return new Response(JSON.stringify({ success: false, error: "No valid fields to update" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400
        });
      }

      const { data: notice, error } = await supabase
        .from("notice")
        .update(updateData)
        .eq("id", noticeId)
        .select(`
          id,
          title,
          content,
          category,
          is_pinned,
          is_active,
          view_count,
          image_url,
          start_date,
          end_date,
          created_by,
          created_at,
          updated_at
        `)
        .single();

      if (error) {
        // DB 저장 실패 시 새로 업로드된 이미지 삭제
        if (newImagePath) {
          await supabase.storage.from(STORAGE_BUCKET).remove([newImagePath]);
        }
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500
        });
      }

      // 새 이미지가 업로드되었으면 기존 이미지 삭제
      if (newImagePath && existingNotice.image_url) {
        try {
          await supabase.storage.from(STORAGE_BUCKET).remove([existingNotice.image_url]);
        } catch (e) {
          console.warn("Failed to delete old image:", e);
        }
      }

      // 응답에 public URL 포함
      const noticeWithUrl = {
        ...notice,
        image_url: notice.image_url 
          ? `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${notice.image_url}`
          : null
      };

      return new Response(JSON.stringify({ success: true, data: noticeWithUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      });
    }

    // --------------------------
    // DELETE /api-notice/:id → 공지사항 삭제 (관리자 전용)
    // --------------------------
    const deleteMatch = pathname.match(/\/api-notice\/([a-zA-Z0-9-]+)$/);
    if (req.method === "DELETE" && deleteMatch) {
      const noticeId = deleteMatch[1];
      const user = await getAuthUser(req);

      // 관리자 권한 확인
      const { data: memberData, error: memberError } = await supabase
        .from("members")
        .select("role")
        .eq("id", user.id)
        .single();

      if (memberError || memberData?.role !== 'admin') {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized: Admin only" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403
        });
      }

      // 기존 공지 조회 (이미지 경로 확인용)
      const { data: existingNotice, error: fetchError } = await supabase
        .from("notice")
        .select("image_url")
        .eq("id", noticeId)
        .single();

      if (fetchError || !existingNotice) {
        return new Response(JSON.stringify({ success: false, error: "Notice not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404
        });
      }

      const { error } = await supabase
        .from("notice")
        .delete()
        .eq("id", noticeId);

      if (error) {
        return new Response(JSON.stringify({ success: false, error: error.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500
        });
      }

      // Storage에서 이미지 삭제
      if (existingNotice.image_url) {
        try {
          await supabase.storage.from(STORAGE_BUCKET).remove([existingNotice.image_url]);
        } catch (e) {
          console.warn("Failed to delete notice image:", e);
        }
      }

      return new Response(JSON.stringify({ success: true, message: "Notice deleted successfully" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      });
    }

    return new Response(JSON.stringify({ success: false, error: "Endpoint not found" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 404
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    });
  }
});
