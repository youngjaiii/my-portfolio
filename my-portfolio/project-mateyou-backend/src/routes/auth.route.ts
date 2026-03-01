import { Router } from "express";
import {
  createSupabaseClient,
  successResponse,
  errorResponse,
  getAuthUser,
  asyncHandler,
} from "../lib/utils";
import { Member } from "../types/index";

const router = Router();

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: 현재 사용자 정보 조회
 *     tags: [Authentication]
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
 *                   description: 멤버 정보
 *       401:
 *         description: 인증 실패
 */
// GET /me - Get current user info
router.get(
  "/me",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();

    // Get member data (exclude sensitive fields)
    const { data: memberData, error: memberError } = await supabase
      .from("members")
      .select("id, member_code, name, email, profile_image, favorite_game, current_status, total_points, created_at, role")
      .eq("id", user.id)
      .single();

    if (memberError && memberError.code !== "PGRST116") {
      throw memberError;
    }

    // If member doesn't exist, create one
    if (!memberData) {
      const newMember = {
        id: user.id,
        name:
          user.user_metadata?.full_name ||
          user.email?.split("@")[0] ||
          "User",
        email: user.email || null,
        member_code: `USER_${Date.now()}`, // Generate unique code
        profile_image: user.user_metadata?.avatar_url,
        current_status: "online",
        favorite_game: [],
      };

      const { data: createdMember, error: createError } = await supabase
        .from("members")
        .insert([newMember])
        .select()
        .single();

      if (createError) throw createError;

      return successResponse(res, createdMember);
    }

    // If role is partner, get partner data
    if (memberData.role === "partner") {
      const { data: partnerData, error: partnerError } = await supabase
        .from("partners")
        .select("total_points, store_points, collaboration_store_points")
        .eq("member_id", user.id)
        .maybeSingle();

      if (partnerError && partnerError.code !== "PGRST116") {
        throw partnerError;
      }

      // Add partner_points, store_points, collaboration_store_points to response
      const responseData = {
        ...memberData,
        partner_points: partnerData?.total_points || 0,
        store_points: partnerData?.store_points || 0,
        collaboration_store_points: partnerData?.collaboration_store_points || 0,
      };

      return successResponse(res, responseData);
    }

    return successResponse(res, memberData);
  })
);

/**
 * @swagger
 * /api/auth/profile:
 *   put:
 *     summary: 사용자 프로필 업데이트
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               favorite_game:
 *                 type: array
 *                 items:
 *                   type: string
 *               current_status:
 *                 type: string
 *                 enum: [online, offline, matching, in_game]
 *               profile_image:
 *                 type: string
 *     responses:
 *       200:
 *         description: 성공
 *       400:
 *         description: 잘못된 요청
 */
// PUT /profile - Update user profile
router.put(
  "/profile",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const body = req.body;

    if (!body) {
      return errorResponse(res, "INVALID_BODY", "Request body is required");
    }

    // Block attempts to modify sensitive fields
    const blockedFields = ['total_points', 'id', 'member_code', 'created_at'];
    const attemptedBlockedFields = blockedFields.filter(field => body[field] !== undefined);
    if (attemptedBlockedFields.length > 0) {
      return errorResponse(
        res,
        "FORBIDDEN_FIELDS",
        `Cannot modify protected fields: ${attemptedBlockedFields.join(', ')}`,
        null,
        403
      );
    }

    const { name, favorite_game, current_status, profile_image } = body;

    const updateData: Partial<Member> = {};
    if (name !== undefined) updateData.name = name;
    if (favorite_game !== undefined) updateData.favorite_game = favorite_game;
    if (current_status !== undefined)
      updateData.current_status = current_status;
    if (profile_image !== undefined)
      updateData.profile_image = profile_image;

    const { data: updatedMember, error: updateError } = await supabase
      .from("members")
      .update(updateData)
      .eq("id", user.id)
      .select()
      .single();

    if (updateError) throw updateError;

    return successResponse(res, updatedMember);
  })
);

