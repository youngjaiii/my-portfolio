import { useQuery } from '@tanstack/react-query'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Autoplay, EffectFade, Navigation, Pagination } from 'swiper/modules'
import type { Database } from '@/types/database'
import { getActiveBanners } from '@/lib/bannerApi'
import { useDevice } from '@/hooks/useDevice'

// Swiper 스타일은 globals.css에서 import하거나 여기서 제거

type Banner = Database['public']['Tables']['ad_banners']['Row']

interface BannerProps {
  location?: 'main' | 'partner_dashboard'
  height?: string
  mobileHeight?: string
  autoplay?: boolean
  showPagination?: boolean
  showNavigation?: boolean
  effect?: 'slide' | 'fade'
  className?: string
}

export function Banner({
  location = 'main',
  height = '400px',
  mobileHeight = '140px',
  autoplay = true,
  showPagination = true,
  showNavigation = true,
  effect = 'slide',
  className = '',
}: BannerProps) {
  const { isMobile } = useDevice()

  const {
    data: banners = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['banners', location],
    queryFn: async () => {
      try {
        const result = await getActiveBanners(location)
        if (!result.success || !result.data) {
          console.warn('배너 로딩 실패:', result.message)
          return [] // 에러 시 빈 배열 반환 (컴포넌트가 null을 반환하도록)
        }
        // 서버에서 이미 필터링된 배너를 반환
        return result.data
      } catch (err) {
        console.error('배너 조회 중 오류:', err)
        return [] // 에러 시 빈 배열 반환
      }
    },
    staleTime: 5 * 60 * 1000, // 5분간 캐시 유지
    gcTime: 10 * 60 * 1000, // 10분간 캐시 보관
    retry: 3, // 3번 재시도
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // 지수 백오프
    refetchOnWindowFocus: false, // 포커스 시 자동 리프레시 비활성화
  })

  const handleBannerClick = (banner: Banner) => {
    if (banner.link_url) {
      // 외부 링크인지 내부 링크인지 판단
      if (banner.link_url.startsWith('http')) {
        window.open(banner.link_url, '_blank', 'noopener,noreferrer')
      } else {
        window.location.href = banner.link_url
      }
    }
  }

  const getImageUrl = (banner: Banner) => {
    // 모바일용 이미지가 있고 모바일인 경우 모바일 이미지 사용
    if (isMobile && banner.mobile_background_image) {
      return banner.mobile_background_image
    }

    // 그 외의 경우 웹용 이미지 사용
    return banner.background_image
  }

  // 반응형 높이를 위한 CSS 변수들
  const cssVars = {
    '--desktop-height': height,
    '--mobile-height': mobileHeight,
  } as React.CSSProperties

  if (isLoading) {
    return null
  }

  if (error) {
    // 에러 발생 시 빈값 반환 (아무것도 표시하지 않음)
    return null
  }

  if (banners.length === 0) {
    return null
  }

  // 배너가 1개만 있는 경우 스와이퍼 없이 단일 배너 표시
  if (banners.length === 1) {
    const banner = banners[0]
    const imageUrl = getImageUrl(banner)

    return (
      <div
        className={`relative rounded-lg overflow-hidden banner-responsive ${banner.link_url ? 'cursor-pointer' : ''} ${className}`}
        style={{ ...cssVars, height }}
        onClick={() => handleBannerClick(banner)}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={banner.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
            <div className="text-white text-center">
              <h3 className="text-2xl font-bold mb-2">{banner.title}</h3>
              {banner.description && (
                <p className="text-lg opacity-90">{banner.description}</p>
              )}
            </div>
          </div>
        )}

        {/* 오버레이 정보 */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-6">
          <h3 className="text-white text-xl font-bold mb-1">{banner.title}</h3>
          {banner.description && (
            <p className="text-white/90 text-sm">{banner.description}</p>
          )}
        </div>
      </div>
    )
  }

  // 여러 배너가 있는 경우 스와이퍼 사용
  return (
    <div
      className={`relative rounded-lg overflow-hidden banner-responsive ${className}`}
      style={{ ...cssVars, height }}
    >
      <Swiper
        modules={[Navigation, Pagination, Autoplay, EffectFade]}
        spaceBetween={0}
        slidesPerView={1}
        navigation={showNavigation}
        pagination={showPagination ? { clickable: true } : false}
        autoplay={
          autoplay
            ? {
                delay: 5000,
                disableOnInteraction: false,
                pauseOnMouseEnter: true,
              }
            : false
        }
        effect={effect}
        fadeEffect={{ crossFade: true }}
        loop={banners.length > 1}
        className="w-full h-full banner-swiper"
      >
        {banners.map((banner) => {
          const imageUrl = getImageUrl(banner)

          return (
            <SwiperSlide key={banner.id}>
              <div
                className={`relative w-full h-full ${banner.link_url ? 'cursor-pointer' : ''}`}
                onClick={() => handleBannerClick(banner)}
              >
                {imageUrl ? (
                  <img
                    src={imageUrl}
                    alt={banner.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
                    <div className="text-white text-center">
                      <h3 className="text-2xl font-bold mb-2">
                        {banner.title}
                      </h3>
                      {banner.description && (
                        <p className="text-lg opacity-90">
                          {banner.description}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* 오버레이 정보 */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-6">
                  <h3 className="text-white text-xl font-bold mb-1">
                    {banner.title}
                  </h3>
                  {banner.description && (
                    <p className="text-white/90 text-sm">
                      {banner.description}
                    </p>
                  )}
                </div>
              </div>
            </SwiperSlide>
          )
        })}
      </Swiper>

      <style
        dangerouslySetInnerHTML={{
          __html: `
          .banner-swiper .swiper-button-next,
          .banner-swiper .swiper-button-prev {
            color: white;
            background: rgba(0, 0, 0, 0.5);
            width: 44px;
            height: 44px;
            border-radius: 50%;
            margin-top: -22px;
          }

          .banner-swiper .swiper-button-next:after,
          .banner-swiper .swiper-button-prev:after {
            font-size: 18px;
            font-weight: bold;
          }

          .banner-swiper .swiper-button-next:hover,
          .banner-swiper .swiper-button-prev:hover {
            background: rgba(0, 0, 0, 0.7);
          }

          .banner-swiper .swiper-pagination-bullet {
            background: rgba(255, 255, 255, 0.5);
            opacity: 1;
            width: 12px;
            height: 12px;
          }

          .banner-swiper .swiper-pagination-bullet-active {
            background: white;
          }

          .banner-swiper .swiper-pagination {
            bottom: 20px;
          }

          @media (max-width: 768px) {
            .banner-swiper .swiper-button-next,
            .banner-swiper .swiper-button-prev {
              display: none;
            }

            .banner-responsive {
              height: var(--mobile-height) !important;
            }
          }
        `,
        }}
      />
    </div>
  )
}
