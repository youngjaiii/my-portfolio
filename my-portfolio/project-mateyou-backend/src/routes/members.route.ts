import { Router } from "express";
import {
  asyncHandler,
  createSupabaseClient,
  errorResponse,
  getAuthUser,
  successResponse
} from "../lib/utils";

const router = Router();

/**
 * @swagger
 * /api/members/search:
 *   get:
 *     summary: 멤버 검색
 *     tags: [Members]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: 검색어 (최소 2자)
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: 성공
 */
// GET /search - Search members
router.get(
  "/search",
  asyncHandler(async (req, res) => {
    const supabase = createSupabaseClient();
    const query = req.query.q as string;
    const page = parseInt((req.query.page as string) || "1");
    const limit = parseInt((req.query.limit as string) || "20");
    const offset = (page - 1) * limit;

    if (!query || query.length < 2) {
      return errorResponse(
        res,
        "INVALID_QUERY",
        "Search query must be at least 2 characters"
      );
    }

    const {
      data: members,
      error: searchError,
      count,
    } = await supabase
      .from("members")
      .select("id, member_code, name, profile_image, current_status", {
        count: "exact",
      })
      .or(`name.ilike.%${query}%,member_code.ilike.%${query}%`)
      .range(offset, offset + limit - 1);

    if (searchError) throw searchError;

    return successResponse(res, members || [], {
      total: count || 0,
      page,
      limit,
    });
  })
);

/**
 * @swagger
 * /api/members/points:
 *   get:
 *     summary: 현재 사용자의 포인트 조회
 *     tags: [Members]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 성공
 */
// GET /points - Get current user's points
router.get(
  "/points",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();

    const { data: memberData, error: memberError } = await supabase
      .from("members")
      .select("total_points")
      .eq("id", user.id)
      .single();

    if (memberError) {
      if (memberError.code === "PGRST116") {
        return errorResponse(res, "MEMBER_NOT_FOUND", "Member not found");
      }
      throw memberError;
    }

    return successResponse(res, { points: memberData.total_points || 0 });
  })
);

// POST /partner/unblock - Unblock a user (only for partners)
router.post(
  "/partner/unblock",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const body = req.body;

    if (!body || !body.partner_id) {
      return errorResponse(res, "INVALID_BODY", "Partner ID is required");
    }

    const { partner_id } = body;

    // Check if current user is a partner
    const { data: currentPartnerData, error: currentPartnerError } =
      await supabase
        .from("partners")
        .select("id, ben_lists")
        .eq("member_id", user.id)
        .single();

    if (currentPartnerError) {
      if (currentPartnerError.code === "PGRST116") {
        return errorResponse(
          res,
          "NOT_PARTNER",
          "Only partners can unblock users"
        );
      }
      throw currentPartnerError;
    }

    // Get current ben_lists
    let currentBlockedUsers: string[] = [];
    if (currentPartnerData.ben_lists) {
      if (Array.isArray(currentPartnerData.ben_lists)) {
        currentBlockedUsers = currentPartnerData.ben_lists;
      } else if (typeof currentPartnerData.ben_lists === "string") {
        try {
          currentBlockedUsers = JSON.parse(currentPartnerData.ben_lists);
        } catch (e) {
          currentBlockedUsers = [];
        }
      } else if (typeof currentPartnerData.ben_lists === "object") {
        currentBlockedUsers = Object.values(
          currentPartnerData.ben_lists as Record<string, string>
        );
      }
    }

    // Check if user is actually blocked
    if (!currentBlockedUsers.includes(partner_id)) {
      return errorResponse(res, "USER_NOT_BLOCKED", "User is not blocked");
    }

    // Remove from blocked list
    const updatedBlockedUsers = currentBlockedUsers.filter(
      (id) => id !== partner_id
    );

    // Update partner's ben_lists
    const { error: updateError } = await supabase
      .from("partners")
      .update({ ben_lists: updatedBlockedUsers })
      .eq("id", currentPartnerData.id);

    if (updateError) throw updateError;

    return successResponse(res, {
      message: "User unblocked successfully",
      unblocked_user_id: partner_id,
      total_blocked: updatedBlockedUsers.length,
    });
  })
);

