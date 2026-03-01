import { useQuery } from '@tanstack/react-query'
import { mateYouApi } from '@/lib/apiClient'
import type { PartnerJob } from '@/types/database'

export function usePartnerJobs(
  partnerId: string | null,
  activeOnly: boolean = false,
) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['partner-jobs', partnerId, activeOnly],
    queryFn: async () => {
      if (!partnerId) {
        return { jobs: [], isPartner: false }
      }

      const response = await mateYouApi.partners.getJobs(partnerId, activeOnly)

      // 응답 형식 처리: ApiResponse 형식 또는 직접 데이터 형식 모두 지원
      let jobs: PartnerJob[] = []
      let isPartner = false

      if (response.data.success && response.data.data) {
        // 표준 ApiResponse 형식: { success: true, data: [...], meta: { isPartner: true } }
        jobs = Array.isArray(response.data.data) 
          ? response.data.data as PartnerJob[]
          : []
        isPartner = response.data.meta?.isPartner ?? true
      } else if (Array.isArray(response.data)) {
        // 직접 배열 형식 (하위 호환성): [...]
        jobs = response.data as PartnerJob[]
        isPartner = true
      } else if (response.data.error) {
        // 에러 응답
        throw new Error(response.data.error.message || 'Failed to fetch partner jobs')
      } else {
        // 빈 배열 반환 (파트너가 아닌 경우)
        jobs = []
        isPartner = false
      }

      return {
        jobs,
        isPartner,
      }
    },
    enabled: !!partnerId,
    staleTime: 5 * 60 * 1000, // 5분 동안 캐시 유지
  })

  return {
    jobs: data?.jobs || [],
    isLoading,
    error: error?.message || null,
    refetch,
    isPartner: data?.isPartner || false,
  }
}
