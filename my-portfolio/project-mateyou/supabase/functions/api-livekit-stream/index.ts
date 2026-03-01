import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import * as jose from 'https://deno.land/x/jose@v4.14.4/index.ts'
import {
  corsHeaders,
  createSupabaseClient,
  errorResponse,
  getAuthUser,
  parseRequestBody,
  successResponse,
} from '../_shared/utils.ts'

type BroadcastMode = 'video' | 'audio'

/**
 * 🚧 임시 하드코딩 설정
 * - Supabase 대시보드에서 env 설정 권한이 복구되면 반드시 env로 이전하세요.
 * - 현재는 "stream.mateyou.me:7880" LiveKit(Stream) 전용 인프라를 사용합니다.
 */
const HARDCODED_STREAM_CONFIG = {
  LIVEKIT_STREAM_API_KEY: 'devkey',
  LIVEKIT_STREAM_API_SECRET: 'devsecret_devsecret_devsecret_devsecret',
  // ⚠️ TLS(WSS) 필수: HTTPS 페이지에서 WS://는 Mixed Content로 차단됨
  // - Cloudflare/nginx 프록시를 통해 WSS → WS 변환 필요
  // - 또는 LiveKit 서버에 직접 TLS 적용
  LIVEKIT_STREAM_URL: 'wss://stream.mateyou.me',
  // Twirp(Egress API) 호출용 (HTTPS 프록시 경유)
  LIVEKIT_STREAM_API_HOST: 'https://stream.mateyou.me',
  // HLS 제공 도메인 (CloudFront CDN)
  HLS_PUBLIC_BASE_URL: 'https://cdn.mateyou.me',
  // LiveKit Egress가 푸시할 RTMP ingest (Nginx RTMP)
  // - nginx 설정에 `application webrtc { ... }`가 있어야 합니다.
  // - docker-compose 내부 DNS(서비스명) 기준 (NAT/MASQUERADE로 인한 publish 차단 회피)
  RTMP_WEBRTC_INGEST_BASE: 'rtmp://nginx_rtmp:1935/webrtc',
} as const

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

function normalizeBaseUrl(value: string) {
  return value.replace(/\/$/, '')
}

