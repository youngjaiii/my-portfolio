/**
 * 오늘 후원 목록 조회 훅
 * - 방 기준 오늘 발생한 후원 목록 조회
 * - 후원자별 그룹핑 (인별 정렬)
 * - 시간순 정렬 (기록 정렬)
 */

import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'

/** 후원 기록 타입 */
export interface TodayDonation {
  id: number
  room_id: string
  donor_id: string
  recipient_partner_id: string
  amount: number
  heart_image: string | null
  message: string | null
  log_id: string | null
  created_at: string
  // JOIN된 데이터
  donor?: {
    id: string
    name: string
    profile_image: string | null
  }
  recipient_partner?: {
    id: string
    partner_name: string
    member?: {
      id: string
      name: string
      profile_image: string | null
    }
  }
}

/** 후원자별 그룹 타입 */
export interface DonorGroup {
  donorId: string
  donorName: string
  donorProfileImage: string | null
  totalAmount: number
  donationCount: number
  donations: TodayDonation[]
}

/** 정렬 타입 */
export type DonationSortType = 'by_donor' | 'by_time'

interface UseTodayDonationsOptions {
  roomId: string | undefined
  enabled?: boolean
}

/**
 * 오늘 후원 목록 조회 훅
 */
export function useTodayDonations({
  roomId,
  enabled = true,
}: UseTodayDonationsOptions) {
  // 오늘 시작 시간 (UTC 기준)
  const getTodayStart = () => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    return todayStart.toISOString()
  }

  // 오늘 후원 목록 조회
  const query = useQuery({
    queryKey: ['today-donations', roomId],
    queryFn: async () => {
      if (!roomId) return []

      const todayStart = getTodayStart()

      const { data, error } = await supabase
        .from('stream_donations')
        .select(`
          *,
          donor:members!stream_donations_donor_id_fkey(id, name, profile_image),
          recipient_partner:partners!stream_donations_recipient_partner_id_fkey(
            id, 
            partner_name,
            member:members!partners_member_id_fkey(id, name, profile_image)
          )
        `)
        .eq('room_id', roomId)
        .gte('created_at', todayStart)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('오늘 후원 목록 조회 실패:', error)
        throw error
      }

      return data as TodayDonation[]
    },
    enabled: !!roomId && enabled,
    staleTime: 10000, // 10초간 캐시
    refetchInterval: 30000, // 30초마다 갱신
  })

  // 후원자별 그룹핑 (인별 정렬)
  const groupByDonor = (donations: TodayDonation[]): DonorGroup[] => {
    const groupMap = new Map<string, DonorGroup>()

    for (const donation of donations) {
      const donorId = donation.donor_id
      const existing = groupMap.get(donorId)

      if (existing) {
        existing.totalAmount += donation.amount
        existing.donationCount += 1
        existing.donations.push(donation)
      } else {
        groupMap.set(donorId, {
          donorId,
          donorName: donation.donor?.name || '익명',
          donorProfileImage: donation.donor?.profile_image || null,
          totalAmount: donation.amount,
          donationCount: 1,
          donations: [donation],
        })
      }
    }

    // 총 후원금액 내림차순 정렬
    return Array.from(groupMap.values()).sort(
      (a, b) => b.totalAmount - a.totalAmount
    )
  }

  // 시간순 정렬 (최신순)
  const sortByTime = (donations: TodayDonation[]): TodayDonation[] => {
    return [...donations].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }

  // 오늘 총 후원 금액
  const totalAmount = (query.data || []).reduce(
    (sum, d) => sum + d.amount,
    0
  )

  return {
    // Raw 데이터
    donations: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,

    // 가공된 데이터
    donorGroups: groupByDonor(query.data || []),
    sortedByTime: sortByTime(query.data || []),

    // 통계
    totalAmount,
    totalCount: (query.data || []).length,
    uniqueDonorCount: new Set((query.data || []).map((d) => d.donor_id)).size,
  }
}

