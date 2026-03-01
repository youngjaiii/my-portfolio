import express, { Request, Response, NextFunction } from "express";
import { getPayoutList, getPayoutDetail, cancelPayout } from "../controllers/payout.controller";
import { createSupabaseClient, errorResponse, getAuthUser } from "../lib/utils";

const router = express.Router();

// Middleware to check admin role
const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();

    const { data: memberData, error: memberError } = await supabase
      .from("members")
      .select("role")
      .eq("id", user.id)
      .single();

    if (memberError || memberData?.role !== "admin") {
      return errorResponse(res, "FORBIDDEN", "관리자 권한이 필요합니다.", null, 403);
    }

    (req as any).user = user;
    next();
  } catch (error: any) {
    if (error.message?.includes("authorization") || error.message?.includes("token")) {
      return errorResponse(res, "UNAUTHORIZED", "인증이 필요합니다.", null, 401);
    }
    return errorResponse(res, "INTERNAL_ERROR", "서버 오류가 발생했습니다.", error.message, 500);
  }
};

/**
 * @swagger
 * /api/payouts:
 *   get:
 *     summary: Toss 지급 요청 목록 조회 (관리자 전용)
 *     tags: [Payouts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 10000
 *         description: 조회할 지급대행 요청건의 개수 (기본값 10, 최대 10000)
 *       - in: query
 *         name: startingAfter
 *         schema:
 *           type: string
 *         description: 커서로 사용할 지급대행 요청건의 id. 설정한 id의 다음 요청건부터 조회됩니다.
 *       - in: query
 *         name: payoutDateGte
 *         schema:
 *           type: string
 *           format: date
 *         description: 해당 지급일과 같거나 이후(이상)의 요청건 조회 (YYYY-MM-DD)
 *       - in: query
 *         name: payoutDateLte
 *         schema:
 *           type: string
 *           format: date
 *         description: 해당 지급일과 같거나 이전(이하)의 요청건 조회 (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: 지급 목록 조회 성공
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
 *                     version:
 *                       type: string
 *                     traceId:
 *                       type: string
 *                     entityType:
 *                       type: string
 *                     entityBody:
 *                       type: object
 *                       properties:
 *                         items:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                                 description: 지급 고유 ID
 *                               refPayoutId:
 *                                 type: string
 *                                 description: 상점 지급 ID
 *                               destination:
 *                                 type: string
 *                                 description: 셀러 ID
 *                               scheduleType:
 *                                 type: string
 *                                 enum: [NOW, SCHEDULED]
 *                               payoutDate:
 *                                 type: string
 *                                 format: date
 *                               amount:
 *                                 type: object
 *                                 properties:
 *                                   currency:
 *                                     type: string
 *                                   value:
 *                                     type: number
 *                               transactionDescription:
 *                                 type: string
 *                               requestedAt:
 *                                 type: string
 *                                 format: date-time
 *                               status:
 *                                 type: string
 *                                 enum: [REQUESTED, COMPLETED, FAILED]
 *                               error:
 *                                 type: object
 *                                 nullable: true
 *                               metadata:
 *                                 type: object
 *       401:
 *         description: 인증 필요
 *       403:
 *         description: 관리자 권한 필요
 *       500:
 *         description: 실패
 */
router.get("/", requireAdmin, getPayoutList);

/**
 * @swagger
 * /api/payouts/{id}:
 *   get:
 *     summary: Toss 지급대행 단건 조회 (관리자 전용)
 *     tags: [Payouts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 지급대행 요청건의 고유 ID (예: FPA_12345)
 *         example: FPA_12345
 *     responses:
 *       200:
 *         description: 지급대행 단건 조회 성공
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
 *                     version:
 *                       type: string
 *                       example: "2022-11-16"
 *                     traceId:
 *                       type: string
 *                     entityType:
 *                       type: string
 *                       example: "payout"
 *                     entityBody:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           description: 지급 고유 ID
 *                           example: "FPA_12345"
 *                         refPayoutId:
 *                           type: string
 *                           description: 상점 지급 ID
 *                         destination:
 *                           type: string
 *                           description: 셀러 ID
 *                         scheduleType:
 *                           type: string
 *                           enum: [NOW, SCHEDULED]
 *                         payoutDate:
 *                           type: string
 *                           format: date
 *                         amount:
 *                           type: object
 *                           properties:
 *                             currency:
 *                               type: string
 *                               example: "KRW"
 *                             value:
 *                               type: number
 *                               example: 5000
 *                         transactionDescription:
 *                           type: string
 *                         requestedAt:
 *                           type: string
 *                           format: date-time
 *                         status:
 *                           type: string
 *                           enum: [REQUESTED, COMPLETED, FAILED, CANCELED]
 *                         error:
 *                           type: object
 *                           nullable: true
 *                         metadata:
 *                           type: object
 *       400:
 *         description: 잘못된 요청 (ID 누락)
 *       401:
 *         description: 인증 필요
 *       403:
 *         description: 관리자 권한 필요
 *       404:
 *         description: 지급대행 요청을 찾을 수 없음
 *       500:
 *         description: 서버 오류
 */
router.get("/:id", requireAdmin, getPayoutDetail);

/**
 * @swagger
 * /api/payouts/{id}/cancel:
 *   post:
 *     summary: Toss 지급대행 요청 취소 (관리자 전용)
 *     tags: [Payouts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 지급대행 요청건의 고유 ID (예: FPA_12345)
 *         example: FPA_12345
 *     responses:
 *       200:
 *         description: 지급대행 요청 취소 성공
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
 *                     version:
 *                       type: string
 *                       example: "2022-11-16"
 *                     traceId:
 *                       type: string
 *                     entityType:
 *                       type: string
 *                       example: "payout"
 *                     entityBody:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           example: "FPA_12345"
 *                         refPayoutId:
 *                           type: string
 *                         destination:
 *                           type: string
 *                         scheduleType:
 *                           type: string
 *                           enum: [NOW, SCHEDULED]
 *                         payoutDate:
 *                           type: string
 *                           format: date
 *                         amount:
 *                           type: object
 *                           properties:
 *                             currency:
 *                               type: string
 *                               example: "KRW"
 *                             value:
 *                               type: number
 *                               example: 5000
 *                         transactionDescription:
 *                           type: string
 *                         requestedAt:
 *                           type: string
 *                           format: date-time
 *                         status:
 *                           type: string
 *                           example: "CANCELED"
 *                         error:
 *                           type: object
 *                           nullable: true
 *                         metadata:
 *                           type: object
 *       400:
 *         description: 취소할 수 없는 상태 (이미 취소됨, 완료됨 등)
 *       401:
 *         description: 인증 필요
 *       403:
 *         description: 관리자 권한 필요
 *       404:
 *         description: 지급대행 요청을 찾을 수 없음
 *       500:
 *         description: 서버 오류
 */
router.post("/:id/cancel", requireAdmin, cancelPayout);

export default router;
