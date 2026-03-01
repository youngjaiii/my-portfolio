import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PaymentConfirmRequest {
  paymentKey: string
  orderId: string
  amount: number
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

    const { paymentKey, orderId, amount }: PaymentConfirmRequest = await req.json()

    if (!paymentKey || !orderId || !amount) {
      throw new Error('결제 정보가 부족합니다.')
    }

    // 토스 페이먼트 결제 승인 요청
    // 테스트 키를 우선 사용 (개발 환경), REAL 키는 프로덕션 환경에서만 설정
    // 프로덕션 배포 시에는 TOSS_PAY_SECRET_KEY를 제거하고 TOSS_PAY_SECRET_KEY_REAL만 설정
    const tossSecretKey = Deno.env.get('TOSS_PAY_SECRET_KEY') || Deno.env.get('TOSS_PAY_SECRET_KEY_REAL')
    if (!tossSecretKey) {
      throw new Error('토스 페이먼트 설정이 없습니다.')
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

    const tossResult = await tossResponse.json()

    if (!tossResponse.ok) {
      throw new Error(`결제 승인 실패: ${tossResult.message || '알 수 없는 오류'}`)
    }

    // 포인트 정보 추출 (orderId에서)
    const match = orderId.match(/order_points_(\d+)_/)
    if (!match) {
      throw new Error('주문 정보를 찾을 수 없습니다.')
    }

    const chargedPoints = Number(match[1])
    if (Number.isNaN(chargedPoints)) {
      throw new Error('충전 포인트 정보를 찾을 수 없습니다.')
    }

    // 이미 처리된 결제인지 확인
    const { data: existingLog, error: existingError } = await supabaseClient
      .from('member_points_logs')
      .select('id')
      .eq('member_id', user.id)
      .eq('log_id', orderId)
      .maybeSingle()

    if (existingError) {
      throw existingError
    }

    if (existingLog) {
      return new Response(
        JSON.stringify({
          success: true,
          message: '이미 처리된 결제입니다.',
          points: chargedPoints,
          amount,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    // 현재 포인트 조회
    const { data: memberData, error: memberError } = await supabaseClient
      .from('members')
      .select('total_points')
      .eq('id', user.id)
      .maybeSingle()

    if (memberError) {
      throw memberError
    }

    const currentTotal = memberData?.total_points ?? 0

    // 트랜잭션으로 포인트 로그 추가 및 포인트 업데이트
    const { error: logError } = await supabaseClient
      .from('member_points_logs')
      .insert({
        member_id: user.id,
        type: 'earn',
        amount: chargedPoints,
        description: '토스 포인트 충전',
        log_id: orderId,
      })

    if (logError) {
      throw logError
    }

    const { error: updateError } = await supabaseClient
      .from('members')
      .update({ total_points: currentTotal + chargedPoints })
      .eq('id', user.id)

    if (updateError) {
      // 롤백을 위해 로그 삭제
      await supabaseClient
        .from('member_points_logs')
        .delete()
        .eq('member_id', user.id)
        .eq('log_id', orderId)

      throw updateError
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: '결제가 성공적으로 처리되었습니다.',
        points: chargedPoints,
        amount,
        tossPayment: tossResult,
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