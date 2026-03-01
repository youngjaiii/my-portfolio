import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Button, Footer, Navigation, Typography } from '@/components'

export const Route = createFileRoute('/payment/fail')({
  component: PaymentFailPage,
})

function PaymentFailPage() {
  const navigate = useNavigate()

  // URLSearchParams를 사용하여 실패 정보 추출
  const urlParams = new URLSearchParams(window.location.search)
  const code = urlParams.get('code')
  const message = urlParams.get('message')
  const orderId = urlParams.get('orderId')

  const handleRetry = () => {
    navigate({ to: '/points' })
  }

  const handleGoToHome = () => {
    navigate({ to: '/' })
  }

  const getFailureMessage = () => {
    switch (code) {
      case 'PAY_PROCESS_CANCELED':
        return '결제가 취소되었습니다.'
      case 'PAY_PROCESS_ABORTED':
        return '결제가 중단되었습니다.'
      case 'REJECT_CARD_COMPANY':
        return '카드사에서 결제를 거부했습니다.'
      case 'INVALID_CARD_COMPANY':
        return '유효하지 않은 카드입니다.'
      default:
        return message || '결제 처리 중 오류가 발생했습니다.'
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="container mx-auto px-6 pt-18 pb-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <Typography variant="h4" className="mb-2 text-red-600">
            결제 실패
          </Typography>
          <Typography variant="body1" color="text-secondary" className="mb-6">
            {getFailureMessage()}
          </Typography>

          {orderId && (
            <div className="bg-white rounded-lg p-4 mb-6 border">
              <div className="flex flex-col md:flex-row justify-between items-center">
                <Typography variant="body2" color="text-secondary">
                  주문번호
                </Typography>
                <Typography variant="body2" className="font-mono text-sm">
                  {orderId}
                </Typography>
              </div>
            </div>
          )}

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
            <Typography variant="body2" className="text-yellow-800">
              💡 결제가 실패한 경우 다음을 확인해주세요:
            </Typography>
            <ul className="text-left text-sm text-yellow-700 mt-2 space-y-1">
              <li>• 카드 한도 및 잔액 확인</li>
              <li>• 카드 유효기간 확인</li>
              <li>• 해외결제 차단 여부 확인</li>
              <li>• 인터넷 연결 상태 확인</li>
            </ul>
          </div>

          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={handleGoToHome}>
              홈으로
            </Button>
            <Button variant="primary" onClick={handleRetry}>
              다시 시도
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
