/**
 * RouletteSettingsToggle - 룰렛 활성화 토글 컴포넌트
 */

import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RouletteSettingsToggleProps {
  isEnabled: boolean
  onToggle: () => void
  isUpdating?: boolean
  hasValidWheels?: boolean
}

export function RouletteSettingsToggle({
  isEnabled,
  onToggle,
  isUpdating = false,
  hasValidWheels = true,
}: RouletteSettingsToggleProps) {
  const handleClick = () => {
    if (!isEnabled && !hasValidWheels) {
      alert('룰렛을 활성화하려면 아이템이 있는 룰렛판이 최소 1개 필요합니다.')
      return
    }
    onToggle()
  }

  return (
    <div className="flex items-center justify-between rounded-xl border bg-white p-4 shadow-sm">
      <div>
        <p className="font-semibold text-gray-800">룰렛 활성화</p>
        <p className="text-sm text-gray-500">
          활성화하면 후원 타입에 "룰렛"이 추가됩니다
        </p>
      </div>
      <button
        type="button"
        onClick={handleClick}
        disabled={isUpdating}
        className={cn(
          'relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
          isEnabled ? 'bg-green-500' : 'bg-gray-200',
          isUpdating && 'opacity-50 cursor-not-allowed'
        )}
      >
        {isUpdating ? (
          <span className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin text-gray-600" />
          </span>
        ) : (
          <span
            className={cn(
              'pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out',
              isEnabled ? 'translate-x-5' : 'translate-x-0'
            )}
          />
        )}
      </button>
    </div>
  )
}