// POST /partner/block - Block a user (only for partners)
router.post(
  "/partner/block",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const body = req.body;

    if (!body || !body.partner_id) {
      return errorResponse(res, "INVALID_BODY", "Partner ID is required");
    }

    const { partner_id } = body;

    // Check if current user is a partner
    const { data: currentPartnerData, error: currentPartnerError } =
      await supabase
        .from("partners")
        .select("id, ben_lists")
        .eq("member_id", user.id)
        .single();

    if (currentPartnerError) {
      if (currentPartnerError.code === "PGRST116") {
        return errorResponse(
          res,
          "NOT_PARTNER",
          "Only partners can block users"
        );
      }
      throw currentPartnerError;
    }

    // Verify the partner_id to block exists
    const { data: targetMember, error: targetMemberError } = await supabase
      .from("members")
      .select("id")
      .eq("id", partner_id)
      .single();

    if (targetMemberError) {
      if (targetMemberError.code === "PGRST116") {
        return errorResponse(res, "USER_NOT_FOUND", "User to block not found");
      }
      throw targetMemberError;
    }

    // Cannot block yourself
    if (partner_id === user.id) {
      return errorResponse(
        res,
        "SELF_BLOCK_NOT_ALLOWED",
        "Cannot block yourself"
      );
    }

    // Get current ben_lists
    let currentBlockedUsers: string[] = [];
    if (currentPartnerData.ben_lists) {
      if (Array.isArray(currentPartnerData.ben_lists)) {
        currentBlockedUsers = currentPartnerData.ben_lists;
      } else if (typeof currentPartnerData.ben_lists === "string") {
        try {
          currentBlockedUsers = JSON.parse(currentPartnerData.ben_lists);
        } catch (e) {
          currentBlockedUsers = [];
        }
      } else if (typeof currentPartnerData.ben_lists === "object") {
        currentBlockedUsers = Object.values(
          currentPartnerData.ben_lists as Record<string, string>
        );
      }
    }

    // Check if user is already blocked
    if (currentBlockedUsers.includes(partner_id)) {
      return errorResponse(res, "ALREADY_BLOCKED", "User is already blocked");
    }

    // Add to blocked list
    const updatedBlockedUsers = [...currentBlockedUsers, partner_id];

    // Update partner's ben_lists
    const { error: updateError } = await supabase
      .from("partners")
      .update({ ben_lists: updatedBlockedUsers })
      .eq("id", currentPartnerData.id);

    if (updateError) throw updateError;

    return successResponse(res, {
      message: "User blocked successfully",
      blocked_user_id: partner_id,
      total_blocked: updatedBlockedUsers.length,
    });
  })
);

// GET /partner/blocked-users - Get blocked users for current partner
router.get(
  "/partner/blocked-users",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();

    // Check if user is a partner
    const { data: partnerData, error: partnerError } = await supabase
      .from("partners")
      .select("id, ben_lists")
      .eq("member_id", user.id)
      .single();

    if (partnerError) {
      if (partnerError.code === "PGRST116") {
        // User is not a partner, return empty array
        return successResponse(res, []);
      }
      throw partnerError;
    }

    console.log("Partner data:", partnerData);
    console.log("ben_lists type:", typeof partnerData.ben_lists);
    console.log("ben_lists value:", partnerData.ben_lists);

    // ben_lists에서 차단된 사용자 ID 배열 가져오기
    let blockedUserIds: string[] = [];

    // ben_lists가 배열인지 확인하고 처리
    if (partnerData.ben_lists) {
      if (Array.isArray(partnerData.ben_lists)) {
        blockedUserIds = partnerData.ben_lists;
      } else if (typeof partnerData.ben_lists === "string") {
        // JSON 문자열인 경우 파싱
        try {
          blockedUserIds = JSON.parse(partnerData.ben_lists);
        } catch (e) {
          console.error("Failed to parse ben_lists as JSON:", e);
          blockedUserIds = [];
        }
      } else if (typeof partnerData.ben_lists === "object") {
        // 객체인 경우 값들을 배열로 변환
        try {
          blockedUserIds = Object.values(
            partnerData.ben_lists as Record<string, string>
          );
        } catch (e) {
          console.error("Failed to get values from ben_lists object:", e);
          blockedUserIds = [];
        }
      }
    }

    console.log("Processed blockedUserIds:", blockedUserIds);

    // 배열이 아니거나 빈 배열인 경우
    if (!Array.isArray(blockedUserIds) || blockedUserIds.length === 0) {
      return successResponse(res, []);
    }

    // 차단된 사용자들의 정보 가져오기
    const { data: blockedUsers, error: blockedError } = await supabase
      .from("members")
      .select("id, name, profile_image, member_code")
      .in("id", blockedUserIds);

    if (blockedError) throw blockedError;

    // 응답 형식을 맞춤 (blocked_users 테이블 형식과 호환)
    const formattedBlockedUsers = (blockedUsers || []).map((user) => ({
      id: `blocked_${user.id}`, // 임시 ID
      blocked_user_id: user.id,
      created_at: new Date().toISOString(), // 임시 생성일
      members: {
        id: user.id,
        name: user.name,
        profile_image: user.profile_image,
      },
    }));

    return successResponse(res, formattedBlockedUsers);
  })
);

