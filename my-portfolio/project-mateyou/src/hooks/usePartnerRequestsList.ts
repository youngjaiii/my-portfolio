import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database'

type PartnerRequest = Database['public']['Tables']['partner_requests']['Row'] & {
  client: {
    id: string
    name: string
    profile_image?: string | null
  }
}

interface UsePartnerRequestsListProps {
  partnerId: string  // 이제 members.id를 받습니다 (partners.member_id로 partners.id 찾기)
  status?: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  limit?: number
}

export function usePartnerRequestsList({
  partnerId,  // members.id
  status,
  limit = 5,
}: UsePartnerRequestsListProps) {
  const [requests, setRequests] = useState<PartnerRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const fetchRequests = async () => {
      try {
        setIsLoading(true)
        setError(null)

        // 1. members.id로 partners.id 찾기
        const { data: partnerData, error: partnerError } = await supabase
          .from('partners')
          .select('id')
          .eq('member_id', partnerId)
          .maybeSingle()

        if (partnerError) {
          // 406 에러는 파트너가 없다는 의미일 수 있으므로 무시
          if (partnerError.code === 'PGRST116' || partnerError.message?.includes('406')) {
            console.log('ℹ️ 파트너 정보 없음 (정상)', partnerId)
            setRequests([])
            setIsLoading(false)
            return
          }
          throw new Error(partnerError.message)
        }

        if (!partnerData) {
          // 파트너가 없으면 빈 배열 반환
          setRequests([])
          setIsLoading(false)
          return
        }

        // 2. partners.id로 partner_requests 조회 (partner_id는 partners.id를 참조)
        let query = supabase
          .from('partner_requests')
          .select(`
            *,
            client:members!client_id(id, name, profile_image)
          `)
          .eq('partner_id', partnerData.id)  // partners.id 사용
          .order('created_at', { ascending: false })

        if (status) {
          query = query.eq('status', status)
        }

        if (limit) {
          query = query.limit(limit)
        }

        const { data, error: fetchError } = await query

        if (fetchError) {
          throw new Error(fetchError.message)
        }

        setRequests(data || [])
      } catch (err) {
        setError(err as Error)
      } finally {
        setIsLoading(false)
      }
    }

    if (partnerId) {
      fetchRequests()
    }
  }, [partnerId, status, limit])

  const refetch = async () => {
    if (partnerId) {
      const fetchRequests = async () => {
        try {
          setIsLoading(true)
          setError(null)

          // 1. members.id로 partners.id 찾기
          const { data: partnerData, error: partnerError } = await supabase
            .from('partners')
            .select('id')
            .eq('member_id', partnerId)
            .maybeSingle()

          if (partnerError) {
            throw new Error(partnerError.message)
          }

          if (!partnerData) {
            // 파트너가 없으면 빈 배열 반환
            setRequests([])
            setIsLoading(false)
            return
          }

          // 2. partners.id로 partner_requests 조회 (partner_id는 partners.id를 참조)
          let query = supabase
            .from('partner_requests')
            .select(`
              *,
              client:members!client_id(id, name, profile_image)
            `)
            .eq('partner_id', partnerData.id)  // partners.id 사용
            .order('created_at', { ascending: false })

          if (status) {
            query = query.eq('status', status)
          }

          if (limit) {
            query = query.limit(limit)
          }

          const { data, error: fetchError } = await query

          if (fetchError) {
            throw new Error(fetchError.message)
          }

          setRequests(data || [])
        } catch (err) {
          setError(err as Error)
        } finally {
          setIsLoading(false)
        }
      }

      await fetchRequests()
    }
  }

  return {
    requests,
    isLoading,
    error,
    refetch,
  }
}