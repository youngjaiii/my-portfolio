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
 * /api/partner-profile/update:
 *   put:
 *     summary: 파트너 프로필 업데이트
 *     tags: [Partner Profile]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               partnerName:
 *                 type: string
 *               partnerMessage:
 *                 type: string
 *               gameInfos:
 *                 type: object
 *               backgroundImages:
 *                 type: array
 *               legalName:
 *                 type: string
 *               legalEmail:
 *                 type: string
 *               legalPhone:
 *                 type: string
 *               profileImage:
 *                 type: string
 *               favoriteGame:
 *                 type: array
 *                 items:
 *                   type: string
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
 *         description: 성공
 */
// PUT /update - Update partner profile info (excluding Toss payment info)
router.put(
  "/update",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const body = req.body;

    if (!body || Object.keys(body).length === 0) {
      return errorResponse(res, "INVALID_BODY", "Request body is required");
    }

    // Block attempts to modify sensitive fields
    const blockedFields = [
      'total_points', 'id', 'member_id', 'partner_status', 'created_at', 'updated_at',
      'tosspayments_seller_id', 'tosspayments_ref_seller_id', 'tosspayments_status',
      'tosspayments_synced_at', 'tosspayments_last_error', 'tax', 'ben_lists',
      'payout_bank_code', 'payout_bank_name', 'payout_account_number', 'payout_account_holder'
    ];
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

    const supabase = createSupabaseClient();

    // Get user's partner info
    const { data: partnerData, error: partnerError } = await supabase
      .from("partners")
      .select("id")
      .eq("member_id", user.id)
      .single();

    if (partnerError) {
      if (partnerError.code === "PGRST116") {
        return errorResponse(res, "NOT_A_PARTNER", "User is not a partner");
      }
      return errorResponse(
        res,
        "PROFILE_UPDATE_ERROR",
        "Failed to update partner profile",
        partnerError.message
      );
    }

    // Update only profile related fields (excluding Toss payment info)
    const updateData: any = {};

    // Profile fields (partners 테이블)
    if (body.partnerName !== undefined)
      updateData.partner_name = body.partnerName?.trim();
    if (body.partnerMessage !== undefined)
      updateData.partner_message = body.partnerMessage?.trim();
    if (body.gameInfos !== undefined) updateData.game_info = body.gameInfos;
    if (body.backgroundImages !== undefined)
      updateData.background_images = body.backgroundImages;

    // Update partners table
    let updatedPartner = null;
    if (Object.keys(updateData).length > 0) {
      const { data, error: partnerUpdateError } = await supabase
        .from("partners")
        .update(updateData)
        .eq("id", partnerData.id)
        .select()
        .single();

      if (partnerUpdateError) {
        return errorResponse(
          res,
          "PROFILE_UPDATE_ERROR",
          "Failed to update partner profile",
          partnerUpdateError.message
        );
      }
      updatedPartner = data;
    }

    // Update partner_business_info table for legal info
    const bizInfoUpdateData: any = {};
    if (body.legalName !== undefined)
      bizInfoUpdateData.legal_name = body.legalName?.trim();
    if (body.legalEmail !== undefined)
      bizInfoUpdateData.legal_email = body.legalEmail?.trim();
    if (body.legalPhone !== undefined)
      bizInfoUpdateData.legal_phone = body.legalPhone?.trim();

    if (Object.keys(bizInfoUpdateData).length > 0) {
      const { error: bizInfoUpdateError } = await supabase
        .from("partner_business_info")
        .upsert({
          partner_id: partnerData.id,
          ...bizInfoUpdateData,
        }, { onConflict: "partner_id" });

      if (bizInfoUpdateError) {
        return errorResponse(
          res,
          "PROFILE_UPDATE_ERROR",
          "Failed to update partner business info",
          bizInfoUpdateError.message
        );
      }
    }

    // Update member profile if provided
    const memberUpdateData: any = {};
    if (body.partnerName !== undefined)
      memberUpdateData.name = body.partnerName?.trim();
    if (body.profileImage !== undefined)
      memberUpdateData.profile_image = body.profileImage;
    if (body.favoriteGame !== undefined)
      memberUpdateData.favorite_game = body.favoriteGame;

    if (Object.keys(memberUpdateData).length > 0) {
      const { error: memberUpdateError } = await supabase
        .from("members")
        .update(memberUpdateData)
        .eq("id", user.id);

      if (memberUpdateError) {
        return errorResponse(
          res,
          "PROFILE_UPDATE_ERROR",
          "Failed to update partner profile",
          memberUpdateError.message
        );
      }
    }

    // Update partner_categories if provided
    if (body.categories !== undefined && Array.isArray(body.categories)) {
      // Delete existing categories and insert new ones
      await supabase
        .from("partner_categories")
        .delete()
        .eq("user_id", user.id);

      if (body.categories.length > 0) {
        const categoryRecords = body.categories.map((cat: any) => ({
          user_id: user.id,
          category_id: cat.category_id,
          detail_category_id: cat.detail_category_id || null,
        }));

        const { error: categoriesError } = await supabase
          .from("partner_categories")
          .insert(categoryRecords);

        if (categoriesError) {
          return errorResponse(
            res,
            "PROFILE_UPDATE_ERROR",
            "Failed to update partner categories",
            categoriesError.message
          );
        }
      }
    }

    return successResponse(res, {
      partner: updatedPartner,
      message: "Partner profile updated successfully",
    });
  })
);

