import { Router } from "express";
import { createSupabaseClient, getAuthUser, asyncHandler, successResponse, errorResponse } from "../lib/utils";
import { Request, Response } from "express";
import { createTossHeaders, getTossSecretKey } from "../lib/toss-auth";

const router = Router();

interface PaymentConfirmRequest {
  paymentKey: string;
  orderId: string;
  amount: number;
}

/**
 * @swagger
 * /api/payment/confirm:
 *   post:
 *     summary: 토스 결제 승인
 *     tags: [Payment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - paymentKey
 *               - orderId
 *               - amount
 *             properties:
 *               paymentKey:
 *                 type: string
 *                 description: 토스 결제 키
 *               orderId:
 *                 type: string
 *                 description: 주문 ID (포인트 정보 포함)
 *               amount:
 *                 type: integer
 *                 description: 결제 금액
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
 *                 message:
 *                   type: string
 *                 points:
 *                   type: integer
 *                 amount:
 *                   type: integer
 *                 tossPayment:
 *                   type: object
 *       400:
 *         description: 결제 정보 부족 또는 결제 승인 실패
 */
// POST /confirm - Confirm Toss payment
router.post(
  "/confirm",
  asyncHandler(async (req: Request, res: Response) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();

    const { paymentKey, orderId, amount }: PaymentConfirmRequest = req.body;

    if (!paymentKey || !orderId || !amount) {
      return errorResponse(
        res,
        "INVALID_REQUEST",
        "결제 정보가 부족합니다.",
        null,
        400
      );
    }

    // Get Toss Payments secret key
    // 결제 승인 API는 TOSS_API_PROD_SECRET_KEY 또는 TOSS_API_DEV_SECRET_KEY를 우선 사용
    const nodeEnv = process.env.NODE_ENV || 'production'; // 기본값: production
    const isLocal = ['local', 'development', 'dev', 'test'].includes(nodeEnv.toLowerCase());
    const isProduction = !isLocal;
    const tossSecretKey = getTossSecretKey('api');
    
    // 디버깅: 환경 정보 로그
    console.log(`🔍 Payment confirm - NODE_ENV: "${nodeEnv}", isLocal: ${isLocal}, isProduction: ${isProduction}`);
    
    if (!tossSecretKey) {
      // getTossSecretKey() 내부에서 이미 로그를 출력하므로 여기서는 간단히 처리
      return errorResponse(
        res,
        "CONFIG_ERROR",
        "토스 페이먼트 설정이 없습니다.",
        {
          hint: `환경 변수에 다음을 설정해주세요: ${isProduction ? 'TOSS_PAY_PROD_SECRET_KEY (프로덕션)' : 'TOSS_PAY_DEV_SECRET_KEY (개발)'}. 또는 하위 호환성을 위해 TOSS_PAY_SECRET_KEY, TOSS_PAY_SECRET_KEY_REAL도 지원합니다.`,
          checkedEnvVars: isProduction
            ? ["TOSS_PAY_PROD_SECRET_KEY", "TOSS_PAY_SECRET_KEY_REAL", "TOSS_PROD_SECRET_KEY", "TOSS_PAYMENTS_SECRET_KEY", "TOSS_PAY_SECRET_KEY", "TOSS_SECRET_KEY"]
            : ["TOSS_PAY_DEV_SECRET_KEY", "TOSS_PAY_SECRET_KEY", "TOSS_DEV_SECRET_KEY", "TOSS_PAYMENTS_SECRET_KEY", "TOSS_SECRET_KEY"],
          nodeEnv: nodeEnv,
          isProduction: isProduction
        },
        500
      );
    }
    
    // 키 타입 확인 및 경고
    const keyType = tossSecretKey.startsWith('test_sk') ? 'TEST' : tossSecretKey.startsWith('live_sk') ? 'LIVE' : 'UNKNOWN';
    if (isProduction && keyType === 'TEST') {
      console.error(`🚨 CRITICAL: Production server is using TEST key! NODE_ENV="${nodeEnv}"`);
    }

    // Create Toss Payments API headers with proper authentication
    const tossHeaders = createTossHeaders(tossSecretKey);

    // Call Toss Payments confirm API
    const tossResponse = await fetch(
      "https://api.tosspayments.com/v1/payments/confirm",
      {
        method: "POST",
        headers: tossHeaders,
        body: JSON.stringify({
          paymentKey,
          orderId,
          amount,
        }),
      }
    );

    const tossResult = await tossResponse.json();

    if (!tossResponse.ok) {
      console.error("❌ Toss Payments API error:", {
        status: tossResponse.status,
        statusText: tossResponse.statusText,
        url: "https://api.tosspayments.com/v1/payments/confirm",
        requestBody: { paymentKey, orderId, amount },
        response: tossResult,
        authHeaderPrefix: tossHeaders.Authorization?.substring(0, 20) + "...",
      });
      
      // 결제 시간 만료 에러 처리
      if (tossResult.message?.includes("만료") || tossResult.message?.includes("존재하지 않습니다")) {
        // paymentKey로 결제 상태를 조회하여 이미 완료된 결제인지 확인
        try {
          const paymentStatusResponse = await fetch(
            `https://api.tosspayments.com/v1/payments/${paymentKey}`,
            {
              method: "GET",
              headers: tossHeaders,
            }
          );

          if (paymentStatusResponse.ok) {
            const paymentStatus = await paymentStatusResponse.json();
            
            // 결제 상태가 DONE이면 이미 처리된 결제
            if (paymentStatus.status === "DONE") {
              // DB에서 이미 처리되었는지 확인
              const { data: existingLog } = await supabase
                .from("member_points_logs")
                .select("id")
                .eq("member_id", user.id)
                .eq("log_id", orderId)
                .maybeSingle();

              if (existingLog) {
                const match = orderId.match(/order_points_(\d+)_/);
                const chargedPoints = match ? Number(match[1]) : 0;
                
                return successResponse(res, {
                  message: "이미 처리된 결제입니다.",
                  points: chargedPoints,
                  amount,
                  warning: "결제는 완료되었지만, 승인 요청이 만료되었습니다. 이미 처리된 결제입니다."
                });
              } else {
                // 결제는 완료되었지만 DB에 기록이 없는 경우 - 수동 처리 필요
                return errorResponse(
                  res,
                  "PAYMENT_COMPLETED_BUT_NOT_PROCESSED",
                  "결제는 완료되었지만 서버에서 처리되지 않았습니다. 고객센터로 문의해주세요.",
                  {
                    originalError: tossResult.message,
                    paymentStatus: paymentStatus.status,
                    hint: "결제는 토스페이먼츠에서 완료되었지만, 서버 처리 중 문제가 발생했습니다. 관리자에게 문의해주세요."
                  },
                  500
                );
              }
            }
          }
        } catch (statusCheckError) {
          console.error("❌ Payment status check error:", statusCheckError);
          // 상태 확인 실패 시 원래 에러 반환
        }
        
        return errorResponse(
          res,
          "PAYMENT_EXPIRED",
          "결제 시간이 만료되었습니다. 다시 결제를 진행해주세요.",
          {
            originalError: tossResult.message,
            hint: "결제 창이 열린 후 즉시 결제를 완료해주세요. 결제 승인 요청은 결제 완료 직후에 이루어져야 합니다."
          },
          400
        );
      }
      
      // 중복 요청 처리 중 에러 (S008)
      if (
        tossResult.code === "FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING" ||
        tossResult.message?.includes("기존 요청을 처리중입니다") ||
        tossResult.message?.includes("S008")
      ) {
        // DB에서 이미 처리되었는지 확인
        const { data: existingLog } = await supabase
          .from("member_points_logs")
          .select("id")
          .eq("member_id", user.id)
          .eq("log_id", orderId)
          .maybeSingle();

        if (existingLog) {
          // 이미 처리된 경우 성공으로 반환
          const match = orderId.match(/order_points_(\d+)_/);
          const chargedPoints = match ? Number(match[1]) : 0;
          
          return successResponse(res, {
            message: "이미 처리된 결제입니다.",
            points: chargedPoints,
            amount,
            warning: "토스페이먼츠에서 중복 요청으로 감지되었지만, 이미 처리 완료된 결제입니다."
          });
        }
        
        return errorResponse(
          res,
          "PAYMENT_PROCESSING",
          "결제 요청이 이미 처리 중입니다. 잠시 후 다시 시도해주세요.",
          {
            originalError: tossResult.message,
            hint: "동일한 결제 요청이 이미 처리 중입니다. 잠시 기다린 후 결제 상태를 확인해주세요.",
            code: tossResult.code
          },
          409 // Conflict
        );
      }
      
      return errorResponse(
        res,
        "PAYMENT_FAILED",
        `결제 승인 실패: ${tossResult.message || "알 수 없는 오류"}`,
        tossResult,
        400
      );
    }

    // Extract points info from orderId
    const match = orderId.match(/order_points_(\d+)_/);
    if (!match) {
      console.error("❌ Invalid orderId format:", orderId);
      return errorResponse(
        res,
        "INVALID_ORDER_ID",
        "주문 정보를 찾을 수 없습니다.",
        { orderId },
        400
      );
    }

    const chargedPoints = Number(match[1]);
    if (Number.isNaN(chargedPoints)) {
      console.error("❌ Invalid points in orderId:", match[1]);
      return errorResponse(
        res,
        "INVALID_POINTS",
        "충전 포인트 정보를 찾을 수 없습니다.",
        { orderId, match: match[1] },
        400
      );
    }

    // Check if payment was already processed
    const { data: existingLog, error: existingError } = await supabase
      .from("member_points_logs")
      .select("id")
      .eq("member_id", user.id)
      .eq("log_id", orderId)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existingLog) {
      return successResponse(res, {
        message: "이미 처리된 결제입니다.",
        points: chargedPoints,
        amount,
      });
    }

    // Get current points
    const { data: memberData, error: memberError } = await supabase
      .from("members")
      .select("total_points")
      .eq("id", user.id)
      .maybeSingle();

    if (memberError) {
      throw memberError;
    }

    const currentTotal = memberData?.total_points ?? 0;

    // Insert points log
    const { error: logError } = await supabase
      .from("member_points_logs")
      .insert({
        member_id: user.id,
        type: "earn",
        amount: chargedPoints,
        description: "토스 포인트 충전",
        log_id: orderId,
      });

    if (logError) {
      throw logError;
    }

    // Update member points
    const { error: updateError } = await supabase
      .from("members")
      .update({ total_points: currentTotal + chargedPoints })
      .eq("id", user.id);

    if (updateError) {
      // Rollback: delete the log entry
      await supabase
        .from("member_points_logs")
        .delete()
        .eq("member_id", user.id)
        .eq("log_id", orderId);

      throw updateError;
    }

    return successResponse(res, {
      message: "결제가 성공적으로 처리되었습니다.",
      points: chargedPoints,
      amount,
      tossPayment: tossResult,
    });
  })
);

