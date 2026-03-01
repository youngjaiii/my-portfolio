import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import * as jose from 'https://deno.land/x/jose@v4.14.4/index.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// LiveKit 설정 (환경 변수로 설정 필요)
const LIVEKIT_API_KEY = Deno.env.get('LIVEKIT_API_KEY') || ''
const LIVEKIT_API_SECRET = Deno.env.get('LIVEKIT_API_SECRET') || ''
const LIVEKIT_URL = Deno.env.get('LIVEKIT_URL') || 'wss://your-livekit-server.livekit.cloud'

// APNs VoIP 푸시 설정
const APNS_KEY_ID = Deno.env.get('APNS_KEY_ID') || ''
const APNS_TEAM_ID = Deno.env.get('APNS_TEAM_ID') || ''
const APNS_PRIVATE_KEY = Deno.env.get('APNS_PRIVATE_KEY') || ''
const APNS_BUNDLE_ID = Deno.env.get('APNS_BUNDLE_ID') || 'me.mateyou.app'
const APNS_ENVIRONMENT = Deno.env.get('APNS_ENVIRONMENT') || 'production' // 'development' or 'production'

// FCM v1 API 설정
const FCM_V1_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
const FCM_V1_DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token'
const FCM_V1_BASE_URL = 'https://fcm.googleapis.com/v1'

type FcmServiceAccount = {
  project_id: string
  client_email: string
  private_key: string
  token_uri?: string
}

const fcmServiceAccount = loadFcmServiceAccount()
const textEncoder = new TextEncoder()

// APNs/FCM 캐시
let cachedApnsToken: { token: string; expiresAt: number } | null = null
let cachedFcmAccessToken: { token: string; expiresAt: number } | null = null
let fcmCryptoKeyPromise: Promise<CryptoKey> | null = null

// Base64URL encoding function (URL-safe base64)
function base64UrlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function loadFcmServiceAccount(): FcmServiceAccount | null {
  // base64로 인코딩된 값 먼저 시도
  const base64Raw = Deno.env.get('FCM_SERVICE_ACCOUNT_BASE64')
  if (base64Raw) {
    try {
      const decoded = atob(base64Raw)
      const parsed = JSON.parse(decoded)
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        return {
          project_id: parsed.project_id,
          client_email: parsed.client_email,
          private_key: normalizePrivateKey(parsed.private_key),
          token_uri: parsed.token_uri || FCM_V1_DEFAULT_TOKEN_URI,
        }
      }
    } catch (error) {
      console.error('Failed to decode base64 FCM service account:', error)
    }
  }

  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT')
  if (!raw) return null

  try {
    let cleaned = raw.trim()
    if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || 
        (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
      cleaned = cleaned.slice(1, -1)
    }
    cleaned = cleaned.replace(/\\"/g, '"').replace(/\\'/g, "'")
    
    const parsed = JSON.parse(cleaned)
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
      console.error('Invalid FCM service account: missing required fields')
      return null
    }

    return {
      project_id: parsed.project_id,
      client_email: parsed.client_email,
      private_key: normalizePrivateKey(parsed.private_key),
      token_uri: parsed.token_uri || FCM_V1_DEFAULT_TOKEN_URI,
    }
  } catch (error) {
    console.error('Failed to parse FCM service account:', error)
    return null
  }
}

function normalizePrivateKey(key: string): string {
  return key.includes('\\n') ? key.replace(/\\n/g, '\n') : key
}

