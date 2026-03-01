import { Router } from "express";
import {
  createSupabaseClient,
  successResponse,
  errorResponse,
  getAuthUser,
  asyncHandler,
} from "../lib/utils";

const router = Router();

router.get(
  "/:roomId",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const roomId = req.params.roomId;
    const page = parseInt((req.query.page as string) || "1");
    const limit = parseInt((req.query.limit as string) || "100");
    const offset = (page - 1) * limit;

    if (!roomId) {
      return errorResponse(res, "INVALID_ROOM_ID", "Room ID is required");
    }

    const { data: roomData, error: roomError } = await supabase
      .from("chat_rooms")
      .select("id, created_by, partner_id, is_cs_room")
      .eq("id", roomId)
      .eq("is_active", true)
      .single();

    if (roomError) {
      if (roomError.code === "PGRST116") {
        return errorResponse(res, "ROOM_NOT_FOUND", "Chat room not found");
      }
      throw roomError;
    }

    if (roomData.is_cs_room) {
      if (roomData.created_by !== user.id) {
        const { data: member } = await supabase
          .from("members")
          .select("role, admin_role")
          .eq("id", user.id)
          .single();
        if (member?.role !== "admin" && (member?.admin_role ?? 0) < 4) {
          return errorResponse(res, "UNAUTHORIZED", "Access denied", null, 403);
        }
      }
    } else if (roomData.created_by !== user.id && roomData.partner_id !== user.id) {
      return errorResponse(res, "UNAUTHORIZED", "Access denied", null, 403);
    }

    // member_chats 테이블에서 메시지 조회 (chat_media 포함)
    const { data: messagesData, error: messagesError, count } = await supabase
      .from("member_chats")
      .select(`
        id,
        chat_room_id,
        sender_id,
        receiver_id,
        message,
        message_type,
        is_read,
        created_at,
        sender:members!sender_id(id, name, profile_image),
        receiver:members!receiver_id(id, name, profile_image),
        chat_media!chat_id(id, media_url, media_type, file_name, thumbnail_url)
      `, { count: "exact" })
      .eq("chat_room_id", roomId)
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

export default router;

