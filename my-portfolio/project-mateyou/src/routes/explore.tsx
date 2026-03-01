import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Loader2, Package, LayoutGrid, Image, Store, Truck } from 'lucide-react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Autoplay, Navigation, Pagination } from 'swiper/modules'
import type { Swiper as SwiperType } from 'swiper'
import { Typography, AdBanner } from '@/components'
import { useDevice } from '@/hooks/useDevice'
import { getAvatarBgColor, getInitialsFromName } from '@/utils/avatarFallback'
import { edgeApi } from '@/lib/apiClient'
import { useAuthStore } from '@/store/useAuthStore'
import { toggleFollowPartner } from '@/utils/followApi'
import { toast } from 'sonner'

type ExploreSearch = {
  tab?: 'partner' | 'store'
  category?: string
  partner_category?: string
}

export const Route = createFileRoute('/explore' as const)({
  component: ExplorePage,
  validateSearch: (search: Record<string, unknown>): ExploreSearch => ({
    tab: search.tab === 'store' ? 'store' : 'partner',
    category: typeof search.category === 'string' ? search.category : undefined,
    partner_category: typeof search.partner_category === 'string' ? search.partner_category : undefined,
  }),
})

const SUPABASE_PUBLIC_BASE =
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL
    ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/`
    : ''
const EDGE_FUNCTIONS_URL = import.meta.env?.VITE_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = import.meta.env?.VITE_SUPABASE_ANON_KEY || ''

type ExplorerPartner = {
  id: string
  partner_id: string
  partner_name: string | null
  partner_message: string | null
  profile_image: string | null
  member_code: string | null
  member_name: string | null
  categories: Array<{ category_id: number | null; detail_category_id: number | null }>
  banners: string | null
  sort_order: number
}

type ExplorerCategoryData = {
  category: {
    id: string
    name: string
    hashtag: string | null
    is_pinned: boolean
    sort_order: number
    partner_category_id: number | null
    section_type?: string | null
  }
  partners: ExplorerPartner[]
}

type PartnerRankingItemType = {
  rank: number
  partner_id: string
  partner_name: string
  profile_image: string | null
  member_code: string | null
  value: number
  follow_count: number
  is_followed: boolean
}

const CATEGORY_LABELS: Record<number, string> = {
  1: '메이트',
  2: '샐럽/모델',
  3: '메이드',
  4: '지하돌',
  5: '코스어',
}

type StoreProductType = 'all' | 'digital' | 'on_site' | 'delivery'

type StoreProduct = {
  product_id: string
  partner_id: string
  name: string
  description?: string
  price: number
  product_type: 'digital' | 'on_site' | 'delivery'
  source: 'partner' | 'collaboration'
  stock?: number
  thumbnail_url?: string
  is_active: boolean
  shipping_fee_base?: number
  shipping_fee_remote?: number
  partner?: {
    id: string
    partner_name: string
    member?: { id: string; name: string; profile_image?: string }
  }
}

const STORE_CATEGORIES: { id: StoreProductType; label: string; icon: typeof Package; bgColor: string; iconColor: string }[] = [
  { id: 'all', label: '전체', icon: LayoutGrid, bgColor: 'bg-violet-100', iconColor: 'text-violet-500' },
  { id: 'digital', label: '디지털', icon: Image, bgColor: 'bg-sky-100', iconColor: 'text-sky-500' },
  { id: 'on_site', label: '현장수령', icon: Store, bgColor: 'bg-rose-100', iconColor: 'text-rose-500' },
  { id: 'delivery', label: '택배', icon: Truck, bgColor: 'bg-amber-100', iconColor: 'text-amber-500' },
]

type StoreBanner = {
  id: string
  banner: string
  sort_order: number
  created_at: string
}

type RecommendedProduct = {
  product_id: string
  name: string
  price: number
  thumbnail_url?: string
  stock?: number
  purchase_count: number
}

type RecommendedPartner = {
  id: string
  partner_id: string
  sort_order: number
  partner?: {
    id: string
    partner_name: string | null
    member?: {
      id: string
      name: string | null
      profile_image: string | null
      member_code: string | null
    }
  }
  products: RecommendedProduct[]
}

function resolveImageUrl(raw?: string | null): string | undefined {
  if (!raw) return undefined
  if (/^https?:\/\//i.test(raw) || raw.startsWith('data:')) return raw
  if (!SUPABASE_PUBLIC_BASE) return undefined
  return `${SUPABASE_PUBLIC_BASE}${raw.replace(/^\/+/, '')}`
}

type PartnerCategoryTab = 'home' | 1 | 2 | 3 | 4 | 5

const PARTNER_CATEGORY_TABS: { id: PartnerCategoryTab; label: string }[] = [
  { id: 'home', label: '홈' },
  { id: 1, label: '게임 메이트' },
  { id: 2, label: '샐럽/모델' },
  { id: 3, label: '메이드' },
  { id: 4, label: '지하돌' },
  { id: 5, label: '코스어' },
]

// 게임 서브카테고리 (detail_category_id 매핑)
const GAME_SUB_CATEGORIES: Record<number, string> = {
  1: '롤',
  2: '배틀그라운드',
  3: '오버워치',
  4: '발로란트',
  5: '스팀게임',
  6: '그외게임',
}

function ExplorePage() {
  const navigate = useNavigate()
  const { tab, partner_category } = useSearch({ from: '/explore' })
  const mainTab = tab || 'partner'
  
  // URL 파라미터에서 partner_category 파싱
  const getInitialPartnerTab = (): PartnerCategoryTab => {
    if (!partner_category) return 'home'
    const numId = parseInt(partner_category)
    if ([1, 2, 3, 4, 5].includes(numId)) return numId as 1 | 2 | 3 | 4 | 5
    return 'home'
  }
  const [selectedPartnerTab, setSelectedPartnerTab] = useState<PartnerCategoryTab>(getInitialPartnerTab)
  const [explorerData, setExplorerData] = useState<ExplorerCategoryData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const { isMobile } = useDevice()

  // Store tab state
  const [storeProductType, setStoreProductType] = useState<StoreProductType>('all')
  const [storeProducts, setStoreProducts] = useState<StoreProduct[]>([])
  const [storePage, setStorePage] = useState(1)
  const [storeHasMore, setStoreHasMore] = useState(true)
  const [isStoreLoading, setIsStoreLoading] = useState(false)
  const [isStoreLoadingMore, setIsStoreLoadingMore] = useState(false)
  const [storeError, setStoreError] = useState<string | null>(null)
  const storeLoadMoreRef = useRef<HTMLDivElement>(null)
  const [storeBanners, setStoreBanners] = useState<StoreBanner[]>([])
  const [isStoreBannersLoading, setIsStoreBannersLoading] = useState(false)
  const [recommendedPartners, setRecommendedPartners] = useState<RecommendedPartner[]>([])
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0)

  // 탭 스와이프 상태
  const tabContainerRef = useRef<HTMLDivElement>(null)
  const tabDragRef = useRef({ startX: 0, startY: 0, currentX: 0, active: false, locked: false, horizontal: false })
  const tabIndex = mainTab === 'store' ? 1 : 0

  useEffect(() => {
    if (!isMobile) return
    const el = tabContainerRef.current
    if (!el) return

    const drag = tabDragRef.current
    const onStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('.swiper-container, .swiper, [class*="swiper"], [data-explore-carousel]')) return
      drag.startX = e.touches[0].clientX
      drag.startY = e.touches[0].clientY
      drag.currentX = drag.startX
      drag.active = true
      drag.locked = false
      drag.horizontal = false
    }
    const onMove = (e: TouchEvent) => {
      if (!drag.active) return
      drag.currentX = e.touches[0].clientX
      const dx = drag.currentX - drag.startX
      const dy = e.touches[0].clientY - drag.startY
      if (!drag.locked) {
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
          drag.locked = true
          const isHoriz = Math.abs(dx) > Math.abs(dy)
          const atLeftEdge = tabIndex === 0 && dx > 0
          const atRightEdge = tabIndex === 1 && dx < 0
          drag.horizontal = isHoriz && !atLeftEdge && !atRightEdge
          if (!drag.horizontal) { drag.active = false; return }
        } else return
      }
      if (!drag.horizontal) return
      e.preventDefault()
      const base = -tabIndex * 100
      const pct = (dx / window.innerWidth) * 100
      const clamped = Math.max(-100, Math.min(0, base + pct))
      el.style.transition = 'none'
      el.style.translate = `${clamped}% 0`
      const indicator = document.getElementById('explore-tab-indicator')
      if (indicator) {
        const progress = Math.max(0, Math.min(1, (-clamped) / 100))
        indicator.style.transition = 'none'
        indicator.style.left = `${progress * 50}%`
      }
    }
    const onEnd = () => {
      if (!drag.active || !drag.horizontal) { drag.active = false; return }
      drag.active = false
      const dx = drag.currentX - drag.startX
      const threshold = window.innerWidth * 0.25
      let newTab: 'partner' | 'store' = mainTab === 'store' ? 'store' : 'partner'
      if (dx < -threshold && mainTab === 'partner') newTab = 'store'
      else if (dx > threshold && mainTab === 'store') newTab = 'partner'
      const newIdx = newTab === 'store' ? 1 : 0
      el.style.transition = 'translate 0.3s ease-out'
      el.style.translate = `${-newIdx * 100}% 0`
      const indicator = document.getElementById('explore-tab-indicator')
      if (indicator) {
        indicator.style.transition = 'left 0.3s ease-out'
        indicator.style.left = `${newIdx * 50}%`
      }
      if (newTab !== mainTab) {
        setTimeout(() => {
          el.style.transition = ''
          el.style.translate = ''
          if (indicator) { indicator.style.transition = ''; indicator.style.left = '' }
          navigate({ to: '/explore', search: { tab: newTab } })
        }, 310)
      } else {
        setTimeout(() => {
          el.style.transition = ''
          el.style.translate = ''
          if (indicator) { indicator.style.transition = ''; indicator.style.left = '' }
        }, 310)
      }
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
    }
  }, [isMobile, mainTab, tabIndex, navigate])

  // 파트너 랭킹 상태
  const [partnerRankings, setPartnerRankings] = useState<PartnerRankingItemType[]>([])
  const [isRankingLoading, setIsRankingLoading] = useState(false)

  const fetchExplorerData = useCallback(async (partnerTab: PartnerCategoryTab) => {
    if (!EDGE_FUNCTIONS_URL) {
      setErrorMessage('환경 변수 설정이 필요합니다.')
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    setErrorMessage(null)

    try {
      // 홈: partner_category_id 없이 호출, 나머지: 해당 ID로 호출
      const url = partnerTab === 'home'
        ? `${EDGE_FUNCTIONS_URL}/functions/v1/api-explore`
        : `${EDGE_FUNCTIONS_URL}/functions/v1/api-explore?partner_category_id=${partnerTab}`

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      })

      const result = await response.json()
      if (!response.ok || result?.success === false) {
        throw new Error(result?.error?.message || '데이터를 불러오지 못했습니다.')
      }

      const data = result?.data ?? []
      setExplorerData(data)
      
      // 첫 번째 non-pinned 카테고리 선택
      const firstNonPinned = data.find((d: ExplorerCategoryData) => !d.category.is_pinned)
      setSelectedCategoryId(firstNonPinned?.category.id || null)
    } catch (error: any) {
      console.error('탐색 데이터 조회 실패:', error)
      setErrorMessage(error?.message || '데이터를 불러오지 못했습니다.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // 파트너 탭 변경 시 API 재호출
  useEffect(() => {
    fetchExplorerData(selectedPartnerTab)
  }, [selectedPartnerTab, fetchExplorerData])

  // 파트너 랭킹 API 호출
  const fetchPartnerRanking = useCallback(async (categoryId?: number) => {
    setIsRankingLoading(true)
    try {
      const response = await edgeApi.explore.getPartnerRanking({ sort_by: 'total_earnings', limit: 30, category_id: categoryId })
      const data = (response as any)?.data
      if (data?.rankings && Array.isArray(data.rankings)) {
        setPartnerRankings(data.rankings)
      }
    } catch (error) {
      console.error('파트너 랭킹 조회 실패:', error)
    } finally {
      setIsRankingLoading(false)
    }
  }, [])

  // 파트너 탭일 때 랭킹 데이터 조회 (카테고리 탭 변경 시에도 재호출)
  useEffect(() => {
    if (mainTab === 'partner') {
      const categoryId = selectedPartnerTab === 'home' ? undefined : selectedPartnerTab
      fetchPartnerRanking(categoryId)
    }
  }, [mainTab, selectedPartnerTab, fetchPartnerRanking])

  // Store products fetch function
  const fetchStoreProducts = useCallback(async (productType: StoreProductType, page: number, append: boolean = false) => {
    if (!EDGE_FUNCTIONS_URL) {
      setStoreError('환경 변수 설정이 필요합니다.')
      return
    }

    if (append) {
      setIsStoreLoadingMore(true)
    } else {
      setIsStoreLoading(true)
    }
    setStoreError(null)

    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', '10')
      if (productType !== 'all') {
        params.set('product_type', productType)
      }

      const response = await fetch(
        `${EDGE_FUNCTIONS_URL}/functions/v1/api-store-products?${params.toString()}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
        }
      )

      const result = await response.json()
      if (!response.ok || result?.success === false) {
        throw new Error(result?.error?.message || '상품 데이터를 불러오지 못했습니다.')
      }

      const newProducts = result?.data ?? []
      const pagination = result?.pagination || result?.meta
      const totalPages = pagination?.totalPages || 1

      if (append) {
        setStoreProducts(prev => [...prev, ...newProducts])
      } else {
        setStoreProducts(newProducts)
      }
      setStoreHasMore(page < totalPages)
    } catch (error: any) {
      console.error('스토어 상품 조회 실패:', error)
      setStoreError(error?.message || '상품 데이터를 불러오지 못했습니다.')
    } finally {
      setIsStoreLoading(false)
      setIsStoreLoadingMore(false)
    }
  }, [])

  // Store banners fetch
  const fetchStoreBanners = useCallback(async () => {
    if (!EDGE_FUNCTIONS_URL) return
    setIsStoreBannersLoading(true)
    try {
      const response = await fetch(
        `${EDGE_FUNCTIONS_URL}/functions/v1/api-store-banners`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
        }
      )
      const result = await response.json()
      if (result?.success && Array.isArray(result.data)) {
        setStoreBanners(result.data)
      }
    } catch (error) {
      console.error('스토어 배너 조회 실패:', error)
    } finally {
      setIsStoreBannersLoading(false)
    }
  }, [])

  // Recommended partners fetch
  const fetchRecommendedPartners = useCallback(async () => {
    if (!EDGE_FUNCTIONS_URL) return

    try {
      const response = await fetch(
        `${EDGE_FUNCTIONS_URL}/functions/v1/api-store-recommended/products`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
        }
      )
      const result = await response.json()
      if (result?.success && Array.isArray(result.data)) {
        setRecommendedPartners(result.data)
      }
    } catch (error) {
      console.error('추천 파트너 조회 실패:', error)
    }
  }, [])

  // Store tab data fetch - 초기 로드
  useEffect(() => {
    if (mainTab === 'store') {
      setStorePage(1)
      setStoreHasMore(true)
      fetchStoreProducts(storeProductType, 1, false)
      fetchStoreBanners()
      fetchRecommendedPartners()
    }
  }, [mainTab, storeProductType, fetchStoreProducts, fetchStoreBanners, fetchRecommendedPartners])

  // Store infinite scroll
  useEffect(() => {
    if (mainTab !== 'store' || !storeLoadMoreRef.current) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && storeHasMore && !isStoreLoading && !isStoreLoadingMore) {
          const nextPage = storePage + 1
          setStorePage(nextPage)
          fetchStoreProducts(storeProductType, nextPage, true)
        }
      },
      { threshold: 0.1 }
    )

    observer.observe(storeLoadMoreRef.current)
    return () => observer.disconnect()
  }, [mainTab, storeHasMore, isStoreLoading, isStoreLoadingMore, storePage, storeProductType, fetchStoreProducts])

  const pinnedCategories = explorerData.filter(d => d.category.is_pinned)
  const normalCategories = explorerData.filter(d => !d.category.is_pinned)
  const selectedCategoryData = normalCategories.find(d => d.category.id === selectedCategoryId)

  return (
    <div
      className={`flex flex-col overflow-x-hidden bg-white text-[#110f1a] ${
        isMobile ? 'h-full overflow-hidden pb-20' : 'min-h-0 flex-1 flex flex-col'
      }`}
    >
      {/* PC: sticky 탭을 max-w-xl 밖에서 전체 폭으로 렌더링 */}
      {!isMobile && (
        <div className="sticky top-0 z-20 bg-white border-b border-gray-200">
          <div className="container mx-auto max-w-xl px-4 sm:px-6 lg:px-8 flex">
            <button
              type="button"
              onClick={() => navigate({ to: '/explore', search: { tab: 'partner' } })}
              className={`flex-1 py-3 text-center text-sm font-semibold transition ${
                mainTab === 'partner'
                  ? 'border-b-2 border-[#110f1a] text-[#110f1a]'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              파트너
            </button>
            <button
              type="button"
              onClick={() => navigate({ to: '/explore', search: { tab: 'store' } })}
              className={`flex-1 py-3 text-center text-sm font-semibold transition ${
                mainTab === 'store'
                  ? 'border-b-2 border-[#110f1a] text-[#110f1a]'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              스토어
            </button>
          </div>
        </div>
      )}
      <div
        className={`container mx-auto max-w-xl px-4 py-4 sm:px-6 lg:px-8 flex-1 min-h-0 ${
          isMobile ? 'overflow-y-auto overflow-x-hidden pt-16' : ''
        }`}
      >
        {/* 모바일 전용 sticky 탭 */}
        <div className={`sticky top-0 z-20 -mx-4 px-4 bg-white border-b border-gray-200 ${isMobile ? '' : 'hidden'}`}>
          <div className="flex relative">
            <button
              type="button"
              onClick={() => navigate({ to: '/explore', search: { tab: 'partner' } })}
              className={`flex-1 py-3 text-center text-sm font-semibold transition-colors ${
                mainTab === 'partner' ? 'text-[#110f1a]' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              파트너
            </button>
            <button
              type="button"
              onClick={() => navigate({ to: '/explore', search: { tab: 'store' } })}
              className={`flex-1 py-3 text-center text-sm font-semibold transition-colors ${
                mainTab === 'store' ? 'text-[#110f1a]' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              스토어
            </button>
            <div
              id="explore-tab-indicator"
              className="absolute bottom-0 h-0.5 bg-[#110f1a] transition-[left] duration-300 ease-out"
              style={{ width: '50%', left: `${tabIndex * 50}%` }}
            />
          </div>
        </div>

        <div className="overflow-hidden -mx-4">
          <div
            ref={tabContainerRef}
            className="flex will-change-[translate]"
            style={{ translate: `${-tabIndex * 100}% 0`, transition: 'translate 0.3s ease-out' }}
          >
            {/* 파트너 탭 */}
            <div className="w-full flex-shrink-0 px-4 overflow-hidden">
              <div className="flex gap-2 overflow-x-auto py-3 scrollbar-hide" data-explore-carousel>
                {PARTNER_CATEGORY_TABS.map((ptab) => (
                  <button
                    key={ptab.id}
                    type="button"
                    onClick={() => {
                      setSelectedPartnerTab(ptab.id)
                      navigate({
                        to: '/explore',
                        search: { tab: 'partner', partner_category: ptab.id === 'home' ? undefined : String(ptab.id) },
                        replace: true,
                      })
                    }}
                    className={`flex-shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition cursor-pointer ${
                      selectedPartnerTab === ptab.id
                        ? 'bg-[#110f1a] text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {ptab.label}
                  </button>
                ))}
              </div>

              <AdBanner className="mb-4 rounded-lg overflow-hidden" />

              {errorMessage && (
                <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600 shadow-sm">
                  {errorMessage}
                </div>
              )}

              {isLoading ? (
                <div className="mb-8 flex items-center justify-center rounded-3xl border border-dashed border-gray-200 bg-white py-16 text-sm text-gray-400 shadow-sm">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  탐색 데이터를 불러오는 중입니다...
                </div>
              ) : (
                <>
                  {pinnedCategories.length > 0 && (
                    <PinnedCategorySwiper categories={pinnedCategories} isGameTab={selectedPartnerTab === 1} />
                  )}
                  {selectedCategoryData && (
                    selectedCategoryData.category.section_type === 'ranking'
                      ? <PartnerRankingSection key={selectedCategoryData.category.id} rankings={partnerRankings} isLoading={isRankingLoading} />
                      : <CategoryPartnerSection data={selectedCategoryData} isGameTab={selectedPartnerTab === 1} />
                  )}
                  {normalCategories
                    .filter(d => d.category.id !== selectedCategoryId)
                    .map(data => (
                      data.category.section_type === 'ranking'
                        ? <PartnerRankingSection key={data.category.id} rankings={partnerRankings} isLoading={isRankingLoading} />
                        : <CategoryPartnerSection key={data.category.id} data={data} isGameTab={selectedPartnerTab === 1} />
                    ))}
                </>
              )}
            </div>

            {/* 스토어 탭 */}
            <div className="w-full flex-shrink-0 px-4 overflow-hidden">
              {isStoreBannersLoading && storeBanners.length === 0 && (
                <div className="relative mb-6 -mx-4 overflow-hidden aspect-[2/1] bg-gray-100 animate-pulse rounded-lg" />
              )}
              {storeBanners.length > 0 && (
                <div className="relative mb-6 -mx-4 overflow-hidden" data-explore-carousel>
                  <Swiper
                    modules={[Autoplay, Pagination]}
                    autoplay={{ delay: 4000, disableOnInteraction: false }}
                    pagination={{
                      clickable: true,
                      renderBullet: (_index, className) => {
                        return `<span class="${className} !w-2 !h-2 !bg-white/60 !opacity-100 [&.swiper-pagination-bullet-active]:!bg-white"></span>`
                      },
                    }}
                    loop={storeBanners.length > 1}
                    onSlideChange={(swiper) => setCurrentBannerIndex(swiper.realIndex)}
                    className="w-full aspect-[2/1]"
                  >
                    {storeBanners.map((banner) => (
                      <SwiperSlide key={banner.id}>
                        <div className="w-full h-full">
                          <img
                            src={banner.banner}
                            alt="스토어 배너"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </SwiperSlide>
                    ))}
                  </Swiper>
                  {storeBanners.length > 1 && (
                    <div className="absolute bottom-3 right-4 z-10 bg-black/40 text-white text-xs px-2 py-1 rounded-full">
                      {currentBannerIndex + 1} / {storeBanners.length}
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-4 mb-6">
                {STORE_CATEGORIES.map((cat) => {
                  const Icon = cat.icon
                  const isSelected = storeProductType === cat.id
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setStoreProductType(cat.id)
                        setStorePage(1)
                      }}
                      className="flex flex-col items-center gap-1.5"
                    >
                      <div
                        className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${cat.bgColor} ${cat.iconColor} ${
                          isSelected ? 'ring-2 ring-offset-2 ring-[#110f1a] shadow-md' : 'hover:scale-105'
                        }`}
                      >
                        <Icon className="w-7 h-7" strokeWidth={1.5} />
                      </div>
                      <span
                        className={`text-xs font-medium ${
                          isSelected ? 'text-[#110f1a]' : 'text-gray-500'
                        }`}
                      >
                        {cat.label}
                      </span>
                    </button>
                  )
                })}
              </div>

              {storeError && (
                <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600 shadow-sm">
                  {storeError}
                </div>
              )}

              {isStoreLoading ? (
                <div className="flex items-center justify-center py-16 text-sm text-gray-400">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  상품을 불러오는 중입니다...
                </div>
              ) : storeProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <Package className="w-12 h-12 mb-2 opacity-50" />
                  <p className="text-sm">등록된 상품이 없습니다</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3 mb-6">
                    {storeProducts.slice(0, 6).map((product) => (
                      <StoreProductCard key={product.product_id} product={product} />
                    ))}
                  </div>
                  {recommendedPartners.length > 0 && (
                    <RecommendedPartnersSection partners={recommendedPartners} />
                  )}
                  {storeProducts.length > 6 && (
                    <div className="grid grid-cols-3 gap-3 mb-6">
                      {storeProducts.slice(6).map((product) => (
                        <StoreProductCard key={product.product_id} product={product} />
                      ))}
                    </div>
                  )}
                  <div ref={storeLoadMoreRef} className="h-10">
                    {isStoreLoadingMore && (
                      <div className="flex items-center justify-center py-4 text-sm text-gray-400">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        더 불러오는 중...
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Pinned 카테고리 스와이퍼
function PinnedCategorySwiper({ categories, isGameTab }: { categories: ExplorerCategoryData[], isGameTab?: boolean }) {
  const allPinnedPartners = categories.flatMap(cat =>
    cat.partners.map(p => ({ ...p, categoryName: cat.category.name, categoryHashtag: cat.category.hashtag }))
  )

  if (allPinnedPartners.length === 0) return null

  return (
    <section className="relative mb-8 overflow-hidden rounded-2xl shadow-xl aspect-square" data-explore-carousel>
      <Swiper
        modules={[Autoplay]}
        spaceBetween={0}
        slidesPerView={1}
        autoplay={{ delay: 4000, disableOnInteraction: false }}
        loop={allPinnedPartners.length > 1}
        className="w-full h-full"
      >
        {allPinnedPartners.map((partner, index) => {
          const profileUrl = partner.member_code ? `/partners/${partner.member_code}` : undefined
          const backgroundImage = resolveImageUrl(partner.profile_image)
          // 게임 탭일 때: partner_category_id=1인 카테고리의 detail_category_id로 게임 이름 표시
          const categoryLabels = [...new Set(
            partner.categories
              ?.map(c => {
                const catId = Number(c.category_id)
                const detailId = Number(c.detail_category_id)
                if (isGameTab && catId === 1 && detailId) {
                  return GAME_SUB_CATEGORIES[detailId] || null
                }
                return catId ? CATEGORY_LABELS[catId] : null
              })
              .filter(Boolean) || []
          )]
          const fallbackLabel = partner.categoryName

          return (
            <SwiperSlide key={`${partner.partner_id}-${index}`}>
              <Link to={(profileUrl || '#') as any} className="relative block w-full h-full">
                {/* 배경 이미지 */}
                {backgroundImage ? (
                  <img
                    src={backgroundImage}
                    alt=""
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-[#4a2a91] via-[#7236c3] to-[#f067b4]" />
                )}
                {/* 어두운 오버레이 */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />

                {/* 좌측 하단 텍스트 */}
                <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6">
                  <div className="flex flex-wrap gap-1 mb-2">
                    {categoryLabels.length > 0 ? (
                      categoryLabels.map((label, i) => (
                        <div key={i} className="inline-block rounded-full bg-[#FE3A8F] px-3 py-1 text-xs font-semibold text-white">
                          {label}
                        </div>
                      ))
                    ) : fallbackLabel ? (
                      <div className="inline-block rounded-full bg-[#FE3A8F] px-3 py-1 text-xs font-semibold text-white">
                        {fallbackLabel}
                      </div>
                    ) : null}
                  </div>
                  <p className="text-2xl font-black text-white sm:text-2xl mb-1">
                    {partner.partner_name || partner.member_name || '파트너'}
                  </p>
                  {partner.partner_message && (
                    <p className="text-sm text-white/80 line-clamp-2">{partner.partner_message}</p>
                  )}
                </div>
              </Link>
            </SwiperSlide>
          )
        })}
      </Swiper>
    </section>
  )
}

// 카테고리별 파트너 섹션
function CategoryPartnerSection({ data, isGameTab }: { data: ExplorerCategoryData, isGameTab?: boolean }) {
  const { category, partners } = data
  const swiperRef = useRef<SwiperType | null>(null)
  const [showNavigation, setShowNavigation] = useState(false)

  if (partners.length === 0) return null

  // 파트너가 1명인 경우 - 배너만 표시
  if (partners.length === 1) {
    const partner = partners[0]
    const bannerUrl = partner.banners ? resolveImageUrl(partner.banners) : null

    if (!bannerUrl) return null

    return (
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <div className="flex flex-col">
            {category.hashtag && (
              <span className="text-sm font-medium text-[#FE3A8F]">{category.hashtag}</span>
            )}
            <Typography variant="h5" className="text-lg font-semibold text-[#110f1a]">
              {category.name}
            </Typography>
          </div>
        </div>
        <Link to={(partner.member_code ? `/partners/${partner.member_code}` : '#') as any}>
          <div className="rounded-2xl overflow-hidden">
            <img src={bannerUrl} alt={category.name} className="w-full h-auto object-cover" />
          </div>
        </Link>
      </section>
    )
  }

  // 파트너가 여러 명인 경우 - 슬라이드
  return (
    <section
      className="mb-8"
      onMouseEnter={() => setShowNavigation(true)}
      onMouseLeave={() => setShowNavigation(false)}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex flex-col">
          {category.hashtag && (
            <span className="text-sm font-medium text-[#FE3A8F]">{category.hashtag}</span>
          )}
          <Typography variant="h5" className="text-lg font-semibold text-[#110f1a]">
            {category.name}
          </Typography>
        </div>
        <Link
          to="/explore"
          search={{ category: category.id }}
          className="text-sm text-gray-500 hover:text-[#FE3A8F] transition-colors"
        >
          더보기
        </Link>
      </div>

      <div className="relative" data-explore-carousel>
        <Swiper
          modules={[Navigation]}
          spaceBetween={12}
          slidesPerView={5.1}
          onSwiper={(swiper) => { swiperRef.current = swiper }}
          breakpoints={{
            0: { slidesPerView: 3.5, spaceBetween: 8 },
            480: { slidesPerView: 4.1, spaceBetween: 10 },
            640: { slidesPerView: 5.1, spaceBetween: 12 },
          }}
          className="!overflow-visible"
        >
          {partners.map((partner) => (
            <SwiperSlide key={partner.id}>
              <PartnerCard partner={partner} isGameTab={isGameTab} />
            </SwiperSlide>
          ))}
        </Swiper>
      </div>
    </section>
  )
}

// 파트너 카드
function PartnerCard({ partner, isGameTab }: { partner: ExplorerPartner, isGameTab?: boolean }) {
  const profileUrl = partner.member_code ? `/partners/${partner.member_code}` : undefined
  const profileImage = resolveImageUrl(partner.profile_image)
  const displayName = partner.partner_name || partner.member_name || '파트너'
  const initials = getInitialsFromName(displayName)
  const fallbackColor = getAvatarBgColor(displayName)
  const [showFallback, setShowFallback] = useState(!profileImage)

  // 게임 탭일 때 게임 이름 추출
  const gameLabel = isGameTab
    ? partner.categories
        ?.filter(c => Number(c.category_id) === 1 && c.detail_category_id)
        .map(c => GAME_SUB_CATEGORIES[Number(c.detail_category_id)])
        .filter(Boolean)[0]
    : null

  const content = (
    <div className="flex flex-col items-center text-center">
      <div className="w-full aspect-square rounded-full bg-gray-100 overflow-hidden mb-2">
        {!profileImage || showFallback ? (
          <div className={`flex h-full w-full items-center justify-center text-base font-semibold text-white ${fallbackColor}`}>
            {initials}
          </div>
        ) : (
          <img
            src={profileImage}
            alt={displayName}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setShowFallback(true)}
          />
        )}
      </div>
      <span className="text-xs font-medium text-[#110f1a] truncate w-full px-1">
        {displayName}
      </span>
      {gameLabel && (
        <span className="text-[10px] text-gray-500 truncate w-full px-1">
          {gameLabel}
        </span>
      )}
    </div>
  )

  if (!profileUrl) {
    return <div className="cursor-default">{content}</div>
  }

  return (
    <Link to={profileUrl as any} className="block hover:opacity-80 transition-opacity">
      {content}
    </Link>
  )
}

// 파트너 랭킹 아이템
function PartnerRankingItem({ item }: { item: PartnerRankingItemType }) {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const authAccessToken = useAuthStore((state) => (state as any).accessToken)
  const authRefreshToken = useAuthStore((state) => (state as any).refreshToken)
  const syncSession = useAuthStore((state) => state.syncSession)
  const [isFollowing, setIsFollowing] = useState(item.is_followed)
  const [followCount, setFollowCount] = useState(item.follow_count)
  const [isFollowLoading, setIsFollowLoading] = useState(false)

  const profileUrl = item.member_code ? `/partners/${item.member_code}` : undefined
  const profileImage = resolveImageUrl(item.profile_image)
  const displayName = item.partner_name || '파트너'
  const initials = getInitialsFromName(displayName)
  const fallbackColor = getAvatarBgColor(displayName)

  const handleFollowClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!user) {
      toast.error('로그인이 필요합니다')
      navigate({ to: '/login' })
      return
    }

    setIsFollowLoading(true)
    try {
      await toggleFollowPartner(item.partner_id, !isFollowing, {
        accessToken: authAccessToken,
        refreshToken: authRefreshToken,
        syncSession,
      })
      setIsFollowing(!isFollowing)
      setFollowCount(prev => isFollowing ? prev - 1 : prev + 1)
      toast.success(isFollowing ? '팔로우를 취소했습니다' : '팔로우했습니다')
    } catch (error: any) {
      toast.error(error?.message || '팔로우 처리에 실패했습니다')
    } finally {
      setIsFollowLoading(false)
    }
  }

  const content = (
    <div className="flex items-center gap-3 py-2">
      <div className={`w-6 text-center font-bold ${
        item.rank === 1 ? 'text-yellow-500' : 
        item.rank === 2 ? 'text-gray-400' : 
        item.rank === 3 ? 'text-amber-600' : 'text-gray-500'
      }`}>
        {item.rank}
      </div>
      <div className="w-20 h-20 rounded-full bg-gray-100 overflow-hidden flex-shrink-0">
        {!profileImage ? (
          <div className={`flex h-full w-full items-center justify-center text-sm font-semibold text-white ${fallbackColor}`}>
            {initials}
          </div>
        ) : (
          <img
            src={profileImage}
            alt={displayName}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[#110f1a] truncate">
          {displayName}
        </p>
        <p className="text-xs text-gray-500">
          팔로워 {followCount.toLocaleString()}
        </p>
      </div>
      <button
        type="button"
        onClick={handleFollowClick}
        disabled={isFollowLoading}
        className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
          isFollowing
            ? 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            : 'bg-[#FE3A8F] text-white hover:bg-[#e8a0c0]'
        } disabled:opacity-50`}
      >
        {isFollowLoading ? '...' : isFollowing ? '팔로잉' : '팔로우'}
      </button>
    </div>
  )

  if (!profileUrl) {
    return <div>{content}</div>
  }

  return (
    <Link to={profileUrl as any} className="block hover:opacity-90 transition-opacity">
      {content}
    </Link>
  )
}

// 파트너 랭킹 섹션
function PartnerRankingSection({ 
  rankings: initialRankings, 
  isLoading: initialLoading 
}: { 
  rankings: PartnerRankingItemType[]
  isLoading: boolean 
}) {
  const swiperRef = useRef<SwiperType | null>(null)
  const [showNavigation, setShowNavigation] = useState(false)
  const [period, setPeriod] = useState<'realtime' | 'weekly' | 'monthly'>('weekly')
  const [rankings, setRankings] = useState<PartnerRankingItemType[]>(initialRankings)
  const [isLoading, setIsLoading] = useState(initialLoading)

  useEffect(() => { setRankings(initialRankings) }, [initialRankings])
  useEffect(() => { setIsLoading(initialLoading) }, [initialLoading])

  const fetchRankingByPeriod = useCallback(async (p: 'realtime' | 'weekly' | 'monthly') => {
    setIsLoading(true)
    try {
      const res = await edgeApi.explore.getPartnerRanking({ sort_by: 'total_earnings', limit: 30, period: p }) as any
      if (res.success && res.data?.rankings) {
        setRankings(res.data.rankings as PartnerRankingItemType[])
      }
    } catch (e) {
      console.error('Ranking fetch error:', e)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const handlePeriodChange = (p: 'realtime' | 'weekly' | 'monthly') => {
    setPeriod(p)
    fetchRankingByPeriod(p)
  }

  const PERIOD_TABS = [
    { key: 'realtime' as const, label: '실시간' },
    { key: 'weekly' as const, label: '주간' },
    { key: 'monthly' as const, label: '월간' },
  ]

  if (isLoading) {
    return (
      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <Typography variant="h5" className="text-lg font-semibold text-[#110f1a]">
            인기 파트너 랭킹
          </Typography>
        </div>
        <div className="flex items-center justify-center py-8 text-sm text-gray-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          랭킹을 불러오는 중...
        </div>
      </section>
    )
  }

  // 3개씩 그룹으로 나누기
  const chunkedRankings: PartnerRankingItemType[][] = []
  for (let i = 0; i < rankings.length; i += 3) {
    chunkedRankings.push(rankings.slice(i, i + 3))
  }

  return (
    <section 
      className="mb-8"
      onMouseEnter={() => setShowNavigation(true)}
      onMouseLeave={() => setShowNavigation(false)}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-[#FE3A8F]">#HOT</span>
          <Typography variant="h5" className="text-lg font-semibold text-[#110f1a]">
            인기 파트너 랭킹
          </Typography>
        </div>
      </div>

      {/* 주간/월간/실시간 탭 */}
      <div className="flex gap-2 mb-3">
        {PERIOD_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => handlePeriodChange(tab.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              period === tab.key
                ? 'bg-[#110f1a] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {chunkedRankings.length === 0 ? (
        <div className="flex items-center justify-center py-8 text-sm text-gray-400">
          해당 기간의 랭킹 데이터가 없습니다
        </div>
      ) : (
        <div className="relative" data-explore-carousel>
          <Swiper
            modules={[Navigation]}
            spaceBetween={12}
            slidesPerView={1}
            onSwiper={(swiper) => { swiperRef.current = swiper }}
          >
            {chunkedRankings.map((chunk, chunkIndex) => (
              <SwiperSlide key={chunkIndex}>
                <div className="space-y-2">
                  {chunk.map((item) => (
                    <PartnerRankingItem key={item.partner_id} item={item} />
                  ))}
                </div>
              </SwiperSlide>
            ))}
          </Swiper>

          {showNavigation && chunkedRankings.length > 1 && (
            <>
              <button
                onClick={() => swiperRef.current?.slidePrev()}
                className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              </button>
              <button
                onClick={() => swiperRef.current?.slideNext()}
                className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 z-10 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-colors"
              >
                <ChevronRight className="w-5 h-5 text-gray-600" />
              </button>
            </>
          )}
        </div>
      )}
    </section>
  )
}

// 스토어 상품 카드
function StoreProductCard({ product }: { product: StoreProduct }) {
  const thumbnailUrl = resolveImageUrl(product.thumbnail_url)
  const [showFallback, setShowFallback] = useState(!thumbnailUrl)
  const formattedPrice = product.price.toLocaleString()

  return (
    <Link
      to={`/store/products/${product.product_id}` as any}
      className="block rounded-xs bg-white overflow-hidden"
    >
      <div className="aspect-square bg-gray-100 relative">
        {!thumbnailUrl || showFallback ? (
          <div className="flex h-full w-full items-center justify-center bg-gray-100">
            <Package className="w-10 h-10 text-gray-300" />
          </div>
        ) : (
          <img
            src={thumbnailUrl}
            alt={product.name}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setShowFallback(true)}
          />
        )}
        {/* 상품 타입 뱃지 */}
        <div className="absolute top-2 left-2">
          <span
            className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
              product.product_type === 'digital'
                ? 'bg-purple-100 text-purple-600'
                : product.product_type === 'on_site'
                  ? 'bg-blue-100 text-blue-600'
                  : 'bg-orange-100 text-orange-600'
            }`}
          >
            {product.product_type === 'digital'
              ? '디지털'
              : product.product_type === 'on_site'
                ? '현장수령'
                : '택배'}
          </span>
        </div>
      </div>
      <div className="py-1">
        <p className="text-sm font-medium text-[#110f1a] line-clamp-2 mb-1">{product.name}</p>
        <p className="text-sm font-bold text-[#110f1a]">{formattedPrice}원</p>
        {product.product_type === 'delivery' && product.shipping_fee_base !== undefined && (
          <p className="text-xs text-gray-500 mt-0.5">
            배송비 {product.shipping_fee_base === 0 ? '무료' : `${product.shipping_fee_base.toLocaleString()}원`}
          </p>
        )}
      </div>
    </Link>
  )
}

// 추천 파트너 스토어 섹션
function RecommendedPartnersSection({ partners }: { partners: RecommendedPartner[] }) {
  if (partners.length === 0) return null

  return (
    <section className="mb-8 -mx-4" data-explore-carousel>
      <div className="px-4 mb-3">
        <p className="text-lg font-semibold text-[#110f1a]">
          <span className="text-[#FE3A8F]">주목할만한</span> 파트너 스토어
        </p>
      </div>
      <Swiper
        slidesPerView={1.2}
        centeredSlides={true}
        spaceBetween={12}
        className="!px-4"
      >
        {partners.map((partner) => (
          <SwiperSlide key={partner.id}>
            <RecommendedPartnerCard partner={partner} />
          </SwiperSlide>
        ))}
      </Swiper>
    </section>
  )
}

// 추천 파트너 카드
function RecommendedPartnerCard({ partner }: { partner: RecommendedPartner }) {
  const profileImage = resolveImageUrl(partner.partner?.member?.profile_image)
  const partnerName = partner.partner?.partner_name || partner.partner?.member?.name || '파트너'
  const memberCode = partner.partner?.member?.member_code
  const [showFallback, setShowFallback] = useState(!profileImage)
  const initials = getInitialsFromName(partnerName)
  const fallbackColor = getAvatarBgColor(partnerName)

  return (
    <div className="bg-gray-50 rounded-2xl p-4">
      {/* 파트너 프로필 */}
      <Link
        to={memberCode ? `/partners/${memberCode}?tab=store` as any : '#' as any}
        className="flex items-center gap-3 mb-4"
      >
        <div className="w-12 h-12 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
          {!profileImage || showFallback ? (
            <div className={`flex h-full w-full items-center justify-center text-base font-semibold text-white ${fallbackColor}`}>
              {initials}
            </div>
          ) : (
            <img
              src={profileImage}
              alt={partnerName}
              className="h-full w-full object-cover"
              onError={() => setShowFallback(true)}
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[#110f1a] truncate">{partnerName}</p>
          {memberCode && (
            <p className="text-xs text-gray-500">@{memberCode}</p>
          )}
        </div>
        <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
      </Link>

      {/* 상품 3개 */}
      {partner.products.length > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          {partner.products.map((product) => (
            <RecommendedProductCard key={product.product_id} product={product} />
          ))}
        </div>
      ) : (
        <div className="text-center py-6 text-sm text-gray-400">
          등록된 상품이 없습니다
        </div>
      )}
    </div>
  )
}

// 추천 파트너 상품 카드
function RecommendedProductCard({ product }: { product: RecommendedProduct }) {
  const thumbnailUrl = resolveImageUrl(product.thumbnail_url)
  const [showFallback, setShowFallback] = useState(!thumbnailUrl)

  return (
    <Link
      to={`/store/products/${product.product_id}` as any}
      className="block"
    >
      <div className="aspect-square bg-gray-100 rounded-lg overflow-hidden mb-1">
        {!thumbnailUrl || showFallback ? (
          <div className="flex h-full w-full items-center justify-center bg-gray-100">
            <Package className="w-6 h-6 text-gray-300" />
          </div>
        ) : (
          <img
            src={thumbnailUrl}
            alt={product.name}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={() => setShowFallback(true)}
          />
        )}
      </div>
      <p className="text-xs font-medium text-[#110f1a] line-clamp-1">{product.name}</p>
      <p className="text-xs font-bold text-[#110f1a]">{product.price.toLocaleString()}원</p>
    </Link>
  )
}
