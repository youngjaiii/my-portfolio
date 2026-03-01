/**
 * RewardTypeSelector - 보상 타입 선택 컴포넌트
 * 
 * 텍스트 / 사용형 / 디지털 3종 타입 선택
 */

import { cn } from '@/lib/utils'
import type { RouletteRewardType } from '../types'

interface RewardTypeSelectorProps {
  value: RouletteRewardType
  onChange: (type: RouletteRewardType) => void
  label?: string
  className?: string
}

const REWARD_TYPES: {
  type: RouletteRewardType
  icon: string
  label: string
  description: string
}[] = [
  {
    type: 'text',
    icon: '🎁',
    label: '텍스트',
    description: '꽝, 축하 메시지 등 텍스트만 표시',
  },
  {
    type: 'usable',
    icon: '🎫',
    label: '사용형',
    description: '전화권, 채팅권, 쿠폰 등 (파트너 승인 필요)',
  },
  {
    type: 'digital',
    icon: '📷',
    label: '디지털',
    description: '사진, 영상 등 파일 (바로 지급)',
  },
]

export function RewardTypeSelector({
  value,
  onChange,
  label = '보상 타입',
  className,
}: RewardTypeSelectorProps) {
  const selectedType = REWARD_TYPES.find((t) => t.type === value)

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <div className="grid grid-cols-3 gap-2">
        {REWARD_TYPES.map(({ type, icon, label: typeLabel }) => (
          <button
            key={type}
            type="button"
            onClick={() => onChange(type)}
            className={cn(
              'flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-all',
              value === type
                ? 'border-purple-500 bg-purple-50'
                : 'border-gray-200 hover:border-gray-300'
            )}
          >
            <span className="text-xl">{icon}</span>
            <span className="text-xs font-medium">{typeLabel}</span>
          </button>
        ))}
      </div>
      {selectedType && (
        <p className="text-xs text-gray-500">{selectedType.description}</p>
      )}
    </div>
  )
}