/**
 * @swagger
 * /api/auth/partner-status:
 *   get:
 *     summary: 파트너 상태 조회
 *     description: |
 *       현재 로그인한 사용자의 파트너 신청 상태를 조회합니다.
 *
 *       **파트너 상태 값:**
 *       - `none`: 파트너 신청 이력 없음
 *       - `pending`: 승인 대기 중
 *       - `approved`: 승인됨 (파트너 활동 가능)
 *       - `rejected`: 거부됨
 *
 *       **참고:**
 *       - 파트너 승인 후 Toss Seller 등록이 필요합니다.
 *       - 상세 가이드: [Partner 및 Toss Seller 가이드](https://github.com/mateyou2025/mateyou-backend/blob/main/docs/PARTNER_TOSS_GUIDE.md)
 *     tags: [Authentication]
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
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     isPartner:
 *                       type: boolean
 *                       description: 파트너 신청 여부
 *                       example: true
 *                     partnerStatus:
 *                       type: string
 *                       description: 파트너 상태
 *                       enum: [none, pending, approved, rejected]
 *                       example: pending
 *                     partnerId:
 *                       type: string
 *                       description: 파트너 ID
 *                       example: "123e4567-e89b-12d3-a456-426614174000"
 *                     partnerName:
 *                       type: string
 *                       description: 파트너명
 *                       example: "메이트 게임즈"
 *                     totalPoints:
 *                       type: integer
 *                       description: 총 적립 포인트
 *                       example: 5000
 *       401:
 *         description: 인증 실패 (토큰 없음 또는 유효하지 않음)
 */
// GET /partner-status - Get user's partner status
router.get(
  "/partner-status",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();

    const { data: partnerData, error: partnerError } = await supabase
      .from("partners")
      .select("id, partner_status, partner_name, total_points")
      .eq("member_id", user.id)
      .maybeSingle();

    if (partnerError && partnerError.code !== "PGRST116") {
      throw partnerError;
    }

    return successResponse(res, {
      isPartner: !!partnerData,
      partnerStatus: partnerData?.partner_status || "none",
      partnerId: partnerData?.id,
      partnerName: partnerData?.partner_name,
      totalPoints: partnerData?.total_points || 0,
    });
  })
);

/**
 * @swagger
 * /api/auth/partner-apply:
 *   post:
 *     summary: 파트너 신청
 *     description: |
 *       파트너 신청을 제출합니다. 신청 후 관리자 승인이 필요합니다.
 *
 *       **파트너 신청 프로세스:**
 *       1. 이 API로 파트너 신청 (상태: `pending`)
 *       2. 관리자 승인 대기 (Admin API: `PUT /api/admin/partners/:partnerId/status`)
 *       3. 승인 후 Toss Seller 등록 필요 (API: `POST /api/toss/seller`)
 *       4. 정산 기능 사용 가능
 *
 *       **제한사항:**
 *       - 사용자당 1개의 파트너 신청만 가능
 *       - 기존 신청이 있으면 `PARTNER_EXISTS` 에러 반환
 *
 *       **참고:**
 *       - 상세 가이드: [Partner 및 Toss Seller 가이드](https://github.com/mateyou2025/mateyou-backend/blob/main/docs/PARTNER_TOSS_GUIDE.md)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - partner_name
 *             properties:
 *               partner_name:
 *                 type: string
 *                 description: 파트너명 (필수)
 *                 example: "메이트 게임즈"
 *               partner_message:
 *                 type: string
 *                 description: 신청 메시지/소개 (선택)
 *                 example: "게임 개발 파트너십을 신청합니다."
 *               game_info:
 *                 type: object
 *                 description: 게임 정보 (선택)
 *                 example: { "genre": "RPG", "platform": "Mobile" }
 *               legal_name:
 *                 type: string
 *                 description: 법적 이름 (선택)
 *                 example: "홍길동"
 *               legal_email:
 *                 type: string
 *                 description: 법적 이메일 (선택)
 *                 example: "legal@example.com"
 *               legal_phone:
 *                 type: string
 *                 description: 법적 전화번호 (선택)
 *                 example: "010-1234-5678"
 *               payout_bank_code:
 *                 type: string
 *                 description: 정산 은행 코드 (선택)
 *                 example: "004"
 *               payout_bank_name:
 *                 type: string
 *                 description: 정산 은행명 (선택)
 *                 example: "국민은행"
 *               payout_account_number:
 *                 type: string
 *                 description: 정산 계좌번호 (선택)
 *                 example: "123456789012"
 *               payout_account_holder:
 *                 type: string
 *                 description: 예금주명 (선택)
 *                 example: "홍길동"
 *               business_type:
 *                 type: string
 *                 description: 사업자 유형 (선택)
 *                 enum: [individual, business]
 *                 example: "individual"
 *               categories:
 *                 type: array
 *                 description: 파트너 카테고리 (선택)
 *                 items:
 *                   type: object
 *                   properties:
 *                     category_id:
 *                       type: integer
 *                       description: 카테고리 ID
 *                     detail_category_id:
 *                       type: integer
 *                       description: 상세 카테고리 ID (선택)
 *                 example: [{ "category_id": 1, "detail_category_id": 2 }]
 *     responses:
 *       200:
 *         description: 신청 성공
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
 *                   properties:
 *                     id:
 *                       type: string
 *                       description: 파트너 ID
 *                       example: "123e4567-e89b-12d3-a456-426614174000"
 *                     member_id:
 *                       type: string
 *                       description: 회원 ID
 *                     partner_name:
 *                       type: string
 *                       description: 파트너명
 *                       example: "메이트 게임즈"
 *                     partner_status:
 *                       type: string
 *                       description: 파트너 상태
 *                       example: "pending"
 *                     partner_applied_at:
 *                       type: string
 *                       format: date-time
 *                       description: 신청일시
 *                     total_points:
 *                       type: integer
 *                       description: 총 포인트
 *                       example: 0
 *       400:
 *         description: 잘못된 요청 (필수 필드 누락 또는 중복 신청)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "PARTNER_EXISTS"
 *                 message:
 *                   type: string
 *                   example: "Partner application already exists"
 *       401:
 *         description: 인증 실패
 */
