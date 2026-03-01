/**
 * StreamDonationSheetV2 - 확장된 스트림 후원 바텀시트
 *
 * 도네이션 타입 지원:
 * - basic: 일반 하트 후원
 * - mission: 미션 도네이션 (+ 미션 메시지)
 * - video: 영상 도네이션 (+ 유튜브 URL, 비디오룸만)
 * - roulette: 룰렛 도네이션 (룰렛판 선택, 고정 금액)
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
import { Check, Coins, Sparkles, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
    DONATION_TYPE_CONFIGS,
    DonationTypeSelector,
    MissionDonationInput,
    VideoDonationInput,
} from './donation'
import type {
    DonationType,
    RoomType,
    YoutubeVideoInfo,
} from './donation/types'
import type { ExecuteRouletteResponse, RouletteSettings, RouletteWheel } from './roulette/types'

// 후원 금액 옵션
const DONATION_OPTIONS = [
  { amount: 1000, heart: '/icon/heart.png' },
  { amount: 3000, heart: '/icon/heart2.png' },
  { amount: 5000, heart: '/icon/heart3.png' },
  { amount: 10000, heart: '/icon/heart4.png' },
  { amount: 30000, heart: '/icon/heart5.png' },
  { amount: 50000, heart: '/icon/heart6.png' },
]

/** 호스트 파트너 정보 (fallback용) */
interface HostPartnerInfo {
  id: string
  partner_name?: string
  member?: {
    id: string
    name: string
    profile_image?: string
  }
  follower_count?: number
}

interface StreamDonationSheetV2Props {
  isOpen: boolean
  onClose: () => void
  roomId: string
  hosts: StreamHost[]
  /** 룸 타입 (voice/video) */
  roomType: RoomType
  /** 호스트 파트너 정보 (hosts가 비어있을 때 fallback) */
  hostPartner?: HostPartnerInfo | null
}

