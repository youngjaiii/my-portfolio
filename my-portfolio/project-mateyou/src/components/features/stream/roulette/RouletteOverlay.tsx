/**
 * RouletteOverlay - 룰렛 전체 화면 오버레이
 * 후원 시 모든 시청자에게 동기화된 룰렛 애니메이션 표시
 */

import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { RouletteWheel } from './RouletteWheel'
import type { RouletteQueueItem } from './types'
import { ROULETTE_ANIMATION_CONFIG } from './types'

interface RouletteOverlayProps {
  /** 현재 표시할 룰렛 */
  roulette: RouletteQueueItem | null
  /** 대기 중인 룰렛 수 */
  queueLength?: number
  /** 호스트 여부 (스킵 버튼 표시) */
  isHost?: boolean
  /** 스킵 콜백 */
  onSkip?: () => void
}

type Phase = 'intro' | 'spinning' | 'result' | 'exit'

export function RouletteOverlay({
  roulette,
  queueLength = 0,
  isHost = false,
  onSkip,
}: RouletteOverlayProps) {
  const [phase, setPhase] = useState<Phase>('intro')
  const [showResult, setShowResult] = useState(false)

  // 페이즈 전환
  useEffect(() => {
    if (!roulette) {
      setPhase('intro')
      setShowResult(false)
      return
    }

    // 인트로 (0.5초)
    setPhase('intro')
    const introTimer = setTimeout(() => {
      setPhase('spinning')
    }, 500)

    // 결과 표시 (회전 완료 후)
    const resultTimer = setTimeout(() => {
      setShowResult(true)
      setPhase('result')
    }, ROULETTE_ANIMATION_CONFIG.duration + 600)

    return () => {
      clearTimeout(introTimer)
      clearTimeout(resultTimer)
    }
  }, [roulette])

  if (!roulette) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      >
        {/* 배경 이펙트 */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {/* 빛줄기 - vmax 사용으로 세로/가로 화면 모두 대응 */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{
              width: '200vmax',
              height: '200vmax',
              background:
                'conic-gradient(from 0deg, transparent, rgba(255,255,255,0.1), transparent, rgba(255,255,255,0.1), transparent)',
            }}
          />
        </div>

        {/* 메인 컨텐츠 */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 20 }}
          className="relative flex flex-col items-center gap-6"
        >
          {/* 후원자 정보 + 룰렛판 이름 */}
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="flex flex-col items-center gap-2"
          >
            {/* 룰렛판 이름 */}
            <div className="rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-1 text-sm font-semibold text-white shadow-lg">
              🎰 {roulette.wheelName} ({roulette.wheelPrice.toLocaleString()}P)
            </div>

            {/* 후원자 정보 */}
            <div className="flex items-center gap-3 rounded-full bg-white/20 px-6 py-3 backdrop-blur-sm">
              {roulette.donorProfileImage ? (
                <img
                  src={roulette.donorProfileImage}
                  alt={roulette.donorName}
                  className="h-10 w-10 rounded-full border-2 border-white object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-pink-400 to-purple-500 text-lg font-bold text-white">
                  {roulette.donorName[0]}
                </div>
              )}
              <span className="text-xl font-bold text-white drop-shadow-lg">
                {roulette.donorName}
                <span className="ml-2 text-base font-normal text-white/80">
                  님의 룰렛!
                </span>
              </span>
            </div>
          </motion.div>

          {/* 룰렛 휠 */}
          <RouletteWheel
            items={roulette.items}
            finalRotation={roulette.finalRotation}
            winningItemId={roulette.winningItemId}
            isSpinning={phase === 'spinning' || phase === 'result'}
            size={300}
          />

          {/* 결과 표시 */}
          <AnimatePresence>
            {showResult && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', damping: 15 }}
                className="flex flex-col items-center gap-3"
              >
                {/* 디지털 당첨 시 썸네일 미리보기 */}
                {roulette.winningItemRewardType === 'digital' && roulette.winningItemDigitalPreview && (
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="relative"
                  >
                    <div className="relative h-32 w-32 overflow-hidden rounded-xl border-4 border-white shadow-2xl">
                      <img
                        src={roulette.winningItemDigitalPreview}
                        alt={roulette.winningItemName}
                        className="h-full w-full object-cover"
                      />
                      {/* 그라데이션 오버레이 */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                    </div>
                    {/* 사진 아이콘 뱃지 */}
                    <div className="absolute -bottom-2 -right-2 rounded-full bg-purple-500 p-2 shadow-lg">
                      <span className="text-lg">📷</span>
                    </div>
                  </motion.div>
                )}

                {/* 당첨 아이템 */}
                <div
                  className={cn(
                    'rounded-xl px-8 py-4 text-center shadow-xl',
                    roulette.winningItemRewardType === 'digital'
                      ? 'bg-gradient-to-r from-purple-500 to-pink-500'
                      : 'bg-gradient-to-r from-yellow-400 to-orange-500'
                  )}
                >
                  <p className="text-sm font-medium text-white/80">
                    {roulette.winningItemRewardType === 'digital' ? '📷 디지털 당첨!' : '🎉 당첨!'}
                  </p>
                  <p
                    className="text-2xl font-bold drop-shadow-lg"
                    style={{ 
                      color: 'white',
                      textShadow: `0 0 10px ${roulette.winningItemColor}, 0 0 20px ${roulette.winningItemColor}` 
                    }}
                  >
                    {roulette.winningItemName}
                  </p>
                  {roulette.winningItemRewardType === 'digital' && (
                    <p className="mt-1 text-xs text-white/70">
                      내 컬렉션에서 확인하세요!
                    </p>
                  )}
                </div>

                {/* 축하 이펙트 */}
                <div className="flex gap-2 text-4xl">
                  <motion.span
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 0.5, repeat: Infinity, delay: 0 }}
                  >
                    {roulette.winningItemRewardType === 'digital' ? '✨' : '🎊'}
                  </motion.span>
                  <motion.span
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 0.5, repeat: Infinity, delay: 0.1 }}
                  >
                    {roulette.winningItemRewardType === 'digital' ? '💜' : '✨'}
                  </motion.span>
                  <motion.span
                    animate={{ y: [0, -10, 0] }}
                    transition={{ duration: 0.5, repeat: Infinity, delay: 0.2 }}
                  >
                    {roulette.winningItemRewardType === 'digital' ? '✨' : '🎊'}
                  </motion.span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* 대기 중인 룰렛 표시 */}
          {queueLength > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute -bottom-12 rounded-full bg-white/10 px-4 py-1 text-sm text-white/60"
            >
              다음 룰렛: {queueLength}개 대기 중
            </motion.div>
          )}
        </motion.div>

        {/* 호스트 스킵 버튼 - 화면 우측 상단 고정 */}
        {isHost && onSkip && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSkip}
            className="fixed right-4 top-4 z-[60] rounded-full bg-black/30 px-4 py-2 text-white/80 backdrop-blur-sm hover:bg-black/50 hover:text-white"
          >
            스킵 →
          </Button>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
