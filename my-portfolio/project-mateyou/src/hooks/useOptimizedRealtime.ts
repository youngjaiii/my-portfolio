import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'
export type ErrorType = 'realtime_error' | 'channel_error' | 'server_error' | null

interface UseOptimizedRealtimeOptions {
  channelName: string
  userId?: string
  enabled?: boolean
  reconnectDelay?: number
  maxReconnectAttempts?: number
  onReconnect?: () => void // 재연결 성공 시 호출되는 콜백
}

interface RealtimeSubscription {
  event: string
  schema: string
  table: string
  filter?: string
  callback: (payload: any) => void
}

export function useOptimizedRealtime({
  channelName,
  userId,
  enabled = true,
  reconnectDelay = 1000,
  maxReconnectAttempts = 5,
  onReconnect
}: UseOptimizedRealtimeOptions) {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [errorType, setErrorType] = useState<ErrorType>(null)
  const [reconnectAttempts, setReconnectAttempts] = useState(0)
  const [lastConnected, setLastConnected] = useState<Date | null>(null)

  const channelRef = useRef<RealtimeChannel | null>(null)
  const subscriptionsRef = useRef<RealtimeSubscription[]>([])
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const connectRef = useRef<() => void>()
  const scheduleReconnectRef = useRef<() => void>()

  // 연결 정리 함수
  const cleanup = useCallback(() => {
    if (channelRef.current) {
      channelRef.current.unsubscribe()
      channelRef.current = null
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current)
      heartbeatIntervalRef.current = null
    }
  }, [])

  // 재연결 스케줄링 함수 (먼저 정의)
  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }

    setReconnectAttempts(prev => {
      if (prev >= maxReconnectAttempts || !enabled || !userId) {
        setStatus('error')
        setErrorType(prevError => prevError || 'realtime_error')
        return prev
      }

      const delay = Math.min(reconnectDelay * Math.pow(2, prev), 30000)
      reconnectTimeoutRef.current = setTimeout(() => {
        // ref를 통해 connect 호출 (순환 참조 방지)
        if (connectRef.current) {
          connectRef.current()
        }
      }, delay)

      return prev + 1
    })
  }, [maxReconnectAttempts, enabled, userId, reconnectDelay])

  // scheduleReconnect를 ref에 저장
  scheduleReconnectRef.current = scheduleReconnect

  // 연결 함수 (의존성 최소화)
  const connect = useCallback(() => {
    if (!enabled || !userId) return

    // 기존 채널이 있으면 먼저 정리 (하지만 unsubscribe는 나중에)
    const oldChannel = channelRef.current
    if (oldChannel) {
      // 기존 채널의 상태를 확인하고, 연결되어 있으면 재사용
      if (oldChannel.state === 'joined' || oldChannel.state === 'joining') {
        // 이미 연결 중이면 재연결하지 않음
        return
      }
    }

    setStatus('connecting')

    try {
      // 기존 채널이 있으면 unsubscribe (새 채널 생성 전)
      if (oldChannel && oldChannel.state !== 'closed') {
        oldChannel.unsubscribe()
      }

      // 새 채널 생성
      const channel = supabase.channel(`${channelName}-${userId}`, {
        config: {
          presence: {
            key: userId,
          },
        },
      })

      // 기존 구독들을 다시 등록
      subscriptionsRef.current.forEach(subscription => {
        channel.on(
          'postgres_changes' as any,
          {
            event: subscription.event as any,
            schema: subscription.schema,
            table: subscription.table,
            filter: subscription.filter
          },
          subscription.callback
        )
      })

      channelRef.current = channel

      // 구독 시작
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          const wasReconnecting = status !== 'SUBSCRIBED' || reconnectAttempts > 0
          const previousStatus = channelRef.current?.state
          const isReconnect = previousStatus && previousStatus !== 'joined' && previousStatus !== 'joining'
          
          setStatus('connected')
          setErrorType(null)
          setLastConnected(new Date())
          const hadReconnectAttempts = reconnectAttempts > 0
          setReconnectAttempts(0)
          
          // 재연결 성공 시 콜백 호출
          if (hadReconnectAttempts && onReconnect) {
            setTimeout(() => {
              onReconnect()
            }, 100) // 약간의 지연을 두어 상태 업데이트 완료 후 호출
          }
        } else if (status === 'CHANNEL_ERROR') {
          setStatus('error')
          setErrorType('channel_error')
          // 재연결 시도 (ref를 통해 호출)
          if (scheduleReconnectRef.current) {
            scheduleReconnectRef.current()
          }
        } else if (status === 'TIMED_OUT') {
          setStatus('disconnected')
          // 재연결 시도 (ref를 통해 호출)
          if (scheduleReconnectRef.current) {
            scheduleReconnectRef.current()
          }
        } else if (status === 'CLOSED') {
          setStatus('disconnected')
        }
      })

    } catch (error) {
      console.error('Real-time connection error:', error)
      setStatus('error')
      setErrorType('server_error')
      // 재연결 시도 (ref를 통해 호출)
      if (scheduleReconnectRef.current) {
        scheduleReconnectRef.current()
      }
    }
  }, [enabled, userId, channelName])

  // connect 함수를 ref에 저장
  connectRef.current = connect

  // 연결 상태 체크 (주기적 체크)
  const checkConnection = useCallback(() => {
    if (!channelRef.current) return
    
    const state = channelRef.current.state
    if (state === 'closed' || state === 'errored') {
      setStatus('disconnected')
      // ref를 통해 재연결 시도
      if (scheduleReconnectRef.current) {
        scheduleReconnectRef.current()
      }
    } else if (state === 'joined' && status !== 'connected') {
      setStatus('connected')
      setErrorType(null)
      setReconnectAttempts(0)
    }
  }, [status])

  // 구독 추가 함수
  const subscribe = useCallback((subscription: RealtimeSubscription) => {
    // 구독 정보 저장
    subscriptionsRef.current.push(subscription)

    // 현재 채널이 있으면 즉시 구독 등록
    if (channelRef.current) {
      channelRef.current.on(
        'postgres_changes' as any,
        {
          event: subscription.event as any,
          schema: subscription.schema,
          table: subscription.table,
          filter: subscription.filter
        },
        subscription.callback
      )
    }

    return () => {
      // 구독 제거
      subscriptionsRef.current = subscriptionsRef.current.filter(
        sub => sub !== subscription
      )
    }
  }, [])

  // 수동 재연결 함수
  const reconnect = useCallback(() => {
    setReconnectAttempts(0)
    setErrorType(null)
    if (channelRef.current) {
      channelRef.current.unsubscribe()
    }
    connect()
  }, [connect])

  // 주기적 연결 상태 체크
  useEffect(() => {
    if (!enabled || !userId) return

    const interval = setInterval(() => {
      checkConnection()
    }, 10000) // 10초마다 체크

    return () => clearInterval(interval)
  }, [enabled, userId, checkConnection])

  // 초기 연결 및 정리
  useEffect(() => {
    if (enabled && userId) {
      connect()
    }

    return () => {
      cleanup()
    }
  }, [enabled, userId, connect, cleanup])

  return {
    status,
    errorType,
    lastConnected,
    reconnectAttempts,
    maxReconnectAttempts,
    subscribe,
    reconnect,
    isConnected: status === 'connected',
    isConnecting: status === 'connecting',
    hasError: status === 'error'
  }
}