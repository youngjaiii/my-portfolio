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
 * /api/partner-settlement/withdraw:
 *   post:
 *     summary: 출금 요청 제출
 *     tags: [Partner Settlement]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - bank_info
 *             properties:
 *               amount:
 *                 type: integer
 *                 minimum: 1000
 *                 description: 출금 금액 (최소 1000 포인트)
 *               bank_info:
 *                 type: object
 *                 description: 은행 정보
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: 성공
 *       400:
 *         description: 포인트 부족 또는 최소 금액 미달
 */
// POST /withdraw - Submit withdrawal request
router.post(
  "/withdraw",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const body = req.body;

    if (!body || !body.amount || !body.bank_info) {
      return errorResponse(res, "INVALID_BODY", "Amount and bank info are required");
    }

    const { amount, bank_info, notes } = body;

    const supabase = createSupabaseClient();

    // Get user's partner info (with partner_business_info for tosspayments_seller_id)
    const { data: partnerData, error: partnerError } = await supabase
      .from("partners")
      .select("id, total_points, partner_business_info(tosspayments_seller_id)")
      .eq("member_id", user.id)
      .single();

    if (partnerError) {
      if (partnerError.code === "PGRST116") {
        return errorResponse(res, "NOT_A_PARTNER", "User is not a partner");
      }
      throw partnerError;
    }

    const bizInfo = (partnerData?.partner_business_info as any)?.[0] || partnerData?.partner_business_info;
    // Check if seller ID exists (셀러 ID가 없으면 출금 불가)
    if (!bizInfo?.tosspayments_seller_id) {
      console.error("❌ Withdrawal request rejected: Missing tosspayments_seller_id", {
        partnerId: partnerData.id,
        memberId: user.id,
        amount,
      });
      return errorResponse(
        res,
        "WITHDRAWAL_DISABLED",
        "출금을 위해서는 토스페이먼츠 셀러 등록이 필요합니다.",
        null,
        403
      );
    }

    // Check if user has enough points
    if (partnerData.total_points < amount) {
      return errorResponse(res, "INSUFFICIENT_POINTS", "Insufficient points for withdrawal");
    }

    // Minimum withdrawal amount check
    if (amount < 1000) {
      return errorResponse(res, "MINIMUM_WITHDRAWAL", "Minimum withdrawal amount is 1000 points");
    }

    // Create withdrawal request
    // bank_info에서 bank_name, bank_owner, bank_num 추출
    const bankName = bank_info?.bank_name || bank_info?.bankName || null;
    const bankOwner = bank_info?.bank_owner || bank_info?.bankOwner || null;
    const bankNum = bank_info?.bank_num || bank_info?.bankNum || null;

    const { data: withdrawalRequest, error: createError } = await supabase
      .from("partner_withdrawals")
      .insert({
        partner_id: partnerData.id,
        requested_amount: amount,
        bank_name: bankName,
        bank_owner: bankOwner,
        bank_num: bankNum,
        status: "pending",
      })
      .select()
      .single();

    if (createError) throw createError;

    // 출금 신청 시 포인트 로그 기록
    const { error: logError } = await supabase
      .from("partner_points_logs")
      .insert({
        partner_id: partnerData.id,
        type: "spend",
        amount: amount,
        description: `출금 신청 (대기 중, 요청 금액: ${amount} 포인트)`,
        log_id: withdrawalRequest.id.toString(),
      });

    if (logError) {
      console.error("❌ Failed to add log for withdrawal request:", logError);
      // 로그 추가 실패는 경고만 하고 계속 진행 (출금 신청은 이미 성공)
      console.warn("⚠️  Warning: Failed to add log for withdrawal request, but withdrawal request was created");
    } else {
      console.log(`✅ Added log for withdrawal request: ${withdrawalRequest.id}`);
    }

    return successResponse(res, {
      withdrawal: withdrawalRequest,
      message: "Withdrawal request submitted successfully",
    });
  })
);

