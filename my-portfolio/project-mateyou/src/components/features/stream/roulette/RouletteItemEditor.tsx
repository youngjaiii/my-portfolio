/**
 * RouletteItemEditor - 룰렛 아이템 추가/수정 모달
 * 
 * 리팩토링됨:
 * - 컴포넌트 분리 (ColorPalettePicker, WeightInput, RewardTypeSelector 등)
 * - 훅으로 상태 관리 분리 (useRouletteItemForm)
 * - 디지털 상품 다중 파일 및 지급 방식 지원
 */

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Textarea } from '@/components/ui/Textarea'
import {
    BlankItemToggle,
    ColorPalettePicker,
    DigitalDistributionSettings,
    MultiDigitalFileUploader,
    RewardTypeSelector,
    RewardValueInput,
    StockLimitSettings,
    WeightInput,
} from './components'
import { useRouletteItemForm } from './hooks/useRouletteItemForm'
import type { CreateRouletteItemInput, RouletteItem } from './types'

interface RouletteItemEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 소속 룰렛판 ID (필수) */
  wheelId: string
  /** 파트너 ID (디지털 보상 업로드에 필요) */
  partnerId?: string
  /** 수정할 아이템 (없으면 추가 모드) */
  item?: RouletteItem
  /** 저장 콜백 */
  onSave: (data: CreateRouletteItemInput) => void | Promise<void>
  /** 기존 아이템 목록 */
  existingItems?: RouletteItem[]
}

export function RouletteItemEditor({
  open,
  onOpenChange,
  wheelId,
  partnerId,
  item,
  onSave,
  existingItems = [],
}: RouletteItemEditorProps) {
  const form = useRouletteItemForm({
    item,
    existingItemsCount: existingItems.length,
    wheelId,
    partnerId,
  })

  // 저장 핸들러
  const handleSave = async () => {
    if (!form.isValid) {
      if (form.isDigitalType && form.totalFileCount === 0) {
        alert('디지털 파일을 최소 1개 이상 업로드해주세요')
      } else {
        alert('아이템 이름을 입력해주세요')
      }
      return
    }

    form.setIsSaving(true)
    try {
      const saveData = await form.buildSaveData()
      if (!saveData) {
        throw new Error('저장 데이터 생성에 실패했습니다')
      }
      
      console.log('🎰 [RouletteItemEditor] 저장 데이터:', saveData)
      await onSave(saveData)
      onOpenChange(false)
    } catch (error: any) {
      console.error('🎰 [RouletteItemEditor] 아이템 저장 실패:', error)
      const errorMessage = error?.message || '저장에 실패했습니다'
      alert(`저장에 실패했습니다: ${errorMessage}`)
    } finally {
      form.setIsSaving(false)
    }
  }

  return (
    <Modal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title={form.isEditMode ? '아이템 수정' : '아이템 추가'}
      size="md"
    >
      <div className="space-y-4 max-h-[70vh] overflow-y-auto">
        {/* 이름 */}
        <Input
          label="이름 *"
          placeholder="예: 꽝, +1000P, 축하합니다!"
          value={form.name}
          onChange={(e) => form.setName(e.target.value)}
          maxLength={30}
        />

        {/* 설명 */}
        <Textarea
          label="설명 (선택)"
          placeholder="아이템에 대한 설명"
          value={form.description}
          onChange={(e) => form.setDescription(e.target.value)}
          rows={2}
          maxLength={100}
        />

        {/* 색상 선택 */}
        <ColorPalettePicker
          value={form.color}
          onChange={form.setColor}
        />

        {/* 가중치 입력 */}
        <WeightInput
          value={form.weight}
          onChange={form.setWeight}
        />

        {/* 보상 타입 선택 */}
        <RewardTypeSelector
          value={form.rewardType}
          onChange={form.setRewardType}
        />

        {/* 꽝 지정 (비디지털 타입만) */}
        {!form.isDigitalType && (
          <BlankItemToggle
            checked={form.stockLimits.isBlank}
            onChange={(checked) => form.setStockLimits({ ...form.stockLimits, isBlank: checked })}
          />
        )}

        {/* ★ 디지털 타입: 지급 방식 + 다중 파일 업로드 ★ */}
        {form.isDigitalType && (
          <>
            {/* 지급 방식 설정 */}
            <DigitalDistributionSettings
              value={form.distributionType}
              onChange={form.setDistributionType}
              fileCount={form.totalFileCount}
            />

            {/* 다중 파일 업로드 */}
            <MultiDigitalFileUploader
              uploadedFiles={form.uploadedFiles}
              localFiles={form.localFiles}
              onFilesSelect={form.onFilesSelect}
              onFileRemove={form.onFileRemove}
            />
          </>
        )}

        {/* ★ 비디지털 타입: 수량 제한 + 보상 값 ★ */}
        {!form.isDigitalType && (
          <>
            {/* 수량 제한 설정 */}
            <StockLimitSettings
              value={form.stockLimits}
              onChange={form.setStockLimits}
            />

            {/* 보상 값 입력 */}
            <RewardValueInput
              rewardType={form.rewardType}
              rewardValue={form.rewardValue}
              onRewardValueChange={form.setRewardValue}
            />
          </>
        )}

        {/* 버튼 */}
        <div className="flex gap-2 pt-2 sticky bottom-0 bg-white pb-2">
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            className="flex-1"
          >
            취소
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={form.isSaving || !form.isValid}
            className="flex-1"
          >
            {form.isSaving ? '저장 중...' : form.isEditMode ? '수정' : '추가'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
