/**
 * 후원 랭킹 티커 (뉴스 스타일 흘러가는 효과)
 * 채팅 영역 상단에 Top 5 후원자를 뉴스처럼 표시
 * 
 * variant:
 * - 'light': 보이스룸용 (흰색 배경)
 * - 'dark': 비디오룸용 (반투명 어두운 배경)
 */

import type { DonationRanking } from '@/hooks/useStreamDonations'
import { Marquee } from '@/components/ui/Marquee'
import { Crown, Trophy } from 'lucide-react'
import { useMemo } from 'react'

type TickerVariant = 'light' | 'dark'

interface DonationRankingTickerProps {
  rankings: DonationRanking[]
  className?: string
  variant?: TickerVariant
}

export function DonationRankingTicker({ 
  rankings, 
  className = '',
  variant = 'light',
}: DonationRankingTickerProps) {
  // 랭킹이 없으면 렌더링하지 않음
  if (rankings.length === 0) return null

  // Top 5만 표시
  const top5 = useMemo(() => rankings.slice(0, 5), [rankings])

  // 애니메이션 속도 (인원수에 따라 조정)
  const animationDuration = Math.max(top5.length * 8, 20) // 최소 20초

  // variant별 컨테이너 스타일
  const containerStyles = variant === 'dark'
    ? 'bg-gradient-to-r from-black/60 via-black/40 to-black/60 backdrop-blur-sm'
    : 'bg-gradient-to-r from-white via-gray-50 to-white border-y border-gray-200'
  
  // variant별 그라데이션 페이드 스타일
  const fadeLeftStyles = variant === 'dark'
    ? 'bg-gradient-to-r from-black/60 to-transparent'
    : 'bg-gradient-to-r from-white to-transparent'
  
  const fadeRightStyles = variant === 'dark'
    ? 'bg-gradient-to-l from-black/60 to-transparent'
    : 'bg-gradient-to-l from-white to-transparent'

  // variant별 높이
  const heightClass = variant === 'dark' ? 'h-11' : 'h-9'

  return (
    <div className={`relative overflow-hidden ${heightClass} ${containerStyles} ${className}`}>
      {/* 타이틀 배지 (좌측 고정) */}
      <div className={`absolute left-2 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1 bg-gradient-to-r from-amber-400 to-orange-500 text-white ${variant === 'dark' ? 'px-2.5 py-1 text-[11px]' : 'px-2 py-0.5 text-[10px]'} rounded-md font-bold shadow-md shadow-amber-500/30`}>
        <Trophy className={variant === 'dark' ? 'w-3.5 h-3.5' : 'w-3 h-3'} />
        <span>TOP 5</span>
      </div>

      {/* 좌측 그라데이션 페이드 */}
      <div className={`absolute ${variant === 'dark' ? 'left-[72px]' : 'left-[60px]'} top-0 bottom-0 w-8 z-10 pointer-events-none ${fadeLeftStyles}`} />
      
      {/* 우측 그라데이션 페이드 */}
      <div className={`absolute right-0 top-0 bottom-0 w-12 z-10 pointer-events-none ${fadeRightStyles}`} />

      {/* 랭킹 컨텐츠 - Marquee 사용 */}
      <Marquee
        className={`h-full items-center ${variant === 'dark' ? 'pl-20 pr-6' : 'pl-16 pr-4'}`}
        pauseOnHover={true}
        duration={animationDuration}
        gap={variant === 'dark' ? 0.75 : 0.5}
        repeat={3}
      >
        {top5.map((ranking) => (
          <RankingItem 
            key={ranking.donor_id} 
            ranking={ranking} 
            variant={variant}
          />
        ))}
      </Marquee>
    </div>
  )
}

interface RankingItemProps {
  ranking: DonationRanking
  variant?: TickerVariant
}

