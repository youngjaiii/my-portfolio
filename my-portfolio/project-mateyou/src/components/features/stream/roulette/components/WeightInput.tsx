/**
 * WeightInput - 가중치 입력 컴포넌트
 * 
 * 룰렛 아이템의 당첨 확률 가중치를 입력
 */

import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'

interface WeightInputProps {
  value: number
  onChange: (weight: number) => void
  min?: number
  label?: string
  showValue?: boolean
  className?: string
}

export function WeightInput({
  value,
  onChange,
  min = 1,
  label = '가중치 (당첨 확률)',
  showValue = true,
  className,
}: WeightInputProps) {
  const isInvalid = value < min

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">
          {label}
        </label>
        {showValue && value > 0 && (
          <span className="text-sm font-semibold text-gray-800">
            {value}
          </span>
        )}
      </div>
      <Input
        type="number"
        value={value || ''}
        onChange={(e) => {
          const val = e.target.value
          onChange(val === '' ? 0 : parseInt(val, 10))
        }}
        min={min}
        placeholder={String(min)}
        inputSize="md"
        className={cn(isInvalid && 'border-red-400 focus:border-red-500')}
      />
      {isInvalid && (
        <p className="text-xs font-medium text-red-500">
          ⚠️ 가중치는 {min} 이상이어야 합니다
        </p>
      )}
      <p className="text-xs text-gray-500">
        상대적 가중치입니다. 예: 가중치 2는 1보다 2배 높은 확률
      </p>
    </div>
  )
}
