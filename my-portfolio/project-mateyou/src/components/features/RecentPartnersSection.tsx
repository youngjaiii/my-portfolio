import React, { useEffect, useState } from 'react'
import { Clock, MessageCircle, Star } from 'lucide-react'
import { toast } from '@/components/ui/sonner'
import { supabase } from '@/lib/supabase'
import { ReviewModal } from '@/components/modals/ReviewModal'

interface RecentPartner {
  partnerId: string
  partnerName: string
  profileImage: string | null
  lastRequestId: string
  lastCompletedAt: string
  requestType: string
  totalJobs: number
  hasReview: boolean
  existingReview?: {
    id: number
    rating: number
    comment: string
  }
}

export const RecentPartnersSection: React.FC = () => {
  const [recentPartners, setRecentPartners] = useState<Array<RecentPartner>>([])
  const [loading, setLoading] = useState(true)
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [selectedPartner, setSelectedPartner] = useState<RecentPartner | null>(
    null,
  )

  useEffect(() => {
    loadRecentPartners()
  }, [])

  const loadRecentPartners = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return


      // 먼저 모든 partner_requests 확인 (상태 상관없이)
      const { data: allRequests } = await supabase
        .from('partner_requests')
        .select('id, status, client_id, partner_id, completed_at, request_type')
        .or(`client_id.eq.${user.id},partner_id.eq.${user.id}`)
        .order('created_at', { ascending: false })
        .limit(20)


      // 완료된 요청만 따로 확인
      const { data: completedRequests } = await supabase
        .from('partner_requests')
        .select('id, status, client_id, partner_id, completed_at, request_type')
        .or(`client_id.eq.${user.id},partner_id.eq.${user.id}`)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(10)


      // 완료된 요청이 없으면 여기서 종료
      if (!completedRequests || completedRequests.length === 0) {
        setRecentPartners([])
        return
      }

      // 더 간단한 방식으로 먼저 요청 데이터만 가져오기
      const { data: requests, error } = await supabase
        .from('partner_requests')
        .select(
          `
          id,
          partner_id,
          client_id,
          request_type,
          completed_at
        `,
        )
        .or(`client_id.eq.${user.id},partner_id.eq.${user.id}`)
        .eq('status', 'completed')
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(10)


      if (error) throw error

      // 상대방별로 그룹화하고 최신 정보만 유지 (내가 클라이언트면 파트너를, 내가 파트너면 클라이언트를)
      const partnerMap = new Map<string, RecentPartner>()

      for (const request of requests || []) {
        const isClient = request.client_id === user.id
        const targetId = isClient ? request.partner_id : request.client_id


        if (partnerMap.has(targetId)) continue

        // 별도로 target user 정보 가져오기
        const { data: targetUser, error: userError } = await supabase
          .from('members')
          .select('id, name, profile_image')
          .eq('id', targetId)
          .single()


        if (userError || !targetUser) {
          console.warn(
            `[Recent Partners] Failed to get user info for ${targetId}:`,
            userError,
          )
          continue
        }

        // 해당 사용자에 대한 기존 리뷰 확인
        const { data: existingReview } = await supabase
          .from('reviews')
          .select('id, rating, comment')
          .eq('member_id', user.id)
          .eq('target_partner_id', targetId)
          .eq('review_code', `REQ_${request.id}`)
          .single()


        partnerMap.set(targetId, {
          partnerId: targetId,
          partnerName: targetUser.name || '알 수 없음',
          profileImage: targetUser.profile_image,
          lastRequestId: request.id,
          lastCompletedAt: request.completed_at,
          requestType: request.request_type,
          totalJobs: 1, // jobs 정보를 별도로 가져오지 않으므로 1로 설정
          hasReview: !!existingReview,
          existingReview: existingReview || undefined,
        })
      }


      setRecentPartners(Array.from(partnerMap.values()))
    } catch (error) {
      console.error('최근 파트너 로딩 오류:', error)
      toast.error('최근 파트너 정보를 불러오는데 실패했습니다')
      setRecentPartners([]) // 에러 시 빈 배열로 설정
    } finally {
      setLoading(false)
    }
  }

  const handleReviewClick = (partner: RecentPartner) => {
    setSelectedPartner(partner)
    setReviewModalOpen(true)
  }

  const handleReviewSubmitted = () => {
    loadRecentPartners() // 리뷰 작성 후 목록 새로고침
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffTime = now.getTime() - date.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 1) return '어제'
    if (diffDays < 7) return `${diffDays}일 전`
    if (diffDays < 30) return `${Math.ceil(diffDays / 7)}주 전`
    return date.toLocaleDateString('ko-KR')
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          최근 함께한 사용자
        </h3>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse flex items-center space-x-3">
              <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (recentPartners.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          최근 함께한 사용자
        </h3>
        <div className="text-center py-8">
          <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">아직 완료된 요청이 없습니다</p>
          <p className="text-xs text-gray-400 mt-2">
            개발자 도구 콘솔에서 [Recent Partners] 로그를 확인해주세요
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          최근 함께한 사용자
        </h3>
        <div className="space-y-3">
          {recentPartners.map((partner) => (
            <div
              key={partner.partnerId}
              className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50"
            >
              <div className="flex items-center space-x-3">
                <div className="relative">
                  {partner.profileImage ? (
                    <img
                      src={partner.profileImage}
                      alt={partner.partnerName}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                      <span className="text-gray-500 text-lg font-medium">
                        {partner.partnerName.charAt(0)}
                      </span>
                    </div>
                  )}
                  {partner.hasReview && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center">
                      <Star className="w-3 h-3 text-white fill-current" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-medium text-gray-900 truncate">
                    {partner.partnerName}
                  </h4>
                  <div className="flex items-center space-x-2 text-xs text-gray-500">
                    <span>{partner.requestType}</span>
                    <span>•</span>
                    <span>{formatDate(partner.lastCompletedAt)}</span>
                    <span>•</span>
                    <span>{partner.totalJobs}개 작업</span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => handleReviewClick(partner)}
                className={`flex items-center space-x-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  partner.hasReview
                    ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                    : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                }`}
              >
                <MessageCircle className="w-3 h-3" />
                <span>{partner.hasReview ? '리뷰 수정' : '리뷰 쓰기'}</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {selectedPartner && (
        <ReviewModal
          isOpen={reviewModalOpen}
          onClose={() => {
            setReviewModalOpen(false)
            setSelectedPartner(null)
          }}
          partnerId={selectedPartner.partnerId}
          partnerName={selectedPartner.partnerName}
          requestId={selectedPartner.lastRequestId}
          existingReview={selectedPartner.existingReview}
          onReviewSubmitted={handleReviewSubmitted}
        />
      )}
    </>
  )
}
