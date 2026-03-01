import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  createSupabaseClient,
  getAuthUser,
  parseMultipartFormData,
} from "../_shared/utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

interface PostMedia {
  post_id: string;
  media_type: "image" | "video";
  media_url: string;
  sort_order: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient();
    const urlObj = new URL(req.url);
    const pathname = urlObj.pathname;

    // ======================================================
    // POST → 미디어 업로드
    // ======================================================
    if (req.method === "POST" && pathname.includes("/api-post-media")) {
      const user = await getAuthUser(req);
      const form = await parseMultipartFormData(req);
      const post_id = form.fields["post_id"];
      const files = form.files || [];

      if (!post_id || files.length === 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "post_id and files are required",
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      const { data: post, error: postError } = await supabase
        .from("posts")
        .select("partner_id")
        .eq("id", post_id)
        .single();

      if (postError || !post) {
        return new Response(
          JSON.stringify({ success: false, error: "Post not found" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 },
        );
      }

      const { data: partner } = await supabase
        .from("partners")
        .select("id")
        .eq("member_id", user.id)
        .maybeSingle();

      if (!partner || partner.id !== post.partner_id) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 },
        );
      }

      const { count } = await supabase
        .from("post_media")
        .select("id", { count: "exact", head: true })
        .eq("post_id", post_id);

      let baseOrder = count || 0;
      const uploadedPaths: string[] = [];
      const insertData: PostMedia[] = [];

      try {
        for (let i = 0; i < files.length; i++) {
          const f = files[i];

          if (!f.mimetype.startsWith("image") && !f.mimetype.startsWith("video")) {
            throw new Error("Invalid media type");
          }

          // 파일명에서 확장자만 추출하고 나머지는 UUID로 대체 (한글 파일명 문제 해결)
          const ext = f.filename.split('.').pop() || (f.mimetype.startsWith("image") ? 'jpg' : 'mp4');
          const path = `${post_id}/${crypto.randomUUID()}.${ext}`;
          const upload = await supabase.storage.from("post-media").upload(path, f.content, { upsert: false });
          if (upload.error) throw upload.error;

          uploadedPaths.push(path);
          insertData.push({
            post_id,
            media_type: f.mimetype.startsWith("image") ? "image" : "video",
            media_url: path,
            sort_order: baseOrder + i,
          });
        }

        const { data, error } = await supabase.from("post_media").insert(insertData).select();
        if (error) throw error;

        return new Response(JSON.stringify({ success: true, data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      } catch (err: any) {
        for (const p of uploadedPaths) {
          await supabase.storage.from("post-media").remove([p]);
        }

        return new Response(JSON.stringify({ success: false, error: err.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        });
      }
    }

    // ======================================================
    // GET → post_id 기준 미디어 조회
    //  - 구매한 미디어만 signed URL 반환
    // ======================================================
    if (req.method === "GET" && pathname.includes("/api-post-media")) {
      const post_id = urlObj.searchParams.get("post_id");
      if (!post_id) {
        return new Response(
          JSON.stringify({ success: false, error: "post_id required" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
        );
      }

      // 사용자 확인 (옵션)
      let userId: string | null = null;
      try {
        const user = await getAuthUser(req);
        userId = user?.id || null;
      } catch {
        userId = null;
      }

      // post 정보 조회 (point_price, partner_id)
      const { data: post } = await supabase
        .from("posts")
        .select("point_price, partner_id")
        .eq("id", post_id)
        .single();

      // 미디어 조회 (point_price 포함)
      const { data: mediaRows, error } = await supabase
        .from("post_media")
        .select("id, media_type, media_url, sort_order, created_at, point_price")
        .eq("post_id", post_id)
        .order("sort_order", { ascending: true });

      if (error) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
        );
      }

      if (!mediaRows || mediaRows.length === 0) {
        return new Response(JSON.stringify({ success: true, data: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      // 소유자 여부 확인
      let isOwner = false;
      if (userId && post?.partner_id) {
        const { data: partner } = await supabase
          .from("partners")
          .select("member_id")
          .eq("id", post.partner_id)
          .single();
        isOwner = partner?.member_id === userId;
      }

      // 구매 정보 조회
      let purchasedMediaOrder: number | null = null;
      if (userId && !isOwner) {
        const { data: unlock } = await supabase
          .from("post_unlocks")
          .select("media_order")
          .eq("post_id", post_id)
          .eq("user_id", userId)
          .maybeSingle();
        purchasedMediaOrder = unlock?.media_order ?? null;
      }

      const postPrice = post?.point_price ?? 0;

      console.log("[api-post-media] userId:", userId, "isOwner:", isOwner, "purchasedMediaOrder:", purchasedMediaOrder, "postPrice:", postPrice);

      const storage = supabase.storage.from("post-media");
      
      const data = await Promise.all(mediaRows.map(async (m: any, idx: number) => {
        const mediaPrice = m.point_price ?? 0;
        const isPaid = postPrice > 0 || mediaPrice > 0;
        
        let canAccess = false;
        if (isOwner) {
          canAccess = true;
        } else if (isPaid) {
          // 유료 미디어: 구매한 경우만 접근 가능
          canAccess = purchasedMediaOrder !== null && idx <= purchasedMediaOrder;
        } else {
          // 무료 미디어: 접근 가능
          canAccess = true;
        }

        console.log("[api-post-media] idx:", idx, "mediaPrice:", mediaPrice, "isPaid:", isPaid, "canAccess:", canAccess);

        let media_full_url: string | null = null;
        if (canAccess && m.media_url) {
          const { data: signed } = await storage.createSignedUrl(m.media_url, 60 * 60 * 24 * 7);
          media_full_url = signed?.signedUrl || null;
        }

        return {
          id: m.id,
          media_type: m.media_type,
          media_url: null, // media_url 숨김
          media_full_url,
          sort_order: m.sort_order,
          created_at: m.created_at,
        };
      }));

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // ======================================================
    // DELETE → 미디어 삭제
    // ======================================================
    if (req.method === "DELETE" && pathname.includes("/api-post-media")) {
      const user = await getAuthUser(req);
      const media_id = urlObj.searchParams.get("media_id");

      if (!media_id) {
        return new Response(
          JSON.stringify({ success: false, error: "media_id required" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
        );
      }

      const { data: media, error: mediaErr } = await supabase
        .from("post_media")
        .select("id, post_id, media_url")
        .eq("id", media_id)
        .single();

      if (mediaErr || !media) {
        return new Response(
          JSON.stringify({ success: false, error: "Media not found" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 },
        );
      }

      const { data: post, error: postErr } = await supabase
        .from("posts")
        .select("partner_id")
        .eq("id", media.post_id)
        .single();

      if (postErr || !post) {
        return new Response(
          JSON.stringify({ success: false, error: "Post not found" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 },
        );
      }

      const { data: partner } = await supabase
        .from("partners")
        .select("id")
        .eq("member_id", user.id)
        .maybeSingle();

      if (!partner || partner.id !== post.partner_id) {
        return new Response(
          JSON.stringify({ success: false, error: "Unauthorized" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 },
        );
      }

      const { error: delErr } = await supabase.from("post_media").delete().eq("id", media_id);
      if (delErr) throw delErr;

      await supabase.storage.from("post-media").remove([media.media_url]);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    return new Response(JSON.stringify({ success: false, error: "Endpoint not found" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 404,
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