// GET /member/:memberId - Get member details
router.get(
  "/member/:memberId",
  asyncHandler(async (req, res) => {
    const supabase = createSupabaseClient();
    const memberId = req.params.memberId;

    if (!memberId) {
      return errorResponse(res, "INVALID_MEMBER_ID", "Member ID is required");
    }

    const { data: member, error: memberError } = await supabase
      .from("members")
      .select(
        "id, member_code, name, profile_image, favorite_game, current_status, created_at"
      )
      .eq("id", memberId)
      .single();

    if (memberError) {
      if (memberError.code === "PGRST116") {
        return errorResponse(res, "MEMBER_NOT_FOUND", "Member not found");
      }
      throw memberError;
    }

    return successResponse(res, member);
  })
);

/**
 * @swagger
 * /api/members/by-code/{memberCode}:
 *   get:
 *     summary: 멤버 코드로 멤버 조회
 *     description: 멤버 코드를 사용하여 멤버 정보를 조회합니다. 인증이 필요하지 않은 공개 엔드포인트입니다.
 *     tags: [Members]
 *     parameters:
 *       - in: path
 *         name: memberCode
 *         required: true
 *         schema:
 *           type: string
 *         description: 조회할 멤버 코드
 *         example: "USER123456"
 *     responses:
 *       200:
 *         description: 성공적으로 멤버 정보를 조회했습니다.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   description: 멤버 정보
 *                   properties:
 *                     id:
 *                       type: string
 *                       description: 멤버 UUID
 *                     member_code:
 *                       type: string
 *                       description: 멤버 코드
 *                     name:
 *                       type: string
 *                       description: 멤버 이름
 *                     profile_image:
 *                       type: string
 *                       nullable: true
 *                       description: 프로필 이미지 URL
 *                     favorite_game:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: 선호 게임 목록
 *                     current_status:
 *                       type: string
 *                       enum: [online, offline, away, busy]
 *                       description: 현재 상태
 *                     total_points:
 *                       type: integer
 *                       description: 보유 포인트
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       description: 생성일시
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                       description: 수정일시
 *       400:
 *         description: 잘못된 요청 (멤버 코드가 제공되지 않음)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "INVALID_MEMBER_CODE"
 *                     message:
 *                       type: string
 *                       example: "Member code is required"
 *       404:
 *         description: 멤버를 찾을 수 없음
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "MEMBER_NOT_FOUND"
 *                     message:
 *                       type: string
 *                       example: "Member not found"
 *       500:
 *         description: 서버 오류
 */
// GET /by-code/:memberCode - Get member by member_code
router.get(
  "/by-code/:memberCode",
  asyncHandler(async (req, res) => {
    const supabase = createSupabaseClient();
    const memberCode = req.params.memberCode;

    if (!memberCode) {
      return errorResponse(res, "INVALID_MEMBER_CODE", "Member code is required");
    }

    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("*")
      .eq("member_code", memberCode)
      .maybeSingle();

    if (memberError) {
      throw memberError;
    }

    if (!member) {
      return errorResponse(res, "MEMBER_NOT_FOUND", "Member not found");
    }

    return successResponse(res, member);
  })
);

/**
 * @swagger
 * /api/members/requests:
 *   get:
 *     summary: 파트너 요청 목록 조회 (클라이언트 또는 파트너)
 *     tags: [Members]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, in_progress, completed, cancelled]
 *       - in: query
 *         name: as
 *         schema:
 *           type: string
 *           enum: [client, partner]
 *         description: 클라이언트 또는 파트너 역할로 조회
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: 성공
 */
