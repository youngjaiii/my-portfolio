/**
 * 라이브 스트리밍 페이지
 * 
 * 통합 구조: HLS 플레이어가 한 번만 렌더링되고,
 * PC/모바일 UI가 그 위에 오버레이됨
 */

import type { StreamDonation } from '@/components/features/stream/donation/types'
import { DonationEffectOverlay } from '@/components/features/stream/DonationEffectOverlay'
import { RouletteOverlay } from '@/components/features/stream/roulette'
import { StreamRoomSidebar } from '@/components/features/stream/sidebar'
import { VideoDonationPlayer } from '@/components/features/stream/VideoDonationPlayer'
import { VoiceRoomPasswordModal } from '@/components/features/stream/VoiceRoomPasswordModal'
import { HlsVideoPlayer } from '@/components/features/stream/HlsVideoPlayer'
import {
  DesktopHeader,
  DesktopSidePanel,
  DesktopVideoOverlay,
  MobileVideoRoomUI,
  MobileLandscapeSidePanel,
  MobileLandscapeVideoControls,
  FullscreenOverlay,
  VideoRoomModals,
} from '@/components/features/stream/video-room'
import { useRoomHlsUrl } from '@/hooks/useHlsStream'
import { useAdaptiveDevice } from '@/hooks/useAdaptiveDevice'
import { useDonationQueue } from '@/hooks/useDonationQueue'
import { useFanRanking } from '@/hooks/useFanRanking'
import { useFollowHost } from '@/hooks/useFollowHost'
import { usePinChat } from '@/hooks/usePinChat'
import { useStreamDonations } from '@/hooks/useStreamDonations'
import { useStreamModeration } from '@/hooks/useStreamModeration'
import { useVideoDonationPlayer } from '@/hooks/useVideoDonationPlayer'
import { useVideoRoomPage } from '@/hooks/useVideoRoomPage'
import type { StreamChat, StreamHost, StreamViewer } from '@/hooks/useVoiceRoom'
import { canOpenProfileFromChat } from '@/utils/streamProfileAccess'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

// 가로모드 감지 훅
function useIsLandscape() {
  const [isLandscape, setIsLandscape] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.innerWidth > window.innerHeight
  })

  useEffect(() => {
    const handleChange = () => {
      setIsLandscape(window.innerWidth > window.innerHeight)
    }

    window.addEventListener('resize', handleChange)
    window.addEventListener('orientationchange', handleChange)

    return () => {
      window.removeEventListener('resize', handleChange)
      window.removeEventListener('orientationchange', handleChange)
    }
  }, [])

  return isLandscape
}

export const Route = createFileRoute('/stream/video/$roomId')({
  component: VideoRoomPage,
})

