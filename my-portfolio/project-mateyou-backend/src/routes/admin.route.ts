import { Router, Request, Response, NextFunction } from "express";
import {
  createSupabaseClient,
  successResponse,
  errorResponse,
  getAuthUser,
  asyncHandler,
} from "../lib/utils";
import { createTossHeaders, getTossSecretKey } from "../lib/toss-auth";
import { decryptPayload } from "../lib/toss";

const router = Router();

// Middleware to check admin role
const requireAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();

    const { data: memberData, error: memberError } = await supabase
      .from("members")
      .select("role")
      .eq("id", user.id)
      .single();

    if (memberError || memberData.role !== "admin") {
      return errorResponse(
        res,
        "UNAUTHORIZED",
        "Admin access required",
        null,
        403
      );
    }

    // Attach user to request for later use
    (req as any).user = user;
    next();
  } catch (error: any) {
    if (
      error.message.includes("authorization") ||
      error.message.includes("token")
    ) {
      return errorResponse(
        res,
        "UNAUTHORIZED",
        "Authentication required",
        null,
        401
      );
    }
    return errorResponse(
      res,
      "INTERNAL_ERROR",
      "Internal server error",
      error.message,
      500
    );
  }
};

/**
 * @swagger
 * /api/admin/public/banners:
 *   get:
 *     summary: 활성 배너 목록 조회 (공개)
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: 성공
 */
// PUBLIC ENDPOINT: GET /public/banners - Get active banners (no auth required)
router.get(
  "/public/banners",
  asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt((req.query.page as string) || "1");
    const limit = parseInt((req.query.limit as string) || "20");
    const offset = (page - 1) * limit;

    const supabase = createSupabaseClient();

    try {
      const {
        data: banners,
        error: bannersError,
        count,
      } = await supabase
        .from("ad_banners")
        .select("*", { count: "exact" })
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (bannersError) throw bannersError;

      return successResponse(res, banners || [], {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      });
    } catch (error: any) {
      return errorResponse(
        res,
        "BANNERS_FETCH_ERROR",
        "Failed to fetch banners",
        error.message
      );
    }
  })
);

/**
 * @swagger
 * /api/admin/partners:
 *   get:
 *     summary: 파트너 목록 관리 (관리자 전용)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected]
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: 성공
 *       403:
 *         description: 관리자 권한 필요
 */
// GET /partners - Get all partners with status filter and search
router.get(
  "/partners",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const status = req.query.status as string;
    const search = req.query.search as string;
    const memberId = req.query.member_id as string;
    const page = parseInt((req.query.page as string) || "1");
    const limit = parseInt((req.query.limit as string) || "20");
    const offset = (page - 1) * limit;

    const supabase = createSupabaseClient();

    try {
      // member_id로 직접 조회하는 경우
      if (memberId) {
        const { data: partner, error: partnerError } = await supabase
          .from("partners")
          .select(
            `
            *,
            member:members!member_id(*),
            partner_business_info(legal_name, legal_email, tax, default_distribution_rate, collaboration_distribution_rate)
          `
          )
          .eq("member_id", memberId)
          .maybeSingle();

        if (partnerError) throw partnerError;

        return successResponse(res, partner ? [partner] : [], {
          total: partner ? 1 : 0,
          page: 1,
          limit: 1,
        });
      }

      // If search is provided, we need to search across partner and member fields
      if (search) {
        // Get status counts (RPC) and all partners in parallel
        const [statusCountsResult, allPartnersResult] = await Promise.all([
          supabase.rpc("get_partners_status_counts", { search_term: search }),
          supabase
            .from("partners")
            .select(
              `
                *,
                member:members!member_id(*),
                partner_business_info(legal_name, legal_email, tax, default_distribution_rate, collaboration_distribution_rate)
              `
            )
            .order("created_at", { ascending: false }),
        ]);

        if (statusCountsResult.error) throw statusCountsResult.error;
        if (allPartnersResult.error) throw allPartnersResult.error;

        // Filter by search term across partner and member fields
        const searchLower = search.toLowerCase();
        let filteredPartners = (allPartnersResult.data || []).filter(
          (partner: any) => {
            const member = partner.member;
            const bizInfo =
              (partner.partner_business_info as any)?.[0] ||
              partner.partner_business_info;
            return (
              partner.partner_name?.toLowerCase().includes(searchLower) ||
              bizInfo?.legal_name?.toLowerCase().includes(searchLower) ||
              member?.name?.toLowerCase().includes(searchLower) ||
              member?.member_code?.toLowerCase().includes(searchLower) ||
              member?.email?.toLowerCase().includes(searchLower)
            );
          }
        );

        // Apply status filter after search
        if (status) {
          filteredPartners = filteredPartners.filter(
            (partner: any) => partner.partner_status === status
          );
        }

        // Apply pagination to filtered results
        const paginatedPartners = filteredPartners.slice(
          offset,
          offset + limit
        );

        return successResponse(res, paginatedPartners, {
          total: filteredPartners.length,
          page,
          limit,
          statusCounts: statusCountsResult.data || {
            all: 0,
            pending: 0,
            approved: 0,
            rejected: 0,
          },
        });
      }

      // No search - use standard query with pagination
      // Get status counts (RPC) and partners data in parallel
      let partnersQuery = supabase.from("partners").select(
        `
            *,
            member:members!member_id(*),
            partner_business_info(legal_name, legal_email, tax, default_distribution_rate, collaboration_distribution_rate)
          `,
        { count: "exact" }
      );

      if (status) {
        partnersQuery = partnersQuery.eq("partner_status", status);
      }

      const [statusCountsResult, partnersResult] = await Promise.all([
        supabase.rpc("get_partners_status_counts", { search_term: null }),
        partnersQuery
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1),
      ]);

      if (statusCountsResult.error) throw statusCountsResult.error;
      if (partnersResult.error) throw partnersResult.error;

      return successResponse(res, partnersResult.data || [], {
        total: partnersResult.count || 0,
        page,
        limit,
        statusCounts: statusCountsResult.data || {
          all: 0,
          pending: 0,
          approved: 0,
          rejected: 0,
        },
      });
    } catch (error: any) {
      return errorResponse(
        res,
        "PARTNERS_FETCH_ERROR",
        "Failed to fetch partners",
        error.message
      );
    }
  })
);

/**
 * @swagger
 * /api/admin/partners/pending:
 *   get:
 *     summary: 대기 중인 파트너 전체 조회 (관리자 전용)
 *     description: status가 pending인 모든 파트너를 페이지네이션 없이 전부 조회합니다.
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 성공
 *       403:
 *         description: 관리자 권한 필요
 */
// GET /partners/pending - Get all pending partners without pagination
router.get(
  "/partners/pending",
  requireAdmin,
  asyncHandler(async (_req: Request, res: Response) => {
    const supabase = createSupabaseClient();

    try {
      const { data: partners, error: partnersError } = await supabase
        .from("partners")
        .select(
          `
            *,
            member:members!member_id(*),
            partner_business_info(legal_name, legal_email, tax, default_distribution_rate, collaboration_distribution_rate)
          `
        )
        .eq("partner_status", "pending")
        .order("created_at", { ascending: false });

      if (partnersError) throw partnersError;

      return successResponse(res, partners || [], {
        total: partners?.length || 0,
      });
    } catch (error: any) {
      return errorResponse(
        res,
        "PARTNERS_FETCH_ERROR",
        "Failed to fetch pending partners",
        error.message
      );
    }
  })
);

/**
 * @swagger
 * /api/admin/partners/{partnerId}:
 *   get:
 *     summary: 파트너 상세 조회 (관리자 전용)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: partnerId
 *         required: true
 *         schema:
 *           type: string
 *         description: 파트너 ID
 *     responses:
 *       200:
 *         description: 성공
 *       403:
 *         description: 관리자 권한 필요
 *       404:
 *         description: 파트너를 찾을 수 없음
 */
