import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/Button'
import { Flex } from '@/components/ui/Flex'
import { Input } from '@/components/ui/Input'
import { Typography } from '@/components/ui/Typography'
import { ChargeModal } from './ChargeModal'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'
import { useAuth } from '@/hooks/useAuth'
import { useSendMessage } from '@/hooks/useSimpleChat'
import { mateYouApi } from '@/lib/apiClient'
import { X } from 'lucide-react'

interface DonationModalProps {
  isOpen: boolean
  onClose: () => void
  partnerId: string
  partnerName?: string
}

const DONATION_OPTIONS = [
  { amount: 1000, heart: '/icon/heart.png' },
  { amount: 3000, heart: '/icon/heart2.png' },
  { amount: 5000, heart: '/icon/heart3.png' },
  { amount: 10000, heart: '/icon/heart4.png' },
  { amount: 30000, heart: '/icon/heart5.png' },
  { amount: 50000, heart: '/icon/heart6.png' },
]

export function DonationModal({
  isOpen,
  onClose,
  partnerId,
  partnerName,
}: DonationModalProps) {
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null)
  const [customAmount, setCustomAmount] = useState<string>('')
  const [isCustomMode, setIsCustomMode] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [donatedAmount, setDonatedAmount] = useState(0)
  const [isChargeModalOpen, setIsChargeModalOpen] = useState(false)
  const [currentPoints, setCurrentPoints] = useState(0)
  const queryClient = useQueryClient()
  const toast = useToast()
  const { user } = useAuth()
  const { sendMessage } = useSendMessage()

  // 현재 포인트 로드 - members.total_points 사용 (네비게이터와 동일한 기준)
  useEffect(() => {
    const loadPoints = async () => {
      try {
        const response = await mateYouApi.members.getUserPoints()
        
        if (response.data.success && response.data.data) {
          setCurrentPoints(response.data.data.points || 0)
        } else {
          setCurrentPoints(0)
        }
      } catch (error) {
        console.error('포인트 조회 실패:', error)
        setCurrentPoints(0)
      }
    }

    if (isOpen) {
      loadPoints()
    }
  }, [isOpen])

  const handleCharge = async () => {
    // ChargeModal은 토스페이먼츠로 리다이렉트되므로 별도 처리 불필요
    setIsChargeModalOpen(false)
  }

  const getFinalAmount = () => {
    if (isCustomMode && customAmount) {
      const amount = parseInt(customAmount, 10)
      if (amount >= 1000) {
        return amount
      }
    }
    return selectedAmount
  }

  const handleDonate = async () => {
    const finalAmount = getFinalAmount()
    if (!finalAmount) return

    try {
      setIsLoading(true)

      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        toast.error('로그인이 필요합니다.')
        return
      }

      // 1. 현재 사용자의 포인트 확인 - members.total_points 사용
      const pointsResponse = await mateYouApi.members.getUserPoints()
      
      if (!pointsResponse.data.success || !pointsResponse.data.data) {
        throw new Error('포인트 조회에 실패했습니다.')
      }

      const currentPoints = pointsResponse.data.data.points || 0

      if (currentPoints < finalAmount) {
        toast.error(`포인트가 부족합니다. (보유: ${currentPoints.toLocaleString()}P)`)
        return
      }

      // 2. 파트너 정보 조회 (member_id로 partners.id 찾기)
      const { data: partnerData, error: partnerError } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', partnerId)
        .single()

      if (partnerError || !partnerData) {
        throw new Error('파트너 정보를 찾을 수 없습니다.')
      }

      const partnerPartnerId = partnerData.id // partners.id

      // 3. 후원 API 호출
      const donationResponse = await mateYouApi.members.donation({
        partner_id: partnerPartnerId,
        amount: finalAmount,
        description: `${partnerName || '파트너'} 후원`,
        log_id: `donation_${partnerId}_${Date.now()}`,
      })

      if (!donationResponse.data.success) {
        throw new Error(donationResponse.data.error?.message || '후원에 실패했습니다.')
      }

      // 4. 쿼리 무효화
      await queryClient.invalidateQueries({ queryKey: ['member-points'] })
      await queryClient.invalidateQueries({ queryKey: ['member-points-history'] })
      await queryClient.invalidateQueries({ queryKey: ['user'] })

      // 5. 후원 완료 메시지 전송 (하트 이미지 포함)
      const currentUserId = session?.user?.id || user?.id
      if (currentUserId && partnerId) {
        try {
          const heartCount = Math.floor(finalAmount / 1000)
          // 선택한 하트 이미지 찾기
          const selectedHeart = DONATION_OPTIONS.find(opt => opt.amount === finalAmount)?.heart || '/icon/heart.png'
          // 특별 형식: [HEART_GIFT:이미지경로:하트개수:포인트]
          const donationMessage = `[HEART_GIFT:${selectedHeart}:${heartCount}:${finalAmount}]`
          await sendMessage(currentUserId, partnerId, donationMessage)
        } catch (error) {
          // 메시지 전송 실패해도 후원은 성공한 것으로 처리
          console.error('후원 메시지 전송 실패:', error)
        }
      }

      setDonatedAmount(finalAmount)
      setIsSuccess(true)
    } catch (error) {
      console.error('후원 실패:', error)
      toast.error(
        error instanceof Error ? error.message : '후원에 실패했습니다.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleClose = () => {
    if (!isLoading) {
      onClose()
      setSelectedAmount(null)
      setCustomAmount('')
      setIsCustomMode(false)
      setIsSuccess(false)
      setDonatedAmount(0)
    }
  }

  const handleCustomAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '')
    setCustomAmount(value)
    setIsCustomMode(true)
    setSelectedAmount(null)
  }

  const handleOptionSelect = (amount: number) => {
    setSelectedAmount(amount)
    setIsCustomMode(false)
    setCustomAmount('')
  }

  const isValidAmount = () => {
    if (isCustomMode && customAmount) {
      const amount = parseInt(customAmount, 10)
      return amount >= 1000
    }
    return !!selectedAmount
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* 오버레이 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={handleClose}
          />

          {/* 슬라이드 팝업 */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl max-h-[85vh] overflow-y-auto"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}
          >
            {/* 드래그 핸들 */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>

            {/* 헤더 */}
            <div className="sticky top-0 bg-white px-4 py-2 flex items-center justify-between">
              <div className="w-8" />
              <Typography variant="h6" className="font-semibold">
                {isSuccess ? '하트 전달 완료' : '하트 보내기'}
              </Typography>
              <button
                onClick={handleClose}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {isSuccess ? (
              /* 후원 완료 화면 */
              <div className="px-4 pb-6 space-y-4 text-center">
                <div className="w-16 h-16 bg-pink-100 rounded-full flex items-center justify-center mx-auto">
                  <img src="/icon/heart.png" alt="하트" className="w-8 h-8" />
                </div>
                <Typography variant="h5" className="font-semibold text-pink-600">
                  후원이 완료되었습니다!
                </Typography>
                <Typography variant="body1" color="text-secondary">
                  <span className="font-semibold">{partnerName || '파트너'}</span>
                  님에게{' '}
                  <span className="font-semibold text-pink-600">
                    {donatedAmount.toLocaleString()}P
                  </span>
                  를 후원했습니다.
                </Typography>
                <Button
                  variant="primary"
                  onClick={handleClose}
                  className="w-full bg-pink-500 hover:bg-pink-600"
                >
                  확인
                </Button>
              </div>
            ) : (
              /* 후원 입력 화면 */
              <div className="px-4 pb-6 space-y-4">

                <div className="grid grid-cols-3 gap-1">
                  {DONATION_OPTIONS.map((option) => {
                    const isSelected = selectedAmount === option.amount && !isCustomMode

                    return (
                      <button
                        key={option.amount}
                        onClick={() => handleOptionSelect(option.amount)}
                        className={`
                          py-3 px-2 rounded-xl border-2 transition-all hover:scale-105
                          ${
                            isSelected
                              ? 'border-pink-500 bg-pink-50 shadow-lg shadow-pink-200'
                              : 'border-gray-200 hover:border-pink-300'
                          }
                        `}
                      >
                        <div className="flex flex-col items-center gap-2">
                          <img 
                            src={option.heart} 
                            alt="하트" 
                            className="w-16 h-16 object-contain"
                          />
                          <span className="text-xs font-semibold text-white bg-[#FE3A8F] px-2 py-0.5 rounded-full">
                            {option.amount.toLocaleString()}P
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>



                {/* 포인트 부족 알림 */}
                {getFinalAmount() && currentPoints < (getFinalAmount() || 0) && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <Flex justify="between" align="center" className="mb-2">
                      <Typography
                        variant="body2"
                        className="text-red-800 font-medium"
                      >
                        포인트가 부족합니다
                      </Typography>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsChargeModalOpen(true)}
                        className="border-red-500 text-red-600 hover:bg-red-50"
                      >
                        충전하기
                      </Button>
                    </Flex>
                    <div className="space-y-1 text-sm text-red-700">
                      <div className="flex justify-between">
                        <span>필요 포인트:</span>
                        <span>{(getFinalAmount() || 0).toLocaleString()}P</span>
                      </div>
                      <div className="flex justify-between">
                        <span>보유 포인트:</span>
                        <span>{currentPoints.toLocaleString()}P</span>
                      </div>
                      <div className="flex justify-between font-medium">
                        <span>부족 포인트:</span>
                        <span className="text-red-600">
                          {((getFinalAmount() || 0) - currentPoints).toLocaleString()}P
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <Flex gap={2} className="pt-2">
                  <Button
                    variant="secondary"
                    onClick={handleClose}
                    disabled={isLoading}
                    className="flex-1"
                  >
                    취소
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleDonate}
                    disabled={!isValidAmount() || isLoading}
                    className="flex-1 bg-pink-500 hover:bg-pink-600"
                  >
                    {isLoading ? '처리 중...' : '후원하기'}
                  </Button>
                </Flex>
              </div>
            )}
          </motion.div>

          {/* Charge Modal */}
          <ChargeModal
            isOpen={isChargeModalOpen}
            onClose={() => setIsChargeModalOpen(false)}
            onCharge={handleCharge}
            preselectedPoints={getFinalAmount() ? (getFinalAmount() || 0) - currentPoints : null}
          />
        </>
      )}
    </AnimatePresence>
  )
}
