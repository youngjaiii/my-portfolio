/**
 * MobileLandscapeVideoControls - 모바일 가로모드/전체화면 비디오 영역 컨트롤
 * 
 * 비디오 영역 위에 오버레이되는 컴팩트한 컨트롤
 * - 터치하면 UI 토글
 * - 상단: 나가기, 제목, 팔로우, 설정 등
 */

import { StreamHudControls } from '@/components/features/stream/StreamHudControls'
import {
  ArrowLeft,
  Gift,
  Minimize2,
  Settings,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

interface MobileLandscapeVideoControlsProps {
  roomTitle: string
  viewerCount: number
  hostInfo: {
    partnerId?: string | null
  }
  user: any
  isHost: boolean
  isAdmin: boolean
  canUseHud: boolean
  hudHidden: boolean
  isFollowing: boolean
  isFollowLoading: boolean
  donationStats: { pendingCount: number; acceptedMissionCount: number }
  isFullscreen: boolean
  onToggleFollow: () => void
  onToggleHud: () => void
  onOpenHudGuide: () => void
  onOpenDonationList: () => void
  onOpenSettings: () => void
  onOpenSidebar: () => void
  onMinimize: () => void
  onExitFullscreen: () => void
}

const AUTO_HIDE_DELAY = 5000

export function MobileLandscapeVideoControls({
  roomTitle,
  viewerCount,
  hostInfo,
  user,
  isHost,
  isAdmin,
  canUseHud,
  hudHidden,
  isFollowing,
  isFollowLoading,
  donationStats,
  isFullscreen,
  onToggleFollow,
  onToggleHud,
  onOpenHudGuide,
  onOpenDonationList,
  onOpenSettings,
  onOpenSidebar,
  onMinimize,
  onExitFullscreen,
}: MobileLandscapeVideoControlsProps) {
  const [isUIVisible, setIsUIVisible] = useState(true)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const resetHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
    }
    hideTimerRef.current = setTimeout(() => {
      setIsUIVisible(false)
    }, AUTO_HIDE_DELAY)
  }, [])

  useEffect(() => {
    resetHideTimer()
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
      }
    }
  }, [resetHideTimer])

  const handleScreenTap = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('button') || target.closest('input') || target.closest('a')) {
      return
    }
    
    setIsUIVisible(prev => !prev)
    if (!isUIVisible) {
      resetHideTimer()
    }
  }, [isUIVisible, resetHideTimer])

  const showUI = !hudHidden && isUIVisible

  const handleExit = isFullscreen ? onExitFullscreen : onMinimize

  return (
    <>
      {/* 터치 영역 - UI 토글용 */}
      <div 
        className="absolute inset-0 z-10"
        onClick={handleScreenTap}
      />

      {/* HUD 컨트롤 (숨김 상태에서도) */}
      {canUseHud && hudHidden && (
        <StreamHudControls
          isHudHidden={hudHidden}
          onToggleHud={onToggleHud}
          onOpenGuide={onOpenHudGuide}
          className="absolute top-2 left-2 z-30"
        />
      )}

      {/* 상단 컨트롤 바 */}
      <div 
        className={`absolute top-0 left-0 right-0 z-20 transition-opacity duration-300 ${showUI ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      >
        <div className="bg-gradient-to-b from-black/60 to-transparent p-2">
          <div className="flex items-center justify-between gap-1">
            {/* 좌측: 나가기 + 제목 */}
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <button
                onClick={handleExit}
                className="w-6 h-6 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white flex-shrink-0"
              >
                {isFullscreen ? <Minimize2 className="w-3 h-3" /> : <ArrowLeft className="w-3 h-3" />}
              </button>
              <div className="min-w-0 flex-1">
                <h1 className="text-white font-bold text-[10px] truncate">{roomTitle}</h1>
                <p className="text-white/70 text-[8px]">{viewerCount}명</p>
              </div>
            </div>
            
            {/* 우측: 버튼들 (컴팩트) */}
            <div className="flex items-center gap-0.5 flex-shrink-0">
              {/* 팔로우 버튼 */}
              {hostInfo.partnerId && !isHost && user && (
                <button
                  onClick={onToggleFollow}
                  disabled={isFollowLoading}
                  className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-semibold ${
                    isFollowing ? 'bg-white/20 text-white' : 'bg-[#FE3A8F] text-white'
                  }`}
                >
                  {isFollowing ? <UserCheck className="w-2.5 h-2.5" /> : <UserPlus className="w-2.5 h-2.5" />}
                </button>
              )}

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
                    className="flex items-center gap-0.5 px-1 py-0.5 bg-black/50 rounded-full text-white"
                  >
                    <Users className="w-2.5 h-2.5" />
                    <span className="text-[8px]">{viewerCount}</span>
                  </button>
                  
                  {/* 방송 설정 (호스트만) */}
                  {isHost && (
                    <button
                      onClick={onOpenSettings}
                      className="w-5 h-5 rounded-full bg-black/50 flex items-center justify-center text-white"
                    >
                      <Settings className="w-2.5 h-2.5" />
                    </button>
                  )}
                  
                  {/* 후원 관리 (호스트만) */}
                  {isHost && (
                    <button
                      onClick={onOpenDonationList}
                      className="flex items-center gap-0.5 px-1 py-0.5 bg-gradient-to-r from-amber-500/80 to-orange-500/80 rounded-full text-white"
                    >
                      <Gift className="w-2.5 h-2.5" />
                      {(donationStats.pendingCount > 0 || donationStats.acceptedMissionCount > 0) && (
                        <span className="text-[8px] bg-white/30 rounded-full px-0.5 min-w-[10px] text-center">
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
      </div>
    </>
  )
}
