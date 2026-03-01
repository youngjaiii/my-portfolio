import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { Database } from '@/types/database'
import {
  Flex,
  Grid,
  Navigation,
  PartnerManagementSheet,
  PartnerApplicationStatusModal,
  PartnerCard,
  Typography,
} from '@/components'
import { useMembers } from '@/hooks/useMembers'
import { useAuth } from '@/hooks/useAuth'
import { toast } from '@/components/ui/sonner'
import { supabase } from '@/lib/supabase'

type PartnerData = Database['public']['Tables']['partners']['Row']

export const Route = createFileRoute('/partners/' as const)({
  component: PartnersPage,
})

function PartnersPage() {
  const { user, refreshUser } = useAuth()
  const { allPartners, isLoading, refetch } = useMembers()
  const [isApplicationSheetOpen, setIsApplicationSheetOpen] = useState(false)
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false)
  const [partnerData, setPartnerData] = useState<PartnerData | null>(null)
  const [partnerDataLoading, setPartnerDataLoading] = useState(true)

  // 파트너 데이터 새로고침 함수
  const refreshPartnerData = async () => {
    if (!user?.id) {
      setPartnerData(null)
      setPartnerDataLoading(false)
      return
    }

    try {
      setPartnerDataLoading(true)
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
    } finally {
      setPartnerDataLoading(false)
    }
  }

  // 사용자의 파트너 데이터 가져오기
  useEffect(() => {
    refreshPartnerData()
  }, [user?.id])

  // 파트너 신청 가능 여부 및 상태 메시지
  const getPartnerApplicationStatus = () => {
    if (!user) {
      return { canApply: false, message: '로그인 후 파트너 신청이 가능합니다.' }
    }

    if (user.role === 'partner') {
      return { canApply: false, message: '현재 파트너로 활동 중입니다.' }
    }

    if (user.role === 'admin') {
      return { canApply: false, message: '' } // 관리자는 메시지 표시 안함
    }

    // partnerData를 기반으로 상태 확인
    if (partnerData?.partner_status === 'pending') {
      return {
        canApply: false,
        showStatus: true,
        message: user.role === 'normal' ? '신청 내용 확인하기' : '신청 검토중',
      }
    }

    if (partnerData?.partner_status === 'approved') {
      return {
        canApply: false,
        showStatus: true,
        message: '파트너로 승인되었습니다.',
      }
    }

    if (partnerData?.partner_status === 'rejected') {
      return {
        canApply: true,
        showStatus: true,
        message: '파트너 신청이 거절되었습니다. 다시 신청할 수 있습니다.',
      }
    }

    return { canApply: true, message: '' }
  }

  const { canApply, showStatus, message } = getPartnerApplicationStatus()

  if (isLoading || partnerDataLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto p-6">
          <div className="flex items-center justify-center py-16">
            <Typography variant="h3">로딩 중...</Typography>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="container mx-auto p-6">
        <Typography variant="h2" className="mb-6">
          파트너 목록
        </Typography>

        {allPartners.length === 0 ? (
          <div className="text-center py-16">
            <Typography variant="h4" color="text-secondary" className="mb-4">
              현재 활동 중인 파트너가 없습니다
            </Typography>
            <Typography variant="body1" color="text-secondary">
              파트너 신청을 통해 첫 번째 파트너가 되어보세요!
            </Typography>
          </div>
        ) : (
          <Grid cols={1} mdCols={2} lgCols={3} gap={6}>
            {allPartners.map((partner) => (
              <PartnerCard key={partner.id} partner={partner} />
            ))}
          </Grid>
        )}

        {/* 파트너 신청 관련 영역 */}
        <div className="mt-8">
          {canApply ? (
            <Flex justify="end">
              <button
                onClick={() => setIsApplicationSheetOpen(true)}
                className="text-blue-300 hover:text-blue-400 cursor-pointer"
              >
                파트너 신청하기
              </button>
              <Typography variant="caption" className="text-gray-500 mt-1 block text-right">
                파트너 신청은 마이페이지에서도 진행할 수 있습니다.
              </Typography>
            </Flex>
          ) : showStatus ? (
            <Flex justify="end">
              <button
                onClick={() => setIsStatusModalOpen(true)}
                className="text-blue-300 hover:text-blue-400 cursor-pointer underline"
              >
                {message}
              </button>
            </Flex>
          ) : message ? (
            <Flex justify="end">
              <Typography variant="body2" color="text-secondary">
                {message}
              </Typography>
            </Flex>
          ) : null}
        </div>

        <PartnerManagementSheet
          isOpen={isApplicationSheetOpen}
          onClose={() => setIsApplicationSheetOpen(false)}
          onSuccess={() => {
            refreshUser()
            refetch()
            refreshPartnerData()
          }}
        />

        <PartnerApplicationStatusModal
          isOpen={isStatusModalOpen}
          onClose={() => setIsStatusModalOpen(false)}
          onShowToast={(message, type) => toast[type](message)}
          onSuccess={() => {
            // 성공 시 사용자 정보 및 데이터 새로고침
            refreshUser()
            refetch()
            refreshPartnerData()
          }}
        />
      </div>
    </div>
  )
}
