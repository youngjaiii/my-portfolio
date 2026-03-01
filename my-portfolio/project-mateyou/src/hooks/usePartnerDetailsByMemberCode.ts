import { useQuery } from '@tanstack/react-query'
import { edgeApi } from '@/lib/edgeApi'
import type { PartnerWithMember } from '@/types/database'

// 에러 코드를 포함하는 커스텀 에러 클래스
export class PartnerDetailError extends Error {
  code: string
  
  constructor(message: string, code: string) {
    super(message)
    this.code = code
    this.name = 'PartnerDetailError'
  }
}

export function usePartnerDetailsByMemberCode(memberCode: string) {
  return useQuery({
    queryKey: ['partner-details-by-member-code', memberCode],
    queryFn: async () => {
      console.log('🔍 [usePartnerDetailsByMemberCode] Fetching partner details for:', memberCode)
      
      const response = await edgeApi.partners.getDetailsByMemberCode(memberCode)

      console.log('🔍 [usePartnerDetailsByMemberCode] API Response:', {
        success: response.success,
        hasData: !!response.data,
        posts_count: (response.data as any)?.posts_count,
        followers_count: (response.data as any)?.followers_count,
        error: response.error,
      })

      if (!response.success) {
        const errorCode = response.error?.code || 'UNKNOWN_ERROR'
        const errorMessage = response.error?.message || 'Failed to fetch partner details'
        throw new PartnerDetailError(errorMessage, errorCode)
      }

      return response.data as PartnerWithMember
    },
    enabled: !!memberCode,
    staleTime: 5 * 60 * 1000, // 5분 동안 캐시 유지
  })
}