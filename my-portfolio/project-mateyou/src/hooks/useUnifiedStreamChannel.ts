/**
 * useUnifiedStreamChannel - 통합 스트림 Realtime 채널 훅
 *
 * 기존에 여러 개로 분산되어 있던 Realtime 채널을 하나로 통합하여
 * 서버 부담을 줄이고 관리를 단순화합니다.
 *
 * 통합 대상 채널:
 * - force-mute-broadcast-{roomId} → moderation:force-mute
 * - ban-detection-{roomId} → moderation:kick, moderation:ban
 * - voice-peers-{roomId} → peer:*
 * - video-peers-{roomId} → peer:*
 * - pinned-chat-{roomId} → chat:pin, chat:unpin
 *
 * 사용 예:
 * ```tsx
 * const { isConnected, broadcast, on, off } = useUnifiedStreamChannel(roomId)
 *
 * // 이벤트 리스닝
 * on('moderation:force-mute', (data) => handleForceMute(data))
 *
 * // 이벤트 브로드캐스트
 * broadcast('moderation:force-mute', { targetMemberId, reason })
 * ```
 */

import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// 통합 채널에서 사용하는 이벤트 타입
export type StreamEventType =
  // 모더레이션 관련
  | 'moderation:force-mute' // 강제 뮤트
  | 'moderation:force-unmute' // 강제 뮤트 해제
  | 'moderation:kick' // 강퇴
  | 'moderation:ban' // 차단

  // P2P 시그널링 (PeerJS)
  | 'peer:join' // 피어 입장
  | 'peer:leave' // 피어 퇴장
  | 'peer:signal' // WebRTC 시그널링 (offer, answer, ice-candidate)
  | 'peer:mute-status' // 뮤트 상태 변경
  | 'peer:video-status' // 비디오 상태 변경
  | 'peer:track-replaced' // 비디오 트랙 교체

  // 채팅 관련
  | 'chat:pin' // 채팅 고정
  | 'chat:unpin' // 채팅 고정 해제
  | 'chat:new' // 새 채팅 메시지 (postgres_changes)
  | 'chat:update' // 채팅 업데이트 (postgres_changes)

  // 후원 관련
  | 'donation:new' // 새 후원 (postgres_changes)
  | 'donation:roulette' // 룰렛 결과 (postgres_changes)

  // 방 상태
  | 'room:host-change' // 호스트 변경
  | 'room:end' // 방송 종료
  | 'room:viewer-update' // 시청자 수 변경

// 이벤트 페이로드 타입
export interface StreamEventPayload {
  // 모더레이션
  'moderation:force-mute': {
    targetMemberId: string
    mutedBy: string
    reason?: string
  }
  'moderation:force-unmute': {
    targetMemberId: string
    unmutedBy: string
  }
  'moderation:kick': {
    targetMemberId: string
    kickedBy: string
    reason?: string
  }
  'moderation:ban': {
    targetMemberId: string
    bannedBy: string
    banType: 'room' | 'global'
    reason?: string
    expiresAt?: string
  }

  // P2P 시그널링
  'peer:join': {
    peerId: string
    memberId: string
    isHost?: boolean
    isMuted?: boolean
    isVideoOff?: boolean
  }
  'peer:leave': {
    peerId: string
    memberId: string
  }
  'peer:signal': {
    fromPeerId: string
    toPeerId: string
    signalType: 'offer' | 'answer' | 'ice-candidate'
    signalData: unknown
  }
  'peer:mute-status': {
    peerId: string
    memberId: string
    isMuted: boolean
  }
  'peer:video-status': {
    peerId: string
    memberId: string
    isVideoOff: boolean
  }
  'peer:track-replaced': {
    peerId: string
    trackLabel: string
    timestamp: number
  }

  // 채팅
  'chat:pin': {
    messageId: number
    pinnedBy: string
  }
  'chat:unpin': {
    messageId: number
    unpinnedBy: string
  }
  'chat:new': {
    message: any // StreamChat 타입
  }
  'chat:update': {
    message: any // StreamChat 타입
  }