/**
 * @swagger
 * /api/partner-settlement/payment-info:
 *   put:
 *     summary: 결제 정산 정보 업데이트 (Toss 관련)
 *     tags: [Partner Settlement]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               payoutBankCode:
 *                 type: string
 *               payoutBankName:
 *                 type: string
 *               payoutAccountNumber:
 *                 type: string
 *               payoutAccountHolder:
 *                 type: string
 *               businessType:
 *                 type: string
 *     responses:
 *       200:
 *         description: 성공
 */
// PUT /payment-info - Update payment settlement info (Toss related)
router.put(
  "/payment-info",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const body = req.body;

    if (!body) {
      return errorResponse(res, "INVALID_BODY", "Request body is required");
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
      throw partnerError;
    }

    // Update only payment settlement related fields (in partner_business_info table)
    const bizInfoUpdateData: Record<string, any> = {
      partner_id: partnerData.id,
    };

    // Toss Payments related fields
    if (body.payoutBankCode !== undefined) bizInfoUpdateData.payout_bank_code = body.payoutBankCode;
    if (body.payoutBankName !== undefined) bizInfoUpdateData.payout_bank_name = body.payoutBankName;
    if (body.payoutAccountNumber !== undefined)
      bizInfoUpdateData.payout_account_number = body.payoutAccountNumber;
    if (body.payoutAccountHolder !== undefined)
      bizInfoUpdateData.payout_account_holder = body.payoutAccountHolder;
    if (body.businessType !== undefined)
      bizInfoUpdateData.tosspayments_business_type = body.businessType;

    const { data: updatedBizInfo, error: updateError } = await supabase
      .from("partner_business_info")
      .upsert(bizInfoUpdateData, { onConflict: "partner_id" })
      .select()
      .single();

    if (updateError) throw updateError;

    return successResponse(res, {
      partnerBusinessInfo: updatedBizInfo,
      message: "Payment settlement info updated successfully",
    });
  })
);

/**
 * @swagger
 * /api/partner-settlement/stats:
 *   get:
 *     summary: 정산 통계 조회
 *     tags: [Partner Settlement]
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
 *                     totalPoints:
 *                       type: integer
 *                     pendingWithdrawals:
 *                       type: integer
 *                     withdrawalHistory:
 *                       type: array
 *                     paymentInfoSet:
 *                       type: boolean
 */
// GET /stats - Get settlement statistics
router.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);

    const supabase = createSupabaseClient();

    // Get user's partner info (with partner_business_info for payment fields)
    const { data: partnerData, error: partnerError } = await supabase
      .from("partners")
      .select("id, total_points, partner_business_info(payout_bank_name, payout_account_number, tosspayments_seller_id)")
      .eq("member_id", user.id)
      .single();

    if (partnerError) {
      console.error("❌ Failed to fetch partner data for stats:", {
        error: partnerError,
        memberId: user.id,
      });
      if (partnerError.code === "PGRST116") {
        return errorResponse(res, "NOT_A_PARTNER", "User is not a partner");
      }
      throw partnerError;
    }

    const bizInfo = (partnerData?.partner_business_info as any)?.[0] || partnerData?.partner_business_info || {};

    // Get withdrawal requests
    const { data: withdrawalRequests, error: withdrawalError } = await supabase
      .from("partner_withdrawals")
      .select("*")
      .eq("partner_id", partnerData.id)
      .order("created_at", { ascending: false });

    if (withdrawalError) {
      console.error("❌ Failed to fetch withdrawal requests:", {
        error: withdrawalError,
        partnerId: partnerData.id,
      });
      throw withdrawalError;
    }

    // Calculate pending withdrawal amount
    const pendingWithdrawals =
      withdrawalRequests
        ?.filter((request) => request.status === "pending")
        ?.reduce((sum, request) => sum + (request.requested_amount || 0), 0) || 0;

    // Check if withdrawal is disabled (셀러 ID가 없으면 출금 불가)
    const withdrawalDisabled = !bizInfo?.tosspayments_seller_id;

    if (withdrawalDisabled) {
      console.warn("⚠️  Withdrawal disabled: Missing tosspayments_seller_id", {
        partnerId: partnerData.id,
        memberId: user.id,
      });
    }

    const stats = {
      totalPoints: partnerData.total_points || 0,
      pendingWithdrawals,
      withdrawalHistory: withdrawalRequests || [],
      paymentInfoSet: !!(bizInfo?.payout_bank_name && bizInfo?.payout_account_number),
      withdrawalDisabled, // 셀러 ID가 없으면 true
    };

    return successResponse(res, stats);
  })
);

