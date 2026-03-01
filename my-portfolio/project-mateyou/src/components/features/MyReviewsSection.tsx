import React, { useEffect, useState } from 'react'
import { Calendar, Edit3, Filter, MessageCircle, Star } from 'lucide-react'
import toast from 'react-hot-toast'
import { supabase } from '@/lib/supabase'
import { mateYouApi } from '@/lib/apiClient'
import { ReviewModal } from '@/components/modals/ReviewModal'

interface MyReview {
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

export const MyReviewsSection: React.FC = () => {
  const [reviews, setReviews] = useState<Array<MyReview>>([])
  const [incompleteReviews, setIncompleteReviews] = useState<Array<MyReview>>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'completed' | 'incomplete'>('completed')
  const [filterRating, setFilterRating] = useState<number | null>(null)
  const [sortBy, setSortBy] = useState<
    'newest' | 'oldest' | 'rating_high' | 'rating_low'
  >('newest')
  const [editingReview, setEditingReview] = useState<MyReview | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)

  useEffect(() => {
    loadMyReviews()
  }, [])

  const loadMyReviews = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      // Express API로 리뷰 조회 (N+1 문제 해결)
      const [completedResponse, incompleteResponse] = await Promise.all([
        mateYouApi.reviews.getMyReviews(1, 100), // 완성된 리뷰
        mateYouApi.reviews.getIncompleteReviews(), // 미완성 리뷰
      ])

      // 완성된 리뷰 처리
      const completedReviews: Array<MyReview> = []
      if (completedResponse.data.success && completedResponse.data.data) {
        const reviewsData = Array.isArray(completedResponse.data.data)
          ? completedResponse.data.data
          : []

        for (const review of reviewsData) {
          const partner = review.partners
          let requestType = '일반 리뷰'
          let requestId: string | undefined

          // review_code에서 요청 타입 추출
          if (review.review_code?.startsWith('REQ_')) {
            requestId = review.review_code.replace('REQ_', '')
            requestType = '의뢰 리뷰'
          }

          completedReviews.push({
            id: review.id,
            partnerId: review.target_partner_id,
            partnerName: partner?.partner_name || partner?.members?.name || '알 수 없음',
            partnerProfileImage: partner?.members?.profile_image,
            rating: review.rating || 0,
            comment: review.comment || '',
            requestType,
            createdAt: review.created_at,
            requestId,
          })
        }
      }

      // 미완성 리뷰 처리
      const incompleteReviews: Array<MyReview> = []
      if (incompleteResponse.data.success && incompleteResponse.data.data) {
        const reviewsData = Array.isArray(incompleteResponse.data.data)
          ? incompleteResponse.data.data
          : []

        for (const review of reviewsData) {
          const partner = review.partners
          let requestType = '일반 리뷰'
          let requestId: string | undefined

          if (review.review_code?.startsWith('REQ_')) {
            requestId = review.review_code.replace('REQ_', '')
            requestType = '의뢰 리뷰'
          }

          incompleteReviews.push({
            id: review.id,
            partnerId: review.target_partner_id,
            partnerName: partner?.partner_name || partner?.members?.name || '알 수 없음',
            partnerProfileImage: partner?.members?.profile_image,
            rating: review.rating || 0,
            comment: review.comment || '',
            requestType,
            createdAt: review.created_at,
            requestId,
          })
        }
      }

      setReviews(completedReviews)
      setIncompleteReviews(incompleteReviews)
    } catch (error) {
      console.error('리뷰 로딩 오류:', error)
      toast.error('리뷰 목록을 불러오는데 실패했습니다')
    } finally {
      setLoading(false)
    }
  }

  const handleEditReview = (review: MyReview) => {
    setEditingReview(review)
    setShowEditModal(true)
  }

  const handleReviewUpdated = () => {
    loadMyReviews()
    setShowEditModal(false)
    setEditingReview(null)
  }

  const currentReviews = activeTab === 'completed' ? reviews : incompleteReviews

  const filteredAndSortedReviews = currentReviews
    .filter((review) => {
      if (activeTab === 'incomplete') return true // 미완성 리뷰는 별점 필터 적용하지 않음
      return filterRating === null || review.rating === filterRating
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          )
        case 'oldest':
          return (
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          )
        case 'rating_high':
          return b.rating - a.rating
        case 'rating_low':
          return a.rating - b.rating
        default:
          return 0
      }
    })

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`w-4 h-4 ${
          i < rating ? 'text-yellow-400 fill-current' : 'text-gray-300'
        }`}
      />
    ))
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          내가 작성한 리뷰
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
      <div className="bg-white rounded-lg shadow-sm border p-6">
        {/* 탭 메뉴 */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('completed')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'completed'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              완성된 리뷰 ({reviews.length})
            </button>
            <button
              onClick={() => setActiveTab('incomplete')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'incomplete'
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              미완성 리뷰 ({incompleteReviews.length})
            </button>
          </nav>
        </div>

        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">
            {activeTab === 'completed' ? '완성된 리뷰' : '미완성 리뷰'}
          </h3>

          <div className="flex items-center space-x-3">
            {/* 별점 필터 - 완성된 리뷰에서만 표시 */}
            {activeTab === 'completed' && (
              <div className="flex items-center space-x-1">
                <Filter className="w-4 h-4 text-gray-400" />
                <select
                  value={filterRating || ''}
                  onChange={(e) =>
                    setFilterRating(
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                  className="text-sm border border-gray-300 rounded px-2 py-1"
                >
                  <option value="">모든 별점</option>
                  {[5, 4, 3, 2, 1].map((rating) => (
                    <option key={rating} value={rating}>
                      {rating}점
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* 정렬 */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="text-sm border border-gray-300 rounded px-2 py-1"
            >
              <option value="newest">최신순</option>
              <option value="oldest">오래된순</option>
              <option value="rating_high">별점 높은순</option>
              <option value="rating_low">별점 낮은순</option>
            </select>
          </div>
        </div>

        {filteredAndSortedReviews.length === 0 ? (
          <div className="text-center py-12">
            <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">
              {activeTab === 'completed'
                ? reviews.length === 0
                  ? '아직 작성한 리뷰가 없습니다'
                  : '필터 조건에 맞는 리뷰가 없습니다'
                : incompleteReviews.length === 0
                  ? '미완성 리뷰가 없습니다'
                  : '조건에 맞는 미완성 리뷰가 없습니다'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredAndSortedReviews.map((review) => (
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
                    <span>편집</span>
                  </button>
                </div>

                <div className="mb-3">
                  {activeTab === 'incomplete' ? (
                    <div className="mb-2">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                        리뷰 작성 대기 중
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-1 mb-2">
                      {renderStars(review.rating)}
                      <span className="text-sm text-gray-600 ml-2">
                        {review.rating}.0
                      </span>
                    </div>
                  )}
                  <p className="text-gray-700 text-sm leading-relaxed">
                    {review.comment || (activeTab === 'incomplete' ? '아직 리뷰가 작성되지 않았습니다.' : '')}
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
