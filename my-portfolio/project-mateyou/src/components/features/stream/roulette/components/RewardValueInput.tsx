/**
 * RewardValueInput - 보상 값 입력 컴포넌트
 * 
 * 보상 타입에 따라 적절한 입력 필드 렌더링
 * - text: 텍스트 입력
 * - usable: 보상 이름 입력
 * - digital: 파일 업로드
 */

import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { DigitalFileUploader } from './DigitalFileUploader'
import type { RouletteRewardType } from '../types'

interface UploadedFileInfo {
  url: string
  path: string
  fileName: string
  fileSize: number
  fileType: string
}

interface RewardValueInputProps {
  rewardType: RouletteRewardType
  rewardValue: string
  onRewardValueChange: (value: string) => void
  // 디지털 타입 전용 props
  digitalFile?: File | null
  digitalPreview?: string | null
  uploadedFileInfo?: UploadedFileInfo | null
  isUploading?: boolean
  uploadProgress?: number
  uploadError?: string | null
  onFileSelect?: (file: File) => void
  onFileRemove?: () => void
}

export function RewardValueInput({
  rewardType,
  rewardValue,
  onRewardValueChange,
  digitalFile = null,
  digitalPreview = null,
  uploadedFileInfo = null,
  isUploading = false,
  uploadProgress = 0,
  uploadError = null,
  onFileSelect,
  onFileRemove,
}: RewardValueInputProps) {
  switch (rewardType) {
    case 'text':
      return <TextRewardInput value={rewardValue} onChange={onRewardValueChange} />
    
    case 'usable':
      return <UsableRewardInput value={rewardValue} onChange={onRewardValueChange} />
    
    case 'digital':
      return (
        <DigitalFileUploader
          file={digitalFile}
          preview={digitalPreview}
          uploadedInfo={uploadedFileInfo}
          isUploading={isUploading}
          progress={uploadProgress}
          error={uploadError}
          onFileSelect={onFileSelect || (() => {})}
          onRemove={onFileRemove || (() => {})}
        />
      )
    
    default:
      return null
  }
}

// ============================================================
// 타입별 입력 컴포넌트
// ============================================================

interface TextRewardInputProps {
  value: string
  onChange: (value: string) => void
}

function TextRewardInput({ value, onChange }: TextRewardInputProps) {
  return (
    <div className="space-y-2">
      <Textarea
        label="보상 설명 (선택)"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="예: 축하합니다! 다음 방송에서 닉네임 불러드릴게요"
        rows={2}
        maxLength={100}
      />
      <p className="text-xs text-gray-500">
        당첨 시 표시할 추가 메시지나 설명을 입력하세요.
      </p>
    </div>
  )
}

interface UsableRewardInputProps {
  value: string
  onChange: (value: string) => void
}

function UsableRewardInput({ value, onChange }: UsableRewardInputProps) {
  return (
    <div className="space-y-3">
      <Input
        label="보상 이름 *"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="예: 1:1 전화 10분, 채팅 쿠폰, 포토카드 1장"
      />
      <p className="text-xs text-gray-500">
        시청자가 사용 요청을 보내면 파트너가 승인/거절할 수 있습니다.
      </p>
    </div>
  )
}
