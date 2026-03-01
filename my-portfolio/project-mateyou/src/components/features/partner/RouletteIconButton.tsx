/**
 * RouletteIconButton - 룰렛 아이콘 버튼
 * 
 * Phase 5-C: 비방송용 룰렛
 * - 파트너 페이지 우측 상단에 표시
 * - 후원자 랭킹 버튼 옆에 배치
 * - 클릭 시 룰렛 모음 페이지로 이동
 */

import { useNavigate } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { useHasProfileRoulette } from '@/hooks/useProfileRoulette'
import { cn } from '@/lib/utils'

interface RouletteIconButtonProps {
  partnerId: string
  memberCode: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export function RouletteIconButton({ partnerId, memberCode, className, size = 'md' }: RouletteIconButtonProps) {
  const navigate = useNavigate()
  const { data: hasRoulette } = useHasProfileRoulette(partnerId)
  
  // 프로필 룰렛이 없으면 표시하지 않음
  if (!hasRoulette) {
    return null
  }
  
  const handleClick = () => {
    navigate({
      to: '/roulette/$memberCode',
      params: { memberCode },
    })
  }
  
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  }
  
  const iconSizes = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  }
  
  return (
    <motion.button
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      onClick={handleClick}
      className={cn(
        "rounded-full",
        "bg-gradient-to-br from-purple-500 to-pink-500",
        "flex items-center justify-center",
        "shadow-lg shadow-purple-500/30",
        "hover:shadow-xl hover:shadow-purple-500/40",
        "transition-shadow",
        sizeClasses[size],
        className
      )}
      title="룰렛 도전하기"
    >
      <motion.div
        animate={{ 
          rotate: [0, 15, -15, 0],
        }}
        transition={{ 
          duration: 2, 
          repeat: Infinity,
          repeatDelay: 3,
        }}
      >
        <Sparkles className={cn("text-white", iconSizes[size])} />
      </motion.div>
    </motion.button>
  )
}