// GET /partners/:partnerId - Get single partner detail
router.get(
  "/partners/:partnerId",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const { partnerId } = req.params;

    if (!partnerId) {
      return errorResponse(res, "INVALID_PARTNER_ID", "Partner ID is required");
    }

    const supabase = createSupabaseClient();

    try {
      let partner: any = null;
      let partnerError: any = null;

      const { data: byId, error: errById } = await supabase
        .from("partners")
        .select(
          `
            *,
            member:members!member_id(*),
            partner_business_info(*)
          `
        )
        .eq("id", partnerId)
        .maybeSingle();
      if (!errById && byId) partner = byId;
      else partnerError = errById;

      if (!partner) {
        const { data: byMemberId, error: errByMember } = await supabase
          .from("partners")
          .select(
            `
              *,
              member:members!member_id(*),
              partner_business_info(*)
            `
          )
          .eq("member_id", partnerId)
          .maybeSingle();
        if (!errByMember && byMemberId) partner = byMemberId;
        else partnerError = errByMember;
      }

      if (!partner) {
        return errorResponse(
          res,
          "PARTNER_NOT_FOUND",
          "Partner not found",
          null,
          404
        );
      }

      const bizInfo =
        (partner?.partner_business_info as any)?.[0] ||
        partner?.partner_business_info ||
        {};
      const { partner_business_info, ...partnerWithoutBizInfo } =
        partner as any;

      const responsePartner = {
        ...partnerWithoutBizInfo,
        partner_business_info: {
          legal_name: bizInfo.legal_name || null,
          legal_email: bizInfo.legal_email || null,
          legal_phone: bizInfo.legal_phone || null,
          tax: bizInfo.tax || null,
          default_distribution_rate: bizInfo.default_distribution_rate || null,
          collaboration_distribution_rate: bizInfo.collaboration_distribution_rate || null,
          payout_bank_code: bizInfo.payout_bank_code || null,
          payout_bank_name: bizInfo.payout_bank_name || null,
          payout_account_number: bizInfo.payout_account_number || null,
          payout_account_holder: bizInfo.payout_account_holder || null,
        },
      };

      return successResponse(res, {
        partner: responsePartner,
        message: "Partner retrieved successfully",
      });
    } catch (error: any) {
      return errorResponse(
        res,
        "PARTNER_FETCH_ERROR",
        "Failed to fetch partner",
        error.message
      );
    }
  })
);

/**
 * @swagger
 * /api/admin/partners/{partnerId}/status:
 *   put:
 *     summary: 파트너 상태 업데이트 (관리자 전용)
 *     description: |
 *       파트너 신청을 승인, 거부 또는 대기 상태로 변경합니다.
 *
 *       **중요:**
 *       - 이 API는 파트너 상태만 변경합니다.
 *       - 승인 후에도 Toss Seller는 자동으로 생성되지 않습니다.
 *       - 정산 기능을 사용하려면 별도로 `POST /api/toss/seller` API를 호출하여 Toss Seller를 등록해야 합니다.
 *
 *       **파트너 상태:**
 *       - `pending`: 승인 대기 중
 *       - `approved`: 승인됨 (파트너 활동 가능)
 *       - `rejected`: 거부됨
 *
 *       **워크플로우:**
 *       1. 사용자가 파트너 신청 (`POST /api/auth/partner-apply`)
 *       2. **이 API로 승인/거부 처리**
 *       3. 승인 후 Toss Seller 등록 (`POST /api/toss/seller`)
 *       4. 정산 기능 사용 가능
 *
 *       **참고:**
 *       - 상세 가이드: [Partner 및 Toss Seller 가이드](https://github.com/mateyou2025/mateyou-backend/blob/main/docs/PARTNER_TOSS_GUIDE.md)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: partnerId
 *         required: true
 *         description: 파트너 ID 또는 회원 ID (둘 다 지원)
 *         schema:
 *           type: string
 *         example: "123e4567-e89b-12d3-a456-426614174000"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 description: 변경할 상태
 *                 enum: [pending, approved, rejected]
 *                 example: "approved"
 *     responses:
 *       200:
 *         description: 상태 업데이트 성공
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
 *                     partner:
 *                       type: object
 *                       description: 업데이트된 파트너 정보
 *                     message:
 *                       type: string
 *                       example: "Partner status updated successfully"
 *       400:
 *         description: 잘못된 요청 (유효하지 않은 status 값)
 *       403:
 *         description: 관리자 권한 필요
 *       404:
 *         description: 파트너를 찾을 수 없음
 */
// PUT /partners/:partnerId/status - Update partner status
router.put(
  "/partners/:partnerId/status",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const { partnerId } = req.params;
    const { status } = req.body;

    if (!partnerId) {
      return errorResponse(res, "INVALID_PARTNER_ID", "Partner ID is required");
    }

    if (!status) {
      return errorResponse(res, "INVALID_BODY", "Status is required");
    }

    // Validate status
    if (!["pending", "approved", "rejected"].includes(status)) {
      return errorResponse(res, "INVALID_STATUS", "Invalid status value");
    }

    const supabase = createSupabaseClient();

    try {
      // 먼저 partnerId가 partners.id인지 member_id인지 확인
      let { data: partnerCheck } = await supabase
        .from("partners")
        .select("id")
        .eq("id", partnerId)
        .maybeSingle();

      // partners.id로 찾지 못하면 member_id로 찾기
      if (!partnerCheck) {
        const { data: memberPartnerCheck } = await supabase
          .from("partners")
          .select("id")
          .eq("member_id", partnerId)
          .maybeSingle();
        partnerCheck = memberPartnerCheck;
      }

      if (!partnerCheck) {
        return errorResponse(res, "PARTNER_NOT_FOUND", "Partner not found");
      }

      const actualPartnerId = partnerCheck.id;

      const updateData: any = {
        partner_status: status,
        partner_reviewed_at: new Date().toISOString(),
      };

      // 업데이트 실행
      const { error: updateError } = await supabase
        .from("partners")
        .update(updateData)
        .eq("id", actualPartnerId);

      if (updateError) throw updateError;

      // 업데이트된 파트너 정보 조회 (join 없이 먼저 조회)
      const { data: updatedPartner, error: fetchError } = await supabase
        .from("partners")
        .select(
          `
            *,
            member:members!member_id(*)
          `
        )
        .eq("id", actualPartnerId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (!updatedPartner) {
        return errorResponse(
          res,
          "PARTNER_NOT_FOUND",
          "Partner not found after update"
        );
      }

      return successResponse(res, {
        partner: updatedPartner,
        message: "Partner status updated successfully",
      });
    } catch (error: any) {
      return errorResponse(
        res,
        "PARTNER_UPDATE_ERROR",
        "Failed to update partner status",
        error.message
      );
    }
  })
);

// PUT /partners/:partnerId/tax - Update partner tax
router.put(
  "/partners/:partnerId/tax",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const { partnerId } = req.params;
    const { tax } = req.body;

    if (!partnerId) {
      return errorResponse(res, "INVALID_PARTNER_ID", "Partner ID is required");
    }

    if (tax === undefined) {
      return errorResponse(res, "INVALID_BODY", "Tax value is required");
    }

    // Validate tax value
    if (typeof tax !== "number" || tax < 0 || tax > 100) {
      return errorResponse(
        res,
        "INVALID_TAX",
        "Tax must be a number between 0 and 100"
      );
    }

    const supabase = createSupabaseClient();

    try {
      // First verify partner exists
      const { data: partner, error: partnerError } = await supabase
        .from("partners")
        .select("id")
        .eq("id", partnerId)
        .single();

      if (partnerError || !partner) {
        return errorResponse(
          res,
          "PARTNER_NOT_FOUND",
          "Partner not found",
          null,
          404
        );
      }

      // Update tax in partner_business_info table
      const { error: updateError } = await supabase
        .from("partner_business_info")
        .upsert({ partner_id: partnerId, tax }, { onConflict: "partner_id" });

      if (updateError) throw updateError;

      // Fetch updated partner with business info
      const { data: updatedPartner, error: fetchError } = await supabase
        .from("partners")
        .select(
          `
            *,
            member:members!member_id(*),
            partner_business_info(tax)
          `
        )
        .eq("id", partnerId)
        .single();

      if (fetchError) throw fetchError;

      // Flatten response
      const bizInfo =
        (updatedPartner?.partner_business_info as any)?.[0] ||
        updatedPartner?.partner_business_info ||
        {};
      const { partner_business_info, ...partnerWithoutBizInfo } =
        updatedPartner as any;

      return successResponse(res, {
        partner: { ...partnerWithoutBizInfo, tax: bizInfo.tax || null },
        message: "Partner tax updated successfully",
      });
    } catch (error: any) {
      return errorResponse(
        res,
        "PARTNER_TAX_UPDATE_ERROR",
        "Failed to update partner tax",
        error.message
      );
    }
  })
);

