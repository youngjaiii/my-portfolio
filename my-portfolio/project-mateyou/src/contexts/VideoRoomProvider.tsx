/**
 * VideoRoomProvider - 라이브 스트리밍 PeerJS 연결 관리
 * 
 * 기능:
 * - 다인원 Mesh 연결 (각 참여자가 서로 연결)
 * - 비디오 + 오디오 스트림 관리
 * - 화면 공유 지원
 * - 카메라 전환 (전면/후면)
 * - 호스트 영상 송출 중단/재개
 * - PIP (Picture-in-Picture) 지원
 */

const DEBUG = import.meta.env.DEV

import { useAuth } from '@/hooks/useAuth';
import { useUnifiedStreamChannel } from '@/hooks/useUnifiedStreamChannel';
import { supabase } from '@/lib/supabase';
import { safeGetUserMedia } from '@/lib/utils';
import { AudioContextManager } from '@/utils/AudioContextManager';
import { resumeAudioContext } from '@/utils/audioUtils';
import { allowScreenSharing, disallowScreenSharing } from '@/utils/captureProtection';
import { generateTurnCredentials } from '@/utils/turnAuth';
import type { MediaConnection, PeerJSOption } from 'peerjs';
import Peer from 'peerjs';
import type { ReactNode } from 'react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

// ========== 타입 정의 ==========

interface PeerConnection {
  peerId: string
  memberId: string
  connection: MediaConnection
  stream: MediaStream | null
  isMuted: boolean
  isVideoOff: boolean
}

interface VideoRoomContextType {
  // 연결 상태
  isConnected: boolean
  isConnecting: boolean
  error: string | null
  currentRoomId: string | null
  
  // 로컬 상태
  localStream: MediaStream | null
  isMuted: boolean
  isVideoOff: boolean
  isScreenSharing: boolean
  hasCamera: boolean
  facingMode: 'user' | 'environment'
  isFlipped: boolean
  
  // 원격 피어 상태
  peers: Map<string, PeerConnection>
  
  // 액션
  connect: (roomId: string, memberId: string, isHost: boolean) => Promise<void>
  disconnect: () => void
  toggleMute: () => void
  toggleVideo: () => void
  startScreenShare: () => Promise<void>
  stopScreenShare: () => Promise<void>
  switchCamera: () => Promise<void>
  toggleHostVideo: (hide: boolean) => void
  toggleFlip: () => void
  enterPIP: () => Promise<void>
  exitPIP: () => Promise<void>
}

const VideoRoomContext = createContext<VideoRoomContextType | null>(null)

// ========== 세션 저장 ==========
const VIDEO_ROOM_SESSION_KEY = 'video-room-session'

interface VideoRoomSession {
  roomId: string
  memberId: string
  timestamp: number
}

function saveSession(session: VideoRoomSession) {
  try {
    localStorage.setItem(VIDEO_ROOM_SESSION_KEY, JSON.stringify(session))
  } catch {
    // 저장 실패 무시
  }
}

function loadSession(): VideoRoomSession | null {
  try {
    const data = localStorage.getItem(VIDEO_ROOM_SESSION_KEY)
    if (!data) return null
    
    const session = JSON.parse(data) as VideoRoomSession
    
    // 1시간 이상 지난 세션은 무효
    if (Date.now() - session.timestamp > 60 * 60 * 1000) {
      clearSession()
      return null
    }
    
    return session
  } catch {
    return null
  }
}

function clearSession() {
  try {
    localStorage.removeItem(VIDEO_ROOM_SESSION_KEY)
  } catch {
    // 무시
  }
}

// ========== PeerJS 설정 ==========

