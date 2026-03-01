import React, { useEffect, useState, useRef } from 'react'
import { Star, X } from 'lucide-react'
import { toast } from '@/components/ui/sonner'
import { Button } from '@/components'
import { edgeApi } from '@/lib/edgeApi'
import { motion } from 'framer-motion'
import { Capacitor } from '@capacitor/core'

interface ReviewModalProps {
  isOpen: boolean
  onClose: () => void
  partnerId: string
  partnerName: string
  requestId?: string
  existingReview?: {
    id: number
    rating: number
    comment: string
  } | null
  onReviewSubmitted?: () => void
}

export const ReviewModal: React.FC<ReviewModalProps> = ({
  isOpen,
  onClose,
  partnerId,
  partnerName,
  requestId,
  existingReview,
  onReviewSubmitted,
}) => {
  const [rating, setRating] = useState(existingReview?.rating || 0)
  const [comment, setComment] = useState(existingReview?.comment || '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [hoverRating, setHoverRating] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const starContainerRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef<{ x: number; rating: number } | null>(null)
  const isMobile = Capacitor.isNativePlatform() || window.innerWidth < 768

  const starWidth = 40 // 각 별의 너비 (w-10 = 40px)
  const starGap = 4 // 별 사이 간격 (space-x-1 = 4px)
  const totalWidth = starWidth * 5 + starGap * 4 // 전체 너비

  // 모달이 열릴 때마다 상태 초기화
  useEffect(() => {
    if (isOpen) {
      const initialRating = existingReview?.rating || 0
      setRating(initialRating)
      setComment(existingReview?.comment || '')
      setHoverRating(0)
      dragStartRef.current = null
    }
  }, [isOpen, existingReview])

  // 전역 드래그 이벤트 리스너
  useEffect(() => {
    if (!isDragging || !dragStartRef.current) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return
      const deltaX = e.clientX - dragStartRef.current.x
      const startRatingX = (dragStartRef.current.rating / 5) * totalWidth
      const currentX = startRatingX + deltaX
      const clampedX = Math.max(0, Math.min(totalWidth, currentX))
      const newRating = Math.round((clampedX / totalWidth) * 5 * 10) / 10
      setRating(Math.max(0, Math.min(5, newRating)))
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!dragStartRef.current) return
      e.preventDefault() // 스크롤 방지
      const deltaX = e.touches[0].clientX - dragStartRef.current.x
      const startRatingX = (dragStartRef.current.rating / 5) * totalWidth
      const currentX = startRatingX + deltaX
      const clampedX = Math.max(0, Math.min(totalWidth, currentX))
      const newRating = Math.round((clampedX / totalWidth) * 5 * 10) / 10
      setRating(Math.max(0, Math.min(5, newRating)))
    }

    const handleEnd = () => {
      setIsDragging(false)
      dragStartRef.current = null
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleEnd)
    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('touchend', handleEnd)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleEnd)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleEnd)
    }
  }, [isDragging, totalWidth])

  // 드래그 시작
  const handleDragStart = (event: React.MouseEvent | React.TouchEvent) => {
    event.preventDefault()
    setIsDragging(true)
    setHoverRating(0)
    const clientX = 'touches' in event ? event.touches[0].clientX : event.clientX
    dragStartRef.current = {
      x: clientX,
      rating: rating,
    }
  }

  // 별 클릭 핸들러
  const handleStarClick = (starValue: number) => {
    if (!isDragging) {
      setRating(starValue)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (rating === 0) {
      toast.error('별점을 선택해주세요')
      return
    }

    if (!comment.trim()) {
      toast.error('리뷰 내용을 작성해주세요')
      return
    }

    setIsSubmitting(true)

    try {
      const reviewData = {
        partner_id: partnerId,
        rating,
        comment: comment.trim(),
        request_id: requestId,
        existing_review_id: existingReview?.id?.toString(),
      }

      const response = await edgeApi.reviews.submit(reviewData)

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to submit review')
      }

      toast.success(existingReview ? '리뷰가 수정되었습니다' : '리뷰가 작성되었습니다!')
      onReviewSubmitted?.()
      onClose()
    } catch (error) {
      console.error('리뷰 처리 오류:', error)
      toast.error('리뷰 처리 중 오류가 발생했습니다')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        className="mt-auto flex w-full flex-col rounded-t-3xl bg-white shadow-2xl"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxHeight: '90vh',
          paddingBottom: isMobile ? 'calc(1rem + env(safe-area-inset-bottom, 0px))' : '1rem',
        }}
      >
        {/* 드래그 핸들 */}
        <div className="mx-auto my-3 h-1 w-12 rounded-full bg-gray-200" />

        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 pb-4">
          <div className='flex-1'>
          </div>
          <h2 className="flex-1 text-center text-lg font-semibold text-[#110f1a]">
            {existingReview ? '리뷰 수정' : '리뷰 작성'}
          </h2>
          <button
            onClick={onClose}
            className="h-8 w-8 flex flex-1 items-center justify-end rounded-full hover:bg-gray-100"
          >
            <X className="h-6 w-6 text-gray-500" />
          </button>
        </div>

        {/* 스크롤 가능한 콘텐츠 */}
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 별점 평가 - 드래그 가능 */}
            <p className="text-sm text-gray-600 mb-1">
              {partnerName} 파트너와의 경험은 어떠셨나요?
            </p>
            <div>
              <div 
                className="relative flex gap-1 items-center overflow-x-hidden touch-none" 
                ref={starContainerRef}
                onMouseDown={handleDragStart}
                onTouchStart={handleDragStart}
              >
                {/* 별들 (고정) */}
                <div className="flex items-center space-x-1 select-none">
                  {[1, 2, 3, 4, 5].map((star) => {
                    const starValue = star
                    const displayRating = hoverRating || rating
                    const isFull = displayRating >= starValue
                    const isPartial = displayRating > starValue - 1 && displayRating < starValue
                    const partialPercent = isPartial ? ((displayRating - (starValue - 1)) * 100) : 0

                    return (
                      <div
                        key={star}
                        className="relative w-10 h-10 flex-shrink-0 cursor-pointer"
                        onMouseEnter={() => !isDragging && setHoverRating(starValue)}
                        onMouseLeave={() => !isDragging && setHoverRating(0)}
                        onClick={() => !isDragging && handleStarClick(starValue)}
                      >
                        {/* 배경 별 (항상 표시) */}
                        <Star
                          className={`w-10 h-10 absolute inset-0 text-gray-300 transition-colors duration-150 ${
                            isFull ? 'text-yellow-400 fill-current' : ''
                          }`}
                        />
                        {/* 부분 채워진 별 */}
                        {isPartial && (
                          <div
                            className="absolute inset-0 overflow-hidden"
                            style={{ width: `${partialPercent}%` }}
                          >
                            <Star className="w-10 h-10 text-yellow-400 fill-current" />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                <p className="text-sm text-gray-500 text-center">
                  {rating > 0 ? ` / ${rating.toFixed(1)}점` : ''}
                </p>
              </div>
            </div>

            {/* 리뷰 내용 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                리뷰 내용 *
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="파트너와의 경험을 자세히 적어주세요..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#FE3A8F] focus:border-transparent"
                rows={4}
                maxLength={500}
              />
              <p className="text-sm text-gray-500 mt-1">{comment.length}/500</p>
            </div>

            {/* 버튼 */}
            <div className="flex space-x-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                className="flex-1"
              >
                취소
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={isSubmitting || rating === 0 || !comment.trim()}
                loading={isSubmitting}
                className="flex-1 bg-[#FE3A8F] hover:bg-[#fe4a9a]"
              >
                {existingReview ? '수정하기' : '리뷰 작성'}
              </Button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  )
}
