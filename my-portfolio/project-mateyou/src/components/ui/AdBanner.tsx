import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLocation } from '@tanstack/react-router'

const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

interface AdBannerData {
  id: string
  imageUrl?: string
  linkUrl?: string
  altText?: string
}

interface AdBannerProps {
  className?: string
  autoPlayInterval?: number // 자동 슬라이드 간격 (ms)
}

export function AdBanner({ 
  className = '', 
  autoPlayInterval = 4000 
}: AdBannerProps) {
  const location = useLocation()
  const [banners, setBanners] = useState<AdBannerData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const touchStartX = useRef<number | null>(null)
  const touchEndX = useRef<number | null>(null)
  const autoPlayRef = useRef<NodeJS.Timeout | null>(null)
  const hasFetchedRef = useRef(false)

  // 새포스트 페이지에서는 숨김 (모든 hooks 호출 후에 체크)
  const isCreatePage = location.pathname.startsWith('/feed/create')

  // API에서 배너 데이터 가져오기
  useEffect(() => {
    const fetchBanners = async () => {
      if (hasFetchedRef.current) return
      hasFetchedRef.current = true

      try {
        const response = await fetch(
          `${EDGE_FUNCTIONS_URL}/functions/v1/api-banners`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
              'apikey': SUPABASE_ANON_KEY,
            },
          }
        )

        const result = await response.json()

        if (result.success && Array.isArray(result.data) && result.data.length > 0) {
          const formattedBanners = result.data.map((banner: any) => ({
            id: banner.id,
            imageUrl: banner.image_url,
            linkUrl: banner.link_url,
            altText: banner.title || banner.alt_text || '광고',
          }))
          setBanners(formattedBanners)
        }
      } catch (err) {
        console.error('[AdBanner] Failed to fetch banners:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchBanners()
  }, [])

  const activeBanners = banners

  // 다음 슬라이드
  const goToNext = useCallback(() => {
    if (isTransitioning || activeBanners.length <= 1) return
    setIsTransitioning(true)
    setCurrentIndex((prev) => (prev + 1) % activeBanners.length)
    setTimeout(() => setIsTransitioning(false), 300)
  }, [activeBanners.length, isTransitioning])

  // 이전 슬라이드
  const goToPrev = useCallback(() => {
    if (isTransitioning || activeBanners.length <= 1) return
    setIsTransitioning(true)
    setCurrentIndex((prev) => (prev - 1 + activeBanners.length) % activeBanners.length)
    setTimeout(() => setIsTransitioning(false), 300)
  }, [activeBanners.length, isTransitioning])

  // 특정 슬라이드로 이동
  const goToSlide = (index: number) => {
    if (isTransitioning || index === currentIndex) return
    setIsTransitioning(true)
    setCurrentIndex(index)
    setTimeout(() => setIsTransitioning(false), 300)
  }

  // 자동 슬라이드
  useEffect(() => {
    if (activeBanners.length <= 1) return

    autoPlayRef.current = setInterval(() => {
      goToNext()
    }, autoPlayInterval)

    return () => {
      if (autoPlayRef.current) {
        clearInterval(autoPlayRef.current)
      }
    }
  }, [activeBanners.length, autoPlayInterval, goToNext])

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
    const threshold = 50 // 최소 스와이프 거리

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

  const handleClick = () => {
    const currentBanner = activeBanners[currentIndex]
    if (currentBanner?.linkUrl) {
      window.open(currentBanner.linkUrl, '_blank')
    }
  }

  // 새포스트 페이지에서는 숨김
  if (isCreatePage) {
    return null
  }

  // 로딩 중이거나 배너가 없으면 렌더링 안함
  if (isLoading) {
    return (
      <div className={`relative w-full bg-gray-100 overflow-hidden flex-shrink-0 ${className}`} style={{ minHeight: '80px' }}>
        <div className="w-full h-20 bg-gradient-to-r from-gray-200 to-gray-300 animate-pulse" />
      </div>
    )
  }

  if (activeBanners.length === 0) {
    return null
  }

  return (
    <div className={`relative w-full bg-gray-100 overflow-hidden flex-shrink-0 ${className}`} style={{ minHeight: '80px' }}>
      {/* 슬라이드 컨테이너 */}
      <div 
        className="relative w-full cursor-pointer"
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* 슬라이드 트랙 */}
        <div 
          className="flex transition-transform duration-300 ease-in-out"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {activeBanners.map((banner) => (
            <div key={banner.id} className="w-full flex-shrink-0">
              {banner.imageUrl ? (
                <img
                  src={banner.imageUrl}
                  alt={banner.altText || '광고'}
                  className="w-full h-auto object-cover"
                  draggable={false}
                />
              ) : (
                // 플레이스홀더 배너
                <div className="w-full h-20 bg-gradient-to-r from-[#FE3A8F] to-[#FF6B9D] flex items-center justify-center">
                  <p className="text-white text-sm font-medium">광고 영역</p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 이전/다음 버튼 (2개 이상일 때만 표시) */}
        {activeBanners.length > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation()
                goToPrev()
              }}
              className="absolute left-1 top-1/2 -translate-y-1/2 p-1 rounded-full bg-black/20 text-white hover:bg-black/40 transition-colors"
              aria-label="이전 배너"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                goToNext()
              }}
              className="absolute right-6 top-1/2 -translate-y-1/2 p-1 rounded-full bg-black/20 text-white hover:bg-black/40 transition-colors"
              aria-label="다음 배너"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      {/* 인디케이터 (2개 이상일 때만 표시) */}
      {activeBanners.length > 1 && (
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1">
          {activeBanners.map((_, index) => (
            <button
              key={index}
              onClick={() => goToSlide(index)}
              className={`w-1.5 h-1.5 rounded-full transition-colors ${
                index === currentIndex ? 'bg-white' : 'bg-white/50'
              }`}
              aria-label={`배너 ${index + 1}로 이동`}
            />
          ))}
        </div>
      )}

      {/* AD 라벨 */}
      <span className="absolute bottom-1 left-1 px-1 py-0.5 bg-black/50 text-white text-[10px] rounded">
        AD
      </span>
    </div>
  )
}
