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
 * /api/posts:
 *   post:
 *     summary: 게시물 생성
 *     tags: [Posts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - content
 *             properties:
 *               content:
 *                 type: string
 *                 description: 게시물 내용
 *               post_type:
 *                 type: string
 *                 enum: [free, paid]
 *                 default: free
 *                 description: 게시물 타입 (무료/유료)
 *               point_price:
 *                 type: integer
 *                 description: 유료 게시물의 포인트 가격 (post_type이 paid일 때 필수)
 *               is_published:
 *                 type: boolean
 *                 default: true
 *                 description: 게시 여부
 *               is_pinned:
 *                 type: boolean
 *                 default: false
 *                 description: 고정 여부
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
 *                   description: 생성된 게시물 정보
 *       400:
 *         description: 잘못된 요청 (유료 게시물의 경우 point_price 필수)
 *       404:
 *         description: 파트너 프로필을 찾을 수 없음
 */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const body = req.body;

    if (!body || !body.content) {
      return errorResponse(res, "INVALID_BODY", "Content is required");
    }

    // Get partner info for the user
    const { data: partner, error: partnerError } = await supabase
      .from("partners")
      .select("id")
      .eq("member_id", user.id)
      .maybeSingle();

    if (partnerError) throw partnerError;

    if (!partner) {
      return errorResponse(
        res,
        "PARTNER_NOT_FOUND",
        "Partner profile not found for this user"
      );
    }

    const {
      content,
      post_type = "free",
      point_price,
      is_published = true,
      is_pinned = false,
    } = body;

    // Validate paid post
    if (post_type === "paid" && (!point_price || point_price <= 0)) {
      return errorResponse(
        res,
        "VALIDATION_ERROR",
        "Paid posts require a point_price greater than 0"
      );
    }

    // Set published_at automatically
    const published_at = is_published ? new Date().toISOString() : null;

    // Insert into database
    const { data: newPost, error: insertError } = await supabase
      .from("posts")
      .insert([
        {
          partner_id: partner.id,
          content,
          post_type,
          point_price: post_type === "paid" ? point_price : null,
          is_pinned,
          is_published,
          published_at,
        },
      ])
      .select()
      .single();

    if (insertError) throw insertError;

    return successResponse(res, newPost);
  })
);

export default router;