export function StreamDonationSheetV2({
  isOpen,
  onClose,
  roomId,
  hosts,
  roomType,
  hostPartner,
}: StreamDonationSheetV2Props) {
  // 도네이션 타입
  const [donationType, setDonationType] = useState<DonationType>('basic')

  // 기본 상태
  const [selectedRecipient, setSelectedRecipient] = useState<
    string | 'all' | null
  >(null)
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isChargeModalOpen, setIsChargeModalOpen] = useState(false)
  const [currentPoints, setCurrentPoints] = useState(0)

  // 미션 도네이션 상태
  const [missionText, setMissionText] = useState('')

  // 영상 도네이션 상태
  const [videoUrl, setVideoUrl] = useState('')
  const [videoInfo, setVideoInfo] = useState<YoutubeVideoInfo | null>(null)

  // 룰렛 설정 상태
  const [rouletteSettings, setRouletteSettings] = useState<RouletteSettings | null>(null)
  const [selectedWheelId, setSelectedWheelId] = useState<string | null>(null)

  const queryClient = useQueryClient()
  const toast = useToast()
  const { user } = useAuth()

  // 현재 도네이션 타입의 최소 금액
  const minAmount = DONATION_TYPE_CONFIGS[donationType].minAmount

  // 선택 가능한 금액 옵션 (최소 금액 이상만)
  const availableAmountOptions = useMemo(() => {
    return DONATION_OPTIONS.filter((opt) => opt.amount >= minAmount)
  }, [minAmount])

  // 파트너인 발언자만 필터링 (후원 가능한 대상, 자기 자신 제외)
  // partner_id가 있으면 파트너로 간주 (일반 유저는 partner_id가 null)
  const partnerHosts = useMemo(() => {
    // 1. hosts 배열에서 파트너 필터링
    const filtered = hosts.filter((host) => {
      // partner_id가 있어야 함 (null이 아니면 파트너)
      if (!host.partner_id) {
        return false
      }
      
      // 자기 자신은 후원 대상에서 제외
      const hostMemberId = host.member_id || host.partner?.member?.id
      if (hostMemberId === user?.id) {
        return false
      }
      
      return true
    })
    
    // 2. hosts에서 파트너를 못 찾았고, hostPartner가 있으면 fallback으로 사용
    if (filtered.length === 0 && hostPartner?.id) {
      // 자기 자신이 호스트 파트너인 경우 제외
      const hostMemberId = hostPartner.member?.id
      if (hostMemberId === user?.id) {
        return []
      }
      
      // hostPartner를 StreamHost 형태로 변환
      const fallbackHost: StreamHost = {
        id: `fallback-${hostPartner.id}`,
        room_id: roomId,
        partner_id: hostPartner.id,
        member_id: hostPartner.member?.id || null,
        role: 'owner',
        joined_at: new Date().toISOString(),
        left_at: null,
        member: hostPartner.member ? {
          id: hostPartner.member.id,
          name: hostPartner.member.name,
          profile_image: hostPartner.member.profile_image || '',
        } : undefined,
        partner: {
          id: hostPartner.id,
          partner_name: hostPartner.partner_name || hostPartner.member?.name || '파트너',
          member: {
            id: hostPartner.member?.id || '',
            name: hostPartner.member?.name || '파트너',
            profile_image: hostPartner.member?.profile_image || '',
          },
        },
      }
      
      return [fallbackHost]
    }
    
    return filtered
  }, [hosts, user?.id, hostPartner, roomId])

  // 선택된 룰렛판
  const selectedWheel = useMemo(() => {
    if (!rouletteSettings || !selectedWheelId) return null
    return rouletteSettings.wheels.find((w) => w.id === selectedWheelId) || null
  }, [rouletteSettings, selectedWheelId])

  // 총 후원 금액 계산
  const totalAmount = useMemo(() => {
    // 룰렛 도네이션: 선택된 룰렛판의 고정 금액
    if (donationType === 'roulette') {
      if (!selectedWheel) return 0
      if (selectedRecipient === 'all') {
        return selectedWheel.price * partnerHosts.length
      }
      return selectedWheel.price
    }

    // 일반 도네이션
    if (!selectedAmount) return 0
    if (selectedRecipient === 'all') {
      return selectedAmount * partnerHosts.length
    }
    return selectedAmount
  }, [donationType, selectedAmount, selectedRecipient, partnerHosts.length, selectedWheel])

  // 현재 포인트 및 룰렛 설정 로드
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
        const partnerId = partnerHosts[0].partner_id || partnerHosts[0].partner?.id
        if (partnerId) {
          setSelectedRecipient(partnerId)
        }
      }
    }
  }, [isOpen, partnerHosts])

  // 선택된 발언자가 바뀌면 룰렛 설정 로드
  useEffect(() => {
    const loadRouletteSettings = async () => {
      // 선택된 발언자의 파트너 ID
      let targetPartnerId: string | null = null

      if (selectedRecipient === 'all') {
        // 모두 선택 시 첫 번째 파트너의 룰렛 사용
        targetPartnerId = partnerHosts[0]?.partner_id || partnerHosts[0]?.partner?.id || null
      } else if (selectedRecipient) {
        targetPartnerId = selectedRecipient
      }

      if (!targetPartnerId) {
        setRouletteSettings(null)
        return
      }

      try {
        // 설정 조회
        const { data: settingsData, error: settingsError } = await supabase
          .from('partner_roulette_settings')
          .select('*')
          .eq('partner_id', targetPartnerId)
          .single()
        
        const is_enabled = settingsError ? false : settingsData?.is_enabled ?? false

        // 룰렛판 조회 (방송용만: stream 또는 both)
        const { data: wheelsData, error: wheelsError } = await supabase
          .from('partner_roulette_wheels')
          .select('*')
          .eq('partner_id', targetPartnerId)
          .eq('is_active', true)
          .in('wheel_type', ['stream', 'both'])
          .order('sort_order', { ascending: true })

        if (wheelsError) {
          console.error('룰렛판 조회 실패:', wheelsError)
        }

        const wheels: RouletteWheel[] = []
        
        if (wheelsData && wheelsData.length > 0) {
          const wheelIds = wheelsData.map((w) => w.id)
          
          const { data: itemsData, error: itemsError } = await supabase
            .from('partner_roulette_items')
            .select('*')
            .in('wheel_id', wheelIds)
            .eq('is_active', true)
            .order('sort_order', { ascending: true })

          if (itemsError) {
            console.error('아이템 조회 실패:', itemsError)
          }

          for (const wheel of wheelsData) {
            const items = (itemsData || []).filter((item) => item.wheel_id === wheel.id)
            // 아이템이 있는 룰렛판만 추가
            if (items.length > 0) {
              wheels.push({
                ...wheel,
                items,
              })
            }
          }
        }

        const is_valid = wheels.length > 0

        setRouletteSettings({
          is_enabled,
          wheels,
          is_valid,
        })
        
        // 룰렛판 선택 초기화
        setSelectedWheelId(null)
        
      } catch (error) {
        console.error('🎰 룰렛 설정 조회 실패:', error)
        setRouletteSettings(null)
      }
    }

    if (isOpen && selectedRecipient) {
      loadRouletteSettings()
    }
  }, [isOpen, selectedRecipient, partnerHosts])

  // 타입 변경 시 상태 초기화
  useEffect(() => {
    if (donationType === 'roulette') {
      setSelectedAmount(null) // 룰렛은 금액 선택 안함
      setSelectedWheelId(null)
      // 룰렛은 "모두"에게 후원 불가 - 선택 해제
      if (selectedRecipient === 'all') {
        setSelectedRecipient(null)
      }
    } else {
      setSelectedWheelId(null)
      // 최소 금액 미만이면 금액 초기화
      if (selectedAmount && selectedAmount < minAmount) {
        setSelectedAmount(null)
      }
    }
  }, [donationType, minAmount, selectedRecipient])

  const handleCharge = async () => {
    setIsChargeModalOpen(false)
    try {
      const response = await mateYouApi.members.getUserPoints()
      if (response.data.success && response.data.data) {
        setCurrentPoints(response.data.data.points || 0)
      }
    } catch (error) {
      console.error('포인트 조회 실패:', error)
    }
  }

  // 도네이션 유효성 검사
  const validateDonation = (): string | null => {
    if (!selectedRecipient) return '후원할 발언자를 선택해주세요.'

    // 룰렛 도네이션
    if (donationType === 'roulette') {
      if (!selectedWheelId) return '룰렛판을 선택해주세요.'
      if (!selectedWheel) return '룰렛판을 찾을 수 없습니다.'
      if (currentPoints < totalAmount) {
        return `포인트가 부족합니다. (필요: ${totalAmount.toLocaleString()}P)`
      }
      return null
    }

    // 일반 도네이션
    if (!selectedAmount) return '금액을 선택해주세요.'
    if (selectedAmount < minAmount)
      return `${DONATION_TYPE_CONFIGS[donationType].label} 도네이션은 최소 ${minAmount.toLocaleString()}P 이상 후원해주세요.`
    if (currentPoints < totalAmount)
      return `포인트가 부족합니다. (필요: ${totalAmount.toLocaleString()}P)`

    // 미션 도네이션 검증
    if (donationType === 'mission' && !missionText.trim()) {
      return '미션 내용을 입력해주세요.'
    }

    // 영상 도네이션 검증
    if (donationType === 'video') {
      if (!videoUrl.trim()) return '유튜브 링크를 입력해주세요.'
      if (!videoInfo) return '유효한 유튜브 링크를 입력해주세요.'
    }

    return null
  }

  const handleDonate = async () => {
    const error = validateDonation()
    if (error) {
      toast.error(error)
      return
    }

    try {
      setIsLoading(true)

      // 후원 대상 결정
      const recipients =
        selectedRecipient === 'all'
          ? partnerHosts
          : partnerHosts.filter((h) => (h.partner_id || h.partner?.id) === selectedRecipient)

      if (recipients.length === 0) {
        toast.error('후원 대상을 찾을 수 없습니다.')
        return
      }

      // 금액 결정
      const donationAmount = donationType === 'roulette' 
        ? selectedWheel!.price 
        : selectedAmount!

      // 선택된 하트 이미지 찾기
      const selectedOption = DONATION_OPTIONS.find(
        (opt) => opt.amount === donationAmount
      )
      const heartImage = selectedOption?.heart || '/icon/heart.png'

      // 룰렛 도네이션 여부
      const isRouletteType = donationType === 'roulette'

      // 각 파트너에게 후원
      const donationPromises = recipients.map(async (host) => {
        const partnerId = host.partner_id || host.partner?.id
        if (!partnerId) return

        const logId = `stream_donation_${roomId}_${partnerId}_${user?.id}_${Date.now()}`

        const partnerName = host.partner?.partner_name || host.member?.name || '파트너'

        // 1. 포인트 후원 API 호출 (방송 후원 전용 엔드포인트)
        // 미션 후원 시 donation_type='mission' 전달하여 escrow 처리 활성화
        // 룰렛은 포인트 처리상 'basic'으로 처리하되, stream_donations에는 'roulette'로 기록
        const apiDonationType = donationType === 'roulette' ? 'basic' : donationType;
        await mateYouApi.stream.donation({
          partner_id: partnerId,
          amount: donationAmount,
          description: `${partnerName} 스트림 후원 (${DONATION_TYPE_CONFIGS[donationType].label}${isRouletteType && selectedWheel ? `: ${selectedWheel.name}` : ''})`,
          log_id: logId,
          donation_type: apiDonationType,
          room_id: roomId,
        })

        // 2. stream_donations 테이블에 기록
        const streamDonations = () =>
          supabase.from('stream_donations') as ReturnType<
            typeof supabase.from<'stream_donations'>
          >
        const { data: insertedDonation, error: insertError } = await streamDonations()
          .insert({
            room_id: roomId,
            donor_id: user?.id,
            recipient_partner_id: partnerId,
            amount: donationAmount,
            heart_image: heartImage,
            log_id: logId,
            // 새 필드
            donation_type: donationType,
            status: donationType === 'basic' || donationType === 'roulette' ? 'completed' : 'pending',
            mission_text: donationType === 'mission' ? missionText : null,
            video_url: donationType === 'video' ? videoUrl : null,
            video_title: donationType === 'video' ? videoInfo?.title : null,
            video_thumbnail:
              donationType === 'video' ? videoInfo?.thumbnail : null,
            // 미션 후원 시 escrow_amount 설정 (포인트가 보관 중임을 표시)
            escrow_amount: donationType === 'mission' ? donationAmount : 0,
          } as Record<string, unknown>)
          .select('id')
          .single()

        if (insertError) {
          console.error('스트림 후원 기록 실패:', insertError)
        }

        // 3. 룰렛 실행 (룰렛 타입인 경우)
        if (isRouletteType && insertedDonation?.id && selectedWheelId) {
          try {
            console.log('🎰 [룰렛 실행] 파라미터:', {
              p_donation_id: insertedDonation.id,
              p_room_id: roomId,
              p_donor_id: user?.id,
              p_partner_id: partnerId,
              p_donation_amount: donationAmount,
              p_wheel_id: selectedWheelId,
            })

            const { data: rouletteResult, error: rouletteError } = await supabase.rpc('execute_donation_roulette', {
              p_donation_id: insertedDonation.id,
              p_room_id: roomId,
              p_donor_id: user?.id,
              p_partner_id: partnerId,
              p_donation_amount: donationAmount,
              p_wheel_id: selectedWheelId,
            })

            if (rouletteError) {
              console.error('🎰 [룰렛 실행] RPC 에러:', rouletteError)
              toast.error(rouletteError.message || '룰렛을 실행할 수 없습니다.')
            } else {
              console.log('🎰 [룰렛 실행] 결과:', rouletteResult)
              const result = rouletteResult as ExecuteRouletteResponse
              if (result?.success) {
                // Realtime으로 자동 전파되므로 별도 처리 불필요
                console.log('🎰 [룰렛 실행] 성공:', result)
              } else {
                console.error('🎰 [룰렛 실행] 실패:', result)
                const errorMessage = result?.error || result?.detail || '룰렛을 실행할 수 없습니다.'
                console.error('🎰 [룰렛 실행] 에러 상세:', {
                  error: result?.error,
                  detail: result?.detail,
                  fullResult: result,
                })
                toast.error(errorMessage)
              }
            }
          } catch (rouletteError) {
            console.error('🎰 [룰렛 실행] 예외 발생:', rouletteError)
            toast.error(
              rouletteError instanceof Error ? rouletteError.message : '알 수 없는 오류가 발생했습니다.'
            )
          }
        }

        // 4. 채팅에 후원 시스템 메시지 전송
        const streamChats = () =>
          supabase.from('stream_chats') as ReturnType<
            typeof supabase.from<'stream_chats'>
          >
        const donorName = user?.name || '익명'

        let donationMessage = `🎁 ${donorName} 님이 ${partnerName} 님에게 ${donationAmount.toLocaleString()}P를 후원했습니다!`
        if (donationType === 'mission') {
          donationMessage = `🎯 ${donorName} 님의 미션 도네이션! ${partnerName} 님에게 ${donationAmount.toLocaleString()}P (미션: ${missionText})`
        } else if (donationType === 'video') {
          donationMessage = `🎬 ${donorName} 님의 영상 도네이션! ${partnerName} 님에게 ${donationAmount.toLocaleString()}P`
        } else if (donationType === 'roulette' && selectedWheel) {
          donationMessage = `🎰 ${donorName} 님이 "${selectedWheel.name}" 룰렛을 돌렸습니다! (${donationAmount.toLocaleString()}P)`
        }

        await streamChats().insert({
          room_id: roomId,
          sender_id: user?.id,
          content: donationMessage,
          chat_type: 'donation',
        } as Record<string, unknown>)
      })

      await Promise.all(donationPromises)

      // 쿼리 무효화
      await queryClient.invalidateQueries({ queryKey: ['member-points'] })
      await queryClient.invalidateQueries({
        queryKey: ['member-points-history'],
      })
      await queryClient.invalidateQueries({ queryKey: ['user'] })
      await queryClient.invalidateQueries({
        queryKey: ['donation-queue', roomId],
      })
      await queryClient.invalidateQueries({
        queryKey: ['today-donations', roomId],
      })

      // 성공 토스트
      const recipientName =
        selectedRecipient === 'all'
          ? `${partnerHosts.length}명의 발언자`
          : (recipients[0]?.partner?.partner_name || recipients[0]?.member?.name || '파트너')
      
      if (donationType === 'mission') {
        toast.success(
          `미션 후원이 신청되었습니다! ${totalAmount.toLocaleString()}P가 임시 보관됩니다.`
        )
      } else {
        toast.success(
          `${recipientName}에게 ${totalAmount.toLocaleString()}P를 후원했습니다!`
        )
      }

      // 시트 닫기
      handleClose()
    } catch (error) {
      console.error('후원 실패:', error)
      toast.error(
        error instanceof Error ? error.message : '후원에 실패했습니다.'
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
        setDonationType('basic')
        setSelectedRecipient(null)
        setSelectedAmount(null)
        setSelectedWheelId(null)
        setMissionText('')
        setVideoUrl('')
        setVideoInfo(null)
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
        initialHeight={0.85}
        minHeight={0.5}
        maxHeight={0.95}
        zIndex={200}
        modalWidth={480}
        footer={
          <div className="space-y-3">
            {/* 총 금액 표시 */}
            {totalAmount > 0 && selectedRecipient && (
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
                disabled={
                  (donationType === 'roulette' ? !selectedWheelId : !selectedAmount) ||
                  !selectedRecipient ||
                  isLoading ||
                  currentPoints < totalAmount
                }
                className="flex-1 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600"
              >
                {isLoading ? '처리 중...' : donationType === 'roulette' ? '룰렛 돌리기' : '후원하기'}
              </Button>
            </Flex>
          </div>
        }
      >
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

          {/* 도네이션 타입 선택 */}
          <div>
            <Typography
              variant="body2"
              className="font-medium text-gray-700 mb-2"
            >
              후원 타입
            </Typography>
            <DonationTypeSelector
              selectedType={donationType}
              onSelect={setDonationType}
              roomType={roomType}
              isRouletteEnabled={rouletteSettings?.is_enabled && rouletteSettings?.is_valid}
            />
          </div>

          {/* 발언자 선택 */}
          <div>
            <Typography
              variant="body2"
              className="font-medium text-gray-700 mb-2"
            >
              후원할 발언자
            </Typography>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {/* 모두에게 옵션 (2명 이상일 때만, 룰렛 도네이션 제외) */}
              {partnerHosts.length > 1 && donationType !== 'roulette' && (
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
                // partner_id를 직접 사용 (partner 객체가 없어도 partner_id는 있음)
                const partnerId = host.partner_id || host.partner?.id
                const partnerName = host.partner?.partner_name || host.member?.name || '파트너'
                const profileImage =
                  host.partner?.member?.profile_image ||
                  host.member?.profile_image
                const isSelected = selectedRecipient === partnerId

                if (!partnerId) return null

                return (
                  <button
                    key={host.id}
                    onClick={() => setSelectedRecipient(partnerId)}
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

          {/* 룰렛판 선택 (룰렛 도네이션일 때) */}
          {donationType === 'roulette' && rouletteSettings && rouletteSettings.wheels.length > 0 && (
            <div>
              <Typography
                variant="body2"
                className="font-medium text-gray-700 mb-2"
              >
                룰렛 선택
              </Typography>
              <div className="space-y-2">
                {rouletteSettings.wheels.map((wheel) => {
                  const isSelected = selectedWheelId === wheel.id
                  const itemCount = wheel.items?.length || 0
                  const canAfford = currentPoints >= wheel.price

                  return (
                    <button
                      key={wheel.id}
                      onClick={() => setSelectedWheelId(wheel.id)}
                      disabled={!canAfford}
                      className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                        isSelected
                          ? 'border-amber-500 bg-amber-50'
                          : canAfford
                            ? 'border-gray-200 hover:border-amber-300'
                            : 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
                      }`}
                    >
                      {/* 금액 뱃지 */}
                      <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl shadow-md ${
                        isSelected 
                          ? 'bg-gradient-to-br from-amber-500 to-orange-500' 
                          : 'bg-gradient-to-br from-pink-500 to-orange-400'
                      } text-white`}>
                        <Coins className="h-6 w-6" />
                      </div>

                      {/* 정보 */}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-800">{wheel.name}</p>
                        <p className={`text-lg font-bold ${isSelected ? 'text-amber-600' : 'text-pink-500'}`}>
                          {wheel.price.toLocaleString()}P
                        </p>
                        <p className="text-xs text-gray-500">
                          {itemCount}개 아이템
                          {wheel.description && ` · ${wheel.description}`}
                        </p>
                      </div>

                      {/* 선택 표시 */}
                      {isSelected && (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500">
                          <Check className="h-4 w-4 text-white" />
                        </div>
                      )}
                      {!canAfford && (
                        <span className="text-xs text-red-500 font-medium">포인트 부족</span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* 선택한 룰렛판 미리보기 */}
              {selectedWheel && selectedWheel.items && selectedWheel.items.length > 0 && (
                <div className="mt-4 p-3 bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-medium text-amber-800">당첨 항목</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedWheel.items.filter(item => item.is_active).map((item) => (
                      <span
                        key={item.id}
                        className="px-2 py-1 text-xs font-medium rounded-full text-white shadow-sm"
                        style={{ backgroundColor: item.color }}
                      >
                        {item.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 금액 선택 (일반 도네이션일 때) */}
          {donationType !== 'roulette' && (
            <div>
              <Typography
                variant="body2"
                className="font-medium text-gray-700 mb-2"
              >
                후원 금액{' '}
                <span className="text-xs text-gray-400">
                  (최소 {minAmount.toLocaleString()}P)
                </span>
              </Typography>
              <div className="grid grid-cols-3 gap-2">
                {availableAmountOptions.map((option) => {
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
          )}

          {/* 미션 도네이션 입력 */}
          {donationType === 'mission' && (
            <MissionDonationInput
              missionText={missionText}
              onMissionTextChange={setMissionText}
            />
          )}

          {/* 영상 도네이션 입력 */}
          {donationType === 'video' && (
            <VideoDonationInput
              videoUrl={videoUrl}
              onVideoUrlChange={setVideoUrl}
              videoInfo={videoInfo}
              onVideoInfoChange={setVideoInfo}
            />
          )}

          {/* 포인트 부족 알림 */}
          {totalAmount > 0 && currentPoints < totalAmount && (
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
        preselectedPoints={
          totalAmount > currentPoints ? totalAmount - currentPoints : null
        }
      />
    </>
  )
}
