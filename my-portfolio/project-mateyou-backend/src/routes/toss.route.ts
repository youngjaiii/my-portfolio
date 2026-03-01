import { Router } from "express";
import {
  createSupabaseClient,
  successResponse,
  errorResponse,
  getAuthUser,
  asyncHandler,
} from "../lib/utils";
import {
  createTossHeaders,
  getTossSecretKey,
  createTossAuthHeader,
} from "../lib/toss-auth";
import {
  encryptPayload,
  decryptPayload,
  getTossSecurityKey,
} from "../lib/toss";
import Holidays from "date-holidays";

const router = Router();

/**
 * sellerId 자동 생성 함수
 * 형식: MATE + 8자리 랜덤 영숫자 (총 12자)
 */
function generateSellerId(): string {
  // 8자리 랜덤 영숫자 생성 (대문자와 숫자만 사용)
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let randomPart = "";
  for (let i = 0; i < 8; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `MATE${randomPart}`;
}

/**
 * @swagger
 * /api/toss/auth:
 *   get:
 *     summary: 토스페이먼츠 인증 토큰 조회
 *     description: 토스페이먼츠 API 호출에 필요한 Basic 인증 토큰을 반환합니다.
 *     tags: [Toss Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 인증 토큰 조회 성공
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
 *                     token:
 *                       type: string
 *                       description: Base64 인코딩된 Basic 인증 토큰
 *                       example: "dGVzdF9za19...=="
 *                     type:
 *                       type: string
 *                       description: 인증 타입
 *                       example: "Basic"
 *       500:
 *         description: 토스페이먼츠 설정 오류
 */
// GET /auth - Return Toss auth token (requires authentication)
router.get(
  "/auth",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);

    const tossSecretKey = getTossSecretKey();
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

    // Generate Basic Auth token for Toss API
    const headers = createTossHeaders(tossSecretKey);
    const authToken = headers.Authorization.replace("Basic ", "");

    return successResponse(res, {
      token: authToken,
      type: "Basic",
    });
  })
);

/**
 * @swagger
 * /api/toss/balance:
 *   get:
 *     summary: 토스페이먼츠 지급대행 잔액 조회
 *     description: |
 *       토스페이먼츠 지급대행 서비스의 잔액 정보를 조회합니다.
 *       참고: https://docs.tosspayments.com/reference#balance-%EA%B0%9D%EC%B2%B4
 *
 *       **주의사항:**
 *       - Basic 인증 또는 Bearer 인증을 지원합니다.
 *       - Basic 인증: Authorization 헤더에 Basic {base64(secretKey:)} 형식으로 요청 (사용자 인증 불필요)
 *       - Bearer 인증: Authorization 헤더에 Bearer {supabase_jwt_token} 형식으로 요청 (관리자 권한 필요)
 *       - 지급대행 API는 v2/balances 엔드포인트를 사용합니다.
 *       - 암호화는 필요 없습니다.
 *     tags: [Toss Payments]
 *     security:
 *       - bearerAuth: []
 *       - basicAuth: []
 *     responses:
 *       200:
 *         description: 잔액 조회 성공
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
 *                   description: Balance 객체
 *                   properties:
 *                     totalBalance:
 *                       type: number
 *                       description: 총 잔액
 *                       example: 1000000
 *                     availableBalance:
 *                       type: number
 *                       description: 사용 가능한 잔액
 *                       example: 950000
 *                     withdrawableBalance:
 *                       type: number
 *                       description: 출금 가능한 잔액
 *                       example: 900000
 *                     currency:
 *                       type: string
 *                       description: 통화
 *                       example: "KRW"
 *       403:
 *         description: 관리자 권한이 없음
 *       500:
 *         description: 토스페이먼츠 API 오류 또는 설정 오류
 */
// OPTIONS /balance - CORS preflight 처리
router.options("/balance", (req, res) => {
  res.status(200).end();
});

// GET /balance - Get Toss balance (Basic 또는 Bearer 인증 지원)
router.get(
  "/balance",
  asyncHandler(async (req, res) => {
    const requestAuthHeader = req.headers.authorization;
    let tossSecretKey: string | undefined;
    let isBasicAuth = false;

    // Basic 인증 또는 Bearer 인증 확인
    if (requestAuthHeader?.startsWith("Basic ")) {
      // Basic 인증: Secret Key를 직접 받아서 사용
      isBasicAuth = true;
      const base64Auth = requestAuthHeader.replace("Basic ", "");
      let requestDecodedAuth: string;
      try {
        requestDecodedAuth = Buffer.from(base64Auth, "base64").toString(
          "utf-8"
        );
      } catch (error) {
        return errorResponse(
          res,
          "INVALID_AUTH",
          "Basic 인증 헤더 형식이 올바르지 않습니다.",
          null,
          401
        );
      }

      // 콜론(:) 제거하여 실제 Secret Key 추출
      tossSecretKey = requestDecodedAuth.endsWith(":")
        ? requestDecodedAuth.slice(0, -1)
        : requestDecodedAuth;

      if (!tossSecretKey) {
        return errorResponse(
          res,
          "INVALID_AUTH",
          "Secret Key가 없습니다.",
          null,
          401
        );
      }
    } else if (requestAuthHeader?.startsWith("Bearer ")) {
      // Bearer 인증: 사용자 인증 후 환경 변수에서 Secret Key 사용
      const user = await getAuthUser(req);
      const supabase = createSupabaseClient();

      // 관리자 권한 확인
      const { data: memberData, error: memberError } = await supabase
        .from("members")
        .select("role")
        .eq("id", user.id)
        .single();

      if (memberError) {
        throw memberError;
      }

      if (memberData?.role !== "admin") {
        return errorResponse(
          res,
          "FORBIDDEN",
          "관리자 권한이 필요합니다.",
          null,
          403
        );
      }

      // 환경 변수에서 Secret Key 가져오기 (프론트엔드 헤더에서 isProduction 받기)
      const isProductionHeader = req.headers["x-is-production"];
      let isProductionValue: boolean | undefined = undefined;

      if (isProductionHeader !== undefined) {
        // 헤더 값이 문자열이면 'true'인지 확인, boolean이면 그대로 사용
        if (typeof isProductionHeader === "string") {
          isProductionValue = isProductionHeader.toLowerCase() === "true";
        } else if (typeof isProductionHeader === "boolean") {
          isProductionValue = isProductionHeader;
        } else if (Array.isArray(isProductionHeader)) {
          // 배열인 경우 첫 번째 값 사용
          isProductionValue = isProductionHeader[0]?.toLowerCase() === "true";
        }
      }

      tossSecretKey = getTossSecretKey(isProductionValue);
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
    } else {
      return errorResponse(
        res,
        "UNAUTHORIZED",
        "인증이 필요합니다. Basic 또는 Bearer 인증을 사용해주세요.",
        {
          hint: "Basic 인증: Authorization: Basic {base64(secretKey:)}\nBearer 인증: Authorization: Bearer {supabase_jwt_token} (관리자 권한 필요)",
        },
        401
      );
    }

    // 키 타입 확인
    // 토스페이먼츠 키 종류:
    // - test_sk_ / live_sk_: 일반 결제용 Secret Key
    // - test_gsk_ / live_gsk_: 지급대행용 Secret Key (Goods Settlement Key)
    let keyType: string;
    let keyCategory: string;

    if (tossSecretKey.startsWith("test_sk")) {
      keyType = "TEST (DEV)";
      keyCategory = "PAYMENT";
    } else if (tossSecretKey.startsWith("live_sk")) {
      keyType = "LIVE (PROD)";
      keyCategory = "PAYMENT";
    } else if (tossSecretKey.startsWith("test_gsk")) {
      keyType = "TEST (DEV)";
      keyCategory = "PAYOUT";
    } else if (tossSecretKey.startsWith("live_gsk")) {
      keyType = "LIVE (PROD)";
      keyCategory = "PAYOUT";
    } else {
      keyType = "UNKNOWN";
      keyCategory = "UNKNOWN";
    }

    // 환경 정보 확인 (Bearer 인증인 경우에만 의미 있음, Basic 인증은 요청에서 키를 받으므로)
    const nodeEnv = process.env.NODE_ENV || "production";
    let envType = "PROD";
    let isLocal = false;

    if (!isBasicAuth) {
      // Bearer 인증인 경우에만 환경 체크 (환경 변수에서 키를 가져오므로)
      const isExplicitLocal = ["local", "development", "dev"].includes(
        nodeEnv.toLowerCase()
      );
      const isLocalhostRequest =
        req.get("host")?.includes("localhost") ||
        req.get("host")?.includes("127.0.0.1") ||
        req.ip === "127.0.0.1" ||
        req.ip === "::1";
      isLocal =
        isExplicitLocal || (isLocalhostRequest && !process.env.NODE_ENV);
      envType = isLocal ? "DEV" : "PROD";
    }

    // 지급대행 API는 gsk 키 사용 권장
    if (keyCategory === "PAYMENT") {
      console.warn(
        "⚠️  Using payment key (sk) for payout balance API. Consider using payout key (gsk)."
      );
    }

    // Create Toss Payments API headers with proper authentication
    // Balance API는 암호화가 필요 없고 Basic 인증만 필요
    const tossHeaders: Record<string, string> = {
      Authorization: createTossAuthHeader(tossSecretKey),
    };

    // Fetch balance from Toss API v2 (지급대행 API)
    const tossResponse = await fetch(
      "https://api.tosspayments.com/v2/balances",
      {
        method: "GET",
        headers: tossHeaders,
      }
    );

    // 응답 본문을 텍스트로 먼저 읽기
    const responseText = await tossResponse.text();

    if (!tossResponse.ok) {
      let errorData: any;
      try {
        errorData = JSON.parse(responseText);
      } catch {
        errorData = { message: responseText || "Empty response" };
      }

      console.error("❌ Toss Balance API error:", {
        status: tossResponse.status,
        error: errorData?.error?.message || errorData?.message,
        keyType,
        keyCategory,
        keyPrefix: tossSecretKey.substring(0, 15) + "...",
      });

      // 404 에러인 경우 더 자세한 정보 제공
      if (tossResponse.status === 404) {
        // "Not found merchant id" 에러인 경우 추가 정보 제공
        const isMerchantNotFound =
          errorData?.error?.code === "NOT_FOUND_MERCHANT" ||
          errorData?.error?.message?.includes("merchant");

        return errorResponse(
          res,
          "TOSS_API_NOT_FOUND",
          isMerchantNotFound
            ? `잔액 조회 실패: Merchant ID를 찾을 수 없습니다.`
            : `잔액 조회 실패: 엔드포인트를 찾을 수 없습니다.`,
          {
            status: 404,
            url: "https://api.tosspayments.com/v2/balances",
            hint: isMerchantNotFound
              ? `토스페이먼츠 지급대행 서비스의 Merchant ID를 찾을 수 없습니다.

**현재 사용 중인 키 정보:**
- 키 타입: ${keyType}
- 키 카테고리: ${keyCategory}
- 키 접두사: ${tossSecretKey.substring(0, 15)}...
- 환경: ${envType}

**가능한 원인:**
1. 지급대행 서비스 신청은 완료되었지만, 사용 중인 ${
                  keyCategory === "PAYOUT" ? "gsk" : "sk"
                } 키에 해당하는 Merchant ID가 연결되지 않았을 수 있습니다.
2. test_gsk 키와 live_gsk 키는 서로 다른 Merchant ID를 가지고 있습니다. 현재 ${keyType} 키를 사용 중입니다.
3. 토스페이먼츠 개발자센터에서 해당 Secret Key에 지급대행 서비스가 활성화되어 있는지 확인해주세요.
4. 지급대행 서비스 신청 시 사용한 계정과 현재 Secret Key가 일치하지 않을 수 있습니다.

**해결 방법:**
1. 토스페이먼츠 개발자센터 로그인
2. API 키 관리 메뉴로 이동
3. 현재 사용 중인 ${tossSecretKey.substring(0, 12)}... 키 확인
4. 해당 키에 "지급대행" 서비스가 활성화되어 있는지 확인
5. 활성화되지 않았다면 토스페이먼츠 고객센터(1544-7772)로 문의하여 Merchant ID 연결 요청

**참고:**
- test 환경에서는 test_gsk 키 사용
- live 환경에서는 live_gsk 키 사용
- 지급대행 서비스는 별도로 활성화해야 하며, 일반 결제 서비스와는 별개입니다.`
              : "토스페이먼츠 지급대행 서비스가 활성화되어 있는지 확인해주세요. 또는 엔드포인트 URL이 변경되었을 수 있습니다.",
            errorData,
            checkedHeaders: {
              authorization: !!tossHeaders.Authorization,
              authorizationKey: tossHeaders.Authorization,
            },
            keyInfo: {
              keyType: keyType,
              keyCategory: keyCategory,
              keyPrefix: tossSecretKey.substring(0, 15) + "...",
            },
          },
          404
        );
      }

      return errorResponse(
        res,
        "TOSS_API_ERROR",
        `잔액 조회 실패: ${
          errorData.message || errorData.error?.message || "알 수 없는 오류"
        }`,
        errorData,
        tossResponse.status
      );
    }

    // Balance API는 일반 JSON 응답을 반환 (암호화 없음)
    // 응답 형식: { version, traceId, entityBody: { availableAmount, pendingAmount }, entityType: "balance", error }
    let balanceData: any;
    try {
      // 빈 응답 체크
      if (!responseText || responseText.trim() === "") {
        throw new Error("Empty response from Toss API");
      }
      balanceData = JSON.parse(responseText);

      // 토스페이먼츠 응답 형식 확인
      if (balanceData.entityBody && balanceData.entityType === "balance") {
        // entityBody에서 실제 잔액 데이터 추출
        balanceData = {
          totalBalance:
            (balanceData.entityBody.availableAmount?.value || 0) +
            (balanceData.entityBody.pendingAmount?.value || 0),
          availableBalance: balanceData.entityBody.availableAmount?.value || 0,
          pendingBalance: balanceData.entityBody.pendingAmount?.value || 0,
          currency: balanceData.entityBody.availableAmount?.currency || "KRW",
          raw: balanceData, // 원본 응답도 포함
        };
      }
    } catch (parseError: any) {
      console.error("❌ Failed to parse Toss API response:", {
        error: parseError.message,
        responseText: responseText.substring(0, 500),
        status: tossResponse.status,
        statusText: tossResponse.statusText,
      });

      return errorResponse(
        res,
        "TOSS_API_PARSE_ERROR",
        `토스페이먼츠 API 응답 파싱 실패: ${parseError.message}`,
        {
          status: tossResponse.status,
          statusText: tossResponse.statusText,
          responsePreview: responseText.substring(0, 200),
          hint: "토스페이먼츠 API가 예상과 다른 형식의 응답을 반환했습니다.",
        },
        tossResponse.status || 500
      );
    }

    console.log("✅ Toss Balance API success:", {
      totalBalance: balanceData.totalBalance,
      availableBalance: balanceData.availableBalance,
      pendingBalance: balanceData.pendingBalance,
      currency: balanceData.currency,
      keyType,
      keyCategory,
      keyPrefix: tossSecretKey.substring(0, 15) + "...",
    });

    return successResponse(res, balanceData);
  })
);

/**
 * @swagger
 * /api/toss/sellers:
 *   get:
 *     summary: 토스페이먼츠 지급대행 셀러 목록 조회
 *     description: |
 *       토스페이먼츠 지급대행 서비스에 등록된 셀러 목록을 조회합니다.
 *       참고: https://docs.tosspayments.com/reference#%EC%85%80%EB%9F%AC-%EB%AA%A9%EB%A1%9D-%EC%A1%B0%ED%9A%8C
 *
 *       **쿼리 파라미터:**
 *       - `limit` (integer, optional): 조회할 셀러의 개수입니다. 기본값은 10이며, 최대 10,000까지 설정할 수 있습니다.
 *       - `startingAfter` (string, optional): 특정 셀러의 id입니다. 해당 id의 셀러 다음으로 등록된 셀러부터 조회됩니다.
 *
 *       **주의사항:**
 *       - 관리자 권한이 필요합니다.
 *       - 응답은 JWE로 암호화되어 있어 복호화가 필요합니다.
 *       - `x-is-production` 헤더로 프로덕션/개발 환경을 지정할 수 있습니다.
 *     tags: [Toss Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 10000
 *           default: 10
 *         description: 조회할 셀러의 개수
 *       - in: query
 *         name: startingAfter
 *         schema:
 *           type: string
 *         description: 특정 셀러의 id (해당 id 다음부터 조회)
 *     responses:
 *       200:
 *         description: 셀러 목록 조회 성공
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
 *                   description: 셀러 목록 (복호화된 데이터)
 *                   properties:
 *                     hasMore:
 *                       type: boolean
 *                       description: 더 조회할 데이터가 있는지 여부
 *                     size:
 *                       type: integer
 *                       description: 조회된 셀러의 개수
 *                     nextCursor:
 *                       type: string
 *                       nullable: true
 *                       description: 다음 조회 시 startingAfter로 사용할 커서
 *                     items:
 *                       type: array
 *                       description: 셀러 목록
 *                       items:
 *                         type: object
 *       500:
 *         description: 토스페이먼츠 API 오류 또는 설정 오류
 */
// GET /sellers - Get sellers list (admin only, requires JWE decryption)
router.get(
  "/sellers",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();

    // Check if user is admin
    const { data: memberData, error: memberError } = await supabase
      .from("members")
      .select("role")
      .eq("id", user.id)
      .single();

    if (memberError) {
      throw memberError;
    }

    if (memberData?.role !== "admin") {
      return errorResponse(
        res,
        "FORBIDDEN",
        "관리자 권한이 필요합니다.",
        null,
        403
      );
    }

    // Get query parameters
    const limit = req.query.limit
      ? parseInt(req.query.limit as string, 10)
      : 10;
    const startingAfter = req.query.startingAfter as string | undefined;

    // Validate limit
    if (limit < 1 || limit > 10000) {
      return errorResponse(
        res,
        "INVALID_PARAMETER",
        "limit은 1 이상 10,000 이하여야 합니다.",
        null,
        400
      );
    }

    // Get production mode from header
    const isProductionValue =
      req.headers["x-is-production"] === "true" ||
      req.headers["x-is-production"] === "1";
    // 셀러 조회는 지급대행 API이므로 'api' 모드 사용 (TOSS_API_PROD_SECRET_KEY 우선)
    const tossSecretKey = getTossSecretKey("api", isProductionValue);
    if (!tossSecretKey) {
      return errorResponse(
        res,
        "TOSS_CONFIG_MISSING",
        "토스페이먼츠 설정이 없습니다.",
        {
          hint: "환경 변수에 TOSS_API_PROD_SECRET_KEY 또는 TOSS_API_DEV_SECRET_KEY를 설정해주세요.",
        },
        500
      );
    }

    // Create Toss Payments API headers
    const tossHeaders = createTossHeaders(tossSecretKey);
    tossHeaders["TossPayments-api-security-mode"] = "ENCRYPTION";
    // GET 요청은 Content-Type이 필요 없지만, 명시적으로 설정
    delete tossHeaders["Content-Type"];

    // Build query string
    const queryParams = new URLSearchParams();
    if (limit) {
      queryParams.append("limit", limit.toString());
    }
    if (startingAfter) {
      queryParams.append("startingAfter", startingAfter);
    }
    const queryString = queryParams.toString();
    const url = `https://api.tosspayments.com/v2/sellers${
      queryString ? `?${queryString}` : ""
    }`;

    // Fetch sellers from Toss API v2
    // 참고: https://docs.tosspayments.com/reference#%EC%85%80%EB%9F%AC-%EB%AA%A9%EB%A1%9D-%EC%A1%B0%ED%9A%8C
    console.log("🔍 Calling Toss Payments Sellers API (v2)...", {
      url,
      method: "GET",
      queryParams: {
        limit,
        startingAfter,
      },
      headers: {
        ...tossHeaders,
        Authorization: tossHeaders.Authorization?.substring(0, 20) + "...",
      },
    });

    const tossResponse = await fetch(url, {
      method: "GET",
      headers: tossHeaders,
    });

    // 응답 본문을 텍스트로 먼저 읽기
    const responseText = await tossResponse.text();
    console.log("📥 Toss Sellers API Response:", {
      status: tossResponse.status,
      statusText: tossResponse.statusText,
      contentType: tossResponse.headers.get("content-type"),
      bodyLength: responseText.length,
      bodyPreview: responseText.substring(0, 200),
    });

    if (!tossResponse.ok) {
      let errorData: any;
      try {
        errorData = JSON.parse(responseText);
      } catch {
        errorData = { message: responseText || "Empty response" };
      }

      console.error("❌ Toss Payments Sellers API error:", {
        status: tossResponse.status,
        statusText: tossResponse.statusText,
        url: "https://api.tosspayments.com/v2/sellers",
        method: "GET",
        response: errorData,
        responseHeaders: Object.fromEntries(tossResponse.headers.entries()),
        authHeaderPrefix: tossHeaders.Authorization?.substring(0, 20) + "...",
        securityMode: tossHeaders["TossPayments-api-security-mode"],
      });

      // 404 에러인 경우 더 자세한 정보 제공
      if (tossResponse.status === 404) {
        return errorResponse(
          res,
          "TOSS_API_NOT_FOUND",
          `셀러 목록 조회 실패: 엔드포인트를 찾을 수 없습니다.`,
          {
            status: 404,
            url: "https://api.tosspayments.com/v2/sellers",
            hint: "토스페이먼츠 지급대행 서비스가 활성화되어 있는지 확인해주세요. 또는 엔드포인트 URL이 변경되었을 수 있습니다.",
            errorData,
            checkedHeaders: {
              authorization: !!tossHeaders.Authorization,
              securityMode: tossHeaders["TossPayments-api-security-mode"],
            },
          },
          404
        );
      }

      return errorResponse(
        res,
        "TOSS_API_ERROR",
        `셀러 목록 조회 실패: ${
          errorData.message || errorData.error?.message || "알 수 없는 오류"
        }`,
        errorData,
        tossResponse.status
      );
    }

    // 응답이 JWE로 암호화되어 있으므로 복호화
    // 응답 형식: 암호화된 문자열 또는 { data: "encrypted_string" }
    let encryptedResponse: string = responseText;

    try {
      // JSON 형식인 경우 data 필드에서 암호화된 문자열 추출
      const parsed = JSON.parse(responseText);
      if (parsed?.data && typeof parsed.data === "string") {
        encryptedResponse = parsed.data;
      } else if (typeof parsed === "string") {
        encryptedResponse = parsed;
      }
    } catch {
      // 이미 문자열인 경우 그대로 사용
      encryptedResponse = responseText.trim();
    }

    // Python 복호화 사용 여부 확인 (환경변수 또는 헤더로 제어 가능)
    const usePythonEncryption =
      process.env.TOSS_USE_PYTHON_ENCRYPTION === "true" ||
      req.headers["x-use-python-encryption"] === "true";

    try {
      const decryptedData = await decryptPayload(
        encryptedResponse,
        isProductionValue,
        usePythonEncryption
      );
      console.log("✅ Toss Sellers API success (decrypted)");
      console.log("📋 Decrypted sellers list:", {
        hasMore: decryptedData?.hasMore,
        size: decryptedData?.size,
        nextCursor: decryptedData?.nextCursor,
        itemsCount: decryptedData?.items?.length || 0,
      });

      return successResponse(res, decryptedData);
    } catch (decryptError: any) {
      console.error("❌ Failed to decrypt Toss API response:", {
        error: decryptError.message,
        responsePreview: responseText.substring(0, 200),
        encryptedResponsePreview: encryptedResponse.substring(0, 200),
        isProduction: isProductionValue,
        usePython: usePythonEncryption,
      });

      return errorResponse(
        res,
        "TOSS_DECRYPT_ERROR",
        `응답 복호화 실패: ${decryptError.message}`,
        {
          hint: "토스페이먼츠 보안 키(TOSS_API_PROD_SECURITY_KEY 또는 TOSS_API_DEV_SECURITY_KEY)를 확인해주세요.",
          isProduction: isProductionValue,
          usePython: usePythonEncryption,
        },
        500
      );
    }
  })
);

