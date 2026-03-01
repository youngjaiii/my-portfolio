/**
 * useViewerHeartbeat - 시청자 Heartbeat 전송 훅
 *
 * 시청자가 방송 중일 때 30초마다 Heartbeat를 전송합니다.
 * 서버에서 2분 이상 Heartbeat가 없으면 시청자가 자동 퇴장 처리됩니다.
 *
 * 사용 조건:
 * - roomId가 유효해야 함
 * - 시청자(isViewer)여야 함
 * - 방이 라이브 상태(isLive)여야 함
 * - 호스트가 아니어야 함 (호스트는 useStreamHeartbeat 사용)
 */

import { edgeApi } from '@/lib/edgeApi'
import { useEffect, useRef } from 'react'

const HEARTBEAT_INTERVAL_MS = 30 * 1000 // 30초

interface UseViewerHeartbeatOptions {
  roomId: string | undefined
  isViewer: boolean // 시청자인지 여부
  isLive: boolean // 방이 라이브 상태인지
  isHost?: boolean // 호스트인 경우 시청자 Heartbeat 불필요
}

export function useViewerHeartbeat({
  roomId,
  isViewer,
  isLive,
  isHost = false,
}: UseViewerHeartbeatOptions) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null)
  const isActiveRef = useRef(false)

  useEffect(() => {
    // 시청자이고, 방이 라이브 상태이며, 호스트가 아닐 때만 Heartbeat 전송
    const shouldSendHeartbeat = !!roomId && isViewer && isLive && !isHost

    if (shouldSendHeartbeat && !isActiveRef.current) {
      console.log('👁️ [ViewerHeartbeat] 시작:', { roomId })
      isActiveRef.current = true

      // 즉시 첫 Heartbeat 전송
      edgeApi.stream.viewerHeartbeat(roomId).catch((err) => {
        // 입장하지 않은 경우는 조용히 무시 (404 에러)
        const errorMessage = err instanceof Error ? err.message : String(err)
        if (!errorMessage.includes('입장하지 않았습니다') && !errorMessage.includes('404')) {
          console.warn('👁️ [ViewerHeartbeat] 전송 실패:', err)
        }
      })

      // 30초마다 Heartbeat 전송
      intervalRef.current = setInterval(() => {
        console.log('👁️ [ViewerHeartbeat] 전송:', { roomId })
        edgeApi.stream.viewerHeartbeat(roomId).catch((err) => {
          // 입장하지 않은 경우는 조용히 무시 (404 에러)
          const errorMessage = err instanceof Error ? err.message : String(err)
          if (!errorMessage.includes('입장하지 않았습니다') && !errorMessage.includes('404')) {
            console.warn('👁️ [ViewerHeartbeat] 전송 실패:', err)
          }
        })
      }, HEARTBEAT_INTERVAL_MS)
    }

    // 조건이 맞지 않으면 중지
    if (!shouldSendHeartbeat && isActiveRef.current) {
      console.log('👁️ [ViewerHeartbeat] 중지:', { roomId, isViewer, isLive, isHost })
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      isActiveRef.current = false
    }

    return () => {
      if (intervalRef.current) {
        console.log('👁️ [ViewerHeartbeat] 클린업')
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      isActiveRef.current = false
    }
  }, [roomId, isViewer, isLive, isHost])
}

