import React from 'react'
import { useReviewNotification } from '@/hooks/useReviewNotification'
import { ReviewModal } from '@/components/modals/ReviewModal'

interface ReviewNotificationProviderProps {
  children: React.ReactNode
}

export const ReviewNotificationProvider: React.FC<
  ReviewNotificationProviderProps
> = ({ children }) => {
  const {
    currentReview,
    showReviewModal,
    closeReviewModal,
    handleReviewSubmitted,
  } = useReviewNotification()

  return (
    <>
      {children}

      {currentReview && (
        <ReviewModal
          isOpen={showReviewModal}
          onClose={closeReviewModal}
          partnerId={currentReview.partnerId}
          partnerName={currentReview.partnerName}
          requestId={currentReview.requestId}
          onReviewSubmitted={handleReviewSubmitted}
        />
      )}
    </>
  )
}
