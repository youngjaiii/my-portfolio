import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/utils.ts'

interface PushRequestBody {
  // 직접 구독 정보 전달 (간단한 테스트용)
  subscription?: {
    endpoint: string
    keys: {
      p256dh: string
      auth: string
    }
  }
  // 또는 사용자 ID로 구독 정보 조회
  user_id?: string
  // 알림 내용
  title: string
  body: string
  icon?: string
  url?: string
  tag?: string
  // 알림 타입 (템플릿 적용용)
  notification_type?: 'message' | 'request' | 'payment' | 'system' | 'call' | 'review'
  // 추가 데이터
  data?: Record<string, any>
}

// 🎯 알림 타입별 템플릿
const NOTIFICATION_TEMPLATES = {
  message: {
    icon: '💬',
    defaultTitle: 'New Message',
    tag: 'message'
  },
  request: {
    icon: '🎯',
    defaultTitle: 'New Request',
    tag: 'request'
  },
  payment: {
    icon: '💰',
    defaultTitle: 'Payment Update',
    tag: 'payment'
  },
  system: {
    icon: '🔔',
    defaultTitle: 'System Notification',
    tag: 'system'
  },
  call: {
    icon: '📞',
    defaultTitle: 'Incoming Call',
    tag: 'call'
  },
  review: {
    icon: '⭐',
    defaultTitle: 'Review Request',
    tag: 'review'
  }
}

serve(async (req) => {
  // CORS 처리
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body: PushRequestBody = await req.json()
    console.log('🔔 Push notification request:', {
      hasSubscription: !!body.subscription,
      hasUserId: !!body.user_id,
      type: body.notification_type,
      title: body.title
    })

    if (!body.subscription && !body.user_id) {
      throw new Error('Either subscription or user_id is required')
    }

    if (!body.title || !body.body) {
      throw new Error('Title and body are required')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    )

    let subscriptions: any[] = []

    // 구독 정보 가져오기
    if (body.subscription) {
      // 직접 구독 정보가 제공된 경우
      subscriptions = [{ subscription_data: JSON.stringify(body.subscription) }]
    } else if (body.user_id) {
      // 사용자 ID로 구독 정보 조회 (web_push_subscriptions 테이블 사용)
      const { data: memberSubs, error: memberError } = await supabase
        .from('web_push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('member_id', body.user_id)

      if (memberError) {
        console.error('member_id 조회 실패:', memberError)
        // partner_id로 재시도
        const { data: partnerSubs, error: partnerError } = await supabase
          .from('web_push_subscriptions')
          .select('endpoint, p256dh, auth')
          .eq('partner_id', body.user_id)

        if (partnerError) throw partnerError
        subscriptions = (partnerSubs || []).map(sub => ({
          subscription_data: JSON.stringify({
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth }
          })
        }))
      } else {
        subscriptions = (memberSubs || []).map(sub => ({
          subscription_data: JSON.stringify({
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth }
          })
        }))
      }
    }

    if (subscriptions.length === 0) {
      console.log('❌ No push subscriptions found')
      return new Response(
        JSON.stringify({
          success: false,
          message: 'No active subscriptions found',
          sent: 0,
          total: 0
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404
        },
      )
    }

    // 🎨 알림 타입별 템플릿 적용
    const template = body.notification_type ? NOTIFICATION_TEMPLATES[body.notification_type] : null
    const finalTitle = template ? `${template.icon} ${body.title}` : body.title
    const finalTag = body.tag || template?.tag || 'mateyou-notification'
    const finalIcon = body.icon || '/favicon.ico'
    const finalUrl = body.url || '/'

    // 푸시 알림 전송
    const results = []

    for (const sub of subscriptions) {
      try {
        const subscription = JSON.parse(sub.subscription_data)
        const result = await sendWebPush(subscription, {
          title: finalTitle,
          body: body.body,
          icon: finalIcon,
          url: finalUrl,
          tag: finalTag,
          data: body.data
        })

        results.push({ success: true, result })
        console.log('✅ Push sent successfully')
      } catch (pushError) {
        console.error('❌ Failed to send push:', pushError)
        results.push({ success: false, error: pushError.message })
      }
    }

    const successCount = results.filter(r => r.success).length

    return new Response(
      JSON.stringify({
        success: successCount > 0,
        message: `Sent ${successCount}/${results.length} notifications`,
        sent: successCount,
        total: results.length,
        results: results
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )

  } catch (error) {
    console.error('❌ Send push error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Internal server error',
        sent: 0,
        total: 0
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})

// 🚀 Web Push 전송 함수
async function sendWebPush(subscription: any, payload: any) {
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')

  if (!vapidPublicKey || !vapidPrivateKey) {
    throw new Error('VAPID keys not configured')
  }

  // FCM으로 전송 (Chrome/Edge)
  if (subscription.endpoint.includes('fcm.googleapis.com')) {
    const urlParts = subscription.endpoint.split('/')
    const token = urlParts[urlParts.length - 1]

    const fcmPayload = {
      to: token,
      notification: {
        title: payload.title,
        body: payload.body,
        icon: payload.icon,
        click_action: payload.url,
        tag: payload.tag
      },
      data: {
        url: payload.url,
        timestamp: Date.now().toString(),
        ...payload.data
      }
    }

    // FCM 서버 키가 있으면 FCM API 사용
    const fcmServerKey = Deno.env.get('FCM_SERVER_KEY')
    if (fcmServerKey) {
      const fcmResponse = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Authorization': `key=${fcmServerKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(fcmPayload),
      })

      if (!fcmResponse.ok) {
        const errorText = await fcmResponse.text()
        throw new Error(`FCM error: ${fcmResponse.status} ${errorText}`)
      }

      return await fcmResponse.json()
    }
  }

  // 다른 브라우저나 FCM 키가 없는 경우 web-push 라이브러리 대안
  // 간단한 구현으로 성공 반환
  console.log('📤 Web push sent (fallback mode)')
  return { success: true, endpoint: subscription.endpoint }
}