function VideoRoomPage() {
  const { roomId } = Route.useParams()
  const navigate = useNavigate()
  // User-Agent 기반 적응형 - 브라우저 크기 변경해도 레이아웃 타입 고정
  const { isDesktop } = useAdaptiveDevice()
  // 가로모드 감지 (모바일에서만 의미있음)
  const isLandscape = useIsLandscape()
  
  const {
    user,
    room,
    hosts,
    viewers,
    chats,
    isLoading,
    roomError,
    isHost,
    isAdmin,
    showPasswordModal,
    passwordError,
    isChatOpen,
    showSidebar,
    chatContainerRef,
    handleJoinRoom,
    handleToggleChat,
    handleMinimize,
    handleForceEndRoom,
    closeSidebar,
  } = useVideoRoomPage(roomId)

  // HLS 스트림 URL 조회
  const { data: hlsUrl, isLoading: isHlsLoading } = useRoomHlsUrl(roomId)

  // 모더레이션 훅
  const { hideMessage, unhideMessage } = useStreamModeration(roomId)

  // 고정 훅
  const { togglePin } = usePinChat()
  
  // 후원 관련 훅
  const { 
    rankings, 
    activeEffects,
    currentRoulette,
    rouletteQueueLength,
    skipCurrentRoulette,
  } = useStreamDonations({ roomId, enableRealtime: true, enableRoulette: true })

  // 팬 랭킹 훅
  const { rankMap } = useFanRanking({ 
    partnerId: room?.host_partner_id || null,
    enabled: !!room?.host_partner_id,
  })

  // 영상 도네이션 플레이어 훅
  const {
    currentVideo,
    playVideo,
    stopVideo,
    remainingTime,
  } = useVideoDonationPlayer({ roomId, enabled: true })

  // 참가자 프로필 시트 상태
  const [selectedParticipant, setSelectedParticipant] = useState<StreamHost | StreamViewer | null>(null)
  const [selectedParticipantIsSpeaker, setSelectedParticipantIsSpeaker] = useState(false)
  const [isProfileSheetOpen, setIsProfileSheetOpen] = useState(false)
  const [isDonationSheetOpen, setIsDonationSheetOpen] = useState(false)

  // 채팅 액션 시트 상태
  const [selectedChatMessage, setSelectedChatMessage] = useState<StreamChat | null>(null)
  const [isChatActionSheetOpen, setIsChatActionSheetOpen] = useState(false)
  
  // 후원 목록 상태 (호스트용)
  const [isDonationListOpen, setIsDonationListOpen] = useState(false)
  
  // 미션 패널 상태 (시청자용)
  const [isMissionPanelOpen, setIsMissionPanelOpen] = useState(false)
  
  // 방송 설정 상태 (호스트용)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  // 화면(UI) 숨김/가이드 (호스트/관리자용)
  const [isHudHidden, setIsHudHidden] = useState(false)
  const [isHudGuideOpen, setIsHudGuideOpen] = useState(false)

  // 전체화면 모드 (Fullscreen API 또는 CSS 기반 가상 전체화면)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false) // CSS 기반 가상 전체화면 (모바일용)
  const [isFullscreenChatOpen, setIsFullscreenChatOpen] = useState(true)
  const [fullscreenLayoutType, setFullscreenLayoutType] = useState<'desktop' | 'mobile' | null>(null)
  const fullscreenContainerRef = useRef<HTMLDivElement>(null)

  // 관리자/호스트 여부
  const isModeratorView = isHost || isAdmin
  const canUseHud = isModeratorView
  const hudHidden = canUseHud && isHudHidden

  // 호스트(방장) 정보 가져오기
  const ownerHost = useMemo(() => {
    return hosts.find(h => h.role === 'owner') || hosts[0] || null
  }, [hosts])

  // 호스트 상세 정보 계산
  const hostInfo = useMemo(() => {
    if (ownerHost) {
      const hostName = ownerHost.partner?.partner_name || ownerHost.partner?.member?.name || ownerHost.member?.name
      const hostProfileImage = ownerHost.partner?.member?.profile_image || ownerHost.member?.profile_image
      const hostInitial = hostName?.charAt(0)
      const hostPartnerId = ownerHost.partner_id || ownerHost.partner?.id
      const followerCount = (ownerHost.partner as any)?.follower_count || 0
      
      return {
        name: hostName,
        profileImage: hostProfileImage,
        initial: hostInitial,
        partnerId: hostPartnerId,
        memberId: ownerHost.member_id || ownerHost.partner?.member?.id,
        followerCount,
      }
    }
    
    return {
      name: room?.host_partner?.member?.name || room?.host_member?.name,
      profileImage: room?.host_partner?.member?.profile_image || room?.host_member?.profile_image,
      initial: room?.host_partner?.member?.name?.charAt(0) || room?.host_member?.name?.charAt(0),
      partnerId: room?.host_partner?.id || room?.host_partner_id,
      memberId: room?.host_member_id,
      followerCount: (room?.host_partner as any)?.follower_count || 0,
    }
  }, [ownerHost, room])

  // 호스트 팔로우 상태 훅
  const { isFollowing, isLoading: isFollowLoading, toggleFollow } = useFollowHost({
    hostPartnerId: hostInfo.partnerId,
    hostMemberId: hostInfo.memberId,
  })
  
  // 호스트용 후원 통계
  const { stats: donationStats } = useDonationQueue({
    roomId,
    enabled: isHost,
    enableRealtime: true,
  })

  // 고정된 메시지 찾기
  const pinnedMessage = useMemo(() => {
    return chats.find(chat => chat.is_pinned && !chat.is_hidden) || null
  }, [chats])

  // 채팅 필터링
  const filteredChats = useMemo(() => {
    let filtered = isModeratorView 
      ? chats 
      : chats.filter(chat => !chat.is_hidden)
    
    if (pinnedMessage) {
      filtered = filtered.filter(chat => chat.id !== pinnedMessage.id)
    }
    
    return filtered
  }, [chats, isModeratorView, pinnedMessage])

  // 호스트 역할 확인
  const getSenderRole = useCallback((senderId: string): 'owner' | 'speaker' | 'listener' => {
    const host = hosts.find(h => 
      h.member_id === senderId || h.partner?.member?.id === senderId
    )
    if (!host) return 'listener'
    return host.role === 'owner' ? 'owner' : 'speaker'
  }, [hosts])

  // 채팅 메시지 클릭 핸들러
  const handleChatMessageClick = useCallback((message: StreamChat) => {
    if (!isModeratorView) return
    setSelectedChatMessage(message)
    setIsChatActionSheetOpen(true)
  }, [isModeratorView])

  // 채팅 액션 시트에서 프로필 열기
  const handleOpenProfileFromChat = useCallback(() => {
    if (!selectedChatMessage) return

    const host = hosts.find(h => 
      h.member_id === selectedChatMessage.sender_id || h.partner?.member?.id === selectedChatMessage.sender_id
    )
    
    if (host) {
      setSelectedParticipant(host)
      setSelectedParticipantIsSpeaker(true)
    } else {
      const viewer = viewers.find((v: StreamViewer) => v.member_id === selectedChatMessage.sender_id)
      if (viewer) {
        setSelectedParticipant(viewer)
        setSelectedParticipantIsSpeaker(false)
      } else {
        setSelectedParticipant({
          id: `temp-${selectedChatMessage.sender_id}`,
          room_id: roomId,
          member_id: selectedChatMessage.sender_id,
          joined_at: selectedChatMessage.created_at,
          left_at: null,
          member: selectedChatMessage.sender ? {
            id: selectedChatMessage.sender.id,
            name: selectedChatMessage.sender.name,
            profile_image: selectedChatMessage.sender.profile_image,
          } : undefined,
        } as StreamViewer)
        setSelectedParticipantIsSpeaker(false)
      }
    }
    setIsProfileSheetOpen(true)
  }, [selectedChatMessage, hosts, viewers, roomId])

  // 선택된 채팅 메시지의 프로필 열기 가능 여부
  const canOpenSelectedChatProfile = selectedChatMessage
    ? canOpenProfileFromChat({
        senderId: selectedChatMessage.sender_id,
        hosts,
        viewers,
        hostMemberId: room?.host_member_id,
        isCurrentUserAdmin: isAdmin,
        isCurrentUserHost: isHost,
      })
    : false

  // 채팅 숨기기/해제 핸들러
  const handleChatHideToggle = useCallback(async (messageId: number, isHidden: boolean) => {
    try {
      if (isHidden) {
        await unhideMessage.mutateAsync({ roomId, messageId })
        toast.success('채팅 숨기기가 해제되었습니다')
      } else {
        await hideMessage.mutateAsync({ roomId, messageId })
        toast.success('채팅이 숨겨졌습니다')
      }
    } catch (err) {
      console.error('채팅 숨기기 처리 실패:', err)
      toast.error('채팅 처리에 실패했습니다')
    }
  }, [hideMessage, unhideMessage, roomId])

  // 채팅 고정/해제 핸들러
  const handleChatPinToggle = useCallback(async (messageId: number, isPinned: boolean) => {
    try {
      await togglePin.mutateAsync({ messageId, roomId })
      toast.success(isPinned ? '고정이 해제되었습니다' : '메시지가 고정되었습니다')
    } catch (err) {
      console.error('채팅 고정 처리 실패:', err)
      toast.error('고정 처리에 실패했습니다')
    }
  }, [togglePin, roomId])

  // 고정된 메시지 해제 핸들러
  const handleUnpinMessage = useCallback(async () => {
    if (!pinnedMessage) return
    await handleChatPinToggle(pinnedMessage.id, true)
  }, [pinnedMessage, handleChatPinToggle])

  const handleCloseProfileSheet = useCallback(() => {
    setIsProfileSheetOpen(false)
    setSelectedParticipant(null)
  }, [])

  // 화면 방향 잠금 (모바일 전체화면 시 가로모드 강제)
  // Screen Orientation API는 실험적 API이므로 any 타입 사용
  const lockLandscapeOrientation = useCallback(async () => {
    try {
      const orientation = screen.orientation as ScreenOrientation & { lock?: (orientation: string) => Promise<void> }
      // Screen Orientation API 지원 확인 (Android Chrome/Firefox 등)
      if (orientation && typeof orientation.lock === 'function') {
        await orientation.lock('landscape')
        console.log('📱 [Fullscreen] 가로모드 잠금 성공')
      }
    } catch (err) {
      // iOS Safari 등 미지원 브라우저에서는 무시
      console.log('📱 [Fullscreen] 화면 방향 잠금 미지원:', (err as Error).message)
    }
  }, [])

  const unlockOrientation = useCallback(() => {
    try {
      const orientation = screen.orientation as ScreenOrientation & { unlock?: () => void }
      if (orientation && typeof orientation.unlock === 'function') {
        orientation.unlock()
        console.log('📱 [Fullscreen] 화면 방향 잠금 해제')
      }
    } catch (err) {
      // 무시
    }
  }, [])

  // 전체화면 진입/종료 핸들러
  const enterFullscreen = useCallback(async () => {
    try {
      setFullscreenLayoutType(isDesktop ? 'desktop' : 'mobile')
      
      const element = fullscreenContainerRef.current
      if (element) {
        // 먼저 표준 Fullscreen API 시도
        if (element.requestFullscreen) {
          await element.requestFullscreen()
          // 모바일에서 가로모드 강제 (전체화면 진입 후 호출해야 작동)
          if (!isDesktop) {
            await lockLandscapeOrientation()
          }
          return
        } else if ((element as any).webkitRequestFullscreen) {
          await (element as any).webkitRequestFullscreen()
          if (!isDesktop) {
            await lockLandscapeOrientation()
          }
          return
        } else if ((element as any).msRequestFullscreen) {
          await (element as any).msRequestFullscreen()
          if (!isDesktop) {
            await lockLandscapeOrientation()
          }
          return
        }
      }
      
      // Fullscreen API가 지원되지 않는 경우 (iOS 등) CSS 기반 가상 전체화면 사용
      setIsPseudoFullscreen(true)
      setIsFullscreen(true)
    } catch (err) {
      // Fullscreen API 실패 시 CSS 기반 가상 전체화면으로 폴백
      console.warn('Fullscreen API 실패, CSS 기반 전체화면 사용:', err)
      setIsPseudoFullscreen(true)
      setIsFullscreen(true)
    }
  }, [isDesktop, lockLandscapeOrientation])

  const exitFullscreen = useCallback(async () => {
    try {
      // 화면 방향 잠금 해제
      unlockOrientation()
      
      // CSS 기반 가상 전체화면인 경우
      if (isPseudoFullscreen) {
        setIsPseudoFullscreen(false)
        setIsFullscreen(false)
        setFullscreenLayoutType(null)
        return
      }
      
      // 표준 Fullscreen API 종료
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else if ((document as any).webkitExitFullscreen) {
        await (document as any).webkitExitFullscreen()
      } else if ((document as any).msExitFullscreen) {
        await (document as any).msExitFullscreen()
      }
    } catch (err) {
      console.error('전체화면 종료 실패:', err)
      // 오류 발생 시에도 상태 초기화
      setIsPseudoFullscreen(false)
      setIsFullscreen(false)
      setFullscreenLayoutType(null)
    }
  }, [isPseudoFullscreen, unlockOrientation])

  // 전체화면 상태 변경 감지
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isNowFullscreen = !!document.fullscreenElement
      setIsFullscreen(isNowFullscreen)
      
      if (!isNowFullscreen) {
        setFullscreenLayoutType(null)
        // 전체화면 종료 시 화면 방향 잠금 해제 (외부에서 종료된 경우 대비)
        unlockOrientation()
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    document.addEventListener('msfullscreenchange', handleFullscreenChange)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
      document.removeEventListener('msfullscreenchange', handleFullscreenChange)
    }
  }, [unlockOrientation])

  // 가상 전체화면에서 ESC 키/뒤로가기 처리
  useEffect(() => {
    if (!isPseudoFullscreen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setIsPseudoFullscreen(false)
        setIsFullscreen(false)
        setFullscreenLayoutType(null)
      }
    }

    // 뒤로가기 버튼 처리를 위한 history 상태 추가
    window.history.pushState({ pseudoFullscreen: true }, '')
    
    const handlePopState = () => {
      if (isPseudoFullscreen) {
        setIsPseudoFullscreen(false)
        setIsFullscreen(false)
        setFullscreenLayoutType(null)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('popstate', handlePopState)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('popstate', handlePopState)
    }
  }, [isPseudoFullscreen])

  // 브라우저 뒤로가기 감지
  useEffect(() => {
    let isHandlingPopState = false

    const handlePopState = () => {
      if (isHandlingPopState) return
      isHandlingPopState = true
      handleMinimize()
      setTimeout(() => { isHandlingPopState = false }, 100)
    }

    const relativeUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
    try {
      window.history.pushState(null, '', relativeUrl)
    } catch (error) {
      // ignore
    }
    
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [handleMinimize])

  // 영상 도네이션 재생 핸들러
  const handlePlayVideo = useCallback(async (_videoUrl: string, donation: StreamDonation) => {
    const success = await playVideo(donation)
    if (success) {
      setIsDonationListOpen(false)
      toast.success('영상 재생을 시작합니다')
    } else {
      toast.error('영상 재생에 실패했습니다')
    }
  }, [playVideo])

  // 레이아웃 결정: 전체화면일 때는 진입 시점의 레이아웃 유지
  const useDesktopLayout = isFullscreen 
    ? fullscreenLayoutType === 'desktop' 
    : isDesktop

  // 모바일 가로모드 또는 전체화면 (PC가 아닌 경우)
  // 이 경우 비디오 60% + 사이드패널 40%로 분리
  const useMobileLandscapeLayout = !useDesktopLayout && (isLandscape || isFullscreen)

  // 로딩 상태
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin" />
          <p className="text-white">로딩 중...</p>
        </div>
      </div>
    )
  }

  // 에러 또는 방 없음
  if (roomError || !room) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-center">
          <p className="text-white mb-4">방을 찾을 수 없습니다</p>
          <button
            onClick={() => navigate({ to: '/stream/live' })}
            className="px-6 py-2 bg-purple-500 text-white rounded-lg"
          >
            목록으로 돌아가기
          </button>
        </div>
      </div>
    )
  }

  // 종료된 방
  if (room.status === 'ended') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-center">
          <p className="text-white mb-4">종료된 방송입니다</p>
          <button
            onClick={() => navigate({ to: '/stream/live' })}
            className="px-6 py-2 bg-purple-500 text-white rounded-lg"
          >
            목록으로 돌아가기
          </button>
        </div>
      </div>
    )
  }

  // 리허설 상태
  if (room.status === 'scheduled') {
    if (isHost) {
      navigate({ to: '/stream/video/hls-rehearsal/$roomId', params: { roomId } })
      return null
    }
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="text-center">
          <p className="text-white mb-4">아직 방송이 시작되지 않았습니다</p>
          <button
            onClick={() => navigate({ to: '/stream/live' })}
            className="px-6 py-2 bg-purple-500 text-white rounded-lg"
          >
            목록으로 돌아가기
          </button>
        </div>
      </div>
    )
  }

  // 통합 레이아웃
  // 핵심: HlsVideoPlayer는 항상 첫 번째 자식으로 렌더링되어 리마운트되지 않음
  // 모든 조건부 UI는 별도 레이어로 렌더링
  
  // 비디오 영역 스타일 계산
  const showSidePanel = useDesktopLayout && !isFullscreen && !hudHidden
  const showHeader = useDesktopLayout && !isFullscreen
  // 모바일 가로모드 사이드패널 (40%)
  const showMobileLandscapeSidePanel = useMobileLandscapeLayout
  
  return (
    <div 
      ref={fullscreenContainerRef} 
      className={`
        ${isPseudoFullscreen 
          ? 'fixed inset-0 z-[9999] bg-black' // CSS 기반 가상 전체화면 (모바일용)
          : `relative w-full ${useDesktopLayout ? 'bg-[#0d0b12] overflow-x-auto overflow-y-hidden' : 'bg-black overflow-hidden'}`
        }
      `}
      style={{ 
        // iOS Safari 100vh 문제 대응: dvh (dynamic viewport height) 사용
        // svh도 가능하지만 dvh가 더 동적으로 반응 (주소창 숨김/표시)
        // 전체화면이 아닐 때만 적용
        ...(!isPseudoFullscreen && { 
          height: '100dvh',
        }),
        minWidth: useDesktopLayout && !isPseudoFullscreen ? '1200px' : undefined,
        // iOS Safari에서 주소창/탭바 영역까지 확장
        ...(isPseudoFullscreen && { 
          width: '100vw', 
          height: '100vh',
          // iOS safe area 무시하고 전체 화면 사용
          paddingTop: 'env(safe-area-inset-top, 0)',
          paddingBottom: 'env(safe-area-inset-bottom, 0)',
        })
      }}
    >
      {/* ===== 1. HLS 비디오 플레이어 - 항상 첫 번째 자식 (인덱스 0 고정) ===== */}
      <div 
        className="absolute bg-black transition-all duration-200"
        style={{
          top: showHeader ? '52px' : '0',
          right: showSidePanel ? '380px' : showMobileLandscapeSidePanel ? '40%' : '0',
          left: '0',
          bottom: '0',
        }}
      >
        <HlsVideoPlayer
          hlsUrl={hlsUrl || null}
          roomTitle={room.title}
          hostName={hostInfo.name}
          hostInitial={hostInfo.initial}
          isConnecting={isHlsLoading}
        />
      </div>

      {/* ===== 2. 오버레이 레이어들 - 비디오 위에 표시 ===== */}
      <div 
        className="absolute pointer-events-none"
        style={{
          top: showHeader ? '52px' : '0',
          right: showSidePanel ? '380px' : showMobileLandscapeSidePanel ? '40%' : '0',
          left: '0',
          bottom: '0',
        }}
      >
        {/* PC 비디오 오버레이 */}
        <div className={`pointer-events-auto ${useDesktopLayout && !isFullscreen ? '' : 'hidden'}`}>
          <DesktopVideoOverlay
            roomId={roomId}
            isHost={isHost}
            rankings={rankings}
            onOpenMissionPanel={() => setIsMissionPanelOpen(true)}
          />
        </div>

        {/* 전체화면 모드 UI (PC만 - 모바일 전체화면은 가로모드 레이아웃 사용) */}
        <div className={`absolute inset-0 pointer-events-auto ${isFullscreen && useDesktopLayout ? '' : 'hidden'}`}>
          <FullscreenOverlay
            isDesktopLayout={useDesktopLayout}
            roomId={roomId}
            isHost={isHost}
            isModeratorView={isModeratorView}
            isChatOpen={isFullscreenChatOpen}
            onToggleChat={() => setIsFullscreenChatOpen(prev => !prev)}
            filteredChats={filteredChats}
            pinnedMessage={pinnedMessage}
            rankMap={rankMap}
            chatContainerRef={chatContainerRef}
            getSenderRole={getSenderRole}
            onMessageClick={handleChatMessageClick}
            onChatHideToggle={isModeratorView ? handleChatHideToggle : undefined}
            onUnpinMessage={handleUnpinMessage}
            onOpenDonationList={() => setIsDonationListOpen(true)}
            onOpenDonationSheet={() => setIsDonationSheetOpen(true)}
            onExitFullscreen={exitFullscreen}
          />
        </div>

        {/* 모바일 가로모드/전체화면 비디오 영역 컨트롤 (나가기 버튼 등) */}
        <div className={`absolute inset-0 pointer-events-auto ${useMobileLandscapeLayout ? '' : 'hidden'}`}>
          <MobileLandscapeVideoControls
            roomTitle={room.title}
            viewerCount={viewers.length > 0 ? viewers.length : room.viewer_count}
            hostInfo={hostInfo}
            user={user}
            isHost={isHost}
            isAdmin={isAdmin}
            canUseHud={canUseHud}
            hudHidden={hudHidden}
            isFollowing={isFollowing}
            isFollowLoading={isFollowLoading}
            donationStats={donationStats}
            isFullscreen={isFullscreen}
            onToggleFollow={toggleFollow}
            onToggleHud={() => setIsHudHidden(prev => !prev)}
            onOpenHudGuide={() => setIsHudGuideOpen(true)}
            onOpenDonationList={() => setIsDonationListOpen(true)}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenSidebar={() => window.dispatchEvent(new CustomEvent('openVideoRoomSidebar'))}
            onMinimize={handleMinimize}
            onExitFullscreen={exitFullscreen}
          />
        </div>

        {/* 모바일 세로모드 UI (가로모드/전체화면이 아닐 때만) */}
        <div className={`absolute inset-0 pointer-events-auto ${!useDesktopLayout && !useMobileLandscapeLayout ? '' : 'hidden'}`}>
          <MobileVideoRoomUI
            roomId={roomId}
            roomTitle={room.title}
            viewerCount={viewers.length > 0 ? viewers.length : room.viewer_count}
            hostInfo={hostInfo}
            user={user}
            isHost={isHost}
            isAdmin={isAdmin}
            isModeratorView={isModeratorView}
            isFollowing={isFollowing}
            isFollowLoading={isFollowLoading}
            onToggleFollow={toggleFollow}
            canUseHud={canUseHud}
            hudHidden={hudHidden}
            onToggleHud={() => setIsHudHidden(prev => !prev)}
            onOpenHudGuide={() => setIsHudGuideOpen(true)}
            rankings={rankings}
            donationStats={donationStats}
            onOpenDonationList={() => setIsDonationListOpen(true)}
            onOpenDonationSheet={() => setIsDonationSheetOpen(true)}
            isChatOpen={isChatOpen}
            onToggleChat={handleToggleChat}
            filteredChats={filteredChats}
            pinnedMessage={pinnedMessage}
            rankMap={rankMap}
            chatContainerRef={chatContainerRef}
            getSenderRole={getSenderRole}
            onMessageClick={handleChatMessageClick}
            onChatHideToggle={isModeratorView ? handleChatHideToggle : undefined}
            onUnpinMessage={handleUnpinMessage}
            onOpenMissionPanel={() => setIsMissionPanelOpen(true)}
            onMinimize={handleMinimize}
            onEnterFullscreen={enterFullscreen}
            onOpenSettings={() => setIsSettingsOpen(true)}
            onOpenSidebar={() => window.dispatchEvent(new CustomEvent('openVideoRoomSidebar'))}
          />
        </div>

        {/* 후원 이펙트 오버레이 */}
        <div className="pointer-events-auto">
          <DonationEffectOverlay effects={activeEffects} />
        </div>

        {/* 룰렛 오버레이 */}
        <div className="pointer-events-auto">
          <RouletteOverlay
            roulette={currentRoulette}
            queueLength={rouletteQueueLength}
            isHost={isHost}
            onSkip={skipCurrentRoulette}
          />
        </div>

        {/* 영상 도네이션 플레이어 */}
        <div className={`pointer-events-auto ${currentVideo ? '' : 'hidden'}`}>
          {currentVideo && (
            <VideoDonationPlayer
              video={currentVideo}
              remainingTime={remainingTime}
              onClose={stopVideo}
              isHost={isHost}
            />
          )}
        </div>
      </div>

      {/* ===== 3. PC 상단 헤더 - CSS로 숨김 처리 ===== */}
      <div 
        className={`absolute top-0 left-0 ${showHeader ? '' : 'hidden'}`}
        style={{ right: showSidePanel ? '380px' : '0' }}
      >
        <DesktopHeader
          isHost={isHost}
          canUseHud={canUseHud}
          hudHidden={hudHidden}
          onToggleHud={() => setIsHudHidden(prev => !prev)}
          onOpenHudGuide={() => setIsHudGuideOpen(true)}
          donationStats={donationStats}
          onOpenDonationList={() => setIsDonationListOpen(true)}
          onMinimize={handleMinimize}
          onEnterFullscreen={enterFullscreen}
        />
      </div>

      {/* ===== 4. PC 사이드 패널 - CSS로 숨김 처리 ===== */}
      <div className={`absolute top-0 right-0 bottom-0 w-[380px] ${showSidePanel ? '' : 'hidden'}`}>
        <DesktopSidePanel
          roomId={roomId}
          roomTitle={room.title}
          roomDescription={room.description}
          viewerCount={viewers.length > 0 ? viewers.length : room.viewer_count}
          hostInfo={hostInfo}
          user={user}
          isHost={isHost}
          isAdmin={isAdmin}
          isModeratorView={isModeratorView}
          isFollowing={isFollowing}
          isFollowLoading={isFollowLoading}
          onToggleFollow={toggleFollow}
          rankings={rankings}
          onOpenDonationList={() => setIsDonationListOpen(true)}
          onOpenDonationSheet={() => setIsDonationSheetOpen(true)}
          onOpenMissionPanel={() => setIsMissionPanelOpen(true)}
          filteredChats={filteredChats}
          pinnedMessage={pinnedMessage}
          rankMap={rankMap}
          chatContainerRef={chatContainerRef}
          getSenderRole={getSenderRole}
          onMessageClick={handleChatMessageClick}
          onChatHideToggle={isModeratorView ? handleChatHideToggle : undefined}
          onUnpinMessage={handleUnpinMessage}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenSidebar={() => window.dispatchEvent(new CustomEvent('openVideoRoomSidebar'))}
        />
      </div>

      {/* ===== 4-1. 모바일 가로모드/전체화면 사이드 패널 (40%) ===== */}
      <div className={`absolute top-0 right-0 bottom-0 w-[40%] ${showMobileLandscapeSidePanel ? '' : 'hidden'}`}>
        <MobileLandscapeSidePanel
          roomId={roomId}
          isHost={isHost}
          isModeratorView={isModeratorView}
          rankings={rankings}
          filteredChats={filteredChats}
          pinnedMessage={pinnedMessage}
          rankMap={rankMap}
          chatContainerRef={chatContainerRef}
          getSenderRole={getSenderRole}
          onMessageClick={handleChatMessageClick}
          onChatHideToggle={isModeratorView ? handleChatHideToggle : undefined}
          onUnpinMessage={handleUnpinMessage}
          onOpenDonationList={() => setIsDonationListOpen(true)}
          onOpenDonationSheet={() => setIsDonationSheetOpen(true)}
          onOpenMissionPanel={() => setIsMissionPanelOpen(true)}
        />
      </div>

      {/* ===== 5. 사이드바 - CSS로 숨김 처리 ===== */}
      <div className={isFullscreen ? 'hidden' : ''}>
        <StreamRoomSidebar
          isOpen={showSidebar}
          onClose={closeSidebar}
          roomId={roomId}
          roomTitle={room.title}
          hosts={hosts}
          viewers={viewers}
          isAdmin={isAdmin}
          isHost={isHost}
          roomType="video"
          hostPartnerId={hostInfo.partnerId}
          hostMemberId={room.host_member_id}
          onForceEndRoom={isAdmin ? handleForceEndRoom : undefined}
        />
      </div>

      {/* ===== 6. 비밀번호 모달 ===== */}
      <div className={showPasswordModal ? '' : 'hidden'}>
        {showPasswordModal && (
          <VoiceRoomPasswordModal
            onSubmit={handleJoinRoom}
            onClose={() => {}}
            error={passwordError}
          />
        )}
      </div>

      {/* ===== 7. 모달들 ===== */}
      <VideoRoomModals
        roomId={roomId}
        room={room}
        hosts={hosts}
        isHost={isHost}
        isAdmin={isAdmin}
        isModeratorView={isModeratorView}
        canUseHud={canUseHud}
        isChatActionSheetOpen={isChatActionSheetOpen}
        onCloseChatActionSheet={() => setIsChatActionSheetOpen(false)}
        selectedChatMessage={selectedChatMessage}
        onChatHideToggle={handleChatHideToggle}
        onChatPinToggle={handleChatPinToggle}
        onOpenProfileFromChat={handleOpenProfileFromChat}
        canOpenSelectedChatProfile={canOpenSelectedChatProfile}
        isProfileSheetOpen={isProfileSheetOpen}
        onCloseProfileSheet={handleCloseProfileSheet}
        selectedParticipant={selectedParticipant}
        selectedParticipantIsSpeaker={selectedParticipantIsSpeaker}
        hostPartnerId={hostInfo.partnerId}
        hostMemberId={hostInfo.memberId}
        isDonationSheetOpen={isDonationSheetOpen}
        onCloseDonationSheet={() => setIsDonationSheetOpen(false)}
        isDonationListOpen={isDonationListOpen}
        onCloseDonationList={() => setIsDonationListOpen(false)}
        onPlayVideo={handlePlayVideo}
        isMissionPanelOpen={isMissionPanelOpen}
        onCloseMissionPanel={() => setIsMissionPanelOpen(false)}
        isHudGuideOpen={isHudGuideOpen}
        onCloseHudGuide={() => setIsHudGuideOpen(false)}
        isSettingsOpen={isSettingsOpen}
        onCloseSettings={() => setIsSettingsOpen(false)}
      />
    </div>
  )
}