// GET /requests - Get user's partner requests (as client or partner)
router.get(
  "/requests",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const status = req.query.status as string | undefined;
    const asRole = req.query.as as "client" | "partner" | undefined;
    const limit = parseInt((req.query.limit as string) || "20");
    const offset = parseInt((req.query.offset as string) || "0");

    let query = supabase
      .from("partner_requests")
      .select(
        `
        *,
        client:members!client_id(id, name, profile_image),
        partner:partners!partner_id(id, partner_name, member:members!member_id(id, name, profile_image))
      `,
        { count: "exact" }
      );

    // Filter by role
    if (asRole === "client") {
      query = query.eq("client_id", user.id);
    } else if (asRole === "partner") {
      // Get user's partner ID first
      const { data: partnerData } = await supabase
        .from("partners")
        .select("id")
        .eq("member_id", user.id)
        .maybeSingle();

      if (!partnerData) {
        return successResponse(res, [], {
          total: 0,
          limit,
          offset,
        });
      }

      query = query.eq("partner_id", partnerData.id);
    } else {
      // Get both (client or partner)
      const { data: partnerData } = await supabase
        .from("partners")
        .select("id")
        .eq("member_id", user.id)
        .maybeSingle();

      if (partnerData) {
        query = query.or(`client_id.eq.${user.id},partner_id.eq.${partnerData.id}`);
      } else {
        query = query.eq("client_id", user.id);
      }
    }

    if (status) {
      query = query.eq("status", status);
    }

    const { data: requests, error: requestsError, count } = await query
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (requestsError) throw requestsError;

    return successResponse(res, requests || [], {
      total: count || 0,
      limit,
      offset,
    });
  })
);

/**
 * @swagger
 * /api/members/requests/{requestId}:
 *   get:
 *     summary: 특정 파트너 요청 조회
 *     tags: [Members]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: requestId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 성공
 *       403:
 *         description: 접근 권한 없음
 *       404:
 *         description: 요청을 찾을 수 없음
 */
// GET /requests/:requestId - Get specific partner request
router.get(
  "/requests/:requestId",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const requestId = req.params.requestId;

    if (!requestId) {
      return errorResponse(res, "INVALID_REQUEST_ID", "Request ID is required");
    }

    const { data: request, error: requestError } = await supabase
      .from("partner_requests")
      .select(
        `
        *,
        client:members!client_id(id, name, profile_image, member_code),
        partner:partners!partner_id(id, partner_name, member:members!member_id(id, name, profile_image, member_code))
      `
      )
      .eq("id", requestId)
      .single();

    if (requestError) {
      if (requestError.code === "PGRST116") {
        return errorResponse(res, "REQUEST_NOT_FOUND", "Request not found");
      }
      throw requestError;
    }

    // Verify user has access to this request
    const { data: partnerData } = await supabase
      .from("partners")
      .select("id")
      .eq("member_id", user.id)
      .maybeSingle();

    const isClient = request.client_id === user.id;
    const isPartner = partnerData && request.partner_id === partnerData.id;

    if (!isClient && !isPartner) {
      return errorResponse(
        res,
        "UNAUTHORIZED",
        "You do not have access to this request",
        null,
        403
      );
    }

    return successResponse(res, request);
  })
);

// POST /chat/send - Send chat message
router.post(
  "/chat/send",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const body = req.body;

    if (!body || !body.receiver_id || !body.message) {
      return errorResponse(
        res,
        "INVALID_BODY",
        "Receiver ID and message are required"
      );
    }

    const { receiver_id, message } = body;

    // Validate message
    if (!message.trim()) {
      return errorResponse(res, "EMPTY_MESSAGE", "Message cannot be empty");
    }

    if (message.trim().length > 1000) {
      return errorResponse(
        res,
        "MESSAGE_TOO_LONG",
        "Message cannot exceed 1000 characters"
      );
    }

    // Check for prohibited words
    const prohibitedWord = findProhibitedWord(message.trim());
    if (prohibitedWord) {
      return errorResponse(
        res,
        "PROHIBITED_CONTENT",
        `Message contains prohibited word: ${prohibitedWord}`
      );
    }

    // Verify receiver exists
    const { data: receiver, error: receiverError } = await supabase
      .from("members")
      .select("id")
      .eq("id", receiver_id)
      .single();

    if (receiverError) {
      if (receiverError.code === "PGRST116") {
        return errorResponse(res, "RECEIVER_NOT_FOUND", "Receiver not found");
      }
      throw receiverError;
    }

    // Check if receiver is a partner and has blocked the sender
    const { data: receiverPartnerData, error: receiverPartnerError } =
      await supabase
        .from("partners")
        .select("ben_lists")
        .eq("member_id", receiver_id)
        .single();

    if (!receiverPartnerError && receiverPartnerData?.ben_lists) {
      let blockedUserIds: string[] = [];

      if (Array.isArray(receiverPartnerData.ben_lists)) {
        blockedUserIds = receiverPartnerData.ben_lists;
      } else if (typeof receiverPartnerData.ben_lists === "string") {
        try {
          blockedUserIds = JSON.parse(receiverPartnerData.ben_lists);
        } catch (e) {
          blockedUserIds = [];
        }
      } else if (typeof receiverPartnerData.ben_lists === "object") {
        blockedUserIds = Object.values(
          receiverPartnerData.ben_lists as Record<string, string>
        );
      }

      // If sender is blocked by receiver, deny sending message
      if (blockedUserIds.includes(user.id)) {
        return errorResponse(
          res,
          "USER_BLOCKED",
          "You have been blocked by this user and cannot send messages"
        );
      }
    }

    // Insert message
    const { data: newMessage, error: insertError } = await supabase
      .from("member_chats")
      .insert({
        sender_id: user.id,
        receiver_id: receiver_id,
        message: message.trim(),
      })
      .select(
        `
        *,
        sender:members!sender_id(*),
        receiver:members!receiver_id(*)
      `
      )
      .single();

    if (insertError) throw insertError;

    // Remove sensitive sender and receiver information from response
    const { sender: _sender, receiver: _receiver, ...messageWithoutSensitiveData } = newMessage;

    return successResponse(res, {
      message: messageWithoutSensitiveData,
      success: true,
    });
  })
);

