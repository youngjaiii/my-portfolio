/**
 * 토스페이먼츠 API 인증 헤더 생성 유틸리티
 * 참고: https://docs.tosspayments.com/reference/using-api/authorization
 */

/**
 * 토스페이먼츠 시크릿 키로 Basic 인증 헤더 생성
 * 
 * @param secretKey 토스페이먼츠 시크릿 키 (test_sk 또는 live_sk로 시작)
 * @returns Basic 인증 헤더 값 (예: "Basic dGVzdF9za19...")
 * 
 * @example
 * const authHeader = createTossAuthHeader(process.env.TOSS_SECRET_KEY);
 * // 사용: headers: { Authorization: authHeader }
 */
export function createTossAuthHeader(secretKey: string | undefined): string {
  if (!secretKey) {
    throw new Error("Toss Payments secret key is required");
  }

  // 시크릿 키 유효성 검사 (live 키만 허용)
  // 토스페이먼츠 키 종류:
  // - live_sk_: 일반 결제용 Secret Key
  // - live_gsk_: 지급대행용 Secret Key (Goods Settlement Key)
  const isValidKey = secretKey.startsWith('live_gsk') || secretKey.startsWith('live_sk');

  if (!isValidKey) {
    console.warn("⚠️  Toss secret key should start with 'live_sk' or 'live_gsk' (test keys are not allowed)");
  }

  // 토스페이먼츠 Basic 인증 헤더 생성
  // 형식: Authorization: Basic base64('secretKey:')
  // 
  // 예시:
  //   secretKey: 'test_sk_6bJXmgo28eB6lBLMKBgj3LAnGKWx'
  //   secretKey + ':': 'test_sk_6bJXmgo28eB6lBLMKBgj3LAnGKWx:'
  //   base64 인코딩: 'dGVzdF9za19tQloxZ1E0WVZYQks5Z3A5eFhlajhsMktQb3FOOg=='
  //   최종 헤더: 'Basic dGVzdF9za19tQloxZ1E0WVZYQks5Z3A5eFhlajhsMktQb3FOOg=='
  //
  // ┌─────────────────────────────────────┬──┐
  // │         secretKey (발급받은 키)        │ :│
  // └─────────────────────────────────────┴──┘
  //                    ↓
  //            Base64 인코딩
  //                    ↓
  //         'Basic {encoded}'
  const keyWithColon = secretKey + ":";
  const encoded = Buffer.from(keyWithColon, "utf-8").toString("base64");
  const finalHeader = `Basic ${encoded}`;

  // 디버깅: 변환 과정 로깅
  console.log("🔑 createTossAuthHeader 변환 과정:", {
    step1_input: {
      secretKey: secretKey,
      keyLength: secretKey.length,
      keyPrefix: secretKey.substring(0, 15) + "...",
    },
    step2_withColon: {
      keyWithColon: keyWithColon,
      length: keyWithColon.length,
    },
    step3_base64: {
      encoded: encoded,
      encodedLength: encoded.length,
    },
    step4_final: {
      finalHeader: finalHeader,
      headerLength: finalHeader.length,
    },
    // 프론트엔드에서 성공한 헤더와 비교
    comparison: {
      expectedFromFrontend: "Basic dGVzdF9za19tQloxZ1E0WVZYQks5Z3A5eFhlajhsMktQb3FOOg==",
      actualGenerated: finalHeader,
      matches: finalHeader === "Basic dGVzdF9za19tQloxZ1E0WVZYQks5Z3A5eFhlajhsMktQb3FOOg==",
    },
  });

  return finalHeader;
}

/**
 * 토스페이먼츠 일반 결제 시크릿 키 가져오기
 * - payment confirm, cancel 등에 사용
 * - test_sk / live_sk 키를 우선 사용
 *
 * @param isProductionFromHeader 프론트엔드에서 보내준 isProduction 값 (선택사항)
 * @returns 시크릿 키 또는 undefined
 */
