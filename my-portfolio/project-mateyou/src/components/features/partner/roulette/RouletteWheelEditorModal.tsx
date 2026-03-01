/**
 * RouletteWheelEditorModal - 룰렛판 추가/수정 모달
 */

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils'
import type { RouletteWheel } from '@/components/features/stream/roulette/types'

interface RouletteWheelEditorModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  wheel?: RouletteWheel | null
  onSave: (data: { name: string; price: number; description?: string }) => Promise<void>
  isLoading?: boolean
}

// 추천 금액
const SUGGESTED_PRICES = [1000, 3000, 5000, 10000, 30000, 50000]

export function RouletteWheelEditorModal({
  open,
  onOpenChange,
  wheel,
  onSave,
  isLoading = false,
}: RouletteWheelEditorModalProps) {
  const isEditMode = !!wheel

  const [name, setName] = useState('')
  const [price, setPrice] = useState(1000)
  const [description, setDescription] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // 수정 모드일 때 초기값 설정
  useEffect(() => {
    if (wheel) {
      setName(wheel.name)
      setPrice(wheel.price)
      setDescription(wheel.description || '')
    } else {
      setName('')
      setPrice(1000)
      setDescription('')
    }
  }, [wheel, open])

  const isValid = name.trim() !== '' && price >= 1000

  const handleSave = async () => {
    if (!isValid) return

    setIsSaving(true)
    try {
      await onSave({
        name: name.trim(),
        price,
        description: description.trim() || undefined,
      })
      onOpenChange(false)
    } catch (error) {
      console.error('룰렛판 저장 실패:', error)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title={isEditMode ? '룰렛판 수정' : '새 룰렛판 추가'}
    >
      <div className="space-y-4">
        {/* 이름 */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            룰렛판 이름 <span className="text-red-500">*</span>
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 1000P 럭키 룰렛"
            maxLength={30}
          />
        </div>

        {/* 금액 */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            고정 금액 (P) <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <Input
              type="number"
              value={price || ''}
              onChange={(e) => {
                const val = e.target.value
                setPrice(val === '' ? 0 : parseInt(val, 10))
              }}
              min={1000}
              step={1000}
              placeholder="1000"
              className={cn(
                price > 0 && price < 1000 && 'border-red-400 focus:border-red-500'
              )}
            />
            {price > 0 && price < 1000 && (
              <p className="mt-1 text-xs font-medium text-red-500">
                ⚠️ 최소 1,000P 이상이어야 합니다
              </p>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            시청자가 이 룰렛을 돌리려면 정확히 이 금액을 후원해야 합니다
          </p>
          
          {/* 추천 금액 버튼 */}
          <div className="mt-2 flex flex-wrap gap-2">
            {SUGGESTED_PRICES.map((amount) => (
              <button
                key={amount}
                type="button"
                onClick={() => setPrice(amount)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-all',
                  price === amount
                    ? 'bg-gradient-to-r from-pink-500 to-orange-500 text-white shadow-md'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                {amount.toLocaleString()}P
              </button>
            ))}
          </div>
        </div>

        {/* 설명 */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            설명 (선택)
          </label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="예: 특별 선물이 가득한 럭키 룰렛!"
            maxLength={100}
          />
        </div>

        {/* 버튼 */}
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            취소
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || isLoading || !isValid}
          >
            {isSaving ? '저장 중...' : isEditMode ? '저장' : '추가'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
