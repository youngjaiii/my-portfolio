import { useCallback, useEffect, useState } from 'react'
import { toast } from '@/components/ui/sonner'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

interface NewRequestNotification {
  id: string
  client_id: string
  client_name: string
  request_type: string
  job_count: number
  coins_per_job: number
  total_coins: number
  created_at: string
}

export function usePartnerRequestNotification() {
  const { user } = useAuth()
  const [pendingNotifications, setPendingNotifications] = useState<
    Array<NewRequestNotification>
  >([])

  // 새로운 요청 알림 표시
  const showNewRequestNotification = useCallback(
    (request: NewRequestNotification) => {
      toast.success(
        `${request.client_name}님이 ${request.request_type} ${request.job_count}회를 요청했습니다.`,
        {
          duration: 8000,
          position: 'top-right',
        },
      )

      // 알림음이나 진동 등 추가 알림 효과
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('새로운 의뢰 요청', {
          body: `${request.client_name}님이 ${request.request_type} ${request.job_count}회를 요청했습니다.`,
          icon: '/favicon.ico',
        })
      }
    },
    [],
  )

  // 파트너 요청 실시간 감지
  useEffect(() => {
    if (!user?.id) return

    // 현재 사용자가 파트너인지 확인
    const checkIfPartner = async () => {
      const { data: partnerData } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', user.id)
        .single()

      if (!partnerData) return // 파트너가 아니면 구독하지 않음


      const channel = supabase
        .channel(`partner-requests-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'partner_requests',
            filter: `partner_id=eq.${partnerData.id}`,
          },
          async (payload) => {
            const newRequest = payload.new as any

            try {
              // 클라이언트 정보 가져오기
              const { data: clientData } = await supabase
                .from('members')
                .select('name')
                .eq('id', newRequest.client_id)
                .single()

              const notification: NewRequestNotification = {
                id: newRequest.id,
                client_id: newRequest.client_id,
                client_name: clientData?.name || '알 수 없는 사용자',
                request_type: newRequest.request_type,
                job_count: newRequest.job_count,
                coins_per_job: newRequest.coins_per_job,
                total_coins: newRequest.job_count * newRequest.coins_per_job,
                created_at: newRequest.created_at,
              }

              setPendingNotifications((prev) => [...prev, notification])
              showNewRequestNotification(notification)
            } catch (error) {
              console.error('클라이언트 정보 조회 실패:', error)
            }
          },
        )
        .subscribe()

      return () => {
        channel.unsubscribe()
      }
    }

    checkIfPartner()
  }, [user?.id, showNewRequestNotification])

  // 알림 읽음 처리
  const markNotificationAsRead = useCallback((requestId: string) => {
    setPendingNotifications((prev) =>
      prev.filter((notification) => notification.id !== requestId),
    )
  }, [])

  // 모든 알림 읽음 처리
  const markAllNotificationsAsRead = useCallback(() => {
    setPendingNotifications([])
  }, [])

  return {
    pendingNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
  }
}
