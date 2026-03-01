/**
 * 후원 금액별 티어 시스템
 * 금액에 따라 이펙트 강도, 색상, 사운드가 달라짐
 */

export type DonationTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'

export interface TierConfig {
  tier: DonationTier
  minAmount: number
  maxAmount: number
  label: string
  // 색상 (그라디언트)
  gradientFrom: string
  gradientVia: string
  gradientTo: string
  glowColor: string
  // 파티클
  particleCount: number
  particleSize: { min: number; max: number }
  // 애니메이션
  duration: number // 표시 시간 (초)
  shakeIntensity: number // 화면 흔들림 강도
  // 사운드
  soundFile: string
}

export const DONATION_TIERS: TierConfig[] = [
  {
    tier: 'bronze',
    minAmount: 1000,
    maxAmount: 4999,
    label: '브론즈',
    gradientFrom: 'from-amber-300',
    gradientVia: 'via-orange-400',
    gradientTo: 'to-amber-500',
    glowColor: 'rgba(205, 127, 50, 0.4)',
    particleCount: 8,
    particleSize: { min: 12, max: 24 },
    duration: 4,
    shakeIntensity: 0,
    soundFile: '/sounds/donation_bronze.mp3',
  },
  {
    tier: 'silver',
    minAmount: 5000,
    maxAmount: 9999,
    label: '실버',
    gradientFrom: 'from-gray-300',
    gradientVia: 'via-slate-400',
    gradientTo: 'to-gray-500',
    glowColor: 'rgba(192, 192, 192, 0.5)',
    particleCount: 12,
    particleSize: { min: 16, max: 28 },
    duration: 5,
    shakeIntensity: 1,
    soundFile: '/sounds/donation_silver.mp3',
  },
  {
    tier: 'gold',
    minAmount: 10000,
    maxAmount: 49999,
    label: '골드',
    gradientFrom: 'from-yellow-400',
    gradientVia: 'via-amber-500',
    gradientTo: 'to-orange-500',
    glowColor: 'rgba(255, 215, 0, 0.5)',
    particleCount: 18,
    particleSize: { min: 20, max: 36 },
    duration: 6,
    shakeIntensity: 2,
    soundFile: '/sounds/donation_gold.mp3',
  },
  {
    tier: 'platinum',
    minAmount: 50000,
    maxAmount: 99999,
    label: '플래티넘',
    gradientFrom: 'from-cyan-300',
    gradientVia: 'via-blue-400',
    gradientTo: 'to-purple-500',
    glowColor: 'rgba(100, 200, 255, 0.5)',
    particleCount: 25,
    particleSize: { min: 24, max: 44 },
    duration: 7,
    shakeIntensity: 3,
    soundFile: '/sounds/donation_platinum.mp3',
  },
  {
    tier: 'diamond',
    minAmount: 100000,
    maxAmount: Infinity,
    label: '다이아몬드',
    gradientFrom: 'from-pink-400',
    gradientVia: 'via-purple-500',
    gradientTo: 'to-indigo-600',
    glowColor: 'rgba(255, 100, 255, 0.6)',
    particleCount: 35,
    particleSize: { min: 28, max: 52 },
    duration: 8,
    shakeIntensity: 4,
    soundFile: '/sounds/donation_diamond.mp3',
  },
]

/**
 * 금액에 따른 티어 설정 반환
 */
export function getTierConfig(amount: number): TierConfig {
  return (
    DONATION_TIERS.find(
      (tier) => amount >= tier.minAmount && amount <= tier.maxAmount,
    ) || DONATION_TIERS[0]
  )
}

/**
 * 티어별 CSS 그라디언트 클래스
 */
export function getTierGradientClass(tier: TierConfig): string {
  return `bg-gradient-to-br ${tier.gradientFrom} ${tier.gradientVia} ${tier.gradientTo}`
}

/**
 * 티어별 텍스트 그라디언트 클래스
 */
export function getTierTextGradientClass(tier: TierConfig): string {
  return `bg-gradient-to-r ${tier.gradientFrom} ${tier.gradientVia} ${tier.gradientTo} bg-clip-text text-transparent`
}

