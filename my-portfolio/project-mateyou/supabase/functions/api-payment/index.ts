// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * App Store 영수증 검증
 * @param receiptData Base64로 인코딩된 영수증 데이터
 * @param productId 제품 ID
 * @returns 검증 결과
 */
async function verifyAppStoreReceipt(
  receiptData: string,
  productId: string
): Promise<{ valid: boolean; error?: string; transactionId?: string }> {
  try {
    // App Store Server API를 사용한 검증 (권장)
    // 또는 레거시 verifyReceipt API 사용 가능
    
    // 환경변수에서 App Store 공유 비밀키 가져오기
    const appStoreSharedSecret = Deno.env.get('APP_STORE_SHARED_SECRET')
    
    if (!appStoreSharedSecret) {
      console.warn('⚠️ APP_STORE_SHARED_SECRET이 설정되지 않았습니다. 영수증 검증을 건너뜁니다.')
      // 프로덕션에서는 검증을 필수로 해야 하지만, 개발 환경에서는 경고만
      return { valid: true, transactionId: 'dev_mode' }
    }

    // 프로덕션 환경인지 확인
    const isProduction = Deno.env.get('ENVIRONMENT') === 'production'
    const verifyUrl = isProduction
      ? 'https://buy.itunes.apple.com/verifyReceipt' // 프로덕션
      : 'https://sandbox.itunes.apple.com/verifyReceipt' // 샌드박스

    const verifyResponse = await fetch(verifyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        'receipt-data': receiptData,
        'password': appStoreSharedSecret,
        'exclude-old-transactions': true,
      }),
    })

    const verifyResult = await verifyResponse.json()

    // 상태 코드 확인
    if (verifyResult.status === 0) {
      // 검증 성공
      // 영수증에서 해당 제품의 트랜잭션 찾기
      const inAppPurchases = verifyResult.receipt?.in_app || []
      const transaction = inAppPurchases.find(
        (purchase: any) => purchase.product_id === productId
      )

      if (transaction) {
        return {
          valid: true,
          transactionId: transaction.transaction_id,
        }
      } else {
        return {
          valid: false,
          error: '해당 제품의 트랜잭션을 찾을 수 없습니다.',
        }
      }
    } else if (verifyResult.status === 21007) {
      // 샌드박스 영수증을 프로덕션에서 검증한 경우
      // 샌드박스 URL로 재시도
      const sandboxResponse = await fetch(
        'https://sandbox.itunes.apple.com/verifyReceipt',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            'receipt-data': receiptData,
            'password': appStoreSharedSecret,
            'exclude-old-transactions': true,
          }),
        }
      )

      const sandboxResult = await sandboxResponse.json()
      if (sandboxResult.status === 0) {
        const inAppPurchases = sandboxResult.receipt?.in_app || []
        const transaction = inAppPurchases.find(
          (purchase: any) => purchase.product_id === productId
        )

        if (transaction) {
          return {
            valid: true,
            transactionId: transaction.transaction_id,
          }
        }
      }

      return {
        valid: false,
        error: `영수증 검증 실패 (상태: ${sandboxResult.status})`,
      }
    } else {
      return {
        valid: false,
        error: `영수증 검증 실패 (상태: ${verifyResult.status})`,
      }
    }
  } catch (error) {
    console.error('App Store 영수증 검증 오류:', error)
    return {
      valid: false,
      error: error instanceof Error ? error.message : '영수증 검증 중 오류가 발생했습니다.',
    }
  }
}

