import { Router } from "express";
import multer from "multer";
import {
  createSupabaseClient,
  successResponse,
  errorResponse,
  getAuthUser,
  asyncHandler,
} from "../lib/utils";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

// POST /upload - Upload files for chat
router.post(
  "/upload",
  upload.fields([
    { name: "files", maxCount: 10 },
    { name: "thumbnails", maxCount: 10 },
  ]),
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const roomId = req.body.room_id;

    if (!roomId) {
      return errorResponse(res, "INVALID_BODY", "Room ID is required");
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
      return errorResponse(res, "UNAUTHORIZED", "Access denied", null, 403);
    }

    const files =
      (req.files as { [fieldname: string]: Express.Multer.File[] })?.files ||
      [];
    const thumbnails =
      (req.files as { [fieldname: string]: Express.Multer.File[] })
        ?.thumbnails || [];

    if (files.length === 0) {
      return errorResponse(res, "NO_FILES", "No files provided");
    }

    const uploadedFiles: Array<{
      url: string;
      type: string;
      name: string;
      size: number;
      thumbnail_url?: string;
    }> = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.originalname.split(".").pop() || "bin";
      const timestamp = Date.now();
      const fileName = `${roomId}/${user.id}/${timestamp}-${i}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("chat-media")
        .upload(fileName, file.buffer, {
          contentType: file.mimetype,
          upsert: false,
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        continue;
      }

      const { data: urlData } = supabase.storage
        .from("chat-media")
        .getPublicUrl(fileName);

      let thumbnailUrl: string | undefined;

      // Upload thumbnail if exists
      if (thumbnails[i]) {
        const thumbExt = thumbnails[i].originalname.split(".").pop() || "jpg";
        const thumbFileName = `${roomId}/${user.id}/${timestamp}-${i}-thumb.${thumbExt}`;

        const { error: thumbError } = await supabase.storage
          .from("chat-media")
          .upload(thumbFileName, thumbnails[i].buffer, {
            contentType: thumbnails[i].mimetype,
            upsert: false,
          });

        if (!thumbError) {
          const { data: thumbUrlData } = supabase.storage
            .from("chat-media")
            .getPublicUrl(thumbFileName);
          thumbnailUrl = thumbUrlData.publicUrl;
        }
      }

      uploadedFiles.push({
        url: urlData.publicUrl,
        type: file.mimetype,
        name: file.originalname,
        size: file.size,
        thumbnail_url: thumbnailUrl,
      });
    }

    return successResponse(res, uploadedFiles);
  })
);

// POST /messages/with-media - Send a message with media files
router.post(
  "/messages/with-media",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const body = req.body;

    if (!body || !body.room_id) {
      return errorResponse(res, "INVALID_BODY", "Room ID is required");
    }

    const { room_id, message = "", message_type = "media", media_files = [] } = body;

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
      return errorResponse(res, "UNAUTHORIZED", "Access denied", null, 403);
    }

    const receiver_id = roomData.created_by === user.id 
      ? roomData.partner_id 
      : roomData.created_by;

    const { data: newMessage, error: messageError } = await supabase
      .from("member_chats")
      .insert([
        {
          chat_room_id: room_id,
          sender_id: user.id,
          receiver_id,
          message: message || "사진을 보냈습니다",
          message_type: media_files.length > 0 ? "mixed" : message_type,
          is_read: false,
        },
      ])
      .select()
      .single();

    if (messageError) throw messageError;

    if (media_files.length > 0) {
      console.log("📸 Inserting media files:", { chat_id: newMessage.id, room_id, media_files });
      
      const mediaInserts = media_files.map((file: any) => ({
        chat_id: newMessage.id,
        chat_room_id: room_id,
        media_url: file.media_url,
        media_type: file.media_type,
        file_name: file.file_name,
        thumbnail_url: file.thumbnail_url,
      }));

      const { error: mediaError } = await supabase.from("chat_media").insert(mediaInserts);
      
      if (mediaError) {
        console.error("❌ Media insert error:", mediaError);
      } else {
        console.log("✅ Media inserted successfully");
      }
    }

    await supabase
      .from("chat_rooms")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", room_id);

    return successResponse(res, { ...newMessage, media_files });
  })
);

export default router;

