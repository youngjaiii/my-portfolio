/**
 * StreamFAB - 방송 시작 플로팅 액션 버튼
 * 
 * 우측 하단에 고정되어 방송/보이스 시작을 쉽게 할 수 있도록 함
 * - 파트너: 라이브(PC/모바일), 보이스
 * - 일반 유저: 비공개 보이스
 */

import { useAuth } from '@/hooks/useAuth'
import { useDevice } from '@/hooks/useDevice'
import { cn } from '@/lib/utils'
import { useNavigate } from '@tanstack/react-router'
import {
    Mic,
    Monitor,
    Radio,
    Smartphone,
    X
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

interface StreamFABProps {
  onOpenCreateSheet?: (streamType?: 'audio' | 'video', mobileMode?: boolean) => void
  className?: string
}

export function StreamFAB({ onOpenCreateSheet, className }: StreamFABProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const fabRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const { user, isAuthenticated } = useAuth()
  const { isMobile } = useDevice()

  const isPartner = user?.role === 'partner'

  // 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (fabRef.current && !fabRef.current.contains(event.target as Node)) {
        setIsExpanded(false)
      }
    }

    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isExpanded])

  const handleToggle = () => {
    if (!isAuthenticated) {
      navigate({ to: '/login' })
      return
    }
    setIsExpanded(!isExpanded)
  }

  const handleOptionClick = (streamType: 'audio' | 'video', mobileMode = false) => {
    setIsExpanded(false)
    if (onOpenCreateSheet) {
      onOpenCreateSheet(streamType, mobileMode)
    }
  }

  // 메뉴 옵션 정의
  const menuOptions = [
    // 파트너 전용 옵션
    ...(isPartner ? [
      {
        id: 'live-mobile',
        label: '모바일 라이브',
        description: '폰으로 바로 방송',
        icon: <Smartphone className="w-5 h-5" />,
        color: 'bg-pink-500',
        onClick: () => handleOptionClick('video', true),
        visible: isMobile, // 모바일에서만 표시
      },
      {
        id: 'live-pc',
        label: 'PC 라이브',
        description: 'OBS/PRISM 방송',
        icon: <Monitor className="w-5 h-5" />,
        color: 'bg-red-500',
        onClick: () => handleOptionClick('video', false),
        visible: true,
      },
    ] : []),
    // 보이스 옵션 (파트너: 공개 가능, 일반: 비공개만)
    {
      id: 'voice',
      label: isPartner ? '보이스 방송' : '보이스 채팅',
      description: isPartner ? '음성으로 소통' : '비공개 음성 채팅',
      icon: <Mic className="w-5 h-5" />,
      color: 'bg-purple-500',
      onClick: () => handleOptionClick('audio'),
      visible: true,
    },
  ].filter(opt => opt.visible)

  return (
    <div
      ref={fabRef}
      className={cn(
        'fixed z-[60] flex flex-col items-end gap-3 pointer-events-none',
        'bottom-24 right-4 lg:bottom-8 lg:right-8',
        className
      )}
    >
      {/* 확장 메뉴 */}
      <div
        className={cn(
          'flex flex-col gap-2 transition-all duration-200 origin-bottom',
          isExpanded 
            ? 'opacity-100 scale-100 translate-y-0 pointer-events-auto' 
            : 'opacity-0 scale-95 translate-y-4 pointer-events-none'
        )}
      >
        {menuOptions.map((option, index) => (
          <button
            key={option.id}
            onClick={option.onClick}
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-full shadow-lg',
              'bg-white border border-gray-100',
              'hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]',
              'transition-all duration-150',
              'animate-in fade-in slide-in-from-bottom-2'
            )}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            {/* 아이콘 */}
            <div className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center text-white',
              option.color
            )}>
              {option.icon}
            </div>
            {/* 텍스트 */}
            <div className="text-left pr-2">
              <p className="font-semibold text-[#110f1a] text-sm">{option.label}</p>
              <p className="text-xs text-gray-500">{option.description}</p>
            </div>
          </button>
        ))}
      </div>

      {/* 메인 FAB 버튼 */}
      <button
        onClick={handleToggle}
        className={cn(
          'w-14 h-14 rounded-full shadow-lg flex items-center justify-center pointer-events-auto',
          'transition-all duration-200 hover:scale-105 active:scale-95',
          isExpanded
            ? 'bg-gray-800 rotate-45'
            : 'bg-gradient-to-br from-pink-500 to-purple-600'
        )}
      >
        {isExpanded ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <Radio className="w-6 h-6 text-white" />
        )}
      </button>
    </div>
  )
}

export default StreamFAB
