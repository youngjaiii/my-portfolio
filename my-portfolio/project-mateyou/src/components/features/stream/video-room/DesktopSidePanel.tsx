/**
 * DesktopSidePanel - PC 레이아웃 우측 사이드 패널
 */

import { ChatPanel } from '@/components/features/stream/ChatPanel'
import {
  ActiveMissionDisplay,
  MissionListBar,
} from '@/components/features/stream/donation'
import { DonationRankingTicker } from '@/components/features/stream/DonationRankingTicker'
import { HostInfoSection } from '@/components/features/stream/HostInfoSection'
import type { StreamChat } from '@/hooks/useVoiceRoom'

interface DesktopSidePanelProps {
  // 방 정보
  roomId: string
  roomTitle: string
  roomDescription?: string | null
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
  onToggleFollow?: () => void
  
  // 후원/랭킹
  rankings?: any[]
  onOpenDonationList: () => void
  onOpenDonationSheet: () => void
  
  // 미션
  onOpenMissionPanel?: () => void
  
  // 채팅
  filteredChats: StreamChat[]
  pinnedMessage: StreamChat | null
  rankMap: Map<string, number>
  chatContainerRef: React.RefObject<HTMLDivElement | null>
  getSenderRole: (senderId: string) => 'owner' | 'speaker' | 'listener'
  onMessageClick: (message: StreamChat) => void
  onChatHideToggle?: (messageId: number, isHidden: boolean) => Promise<void>
  onUnpinMessage: () => void
  
  // 네비게이션
  onOpenSettings: () => void
  onOpenSidebar: () => void
}

export function DesktopSidePanel({
  roomId,
  roomTitle,
  roomDescription,
  viewerCount,
  hostInfo,
  user,
  isHost,
  isAdmin,
  isModeratorView,
  isFollowing,
  isFollowLoading,
  onToggleFollow,
  rankings = [],
  onOpenDonationList,
  onOpenDonationSheet,
  onOpenMissionPanel,
  filteredChats,
  pinnedMessage,
  rankMap,
  chatContainerRef,
  getSenderRole,
  onMessageClick,
  onChatHideToggle,
  onUnpinMessage,
  onOpenSettings,
  onOpenSidebar,
}: DesktopSidePanelProps) {
  return (
    <div className="w-full h-full flex flex-col border-l border-white/10 bg-gradient-to-b from-[#1a1825] to-[#110f1a]">
      {/* 호스트 정보 섹션 */}
      <HostInfoSection
        hostName={hostInfo.name}
        hostProfileImage={hostInfo.profileImage}
        hostInitial={hostInfo.initial}
        followerCount={hostInfo.followerCount}
        isFollowing={isFollowing}
        isFollowLoading={isFollowLoading}
        onToggleFollow={hostInfo.partnerId && !isHost && user ? onToggleFollow : undefined}
        roomTitle={roomTitle}
        roomDescription={roomDescription}
        viewerCount={viewerCount}
        isHost={isHost}
        isAdmin={isAdmin}
        onOpenSettings={onOpenSettings}
        onOpenSidebar={onOpenSidebar}
      />

      {/* 후원 랭킹 티커 */}
      {rankings.length > 0 && (
        <DonationRankingTicker rankings={rankings} variant="dark" />
      )}

      {/* 미션 목록 - 호스트용 또는 시청자용 */}
      {isHost ? (
        <MissionListBar roomId={roomId} isHost={isHost} maxItems={3} />
      ) : (
        <div className="px-3 py-2">
          <ActiveMissionDisplay
            roomId={roomId}
            maxItems={2}
            compact={true}
            onOpenPanel={onOpenMissionPanel}
          />
        </div>
      )}

      {/* 채팅 패널 */}
      <div className="flex-1 min-h-0">
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
          variant="desktop"
          hideChatHeader={false}
        />
      </div>
    </div>
  )
}