/**
 * @swagger
 * /api/toss/sellers:
 *   post:
 *     summary: 토스페이먼츠 지급대행 셀러 등록
 *     description: |
 *       토스페이먼츠 지급대행 서비스에 셀러를 등록합니다.
 *       참고: https://docs.tosspayments.com/reference#seller-%EA%B0%9D%EC%B2%B4
 *
 *       **주의사항:**
 *       - 관리자 권한이 필요합니다.
 *       - 요청 본문은 JWE로 암호화되어 전송됩니다.
 *       - 응답도 JWE로 암호화되어 있어 복호화가 필요합니다.
 *     tags: [Toss Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refSellerId
 *               - businessType
 *               - company
 *               - account
 *             properties:
 *               refSellerId:
 *                 type: string
 *                 description: 셀러 참조 ID
 *                 example: "my-seller-1"
 *               businessType:
 *                 type: string
 *                 enum: [INDIVIDUAL, INDIVIDUAL_BUSINESS, CORPORATION]
 *                 description: 사업자 유형
 *                 example: "INDIVIDUAL_BUSINESS"
 *               company:
 *                 type: object
 *                 description: 회사 정보
 *                 properties:
 *                   name:
 *                     type: string
 *                     description: 상호명
 *                     example: "테스트 상호"
 *                   representativeName:
 *                     type: string
 *                     description: 대표자명
 *                     example: "김토스"
 *                   businessRegistrationNumber:
 *                     type: string
 *                     description: 사업자등록번호
 *                     example: "1234567890"
 *                   email:
 *                     type: string
 *                     format: email
 *                     description: 이메일
 *                     example: "toss@sample.com"
 *                   phone:
 *                     type: string
 *                     description: 전화번호
 *                     example: "01012345678"
 *               account:
 *                 type: object
 *                 description: 계좌 정보
 *                 properties:
 *                   bankCode:
 *                     type: string
 *                     description: 은행 코드
 *                     example: "092"
 *                   accountNumber:
 *                     type: string
 *                     description: 계좌번호
 *                     example: "123*****90123"
 *                   holderName:
 *                     type: string
 *                     description: 예금주명
 *                     example: "김토스"
 *               metadata:
 *                 type: object
 *                 description: 메타데이터 (선택)
 *                 additionalProperties: true
 *                 example:
 *                   key1: "value1"
 *                   key2: "value2"
 *     responses:
 *       200:
 *         description: 셀러 등록 성공
 *       500:
 *         description: 토스페이먼츠 API 오류 또는 설정 오류
 */
// POST /sellers - Create seller (admin only, requires JWE encryption)
router.post(
  "/sellers",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();

    // Check if user is admin
    const { data: memberData, error: memberError } = await supabase
      .from("members")
      .select("role")
      .eq("id", user.id)
      .single();

    if (memberError) {
      throw memberError;
    }

    if (memberData?.role !== "admin") {
      return errorResponse(
        res,
        "FORBIDDEN",
        "관리자 권한이 필요합니다.",
        null,
        403
      );
    }

    // 셀러 API는 지급대행 API이므로 'api' 모드 사용
    const tossSecretKey = getTossSecretKey("api");
    if (!tossSecretKey) {
      return errorResponse(
        res,
        "TOSS_CONFIG_MISSING",
        "토스페이먼츠 지급대행 설정이 없습니다.",
        {
          hint: "환경 변수에 TOSS_API_PROD_SECRET_KEY 또는 TOSS_PAY_PROD_SECRET_KEY (live_gsk로 시작)를 설정해주세요.",
        },
        500
      );
    }

    // 요청 본문 암호화
    const payload = req.body;
    console.log("🔐 Encrypting seller payload...");
    const encryptedPayload = await encryptPayload(payload);

    // Create Toss Payments API headers
    const tossHeaders = createTossHeaders(tossSecretKey);
    tossHeaders["TossPayments-api-security-mode"] = "ENCRYPTION";
    tossHeaders["Content-Type"] = "text/plain"; // 암호화된 데이터는 text/plain으로 전송

    // Create seller via Toss API v2
    console.log("🔍 Calling Toss Payments Create Seller API (v2)...");
    const tossResponse = await fetch(
      "https://api.tosspayments.com/v2/sellers",
      {
        method: "POST",
        headers: tossHeaders,
        body: encryptedPayload, // 암호화된 문자열을 그대로 전송
      }
    );

    const responseText = await tossResponse.text();
    console.log("📥 Toss Create Seller API Response:", {
      status: tossResponse.status,
      statusText: tossResponse.statusText,
      bodyLength: responseText.length,
      bodyPreview: responseText.substring(0, 200),
    });

    if (!tossResponse.ok) {
      let errorData: any;
      try {
        errorData = JSON.parse(responseText);
      } catch {
        errorData = { message: responseText };
      }

      return errorResponse(
        res,
        "TOSS_API_ERROR",
        `셀러 등록 실패: ${
          errorData.message || errorData.error?.message || "알 수 없는 오류"
        }`,
        errorData,
        tossResponse.status
      );
    }

    // 응답 복호화
    let encryptedResponse: string = responseText;
    try {
      const parsed = JSON.parse(responseText);
      if (parsed?.data && typeof parsed.data === "string") {
        encryptedResponse = parsed.data;
      }
    } catch {
      encryptedResponse = responseText.trim();
    }

    try {
      const decryptedData = await decryptPayload(encryptedResponse);
      console.log("✅ Toss Create Seller API success (decrypted)");

      return successResponse(res, decryptedData);
    } catch (decryptError: any) {
      console.error("❌ Failed to decrypt Toss API response:", decryptError);

      return errorResponse(
        res,
        "TOSS_DECRYPT_ERROR",
        `응답 복호화 실패: ${decryptError.message}`,
        {
          hint: "토스페이먼츠 보안 키를 확인해주세요.",
        },
        500
      );
    }
  })
);

/**
 * @swagger
 * /api/toss/sellers/{sellerId}:
 *   get:
 *     summary: 토스페이먼츠 지급대행 셀러 단건 조회
 *     description: |
 *       특정 셀러의 정보를 조회합니다.
 *       참고: https://docs.tosspayments.com/reference#%EC%85%80%EB%9F%AC-%EB%8B%A8%EA%B1%B4-%EC%A1%B0%ED%9A%8C
 *
 *       **주의사항:**
 *       - Basic 인증 또는 Bearer 인증을 지원합니다.
 *       - Basic 인증: Authorization 헤더에 Basic {base64(secretKey:)} 형식으로 요청 (사용자 인증 불필요)
 *       - Bearer 인증: Authorization 헤더에 Bearer {supabase_jwt_token} 형식으로 요청
 *         - 관리자: 모든 셀러 조회 가능
 *         - 파트너: 본인의 셀러 정보만 조회 가능 (tosspayments_seller_id와 일치하는 경우)
 *       - 응답은 JWE로 암호화되어 있어 복호화가 필요합니다.
 *       - `x-is-production` 헤더로 프로덕션/개발 환경을 지정할 수 있습니다.
 *     tags: [Toss Payments]
 *     security:
 *       - bearerAuth: []
 *       - basicAuth: []
 *     parameters:
 *       - in: path
 *         name: sellerId
 *         required: true
 *         schema:
 *           type: string
 *         description: 셀러 ID
 *     responses:
 *       200:
 *         description: 셀러 조회 성공
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
 *                   description: 셀러 정보 (복호화된 데이터)
 *       404:
 *         description: 셀러를 찾을 수 없음
 *       500:
 *         description: 토스페이먼츠 API 오류 또는 설정 오류
 */
