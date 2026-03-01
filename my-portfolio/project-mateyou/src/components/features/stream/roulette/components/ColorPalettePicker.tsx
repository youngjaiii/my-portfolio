/**
 * ColorPalettePicker - 색상 팔레트 선택 컴포넌트
 * 
 * 룰렛 아이템 등에서 재사용 가능한 색상 선택기
 */

import { cn } from '@/lib/utils'
import { ROULETTE_COLORS } from '../types'

interface ColorPalettePickerProps {
  value: string
  onChange: (color: string) => void
  colors?: readonly string[]
  label?: string
  showCustomPicker?: boolean
  className?: string
}

export function ColorPalettePicker({
  value,
  onChange,
  colors = ROULETTE_COLORS,
  label = '색상',
  showCustomPicker = true,
  className,
}: ColorPalettePickerProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={cn(
              'h-9 w-9 rounded-lg border-2 transition-all',
              value === c
                ? 'scale-110 border-white ring-2 ring-pink-500'
                : 'border-transparent hover:scale-105'
            )}
            style={{ backgroundColor: c }}
            aria-label={`색상 ${c}`}
          />
        ))}
        {showCustomPicker && (
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 w-9 cursor-pointer rounded-lg border-0 p-0"
            title="커스텀 색상 선택"
          />
        )}
      </div>
    </div>
  )
}