export function getTossPaymentSecretKey(isProductionFromHeader?: boolean): string | undefined {
  return getTossSecretKeyInternal('payment', isProductionFromHeader);
}

/**
 * 토스페이먼츠 지급대행 API 시크릿 키 가져오기
 * - balance, payout 등에 사용
 * - TOSS_API_* 환경 변수를 우선 사용
 * - test_gsk / live_gsk 키를 우선, 없으면 test_sk / live_sk 사용
 *
 * @param isProductionFromHeader 프론트엔드에서 보내준 isProduction 값 (선택사항)
 * @returns 시크릿 키 또는 undefined
 */
export function getTossPayoutSecretKey(isProductionFromHeader?: boolean): string | undefined {
  return getTossSecretKeyInternal('payout', isProductionFromHeader);
}

/**
 * @deprecated 이 함수는 deprecated되었습니다. getTossPaymentSecretKey() 또는 getTossPayoutSecretKey()를 사용하세요.
 *
 * 토스페이먼츠 시크릿 키 가져오기 (환경 변수에서)
 * 하위 호환성을 위해 유지
 *
 * @param mode 'api' 모드일 경우 지급대행 키 사용, 그 외는 결제 키 사용
 * @param isProductionFromHeader 프론트엔드에서 보내준 isProduction 값 (선택사항)
 * @returns 시크릿 키 또는 undefined
 */
export function getTossSecretKey(mode?: 'api' | boolean, isProductionFromHeader?: boolean): string | undefined {
  // mode가 boolean인 경우 (하위 호환성)
  let actualIsProduction: boolean | undefined;

  if (typeof mode === 'boolean') {
    // 하위 호환성: mode가 boolean이면 isProduction으로 처리
    actualIsProduction = mode;
    return getTossSecretKeyInternal('payment', actualIsProduction);
  } else if (mode === 'api') {
    // 'api' 모드는 지급대행 (payout)
    return getTossSecretKeyInternal('payout', isProductionFromHeader);
  } else {
    // mode가 없으면 일반 결제 (payment)
    return getTossSecretKeyInternal('payment', isProductionFromHeader);
  }
}

/**
 * 내부 구현: 토스페이먼츠 시크릿 키 가져오기
 * - test 키는 사용하지 않고 live 키(live_sk, live_gsk)만 사용
 *
 * @param keyType 'payment' (일반 결제) 또는 'payout' (지급대행)
 * @param isProductionFromHeader 사용하지 않음 (하위 호환성 유지)
 * @returns 시크릿 키 또는 undefined
 */