async function getFcmAccessToken(serviceAccount: FcmServiceAccount): Promise<string> {
  const now = Date.now()
  if (cachedFcmAccessToken && now < cachedFcmAccessToken.expiresAt - 60_000) {
    return cachedFcmAccessToken.token
  }

  const assertion = await createFcmSignedJwt(serviceAccount)

  const response = await fetch(serviceAccount.token_uri || FCM_V1_DEFAULT_TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Failed to obtain FCM access token: ${text}`)
  }

  const data = await response.json()
  const expiresInMs = ((data.expires_in ?? 3600) - 60) * 1000
  cachedFcmAccessToken = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(expiresInMs, 60_000),
  }

  return cachedFcmAccessToken.token
}

async function createFcmSignedJwt(serviceAccount: FcmServiceAccount): Promise<string> {
  const header = base64UrlEncode(textEncoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const issuedAt = Math.floor(Date.now() / 1000)
  const payload = base64UrlEncode(
    textEncoder.encode(
      JSON.stringify({
        iss: serviceAccount.client_email,
        scope: FCM_V1_SCOPE,
        aud: serviceAccount.token_uri || FCM_V1_DEFAULT_TOKEN_URI,
        iat: issuedAt,
        exp: issuedAt + 3600,
      }),
    ),
  )
  const unsignedToken = `${header}.${payload}`

  const key = await getFcmCryptoKey(serviceAccount)
  const signatureBuffer = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, textEncoder.encode(unsignedToken))
  const signature = base64UrlEncode(new Uint8Array(signatureBuffer))

  return `${unsignedToken}.${signature}`
}

async function getFcmCryptoKey(serviceAccount: FcmServiceAccount): Promise<CryptoKey> {
  if (!fcmCryptoKeyPromise) {
    const keyData = pemToArrayBuffer(serviceAccount.private_key)
    fcmCryptoKeyPromise = crypto.subtle.importKey(
      'pkcs8',
      keyData,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    )
  }
  return fcmCryptoKeyPromise
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const cleaned = pem.replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replace(/\s+/g, '')
  const binaryString = atob(cleaned)
  const len = binaryString.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}

interface VideoGrant {
  roomCreate?: boolean
  roomList?: boolean
  roomRecord?: boolean
  roomAdmin?: boolean
  roomJoin?: boolean
  room?: string
  canPublish?: boolean
  canSubscribe?: boolean
  canPublishData?: boolean
  canPublishSources?: string[]
  canUpdateOwnMetadata?: boolean
  ingressAdmin?: boolean
  hidden?: boolean
  recorder?: boolean
  agent?: boolean
}

interface ClaimGrants {
  identity?: string
  name?: string
  video?: VideoGrant
  metadata?: string
  sha256?: string
}

// LiveKit JWT 토큰 생성
async function createToken(
  apiKey: string,
  apiSecret: string,
  grants: ClaimGrants,
  ttl: number = 3600 // 1시간
): Promise<string> {
  const secret = new TextEncoder().encode(apiSecret)

  const now = Math.floor(Date.now() / 1000)

  const payload = {
    iss: apiKey,
    sub: grants.identity,
    nbf: now,
    exp: now + ttl,
    iat: now,
    name: grants.name,
    video: grants.video,
    metadata: grants.metadata,
    sha256: grants.sha256,
  }

  const token = await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .sign(secret)

  return token
}

// APNs JWT 토큰 생성
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
    expiresAt: now + 50 * 60 * 1000, // 50분 (APNs 토큰은 60분 유효)
  }

  return token
}

// VoIP 푸시 전송
async function sendVoIPPush(
  deviceToken: string,
  payload: {
    caller_name: string
    caller_id: string
    room_name: string
    livekit_url: string
    livekit_token: string
    call_type: string
  },
  apnsEnv: 'sandbox' | 'production' = 'production'
): Promise<{ success: boolean; error?: string }> {
  try {
    const apnsToken = await getApnsToken()

    const host = apnsEnv === 'production'
      ? 'api.push.apple.com'
      : 'api.sandbox.push.apple.com'

    const url = `https://${host}/3/device/${deviceToken}`

    const callTypeLabel = payload.call_type === 'video' ? '영상' : '음성'
    const apnsPayload = {
      aps: {
        alert: {
          title: `📞 ${callTypeLabel}통화`,
          body: `${payload.caller_name}님의 ${callTypeLabel}통화`,
        },
        sound: 'default',
        caller_name: payload.caller_name,
        caller_id: payload.caller_id,
        room_name: payload.room_name,
        livekit_url: payload.livekit_url,
        livekit_token: payload.livekit_token,
        call_type: payload.call_type,
      },
    }

    console.log(`📞 Sending VoIP push to ${deviceToken.substring(0, 20)}...`)

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
      console.error(`❌ VoIP push failed: ${response.status} - ${errorText}`)
      return { success: false, error: errorText }
    }

    console.log('✅ VoIP push sent successfully')
    return { success: true }
  } catch (error: any) {
    console.error('❌ VoIP push error:', error)
    return { success: false, error: error.message }
  }
}

