/**
 * ChatActionSheet - 채팅 메시지 클릭 시 표시되는 액션 바텀시트
 * 
 * 기능:
 * - 숨기기/보이기 토글
 * - 프로필 열기
 * - 고정하기/해제
 */

import { SlideSheet } from '@/components'
import type { StreamChat, StreamHost, StreamViewer } from '@/hooks/useVoiceRoom'
import { Eye, EyeOff, Pin, PinOff, User } from 'lucide-react'

interface ChatActionSheetProps {
  isOpen: boolean
  onClose: () => void
  /** 선택된 채팅 메시지 */
  message: StreamChat | null
  /** 메시지 숨김 상태 */
  isHidden: boolean
  /** 메시지 고정 상태 */
  isPinned: boolean
  /** 숨기기/해제 핸들러 */
  onHideToggle: (messageId: number, isHidden: boolean) => void
  /** 고정/해제 핸들러 */
  onPinToggle: (messageId: number, isPinned: boolean) => void
  /** 프로필 열기 핸들러 */
  onOpenProfile: () => void
  /** 프로필 열기 가능 여부 */
  canOpenProfile: boolean
  /** 고정 가능 여부 (호스트/관리자만) */
  canPin: boolean
}

export function ChatActionSheet({
  isOpen,
  onClose,
  message,
  isHidden,
  isPinned,
  onHideToggle,
  onPinToggle,
  onOpenProfile,
  canOpenProfile,
  canPin,
}: ChatActionSheetProps) {
  if (!message) return null

  const senderName = message.sender?.name || '알 수 없음'

  // 숨기기/해제 처리
  const handleHideToggle = () => {
    onHideToggle(message.id, isHidden)
    onClose()
  }

  // 고정/해제 처리
  const handlePinToggle = () => {
    onPinToggle(message.id, isPinned)
    onClose()
  }

  // 프로필 열기 처리
  const handleOpenProfile = () => {
    onOpenProfile()
    onClose()
  }

  return (
    <SlideSheet
      isOpen={isOpen}
      onClose={onClose}
      title=""
      initialHeight={0.4}
      minHeight={0.3}
      maxHeight={0.5}
      zIndex={10001}
    >
      <div className="pb-4 space-y-1">
        {/* 발신자 정보 헤더 */}
        <div className="px-4 pb-3 mb-2 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-800">{senderName}</p>
          <p className="text-xs text-gray-400 truncate mt-0.5">{message.content}</p>
        </div>

        {/* 숨기기/보이기 */}
        <button
          type="button"
          onClick={handleHideToggle}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
        >
          <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
            isHidden 
              ? 'bg-emerald-50' 
              : 'bg-gray-100'
          }`}>
            {isHidden ? (
              <Eye className="w-4 h-4 text-emerald-500" />
            ) : (
              <EyeOff className="w-4 h-4 text-gray-500" />
            )}
          </div>
          <span className="text-sm font-medium text-gray-700">
            {isHidden ? '보이기' : '숨기기'}
          </span>
        </button>

        {/* 프로필 열기 */}
        <button
          type="button"
          onClick={handleOpenProfile}
          disabled={!canOpenProfile}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
            canOpenProfile ? 'bg-purple-50' : 'bg-gray-100'
          }`}>
            <User className={`w-4 h-4 ${canOpenProfile ? 'text-purple-500' : 'text-gray-400'}`} />
          </div>
          <div className="flex-1 text-left">
            <span className="text-sm font-medium text-gray-700">프로필 열기</span>
            {!canOpenProfile && (
              <p className="text-xs text-gray-400">권한이 없습니다</p>
            )}
          </div>
        </button>

        {/* 고정하기/해제 */}
        <button
          type="button"
          onClick={handlePinToggle}
          disabled={!canPin}
          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
            canPin 
              ? (isPinned ? 'bg-amber-50' : 'bg-gray-100')
              : 'bg-gray-100'
          }`}>
            {isPinned ? (
              <PinOff className={`w-4 h-4 ${canPin ? 'text-amber-500' : 'text-gray-400'}`} />
            ) : (
              <Pin className={`w-4 h-4 ${canPin ? 'text-gray-500' : 'text-gray-400'}`} />
            )}
          </div>
          <div className="flex-1 text-left">
            <span className={`text-sm font-medium ${canPin ? 'text-gray-700' : 'text-gray-400'}`}>
              {isPinned ? '고정 해제' : '고정하기'}
            </span>
            {!canPin && (
              <p className="text-xs text-gray-400">호스트만 고정할 수 있습니다</p>
            )}
          </div>
        </button>
      </div>
    </SlideSheet>
  )
}

