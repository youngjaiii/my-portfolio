import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Database } from '@/types/database'
import {
  Button,
  Flex,
  Modal,
  PartnerApplicationForm,
  PartnerApplicationModal,
  Typography,
} from '@/components'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

type PartnerData = Database['public']['Tables']['partners']['Row']

interface PartnerApplicationStatusModalProps {
  isOpen: boolean
  onClose: () => void
  onShowToast?: (message: string, type: 'success' | 'error') => void
  onSuccess?: () => void
}

export function PartnerApplicationStatusModal({
  isOpen,
  onClose,
  onShowToast,
  onSuccess,
}: PartnerApplicationStatusModalProps) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [partnerData, setPartnerData] = useState<PartnerData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 파트너 데이터 가져오기 함수
  const fetchPartnerData = async () => {
    if (!user?.id) return

    try {
      setIsLoading(true)
      const { data, error } = await supabase
        .from('partners')
        .select('*')
        .eq('member_id', user.id)
        .maybeSingle()

      if (error && error.code !== 'PGRST116') {
        throw error
      }

      setPartnerData(data)
    } catch (err) {
      console.error('Error fetching partner data:', err)
      setError(
        err instanceof Error
          ? err.message
          : '파트너 정보를 가져오는 중 오류가 발생했습니다.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  // 초기 로드 및 모달이 열릴 때마다 데이터 새로고침
  useEffect(() => {
    if (!user?.id || !isOpen) return
    fetchPartnerData()
  }, [user?.id, isOpen])

  // 사용자 데이터를 초기 데이터 형태로 변환
  const getInitialData = () => {
    if (!user || !partnerData) return undefined

    const gameInfos = partnerData.game_info
      ? Array.isArray(partnerData.game_info)
        ? partnerData.game_info
        : [partnerData.game_info]
      : []

    return {
      partnerName: partnerData.partner_name || '',
      partnerMessage: partnerData.partner_message || '',
      profileImage: user.profile_image || '',
      favoriteGame: user.favorite_game || '',
      gameInfos: gameInfos,
      legalName: partnerData.legal_name || user.name || '',
      legalEmail: partnerData.legal_email || user.email || '',
      legalPhone: partnerData.legal_phone || '',
      payoutBankCode: partnerData.payout_bank_code || '',
      payoutBankName: partnerData.payout_bank_name || '',
      payoutAccountNumber: partnerData.payout_account_number || '',
      payoutAccountHolder: partnerData.payout_account_holder || '',
      businessType:
        (partnerData.tosspayments_business_type as
          | 'INDIVIDUAL'
          | 'INDIVIDUAL_BUSINESS'
          | 'CORPORATE'
          | undefined) || 'INDIVIDUAL',
    }
  }

  if (!user) return null

  const getStatusText = () => {
    const status = partnerData?.partner_status || 'none'
    switch (status) {
      case 'pending':
        return {
          title: '파트너 신청 검토중',
          description: '신청하신 파트너 정보를 검토 중입니다.',
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-200',
        }
      case 'approved':
        return {
          title: '파트너 승인 완료',
          description: '파트너로 승인되었습니다!',
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200',
        }
      case 'rejected':
        return {
          title: '파트너 신청 거절',
          description: '파트너 신청이 거절되었습니다. 다시 신청할 수 있습니다.',
          color: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
        }
      default:
        return {
          title: '신청 정보 없음',
          description: '파트너 신청 정보가 없습니다.',
          color: 'text-gray-600',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200',
        }
    }
  }

  const status = getStatusText()

  // 로딩 중인 경우
  if (isLoading) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="파트너 신청 현황"
        size="md"
      >
        <div className="flex items-center justify-center py-8">
          <Typography variant="body1">로딩 중...</Typography>
        </div>
      </Modal>
    )
  }

  // 에러가 발생한 경우
  if (error) {
    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="파트너 신청 현황"
        size="md"
      >
        <div className="space-y-4">
          <div className="p-4 rounded-lg border bg-red-50 border-red-200">
            <Typography variant="body1" className="text-red-800">
              {error}
            </Typography>
          </div>
          <Flex justify="end">
            <Button variant="outline" onClick={onClose}>
              닫기
            </Button>
          </Flex>
        </div>
      </Modal>
    )
  }

  // pending 상태이고 normal 역할인 경우 바로 수정 모드로 열기
  if (partnerData?.partner_status === 'pending' && user?.role === 'normal') {
    return (
      <PartnerApplicationModal
        isOpen={isOpen}
        onClose={onClose}
        onSuccess={() => {
          fetchPartnerData() // 파트너 데이터 새로고침
          // React Query 캐시 무효화로 다른 곳의 파트너 목록도 업데이트
          queryClient.invalidateQueries({ queryKey: ['members'] })
          queryClient.invalidateQueries({ queryKey: ['partner-details'] })
          onSuccess?.() // 기존 onSuccess 콜백 호출
        }}
        onShowToast={onShowToast}
        initialData={getInitialData()}
        mode="edit"
      />
    )
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="파트너 신청 현황" size="md">
      <div className="space-y-6">
        {/* 상태 표시 */}
        <div
          className={`p-4 rounded-lg border ${status.bgColor} ${status.borderColor}`}
        >
          <Typography variant="h5" className={`${status.color} mb-2`}>
            {status.title}
          </Typography>
          <Typography variant="body2" className={status.color}>
            {status.description}
          </Typography>
          {partnerData?.partner_applied_at && (
            <Typography
              variant="caption"
              color="text-secondary"
              className="mt-2 block"
            >
              신청일:{' '}
              {new Date(partnerData.partner_applied_at).toLocaleDateString(
                'ko-KR',
              )}
            </Typography>
          )}
          {partnerData?.partner_reviewed_at && (
            <Typography
              variant="caption"
              color="text-secondary"
              className="block"
            >
              검토일:{' '}
              {new Date(partnerData.partner_reviewed_at).toLocaleDateString(
                'ko-KR',
              )}
            </Typography>
          )}
        </div>

        {/* 신청 정보를 PartnerApplicationForm으로 표시 */}
        {partnerData && partnerData.partner_status !== 'none' && (
          <div className="space-y-4">
            <Typography variant="h6" className="border-b pb-2">
              신청 정보
            </Typography>
            <PartnerApplicationForm
              initialData={getInitialData()}
              mode="edit"
              showButtons={false}
              readOnly={true}
            />
          </div>
        )}

        {/* 버튼 영역 */}
        <Flex justify="end" gap={3}>
          <Button variant="outline" onClick={onClose}>
            닫기
          </Button>
        </Flex>
      </div>
    </Modal>
  )
}