// GET /chat/messages - Get chat messages between two users
router.get(
  "/chat/messages",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const partnerId = req.query.partner_id as string;
    const page = parseInt((req.query.page as string) || "1");
    const limit = parseInt((req.query.limit as string) || "50");
    const offset = (page - 1) * limit;

    if (!partnerId) {
      return errorResponse(
        res,
        "INVALID_PARTNER_ID",
        "Partner ID is required"
      );
    }

    const {
      data: messages,
      error: messagesError,
      count,
    } = await supabase
      .from("member_chats")
      .select(
        `
        *,
        sender:members!sender_id(id, name, profile_image),
        receiver:members!receiver_id(id, name, profile_image)
      `,
        { count: "exact" }
      )
      .or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${user.id})`
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (messagesError) throw messagesError;

    // Reverse to get chronological order
    const sortedMessages = (messages || []).reverse();

    return successResponse(res, sortedMessages, {
      total: count || 0,
      page,
      limit,
    });
  })
);

// PUT /chat/mark-read - Mark messages as read
router.put(
  "/chat/mark-read",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const body = req.body;

    if (!body || !body.sender_id) {
      return errorResponse(res, "INVALID_BODY", "Sender ID is required");
    }

    const { sender_id } = body;

    const { data: updatedMessages, error: updateError } = await supabase
      .from("member_chats")
      .update({ is_read: true })
      .eq("sender_id", sender_id)
      .eq("receiver_id", user.id)
      .eq("is_read", false)
      .select("id");

    if (updateError) throw updateError;

    return successResponse(res, {
      success: true,
      updatedCount: updatedMessages?.length || 0,
    });
  })
);

// GET /chat/rooms - Get chat rooms (conversations)
router.get(
  "/chat/rooms",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();

    // Get blocked user IDs if current user is a partner
    let blockedUserIds: string[] = [];
    const { data: partnerData, error: partnerError } = await supabase
      .from("partners")
      .select("ben_lists")
      .eq("member_id", user.id)
      .single();

    if (!partnerError && partnerData?.ben_lists) {
      if (Array.isArray(partnerData.ben_lists)) {
        blockedUserIds = partnerData.ben_lists;
      } else if (typeof partnerData.ben_lists === "string") {
        try {
          blockedUserIds = JSON.parse(partnerData.ben_lists);
        } catch (e) {
          blockedUserIds = [];
        }
      } else if (typeof partnerData.ben_lists === "object") {
        blockedUserIds = Object.values(
          partnerData.ben_lists as Record<string, string>
        );
      }
    }

    // Get all conversations where user is involved
    const { data: conversations, error: conversationsError } = await supabase
      .from("member_chats")
      .select(
        `
        sender_id, receiver_id, created_at, message, is_read,
        sender:members!sender_id(id, member_code, name, profile_image, current_status),
        receiver:members!receiver_id(id, member_code, name, profile_image, current_status)
      `
      )
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order("created_at", { ascending: false });

    if (conversationsError) throw conversationsError;

    // Group conversations by partner
    const roomsMap = new Map();

    conversations?.forEach((conv: any) => {
      const isUserSender = conv.sender_id === user.id;
      const partner = isUserSender ? conv.receiver : conv.sender;
      const partnerId = partner.id;

      // Skip blocked users from chat rooms list
      if (blockedUserIds.includes(partnerId)) {
        return;
      }

      if (!roomsMap.has(partnerId)) {
        roomsMap.set(partnerId, {
          partnerId: partnerId,
          partnerName: partner.name,
          partnerAvatar: partner.profile_image,
          partnerMemberCode: partner.member_code,
          partnerStatus: partner.current_status,
          lastMessage: conv.message,
          lastMessageTime: conv.created_at,
          unreadCount: 0,
          messages: [],
        });
      }

      const room = roomsMap.get(partnerId);

      // Update last message if this message is newer
      if (new Date(conv.created_at) > new Date(room.lastMessageTime)) {
        room.lastMessage = conv.message;
        room.lastMessageTime = conv.created_at;
      }

      // Count unread messages
      if (!isUserSender && !conv.is_read) {
        room.unreadCount++;
      }
    });

    // Convert map to array and sort by last message time
    const rooms = Array.from(roomsMap.values()).sort(
      (a, b) =>
        new Date(b.lastMessageTime).getTime() -
        new Date(a.lastMessageTime).getTime()
    );

    return successResponse(res, rooms);
  })
);

// GET /recent-partners - Get recent partners
router.get(
  "/recent-partners",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const limit = parseInt((req.query.limit as string) || "6");

    // Get recent chat partners
    const { data: recentChats, error: chatsError } = await supabase
      .from("member_chats")
      .select(
        `
        sender_id, receiver_id, created_at,
        sender:members!sender_id(id, member_code, name, profile_image, current_status),
        receiver:members!receiver_id(id, member_code, name, profile_image, current_status)
      `
      )
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(50); // Get more to ensure we have enough unique partners

    if (chatsError) throw chatsError;

    // Extract unique partners
    const partnersMap = new Map();

    recentChats?.forEach((chat: any) => {
      const isUserSender = chat.sender_id === user.id;
      const partner = isUserSender ? chat.receiver : chat.sender;

      if (partner.id !== user.id && !partnersMap.has(partner.id)) {
        partnersMap.set(partner.id, {
          id: partner.id,
          member_code: partner.member_code,
          name: partner.name,
          profile_image: partner.profile_image,
          current_status: partner.current_status,
          last_chat_at: chat.created_at,
        });
      }
    });

    // Convert to array and limit
    const recentPartners = Array.from(partnersMap.values()).slice(0, limit);

    return successResponse(res, recentPartners);
  })
);

// GET /partner/lookup/:memberId - Get partner ID by member ID
router.get(
  "/partner/lookup/:memberId",
  asyncHandler(async (req, res) => {
    const supabase = createSupabaseClient();
    const memberId = req.params.memberId;

    if (!memberId) {
      return errorResponse(res, "INVALID_MEMBER_ID", "Member ID is required");
    }

    const { data: partnerData, error: partnerError } = await supabase
      .from("partners")
      .select("id")
      .eq("member_id", memberId)
      .single();

    if (partnerError) {
      if (partnerError.code === "PGRST116") {
        return errorResponse(
          res,
          "PARTNER_NOT_FOUND",
          "Partner not found for this member"
        );
      }
      throw partnerError;
    }

    return successResponse(res, { partner_id: partnerData.id });
  })
);

/**
 * @swagger
 * /api/members/partner/request:
 *   post:
 *     summary: 파트너 의뢰 생성
 *     tags: [Members]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - partner_id
 *               - job_id
 *               - job_name
 *               - job_count
 *               - coins_per_job
 *             properties:
 *               partner_id:
 *                 type: string
 *               job_id:
 *                 type: string
 *               job_name:
 *                 type: string
 *               job_count:
 *                 type: integer
 *               coins_per_job:
 *                 type: integer
 *               note:
 *                 type: string
 *     responses:
 *       200:
 *         description: 성공
 */
// POST /partner/request - Create partner request
router.post(
  "/partner/request",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const body = req.body;

    if (
      !body ||
      !body.partner_id ||
      !body.job_id ||
      !body.job_name ||
      !body.job_count ||
      !body.coins_per_job
    ) {
      return errorResponse(
        res,
        "INVALID_BODY",
        "Partner ID, job ID, job name, job count, and coins per job are required"
      );
    }

    const { partner_id, job_id, job_name, job_count, coins_per_job, note } =
      body;
    const totalCost = job_count * coins_per_job;

    // Check if user has enough points
    const { data: memberData, error: memberError } = await supabase
      .from("members")
      .select("total_points")
      .eq("id", user.id)
      .single();

    if (memberError) {
      if (memberError.code === "PGRST116") {
        return errorResponse(res, "MEMBER_NOT_FOUND", "Member not found");
      }
      throw memberError;
    }

    if ((memberData.total_points || 0) < totalCost) {
      return errorResponse(
        res,
        "INSUFFICIENT_POINTS",
        `Insufficient points. Required: ${totalCost}, Available: ${memberData.total_points || 0}`
      );
    }

    // Verify partner exists and check if user is blocked
    const { data: partnerData, error: partnerError } = await supabase
      .from("partners")
      .select("id, member_id, ben_lists")
      .eq("id", partner_id)
      .single();

    if (partnerError) {
      if (partnerError.code === "PGRST116") {
        return errorResponse(res, "PARTNER_NOT_FOUND", "Partner not found");
      }
      throw partnerError;
    }

    // Check if user is trying to request themselves
    if (partnerData.member_id === user.id) {
      return errorResponse(
        res,
        "SELF_REQUEST_NOT_ALLOWED",
        "Cannot request yourself as partner"
      );
    }

    // Check if user is blocked by partner
    if (partnerData.ben_lists) {
      let blockedUserIds: string[] = [];

      if (Array.isArray(partnerData.ben_lists)) {
        blockedUserIds = partnerData.ben_lists;
      } else if (typeof partnerData.ben_lists === "string") {
        try {
          blockedUserIds = JSON.parse(partnerData.ben_lists);
        } catch (e) {
          blockedUserIds = [];
        }
      } else if (typeof partnerData.ben_lists === "object") {
        blockedUserIds = Object.values(
          partnerData.ben_lists as Record<string, string>
        );
      }

      // If user is blocked by partner, deny request
      if (blockedUserIds.includes(user.id)) {
        return errorResponse(
          res,
          "USER_BLOCKED",
          "You have been blocked by this partner and cannot send requests"
        );
      }
    }

    // Create request
    const { data: newRequest, error: requestError } = await supabase
      .from("partner_requests")
      .insert({
        client_id: user.id,
        partner_id: partner_id,
        partner_job_id: job_id,
        request_type: job_name,
        job_count: job_count,
        coins_per_job: coins_per_job,
        note: note || null,
        status: "pending",
      })
      .select("*")
      .single();

    if (requestError) throw requestError;

    // Deduct points from user using RPC (ensures transaction safety and consistent logging)
    const { data: pointsResult, error: pointsDeductionError } = await supabase.rpc(
      "update_member_points_with_log",
      {
        p_member_id: user.id,
        p_type: "spend",
        p_amount: totalCost,
        p_description: `${job_name} ${job_count}회 의뢰`,
        p_log_id: newRequest.id,
      }
    );

    if (pointsDeductionError) {
      // If points deduction fails, delete the request to maintain consistency
      await supabase.from("partner_requests").delete().eq("id", newRequest.id);
      throw pointsDeductionError;
    }

    // Send push notification to partner
    try {
      const { data: clientInfo, error: clientError } = await supabase
        .from("members")
        .select("name")
        .eq("id", user.id)
        .single();

      const clientName = clientInfo?.name || "클라이언트";

      // TODO: Replace with internal service call for push notifications
      // const pushResponse = await fetch(`${process.env.SUPABASE_URL}/functions/v1/send-push`, {
      //   method: 'POST',
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'Authorization': req.headers.authorization || '',
      //     'apikey': process.env.SUPABASE_ANON_KEY || '',
      //   },
      //   body: JSON.stringify({
      //     user_id: partnerData.member_id,
      //     title: `새로운 의뢰 요청!`,
      //     body: `${clientName}님이 ${job_name} ${job_count}회 의뢰를 요청했습니다. (${totalCost} 코인)`,
      //     notification_type: 'request',
      //     url: `/partner/dashboard?tab=requests`,
      //     tag: `new-request-${newRequest.id}`,
      //     data: {
      //       request_id: newRequest.id,
      //       client_name: clientName,
      //       job_name: job_name,
      //       job_count: job_count,
      //       total_cost: totalCost
      //     }
      //   }),
      // });

      console.log("Push notification would be sent to partner");
    } catch (pushError) {
      console.error("Partner notification error:", pushError);
      // Push notification failure should not affect request creation
    }

    return successResponse(res, {
      request: newRequest,
      newTotalPoints: pointsResult?.new_total_points || memberData.total_points - totalCost,
      message: "Partner request created successfully",
    });
  })
);

// GET /points/logs - Get points history
router.get(
  "/points/logs",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const limit = parseInt((req.query.limit as string) || "50");
    const offset = parseInt((req.query.offset as string) || "0");

    // Get points logs from member_points_logs table
    const { data: pointsLogs, error: logsError } = await supabase
      .from("member_points_logs")
      .select("*")
      .eq("member_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (logsError) throw logsError;

    // Transform data to match the expected format
    const transformedLogs = (pointsLogs || []).map((log: any) => ({
      id: log.id,
      member_id: log.member_id,
      type: log.type,
      amount: log.amount,
      description: log.description,
      log_id: log.log_id,
      created_at: log.created_at,
    }));

    return successResponse(res, {
      logs: transformedLogs,
      total: transformedLogs.length,
      hasMore: transformedLogs.length === limit,
    });
  })
);

/**
 * @swagger
 * /api/members/donation:
 *   post:
 *     summary: 파트너에게 후원하기
 *     tags: [Members]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - partner_id
 *               - amount
 *               - description
 *             properties:
 *               partner_id:
 *                 type: string
 *                 format: uuid
 *                 description: 파트너 ID
 *               amount:
 *                 type: integer
 *                 description: 후원할 포인트 금액
 *               description:
 *                 type: string
 *                 description: 후원 설명
 *               log_id:
 *                 type: string
 *                 description: 로그 ID (선택적)
 *               donation_type:
 *                 type: string
 *                 enum: [basic, mission, video]
 *                 default: basic
 *                 description: 후원 타입 (basic: 일반 후원, mission: 미션 후원, video: 영상 후원)
 *     responses:
 *       200:
 *         description: 성공
 *       400:
 *         description: 잘못된 요청
 */
// POST /donation - Donate points to partner
router.post(
  "/donation",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const body = req.body;

    if (!body || !body.partner_id || !body.amount || !body.description) {
      return errorResponse(
        res,
        "INVALID_BODY",
        "Partner ID, amount, and description are required"
      );
    }

    const { partner_id, amount, description, log_id, donation_type } = body;

    // Validate amount
    const donationAmount = Math.abs(parseInt(amount.toString()));
    if (isNaN(donationAmount) || donationAmount <= 0) {
      return errorResponse(
        res,
        "INVALID_AMOUNT",
        "Amount must be a positive number"
      );
    }

    // Validate donation_type if provided
    const validDonationTypes = ['basic', 'mission', 'video'];
    const donationType = donation_type && validDonationTypes.includes(donation_type) 
      ? donation_type 
      : 'basic';

    // Verify partner exists
    const { data: partnerData, error: partnerError } = await supabase
      .from("partners")
      .select("id")
      .eq("id", partner_id)
      .single();

    if (partnerError) {
      if (partnerError.code === "PGRST116") {
        return errorResponse(res, "PARTNER_NOT_FOUND", "Partner not found");
      }
      throw partnerError;
    }

    // Process donation using transaction function
    const { data: result, error: transactionError } = await supabase.rpc(
      "process_donation",
      {
        p_donor_id: user.id,
        p_partner_id: partner_id,
        p_amount: donationAmount,
        p_description: description.trim(),
        p_log_id: log_id || null,
        p_donation_type: donationType,
      }
    );

    if (transactionError) {
      throw transactionError;
    }

    // Check if the function returned an error
    if (!result || result.success === false) {
      return errorResponse(
        res,
        result?.error_code || "DONATION_FAILED",
        result?.error_message || "Donation processing failed"
      );
    }

    return successResponse(res, {
      member_new_points: result.member_new_points,
      partner_new_points: result.partner_new_points,
      amount: result.amount,
      log_id: result.log_id,
      is_mission: result.is_mission,
      message: "Donation processed successfully",
    });
  })
);

// POST /points/log - Add points log entry
router.post(
  "/points/log",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const body = req.body;

    if (!body || !body.type || !body.amount || !body.description) {
      return errorResponse(
        res,
        "INVALID_BODY",
        "Type, amount, and description are required"
      );
    }

    const { type, amount, description, log_id } = body;

    // Use transaction to ensure atomicity
    const { data: result, error: transactionError } = await supabase.rpc(
      "update_member_points_with_log",
      {
        p_member_id: user.id,
        p_type: type,
        p_amount: Math.abs(amount),
        p_description: description.trim(),
        p_log_id: log_id || null,
      }
    );

    if (transactionError) throw transactionError;

    return successResponse(res, {
      log: result.log,
      newTotalPoints: result.new_total_points,
      message: "Points logged successfully",
    });
  })
);

// Helper function to find prohibited words
function findProhibitedWord(message: string): string | null {
  const prohibitedWords = [
    "씨발",
    "개새끼",
    "병신",
    "멍청이",
    "바보",
    "시발",
    "좆",
    "존나",
    "개놈",
    "년놈",
    "미친놈",
    "또라이",
  ];

  const lowerMessage = message.toLowerCase();

  for (const word of prohibitedWords) {
    if (lowerMessage.includes(word)) {
      return word;
    }
  }

  return null;
}

export default router;
