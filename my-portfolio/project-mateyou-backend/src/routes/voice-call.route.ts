import { Router } from "express";
import {
  createSupabaseClient,
  successResponse,
  errorResponse,
  getAuthUser,
  asyncHandler,
} from "../lib/utils";

const router = Router();

/**
 * @swagger
 * /api/voice-call/start:
 *   post:
 *     summary: 음성 통화 시작
 *     tags: [Voice Call]
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
 *               - partner_name
 *             properties:
 *               partner_id:
 *                 type: string
 *                 description: 파트너 멤버 ID
 *               partner_name:
 *                 type: string
 *                 description: 파트너 이름
 *               call_id:
 *                 type: string
 *               device_info:
 *                 type: object
 *                 properties:
 *                   os:
 *                     type: string
 *                   browser:
 *                     type: string
 *     responses:
 *       200:
 *         description: 성공
 */
// POST /start - Start a voice call
router.post(
  "/start",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const body = req.body;

    if (!body || !body.partner_id || !body.partner_name) {
      return errorResponse(
        res,
        "INVALID_BODY",
        "Partner ID and name are required"
      );
    }

    const { partner_id: targetMemberId, partner_name, call_id } = body;

    // Get caller's member info
    const { data: memberData, error: memberError } = await supabase
      .from("members")
      .select("name")
      .eq("id", user.id)
      .single();

    const callerName = memberData?.name || "사용자";

    // Check if caller is partner or client
    const { data: callerPartnerData } = await supabase
      .from("partners")
      .select("id")
      .eq("member_id", user.id)
      .maybeSingle();

    const { data: targetPartnerData } = await supabase
      .from("partners")
      .select("id")
      .eq("member_id", targetMemberId)
      .maybeSingle();

    // Set partner_id and member_id based on call_rooms table structure
    // partner_id: 파트너의 members.id (not partners.id)
    // member_id: 클라이언트의 members.id
    let finalPartnerId = null;
    let finalMemberId = null;

    if (callerPartnerData) {
      // Caller is a partner
      finalPartnerId = user.id; // 파트너의 member_id
      finalMemberId = targetMemberId; // Target is client
    } else if (targetPartnerData) {
      // Target is a partner
      finalPartnerId = targetMemberId; // 파트너의 member_id
      finalMemberId = user.id; // Caller is client
    }

    // Generate room code
    const roomCode = `call_${user.id}_${targetMemberId}_${Date.now()}`;

    // Create call room
    const { data: callRoom, error: roomError } = await supabase
      .from("call_rooms")
      .insert({
        room_code: roomCode,
        status: "waiting",
        member_id: finalMemberId,
        partner_id: finalPartnerId,
        topic: `${callerName}님과의 음성 통화`,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (roomError) throw roomError;

    // Add caller as participant
    const callerParticipant: any = {
      room_id: callRoom.id,
      partner_id: callRoom.partner_id,
      member_id: callRoom.member_id,
      joined_at: new Date().toISOString(),
      device_info: {
        os: body.device_info?.os || "Unknown",
        browser: body.device_info?.browser || "Unknown",
        timestamp: new Date().toISOString(),
      },
      connection_quality: "good",
    };

    if (callerPartnerData) {
      // Caller is a partner
      callerParticipant.actual_partner_id = callerPartnerData.id;
      callerParticipant.actual_member_id = null;
      callerParticipant.participant_type = "partner";
    } else {
      // Caller is a client
      callerParticipant.actual_member_id = user.id;
      callerParticipant.actual_partner_id = null;
      callerParticipant.participant_type = "member";
    }

    const { error: participantError } = await supabase
      .from("call_participants")
      .insert(callerParticipant);

    if (participantError) throw participantError;

    return successResponse(res, {
      room: callRoom,
      message: "Call started successfully",
    });
  })
);

/**
 * @swagger
 * /api/voice-call/join:
 *   post:
 *     summary: 기존 통화 참여
 *     tags: [Voice Call]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - room_id
 *             properties:
 *               room_id:
 *                 type: string
 *               device_info:
 *                 type: object
 *     responses:
 *       200:
 *         description: 성공
 */
