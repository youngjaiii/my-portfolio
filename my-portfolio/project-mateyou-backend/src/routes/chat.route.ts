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
 * /api/chat/rooms:
 *   get:
 *     summary: 채팅방 목록 조회
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 성공
 */
// GET /rooms - Get user's chat rooms
router.get(
  "/rooms",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();

    const { data: roomsData, error: roomsError } = await supabase
      .from("chat_rooms")
      .select(
        `
        *,
        members!partner_id(id, member_code, name, profile_image),
        chat_messages(
          id, message, message_type, created_at, sender_id
        )
      `
      )
      .or(`created_by.eq.${user.id},partner_id.eq.${user.id}`)
      .eq("is_active", true)
      .order("updated_at", { ascending: false });

    if (roomsError) throw roomsError;

    // Get latest message for each room
    const roomsWithLatestMessage = (roomsData || []).map((room) => {
      // Sort messages by created_at desc and get the latest one
      const sortedMessages = (room.chat_messages || []).sort(
        (a: any, b: any) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const latestMessage = sortedMessages[0];
      return {
        ...room,
        latest_message: latestMessage || null,
        chat_messages: undefined, // Remove messages array to reduce payload
      };
    });

    return successResponse(res, roomsWithLatestMessage);
  })
);

/**
 * @swagger
 * /api/chat/rooms:
 *   post:
 *     summary: 채팅방 생성 또는 조회
 *     tags: [Chat]
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
 *             properties:
 *               partner_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: 성공
 */
// POST /rooms - Create or get existing chat room
router.post(
  "/rooms",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const body = req.body;

    if (!body || !body.partner_id) {
      return errorResponse(res, "INVALID_BODY", "Partner ID is required");
    }

    const { partner_id } = body;

    // Check if room already exists
    const { data: existingRoom, error: checkError } = await supabase
      .from("chat_rooms")
      .select("*")
      .or(
        `and(created_by.eq.${user.id},partner_id.eq.${partner_id}),and(created_by.eq.${partner_id},partner_id.eq.${user.id})`
      )
      .eq("is_active", true)
      .maybeSingle();

    if (checkError && checkError.code !== "PGRST116") {
      throw checkError;
    }

    if (existingRoom) {
      return successResponse(res, existingRoom);
    }

    // Create new room
    const { data: newRoom, error: createError } = await supabase
      .from("chat_rooms")
      .insert([
        {
          created_by: user.id,
          partner_id: partner_id,
          is_active: true,
        },
      ])
      .select()
      .single();

    if (createError) throw createError;

    return successResponse(res, newRoom);
  })
);

/**
 * @swagger
 * /api/chat/messages/{roomId}:
 *   get:
 *     summary: 채팅방 메시지 목록 조회
 *     tags: [Chat]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: 성공
 */
// GET /messages/:roomId - Get messages for a room
router.get(
  "/messages/:roomId",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const roomId = req.params.roomId;
    const page = parseInt((req.query.page as string) || "1");
    const limit = parseInt((req.query.limit as string) || "50");
    const offset = (page - 1) * limit;

    if (!roomId) {
      return errorResponse(res, "INVALID_ROOM_ID", "Room ID is required");
    }

    // Verify user has access to this room
    const { data: roomData, error: roomError } = await supabase
      .from("chat_rooms")
      .select("id, created_by, partner_id")
      .eq("id", roomId)
      .eq("is_active", true)
      .single();

    if (roomError) {
      if (roomError.code === "PGRST116") {
        return errorResponse(res, "ROOM_NOT_FOUND", "Chat room not found");
      }
      throw roomError;
    }

    if (roomData.created_by !== user.id && roomData.partner_id !== user.id) {
      return errorResponse(
        res,
        "UNAUTHORIZED",
        "Access denied to this chat room",
        null,
        403
      );
    }

    // Get messages
    const {
      data: messagesData,
      error: messagesError,
      count,
    } = await supabase
      .from("chat_messages")
      .select(
        `
        *,
        members!sender_id(id, name, profile_image)
      `,
        { count: "exact" }
      )
      .eq("room_id", roomId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (messagesError) throw messagesError;

    return successResponse(res, messagesData?.reverse() || [], {
      total: count || 0,
      page,
      limit,
    });
  })
);

