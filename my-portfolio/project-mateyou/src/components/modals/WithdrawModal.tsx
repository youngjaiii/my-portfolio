import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Flex } from '@/components/ui/Flex'
import { Modal } from '@/components/ui/Modal'
import { Typography } from '@/components/ui/Typography'
import { ToastContainer } from '@/components/features/ToastContainer'
import { useToast } from '@/hooks/useToast'
import { useDevice } from '@/hooks/useDevice'

interface WithdrawModalProps {
  isOpen: boolean
  onClose: () => void
  availablePoints: number
  accountHolder?: string
  bankName?: string
  accountNumber?: string
  tax?: number
  title?: string
  onWithdraw?: (
    amount: number,
    accountHolder: string,
    bankName: string,
    accountNumber: string,
  ) => Promise<void>
}

const minAmount = 100000 // 최소 출금 금액 100,000P

export function WithdrawModal({
  isOpen,
  onClose,
  availablePoints,
  accountHolder,
  bankName,
  accountNumber,
  onWithdraw,
  tax,
  title = '포인트 출금',
}: WithdrawModalProps) {
  const { isMobile } = useDevice()
  const [withdrawAmount, setWithdrawAmount] = useState('')
  const [amountError, setAmountError] = useState('')
  const { toasts, removeToast, success, error, warning } = useToast()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const amount = Number(withdrawAmount)

    if (amount < minAmount) {
      error(`최소 출금 금액은 ${minAmount.toLocaleString()}P 입니다.`)
      return
    }

    if (amount > availablePoints) {
      error(
        `출금 가능 포인트를 초과했습니다. 최대 ${availablePoints.toLocaleString()}P까지 출금 가능합니다.`,
      )
      return
    }

    try {
      if (onWithdraw && accountHolder && bankName && accountNumber) {
        await onWithdraw(amount, accountHolder, bankName, accountNumber)
      }
      success('출금 요청이 접수되었습니다.')

      // 성공 후 3초 뒤에 모달 닫기
      setTimeout(() => {
        onClose()
        // 폼 초기화
        setWithdrawAmount('')
      }, 3000)
    } catch (err) {
      error('출금 요청 중 오류가 발생했습니다.')
    }
  }

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '')
    const numValue = Number(value)

    // 에러 메시지 초기화
    setAmountError('')

    if (numValue > availablePoints) {
      warning(
        `출금 가능 포인트를 초과했습니다. 최대 ${availablePoints.toLocaleString()}P까지 출금 가능합니다.`,
      )
      setWithdrawAmount(availablePoints.toString())
    } else {
      setWithdrawAmount(value)
    }
  }

  const handleAmountBlur = () => {
    const numValue = Number(withdrawAmount)

    if (withdrawAmount && numValue > 0 && numValue < minAmount) {
      setAmountError(
        `최소 출금 금액은 ${minAmount.toLocaleString()}P부터 가능합니다.`,
      )
    } else {
      setAmountError('')
    }
  }

  const setMaxAmount = () => {
    setWithdrawAmount(availablePoints.toString())
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size={isMobile ? 'xl' : 'sm'}
    >
      <form
        onSubmit={handleSubmit}
        className={`${isMobile ? 'space-y-3' : 'space-y-4'}`}
      >
        {/* 출금 가능 포인트 */}
        <div className={`bg-blue-50 ${isMobile ? 'p-3' : 'p-4'} rounded-lg`}>
          <Typography variant="body2" color="text-secondary" className="mb-1">
            출금 가능 포인트
          </Typography>
          <Typography variant="h4" color="primary">
            {availablePoints.toLocaleString()}P
          </Typography>
        </div>

        {/* 출금 금액 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            출금 금액
          </label>
          <div className="relative">
            <input
              type="text"
              value={
                withdrawAmount ? Number(withdrawAmount).toLocaleString() : ''
              }
              onChange={handleAmountChange}
              onBlur={handleAmountBlur}
              placeholder="출금할 포인트를 입력하세요"
              className={`w-full ${isMobile ? 'px-2 py-2' : 'px-3 py-2'} border rounded-lg focus:ring-2 ${
                amountError
                  ? 'border-red-500 focus:ring-red-500 focus:border-red-500'
                  : 'border-gray-300 focus:ring-blue-500 focus:border-transparent'
              }`}
              required
            />
            <span className="absolute right-3 top-2 text-gray-500">P</span>
          </div>
          {amountError && (
            <p className="mt-1 text-sm text-red-600">{amountError}</p>
          )}
          <button
            type="button"
            onClick={setMaxAmount}
            className="mt-2 text-sm text-blue-600 hover:text-blue-800"
          >
            전액 출금
          </button>
        </div>

        {/* 예금주 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            예금주
          </label>
          <div className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
            <Typography variant="body2" color="text-primary">
              {accountHolder || '등록된 예금주 정보가 없습니다'}
            </Typography>
          </div>
        </div>

        {/* 은행명 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            은행명
          </label>
          <div className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
            <Typography variant="body2" color="text-primary">
              {bankName || '등록된 은행 정보가 없습니다'}
            </Typography>
          </div>
        </div>

        {/* 계좌번호 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            계좌번호
          </label>
          <div className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
            <Typography variant="body2" color="text-primary">
              {accountNumber || '등록된 계좌 정보가 없습니다'}
            </Typography>
          </div>
        </div>

        {/* 출금 예정 금액 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            출금 예정 금액 (수수료 적용)
          </label>
          <div className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
            <Typography variant="body2" color="text-primary">
              {withdrawAmount
                ? `${(
                    Number(withdrawAmount) *
                    (1 - (tax || 0) / 100)
                  ).toLocaleString()}P`
                : '0P'}
            </Typography>
          </div>
        </div>

        {/* 버튼 */}
        <Flex
          gap={isMobile ? 2 : 3}
          className={isMobile ? 'pt-3' : 'pt-4'}
        >
          <Button
            type="button"
            variant="outline"
            size={isMobile ? 'sm' : 'md'}
            onClick={onClose}
            className="flex-1"
          >
            취소
          </Button>
          <Button
            type="submit"
            variant="primary"
            size={isMobile ? 'sm' : 'md'}
            className="flex-1"
            disabled={
              !withdrawAmount ||
              !accountHolder ||
              !bankName ||
              !accountNumber ||
              Number(withdrawAmount) < minAmount
            }
          >
            출금 요청
          </Button>
        </Flex>

        {/* 안내사항 */}
        <div
          className={`${isMobile ? 'mt-4 p-3' : 'mt-6 p-4'} bg-gray-50 rounded-lg`}
        >
          <Typography
            variant="body2"
            color="text-secondary"
            className="text-sm"
          >
            <strong>출금 안내</strong>
            <br />
            • 출금 처리는 영업일 기준 1-2일 소요됩니다.
            <br />
            • 최소 출금 금액은 100,000P 입니다.
            <br />
            • 출금 수수료는 {tax}%가 부과됩니다.
            <br />• 정확한 계좌 정보인지 확인해주세요. 잘못된 정보로 인한 출금
            실패 시 책임지지 않습니다.
          </Typography>
        </div>
      </form>

      {/* Toast Container */}
      <ToastContainer toasts={toasts} onRemoveToast={removeToast} />
    </Modal>
  )
}