  // 후원
  'donation:new': {
    donation: any // StreamDonation 타입
  }
  'donation:roulette': {
    result: any // DonationRouletteResult 타입
  }

  // 방 상태
  'room:host-change': {
    newHostId: string
    previousHostId?: string
  }
  'room:end': {
    endedBy?: string
    reason?: string
  }
  'room:viewer-update': {
    viewerCount: number
  }
}

// 이벤트 핸들러 타입
type EventHandler<T extends StreamEventType> = (data: StreamEventPayload[T]) => void

interface UseUnifiedStreamChannelOptions {
  enabled?: boolean
  onConnected?: () => void
  onDisconnected?: () => void
  onError?: (error: Error) => void
  // Postgres Changes 옵션
  enableDonations?: boolean // 후원 이벤트 구독
  enableChats?: boolean // 채팅 이벤트 구독
  enableBans?: boolean // 차단 이벤트 구독 (memberId 필요)
  memberId?: string // 차단 감지용
  // Presence 옵션
  enablePresence?: boolean // Presence 사용 여부
  onPresenceSync?: (presences: any) => void // Presence 동기화 콜백
}

interface UseUnifiedStreamChannelReturn {
  isConnected: boolean
  broadcast: <T extends StreamEventType>(type: T, data: StreamEventPayload[T]) => Promise<boolean>
  on: <T extends StreamEventType>(type: T, handler: EventHandler<T>) => void
  off: <T extends StreamEventType>(type: T, handler: EventHandler<T>) => void
  track: (presence: any) => Promise<void> // Presence track
  getPresenceState: () => any // Presence 상태 조회
  channel: RealtimeChannel | null // 내부 채널 참조 (필요시)
}