/**
 * @swagger
 * /api/admin/partners/{partnerId}/toss-seller:
 *   delete:
 *     summary: 파트너의 토스페이먼츠 셀러 삭제 (관리자 전용)
 *     description: |
 *       파트너의 토스페이먼츠 지급대행 셀러를 삭제하고, partners 테이블의 토스페이먼츠 관련 정보를 초기화합니다.
 *       참고: https://docs.tosspayments.com/reference#%EC%85%80%EB%9F%AC-%EC%82%AD%EC%A0%9C
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: partnerId
 *         required: true
 *         schema:
 *           type: string
 *         description: 파트너 ID
 *       - in: header
 *         name: x-is-production
 *         schema:
 *           type: string
 *         description: 프로덕션 환경 여부 (true/false)
 *     responses:
 *       200:
 *         description: 셀러 삭제 성공
 *       404:
 *         description: 파트너 또는 셀러를 찾을 수 없음
 *       500:
 *         description: 토스페이먼츠 API 오류 또는 설정 오류
 */
// DELETE /partners/:partnerId/toss-seller - Delete Toss Payments seller for partner
router.delete(
  "/partners/:partnerId/toss-seller",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const { partnerId } = req.params;

    if (!partnerId) {
      return errorResponse(res, "INVALID_PARTNER_ID", "Partner ID is required");
    }

    const supabase = createSupabaseClient();

    try {
      // 파트너 정보 조회 (토스페이먼츠 셀러 ID 포함 - partner_business_info에서)
      const { data: partnerData, error: partnerError } = await supabase
        .from("partners")
        .select(
          "id, partner_business_info(tosspayments_seller_id, tosspayments_ref_seller_id)"
        )
        .eq("id", partnerId)
        .single();

      if (partnerError) {
        if (partnerError.code === "PGRST116") {
          return errorResponse(
            res,
            "PARTNER_NOT_FOUND",
            "Partner not found",
            null,
            404
          );
        }
        throw partnerError;
      }

      const bizInfo =
        (partnerData?.partner_business_info as any)?.[0] ||
        partnerData?.partner_business_info;
      // 토스페이먼츠 셀러 ID가 없으면 에러
      if (!bizInfo?.tosspayments_seller_id) {
        return errorResponse(
          res,
          "SELLER_NOT_FOUND",
          "이 파트너는 토스페이먼츠 셀러가 등록되어 있지 않습니다.",
          { partnerId },
          404
        );
      }

      const sellerId = bizInfo.tosspayments_seller_id;

      // Get production mode from header
      const isProductionValue =
        req.headers["x-is-production"] === "true" ||
        req.headers["x-is-production"] === "1";
      const tossSecretKey = getTossSecretKey(isProductionValue);

      if (!tossSecretKey) {
        return errorResponse(
          res,
          "TOSS_CONFIG_MISSING",
          "토스페이먼츠 설정이 없습니다.",
          {
            hint: "환경 변수에 TOSS_PAY_PROD_SECRET_KEY 또는 TOSS_PAY_DEV_SECRET_KEY를 설정해주세요.",
          },
          500
        );
      }

      // 토스페이먼츠 API 호출하여 셀러 삭제
      const tossHeaders = createTossHeaders(tossSecretKey);
      tossHeaders["TossPayments-api-security-mode"] = "ENCRYPTION";
      delete tossHeaders["Content-Type"];

      const url = `https://api.tosspayments.com/v2/sellers/${sellerId}`;
      console.log("🔍 Calling Toss Payments Delete Seller API (v2)...", {
        url,
        sellerId,
        partnerId,
        isProduction: isProductionValue,
      });

      const tossResponse = await fetch(url, {
        method: "DELETE",
        headers: tossHeaders,
      });

      const responseText = await tossResponse.text();
      console.log("📥 Toss Delete Seller API Response:", {
        status: tossResponse.status,
        statusText: tossResponse.statusText,
        bodyLength: responseText.length,
        bodyPreview: responseText.substring(0, 200),
      });

      if (!tossResponse.ok) {
        let errorData: any;
        let errorMessage = "알 수 없는 오류";

        // 에러 응답이 암호화된 JWE 토큰일 수 있으므로 복호화 시도
        const trimmedResponse = responseText.trim();
        const isJWE =
          trimmedResponse.includes(".") &&
          trimmedResponse.split(".").length === 5;

        if (isJWE) {
          try {
            const usePythonEncryption =
              process.env.TOSS_USE_PYTHON_ENCRYPTION === "true" ||
              req.headers["x-use-python-encryption"] === "true";

            const decryptedError = await decryptPayload(
              trimmedResponse,
              isProductionValue,
              usePythonEncryption
            );
            errorData = decryptedError;

            if (typeof decryptedError === "object" && decryptedError !== null) {
              const errorEntityBody =
                decryptedError?.entityBody || decryptedError;
              errorMessage =
                errorEntityBody?.message ||
                errorEntityBody?.error?.message ||
                decryptedError?.message ||
                decryptedError?.error?.message ||
                JSON.stringify(decryptedError);
            } else {
              errorMessage =
                typeof decryptedError === "string"
                  ? decryptedError
                  : String(decryptedError);
            }
          } catch (decryptError: any) {
            console.error("❌ Failed to decrypt error response:", decryptError);
            errorData = {
              encryptedMessage: trimmedResponse,
              decryptError: decryptError.message,
            };
            errorMessage = `에러 응답 복호화 실패: ${decryptError.message}`;
          }
        } else {
          try {
            errorData = JSON.parse(responseText);
            errorMessage =
              errorData.message ||
              errorData.error?.message ||
              "알 수 없는 오류";
          } catch {
            errorData = { message: responseText };
            errorMessage = responseText;
          }
        }

        // 404 에러인 경우 더 자세한 정보 제공
        if (tossResponse.status === 404) {
          return errorResponse(
            res,
            "TOSS_SELLER_NOT_FOUND",
            `토스페이먼츠 셀러를 찾을 수 없습니다: ${errorMessage}`,
            {
              sellerId,
              partnerId,
              status: 404,
              url,
              errorData,
            },
            404
          );
        }

        return errorResponse(
          res,
          "TOSS_API_ERROR",
          `셀러 삭제 실패: ${errorMessage}`,
          {
            sellerId,
            partnerId,
            ...errorData,
          },
          tossResponse.status
        );
      }

      // Step 1: 환전 대기 포인트들을 먼저 rejected로 처리 (partners 테이블 업데이트 전에)
      const { data: rejectedWithdrawals, error: rejectWithdrawalsError } =
        await supabase
          .from("partner_withdrawals")
          .update({
            status: "rejected",
            reviewed_at: new Date().toISOString(),
          })
          .eq("partner_id", partnerId)
          .eq("status", "pending")
          .select();

      if (rejectWithdrawalsError) {
        console.error(
          "❌ Failed to reject pending withdrawals:",
          rejectWithdrawalsError
        );
        // 환전 거부 실패는 경고만 하고 계속 진행 (셀러 삭제는 이미 성공)
        console.warn(
          "⚠️  Warning: Failed to reject pending withdrawals, but seller deletion succeeded"
        );
      } else if (rejectedWithdrawals && rejectedWithdrawals.length > 0) {
        console.log(
          `✅ Rejected ${rejectedWithdrawals.length} pending withdrawal(s) for partner ${partnerId}`
        );

        // 거절된 출금 요청들에 대해 로그 추가
        for (const withdrawal of rejectedWithdrawals) {
          const { error: logError } = await supabase
            .from("partner_points_logs")
            .insert({
              partner_id: withdrawal.partner_id,
              type: "earn", // 거절은 earn 타입으로 기록
              amount: withdrawal.requested_amount, // 취소된 포인트 금액 기록
              description: `출금 요청 거절 (셀러 삭제로 인한 자동 거절, 요청 금액: ${withdrawal.requested_amount} 포인트)`,
              log_id: withdrawal.id.toString(),
            });

          if (logError) {
            console.error(
              `❌ Failed to add log for rejected withdrawal ${withdrawal.id}:`,
              logError
            );
          }
        }
      }

      // Step 2: 토스페이먼츠 셀러 삭제 성공 시 partner_business_info 테이블 업데이트
      // tosspayments_seller_id는 null로 설정
      const bizInfoUpdateData: any = {
        partner_id: partnerId,
        tosspayments_seller_id: null,
        tosspayments_last_error: `Seller deleted: ${sellerId}`, // 삭제된 seller_id를 에러 필드에 기록
      };

      const { data: updatedBizInfo, error: updateError } = await supabase
        .from("partner_business_info")
        .upsert(bizInfoUpdateData, { onConflict: "partner_id" })
        .select()
        .single();

      if (updateError) {
        console.error(
          "❌ Failed to update partner_business_info after seller deletion:",
          updateError
        );
        // 토스페이먼츠 셀러는 삭제되었지만 DB 업데이트 실패
        return errorResponse(
          res,
          "PARTNER_UPDATE_ERROR",
          "토스페이먼츠 셀러는 삭제되었지만 파트너 정보 업데이트에 실패했습니다.",
          {
            sellerId,
            partnerId,
            updateError: updateError.message,
          },
          500
        );
      }

      console.log(
        `✅ Toss seller deleted and partner_business_info updated: ${partnerId}`
      );

      return successResponse(res, {
        message: "토스페이먼츠 셀러가 삭제되었습니다.",
        partnerBusinessInfo: updatedBizInfo,
        deletedSellerId: sellerId,
      });
    } catch (error: any) {
      console.error("❌ Error deleting Toss seller:", error);
      return errorResponse(
        res,
        "SELLER_DELETE_ERROR",
        "셀러 삭제 중 오류가 발생했습니다.",
        error.message,
        500
      );
    }
  })
);