/**
 * @swagger
 * /api/payment/success:
 *   get:
 *     summary: 결제 성공 콜백 처리 (GET)
 *     description: 토스페이먼츠 결제 성공 후 리다이렉트된 경우 쿼리 파라미터로 결제를 확인합니다.
 *     tags: [Payment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: paymentKey
 *         required: true
 *         schema:
 *           type: string
 *         description: 토스 결제 키
 *       - in: query
 *         name: orderId
 *         required: true
 *         schema:
 *           type: string
 *         description: 주문 ID
 *       - in: query
 *         name: amount
 *         required: true
 *         schema:
 *           type: integer
 *         description: 결제 금액
 *       - in: query
 *         name: points
 *         schema:
 *           type: integer
 *         description: 충전할 포인트 (선택사항)
 *     responses:
 *       200:
 *         description: 결제 성공
 *       400:
 *         description: 결제 정보 부족 또는 결제 승인 실패
 */
// GET /success - Handle payment success callback (from query parameters)
router.get(
  "/success",
  asyncHandler(async (req: Request, res: Response) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();

    // Get payment info from query parameters
    const paymentKey = req.query.paymentKey as string;
    const orderId = req.query.orderId as string;
    const amount = req.query.amount ? parseInt(req.query.amount as string, 10) : undefined;

    if (!paymentKey || !orderId || !amount) {
      return errorResponse(
        res,
        "INVALID_REQUEST",
        "결제 정보가 부족합니다. paymentKey, orderId, amount가 필요합니다.",
        {
          received: { paymentKey: !!paymentKey, orderId: !!orderId, amount: !!amount }
        },
        400
      );
    }

    // Get Toss Payments secret key
    const nodeEnv = process.env.NODE_ENV || 'production'; // 기본값: production
    const isLocal = ['local', 'development', 'dev', 'test'].includes(nodeEnv.toLowerCase());
    const isProduction = !isLocal;
    const tossSecretKey = getTossSecretKey();
    
    if (!tossSecretKey) {
      // getTossSecretKey() 내부에서 이미 로그를 출력하므로 여기서는 간단히 처리
      return errorResponse(
        res,
        "CONFIG_ERROR",
        "토스 페이먼트 설정이 없습니다.",
        {
          hint: `환경 변수에 다음을 설정해주세요: ${isProduction ? 'TOSS_PAY_PROD_SECRET_KEY (프로덕션)' : 'TOSS_PAY_DEV_SECRET_KEY (개발)'}. 또는 하위 호환성을 위해 TOSS_PAY_SECRET_KEY, TOSS_PAY_SECRET_KEY_REAL도 지원합니다.`,
          checkedEnvVars: isProduction
            ? ["TOSS_PAY_PROD_SECRET_KEY", "TOSS_PAY_SECRET_KEY_REAL", "TOSS_PROD_SECRET_KEY", "TOSS_PAYMENTS_SECRET_KEY", "TOSS_PAY_SECRET_KEY", "TOSS_SECRET_KEY"]
            : ["TOSS_PAY_DEV_SECRET_KEY", "TOSS_PAY_SECRET_KEY", "TOSS_DEV_SECRET_KEY", "TOSS_PAYMENTS_SECRET_KEY", "TOSS_SECRET_KEY"],
          nodeEnv: nodeEnv,
          isProduction: isProduction
        },
        500
      );
    }

    // Create Toss Payments API headers with proper authentication
    const tossHeaders = createTossHeaders(tossSecretKey);

    // Call Toss Payments confirm API
    const tossResponse = await fetch(
      "https://api.tosspayments.com/v1/payments/confirm",
      {
        method: "POST",
        headers: tossHeaders,
        body: JSON.stringify({
          paymentKey,
          orderId,
          amount,
        }),
      }
    );

    const tossResult = await tossResponse.json();

    if (!tossResponse.ok) {
      console.error("❌ Toss Payments API error:", {
        status: tossResponse.status,
        statusText: tossResponse.statusText,
        url: "https://api.tosspayments.com/v1/payments/confirm",
        requestBody: { paymentKey, orderId, amount },
        response: tossResult,
        authHeaderPrefix: tossHeaders.Authorization?.substring(0, 20) + "...",
      });
      
      // 결제 시간 만료 에러 처리
      if (tossResult.message?.includes("만료") || tossResult.message?.includes("존재하지 않습니다")) {
        // paymentKey로 결제 상태를 조회하여 이미 완료된 결제인지 확인
        try {
          const paymentStatusResponse = await fetch(
            `https://api.tosspayments.com/v1/payments/${paymentKey}`,
            {
              method: "GET",
              headers: tossHeaders,
            }
          );

          if (paymentStatusResponse.ok) {
            const paymentStatus = await paymentStatusResponse.json();
            
            // 결제 상태가 DONE이면 이미 처리된 결제
            if (paymentStatus.status === "DONE") {
              // DB에서 이미 처리되었는지 확인
              const { data: existingLog } = await supabase
                .from("member_points_logs")
                .select("id")
                .eq("member_id", user.id)
                .eq("log_id", orderId)
                .maybeSingle();

              if (existingLog) {
                const match = orderId.match(/order_points_(\d+)_/);
                const chargedPoints = match ? Number(match[1]) : 0;
                
                return successResponse(res, {
                  message: "이미 처리된 결제입니다.",
                  points: chargedPoints,
                  amount,
                  warning: "결제는 완료되었지만, 승인 요청이 만료되었습니다. 이미 처리된 결제입니다."
                });
              } else {
                // 결제는 완료되었지만 DB에 기록이 없는 경우 - 수동 처리 필요
                return errorResponse(
                  res,
                  "PAYMENT_COMPLETED_BUT_NOT_PROCESSED",
                  "결제는 완료되었지만 서버에서 처리되지 않았습니다. 고객센터로 문의해주세요.",
                  {
                    originalError: tossResult.message,
                    paymentStatus: paymentStatus.status,
                    hint: "결제는 토스페이먼츠에서 완료되었지만, 서버 처리 중 문제가 발생했습니다. 관리자에게 문의해주세요."
                  },
                  500
                );
              }
            }
          }
        } catch (statusCheckError) {
          console.error("❌ Payment status check error:", statusCheckError);
          // 상태 확인 실패 시 원래 에러 반환
        }
        
        return errorResponse(
          res,
          "PAYMENT_EXPIRED",
          "결제 시간이 만료되었습니다. 다시 결제를 진행해주세요.",
          {
            originalError: tossResult.message,
            hint: "결제 창이 열린 후 즉시 결제를 완료해주세요. 결제 승인 요청은 결제 완료 직후에 이루어져야 합니다."
          },
          400
        );
      }
      
      // 중복 요청 처리 중 에러 (S008)
      if (
        tossResult.code === "FAILED_PAYMENT_INTERNAL_SYSTEM_PROCESSING" ||
        tossResult.message?.includes("기존 요청을 처리중입니다") ||
        tossResult.message?.includes("S008")
      ) {
        // DB에서 이미 처리되었는지 확인
        const { data: existingLog } = await supabase
          .from("member_points_logs")
          .select("id")
          .eq("member_id", user.id)
          .eq("log_id", orderId)
          .maybeSingle();

        if (existingLog) {
          // 이미 처리된 경우 성공으로 반환
          const match = orderId.match(/order_points_(\d+)_/);
          const chargedPoints = match ? Number(match[1]) : 0;
          
          return successResponse(res, {
            message: "이미 처리된 결제입니다.",
            points: chargedPoints,
            amount,
            warning: "토스페이먼츠에서 중복 요청으로 감지되었지만, 이미 처리 완료된 결제입니다."
          });
        }
        
        return errorResponse(
          res,
          "PAYMENT_PROCESSING",
          "결제 요청이 이미 처리 중입니다. 잠시 후 다시 시도해주세요.",
          {
            originalError: tossResult.message,
            hint: "동일한 결제 요청이 이미 처리 중입니다. 잠시 기다린 후 결제 상태를 확인해주세요.",
            code: tossResult.code
          },
          409 // Conflict
        );
      }
      
      return errorResponse(
        res,
        "PAYMENT_FAILED",
        `결제 승인 실패: ${tossResult.message || "알 수 없는 오류"}`,
        tossResult,
        400
      );
    }

    // Extract points info from orderId
    const match = orderId.match(/order_points_(\d+)_/);
    if (!match) {
      console.error("❌ Invalid orderId format:", orderId);
      return errorResponse(
        res,
        "INVALID_ORDER_ID",
        "주문 정보를 찾을 수 없습니다.",
        { orderId },
        400
      );
    }

    const chargedPoints = Number(match[1]);
    if (Number.isNaN(chargedPoints)) {
      console.error("❌ Invalid points in orderId:", match[1]);
      return errorResponse(
        res,
        "INVALID_POINTS",
        "충전 포인트 정보를 찾을 수 없습니다.",
        { orderId, match: match[1] },
        400
      );
    }

    // Check if payment was already processed
    const { data: existingLog, error: existingError } = await supabase
      .from("member_points_logs")
      .select("id")
      .eq("member_id", user.id)
      .eq("log_id", orderId)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existingLog) {
      return successResponse(res, {
        message: "이미 처리된 결제입니다.",
        points: chargedPoints,
        amount,
      });
    }

    // Get current points
    const { data: memberData, error: memberError } = await supabase
      .from("members")
      .select("total_points")
      .eq("id", user.id)
      .maybeSingle();

    if (memberError) {
      throw memberError;
    }

    const currentTotal = memberData?.total_points ?? 0;

    // Insert points log
    const { error: logError } = await supabase
      .from("member_points_logs")
      .insert({
        member_id: user.id,
        type: "earn",
        amount: chargedPoints,
        description: "토스 포인트 충전",
        log_id: orderId,
      });

    if (logError) {
      throw logError;
    }

    // Update member points
    const { error: updateError } = await supabase
      .from("members")
      .update({ total_points: currentTotal + chargedPoints })
      .eq("id", user.id);

    if (updateError) {
      // Rollback: delete the log entry
      await supabase
        .from("member_points_logs")
        .delete()
        .eq("member_id", user.id)
        .eq("log_id", orderId);

      throw updateError;
    }

    return successResponse(res, {
      message: "결제가 성공적으로 처리되었습니다.",
      points: chargedPoints,
      amount,
      tossPayment: tossResult,
    });
  })
);

