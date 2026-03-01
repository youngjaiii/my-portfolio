/**
 * useFanRanking - 팬 랭킹 데이터를 가져와서 사용자별 순위를 매핑하는 hook
 * 채팅 메시지에서 랭킹 메달을 표시하기 위해 사용
 */

import { resolveAccessToken } from '@/utils/sessionToken'
import { useQuery } from '@tanstack/react-query'

const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

interface RankingMember {
  id?: string
  user_id: string
  user_name?: string
  profile_image?: string
  member_code?: string
  total_points_spent?: number
  rank?: number
}

interface UseFanRankingOptions {
  /** 파트너 ID (없으면 현재 사용자의 팬 랭킹) */
  partnerId?: string | null
  /** 활성화 여부 */
  enabled?: boolean
}

/**
 * 팬 랭킹 데이터를 조회하고 사용자 ID를 키로 하는 Map을 반환
 * @returns 사용자 ID -> 순위 매핑 (1, 2, 3등만 반환)
 */
export function useFanRanking({ partnerId, enabled = true }: UseFanRankingOptions = {}) {
  const { data: rankings = [], isLoading } = useQuery({
    queryKey: ['fan-ranking', partnerId],
    queryFn: async (): Promise<RankingMember[]> => {
      try {
        const token = await resolveAccessToken()
        
        // 파트너 ID가 있으면 해당 파트너의 팬 랭킹 조회, 없으면 내 팬 랭킹 조회
        const endpoint = partnerId
          ? `${EDGE_FUNCTIONS_URL}/functions/v1/api-partners/ranking?partner_id=${partnerId}`
          : `${EDGE_FUNCTIONS_URL}/functions/v1/api-partners/ranking`
        
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            apikey: SUPABASE_ANON_KEY,
          },
        })

        const result = await response.json()
        if (result.success && result.data) {
          return result.data as RankingMember[]
        }
        return []
      } catch (error) {
        console.error('팬 랭킹 조회 실패:', error)
        return []
      }
    },
    enabled: enabled,
    staleTime: 1000 * 60 * 5, // 5분간 캐시
    refetchInterval: 1000 * 60 * 5, // 5분마다 갱신
  })

  // 사용자 ID -> 순위 매핑 (1, 2, 3등만)
  const rankMap = new Map<string, number>()
  rankings.forEach((member, index) => {
    const rank = index + 1
    if (rank <= 3 && member.user_id) {
      rankMap.set(member.user_id, rank)
    }
  })

  return {
    rankings,
    rankMap,
    isLoading,
  }
}

