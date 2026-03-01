/**
 * BlankItemToggle - 꽝 아이템 지정 토글
 * 
 * 아이템을 "꽝"으로 지정하는 독립적인 체크박스 컴포넌트
 */

import { cn } from '@/lib/utils'
import { Ban } from 'lucide-react'

interface BlankItemToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}

export function BlankItemToggle({
  checked,
  onChange,
  disabled = false,
  className,
}: BlankItemToggleProps) {
  return (
    <div className={cn("p-4 rounded-xl border transition-colors", 
      checked 
        ? "bg-gray-100 border-gray-300" 
        : "bg-white border-gray-200",
      className
    )}>
      <label className={cn(
        "flex items-center gap-3",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      )}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="w-5 h-5 rounded border-gray-300 text-gray-600 focus:ring-gray-500 disabled:opacity-50"
        />
        <div className="flex items-center gap-2 flex-1">
          <Ban className={cn("w-5 h-5", checked ? "text-gray-700" : "text-gray-400")} />
          <div>
            <span className={cn(
              "text-sm font-medium",
              checked ? "text-gray-800" : "text-gray-700"
            )}>
              꽝으로 지정
            </span>
            <p className="text-xs text-gray-500">
              당첨 시 아무것도 지급하지 않습니다
            </p>
          </div>
        </div>
        {checked && (
          <span className="px-2 py-1 text-xs font-medium bg-gray-200 text-gray-600 rounded">
            꽝
          </span>
        )}
      </label>
    </div>
  )
}
