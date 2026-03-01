/**
 * RouletteWheelCard - 룰렛판 카드 컴포넌트
 * 
 * 룰렛판 정보 표시 및 펼침/접힘 기능
 */

import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronUp, Coins, Plus, Settings2, Trash2 } from 'lucide-react'
import { RouletteProbabilityPreview } from '../RouletteProbabilityPreview'
import type { RouletteItem, RouletteWheel } from '../types'
import { RouletteItemCard } from './RouletteItemCard'

interface RouletteWheelCardProps {
  wheel: RouletteWheel
  isExpanded: boolean
  onToggleExpand: () => void
  onEdit: () => void
  onDelete: () => void
  onAddItem: () => void
  onEditItem: (item: RouletteItem) => void
  onDeleteItem: (itemId: string) => void
  onToggleActive?: (isActive: boolean) => void
  isUpdating?: boolean
}

export function RouletteWheelCard({
  wheel,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onAddItem,
  onEditItem,
  onDeleteItem,
  onToggleActive,
  isUpdating = false,
}: RouletteWheelCardProps) {
  const items = wheel.items || []
  const totalWeight = items.reduce(
    (sum, item) => sum + (item.is_active ? item.weight : 0),
    0
  )

  return (
    <div
      className={cn(
        'rounded-xl border bg-white transition-all',
        !wheel.is_active && 'border-dashed border-gray-300'
      )}
    >
      {/* 휠 헤더 */}
      <WheelHeader
        wheel={wheel}
        itemCount={items.length}
        isExpanded={isExpanded}
        onToggle={onToggleExpand}
        onEdit={onEdit}
        onDelete={onDelete}
        onToggleActive={onToggleActive}
      />

      {/* 펼쳐진 내용 - 아이템 목록 */}
      {isExpanded && (
        <div className="border-t px-4 pb-4 pt-3">
          {/* 확률 미리보기 */}
          {items.length > 0 && (
            <div className="mb-4">
              <RouletteProbabilityPreview items={items} />
            </div>
          )}

          {/* 아이템 추가 버튼 */}
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600">아이템</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={onAddItem}
              disabled={isUpdating}
            >
              <Plus className="mr-1 h-3 w-3" />
              추가
            </Button>
          </div>

          {/* 아이템 목록 */}
          {items.length === 0 ? (
            <EmptyItemsPlaceholder />
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <RouletteItemCard
                  key={item.id}
                  item={item}
                  totalWeight={totalWeight}
                  onEdit={() => onEditItem(item)}
                  onDelete={() => onDeleteItem(item.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ============================================================
// 서브 컴포넌트
// ============================================================

interface WheelHeaderProps {
  wheel: RouletteWheel
  itemCount: number
  isExpanded: boolean
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onToggleActive?: (isActive: boolean) => void
}

function WheelHeader({
  wheel,
  itemCount,
  isExpanded,
  onToggle,
  onEdit,
  onDelete,
  onToggleActive,
}: WheelHeaderProps) {
  return (
    <div
      className="cursor-pointer p-4"
      onClick={onToggle}
    >
      {/* 상단: 정보 + 펼침 아이콘 */}
      <div className="flex items-start gap-3">
        {/* 금액 뱃지 */}
        <div className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white shadow-sm",
          wheel.is_active 
            ? "bg-gradient-to-br from-pink-500 to-orange-400" 
            : "bg-gray-300"
        )}>
          <Coins className="h-4 w-4" />
        </div>

        {/* 정보 */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-semibold text-gray-800">
              {wheel.name}
            </p>
            {!wheel.is_active && (
              <span className="text-[10px] font-medium text-orange-500 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-200">
                준비중
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <p className={cn(
              "text-sm font-medium",
              wheel.is_active ? "text-pink-500" : "text-gray-400"
            )}>
              {wheel.price.toLocaleString()}P
            </p>
            <span className="text-gray-300">·</span>
            <p className="text-xs text-gray-500">아이템 {itemCount}개</p>
          </div>
        </div>

        {/* 펼침 아이콘 */}
        <div className="shrink-0">
          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-gray-400" />
          )}
        </div>
      </div>

      {/* 하단: 액션 버튼들 */}
      <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-gray-100">
        {/* ON/OFF 토글 */}
        {onToggleActive && (
          <div className="flex items-center gap-2 mr-auto">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onToggleActive(!wheel.is_active)
              }}
              className={cn(
                "relative w-11 h-6 rounded-full transition-colors",
                wheel.is_active ? "bg-green-500" : "bg-gray-300"
              )}
              title={wheel.is_active ? "비활성화" : "활성화"}
            >
              <span className={cn(
                "absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform",
                wheel.is_active ? "left-[22px]" : "left-0.5"
              )} />
            </button>
            <span className={cn(
              "text-xs font-medium",
              wheel.is_active ? "text-green-600" : "text-gray-400"
            )}>
              {wheel.is_active ? "활성" : "비활성"}
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onEdit()
          }}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200"
        >
          <Settings2 className="h-3.5 w-3.5" />
          설정
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-red-500 bg-red-50 hover:bg-red-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
          삭제
        </button>
      </div>
    </div>
  )
}

function EmptyItemsPlaceholder() {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 p-4 text-center text-sm text-gray-400">
      아이템을 추가해주세요
    </div>
  )
}