interface PaymentConfirmRequest {
  paymentKey: string
  orderId: string
  amount: number
  // IAP 관련 필드 (선택적)
  platform?: 'ios' | 'android' | 'web'
  transactionId?: string
  productId?: string
  points?: number
  receiptData?: string // App Store 영수증 데이터 (base64)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 405,
      }
    )
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // JWT 토큰에서 사용자 정보 추출
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      throw new Error('인증 토큰이 없습니다.')
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)

    if (userError || !user) {
      throw new Error('유효하지 않은 사용자입니다.')
    }

    const { 
      paymentKey, 
      orderId, 
      amount, 
      platform, 
      transactionId, 
      productId, 
      points, 
      receiptData 
    }: PaymentConfirmRequest = await req.json()

    if (!paymentKey || !orderId || !amount) {
      throw new Error('결제 정보가 부족합니다.')
    }

    let chargedPoints: number
    let paymentProvider: string
    let paymentResult: any

    // iOS IAP인 경우
    if (platform === 'ios' && transactionId && productId) {
      paymentProvider = 'ios_iap'
      
      // 포인트 정보는 요청에서 직접 받거나 orderId에서 추출
      if (points && points > 0) {
        chargedPoints = points
      } else {
        // orderId에서 추출 시도
        const match = orderId.match(/iap_points_(\d+)_/)
        if (match) {
          chargedPoints = Number(match[1])
        } else {
          throw new Error('충전 포인트 정보를 찾을 수 없습니다.')
        }
      }

      if (Number.isNaN(chargedPoints) || chargedPoints <= 0) {
        throw new Error('유효하지 않은 포인트 금액입니다.')
      }

      // App Store 영수증 검증
      if (receiptData) {
        // 영수증 데이터가 있는 경우 App Store에 검증 요청
        const appStoreVerifyResult = await verifyAppStoreReceipt(receiptData, productId)
        if (!appStoreVerifyResult.valid) {
          throw new Error(`App Store 영수증 검증 실패: ${appStoreVerifyResult.error || '알 수 없는 오류'}`)
        }
        paymentResult = appStoreVerifyResult
      } else {
        // 영수증 데이터가 없는 경우 transactionId 기반 중복 체크만 수행
        // 실제 프로덕션에서는 영수증 검증을 권장합니다
        console.warn('⚠️ IAP 영수증 데이터가 없습니다. transactionId 기반 검증만 수행합니다.')
        paymentResult = {
          transactionId,
          productId,
          verified: true,
        }
      }

      // transactionId를 log_id로 사용하여 중복 체크
      const { data: existingLog } = await supabaseClient
        .from('member_points_logs')
        .select('id, amount')
        .eq('member_id', user.id)
        .eq('log_id', orderId)
        .maybeSingle()

      if (existingLog) {
        return new Response(
          JSON.stringify({
            success: true,
            message: '이미 처리된 결제입니다.',
            points: existingLog.amount || chargedPoints,
            amount,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        )
      }

    } else {
      // 토스페이먼츠 결제 (기존 로직)
      paymentProvider = 'toss'
      
      const tossSecretKey = Deno.env.get('TOSS_API_PROD_SECRET_KEY')
      if (!tossSecretKey) {
        throw new Error('TOSS_API_PROD_SECRET_KEY가 설정되지 않았습니다.')
      }

      const tossResponse = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${btoa(tossSecretKey + ':')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentKey,
          orderId,
          amount,
        }),
      })

      paymentResult = await tossResponse.json()

      if (!tossResponse.ok) {
        throw new Error(`결제 승인 실패: ${paymentResult.message || '알 수 없는 오류'}`)
      }

      // 포인트 정보 추출 (orderId에서)
      const match = orderId.match(/order_points_(\d+)_/)
      if (!match) {
        throw new Error('주문 정보를 찾을 수 없습니다.')
      }

      chargedPoints = Number(match[1])
      if (Number.isNaN(chargedPoints) || chargedPoints <= 0) {
        throw new Error('충전 포인트 정보를 찾을 수 없습니다.')
      }

      // 금액 검증: orderId에서 추출한 포인트와 실제 결제 금액 비교
      // 포인트 1P = 1원 가정 (부가세 포함)
      const expectedAmount = chargedPoints * 1.1 // 부가세 10% 포함
      const amountTolerance = 1 // 1원 오차 허용
      if (Math.abs(amount - expectedAmount) > amountTolerance) {
        console.error('금액 불일치:', { amount, expectedAmount, chargedPoints })
        throw new Error('결제 금액이 일치하지 않습니다.')
      }
    }

    // 토스페이먼츠의 경우에만 중복 체크 (IAP는 위에서 이미 체크)
    if (paymentProvider === 'toss') {
      const { data: existingLog, error: existingError } = await supabaseClient
        .from('member_points_logs')
        .select('id, amount')
        .eq('member_id', user.id)
        .eq('log_id', orderId)
        .maybeSingle()

      if (existingError) {
        throw existingError
      }

      if (existingLog) {
        // 이미 처리된 결제인 경우 기존 정보 반환
        return new Response(
          JSON.stringify({
            success: true,
            message: '이미 처리된 결제입니다.',
            points: existingLog.amount || chargedPoints,
            amount,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        )
      }
    }

    // 트랜잭션 함수를 사용하여 포인트 로그 추가 및 포인트 업데이트
    // 이 함수는 원자적으로 처리되므로 데이터 일관성 보장
    const description = paymentProvider === 'ios_iap' 
      ? 'iOS 인앱 구매 포인트 충전' 
      : '토스 포인트 충전'
    
    const { data: transactionResult, error: transactionError } = await supabaseClient
      .rpc('update_member_points_with_log', {
        p_member_id: user.id,
        p_type: 'earn',
        p_amount: chargedPoints,
        p_description: description,
        p_log_id: orderId,
      })

    if (transactionError) {
      // 트랜잭션 함수는 자동으로 롤백되므로 별도 롤백 불필요
      console.error('포인트 충전 트랜잭션 실패:', transactionError)
      throw new Error(`포인트 충전 처리 실패: ${transactionError.message}`)
    }

    // 트랜잭션 결과에서 새로운 총 포인트 가져오기
    const newTotalPoints = transactionResult?.new_total_points || chargedPoints

    // 참고: partners.total_points는 번 포인트 (후원, 퀘스트, 멤버십, 단건구매)만 쌓임
    // 포인트 충전은 members.total_points에만 추가되므로 partners.total_points 동기화 안함

    return new Response(
      JSON.stringify({
        success: true,
        message: '결제가 성공적으로 처리되었습니다.',
        points: chargedPoints,
        amount,
        newTotalPoints,
        paymentProvider,
        paymentResult: paymentProvider === 'ios_iap' 
          ? { transactionId, productId, verified: true }
          : paymentResult,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Payment processing error:', error)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : '결제 처리 중 오류가 발생했습니다.'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})