/**
 * @swagger
 * /api/partner-profile/info:
 *   get:
 *     summary: 파트너 프로필 정보 조회
 *     tags: [Partner Profile]
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
 *                     partner:
 *                       type: object
 *                     message:
 *                       type: string
 */
// GET /info - Get partner profile info
router.get(
  "/info",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();

    // Get complete partner profile info (including settlement fields from partner_business_info)
    const [partnerResult, categoriesResult] = await Promise.all([
      supabase
        .from("partners")
        .select(
          `
          id,
          member_id,
          partner_name,
          partner_message,
          partner_status,
          partner_applied_at,
          partner_reviewed_at,
          total_points,
          game_info,
          background_images,
          created_at,
          updated_at,
          members!member_id (
            id, name, profile_image, favorite_game, email
          ),
          partner_business_info (
            legal_name,
            legal_email,
            legal_phone,
            payout_bank_code,
            payout_bank_name,
            payout_account_number,
            payout_account_holder,
            tosspayments_business_type,
            tosspayments_seller_id,
            tosspayments_status
          )
        `
        )
        .eq("member_id", user.id)
        .single(),
      // partner_categories uses user_id (auth user id), not partner_id
      supabase
        .from("partner_categories")
        .select("*")
        .eq("user_id", user.id)
    ]);

    const { data: partnerData, error: partnerError } = partnerResult;
    const { data: categoriesData } = categoriesResult;

    if (partnerError) {
      if (partnerError.code === "PGRST116") {
        return errorResponse(res, "NOT_A_PARTNER", "User is not a partner");
      }
      return errorResponse(
        res,
        "PROFILE_FETCH_ERROR",
        "Failed to fetch partner profile",
        partnerError.message
      );
    }

    // Flatten partner_business_info into the response for backward compatibility
    const bizInfo = (partnerData?.partner_business_info as any)?.[0] || partnerData?.partner_business_info || {};
    const { partner_business_info, ...partnerWithoutRelations } = partnerData as any;

    const flattenedPartner = {
      ...partnerWithoutRelations,
      legal_name: bizInfo.legal_name || null,
      legal_email: bizInfo.legal_email || null,
      legal_phone: bizInfo.legal_phone || null,
      payout_bank_code: bizInfo.payout_bank_code || null,
      payout_bank_name: bizInfo.payout_bank_name || null,
      payout_account_number: bizInfo.payout_account_number || null,
      payout_account_holder: bizInfo.payout_account_holder || null,
      tosspayments_business_type: bizInfo.tosspayments_business_type || null,
      tosspayments_seller_id: bizInfo.tosspayments_seller_id || null,
      tosspayments_status: bizInfo.tosspayments_status || null,
      categories: categoriesData || [],
    };

    return successResponse(res, {
      partner: flattenedPartner,
      message: "Partner profile retrieved successfully",
    });
  })
);

export default router;
