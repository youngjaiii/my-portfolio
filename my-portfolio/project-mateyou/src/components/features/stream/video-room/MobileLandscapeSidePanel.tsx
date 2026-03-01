/**
 * MobileLandscapeSidePanel - 모바일 가로모드/전체화면용 사이드 패널
 * 
 * 비디오 영역과 분리된 우측 40% 사이드바
 * - 상단: 랭킹 티커 + 미션 정보
 * - 하단: 채팅
 * 매우 컴팩트한 UI (작은 폰트, 꾹꾹 눌러담기)
 */

import { ChatPanel } from '@/components/features/stream/ChatPanel'
import {
  ActiveMissionDisplay,
  MissionListBar,
} from '@/components/features/stream/donation'
import { DonationRankingTicker } from '@/components/features/stream/DonationRankingTicker'
import type { StreamChat } from '@/hooks/useVoiceRoom'

interface MobileLandscapeSidePanelProps {
  roomId: string
  isHost: boolean
  isModeratorView: boolean
  rankings: any[]
  filteredChats: StreamChat[]
  pinnedMessage: StreamChat | null
  rankMap: Map<string, number>
  chatContainerRef: React.RefObject<HTMLDivElement | null>
  getSenderRole: (senderId: string) => 'owner' | 'speaker' | 'listener'
  onMessageClick: (message: StreamChat) => void
  onChatHideToggle?: (messageId: number, isHidden: boolean) => Promise<void>
  onUnpinMessage: () => void
  onOpenDonationList: () => void
  onOpenDonationSheet: () => void
  onOpenMissionPanel: () => void
}

export function MobileLandscapeSidePanel({
  roomId,
  isHost,
  isModeratorView,
  rankings,
  filteredChats,
  pinnedMessage,
  rankMap,
  chatContainerRef,
  getSenderRole,
  onMessageClick,
  onChatHideToggle,
  onUnpinMessage,
  onOpenDonationList,
  onOpenDonationSheet,
  onOpenMissionPanel,
}: MobileLandscapeSidePanelProps) {
  return (
    <div 
      className="w-full bg-[#0d0b12] flex flex-col overflow-hidden"
      style={{
        // iOS Safari 100vh 문제 대응: dvh 사용
        // 키보드 대응은 --safe-viewport-height로 폴백
        height: 'var(--safe-viewport-height, 100dvh)',
      }}
    >
      {/* 상단: 랭킹 티커 + 미션 - 컴팩트 */}
      <div className="flex-shrink-0 border-b border-white/10">
        {/* 랭킹 티커 */}
        {rankings.length > 0 && (
          <div className="px-1 py-0.5">
            <DonationRankingTicker rankings={rankings} variant="dark" />
          </div>
        )}
        
        {/* 미션 (호스트: 목록바 / 시청자: 활성 미션) */}
        {isHost ? (
          <div className="px-1 py-0.5">
            <MissionListBar roomId={roomId} isHost={isHost} maxItems={3} />
          </div>
        ) : (
          <div className="px-1 py-0.5">
            <ActiveMissionDisplay
              roomId={roomId}
              maxItems={2}
              compact={true}
              onOpenPanel={onOpenMissionPanel}
            />
          </div>
        )}
      </div>

      {/* 채팅 영역 (남은 공간 전체) */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <ChatPanel
          roomId={roomId}
          filteredChats={filteredChats}
          pinnedMessage={pinnedMessage}
          isChatOpen={true}
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
          variant="mobile-landscape"
        />
      </div>
    </div>
  )
}
