/**
 * StreamChatMessage - 스트림룸(보이스/비디오) 통합 채팅 메시지 컴포넌트
 * variant prop으로 스타일 구분
 * 
 * 숨김 기능:
 * - 일반 시청자: is_hidden=true 메시지는 렌더링하지 않음 (부모에서 필터링)
 * - 호스트/관리자: 옅은 붉은색 배경으로 표시, 클릭 시 숨기기/해제 가능
 */

import type { StreamChat } from '@/hooks/useVoiceRoom'

type SenderRole = 'owner' | 'speaker' | 'listener'
type ChatVariant = 'voice' | 'video'
type ChatDensity = 'comfortable' | 'compact'

interface StreamChatMessageProps {
  message: StreamChat
  role: SenderRole
  variant?: ChatVariant
  /** 표시 밀도 (모바일용 컴팩트 모드 등) */
  density?: ChatDensity
  /** 현재 유저가 호스트/관리자인지 */
  isModeratorView?: boolean
  /** 메시지 클릭 핸들러 (프로필 시트 열기용) */
  onMessageClick?: (message: StreamChat) => void
  /** 숨기기/해제 핸들러 */
  onHideToggle?: (messageId: number, isHidden: boolean) => void
  /** 사용자의 팬 랭킹 순위 (1, 2, 3) */
  fanRank?: number | null
}

// 역할별 스타일 (보이스룸용)
const voiceRoleStyles = {
  owner: {
    nameColor: 'text-[#FE3A8F]',
    badgeColor: 'bg-[#FE3A8F]/10 text-[#FE3A8F]',
    label: '방장',
  },
  speaker: {
    nameColor: 'text-purple-600',
    badgeColor: 'bg-purple-100 text-purple-600',
    label: '발언자',
  },
  listener: {
    nameColor: 'text-[#110f1a]',
    badgeColor: '',
    label: '',
  },
}

// 역할별 스타일 (비디오룸용)
const videoRoleStyles = {
  owner: {
    nameColor: 'text-[#FE3A8F]',
    badgeColor: 'bg-[#FE3A8F]/20 text-[#FE3A8F]',
    label: '방장',
  },
  speaker: {
    nameColor: 'text-purple-400',
    badgeColor: 'bg-purple-500/20 text-purple-400',
    label: '발언자',
  },
  listener: {
    nameColor: 'text-white',
    badgeColor: '',
    label: '',
  },
}

