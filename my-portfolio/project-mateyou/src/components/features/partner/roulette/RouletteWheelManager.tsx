/**
 * RouletteWheelManager - 룰렛판 관리 컴포넌트
 * 
 * 파트너 대시보드에서 사용하는 룰렛판 목록 및 관리
 * - 룰렛판 추가/수정/삭제
 * - 아이템 관리
 */

import { RouletteWheelCard } from '@/components/features/stream/roulette/components/RouletteWheelCard'
import { RouletteItemEditor } from '@/components/features/stream/roulette/RouletteItemEditor'
import type { CreateRouletteItemInput, RouletteItem, RouletteWheel } from '@/components/features/stream/roulette/types'
import { Button } from '@/components/ui/Button'
import { useRouletteWheels, type WheelType } from '@/hooks/useRouletteWheels'
import { Loader2, Plus } from 'lucide-react'
import { useState } from 'react'
import { RouletteWheelEditorModal } from './RouletteWheelEditorModal'

interface RouletteWheelManagerProps {
  partnerId: string
  /** 룰렛 용도: stream(방송용), profile(비방송용) */
  wheelType?: WheelType
  className?: string
}

export function RouletteWheelManager({ partnerId, wheelType = 'profile', className }: RouletteWheelManagerProps) {
  const {
    wheels,
    isLoading,
    addWheel,
    updateWheel,
    deleteWheel,
    addItem,
    updateItem,
    deleteItem,
    isUpdating,
  } = useRouletteWheels({ partnerId, wheelType, enabled: true })

  // 펼쳐진 휠 ID
  const [expandedWheelId, setExpandedWheelId] = useState<string | null>(null)

  // 휠 편집 모달 상태
  const [isAddingWheel, setIsAddingWheel] = useState(false)
  const [editingWheel, setEditingWheel] = useState<RouletteWheel | null>(null)

  // 아이템 편집 모달 상태
  const [addingItemWheelId, setAddingItemWheelId] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<RouletteItem | null>(null)
  const [editingItemWheel, setEditingItemWheel] = useState<RouletteWheel | null>(null)

  // 휠 저장
  const handleSaveWheel = async (data: { name: string; price: number; description?: string }) => {
    if (editingWheel) {
      await updateWheel(editingWheel.id, data)
      setEditingWheel(null)
    } else {
      const newWheelId = await addWheel(data)
      setExpandedWheelId(newWheelId)
      setIsAddingWheel(false)
    }
  }

  // 휠 삭제
  const handleDeleteWheel = async (wheelId: string) => {
    if (confirm('이 룰렛판과 모든 아이템을 삭제하시겠습니까?')) {
      await deleteWheel(wheelId)
      if (expandedWheelId === wheelId) {
        setExpandedWheelId(null)
      }
    }
  }

  // 휠 활성화/비활성화 토글
  const handleToggleActive = async (wheelId: string, isActive: boolean) => {
    await updateWheel(wheelId, { is_active: isActive })
  }

  // 아이템 추가
  const handleAddItem = async (data: CreateRouletteItemInput) => {
    await addItem(data)
    setAddingItemWheelId(null)
  }

  // 아이템 수정
  const handleUpdateItem = async (id: string, data: CreateRouletteItemInput) => {
    const { wheel_id, ...updateData } = data
    await updateItem(id, updateData)
    setEditingItem(null)
    setEditingItemWheel(null)
  }

  // 아이템 삭제
  const handleDeleteItem = async (id: string) => {
    if (confirm('이 아이템을 삭제하시겠습니까?')) {
      await deleteItem(id)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className={className}>
      {/* 헤더 */}
      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-gray-900">룰렛판 관리</h2>
          <p className="text-sm text-gray-500">
            각 룰렛판은 고정 금액으로 시청자가 후원 시 사용됩니다
          </p>
        </div>
        <Button
          size="sm"
          variant="primary"
          onClick={() => setIsAddingWheel(true)}
          disabled={isUpdating}
          className="w-full sm:w-auto shrink-0"
        >
          <Plus className="mr-1 h-4 w-4" />
          룰렛판 추가
        </Button>
      </div>

      {/* 룰렛판 목록 */}
      {wheels.length === 0 ? (
        <EmptyWheelState onAdd={() => setIsAddingWheel(true)} />
      ) : (
        <div className="space-y-3">
          {wheels.map((wheel) => (
            <RouletteWheelCard
              key={wheel.id}
              wheel={wheel}
              isExpanded={expandedWheelId === wheel.id}
              onToggleExpand={() => setExpandedWheelId(
                expandedWheelId === wheel.id ? null : wheel.id
              )}
              onEdit={() => setEditingWheel(wheel)}
              onDelete={() => handleDeleteWheel(wheel.id)}
              onAddItem={() => setAddingItemWheelId(wheel.id)}
              onEditItem={(item) => {
                setEditingItem(item)
                setEditingItemWheel(wheel)
              }}
              onDeleteItem={handleDeleteItem}
              onToggleActive={(isActive) => handleToggleActive(wheel.id, isActive)}
              isUpdating={isUpdating}
            />
          ))}
        </div>
      )}

      {/* 휠 추가/수정 모달 */}
      <RouletteWheelEditorModal
        open={isAddingWheel || !!editingWheel}
        onOpenChange={(open) => {
          if (!open) {
            setIsAddingWheel(false)
            setEditingWheel(null)
          }
        }}
        wheel={editingWheel}
        onSave={handleSaveWheel}
        isLoading={isUpdating}
      />

      {/* 아이템 추가 모달 */}
      {addingItemWheelId && (
        <RouletteItemEditor
          open={!!addingItemWheelId}
          onOpenChange={(open) => !open && setAddingItemWheelId(null)}
          wheelId={addingItemWheelId}
          partnerId={partnerId}
          onSave={handleAddItem}
          existingItems={wheels.find((w) => w.id === addingItemWheelId)?.items || []}
        />
      )}

      {/* 아이템 수정 모달 */}
      {editingItem && editingItemWheel && (
        <RouletteItemEditor
          open={!!editingItem}
          onOpenChange={(open) => {
            if (!open) {
              setEditingItem(null)
              setEditingItemWheel(null)
            }
          }}
          wheelId={editingItemWheel.id}
          partnerId={partnerId}
          item={editingItem}
          onSave={(data) => handleUpdateItem(editingItem.id, data)}
          existingItems={(editingItemWheel.items || []).filter((i) => i.id !== editingItem.id)}
        />
      )}
    </div>
  )
}

// ============================================================
// 서브 컴포넌트
// ============================================================

function EmptyWheelState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
      <div className="mx-auto mb-4 w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center">
        <span className="text-3xl">🎰</span>
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        룰렛판이 없습니다
      </h3>
      <p className="text-sm text-gray-500 mb-6">
        첫 번째 룰렛판을 만들어 시청자에게 특별한 경험을 제공하세요
      </p>
      <Button variant="primary" onClick={onAdd}>
        <Plus className="mr-1 h-4 w-4" />
        첫 번째 룰렛판 만들기
      </Button>
    </div>
  )
}
