/**
 * VoiceRoomSidebar - 보이스룸 사이드바 컴포넌트
 * 
 * 공통 StreamRoomSidebar를 사용하는 래퍼 컴포넌트
 * 보이스룸 전용 props만 받아서 공통 컴포넌트에 전달
 */

import type { StreamHost, StreamViewer } from '@/hooks/useVoiceRoom'
import { StreamRoomSidebar } from './sidebar'

interface VoiceRoomSidebarProps {
  isOpen: boolean
  onClose: () => void
  roomId: string
  roomTitle: string
  hosts: StreamHost[]
  viewers: StreamViewer[]
  isAdmin: boolean
  isHost: boolean
  hostPartnerId?: string | null
  hostMemberId?: string | null
  onForceEndRoom?: () => void
  onForceMute?: (memberId: string) => void
  onKicked?: (memberId: string) => void
}

export function VoiceRoomSidebar({
  isOpen,
  onClose,
  roomId,
  roomTitle,
  hosts,
  viewers,
  isAdmin,
  isHost,
  hostPartnerId,
  hostMemberId,
  onForceEndRoom,
  onForceMute,
  onKicked,
}: VoiceRoomSidebarProps) {
  return (
    <StreamRoomSidebar
      isOpen={isOpen}
      onClose={onClose}
      roomId={roomId}
      roomTitle={roomTitle}
      hosts={hosts}
      viewers={viewers}
      isAdmin={isAdmin}
      isHost={isHost}
      roomType="voice"
      hostPartnerId={hostPartnerId}
      hostMemberId={hostMemberId}
      onForceEndRoom={onForceEndRoom}
      onForceMute={onForceMute}
      onKicked={onKicked}
    />
  )
}
