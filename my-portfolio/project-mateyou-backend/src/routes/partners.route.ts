import { Router } from "express";
import {
  createSupabaseClient,
  successResponse,
  errorResponse,
  asyncHandler,
  maskName,
  getAuthUser,
} from "../lib/utils";

const router = Router();

/**
 * @swagger
 * /api/partners/details/{memberCode}:
 *   get:
 *     summary: 멤버 코드로 파트너 상세 정보 조회
 *     tags: [Partners]
 *     parameters:
 *       - in: path
 *         name: memberCode
 *         required: true
 *         schema:
 *           type: string
 *         description: 멤버 코드
 *     responses:
 *       200:
 *         description: 성공
 *       404:
 *         description: 파트너를 찾을 수 없음
 */
// GET /details/:memberCode - Get partner details by member code
router.get(
  "/details/:memberCode",
  asyncHandler(async (req, res) => {
    const { memberCode } = req.params;

    if (!memberCode) {
      return errorResponse(
        res,
        "INVALID_MEMBER_CODE",
        "Member code is required"
      );
    }

    const supabase = createSupabaseClient();

    // 1. Find member by member_code
    const { data: memberData, error: memberError } = await supabase
      .from("members")
      .select("*")
      .eq("member_code", memberCode)
      .maybeSingle();

    if (memberError || !memberData) {
      return errorResponse(res, "MEMBER_NOT_FOUND", "Member not found");
    }

    // 2. Find partner by member_id (only approved partners)
    const { data: partnerData, error: partnerError } = await supabase
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
        created_at,
        updated_at,
        background_images
      `
      )
      .eq("member_id", memberData.id)
      .eq("partner_status", "approved")
      .maybeSingle();

    if (partnerError || !partnerData) {
      return errorResponse(
        res,
        "PARTNER_NOT_FOUND",
        "Partner not found or not approved"
      );
    }

    // 3. Get reviews (excluding 0-rating reviews)
    const { data: reviewsData, error: reviewsError } = await supabase
      .from("reviews")
      .select(
        `
        id, rating, comment, points_earned, created_at, member_id,
        members!member_id(name)
      `
      )
      .eq("target_partner_id", partnerData.id)
      .gt("rating", 0)
      .order("created_at", { ascending: false });

    if (reviewsError) {
      console.error("Reviews fetch error:", reviewsError);
    }

    // 4. Mask reviewer names
    const reviewsWithMaskedNames = (reviewsData || []).map((review) => ({
      ...review,
      reviewer_name: maskName((review.members as any)?.name),
    }));

    // 5. Combine data
    const result = {
      ...partnerData,
      member: memberData,
      reviews: reviewsWithMaskedNames,
    };

    return successResponse(res, result);
  })
);

/**
 * @swagger
 * /api/partners/jobs/{memberId}:
 *   get:
 *     summary: 파트너의 작업 목록 조회
 *     tags: [Partners]
 *     parameters:
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *         description: 멤버 ID
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *         description: 활성화된 작업만 조회
 *     responses:
 *       200:
 *         description: 성공
 */
// GET /jobs/:memberId - Get partner jobs
router.get(
  "/jobs/:memberId",
  asyncHandler(async (req, res) => {
    const { memberId } = req.params;
    const activeOnly = req.query.active === "true";

    if (!memberId) {
      return errorResponse(res, "INVALID_MEMBER_ID", "Member ID is required");
    }

    const supabase = createSupabaseClient();

    // 1. Find partner by member_id
    const { data: partnerData, error: partnerError } = await supabase
      .from("partners")
      .select("id")
      .eq("member_id", memberId)
      .single();

    if (partnerError) {
      if (partnerError.code === "PGRST116") {
        // Partner not found - return empty array
        return successResponse(res, [], { isPartner: false });
      }
      throw partnerError;
    }

    // 2. Get partner jobs
    let query = supabase
      .from("partner_jobs")
      .select("*")
      .eq("partner_id", partnerData.id);

    if (activeOnly) {
      query = query.eq("is_active", true);
    }

    const { data: jobsData, error: jobsError } = await query.order(
      "created_at",
      {
        ascending: true,
      }
    );

    if (jobsError) throw jobsError;

    return successResponse(res, jobsData || [], { isPartner: true });
  })
);

/**
 * @swagger
 * /api/partners/list:
 *   get:
 *     summary: 파트너 목록 조회 (페이지네이션)
 *     tags: [Partners]
 *     parameters:
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
 *           default: 10
 *         description: 페이지 당 항목 수
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: 검색어
 *       - in: query
 *         name: game
 *         schema:
 *           type: string
 *         description: 게임 필터
 *     responses:
 *       200:
 *         description: 성공
 */
// GET /list - Get partners list with pagination
router.get(
  "/list",
  asyncHandler(async (req, res) => {
    const page = parseInt((req.query.page as string) || "1");
    const limit = parseInt((req.query.limit as string) || "10");
    const search = req.query.search as string | undefined;
    const gameFilter = req.query.game as string | undefined;
    const offset = (page - 1) * limit;

    const supabase = createSupabaseClient();

    let query = supabase
      .from("partners")
      .select(
        `
        *,
        members!member_id(id, member_code, name, profile_image, favorite_game, current_status)
      `,
        { count: "exact" }
      )
      .eq("partner_status", "approved");

    // Apply search filter
    if (search) {
      query = query.or(
        `partner_name.ilike.%${search}%,members.name.ilike.%${search}%`
      );
    }

    // Apply game filter
    if (gameFilter) {
      query = query.contains("members.favorite_game", [gameFilter]);
    }

    const {
      data: partnersData,
      error: partnersError,
      count,
    } = await query
      .range(offset, offset + limit - 1)
      .order("created_at", { ascending: false });

    if (partnersError) throw partnersError;

    return successResponse(res, partnersData || [], {
      total: count || 0,
      page,
      limit,
    });
  })
);

/**
 * @swagger
 * /api/partners/recent:
 *   get:
 *     summary: 최근 파트너 목록 조회
 *     tags: [Partners]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 6
 *         description: 조회할 항목 수
 *     responses:
 *       200:
 *         description: 성공
 */
// GET /recent - Get recent partners
router.get(
  "/recent",
  asyncHandler(async (req, res) => {
    const limit = parseInt((req.query.limit as string) || "6");

    const supabase = createSupabaseClient();

    const { data: partnersData, error: partnersError } = await supabase
      .from("partners")
      .select(
        `
        *,
        members!member_id(id, member_code, name, profile_image, favorite_game, current_status)
      `
      )
      .eq("partner_status", "approved")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (partnersError) throw partnersError;

    return successResponse(res, partnersData || []);
  })
);

/**
 * @swagger
 * /api/partners/home:
 *   get:
 *     summary: 홈 화면용 파트너 집계 데이터 조회
 *     tags: [Partners]
 *     parameters:
 *       - in: query
 *         name: currentUserId
 *         schema:
 *           type: string
 *         description: 현재 사용자 ID (선택적, 최근 리뷰한 파트너 조회용)
 *       - in: query
 *         name: onlineLimit
 *         schema:
 *           type: integer
 *           default: 8
 *           maximum: 20
 *         description: 온라인 파트너 조회 개수
 *       - in: query
 *         name: recentLimit
 *         schema:
 *           type: integer
 *           default: 5
 *           maximum: 20
 *         description: 최근 리뷰한 파트너 조회 개수
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
 *                     partners:
 *                       type: array
 *                       description: 모든 파트너 목록 (리뷰 통계 포함)
 *                     allPartners:
 *                       type: array
 *                       description: 모든 파트너 목록 (온라인 우선 정렬)
 *                     onlinePartners:
 *                       type: array
 *                       description: 온라인 파트너 목록 (랜덤 셔플)
 *                     recentPartners:
 *                       type: array
 *                       description: 최근 리뷰한 파트너 목록
 *                     userReviews:
 *                       type: array
 *                       description: 사용자 리뷰 목록
 */
// GET /home - Aggregated data for home screen
router.get(
  "/home",
  asyncHandler(async (req, res) => {
    const supabase = createSupabaseClient();
    const onlineLimit = Math.min(
      parseInt((req.query.onlineLimit as string) || "8", 10),
      20
    );
    const recentLimit = Math.min(
      parseInt((req.query.recentLimit as string) || "5", 10),
      20
    );
    const currentUserId = req.query.currentUserId as string | undefined;

    // Helper function to shuffle array
    const shuffleArray = <T>(array: T[]): T[] => {
      const shuffled = [...array];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    };

    // Get all approved partners
    const { data: partnersData, error: partnersError } = await supabase
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
        created_at,
        updated_at,
        background_images,
        member:members!member_id(
          id,
          member_code,
          name,
          profile_image,
          favorite_game,
          current_status,
          updated_at,
          social_id
        )
      `
      )
      .eq("partner_status", "approved")
      .order("created_at", { ascending: false });

    if (partnersError) {
      console.error("Partners fetch error:", partnersError);
      return errorResponse(
        res,
        "PARTNER_FETCH_FAILED",
        "Failed to load partners list",
        partnersError.message,
        500
      );
    }

    if (!partnersData) {
      return successResponse(res, {
        partners: [],
        allPartners: [],
        onlinePartners: [],
        recentPartners: [],
        userReviews: [],
      });
    }

    // Filter out test users
    const filteredPartners = partnersData.filter((partner) => {
      const member = partner.member as any;
      if (!member) return false;
      return !(member.social_id && member.social_id.startsWith("test-social-"));
    });

    const partnerIds = filteredPartners.map((partner) => partner.id);

    // Get reviews for all partners
    const { data: reviewsData, error: reviewsError } = partnerIds.length
      ? await supabase
          .from("reviews")
          .select(
            `
            id,
            rating,
            comment,
            points_earned,
            created_at,
            target_partner_id,
            member_id
          `
          )
          .in("target_partner_id", partnerIds)
          .gt("rating", 0)
      : { data: [], error: null };

    if (reviewsError) {
      console.error("Reviews fetch error:", reviewsError);
    }

    // Calculate review statistics by partner
    const reviewsByPartner = new Map<
      string,
      { totalRating: number; count: number; reviews: Array<any> }
    >();

    (reviewsData || []).forEach((review: any) => {
      if (!review.target_partner_id || review.rating == null) return;
      const existing = reviewsByPartner.get(review.target_partner_id) || {
        totalRating: 0,
        count: 0,
        reviews: [],
      };
      existing.totalRating += review.rating;
      existing.count += 1;
      existing.reviews.push(review);
      reviewsByPartner.set(review.target_partner_id, existing);
    });

    // Add review stats to partners
    const partnersWithStats = filteredPartners.map((partner) => {
      const member = partner.member as any;
      const stats = reviewsByPartner.get(partner.id);
      const { social_id: _socialId, ...sanitizedMember } = member || {};
      return {
        ...partner,
        member: sanitizedMember,
        averageRating:
          stats && stats.count > 0
            ? stats.totalRating / stats.count
            : undefined,
        reviewCount: stats?.count || 0,
      };
    });

    // Separate online and offline partners
    const nonOfflinePartners = partnersWithStats.filter(
      (partner) => (partner.member as any)?.current_status !== "offline"
    );
    const offlinePartners = partnersWithStats.filter(
      (partner) => (partner.member as any)?.current_status === "offline"
    );

    // Shuffle and limit online partners
    const shuffledOnline = shuffleArray(nonOfflinePartners);
    const onlinePartners = shuffledOnline.slice(0, onlineLimit);
    const remainingOnline = shuffledOnline.slice(onlineLimit);
    const shuffledOffline = shuffleArray(offlinePartners);
    const allPartners = [
      ...onlinePartners,
      ...remainingOnline,
      ...shuffledOffline,
    ];

    let recentPartners: Array<any> = [];
    let userReviews: Array<any> = [];

    // Get user's recent reviews if currentUserId is provided
    if (currentUserId) {
      const { data: userReviewsData, error: userReviewsError } = await supabase
        .from("reviews")
        .select(
          `
          id,
          rating,
          comment,
          points_earned,
          created_at,
          target_partner_id
        `
        )
        .eq("member_id", currentUserId)
        .order("created_at", { ascending: false })
        .limit(recentLimit * 3);

      if (userReviewsError) {
        console.error("User reviews fetch error:", userReviewsError);
      } else if (userReviewsData) {
        userReviews = userReviewsData;
        const seen = new Set<string>();
        for (const review of userReviewsData) {
          if (!review.target_partner_id || seen.has(review.target_partner_id))
            continue;
          const partner = partnersWithStats.find(
            (p) => p.id === review.target_partner_id
          );
          if (partner) {
            recentPartners.push({
              ...partner,
              lastReviewDate: review.created_at,
              lastReview: review,
            });
            seen.add(review.target_partner_id);
          }
          if (recentPartners.length >= recentLimit) break;
        }
      }
    }

    return successResponse(res, {
      partners: partnersWithStats,
      allPartners,
      onlinePartners,
      recentPartners,
      userReviews,
    });
  })
);

