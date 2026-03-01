/**
 * DigitalProgressBadge - 디지털 상품 수집 진행률 뱃지
 * 
 * 개별 지급 디지털 상품의 수집 상태를 시각적으로 표시
 * - 진행률 바
 * - n/m 개수 표시
 * - 완료 시 체크 표시
 */

import { Check, ImageIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DigitalItemProgress } from '@/hooks/useDigitalItemProgress'

interface DigitalProgressBadgeProps {
  progress: DigitalItemProgress
  /** 컴팩트 모드 (작은 뱃지) */
  compact?: boolean
  className?: string
}

export function DigitalProgressBadge({
  progress,
  compact = false,
  className,
}: DigitalProgressBadgeProps) {
  const { totalFiles, wonFiles, isComplete, progressPercent, distributionType } = progress

  // 일괄 지급은 진행률 표시 불필요
  if (distributionType === 'bundle') {
    return null
  }

  if (compact) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium",
          isComplete
            ? "bg-green-100 text-green-700"
            : "bg-purple-100 text-purple-700",
          className
        )}
      >
        {isComplete ? (
          <Check className="w-2.5 h-2.5" />
        ) : (
          <ImageIcon className="w-2.5 h-2.5" />
        )}
        {wonFiles}/{totalFiles}
      </span>
    )
  }

  return (
    <div className={cn("space-y-1", className)}>
      {/* 진행률 텍스트 */}
      <div className="flex items-center justify-between text-xs">
        <span className={cn(
          "font-medium",
          isComplete ? "text-green-600" : "text-gray-600"
        )}>
          {isComplete ? (
            <span className="flex items-center gap-1">
              <Check className="w-3 h-3" /> 수집 완료!
            </span>
          ) : (
            `${wonFiles}/${totalFiles} 수집`
          )}
        </span>
        <span className="text-gray-400">{progressPercent}%</span>
      </div>

      {/* 진행률 바 */}
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            isComplete ? "bg-green-500" : "bg-purple-500"
          )}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* 수집 도트 (파일 개수만큼) */}
      {totalFiles <= 10 && (
        <div className="flex items-center gap-1 pt-1">
          {Array.from({ length: totalFiles }).map((_, index) => (
            <div
              key={index}
              className={cn(
                "w-2 h-2 rounded-full transition-colors",
                index < wonFiles
                  ? isComplete ? "bg-green-500" : "bg-purple-500"
                  : "bg-gray-300"
              )}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * 간단한 진행률 텍스트
 */
export function DigitalProgressText({
  progress,
  className,
}: {
  progress: DigitalItemProgress
  className?: string
}) {
  const { totalFiles, wonFiles, isComplete, distributionType } = progress

  if (distributionType === 'bundle') {
    return null
  }

  return (
    <span className={cn(
      "text-xs",
      isComplete ? "text-green-600 font-medium" : "text-gray-500",
      className
    )}>
      {isComplete ? (
        "✓ 수집 완료"
      ) : (
        `${wonFiles}/${totalFiles}장 수집`
      )}
    </span>
  )
}

/**
 * 남은 개수 안내
 */
export function RemainingFilesInfo({
  progress,
  className,
}: {
  progress: DigitalItemProgress
  className?: string
}) {
  const { totalFiles, wonFiles, isComplete, distributionType } = progress

  if (distributionType === 'bundle' || isComplete) {
    return null
  }

  const remaining = totalFiles - wonFiles

  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-2 bg-purple-50 border border-purple-200 rounded-lg",
      className
    )}>
      <ImageIcon className="w-4 h-4 text-purple-500" />
      <div className="flex-1">
        <p className="text-sm font-medium text-purple-700">
          남은 카드: {remaining}장
        </p>
        <p className="text-xs text-purple-500">
          {wonFiles}/{totalFiles}장 수집 완료
        </p>
      </div>
      {/* 진행률 미니 바 */}
      <div className="w-12 h-1.5 bg-purple-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-purple-500 rounded-full"
          style={{ width: `${(wonFiles / totalFiles) * 100}%` }}
        />
      </div>
    </div>
  )
}
