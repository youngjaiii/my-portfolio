import { useState } from 'react'
import { Button, Flex, Input, Modal, Textarea, Typography } from '@/components'

interface AddPointEntryModalProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (entry: {
    type: 'earn' | 'withdraw'
    amount: number
    description: string
  }) => Promise<void>
}

export function AddPointEntryModal({
  isOpen,
  onClose,
  onAdd,
}: AddPointEntryModalProps) {
  const [formData, setFormData] = useState({
    type: 'earn' as 'earn' | 'withdraw',
    amount: '',
    description: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<{
    amount?: string
    description?: string
  }>({})

  const validateForm = () => {
    const newErrors: typeof errors = {}

    if (!formData.amount.trim()) {
      newErrors.amount = '포인트를 입력해주세요'
    } else {
      const amount = parseInt(formData.amount)
      if (isNaN(amount) || amount <= 0) {
        newErrors.amount = '유효한 포인트를 입력해주세요'
      }
    }

    if (!formData.description.trim()) {
      newErrors.description = '설명을 입력해주세요'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    setIsSubmitting(true)
    try {
      await onAdd({
        type: formData.type,
        amount: parseInt(formData.amount),
        description: formData.description,
      })

      // 폼 초기화
      setFormData({
        type: 'earn',
        amount: '',
        description: '',
      })
      setErrors({})
      onClose()
    } catch (error) {
      console.error('포인트 내역 추가 실패:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setFormData({
      type: 'earn',
      amount: '',
      description: '',
    })
    setErrors({})
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="포인트 내역 추가"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <Typography variant="body2" color="text-secondary" className="mb-3">
            포인트 유형
          </Typography>
          <div className="flex gap-4">
            <label className="flex items-center">
              <input
                type="radio"
                name="type"
                value="earn"
                checked={formData.type === 'earn'}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    type: e.target.value as 'earn' | 'withdraw',
                  })
                }
                className="mr-2"
              />
              <span className="text-green-700">적립</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="type"
                value="withdraw"
                checked={formData.type === 'withdraw'}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    type: e.target.value as 'earn' | 'withdraw',
                  })
                }
                className="mr-2"
              />
              <span className="text-red-700">차감</span>
            </label>
          </div>
        </div>

        <Input
          label="포인트 *"
          type="number"
          placeholder="예: 1000"
          value={formData.amount}
          onChange={(e) => {
            setFormData({ ...formData, amount: e.target.value })
            if (errors.amount) {
              setErrors({ ...errors, amount: '' })
            }
          }}
          error={errors.amount}
          disabled={isSubmitting}
          min="1"
          step="1"
        />

        <Textarea
          label="설명 *"
          placeholder="포인트 적립/차감 사유를 입력해주세요"
          value={formData.description}
          onChange={(e) => {
            setFormData({ ...formData, description: e.target.value })
            if (errors.description) {
              setErrors({ ...errors, description: '' })
            }
          }}
          error={errors.description}
          disabled={isSubmitting}
          rows={3}
        />

        <div className="bg-blue-50 p-4 rounded-lg">
          <Typography variant="caption" color="text-secondary">
            <strong>안내사항:</strong>
            <br />
            • 포인트 내역은 한 번 추가되면 수정할 수 없습니다.
            <br />
            • 정확한 금액과 사유를 입력해주세요.
            <br />• 모든 내역은 기록되어 관리됩니다.
          </Typography>
        </div>

        <Flex justify="end" gap={3}>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            취소
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting ? '추가 중...' : '추가하기'}
          </Button>
        </Flex>
      </form>
    </Modal>
  )
}