/**
 * @swagger
 * /api/partners/lookup-by-member-id/{memberId}:
 *   get:
 *     summary: 멤버 ID로 파트너 ID 조회
 *     description: |
 *       멤버 ID로 파트너 ID를 조회합니다.
 *       - 로그인 필수
 *       - 본인의 정보만 조회 가능 (관리자는 모든 사용자 조회 가능)
 *     tags: [Partners]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *         description: 멤버 ID
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
 *                   nullable: true
 *                   properties:
 *                     id:
 *                       type: string
 *                       description: 파트너 ID
 *                 meta:
 *                   type: object
 *                   properties:
 *                     isPartner:
 *                       type: boolean
 *                       description: 파트너 여부
 *       401:
 *         description: 인증 필요
 *       403:
 *         description: 접근 권한 없음 (본인 또는 관리자만 조회 가능)
 *       404:
 *         description: 파트너를 찾을 수 없음
 */
// GET /lookup-by-member-id/:memberId - Get partner ID by member ID
router.get(
  "/lookup-by-member-id/:memberId",
  asyncHandler(async (req, res) => {
    // Authentication required
    const user = await getAuthUser(req);

    const { memberId } = req.params;

    if (!memberId) {
      return errorResponse(res, "INVALID_MEMBER_ID", "Member ID is required");
    }

    const supabase = createSupabaseClient();

    // Check if user is admin or accessing their own data
    const { data: memberData } = await supabase
      .from("members")
      .select("role")
      .eq("id", user.id)
      .single();

    const isAdmin = memberData?.role === "admin";

    // If not admin and memberId doesn't match, deny access
    if (!isAdmin && user.id !== memberId) {
      return errorResponse(
        res,
        "FORBIDDEN",
        "You can only access your own partner information",
        null,
        403
      );
    }

    // Find partner by member_id
    const { data: partnerData, error: partnerError } = await supabase
      .from("partners")
      .select("id")
      .eq("member_id", memberId)
      .maybeSingle();

    if (partnerError) {
      if (partnerError.code === "PGRST116") {
        // Partner not found - return null with isPartner: false
        return successResponse(res, null, { isPartner: false });
      }
      throw partnerError;
    }

    return successResponse(res, partnerData, { isPartner: !!partnerData });
  })
);