/**
 * @swagger
 * /api/payment/cancel:
 *   post:
 *     summary: 토스 결제 취소 (환불)
 *     tags: [Payment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - paymentKey
 *               - cancelReason
 *             properties:
 *               paymentKey:
 *                 type: string
 *                 description: 토스 결제 키
 *               cancelReason:
 *                 type: string
 *                 description: 취소 사유
 *               cancelAmount:
 *                 type: integer
 *                 description: 취소할 금액 (부분 취소 시, 없으면 전액 취소)
 *               refundReceiveAccount:
 *                 type: object
 *                 description: 가상계좌 환불 계좌 정보 (가상계좌 결제 취소 시 필요)
 *                 properties:
 *                   bank:
 *                     type: string
 *                     description: 은행 코드
 *                   accountNumber:
 *                     type: string
 *                     description: 계좌번호
 *                   holderName:
 *                     type: string
 *                     description: 예금주명
 *     responses:
 *       200:
 *         description: 취소 성공
 *       400:
 *         description: 취소 실패
 */
// POST /cancel - Cancel Toss payment
router.post(
  "/cancel",
  asyncHandler(async (req: Request, res: Response) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();

    const { paymentKey, cancelReason, cancelAmount, refundReceiveAccount } = req.body;

    if (!paymentKey || !cancelReason) {
      return errorResponse(
        res,
        "INVALID_REQUEST",
        "결제 키와 취소 사유가 필요합니다.",
        null,
        400
      );
    }

    // Get Toss Payments secret key
    const tossSecretKey = getTossSecretKey();
    if (!tossSecretKey) {
      return errorResponse(
        res,
        "CONFIG_ERROR",
        "토스 페이먼트 설정이 없습니다.",
        null,
        500
      );
    }

    // Create Toss Payments API headers
    const tossHeaders = createTossHeaders(tossSecretKey);
    
    // 멱등키 생성 (중복 취소 방지)
    const idempotencyKey = `cancel_${paymentKey}_${Date.now()}`;
    tossHeaders["Idempotency-Key"] = idempotencyKey;

    // 먼저 결제 정보 조회하여 orderId 확인
    const paymentInfoResponse = await fetch(
      `https://api.tosspayments.com/v1/payments/${paymentKey}`,
      {
        method: "GET",
        headers: tossHeaders,
      }
    );

    if (!paymentInfoResponse.ok) {
      const errorResult = await paymentInfoResponse.json();
      return errorResponse(
        res,
        "PAYMENT_NOT_FOUND",
        `결제 정보를 찾을 수 없습니다: ${errorResult.message || "알 수 없는 오류"}`,
        errorResult,
        404
      );
    }

    const paymentInfo = await paymentInfoResponse.json();
    const orderId = paymentInfo.orderId;

    if (!orderId) {
      return errorResponse(
        res,
        "INVALID_PAYMENT",
        "주문 정보가 없는 결제입니다.",
        null,
        400
      );
    }

    // orderId에서 포인트 정보 추출
    const match = orderId.match(/order_points_(\d+)_/);
    if (!match) {
      return errorResponse(
        res,
        "INVALID_ORDER_ID",
        "주문 정보 형식이 올바르지 않습니다.",
        { orderId },
        400
      );
    }

    const chargedPoints = Number(match[1]);
    if (Number.isNaN(chargedPoints)) {
      return errorResponse(
        res,
        "INVALID_POINTS",
        "포인트 정보를 찾을 수 없습니다.",
        { orderId },
        400
      );
    }

    // 취소할 포인트 계산 (부분 취소 시)
    let refundPoints = chargedPoints;
    if (cancelAmount && cancelAmount < paymentInfo.totalAmount) {
      // 부분 취소: 비율에 따라 포인트 계산
      const refundRatio = cancelAmount / paymentInfo.totalAmount;
      refundPoints = Math.floor(chargedPoints * refundRatio);
    }

    // 취소 요청 본문 구성
    const cancelRequestBody: any = {
      cancelReason,
    };

    if (cancelAmount) {
      cancelRequestBody.cancelAmount = cancelAmount;
    }

    if (refundReceiveAccount) {
      cancelRequestBody.refundReceiveAccount = refundReceiveAccount;
    }

    // Call Toss Payments cancel API
    const cancelResponse = await fetch(
      `https://api.tosspayments.com/v1/payments/${paymentKey}/cancel`,
      {
        method: "POST",
        headers: tossHeaders,
        body: JSON.stringify(cancelRequestBody),
      }
    );

    const cancelResult = await cancelResponse.json();

    if (!cancelResponse.ok) {
      console.error("❌ Toss Payments Cancel API error:", {
        status: cancelResponse.status,
        statusText: cancelResponse.statusText,
        url: `https://api.tosspayments.com/v1/payments/${paymentKey}/cancel`,
        requestBody: cancelRequestBody,
        response: cancelResult,
      });

      return errorResponse(
        res,
        "CANCEL_FAILED",
        `결제 취소 실패: ${cancelResult.message || "알 수 없는 오류"}`,
        cancelResult,
        400
      );
    }

    // 취소 성공 시 DB에서 포인트 환불 처리
    // 이미 환불된 결제인지 확인
    const { data: existingRefundLog } = await supabase
      .from("member_points_logs")
      .select("id")
      .eq("member_id", user.id)
      .eq("log_id", `refund_${orderId}`)
      .maybeSingle();

    if (existingRefundLog) {
      // 이미 환불 처리된 경우
      return successResponse(res, {
        message: "이미 환불 처리된 결제입니다.",
        refundPoints,
        cancelResult,
      });
    }

    // 현재 포인트 확인
    const { data: memberData, error: memberError } = await supabase
      .from("members")
      .select("total_points")
      .eq("id", user.id)
      .maybeSingle();

    if (memberError) {
      throw memberError;
    }

    const currentTotal = memberData?.total_points ?? 0;

    // 환불할 포인트가 현재 포인트보다 많으면 에러
    if (refundPoints > currentTotal) {
      return errorResponse(
        res,
        "INSUFFICIENT_POINTS",
        "환불할 포인트가 현재 보유 포인트보다 많습니다.",
        {
          refundPoints,
          currentPoints: currentTotal,
        },
        400
      );
    }

    // 환불 포인트 로그 추가
    const { error: logError } = await supabase
      .from("member_points_logs")
      .insert({
        member_id: user.id,
        type: "spend", // 환불은 spend로 기록 (포인트 차감)
        amount: refundPoints,
        description: `결제 취소 환불: ${cancelReason}`,
        log_id: `refund_${orderId}`,
      });

    if (logError) {
      throw logError;
    }

    // 포인트 차감
    const { error: updateError } = await supabase
      .from("members")
      .update({ total_points: currentTotal - refundPoints })
      .eq("id", user.id);

    if (updateError) {
      // Rollback: delete the log entry
      await supabase
        .from("member_points_logs")
        .delete()
        .eq("member_id", user.id)
        .eq("log_id", `refund_${orderId}`);

      throw updateError;
    }

    return successResponse(res, {
      message: "결제가 성공적으로 취소되었습니다.",
      refundPoints,
      cancelResult,
    });
  })
);

export default router;
