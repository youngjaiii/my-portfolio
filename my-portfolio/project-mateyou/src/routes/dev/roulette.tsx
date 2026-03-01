/**
 * 룰렛 테스트 페이지 (개발용)
 * RouletteWheel, RouletteOverlay 컴포넌트를 독립적으로 테스트
 */

import { createFileRoute } from '@tanstack/react-router'
import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/Button'
import { Flex, Typography } from '@/components'
import { RouletteWheel } from '@/components/features/stream/roulette/RouletteWheel'
import { RouletteOverlay } from '@/components/features/stream/roulette/RouletteOverlay'
import {
  ROULETTE_COLORS,
  ROULETTE_ANIMATION_CONFIG,
  type RouletteItem,
  type RouletteQueueItem,
} from '@/components/features/stream/roulette/types'

export const Route = createFileRoute('/dev/roulette')({
  component: RouletteTestPage,
})

// 기본 테스트 아이템
const createDefaultItems = (count: number): RouletteItem[] => {
  const names = ['꽝', '100P', '전화권', '대박', '잭팟', '꽝2', '500P', '특별사진']
  // 새로운 타입 체계: text, usable, digital
  const rewardConfigs: Array<{ type: 'text' | 'usable' | 'digital'; value: string | null }> = [
    { type: 'text', value: null },           // 꽝
    { type: 'text', value: '100' },          // 100P (text + 포인트)
    { type: 'usable', value: '10분' },       // 전화권
    { type: 'text', value: null },           // 대박
    { type: 'text', value: '1000' },         // 잭팟 (포인트)
    { type: 'text', value: null },           // 꽝2
    { type: 'text', value: '500' },          // 500P
    { type: 'digital', value: '특별 사진' }, // 특별사진
  ]
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i}`,
    wheel_id: 'test-wheel',
    name: names[i % names.length],
    color: ROULETTE_COLORS[i % ROULETTE_COLORS.length],
    weight: i === 0 ? 10 : Math.floor(Math.random() * 5) + 1,
    reward_type: rewardConfigs[i % rewardConfigs.length].type,
    reward_value: rewardConfigs[i % rewardConfigs.length].value,
    sort_order: i,
    is_active: true,
  }))
}

function RouletteTestPage() {
  // 상태
  const [itemCount, setItemCount] = useState(6)
  const [wheelSize, setWheelSize] = useState(320)
  const [isSpinning, setIsSpinning] = useState(false)
  const [winningIndex, setWinningIndex] = useState(0)
  const [showOverlay, setShowOverlay] = useState(false)
  const [queueLength, setQueueLength] = useState(0)
  const [spinKey, setSpinKey] = useState(0)

  // 아이템 생성
  const items = useMemo(() => createDefaultItems(itemCount), [itemCount])

  // 당첨 아이템
  const winningItem = items[winningIndex] || items[0]

  // 회전 각도 계산 (3~5바퀴 + 당첨 위치)
  const finalRotation = useMemo(() => {
    const baseRotations = (3 + Math.random() * 2) * 360
    return Math.floor(baseRotations)
  }, [spinKey])

  // 룰렛 돌리기
  const handleSpin = () => {
    // 랜덤 당첨 인덱스
    const randomIndex = Math.floor(Math.random() * items.length)
    setWinningIndex(randomIndex)
    setSpinKey((prev) => prev + 1)
    setIsSpinning(true)
  }

  // 특정 아이템 당첨으로 돌리기
  const handleSpinToItem = (index: number) => {
    setWinningIndex(index)
    setSpinKey((prev) => prev + 1)
    setIsSpinning(true)
  }

  // 스핀 완료
  const handleSpinComplete = () => {
    console.log('스핀 완료! 당첨:', winningItem.name)
  }

  // 리셋
  const handleReset = () => {
    setIsSpinning(false)
    setSpinKey((prev) => prev + 1)
  }

  // 오버레이용 큐 아이템
  const overlayQueueItem: RouletteQueueItem | null = showOverlay
    ? {
        id: 'test-overlay',
        donorName: '테스트유저',
        donorProfileImage: null,
        wheelName: '테스트 룰렛',
        wheelPrice: 1000,
        items,
        winningItemId: winningItem.id,
        winningItemName: winningItem.name,
        winningItemColor: winningItem.color,
        finalRotation,
        createdAt: new Date().toISOString(),
      }
    : null

  // 오버레이 스킵
  const handleOverlaySkip = () => {
    setShowOverlay(false)
  }

  // 오버레이 시작
  const handleShowOverlay = () => {
    const randomIndex = Math.floor(Math.random() * items.length)
    setWinningIndex(randomIndex)
    setSpinKey((prev) => prev + 1)
    setShowOverlay(true)

    // 자동 종료 (애니메이션 시간 + 여유)
    setTimeout(() => {
      setShowOverlay(false)
    }, ROULETTE_ANIMATION_CONFIG.totalDuration + 2000)
  }

  return (
    <Flex direction="column" className="min-h-screen bg-gray-900 p-6">
      {/* 헤더 */}
      <div className="mb-8 text-center">
        <Typography variant="h1" className="text-white mb-2">
          🎰 룰렛 테스트 페이지
        </Typography>
        <Typography variant="body2" className="text-gray-400">
          개발용 - RouletteWheel, RouletteOverlay 컴포넌트 테스트
        </Typography>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 좌측: 컨트롤 패널 */}
        <div className="bg-gray-800 rounded-xl p-6 space-y-6">
          <Typography variant="h3" className="text-white mb-4">
            ⚙️ 설정
          </Typography>

          {/* 아이템 수 조절 */}
          <div>
            <Typography variant="body2" className="text-gray-300 mb-2">
              아이템 수: {itemCount}개
            </Typography>
            <div className="flex gap-2">
              {[2, 3, 4, 5, 6, 8, 10, 12].map((count) => (
                <Button
                  key={count}
                  size="sm"
                  variant={itemCount === count ? 'default' : 'outline'}
                  onClick={() => {
                    setItemCount(count)
                    handleReset()
                  }}
                  className="min-w-[40px]"
                >
                  {count}
                </Button>
              ))}
            </div>
          </div>

          {/* 휠 크기 조절 */}
          <div>
            <Typography variant="body2" className="text-gray-300 mb-2">
              휠 크기: {wheelSize}px
            </Typography>
            <div className="flex gap-2">
              {[200, 280, 320, 400, 500].map((size) => (
                <Button
                  key={size}
                  size="sm"
                  variant={wheelSize === size ? 'default' : 'outline'}
                  onClick={() => setWheelSize(size)}
                  className="min-w-[50px]"
                >
                  {size}
                </Button>
              ))}
            </div>
          </div>

          {/* 대기열 수 (오버레이용) */}
          <div>
            <Typography variant="body2" className="text-gray-300 mb-2">
              대기열 표시: {queueLength}개
            </Typography>
            <div className="flex gap-2">
              {[0, 1, 3, 5, 10].map((count) => (
                <Button
                  key={count}
                  size="sm"
                  variant={queueLength === count ? 'default' : 'outline'}
                  onClick={() => setQueueLength(count)}
                  className="min-w-[40px]"
                >
                  {count}
                </Button>
              ))}
            </div>
          </div>

          {/* 액션 버튼 */}
          <div className="space-y-3 pt-4 border-t border-gray-700">
            <Typography variant="h4" className="text-white">
              🎮 액션
            </Typography>

            <div className="flex gap-2 flex-wrap">
              <Button
                onClick={handleSpin}
                disabled={isSpinning}
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
              >
                🎲 랜덤 돌리기
              </Button>
              <Button onClick={handleReset} variant="outline">
                🔄 리셋
              </Button>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button
                onClick={handleShowOverlay}
                className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
              >
                🖥️ 오버레이 테스트
              </Button>
            </div>
          </div>

          {/* 특정 아이템으로 돌리기 */}
          <div className="space-y-3 pt-4 border-t border-gray-700">
            <Typography variant="h4" className="text-white">
              🎯 특정 아이템 당첨 테스트
            </Typography>
            <div className="flex gap-2 flex-wrap">
              {items.map((item, index) => (
                <Button
                  key={item.id}
                  size="sm"
                  variant="outline"
                  onClick={() => handleSpinToItem(index)}
                  disabled={isSpinning}
                  className="border-2"
                  style={{ borderColor: item.color, color: item.color }}
                >
                  {item.name}
                </Button>
              ))}
            </div>
          </div>

          {/* 현재 아이템 목록 */}
          <div className="space-y-3 pt-4 border-t border-gray-700">
            <Typography variant="h4" className="text-white">
              📋 아이템 목록
            </Typography>
            <div className="grid grid-cols-2 gap-2">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 rounded-lg p-2 text-sm"
                  style={{ backgroundColor: item.color + '30' }}
                >
                  <div
                    className="h-4 w-4 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-white">
                    {index + 1}. {item.name}
                  </span>
                  <span className="text-gray-400 text-xs ml-auto">
                    w:{item.weight}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 상태 정보 */}
          <div className="space-y-2 pt-4 border-t border-gray-700">
            <Typography variant="h4" className="text-white">
              📊 상태
            </Typography>
            <div className="text-sm text-gray-400 space-y-1">
              <p>스핀 상태: {isSpinning ? '🔄 회전 중' : '⏸️ 정지'}</p>
              <p>
                당첨 아이템: {winningItem.name} (인덱스: {winningIndex})
              </p>
              <p>회전 각도: {finalRotation}°</p>
              <p>애니메이션 시간: {ROULETTE_ANIMATION_CONFIG.duration}ms</p>
            </div>
          </div>
        </div>

        {/* 우측: 룰렛 미리보기 */}
        <div className="bg-gray-800 rounded-xl p-6 flex flex-col items-center justify-center min-h-[600px]">
          <Typography variant="h3" className="text-white mb-6">
            🎡 룰렛 미리보기
          </Typography>

          <div className="relative">
            <RouletteWheel
              key={spinKey}
              items={items}
              finalRotation={finalRotation}
              winningItemId={winningItem.id}
              isSpinning={isSpinning}
              size={wheelSize}
              onSpinComplete={handleSpinComplete}
            />
          </div>

          {/* 당첨 결과 표시 */}
          {isSpinning && (
            <div className="mt-6 text-center">
              <Typography variant="body1" className="text-yellow-400">
                🎰 룰렛이 돌아가는 중...
              </Typography>
            </div>
          )}
        </div>
      </div>

      {/* 전체 화면 오버레이 */}
      <RouletteOverlay
        roulette={overlayQueueItem}
        queueLength={queueLength}
        isHost={true}
        onSkip={handleOverlaySkip}
      />

      {/* 하단 정보 */}
      <div className="mt-8 text-center">
        <Typography variant="caption" className="text-gray-500">
          ⚠️ 이 페이지는 개발/테스트 목적으로만 사용하세요
        </Typography>
      </div>
    </Flex>
  )
}