// DELETE /partners/:partnerId - Delete partner
router.delete(
  "/partners/:partnerId",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const { partnerId } = req.params;

    if (!partnerId) {
      return errorResponse(res, "INVALID_PARTNER_ID", "Partner ID is required");
    }

    const supabase = createSupabaseClient();

    try {
      // Get partner info first
      const { data: partnerData, error: partnerError } = await supabase
        .from("partners")
        .select("member_id")
        .eq("id", partnerId)
        .single();

      if (partnerError) {
        if (partnerError.code === "PGRST116") {
          return errorResponse(res, "PARTNER_NOT_FOUND", "Partner not found");
        }
        throw partnerError;
      }

      // 파트너 삭제 전에 관련된 call_participants 레코드 처리
      // actual_partner_id가 해당 파트너를 참조하는 레코드들을 먼저 삭제
      const { error: participantsDeleteError } = await supabase
        .from("call_participants")
        .delete()
        .eq("actual_partner_id", partnerId);

      if (participantsDeleteError) {
        console.error(
          "Error deleting call_participants:",
          participantsDeleteError
        );
        // 에러가 발생해도 계속 진행 (레코드가 없을 수도 있음)
      }

      // partner_id가 해당 파트너를 참조하는 레코드들도 처리
      const { error: participantsPartnerDeleteError } = await supabase
        .from("call_participants")
        .delete()
        .eq("partner_id", partnerId);

      if (participantsPartnerDeleteError) {
        console.error(
          "Error deleting call_participants by partner_id:",
          participantsPartnerDeleteError
        );
        // 에러가 발생해도 계속 진행
      }

      // Delete partner record
      const { error: deleteError } = await supabase
        .from("partners")
        .delete()
        .eq("id", partnerId);

      if (deleteError) throw deleteError;

      return successResponse(res, {
        message: "Partner deleted successfully",
        partnerId,
        memberId: partnerData.member_id,
      });
    } catch (error: any) {
      return errorResponse(
        res,
        "PARTNER_DELETE_ERROR",
        "Failed to delete partner",
        error.message
      );
    }
  })
);

