/**
 * 스트림 후원 바텀시트
 * 보이스룸/비디오룸에서 발언자(파트너)에게 포인트 후원
 */

import { ChargeModal } from '@/components/modals/ChargeModal'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Flex } from '@/components/ui/Flex'
import { SlideSheet } from '@/components/ui/SlideSheet'
import { Typography } from '@/components/ui/Typography'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import type { StreamHost } from '@/hooks/useVoiceRoom'
import { mateYouApi } from '@/lib/apiClient'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { Check, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

/** 후원 이펙트 이벤트 (다른 참가자에게 브로드캐스트) */
export interface DonationBroadcastEvent {
  donorId: string
  donorName: string
  donorProfileImage: string | null
  recipientPartnerId: string
  recipientName: string
  amount: number
  heartImage: string
  message?: string
  timestamp: number
}

// 후원 금액 옵션
const DONATION_OPTIONS = [
  { amount: 1000, heart: '/icon/heart.png' },
  { amount: 3000, heart: '/icon/heart2.png' },
  { amount: 5000, heart: '/icon/heart3.png' },
  { amount: 10000, heart: '/icon/heart4.png' },
  { amount: 30000, heart: '/icon/heart5.png' },
  { amount: 50000, heart: '/icon/heart6.png' },
]

const MIN_DONATION_AMOUNT = 1000

interface StreamDonationSheetProps {
  isOpen: boolean
  onClose: () => void
  roomId: string
  hosts: StreamHost[]
}

export function StreamDonationSheet({
  isOpen,
  onClose,
  roomId,
  hosts,
}: StreamDonationSheetProps) {
  const [selectedRecipient, setSelectedRecipient] = useState<string | 'all' | null>(null)
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isChargeModalOpen, setIsChargeModalOpen] = useState(false)
  const [currentPoints, setCurrentPoints] = useState(0)
  
  const queryClient = useQueryClient()
  const toast = useToast()
  const { user } = useAuth()

  // 파트너인 발언자만 필터링 (후원 가능한 대상)
  const partnerHosts = useMemo(() => {
    return hosts.filter(host => host.partner_id !== null && host.partner)
  }, [hosts])

  // 총 후원 금액 계산
  const totalAmount = useMemo(() => {
    if (!selectedAmount) return 0
    if (selectedRecipient === 'all') {
      return selectedAmount * partnerHosts.length
    }
    return selectedAmount
  }, [selectedAmount, selectedRecipient, partnerHosts.length])

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

    if (isOpen) {
      loadPoints()
      // 파트너가 1명뿐이면 자동 선택
      if (partnerHosts.length === 1) {
        setSelectedRecipient(partnerHosts[0].partner!.id)
      }
    }
  }, [isOpen, partnerHosts])

  const handleCharge = async () => {
    setIsChargeModalOpen(false)
    // 충전 완료 후 포인트 다시 로드
    try {
      const response = await mateYouApi.members.getUserPoints()
      if (response.data.success && response.data.data) {
        setCurrentPoints(response.data.data.points || 0)
      }
    } catch (error) {
      console.error('포인트 조회 실패:', error)
    }
  }

  const handleDonate = async () => {
    if (!selectedAmount || !selectedRecipient) return
    if (selectedAmount < MIN_DONATION_AMOUNT) {
      toast.error(`최소 ${MIN_DONATION_AMOUNT.toLocaleString()}P 이상 후원해주세요.`)
      return
    }

    // 총 필요 금액 확인
    if (currentPoints < totalAmount) {
      toast.error(`포인트가 부족합니다. (필요: ${totalAmount.toLocaleString()}P)`)
      return
    }

    try {
      setIsLoading(true)

      // 후원 대상 결정
      const recipients = selectedRecipient === 'all'
        ? partnerHosts
        : partnerHosts.filter(h => h.partner?.id === selectedRecipient)

      if (recipients.length === 0) {
        toast.error('후원 대상을 찾을 수 없습니다.')
        return
      }

      // 선택된 하트 이미지 찾기
      const selectedOption = DONATION_OPTIONS.find(opt => opt.amount === selectedAmount)
      const heartImage = selectedOption?.heart || '/icon/heart.png'

      // 각 파트너에게 후원
      const donationPromises = recipients.map(async (host) => {
        if (!host.partner?.id) return

        const logId = `stream_donation_${roomId}_${host.partner.id}_${user?.id}_${Date.now()}`
        
        // 1. 포인트 후원 API 호출 (방송 후원 전용 엔드포인트)
        await mateYouApi.stream.donation({
          partner_id: host.partner.id,
          amount: selectedAmount,
          description: `${host.partner.partner_name} 스트림 후원`,
          log_id: logId,
          donation_type: 'basic', // 기본 후원 타입
          room_id: roomId,
        })

        // 2. stream_donations 테이블에 기록 (Realtime 이벤트 발생 → 이펙트 표시)
        const streamDonations = () => supabase.from('stream_donations') as any
        const { error: insertError } = await streamDonations()
          .insert({
            room_id: roomId,
            donor_id: user?.id,
            recipient_partner_id: host.partner.id,
            amount: selectedAmount,
            heart_image: heartImage,
            log_id: logId,
            donation_type: 'basic', // 기본 후원 타입
            status: 'completed', // 일반 후원은 즉시 완료
          })

        if (insertError) {
          console.error('스트림 후원 기록 실패:', insertError)
        }

        // 3. 채팅에 후원 시스템 메시지 전송
        const streamChats = () => supabase.from('stream_chats') as any
        const donorName = user?.name || '익명'
        const partnerName = host.partner.partner_name || '파트너'
        const donationMessage = `🎁 ${donorName} 님이 ${partnerName} 님에게 ${selectedAmount.toLocaleString()}P를 후원했습니다!`
        
        await streamChats().insert({
          room_id: roomId,
          sender_id: user?.id,
          content: donationMessage,
          chat_type: 'donation',
        })
      })

      await Promise.all(donationPromises)

      // 쿼리 무효화
      await queryClient.invalidateQueries({ queryKey: ['member-points'] })
      await queryClient.invalidateQueries({ queryKey: ['member-points-history'] })
      await queryClient.invalidateQueries({ queryKey: ['user'] })

      // 성공 토스트 표시 (이펙트는 Realtime으로 자동 수신됨)
      const recipientName = selectedRecipient === 'all'
        ? `${partnerHosts.length}명의 발언자`
        : recipients[0]?.partner?.partner_name || '파트너'
      toast.success(`${recipientName}에게 ${totalAmount.toLocaleString()}P를 후원했습니다!`)

      // 시트 닫기
      handleClose()
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
      // 상태 초기화
      setTimeout(() => {
        setSelectedRecipient(null)
        setSelectedAmount(null)
      }, 300)
    }
  }

  // 후원 가능한 파트너가 없는 경우
  if (partnerHosts.length === 0) {
    return (
      <SlideSheet
        isOpen={isOpen}
        onClose={handleClose}
        title="후원하기"
        initialHeight={0.35}
        minHeight={0.2}
        maxHeight={0.5}
        zIndex={200}
      >
        <div className="px-4 pb-6 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-gray-400" />
          </div>
          <Typography variant="body1" color="text-secondary">
            후원 가능한 발언자가 없습니다.
          </Typography>
          <Typography variant="body2" color="text-disabled" className="mt-1">
            파트너인 발언자에게만 후원할 수 있습니다.
          </Typography>
        </div>
      </SlideSheet>
    )
  }

  return (
    <>
      <SlideSheet
        isOpen={isOpen}
        onClose={handleClose}
        title="후원하기"
        initialHeight={0.7}
        minHeight={0.4}
        maxHeight={0.85}
        zIndex={200}
        footer={
          <div className="space-y-3">
            {/* 총 금액 표시 */}
            {selectedAmount && selectedRecipient && (
              <div className="flex justify-between items-center px-1">
                <span className="text-sm text-gray-500">총 후원 금액</span>
                <span className="text-lg font-bold text-[#FE3A8F]">
                  {totalAmount.toLocaleString()}P
                </span>
              </div>
            )}
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
                disabled={!selectedAmount || !selectedRecipient || isLoading || currentPoints < totalAmount}
                className="flex-1 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600"
              >
                {isLoading ? '처리 중...' : '후원하기'}
              </Button>
            </Flex>
          </div>
        }
      >
        {/* 후원 입력 화면 */}
        <div className="px-4 pb-4 space-y-5">
            {/* 보유 포인트 */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">보유 포인트</span>
                <span className="text-base font-bold text-[#110f1a]">
                  {currentPoints.toLocaleString()}P
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsChargeModalOpen(true)}
                className="text-xs"
              >
                충전
              </Button>
            </div>

            {/* 발언자 선택 */}
            <div>
              <Typography variant="body2" className="font-medium text-gray-700 mb-2">
                후원할 발언자
              </Typography>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {/* 모두에게 옵션 (2명 이상일 때만) */}
                {partnerHosts.length > 1 && (
                  <button
                    onClick={() => setSelectedRecipient('all')}
                    className={`flex-shrink-0 flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all min-w-[72px] ${
                      selectedRecipient === 'all'
                        ? 'border-orange-500 bg-orange-50'
                        : 'border-gray-200 hover:border-orange-300'
                    }`}
                  >
                    <div className="relative w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center">
                      <Users className="w-6 h-6 text-white" />
                      {selectedRecipient === 'all' && (
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </div>
                    <span className="text-xs font-medium text-gray-700 truncate max-w-[64px]">
                      모두
                    </span>
                    <span className="text-[10px] text-gray-500">
                      {partnerHosts.length}명
                    </span>
                  </button>
                )}
                
                {/* 개별 발언자 */}
                {partnerHosts.map((host) => {
                  const partnerId = host.partner?.id
                  const partnerName = host.partner?.partner_name || '파트너'
                  const profileImage = host.partner?.member?.profile_image || host.member?.profile_image
                  const isSelected = selectedRecipient === partnerId

                  return (
                    <button
                      key={host.id}
                      onClick={() => setSelectedRecipient(partnerId || null)}
                      className={`flex-shrink-0 flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all min-w-[72px] ${
                        isSelected
                          ? 'border-orange-500 bg-orange-50'
                          : 'border-gray-200 hover:border-orange-300'
                      }`}
                    >
                      <div className="relative">
                        <Avatar
                          src={profileImage}
                          name={partnerName}
                          size="md"
                        />
                        {isSelected && (
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </div>
                      <span className="text-xs font-medium text-gray-700 truncate max-w-[64px]">
                        {partnerName}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 금액 선택 */}
            <div>
              <Typography variant="body2" className="font-medium text-gray-700 mb-2">
                후원 금액
              </Typography>
              <div className="grid grid-cols-3 gap-2">
                {DONATION_OPTIONS.map((option) => {
                  const isSelected = selectedAmount === option.amount

                  return (
                    <button
                      key={option.amount}
                      onClick={() => setSelectedAmount(option.amount)}
                      className={`
                        py-3 px-2 rounded-xl border-2 transition-all hover:scale-[1.02]
                        ${
                          isSelected
                            ? 'border-orange-500 bg-orange-50 shadow-lg shadow-orange-200'
                            : 'border-gray-200 hover:border-orange-300'
                        }
                      `}
                    >
                      <div className="flex flex-col items-center gap-1.5">
                        <img 
                          src={option.heart} 
                          alt="하트" 
                          className="w-12 h-12 object-contain"
                        />
                        <span className="text-xs font-semibold text-white bg-gradient-to-r from-amber-400 to-orange-500 px-2 py-0.5 rounded-full">
                          {option.amount.toLocaleString()}P
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 포인트 부족 알림 */}
            {totalAmount > 0 && currentPoints < totalAmount && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <Flex justify="between" align="center" className="mb-2">
                  <Typography variant="body2" className="text-red-800 font-medium">
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
                    <span>{totalAmount.toLocaleString()}P</span>
                  </div>
                  <div className="flex justify-between">
                    <span>보유 포인트:</span>
                    <span>{currentPoints.toLocaleString()}P</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>부족 포인트:</span>
                    <span className="text-red-600">
                      {(totalAmount - currentPoints).toLocaleString()}P
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
      </SlideSheet>

      {/* Charge Modal */}
      <ChargeModal
        isOpen={isChargeModalOpen}
        onClose={() => setIsChargeModalOpen(false)}
        onCharge={handleCharge}
        preselectedPoints={totalAmount > currentPoints ? totalAmount - currentPoints : null}
      />
    </>
  )
}