/**
 * @swagger
 * /api/partner-settlement/withdraw-store-points:
 *   post:
 *     summary: 스토어 포인트 출금 요청 제출
 *     tags: [Partner Settlement]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - bank_info
 *             properties:
 *               amount:
 *                 type: integer
 *                 minimum: 1000
 *                 description: 출금 금액 (최소 1000 포인트)
 *               bank_info:
 *                 type: object
 *                 description: 은행 정보
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: 성공
 *       400:
 *         description: 포인트 부족 또는 최소 금액 미달
 */
// POST /withdraw-store-points - Submit store points withdrawal request
router.post(
  "/withdraw-store-points",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const body = req.body;

    if (!body || !body.amount || !body.bank_info) {
      return errorResponse(res, "INVALID_BODY", "Amount and bank info are required");
    }

    const { amount, bank_info, notes } = body;

    const supabase = createSupabaseClient();

    // Get user's partner info (with partner_business_info for tosspayments_seller_id)
    const { data: partnerData, error: partnerError } = await supabase
      .from("partners")
      .select("id, store_points, partner_business_info(tosspayments_seller_id)")
      .eq("member_id", user.id)
      .single();

    if (partnerError) {
      if (partnerError.code === "PGRST116") {
        return errorResponse(res, "NOT_A_PARTNER", "User is not a partner");
      }
      throw partnerError;
    }

    const bizInfo = (partnerData?.partner_business_info as any)?.[0] || partnerData?.partner_business_info;
    // Check if seller ID exists (셀러 ID가 없으면 출금 불가)
    if (!bizInfo?.tosspayments_seller_id) {
      console.error("❌ Store points withdrawal request rejected: Missing tosspayments_seller_id", {
        partnerId: partnerData.id,
        memberId: user.id,
        amount,
      });
      return errorResponse(
        res,
        "WITHDRAWAL_DISABLED",
        "출금을 위해서는 토스페이먼츠 셀러 등록이 필요합니다.",
        null,
        403
      );
    }

    // Check if user has enough store points
    if ((partnerData.store_points || 0) < amount) {
      return errorResponse(res, "INSUFFICIENT_POINTS", "Insufficient store points for withdrawal");
    }

    // Minimum withdrawal amount check
    if (amount < 1000) {
      return errorResponse(res, "MINIMUM_WITHDRAWAL", "Minimum withdrawal amount is 1000 points");
    }

    // Create withdrawal request with withdrawal_type
    const bankName = bank_info?.bank_name || bank_info?.bankName || null;
    const bankOwner = bank_info?.bank_owner || bank_info?.bankOwner || null;
    const bankNum = bank_info?.bank_num || bank_info?.bankNum || null;

    const { data: withdrawalRequest, error: createError } = await supabase
      .from("partner_withdrawals")
      .insert({
        partner_id: partnerData.id,
        requested_amount: amount,
        bank_name: bankName,
        bank_owner: bankOwner,
        bank_num: bankNum,
        status: "pending",
        withdrawal_type: "store_points",
      })
      .select()
      .single();

    if (createError) throw createError;

    // 출금 신청 시 포인트 로그 기록
    const { error: logError } = await supabase
      .from("partner_points_logs")
      .insert({
        partner_id: partnerData.id,
        type: "spend",
        amount: amount,
        description: `스토어 포인트 출금 신청 (대기 중, 요청 금액: ${amount} 포인트)`,
        log_id: `store_${withdrawalRequest.id.toString()}`,
      });

    if (logError) {
      console.error("❌ Failed to add log for store points withdrawal request:", logError);
      console.warn("⚠️  Warning: Failed to add log for store points withdrawal request, but withdrawal request was created");
    } else {
      console.log(`✅ Added log for store points withdrawal request: ${withdrawalRequest.id}`);
    }

    return successResponse(res, {
      withdrawal: withdrawalRequest,
      message: "Store points withdrawal request submitted successfully",
    });
  })
);