// DELETE /members/:memberId/partner - Delete partner by member ID
router.delete(
  "/members/:memberId/partner",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const { memberId } = req.params;

    if (!memberId) {
      return errorResponse(res, "INVALID_MEMBER_ID", "Member ID is required");
    }

    const supabase = createSupabaseClient();

    try {
      // First check if partner exists for this member (with partner_business_info for tosspayments_seller_id)
      const { data: partnerData, error: checkError } = await supabase
        .from("partners")
        .select("id, partner_business_info(tosspayments_seller_id)")
        .eq("member_id", memberId)
        .single();

      if (checkError) {
        if (checkError.code === "PGRST116") {
          // Partner not found, but still update member role to 'normal'
          const { error: memberUpdateError } = await supabase
            .from("members")
            .update({ role: "normal" })
            .eq("id", memberId);

          if (memberUpdateError) throw memberUpdateError;

          return successResponse(res, {
            message: "Member role updated to normal (no partner record found)",
            memberId,
          });
        }
        throw checkError;
      }

      const partnerId = partnerData.id;
      const bizInfo =
        (partnerData?.partner_business_info as any)?.[0] ||
        partnerData?.partner_business_info;

      // 0. call_participants 처리 (체크 제약 조건 위반 방지 - 파트너 삭제 전에 먼저 처리)
      const { data: partnerParticipants, error: participantsFetchError } =
        await supabase
          .from("call_participants")
          .select("id, participant_type, actual_partner_id, partner_id")
          .eq("actual_partner_id", partnerId)
          .or(`partner_id.eq.${partnerId}`);

      if (participantsFetchError) {
        console.error(
          "Error fetching call_participants:",
          participantsFetchError
        );
      } else if (partnerParticipants && partnerParticipants.length > 0) {
        const { error: participantsDeleteError } = await supabase
          .from("call_participants")
          .delete()
          .or(`actual_partner_id.eq.${partnerId},partner_id.eq.${partnerId}`);

        if (participantsDeleteError) {
          console.error(
            "Error deleting call_participants:",
            participantsDeleteError
          );
          throw participantsDeleteError;
        } else {
          console.log(
            `✅ Cleared ${partnerParticipants.length} call_participants record(s) for partner ${partnerId}`
          );
        }
      }

      // 0.5. call_rooms에서 partner_id를 참조하는 레코드가 있으면 제거
      const { data: partnerRooms, error: roomsFetchError } = await supabase
        .from("call_rooms")
        .select("id")
        .eq("partner_id", partnerId);

      if (roomsFetchError) {
        console.error("Error fetching call_rooms:", roomsFetchError);
      } else if (partnerRooms && partnerRooms.length > 0) {
        const { error: roomsDeleteError } = await supabase
          .from("call_rooms")
          .delete()
          .eq("partner_id", partnerId);

        if (roomsDeleteError) {
          console.error("Error deleting call_rooms:", roomsDeleteError);
          throw roomsDeleteError;
        } else {
          console.log(
            `✅ Deleted ${partnerRooms.length} call_rooms record(s) for partner ${partnerId}`
          );
        }
      }

      // 1. 토스 셀러 삭제 (tosspayments_seller_id가 있는 경우)
      if (bizInfo?.tosspayments_seller_id) {
        try {
          const sellerId = bizInfo.tosspayments_seller_id;

          // Get production mode from header
          const isProductionValue =
            req.headers["x-is-production"] === "true" ||
            req.headers["x-is-production"] === "1";
          const tossSecretKey = getTossSecretKey(isProductionValue);

          if (tossSecretKey) {
            const tossHeaders = createTossHeaders(tossSecretKey);
            tossHeaders["TossPayments-api-security-mode"] = "ENCRYPTION";
            delete tossHeaders["Content-Type"];

            const url = `https://api.tosspayments.com/v2/sellers/${sellerId}`;
            console.log("🔍 Deleting Toss Payments seller...", {
              url,
              sellerId,
              partnerId,
              isProduction: isProductionValue,
            });

            const tossResponse = await fetch(url, {
              method: "DELETE",
              headers: tossHeaders,
            });

            if (tossResponse.ok) {
              console.log(`✅ Toss seller deleted: ${sellerId}`);
            } else {
              const responseText = await tossResponse.text();
              console.error("⚠️ Failed to delete Toss seller:", {
                status: tossResponse.status,
                statusText: tossResponse.statusText,
                response: responseText.substring(0, 200),
              });
              // 에러가 발생해도 계속 진행 (이미 삭제되었을 수도 있음)
            }
          } else {
            console.warn(
              "⚠️ Toss secret key not found, skipping seller deletion"
            );
          }
        } catch (tossError: any) {
          console.error("⚠️ Error deleting Toss seller:", tossError);
          // 에러가 발생해도 계속 진행
        }
      }

      // 2. partner_withdrawals 삭제
      const { error: withdrawalsDeleteError } = await supabase
        .from("partner_withdrawals")
        .delete()
        .eq("partner_id", partnerId);

      if (withdrawalsDeleteError) {
        console.error(
          "Error deleting partner_withdrawals:",
          withdrawalsDeleteError
        );
        // 에러가 발생해도 계속 진행
      }

      // 3. partner_requests에서 in_progress나 pending 상태인 요청들을 rejected로 변경
      const { data: activeRequests, error: requestsFetchError } = await supabase
        .from("partner_requests")
        .select("id, client_id, status")
        .eq("partner_id", partnerId)
        .in("status", ["pending", "in_progress"]);

      if (requestsFetchError) {
        console.error("Error fetching partner_requests:", requestsFetchError);
      } else if (activeRequests && activeRequests.length > 0) {
        // 상태를 rejected로 변경
        const requestIds = activeRequests.map((r) => r.id);
        const { error: updateRequestsError } = await supabase
          .from("partner_requests")
          .update({
            status: "rejected",
            cancelled_at: new Date().toISOString(),
          })
          .in("id", requestIds);

        if (updateRequestsError) {
          console.error(
            "Error updating partner_requests:",
            updateRequestsError
          );
        } else {
          // 4-1. rejected된 요청들에 대해 채팅 메시지 전송
          for (const request of activeRequests) {
            try {
              // 채팅방 찾기 또는 생성
              const { data: existingRoom, error: roomCheckError } =
                await supabase
                  .from("chat_rooms")
                  .select("id")
                  .or(
                    `and(created_by.eq.${request.client_id},partner_id.eq.${memberId}),and(created_by.eq.${memberId},partner_id.eq.${request.client_id})`
                  )
                  .eq("is_active", true)
                  .maybeSingle();

              let roomId: string;

              if (existingRoom) {
                roomId = existingRoom.id;
              } else {
                // 채팅방이 없으면 생성
                const { data: newRoom, error: createRoomError } = await supabase
                  .from("chat_rooms")
                  .insert([
                    {
                      created_by: request.client_id,
                      partner_id: memberId,
                      is_active: true,
                    },
                  ])
                  .select("id")
                  .single();

                if (createRoomError) {
                  console.error("Error creating chat room:", createRoomError);
                  continue;
                }
                roomId = newRoom.id;
              }

              // 시스템 메시지 전송
              const { error: messageError } = await supabase
                .from("chat_messages")
                .insert([
                  {
                    room_id: roomId,
                    sender_id: memberId, // 파트너의 member_id
                    message: "파트너 해제로 인해 의뢰가 취소 되었습니다",
                    message_type: "system",
                  },
                ]);

              if (messageError) {
                console.error("Error sending chat message:", messageError);
              } else {
                // 채팅방 updated_at 업데이트
                await supabase
                  .from("chat_rooms")
                  .update({ updated_at: new Date().toISOString() })
                  .eq("id", roomId);
              }
            } catch (chatError: any) {
              console.error(
                "Error processing chat message for request:",
                request.id,
                chatError
              );
            }
          }
        }
      }

      // 4. Delete partner record by member ID
      const { data: deletedPartner, error: deleteError } = await supabase
        .from("partners")
        .delete()
        .eq("member_id", memberId)
        .select("id")
        .single();

      if (deleteError) throw deleteError;

      // 5. Update member role to 'normal'
      const { error: memberUpdateError } = await supabase
        .from("members")
        .update({ role: "normal" })
        .eq("id", memberId);

      if (memberUpdateError) throw memberUpdateError;

      return successResponse(res, {
        message:
          "Partner deleted and member role updated to normal successfully",
        partnerId: deletedPartner.id,
        memberId,
      });
    } catch (error: any) {
      return errorResponse(
        res,
        "PARTNER_DELETE_ERROR",
        "Failed to delete partner",
        error.message
      );
    }
  })
);

// GET /banners - Get all banners (admin)
router.get(
  "/banners",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt((req.query.page as string) || "1");
    const limit = parseInt((req.query.limit as string) || "20");
    const offset = (page - 1) * limit;

    const supabase = createSupabaseClient();

    try {
      const {
        data: banners,
        error: bannersError,
        count,
      } = await supabase
        .from("ad_banners")
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (bannersError) throw bannersError;

      return successResponse(res, banners || [], {
        total: count || 0,
        page,
        limit,
      });
    } catch (error: any) {
      return errorResponse(
        res,
        "BANNERS_FETCH_ERROR",
        "Failed to fetch banners",
        error.message
      );
    }
  })
);

// POST /banners - Create banner
router.post(
  "/banners",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const {
      title,
      description,
      image_url,
      link_url,
      is_active = true,
    } = req.body;

    if (!title || !image_url) {
      return errorResponse(
        res,
        "INVALID_BODY",
        "Title and image URL are required"
      );
    }

    const supabase = createSupabaseClient();

    try {
      const { data: newBanner, error: createError } = await supabase
        .from("ad_banners")
        .insert({
          title: title.trim(),
          description: description?.trim() || null,
          background_image: image_url.trim(),
          link_url: link_url?.trim() || null,
          is_active,
        })
        .select()
        .single();

      if (createError) throw createError;

      return successResponse(res, {
        banner: newBanner,
        message: "Banner created successfully",
      });
    } catch (error: any) {
      return errorResponse(
        res,
        "BANNER_CREATE_ERROR",
        "Failed to create banner",
        error.message
      );
    }
  })
);

// PUT /banners/:bannerId - Update banner
router.put(
  "/banners/:bannerId",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const { bannerId } = req.params;
    const body = req.body;

    if (!bannerId) {
      return errorResponse(res, "INVALID_BANNER_ID", "Banner ID is required");
    }

    if (!body || Object.keys(body).length === 0) {
      return errorResponse(res, "INVALID_BODY", "Request body is required");
    }

    const supabase = createSupabaseClient();

    try {
      const updateData: any = {};
      if (body.title !== undefined) updateData.title = body.title.trim();
      if (body.description !== undefined)
        updateData.description = body.description?.trim() || null;
      if (body.image_url !== undefined)
        updateData.background_image = body.image_url.trim();
      if (body.link_url !== undefined)
        updateData.link_url = body.link_url?.trim() || null;
      if (body.is_active !== undefined) updateData.is_active = body.is_active;

      const { data: updatedBanner, error: updateError } = await supabase
        .from("ad_banners")
        .update(updateData)
        .eq("id", bannerId)
        .select()
        .single();

      if (updateError) throw updateError;

      return successResponse(res, {
        banner: updatedBanner,
        message: "Banner updated successfully",
      });
    } catch (error: any) {
      return errorResponse(
        res,
        "BANNER_UPDATE_ERROR",
        "Failed to update banner",
        error.message
      );
    }
  })
);

// DELETE /banners/:bannerId - Delete banner
router.delete(
  "/banners/:bannerId",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const { bannerId } = req.params;

    if (!bannerId) {
      return errorResponse(res, "INVALID_BANNER_ID", "Banner ID is required");
    }

    const supabase = createSupabaseClient();

    try {
      const { error: deleteError } = await supabase
        .from("ad_banners")
        .delete()
        .eq("id", bannerId);

      if (deleteError) throw deleteError;

      return successResponse(res, {
        message: "Banner deleted successfully",
        bannerId,
      });
    } catch (error: any) {
      return errorResponse(
        res,
        "BANNER_DELETE_ERROR",
        "Failed to delete banner",
        error.message
      );
    }
  })
);

/**
 * @swagger
 * /api/admin/withdrawals:
 *   get:
 *     summary: 출금 요청 목록 조회 (관리자 전용)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected, completed]
 *         description: "출금 요청 상태 (기본값: pending)"
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: 성공
 *       403:
 *         description: 관리자 권한 필요
 */
