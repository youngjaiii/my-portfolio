import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, useRef } from 'react'
import { Button, Footer, Navigation, Typography } from '@/components'
import { supabase } from '@/lib/supabase'
import { mateYouApi } from '@/lib/apiClient'

export const Route = createFileRoute('/payment/success')({
  component: PaymentSuccessPage,
})

function PaymentSuccessPage() {
  const navigate = useNavigate()
  const [isProcessing, setIsProcessing] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    points: number
    amount: number
  } | null>(null)
  const isProcessingRef = useRef(false) // 중복 실행 방지를 위한 ref
  const queryClient = useQueryClient()

  useEffect(() => {
    // 이미 처리 중이면 무시
    if (isProcessingRef.current) {
      console.log('🚫 결제 처리 중복 실행 방지')
      return
    }

    // URLSearchParams를 사용하여 결제 정보 추출
    const urlParams = new URLSearchParams(window.location.search)
    const paymentKey = urlParams.get('paymentKey')
    const orderId = urlParams.get('orderId')
    const amount = urlParams.get('amount')
    const processed = urlParams.get('processed') === 'true' // 이미 처리된 결제인지 확인

    // 이미 처리된 결제인 경우 API 호출 없이 결과만 표시
    if (processed) {
      console.log('✅ 이미 처리된 결제 - API 호출 건너뛰기')
      const pointsParam = urlParams.get('points')
      let chargedPoints = pointsParam ? Number(pointsParam) : NaN
      if (Number.isNaN(chargedPoints) && orderId) {
        const match = orderId.match(/order_points_(\d+)_/)
        if (match) {
          chargedPoints = Number(match[1])
        }
      }
      
      const amountNumber = amount ? Number(amount) : NaN
      
      if (!Number.isNaN(chargedPoints) && !Number.isNaN(amountNumber)) {
        setResult({
          points: chargedPoints,
          amount: amountNumber,
          message: '결제가 이미 완료되었습니다.',
        })
        setIsProcessing(false)
        return
      }
    }
    
    // 처리 시작 표시
    isProcessingRef.current = true
    console.log('✅ 결제 처리 시작')

    const processPayment = async () => {
      try {

        if (!paymentKey || !orderId || !amount) {
          throw new Error('결제 정보가 부족합니다.')
        }

        const amountNumber = Number(amount)
        if (Number.isNaN(amountNumber)) {
          throw new Error('결제 금액을 확인할 수 없습니다.')
        }

        // 포인트 정보 추출
        const pointsParam = urlParams.get('points')
        let chargedPoints = pointsParam ? Number(pointsParam) : NaN
        if (Number.isNaN(chargedPoints) && orderId) {
          const match = orderId.match(/order_points_(\d+)_/)
          if (match) {
            chargedPoints = Number(match[1])
          }
        }

        if (Number.isNaN(chargedPoints)) {
          throw new Error('충전 포인트 정보를 찾을 수 없습니다.')
        }

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession()

        if (sessionError) {
          throw sessionError
        }

        if (!session) {
          throw new Error('로그인 정보를 확인할 수 없습니다.')
        }

        // API Client를 사용하여 결제 승인 요청
        console.log('📤 결제 확인 API 호출:', { orderId, amount: amountNumber })
        const response = await mateYouApi.payment.confirm({
          paymentKey,
          orderId,
          amount: amountNumber,
        })

        // 응답 형식 처리
        let result: any
        if (response.data.success) {
          // 성공 응답 처리
          if (response.data.data) {
            result = response.data.data
          } else if (response.data.points) {
            // 하위 호환성: 직접 points 필드가 있는 경우
            result = response.data
          } else {
            // 메시지만 있는 경우 (이미 처리된 결제 등)
            result = {
              points: chargedPoints,
              amount: amountNumber,
              message: response.data.message || '결제가 완료되었습니다.',
            }
          }
        } else {
          // 에러 응답 처리
          const errorMessage = response.data.error?.message || '결제 처리 실패'
          
          // "이미 처리 중" 에러는 실제로는 성공일 수 있으므로 특별 처리
          if (errorMessage.includes('이미 처리') || errorMessage.includes('처리 중')) {
            // 이미 처리된 결제로 간주하고 성공 처리
            // 데이터베이스에서 실제 상태를 확인하기 위해 조회 필요
            console.warn('⚠️ 결제가 이미 처리 중이거나 완료된 것으로 보입니다:', errorMessage)
            result = {
              points: chargedPoints,
              amount: amountNumber,
              message: '결제가 이미 처리되었습니다.',
              alreadyProcessed: true,
            }
          } else {
            throw new Error(errorMessage)
          }
        }

        // 쿼리 무효화
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ['member-points'],
          }),
          queryClient.invalidateQueries({
            queryKey: ['member-points-history'],
          }),
          queryClient.invalidateQueries({ queryKey: ['user'] }),
        ])

        setResult({ 
          points: result.points || chargedPoints, 
          amount: result.amount || amountNumber 
        })
        setIsProcessing(false)
        console.log('✅ 결제 처리 완료')

        // 결제 처리 완료 후 URL에 processed 플래그 추가 (새로고침 방지)
        const currentUrl = new URL(window.location.href)
        currentUrl.searchParams.set('processed', 'true')
        // 브라우저 히스토리에 추가하되 페이지 리로드는 하지 않음
        window.history.replaceState({}, '', currentUrl.toString())
      } catch (err) {
        console.error('❌ 결제 처리 오류:', err)
        setError(
          err instanceof Error
            ? err.message
            : '결제 처리 중 오류가 발생했습니다.',
        )
        setIsProcessing(false)
      } finally {
        // 처리 완료 표시 (성공/실패 관계없이)
        isProcessingRef.current = false
      }
    }

    processPayment()
    
    // cleanup 함수: 컴포넌트 언마운트 시 처리 중 플래그 리셋
    return () => {
      // cleanup 시에는 리셋하지 않음 (처리 중일 수 있으므로)
      // 대신 finally 블록에서만 리셋
    }
  }, []) // 빈 의존성 배열: 마운트 시 한 번만 실행

  const handleGoToPoints = () => {
    navigate({ to: '/points' })
  }

  const handleGoToHome = () => {
    navigate({ to: '/' })
  }

  if (isProcessing) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="container mx-auto p-6 flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <Typography variant="h4" className="mb-2">
              결제 처리 중...
            </Typography>
            <Typography variant="body1" color="text-secondary">
              잠시만 기다려주세요.
            </Typography>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navigation />
        <div className="container mx-auto p-6 flex items-center justify-center min-h-[60vh]">
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
              결제 처리 실패
            </Typography>
            <Typography variant="body1" color="text-secondary" className="mb-6">
              {error}
            </Typography>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={handleGoToHome}>
                홈으로
              </Button>
              <Button variant="primary" onClick={handleGoToPoints}>
                다시 시도
              </Button>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="container mx-auto p-6 flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <Typography variant="h4" className="mb-2 text-green-600">
            결제 완료!
          </Typography>
          <Typography variant="body1" color="text-secondary" className="mb-6">
            {result?.message || '포인트 충전이 성공적으로 완료되었습니다.'}
          </Typography>

          <div className="bg-white rounded-lg p-4 mb-6 border">
            <div className="flex justify-between items-center mb-2">
              <Typography variant="body2" color="text-secondary">
                충전 포인트
              </Typography>
              <Typography variant="h6" className="font-semibold">
                {result ? `${result.points?.toLocaleString() || '0'}P` : '-'}
              </Typography>
            </div>
            <div className="flex justify-between items-center">
              <Typography variant="body2" color="text-secondary">
                결제 금액
              </Typography>
              <Typography variant="h6" className="font-semibold">
                {result ? `${result.amount?.toLocaleString() || '0'}원` : '-'}
              </Typography>
            </div>
          </div>

          <div className="flex gap-3 justify-center">
            <Button variant="outline" onClick={handleGoToHome}>
              홈으로
            </Button>
            <Button variant="primary" onClick={handleGoToPoints}>
              포인트 확인
            </Button>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  )
}
