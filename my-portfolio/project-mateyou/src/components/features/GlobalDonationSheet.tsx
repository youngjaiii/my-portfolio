import { useState, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { SlideSheet } from '@/components/ui/SlideSheet'
import { Button } from '@/components/ui/Button'
import { Flex } from '@/components/ui/Flex'
import { Typography } from '@/components/ui/Typography'
import { ChargeModal } from '@/components/modals/ChargeModal'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'
import { useAuth } from '@/hooks/useAuth'
import { useSendMessage } from '@/hooks/useSimpleChat'
import { mateYouApi } from '@/lib/apiClient'
import { useUIStore } from '@/store/useUIStore'

const DONATION_OPTIONS = [
  { amount: 1000, heart: '/icon/heart.png' },
  { amount: 3000, heart: '/icon/heart2.png' },
  { amount: 5000, heart: '/icon/heart3.png' },
  { amount: 10000, heart: '/icon/heart4.png' },
  { amount: 30000, heart: '/icon/heart5.png' },
  { amount: 50000, heart: '/icon/heart6.png' },
]

export function GlobalDonationSheet() {
  const { isDonationSheetOpen, donationTargetPartnerId, donationTargetPartnerName, closeDonationSheet } = useUIStore()
  
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [donatedAmount, setDonatedAmount] = useState(0)
  const [isChargeModalOpen, setIsChargeModalOpen] = useState(false)
  const [currentPoints, setCurrentPoints] = useState(0)
  const queryClient = useQueryClient()
  const toast = useToast()
  const { user } = useAuth()
  const { sendMessage } = useSendMessage()

  // 현재 포인트 로드
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

    if (isDonationSheetOpen) {
      loadPoints()
    }
  }, [isDonationSheetOpen])

  const handleCharge = async () => {
    setIsChargeModalOpen(false)
  }

  const handleDonate = async () => {
    if (!selectedAmount || !donationTargetPartnerId) return

    try {
      setIsLoading(true)

      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        toast.error('로그인이 필요합니다.')
        return
      }

      // 1. 현재 사용자의 포인트 확인
      const pointsResponse = await mateYouApi.members.getUserPoints()
      
      if (!pointsResponse.data.success || !pointsResponse.data.data) {
        throw new Error('포인트 조회에 실패했습니다.')
      }

      const currentPts = pointsResponse.data.data.points || 0

      if (currentPts < selectedAmount) {
        toast.error(`포인트가 부족합니다. (보유: ${currentPts.toLocaleString()}P)`)
        return
      }

      // 2. 파트너 정보 조회 (member_id로 partners.id 찾기)
      const { data: partnerData, error: partnerError } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', donationTargetPartnerId)
        .single()

      if (partnerError || !partnerData) {
        throw new Error('파트너 정보를 찾을 수 없습니다.')
      }

      const partnerPartnerId = partnerData.id

      // 3. 후원 API 호출
      const donationResponse = await mateYouApi.members.donation({
        partner_id: partnerPartnerId,
        amount: selectedAmount,
        description: `${donationTargetPartnerName || '파트너'} 후원`,
        log_id: `donation_${donationTargetPartnerId}_${Date.now()}`,
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
      if (currentUserId && donationTargetPartnerId) {
        try {
          const heartCount = Math.floor(selectedAmount / 1000)
          const selectedHeart = DONATION_OPTIONS.find(opt => opt.amount === selectedAmount)?.heart || '/icon/heart.png'
          const donationMessage = `[HEART_GIFT:${selectedHeart}:${heartCount}:${selectedAmount}]`
          await sendMessage(currentUserId, donationTargetPartnerId, donationMessage)
        } catch (error) {
          console.error('후원 메시지 전송 실패:', error)
        }
      }

      setDonatedAmount(selectedAmount)
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
      closeDonationSheet()
      // 상태 초기화
      setTimeout(() => {
        setSelectedAmount(null)
        setIsSuccess(false)
        setDonatedAmount(0)
      }, 300)
    }
  }

  const handleOptionSelect = (amount: number) => {
    setSelectedAmount(amount)
  }

  return (
    <>
      <SlideSheet
        isOpen={isDonationSheetOpen}
        onClose={handleClose}
        title={isSuccess ? '하트 전달 완료' : '하트 보내기'}
        initialHeight={0.55}
        minHeight={0.3}
        maxHeight={0.7}
        zIndex={200}
        footer={
          isSuccess ? (
            <Button
              variant="primary"
              onClick={handleClose}
              className="w-full bg-pink-500 hover:bg-pink-600"
            >
              확인
            </Button>
          ) : (
            <Flex gap={2}>
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
                disabled={!selectedAmount || isLoading}
                className="flex-1 bg-pink-500 hover:bg-pink-600"
              >
                {isLoading ? '처리 중...' : '후원하기'}
              </Button>
            </Flex>
          )
        }
      >
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
              <span className="font-semibold">{donationTargetPartnerName || '파트너'}</span>
              님에게{' '}
              <span className="font-semibold text-pink-600">
                {donatedAmount.toLocaleString()}P
              </span>
              를 후원했습니다.
            </Typography>
          </div>
        ) : (
          /* 후원 입력 화면 */
          <div className="px-4 pb-4 space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {DONATION_OPTIONS.map((option) => {
                const isSelected = selectedAmount === option.amount

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
                        className="w-14 h-14 object-contain"
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
            {selectedAmount && currentPoints < selectedAmount && (
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
                    <span>{selectedAmount.toLocaleString()}P</span>
                  </div>
                  <div className="flex justify-between">
                    <span>보유 포인트:</span>
                    <span>{currentPoints.toLocaleString()}P</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>부족 포인트:</span>
                    <span className="text-red-600">
                      {(selectedAmount - currentPoints).toLocaleString()}P
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </SlideSheet>

      {/* Charge Modal */}
      <ChargeModal
        isOpen={isChargeModalOpen}
        onClose={() => setIsChargeModalOpen(false)}
        onCharge={handleCharge}
        preselectedPoints={selectedAmount ? selectedAmount - currentPoints : null}
      />
    </>
  )
}

