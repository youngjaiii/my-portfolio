/**
 * FeaturedRouletteBanner - 파트너 페이지 대표 룰렛 배너
 * 
 * Phase 5-C: 비방송용 룰렛
 * - 파트너 페이지 상단에 표시
 * - 대표 룰렛 미니 프리뷰
 * - 클릭 시 룰렛 모음 페이지로 이동
 */

import { useNavigate } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { Sparkles, ChevronRight, Gift } from 'lucide-react'
import { Typography } from '@/components/ui/Typography'
import { useFeaturedWheel, useHasProfileRoulette } from '@/hooks/useProfileRoulette'
import { cn } from '@/lib/utils'

interface FeaturedRouletteBannerProps {
  partnerId: string
  memberCode: string
  className?: string
}

export function FeaturedRouletteBanner({ partnerId, memberCode, className }: FeaturedRouletteBannerProps) {
  const navigate = useNavigate()
  const { data: hasRoulette } = useHasProfileRoulette(partnerId)
  const { data: featuredWheel, isLoading } = useFeaturedWheel(partnerId)
  
  // 프로필 룰렛이 없으면 표시하지 않음
  if (!hasRoulette || isLoading) {
    return null
  }
  
  const handleClick = () => {
    navigate({
      to: '/roulette/$memberCode',
      params: { memberCode },
    })
  }
  
  // 대표 룰렛이 있는 경우
  if (featuredWheel) {
    const previewItems = featuredWheel.items.slice(0, 4)
    
    return (
      <motion.button
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={handleClick}
        className={cn(
          "w-full p-4 rounded-2xl",
          "bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700",
          "border border-purple-400/30",
          "shadow-lg shadow-purple-500/20",
          "text-left group",
          "hover:shadow-xl hover:shadow-purple-500/30 transition-shadow",
          className
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* 아이콘 */}
            <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Sparkles className="w-6 h-6 text-yellow-300" />
              </motion.div>
            </div>
            
            <div>
              <Typography variant="body2" className="text-purple-200">
                🎰 행운의 룰렛
              </Typography>
              <Typography variant="subtitle2" className="text-white font-bold">
                {featuredWheel.wheel_name}
              </Typography>
            </div>
          </div>
          
          {/* 상품 미리보기 */}
          <div className="flex items-center gap-2">
            <div className="flex -space-x-2">
              {previewItems.map((item) => (
                <div
                  key={item.id}
                  className="w-8 h-8 rounded-lg border-2 border-purple-700 flex items-center justify-center text-sm shadow-md"
                  style={{ backgroundColor: item.color }}
                >
                  {item.is_blank ? '💨' : '🎁'}
                </div>
              ))}
            </div>
            <ChevronRight className="w-5 h-5 text-purple-300 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
        
        {/* 가격 태그 */}
        <div className="mt-3 inline-flex items-center gap-1 px-3 py-1 bg-white/10 rounded-full">
          <Typography variant="caption" className="text-purple-200">
            {featuredWheel.wheel_price.toLocaleString()}P로 도전하기
          </Typography>
        </div>
      </motion.button>
    )
  }
  
  // 대표 룰렛은 없지만 프로필 룰렛이 있는 경우
  return (
    <motion.button
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={handleClick}
      className={cn(
        "w-full p-4 rounded-2xl",
        "bg-gradient-to-r from-purple-500/80 to-indigo-500/80",
        "border border-purple-400/20",
        "text-left group",
        "hover:from-purple-600/80 hover:to-indigo-600/80 transition-colors",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Gift className="w-8 h-8 text-purple-200" />
          <div>
            <Typography variant="subtitle2" className="text-white">
              🎰 룰렛 도전하기
            </Typography>
            <Typography variant="caption" className="text-purple-200">
              다양한 보상이 기다리고 있어요
            </Typography>
          </div>
        </div>
        <ChevronRight className="w-5 h-5 text-purple-300 group-hover:translate-x-1 transition-transform" />
      </div>
    </motion.button>
  )
}
