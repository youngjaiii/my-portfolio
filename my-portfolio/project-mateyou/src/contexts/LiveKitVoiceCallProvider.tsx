import { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo, type ReactNode } from 'react'
import { Capacitor } from '@capacitor/core'
import { Device } from '@capacitor/device'
import { App } from '@capacitor/app'
import { PushNotifications } from '@capacitor/push-notifications'
import { Room, RoomEvent, Track, RemoteParticipant, createLocalAudioTrack, ConnectionState } from 'livekit-client'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/useAuthStore'
import { edgeApi } from '@/lib/edgeApi'
import { dialingTone, ringingTone, playConnectedTone, playEndTone, stopAllCallSounds } from '@/utils/callSounds'
import { useRouter } from '@tanstack/react-router'
import LiveKit from '@/plugins/LiveKit'

interface CallRoom {
  id: string
  room_code: string | null
  status: 'waiting' | 'in_call' | 'ended'
  started_at: string
  ended_at: string | null
  member_id: string | null
  partner_id: string | null
  topic: string | null
  last_signal_at: string | null
  created_at: string
}

interface IncomingCall {
  roomId: string
  from: string
  fromName: string
  peerId: string
  callId?: string | null
  roomName?: string
  url?: string
  token?: string
  callType?: 'voice' | 'video'
}

interface ActiveCall {
  partnerId: string
  partnerName: string
  callId?: string | null
  roomId: string
  roomName: string
  startedAt: Date
  duration: number
}

// LiveKit 전용 Context 타입
export interface LiveKitCallContextType {
  callState: 'idle' | 'calling' | 'receiving' | 'connected'
  activeCall: ActiveCall | null
  incomingCall: IncomingCall | null
  startCall: (partnerId: string, partnerName: string, callId?: string) => void
  answerCall: () => Promise<void>
  rejectCall: () => void
  endCall: () => Promise<void>
  isMuted: boolean
  toggleMute: () => Promise<void>
  isSpeakerOn: boolean
  toggleSpeaker: () => Promise<void>
  formatDuration: (seconds: number) => string
  navigateToChat: () => void
}

// LiveKit 전용 Context 생성
export const LiveKitCallContext = createContext<LiveKitCallContextType | null>(null)

// LiveKit 전용 hook
export function useLiveKitCall() {
  const context = useContext(LiveKitCallContext)
  if (!context) {
    throw new Error('useLiveKitCall must be used within a LiveKitVoiceCallProvider')
  }
  return context
}