// FCM v1 API로 통화 알림 전송 (Android 시스템 통화 UI 용)
async function sendFcmCallNotification(
  fcmToken: string,
  payload: {
    caller_name: string
    caller_id: string
    room_name: string
    livekit_url: string
    livekit_token: string
    call_type: string
  }
): Promise<{ success: boolean; error?: string }> {
  if (!fcmServiceAccount) {
    console.log('⚠️ FCM_SERVICE_ACCOUNT not configured')
    return { success: false, error: 'FCM not configured' }
  }

  try {
    const accessToken = await getFcmAccessToken(fcmServiceAccount)
    const url = `${FCM_V1_BASE_URL}/projects/${fcmServiceAccount.project_id}/messages:send`

    // data-only 메시지 (notification 필드 없음 - 항상 onMessageReceived 호출됨)
    const message = {
      token: fcmToken,
      data: {
        type: 'livekit-call',
        caller_id: payload.caller_id,
        caller_name: payload.caller_name,
        room_name: payload.room_name,
        livekit_url: payload.livekit_url,
        livekit_token: payload.livekit_token,
        callType: payload.call_type,
        show_system_ui: 'true',
      },
      android: {
        priority: 'high',
        ttl: '60s',
      },
    }

    console.log(`📱 Sending FCM v1 call notification to ${fcmToken.substring(0, 20)}...`)

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    })

    if (!response.ok) {
      const errorPayload = await response.json().catch(async () => {
        const text = await response.text()
        return { error: { message: text } }
      })
      const errorMessage = errorPayload?.error?.message || 'Unknown FCM v1 error'
      console.error(`❌ FCM v1 send failed: ${response.status} - ${errorMessage}`)
      return { success: false, error: errorMessage }
    }

    console.log('✅ FCM v1 call notification sent successfully')
    return { success: true }
  } catch (error: any) {
    console.error('❌ FCM v1 send error:', error)
    return { success: false, error: error.message }
  }
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const pathParts = url.pathname.split('/').filter(Boolean)
    // /functions/v1/api-livekit/room -> action='room', subAction=null
    // /functions/v1/api-livekit/room/end -> action='room', subAction='end'
    // /functions/v1/api-livekit/token -> action='token', subAction=null
    const lastPart = pathParts[pathParts.length - 1]
    const secondLastPart = pathParts[pathParts.length - 2]

    let action: string
    let subAction: string | null = null

    if (lastPart === 'end' && secondLastPart === 'room') {
      action = 'room'
      subAction = 'end'
    } else {
      action = lastPart
    }

    console.log('🔍 [api-livekit] Path:', { pathParts, action, subAction })

    // 인증 확인
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 인증된 유저 정보 조회용 클라이언트 (RLS 적용)
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // DB 쓰기 작업용 클라이언트 (RLS 우회)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // API 키 확인
    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      return new Response(
        JSON.stringify({ error: 'LiveKit not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ============ VoIP 토큰 저장 ============
    if (action === 'voip-token' && req.method === 'POST') {
      const body = await req.json()
      const { token, device_id, apns_env } = body

      if (!token) {
        return new Response(
          JSON.stringify({ error: 'token is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // voip_tokens 테이블에 저장 (없으면 push_native_tokens 사용)
      const { data: existing } = await supabase
        .from('push_native_tokens')
        .select('id')
        .eq('user_id', user.id)
        .eq('platform', 'ios')
        .maybeSingle()

      const tokenPayload = {
        user_id: user.id,
        device_id: device_id || 'unknown',
        platform: 'ios',
        voip_token: token,
        apns_env: apns_env || 'production', // sandbox or production
        is_active: true,
        updated_at: new Date().toISOString(),
      }

      if (existing) {
        await supabase
          .from('push_native_tokens')
          .update(tokenPayload)
          .eq('id', existing.id)
      } else {
        await supabase.from('push_native_tokens').insert({
          ...tokenPayload,
          token: '', // FCM 토큰은 별도로 저장
        })
      }

      console.log(`📱 VoIP token saved for user ${user.id}, apns_env: ${apns_env || 'production'}`)

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ============ 토큰 생성 (기존 룸 참여) ============
    if (action === 'token' && req.method === 'POST') {
      const body = await req.json()
      const { roomName, participantName } = body

      if (!roomName) {
        return new Response(
          JSON.stringify({ error: 'roomName is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // 사용자 정보 조회
      const { data: memberData } = await supabase
        .from('members')
        .select('name')
        .eq('id', user.id)
        .single()

      const identity = user.id
      const name = participantName || memberData?.name || 'Unknown'

      // 토큰 생성
      const token = await createToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
        identity,
        name,
        video: {
          roomJoin: true,
          room: roomName,
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
        },
      })

      return new Response(
        JSON.stringify({
          success: true,
          token,
          url: LIVEKIT_URL,
          identity,
          roomName,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ============ 새 룸 생성 (통화 시작) + VoIP 푸시 ============
    if (action === 'room' && subAction !== 'end' && req.method === 'POST') {
      const body = await req.json()
      const { partnerId, callType = 'voice' } = body

      if (!partnerId) {
        return new Response(
          JSON.stringify({ error: 'partnerId is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // 상대방이 현재 통화중인지 확인 (최근 1분 내 waiting/active 상태)
      const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000).toISOString()
      const { data: activeCallsAsPartner } = await supabase
        .from('call_rooms')
        .select('id, status')
        .eq('partner_id', partnerId)
        .in('status', ['waiting', 'active'])
        .gte('started_at', oneMinuteAgo)
        .limit(1)

      const { data: activeCallsAsMember } = await supabase
        .from('call_rooms')
        .select('id, status')
        .eq('member_id', partnerId)
        .in('status', ['waiting', 'active'])
        .gte('started_at', oneMinuteAgo)
        .limit(1)

      if ((activeCallsAsPartner && activeCallsAsPartner.length > 0) || 
          (activeCallsAsMember && activeCallsAsMember.length > 0)) {
        console.log('📞 [api-livekit] Partner is busy:', partnerId)
        return new Response(
          JSON.stringify({ 
            error: 'busy',
            message: '상대방이 통화중입니다'
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // 동시 발신 처리: 이미 상대방이 나에게 전화를 걸고 있는지 확인
      const { data: existingCallToMe } = await supabase
        .from('call_rooms')
        .select('id, room_code')
        .or(`and(partner_id.eq.${partnerId},member_id.eq.${user.id}),and(partner_id.eq.${user.id},member_id.eq.${partnerId})`)
        .eq('status', 'waiting')
        .gte('started_at', oneMinuteAgo)
        .limit(1)

      if (existingCallToMe && existingCallToMe.length > 0) {
        // 이미 상대방이 전화를 건 상태 - 그 통화에 참여하도록 유도
        console.log('📞 [api-livekit] Concurrent call detected, redirecting to existing room')
        return new Response(
          JSON.stringify({ 
            error: 'concurrent',
            message: '상대방이 이미 전화를 걸고 있습니다',
            existingRoom: existingCallToMe[0].room_code
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // 룸 이름 생성 (두 사용자 ID를 정렬하여 고유한 룸 이름 생성)
      const sortedIds = [user.id, partnerId].sort()
      const roomName = `call_${sortedIds[0]}_${sortedIds[1]}_${Date.now()}`

      // 발신자 정보 조회
      const { data: memberData } = await supabase
        .from('members')
        .select('name, role')
        .eq('id', user.id)
        .single()

      const callerName = memberData?.name || '사용자'

      // 파트너/멤버 역할 확인 (기존 api-voice-call 로직과 동일)
      const { data: callerPartnerData } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', user.id)
        .single()

      const { data: targetPartnerData } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', partnerId)
        .single()

      // call_rooms 테이블 구조:
      // partner_id → members.id (통화 상대방 - "파트너" 역할을 하는 사람)
      // member_id → members.id (일반 멤버 - "클라이언트" 역할을 하는 사람)
      let finalPartnerId: string | null = null
      let finalMemberId: string | null = null

      if (callerPartnerData) {
        // 발신자가 파트너인 경우: 발신자 = partner, 수신자 = member
        finalPartnerId = user.id    // 발신자(파트너)의 members.id
        finalMemberId = partnerId   // 수신자(멤버)의 members.id
      } else if (targetPartnerData) {
        // 수신자가 파트너인 경우: 발신자 = member, 수신자 = partner
        finalPartnerId = partnerId  // 수신자(파트너)의 members.id
        finalMemberId = user.id     // 발신자(멤버)의 members.id
      } else {
        // 둘 다 일반 멤버인 경우 (member to member)
        // partner_id에 수신자, member_id에 발신자
        finalPartnerId = partnerId
        finalMemberId = user.id
      }

      console.log('📞 [api-livekit] Call room setup:', {
        caller: user.id,
        callerIsPartner: !!callerPartnerData,
        receiver: partnerId,
        receiverIsPartner: !!targetPartnerData,
        finalPartnerId,
        finalMemberId,
      })

      // 발신자 토큰 생성
      const callerToken = await createToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
        identity: user.id,
        name: callerName,
        video: {
          roomCreate: true,
          roomJoin: true,
          room: roomName,
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
        },
      })

      // 수신자 토큰 생성 (VoIP 푸시에 포함)
      const { data: receiverData } = await supabase
        .from('members')
        .select('name')
        .eq('id', partnerId)
        .single()

      const receiverName = receiverData?.name || 'Unknown'

      const receiverToken = await createToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
        identity: partnerId,
        name: receiverName,
        video: {
          roomJoin: true,
          room: roomName,
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
        },
      })

      // DB에 통화 기록 저장
      const { data: roomData, error: roomError } = await supabase.from('call_rooms').insert({
        room_code: roomName,
        member_id: finalMemberId,
        partner_id: finalPartnerId,
        status: 'waiting',
        started_at: new Date().toISOString(),
        topic: `${callerName}님과의 ${callType === 'video' ? '영상' : '음성'} 통화`,
      }).select().single()

      if (roomError) {
        console.error('❌ [api-livekit] Failed to insert call_rooms:', roomError)
      } else {
        console.log('✅ [api-livekit] Call room created:', roomData?.id)
      }

      // 발신자를 call_participants에 추가
      if (roomData) {
        const callerParticipant: any = {
          room_id: roomData.id,
          partner_id: finalPartnerId,
          member_id: finalMemberId,
          joined_at: new Date().toISOString(),
          connection_quality: 'good',
        }

        if (callerPartnerData) {
          callerParticipant.actual_partner_id = callerPartnerData.id
          callerParticipant.actual_member_id = null
          callerParticipant.participant_type = 'partner'
        } else {
          callerParticipant.actual_member_id = user.id
          callerParticipant.actual_partner_id = null
          callerParticipant.participant_type = 'member'
        }

        const { error: participantError } = await supabase.from('call_participants').insert(callerParticipant)
        if (participantError) {
          console.error('❌ [api-livekit] Failed to insert call_participants:', participantError)
        }
      }

      // ============ VoIP 푸시 발송 (iOS 수신자) ============
      let voipPushResult = { success: false, error: 'No VoIP token' }

      const { data: receiverTokens } = await supabase
        .from('push_native_tokens')
        .select('voip_token, apns_env')
        .eq('user_id', partnerId)
        .eq('platform', 'ios')
        .eq('is_active', true)
        .not('voip_token', 'is', null)

      if (receiverTokens && receiverTokens.length > 0) {
        for (const tokenRecord of receiverTokens) {
          if (tokenRecord.voip_token) {
            const apnsEnv = (tokenRecord.apns_env === 'sandbox' ? 'sandbox' : 'production') as 'sandbox' | 'production'
            console.log(`📞 Sending VoIP push, apns_env: ${apnsEnv}`)
            voipPushResult = await sendVoIPPush(
              tokenRecord.voip_token,
              {
                caller_name: callerName,
                caller_id: user.id,
                room_name: roomName,
                livekit_url: LIVEKIT_URL,
                livekit_token: receiverToken,
                call_type: callType,
              },
              apnsEnv
            )
            if (voipPushResult.success) break
          }
        }
      }

      // ============ FCM 푸시 발송 (Android 수신자) ============
      let fcmPushResult = { success: false, error: 'No FCM token' }
      
      const { data: androidTokens } = await supabase
        .from('push_native_tokens')
        .select('token')
        .eq('user_id', partnerId)
        .eq('platform', 'android')
        .eq('is_active', true)
        .not('token', 'is', null)

      if (androidTokens && androidTokens.length > 0) {
        console.log(`📱 Found ${androidTokens.length} Android FCM tokens for receiver`)
        for (const tokenRecord of androidTokens) {
          if (tokenRecord.token) {
            fcmPushResult = await sendFcmCallNotification(tokenRecord.token, {
              caller_name: callerName,
              caller_id: user.id,
              room_name: roomName,
              livekit_url: LIVEKIT_URL,
              livekit_token: receiverToken,
              call_type: callType,
            })
            console.log(`📱 FCM send result:`, fcmPushResult)
            if (fcmPushResult.success) break
          }
        }
      } else {
        console.log('📱 No Android FCM tokens found for receiver')
      }

      return new Response(
        JSON.stringify({
          success: true,
          token: callerToken,
          url: LIVEKIT_URL,
          roomName,
          callerId: user.id,
          receiverId: partnerId,
          voipPushSent: voipPushResult.success,
          fcmPushSent: fcmPushResult.success,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ============ 통화 종료 ============
    if (action === 'room' && subAction === 'end' && req.method === 'POST') {
      const body = await req.json()
      const { roomName, partnerId } = body

      console.log('📴 [api-livekit] Ending call - roomName:', roomName, 'partnerId:', partnerId, 'userId:', user.id)

      // iOS 수신자에게 통화 취소 VoIP 푸시 전송
      if (partnerId) {
        const { data: receiverTokens } = await supabase
          .from('push_native_tokens')
          .select('voip_token, apns_env')
          .eq('user_id', partnerId)
          .eq('platform', 'ios')
          .eq('is_active', true)
          .not('voip_token', 'is', null)

        if (receiverTokens && receiverTokens.length > 0) {
          for (const tokenRecord of receiverTokens) {
            if (tokenRecord.voip_token) {
              const apnsEnv = (tokenRecord.apns_env === 'sandbox' ? 'sandbox' : 'production') as 'sandbox' | 'production'
              console.log(`📴 Sending call-cancel VoIP push to partner, apns_env: ${apnsEnv}`)
              await sendVoIPPush(
                tokenRecord.voip_token,
                {
                  caller_name: user.name || '통화 종료',
                  caller_id: user.id,
                  room_name: roomName || '',
                  livekit_url: '',
                  livekit_token: '',
                  call_type: 'cancel', // 통화 취소 타입
                },
                apnsEnv
              )
            }
          }
        }
      }








      let query = supabase

        .from('call_rooms')
        .update({
          status: 'ended',
          ended_at: new Date().toISOString(),
        })

      if (roomName) {
        // roomName이 있으면 해당 room 종료
        query = query.eq('room_code', roomName)
      } else {
        // roomName이 없으면 현재 사용자의 최근 waiting/active 상태 room 종료
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
        
        // 먼저 종료할 room 조회
        const { data: roomsToEnd } = await supabase
          .from('call_rooms')
          .select('id, room_code')
          .or(`member_id.eq.${user.id},partner_id.eq.${user.id}`)
          .in('status', ['waiting', 'active'])
          .gte('started_at', oneHourAgo)
          .order('started_at', { ascending: false })
          .limit(5)

        if (roomsToEnd && roomsToEnd.length > 0) {
          const roomIds = roomsToEnd.map(r => r.id)
          console.log('📴 [api-livekit] Ending rooms by userId:', roomIds)
          
          const { error: batchError } = await supabase
            .from('call_rooms')
            .update({
              status: 'ended',
              ended_at: new Date().toISOString(),
            })
            .in('id', roomIds)

          if (batchError) {
            console.error('❌ [api-livekit] Failed to batch update:', batchError)
          }
          
          // call_participants 업데이트
          for (const room of roomsToEnd) {
            await supabase
              .from('call_participants')
              .update({ left_at: new Date().toISOString() })
              .eq('room_id', room.id)
              .is('left_at', null)
          }

          return new Response(
            JSON.stringify({ success: true, endedRooms: roomIds.length }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        return new Response(
          JSON.stringify({ success: true, message: 'No active rooms to end' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { data: updatedRoom, error: updateError } = await query.select().single()

      if (updateError) {
        console.error('❌ [api-livekit] Failed to update call_rooms:', updateError)
      } else {
        console.log('✅ [api-livekit] Call room ended:', updatedRoom?.id)

        // call_participants의 left_at 업데이트
        if (updatedRoom) {
          await supabase
            .from('call_participants')
            .update({ left_at: new Date().toISOString() })
            .eq('room_id', updatedRoom.id)
            .is('left_at', null)
        }
      }

      return new Response(
        JSON.stringify({ success: true, roomName }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})