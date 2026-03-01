/**
 * VideoRoomModals - 라이브 방송 모달/시트 모음
 */

import { ChatActionSheet } from '@/components/features/stream/ChatActionSheet'
import type { StreamDonation } from '@/components/features/stream/donation/types'
import {
  DonationControlCenter,
  ViewerMissionPanel,
} from '@/components/features/stream/donation'
import { ParticipantProfileSheet } from '@/components/features/stream/ParticipantProfileSheet'
import { StreamHudGuideSheet } from '@/components/features/stream/StreamHudGuideSheet'
import { StreamDonationSheetV2 } from '@/components/features/stream/StreamDonationSheetV2'
import { StreamSettingsSheet } from '@/components/modals'
import type { StreamChat, StreamHost, StreamViewer } from '@/hooks/useVoiceRoom'

interface VideoRoomModalsProps {
  roomId: string
  room: {
    id: string
    title: string
    description?: string | null
    category?: { id: string } | null
    access_type: string
    chat_mode?: string | null
    thumbnail_url?: string | null
    stream_type?: string | null
    tags?: string[] | null
    host_partner?: any
    host_member_id?: string | null
  }
  hosts: StreamHost[]
  
  // 사용자 상태
  isHost: boolean
  isAdmin: boolean
  isModeratorView: boolean
  canUseHud: boolean
  
  // 채팅 액션 시트
  isChatActionSheetOpen: boolean
  onCloseChatActionSheet: () => void
  selectedChatMessage: StreamChat | null
  onChatHideToggle: (messageId: number, isHidden: boolean) => Promise<void>
  onChatPinToggle: (messageId: number, isPinned: boolean) => Promise<void>
  onOpenProfileFromChat: () => void
  canOpenSelectedChatProfile: boolean
  
  // 참가자 프로필 시트
  isProfileSheetOpen: boolean
  onCloseProfileSheet: () => void
  selectedParticipant: StreamHost | StreamViewer | null
  selectedParticipantIsSpeaker: boolean
  hostPartnerId?: string | null
  hostMemberId?: string | null
  
  // 후원 시트
  isDonationSheetOpen: boolean
  onCloseDonationSheet: () => void
  
  // 후원 컨트롤 센터 (호스트용)
  isDonationListOpen: boolean
  onCloseDonationList: () => void
  onPlayVideo: (videoUrl: string, donation: StreamDonation) => Promise<void>
  
  // 미션 패널 (시청자용)
  isMissionPanelOpen: boolean
  onCloseMissionPanel: () => void
  
  // HUD 가이드
  isHudGuideOpen: boolean
  onCloseHudGuide: () => void
  
  // 방송 설정 (호스트용)
  isSettingsOpen: boolean
  onCloseSettings: () => void
}

export function VideoRoomModals({
  roomId,
  room,
  hosts,
  isHost,
  isAdmin,
  isModeratorView,
  canUseHud,
  isChatActionSheetOpen,
  onCloseChatActionSheet,
  selectedChatMessage,
  onChatHideToggle,
  onChatPinToggle,
  onOpenProfileFromChat,
  canOpenSelectedChatProfile,
  isProfileSheetOpen,
  onCloseProfileSheet,
  selectedParticipant,
  selectedParticipantIsSpeaker,
  hostPartnerId,
  hostMemberId,
  isDonationSheetOpen,
  onCloseDonationSheet,
  isDonationListOpen,
  onCloseDonationList,
  onPlayVideo,
  isMissionPanelOpen,
  onCloseMissionPanel,
  isHudGuideOpen,
  onCloseHudGuide,
  isSettingsOpen,
  onCloseSettings,
}: VideoRoomModalsProps) {
  return (
    <>
      {/* 채팅 액션 시트 */}
      <ChatActionSheet
        isOpen={isChatActionSheetOpen}
        onClose={onCloseChatActionSheet}
        message={selectedChatMessage}
        isHidden={selectedChatMessage?.is_hidden ?? false}
        isPinned={selectedChatMessage?.is_pinned ?? false}
        onHideToggle={onChatHideToggle}
        onPinToggle={onChatPinToggle}
        onOpenProfile={onOpenProfileFromChat}
        canOpenProfile={canOpenSelectedChatProfile}
        canPin={isModeratorView}
      />

      {/* 참가자 프로필 시트 */}
      <ParticipantProfileSheet
        isOpen={isProfileSheetOpen}
        onClose={onCloseProfileSheet}
        roomId={roomId}
        participant={selectedParticipant}
        hostPartnerId={hostPartnerId}
        hostMemberId={hostMemberId}
        isSpeaker={selectedParticipantIsSpeaker}
        isCurrentUserHost={isHost}
        isCurrentUserAdmin={isAdmin}
        onKicked={onCloseProfileSheet}
      />

      {/* 후원 시트 */}
      <StreamDonationSheetV2
        isOpen={isDonationSheetOpen}
        onClose={onCloseDonationSheet}
        roomId={roomId}
        hosts={hosts}
        roomType="video"
        hostPartner={room?.host_partner}
      />

      {/* 후원 컨트롤 센터 (호스트용) */}
      <DonationControlCenter
        isOpen={isDonationListOpen}
        onClose={onCloseDonationList}
        roomId={roomId}
        roomType="video"
        onPlayVideo={onPlayVideo}
      />

      {/* 미션 패널 (시청자용) */}
      {!isHost && (
        <ViewerMissionPanel
          roomId={roomId}
          isOpen={isMissionPanelOpen}
          onClose={onCloseMissionPanel}
        />
      )}

      {/* HUD 가이드 시트 */}
      {canUseHud && (
        <StreamHudGuideSheet
          isOpen={isHudGuideOpen}
          onClose={onCloseHudGuide}
          context="video-room"
        />
      )}

      {/* 방송 설정 시트 */}
      {room && (
        <StreamSettingsSheet
          isOpen={isSettingsOpen}
          onClose={onCloseSettings}
          room={{
            id: room.id,
            title: room.title,
            description: room.description,
            category_id: room.category?.id || null,
            access_type: room.access_type,
            chat_mode: room.chat_mode || 'all',
            thumbnail_url: room.thumbnail_url,
            stream_type: room.stream_type,
            tags: room.tags,
          }}
        />
      )}
    </>
  )
}