// POST /partner-apply - Apply to become a partner
router.post(
  "/partner-apply",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const body = req.body;

    if (!body) {
      return errorResponse(res, "INVALID_BODY", "Request body is required");
    }

    const {
      partner_name,
      partner_message,
      game_info,
      legal_name,
      legal_email,
      legal_phone,
      payout_bank_code,
      payout_bank_name,
      payout_account_number,
      payout_account_holder,
      business_type,
      categories,
      referral_source,
      referrer_member_code,
      interview_legal_name,
      interview_phone,
      interview_email,
      interview_contact_id,
      interview_sns_type,
      interview_gender,
      interview_other_platforms,
      interview_main_content,
      terms_agreed_at,
      privacy_agreed_at,
    } = body;

    if (!partner_name) {
      return errorResponse(
        res,
        "MISSING_PARTNER_NAME",
        "Partner name is required"
      );
    }

    const { data: existingPartner, error: checkError } = await supabase
      .from("partners")
      .select("id, partner_status")
      .eq("member_id", user.id)
      .maybeSingle();

    if (checkError && checkError.code !== "PGRST116") {
      throw checkError;
    }

    const status = existingPartner
      ? String(existingPartner.partner_status ?? "").toLowerCase()
      : "";
    const canReapply =
      existingPartner &&
      status !== "approved";

    if (existingPartner && !canReapply) {
      return errorResponse(
        res,
        "PARTNER_EXISTS",
        "Partner application already exists"
      );
    }

    const now = new Date().toISOString();
    const partnerPayload: any = {
      partner_name,
      partner_message: partner_message || null,
      game_info: game_info || null,
      partner_status: "pending",
      partner_applied_at: now,
      referral_source: referral_source || null,
      referrer_member_code: referrer_member_code || null,
      interview_legal_name: interview_legal_name || null,
      interview_phone: interview_phone || null,
      interview_email: interview_email || null,
      interview_contact_id: interview_contact_id || null,
      interview_sns_type: interview_sns_type || null,
      interview_gender: interview_gender || null,
      interview_other_platforms: interview_other_platforms || null,
      interview_main_content: interview_main_content || null,
      terms_agreed_at: terms_agreed_at || null,
      privacy_agreed_at: privacy_agreed_at || null,
    };

    let newPartner: any;

    if (canReapply && existingPartner) {
      const { data: updated, error: updateError } = await supabase
        .from("partners")
        .update(partnerPayload)
        .eq("id", existingPartner.id)
        .select()
        .single();
      if (updateError) throw updateError;
      newPartner = updated;

      await supabase.from("partner_categories").delete().eq("user_id", user.id);
    } else {
      const { data: created, error: createError } = await supabase
        .from("partners")
        .insert([
          {
            member_id: user.id,
            ...partnerPayload,
            total_points: 0,
          },
        ])
        .select()
        .single();
      if (createError) throw createError;
      newPartner = created;
    }

    if (partner_name) {
      await supabase
        .from("members")
        .update({ name: partner_name.trim() })
        .eq("id", user.id);
    }

    const hasBusinessInfo =
      legal_name ||
      legal_email ||
      legal_phone ||
      payout_bank_code ||
      payout_bank_name ||
      payout_account_number ||
      payout_account_holder ||
      business_type;

    if (hasBusinessInfo && newPartner) {
      const bizInfoData: any = { partner_id: newPartner.id };
      if (legal_name !== undefined) bizInfoData.legal_name = legal_name?.trim();
      if (legal_email !== undefined) bizInfoData.legal_email = legal_email?.trim();
      if (legal_phone !== undefined) bizInfoData.legal_phone = legal_phone?.trim();
      if (payout_bank_code !== undefined) bizInfoData.payout_bank_code = payout_bank_code;
      if (payout_bank_name !== undefined) bizInfoData.payout_bank_name = payout_bank_name;
      if (payout_account_number !== undefined) bizInfoData.payout_account_number = payout_account_number;
      if (payout_account_holder !== undefined) bizInfoData.payout_account_holder = payout_account_holder?.trim();
      if (business_type !== undefined) bizInfoData.tosspayments_business_type = business_type;

      const { error: bizInfoError } = await supabase
        .from("partner_business_info")
        .upsert(bizInfoData, { onConflict: "partner_id" });
      if (bizInfoError) {
        console.error("Failed to create partner_business_info:", bizInfoError.message);
      }
    }

    if (categories && Array.isArray(categories) && categories.length > 0) {
      const categoryRecords = categories.map((cat: any) => ({
        user_id: user.id,
        category_id: cat.category_id,
        detail_category_id: cat.detail_category_id || null,
      }));
      const { error: categoriesError } = await supabase
        .from("partner_categories")
        .insert(categoryRecords);
      if (categoriesError) {
        console.error("Failed to create partner_categories:", categoriesError.message);
      }
    }

    return successResponse(res, newPartner);
  })
);