function getTossSecretKeyInternal(keyType: 'payment' | 'payout', isProductionFromHeader?: boolean): string | undefined {
  
  // live 키(live_sk, live_gsk)만 사용
  // keyType에 따른 우선순위:
  // - 'payout': TOSS_API_PROD_SECRET_KEY 우선 (live_sk 또는 live_gsk)
  // - 'payment': TOSS_PAY_PROD_SECRET_KEY 우선 (live_sk만)

  let key: string | undefined;
  let sourceEnvVar = 'unknown';

  const keys = keyType === 'payout'
    ? [
        { name: 'TOSS_API_PROD_SECRET_KEY', value: process.env.TOSS_API_PROD_SECRET_KEY },
        { name: 'TOSS_PAY_PROD_SECRET_KEY', value: process.env.TOSS_PAY_PROD_SECRET_KEY },
        { name: 'TOSS_PAY_SECRET_KEY_REAL', value: process.env.TOSS_PAY_SECRET_KEY_REAL },
        { name: 'TOSS_PROD_SECRET_KEY', value: process.env.TOSS_PROD_SECRET_KEY },
      ]
    : [
        { name: 'TOSS_PAY_PROD_SECRET_KEY', value: process.env.TOSS_PAY_PROD_SECRET_KEY },
        { name: 'TOSS_API_PROD_SECRET_KEY', value: process.env.TOSS_API_PROD_SECRET_KEY },
        { name: 'TOSS_PAY_SECRET_KEY_REAL', value: process.env.TOSS_PAY_SECRET_KEY_REAL },
        { name: 'TOSS_PROD_SECRET_KEY', value: process.env.TOSS_PROD_SECRET_KEY },
      ];

  // live_sk 또는 live_gsk로 시작하는 키만 허용
  for (const { name, value } of keys) {
    if (value) {
      // CLIENT_KEY는 공개 키이므로 Secret Key로 사용하지 않음
      if (name.includes('CLIENT_KEY')) {
        continue;
      }

      // live_ 키만 허용 (test_ 키는 사용하지 않음)
      if (value.startsWith('live_sk') || value.startsWith('live_gsk')) {
        key = value;
        sourceEnvVar = name;
        break;
      } else if (value.startsWith('test_')) {
        // test_ 키 발견 시 경고하고 건너뜀
        console.error(`🚨 ${name} contains a TEST key! Skipping. Only live_ keys are allowed.`);
      }
    }
  }

  // 메인 키를 찾지 못한 경우 fallback 키 확인
  if (!key) {
    const fallbackKeys = keyType === 'payout'
      ? [
          { name: 'TOSS_API_PAYMENTS_SECRET_KEY', value: process.env.TOSS_API_PAYMENTS_SECRET_KEY },
          { name: 'TOSS_PAYMENTS_SECRET_KEY', value: process.env.TOSS_PAYMENTS_SECRET_KEY },
          { name: 'TOSS_PAY_SECRET_KEY', value: process.env.TOSS_PAY_SECRET_KEY },
          { name: 'TOSS_SECRET_KEY', value: process.env.TOSS_SECRET_KEY },
        ]
      : [
          { name: 'TOSS_PAYMENTS_SECRET_KEY', value: process.env.TOSS_PAYMENTS_SECRET_KEY },
          { name: 'TOSS_PAY_SECRET_KEY', value: process.env.TOSS_PAY_SECRET_KEY },
          { name: 'TOSS_SECRET_KEY', value: process.env.TOSS_SECRET_KEY },
        ];

    for (const { name, value } of fallbackKeys) {
      if (value) {
        // live_ 키만 허용
        if (value.startsWith('live_sk') || value.startsWith('live_gsk')) {
          key = value;
          sourceEnvVar = name;
          console.warn(`⚠️  Using fallback key ${name}. Consider using TOSS_API_PROD_SECRET_KEY or TOSS_PAY_PROD_SECRET_KEY instead.`);
          break;
        } else if (value.startsWith('test_')) {
          // test_ 키 발견 시 경고하고 건너뜀
          console.error(`🚨 ${name} contains a TEST key! Skipping. Only live_ keys are allowed.`);
        }
      }
    }
  }

  // 디버깅: 환경 변수 존재 여부 확인 (값은 출력하지 않음)
  if (!key) {
    const envVars = {
      NODE_ENV: process.env.NODE_ENV || 'production',
      TOSS_API_PROD_SECRET_KEY: process.env.TOSS_API_PROD_SECRET_KEY ? `[${process.env.TOSS_API_PROD_SECRET_KEY.length} chars]` : 'not set',
      TOSS_PAY_PROD_SECRET_KEY: process.env.TOSS_PAY_PROD_SECRET_KEY ? `[${process.env.TOSS_PAY_PROD_SECRET_KEY.length} chars]` : 'not set',
      TOSS_PAY_SECRET_KEY: process.env.TOSS_PAY_SECRET_KEY ? `[${process.env.TOSS_PAY_SECRET_KEY.length} chars]` : 'not set',
      TOSS_PAY_SECRET_KEY_REAL: process.env.TOSS_PAY_SECRET_KEY_REAL ? `[${process.env.TOSS_PAY_SECRET_KEY_REAL.length} chars]` : 'not set',
      TOSS_PAYMENTS_SECRET_KEY: process.env.TOSS_PAYMENTS_SECRET_KEY ? `[${process.env.TOSS_PAYMENTS_SECRET_KEY.length} chars]` : 'not set',
      TOSS_PROD_SECRET_KEY: process.env.TOSS_PROD_SECRET_KEY ? `[${process.env.TOSS_PROD_SECRET_KEY.length} chars]` : 'not set',
      TOSS_SECRET_KEY: process.env.TOSS_SECRET_KEY ? `[${process.env.TOSS_SECRET_KEY.length} chars]` : 'not set',
    };
    console.error("❌ Toss Payments secret key not found (live_sk or live_gsk required). Checked env vars:", envVars);
  } else {
    // 키 타입 확인
    let keyCategory: string; // 'PAYMENT' or 'PAYOUT'

    if (key.startsWith('live_sk')) {
      keyCategory = 'PAYMENT';
    } else if (key.startsWith('live_gsk')) {
      keyCategory = 'PAYOUT';
    } else {
      keyCategory = 'UNKNOWN';
    }

    const prefix = key.substring(0, 9);

    console.log(`✅ Toss secret key found (LIVE ${keyCategory} key, from: ${sourceEnvVar}, starts with: ${prefix}...)`);
    console.log(`🔑 Key Details:`, {
      keyCategory: keyCategory,
      sourceEnvVar: sourceEnvVar,
      keyPrefix: prefix + "...",
      keyLength: key.length,
      keyPreview: key.substring(0, 20) + "..." + key.substring(key.length - 5),
    });
  }

  return key;
}