// GET /sellers/:sellerId - Get seller by ID (Basic 또는 Bearer 인증 지원, requires JWE decryption)
router.get(
  "/sellers/:sellerId",
  asyncHandler(async (req, res) => {
    const { sellerId } = req.params;

    // Validate sellerId
    if (!sellerId || typeof sellerId !== "string" || sellerId.trim() === "") {
      return errorResponse(
        res,
        "INVALID_PARAMETER",
        "sellerId는 필수이며 비어있을 수 없습니다.",
        null,
        400
      );
    }

    const requestAuthHeader = req.headers.authorization;
    let tossSecretKey: string | undefined;
    let isBasicAuth = false;

    // Basic 인증 또는 Bearer 인증 확인
    if (requestAuthHeader?.startsWith("Basic ")) {
      // Basic 인증: Secret Key를 직접 받아서 사용
      isBasicAuth = true;
      const base64Auth = requestAuthHeader.replace("Basic ", "");
      let requestDecodedAuth: string;
      try {
        requestDecodedAuth = Buffer.from(base64Auth, "base64").toString(
          "utf-8"
        );
      } catch (error) {
        return errorResponse(
          res,
          "INVALID_AUTH",
          "Basic 인증 헤더 형식이 올바르지 않습니다.",
          null,
          401
        );
      }

      // 콜론(:) 제거하여 실제 Secret Key 추출
      tossSecretKey = requestDecodedAuth.endsWith(":")
        ? requestDecodedAuth.slice(0, -1)
        : requestDecodedAuth;

      if (!tossSecretKey) {
        return errorResponse(
          res,
          "INVALID_AUTH",
          "Secret Key가 없습니다.",
          null,
          401
        );
      }
    } else if (requestAuthHeader?.startsWith("Bearer ")) {
      // Bearer 인증: 사용자 인증 후 환경 변수에서 Secret Key 사용
      const user = await getAuthUser(req);
      const supabase = createSupabaseClient();

      // 사용자 정보 조회 (role 확인)
      const { data: memberData, error: memberError } = await supabase
        .from("members")
        .select("role")
        .eq("id", user.id)
        .single();

      if (memberError) {
        throw memberError;
      }

      // 관리자가 아닌 경우, 파트너 본인의 셀러인지 확인
      if (memberData?.role !== "admin") {
        // 파트너 정보 조회 (partner_business_info 조인)
        const { data: partnerData, error: partnerError } = await supabase
          .from("partners")
          .select("id, partner_business_info(tosspayments_seller_id)")
          .eq("member_id", user.id)
          .maybeSingle();

        if (partnerError) {
          throw partnerError;
        }

        const bizInfo =
          (partnerData?.partner_business_info as any)?.[0] ||
          partnerData?.partner_business_info;
        // 파트너가 아니거나, 요청한 sellerId가 본인의 셀러 ID와 일치하지 않는 경우
        if (!partnerData || bizInfo?.tosspayments_seller_id !== sellerId) {
          return errorResponse(
            res,
            "FORBIDDEN",
            "관리자 권한이 있거나 본인의 셀러 정보만 조회할 수 있습니다.",
            null,
            403
          );
        }
      }

      // 환경 변수에서 Secret Key 가져오기 (프론트엔드 헤더에서 isProduction 받기)
      const isProductionHeader = req.headers["x-is-production"];
      let isProductionValue: boolean | undefined = undefined;

      if (isProductionHeader !== undefined) {
        // 헤더 값이 문자열이면 'true'인지 확인, boolean이면 그대로 사용
        if (typeof isProductionHeader === "string") {
          isProductionValue = isProductionHeader.toLowerCase() === "true";
        } else if (typeof isProductionHeader === "boolean") {
          isProductionValue = isProductionHeader;
        } else if (Array.isArray(isProductionHeader)) {
          // 배열인 경우 첫 번째 값 사용
          isProductionValue = isProductionHeader[0]?.toLowerCase() === "true";
        }
      }

      // 셀러 조회는 지급대행 API이므로 'api' 모드 사용 (TOSS_API_PROD_SECRET_KEY 우선)
      tossSecretKey = getTossSecretKey("api", isProductionValue);
      if (!tossSecretKey) {
        return errorResponse(
          res,
          "TOSS_CONFIG_MISSING",
          "토스페이먼츠 설정이 없습니다.",
          {
            hint: "환경 변수에 TOSS_API_PROD_SECRET_KEY 또는 TOSS_API_DEV_SECRET_KEY를 설정해주세요.",
          },
          500
        );
      }
    } else {
      return errorResponse(
        res,
        "UNAUTHORIZED",
        "인증이 필요합니다. Basic 또는 Bearer 인증을 사용해주세요.",
        {
          hint: "Basic 인증: Authorization: Basic {base64(secretKey:)}\nBearer 인증: Authorization: Bearer {supabase_jwt_token} (관리자 또는 파트너 본인)",
        },
        401
      );
    }

    // Get production mode from header (Basic 인증인 경우 헤더에서, Bearer 인증인 경우 이미 처리됨)
    let isProductionValue: boolean | undefined = undefined;
    if (isBasicAuth) {
      // Basic 인증인 경우 헤더에서 isProduction 확인
      const isProductionHeader = req.headers["x-is-production"];
      if (isProductionHeader !== undefined) {
        if (typeof isProductionHeader === "string") {
          isProductionValue = isProductionHeader.toLowerCase() === "true";
        } else if (typeof isProductionHeader === "boolean") {
          isProductionValue = isProductionHeader;
        } else if (Array.isArray(isProductionHeader)) {
          isProductionValue = isProductionHeader[0]?.toLowerCase() === "true";
        }
      }
    } else {
      // Bearer 인증인 경우 이미 위에서 처리됨
      const isProductionHeader = req.headers["x-is-production"];
      if (isProductionHeader !== undefined) {
        if (typeof isProductionHeader === "string") {
          isProductionValue = isProductionHeader.toLowerCase() === "true";
        } else if (typeof isProductionHeader === "boolean") {
          isProductionValue = isProductionHeader;
        } else if (Array.isArray(isProductionHeader)) {
          isProductionValue = isProductionHeader[0]?.toLowerCase() === "true";
        }
      }
    }
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

    // Create Toss Payments API headers with proper authentication
    const tossHeaders: Record<string, string> = {
      Authorization: createTossAuthHeader(tossSecretKey),
    };
    tossHeaders["TossPayments-api-security-mode"] = "ENCRYPTION";
    delete tossHeaders["Content-Type"];

    const url = `https://api.tosspayments.com/v2/sellers/${sellerId}`;
    console.log("🔍 Calling Toss Payments Get Seller API (v2)...", {
      url,
      sellerId,
      isProduction: isProductionValue,
    });

    const tossResponse = await fetch(url, {
      method: "GET",
      headers: tossHeaders,
    });

    const responseText = await tossResponse.text();
    console.log("📥 Toss Get Seller API Response:", {
      status: tossResponse.status,
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
        // JWE 형식인 경우 복호화 시도
        console.log("🔐 Attempting to decrypt error response (JWE format)...");
        try {
          // Python 복호화 사용 여부 확인
          const usePythonEncryption =
            process.env.TOSS_USE_PYTHON_ENCRYPTION === "true" ||
            req.headers["x-use-python-encryption"] === "true";

          const decryptedError = await decryptPayload(
            trimmedResponse,
            isProductionValue,
            usePythonEncryption
          );
          console.log("✅ Error response decrypted successfully");
          errorData = decryptedError;

          // 복호화된 에러 데이터 구조 확인
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
          console.error("❌ Failed to decrypt error response:", {
            error: decryptError?.message || String(decryptError),
            encryptedLength: trimmedResponse.length,
            encryptedPreview: trimmedResponse.substring(0, 200),
            isProduction: isProductionValue,
          });

          errorData = {
            encryptedMessage: trimmedResponse,
            decryptError:
              decryptError instanceof Error
                ? decryptError.message
                : String(decryptError),
            hint: "에러 응답 복호화에 실패했습니다. 보안 키를 확인하세요.",
          };
          errorMessage = `에러 응답 복호화 실패: ${
            decryptError instanceof Error
              ? decryptError.message
              : String(decryptError)
          }`;
        }
      } else {
        // 일반 JSON 응답인 경우
        try {
          errorData = JSON.parse(responseText);
          errorMessage =
            errorData.message || errorData.error?.message || "알 수 없는 오류";
        } catch {
          errorData = { message: responseText };
          errorMessage = responseText;
        }
      }

      // 404 에러인 경우 더 자세한 정보 제공
      if (tossResponse.status === 404) {
        return errorResponse(
          res,
          "TOSS_API_NOT_FOUND",
          `셀러를 찾을 수 없습니다: ${errorMessage}`,
          {
            sellerId,
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
        `셀러 조회 실패: ${errorMessage}`,
        {
          sellerId,
          ...errorData,
        },
        tossResponse.status
      );
    }

    // 응답이 JWE로 암호화되어 있으므로 복호화
    let encryptedResponse: string = responseText;
    try {
      const parsed = JSON.parse(responseText);
      if (parsed?.data && typeof parsed.data === "string") {
        encryptedResponse = parsed.data;
      } else if (typeof parsed === "string") {
        encryptedResponse = parsed;
      }
    } catch {
      encryptedResponse = responseText.trim();
    }

    // Python 복호화 사용 여부 확인
    const usePythonEncryption =
      process.env.TOSS_USE_PYTHON_ENCRYPTION === "true" ||
      req.headers["x-use-python-encryption"] === "true";

    try {
      const decryptedData = await decryptPayload(
        encryptedResponse,
        isProductionValue,
        usePythonEncryption
      );
      console.log("✅ Toss Get Seller API success (decrypted)");

      // entityBody 구조 확인 (토스페이먼츠 API 응답 형식)
      const entityBody = decryptedData?.entityBody || decryptedData;
      const tossStatus = entityBody?.status;
      const tossSellerId =
        entityBody?.id ||
        decryptedData?.id ||
        decryptedData?.sellerId ||
        sellerId;

      console.log("📋 Decrypted seller data:", {
        sellerId: tossSellerId,
        refSellerId: entityBody?.refSellerId || decryptedData?.refSellerId,
        businessType: entityBody?.businessType || decryptedData?.businessType,
        status: tossStatus,
      });

      // DB 업데이트: status가 다를 경우 partner_business_info 테이블 업데이트
      if (tossStatus) {
        try {
          const supabase = createSupabaseClient();

          // sellerId로 파트너 비즈니스 정보 조회
          const { data: bizInfoData, error: bizInfoError } = await supabase
            .from("partner_business_info")
            .select("partner_id, tosspayments_status")
            .eq("tosspayments_seller_id", sellerId)
            .maybeSingle();

          if (!bizInfoError && bizInfoData) {
            // status가 다르면 업데이트
            if (bizInfoData.tosspayments_status !== tossStatus) {
              console.log("🔄 Updating partner business info status:", {
                partnerId: bizInfoData.partner_id,
                oldStatus: bizInfoData.tosspayments_status,
                newStatus: tossStatus,
              });

              const { error: updateError } = await supabase
                .from("partner_business_info")
                .update({
                  tosspayments_status: tossStatus,
                  tosspayments_synced_at: new Date().toISOString(),
                  tosspayments_last_error: null,
                })
                .eq("partner_id", bizInfoData.partner_id);

              if (updateError) {
                console.error(
                  "❌ Failed to update partner business info status:",
                  updateError
                );
              } else {
                console.log(
                  "✅ Partner business info status updated successfully"
                );
              }
            } else {
              console.log(
                "ℹ️  Partner status is already up to date:",
                tossStatus
              );
            }
          } else if (bizInfoError) {
            console.warn(
              "⚠️  Failed to find partner_business_info for sellerId:",
              sellerId,
              bizInfoError
            );
          }
        } catch (dbError: any) {
          // DB 업데이트 실패해도 API 응답은 성공으로 반환
          console.error(
            "❌ Error updating partner business info status in DB:",
            dbError
          );
        }
      }

      return successResponse(res, decryptedData);
    } catch (decryptError: any) {
      console.error("❌ Failed to decrypt Toss API response:", {
        error: decryptError.message,
        responsePreview: responseText.substring(0, 200),
        encryptedResponsePreview: encryptedResponse.substring(0, 200),
        isProduction: isProductionValue,
        usePython: usePythonEncryption,
      });

      return errorResponse(
        res,
        "TOSS_DECRYPT_ERROR",
        `응답 복호화 실패: ${decryptError.message}`,
        {
          hint: "토스페이먼츠 보안 키(TOSS_API_PROD_SECURITY_KEY 또는 TOSS_API_DEV_SECURITY_KEY)를 확인해주세요.",
          isProduction: isProductionValue,
          usePython: usePythonEncryption,
        },
        500
      );
    }
  })
);

/**
 * @swagger
 * /api/toss/sellers/{sellerId}:
 *   delete:
 *     summary: 토스페이먼츠 지급대행 셀러 삭제
 *     description: 셀러를 삭제합니다.
 *     tags: [Toss Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sellerId
 *         required: true
 *         schema:
 *           type: string
 *         description: 셀러 ID
 *     responses:
 *       200:
 *         description: 셀러 삭제 성공
 *       500:
 *         description: 토스페이먼츠 API 오류 또는 설정 오류
 */
// DELETE /sellers/:sellerId - Delete seller (admin only)
router.delete(
  "/sellers/:sellerId",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const { sellerId } = req.params;

    // Validate sellerId
    if (!sellerId || typeof sellerId !== "string" || sellerId.trim() === "") {
      return errorResponse(
        res,
        "INVALID_PARAMETER",
        "sellerId는 필수이며 비어있을 수 없습니다.",
        null,
        400
      );
    }

    // Check if user is admin or owns this seller
    const { data: memberData, error: memberError } = await supabase
      .from("members")
      .select("role")
      .eq("id", user.id)
      .single();

    if (memberError) {
      throw memberError;
    }

    if (memberData?.role !== "admin") {
      // 관리자가 아니면 파트너 본인인지 확인
      const { data: partnerData, error: partnerDataError } = await supabase
        .from("partners")
        .select("id, partner_business_info(tosspayments_seller_id)")
        .eq("member_id", user.id)
        .single();

      if (partnerDataError) {
        if (partnerDataError.code === "PGRST116") {
          return errorResponse(
            res,
            "NOT_A_PARTNER",
            "User is not a partner",
            null,
            403
          );
        }
        throw partnerDataError;
      }

      const bizInfo =
        (partnerData?.partner_business_info as any)?.[0] ||
        partnerData?.partner_business_info;
      // 파트너 본인의 tosspayments_seller_id와 요청한 sellerId가 일치하는지 확인
      if (bizInfo?.tosspayments_seller_id !== sellerId) {
        return errorResponse(
          res,
          "FORBIDDEN",
          "관리자 권한이 없거나 본인의 셀러 정보가 아닙니다.",
          null,
          403
        );
      }
    }

    // Get production mode from header
    const isProductionValue =
      req.headers["x-is-production"] === "true" ||
      req.headers["x-is-production"] === "1";
    // 셀러 삭제는 지급대행 API이므로 'api' 모드 사용 (TOSS_API_PROD_SECRET_KEY 우선)
    const tossSecretKey = getTossSecretKey("api", isProductionValue);

    if (!tossSecretKey) {
      return errorResponse(
        res,
        "TOSS_CONFIG_MISSING",
        "토스페이먼츠 설정이 없습니다.",
        {
          hint: "환경 변수에 TOSS_API_PROD_SECRET_KEY 또는 TOSS_API_DEV_SECRET_KEY를 설정해주세요.",
        },
        500
      );
    }

    const tossHeaders = createTossHeaders(tossSecretKey);
    tossHeaders["TossPayments-api-security-mode"] = "ENCRYPTION";
    delete tossHeaders["Content-Type"];

    const url = `https://api.tosspayments.com/v2/sellers/${sellerId}`;
    console.log("🔍 Calling Toss Payments Delete Seller API (v2)...", {
      url,
      sellerId,
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
        // JWE 형식인 경우 복호화 시도
        console.log("🔐 Attempting to decrypt error response (JWE format)...");
        try {
          // Python 복호화 사용 여부 확인
          const usePythonEncryption =
            process.env.TOSS_USE_PYTHON_ENCRYPTION === "true" ||
            req.headers["x-use-python-encryption"] === "true";

          const decryptedError = await decryptPayload(
            trimmedResponse,
            isProductionValue,
            usePythonEncryption
          );
          console.log("✅ Error response decrypted successfully");
          errorData = decryptedError;

          // 복호화된 에러 데이터 구조 확인
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
          console.error("❌ Failed to decrypt error response:", {
            error: decryptError?.message || String(decryptError),
            encryptedLength: trimmedResponse.length,
            encryptedPreview: trimmedResponse.substring(0, 200),
            isProduction: isProductionValue,
          });

          errorData = {
            encryptedMessage: trimmedResponse,
            decryptError:
              decryptError instanceof Error
                ? decryptError.message
                : String(decryptError),
            hint: "에러 응답 복호화에 실패했습니다. 보안 키를 확인하세요.",
          };
          errorMessage = `에러 응답 복호화 실패: ${
            decryptError instanceof Error
              ? decryptError.message
              : String(decryptError)
          }`;
        }
      } else {
        // 일반 JSON 응답인 경우
        try {
          errorData = JSON.parse(responseText);
          errorMessage =
            errorData.message || errorData.error?.message || "알 수 없는 오류";
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
          ...errorData,
        },
        tossResponse.status
      );
    }

    // 셀러 삭제 성공 시 DB 업데이트
    // sellerId로 partner_business_info 찾기 (셀러 삭제 직후이므로 아직 tosspayments_seller_id가 있음)
    console.log(
      `🔍 Looking for partner_business_info with sellerId: ${sellerId}`
    );
    const { data: bizInfoData, error: bizInfoFetchError } = await supabase
      .from("partner_business_info")
      .select("partner_id, tosspayments_seller_id")
      .eq("tosspayments_seller_id", sellerId)
      .maybeSingle();

    if (bizInfoFetchError) {
      console.error(
        "❌ Error fetching partner_business_info for seller deletion:",
        {
          error: bizInfoFetchError,
          sellerId,
        }
      );
    } else if (!bizInfoData) {
      console.warn(
        `⚠️  No partner_business_info found with sellerId: ${sellerId}. Skipping DB update.`
      );
    } else {
      const partnerId = bizInfoData.partner_id;
      console.log(`✅ Found partner ${partnerId} for sellerId ${sellerId}`);

      // Step 1: 환전 대기 포인트들을 먼저 rejected로 처리 (partner_business_info 테이블 업데이트 전에)
      console.log(
        `🔍 Looking for pending withdrawals for partner ${partnerId}`
      );
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
        console.error("❌ Failed to reject pending withdrawals:", {
          error: rejectWithdrawalsError,
          partnerId,
        });
        // 환전 거부 실패는 경고만 하고 계속 진행 (셀러 삭제는 이미 성공)
        console.warn(
          "⚠️  Warning: Failed to reject pending withdrawals, but seller deletion succeeded"
        );
      } else {
        console.log(
          `📊 Found ${
            rejectedWithdrawals?.length || 0
          } pending withdrawal(s) for partner ${partnerId}`
        );

        if (rejectedWithdrawals && rejectedWithdrawals.length > 0) {
          console.log(
            `✅ Rejected ${rejectedWithdrawals.length} pending withdrawal(s) for partner ${partnerId}`
          );

          // 거절된 출금 요청들에 대해 로그 추가
          for (const withdrawal of rejectedWithdrawals) {
            const { error: logError } = await supabase
              .from("partner_points_logs")
              .insert({
                partner_id: withdrawal.partner_id,
                type: "earn",
                amount: withdrawal.requested_amount, // 취소된 포인트 금액 기록
                description: `출금 요청 거절 (셀러 삭제로 인한 자동 거절, 요청 금액: ${withdrawal.requested_amount} 포인트)`,
                log_id: withdrawal.id.toString(),
              });

            if (logError) {
              console.error(
                `❌ Failed to add log for rejected withdrawal ${withdrawal.id}:`,
                logError
              );
            } else {
              console.log(
                `✅ Added log for rejected withdrawal ${withdrawal.id}`
              );
            }
          }
        } else {
          console.log(
            `ℹ️  No pending withdrawals found for partner ${partnerId}`
          );
        }
      }

      // Step 2: partner_business_info 테이블 업데이트 (환전 대기 포인트 처리 후)
      const { error: updateError } = await supabase
        .from("partner_business_info")
        .update({
          tosspayments_seller_id: null,
          tosspayments_status: null,
          tosspayments_synced_at: new Date().toISOString(),
        })
        .eq("partner_id", partnerId);

      if (updateError) {
        console.error(
          "❌ Failed to update partner_business_info after seller deletion:",
          {
            error: updateError,
            partnerId,
            sellerId,
          }
        );
      } else {
        console.log(
          `✅ Partner business info updated after seller deletion: ${partnerId}`
        );
      }
    }

    // DELETE는 응답이 없을 수 있음
    if (!responseText || responseText.trim() === "") {
      return successResponse(res, { message: "셀러가 삭제되었습니다." });
    }

    // 응답이 있으면 복호화 시도
    let encryptedResponse: string = responseText;
    try {
      const parsed = JSON.parse(responseText);
      if (parsed?.data && typeof parsed.data === "string") {
        encryptedResponse = parsed.data;
      } else if (typeof parsed === "string") {
        encryptedResponse = parsed;
      }
    } catch {
      encryptedResponse = responseText.trim();
    }

    // Python 복호화 사용 여부 확인
    const usePythonEncryption =
      process.env.TOSS_USE_PYTHON_ENCRYPTION === "true" ||
      req.headers["x-use-python-encryption"] === "true";

    try {
      const decryptedData = await decryptPayload(
        encryptedResponse,
        isProductionValue,
        usePythonEncryption
      );
      console.log("✅ Toss Delete Seller API success (decrypted)");
      return successResponse(res, decryptedData);
    } catch (decryptError: any) {
      // 복호화 실패해도 삭제는 성공했을 수 있음
      console.warn(
        "⚠️  Failed to decrypt response, but deletion might have succeeded:",
        decryptError.message
      );
      return successResponse(res, {
        message: "셀러가 삭제되었습니다.",
        rawResponse: responseText,
        decryptError: decryptError.message,
      });
    }
  })
);

// 공통 셀러 생성/수정 핸들러 함수
async function handleSellerOperation(
  req: any,
  res: any,
  modeParam?: string,
  sellerIdParam?: string
) {
  const user = await getAuthUser(req);
  const { mode: bodyMode, sellerId: bodySellerId, payload } = req.body;

  // mode와 sellerId는 파라미터 우선, body에서도 가져올 수 있음
  const mode = modeParam || bodyMode;
  const sellerId = sellerIdParam || bodySellerId;

  // Default to "create" if mode is not provided
  const actualMode = mode || "create";

  // Validate mode
  if (actualMode !== "create" && actualMode !== "update") {
    return errorResponse(
      res,
      "INVALID_MODE",
      "mode는 'create' 또는 'update'여야 합니다.",
      null,
      400
    );
  }

  // Validate sellerId for update mode
  if (actualMode === "update" && (!sellerId || typeof sellerId !== "string")) {
    return errorResponse(
      res,
      "INVALID_SELLER_ID",
      "update 모드에서는 sellerId가 필수입니다.",
      null,
      400
    );
  }

  // Validate payload
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return errorResponse(
      res,
      "INVALID_PAYLOAD",
      "payload는 객체여야 합니다.",
      null,
      400
    );
  }

  // Validate businessType and required fields
  const { businessType, individual, company, account } = payload;

  if (!businessType) {
    return errorResponse(
      res,
      "INVALID_PAYLOAD",
      "payload에 businessType이 필수입니다.",
      null,
      400
    );
  }

  if (businessType === "INDIVIDUAL") {
    if (!individual || typeof individual !== "object") {
      return errorResponse(
        res,
        "INVALID_PAYLOAD",
        "businessType이 INDIVIDUAL일 때 individual 객체가 필수입니다.",
        null,
        400
      );
    }
    if (!individual.name || !individual.email || !individual.phone) {
      return errorResponse(
        res,
        "INVALID_PAYLOAD",
        "individual 객체에 name, email, phone이 필수입니다.",
        null,
        400
      );
    }
  } else if (
    businessType === "INDIVIDUAL_BUSINESS" ||
    businessType === "CORPORATION"
  ) {
    if (!company || typeof company !== "object") {
      return errorResponse(
        res,
        "INVALID_PAYLOAD",
        `businessType이 ${businessType}일 때 company 객체가 필수입니다.`,
        null,
        400
      );
    }
    if (
      !company.name ||
      !company.representativeName ||
      !company.businessRegistrationNumber ||
      !company.email ||
      !company.phone
    ) {
      return errorResponse(
        res,
        "INVALID_PAYLOAD",
        "company 객체에 name, representativeName, businessRegistrationNumber, email, phone이 필수입니다.",
        null,
        400
      );
    }
  } else {
    return errorResponse(
      res,
      "INVALID_PAYLOAD",
      "businessType은 INDIVIDUAL, INDIVIDUAL_BUSINESS, 또는 CORPORATION이어야 합니다.",
      null,
      400
    );
  }

  // Validate account
  if (!account || typeof account !== "object") {
    return errorResponse(
      res,
      "INVALID_PAYLOAD",
      "account 객체가 필수입니다.",
      null,
      400
    );
  }
  if (!account.bankCode || !account.accountNumber || !account.holderName) {
    return errorResponse(
      res,
      "INVALID_PAYLOAD",
      "account 객체에 bankCode, accountNumber, holderName이 필수입니다.",
      null,
      400
    );
  }

  // sellerId 자동 생성 (create 모드이고 sellerId가 없을 때)
  let actualSellerId = sellerId;
  if (actualMode === "create" && !actualSellerId) {
    actualSellerId = generateSellerId();
    console.log(`🔧 Auto-generated sellerId: ${actualSellerId}`);
  }

  // refSellerId 자동 생성 (payload에 없을 때)
  if (!payload.refSellerId) {
    payload.refSellerId = generateSellerId();
    console.log(`🔧 Auto-generated refSellerId: ${payload.refSellerId}`);
  }

  // Get environment from header
  const isProductionHeader = req.headers["x-is-production"];
  let isProductionValue: boolean | undefined = undefined;

  if (isProductionHeader !== undefined) {
    if (typeof isProductionHeader === "string") {
      isProductionValue = isProductionHeader.toLowerCase() === "true";
    } else if (typeof isProductionHeader === "boolean") {
      isProductionValue = isProductionHeader;
    } else if (Array.isArray(isProductionHeader)) {
      isProductionValue = isProductionHeader[0]?.toLowerCase() === "true";
    }
  }

  // 셀러 API는 지급대행 API이므로 'api' 모드 사용
  const tossSecretKey = getTossSecretKey("api", isProductionValue);
  if (!tossSecretKey) {
    return errorResponse(
      res,
      "TOSS_CONFIG_MISSING",
      "토스페이먼츠 지급대행 설정이 없습니다.",
      {
        hint: "환경 변수에 TOSS_API_PROD_SECRET_KEY 또는 TOSS_PAY_PROD_SECRET_KEY (live_gsk로 시작)를 설정해주세요.",
      },
      500
    );
  }

  // [나머지 로직은 동일하게 계속...]
  // 암호화, API 호출, 복호화, DB 업데이트 등
  // 기존 POST /seller 핸들러의 나머지 로직을 여기에 포함
}

/**
 * @swagger
 * /api/toss/seller:
 *   post:
 *     summary: 토스페이먼츠 지급대행 셀러 생성/수정 (통합 엔드포인트)
 *     description: |
 *       토스페이먼츠 지급대행 서비스에 셀러를 생성하거나 수정합니다.
 *
 *       **중요: Partner 승인 후 이 API를 호출해야 정산 기능을 사용할 수 있습니다.**
 *
 *       **워크플로우:**
 *       1. 사용자가 파트너 신청 (`POST /api/auth/partner-apply`)
 *       2. 관리자가 승인 (`PUT /api/admin/partners/:partnerId/status`)
 *       3. **이 API로 Toss Seller 등록** ← 현재 단계
 *       4. 정산 기능 사용 가능
 *
 *       **동작 방식:**
 *       - `mode: "create"`: 새로운 셀러 생성 (sellerId 자동 생성: MATE + 8자리 랜덤)
 *       - `mode: "update"`: 기존 셀러 정보 수정 (sellerId 필수)
 *       - `metadata.partnerId` 제공 시: 성공 후 partners 테이블에 Toss 정보 자동 저장
 *
 *       **보안:**
 *       - 요청 payload는 JWE(JSON Web Encryption)로 암호화되어 전송
 *       - 응답도 JWE로 암호화되어 복호화 후 반환
 *       - 환경 변수 `TOSS_API_PROD_SECURITY_KEY` 또는 `TOSS_API_DEV_SECURITY_KEY` 필요
 *
 *       **참고:**
 *       - RESTful 방식의 `PUT /api/toss/sellers/:sellerId`도 사용 가능 (동일한 로직)
 *       - 상세 가이드: [Partner 및 Toss Seller 가이드](https://github.com/mateyou2025/mateyou-backend/blob/main/docs/PARTNER_TOSS_GUIDE.md)
 *       - 은행 코드: [Toss Payments 은행 코드](https://docs.tosspayments.com/resources/codes/bank-codes)
 *     tags: [Toss Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - payload
 *             properties:
 *               mode:
 *                 type: string
 *                 enum: [create, update]
 *                 description: 셀러 생성 또는 수정 모드. create는 새로운 셀러 생성, update는 기존 셀러 수정
 *                 default: create
 *               sellerId:
 *                 type: string
 *                 description: |
 *                   셀러 ID
 *                   - update 모드일 때 필수
 *                   - create 모드일 때 선택 (없으면 자동 생성: MATE + 8자리 랜덤 영숫자)
 *               payload:
 *                 type: object
 *                 description: 셀러 정보 (암호화되어 전송됨)
 *                 required:
 *                   - businessType
 *                   - account
 *                 properties:
 *                   refSellerId:
 *                     type: string
 *                     description: |
 *                       셀러 참조 ID (선택)
 *                       - 없으면 자동 생성: MATE + 8자리 랜덤 영숫자
 *                       - partners 테이블의 tosspayments_ref_seller_id에 저장됨
 *                   businessType:
 *                     type: string
 *                     enum: [INDIVIDUAL, INDIVIDUAL_BUSINESS, CORPORATION]
 *                     description: |
 *                       사업자 유형
 *                       - INDIVIDUAL: 개인 (individual 객체 필수)
 *                       - INDIVIDUAL_BUSINESS: 개인사업자 (company 객체 필수)
 *                       - CORPORATION: 법인 (company 객체 필수)
 *                   individual:
 *                     type: object
 *                     description: 개인 정보 (businessType이 INDIVIDUAL일 때 필수)
 *                     properties:
 *                       name:
 *                         type: string
 *                         description: 이름
 *                       email:
 *                         type: string
 *                         format: email
 *                         description: 이메일
 *                       phone:
 *                         type: string
 *                         description: 전화번호
 *                   company:
 *                     type: object
 *                     description: 회사 정보 (businessType이 INDIVIDUAL_BUSINESS 또는 CORPORATION일 때 필수)
 *                     properties:
 *                       name:
 *                         type: string
 *                         description: 상호명
 *                       representativeName:
 *                         type: string
 *                         description: 대표자명
 *                       businessRegistrationNumber:
 *                         type: string
 *                         description: 사업자등록번호
 *                       email:
 *                         type: string
 *                         format: email
 *                         description: 이메일
 *                       phone:
 *                         type: string
 *                         description: 전화번호
 *                   account:
 *                     type: object
 *                     description: 계좌 정보
 *                     required:
 *                       - bankCode
 *                       - accountNumber
 *                       - holderName
 *                     properties:
 *                       bankCode:
 *                         type: string
 *                         description: 은행 코드
 *                       accountNumber:
 *                         type: string
 *                         description: 계좌번호
 *                       holderName:
 *                         type: string
 *                         description: 예금주명
 *                   metadata:
 *                     type: object
 *                     description: |
 *                       메타데이터 (선택)
 *                       - partnerId: 파트너 ID (있으면 API 성공 시 partners 테이블 자동 업데이트)
 *                     additionalProperties: true
 *                     properties:
 *                       partnerId:
 *                         type: string
 *                         format: uuid
 *                         description: 파트너 ID (있으면 API 성공 시 partners 테이블의 toss 관련 정보 자동 업데이트)
 *           examples:
 *             개인:
 *               summary: 개인 셀러 생성
 *               value:
 *                 mode: "create"
 *                 payload:
 *                   businessType: "INDIVIDUAL"
 *                   individual:
 *                     name: "홍길동"
 *                     email: "hong@example.com"
 *                     phone: "01012345678"
 *                   account:
 *                     bankCode: "088"
 *                     accountNumber: "1234567890"
 *                     holderName: "홍길동"
 *                   metadata:
 *                     partnerId: "123e4567-e89b-12d3-a456-426614174000"
 *             개인사업자:
 *               summary: 개인사업자 셀러 생성
 *               value:
 *                 mode: "create"
 *                 payload:
 *                   businessType: "INDIVIDUAL_BUSINESS"
 *                   company:
 *                     name: "홍길동 게임즈"
 *                     representativeName: "홍길동"
 *                     businessRegistrationNumber: "123-45-67890"
 *                     email: "business@example.com"
 *                     phone: "0212345678"
 *                   account:
 *                     bankCode: "088"
 *                     accountNumber: "9876543210"
 *                     holderName: "홍길동"
 *             법인:
 *               summary: 법인 셀러 생성
 *               value:
 *                 mode: "create"
 *                 payload:
 *                   businessType: "CORPORATION"
 *                   company:
 *                     name: "주식회사 메이트"
 *                     representativeName: "김대표"
 *                     businessRegistrationNumber: "123-45-67890"
 *                     email: "corp@example.com"
 *                     phone: "0212345678"
 *                   account:
 *                     bankCode: "004"
 *                     accountNumber: "1111222233334444"
 *                     holderName: "주식회사 메이트"
 *             수정:
 *               summary: 기존 셀러 정보 수정
 *               value:
 *                 mode: "update"
 *                 sellerId: "MATEA1B2C3D4"
 *                 payload:
 *                   businessType: "INDIVIDUAL"
 *                   individual:
 *                     name: "홍길동"
 *                     email: "newemail@example.com"
 *                     phone: "01087654321"
 *                   account:
 *                     bankCode: "090"
 *                     accountNumber: "5555666677778888"
 *                     holderName: "홍길동"
 *     responses:
 *       200:
 *         description: 셀러 생성/수정 성공
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
 *                   description: 복호화된 Toss Payments 응답 데이터
 *                   properties:
 *                     sellerId:
 *                       type: string
 *                       example: "MATEA1B2C3D4"
 *                     status:
 *                       type: string
 *                       example: "APPROVAL_REQUIRED"
 *                       description: Toss Seller 상태 (APPROVAL_REQUIRED, ACTIVE 등)
 *       400:
 *         description: 잘못된 요청 (필수 필드 누락, 유효하지 않은 mode 등)
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
 *                   example: "INVALID_MODE"
 *                 message:
 *                   type: string
 *                   example: "mode는 'create' 또는 'update'여야 합니다."
 *       401:
 *         description: 인증 실패
 *       500:
 *         description: 토스페이먼츠 API 오류 또는 암호화/복호화 오류
 */