/**
 * @swagger
 * /api/auth/partner-apply:
 *   put:
 *     summary: 파트너 신청 업데이트
 *     description: |
 *       대기중(pending) 상태의 파트너 신청을 업데이트합니다.
 *       승인된 파트너는 `/api/partner-profile/update`를 사용하세요.
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               partner_name:
 *                 type: string
 *                 description: 파트너명
 *               partner_message:
 *                 type: string
 *                 description: 신청 메시지/소개
 *               game_info:
 *                 type: object
 *                 description: 게임 정보
 *               legal_name:
 *                 type: string
 *                 description: 법적 이름
 *               legal_email:
 *                 type: string
 *                 description: 법적 이메일
 *               legal_phone:
 *                 type: string
 *                 description: 법적 전화번호
 *               payout_bank_code:
 *                 type: string
 *                 description: 정산 은행 코드
 *               payout_bank_name:
 *                 type: string
 *                 description: 정산 은행명
 *               payout_account_number:
 *                 type: string
 *                 description: 정산 계좌번호
 *               payout_account_holder:
 *                 type: string
 *                 description: 예금주명
 *               business_type:
 *                 type: string
 *                 description: 사업자 유형
 *                 enum: [individual, business]
 *               categories:
 *                 type: array
 *                 description: 파트너 카테고리
 *                 items:
 *                   type: object
 *                   properties:
 *                     category_id:
 *                       type: integer
 *                     detail_category_id:
 *                       type: integer
 *     responses:
 *       200:
 *         description: 업데이트 성공
 *       400:
 *         description: 잘못된 요청
 *       404:
 *         description: 파트너 신청이 없음
 */
