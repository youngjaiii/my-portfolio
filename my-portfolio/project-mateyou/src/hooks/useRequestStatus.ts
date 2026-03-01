import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { mateYouApi } from '@/lib/apiClient'

type RequestSummary = {
  id: string
  request_type: string
  job_name: string | null
  job_count: number
  coins_per_job: number | null
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'rejected'
  call_id: string | null
  created_at?: string
  requested_at?: string
  accepted_at?: string
  updated_at?: string
  client_id?: string
}

interface RequestStatus {
  hasActiveRequest: boolean
  requestInfo: RequestSummary | null
  activeRequests: Array<RequestSummary>
}

export function useRequestStatus(currentUserId: string, partnerId: string) {
  const [requestStatus, setRequestStatus] = useState<RequestStatus>({
    hasActiveRequest: false,
    requestInfo: null,
    activeRequests: [],
  })
  const [isLoading, setIsLoading] = useState(true)

  const checkRequestStatus = useCallback(async () => {
    if (!currentUserId || !partnerId) {
      setRequestStatus({
        hasActiveRequest: false,
        requestInfo: null,
        activeRequests: [],
      })
      setIsLoading(false)
      return
    }

    try {
      const response = await mateYouApi.partners.getRequestStatus(currentUserId, partnerId)

      // 응답 형식 처리
      let data: any
      if (response.data.success && response.data.data) {
        data = response.data.data
      } else {
        data = response.data
      }

      setRequestStatus({
        hasActiveRequest: data.hasActiveRequest || false,
        requestInfo: data.requestInfo || null,
        activeRequests: data.activeRequests || [],
      })
    } catch (error) {
      console.error('Error in checkRequestStatus:', error)
      setRequestStatus({
        hasActiveRequest: false,
        requestInfo: null,
        activeRequests: [],
      })
    } finally {
      setIsLoading(false)
    }
  }, [currentUserId, partnerId])

  useEffect(() => {
    checkRequestStatus()
  }, [checkRequestStatus])

  // 실시간 업데이트를 위한 구독
  useEffect(() => {
    if (!currentUserId || !partnerId) return

    // 채널 이름에 타임스탬프 추가하여 고유성 보장
    const channelName = `request-status-${currentUserId}-${partnerId}-${Date.now()}`
    
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'partner_requests',
        },
        (payload) => {
          console.log('🔔 partner_requests 변경 감지:', payload)
          // 즉시 상태 새로고침
          checkRequestStatus()
        },
      )
      .subscribe((status) => {
        console.log('📡 Request status subscription:', status)
      })

    return () => {
      console.log('🔌 Request status channel unsubscribe')
      channel.unsubscribe()
    }
  }, [currentUserId, partnerId, checkRequestStatus])

  return {
    hasActiveRequest: requestStatus.hasActiveRequest,
    requestInfo: requestStatus.requestInfo,
    activeRequests: requestStatus.activeRequests,
    isLoading,
    refreshStatus: checkRequestStatus,
  }
}
