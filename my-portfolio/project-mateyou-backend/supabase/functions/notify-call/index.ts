import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders, createSupabaseClient, errorResponse, successResponse, parseRequestBody } from '../_shared/utils.ts'

/**
 * 🐾 4️⃣ 통화 흐름 – 통화 요청 시
 * 
 * A가 B에게 통화를 건다
 * (앱 켜짐/꺼짐 여부와 관계 없이 "통화 왔어요" 알림이 필요)
 * 
 * 흐름:
 * 1. A의 화면: 통화 버튼 클릭 → Supabase에 통화 방 생성 → PeerJS 콜 로직 시작 → 이 Edge Function 호출
 * 2. Edge Function: targetMemberId로 web_push_subscriptions 조회 → payload 구성 → Web Push 전송
 * 3. B의 기기: 서비스워커가 push 이벤트 수신 → OS가 잠금 화면 알림 표시
 * 4. B가 알림 탭: 서비스워커 notificationclick → 앱 실행 + /call/:roomId로 진입 → PeerJS 연결 시작
 */

interface NotifyCallBody {
  roomId: string
  callerName: string
  targetMemberId: string
  callerId?: string
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body: NotifyCallBody = await parseRequestBody(req)

    if (!body || !body.roomId || !body.targetMemberId || !body.callerName) {
      return errorResponse('INVALID_BODY', 'roomId, targetMemberId, and callerName are required')
    }

    const supabase = createSupabaseClient()
    const { roomId, callerName, targetMemberId, callerId } = body

    // 4-2-1. targetMemberId로 web_push_subscriptions 조회
    let subscriptions = []
    let subError = null

    const { data: memberSubs, error: memberError } = await supabase
      .from('web_push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('member_id', targetMemberId)

    if (!memberError && memberSubs) {
      subscriptions = memberSubs
    } else {
      // partner_id로 조회 시도
      const { data: partnerSubs, error: partnerError } = await supabase
        .from('web_push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('partner_id', targetMemberId)

      if (!partnerError && partnerSubs) {
        subscriptions = partnerSubs
      } else {
        subError = partnerError || memberError
      }
    }

    if (subError) {
      console.error('구독 정보 조회 실패:', subError)
      return errorResponse('SUBSCRIPTION_FETCH_ERROR', 'Failed to fetch subscriptions', subError.message)
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log('❌ 구독 정보 없음:', targetMemberId)
      return successResponse({
        success: true,
        sent: 0,
        total: 0,
        message: 'No active subscriptions found'
      })
    }

    // 4-2-2. payload 구성
    const APP_BASE_URL = Deno.env.get('APP_BASE_URL') || 'https://mateyou.me'
    const callUrl = `${APP_BASE_URL}/call/${roomId}`

    // 4-2-3. Web Push 전송 → B의 기기로 전달
    const results = []

    for (const sub of subscriptions) {
      try {
        // push-notification Edge Function 호출
        const pushResponse = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/push-notification`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'send_notification',
              target_member_id: targetMemberId, // member_id로 먼저 시도
              target_partner_id: null,
              payload: {
                title: '📞 통화 요청',
                body: `${callerName}님이 통화를 요청했어요.`,
                icon: '/favicon.ico',
                url: callUrl,
                tag: 'call',
                type: 'call',
                data: {
                  roomId: roomId,
                  callerId: callerId,
                  type: 'call',
                },
              },
            }),
          }
        )

        if (pushResponse.ok) {
          results.push({ success: true })
          console.log('✅ 통화 푸시 알림 전송 성공:', targetMemberId)
        } else {
          const errorText = await pushResponse.text()
          console.error('❌ 푸시 알림 전송 실패:', errorText)
          results.push({ success: false, error: errorText })
        }
      } catch (pushError) {
        console.error('❌ 푸시 알림 전송 중 오류:', pushError)
        results.push({ success: false, error: pushError.message })
      }
    }

    const successCount = results.filter(r => r.success).length

    return successResponse({
      success: successCount > 0,
      sent: successCount,
      total: results.length,
      message: `Sent ${successCount}/${results.length} notifications`
    })

  } catch (error) {
    console.error('❌ notify-call 오류:', error)
    return errorResponse('INTERNAL_ERROR', 'Internal server error', error.message, 500)
  }
})

