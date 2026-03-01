import { useQuery } from '@tanstack/react-query'
import type { ApiResponse, Database } from '@/types/database'
import { supabase } from '@/lib/supabase'
import { edgeApi } from '@/lib/edgeApi'
import { useAuth } from '@/hooks/useAuth'

type Member = Database['public']['Tables']['members']['Row']

interface PartnerWithMember {
  id: string // partners 테이블의 ID
  member_id: string
  partner_name: string | null
  partner_message: string | null
  partner_status: 'none' | 'pending' | 'approved' | 'rejected'
  partner_applied_at: string
  partner_reviewed_at: string | null
  total_points: number
  game_info: any | null
  created_at: string
  updated_at: string
  member: Member
  averageRating?: number
  reviewCount?: number
  receivedReviews?: Array<any>
}

// 이름 마스킹 함수
const maskName = (name: string | null): string => {
  if (!name) return '익명***'

  if (name.length <= 2) {
    return name[0] + '*'.repeat(Math.max(1, name.length - 1))
  } else {
    return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1]
  }
}

// Supabase 직접 쿼리로 특정 파트너의 리뷰 데이터 가져오기
// partnerId는 이제 members.id를 받습니다
// reviews.target_partner_id는 partners.id를 참조하므로, partners 테이블을 조인하여 조회
const fetchPartnerReviews = async (memberId: string) => {
  if (!memberId) return []

  try {
    // 1. 먼저 members.id로 partners.id를 찾기
    const { data: partnerData, error: partnerError } = await supabase
      .from('partners')
      .select('id')
      .eq('member_id', memberId)
      .maybeSingle()

    if (partnerError) {
      // 406 에러는 파트너가 없다는 의미일 수 있으므로 무시
      if (partnerError.code === 'PGRST116' || partnerError.message?.includes('406')) {
        console.log('ℹ️ 파트너 정보 없음 (리뷰 조회)', memberId)
        return []
      }
      console.error('파트너 정보 조회 실패:', partnerError)
      return []
    }

    if (!partnerData) {
      // 파트너가 없으면 빈 배열 반환
      return []
    }

    // 2. partners.id로 리뷰 조회 (target_partner_id는 partners.id를 참조)
    const { data: reviewsData, error } = await supabase
      .from('reviews')
      .select(
        `
        id, rating, comment, points_earned, created_at, member_id,
        members!member_id(name)
      `,
      )
      .eq('target_partner_id', partnerData.id)  // partners.id 사용
      .gt('rating', 0)
      .order('created_at', { ascending: false })

    if (error) throw error

    // 리뷰 데이터에 마스킹된 이름 추가
    const reviewsWithMaskedNames = (reviewsData || []).map((review) => ({
      ...review,
      reviewer_name: maskName((review.members as any)?.name),
    }))

    return reviewsWithMaskedNames || []
  } catch (error) {
    console.error('파트너 리뷰 조회 실패:', error)
    return []
  }
}