export function LiveKitVoiceCallProvider({ children }: { children: ReactNode }) {
  console.log('🚀 [LiveKitVoiceCallProvider] INITIALIZING PROVIDER')

  const { user } = useAuth()
  const router = useRouter()

  console.log('👤 [LiveKitVoiceCallProvider] User:', user?.id, 'Role:', user?.role)

  // 초기화 상태 추적
  const [isInitialized, setIsInitialized] = useState(false)

  // 초기화 완료 로깅
  useEffect(() => {
    if (user && !isInitialized) {
      console.log('✅ [LiveKitVoiceCallProvider] FULLY INITIALIZED with user:', user.id)
      setIsInitialized(true)
    }
  }, [user?.id, isInitialized])

  // 핵심 상태들
  const [callState, setCallState] = useState<'idle' | 'calling' | 'receiving' | 'connected'>('idle')
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null)
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isSpeakerOn, setIsSpeakerOn] = useState(false)

  console.log('📊 [LiveKitVoiceCallProvider] Initial state - callState:', callState)

  // LiveKit 관련 상태
  const [currentRoom, setCurrentRoom] = useState<CallRoom | null>(null)

  // Refs - 클로저 문제 방지를 위해 최신 상태 유지
  const callStateRef = useRef(callState)
  const incomingCallRef = useRef(incomingCall)
  const activeCallRef = useRef(activeCall)
  const isSpeakerOnRef = useRef(isSpeakerOn)

  // LiveKit refs
  const roomRef = useRef<Room | null>(null)
  const localAudioTrackRef = useRef<any>(null)
  const durationIntervalRef = useRef<number | null>(null)
  const callingTimeoutRef = useRef<number | null>(null)
  const channelRef = useRef<any>(null)
  const isEndingRef = useRef(false)
  const endCallRef = useRef<(() => Promise<void>) | null>(null)
  
  // 초기화 가드 - 앱 생명주기 내에서 단 1회만 실행
  const iosListenersInitializedRef = useRef(false)
  const androidListenersInitializedRef = useRef(false)

  // 플랫폼 체크
  const isIOS = Capacitor.getPlatform() === 'ios'

  // Refs 동기화 - 상태 변경 시 즉시 반영
  useEffect(() => {
    callStateRef.current = callState
    console.log('🔄 [LiveKitProvider] callState updated:', callState)
  }, [callState])

  useEffect(() => {
    incomingCallRef.current = incomingCall
    console.log('🔄 [LiveKitProvider] incomingCall updated:', incomingCall?.fromName)
  }, [incomingCall])

  useEffect(() => {
    activeCallRef.current = activeCall
    console.log('🔄 [LiveKitProvider] activeCall updated:', activeCall?.partnerName)
  }, [activeCall])

  useEffect(() => {
    isSpeakerOnRef.current = isSpeakerOn
  }, [isSpeakerOn])

  // 채팅방으로 이동
  const navigateToChat = useCallback(() => {
    if (activeCall?.partnerId) {
      router.navigate({ to: '/chat' })
    }
  }, [activeCall?.partnerId, router])

  // 통화 시간 포맷팅
  const formatDuration = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }, [])

  // 통화 시간 추적
  const startDurationTracking = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
    }
    durationIntervalRef.current = window.setInterval(() => {
      setActiveCall((prev) => prev ? { ...prev, duration: prev.duration + 1 } : null)
    }, 1000)
  }, [])

  const stopDurationTracking = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }
  }, [])

  // 상태 리셋
  const resetCallState = useCallback(() => {
    console.log('🔄 [LiveKitProvider] Resetting call state')
    stopDurationTracking()
    stopAllCallSounds()

    if (callingTimeoutRef.current) {
      clearTimeout(callingTimeoutRef.current)
      callingTimeoutRef.current = null
    }

    // 웹 Room 정리 (iOS에서도 웹 Room을 사용할 수 있으므로)
    if (roomRef.current) {
      console.log('🔌 [LiveKitProvider] Disconnecting web room in resetCallState')
      try {
        roomRef.current.disconnect()
      } catch (e) {
        console.error('❌ [LiveKitProvider] Failed to disconnect room:', e)
      }
      roomRef.current = null
    }

    // 로컬 오디오 트랙 정리
    if (localAudioTrackRef.current) {
      console.log('🎤 [LiveKitProvider] Stopping local audio track')
      try {
        localAudioTrackRef.current.stop()
      } catch (e) {
        console.error('❌ [LiveKitProvider] Failed to stop audio track:', e)
      }
      localAudioTrackRef.current = null
    }

    setCallState('idle')
    setActiveCall(null)
    setIncomingCall(null)
    setIsMuted(false)
    setIsSpeakerOn(false)
    setCurrentRoom(null)
  }, [stopDurationTracking])

  // Room 이벤트 설정
  const setupRoomListeners = useCallback((room: Room) => {
    console.log('🎧 [LiveKitProvider] Setting up room listeners')

    room.on(RoomEvent.Connected, async () => {
      console.log('✅ [LiveKitProvider] Room connected, checking existing participants...')
      
      // 연결 직후 이미 연결된 참가자의 오디오 트랙 구독
      for (const participant of room.remoteParticipants.values()) {
        console.log('👤 [LiveKitProvider] Existing participant on connect:', participant.identity)
        for (const publication of participant.audioTrackPublications.values()) {
          console.log('🎵 [LiveKitProvider] Existing audio track on connect:', publication.trackSid, 'isSubscribed:', publication.isSubscribed)
          if (!publication.isSubscribed) {
            console.log('🎵 [LiveKitProvider] Subscribing to existing audio track on connect')
            try {
              await publication.setSubscribed(true)
              console.log('✅ [LiveKitProvider] Successfully subscribed to existing audio track on connect')
            } catch (error) {
              console.error('❌ [LiveKitProvider] Failed to subscribe to existing audio track on connect:', error)
            }
          }
        }
      }
    })

    room.on(RoomEvent.Disconnected, (reason) => {
      console.log('🔌 [LiveKitProvider] Room disconnected:', reason)
      if (!isEndingRef.current && callStateRef.current !== 'idle') {
        resetCallState()
      }
    })

    room.on(RoomEvent.ParticipantConnected, async (participant: RemoteParticipant) => {
      console.log('👤 [LiveKitProvider] Participant connected:', participant.identity)
      console.log('🎵 [LiveKitProvider] Participant audio tracks:', participant.audioTrackPublications.size)
      
      // 이미 발행된 오디오 트랙이 있으면 명시적으로 구독
      for (const publication of participant.audioTrackPublications.values()) {
        console.log('🎵 [LiveKitProvider] Checking audio track:', publication.trackSid, 'isSubscribed:', publication.isSubscribed)
        if (!publication.isSubscribed) {
          console.log('🎵 [LiveKitProvider] Subscribing to audio track:', publication.trackSid)
          try {
            await publication.setSubscribed(true)
            console.log('✅ [LiveKitProvider] Successfully subscribed to audio track')
          } catch (error) {
            console.error('❌ [LiveKitProvider] Failed to subscribe to audio track:', error)
          }
        } else {
          console.log('✅ [LiveKitProvider] Audio track already subscribed')
        }
      }
      
      // 발신 중이면 상대방 연결 = 통화 연결 완료
      if (callStateRef.current === 'calling') {
        console.log('✅ [LiveKitProvider] Callee connected, call established')
        // 컬러링 중지
        ringingTone.stop()
        setCallState('connected')
        startDurationTracking()
        playConnectedTone()
      }
    })

    room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      console.log('👤 [LiveKitProvider] Participant left:', participant.identity)
      // 상대방이 나가면 통화 종료
      if (!isEndingRef.current) {
        playEndTone()
        resetCallState()
      }
    })

    // 트랙이 발행될 때 구독
    room.on(RoomEvent.TrackPublished, async (publication, participant) => {
      console.log('📢 [LiveKitProvider] Track published:', publication.kind, 'from participant:', participant.identity)
      
      // 오디오 트랙이 발행되면 즉시 구독
      if (publication.kind === Track.Kind.Audio && !publication.isSubscribed) {
        console.log('🎵 [LiveKitProvider] Subscribing to published audio track')
        try {
          await publication.setSubscribed(true)
        } catch (error) {
          console.error('❌ [LiveKitProvider] Failed to subscribe to published audio track:', error)
        }
      }
    })

    room.on(RoomEvent.TrackSubscribed, async (track, publication, participant) => {
      console.log('🎵 [LiveKitProvider] Track subscribed:', track.kind, 'from participant:', participant.identity, 'trackSid:', publication.trackSid)
      
      // 오디오 트랙이면 자동으로 재생
      if (track.kind === Track.Kind.Audio) {
        console.log('🎵 [LiveKitProvider] Audio track subscribed, attaching and playing...')
        console.log('🎵 [LiveKitProvider] Track details - sid:', track.sid, 'mediaStreamTrack:', !!track.mediaStreamTrack)
        
        try {
          const audioElement = track.attach()
          console.log('✅ [LiveKitProvider] Audio element attached:', audioElement)
          audioElement.autoplay = true
          ;(audioElement as any).playsInline = true
          audioElement.volume = 1.0
          audioElement.muted = false
          
          // DOM에 추가
          if (!document.body.contains(audioElement)) {
            audioElement.style.display = 'none'
            document.body.appendChild(audioElement)
            console.log('✅ [LiveKitProvider] Audio element added to DOM')
          }
          
          // 전역 AudioContext 활성화 (웹에서 오디오 재생 보장)
          try {
            const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext
            if (AudioContextClass) {
              if (!(window as any).__callAudioContext) {
                (window as any).__callAudioContext = new AudioContextClass()
              }
              const ctx = (window as any).__callAudioContext
              if (ctx.state === 'suspended') {
                await ctx.resume()
                console.log('✅ [LiveKitProvider] AudioContext resumed for remote audio')
              }
              if (ctx.state !== 'running') {
                await ctx.resume()
              }
              console.log('✅ [LiveKitProvider] AudioContext state:', ctx.state)
            }
          } catch (ctxError) {
            console.warn('⚠️ [LiveKitProvider] AudioContext resume failed:', ctxError)
          }
          
          // 오디오 엘리먼트의 srcObject 확인
          console.log('🎵 [LiveKitProvider] Audio element srcObject:', !!audioElement.srcObject)
          if (audioElement.srcObject) {
            const stream = audioElement.srcObject as MediaStream
            console.log('🎵 [LiveKitProvider] MediaStream tracks:', stream.getAudioTracks().length)
            stream.getAudioTracks().forEach((track, idx) => {
              console.log(`🎵 [LiveKitProvider] Audio track ${idx}:`, track.id, 'enabled:', track.enabled, 'muted:', track.muted, 'readyState:', track.readyState)
            })
          }
          
          const playAudio = async (retries = 5) => {
            for (let i = 0; i < retries; i++) {
              try {
                audioElement.muted = false
                audioElement.volume = 1.0
                
                // 오디오 엘리먼트 상태 확인
                console.log(`🎵 [LiveKitProvider] Attempt ${i + 1}/${retries} - muted:`, audioElement.muted, 'volume:', audioElement.volume, 'paused:', audioElement.paused)
                
                await audioElement.play()
                console.log('✅ [LiveKitProvider] Remote audio playing successfully!')
                console.log('🎵 [LiveKitProvider] Audio element currentTime:', audioElement.currentTime, 'duration:', audioElement.duration)
                return
              } catch (playError: any) {
                console.warn(`⚠️ [LiveKitProvider] Audio play attempt ${i + 1} failed:`, playError.name, playError.message)
                if (i === retries - 1) {
                  console.error('❌ [LiveKitProvider] Audio autoplay failed after all retries:', playError)
                  // 사용자 상호작용 후 재생 시도
                  const playOnInteraction = async () => {
                    try {
                      audioElement.muted = false
                      audioElement.volume = 1.0
                      await audioElement.play()
                      console.log('✅ [LiveKitProvider] Remote audio playing after user interaction')
                      window.removeEventListener('click', playOnInteraction)
                      window.removeEventListener('touchstart', playOnInteraction)
                    } catch (e) {
                      console.error('❌ [LiveKitProvider] Failed to play audio after interaction:', e)
                    }
                  }
                  window.addEventListener('click', playOnInteraction, { once: true })
                  window.addEventListener('touchstart', playOnInteraction, { once: true })
                } else {
                  // 재시도 전 대기 시간 증가
                  await new Promise(resolve => setTimeout(resolve, 200 * (i + 1)))
                }
              }
            }
          }
          
          await playAudio()
        } catch (error) {
          console.error('❌ [LiveKitProvider] Failed to attach audio track:', error)
        }
      }
    })
  }, [startDurationTracking, resetCallState])

  // 통화 시작 - UI 우선 비동기 연결 방식
  const startCall = useCallback(async (partnerId: string, partnerName: string, callId?: string) => {
    console.log('🎯 [LiveKitProvider] startCall FUNCTION CALLED with:', { partnerId, partnerName, callId })

    if (!user?.id || callState !== 'idle') {
      console.warn('⚠️ [LiveKitProvider] Cannot start call:', {
        hasUser: !!user?.id,
        userId: user?.id,
        callState,
        expectedState: 'idle'
      })
      return
    }

    console.log('✅ [LiveKitProvider] Validation passed, proceeding with call to:', partnerName, 'partnerId:', partnerId)

    // 🚨 즉시 UI 표시 - 팝업 우선!
    setCallState('calling')
    const newActiveCall: ActiveCall = {
      partnerId,
      partnerName,
      callId,
      roomId: `temp_${Date.now()}`, // 임시 roomId
      roomName: `temp_${Date.now()}`, // 임시 roomName
      startedAt: new Date(),
      duration: 0,
    }
    setActiveCall(newActiveCall)
    console.log('✅ [LiveKitProvider] UI displayed immediately - callState: calling, activeCall set')
    
    // 발신 중 컬러링 시작 (웹/Android만, iOS는 네이티브 다이얼톤 사용)
    if (!isIOS) {
      ringingTone.start().catch(() => {
        console.warn('⚠️ [LiveKitProvider] Ringing tone failed')
      })
    }

    // 🔄 뒤에서 LiveKit 연결 진행 (비동기)
    connectToLiveKitAsync(partnerId, partnerName, callId, newActiveCall)
  }, [user?.id, callState])

  // LiveKit 연결을 별도 비동기 함수로 분리
  const connectToLiveKitAsync = useCallback(async (
    partnerId: string,
    partnerName: string,
    callId?: string,
    activeCallData?: ActiveCall
  ) => {
    try {
      console.log('🔧 [LiveKitProvider] Starting async LiveKit connection...')

      // 1. 룸 생성 및 토큰 받기
      const response = await edgeApi.livekit.createRoom(partnerId, 'voice')
      const responseData = (response as any).data || response

      if (!responseData.success && !responseData.token) {
        throw new Error((response as any).error?.message || 'Failed to create room')
      }

      const { token, url, roomName } = responseData
      console.log('✅ [LiveKitProvider] Room created:', roomName)

      // 2. call_rooms 테이블에 기록
      try {
        await supabase.from('call_rooms').insert({
          room_code: roomName,
          status: 'waiting',
          started_at: new Date().toISOString(),
          member_id: user!.id,
          partner_id: partnerId,
          topic: `voice_call_${user!.id}_${partnerId}`,
          last_signal_at: new Date().toISOString(),
        })
        console.log('✅ [LiveKitProvider] Call recorded to database')
      } catch (dbError) {
        console.error('❌ [LiveKitProvider] Database error:', dbError)
      }

      // 3. 상대방에게 통화 요청 브로드캐스트
      console.log('📡 [LiveKitProvider] Broadcasting call request...')
      const channel = supabase.channel(`call-notifications-${partnerId}`)
      await channel.subscribe()
      await channel.send({
        type: 'broadcast',
        event: 'livekit-call-request',
        payload: {
          from: user!.id,
          fromName: user!.name || 'Unknown',
          to: partnerId,
          roomName,
          url,
          callId,
          timestamp: Date.now(),
        },
      })
      channel.unsubscribe()
      console.log('✅ [LiveKitProvider] Call request broadcasted')

      // 4. activeCall 업데이트 (실제 room 정보로)
      const updatedActiveCall: ActiveCall = {
        ...activeCallData!,
        roomId: roomName,
        roomName,
      }
      setActiveCall(updatedActiveCall)
      console.log('✅ [LiveKitProvider] activeCall updated with real room info')

      // 5. 플랫폼별 통화 연결 시작
      if (isIOS) {
        await startIOSCall(token, url, roomName, partnerName, updatedActiveCall)
      } else {
        await startWebCall(token, url, roomName)
      }

      // 6. 타임아웃 설정
      callingTimeoutRef.current = window.setTimeout(() => {
        if (callStateRef.current === 'calling') {
          console.warn('⏰ [LiveKitProvider] Call timeout')
          alert('상대방이 응답하지 않습니다.')
          endCallRef.current?.()
        }
      }, 60000)

    } catch (error: any) {
      console.error('❌ [LiveKitProvider] Async connection failed:', error)
      
      // iOS CallKit 종료
      if (isIOS) {
        await LiveKit.endCall().catch(() => {})
      }
      ringingTone.stop()
      
      // 통화중/동시발신 에러 처리
      const errorMessage = error.message?.toLowerCase() || ''
      if (errorMessage.includes('busy') || errorMessage.includes('통화중')) {
        alert('상대방이 통화중입니다')
      } else if (errorMessage.includes('concurrent') || errorMessage.includes('전화를 걸고')) {
        alert('상대방이 전화를 걸고 있습니다')
      } else {
        alert(`통화 연결 실패: ${error.message}`)
      }
      
      resetCallState()
    }
  }, [user?.id, isIOS])

  // iOS 통화 시작 헬퍼
  const startIOSCall = useCallback(async (
    token: string,
    url: string,
    roomName: string,
    partnerName: string,
    activeCallData: ActiveCall
  ) => {
    try {
      console.log('🍎 [LiveKitProvider] Starting iOS call...')

      // 다이얼톤 시작
      await LiveKit.startDialTone().catch(() => {
        console.warn('⚠️ [LiveKitProvider] Dial tone failed')
      })

      // CallKit 발신 UI 표시
      console.log('📞 [LiveKitProvider] Starting CallKit outgoing call...')
      await LiveKit.startOutgoingCall({
        callerName: partnerName,
        callUUID: roomName,
      })

      // LiveKit 연결
      console.log('🔌 [LiveKitProvider] Connecting to LiveKit...')
      await LiveKit.connect({ url, token, roomName, callType: 'voice' })

      console.log('✅ [LiveKitProvider] iOS call started successfully')

      // 🎵 연결 성공 시 다이얼톤 재생!
      console.log('📞 [LiveKitProvider] Playing dial tone after connection')
      await LiveKit.startDialTone().catch(() => {
        console.warn('⚠️ [LiveKitProvider] Dial tone failed after connection')
      })

      // DB 상태 업데이트 (in_call로)
      try {
        await supabase
          .from('call_rooms')
          .update({
            status: 'in_call',
            last_signal_at: new Date().toISOString()
          })
          .eq('room_code', roomName)
        console.log('✅ [LiveKitProvider] DB updated to in_call')
      } catch (dbError) {
        console.error('❌ [LiveKitProvider] DB update failed:', dbError)
      }

    } catch (error) {
      console.error('❌ [LiveKitProvider] iOS call start failed:', error)
      throw error
    }
  }, [])

  // 웹 통화 시작 헬퍼
  const startWebCall = useCallback(async (token: string, url: string, roomName: string) => {
    try {
      console.log('🌐 [LiveKitProvider] Starting web call...')

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      })

      roomRef.current = room
      setupRoomListeners(room)

      await room.connect(url, token)

      // 이미 연결된 참가자의 오디오 트랙 구독 확인
      for (const participant of room.remoteParticipants.values()) {
        console.log('👤 [LiveKitProvider] Existing participant:', participant.identity)
        for (const publication of participant.audioTrackPublications.values()) {
          console.log('🎵 [LiveKitProvider] Existing audio track:', publication.trackSid, 'isSubscribed:', publication.isSubscribed)
          if (!publication.isSubscribed) {
            console.log('🎵 [LiveKitProvider] Subscribing to existing audio track')
            try {
              await publication.setSubscribed(true)
            } catch (error) {
              console.error('❌ [LiveKitProvider] Failed to subscribe to existing audio track:', error)
            }
          }
        }
      }

      const audioTrack = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: false,
      })

      localAudioTrackRef.current = audioTrack
      await room.localParticipant.publishTrack(audioTrack)

      console.log('✅ [LiveKitProvider] Web call started successfully')

      // DB 상태 업데이트 (in_call로)
      try {
        await supabase
          .from('call_rooms')
          .update({
            status: 'in_call',
            last_signal_at: new Date().toISOString()
          })
          .eq('room_code', roomName)
        console.log('✅ [LiveKitProvider] Web call DB updated to in_call')
      } catch (dbError) {
        console.error('❌ [LiveKitProvider] Web call DB update failed:', dbError)
      }

    } catch (error) {
      console.error('❌ [LiveKitProvider] Web call start failed:', error)
      throw error
    }
  }, [setupRoomListeners])

  // 통화 응답
  const answerCall = useCallback(async () => {
    if (!incomingCall || !user?.id || callState !== 'receiving') {
      console.warn('⚠️ [LiveKitProvider] Cannot answer call: invalid state')
      return
    }

    console.log('📞 [LiveKitProvider] Answering call from:', incomingCall.fromName)

    try {
      stopAllCallSounds()
      // 수신자 연결음 재생
      playConnectedTone()

      if (isIOS) {
        // iOS: 네이티브 Room만 사용 (웹 Room 생성하지 않음 - 충돌 방지)
        const pendingInfo = await LiveKit.getPendingCallInfo()
        if (pendingInfo.hasPendingCall && pendingInfo.livekitUrl && pendingInfo.livekitToken) {
          console.log('🍎 [LiveKitProvider] iOS: Connecting native Room only')
          await LiveKit.connect({
            url: pendingInfo.livekitUrl,
            token: pendingInfo.livekitToken,
            roomName: pendingInfo.roomName!,
            callType: (pendingInfo.callType as 'voice' | 'video') || 'voice'
          })
          console.log('✅ [LiveKitProvider] iOS: Native Room connected')
          await LiveKit.clearPendingCallInfo()
        }
      } else {
        // 웹/Android: 토큰 발급받아서 연결
        const tokenResult = await edgeApi.livekit.getToken(incomingCall.roomName!) as { success: boolean; data?: { token: string; url: string } }
        if (!tokenResult.success || !tokenResult.data) {
          throw new Error('Failed to get token')
        }
        
        const room = new Room()
        roomRef.current = room
        setupRoomListeners(room)

        await room.connect(tokenResult.data.url, tokenResult.data.token)
        
        // 이미 연결된 참가자의 오디오 트랙 구독 확인
        for (const participant of room.remoteParticipants.values()) {
          console.log('👤 [LiveKitProvider] Existing participant:', participant.identity)
          for (const publication of participant.audioTrackPublications.values()) {
            console.log('🎵 [LiveKitProvider] Existing audio track:', publication.trackSid, 'isSubscribed:', publication.isSubscribed)
            if (!publication.isSubscribed) {
              console.log('🎵 [LiveKitProvider] Subscribing to existing audio track')
              try {
                await publication.setSubscribed(true)
              } catch (error) {
                console.error('❌ [LiveKitProvider] Failed to subscribe to existing audio track:', error)
              }
            }
          }
        }
        
        const audioTrack = await createLocalAudioTrack({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
        })
        localAudioTrackRef.current = audioTrack
        await room.localParticipant.publishTrack(audioTrack)
      }

      setCallState('connected')
      startDurationTracking()

      // 다른 환경에 수락 알림 브로드캐스트 (같은 계정의 다른 기기에서 수신 중지)
      try {
        const answeredChannel = supabase.channel(`call-notifications-${user.id}`)
        await answeredChannel.subscribe()
        await answeredChannel.send({
          type: 'broadcast',
          event: 'livekit-call-answered',
          payload: {
            roomName: incomingCall.roomName,
            answeredBy: user.id,
            timestamp: Date.now(),
          },
        })
        answeredChannel.unsubscribe()
        console.log('📡 [LiveKitProvider] Call answered broadcast sent')
      } catch (e) {
        console.error('❌ [LiveKitProvider] Failed to broadcast call answered:', e)
      }

      setActiveCall({
        partnerId: incomingCall.from,
        partnerName: incomingCall.fromName,
        callId: incomingCall.callId,
        roomId: incomingCall.roomId,
        roomName: incomingCall.roomName!,
        startedAt: new Date(),
        duration: 0,
      })

    } catch (error: unknown) {
      console.error('❌ [LiveKitProvider] Answer call failed:', error)
      resetCallState()
    }
  }, [incomingCall, user, callState, isIOS, setupRoomListeners, startDurationTracking, resetCallState])

  // 통화 거절
  const rejectCall = useCallback(async () => {
    if (!incomingCall || callState !== 'receiving') {
      console.warn('⚠️ [LiveKitProvider] Cannot reject call: invalid state')
      return
    }

    console.log('📞 [LiveKitProvider] Rejecting call from:', incomingCall.from)
    stopAllCallSounds()

    if (isIOS) {
      // iOS: CallKit 통화 종료
      await LiveKit.endCall()
      await LiveKit.clearPendingCallInfo()
    }

    // 발신측에 거절 알림 브로드캐스트
    try {
      const channel = supabase.channel(`call-notifications-${incomingCall.from}`)
      await channel.subscribe()
      await channel.send({
        type: 'broadcast',
        event: 'livekit-call-ended',
        payload: {
          from: user?.id,
          to: incomingCall.from,
          roomName: incomingCall.roomName,
          reason: 'rejected',
          timestamp: Date.now(),
        },
      })
      channel.unsubscribe()
      console.log('✅ [LiveKitProvider] Rejection sent to caller')
    } catch (e) {
      console.error('❌ [LiveKitProvider] Failed to send rejection:', e)
    }

    // 다른 환경(같은 수신자 계정)에 거절 알림 브로드캐스트
    try {
      const selfChannel = supabase.channel(`call-notifications-${user?.id}`)
      await selfChannel.subscribe()
      await selfChannel.send({
        type: 'broadcast',
        event: 'livekit-call-ended',
        payload: {
          roomName: incomingCall.roomName,
          reason: 'rejected',
          timestamp: Date.now(),
        },
      })
      selfChannel.unsubscribe()
      console.log('✅ [LiveKitProvider] Rejection sent to other devices')
    } catch (e) {
      console.error('❌ [LiveKitProvider] Failed to send rejection to other devices:', e)
    }

    // 서버에 통화 종료 API 호출
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-livekit/room/end`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ roomName: incomingCall.roomName }),
      })
    } catch (e) {
      console.error('❌ [LiveKitProvider] Failed to end room:', e)
    }

    resetCallState()
  }, [incomingCall, callState, isIOS, user, resetCallState])

  // 통화 종료 - 확실한 iOS LiveKit 연동
  const endCall = useCallback(async () => {
    if (isEndingRef.current) return
    isEndingRef.current = true

    console.log('📞 [LiveKitProvider] Ending call - activeCall:', activeCall?.partnerName)

    try {
      stopAllCallSounds()
      playEndTone()

      // DB 업데이트
      if (activeCall?.roomName) {
        console.log('💾 [LiveKitProvider] Updating DB for call end')
        await supabase
          .from('call_rooms')
          .update({
            status: 'ended',
            ended_at: new Date().toISOString(),
            last_signal_at: new Date().toISOString(),
          })
          .eq('room_code', activeCall.roomName)
        console.log('✅ [LiveKitProvider] DB updated to ended')
      }

      // 플랫폼별 정리
      if (isIOS) {
        // 음성통화 미니모드 숨기기
        await LiveKit.hideVoiceCallMiniMode().catch(() => {})
        
        console.log('🍎 [LiveKitProvider] iOS: Calling LiveKit.endCall')
        await LiveKit.endCall().catch((error) => {
          console.error('❌ [LiveKitProvider] LiveKit.endCall failed:', error)
        })
        console.log('✅ [LiveKitProvider] iOS call ended')

        // 웹 Room도 정리 (iOS에서도 answerCall 시 웹 Room을 생성했을 수 있음)
        if (roomRef.current) {
          console.log('🌐 [LiveKitProvider] iOS: Disconnecting web room')
          try {
            await roomRef.current.disconnect()
            console.log('✅ [LiveKitProvider] iOS web room disconnected')
          } catch (e) {
            console.error('❌ [LiveKitProvider] Failed to disconnect web room:', e)
          }
          roomRef.current = null
        }

        // 약간의 딜레이 후 네이티브 disconnect
        setTimeout(async () => {
          try {
            console.log('🔌 [LiveKitProvider] iOS: Calling LiveKit.disconnect')
            await LiveKit.disconnect()
            console.log('✅ [LiveKitProvider] iOS LiveKit disconnected')
          } catch (error) {
            console.error('❌ [LiveKitProvider] LiveKit.disconnect failed:', error)
          }
        }, 1000)
      } else {
        console.log('🌐 [LiveKitProvider] Web: Disconnecting room')
        if (roomRef.current) {
          await roomRef.current.disconnect()
          roomRef.current = null
          console.log('✅ [LiveKitProvider] Web room disconnected')
        }
      }

      // 상대방에게 종료 알림
      if (activeCall?.partnerId) {
        console.log('📡 [LiveKitProvider] Broadcasting call end to partner')
        const channel = supabase.channel(`call-notifications-${activeCall.partnerId}`)
        await channel.subscribe()
        await channel.send({
          type: 'broadcast',
          event: 'livekit-call-ended',
          payload: {
            from: user?.id,
            to: activeCall.partnerId,
            roomName: activeCall.roomName,
            timestamp: Date.now(),
          },
        })
        channel.unsubscribe()
        console.log('✅ [LiveKitProvider] Call end broadcasted')
      }

    } catch (error) {
      console.error('❌ [LiveKitProvider] End call failed:', error)
    } finally {
      console.log('🔄 [LiveKitProvider] Resetting call state')
      resetCallState()
      isEndingRef.current = false
    }
  }, [activeCall, isIOS, resetCallState, user])

  // endCallRef 동기화
  useEffect(() => {
    endCallRef.current = endCall
  }, [endCall])

  // 음소거 토글 - 확실한 iOS LiveKit 연동
  const toggleMute = useCallback(async () => {
    console.log('🎤 [LiveKitProvider] Toggle mute called - current:', isMuted)
    const newMuted = !isMuted

    try {
      if (isIOS) {
        console.log('🍎 [LiveKitProvider] iOS: Calling LiveKit.setMicrophoneEnabled with:', !newMuted)
        const result = await LiveKit.setMicrophoneEnabled({ enabled: !newMuted })
        console.log('✅ [LiveKitProvider] iOS LiveKit result:', result)

        if (result.success) {
          setIsMuted(newMuted)
          console.log('✅ [LiveKitProvider] iOS mute state updated to:', newMuted)
        } else {
          console.error('❌ [LiveKitProvider] iOS LiveKit setMicrophoneEnabled failed')
        }
      } else {
        console.log('🌐 [LiveKitProvider] Web: Setting microphone enabled:', !newMuted)
        if (roomRef.current) {
          await roomRef.current.localParticipant.setMicrophoneEnabled(!newMuted)
          setIsMuted(newMuted)
          console.log('✅ [LiveKitProvider] Web mute state updated to:', newMuted)
        } else {
          console.warn('⚠️ [LiveKitProvider] Web: No room available for mute toggle')
        }
      }
    } catch (error) {
      console.error('❌ [LiveKitProvider] Toggle mute failed:', error)
    }
  }, [isMuted, isIOS])

  // 스피커 토글 - 확실한 iOS LiveKit 연동
  const toggleSpeaker = useCallback(async () => {
    console.log('🔊 [LiveKitProvider] Toggle speaker called - current:', isSpeakerOn)
    const newSpeaker = !isSpeakerOn

    try {
      if (isIOS) {
        console.log('🍎 [LiveKitProvider] iOS: Calling LiveKit.setSpeakerMode with:', newSpeaker)
        const result = await LiveKit.setSpeakerMode({ speaker: newSpeaker })
        console.log('✅ [LiveKitProvider] iOS LiveKit speaker result:', result)

        // CallKit에서는 시스템이 자동으로 처리하므로 무조건 성공으로 간주
        setIsSpeakerOn(newSpeaker)
        console.log('✅ [LiveKitProvider] iOS speaker state updated to:', newSpeaker)
      } else {
        console.log('🌐 [LiveKitProvider] Web: Speaker toggle not implemented for web')
        // 웹에서는 스피커 토글이 의미가 적음
        setIsSpeakerOn(newSpeaker)
      }
    } catch (error) {
      console.error('❌ [LiveKitProvider] Toggle speaker failed:', error)
      // 에러가 발생해도 UI 상태는 업데이트
      setIsSpeakerOn(newSpeaker)
    }
  }, [isSpeakerOn, isIOS])

  // VoIP 토큰 저장 함수
  const pendingVoIPTokenRef = useRef<{ token: string; apnsEnv: 'sandbox' | 'production' } | null>(null)
  
  const saveVoIPToken = useCallback(async (token: string, apnsEnv: 'sandbox' | 'production') => {
    const userId = useAuthStore.getState().user?.id
    if (token && userId) {
      try {
        const deviceInfo = await Device.getId()
        await edgeApi.livekit.saveVoIPToken(token, deviceInfo.identifier, apnsEnv)
        console.log('✅ [LiveKitProvider] VoIP token saved with apnsEnv:', apnsEnv)
      } catch (error) {
        console.error('❌ [LiveKitProvider] Failed to save VoIP token:', error)
      }
    } else if (token) {
      console.log('⏳ [LiveKitProvider] VoIP token received but no user, will retry on auth')
      pendingVoIPTokenRef.current = { token, apnsEnv }
    }
  }, [])
  
  // VoIP 토큰 리스너 + 기존 토큰 확인
  const voipTokenListenerRef = useRef<{ remove: () => void } | null>(null)
  
  useEffect(() => {
    if (!isIOS || voipTokenListenerRef.current) return

    console.log(`📱 [LiveKitProvider] Setting up VoIP token listener`)
    
    // 리스너 설정
    LiveKit.addListener('voipTokenReceived', async (info: { token?: string; apnsEnv?: string }) => {
      console.log('📱 [LiveKitProvider] VoIP token received via listener, apnsEnv:', info.apnsEnv)
      if (info.token) {
        const apnsEnv = (info.apnsEnv === 'sandbox' ? 'sandbox' : 'production') as 'sandbox' | 'production'
        await saveVoIPToken(info.token, apnsEnv)
      }
    }).then(l => { voipTokenListenerRef.current = l })
    
    // 이미 받은 토큰이 있는지 확인 (리스너 설정 전에 토큰이 도착했을 수 있음)
    LiveKit.getVoIPToken().then(async (result) => {
      if (result.token) {
        console.log('📱 [LiveKitProvider] Found existing VoIP token, apnsEnv:', result.apnsEnv)
        const apnsEnv = (result.apnsEnv === 'sandbox' ? 'sandbox' : 'production') as 'sandbox' | 'production'
        await saveVoIPToken(result.token, apnsEnv)
      }
    }).catch((err: unknown) => console.error('❌ [LiveKitProvider] getVoIPToken failed:', err))
  }, [isIOS, saveVoIPToken])

  // 로그인 후 pending VoIP 토큰 저장
  useEffect(() => {
    if (!isIOS || !user?.id || !pendingVoIPTokenRef.current) return
    
    const { token, apnsEnv } = pendingVoIPTokenRef.current
    pendingVoIPTokenRef.current = null
    
    console.log('📱 [LiveKitProvider] Saving pending VoIP token after auth, apnsEnv:', apnsEnv)
    saveVoIPToken(token, apnsEnv)
  }, [isIOS, user?.id, saveVoIPToken])

  // iOS 통화 이벤트 리스너 (user 필요)
  useEffect(() => {
    if (!isIOS || !user?.id) return

    console.log(`📡 [LiveKitProvider] Setting up iOS call event listeners`)

    const listeners: any[] = []

    // 수신 통화
    LiveKit.addListener('incomingCall', async (info) => {
      console.log('📞 [LiveKitProvider] Incoming call from PushKit:', info)
      if (callStateRef.current === 'idle') {
        setIncomingCall({
          roomId: info.roomName,
          roomName: info.roomName,
          from: info.callerId,
          fromName: info.callerName,
          peerId: info.callerId,
          callId: null,
        })
        setCallState('receiving')
      }
    }).then(l => listeners.push(l))

    // 통화 수락 (CallKit에서) → 웹에서 LiveKit 연결하도록 /call로 이동
    LiveKit.addListener('callAnswered', async (info: { callUUID?: string; hasPendingInfo?: boolean }) => {
      console.log('📞 [LiveKitProvider] Call answered via CallKit:', info)
      stopAllCallSounds()
      setIncomingCall(null)
      
      // pendingInfo에서 통화 정보 가져와서 /call로 이동
      const pendingInfo = await LiveKit.getPendingCallInfo()
      
      if (pendingInfo.hasPendingCall) {
        router.navigate({
          to: '/call',
          search: {
            mode: 'incoming',
            partnerId: pendingInfo.callerId!,
            partnerName: pendingInfo.callerName!,
            roomName: pendingInfo.roomName!,
            token: pendingInfo.livekitToken!,
            livekitUrl: pendingInfo.livekitUrl!,
            callType: (pendingInfo.callType as 'voice' | 'video') || 'voice',
          },
        })
        await LiveKit.clearPendingCallInfo()
        console.log('✅ [LiveKitProvider] Navigating to /call - web will connect')
      }
    }).then(l => listeners.push(l))

    // 통화 종료/거절 (CallKit에서)
    LiveKit.addListener('callEnded', async (info: { callUUID?: string; reason?: string; callerId?: string; roomName?: string }) => {
      console.log('📞 [LiveKitProvider] Call ended via CallKit:', info)
      
      // 상대방에게 거절/종료 알림 브로드캐스트
      if (info.callerId && info.reason === 'rejected') {
        try {
          const channel = supabase.channel(`call-notifications-${info.callerId}`)
          await channel.subscribe()
          await channel.send({
            type: 'broadcast',
            event: 'livekit-call-ended',
            payload: {
              from: user?.id,
              to: info.callerId,
              roomName: info.roomName,
              reason: 'rejected',
              timestamp: Date.now(),
            },
          })
          channel.unsubscribe()
          console.log('✅ [LiveKitProvider] Call rejection broadcasted to:', info.callerId)
        } catch (error) {
          console.error('❌ [LiveKitProvider] Failed to broadcast rejection:', error)
        }
      }
      
      // 진행 중인 통화면 종료
      if (callStateRef.current !== 'idle') {
        playEndTone()
        await endCall()
      } else {
        // 수신 중이었으면 상태 리셋
        playEndTone()
        resetCallState()
      }
      
      await LiveKit.clearPendingCallInfo()
    }).then(l => listeners.push(l))

    // iOS 상대방 연결 (발신자 쪽)
    LiveKit.addListener('participantConnected', (info: { participantId?: string; participantName?: string }) => {
      console.log('👤 [LiveKitProvider] iOS participant connected:', info)
      
      if (callStateRef.current === 'calling') {
        console.log('✅ [LiveKitProvider] Callee connected via iOS')
        // 컬러링 중지 (웹/Android에서만 사용되지만 안전을 위해)
        ringingTone.stop()
        setCallState('connected')
        startDurationTracking()
        playConnectedTone()
      }
    }).then(l => listeners.push(l))

    // iOS 오디오 트랙 구독 (네이티브에서 오디오 트랙이 구독되면 웹으로 알림)
    // 네이티브에서 오디오를 재생하므로 웹에서는 별도 처리 불필요
    LiveKit.addListener('trackSubscribed', (info: { participantId?: string; trackType?: string }) => {
      console.log('🎵 [LiveKitProvider] iOS track subscribed:', info)
      // 네이티브에서 오디오를 재생하므로 웹에서는 로그만 출력
    }).then(l => listeners.push(l))

    // iOS 상대방 연결 해제 (통화 종료)
    LiveKit.addListener('participantDisconnected', () => {
      console.log('👤 [LiveKitProvider] iOS participant disconnected')
      
      if (callStateRef.current !== 'idle' && !isEndingRef.current) {
        console.log('📴 [LiveKitProvider] Ending call due to participant disconnect')
        playEndTone()
        endCall()
      }
    }).then(l => listeners.push(l))

    // iOS 연결 해제
    LiveKit.addListener('disconnected', () => {
      console.log('🔌 [LiveKitProvider] iOS disconnected')
      
      if (callStateRef.current !== 'idle' && !isEndingRef.current) {
        resetCallState()
      }
    }).then(l => listeners.push(l))

    // iOS 네이티브 통화 연결 완료
    LiveKit.addListener('autoConnected', (info: { 
      success: boolean
      roomName: string
      callType: string
    }) => {
      console.log('📱 [LiveKitProvider] Native autoConnected:', info)
      
      if (info.success) {
        // 통화 연결 완료 - 상태만 업데이트 (미니모드는 사용자가 직접 활성화)
        setCallState('connected')
        startDurationTracking()
      }
    }).then(l => listeners.push(l))

    // 음성통화 미니모드에서 확대 버튼 탭
    LiveKit.addListener('voiceMiniModeExpanded', (info: { partnerName: string }) => {
      console.log('📱 [LiveKitProvider] Voice mini mode expanded:', info)
      // /call 페이지로 이동
      router.navigate({
        to: '/call',
        search: {
          mode: 'outgoing',
          partnerId: activeCall?.partnerId || '',
          partnerName: info.partnerName,
          callType: 'voice',
        },
      })
    }).then(l => listeners.push(l))

    // 음성통화 미니모드에서 종료 버튼 탭
    LiveKit.addListener('voiceMiniModeCallEnded', () => {
      console.log('📱 [LiveKitProvider] Voice mini mode call ended')
      playEndTone()
      endCall()
    }).then(l => listeners.push(l))

    // 잠금 화면에서 CallKit 통화 수락 시 이벤트 리스너
    const handleCallKitAnswered = async (event: Event) => {
      const customEvent = event as CustomEvent
      const detail = customEvent.detail as {
        callerId?: string
        callerName?: string
        roomName?: string
        livekitUrl?: string
        livekitToken?: string
        callType?: string
        mode?: string
      }
      
      console.log('📞 [LiveKitProvider] CallKit answered event received:', detail)
      
      if (detail.roomName && detail.livekitToken && detail.livekitUrl) {
        // /call로 이동
        window.location.href = `/call?mode=incoming&partnerId=${detail.callerId}&partnerName=${encodeURIComponent(detail.callerName || '통화 상대')}&roomName=${detail.roomName}&token=${detail.livekitToken}&livekitUrl=${encodeURIComponent(detail.livekitUrl)}&callType=${detail.callType || 'voice'}`
      }
    }
    
    window.addEventListener('native-callkit-answered', handleCallKitAnswered)
    
    return () => {
      listeners.forEach((h) => h?.remove?.())
      window.removeEventListener('native-callkit-answered', handleCallKitAnswered)
    }
  }, [isIOS, user, answerCall, endCall, startDurationTracking, resetCallState])

  // iOS: 앱 포그라운드 복귀 시 통화 상태 확인
  useEffect(() => {
    if (!isIOS || !user?.id) return
    
    const checkActiveCall = async () => {
      try {
        const state = await LiveKit.getActiveCallState()
        console.log('📱 [LiveKitProvider] App resumed, active call state:', state)
        
        // 통화 정보가 있고 현재 idle 상태면 복원
        if (state.hasActiveCall && callStateRef.current === 'idle') {
          console.log('📞 [LiveKitProvider] Resuming active call, isConnected:', state.isConnected)
          
          // 연결됨 or 연결 중
          setCallState(state.isConnected ? 'connected' : 'calling')
          if (state.isConnected) {
            startDurationTracking()
            playConnectedTone()
          }
          
          setActiveCall({
            partnerId: state.callerId!,
            partnerName: state.callerName!,
            callId: null,
            roomId: state.roomName!,
            roomName: state.roomName!,
            startedAt: new Date(),
            duration: 0,
          })
          
          console.log('✅ [LiveKitProvider] Active call resumed')
        }
      } catch (error) {
        console.error('❌ [LiveKitProvider] Failed to check active call:', error)
      }
    }
    
    // 앱 활성화 시 체크
    const listener = App.addListener('appStateChange', async ({ isActive }) => {
      if (isActive) {
        console.log('📱 [LiveKitProvider] App became active')
        await checkActiveCall()
      }
    })
    
    // 초기 체크 (앱 시작 시)
    checkActiveCall()
    
    return () => {
      listener.then(l => l.remove())
    }
  }, [isIOS, user?.id, startDurationTracking])

  // 실시간 리스너 (Supabase Realtime) - 모든 플랫폼
  useEffect(() => {
    if (!user?.id) return

    console.log(`📡 [LiveKitProvider] Setting up realtime listeners for user: ${user.id}`)

    const channel = supabase.channel(`call-notifications-${user.id}`)
    channelRef.current = channel

    channel
      .on('broadcast', { event: 'livekit-call-request' }, (payload) => {
        // iOS는 VoIP 푸시로 처리하므로 웹/Android만
        if (isIOS) return
        
        console.log('📞 [LiveKitProvider] Incoming call request:', payload)
        if (callStateRef.current === 'idle') {
          setIncomingCall({
            roomId: payload.payload.roomName,
            roomName: payload.payload.roomName,
            from: payload.payload.from,
            fromName: payload.payload.fromName,
            peerId: payload.payload.from,
            callId: payload.payload.callId,
            url: payload.payload.url,
            callType: payload.payload.callType || 'voice',
          })
          setCallState('receiving')
          ringingTone.start().catch(() => {})
        }
      })
      .on('broadcast', { event: 'livekit-call-answered' }, async (payload) => {
        // 다른 환경에서 통화 수락됨 - 이 환경에서 수신 중지
        console.log('📞 [LiveKitProvider] Call answered on another device:', payload)
        
        const roomName = payload.payload?.roomName
        const currentState = callStateRef.current
        
        // iOS: VoIP 푸시로 CallKit이 떠있을 수 있음 (callState가 idle인 상태)
        // pendingCallInfo의 roomName과 비교하여 종료
        if (isIOS) {
          try {
            const pendingInfo = await LiveKit.getPendingCallInfo()
            if (pendingInfo.hasPendingCall && pendingInfo.roomName === roomName) {
              console.log('📴 [LiveKitProvider] iOS: Stopping CallKit - answered on another device')
              await LiveKit.endCall().catch(() => {})
              await LiveKit.clearPendingCallInfo().catch(() => {})
            }
          } catch (e) {
            console.error('❌ [LiveKitProvider] Failed to check pending call:', e)
          }
        }
        
        // 같은 통화를 수신 대기 중이면 중지 (웹/Android)
        if (currentState === 'receiving' && incomingCallRef.current?.roomName === roomName) {
          console.log('📴 [LiveKitProvider] Stopping incoming call - answered on another device')
          stopAllCallSounds()
          
          // Android: 알림 취소
          if (Capacitor.getPlatform() === 'android') {
            PushNotifications.removeAllDeliveredNotifications().catch(() => {})
          }
          
          resetCallState()
        }
      })
      .on('broadcast', { event: 'livekit-call-ended' }, async (payload) => {
        console.log('📞 [LiveKitProvider] Call ended by peer:', payload)
        
        const roomName = payload.payload?.roomName
        
        // iOS: VoIP 푸시로 CallKit이 떠있을 수 있음 (callState가 idle인 상태)
        // pendingCallInfo의 roomName과 비교하여 종료
        if (isIOS) {
          try {
            const pendingInfo = await LiveKit.getPendingCallInfo()
            if (pendingInfo.hasPendingCall && pendingInfo.roomName === roomName) {
              console.log('📴 [LiveKitProvider] iOS: Stopping CallKit - call ended/rejected on another device')
              await LiveKit.endCall().catch(() => {})
              await LiveKit.clearPendingCallInfo().catch(() => {})
            } else {
              // pendingCallInfo가 없어도 CallKit이 떠있을 수 있음
              await LiveKit.endCall().catch(() => {})
            }
          } catch (e) {
            console.error('❌ [LiveKitProvider] Failed to check pending call:', e)
            await LiveKit.endCall().catch(() => {})
          }
        }
        
        // 수신 대기 중이거나 통화 중인 경우 상태 리셋
        const currentState = callStateRef.current
        const fromId = payload.payload?.from
        
        // 수신 대기 중인 같은 통화면 중지 (거절 포함)
        if (currentState === 'receiving' && incomingCallRef.current?.roomName === roomName) {
          console.log('📴 [LiveKitProvider] Stopping incoming call - ended/rejected')
          stopAllCallSounds()
          
          // Android: 알림 취소
          if (Capacitor.getPlatform() === 'android') {
            PushNotifications.removeAllDeliveredNotifications().catch(() => {})
          }
          
          resetCallState()
          return
        }
        
        if (currentState === 'receiving' || 
            (currentState !== 'idle' && activeCallRef.current?.partnerId === fromId)) {
          console.log('📴 [LiveKitProvider] Ending call due to peer ended')
          
          // 종료음 재생
          playEndTone()
          
          // Android: 알림 취소
          if (Capacitor.getPlatform() === 'android') {
            PushNotifications.removeAllDeliveredNotifications().catch(() => {})
          }
          
          resetCallState()
        }
      })
      .subscribe((status) => {
        console.log(`📡 [LiveKitProvider] Realtime channel status: ${status}`)
      })

    return () => {
      channel.unsubscribe()
    }
  }, [isIOS, user, resetCallState])

  // iOS 네이티브 이벤트 리스너 (VoIP Push → AppDelegate → WebView)
  // 단 1회만 초기화 보장
  useEffect(() => {
    const platform = Capacitor.getPlatform()
    if (platform !== 'ios' || !user?.id) return
    
    // 이미 초기화되었으면 스킵
    if (iosListenersInitializedRef.current) {
      console.log('⏭️ [LiveKitProvider] iOS native event listeners already initialized, skipping')
      return
    }
    iosListenersInitializedRef.current = true

    console.log(`🍎 [LiveKitProvider] Setting up iOS native event listeners (ONCE)`)

    // VoIP 푸시 수신 시 (AppDelegate에서 전송)
    const handleNativeIncomingCall = (event: CustomEvent<{
      callerId: string
      callerName: string
      roomName: string
      livekitUrl: string
      livekitToken?: string
      callType?: string
      autoAccept?: boolean
    }>) => {
      console.log('📞 [LiveKitProvider] iOS native incoming call:', event.detail)
      const { callerId, callerName, roomName, livekitUrl, livekitToken, callType, autoAccept } = event.detail
      
      if (autoAccept && livekitToken) {
        console.log('📞 [LiveKitProvider] iOS auto-accepting call with token')
        stopAllCallSounds()
        setIncomingCall(null)
        setCallState('idle')
        
        router.navigate({
          to: '/call',
          search: {
            mode: 'incoming',
            partnerId: callerId,
            partnerName: callerName,
            roomName,
            token: livekitToken,
            livekitUrl,
            callType: (callType as 'voice' | 'video') || 'voice',
          },
        })
      } else if (callStateRef.current === 'idle') {
        setIncomingCall({
          roomId: roomName,
          roomName,
          from: callerId,
          fromName: callerName,
          peerId: callerId,
          url: livekitUrl,
          callType: (callType as 'voice' | 'video') || 'voice',
        })
        setCallState('receiving')
      }
    }

    // CallKit에서 통화 수락 시 (AppDelegate에서 전송)
    const handleNativeCallAnswered = (event: CustomEvent<{
      callUUID: string
      hasPendingInfo: boolean
      callerId: string
      callerName: string
      roomName: string
      livekitUrl: string
      livekitToken: string
    }>) => {
      console.log('📞 [LiveKitProvider] iOS native call answered:', event.detail)
      const { callerId, callerName, roomName, livekitUrl, livekitToken } = event.detail
      
      stopAllCallSounds()
      setIncomingCall(null)
      setCallState('idle')
      
      if (livekitToken && roomName) {
        router.navigate({
          to: '/call',
          search: {
            mode: 'incoming',
            partnerId: callerId,
            partnerName: callerName,
            roomName,
            token: livekitToken,
            livekitUrl,
            callType: 'voice',
          },
        })
      }
    }

    // CallKit에서 통화 종료/거절 시 (AppDelegate에서 전송)
    const handleNativeCallEnded = (event: CustomEvent<{
      callUUID: string
      reason: string
    }>) => {
      console.log('📞 [LiveKitProvider] iOS native call ended:', event.detail)
      if (callStateRef.current !== 'idle') {
        resetCallState()
      }
    }

    window.addEventListener('native-incoming-call', handleNativeIncomingCall as EventListener)
    window.addEventListener('native-call-answered', handleNativeCallAnswered as EventListener)
    window.addEventListener('native-call-ended', handleNativeCallEnded as EventListener)
    console.log('✅ [LiveKitProvider] iOS native event listeners registered')

    // cleanup에서 ref를 false로 되돌리지 않음 (앱 생명주기 내 단 1회 유지)
  }, [user?.id, router, resetCallState])

  // Android 네이티브 이벤트 리스너 (FCM → MainActivity → WebView)
  // 단 1회만 초기화 보장
  useEffect(() => {
    const platform = Capacitor.getPlatform()
    if (platform !== 'android' || !user?.id) return
    
    if (androidListenersInitializedRef.current) {
      console.log('⏭️ [LiveKitProvider] Android native event listener already initialized, skipping')
      return
    }
    androidListenersInitializedRef.current = true

    console.log(`📱 [LiveKitProvider] Setting up Android native event listener (ONCE)`)

    const handleNativeIncomingCall = (event: CustomEvent<{
      callerId: string
      callerName: string
      roomName: string
      livekitUrl: string
      livekitToken?: string
      callType?: string
      autoAccept?: boolean
    }>) => {
      console.log('📞 [LiveKitProvider] Native incoming call event:', event.detail)
      
      const { callerId, callerName, roomName, livekitUrl, livekitToken, callType, autoAccept } = event.detail
      
      if (autoAccept && livekitToken) {
        console.log('📞 [LiveKitProvider] Auto-accepting call with token')
        
        stopAllCallSounds()
        setIncomingCall(null)
        setCallState('idle')
        
        PushNotifications.removeAllDeliveredNotifications().catch(() => {})
        
        router.navigate({
          to: '/call',
          search: {
            mode: 'incoming',
            partnerId: callerId,
            partnerName: callerName,
            roomName,
            token: livekitToken,
            livekitUrl,
            callType: (callType as 'voice' | 'video') || 'voice',
          },
        })
      } else if (callStateRef.current === 'idle') {
        setIncomingCall({
          roomId: roomName,
          roomName,
          from: callerId,
          fromName: callerName,
          peerId: callerId,
          url: livekitUrl,
          token: livekitToken,
          callType: (callType as 'voice' | 'video') || 'voice',
        })
        setCallState('receiving')
        ringingTone.start().catch(() => {})
      }
    }

    window.addEventListener('native-incoming-call', handleNativeIncomingCall as EventListener)
    console.log('✅ [LiveKitProvider] Android native event listener registered')

    // cleanup에서 ref를 false로 되돌리지 않음
  }, [user?.id, router, resetCallState])

  // Context value 생성
  const value: LiveKitCallContextType = useMemo(() => ({
    callState,
    activeCall,
    incomingCall,
    startCall,
    answerCall,
    rejectCall,
    endCall,
    isMuted,
    toggleMute,
    isSpeakerOn,
    toggleSpeaker,
    formatDuration,
    navigateToChat,
  }), [
    callState,
    activeCall,
    incomingCall,
    startCall,
    answerCall,
    rejectCall,
    endCall,
    isMuted,
    toggleMute,
    isSpeakerOn,
    toggleSpeaker,
    formatDuration,
    navigateToChat,
  ])

  return (
    <LiveKitCallContext.Provider value={value}>
      {children}
    </LiveKitCallContext.Provider>
  )
}