import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/utils.ts'

// web-push 라이브러리 대신 직접 구현
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
    )

    const { action, member_id, partner_id, target_id, subscription_data, endpoint, p256dh, auth, user_agent, target_member_id, target_partner_id, payload } = await req.json()

    console.log(`📱 Push notification action: ${action}`)

    switch (action) {
      case 'save_subscription':
        return await saveSubscription(supabase, member_id, partner_id, endpoint, p256dh, auth, user_agent)

      case 'remove_subscription':
        return await removeSubscription(supabase, member_id, partner_id)

      case 'send_notification':
        return await sendNotification(supabase, target_member_id, target_partner_id, payload)

      default:
        throw new Error(`Unknown action: ${action}`)
    }
  } catch (error) {
    console.error('❌ Push notification error:', error)
    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
        details: error.toString()
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})

// 💾 구독 정보 저장
// web_push_subscriptions 테이블 구조: member_id (UUID) 또는 target_id (TEXT) 중 하나만 설정 가능
async function saveSubscription(supabase: any, member_id: string | null, partner_id: string | null, endpoint: string, p256dh: string, auth: string, user_agent: string) {
  console.log('📥 saveSubscription 호출:', {
    member_id: member_id || null,
    partner_id: partner_id || null,
    endpoint: endpoint.substring(0, 50) + '...',
    hasP256dh: !!p256dh,
    hasAuth: !!auth,
  })

  // member_id 또는 partner_id 중 하나만 있어야 함
  if (!member_id && !partner_id) {
    console.error('❌ member_id와 partner_id가 모두 없습니다.')
    throw new Error('Either member_id or partner_id is required')
  }
  if (member_id && partner_id) {
    console.error('❌ member_id와 partner_id가 모두 있습니다.')
    throw new Error('Only one of member_id or partner_id can be provided')
  }

  // target_id 결정: partner_id가 있으면 target_id로 사용 (TEXT 타입)
  const target_id = partner_id ? partner_id : null

  // endpoint로 기존 구독 찾기 (같은 기기에서 재등록 방지)
  let existing = null
  try {
    let existingQuery = supabase
      .from('web_push_subscriptions')
      .select('id')
      .eq('endpoint', endpoint)
      .limit(1)

    if (member_id) {
      existingQuery = existingQuery.eq('member_id', member_id)
    } else if (target_id) {
      existingQuery = existingQuery.eq('target_id', target_id)
    }

    const { data, error: queryError, status, statusText } = await existingQuery.maybeSingle()
    
    console.log('🔍 기존 구독 조회 결과:', {
      hasData: !!data,
      error: queryError ? {
        code: queryError.code,
        message: queryError.message,
        details: queryError.details,
        hint: queryError.hint
      } : null,
      status,
      statusText
    })
    
    if (queryError) {
      // PGRST116은 데이터 없음 (정상)
      if (queryError.code === 'PGRST116') {
        console.log('ℹ️ 기존 구독 없음 (정상)')
        existing = null
      } else if (status === 406) {
        // 406 에러는 무시하고 계속 진행
        console.warn('⚠️ 406 에러 발생 (기존 구독 조회), 계속 진행합니다.')
        existing = null
      } else {
        console.error('❌ 기존 구독 조회 실패:', {
          code: queryError.code,
          message: queryError.message,
          details: queryError.details,
          hint: queryError.hint,
          status,
          statusText
        })
        throw queryError
      }
    } else {
      existing = data
      console.log('🔍 기존 구독 조회 성공:', existing ? `ID: ${existing.id}` : '없음')
    }
  } catch (err: any) {
    console.error('❌ 기존 구독 조회 예외:', {
      message: err?.message,
      stack: err?.stack,
      name: err?.name,
      status: err?.status,
      error: err
    })
    // 406 에러는 무시하고 계속 진행
    if (err?.status === 406) {
      console.warn('⚠️ 406 에러 발생, 계속 진행합니다.')
      existing = null
    } else {
      throw err
    }
  }

  const subscriptionData: any = {
    endpoint,
    p256dh,
    auth,
    user_agent,
    last_used_at: new Date().toISOString(),
  }

  // web_push_subscriptions 테이블 구조에 맞게 설정
  // member_id 또는 target_id 중 하나만 설정 (CHECK 제약조건에 의해)
  if (member_id) {
    subscriptionData.member_id = member_id
    // target_id는 설정하지 않음
  } else if (target_id) {
    // partner_id인 경우 target_id에 저장 (TEXT 타입)
    subscriptionData.target_id = target_id
    // member_id는 설정하지 않음
  }

  let data, error
  if (existing) {
    // 기존 구독 업데이트
    console.log('🔄 기존 구독 업데이트 시도...')
    const { data: updated, error: updateError } = await supabase
      .from('web_push_subscriptions')
      .update(subscriptionData)
      .eq('id', existing.id)
      .select()
      .single()
    data = updated
    error = updateError
    
    if (error) {
      console.error('❌ 구독 업데이트 실패:', error)
    } else {
      console.log('✅ 구독 업데이트 성공:', updated?.id)
    }
  } else {
    // 새 구독 생성
    console.log('➕ 새 구독 생성 시도...')
    const { data: inserted, error: insertError } = await supabase
      .from('web_push_subscriptions')
      .insert(subscriptionData)
      .select()
      .single()
    data = inserted
    error = insertError
    
    if (error) {
      console.error('❌ 구독 생성 실패:', error)
      console.error('❌ 구독 데이터:', JSON.stringify(subscriptionData, null, 2))
    } else {
      console.log('✅ 구독 생성 성공:', inserted?.id)
    }
  }

  if (error) {
    console.error('❌ 최종 에러:', error)
    throw error
  }

  const ownerId = member_id || partner_id
  console.log('💾 Push subscription saved:', ownerId, 'ID:', data?.id)
  return new Response(
    JSON.stringify({ success: true, data }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  )
}

// 🗑️ 구독 정보 삭제
async function removeSubscription(supabase: any, member_id: string | null, partner_id: string | null) {
  if (!member_id && !partner_id) {
    throw new Error('Either member_id or partner_id is required')
  }

  // target_id 결정: partner_id가 있으면 target_id로 사용
  const target_id = partner_id ? partner_id : null

  try {
    let query = supabase.from('web_push_subscriptions').delete()

    if (member_id) {
      query = query.eq('member_id', member_id)
    } else if (target_id) {
      query = query.eq('target_id', target_id)
    }

    const { error, status, statusText } = await query

    console.log('🗑️ 구독 삭제 시도:', {
      member_id,
      partner_id,
      target_id,
      error: error ? {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      } : null,
      status,
      statusText
    })

    if (error) {
      // 406 에러는 무시하고 계속 진행
      if (status === 406) {
        console.warn('⚠️ 406 에러 발생 (구독 삭제), 계속 진행합니다.')
      } else {
        console.error('❌ 구독 삭제 실패:', error)
        throw error
      }
    }
  } catch (err: any) {
    console.error('❌ 구독 삭제 예외:', {
      message: err?.message,
      stack: err?.stack,
      name: err?.name,
      status: err?.status,
      error: err
    })
    // 406 에러는 무시하고 계속 진행
    if (err?.status === 406) {
      console.warn('⚠️ 406 에러 발생, 계속 진행합니다.')
    } else {
      throw err
    }
  }

  const ownerId = member_id || partner_id
  console.log('🗑️ Push subscription removed:', ownerId)
  return new Response(
    JSON.stringify({ success: true }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  )
}

// 🔔 푸시 알림 전송
async function sendNotification(supabase: any, target_member_id: string | null, target_partner_id: string | null, payload: PushPayload) {
  if (!target_member_id && !target_partner_id) {
    throw new Error('Either target_member_id or target_partner_id is required')
  }

  // target_id 결정: target_partner_id가 있으면 target_id로 사용
  const target_id = target_partner_id ? target_partner_id : null

  // 대상 사용자의 구독 정보 조회
  // member_id 또는 target_id로 조회 (둘 다 시도)
  let subscriptions = []
  try {
    let query = supabase
      .from('web_push_subscriptions')
      .select('id, endpoint, p256dh, auth, member_id, target_id')

    if (target_member_id) {
      query = query.eq('member_id', target_member_id)
    } else if (target_id) {
      query = query.eq('target_id', target_id)
    }

    const { data, error, status, statusText } = await query

    console.log('🔍 푸시 알림 대상 구독 조회 결과:', {
      target_member_id,
      target_partner_id,
      subscriptionCount: data?.length || 0,
      error: error ? {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      } : null,
      status,
      statusText
    })

    if (error) {
      // 406 에러는 빈 배열로 처리
      if (status === 406) {
        console.warn('⚠️ 406 에러 발생 (푸시 알림 대상 조회), 빈 배열로 처리합니다.')
        subscriptions = []
      } else {
        console.error('❌ 푸시 알림 대상 조회 실패:', error)
        throw error
      }
    } else {
      subscriptions = data || []
    }
  } catch (err: any) {
    console.error('❌ 푸시 알림 대상 조회 예외:', {
      message: err?.message,
      stack: err?.stack,
      name: err?.name,
      status: err?.status,
      error: err
    })
    // 406 에러는 빈 배열로 처리
    if (err?.status === 406) {
      console.warn('⚠️ 406 에러 발생, 빈 배열로 처리합니다.')
      subscriptions = []
    } else {
      throw err
    }
  }

  if (!subscriptions || subscriptions.length === 0) {
    const targetId = target_member_id || target_partner_id
    console.log('❌ No push subscription found:', targetId)
    return new Response(
      JSON.stringify({ success: false, message: 'No subscription found' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }

  // last_used_at 업데이트
  const subscriptionIds = subscriptions.map((s: any) => s.id)
  await supabase
    .from('web_push_subscriptions')
    .update({ last_used_at: new Date().toISOString() })
    .in('id', subscriptionIds)
    .catch((err) => console.error('Failed to update last_used_at:', err))

  const results = []

  for (const sub of subscriptions) {
    try {
      // DB에서 가져온 필드를 PushSubscription 형식으로 변환
      const subscription: PushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      }
      const result = await sendWebPush(subscription, payload)
      results.push({ success: true, result })
      console.log('✅ Push sent to:', subscription.endpoint.substring(0, 50) + '...')
    } catch (pushError) {
      console.error('❌ Failed to send push:', pushError)
      results.push({ success: false, error: pushError.message })
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      sent: results.filter(r => r.success).length,
      total: results.length,
      results
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  )
}

// 🚀 Web Push 전송 (FCM 우선, 실패 시 web-push 시도)
async function sendWebPush(subscription: PushSubscription, payload: PushPayload) {
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')

  if (!vapidPublicKey || !vapidPrivateKey) {
    throw new Error('VAPID keys not configured')
  }

  // 푸시 알림 페이로드 생성 (서비스워커에서 사용할 형식)
  const pushPayload = {
    title: payload.title,
    body: payload.body,
    icon: payload.icon || '/favicon.ico',
    url: payload.url || '/',
    tag: payload.tag || 'mateyou-message',
    type: payload.type || 'message',
    ...(payload.data || {}),
  }

  // 1. FCM 우선 시도 (Chrome/Edge)
  if (subscription.endpoint.includes('fcm.googleapis.com')) {
    try {
      return await sendViaFCM(subscription, payload)
    } catch (fcmError) {
      console.warn('FCM 전송 실패, web-push 시도:', fcmError)
      // FCM 실패 시 web-push로 fallback
    }
  }

  // 2. web-push 라이브러리 사용 (모든 브라우저)
  try {
    // Deno에서 web-push 사용을 위해 esm.sh 사용
    const webPush = await import('https://esm.sh/web-push@3.6.6')
    
    // VAPID 키 설정
    webPush.setVapidDetails(
      `mailto:${Deno.env.get('VAPID_EMAIL') || 'noreply@mateyou.me'}`,
      vapidPublicKey,
      vapidPrivateKey
    )

    // 푸시 전송
    const result = await webPush.sendNotification(subscription, JSON.stringify(pushPayload))
    
    console.log('✅ Web Push 전송 성공 (web-push):', subscription.endpoint.substring(0, 50) + '...')
    return result
  } catch (error) {
    console.error('❌ Web Push 전송 실패:', error)
    throw error
  }
}

// FCM fallback (Chrome/Edge용)
async function sendViaFCM(subscription: PushSubscription, payload: PushPayload) {
  const fcmServerKey = Deno.env.get('FCM_SERVER_KEY')
  if (!fcmServerKey) {
    throw new Error('FCM_SERVER_KEY not configured for fallback')
  }

  const urlParts = subscription.endpoint.split('/')
  const token = urlParts[urlParts.length - 1]

  const fcmPayload = {
    to: token,
    notification: {
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/favicon.ico',
      click_action: payload.url || '/',
      tag: payload.tag || 'mateyou-message'
    },
    data: {
      url: payload.url || '/',
      timestamp: Date.now().toString(),
      type: payload.type || 'message',
      ...(payload.data || {}),
    }
  }

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