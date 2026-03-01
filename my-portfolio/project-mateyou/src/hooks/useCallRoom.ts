import { useEffect, useRef, useState } from 'react'
import Peer from 'peerjs'
import type { MediaConnection, PeerJSOption } from 'peerjs'
import { supabase } from '@/lib/supabase'
import { mateYouApi } from '@/lib/apiClient'
import { AudioDelayProcessor } from '@/utils/audioDelay'
import { generateTurnCredentials } from '@/utils/turnAuth'
import {
  playRemoteAudio as playRemoteAudioUtil,
  resumeAudioContext,
  logAndroidDebugInfo
} from '@/utils/audioUtils'
import { safeGetUserMedia } from '@/lib/utils'

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

interface SupabaseError {
  code?: string
  message?: string
  details?: string
}

function isSupabaseError(error: unknown): error is SupabaseError {
  return typeof error === 'object' && error !== null && 'code' in error
}

// CallParticipant 인터페이스는 향후 확장 시 사용

type UserRole = 'normal' | 'partner' | 'admin'

const CALL_ID_REQUIRED_ERROR = 'CALL_ID_REQUIRED' as const

export function useCallRoom(
  currentUserId: string,
  partnerId: string,
  currentUserRole?: UserRole,
  callId?: string | null, // call_id 매개변수 추가
) {
  const [peer, setPeer] = useState<Peer | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [callState, setCallState] = useState<
    'idle' | 'calling' | 'receiving' | 'connected'
  >('idle')
  const [isVideoCall] = useState(false) // 음성 통화만 지원
  const [currentRoom, setCurrentRoom] = useState<CallRoom | null>(null)
  const [participantId, setParticipantId] = useState<string | null>(null)

  const peerRef = useRef<Peer | null>(null)
  const mediaConnectionRef = useRef<MediaConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const currentRoomRef = useRef<CallRoom | null>(null)

  const normalizedCallId = callId?.trim() || null

  // 딜레이 관련 상태
  const [audioDelayEnabled, setAudioDelayEnabled] = useState<boolean>(false)
  const [delayTime, setDelayTime] = useState<number>(1.0) // 기본 1초
  const audioDelayProcessor = useRef<AudioDelayProcessor | null>(null)

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)
  const keepAliveTimerRef = useRef<NodeJS.Timeout | null>(null) // PeerJS 연결 유지 (20초 ping)
  const turnRefreshTimerRef = useRef<NodeJS.Timeout | null>(null) // TURN 인증 갱신 (1시간)

  // ✅ HMAC 기반 동적 TURN 인증 (1시간 자동 갱신)
  const { username, credential } = generateTurnCredentials(
    import.meta.env.VITE_TURN_SECRET_KEY || 'default-secret-key'
  )

  const peerServerOptions: PeerJSOption = {
    host: 'peer01.mateyou.me',
    port: 443,
    secure: true,
    path: '/myapp',
    key: import.meta.env.VITE_PEERJS_API_KEY || 'mateyou-prod',
    debug: 2,
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

  const buildPeerId = (roomId: string, ownerId: string) => `${roomId}-${ownerId}`

  // 🎤 마이크 장치 변경 시 자동 복구 (통화 끊김 방지)
  const recoverMic = async () => {
    try {
      console.log('🔄 마이크 장치 변경 감지 - 자동 복구 시작')

      // 기존 스트림 정리
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop())
      }

      // 새로운 스트림 획득 (Android WebView 호환)
      const newStream = await safeGetUserMedia({ audio: true, video: false })
      const newTrack = newStream.getAudioTracks()[0]

      if (!newTrack) {
        console.error('❌ 새 마이크 트랙을 가져올 수 없습니다')
        return
      }

      // PeerJS MediaConnection에서 RTCPeerConnection 접근
      const peerConnection = mediaConnectionRef.current?.peerConnection
      if (!peerConnection) {
        console.warn('⚠️ PeerConnection을 찾을 수 없습니다')
        return
      }

      // 오디오 sender 찾기
      const sender = peerConnection
        .getSenders()
        .find(s => s.track?.kind === 'audio')

      if (sender && newTrack) {
        // 트랙만 교체 (통화 유지)
        await sender.replaceTrack(newTrack)

        // 스트림 참조 업데이트
        localStreamRef.current = newStream
        setStream(newStream)

        console.log('✅ 마이크 트랙 교체 완료 (통화 유지)')
      } else {
        console.warn('⚠️ Audio sender를 찾을 수 없습니다')
      }
    } catch (error) {
      console.error('❌ 마이크 복구 실패:', error)
    }
  }

  const cleanupStreams = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop())
      localStreamRef.current = null
    }
    setStream(null)

    if (remoteStream) {
      setRemoteStream(null)
    }

    if (audioDelayProcessor.current) {
      audioDelayProcessor.current.dispose()
      audioDelayProcessor.current = null
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause()
      remoteAudioRef.current.srcObject = null
      if (remoteAudioRef.current.parentNode) {
        remoteAudioRef.current.parentNode.removeChild(remoteAudioRef.current)
      }
      remoteAudioRef.current = null
    }
  }

  const cleanupPeer = () => {
    if (mediaConnectionRef.current) {
      mediaConnectionRef.current.close()
      mediaConnectionRef.current = null
    }

    if (peerRef.current) {
      peerRef.current.destroy()
      peerRef.current = null
    }

    setPeer(null)
  }

  const resolveParticipantMeta = async () => {
    const trimmedPartnerId = partnerId?.trim()
    const trimmedCurrentUserId = currentUserId?.trim()

    const memberIdsToCheck = new Set<string>()
    if (trimmedPartnerId) memberIdsToCheck.add(trimmedPartnerId)
    if (currentUserRole === 'partner' && trimmedCurrentUserId) {
      memberIdsToCheck.add(trimmedCurrentUserId)
    }

    let resolvedPartnerRecordId: string | null = null

    if (memberIdsToCheck.size > 0) {
      const { data: partnerRecords, error: partnerLookupError } = await supabase
        .from('partners')
        .select('id, member_id')
        .in('member_id', Array.from(memberIdsToCheck))

      if (partnerLookupError) throw partnerLookupError

      resolvedPartnerRecordId =
        partnerRecords?.find((record) => record.member_id === trimmedPartnerId)
          ?.id ??
        partnerRecords?.find(
          (record) => record.member_id === trimmedCurrentUserId,
        )?.id ??
        null
    }

    const memberParticipantId =
      currentUserRole === 'partner'
        ? trimmedPartnerId || null
        : trimmedCurrentUserId || null

    return {
      partnerRecordId: resolvedPartnerRecordId,
      memberParticipantId,
    }
  }

  // 통화방 생성
  const createCallRoom = async (isVideo: boolean, topic?: string) => {
    try {
      if (!normalizedCallId) {
        throw new Error(CALL_ID_REQUIRED_ERROR)
      }

      const roomCode = normalizedCallId
      const { partnerRecordId, memberParticipantId } =
        await resolveParticipantMeta()

      const { data: room, error } = await supabase
        .from('call_rooms')
        .insert({
          room_code: roomCode,
          status: 'waiting',
          member_id: memberParticipantId,
          partner_id: partnerRecordId,
          topic: topic || (isVideo ? '화상 통화' : '음성 통화'),
        })
        .select()
        .single()

      if (error) throw error

      setCurrentRoom(room)
      currentRoomRef.current = room
      return room
    } catch (error) {
      throw error
    }
  }

  // 통화방 참여
  const joinCallRoom = async (roomId: string) => {
    try {
      const deviceInfo = {
        browser: navigator.userAgent.includes('Chrome') ? 'Chrome' : 'Other',
        os: navigator.platform,
        timestamp: new Date().toISOString(),
      }

      const { data: participant, error } = await supabase
        .from('call_participants')
        .insert({
          room_id: roomId,
          member_id: currentUserId,
          device_info: deviceInfo,
          connection_quality: 'good',
        })
        .select()
        .single()

      if (error) throw error

      setParticipantId(participant.id)
      return participant
    } catch (error) {
      throw error
    }
  }

  // 통화방 상태 업데이트
  const updateRoomStatus = async (
    roomId: string,
    status: CallRoom['status'],
  ) => {
    try {
      const updateData: any = { status }

      if (status === 'in_call') {
        updateData.started_at = new Date().toISOString()
      } else if (status === 'ended') {
        updateData.ended_at = new Date().toISOString()
      }

      const { error } = await supabase
        .from('call_rooms')
        .update(updateData)
        .eq('id', roomId)

      if (error) throw error
    } catch (error) {
      // Silent error handling
    }
  }

  // 파트너 상태 업데이트
  const updatePartnerStatus = async (
    status: 'online' | 'offline' | 'matching' | 'in_game',
  ) => {
    try {
      // 현재 사용자가 파트너인 경우에만 상태 업데이트
      if (currentUserRole === 'partner') {
        const { error } = await supabase
          .from('members')
          .update({ current_status: status })
          .eq('id', currentUserId)

        if (error) throw error
      }

      // 상대방이 파트너인 경우 상태 업데이트 - Express API 사용
      const response = await mateYouApi.partners.getPartnerIdByMemberId(partnerId)

      if (response.data.success && response.data.data && typeof response.data.data === 'object' && 'id' in response.data.data) {
        const { error } = await supabase
          .from('members')
          .update({ current_status: status })
          .eq('id', partnerId)

        if (error) throw error
      }
    } catch (error) {
      console.error('파트너 상태 업데이트 실패:', error)
    }
  }

  // 딜레이 처리된 스트림 생성
  const createDelayedStream = async (
    originalStream: MediaStream,
  ): Promise<MediaStream> => {
    if (!audioDelayEnabled || delayTime <= 0) {
      return originalStream
    }

    try {
      if (audioDelayProcessor.current) {
        audioDelayProcessor.current.dispose()
      }

      audioDelayProcessor.current = new AudioDelayProcessor(delayTime)
      return await audioDelayProcessor.current.createDelayedStream(
        originalStream,
      )
    } catch (error) {
      console.error('Failed to create delayed stream:', error)
      return originalStream
    }
  }

  // 원격 오디오 재생 (Android/iOS 최적화)
  const playRemoteAudio = async (stream: MediaStream) => {
    try {
      // 🎤 Android/iOS 최적화된 오디오 재생 유틸 사용
      await playRemoteAudioUtil(stream)
    } catch (error) {
      console.error('Failed to setup remote audio:', error)
    }
  }

  const attachMediaConnectionHandlers = (
    connection: MediaConnection,
    roomId?: string,
  ) => {
    mediaConnectionRef.current = connection

    connection.on('stream', async (remote) => {
      setRemoteStream(remote)
      setCallState('connected')

      const targetRoomId = roomId || currentRoomRef.current?.id
      if (targetRoomId) {
        await updateRoomStatus(targetRoomId, 'in_call')
      }
      await updatePartnerStatus('in_game')
    })

    connection.on('close', () => {
      mediaConnectionRef.current = null
    })

    connection.on('error', (error) => {
      console.error('Media connection error:', error)
      endCall()
    })
  }

  // ✅ PeerJS 연결 유지 (20초마다 ping - 끊김 방지)
  const startKeepAlive = (peerInstance: Peer) => {
    stopKeepAlive() // 기존 타이머 정리

    keepAliveTimerRef.current = setInterval(() => {
      try {
        // PeerJS socket이 열려있는지 확인
        if (peerInstance && peerInstance.socket && (peerInstance.socket as any)._wsOpen?.()) {
          (peerInstance.socket as any).send({ type: 'ping' })
          console.log('🏓 PeerJS ping sent')
        }
      } catch (error) {
        console.warn('⚠️ KeepAlive ping 실패:', error)
      }
    }, 20000) // 20초
  }

  const stopKeepAlive = () => {
    if (keepAliveTimerRef.current) {
      clearInterval(keepAliveTimerRef.current)
      keepAliveTimerRef.current = null
    }
  }

  // ✅ TURN 인증 자동 갱신 (1시간마다)
  const startTurnRefresh = (peerInstance: Peer) => {
    stopTurnRefresh() // 기존 타이머 정리

    turnRefreshTimerRef.current = setInterval(() => {
      try {
        const { username: newUsername, credential: newCredential } = generateTurnCredentials(
          import.meta.env.VITE_TURN_SECRET_KEY || 'default-secret-key'
        )

        // PeerJS 내부 config 업데이트
        const config = (peerInstance as any)._options?.config
        if (config && config.iceServers) {
          config.iceServers.forEach((server: RTCIceServer) => {
            if (server.urls && typeof server.urls === 'string' && server.urls.includes('turn')) {
              server.username = newUsername
              server.credential = newCredential
            }
          })
          console.log('🔄 TURN 인증 갱신 완료')
        }
      } catch (error) {
        console.warn('⚠️ TURN 인증 갱신 실패:', error)
      }
    }, 3600 * 1000) // 1시간
  }

  const stopTurnRefresh = () => {
    if (turnRefreshTimerRef.current) {
      clearInterval(turnRefreshTimerRef.current)
      turnRefreshTimerRef.current = null
    }
  }

  const createPeerInstance = (peerId: string) => {
    const peerInstance = new Peer(peerId, peerServerOptions)

    // ✅ 연결 유지 타이머 시작
    startKeepAlive(peerInstance)
    startTurnRefresh(peerInstance)

    // ✅ 자동 재연결 로직
    peerInstance.on('disconnected', () => {
      console.warn('⚠️ Peer disconnected... retrying reconnection')
      stopKeepAlive() // 재연결 전 타이머 정리

      setTimeout(() => {
        try {
          peerInstance.reconnect()
          console.log('🔄 Peer reconnection attempted')
          // 재연결 성공 시 타이머 재시작
          startKeepAlive(peerInstance)
        } catch (error) {
          console.error('❌ Peer reconnection failed:', error)
        }
      }, 2000)
    })

    peerInstance.on('call', (incomingCall) => {
      console.log('📞 Incoming PeerJS call', { from: incomingCall.peer })
      if (!localStreamRef.current) {
        console.warn('로컬 스트림이 없어 수신한 통화를 처리할 수 없습니다.')
        return
      }

      incomingCall.answer(localStreamRef.current)
      attachMediaConnectionHandlers(
        incomingCall,
        currentRoomRef.current?.id || undefined,
      )
    })

    peerInstance.on('error', (error) => {
      console.error('Peer error:', error)
      setCallState('idle')
    })

    peerInstance.on('close', () => {
      console.log('🔌 Peer connection closed')
      // 타이머 정리
      stopKeepAlive()
      stopTurnRefresh()
      cleanupPeer()
    })

    return peerInstance
  }

  // 딜레이 설정 변경
  const updateDelaySettings = (
    enabled: boolean,
    timeSeconds: number = delayTime,
  ) => {
    setAudioDelayEnabled(enabled)
    setDelayTime(timeSeconds)

    if (audioDelayProcessor.current) {
      audioDelayProcessor.current.setEnabled(enabled)
      audioDelayProcessor.current.setDelayTime(timeSeconds)
    }
  }

  // 참여자 퇴장 처리
  const leaveCallRoom = async () => {
    if (!participantId) return

    try {
      const { error } = await supabase
        .from('call_participants')
        .update({
          left_at: new Date().toISOString(),
          connection_quality: 'disconnected',
        })
        .eq('id', participantId)

      if (error) throw error
    } catch (error) {
      // Silent error handling
    }
  }

  // 기존 통화방 찾기 또는 생성
  const findOrCreateCallRoom = async (isVideo: boolean, topic?: string) => {
    if (!normalizedCallId) {
      throw new Error(CALL_ID_REQUIRED_ERROR)
    }

    // call_id가 있으면 기존 통화방 검색
    const { data: existingRoom, error: findError } = await supabase
      .from('call_rooms')
      .select('*')
      .eq('room_code', normalizedCallId)
      .single()

    if (!findError && existingRoom) {
      setCurrentRoom(existingRoom)
      currentRoomRef.current = existingRoom
      return existingRoom
    }

    // 기존 통화방이 없으면 새로 생성
    return await createCallRoom(isVideo, topic)
  }

  // 통화 시작
  const startCall = async (video = false, topic?: string) => {
    try {
      if (!normalizedCallId) {
        alert('통화 준비 중입니다. 잠시 후 다시 시도해주세요.')
        return
      }

      // 권한 요청 전 사용자 안내
      const userConfirm = confirm(
        '음성 통화를 시작하려면 마이크 접근 권한이 필요합니다.\n' +
          '브라우저에서 마이크 권한 요청이 나타나면 "허용"을 클릭해주세요.\n\n' +
          '계속하시겠습니까?',
      )

      if (!userConfirm) {
        return // 사용자가 취소한 경우
      }

      setCallState('calling')

      // 1. 통화방 찾기 또는 생성
      const room = await findOrCreateCallRoom(video, topic)

      // 2. 참여자 등록
      await joinCallRoom(room.id)

      // 3. 미디어 스트림 획득 (Android WebView 호환)
      const originalStream = await safeGetUserMedia({
        video,
        audio: true,
      })

      // 딜레이 처리 적용
      const processedStream = await createDelayedStream(originalStream)
      setStream(processedStream)
      localStreamRef.current = processedStream

      if (localVideoRef.current && video) {
        localVideoRef.current.srcObject = processedStream
      }

      const localPeerId = buildPeerId(room.id, currentUserId)
      const newPeer = createPeerInstance(localPeerId)
      peerRef.current = newPeer
      setPeer(newPeer)

      newPeer.on('open', async () => {
        await supabase
          .from('call_rooms')
          .update({
            last_signal_at: new Date().toISOString(),
          })
          .eq('id', room.id)

        const payload = {
          type: 'broadcast' as const,
          event: 'call-signal',
          payload: {
            type: 'call-request',
            peerId: localPeerId,
            video: false,
            from: currentUserId,
            to: partnerId,
            roomId: room.id,
            callId: normalizedCallId,
          },
        }

        await supabase.channel(`call-${room.id}`).send(payload)
        await supabase.channel(`incoming-calls-${partnerId}`).send(payload)
      })
    } catch (error) {
      console.error('startCall error', error)
      if (error instanceof Error && error.name === 'NotAllowedError') {
        alert(
          '마이크 권한이 거부되었습니다.\n\n' +
            '음성 통화를 사용하려면:\n' +
            '1. 브라우저 주소창 왼쪽의 🔒 아이콘을 클릭\n' +
            '2. 마이크 권한을 "허용"으로 변경\n' +
            '3. 페이지를 새로고침 후 다시 시도해주세요',
        )
      } else if (
        error instanceof Error &&
        error.message === CALL_ID_REQUIRED_ERROR
      ) {
        alert('통화 준비 중입니다. 잠시 후 다시 시도해주세요.')
      } else if (isSupabaseError(error)) {
        alert(
          '통화방을 생성하는 중 오류가 발생했습니다.\n' +
            '잠시 후 다시 시도해주세요.' +
            (error.message ? `\n\n오류 메시지: ${error.message}` : ''),
        )
      } else {
        alert(
          '마이크 접근 권한이 필요합니다. 브라우저 설정에서 마이크 권한을 허용해주세요.',
        )
      }
      setCallState('idle')
    }
  }

  // 통화 응답
  const answerCall = async (
    callerPeerId: string,
    video: boolean,
    roomId: string,
  ) => {
    try {
      // 권한 요청 전 사용자 안내
      const userConfirm = confirm(
        '통화를 받으려면 마이크 접근 권한이 필요합니다.\n' +
          '브라우저에서 마이크 권한 요청이 나타나면 "허용"을 클릭해주세요.\n\n' +
          '통화를 받으시겠습니까?',
      )

      if (!userConfirm) {
        return // 사용자가 취소한 경우
      }

      setCallState('receiving')

      // 1. 기존 통화방에 참여
      await joinCallRoom(roomId)

      // 2. 통화방 정보 조회
      const { data: room } = await supabase
        .from('call_rooms')
        .select('*')
        .eq('id', roomId)
        .single()

      if (room) {
        setCurrentRoom(room)
        currentRoomRef.current = room
      }

      // 3. 미디어 스트림 획득 (Android WebView 호환)
      const originalStream = await safeGetUserMedia({
        video,
        audio: true,
      })

      // 딜레이 처리 적용
      const processedStream = await createDelayedStream(originalStream)
      setStream(processedStream)
      localStreamRef.current = processedStream

      if (localVideoRef.current && video) {
        localVideoRef.current.srcObject = processedStream
      }

      const localPeerId = buildPeerId(roomId, currentUserId)
      const newPeer = createPeerInstance(localPeerId)
      peerRef.current = newPeer
      setPeer(newPeer)

      newPeer.on('open', async () => {
        const mediaCall = newPeer.call(callerPeerId, processedStream)
        if (mediaCall) {
          attachMediaConnectionHandlers(mediaCall, roomId)
        } else {
          console.error('미디어 연결을 생성하지 못했습니다.')
        }

        await supabase.channel(`call-${roomId}`).send({
          type: 'broadcast' as const,
          event: 'call-signal',
          payload: {
            type: 'call-answer',
            peerId: localPeerId,
            from: currentUserId,
            to: partnerId,
            roomId: roomId,
            callId: normalizedCallId,
          },
        })

        setCallState('calling')
      })
    } catch (error) {
      console.error('answerCall error', error)
      if (error instanceof Error && error.name === 'NotAllowedError') {
        alert(
          '마이크 권한이 거부되었습니다.\n\n' +
            '음성 통화를 사용하려면:\n' +
            '1. 브라우저 주소창 왼쪽의 🔒 아이콘을 클릭\n' +
            '2. 마이크 권한을 "허용"으로 변경\n' +
            '3. 페이지를 새로고침 후 다시 시도해주세요',
        )
      } else if (isSupabaseError(error)) {
        alert(
          '통화 연결 중 오류가 발생했습니다.\n' +
            '잠시 후 다시 시도해주세요.' +
            (error.message ? `\n\n오류 메시지: ${error.message}` : ''),
        )
      } else {
        alert(
          '마이크 접근 권한이 필요합니다. 브라우저 설정에서 마이크 권한을 허용해주세요.',
        )
      }
      setCallState('idle')
    }
  }

  // 통화 종료
  const endCall = async () => {
    cleanupPeer()
    cleanupStreams()
    setCallState('idle')

    const targetRoomId = currentRoomRef.current?.id || currentRoom?.id

    if (targetRoomId) {
      await updateRoomStatus(targetRoomId, 'ended')

      await supabase.channel(`call-${targetRoomId}`).send({
        type: 'broadcast',
        event: 'call-signal',
        payload: {
          type: 'call-end',
          from: currentUserId,
          roomId: targetRoomId,
        },
      })
    }

    await leaveCallRoom()

    // 파트너 상태를 온라인으로 복원
    await updatePartnerStatus('online')

    setCurrentRoom(null)
    currentRoomRef.current = null
    setParticipantId(null)
  }

  // 실시간 시그널 수신
  useEffect(() => {
    if (!currentRoom) return

    const channel = supabase.channel(`call-${currentRoom.id}`)

    channel.on('broadcast', { event: 'call-signal' }, (payload) => {
      const { type, from } = payload.payload

      if (from === currentUserId) return

      if (type === 'call-end') {
        endCall()
      }
    })

    channel.subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [currentRoom, currentUserId])

  // Android 디버그 정보 및 AudioContext 초기화
  useEffect(() => {
    logAndroidDebugInfo()

    const wakeUpAudioContext = async () => {
      try {
        await resumeAudioContext()
      } catch (err) {
        console.warn('AudioContext resume 실패:', err)
      }
    }

    document.addEventListener('click', wakeUpAudioContext)
    document.addEventListener('touchstart', wakeUpAudioContext)

    // ✅ PWA 화면 꺼짐 방지 - visibilitychange 시 ping 전송
    const handleVisibilityChange = () => {
      if (document.hidden && peerRef.current) {
        try {
          const peerSocket = (peerRef.current.socket as any)
          if (peerSocket && peerSocket._wsOpen?.()) {
            peerSocket.send({ type: 'ping' })
            console.log('📱 PWA visibility ping sent (화면 꺼짐 감지)')
          }
        } catch (error) {
          console.warn('⚠️ Visibility ping 실패:', error)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('click', wakeUpAudioContext)
      document.removeEventListener('touchstart', wakeUpAudioContext)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  // remoteStream 변경 시 오디오 재생
  useEffect(() => {
    if (remoteStream) {
      playRemoteAudio(remoteStream)
    }
  }, [remoteStream])

  // 🎤 마이크 장치 변경 감지 (통화 중일 때만)
  useEffect(() => {
    if (callState !== 'connected') return
    // Android WebView에서 navigator.mediaDevices가 없을 수 있음
    if (!navigator.mediaDevices) return

    const handleDeviceChange = () => {
      console.log('🔄 오디오 장치 변경 감지')
      recoverMic()
    }

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange)

    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange)
    }
  }, [callState])

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      cleanupPeer()
      cleanupStreams()
    }
  }, [])

  return {
    // 상태
    peer,
    stream,
    remoteStream,
    callState,
    isVideoCall,
    currentRoom,

    // 딜레이 관련 상태
    audioDelayEnabled,
    delayTime,

    // 참조
    localVideoRef,
    remoteVideoRef,

    // 액션
    startCall,
    answerCall,
    endCall,

    // 딜레이 관련 액션
    updateDelaySettings,
  }
}