/**
 * @swagger
 * /api/partners/common-info/{memberId}:
 *   get:
 *     summary: 멤버 ID로 파트너 공통 정보 조회
 *     description: |
 *       멤버 ID로 파트너 공통 정보를 조회합니다.
 *       - 로그인 필수
 *       - 본인의 정보만 조회 가능 (관리자는 모든 사용자 조회 가능)
 *     tags: [Partners]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *         description: 멤버 ID
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
 *                   nullable: true
 *                   properties:
 *                     id:
 *                       type: string
 *                       description: 파트너 ID
 *                     member_id:
 *                       type: string
 *                     partner_name:
 *                       type: string
 *                     partner_message:
 *                       type: string
 *                     partner_status:
 *                       type: string
 *                     total_points:
 *                       type: number
 *                     game_info:
 *                       type: object
 *                     background_images:
 *                       type: array
 *                     categories:
 *                       type: array
 *                 meta:
 *                   type: object
 *                   properties:
 *                     isPartner:
 *                       type: boolean
 *                       description: 파트너 여부
 *       401:
 *         description: 인증 필요
 *       403:
 *         description: 접근 권한 없음 (본인 또는 관리자만 조회 가능)
 *       404:
 *         description: 파트너를 찾을 수 없음
 */
// GET /common-info/:memberId - Get partner common info by member ID
router.get(
  "/common-info/:memberId",
  asyncHandler(async (req, res) => {
    // Authentication required
    const user = await getAuthUser(req);

    const { memberId } = req.params;

    if (!memberId) {
      return errorResponse(res, "INVALID_MEMBER_ID", "Member ID is required");
    }

    const supabase = createSupabaseClient();

    // Check if user is admin or accessing their own data
    const { data: memberData } = await supabase
      .from("members")
      .select("role")
      .eq("id", user.id)
      .single();

    const isAdmin = memberData?.role === "admin";

    // If not admin and memberId doesn't match, deny access
    if (!isAdmin && user.id !== memberId) {
      return errorResponse(
        res,
        "FORBIDDEN",
        "You can only access your own partner information",
        null,
        403
      );
    }

    // Find partner by member_id (without business info)
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
          )
        `
        )
        .eq("member_id", memberId)
        .maybeSingle(),
      supabase.from("partner_categories").select("*").eq("user_id", memberId),
    ]);

    const { data: partnerData, error: partnerError } = partnerResult;
    const { data: categoriesData } = categoriesResult;

    if (partnerError) {
      if (partnerError.code === "PGRST116") {
        // Partner not found - return null with isPartner: false
        return successResponse(res, null, { isPartner: false });
      }
      throw partnerError;
    }

    if (!partnerData) {
      return successResponse(res, null, { isPartner: false });
    }

    return successResponse(
      res,
      {
        ...partnerData,
        categories: categoriesData || [],
      },
      { isPartner: true }
    );
  })
);

/**
 * @swagger
 * /api/partners/business-info/{partnerId}:
 *   get:
 *     summary: 파트너 ID로 비즈니스 정보 조회
 *     description: |
 *       파트너 ID로 비즈니스 정보(정산 정보)를 조회합니다.
 *       - 로그인 필수
 *       - 본인의 정보만 조회 가능 (관리자는 모든 사용자 조회 가능)
 *     tags: [Partners]
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     partner_id:
 *                       type: string
 *                     legal_name:
 *                       type: string
 *                     legal_email:
 *                       type: string
 *                     legal_phone:
 *                       type: string
 *                     payout_bank_code:
 *                       type: string
 *                     payout_bank_name:
 *                       type: string
 *                     payout_account_number:
 *                       type: string
 *                     payout_account_holder:
 *                       type: string
 *                     tosspayments_business_type:
 *                       type: string
 *                     tosspayments_seller_id:
 *                       type: string
 *                     tosspayments_status:
 *                       type: string
 *       401:
 *         description: 인증 필요
 *       403:
 *         description: 접근 권한 없음 (본인 또는 관리자만 조회 가능)
 *       404:
 *         description: 파트너를 찾을 수 없음
 */
// GET /business-info/:partnerId - Get partner business info by partner ID
router.get(
  "/business-info/:partnerId",
  asyncHandler(async (req, res) => {
    // Authentication required
    const user = await getAuthUser(req);

    const { partnerId } = req.params;

    if (!partnerId) {
      return errorResponse(res, "INVALID_PARTNER_ID", "Partner ID is required");
    }

    const supabase = createSupabaseClient();

    // Get partner to check ownership
    const { data: partnerData, error: partnerError } = await supabase
      .from("partners")
      .select("id, member_id")
      .eq("id", partnerId)
      .maybeSingle();

    if (partnerError) {
      throw partnerError;
    }

    if (!partnerData) {
      return errorResponse(
        res,
        "PARTNER_NOT_FOUND",
        "Partner not found",
        null,
        404
      );
    }

    // Check if user is admin or owner of this partner
    const { data: memberData } = await supabase
      .from("members")
      .select("role")
      .eq("id", user.id)
      .single();

    const isAdmin = memberData?.role === "admin";

    // If not admin and not owner, deny access
    if (!isAdmin && user.id !== partnerData.member_id) {
      return errorResponse(
        res,
        "FORBIDDEN",
        "You can only access your own business information",
        null,
        403
      );
    }

    // Get business info
    const { data: bizInfo, error: bizInfoError } = await supabase
      .from("partner_business_info")
      .select(
        `
        partner_id,
        legal_name,
        legal_email,
        legal_phone,
        payout_bank_code,
        payout_bank_name,
        payout_account_number,
        payout_account_holder,
        tosspayments_business_type,
        tosspayments_seller_id,
        tosspayments_status,
        tax,
        created_at,
        updated_at
      `
      )
      .eq("partner_id", partnerId)
      .maybeSingle();

    if (bizInfoError) {
      throw bizInfoError;
    }

    return successResponse(res, bizInfo);
  })
);

/**
 * @swagger
 * /api/partners/point-history/{partnerId}:
 *   get:
 *     summary: 파트너 포인트 내역 조회
 *     description: |
 *       파트너의 포인트 변동 내역을 조회합니다.
 *       - 로그인 필수
 *       - 본인의 정보만 조회 가능 (관리자는 모든 사용자 조회 가능)
 *     tags: [Partners]
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       partner_id:
 *                         type: string
 *                       points_change:
 *                         type: number
 *                       description:
 *                         type: string
 *                       created_at:
 *                         type: string
 *       401:
 *         description: 인증 필요
 *       403:
 *         description: 접근 권한 없음
 *       404:
 *         description: 파트너를 찾을 수 없음
 */
// GET /point-history/:partnerId - Get partner point history
router.get(
  "/point-history/:partnerId",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const { partnerId } = req.params;

    if (!partnerId) {
      return errorResponse(res, "INVALID_PARTNER_ID", "Partner ID is required");
    }

    const supabase = createSupabaseClient();

    // Get partner to check ownership
    const { data: partnerData, error: partnerError } = await supabase
      .from("partners")
      .select("id, member_id")
      .eq("id", partnerId)
      .maybeSingle();

    if (partnerError) throw partnerError;

    if (!partnerData) {
      return errorResponse(
        res,
        "PARTNER_NOT_FOUND",
        "Partner not found",
        null,
        404
      );
    }

    // Check if user is admin or owner
    const { data: memberData } = await supabase
      .from("members")
      .select("role")
      .eq("id", user.id)
      .single();

    const isAdmin = memberData?.role === "admin";

    if (!isAdmin && user.id !== partnerData.member_id) {
      return errorResponse(
        res,
        "FORBIDDEN",
        "You can only access your own point history",
        null,
        403
      );
    }

    // Get point history (excluding total_points changed logs)
    const { data: logs, error: logsError } = await supabase
      .from("partner_points_logs")
      .select("*")
      .eq("partner_id", partnerId)
      .not("description", "ilike", "%total_points changed%")
      .not("description", "ilike", "%총 포인트 변경%")
      .order("created_at", { ascending: false });

    if (logsError) throw logsError;

    return successResponse(res, logs || []);
  })
);

/**
 * @swagger
 * /api/partners/pending-withdrawals/{partnerId}:
 *   get:
 *     summary: 파트너 대기중인 출금 신청 금액 조회
 *     description: |
 *       파트너의 pending 상태인 출금 신청 금액 합계를 조회합니다.
 *       - 로그인 필수
 *       - 본인의 정보만 조회 가능 (관리자는 모든 사용자 조회 가능)
 *     tags: [Partners]
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
 *                     total_pending:
 *                       type: number
 *                       description: 대기중인 출금 신청 금액 합계
 *       401:
 *         description: 인증 필요
 *       403:
 *         description: 접근 권한 없음
 *       404:
 *         description: 파트너를 찾을 수 없음
 */
// GET /pending-withdrawals/:partnerId - Get pending withdrawals total
router.get(
  "/pending-withdrawals/:partnerId",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const { partnerId } = req.params;

    if (!partnerId) {
      return errorResponse(res, "INVALID_PARTNER_ID", "Partner ID is required");
    }

    const supabase = createSupabaseClient();

    // Get partner to check ownership
    const { data: partnerData, error: partnerError } = await supabase
      .from("partners")
      .select("id, member_id")
      .eq("id", partnerId)
      .maybeSingle();

    if (partnerError) throw partnerError;

    if (!partnerData) {
      return errorResponse(
        res,
        "PARTNER_NOT_FOUND",
        "Partner not found",
        null,
        404
      );
    }

    // Check if user is admin or owner
    const { data: memberData } = await supabase
      .from("members")
      .select("role")
      .eq("id", user.id)
      .single();

    const isAdmin = memberData?.role === "admin";

    if (!isAdmin && user.id !== partnerData.member_id) {
      return errorResponse(
        res,
        "FORBIDDEN",
        "You can only access your own withdrawal info",
        null,
        403
      );
    }

    // Get pending withdrawals with withdrawal_type
    const { data: withdrawals, error: withdrawalError } = await supabase
      .from("partner_withdrawals")
      .select("requested_amount, withdrawal_type")
      .eq("partner_id", partnerId)
      .eq("status", "pending");

    if (withdrawalError) throw withdrawalError;

    // Calculate pending by withdrawal_type
    const pendingByType = {
      total_points: 0,
      store_points: 0,
      collaboration_store_points: 0,
    };

    withdrawals?.forEach((w) => {
      const type = w.withdrawal_type || "total_points";
      if (type in pendingByType) {
        pendingByType[type as keyof typeof pendingByType] += w.requested_amount;
      }
    });

    // Calculate total (for backward compatibility)
    const totalPending =
      pendingByType.total_points +
      pendingByType.store_points +
      pendingByType.collaboration_store_points;

    return successResponse(res, {
      total_pending: totalPending,
      pending_by_type: pendingByType,
    });
  })
);

/**
 * @swagger
 * /api/partners/{partnerId}/status:
 *   put:
 *     summary: 파트너 상태 업데이트
 *     description: |
 *       파트너의 상태를 업데이트합니다.
 *       - 로그인 필수
 *       - 본인의 정보만 수정 가능 (관리자는 모든 사용자 수정 가능)
 *     tags: [Partners]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: partnerId
 *         required: true
 *         schema:
 *           type: string
 *         description: 파트너 ID
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
 *                 enum: [pending, approved, rejected]
 *                 description: 파트너 상태
 *     responses:
 *       200:
 *         description: 성공
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증 필요
 *       403:
 *         description: 접근 권한 없음
 *       404:
 *         description: 파트너를 찾을 수 없음
 */
// PUT /:partnerId/status - Update partner status
router.put(
  "/:partnerId/status",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const { partnerId } = req.params;
    const { status } = req.body;

    if (!partnerId) {
      return errorResponse(res, "INVALID_PARTNER_ID", "Partner ID is required");
    }

    if (!status) {
      return errorResponse(res, "INVALID_STATUS", "Status is required");
    }

    const validStatuses = ["pending", "approved", "rejected"];
    if (!validStatuses.includes(status)) {
      return errorResponse(
        res,
        "INVALID_STATUS",
        `Status must be one of: ${validStatuses.join(", ")}`
      );
    }

    const supabase = createSupabaseClient();

    // Get partner to check ownership
    const { data: partnerData, error: partnerError } = await supabase
      .from("partners")
      .select("id, member_id")
      .eq("id", partnerId)
      .maybeSingle();

    if (partnerError) throw partnerError;

    if (!partnerData) {
      return errorResponse(
        res,
        "PARTNER_NOT_FOUND",
        "Partner not found",
        null,
        404
      );
    }

    // Check if user is admin or owner
    const { data: memberData } = await supabase
      .from("members")
      .select("role")
      .eq("id", user.id)
      .single();

    const isAdmin = memberData?.role === "admin";

    if (!isAdmin && user.id !== partnerData.member_id) {
      return errorResponse(
        res,
        "FORBIDDEN",
        "You can only update your own partner status",
        null,
        403
      );
    }

    // Update partner status
    const { data: updatedPartner, error: updateError } = await supabase
      .from("partners")
      .update({
        partner_status: status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", partnerId)
      .select()
      .single();

    if (updateError) throw updateError;

    return successResponse(res, {
      partner: updatedPartner,
      message: "Partner status updated successfully",
    });
  })
);

/**
 * @swagger
 * /api/partners/request-status:
 *   get:
 *     summary: 두 사용자 간의 요청 상태 조회
 *     tags: [Partners]
 *     parameters:
 *       - in: query
 *         name: currentUserId
 *         required: true
 *         schema:
 *           type: string
 *         description: 현재 사용자 ID
 *       - in: query
 *         name: partnerId
 *         required: true
 *         schema:
 *           type: string
 *         description: 파트너/클라이언트 ID
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
 *                     hasActiveRequest:
 *                       type: boolean
 *                       description: 활성 요청 존재 여부
 *                     requestInfo:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         id:
 *                           type: string
 *                         request_type:
 *                           type: string
 *                         job_count:
 *                           type: integer
 *                         coins_per_job:
 *                           type: integer
 *                         status:
 *                           type: string
 *                           enum: [pending, in_progress]
 *                         call_id:
 *                           type: string
 *                           nullable: true
 *                         created_at:
 *                           type: string
 *                           format: date-time
 *                           description: 생성 시간
 *                         updated_at:
 *                           type: string
 *                           format: date-time
 *                           description: 수정 시간
 *                     activeRequests:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           request_type:
 *                             type: string
 *                           job_count:
 *                             type: integer
 *                           coins_per_job:
 *                             type: integer
 *                           status:
 *                             type: string
 *                             enum: [pending, in_progress]
 *                           call_id:
 *                             type: string
 *                             nullable: true
 *                           created_at:
 *                             type: string
 *                             format: date-time
 *                             description: 생성 시간
 *                           updated_at:
 *                             type: string
 *                             format: date-time
 *                             description: 수정 시간
 *       400:
 *         description: 잘못된 파라미터
 */
// GET /request-status - Get request status between two users
router.get(
  "/request-status",
  asyncHandler(async (req, res) => {
    const currentUserId = req.query.currentUserId as string | undefined;
    const partnerId = req.query.partnerId as string | undefined;

    // 디버그 대상 사용자
    const DEBUG_MEMBER_ID = "";
    const isDebugUser = currentUserId === DEBUG_MEMBER_ID || partnerId === DEBUG_MEMBER_ID;

    if (!currentUserId || !partnerId) {
      return errorResponse(
        res,
        "INVALID_PARAMS",
        "currentUserId and partnerId are required"
      );
    }

    const supabase = createSupabaseClient();

    try {
      // Check if current user is a partner
      const { data: currentUserPartnerData, error: currentUserPartnerError } =
        await supabase
          .from("partners")
          .select("id")
          .eq("member_id", currentUserId)
          .maybeSingle();

      if (
        currentUserPartnerError &&
        currentUserPartnerError.code !== "PGRST116"
      ) {
        throw currentUserPartnerError;
      }

      // Check if the other user is a partner
      const { data: partnerData, error: partnerError } = await supabase
        .from("partners")
        .select("id")
        .eq("member_id", partnerId)
        .maybeSingle();

      if (partnerError && partnerError.code !== "PGRST116") {
        throw partnerError;
      }

      const combos: Array<{
        clientMemberId: string;
        partnerIdResolved: string;
      }> = [];

      if (partnerData) {
        combos.push({
          clientMemberId: currentUserId,
          partnerIdResolved: partnerData.id,
        });
      }

      if (currentUserPartnerData) {
        combos.push({
          clientMemberId: partnerId,
          partnerIdResolved: currentUserPartnerData.id,
        });
      }

      // 디버그 로깅
      if (isDebugUser) {
        console.log("🔍 [DEBUG] request-status API 호출:", {
          currentUserId,
          partnerId,
          currentUserPartnerData,
          partnerData,
          combos,
        });
      }

      if (combos.length === 0) {
        if (isDebugUser) {
          console.log("🔍 [DEBUG] combos가 비어있음 - Neither user is a partner");
        }
        return successResponse(res, {
          hasActiveRequest: false,
          requestInfo: null,
          activeRequests: [],
          debug: {
            reason: "Neither user is a partner",
          },
        });
      }

      const filters = combos.map(
        (combo) =>
          `and(client_id.eq.${combo.clientMemberId},partner_id.eq.${combo.partnerIdResolved})`
      );

      if (isDebugUser) {
        console.log("🔍 [DEBUG] 쿼리 필터:", filters);
      }

      const partnerIdsToCheck = new Set<string>();
      combos.forEach((combo) => partnerIdsToCheck.add(combo.partnerIdResolved));

      const { data: requestsData, error: requestsError } = await supabase
        .from("partner_requests")
        .select(
          `id, client_id, partner_id, request_type, partner_job_id, job_count, coins_per_job, status, call_id, created_at, updated_at,
           partner_job:partner_jobs!partner_job_id(job_name)`
        )
        .or(filters.join(","))
        .in("status", ["pending", "in_progress", "completed", "cancelled"])
        .order("created_at", { ascending: false });

      if (requestsError) throw requestsError;

      // 디버그 로깅 - 쿼리 결과
      if (isDebugUser) {
        console.log("🔍 [DEBUG] 쿼리 결과 (requestsData):", JSON.stringify(requestsData, null, 2));
      }

      // job_name을 최상위 레벨로 추출
      const activeRequests = (requestsData || []).map((req: any) => ({
        ...req,
        job_name: req.partner_job?.job_name || null,
        partner_job: undefined,
      }));

      // 디버그 로깅 - 최종 응답
      if (isDebugUser) {
        console.log("🔍 [DEBUG] 최종 activeRequests:", JSON.stringify(activeRequests.map((r: any) => ({
          id: r.id,
          status: r.status,
          call_id: r.call_id,
          client_id: r.client_id,
          partner_id: r.partner_id,
        })), null, 2));
      }

      if (activeRequests.length > 0) {
        return successResponse(res, {
          hasActiveRequest: true,
          requestInfo: activeRequests[0],
          activeRequests,
        });
      }

      return successResponse(res, {
        hasActiveRequest: false,
        requestInfo: null,
        activeRequests: [],
      });
    } catch (error) {
      console.error("Error checking request status:", error);
      return errorResponse(
        res,
        "REQUEST_STATUS_ERROR",
        "Failed to check request status",
        (error as Error).message
      );
    }
  })
);

export default router;
