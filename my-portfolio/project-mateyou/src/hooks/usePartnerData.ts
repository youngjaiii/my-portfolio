import { useEffect, useState } from 'react'
import type { Database } from '@/types/database'
import { mateYouApi } from '@/lib/apiClient'
import { supabase } from '@/lib/supabase'

type MemberData = Database['public']['Tables']['members']['Row']
type PartnerData = Database['public']['Tables']['partners']['Row']
type PartnerPointsLog =
  Database['public']['Tables']['partner_points_logs']['Row']

// partner_business_info 타입 정의
export interface PartnerBusinessInfo {
  id: number
  partner_id: string
  tax?: number | null
  legal_name?: string | null
  legal_email?: string | null
  legal_phone?: string | null
  payout_bank_code?: string | null
  payout_bank_name?: string | null
  payout_account_number?: string | null
  payout_account_holder?: string | null
  business_type?: string | null
  default_distribution_rate?: number | null
  collaboration_distribution_rate?: number | null
  tosspayments_seller_id?: string | null
  tosspayments_status?: string | null
  tosspayments_synced_at?: string | null
  tosspayments_business_type?: string | null
  created_at?: string
  updated_at?: string
}

// 합친 파트너 데이터 타입
interface PartnerFullData extends MemberData {
  partner_data: PartnerData & {
    partner_business_info?: PartnerBusinessInfo | null
  }
}

export interface PendingWithdrawals {
  total: number
  byType: {
    total_points: number
    store_points: number
    collaboration_store_points: number
  }
}

export function usePartnerData(userId: string) {
  const [partnerData, setPartnerData] = useState<PartnerFullData | null>(null)
  const [pointHistory, setPointHistory] = useState<Array<PartnerPointsLog>>([])
  const [pendingWithdrawals, setPendingWithdrawals] = useState<PendingWithdrawals>({
    total: 0,
    byType: { total_points: 0, store_points: 0, collaboration_store_points: 0 }
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // partnerId를 한 번만 가져오는 헬퍼 함수
  const getPartnerId = async (): Promise<string | null> => {
    try {
      const response = await mateYouApi.partners.getPartnerIdByMemberId(userId)
      if (response.data.success && response.data.data && typeof response.data.data === 'object' && 'id' in response.data.data) {
        return (response.data.data as { id: string }).id
      }
      return null
    } catch {
      return null
    }
  }

  useEffect(() => {
    if (!userId) {
      setIsLoading(false)
      return
    }

    const loadData = async () => {
      setIsLoading(true)
      try {
        // partnerId를 한 번만 가져옴
        const partnerId = await getPartnerId()

        // 모든 데이터를 병렬로 가져오되, partnerId를 전달
        await Promise.all([
          fetchPartnerData(partnerId),
          fetchPointHistory(partnerId),
          fetchPendingWithdrawals(partnerId),
        ])
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [userId])

  // Real-time 구독 제거 - 낙관적 업데이트와 수동 refetch 사용

  const fetchPartnerData = async (partnerId: string | null) => {
    try {
      // API를 통해 파트너 공통 정보 조회
      const commonInfoResponse = await mateYouApi.partners.getCommonInfo(userId)

      if (!commonInfoResponse.data.success || !commonInfoResponse.data.data) {
        setPartnerData(null)
        return
      }

      // API 응답이 partner 데이터를 직접 반환 (member 정보는 members 필드에 포함)
      const partnerInfo = commonInfoResponse.data.data as any
      const partnerTableId = partnerInfo?.id // partners 테이블의 id

      // partners 테이블에서 store_points, collaboration_store_points 직접 조회
      let storePoints = 0
      let collaborationStorePoints = 0
      let businessInfo = null

      if (partnerTableId) {
        const { data: partnerPointsData } = await supabase
          .from('partners')
          .select('store_points, collaboration_store_points')
          .eq('id', partnerTableId)
          .maybeSingle()
        
        storePoints = partnerPointsData?.store_points ?? 0
        collaborationStorePoints = partnerPointsData?.collaboration_store_points ?? 0

        // 비즈니스 정보 조회
        const { data } = await supabase
          .from('partner_business_info')
          .select('*')
          .eq('partner_id', partnerTableId)
          .maybeSingle()
        businessInfo = data
      }

      // 데이터 조합: member 필드가 있으면 사용, 없으면 빈 객체
      const memberData = partnerInfo.members || partnerInfo.member || {}
      const combinedData = {
        ...memberData,
        partner_data: {
          ...partnerInfo,
          store_points: storePoints,
          collaboration_store_points: collaborationStorePoints,
          partner_business_info: businessInfo,
        },
      }
      setPartnerData(combinedData as PartnerFullData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    }
  }

  const fetchPointHistory = async (partnerId: string | null) => {
    try {
      if (!partnerId) {
        setPointHistory([])
        return
      }

      // API를 통해 포인트 내역 조회
      const response = await mateYouApi.partners.getPointHistory(partnerId)

      if (response.data.success && response.data.data) {
        setPointHistory(response.data.data as PartnerPointsLog[])
      } else {
        setPointHistory([])
      }
    } catch (err) {
      setPointHistory([])
    }
  }

  const fetchPendingWithdrawals = async (partnerId: string | null) => {
    const defaultValue: PendingWithdrawals = {
      total: 0,
      byType: { total_points: 0, store_points: 0, collaboration_store_points: 0 }
    }
    try {
      if (!partnerId) {
        setPendingWithdrawals(defaultValue)
        return
      }

      const response = await mateYouApi.partners.getPendingWithdrawals(partnerId)

      if (response.data.success && response.data.data !== undefined) {
        const data = response.data.data as any
        setPendingWithdrawals({
          total: data?.total_pending ?? 0,
          byType: {
            total_points: data?.pending_by_type?.total_points ?? 0,
            store_points: data?.pending_by_type?.store_points ?? 0,
            collaboration_store_points: data?.pending_by_type?.collaboration_store_points ?? 0,
          }
        })
      } else {
        setPendingWithdrawals(defaultValue)
      }
    } catch (err) {
      setPendingWithdrawals(defaultValue)
    }
  }

  const updatePartnerStatus = async (status: PartnerData['partner_status']) => {
    if (!partnerData?.partner_data) return

    try {
      const response = await mateYouApi.partners.updateStatus(
        partnerData.partner_data.id,
        status as string
      )

      if (!response.data.success) {
        throw new Error('Failed to update status')
      }

      // 낙관적 업데이트
      setPartnerData({
        ...partnerData,
        partner_data: {
          ...partnerData.partner_data,
          partner_status: status,
        },
      })
    } catch (err) {
      throw err
    }
  }

  return {
    memberData: partnerData,
    partnerData,
    pointHistory,
    pendingWithdrawals,
    isLoading,
    error,
    updatePartnerStatus,
    refetch: async () => {
      const partnerId = await getPartnerId()
      await Promise.all([
        fetchPartnerData(partnerId),
        fetchPointHistory(partnerId),
        fetchPendingWithdrawals(partnerId),
      ])
      setIsLoading(false)
    },
  }
}
