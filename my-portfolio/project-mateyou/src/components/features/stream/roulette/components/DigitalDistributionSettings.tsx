/**
 * DigitalDistributionSettings - 디지털 상품 지급 방식 설정
 * 
 * - bundle: 일괄 지급 (당첨 시 모든 파일 한꺼번에)
 * - individual: 개별 지급 (파일 하나씩 랜덤)
 */

import { cn } from '@/lib/utils'
import { Info, Package, Shuffle } from 'lucide-react'
import { useState } from 'react'
import type { DigitalDistributionType } from '../types'

interface DigitalDistributionSettingsProps {
  value: DigitalDistributionType
  onChange: (value: DigitalDistributionType) => void
  /** 파일 개수 (UI 표시용) */
  fileCount?: number
  className?: string
}

export function DigitalDistributionSettings({
  value,
  onChange,
  fileCount = 0,
  className,
}: DigitalDistributionSettingsProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  return (
    <div className={cn("space-y-3", className)}>
      {/* 토글 버튼 */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-purple-600 transition-colors"
      >
        <Shuffle className="w-4 h-4" />
        지급 방식 설정
        <span className={cn(
          "transform transition-transform text-xs",
          isExpanded ? "rotate-180" : ""
        )}>▼</span>
      </button>

      {/* 설정 패널 */}
      {isExpanded && (
        <div className="p-4 bg-gray-50 rounded-xl space-y-4 border border-gray-200">
          {/* 안내 메시지 */}
          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-blue-700">
              <p className="font-medium mb-1">디지털 상품은 중복 당첨이 불가합니다</p>
              <p>유저가 이미 받은 콘텐츠는 다시 당첨되지 않습니다.</p>
            </div>
          </div>

          {/* 지급 방식 선택 */}
          <div className="space-y-3">
            {/* 일괄 지급 */}
            <DistributionOption
              checked={value === 'bundle'}
              onChange={() => onChange('bundle')}
              icon={<Package className="w-5 h-5" />}
              label="일괄 지급"
              description={
                fileCount > 0
                  ? `당첨 시 ${fileCount}개 파일 전부 지급 (1회 당첨으로 완료)`
                  : "당첨 시 모든 파일을 한꺼번에 지급"
              }
              recommended={fileCount <= 3}
            />

            {/* 개별 지급 */}
            <DistributionOption
              checked={value === 'individual'}
              onChange={() => onChange('individual')}
              icon={<Shuffle className="w-5 h-5" />}
              label="개별 지급"
              description={
                fileCount > 0
                  ? `당첨마다 1개씩 랜덤 지급 (최대 ${fileCount}회 당첨 가능)`
                  : "당첨마다 파일 1개씩 랜덤 지급"
              }
              recommended={fileCount >= 3}
            />
          </div>

          {/* 파일 개수 안내 */}
          {fileCount > 0 && (
            <div className="text-xs text-gray-500 pt-2 border-t border-gray-200">
              현재 등록된 파일: <span className="font-medium text-purple-600">{fileCount}개</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================
// 내부 서브 컴포넌트
// ============================================================

interface DistributionOptionProps {
  checked: boolean
  onChange: () => void
  icon: React.ReactNode
  label: string
  description: string
  recommended?: boolean
}

function DistributionOption({
  checked,
  onChange,
  icon,
  label,
  description,
  recommended,
}: DistributionOptionProps) {
  return (
    <label
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all",
        checked
          ? "border-purple-500 bg-purple-50"
          : "border-gray-200 hover:border-gray-300 bg-white"
      )}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="mt-1 w-4 h-4 border-gray-300 text-purple-600 focus:ring-purple-500"
      />
      <div className="flex items-start gap-2 flex-1">
        <div className={cn(
          "mt-0.5",
          checked ? "text-purple-600" : "text-gray-400"
        )}>
          {icon}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-sm font-medium",
              checked ? "text-purple-700" : "text-gray-700"
            )}>
              {label}
            </span>
            {recommended && (
              <span className="px-1.5 py-0.5 text-[10px] font-medium bg-green-100 text-green-700 rounded">
                추천
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        </div>
      </div>
    </label>
  )
}
