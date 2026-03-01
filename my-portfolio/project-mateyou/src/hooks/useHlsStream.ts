/**
 * useHlsStream - HLS 스트림 관리 훅
 * 
 * 방송 키 조회 및 HLS URL 생성을 담당합니다.
 * 보안: 스트림 키는 마스킹되어 표시되고, 세션 토큰으로 인증합니다.
 */

import { supabase } from '@/lib/supabase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

// 타입 정의
interface StreamSession {
  session_token: string
  rtmp_url: string
  expires_at: string
}

// 스트림 키 마스킹 (앞 4자 + *** + 뒤 4자)
export function maskStreamKey(key: string): string {
  if (!key || key.length < 12) return '***'
  return `${key.slice(0, 4)}${'*'.repeat(8)}${key.slice(-4)}`
}

// HLS URL 생성 (스트림 키 기반)
// CDN 직접 접근 (가장 안정적)
export function getHlsUrl(streamKey: string): string {
  // CDN 도메인 (기본값: cdn.mateyou.me)
  const cdnDomain = import.meta.env.VITE_CDN_DOMAIN || 'cdn.mateyou.me'
  return `https://${cdnDomain}/hls/${streamKey}/index.m3u8`
}

// HLS URL 생성 (파트너 ID 기반 - OBS/PRISM 방송용)
// Supabase Edge Function 프록시를 통해 스트림 키 숨김
// 경로: /api-stream-hls/{partnerId}/* → CDN /hls/{stream_key}/*
// api-stream-hls는 인증 불필요 (--no-verify-jwt로 배포)
export function getHlsUrlByPartner(partnerId: string): string {
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || 'https://rnfnxusjhxfcynvowxdo.supabase.co')
    .replace(/\/$/, '')
  // Supabase 프록시를 통해 스트림 키를 숨기고 HLS 스트림 제공
  return `${supabaseUrl}/functions/v1/api-stream-hls/${partnerId}/index.m3u8`
}

// DB에서 조회되는 스트림 키 데이터 타입
interface StreamKeyDbRow {
  id: string
  partner_id: string
  stream_key: string
  is_active: boolean
  created_at: string
  expires_at: string | null
  last_used_at: string | null
  use_count: number
}

// 스트림 키 조회 (파트너용) - 마스킹된 키만 반환
export function useStreamKey(partnerId: string | null | undefined) {
  return useQuery({
    queryKey: ['stream-key', partnerId],
    queryFn: async () => {
      if (!partnerId) return null
      
      const { data, error } = await supabase
        .from('mt_live_stream_keys')
        .select('id, partner_id, stream_key, is_active, created_at, expires_at, last_used_at, use_count')
        .eq('partner_id', partnerId)
        .eq('is_active', true)
        .single()
      
      if (error) {
        if (error.code === 'PGRST116') {
          return null
        }
        throw error
      }
      
      const row = data as StreamKeyDbRow
      
      // 스트림 키 마스킹 처리 (보안)
      return {
        id: row.id,
        partner_id: row.partner_id,
        is_active: row.is_active,
        created_at: row.created_at,
        expires_at: row.expires_at,
        last_used_at: row.last_used_at,
        stream_key_masked: maskStreamKey(row.stream_key),
        // 원본 키는 클라이언트에 노출하지 않음
      }
    },
    enabled: !!partnerId,
  })
}

// 스트림 키 생성 (생성 직후에만 원본 키 반환)
export function useCreateStreamKey() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (partnerId: string) => {
      if (!partnerId) {
        throw new Error('파트너 ID가 필요합니다')
      }
      
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('인증이 필요합니다')
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-stream/keys/generate`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ partnerId }),
        }
      )
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        // 서버 응답 구조: { success: false, error: { code, message, details } }
        const errorMessage = errorData?.error?.message || errorData?.message || '스트림 키 생성 실패'
        console.error('스트림 키 생성 실패:', { status: response.status, errorData })
        throw new Error(errorMessage)
      }
      
      const result = await response.json()
      
      // 생성 직후에만 원본 키 반환 (이후에는 마스킹됨)
      return {
        stream_key: result.data.stream_key,
        stream_key_masked: maskStreamKey(result.data.stream_key),
        rtmp_url: result.data.rtmp_url,
        message: result.data.message,
        // 키가 표시된 후 복사하도록 안내
        show_copy_warning: true,
      }
    },
    onSuccess: (_, partnerId) => {
      queryClient.invalidateQueries({ queryKey: ['stream-key', partnerId] })
    },
  })
}

// 스트림 키 재발급
export function useRefreshStreamKey() {
  const queryClient = useQueryClient()
  
  return useMutation({
    mutationFn: async (partnerId: string) => {
      if (!partnerId) {
        throw new Error('파트너 ID가 필요합니다')
      }
      
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('인증이 필요합니다')
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-stream/keys/refresh`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ partnerId }),
        }
      )
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        // 서버 응답 구조: { success: false, error: { code, message, details } }
        const errorMessage = errorData?.error?.message || errorData?.message || '스트림 키 갱신 실패'
        console.error('스트림 키 갱신 실패:', { status: response.status, errorData })
        throw new Error(errorMessage)
      }
      
      const result = await response.json()
      
      return {
        stream_key: result.data.stream_key,
        stream_key_masked: maskStreamKey(result.data.stream_key),
        rtmp_url: result.data.rtmp_url,
        message: result.data.message,
        show_copy_warning: true,
      }
    },
    onSuccess: (_, partnerId) => {
      queryClient.invalidateQueries({ queryKey: ['stream-key', partnerId] })
    },
  })
}

