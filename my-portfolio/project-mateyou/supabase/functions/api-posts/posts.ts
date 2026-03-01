import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createSupabaseClient, getAuthUser, parseMultipartFormData } from '../_shared/utils.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

const PAGE_SIZE = 30;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient();
    const url = new URL(req.url);
    const pathname = url.pathname;
    
    // /chat 경로 체크 (api-posts/chat)
    const isChatRoute = pathname.includes("/chat");

    // --------------------------
    // POST /api-posts → 게시글 생성 (multipart/form-data)
    // fields: content, point_price, is_subscribers_only, is_published
    // files: files[] (이미지/영상 파일들)
    // --------------------------
    if (req.method === "POST" && !isChatRoute && !pathname.endsWith("/pin") && (pathname === "/api-posts" || pathname.endsWith("/api-posts") || pathname.includes("/api-posts"))) {
      const user = await getAuthUser(req);
      
      // multipart/form-data 파싱
      let form;
      try {
        form = await parseMultipartFormData(req);
      } catch (error: any) {
        return new Response(JSON.stringify({ success: false, error: "Invalid form data: " + error.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400
        });
      }

      const content = form.fields["content"] ?? "";
      const point_price = parseInt(form.fields["point_price"] || "0", 10) || 0;
      const is_subscribers_only = form.fields["is_subscribers_only"] === "1" || form.fields["is_subscribers_only"] === "true" ? 1 : 0;
      const is_published = form.fields["is_published"] !== "false" && form.fields["is_published"] !== "0";
      const published_at = is_published ? new Date().toISOString() : null;
      const files = form.files || [];
      
      // 새로운 필드들 파싱
      const discount_rate = parseInt(form.fields["discount_rate"] || "0", 10) || 0;
      const membership_id = form.fields["membership_id"] || null;
      const is_bulk_sale = form.fields["is_bulk_sale"] !== "false" && form.fields["is_bulk_sale"] !== "0";
      const is_bulk_membership = form.fields["is_bulk_membership"] !== "false" && form.fields["is_bulk_membership"] !== "0";
      const is_bundle = form.fields["is_bundle"] === "true" || form.fields["is_bundle"] === "1";
      
      // 개별 미디어 정보 파싱
      const mediaPointPrices: Record<number, number> = {};
      const mediaMembershipIds: Record<number, string | null> = {};
      
      console.log('[API] FormData 필드들:', Object.keys(form.fields));
      
      for (const [key, value] of Object.entries(form.fields)) {
        if (key.startsWith("media_point_price_")) {
          const index = parseInt(key.replace("media_point_price_", ""), 10);
          if (!isNaN(index)) {
            const priceStr = String(value || "0").trim();
            const price = parseInt(priceStr, 10);
            if (!isNaN(price)) {
              mediaPointPrices[index] = price;
              console.log(`[API] 미디어 ${index} 개별 가격 파싱:`, price, `(원본 문자열: "${priceStr}")`);
            } else {
              console.error(`[API] 미디어 ${index} 가격 파싱 실패:`, priceStr);
              mediaPointPrices[index] = 0;
            }
          }
        } else if (key.startsWith("media_membership_id_")) {
          const index = parseInt(key.replace("media_membership_id_", ""), 10);
          if (!isNaN(index)) {
            const membershipId = (value as string) || null;
            mediaMembershipIds[index] = membershipId;
            console.log(`[API] 미디어 ${index} 개별 멤버쉽 파싱:`, membershipId);
          }
        }
      }
      
      console.log('[API] 파싱된 개별 가격:', mediaPointPrices);
      console.log('[API] 파싱된 개별 멤버쉽:', mediaMembershipIds);

      const { data: partner, error: partnerError } = await supabase
        .from("partners")
        .select("id, partner_status")
        .eq("member_id", user.id)
        .single();

      if (partnerError || !partner) {
        return new Response(JSON.stringify({ success: false, error: "Partner not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404
        });
      }

      // partner_status가 approved가 아니면 게시글 생성 불가
      if (partner.partner_status !== 'approved') {
        return new Response(JSON.stringify({ success: false, error: "Only approved partners can create posts" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403
        });
      }

      // Post 생성
      const postInsertData: any = {
        partner_id: partner.id,
        content,
        point_price: is_bulk_sale ? point_price : null, // 일괄 판매가 아니면 null
        is_subscribers_only,
        published_at,
        is_published,
        context: 'feed', // 기본값: feed
        discount_rate,
        is_bundle,
      };
      
      // 일괄 멤버쉽 설정인 경우에만 membership_id 설정
      if (is_bulk_membership && membership_id) {
        postInsertData.membership_id = membership_id;
      }
      
      const { data: newPost, error: insertError } = await supabase
        .from("posts")
        .insert([postInsertData])
        .select("id")
        .single();

      if (insertError) {
        return new Response(JSON.stringify({ success: false, error: insertError.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500
        });
      }

      const postId = newPost.id;
      const uploadedPaths: string[] = [];
      const insertMediaData: Array<any> = [];

      // Media 파일 업로드 (파일이 있는 경우)
      if (files.length > 0) {
        try {
          const { count } = await supabase
            .from("post_media")
            .select("id", { count: "exact", head: true })
            .eq("post_id", postId);

          let baseOrder = count || 0;

          for (let i = 0; i < files.length; i++) {
            const f = files[i];

            if (!f.mimetype.startsWith("image") && !f.mimetype.startsWith("video")) {
              throw new Error("Invalid media type: " + f.mimetype);
            }

            // 파일명에서 확장자만 추출하고 나머지는 UUID로 대체 (한글 파일명 문제 해결)
            const ext = f.filename.split('.').pop() || (f.mimetype.startsWith("image") ? 'jpg' : 'mp4');
            const path = `${postId}/${crypto.randomUUID()}.${ext}`;
            const upload = await supabase.storage.from("post-media").upload(path, f.content, { upsert: false });
            
            if (upload.error) {
              throw upload.error;
            }

            uploadedPaths.push(path);
            
            // 개별 미디어 정보 구성
            const mediaData: any = {
              post_id: postId,
              media_type: f.mimetype.startsWith("image") ? "image" : "video",
              media_url: path,
              sort_order: baseOrder + i,
            };
            
            // 개별 판매인 경우 각 미디어별 가격 설정
            if (!is_bulk_sale) {
              if (mediaPointPrices[i] !== undefined) {
                mediaData.point_price = mediaPointPrices[i];
                console.log(`[Post Media ${i}] 개별 가격 설정:`, mediaPointPrices[i], `(mediaPointPrices[${i}]: ${mediaPointPrices[i]})`);
              } else {
                // 개별 판매인데 가격이 없으면 0으로 설정
                mediaData.point_price = 0;
                console.log(`[Post Media ${i}] 개별 판매지만 가격 없음, 0으로 설정 (mediaPointPrices[${i}]: ${mediaPointPrices[i]})`);
              }
            } else {
              console.log(`[Post Media ${i}] 일괄 판매이므로 point_price 설정 안함`);
            }
            
            // 개별 멤버쉽 설정인 경우 각 미디어별 멤버쉽 설정
            if (!is_bulk_membership) {
              if (mediaMembershipIds[i] !== undefined && mediaMembershipIds[i]) {
                mediaData.membership_id = mediaMembershipIds[i];
                console.log(`[Post Media ${i}] 개별 멤버쉽 설정:`, mediaMembershipIds[i]);
              }
            }
            
            insertMediaData.push(mediaData);
          }

          // post_media 테이블에 삽입
          if (insertMediaData.length > 0) {
            console.log('[API] post_media 삽입 데이터:', JSON.stringify(insertMediaData, null, 2));
            const { data: mediaData, error: mediaError } = await supabase
              .from("post_media")
              .insert(insertMediaData)
              .select();

            if (mediaError) {
              console.error('[API] post_media 삽입 에러:', mediaError);
              throw mediaError;
            }
            console.log('[API] post_media 삽입 성공:', mediaData);

            return new Response(JSON.stringify({ 
              success: true, 
              data: { 
                id: postId,
                media: mediaData 
              } 
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 200
            });
          }
        } catch (err: any) {
          // 에러 발생 시 업로드된 파일들 삭제
          for (const p of uploadedPaths) {
            await supabase.storage.from("post-media").remove([p]);
          }
          
          // Post도 삭제
          await supabase.from("posts").delete().eq("id", postId);

          return new Response(JSON.stringify({ success: false, error: err.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500
          });
        }
      }

      return new Response(JSON.stringify({ success: true, data: { id: postId } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      });
    }

    // --------------------------
    // POST /api-posts/chat → 채팅용 게시글 생성 (multipart/form-data)
    // fields: content, point_price, is_subscribers_only, is_published
    // files: files[] (이미지/영상 파일들)
    // - context='chat'으로 게시물 생성
    // - 게시물 생성 후 follow 테이블에서 팔로우 조회하여 채팅으로 post_id 전송
    // --------------------------
    if (req.method === "POST" && isChatRoute) {
      const user = await getAuthUser(req);
      
      // multipart/form-data 파싱
      let form;
      try {
        form = await parseMultipartFormData(req);
      } catch (error: any) {
        return new Response(JSON.stringify({ success: false, error: "Invalid form data: " + error.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400
        });
      }

      const content = form.fields["content"] ?? "";
      const point_price = parseInt(form.fields["point_price"] || "0", 10) || 0;
      const is_subscribers_only = form.fields["is_subscribers_only"] === "1" || form.fields["is_subscribers_only"] === "true" ? 1 : 0;
      const is_published = form.fields["is_published"] !== "false" && form.fields["is_published"] !== "0";
      const published_at = is_published ? new Date().toISOString() : null;
      const files = form.files || [];
      
      // 새로운 필드들 파싱
      const discount_rate = parseInt(form.fields["discount_rate"] || "0", 10) || 0;
      const membership_id = form.fields["membership_id"] || null;
      const is_bulk_sale = form.fields["is_bulk_sale"] !== "false" && form.fields["is_bulk_sale"] !== "0";
      const is_bulk_membership = form.fields["is_bulk_membership"] !== "false" && form.fields["is_bulk_membership"] !== "0";
      const is_bundle = form.fields["is_bundle"] === "true" || form.fields["is_bundle"] === "1";
      
      // 개별 미디어 정보 파싱
      const mediaPointPrices: Record<number, number> = {};
      const mediaMembershipIds: Record<number, string | null> = {};
      
      console.log('[API Chat] FormData 필드들:', Object.keys(form.fields));
      
      for (const [key, value] of Object.entries(form.fields)) {
        if (key.startsWith("media_point_price_")) {
          const index = parseInt(key.replace("media_point_price_", ""), 10);
          if (!isNaN(index)) {
            const priceStr = String(value || "0").trim();
            const price = parseInt(priceStr, 10);
            if (!isNaN(price)) {
              mediaPointPrices[index] = price;
              console.log(`[API Chat] 미디어 ${index} 개별 가격 파싱:`, price, `(원본 문자열: "${priceStr}")`);
            } else {
              console.error(`[API Chat] 미디어 ${index} 가격 파싱 실패:`, priceStr);
              mediaPointPrices[index] = 0;
            }
          }
        } else if (key.startsWith("media_membership_id_")) {
          const index = parseInt(key.replace("media_membership_id_", ""), 10);
          if (!isNaN(index)) {
            const membershipId = (value as string) || null;
            mediaMembershipIds[index] = membershipId;
            console.log(`[API Chat] 미디어 ${index} 개별 멤버쉽 파싱:`, membershipId);
          }
        }
      }
      
      console.log('[API Chat] 파싱된 개별 가격:', mediaPointPrices);
      console.log('[API Chat] 파싱된 개별 멤버쉽:', mediaMembershipIds);

      const { data: partner, error: partnerError } = await supabase
        .from("partners")
        .select("id, partner_status")
        .eq("member_id", user.id)
        .single();

      if (partnerError || !partner) {
        return new Response(JSON.stringify({ success: false, error: "Partner not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404
        });
      }

      // partner_status가 approved가 아니면 게시글 생성 불가
      if (partner.partner_status !== 'approved') {
        return new Response(JSON.stringify({ success: false, error: "Only approved partners can create posts" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403
        });
      }

      // Post 생성 (context='chat')
      const postInsertData: any = {
        partner_id: partner.id,
        content,
        point_price: is_bulk_sale ? point_price : null, // 일괄 판매가 아니면 null
        is_subscribers_only,
        published_at,
        is_published,
        context: 'chat', // 채팅용 게시물
        discount_rate,
        is_bundle,
      };
      
      // 일괄 멤버쉽 설정인 경우에만 membership_id 설정
      if (is_bulk_membership && membership_id) {
        postInsertData.membership_id = membership_id;
      }
      
      const { data: newPost, error: insertError } = await supabase
        .from("posts")
        .insert([postInsertData])
        .select("id")
        .single();

      if (insertError) {
        return new Response(JSON.stringify({ success: false, error: insertError.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500
        });
      }

      const postId = newPost.id;
      const uploadedPaths: string[] = [];
      const insertMediaData: Array<any> = [];

      // Media 파일 업로드 (파일이 있는 경우)
      if (files.length > 0) {
        try {
          const { count } = await supabase
            .from("post_media")
            .select("id", { count: "exact", head: true })
            .eq("post_id", postId);

          let baseOrder = count || 0;

          for (let i = 0; i < files.length; i++) {
            const f = files[i];

            if (!f.mimetype.startsWith("image") && !f.mimetype.startsWith("video")) {
              throw new Error("Invalid media type: " + f.mimetype);
            }

            // 파일명에서 확장자만 추출하고 나머지는 UUID로 대체 (한글 파일명 문제 해결)
            const ext = f.filename.split('.').pop() || (f.mimetype.startsWith("image") ? 'jpg' : 'mp4');
            const path = `${postId}/${crypto.randomUUID()}.${ext}`;
            const upload = await supabase.storage.from("post-media").upload(path, f.content, { upsert: false });
            
            if (upload.error) {
              throw upload.error;
            }

            uploadedPaths.push(path);
            
            // 개별 미디어 정보 구성
            const mediaData: any = {
              post_id: postId,
              media_type: f.mimetype.startsWith("image") ? "image" : "video",
              media_url: path,
              sort_order: baseOrder + i,
            };
            
            // 개별 판매인 경우 각 미디어별 가격 설정
            if (!is_bulk_sale) {
              if (mediaPointPrices[i] !== undefined) {
                mediaData.point_price = mediaPointPrices[i];
                console.log(`[Post Media Chat ${i}] 개별 가격 설정:`, mediaPointPrices[i], `(mediaPointPrices[${i}]: ${mediaPointPrices[i]})`);
              } else {
                // 개별 판매인데 가격이 없으면 0으로 설정
                mediaData.point_price = 0;
                console.log(`[Post Media Chat ${i}] 개별 판매지만 가격 없음, 0으로 설정 (mediaPointPrices[${i}]: ${mediaPointPrices[i]})`);
              }
            } else {
              console.log(`[Post Media Chat ${i}] 일괄 판매이므로 point_price 설정 안함`);
            }
            
            // 개별 멤버쉽 설정인 경우 각 미디어별 멤버쉽 설정
            if (!is_bulk_membership) {
              if (mediaMembershipIds[i] !== undefined && mediaMembershipIds[i]) {
                mediaData.membership_id = mediaMembershipIds[i];
                console.log(`[Post Media Chat ${i}] 개별 멤버쉽 설정:`, mediaMembershipIds[i]);
              }
            }
            
            insertMediaData.push(mediaData);
          }

          // post_media 테이블에 삽입
          if (insertMediaData.length > 0) {
            console.log('[API Chat] post_media 삽입 데이터:', JSON.stringify(insertMediaData, null, 2));
            const { data: mediaData, error: mediaError } = await supabase
              .from("post_media")
              .insert(insertMediaData)
              .select();

            if (mediaError) {
              console.error('[API Chat] post_media 삽입 에러:', mediaError);
              throw mediaError;
            }
            console.log('[API Chat] post_media 삽입 성공:', mediaData);
          }
        } catch (err: any) {
          // 에러 발생 시 업로드된 파일들 삭제
          for (const p of uploadedPaths) {
            await supabase.storage.from("post-media").remove([p]);
          }
          
          // Post도 삭제
          await supabase.from("posts").delete().eq("id", postId);

          return new Response(JSON.stringify({ success: false, error: err.message }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 500
          });
        }
      }

      // follow 테이블에서 현재 파트너를 팔로우하는 사용자들 조회
      const { data: followers, error: followError } = await supabase
        .from("follow")
        .select("follower_id")
        .eq("partner_id", partner.id);

      if (followError) {
        console.error("Error fetching followers:", followError);
        // 팔로워 조회 실패해도 게시물 생성은 성공으로 처리
      } else if (followers && followers.length > 0) {
        // 각 팔로워에게 채팅으로 post_id 전송
        for (const follower of followers) {
          try {
            // 채팅방 조회/생성
            const { data: chatRoom, error: roomError } = await supabase
              .from("chat_rooms")
              .select("id")
              .or(`and(created_by.eq.${user.id},partner_id.eq.${follower.follower_id}),and(created_by.eq.${follower.follower_id},partner_id.eq.${user.id})`)
              .eq("is_active", true)
              .maybeSingle();

            let roomId: string | null = null;

            if (roomError || !chatRoom) {
              // 채팅방이 없으면 생성
              const { data: newRoom, error: createRoomError } = await supabase
                .from("chat_rooms")
                .insert([{
                  created_by: user.id,
                  partner_id: follower.follower_id,
                  is_active: true,
                }])
                .select("id")
                .single();

              if (createRoomError || !newRoom) {
                console.error(`Failed to create chat room for follower ${follower.follower_id}:`, createRoomError);
                continue;
              }
              roomId = newRoom.id;
            } else {
              roomId = chatRoom.id;
            }

            // 채팅 메시지로 post_id 전송
            const { error: messageError } = await supabase
              .from("member_chats")
              .insert([{
                chat_room_id: roomId,
                sender_id: user.id,
                receiver_id: follower.follower_id,
                message: `[POST:${postId}]`,
                message_type: 'system',
                is_read: false,
              }]);

            if (messageError) {
              console.error(`Failed to send post message to follower ${follower.follower_id}:`, messageError);
            }

            // 채팅방 updated_at 업데이트
            await supabase
              .from("chat_rooms")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", roomId);
          } catch (err: any) {
            console.error(`Error processing follower ${follower.follower_id}:`, err);
          }
        }
      }

      return new Response(JSON.stringify({ success: true, data: { id: postId } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      });
    }

    // --------------------------
    // GET /api-posts → 파트너 본인 게시글 조회
    // --------------------------
    if (req.method === "GET" && pathname === "/api-posts") {
      const user = await getAuthUser(req);

      const { data: partner, error: partnerError } = await supabase
        .from("partners")
        .select("id")
        .eq("member_id", user.id)
        .maybeSingle();

      if (partnerError || !partner) {
        return new Response(JSON.stringify({ success: false, error: "Partner not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404
        });
      }

      const { data: posts, error: postError } = await supabase
        .from("posts")
        .select("*")
        .eq("partner_id", partner.id)
        .order("created_at", { ascending: false });

      if (postError) throw postError;

      const postIds = posts.map((p) => p.id);
      let mediaMap: Record<string, any[]> = {};

      if (postIds.length > 0) {
        const { data: media, error: mediaError } = await supabase
          .from("post_media")
          .select("*")
          .in("post_id", postIds)
          .order("sort_order", { ascending: true });

        if (mediaError) throw mediaError;

        for (const m of media) {
          const { data: signed } = await supabase.storage.from("post-media").createSignedUrl(m.media_url, 3600);
          if (!mediaMap[m.post_id]) mediaMap[m.post_id] = [];
          mediaMap[m.post_id].push({ ...m, signed_url: signed?.signedUrl || null });
        }
      }

      const final = posts.map((p) => ({ ...p, files: mediaMap[p.id] || [] }));

      return new Response(JSON.stringify({ success: true, data: final }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      });
    }

    // --------------------------
    // GET /api-posts/pinned → 고정된 공개 게시물 조회 (admin은 제한 없음)
    // --------------------------
    const isPinnedRoute = pathname.endsWith("/api-posts/pinned") || pathname.endsWith("/api-posts/pinned/");
    if (req.method === "GET" && isPinnedRoute) {
      let isAdmin = false;
      let authUserId: string | null = null;
      let authError: string | null = null;
      let memberRole: string | null = null;
      try {
        const user = await getAuthUser(req);
        authUserId = user.id;
        const { data: memberData, error: mErr } = await supabase
          .from("members")
          .select("role")
          .eq("id", user.id)
          .single();
        if (mErr) authError = mErr.message;
        memberRole = memberData?.role || null;
        isAdmin = memberData?.role === 'admin';
      } catch (e: any) {
        authError = e?.message || 'auth failed';
      }

      let query = supabase
        .from("posts")
        .select(`
          id, partner_id, is_pinned,
          partner:partners!partner_id(id, partner_name, member:members!member_id(id, name, profile_image, member_code)),
          post_media(id, media_type, media_url, sort_order, point_price, membership_id)
        `)
        .or("is_pinned.eq.true,is_pinned.eq.1")
        .eq("is_published", true)
        .eq("context", "feed");

      if (!isAdmin) {
        query = query
          .or("is_subscribers_only.is.null,is_subscribers_only.eq.false,is_subscribers_only.eq.0")
          .or("point_price.is.null,point_price.eq.0");
      }

      const { data: pinnedPosts, error: pinnedError } = await query
        .order("published_at", { ascending: false });

      if (pinnedError) throw pinnedError;

      const skipped: any[] = [];
      const result = [];
      for (const p of (pinnedPosts || [])) {
        const sorted = (p.post_media || []).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
        const first = sorted[0];
        if (!first || !first.media_url) { skipped.push({ id: p.id, reason: 'no_media_url', mediaCount: (p.post_media || []).length }); continue; }
        if (!isAdmin && ((first.point_price ?? 0) > 0 || first.membership_id)) { skipped.push({ id: p.id, reason: 'paid_media' }); continue; }

        const { data: signed, error: signErr } = await supabase.storage.from("post-media").createSignedUrl(first.media_url, 3600);
        const signedUrl = signed?.signedUrl || null;
        if (!signedUrl) { skipped.push({ id: p.id, reason: 'signed_url_failed', media_url: first.media_url, signErr: signErr?.message }); continue; }

        result.push({
          id: p.id,
          partner: {
            name: (p.partner as any)?.partner_name || (p.partner as any)?.member?.name,
            profile_image: (p.partner as any)?.member?.profile_image || null,
            member_code: (p.partner as any)?.member?.member_code || null,
          },
          first_media: {
            media_type: first.media_type,
            signed_url: signedUrl,
          },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        data: result,
        _debug: { isAdmin, authUserId, memberRole, authError, queryCount: (pinnedPosts || []).length, resultCount: result.length, skipped },
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // --------------------------
    // GET /api-posts/:postId → 단일 게시글 조회 (공개 게시물은 토큰 없이 접근 가능)
    // --------------------------
    const getMatch = pathname.match(/^\/api-posts\/([a-zA-Z0-9-]+)$/) || pathname.match(/^\/functions\/v1\/api-posts\/([a-zA-Z0-9-]+)$/);
    if (req.method === "GET" && getMatch) {
      const postId = getMatch[1];
      
      // 인증 시도 (실패해도 계속 진행)
      let user: any = null;
      let isAdmin = false;
      try {
        user = await getAuthUser(req);
        
        // 관리자 권한 확인
        if (user) {
          const { data: memberData, error: memberError } = await supabase
            .from("members")
            .select("role")
            .eq("id", user.id)
            .single();
          
          isAdmin = !memberError && memberData?.role === 'admin';
        }
      } catch {
        // 비로그인 사용자
      }

      // 게시글 조회 (관리자는 is_published 체크 무시)
      let postQuery = supabase
        .from("posts")
        .select(`
          *,
          partner:partners!partner_id(id, partner_name, member:members!member_id(id, name, profile_image, member_code)),
          post_media(*),
          post_likes(id, user_id)
        `)
        .eq("id", postId);
      
      // 관리자가 아니면 published 게시글만 조회
      if (!isAdmin) {
        postQuery = postQuery.eq("is_published", true);
      }
      
      const { data: post, error: postError } = await postQuery.single();

      if (postError || !post) {
        return new Response(JSON.stringify({ success: false, error: "존재하지 않는 게시글입니다." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404
        });
      }

      // 유료/구독자 전용 게시물은 비로그인 사용자 접근 불가 (관리자 제외)
      const isSubscribersOnly = !!post.is_subscribers_only;
      const isPaidPost = post.point_price != null && post.point_price > 0;
      
      // 개별 판매 여부 확인: post_media에 point_price가 있는지 확인
      // 중요: post.point_price가 null이어도 개별 미디어에 point_price가 있으면 개별 판매로 처리
      const hasIndividualMediaPrices = post.post_media && post.post_media.some((m: any) => m.point_price != null && m.point_price > 0);
      // 개별 판매: 개별 미디어에 가격이 있으면 무조건 개별 판매로 처리
      // (post.point_price가 null이어도 개별 미디어에 가격이 있으면 개별 판매)
      const isIndividualSale = hasIndividualMediaPrices;
      
      if ((isSubscribersOnly || (isPaidPost && !isIndividualSale)) && !user && !isAdmin) {
        return new Response(JSON.stringify({ success: false, error: "이 게시물은 공유할 수 없습니다" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403
        });
      }

      let isPurchased = false;
      let purchasedMediaOrder: number | null = null; // 구매한 미디어 인덱스 (0부터 시작)
      let hasMembership = false;
      let isLiked = false;
      let isOwner = false;

      if (user) {
        // 관리자 권한 확인
        if (isAdmin) {
          // 관리자는 구매/구독 상태를 활성화하지 않고 무료 게시글처럼 처리
          // 하지만 파일은 모두 볼 수 있음
          isPurchased = false;
          hasMembership = false;
        } else {
          // 일반 사용자: 구매 이력 확인
          // 개별 미디어에 가격이 있으면 무조건 개별 판매로 처리
          if (hasIndividualMediaPrices) {
            // 개별 판매: media_order 확인
            const { data: unlock } = await supabase
              .from("post_unlocks")
              .select("media_order")
              .eq("user_id", user.id)
              .eq("post_id", postId)
              .maybeSingle();

            if (unlock && unlock.media_order != null) {
              isPurchased = true;
              purchasedMediaOrder = unlock.media_order;
              console.log(`[API Posts] 개별 판매 - 구매 이력 발견: postId=${postId}, userId=${user.id}, mediaOrder=${purchasedMediaOrder}`);
            } else {
              // 구매 이력이 없으면 명시적으로 false/null 설정
              isPurchased = false;
              purchasedMediaOrder = null;
              console.log(`[API Posts] 개별 판매 - 구매 이력 없음: postId=${postId}, userId=${user.id}, hasIndividualMediaPrices=${hasIndividualMediaPrices}`);
            }
          } else {
            // 일괄 판매인 경우: post.point_price가 있고 개별 미디어에 가격이 없는 경우만
            const { data: unlock } = await supabase
              .from("post_unlocks")
              .select("id")
              .eq("user_id", user.id)
              .eq("post_id", postId)
              .maybeSingle();

            isPurchased = !!unlock;
            purchasedMediaOrder = null; // 일괄 판매는 media_order 없음
            console.log(`[API Posts] 일괄 판매 - 구매 이력: postId=${postId}, userId=${user.id}, isPurchased=${isPurchased}`);
          }

          // 멤버십 여부 확인
          const { data: subscriptions } = await supabase
            .from("membership_subscriptions")
            .select(`
              id,
              status,
              membership:membership_id(
                partner_id,
                is_active
              )
            `)
            .eq("user_id", user.id)
            .eq("status", "active");

          if (subscriptions) {
            hasMembership = subscriptions.some((s: any) => 
              s.membership?.partner_id === post.partner_id && s.membership?.is_active !== false
            );
          }
        }

        isLiked = (post.post_likes || []).some((l: any) => l.user_id === user.id);
        isOwner = post.partner?.member?.id === user.id;
      } else {
        // 비로그인 사용자: 구매/구독 불가능
        isPurchased = false;
        purchasedMediaOrder = null;
        hasMembership = false;
        isOwner = false;
      }

      // 미디어 정렬 (sort_order 기준)
      const sortedMedia = (post.post_media || []).sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
      
      // 디버깅: 전체 상태 로그
      console.log(`[API Posts GET] 전체 상태: postId=${postId}, userId=${user?.id || 'null'}, isAdmin=${isAdmin}, isOwner=${isOwner}, isPurchased=${isPurchased}, purchasedMediaOrder=${purchasedMediaOrder}, hasIndividualMediaPrices=${hasIndividualMediaPrices}, isPaidPost=${isPaidPost}, hasMembership=${hasMembership}, isSubscribersOnly=${isSubscribersOnly}`);

      // signed URL 생성 및 접근 권한 설정
      if (sortedMedia) {
        for (let i = 0; i < sortedMedia.length; i++) {
          const media = sortedMedia[i];
          const mediaIndex = i; // sort_order 기준 인덱스
          
          // 관리자 또는 소유자는 모든 미디어 접근 가능
          let canAccessThisMedia = false;
          let accessReason = '';
          
          if (isAdmin || isOwner) {
            canAccessThisMedia = true;
            accessReason = isAdmin ? 'admin' : 'owner';
          } else {
            // 멤버십 체크 (구독자 전용 게시물인 경우)
            const hasMembershipAccess = !isSubscribersOnly || hasMembership;
            
            if (!hasMembershipAccess) {
              canAccessThisMedia = false;
              accessReason = 'no_membership_access';
            } else {
              // 각 미디어의 가격 확인
              const hasMediaPrice = media.point_price != null && media.point_price > 0;
              
              // 핵심 로직: 개별 미디어에 가격이 있으면 무조건 개별 판매 로직 적용
              // (hasIndividualMediaPrices가 true이거나 현재 미디어에 가격이 있으면)
              if (hasIndividualMediaPrices || hasMediaPrice) {
                // 개별 판매: 각 미디어별로 구매 여부 확인
                if (!hasMediaPrice) {
                  // 현재 미디어에 가격이 없으면 무료 (접근 가능)
                  canAccessThisMedia = true;
                  accessReason = 'free_media_in_individual_sale';
                } else {
                  // 현재 미디어에 가격이 있으면 구매 이력 확인
                  // purchasedMediaOrder가 null이면 구매 이력 없음 = 접근 불가
                  // purchasedMediaOrder가 null이 아니고 mediaIndex <= purchasedMediaOrder이면 구매함 = 접근 가능
                  if (purchasedMediaOrder != null && mediaIndex <= purchasedMediaOrder) {
                    canAccessThisMedia = true;
                    accessReason = 'purchased_media';
                  } else {
                    canAccessThisMedia = false;
                    accessReason = 'unpurchased_paid_media';
                  }
                }
              } else {
                // 일괄 판매인 경우: post.point_price가 있고 개별 미디어에 가격이 없는 경우만
                // 포스트 전체 가격이 없거나 구매했으면 접근 가능
                canAccessThisMedia = !isPaidPost || isPurchased;
                accessReason = canAccessThisMedia ? 'bulk_sale_ok' : 'bulk_sale_not_purchased';
              }
            }
          }
          
          // signed_url 설정 (반드시 canAccessThisMedia가 true일 때만 생성)
          // 명시적으로 null로 초기화 후 조건에 따라 설정
          media.signed_url = null;
          
          if (canAccessThisMedia && media.media_url) {
            const { data: signed } = await supabase.storage.from("post-media").createSignedUrl(media.media_url, 3600);
            if (signed?.signedUrl) {
              media.signed_url = signed.signedUrl;
            }
          }
          
          // 디버깅 로그
          const hasMediaPrice = media.point_price != null && media.point_price > 0;
          console.log(`[API Posts GET] Media ${mediaIndex}: canAccess=${canAccessThisMedia}, reason=${accessReason}, mediaPrice=${media.point_price}, hasMediaPrice=${hasMediaPrice}, purchasedOrder=${purchasedMediaOrder}, signedUrl=${media.signed_url ? '있음' : 'null'}`);
        }
      }

      // 관리자는 항상 모든 파일 조회 가능
      const canViewFiles = isAdmin || 
        isOwner ||
        ((!isPaidPost || isPurchased) &&
          (!isSubscribersOnly || hasMembership));

      const result = {
        id: post.id,
        content: post.content,
        published_at: post.published_at,
        partner_id: post.partner?.id,
        partner: {
          name: post.partner?.partner_name || post.partner?.member?.member_code,
          profile_image: post.partner?.member?.profile_image,
          member_code: post.partner?.member?.member_code,
        },
        files: sortedMedia || [], // 모든 미디어 포함 (접근 불가능한 것은 signed_url이 null)
        like_count: post.post_likes?.length || 0,
        comment_count: post.comment_count || 0,
        is_liked: isLiked,
        // 관리자는 멤버십/단건구매 정보 불필요 (무료 게시글처럼 처리)
        is_purchased: isAdmin ? false : isPurchased,
        is_subscribers_only: isSubscribersOnly,
        is_paid_post: isPaidPost,
        point_price: post.point_price ?? null,
        has_membership: isAdmin ? false : hasMembership,
        is_authenticated: !!user,
        // 새로 추가되는 필드들
        is_bundle: post.is_bundle ?? false,
        discount_rate: post.discount_rate ?? 0,
        membership_id: post.membership_id ?? null,
        purchased_media_order: purchasedMediaOrder, // 구매한 미디어 인덱스 (개별 판매인 경우)
      };

      return new Response(JSON.stringify({ success: true, data: result }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      });
    }

    // --------------------------
    // PUT /api-posts → 게시글 수정 (id는 body에서 받음)
    // --------------------------
    if (req.method === "PUT" && (pathname === "/api-posts" || pathname === "/functions/v1/api-posts")) {
      const user = await getAuthUser(req);
      const body = await req.json();

      console.log('PUT /api-posts body:', JSON.stringify(body));

      const postId = body.id;
      if (!postId) {
        return new Response(JSON.stringify({ success: false, error: "Post ID is required in body" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400
        });
      }

      // 현재 사용자의 파트너 정보 조회
      const { data: partner, error: partnerError } = await supabase
        .from("partners")
        .select("id")
        .eq("member_id", user.id)
        .single();

      if (partnerError || !partner) {
        return new Response(JSON.stringify({ success: false, error: "Partner not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404
        });
      }

      // 게시글이 본인 소유인지 확인
      const { data: post, error: postError } = await supabase
        .from("posts")
        .select("id, partner_id")
        .eq("id", postId)
        .single();

      if (postError || !post) {
        return new Response(JSON.stringify({ success: false, error: "Post not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404
        });
      }

      if (post.partner_id !== partner.id) {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403
        });
      }

      // 업데이트할 필드 준비 (허용된 필드만)
      const updateData: Record<string, any> = {};
      
      // content (description) 수정
      if (body.content !== undefined) {
        updateData.content = body.content;
      }
      
      // point_price 수정
      if (body.point_price !== undefined) {
        updateData.point_price = body.point_price;
      }
      
      // is_subscribers_only 수정
      if (body.is_subscribers_only !== undefined) {
        updateData.is_subscribers_only = body.is_subscribers_only;
      }

      if (Object.keys(updateData).length === 0) {
        return new Response(JSON.stringify({ success: false, error: "No valid fields to update" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400
        });
      }

      // 게시글 업데이트
      const { data: updatedPost, error: updateError } = await supabase
        .from("posts")
        .update(updateData)
        .eq("id", postId)
        .select("id, content, point_price, is_subscribers_only")
        .single();

      if (updateError) {
        console.error('Update error:', updateError);
        return new Response(JSON.stringify({ success: false, error: updateError.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500
        });
      }

      return new Response(JSON.stringify({ success: true, data: updatedPost }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      });
    }

    // --------------------------
    // DELETE /api-posts/:postId → 게시글 삭제
    // body: { reason? } (관리자 삭제 시 삭제 사유)
    // --------------------------
    const deleteMatch = pathname.match(/^\/api-posts\/([a-zA-Z0-9-]+)$/) || pathname.match(/^\/functions\/v1\/api-posts\/([a-zA-Z0-9-]+)$/);
    if (req.method === "DELETE" && deleteMatch) {
      const postId = deleteMatch[1];
      const user = await getAuthUser(req);
      
      // 현재 사용자의 role 확인
      const { data: memberData, error: memberError } = await supabase
        .from("members")
        .select("role")
        .eq("id", user.id)
        .single();

      const isAdmin = !memberError && memberData?.role === 'admin';

      // 관리자는 api-post-reports POST를 통해 게시글 삭제 처리
      if (isAdmin) {
        return new Response(JSON.stringify({ success: false, error: "관리자는 api-post-reports를 통해 게시글을 삭제해주세요" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403
        });
      }

      // 게시글 정보 조회 (파트너 정보 포함)
      const { data: post, error: postError } = await supabase
        .from("posts")
        .select(`
          id, 
          partner_id,
          content,
          point_price,
          partner:partners!partner_id(
            id,
            member_id,
            partner_name,
            member:members!member_id(
              id,
              name
            )
          )
        `)
        .eq("id", postId)
        .single();

      if (postError || !post) {
        return new Response(JSON.stringify({ success: false, error: "Post not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404
        });
      }

      // 권한 확인: 본인 게시글만 삭제 가능
      const { data: partner, error: partnerError } = await supabase
        .from("partners")
        .select("id")
        .eq("member_id", user.id)
        .single();

      if (partnerError || !partner) {
        return new Response(JSON.stringify({ success: false, error: "Partner not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404
        });
      }

      if (post.partner_id !== partner.id) {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403
        });
      }


      // 게시글 관련 데이터 삭제 (post_id 기준으로 모든 관련 데이터 삭제)
      // 1. post_media 삭제 (미디어 파일 및 스토리지 파일)
      try {
        // 먼저 미디어 파일 정보 조회
        const { data: mediaFiles } = await supabase
          .from("post_media")
          .select("media_url")
          .eq("post_id", postId);
        
        // 스토리지 파일 삭제
        if (mediaFiles && mediaFiles.length > 0) {
          const filePaths = mediaFiles.map((m) => m.media_url).filter(Boolean);
          for (const filePath of filePaths) {
            try {
              await supabase.storage.from("post-media").remove([filePath]);
            } catch (e) {
              console.warn(`[Post Delete] 스토리지 파일 삭제 실패 - ${filePath}:`, e);
            }
          }
        }
        
        // post_media 테이블에서 삭제
        const { error: mediaDeleteError } = await supabase
          .from("post_media")
          .delete()
          .eq("post_id", postId);
        
        if (mediaDeleteError) {
          throw mediaDeleteError;
        }
        
        console.log(`[Post Delete] post_media 삭제 완료 - post_id: ${postId}, 삭제된 미디어 수: ${mediaFiles?.length || 0}`);
      } catch (e) {
        console.warn(`[Post Delete] post_media 삭제 실패 (계속 진행) - post_id: ${postId}:`, e);
      }
      
      // 2. post_likes 삭제 (좋아요 정보)
      try {
        const { error: likesDeleteError } = await supabase
          .from("post_likes")
          .delete()
          .eq("post_id", postId);
        
        if (likesDeleteError) {
          throw likesDeleteError;
        }
        
        console.log(`[Post Delete] post_likes 삭제 완료 - post_id: ${postId}`);
      } catch (e) {
        console.warn(`[Post Delete] post_likes 삭제 실패 (계속 진행) - post_id: ${postId}:`, e);
      }
      
      // 3. comments 삭제 (댓글 정보)
      try {
        const { error: commentsDeleteError } = await supabase
          .from("comments")
          .delete()
          .eq("post_id", postId);
        
        if (commentsDeleteError) {
          throw commentsDeleteError;
        }
        
        console.log(`[Post Delete] comments 삭제 완료 - post_id: ${postId}`);
      } catch (e) {
        console.warn(`[Post Delete] comments 삭제 실패 (계속 진행) - post_id: ${postId}:`, e);
      }
      
      // 4. album_posts 삭제 (모든 유저의 앨범에서 해당 게시글 제거)
      try {
        const { data: albumPosts, error: albumPostsError } = await supabase
          .from("album_posts")
          .select("id, album_id")
          .eq("post_id", postId);
        
        if (!albumPostsError && albumPosts && albumPosts.length > 0) {
          // album_posts 삭제
          await supabase.from("album_posts").delete().eq("post_id", postId);
          
          // 각 앨범의 order 재정렬
          const albumIds = [...new Set(albumPosts.map((ap: any) => ap.album_id))];
          for (const albumId of albumIds) {
            try {
              const { data: remaining, error: remainingError } = await supabase
                .from("album_posts")
                .select("id")
                .eq("album_id", albumId)
                .order("order", { ascending: true });
              
              if (!remainingError && remaining && remaining.length > 0) {
                for (let i = 0; i < remaining.length; i++) {
                  const ap = remaining[i];
                  const newOrder = i + 1;
                  await supabase
                    .from("album_posts")
                    .update({ order: newOrder })
                    .eq("id", ap.id);
                }
              }
            } catch (orderErr) {
              console.warn(`[Post Delete] 앨범 order 재정렬 실패 (계속 진행) - album_id: ${albumId}:`, orderErr);
            }
          }
          
          console.log(`[Post Delete] Removed post from ${albumPosts.length} album(s) - post_id: ${postId}`);
        }
      } catch (e) {
        console.warn(`[Post Delete] album_posts 삭제 실패 (계속 진행) - post_id: ${postId}:`, e);
      }
      
      // 5. post_unlocks 삭제 (단건 구매 기록 삭제)
      try {
        const { error: unlocksDeleteError } = await supabase
          .from("post_unlocks")
          .delete()
          .eq("post_id", postId);
        
        if (unlocksDeleteError) {
          throw unlocksDeleteError;
        }
        
        console.log(`[Post Delete] post_unlocks 삭제 완료 - post_id: ${postId}`);
      } catch (e) {
        console.warn(`[Post Delete] post_unlocks 삭제 실패 (계속 진행) - post_id: ${postId}:`, e);
      }
      
      // 6. purchases 삭제 (구매 기록 삭제)
      try {
        const { error: purchasesDeleteError } = await supabase
          .from("purchases")
          .delete()
          .eq("post_id", postId);
        
        if (purchasesDeleteError) {
          throw purchasesDeleteError;
        }
        
        console.log(`[Post Delete] purchases 삭제 완료 - post_id: ${postId}`);
      } catch (e) {
        console.warn(`[Post Delete] purchases 삭제 실패 (계속 진행) - post_id: ${postId}:`, e);
      }
      
      // 7. post_reports 삭제 (신고 기록 삭제 - 기존 신고 이력 포함)
      try {
        const { error: reportsDeleteError } = await supabase
          .from("post_reports")
          .delete()
          .eq("post_id", postId);
        
        if (reportsDeleteError) {
          throw reportsDeleteError;
        }
        
        console.log(`[Post Delete] post_reports 삭제 완료 - post_id: ${postId}`);
      } catch (e) {
        console.warn(`[Post Delete] post_reports 삭제 실패 (계속 진행) - post_id: ${postId}:`, e);
      }
      
      // 8. posts 테이블에서 게시글 삭제 (최종 삭제)
      // 관련 데이터 삭제 후 posts 테이블에서 게시글 삭제
      const { error: deleteError } = await supabase
        .from("posts")
        .delete()
        .eq("id", postId);

      if (deleteError) {
        console.error(`[Post Delete] posts 테이블 삭제 실패 - post_id: ${postId}:`, deleteError);
        return new Response(JSON.stringify({ success: false, error: deleteError.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500
        });
      }
      
      console.log(`[Post Delete] posts 테이블 삭제 완료 - post_id: ${postId}`);

      return new Response(JSON.stringify({ success: true, message: "Post deleted successfully" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      });
    }

    // --------------------------
    // POST /api-posts/pin → 게시글 핀 고정
    // body: { post_id }
    //  - 파트너만 자신의 게시글에 핀 고정 가능
    //  - 최대 3개까지 가능
    // --------------------------
    if (req.method === "POST" && pathname.endsWith("/api-posts/pin")) {
      const user = await getAuthUser(req);
      const body = await req.json();

      if (!body?.post_id) {
        return new Response(JSON.stringify({ success: false, error: "post_id is required" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400
        });
      }

      const postId = body.post_id;

      // 1. 게시글 조회 및 소유권 확인
      const { data: post, error: postError } = await supabase
        .from("posts")
        .select("id, partner_id, is_pinned")
        .eq("id", postId)
        .maybeSingle();

      if (postError || !post) {
        return new Response(JSON.stringify({ success: false, error: "Post not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404
        });
      }

      // 2. 파트너 확인
      const { data: partner, error: partnerError } = await supabase
        .from("partners")
        .select("id, member_id")
        .eq("id", post.partner_id)
        .maybeSingle();

      if (partnerError || !partner) {
        return new Response(JSON.stringify({ success: false, error: "Partner not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404
        });
      }

      // 3. 소유권 확인 (파트너만 자신의 게시글에 핀 고정 가능)
      if (partner.member_id !== user.id) {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized: Only post owner can pin" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403
        });
      }

      // 4. 이미 핀 고정되어 있는지 확인
      if (post.is_pinned === true || post.is_pinned === 'true' || post.is_pinned === 1) {
        return new Response(JSON.stringify({ success: false, error: "Post is already pinned" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400
        });
      }

      // 5. 현재 파트너의 핀 고정된 게시글 수 확인 (최대 3개)
      const { data: pinnedPosts, error: pinnedError } = await supabase
        .from("posts")
        .select("id")
        .eq("partner_id", post.partner_id)
        .eq("is_pinned", true);

      if (pinnedError) {
        return new Response(JSON.stringify({ success: false, error: pinnedError.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500
        });
      }

      const pinnedCount = (pinnedPosts || []).length;
      if (pinnedCount >= 3) {
        return new Response(JSON.stringify({ success: false, error: "핀 고정은 최대 3개까지 가능합니다." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400
        });
      }

      // 6. 핀 고정
      const { data: updatedPost, error: updateError } = await supabase
        .from("posts")
        .update({ is_pinned: true })
        .eq("id", postId)
        .select("id, partner_id, is_pinned")
        .single();

      if (updateError) {
        return new Response(JSON.stringify({ success: false, error: updateError.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500
        });
      }

      return new Response(JSON.stringify({ success: true, data: updatedPost }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      });
    }

    // --------------------------
    // DELETE /api-posts/pin/:postId → 게시글 핀 고정 해제
    //  - 파트너만 자신의 게시글 핀 고정 해제 가능
    // --------------------------
    const unpinMatch = pathname.match(/\/api-posts\/pin\/([a-zA-Z0-9-]+)$/);
    if (req.method === "DELETE" && unpinMatch) {
      const postId = unpinMatch[1];
      const user = await getAuthUser(req);

      // 1. 게시글 조회 및 소유권 확인
      const { data: post, error: postError } = await supabase
        .from("posts")
        .select("id, partner_id, is_pinned")
        .eq("id", postId)
        .maybeSingle();

      if (postError || !post) {
        return new Response(JSON.stringify({ success: false, error: "Post not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404
        });
      }

      // 2. 파트너 확인
      const { data: partner, error: partnerError } = await supabase
        .from("partners")
        .select("id, member_id")
        .eq("id", post.partner_id)
        .maybeSingle();

      if (partnerError || !partner) {
        return new Response(JSON.stringify({ success: false, error: "Partner not found" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404
        });
      }

      // 3. 소유권 확인
      if (partner.member_id !== user.id) {
        return new Response(JSON.stringify({ success: false, error: "Unauthorized: Only post owner can unpin" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403
        });
      }

      // 4. 핀 고정 해제
      const { data: updatedPost, error: updateError } = await supabase
        .from("posts")
        .update({ is_pinned: false })
        .eq("id", postId)
        .select("id, partner_id, is_pinned")
        .single();

      if (updateError) {
        return new Response(JSON.stringify({ success: false, error: updateError.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500
        });
      }

      return new Response(JSON.stringify({ success: true, data: updatedPost }), {
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

