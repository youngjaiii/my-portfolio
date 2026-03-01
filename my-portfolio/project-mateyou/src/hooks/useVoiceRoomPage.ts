/**
 * useVoiceRoomPage - 보이스룸 페이지 비즈니스 로직
 * 
 * 입장 체크 플로우:
 * 1. 차단 체크 (useCheckBan 훅 사용)
 * 2. 구독자 전용방 구독 여부 확인 (useCheckSubscription 훅 사용)
 * 3. canJoin 계산 (차단 및 구독 체크 포함)
 * 4. 자동 입장 시도 (체크 완료 후)
 */

import { useVoiceRoomConnection } from '@/contexts/VoiceRoomProvider'
import { useAuth } from '@/hooks/useAuth'
import { useCheckSubscription } from '@/hooks/useCheckSubscription'
import { useStreamChat } from '@/hooks/useStreamChat'
import { useStreamHeartbeat } from '@/hooks/useStreamHeartbeat'
import { useCheckBan, type StreamBan } from '@/hooks/useStreamModeration'
import { useUnifiedStreamChannel } from '@/hooks/useUnifiedStreamChannel'
import { useViewerHeartbeat } from '@/hooks/useViewerHeartbeat'
import type { StreamHost } from '@/hooks/useVoiceRoom'
import { useRoomViewers, useVoiceRoom } from '@/hooks/useVoiceRoom'
import { resumeAudioContext } from '@/utils/audioUtils'
import { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

export function useVoiceRoomPage(roomId: string) {
  const navigate = useNavigate()
  const { user } = useAuth()
  
  // ========== 1. 훅 연결 ==========
  const voiceRoom = useVoiceRoom(roomId)
  const voiceConnection = useVoiceRoomConnection()
  
  const { inputValue, setInputValue, sendMessage: sendChatMessage } = useStreamChat({
    roomId,
    enableOptimisticUI: false,
  })

  // UI 상태
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [showRequestsPanel, setShowRequestsPanel] = useState(false)
  const [hasJoined, setHasJoined] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)

  const chatContainerRef = useRef<HTMLDivElement>(null)
  const connectAttemptRef = useRef(0)
  const maxConnectAttempts = 3
  const isMinimizedRef = useRef(false)
  const isHostRef = useRef(false)
  const isResigningRef = useRef(false)
  const isUpgradingToSpeakerRef = useRef(false)
  const currentRoomIdRef = useRef<string | null>(null)
  const isConnectedRef = useRef(false)
  const connectRef = useRef<typeof connect | null>(null)
  const roomIdRef = useRef(roomId)

  const { room, hosts, isHost, isSpeaker, joinRoom } = voiceRoom
  const { isConnected, isConnecting, isAutoReconnecting, isListenerMode, currentRoomId, connect, disconnect, stopMicrophone, isForceMuted, applyForceMute, clearForceMute } = voiceConnection
  
  const isAdmin = user?.role === 'admin'
  const { data: viewers = [] } = useRoomViewers(roomId, isHost || isAdmin)

  // ========== 2. 차단 체크 ==========
  const { data: banCheck, isLoading: banCheckLoading } = useCheckBan(
    user?.id,
    roomId,
    room?.host_partner?.id,
    room?.host_member_id
  )

  // ========== 3. 구독자 전용방 구독 여부 확인 ==========
  // host_partner_id를 직접 사용 (room?.host_partner?.id는 조인 데이터이므로 로드가 늦을 수 있음)
  const hostPartnerId = room?.host_partner_id || room?.host_partner?.id
  const accessType = room?.access_type
  
  const { isSubscribed, isChecking: subscriptionCheckLoading, error: subscriptionError } = useCheckSubscription({
    userId: user?.id,
    roomId,
    hostPartnerId,
    accessType,
  })

  // 호스트일 때 하트비트 전송
  useStreamHeartbeat({
    roomId,
    isHost,
    isLive: room?.status === 'live',
  })

  // 시청자일 때 Heartbeat 전송 (정확한 시청자 수 유지)
  useViewerHeartbeat({
    roomId,
    isViewer: !isHost && !isSpeaker && hasJoined,
    isLive: room?.status === 'live',
    isHost: false,
  })

  // ref 동기화
  useEffect(() => { connectRef.current = connect }, [connect])
  useEffect(() => { currentRoomIdRef.current = currentRoomId }, [currentRoomId])
  useEffect(() => { isHostRef.current = isHost }, [isHost])
  useEffect(() => { isConnectedRef.current = isConnected }, [isConnected])
  useEffect(() => { roomIdRef.current = roomId }, [roomId])

  // 호스트 정보 맵
  const hostRoleMap = new Map<string, 'owner' | 'speaker'>()
  hosts.forEach((h: StreamHost) => {
    const memberId = h.member_id || h.partner?.member?.id
    if (memberId) {
      hostRoleMap.set(memberId, h.role === 'owner' ? 'owner' : 'speaker')
    }
  })

  const getSenderRole = useCallback((senderId: string): 'owner' | 'speaker' | 'listener' => {
    return hostRoleMap.get(senderId) || 'listener'
  }, [hostRoleMap])

  // 채팅 스크롤
  const scrollToBottom = useCallback(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [voiceRoom.chats, scrollToBottom])

  // ========== 4. 입장 가능 여부 계산 (구독자 전용방, 밴 체크 포함) ==========
  const canJoin = useMemo(() => {
    if (!room || !user) return false
    
    // 차단 체크 로딩 중이면 false
    if (banCheckLoading) return false
    
    // 구독자 전용방 구독 체크 로딩 중이면 false (관리자는 제외)
    if (room.access_type === 'subscriber' && subscriptionCheckLoading && !isAdmin) return false
    
    // 차단된 경우 false
    if (banCheck?.is_banned) return false
    
    // 구독자 전용방인데 구독자가 아닌 경우 false (관리자/호스트는 제외)
    if (room.access_type === 'subscriber' && !isSubscribed && !isAdmin) {
      const isHostUser = room.host_member_id === user.id || room.host_partner?.member?.id === user.id
      if (!isHostUser) return false
    }
    
    return true
  }, [room, user, banCheckLoading, subscriptionCheckLoading, banCheck, isSubscribed, isAdmin])

  // ========== 5. 방 입장 처리 ==========
  const handleJoinRoom = useCallback(async (password?: string) => {
    try {
      await resumeAudioContext()
      await joinRoom(password)
      setHasJoined(true)
      setShowPasswordModal(false)
      setPasswordError(null)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '입장 실패'
      setPasswordError(errorMessage)
      
      // 구독자 전용방 입장 실패 시 알림 표시 및 페이지 이동 (관리자는 제외)
      if ((errorMessage.includes('구독자만') || errorMessage.includes('구독')) && !isAdmin) {
        toast.error('구독자만 입장할 수 있는 방입니다')
        setTimeout(() => {
          navigate({ to: '/stream/voice' })
        }, 2000)
      }
      
      // 차단/강퇴 에러
      if (errorMessage.includes('강퇴') || errorMessage.includes('차단')) {
        toast.error(errorMessage)
        navigate({ to: '/stream/voice' })
        return
      }
    }
  }, [joinRoom, navigate, isAdmin])

  // 미니플레이어 복귀 감지
  useEffect(() => {
    if (currentRoomId === roomId && isConnected && !hasJoined) {
      setHasJoined(true)
      if (isMinimizedRef.current) {
        console.log('✅ 미니플레이어 복귀 감지 - 플래그 리셋')
        isMinimizedRef.current = false
      }
    }
  }, [currentRoomId, roomId, isConnected, hasJoined])

  // ========== 6. 실시간 차단/강제뮤트 감지 (통합 채널 사용) ==========
  // 통합 채널 훅 사용 (차단 감지 활성화)
  // 입장 가능하고 실제로 입장한 경우에만 채널 연결
  const unifiedChannel = useUnifiedStreamChannel(roomId, {
    enabled: !!roomId && hasJoined && canJoin && !isHost,
    enableBans: true,
    memberId: user?.id,
  })

  // 차단 감지 핸들러
  useEffect(() => {
    if (!roomId || !user?.id || !hasJoined || isHost) return
    if (!unifiedChannel.isConnected) return

    const handleBan = (data: {
      targetMemberId: string
      bannedBy: string
      banType: 'room' | 'global'
      reason?: string
      expiresAt?: string
    }) => {
      console.log('🚫 실시간 차단 감지:', data)
      const banTypeLabel = data.banType === 'room' ? '강퇴' : '차단'
      toast.error(`${banTypeLabel}되었습니다. 이 방에 입장할 수 없습니다.`)
      stopMicrophone()
      voiceRoom.leaveRoom()
      navigate({ to: '/stream/voice' })
    }

    unifiedChannel.on('moderation:ban', handleBan)
    return () => { unifiedChannel.off('moderation:ban', handleBan) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, user?.id, hasJoined, isHost, unifiedChannel.isConnected, stopMicrophone, voiceRoom, navigate])

  // 강제 뮤트 감지 핸들러
  useEffect(() => {
    if (!roomId || !user?.id || !hasJoined || !isSpeaker) return
    if (!unifiedChannel.isConnected) return

    const handleForceMute = (data: { targetMemberId: string; mutedBy: string; reason?: string }) => {
      if (data.targetMemberId !== user.id) return
      console.log('🔇 실시간 강제 뮤트 감지 (통합 채널)')
      applyForceMute()
      toast.warning('호스트에 의해 마이크가 음소거되었습니다')
    }

    const handleForceUnmute = (data: { targetMemberId: string }) => {
      if (data.targetMemberId !== user.id) return
      console.log('🔊 실시간 강제 뮤트 해제 감지 (통합 채널)')
      clearForceMute()
      toast.success('마이크 음소거가 해제되었습니다')
    }

    unifiedChannel.on('moderation:force-mute', handleForceMute)
    unifiedChannel.on('moderation:force-unmute', handleForceUnmute)
    return () => {
      unifiedChannel.off('moderation:force-mute', handleForceMute)
      unifiedChannel.off('moderation:force-unmute', handleForceUnmute)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, user?.id, hasJoined, isSpeaker, unifiedChannel.isConnected, applyForceMute, clearForceMute])

  // ========== 7. 자동 입장 시도 ==========
  useEffect(() => {
    if (!room || hasJoined || !user) return
    
    // ✅ 차단 체크 로딩 중이면 대기
    if (banCheckLoading) return
    
    // ✅ 구독자 전용방 구독 체크 로딩 중이면 대기 (관리자는 제외)
    if (room.access_type === 'subscriber' && subscriptionCheckLoading && !isAdmin) return
    
    // ✅ 차단된 경우 입장 차단
    if (banCheck?.is_banned) {
      const banTypeLabel = banCheck.ban_type === 'kick' ? '강퇴' : '차단'
      toast.error(`${banTypeLabel}되어 이 방에 입장할 수 없습니다.`)
      navigate({ to: '/stream/voice' })
      return
    }
    
    // ✅ 구독자 전용방인데 구독자가 아닌 경우 입장 차단 (관리자는 제외)
    if (room.access_type === 'subscriber' && !isSubscribed && !isAdmin) {
      // 호스트 본인은 구독 확인 불필요
      const isHostUser = room.host_member_id === user.id || room.host_partner?.member?.id === user.id
      
      console.log('[useVoiceRoomPage] 구독자 전용방 입장 체크:', {
        roomId,
        accessType: room.access_type,
        isSubscribed,
        isAdmin,
        isHostUser,
        subscriptionCheckLoading,
        subscriptionError,
        userId: user?.id,
        hostPartnerId: room.host_partner_id || room.host_partner?.id
      })
      
      if (!isHostUser) {
        toast.error('구독자만 입장할 수 있는 방입니다')
        navigate({ to: '/stream/voice' })
        return
      }
    }
    
    // 미니플레이어 복귀
    if (currentRoomId === roomId) {
      setHasJoined(true)
      return
    }

    const autoJoin = async () => {
      await resumeAudioContext()

      if (room.access_type === 'private') {
        if (room.host_member_id === user.id || room.host_partner?.member?.id === user.id) {
          handleJoinRoom(room.password || undefined)
        } else {
          setShowPasswordModal(true)
        }
      } else {
        // 구독자 전용방은 이미 위에서 확인했으므로 바로 입장
        handleJoinRoom()
      }
    }
    
    autoJoin()
  }, [room, hasJoined, user, handleJoinRoom, currentRoomId, roomId, banCheck, banCheckLoading, isSubscribed, subscriptionCheckLoading, isAdmin, navigate, subscriptionError])

  // ========== 8. 음성 연결 ==========
  useEffect(() => {
    if (currentRoomId === roomId && (isConnected || isConnecting)) {
      if (isConnected) connectAttemptRef.current = 0
      return
    }
    
    if (isMinimizedRef.current && currentRoomId === roomId) {
      isMinimizedRef.current = false
      connectAttemptRef.current = 0
      return
    }
    
    if (isAutoReconnecting) return
    
    if (hasJoined && !isConnected && !isConnecting && user?.id && room) {
      if (isResigningRef.current || isUpgradingToSpeakerRef.current) return
      
      if (connectAttemptRef.current >= maxConnectAttempts) {
        console.warn('⚠️ [VoiceRoomPage] 최대 연결 시도 횟수 초과')
        return
      }
      
      connectAttemptRef.current += 1
      const isListenerOnly = !isHost && !isSpeaker
      if (connectRef.current) {
        connectRef.current(roomId, user.id, isListenerOnly)
      } else {
        connect(roomId, user.id, isListenerOnly)
      }
    }
    
    if (isConnected) connectAttemptRef.current = 0
  }, [hasJoined, isHost, isSpeaker, isConnected, isConnecting, isAutoReconnecting, roomId, user?.id, currentRoomId, room?.id])

  // 청취자 → 발언자 전환
  useEffect(() => {
    if (isConnected && isListenerMode && (isHost || isSpeaker) && user?.id) {
      if (isUpgradingToSpeakerRef.current) return
      
      isUpgradingToSpeakerRef.current = true
      disconnect(true)
      
      setTimeout(() => {
        connectAttemptRef.current = 0
        if (connectRef.current) {
          connectRef.current(roomId, user.id, false, true).finally(() => {
            isUpgradingToSpeakerRef.current = false
          })
        } else {
          connect(roomId, user.id, false, true).finally(() => {
            isUpgradingToSpeakerRef.current = false
          })
        }
      }, 500)
    }
  }, [isConnected, isListenerMode, isHost, isSpeaker, disconnect, roomId, user?.id])

  // 방 종료 시 연결 해제
  useEffect(() => {
    if (room?.status === 'ended') {
      disconnect()
      alert('방송이 종료되었습니다.')
      navigate({ to: '/stream/voice' })
    }
  }, [room?.status, disconnect, navigate])

  const disconnectRef = useRef(disconnect)
  useEffect(() => { disconnectRef.current = disconnect }, [disconnect])

  // 페이지 unmount 시 연결 해제
  useEffect(() => {
    return () => {
      const cleanupCurrentRoomId = currentRoomIdRef.current
      const cleanupIsConnected = isConnectedRef.current
      const cleanupRoomId = roomIdRef.current
      
      if (isHostRef.current) return
      if (isMinimizedRef.current) return
      if (cleanupCurrentRoomId === cleanupRoomId && cleanupIsConnected) {
        connectAttemptRef.current = 0
        return
      }
      disconnectRef.current()
    }
  }, [roomId])

  // ========== 액션 핸들러 ==========
  const handleLeaveRoom = useCallback(async () => {
    stopMicrophone()
    await voiceRoom.leaveRoom()
    navigate({ to: '/stream/voice' })
  }, [voiceRoom, navigate, stopMicrophone])

  const handleSendMessage = useCallback(async () => {
    try {
      await sendChatMessage()
    } catch (err) {
      console.error('메시지 전송 실패:', err)
    }
  }, [sendChatMessage])

  const handleRequestSpeaking = useCallback(async () => {
    try {
      await voiceRoom.requestSpeaking('발언하고 싶습니다!')
    } catch (err) {
      console.error('발언권 요청 실패:', err)
    }
  }, [voiceRoom])

  const handleResignSpeaking = useCallback(async () => {
    isResigningRef.current = true
    stopMicrophone()
    await voiceRoom.resignSpeaking()
    
    setTimeout(() => {
      if (user?.id) {
        isResigningRef.current = false
        if (connectRef.current) {
          connectRef.current(roomId, user.id, true, true)
        } else {
          connect(roomId, user.id, true, true)
        }
      }
    }, 2000)
  }, [voiceRoom, roomId, user?.id, stopMicrophone])

  const handleEndRoom = useCallback(async () => {
    if (!confirm('정말 방송을 종료하시겠습니까?')) return
    stopMicrophone()
    await voiceRoom.endRoom()
    navigate({ to: '/stream/voice' })
  }, [stopMicrophone, voiceRoom, navigate])

  const handleClosePasswordModal = useCallback(() => {
    navigate({ to: '/stream/voice' })
  }, [navigate])

  const toggleRequestsPanel = useCallback(() => {
    setShowRequestsPanel(prev => !prev)
  }, [])

  const handleMinimize = useCallback(() => {
    isMinimizedRef.current = true
    navigate({ to: '/stream/voice' })
  }, [navigate])

  // 이벤트 리스너
  useEffect(() => {
    const handleMinimizeEvent = () => handleMinimize()
    window.addEventListener('minimizeVoiceRoom', handleMinimizeEvent)
    return () => window.removeEventListener('minimizeVoiceRoom', handleMinimizeEvent)
  }, [handleMinimize])

  useEffect(() => {
    const handleOpenSidebarEvent = () => setShowSidebar(true)
    window.addEventListener('openVoiceRoomSidebar', handleOpenSidebarEvent)
    return () => window.removeEventListener('openVoiceRoomSidebar', handleOpenSidebarEvent)
  }, [])

  useEffect(() => {
    const sidebarBtn = document.getElementById('voice-room-sidebar-btn')
    if (sidebarBtn) {
      sidebarBtn.style.display = (!isAdmin && !isHost) ? 'none' : ''
    }
  }, [isAdmin, isHost])

  const closeSidebar = useCallback(() => setShowSidebar(false), [])

  const handleForceEndRoom = useCallback(async () => {
    stopMicrophone()
    try {
      // 관리자는 Edge API를 직접 사용 (호스트 권한 없이도 방 종료 가능)
      if (isAdmin) {
        const { edgeApi } = await import('@/lib/edgeApi')
        const response = await edgeApi.stream.endRoom(roomId)
        if (!response.success) {
          throw new Error(response.error?.message || '방 종료에 실패했습니다')
        }
      } else {
        // 호스트는 기존 방식 사용
        await voiceRoom.endRoom()
      }
      navigate({ to: '/stream/voice' })
    } catch (err) {
      console.error('강제 방송 종료 실패:', err)
      toast.error(err instanceof Error ? err.message : '방 종료에 실패했습니다')
    }
  }, [isAdmin, roomId, stopMicrophone, voiceRoom, navigate])

  return {
    // 상태
    user,
    room: voiceRoom.room,
    hosts: voiceRoom.hosts,
    viewers,
    chats: voiceRoom.chats,
    speakerRequests: voiceRoom.speakerRequests,
    isLoading: voiceRoom.isLoading || banCheckLoading || (room?.access_type === 'subscriber' && subscriptionCheckLoading && !isAdmin),
    roomError: voiceRoom.error,
    isHost: voiceRoom.isHost,
    isAdmin,
    isSpeaker: voiceRoom.isSpeaker,
    mySpeakerRequest: voiceRoom.mySpeakerRequest,
    
    // 음성 연결 상태
    isConnected: voiceConnection.isConnected,
    isConnecting: voiceConnection.isConnecting,
    isMuted: voiceConnection.isMuted,
    isForceMuted: voiceConnection.isForceMuted,
    localIsSpeaking: voiceConnection.isSpeaking,
    peers: voiceConnection.peers,
    
    // UI 상태
    inputValue,
    setInputValue,
    showPasswordModal,
    passwordError,
    showRequestsPanel,
    showSidebar,
    hasJoined,
    chatContainerRef,
    
    // 액션
    handleJoinRoom,
    handleLeaveRoom,
    handleSendMessage,
    handleRequestSpeaking,
    handleResignSpeaking,
    handleEndRoom,
    handleForceEndRoom,
    handleClosePasswordModal,
    handleMinimize,
    toggleRequestsPanel,
    closeSidebar,
    toggleMute: voiceConnection.toggleMute,
    approveSpeaker: voiceRoom.approveSpeaker,
    rejectSpeaker: voiceRoom.rejectSpeaker,

    // 유틸
    getSenderRole,
  }
}
