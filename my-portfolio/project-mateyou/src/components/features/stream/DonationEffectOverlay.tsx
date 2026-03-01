/**
 * 후원 이펙트 오버레이
 * 후원 금액에 따라 화려함이 달라지는 티어별 이펙트
 */

import { Avatar } from '@/components/ui/Avatar'
import type { DonationEffect } from '@/hooks/useStreamDonations'
import {
  getTierConfig,
  getTierGradientClass,
  getTierTextGradientClass,
  type TierConfig,
} from '@/lib/donationTiers'
import { playDonationSound } from '@/lib/donationSound'
import { useEffect, useRef, useState } from 'react'

interface DonationEffectOverlayProps {
  effects: DonationEffect[]
}

export function DonationEffectOverlay({ effects }: DonationEffectOverlayProps) {
  if (effects.length === 0) return null

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {effects.map((effect) => (
        <DonationEffectItem key={effect.id} effect={effect} />
      ))}
    </div>
  )
}

interface DonationEffectItemProps {
  effect: DonationEffect
}

function DonationEffectItem({ effect }: DonationEffectItemProps) {
  const [isVisible, setIsVisible] = useState(true) // 바로 표시
  const [isExiting, setIsExiting] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const soundPlayedRef = useRef(false)

  const tier = getTierConfig(effect.amount)

  useEffect(() => {
    // 사운드 재생 (한 번만)
    if (!soundPlayedRef.current) {
      soundPlayedRef.current = true
      playDonationSound(effect.amount)
    }

    // 퇴장 애니메이션
    const exitTimer = setTimeout(
      () => setIsExiting(true),
      (tier.duration - 1) * 1000,
    )

    return () => {
      clearTimeout(exitTimer)
    }
  }, [effect.amount, tier.duration])

  // 화면 흔들림 효과
  useEffect(() => {
    if (tier.shakeIntensity === 0) return

    const container = containerRef.current
    if (!container) return

    const intensity = tier.shakeIntensity
    let frame: number
    let startTime = performance.now()
    const shakeDuration = 500

    const shake = (currentTime: number) => {
      const elapsed = currentTime - startTime
      if (elapsed > shakeDuration) {
        container.style.transform = ''
        return
      }

      const decay = 1 - elapsed / shakeDuration
      const x = (Math.random() - 0.5) * intensity * 4 * decay
      const y = (Math.random() - 0.5) * intensity * 4 * decay
      container.style.transform = `translate(${x}px, ${y}px)`

      frame = requestAnimationFrame(shake)
    }

    frame = requestAnimationFrame(shake)

    return () => cancelAnimationFrame(frame)
  }, [tier.shakeIntensity])

  return (
    <div ref={containerRef} className="absolute inset-0">
      {/* 배경 글로우 효과 */}
      <BackgroundGlow tier={tier} isVisible={isVisible} isExiting={isExiting} />

      {/* 하트 파티클 */}
      <HeartParticles
        isActive={isVisible && !isExiting}
        heartImage={effect.heartImage}
        tier={tier}
      />

      {/* 스파클 이펙트 (골드 이상) */}
      {tier.tier !== 'bronze' && tier.tier !== 'silver' && (
        <SparkleEffect isActive={isVisible && !isExiting} tier={tier} />
      )}

      {/* 링 웨이브 이펙트 (플래티넘 이상) */}
      {(tier.tier === 'platinum' || tier.tier === 'diamond') && (
        <RingWaveEffect isActive={isVisible} tier={tier} />
      )}

      {/* 메인 후원 카드 - 화면 정중앙 */}
      <div
        className={`
          absolute inset-0 flex items-center justify-center
          ${isExiting ? 'animate-fadeOut' : 'animate-fadeIn'}
        `}
      >
        <div className="relative">
          {/* 글로우 배경 */}
          <div
            className="absolute inset-0 blur-3xl rounded-3xl animate-pulse"
            style={{
              background: tier.glowColor,
              transform: 'scale(1.5)',
              animationDuration: '2s',
            }}
          />

          {/* 카드 본체 */}
          <div
            className={`relative ${getTierGradientClass(tier)} rounded-3xl p-1 shadow-2xl`}
          >
            <div className="bg-white/95 backdrop-blur-sm rounded-[22px] px-8 py-6 flex flex-col items-center gap-4 min-w-[280px]">
              {/* 티어 배지 */}
              <TierBadge tier={tier} />

              {/* 하트 이미지 */}
              <HeartIcon heartImage={effect.heartImage} tier={tier} />

              {/* 후원자 정보 */}
              <div className="flex items-center gap-2">
                <Avatar
                  src={effect.donorProfileImage}
                  name={effect.donorName}
                  size="sm"
                />
                <span className="font-bold text-gray-800 text-lg">
                  {effect.donorName}
                </span>
              </div>

              {/* 후원 메시지 */}
              <p className="text-center text-gray-600 text-sm">
                <span className={`font-semibold ${getTierTextGradientClass(tier)}`}>
                  {effect.recipientName}
                </span>
                님에게 후원!
              </p>

              {/* 금액 */}
              <div className="relative">
                <span
                  className={`text-3xl font-black ${getTierTextGradientClass(tier)}`}
                  style={{ textShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                >
                  {effect.amount.toLocaleString()}P
                </span>
              </div>

              {/* 커스텀 메시지 */}
              {effect.message && (
                <p className="text-sm text-gray-500 italic text-center max-w-[200px] truncate">
                  "{effect.message}"
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 페이드 애니메이션 스타일 */}
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes fadeOut {
          from {
            opacity: 1;
          }
          to {
            opacity: 0;
          }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out forwards;
        }
        .animate-fadeOut {
          animation: fadeOut 0.5s ease-out forwards;
        }
      `}</style>
    </div>
  )
}

/** 티어 배지 */
function TierBadge({ tier }: { tier: TierConfig }) {
  if (tier.tier === 'bronze') return null

  const icons: Record<string, string> = {
    silver: '⭐',
    gold: '👑',
    platinum: '💎',
    diamond: '🌟',
  }

  return (
    <div
      className={`absolute -top-3 -right-3 ${getTierGradientClass(tier)} 
      text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg`}
    >
      {icons[tier.tier]} {tier.label}
    </div>
  )
}

/** 하트 아이콘 (티어별 애니메이션) */
function HeartIcon({
  heartImage,
  tier,
}: {
  heartImage: string
  tier: TierConfig
}) {
  // 티어별 크기
  const sizeMap: Record<string, string> = {
    bronze: 'w-16 h-16',
    silver: 'w-20 h-20',
    gold: 'w-24 h-24',
    platinum: 'w-28 h-28',
    diamond: 'w-32 h-32',
  }

  const size = sizeMap[tier.tier]

  return (
    <div className="relative">
      <img
        src={heartImage}
        alt="하트"
        className={`${size} object-contain animate-pulse`}
        style={{ animationDuration: '1s' }}
      />
      {/* 빛나는 효과 */}
      <div
        className="absolute inset-0 animate-ping"
        style={{ animationDuration: tier.tier === 'diamond' ? '1s' : '2s' }}
      >
        <img
          src={heartImage}
          alt=""
          className={`${size} object-contain opacity-30`}
        />
      </div>

      {/* 다이아몬드: 회전하는 광선 */}
      {tier.tier === 'diamond' && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ animation: 'spin 3s linear infinite' }}
        >
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-16 bg-gradient-to-t from-transparent via-pink-300 to-transparent opacity-50"
              style={{
                transform: `rotate(${i * 45}deg) translateY(-50%)`,
                transformOrigin: 'bottom center',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** 배경 글로우 효과 */
function BackgroundGlow({
  tier,
  isVisible,
  isExiting,
}: {
  tier: TierConfig
  isVisible: boolean
  isExiting: boolean
}) {
  const bgColors: Record<string, string> = {
    bronze: 'rgba(205, 127, 50, 0.1)',
    silver: 'rgba(192, 192, 192, 0.15)',
    gold: 'rgba(255, 215, 0, 0.2)',
    platinum: 'rgba(100, 200, 255, 0.2)',
    diamond: 'rgba(255, 100, 255, 0.25)',
  }

  return (
    <div
      className={`
        absolute inset-0 transition-opacity duration-500
        ${isVisible && !isExiting ? 'opacity-100' : 'opacity-0'}
      `}
      style={{
        background: `radial-gradient(ellipse at center, ${bgColors[tier.tier]} 0%, transparent 70%)`,
      }}
    />
  )
}

/** 하트 파티클 효과 */
function HeartParticles({
  isActive,
  heartImage,
  tier,
}: {
  isActive: boolean
  heartImage: string
  tier: TierConfig
}) {
  const [particles, setParticles] = useState<
    Array<{
      id: number
      x: number
      y: number
      size: number
      delay: number
      duration: number
    }>
  >([])

  useEffect(() => {
    if (!isActive) {
      setParticles([])
      return
    }

    const newParticles = Array.from({ length: tier.particleCount }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: 100 + Math.random() * 20,
      size:
        tier.particleSize.min +
        Math.random() * (tier.particleSize.max - tier.particleSize.min),
      delay: Math.random() * 2,
      duration: 3 + Math.random() * 2,
    }))

    setParticles(newParticles)

    return () => setParticles([])
  }, [isActive, tier.particleCount, tier.particleSize.min, tier.particleSize.max])

  return (
    <>
      {particles.map((particle) => (
        <img
          key={particle.id}
          src={heartImage}
          alt=""
          className="absolute pointer-events-none"
          style={{
            left: `${particle.x}%`,
            bottom: `-${particle.size}px`,
            width: particle.size,
            height: particle.size,
            opacity: 0,
            animation: `floatUp ${particle.duration}s ease-out ${particle.delay}s forwards`,
          }}
        />
      ))}

      <style>{`
        @keyframes floatUp {
          0% {
            opacity: 0;
            transform: translateY(0) rotate(0deg) scale(0.5);
          }
          10% {
            opacity: 0.8;
            transform: translateY(-10vh) rotate(-10deg) scale(1);
          }
          90% {
            opacity: 0.6;
            transform: translateY(-80vh) rotate(20deg) scale(0.8);
          }
          100% {
            opacity: 0;
            transform: translateY(-100vh) rotate(30deg) scale(0.5);
          }
        }
      `}</style>
    </>
  )
}

/** 스파클 이펙트 (골드 이상) */
function SparkleEffect({
  isActive,
  tier,
}: {
  isActive: boolean
  tier: TierConfig
}) {
  const [sparkles, setSparkles] = useState<
    Array<{
      id: number
      x: number
      y: number
      size: number
      delay: number
    }>
  >([])

  useEffect(() => {
    if (!isActive) {
      setSparkles([])
      return
    }

    const count = tier.tier === 'diamond' ? 30 : tier.tier === 'platinum' ? 20 : 12
    const newSparkles = Array.from({ length: count }, (_, i) => ({
      id: i,
      x: 10 + Math.random() * 80,
      y: 10 + Math.random() * 80,
      size: 4 + Math.random() * 8,
      delay: Math.random() * 3,
    }))

    setSparkles(newSparkles)
  }, [isActive, tier.tier])

  const sparkleColor =
    tier.tier === 'diamond'
      ? '#ff69b4'
      : tier.tier === 'platinum'
        ? '#87ceeb'
        : '#ffd700'

  return (
    <>
      {sparkles.map((sparkle) => (
        <div
          key={sparkle.id}
          className="absolute pointer-events-none"
          style={{
            left: `${sparkle.x}%`,
            top: `${sparkle.y}%`,
            width: sparkle.size,
            height: sparkle.size,
            backgroundColor: sparkleColor,
            borderRadius: '50%',
            boxShadow: `0 0 ${sparkle.size * 2}px ${sparkleColor}`,
            animation: `sparkle 1.5s ease-in-out ${sparkle.delay}s infinite`,
          }}
        />
      ))}

      <style>{`
        @keyframes sparkle {
          0%, 100% {
            opacity: 0;
            transform: scale(0);
          }
          50% {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </>
  )
}

/** 링 웨이브 이펙트 (플래티넘 이상) - 화면 정중앙 */
function RingWaveEffect({
  isActive,
  tier,
}: {
  isActive: boolean
  tier: TierConfig
}) {
  if (!isActive) return null

  const ringColor =
    tier.tier === 'diamond'
      ? 'rgba(255, 100, 255, 0.3)'
      : 'rgba(100, 200, 255, 0.3)'

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      {[0, 0.5, 1].map((delay, i) => (
        <div
          key={i}
          className="absolute pointer-events-none"
          style={{
            width: 100,
            height: 100,
            border: `3px solid ${ringColor}`,
            borderRadius: '50%',
            animation: `ringWave 2s ease-out ${delay}s infinite`,
          }}
        />
      ))}

      <style>{`
        @keyframes ringWave {
          0% {
            opacity: 1;
            transform: scale(1);
          }
          100% {
            opacity: 0;
            transform: scale(4);
          }
        }
      `}</style>
    </div>
  )
}
