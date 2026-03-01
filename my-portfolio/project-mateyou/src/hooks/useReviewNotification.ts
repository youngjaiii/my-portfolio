import { useEffect, useState } from 'react'
import { toast } from '@/components/ui/sonner'
import { supabase } from '@/lib/supabase'

interface PendingReview {
  requestId: string
  partnerId: string
  partnerName: string
  requestType: string
  completedAt: string
}

export const useReviewNotification = () => {
  const [pendingReviews, setPendingReviews] = useState<Array<PendingReview>>([])
  const [currentReview, setCurrentReview] = useState<PendingReview | null>(null)
  const [showReviewModal, setShowReviewModal] = useState(false)

  useEffect(() => {
    checkPendingReviews()

    // 실시간 요청 상태 변경 감지
    const subscription = supabase
      .channel('partner_requests_changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'partner_requests',
          filter: 'status=eq.completed',
        },
        (payload) => {
          if (
            payload.new?.status === 'completed' &&
            payload.old?.status !== 'completed'
          ) {
            handleRequestCompleted(payload.new.id)
          }
        },
      )
      .subscribe()

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const checkPendingReviews = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      // 최근 24시간 내 완료된 요청 중 리뷰가 없는 것들 찾기
      const twentyFourHoursAgo = new Date()
      twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24)


      // 클라이언트로서 완료된 요청만 조회 (리뷰는 클라이언트 → 파트너 방향만 존재)
      const { data: requests, error } = await supabase
        .from('partner_requests')
        .select(
          `
          id,
          partner_id,
          client_id,
          request_type,
          completed_at,
          partner:partners!partner_id(
            id,
            member:members!member_id(name)
          )
        `,
        )
        .eq('client_id', user.id)
        .eq('status', 'completed')
        .gte('completed_at', twentyFourHoursAgo.toISOString())
        .not('completed_at', 'is', null)

      if (error) throw error

      const pending: Array<PendingReview> = []

      for (const request of (requests || []) as any[]) {
        const partnerId = request.partner_id
        const partnerName = request.partner?.member?.name || '알 수 없음'

        // 해당 요청에 대한 리뷰가 있는지 확인
        const { data: existingReview } = await supabase
          .from('reviews')
          .select('id')
          .eq('member_id', user.id)
          .eq('target_partner_id', partnerId)
          .eq('review_code', `REQ_${request.id}`)
          .single()

        if (!existingReview) {
          pending.push({
            requestId: request.id,
            partnerId: partnerId,
            partnerName: partnerName,
            requestType: request.request_type,
            completedAt: request.completed_at,
          })
        }
      }

      setPendingReviews(pending)


      // 리뷰 대기 중인 요청이 있으면 가장 최근 것을 표시
      if (pending.length > 0 && !showReviewModal) {
        const latestReview = pending.sort(
          (a, b) =>
            new Date(b.completedAt).getTime() -
            new Date(a.completedAt).getTime(),
        )[0]

        showReviewNotification(latestReview)
      }
    } catch (error) {
      console.error('리뷰 확인 오류:', error)
    }
  }

  const handleRequestCompleted = async (requestId: string) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      // 완료된 요청 정보 가져오기
      const { data: request, error } = await supabase
        .from('partner_requests')
        .select(
          `
          id,
          partner_id,
          request_type,
          completed_at,
          partner:partners!partner_id(
            id,
            member:members!member_id(name)
          )
        `,
        )
        .eq('id', requestId)
        .eq('client_id', user.id)
        .single()

      if (error || !request) return

      const requestData = request as any
      const pendingReview: PendingReview = {
        requestId: requestData.id,
        partnerId: requestData.partner_id,
        partnerName: requestData.partner?.member?.name || '알 수 없음',
        requestType: requestData.request_type,
        completedAt: requestData.completed_at,
      }

      // 즉시 리뷰 모달 표시
      showReviewNotification(pendingReview)

      // 대기 목록에 추가
      setPendingReviews((prev) => [pendingReview, ...prev])
    } catch (error) {
      console.error('완료된 요청 처리 오류:', error)
    }
  }

  const showReviewNotification = (review: PendingReview) => {
    // 토스트로 리뷰 작성 알림
    toast.success(
      `${review.partnerName} 파트너와의 ${review.requestType}이 완료되었습니다! 리뷰를 작성해주세요.`,
      {
        duration: 5000,
      },
    )

    // 3초 후 자동으로 모달 표시
    setTimeout(() => {
      if (!showReviewModal) {
        setCurrentReview(review)
        setShowReviewModal(true)
      }
    }, 3000)
  }

  const dismissReview = (requestId: string) => {
    setPendingReviews((prev) => prev.filter((r) => r.requestId !== requestId))
    if (currentReview?.requestId === requestId) {
      setCurrentReview(null)
      setShowReviewModal(false)
    }
  }

  const closeReviewModal = () => {
    setShowReviewModal(false)
    setCurrentReview(null)
  }

  const handleReviewSubmitted = () => {
    if (currentReview) {
      dismissReview(currentReview.requestId)
    }
    closeReviewModal()
  }

  return {
    pendingReviews,
    currentReview,
    showReviewModal,
    closeReviewModal,
    handleReviewSubmitted,
    dismissReview,
  }
}