// PUT /partner-apply - Update pending partner application
router.put(
  "/partner-apply",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const body = req.body;

    if (!body || Object.keys(body).length === 0) {
      return errorResponse(res, "INVALID_BODY", "Request body is required");
    }

    // Check if user has a partner application
    const { data: existingPartner, error: checkError } = await supabase
      .from("partners")
      .select("id, partner_status")
      .eq("member_id", user.id)
      .maybeSingle();

    if (checkError && checkError.code !== "PGRST116") {
      throw checkError;
    }

    if (!existingPartner) {
      return errorResponse(
        res,
        "PARTNER_NOT_FOUND",
        "Partner application not found"
      );
    }

    // Only allow updates for pending applications
    if (existingPartner.partner_status !== "pending") {
      return errorResponse(
        res,
        "UPDATE_NOT_ALLOWED",
        "Can only update pending applications. Use /api/partner-profile/update for approved partners.",
        null,
        403
      );
    }

    const {
      partner_name,
      partner_message,
      game_info,
      legal_name,
      legal_email,
      legal_phone,
      payout_bank_code,
      payout_bank_name,
      payout_account_number,
      payout_account_holder,
      business_type,
      categories,
    } = body;

    // Update partners table
    const partnerUpdateData: any = {};
    if (partner_name !== undefined) partnerUpdateData.partner_name = partner_name?.trim();
    if (partner_message !== undefined) partnerUpdateData.partner_message = partner_message?.trim();
    if (game_info !== undefined) partnerUpdateData.game_info = game_info;

    let updatedPartner = null;
    if (Object.keys(partnerUpdateData).length > 0) {
      const { data, error: updateError } = await supabase
        .from("partners")
        .update(partnerUpdateData)
        .eq("id", existingPartner.id)
        .select()
        .single();

      if (updateError) throw updateError;
      updatedPartner = data;
    }

    // Update members.name if partner_name is updated
    if (partner_name !== undefined) {
      const { error: memberUpdateError } = await supabase
        .from("members")
        .update({ name: partner_name.trim() })
        .eq("id", user.id);

      if (memberUpdateError) {
        console.error("Failed to update members.name:", memberUpdateError.message);
      }
    }

    // Update partner_business_info table
    const bizInfoData: any = {};
    if (legal_name !== undefined) bizInfoData.legal_name = legal_name?.trim();
    if (legal_email !== undefined) bizInfoData.legal_email = legal_email?.trim();
    if (legal_phone !== undefined) bizInfoData.legal_phone = legal_phone?.trim();
    if (payout_bank_code !== undefined) bizInfoData.payout_bank_code = payout_bank_code;
    if (payout_bank_name !== undefined) bizInfoData.payout_bank_name = payout_bank_name;
    if (payout_account_number !== undefined) bizInfoData.payout_account_number = payout_account_number;
    if (payout_account_holder !== undefined) bizInfoData.payout_account_holder = payout_account_holder?.trim();
    if (business_type !== undefined) bizInfoData.tosspayments_business_type = business_type;

    if (Object.keys(bizInfoData).length > 0) {
      const { error: bizInfoError } = await supabase
        .from("partner_business_info")
        .upsert(
          { partner_id: existingPartner.id, ...bizInfoData },
          { onConflict: "partner_id" }
        );

      if (bizInfoError) {
        console.error("Failed to update partner_business_info:", bizInfoError.message);
      }
    }

    // Update partner_categories if provided
    if (categories !== undefined && Array.isArray(categories)) {
      // Delete existing categories and insert new ones
      await supabase
        .from("partner_categories")
        .delete()
        .eq("user_id", user.id);

      if (categories.length > 0) {
        const categoryRecords = categories.map((cat: any) => ({
          user_id: user.id,
          category_id: cat.category_id,
          detail_category_id: cat.detail_category_id || null,
        }));

        const { error: categoriesError } = await supabase
          .from("partner_categories")
          .insert(categoryRecords);

        if (categoriesError) {
          console.error("Failed to update partner_categories:", categoriesError.message);
        }
      }
    }

    return successResponse(res, {
      partner: updatedPartner,
      message: "Partner application updated successfully",
    });
  })
);

export default router;
