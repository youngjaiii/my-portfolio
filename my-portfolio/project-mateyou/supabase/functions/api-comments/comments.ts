import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createSupabaseClient, getAuthUser } from "../_shared/utils.ts";

// Deno 전역 타입 선언 (로컬 TS 환경에서 Deno 인식용)
declare const Deno: typeof globalThis.Deno;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
};

// --- URL 파싱 함수 ---
const extractPathParts = (url: string) => {
  const pathname = new URL(url).pathname;
  return pathname.split("/").filter(Boolean);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createSupabaseClient();

  try {
    const parts = extractPathParts(req.url);
    
    // GET 요청은 인증 선택적, POST/DELETE는 인증 필수
    let user: any = null;
    if (req.method === "GET") {
      // GET은 인증 없이도 조회 가능
      try {
        user = await getAuthUser(req);
      } catch {
        // 비로그인 사용자도 댓글 조회 가능
      }
    } else {
      // POST, DELETE는 인증 필수
      user = await getAuthUser(req);
    }

    let post_id: string | null = null;
    let comment_id: string | null = null;

    // DELETE /api-comments/:post_id/:comment_id
    if (req.method === "DELETE") {
      if (parts.length < 3) {
        return new Response(
          JSON.stringify({ success: false, error: "Invalid URL" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      post_id = parts[1];
      comment_id = parts[2];
    }
    // POST/GET → /api-comments/:post_id
    else {
      post_id = parts[1];
    }

    if (!post_id) {
      return new Response(
        JSON.stringify({ success: false, error: "post_id missing" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 400,
        },
      );
    }

    // ======================================================
    // POST → 댓글 생성
    // ======================================================
    if (req.method === "POST") {
      const body = await req.json();
      const content = body.content || "";
      const parent_id = body.parent_id || null;
      const tag = body.tag || null; // 태그된 user_id (대댓글 시 부모 댓글 작성자 or 직접 태그)

      if (!content) {
        return new Response(
          JSON.stringify({ success: false, error: "Content required" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      let reply_index: number | null = null;
      let autoTag = tag; // 자동 태그 (대댓글 시 부모 댓글 작성자)

      if (parent_id) {
        // 대댓글인 경우
        const { data: parentComment, error: parentErr } = await supabase
          .from("comments")
          .select("id, user_id")
          .eq("id", parent_id)
          .maybeSingle();

        if (parentErr) throw parentErr;

        // tag가 명시적으로 전달되지 않았으면 부모 댓글 작성자를 자동 태그
        if (!tag && parentComment?.user_id) {
          autoTag = parentComment.user_id;
        }

        const { data: siblings, error: siblingErr } = await supabase
          .from("comments")
          .select("id")
          .eq("parent_id", parent_id);

        if (siblingErr) throw siblingErr;

        reply_index = siblings ? siblings.length + 1 : 1;
      }

      const { data: newComment, error: insertErr } = await supabase
        .from("comments")
        .insert([
          {
            post_id,
            user_id: user.id,
            parent_id,
            index: reply_index,
            content,
            tag: autoTag,
          },
        ])
        .select()
        .single();

      if (insertErr) throw insertErr;

      await supabase.rpc("increment_comment_count", {
        post_id_param: post_id,
      });

      // --------------------------------
      // 네이티브 푸시: 알림 전송
      // 1. 게시글 작성자에게 댓글 알림 (본인 제외)
      // 2. 태그된 사용자에게 멘션 알림 (본인 및 게시글 작성자 제외)
      // --------------------------------
      try {
        // 게시글 + 파트너(작성자) 정보 조회
        const { data: post, error: postErr } = await supabase
          .from("posts")
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
          .eq("id", post_id)
          .maybeSingle();

        const postOwner = post?.partner?.member;
        const postOwnerId = postOwner?.id;

        // 댓글 작성자 정보
        let commenterName = "회원";
        let commenterProfileImage: string | null = null;
        try {
          const { data: commenter } = await supabase
            .from("members")
            .select("name, profile_image")
            .eq("id", user.id)
            .maybeSingle();

          if (commenter) {
            commenterName = commenter.name || commenterName;
            commenterProfileImage = commenter.profile_image || null;
          }
        } catch {
          // 프로필 조회 실패는 알림 동작에 영향 주지 않음
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

        if (supabaseUrl && anonKey) {
          const authHeader =
            req.headers.get("Authorization") || `Bearer ${anonKey}`;
          const headers = {
            Authorization: authHeader,
            apikey: anonKey,
            "Content-Type": "application/json",
          };

          const postUrl = `/feed/${post_id}`;
          const preview =
            content.length > 50 ? content.substring(0, 50) + "..." : content;

          // 1. 게시글 작성자에게 댓글 알림 (본인 제외)
          if (!postErr && postOwnerId && postOwnerId !== user.id) {
            await fetch(`${supabaseUrl}/functions/v1/push-native`, {
              method: "POST",
              headers,
              body: JSON.stringify({
                action: "enqueue_notification",
                user_id: postOwnerId,
                target_member_id: postOwnerId,
                title: "새로운 댓글",
                body: `${commenterName}님이 내 게시글에 댓글을 남겼습니다: ${preview}`,
                icon: commenterProfileImage,
                url: postUrl,
                notification_type: "post_comment",
                data: {
                  type: "post_comment",
                  post_id,
                  comment_id: newComment.id,
                  commenter_id: user.id,
                  url: postUrl,
                },
                process_immediately: true, // 즉시 FCM 전송
              }),
            });
          }

          // 2. 태그된 사용자에게 멘션 알림 (본인 제외, 게시글 작성자 제외 - 이미 위에서 알림 받음)
          if (autoTag && autoTag !== user.id && autoTag !== postOwnerId) {
            // 태그된 사용자 정보 조회
            let taggedUserName = "회원";
            try {
              const { data: taggedUser } = await supabase
                .from("members")
                .select("name")
                .eq("id", autoTag)
                .maybeSingle();

              if (taggedUser?.name) {
                taggedUserName = taggedUser.name;
              }
            } catch {
              // 무시
            }

            await fetch(`${supabaseUrl}/functions/v1/push-native`, {
              method: "POST",
              headers,
              body: JSON.stringify({
                action: "enqueue_notification",
                user_id: autoTag,
                target_member_id: autoTag,
                title: "댓글에서 회원님을 언급했습니다",
                body: `${commenterName}님이 댓글에서 회원님을 언급했습니다: ${preview}`,
                icon: commenterProfileImage,
                url: postUrl,
                notification_type: "comment_mention",
                data: {
                  type: "comment_mention",
                  post_id,
                  comment_id: newComment.id,
                  commenter_id: user.id,
                  url: postUrl,
                },
                process_immediately: true, // 즉시 FCM 전송
              }),
            });
          }
        }
      } catch (pushErr) {
        console.error("Failed to enqueue comment notification:", pushErr);
      }

      return new Response(
        JSON.stringify({ success: true, data: newComment }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 201,
        },
      );
    }

    // ======================================================
    // GET → 댓글 전체 조회 (프로필 정보 + 태그 정보 포함)
    // ======================================================
    if (req.method === "GET") {
      const { data: comments, error } = await supabase
        .from("comments")
        .select("id, post_id, user_id, parent_id, index, content, tag, created_at")
        .eq("post_id", post_id)
        .order("created_at", { ascending: true });

      if (error) throw error;

      if (!comments || comments.length === 0) {
        return new Response(
          JSON.stringify({ success: true, data: [] }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          },
        );
      }

      // 댓글 작성자 + 태그된 사용자 프로필 정보 조회 (members 테이블 기준)
      const userIds = Array.from(new Set([
        ...comments.map((c: any) => c.user_id),
        ...comments.filter((c: any) => c.tag).map((c: any) => c.tag),
      ]));

      let userMap: Record<string, any> = {};
      if (userIds.length > 0) {
        const { data: members, error: membersErr } = await supabase
          .from("members")
          .select("id, name, profile_image, member_code")
          .in("id", userIds);

        if (membersErr) throw membersErr;

        for (const m of members || []) {
          userMap[m.id] = {
            id: m.id,
            name: m.name,
            profile_image: m.profile_image,
            member_code: m.member_code,
          };
        }
      }

      // 태그된 사용자가 파트너인 경우 파트너 정보도 조회
      const taggedUserIds = comments.filter((c: any) => c.tag).map((c: any) => c.tag);
      let partnerMap: Record<string, any> = {};
      if (taggedUserIds.length > 0) {
        const { data: partners, error: partnersErr } = await supabase
          .from("partners")
          .select("id, member_id, partner_name")
          .in("member_id", taggedUserIds)
          .eq("partner_status", "approved");

        if (!partnersErr && partners) {
          for (const p of partners) {
            partnerMap[p.member_id] = {
              partner_id: p.id,
              partner_name: p.partner_name,
            };
          }
        }
      }

      const commentsWithUser = comments.map((c: any) => ({
        ...c,
        user: userMap[c.user_id] || null,
        tagged_user: c.tag ? {
          ...userMap[c.tag],
          ...(partnerMap[c.tag] || {}),
        } : null,
      }));

      const parentComments = commentsWithUser.filter((c: any) => !c.parent_id);
      const replyComments = commentsWithUser.filter((c: any) => c.parent_id);

      const nested = parentComments.map((parent: any) => {
        const children = replyComments
          .filter((r: any) => r.parent_id === parent.id)
          .sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0));

        return { ...parent, replies: children };
      });

      return new Response(
        JSON.stringify({ success: true, data: nested }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      );
    }

    // ======================================================
    // DELETE → 댓글 삭제
    // ======================================================
    if (req.method === "DELETE") {
      if (!comment_id) {
        return new Response(
          JSON.stringify({ success: false, error: "comment_id required" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 400,
          },
        );
      }

      // 1) 댓글 조회
      const { data: comment, error: commentErr } = await supabase
        .from("comments")
        .select("id, post_id, user_id")
        .eq("id", comment_id)
        .single();

      if (commentErr || !comment) {
        return new Response(
          JSON.stringify({ success: false, error: "Comment not found" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 404,
          },
        );
      }

      // 2) 게시물 조회 → partner_id 얻기
      const { data: post, error: postErr } = await supabase
        .from("posts")
        .select("id, partner_id")
        .eq("id", comment.post_id)
        .single();

      if (postErr || !post) {
        return new Response(
          JSON.stringify({ success: false, error: "Post not found" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 404,
          },
        );
      }

      // 3) partners 테이블에서 게시글 작성자의 실제 user_id(member_id) 조회
      const { data: partner, error: partnerErr } = await supabase
        .from("partners")
        .select("id, member_id")
        .eq("id", post.partner_id)
        .single();

      if (partnerErr || !partner) {
        return new Response(
          JSON.stringify({ success: false, error: "Partner not found" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 404,
          },
        );
      }

      const isCommentOwner = user.id === comment.user_id;       // 댓글 작성자
      const isPostOwner = user.id === partner.member_id;        // 게시글 작성자

      if (!isCommentOwner && !isPostOwner) {
        return new Response(
          JSON.stringify({ success: false, error: "No permission to delete" }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 403,
          },
        );
      }

      // 4) 댓글 삭제
      const { error: deleteErr } = await supabase
        .from("comments")
        .delete()
        .eq("id", comment_id);

      if (deleteErr) throw deleteErr;

      await supabase.rpc("decrement_comment_count", {
        post_id_param: comment.post_id,
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    return new Response(
      JSON.stringify({ success: false, error: "Endpoint not found" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      },
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
