/**
 * RouletteItemCard - 룰렛 아이템 카드 컴포넌트
 * 
 * 아이템 정보 표시 (색상, 이름, 가중치, 확률)
 */

import { Settings2, Trash2, Package, Ban, Repeat } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RouletteItem } from '../types'

interface RouletteItemCardProps {
  item: RouletteItem
  totalWeight: number
  onEdit: () => void
  onDelete: () => void
  showActions?: boolean
}

export function RouletteItemCard({
  item,
  totalWeight,
  onEdit,
  onDelete,
  showActions = true,
}: RouletteItemCardProps) {
  const probability = totalWeight > 0 ? Math.round((item.weight / totalWeight) * 100) : 0
  
  // 수량 제한 표시용 플래그
  const hasStockLimit = item.global_stock_limit != null || item.per_user_limit != null
  const isBlank = item.is_blank ?? false
  const preventDuplicate = item.prevent_duplicate ?? false

  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border bg-gray-50 p-2 transition-colors',
        !item.is_active && 'opacity-50'
      )}
    >
      {/* 색상 */}
      <div
        className="h-8 w-8 shrink-0 rounded-md shadow-sm"
        style={{ backgroundColor: item.color }}
      />

      {/* 정보 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <p className="truncate text-sm font-medium text-gray-700">
            {item.name}
          </p>
          {/* 특수 플래그 아이콘 */}
          <SpecialFlags
            isBlank={isBlank}
            hasStockLimit={hasStockLimit}
            preventDuplicate={preventDuplicate}
          />
        </div>
        <p className="text-xs text-gray-500">
          가중치 {item.weight} ({probability}%)
        </p>
      </div>

      {/* 액션 버튼 */}
      {showActions && (
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="rounded p-1 text-gray-400 hover:bg-white hover:text-gray-600"
            title="수정"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded p-1 text-red-300 hover:bg-red-50 hover:text-red-500"
            title="삭제"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

// ============================================================
// 서브 컴포넌트
// ============================================================

interface SpecialFlagsProps {
  isBlank: boolean
  hasStockLimit: boolean
  preventDuplicate: boolean
}

function SpecialFlags({ isBlank, hasStockLimit, preventDuplicate }: SpecialFlagsProps) {
  if (!isBlank && !hasStockLimit && !preventDuplicate) {
    return null
  }

  return (
    <div className="flex items-center gap-0.5">
      {isBlank && (
        <span title="꽝">
          <Ban className="h-3 w-3 text-gray-400" />
        </span>
      )}
      {hasStockLimit && (
        <span title="수량 제한">
          <Package className="h-3 w-3 text-purple-400" />
        </span>
      )}
      {preventDuplicate && (
        <span title="중복 방지">
          <Repeat className="h-3 w-3 text-blue-400" />
        </span>
      )}
    </div>
  )
}
