/**
 * PinnedChatMessage - 고정된 채팅 메시지 컴포넌트
 * 채팅 창 맨 위에 플롯 형태로 표시
 */

import type { StreamChat } from '@/hooks/useVoiceRoom'
import { Pin, X } from 'lucide-react'

type SenderRole = 'owner' | 'speaker' | 'listener'
type ChatVariant = 'voice' | 'video'
type ChatDensity = 'comfortable' | 'compact'

interface PinnedChatMessageProps {
  message: StreamChat
  role: SenderRole
  variant?: ChatVariant
  /** 표시 밀도 (모바일용 컴팩트 모드 등) */
  density?: ChatDensity
  /** 고정 해제 핸들러 (호스트만) */
  onUnpin?: () => void
  /** 고정 해제 가능 여부 (호스트/관리자만) */
  canUnpin?: boolean
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

export function PinnedChatMessage({
  message,
  role,
  variant = 'voice',
  density = 'comfortable',
  onUnpin,
  canUnpin = false,
  fanRank,
}: PinnedChatMessageProps) {
  const senderName = message.sender?.name || '알 수 없음'
  const senderProfile = message.sender?.profile_image || ''
  const roleStyles = variant === 'voice' ? voiceRoleStyles : videoRoleStyles
  const style = roleStyles[role]
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

  // 고정 해제 핸들러
  const handleUnpin = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onUnpin) {
      onUnpin()
    }
  }

  // 보이스룸 스타일
  if (variant === 'voice') {
    return (
      <div className="mx-4 sm:mx-6 lg:mx-8 mb-1.5 mt-1.5">
        <div className="bg-amber-50 border-l-2 border-amber-400 rounded px-2.5 py-1.5">
          <div className="flex items-center gap-1.5">
            {/* 고정 아이콘 */}
            <Pin className="w-3 h-3 text-amber-600 flex-shrink-0" />
            
            {/* 발신자 정보 */}
            <img
              src={senderProfile || `https://api.dicebear.com/7.x/avataaars/svg?seed=${senderName}`}
              alt={senderName}
              className="w-4 h-4 rounded-full object-cover flex-shrink-0"
            />
            <div className="flex items-center gap-1 flex-1 min-w-0">
              {/* 랭킹 메달 */}
              {rankImage && (
                <img 
                  src={rankImage} 
                  alt={`${fanRank}등`} 
                  className="w-3.5 h-3.5 object-contain flex-shrink-0" 
                />
              )}
              <span className={`text-[11px] font-semibold ${style.nameColor}`}>
                {senderName}
              </span>
              {role !== 'listener' && (
                <span className={`px-1 py-0.5 ${style.badgeColor} text-[8px] font-bold rounded`}>
                  {style.label}
                </span>
              )}
              <span className="text-[9px] text-gray-400 ml-1">{timeString}</span>
            </div>

            {/* 고정 해제 버튼 (호스트만) */}
            {canUnpin && onUnpin && (
              <button
                type="button"
                onClick={handleUnpin}
                className="flex-shrink-0 p-0.5 hover:bg-amber-100 rounded transition-colors"
                aria-label="고정 해제"
              >
                <X className="w-3 h-3 text-amber-600" />
              </button>
            )}
          </div>
          {/* 메시지 내용 */}
          <p className="text-[11px] text-[#110f1a] break-words leading-relaxed mt-0.5 ml-7">
            {message.content}
          </p>
        </div>
      </div>
    )
  }

  // 비디오룸 스타일
  if (isCompact) {
    return (
      <div className="mx-4 mb-1.5 mt-1.5">
        <div className="bg-amber-500/20 border-l-2 border-amber-400 rounded px-2.5 py-1 backdrop-blur-sm">
          <div className="flex items-center gap-1.5">
            {/* 고정 아이콘 */}
            <Pin className="w-3 h-3 text-amber-300 flex-shrink-0" />

            {/* 랭킹 메달 */}
            {rankImage && (
              <img
                src={rankImage}
                alt={`${fanRank}등`}
                className="w-3.5 h-3.5 object-contain flex-shrink-0"
              />
            )}

            <div className="flex items-center gap-1 flex-1 min-w-0">
              <span className={`text-[11px] font-semibold ${style.nameColor}`}>{senderName}</span>
              {role !== 'listener' && (
                <span className={`px-1 py-0.5 ${style.badgeColor} text-[8px] font-bold rounded`}>
                  {style.label}
                </span>
              )}
            </div>

            {/* 고정 해제 버튼 (호스트만) */}
            {canUnpin && onUnpin && (
              <button
                type="button"
                onClick={handleUnpin}
                className="flex-shrink-0 p-0.5 hover:bg-amber-400/30 rounded transition-colors"
                aria-label="고정 해제"
              >
                <X className="w-3 h-3 text-amber-200" />
              </button>
            )}
          </div>
          {/* 메시지 내용 */}
          <p className="text-[11px] text-white break-words leading-snug mt-0.5 ml-4">
            {message.content}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-4 mb-1.5 mt-1.5">
      <div className="bg-amber-500/20 border-l-2 border-amber-400 rounded px-2.5 py-1.5 backdrop-blur-sm">
        <div className="flex items-center gap-1.5">
          {/* 고정 아이콘 */}
          <Pin className="w-3 h-3 text-amber-300 flex-shrink-0" />
          
          {/* 발신자 정보 */}
          <img
            src={senderProfile || `https://api.dicebear.com/7.x/avataaars/svg?seed=${senderName}`}
            alt={senderName}
            className="w-4 h-4 rounded-full object-cover flex-shrink-0"
          />
          <div className="flex items-center gap-1 flex-1 min-w-0">
            {/* 랭킹 메달 */}
            {rankImage && (
              <img 
                src={rankImage} 
                alt={`${fanRank}등`} 
                className="w-3.5 h-3.5 object-contain flex-shrink-0" 
              />
            )}
            <span className={`text-[11px] font-semibold ${style.nameColor}`}>
              {senderName}
            </span>
            {role !== 'listener' && (
              <span className={`px-1 py-0.5 ${style.badgeColor} text-[8px] font-bold rounded`}>
                {style.label}
              </span>
            )}
            <span className="text-[9px] text-white/50 ml-1">{timeString}</span>
          </div>

          {/* 고정 해제 버튼 (호스트만) */}
          {canUnpin && onUnpin && (
            <button
              type="button"
              onClick={handleUnpin}
              className="flex-shrink-0 p-0.5 hover:bg-amber-400/30 rounded transition-colors"
              aria-label="고정 해제"
            >
              <X className="w-3 h-3 text-amber-200" />
            </button>
          )}
        </div>
        {/* 메시지 내용 */}
        <p className="text-[11px] text-white break-words leading-relaxed mt-0.5 ml-7">
          {message.content}
        </p>
      </div>
    </div>
  )
}

