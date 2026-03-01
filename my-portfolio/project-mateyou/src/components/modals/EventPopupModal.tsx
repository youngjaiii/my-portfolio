import { useState, useRef, useCallback, useEffect } from 'react'
import { SlideSheet } from '@/components/ui/SlideSheet'
import { Button } from '@/components/ui/Button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const POPUP_STORAGE_KEY = 'event_popup_hide_until'

interface EventBanner {
  id: string
  imageUrl?: string
  linkUrl?: string
  title?: string
}

interface EventPopupModalProps {
  isOpen: boolean
  onClose: () => void
  imageUrl?: string  // 단일 이미지 (하위 호환)
  linkUrl?: string   // 단일 링크 (하위 호환)
  events?: EventBanner[]  // 여러 이벤트
}

export function EventPopupModal({ isOpen, onClose, imageUrl, linkUrl, events = [] }: EventPopupModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const touchStartX = useRef<number | null>(null)
  const touchEndX = useRef<number | null>(null)
  const autoPlayRef = useRef<NodeJS.Timeout | null>(null)

  // 단일 이미지/링크가 있으면 events 배열로 변환
  const eventList: EventBanner[] = events.length > 0 
    ? events 
    : imageUrl 
      ? [{ id: 'single', imageUrl, linkUrl }] 
      : []

  const handleHideToday = () => {
    const tomorrow = new Date()
    tomorrow.setHours(24, 0, 0, 0)
    localStorage.setItem(POPUP_STORAGE_KEY, tomorrow.getTime().toString())
    onClose()
  }

  const handleImageClick = () => {
    const currentEvent = eventList[currentIndex]
    if (currentEvent?.linkUrl) {
      window.open(currentEvent.linkUrl, '_blank')
    }
  }

  // 다음 슬라이드
  const goToNext = useCallback(() => {
    if (isTransitioning || eventList.length <= 1) return
    setIsTransitioning(true)
    setCurrentIndex((prev) => (prev + 1) % eventList.length)
    setTimeout(() => setIsTransitioning(false), 300)
  }, [eventList.length, isTransitioning])

  // 이전 슬라이드
  const goToPrev = useCallback(() => {
    if (isTransitioning || eventList.length <= 1) return
    setIsTransitioning(true)
    setCurrentIndex((prev) => (prev - 1 + eventList.length) % eventList.length)
    setTimeout(() => setIsTransitioning(false), 300)
  }, [eventList.length, isTransitioning])

  // 특정 슬라이드로 이동
  const goToSlide = (index: number) => {
    if (isTransitioning || index === currentIndex) return
    setIsTransitioning(true)
    setCurrentIndex(index)
    setTimeout(() => setIsTransitioning(false), 300)
  }

  // 자동 슬라이드
  useEffect(() => {
    if (!isOpen || eventList.length <= 1) return

    autoPlayRef.current = setInterval(() => {
      goToNext()
    }, 4000)

    return () => {
      if (autoPlayRef.current) {
        clearInterval(autoPlayRef.current)
      }
    }
  }, [isOpen, eventList.length, goToNext])

  // 터치 이벤트 핸들러
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX
  }

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return
    
    const diff = touchStartX.current - touchEndX.current
    const threshold = 50

    if (Math.abs(diff) > threshold) {
      if (diff > 0) {
        goToNext()
      } else {
        goToPrev()
      }
    }

    touchStartX.current = null
    touchEndX.current = null
  }

  // 이벤트가 없으면 렌더링 안함
  if (eventList.length === 0) {
    return null
  }

  return (
    <SlideSheet
      isOpen={isOpen}
      onClose={onClose}
      title="이벤트"
      initialHeight={0.7}
      minHeight={0.5}
      maxHeight={0.85}
      zIndex={99999}
      noPadding
      footer={
        <div className="flex gap-2 px-4">
          <Button
            variant="outline"
            className="flex-1 rounded-full border-gray-300 text-gray-600"
            onClick={handleHideToday}
          >
            오늘 하루 안 보기
          </Button>
          <Button
            className="flex-1 rounded-full bg-[#FE3A8F] text-white hover:bg-[#E0357F]"
            onClick={onClose}
          >
            닫기
          </Button>
        </div>
      }
    >
      {/* 이벤트 이미지 스와이퍼 */}
      <div 
        className="relative w-full h-full overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* 슬라이드 트랙 */}
        <div 
          className="flex h-full transition-transform duration-300 ease-in-out"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {eventList.map((event) => (
            <div 
              key={event.id} 
              className="w-full h-full flex-shrink-0 cursor-pointer"
              onClick={handleImageClick}
            >
              {event.imageUrl ? (
                <img
                  src={event.imageUrl}
                  alt={event.title || '이벤트'}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-[#FE3A8F] to-[#FF6B9D] flex items-center justify-center">
                  <div className="text-center text-white p-6">
                    <p className="text-4xl mb-4">🎉</p>
                    <p className="text-2xl font-bold mb-2">이벤트</p>
                    <p className="text-sm opacity-90">{event.title || '새로운 이벤트가 준비되었어요!'}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 이전/다음 버튼 (2개 이상일 때만 표시) */}
        {eventList.length > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation()
                goToPrev()
              }}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/30 text-white hover:bg-black/50 transition-colors"
              aria-label="이전 이벤트"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                goToNext()
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/30 text-white hover:bg-black/50 transition-colors"
              aria-label="다음 이벤트"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}

        {/* 인디케이터 (2개 이상일 때만 표시) */}
        {eventList.length > 1 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
            {eventList.map((_, index) => (
              <button
                key={index}
                onClick={() => goToSlide(index)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  index === currentIndex ? 'bg-white' : 'bg-white/50'
                }`}
                aria-label={`이벤트 ${index + 1}로 이동`}
              />
            ))}
          </div>
        )}
      </div>
    </SlideSheet>
  )
}

// 팝업을 표시해야 하는지 확인하는 유틸리티 함수
export function shouldShowEventPopup(): boolean {
  if (typeof window === 'undefined') return false
  
  const hideUntil = localStorage.getItem(POPUP_STORAGE_KEY)
  if (!hideUntil) return true
  
  const hideUntilTime = parseInt(hideUntil, 10)
  return Date.now() > hideUntilTime
}
