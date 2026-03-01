import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders, createSupabaseClient, errorResponse, successResponse, parseRequestBody } from '../_shared/utils.ts'
import * as jose from 'https://deno.land/x/jose@v4.14.4/index.ts'

// APNs VoIP 푸시 설정
const APNS_KEY_ID = Deno.env.get('APNS_KEY_ID') || ''
const APNS_TEAM_ID = Deno.env.get('APNS_TEAM_ID') || ''
const APNS_PRIVATE_KEY = Deno.env.get('APNS_PRIVATE_KEY') || ''
const APNS_BUNDLE_ID = Deno.env.get('APNS_BUNDLE_ID') || 'me.mateyou.app'
const APNS_ENVIRONMENT = Deno.env.get('APNS_ENVIRONMENT') || 'production'

// LiveKit 설정
const LIVEKIT_API_KEY = Deno.env.get('LIVEKIT_API_KEY') || ''
const LIVEKIT_API_SECRET = Deno.env.get('LIVEKIT_API_SECRET') || ''
const LIVEKIT_URL = Deno.env.get('LIVEKIT_URL') || 'wss://your-livekit-server.livekit.cloud'

let cachedApnsToken: { token: string; expiresAt: number } | null = null

async function getApnsToken(): Promise<string> {
  const now = Date.now()
  if (cachedApnsToken && now < cachedApnsToken.expiresAt - 60_000) {
    return cachedApnsToken.token
  }

  if (!APNS_KEY_ID || !APNS_TEAM_ID || !APNS_PRIVATE_KEY) {
    throw new Error('APNs credentials not configured')
  }

  const privateKey = APNS_PRIVATE_KEY.includes('\\n') 
    ? APNS_PRIVATE_KEY.replace(/\\n/g, '\n')
    : APNS_PRIVATE_KEY

  const ecKey = await jose.importPKCS8(privateKey, 'ES256')
  
  const issuedAt = Math.floor(now / 1000)
  const token = await new jose.SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: APNS_KEY_ID })
    .setIssuer(APNS_TEAM_ID)
    .setIssuedAt(issuedAt)
    .sign(ecKey)

  cachedApnsToken = {
    token,
    expiresAt: now + 50 * 60 * 1000,
  }

  return token
}

async function createLiveKitToken(identity: string, roomName: string): Promise<string> {
  const secret = new TextEncoder().encode(LIVEKIT_API_SECRET)
  const now = Math.floor(Date.now() / 1000)
  
  const payload = {
    iss: LIVEKIT_API_KEY,
    sub: identity,
    nbf: now,
    exp: now + 3600,
    iat: now,
    name: identity,
    video: {
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    },
  }
  
  return await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .sign(secret)
}

