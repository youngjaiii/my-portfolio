import { createFileRoute, useSearch, useNavigate } from '@tanstack/react-router'
import { useEffect, useCallback, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { PhoneOff, Mic, MicOff, Volume2, Phone, Video, VideoOff, User, Minimize2, Maximize2, RefreshCw } from 'lucide-react'
import { Room, RoomEvent, Track, LocalAudioTrack, RemoteParticipant, ConnectionState, createLocalAudioTrack, createLocalVideoTrack, LocalVideoTrack } from 'livekit-client'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import LiveKit from '@/plugins/LiveKit'
import { cn } from '@/lib/utils'
import { useCallStore } from '@/stores/callStore'
import { ringingTone } from '@/utils/callSounds'

const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL

interface CallSearchParams {
  mode: 'outgoing' | 'incoming'
  partnerId: string
  partnerName: string
  partnerAvatar?: string
  callType?: 'voice' | 'video'
  roomName?: string
  token?: string
  callId?: string
  livekitUrl?: string
  restore?: boolean
  restoreDuration?: number
}

export const Route = createFileRoute('/call')({
  validateSearch: (search: Record<string, unknown>): CallSearchParams => ({
    mode: (search.mode as 'outgoing' | 'incoming') || 'outgoing',
    partnerId: (search.partnerId as string) || '',
    partnerName: (search.partnerName as string) || '통화 상대',
    partnerAvatar: search.partnerAvatar as string | undefined,
    callType: (search.callType as 'voice' | 'video') || 'voice',
    roomName: search.roomName as string | undefined,
    token: search.token as string | undefined,
    callId: search.callId as string | undefined,
    livekitUrl: search.livekitUrl as string | undefined,
    restore: search.restore === true || search.restore === 'true',
    restoreDuration: typeof search.restoreDuration === 'number' ? search.restoreDuration : (parseInt(search.restoreDuration as string) || 0),
  }),
  component: CallPage,
})

type CallState = 'initializing' | 'connecting' | 'ringing' | 'connected' | 'ended'

function CallPage() {
  const { mode, partnerId, partnerName: initialPartnerName, partnerAvatar: initialPartnerAvatar, callType = 'voice', roomName: initialRoomName, token: initialToken, callId, livekitUrl: initialLivekitUrl, restore, restoreDuration } = useSearch({ from: '/call' })
  const navigate = useNavigate()
  const { user } = useAuth()
  const platform = Capacitor.getPlatform()

  // partnerName/Avatar 상태 (DB에서 조회 가능)
  const [partnerName, setPartnerName] = useState(initialPartnerName)
  const [partnerAvatar, setPartnerAvatar] = useState(initialPartnerAvatar || '')

  // 통화 상태
  const [callState, setCallStateInternal] = useState<CallState>('initializing')
  const callStateRef = useRef<CallState>('initializing')
  const setCallState = useCallback((state: CallState) => {
    callStateRef.current = state
    setCallStateInternal(state)
  }, [])
  const [duration, setDuration] = useState(0)
  const durationRef = useRef(0)
  const [isMuted, setIsMuted] = useState(false)
  const [isSpeaker, setIsSpeaker] = useState(false)
  const [isVideoEnabled, setIsVideoEnabled] = useState(callType === 'video')
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user') // 전면/후면 카메라
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [remoteParticipantConnected, setRemoteParticipantConnected] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [showControls, setShowControls] = useState(true) // 영상통화 컨트롤 표시
  const lastInteractionRef = useRef(Date.now())
  const controlsTimeoutRef = useRef<number | null>(null)

  // 미니모드 드래그 위치
  const [miniPosition, setMiniPosition] = useState({ x: 0, y: 0 })
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 })
  const miniRef = useRef<HTMLDivElement>(null)

  // Refs
  const roomRef = useRef<Room | null>(null)
  const localAudioTrackRef = useRef<LocalAudioTrack | null>(null)
  const localVideoTrackRef = useRef<LocalVideoTrack | null>(null)
  const isMinimizingRef = useRef(false)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const miniVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoTrackRef = useRef<Track | null>(null)
  const durationIntervalRef = useRef<number | null>(null)
  const noAnswerTimeoutRef = useRef<number | null>(null) // 60초 미응답 타이머
  const callUUIDRef = useRef<string | null>(null)
  const isEndingRef = useRef(false)
  const isInitiatedRef = useRef(false) // 중복 API 호출 방지 (발신)
  const isAcceptedRef = useRef(false) // 중복 수락 방지 (수신)
  const isConnectingRef = useRef(false) // 연결 진행 중 여부
  const roomInfoRef = useRef<{ roomName: string; token: string } | null>(null)

  // partnerName/Avatar 없으면 DB에서 조회
  useEffect(() => {
    if (!partnerId) return
    const needName = !initialPartnerName || initialPartnerName === '통화 상대'
    const needAvatar = !initialPartnerAvatar
    if (!needName && !needAvatar) return

    const fetchPartnerInfo = async () => {
      try {
        const { data } = await supabase
          .from('members')
          .select('name, profile_image')
          .eq('id', partnerId)
          .single() as { data: { name: string; profile_image: string | null } | null }
        if (data) {
          if (needName && data.name) setPartnerName(data.name)
          if (needAvatar && data.profile_image) setPartnerAvatar(data.profile_image)
        }
      } catch (e) {
        console.error('파트너 정보 조회 실패:', e)
      }
    }
    fetchPartnerInfo()
  }, [partnerId, initialPartnerName, initialPartnerAvatar])

  // 통화 시간 포맷
  const formatDuration = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }, [])

  // 통화 시간 트래킹 시작
  const startDurationTracking = useCallback(() => {
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current)
    durationIntervalRef.current = window.setInterval(() => {
      durationRef.current += 1
      setDuration(durationRef.current)
    }, 1000)
  }, [])

  // 통화 시간 트래킹 중지
  const stopDurationTracking = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }
  }, [])

  // 미응답 타이머 취소
  const clearNoAnswerTimeout = useCallback(() => {
    if (noAnswerTimeoutRef.current) {
      clearTimeout(noAnswerTimeoutRef.current)
      noAnswerTimeoutRef.current = null
    }
  }, [])

  // LiveKit 룸 연결
  const connectToRoom = useCallback(async (roomName: string, token: string, livekitUrl: string) => {
    // isConnectingRef는 호출자(initiateCall, acceptIncomingCall)에서 관리
    console.log('🔌 [Call] connectToRoom called, isConnecting:', isConnectingRef.current)

    try {
      console.log('🔌 [Call] Connecting to LiveKit room:', roomName, 'URL:', livekitUrl)

      // Android: 음성통화는 네이티브, 영상통화는 웹 Room 사용
      if (platform === 'android') {
        if (callType === 'video') {
          // Android 영상통화: 웹 Room (livekit-client) 사용 (네이티브 비디오 렌더링 미지원)
          console.log('📱 [Call] Android Video: Using web Room (livekit-client)')
          // 아래 웹 로직으로 진행 (else 블록)
        } else {
          // Android 음성통화: 네이티브 Room 사용
          console.log('📱 [Call] Android Voice: Using native LiveKit connection')
          const result = await LiveKit.connect({ url: livekitUrl, token, roomName, callType })

          if (result.success) {
            console.log('✅ [Call] Native LiveKit connected')
            setCallState('ringing')
          }
          return // 음성통화는 여기서 종료
        }
      } 
      // iOS: 영상통화는 네이티브 Room + 네이티브 VideoView, 음성통화는 네이티브 Room만 사용
      if (platform === 'ios') {
        if (callType === 'video') {
          // iOS 영상통화: 네이티브 Room + 네이티브 VideoView 사용
          console.log('🍎 [Call] iOS Video: Using native Room + native VideoViews')
          
          // 네이티브 Room 연결 (오디오 + 비디오)
          const nativeResult = await LiveKit.connect({ url: livekitUrl, token, roomName, callType: 'video' })
          if (!nativeResult.success) {
            throw new Error('Native connection failed')
          }
          console.log('✅ [Call] Native Room connected')
          
          // CallKit 연결 완료 보고
          if (mode === 'outgoing') {
            await LiveKit.reportOutgoingCallConnected()
          }
          
          // 네이티브 비디오 뷰 표시 (WebView 위에)
          const screenWidth = window.innerWidth
          const screenHeight = window.innerHeight
          await LiveKit.showVideoViews({
            localX: screenWidth - 128, // 오른쪽 상단
            localY: 60,
            localWidth: 112,
            localHeight: 144,
            remoteX: 0,
            remoteY: 0,
            remoteWidth: screenWidth,
            remoteHeight: screenHeight,
          })
          console.log('✅ [Call] Native video views shown')
          
          setCallState('ringing')
        } else {
          // iOS 음성통화: 네이티브 Room만 사용
          console.log('🍎 [Call] iOS Voice: Using native Room only')
          const nativeResult = await LiveKit.connect({ url: livekitUrl, token, roomName, callType })
          
          if (nativeResult.success) {
            console.log('✅ [Call] Native Room connected')
            
            if (mode === 'outgoing') {
              await LiveKit.reportOutgoingCallConnected()
            }
            
            setCallState('ringing')
          }
        }
      } else {
        // iOS/웹: livekit-client 사용 (비디오 렌더링 + CallKit 호환)
        // 웹: livekit-client 직접 사용
        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
        })
        roomRef.current = room

        // 이벤트 리스너 등록
        room.on(RoomEvent.ParticipantConnected, async (participant: RemoteParticipant) => {
          console.log('👤 [Call] Participant connected:', participant.identity)
          console.log('🎵 [Call] Participant audio tracks:', participant.audioTrackPublications.size)
          
          // 이미 발행된 오디오 트랙이 있으면 명시적으로 구독
          for (const publication of participant.audioTrackPublications.values()) {
            console.log('🎵 [Call] Checking audio track:', publication.trackSid, 'isSubscribed:', publication.isSubscribed)
            if (!publication.isSubscribed) {
              console.log('🎵 [Call] Subscribing to audio track:', publication.trackSid)
              try {
                await publication.setSubscribed(true)
                console.log('✅ [Call] Successfully subscribed to audio track')
              } catch (error) {
                console.error('❌ [Call] Failed to subscribe to audio track:', error)
              }
            } else {
              console.log('✅ [Call] Audio track already subscribed')
            }
          }
          
          // 컬러링 중지
          ringingTone.stop()
          setRemoteParticipantConnected(true)
          setCallState('connected')
          startDurationTracking()
        })

        room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
          console.log('👤 [Call] Participant disconnected:', participant.identity)
          setRemoteParticipantConnected(false)

          // iOS에서는 네이티브 Room과 웹 Room이 같은 identity를 사용하므로
          // remoteParticipants.size가 0이어도 실제로는 네이티브 Room이 연결되어 있을 수 있음
          // 따라서 iOS에서는 이 체크를 하지 않음
          if (platform !== 'ios' && room.remoteParticipants.size === 0 && !isEndingRef.current) {
            console.log('📴 [Call] All participants left, disconnecting room')
            setCallState('ended')
            room.disconnect()
          }
        })

        // 트랙이 발행될 때 구독
        room.on(RoomEvent.TrackPublished, async (publication, participant) => {
          console.log('📢 [Call] Track published:', publication.kind, 'from participant:', participant.identity)
          
          // 오디오 트랙이 발행되면 즉시 구독
          if (publication.kind === Track.Kind.Audio && !publication.isSubscribed) {
            console.log('🎵 [Call] Subscribing to published audio track')
            try {
              await publication.setSubscribed(true)
              console.log('✅ [Call] Successfully subscribed to published audio track')
            } catch (error) {
              console.error('❌ [Call] Failed to subscribe to published audio track:', error)
            }
          }
        })

        room.on(RoomEvent.TrackSubscribed, async (track, _publication, participant) => {
          console.log('🎵 [Call] Track subscribed:', track.kind, 'from participant:', participant.identity)
          if (track.kind === Track.Kind.Audio) {
            console.log('🎵 [Call] Audio track subscribed, attaching and playing...')
            const audioElement = track.attach()
            audioElement.autoplay = true
            ;(audioElement as any).playsInline = true
            audioElement.volume = 1.0
            audioElement.muted = false
            
            // DOM에 추가
            if (!document.body.contains(audioElement)) {
              audioElement.style.display = 'none'
              document.body.appendChild(audioElement)
            }
            
            // 전역 AudioContext 활성화 (웹에서 오디오 재생 보장)
            try {
              const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext
              if (AudioContextClass) {
                // 기존 AudioContext가 있으면 재사용, 없으면 새로 생성
                if (!(window as any).__callAudioContext) {
                  (window as any).__callAudioContext = new AudioContextClass()
                }
                const ctx = (window as any).__callAudioContext
                if (ctx.state === 'suspended') {
                  await ctx.resume()
                  console.log('✅ [Call] AudioContext resumed for remote audio')
                }
                // AudioContext를 계속 활성화 상태로 유지
                if (ctx.state !== 'running') {
                  await ctx.resume()
                }
              }
            } catch (ctxError) {
              console.warn('⚠️ [Call] AudioContext resume failed:', ctxError)
            }
            
            // 오디오 재생 시도 (여러 번 시도)
            const playAudio = async (retries = 3) => {
              for (let i = 0; i < retries; i++) {
                try {
                  // 오디오 엘리먼트 속성 재설정
                  audioElement.muted = false
                  audioElement.volume = 1.0
                  
                  await audioElement.play()
                  console.log('✅ [Call] Remote audio playing')
                  return
                } catch (playError) {
                  if (i === retries - 1) {
                    console.warn('⚠️ [Call] Audio autoplay failed after retries, will retry on user interaction:', playError)
                    // 사용자 상호작용 후 재생 시도
                    const playOnInteraction = async () => {
                      try {
                        audioElement.muted = false
                        audioElement.volume = 1.0
                        await audioElement.play()
                        console.log('✅ [Call] Remote audio playing after user interaction')
                        window.removeEventListener('click', playOnInteraction)
                        window.removeEventListener('touchstart', playOnInteraction)
                      } catch (e) {
                        console.error('❌ [Call] Failed to play audio after interaction:', e)
                      }
                    }
                    window.addEventListener('click', playOnInteraction, { once: true })
                    window.addEventListener('touchstart', playOnInteraction, { once: true })
                  } else {
                    // 재시도 전 짧은 대기
                    await new Promise(resolve => setTimeout(resolve, 100))
                  }
                }
              }
            }
            
            await playAudio()
          } else if (track.kind === Track.Kind.Video) {
            remoteVideoTrackRef.current = track
            if (remoteVideoRef.current) {
              track.attach(remoteVideoRef.current)
            }
          }
        })

        room.on(RoomEvent.TrackUnsubscribed, (track) => {
          track.detach()
        })

        room.on(RoomEvent.Disconnected, () => {
          console.log('🔌 [Call] Room disconnected')
          if (!isEndingRef.current) {
            handleEndCall()
          }
        })

        room.on(RoomEvent.ConnectionStateChanged, async (state: ConnectionState) => {
          console.log('📡 [Call] Connection state:', state)
          if (state === ConnectionState.Connected) {
            // 연결 완료 - 기존 참가자 즉시 확인 및 오디오 트랙 구독
            const existingParticipants = room.remoteParticipants.size
            console.log('👥 [Call] Connected, existing participants:', existingParticipants)

            // 이미 연결된 참가자의 오디오 트랙 구독
            for (const participant of room.remoteParticipants.values()) {
              console.log('👤 [Call] Existing participant on connect:', participant.identity)
              for (const publication of participant.audioTrackPublications.values()) {
                console.log('🎵 [Call] Existing audio track on connect:', publication.trackSid, 'isSubscribed:', publication.isSubscribed)
                if (!publication.isSubscribed) {
                  console.log('🎵 [Call] Subscribing to existing audio track on connect')
                  try {
                    await publication.setSubscribed(true)
                    console.log('✅ [Call] Successfully subscribed to existing audio track on connect')
                  } catch (error) {
                    console.error('❌ [Call] Failed to subscribe to existing audio track on connect:', error)
                  }
                }
              }
            }

            if (existingParticipants > 0) {
              // 이미 상대방이 있으면 바로 connected
              setRemoteParticipantConnected(true)
              setCallState('connected')
              startDurationTracking()
            } else {
              // 상대방 대기 중
              setCallState('ringing')
            }
          }
        })

        // LiveKit 연결
        await room.connect(livekitUrl, token)
        console.log('✅ [Call] Room connected, local participant:', room.localParticipant.identity)
        
        // 연결 직후 이미 연결된 참가자의 오디오 트랙 구독
        for (const participant of room.remoteParticipants.values()) {
          console.log('👤 [Call] Existing participant after connect:', participant.identity)
          for (const publication of participant.audioTrackPublications.values()) {
            console.log('🎵 [Call] Existing audio track after connect:', publication.trackSid, 'isSubscribed:', publication.isSubscribed)
            if (!publication.isSubscribed) {
              console.log('🎵 [Call] Subscribing to existing audio track after connect')
              try {
                await publication.setSubscribed(true)
                console.log('✅ [Call] Successfully subscribed to existing audio track after connect')
              } catch (error) {
                console.error('❌ [Call] Failed to subscribe to existing audio track after connect:', error)
              }
            }
          }
        }

        // 로컬 오디오 트랙 생성 및 발행
        const audioTrack = await createLocalAudioTrack({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        })
        localAudioTrackRef.current = audioTrack
        await room.localParticipant.publishTrack(audioTrack)
        console.log('✅ [Call] Local audio track published:', audioTrack.sid)

        // 비디오 통화인 경우 비디오 트랙도 발행 (HD 화질)
        if (callType === 'video') {
          const videoTrack = await createLocalVideoTrack({
            resolution: { width: 1920, height: 1080 },
            facingMode: 'user',
          })
          localVideoTrackRef.current = videoTrack
          await room.localParticipant.publishTrack(videoTrack)
          if (localVideoRef.current) {
            videoTrack.attach(localVideoRef.current)
          }
        }

        console.log('✅ [Call] Web LiveKit connected and publishing')
      }

      isConnectingRef.current = false
    } catch (error: any) {
      console.error('❌ [Call] Failed to connect:', error)
      isConnectingRef.current = false
      setErrorMessage(error.message || '연결에 실패했습니다')
      setCallState('ended')
    }
  }, [platform, mode, callType, startDurationTracking])

  // 통화 시작 (발신)
  const initiateCall = useCallback(async () => {
    if (!user?.id || !partnerId) return

    // 중복 호출 방지 (React Strict Mode)
    if (isInitiatedRef.current || isConnectingRef.current) {
      console.log('⚠️ [Call] Already initiated, skipping duplicate call')
      return
    }
    isInitiatedRef.current = true
    isConnectingRef.current = true // cleanup에서 disconnect 방지

    try {
      setCallState('connecting')

      // iOS CallKit 발신 통화 시작
      if (platform === 'ios') {
        const callKitResult = await LiveKit.startOutgoingCall({ callerName: partnerName })
        callUUIDRef.current = callKitResult.callUUID
        // iOS는 네이티브 다이얼톤 사용 (LiveKit.startDialTone)
      } else {
        // 웹/Android: 발신 중 컬러링 시작
        ringingTone.start().catch(() => {})
      }

      // API 호출하여 룸 생성 및 토큰 발급
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/api-livekit/room`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          partnerId,
          callType,
          callId,
        }),
      })

      const result = await response.json()

      // ★★★ FCM 전송 결과 확인 (디버깅용) ★★★
      console.log('📱 [Call] API Response:', {
        success: result.success,
        fcmPushSent: result.fcmPushSent,
        voipPushSent: result.voipPushSent,
        roomName: result.roomName,
      })
      
      // 통화중/동시발신 처리
      if (response.status === 409) {
        // iOS CallKit 종료
        if (platform === 'ios') {
          await LiveKit.endCall().catch(() => {})
        }
        ringingTone.stop()
        
        if (result.error === 'busy' || result.error === 'concurrent') {
          const message = result.error === 'busy' 
            ? '상대방이 통화중입니다' 
            : '상대방이 전화를 걸고 있습니다'
          
          console.log(`📞 [Call] ${result.error}:`, message)
          setErrorMessage(message)
          setCallState('ended')
          isConnectingRef.current = false
          isInitiatedRef.current = false
          
          // 알럿 표시
          alert(message)
          
          setTimeout(() => window.history.back(), 1500)
          return
        }
      }

      if (!response.ok || result.error) {
        throw new Error(result.error || 'Failed to create call room')
      }

      console.log('📞 [Call] Room created:', result.roomName, 'URL:', result.url)
      roomInfoRef.current = { roomName: result.roomName, token: result.token }

      // 상대방에게 통화 요청 브로드캐스트 (Realtime) - 재시도 포함
      console.log('📡 [Call] Broadcasting call request to:', partnerId)

      const MAX_RETRIES = 3
      let broadcastSuccess = false
      const channelName = `call-notifications-${partnerId}`

      for (let attempt = 1; attempt <= MAX_RETRIES && !broadcastSuccess; attempt++) {
        console.log(`📡 [Call] Broadcast attempt ${attempt}/${MAX_RETRIES} to channel: ${channelName}`)

        try {
          const channel = supabase.channel(channelName, {
            config: { broadcast: { self: false } }
          })

          // subscribe 완료까지 대기 (최대 3초)
          const subscribed = await new Promise<boolean>((resolve) => {
            const timeout = setTimeout(() => resolve(false), 3000)

            channel.subscribe((status) => {
              console.log(`📡 [Call] Channel status (attempt ${attempt}):`, status)
              if (status === 'SUBSCRIBED') {
                clearTimeout(timeout)
                resolve(true)
              } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                clearTimeout(timeout)
                resolve(false)
              }
            })
          })

          if (subscribed) {
            // broadcast 전송
            const sendResult = await channel.send({
              type: 'broadcast',
              event: 'livekit-call-request',
              payload: {
                from: user.id,
                fromName: user.name || '사용자',
                to: partnerId,
                roomName: result.roomName,
                url: result.url,
                callId,
                callType, // 음성/영상 통화 구분
                timestamp: Date.now(),
              },
            })
            console.log(`📡 [Call] Broadcast send result (attempt ${attempt}):`, sendResult)

            if (sendResult === 'ok') {
              broadcastSuccess = true
              console.log('✅ [Call] Broadcast successful!')
            }

            // 잠시 대기 후 unsubscribe
            await new Promise(r => setTimeout(r, 300))
          }

          channel.unsubscribe()

          // 실패 시 잠시 대기 후 재시도
          if (!broadcastSuccess && attempt < MAX_RETRIES) {
            console.log(`⏳ [Call] Retrying in 500ms...`)
            await new Promise(r => setTimeout(r, 500))
          }
        } catch (broadcastError) {
          console.warn(`⚠️ [Call] Broadcast error (attempt ${attempt}):`, broadcastError)
          if (attempt < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, 500))
          }
        }
      }

      if (!broadcastSuccess) {
        console.warn('⚠️ [Call] All broadcast attempts failed, continuing anyway')
      }

      // LiveKit 연결
      await connectToRoom(result.roomName, result.token, result.url)
    } catch (error: any) {
      console.error('❌ [Call] Failed to initiate call:', error)
      isConnectingRef.current = false
      setErrorMessage(error.message || '통화를 시작할 수 없습니다')
      setCallState('ended')

      if (platform === 'ios') {
        await LiveKit.endCall()
      }
    }
  }, [user?.id, partnerId, partnerName, platform, callType, callId, connectToRoom])

  // 수신 통화 수락
  const acceptIncomingCall = useCallback(async () => {
    if (!initialRoomName || !initialToken || !initialLivekitUrl) {
      setErrorMessage('통화 정보가 없습니다')
      setCallState('ended')
      return
    }

    // 중복 수락 방지 (React Strict Mode)
    if (isAcceptedRef.current) {
      console.log('⚠️ [Call] Already accepted, skipping')
      return
    }
    isAcceptedRef.current = true
    isConnectingRef.current = true // cleanup에서 disconnect 방지

    try {
      console.log('📞 [Call] Accepting incoming call, room:', initialRoomName)
      roomInfoRef.current = { roomName: initialRoomName, token: initialToken }
      
      setCallState('connecting')
      
      // 다른 환경에 수락 알림 브로드캐스트 (같은 계정의 다른 기기에서 수신 중지)
      if (user?.id) {
        try {
          const answeredChannel = supabase.channel(`call-notifications-${user.id}`)
          await answeredChannel.subscribe()
          await answeredChannel.send({
            type: 'broadcast',
            event: 'livekit-call-answered',
            payload: {
              roomName: initialRoomName,
              answeredBy: user.id,
              timestamp: Date.now(),
            },
          })
          answeredChannel.unsubscribe()
          console.log('📡 [Call] Call answered broadcast sent')
        } catch (e) {
          console.error('❌ [Call] Failed to broadcast call answered:', e)
        }
      }
      
      // iOS: 영상통화는 네이티브 Room + 네이티브 VideoView, 음성통화는 네이티브 Room
      if (platform === 'ios') {
        if (callType === 'video') {
          // iOS 영상통화 수신: 네이티브 Room은 이미 연결됨, 네이티브 VideoView 표시
          console.log('🍎 [Call] iOS Video Incoming: Using native VideoViews')
          
          // 네이티브 비디오 뷰 표시 (WebView 위에)
          const screenWidth = window.innerWidth
          const screenHeight = window.innerHeight
          await LiveKit.showVideoViews({
            localX: screenWidth - 128,
            localY: 60,
            localWidth: 112,
            localHeight: 144,
            remoteX: 0,
            remoteY: 0,
            remoteWidth: screenWidth,
            remoteHeight: screenHeight,
          })
          console.log('✅ [Call] Native video views shown')
          
          setRemoteParticipantConnected(true)
          setCallState('connected')
          startDurationTracking()
        } else {
          // iOS 음성통화 수신: 네이티브 Room만 사용
          console.log('🍎 [Call] iOS Voice: Native Room already connected')
          setTimeout(() => {
            if (callStateRef.current === 'ringing' || callStateRef.current === 'connecting') {
              console.log('📞 [Call] Incoming call: forcing connected state')
              setRemoteParticipantConnected(true)
              setCallState('connected')
              startDurationTracking()
            }
          }, 2000)
        }
      } else {
        // 웹/Android: 웹에서 LiveKit 연결
      await connectToRoom(initialRoomName, initialToken, initialLivekitUrl)
      
      // 수신측은 발신측이 이미 대기 중이므로 연결 후 바로 connected 상태로 전환
      setTimeout(() => {
        if (callStateRef.current === 'ringing' || callStateRef.current === 'connecting') {
          console.log('📞 [Call] Incoming call: forcing connected state')
          setRemoteParticipantConnected(true)
          setCallState('connected')
          startDurationTracking()
        }
      }, 1000)
      }
    } catch (error: any) {
      console.error('❌ [Call] Failed to accept call:', error)
      isConnectingRef.current = false
      setErrorMessage(error.message || '통화 수락에 실패했습니다')
      setCallState('ended')
    }
  }, [platform, initialRoomName, initialToken, initialLivekitUrl, connectToRoom, startDurationTracking, user?.id])

  // 통화 종료
  const handleEndCall = useCallback(async () => {
    console.log('📴 [Call] handleEndCall called, isEnding:', isEndingRef.current)
    if (isEndingRef.current) {
      console.log('⚠️ [Call] Already ending, skipping')
      return
    }
    isEndingRef.current = true

    console.log('📴 [Call] Ending call - starting cleanup')
    stopDurationTracking()
    setCallState('ended')

    // 전역 store 정리
    const { setMiniCall } = useCallStore.getState()
    setMiniCall(null)

    try {
      // Android 영상통화: 웹 Room 사용하므로 웹 정리 로직으로
      const useWebRoom = platform === 'web' || (platform === 'android' && callType === 'video')
      
      if (platform === 'ios') {
        if (callType === 'video') {
          // iOS 영상통화: 네이티브 비디오 뷰 숨기기 + 네이티브 Room 정리
          console.log('🍎 [Call] iOS Video: Cleaning up native video views and room')
          await LiveKit.hideVideoViews()
          await LiveKit.disconnect()
          await LiveKit.endCall()
        } else {
          // iOS 음성통화: 네이티브 Room 정리
          await LiveKit.disconnect()
          await LiveKit.endCall()
        }
      } else if (platform === 'android' && callType === 'voice') {
        // Android 음성통화: 네이티브 Room 정리
        console.log('📱 [Call] Android Voice: Cleaning up native room')
        await LiveKit.disconnect()
      } else if (useWebRoom) {
        // 웹 정리 - 마이크/카메라 완전 해제
        console.log('🌐 [Call] Web cleanup starting')

        // Room의 모든 로컬 트랙 unpublish
        if (roomRef.current?.localParticipant) {
          const publications = Array.from(roomRef.current.localParticipant.trackPublications.values())
          for (const publication of publications) {
            const track = publication.track
            if (track) {
              try {
                await roomRef.current.localParticipant.unpublishTrack(track)
                if (track.stop) track.stop()
                // MediaStreamTrack도 직접 정리
                const mediaTrack = (track as any).mediaStreamTrack
                if (mediaTrack?.stop) mediaTrack.stop()
              } catch (e) {
                console.error('❌ [Call] Error unpublishing track:', e)
              }
            }
          }
        }

        if (localAudioTrackRef.current) {
          localAudioTrackRef.current.stop()
          if ((localAudioTrackRef.current as any).mediaStreamTrack) {
            (localAudioTrackRef.current as any).mediaStreamTrack.stop()
          }
          localAudioTrackRef.current = null
        }
        if (localVideoTrackRef.current) {
          localVideoTrackRef.current.stop()
          if ((localVideoTrackRef.current as any).mediaStreamTrack) {
            (localVideoTrackRef.current as any).mediaStreamTrack.stop()
          }
          localVideoTrackRef.current = null
        }
        if (roomRef.current) {
          await roomRef.current.disconnect()
          roomRef.current = null
        }

        // 전역 Room도 정리
        if ((window as any).__livekit_room) {
          (window as any).__livekit_room = null
        }
        if ((window as any).__livekit_audio_track) {
          const globalTrack = (window as any).__livekit_audio_track
          globalTrack.stop()
          if (globalTrack.mediaStreamTrack) {
            globalTrack.mediaStreamTrack.stop()
          }
          (window as any).__livekit_audio_track = null
        }

        console.log('✅ [Call] Web cleanup complete')
      }

      // 통화방 상태 업데이트 (roomName 없어도 호출 - 서버에서 userId로 처리)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const roomName = roomInfoRef.current?.roomName
        const endResponse = await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/api-livekit/room/end`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ roomName, partnerId }),
        })
        const endResult = await endResponse.json()
        console.log('📴 [Call] Room end result:', endResult)
      } catch (endError) {
        console.error('❌ [Call] Error ending room:', endError)




      }

      // 상대방에게 통화 종료 브로드캐스트
      if (partnerId) {
        try {
          console.log('📡 [Call] Broadcasting call end to partner:', partnerId)
          const channel = supabase.channel(`call-notifications-${partnerId}`)
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
              from: user?.id,
              roomName: roomInfoRef.current?.roomName,
              timestamp: Date.now(),
            },
          })
          await new Promise(r => setTimeout(r, 200))
          channel.unsubscribe()
          console.log('✅ [Call] Call end broadcasted')
        } catch (broadcastError) {
          console.error('❌ [Call] Error broadcasting call end:', broadcastError)
        }
      }

      // 자신의 다른 환경에도 종료 브로드캐스트 (iOS CallKit 등)
      if (user?.id) {
        try {
          console.log('📡 [Call] Broadcasting call end to other devices')
          const selfChannel = supabase.channel(`call-notifications-${user.id}`)
          await selfChannel.subscribe()
          await selfChannel.send({
            type: 'broadcast',
            event: 'livekit-call-ended',
            payload: {
              roomName: roomInfoRef.current?.roomName,
              timestamp: Date.now(),
            },
          })
          selfChannel.unsubscribe()
        } catch (e) {
          console.error('❌ [Call] Error broadcasting to other devices:', e)
        }
      }
    } catch (error) {
      console.error('❌ [Call] Error ending call:', error)
    }

    // 통화 종료 메시지 채팅에 발송 (발신자만)
    console.log('💬 [Call] Message check - partnerId:', partnerId, 'userId:', user?.id, 'mode:', mode)
    
    // 발신자만 메시지 발송
    if (mode === 'outgoing' && partnerId && user?.id) {
      const durationSeconds = durationRef.current
      const minutes = Math.floor(durationSeconds / 60)
      const seconds = durationSeconds % 60
      
      let durationText: string
      if (durationSeconds > 0) {
        durationText = `📞 통화 종료 (${minutes}분 ${seconds}초)`
      } else {
        durationText = '📞 부재중 전화'
      }
      
      console.log('💬 [Call] Sending call end message:', durationText, 'duration:', durationSeconds)
      
      try {
        // chat_room_id 조회
        let chatRoomId: string | null = null
        try {
          const { data: roomData } = await supabase
            .from('chat_rooms')
            .select('id')
            .or(`and(created_by.eq.${user.id},partner_id.eq.${partnerId}),and(created_by.eq.${partnerId},partner_id.eq.${user.id})`)
            .eq('is_active', true)
            .maybeSingle()
          
          if (roomData) {
            chatRoomId = roomData.id
          }
        } catch (roomError) {
          console.warn('⚠️ [Call] Failed to get chat_room_id:', roomError)
        }
        
        const { error: msgError, data: msgData } = await supabase.from('member_chats').insert({
          sender_id: user.id,
          receiver_id: partnerId,
          message: durationText,
          is_read: false,
          chat_room_id: chatRoomId,
        }).select()
        
        if (msgError) {
          console.error('❌ [Call] Message insert error:', msgError)
        } else {
          console.log('✅ [Call] Call end message sent successfully:', msgData)
        }
      } catch (msgError) {
        console.error('❌ [Call] Error sending call end message:', msgError)
      }
    } else {
      console.warn('⚠️ [Call] Cannot send message - missing partnerId or userId')
    }

    // 1.5초 후 채팅 화면으로 이동
    setTimeout(() => {
      if (partnerId) {
        const encodedPartnerName = encodeURIComponent(partnerName || '')
        window.location.href = `/chat?partnerId=${partnerId}&partnerName=${encodedPartnerName}`
      } else {
        window.history.back()
      }
    }, 1500)
  }, [platform, stopDurationTracking, partnerId, partnerName, user?.id, mode])

  // 음소거 토글
  const toggleMute = useCallback(async () => {
    try {
      // Android 영상통화는 웹 Room 사용
      const useWebRoom = platform === 'web' || (platform === 'android' && callType === 'video')
      
      if (platform === 'ios' || (platform === 'android' && callType === 'voice')) {
        const result = await LiveKit.setMicrophoneEnabled({ enabled: isMuted })
        setIsMuted(!result.enabled)
      } else if (useWebRoom && localAudioTrackRef.current) {
        if (isMuted) {
          localAudioTrackRef.current.unmute()
        } else {
          localAudioTrackRef.current.mute()
        }
        setIsMuted(!isMuted)
      }
    } catch (error) {
      console.error('❌ [Call] Failed to toggle mute:', error)
    }
  }, [platform, isMuted])

  // 스피커 토글
  const toggleSpeaker = useCallback(async () => {
    try {
      // Android 영상통화는 웹 Room 사용
      const useWebRoom = platform === 'web' || (platform === 'android' && callType === 'video')
      
      if (platform === 'ios' || (platform === 'android' && callType === 'voice')) {
        const result = await LiveKit.setSpeakerMode({ speaker: !isSpeaker })
        setIsSpeaker(result.speaker)
      } else if (useWebRoom) {
        // 웹에서는 오디오 요소 볼륨으로 스피커 모드 시뮬레이션
        const audioElements = document.querySelectorAll('audio')
        const newSpeakerMode = !isSpeaker
        audioElements.forEach((audio) => {
          // 스피커 모드: 볼륨 100%, 이어피스 모드: 볼륨 50%
          audio.volume = newSpeakerMode ? 1.0 : 0.5
        })
        setIsSpeaker(newSpeakerMode)
        console.log('🔊 [Call] Speaker mode:', newSpeakerMode ? 'ON' : 'OFF')
      }
    } catch (error) {
      console.error('❌ [Call] Failed to toggle speaker:', error)
    }
  }, [platform, isSpeaker])

  // 비디오 토글
  const toggleVideo = useCallback(async () => {
    try {
      if (callType !== 'video') return

      // 웹/Android 영상통화: 웹 Room 사용
      if ((platform === 'web' || platform === 'android') && roomRef.current) {
        if (isVideoEnabled && localVideoTrackRef.current) {
          await roomRef.current.localParticipant.unpublishTrack(localVideoTrackRef.current)
          localVideoTrackRef.current.stop()
          localVideoTrackRef.current = null
        } else {
          const videoTrack = await createLocalVideoTrack()
          localVideoTrackRef.current = videoTrack
          await roomRef.current.localParticipant.publishTrack(videoTrack)
          if (localVideoRef.current) {
            videoTrack.attach(localVideoRef.current)
          }
        }
        setIsVideoEnabled(!isVideoEnabled)
      }
    } catch (error) {
      console.error('❌ [Call] Failed to toggle video:', error)
    }
  }, [platform, callType, isVideoEnabled])

  // 카메라 전환 (전면/후면) - 웹/Android용 (iOS는 네이티브 UI 버튼 사용)
  const flipCamera = useCallback(async () => {
    try {
      if (callType !== 'video' || !isVideoEnabled) return
      
      // iOS 네이티브 VideoView는 네이티브 버튼으로 전환 (여기서는 처리 안 함)
      if (platform === 'ios') {
        console.log('📹 [Call] iOS uses native camera flip button')
        return
      }

      // 웹/Android: 새 비디오 트랙 생성
      if (roomRef.current && localVideoTrackRef.current) {
        const newFacingMode = facingMode === 'user' ? 'environment' : 'user'
        
        // 기존 트랙 정리
        await roomRef.current.localParticipant.unpublishTrack(localVideoTrackRef.current)
        localVideoTrackRef.current.stop()
        
        // 새 트랙 생성
        const videoTrack = await createLocalVideoTrack({
          facingMode: newFacingMode,
        })
        localVideoTrackRef.current = videoTrack
        await roomRef.current.localParticipant.publishTrack(videoTrack)
        
        if (localVideoRef.current) {
          videoTrack.attach(localVideoRef.current)
        }
        
        setFacingMode(newFacingMode)
        console.log('📹 [Call] Camera flipped to:', newFacingMode)
      }
    } catch (error) {
      console.error('❌ [Call] Failed to flip camera:', error)
    }
  }, [platform, callType, isVideoEnabled, facingMode])

  // 초기화
  useEffect(() => {
    // isEndingRef 초기화 (미니모드에서 복귀 시 필요)
    isEndingRef.current = false

    // 미니모드에서 복귀하는 경우 (URL 파라미터로 확인)
    if (restore) {
      console.log('🔄 [Call] Restoring from mini mode (restore=true)')
      
      // 전역 Room이 있으면 복원
      const globalRoom = (window as any).__livekit_room as Room | null
      const globalAudioTrack = (window as any).__livekit_audio_track as LocalAudioTrack | null
      const globalVideoTrack = (window as any).__livekit_video_track as LocalVideoTrack | null
      const { miniCall } = useCallStore.getState()
      
      if (globalRoom) {
        console.log('🔄 [Call] Restoring global room')
        roomRef.current = globalRoom
        localAudioTrackRef.current = globalAudioTrack
        if (globalVideoTrack) {
          localVideoTrackRef.current = globalVideoTrack
        }
        
        // DOM이 준비된 후 비디오 재연결
        setTimeout(() => {
          // 로컬 비디오 재연결
          if (localVideoRef.current && globalVideoTrack) {
            globalVideoTrack.attach(localVideoRef.current)
            localVideoRef.current.style.transform = facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)'
            console.log('📹 [Call] Local video track re-attached')
          }
          // 원격 비디오/오디오 재연결
          if (globalRoom) {
            globalRoom.remoteParticipants.forEach(participant => {
              participant.videoTrackPublications.forEach(pub => {
                if (pub.track && remoteVideoRef.current) {
                  pub.track.attach(remoteVideoRef.current)
                  console.log('📹 [Call] Remote video track re-attached')
                }
              })
              participant.audioTrackPublications.forEach(pub => {
                if (pub.track) {
                  const audioEl = pub.track.attach()
                  audioEl.play().catch(console.error)
                  console.log('🔊 [Call] Remote audio track re-attached')
                }
              })
            })
          }
        }, 100)
        
        // 전역 참조 제거
        ;(window as any).__livekit_room = null
        ;(window as any).__livekit_audio_track = null
        ;(window as any).__livekit_video_track = null
      }

      // URL 파라미터에서 duration 복원 (가장 신뢰할 수 있는 소스)
      const restoredDuration = restoreDuration || miniCall?.duration || 0
      if (restoredDuration > 0) {
        console.log('🔄 [Call] Restoring duration:', restoredDuration)
        durationRef.current = restoredDuration
        setDuration(restoredDuration)
      }
      
      setRemoteParticipantConnected(true) // 이미 연결된 상태

      // 연결 상태로 설정 (새로 연결하지 않음)
      setCallState('connected')
      startDurationTracking()
      
      // miniCall store 정리
      useCallStore.getState().setMiniCall(null)
      
      console.log('✅ [Call] Restored from mini mode successfully')
      return
    }

    if (mode === 'outgoing') {
      initiateCall()
    } else if (mode === 'incoming') {
      acceptIncomingCall()
    }

    return () => {
      console.log('🧹 [Call] Cleanup called, isConnecting:', isConnectingRef.current, 'isEnding:', isEndingRef.current, 'isMinimizing:', isMinimizingRef.current)
      
      // 이미 종료 처리 중이면 중복 cleanup 방지
      if (isEndingRef.current) {
        console.log('🔄 [Call] Already ending, skipping cleanup')
        return
      }

      // 연결 진행 중이면 cleanup 건너뛰기 (React Strict Mode 대응)
      if (isConnectingRef.current) {
        console.log('🔄 [Call] Connection in progress, skipping cleanup')
        return
      }

      // 미니모드 전환 중이면 cleanup 건너뛰기
      if (isMinimizingRef.current) {
        console.log('📱 [Call] Minimizing, skipping cleanup')
        return
      }

      // 미니모드로 전환 중이면 Room 유지 (store 또는 전역 변수 확인)
      const { miniCall } = useCallStore.getState()
      const hasGlobalRoom = !!(window as any).__livekit_room
      console.log('🧹 [Call] miniCall state:', miniCall, 'hasGlobalRoom:', hasGlobalRoom)

      if (miniCall?.isMinimized || hasGlobalRoom) {
        console.log('📱 [Call] Mini mode active, keeping room alive')
        return
      }

      console.log('🧹 [Call] No mini mode, disconnecting...')
      stopDurationTracking()
      isEndingRef.current = true

      // 정리
      if (localAudioTrackRef.current) {
        localAudioTrackRef.current.stop()
      }
      if (localVideoTrackRef.current) {
        localVideoTrackRef.current.stop()
      }
      if (roomRef.current) {
        roomRef.current.disconnect()
      }
    }
  }, [])

  // 상대방 통화 종료 수신 (웹)
  useEffect(() => {
    if (platform !== 'web' || !user?.id) return

    console.log('📡 [Call] Setting up call-end listener for user:', user.id)
    const channel = supabase.channel(`call-notifications-${user.id}`)

    channel
      .on('broadcast', { event: 'livekit-call-ended' }, (payload) => {
        console.log('📴 [Call] Received call-ended event:', payload)
        if (!isEndingRef.current) {
          console.log('📴 [Call] Partner ended call, cleaning up')
          handleEndCall()
        }
      })
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [platform, user?.id, handleEndCall])

  // 네이티브 이벤트 리스너
  useEffect(() => {
    if (platform !== 'ios' && platform !== 'android') return

    const listeners: Array<() => void> = []

    // iOS 자동 연결 완료 (CallKit 수락 후)
    LiveKit.addListener('autoConnected', ({ success, roomName, error }) => {
      console.log('📱 [Call] Native autoConnected:', { success, roomName, error })
      if (success) {
        console.log('✅ [Call] Native auto-connect successful')
        setCallState('connected')
        startDurationTracking()
      } else {
        console.error('❌ [Call] Native auto-connect failed:', error)
        setErrorMessage(error || '연결에 실패했습니다')
        setCallState('ended')
      }
    }).then(handle => listeners.push(() => handle.remove()))

    // 참가자 연결됨
    LiveKit.addListener('participantConnected', ({ participantName }) => {
      console.log('👤 [Call] Native participant connected:', participantName)
      setRemoteParticipantConnected(true)
      setCallState('connected')
      startDurationTracking()
    }).then(handle => listeners.push(() => handle.remove()))

    // 참가자 연결 해제됨
    LiveKit.addListener('participantDisconnected', () => {
      console.log('👤 [Call] Native participant disconnected')
      setRemoteParticipantConnected(false)
      if (!isEndingRef.current) {
        handleEndCall()
      }
    }).then(handle => listeners.push(() => handle.remove()))

    // 통화 종료됨 (CallKit)
    LiveKit.addListener('callEnded', ({ reason }) => {
      console.log('📴 [Call] CallKit call ended:', reason)
      if (!isEndingRef.current) {
        handleEndCall()
      }
    }).then(handle => listeners.push(() => handle.remove()))

    // 네이티브 종료 버튼 탭 (iOS 영상통화)
    LiveKit.addListener('nativeEndCallTapped', () => {
      console.log('📴 [Call] Native end call button tapped')
      if (!isEndingRef.current) {
        handleEndCall()
      }
    }).then(handle => listeners.push(() => handle.remove()))

    // 음소거 변경됨 (CallKit)
    LiveKit.addListener('muteChanged', ({ muted }) => {
      setIsMuted(muted)
    }).then(handle => listeners.push(() => handle.remove()))

    return () => {
      listeners.forEach(remove => remove())
    }
  }, [platform, startDurationTracking, handleEndCall])

  // 영상통화 컨트롤 자동 숨김 (3초)
  const resetControlsTimer = useCallback(() => {
    lastInteractionRef.current = Date.now()
    setShowControls(true)

    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current)
    }

    if (callType === 'video' && callState === 'connected') {
      controlsTimeoutRef.current = window.setTimeout(() => {
        setShowControls(false)
      }, 3000)
    }
  }, [callType, callState])

  // 영상통화 연결 시 타이머 시작
  useEffect(() => {
    if (callType === 'video' && callState === 'connected') {
      resetControlsTimer()
    }
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current)
      }
    }
  }, [callType, callState, resetControlsTimer])

  // 60초 미응답 자동 종료 (발신자 only)
  useEffect(() => {
    if (mode === 'outgoing' && callState === 'ringing') {
      console.log('⏱️ [Call] Starting 60s no-answer timeout')
      noAnswerTimeoutRef.current = window.setTimeout(() => {
        console.log('⏱️ [Call] No answer after 60s, ending call')
        setErrorMessage('응답이 없습니다')
        handleEndCall()
      }, 60000) // 60초
    } else {
      clearNoAnswerTimeout()
    }

    return () => {
      clearNoAnswerTimeout()
    }
  }, [mode, callState, handleEndCall, clearNoAnswerTimeout])

  // 화면 터치 시 컨트롤 표시
  const handleScreenTouch = useCallback(() => {
    if (callType === 'video') {
      resetControlsTimer()
    }
  }, [callType, resetControlsTimer])

  // 상태별 메시지
  const getStatusMessage = () => {
    switch (callState) {
      case 'initializing': return '통화 준비 중...'
      case 'connecting': return '연결 중...'
      case 'ringing': return '상대방을 호출하는 중...'
      case 'connected': return formatDuration(duration)
      case 'ended': return errorMessage || '통화 종료'
      default: return ''
    }
  }

  // 통화 종료 핸들러 (버튼용)
  const onEndCallClick = useCallback(() => {
    console.log('📴 [Call] End call button clicked')
    handleEndCall()
  }, [handleEndCall])

  // 미니모드 토글
  // 전역 store
  const { setMiniCall } = useCallStore()

  // 미니/풀 모드 전환 시 비디오 re-attach
  useEffect(() => {
    if (callType !== 'video' || !remoteVideoTrackRef.current) return

    const track = remoteVideoTrackRef.current

    if (isMinimized && miniVideoRef.current) {
      track.detach()
      track.attach(miniVideoRef.current)
    } else if (!isMinimized && remoteVideoRef.current) {
      track.detach()
      track.attach(remoteVideoRef.current)
    }
  }, [isMinimized, callType])

  const toggleMinimize = useCallback(async () => {
    console.log('📱 [Call] toggleMinimize called, platform:', platform, 'callType:', callType)
    
    // iOS 음성통화: 네이티브 미니모드 팝업 사용
    if (platform === 'ios' && callType === 'voice') {
      console.log('📱 [Call] iOS voice: Using native mini mode')
      isMinimizingRef.current = true
      await LiveKit.showVoiceCallMiniMode({ partnerName })
      window.history.back()
      return
    }
    
    // cleanup에서 무시하도록 플래그 설정
    isMinimizingRef.current = true
    
    // 미니모드로 전환 시 전역 store에 통화 정보 저장
    const miniCallData = {
      isMinimized: true,
      partnerId,
      partnerName,
      callState,
      duration,
      position: { x: 0, y: 0 },
      livekitUrl: initialLivekitUrl || '',
      roomName: roomInfoRef.current?.roomName || initialRoomName || '',
      token: roomInfoRef.current?.token || initialToken || '',
      callType,
    }
    console.log('📱 [Call] Setting miniCall:', miniCallData)
    setMiniCall(miniCallData)

    // Room을 미리 전역에 저장 (cleanup보다 먼저)
    ;(window as any).__livekit_room = roomRef.current
    ;(window as any).__livekit_audio_track = localAudioTrackRef.current
    ;(window as any).__livekit_video_track = localVideoTrackRef.current
    console.log('📱 [Call] Room saved to global:', !!roomRef.current, 'videoTrack:', !!localVideoTrackRef.current)

    // 뒤로가기 (이전 화면으로)
    window.history.back()
  }, [partnerId, partnerName, callState, duration, initialLivekitUrl, initialRoomName, initialToken, setMiniCall, platform, callType])

  // 드래그 시작
  const handleDragStart = useCallback((clientX: number, clientY: number) => {
    isDraggingRef.current = true
    dragStartRef.current = {
      x: clientX,
      y: clientY,
      posX: miniPosition.x,
      posY: miniPosition.y,
    }
  }, [miniPosition])

  // 드래그 중
  const handleDragMove = useCallback((clientX: number, clientY: number) => {
    if (!isDraggingRef.current) return

    const deltaX = clientX - dragStartRef.current.x
    const deltaY = clientY - dragStartRef.current.y

    setMiniPosition({
      x: dragStartRef.current.posX + deltaX,
      y: dragStartRef.current.posY + deltaY,
    })
  }, [])

  // 드래그 종료
  const handleDragEnd = useCallback(() => {
    isDraggingRef.current = false
  }, [])

  // 마우스 이벤트
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

  // 터치 이벤트
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    handleDragStart(touch.clientX, touch.clientY)
  }, [handleDragStart])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    handleDragMove(touch.clientX, touch.clientY)
  }, [handleDragMove])

  const onTouchEnd = useCallback(() => {
    handleDragEnd()
  }, [handleDragEnd])

  // 미니모드 UI
  if (isMinimized) {
    // 영상통화 미니모드 - 상대 영상만 작게 표시
    if (callType === 'video') {
      return (
        <div 
          ref={miniRef}
          className="fixed z-[99999] rounded-2xl shadow-2xl overflow-hidden select-none touch-none"
          style={{
            width: '120px',
            height: '160px',
            bottom: `calc(6rem - ${miniPosition.y}px)`,
            right: `calc(1rem - ${miniPosition.x}px)`,
          }}
          onMouseDown={onMouseDown}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {/* 상대방 영상 */}
          <video
            ref={miniVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover bg-black cursor-grab active:cursor-grabbing"
          />

          {/* 상대 미연결시 */}
          {!remoteParticipantConnected && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
              {partnerAvatar ? (
                <img src={partnerAvatar} alt={partnerName} className="w-full h-full object-cover opacity-50" />
              ) : (
                <User className="w-10 h-10 text-slate-500" />
              )}
            </div>
          )}

          {/* 오버레이 컨트롤 */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent">
            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onEndCallClick() }}
                className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center"
              >
                <PhoneOff className="w-4 h-4 text-white" />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setIsMinimized(false) }}
                className="w-8 h-8 rounded-full bg-white/30 flex items-center justify-center backdrop-blur-sm"
              >
                <Maximize2 className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        </div>
      )
    }

    // 음성통화 미니모드
    return (
      <div 
        ref={miniRef}
        className="fixed z-[99999] bg-black rounded-2xl shadow-2xl border border-slate-800 p-3 select-none touch-none"
        style={{
          bottom: `calc(6rem - ${miniPosition.y}px)`,
          right: `calc(1rem - ${miniPosition.x}px)`,
        }}
        onMouseDown={onMouseDown}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center cursor-grab active:cursor-grabbing overflow-hidden',
            callState === 'ringing' && 'animate-pulse'
          )}>
            {partnerAvatar ? (
              <img src={partnerAvatar} alt={partnerName} className="w-full h-full object-cover" />
            ) : (
              <User className="w-6 h-6 text-white" />
            )}
          </div>
          <div className="text-white pointer-events-none">
            <p className="font-medium text-sm">{partnerName}</p>
            <p className={cn(
              'text-xs',
              callState === 'connected' ? 'text-green-400 font-mono' : 'text-slate-400'
            )}>
              {getStatusMessage()}
            </p>
          </div>
          <div className="flex gap-2 ml-2">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEndCallClick() }}
              className="w-10 h-10 rounded-full bg-red-500 hover:bg-red-600 active:bg-red-700 flex items-center justify-center"
            >
              <PhoneOff className="w-5 h-5 text-white" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setIsMinimized(false) }}
              className="w-10 h-10 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center"
            >
              <Maximize2 className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // 영상통화 전체화면 UI
  // iOS: showVideoViews()가 WebView를 숨기고 네이티브 VideoView를 표시
  // 웹: 이 UI가 표시됨
  if (callType === 'video') {
    return (
      <div 
        className="fixed inset-0 z-[99999] bg-black"
        onClick={handleScreenTouch}
        onTouchStart={handleScreenTouch}
      >
        {/* 미니모드 버튼 (우측 상단) */}
        {callState !== 'ended' && (
          <button
            onClick={(e) => { e.stopPropagation(); toggleMinimize() }}
            className="absolute top-4 left-4 z-10 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm"
          >
            <Minimize2 className="w-5 h-5 text-white" />
          </button>
        )}
        
        {/* 상대방 영상 (전체화면) - 검은 배경 */}
        <div className="absolute inset-0 bg-black">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
        </div>

        {/* 상대방 미연결 또는 통화 종료시 오버레이 */}
        {(!remoteParticipantConnected || callState === 'ended') && (
          <div className="absolute inset-0 flex items-center justify-center bg-black">
            <div className="text-center text-white">
              {callState === 'ended' ? (
                <>
                  <div className="w-28 h-28 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
                    <PhoneOff className="w-14 h-14 text-slate-500" />
                  </div>
                  <p className="text-xl font-medium">통화 종료</p>
                  <p className="text-slate-400 mt-2">
                    {duration > 0 ? `통화시간: ${Math.floor(duration / 60)}:${(duration % 60).toString().padStart(2, '0')}` : ''}
                  </p>
                </>
              ) : (
                <>
                  <div className={cn(
                    'w-28 h-28 mx-auto mb-4 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center overflow-hidden',
                    callState === 'ringing' && 'animate-pulse'
                  )}>
                    {partnerAvatar ? (
                      <img src={partnerAvatar} alt={partnerName} className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-14 h-14 text-white" />
                    )}
                  </div>
                  <p className="text-xl font-medium">{partnerName}</p>
                  <p className="text-slate-400 mt-2">{getStatusMessage()}</p>
                </>
              )}
            </div>
          </div>
        )}

        {/* 내 영상 (우상단) */}
        <div className="absolute top-4 right-4 w-28 h-36 bg-black rounded-xl overflow-hidden border-2 border-white/30 shadow-lg">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
          />
          {!isVideoEnabled && (
            <div className="absolute inset-0 flex items-center justify-center bg-black">
              <VideoOff className="w-8 h-8 text-slate-500" />
            </div>
          )}
        </div>

        {/* 컨트롤 (fade in/out) */}
        <div 
          className={cn(
            'absolute inset-x-0 bottom-0 transition-opacity duration-300 pb-safe',
            showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
          )}
        >

          {/* 하단 컨트롤 버튼 */}
          <div className="bg-gradient-to-t from-black/80 to-transparent pt-16 pb-8 px-6">
            {(callState === 'ringing' || callState === 'connected') && (
              <div className="flex items-center justify-center gap-6 mb-6">
                <button
                  onClick={(e) => { e.stopPropagation(); toggleMute() }}
                  className={cn(
                    'w-14 h-14 rounded-full flex items-center justify-center transition-colors backdrop-blur-sm',
                    isMuted ? 'bg-white text-slate-900' : 'bg-white/20 text-white'
                  )}
                >
                  {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </button>

                <button
                  onClick={(e) => { e.stopPropagation(); toggleVideo() }}
                  className={cn(
                    'w-14 h-14 rounded-full flex items-center justify-center transition-colors backdrop-blur-sm',
                    isVideoEnabled ? 'bg-white/20 text-white' : 'bg-white text-slate-900'
                  )}
                >
                  {isVideoEnabled ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
                </button>

                {/* 카메라 전환 버튼 (비디오 활성화 시에만) */}
                {isVideoEnabled && (
                  <button
                    onClick={(e) => { e.stopPropagation(); flipCamera() }}
                    className="w-14 h-14 rounded-full flex items-center justify-center transition-colors backdrop-blur-sm bg-white/20 text-white"
                  >
                    <RefreshCw className="w-6 h-6" />
                  </button>
                )}

                <button
                  onClick={(e) => { e.stopPropagation(); toggleSpeaker() }}
                  className={cn(
                    'w-14 h-14 rounded-full flex items-center justify-center transition-colors backdrop-blur-sm',
                    isSpeaker ? 'bg-white text-slate-900' : 'bg-white/20 text-white'
                  )}
                  title={isSpeaker ? '스피커폰' : '이어피스'}
                >
                  {isSpeaker ? <Volume2 className="w-6 h-6" /> : <Phone className="w-6 h-6" />}
                </button>
              </div>
            )}

            {/* 종료 버튼 */}
            {callState !== 'ended' && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onEndCallClick() }}
                  className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 active:bg-red-700 flex items-center justify-center transition-colors shadow-lg"
                >
                  <PhoneOff className="w-7 h-7 text-white" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // 음성통화 UI
  return (
    <div className="fixed inset-0 z-[99999] bg-black flex flex-col items-center justify-between py-safe">
      {/* 미니모드 버튼 */}
      {callState !== 'ended' && (
        <button
          onClick={toggleMinimize}
          className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
        >
          <Minimize2 className="w-5 h-5 text-white" />
        </button>
      )}

      {/* 상단: 상대방 정보 */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 pt-12">
        <div className="relative">
          <div
            className={cn(
              'w-32 h-32 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center overflow-hidden',
              callState === 'ringing' && 'animate-pulse'
            )}
          >
            {partnerAvatar ? (
              <img src={partnerAvatar} alt={partnerName} className="w-full h-full object-cover" />
            ) : (
              <User className="w-16 h-16 text-white" />
            )}
          </div>
          {callState === 'connected' && (
            <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-green-500 rounded-full flex items-center justify-center border-4 border-black">
              <div className="w-3 h-3 bg-white rounded-full" />
            </div>
          )}
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">{partnerName}</h1>
          <p className={cn(
            'text-lg',
            callState === 'connected' ? 'text-green-400 font-mono' : 'text-slate-400'
          )}>
            {getStatusMessage()}
          </p>
        </div>
      </div>

      {/* 하단: 통화 컨트롤 */}
      <div className="w-full px-8 pb-12">
        {/* 통화 중 컨트롤 */}
        {(callState === 'ringing' || callState === 'connected') && (
          <div className="flex items-center justify-center gap-8 mb-8">
            <button
              onClick={toggleMute}
              className={cn(
                'w-16 h-16 rounded-full flex items-center justify-center transition-colors',
                isMuted ? 'bg-white text-slate-900' : 'bg-white/10 text-white'
              )}
            >
              {isMuted ? <MicOff className="w-7 h-7" /> : <Mic className="w-7 h-7" />}
            </button>

            <button
              onClick={toggleSpeaker}
              className={cn(
                'w-16 h-16 rounded-full flex items-center justify-center transition-colors',
                isSpeaker ? 'bg-white text-slate-900' : 'bg-white/10 text-white'
              )}
              title={isSpeaker ? '스피커폰' : '이어피스'}
            >
              {isSpeaker ? <Volume2 className="w-7 h-7" /> : <Phone className="w-7 h-7" />}
            </button>
          </div>
        )}

        {/* 종료/취소 버튼 */}
        {callState !== 'ended' && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={onEndCallClick}
              className="w-20 h-20 rounded-full bg-red-500 hover:bg-red-600 active:bg-red-700 flex items-center justify-center transition-colors shadow-lg shadow-red-500/30"
            >
              <PhoneOff className="w-9 h-9 text-white" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}