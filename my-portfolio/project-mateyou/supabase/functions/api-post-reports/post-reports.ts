import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createSupabaseClient, getAuthUser } from "../_shared/utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient();
    const url = new URL(req.url);
    const pathname = url.pathname;

    // ======================================================
    // POST /api-post-reports → 게시글 신고 생성
    // 관리자일 경우: 신고 저장 후 해당 post_id의 스토리지 파일 모두 삭제
    // ======================================================
    if (req.method === "POST" && (pathname === "/api-post-reports" || pathname === "/functions/v1/api-post-reports")) {
      const user = await getAuthUser(req);
      const body = await req.json();

      const { post_id, reported_user_id, chat_room_id, comment_id, reason_type, reason_detail } = body;

      // 신고 대상 유효성 검사 (post_id, reported_user_id, chat_room_id, comment_id 중 하나 필요)
      if (!post_id && !reported_user_id && !chat_room_id && !comment_id) {
        return new Response(
          JSON.stringify({ success: false, error: "신고 대상이 필요합니다 (post_id, reported_user_id, chat_room_id, comment_id 중 하나)" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      if (reason_type === undefined || reason_type === null || reason_type === "") {
        return new Response(
          JSON.stringify({ success: false, error: "reason_type is required" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      // 관리자 권한 확인
      const { data: memberData, error: memberError } = await supabase
        .from("members")
        .select("role")
        .eq("id", user.id)
        .single();

      const isAdmin = !memberError && memberData?.role === 'admin';
      const reasonTypeText = String(reason_type).trim();

      // ========== 사용자/채팅/댓글 신고 처리 ==========
      if (reported_user_id || chat_room_id || comment_id) {
        // 본인 신고 불가
        if (reported_user_id === user.id) {
          return new Response(
            JSON.stringify({ success: false, error: "본인을 신고할 수 없습니다." }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }

        // 중복 신고 확인
        let existingQuery = supabase.from("post_reports").select("id").eq("reporter_id", user.id);
        if (reported_user_id) existingQuery = existingQuery.eq("reported_user_id", reported_user_id);
        if (comment_id) existingQuery = existingQuery.eq("comment_id", comment_id);
        
        const { data: existingReport } = await existingQuery.maybeSingle();
        if (existingReport) {
          return new Response(
            JSON.stringify({ success: false, error: "이미 신고한 대상입니다." }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
          );
        }

        // 신고 저장 (chat_room_id 제외 - 테이블에 없음)
        const { error: insertError } = await supabase
          .from("post_reports")
          .insert({
            reporter_id: user.id,
            reported_user_id: reported_user_id || null,
            comment_id: comment_id || null,
            reason_type: reasonTypeText,
            reason_detail: reason_detail || null,
            status: "pending",
          });

        if (insertError) {
          console.error("신고 저장 실패:", insertError);
          return new Response(
            JSON.stringify({ success: false, error: "신고 접수에 실패했습니다." }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
          );
        }

        return new Response(
          JSON.stringify({ success: true, message: "신고가 접수되었습니다." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }

      // ========== 게시글 신고 처리 (기존 로직) ==========
      // 게시글 존재 여부 확인 + 작성자 정보 조회 (관리자 삭제를 위해 상세 정보 포함)
      const { data: post, error: postErr } = await supabase
        .from("posts")
        .select(`
          id,
          partner_id,
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
        .eq("id", post_id)
        .maybeSingle();

      if (postErr || !post) {
        return new Response(
          JSON.stringify({ success: false, error: "Post not found" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
        );
      }

      // 본인 게시글 신고 불가 (관리자는 제외)
      const postOwnerId = (post.partner as any)?.member_id;
      if (!isAdmin && postOwnerId && postOwnerId === user.id) {
        return new Response(
          JSON.stringify({ success: false, error: "본인의 게시글은 신고할 수 없습니다." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      // 중복 신고 확인 (관리자는 제외 - 관리자는 기존 신고가 있어도 신고 가능)
      if (!isAdmin) {
        const { data: existingReport } = await supabase
          .from("post_reports")
          .select("id")
          .eq("post_id", post_id)
          .eq("reporter_id", user.id)
          .maybeSingle();

        if (existingReport) {
          return new Response(
            JSON.stringify({ success: false, error: "이미 신고한 게시글입니다." }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409 }
          );
        }
      }

      // 신고 생성 (관리자는 기존 신고가 있어도 새로 생성)
      const { data: newReport, error: insertErr } = await supabase
        .from("post_reports")
        .insert({
          post_id,
          reporter_id: user.id,
          reason_type: reasonTypeText,  // 숫자 → 텍스트 변환된 값 저장
          reason_detail: reason_detail || null,
          status: isAdmin ? "resolved" : "pending", // 관리자는 즉시 처리됨 (게시글 삭제)
        })
        .select()
        .single();

      if (insertErr) {
        console.error("Insert error:", insertErr);
        return new Response(
          JSON.stringify({ success: false, error: insertErr.message }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
      }

      // 관리자일 경우: 신고 후 게시글과 관련된 모든 데이터 삭제
      if (isAdmin) {
        const deleteReason = reason_detail || reasonTypeText;
        
        // 1. post_media 삭제 (미디어 파일 및 스토리지 파일)
        try {
          // 먼저 미디어 파일 정보 조회
          const { data: mediaFiles, error: mediaError } = await supabase
            .from("post_media")
            .select("media_url")
            .eq("post_id", post_id);

          if (!mediaError && mediaFiles && mediaFiles.length > 0) {
            const filePaths = mediaFiles.map((m) => m.media_url).filter(Boolean);
            
            // 스토리지에서 모든 파일 삭제
            for (const filePath of filePaths) {
              try {
                await supabase.storage.from("post-media").remove([filePath]);
                console.log(`[Admin Report] 스토리지 파일 삭제 완료 - post_id: ${post_id}, file: ${filePath}`);
              } catch (e) {
                console.warn(`[Admin Report] 스토리지 파일 삭제 실패 - ${filePath}:`, e);
              }
            }
            
            console.log(`[Admin Report] 스토리지 파일 삭제 완료 - post_id: ${post_id}, 삭제된 파일 수: ${filePaths.length}`);
          }
          
          // post_media 테이블에서 삭제
          const { error: mediaDeleteError } = await supabase
            .from("post_media")
            .delete()
            .eq("post_id", post_id);
          
          if (mediaDeleteError) {
            throw mediaDeleteError;
          }
          
          console.log(`[Admin Report] post_media 삭제 완료 - post_id: ${post_id}`);
        } catch (e) {
          console.warn(`[Admin Report] post_media 삭제 실패 (계속 진행) - post_id: ${post_id}:`, e);
        }

        // 2. post_likes 삭제
        try {
          await supabase.from("post_likes").delete().eq("post_id", post_id);
          console.log(`[Admin Report] post_likes 삭제 완료 - post_id: ${post_id}`);
        } catch (e) {
          console.warn(`[Admin Report] post_likes 삭제 실패 (계속 진행) - post_id: ${post_id}:`, e);
        }

        // 3. comments 삭제
        try {
          await supabase.from("comments").delete().eq("post_id", post_id);
          console.log(`[Admin Report] comments 삭제 완료 - post_id: ${post_id}`);
        } catch (e) {
          console.warn(`[Admin Report] comments 삭제 실패 (계속 진행) - post_id: ${post_id}:`, e);
        }

        // 4. album_posts 삭제 (모든 유저의 앨범에서 해당 게시글 제거)
        try {
          const { data: albumPosts, error: albumPostsError } = await supabase
            .from("album_posts")
            .select("id, album_id")
            .eq("post_id", post_id);

          if (!albumPostsError && albumPosts && albumPosts.length > 0) {
            // album_posts 삭제
            await supabase.from("album_posts").delete().eq("post_id", post_id);

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
                console.warn(`[Admin Report] 앨범 order 재정렬 실패 (계속 진행) - album_id: ${albumId}:`, orderErr);
              }
            }

            console.log(`[Admin Report] Removed post from ${albumPosts.length} album(s) - post_id: ${post_id}`);
          }
        } catch (e) {
          console.warn(`[Admin Report] album_posts 삭제 실패 (계속 진행) - post_id: ${post_id}:`, e);
        }

        // 5. 단건구매 게시글인 경우 포인트 환불 및 차감 처리
        const isPaidPost = post.point_price != null && post.point_price > 0;
        if (isPaidPost && post.point_price) {
          const pointPrice = post.point_price;
          
          // 5-1. 해당 게시글을 구매한 모든 유저 조회
          const { data: unlocks, error: unlocksError } = await supabase
            .from("post_unlocks")
            .select("user_id")
            .eq("post_id", post_id);
          
          if (!unlocksError && unlocks && unlocks.length > 0) {
            const buyerIds = unlocks.map((u: any) => u.user_id);
            const totalRefundAmount = pointPrice * buyerIds.length;
            
            console.log(`[Admin Report] 단건구매 게시글 삭제 - 구매자 수: ${buyerIds.length}, 포인트: ${pointPrice}, 총 환불: ${totalRefundAmount}`);
            
            // 5-2. 각 구매자에게 포인트 환불
            for (const buyerId of buyerIds) {
              try {
                // 구매자 현재 포인트 조회
                const { data: buyer, error: buyerError } = await supabase
                  .from("members")
                  .select("total_points")
                  .eq("id", buyerId)
                  .single();
                
                if (!buyerError && buyer) {
                  const currentPoints = buyer.total_points ?? 0;
                  const newPoints = currentPoints + pointPrice;
                  
                  // 포인트 로그 기록
                  const refundLogId = `refund_post_delete_${post_id}_${buyerId}_${Date.now()}`;
                  await supabase.from("member_points_logs").insert({
                    member_id: buyerId,
                    type: "earn",
                    amount: pointPrice,
                    description: `게시글 삭제로 인한 단건구매 환불`,
                    log_id: refundLogId,
                  });
                  
                  // 포인트 환불
                  await supabase
                    .from("members")
                    .update({ total_points: newPoints })
                    .eq("id", buyerId);
                  
                  // 참고: 구매자가 파트너여도 partners.total_points는 동기화하지 않음
                  // partners.total_points는 번 포인트, members.total_points는 충전/사용 포인트로 분리됨
                  
                  // 구매자에게 환불 알림 발송
                  try {
                    const supabaseUrl = Deno.env.get('SUPABASE_URL');
                    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
                    
                    if (supabaseUrl && anonKey) {
                      await fetch(`${supabaseUrl}/functions/v1/push-native`, {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          'Authorization': req.headers.get('Authorization') || `Bearer ${anonKey}`,
                          'apikey': anonKey,
                        },
                        body: JSON.stringify({
                          action: 'enqueue_notification',
                          user_id: buyerId,
                          target_member_id: buyerId,
                          title: '구매 게시물 환불 안내',
                          body: `구매하신 게시물이 삭제되어 ${pointPrice.toLocaleString()}P가 환불되었습니다.`,
                          icon: null,
                          url: '/mypage',
                          notification_type: 'post_refund',
                          tag: `post_refund_${post_id}_${buyerId}`,
                          data: {
                            type: 'post_refund',
                            post_id: post_id,
                            refund_amount: pointPrice,
                            url: '/mypage',
                          },
                          process_immediately: true,
                        }),
                      });
                    }
                  } catch (notifyErr) {
                    console.error(`[Admin Report] 환불 알림 발송 실패 - buyer_id: ${buyerId}:`, notifyErr);
                  }
                  
                  console.log(`[Admin Report] 구매자 포인트 환불 완료 - buyer_id: ${buyerId}, 환불 포인트: ${pointPrice}`);
                }
              } catch (refundErr) {
                console.error(`[Admin Report] 구매자 포인트 환불 실패 - buyer_id: ${buyerId}:`, refundErr);
                // 개별 환불 실패해도 계속 진행
              }
            }
            
            // 5-3. 파트너 포인트 차감
            const partnerId = post.partner_id;
            const partnerMemberId = (post.partner as any)?.member_id;
            
            if (partnerId) {
              try {
                // partners.total_points 차감
                const { data: partner, error: partnerError } = await supabase
                  .from("partners")
                  .select("total_points")
                  .eq("id", partnerId)
                  .single();
                
                if (!partnerError && partner) {
                  const partnerCurrentPoints = partner.total_points ?? 0;
                  const partnerNewPoints = partnerCurrentPoints - totalRefundAmount; // 마이너스 허용
                  
                  await supabase
                    .from("partners")
                    .update({ total_points: partnerNewPoints })
                    .eq("id", partnerId);
                  
                  console.log(`[Admin Report] 파트너 포인트 차감 완료 - partner_id: ${partnerId}, 차감 포인트: ${totalRefundAmount}, 현재 포인트: ${partnerNewPoints}`);
                }
              } catch (partnerErr) {
                console.error(`[Admin Report] 파트너 포인트 차감 실패 - partner_id: ${partnerId}:`, partnerErr);
              }
            }
            
            // 참고: 판매자의 members.total_points는 차감하지 않음
            // partners.total_points는 번 포인트, members.total_points는 충전/사용 포인트로 분리됨
          }
        }

        // 6. post_unlocks 삭제
        try {
          await supabase.from("post_unlocks").delete().eq("post_id", post_id);
          console.log(`[Admin Report] post_unlocks 삭제 완료 - post_id: ${post_id}`);
        } catch (e) {
          console.warn(`[Admin Report] post_unlocks 삭제 실패 (계속 진행) - post_id: ${post_id}:`, e);
        }

        // 7. purchases 삭제
        try {
          await supabase.from("purchases").delete().eq("post_id", post_id);
          console.log(`[Admin Report] purchases 삭제 완료 - post_id: ${post_id}`);
        } catch (e) {
          console.warn(`[Admin Report] purchases 삭제 실패 (계속 진행) - post_id: ${post_id}:`, e);
        }

        // 8. post_reports 삭제 (신고 기록 삭제 - 기존 신고 이력 포함)
        try {
          await supabase.from("post_reports").delete().eq("post_id", post_id);
          console.log(`[Admin Report] post_reports 삭제 완료 - post_id: ${post_id}`);
        } catch (e) {
          console.warn(`[Admin Report] post_reports 삭제 실패 (계속 진행) - post_id: ${post_id}:`, e);
        }

        // 9. posts 테이블에서 게시글 삭제 (최종 삭제)
        try {
          const { error: deleteError } = await supabase
            .from("posts")
            .delete()
            .eq("id", post_id);

          if (deleteError) {
            console.error(`[Admin Report] posts 테이블 삭제 실패 - post_id: ${post_id}:`, deleteError);
          } else {
            console.log(`[Admin Report] posts 테이블 삭제 완료 - post_id: ${post_id}`);
          }
        } catch (e) {
          console.error(`[Admin Report] posts 테이블 삭제 실패 - post_id: ${post_id}:`, e);
        }

        // 10. 파트너에게 알림 전송
        const postOwnerId = (post.partner as any)?.member_id;
        if (postOwnerId) {
          try {
            const supabaseUrl = Deno.env.get("SUPABASE_URL");
            const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

            if (supabaseUrl && anonKey) {
              const authHeader = req.headers.get("Authorization") || `Bearer ${anonKey}`;
              const headers = {
                Authorization: authHeader,
                apikey: anonKey,
                "Content-Type": "application/json",
              };

              const adminName = memberData?.name || "관리자";
              const partnerName = (post.partner as any)?.partner_name || (post.partner as any)?.member?.name || "파트너";

              await fetch(`${supabaseUrl}/functions/v1/push-native`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                  action: "enqueue_notification",
                  user_id: postOwnerId,
                  target_member_id: postOwnerId,
                  title: "게시글이 삭제되었습니다",
                  body: `관리자에 의해 게시글이 삭제되었습니다.\n사유: ${deleteReason}`,
                  icon: null,
                  url: "/posts",
                  notification_type: "post_deleted",
                  tag: `post_deleted_${post_id}`,
                  data: {
                    type: "post_deleted",
                    post_id: post_id,
                    reason: deleteReason,
                    deleted_by: user.id,
                    deleted_by_name: adminName,
                    url: "/posts",
                  },
                  process_immediately: true,
                }),
              });

              console.log(`[Admin Report] 알림 전송 완료 - post_id: ${post_id}, partner_id: ${postOwnerId}, reason: ${deleteReason}`);
            }
          } catch (pushErr) {
            console.error("Failed to send post deletion notification:", pushErr);
            // 알림 실패해도 삭제는 성공으로 처리
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true, data: newReport }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 201 }
      );
    }

    // ======================================================
    // GET /api-post-reports → 신고 목록 조회 (관리자용)
    // GET /api-post-reports/my → 내 신고 목록 조회
    // ======================================================
    if (req.method === "GET") {
      const user = await getAuthUser(req);

      // 내 신고 목록 조회
      if (pathname.includes("/my")) {
        const page = parseInt(url.searchParams.get("page") || "1");
        const limit = parseInt(url.searchParams.get("limit") || "20");
        const offset = (page - 1) * limit;

        const { data: reports, error, count } = await supabase
          .from("post_reports")
          .select(`
            *,
            post:posts!post_id(
              id,
              content,
              partner:partners!partner_id(
                id,
                partner_name,
                member:members!member_id(id, name, profile_image)
              )
            )
          `, { count: "exact" })
          .eq("reporter_id", user.id)
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;

        return new Response(
          JSON.stringify({
            success: true,
            data: reports || [],
            meta: { total: count || 0, page, limit },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
        );
      }

      // 관리자용 전체 신고 목록 조회
      // 관리자 권한 확인
      const { data: member } = await supabase
        .from("members")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!member || member.role !== "admin") {
        return new Response(
          JSON.stringify({ success: false, error: "Admin access required" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
        );
      }

      const page = parseInt(url.searchParams.get("page") || "1");
      const limit = parseInt(url.searchParams.get("limit") || "20");
      const status = url.searchParams.get("status"); // 필터: pending, in_progress, resolved
      const offset = (page - 1) * limit;

      let query = supabase
        .from("post_reports")
        .select(`
          *,
          reporter:members!reporter_id(id, name, profile_image, member_code),
          post:posts!post_id(
            id,
            content,
            partner:partners!partner_id(
              id,
              partner_name,
              member:members!member_id(id, name, profile_image)
            )
          )
        `, { count: "exact" });

      if (status) {
        query = query.eq("status", status);
      }

      const { data: reports, error, count } = await query
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      return new Response(
        JSON.stringify({
          success: true,
          data: reports || [],
          meta: { total: count || 0, page, limit },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // ======================================================
    // PUT /api-post-reports/:id → 신고 상태 변경 (관리자용)
    // ======================================================
    if (req.method === "PUT") {
      const user = await getAuthUser(req);

      // 관리자 권한 확인
      const { data: member } = await supabase
        .from("members")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!member || member.role !== "admin") {
        return new Response(
          JSON.stringify({ success: false, error: "Admin access required" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
        );
      }

      const body = await req.json();
      const { id, status } = body;

      if (!id) {
        return new Response(
          JSON.stringify({ success: false, error: "Report ID is required" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      if (!status || !["pending", "in_progress", "resolved"].includes(status)) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid status. Must be: pending, in_progress, resolved" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      const updateData: Record<string, any> = { status };

      // resolved 상태로 변경 시 processed_at 자동 설정
      if (status === "resolved") {
        updateData.processed_at = new Date().toISOString();
      }

      const { data: updatedReport, error: updateErr } = await supabase
        .from("post_reports")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (updateErr) {
        console.error("Update error:", updateErr);
        return new Response(
          JSON.stringify({ success: false, error: updateErr.message }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true, data: updatedReport }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // ======================================================
    // DELETE /api-post-reports/:id → 신고 취소 (본인만)
    // ======================================================
    if (req.method === "DELETE") {
      const user = await getAuthUser(req);
      const body = await req.json();
      const { id } = body;

      if (!id) {
        return new Response(
          JSON.stringify({ success: false, error: "Report ID is required" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      // 신고 조회 및 권한 확인
      const { data: report, error: reportErr } = await supabase
        .from("post_reports")
        .select("id, reporter_id, status")
        .eq("id", id)
        .single();

      if (reportErr || !report) {
        return new Response(
          JSON.stringify({ success: false, error: "Report not found" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
        );
      }

      if (report.reporter_id !== user.id) {
        return new Response(
          JSON.stringify({ success: false, error: "본인의 신고만 취소할 수 있습니다." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
        );
      }

      // 이미 처리된 신고는 취소 불가
      if (report.status !== "pending") {
        return new Response(
          JSON.stringify({ success: false, error: "처리 중이거나 완료된 신고는 취소할 수 없습니다." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      const { error: deleteErr } = await supabase
        .from("post_reports")
        .delete()
        .eq("id", id);

      if (deleteErr) {
        return new Response(
          JSON.stringify({ success: false, error: deleteErr.message }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: "신고가 취소되었습니다." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: "Endpoint not found" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
    );

  } catch (err: any) {
    console.error("Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});

