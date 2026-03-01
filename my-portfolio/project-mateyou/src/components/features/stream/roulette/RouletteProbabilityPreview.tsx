/**
 * RouletteProbabilityPreview - 룰렛 확률 미리보기
 * 아이템별 당첨 확률을 시각적으로 표시
 */

import { cn } from '@/lib/utils'
import { useMemo } from 'react'
import type { RouletteItem } from './types'

interface RouletteProbabilityPreviewProps {
  items: RouletteItem[]
  /** 미리보기 크기 */
  size?: 'sm' | 'md' | 'lg'
  /** 선택된 아이템 ID (하이라이트) */
  selectedItemId?: string
}

export function RouletteProbabilityPreview({
  items,
  size = 'md',
  selectedItemId,
}: RouletteProbabilityPreviewProps) {
  // 활성 아이템만 필터
  const activeItems = useMemo(() => {
    return items.filter((item) => item.is_active !== false)
  }, [items])

  // 전체 가중치
  const totalWeight = useMemo(() => {
    return activeItems.reduce((sum, item) => sum + item.weight, 0)
  }, [activeItems])

  // 크기별 스타일
  const sizeStyles = {
    sm: {
      height: 'h-2',
      text: 'text-xs',
      gap: 'gap-1',
    },
    md: {
      height: 'h-4',
      text: 'text-sm',
      gap: 'gap-2',
    },
    lg: {
      height: 'h-6',
      text: 'text-base',
      gap: 'gap-3',
    },
  }

  const styles = sizeStyles[size]

  if (activeItems.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        아이템이 없습니다
      </div>
    )
  }

  return (
    <div className={cn('space-y-2', styles.gap)}>
      {/* 확률 바 */}
      <div className={cn('flex overflow-hidden rounded-full', styles.height)}>
        {activeItems.map((item) => {
          const percentage = totalWeight > 0 ? (item.weight / totalWeight) * 100 : 0

          return (
            <div
              key={item.id}
              className={cn(
                'transition-all',
                selectedItemId === item.id && 'ring-2 ring-white ring-inset'
              )}
              style={{
                width: `${percentage}%`,
                backgroundColor: item.color,
                minWidth: percentage > 0 ? '4px' : '0',
              }}
              title={`${item.name}: ${item.weight}%`}
            />
          )
        })}
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {activeItems.map((item) => {
          const percentage = totalWeight > 0 ? (item.weight / totalWeight) * 100 : 0

          return (
            <div
              key={item.id}
              className={cn(
                'flex items-center gap-1.5',
                selectedItemId === item.id && 'font-semibold'
              )}
            >
              <div
                className="h-3 w-3 shrink-0 rounded-sm"
                style={{ backgroundColor: item.color }}
              />
              <span className={cn('truncate', styles.text)}>{item.name}</span>
              <span className={cn('text-muted-foreground', styles.text)}>
                ({item.weight}) {percentage.toFixed(1)}%
              </span>
            </div>
          )
        })}
      </div>

      {/* 가중치 합계 정보 */}
      <p className="text-xs text-gray-500">
        총 가중치: {totalWeight} (아이템 {activeItems.length}개)
      </p>
    </div>
  )
}