// POST /seller - Create or update seller (unified endpoint)
router.post(
  "/seller",
  asyncHandler(async (req, res) => {
    const user = await getAuthUser(req);
    const { mode, sellerId, payload } = req.body;

    // Default to "create" if mode is not provided
    const actualMode = mode || "create";

    // Validate mode
    if (actualMode !== "create" && actualMode !== "update") {
      return errorResponse(
        res,
        "INVALID_MODE",
        "mode는 'create' 또는 'update'여야 합니다.",
        null,
        400
      );
    }

    // Validate sellerId for update mode
    if (
      actualMode === "update" &&
      (!sellerId || typeof sellerId !== "string")
    ) {
      return errorResponse(
        res,
        "INVALID_SELLER_ID",
        "update 모드에서는 sellerId가 필수입니다.",
        null,
        400
      );
    }

    // Validate payload
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return errorResponse(
        res,
        "INVALID_PAYLOAD",
        "payload는 객체여야 합니다.",
        null,
        400
      );
    }

    // Validate businessType and required fields
    const { businessType, individual, company, account } = payload;

    if (!businessType) {
      return errorResponse(
        res,
        "INVALID_PAYLOAD",
        "payload에 businessType이 필수입니다.",
        null,
        400
      );
    }

    if (businessType === "INDIVIDUAL") {
      if (!individual || typeof individual !== "object") {
        return errorResponse(
          res,
          "INVALID_PAYLOAD",
          "businessType이 INDIVIDUAL일 때 individual 객체가 필수입니다.",
          null,
          400
        );
      }
      if (!individual.name || !individual.email || !individual.phone) {
        return errorResponse(
          res,
          "INVALID_PAYLOAD",
          "individual 객체에 name, email, phone이 필수입니다.",
          null,
          400
        );
      }
    } else if (
      businessType === "INDIVIDUAL_BUSINESS" ||
      businessType === "CORPORATION"
    ) {
      if (!company || typeof company !== "object") {
        return errorResponse(
          res,
          "INVALID_PAYLOAD",
          `businessType이 ${businessType}일 때 company 객체가 필수입니다.`,
          null,
          400
        );
      }
      if (
        !company.name ||
        !company.representativeName ||
        !company.businessRegistrationNumber ||
        !company.email ||
        !company.phone
      ) {
        return errorResponse(
          res,
          "INVALID_PAYLOAD",
          "company 객체에 name, representativeName, businessRegistrationNumber, email, phone이 필수입니다.",
          null,
          400
        );
      }
    } else {
      return errorResponse(
        res,
        "INVALID_PAYLOAD",
        "businessType은 INDIVIDUAL, INDIVIDUAL_BUSINESS, 또는 CORPORATION이어야 합니다.",
        null,
        400
      );
    }

    // Validate account
    if (!account || typeof account !== "object") {
      return errorResponse(
        res,
        "INVALID_PAYLOAD",
        "account 객체가 필수입니다.",
        null,
        400
      );
    }
    if (!account.bankCode || !account.accountNumber || !account.holderName) {
      return errorResponse(
        res,
        "INVALID_PAYLOAD",
        "account 객체에 bankCode, accountNumber, holderName이 필수입니다.",
        null,
        400
      );
    }

    // sellerId 자동 생성 (create 모드이고 sellerId가 없을 때)
    let actualSellerId = sellerId;
    if (actualMode === "create" && !actualSellerId) {
      actualSellerId = generateSellerId();
      console.log(`🔧 Auto-generated sellerId: ${actualSellerId}`);
    }

    // refSellerId 자동 생성 (payload에 없을 때)
    if (!payload.refSellerId) {
      payload.refSellerId = generateSellerId();
      console.log(`🔧 Auto-generated refSellerId: ${payload.refSellerId}`);
    }

    // Get environment from header
    const isProductionHeader = req.headers["x-is-production"];
    let isProductionValue: boolean | undefined = undefined;

    if (isProductionHeader !== undefined) {
      if (typeof isProductionHeader === "string") {
        isProductionValue = isProductionHeader.toLowerCase() === "true";
      } else if (typeof isProductionHeader === "boolean") {
        isProductionValue = isProductionHeader;
      } else if (Array.isArray(isProductionHeader)) {
        isProductionValue = isProductionHeader[0]?.toLowerCase() === "true";
      }
    }

    // 셀러 API는 지급대행 API이므로 'api' 모드 사용
    const tossSecretKey = getTossSecretKey("api", isProductionValue);
    if (!tossSecretKey) {
      return errorResponse(
        res,
        "TOSS_CONFIG_MISSING",
        "토스페이먼츠 지급대행 설정이 없습니다.",
        {
          hint: "환경 변수에 TOSS_API_PROD_SECRET_KEY 또는 TOSS_PAY_PROD_SECRET_KEY (live_gsk로 시작)를 설정해주세요.",
        },
        500
      );
    }

    // Encrypt payload
    console.log(`🔐 Encrypting seller payload (mode: ${actualMode})...`);
    console.log(
      "📤 Original payload (before encryption):",
      JSON.stringify(payload, null, 2)
    );

    // Python 암호화 사용 여부 확인 (환경변수 또는 헤더로 제어 가능)
    const usePythonEncryption =
      process.env.TOSS_USE_PYTHON_ENCRYPTION === "true" ||
      req.headers["x-use-python-encryption"] === "true";

    if (usePythonEncryption) {
      console.log("🐍 Using Python encryption (authlib.jose)");
    } else {
      console.log("📦 Using Node.js encryption (jose library)");
    }

    // 보안 키 정보 확인
    const {
      key: securityKey,
      source: securityKeySource,
      isProd: securityKeyIsProd,
    } = getTossSecurityKey(isProductionValue);
    console.log(
      `🔑 Security Key Info: source=${securityKeySource}, isProd=${securityKeyIsProd}, length=${
        securityKey?.length || 0
      }`
    );

    const encryptedPayload = await encryptPayload(
      payload,
      usePythonEncryption,
      isProductionValue
    );
    console.log("🔒 Encrypted payload length:", encryptedPayload.length);
    console.log(
      "🔒 Encrypted payload preview:",
      encryptedPayload.substring(0, 100) + "..."
    );
    console.log("🔒 Encrypted payload (full):", encryptedPayload);

    // 암호화 검증: 암호화된 값을 복호화해서 원본과 비교
    try {
      console.log("🔍 Verifying encryption by decrypting...");
      const decryptedForVerification = await decryptPayload(
        encryptedPayload,
        isProductionValue,
        usePythonEncryption
      );
      console.log(
        "✅ Decrypted payload (for verification):",
        JSON.stringify(decryptedForVerification, null, 2)
      );

      // 원본과 복호화된 값 비교
      const originalStr = JSON.stringify(payload);
      const decryptedStr = JSON.stringify(decryptedForVerification);
      if (originalStr === decryptedStr) {
        console.log(
          "✅ Encryption verification: SUCCESS - Original and decrypted match"
        );
      } else {
        console.warn(
          "⚠️  Encryption verification: MISMATCH - Original and decrypted differ"
        );
        console.warn("Original:", originalStr);
        console.warn("Decrypted:", decryptedStr);
      }
    } catch (verifyError: any) {
      console.error("❌ Encryption verification failed:", verifyError.message);
    }

    // Create Toss Payments API headers
    const tossHeaders = createTossHeaders(tossSecretKey);
    tossHeaders["TossPayments-api-security-mode"] = "ENCRYPTION";
    tossHeaders["Content-Type"] = "text/plain";

    // 디버깅: 요청 헤더 확인 (Authorization은 일부만 표시)
    console.log("📋 Request headers:", {
      "TossPayments-api-security-mode":
        tossHeaders["TossPayments-api-security-mode"],
      "Content-Type": tossHeaders["Content-Type"],
      Authorization: tossHeaders.Authorization?.substring(0, 30) + "...",
    });

    // Determine endpoint and method
    // 토스페이먼츠 셀러 수정 API는 POST 메서드를 사용합니다
    const endpoint =
      actualMode === "create"
        ? "https://api.tosspayments.com/v2/sellers"
        : `https://api.tosspayments.com/v2/sellers/${actualSellerId}`;
    const method = "POST"; // 셀러 등록/수정 모두 POST 사용

    console.log(
      `🔍 Calling Toss Payments ${
        actualMode === "create" ? "Create" : "Update"
      } Seller API (v2)...`,
      {
        endpoint,
        method,
        sellerId: actualMode === "update" ? actualSellerId : undefined,
        refSellerId: payload.refSellerId,
      }
    );

    const tossResponse = await fetch(endpoint, {
      method,
      headers: tossHeaders,
      body: encryptedPayload,
    });

    const responseText = await tossResponse.text();
    console.log(
      `📥 Toss ${mode === "create" ? "Create" : "Update"} Seller API Response:`,
      {
        status: tossResponse.status,
        statusText: tossResponse.statusText,
        bodyLength: responseText.length,
        bodyPreview: responseText.substring(0, 200),
      }
    );

    if (!tossResponse.ok) {
      let errorData: any;
      let errorMessage = "알 수 없는 오류";

      // 에러 응답이 암호화된 JWE 토큰일 수 있으므로 복호화 시도
      const trimmedResponse = responseText.trim();
      console.log("🔍 Analyzing error response:", {
        status: tossResponse.status,
        responseLength: trimmedResponse.length,
        responsePreview: trimmedResponse.substring(0, 200),
        startsWithEyJ: trimmedResponse.startsWith("eyJ"),
        dotCount: trimmedResponse.split(".").length,
      });

      // JWE 형식 체크: eyJ로 시작하고 5개의 점(.)으로 구분된 구조
      const isJWE =
        trimmedResponse.startsWith("eyJ") &&
        trimmedResponse.split(".").length === 5;

      if (isJWE) {
        // JWE 형식인 경우 복호화 시도
        console.log("🔐 Attempting to decrypt error response (JWE format)...");
        try {
          // 에러 응답 복호화 시에도 요청과 동일한 환경의 보안 키 및 암호화 방식 사용
          const decryptedError = await decryptPayload(
            trimmedResponse,
            isProductionValue,
            usePythonEncryption
          );
          console.log("✅ Error response decrypted successfully:", {
            decryptedType: typeof decryptedError,
            decryptedKeys:
              typeof decryptedError === "object" && decryptedError !== null
                ? Object.keys(decryptedError)
                : [],
            decryptedPreview: JSON.stringify(decryptedError).substring(0, 200),
          });
          errorData = decryptedError;

          // 복호화된 에러 데이터 구조 확인
          if (typeof decryptedError === "object" && decryptedError !== null) {
            // entityBody 구조일 수도 있음
            const errorEntityBody =
              decryptedError?.entityBody || decryptedError;
            errorMessage =
              errorEntityBody?.message ||
              errorEntityBody?.error?.message ||
              errorEntityBody?.code ||
              errorEntityBody?.error?.code ||
              decryptedError?.message ||
              decryptedError?.error?.message ||
              decryptedError?.code ||
              decryptedError?.error?.code ||
              (typeof errorEntityBody === "string"
                ? errorEntityBody
                : JSON.stringify(errorEntityBody));

            // 에러 메시지가 여전히 비어있거나 의미없는 경우 전체 객체를 문자열로 변환
            if (
              !errorMessage ||
              errorMessage === "{}" ||
              errorMessage === "null"
            ) {
              errorMessage = JSON.stringify(decryptedError);
            }
          } else {
            errorMessage =
              typeof decryptedError === "string"
                ? decryptedError
                : String(decryptedError);
          }
        } catch (decryptError: any) {
          // 복호화 실패 시 상세한 에러 정보 로깅
          console.error("❌ Failed to decrypt error response:", {
            error: decryptError?.message || String(decryptError),
            errorName: decryptError?.name,
            errorStack: decryptError?.stack,
            encryptedLength: trimmedResponse.length,
            encryptedPreview: trimmedResponse.substring(0, 200),
            isProduction: isProductionValue,
            securityKeyLength: getTossSecretKey(isProductionValue)?.length,
          });

          // 복호화 실패 시에도 원본 암호화된 메시지와 함께 상세 정보 제공
          errorData = {
            encryptedMessage: trimmedResponse,
            decryptError:
              decryptError instanceof Error
                ? decryptError.message
                : String(decryptError),
            hint: "에러 응답 복호화에 실패했습니다. 보안 키(TOSS_API_PROD_SECURITY_KEY 또는 TOSS_API_DEV_SECURITY_KEY)가 올바른지 확인하세요.",
            isProduction: isProductionValue,
          };
          errorMessage = `에러 응답 복호화 실패: ${
            decryptError instanceof Error
              ? decryptError.message
              : String(decryptError)
          }`;
        }
      } else {
        // 일반 JSON 응답인 경우
        console.log("📄 Parsing error response as JSON...");
        try {
          errorData = JSON.parse(responseText);
          errorMessage =
            errorData.message ||
            errorData.error?.message ||
            errorData.code ||
            errorData.error?.code ||
            errorData.error ||
            JSON.stringify(errorData);

          // 에러 메시지가 여전히 비어있는 경우
          if (
            !errorMessage ||
            errorMessage === "{}" ||
            errorMessage === "null"
          ) {
            errorMessage = `HTTP ${tossResponse.status} ${tossResponse.statusText}`;
          }
        } catch (parseError) {
          console.error(
            "❌ Failed to parse error response as JSON:",
            parseError
          );
          errorData = {
            rawMessage: responseText,
            parseError:
              parseError instanceof Error
                ? parseError.message
                : String(parseError),
          };
          errorMessage =
            responseText ||
            `HTTP ${tossResponse.status} ${tossResponse.statusText}`;
        }
      }

      // 최종 에러 메시지가 여전히 비어있는 경우 HTTP 상태 코드 사용
      if (!errorMessage || errorMessage.trim() === "") {
        errorMessage = `HTTP ${tossResponse.status} ${
          tossResponse.statusText || "Unknown Error"
        }`;
      }

      console.log("📋 Final error message:", errorMessage);

      // 에러 메시지 한글화 (일부 일반적인 에러)
      let koreanErrorMessage = errorMessage;
      let isTemporaryError = false;

      if (errorMessage.includes("account holder information does not match")) {
        koreanErrorMessage =
          "계좌 정보가 일치하지 않습니다. 예금주명, 은행 코드, 계좌번호를 정확히 입력해주세요.";
      } else if (
        errorMessage.includes("account holder") ||
        errorMessage.includes("account number")
      ) {
        koreanErrorMessage = `계좌 정보 오류: ${errorMessage}`;
      } else if (
        errorMessage.toLowerCase().includes("temporarily unavailable") ||
        errorMessage.toLowerCase().includes("service unavailable") ||
        errorMessage.toLowerCase().includes("maintenance") ||
        errorMessage.toLowerCase().includes("점검") ||
        errorMessage.toLowerCase().includes("timeout") ||
        errorMessage.toLowerCase().includes("connection") ||
        tossResponse.status === 503 ||
        tossResponse.status === 504
      ) {
        // 은행 점검 시간 또는 일시적인 서비스 오류
        isTemporaryError = true;
        koreanErrorMessage =
          "은행 점검 시간이거나 일시적인 서비스 오류입니다. 잠시 후 다시 시도해주세요.";
      }

      // 에러 응답에 디버깅 정보 추가
      const debugInfo: any = {
        ...errorData,
        debug: {
          encryption: {
            method: usePythonEncryption
              ? "Python (authlib.jose)"
              : "Node.js (jose)",
            encryptedPayloadLength: encryptedPayload.length,
            encryptedPayloadPreview: encryptedPayload.substring(0, 100) + "...",
            encryptedPayloadFull: encryptedPayload,
          },
          securityKey: {
            source: securityKeySource,
            isProd: securityKeyIsProd,
            length: securityKey?.length || 0,
          },
          decryption: {
            attempted: isJWE,
            success: isJWE && errorData && !errorData.decryptError,
            decryptedErrorData:
              isJWE && errorData && !errorData.decryptError
                ? errorData
                : undefined,
          },
          originalPayload: payload,
        },
      };

      // 복호화 검증: 암호화된 값을 복호화해서 원본과 비교
      try {
        const decryptedForVerification = await decryptPayload(
          encryptedPayload,
          isProductionValue,
          usePythonEncryption
        );
        debugInfo.debug.encryption.verification = {
          success: true,
          decryptedPayload: decryptedForVerification,
          matchesOriginal:
            JSON.stringify(payload) ===
            JSON.stringify(decryptedForVerification),
        };
      } catch (verifyError: any) {
        debugInfo.debug.encryption.verification = {
          success: false,
          error: verifyError.message,
        };
      }

      // 일시적인 오류인 경우 재시도 안내 추가
      const errorDetails = {
        ...debugInfo,
        isTemporaryError,
        retrySuggestion: isTemporaryError
          ? "은행 점검 시간이거나 일시적인 서비스 오류일 수 있습니다. 몇 분 후 다시 시도해주세요."
          : undefined,
      };

      // 에러 메시지가 비어있거나 의미없는 경우 원본 응답 정보 포함
      const finalErrorMessage =
        koreanErrorMessage && koreanErrorMessage.trim() !== ""
          ? koreanErrorMessage
          : `HTTP ${tossResponse.status} ${
              tossResponse.statusText || "Unknown Error"
            }`;

      console.error("❌ Toss API Error:", {
        mode: actualMode,
        status: tossResponse.status,
        statusText: tossResponse.statusText,
        errorMessage: finalErrorMessage,
        errorData: errorData,
        responseText: responseText.substring(0, 500),
      });

      return errorResponse(
        res,
        "TOSS_API_ERROR",
        `셀러 ${
          actualMode === "create" ? "등록" : "수정"
        } 실패: ${finalErrorMessage}${
          isTemporaryError
            ? " (일시적인 오류일 수 있으니 잠시 후 재시도해주세요)"
            : ""
        }`,
        errorDetails,
        tossResponse.status
      );
    }

    // Decrypt response
    // 토스페이먼츠 응답은 암호화된 JWE 토큰일 수 있음
    let encryptedResponse: string = responseText;

    console.log("🔍 Analyzing success response:", {
      status: tossResponse.status,
      responseLength: responseText.length,
      responsePreview: responseText.substring(0, 200),
      startsWithEyJ: responseText.trim().startsWith("eyJ"),
      dotCount: responseText.trim().split(".").length,
    });

    try {
      // JSON 형식인 경우 { data: "encrypted_string" } 구조일 수 있음
      const parsed = JSON.parse(responseText);
      if (parsed?.data && typeof parsed.data === "string") {
        encryptedResponse = parsed.data;
        console.log("📦 Found encrypted data in JSON response.data field");
      } else {
        // JSON이지만 data 필드가 없는 경우, 전체가 암호화된 문자열일 수 있음
        encryptedResponse = responseText.trim();
        console.log("📦 Using full response text as encrypted data");
      }
    } catch {
      // JSON 파싱 실패 시, 전체 응답이 암호화된 JWE 토큰일 가능성
      encryptedResponse = responseText.trim();
      console.log("📦 Response is not JSON, treating as encrypted JWE token");
    }

    // JWE 형식 체크: eyJ로 시작하고 5개의 점(.)으로 구분된 구조
    const isJWE =
      encryptedResponse.startsWith("eyJ") &&
      encryptedResponse.split(".").length === 5;

    if (!isJWE) {
      console.warn(
        "⚠️  Response does not appear to be JWE format, attempting decryption anyway..."
      );
    }

    try {
      // 성공 응답 복호화 시에도 요청과 동일한 환경의 보안 키 및 암호화 방식 사용
      console.log("🔐 Attempting to decrypt success response...");
      const decryptedData = await decryptPayload(
        encryptedResponse,
        isProductionValue,
        usePythonEncryption
      );
      console.log(
        `✅ Toss ${
          actualMode === "create" ? "Create" : "Update"
        } Seller API success (decrypted)`
      );

      // 디버깅: 복호화된 데이터 구조 확인
      console.log("📋 Decrypted response structure:", {
        hasEntityBody: !!decryptedData?.entityBody,
        entityBodyKeys: decryptedData?.entityBody
          ? Object.keys(decryptedData.entityBody)
          : [],
        topLevelKeys: Object.keys(decryptedData || {}),
        entityBodyId: decryptedData?.entityBody?.id,
        directId: decryptedData?.id,
        directSellerId: decryptedData?.sellerId,
        actualSellerId: actualSellerId,
        fullDecryptedData: JSON.stringify(decryptedData, null, 2).substring(
          0,
          1000
        ), // 처음 1000자만 출력
      });

      // API 성공 시 partners 테이블 업데이트
      const supabase = createSupabaseClient();

      // Toss API 응답 구조: { version, traceId, entityType, entityBody: { id, refSellerId, status, metadata, ... } }
      const entityBody = decryptedData?.entityBody || decryptedData;

      // partnerId는 응답의 entityBody.metadata에서 우선 가져오고, 없으면 요청 payload에서 가져옴
      const partnerId =
        entityBody?.metadata?.partnerId || payload.metadata?.partnerId;

      console.log("🔍 Partner update check:", {
        hasEntityBody: !!decryptedData?.entityBody,
        hasEntityBodyMetadata: !!entityBody?.metadata,
        entityBodyMetadata: entityBody?.metadata,
        hasPayloadMetadata: !!payload.metadata,
        payloadMetadata: payload.metadata,
        partnerId,
        finalPartnerId: partnerId,
      });

      if (partnerId) {
        try {
          // entityBody에서 직접 값 추출 (응답 데이터 우선)
          const tossSellerId =
            entityBody?.id ||
            decryptedData?.sellerId ||
            decryptedData?.id ||
            actualSellerId;
          const tossRefSellerId =
            entityBody?.refSellerId || payload.refSellerId;
          const tossStatus = entityBody?.status || "active"; // APPROVAL_REQUIRED, ACTIVE 등
          const tossBusinessType = entityBody?.businessType || businessType;

          // 디버깅: 추출된 값 확인
          console.log("🔍 Extracted values from entityBody:", {
            tossSellerId,
            tossRefSellerId,
            tossStatus,
            tossBusinessType,
            actualSellerId,
            entityBodyId: entityBody?.id,
            entityBodyRefSellerId: entityBody?.refSellerId,
            entityBodyStatus: entityBody?.status,
            entityBodyBusinessType: entityBody?.businessType,
            hasCompany: !!entityBody?.company,
            hasIndividual: !!entityBody?.individual,
            hasAccount: !!entityBody?.account,
          });

          // sellerId가 여전히 null이면 경고
          if (!tossSellerId) {
            console.warn(
              "⚠️  Warning: tossSellerId is null or undefined. Using actualSellerId as fallback."
            );
            console.warn(
              "   This might indicate an issue with the Toss API response structure."
            );
          }

          // partner_business_info 테이블에 upsert할 데이터 준비
          const bizInfoData: any = {
            partner_id: partnerId,
            tosspayments_seller_id: tossSellerId || null,
            tosspayments_ref_seller_id: tossRefSellerId || null,
            tosspayments_status: tossStatus || null,
            tosspayments_synced_at: new Date().toISOString(),
            tosspayments_business_type: tossBusinessType || null,
            tosspayments_last_error: null,
          };

          // entityBody에서 legal 정보 추출 (INDIVIDUAL인 경우)
          if (entityBody?.individual) {
            bizInfoData.legal_name = entityBody.individual.name || null;
            bizInfoData.legal_email = entityBody.individual.email || null;
            bizInfoData.legal_phone = entityBody.individual.phone || null;
          }
          // entityBody에서 legal 정보 추출 (INDIVIDUAL_BUSINESS 또는 CORPORATION인 경우)
          else if (entityBody?.company) {
            bizInfoData.legal_name =
              entityBody.company.representativeName ||
              entityBody.company.name ||
              null;
            bizInfoData.legal_email = entityBody.company.email || null;
            bizInfoData.legal_phone = entityBody.company.phone || null;
          }
          // entityBody에 없으면 payload에서 가져오기 (fallback)
          else {
            if (businessType === "INDIVIDUAL" && individual) {
              bizInfoData.legal_name = individual.name || null;
              bizInfoData.legal_email = individual.email || null;
              bizInfoData.legal_phone = individual.phone || null;
            } else if (
              (businessType === "INDIVIDUAL_BUSINESS" ||
                businessType === "CORPORATION") &&
              company
            ) {
              bizInfoData.legal_name =
                company.representativeName || company.name || null;
              bizInfoData.legal_email = company.email || null;
              bizInfoData.legal_phone = company.phone || null;
            }
          }

          // entityBody에서 계좌 정보 추출
          if (entityBody?.account) {
            bizInfoData.payout_bank_code = entityBody.account.bankCode || null;
            bizInfoData.payout_account_number =
              entityBody.account.accountNumber || null;
            bizInfoData.payout_account_holder =
              entityBody.account.holderName || null;
          }
          // entityBody에 없으면 payload에서 가져오기 (fallback)
          else if (account) {
            bizInfoData.payout_bank_code = account.bankCode || null;
            bizInfoData.payout_account_number = account.accountNumber || null;
            bizInfoData.payout_account_holder = account.holderName || null;
          }

          console.log("📝 Upserting partner_business_info with data:", {
            partnerId,
            bizInfoDataKeys: Object.keys(bizInfoData),
            bizInfoData: JSON.stringify(bizInfoData, null, 2),
          });

          // partner_business_info 테이블에 upsert
          const { data: updatedBizInfo, error: updateError } = await supabase
            .from("partner_business_info")
            .upsert(bizInfoData, { onConflict: "partner_id" })
            .select()
            .single();

          if (updateError) {
            console.error("❌ Failed to upsert partner_business_info:", {
              error: updateError,
              code: updateError.code,
              message: updateError.message,
              details: updateError.details,
              hint: updateError.hint,
              partnerId,
              bizInfoData,
            });
            // 업데이트 실패해도 API는 성공으로 처리하되, 에러 정보를 응답에 포함
            console.warn(
              "⚠️  Partner business info update failed but API will return success. Check logs for details."
            );
          } else {
            console.log(`✅ Partner business info updated successfully:`, {
              partnerId,
              updatedBizInfo: updatedBizInfo
                ? {
                    partner_id: updatedBizInfo.partner_id,
                    tosspayments_seller_id:
                      updatedBizInfo.tosspayments_seller_id,
                    tosspayments_ref_seller_id:
                      updatedBizInfo.tosspayments_ref_seller_id,
                    tosspayments_status: updatedBizInfo.tosspayments_status,
                  }
                : null,
            });
          }
        } catch (updateError: any) {
          console.error(
            "❌ Error updating partner_business_info (exception):",
            {
              error: updateError,
              message: updateError?.message,
              stack: updateError?.stack,
              partnerId,
            }
          );
          // 업데이트 실패해도 API는 성공으로 처리
        }
      } else {
        console.warn(
          "⚠️  No partnerId in metadata, skipping partner_business_info update",
          {
            metadata: payload.metadata,
            hasMetadata: !!payload.metadata,
          }
        );
      }

      // 파트너 비즈니스 정보 업데이트 결과 확인
      let partnerUpdateResult: any = null;
      if (partnerId) {
        // 업데이트 시도 결과를 확인하기 위해 다시 조회
        try {
          const { data: partnerCheck, error: checkError } = await supabase
            .from("partner_business_info")
            .select(
              "partner_id, tosspayments_seller_id, tosspayments_ref_seller_id, tosspayments_status"
            )
            .eq("partner_id", partnerId)
            .single();

          if (!checkError && partnerCheck) {
            partnerUpdateResult = {
              success: !!partnerCheck.tosspayments_seller_id,
              partnerId: partnerCheck.partner_id,
              tosspayments_seller_id: partnerCheck.tosspayments_seller_id,
              tosspayments_ref_seller_id:
                partnerCheck.tosspayments_ref_seller_id,
              tosspayments_status: partnerCheck.tosspayments_status,
            };
          } else {
            partnerUpdateResult = {
              success: false,
              error:
                checkError?.message ||
                "Partner business info not found after update",
            };
          }
        } catch (checkError: any) {
          partnerUpdateResult = {
            success: false,
            error:
              checkError?.message ||
              "Failed to verify partner business info update",
          };
        }
      }

      // 성공 응답에 디버깅 정보 추가
      const responseWithDebug = {
        ...decryptedData,
        _debug: {
          encryption: {
            method: usePythonEncryption
              ? "Python (authlib.jose)"
              : "Node.js (jose)",
            encryptedPayloadLength: encryptedPayload.length,
            encryptedPayloadPreview: encryptedPayload.substring(0, 100) + "...",
            encryptedPayloadFull: encryptedPayload,
          },
          securityKey: {
            source: securityKeySource,
            isProd: securityKeyIsProd,
            length: securityKey?.length || 0,
          },
          decryption: {
            method: usePythonEncryption
              ? "Python (authlib.jose)"
              : "Node.js (jose)",
            encryptedResponseLength: encryptedResponse.length,
            encryptedResponsePreview:
              encryptedResponse.substring(0, 100) + "...",
            encryptedResponseFull: encryptedResponse,
            decryptedData: decryptedData,
          },
          originalPayload: payload,
          partnerUpdate: partnerUpdateResult,
        },
      };

      return successResponse(res, responseWithDebug);
    } catch (decryptError: any) {
      console.error(`❌ Failed to decrypt Toss API response:`, decryptError);

      return errorResponse(
        res,
        "TOSS_DECRYPT_ERROR",
        `응답 복호화 실패: ${decryptError.message}`,
        {
          hint: "토스페이먼츠 보안 키를 확인해주세요.",
        },
        500
      );
    }
  })
);