// GET /withdrawals - Get withdrawal requests
router.get(
  "/withdrawals",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const status = req.query.status as string;
    const page = parseInt((req.query.page as string) || "1");
    const limit = parseInt((req.query.limit as string) || "20");
    const offset = (page - 1) * limit;

    const supabase = createSupabaseClient();

    try {
      let query = supabase.from("partner_withdrawals").select(
        `
            *,
            partner:partners!partner_id(
              *,
              member:members!member_id(*),
              business_info:partner_business_info!partner_id(tax, default_distribution_rate, collaboration_distribution_rate)
            )
          `,
        { count: "exact" }
      );

      // 기본값은 pending만 조회, status 파라미터가 있으면 해당 상태로 필터링
      const filterStatus = status || "pending";
      query = query.eq("status", filterStatus);

      const {
        data: withdrawals,
        error: withdrawalsError,
        count,
      } = await query
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (withdrawalsError) throw withdrawalsError;

      // 파트너 티어 정보 조회
      const partnerIds = [...new Set((withdrawals || []).map((w: any) => w.partner_id))];

      const { data: partnerTiers } = await supabase
        .from("partner_tier_current")
        .select("partner_id, tier_code")
        .in("partner_id", partnerIds);

      const partnerTierMap = new Map(
        partnerTiers?.map((t: any) => [t.partner_id, t.tier_code]) || []
      );

      // fee_policy 테이블 조회 (티어별 정산율)
      const { data: feePolicies } = await supabase
        .from("fee_policy")
        .select("tier_code, partner_share_pct, take_rate_pct");

      const feePolicyMap = new Map(
        feePolicies?.map((f: any) => [f.tier_code, f.partner_share_pct]) || []
      );

      // 출금 유형에 따라 적절한 분배율 정보 추가
      const processedWithdrawals = (withdrawals || []).map((withdrawal: any) => {
        const bizInfo = withdrawal.partner?.business_info?.[0] || withdrawal.partner?.business_info || {};
        const withdrawalType = withdrawal.withdrawal_type || "total_points";
        const tierCode = partnerTierMap.get(withdrawal.partner_id) || "bronze";
        
        // 출금 유형에 따라 적용할 비율 결정
        let applicable_rate: number | null = null;
        let rate_type: string = "";
        
        if (withdrawalType === "store_points") {
          applicable_rate = bizInfo.default_distribution_rate ?? null;
          rate_type = "default_distribution_rate";
        } else if (withdrawalType === "collaboration_store_points") {
          // collaboration_store_points: 100% 전액 지급
          applicable_rate = 100;
          rate_type = "full_payout";
        } else {
          // total_points: 티어 기반 partner_share_pct 적용
          applicable_rate = feePolicyMap.get(tierCode) || 75;
          rate_type = `tier_${tierCode}`;
        }
        
        return {
          ...withdrawal,
          tier_code: tierCode,
          applicable_rate,
          rate_type,
        };
      });

      return successResponse(res, processedWithdrawals, {
        total: count || 0,
        page,
        limit,
      });
    } catch (error: any) {
      return errorResponse(
        res,
        "WITHDRAWALS_FETCH_ERROR",
        "Failed to fetch withdrawals",
        error.message
      );
    }
  })
);

/**
 * @swagger
 * /api/admin/withdrawals/{withdrawalId}/status:
 *   put:
 *     summary: 출금 요청 상태 업데이트 (관리자 전용)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: withdrawalId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, approved, rejected, completed]
 *               admin_notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: 성공
 *       403:
 *         description: 관리자 권한 필요
 */
