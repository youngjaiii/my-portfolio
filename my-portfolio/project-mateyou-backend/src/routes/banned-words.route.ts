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
 * /api/banned-words/words:
 *   get:
 *     summary: 금지어 단어만 조회 (활성화된 것만)
 *     tags: [BannedWords]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 성공
 */
router.get(
  "/words",
  asyncHandler(async (req, res) => {
    await getAuthUser(req);
    const supabase = createSupabaseClient();

    const { data, error } = await supabase
      .from("banned_words")
      .select("word")
      .eq("is_active", true)
      .order("word", { ascending: true });

    if (error) throw error;

    const words = data?.map((item) => item.word) || [];

    return successResponse(res, words);
  })
);

/**
 * @swagger
 * /api/banned-words:
 *   get:
 *     summary: 금지어 목록 조회
 *     tags: [BannedWords]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: is_active
 *         schema:
 *           type: boolean
 *         description: 활성화 상태 필터 (생략시 전체 조회)
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: 금지어 검색
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: 페이지 번호
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: 페이지당 개수
 *     responses:
 *       200:
 *         description: 성공
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    await getAuthUser(req);
    const supabase = createSupabaseClient();
    const { is_active, search } = req.query;
    const page = parseInt((req.query.page as string) || "1");
    const limit = parseInt((req.query.limit as string) || "20");
    const offset = (page - 1) * limit;

    let query = supabase
      .from("banned_words")
      .select("*", { count: "exact" })
      .order("id", { ascending: false });

    if (is_active !== undefined) {
      query = query.eq("is_active", is_active === "true");
    }

    if (search) {
      query = query.ilike("word", `%${search}%`);
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    return successResponse(res, data, {
      total: count || 0,
      page,
      limit,
      total_pages: Math.ceil((count || 0) / limit),
    });
  })
);

/**
 * @swagger
 * /api/banned-words:
 *   post:
 *     summary: 금지어 추가
 *     tags: [BannedWords]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - word
 *             properties:
 *               word:
 *                 type: string
 *               is_active:
 *                 type: boolean
 *                 default: true
 *     responses:
 *       200:
 *         description: 성공
 */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    await getAuthUser(req);
    const supabase = createSupabaseClient();
    const { word, is_active = true } = req.body;

    if (!word || !word.trim()) {
      return errorResponse(res, "INVALID_BODY", "금지어를 입력해주세요.");
    }

    const { data, error } = await supabase
      .from("banned_words")
      .insert([{ word: word.trim(), is_active }])
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return errorResponse(res, "DUPLICATE_WORD", "이미 등록된 금지어입니다.");
      }
      throw error;
    }

    return successResponse(res, data);
  })
);

/**
 * @swagger
 * /api/banned-words/{id}:
 *   put:
 *     summary: 금지어 수정
 *     tags: [BannedWords]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               word:
 *                 type: string
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: 성공
 */
router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    await getAuthUser(req);
    const supabase = createSupabaseClient();
    const { id } = req.params;
    const { word, is_active } = req.body;

    const updateData: { word?: string; is_active?: boolean; updated_at: string } = {
      updated_at: new Date().toISOString(),
    };

    if (word !== undefined) {
      if (!word.trim()) {
        return errorResponse(res, "INVALID_BODY", "금지어를 입력해주세요.");
      }
      updateData.word = word.trim();
    }

    if (is_active !== undefined) {
      updateData.is_active = is_active;
    }

    const { data, error } = await supabase
      .from("banned_words")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return errorResponse(res, "NOT_FOUND", "금지어를 찾을 수 없습니다.");
      }
      if (error.code === "23505") {
        return errorResponse(res, "DUPLICATE_WORD", "이미 등록된 금지어입니다.");
      }
      throw error;
    }

    return successResponse(res, data);
  })
);

/**
 * @swagger
 * /api/banned-words/{id}/toggle:
 *   patch:
 *     summary: 금지어 활성화/비활성화 토글
 *     tags: [BannedWords]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 성공
 */
router.patch(
  "/:id/toggle",
  asyncHandler(async (req, res) => {
    await getAuthUser(req);
    const supabase = createSupabaseClient();
    const { id } = req.params;

    // 현재 상태 조회
    const { data: current, error: fetchError } = await supabase
      .from("banned_words")
      .select("is_active")
      .eq("id", id)
      .single();

    if (fetchError) {
      if (fetchError.code === "PGRST116") {
        return errorResponse(res, "NOT_FOUND", "금지어를 찾을 수 없습니다.");
      }
      throw fetchError;
    }

    // 토글
    const { data, error } = await supabase
      .from("banned_words")
      .update({
        is_active: !current.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return successResponse(res, data);
  })
);

/**
 * @swagger
 * /api/banned-words/{id}:
 *   delete:
 *     summary: 금지어 삭제
 *     tags: [BannedWords]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: 성공
 */
router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await getAuthUser(req);
    const supabase = createSupabaseClient();
    const { id } = req.params;

    const { data, error } = await supabase
      .from("banned_words")
      .delete()
      .eq("id", id)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return errorResponse(res, "NOT_FOUND", "금지어를 찾을 수 없습니다.");
      }
      throw error;
    }

    return successResponse(res, data);
  })
);

export default router;