/**
 * @swagger
 * /api/toss/sellers/{sellerId}:
 *   post:
 *     summary: 토스페이먼츠 셀러 정보 수정 (RESTful)
 *     description: |
 *       특정 셀러의 정보를 수정합니다. RESTful 방식으로 URL에 sellerId를 포함합니다.
 *
 *       **중요:** 이 endpoint는 `POST /api/toss/seller` (mode: "update")와 동일한 로직을 사용합니다.
 *
 *       **참고:**
 *       - 상세 가이드: [Partner 및 Toss Seller 가이드](https://github.com/mateyou2025/mateyou-backend/blob/main/docs/PARTNER_TOSS_GUIDE.md)
 *       - 은행 코드: [Toss Payments 은행 코드](https://docs.tosspayments.com/resources/codes/bank-codes)
 *     tags: [Toss Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sellerId
 *         required: true
 *         schema:
 *           type: string
 *         description: 수정할 셀러 ID
 *         example: "seller_a01kax3tgf6hvy06tdtwgjnaee0"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - businessType
 *               - account
 *             properties:
 *               refSellerId:
 *                 type: string
 *               businessType:
 *                 type: string
 *                 enum: [INDIVIDUAL, INDIVIDUAL_BUSINESS, CORPORATION]
 *               individual:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                   email:
 *                     type: string
 *                   phone:
 *                     type: string
 *               company:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                   representativeName:
 *                     type: string
 *                   businessRegistrationNumber:
 *                     type: string
 *                   email:
 *                     type: string
 *                   phone:
 *                     type: string
 *               account:
 *                 type: object
 *                 required:
 *                   - bankCode
 *                   - accountNumber
 *                   - holderName
 *                 properties:
 *                   bankCode:
 *                     type: string
 *                   accountNumber:
 *                     type: string
 *                   holderName:
 *                     type: string
 *               metadata:
 *                 type: object
 *                 properties:
 *                   partnerId:
 *                     type: string
 *           example:
 *             refSellerId: ""
 *             businessType: "INDIVIDUAL"
 *             individual:
 *               name: ""
 *               email: "@gmail.com"
 *               phone: ""
 *             account:
 *               bankCode: "088"
 *               accountNumber: ""
 *               holderName: ""
 *             metadata:
 *               partnerId: ""
 *     responses:
 *       200:
 *         description: 셀러 수정 성공
 *       400:
 *         description: 잘못된 요청
 *       401:
 *         description: 인증 실패
 *       500:
 *         description: 토스페이먼츠 API 오류
 */