/**
 * @swagger
 * /api/partner-settlement/withdraw-collaboration-store-points:
 *   post:
 *     summary: 협업 스토어 포인트 출금 요청 제출
 *     tags: [Partner Settlement]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - bank_info
 *             properties:
 *               amount:
 *                 type: integer
 *                 minimum: 1000
 *                 description: 출금 금액 (최소 1000 포인트)
 *               bank_info:
 *                 type: object
 *                 description: 은행 정보
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: 성공
 *       400:
 *         description: 포인트 부족 또는 최소 금액 미달
 */
// POST /withdraw-collaboration-store-points - Submit collaboration store points withdrawal request
router.post(
  "/withdraw-collaboration-store-points",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const body = req.body;

    if (!body || !body.amount || !body.bank_info) {
      return errorResponse(res, "INVALID_BODY", "Amount and bank info are required");
    }

    const { amount, bank_info, notes } = body;

    const supabase = createSupabaseClient();

    // Get user's partner info (with partner_business_info for tosspayments_seller_id)
    const { data: partnerData, error: partnerError } = await supabase
      .from("partners")
      .select("id, collaboration_store_points, partner_business_info(tosspayments_seller_id)")
      .eq("member_id", user.id)
      .single();

    if (partnerError) {
      if (partnerError.code === "PGRST116") {
        return errorResponse(res, "NOT_A_PARTNER", "User is not a partner");
      }
      throw partnerError;
    }

    const bizInfo = (partnerData?.partner_business_info as any)?.[0] || partnerData?.partner_business_info;
    // Check if seller ID exists (셀러 ID가 없으면 출금 불가)
    if (!bizInfo?.tosspayments_seller_id) {
      console.error("❌ Collaboration store points withdrawal request rejected: Missing tosspayments_seller_id", {
        partnerId: partnerData.id,
        memberId: user.id,
        amount,
      });
      return errorResponse(
        res,
        "WITHDRAWAL_DISABLED",
        "출금을 위해서는 토스페이먼츠 셀러 등록이 필요합니다.",
        null,
        403
      );
    }

    // Check if user has enough collaboration store points
    if ((partnerData.collaboration_store_points || 0) < amount) {
      return errorResponse(res, "INSUFFICIENT_POINTS", "Insufficient collaboration store points for withdrawal");
    }

    // Minimum withdrawal amount check
    if (amount < 1000) {
      return errorResponse(res, "MINIMUM_WITHDRAWAL", "Minimum withdrawal amount is 1000 points");
    }

    // Create withdrawal request with withdrawal_type
    const bankName = bank_info?.bank_name || bank_info?.bankName || null;
    const bankOwner = bank_info?.bank_owner || bank_info?.bankOwner || null;
    const bankNum = bank_info?.bank_num || bank_info?.bankNum || null;

    const { data: withdrawalRequest, error: createError } = await supabase
      .from("partner_withdrawals")
      .insert({
        partner_id: partnerData.id,
        requested_amount: amount,
        bank_name: bankName,
        bank_owner: bankOwner,
        bank_num: bankNum,
        status: "pending",
        withdrawal_type: "collaboration_store_points",
      })
      .select()
      .single();

    if (createError) throw createError;

    // 출금 신청 시 포인트 로그 기록
    const { error: logError } = await supabase
      .from("partner_points_logs")
      .insert({
        partner_id: partnerData.id,
        type: "spend",
        amount: amount,
        description: `협업 스토어 포인트 출금 신청 (대기 중, 요청 금액: ${amount} 포인트)`,
        log_id: `collab_${withdrawalRequest.id.toString()}`,
      });

    if (logError) {
      console.error("❌ Failed to add log for collaboration store points withdrawal request:", logError);
      console.warn("⚠️  Warning: Failed to add log for collaboration store points withdrawal request, but withdrawal request was created");
    } else {
      console.log(`✅ Added log for collaboration store points withdrawal request: ${withdrawalRequest.id}`);
    }

    return successResponse(res, {
      withdrawal: withdrawalRequest,
      message: "Collaboration store points withdrawal request submitted successfully",
    });
  })
);

export default router;
