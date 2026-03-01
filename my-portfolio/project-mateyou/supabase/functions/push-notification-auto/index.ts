import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// CORS headers for API responses
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

// web-push 라이브러리
interface PushSubscription {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

interface PushPayload {
  title: string
  body: string
  icon?: string
  url?: string
  tag?: string
  type?: string
  data?: Record<string, any>
}

serve(async (req) => {
  // CORS 헤더 처리
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    const body = await req.json()
    const { target_id, notification_type, title, body: bodyText, url, data } = body

    if (!target_id) {
      return new Response(
        JSON.stringify({ error: 'target_id is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    console.log('🔔 자동 푸시 알림 요청:', {
      target_id,
      notification_type,
      title,
    })

    // target_id로 web_push_subscriptions 조회
    // target_id는 TEXT 타입이고, member_id는 UUID 타입
    // target_id와 member_id 둘 다 조회 (target_id가 member_id와 같을 수도 있음)
    const { data: subscriptions, error: subError } = await supabase
      .from('web_push_subscriptions')
      .select('id, endpoint, p256dh, auth, member_id, target_id')
      .or(`target_id.eq.${target_id},member_id.eq.${target_id}`)

    if (subError) {
      console.error('❌ 구독 정보 조회 실패:', subError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch subscriptions', details: subError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    if (!subscriptions || subscriptions.length === 0) {
      console.log('ℹ️ target_id에 대한 구독 정보가 없습니다:', target_id)
      return new Response(
        JSON.stringify({ success: false, message: 'No subscriptions found for target_id' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // 푸시 알림 페이로드 생성
    const pushPayload: PushPayload = {
      title: title || '새로운 알림',
      body: bodyText || '새로운 업데이트가 있습니다',
      icon: '/favicon.ico',
      url: url || '/',
      tag: notification_type || 'system',
      type: notification_type || 'system',
      data: data || {},
    }

    // web-push 라이브러리 사용
    const webPush = await import('https://esm.sh/web-push@3.6.6')
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
    const vapidEmail = Deno.env.get('VAPID_EMAIL') || 'noreply@mateyou.me'

    if (!vapidPublicKey || !vapidPrivateKey) {
      throw new Error('VAPID keys not configured')
    }

    webPush.setVapidDetails(
      `mailto:${vapidEmail}`,
      vapidPublicKey,
      vapidPrivateKey
    )

    // 각 구독에 대해 푸시 알림 전송
    const results = []
    for (const sub of subscriptions) {
      try {
        const subscription: PushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        }

        await webPush.sendNotification(
          subscription,
          JSON.stringify(pushPayload)
        )

        // last_used_at 업데이트
        try {
          await supabase
            .from('web_push_subscriptions')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', sub.id)
        } catch (err) {
          console.error('Failed to update last_used_at:', err)
        }

        results.push({ success: true, endpoint: sub.endpoint })
        console.log('✅ 푸시 알림 전송 성공:', sub.endpoint.substring(0, 50) + '...')
      } catch (pushError: any) {
        console.error('❌ 푸시 알림 전송 실패:', pushError)

        // 만료된 구독이면 삭제
        if (pushError.statusCode === 410 || pushError.statusCode === 404) {
          try {
            await supabase
              .from('web_push_subscriptions')
              .delete()
              .eq('id', sub.id)
          } catch (err) {
            console.error('Failed to delete expired subscription:', err)
          }
        }
        
        results.push({ 
          success: false, 
          endpoint: sub.endpoint, 
          error: pushError.message 
        })
      }
    }

    const successCount = results.filter((r) => r.success).length
    const totalCount = results.length

    return new Response(
      JSON.stringify({
        success: true,
        sent: successCount,
        total: totalCount,
        results,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error: any) {
    console.error('❌ 자동 푸시 알림 오류:', error)
    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
        details: error.toString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

