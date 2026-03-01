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

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Only allow images
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed"));
    }
  },
});

/**
 * @swagger
 * /api/storage/upload:
 *   post:
 *     summary: 파일 업로드
 *     tags: [Storage]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *               - bucket
 *               - path
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               bucket:
 *                 type: string
 *               path:
 *                 type: string
 *               upsert:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: 성공
 */
// POST /upload - Upload file to storage
router.post(
  "/upload",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();

    const file = req.file;
    const bucket = req.body.bucket;
    const path = req.body.path;
    const upsert = req.body.upsert === "true" || req.body.upsert === true;

    if (!file) {
      return errorResponse(res, "MISSING_FILE", "File is required");
    }

    if (!bucket) {
      return errorResponse(res, "MISSING_BUCKET", "Bucket name is required");
    }

    if (!path) {
      return errorResponse(res, "MISSING_PATH", "File path is required");
    }

    // Validate file type
    if (!file.mimetype.startsWith("image/")) {
      return errorResponse(res, "INVALID_FILE_TYPE", "Only image files are allowed");
    }

    try {
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, file.buffer, {
          cacheControl: "3600",
          upsert: upsert,
          contentType: file.mimetype,
        });

      if (uploadError) {
        return errorResponse(res, "UPLOAD_FAILED", uploadError.message);
      }

      // Get public URL
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);

      return successResponse(res, {
        success: true,
        message: "File uploaded successfully",
        path: path,
        url: urlData.publicUrl,
        bucket: bucket,
        size: file.size,
        contentType: file.mimetype,
      });
    } catch (error: any) {
      return errorResponse(res, "UPLOAD_ERROR", error.message);
    }
  })
);

/**
 * @swagger
 * /api/storage/delete:
 *   delete:
 *     summary: 파일 삭제
 *     tags: [Storage]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bucket
 *               - path
 *             properties:
 *               bucket:
 *                 type: string
 *               path:
 *                 type: string
 *     responses:
 *       200:
 *         description: 성공
 */
// DELETE /delete - Delete file from storage
router.delete(
  "/delete",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const body = req.body;

    if (!body || !body.bucket || !body.path) {
      return errorResponse(
        res,
        "INVALID_BODY",
        "Bucket and path are required"
      );
    }

    const { bucket, path } = body;

    const { error: deleteError } = await supabase.storage
      .from(bucket)
      .remove([path]);

    if (deleteError) {
      return errorResponse(res, "DELETE_FAILED", deleteError.message);
    }

    return successResponse(res, {
      success: true,
      message: "File deleted successfully",
      path: path,
    });
  })
);

// GET /url/:bucket/* - Get public URL for file
router.get(
  "/url/:bucket/*path",
  asyncHandler(async (req, res) => {
    const supabase = createSupabaseClient();
    const bucket = req.params.bucket;
    const filePath = req.params.path;

    if (!bucket || !filePath) {
      return errorResponse(
        res,
        "INVALID_PATH",
        "Bucket and file path are required"
      );
    }

    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return successResponse(res, {
      url: urlData.publicUrl,
      bucket: bucket,
      path: filePath,
    });
  })
);

// GET /info/:bucket/* - Get file info
router.get(
  "/info/:bucket/*path",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const bucket = req.params.bucket;
    const filePath = req.params.path;

    if (!bucket || !filePath) {
      return errorResponse(
        res,
        "INVALID_PATH",
        "Bucket and file path are required"
      );
    }

    const pathParts = filePath.split("/");
    const fileName = pathParts.pop();
    const directory = pathParts.join("/");

    const { data: fileInfo, error: infoError } = await supabase.storage
      .from(bucket)
      .list(directory, {
        search: fileName,
      });

    if (infoError) {
      return errorResponse(res, "INFO_FAILED", infoError.message);
    }

    const file = fileInfo?.[0];
    if (!file) {
      return errorResponse(res, "FILE_NOT_FOUND", "File not found");
    }

    return successResponse(res, {
      name: file.name,
      size: file.metadata?.size,
      lastModified: file.updated_at,
      contentType: file.metadata?.mimetype,
      bucket: bucket,
      path: filePath,
    });
  })
);

/**
 * @swagger
 * /api/storage/generate-path:
 *   post:
 *     summary: 고유 파일 경로 생성
 *     tags: [Storage]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - originalName
 *             properties:
 *               originalName:
 *                 type: string
 *               memberCode:
 *                 type: string
 *               userId:
 *                 type: string
 *     responses:
 *       200:
 *         description: 성공
 */
// POST /generate-path - Generate unique file path
router.post(
  "/generate-path",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const body = req.body;

    if (!body || !body.originalName) {
      return errorResponse(
        res,
        "INVALID_BODY",
        "Original file name is required"
      );
    }

    const { originalName, memberCode, userId } = body;

    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const extension = originalName.split(".").pop();

    // Use member code if available, otherwise use userId, otherwise use user.id
    const folderName = memberCode || userId || user.id;
    const path = `${folderName}/${timestamp}-${randomString}.${extension}`;

    return successResponse(res, {
      path: path,
      originalName: originalName,
      extension: extension,
      folderName: folderName,
    });
  })
);

// GET /list/:bucket - List files in bucket
router.get(
  "/list/:bucket",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const bucket = req.params.bucket;
    const prefix = (req.query.prefix as string) || "";
    const limit = parseInt((req.query.limit as string) || "100");
    const offset = parseInt((req.query.offset as string) || "0");

    if (!bucket) {
      return errorResponse(res, "MISSING_BUCKET", "Bucket name is required");
    }

    const { data: files, error: listError } = await supabase.storage
      .from(bucket)
      .list(prefix, {
        limit: limit,
        offset: offset,
        sortBy: { column: "created_at", order: "desc" },
      });

    if (listError) {
      return errorResponse(res, "LIST_FAILED", listError.message);
    }

    return successResponse(res, {
      files: files || [],
      bucket: bucket,
      prefix: prefix,
      total: files?.length || 0,
    });
  })
);

export default router;