// POST /join - Join an existing call
router.post(
  "/join",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const body = req.body;

    if (!body || !body.room_id) {
      return errorResponse(res, "INVALID_BODY", "Room ID is required");
    }

    const { room_id } = body;

    // Check if room exists and is active
    const { data: room, error: roomError } = await supabase
      .from("call_rooms")
      .select("*")
      .eq("id", room_id)
      .eq("status", "waiting")
      .single();

    if (roomError) {
      if (roomError.code === "PGRST116") {
        return errorResponse(
          res,
          "ROOM_NOT_FOUND",
          "Call room not found or already in progress"
        );
      }
      throw roomError;
    }

    // Update room status to in_call
    const { error: updateError } = await supabase
      .from("call_rooms")
      .update({
        status: "in_call",
        started_at: new Date().toISOString(),
      })
      .eq("id", room_id);

    if (updateError) throw updateError;

    // Check if joining user is partner or client
    const { data: joinPartnerData } = await supabase
      .from("partners")
      .select("id")
      .eq("member_id", user.id)
      .single();

    const joinParticipant: any = {
      room_id: room_id,
      partner_id: room.partner_id,
      member_id: room.member_id,
      joined_at: new Date().toISOString(),
      device_info: {
        os: body.device_info?.os || "Unknown",
        browser: body.device_info?.browser || "Unknown",
        timestamp: new Date().toISOString(),
      },
      connection_quality: "good",
    };

    if (joinPartnerData) {
      // Joining user is a partner
      joinParticipant.actual_partner_id = joinPartnerData.id;
      joinParticipant.actual_member_id = null;
      joinParticipant.participant_type = "partner";
    } else {
      // Joining user is a client
      joinParticipant.actual_member_id = user.id;
      joinParticipant.actual_partner_id = null;
      joinParticipant.participant_type = "member";
    }

    // Check for existing participant record
    const { data: existingParticipant } = await supabase
      .from("call_participants")
      .select("id")
      .eq("room_id", room_id)
      .eq("member_id", room.member_id)
      .is("left_at", null)
      .maybeSingle();

    if (existingParticipant) {
      // Update existing record
      const { error: updateParticipantError } = await supabase
        .from("call_participants")
        .update({
          joined_at: joinParticipant.joined_at,
          device_info: joinParticipant.device_info,
          connection_quality: joinParticipant.connection_quality,
          actual_member_id: joinParticipant.actual_member_id,
          actual_partner_id: joinParticipant.actual_partner_id,
          participant_type: joinParticipant.participant_type,
        })
        .eq("id", existingParticipant.id);

      if (updateParticipantError) throw updateParticipantError;
    } else {
      // Create new record
      const { error: insertError } = await supabase
        .from("call_participants")
        .insert(joinParticipant);

      if (insertError) throw insertError;
    }

    return successResponse(res, {
      room,
      message: "Successfully joined call",
    });
  })
);

/**
 * @swagger
 * /api/voice-call/end:
 *   post:
 *     summary: 통화 종료
 *     tags: [Voice Call]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - room_id
 *             properties:
 *               room_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: 성공
 */
// POST /end - End a call
router.post(
  "/end",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const body = req.body;

    if (!body || !body.room_id) {
      return errorResponse(res, "INVALID_BODY", "Room ID is required");
    }

    const { room_id } = body;

    // Update room status to ended
    const { error: roomError } = await supabase
      .from("call_rooms")
      .update({
        status: "ended",
        ended_at: new Date().toISOString(),
      })
      .eq("id", room_id);

    if (roomError) throw roomError;

    // Update participant left time
    const { error: participantError } = await supabase
      .from("call_participants")
      .update({
        left_at: new Date().toISOString(),
        connection_quality: "disconnected",
      })
      .eq("room_id", room_id)
      .eq("member_id", user.id)
      .is("left_at", null);

    if (participantError) throw participantError;

    return successResponse(res, {
      message: "Call ended successfully",
    });
  })
);

/**
 * @swagger
 * /api/voice-call/status/{roomId}:
 *   get:
 *     summary: 통화 상태 조회
 *     tags: [Voice Call]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     room:
 *                       type: object
 *                     duration:
 *                       type: integer
 *                       description: 통화 시간 (초)
 */
// GET /status/:roomId - Get call status
router.get(
  "/status/:roomId",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const roomId = req.params.roomId;

    if (!roomId) {
      return errorResponse(res, "INVALID_ROOM_ID", "Room ID is required");
    }

    // Get room with participants
    const { data: room, error: roomError } = await supabase
      .from("call_rooms")
      .select(
        `
        *,
        call_participants(*)
      `
      )
      .eq("id", roomId)
      .single();

    if (roomError) {
      if (roomError.code === "PGRST116") {
        return errorResponse(res, "ROOM_NOT_FOUND", "Call room not found");
      }
      throw roomError;
    }

    // Calculate call duration if in progress
    let duration = null;
    if (room.started_at && room.status === "in_call") {
      const startTime = new Date(room.started_at);
      const now = new Date();
      duration = Math.floor((now.getTime() - startTime.getTime()) / 1000); // seconds
    }

    return successResponse(res, {
      room,
      duration,
    });
  })
);

/**
 * @swagger
 * /api/voice-call/active:
 *   get:
 *     summary: 활성 통화 목록 조회
 *     tags: [Voice Call]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     activeCalls:
 *                       type: array
 *                       items:
 *                         type: object
 */
// GET /active - Get user's active calls
router.get(
  "/active",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();

    // Find active calls for this user
    const { data: activeCalls, error: callsError } = await supabase
      .from("call_rooms")
      .select(
        `
        *,
        call_participants(*)
      `
      )
      .or(`member_id.eq.${user.id},partner_id.eq.${user.id}`)
      .in("status", ["waiting", "in_call"])
      .order("started_at", { ascending: false });

    if (callsError) throw callsError;

    // Add duration for active calls
    const callsWithDuration = activeCalls?.map((call) => {
      let duration = null;
      if (call.started_at && call.status === "in_call") {
        const startTime = new Date(call.started_at);
        const now = new Date();
        duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);
      }
      return { ...call, duration };
    });

    return successResponse(res, {
      activeCalls: callsWithDuration || [],
    });
  })
);

export default router;
