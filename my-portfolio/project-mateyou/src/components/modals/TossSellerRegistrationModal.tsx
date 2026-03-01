import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Typography } from '@/components/ui/Typography'
import { BANK_CODES, findBankByCode } from '@/constants/banks'

interface TossSellerInfo {
  legalName?: string
  legalEmail?: string
  legalPhone?: string
  businessType?: 'INDIVIDUAL' | 'INDIVIDUAL_BUSINESS' | 'CORPORATE'
  payoutBankCode?: string
  payoutBankName?: string
  payoutAccountNumber?: string
  payoutAccountHolder?: string
}

interface TossSellerRegistrationModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (info: TossSellerInfo) => Promise<void>
  initialData?: TossSellerInfo
  userName?: string
  userEmail?: string
  mode?: 'register' | 'edit' // 등록 모드 vs 수정 모드
}

export function TossSellerRegistrationModal({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  userName,
  userEmail,
  mode = 'register', // 기본값은 등록 모드
}: TossSellerRegistrationModalProps) {
  const [formData, setFormData] = useState<TossSellerInfo>({
    legalName: initialData?.legalName || userName || '',
    legalEmail: initialData?.legalEmail || userEmail || '',
    legalPhone: initialData?.legalPhone || '',
    businessType: initialData?.businessType || 'INDIVIDUAL',
    payoutBankCode: initialData?.payoutBankCode || '',
    payoutBankName: initialData?.payoutBankName || '',
    payoutAccountNumber: initialData?.payoutAccountNumber || '',
    payoutAccountHolder: initialData?.payoutAccountHolder || initialData?.legalName || userName || '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 모달이 열릴 때 initialData로 폼 초기화
  useEffect(() => {
    if (isOpen) {
      setFormData({
        legalName: initialData?.legalName || userName || '',
        legalEmail: initialData?.legalEmail || userEmail || '',
        legalPhone: initialData?.legalPhone || '',
        businessType: initialData?.businessType || 'INDIVIDUAL',
        payoutBankCode: initialData?.payoutBankCode || '',
        payoutBankName: initialData?.payoutBankName || '',
        payoutAccountNumber: initialData?.payoutAccountNumber || '',
        payoutAccountHolder: initialData?.payoutAccountHolder || initialData?.legalName || userName || '',
      })
      setErrors({})
    }
  }, [isOpen, initialData, userName, userEmail])

  const handleInputChange = (field: keyof TossSellerInfo, value: string) => {
    let nextValue = value

    if (field === 'legalPhone') {
      nextValue = value.replace(/[^\d-]/g, '')
    } else if (field === 'payoutAccountNumber') {
      nextValue = value.replace(/[^\d]/g, '')
    }

    if (field === 'payoutBankCode') {
      const bank = findBankByCode(value)
      setFormData((prev) => ({
        ...prev,
        payoutBankCode: value,
        payoutBankName: bank?.name || '',
      }))
    } else {
      setFormData((prev) => ({ ...prev, [field]: nextValue }))
    }

    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }))
    }
  }

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    const sanitizedPhone = (formData.legalPhone || '').replace(/\D/g, '')
    const sanitizedAccountNumber = (formData.payoutAccountNumber || '').replace(/\D/g, '')

    if (!formData.legalName?.trim()) {
      newErrors.legalName = '정산 받을 실명을 입력해주세요'
    }

    if (!formData.legalEmail?.trim() || !emailRegex.test(formData.legalEmail)) {
      newErrors.legalEmail = '유효한 이메일을 입력해주세요'
    }

    if (sanitizedPhone.length < 8) {
      newErrors.legalPhone = '하이픈 없이 8자리 이상의 연락처를 입력해주세요'
    }

    if (!formData.payoutBankCode) {
      newErrors.payoutBankCode = '정산 받을 은행을 선택해주세요'
    }

    if (sanitizedAccountNumber.length < 7 || sanitizedAccountNumber.length > 20) {
      newErrors.payoutAccountNumber = '하이픈 없이 7~20자리의 계좌번호를 입력해주세요'
    }

    if (!formData.payoutAccountHolder?.trim()) {
      newErrors.payoutAccountHolder = '예금주명을 입력해주세요'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)
    try {
      await onSubmit({
        ...formData,
        legalPhone: formData.legalPhone?.replace(/\D/g, ''),
        payoutAccountNumber: formData.payoutAccountNumber?.replace(/\D/g, ''),
      })
      onClose()
    } catch (error) {
      console.error('토스 셀러 등록 오류:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  // 필수 정보가 모두 있는지 확인 (등록 모드일 때만 확인 화면 표시)
  const hasAllRequiredInfo =
    mode === 'register' &&
    initialData?.legalName &&
    initialData?.legalEmail &&
    initialData?.legalPhone &&
    initialData?.payoutBankCode &&
    initialData?.payoutAccountNumber &&
    initialData?.payoutAccountHolder

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={mode === 'edit' ? '정산 정보 수정' : '토스 셀러 등록'}>
      <div className="space-y-4">
        {hasAllRequiredInfo ? (
          <>
            <div className="bg-blue-50 p-4 rounded-lg">
              <Typography variant="body2" className="mb-2">
                등록된 정산 정보로 토스 셀러를 등록하시겠습니까?
              </Typography>
              <div className="space-y-2 text-sm text-gray-700">
                <div>• 실명: {initialData?.legalName}</div>
                <div>• 이메일: {initialData?.legalEmail}</div>
                <div>• 연락처: {initialData?.legalPhone}</div>
                <div>• 정산 은행: {initialData?.payoutBankName || initialData?.payoutBankCode}</div>
                <div>• 계좌번호: {initialData?.payoutAccountNumber}</div>
                <div>• 예금주: {initialData?.payoutAccountHolder}</div>
              </div>
            </div>
            <Typography variant="caption" color="text-secondary">
              정보가 올바르지 않다면 프로필 설정에서 수정 후 다시 시도해주세요.
            </Typography>
          </>
        ) : (
          <>
            <Typography variant="body2" color="text-secondary" className="mb-4">
              토스 셀러 등록을 위해 정산 정보를 입력해주세요.
            </Typography>

            <Input
              label="정산 받을 실명 *"
              type="text"
              placeholder="예: 홍길동"
              value={formData.legalName}
              onChange={(e) => handleInputChange('legalName', e.target.value)}
              error={errors.legalName}
              disabled={isSubmitting}
            />

            <Input
              label="정산 안내 이메일 *"
              type="email"
              placeholder="example@email.com"
              value={formData.legalEmail}
              onChange={(e) => handleInputChange('legalEmail', e.target.value)}
              error={errors.legalEmail}
              disabled={isSubmitting}
            />

            <Input
              label="연락처 *"
              type="text"
              placeholder="01012345678"
              value={formData.legalPhone}
              onChange={(e) => handleInputChange('legalPhone', e.target.value)}
              error={errors.legalPhone}
              helpText="하이픈 없이 숫자만 입력해주세요"
              disabled={isSubmitting}
            />

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                정산 받을 은행 *
              </label>
              <select
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100"
                value={formData.payoutBankCode}
                onChange={(e) => handleInputChange('payoutBankCode', e.target.value)}
                disabled={isSubmitting}
              >
                <option value="">은행을 선택하세요</option>
                {BANK_CODES.map((bank) => (
                  <option key={bank.code} value={bank.code}>
                    {bank.name}
                  </option>
                ))}
              </select>
              {errors.payoutBankCode && (
                <Typography variant="caption" className="mt-1 text-red-600">
                  {errors.payoutBankCode}
                </Typography>
              )}
            </div>

            <Input
              label="계좌번호 *"
              type="text"
              placeholder="하이픈 없이 입력"
              value={formData.payoutAccountNumber}
              onChange={(e) => handleInputChange('payoutAccountNumber', e.target.value)}
              error={errors.payoutAccountNumber}
              disabled={isSubmitting}
            />

            <Input
              label="예금주 *"
              type="text"
              placeholder="계좌 예금주명을 입력해주세요"
              value={formData.payoutAccountHolder}
              onChange={(e) => handleInputChange('payoutAccountHolder', e.target.value)}
              error={errors.payoutAccountHolder}
              disabled={isSubmitting}
            />

            <div className="bg-yellow-50 p-3 rounded-lg">
              <Typography variant="caption" color="text-secondary">
                <strong>안내사항:</strong>
                <br />• 입력한 정보는 토스 셀러 등록 및 정산에 사용됩니다.
                <br />• 정확한 정보를 입력해주세요.
              </Typography>
            </div>
          </>
        )}

        <div className="flex gap-2 justify-end pt-4">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            취소
          </Button>
          <Button variant="primary" onClick={handleSubmit} disabled={isSubmitting} loading={isSubmitting}>
            {isSubmitting
              ? (mode === 'edit' ? '저장 중...' : '등록 중...')
              : hasAllRequiredInfo
                ? '등록하기'
                : (mode === 'edit' ? '저장하기' : '저장 후 등록하기')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