// PUT /withdrawals/:withdrawalId/status - Update withdrawal status
router.put(
  "/withdrawals/:withdrawalId/status",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const { withdrawalId } = req.params;
    const { status, admin_notes } = req.body;

    if (!withdrawalId) {
      return errorResponse(
        res,
        "INVALID_WITHDRAWAL_ID",
        "Withdrawal ID is required"
      );
    }

    if (!status) {
      return errorResponse(res, "INVALID_BODY", "Status is required");
    }

    // Validate status
    if (!["pending", "approved", "rejected", "completed"].includes(status)) {
      return errorResponse(res, "INVALID_STATUS", "Invalid status value");
    }

    const supabase = createSupabaseClient();

    try {
      // 먼저 기존 출금 요청 정보 조회 (withdrawal_type 포함)
      const { data: existingWithdrawal, error: fetchError } = await supabase
        .from("partner_withdrawals")
        .select("id, partner_id, requested_amount, status, withdrawal_type")
        .eq("id", withdrawalId)
        .single();

      if (fetchError) throw fetchError;
      if (!existingWithdrawal) {
        return errorResponse(
          res,
          "WITHDRAWAL_NOT_FOUND",
          "Withdrawal not found",
          null,
          404
        );
      }

      const withdrawalType = existingWithdrawal.withdrawal_type || "total_points";

      const updateData: any = {
        status,
        reviewed_at: new Date().toISOString(),
      };

      if (admin_notes) {
        updateData.admin_notes = admin_notes.trim();
      }

      // approved 상태로 변경 시 잔액 체크 및 로그 추가
      // - total_points: handle_partner_withdrawal 트리거가 차감, log_partner_total_points_change 트리거가 로그 추가
      // - store_points: handle_partner_withdrawal 트리거가 차감, API에서 로그 추가
      // - collaboration_store_points: handle_partner_withdrawal 트리거가 차감, API에서 로그 추가
      if (status === "approved" && existingWithdrawal.status !== "approved") {
        // 잔액 체크 (트리거 실행 전 사전 검증)
        const { data: partnerData, error: partnerFetchError } = await supabase
          .from("partners")
          .select("total_points, store_points, collaboration_store_points")
          .eq("id", existingWithdrawal.partner_id)
          .single();

        if (partnerFetchError) throw partnerFetchError;

        const requestedAmount = existingWithdrawal.requested_amount;

        if (withdrawalType === "store_points") {
          const currentStorePoints = partnerData?.store_points || 0;
          if (currentStorePoints < requestedAmount) {
            return errorResponse(
              res,
              "INSUFFICIENT_STORE_POINTS",
              `Insufficient store points. Current: ${currentStorePoints}, Requested: ${requestedAmount}`,
              null,
              400
            );
          }
        } else if (withdrawalType === "collaboration_store_points") {
          const currentCollabPoints = partnerData?.collaboration_store_points || 0;
          if (currentCollabPoints < requestedAmount) {
            return errorResponse(
              res,
              "INSUFFICIENT_COLLABORATION_STORE_POINTS",
              `Insufficient collaboration store points. Current: ${currentCollabPoints}, Requested: ${requestedAmount}`,
              null,
              400
            );
          }
        } else {
          // total_points
          const currentTotalPoints = partnerData?.total_points || 0;
          if (currentTotalPoints < requestedAmount) {
            return errorResponse(
              res,
              "INSUFFICIENT_TOTAL_POINTS",
              `Insufficient total points. Current: ${currentTotalPoints}, Requested: ${requestedAmount}`,
              null,
              400
            );
          }
        }
        // 실제 차감은 DB 트리거(handle_partner_withdrawal)가 자동으로 처리
        // total_points 로그는 DB 트리거(log_partner_total_points_change)가 자동으로 처리
      }

      const { data: updatedWithdrawal, error: updateError } = await supabase
        .from("partner_withdrawals")
        .update(updateData)
        .eq("id", withdrawalId)
        .select(
          `
            *,
            partner:partners!partner_id(
              *,
              member:members!member_id(*)
            )
          `
        )
        .single();

      if (updateError) throw updateError;

      // approved 상태로 변경될 때 store_points, collaboration_store_points 로그 추가
      // (total_points는 log_partner_total_points_change 트리거가 자동으로 로그를 추가함)
      if (status === "approved" && existingWithdrawal.status !== "approved") {
        if (withdrawalType === "store_points" || withdrawalType === "collaboration_store_points") {
          const logDescription = withdrawalType === "store_points"
            ? `스토어 포인트 출금 승인 (금액: ${existingWithdrawal.requested_amount} 포인트)`
            : `협업 스토어 포인트 출금 승인 (금액: ${existingWithdrawal.requested_amount} 포인트)`;
          const logIdPrefix = withdrawalType === "store_points" ? "store" : "collab";

          const { error: logError } = await supabase
            .from("partner_points_logs")
            .insert({
              partner_id: existingWithdrawal.partner_id,
              type: "spend",
              amount: existingWithdrawal.requested_amount,
              description: logDescription,
              log_id: `${logIdPrefix}_approved_${existingWithdrawal.id.toString()}`,
            });

          if (logError) {
            console.error(`❌ Failed to add log for approved ${withdrawalType} withdrawal:`, logError);
            console.warn(`⚠️  Warning: Failed to add log, but status update succeeded`);
          } else {
            console.log(`✅ Added log for approved ${withdrawalType} withdrawal: ${withdrawalId}`);
          }
        }

        // 추천인 보너스 처리 (출금 금액의 0.5%)
        const { data: partnerWithReferrer } = await supabase
          .from("partners")
          .select("referrer_member_code")
          .eq("id", existingWithdrawal.partner_id)
          .single();

        const referrerCode = partnerWithReferrer?.referrer_member_code
          ? String(partnerWithReferrer.referrer_member_code).trim()
          : "";

        if (referrerCode) {
          const { data: referrer, error: referrerErr } = await supabase
            .from("members")
            .select("id, total_points")
            .ilike("member_code", referrerCode)
            .maybeSingle();

          if (referrerErr) {
            console.error("[Referrer bonus] referrer lookup error:", referrerErr.message);
          } else if (referrer) {
            // 출금 금액의 0.5% 계산 (소수점 버림)
            const bonusAmount = Math.floor(existingWithdrawal.requested_amount * 0.005);

            if (bonusAmount > 0) {
              const pointsBefore = Number(referrer.total_points) || 0;

              // 추천인 포인트 지급
              const { error: updateMemberErr } = await supabase
                .from("members")
                .update({ total_points: pointsBefore + bonusAmount })
                .eq("id", referrer.id);

              if (updateMemberErr) {
                console.error("[Referrer bonus] members update error:", updateMemberErr.message);
              } else {
                console.log(`✅ [Referrer bonus] Gave ${bonusAmount}P to referrer ${referrer.id} for withdrawal ${withdrawalId}`);

                // member_points_logs에 로그 기록
                const logId = `referral_bonus_withdrawal_${withdrawalId}`;
                const { error: logErr } = await supabase.from("member_points_logs").insert({
                  member_id: referrer.id,
                  log_id: logId,
                  type: "earn",
                  amount: bonusAmount,
                  description: `추천인 보너스 (출금 금액 ${existingWithdrawal.requested_amount}P의 0.5%)`,
                });

                if (logErr) {
                  console.error("[Referrer bonus] member_points_logs insert error:", logErr.message);
                }

                // referral_bonus_logs에 로그 기록
                const { error: refLogErr } = await supabase.from("referral_bonus_logs").insert({
                  referrer_member_id: referrer.id,
                  referred_partner_id: existingWithdrawal.partner_id,
                  withdrawal_id: withdrawalId,
                  points_before: pointsBefore,
                  points_after: pointsBefore + bonusAmount,
                  bonus_amount: bonusAmount,
                });

                if (refLogErr) {
                  console.error("[Referrer bonus] referral_bonus_logs insert error:", refLogErr.message);
                }
              }
            } else {
              console.log(`[Referrer bonus] Bonus amount is 0 for withdrawal ${withdrawalId}, skipping`);
            }
          } else {
            console.warn("[Referrer bonus] no member found for member_code:", referrerCode);
          }
        }
      }

      // rejected 상태로 변경될 때 로그 추가
      // (total_points approved는 handle_partner_withdrawal 트리거가 partners.total_points를 변경하고,
      //  log_partner_total_points_change 트리거가 자동으로 로그를 추가함)
      if (status === "rejected" && existingWithdrawal.status !== "rejected") {
        let logDescription = `출금 요청 거절 (요청 금액: ${existingWithdrawal.requested_amount} 포인트)`;
        let logId = existingWithdrawal.id.toString();

        if (withdrawalType === "store_points") {
          logDescription = `스토어 포인트 출금 요청 거절 (요청 금액: ${existingWithdrawal.requested_amount} 포인트)`;
          logId = `store_rejected_${existingWithdrawal.id.toString()}`;
        } else if (withdrawalType === "collaboration_store_points") {
          logDescription = `협업 스토어 포인트 출금 요청 거절 (요청 금액: ${existingWithdrawal.requested_amount} 포인트)`;
          logId = `collab_rejected_${existingWithdrawal.id.toString()}`;
        }

        const { error: logError } = await supabase
          .from("partner_points_logs")
          .insert({
            partner_id: existingWithdrawal.partner_id,
            type: "earn", // 거절은 earn 타입으로 기록 (출금 요청이 거절됨)
            amount: existingWithdrawal.requested_amount,
            description: logDescription,
            log_id: logId,
          });

        if (logError) {
          console.error(
            "❌ Failed to add log for rejected withdrawal:",
            logError
          );
          // 로그 추가 실패는 경고만 하고 계속 진행
          console.warn(
            "⚠️  Warning: Failed to add log for rejected withdrawal, but status update succeeded"
          );
        } else {
          console.log(`✅ Added log for rejected withdrawal: ${withdrawalId}`);
        }
      }

      return successResponse(res, {
        withdrawal: updatedWithdrawal,
        message: "Withdrawal status updated successfully",
      });
    } catch (error: any) {
      return errorResponse(
        res,
        "WITHDRAWAL_UPDATE_ERROR",
        "Failed to update withdrawal status",
        error.message
      );
    }
  })
);

// GET /members - Get all members with role filter and search
router.get(
  "/members",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const role = req.query.role as string;
    const search = req.query.search as string;
    const page = parseInt((req.query.page as string) || "1");
    const limit = parseInt((req.query.limit as string) || "100");
    const offset = (page - 1) * limit;

    const supabase = createSupabaseClient();

    try {
      // Build members query
      let membersQuery = supabase
        .from("members")
        .select("*", { count: "exact" });

      if (role) {
        membersQuery = membersQuery.eq("role", role);
      }

      if (search) {
        membersQuery = membersQuery.or(
          `name.ilike.%${search}%,member_code.ilike.%${search}%`
        );
      }

      // Get role counts (RPC) and members data in parallel
      const [roleCountsResult, membersResult] = await Promise.all([
        supabase.rpc("get_members_role_counts", {
          search_term: search || null,
        }),
        membersQuery
          .order("created_at", { ascending: false })
          .range(offset, offset + limit - 1),
      ]);

      if (roleCountsResult.error) throw roleCountsResult.error;
      if (membersResult.error) throw membersResult.error;

      return successResponse(res, membersResult.data || [], {
        total: membersResult.count || 0,
        page,
        limit,
        roleCounts: roleCountsResult.data || {
          all: 0,
          normal: 0,
          partner: 0,
          admin: 0,
        },
      });
    } catch (error: any) {
      return errorResponse(
        res,
        "MEMBERS_FETCH_ERROR",
        "Failed to fetch members",
        error.message
      );
    }
  })
);

