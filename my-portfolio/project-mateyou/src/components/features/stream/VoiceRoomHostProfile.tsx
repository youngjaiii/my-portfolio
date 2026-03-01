/**
 * VoiceRoomHostProfile - 보이스룸 호스트/발언자 프로필
 */

import type { StreamHost } from '@/hooks/useVoiceRoom'
import { Crown, Mic, MicOff } from 'lucide-react'

interface VoiceRoomHostProfileProps {
  host: StreamHost
  isSpeaking: boolean
  isMuted: boolean
  isCurrentUser: boolean
  /** 클릭 가능 여부 (부모에서 권한 체크 후 전달) */
  isClickable?: boolean
  /** 프로필 클릭 콜백 */
  onProfileClick?: (host: StreamHost) => void
}

export function VoiceRoomHostProfile({ 
  host, 
  isSpeaking,
  isMuted,
  isCurrentUser,
  isClickable = false,
  onProfileClick,
}: VoiceRoomHostProfileProps) {
  const name = host.partner?.partner_name || host.member?.name || '알 수 없음'
  const profileImage = host.partner?.member?.profile_image || host.member?.profile_image || ''
  const isOwner = host.role === 'owner'

  // 클릭 가능 여부는 부모에서 전달받음
  const canClick = isClickable && !isCurrentUser && !!onProfileClick

  const handleClick = () => {
    if (canClick && onProfileClick) {
      onProfileClick(host)
    }
  }

  return (
    <div 
      className={`flex flex-col items-center gap-0.5 ${canClick ? 'cursor-pointer' : ''}`}
      onClick={handleClick}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      role={canClick ? 'button' : undefined}
      tabIndex={canClick ? 0 : undefined}
    >
      <div className="relative">
        <img
          src={profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`}
          alt={name}
          className={`
            w-10 h-10 rounded-full object-cover transition-all duration-200
            ${isSpeaking && !isMuted
              ? 'ring-2 ring-emerald-400 shadow-md shadow-emerald-400/30 scale-105' 
              : isMuted
                ? 'ring-[1.5px] ring-gray-300 opacity-70'
                : 'ring-[1.5px] ring-[#FE3A8F]'
            }
            ${isCurrentUser ? 'ring-purple-500' : ''}
          `}
        />
        {/* 역할 뱃지 또는 음소거 뱃지 */}
        <div className={`absolute -bottom-0.5 -right-0.5 rounded-full p-[2px] ${
          isMuted ? 'bg-red-500' : isOwner ? 'bg-[#FE3A8F]' : 'bg-purple-500'
        }`}>
          {isMuted ? (
            <MicOff className="w-2.5 h-2.5 text-white" />
          ) : isOwner ? (
            <Crown className="w-2.5 h-2.5 text-white" />
          ) : (
            <Mic className="w-2.5 h-2.5 text-white" />
          )}
        </div>
        {/* 발언 중 인디케이터 */}
        {isSpeaking && !isMuted && (
          <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </div>
        )}
      </div>
      <span className={`text-[10px] font-medium truncate max-w-[48px] ${
        isCurrentUser ? 'text-purple-600' : isMuted ? 'text-gray-400' : 'text-[#110f1a]'
      }`}>
        {isCurrentUser ? '나' : name}
      </span>
    </div>
  )
}