function RankingItem({ ranking, variant = 'light' }: RankingItemProps) {
  const isCompact = variant === 'light'
  
  const getRankBadge = (rank: number) => {
    const baseClasses = `flex items-center justify-center rounded-md font-bold flex-shrink-0 ${isCompact ? 'w-4 h-4 text-[8px]' : 'w-5 h-5 text-[10px]'}`
    
    // 4-5등 배지의 배경색 (variant별)
    const defaultBgClass = variant === 'dark' ? 'bg-white/20' : 'bg-gray-200'
    const defaultTextClass = variant === 'dark' ? 'text-white/70' : 'text-gray-600'
    
    switch (rank) {
      case 1:
        return (
          <div className={`${baseClasses} bg-gradient-to-br from-yellow-400 to-amber-500 shadow-sm shadow-amber-500/30`}>
            <Crown className={isCompact ? 'w-2.5 h-2.5 text-white' : 'w-3 h-3 text-white'} />
          </div>
        )
      case 2:
        return (
          <div className={`${baseClasses} bg-gradient-to-br from-gray-300 to-gray-400 shadow-sm`}>
            <span className="text-white font-bold">2</span>
          </div>
        )
      case 3:
        return (
          <div className={`${baseClasses} bg-gradient-to-br from-amber-600 to-amber-700 shadow-sm shadow-amber-600/30`}>
            <span className="text-white font-bold">3</span>
          </div>
        )
      default:
        return (
          <div className={`${baseClasses} ${defaultBgClass}`}>
            <span className={`${defaultTextClass} font-medium`}>{rank}</span>
          </div>
        )
    }
  }

  // variant별 스타일
  const itemStyles = variant === 'dark'
    ? 'bg-white/10 border-white/10 hover:bg-white/15'
    : 'bg-white border-gray-200 hover:bg-gray-50 shadow-sm'
  
  const nameStyles = variant === 'dark'
    ? 'text-white'
    : 'text-gray-700'
  
  const amountStyles = variant === 'dark'
    ? 'text-amber-400'
    : 'text-orange-500'
  
  const ringStyles = variant === 'dark'
    ? 'ring-white/20'
    : 'ring-gray-300'

  // 컴팩트 모드 크기 (Marquee가 gap을 처리하므로 mr 제거)
  const itemSizeStyles = isCompact
    ? 'gap-1.5 px-2 py-1 rounded-lg h-6'
    : 'gap-2 px-3 py-1.5 rounded-xl h-8'
  
  const profileSize = isCompact ? 'w-4 h-4' : 'w-5 h-5'
  const textSize = isCompact ? 'text-[10px]' : 'text-xs'
  const maxNameWidth = isCompact ? 'max-w-[50px]' : 'max-w-[70px]'

  return (
    <div className={`inline-flex items-center border backdrop-blur-sm whitespace-nowrap flex-shrink-0 transition-colors ${itemSizeStyles} ${itemStyles}`}>
      {/* 순위 배지 */}
      {getRankBadge(ranking.rank)}

      {/* 프로필 이미지 (고정 사이즈) */}
      <div className={`${profileSize} rounded-full overflow-hidden flex-shrink-0 ring-1 ${ringStyles}`}>
        {ranking.donor_profile_image ? (
          <img 
            src={ranking.donor_profile_image} 
            alt={ranking.donor_name}
            className={`${profileSize} object-cover`}
          />
        ) : (
          <div className={`${profileSize} flex items-center justify-center bg-gradient-to-br from-[#FE3A8F] to-[#ff6b9d] text-white ${isCompact ? 'text-[8px]' : 'text-[10px]'} font-bold leading-none`}>
            {ranking.donor_name?.charAt(0)?.toUpperCase() || '?'}
          </div>
        )}
      </div>

      {/* 이름 */}
      <span className={`${textSize} font-medium ${maxNameWidth} truncate leading-none ${nameStyles}`}>
        {ranking.donor_name}
      </span>

      {/* 금액 */}
      <span className={`${textSize} font-bold leading-none ${amountStyles}`}>
        {formatAmount(ranking.total_amount)}
      </span>
    </div>
  )
}

/** 금액 포맷팅 */
function formatAmount(amount: number): string {
  if (amount >= 10000) {
    const man = Math.floor(amount / 10000)
    const remainder = amount % 10000
    if (remainder === 0) {
      return `${man}만`
    }
    return `${man}.${Math.floor(remainder / 1000)}만`
  }
  if (amount >= 1000) {
    return `${(amount / 1000).toFixed(0)}천`
  }
  return `${amount}P`
}
