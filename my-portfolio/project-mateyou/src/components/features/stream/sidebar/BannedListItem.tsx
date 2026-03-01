/**
 * BannedListItem - 차단된 사람 목록 아이템 컴포넌트
 * 
 * 보이스룸/라이브룸 사이드바에서 공통으로 사용
 */

import type { StreamBan } from '@/hooks/useStreamModeration'
import { Ban } from 'lucide-react'

interface BannedListItemProps {
  /** 차단 정보 */
  ban: StreamBan
  /** 차단 해제 핸들러 */
  onUnban: () => void
  /** 차단 해제 중 여부 */
  isUnbanning?: boolean
}

export function BannedListItem({
  ban,
  onUnban,
  isUnbanning = false,
}: BannedListItemProps) {
  const name = ban.target_member?.name || '알 수 없음'
  const profileImage = ban.target_member?.profile_image || ''

  // 차단 종료 시간 표시
  const getExpiresLabel = () => {
    if (!ban.expires_at) return '영구'
    const expires = new Date(ban.expires_at)
    const now = new Date()
    const diffMs = expires.getTime() - now.getTime()
    
    if (diffMs <= 0) return '만료됨'
    
    const diffMinutes = Math.floor(diffMs / (1000 * 60))
    if (diffMinutes < 60) return `${diffMinutes}분 후`
    
    const diffHours = Math.floor(diffMinutes / 60)
    if (diffHours < 24) return `${diffHours}시간 후`
    
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}일 후`
  }

  // 차단 타입 라벨
  const getBanTypeLabel = () => {
    switch (ban.ban_type) {
      case 'kick': return '강퇴'
      case 'ban': return '차단'
      case 'mute': return '뮤트'
      default: return '제재'
    }
  }

  return (
    <div className="w-full flex items-center gap-3 p-2 rounded-lg bg-red-50/50">
      <div className="relative flex-shrink-0">
        <img
          src={profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`}
          alt={name}
          className="w-9 h-9 rounded-full object-cover grayscale opacity-70"
        />
        <div className="absolute -bottom-0.5 -right-0.5 rounded-full p-0.5 bg-red-500">
          <Ban className="w-2.5 h-2.5 text-white" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-600 truncate">{name}</p>
        <p className="text-xs text-red-500">
          {getBanTypeLabel()} · {getExpiresLabel()}
        </p>
      </div>
      {/* 차단 해제 버튼 */}
      <button
        type="button"
        onClick={onUnban}
        disabled={isUnbanning}
        className="flex-shrink-0 px-2 py-1 text-xs font-medium text-red-500 hover:bg-red-100 rounded transition-colors disabled:opacity-50"
      >
        {isUnbanning ? '해제중...' : '해제'}
      </button>
    </div>
  )
}