async function sendVoIPPush(
  deviceToken: string,
  payload: {
    caller_name: string
    caller_id: string
    room_name: string
    livekit_url: string
    livekit_token: string
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const apnsToken = await getApnsToken()
    
    const host = APNS_ENVIRONMENT === 'production'
      ? 'api.push.apple.com'
      : 'api.sandbox.push.apple.com'
    
    const url = `https://${host}/3/device/${deviceToken}`
    
    const apnsPayload = {
      aps: {
        caller_name: payload.caller_name,
        caller_id: payload.caller_id,
        room_name: payload.room_name,
        livekit_url: payload.livekit_url,
        livekit_token: payload.livekit_token,
      },
    }

    console.log(`📞 [VoIP] Sending to ${deviceToken.substring(0, 20)}...`)
    console.log(`📞 [VoIP] Room: ${payload.room_name}, Caller: ${payload.caller_name}`)
    console.log(`📞 [VoIP] Topic: ${APNS_BUNDLE_ID}.voip, Host: ${host}`)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'authorization': `bearer ${apnsToken}`,
        'apns-topic': `${APNS_BUNDLE_ID}.voip`,
        'apns-push-type': 'voip',
        'apns-priority': '10',
        'apns-expiration': '0',
      },
      body: JSON.stringify(apnsPayload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ [VoIP] Push failed: ${response.status} - ${errorText}`)
      return { success: false, error: `${response.status}: ${errorText}` }
    }

    console.log('✅ [VoIP] Push sent successfully')
    return { success: true }
  } catch (error: any) {
    console.error('❌ [VoIP] Push error:', error)
    return { success: false, error: error.message }
  }
}

interface NotifyCallBody {
  roomId: string
  callerName: string
  targetMemberId: string
  callerId?: string
  callType?: 'audio' | 'video'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body: NotifyCallBody = await parseRequestBody(req)

    if (!body || !body.roomId || !body.targetMemberId || !body.callerName) {
      return errorResponse('INVALID_BODY', 'roomId, targetMemberId, and callerName are required')
    }

    const supabase = createSupabaseClient()
    const { roomId, callerName, targetMemberId, callerId, callType = 'audio' } = body
    
    const isVideoCall = callType === 'video'
    const notificationType = isVideoCall ? 'video_call' : 'call'
    const notificationTitle = isVideoCall ? '📹 영상통화 요청' : '📞 통화 요청'
    const notificationBody = `${callerName}님이 ${isVideoCall ? '영상통화를' : '통화를'} 요청했어요.`

    console.log('📞 [notify-call] Processing call notification:', { roomId, targetMemberId, callerName, callType })

    // 1. 네이티브 토큰 조회 (voip_token 포함)
    const { data: nativeTokens } = await supabase
      .from('push_native_tokens')
      .select('token, voip_token, platform')
      .eq('user_id', targetMemberId)
      .eq('is_active', true)

    console.log('📱 [notify-call] Native tokens:', JSON.stringify(nativeTokens))

    const results = []
    let voipSent = false

    // 2. iOS VoIP 푸시 발송 (CallKit 시스템 UI)
    if (nativeTokens && nativeTokens.length > 0) {
      for (const tokenRecord of nativeTokens) {
        if (tokenRecord.platform === 'ios' && tokenRecord.voip_token) {
          console.log('🍎 [notify-call] iOS with VoIP token found, sending VoIP push')
          
          // LiveKit 룸 이름 생성 (roomId 기반)
          const liveKitRoomName = `call-${roomId}`
          
          // 수신자용 LiveKit 토큰 생성
          const receiverToken = await createLiveKitToken(targetMemberId, liveKitRoomName)
          
          const voipResult = await sendVoIPPush(tokenRecord.voip_token, {
            caller_name: callerName,
            caller_id: callerId || '',
            room_name: liveKitRoomName,
            livekit_url: LIVEKIT_URL,
            livekit_token: receiverToken,
          })
          
          results.push({ type: 'voip', success: voipResult.success, error: voipResult.error })
          voipSent = voipResult.success
          
          // iOS는 VoIP만 사용, FCM 보내지 않음!
          continue
        }
        
        // Android는 기존대로 push-native 사용
        if (tokenRecord.platform === 'android') {
          console.log('🤖 [notify-call] Android device, using push-native for FCM')
          // Android FCM 처리는 아래에서 함께 처리
        }
      }
    }

    // 3. Android/웹용 push-native 호출 (iOS VoIP 성공 시 iOS FCM 건너뜀)
    const hasAndroid = nativeTokens?.some(t => t.platform === 'android')
    if (hasAndroid || !voipSent) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
        const APP_BASE_URL = Deno.env.get('APP_BASE_URL') || 'https://mateyou.me'
        const callUrl = `${APP_BASE_URL}/call/${roomId}`

        console.log('📱 [notify-call] Sending push-native notification')
        const nativeResponse = await fetch(
          `${supabaseUrl}/functions/v1/push-native`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${anonKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'enqueue_notification',
              user_id: targetMemberId,
              notification_type: notificationType,
              title: notificationTitle,
              body: notificationBody,
              url: callUrl,
              data: {
                roomId: roomId,
                callerId: callerId,
                type: notificationType,
              },
              process_immediately: true,
              skip_ios_fcm: voipSent, // VoIP 성공 시 iOS FCM 건너뜀
            }),
          }
        )

        if (nativeResponse.ok) {
          const nativeResult = await nativeResponse.json()
          console.log('✅ [notify-call] push-native success:', nativeResult)
          results.push({ type: 'native', success: true })
        } else {
          const errorText = await nativeResponse.text()
          console.warn('⚠️ [notify-call] push-native failed:', errorText)
          results.push({ type: 'native', success: false, error: errorText })
        }
      } catch (nativeError: any) {
        console.warn('⚠️ [notify-call] push-native error:', nativeError)
        results.push({ type: 'native', success: false, error: nativeError.message })
      }
    }

    // 4. 웹 푸시 전송
    let subscriptions = []
    const { data: memberSubs } = await supabase
      .from('web_push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('member_id', targetMemberId)

    if (memberSubs) {
      subscriptions = memberSubs
    } else {
      const { data: partnerSubs } = await supabase
        .from('web_push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('partner_id', targetMemberId)

      if (partnerSubs) {
        subscriptions = partnerSubs
      }
    }

    const APP_BASE_URL = Deno.env.get('APP_BASE_URL') || 'https://mateyou.me'
    const callUrl = `${APP_BASE_URL}/call/${roomId}`
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')

    for (const sub of subscriptions) {
      try {
        console.log('🌐 [notify-call] Sending web push')
        const pushResponse = await fetch(
          `${supabaseUrl}/functions/v1/push-notification`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${anonKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'send_notification',
              target_member_id: targetMemberId,
              target_partner_id: null,
              payload: {
                title: notificationTitle,
                body: notificationBody,
                icon: '/favicon.ico',
                url: callUrl,
                tag: notificationType,
                type: notificationType,
                data: {
                  roomId: roomId,
                  callerId: callerId,
                  type: notificationType,
                },
              },
            }),
          }
        )

        if (pushResponse.ok) {
          results.push({ type: 'web', success: true })
          console.log('✅ [notify-call] Web push sent')
        } else {
          const errorText = await pushResponse.text()
          console.error('❌ [notify-call] Web push failed:', errorText)
          results.push({ type: 'web', success: false, error: errorText })
        }
      } catch (pushError: any) {
        console.error('❌ [notify-call] Web push error:', pushError)
        results.push({ type: 'web', success: false, error: pushError.message })
      }
    }

    const successCount = results.filter(r => r.success).length

    return successResponse({
      success: successCount > 0,
      sent: successCount,
      total: results.length,
      voipSent,
      message: `Sent ${successCount}/${results.length} notifications`
    })

  } catch (error: any) {
    console.error('❌ notify-call error:', error)
    return errorResponse('INTERNAL_ERROR', 'Internal server error', error.message, 500)
  }
})