// POST /sellers/:sellerId - Update seller (RESTful style, delegates to POST /seller logic)
router.post(
  "/sellers/:sellerId",
  asyncHandler(async (req, res) => {
    const { sellerId } = req.params;

    // Validate sellerId
    if (!sellerId || typeof sellerId !== "string" || sellerId.trim() === "") {
      return errorResponse(
        res,
        "INVALID_PARAMETER",
        "sellerId는 필수이며 비어있을 수 없습니다.",
        null,
        400
      );
    }

    // body를 변환하여 POST /seller 형식으로 변경
    // RESTful: { businessType, individual, account, ... }
    // → POST /seller format: { mode: "update", sellerId, payload: { businessType, individual, account, ... } }
    const originalBody = req.body;
    req.body = {
      mode: "update",
      sellerId: sellerId,
      payload: originalBody,
    };

    // 이제 POST /seller의 로직을 그대로 실행
    // (아래는 POST /seller의 전체 로직 복사)
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();
    const { mode, sellerId: bodySellerId, payload } = req.body;

    // Check authorization: admin or partner owner
    const { data: memberData, error: memberError } = await supabase
      .from("members")
      .select("role")
      .eq("id", user.id)
      .single();

    if (memberError) {
      throw memberError;
    }

    const isAdmin = memberData?.role === "admin";

    // If not admin, verify that the user owns this sellerId
    if (!isAdmin) {
      const { data: partnerData, error: partnerError } = await supabase
        .from("partners")
        .select("id, partner_business_info(tosspayments_seller_id)")
        .eq("member_id", user.id)
        .single();

      if (partnerError || !partnerData) {
        return errorResponse(
          res,
          "FORBIDDEN",
          "파트너 정보를 찾을 수 없습니다.",
          null,
          403
        );
      }

      const bizInfo =
        (partnerData?.partner_business_info as any)?.[0] ||
        partnerData?.partner_business_info;
      // 파트너 본인의 tosspayments_seller_id와 요청한 sellerId가 일치하는지 확인
      if (bizInfo?.tosspayments_seller_id !== sellerId) {
        return errorResponse(
          res,
          "FORBIDDEN",
          "이 셀러를 수정할 권한이 없습니다.",
          null,
          403
        );
      }
    }

    // Default to "create" if mode is not provided
    const actualMode = mode || "create";

    // Validate mode
    if (actualMode !== "create" && actualMode !== "update") {
      return errorResponse(
        res,
        "INVALID_MODE",
        "mode는 'create' 또는 'update'여야 합니다.",
        null,
        400
      );
    }

    // Validate sellerId for update mode
    if (
      actualMode === "update" &&
      (!bodySellerId || typeof bodySellerId !== "string")
    ) {
      return errorResponse(
        res,
        "INVALID_SELLER_ID",
        "update 모드에서는 sellerId가 필수입니다.",
        null,
        400
      );
    }

    // Validate payload
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return errorResponse(
        res,
        "INVALID_PAYLOAD",
        "payload는 객체여야 합니다.",
        null,
        400
      );
    }

    // Validate businessType and required fields
    const { businessType, individual, company, account } = payload;

    if (!businessType) {
      return errorResponse(
        res,
        "INVALID_PAYLOAD",
        "payload에 businessType이 필수입니다.",
        null,
        400
      );
    }

    if (businessType === "INDIVIDUAL") {
      if (!individual || typeof individual !== "object") {
        return errorResponse(
          res,
          "INVALID_PAYLOAD",
          "businessType이 INDIVIDUAL일 때 individual 객체가 필수입니다.",
          null,
          400
        );
      }
      if (!individual.name || !individual.email || !individual.phone) {
        return errorResponse(
          res,
          "INVALID_PAYLOAD",
          "individual 객체에 name, email, phone이 필수입니다.",
          null,
          400
        );
      }
    } else if (
      businessType === "INDIVIDUAL_BUSINESS" ||
      businessType === "CORPORATION"
    ) {
      if (!company || typeof company !== "object") {
        return errorResponse(
          res,
          "INVALID_PAYLOAD",
          `businessType이 ${businessType}일 때 company 객체가 필수입니다.`,
          null,
          400
        );
      }
      if (
        !company.name ||
        !company.representativeName ||
        !company.businessRegistrationNumber ||
        !company.email ||
        !company.phone
      ) {
        return errorResponse(
          res,
          "INVALID_PAYLOAD",
          "company 객체에 name, representativeName, businessRegistrationNumber, email, phone이 필수입니다.",
          null,
          400
        );
      }
    } else {
      return errorResponse(
        res,
        "INVALID_PAYLOAD",
        "businessType은 INDIVIDUAL, INDIVIDUAL_BUSINESS, 또는 CORPORATION이어야 합니다.",
        null,
        400
      );
    }

    // Validate account
    if (!account || typeof account !== "object") {
      return errorResponse(
        res,
        "INVALID_PAYLOAD",
        "account 객체가 필수입니다.",
        null,
        400
      );
    }
    if (!account.bankCode || !account.accountNumber || !account.holderName) {
      return errorResponse(
        res,
        "INVALID_PAYLOAD",
        "account 객체에 bankCode, accountNumber, holderName이 필수입니다.",
        null,
        400
      );
    }

    // sellerId 자동 생성 (create 모드이고 sellerId가 없을 때)
    let actualSellerId = bodySellerId;
    if (actualMode === "create" && !actualSellerId) {
      actualSellerId = generateSellerId();
      console.log(`🔧 Auto-generated sellerId: ${actualSellerId}`);
    }

    // refSellerId 자동 생성 (payload에 없을 때)
    if (!payload.refSellerId) {
      payload.refSellerId = generateSellerId();
      console.log(`🔧 Auto-generated refSellerId: ${payload.refSellerId}`);
    }

    // Get environment from header
    const isProductionHeader = req.headers["x-is-production"];
    let isProductionValue: boolean | undefined = undefined;

    if (isProductionHeader !== undefined) {
      if (typeof isProductionHeader === "string") {
        isProductionValue = isProductionHeader.toLowerCase() === "true";
      } else if (typeof isProductionHeader === "boolean") {
        isProductionValue = isProductionHeader;
      } else if (Array.isArray(isProductionHeader)) {
        isProductionValue = isProductionHeader[0]?.toLowerCase() === "true";
      }
    }

    // 셀러 API는 지급대행 API이므로 'api' 모드 사용
    const tossSecretKey = getTossSecretKey("api", isProductionValue);
    if (!tossSecretKey) {
      return errorResponse(
        res,
        "TOSS_CONFIG_MISSING",
        "토스페이먼츠 지급대행 설정이 없습니다.",
        {
          hint: "환경 변수에 TOSS_API_PROD_SECRET_KEY 또는 TOSS_PAY_PROD_SECRET_KEY (live_gsk로 시작)를 설정해주세요.",
        },
        500
      );
    }

    // Encrypt payload
    console.log(`🔐 Encrypting seller payload (mode: ${actualMode})...`);
    console.log(
      "📤 Original payload (before encryption):",
      JSON.stringify(payload, null, 2)
    );

    // Python 암호화 사용 여부 확인 (환경변수 또는 헤더로 제어 가능)
    const usePythonEncryption =
      process.env.TOSS_USE_PYTHON_ENCRYPTION === "true" ||
      req.headers["x-use-python-encryption"] === "true";

    if (usePythonEncryption) {
      console.log("🐍 Using Python encryption (authlib.jose)");
    } else {
      console.log("📦 Using Node.js encryption (jose library)");
    }

    // 보안 키 정보 확인
    const {
      key: securityKey,
      source: securityKeySource,
      isProd: securityKeyIsProd,
    } = getTossSecurityKey(isProductionValue);
    console.log(
      `🔑 Security Key Info: source=${securityKeySource}, isProd=${securityKeyIsProd}, length=${
        securityKey?.length || 0
      }`
    );

    const encryptedPayload = await encryptPayload(
      payload,
      usePythonEncryption,
      isProductionValue
    );
    console.log("🔒 Encrypted payload length:", encryptedPayload.length);
    console.log(
      "🔒 Encrypted payload preview:",
      encryptedPayload.substring(0, 100) + "..."
    );
    console.log("🔒 Encrypted payload (full):", encryptedPayload);

    // 암호화 검증: 암호화된 값을 복호화해서 원본과 비교
    try {
      console.log("🔍 Verifying encryption by decrypting...");
      const decryptedForVerification = await decryptPayload(
        encryptedPayload,
        isProductionValue,
        usePythonEncryption
      );
      console.log(
        "✅ Decrypted payload (for verification):",
        JSON.stringify(decryptedForVerification, null, 2)
      );

      // 원본과 복호화된 값 비교
      const originalStr = JSON.stringify(payload);
      const decryptedStr = JSON.stringify(decryptedForVerification);
      if (originalStr === decryptedStr) {
        console.log(
          "✅ Encryption verification: SUCCESS - Original and decrypted match"
        );
      } else {
        console.warn(
          "⚠️  Encryption verification: MISMATCH - Original and decrypted differ"
        );
        console.warn("Original:", originalStr);
        console.warn("Decrypted:", decryptedStr);
      }
    } catch (verifyError: any) {
      console.error("❌ Encryption verification failed:", verifyError.message);
    }

    // Create Toss Payments API headers
    const tossHeaders = createTossHeaders(tossSecretKey);
    tossHeaders["TossPayments-api-security-mode"] = "ENCRYPTION";
    tossHeaders["Content-Type"] = "text/plain";

    // 디버깅: 요청 헤더 확인 (Authorization은 일부만 표시)
    console.log("📋 Request headers:", {
      "TossPayments-api-security-mode":
        tossHeaders["TossPayments-api-security-mode"],
      "Content-Type": tossHeaders["Content-Type"],
      Authorization: tossHeaders.Authorization?.substring(0, 30) + "...",
    });

    // Determine endpoint and method
    // 토스페이먼츠 셀러 수정 API는 POST 메서드를 사용합니다
    const endpoint =
      actualMode === "create"
        ? "https://api.tosspayments.com/v2/sellers"
        : `https://api.tosspayments.com/v2/sellers/${actualSellerId}`;
    const method = "POST"; // 셀러 등록/수정 모두 POST 사용

    console.log(
      `🔍 Calling Toss Payments ${
        actualMode === "create" ? "Create" : "Update"
      } Seller API (v2)...`,
      {
        endpoint,
        method,
        sellerId: actualMode === "update" ? actualSellerId : undefined,
        refSellerId: payload.refSellerId,
      }
    );

    const tossResponse = await fetch(endpoint, {
      method,
      headers: tossHeaders,
      body: encryptedPayload,
    });

    const responseText = await tossResponse.text();
    console.log(
      `📥 Toss ${mode === "create" ? "Create" : "Update"} Seller API Response:`,
      {
        status: tossResponse.status,
        statusText: tossResponse.statusText,
        bodyLength: responseText.length,
        bodyPreview: responseText.substring(0, 200),
      }
    );

    if (!tossResponse.ok) {
      let errorData: any;
      let errorMessage = "알 수 없는 오류";

      // 에러 응답이 암호화된 JWE 토큰일 수 있으므로 복호화 시도
      const trimmedResponse = responseText.trim();
      console.log("🔍 Analyzing error response:", {
        status: tossResponse.status,
        responseLength: trimmedResponse.length,
        responsePreview: trimmedResponse.substring(0, 200),
        startsWithEyJ: trimmedResponse.startsWith("eyJ"),
        dotCount: trimmedResponse.split(".").length,
      });

      // JWE 형식 체크: eyJ로 시작하고 5개의 점(.)으로 구분된 구조
      const isJWE =
        trimmedResponse.startsWith("eyJ") &&
        trimmedResponse.split(".").length === 5;

      if (isJWE) {
        // JWE 형식인 경우 복호화 시도
        console.log("🔐 Attempting to decrypt error response (JWE format)...");
        try {
          // 에러 응답 복호화 시에도 요청과 동일한 환경의 보안 키 및 암호화 방식 사용
          const decryptedError = await decryptPayload(
            trimmedResponse,
            isProductionValue,
            usePythonEncryption
          );
          console.log("✅ Error response decrypted successfully:", {
            decryptedType: typeof decryptedError,
            decryptedKeys:
              typeof decryptedError === "object" && decryptedError !== null
                ? Object.keys(decryptedError)
                : [],
            decryptedPreview: JSON.stringify(decryptedError).substring(0, 200),
          });
          errorData = decryptedError;

          // 복호화된 에러 데이터 구조 확인
          if (typeof decryptedError === "object" && decryptedError !== null) {
            // entityBody 구조일 수도 있음
            const errorEntityBody =
              decryptedError?.entityBody || decryptedError;
            errorMessage =
              errorEntityBody?.message ||
              errorEntityBody?.error?.message ||
              errorEntityBody?.code ||
              errorEntityBody?.error?.code ||
              decryptedError?.message ||
              decryptedError?.error?.message ||
              decryptedError?.code ||
              decryptedError?.error?.code ||
              (typeof errorEntityBody === "string"
                ? errorEntityBody
                : JSON.stringify(errorEntityBody));

            // 에러 메시지가 여전히 비어있거나 의미없는 경우 전체 객체를 문자열로 변환
            if (
              !errorMessage ||
              errorMessage === "{}" ||
              errorMessage === "null"
            ) {
              errorMessage = JSON.stringify(decryptedError);
            }
          } else {
            errorMessage =
              typeof decryptedError === "string"
                ? decryptedError
                : String(decryptedError);
          }
        } catch (decryptError: any) {
          // 복호화 실패 시 상세한 에러 정보 로깅
          console.error("❌ Failed to decrypt error response:", {
            error: decryptError?.message || String(decryptError),
            errorName: decryptError?.name,
            errorStack: decryptError?.stack,
            encryptedLength: trimmedResponse.length,
            encryptedPreview: trimmedResponse.substring(0, 200),
            isProduction: isProductionValue,
            securityKeyLength: getTossSecretKey(isProductionValue)?.length,
          });

          // 복호화 실패 시에도 원본 암호화된 메시지와 함께 상세 정보 제공
          errorData = {
            encryptedMessage: trimmedResponse,
            decryptError:
              decryptError instanceof Error
                ? decryptError.message
                : String(decryptError),
            hint: "에러 응답 복호화에 실패했습니다. 보안 키(TOSS_API_PROD_SECURITY_KEY 또는 TOSS_API_DEV_SECURITY_KEY)가 올바른지 확인하세요.",
            isProduction: isProductionValue,
          };
          errorMessage = `에러 응답 복호화 실패: ${
            decryptError instanceof Error
              ? decryptError.message
              : String(decryptError)
          }`;
        }
      } else {
        // 일반 JSON 응답인 경우
        console.log("📄 Parsing error response as JSON...");
        try {
          errorData = JSON.parse(responseText);
          errorMessage =
            errorData.message ||
            errorData.error?.message ||
            errorData.code ||
            errorData.error?.code ||
            errorData.error ||
            JSON.stringify(errorData);

          // 에러 메시지가 여전히 비어있는 경우
          if (
            !errorMessage ||
            errorMessage === "{}" ||
            errorMessage === "null"
          ) {
            errorMessage = `HTTP ${tossResponse.status} ${tossResponse.statusText}`;
          }
        } catch (parseError) {
          console.error(
            "❌ Failed to parse error response as JSON:",
            parseError
          );
          errorData = {
            rawMessage: responseText,
            parseError:
              parseError instanceof Error
                ? parseError.message
                : String(parseError),
          };
          errorMessage =
            responseText ||
            `HTTP ${tossResponse.status} ${tossResponse.statusText}`;
        }
      }

      // 최종 에러 메시지가 여전히 비어있는 경우 HTTP 상태 코드 사용
      if (!errorMessage || errorMessage.trim() === "") {
        errorMessage = `HTTP ${tossResponse.status} ${
          tossResponse.statusText || "Unknown Error"
        }`;
      }

      console.log("📋 Final error message:", errorMessage);

      // 에러 메시지 한글화 (일부 일반적인 에러)
      let koreanErrorMessage = errorMessage;
      let isTemporaryError = false;

      if (errorMessage.includes("account holder information does not match")) {
        koreanErrorMessage =
          "계좌 정보가 일치하지 않습니다. 예금주명, 은행 코드, 계좌번호를 정확히 입력해주세요.";
      } else if (
        errorMessage.includes("account holder") ||
        errorMessage.includes("account number")
      ) {
        koreanErrorMessage = `계좌 정보 오류: ${errorMessage}`;
      } else if (
        errorMessage.toLowerCase().includes("temporarily unavailable") ||
        errorMessage.toLowerCase().includes("service unavailable") ||
        errorMessage.toLowerCase().includes("maintenance") ||
        errorMessage.toLowerCase().includes("점검") ||
        errorMessage.toLowerCase().includes("timeout") ||
        errorMessage.toLowerCase().includes("connection") ||
        tossResponse.status === 503 ||
        tossResponse.status === 504
      ) {
        // 은행 점검 시간 또는 일시적인 서비스 오류
        isTemporaryError = true;
        koreanErrorMessage =
          "은행 점검 시간이거나 일시적인 서비스 오류입니다. 잠시 후 다시 시도해주세요.";
      }

      // 에러 응답에 디버깅 정보 추가
      const debugInfo: any = {
        ...errorData,
        debug: {
          encryption: {
            method: usePythonEncryption
              ? "Python (authlib.jose)"
              : "Node.js (jose)",
            encryptedPayloadLength: encryptedPayload.length,
            encryptedPayloadPreview: encryptedPayload.substring(0, 100) + "...",
            encryptedPayloadFull: encryptedPayload,
          },
          securityKey: {
            source: securityKeySource,
            isProd: securityKeyIsProd,
            length: securityKey?.length || 0,
          },
          decryption: {
            attempted: isJWE,
            success: isJWE && errorData && !errorData.decryptError,
            decryptedErrorData:
              isJWE && errorData && !errorData.decryptError
                ? errorData
                : undefined,
          },
          originalPayload: payload,
        },
      };

      // 복호화 검증: 암호화된 값을 복호화해서 원본과 비교
      try {
        const decryptedForVerification = await decryptPayload(
          encryptedPayload,
          isProductionValue,
          usePythonEncryption
        );
        debugInfo.debug.encryption.verification = {
          success: true,
          decryptedPayload: decryptedForVerification,
          matchesOriginal:
            JSON.stringify(payload) ===
            JSON.stringify(decryptedForVerification),
        };
      } catch (verifyError: any) {
        debugInfo.debug.encryption.verification = {
          success: false,
          error: verifyError.message,
        };
      }

      // 일시적인 오류인 경우 재시도 안내 추가
      const errorDetails = {
        ...debugInfo,
        isTemporaryError,
        retrySuggestion: isTemporaryError
          ? "은행 점검 시간이거나 일시적인 서비스 오류일 수 있습니다. 몇 분 후 다시 시도해주세요."
          : undefined,
      };

      // 에러 메시지가 비어있거나 의미없는 경우 원본 응답 정보 포함
      const finalErrorMessage =
        koreanErrorMessage && koreanErrorMessage.trim() !== ""
          ? koreanErrorMessage
          : `HTTP ${tossResponse.status} ${
              tossResponse.statusText || "Unknown Error"
            }`;

      console.error("❌ Toss API Error:", {
        mode: actualMode,
        status: tossResponse.status,
        statusText: tossResponse.statusText,
        errorMessage: finalErrorMessage,
        errorData: errorData,
        responseText: responseText.substring(0, 500),
      });

      return errorResponse(
        res,
        "TOSS_API_ERROR",
        `셀러 ${
          actualMode === "create" ? "등록" : "수정"
        } 실패: ${finalErrorMessage}${
          isTemporaryError
            ? " (일시적인 오류일 수 있으니 잠시 후 재시도해주세요)"
            : ""
        }`,
        errorDetails,
        tossResponse.status
      );
    }

    // Decrypt response
    // 토스페이먼츠 응답은 암호화된 JWE 토큰일 수 있음
    let encryptedResponse: string = responseText;

    console.log("🔍 Analyzing success response:", {
      status: tossResponse.status,
      responseLength: responseText.length,
      responsePreview: responseText.substring(0, 200),
      startsWithEyJ: responseText.trim().startsWith("eyJ"),
      dotCount: responseText.trim().split(".").length,
    });

    try {
      // JSON 형식인 경우 { data: "encrypted_string" } 구조일 수 있음
      const parsed = JSON.parse(responseText);
      if (parsed?.data && typeof parsed.data === "string") {
        encryptedResponse = parsed.data;
        console.log("📦 Found encrypted data in JSON response.data field");
      } else {
        // JSON이지만 data 필드가 없는 경우, 전체가 암호화된 문자열일 수 있음
        encryptedResponse = responseText.trim();
        console.log("📦 Using full response text as encrypted data");
      }
    } catch {
      // JSON 파싱 실패 시, 전체 응답이 암호화된 JWE 토큰일 가능성
      encryptedResponse = responseText.trim();
      console.log("📦 Response is not JSON, treating as encrypted JWE token");
    }

    // JWE 형식 체크: eyJ로 시작하고 5개의 점(.)으로 구분된 구조
    const isJWE =
      encryptedResponse.startsWith("eyJ") &&
      encryptedResponse.split(".").length === 5;

    if (!isJWE) {
      console.warn(
        "⚠️  Response does not appear to be JWE format, attempting decryption anyway..."
      );
    }

    try {
      // 성공 응답 복호화 시에도 요청과 동일한 환경의 보안 키 및 암호화 방식 사용
      console.log("🔐 Attempting to decrypt success response...");
      const decryptedData = await decryptPayload(
        encryptedResponse,
        isProductionValue,
        usePythonEncryption
      );
      console.log(
        `✅ Toss ${
          actualMode === "create" ? "Create" : "Update"
        } Seller API success (decrypted)`
      );

      // 디버깅: 복호화된 데이터 구조 확인
      console.log("📋 Decrypted response structure:", {
        hasEntityBody: !!decryptedData?.entityBody,
        entityBodyKeys: decryptedData?.entityBody
          ? Object.keys(decryptedData.entityBody)
          : [],
        topLevelKeys: Object.keys(decryptedData || {}),
        entityBodyId: decryptedData?.entityBody?.id,
        directId: decryptedData?.id,
        directSellerId: decryptedData?.sellerId,
        actualSellerId: actualSellerId,
        fullDecryptedData: JSON.stringify(decryptedData, null, 2).substring(
          0,
          1000
        ), // 처음 1000자만 출력
      });

      // API 성공 시 partner_business_info 테이블 업데이트
      const supabase = createSupabaseClient();

      // Toss API 응답 구조: { version, traceId, entityType, entityBody: { id, refSellerId, status, metadata, ... } }
      const entityBody = decryptedData?.entityBody || decryptedData;

      // partnerId는 응답의 entityBody.metadata에서 우선 가져오고, 없으면 요청 payload에서 가져옴
      const partnerId =
        entityBody?.metadata?.partnerId || payload.metadata?.partnerId;

      console.log("🔍 Partner update check:", {
        hasEntityBody: !!decryptedData?.entityBody,
        hasEntityBodyMetadata: !!entityBody?.metadata,
        entityBodyMetadata: entityBody?.metadata,
        hasPayloadMetadata: !!payload.metadata,
        payloadMetadata: payload.metadata,
        partnerId,
        finalPartnerId: partnerId,
      });

      if (partnerId) {
        try {
          // entityBody에서 직접 값 추출 (응답 데이터 우선)
          const tossSellerId =
            entityBody?.id ||
            decryptedData?.sellerId ||
            decryptedData?.id ||
            actualSellerId;
          const tossRefSellerId =
            entityBody?.refSellerId || payload.refSellerId;
          const tossStatus = entityBody?.status || "active"; // APPROVAL_REQUIRED, ACTIVE 등
          const tossBusinessType = entityBody?.businessType || businessType;

          // 디버깅: 추출된 값 확인
          console.log("🔍 Extracted values from entityBody:", {
            tossSellerId,
            tossRefSellerId,
            tossStatus,
            tossBusinessType,
            actualSellerId,
            entityBodyId: entityBody?.id,
            entityBodyRefSellerId: entityBody?.refSellerId,
            entityBodyStatus: entityBody?.status,
            entityBodyBusinessType: entityBody?.businessType,
            hasCompany: !!entityBody?.company,
            hasIndividual: !!entityBody?.individual,
            hasAccount: !!entityBody?.account,
          });

          // sellerId가 여전히 null이면 경고
          if (!tossSellerId) {
            console.warn(
              "⚠️  Warning: tossSellerId is null or undefined. Using actualSellerId as fallback."
            );
            console.warn(
              "   This might indicate an issue with the Toss API response structure."
            );
          }

          // partner_business_info 테이블에 upsert할 데이터 준비
          const bizInfoData: any = {
            partner_id: partnerId,
            tosspayments_seller_id: tossSellerId || null,
            tosspayments_ref_seller_id: tossRefSellerId || null,
            tosspayments_status: tossStatus || null,
            tosspayments_synced_at: new Date().toISOString(),
            tosspayments_business_type: tossBusinessType || null,
            tosspayments_last_error: null,
          };

          // entityBody에서 legal 정보 추출 (INDIVIDUAL인 경우)
          if (entityBody?.individual) {
            bizInfoData.legal_name = entityBody.individual.name || null;
            bizInfoData.legal_email = entityBody.individual.email || null;
            bizInfoData.legal_phone = entityBody.individual.phone || null;
          }
          // entityBody에서 legal 정보 추출 (INDIVIDUAL_BUSINESS 또는 CORPORATION인 경우)
          else if (entityBody?.company) {
            bizInfoData.legal_name =
              entityBody.company.representativeName ||
              entityBody.company.name ||
              null;
            bizInfoData.legal_email = entityBody.company.email || null;
            bizInfoData.legal_phone = entityBody.company.phone || null;
          }
          // entityBody에 없으면 payload에서 가져오기 (fallback)
          else {
            if (businessType === "INDIVIDUAL" && individual) {
              bizInfoData.legal_name = individual.name || null;
              bizInfoData.legal_email = individual.email || null;
              bizInfoData.legal_phone = individual.phone || null;
            } else if (
              (businessType === "INDIVIDUAL_BUSINESS" ||
                businessType === "CORPORATION") &&
              company
            ) {
              bizInfoData.legal_name =
                company.representativeName || company.name || null;
              bizInfoData.legal_email = company.email || null;
              bizInfoData.legal_phone = company.phone || null;
            }
          }

          // entityBody에서 계좌 정보 추출
          if (entityBody?.account) {
            bizInfoData.payout_bank_code = entityBody.account.bankCode || null;
            bizInfoData.payout_account_number =
              entityBody.account.accountNumber || null;
            bizInfoData.payout_account_holder =
              entityBody.account.holderName || null;
          }
          // entityBody에 없으면 payload에서 가져오기 (fallback)
          else if (account) {
            bizInfoData.payout_bank_code = account.bankCode || null;
            bizInfoData.payout_account_number = account.accountNumber || null;
            bizInfoData.payout_account_holder = account.holderName || null;
          }

          console.log("📝 Upserting partner_business_info with data:", {
            partnerId,
            bizInfoDataKeys: Object.keys(bizInfoData),
            bizInfoData: JSON.stringify(bizInfoData, null, 2),
          });

          // partner_business_info 테이블에 upsert
          const { data: updatedBizInfo, error: updateError } = await supabase
            .from("partner_business_info")
            .upsert(bizInfoData, { onConflict: "partner_id" })
            .select()
            .single();

          if (updateError) {
            console.error("❌ Failed to upsert partner_business_info:", {
              error: updateError,
              code: updateError.code,
              message: updateError.message,
              details: updateError.details,
              hint: updateError.hint,
              partnerId,
              bizInfoData,
            });
            // 업데이트 실패해도 API는 성공으로 처리하되, 에러 정보를 응답에 포함
            console.warn(
              "⚠️  Partner business info update failed but API will return success. Check logs for details."
            );
          } else {
            console.log(`✅ Partner business info updated successfully:`, {
              partnerId,
              updatedBizInfo: updatedBizInfo
                ? {
                    partner_id: updatedBizInfo.partner_id,
                    tosspayments_seller_id:
                      updatedBizInfo.tosspayments_seller_id,
                    tosspayments_ref_seller_id:
                      updatedBizInfo.tosspayments_ref_seller_id,
                    tosspayments_status: updatedBizInfo.tosspayments_status,
                  }
                : null,
            });
          }
        } catch (updateError: any) {
          console.error(
            "❌ Error updating partner_business_info (exception):",
            {
              error: updateError,
              message: updateError?.message,
              stack: updateError?.stack,
              partnerId,
            }
          );
          // 업데이트 실패해도 API는 성공으로 처리
        }
      } else {
        console.warn(
          "⚠️  No partnerId in metadata, skipping partner_business_info update",
          {
            metadata: payload.metadata,
            hasMetadata: !!payload.metadata,
          }
        );
      }

      // 파트너 비즈니스 정보 업데이트 결과 확인
      let partnerUpdateResult: any = null;
      if (partnerId) {
        // 업데이트 시도 결과를 확인하기 위해 다시 조회
        try {
          const { data: partnerCheck, error: checkError } = await supabase
            .from("partner_business_info")
            .select(
              "partner_id, tosspayments_seller_id, tosspayments_ref_seller_id, tosspayments_status"
            )
            .eq("partner_id", partnerId)
            .single();

          if (!checkError && partnerCheck) {
            partnerUpdateResult = {
              success: !!partnerCheck.tosspayments_seller_id,
              partnerId: partnerCheck.partner_id,
              tosspayments_seller_id: partnerCheck.tosspayments_seller_id,
              tosspayments_ref_seller_id:
                partnerCheck.tosspayments_ref_seller_id,
              tosspayments_status: partnerCheck.tosspayments_status,
            };
          } else {
            partnerUpdateResult = {
              success: false,
              error: checkError?.message || "Partner not found after update",
            };
          }
        } catch (checkError: any) {
          partnerUpdateResult = {
            success: false,
            error: checkError?.message || "Failed to verify partner update",
          };
        }
      }

      // 성공 응답에 디버깅 정보 추가
      const responseWithDebug = {
        ...decryptedData,
        _debug: {
          encryption: {
            method: usePythonEncryption
              ? "Python (authlib.jose)"
              : "Node.js (jose)",
            encryptedPayloadLength: encryptedPayload.length,
            encryptedPayloadPreview: encryptedPayload.substring(0, 100) + "...",
            encryptedPayloadFull: encryptedPayload,
          },
          securityKey: {
            source: securityKeySource,
            isProd: securityKeyIsProd,
            length: securityKey?.length || 0,
          },
          decryption: {
            method: usePythonEncryption
              ? "Python (authlib.jose)"
              : "Node.js (jose)",
            encryptedResponseLength: encryptedResponse.length,
            encryptedResponsePreview:
              encryptedResponse.substring(0, 100) + "...",
            encryptedResponseFull: encryptedResponse,
            decryptedData: decryptedData,
          },
          originalPayload: payload,
          partnerUpdate: partnerUpdateResult,
        },
      };

      return successResponse(res, responseWithDebug);
    } catch (decryptError: any) {
      console.error(`❌ Failed to decrypt Toss API response:`, decryptError);

      return errorResponse(
        res,
        "TOSS_DECRYPT_ERROR",
        `응답 복호화 실패: ${decryptError.message}`,
        {
          hint: "토스페이먼츠 보안 키를 확인해주세요.",
        },
        500
      );
    }
  })
);

