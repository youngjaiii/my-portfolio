/**
 * VoiceRoomProvider - 다인원 보이스 채팅 PeerJS 연결 관리
 *
 * 기능:
 * - 다인원 Mesh 연결 (각 참여자가 서로 연결)
 * - 마이크 on/off 제어
 * - 원격 오디오 스트림 관리
 * - 말하는 사람 표시 (음성 레벨 감지)
 */

import { useAuth } from '@/hooks/useAuth'
import { useUnifiedStreamChannel } from '@/hooks/useUnifiedStreamChannel'
import { supabase } from '@/lib/supabase'
import { safeGetUserMedia } from '@/lib/utils'
import { AudioContextManager } from '@/utils/AudioContextManager'
import { resumeAudioContext } from '@/utils/audioUtils'
import { generateTurnCredentials } from '@/utils/turnAuth'
import type { MediaConnection, PeerJSOption } from 'peerjs'
import Peer from 'peerjs'
import type { ReactNode } from 'react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'

// ========== 타입 정의 ==========

interface PeerConnection {
  peerId: string
  memberId: string
  connection: MediaConnection
  stream: MediaStream | null
  isSpeaking: boolean
  isMuted: boolean
  // 음성 레벨 감지용
  audioContext?: AudioContext
  analyser?: AnalyserNode
  animationFrameId?: number
}

interface VoiceRoomContextType {
  // 연결 상태
  isConnected: boolean
  isConnecting: boolean
  isAutoReconnecting: boolean // 자동 재연결 진행 중 여부
  error: string | null
  currentRoomId: string | null // 현재 연결된 방 ID
  isListenerMode: boolean // 청취자 모드 여부

  // 로컬 상태
  localStream: MediaStream | null
  isMuted: boolean
  isSpeaking: boolean
  isForceMuted: boolean // 호스트에 의해 강제 뮤트됨

  // 원격 피어 상태
  peers: Map<string, PeerConnection>

  // 액션
  connect: (
    roomId: string,
    memberId: string,
    listenerOnly?: boolean,
    force?: boolean,
  ) => Promise<void>
  disconnect: (keepSession?: boolean) => void // keepSession: 세션 유지 여부 (발언자 전환 시 사용)
  toggleMute: () => void
  stopMicrophone: () => void // 마이크 강제 종료
  applyForceMute: () => void // 강제 뮤트 적용
  clearForceMute: () => void // 강제 뮤트 해제

  // 유틸
  getSpeakingPeers: () => Array<string>
}

const VoiceRoomContext = createContext<VoiceRoomContextType | null>(null)

// ========== 세션 저장 (새로고침 시 자동 재연결용) ==========
const VOICE_ROOM_SESSION_KEY = 'voice-room-session'

interface VoiceRoomSession {
  roomId: string
  memberId: string
  isListenerOnly: boolean
  timestamp: number
}

function saveSession(session: VoiceRoomSession) {
  try {
    localStorage.setItem(VOICE_ROOM_SESSION_KEY, JSON.stringify(session))
  } catch {
    // 저장 실패 무시
  }
}

function loadSession(): VoiceRoomSession | null {
  try {
    const data = localStorage.getItem(VOICE_ROOM_SESSION_KEY)
    if (!data) return null

    const session = JSON.parse(data) as VoiceRoomSession

    // 1시간 이상 지난 세션은 무효
    if (Date.now() - session.timestamp > 60 * 60 * 1000) {
      clearSession()
      return null
    }

    return session
  } catch (e) {
    console.warn('세션 로드 실패:', e)
    return null
  }
}

function clearSession() {
  try {
    localStorage.removeItem(VOICE_ROOM_SESSION_KEY)
  } catch (e) {
    // 무시
  }
}

// ========== PeerJS 설정 ==========

// 모바일 감지
const isMobileDevice = (): boolean => {
  const ua = navigator.userAgent.toLowerCase()
  return /android|iphone|ipad|ipod|mobile/i.test(ua)
}

// iOS 감지
const isIOSDevice = (): boolean => {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent.toLowerCase()
  return /iphone|ipad|ipod/i.test(ua) && !(window as any).MSStream
}

// iOS에서 사용자 제스처 대기 (getUserMedia 호출 전 필수)
const waitForUserGesture = (): Promise<void> => {
  return new Promise((resolve) => {
    // 이미 사용자 제스처가 있었는지 확인 (최근 1초 이내)
    const lastGestureTime = (window as any).__lastUserGestureTime || 0
    const timeSinceLastGesture = Date.now() - lastGestureTime
    
    if (timeSinceLastGesture < 1000) {
      // 최근 1초 이내에 제스처가 있었으면 즉시 진행
      resolve()
      return
    }
    
    // 사용자 제스처 이벤트 핸들러
    const handleGesture = () => {
      (window as any).__lastUserGestureTime = Date.now()
      cleanup()
      resolve()
    }
    
    const cleanup = () => {
      window.removeEventListener('touchstart', handleGesture)
      window.removeEventListener('click', handleGesture)
      window.removeEventListener('touchend', handleGesture)
    }
    
    // 제스처 이벤트 리스너 등록
    window.addEventListener('touchstart', handleGesture, { once: true, passive: true })
    window.addEventListener('click', handleGesture, { once: true, passive: true })
    window.addEventListener('touchend', handleGesture, { once: true, passive: true })
    
    // 최대 5초 대기 후 타임아웃
    setTimeout(() => {
      cleanup()
      console.warn('⚠️ [VoiceRoom] iOS 사용자 제스처 대기 타임아웃 - 연결 시도')
      resolve() // 타임아웃되어도 연결 시도
    }, 5000)
  })
}

