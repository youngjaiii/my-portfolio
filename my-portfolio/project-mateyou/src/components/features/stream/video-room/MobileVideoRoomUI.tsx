/**
 * MobileVideoRoomUI - 모바일 세로모드 레이아웃 UI 컴포넌트
 * 
 * HLS 플레이어 위에 오버레이되는 모바일용 UI (세로모드 전용)
 * - 상단 헤더
 * - 하단 채팅
 * - 터치하면 UI 토글, 시간 지나면 자동 숨김 (채팅/후원 제외)
 * 
 * 가로모드/전체화면은 상위 컴포넌트에서 MobileLandscapeLayout으로 처리
 */

import { ChatPanel } from '@/components/features/stream/ChatPanel'
import {
  ActiveMissionDisplay,
  MissionListBar,
} from '@/components/features/stream/donation'
import { DonationRankingTicker } from '@/components/features/stream/DonationRankingTicker'
import { StreamHudControls } from '@/components/features/stream/StreamHudControls'
import type { StreamChat } from '@/hooks/useVoiceRoom'
import {
  ArrowLeft,
  Gift,
  Maximize,
  MessageSquare,
  Settings,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

interface MobileVideoRoomUIProps {
  // 방 정보
  roomId: string
  roomTitle: string
  viewerCount: number
  
  // 호스트 정보
  hostInfo: {
    name?: string
    profileImage?: string
    initial?: string
    partnerId?: string | null
    memberId?: string | null
    followerCount: number
  }
  
  // 사용자 상태
  user: any
  isHost: boolean
  isAdmin: boolean
  isModeratorView: boolean
  
  // 팔로우
  isFollowing: boolean
  isFollowLoading: boolean
  onToggleFollow: () => void
  
  // HUD 컨트롤
  canUseHud: boolean
  hudHidden: boolean
  onToggleHud: () => void
  onOpenHudGuide: () => void
  
  // 후원
  rankings: any[]
  donationStats: { pendingCount: number; acceptedMissionCount: number }
  onOpenDonationList: () => void
  onOpenDonationSheet: () => void
  
  // 채팅
  isChatOpen: boolean
  onToggleChat: () => void
  filteredChats: StreamChat[]
  pinnedMessage: StreamChat | null
  rankMap: Map<string, number>
  chatContainerRef: React.RefObject<HTMLDivElement | null>
  getSenderRole: (senderId: string) => 'owner' | 'speaker' | 'listener'
  onMessageClick: (message: StreamChat) => void
  onChatHideToggle?: (messageId: number, isHidden: boolean) => Promise<void>
  onUnpinMessage: () => void
  
  // 미션
  onOpenMissionPanel: () => void
  
  // 네비게이션
  onMinimize: () => void
  onEnterFullscreen: () => void
  onOpenSettings: () => void
  onOpenSidebar: () => void
}

const AUTO_HIDE_DELAY = 5000 // 5초 후 자동 숨김

export function MobileVideoRoomUI({
  roomId,
  roomTitle,
  viewerCount,
  hostInfo,
  user,
  isHost,
  isAdmin,
  isModeratorView,
  isFollowing,
  isFollowLoading,
  onToggleFollow,
  canUseHud,
  hudHidden,
  onToggleHud,
  onOpenHudGuide,
  rankings,
  donationStats,
  onOpenDonationList,
  onOpenDonationSheet,
  isChatOpen,
  onToggleChat,
  filteredChats,
  pinnedMessage,
  rankMap,
  chatContainerRef,
  getSenderRole,
  onMessageClick,
  onChatHideToggle,
  onUnpinMessage,
  onOpenMissionPanel,
  onMinimize,
  onEnterFullscreen,
  onOpenSettings,
  onOpenSidebar,
}: MobileVideoRoomUIProps) {
  // UI 자동 숨김 상태 (채팅/후원 제외)
  const [isUIVisible, setIsUIVisible] = useState(true)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 자동 숨김 타이머 리셋
  const resetHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
    }
    hideTimerRef.current = setTimeout(() => {
      setIsUIVisible(false)
    }, AUTO_HIDE_DELAY)
  }, [])

  // 컴포넌트 마운트 시 타이머 시작
  useEffect(() => {
    resetHideTimer()
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
      }
    }
  }, [resetHideTimer])

  // 화면 터치 핸들러 (채팅/후원 영역 제외)
  const handleScreenTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    // 버튼이나 인터랙티브 요소 클릭은 무시
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('input') || target.closest('a')) {
      return
    }
    
    setIsUIVisible(prev => !prev)
    if (!isUIVisible) {
      resetHideTimer()
    }
  }, [isUIVisible, resetHideTimer])

  // UI 표시 상태: HUD 숨김이 아니고, UI가 표시 상태일 때
  const showUI = !hudHidden && isUIVisible

  // 세로모드 레이아웃
  return (
    <>
      {/* 터치 영역 - UI 토글용 */}
      <div 
        className="absolute inset-0 z-10"
        onClick={handleScreenTap}
      />

      {/* 화면 UI 토글/가이드 (UI 숨김 상태에서도 유지) */}
      {canUseHud && hudHidden && (
        <StreamHudControls
          isHudHidden={hudHidden}
          onToggleHud={onToggleHud}
          onOpenGuide={onOpenHudGuide}
          className="absolute top-4 right-4 z-30"
        />
      )}

      {/* 상단 헤더 (반투명) - 자동 숨김 대상 */}
      <div 
        className={`absolute top-0 left-0 right-0 z-20 transition-opacity duration-300 ${showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        <div className={`bg-gradient-to-b ${canUseHud ? 'from-black/40' : 'from-black/60'} to-transparent p-3`}>
          <div className="flex items-center justify-between gap-2">
            {/* 좌측: 뒤로가기 + 제목 (컴팩트) */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <button
                onClick={onMinimize}
                className="w-8 h-8 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white flex-shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="min-w-0 flex-1">
                <h1 className="text-white font-bold text-[12px] truncate">{roomTitle}</h1>
                <p className="text-white/70 text-[10px]">{viewerCount}명 시청 중</p>
              </div>
            </div>
            
            {/* 우측: 버튼들 (컴팩트) */}
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* 팔로우 버튼 */}
              {hostInfo.partnerId && !isHost && user && (
                <button
                  onClick={onToggleFollow}
                  disabled={isFollowLoading}
                  className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold ${
                    isFollowing
                      ? 'bg-white/20 text-white backdrop-blur-sm'
                      : 'bg-[#FE3A8F] text-white'
                  } ${isFollowLoading ? 'opacity-50' : ''}`}
                >
                  {isFollowing ? <UserCheck className="w-3 h-3" /> : <UserPlus className="w-3 h-3" />}
                  <span>{isFollowing ? '팔로잉' : '팔로우'}</span>
                </button>
              )}

              {/* 전체화면 버튼 */}
              <button
                onClick={onEnterFullscreen}
                className="w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white"
              >
                <Maximize className="w-3.5 h-3.5" />
              </button>

              {(isHost || isAdmin) && (
                <>
                  <StreamHudControls
                    isHudHidden={hudHidden}
                    onToggleHud={onToggleHud}
                    onOpenGuide={onOpenHudGuide}
                  />

                  {/* 시청자 관리 */}
                  <button
                    onClick={onOpenSidebar}
                    className="flex items-center gap-0.5 px-2 py-1 bg-black/50 backdrop-blur-sm rounded-full text-white"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span className="text-[10px]">{viewerCount}</span>
                  </button>
                  
                  {/* 방송 설정 (호스트만) */}
                  {isHost && (
                    <button
                      onClick={onOpenSettings}
                      className="w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white"
                    >
                      <Settings className="w-3.5 h-3.5" />
                    </button>
                  )}
                  
                  {/* 후원 관리 (호스트만) */}
                  {isHost && (
                    <button
                      onClick={onOpenDonationList}
                      className="flex items-center gap-0.5 px-2 py-1 bg-gradient-to-r from-amber-500/80 to-orange-500/80 backdrop-blur-sm rounded-full text-white"
                    >
                      <Gift className="w-3.5 h-3.5" />
                      {(donationStats.pendingCount > 0 || donationStats.acceptedMissionCount > 0) && (
                        <span className="text-[10px] bg-white/30 rounded-full px-1 min-w-[14px] text-center">
                          {donationStats.pendingCount + donationStats.acceptedMissionCount}
                        </span>
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        
        {/* 후원 랭킹 티커 */}
        {rankings.length > 0 && (
          <DonationRankingTicker rankings={rankings} variant="dark" />
        )}

        {/* 미션 목록 바 */}
        {isHost && (
          <MissionListBar roomId={roomId} isHost={isHost} maxItems={5} />
        )}
      </div>

      {/* 시청자용 미션 배지 (우측 상단) - 자동 숨김 대상 */}
      {!isHost && (
        <div className={`absolute top-24 right-2 z-20 max-w-[200px] transition-opacity duration-300 ${showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <ActiveMissionDisplay
            roomId={roomId}
            maxItems={2}
            compact={true}
            onOpenPanel={onOpenMissionPanel}
          />
        </div>
      )}

      {/* 하단 컨트롤 바 - 채팅은 항상 표시, 채팅 토글 버튼만 숨김 대상 */}
      <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/80 to-transparent">
        {/* 채팅 토글 버튼 - 자동 숨김 대상 */}
        <div className={`flex items-center justify-end px-3 py-1.5 transition-opacity duration-300 ${showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <button
            onClick={onToggleChat}
            className={`flex items-center gap-1 px-2 py-1 rounded-full backdrop-blur-sm text-[10px] font-medium ${
              isChatOpen 
                ? 'bg-purple-500/80 text-white' 
                : 'bg-black/50 text-white'
            }`}
          >
            <MessageSquare className="w-3 h-3" />
            <span>{isChatOpen ? '채팅 닫기' : '채팅'}</span>
          </button>
        </div>

        {/* 채팅 영역 - 항상 표시 (자동 숨김 제외) */}
        {isChatOpen && (
          <ChatPanel
            roomId={roomId}
            filteredChats={filteredChats}
            pinnedMessage={pinnedMessage}
            isChatOpen={isChatOpen}
            isHost={isHost}
            isModeratorView={isModeratorView}
            rankMap={rankMap}
            chatContainerRef={chatContainerRef}
            getSenderRole={getSenderRole}
            onMessageClick={onMessageClick}
            onHideToggle={onChatHideToggle}
            onUnpinMessage={onUnpinMessage}
            onOpenDonationList={onOpenDonationList}
            onOpenDonationSheet={onOpenDonationSheet}
            variant="mobile"
          />
        )}
      </div>
    </>
  )
}
