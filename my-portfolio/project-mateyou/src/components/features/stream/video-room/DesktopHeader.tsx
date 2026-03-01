/**
 * DesktopHeader - PC 레이아웃 상단 헤더 바
 */

import { StreamHudControls } from '@/components/features/stream/StreamHudControls'
import {
  ArrowLeft,
  Gift,
  Maximize,
} from 'lucide-react'

interface DesktopHeaderProps {
  // 사용자 상태
  isHost: boolean
  
  // HUD 컨트롤
  canUseHud: boolean
  hudHidden: boolean
  onToggleHud: () => void
  onOpenHudGuide: () => void
  
  // 후원
  donationStats: { pendingCount: number; acceptedMissionCount: number }
  onOpenDonationList: () => void
  
  // 네비게이션
  onMinimize: () => void
  onEnterFullscreen: () => void
}

export function DesktopHeader({
  isHost,
  canUseHud,
  hudHidden,
  onToggleHud,
  onOpenHudGuide,
  donationStats,
  onOpenDonationList,
  onMinimize,
  onEnterFullscreen,
}: DesktopHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 bg-[#1a1825] border-b border-white/5">
      <div className="flex items-center gap-3">
        <button
          onClick={onMinimize}
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          <span className="text-red-400 font-semibold text-sm">LIVE</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* 전체화면 버튼 */}
        <button
          onClick={onEnterFullscreen}
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white transition-colors"
          title="전체화면"
        >
          <Maximize className="w-5 h-5" />
        </button>

        {canUseHud && (
          <StreamHudControls
            isHudHidden={hudHidden}
            onToggleHud={onToggleHud}
            onOpenGuide={onOpenHudGuide}
          />
        )}

        {/* 호스트용 컨트롤 */}
        {isHost && (
          <button
            onClick={onOpenDonationList}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 rounded-lg text-white text-sm font-medium shadow-lg shadow-amber-500/20 hover:from-amber-400 hover:to-orange-400 transition-all"
          >
            <Gift className="w-4 h-4" />
            <span>후원 관리</span>
            {(donationStats.pendingCount > 0 || donationStats.acceptedMissionCount > 0) && (
              <span className="px-1.5 py-0.5 text-[10px] bg-white/30 rounded-full min-w-[18px] text-center font-bold">
                {donationStats.pendingCount + donationStats.acceptedMissionCount}
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  )
}
