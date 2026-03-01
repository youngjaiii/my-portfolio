import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import Peer from 'peerjs'
import type { MediaConnection, PeerJSOption } from 'peerjs'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { edgeApi } from '@/lib/edgeApi'
import { dialingTone, ringingTone, playConnectedTone, playEndTone, stopAllCallSounds } from '@/utils/callSounds'
import { generateUUID, safeGetUserMedia } from '@/lib/utils'
import { generateTurnCredentials } from '@/utils/turnAuth'
import AudioToggle from '@/plugins/AudioToggle'

interface VideoCallRoom {
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

interface IncomingVideoCall {
  roomId: string
  from: string
  fromName: string
  peerId: string
  callId?: string | null
}

interface ActiveVideoCall {
  partnerId: string
  partnerName: string
  callId?: string | null
  roomId: string
  startedAt: Date
  duration: number
}

interface GlobalVideoCallContextType {
  // 통화 상태
  callState: 'idle' | 'calling' | 'receiving' | 'connected'
  activeCall: ActiveVideoCall | null
  incomingCall: IncomingVideoCall | null

  // 미디어 스트림
  localStream: MediaStream | null
  remoteStream: MediaStream | null

  // 통화 액션
  startCall: (partnerId: string, partnerName: string, callId?: string) => Promise<void>
  answerCall: () => Promise<void>
  rejectCall: () => void
  endCall: () => Promise<void>

  // 음소거 관리
  isMuted: boolean
  toggleMute: () => void

  // 카메라 관리
  isCameraOff: boolean
  toggleCamera: () => void

  // 카메라 전환 (전면/후면)
  facingMode: 'user' | 'environment'
  switchCamera: () => Promise<void>

  // 통화 시간 포맷팅
  formatDuration: (seconds: number) => string