// 특정 파트너의 상세 정보와 리뷰를 가져오는 훅
// partnerId는 이제 members.id를 받습니다 (partners.member_id로 조회)
export function usePartnerDetails(partnerId: string) {
  return useQuery({
    queryKey: ['partner-details', partnerId],
    queryFn: async () => {
      if (!partnerId) return null

      try {
        // members.id로 파트너 정보 가져오기 (partners.member_id로 조회)
        const { data: partnerData, error: partnerError } = await supabase
          .from('partners')
          .select(
            `
            *,
            member:members(*)
          `,
          )
          .eq('member_id', partnerId)  // partners.id → partners.member_id로 변경
          .eq('partner_status', 'approved')
          .maybeSingle()

        if (partnerError || !partnerData) return null

        // 테스트 계정인지 확인 (테스트 계정이면 null 반환)
        if (partnerData.member?.social_id?.startsWith('test-social-')) {
          return null
        }

        // 파트너의 리뷰 가져오기 (0점 리뷰는 이미 fetchPartnerReviews에서 제외됨)
        // fetchPartnerReviews도 members.id를 받도록 변경됨
        const reviews = await fetchPartnerReviews(partnerId)

        const member = partnerData.member
        return {
          ...member,
          partner_name: partnerData.partner_name,
          partner_message: partnerData.partner_message,
          partner_status: partnerData.partner_status,
          partner_applied_at: partnerData.partner_applied_at,
          partner_reviewed_at: partnerData.partner_reviewed_at,
          total_points: partnerData.total_points,
          coins_per_job: partnerData.coins_per_job,
          partner_id: partnerData.id,
          background_images: partnerData.background_images,
          game_info: partnerData.game_info,
          legal_name: partnerData.legal_name,
          legal_email: partnerData.legal_email,
          legal_phone: partnerData.legal_phone,
          payout_bank_code: partnerData.payout_bank_code,
          payout_bank_name: partnerData.payout_bank_name,
          payout_account_number: partnerData.payout_account_number,
          payout_account_holder: partnerData.payout_account_holder,
          tosspayments_business_type: partnerData.tosspayments_business_type,
          reviews,
          averageRating:
            reviews.length > 0
              ? reviews.reduce(
                  (sum: number, review: any) => sum + (review.rating || 0),
                  0,
                ) / reviews.length
              : undefined,
          reviewCount: reviews.length,
        }
      } catch (error) {
        return null
      }
    },
    enabled: !!partnerId,
    staleTime: 5 * 60 * 1000, // 5분 동안 캐시 유지
  })
}

// 특정 파트너의 리뷰만 가져오는 훅 (기존 유지)
export function usePartnerReviews(partnerId: string) {
  return useQuery({
    queryKey: ['partner-reviews', partnerId],
    queryFn: () => fetchPartnerReviews(partnerId),
    enabled: !!partnerId,
    staleTime: 5 * 60 * 1000, // 5분 동안 캐시 유지
  })
}

type HomePartnerReview = {
  id: number
  rating: number
  comment?: string | null
  points_earned: number
  created_at: string
  target_partner_id: string | null
}

type HomePartner = PartnerWithMember & {
  averageRating?: number
  reviewCount?: number
  lastReviewDate?: string
  lastReview?: HomePartnerReview
}

type HomePartnersResponse = {
  partners: Array<HomePartner>
  allPartners: Array<HomePartner>
  onlinePartners: Array<HomePartner>
  recentPartners: Array<HomePartner>
  userReviews: Array<HomePartnerReview>
}

export function useMembers() {
  const { user } = useAuth()
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['members-home', user?.id],
    queryFn: async (): Promise<HomePartnersResponse> => {
      const response = (await edgeApi.partners.getHome({
        currentUserId: user?.id,
        onlineLimit: 8,
        recentLimit: 5,
      })) as ApiResponse<HomePartnersResponse>

      if (!response?.success) {
        throw new Error(response?.error?.message || '파트너 정보를 불러오지 못했습니다.')
      }

      return (
        response.data ?? {
          partners: [],
          allPartners: [],
          onlinePartners: [],
          recentPartners: [],
          userReviews: [],
        }
      )
    },
    staleTime: 60 * 1000, // 1분간 캐시 유지
    gcTime: 10 * 60 * 1000, // 10분간 캐시 보관
    refetchInterval: 2 * 60 * 1000, // 2분마다 새로고침 (30초 -> 2분)
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false, // 포커스 시 자동 리프레시 비활성화
  })

  const members = (data?.partners || []).filter(
    (partner) => partner.member?.id !== user?.id,
  )

  const rawAllPartners =
    data && data.allPartners && data.allPartners.length > 0
      ? data.allPartners
      : data?.partners || []

  const onlinePartners = (data?.onlinePartners || []).filter(
    (partner) => partner.member?.id !== user?.id,
  )

  const allPartners = rawAllPartners.filter(
    (partner) => partner.member?.id !== user?.id,
  )

  const recentPartners = (data?.recentPartners || []).filter(
    (partner) => partner.member?.id !== user?.id,
  )

  const errorMessage =
    error instanceof Error ? error.message : (error as { message?: string } | null)?.message || null

  return {
    members,
    isLoading,
    error: errorMessage,
    onlinePartners,
    recentPartners,
    allPartners,
    userReviews: data?.userReviews || [],
    refetch,
  }
}
