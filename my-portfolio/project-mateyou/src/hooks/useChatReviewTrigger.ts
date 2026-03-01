import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface CompletedRequest {
  id: string
  partner_id: string
  client_id: string
  partner_member_id: string
  partner_name: string
  request_type: string
  job_count: number
}

export function useChatReviewTrigger(currentUserId: string, partnerId: string) {
  const [completedRequest, setCompletedRequest] =
    useState<CompletedRequest | null>(null)

  // 리뷰 모달 닫기
  const closeReviewModal = useCallback(() => {
    setCompletedRequest(null)
  }, [])

  // 완료된 요청 감지 및 리뷰 모달 트리거
  useEffect(() => {
    if (!currentUserId || !partnerId) return

    console.log('[ReviewTrigger] 구독 시작:', { currentUserId, partnerId })

    const channel = supabase
      .channel(`review-trigger-${currentUserId}-${partnerId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'partner_requests',
          // filter 제거 - 콜백에서 직접 체크
        },
        async (payload) => {
          const newData = payload.new as any
          console.log('[ReviewTrigger] UPDATE 이벤트 수신:', { 
            status: newData.status, 
            client_id: newData.client_id,
            currentUserId 
          })

          // status가 completed가 아니면 무시
          if (newData.status !== 'completed') {
            console.log('[ReviewTrigger] status가 completed가 아님, 무시')
            return
          }

          // 현재 채팅방과 관련된 요청인지 확인 (클라이언트만 리뷰 작성 가능)
          if (newData.client_id === currentUserId) {
            console.log('[ReviewTrigger] 클라이언트 일치, 파트너 정보 조회 시작')
            // 현재 사용자가 클라이언트인 경우에만 리뷰 모달 표시
            try {
              const { data: partnerData, error: partnerError } = await supabase
                .from('partners')
                .select(
                  `
                  id,
                  member_id,
                  members!inner(name)
                `,
                )
                .eq('id', newData.partner_id)
                .single()

              console.log('[ReviewTrigger] 파트너 정보 조회 결과:', { 
                partnerData, 
                partnerError,
                partnerMemberId: partnerData?.member_id,
                expectedPartnerId: partnerId,
                match: partnerData?.member_id === partnerId
              })

              if (partnerData && partnerData.member_id === partnerId) {
                console.log('[ReviewTrigger] ✅ 리뷰 모달 표시!')
                setCompletedRequest({
                  id: newData.id,
                  partner_id: newData.partner_id,
                  client_id: newData.client_id,
                  partner_member_id: partnerData.member_id,
                  partner_name:
                    (partnerData.members as any)?.name || '알 수 없는 파트너',
                  request_type: newData.request_type,
                  job_count: newData.job_count,
                })
              } else {
                console.log('[ReviewTrigger] 파트너 ID 불일치, 리뷰 모달 표시 안함')
              }
            } catch (error) {
              console.error('[ReviewTrigger] 파트너 정보 조회 실패:', error)
            }
          } else {
            console.log('[ReviewTrigger] 클라이언트 불일치:', { 
              requestClientId: newData.client_id, 
              currentUserId 
            })
          }
        },
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [currentUserId, partnerId])

  return {
    completedRequest,
    closeReviewModal,
  }
}