// 방송 세션 시작 (임시 토큰 발급) - 보안 강화
export function useStartStreamSession() {
  return useMutation({
    mutationFn: async (partnerId: string): Promise<StreamSession> => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('인증이 필요합니다')
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-stream/session/start`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ partnerId }),
        }
      )
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || '방송 세션 시작 실패')
      }
      
      const result = await response.json()
      return result.data as StreamSession
    },
  })
}

// 방 정보 타입 (stream_rooms 테이블에서 필요한 필드만)
interface StreamRoomHlsInfo {
  id: string
  host_partner_id: string | null
  status: string
  broadcast_type: 'webrtc' | 'hls' | 'hybrid' | null
  hls_url: string | null  // 세션 UUID 기반 HLS URL (CDN 캐싱 문제 방지)
  hls_session_id: string | null  // 방송 시작 시마다 새로 생성되는 세션 UUID
}

// 세션 UUID 기반 HLS URL 생성
export function getHlsUrlBySessionId(sessionId: string): string {
  const cdnDomain = import.meta.env.VITE_CDN_DOMAIN || 'cdn.mateyou.me'
  return `https://${cdnDomain}/hls/${sessionId}/index.m3u8`
}

// 방 ID로 HLS URL 조회
// 우선순위:
// 1. hls_url (DB에 저장된 세션 UUID 기반 URL)
// 2. hls_session_id (세션 UUID로 URL 생성)
// 3. host_partner_id (공개 HLS /live fallback - 레거시)
export function useRoomHlsUrl(roomId: string | null) {
  return useQuery({
    queryKey: ['room-hls-url', roomId],
    queryFn: async () => {
      if (!roomId) return null
      
      // 방 정보에서 HLS URL 및 세션 ID 조회
      const { data, error } = await supabase
        .from('stream_rooms')
        .select(`
          id,
          host_partner_id,
          status,
          broadcast_type,
          hls_url,
          hls_session_id
        `)
        .eq('id', roomId)
        .single()
      
      if (error) throw error
      
      const room = data as StreamRoomHlsInfo | null
      if (!room || room.status !== 'live') return null
      
      // 1. DB에 저장된 HLS URL이 있으면 우선 사용 (세션 UUID 기반)
      if (room.hls_url) {
        console.log('📺 Using session-based HLS URL:', room.hls_url)
        return room.hls_url
      }
      
      // 2. 세션 ID가 있으면 URL 생성
      if (room.hls_session_id) {
        const url = getHlsUrlBySessionId(room.hls_session_id)
        console.log('📺 Generated HLS URL from session ID:', url)
        return url
      }
      
      // 3. 공개 HLS URL (파트너 ID 기반)로 fallback (레거시 지원)
      if (room.host_partner_id) {
        const url = getHlsUrlByPartner(room.host_partner_id)
        console.log('📺 Using partner public HLS URL (legacy):', url)
        return url
      }
      
      console.log('📺 No HLS URL available for room:', roomId)
      return null
    },
    enabled: !!roomId,
    refetchInterval: (query) => {
      // HLS URL이 없으면 1초마다 재시도 (방송 시작 대기)
      return query.state.data ? false : 1000
    },
  })
}

// 스트림 상태 체크
export function useStreamStatus(streamKey: string | null) {
  return useQuery({
    queryKey: ['stream-status', streamKey],
    queryFn: async () => {
      if (!streamKey) return { isLive: false }
      
      const hlsUrl = getHlsUrl(streamKey)
      
      try {
        const response = await fetch(hlsUrl, { method: 'HEAD' })
        return { isLive: response.ok }
      } catch {
        return { isLive: false }
      }
    },
    enabled: !!streamKey,
    refetchInterval: 10000, // 10초마다 체크
  })
}