/**
 * @swagger
 * /api/toss/sellers/update:
 *   post:
 *     summary: 토스페이먼츠 셀러 변경 웹훅 (seller.changed)
 *     description: |
 *       토스페이먼츠에서 셀러 정보가 변경되었을 때 호출되는 웹훅 엔드포인트입니다.
 *       이벤트 타입: seller.changed
 *
 *       **주의사항:**
 *       - 웹훅 데이터는 암호화되어 올 수도 있고 복호화되어 올 수도 있습니다.
 *       - `entityBody.metadata.partnerId`를 기반으로 `partners` 테이블을 업데이트합니다.
 *     tags: [Toss Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               eventType:
 *                 type: string
 *                 example: "seller.changed"
 *               createdAt:
 *                 type: string
 *               version:
 *                 type: string
 *               eventId:
 *                 type: string
 *               entityType:
 *                 type: string
 *               entityBody:
 *                 type: object
 *     responses:
 *       200:
 *         description: 웹훅 처리 성공
 *       400:
 *         description: 잘못된 요청
 *       500:
 *         description: 서버 오류
 */
// POST /sellers/update - Toss Payments seller webhook (seller.changed)
router.post(
  "/sellers/update",
  asyncHandler(async (req, res) => {
    // 토스페이먼츠 웹훅 헤더 확인
    const tossHeaders = {
      "x-client-deployments-id": req.headers["x-client-deployments-id"],
      "x-tosspayments-device-id": req.headers["x-tosspayments-device-id"],
      "x-tosspayments-referrer": req.headers["x-tosspayments-referrer"],
      "x-tosspayments-session-id": req.headers["x-tosspayments-session-id"],
      "x-tosspayments-user-id": req.headers["x-tosspayments-user-id"],
      "x-toss-webhook-signature": req.headers["x-toss-webhook-signature"],
      "x-webhook-token": req.headers["x-webhook-token"] ? "***" : undefined,
    };

    console.log("📥 Received Toss seller webhook:", {
      method: req.method,
      headers: {
        "content-type": req.headers["content-type"],
        ...tossHeaders,
      },
      bodyLength: JSON.stringify(req.body).length,
    });

    // 웹훅 인증 검증
    // 방법 1: 토스페이먼츠 referrer 확인 (토스페이먼츠 도메인에서 온 요청인지 확인)
    const referrer = req.headers["x-tosspayments-referrer"];
    const allowedReferrers = [
      "https://developers.tosspayments.com",
      "https://www.tosspayments.com",
    ];

    let isTossReferrer = false;
    if (referrer) {
      const referrerString = Array.isArray(referrer) ? referrer[0] : referrer;
      isTossReferrer = allowedReferrers.some((allowed) =>
        referrerString.startsWith(allowed)
      );

      if (isTossReferrer) {
        console.log("✅ Webhook referrer verified (from Toss Payments)");
      } else {
        console.warn(
          `⚠️  Webhook referrer not from Toss Payments: ${referrerString}`
        );
      }
    }

    // 방법 2: 환경변수로 설정한 웹훅 토큰 검증 (간단한 방법)
    const webhookToken = process.env.TOSS_WEBHOOK_TOKEN;
    if (webhookToken) {
      const providedToken =
        req.headers["x-webhook-token"] ||
        req.headers["authorization"]?.replace("Bearer ", "");
      if (!providedToken || providedToken !== webhookToken) {
        console.warn(
          "⚠️  Webhook authentication failed: Invalid or missing token"
        );
        return errorResponse(
          res,
          "UNAUTHORIZED",
          "웹훅 인증에 실패했습니다. 유효한 토큰이 필요합니다.",
          {
            hint: "x-webhook-token 헤더 또는 Authorization: Bearer {token} 헤더를 포함해주세요.",
          },
          401
        );
      }
      console.log("✅ Webhook token verified");
    }

    // 방법 3: 토스페이먼츠 웹훅 서명 검증 (x-toss-webhook-signature)
    const webhookSignature = req.headers["x-toss-webhook-signature"];
    const webhookSecret = process.env.TOSS_WEBHOOK_SECRET;

    if (webhookSecret && webhookSignature) {
      try {
        const crypto = require("crypto");
        const bodyString =
          typeof req.body === "string" ? req.body : JSON.stringify(req.body);

        // HMAC SHA-256으로 서명 생성
        const hmac = crypto.createHmac("sha256", webhookSecret);
        hmac.update(bodyString);
        const expectedSignature = hmac.digest("hex");

        // 서명 비교 (타이밍 공격 방지를 위해 crypto.timingSafeEqual 사용)
        const signatureString = Array.isArray(webhookSignature)
          ? webhookSignature[0]
          : webhookSignature;
        const providedSignature = Buffer.from(signatureString, "hex");
        const expectedSignatureBuffer = Buffer.from(expectedSignature, "hex");

        if (providedSignature.length !== expectedSignatureBuffer.length) {
          console.warn(
            "⚠️  Webhook signature verification failed: Length mismatch"
          );
          return errorResponse(
            res,
            "UNAUTHORIZED",
            "웹훅 서명 검증에 실패했습니다.",
            null,
            401
          );
        }

        if (
          !crypto.timingSafeEqual(providedSignature, expectedSignatureBuffer)
        ) {
          console.warn(
            "⚠️  Webhook signature verification failed: Signature mismatch"
          );
          return errorResponse(
            res,
            "UNAUTHORIZED",
            "웹훅 서명 검증에 실패했습니다.",
            null,
            401
          );
        }

        console.log("✅ Webhook signature verified");
      } catch (signatureError: any) {
        console.error(
          "❌ Webhook signature verification error:",
          signatureError
        );
        return errorResponse(
          res,
          "WEBHOOK_VERIFICATION_ERROR",
          `웹훅 서명 검증 중 오류가 발생했습니다: ${signatureError.message}`,
          null,
          500
        );
      }
    } else if (webhookSecret && !webhookSignature) {
      // 서명이 필요한데 제공되지 않은 경우
      console.warn("⚠️  Webhook signature required but not provided");
      return errorResponse(
        res,
        "UNAUTHORIZED",
        "웹훅 서명이 필요합니다.",
        {
          hint: "x-toss-webhook-signature 헤더를 포함해주세요.",
        },
        401
      );
    }

    // 방법 4: 토스페이먼츠 헤더 기반 검증 (referrer가 토스페이먼츠 도메인인 경우)
    // 환경변수로 strict 모드가 활성화된 경우에만 referrer 검증 실패 시 거부
    const strictReferrerCheck =
      process.env.TOSS_WEBHOOK_STRICT_REFERRER === "true";
    if (strictReferrerCheck && !isTossReferrer) {
      console.warn("⚠️  Webhook referrer verification failed (strict mode)");
      return errorResponse(
        res,
        "UNAUTHORIZED",
        "웹훅 referrer 검증에 실패했습니다.",
        {
          hint: "토스페이먼츠 도메인에서 온 요청만 허용됩니다.",
          receivedReferrer: referrer,
        },
        401
      );
    }

    // 인증이 모두 통과했거나 인증이 설정되지 않은 경우에만 처리 계속
    // 토스페이먼츠 웹훅은 10초 이내 200 응답이 필요하므로 빠르게 처리
    const webhookStartTime = Date.now();

    let webhookData: any = req.body;
    let isEncrypted = false;

    // 웹훅 데이터가 암호화되어 있는지 확인 (JWE 형식)
    const bodyString =
      typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    const trimmedBody = bodyString.trim();
    const isJWE =
      trimmedBody.includes(".") && trimmedBody.split(".").length === 5;

    if (isJWE) {
      // 암호화된 데이터인 경우 복호화 시도
      console.log(
        "🔐 Webhook data appears to be encrypted (JWE format), attempting decryption..."
      );
      isEncrypted = true;

      try {
        // 프로덕션/개발 환경 자동 감지 (헤더 또는 환경변수)
        const isProductionValue =
          req.headers["x-is-production"] === "true" ||
          req.headers["x-is-production"] === "1" ||
          process.env.NODE_ENV === "production";

        // Python 복호화 사용 여부 확인
        const usePythonEncryption =
          process.env.TOSS_USE_PYTHON_ENCRYPTION === "true" ||
          req.headers["x-use-python-encryption"] === "true";

        const decryptedData = await decryptPayload(
          trimmedBody,
          isProductionValue,
          usePythonEncryption
        );
        webhookData = decryptedData;
        console.log("✅ Webhook data decrypted successfully");
      } catch (decryptError: any) {
        console.error("❌ Failed to decrypt webhook data:", {
          error: decryptError?.message || String(decryptError),
          encryptedPreview: trimmedBody.substring(0, 200),
        });

        return errorResponse(
          res,
          "WEBHOOK_DECRYPT_ERROR",
          `웹훅 데이터 복호화 실패: ${
            decryptError?.message || String(decryptError)
          }`,
          {
            hint: "토스페이먼츠 보안 키(TOSS_API_PROD_SECURITY_KEY 또는 TOSS_API_DEV_SECURITY_KEY)를 확인해주세요.",
          },
          500
        );
      }
    }

    // 웹훅 데이터 검증
    if (!webhookData || typeof webhookData !== "object") {
      return errorResponse(
        res,
        "INVALID_WEBHOOK_DATA",
        "웹훅 데이터가 올바르지 않습니다.",
        { received: typeof webhookData },
        400
      );
    }

    // 이벤트 타입 확인
    const eventType = webhookData.eventType;
    if (eventType !== "seller.changed") {
      console.warn(`⚠️  Unhandled webhook event type: ${eventType}`);
      // 토스페이먼츠 웹훅은 10초 이내 200 응답이 필요하므로 빠르게 응답
      return successResponse(res, {
        message: `이벤트 타입 '${eventType}'는 처리하지 않습니다.`,
        eventType,
        eventId: webhookData.eventId,
      });
    }

    // entityBody 확인
    const entityBody = webhookData.entityBody;
    if (!entityBody || typeof entityBody !== "object") {
      return errorResponse(
        res,
        "INVALID_ENTITY_BODY",
        "entityBody가 없거나 올바르지 않습니다.",
        { webhookData },
        400
      );
    }

    // partnerId 확인
    const partnerId = entityBody.metadata?.partnerId;
    if (!partnerId) {
      console.warn(
        "⚠️  No partnerId in webhook metadata, skipping partner update",
        {
          metadata: entityBody.metadata,
        }
      );
      return successResponse(res, {
        message: "웹훅을 받았지만 partnerId가 없어 업데이트를 건너뜁니다.",
        eventId: webhookData.eventId,
      });
    }

    console.log("🔍 Processing seller.changed webhook:", {
      eventId: webhookData.eventId,
      sellerId: entityBody.id,
      refSellerId: entityBody.refSellerId,
      status: entityBody.status,
      partnerId,
      isEncrypted,
    });

    // partner_business_info 테이블 업데이트
    const supabase = createSupabaseClient();

    try {
      // entityBody에서 직접 값 추출
      const tossSellerId = entityBody.id;
      const tossRefSellerId = entityBody.refSellerId;
      const tossStatus = entityBody.status;
      const tossBusinessType = entityBody.businessType;

      // partner_business_info 테이블에 upsert할 데이터 준비
      const bizInfoData: any = {
        partner_id: partnerId,
        tosspayments_seller_id: tossSellerId || null,
        tosspayments_ref_seller_id: tossRefSellerId || null,
        tosspayments_status: tossStatus || null,
        tosspayments_synced_at: new Date().toISOString(),
        tosspayments_business_type: tossBusinessType || null,
        tosspayments_last_error: null,
      };

      // entityBody에서 legal 정보 추출 (INDIVIDUAL인 경우)
      if (entityBody.individual) {
        bizInfoData.legal_name = entityBody.individual.name || null;
        bizInfoData.legal_email = entityBody.individual.email || null;
        bizInfoData.legal_phone = entityBody.individual.phone || null;
      }
      // entityBody에서 legal 정보 추출 (INDIVIDUAL_BUSINESS 또는 CORPORATION인 경우)
      else if (entityBody.company) {
        bizInfoData.legal_name =
          entityBody.company.representativeName ||
          entityBody.company.name ||
          null;
        bizInfoData.legal_email = entityBody.company.email || null;
        bizInfoData.legal_phone = entityBody.company.phone || null;
      }

      // entityBody에서 계좌 정보 추출
      if (entityBody.account) {
        bizInfoData.payout_bank_code = entityBody.account.bankCode || null;
        bizInfoData.payout_account_number =
          entityBody.account.accountNumber || null;
        bizInfoData.payout_account_holder =
          entityBody.account.holderName || null;
      }

      console.log("📝 Upserting partner_business_info from webhook:", {
        partnerId,
        bizInfoDataKeys: Object.keys(bizInfoData),
        bizInfoData: JSON.stringify(bizInfoData, null, 2),
      });

      // partner_business_info 테이블에 upsert
      const { data: updatedBizInfo, error: updateError } = await supabase
        .from("partner_business_info")
        .upsert(bizInfoData, { onConflict: "partner_id" })
        .select()
        .single();

      if (updateError) {
        console.error(
          "❌ Failed to upsert partner_business_info from webhook:",
          {
            error: updateError,
            code: updateError.code,
            message: updateError.message,
            details: updateError.details,
            hint: updateError.hint,
            partnerId,
            bizInfoData,
          }
        );

        return errorResponse(
          res,
          "PARTNER_BUSINESS_INFO_UPDATE_ERROR",
          `파트너 비즈니스 정보 업데이트 실패: ${updateError.message}`,
          {
            partnerId,
            updateError: {
              code: updateError.code,
              message: updateError.message,
              details: updateError.details,
              hint: updateError.hint,
            },
          },
          500
        );
      }

      const processingTime = Date.now() - webhookStartTime;
      console.log(
        `✅ Partner business info updated successfully from webhook: ${partnerId}`,
        {
          partnerId,
          processingTimeMs: processingTime,
          updatedBizInfo: updatedBizInfo
            ? {
                partner_id: updatedBizInfo.partner_id,
                tosspayments_seller_id: updatedBizInfo.tosspayments_seller_id,
                tosspayments_ref_seller_id:
                  updatedBizInfo.tosspayments_ref_seller_id,
                tosspayments_status: updatedBizInfo.tosspayments_status,
              }
            : null,
        }
      );

      // 토스페이먼츠 웹훅은 10초 이내 200 응답이 필요함 (문서 참고: https://docs.tosspayments.com/guides/v2/webhook)
      // 빠른 응답을 위해 성공 메시지만 반환
      return successResponse(res, {
        message: "웹훅 처리 완료",
        eventId: webhookData.eventId,
        eventType: webhookData.eventType,
        sellerId: entityBody.id,
        partnerId,
        updated: true,
        processingTimeMs: processingTime,
      });
    } catch (error: any) {
      console.error("❌ Error processing webhook:", {
        error: error,
        message: error?.message,
        stack: error?.stack,
        partnerId,
      });

      return errorResponse(
        res,
        "WEBHOOK_PROCESSING_ERROR",
        `웹훅 처리 중 오류가 발생했습니다: ${error?.message || String(error)}`,
        {
          eventId: webhookData.eventId,
          partnerId,
        },
        500
      );
    }
  })
);

// Middleware to check admin role
const requireAdmin = async (req: any, res: any, next: any) => {
  try {
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();

    const { data: memberData, error: memberError } = await supabase
      .from("members")
      .select("role")
      .eq("id", user.id)
      .single();

    if (memberError || memberData?.role !== "admin") {
      return errorResponse(
        res,
        "FORBIDDEN",
        "관리자 권한이 필요합니다.",
        null,
        403
      );
    }

    (req as any).user = user;
    next();
  } catch (error: any) {
    if (
      error.message?.includes("authorization") ||
      error.message?.includes("token")
    ) {
      return errorResponse(
        res,
        "UNAUTHORIZED",
        "인증이 필요합니다.",
        null,
        401
      );
    }
    return errorResponse(
      res,
      "INTERNAL_ERROR",
      "Internal server error",
      error instanceof Error ? error.message : String(error),
      500
    );
  }
};

/**
 * 다음 평일 오전 10시 계산 (토/일/공휴일 제외)
 */
