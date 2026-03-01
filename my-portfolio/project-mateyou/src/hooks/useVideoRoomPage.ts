/**
 * useVideoRoomPage - 라이브룸 페이지 비즈니스 로직
 */

import { useAuth } from '@/hooks/useAuth';
import { useCheckSubscription } from '@/hooks/useCheckSubscription';
import { useStreamHeartbeat } from '@/hooks/useStreamHeartbeat';
import { useCheckBan, type StreamBan } from '@/hooks/useStreamModeration';
import { useUnifiedStreamChannel } from '@/hooks/useUnifiedStreamChannel';
import { useViewerHeartbeat } from '@/hooks/useViewerHeartbeat';
import { useRoomViewers, useVoiceRoom } from '@/hooks/useVoiceRoom';
import { useVideoRoomMiniPlayerStore } from '@/store/useVideoRoomMiniPlayerStore'
import { resumeAudioContext } from '@/utils/audioUtils';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

export function useVideoRoomPage(roomId: string) {
  const navigate = useNavigate()
  const { user } = useAuth()
  
  // 훅 연결
  const voiceRoom = useVoiceRoom(roomId) // 라이브룸도 같은 훅 사용 (stream_type만 다름)
  const activeMiniPlayerRoomId = useVideoRoomMiniPlayerStore((s) => s.activeRoomId)
  const openMiniPlayer = useVideoRoomMiniPlayerStore((s) => s.open)
  const closeMiniPlayer = useVideoRoomMiniPlayerStore((s) => s.close)
  
  // 채팅 입력 상태는 ChatPanel 컴포넌트 내부에서 관리 (불필요한 리렌더링 방지)

  // UI 상태
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [hasJoined, setHasJoined] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(true)
  const [showSidebar, setShowSidebar] = useState(false)

  const chatContainerRef = useRef<HTMLDivElement>(null)

  const { room, hosts, chats, isHost, isAdmin, joinRoom, leaveRoom, error: roomError } = voiceRoom
  
  // 시청자 목록 (호스트/관리자만 조회)
  const { data: viewers = [] } = useRoomViewers(roomId, isHost || isAdmin)
  
  // 차단 여부 확인 (입장 전 체크)
  const { data: banCheck, isLoading: banCheckLoading } = useCheckBan(
    user?.id,
    roomId,
    room?.host_partner?.id,
    room?.host_member_id
  )

  // 구독자 전용방 구독 여부 확인 (입장 전 체크, 밴 확인과 동일한 단계)
  // host_partner_id를 직접 사용 (room?.host_partner?.id는 조인 데이터이므로 로드가 늦을 수 있음)
  const hostPartnerId = room?.host_partner_id || room?.host_partner?.id
  const accessType = room?.access_type
  
  // 디버깅: room 로드 상태와 구독 체크 파라미터 로그
  useEffect(() => {
    console.log('[useVideoRoomPage] room 로드 상태:', {
      roomId,
      hasRoom: !!room,
      roomId_match: room?.id === roomId,
      hostPartnerId,
      accessType,
      userId: user?.id,
      isAdmin
    })
  }, [room, roomId, hostPartnerId, accessType, user?.id, isAdmin])
  
  const { isSubscribed, isChecking: subscriptionCheckLoading, error: subscriptionError } = useCheckSubscription({
    userId: user?.id,
    roomId,
    hostPartnerId,
    accessType,
  })

  // 호스트일 때 하트비트 전송 (30초마다)
  useStreamHeartbeat({
    roomId,
    isHost,
    isLive: room?.status === 'live',
  })

  // 시청자일 때 Heartbeat 전송 (정확한 시청자 수 유지)
  useViewerHeartbeat({
    roomId,
    isViewer: !isHost && hasJoined,
    isLive: room?.status === 'live',
    isHost: false,
  })

  // 채팅 스크롤
  const scrollToBottom = useCallback(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [voiceRoom.chats, scrollToBottom])

  // 방 입장 처리
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
          navigate({ to: '/stream/live' })
        }, 2000)
      }
    }
  }, [joinRoom, navigate, isAdmin])

  // 차단된 유저 강제 퇴장 처리
  const handleBanned = useCallback((ban: StreamBan) => {
    console.log('🚫 차단 감지:', ban)
    
    const banTypeLabel = ban.ban_type === 'kick' ? '강퇴' : '차단'
    toast.error(`${banTypeLabel}되었습니다. 이 방에 입장할 수 없습니다.`)
    
    // 퇴장 처리 (HLS 시청만 지원)
    if (activeMiniPlayerRoomId === roomId) {
      closeMiniPlayer()
    }
    leaveRoom()
    
    // 목록 페이지로 이동
    navigate({ to: '/stream/live' })
  }, [activeMiniPlayerRoomId, roomId, closeMiniPlayer, leaveRoom, navigate])

  // 입장 가능 여부 계산 (구독자 전용방, 밴 체크 포함)
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

  // 통합 채널 사용 (차단 이벤트 전용)
  // 채팅 Realtime 구독은 useVoiceRoom에서 처리 (중복 구독 방지)
  // 입장 가능하고 실제로 입장한 경우에만 채널 연결
  const unifiedChannel = useUnifiedStreamChannel(roomId, {
    enabled: !!roomId && hasJoined && canJoin, // 입장 가능하고 실제로 입장한 경우에만
    enableChats: false, // 채팅 구독은 useVoiceRoom에서 처리
    enableBans: true,
    memberId: user?.id,
  })

  // 실시간 차단 감지 (입장 후, 통합 채널 사용)
  useEffect(() => {
    if (!roomId || !user?.id || !hasJoined) return
    if (isHost) return // 호스트는 차단 대상에서 제외
    if (!unifiedChannel.isConnected) return

    // moderation:ban 이벤트 리스닝
    const handleBan = (data: { targetMemberId: string; bannedBy: string; banType: 'room' | 'global'; reason?: string; expiresAt?: string }) => {
      if (data.targetMemberId !== user.id) return
      
      // StreamBan 형태로 변환
      const ban: StreamBan = {
        id: 0, // 실제 ID는 필요시 조회
        room_id: data.banType === 'room' ? roomId : null,
        target_member_id: user.id,
        banned_by: data.bannedBy,
        scope: data.banType,
        reason: data.reason,
        expires_at: data.expiresAt,
        is_active: true,
        created_at: new Date().toISOString(),
      }
      
      handleBanned(ban)
    }

    unifiedChannel.on('moderation:ban', handleBan)

    return () => {
      unifiedChannel.off('moderation:ban', handleBan)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, user?.id, hasJoined, isHost, unifiedChannel.isConnected, handleBanned])

  // 자동 입장 시도
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
      navigate({ to: '/stream/live' })
      return
    }
    
    // ✅ 구독자 전용방인데 구독자가 아닌 경우 입장 차단 (관리자는 제외)
    if (room.access_type === 'subscriber' && !isSubscribed && !isAdmin) {
      // 호스트 본인은 구독 확인 불필요
      const isHost = room.host_member_id === user.id || room.host_partner?.member?.id === user.id
      
      console.log('[useVideoRoomPage] 구독자 전용방 입장 체크:', {
        roomId,
        accessType: room.access_type,
        isSubscribed,
        isAdmin,
        isHost,
        subscriptionCheckLoading,
        subscriptionError,
        userId: user?.id,
        hostPartnerId: room.host_partner_id || room.host_partner?.id
      })
      
      if (!isHost) {
        toast.error('구독자만 입장할 수 있는 방입니다')
        navigate({ to: '/stream/live' })
        return
      }
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
  }, [room, hasJoined, user, handleJoinRoom, roomId, banCheck, banCheckLoading, isSubscribed, subscriptionCheckLoading, navigate])

  // 방 나가기 (미니플레이어로 최소화 - HLS만)
  const handleMinimize = useCallback(() => {
    openMiniPlayer(roomId)
    navigate({ to: '/stream/live' })
  }, [openMiniPlayer, roomId, navigate])

  // 방 완전히 나가기
  const handleLeaveRoom = useCallback(async () => {
    // OBS 기반 방송: 앱에서 방 종료(end)하지 않고 퇴장만 처리
    try {
      await leaveRoom()
    } catch (err) {
      console.error('퇴장 처리 실패:', err)
    }
    
    setHasJoined(false)
    if (activeMiniPlayerRoomId === roomId) {
      closeMiniPlayer()
    }
    navigate({ to: '/stream/live' })
  }, [leaveRoom, activeMiniPlayerRoomId, roomId, closeMiniPlayer, navigate])

  // 채팅 닫기/열기
  const handleToggleChat = useCallback(() => {
    setIsChatOpen(prev => !prev)
  }, [])

  // 사이드바 닫기
  const closeSidebar = useCallback(() => setShowSidebar(false), [])

  // 사이드바 열기 이벤트 리스너
  useEffect(() => {
    const handleOpenSidebarEvent = () => setShowSidebar(true)
    window.addEventListener('openVideoRoomSidebar', handleOpenSidebarEvent)
    return () => window.removeEventListener('openVideoRoomSidebar', handleOpenSidebarEvent)
  }, [])

  // 사이드바 버튼 표시/숨김 (관리자/호스트만 표시)
  useEffect(() => {
    const sidebarBtn = document.getElementById('video-room-sidebar-btn')
    if (sidebarBtn) {
      sidebarBtn.style.display = (!isAdmin && !isHost) ? 'none' : ''
    }
  }, [isAdmin, isHost])

  // 강제 방송 종료 (관리자용)
  const handleForceEndRoom = useCallback(async () => {
    if (!isAdmin) return

    try {
      // 관리자는 Edge API를 직접 사용 (호스트 권한 없이도 방 종료 가능)
      const { edgeApi } = await import('@/lib/edgeApi')
      const response = await edgeApi.stream.endRoom(roomId)
      if (!response.success) {
        throw new Error(response.error?.message || '방 종료에 실패했습니다')
      }
      setHasJoined(false)
      if (activeMiniPlayerRoomId === roomId) {
        closeMiniPlayer()
      }
      navigate({ to: '/stream/live' })
    } catch (err) {
      console.error('강제 방송 종료 실패:', err)
      toast.error(err instanceof Error ? err.message : '방 종료에 실패했습니다')
    }
  }, [isAdmin, roomId, activeMiniPlayerRoomId, closeMiniPlayer, navigate])

  return {
    user,
    room,
    hosts,
    viewers,
    chats,
    isLoading: voiceRoom.isLoading,
    roomError,
    isHost,
    isAdmin,
    showPasswordModal,
    passwordError,
    hasJoined,
    isChatOpen,
    showSidebar,
    chatContainerRef,
    handleJoinRoom,
    handleLeaveRoom,
    handleMinimize,
    handleToggleChat,
    handleForceEndRoom,
    closeSidebar,
    scrollToBottom,
  }
}