// GET /member-points-logs - Get all member points logs with pagination
router.get(
  "/member-points-logs",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt((req.query.page as string) || "1");
    const limit = parseInt((req.query.limit as string) || "50");
    const offset = (page - 1) * limit;
    const search = req.query.search as string;
    const type = req.query.type as string;
    const memberId = req.query.member_id as string;

    const supabase = createSupabaseClient();

    try {
      // If search is provided, first find matching member_ids
      let matchingMemberIds: string[] = [];
      if (search) {
        const { data: matchingMembers } = await supabase
          .from("members")
          .select("id")
          .or(`name.ilike.%${search}%,member_code.ilike.%${search}%`);

        matchingMemberIds = (matchingMembers || []).map((m: any) => m.id);
      }

      let query = supabase.from("member_points_logs").select(
        `
          id,
          type,
          amount,
          description,
          created_at,
          log_id,
          member:members!member_id(id, name, member_code)
        `,
        { count: "exact" }
      );

      // Filter by member_id
      if (memberId) {
        query = query.eq("member_id", memberId);
      }

      // Filter by type (earn, spend)
      if (type) {
        query = query.eq("type", type);
      }

      // Apply search filter at DB level
      if (search) {
        if (matchingMemberIds.length > 0) {
          // Search in description OR member_id matches
          query = query.or(
            `description.ilike.%${search}%,member_id.in.(${matchingMemberIds.join(
              ","
            )})`
          );
        } else {
          // No matching members, only search in description
          query = query.ilike("description", `%${search}%`);
        }
      }

      const {
        data: logs,
        error: logsError,
        count,
      } = await query
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (logsError) throw logsError;

      // Transform data to flatten member info
      const transformedLogs = (logs || []).map((log: any) => ({
        id: log.id,
        member_id: log.member?.id,
        member_name: log.member?.name || "Unknown",
        member_code: log.member?.member_code || "",
        type: log.type,
        amount: log.amount,
        description: log.description,
        created_at: log.created_at,
        log_id: log.log_id,
      }));

      return successResponse(res, transformedLogs, {
        total: count || 0,
        page,
        limit,
      });
    } catch (error: any) {
      return errorResponse(
        res,
        "MEMBER_POINTS_LOGS_FETCH_ERROR",
        "Failed to fetch member points logs",
        error.message
      );
    }
  })
);

// GET /partner-points-logs - Get all partner points logs with pagination
router.get(
  "/partner-points-logs",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt((req.query.page as string) || "1");
    const limit = parseInt((req.query.limit as string) || "50");
    const offset = (page - 1) * limit;
    const search = req.query.search as string;
    const type = req.query.type as string;
    const partnerId = req.query.partner_id as string;
    const memberId = req.query.member_id as string;

    const supabase = createSupabaseClient();

    try {
      // If search is provided, first find matching partner_ids
      let matchingPartnerIds: string[] = [];
      if (search) {
        const { data: matchingPartners } = await supabase
          .from("partners")
          .select("id")
          .ilike("partner_name", `%${search}%`);

        matchingPartnerIds = (matchingPartners || []).map((p: any) => p.id);
      }

      let query = supabase.from("partner_points_logs").select(
        `
          id,
          type,
          amount,
          description,
          created_at,
          log_id,
          partner:partners!partner_id(id, partner_name, member_id)
        `,
        { count: "exact" }
      );

      // Filter by partner_id
      if (partnerId) {
        query = query.eq("partner_id", partnerId);
      }

      // Filter by member_id (find partner by member_id first)
      if (memberId) {
        const { data: partnerByMember } = await supabase
          .from("partners")
          .select("id")
          .eq("member_id", memberId)
          .maybeSingle();

        if (partnerByMember) {
          query = query.eq("partner_id", partnerByMember.id);
        } else {
          // No partner found for this member, return empty result
          return successResponse(res, [], { total: 0, page, limit });
        }
      }

      // Filter by type (earn, spend)
      if (type) {
        query = query.eq("type", type);
      }

      // Apply search filter at DB level
      if (search) {
        if (matchingPartnerIds.length > 0) {
          // Search in description OR partner_id matches
          query = query.or(
            `description.ilike.%${search}%,partner_id.in.(${matchingPartnerIds.join(
              ","
            )})`
          );
        } else {
          // No matching partners, only search in description
          query = query.ilike("description", `%${search}%`);
        }
      }

      const {
        data: logs,
        error: logsError,
        count,
      } = await query
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (logsError) throw logsError;

      // Transform data to flatten partner info
      // Filter out logs with "total_points changed" or "총 포인트 변경" in description
      const transformedLogs = (logs || [])
        .filter((log: any) => {
          const desc = log.description || "";
          return !desc.includes("total_points changed") && !desc.includes("총 포인트 변경");
        })
        .map((log: any) => ({
          id: log.id,
          partner_id: log.partner?.id,
          partner_name: log.partner?.partner_name || "Unknown",
          type: log.type,
          amount: log.amount,
          description: log.description,
          created_at: log.created_at,
        }));

      return successResponse(res, transformedLogs, {
        total: count || 0,
        page,
        limit,
      });
    } catch (error: any) {
      return errorResponse(
        res,
        "PARTNER_POINTS_LOGS_FETCH_ERROR",
        "Failed to fetch partner points logs",
        error.message
      );
    }
  })
);

// GET /stats - Get admin dashboard statistics
router.get(
  "/stats",
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    const supabase = createSupabaseClient();

    try {
      // Get partner statistics
      const { data: partnerStats, error: partnerStatsError } = await supabase
        .from("partners")
        .select("partner_status");

      if (partnerStatsError) throw partnerStatsError;

      // Get member count
      const { count: memberCount, error: memberCountError } = await supabase
        .from("members")
        .select("id", { count: "exact" });

      if (memberCountError) throw memberCountError;

      // Get withdrawal statistics (including withdrawal_type)
      const { data: withdrawalStats, error: withdrawalStatsError } =
        await supabase.from("partner_withdrawals").select("status, withdrawal_type");

      if (withdrawalStatsError) throw withdrawalStatsError;

      // Get banner count
      const { count: bannerCount, error: bannerCountError } = await supabase
        .from("ad_banners")
        .select("id", { count: "exact" });

      if (bannerCountError) throw bannerCountError;

      // Calculate statistics
      const totalPointsWithdrawals = withdrawalStats?.filter(
        (w: any) => !w.withdrawal_type || w.withdrawal_type === "total_points"
      ) || [];
      const storePointsWithdrawals = withdrawalStats?.filter(
        (w: any) => w.withdrawal_type === "store_points"
      ) || [];
      const collaborationStorePointsWithdrawals = withdrawalStats?.filter(
        (w: any) => w.withdrawal_type === "collaboration_store_points"
      ) || [];

      const stats = {
        members: {
          total: memberCount || 0,
        },
        partners: {
          total: partnerStats?.length || 0,
          pending:
            partnerStats?.filter((p) => p.partner_status === "pending")
              .length || 0,
          approved:
            partnerStats?.filter((p) => p.partner_status === "approved")
              .length || 0,
          rejected:
            partnerStats?.filter((p) => p.partner_status === "rejected")
              .length || 0,
        },
        withdrawals: {
          total: withdrawalStats?.length || 0,
          pending:
            withdrawalStats?.filter((w: any) => w.status === "pending").length || 0,
          approved:
            withdrawalStats?.filter((w: any) => w.status === "approved").length || 0,
          completed:
            withdrawalStats?.filter((w: any) => w.status === "completed").length || 0,
          rejected:
            withdrawalStats?.filter((w: any) => w.status === "rejected").length || 0,
          // withdrawal_type별 통계
          byType: {
            total_points: {
              total: totalPointsWithdrawals.length,
              pending: totalPointsWithdrawals.filter((w: any) => w.status === "pending").length,
              approved: totalPointsWithdrawals.filter((w: any) => w.status === "approved").length,
              completed: totalPointsWithdrawals.filter((w: any) => w.status === "completed").length,
              rejected: totalPointsWithdrawals.filter((w: any) => w.status === "rejected").length,
            },
            store_points: {
              total: storePointsWithdrawals.length,
              pending: storePointsWithdrawals.filter((w: any) => w.status === "pending").length,
              approved: storePointsWithdrawals.filter((w: any) => w.status === "approved").length,
              completed: storePointsWithdrawals.filter((w: any) => w.status === "completed").length,
              rejected: storePointsWithdrawals.filter((w: any) => w.status === "rejected").length,
            },
            collaboration_store_points: {
              total: collaborationStorePointsWithdrawals.length,
              pending: collaborationStorePointsWithdrawals.filter((w: any) => w.status === "pending").length,
              approved: collaborationStorePointsWithdrawals.filter((w: any) => w.status === "approved").length,
              completed: collaborationStorePointsWithdrawals.filter((w: any) => w.status === "completed").length,
              rejected: collaborationStorePointsWithdrawals.filter((w: any) => w.status === "rejected").length,
            },
          },
        },
        banners: {
          total: bannerCount || 0,
        },
      };

      return successResponse(res, stats);
    } catch (error: any) {
      return errorResponse(
        res,
        "STATS_ERROR",
        "Failed to fetch admin statistics",
        error.message
      );
    }
  })
);

export default router;
