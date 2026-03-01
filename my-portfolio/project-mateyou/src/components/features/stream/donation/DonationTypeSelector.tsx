/**
 * DonationTypeSelector - 도네이션 타입 선택 컴포넌트
 */

import { Dices, Gift, Target, Video } from 'lucide-react'
import type { DonationType, RoomType } from './types'
import { DONATION_TYPE_CONFIGS, getAvailableDonationTypes } from './types'

interface DonationTypeSelectorProps {
  selectedType: DonationType
  onSelect: (type: DonationType) => void
  roomType: RoomType
  /** 룰렛 활성화 여부 (활성화된 경우에만 룰렛 타입 표시) */
  isRouletteEnabled?: boolean
}

const ICON_MAP: Record<DonationType, typeof Gift> = {
  basic: Gift,
  mission: Target,
  video: Video,
  roulette: Dices,
}

export function DonationTypeSelector({
  selectedType,
  onSelect,
  roomType,
  isRouletteEnabled = false,
}: DonationTypeSelectorProps) {
  // 룰렛은 활성화된 경우에만 표시
  const availableTypes = getAvailableDonationTypes(roomType).filter(
    (type) => type !== 'roulette' || isRouletteEnabled
  )

  return (
    <div className="flex gap-2">
      {availableTypes.map((type) => {
        const config = DONATION_TYPE_CONFIGS[type]
        const Icon = ICON_MAP[type]
        const isSelected = selectedType === type

        return (
          <button
            key={type}
            type="button"
            onClick={() => onSelect(type)}
            className={`
              flex-1 flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all
              ${
                isSelected
                  ? 'border-amber-500 bg-amber-50 shadow-md'
                  : 'border-gray-200 hover:border-amber-300 bg-white'
              }
            `}
          >
            <div
              className={`
                w-10 h-10 rounded-full flex items-center justify-center
                ${
                  isSelected
                    ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white'
                    : 'bg-gray-100 text-gray-500'
                }
              `}
            >
              <Icon className="w-5 h-5" />
            </div>
            <div className="text-center">
              <p
                className={`text-sm font-medium ${isSelected ? 'text-amber-700' : 'text-gray-700'}`}
              >
                {config.icon} {config.label}
              </p>
              <p className="text-[10px] text-gray-500">
                {config.minAmount.toLocaleString()}P~
              </p>
            </div>
          </button>
        )
      })}
    </div>
  )
}