export function useUnifiedStreamChannel(
  roomId: string | undefined,
  options: UseUnifiedStreamChannelOptions = {}
): UseUnifiedStreamChannelReturn {
  const { 
    enabled = true, 
    onConnected, 
    onDisconnected, 
    onError,
    enableDonations = false,
    enableChats = false,
    enableBans = false,
    memberId,
    enablePresence = false,
    onPresenceSync,
  } = options

  const [isConnected, setIsConnected] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const handlersRef = useRef<Map<StreamEventType, Set<EventHandler<StreamEventType>>>>(new Map())

  // 콜백 함수들을 ref로 안정화 (의존성 배열에서 제외)
  const onConnectedRef = useRef(onConnected)
  const onDisconnectedRef = useRef(onDisconnected)
  const onErrorRef = useRef(onError)
  const onPresenceSyncRef = useRef(onPresenceSync)
  
  useEffect(() => {
    onConnectedRef.current = onConnected
    onDisconnectedRef.current = onDisconnected
    onErrorRef.current = onError
    onPresenceSyncRef.current = onPresenceSync
  })

  // 이벤트 핸들러 등록
  const on = useCallback(<T extends StreamEventType>(type: T, handler: EventHandler<T>) => {
    if (!handlersRef.current.has(type)) {
      handlersRef.current.set(type, new Set())
    }
    handlersRef.current.get(type)!.add(handler as EventHandler<StreamEventType>)
  }, [])

  // 이벤트 핸들러 제거
  const off = useCallback(<T extends StreamEventType>(type: T, handler: EventHandler<T>) => {
    handlersRef.current.get(type)?.delete(handler as EventHandler<StreamEventType>)
  }, [])

  // 이벤트 브로드캐스트
  const broadcast = useCallback(
    async <T extends StreamEventType>(type: T, data: StreamEventPayload[T]): Promise<boolean> => {
      if (!channelRef.current || !isConnected) {
        console.warn('[UnifiedChannel] 채널이 연결되지 않았습니다')
        return false
      }

      try {
        await channelRef.current.send({
          type: 'broadcast',
          event: 'stream-event',
          payload: { type, data },
        })
        return true
      } catch (error) {
        console.error('[UnifiedChannel] 브로드캐스트 실패:', error)
        return false
      }
    },
    [isConnected]
  )

  // 채널 이름을 위한 고유 suffix 생성 (옵션 기반)
  // useMemo로 변경하여 옵션 변경 시 업데이트되도록 함
  const channelSuffix = useMemo(
    () =>
      [
        enablePresence && 'p',
        enableChats && 'c',
        enableDonations && 'd',
        enableBans && 'b',
      ].filter(Boolean).join('') || 'base',
    [enablePresence, enableChats, enableDonations, enableBans]
  )

  // 채널 연결 및 이벤트 처리
  useEffect(() => {
    if (!roomId || !enabled) {
      console.log(`[UnifiedChannel] 채널 생성 스킵: roomId=${roomId}, enabled=${enabled}`)
      return
    }

    // 목적별로 다른 채널 이름 사용 (충돌 방지)
    const channelName = `stream-unified-${roomId}-${channelSuffix}`
    console.log(`[UnifiedChannel] 채널 생성 시작: ${channelName}, enableChats=${enableChats}`)

    // 기존 채널이 있으면 먼저 제거
    if (channelRef.current) {
      console.log('[UnifiedChannel] 기존 채널 제거')
      supabase.removeChannel(channelRef.current)
      channelRef.current = null
    }

    const channel = supabase.channel(channelName, {
      config: {
        broadcast: { self: false }, // 자신에게는 브로드캐스트 안 함
      },
    })

    // Broadcast 이벤트 핸들러
    channel.on('broadcast', { event: 'stream-event' }, (payload) => {
      const { type, data } = payload.payload as {
        type: StreamEventType
        data: StreamEventPayload[StreamEventType]
      }

      // 등록된 핸들러들 호출
      const handlers = handlersRef.current.get(type)
      if (handlers) {
        handlers.forEach((handler) => {
          try {
            handler(data)
          } catch (error) {
            console.error(`[UnifiedChannel] 핸들러 오류 (${type}):`, error)
          }
        })
      }
    })

    // Postgres Changes: 후원 이벤트
    if (enableDonations) {
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'stream_donations',
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          const handlers = handlersRef.current.get('donation:new')
          if (handlers) {
            handlers.forEach((handler) => {
              try {
                handler({ donation: payload.new })
              } catch (error) {
                console.error('[UnifiedChannel] 후원 핸들러 오류:', error)
              }
            })
          }
        }
      )

      // 룰렛 결과
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'donation_roulette_results',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const handlers = handlersRef.current.get('donation:roulette')
          if (handlers) {
            handlers.forEach((handler) => {
              try {
                handler({ result: payload.new })
              } catch (error) {
                console.error('[UnifiedChannel] 룰렛 핸들러 오류:', error)
              }
            })
          }
        }
      )
    }

    // Postgres Changes: 채팅 이벤트
    if (enableChats) {
      console.log(`[UnifiedChannel] 채팅 Postgres Changes 리스너 등록: roomId=${roomId}`)
      
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'stream_chats',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          console.log(`[UnifiedChannel] 채팅 INSERT 이벤트 수신:`, payload.new)
          const handlers = handlersRef.current.get('chat:new')
          if (handlers && handlers.size > 0) {
            console.log(`[UnifiedChannel] 채팅 핸들러 ${handlers.size}개 호출`)
            handlers.forEach((handler) => {
              try {
                handler({ message: payload.new })
              } catch (error) {
                console.error('[UnifiedChannel] 채팅 핸들러 오류:', error)
              }
            })
          } else {
            console.warn('[UnifiedChannel] 채팅 핸들러가 등록되지 않았습니다')
          }
        }
      )

      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'stream_chats',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          console.log(`[UnifiedChannel] 채팅 UPDATE 이벤트 수신:`, payload.new)
          const handlers = handlersRef.current.get('chat:update')
          if (handlers && handlers.size > 0) {
            handlers.forEach((handler) => {
              try {
                handler({ message: payload.new })
              } catch (error) {
                console.error('[UnifiedChannel] 채팅 업데이트 핸들러 오류:', error)
              }
            })
          }
        }
      )
    }

    // Postgres Changes: 차단 이벤트
    if (enableBans && memberId) {
      channel.on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'stream_chat_bans',
          filter: `target_member_id=eq.${memberId}`,
        },
        (payload) => {
          const ban = payload.new as any
          const handlers = handlersRef.current.get('moderation:ban')
          if (handlers) {
            handlers.forEach((handler) => {
              try {
                handler({
                  targetMemberId: ban.target_member_id,
                  bannedBy: ban.banned_by || '',
                  banType: ban.scope === 'global' ? 'global' : 'room',
                  reason: ban.reason,
                  expiresAt: ban.expires_at,
                })
              } catch (error) {
                console.error('[UnifiedChannel] 차단 핸들러 오류:', error)
              }
            })
          }
        }
      )
    }

    // Presence 이벤트
    if (enablePresence) {
      channel.on('presence', { event: 'sync' }, () => {
        const presenceState = channel.presenceState()
        onPresenceSyncRef.current?.(presenceState)
      })
    }

    // 채널 구독
    channel.subscribe((status) => {
      console.log(`[UnifiedChannel] 채널 구독 상태 변경: ${status}, roomId=${roomId}, enableChats=${enableChats}`)
      if (status === 'SUBSCRIBED') {
        console.log(`[UnifiedChannel] 채널 구독 완료: ${channelName}`)
        setIsConnected(true)
        onConnectedRef.current?.()
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
        console.warn(`[UnifiedChannel] 채널 연결 종료: ${status}`)
        setIsConnected(false)
        onDisconnectedRef.current?.()
        if (status === 'CHANNEL_ERROR') {
          onErrorRef.current?.(new Error('채널 연결 오류'))
        }
      }
    })

    channelRef.current = channel

    // 클린업
    return () => {
      console.log(`[UnifiedChannel] 채널 클린업: ${channelName}`)
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current)
      }
      channelRef.current = null
      setIsConnected(false)
    }
  }, [roomId, enabled, enableDonations, enableChats, enableBans, memberId, enablePresence, channelSuffix])

  // Presence track
  const track = useCallback(async (presence: any) => {
    if (!channelRef.current || !isConnected) {
      console.warn('[UnifiedChannel] 채널이 연결되지 않아 Presence track 불가')
      return
    }
    await channelRef.current.track(presence)
  }, [isConnected])

  // Presence 상태 조회
  const getPresenceState = useCallback(() => {
    if (!channelRef.current) return {}
    return channelRef.current.presenceState()
  }, [])

  // 반환값 메모이제이션 (불필요한 리렌더링 방지)
  return useMemo(() => ({
    isConnected,
    broadcast,
    on,
    off,
    track,
    getPresenceState,
    channel: channelRef.current,
  }), [isConnected, broadcast, on, off, track, getPresenceState])
}

/**
 * 레거시 채널 호환성을 위한 헬퍼 함수
 * 기존 채널 이벤트를 통합 채널 이벤트로 변환합니다.
 */
export function mapLegacyEvent(
  legacyChannel: string,
  legacyEvent: string
): StreamEventType | null {
  // force-mute-broadcast-{roomId}
  if (legacyChannel.startsWith('force-mute-broadcast-')) {
    if (legacyEvent === 'force-mute') return 'moderation:force-mute'
    if (legacyEvent === 'force-unmute') return 'moderation:force-unmute'
  }

  // ban-detection-{roomId}
  if (legacyChannel.startsWith('ban-detection-')) {
    if (legacyEvent === 'kick') return 'moderation:kick'
    if (legacyEvent === 'ban') return 'moderation:ban'
  }

  // voice-peers-{roomId}, video-peers-{roomId}
  if (legacyChannel.startsWith('voice-peers-') || legacyChannel.startsWith('video-peers-')) {
    if (legacyEvent === 'join') return 'peer:join'
    if (legacyEvent === 'leave') return 'peer:leave'
    if (legacyEvent === 'signal') return 'peer:signal'
    if (legacyEvent === 'mute-status') return 'peer:mute-status'
  }

  return null
}