  // 채팅방으로 이동
  navigateToChat: () => void
}

const GlobalVideoCallContext = createContext<GlobalVideoCallContextType | null>(null)

interface GlobalVideoCallProviderProps {
  children: ReactNode
}

export function GlobalVideoCallProvider({ children }: GlobalVideoCallProviderProps) {
  const { user } = useAuth()
  const [peer, setPeer] = useState<Peer | null>(null)
  const peerRef = useRef<Peer | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [callState, setCallState] = useState<'idle' | 'calling' | 'receiving' | 'connected'>('idle')
  const [activeCall, setActiveCall] = useState<ActiveVideoCall | null>(null)
  const [incomingCall, setIncomingCall] = useState<IncomingVideoCall | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isCameraOff, setIsCameraOff] = useState(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const [currentRoom, setCurrentRoom] = useState<VideoCallRoom | null>(null)

  // 🔴 클로저 문제 해결을 위한 ref
  const callStateRef = useRef<'idle' | 'calling' | 'receiving' | 'connected'>('idle')
  
  // callState 변경 시 ref도 동기화
  useEffect(() => {
    callStateRef.current = callState
  }, [callState])

  const channelRef = useRef<any>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const mediaConnectionRef = useRef<MediaConnection | null>(null)
  const durationIntervalRef = useRef<number | null>(null)
  const wakeLockRef = useRef<any>(null)
  const connectionHealthRef = useRef<number | null>(null)
  const lastActivityRef = useRef<Date>(new Date())
  const callingTimeoutRef = useRef<number | null>(null) // 발신자 타임아웃 (60초)

  // ✅ HMAC 기반 동적 TURN 인증 (useCallRoom.ts와 동일)
  const { username: turnUsername, credential: turnCredential } = generateTurnCredentials(
    import.meta.env.VITE_TURN_SECRET_KEY || 'default-secret-key'
  )

  const peerServerOptions: PeerJSOption = {
    host: 'peer01.mateyou.me',
    port: 443,
    path: '/myapp',
    secure: true,
    key: import.meta.env.VITE_PEERJS_API_KEY || 'mateyou-prod',
    debug: 2,
    config: {
      iceServers: [
        // ✅ TURN TLS (5349) — Android/iOS PWA 최우선 (안정성)
        {
          urls: 'turns:peer01.mateyou.me:5349?transport=tcp',
          username: turnUsername,
          credential: turnCredential,
        },
        // ✅ TURN UDP (빠른 속도)
        {
          urls: 'turn:peer01.mateyou.me:3478?transport=udp',
          username: turnUsername,
          credential: turnCredential,
        },
        // ✅ TURN TCP (방화벽/공공 Wi-Fi Fallback)
        {
          urls: 'turn:peer01.mateyou.me:3478?transport=tcp',
          username: turnUsername,
          credential: turnCredential,
        },
        // ✅ STUN (LAN 직접 연결 fallback)
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
      // ✅ 모든 후보 사용 (iOS/Android 필수)
      iceTransportPolicy: 'all',
      // ✅ Android 연결 안정화 (후보 풀 확장)
      iceCandidatePoolSize: 4,
    },
  }

  const buildPeerId = (roomId: string, ownerId: string) => `video-${roomId}-${ownerId}`

  // 브로드캐스트 전송 헬퍼 함수 (구독 후 전송, 재시도 포함)
  const sendBroadcast = async (targetUserId: string, event: string, payload: any): Promise<boolean> => {
    const targetChannel = supabase.channel(`video-call-notifications-${targetUserId}`)
    
    try {
      // 채널 구독 대기
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Channel subscription timeout'))
        }, 5000)
        
        targetChannel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            clearTimeout(timeout)
            resolve()
          } else if (status === 'CHANNEL_ERROR') {
            clearTimeout(timeout)
            reject(new Error('Channel subscription failed'))
          }
        })
      })

      // 재시도 로직 (최대 3회)
      for (let i = 0; i < 3; i++) {
        try {
          await targetChannel.send({
            type: 'broadcast',
            event,
            payload,
          })
          console.log(`✅ 영상통화 브로드캐스트 전송 성공 (${event})`)
          return true
        } catch (sendError) {
          console.warn(`영상통화 브로드캐스트 전송 실패 (시도 ${i + 1}/3):`, sendError)
          if (i < 2) await new Promise(r => setTimeout(r, 500))
        }
      }
      
      console.error(`영상통화 브로드캐스트 전송 최종 실패 (${event})`)
      return false
    } catch (error) {
      console.error('영상통화 브로드캐스트 채널 구독 실패:', error)
      return false
    } finally {
      targetChannel.unsubscribe()
    }
  }

  // 원격 비디오 스트림 설정 (UI 컴포넌트에서 실제 비디오 표시 처리)
  const handleRemoteStream = (stream: MediaStream) => {
    console.log('🎥 Remote video stream received', {
      videoTracks: stream.getVideoTracks().length,
      audioTracks: stream.getAudioTracks().length,
    })
    setRemoteStream(stream)
  }

  const attachMediaConnectionHandlers = (connection: MediaConnection) => {
    mediaConnectionRef.current = connection

    connection.on('stream', (remote) => {
      console.log('🎥 Remote stream connected', {
        peer: connection.peer,
        hasVideo: remote?.getVideoTracks().length,
        hasAudio: remote?.getAudioTracks().length,
      })
      setRemoteStream(remote)
      setCallState('connected')
      startDurationTracking()
      lastActivityRef.current = new Date()

      // ✅ 발신자 타임아웃 클리어 (연결 성공)
      if (callingTimeoutRef.current) {
        clearTimeout(callingTimeoutRef.current)
        callingTimeoutRef.current = null
        console.log('✅ 발신자 타임아웃 클리어됨 (연결 성공)')
      }

      try { 
        stopAllCallSounds()
        playConnectedTone() 
      } catch (e) { /* 무시 */ }

      handleRemoteStream(remote)
    })

    connection.on('close', () => {
      console.log('🔌 Media connection closed', { peer: connection.peer })
    })

    connection.on('error', (error) => {
      console.error('❌ Media connection error:', error)
      endCall()
    })
  }

  const createPeerInstance = (peerId: string) => {
    const peerInstance = new Peer(peerId, peerServerOptions)

    peerInstance.on('call', (incomingCall) => {
      console.log('📹 Incoming video connection', { from: incomingCall.peer })
      if (!localStreamRef.current) {
        console.warn('로컬 미디어 스트림이 없어 통화를 수락할 수 없습니다.')
        return
      }

      incomingCall.answer(localStreamRef.current)
      attachMediaConnectionHandlers(incomingCall)
    })

    peerInstance.on('error', (error) => {
      console.error('❌ Peer error:', error)
      endCall()
    })

    peerInstance.on('close', () => {
      console.log('🔌 Peer 연결 종료', { peerId })
    })

    return peerInstance
  }

  // Peer 인스턴스 생성 + 연결 대기 (Promise 버전)
  const createPeerInstanceAsync = (peerId: string): Promise<Peer> => {
    return new Promise((resolve, reject) => {
      const peerInstance = new Peer(peerId, peerServerOptions)
      const timeout = setTimeout(() => {
        console.error('❌ Video Peer 연결 타임아웃 (5초)')
        peerInstance.destroy()
        reject(new Error('Video Peer connection timeout'))
      }, 5000)

      peerInstance.on('open', (id) => {
        console.log('✅ Video Peer 서버 연결 완료', { peerId: id })
        clearTimeout(timeout)
        resolve(peerInstance)
      })

      peerInstance.on('call', (incomingCall) => {
        console.log('📹 Incoming video connection', { from: incomingCall.peer })
        if (!localStreamRef.current) {
          console.warn('로컬 미디어 스트림이 없어 통화를 수락할 수 없습니다.')
          return
        }
        incomingCall.answer(localStreamRef.current)
        attachMediaConnectionHandlers(incomingCall)
      })

      peerInstance.on('error', (error) => {
        console.error('❌ Video Peer error:', error)
        clearTimeout(timeout)
        reject(error)
      })

      peerInstance.on('close', () => {
        console.log('🔌 Video Peer 연결 종료', { peerId })
      })
    })
  }

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const navigateToChat = () => {
    if (activeCall) {
      const partnerName = encodeURIComponent(activeCall.partnerName)
      window.location.href = `/chat?partnerId=${activeCall.partnerId}&partnerName=${partnerName}`
    }
  }

  const startDurationTracking = () => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
    }

    durationIntervalRef.current = window.setInterval(() => {
      setActiveCall(prev => {
        if (!prev) return null
        const now = new Date()
        const duration = Math.floor((now.getTime() - prev.startedAt.getTime()) / 1000)
        return { ...prev, duration }
      })
    }, 1000)
  }

  const stopDurationTracking = () => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }
  }

  const cleanupStreams = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
      localStreamRef.current = null
    }
    setLocalStream(null)
    setRemoteStream(null)
  }

  const cleanupPeer = () => {
    if (mediaConnectionRef.current) {
      mediaConnectionRef.current.close()
      mediaConnectionRef.current = null
    }

    if (peerRef.current) {
      peerRef.current.destroy()
    }

    setPeer(null)
    peerRef.current = null
  }

  // 스크롤 위치 저장/복원을 위한 ref
  const savedScrollPositionRef = useRef<{ x: number; y: number } | null>(null)
  const scrollContainerRef = useRef<HTMLElement | null>(null)

  // 스크롤 위치 저장
  const saveScrollPosition = () => {
    // 메인 스크롤 컨테이너 찾기
    const container = document.querySelector('[class*="overflow-y-auto"]') as HTMLElement
    if (container) {
      scrollContainerRef.current = container
      savedScrollPositionRef.current = {
        x: container.scrollLeft,
        y: container.scrollTop
      }
    } else {
      // 스크롤 컨테이너를 찾지 못한 경우 window 스크롤 저장
      savedScrollPositionRef.current = {
        x: window.scrollX,
        y: window.scrollY
      }
    }
    // body 스크롤 lock
    document.body.style.overflow = 'hidden'
  }

  const resetCallState = () => {
    try { stopAllCallSounds() } catch (e) { /* 무시 */ }
    
    // ✅ 발신자 타임아웃 클리어
    if (callingTimeoutRef.current) {
      clearTimeout(callingTimeoutRef.current)
      callingTimeoutRef.current = null
    }
    
    // ✅ 오디오 모드 리셋 (통화 종료)
    try { AudioToggle.resetAudioMode() } catch (e) { /* 무시 */ }
    
    setCallState('idle')
    setActiveCall(null)
    setIncomingCall(null)
    setIsMuted(false)
    setIsCameraOff(false)
    setCurrentRoom(null)
    stopDurationTracking()
    cleanupPeer()
    cleanupStreams()

    // body 스크롤 unlock
    document.body.style.overflow = 'unset'

    // 스크롤 위치 복원
    if (savedScrollPositionRef.current) {
      // 다음 프레임에서 복원하여 레이아웃 변경 후 적용되도록 함
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const { x, y } = savedScrollPositionRef.current!
          
          // 메인 스크롤 컨테이너 찾기
          if (!scrollContainerRef.current) {
            const container = document.querySelector('[class*="overflow-y-auto"]') as HTMLElement
            if (container) {
              scrollContainerRef.current = container
            }
          }
          
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollTo({ left: x, top: y, behavior: 'instant' })
          } else {
            // 스크롤 컨테이너를 찾지 못한 경우 window 스크롤 복원
            window.scrollTo({ left: x, top: y, behavior: 'instant' })
          }
          
          savedScrollPositionRef.current = null
          scrollContainerRef.current = null
        })
      })
    }
  }

  // 들어오는 영상통화 수신 리스너 설정
  useEffect(() => {
    if (!user?.id) {
      if (channelRef.current) {
        channelRef.current.unsubscribe()
        channelRef.current = null
      }
      return
    }

    if (channelRef.current) {
      channelRef.current.unsubscribe()
    }

    const channelName = `video-call-notifications-${user.id}`
    console.log('📹 [VideoCall] 채널 구독 시작:', { channelName, userId: user.id, userRole: user.role })
    
    channelRef.current = supabase.channel(channelName)

    // broadcast 신호 감지
    channelRef.current.on('broadcast', { event: 'video-call-signal' }, (payload: any) => {
      const { type, from, fromName, roomId, callId: incomingCallId, to } = payload.payload

      console.log('📹 Video Broadcast 수신:', {
        type,
        from,
        to,
        userId: user.id,
        roomId
      })

      const callerPeerId = roomId && from ? buildPeerId(roomId, from) : null

      if (type === 'video-call-request' && from !== user.id && to === user.id) {
        if (!roomId || !callerPeerId) {
          console.warn('영상통화 요청에 필요한 정보가 부족합니다.', { roomId, from })
          return
        }

        console.log('📹 [Member] 영상통화 요청 수신됨', { from, fromName, roomId })

        ringingTone.start().catch((e) => console.warn('벨소리 에러:', e))

        setIncomingCall({
          roomId,
          peerId: callerPeerId,
          from,
          fromName: fromName || '알 수 없음',
          callId: incomingCallId
        })
        setCallState('receiving')
      }

      if (type === 'video-call-answer' && from !== user.id && to === user.id) {
        console.log('✅ [Caller] 영상통화 응답 수신됨 - 수신측의 call을 대기합니다', { from, roomId })
        // 수신측에서 peer.call()을 하면 발신측의 peer.on('call', ...) 에서 처리됨
      }

      if (type === 'video-call-ended' && from !== user.id && to === user.id) {
        try { 
          stopAllCallSounds()
          playEndTone() 
        } catch (e) {}
        resetCallState()
      }

      if (type === 'video-call-rejected' && from !== user.id && to === user.id) {
        try { 
          stopAllCallSounds()
          playEndTone() 
        } catch (e) {}
        resetCallState()
      }
    })

    channelRef.current.subscribe((status) => {
      console.log('📹 [VideoCall] 채널 구독 상태:', { status, channelName, userId: user.id })
    })

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe()
        channelRef.current = null
      }
    }
  }, [user?.id])

  // 🔴 푸시 알림에서 오는 영상통화 수신 이벤트 처리
  useEffect(() => {
    const processIncomingVideoCall = async (roomId: string, callerId: string, callerName: string) => {
      console.log('📹 [VideoCall] 푸시 알림에서 영상통화 수신 처리:', { roomId, callerId, callerName, currentState: callStateRef.current })
      
      // 이미 통화 중이면 무시 (ref 사용으로 클로저 문제 해결)
      if (callStateRef.current !== 'idle') {
        console.log('📹 [VideoCall] 이미 통화 중 - 푸시 영상통화 무시:', callStateRef.current)
        return
      }
      
      // 통화방 정보 조회
      try {
        const { data: roomData, error: roomError } = await supabase
          .from('call_rooms')
          .select('*')
          .eq('id', roomId)
          .maybeSingle()
        
        if (roomError || !roomData) {
          console.error('📹 [VideoCall] 통화방 조회 실패:', roomError)
          return
        }
        
        // 이미 종료된 통화면 무시
        if (roomData.status !== 'waiting') {
          console.log('📹 [VideoCall] 통화가 이미 종료됨:', roomData.status)
          return
        }
        
        // 발신자 정보 조회
        let resolvedCallerName = callerName
        if (roomData.partner_id) {
          const { data: partnerData } = await supabase
            .from('partners')
            .select('partner_name, member_id, members!member_id(name)')
            .eq('id', roomData.partner_id)
            .single()
          
          if (partnerData) {
            resolvedCallerName = partnerData.partner_name || partnerData.members?.name || callerName
          }
        }
        
        const peerId = buildPeerId(roomId, callerId)
        
        // 🔊 벨소리 시작
        try {
          console.log('📹 [VideoCall] 벨소리 시작 (푸시 알림)')
          ringingTone.start()
        } catch (e) {
          console.warn('벨소리 시작 실패:', e)
        }
        
        setIncomingCall({
          roomId,
          peerId,
          from: callerId,
          fromName: resolvedCallerName,
          callId: null
        })
        setCallState('receiving')
        
        console.log('📹 [VideoCall] 영상통화 수신 팝업 표시됨')
      } catch (error) {
        console.error('📹 [VideoCall] 푸시 영상통화 처리 오류:', error)
      }
    }
    
    const handleIncomingVideoCallFromPush = async (event: CustomEvent) => {
      const { roomId, callerId, callerName } = event.detail
      await processIncomingVideoCall(roomId, callerId, callerName)
    }
    
    window.addEventListener('incoming-video-call-from-push', handleIncomingVideoCallFromPush as unknown as EventListener)
    console.log('📹 [VideoCall] 푸시 영상통화 이벤트 리스너 등록됨')
    
    // 🔴 마운트 시 pending call 확인 (콜드 스타트 대응)
    const checkPendingCall = async () => {
      try {
        const { getPendingCall, clearPendingCall } = await import('@/hooks/useInitialPermissions')
        const pending = getPendingCall()
        if (pending && pending.type === 'video') {
          console.log('📹 [VideoCall] Pending video call 발견:', pending)
          clearPendingCall()
          await processIncomingVideoCall(pending.roomId, pending.callerId, pending.callerName)
        }
      } catch (e) {
        console.warn('Pending video call 확인 실패:', e)
      }
    }
    
    // 약간의 딜레이 후 pending call 확인 (컴포넌트 완전 마운트 후)
    const timer = setTimeout(checkPendingCall, 500)
    
    return () => {
      window.removeEventListener('incoming-video-call-from-push', handleIncomingVideoCallFromPush as unknown as EventListener)
      clearTimeout(timer)
    }
  }, []) // ref 사용으로 의존성 제거

  // 페이지 언로드 시 통화 정리
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (callState !== 'idle') {
        e.preventDefault()
        e.returnValue = '영상통화 중입니다. 페이지를 나가시겠습니까?'
        return '영상통화 중입니다. 페이지를 나가시겠습니까?'
      }
    }

    const handleUnload = () => {
      if (callState !== 'idle') {
        endCall()
      }
    }

    const handlePageHide = () => {
      if (callState !== 'idle') {
        console.log('📱 [Mobile] 페이지가 숨겨짐 - 영상통화 종료 시도')
        endCall()
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    window.addEventListener('unload', handleUnload)
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('unload', handleUnload)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [callState])

  // 화면 잠금 방지 (Wake Lock)
  useEffect(() => {
    const requestWakeLock = async () => {
      if (callState === 'connected' && 'wakeLock' in navigator) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request('screen')
          console.log('📱 [Mobile] 화면 잠금 방지 활성화')
        } catch (err) {
          console.warn('📱 [Mobile] Wake Lock 지원 안됨:', err)
        }
      }
    }

    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release()
          wakeLockRef.current = null
          console.log('📱 [Mobile] 화면 잠금 방지 해제')
        } catch (err) {
          console.warn('📱 [Mobile] Wake Lock 해제 실패:', err)
        }
      }
    }

    if (callState === 'connected') {
      requestWakeLock()
    } else {
      releaseWakeLock()
    }

    return () => {
      releaseWakeLock()
    }
  }, [callState])

  // 미디어 스트림 획득 (비디오 + 오디오) - 고화질 설정
  const getMediaStream = async (facing: 'user' | 'environment' = 'user') => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: {
          facingMode: facing,
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
          frameRate: { ideal: 30, min: 24 },
        }
      })
      return stream
    } catch (error) {
      console.error('고화질 미디어 스트림 획득 실패, 기본 화질로 재시도:', error)
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: {
            facingMode: facing,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          }
        })
        return fallbackStream
      } catch (fallbackError) {
        console.error('기본 화질도 실패, 오디오만 시도:', fallbackError)
        try {
          const audioOnlyStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
          return audioOnlyStream
        } catch (audioError) {
          console.error('오디오 스트림도 획득 실패:', audioError)
          throw audioError
        }
      }
    }
  }

  // 영상통화 시작
  const startCall = async (partnerId: string, partnerName: string, callId?: string) => {
    console.log('📹 [VideoStartCall] 호출됨:', { userId: user?.id, callState, partnerId, partnerName })
    
    if (!user?.id) {
      console.warn('📹 [VideoStartCall] 사용자 없음, 리턴')
      return
    }
    
    if (callState !== 'idle') {
      console.warn('📹 [VideoStartCall] callState가 idle이 아님:', callState)
      return
    }

    try {
      setCallState('calling')
      
      try { dialingTone.start() } catch (e) { /* 무시 */ }

      const deviceInfo = {
        os: navigator.platform,
        browser: navigator.userAgent.includes('Chrome')
          ? 'Chrome'
          : navigator.userAgent.includes('Firefox')
            ? 'Firefox'
            : 'Other',
      }

      const sessionCallId = callId || `video-call-${generateUUID()}`

      // API 호출로 통화방 생성
      console.log('📹 [VideoStartCall] API 호출 시작:', { partnerId, partnerName, sessionCallId })
      const response = await edgeApi.voiceCall.startCall({
        partner_id: partnerId,
        partner_name: partnerName,
        call_id: sessionCallId,
        call_type: 'video',
        device_info: deviceInfo,
      })

      console.log('📹 [VideoStartCall] API 응답:', response)

      // 양쪽에서 동시에 통화를 건 경우 - 기존 통화방 재사용
      if (response.data.reused) {
        console.log('🔄 [VideoStartCall] 상대방이 이미 통화를 걸었습니다. 기존 통화방으로 연결:', {
          roomId: response.data.room_id,
          message: response.data.message
        })
        
        try { stopAllCallSounds() } catch (e) {}
        setCallState('idle')
        
        // 이미 incoming call이 오고 있을 것이므로, 안내 메시지 표시
        if (incomingCall && incomingCall.roomId === response.data.room_id) {
          console.log('📞 [VideoStartCall] 자동으로 상대방 영상통화에 응답합니다.')
          await answerCall()
        } else {
          await new Promise(r => setTimeout(r, 800))
          console.warn('⚠️ [VideoStartCall] 상대방이 먼저 영상통화를 걸었습니다. 수신 알림을 확인해주세요.')
          alert('상대방이 이미 영상통화를 걸었습니다. 수신 알림을 확인해주세요.')
        }
        return
      }

      const room = response.data.room
      const localPeerId = buildPeerId(room.id, user.id)
      setCurrentRoom(room)

      // 비디오 + 오디오 스트림 확보
      const stream = await getMediaStream(facingMode)
      console.log('📹 [Caller] 미디어 스트림 획득:', {
        hasVideo: stream.getVideoTracks().length > 0,
        hasAudio: stream.getAudioTracks().length > 0,
        videoTracks: stream.getVideoTracks().map(t => t.label),
        audioTracks: stream.getAudioTracks().map(t => t.label),
      })
      localStreamRef.current = stream
      setLocalStream(stream)

      const newPeer = createPeerInstance(localPeerId)
      peerRef.current = newPeer
      setPeer(newPeer)

      // 발신측에서 수신측의 call을 받을 수 있도록 핸들러 설정
      newPeer.on('call', (mediaCall) => {
        console.log('📞 [Caller] 수신측으로부터 call 수신', { from: mediaCall.peer })
        
        const currentStream = localStreamRef.current
        if (currentStream) {
          mediaCall.answer(currentStream)
          mediaConnectionRef.current = mediaCall
          attachMediaConnectionHandlers(mediaCall)
          setCallState('connected')
          startDurationTracking()
          
          try { 
            stopAllCallSounds()
            playConnectedTone() 
          } catch (e) {}
        } else {
          console.error('❌ 로컬 스트림이 없어 응답 불가')
        }
      })

      newPeer.on('error', (error) => {
        console.error('❌ [Caller] Peer 에러:', error)
      })

      // Peer 연결 대기 후 브로드캐스트 전송
      newPeer.on('open', async () => {
        console.log('🔄 [Caller] Video Peer ready', { peerId: localPeerId })
      })

      // Peer open 여부와 관계없이 즉시 브로드캐스트 전송 시도 (약간의 딜레이 후)
      setTimeout(async () => {
        console.log('📹 [VideoStartCall] 브로드캐스트 전송 시도', { partnerId, roomId: room.id })
        const sent = await sendBroadcast(partnerId, 'video-call-signal', {
          type: 'video-call-request',
          from: user.id,
          fromName: user.name || user.username,
          to: partnerId,
          roomId: room.id,
          callId: sessionCallId,
        })
        console.log('📹 [VideoStartCall] 브로드캐스트 전송 결과:', sent)
        
        // 전송 실패 시 재시도
        if (!sent) {
          await new Promise(r => setTimeout(r, 1000))
          const retried = await sendBroadcast(partnerId, 'video-call-signal', {
            type: 'video-call-request',
            from: user.id,
            fromName: user.name || user.username,
            to: partnerId,
            roomId: room.id,
            callId: sessionCallId,
          })
          console.log('📹 [VideoStartCall] 브로드캐스트 재시도 결과:', retried)
        }
      }, 500)

      // 스크롤 위치 저장 및 body 스크롤 lock
      saveScrollPosition()

      setActiveCall({
        partnerId,
        partnerName,
        callId: sessionCallId,
        roomId: room.id,
        startedAt: new Date(),
        duration: 0,
      })

      // ✅ 발신자 타임아웃 설정 (60초 후 상대방 무응답시 자동 종료)
      if (callingTimeoutRef.current) {
        clearTimeout(callingTimeoutRef.current)
      }
      const timeoutId = window.setTimeout(() => {
        // 타임아웃 ref가 아직 유효한 경우에만 실행 (연결 성공시 null로 클리어됨)
        if (callingTimeoutRef.current === timeoutId) {
          console.warn('⏰ [VideoCall] 60초 타임아웃 - 상대방 무응답')
          alert('상대방이 응답하지 않습니다.')
          endCall()
        }
      }, 60000) // 60초
      callingTimeoutRef.current = timeoutId
    } catch (error) {
      console.error('Failed to start video call:', error)
      resetCallState()
    }
  }

  // 채팅 메시지 전송
  const sendCallStatusMessage = async (partnerId: string, messageType: 'accepted' | 'rejected' | 'ended', customMessage?: string) => {
    try {
      const message = customMessage || (
        messageType === 'accepted' ? '[CALL_ACCEPT:video]' :
        messageType === 'rejected' ? '📹 영상통화를 거절했습니다.' :
        '[CALL_END:video:0]'
      )

      await edgeApi.members.sendChatMessage({
        receiver_id: partnerId,
        message: message
      })
    } catch (error) {
      console.error('채팅 메시지 전송 실패:', error)
    }
  }

  // 영상통화 응답
  const answerCall = async () => {
    if (!incomingCall || !user?.id) return

    console.log('📹 [VideoAnswerCall] 영상통화 응답 시작')

    try {
      // 채팅 메시지 전송을 비동기로 처리
      Promise.resolve().then(async () => {
        try {
          await sendCallStatusMessage(incomingCall.from, 'accepted')
        } catch (messageError) {
          console.error('❌ [VideoAnswerCall] 채팅 메시지 전송 실패 (무시됨):', messageError)
        }
      }).catch(() => {})

      const deviceInfo = {
        os: navigator.platform,
        browser: navigator.userAgent.includes('Chrome')
          ? 'Chrome'
          : navigator.userAgent.includes('Firefox')
            ? 'Firefox'
            : 'Other',
      }

      const localPeerId = buildPeerId(incomingCall.roomId, user.id)
      const callerPeerId = incomingCall.peerId || buildPeerId(incomingCall.roomId, incomingCall.from)

      // 스크롤 위치 저장 및 body 스크롤 lock
      saveScrollPosition()

      // 🚀 API는 백그라운드에서 처리 (기다리지 않음)
      edgeApi.voiceCall.joinCall({
        room_id: incomingCall.roomId,
        device_info: deviceInfo,
      }).then(() => {
        console.log('✅ [VideoAnswerCall] API 완료 (백그라운드)')
      }).catch(err => {
        console.error('❌ [VideoAnswerCall] API 실패 (무시):', err)
      })

      // 🚀 미디어 스트림 + Peer 연결만 병렬 처리 (API 기다리지 않음)
      console.log('📹 [VideoAnswerCall] 병렬 처리 시작 (미디어 + Peer)')
      const parallelStartTime = Date.now()

      const [stream, newPeer] = await Promise.all([
        // 1. 미디어 스트림 획득
        getMediaStream(facingMode).then(s => {
          console.log('✅ [VideoAnswerCall] 미디어 스트림 획득 완료')
          return s
        }),

        // 2. Peer 인스턴스 생성 + 서버 연결 대기
        createPeerInstanceAsync(localPeerId).then(p => {
          console.log('✅ [VideoAnswerCall] Peer 연결 완료')
          return p
        })
      ]) as [MediaStream, Peer]

      const parallelDuration = Date.now() - parallelStartTime
      console.log(`✅ [VideoAnswerCall] 병렬 처리 완료 (${parallelDuration}ms)`)

      localStreamRef.current = stream
      setLocalStream(stream)
      setPeer(newPeer)
      peerRef.current = newPeer

      // 발신측의 call을 받을 수 있도록 핸들러 설정
      newPeer.on('call', (mediaCall) => {
        console.log('📞 [Receiver] 발신측으로부터 call 수신', { from: mediaCall.peer })
        
        if (stream) {
          console.log('✅ [Receiver] call에 answer 전송', {
            hasAudio: stream.getAudioTracks().length > 0,
            hasVideo: stream.getVideoTracks().length > 0
          })
          mediaCall.answer(stream)
          mediaConnectionRef.current = mediaCall
          attachMediaConnectionHandlers(mediaCall)
          setCallState('connected')
          startDurationTracking()
        } else {
          console.error('❌ [Receiver] 스트림이 없어 call에 answer할 수 없음')
        }
      })

      // Peer가 이미 연결되었으므로 바로 실행
      console.log('🔄 [Receiver] Video Peer already ready', { peerId: localPeerId, callerPeerId })

      // 발신측에게 call 시도
      console.log('📹 [VideoAnswerCall] 발신측에게 call 시도', { callerPeerId })
      const mediaCall = newPeer.call(callerPeerId, stream)
      if (mediaCall) {
        console.log('✅ [VideoAnswerCall] 미디어 연결 생성 완료')
        mediaConnectionRef.current = mediaCall
        attachMediaConnectionHandlers(mediaCall)
      } else {
        console.warn('⚠️ [VideoAnswerCall] 미디어 연결 생성 실패 - 발신측의 call을 기다림')
      }

      // 통화 응답 신호 전송 (비동기)
      sendBroadcast(incomingCall.from, 'video-call-signal', {
        type: 'video-call-answer',
        from: user.id,
        fromName: user.name || user.username,
        to: incomingCall.from,
        roomId: incomingCall.roomId,
        callId: incomingCall.callId,
      }).catch(err => console.error('❌ 통화 응답 신호 전송 실패:', err))

      setActiveCall({
        partnerId: incomingCall.from,
        partnerName: incomingCall.fromName,
        callId: incomingCall.callId,
        roomId: incomingCall.roomId,
        startedAt: new Date(),
        duration: 0,
      })

      try { ringingTone.stop() } catch (e) { /* 무시 */ }

      // 수신자도 UI가 표시되도록 callState를 'calling'으로 변경 (연결 중 화면 표시)
      // 실제 연결 완료 시 peer.on('open') 또는 peer.on('call')에서 'connected'로 변경됨
      setCallState('calling')
      setIncomingCall(null)

    } catch (error) {
      console.error('Failed to answer video call:', error)
      resetCallState()
    }
  }

  // 영상통화 거절
  const rejectCall = async () => {
    if (!incomingCall) return

    try {
      await sendCallStatusMessage(incomingCall.from, 'rejected')
    } catch (error) {
      console.error('Failed to send reject message:', error)
    }

    await sendBroadcast(incomingCall.from, 'video-call-signal', {
      type: 'video-call-rejected',
      from: user?.id,
      to: incomingCall.from,
      roomId: incomingCall.roomId
    })

    setIncomingCall(null)
    setCallState('idle')
    
    try { ringingTone.stop() } catch (e) {}
  }

  // 영상통화 종료
  const endCall = async () => {
    try { 
      stopAllCallSounds()
      playEndTone() 
    } catch (e) {}

    // 즉시 상태 리셋하여 화면을 바로 닫음
    const currentCall = activeCall
    const partnerId = currentCall?.partnerId
    const roomId = currentCall?.roomId
    const durationSeconds = currentCall?.duration || 0

    // 상태를 먼저 리셋하여 화면이 바로 닫히도록 함
    resetCallState()

    // API 호출과 메시지 전송은 비동기로 처리 (화면 닫힘을 막지 않음)
    // 주의: resetCallState() 후에는 activeCall과 callState가 이미 리셋되었으므로, 
    // 리셋 전에 저장한 값들을 사용해야 함
    if (currentCall || callState === 'calling' || callState === 'connected') {
      Promise.resolve().then(async () => {
        try {
          // API를 통해 통화방 종료
          if (roomId) {
            await edgeApi.voiceCall.endCall({
              room_id: roomId
            }).catch((error) => {
              console.error('Failed to end video call via API:', error)
            })
          }

          // 통화 종료 신호 전송
          if (partnerId) {
            try {
              const sent = await sendBroadcast(partnerId, 'video-call-signal', {
                type: 'video-call-ended',
                from: user?.id,
                to: partnerId,
                roomId: roomId
              })

              // 통화 종료 신호 전송 성공 시 채팅 메시지도 전송
              if (sent) {
                const message = `[CALL_END:video:${durationSeconds}]`
                await sendCallStatusMessage(partnerId, 'ended', message).catch((messageError) => {
                  console.error('통화 종료 메시지 전송 실패:', messageError)
                })
              }
            } catch (broadcastError) {
              console.error('통화 종료 신호 전송 실패:', broadcastError)
            }
          }
        } catch (error) {
          console.error('통화 종료 후처리 실패:', error)
        }
      }).catch(() => {})
    }
  }

  // 음소거 토글
  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled
      })
      setIsMuted(!isMuted)
    }
  }

  // 카메라 on/off 토글
  const toggleCamera = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled
      })
      setIsCameraOff(!isCameraOff)
    }
  }

  // 카메라 전환 (전면/후면)
  const switchCamera = async () => {
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(newFacingMode)

    if (localStream && callState === 'connected') {
      try {
        // 기존 비디오 트랙 중지
        localStream.getVideoTracks().forEach(track => track.stop())

        // 새 비디오 스트림 획득
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: newFacingMode }
        })

        const newVideoTrack = newStream.getVideoTracks()[0]
        
        // 로컬 스트림에 새 비디오 트랙 추가
        localStream.removeTrack(localStream.getVideoTracks()[0])
        localStream.addTrack(newVideoTrack)

        // PeerJS 연결에 새 트랙 적용
        if (mediaConnectionRef.current) {
          const sender = mediaConnectionRef.current.peerConnection
            ?.getSenders()
            .find(s => s.track?.kind === 'video')
          
          if (sender) {
            await sender.replaceTrack(newVideoTrack)
          }
        }

        setLocalStream(localStream)
        console.log(`📹 카메라 전환: ${newFacingMode}`)
      } catch (error) {
        console.error('카메라 전환 실패:', error)
        setFacingMode(facingMode) // 원복
      }
    }
  }

  const value: GlobalVideoCallContextType = {
    callState,
    activeCall,
    incomingCall,
    localStream,
    remoteStream,
    startCall,
    answerCall,
    rejectCall,
    endCall,
    isMuted,
    toggleMute,
    isCameraOff,
    toggleCamera,
    facingMode,
    switchCamera,
    formatDuration,
    navigateToChat,
  }

  return (
    <GlobalVideoCallContext.Provider value={value}>
      {children}
    </GlobalVideoCallContext.Provider>
  )
}

export function useGlobalVideoCall() {
  const context = useContext(GlobalVideoCallContext)
  if (!context) {
    throw new Error('useGlobalVideoCall must be used within GlobalVideoCallProvider')
  }
  return context
}

