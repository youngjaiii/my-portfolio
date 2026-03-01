/**
 * RouletteSettingsSheet - 파트너 룰렛 설정 시트
 * 
 * 구조:
 * - 룰렛 활성화 토글
 * - 룰렛판 목록 (각 판은 고정 금액 + 아이템들)
 * - 룰렛판 추가/수정/삭제
 * - 각 판 내부의 아이템 관리
 */

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { SlideSheet } from '@/components/ui/SlideSheet'
import { usePartnerRouletteSettings } from '@/hooks/usePartnerRouletteSettings'
import { useRouletteWheels } from '@/hooks/useRouletteWheels'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronUp, Coins, Loader2, Plus, Settings2, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { RouletteItemEditor } from './RouletteItemEditor'
import { RouletteProbabilityPreview } from './RouletteProbabilityPreview'
import type { CreateRouletteItemInput, RouletteItem, RouletteWheel } from './types'

interface RouletteSettingsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  partnerId: string
}

export function RouletteSettingsSheet({
  open,
  onOpenChange,
  partnerId,
}: RouletteSettingsSheetProps) {
  const {
    settings,
    isLoading: isLoadingSettings,
    updateSettings,
    isUpdating,
  } = usePartnerRouletteSettings({ partnerId, enabled: open })

  const {
    wheels,
    isLoading: isLoadingWheels,
    addWheel,
    updateWheel,
    deleteWheel,
    addItem,
    updateItem,
    deleteItem,
    isUpdating: isUpdatingWheels,
  } = useRouletteWheels({ partnerId, wheelType: 'stream', enabled: open })

  // 펼쳐진 룰렛판 ID
  const [expandedWheelId, setExpandedWheelId] = useState<string | null>(null)

  // 룰렛판 추가/수정 모달
  const [isAddingWheel, setIsAddingWheel] = useState(false)
  const [editingWheel, setEditingWheel] = useState<RouletteWheel | null>(null)
  const [wheelForm, setWheelForm] = useState({ name: '', price: 1000, description: '' })

  // 아이템 추가/수정 모달
  const [addingItemWheelId, setAddingItemWheelId] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<RouletteItem | null>(null)
  const [editingItemWheel, setEditingItemWheel] = useState<RouletteWheel | null>(null)

  // 활성화 토글
  const handleToggleEnabled = async () => {
    // 최소 1개 룰렛판 필요 (아이템 포함)
    const validWheels = wheels.filter((w) => w.is_active && (w.items?.length ?? 0) > 0)
    if (!settings?.is_enabled && validWheels.length === 0) {
      alert('룰렛을 활성화하려면 아이템이 있는 룰렛판이 최소 1개 필요합니다.')
      return
    }
    await updateSettings({ is_enabled: !settings?.is_enabled })
  }

  // 룰렛판 추가 모달 열기
  const openAddWheelModal = () => {
    setWheelForm({ name: '', price: 1000, description: '' })
    setIsAddingWheel(true)
  }

  // 룰렛판 수정 모달 열기
  const openEditWheelModal = (wheel: RouletteWheel) => {
    setWheelForm({
      name: wheel.name,
      price: wheel.price,
      description: wheel.description || '',
    })
    setEditingWheel(wheel)
  }

  // 룰렛판 저장
  const handleSaveWheel = async () => {
    if (!wheelForm.name.trim()) {
      alert('룰렛판 이름을 입력해주세요.')
      return
    }
    if (wheelForm.price < 1000) {
      alert('최소 금액은 1,000P 이상이어야 합니다.')
      return
    }

    if (editingWheel) {
      await updateWheel(editingWheel.id, {
        name: wheelForm.name.trim(),
        price: wheelForm.price,
        description: wheelForm.description.trim() || undefined,
      })
      setEditingWheel(null)
    } else {
      const newWheelId = await addWheel({
        name: wheelForm.name.trim(),
        price: wheelForm.price,
        description: wheelForm.description.trim() || undefined,
      })
      setExpandedWheelId(newWheelId) // 새 룰렛판 펼치기
      setIsAddingWheel(false)
    }
  }

  // 룰렛판 삭제
  const handleDeleteWheel = async (wheelId: string) => {
    if (confirm('이 룰렛판과 모든 아이템을 삭제하시겠습니까?')) {
      await deleteWheel(wheelId)
      if (expandedWheelId === wheelId) {
        setExpandedWheelId(null)
      }
    }
  }

  // 아이템 추가
  const handleAddItem = async (item: CreateRouletteItemInput) => {
    await addItem(item)
    setAddingItemWheelId(null)
  }

  // 아이템 수정
  const handleUpdateItem = async (id: string, data: CreateRouletteItemInput) => {
    // wheel_id는 수정 시 필요 없으므로 제외
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

  const isLoading = isLoadingSettings || isLoadingWheels

  return (
    <>
      <SlideSheet
        isOpen={open}
        onClose={() => onOpenChange(false)}
        title="🎰 룰렛 설정"
        initialHeight={0.9}
        minHeight={0.5}
        maxHeight={0.95}
      >
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="space-y-5 pb-6">
            {/* 활성화 토글 */}
            <div className="flex items-center justify-between rounded-xl border p-4">
              <div>
                <p className="font-semibold text-gray-800">룰렛 활성화</p>
                <p className="text-sm text-gray-500">
                  활성화하면 후원 타입에 "룰렛"이 추가됩니다
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggleEnabled}
                disabled={isUpdating}
                className={cn(
                  'relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
                  settings?.is_enabled ? 'bg-green-500' : 'bg-gray-200',
                  isUpdating && 'opacity-50'
                )}
              >
                <span
                  className={cn(
                    'pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out',
                    settings?.is_enabled ? 'translate-x-5' : 'translate-x-0'
                  )}
                />
              </button>
            </div>

            {/* 룰렛판 목록 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-base font-semibold text-gray-800">
                  룰렛판 목록
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={openAddWheelModal}
                  disabled={isUpdatingWheels}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  룰렛판 추가
                </Button>
              </div>

              <p className="text-sm text-gray-500">
                각 룰렛판은 고정 금액으로 후원 시 사용됩니다. 시청자가 룰렛판을 선택해 후원합니다.
              </p>

              {wheels.length === 0 ? (
                <div className="rounded-xl border-2 border-dashed border-gray-300 p-8 text-center text-gray-500">
                  룰렛판이 없습니다
                  <br />
                  <button
                    type="button"
                    className="mt-2 text-sm font-medium text-pink-500 hover:text-pink-600"
                    onClick={openAddWheelModal}
                  >
                    첫 번째 룰렛판 만들기
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {wheels.map((wheel) => {
                    const isExpanded = expandedWheelId === wheel.id
                    const items = wheel.items || []
                    const totalWeight = items.reduce((sum, item) => sum + (item.is_active ? item.weight : 0), 0)

                    return (
                      <div
                        key={wheel.id}
                        className={cn(
                          'rounded-xl border bg-white transition-all',
                          !wheel.is_active && 'opacity-50'
                        )}
                      >
                        {/* 룰렛판 헤더 */}
                        <div
                          className="flex cursor-pointer items-center gap-3 p-4"
                          onClick={() => setExpandedWheelId(isExpanded ? null : wheel.id)}
                        >
                          {/* 금액 뱃지 */}
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-pink-500 to-orange-400 text-white shadow-md">
                            <Coins className="h-5 w-5" />
                          </div>

                          {/* 정보 */}
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-gray-800">{wheel.name}</p>
                            <p className="text-sm font-medium text-pink-500">
                              {wheel.price.toLocaleString()}P
                            </p>
                            <p className="text-xs text-gray-500">
                              아이템 {items.length}개
                            </p>
                          </div>

                          {/* 액션 버튼 */}
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                openEditWheelModal(wheel)
                              }}
                              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                            >
                              <Settings2 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeleteWheel(wheel.id)
                              }}
                              className="rounded-lg p-2 text-red-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                            {isExpanded ? (
                              <ChevronUp className="h-5 w-5 text-gray-400" />
                            ) : (
                              <ChevronDown className="h-5 w-5 text-gray-400" />
                            )}
                          </div>
                        </div>

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
                                onClick={() => setAddingItemWheelId(wheel.id)}
                                disabled={isUpdatingWheels}
                              >
                                <Plus className="mr-1 h-3 w-3" />
                                추가
                              </Button>
                            </div>

                            {/* 아이템 목록 */}
                            {items.length === 0 ? (
                              <div className="rounded-lg border border-dashed border-gray-200 p-4 text-center text-sm text-gray-400">
                                아이템을 추가해주세요
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {items.map((item) => (
                                  <div
                                    key={item.id}
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
                                      <p className="truncate text-sm font-medium text-gray-700">
                                        {item.name}
                                      </p>
                                      <p className="text-xs text-gray-500">
                                        가중치 {item.weight} ({totalWeight > 0 ? Math.round((item.weight / totalWeight) * 100) : 0}%)
                                      </p>
                                    </div>

                                    {/* 액션 */}
                                    <div className="flex shrink-0 gap-1">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditingItem(item)
                                          setEditingItemWheel(wheel)
                                        }}
                                        className="rounded p-1 text-gray-400 hover:bg-white hover:text-gray-600"
                                      >
                                        <Settings2 className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteItem(item.id)}
                                        className="rounded p-1 text-red-300 hover:bg-red-50 hover:text-red-500"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </SlideSheet>

      {/* 룰렛판 추가/수정 모달 */}
      <Modal
        isOpen={isAddingWheel || !!editingWheel}
        onClose={() => {
          setIsAddingWheel(false)
          setEditingWheel(null)
        }}
        title={editingWheel ? '룰렛판 수정' : '새 룰렛판 추가'}
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              룰렛판 이름 <span className="text-red-500">*</span>
            </label>
            <Input
              value={wheelForm.name}
              onChange={(e) => setWheelForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="예: 1000P 럭키 룰렛"
              maxLength={30}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              고정 금액 (P) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Input
                type="number"
                value={wheelForm.price || ''}
                onChange={(e) => {
                  const val = e.target.value
                  setWheelForm((f) => ({ ...f, price: val === '' ? 0 : parseInt(val, 10) }))
                }}
                min={1000}
                step={1000}
                placeholder="1000"
                className={cn(
                  wheelForm.price > 0 && wheelForm.price < 1000 && 'border-red-400 focus:border-red-500 focus:ring-red-500'
                )}
              />
              {wheelForm.price > 0 && wheelForm.price < 1000 && (
                <p className="mt-1 text-xs font-medium text-red-500">
                  ⚠️ 최소 1,000P 이상이어야 합니다
                </p>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              이 룰렛을 돌리려면 시청자가 정확히 이 금액을 후원해야 합니다.
            </p>
            {/* 추천 금액 버튼 */}
            <div className="mt-2 flex flex-wrap gap-2">
              {[1000, 3000, 5000, 10000, 30000, 50000].map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setWheelForm((f) => ({ ...f, price: amount }))}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-all',
                    wheelForm.price === amount
                      ? 'bg-gradient-to-r from-pink-500 to-orange-500 text-white shadow-md'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}
                >
                  {amount.toLocaleString()}P
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              설명 (선택)
            </label>
            <Input
              value={wheelForm.description}
              onChange={(e) => setWheelForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="예: 특별 선물이 가득한 럭키 룰렛!"
              maxLength={100}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => {
                setIsAddingWheel(false)
                setEditingWheel(null)
              }}
            >
              취소
            </Button>
            <Button 
              onClick={handleSaveWheel} 
              disabled={isUpdatingWheels || !wheelForm.name.trim() || wheelForm.price < 1000}
            >
              {editingWheel ? '저장' : '추가'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 아이템 추가 모달 */}
      {addingItemWheelId && (
        <RouletteItemEditor
          open={!!addingItemWheelId}
          onOpenChange={(open) => !open && setAddingItemWheelId(null)}
          wheelId={addingItemWheelId}
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
          item={editingItem}
          onSave={(data) => handleUpdateItem(editingItem.id, data)}
          existingItems={(editingItemWheel.items || []).filter((i) => i.id !== editingItem.id)}
        />
      )}
    </>
  )
}
