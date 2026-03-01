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
}

interface ActiveCall {
  partnerId: string
  partnerName: string
  callId?: string | null
  roomId: string
  startedAt: Date
  duration: number // seconds
}

interface GlobalVoiceCallContextType {
  // 통화 상태
  callState: 'idle' | 'calling' | 'receiving' | 'connected'
  activeCall: ActiveCall | null
  incomingCall: IncomingCall | null

  // 미디어 스트림
  localStream: MediaStream | null
  remoteStream: MediaStream | null

  // 통화 액션
  startCall: (partnerId: string, partnerName: string, callId?: string) => Promise<void>
  answerCall: () => Promise<void>
  rejectCall: () => void
  endCall: () => Promise<void>
  
  // LiveKit 통화용 - PeerJS 상태만 리셋 (상대방에게 신호 안 보냄)
  clearForLiveKit: () => void

  // 음소거 관리
  isMuted: boolean
  toggleMute: () => void

  // 스피커폰 관리
  isSpeakerOn: boolean
  toggleSpeaker: () => Promise<void>

  // 통화 시간 포맷팅
  formatDuration: (seconds: number) => string

  // 채팅방으로 이동
  navigateToChat: () => void
}

const GlobalVoiceCallContext = createContext<GlobalVoiceCallContextType | null>(null)

interface GlobalVoiceCallProviderProps {
  children: ReactNode
}