function getPeerOptions(): PeerJSOption {
  // 통화 기능(useCallRoom.ts)과 동일한 TURN 인증 방식 사용
  const { username, credential } = generateTurnCredentials(
    import.meta.env.VITE_TURN_SECRET_KEY || 'default-secret-key',
  )

  // 통화 기능과 동일한 ICE 서버 설정 (통화가 잘 되므로 동일하게 적용)
  return {
    host: 'peer01.mateyou.me',
    port: 443,
    secure: true,
    path: '/myapp',
    key: import.meta.env.VITE_PEERJS_API_KEY || 'mateyou-prod',
    debug: 2, // 통화와 동일
    config: {
      iceServers: [
        // ✅ TURN TLS (5349) — Android/iOS PWA 최우선 (안정성)
        {
          urls: 'turns:peer01.mateyou.me:5349?transport=tcp',
          username,
          credential,
        },
        // ✅ TURN UDP (빠른 속도)
        {
          urls: 'turn:peer01.mateyou.me:3478?transport=udp',
          username,
          credential,
        },
        // ✅ TURN TCP (방화벽/공공 Wi-Fi Fallback)
        {
          urls: 'turn:peer01.mateyou.me:3478?transport=tcp',
          username,
          credential,
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
}

// ========== Provider 컴포넌트 ==========

interface VoiceRoomProviderProps {
  children: ReactNode
}

export function VoiceRoomProvider({ children }: VoiceRoomProviderProps) {
  const { user } = useAuth()

  // Peer 상태
  const [_peer, setPeer] = useState<Peer | null>(null)
  const peerRef = useRef<Peer | null>(null)

  // 연결 상태
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isAutoReconnecting, setIsAutoReconnecting] = useState(false) // 자동 재연결 진행 중
  const [error, setError] = useState<string | null>(null)

  // 로컬 미디어
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const [isMuted, setIsMuted] = useState(true) // 기본값: 음소거 (마이크 수동 활성화 필요)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isForceMuted, setIsForceMuted] = useState(false) // 호스트에 의해 강제 뮤트됨

  // 원격 피어
  const [peers, setPeers] = useState<Map<string, PeerConnection>>(new Map())
  const peersRef = useRef<Map<string, PeerConnection>>(new Map())
  const peerRetryCountRef = useRef<Map<string, number>>(new Map()) // 재시도 횟수 추적

  // ✅ 피어별 오디오 엘리먼트 관리 (audioUtils.ts 수정 없이 다중 피어 지원)
  // iOS 호환성을 위해 video 엘리먼트 사용 (VideoRoomProvider와 통일)
  const peerAudioElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map())

  // 방 정보
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null)
  const currentRoomIdRef = useRef<string | null>(null)
  const [isListenerMode, setIsListenerMode] = useState(false)
  const isListenerModeRef = useRef(false)
  const authTokenRef = useRef<string | null>(null) // 인증 토큰 저장용

  // 통합 채널 (통합 스트림 Realtime 채널)
  // currentRoomId가 설정되기 전에도 채널을 준비하기 위해 항상 활성화
  const unifiedChannel = useUnifiedStreamChannel(currentRoomId ?? undefined, {
    enabled: true, // 항상 활성화 (roomId가 없으면 내부에서 처리)
    enablePresence: true,
    onPresenceSync: (presences) => {
      // Presence 동기화는 기존 로직과 통합
      if (!currentRoomIdRef.current) return
      const roomId = currentRoomIdRef.current
      const memberId = user?.id
      if (!memberId) return

      Object.entries(presences).forEach(([_key, presencesList]) => {
        const presence = (presencesList as any[])[0]
        if (presence && presence.peerId && presence.memberId !== memberId) {
          if (!peersRef.current.has(presence.peerId)) {
            setTimeout(() => {
              if (
                currentRoomIdRef.current === roomId &&
                !peersRef.current.has(presence.peerId)
              ) {
                connectToPeer(presence.peerId)
              }
            }, 500)
          }
        }
      })
    },
  })

  // 통합 채널을 ref로 저장 (콜백 함수에서 접근용)
  const unifiedChannelRef = useRef(unifiedChannel)
  useEffect(() => {
    unifiedChannelRef.current = unifiedChannel
  }, [unifiedChannel])

  // connectToPeer를 ref로 저장 (통합 채널 이벤트 핸들러에서 사용)
  const connectToPeerRef = useRef<((targetPeerId: string) => void) | null>(null)

  // 통합 채널 이벤트 핸들러 등록
  useEffect(() => {
    if (!unifiedChannel.isConnected || !currentRoomId) return

    // peer:join 이벤트
    const handlePeerJoin = (data: {
      peerId: string
      memberId: string
      isHost?: boolean
      isMuted?: boolean
      isVideoOff?: boolean
    }) => {
      const { peerId, memberId: newMemberId } = data
      const currentMemberId = user?.id
      if (
        peerId &&
        newMemberId !== currentMemberId &&
        !peersRef.current.has(peerId)
      ) {
        setTimeout(() => {
          if (
            currentRoomIdRef.current === currentRoomId &&
            !peersRef.current.has(peerId)
          ) {
            connectToPeerRef.current?.(peerId)
          }
        }, 1000)
      }
    }

    // peer:leave 이벤트
    const handlePeerLeave = async (data: {
      peerId: string
      memberId: string
    }) => {
      const { peerId, memberId: leftMemberId } = data
      const peerConn = peersRef.current.get(peerId)
      if (peerConn) {
        stopRemoteVoiceDetection(peerId)
        peerConn.connection.close()
        // ✅ 명시적 오디오 정리 (이벤트 누락 방지)
        stopPeerAudio(peerId)
      }

      peersRef.current.delete(peerId)
      peerRetryCountRef.current.delete(peerId)
      setPeers(new Map(peersRef.current))

      // stream_hosts 테이블에서 해당 멤버의 발언자 기록 업데이트
      if (leftMemberId && currentRoomId) {
        const { error } = await (supabase.from('stream_hosts') as any)
          .update({ left_at: new Date().toISOString() })
          .eq('room_id', currentRoomId)
          .eq('member_id', leftMemberId)
          .is('left_at', null)

        if (error) {
          console.error('❌ [VoiceRoom] 발언자 퇴장 처리 실패:', error)
        }
      }
    }

    // peer:mute-status 이벤트
    const handleMuteStatus = (data: {
      peerId: string
      memberId: string
      isMuted: boolean
    }) => {
      const { peerId, isMuted: peerMuted } = data
      const peer = peersRef.current.get(peerId)
      if (peer) {
        peer.isMuted = peerMuted
        peersRef.current.set(peerId, peer)
        setPeers(new Map(peersRef.current))
      }
    }

    unifiedChannel.on('peer:join', handlePeerJoin)
    unifiedChannel.on('peer:leave', handlePeerLeave)
    unifiedChannel.on('peer:mute-status', handleMuteStatus)

    return () => {
      unifiedChannel.off('peer:join', handlePeerJoin)
      unifiedChannel.off('peer:leave', handlePeerLeave)
      unifiedChannel.off('peer:mute-status', handleMuteStatus)
    }
  }, [unifiedChannel.isConnected, currentRoomId, user?.id, unifiedChannel])

  // 무음 스트림 여부 추적 (마이크 활성화 필요 여부 판단용)
  const isSilentStreamRef = useRef(false)

  // ========== 피어별 오디오 재생 (다중 피어 지원) ==========
  // 오디오 재생 중복 호출 방지
  const playAudioPendingRef = useRef<Set<string>>(new Set())

  const playPeerAudio = useCallback(
    async (peerId: string, stream: MediaStream) => {
      // 이미 재생 처리 중인 경우 스킵
      if (playAudioPendingRef.current.has(peerId)) {
        return
      }

      playAudioPendingRef.current.add(peerId)

      try {
        const audioTracks = stream.getAudioTracks()

        if (audioTracks.length === 0) {
          return
        }

        // 기존 오디오 엘리먼트 정리
        const existingAudio = peerAudioElementsRef.current.get(peerId)
        if (existingAudio) {
          // 스트림이 같으면 스킵
          if (existingAudio.srcObject === stream) {
            return
          }
          try {
            existingAudio.pause()
          } catch {}
          existingAudio.srcObject = null
          existingAudio.remove()
          peerAudioElementsRef.current.delete(peerId)
          // 잠시 대기하여 이전 play() 요청이 완료되도록
          await new Promise((resolve) => setTimeout(resolve, 50))
        }

        await resumeAudioContext()
        
        // iOS에서 추가 대기 시간 (AudioContext 안정화)
        if (isIOSDevice()) {
          await new Promise((resolve) => setTimeout(resolve, 100))
          // iOS에서 AudioContext가 suspended 상태면 resume 시도
          const audioContext = AudioContextManager.getInstance()
          if (audioContext.state === 'suspended') {
            try {
              await audioContext.resume()
              console.log('✅ [VoiceRoom] iOS AudioContext resumed for peer audio')
            } catch (e) {
              console.warn('⚠️ [VoiceRoom] iOS AudioContext resume 실패:', e)
            }
          }
        }

        // 오디오 엘리먼트 생성 (iOS 호환성을 위해 video 사용)
        const audio = document.createElement('video')
        audio.id = `peer-audio-${peerId.slice(0, 20)}`
        audio.autoplay = true
        audio.setAttribute('playsinline', 'true')
        audio.setAttribute('webkit-playsinline', 'true')
        audio.muted = false
        audio.volume = 1.0
        // 화면에 보이지 않게 처리
        audio.style.cssText =
          'position:absolute;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;'

        document.body.appendChild(audio)
        audio.srcObject = stream
        peerAudioElementsRef.current.set(peerId, audio)

        try {
          await audio.play()
          if (isIOSDevice()) {
            console.log('✅ [VoiceRoom] iOS peer audio 재생 성공:', peerId.slice(0, 20))
          }
        } catch (err: any) {
          // AbortError는 무시 (다른 play 요청에 의해 중단된 것)
          if (err?.name === 'AbortError') {
            return
          }

          // iOS에서 더 자세한 에러 로깅
          if (isIOSDevice()) {
            console.warn('⚠️ [VoiceRoom] iOS 오디오 재생 실패, 사용자 제스처 대기:', err)
          }

          const handler = async () => {
            try {
              await resumeAudioContext()
              // iOS에서 AudioContext 재확인
              if (isIOSDevice()) {
                const audioContext = AudioContextManager.getInstance()
                if (audioContext.state === 'suspended') {
                  await audioContext.resume()
                }
              }
              const currentAudio = peerAudioElementsRef.current.get(peerId)
              if (currentAudio && currentAudio.paused) {
                await currentAudio.play()
                if (isIOSDevice()) {
                  console.log('✅ [VoiceRoom] iOS 오디오 재생 성공 (사용자 제스처 후)')
                }
              }
            } catch (error) {
              console.error('❌ [VoiceRoom] 오디오 재생 실패:', error)
            }
            window.removeEventListener('touchstart', handler)
            window.removeEventListener('click', handler)
          }
          window.addEventListener('touchstart', handler, { once: true })
          window.addEventListener('click', handler, { once: true })
        }

        audio.onerror = (e) => console.error('❌ [VoiceRoom] 오디오 에러:', e)
      } finally {
        playAudioPendingRef.current.delete(peerId)
      }
    },
    [],
  )

  const stopPeerAudio = useCallback((peerId: string) => {
    const audio = peerAudioElementsRef.current.get(peerId)
    if (audio) {
      audio.pause()
      audio.srcObject = null
      audio.remove()
      peerAudioElementsRef.current.delete(peerId)
    }
  }, [])

  const stopAllPeerAudio = useCallback(() => {
    peerAudioElementsRef.current.forEach((audio) => {
      audio.pause()
      audio.srcObject = null
      audio.remove()
    })
    peerAudioElementsRef.current.clear()
  }, [])

  // 음성 레벨 분석기
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  // KeepAlive & TURN 갱신 타이머 (통화 기능에서 가져옴)
  const keepAliveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const turnRefreshTimerRef = useRef<NodeJS.Timeout | null>(null)

  // PeerId 생성 (타임스탬프 + 랜덤값으로 새로고침 시 중복 방지)
  const sessionIdRef = useRef(
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
  )
  const buildPeerId = (roomId: string, memberId: string) =>
    `stream-${roomId}-${memberId}-${sessionIdRef.current}`

  // peerId에서 memberId 추출 (UUID 패턴 매칭)
  const extractMemberIdFromPeerId = (peerId: string): string | null => {
    // UUID 정규식: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    const uuidRegex =
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
    const uuids = peerId.match(uuidRegex)
    // peerId 형식: stream-{roomId}-{memberId}-{sessionId}
    // 첫 번째 UUID = roomId, 두 번째 UUID = memberId
    return uuids && uuids.length >= 2 ? uuids[1] : null
  }

  // ========== KeepAlive & TURN 갱신 (통화 기능에서 가져옴) ==========

  // PeerJS 연결 유지 (20초마다 ping - 끊김 방지)
  const startKeepAlive = useCallback((peerInstance: Peer) => {
    stopKeepAlive() // 기존 타이머 정리

    keepAliveTimerRef.current = setInterval(() => {
      try {
        // PeerJS socket이 열려있는지 확인
        const peerSocket = peerInstance.socket as any
        if (peerInstance && peerSocket && peerSocket._wsOpen?.()) {
          peerSocket.send({ type: 'ping' })
        }
      } catch {
        // ping 실패는 무시
      }
    }, 20000) // 20초
  }, [])

  const stopKeepAlive = useCallback(() => {
    if (keepAliveTimerRef.current) {
      clearInterval(keepAliveTimerRef.current)
      keepAliveTimerRef.current = null
    }
  }, [])

  // TURN 인증 자동 갱신 (1시간마다)
  const startTurnRefresh = useCallback((peerInstance: Peer) => {
    stopTurnRefresh() // 기존 타이머 정리

    turnRefreshTimerRef.current = setInterval(() => {
      try {
        const { username: newUsername, credential: newCredential } =
          generateTurnCredentials(
            import.meta.env.VITE_TURN_SECRET_KEY || 'default-secret-key',
          )

        // PeerJS 내부 config 업데이트
        const config = (peerInstance as any)._options?.config
        if (config && config.iceServers) {
          config.iceServers.forEach((server: RTCIceServer) => {
            if (
              server.urls &&
              typeof server.urls === 'string' &&
              server.urls.includes('turn')
            ) {
              server.username = newUsername
              server.credential = newCredential
            }
          })
        }
      } catch (error) {
        console.warn('⚠️ [VoiceRoom] TURN 인증 갱신 실패:', error)
      }
    }, 3600 * 1000) // 1시간
  }, [])

  const stopTurnRefresh = useCallback(() => {
    if (turnRefreshTimerRef.current) {
      clearInterval(turnRefreshTimerRef.current)
      turnRefreshTimerRef.current = null
    }
  }, [])

  // ========== 음성 레벨 감지 ==========
  const startVoiceDetection = useCallback((stream: MediaStream) => {
    try {
      // AudioContext 싱글톤 사용 (메모리 누수 방지)
      audioContextRef.current = AudioContextManager.getInstance()
      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 256

      const source = audioContextRef.current.createMediaStreamSource(stream)
      source.connect(analyserRef.current)

      const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)

      const checkLevel = () => {
        if (!analyserRef.current) return

        analyserRef.current.getByteFrequencyData(dataArray)
        const average = dataArray.reduce((a, b) => a + b) / dataArray.length

        // 평균 레벨이 20 이상이면 말하는 중으로 판단
        setIsSpeaking(average > 20)

        animationFrameRef.current = requestAnimationFrame(checkLevel)
      }

      checkLevel()
    } catch (err) {
      console.warn('음성 레벨 감지 초기화 실패:', err)
    }
  }, [])

  const stopVoiceDetection = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    // AudioContext는 싱글톤이므로 close하지 않고 참조만 해제
    audioContextRef.current = null
    analyserRef.current = null
  }, [])

  // ========== 원격 피어 음성 레벨 감지 ==========
  const startRemoteVoiceDetection = useCallback(
    (peerId: string, stream: MediaStream) => {
      try {
        // AudioContext 싱글톤 사용 (메모리 누수 방지)
        const audioContext = AudioContextManager.getInstance()
        const analyser = audioContext.createAnalyser()
        analyser.fftSize = 256

        const source = audioContext.createMediaStreamSource(stream)
        source.connect(analyser)

        const dataArray = new Uint8Array(analyser.frequencyBinCount)

        const checkLevel = () => {
          const peer = peersRef.current.get(peerId)
          if (!peer || !peer.stream) {
            // 피어가 없으면 정리
            cancelAnimationFrame(peer?.animationFrameId || 0)
            audioContext.close()
            return
          }

          analyser.getByteFrequencyData(dataArray)
          const average = dataArray.reduce((a, b) => a + b) / dataArray.length
          const isSpeaking = average > 15 // 임계값

          // 발언 상태가 변경되었을 때만 업데이트
          if (peer.isSpeaking !== isSpeaking) {
            peer.isSpeaking = isSpeaking
            peersRef.current.set(peerId, peer)
            setPeers(new Map(peersRef.current))
          }

          peer.animationFrameId = requestAnimationFrame(checkLevel)
        }

        // 피어 정보에 오디오 컨텍스트 저장
        const peer = peersRef.current.get(peerId)
        if (peer) {
          peer.audioContext = audioContext
          peer.analyser = analyser
          peersRef.current.set(peerId, peer)
        }

        checkLevel()
      } catch (err) {
        console.warn('원격 피어 음성 레벨 감지 초기화 실패:', err)
      }
    },
    [],
  )

  const stopRemoteVoiceDetection = useCallback((peerId: string) => {
    const peer = peersRef.current.get(peerId)
    if (peer) {
      if (peer.animationFrameId) {
        cancelAnimationFrame(peer.animationFrameId)
      }
      // AudioContext는 싱글톤이므로 close하지 않음
      peer.audioContext = undefined
      peer.analyser = undefined
    }
  }, [])

  // ========== 무음 스트림 생성 (청취자용) ==========
  const createSilentStream = useCallback((): MediaStream => {
    // AudioContext 싱글톤 사용 (메모리 누수 방지)
    const audioContext = AudioContextManager.getInstance()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()

    // 완전히 무음으로 설정
    gainNode.gain.value = 0
    oscillator.connect(gainNode)

    const destination = audioContext.createMediaStreamDestination()
    gainNode.connect(destination)
    oscillator.start()

    return destination.stream
  }, [])

  // ========== 원격 피어 연결 처리 ==========
  const handleIncomingCall = useCallback(
    (call: MediaConnection) => {
      // Peer 상태 확인
      if (
        !peerRef.current ||
        peerRef.current.destroyed ||
        peerRef.current.disconnected
      ) {
        return
      }

      // 청취자 모드면 무음 스트림으로 응답, 아니면 로컬 스트림으로 응답
      let answerStream: MediaStream

      if (isListenerModeRef.current) {
        answerStream = createSilentStream()
      } else if (localStreamRef.current) {
        answerStream = localStreamRef.current
      } else {
        return
      }

      call.answer(answerStream)

      // ICE 연결 실패 시에만 에러 로그
      const pc = call.peerConnection
      if (pc) {
        pc.oniceconnectionstatechange = () => {
          if (pc.iceConnectionState === 'failed') {
            console.error('❌ ICE 연결 실패:', call.peer.slice(0, 30))
          }
        }
      }

      call.on('stream', (remoteStream) => {
        const audioTrack = remoteStream.getAudioTracks()[0]

        if (!audioTrack || audioTrack.readyState !== 'live') {
          console.warn('⚠️ [VoiceRoom] 오디오 트랙이 live 상태가 아닙니다')
        }

        playPeerAudio(call.peer, remoteStream)

        // 피어 정보 업데이트 (UUID 패턴 매칭으로 memberId 추출)
        const memberId = extractMemberIdFromPeerId(call.peer) || ''
        const peerConnection: PeerConnection = {
          peerId: call.peer,
          memberId,
          connection: call,
          stream: remoteStream,
          isSpeaking: false,
          isMuted: false, // 기본값, 브로드캐스트로 업데이트됨
        }

        peersRef.current.set(call.peer, peerConnection)
        setPeers(new Map(peersRef.current))

        // 원격 피어 음성 레벨 감지 시작
        startRemoteVoiceDetection(call.peer, remoteStream)
      })

      call.on('close', () => {
        stopRemoteVoiceDetection(call.peer)
        stopPeerAudio(call.peer) // ✅ 오디오 정리
        peersRef.current.delete(call.peer)
        setPeers(new Map(peersRef.current))
      })

      call.on('error', (err) => {
        console.error('❌ [VoiceRoom] 연결 에러:', err)
        stopRemoteVoiceDetection(call.peer)
        stopPeerAudio(call.peer) // ✅ 오디오 정리
        peersRef.current.delete(call.peer)
        setPeers(new Map(peersRef.current))
      })
    },
    [
      createSilentStream,
      startRemoteVoiceDetection,
      stopRemoteVoiceDetection,
      playPeerAudio,
      stopPeerAudio,
    ],
  )

  // ========== 다른 호스트에게 연결 ==========
  const connectToPeer = useCallback(
    (targetPeerId: string) => {
      if (!peerRef.current) {
        console.warn('Peer가 없습니다')
        return
      }

      // Peer가 destroyed 또는 disconnected 상태이면 연결 불가
      if (peerRef.current.destroyed) {
        console.warn(
          '⚠️ [VoiceRoom] Peer가 destroyed 상태입니다. 연결을 건너뜁니다.',
        )
        return
      }

      if (peerRef.current.disconnected) {
        console.warn(
          '⚠️ [VoiceRoom] Peer가 disconnected 상태입니다. 연결을 건너뜁니다.',
        )
        return
      }

      // 이미 연결된 피어인지 확인
      if (peersRef.current.has(targetPeerId)) {
        return
      }

      // 청취자 모드면 무음 스트림, 아니면 로컬 스트림 사용
      const streamToSend = isListenerModeRef.current
        ? createSilentStream()
        : localStreamRef.current

      if (!streamToSend) {
        return
      }

      const call = peerRef.current.call(targetPeerId, streamToSend)
      if (!call) {
        console.warn('⚠️ [VoiceRoom] 연결 생성 실패')
        return
      }

      // ICE 연결 상태 모니터링 (디버깅용)
      const pc = call.peerConnection
      if (pc) {
        pc.oniceconnectionstatechange = () => {
          if (pc.iceConnectionState === 'failed') {
            console.error('❌ ICE 연결 실패:', targetPeerId.slice(0, 30))
          }
        }
      }

      call.on('stream', (remoteStream) => {
        const audioTrack = remoteStream.getAudioTracks()[0]

        if (!audioTrack || audioTrack.readyState !== 'live') {
          console.warn('⚠️ [VoiceRoom] 오디오 트랙이 live 상태가 아닙니다')
        }

        playPeerAudio(targetPeerId, remoteStream)

        // UUID 패턴 매칭으로 memberId 추출
        const memberId = extractMemberIdFromPeerId(targetPeerId) || ''
        const peerConnection: PeerConnection = {
          peerId: targetPeerId,
          memberId,
          connection: call,
          stream: remoteStream,
          isSpeaking: false,
          isMuted: false, // 기본값, 브로드캐스트로 업데이트됨
        }

        peersRef.current.set(targetPeerId, peerConnection)
        setPeers(new Map(peersRef.current))

        // 원격 피어 음성 레벨 감지 시작
        startRemoteVoiceDetection(targetPeerId, remoteStream)
      })

      call.on('close', () => {
        stopRemoteVoiceDetection(targetPeerId)
        stopPeerAudio(targetPeerId) // ✅ 오디오 정리
        peersRef.current.delete(targetPeerId)
        setPeers(new Map(peersRef.current))
      })

      call.on('error', (err: any) => {
        stopRemoteVoiceDetection(targetPeerId)
        stopPeerAudio(targetPeerId)
        peersRef.current.delete(targetPeerId)
        setPeers(new Map(peersRef.current))

        // peer-unavailable: 타이밍 문제로 흔히 발생 - 조용히 재시도
        if (err?.type === 'peer-unavailable') {
          const retryCount = peerRetryCountRef.current.get(targetPeerId) || 0
          if (retryCount < 2) {
            peerRetryCountRef.current.set(targetPeerId, retryCount + 1)
            setTimeout(() => {
              if (
                peerRef.current &&
                !peerRef.current.destroyed &&
                !peersRef.current.has(targetPeerId)
              ) {
                const streamToSend = isListenerModeRef.current
                  ? createSilentStream()
                  : localStreamRef.current
                if (streamToSend && peerRef.current) {
                  peerRef.current.call(targetPeerId, streamToSend)
                }
              }
            }, 3000)
          } else {
            peerRetryCountRef.current.delete(targetPeerId)
          }
          return // 에러 로그 안 함
        }

        // 다른 에러는 조용히 처리
      })
    },
    [
      createSilentStream,
      startRemoteVoiceDetection,
      stopRemoteVoiceDetection,
      playPeerAudio,
      stopPeerAudio,
    ],
  )

  // connectToPeer를 ref에 저장
  useEffect(() => {
    connectToPeerRef.current = connectToPeer
  }, [connectToPeer])

  // ========== 메인 연결 함수 ==========
  // 항상 무음 스트림으로 시작, 마이크는 사용자가 수동으로 활성화
  // force: true면 기존 연결 상태 무시하고 강제 연결 (발언 나가기 후 청취자 재연결 등)
  // 연결 진행 중 플래그 (ref로 즉시 체크)
  const isConnectingRef = useRef(false)

  const connect = useCallback(
    async (
      roomId: string,
      memberId: string,
      listenerOnly: boolean = false,
      force: boolean = false,
    ) => {
      // ✅ 같은 방에 이미 연결되어 있고, 같은 모드(청취자/발언자)로 연결되어 있으면 재연결 방지
      // force=true일 때만 재연결 허용 (발언자 전환 등)
      if (
        !force &&
        currentRoomIdRef.current === roomId &&
        isConnected &&
        isListenerModeRef.current === listenerOnly
      ) {
        console.log('✅ 이미 같은 방에 같은 모드로 연결됨 - 재연결 스킵', {
          roomId,
          listenerOnly,
        })
        return
      }

      // 중복 연결 방지
      if (!force && (isConnectingRef.current || isConnecting || isConnected)) {
        // 같은 방이 아니면 기존 연결 해제 후 재연결
        if (currentRoomIdRef.current && currentRoomIdRef.current !== roomId) {
          // 기존 연결은 해제하되, 여기서는 계속 진행 (아래에서 처리)
        } else {
          return
        }
      }

      // ✅ 즉시 연결 중 플래그 설정 (중복 호출 방지)
      isConnectingRef.current = true

      // ✅ 기존 peer 인스턴스가 있으면 먼저 정리 (ID 충돌 방지)
      if (peerRef.current && !peerRef.current.destroyed) {
        try {
          peerRef.current.destroy()
        } catch (e) {
          // 무시
        }
      }
      peerRef.current = null
      setPeer(null)

      // ✅ force 재연결 시 새 세션 ID 생성 (ID 충돌 완전 방지)
      if (force) {
        sessionIdRef.current = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
      }

      setIsConnecting(true)
      setError(null)
      currentRoomIdRef.current = roomId
      setCurrentRoomId(roomId)
      isListenerModeRef.current = listenerOnly
      setIsListenerMode(listenerOnly)

      try {
        // iOS에서는 AudioContext resume을 먼저 보장
        await resumeAudioContext()
        
        // iOS에서 추가 대기 시간 (WebRTC 초기화)
        if (isIOSDevice()) {
          await new Promise((resolve) => setTimeout(resolve, 300))
        }

        let stream: MediaStream

        // 발언자는 마이크 스트림, 청취자는 무음 스트림
        if (listenerOnly) {
          stream = createSilentStream()
          isSilentStreamRef.current = true
        } else {
          try {
            // iOS에서는 getUserMedia 호출 전 사용자 제스처 대기 (필수)
            if (isIOSDevice()) {
              console.log('🍎 [VoiceRoom] iOS 감지 - 사용자 제스처 대기 중...')
              await waitForUserGesture()
              console.log('✅ [VoiceRoom] iOS 사용자 제스처 확인됨')
              
              // iOS에서 AudioContext가 suspended 상태면 resume 시도
              const audioContext = AudioContextManager.getInstance()
              if (audioContext.state === 'suspended') {
                try {
                  await audioContext.resume()
                  console.log('✅ [VoiceRoom] iOS AudioContext resumed before getUserMedia')
                } catch (e) {
                  console.warn('⚠️ [VoiceRoom] iOS AudioContext resume 실패:', e)
                }
              }
              
              // 사용자 제스처 후 추가 대기 (iOS WebRTC 안정화)
              await new Promise((resolve) => setTimeout(resolve, 200))
            }
            
            stream = await safeGetUserMedia({ audio: true, video: false })
            isSilentStreamRef.current = false

            // 기본 음소거 상태
            const audioTrack = stream.getAudioTracks()[0]
            if (audioTrack) audioTrack.enabled = false
            setIsMuted(true)
            startVoiceDetection(stream)
          } catch (micError) {
            console.warn(
              '⚠️ [VoiceRoom] 마이크 획득 실패 - 무음 스트림으로 대체',
              micError,
            )
            // iOS에서 권한 거부인 경우 더 명확한 에러 메시지
            if (isIOSDevice() && micError instanceof Error) {
              if (micError.message.includes('권한') || micError.message.includes('permission')) {
                setError('마이크 권한이 필요합니다. 설정에서 권한을 허용해주세요.')
              }
            }
            stream = createSilentStream()
            isSilentStreamRef.current = true
            setIsMuted(true)
          }
        }

        localStreamRef.current = stream
        setLocalStream(stream)

        // PeerJS 인스턴스 생성
        const peerId = buildPeerId(roomId, memberId)
        const peerOptions = getPeerOptions()
        const peerInstance = new Peer(peerId, peerOptions)
        peerRef.current = peerInstance
        setPeer(peerInstance)

        // 연결 타임아웃 (iOS는 더 긴 시간 필요)
        const timeoutMs = isIOSDevice() ? 20000 : isMobileDevice() ? 15000 : 10000

        const connectionTimeout = setTimeout(() => {
          if (peerInstance.destroyed) return

          console.error('❌ 연결 타임아웃', {
            platform: isIOSDevice() ? 'iOS' : isMobileDevice() ? 'Mobile' : 'Desktop',
            timeout: timeoutMs,
            peerOpen: peerInstance.open,
            peerState: peerInstance.open ? 'open' : 'connecting',
          })
          if (!peerInstance.open) {
            const errorMessage = isIOSDevice() 
              ? '연결 시간 초과 (iOS에서는 더 오래 걸릴 수 있습니다)'
              : '연결 시간 초과'
            setError(errorMessage)
            isConnectingRef.current = false
            setIsConnecting(false)
            try {
              peerInstance.destroy()
            } catch (e) {
              // destroy 실패 무시
            }
          }
        }, timeoutMs)

        // Peer 이벤트 핸들링
        peerInstance.on('open', async (id) => {
          clearTimeout(connectionTimeout)
          
          // iOS에서 연결 성공 후 AudioContext 재확인
          if (isIOSDevice()) {
            try {
              await resumeAudioContext()
              console.log('✅ [VoiceRoom] iOS AudioContext 확인 완료')
            } catch (e) {
              console.warn('⚠️ [VoiceRoom] iOS AudioContext 확인 실패:', e)
            }
          }
          
          setIsConnected(true)
          isConnectingRef.current = false
          setIsConnecting(false)

          startKeepAlive(peerInstance)
          startTurnRefresh(peerInstance)

          saveSession({
            roomId,
            memberId,
            isListenerOnly: listenerOnly,
            timestamp: Date.now(),
          })

          // 통합 채널 사용 (기존 개별 채널 대체)
          // 통합 채널이 연결될 때까지 대기 (최대 5초)
          const waitForChannel = async () => {
            let attempts = 0
            while (!unifiedChannelRef.current.isConnected && attempts < 50) {
              await new Promise((resolve) => setTimeout(resolve, 100))
              attempts++
            }
            if (!unifiedChannelRef.current.isConnected) {
              console.warn('[VoiceRoom] 통합 채널 연결 대기 시간 초과 - 브로드캐스트 스킵')
              return false
            }
            return true
          }
          const channelReady = await waitForChannel()

          if (channelReady && unifiedChannelRef.current.isConnected) {
            // Presence에 자신 등록
            await unifiedChannelRef.current.track({
              peerId: id,
              memberId,
              isMuted: true,
              joinedAt: Date.now(),
            })

            // peer-joined 브로드캐스트
            await unifiedChannelRef.current.broadcast('peer:join', {
              peerId: id,
              memberId,
              isMuted: true,
            })

            // 3. 시청자 입장 시 시스템 메시지 전송 (청취자 모드인 경우)
            if (listenerOnly) {
              try {
                // 사용자 이름 조회
                const { data: memberData } = await (
                  supabase.from('members') as any
                )
                  .select('name')
                  .eq('id', memberId)
                  .single()

                if (memberData?.name) {
                  // 최근 5분 안에 같은 사용자가 같은 방에 입장 메시지를 보냈는지 확인
                  const fiveMinutesAgo = new Date(
                    Date.now() - 5 * 60 * 1000,
                  ).toISOString()
                  const streamChats = () => supabase.from('stream_chats') as any

                  const { data: recentMessages } = await streamChats()
                    .select('id, created_at')
                    .eq('room_id', roomId)
                    .eq('sender_id', memberId)
                    .eq('chat_type', 'system')
                    .like('content', '%입장하셨습니다')
                    .gte('created_at', fiveMinutesAgo)
                    .order('created_at', { ascending: false })
                    .limit(1)

                  // 최근 5분 안에 입장 메시지가 없을 때만 전송
                  if (!recentMessages || recentMessages.length === 0) {
                    await streamChats().insert({
                      room_id: roomId,
                      sender_id: memberId,
                      content: `${memberData.name} 님이 입장하셨습니다`,
                      chat_type: 'system',
                    })
                    console.log(
                      '✅ [VoiceRoom] 시청자 입장 시스템 메시지 전송 완료:',
                      memberData.name,
                    )
                  } else {
                    console.log(
                      '⏭️ [VoiceRoom] 최근 5분 안에 입장 메시지가 있어 스킵:',
                      memberData.name,
                    )
                  }
                }
              } catch (error) {
                console.error(
                  '❌ [VoiceRoom] 시청자 입장 시스템 메시지 전송 실패:',
                  error,
                )
              }
            }
          }
        })

        // 수신 연결 처리
        peerInstance.on('call', handleIncomingCall)

        peerInstance.on('disconnected', () => {
          stopKeepAlive() // 재연결 전 타이머 정리

          // 재연결은 peerRef.current.disconnected가 true일 때만 시도
          setTimeout(() => {
            if (
              peerRef.current &&
              !peerRef.current.destroyed &&
              peerRef.current.disconnected
            ) {
              try {
                peerRef.current.reconnect()
                // 재연결 성공 시 타이머 재시작
                startKeepAlive(peerRef.current)
              } catch (error) {
                console.error('❌ [VoiceRoom] Peer 재연결 실패:', error)
              }
            }
          }, 2000)
        })

        peerInstance.on('error', (err: any) => {
          clearTimeout(connectionTimeout)

          // peer-unavailable: 피어 연결 타이밍 문제 - 무시 (call.on('error')에서 처리)
          if (err.type === 'peer-unavailable') {
            return
          }

          // network: 일시적 네트워크 끊김 - 자동 재연결됨
          if (err.type === 'network') {
            return
          }

          // unavailable-id: 같은 ID로 이미 연결된 경우
          if (err.type === 'unavailable-id') {
            try {
              peerInstance.destroy()
            } catch {
              // 무시
            }
            isConnectingRef.current = false
            setIsConnecting(false)
            setIsConnected(false)
            setTimeout(() => {
              if (currentRoomIdRef.current === roomId) {
                connect(roomId, memberId, listenerOnly, true)
              }
            }, 2000)
            return
          }

          // 다른 심각한 에러만 로그
          console.error('❌ Peer 에러:', err.type, err.message)
          setError(err.message || '연결 에러')
          isConnectingRef.current = false
          setIsConnecting(false)
        })

        peerInstance.on('close', () => {
          stopKeepAlive()
          stopTurnRefresh()
          setIsConnected(false)
        })
      } catch (err) {
        console.error('연결 실패:', err)
        setError(err instanceof Error ? err.message : '연결 실패')
        isConnectingRef.current = false
        setIsConnecting(false)
      }
    },
    [
      isConnecting,
      isConnected,
      handleIncomingCall,
      startVoiceDetection,
      createSilentStream,
    ],
  )

  // ========== 자동 재연결 (새로고침 시) ==========
  const hasAttemptedReconnectRef = useRef(false)
  const isAutoReconnectingRef = useRef(false) // 자동 재연결 진행 중 플래그

  // connect 함수를 ref로 저장 (useEffect 의존성 문제 해결)
  const connectRef = useRef(connect)
  useEffect(() => {
    connectRef.current = connect
  }, [connect])

  useEffect(() => {
    // 이미 시도했으면 스킵
    if (hasAttemptedReconnectRef.current) return
    // 유저 정보가 없으면 스킵
    if (!user?.id) return

    const session = loadSession()
    if (!session) return

    // memberId가 현재 유저와 일치하는지 확인
    if (session.memberId !== user.id) {
      clearSession()
      return
    }

    hasAttemptedReconnectRef.current = true
    isAutoReconnectingRef.current = true // 자동 재연결 시작
    setIsAutoReconnecting(true)

    // 새로고침이므로 세션 ID를 새로 생성 (이전 PeerJS 연결과 충돌 방지)
    sessionIdRef.current = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

    // 상태 초기화 (isConnecting은 connect 내에서 설정됨)
    setIsConnected(false)
    setIsMuted(true) // 새로고침 시 항상 음소거로 시작
    isSilentStreamRef.current = true // 무음 스트림으로 시작

    // roomId만 미리 설정 (useVoiceRoomPage에서 중복 연결 방지용)
    currentRoomIdRef.current = session.roomId
    setCurrentRoomId(session.roomId)

    // 약간의 딜레이 후 재연결 (앱 초기화 완료 대기 + 이전 연결 정리 시간)
    setTimeout(() => {
      // 항상 무음 스트림으로 시작, 마이크는 사용자가 수동 활성화
      // force: true로 상태 무관하게 연결, ref 사용
      connectRef
        .current(session.roomId, session.memberId, session.isListenerOnly, true)
        .finally(() => {
          isAutoReconnectingRef.current = false // 자동 재연결 완료
          setIsAutoReconnecting(false) // 상태도 업데이트
        })
    }, 1500)
  }, [user?.id]) // connect 의존성 제거 (ref 사용)

  // ========== 연결 해제 ==========
  // keepSession: true면 세션 유지 (발언자 전환 시 사용) - peer-left도 전송하지 않음
  const disconnect = useCallback(
    (keepSession: boolean = false) => {
      // 퇴장 알림 및 채널 완전 제거
      // keepSession=true면 발언자 전환 중이므로 peer-left 전송하지 않음 (호스트가 발언자 퇴장 처리하지 않도록)
      if (unifiedChannelRef.current.isConnected && peerRef.current) {
        if (!keepSession) {
          // 실제 퇴장일 때만 peer-left 브로드캐스트 (브라우저 종료 시에도 최대한 전송 시도)
          const memberId =
            extractMemberIdFromPeerId(peerRef.current.id || '') || user?.id
          try {
            // 통합 채널로 peer-left 브로드캐스트
            if (unifiedChannelRef.current.isConnected && peerRef.current) {
              unifiedChannelRef.current
                .broadcast('peer:leave', {
                  peerId: peerRef.current.id,
                  memberId: memberId || '',
                })
                .catch(() => {
                  // 브로드캐스트 실패 무시
                })
            }
          } catch (error) {
            // 브라우저 종료 시 전송 실패할 수 있음 - 무시
            console.warn(
              '⚠️ [VoiceRoom] peer-left 브로드캐스트 전송 실패:',
              error,
            )
          }
        }
        // 통합 채널은 자동으로 정리됨 (useEffect cleanup)
      }

      // 음성 레벨 감지 중지
      stopVoiceDetection()

      // ✅ 모든 피어 오디오 정리
      stopAllPeerAudio()

      // KeepAlive & TURN 갱신 타이머 정리
      stopKeepAlive()
      stopTurnRefresh()

      // 모든 피어 연결 종료
      peersRef.current.forEach((peerConn) => {
        // 원격 스트림도 정리
        if (peerConn.stream) {
          peerConn.stream.getTracks().forEach((track) => track.stop())
        }
        peerConn.connection.close()
      })
      peersRef.current.clear()
      setPeers(new Map())

      // 로컬 스트림 정리
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop())
        localStreamRef.current = null
      }
      setLocalStream(null)

      // Peer 정리
      if (peerRef.current) {
        peerRef.current.destroy()
        peerRef.current = null
      }
      setPeer(null)

      // 세션 ID 갱신 (재연결 시 새로운 ID 사용)
      sessionIdRef.current = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

      // 세션 삭제 (keepSession=true면 유지)
      if (!keepSession) {
        clearSession()
      }

      // 플래그 리셋
      isSilentStreamRef.current = false
      isConnectingRef.current = false

      setIsConnected(false)
      setIsConnecting(false)
      setIsMuted(true) // disconnect 후 음소거 상태로 리셋
      setIsSpeaking(false)

      // keepSession=true면 roomId 유지 (발언자 전환 시 다른 useEffect 개입 방지)
      if (!keepSession) {
        currentRoomIdRef.current = null
        setCurrentRoomId(null)
      }

      isListenerModeRef.current = false
      setIsListenerMode(false)
    },
    [stopVoiceDetection, stopAllPeerAudio, user?.id],
  )

  // ========== 마이크 토글 ==========
  const toggleMute = useCallback(async () => {
    // 청취자 모드면 마이크 토글 불가
    if (isListenerModeRef.current) {
      return
    }

    // 호스트에 의해 강제 뮤트된 상태면 뮤트 해제 불가
    if (isForceMuted && isMuted) {
      console.log('🔇 [VoiceRoom] 호스트에 의해 강제 뮤트됨 - 뮤트 해제 불가')
      return
    }

    // 현재 음소거 상태이고 무음 스트림(마이크 없음)인 경우 → 마이크 활성화 필요
    if (isMuted && isSilentStreamRef.current && localStreamRef.current) {
      try {
        // 실제 마이크 스트림 획득
        const micStream = await safeGetUserMedia({ audio: true, video: false })

        // 기존 무음 스트림 정리
        localStreamRef.current.getTracks().forEach((t) => t.stop())

        // 새 마이크 스트림으로 교체
        localStreamRef.current = micStream
        setLocalStream(micStream)
        isSilentStreamRef.current = false // 이제 실제 마이크 스트림

        // 음성 레벨 감지 시작
        startVoiceDetection(micStream)

        // 기존 피어 연결에 새 스트림 반영 (replaceTrack 사용)
        const newAudioTrack = micStream.getAudioTracks()[0]
        if (newAudioTrack) {
          peersRef.current.forEach((peerConn) => {
            const peerConnection = peerConn.connection.peerConnection
            if (peerConnection) {
              const sender = peerConnection
                .getSenders()
                .find((s) => s.track?.kind === 'audio')
              if (sender) {
                sender.replaceTrack(newAudioTrack)
              } else {
                console.warn(
                  '⚠️ [VoiceRoom] 오디오 센더를 찾을 수 없음:',
                  peerConn.peerId,
                )
              }
            } else {
              console.warn(
                '⚠️ [VoiceRoom] peerConnection이 없음:',
                peerConn.peerId,
              )
            }
          })
        }

        setIsMuted(false)

        // 음소거 해제 브로드캐스트
        if (unifiedChannelRef.current.isConnected && peerRef.current) {
          // 통합 채널로 뮤트 상태 브로드캐스트
          if (unifiedChannelRef.current.isConnected && peerRef.current) {
            unifiedChannelRef.current.broadcast('peer:mute-status', {
              peerId: peerRef.current.id,
              memberId: user?.id || '',
              isMuted: false,
            })
          }
        }
        return
      } catch (err) {
        console.error('❌ [VoiceRoom] 마이크 활성화 실패:', err)
        setError('마이크를 사용할 수 없습니다')
        return
      }
    }

    // 일반적인 음소거 토글 (실제 마이크 스트림이 있는 경우)
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        const newMutedState = !audioTrack.enabled
        setIsMuted(newMutedState)

        // 음소거 상태 브로드캐스트
        if (unifiedChannelRef.current.isConnected && peerRef.current) {
          // 통합 채널로 뮤트 상태 브로드캐스트
          if (unifiedChannelRef.current.isConnected && peerRef.current) {
            unifiedChannelRef.current.broadcast('peer:mute-status', {
              peerId: peerRef.current.id,
              memberId: user?.id || '',
              isMuted: newMutedState,
            })
          }
        }
      }
    }
  }, [isMuted, isForceMuted, startVoiceDetection])

  // ========== 마이크 강제 종료 ==========
  const stopMicrophone = useCallback(() => {
    clearSession()
    sessionIdRef.current = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

    stopVoiceDetection()
    stopAllPeerAudio()
    stopKeepAlive()
    stopTurnRefresh()

    // 피어 연결 종료
    peersRef.current.forEach((peerConn) => {
      if (peerConn.stream) {
        peerConn.stream.getTracks().forEach((track) => track.stop())
      }
      peerConn.connection.close()
    })
    peersRef.current.clear()
    setPeers(new Map())

    // Supabase 채널 제거
    // 통합 채널은 자동으로 정리됨 (useEffect cleanup)

    // PeerJS 인스턴스 종료
    if (peerRef.current) {
      peerRef.current.destroy()
      peerRef.current = null
    }
    setPeer(null)

    // 로컬 스트림 종료
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        track.enabled = false
        track.stop()
      })
      localStreamRef.current = null
    }

    // state 정리
    setLocalStream(null)
    setIsMuted(true)
    setIsSpeaking(false)
    setIsConnected(false)
    isConnectingRef.current = false
    setIsConnecting(false)
    currentRoomIdRef.current = null
    setCurrentRoomId(null)
    isListenerModeRef.current = false
    setIsListenerMode(false)
    isSilentStreamRef.current = false
  }, [stopVoiceDetection, stopAllPeerAudio])

  // ========== 강제 뮤트 적용 (호스트에 의한 뮤트) ==========
  const applyForceMute = useCallback(() => {
    console.log('🔇 [VoiceRoom] 강제 뮤트 적용')
    setIsForceMuted(true)

    // 마이크 음소거 강제 적용
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = false
        setIsMuted(true)

        // 음소거 상태 브로드캐스트
        if (unifiedChannelRef.current.isConnected && peerRef.current) {
          // 통합 채널로 뮤트 상태 브로드캐스트
          if (unifiedChannelRef.current.isConnected && peerRef.current) {
            unifiedChannelRef.current.broadcast('peer:mute-status', {
              peerId: peerRef.current.id,
              memberId: user?.id || '',
              isMuted: true,
            })
          }
        }
      }
    }
  }, [])

  // ========== 강제 뮤트 해제 (호스트가 해제) ==========
  const clearForceMute = useCallback(() => {
    console.log('🔊 [VoiceRoom] 강제 뮤트 해제')
    setIsForceMuted(false)
    // 뮤트 상태는 유지하되, 사용자가 수동으로 해제 가능하게 함
  }, [])

  // ========== 말하는 피어 목록 ==========
  const getSpeakingPeers = useCallback(() => {
    const speaking: Array<string> = []
    peersRef.current.forEach((peerConn, peerId) => {
      if (peerConn.isSpeaking) {
        speaking.push(peerId)
      }
    })
    if (isSpeaking && user?.id) {
      speaking.push(user.id)
    }
    return speaking
  }, [isSpeaking, user?.id])

  // ========== disconnect 함수를 ref로 저장 (이벤트 핸들러에서 접근용) ==========
  const disconnectRef = useRef(disconnect)
  useEffect(() => {
    disconnectRef.current = disconnect
  }, [disconnect])

  // ========== 인증 토큰 주기적 갱신 ==========
  useEffect(() => {
    // 토큰을 주기적으로 갱신
    const updateAuthToken = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        authTokenRef.current = session?.access_token || null
      } catch (error) {
        // 토큰 가져오기 실패 무시
      }
    }
    
    // 초기 토큰 가져오기
    updateAuthToken()
    
    // 주기적으로 토큰 갱신 (5분마다)
    const tokenInterval = setInterval(updateAuthToken, 5 * 60 * 1000)
    
    return () => {
      clearInterval(tokenInterval)
    }
  }, [])

  // ========== 브라우저 종료/기기 꺼짐 시 세션 종료 처리 ==========
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isConnected) {
        // beforeunload에서 토큰을 최신화
        supabase.auth.getSession().then(({ data: { session } }) => {
          authTokenRef.current = session?.access_token || null
        }).catch(() => {
          // 토큰 가져오기 실패 무시
        })
        
        e.preventDefault()
        e.returnValue = '방송 중입니다. 페이지를 나가시겠습니까?'
        return '방송 중입니다. 페이지를 나가시겠습니까?'
      }
    }

    const handleUnload = () => {
      if (isConnected) {
        const roomId = currentRoomIdRef.current
        const isListener = isListenerModeRef.current
        
        // 빠른 cleanup 수행
        try {
          disconnectRef.current(false) // keepSession=false로 실제 퇴장 처리
        } catch (error) {
          console.error('❌ [VoiceRoom] unload 시 disconnect 실패:', error)
        }
        
        // 청취자인 경우 leaveRoom API 호출 (keepalive 옵션 사용)
        if (roomId && isListener && user?.id && authTokenRef.current) {
          try {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const functionName = 'api-stream'
            const path = `/rooms/${roomId}/leave`
            
            // fetch의 keepalive 옵션을 사용하여 페이지 종료 후에도 요청 완료 보장
            fetch(`${supabaseUrl}/functions/v1/${functionName}${path}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authTokenRef.current}`,
              },
              keepalive: true, // 페이지 종료 후에도 요청 완료 보장
            }).catch(() => {
              // 실패 무시 (이미 페이지가 종료 중)
            })
          } catch (error) {
            // API 호출 실패 무시
          }
        }
      }
    }

    const handlePageHide = () => {
      if (isConnected) {
        const roomId = currentRoomIdRef.current
        const isListener = isListenerModeRef.current
        
        // 모바일에서 페이지가 숨겨질 때 (앱 전환, 기기 꺼짐 등)
        console.log('📱 [VoiceRoom] 페이지가 숨겨짐 - 세션 종료 시도')
        try {
          disconnectRef.current(false) // keepSession=false로 실제 퇴장 처리
        } catch (error) {
          console.error('❌ [VoiceRoom] pagehide 시 disconnect 실패:', error)
        }
        
        // 청취자인 경우 leaveRoom API 호출 (keepalive 옵션 사용)
        if (roomId && isListener && user?.id && authTokenRef.current) {
          try {
            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
            const functionName = 'api-stream'
            const path = `/rooms/${roomId}/leave`
            
            fetch(`${supabaseUrl}/functions/v1/${functionName}${path}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authTokenRef.current}`,
              },
              keepalive: true,
            }).catch(() => {
              // 실패 무시
            })
          } catch (error) {
            // API 호출 실패 무시
          }
        }
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
  }, [isConnected, user?.id])

  // ========== PWA visibility 핸들링 & AudioContext 초기화 (통화 기능에서 가져옴) ==========
  useEffect(() => {
    // AudioContext 활성화 (사용자 제스처 시)
    const wakeUpAudioContext = async () => {
      // 뷰어 페이지에서는 AudioContext를 사용하지 않으므로 스킵
      if (window.location.pathname.includes('/viewer')) {
        return
      }
      
      try {
        // 사용자 제스처 시간 기록 (iOS에서 getUserMedia 호출 시 사용)
        if (isIOSDevice()) {
          (window as any).__lastUserGestureTime = Date.now()
        }
        await resumeAudioContext()
      } catch (err) {
        // 에러 무시 (사용자 제스처 없이 호출될 수 있음)
      }
    }

    // PWA 화면 꺼짐 방지 - visibilitychange 시 ping 전송
    const handleVisibilityChange = () => {
      if (document.hidden && peerRef.current) {
        try {
          const peerSocket = peerRef.current.socket as any
          if (peerSocket && peerSocket._wsOpen?.()) {
            peerSocket.send({ type: 'ping' })
          }
        } catch (error) {
          // 무시
        }
      }
    }

    // 이벤트 리스너 등록
    document.addEventListener('click', wakeUpAudioContext)
    document.addEventListener('touchstart', wakeUpAudioContext)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('click', wakeUpAudioContext)
      document.removeEventListener('touchstart', wakeUpAudioContext)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // ========== 네트워크 전환 감지 (WiFi ↔ LTE 등) ==========
  useEffect(() => {
    const handleOnline = () => {
      console.log('📶 [VoiceRoom] 네트워크 복구됨 - 재연결 시도')

      // 연결이 끊어진 상태면 재연결 시도
      if (peerRef.current?.disconnected && currentRoomIdRef.current) {
        try {
          peerRef.current.reconnect()
        } catch (error) {
          console.error('❌ [VoiceRoom] 네트워크 복구 후 재연결 실패:', error)
        }
      }
    }

    const handleOffline = () => {
      console.log('📵 [VoiceRoom] 네트워크 끊김')
      setError('네트워크 연결이 끊어졌습니다')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // ========== 클린업 ==========
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  const value: VoiceRoomContextType = {
    isConnected,
    isConnecting,
    isAutoReconnecting,
    error,
    currentRoomId,
    isListenerMode,
    localStream,
    isMuted,
    isSpeaking,
    isForceMuted,
    peers,
    connect,
    disconnect,
    toggleMute,
    stopMicrophone,
    applyForceMute,
    clearForceMute,
    getSpeakingPeers,
  }

  return (
    <VoiceRoomContext.Provider value={value}>
      {children}
    </VoiceRoomContext.Provider>
  )
}

// ========== Hook ==========

export function useVoiceRoomConnection() {
  const context = useContext(VoiceRoomContext)
  if (!context) {
    throw new Error(
      'useVoiceRoomConnection must be used within VoiceRoomProvider',
    )
  }
  return context
}