function getNextBusinessDay10AM(): string {
  const hd = new Holidays("KR"); // 한국 공휴일
  let date = new Date();
  date.setDate(date.getDate() + 1); // 다음날부터 시작
  date.setHours(10, 0, 0, 0); // 오전 10시로 설정

  // 토/일/공휴일이 아닌 날짜 찾기
  while (true) {
    const dayOfWeek = date.getDay(); // 0: 일요일, 6: 토요일
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isHoliday = hd.isHoliday(date);

    if (!isWeekend && !isHoliday) {
      // 평일이고 공휴일이 아닌 경우
      break;
    }

    // 다음날로 이동
    date.setDate(date.getDate() + 1);
  }

  // YYYY-MM-DD 형식으로 반환
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * @swagger
 * /api/toss/payouts:
 *   post:
 *     summary: 토스페이먼츠 지급대행 요청 (관리자 전용)
 *     description: |
 *       파트너 출금 요청을 토스페이먼츠 지급대행 API로 전송합니다.
 *
 *       **주요 기능:**
 *       - partner_withdrawals에서 pending 상태의 출금 요청을 조회합니다.
 *       - 각 파트너의 tax 퍼센트를 제외한 실제 지급 금액을 계산합니다.
 *       - 다음 평일 오전 10시에 지급되도록 자동 스케줄링합니다 (토/일/공휴일 제외).
 *       - 한국 공휴일 기준으로 평일을 계산합니다 (date-holidays 사용).
 *
 *       **금액 계산:**
 *       - 실제 지급 금액 = requested_amount × (100 - tax) / 100
 *       - 예: requested_amount가 10,000이고 tax가 25%인 경우, 실제 지급 금액은 7,500원
 *
 *       **요청 본문은 JWE로 암호화되어 전송됩니다.**
 *     tags: [Toss Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - withdrawalIds
 *             properties:
 *               withdrawalIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 description: 출금 요청 ID 배열 (partner_withdrawals.id, pending 상태만 처리)
 *                 example: ["81ebb72d-1fd8-4368-88bd-3187224463ca"]
 *     responses:
 *       200:
 *         description: 지급대행 요청 성공
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
 *                     payouts:
 *                       type: object
 *                       description: 토스페이먼츠 API 응답
 *                     requestedPayouts:
 *                       type: number
 *                       description: 요청한 지급대행 개수
 *                     payoutDate:
 *                       type: string
 *                       format: date
 *                       description: 지급 예정일 (YYYY-MM-DD)
 *                       example: "2024-08-08"
 *                     message:
 *                       type: string
 *                       example: "지급대행 요청이 성공적으로 전송되었습니다."
 *       400:
 *         description: 잘못된 요청 (withdrawalIds가 없거나 빈 배열, 유효한 지급대행 요청이 없음)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "NO_VALID_PAYOUTS"
 *                     message:
 *                       type: string
 *                       example: "유효한 지급대행 요청이 없습니다. (셀러 ID가 없거나 금액이 0 이하)"
 *       403:
 *         description: 관리자 권한 필요
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "FORBIDDEN"
 *                     message:
 *                       type: string
 *                       example: "관리자 권한이 필요합니다."
 *       404:
 *         description: 대기 중인 출금 요청을 찾을 수 없음
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "NO_WITHDRAWALS"
 *                     message:
 *                       type: string
 *                       example: "대기 중인 출금 요청을 찾을 수 없습니다."
 *                     details:
 *                       type: object
 *                       properties:
 *                         requestedIds:
 *                           type: array
 *                           items:
 *                             type: string
 *                         foundCount:
 *                           type: number
 *                         pendingCount:
 *                           type: number
 *                         statusCounts:
 *                           type: object
 *                           description: 상태별 출금 요청 개수
 *       500:
 *         description: 토스페이먼츠 API 오류 또는 설정 오류
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       example: "TOSS_API_ERROR"
 *                     message:
 *                       type: string
 *                       example: "지급대행 요청 실패: 예치금 부족"
 */
router.post(
  "/payouts",
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { withdrawalIds } = req.body;

    if (
      !withdrawalIds ||
      !Array.isArray(withdrawalIds) ||
      withdrawalIds.length === 0
    ) {
      return errorResponse(
        res,
        "INVALID_BODY",
        "withdrawalIds 배열이 필요합니다.",
        null,
        400
      );
    }

    const supabase = createSupabaseClient();

    console.log("📥 Received withdrawalIds:", withdrawalIds);

    // 1. partner_withdrawals에서 출금 요청 조회 (status 필터 없이 먼저 조회, withdrawal_type 포함)
    const { data: allWithdrawals, error: allWithdrawalsError } = await supabase
      .from("partner_withdrawals")
      .select(
        `
        id,
        partner_id,
        requested_amount,
        status,
        withdrawal_type
      `
      )
      .in("id", withdrawalIds);

    if (allWithdrawalsError) {
      console.error("❌ Failed to fetch withdrawals:", allWithdrawalsError);
      const errorMessage =
        allWithdrawalsError instanceof Error
          ? allWithdrawalsError.message
          : String(allWithdrawalsError);
      return errorResponse(
        res,
        "WITHDRAWAL_FETCH_ERROR",
        "출금 요청 조회 실패",
        errorMessage,
        500
      );
    }

    console.log("📋 All withdrawals found (before status filter):", {
      count: allWithdrawals?.length || 0,
      withdrawals: allWithdrawals?.map((w) => ({
        id: w.id,
        partner_id: w.partner_id,
        requested_amount: w.requested_amount,
        status: w.status,
      })),
    });

    // 대기 중인 출금 요청만 필터링 (pending 상태)
    const withdrawals =
      allWithdrawals?.filter((w) => w.status === "pending") || [];

    console.log("✅ Pending withdrawals (after status filter):", {
      count: withdrawals.length,
      withdrawals: withdrawals.map((w) => ({
        id: w.id,
        partner_id: w.partner_id,
        requested_amount: w.requested_amount,
        status: w.status,
      })),
    });

    if (!withdrawals || withdrawals.length === 0) {
      const statusCounts =
        allWithdrawals?.reduce((acc: any, w: any) => {
          acc[w.status] = (acc[w.status] || 0) + 1;
          return acc;
        }, {}) || {};

      return errorResponse(
        res,
        "NO_WITHDRAWALS",
        "대기 중인 출금 요청을 찾을 수 없습니다.",
        {
          requestedIds: withdrawalIds,
          foundCount: allWithdrawals?.length || 0,
          pendingCount: withdrawals.length,
          statusCounts: statusCounts,
          allWithdrawals: allWithdrawals?.map((w) => ({
            id: w.id,
            status: w.status,
            requested_amount: w.requested_amount,
          })),
        },
        404
      );
    }

    // 2. 각 출금 요청의 partner 정보 조회 (partner_business_info 조인)
    const partnerIds = [...new Set(withdrawals.map((w: any) => w.partner_id))];
    console.log("👥 Partner IDs to fetch:", partnerIds);

    const { data: partners, error: partnersError } = await supabase
      .from("partners")
      .select("id, partner_business_info(tosspayments_seller_id, tax, default_distribution_rate, collaboration_distribution_rate)")
      .in("id", partnerIds);

    console.log("👥 Found partners:", {
      count: partners?.length || 0,
      partners: partners?.map((p: any) => {
        const bizInfo =
          (p.partner_business_info as any)?.[0] ||
          p.partner_business_info ||
          {};
        return {
          id: p.id,
          tosspayments_seller_id: bizInfo.tosspayments_seller_id,
          tax: bizInfo.tax,
          default_distribution_rate: bizInfo.default_distribution_rate,
          collaboration_distribution_rate: bizInfo.collaboration_distribution_rate,
        };
      }),
    });

    if (partnersError) {
      console.error("❌ Failed to fetch partners:", partnersError);
      return errorResponse(
        res,
        "PARTNER_FETCH_ERROR",
        "파트너 정보 조회 실패",
        partnersError instanceof Error
          ? partnersError.message
          : String(partnersError),
        500
      );
    }

    // Flatten partner_business_info into partner object for easier access
    const partnerMap = new Map(
      partners?.map((p: any) => {
        const bizInfo =
          (p.partner_business_info as any)?.[0] ||
          p.partner_business_info ||
          {};
        return [
          p.id,
          {
            id: p.id,
            tosspayments_seller_id: bizInfo.tosspayments_seller_id || null,
            tax: bizInfo.tax || 0,
            default_distribution_rate: bizInfo.default_distribution_rate || 100, // 기본값 100% (수수료 없음)
            collaboration_distribution_rate: bizInfo.collaboration_distribution_rate || 100, // 기본값 100%
          },
        ];
      }) || []
    );

    // 2.5. 파트너 티어 정보 조회 (partner_tier_current)
    const { data: partnerTiers, error: partnerTiersError } = await supabase
      .from("partner_tier_current")
      .select("partner_id, tier_code")
      .in("partner_id", partnerIds);

    if (partnerTiersError) {
      console.error("❌ Failed to fetch partner tiers:", partnerTiersError);
      // 티어 조회 실패 시에도 계속 진행 (기본 bronze 적용)
    }

    // partner_id -> tier_code 매핑
    const partnerTierMap = new Map(
      partnerTiers?.map((t: any) => [t.partner_id, t.tier_code]) || []
    );

    console.log("🏆 Partner tiers:", {
      count: partnerTiers?.length || 0,
      tiers: partnerTiers?.map((t: any) => ({
        partner_id: t.partner_id,
        tier_code: t.tier_code,
      })),
    });

    // 2.6. fee_policy 테이블 조회 (티어별 partner_share_pct)
    const { data: feePolicies, error: feePoliciesError } = await supabase
      .from("fee_policy")
      .select("tier_code, partner_share_pct");

    if (feePoliciesError) {
      console.error("❌ Failed to fetch fee policies:", feePoliciesError);
      // 정책 조회 실패 시에도 계속 진행 (기본 75% 적용)
    }

    // tier_code -> partner_share_pct 매핑
    const feePolicyMap = new Map(
      feePolicies?.map((f: any) => [f.tier_code, f.partner_share_pct]) || []
    );

    console.log("💰 Fee policies:", {
      count: feePolicies?.length || 0,
      policies: feePolicies?.map((f: any) => ({
        tier_code: f.tier_code,
        partner_share_pct: f.partner_share_pct,
      })),
    });

    // 3. 각 출금 요청에 대해 지급대행 요청 생성
    const payouts: any[] = [];
    const payoutDate = getNextBusinessDay10AM();

    for (const withdrawal of withdrawals) {
      const partner = partnerMap.get(withdrawal.partner_id);

      if (!partner) {
        console.warn(
          `⚠️  Partner ${withdrawal.partner_id} not found, skipping withdrawal ${withdrawal.id}`
        );
        continue;
      }

      if (!partner.tosspayments_seller_id) {
        console.warn(
          `⚠️  Partner ${partner.id} has no tosspayments_seller_id, skipping`
        );
        continue;
      }

      // withdrawal_type에 따라 다른 비율 적용
      const withdrawalType = withdrawal.withdrawal_type || "total_points";
      let payoutAmount: number;
      let rateApplied: number;
      let rateType: string;

      if (withdrawalType === "store_points") {
        // store_points: default_distribution_rate 적용
        rateApplied = partner.default_distribution_rate || 100;
        rateType = "default_distribution_rate";
        payoutAmount = Math.floor(withdrawal.requested_amount * (rateApplied / 100));
      } else if (withdrawalType === "collaboration_store_points") {
        // collaboration_store_points: 100% 전액 지급 (분배율 미적용)
        rateApplied = 100;
        rateType = "full_payout";
        payoutAmount = withdrawal.requested_amount;
      } else {
        // total_points (기본): 파트너 티어의 partner_share_pct 적용
        const tierCode = partnerTierMap.get(partner.id) || "bronze"; // 기본 bronze
        const partnerSharePct = feePolicyMap.get(tierCode) || 75; // 기본 75%
        rateApplied = partnerSharePct;
        rateType = `tier_${tierCode}`;
        payoutAmount = Math.floor(withdrawal.requested_amount * (rateApplied / 100));
      }

      console.log(`💰 Payout calculation for ${withdrawal.id}:`, {
        withdrawalType,
        requestedAmount: withdrawal.requested_amount,
        rateType,
        rateApplied,
        payoutAmount,
      });

      if (payoutAmount <= 0) {
        console.warn(
          `⚠️  Payout amount is 0 or negative for withdrawal ${withdrawal.id}, skipping`
        );
        continue;
      }

      // transactionDescription은 0~7자 제한이 있으므로 짧게 설정
      // withdrawal.id의 마지막 4자리만 사용하거나 간단한 설명 사용
      const withdrawalIdShort = withdrawal.id.substring(
        withdrawal.id.length - 4
      );
      const transactionDescription = `출금${withdrawalIdShort}`.substring(0, 7); // 최대 7자

      payouts.push({
        refPayoutId: `payout-${withdrawal.id}`,
        destination: partner.tosspayments_seller_id,
        scheduleType: "SCHEDULED",
        payoutDate: payoutDate,
        amount: {
          currency: "KRW",
          value: payoutAmount,
        },
        transactionDescription: transactionDescription,
        metadata: {
          withdrawalId: withdrawal.id,
          partnerId: partner.id,
          info: JSON.stringify([
            withdrawal.requested_amount,
            withdrawalType,
            rateType,
            rateApplied,
            payoutAmount,
          ]),
        },
      });
    }

    if (payouts.length === 0) {
      return errorResponse(
        res,
        "NO_VALID_PAYOUTS",
        "유효한 지급대행 요청이 없습니다. (셀러 ID가 없거나 금액이 0 이하)",
        null,
        400
      );
    }

    // 4. 토스페이먼츠 API 호출
    // Get environment from header (셀러 등록/수정과 동일한 방식)
    const isProductionHeader = req.headers["x-is-production"];
    let isProductionValue: boolean | undefined = undefined;

    if (isProductionHeader !== undefined) {
      if (typeof isProductionHeader === "string") {
        isProductionValue = isProductionHeader.toLowerCase() === "true";
      } else if (typeof isProductionHeader === "boolean") {
        isProductionValue = isProductionHeader;
      } else if (Array.isArray(isProductionHeader)) {
        isProductionValue = isProductionHeader[0]?.toLowerCase() === "true";
      }
    }

    // 지급 대행 요청은 지급대행 API이므로 'api' 모드 사용 (TOSS_API_PROD_SECRET_KEY 우선)
    const tossSecretKey = getTossSecretKey("api", isProductionValue);
    if (!tossSecretKey) {
      return errorResponse(
        res,
        "TOSS_CONFIG_MISSING",
        "토스페이먼츠 설정이 없습니다.",
        {
          hint: "환경 변수에 TOSS_API_PROD_SECRET_KEY 또는 TOSS_API_DEV_SECRET_KEY를 설정해주세요.",
        },
        500
      );
    }

    // Python 암호화 사용 여부 확인 (환경변수 또는 헤더로 제어 가능)
    const usePythonEncryption =
      process.env.TOSS_USE_PYTHON_ENCRYPTION === "true" ||
      req.headers["x-use-python-encryption"] === "true";

    if (usePythonEncryption) {
      console.log("🐍 Using Python encryption (authlib.jose)");
    } else {
      console.log("📦 Using Node.js encryption (jose library)");
    }

    // 보안 키 정보 확인 (셀러 등록/수정과 동일)
    const {
      key: securityKey,
      source: securityKeySource,
      isProd: securityKeyIsProd,
    } = getTossSecurityKey(isProductionValue);
    console.log(
      `🔑 Security Key Info: source=${securityKeySource}, isProd=${securityKeyIsProd}, length=${
        securityKey?.length || 0
      }`
    );

    // 요청 본문 암호화 (셀러 등록/수정과 동일한 방식)
    console.log(
      "📤 Payout payload (before encryption):",
      JSON.stringify(payouts, null, 2)
    );
    console.log("📊 Payout summary:", {
      count: payouts.length,
      payoutDate,
      totalAmount: payouts.reduce((sum, p) => sum + p.amount.value, 0),
      payouts: payouts.map((p) => ({
        refPayoutId: p.refPayoutId,
        destination: p.destination,
        amount: p.amount.value,
        transactionDescription: p.transactionDescription,
        metadata: p.metadata,
      })),
    });

    const encryptedPayload = await encryptPayload(
      payouts,
      usePythonEncryption,
      isProductionValue
    );
    console.log("🔒 Encrypted payload length:", encryptedPayload.length);
    console.log(
      "🔒 Encrypted payload preview:",
      encryptedPayload.substring(0, 100) + "..."
    );

    const tossHeaders = createTossHeaders(tossSecretKey);
    tossHeaders["TossPayments-api-security-mode"] = "ENCRYPTION";
    tossHeaders["Content-Type"] = "text/plain";

    console.log("🔍 Calling Toss Payments Payout API (v2)...", {
      endpoint: "https://api.tosspayments.com/v2/payouts",
      payoutCount: payouts.length,
      payoutDate,
      isProduction: isProductionValue,
      usePython: usePythonEncryption,
    });

    const tossResponse = await fetch(
      "https://api.tosspayments.com/v2/payouts",
      {
        method: "POST",
        headers: tossHeaders,
        body: encryptedPayload,
      }
    );

    const responseText = await tossResponse.text();
    console.log("📥 Toss Payout API Response:", {
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
      console.log("🔍 Analyzing error response:", {
        status: tossResponse.status,
        responseLength: trimmedResponse.length,
        responsePreview: trimmedResponse.substring(0, 200),
        startsWithEyJ: trimmedResponse.startsWith("eyJ"),
        dotCount: trimmedResponse.split(".").length,
      });

      // JWE 형식 체크: eyJ로 시작하고 5개의 점(.)으로 구분된 구조
      const isJWE =
        trimmedResponse.startsWith("eyJ") &&
        trimmedResponse.split(".").length === 5;

      if (isJWE) {
        // JWE 형식인 경우 복호화 시도
        console.log("🔐 Attempting to decrypt error response (JWE format)...");
        try {
          const decryptedError = await decryptPayload(
            trimmedResponse,
            isProductionValue,
            usePythonEncryption
          );
          console.log("✅ Error response decrypted successfully:", {
            decryptedType: typeof decryptedError,
            decryptedKeys:
              typeof decryptedError === "object" && decryptedError !== null
                ? Object.keys(decryptedError)
                : [],
            decryptedPreview: JSON.stringify(decryptedError).substring(0, 500),
          });
          errorData = decryptedError;

          // 복호화된 에러 데이터 구조 확인
          if (typeof decryptedError === "object" && decryptedError !== null) {
            const errorEntityBody =
              decryptedError?.entityBody || decryptedError;
            errorMessage =
              errorEntityBody?.message ||
              errorEntityBody?.error?.message ||
              errorEntityBody?.code ||
              errorEntityBody?.error?.code ||
              decryptedError?.message ||
              decryptedError?.error?.message ||
              decryptedError?.code ||
              decryptedError?.error?.code ||
              (typeof errorEntityBody === "string"
                ? errorEntityBody
                : JSON.stringify(errorEntityBody));

            // 에러 메시지가 여전히 비어있거나 의미없는 경우 전체 객체를 문자열로 변환
            if (
              !errorMessage ||
              errorMessage === "{}" ||
              errorMessage === "null"
            ) {
              errorMessage = JSON.stringify(decryptedError);
            }

            // entityBody를 명시적으로 포함시키기 위해 errorData 구조화
            errorData = {
              ...decryptedError,
              entityBody: decryptedError.entityBody || errorEntityBody,
            };
          } else {
            errorMessage =
              typeof decryptedError === "string"
                ? decryptedError
                : String(decryptedError);
            errorData = {
              entityBody: decryptedError,
            };
          }
        } catch (decryptError: any) {
          // 복호화 실패 시 상세한 에러 정보 로깅
          console.error("❌ Failed to decrypt error response:", {
            error: decryptError?.message || String(decryptError),
            errorName: decryptError?.name,
            encryptedLength: trimmedResponse.length,
            encryptedPreview: trimmedResponse.substring(0, 200),
          });

          // 복호화 실패 시에도 원본 암호화된 메시지와 함께 상세 정보 제공
          errorData = {
            encryptedMessage: trimmedResponse,
            decryptError:
              decryptError instanceof Error
                ? decryptError.message
                : String(decryptError),
            hint: "에러 응답 복호화에 실패했습니다. 보안 키(TOSS_API_PROD_SECURITY_KEY)가 올바른지 확인하세요.",
          };
          errorMessage = `에러 응답 복호화 실패: ${
            decryptError instanceof Error
              ? decryptError.message
              : String(decryptError)
          }`;
        }
      } else {
        // 일반 JSON 응답인 경우
        console.log("📄 Parsing error response as JSON...");
        try {
          errorData = JSON.parse(responseText);
          errorMessage =
            errorData.message ||
            errorData.error?.message ||
            errorData.code ||
            errorData.error?.code ||
            errorData.error ||
            JSON.stringify(errorData);

          // 에러 메시지가 여전히 비어있는 경우
          if (
            !errorMessage ||
            errorMessage === "{}" ||
            errorMessage === "null"
          ) {
            errorMessage = `HTTP ${tossResponse.status} ${tossResponse.statusText}`;
          }
        } catch (parseError) {
          console.error(
            "❌ Failed to parse error response as JSON:",
            parseError
          );
          errorData = {
            rawMessage: responseText,
            parseError:
              parseError instanceof Error
                ? parseError.message
                : String(parseError),
          };
          errorMessage =
            responseText ||
            `HTTP ${tossResponse.status} ${tossResponse.statusText}`;
        }
      }

      // 최종 에러 메시지가 여전히 비어있는 경우 HTTP 상태 코드 사용
      if (!errorMessage || errorMessage.trim() === "") {
        errorMessage = `HTTP ${tossResponse.status} ${
          tossResponse.statusText || "Unknown Error"
        }`;
      }

      console.error("❌ Toss Payout API Error:", {
        status: tossResponse.status,
        statusText: tossResponse.statusText,
        errorMessage: errorMessage,
        errorData: errorData,
        responseText: responseText.substring(0, 500),
      });

      return errorResponse(
        res,
        "TOSS_API_ERROR",
        `지급대행 요청 실패: ${errorMessage}`,
        null,
        tossResponse.status
      );
    }

    // 5. 응답 복호화
    let encryptedResponse: string = responseText;
    try {
      const parsed = JSON.parse(responseText);
      if (parsed?.data && typeof parsed.data === "string") {
        encryptedResponse = parsed.data;
      }
    } catch {
      encryptedResponse = responseText.trim();
    }

    try {
      const decryptedData = await decryptPayload(
        encryptedResponse,
        isProductionValue,
        usePythonEncryption
      );
      console.log("✅ Toss Payout API success (decrypted)");

      // 6. partner_withdrawals 상태 업데이트 (선택적)
      // 실제로는 토스페이먼츠 웹훅에서 처리할 수도 있음

      return successResponse(res, {
        payouts: decryptedData,
        requestedPayouts: payouts.length,
        payoutDate,
        message: "지급대행 요청이 성공적으로 전송되었습니다.",
      });
    } catch (decryptError: any) {
      console.error("❌ Failed to decrypt payout response:", decryptError);
      return errorResponse(
        res,
        "TOSS_DECRYPT_ERROR",
        `응답 복호화 실패: ${decryptError.message}`,
        null,
        500
      );
    }
  })
);

export default router;
