import { useCallback, useRef, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { PhoneOff, Maximize2, User } from 'lucide-react'
import { useCallStore } from '@/stores/callStore'
import { cn } from '@/lib/utils'
import { Room } from 'livekit-client'
import { supabase } from '@/lib/supabase'

const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL

// 전역 Room 접근
const getGlobalRoom = (): Room | null => (window as any).__livekit_room || null

export function MiniCallUI() {
  const navigate = useNavigate()
  const { miniCall, setMiniCall, setPosition, incrementDuration, updateMiniCall } = useCallStore()
  
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 })
  const durationIntervalRef = useRef<number | null>(null)

  // 디버깅 로그
  useEffect(() => {
    console.log('🔔 [MiniCallUI] State changed:', miniCall ? {
      isMinimized: miniCall.isMinimized,
      partnerName: miniCall.partnerName,
      callState: miniCall.callState,
    } : 'null')
  }, [miniCall])

  // 통화 시간 포맷
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  // 통화 시간 추적
  useEffect(() => {
    if (miniCall?.callState === 'connected') {
      durationIntervalRef.current = window.setInterval(() => {
        incrementDuration()
      }, 1000)
    }
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
      }
    }
  }, [miniCall?.callState, incrementDuration])

  // 통화 종료
  const handleEndCall = useCallback(async () => {
    if (!miniCall) return
    
    console.log('📴 [MiniCallUI] Ending call')
    
    try {
      // 상대방에게 통화 종료 broadcast
      if (miniCall.partnerId) {
        try {
          const channel = supabase.channel(`call-notifications-${miniCall.partnerId}`)
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => resolve(), 2000)
            channel.subscribe((status) => {
              if (status === 'SUBSCRIBED') {
                clearTimeout(timeout)
                resolve()
              }
            })
          })
          await channel.send({
            type: 'broadcast',
            event: 'livekit-call-ended',
            payload: {
              roomName: miniCall.roomName,
              timestamp: Date.now(),
            },
          })
          await new Promise(r => setTimeout(r, 200))
          channel.unsubscribe()
          console.log('✅ [MiniCallUI] Call end broadcasted to partner')
        } catch (broadcastError) {
          console.error('❌ [MiniCallUI] Error broadcasting call end:', broadcastError)
        }
      }
      
      // 전역 오디오 트랙 먼저 정리 (마이크 해제)
      const audioTrack = (window as any).__livekit_audio_track
      if (audioTrack) {
        console.log('🎤 [MiniCallUI] Stopping audio track')
        try {
          audioTrack.stop()
          // MediaStreamTrack도 직접 정리
          if (audioTrack.mediaStreamTrack) {
            audioTrack.mediaStreamTrack.stop()
          }
        } catch (e) {
          console.error('❌ [MiniCallUI] Error stopping audio track:', e)
        }
        ;(window as any).__livekit_audio_track = null
      }
      
      // 전역 Room 정리
      const globalRoom = getGlobalRoom()
      if (globalRoom) {
        console.log('🔌 [MiniCallUI] Disconnecting room')
        // 모든 로컬 트랙 unpublish 및 정리
        const localParticipant = globalRoom.localParticipant
        if (localParticipant) {
          for (const [, publication] of localParticipant.trackPublications) {
            if (publication.track) {
              try {
                await localParticipant.unpublishTrack(publication.track)
                publication.track.stop()
              } catch (e) {
                console.error('❌ [MiniCallUI] Error unpublishing track:', e)
              }
            }
          }
        }
        await globalRoom.disconnect()
        ;(window as any).__livekit_room = null
      }

      if (miniCall.roomName) {
        const { data: { session } } = await supabase.auth.getSession()
        await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/api-livekit/room/end`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ roomName: miniCall.roomName }),
        }).catch(() => {})
      }
    } catch (error) {
      console.error('❌ [MiniCallUI] Error ending call:', error)
    }
    
    setMiniCall(null)
  }, [miniCall, setMiniCall])

  // 전체화면으로 전환
  const handleExpand = useCallback(() => {
    if (!miniCall) return
    
    console.log('📱 [MiniCallUI] Expanding to full screen, duration:', miniCall.duration)
    
    // miniCall 정보를 먼저 복사 (navigate 전에)
    const callInfo = { ...miniCall }
    
    // /call로 이동 - restore=true로 복원 모드임을 명시, duration도 전달
    navigate({
      to: '/call',
      search: {
        mode: 'outgoing',
        partnerId: callInfo.partnerId,
        partnerName: callInfo.partnerName,
        roomName: callInfo.roomName,
        token: callInfo.token,
        livekitUrl: callInfo.livekitUrl,
        callType: callInfo.callType || 'voice',
        restore: true,
        restoreDuration: callInfo.duration,
      },
    })
  }, [miniCall, navigate])

  // 드래그 핸들러
  const handleDragStart = useCallback((clientX: number, clientY: number) => {
    isDraggingRef.current = true
    dragStartRef.current = {
      x: clientX,
      y: clientY,
      posX: miniCall?.position.x || 0,
      posY: miniCall?.position.y || 0,
    }
  }, [miniCall?.position])

  const handleDragMove = useCallback((clientX: number, clientY: number) => {
    if (!isDraggingRef.current) return
    
    const deltaX = clientX - dragStartRef.current.x
    const deltaY = clientY - dragStartRef.current.y
    
    setPosition({
      x: dragStartRef.current.posX + deltaX,
      y: dragStartRef.current.posY + deltaY,
    })
  }, [setPosition])

  const handleDragEnd = useCallback(() => {
    isDraggingRef.current = false
  }, [])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    handleDragStart(e.clientX, e.clientY)
    
    const onMouseMove = (e: MouseEvent) => handleDragMove(e.clientX, e.clientY)
    const onMouseUp = () => {
      handleDragEnd()
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [handleDragStart, handleDragMove, handleDragEnd])

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    handleDragStart(touch.clientX, touch.clientY)
  }, [handleDragStart])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    handleDragMove(touch.clientX, touch.clientY)
  }, [handleDragMove])

  // 미니모드가 아니거나 통화가 없으면 렌더링 안함
  if (!miniCall || !miniCall.isMinimized) return null

  const getStatusMessage = () => {
    switch (miniCall.callState) {
      case 'connecting': return '연결 중...'
      case 'ringing': return '호출 중...'
      case 'connected': return formatDuration(miniCall.duration)
      case 'ended': return '통화 종료'
      default: return ''
    }
  }

  return (
    <div 
      className="fixed z-[99999] bg-slate-900 rounded-2xl shadow-2xl border border-slate-700 p-3 select-none touch-none"
      style={{
        bottom: `calc(6rem - ${miniCall.position.y}px)`,
        right: `calc(1rem - ${miniCall.position.x}px)`,
      }}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={handleDragEnd}
    >
      <div className="flex items-center gap-3">
        <div className={cn(
          'w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center cursor-grab active:cursor-grabbing',
          miniCall.callState === 'ringing' && 'animate-pulse'
        )}>
          <User className="w-6 h-6 text-white" />
        </div>
        <div className="text-white pointer-events-none">
          <p className="font-medium text-sm">{miniCall.partnerName}</p>
          <p className={cn(
            'text-xs',
            miniCall.callState === 'connected' ? 'text-green-400 font-mono' : 'text-slate-400'
          )}>
            {getStatusMessage()}
          </p>
        </div>
        <div className="flex gap-2 ml-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleEndCall() }}
            className="w-10 h-10 rounded-full bg-red-500 hover:bg-red-600 active:bg-red-700 flex items-center justify-center"
          >
            <PhoneOff className="w-5 h-5 text-white" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleExpand() }}
            className="w-10 h-10 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center"
          >
            <Maximize2 className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>
    </div>
  )
}

