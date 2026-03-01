import React, { useEffect, useState } from 'react'
import { Calendar, Edit3, MessageCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { mateYouApi } from '@/lib/apiClient'
import { ReviewModal } from '@/components/modals/ReviewModal'

interface IncompleteReview {
  id: number
  partnerId: string
  partnerName: string
  partnerProfileImage: string | null
  rating: number
  comment: string
  requestType: string
  createdAt: string
  requestId?: string
}

export const IncompleteReviewsSection: React.FC = () => {
  const [incompleteReviews, setIncompleteReviews] = useState<Array<IncompleteReview>>([])
  const [loading, setLoading] = useState(true)
  const [editingReview, setEditingReview] = useState<IncompleteReview | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)

  useEffect(() => {
    loadIncompleteReviews()
  }, [])

  const loadIncompleteReviews = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      // Express API로 미완성 리뷰 조회 (N+1 문제 해결)
      const response = await mateYouApi.reviews.getIncompleteReviews()

      if (!response.data.success || !response.data.data) {
        setIncompleteReviews([])
        return
      }

      const reviewsData = response.data.data as any[]

      const reviewsWithDetails: Array<IncompleteReview> = reviewsData.map((review) => {
        let requestType = '일반 리뷰'
        let requestId: string | undefined

        // review_code에서 요청 타입 추출
        if (review.review_code?.startsWith('REQ_')) {
          requestId = review.review_code.replace('REQ_', '')
          requestType = '의뢰 리뷰' // 기본값, 실제 타입은 별도 조회 필요시 추가
        }

        return {
          id: review.id,
          partnerId: review.target_partner_id,
          partnerName: review.partners?.partner_name || review.partners?.members?.name || '알 수 없음',
          partnerProfileImage: review.partners?.members?.profile_image,
          rating: review.rating || 0,
          comment: review.comment || '',
          requestType,
          createdAt: review.created_at,
          requestId,
        }
      })

      setIncompleteReviews(reviewsWithDetails)
    } catch (error) {
      console.error('미완성 리뷰 로딩 오류:', error)
      toast.error('미완성 리뷰 목록을 불러오는데 실패했습니다')
    } finally {
      setLoading(false)
    }
  }

  const handleEditReview = (review: IncompleteReview) => {
    setEditingReview(review)
    setShowEditModal(true)
  }

  const handleReviewUpdated = () => {
    loadIncompleteReviews()
    setShowEditModal(false)
    setEditingReview(null)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          작성 대기 중인 리뷰
        </h3>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                </div>
              </div>
              <div className="h-16 bg-gray-200 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">
            작성 대기 중인 리뷰
          </h3>
          <span className="text-sm text-orange-600 bg-orange-100 px-2 py-1 rounded-full">
            {incompleteReviews.length}개
          </span>
        </div>

        {incompleteReviews.length === 0 ? (
          <div className="text-center py-12">
            <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">
              작성 대기 중인 리뷰가 없습니다
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {incompleteReviews.map((review) => (
              <div
                key={review.id}
                className="border border-gray-100 rounded-lg p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    {review.partnerProfileImage ? (
                      <img
                        src={review.partnerProfileImage}
                        alt={review.partnerName}
                        className="w-12 h-12 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center">
                        <span className="text-gray-500 text-lg font-medium">
                          {review.partnerName.charAt(0)}
                        </span>
                      </div>
                    )}

                    <div>
                      <h4 className="font-medium text-gray-900">
                        {review.partnerName}
                      </h4>
                      <div className="flex items-center space-x-2 text-sm text-gray-500">
                        <span>{review.requestType}</span>
                        <span>•</span>
                        <div className="flex items-center space-x-1">
                          <Calendar className="w-3 h-3" />
                          <span>{formatDate(review.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleEditReview(review)}
                    className="flex items-center space-x-1 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>리뷰 작성</span>
                  </button>
                </div>

                <div className="mb-3">
                  <div className="mb-2">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                      리뷰 작성 대기 중
                    </span>
                  </div>
                  <p className="text-gray-700 text-sm leading-relaxed">
                    {review.comment || '아직 리뷰가 작성되지 않았습니다.'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editingReview && (
        <ReviewModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false)
            setEditingReview(null)
          }}
          partnerId={editingReview.partnerId}
          partnerName={editingReview.partnerName}
          requestId={editingReview.requestId}
          existingReview={{
            id: editingReview.id,
            rating: editingReview.rating,
            comment: editingReview.comment,
          }}
          onReviewSubmitted={handleReviewUpdated}
        />
      )}
    </>
  )
}