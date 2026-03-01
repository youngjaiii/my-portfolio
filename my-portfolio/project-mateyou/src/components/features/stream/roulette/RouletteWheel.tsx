/**
 * RouletteWheel - 룰렛 돌림판 컴포넌트
 * SVG 기반으로 정확한 원형 섹션 렌더링
 * 
 * 각도 계산:
 * - 섹션 0: 0° ~ anglePerItem° (상단에서 시계방향으로 시작)
 * - 화살표: 상단 (0° 위치)
 * - 당첨 아이템이 화살표에 오도록 회전
 */

import { cn } from '@/lib/utils'
import { useEffect, useMemo, useState } from 'react'
import { ROULETTE_ANIMATION_CONFIG, type RouletteItem } from './types'

interface RouletteWheelProps {
  /** 룰렛 아이템 목록 */
  items: RouletteItem[]
  /** 최종 회전 각도 (서버에서 계산, 참고용) */
  finalRotation: number
  /** 당첨 아이템 ID */
  winningItemId?: string
  /** 애니메이션 시작 여부 */
  isSpinning?: boolean
  /** 크기 (px) */
  size?: number
  /** 애니메이션 완료 콜백 */
  onSpinComplete?: () => void
}

/** 원형 섹션 경로 계산 */
function getSlicePath(
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number
): string {
  // 각도를 라디안으로 변환 (-90도에서 시작하여 상단이 0도)
  const startRad = ((startAngle - 90) * Math.PI) / 180
  const endRad = ((endAngle - 90) * Math.PI) / 180

  const x1 = centerX + radius * Math.cos(startRad)
  const y1 = centerY + radius * Math.sin(startRad)
  const x2 = centerX + radius * Math.cos(endRad)
  const y2 = centerY + radius * Math.sin(endRad)

  // 큰 호(large-arc)인지 확인
  const largeArc = endAngle - startAngle > 180 ? 1 : 0

  return `M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`
}

/** 텍스트 위치 계산 */
function getTextPosition(
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number
): { x: number; y: number; rotation: number } {
  const midAngle = (startAngle + endAngle) / 2
  const midRad = ((midAngle - 90) * Math.PI) / 180
  const textRadius = radius * 0.65

  return {
    x: centerX + textRadius * Math.cos(midRad),
    y: centerY + textRadius * Math.sin(midRad),
    rotation: midAngle,
  }
}

export function RouletteWheel({
  items,
  finalRotation,
  winningItemId,
  isSpinning = true,
  size = 320,
  onSpinComplete,
}: RouletteWheelProps) {
  const [rotation, setRotation] = useState(0)
  const [isComplete, setIsComplete] = useState(false)

  // 활성 아이템 필터링
  const activeItems = useMemo(() => {
    return items.filter((item) => item.is_active !== false)
  }, [items])

  // 당첨 아이템 인덱스 찾기
  const winningIndex = useMemo(() => {
    if (!winningItemId) return -1
    return activeItems.findIndex((item) => item.id === winningItemId)
  }, [activeItems, winningItemId])

  // 프론트엔드에서 직접 회전 각도 계산
  const calculatedRotation = useMemo(() => {
    if (activeItems.length === 0 || winningIndex < 0) return finalRotation

    const anglePerItem = 360 / activeItems.length
    // 당첨 아이템의 중앙 각도
    const itemCenterAngle = winningIndex * anglePerItem + anglePerItem / 2
    // 화살표가 상단(0°)에 있으므로, 해당 아이템이 상단에 오려면
    // 360 - itemCenterAngle 만큼 회전해야 함
    // + 기본 3~5바퀴 회전 (서버에서 받은 값 활용)
    const baseRotations = Math.floor(finalRotation / 360) * 360
    const targetRotation = baseRotations + (360 - itemCenterAngle)
    
    return targetRotation
  }, [activeItems.length, winningIndex, finalRotation])

  // 애니메이션 시작
  useEffect(() => {
    if (!isSpinning) {
      setRotation(0)
      setIsComplete(false)
      return
    }

    // 약간의 딜레이 후 회전 시작 (CSS transition이 적용되도록)
    const startTimer = setTimeout(() => {
      setRotation(calculatedRotation)
    }, 100)

    // 애니메이션 완료 후 콜백
    const completeTimer = setTimeout(() => {
      setIsComplete(true)
      onSpinComplete?.()
    }, ROULETTE_ANIMATION_CONFIG.duration + 100)

    return () => {
      clearTimeout(startTimer)
      clearTimeout(completeTimer)
    }
  }, [isSpinning, calculatedRotation, onSpinComplete])

  // 아이템이 없으면 렌더링하지 않음
  if (activeItems.length === 0) return null

  const anglePerItem = 360 / activeItems.length
  const center = size / 2
  const radius = size / 2 - 4 // 테두리 공간
  const innerRadius = size * 0.12 // 중앙 원 크기

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* 중앙 포인터 (상단) */}
      <div className="absolute -top-4 left-1/2 z-20 -translate-x-1/2 transform">
        <div
          className="h-0 w-0 border-x-8 border-t-[24px] border-x-transparent border-t-white"
          style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))' }}
        />
      </div>

      {/* 돌림판 SVG */}
      <svg
        width={size}
        height={size}
        className="drop-shadow-2xl"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: isSpinning
            ? `transform ${ROULETTE_ANIMATION_CONFIG.duration}ms ${ROULETTE_ANIMATION_CONFIG.easing}`
            : 'none',
        }}
      >
        {/* 외곽 원 */}
        <circle
          cx={center}
          cy={center}
          r={radius + 2}
          fill="none"
          stroke="white"
          strokeWidth="4"
        />

        {/* 각 섹션 */}
        {activeItems.map((item, index) => {
          const startAngle = index * anglePerItem
          const endAngle = startAngle + anglePerItem
          const isWinner = isComplete && item.id === winningItemId

          const path = getSlicePath(center, center, radius, startAngle, endAngle)
          const textPos = getTextPosition(center, center, radius, startAngle, endAngle)

          return (
            <g key={item.id}>
              {/* 섹션 배경 */}
              <path
                d={path}
                fill={item.color}
                stroke="white"
                strokeWidth="2"
                className={cn(
                  'transition-all duration-300',
                  isWinner && 'brightness-125'
                )}
              />

              {/* 당첨 강조 */}
              {isWinner && (
                <path
                  d={path}
                  fill="none"
                  stroke="#FFD700"
                  strokeWidth="4"
                  className="animate-pulse"
                />
              )}

              {/* 아이템 이름 */}
              <text
                x={textPos.x}
                y={textPos.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="white"
                fontSize={Math.max(10, Math.min(14, size / 20))}
                fontWeight="bold"
                transform={`rotate(${textPos.rotation}, ${textPos.x}, ${textPos.y})`}
                style={{
                  textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
                  pointerEvents: 'none',
                }}
              >
                {item.name.length > 8 ? item.name.slice(0, 7) + '…' : item.name}
              </text>
            </g>
          )
        })}

      </svg>

      {/* 중앙 원 + 아이콘 (고정, 안 돌아감) */}
      <div
        className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full bg-white shadow-lg"
        style={{ 
          width: innerRadius * 2, 
          height: innerRadius * 2,
          border: '2px solid #e5e7eb',
        }}
      >
        <span style={{ fontSize: innerRadius * 1.2 }}>🎰</span>
      </div>

      {/* 외곽 그라데이션 오버레이 */}
      <div
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          background:
            'radial-gradient(circle, transparent 60%, rgba(0,0,0,0.15) 100%)',
        }}
      />
    </div>
  )
}