export function GlobalVoiceCallProvider({ children }: GlobalVoiceCallProviderProps) {
  const { user } = useAuth()
  const [peer, setPeer] = useState<Peer | null>(null)
  const peerRef = useRef<Peer | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [callState, setCallState] = useState<'idle' | 'calling' | 'receiving' | 'connected'>('idle')
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null)
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isSpeakerOn, setIsSpeakerOn] = useState(true) // 기본적으로 스피커폰 ON
  const [currentRoom, setCurrentRoom] = useState<CallRoom | null>(null)

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
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null)
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

  const buildPeerId = (roomId: string, ownerId: string) => `${roomId}-${ownerId}`

  // 브로드캐스트 전송 헬퍼 함수 (구독 후 전송, 재시도 포함)
  const sendBroadcast = async (targetUserId: string, event: string, payload: any): Promise<boolean> => {
    const channelName = `call-notifications-${targetUserId}`
    console.log(`📡 [sendBroadcast] 시작`, {
      channelName,
      event,
      targetUserId,
      payloadType: payload?.type,
      from: payload?.from,
      to: payload?.to
    })
    
    const targetChannel = supabase.channel(channelName)
    
    try {
      // 채널 구독 대기
      console.log(`📡 [sendBroadcast] 채널 구독 시작: ${channelName}`)
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.error(`❌ [sendBroadcast] 채널 구독 타임아웃: ${channelName}`)
          reject(new Error('Channel subscription timeout'))
        }, 5000)
        
        targetChannel.subscribe((status) => {
          console.log(`📡 [sendBroadcast] 채널 상태 변경: ${status}`, { channelName })
          if (status === 'SUBSCRIBED') {
            console.log(`✅ [sendBroadcast] 채널 구독 성공: ${channelName}`)
            clearTimeout(timeout)
            resolve()
          } else if (status === 'CHANNEL_ERROR') {
            console.error(`❌ [sendBroadcast] 채널 구독 에러: ${channelName}`)
            clearTimeout(timeout)
            reject(new Error('Channel subscription failed'))
          } else if (status === 'TIMED_OUT') {
            console.error(`❌ [sendBroadcast] 채널 구독 타임아웃: ${channelName}`)
            clearTimeout(timeout)
            reject(new Error('Channel subscription timed out'))
          } else if (status === 'CLOSED') {
            console.warn(`⚠️ [sendBroadcast] 채널 닫힘: ${channelName}`)
          }
        })
      })

      console.log(`📡 [sendBroadcast] 브로드캐스트 전송 시작`, { event, payload })
      
      // 메시지 전송 전에 잠시 대기하여 수신자가 채널을 구독할 시간을 줌
      await new Promise(r => setTimeout(r, 200))
      
      // 재시도 로직 (최대 3회)
      for (let i = 0; i < 3; i++) {
        try {
          const sendResult = await targetChannel.send({
            type: 'broadcast',
            event,
            payload,
          })
          console.log(`✅ [sendBroadcast] 브로드캐스트 전송 성공 (${event})`, {
            attempt: i + 1,
            result: sendResult,
            payload
          })
          
          // 전송 후 채널을 즉시 해제하지 않고 잠시 유지하여 메시지가 전달될 시간을 줌
          await new Promise(r => setTimeout(r, 300))
          
          return true
        } catch (sendError) {
          console.warn(`⚠️ [sendBroadcast] 브로드캐스트 전송 실패 (시도 ${i + 1}/3):`, {
            error: sendError,
            event,
            channelName
          })
          if (i < 2) {
            console.log(`📡 [sendBroadcast] 재시도 대기 중... (${500}ms)`)
            await new Promise(r => setTimeout(r, 500))
          }
        }
      }
      
      console.error(`❌ [sendBroadcast] 브로드캐스트 전송 최종 실패 (${event})`, {
        channelName,
        targetUserId,
        payload
      })
      return false
    } catch (error) {
      console.error('❌ [sendBroadcast] 브로드캐스트 채널 구독 실패:', {
        error,
        channelName,
        targetUserId,
        event,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      })
      return false
    } finally {
      console.log(`📡 [sendBroadcast] 채널 구독 해제: ${channelName}`)
      targetChannel.unsubscribe()
    }
  }

  // 원격 오디오 재생
  const playRemoteAudio = async (stream: MediaStream) => {
    try {
      if (!remoteAudioRef.current) {
        // 동적으로 audio 엘리먼트 생성
        const audioElement = document.createElement('audio')
        audioElement.autoplay = true
        audioElement.controls = false
        audioElement.style.display = 'none'
        remoteAudioRef.current = audioElement
        document.body.appendChild(audioElement)
      }

      remoteAudioRef.current.srcObject = stream

      // 브라우저 autoplay 정책을 위한 사용자 상호작용 처리
      try {
        await remoteAudioRef.current.play()
        console.log('🎵 Remote audio playing successfully')
      } catch (playError) {
        console.warn('Auto-play blocked, waiting for user interaction:', playError)
        // 사용자 상호작용 후 재생될 수 있도록 이벤트 리스너 추가
        const playAudio = async () => {
          try {
            await remoteAudioRef.current?.play()
            console.log('🎵 Remote audio playing after user interaction')
            document.removeEventListener('click', playAudio)
            document.removeEventListener('touchstart', playAudio)
          } catch (error) {
            console.error('Failed to play remote audio:', error)
          }
        }
        document.addEventListener('click', playAudio, { once: true })
        document.addEventListener('touchstart', playAudio, { once: true })
      }
    } catch (error) {
      console.error('Failed to setup remote audio:', error)
    }
  }

  const attachMediaConnectionHandlers = (connection: MediaConnection) => {
    mediaConnectionRef.current = connection

    connection.on('stream', (remote) => {
      console.log('🎧 Remote stream connected', {
        peer: connection.peer,
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

      // 🔊 통화 연결: 모든 알림음 중지 + 연결음 재생
      try { 
        stopAllCallSounds()
        playConnectedTone() 
      } catch (e) { /* 무시 */ }

      // 원격 오디오 재생
      playRemoteAudio(remote)
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
      console.log('📞 Incoming media connection', { from: incomingCall.peer })
      if (!localStreamRef.current) {
        console.warn('로컬 오디오 스트림이 없어 통화를 수락할 수 없습니다.')
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
        console.error('❌ Peer 연결 타임아웃 (5초)')
        peerInstance.destroy()
        reject(new Error('Peer connection timeout'))
      }, 5000)

      peerInstance.on('open', (id) => {
        console.log('✅ Peer 서버 연결 완료', { peerId: id })
        clearTimeout(timeout)
        resolve(peerInstance)
      })

      peerInstance.on('call', (incomingCall) => {
        console.log('📞 Incoming media connection', { from: incomingCall.peer })
        if (!localStreamRef.current) {
          console.warn('로컬 오디오 스트림이 없어 통화를 수락할 수 없습니다.')
          return
        }
        incomingCall.answer(localStreamRef.current)
        attachMediaConnectionHandlers(incomingCall)
      })

      peerInstance.on('error', (error) => {
        console.error('❌ Peer error:', error)
        clearTimeout(timeout)
        reject(error)
      })

      peerInstance.on('close', () => {
        console.log('🔌 Peer 연결 종료', { peerId })
      })
    })
  }

  // 통화 시간 포맷팅
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // 채팅방으로 이동
  const navigateToChat = () => {
    if (activeCall) {
      const partnerName = encodeURIComponent(activeCall.partnerName)
      window.location.href = `/chat?partnerId=${activeCall.partnerId}&partnerName=${partnerName}`
    }
  }

  // Duration 업데이트
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

  // 미디어 스트림 정리
  const cleanupStreams = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
      localStreamRef.current = null
    }
    setLocalStream(null)
    setRemoteStream(null)

    // 원격 오디오 정리
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause()
      remoteAudioRef.current.srcObject = null
      if (remoteAudioRef.current.parentNode) {
        remoteAudioRef.current.parentNode.removeChild(remoteAudioRef.current)
      }
      remoteAudioRef.current = null
    }
  }

  // Peer 정리
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

  // 통화 초기화
  const resetCallState = () => {
    // 🔊 모든 알림음 강제 중지
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
    setCurrentRoom(null)
    stopDurationTracking()
    cleanupPeer()
    cleanupStreams()
  }

  // 들어오는 통화 수신 리스너 설정
  useEffect(() => {
    if (!user?.id) {
      if (channelRef.current) {
        channelRef.current.unsubscribe()
        channelRef.current = null
      }
      return
    }

    // 기존 채널 정리
    if (channelRef.current) {
      channelRef.current.unsubscribe()
    }

    // 새 채널 생성 - call_participants 테이블 모니터링
    const myChannelName = `call-notifications-${user.id}`
    console.log(`📡 [VoiceCall] 내 채널 구독 시작: ${myChannelName}`)
    channelRef.current = supabase.channel(myChannelName)

    // call_participants 테이블 변화 감지
    channelRef.current.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'call_participants',
        filter: `member_id=eq.${user.id}`
      },
      async (payload: any) => {

        // call_rooms 정보 조회
        const { data: roomData, error: roomError } = await supabase
          .from('call_rooms')
          .select('*')
          .eq('id', payload.new.room_id)
          .maybeSingle()

        if (roomError) {
          console.error('통화방 조회 실패:', roomError)
          return
        }
        
        if (!roomData) {
          console.log('통화방이 존재하지 않음:', payload.new.room_id)
          return
        }

        // 파트너 정보 별도 조회
        let partnerInfo = null
        if (roomData.partner_id) {
          const { data: partnerData } = await supabase
            .from('partners')
            .select(`
              id,
              partner_name,
              member_id,
              members!member_id(name, id)
            `)
            .eq('id', roomData.partner_id)
            .single()
          partnerInfo = partnerData
        }

        // Real-time 감지는 backup용으로만 사용
        // broadcast가 실패했을 때를 대비한 보조 알림
        if (roomData && roomData.status === 'waiting') {
          // broadcast 방식이 더 중요하므로 이미 알림이 있으면 무시
          if (callState === 'idle' && !incomingCall) {
            const partnerName = partnerInfo?.partner_name || partnerInfo?.members?.name || '알 수 없음'
            const partnerMemberId = partnerInfo?.member_id || partnerInfo?.members?.id

            if (!partnerMemberId || !roomData?.id) return

            const callerMemberId = partnerMemberId
            const peerId = buildPeerId(roomData.id, callerMemberId)

            // 🔊 수신자: 벨소리 시작 (통화 실패해도 영향 없도록 try-catch)
            try { 
              console.log('📞 벨소리 시작 호출 (postgres_changes)')
              ringingTone.start() 
            } catch (e) { 
              console.warn('벨소리 시작 실패:', e)
            }

            setIncomingCall({
              roomId: roomData.id,
              peerId,
              from: callerMemberId,
              fromName: partnerName,
              callId: null
            })
            setCallState('receiving')
          }
        }
      }
    )

    // 기존 broadcast 신호도 유지
    channelRef.current.on('broadcast', { event: 'call-signal' }, (payload: any) => {
      const { type, from, fromName, roomId, callId: incomingCallId, to } = payload.payload

      console.log('📻 Broadcast 수신:', {
        type,
        from,
        to,
        userId: user.id,
        roomId,
        callId: incomingCallId,
        payload: payload.payload
      })

      const callerPeerId = roomId && from ? buildPeerId(roomId, from) : null

      // 나에게 온 통화 요청인지 확인
      if (type === 'call-request' && from !== user.id && to === user.id) {
        if (!roomId || !callerPeerId) {
          console.warn('❌ 통화 요청에 필요한 정보가 부족합니다.', { 
            roomId, 
            from, 
            callerPeerId,
            hasRoomId: !!roomId,
            hasFrom: !!from
          })
          return
        }

        console.log('✅ [Member] 통화 요청 수신됨 - 처리 시작', {
          from,
          fromName,
          roomId,
          callId: incomingCallId,
          callerPeerId
        })

        // 이미 다른 통화가 진행 중이면 무시
        if (callState !== 'idle' && callState !== 'receiving') {
          console.warn('⚠️ 이미 통화 중이므로 새로운 통화 요청 무시', { currentCallState: callState })
          return
        }

        // 🔊 수신자: 벨소리 시작
        console.log('🔔🔔🔔 벨소리 시작 직전')
        ringingTone.start().catch((e) => console.warn('벨소리 에러:', e))
        console.log('🔔🔔🔔 벨소리 시작 호출 완료')

        console.log('📞 [Member] incomingCall 상태 설정 시작')
        setIncomingCall({
          roomId,
          peerId: callerPeerId,
          from,
          fromName: fromName || '알 수 없음',
          callId: incomingCallId
        })
        console.log('📞 [Member] callState를 receiving으로 변경')
        setCallState('receiving')
        console.log('✅ [Member] 통화 요청 처리 완료 - 모달이 표시되어야 함')
      }

      // 통화 응답 신호 처리 (발신자가 상대방의 수락 신호를 받음)
      if (type === 'call-answer' && from !== user.id && to === user.id) {
        console.log('✅ [Caller] 통화 응답 수신됨 - 상대방이 수락함', {
          from,
          roomId,
          currentCallState: callState
        })
        
        // 🔊 발신자: 다이얼 톤 중지 + 연결 효과음 재생
        try { 
          stopAllCallSounds()
          playConnectedTone() 
        } catch (e) { 
          console.warn('통화 연결 효과음 재생 실패:', e)
        }
        
        // 이미 connected 상태면 상태 변경하지 않음
        // stream이 먼저 연결되어 connected가 된 경우
      }

      // 통화 종료 신호 처리
      if (type === 'call-ended' && from !== user.id && to === user.id) {
        // 🔊 상대방이 통화를 종료했을 때 종료음 재생
        try { 
          stopAllCallSounds()
          playEndTone() 
        } catch (e) {}
        // 상대방이 통화를 종료했으므로 내 쪽에서도 통화를 정리
        resetCallState()
      }

      // 통화 거절 신호 처리 (발신자가 거절당했을 때)
      if (type === 'call-rejected' && from !== user.id && to === user.id) {
        // 🔊 발신자: 상대방이 거절했을 때 다이얼 톤 중지 + 종료음 재생
        try { 
          stopAllCallSounds()
          playEndTone() 
        } catch (e) {}
        resetCallState()
      }
    })

    // LiveKit 통화 수락/거절 이벤트 처리 (다른 환경에서 처리됨)
    channelRef.current.on('broadcast', { event: 'livekit-call-answered' }, (payload: any) => {
      console.log('📞 [GlobalVoiceCall] LiveKit call answered on another device:', payload)
      const roomName = payload.payload?.roomName
      
      // 현재 수신 대기 중인 통화와 같은 통화면 수신 중지
      if (callStateRef.current === 'receiving') {
        console.log('📴 [GlobalVoiceCall] Stopping incoming call - answered elsewhere')
        stopAllCallSounds()
        setCallState('idle')
        setIncomingCall(null)
      }
    })

    channelRef.current.on('broadcast', { event: 'livekit-call-ended' }, (payload: any) => {
      console.log('📞 [GlobalVoiceCall] LiveKit call ended:', payload)
      
      // 현재 수신 대기 중인 통화면 수신 중지
      if (callStateRef.current === 'receiving') {
        console.log('📴 [GlobalVoiceCall] Stopping incoming call - ended/rejected')
        stopAllCallSounds()
        setCallState('idle')
        setIncomingCall(null)
      }
    })

    channelRef.current.subscribe((status) => {
      console.log(`📡 [VoiceCall] 내 채널 구독 상태: ${status}`, {
        channelName: myChannelName,
        userId: user.id,
        status
      })
      
      if (status === 'SUBSCRIBED') {
        console.log(`✅ [VoiceCall] 채널 구독 완료 - 통화 요청 수신 준비됨`)
      } else if (status === 'CHANNEL_ERROR') {
        console.error(`❌ [VoiceCall] 채널 구독 에러`)
      } else if (status === 'TIMED_OUT') {
        console.error(`❌ [VoiceCall] 채널 구독 타임아웃`)
      }
    })

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe()
        channelRef.current = null
      }
    }
  }, [user?.id])

  // 🔴 푸시 알림에서 오는 통화 수신 이벤트 처리
  useEffect(() => {
    const processIncomingCall = async (roomId: string, callerId: string, callerName: string) => {
      console.log('📞 [VoiceCall] 푸시 알림에서 통화 수신 처리:', { roomId, callerId, callerName, currentState: callStateRef.current })
      
      // 이미 통화 중이면 무시 (ref 사용으로 클로저 문제 해결)
      if (callStateRef.current !== 'idle') {
        console.log('📞 [VoiceCall] 이미 통화 중 - 푸시 통화 무시:', callStateRef.current)
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
          console.error('📞 [VoiceCall] 통화방 조회 실패:', roomError)
          return
        }
        
        // 이미 종료된 통화면 무시
        if (roomData.status !== 'waiting') {
          console.log('📞 [VoiceCall] 통화가 이미 종료됨:', roomData.status)
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
          console.log('📞 [VoiceCall] 벨소리 시작 (푸시 알림)')
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
        
        console.log('📞 [VoiceCall] 통화 수신 팝업 표시됨')
      } catch (error) {
        console.error('📞 [VoiceCall] 푸시 통화 처리 오류:', error)
      }
    }
    
    const handleIncomingCallFromPush = async (event: CustomEvent) => {
      const { roomId, callerId, callerName } = event.detail
      await processIncomingCall(roomId, callerId, callerName)
    }
    
    window.addEventListener('incoming-call-from-push', handleIncomingCallFromPush as unknown as EventListener)
    console.log('📞 [VoiceCall] 푸시 통화 이벤트 리스너 등록됨')
    
    // 🔴 마운트 시 pending call 확인 (콜드 스타트 대응)
    const checkPendingCall = async () => {
      try {
        const { getPendingCall, clearPendingCall } = await import('@/hooks/useInitialPermissions')
        const pending = getPendingCall()
        if (pending && pending.type === 'voice') {
          console.log('📞 [VoiceCall] Pending call 발견:', pending)
          clearPendingCall()
          await processIncomingCall(pending.roomId, pending.callerId, pending.callerName)
        }
      } catch (e) {
        console.warn('Pending call 확인 실패:', e)
      }
    }
    
    // 약간의 딜레이 후 pending call 확인 (컴포넌트 완전 마운트 후)
    const timer = setTimeout(checkPendingCall, 500)
    
    return () => {
      window.removeEventListener('incoming-call-from-push', handleIncomingCallFromPush as unknown as EventListener)
      clearTimeout(timer)
    }
  }, []) // ref 사용으로 의존성 제거

  // 페이지 언로드 시 통화 정리 및 새로고침 방지
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (callState !== 'idle') {
        // 새로고침/페이지 이동 방지
        e.preventDefault()
        e.returnValue = '통화 중입니다. 페이지를 나가시겠습니까?'
        return '통화 중입니다. 페이지를 나가시겠습니까?'
      }
    }

    const handleUnload = () => {
      // 실제 페이지를 떠날 때만 통화 종료
      if (callState !== 'idle') {
        endCall()
      }
    }

    // 모바일 특화: 페이지 숨김 감지
    const handlePageHide = () => {
      if (callState !== 'idle') {
        console.log('📱 [Mobile] 페이지가 숨겨짐 - 통화 종료 시도')
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

  // 브라우저 뒤로/앞으로 가기 방지 (통화 중일 때)
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (callState !== 'idle') {
        const confirmLeave = window.confirm('통화 중입니다. 페이지를 이동하시겠습니까?')
        if (!confirmLeave) {
          // 뒤로가기 취소 - 현재 위치로 다시 푸시
          const relativeUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
          try {
            window.history.pushState(null, '', relativeUrl)
          } catch (error) {
            console.warn('pushState failed:', error)
          }
        } else {
          // 통화 종료
          endCall()
        }
      }
    }

    if (callState !== 'idle') {
      // 현재 상태를 history에 푸시해서 뒤로가기 감지 가능하게 함
      const relativeUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
      try {
        window.history.pushState(null, '', relativeUrl)
      } catch (error) {
        console.warn('pushState failed:', error)
      }
      window.addEventListener('popstate', handlePopState)
    }

    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [callState])

  // 모바일 특화: 앱 백그라운드/포그라운드 관리
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (callState !== 'idle') {
        if (document.hidden) {
          console.log('📱 [Mobile] 앱이 백그라운드로 이동 - 통화 유지 중')
        } else {
          console.log('📱 [Mobile] 앱이 포그라운드로 복귀 - 통화 계속')
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [callState])

  // 모바일 특화: 화면 잠금 방지 (Wake Lock)
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

  // 백그라운드 통화 안정성: 연결 상태 모니터링
  useEffect(() => {
    const startConnectionMonitoring = () => {
      if (connectionHealthRef.current) {
        clearInterval(connectionHealthRef.current)
      }

      connectionHealthRef.current = window.setInterval(() => {
        if (peer && callState === 'connected') {
          const now = new Date()
          const timeSinceLastActivity = now.getTime() - lastActivityRef.current.getTime()
          const isPeerOpen = peer.open && !peer.destroyed

          console.log('📶 [Background] 연결 상태 체크:', {
            peerOpen: isPeerOpen,
            peerDestroyed: peer.destroyed,
            timeSinceActivity: Math.floor(timeSinceLastActivity / 1000) + 's',
            isHidden: document.hidden
          })

          // 30초 이상 비활성 상태이고 백그라운드에 있으면 연결 체크
          if (timeSinceLastActivity > 30000 && document.hidden) {
            if (!isPeerOpen || peer.destroyed) {
              console.warn('⚠️ [Background] 연결 끊어짐 감지 - 재연결 시도')
              // 재연결 로직은 여기에 추가 가능
            }
          }
        }
      }, 5000) // 5초마다 체크
    }

    const stopConnectionMonitoring = () => {
      if (connectionHealthRef.current) {
        clearInterval(connectionHealthRef.current)
        connectionHealthRef.current = null
      }
    }

    if (callState === 'connected') {
      startConnectionMonitoring()
    } else {
      stopConnectionMonitoring()
    }

    return () => {
      stopConnectionMonitoring()
    }
  }, [callState, peer])

  // 백그라운드 통화 안정성: 활동 추적
  useEffect(() => {
    const updateActivity = () => {
      lastActivityRef.current = new Date()
    }

    // 일반적인 사용자 활동 감지
    const activityEvents = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click']

    activityEvents.forEach(event => {
      document.addEventListener(event, updateActivity, { passive: true })
    })

    return () => {
      activityEvents.forEach(event => {
        document.removeEventListener(event, updateActivity)
      })
    }
  }, [])

  // 통화 시작
  const startCall = async (partnerId: string, partnerName: string, callId?: string) => {
    console.log('📞 [StartCall] 통화 시작 요청', {
      partnerId,
      partnerName,
      callId,
      userId: user?.id,
      currentCallState: callState
    })

    if (!user?.id) {
      console.error('❌ [StartCall] user가 없음')
      return
    }

    if (callState !== 'idle') {
      console.warn('⚠️ [StartCall] 통화 상태가 idle이 아님', { callState })
      return
    }

    try {
      console.log('📞 [StartCall] 1. 통화 상태를 calling으로 변경')
      setCallState('calling')
      
      // 🔊 발신자: 다이얼 톤 시작 (통화 실패해도 영향 없도록 try-catch)
      try { dialingTone.start() } catch (e) { /* 무시 */ }

      // API 및 룸 생성
      const deviceInfo = {
        os: navigator.platform,
        browser: navigator.userAgent.includes('Chrome')
          ? 'Chrome'
          : navigator.userAgent.includes('Firefox')
            ? 'Firefox'
            : 'Other',
      }

      const sessionCallId = callId || `call-${generateUUID()}`
      
      // 🚀 병렬 처리: API 호출과 마이크 스트림 획득을 동시에 실행
      console.log('📞 [StartCall] 2. 병렬 처리 시작 (API + 마이크)')
      const parallelStartTime = Date.now()

      const [response, stream] = await Promise.all([
        // 1. 통화방 생성 API
        Promise.race([
          edgeApi.voiceCall.startCall({
            partner_id: partnerId,
            partner_name: partnerName,
            call_id: sessionCallId,
            device_info: deviceInfo,
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('API 호출 타임아웃 (5초)')), 5000)
          )
        ]).then(result => {
          console.log('✅ [StartCall] API 완료')
          return result
        }).catch(err => {
          console.error('❌ [StartCall] API 실패:', err)
          throw err
        }),

        // 2. 마이크 스트림 획득 (오디오 품질 설정 포함)
        safeGetUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }, 
          video: false 
        }).then(s => {
          console.log('✅ [StartCall] 마이크 스트림 획득 완료')
          return s
        })
      ]) as [any, MediaStream]

      const parallelDuration = Date.now() - parallelStartTime
      console.log(`✅ [StartCall] 2. 병렬 처리 완료 (${parallelDuration}ms)`)

      // 양쪽에서 동시에 통화를 건 경우 - 기존 통화방 재사용
      if (response.data.reused) {
        console.log('🔄 [StartCall] 상대방이 이미 통화를 걸었습니다. 기존 통화방으로 연결:', {
          roomId: response.data.room_id,
          message: response.data.message
        })
        
        // 스트림 정리
        stream.getTracks().forEach(track => track.stop())
        setIsCallInProgress(false)
        setIsLoading(false)
        
        // 이미 incoming call이 오고 있을 것이므로, 그것을 처리하도록 유도
        // 또는 자동으로 응답
        if (incomingCall && incomingCall.roomId === response.data.room_id) {
          console.log('📞 [StartCall] 자동으로 상대방 통화에 응답합니다.')
          await answerCall()
        } else {
          // incoming call이 아직 안 왔으면 약간 대기 후 재확인
          await new Promise(r => setTimeout(r, 800))
          // 상태를 직접 확인하기 어려우므로 안내 메시지만 표시
          console.warn('⚠️ [StartCall] 상대방이 먼저 통화를 걸었습니다. 수신 알림을 확인해주세요.')
          alert('상대방이 이미 통화를 걸었습니다. 수신 알림을 확인해주세요.')
        }
        return
      }

      const room = response.data.room
      const localPeerId = buildPeerId(room.id, user.id)
      setCurrentRoom(room)

      localStreamRef.current = stream
      setLocalStream(stream)

      console.log('📞 [StartCall] 3. Peer 인스턴스 생성', { localPeerId })
      // Peer 준비
      const newPeer = createPeerInstance(localPeerId)
      peerRef.current = newPeer
      setPeer(newPeer)

      // Peer가 열리기 전에도 브로드캐스트 전송 (즉시 전송)
      console.log('📞 [StartCall] 5. 통화 요청 브로드캐스트 전송 시작 (즉시)', {
        targetUserId: partnerId,
        from: user.id,
        fromName: user.name || user.username,
        roomId: room.id,
        callId: sessionCallId,
      })
      
      // 브로드캐스트를 비동기로 전송 (Peer 열림을 기다리지 않음)
      Promise.resolve().then(async () => {
        const broadcastResult = await sendBroadcast(partnerId, 'call-signal', {
          type: 'call-request',
          from: user.id,
          fromName: user.name || user.username,
          to: partnerId,
          roomId: room.id,
          callId: sessionCallId,
        })
        
        console.log('📞 [StartCall] 5. 통화 요청 브로드캐스트 전송 결과:', {
          success: broadcastResult,
          partnerId,
          roomId: room.id
        })

        if (!broadcastResult) {
          console.error('❌ [StartCall] 브로드캐스트 전송 실패 - 통화 요청이 전달되지 않았습니다')
          // 브로드캐스트 실패 시 재시도 (최대 2회)
          for (let retry = 0; retry < 2; retry++) {
            await new Promise(r => setTimeout(r, 1000)) // 1초 대기
            const retryResult = await sendBroadcast(partnerId, 'call-signal', {
              type: 'call-request',
              from: user.id,
              fromName: user.name || user.username,
              to: partnerId,
              roomId: room.id,
              callId: sessionCallId,
            })
            if (retryResult) {
              console.log(`✅ [StartCall] 브로드캐스트 재시도 성공 (${retry + 1}회)`)
              break
            }
          }
        }
      }).catch((error) => {
        console.error('❌ [StartCall] 브로드캐스트 전송 중 예외 발생:', error)
      })

      newPeer.on('open', async () => {
        console.log('🔄 [Caller] Peer ready', { peerId: localPeerId })
      })

      newPeer.on('error', (error) => {
        console.error('❌ [StartCall] Peer 에러:', error)
      })

      console.log('📞 [StartCall] 6. ActiveCall 상태 설정')
      // ActiveCall 상태 설정
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
          console.warn('⏰ [StartCall] 60초 타임아웃 - 상대방 무응답')
          alert('상대방이 응답하지 않습니다.')
          endCall()
        }
      }, 60000) // 60초
      callingTimeoutRef.current = timeoutId

      console.log('✅ [StartCall] 통화 시작 완료 - 모든 단계 성공 (60초 타임아웃 설정됨)')
    } catch (error) {
      console.error('❌ [StartCall] 통화 시작 실패:', error)
      console.error('❌ [StartCall] 에러 상세:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
      resetCallState()
    }
  }

  // 채팅방 찾기 및 시스템 메시지 전송
  const sendCallStatusMessage = async (partnerId: string, messageType: 'accepted' | 'rejected' | 'ended', customMessage?: string) => {
    try {
      const message = customMessage || (
        messageType === 'accepted' ? '[CALL_ACCEPT:voice]' :
        messageType === 'rejected' ? '📞 통화를 거절했습니다.' :
        '[CALL_END:voice:0]'
      )

      console.log('📤 [sendCallStatusMessage] 채팅 메시지 전송 시작', {
        partnerId,
        messageType,
        message
      })

      const messageStartTime = Date.now()
      const result = await Promise.race([
        edgeApi.members.sendChatMessage({
          receiver_id: partnerId,
          message: message
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('채팅 메시지 전송 타임아웃 (10초)')), 10000)
        )
      ]) as any

      const messageDuration = Date.now() - messageStartTime
      console.log(`✅ [sendCallStatusMessage] 채팅 메시지 전송 완료 (${messageDuration}ms)`, {
        result: result?.data,
        success: result?.success
      })
    } catch (error) {
      console.error('❌ [sendCallStatusMessage] 채팅 메시지 전송 실패:', {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        partnerId,
        messageType
      })
      throw error // 에러를 다시 throw하여 호출자가 처리할 수 있도록
    }
  }

  // 통화 응답
  const answerCall = async () => {
    if (!incomingCall || !user?.id) {
      console.error('❌ [AnswerCall] incomingCall 또는 user가 없음', { incomingCall, userId: user?.id })
      return
    }

    console.log('📞 [AnswerCall] 통화 응답 시작', {
      from: incomingCall.from,
      fromName: incomingCall.fromName,
      roomId: incomingCall.roomId,
      callId: incomingCall.callId
    })

    try {
      // 채팅 메시지 전송을 비동기로 처리하여 통화 시작을 막지 않음
      console.log('📞 [AnswerCall] 1. 채팅 메시지 전송 시작 (비동기)')
      Promise.resolve().then(async () => {
        try {
          await sendCallStatusMessage(incomingCall.from, 'accepted')
          console.log('✅ [AnswerCall] 1. 채팅 메시지 전송 완료')
        } catch (messageError) {
          console.error('❌ [AnswerCall] 1. 채팅 메시지 전송 실패 (무시됨):', messageError)
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
      const callerPeerId =
        incomingCall.peerId || buildPeerId(incomingCall.roomId, incomingCall.from)

      // 🚀 병렬 처리: API 호출, 마이크 스트림, Peer 생성을 동시에 실행
      console.log('📞 [AnswerCall] 2. 병렬 처리 시작 (API + 마이크 + Peer)')
      const parallelStartTime = Date.now()

      // 🚀 API는 백그라운드에서 처리 (기다리지 않음)
      edgeApi.voiceCall.joinCall({
        room_id: incomingCall.roomId,
        device_info: deviceInfo,
      }).then(() => {
        console.log('✅ [AnswerCall] API 완료 (백그라운드)')
      }).catch(err => {
        console.error('❌ [AnswerCall] API 실패 (무시):', err)
      })

      // 🚀 마이크 스트림 + Peer 연결만 병렬 처리 (API 기다리지 않음)
      const [stream, newPeer] = await Promise.all([
        // 1. 마이크 스트림 획득 (오디오 품질 설정 포함)
        safeGetUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }, 
          video: false 
        }).then(s => {
          console.log('✅ [AnswerCall] 마이크 스트림 획득 완료')
          return s
        }),

        // 2. Peer 인스턴스 생성 + 서버 연결 대기
        createPeerInstanceAsync(localPeerId).then(p => {
          console.log('✅ [AnswerCall] Peer 인스턴스 생성 및 연결 완료')
          return p
        })
      ]) as [MediaStream, Peer]

      const parallelDuration = Date.now() - parallelStartTime
      console.log(`✅ [AnswerCall] 2. 병렬 처리 완료 (${parallelDuration}ms)`)

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
          attachMediaConnectionHandlers(mediaCall)
          setCallState('connected')
          startDurationTracking()
        } else {
          console.error('❌ [Receiver] 스트림이 없어 call에 answer할 수 없음')
        }
      })

      // Peer가 이미 연결되었으므로 바로 실행 (createPeerInstanceAsync에서 open 대기 완료)
      console.log('🔄 [Receiver] Peer already ready', { peerId: localPeerId, callerPeerId })

      // 발신측에게 call 시도
      console.log('📞 [AnswerCall] 5. 발신측에게 call 시도', { callerPeerId })
      const mediaCall = newPeer.call(callerPeerId, stream)
      if (mediaCall) {
        console.log('✅ [AnswerCall] 5. 미디어 연결 생성 완료')
        attachMediaConnectionHandlers(mediaCall)
      } else {
        console.warn('⚠️ [AnswerCall] 5. 미디어 연결 생성 실패 - 발신측의 call을 기다림')
      }

      // 통화 응답 신호 전송
      console.log('📞 [AnswerCall] 6. 통화 응답 신호 전송 시작')
      sendBroadcast(incomingCall.from, 'call-signal', {
        type: 'call-answer',
        from: user.id,
        fromName: user.name || user.username,
        to: incomingCall.from,
        roomId: incomingCall.roomId,
        callId: incomingCall.callId,
      }).then(() => {
        console.log('✅ [AnswerCall] 6. 통화 응답 신호 전송 완료')
      }).catch(err => {
        console.error('❌ [AnswerCall] 6. 통화 응답 신호 전송 실패:', err)
      })

      console.log('📞 [AnswerCall] 7. 통화 상태 설정')
      setActiveCall({
        partnerId: incomingCall.from,
        partnerName: incomingCall.fromName,
        callId: incomingCall.callId,
        roomId: incomingCall.roomId,
        startedAt: new Date(),
        duration: 0,
      })

      // 🔊 수신자: 통화 응답 시 벨소리 중지
      try { ringingTone.stop() } catch (e) { /* 무시 */ }

      setCallState('calling')
      setIncomingCall(null)
      
      // 타이머 트래킹 즉시 시작 (스트림 연결 전에도 표시)
      startDurationTracking()

      console.log('✅ [AnswerCall] 통화 응답 완료 - 모든 단계 성공')

    } catch (error) {
      console.error('❌ [AnswerCall] 통화 응답 실패:', error)
      console.error('❌ [AnswerCall] 에러 상세:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      })
      resetCallState()
    }
  }

  // 통화 거절
  const rejectCall = async () => {
    if (!incomingCall) return

    try {
      // 통화 거절 메시지 전송
      await sendCallStatusMessage(incomingCall.from, 'rejected')
    } catch (error) {
      console.error('Failed to send reject message:', error)
    }

    // 거절 신호 전송
    await sendBroadcast(incomingCall.from, 'call-signal', {
      type: 'call-rejected',
      from: user?.id,
      to: incomingCall.from,
      roomId: incomingCall.roomId
    })

    setIncomingCall(null)
    setCallState('idle')
    
    // 🔊 수신자: 통화 거절 시 벨소리 중지
    try { ringingTone.stop() } catch (e) {}
  }

  // 통화 종료
  const endCall = async () => {
    // 🔊 통화 종료: 모든 알림음 중지 + 종료음 재생
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
              console.error('Failed to end call via API:', error)
            })
          }

          // 통화 종료 신호 전송
          if (partnerId) {
            try {
              const sent = await sendBroadcast(partnerId, 'call-signal', {
                type: 'call-ended',
                from: user?.id,
                to: partnerId,
                roomId: roomId
              })

              // 통화 종료 신호 전송 성공 시 채팅 메시지도 전송
              if (sent) {
                const message = `[CALL_END:voice:${durationSeconds}]`
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

  // 스피커폰 토글
  const toggleSpeaker = async () => {
    if (!remoteAudioRef.current) return

    const newSpeakerState = !isSpeakerOn
    setIsSpeakerOn(newSpeakerState)

    try {
      const audioElement = remoteAudioRef.current

      // ✅ AudioToggle 플러그인 사용 (네이티브 + 웹 폴백)
      try {
        if (newSpeakerState) {
          await AudioToggle.setSpeakerOn()
          console.log('📱 스피커폰 모드 활성화')
        } else {
          await AudioToggle.setEarpieceOn()
          console.log('📱 이어피스 모드 활성화')
        }
      } catch (e) {
        console.warn('AudioToggle 플러그인 호출 실패:', e)
      }

      // Web API: setSinkId가 지원되는 경우 (Chrome, Edge 등)
      if ('setSinkId' in audioElement && typeof (audioElement as any).setSinkId === 'function' && navigator.mediaDevices?.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const audioOutputs = devices.filter(device => device.kind === 'audiooutput')
        
        if (audioOutputs.length > 1) {
          // 스피커폰: 기본 스피커 (보통 첫 번째)
          // 귀대고: 이어피스 (있으면, 없으면 기본)
          const targetDevice = newSpeakerState 
            ? audioOutputs.find(d => d.label.toLowerCase().includes('speaker')) || audioOutputs[0]
            : audioOutputs.find(d => d.label.toLowerCase().includes('earpiece') || d.label.toLowerCase().includes('phone')) || audioOutputs[0]
          
          if (targetDevice) {
            await (audioElement as any).setSinkId(targetDevice.deviceId)
            console.log(`🔊 오디오 출력 변경: ${targetDevice.label}`)
          }
        }
      }

      // 볼륨 조절 방식
      // 스피커폰: 최대 볼륨, 귀대고: 중간 볼륨 (0.3은 너무 낮음)
      const targetVolume = newSpeakerState ? 1.0 : 0.6
      audioElement.volume = targetVolume
      
      // 볼륨 적용 확인 로그
      console.log(`🔊 스피커폰: ${newSpeakerState ? 'ON' : 'OFF'}, 볼륨: ${targetVolume}, 실제 볼륨: ${audioElement.volume}`)
    } catch (error) {
      console.warn('스피커폰 전환 실패:', error)
    }
  }

  // LiveKit 통화용 - PeerJS 상태만 리셋 (상대방에게 신호 안 보냄)
  const clearForLiveKit = () => {
    console.log('🔄 [VoiceCall] Clearing state for LiveKit call')
    try { stopAllCallSounds() } catch (e) { /* 무시 */ }
    setCallState('idle')
    setIncomingCall(null)
    setActiveCall(null)
  }

  const value: GlobalVoiceCallContextType = {
    callState,
    activeCall,
    incomingCall,
    localStream,
    remoteStream,
    startCall,
    answerCall,
    rejectCall,
    endCall,
    clearForLiveKit,
    isMuted,
    toggleMute,
    isSpeakerOn,
    toggleSpeaker,
    formatDuration,
    navigateToChat,
  }

  return (
    <GlobalVoiceCallContext.Provider value={value}>
      {children}
    </GlobalVoiceCallContext.Provider>
  )
}

export function useGlobalVoiceCall() {
  const context = useContext(GlobalVoiceCallContext)
  if (!context) {
    throw new Error('useGlobalVoiceCall must be used within GlobalVoiceCallProvider')
  }
  return context
}