/**
 * 토스페이먼츠 일반 결제 API 요청 헤더 생성
 * - payment confirm, cancel 등에 사용
 *
 * @param secretKey 토스페이먼츠 시크릿 키 (선택사항, 없으면 환경 변수에서 가져옴)
 * @param additionalHeaders 추가 헤더
 * @returns API 요청용 헤더 객체
 */
export function createTossPaymentHeaders(
  secretKey?: string,
  additionalHeaders: Record<string, string> = {}
): Record<string, string> {
  const key = secretKey || getTossPaymentSecretKey();

  if (!key) {
    throw new Error("Toss Payment secret key not found in environment variables");
  }

  return {
    Authorization: createTossAuthHeader(key),
    "Content-Type": "application/json",
    ...additionalHeaders,
  };
}

/**
 * 토스페이먼츠 지급대행 API 요청 헤더 생성
 * - balance, payout 등에 사용
 *
 * @param secretKey 토스페이먼츠 시크릿 키 (선택사항, 없으면 환경 변수에서 가져옴)
 * @param additionalHeaders 추가 헤더
 * @returns API 요청용 헤더 객체
 */
export function createTossPayoutHeaders(
  secretKey?: string,
  additionalHeaders: Record<string, string> = {}
): Record<string, string> {
  const key = secretKey || getTossPayoutSecretKey();

  if (!key) {
    throw new Error("Toss Payout secret key not found in environment variables");
  }

  return {
    Authorization: createTossAuthHeader(key),
    "Content-Type": "application/json",
    ...additionalHeaders,
  };
}

/**
 * @deprecated 이 함수는 deprecated되었습니다. createTossPaymentHeaders() 또는 createTossPayoutHeaders()를 사용하세요.
 *
 * 토스페이먼츠 API 요청 헤더 생성
 * 하위 호환성을 위해 유지
 *
 * @param secretKey 토스페이먼츠 시크릿 키 (선택사항, 없으면 환경 변수에서 가져옴)
 * @param additionalHeaders 추가 헤더
 * @returns API 요청용 헤더 객체
 */
export function createTossHeaders(
  secretKey?: string,
  additionalHeaders: Record<string, string> = {}
): Record<string, string> {
  const key = secretKey || getTossSecretKey();

  if (!key) {
    throw new Error("Toss Payments secret key not found in environment variables");
  }

  return {
    Authorization: createTossAuthHeader(key),
    "Content-Type": "application/json",
    ...additionalHeaders,
  };
}

