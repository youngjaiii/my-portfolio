/**
 * HostInfoSection - 호스트 정보 섹션 컴포넌트
 *
 * PC 라이브 방송 페이지의 사이드 패널 상단에 표시되는 호스트 정보
 * - 프로필 이미지
 * - 이름 및 팔로워 수
 * - 팔로우 버튼
 * - 방송 제목/설명
 */

import { Heart, Settings, Share2, UserCheck, UserPlus, Users } from 'lucide-react'

interface HostInfoSectionProps {
  hostName?: string
  hostProfileImage?: string
  hostInitial?: string
  followerCount?: number
  isFollowing?: boolean
  isFollowLoading?: boolean
  onToggleFollow?: () => void
  roomTitle: string
  roomDescription?: string
  viewerCount: number
  isHost?: boolean
  isAdmin?: boolean
  onOpenSettings?: () => void
  onOpenSidebar?: () => void
  onShare?: () => void
}

export function HostInfoSection({
  hostName,
  hostProfileImage,
  hostInitial,
  followerCount = 0,
  isFollowing = false,
  isFollowLoading = false,
  onToggleFollow,
  roomTitle,
  roomDescription,
  viewerCount,
  isHost = false,
  isAdmin = false,
  onOpenSettings,
  onOpenSidebar,
  onShare,
}: HostInfoSectionProps) {
  const formatFollowerCount = (count: number) => {
    if (count >= 10000) {
      return `${(count / 10000).toFixed(1)}만`
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}천`
    }
    return count.toString()
  }

  return (
    <div className="flex flex-col gap-3 p-3 bg-gradient-to-b from-[#1a1825] to-[#110f1a] border-b border-white/10">
      {/* 방송 제목 및 설명 (상단에 크게) */}
      <div className="space-y-1">
        <h2 className="text-white font-bold text-base leading-snug line-clamp-2">{roomTitle}</h2>
        {roomDescription && (
          <p className="text-gray-400 text-xs leading-relaxed line-clamp-3">{roomDescription}</p>
        )}
      </div>

      {/* 호스트 프로필 영역 (컴팩트) */}
      <div className="flex items-center gap-2 pt-2 border-t border-white/5">
        {/* 프로필 이미지 (작게) */}
        <div className="relative flex-shrink-0">
          <div className="w-9 h-9 rounded-full overflow-hidden ring-1 ring-[#FE3A8F]/50">
            {hostProfileImage ? (
              <img
                src={hostProfileImage}
                alt={hostName || '호스트'}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#FE3A8F] to-[#ff6b9d] flex items-center justify-center">
                <span className="text-sm font-bold text-white">
                  {hostInitial?.charAt(0)?.toUpperCase() || 'U'}
                </span>
              </div>
            )}
          </div>
          {/* 라이브 인디케이터 */}
          <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 px-1 py-[1px] bg-red-500 rounded text-[8px] font-bold text-white animate-pulse">
            LIVE
          </div>
        </div>

        {/* 호스트 정보 (컴팩트) */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="text-white font-semibold text-xs truncate">{hostName || '알 수 없음'}</h3>
            <span className="text-[10px] text-gray-500">•</span>
            <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
              <Heart className="w-2.5 h-2.5 text-[#FE3A8F]" />
              {formatFollowerCount(followerCount)}
            </span>
            <span className="text-[10px] text-gray-400 flex items-center gap-0.5">
              <Users className="w-2.5 h-2.5 text-blue-400" />
              {viewerCount}명
            </span>
          </div>
        </div>

        {/* 팔로우 버튼 + 액션 버튼들 */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {!isHost && onToggleFollow && (
            <button
              onClick={onToggleFollow}
              disabled={isFollowLoading}
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold transition-all ${
                isFollowing
                  ? 'bg-white/10 text-white border border-white/20'
                  : 'bg-gradient-to-r from-[#FE3A8F] to-[#ff6b9d] text-white'
              } ${isFollowLoading ? 'opacity-50' : ''}`}
            >
              {isFollowing ? <UserCheck className="w-2.5 h-2.5" /> : <UserPlus className="w-2.5 h-2.5" />}
              <span>{isFollowing ? '팔로잉' : '팔로우'}</span>
            </button>
          )}
          {onShare && (
            <button
              onClick={onShare}
              className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white"
              title="공유하기"
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>
          )}
          {(isHost || isAdmin) && onOpenSidebar && (
            <button
              onClick={onOpenSidebar}
              className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white"
              title="시청자 관리"
            >
              <Users className="w-3.5 h-3.5" />
            </button>
          )}
          {isHost && onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white"
              title="방송 설정"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