function getPeerOptions(): PeerJSOption {
  const { username, credential } = generateTurnCredentials(
    import.meta.env.VITE_TURN_SECRET_KEY || 'default-secret-key'
  )

  return {
    host: 'peer01.mateyou.me',
    port: 443,
    secure: true,
    path: '/myapp',
    key: import.meta.env.VITE_PEERJS_API_KEY || 'mateyou-prod',
    debug: DEBUG ? 2 : 0,
    config: {
      iceServers: [
        {
          urls: 'turns:peer01.mateyou.me:5349?transport=tcp',
          username,
          credential,
        },
        {
          urls: 'turn:peer01.mateyou.me:3478?transport=udp',
          username,
          credential,
        },
        {
          urls: 'turn:peer01.mateyou.me:3478?transport=tcp',
          username,
          credential,
        },
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
      iceTransportPolicy: 'all',
      iceCandidatePoolSize: 4,
    },
  }
}

// ========== Provider 컴포넌트 ==========

interface VideoRoomProviderProps {
  children: ReactNode
}

export function VideoRoomProvider({ children }: VideoRoomProviderProps) {
  const { user } = useAuth()
  
  // Peer 상태
  const peerRef = useRef<Peer | null>(null)
  
  // 연결 상태
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // 로컬 미디어
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [hasCamera, setHasCamera] = useState(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const [isFlipped, setIsFlipped] = useState(false)
  
  // Canvas 기반 좌우 반전 처리
  const flipCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const flipVideoRef = useRef<HTMLVideoElement | null>(null)
  const flipAnimationRef = useRef<number | null>(null)
  const originalVideoTrackRef = useRef<MediaStreamTrack | null>(null)
  const flippedVideoTrackRef = useRef<MediaStreamTrack | null>(null)
  
  // 원격 피어
  const [peers, setPeers] = useState<Map<string, PeerConnection>>(new Map())
  const peersRef = useRef<Map<string, PeerConnection>>(new Map())
  
  // 오디오 재생용 비디오 엘리먼트
  const audioElementsRef = useRef<Map<string, HTMLVideoElement>>(new Map())
  
  // 방 정보
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(null)
  const currentRoomIdRef = useRef<string | null>(null)
  const isHostRef = useRef(false)
  const authTokenRef = useRef<string | null>(null) // 인증 토큰 저장용
  
  // 통합 채널 (통합 스트림 Realtime 채널)
  // currentRoomId가 설정되기 전에도 채널을 준비하기 위해 항상 활성화
  const unifiedChannel = useUnifiedStreamChannel(currentRoomId, {
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
              if (currentRoomIdRef.current === roomId && !peersRef.current.has(presence.peerId)) {
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
    const handlePeerJoin = (data: { peerId: string; memberId: string; isHost?: boolean; isMuted?: boolean; isVideoOff?: boolean }) => {
      const { peerId, memberId: newMemberId } = data
      const currentMemberId = user?.id
      if (peerId && newMemberId !== currentMemberId && !peersRef.current.has(peerId)) {
        setTimeout(() => {
          if (currentRoomIdRef.current === currentRoomId && !peersRef.current.has(peerId)) {
            connectToPeerRef.current?.(peerId)
          }
        }, 1000)
      }
    }

    // peer:leave 이벤트
    const handlePeerLeave = (data: { peerId: string; memberId: string }) => {
      const { peerId } = data
      const peerConn = peersRef.current.get(peerId)
      if (peerConn) {
        peerConn.connection.close()
        stopAudio(peerId)
      }
      peersRef.current.delete(peerId)
      setPeers(new Map(peersRef.current))
    }

    // peer:mute-status 이벤트
    const handleMuteStatus = (data: { peerId: string; memberId: string; isMuted: boolean }) => {
      const { peerId, isMuted: peerMuted } = data
      const peer = peersRef.current.get(peerId)
      if (peer) {
        peer.isMuted = peerMuted
        setPeers(new Map(peersRef.current))
      }
    }

    // peer:video-status 이벤트
    const handleVideoStatus = (data: { peerId: string; memberId: string; isVideoOff: boolean }) => {
      const { peerId, isVideoOff: peerVideoOff } = data
      const peer = peersRef.current.get(peerId)
      if (peer) {
        peer.isVideoOff = peerVideoOff
        setPeers(new Map(peersRef.current))
      }
    }

    // peer:track-replaced 이벤트
    const handleTrackReplaced = (data: { peerId: string; trackLabel: string; timestamp: number }) => {
      const { peerId } = data
      const peer = peersRef.current.get(peerId)
      if (peer && peer.stream) {
        setPeers(new Map(peersRef.current))
      }
    }

    unifiedChannel.on('peer:join', handlePeerJoin)
    unifiedChannel.on('peer:leave', handlePeerLeave)
    unifiedChannel.on('peer:mute-status', handleMuteStatus)
    unifiedChannel.on('peer:video-status', handleVideoStatus)
    unifiedChannel.on('peer:track-replaced', handleTrackReplaced)

    return () => {
      unifiedChannel.off('peer:join', handlePeerJoin)
      unifiedChannel.off('peer:leave', handlePeerLeave)
      unifiedChannel.off('peer:mute-status', handleMuteStatus)
      unifiedChannel.off('peer:video-status', handleVideoStatus)
      unifiedChannel.off('peer:track-replaced', handleTrackReplaced)
    }
  }, [unifiedChannel.isConnected, currentRoomId, user?.id, unifiedChannel])
  
  // PIP 상태
  const pipVideoRef = useRef<HTMLVideoElement | null>(null)
  
  // KeepAlive & TURN 갱신 타이머
  const keepAliveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const turnRefreshTimerRef = useRef<NodeJS.Timeout | null>(null)
  const tokenIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // PeerId 생성
  const sessionIdRef = useRef(`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`)
  const buildPeerId = (roomId: string, memberId: string) =>
    `video-stream-${roomId}-${memberId}-${sessionIdRef.current}`
  
  // peerId에서 memberId 추출
  const extractMemberIdFromPeerId = (peerId: string): string | null => {
    const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
    const uuids = peerId.match(uuidRegex)
    return uuids && uuids.length >= 2 ? uuids[1] : null
  }

  // ========== 검정화면 비디오 트랙 생성 ==========
  const createBlackVideoTrack = useCallback((): MediaStreamTrack => {
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 480
    canvas.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;'
    document.body.appendChild(canvas)
    
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas context를 생성할 수 없습니다')
    
    ctx.fillStyle = 'black'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    
    const stream = canvas.captureStream(1) // 1fps로 충분
    const track = stream.getVideoTracks()[0]
    if (!track) {
      canvas.remove()
      throw new Error('비디오 트랙을 생성할 수 없습니다')
    }
    
    track.onended = () => canvas.remove()
    return track
  }, [])

  // ========== 무음 오디오 트랙 생성 (권한 요청 없음) ==========
  const createSilentAudioTrack = useCallback((): MediaStreamTrack => {
    // AudioContext 싱글톤 사용 (메모리 누수 방지)
    const audioContext = AudioContextManager.getInstance()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()
    const destination = audioContext.createMediaStreamDestination()
    
    // 무음 설정
    gainNode.gain.value = 0
    oscillator.connect(gainNode)
    gainNode.connect(destination)
    oscillator.start()
    
    const track = destination.stream.getAudioTracks()[0]
    if (!track) throw new Error('오디오 트랙을 생성할 수 없습니다')
    
    // 트랙 종료 시 oscillator만 정리 (AudioContext는 싱글톤이므로 close하지 않음)
    track.onended = () => {
      oscillator.stop()
    }
    
    return track
  }, [])

  // ========== KeepAlive ==========
  
  const stopKeepAlive = useCallback(() => {
    if (keepAliveTimerRef.current) {
      clearInterval(keepAliveTimerRef.current)
      keepAliveTimerRef.current = null
    }
  }, [])

  const startKeepAlive = useCallback((peerInstance: Peer) => {
    stopKeepAlive()
    keepAliveTimerRef.current = setInterval(() => {
      try {
        const peerSocket = peerInstance.socket as any
        if (peerInstance && peerSocket && peerSocket._wsOpen?.()) {
          peerSocket.send({ type: 'ping' })
        }
      } catch {
        // ping 실패는 무시
      }
    }, 20000)
  }, [stopKeepAlive])

  const stopTurnRefresh = useCallback(() => {
    if (turnRefreshTimerRef.current) {
      clearInterval(turnRefreshTimerRef.current)
      turnRefreshTimerRef.current = null
    }
  }, [])

  const startTurnRefresh = useCallback((peerInstance: Peer) => {
    stopTurnRefresh()
    turnRefreshTimerRef.current = setInterval(() => {
      try {
        const { username: newUsername, credential: newCredential } = generateTurnCredentials(
          import.meta.env.VITE_TURN_SECRET_KEY || 'default-secret-key'
        )
        const config = (peerInstance as any)._options?.config
        if (config?.iceServers) {
          config.iceServers.forEach((server: RTCIceServer) => {
            if (server.urls && typeof server.urls === 'string' && server.urls.includes('turn')) {
              server.username = newUsername
              server.credential = newCredential
            }
          })
        }
      } catch {
        // 갱신 실패 무시
      }
    }, 3600 * 1000)
  }, [stopTurnRefresh])

  // ========== 오디오 재생 관리 ==========
  
  // 오디오 재생 중복 호출 방지
  const playAudioPendingRef = useRef<Set<string>>(new Set())
  
  const playAudio = useCallback(async (peerId: string, stream: MediaStream) => {
    // 이미 재생 처리 중인 경우 스킵
    if (playAudioPendingRef.current.has(peerId)) {
      return
    }
    
    playAudioPendingRef.current.add(peerId)
    
    try {
      // 기존 엘리먼트가 있고 같은 스트림이면 스킵
      const existing = audioElementsRef.current.get(peerId)
      if (existing && existing.srcObject === stream) {
        return
      }
      
      // 기존 엘리먼트 정리 (play 대기 후)
      if (existing) {
        try {
          existing.pause()
        } catch { /* 무시 */ }
        existing.srcObject = null
        existing.remove()
        audioElementsRef.current.delete(peerId)
        // 잠시 대기하여 이전 play() 요청이 완료되도록
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      
      await resumeAudioContext()
      
      const audioTracks = stream.getAudioTracks()
      
      if (audioTracks.length === 0) {
        return
      }
      
      const audio = document.createElement('video')
      audio.id = `audio-${peerId.slice(0, 20)}`
      audio.autoplay = true
      audio.playsInline = true
      audio.muted = false
      audio.volume = 1.0
      audio.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;'
      audio.srcObject = stream
      
      document.body.appendChild(audio)
      audioElementsRef.current.set(peerId, audio)
      
      try {
        await audio.play()
      } catch (err: any) {
        // AbortError는 무시 (다른 play 요청에 의해 중단된 것)
        if (err?.name === 'AbortError') {
          return
        }
        
        // 사용자 인터랙션 필요
        const handler = async () => {
          try {
            await resumeAudioContext()
            const currentAudio = audioElementsRef.current.get(peerId)
            if (currentAudio && currentAudio.paused) {
              await currentAudio.play()
            }
          } catch (e) {
            // 재생 실패 무시
          }
          window.removeEventListener('touchstart', handler)
          window.removeEventListener('click', handler)
        }
        window.addEventListener('touchstart', handler, { once: true })
        window.addEventListener('click', handler, { once: true })
      }
    } finally {
      playAudioPendingRef.current.delete(peerId)
    }
  }, [])
  
  const stopAudio = useCallback((peerId: string) => {
    const audio = audioElementsRef.current.get(peerId)
    if (audio) {
      audio.pause()
      audio.srcObject = null
      audio.remove()
      audioElementsRef.current.delete(peerId)
    }
  }, [])
  
  const stopAllAudio = useCallback(() => {
    audioElementsRef.current.forEach((audio) => {
      audio.pause()
      audio.srcObject = null
      audio.remove()
    })
    audioElementsRef.current.clear()
  }, [])

  // ========== 피어 스트림 업데이트 ==========
  
  const updatePeerStream = useCallback((peerId: string, stream: MediaStream, call: MediaConnection) => {
    const memberId = extractMemberIdFromPeerId(peerId) || ''
    const existing = peersRef.current.get(peerId)
    
    const peerConnection: PeerConnection = {
      peerId,
      memberId,
      connection: call,
      stream,
      isMuted: existing?.isMuted ?? false,
      isVideoOff: existing?.isVideoOff ?? false,
    }
    
    peersRef.current.set(peerId, peerConnection)
    setPeers(new Map(peersRef.current))
    
    // 오디오 재생
    playAudio(peerId, stream)
    
    if (DEBUG) {
      console.log('✅ [LiveRoom] 피어 스트림 업데이트:', {
        peerId: peerId.slice(0, 30),
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length,
      })
    }
  }, [playAudio])

  // ========== 원격 피어 연결 처리 ==========
  
  const setupCallHandlers = useCallback((call: MediaConnection, targetPeerId: string) => {
    const pc = call.peerConnection
    
    // ontrack 이벤트로 스트림 수신 (가장 신뢰할 수 있는 방법)
    if (pc) {
      pc.ontrack = (event) => {
        if (event.streams && event.streams.length > 0) {
          updatePeerStream(targetPeerId, event.streams[0], call)
        }
      }
    }
    
    // stream 이벤트 (백업)
    call.on('stream', (remoteStream) => {
      updatePeerStream(targetPeerId, remoteStream, call)
    })
    
    call.on('close', () => {
      stopAudio(targetPeerId)
      peersRef.current.delete(targetPeerId)
      setPeers(new Map(peersRef.current))
    })
    
    call.on('error', () => {
      stopAudio(targetPeerId)
      peersRef.current.delete(targetPeerId)
      setPeers(new Map(peersRef.current))
    })
  }, [updatePeerStream, stopAudio])

  const handleIncomingCall = useCallback((call: MediaConnection) => {
    if (!peerRef.current || peerRef.current.destroyed) return
    if (!localStreamRef.current) return
    
    call.answer(localStreamRef.current)
    setupCallHandlers(call, call.peer)
  }, [setupCallHandlers])

  const connectToPeer = useCallback((targetPeerId: string) => {
    if (!peerRef.current || peerRef.current.destroyed) return
    if (peersRef.current.has(targetPeerId)) return
    if (!localStreamRef.current) return
    
    const call = peerRef.current.call(targetPeerId, localStreamRef.current)
    if (!call) return
    
    setupCallHandlers(call, targetPeerId)
  }, [setupCallHandlers])

  // connectToPeer를 ref에 저장
  useEffect(() => {
    connectToPeerRef.current = connectToPeer
  }, [connectToPeer])

  // ========== 트랙 교체 ==========
  
  const replaceVideoTrack = useCallback((newTrack: MediaStreamTrack) => {
    if (peersRef.current.size === 0) {
      return
    }
    
    // 화면 공유인지 확인 (트랙 레이블로 판단)
    const isScreenShare = newTrack.label.includes('screen') || 
                         newTrack.label.includes('화면') || 
                         newTrack.label.includes('Screen') ||
                         newTrack.label.includes('Entire Screen') ||
                         newTrack.label.includes('Window')
    
    peersRef.current.forEach((peerConn) => {
      const pc = peerConn.connection.peerConnection
      if (!pc) {
        return
      }
      
      const senders = pc.getSenders()
      
      const videoSender = senders.find(s => s.track?.kind === 'video')
      if (videoSender) {
        videoSender.replaceTrack(newTrack).then(() => {
          // 화면 공유 시 비트레이트 제한 설정 (성능 최적화)
          if (isScreenShare && videoSender.getParameters) {
            const params = videoSender.getParameters()
            if (!params.encodings || params.encodings.length === 0) {
              params.encodings = [{}]
            }
            // 화면 공유 시 비트레이트 제한: 최대 1.5Mbps (540p 최적화)
            params.encodings[0].maxBitrate = 1_500_000 // 1.5Mbps
            params.encodings[0].maxFramerate = 20
            // 추가 최적화: 스케일 리졸루션 다운스케일링
            params.encodings[0].scaleResolutionDownBy = 1 // 필요시 2로 설정 가능
            videoSender.setParameters(params).catch(() => {
              // 파라미터 설정 실패는 무시 (일부 브라우저에서 지원하지 않을 수 있음)
            })
          }
          
          // 브로드캐스트로 시청자에게 트랙 변경 알림 (통합 채널 사용)
          if (unifiedChannel.isConnected && peerRef.current) {
            unifiedChannel.broadcast('peer:track-replaced', {
                peerId: peerRef.current.id, 
                trackLabel: newTrack.label,
                timestamp: Date.now(),
            })
          }
        }).catch((err) => {
          // 트랙 교체 실패 무시
        })
      } else {
        if (localStreamRef.current) {
          pc.addTrack(newTrack, localStreamRef.current)
        }
      }
    })
  }, [])

  // ========== 메인 연결 함수 ==========
  const isConnectingRef = useRef(false)
  
  const connect = useCallback(async (roomId: string, memberId: string, isHost: boolean) => {
    if (currentRoomIdRef.current === roomId && isConnected) return
    if (isConnectingRef.current) return
    
    isConnectingRef.current = true
    
    // 기존 peer 정리
    if (peerRef.current && !peerRef.current.destroyed) {
      try { peerRef.current.destroy() } catch { /* 무시 */ }
    }
    peerRef.current = null
    
    setIsConnecting(true)
    setError(null)
    currentRoomIdRef.current = roomId
    setCurrentRoomId(roomId)
    isHostRef.current = isHost
    
    try {
      await resumeAudioContext()
      
      // 리허설 설정 확인 (방송 시작 시 리허설에서 전달됨)
      let rehearsalSettings: {
        roomId: string
        isScreenSharing: boolean
        isMicOn: boolean
        isCameraOn: boolean
        facingMode: 'user' | 'environment'
        timestamp: number
      } | null = null
      
      try {
        const stored = sessionStorage.getItem('rehearsal-settings')
        if (stored) {
          const parsed = JSON.parse(stored)
          // 같은 방이고, 10초 이내의 설정만 유효
          if (parsed.roomId === roomId && Date.now() - parsed.timestamp < 10000) {
            rehearsalSettings = parsed
            sessionStorage.removeItem('rehearsal-settings') // 한 번 사용 후 삭제
          }
        }
      } catch { /* 무시 */ }
      
      // 스트림 생성: 호스트는 오디오+검정화면, 시청자는 빈 스트림 (권한 요청 없음)
      let stream: MediaStream
      
      if (isHost) {
        // 리허설 설정이 있으면 적용, 없으면 기본값 사용
        if (rehearsalSettings) {
          if (rehearsalSettings.isScreenSharing) {
            // 화면 공유로 시작
            try {
              // 화면 공유 성능 최적화: 해상도 및 프레임레이트 제한 (540p, 20fps)
              const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: { 
                  displaySurface: 'monitor' as any,
                  // 성능 최적화: 540p 해상도 (960x540), 프레임레이트 20fps로 제한
                  width: { ideal: 960, max: 960 },
                  height: { ideal: 540, max: 540 },
                  frameRate: { ideal: 20, max: 20 },
                },
                audio: { echoCancellation: false, noiseSuppression: false } as any,
              })
              
              // 오디오 트랙 추가
              const audioStream = await safeGetUserMedia({ audio: true, video: false })
              audioStream.getAudioTracks().forEach(track => {
                track.enabled = rehearsalSettings!.isMicOn
                screenStream.addTrack(track)
              })
              
              stream = screenStream
              screenStreamRef.current = screenStream
              setIsScreenSharing(true)
              setHasCamera(false)
              setIsMuted(!rehearsalSettings.isMicOn)
              
              // 화면 공유 종료 감지
              const videoTrack = screenStream.getVideoTracks()[0]
              if (videoTrack) {
                videoTrack.onended = () => {
                  // 화면 공유 종료 시 검정화면으로 전환
                  setIsScreenSharing(false)
                }
              }
            } catch (err) {
              // 화면 공유 실패 시 카메라로 대체
              const cameraStream = await safeGetUserMedia({ 
                audio: true, 
                video: { facingMode: rehearsalSettings.facingMode } 
              })
              cameraStream.getAudioTracks().forEach(t => t.enabled = rehearsalSettings!.isMicOn)
              cameraStream.getVideoTracks().forEach(t => t.enabled = rehearsalSettings!.isCameraOn)
              stream = cameraStream
              cameraStreamRef.current = cameraStream
              setHasCamera(true)
              setIsMuted(!rehearsalSettings.isMicOn)
              setIsVideoOff(!rehearsalSettings.isCameraOn)
            }
          } else if (rehearsalSettings.isCameraOn) {
            // 카메라로 시작
            const cameraStream = await safeGetUserMedia({ 
              audio: true, 
              video: { facingMode: rehearsalSettings.facingMode } 
            })
            cameraStream.getAudioTracks().forEach(t => t.enabled = rehearsalSettings!.isMicOn)
            stream = cameraStream
            cameraStreamRef.current = cameraStream
            setHasCamera(true)
            setFacingMode(rehearsalSettings.facingMode)
            setIsMuted(!rehearsalSettings.isMicOn)
            setIsVideoOff(false)
          } else {
            // 카메라 꺼진 상태로 시작 (오디오 + 검정화면)
            const audioStream = await safeGetUserMedia({ audio: true, video: false })
            stream = new MediaStream()
            audioStream.getAudioTracks().forEach(track => {
              track.enabled = rehearsalSettings!.isMicOn
              stream.addTrack(track)
            })
            
            const blackTrack = createBlackVideoTrack()
            stream.addTrack(blackTrack)
            
            setHasCamera(false)
            setIsMuted(!rehearsalSettings.isMicOn)
            setIsVideoOff(true)
          }
        } else {
          // 리허설 설정 없음 - 기본값 사용
          const audioStream = await safeGetUserMedia({ audio: true, video: false })
          stream = new MediaStream()
          audioStream.getAudioTracks().forEach(track => stream.addTrack(track))
          
          const blackTrack = createBlackVideoTrack()
          stream.addTrack(blackTrack)
          
          setHasCamera(false)
          setIsVideoOff(false)
        }
      } else {
        // 시청자도 오디오+비디오 트랙을 포함해야 WebRTC에서 비디오 채널이 협상됨
        // 비디오 트랙이 없으면 호스트의 비디오를 수신할 수 없음
        stream = new MediaStream()
        const silentAudioTrack = createSilentAudioTrack()
        stream.addTrack(silentAudioTrack)
        
        // 검정화면 비디오 트랙 추가 (권한 요청 없이 Canvas로 생성)
        const blackTrack = createBlackVideoTrack()
        stream.addTrack(blackTrack)
        
        setHasCamera(false)
        setIsVideoOff(true)
        setIsMuted(true)
      }
      
      localStreamRef.current = stream
      setLocalStream(stream)
      
      // PeerJS 인스턴스 생성
      const peerId = buildPeerId(roomId, memberId)
      const peerInstance = new Peer(peerId, getPeerOptions())
      peerRef.current = peerInstance
      
      const connectionTimeout = setTimeout(() => {
        if (!peerInstance.open && !peerInstance.destroyed) {
          setError('연결 시간 초과')
          isConnectingRef.current = false
          setIsConnecting(false)
          peerInstance.destroy()
        }
      }, 15000)
      
      peerInstance.on('open', async (id) => {
        clearTimeout(connectionTimeout)
        setIsConnected(true)
        isConnectingRef.current = false
        setIsConnecting(false)
        
        startKeepAlive(peerInstance)
        startTurnRefresh(peerInstance)
        
        saveSession({ roomId, memberId, timestamp: Date.now() })
        
        // 통합 채널 사용 (기존 개별 채널 대체)
        // 통합 채널이 연결될 때까지 대기 (최대 5초)
        const waitForChannel = async () => {
          let attempts = 0
          while (!unifiedChannelRef.current.isConnected && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 100))
            attempts++
          }
          if (!unifiedChannelRef.current.isConnected) {
            console.warn('[VideoRoom] 통합 채널 연결 대기 시간 초과 - 브로드캐스트 스킵')
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
            isMuted,
            isVideoOff,
            joinedAt: Date.now(),
          })
            
          // peer-joined 브로드캐스트
          await unifiedChannelRef.current.broadcast('peer:join', {
            peerId: id,
            memberId,
            isHost,
            isMuted,
            isVideoOff,
          })
            
            // 시청자 입장 시 시스템 메시지 전송 (호스트가 아닌 경우)
            if (!isHost) {
              try {
                // 사용자 이름 조회
                const { data: memberData } = await (supabase.from('members') as any)
                  .select('name')
                  .eq('id', memberId)
                  .single()
                
                if (memberData?.name) {
                  // 최근 5분 안에 같은 사용자가 같은 방에 입장 메시지를 보냈는지 확인
                  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
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
                }
                }
              } catch (error) {
                // 시스템 메시지 전송 실패 무시
              }
            }
          }
      })
      
      peerInstance.on('call', handleIncomingCall)
      
      peerInstance.on('disconnected', () => {
        stopKeepAlive()
        setTimeout(() => {
          if (peerRef.current && !peerRef.current.destroyed && peerRef.current.disconnected) {
            try {
              peerRef.current.reconnect()
              startKeepAlive(peerRef.current)
            } catch {
              // 재연결 실패
            }
          }
        }, 2000)
      })
      
      peerInstance.on('error', (err: any) => {
        if (err.type === 'peer-unavailable' || err.type === 'network') return
        
        if (err.type === 'unavailable-id') {
          try { peerInstance.destroy() } catch { /* 무시 */ }
          isConnectingRef.current = false
          setIsConnecting(false)
          setIsConnected(false)
          setTimeout(() => {
            if (currentRoomIdRef.current === roomId) {
              connect(roomId, memberId, isHost)
            }
          }, 2000)
          return
        }
        
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
      setError(err instanceof Error ? err.message : '연결 실패')
      isConnectingRef.current = false
      setIsConnecting(false)
    }
  }, [isConnected, handleIncomingCall, connectToPeer, isMuted, isVideoOff, createBlackVideoTrack, createSilentAudioTrack, startKeepAlive, startTurnRefresh, stopKeepAlive, stopAudio])

  // ========== 연결 해제 ==========
  const disconnect = useCallback(() => {
    if (unifiedChannelRef.current.isConnected && peerRef.current) {
      const memberId = extractMemberIdFromPeerId(peerRef.current.id || '') || user?.id
      // peer-left 브로드캐스트 전송 (통합 채널 사용)
      if (unifiedChannelRef.current.isConnected && peerRef.current) {
        unifiedChannelRef.current.broadcast('peer:leave', {
          peerId: peerRef.current.id,
          memberId,
        }).catch(() => {
          // 브로드캐스트 실패 무시
        })
      }
    }
    
    stopAllAudio()
    stopKeepAlive()
    stopTurnRefresh()
    
    peersRef.current.forEach((peerConn) => {
      if (peerConn.stream) {
        peerConn.stream.getTracks().forEach(track => track.stop())
      }
      peerConn.connection.close()
    })
    peersRef.current.clear()
    setPeers(new Map())
    
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
      localStreamRef.current = null
    }
    setLocalStream(null)
    
    if (peerRef.current) {
      peerRef.current.destroy()
      peerRef.current = null
    }
    
    // 반전 리소스 정리
    if (flipAnimationRef.current) {
      cancelAnimationFrame(flipAnimationRef.current)
      flipAnimationRef.current = null
    }
    if (flipCanvasRef.current) {
      flipCanvasRef.current.remove()
      flipCanvasRef.current = null
    }
    if (flipVideoRef.current) {
      flipVideoRef.current.pause()
      flipVideoRef.current.srcObject = null
      flipVideoRef.current.remove()
      flipVideoRef.current = null
    }
    
    sessionIdRef.current = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    clearSession()
    
    isConnectingRef.current = false
    setIsConnected(false)
    setIsConnecting(false)
    setIsMuted(false)
    setIsVideoOff(false)
    setIsScreenSharing(false)
    setHasCamera(false)
    setIsFlipped(false)
    cameraStreamRef.current = null
    screenStreamRef.current = null
    originalVideoTrackRef.current = null
    flippedVideoTrackRef.current = null
    currentRoomIdRef.current = null
    setCurrentRoomId(null)
    isHostRef.current = false
  }, [stopAllAudio, stopKeepAlive, stopTurnRefresh, user?.id])

  // ========== 마이크 토글 ==========
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        const newMutedState = !audioTrack.enabled
        setIsMuted(newMutedState)
        
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
  }, [])

  // ========== 반전 리소스 정리 ==========
  const cleanupFlipResources = useCallback(() => {
    if (flipAnimationRef.current) {
      cancelAnimationFrame(flipAnimationRef.current)
      flipAnimationRef.current = null
    }
    if (flipCanvasRef.current) {
      flipCanvasRef.current.remove()
      flipCanvasRef.current = null
    }
    if (flipVideoRef.current) {
      flipVideoRef.current.pause()
      flipVideoRef.current.srcObject = null
      flipVideoRef.current.remove()
      flipVideoRef.current = null
    }
  }, [])

  // ========== 좌우 반전 적용 ==========
  const applyFlip = useCallback((videoTrack: MediaStreamTrack, shouldFlip: boolean): MediaStreamTrack | null => {
    if (shouldFlip) {
      cleanupFlipResources()
      originalVideoTrackRef.current = videoTrack
      
      const canvas = document.createElement('canvas')
      const settings = videoTrack.getSettings()
      canvas.width = settings.width || 1280
      canvas.height = settings.height || 720
      canvas.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;'
      document.body.appendChild(canvas)
      flipCanvasRef.current = canvas
      
      const ctx = canvas.getContext('2d')
      if (!ctx) return null
      
      const video = document.createElement('video')
      video.autoplay = true
      video.playsInline = true
      video.muted = true
      video.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none;'
      video.srcObject = new MediaStream([videoTrack])
      document.body.appendChild(video)
      flipVideoRef.current = video
      
      let isDrawing = true
      const drawFlipped = () => {
        if (!isDrawing || !flipCanvasRef.current || !flipVideoRef.current) return
        const videoEl = flipVideoRef.current
        if (videoEl.readyState >= videoEl.HAVE_CURRENT_DATA) {
          ctx.save()
          ctx.translate(canvas.width, 0)
          ctx.scale(-1, 1)
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height)
          ctx.restore()
        }
        flipAnimationRef.current = requestAnimationFrame(drawFlipped)
      }
      
      video.onloadedmetadata = () => {
        if (video.videoWidth > 0) {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
        }
        video.play().then(() => drawFlipped()).catch(() => drawFlipped())
      }
      
      const flippedStream = canvas.captureStream(30)
      const flippedTrack = flippedStream.getVideoTracks()[0]
      if (!flippedTrack) {
        cleanupFlipResources()
        return null
      }
      
      flippedVideoTrackRef.current = flippedTrack
      
      if (localStreamRef.current) {
        localStreamRef.current.removeTrack(videoTrack)
        localStreamRef.current.addTrack(flippedTrack)
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()))
      }
      
      replaceVideoTrack(flippedTrack)
      
      flippedTrack.onended = () => {
        isDrawing = false
        cleanupFlipResources()
      }
      videoTrack.onended = () => flippedTrack.stop()
      
      return flippedTrack
    } else {
      cleanupFlipResources()
      
      const originalTrack = originalVideoTrackRef.current
      const flippedTrack = flippedVideoTrackRef.current
      
      if (originalTrack && originalTrack.readyState === 'live' && localStreamRef.current) {
        if (flippedTrack) {
          flippedTrack.stop()
          localStreamRef.current.removeTrack(flippedTrack)
        }
        
        localStreamRef.current.addTrack(originalTrack)
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()))
        replaceVideoTrack(originalTrack)
        
        const result = originalTrack
        originalVideoTrackRef.current = null
        flippedVideoTrackRef.current = null
        return result
      }
      
      originalVideoTrackRef.current = null
      flippedVideoTrackRef.current = null
      return null
    }
  }, [cleanupFlipResources, replaceVideoTrack])

  // ========== 비디오 토글 ==========
  const toggleVideo = useCallback(async () => {
    if (!isHostRef.current || !localStreamRef.current) return
    
    if (hasCamera) {
      // 카메라 끄기
      cleanupFlipResources()
      setIsFlipped(false)
      originalVideoTrackRef.current = null
      flippedVideoTrackRef.current = null
      
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getVideoTracks().forEach(t => t.stop())
        cameraStreamRef.current = null
      }
      
      localStreamRef.current.getVideoTracks().forEach(t => {
        t.stop()
        localStreamRef.current?.removeTrack(t)
      })
      
      setHasCamera(false)
      
      // 검정화면 트랙 생성
      const blackTrack = createBlackVideoTrack()
      localStreamRef.current.addTrack(blackTrack)
      replaceVideoTrack(blackTrack)
      
      setIsVideoOff(false)
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()))
      
      // 통합 채널로 비디오 상태 브로드캐스트
      if (unifiedChannelRef.current.isConnected && peerRef.current) {
        unifiedChannelRef.current.broadcast('peer:video-status', {
          peerId: peerRef.current.id,
          memberId: user?.id || '',
          isVideoOff: true,
        })
      }
    } else {
      // 카메라 켜기
      if (isScreenSharing) {
        disallowScreenSharing()
        localStreamRef.current.getVideoTracks().forEach(t => {
          t.stop()
          localStreamRef.current?.removeTrack(t)
        })
        setIsScreenSharing(false)
        screenStreamRef.current = null
      }
      
      try {
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
        const videoConstraints = isMobile
          ? { facingMode }
          : { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
        
        const cameraStream = await safeGetUserMedia({ video: videoConstraints })
        cameraStreamRef.current = cameraStream
        const cameraTrack = cameraStream.getVideoTracks()[0]
        if (!cameraTrack) throw new Error('카메라 트랙을 찾을 수 없습니다')
        
        localStreamRef.current.getVideoTracks().forEach(t => {
          t.stop()
          localStreamRef.current?.removeTrack(t)
        })
        
        localStreamRef.current.addTrack(cameraTrack)
        replaceVideoTrack(cameraTrack)
        
        setHasCamera(true)
        setIsVideoOff(false)
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()))
        
        // 통합 채널로 비디오 상태 브로드캐스트
        if (unifiedChannelRef.current.isConnected && peerRef.current) {
          unifiedChannelRef.current.broadcast('peer:video-status', {
            peerId: peerRef.current.id,
            memberId: user?.id || '',
            isVideoOff: false,
          })
        }
      } catch (error) {
        setHasCamera(false)
        setIsVideoOff(true)
      }
    }
  }, [hasCamera, facingMode, isScreenSharing, cleanupFlipResources, replaceVideoTrack, createBlackVideoTrack])

  // ========== 화면 공유 ==========
  const stopScreenShare = useCallback(async () => {
    disallowScreenSharing()
    
    if (!localStreamRef.current) {
      setIsScreenSharing(false)
      screenStreamRef.current = null
      return
    }
    
    localStreamRef.current.getVideoTracks().forEach(t => {
      t.stop()
      localStreamRef.current?.removeTrack(t)
    })
    
    // 시스템 오디오 정리
    localStreamRef.current.getAudioTracks()
      .filter(t => t.label.toLowerCase().includes('screen') || t.label.toLowerCase().includes('system'))
      .forEach(t => {
        t.stop()
        localStreamRef.current?.removeTrack(t)
      })
    
    setIsScreenSharing(false)
    screenStreamRef.current = null
    
    // 검정화면으로 복귀
    if (isHostRef.current && localStreamRef.current) {
      const blackTrack = createBlackVideoTrack()
      localStreamRef.current.addTrack(blackTrack)
      replaceVideoTrack(blackTrack)
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()))
    }
  }, [createBlackVideoTrack, replaceVideoTrack])

  const startScreenShare = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      throw new Error('화면 공유를 지원하지 않는 브라우저입니다.')
    }
    
    if (hasCamera) {
      cleanupFlipResources()
      if (cameraStreamRef.current) {
        cameraStreamRef.current.getVideoTracks().forEach(t => t.stop())
        cameraStreamRef.current = null
      }
      setHasCamera(false)
      setIsFlipped(false)
    }
    
    try {
      allowScreenSharing()
      await new Promise(resolve => setTimeout(resolve, 10))
      
      // 화면 공유 성능 최적화: 해상도 및 프레임레이트 제한 (540p, 20fps)
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { 
          displaySurface: 'monitor' as any,
          // 성능 최적화: 540p 해상도 (960x540), 프레임레이트 20fps로 제한
          width: { ideal: 960, max: 960 },
          height: { ideal: 540, max: 540 },
          frameRate: { ideal: 20, max: 20 },
        },
        audio: { echoCancellation: false, noiseSuppression: false } as any,
      })
      
      if (!localStreamRef.current) {
        const audioStream = await safeGetUserMedia({ audio: true })
        localStreamRef.current = new MediaStream()
        audioStream.getAudioTracks().forEach(track => localStreamRef.current?.addTrack(track))
      }
      
      localStreamRef.current.getVideoTracks().forEach(t => {
        t.stop()
        localStreamRef.current?.removeTrack(t)
      })
      
      const screenVideoTrack = screenStream.getVideoTracks()[0]
      if (!screenVideoTrack) throw new Error('화면 공유 비디오 트랙을 가져올 수 없습니다')
      
      // 비디오 트랙에 직접 제약 조건 적용 (추가 최적화)
      screenVideoTrack.applyConstraints({
        width: { ideal: 960, max: 960 },
        height: { ideal: 540, max: 540 },
        frameRate: { ideal: 20, max: 20 },
      }).catch(() => {
        // 제약 조건 적용 실패는 무시 (일부 브라우저에서 지원하지 않을 수 있음)
      })
      
      screenStreamRef.current = screenStream
      localStreamRef.current.addTrack(screenVideoTrack)
      
      // 시스템 오디오 추가
      screenStream.getAudioTracks().forEach(track => {
        localStreamRef.current?.addTrack(track)
      })
      
      setIsScreenSharing(true)
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()))
      replaceVideoTrack(screenVideoTrack)
      
      screenVideoTrack.onended = () => stopScreenShare()
      } catch (error) {
        setIsScreenSharing(false)
      disallowScreenSharing()
      throw error
    }
  }, [hasCamera, cleanupFlipResources, replaceVideoTrack, stopScreenShare])

  // ========== 카메라 전환 ==========
  const switchCamera = useCallback(async () => {
    if (isScreenSharing || !hasCamera || !localStreamRef.current) return
    
    cleanupFlipResources()
    setIsFlipped(false)
    originalVideoTrackRef.current = null
    flippedVideoTrackRef.current = null
    
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(newFacingMode)
    
    localStreamRef.current.getVideoTracks().forEach(t => {
      t.stop()
      localStreamRef.current?.removeTrack(t)
    })
    
    try {
      const cameraStream = await safeGetUserMedia({
        video: { facingMode: newFacingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
      })
      const newTrack = cameraStream.getVideoTracks()[0]
      localStreamRef.current.addTrack(newTrack)
      cameraStreamRef.current = cameraStream
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()))
      replaceVideoTrack(newTrack)
    } catch (error) {
      // 카메라 전환 실패 무시
    }
  }, [facingMode, isScreenSharing, hasCamera, cleanupFlipResources, replaceVideoTrack])

  // ========== 호스트 영상 토글 ==========
  const toggleHostVideo = useCallback((hide: boolean) => {
    if (!isHostRef.current || !localStreamRef.current) return
    
    const videoTrack = localStreamRef.current.getVideoTracks()[0]
    if (videoTrack) {
      videoTrack.enabled = !hide
      setIsVideoOff(hide)
      
      // 통합 채널로 비디오 상태 브로드캐스트
      if (unifiedChannelRef.current.isConnected && peerRef.current) {
        unifiedChannelRef.current.broadcast('peer:video-status', {
          peerId: peerRef.current.id,
          memberId: user?.id || '',
          isVideoOff: hide,
        })
      }
    }
  }, [])

  // ========== 좌우 반전 토글 ==========
  const toggleFlip = useCallback(() => {
    if (!isHostRef.current || !localStreamRef.current || !hasCamera) return
    
    const newFlipState = !isFlipped
    let targetTrack: MediaStreamTrack | null = null
    
    if (isFlipped && originalVideoTrackRef.current) {
      targetTrack = originalVideoTrackRef.current
    } else if (!isFlipped && cameraStreamRef.current) {
      targetTrack = cameraStreamRef.current.getVideoTracks()[0]
    }
    
    if (!targetTrack || targetTrack.readyState !== 'live') return
    
    setIsFlipped(newFlipState)
    applyFlip(targetTrack, newFlipState)
  }, [isFlipped, hasCamera, applyFlip])

  // ========== PIP ==========
  const enterPIP = useCallback(async () => {
    if (!pipVideoRef.current) {
      const video = document.createElement('video')
      video.id = 'pip-video'
      video.autoplay = true
      video.playsInline = true
      video.muted = false
      video.style.cssText = 'position:fixed;bottom:20px;right:20px;width:200px;height:150px;z-index:9999;border-radius:8px;'
      
      const firstPeer = Array.from(peersRef.current.values())[0]
      if (firstPeer?.stream) {
        video.srcObject = firstPeer.stream
        document.body.appendChild(video)
        pipVideoRef.current = video
      } else {
        return
      }
    }
    
    try {
      if (pipVideoRef.current && 'requestPictureInPicture' in pipVideoRef.current) {
        await (pipVideoRef.current as any).requestPictureInPicture()
      }
    } catch (error) {
      // PIP 진입 실패 무시
    }
  }, [])

  const exitPIP = useCallback(async () => {
    if (document.pictureInPictureElement) {
      try { await document.exitPictureInPicture() } catch { /* 무시 */ }
    }
    if (pipVideoRef.current) {
      pipVideoRef.current.remove()
      pipVideoRef.current = null
    }
  }, [])

  // ========== 자동 재연결 ==========
  useEffect(() => {
    if (!user?.id) return
    
    const session = loadSession()
    if (!session) return
    
    if (session.memberId !== user.id) {
      clearSession()
      return
    }
    
    sessionIdRef.current = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    currentRoomIdRef.current = session.roomId
    setCurrentRoomId(session.roomId)
    
    setTimeout(() => {
      connect(session.roomId, session.memberId, false)
    }, 1500)
  }, [user?.id, connect])

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
    tokenIntervalRef.current = setInterval(updateAuthToken, 5 * 60 * 1000)
    
    return () => {
      if (tokenIntervalRef.current) {
        clearInterval(tokenIntervalRef.current)
        tokenIntervalRef.current = null
      }
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
        const isHost = isHostRef.current
        
        // 빠른 cleanup 수행
        try {
          disconnectRef.current()
        } catch (error) {
          console.error('❌ [VideoRoom] unload 시 disconnect 실패:', error)
        }
        
        // 시청자인 경우 leaveRoom API 호출 (keepalive 옵션 사용)
        if (roomId && !isHost && user?.id && authTokenRef.current) {
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
        const isHost = isHostRef.current
        
        // 모바일에서 페이지가 숨겨질 때 (앱 전환, 기기 꺼짐 등)
        try {
          disconnectRef.current()
        } catch (error) {
          // disconnect 실패 무시
        }
        
        // 시청자인 경우 leaveRoom API 호출 (keepalive 옵션 사용)
        if (roomId && !isHost && user?.id && authTokenRef.current) {
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
      if (tokenIntervalRef.current) {
        clearInterval(tokenIntervalRef.current)
        tokenIntervalRef.current = null
      }
      window.removeEventListener('beforeunload', handleBeforeUnload)
      window.removeEventListener('unload', handleUnload)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [isConnected, user?.id])

  // ========== 네트워크 전환 감지 (WiFi ↔ LTE 등) ==========
  useEffect(() => {
    const handleOnline = () => {
      // 연결이 끊어진 상태면 재연결 시도
      if (peerRef.current?.disconnected && currentRoomIdRef.current) {
        try {
          peerRef.current.reconnect()
        } catch (error) {
          // 재연결 실패 무시
        }
      }
    }

    const handleOffline = () => {
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
    return () => { disconnect() }
  }, [disconnect])

  const value: VideoRoomContextType = {
    isConnected,
    isConnecting,
    error,
    currentRoomId,
    localStream,
    isMuted,
    isVideoOff,
    isScreenSharing,
    hasCamera,
    facingMode,
    isFlipped,
    peers,
    connect,
    disconnect,
    toggleMute,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    switchCamera,
    toggleHostVideo,
    toggleFlip,
    enterPIP,
    exitPIP,
  }

  return (
    <VideoRoomContext.Provider value={value}>
      {children}
    </VideoRoomContext.Provider>
  )
}

// ========== Hook ==========

export function useVideoRoomConnection() {
  const context = useContext(VideoRoomContext)
  if (!context) {
    throw new Error('useVideoRoomConnection must be used within VideoRoomProvider')
  }
  return context
}
