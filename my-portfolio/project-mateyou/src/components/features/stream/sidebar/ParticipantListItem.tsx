/**
 * ParticipantListItem - 참가자 목록 아이템 컴포넌트
 * 
 * 보이스룸/라이브룸 사이드바에서 공통으로 사용
 * 호스트/발언자, 청취자/시청자 두 가지 형태 지원
 */

import type { StreamHost, StreamViewer } from '@/hooks/useVoiceRoom'
import { Crown, Mic, Video } from 'lucide-react'

/** 참가자 타입 */
export type ParticipantType = 'host' | 'viewer'

/** 룸 타입 */
export type RoomType = 'voice' | 'video'

interface ParticipantListItemProps {
  /** 참가자 정보 (호스트 또는 시청자) */
  participant: StreamHost | StreamViewer
  /** 참가자 타입 */
  type: ParticipantType
  /** 룸 타입 (보이스룸/라이브룸) */
  roomType: RoomType
  /** 클릭 가능 여부 */
  clickable?: boolean
  /** 클릭 핸들러 */
  onClick?: () => void
}

export function ParticipantListItem({
  participant,
  type,
  roomType,
  clickable = false,
  onClick,
}: ParticipantListItemProps) {
  // 호스트인지 시청자인지에 따라 정보 추출
  const isHost = type === 'host' && 'role' in participant
  
  // 이름과 프로필 이미지 추출
  const getName = () => {
    if ('role' in participant) {
      const host = participant as StreamHost
      return host.partner?.partner_name || host.member?.name || '알 수 없음'
    }
    const viewer = participant as StreamViewer
    return viewer.member?.name || '알 수 없음'
  }

  const getProfileImage = () => {
    if ('role' in participant) {
      const host = participant as StreamHost
      return host.partner?.member?.profile_image || host.member?.profile_image || ''
    }
    const viewer = participant as StreamViewer
    return viewer.member?.profile_image || ''
  }

  const name = getName()
  const profileImage = getProfileImage()
  const isOwner = isHost && (participant as StreamHost).role === 'owner'

  // 역할 라벨
  const getRoleLabel = () => {
    if (isHost) {
      if (isOwner) return '방장'
      return roomType === 'voice' ? '발언자' : '호스트'
    }
    return roomType === 'voice' ? '청취자' : '시청자'
  }

  // 역할 아이콘
  const RoleIcon = () => {
    if (isOwner) return <Crown className="w-2.5 h-2.5 text-white" />
    if (isHost) {
      return roomType === 'voice' 
        ? <Mic className="w-2.5 h-2.5 text-white" />
        : <Video className="w-2.5 h-2.5 text-white" />
    }
    return null
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!clickable}
      className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors text-left ${
        clickable ? 'hover:bg-gray-100 cursor-pointer' : 'hover:bg-gray-50 cursor-default'
      }`}
    >
      <div className="relative flex-shrink-0">
        <img
          src={profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`}
          alt={name}
          className={`w-9 h-9 rounded-full object-cover ${
            isHost ? 'ring-2 ring-[#FE3A8F] ring-offset-1' : ''
          }`}
        />
        {isHost && (
          <div className={`absolute -bottom-0.5 -right-0.5 rounded-full p-0.5 ${
            isOwner ? 'bg-[#FE3A8F]' : 'bg-purple-500'
          }`}>
            <RoleIcon />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[#110f1a] truncate">{name}</p>
        <p className="text-xs text-gray-400">{getRoleLabel()}</p>
      </div>
    </button>
  )
}

