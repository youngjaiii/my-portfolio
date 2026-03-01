import { Modal, PartnerApplicationForm } from '@/components'

interface GameInfo {
  game: string
  tier: string
  description: string
}

interface PartnerApplicationModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
  onShowToast?: (message: string, type: 'success' | 'error') => void
  // 기존 데이터로 초기화하기 위한 props
  initialData?: {
    partnerName?: string
    partnerMessage?: string
    profileImage?: string
    favoriteGame?: string
    gameInfos?: Array<GameInfo>
  }
  // 모드 설정 (신청/수정)
  mode?: 'create' | 'edit'
}

export function PartnerApplicationModal({
  isOpen,
  onClose,
  onSuccess,
  onShowToast,
  initialData,
  mode = 'create',
}: PartnerApplicationModalProps) {
  const handleSuccess = () => {
    if (onSuccess) {
      onSuccess()
    }
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={mode === 'edit' ? '파트너 신청 수정' : '파트너 신청하기'}
      size="lg"
    >
      <PartnerApplicationForm
        initialData={initialData}
        mode={mode}
        onSuccess={handleSuccess}
        onShowToast={onShowToast}
        onCancel={onClose}
      />
    </Modal>
  )
}
