/**
 * useStreamHeartbeat - 호스트 하트비트 전송 훅
 * 
 * 호스트가 방송 중일 때 30초마다 하트비트를 전송합니다.
 * 서버에서 2분 이상 하트비트가 없으면 방송이 자동 종료됩니다.
 */

import { edgeApi } from '@/lib/edgeApi'
import { useEffect, useRef } from 'react'

const HEARTBEAT_INTERVAL_MS = 30 * 1000 // 30초

interface UseStreamHeartbeatOptions {
  roomId: string | undefined
  isHost: boolean
  isLive: boolean
}

export function useStreamHeartbeat({ roomId, isHost, isLive }: UseStreamHeartbeatOptions) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const isActiveRef = useRef(false)

  useEffect(() => {
    // 호스트이고 방이 라이브 상태일 때만 하트비트 전송
    const shouldSendHeartbeat = !!roomId && isHost && isLive

    if (shouldSendHeartbeat && !isActiveRef.current) {
      console.log('💓 [Heartbeat] 시작:', { roomId })
      isActiveRef.current = true

      // 즉시 첫 하트비트 전송
      edgeApi.stream.heartbeat(roomId).catch(err => {
        console.warn('💔 [Heartbeat] 전송 실패:', err)
      })

      // 30초마다 하트비트 전송
      intervalRef.current = setInterval(() => {
        console.log('💓 [Heartbeat] 전송:', { roomId })
        edgeApi.stream.heartbeat(roomId).catch(err => {
          console.warn('💔 [Heartbeat] 전송 실패:', err)
        })
      }, HEARTBEAT_INTERVAL_MS)
    }

    // 조건이 맞지 않으면 중지
    if (!shouldSendHeartbeat && isActiveRef.current) {
      console.log('💔 [Heartbeat] 중지:', { roomId, isHost, isLive })
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      isActiveRef.current = false
    }

    return () => {
      if (intervalRef.current) {
        console.log('💔 [Heartbeat] 클린업')
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      isActiveRef.current = false
    }
  }, [roomId, isHost, isLive])
}
