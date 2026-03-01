import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { PARTNER_PUBLIC_FIELDS } from '@/constants/partnerFields'

export function usePartnerDetailsByMemberId(memberId: string) {
  return useQuery({
    queryKey: ['partner-details-by-member-id', memberId],
    queryFn: async () => {
      // 먼저 해당 member가 partner인지 확인
      const { data: memberData, error: memberError } = await supabase
        .from('members')
        .select('id, name, member_code, profile_image, current_status, favorite_game, created_at, role')
        .eq('id', memberId)
        .single()

      if (memberError || !memberData) {
        throw memberError || new Error('Member not found')
      }

      // partner 역할이 아니면 에러 반환
      if ((memberData as any).role !== 'partner') {
        throw new Error('Not a partner')
      }

      // partner 정보 조회 (민감한 toss 정보 제외)
      const { data, error } = await supabase
        .from('partners')
        .select(`
          ${PARTNER_PUBLIC_FIELDS},
          member:members!member_id(
            id,
            name,
            member_code,
            profile_image,
            current_status,
            favorite_game,
            created_at,
            role
          )
        `)
        .eq('member_id', memberId)
        .single()

      if (error || !data) {
        throw error || new Error('Partner not found')
      }

      // 리뷰 별도 조회 (관계 문제 해결)
      const { data: reviews } = await supabase
        .from('reviews')
        .select(`
          id,
          rating,
          comment,
          created_at,
          member_id,
          reviewer:members!member_id(name)
        `)
        .eq('target_partner_id', (data as any).id)
        .not('comment', 'is', null)
        .not('rating', 'is', null)
        .order('created_at', { ascending: false })

      return {
        ...(data as any),
        reviews: reviews || []
      }
    },
    enabled: !!memberId,
    staleTime: 5 * 60 * 1000, // 5분 동안 캐시 유지
  })
}