/**
 * @swagger
 * /api/chat/messages:
 *   post:
 *     summary: 메시지 전송
 *     tags: [Chat]
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
 *               - message
 *             properties:
 *               room_id:
 *                 type: string
 *               message:
 *                 type: string
 *               message_type:
 *                 type: string
 *                 enum: [text, image, system]
 *                 default: text
 *     responses:
 *       200:
 *         description: 성공
 */
// POST /messages - Send a message
router.post(
  "/messages",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const body = req.body;

    if (!body || !body.room_id || !body.message) {
      return errorResponse(
        res,
        "INVALID_BODY",
        "Room ID and message are required"
      );
    }

    const { room_id, message, message_type = "text" } = body;

    // 금지어 체크
    if (message) {
      const { data: bannedWords } = await supabase
        .from("banned_words")
        .select("word")
        .eq("is_active", true);

      if (bannedWords && bannedWords.length > 0) {
        const lowerMessage = message.toLowerCase();
        const prohibitedWord = bannedWords.find((bw: { word: string }) =>
          lowerMessage.includes(bw.word.toLowerCase())
        );

        if (prohibitedWord) {
          return errorResponse(
            res,
            "PROHIBITED_WORD",
            `"${prohibitedWord.word}"는 금지어이므로 메시지를 전송할 수 없습니다.`
          );
        }
      }
    }

    // Verify user has access to this room
    const { data: roomData, error: roomError } = await supabase
      .from("chat_rooms")
      .select("id, created_by, partner_id")
      .eq("id", room_id)
      .eq("is_active", true)
      .single();

    if (roomError) {
      if (roomError.code === "PGRST116") {
        return errorResponse(res, "ROOM_NOT_FOUND", "Chat room not found");
      }
      throw roomError;
    }

    if (roomData.created_by !== user.id && roomData.partner_id !== user.id) {
      return errorResponse(
        res,
        "UNAUTHORIZED",
        "Access denied to this chat room",
        null,
        403
      );
    }

    // receiver_id 계산
    const receiverId = roomData.created_by === user.id 
      ? roomData.partner_id 
      : roomData.created_by;

    // Create message in member_chats only
    const { data: newMessage, error: messageError } = await supabase
      .from("member_chats")
      .insert([
        {
          chat_room_id: room_id,
          sender_id: user.id,
          receiver_id: receiverId,
          message,
          message_type,
        },
      ])
      .select(
        `
        *,
        sender:members!sender_id(id, name, profile_image)
      `
      )
      .single();

    if (messageError) throw messageError;

    // Update room's updated_at timestamp
    await supabase
      .from("chat_rooms")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", room_id);

    // TODO: Push notification implementation
    // The push notification logic should be implemented here
    // It should:
    // 1. Determine the receiver ID (the partner, not the sender)
    // 2. Get sender name from newMessage.members?.name
    // 3. Send push notification with:
    //    - user_id: receiverId
    //    - title: senderName
    //    - body: message (or 'New message arrived' for non-text)
    //    - notification_type: 'message'
    //    - url: `/chat?room_id=${room_id}`
    //    - tag: `chat-${room_id}`
    //    - data: { room_id, sender_id, sender_name, message_type }

    return successResponse(res, newMessage);
  })
);

/**
 * @swagger
 * /api/chat/rooms/{roomId}:
 *   delete:
 *     summary: 채팅방 비활성화
 *     tags: [Chat]
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
 */
// DELETE /rooms/:roomId - Deactivate a chat room
router.delete(
  "/rooms/:roomId",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const roomId = req.params.roomId;

    if (!roomId) {
      return errorResponse(res, "INVALID_ROOM_ID", "Room ID is required");
    }

    // Verify user has access to this room
    const { data: roomData, error: roomError } = await supabase
      .from("chat_rooms")
      .select("id, created_by, partner_id")
      .eq("id", roomId)
      .single();

    if (roomError) {
      if (roomError.code === "PGRST116") {
        return errorResponse(res, "ROOM_NOT_FOUND", "Chat room not found");
      }
      throw roomError;
    }

    if (roomData.created_by !== user.id && roomData.partner_id !== user.id) {
      return errorResponse(
        res,
        "UNAUTHORIZED",
        "Access denied to this chat room",
        null,
        403
      );
    }

    // Deactivate room
    const { data: updatedRoom, error: updateError } = await supabase
      .from("chat_rooms")
      .update({ is_active: false })
      .eq("id", roomId)
      .select()
      .single();

    if (updateError) throw updateError;

    return successResponse(res, updatedRoom);
  })
);

export default router;