export function StreamChatMessage({
  message,
  role,
  variant = 'voice',
  density = 'comfortable',
  isModeratorView = false,
  onMessageClick,
  onHideToggle,
  fanRank,
}: StreamChatMessageProps) {
  const senderName = message.sender?.name || '알 수 없음'
  const senderProfile = message.sender?.profile_image || ''
  const roleStyles = variant === 'voice' ? voiceRoleStyles : videoRoleStyles
  const style = roleStyles[role]
  const isHidden = message.is_hidden
  const isCompact = density === 'compact'

  // 랭킹 메달 이미지 가져오기
  const getRankImage = (rank: number) => {
    if (rank === 1) return '/icon/rank1.png'
    if (rank === 2) return '/icon/rank2.png'
    if (rank === 3) return '/icon/rank3.png'
    return null
  }

  const rankImage = fanRank ? getRankImage(fanRank) : null

  // 시간 포맷팅
  const timeString = new Date(message.created_at).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  })

  // 메시지 클릭 핸들러 (프로필 열기)
  const handleClick = () => {
    if (onMessageClick) {
      onMessageClick(message)
    }
  }

  // 숨기기/해제 토글
  const handleHideToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onHideToggle) {
      onHideToggle(message.id, isHidden)
    }
  }

  // 시스템 메시지 처리
  if (message.chat_type === 'system') {
    if (variant === 'voice') {
      return (
        <div className="flex justify-center py-1 px-2">
          <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            {message.content}
          </span>
        </div>
      )
    }
    // 비디오룸 시스템 메시지
    return (
      <div className={`flex justify-center ${isCompact ? 'py-1 px-2' : 'py-1.5 px-4'}`}>
        <span className={`${isCompact ? 'text-[10px] px-2 py-0.5' : 'text-[11px] px-3 py-1'} text-white/60 bg-white/10 rounded-full`}>
          {message.content}
        </span>
      </div>
    )
  }

  // 후원 메시지 처리 (특별 스타일)
  if (message.chat_type === 'donation') {
    if (variant === 'voice') {
      return (
        <div className="flex justify-center py-1 px-2">
          <div className="bg-gradient-to-r from-amber-400 via-orange-500 to-red-500 px-2.5 py-1 rounded-lg shadow-sm">
            <span className="text-[10px] text-white font-semibold drop-shadow-sm">
              {message.content}
            </span>
          </div>
        </div>
      )
    }
    // 비디오룸 후원 메시지
    return (
      <div className={`flex justify-center ${isCompact ? 'py-1.5 px-2' : 'py-2 px-4'}`}>
        <div className={`bg-gradient-to-r from-amber-400/90 via-orange-500/90 to-red-500/90 ${isCompact ? 'px-3 py-1.5 rounded-lg' : 'px-4 py-2 rounded-xl'} shadow-lg backdrop-blur-sm`}>
          <span className={`${isCompact ? 'text-[10px]' : 'text-[11px]'} text-white font-semibold drop-shadow-sm`}>
            {message.content}
          </span>
        </div>
      </div>
    )
  }

  // 보이스룸 스타일 (흰색 배경, 프로필 이미지 포함)
  if (variant === 'voice') {
    // 숨김 메시지 배경 스타일
    const hiddenBgClass = isHidden && isModeratorView 
      ? 'bg-red-50/70 border-l-2 border-red-300' 
      : 'hover:bg-gray-50/50'
    
    return (
      <div 
        className={`flex items-start gap-1.5 py-1 px-2 transition-colors cursor-pointer ${hiddenBgClass}`}
        onClick={handleClick}
      >
        <img
          src={senderProfile || `https://api.dicebear.com/7.x/avataaars/svg?seed=${senderName}`}
          alt={senderName}
          className="w-6 h-6 rounded-full object-cover flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap">
            {/* 랭킹 메달 */}
            {rankImage && (
              <img 
                src={rankImage} 
                alt={`${fanRank}등`} 
                className="w-3 h-3 object-contain flex-shrink-0" 
              />
            )}
            <span className={`text-[11px] font-semibold ${style.nameColor}`}>{senderName}</span>
            {role !== 'listener' && (
              <span className={`px-1 py-[1px] ${style.badgeColor} text-[8px] font-bold rounded`}>
                {style.label}
              </span>
            )}
            <span className="text-[9px] text-gray-400">{timeString}</span>
            {/* 숨김 표시 (관리자 뷰에서만) */}
            {isHidden && isModeratorView && (
              <span className="px-1 py-[1px] bg-red-100 text-red-500 text-[8px] font-medium rounded">
                숨김
              </span>
            )}
          </div>
          <p className={`text-[11px] break-words leading-snug ${isHidden && isModeratorView ? 'text-gray-400' : 'text-[#110f1a]'}`}>
            {message.content}
          </p>
        </div>
        {/* 숨기기/해제 버튼 (관리자 뷰에서만) */}
        {isModeratorView && onHideToggle && (
          <button
            type="button"
            onClick={handleHideToggle}
            className={`px-1.5 py-0.5 text-[9px] font-medium rounded transition-colors flex-shrink-0 ${
              isHidden 
                ? 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200' 
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {isHidden ? '해제' : '숨기기'}
          </button>
        )}
      </div>
    )
  }

  // 비디오룸 스타일 - 모바일 컴팩트 모드
  if (isCompact) {
    const bgClass =
      isHidden && isModeratorView
        ? 'bg-red-500/10 border-l-2 border-red-400'
        : 'bg-black/20'

    const roleBadgeClass =
      role === 'owner'
        ? 'bg-gradient-to-r from-[#FE3A8F] to-[#ff6b9d] text-white'
        : 'bg-purple-500/30 text-purple-200'

    return (
      <div
        className={`px-3 py-1.5 transition-colors cursor-pointer rounded-md mx-2 ${bgClass}`}
        onClick={handleClick}
      >
        <p
          className={`text-[12px] leading-snug break-words ${
            isHidden && isModeratorView ? 'text-white/40' : 'text-white/90'
          }`}
        >
          {/* 랭킹 메달 */}
          {rankImage && (
            <img
              src={rankImage}
              alt={`${fanRank}등`}
              className="inline-block w-3.5 h-3.5 object-contain align-middle -mt-0.5 mr-1"
            />
          )}

          {/* 이름 */}
          <span className={`font-semibold ${style.nameColor}`}>{senderName}</span>

          {/* 역할 뱃지 */}
          {role !== 'listener' && (
            <span className={`ml-1 align-middle text-[9px] px-1 py-0.5 rounded-full font-medium ${roleBadgeClass}`}>
              {style.label}
            </span>
          )}

          {/* 숨김 표시 (관리자 뷰에서만) */}
          {isHidden && isModeratorView && (
            <span className="ml-1 align-middle text-[9px] px-1 py-0.5 rounded-full bg-red-500/30 text-red-200 font-medium">
              숨김
            </span>
          )}

          <span className="text-white/60">:</span>
          <span className="text-white/80"> {message.content}</span>
        </p>
      </div>
    )
  }

  // 비디오룸 스타일 (PC용 컴팩트 디자인)
  // 숨김 메시지 배경 스타일
  const hiddenBgClass = isHidden && isModeratorView 
    ? 'bg-red-500/10 border-l-2 border-red-400' 
    : 'hover:bg-white/5'
  
  return (
    <div 
      className={`flex items-start gap-1.5 px-2 py-1 transition-colors cursor-pointer rounded-md mx-1 ${hiddenBgClass}`}
      onClick={handleClick}
    >
      {/* 프로필 이미지 */}
      <div className="flex-shrink-0 relative">
        <img
          src={senderProfile || `https://api.dicebear.com/7.x/avataaars/svg?seed=${senderName}`}
          alt={senderName}
          className="w-5 h-5 rounded-full object-cover ring-1 ring-white/10"
        />
        {/* 랭킹 메달 (프로필 이미지 위에 작게) */}
        {rankImage && (
          <img 
            src={rankImage} 
            alt={`${fanRank}등`} 
            className="absolute -bottom-0.5 -right-0.5 w-3 h-3 object-contain" 
          />
        )}
      </div>

      {/* 메시지 내용 */}
      <div className="flex-1 min-w-0">
        <p className={`text-[11px] break-words leading-snug ${isHidden && isModeratorView ? 'text-white/30' : 'text-white/90'}`}>
          {/* 이름 */}
          <span className={`font-semibold ${style.nameColor}`}>{senderName}</span>

          {/* 역할 뱃지 */}
          {role !== 'listener' && (
            <span
              className={`ml-1 text-[8px] px-1 py-[1px] rounded-full font-medium align-middle ${
                role === 'owner'
                  ? 'bg-gradient-to-r from-[#FE3A8F] to-[#ff6b9d] text-white'
                  : 'bg-purple-500/30 text-purple-300'
              }`}
            >
              {style.label}
            </span>
          )}

          {/* 숨김 표시 (관리자 뷰에서만) */}
          {isHidden && isModeratorView && (
            <span className="ml-1 text-[8px] px-1 py-[1px] rounded-full bg-red-500/30 text-red-300 font-medium align-middle">
              숨김
            </span>
          )}

          <span className="text-white/40">: </span>
          <span>{message.content}</span>
        </p>
      </div>

      {/* 숨기기/해제 버튼 (관리자 뷰에서만) */}
      {isModeratorView && onHideToggle && (
        <button
          type="button"
          onClick={handleHideToggle}
          className={`flex-shrink-0 px-1.5 py-0.5 text-[9px] font-medium rounded transition-colors ${
            isHidden 
              ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30' 
              : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'
          }`}
        >
          {isHidden ? '해제' : '숨기기'}
        </button>
      )}
    </div>
  )
}