function toHttpBaseUrl(value: string) {
  const trimmed = value.trim()
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return normalizeBaseUrl(trimmed)
  if (trimmed.startsWith('ws://')) return normalizeBaseUrl(trimmed.replace(/^ws:\/\//, 'http://'))
  if (trimmed.startsWith('wss://')) return normalizeBaseUrl(trimmed.replace(/^wss:\/\//, 'https://'))
  // host:port 형태
  return normalizeBaseUrl(`http://${trimmed}`)
}

async function createToken(
  apiKey: string,
  apiSecret: string,
  grants: ClaimGrants,
  ttlSeconds: number = 3600,
): Promise<string> {
  const secret = new TextEncoder().encode(apiSecret)

  const now = Math.floor(Date.now() / 1000)
  const payload = {
    iss: apiKey,
    sub: grants.identity,
    nbf: now,
    exp: now + ttlSeconds,
    iat: now,
    name: grants.name,
    video: grants.video,
    metadata: grants.metadata,
    sha256: grants.sha256,
  }

  return await new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .sign(secret)
}

async function livekitTwirp<T>(
  apiBaseUrl: string,
  methodName: string,
  accessToken: string,
  body: Record<string, unknown>,
): Promise<T> {
  const url = `${normalizeBaseUrl(apiBaseUrl)}/twirp/livekit.Egress/${methodName}`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`LiveKit Egress API error: ${res.status} ${text}`)
  }

  return JSON.parse(text) as T
}

async function assertStreamHost(supabase: ReturnType<typeof createSupabaseClient>, userId: string, roomId: string) {
  const { data: partner } = await supabase
    .from('partners')
    .select('id, partner_status')
    .eq('member_id', userId)
    .eq('partner_status', 'approved')
    .maybeSingle()

  if (!partner) {
    throw Object.assign(new Error('PARTNER_REQUIRED'), { code: 'PARTNER_REQUIRED' })
  }

  const { data: room } = await supabase
    .from('stream_rooms')
    .select('id, stream_type, host_partner_id, status, egress_id, hls_url')
    .eq('id', roomId)
    .maybeSingle()

  if (!room) {
    throw Object.assign(new Error('ROOM_NOT_FOUND'), { code: 'ROOM_NOT_FOUND' })
  }

  if (room.stream_type !== 'video') {
    throw Object.assign(new Error('INVALID_STREAM_TYPE'), { code: 'INVALID_STREAM_TYPE' })
  }

  if (room.status === 'ended') {
    throw Object.assign(new Error('ROOM_ENDED'), { code: 'ROOM_ENDED' })
  }

  if (room.host_partner_id !== partner.id) {
    throw Object.assign(new Error('NOT_HOST'), { code: 'NOT_HOST' })
  }

  return { partner, room }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const pathname = url.pathname

    // env가 "빈 문자열/공백"으로 잡혀있는 경우 하드코딩이 우선되도록 방어적으로 처리
    const envApiKey = Deno.env.get('LIVEKIT_STREAM_API_KEY')?.trim()
    const envApiSecret = Deno.env.get('LIVEKIT_STREAM_API_SECRET')?.trim()
    const envStreamUrl = Deno.env.get('LIVEKIT_STREAM_URL')?.trim()
    const envApiHost = Deno.env.get('LIVEKIT_STREAM_API_HOST')?.trim()

    const LIVEKIT_STREAM_API_KEY = envApiKey || HARDCODED_STREAM_CONFIG.LIVEKIT_STREAM_API_KEY
    const LIVEKIT_STREAM_API_SECRET = envApiSecret || HARDCODED_STREAM_CONFIG.LIVEKIT_STREAM_API_SECRET
    const LIVEKIT_STREAM_URL = envStreamUrl || HARDCODED_STREAM_CONFIG.LIVEKIT_STREAM_URL
    const LIVEKIT_STREAM_API_HOST = envApiHost || HARDCODED_STREAM_CONFIG.LIVEKIT_STREAM_API_HOST

    if (!LIVEKIT_STREAM_API_KEY || !LIVEKIT_STREAM_API_SECRET) {
      return errorResponse(
        'LIVEKIT_NOT_CONFIGURED',
        'LiveKit(Stream) 환경변수가 설정되지 않았습니다 (LIVEKIT_STREAM_API_KEY/LIVEKIT_STREAM_API_SECRET)',
        null,
        500,
      )
    }

    const livekitApiBaseUrl = LIVEKIT_STREAM_API_HOST
      ? normalizeBaseUrl(LIVEKIT_STREAM_API_HOST)
      : toHttpBaseUrl(LIVEKIT_STREAM_URL)

    const supabase = createSupabaseClient()
    const user = await getAuthUser(req)

    // ============================================
    // POST /api-livekit-stream/broadcast/token
    // - 방송자(호스트) LiveKit 토큰 발급 (시청자 WebRTC 기능 없음)
    // ============================================
    if (pathname === '/api-livekit-stream/broadcast/token' && req.method === 'POST') {
      const body = await parseRequestBody(req)
      const roomId = String(body?.roomId || '').trim()
      const mode = ((body?.mode === 'audio' ? 'audio' : 'video') as BroadcastMode) || 'video'

      if (!roomId) {
        return errorResponse('ROOM_ID_REQUIRED', 'roomId가 필요합니다')
      }

      try {
        await assertStreamHost(supabase, user.id, roomId)
      } catch (e: any) {
        if (e?.code === 'PARTNER_REQUIRED') return errorResponse('PARTNER_REQUIRED', '승인된 파트너만 방송할 수 있습니다', null, 403)
        if (e?.code === 'ROOM_NOT_FOUND') return errorResponse('ROOM_NOT_FOUND', '방을 찾을 수 없습니다', null, 404)
        if (e?.code === 'ROOM_ENDED') return errorResponse('ROOM_ENDED', '종료된 방입니다')
        if (e?.code === 'NOT_HOST') return errorResponse('NOT_HOST', '호스트만 방송할 수 있습니다', null, 403)
        if (e?.code === 'INVALID_STREAM_TYPE') return errorResponse('INVALID_STREAM_TYPE', '영상 방송 방만 지원합니다')
        throw e
      }

      const { data: member } = await supabase
        .from('members')
        .select('name')
        .eq('id', user.id)
        .maybeSingle()

      const participantName = member?.name || 'Host'

      const token = await createToken(LIVEKIT_STREAM_API_KEY, LIVEKIT_STREAM_API_SECRET, {
        identity: user.id,
        name: participantName,
        video: {
          roomJoin: true,
          room: roomId,
          canPublish: true,
          canSubscribe: true,
          canPublishData: true,
        },
      })

      return successResponse({
        token,
        url: LIVEKIT_STREAM_URL,
        roomName: roomId,
        identity: user.id,
        mode,
      })
    }

    // ============================================
    // POST /api-livekit-stream/broadcast/start
    // - 방송자(호스트) 스트림을 HLS로 변환(Egress) 시작
    // - stream_rooms.hls_url / egress_id 저장
    // ============================================
    if (pathname === '/api-livekit-stream/broadcast/start' && req.method === 'POST') {
      const body = await parseRequestBody(req)
      const roomId = String(body?.roomId || '').trim()
      const mode = ((body?.mode === 'audio' ? 'audio' : 'video') as BroadcastMode) || 'video'

      if (!roomId) {
        return errorResponse('ROOM_ID_REQUIRED', 'roomId가 필요합니다')
      }

      let room: { egress_id: string | null; hls_url: string | null }
      try {
        const res = await assertStreamHost(supabase, user.id, roomId)
        room = res.room as any
      } catch (e: any) {
        if (e?.code === 'PARTNER_REQUIRED') return errorResponse('PARTNER_REQUIRED', '승인된 파트너만 방송할 수 있습니다', null, 403)
        if (e?.code === 'ROOM_NOT_FOUND') return errorResponse('ROOM_NOT_FOUND', '방을 찾을 수 없습니다', null, 404)
        if (e?.code === 'ROOM_ENDED') return errorResponse('ROOM_ENDED', '종료된 방입니다')
        if (e?.code === 'NOT_HOST') return errorResponse('NOT_HOST', '호스트만 방송할 수 있습니다', null, 403)
        if (e?.code === 'INVALID_STREAM_TYPE') return errorResponse('INVALID_STREAM_TYPE', '영상 방송 방만 지원합니다')
        throw e
      }

      // 이미 Egress가 시작되어 있으면 재사용
      if (room.egress_id && room.hls_url) {
        return successResponse({
          egressId: room.egress_id,
          hlsUrl: room.hls_url,
          reused: true,
          mode,
        })
      }

      const hlsBaseUrl = normalizeBaseUrl(
        (Deno.env.get('HLS_PUBLIC_BASE_URL') || Deno.env.get('HLS_BASE_URL') || HARDCODED_STREAM_CONFIG.HLS_PUBLIC_BASE_URL).trim(),
      )

      // WebRTC(LiveKit) → RTMP → HLS 파이프라인
      // - LiveKit Egress가 RTMP로 nginx-rtmp에 푸시
      // - nginx가 ffmpeg로 HLS 세그먼트 생성 (/opt/hls/webrtc/{roomId}/index.m3u8)
      const rtmpWebrtcIngestBase = normalizeBaseUrl(
        (Deno.env.get('RTMP_WEBRTC_INGEST_BASE') || HARDCODED_STREAM_CONFIG.RTMP_WEBRTC_INGEST_BASE).trim(),
      )
      const rtmpUrl = `${rtmpWebrtcIngestBase}/${roomId}`
      // S3 sync 경로: /opt/hls → s3://{bucket}/hls/ → CloudFront
      // 따라서 CDN 경로는 /hls/webrtc/{roomId}/index.m3u8
      const publicHlsUrl = `${hlsBaseUrl}/hls/webrtc/${roomId}/index.m3u8`

      // Egress API 호출용 토큰 (roomRecord 권한 필요)
      const egressAccessToken = await createToken(
        LIVEKIT_STREAM_API_KEY,
        LIVEKIT_STREAM_API_SECRET,
        {
          identity: `egress_${user.id}`,
          name: 'egress',
          video: {
            roomRecord: true,
            room: roomId,
          },
        },
        300,
      )

      let egressInfo: { egress_id?: string } | null = null
      try {
        egressInfo = await livekitTwirp<{ egress_id?: string }>(
          livekitApiBaseUrl,
          'StartParticipantEgress',
          egressAccessToken,
          {
            room_name: roomId,
            identity: user.id,
            screen_share: false,
            preset: 'H264_720P_30',
            stream_outputs: [
              {
                protocol: 'RTMP',
                urls: [rtmpUrl],
              },
            ],
          },
        )
      } catch (egressErr: any) {
        return errorResponse(
          'EGRESS_START_FAILED',
          'Egress 시작에 실패했습니다. livekit-egress 서비스 상태/설정을 확인해주세요.',
          {
            message: egressErr?.message || String(egressErr),
            livekitApiBaseUrl,
            rtmpUrl,
          },
          502,
        )
      }

      const egressId = egressInfo?.egress_id
      if (!egressId) {
        return errorResponse('EGRESS_START_FAILED', 'Egress 시작에 실패했습니다', egressInfo, 500)
      }

      const { error: updateError } = await supabase
        .from('stream_rooms')
        .update({
          egress_id: egressId,
          hls_url: publicHlsUrl,
        })
        .eq('id', roomId)

      if (updateError) {
        return errorResponse('DB_UPDATE_FAILED', '방송 정보 업데이트에 실패했습니다', updateError.message, 500)
      }

      return successResponse({
        egressId,
        hlsUrl: publicHlsUrl,
        reused: false,
        mode,
      })
    }

    // ============================================
    // POST /api-livekit-stream/broadcast/stop
    // - Egress 종료 + stream_rooms 정리
    // ============================================
    if (pathname === '/api-livekit-stream/broadcast/stop' && req.method === 'POST') {
      const body = await parseRequestBody(req)
      const roomId = String(body?.roomId || '').trim()

      if (!roomId) {
        return errorResponse('ROOM_ID_REQUIRED', 'roomId가 필요합니다')
      }

      let egressId: string | null = null
      try {
        const res = await assertStreamHost(supabase, user.id, roomId)
        egressId = (res.room as any)?.egress_id || null
      } catch (e: any) {
        if (e?.code === 'PARTNER_REQUIRED') return errorResponse('PARTNER_REQUIRED', '승인된 파트너만 방송할 수 있습니다', null, 403)
        if (e?.code === 'ROOM_NOT_FOUND') return errorResponse('ROOM_NOT_FOUND', '방을 찾을 수 없습니다', null, 404)
        if (e?.code === 'ROOM_ENDED') {
          // ended 상태라도 정리 요청은 무해하게 성공 처리
          return successResponse({ success: true, stopped: false, message: '이미 종료된 방입니다' })
        }
        if (e?.code === 'NOT_HOST') return errorResponse('NOT_HOST', '호스트만 방송을 종료할 수 있습니다', null, 403)
        if (e?.code === 'INVALID_STREAM_TYPE') return errorResponse('INVALID_STREAM_TYPE', '영상 방송 방만 지원합니다')
        throw e
      }

      if (egressId) {
        const egressAccessToken = await createToken(
          LIVEKIT_STREAM_API_KEY,
          LIVEKIT_STREAM_API_SECRET,
          {
            identity: `egress_${user.id}`,
            name: 'egress',
            video: {
              roomRecord: true,
              room: roomId,
            },
          },
          300,
        )

        // 실패하더라도 DB 정리는 시도 (운영상 잔존 방지)
        try {
          await livekitTwirp(livekitApiBaseUrl, 'StopEgress', egressAccessToken, {
            egress_id: egressId,
          })
        } catch (stopErr) {
          console.warn('[api-livekit-stream] StopEgress failed (ignored):', stopErr)
        }
      }

      await supabase
        .from('stream_rooms')
        .update({ egress_id: null, hls_url: null })
        .eq('id', roomId)

      return successResponse({ success: true, stopped: !!egressId })
    }

    // ============================================
    // GET /api-livekit-stream/broadcast/status/:roomId
    // - 현재 egress 상태 조회 (선택)
    // ============================================
    const statusMatch = pathname.match(/^\/api-livekit-stream\/broadcast\/status\/([^/]+)$/)
    if (statusMatch && req.method === 'GET') {
      const roomId = statusMatch[1]

      let egressId: string | null = null
      try {
        const res = await assertStreamHost(supabase, user.id, roomId)
        egressId = (res.room as any)?.egress_id || null
      } catch (e: any) {
        if (e?.code === 'PARTNER_REQUIRED') return errorResponse('PARTNER_REQUIRED', '승인된 파트너만 방송할 수 있습니다', null, 403)
        if (e?.code === 'ROOM_NOT_FOUND') return errorResponse('ROOM_NOT_FOUND', '방을 찾을 수 없습니다', null, 404)
        if (e?.code === 'ROOM_ENDED') return errorResponse('ROOM_ENDED', '종료된 방입니다')
        if (e?.code === 'NOT_HOST') return errorResponse('NOT_HOST', '호스트만 조회할 수 있습니다', null, 403)
        if (e?.code === 'INVALID_STREAM_TYPE') return errorResponse('INVALID_STREAM_TYPE', '영상 방송 방만 지원합니다')
        throw e
      }

      if (!egressId) {
        return errorResponse('NO_EGRESS', '진행 중인 Egress가 없습니다', null, 404)
      }

      const egressAccessToken = await createToken(
        LIVEKIT_STREAM_API_KEY,
        LIVEKIT_STREAM_API_SECRET,
        {
          identity: `egress_${user.id}`,
          name: 'egress',
          video: { roomRecord: true, room: roomId },
        },
        300,
      )

      const res = await livekitTwirp<{ items?: unknown[] }>(
        livekitApiBaseUrl,
        'ListEgress',
        egressAccessToken,
        { egress_id: egressId, active: true },
      )

      const first = Array.isArray(res?.items) ? res.items[0] : null
      return successResponse({ egressId, info: first })
    }

    return errorResponse('ROUTE_NOT_FOUND', 'API route not found', null, 404)
  } catch (error: any) {
    console.error('api-livekit-stream error:', error)
    return errorResponse('INTERNAL_ERROR', '서버 오류가 발생했습니다', error?.message, 500)
  }
})

