import { createFileRoute, useNavigate, useSearch, Link } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  FeedMediaCarousel,
  feedSeeds,
  type FeedPost,
  type FeedMedia,
  MediaPreview,
  CommentModal,
  CommentList,
  type FeedComment,
  getPostMembershipIds,
} from '../feed/all'
import {
  Avatar,
  AvatarWithFallback,
  Button,
  GameInfoDisplay,
  Input,
  PartnerManagementSheet,
  StarRating,
  Typography,
  SlideSheet,
  SavePostSheet,
} from '@/components'
import MonthlyClientRanking from '@/components/features/MonthlyClientRanking'
import { usePartnerDetailsByMemberCode, PartnerDetailError } from '@/hooks/usePartnerDetailsByMemberCode'
import { usePartnerJobs } from '@/hooks/usePartnerJobs'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/useAuthStore'
import { useChatStore } from '@/store/useChatStore'
import { useUIStore } from '@/store/useUIStore'
import { useDevice } from '@/hooks/useDevice'
import { toggleFollowPartner, fetchFollowers } from '@/utils/followApi'
import { resolveAccessToken } from '@/utils/sessionToken'
import { mapApiFilesToMedia, mapApiFilesToMediaWithSignedUrls, captureVideoThumbnail } from '@/utils/media'
import { Bookmark, Heart, MessageCircle, Star, Repeat2, MoreVertical, Trash2, Pencil, Send, Pin, Flag, ShoppingCart, CreditCard, LayoutGrid, ShoppingBag, Crown, Compass } from 'lucide-react'
import { toast } from 'sonner'
import { edgeApi } from '@/lib/apiClient'
import { ReportModal, type ReportTargetType } from '@/components/modals'
import { CaptureProtection } from '@/components/CaptureProtection'
import { updateGlobalLikeState, incrementGlobalCommentCount, updateGlobalCommentCount, updateGlobalPurchaseState, updateGlobalFollowState, removePostFromGlobalCache, invalidateGlobalFeedCache } from '../feed/all'
import { Swiper, SwiperSlide } from 'swiper/react'
import type { Swiper as SwiperType } from 'swiper'
import { Pagination } from 'swiper/modules'
// @ts-ignore
import 'swiper/css'
// @ts-ignore
import 'swiper/css/pagination'
import { StoreFilterTabs } from '@/components/features/store/StoreFilterTabs'
import { ProductCard } from '@/components/features/store/ProductCard'
import { StoreLoadingState } from '@/components/ui/StoreLoadingState'
import { StoreEmptyState } from '@/components/ui/StoreEmptyState'
import { storeOrdersApi } from '@/api/store/orders'
import { storeCartApi, type ShippingAddress, type CheckoutParams } from '@/api/store/cart'
import { FeaturedRouletteBanner } from '@/components/features/partner/FeaturedRouletteBanner'

// 카테고리 라벨 매핑 (새 구조: 메이트, 샐럽/모델, 메이드, 지하돌, 코스어)
const CATEGORY_LABELS: Record<number, string> = {
  1: '메이트',
  2: '샐럽/모델',
  3: '메이드',
  4: '지하돌',
  5: '코스어',
}

// 서브 카테고리 매핑 (메이트만 소분류 있음)
const SUB_CATEGORY_LABELS: Record<number, Record<number, string>> = {
  1: { 1: '롤', 2: '배틀그라운드', 3: '오버워치', 4: '발로란트', 5: '스팀게임', 6: '그외게임' },
  2: {},
  3: {},
  4: {},
  5: {},
}

const getCategoryLabel = (categoryId: number): string => {
  return CATEGORY_LABELS[categoryId] || ''
}

const getSubCategoryLabel = (categoryId: number, detailId: number): string => {
  return SUB_CATEGORY_LABELS[categoryId]?.[detailId] || ''
}

// 카테고리 ID를 URL 파라미터용 문자열 ID로 변환
const getCategoryStringId = (categoryId: number): string => {
  const mapping: Record<number, string> = {
    1: 'mate',
    2: 'celeb-model',
    3: 'maid',
    4: 'underground-idol',
    5: 'coser',
  }
  return mapping[categoryId] || ''
}

// 서브 카테고리 ID를 URL 파라미터용 문자열 ID로 변환
const getSubCategoryStringId = (categoryId: number, detailId: number): string => {
  if (categoryId !== 1) return '' // 메이트만 소분류 있음
  const mapping: Record<number, string> = {
    1: 'lol',
    2: 'pubg',
    3: 'overwatch',
    4: 'valorant',
    5: 'steam',
    6: 'other-game',
  }
  return mapping[detailId] || ''
}

const TIER_OPTIONS = [
  { rank: 1, name: '베이직', emoji: '🌱' },
  { rank: 2, name: '실버', emoji: '🥈' },
  { rank: 3, name: '골드', emoji: '🥇' },
  { rank: 4, name: '플래티넘', emoji: '💠' },
  { rank: 5, name: '다이아', emoji: '💎' },
  { rank: 6, name: '마스터', emoji: '🏆' },
  { rank: 7, name: '엘리트', emoji: '⭐' },
  { rank: 8, name: '프레스티지', emoji: '✨' },
  { rank: 9, name: '로열', emoji: '👑' },
  { rank: 10, name: '시그니처', emoji: '🔱' },
]

type PartnerDetailSearch = {
  tab?: 'posts' | 'membership' | 'services' | 'store'
}

export const Route = createFileRoute('/partners/$memberCode')({
  component: PartnerDetailPage,
  validateSearch: (search: Record<string, unknown>): PartnerDetailSearch => ({
    tab: ['posts', 'membership', 'services', 'store'].includes(search.tab as string)
      ? (search.tab as PartnerDetailSearch['tab'])
      : undefined,
  }),
})

function PartnerDetailSkeleton() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto w-full max-w-[720px] px-4 pb-16 pt-16 lg:px-8">
        <div className="h-56 w-full animate-pulse rounded-3xl bg-gray-200" />
        <div className="-mt-12 flex flex-col gap-6">
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <div className="h-24 w-24 rounded-full border-4 border-white bg-gray-200 animate-pulse" />
                <div className="w-full space-y-3">
                  <div className="h-5 w-40 rounded bg-gray-200 animate-pulse" />
                  <div className="h-4 w-28 rounded bg-gray-100 animate-pulse" />
                  <div className="flex flex-wrap gap-2">
                    <div className="h-8 flex-1 rounded-full bg-gray-100 animate-pulse" />
                    <div className="h-8 flex-1 rounded-full bg-gray-100 animate-pulse" />
                  </div>
                  <div className="h-3 w-3/4 rounded bg-gray-100 animate-pulse" />
                </div>
              </div>
              <div className="flex gap-3 self-stretch sm:flex-col sm:items-end">
                <div className="h-8 w-32 rounded-full bg-gray-100 animate-pulse" />
                <div className="h-8 w-32 rounded-full bg-gray-100 animate-pulse" />
              </div>
            </div>
            <div className="mt-6 flex flex-wrap gap-4">
              {[1, 2, 3].map((item) => (
                <div key={`stat-${item}`} className="h-4 w-24 rounded bg-gray-100 animate-pulse" />
              ))}
            </div>
          </div>

          <div className="rounded-2xl bg-gradient-to-r from-[#fce0ea] to-[#ffe1f0] p-5 shadow-sm">
            <div className="h-4 w-40 rounded bg-white/60 animate-pulse" />
            <div className="mt-3 h-3 w-24 rounded bg-white/50 animate-pulse" />
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="grid grid-cols-3 gap-3">
              {[1, 2, 3].map((tab) => (
                <div key={`tab-${tab}`} className="h-9 rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {[1, 2].map((card) => (
              <div key={`post-skel-${card}`} className="rounded-3xl bg-white p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-gray-200 animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 rounded bg-gray-200 animate-pulse" />
                    <div className="h-3 w-20 rounded bg-gray-100 animate-pulse" />
                  </div>
                  <div className="h-6 w-16 rounded-full bg-gray-100 animate-pulse" />
                </div>
                <div className="mt-4 space-y-2">
                  <div className="h-3 w-full rounded bg-gray-100 animate-pulse" />
                  <div className="h-3 w-3/4 rounded bg-gray-100 animate-pulse" />
                </div>
                <div className="mt-4 h-60 w-full rounded-2xl bg-gray-200 animate-pulse" />
                <div className="mt-4 flex gap-4">
                  {[1, 2, 3].map((action) => (
                    <div key={`action-${card}-${action}`} className="h-5 w-16 rounded bg-gray-100 animate-pulse" />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              {[1, 2].map((service) => (
                <div key={`svc-${service}`} className="rounded-3xl bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="h-4 w-32 rounded bg-gray-200 animate-pulse" />
                    <div className="h-8 w-24 rounded-full bg-gray-100 animate-pulse" />
                  </div>
                  <div className="mt-4 space-y-2">
                    <div className="h-3 w-full rounded bg-gray-100 animate-pulse" />
                    <div className="h-3 w-5/6 rounded bg-gray-100 animate-pulse" />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <div className="h-9 w-32 rounded-full bg-gray-100 animate-pulse" />
                    <div className="h-9 w-32 rounded-full bg-gray-100 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-4">
              <div className="rounded-3xl bg-white p-5 shadow-sm">
                <div className="h-4 w-32 rounded bg-gray-200 animate-pulse" />
                <div className="mt-3 space-y-2">
                  {[1, 2, 3].map((row) => (
                    <div key={`game-${row}`} className="h-3 w-full rounded bg-gray-100 animate-pulse" />
                  ))}
                </div>
              </div>
              <div className="rounded-3xl bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="h-4 w-24 rounded bg-gray-200 animate-pulse" />
                  <div className="h-5 w-16 rounded bg-gray-100 animate-pulse" />
                </div>
                <div className="mt-4 space-y-3">
                  {[1, 2].map((review) => (
                    <div key={`review-${review}`} className="space-y-2 border-b border-gray-50 pb-3 last:border-0">
                      <div className="h-3 w-20 rounded bg-gray-100 animate-pulse" />
                      <div className="h-3 w-full rounded bg-gray-100 animate-pulse" />
                      <div className="h-3 w-1/2 rounded bg-gray-100 animate-pulse" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PartnerDetailPage() {
  const { memberCode } = Route.useParams()
  const navigate = useNavigate()
  const { user: authUser, refetchPoints, refreshUser } = useAuth()
  const user = useAuthStore((state) => state.user)
  const updateAuthStorePoints = useAuthStore((state) => state.updateUserPoints)
  const authAccessToken = useAuthStore((state) => (state as any).accessToken)
  const authRefreshToken = useAuthStore((state) => (state as any).refreshToken)
  const syncSession = useAuthStore((state) => state.syncSession)
  const { addTempChatRoom } = useChatStore()
  const setIsPartnerPageScrolled = useUIStore((state) => state.setIsPartnerPageScrolled)
  const setPartnerHeaderName = useUIStore((state) => state.setPartnerHeaderName)
  const setCurrentViewingPartnerId = useUIStore((state) => state.setCurrentViewingPartnerId)
  const partnerNameRef = useRef<HTMLDivElement>(null)
  const tabSectionRef = useRef<HTMLDivElement>(null)
  const tabSwiperRef = useRef<SwiperType | null>(null)
  const queryClient = useQueryClient()
  const [jobSessions, setJobSessions] = useState<Record<string, number>>({})
  const { tab: urlTab } = useSearch({ from: '/partners/$memberCode' })
  const activeTab = urlTab || 'posts'
  const [isFollowing, setIsFollowing] = useState(false)
  const [isFollowProcessing, setIsFollowProcessing] = useState(false)
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
  const [isFollowersModalOpen, setIsFollowersModalOpen] = useState(false)
  const [followers, setFollowers] = useState<any[]>([])
  const [isFollowersLoading, setIsFollowersLoading] = useState(false)
  const [posts, setPosts] = useState<FeedPost[]>([])
  const [isPostsLoading, setIsPostsLoading] = useState(false)
  const [storeProducts, setStoreProducts] = useState<any[]>([])
  const [isStoreLoading, setIsStoreLoading] = useState(false)
  const [storeProductType, setStoreProductType] = useState<'all' | 'digital' | 'on_site' | 'delivery'>('all')
  const [storeSource, setStoreSource] = useState<'all' | 'partner' | 'collaboration'>('all')
  const [storePage, setStorePage] = useState(1)
  const [storeTotal, setStoreTotal] = useState(0)
  const [storeTotalPages, setStoreTotalPages] = useState(1)
  const [selectedStoreProduct, setSelectedStoreProduct] = useState<any | null>(null)
  const [isDeliverySheetOpen, setIsDeliverySheetOpen] = useState(false)
  const [shippingAddresses, setShippingAddresses] = useState<ShippingAddress[]>([])
  const [selectedShippingAddressId, setSelectedShippingAddressId] = useState<string | null>(null)
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false)
  const [useDirectInput, setUseDirectInput] = useState(false)
  const [deliveryInfo, setDeliveryInfo] = useState({
    recipient_name: '',
    recipient_phone: '',
    recipient_address: '',
    recipient_address_detail: '',
    recipient_postal_code: '',
    delivery_memo: '',
  })
  const [deletedPostCount, setDeletedPostCount] = useState(0)
  const [postsRefreshTrigger, setPostsRefreshTrigger] = useState(0)
  const [previewState, setPreviewState] = useState<{
    items: Array<FeedMedia>
    index: number
    postId?: string
  } | null>(null)
  const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(null)
  const [activeComments, setActiveComments] = useState<FeedComment[]>([])
  const [replyingToId, setReplyingToId] = useState<string | null>(null)
  const [collapsedReplies, setCollapsedReplies] = useState<Record<string, boolean>>({})
  const [isCommentsLoading, setIsCommentsLoading] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)
  const [purchaseTargetPost, setPurchaseTargetPost] = useState<FeedPost | null>(null)
  const [isProcessingPurchase, setIsProcessingPurchase] = useState(false)
  // 개별 미디어 구매 상태
  const [mediaPurchaseTarget, setMediaPurchaseTarget] = useState<{ post: FeedPost; mediaIndex: number } | null>(null)
  const [isMediaPurchaseSheetVisible, setIsMediaPurchaseSheetVisible] = useState(false)
  const [selectedMediaPurchaseOption, setSelectedMediaPurchaseOption] = useState<'single' | 'bundle' | null>(null)
  // 가격 수정 시트 상태
  const [priceEditTargetPost, setPriceEditTargetPost] = useState<FeedPost | null>(null)
  const [priceEditType, setPriceEditType] = useState<'membership' | 'point' | null>(null)
  const [priceEditValue, setPriceEditValue] = useState<string>('')
  // 퀘스트 멤버십 필요 팝업
  const [questMembershipPopup, setQuestMembershipPopup] = useState<{
    isOpen: boolean
    membershipId: string | null
    minTierRank: number
  }>({ isOpen: false, membershipId: null, minTierRank: 0 })
  const [isSavingPrice, setIsSavingPrice] = useState(false)
  const [likesState, setLikesState] = useState<Record<string, { liked: boolean; count: number }>>({})
  // 포스트 메뉴 시트 상태 (본인 게시물용)
  const [postMenuTargetPost, setPostMenuTargetPost] = useState<FeedPost | null>(null)
  // 더보기 메뉴 시트 상태 (다른 사용자 게시물용)
  const [otherPostMenuTargetPost, setOtherPostMenuTargetPost] = useState<FeedPost | null>(null)
  // 게시글 수정 상태
  const [editTargetPost, setEditTargetPost] = useState<FeedPost | null>(null)
  // 게시물 content 펼치기 상태
  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(new Set())
  // 저장(북마크) 관련 상태
  const [isSaveSheetOpen, setIsSaveSheetOpen] = useState(false)
  const [savedPostInfo, setSavedPostInfo] = useState<{
    post_id: string
    thumbnail_url?: string
  } | null>(null)
  const [savedPostIds, setSavedPostIds] = useState<Set<string>>(new Set())
  const [editDescription, setEditDescription] = useState<string>('')
  const [isSavingEdit, setIsSavingEdit] = useState(false)
  
  // 관리자 제재 팝업 상태
  const [reportSheetPostId, setReportSheetPostId] = useState<string | null>(null)
  const [reportReasonType, setReportReasonType] = useState<number>(1)
  const [reportReasonDetail, setReportReasonDetail] = useState('')
  
  // 일반 사용자 신고 모달 상태
  const [userReportModal, setUserReportModal] = useState<{
    isOpen: boolean
    targetType: ReportTargetType
    targetId: string
    targetName?: string
  }>({ isOpen: false, targetType: 'post', targetId: '' })
  const [isSubmittingReport, setIsSubmittingReport] = useState(false)
  
  // 멤버쉽 관련 상태
  const [partnerMemberships, setPartnerMemberships] = useState<Array<{
    id: string
    name: string
    description: string
    monthly_price: number
    is_active: boolean
    active_months?: number
    discount_rate?: number
  }>>([])
  const [isMembershipsLoading, setIsMembershipsLoading] = useState(false)
  const [isMembershipPurchaseSheetOpen, setIsMembershipPurchaseSheetOpen] = useState(false)
  const [selectedMembership, setSelectedMembership] = useState<typeof partnerMemberships[0] | null>(null)
  const [isProcessingMembershipPurchase, setIsProcessingMembershipPurchase] = useState(false)
  const [targetMembershipId, setTargetMembershipId] = useState<string | null>(null)
  const [membershipInfoSheetPost, setMembershipInfoSheetPost] = useState<FeedPost | null>(null)
  const [membershipInfoSheetTargetId, setMembershipInfoSheetTargetId] = useState<string | null>(null)
  const [isMembershipInfoSheetOpen, setIsMembershipInfoSheetOpen] = useState(false)
  
  // 구독자 목록 관련 상태
  const [isSubscribersSheetOpen, setIsSubscribersSheetOpen] = useState(false)
  const [subscribersMembershipId, setSubscribersMembershipId] = useState<string | null>(null)
  const [subscribersMembershipName, setSubscribersMembershipName] = useState<string>('')
  const [subscribers, setSubscribers] = useState<Array<{
    id: string
    user_id: string
    started_at: string
    expired_at: string | null
    auto_renewal_enabled: boolean
    membership: { id: string; name: string }
    members: { id: string; name: string; profile_image: string | null } | null
  }>>([])
  const [isLoadingSubscribers, setIsLoadingSubscribers] = useState(false)
  
  const { isMobile } = useDevice()

  // 스크롤 감지하여 전역 상태에 저장 (헤더 스타일 변경용)
  useEffect(() => {
    let scrollContainer: HTMLElement | null = null
    
    const handleScroll = () => {
      if (scrollContainer) {
        setIsPartnerPageScrolled(scrollContainer.scrollTop > 50)
      }
    }
    
    // __root.tsx의 스크롤 컨테이너 찾기
    const findScrollContainer = (): HTMLElement | null => {
      const containers = document.querySelectorAll('[class*="overflow-y-auto"]')
      for (const container of containers) {
        if (container instanceof HTMLElement && container.scrollHeight > container.clientHeight) {
          return container
        }
      }
      return null
    }
    
    // 약간의 딜레이 후 스크롤 컨테이너 찾기 (DOM이 완전히 렌더링된 후)
    const timeoutId = setTimeout(() => {
      scrollContainer = findScrollContainer()
      if (scrollContainer) {
        scrollContainer.addEventListener('scroll', handleScroll)
        // 현재 스크롤 위치 확인
        setIsPartnerPageScrolled(scrollContainer.scrollTop > 50)
      }
    }, 50)
    
    // 컴포넌트 마운트 시 초기화
    setIsPartnerPageScrolled(false)
    
    return () => {
      clearTimeout(timeoutId)
      if (scrollContainer) {
        scrollContainer.removeEventListener('scroll', handleScroll)
      }
      // 컴포넌트 언마운트 시 초기화
      setIsPartnerPageScrolled(false)
    }
  }, [setIsPartnerPageScrolled])

  const { data: partner, isLoading, error, refetch: refetchPartner } = usePartnerDetailsByMemberCode(memberCode)

  // 현재 보고 있는 파트너 ID 저장 (랭킹 조회용)
  useEffect(() => {
    if (partner?.id) {
      setCurrentViewingPartnerId(partner.id)
    }
    return () => {
      setCurrentViewingPartnerId(null)
    }
  }, [partner?.id, setCurrentViewingPartnerId])

  // 구독 중인 멤버쉽 정보 (partner 데이터에서 추출)
  const subscribedMembership = (partner as any)?.subscribed_membership as {
    subscription_id: string
    membership_id: string
    status: 'active' | 'inactive' | 'canceled'
    membership_name?: string
    started_at?: string
    ended_at?: string
  } | null

  // partnerName 영역이 화면에서 벗어나면 헤더에 이름 표시
  useEffect(() => {
    const partnerName = partner?.partner_name || partner?.member?.member_code || ''
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          // 영역이 화면에서 벗어나면 헤더에 이름 표시
          if (!entry.isIntersecting) {
            setPartnerHeaderName(partnerName)
          } else {
            setPartnerHeaderName(null)
          }
        })
      },
      { threshold: 0, rootMargin: '-60px 0px 0px 0px' } // 헤더 높이만큼 오프셋
    )
    
    if (partnerNameRef.current) {
      observer.observe(partnerNameRef.current)
    }
    
    // 컴포넌트 언마운트 시 초기화
    return () => {
      observer.disconnect()
      setPartnerHeaderName(null)
    }
  }, [partner, setPartnerHeaderName])
  const { jobs: activeJobs, isLoading: jobsLoading } = usePartnerJobs(partner?.member_id || null, true)

  const hasActiveJobs = activeJobs.length > 0

  const tabs = useMemo(() => [
    { key: 'posts', icon: LayoutGrid },
    ...((partner as any)?.is_seller === true ? [{ key: 'store', icon: ShoppingBag }] : []),
    { key: 'membership', icon: Crown },
    { key: 'services', icon: Compass },
  ] as const, [(partner as any)?.is_seller])

  const activeTabIndex = useMemo(() => {
    const idx = tabs.findIndex(t => t.key === activeTab)
    return idx >= 0 ? idx : 0
  }, [tabs, activeTab])

  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => new Set([activeTab]))

  useEffect(() => {
    setVisitedTabs(prev => {
      if (prev.has(activeTab)) return prev
      return new Set([...prev, activeTab])
    })
  }, [activeTab])

  useEffect(() => {
    if (tabSwiperRef.current && tabSwiperRef.current.activeIndex !== activeTabIndex) {
      tabSwiperRef.current.slideTo(activeTabIndex)
    }
  }, [activeTabIndex])

  const postsHandle = partner?.member.member_code || memberCode
  const followerCount = (partner as { followers_count?: number; follow_count?: number } | undefined)?.followers_count 
    ?? (partner as { follow_count?: number } | undefined)?.follow_count ?? 0
  const [displayFollowerCount, setDisplayFollowerCount] = useState(followerCount)
  const isViewingOwnProfile = useMemo(() => {
    if (!user?.member_code || !partner?.member?.member_code) return false
    return user.member_code === partner.member.member_code
  }, [user?.member_code, partner?.member?.member_code])

  // 피드 더보기 메뉴 상태
  const [openPostMenuId, setOpenPostMenuId] = useState<string | null>(null)

  // 외부 클릭 시 피드 메뉴 닫기
  useEffect(() => {
    const handleClickOutside = () => setOpenPostMenuId(null)
    if (openPostMenuId) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [openPostMenuId])

  // 로그인 사용자가 partner가 아닌데 자신의 프로필 페이지를 보려고 할 때 /mypage로 리다이렉트
  // 또는 partner_status가 approved가 아닌 경우(pending, rejected 등) 자신의 프로필이면 /mypage로 리다이렉트
  useEffect(() => {
    if (!user || isLoading) return

    const isOwnProfile = user.member_code === memberCode
    const isNotApproved = partner && partner.partner_status !== 'approved'

    // 1. 현재 사용자가 partner가 아니고, 자신의 member_code로 접근한 경우
    // 2. partner_status가 approved가 아닌데(pending, rejected 등) 자신의 프로필인 경우
    if (isOwnProfile && (user.role !== 'partner' || isNotApproved)) {
      navigate({ to: '/mypage', replace: true })
    }
  }, [user?.id, user?.role, user?.member_code, memberCode, isLoading, partner, navigate])
  const reviews = partner?.reviews ?? []
  const averageRating =
    reviews.length > 0
      ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
      : null
  const favoriteGameSource = partner?.member.favorite_game
  const favoriteGames = Array.isArray(favoriteGameSource)
    ? favoriteGameSource.filter(Boolean).join(', ')
    : favoriteGameSource ?? ''
  const gameInfo =
    partner?.game_info ?? (partner?.member as { game_info?: Record<string, unknown> } | undefined)?.game_info
  const apiPostCount = (partner as { posts_count?: number; post_count?: number } | undefined)?.posts_count 
    ?? (partner as { post_count?: number } | undefined)?.post_count
  const apiFollowersCount = (partner as { followers_count?: number } | undefined)?.followers_count
  const totalPosts = useMemo(() => {
    if (typeof apiPostCount === 'number') {
      return Math.max(0, apiPostCount - deletedPostCount)
    }
    return posts.length
  }, [apiPostCount, deletedPostCount, posts.length])

  interface PartnerApiCommentUser {
    id: string
    name: string
    profile_image?: string | null
    member_code?: string | null
  }

  interface PartnerApiComment {
    id: string
    post_id: string
    user_id: string
    parent_id: string | null
    index: number | null
    content: string
    created_at: string
    user?: PartnerApiCommentUser | null
    replies?: PartnerApiComment[]
  }

  const mapPartnerApiComments = (comments: PartnerApiComment[]): FeedComment[] =>
    comments.map((comment) => {
      const userName =
        comment.user?.name ||
        (comment.user_id ? comment.user_id.slice(0, 8) : '익명')

      const avatar = comment.user?.profile_image ?? undefined

      return {
        id: comment.id,
        user: userName,
        userId: comment.user?.id || comment.user_id,
        memberCode: comment.user?.member_code ?? undefined,
        createdAt: comment.created_at,
        text: comment.content,
        avatar,
        replies: comment.replies ? mapPartnerApiComments(comment.replies) : [],
      }
    })

  useEffect(() => {
    setDisplayFollowerCount(followerCount)
  }, [followerCount])

  // 관리자 여부 확인
  const isAdmin = user?.role === 'admin'

  const canInteractWithPost = useCallback(
    (post?: FeedPost | null) => {
      if (!post) return false
      if (isViewingOwnProfile) return true
      if (isAdmin) return true
      
      const hasPointPrice = post.pointPrice !== undefined && post.pointPrice > 0
      
      // 둘 다 조건이 있는 경우: 멤버십 OR 단건구매 중 하나만 충족하면 접근 가능
      if (post.isSubscribersOnly && hasPointPrice) {
        return post.hasMembership || post.isPurchased
      }
      // 구독자 전용만
      if (post.isSubscribersOnly) {
        return post.hasMembership === true
      }
      // 유료 포스트만 (단건구매)
      if (hasPointPrice) {
        return post.isPurchased === true
      }
      return true
    },
    [isViewingOwnProfile, isAdmin],
  )

  const handlePreviewMedia = (postId: string | null, mediaList: Array<FeedMedia>, index: number) => {
    setPreviewState({ postId: postId ?? undefined, items: mediaList, index })
  }

  const fetchPartnerComments = useCallback(
    async (postId: string) => {
      setIsCommentsLoading(true)
      try {
        const token = await resolveAccessToken({
          accessToken: authAccessToken,
          refreshToken: authRefreshToken,
          syncSession,
        })
        if (!token) {
          setIsCommentsLoading(false)
          return
        }
        const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
        const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
        const response = await fetch(
          `${EDGE_FUNCTIONS_URL}/functions/v1/api-comments/${postId}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
              apikey: SUPABASE_ANON_KEY,
            },
          },
        )
        const result = await response.json()
        if (!response.ok || !result.success) {
          throw new Error(result.error || '댓글을 불러오지 못했습니다.')
        }
        const mapped = mapPartnerApiComments(
          (result.data as PartnerApiComment[]) || [],
        )
        setActiveComments(mapped)
        setCollapsedReplies({})
        setCollapsedReplies({})
      } catch (error: any) {
        console.error('파트너 댓글 조회 실패:', error)
      } finally {
        setIsCommentsLoading(false)
      }
    },
    [authAccessToken, authRefreshToken, syncSession],
  )

  const submitPartnerComment = useCallback(
    async (postId: string) => {
      if (!commentDraft.trim() || isSubmittingComment) return
      setIsSubmittingComment(true)
      try {
        const token = await resolveAccessToken({
          accessToken: authAccessToken,
          refreshToken: authRefreshToken,
          syncSession,
        })
        if (!token) {
          setIsSubmittingComment(false)
          return
        }
        const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
        const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
        const response = await fetch(
          `${EDGE_FUNCTIONS_URL}/functions/v1/api-comments/${postId}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              apikey: SUPABASE_ANON_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              content: commentDraft.trim(),
              parent_id: replyingToId,
            }),
          },
        )
        const result = await response.json()
        if (!response.ok || !result.success) {
          throw new Error(result.error || '댓글 작성에 실패했습니다.')
        }
        setCommentDraft('')
        setReplyingToId(null)
        // 댓글 카운트 즉시 증가 (답글이 아닐 때만)
        if (!replyingToId) {
          setPosts((prev) =>
            prev.map((p) =>
              p.id === postId
                ? { ...p, commentCount: (p.commentCount ?? 0) + 1 }
                : p
            )
          )
          // 전역 피드 상태도 업데이트
          incrementGlobalCommentCount(postId)
        }
        await fetchPartnerComments(postId)
      } catch (error: any) {
        console.error('파트너 댓글 작성 실패:', error)
        alert(error.message || '댓글 작성에 실패했습니다.')
      } finally {
        setIsSubmittingComment(false)
      }
    },
    [
      authAccessToken,
      authRefreshToken,
      syncSession,
      commentDraft,
      isSubmittingComment,
      fetchPartnerComments,
      replyingToId,
    ],
  )

  const togglePostLike = useCallback(
    async (postId: string) => {
      const post = posts.find((item) => item.id === postId)
      if (!canInteractWithPost(post)) return

      const previous = likesState[postId] ?? {
        liked: post?.isLiked ?? false,
        count: post?.likes ?? 0,
      }
      const nextLiked = !previous.liked
      const optimisticCount = Math.max(0, previous.count + (nextLiked ? 1 : -1))

      setLikesState((prev) => ({
        ...prev,
        [postId]: {
          liked: nextLiked,
          count: optimisticCount,
        },
      }))
      // 전역 피드 상태도 업데이트
      updateGlobalLikeState(postId, nextLiked, optimisticCount)

      const token = await resolveAccessToken({
        accessToken: authAccessToken,
        refreshToken: authRefreshToken,
        syncSession,
      })
      if (!token) {
        setLikesState((prev) => ({
          ...prev,
          [postId]: previous,
        }))
        updateGlobalLikeState(postId, previous.liked, previous.count) // 롤백
        return
      }

      const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
      const endpoint = nextLiked
        ? `${EDGE_FUNCTIONS_URL}/functions/v1/api-post-likes`
        : `${EDGE_FUNCTIONS_URL}/functions/v1/api-post-likes/${postId}`

      try {
        const response = await fetch(endpoint, {
          method: nextLiked ? 'POST' : 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: SUPABASE_ANON_KEY,
            ...(nextLiked ? { 'Content-Type': 'application/json' } : {}),
          },
          body: nextLiked ? JSON.stringify({ post_id: postId }) : undefined,
        })
        const result = await response.json()
        if (!response.ok || !result.success) {
          throw new Error(result.error || '좋아요 처리에 실패했습니다.')
        }
      } catch (error: any) {
        console.error('좋아요 처리 실패:', error)
        alert(error.message || '좋아요 처리에 실패했습니다.')
        setLikesState((prev) => ({
          ...prev,
          [postId]: previous,
        }))
        updateGlobalLikeState(postId, previous.liked, previous.count) // 롤백
      }
    },
    [
      authAccessToken,
      authRefreshToken,
      syncSession,
      likesState,
      posts,
      canInteractWithPost,
    ],
  )

  const openCommentsForPost = useCallback(
    (postId: string) => {
      const post = posts.find((item) => item.id === postId)
      if (!canInteractWithPost(post)) return
      setActiveCommentPostId(postId)
      fetchPartnerComments(postId)
    },
    [posts, canInteractWithPost, fetchPartnerComments],
  )

  // 피드 삭제 핸들러
  const handleDeletePost = useCallback(
    async (postId: string) => {
      if (!confirm('정말로 이 피드를 삭제하시겠습니까?')) return
      
      setOpenPostMenuId(null)
      
      try {
        const token = await resolveAccessToken({
          accessToken: authAccessToken,
          refreshToken: authRefreshToken,
          syncSession,
        })
        if (!token) {
          alert('로그인이 필요합니다.')
          return
        }
        
        const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
        const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
        
        const response = await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/api-posts/${postId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: SUPABASE_ANON_KEY,
          },
        })
        
        const result = await response.json()
        if (!response.ok || !result.success) {
          throw new Error(result.error || '피드 삭제에 실패했습니다.')
        }
        
        // 로컬 상태에서 삭제된 피드 제거
        setPosts((prev) => prev.filter((p) => p.id !== postId))
        // 게시물 카운트 즉시 감소
        setDeletedPostCount((prev) => prev + 1)
        alert('피드가 삭제되었습니다.')
      } catch (error: any) {
        console.error('피드 삭제 실패:', error)
        alert(error.message || '피드 삭제에 실패했습니다.')
      }
    },
    [authAccessToken, authRefreshToken, syncSession],
  )

  // 게시물 고정/해제 핸들러
  const handleTogglePin = useCallback(
    async (postId: string, currentlyPinned: boolean) => {
      setOpenPostMenuId(null)
      const newPinState = !currentlyPinned
      
      // 즉시 UI 업데이트 (낙관적 업데이트)
      setPosts((prev) => {
        // 1. isPinned 업데이트
        const updated = prev.map((p) => {
          if (p.id === postId) {
            return { ...p, isPinned: newPinState }
          }
          return p
        })
        
        // 2. 고정된 게시물과 일반 게시물 분리
        const pinned = updated.filter(p => p.isPinned === true)
        const notPinned = updated.filter(p => p.isPinned !== true)
        
        // 3. 각각 날짜순 정렬
        pinned.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
          return dateB - dateA
        })
        notPinned.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
          return dateB - dateA
        })
        
        // 4. 고정 먼저, 일반 나중에
        const result = [...pinned, ...notPinned]
        console.log('📌 정렬 결과:', result.map(p => ({ id: p.id.slice(0,8), isPinned: p.isPinned })))
        return result
      })
      
      try {
        const token = await resolveAccessToken({
          accessToken: authAccessToken,
          refreshToken: authRefreshToken,
          syncSession,
        })
        if (!token) {
          alert('로그인이 필요합니다.')
          // 롤백
          setPosts((prev) => {
            const updated = prev.map((p) => p.id === postId ? { ...p, isPinned: currentlyPinned } : p)
            const pinned = updated.filter(p => p.isPinned === true)
            const notPinned = updated.filter(p => p.isPinned !== true)
            pinned.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
            notPinned.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
            return [...pinned, ...notPinned]
          })
          return
        }
        
        const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
        const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
        
        let response: Response
        if (currentlyPinned) {
          // 고정 해제
          response = await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/api-posts/pin/${postId}`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${token}`,
              apikey: SUPABASE_ANON_KEY,
            },
          })
        } else {
          // 고정
          response = await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/api-posts/pin`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              apikey: SUPABASE_ANON_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ post_id: postId }),
          })
        }
        
        const result = await response.json()
        console.log('📌 고정 API 응답:', result)
        
        if (!response.ok || !result.success) {
          throw new Error(result.error || '고정 처리에 실패했습니다.')
        }
        
        // 전역 피드 캐시 무효화
        invalidateGlobalFeedCache()
        
        // 서버에서 최신 데이터 다시 가져오기 (정렬 포함)
        setPostsRefreshTrigger(prev => prev + 1)
        
        toast.success(newPinState ? '게시물이 고정되었습니다.' : '게시물 고정이 해제되었습니다.')
        
      } catch (error: any) {
        console.error('게시물 고정 처리 실패:', error)
        toast.error(error.message || '게시물 고정 처리에 실패했습니다.')
        // API 실패 시 롤백
        setPosts((prev) => {
          const updated = prev.map((p) => p.id === postId ? { ...p, isPinned: currentlyPinned } : p)
          const pinned = updated.filter(p => p.isPinned === true)
          const notPinned = updated.filter(p => p.isPinned !== true)
          pinned.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
          notPinned.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
          return [...pinned, ...notPinned]
        })
      }
    },
    [authAccessToken, authRefreshToken, syncSession],
  )

  // 댓글 삭제 핸들러
  const handleDeleteComment = useCallback(
    async (postId: string, commentId: string) => {
      if (!confirm('댓글을 삭제하시겠습니까?')) return

      try {
        const token = await resolveAccessToken({
          accessToken: authAccessToken,
          refreshToken: authRefreshToken,
          syncSession,
        })
        if (!token) {
          alert('로그인이 필요합니다.')
          return
        }

        const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
        const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

        const response = await fetch(
          `${EDGE_FUNCTIONS_URL}/functions/v1/api-comments/${postId}/${commentId}`,
          {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${token}`,
              apikey: SUPABASE_ANON_KEY,
            },
          }
        )

        const result = await response.json()
        if (!response.ok || !result.success) {
          throw new Error(result.error || '댓글 삭제에 실패했습니다.')
        }

        // 로컬 상태에서 삭제된 댓글 제거 및 카운트 업데이트
        setActiveComments((prev) => {
          const removeComment = (comments: FeedComment[]): FeedComment[] => {
            return comments
              .filter((c) => c.id !== commentId)
              .map((c) => ({
                ...c,
                replies: c.replies ? removeComment(c.replies) : undefined,
              }))
          }
          const newComments = removeComment(prev)
          
          // 전역 캐시 댓글 카운트 업데이트
          const countComments = (comments: FeedComment[]): number => {
            return comments.reduce((acc, c) => acc + 1 + (c.replies ? countComments(c.replies) : 0), 0)
          }
          updateGlobalCommentCount(postId, countComments(newComments))
          
          // 로컬 posts 상태에서도 commentCount 업데이트
          setPosts((prevPosts) =>
            prevPosts.map((p) =>
              p.id === postId ? { ...p, commentCount: countComments(newComments) } : p
            )
          )
          
          return newComments
        })

        alert('댓글이 삭제되었습니다.')
      } catch (error: any) {
        console.error('댓글 삭제 실패:', error)
        alert(error.message || '댓글 삭제에 실패했습니다.')
      }
    },
    [authAccessToken, authRefreshToken, syncSession],
  )

  const closePurchaseSheet = () => {
    setPurchaseTargetPost(null)
  }

  // 개별 미디어 구매 클릭 핸들러
  const handleMediaPurchaseClick = useCallback((post: FeedPost, mediaIndex: number) => {
    // post 레벨 가격이 있고 모든 미디어에 개별 가격이 없으면 post 레벨 구매
    const allMediaHaveNoPointPrice = post.media?.every(m => !m.point_price || m.point_price <= 0)
    if (post.pointPrice && post.pointPrice > 0 && allMediaHaveNoPointPrice) {
      setPurchaseTargetPost(post)
      return
    }
    
    // 개별 미디어 구매
    const media = post.media?.[mediaIndex]
    if (!media || !media.point_price || media.point_price <= 0) return
    setMediaPurchaseTarget({ post, mediaIndex })
    setSelectedMediaPurchaseOption(null)
    requestAnimationFrame(() => {
      setIsMediaPurchaseSheetVisible(true)
    })
  }, [])

  // 가격 수정 시트 열기
  const openPriceEditSheet = (post: FeedPost, type: 'membership' | 'point') => {
    setPriceEditTargetPost(post)
    setPriceEditType(type)
    setPriceEditValue(type === 'point' ? String(post.pointPrice || '') : '')
  }

  // 가격 수정 시트 닫기
  const closePriceEditSheet = () => {
    setPriceEditTargetPost(null)
    setPriceEditType(null)
    setPriceEditValue('')
  }

  // 포스트 메뉴 시트 열기
  const openPostMenuSheet = (post: FeedPost) => {
    setPostMenuTargetPost(post)
  }

  // 포스트 메뉴 시트 닫기
  const closePostMenuSheet = () => {
    setPostMenuTargetPost(null)
  }

  // 게시글 수정 시트 열기
  const openEditSheet = (post: FeedPost) => {
    setEditTargetPost(post)
    setEditDescription(post.content || '')
  }

  // 게시글 수정 시트 닫기
  const closeEditSheet = () => {
    setEditTargetPost(null)
    setEditDescription('')
  }

  // 게시글 수정 저장
  const handleSaveEdit = async () => {
    if (!editTargetPost || !user) return

    setIsSavingEdit(true)
    try {
      const token = await resolveAccessToken({
        accessToken: authAccessToken,
        refreshToken: authRefreshToken,
        syncSession,
      })

      if (!token) {
        alert('인증 토큰이 없습니다. 다시 로그인해주세요.')
        return
      }

      const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

      const response = await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/api-posts`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ id: editTargetPost.id, content: editDescription }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || '게시글 수정에 실패했습니다.')
      }

      // 성공 시 로컬 상태 업데이트
      setPosts((prev) =>
        prev.map((p) =>
          p.id === editTargetPost.id
            ? { ...p, content: editDescription }
            : p,
        ),
      )

      toast.success('게시글이 수정되었습니다.')
      closeEditSheet()
    } catch (error: any) {
      console.error('게시글 수정 실패:', error)
      toast.error(error.message || '게시글 수정에 실패했습니다.')
    } finally {
      setIsSavingEdit(false)
    }
  }

  // 포스트 링크 복사
  const copyPostLink = async (postId: string) => {
    try {
      const url = `${window.location.origin}/feed/${postId}`
      await navigator.clipboard?.writeText(url)
      toast.success('링크가 복사되었습니다')
    } catch (error) {
      console.error('링크 복사 실패', error)
      toast.error('링크 복사에 실패했습니다')
    }
  }

  // 관리자 제재 팝업 열기
  const handleOpenReportSheet = useCallback((postId: string) => {
    setReportSheetPostId(postId)
    setReportReasonType(1)
    setReportReasonDetail('')
  }, [])

  // 관리자 제재 제출
  const handleSubmitReport = useCallback(async () => {
    if (!reportSheetPostId || !reportReasonDetail.trim()) return
    
    setIsSubmittingReport(true)
    try {
      const token = await resolveAccessToken({
        accessToken: authAccessToken,
        refreshToken: authRefreshToken,
        syncSession,
      })
      if (!token) {
        navigate({ to: '/login' })
        return
      }

      const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

      const response = await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/api-post-reports`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          post_id: reportSheetPostId,
          reason_type: reportReasonType,
          reason_detail: reportReasonDetail.trim(),
        }),
      })

      const result = await response.json()
      if (result.success || response.ok) {
        toast.success('제재 처리가 완료되었습니다.')
        // 피드에서 해당 포스트 제거
        setPosts(prev => prev.filter(p => p.id !== reportSheetPostId))
        // 전역 캐시에서도 제거
        removePostFromGlobalCache(reportSheetPostId)
        setReportSheetPostId(null)
        setReportReasonDetail('')
      } else {
        toast.error(result.error || '제재 처리에 실패했습니다.')
      }
    } catch (error) {
      console.error('Report error:', error)
      toast.error('제재 처리 중 오류가 발생했습니다.')
    } finally {
      setIsSubmittingReport(false)
    }
  }, [reportSheetPostId, reportReasonType, reportReasonDetail, authAccessToken, authRefreshToken, syncSession, navigate])

  // 가격 수정 저장
  const handleSavePrice = async () => {
    if (!priceEditTargetPost || !user) return

    setIsSavingPrice(true)
    try {
      const token = await resolveAccessToken({
        accessToken: authAccessToken,
        refreshToken: authRefreshToken,
        syncSession,
      })

      if (!token) {
        alert('인증 토큰이 없습니다. 다시 로그인해주세요.')
        return
      }

      const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

      // 업데이트할 데이터 준비
      const updateData: { is_subscribers_only?: number; point_price?: number | null } = {}

      if (priceEditType === 'membership') {
        // 멤버쉽 토글 - 현재 시트에서 설정된 값을 그대로 저장
        updateData.is_subscribers_only = priceEditTargetPost.isSubscribersOnly ? 1 : 0
        // 멤버쉽 활성화 시에만 단건 가격 제거
        if (priceEditTargetPost.isSubscribersOnly) {
          updateData.point_price = null
        }
      } else if (priceEditType === 'point') {
        const newPrice = parseInt(priceEditValue, 10)
        if (isNaN(newPrice) || newPrice < 0) {
          alert('유효한 가격을 입력해주세요.')
          return
        }
        // point_price만 전달
        updateData.point_price = newPrice > 0 ? newPrice : null
      }

      const response = await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/api-posts`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ id: priceEditTargetPost.id, ...updateData }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || '가격 수정에 실패했습니다.')
      }

      // 성공 시 로컬 상태 업데이트
      setPosts((prev) =>
        prev.map((p) =>
          p.id === priceEditTargetPost.id
            ? {
                ...p,
                isSubscribersOnly: updateData.is_subscribers_only !== undefined 
                  ? updateData.is_subscribers_only === 1 
                  : p.isSubscribersOnly,
                pointPrice: 'point_price' in updateData 
                  ? (updateData.point_price ?? undefined) 
                  : p.pointPrice,
              }
            : p,
        ),
      )

      toast.success('가격이 수정되었습니다.')
      closePriceEditSheet()
    } catch (error: any) {
      console.error('가격 수정 실패:', error)
      toast.error(error.message || '가격 수정에 실패했습니다.')
    } finally {
      setIsSavingPrice(false)
    }
  }

  const fetchPostMediaFiles = useCallback(
    async (postId: string, existingToken?: string): Promise<FeedMedia[] | null> => {
      if (!postId) return null
      try {
        const token =
          existingToken ||
          (await resolveAccessToken({
            accessToken: authAccessToken,
            refreshToken: authRefreshToken,
            syncSession,
          }))

        if (!token) return null

        const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
        const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
        const response = await fetch(
          `${EDGE_FUNCTIONS_URL}/functions/v1/api-post-media?post_id=${postId}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
              apikey: SUPABASE_ANON_KEY,
            },
          },
        )

        const result = await response.json()
        if (!response.ok || !result.success) {
          throw new Error(result.error || '포스트 파일을 불러오지 못했습니다.')
        }

        const files = Array.isArray(result.data) ? result.data : []
        const media = await mapApiFilesToMediaWithSignedUrls(files)
        return media as FeedMedia[]
      } catch (error) {
        console.error('포스트 미디어 조회 실패:', error)
        return null
      }
    },
    [authAccessToken, authRefreshToken, syncSession],
  )

  const applyPointDeduction = useCallback(
    (amount: number) => {
      if (!amount || amount <= 0) return
      const basePoints =
        authUser?.total_points ??
        user?.total_points ??
        0
      const nextPoints = Math.max(0, basePoints - amount)
      updateAuthStorePoints(nextPoints)
      const userId = authUser?.id || user?.id
      if (userId) {
        queryClient.setQueryData(['user', userId], (prev: any) =>
          prev ? { ...prev, total_points: nextPoints } : prev,
        )
        queryClient.setQueryData(['member-points', userId], (prev: any) =>
          prev ? { ...prev, total_points: nextPoints } : prev,
        )
      }
    },
    [
      authUser?.id,
      authUser?.total_points,
      queryClient,
      updateAuthStorePoints,
      user?.id,
      user?.total_points,
    ],
  )

  const handleOneTimePurchase = useCallback(
    async () => {
      if (!purchaseTargetPost || isProcessingPurchase) return
      if (!purchaseTargetPost.pointPrice || purchaseTargetPost.pointPrice <= 0) return

      setIsProcessingPurchase(true)
      try {
        const token = await resolveAccessToken({
          accessToken: authAccessToken,
          refreshToken: authRefreshToken,
          syncSession,
        })
        if (!token) {
          alert('로그인이 필요합니다.')
          setIsProcessingPurchase(false)
          return
        }
        const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
        const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
        const response = await fetch(
          `${EDGE_FUNCTIONS_URL}/functions/v1/api-post-unlocks`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              apikey: SUPABASE_ANON_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              post_id: purchaseTargetPost.id,
            }),
          },
        )

        const result = await response.json()
        if (!response.ok || !result.success) {
          alert(result.error?.message || '결제에 실패했습니다.')
          setIsProcessingPurchase(false)
          return
        }

        const refreshedMedia = await fetchPostMediaFiles(purchaseTargetPost.id, token)

        // 결제 성공 시, 프론트 상태에서 해당 포스트를 구매 완료 처리
        // 기존 미디어 데이터(point_price, membership_id 등)를 유지하면서 src와 signed_url만 업데이트
        setPosts((prev) =>
          prev.map((post) => {
            if (post.id !== purchaseTargetPost.id) return post
            const mergedMedia = post.media?.map((m, idx) => {
              const refreshed = refreshedMedia?.[idx]
              const newSignedUrl = refreshed?.src || null
              if (newSignedUrl) {
                return {
                  ...m,
                  src: newSignedUrl,
                  signed_url: newSignedUrl,
                }
              }
              return m
            }) ?? post.media
            return {
              ...post,
              isPurchased: true,
              media: mergedMedia,
            }
          }),
        )
        setPurchaseTargetPost((prev) => {
          if (!prev) return prev
          const mergedMedia = prev.media?.map((m, idx) => {
            const refreshed = refreshedMedia?.[idx]
            const newSignedUrl = refreshed?.src || null
            if (newSignedUrl) {
              return {
                ...m,
                src: newSignedUrl,
                signed_url: newSignedUrl,
              }
            }
            return m
          }) ?? prev.media
          return {
            ...prev,
            isPurchased: true,
            media: mergedMedia,
          }
        })
        
        // 전역 구매 상태 업데이트 (/feed/all 캐시와 동기화)
        updateGlobalPurchaseState(purchaseTargetPost.id, true, refreshedMedia ?? undefined)

        applyPointDeduction(purchaseTargetPost.pointPrice ?? 0)

        if (typeof refetchPoints === 'function') {
          try {
            await refetchPoints()
          } catch (error) {
            console.error('포인트 정보 갱신 실패:', error)
          }
        }

        if (typeof refreshUser === 'function') {
          try {
            await refreshUser()
          } catch (error) {
            console.error('사용자 정보 갱신 실패:', error)
          }
        }

        alert('단건구매가 완료되었습니다.')
        closePurchaseSheet()
      } catch (error: any) {
        console.error('포스트 결제 실패:', error)
        alert(error?.message || '결제 처리 중 오류가 발생했습니다.')
      } finally {
        setIsProcessingPurchase(false)
      }
    },
    [
      authAccessToken,
      authRefreshToken,
      syncSession,
      purchaseTargetPost,
      isProcessingPurchase,
      applyPointDeduction,
      refetchPoints,
      refreshUser,
      fetchPostMediaFiles,
    ],
  )

  // 개별 미디어 구매 실행
  const executeMediaPurchase = useCallback(
    async (post: FeedPost, mediaIndex: number, isBundle: boolean) => {
      if (isProcessingPurchase) return
      const media = post.media?.[mediaIndex]
      if (!media || !media.point_price || media.point_price <= 0) return

      setIsProcessingPurchase(true)
      try {
        const token = await resolveAccessToken({
          accessToken: authAccessToken,
          refreshToken: authRefreshToken,
          syncSession,
        })
        if (!token) {
          alert('로그인이 필요합니다.')
          setIsProcessingPurchase(false)
          return
        }

        const discountRate = post.discountRate ?? 0
        let finalPrice = 0
        let mediaIndices: number[] = []
        
        if (isBundle && post.isBundle) {
          const unpurchasedMedia = post.media?.filter((m, idx) => {
            const isPurchased = post.purchasedMediaOrder != null && idx <= post.purchasedMediaOrder
            return !m.signed_url && m.point_price != null && m.point_price > 0 && !isPurchased
          }) || []
          
          const totalBasePrice = unpurchasedMedia.reduce((sum, m) => sum + (m.point_price || 0), 0)
          finalPrice = discountRate > 0 && discountRate <= 100
            ? Math.round(totalBasePrice * (1 - discountRate / 100))
            : totalBasePrice
          
          mediaIndices = post.media?.map((m, idx) => {
            const isPurchased = post.purchasedMediaOrder != null && idx <= post.purchasedMediaOrder
            if (!m.signed_url && m.point_price != null && m.point_price > 0 && !isPurchased) {
              return idx
            }
            return -1
          }).filter(idx => idx >= 0) || []
        } else {
          const mediaUpToIndex = post.media?.slice(0, mediaIndex + 1).filter((m, idx) => {
            const isPurchased = post.purchasedMediaOrder != null && idx <= post.purchasedMediaOrder
            return !m.signed_url && m.point_price != null && m.point_price > 0 && !isPurchased
          }) || []
          
          const totalBasePrice = mediaUpToIndex.reduce((sum, m) => sum + (m.point_price || 0), 0)
          finalPrice = discountRate > 0 && discountRate <= 100
            ? Math.round(totalBasePrice * (1 - discountRate / 100))
            : totalBasePrice
          
          mediaIndices = post.media?.slice(0, mediaIndex + 1).map((m, idx) => {
            const isPurchased = post.purchasedMediaOrder != null && idx <= post.purchasedMediaOrder
            if (!m.signed_url && m.point_price != null && m.point_price > 0 && !isPurchased) {
              return idx
            }
            return -1
          }).filter(idx => idx >= 0) || []
        }

        const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
        const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
        const response = await fetch(
          `${EDGE_FUNCTIONS_URL}/functions/v1/api-post-unlocks`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              apikey: SUPABASE_ANON_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              post_id: post.id,
              media_order: Math.max(...mediaIndices),
              media_indices: mediaIndices,
              is_bundle: isBundle || mediaIndices.length > 1,
            }),
          },
        )

        const result = await response.json()
        if (!response.ok || !result.success) {
          const errorMessage: string = result?.error || result?.message || '미디어를 구매할 수 없습니다.'
          alert(errorMessage)
          setIsProcessingPurchase(false)
          return
        }

        const refreshedMedia = await fetchPostMediaFiles(post.id, token)
        const newPurchasedOrder = Math.max(...mediaIndices)
        setPosts((prev) =>
          prev.map((p) => {
            if (p.id !== post.id) return p
            const mergedMedia = p.media?.map((m, idx) => {
              if (idx <= newPurchasedOrder) {
                const refreshed = refreshedMedia?.[idx]
                const newSignedUrl = refreshed?.src || null
                if (newSignedUrl) {
                  return {
                    ...m,
                    src: newSignedUrl,
                    signed_url: newSignedUrl,
                  }
                }
              }
              return m
            }) ?? p.media
            return {
              ...p,
              media: mergedMedia,
              purchasedMediaOrder: Math.max(p.purchasedMediaOrder ?? -1, newPurchasedOrder),
            }
          }),
        )

        updateGlobalPurchaseState(post.id, true, refreshedMedia ?? undefined)
        applyPointDeduction(finalPrice)

        if (typeof refetchPoints === 'function') {
          try {
            await refetchPoints()
          } catch (error) {
            console.error('포인트 정보 갱신 실패:', error)
          }
        }

        if (typeof refreshUser === 'function') {
          try {
            await refreshUser()
          } catch (error) {
            console.error('사용자 정보 갱신 실패:', error)
          }
        }

        setIsMediaPurchaseSheetVisible(false)
        setMediaPurchaseTarget(null)
        setSelectedMediaPurchaseOption(null)
      } catch (error: any) {
        console.error('미디어 구매 실패:', error)
        alert(error?.message || '구매 처리 중 오류가 발생했습니다.')
      } finally {
        setIsProcessingPurchase(false)
      }
    },
    [
      isProcessingPurchase,
      authAccessToken,
      authRefreshToken,
      syncSession,
      applyPointDeduction,
      refetchPoints,
      refreshUser,
      fetchPostMediaFiles,
    ],
  )

  // formatRelativeTime 함수
  const formatRelativeTime = (dateString: string): string => {
    const date = new Date(dateString)
    const now = new Date()
    const diffInMs = now.getTime() - date.getTime()
    const diffInSeconds = Math.floor(diffInMs / 1000)
    const diffInMinutes = Math.floor(diffInSeconds / 60)
    const diffInHours = Math.floor(diffInMinutes / 60)
    const diffInDays = Math.floor(diffInHours / 24)
    const diffInWeeks = Math.floor(diffInDays / 7)

    if (diffInSeconds < 60) {
      return '방금 전'
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes}분 전`
    } else if (diffInHours < 24) {
      return `${diffInHours}시간 전`
    } else if (diffInDays === 1) {
      return '하루 전'
    } else if (diffInDays < 7) {
      return `${diffInDays}일 전`
    } else if (diffInWeeks === 1) {
      return '일주일 전'
    } else if (diffInWeeks < 4) {
      return `${diffInWeeks}주 전`
    } else {
      const diffInMonths = Math.floor(diffInDays / 30)
      if (diffInMonths < 12) {
        return `${diffInMonths}개월 전`
      } else {
        const diffInYears = Math.floor(diffInDays / 365)
        return `${diffInYears}년 전`
      }
    }
  }

  // 멤버쉽 데이터 가져오기
  useEffect(() => {
    if (!partner?.id) return
    let mounted = true
    const fetchMemberships = async () => {
      setIsMembershipsLoading(true)
      try {
        const token = await resolveAccessToken({
          accessToken: authAccessToken,
          refreshToken: authRefreshToken,
          syncSession,
        })
        const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
        const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
        const headers: Record<string, string> = {
          apikey: SUPABASE_ANON_KEY,
        }
        if (token) {
          headers.Authorization = `Bearer ${token}`
        }
        const response = await fetch(
          `${EDGE_FUNCTIONS_URL}/functions/v1/api-membership?partner_id=${partner.id}`,
          { method: 'GET', headers },
        )
        const result = await response.json()
        if (result.success && result.data && mounted) {
          // name 필드가 JSON 객체인 경우 처리
          const processedData = result.data.map((m: any) => ({
            ...m,
            name: typeof m.name === 'object' && m.name !== null ? m.name.name || JSON.stringify(m.name) : m.name,
          }))
          setPartnerMemberships(processedData)
        }
      } catch (error) {
        console.error('멤버쉽 조회 실패:', error)
      } finally {
        if (mounted) setIsMembershipsLoading(false)
      }
    }
    fetchMemberships()
    return () => { mounted = false }
  }, [partner?.id, authAccessToken, authRefreshToken, syncSession])

  // 멤버쉽 구매 처리
  const handleMembershipPurchase = async () => {
    if (!selectedMembership || !user?.id) return
    
    // 자기 자신의 멤버쉽 구매 불가
    if (partner?.member_id === user.id) {
      toast.error('자신의 멤버쉽은 구매할 수 없습니다')
      return
    }
    
    setIsProcessingMembershipPurchase(true)
    try {
      const token = await resolveAccessToken({
        accessToken: authAccessToken,
        refreshToken: authRefreshToken,
        syncSession,
      })
      if (!token) {
        toast.error('로그인이 필요합니다')
        return
      }
      
      const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
      
      // 다음 결제일 계산 (한 달 후)
      const nextBillingDate = new Date()
      nextBillingDate.setMonth(nextBillingDate.getMonth() + 1)
      
      const response = await fetch(
        `${EDGE_FUNCTIONS_URL}/functions/v1/api-membership-subscriptions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            membership_id: selectedMembership.id,
            next_billing_at: nextBillingDate.toISOString(),
          }),
        },
      )
      
      const result = await response.json()
      if (result.success) {
        toast.success(`${selectedMembership.name} 멤버쉽 구독을 시작했습니다!`)
        
        // 전역 캐시 무효화 후 피드 새로고침하여 잠금 해제된 포스트 반영
        invalidateGlobalFeedCache()
        setPostsRefreshTrigger(prev => prev + 1)
        
        // React Query 캐시 강제 무효화 후 새로고침
        await queryClient.invalidateQueries({ queryKey: ['partner-details-by-member-code', memberCode] })
        await refetchPartner()
        
        // 팝업은 데이터 새로고침 후 닫기
        setIsMembershipPurchaseSheetOpen(false)
        setSelectedMembership(null)
      } else {
        if (result.error?.code === 'ALREADY_SUBSCRIBED') {
          toast.error('이미 구독 중인 멤버쉽입니다')
        } else if (result.error?.code === 'INSUFFICIENT_POINTS') {
          toast.error('포인트가 부족합니다')
        } else {
          toast.error(result.error?.message || '구독에 실패했습니다')
        }
      }
    } catch (error) {
      console.error('멤버쉽 구매 실패:', error)
      toast.error('구독에 실패했습니다')
    } finally {
      setIsProcessingMembershipPurchase(false)
    }
  }

  // 포스트 데이터 가져오기
  useEffect(() => {
    if (!partner?.id || activeTab !== 'posts') return
    let mounted = true
    const fetchPosts = async () => {
      setIsPostsLoading(true)
      try {
        const token = await resolveAccessToken({
          accessToken: authAccessToken,
          refreshToken: authRefreshToken,
          syncSession,
        })
        if (!token) {
          if (mounted) {
            setPosts([])
            setIsPostsLoading(false)
          }
          return
        }
        const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
        const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
        const response = await fetch(
          `${EDGE_FUNCTIONS_URL}/functions/v1/api-posts-list?partner_id=${partner.id}&page_no=1&_t=${Date.now()}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
              apikey: SUPABASE_ANON_KEY,
            },
          },
        )
        const result = await response.json()
        if (!response.ok || !result.success) {
          throw new Error(result.error || '포스트를 불러오지 못했습니다.')
        }
        if (!mounted) return
        // API 응답을 FeedPost 형식으로 변환
        const convertedPosts: FeedPost[] = (result.data || []).map((item: any) => {
          const files = Array.isArray(item.files) ? item.files : []
          const media = mapApiFilesToMedia(files) as FeedMedia[]
          // 각 미디어에 point_price와 signed_url 정보 포함
          media.forEach((m, idx) => {
            const file = files[idx]
            if (file) {
              m.point_price = file.point_price ?? null
              m.signed_url = file.signed_url ?? null
            }
          })

          return {
            id: item.id,
            partnerId: item.partner_id,
            category: 'following' as const,
            author: {
              name: item.partner?.name || item.partner?.member?.name || partner?.member?.name || 'Unknown',
              handle:
                item.partner?.member_code ||
                item.partner?.member?.member_code ||
                partner?.member?.member_code ||
                'unknown',
              avatar:
                item.partner?.profile_image ||
                item.partner?.member?.profile_image ||
                partner?.member?.profile_image ||
                '',
            },
            postedAt: item.published_at || new Date().toISOString(),
            content: item.content || '',
            media,
            likes: item.like_count || 0,
            comments: [],
            tags: [],
            isLiked: item.is_liked || false,
            isFollowed: true,
            isSubscribersOnly: item.is_subscribers_only || false,
            pointPrice: item.point_price ?? undefined,
            commentCount: item.comment_count ?? 0,
            isPurchased: item.is_purchased || false,
            isPaidPost: item.is_paid_post || false,
            isInAlbum: item.is_in_album || false,
            hasMembership: item.has_membership || false,
            isPinned: item.is_pinned || false,
            isBundle: item.is_bundle ?? false,
            discountRate: item.discount_rate ?? 0,
            membershipId: item.membership_id ?? null,
            purchasedMediaOrder: item.purchased_media_order ?? null,
          }
        })
        setPosts(convertedPosts)
        
        // savedPostIds 초기화 (is_in_album 기준)
        const initialSavedPostIds = new Set<string>()
        convertedPosts.forEach(post => {
          if (post.isInAlbum) {
            initialSavedPostIds.add(post.id)
          }
        })
        setSavedPostIds(initialSavedPostIds)
        
        // 좋아요 상태 초기화
        const initialLikesState: Record<string, { liked: boolean; count: number }> = {}
        convertedPosts.forEach((post) => {
          initialLikesState[post.id] = {
            liked: post.isLiked || false,
            count: post.likes,
          }
        })
        setLikesState(initialLikesState)
      } catch (error: any) {
        console.error('포스트 로딩 실패:', error)
        if (mounted) {
          setPosts([])
        }
      } finally {
        if (mounted) {
          setIsPostsLoading(false)
          setTimeout(() => tabSwiperRef.current?.updateAutoHeight(200), 100)
        }
      }
    }
    fetchPosts()
    return () => {
      mounted = false
    }
  }, [partner?.id, activeTab, authAccessToken, authRefreshToken, syncSession, partner?.member, postsRefreshTrigger])

  // 스토어 상품 데이터 가져오기
  useEffect(() => {
    if (!partner?.id || activeTab !== 'store') return
    let mounted = true

    const fetchStoreProducts = async () => {
      setIsStoreLoading(true)
      try {
        const { storeProductsApi } = await import('@/api/store')
        const params: any = {
          partner_id: partner.id,
          is_active: true,
          page: storePage,
          limit: 20,
        }
        if (storeProductType !== 'all') {
          params.product_type = storeProductType
        }
        if (storeSource !== 'all') {
          params.source = storeSource
        }
        
        const response = await storeProductsApi.getList(params)
        
        if (mounted && response.success && response.data) {
          setStoreProducts(Array.isArray(response.data) ? response.data : (response.data as any).products || [])
          if (response.meta) {
            setStoreTotal(response.meta.total || 0)
            setStoreTotalPages(response.meta.totalPages || Math.ceil((response.meta.total || 0) / 20))
          }
        }
      } catch (error) {
        console.error('스토어 상품 조회 실패:', error)
      } finally {
        if (mounted) {
          setIsStoreLoading(false)
          setTimeout(() => tabSwiperRef.current?.updateAutoHeight(200), 100)
        }
      }
    }

    fetchStoreProducts()
    return () => {
      mounted = false
    }
  }, [partner?.id, activeTab, storeProductType, storeSource, storePage])

  const handleFollow = async () => {
    if (!partner) return
    if (!user) {
      navigate({ to: '/login' })
      return
    }
    const next = !isFollowing
    setIsFollowing(next)
    const delta = next ? 1 : -1
    setDisplayFollowerCount((prev) => Math.max(0, prev + delta))
    
    // 전역 피드 캐시 업데이트 (팔로우 상태 동기화) - memberCode 사용
    updateGlobalFollowState(memberCode, next)
    
    queryClient.setQueryData<typeof partner | null>(
      ['partner-details-by-member-code', memberCode],
      (prev) => {
        if (!prev) return prev
        const cloned = JSON.parse(JSON.stringify(prev)) as typeof prev & { follow_count?: number; is_followed?: boolean }
        cloned.is_followed = next
        const currentCount = typeof cloned.follow_count === 'number' ? cloned.follow_count : 0
        cloned.follow_count = Math.max(0, currentCount + delta)
        return cloned
      },
    )
    setIsFollowProcessing(true)
    try {
      await toggleFollowPartner(partner.id, next, {
        accessToken: authAccessToken,
        refreshToken: authRefreshToken,
        syncSession,
      })
    } catch (error: any) {
      setIsFollowing(!next)
      setDisplayFollowerCount((prev) => Math.max(0, prev - delta))
      
      // 전역 피드 캐시 롤백 - memberCode 사용
      updateGlobalFollowState(memberCode, !next)
      
      queryClient.setQueryData(
        ['partner-details-by-member-code', memberCode],
        (prev) => {
          if (!prev) return prev
          const cloned = JSON.parse(JSON.stringify(prev)) as typeof prev & { follow_count?: number; is_followed?: boolean }
          cloned.is_followed = !next
          const currentCount = typeof cloned.follow_count === 'number' ? cloned.follow_count : 0
          cloned.follow_count = Math.max(0, currentCount - delta)
          return cloned
        },
      )
      alert(error?.message || '팔로우 처리에 실패했습니다.')
    } finally {
      setIsFollowProcessing(false)
    }
  }

  // 미디어에서 썸네일 추출 (비디오인 경우 캡처)
  const getThumbnailFromMedia = async (post: FeedPost): Promise<string | undefined> => {
    const firstMedia = post.media?.[0] as any
    if (!firstMedia) return post.author?.avatar
    
    // 이미지인 경우 바로 URL 반환
    if (firstMedia.type === 'image') {
      return firstMedia.src || 
             firstMedia.thumbnailUrl || 
             firstMedia.signed_url ||
             firstMedia.media_full_url ||
             firstMedia.url ||
             post.author?.avatar
    }
    
    // 비디오인 경우 - 기존 썸네일이 있으면 사용
    const existingThumbnail = firstMedia.thumbnailUrl || firstMedia.poster
    if (existingThumbnail) return existingThumbnail
    
    // 비디오 캡처 시도
    const videoUrl = firstMedia.src || 
                    firstMedia.signed_url ||
                    firstMedia.media_full_url ||
                    firstMedia.url
    
    if (videoUrl) {
      try {
        const capturedThumbnail = await captureVideoThumbnail(videoUrl)
        if (capturedThumbnail) return capturedThumbnail
      } catch (e) {
        console.warn('비디오 썸네일 캡처 실패:', e)
      }
    }
    
    return post.author?.avatar
  }

  // 포스트 저장 핸들러
  const handleSavePost = async (post: FeedPost) => {
    if (!user) {
      navigate({ to: '/login' })
      return
    }

    const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
    const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

    // 이미 저장된 경우 DELETE로 저장 취소
    if (savedPostIds.has(post.id)) {
      try {
        const token = await resolveAccessToken({
          accessToken: authAccessToken,
          refreshToken: authRefreshToken,
          syncSession,
        })
        if (!token) {
          navigate({ to: '/login' })
          return
        }

        const response = await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/api-album-posts/${post.id}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: SUPABASE_ANON_KEY,
          },
        })

        const result = await response.json()
        if (result.success) {
          // 저장된 포스트 ID 제거
          setSavedPostIds(prev => {
            const newSet = new Set(prev)
            newSet.delete(post.id)
            return newSet
          })
          toast.success('저장이 취소되었습니다')
        } else {
          toast.error(result.error || '취소에 실패했습니다')
        }
      } catch (error) {
        console.error('저장 취소 실패:', error)
        toast.error('취소에 실패했습니다')
      }
      return
    }

    // 저장되지 않은 경우 POST로 저장
    try {
      const token = await resolveAccessToken({
        accessToken: authAccessToken,
        refreshToken: authRefreshToken,
        syncSession,
      })
      if (!token) {
        navigate({ to: '/login' })
        return
      }

      const response = await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/api-album-posts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ post_id: post.id }),
      })

      const result = await response.json()
      if (result.success) {
        // 저장된 포스트 ID 추가
        setSavedPostIds(prev => new Set(prev).add(post.id))
        
        // 썸네일 URL 가져오기 - 비디오인 경우 캡처
        const thumbnail = await getThumbnailFromMedia(post)
        
        console.log('📸 Save post thumbnail:', { postId: post.id, thumbnail })
        
        setSavedPostInfo({
          post_id: post.id,
          thumbnail_url: thumbnail,
        })
        setIsSaveSheetOpen(true)
      } else {
        toast.error(result.error || '저장에 실패했습니다')
      }
    } catch (error) {
      console.error('포스트 저장 실패:', error)
      toast.error('저장에 실패했습니다')
    }
  }

  // 저장 취소 핸들러
  const handleUnsavePost = () => {
    if (savedPostInfo?.post_id) {
      setSavedPostIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(savedPostInfo.post_id)
        return newSet
      })
    }
    setSavedPostInfo(null)
  }

  const handleQuickChat = () => {
    if (!user || !partner) {
      navigate({ to: '/login' })
      return
    }

    const partnerName =
      partner.partner_name ||
      partner.member.name ||
      partner.member.member_code ||
      'Unknown'

    addTempChatRoom({
      partnerId: partner.member_id,
      partnerName,
      partnerAvatar: partner.member.profile_image || undefined,
    })

    navigate({
      to: '/chat',
      search: {
        partnerId: partner.member_id,
        partnerName,
      },
    })
  }

  const handleJobRequest = (job: any) => {
    if (!user || !partner) {
      navigate({ to: '/login' })
      return
    }

    // 멤버십 티어 조건 체크
    if (job.membership_id && job.min_tier_rank) {
      // 해당 퀘스트가 특정 멤버십을 요구하는 경우
      if (!subscribedMembership || subscribedMembership.membership_id !== job.membership_id) {
        setQuestMembershipPopup({
          isOpen: true,
          membershipId: job.membership_id,
          minTierRank: job.min_tier_rank,
        })
        return
      }
      
      // 구독 중인 멤버십의 티어 확인
      const userMembership = partnerMemberships.find(m => m.id === subscribedMembership.membership_id)
      const userTierRank = userMembership?.tier_rank || 0
      
      if (userTierRank < job.min_tier_rank) {
        setQuestMembershipPopup({
          isOpen: true,
          membershipId: job.membership_id,
          minTierRank: job.min_tier_rank,
        })
        return
      }
    }

    try {
      const partnerName =
        partner.partner_name ||
        partner.member.name ||
        partner.member.member_code ||
        'Unknown'

      addTempChatRoom({
        partnerId: partner.member_id,
        partnerName,
        partnerAvatar: partner.member.profile_image || undefined,
      })

      const sessions = jobSessions[job.id] || 1
      const totalCost = sessions * (job.coins_per_job || 0)

      // 퀘스트 정보를 JSON으로 전달하여 채팅방에서 자동 처리
      const jobRequestData = JSON.stringify({
        jobId: job.id,
        jobName: job.job_name,
        count: sessions,
        coinsPerJob: job.coins_per_job || 0,
        totalCost,
      })

      navigate({
        to: '/chat',
        search: {
          partnerId: partner.member_id,
          partnerName,
          jobRequest: jobRequestData, // 퀘스트 요청 데이터
        },
      })
    } catch (err) {
      console.error('의뢰 처리 중 오류:', err)
      handleQuickChat()
    }
  }

  useEffect(() => {
    if (partner) {
      const isFollowed =
        (partner as typeof partner & { is_followed?: boolean }).is_followed ?? false
      setIsFollowing(isFollowed)
    }
  }, [partner])

  const isOwnProfile = !!(user && partner && user.id === partner.member_id)

  const handleOpenFollowers = async () => {
    if (!partner) return
    if (!user) {
      navigate({ to: '/login' })
      return
    }
    setIsFollowersModalOpen(true)
    setIsFollowersLoading(true)
    try {
      const list = await fetchFollowers(partner.id, {
        accessToken: authAccessToken,
        refreshToken: authRefreshToken,
        syncSession,
      })
      setFollowers(list)
    } catch (error: any) {
      setFollowers([])
      alert(error?.message || '팔로워 목록을 불러오지 못했습니다.')
    } finally {
      setIsFollowersLoading(false)
    }
  }

  const [isInitialLoading, setIsInitialLoading] = useState(true)
  useEffect(() => {
    if (!isLoading) {
      const timeout = setTimeout(() => setIsInitialLoading(false), 100)
      return () => clearTimeout(timeout)
    }
  }, [isLoading])

  if (isInitialLoading) {
    return <PartnerDetailSkeleton />
  }

  // 차단당한 경우 오버레이 표시
  const isBlockedByUser = error instanceof PartnerDetailError && error.code === 'BLOCKED_BY_USER'

  if (isBlockedByUser) {
    return (
      <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm overflow-hidden">
        <div className="text-center px-6">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-700 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <Typography variant="h3" className="mb-3 font-semibold text-white">
            더 이상 이 프로필에 접근할 수 없습니다
          </Typography>
          <Button 
            className="rounded-full bg-white px-6 py-2 text-black hover:bg-gray-100" 
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.history.back()
              }
            }}
          >
            뒤로 가기
          </Button>
        </div>
      </div>
    )
  }

  if (error || !partner) {
    return (
      <div className="min-h-screen bg-white text-[#110f1a]">
        <div className="mx-auto max-w-3xl p-6">
          <div className="py-16 text-center">
            <Typography variant="h3" className="mb-3 font-semibold text-[#110f1a]">
              파트너를 찾을 수 없습니다
            </Typography>
            <Typography variant="body1" className="mb-6 text-gray-500">
              존재하지 않거나 비활성화된 파트너입니다.
            </Typography>
            <Button className="rounded-full bg-white px-6 text-white" onClick={() => navigate({ to: '/' })}>
              홈으로 돌아가기
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const membershipPlans = [
    {
      id: 'basic',
      title: 'Basic Connect',
      price: '₩9,900 /월',
      perks: ['주 1회 Q&A', '하이라이트 피드백', '커뮤니티 배지'],
    },
    {
      id: 'pro',
      title: 'Pro Review',
      price: '₩24,900 /월',
      perks: ['주 1회 1:1 리뷰', '개인화 트레이닝 플랜', '게스트 세션 우선권'],
    },
  ]

  const handleStoreProductClick = (product: any, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation()
      e.preventDefault()
    }
    // 협업 상품인 경우 partnerId를 쿼리 파라미터로 전달
    navigate({
      to: '/store/products/$productId',
      params: { productId: product.product_id },
      search: { 
        partnerId: product.source === 'collaboration' && partner?.id 
          ? partner.id 
          : undefined 
      },
    })
  }

  const fetchShippingAddresses = async () => {
    setIsLoadingAddresses(true)
    try {
      const response = await storeCartApi.getShippingAddresses()
      if (response.success && response.data) {
        const addresses = Array.isArray(response.data) ? response.data : []
        setShippingAddresses(addresses)
        const defaultAddr = addresses.find((a: ShippingAddress) => a.is_default)
        if (defaultAddr) {
          setSelectedShippingAddressId(defaultAddr.id)
        }
      }
    } catch (err) {
      console.error('배송지 조회 실패:', err)
    } finally {
      setIsLoadingAddresses(false)
    }
  }

  const handleStoreProductPurchase = async () => {
    if (!user) {
      navigate({ to: '/login' })
      return
    }

    if (!selectedStoreProduct) return

    // 택배 상품인 경우 배송지 입력 시트 열기
    if (selectedStoreProduct.product_type === 'delivery') {
      fetchShippingAddresses()
      setIsDeliverySheetOpen(true)
      return
    }

    // 그 외 상품은 바로 주문
    await createOrder()
  }

  const createOrder = async (shippingInfo?: CheckoutParams) => {
    if (!selectedStoreProduct) return

    try {
      const orderData: any = {
        product_id: selectedStoreProduct.product_id,
        quantity: 1,
        ...shippingInfo,
      }

      // 협업 상품인 경우 partner_id 추가
      if (selectedStoreProduct.source === 'collaboration' && partner?.id) {
        orderData.partner_id = partner.id
      }

      const response = await storeOrdersApi.create(orderData)
      
      if (response.success && response.data) {
        const orderId = (response.data as any).order_id
        if (orderId) {
          toast.success('주문이 생성되었습니다.')
          navigate({
            to: '/store/orders/$orderId',
            params: { orderId },
          })
          setSelectedStoreProduct(null)
          setIsDeliverySheetOpen(false)
        } else {
          toast.error('주문 ID를 받지 못했습니다.')
        }
      } else {
        toast.error(response.error?.message || '주문 생성에 실패했습니다.')
      }
    } catch (err: any) {
      toast.error(err.message || '주문 생성에 실패했습니다.')
    }
  }

  const handleDeliveryPurchase = async () => {
    if (useDirectInput) {
      if (!deliveryInfo.recipient_name || !deliveryInfo.recipient_phone || !deliveryInfo.recipient_address || !deliveryInfo.recipient_postal_code) {
        toast.error('필수 배송 정보를 입력해주세요')
        return
      }
      await createOrder(deliveryInfo)
    } else {
      if (!selectedShippingAddressId) {
        toast.error('배송지를 선택해주세요')
        return
      }
      await createOrder({ shipping_address_id: selectedShippingAddressId })
    }
  }

  const handleStoreProductAddToCart = async () => {
    if (!selectedStoreProduct) return
    if (!user) {
      navigate({ to: '/login' })
      return
    }

    try {
      const response = await storeCartApi.addItem({
        product_id: selectedStoreProduct.product_id,
        quantity: 1,
      })

      if (response.success) {
        toast.success('장바구니에 추가되었습니다')
      } else {
        toast.error(response.error?.message || '장바구니 추가에 실패했습니다')
      }
    } catch (err: any) {
      toast.error(err.message || '장바구니 추가에 실패했습니다')
    }
  }

  const renderStoreContent = () => {
    return (
      <div 
        className="space-y-4"
        onClick={(e) => {
          e.stopPropagation();
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
      >
        <StoreFilterTabs
          activeProductType={storeProductType}
          activeSource={storeSource}
          onProductTypeChange={(type) => {
            setStoreProductType(type)
            setStorePage(1)
          }}
          onSourceChange={(source) => {
            setStoreSource(source)
            setStorePage(1)
          }}
        />

        {isStoreLoading ? (
          <StoreLoadingState count={8} />
        ) : storeProducts.length === 0 ? (
          <StoreEmptyState message="등록된 상품이 없습니다" />
        ) : (
          <>
            <div 
              className="grid grid-cols-2 gap-3"
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              {storeProducts.map((product) => (
                <ProductCard 
                  key={product.product_id} 
                  product={product}
                  partnerId={partner?.id}
                />
              ))}
            </div>

            {/* 페이지네이션 */}
            {storeTotalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <button
                  onClick={() => setStorePage((p) => Math.max(1, p - 1))}
                  disabled={storePage === 1}
                  className="px-3 py-1 rounded-lg text-sm border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  이전
                </button>
                <span className="text-sm text-gray-600">
                  {storePage} / {storeTotalPages}
                </span>
                <button
                  onClick={() => setStorePage((p) => Math.min(storeTotalPages, p + 1))}
                  disabled={storePage >= storeTotalPages}
                  className="px-3 py-1 rounded-lg text-sm border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  다음
                </button>
              </div>
            )}
          </>
        )}

        {/* 선택된 상품 하단 고정 버튼 */}
        {selectedStoreProduct && activeTab === 'store' && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 safe-area-bottom z-50">
            <div className="max-w-2xl mx-auto flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  navigate({
                    to: '/store/products/$productId',
                    params: { productId: selectedStoreProduct.product_id },
                  })
                }}
                className="flex-1"
              >
                상세보기
              </Button>
              <Button
                variant="outline"
                onClick={handleStoreProductAddToCart}
                className="flex-1"
              >
                <ShoppingCart className="h-4 w-4 mr-2" />
                장바구니
              </Button>
              <Button
                onClick={handleStoreProductPurchase}
                className="flex-1 bg-[#FE3A8F] text-white"
              >
                <CreditCard className="h-4 w-4 mr-2" />
                구매하기
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const renderPostsContent = () => {
    if (isPostsLoading) {
      return (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={`posts-skel-${i}`} className="rounded-3xl bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-full bg-gray-200 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 rounded bg-gray-200 animate-pulse" />
                  <div className="h-3 w-20 rounded bg-gray-100 animate-pulse" />
                </div>
              </div>
              <div className="mt-4 space-y-2">
                <div className="h-3 w-full rounded bg-gray-100 animate-pulse" />
                <div className="h-3 w-3/4 rounded bg-gray-100 animate-pulse" />
              </div>
              <div className="mt-4 h-60 w-full rounded-2xl bg-gray-200 animate-pulse" />
              <div className="mt-4 flex gap-4">
                {[1, 2, 3].map((action) => (
                  <div key={`posts-skel-action-${i}-${action}`} className="h-5 w-16 rounded bg-gray-100 animate-pulse" />
                ))}
              </div>
            </div>
          ))}
        </div>
      )
    }

    if (posts.length === 0) {
      return (
        <div className="flex items-center justify-center py-12">
          <p className="text-gray-500">표시할 피드가 없습니다.</p>
        </div>
      )
    }

    return (
      <div className="space-y-6">
        {posts.map((post) => (
          <article
            key={post.id}
            className="space-y-4"
            draggable={false}
            onDragStart={(event) => event.preventDefault()}
          >
            <header className="flex items-start gap-4">
              <Link
                to="/partners/$memberCode"
                params={{ memberCode: post.author.handle }}
                className="flex flex-1 items-start gap-4 rounded-2xl p-1 text-left no-underline transition hover:bg-gray-50 focus:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#110f1a]/30"
              >
                <AvatarWithFallback
                  name={post.author.name}
                  src={post.author.avatar || partner?.member.profile_image || undefined}
                  size="sm"
                  className="h-8 w-8"
                />
                <div className="flex-1">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                    <p className="font-semibold text-[#110f1a]">{post.author.name}</p>
                      {post.isPinned && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#FE3A8F]/10 text-[#FE3A8F] text-xs font-medium">
                          <Pin className="h-3 w-3" />
                          고정됨
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 font-bold">
                    <span className="text-xs text-gray-400">@{post.author.handle}</span>
                    <span className="text-xs text-gray-400">·</span>
                    <p className="text-xs text-gray-400">{formatRelativeTime(post.postedAt)}</p>
                  </div>
                </div>
              </Link>
              {/* 내 피드일 때 더보기 메뉴, 아닐 때 북마크 버튼 */}
              {isViewingOwnProfile ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    openPostMenuSheet(post)
                  }}
                  className="p-1 rounded-full hover:bg-gray-100 transition"
                >
                  <MoreVertical className="h-5 w-5 text-gray-500" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setOtherPostMenuTargetPost(post)
                  }}
                  className="p-1 rounded-full hover:bg-gray-100 transition"
                >
                  <MoreVertical className="h-5 w-5 text-gray-500" />
                </button>
              )}
            </header>

            {post.content && (
              <div className="relative">
                <Typography 
                  variant="body1" 
                  className={`text-gray-700 whitespace-pre-wrap ${
                    !expandedPosts.has(post.id) ? 'line-clamp-2' : ''
                  }`}
                >
              {post.content}
            </Typography>
                {post.content.split('\n').length > 2 || post.content.length > 100 ? (
                  !expandedPosts.has(post.id) && (
                    <button
                      type="button"
                      onClick={() => setExpandedPosts(prev => new Set(prev).add(post.id))}
                      className="text-gray-500 text-sm font-medium mt-1 hover:text-gray-700"
                    >
                      더보기
                    </button>
                  )
                ) : null}
              </div>
            )}

            {/* 본인 프로필일 때만 멤버쉽/단건구매 뱃지 표시 */}
            {isViewingOwnProfile && (post.isSubscribersOnly || (post.pointPrice !== undefined && post.pointPrice > 0)) && (
              <div className="flex items-center gap-2 mt-2">
                {post.isSubscribersOnly && (
                  <button
                    type="button"
                    onClick={() => openPriceEditSheet(post, 'membership')}
                    className="inline-flex items-center gap-1.5 px-1.5 py-1 text-xs font-medium bg-white border border-gray-200 text-gray-700 rounded-sm hover:bg-gray-50 transition-colors shadow-sm"
                  >
                    <Star className="h-3.5 w-3.5 text-purple-500" />
                    <span>멤버쉽</span>
                  </button>
                )}
                {(post.pointPrice !== undefined && post.pointPrice > 0) && (
                  <button
                    type="button"
                    onClick={() => openPriceEditSheet(post, 'point')}
                    className="inline-flex items-center gap-1.5 px-1.5 py-1 text-xs font-medium bg-white border border-gray-200 text-gray-700 rounded-sm hover:bg-gray-50 transition-colors shadow-sm"
                  >
                    <Heart className="h-3.5 w-3.5 text-red-500 fill-red-500" />
                    <span>단건구매</span>
                  </button>
                )}
              </div>
            )}
            {(() => {
              // 접근 권한 체크:
              // 1. is_subscribers_only: has_membership이 true면 접근 가능
              // 2. point_price > 0: is_purchased가 true면 접근 가능
              // 3. 둘 다 있으면: has_membership OR is_purchased 중 하나면 접근 가능
              const canAccessContent = (() => {
                if (isViewingOwnProfile) return true
                
                const hasPointPrice = post.pointPrice !== undefined && post.pointPrice > 0
                
                // 둘 다 조건이 있는 경우
                if (post.isSubscribersOnly && hasPointPrice) {
                  return post.hasMembership || post.isPurchased
                }
                // 구독자 전용만
                if (post.isSubscribersOnly) {
                  return post.hasMembership
                }
                // 유료 포스트만 (point_price > 0)
                if (hasPointPrice) {
                  return post.isPurchased
                }
                return true // 무료 공개 콘텐츠
              })()
              
              const isLocked = !canAccessContent && (post.isSubscribersOnly || (post.pointPrice !== undefined && post.pointPrice > 0))
              
              const handleLockedClick = isLocked
                ? () => {
                    setPurchaseTargetPost(post)
                  }
                : undefined

              if (post.media && post.media.length > 0) {
                return (
                  <FeedMediaCarousel
                    media={post.media}
                    onMediaClick={({ mediaList, index }) => handlePreviewMedia(post.id, mediaList, index)}
                    isSubscribersOnly={post.isSubscribersOnly}
                    pointPrice={post.pointPrice}
                    isPurchased={canAccessContent}
                    onLockedClick={handleLockedClick}
                    memberCode={user?.member_code}
                    isBundle={post.isBundle}
                    discountRate={post.discountRate ?? 0}
                    purchasedMediaOrder={post.purchasedMediaOrder ?? null}
                    onMediaPurchaseClick={(mediaIndex) => {
                      handleMediaPurchaseClick(post, mediaIndex)
                    }}
                    postPointPrice={post.pointPrice}
                    postIsSubscribersOnly={post.isSubscribersOnly}
                    onMembershipClick={() => {
                      setPurchaseTargetPost(post)
                      setTargetMembershipId(null)
                      setIsMembershipPurchaseSheetOpen(true)
                    }}
                    onMediaMembershipClick={(membershipId, _mediaIndex) => {
                      setPurchaseTargetPost(post)
                      setTargetMembershipId(membershipId)
                      setIsMembershipPurchaseSheetOpen(true)
                    }}
                    onMembershipBadgeClick={(membershipId) => {
                      setMembershipInfoSheetPost(post)
                      setMembershipInfoSheetTargetId(membershipId ?? null)
                      setIsMembershipInfoSheetOpen(true)
                    }}
                  />
                )
              }

              if (isLocked) {
                return (
                  <FeedMediaCarousel
                    media={[]}
                    isSubscribersOnly={post.isSubscribersOnly}
                    pointPrice={post.pointPrice}
                    isPurchased={false}
                    onLockedClick={() => {
                      setPurchaseTargetPost(post)
                    }}
                    memberCode={user?.member_code}
                    isBundle={post.isBundle}
                    discountRate={post.discountRate ?? 0}
                    purchasedMediaOrder={post.purchasedMediaOrder ?? null}
                    postPointPrice={post.pointPrice}
                    postIsSubscribersOnly={post.isSubscribersOnly}
                    onMembershipClick={() => {
                      setPurchaseTargetPost(post)
                      setTargetMembershipId(null)
                      setIsMembershipPurchaseSheetOpen(true)
                    }}
                    onMembershipBadgeClick={(membershipId) => {
                      setMembershipInfoSheetPost(post)
                      setMembershipInfoSheetTargetId(membershipId ?? null)
                      setIsMembershipInfoSheetOpen(true)
                    }}
                  />
                )
              }

              return null
            })()}

            {(() => {
              const isButtonEnabled = canInteractWithPost(post)
              const isLocked = !isButtonEnabled

              return (
                <div className="flex flex-wrap items-center gap-4 py-3 text-sm">
                  <button
                    className={`flex items-center gap-2 font-medium ${
                      likesState[post.id]?.liked ?? post.isLiked ? 'text-red-500' : 'text-gray-500'
                    }`}
                    type="button"
                    disabled={isLocked}
                    onClick={() => togglePostLike(post.id)}
                  >
                    <Heart
                      className={`h-5 w-5 ${
                        likesState[post.id]?.liked ?? post.isLiked ? 'fill-red-500 text-red-500' : ''
                      }`}
                    />
                    {likesState[post.id]?.count ?? post.likes}
                  </button>
                  <button
                    className="flex items-center gap-2 text-gray-500"
                    type="button"
                    disabled={isLocked}
                    onClick={() => {
                      if (isLocked) return
                      openCommentsForPost(post.id)
                    }}
                  >
                    <MessageCircle className="h-5 w-5" />
                    {post.commentCount ?? 0}
                  </button>
                  {isButtonEnabled && (isViewingOwnProfile || (!post.isSubscribersOnly && !(post.pointPrice !== undefined && post.pointPrice > 0))) && (
                    <button 
                      className="flex items-center gap-2 text-gray-500" 
                      type="button"
                      onClick={() => copyPostLink(post.id)}
                    >
                      <Repeat2 className="h-5 w-5" />
                    </button>
                  )}
                  {/* 관리자용 삭제 버튼 */}
                  {isAdmin && (
                    <button
                      className="flex items-center gap-2 text-red-500 hover:text-red-600 ml-auto"
                      type="button"
                      onClick={() => handleOpenReportSheet(post.id)}
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  )}
                </div>
              )
            })()}
          </article>
        ))}
      </div>
    )
  }

  const renderMembershipContent = () => {
    // 현재 구독 중인 멤버쉽인지 확인
    const isSubscribedToMembership = (membershipId: string) => {
      return subscribedMembership?.membership_id === membershipId
    }
    
    const getSubscriptionStatus = (membershipId: string) => {
      if (!isSubscribedToMembership(membershipId)) return null
      return subscribedMembership?.status
    }

    return (
      <div className="space-y-4">
        {isMembershipsLoading ? (
          <div className="flex flex-col items-center gap-3 py-12 text-sm text-gray-500">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-200 border-t-[#110f1a]" />
            멤버쉽 정보를 불러오는 중...
          </div>
        ) : partnerMemberships.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-sm text-gray-500">
            <p>등록된 멤버쉽이 없습니다</p>
          </div>
        ) : (
          [...partnerMemberships].sort((a, b) => (a.tier_rank || 0) - (b.tier_rank || 0)).map((membership) => {
            const isSubscribed = isSubscribedToMembership(membership.id)
            const subscriptionStatus = getSubscriptionStatus(membership.id)
            const isActive = subscriptionStatus === 'active'
            const isExpired = isSubscribed && !isActive
            
            return (
              <div key={membership.id} className={`rounded-xl border bg-white p-6 shadow-sm ${
                isSubscribed ? (isActive ? 'border-[#FE3A8F]' : 'border-orange-300') : 'border-gray-100'
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Typography variant="h4" className="font-semibold text-[#110f1a]">
                        {membership.name}
                      </Typography>
                      {membership.tier_rank && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-[#FE3A8F]/10 text-[#FE3A8F]">
                          {TIER_OPTIONS.find(t => t.rank === membership.tier_rank)?.emoji} {TIER_OPTIONS.find(t => t.rank === membership.tier_rank)?.name}
                        </span>
                      )}
                      {isSubscribed && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          isActive 
                            ? 'bg-[#FE3A8F]/10 text-[#FE3A8F]' 
                            : 'bg-orange-100 text-orange-600'
                        }`}>
                          {isActive ? '구독중' : '만료됨'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {membership.discount_rate && membership.discount_rate > 0 ? (
                        <>
                          <p className="text-sm text-gray-400 line-through">
                            {membership.monthly_price.toLocaleString()}P
                          </p>
                          <p className="text-sm text-[#FE3A8F] font-medium">
                            {Math.round(membership.monthly_price * (1 - membership.discount_rate / 100)).toLocaleString()}P
                            {membership.active_months && membership.active_months > 1 && `/${membership.active_months}개월`}
                            {!membership.active_months && '/월'}
                          </p>
                          <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                            {membership.discount_rate}% OFF
                          </span>
                        </>
                      ) : (
                        <p className="text-sm text-[#FE3A8F] font-medium">
                          {membership.monthly_price.toLocaleString()}P
                          {membership.active_months && membership.active_months > 1 && `/${membership.active_months}개월`}
                          {!membership.active_months && '/월'}
                        </p>
                      )}
                    </div>
                    {membership.description && (
                      <p className="text-sm text-gray-500 mt-2 break-words whitespace-pre-wrap">{membership.description}</p>
                    )}
                    
                    {/* 멤버쉽 혜택 정보 */}
                    <ul className="mt-3 space-y-1 text-xs text-gray-600">
                      {membership.paid_message_quota > 0 && (
                        <li className="flex items-center gap-1.5">
                          <span className="text-gray-400">•</span>
                          무료 메시지 {membership.paid_message_quota}개 제공
                        </li>
                      )}
                      {membership.paid_call_quota > 0 && (
                        <li className="flex items-center gap-1.5">
                          <span className="text-gray-400">•</span>
                          음성통화 {membership.paid_call_quota}분 무료 이용
                        </li>
                      )}
                      {membership.paid_video_quota > 0 && (
                        <li className="flex items-center gap-1.5">
                          <span className="text-gray-400">•</span>
                          영상통화 {membership.paid_video_quota}분 무료 이용
                        </li>
                      )}
                      {membership.post_access_mode && (
                        <li className="flex items-center gap-1.5">
                          <span className="text-gray-400">•</span>
                          {membership.post_access_mode === 'all_periods' 
                            ? '모든 기간의 포스트를 열람할 수 있어요' 
                            : '최근 30일 포스트만 볼 수 있어요'}
                        </li>
                      )}
                    </ul>
                    {membership.membership_message && (
                      <div className="mt-2">
                        <span className="text-xs bg-pink-50 text-[#FE3A8F] px-2 py-1 rounded-full">💌 환영 메시지</span>
                      </div>
                    )}
                  </div>
                  {!isViewingOwnProfile && (
                    <div className="ml-4">
                      {isExpired ? (
                        <Button 
                          variant="outline" 
                          className="rounded-full !bg-orange-500 !text-white !border-orange-400 hover:!bg-orange-600 text-sm"
                          onClick={() => {
                            setSelectedMembership(membership)
                            setIsMembershipPurchaseSheetOpen(true)
                          }}
                        >
                          연장하기
                        </Button>
                      ) : isActive ? (
                        <span className="text-sm text-[#FE3A8F] font-medium px-4 py-2">
                          구독중
                        </span>
                      ) : (
                        <Button 
                          variant="outline" 
                          className="rounded-full !bg-[#FE3A8F] !text-white !border-[#e8a0c0] hover:!bg-[#e8a0c0]/90 text-sm"
                          onClick={() => {
                            setSelectedMembership(membership)
                            setIsMembershipPurchaseSheetOpen(true)
                          }}
                        >
                          구독
                        </Button>
                      )}
                    </div>
                  )}
                  {isViewingOwnProfile && (
                    <div className="ml-4">
                      <Button 
                        variant="outline" 
                        className="rounded-full !border-gray-300 text-sm text-gray-600 hover:!bg-gray-100"
                        onClick={async () => {
                          setSubscribersMembershipId(membership.id)
                          setSubscribersMembershipName(membership.name)
                          setIsSubscribersSheetOpen(true)
                          setIsLoadingSubscribers(true)
                          try {
                            const response = await edgeApi.membershipSubscriptions.getMySubscribers(membership.id)
                            const data = (response as any)?.data
                            if (data && Array.isArray(data)) {
                              setSubscribers(data)
                            } else {
                              setSubscribers([])
                            }
                          } catch (error) {
                            console.error('구독자 목록 조회 실패:', error)
                            toast.error('구독자 목록을 불러오지 못했습니다')
                            setSubscribers([])
                          } finally {
                            setIsLoadingSubscribers(false)
                          }
                        }}
                      >
                        구독자 목록
                      </Button>
                    </div>
                  )}
                </div>
                {isExpired && (
                  <p className="text-xs text-orange-600 mt-2">
                    기간이 만료되었습니다. 추가 연장이 필요합니다.
                  </p>
                )}
              </div>
            )
          })
        )}
      </div>
    )
  }

  const renderServiceContent = () => (
    <div className="space-y-6">
      <div className="rounded-3xl bg-white">
        {jobsLoading ? (
          <div className="flex flex-col items-center gap-3 py-12 text-sm text-gray-500">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-gray-200 border-t-[#110f1a]" />
            퀘스트 정보를 불러오는 중...
          </div>
        ) : hasActiveJobs ? (
          <div className="space-y-4">
            {activeJobs.map((job: any) => {
              // 멤버십 티어 조건 체크
              let canRequest = true
              let needsMembership = false
              
              if (job.membership_id && job.min_tier_rank) {
                if (!subscribedMembership || subscribedMembership.membership_id !== job.membership_id) {
                  canRequest = false
                  needsMembership = true
                } else {
                  const userMembership = partnerMemberships.find(m => m.id === subscribedMembership.membership_id)
                  const userTierRank = userMembership?.tier_rank || 0
                  if (userTierRank < job.min_tier_rank) {
                    canRequest = false
                    needsMembership = true
                  }
                }
              }

              const handleQuestClick = () => {
                if (!canRequest && needsMembership && job.membership_id) {
                  setQuestMembershipPopup({
                    isOpen: true,
                    membershipId: job.membership_id,
                    minTierRank: job.min_tier_rank,
                  })
                }
              }
              
              return (
                <div
                  key={job.id}
                  onClick={handleQuestClick}
                  className={`rounded-2xl border border-gray-200 bg-gradient-to-r from-gray-50 to-white p-4 shadow-sm ${!canRequest && needsMembership ? 'cursor-pointer hover:shadow-md' : ''}`}
                >
                  <div className="flex items-start justify-between">
                    <Typography variant="h5" className="font-semibold text-[#110f1a]">
                      {job.job_name || '서비스 제목 없음'}
                    </Typography>
                    {job.membership_id && (
                      <span className="text-xs px-2 py-1 rounded-full bg-[#FE3A8F] text-white">
                        멤버십 전용
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-gray-600">{job.description}</p>
                  <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-3">
                      <Typography variant="body2" className="text-gray-600">
                        횟수
                      </Typography>
                      <div className="flex items-center rounded-full border border-gray-200 bg-white">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setJobSessions((prev) => ({
                              ...prev,
                              [job.id]: Math.max(1, (prev[job.id] || 1) - 1),
                            }))
                          }}
                          className="px-3 py-1 text-gray-600 hover:bg-gray-50"
                          disabled={(jobSessions[job.id] || 1) <= 1}
                        >
                          -
                        </button>
                        <span className="min-w-[2rem] px-3 text-center text-sm font-semibold text-[#110f1a]">
                          {jobSessions[job.id] || 1}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setJobSessions((prev) => ({
                              ...prev,
                              [job.id]: Math.min(10, (prev[job.id] || 1) + 1),
                            }))
                          }}
                          className="px-3 py-1 text-gray-600 hover:bg-gray-50"
                          disabled={(jobSessions[job.id] || 1) >= 10}
                        >
                          +
                        </button>
                      </div>
                      <Typography variant="body2" className="text-gray-600">
                        회
                      </Typography>
                    </div>
                    <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                      <div className="text-sm text-gray-600">
                        총 금액{' '}
                        <span className="font-semibold text-[#110f1a]">
                          {(jobSessions[job.id] || 1) * job.coins_per_job}P
                        </span>
                      </div>
                      {!isViewingOwnProfile && (
                        <Button
                          variant="outline"
                          className={`rounded-full ${canRequest ? '!bg-[#FE3A8F] !text-white !border-[#FE3A8F] hover:!bg-[#e8a0c0]/90' : '!bg-gray-300 !text-gray-500 !border-gray-300'}`}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (canRequest) {
                              handleJobRequest(job)
                            } else if (needsMembership && job.membership_id) {
                              setQuestMembershipPopup({
                                isOpen: true,
                                membershipId: job.membership_id,
                                minTierRank: job.min_tier_rank,
                              })
                            }
                          }}
                        >
                          {canRequest ? '의뢰하기' : '멤버십 가입'}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="py-10 text-center text-sm text-gray-500">
            현재 활성화된 퀘스트가 없습니다!
          </div>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          {/* <MonthlyClientRanking memberId={partner.member_id} /> */}

          {/* <div className="rounded-xl bg-gray-100 p-6">
            <p className="text-md font-bold text-[#110f1a] mb-3">선호 게임</p>
            {favoriteGames.trim() ? (
              <ul className="list-disc list-inside space-y-1">
                {favoriteGames.split(' ').filter(g => g.trim()).map((game, idx) => (
                  <li key={idx} className="text-sm text-[#110f1a]">
                    {game.trim()}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400">등록된 선호 게임이 없습니다</p>
            )}
          </div> */}

          {/* {gameInfo && (
            <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
              <Typography variant="h4" className="mb-3 font-semibold text-[#110f1a]">
                📊 게임 정보
              </Typography>
              <GameInfoDisplay gameInfo={gameInfo} />
            </div>
          )} */}
        </div>

        <div className="rounded-xl bg-gray-100 p-6 shadow-sm lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4">
            <div>
              <p className="text-md font-bold text-[#110f1a] mb-1">받은 리뷰</p>
            </div>
            {averageRating ? (
              <div className="flex items-center gap-2">
                <StarRating rating={averageRating} size="sm" />
                <span className="text-xl font-semibold text-[#110f1a]">
                  {averageRating.toFixed(1)}
                </span>
                <span className="text-sm text-gray-400">({reviews.length})</span>
              </div>
            ) : (
              <p className="text-sm text-gray-400">0.0</p>
            )}
          </div>

          <div className="divide-y divide-gray-100">
            {reviews.length > 0 ? (
              reviews.slice(0, 5).map((review) => (
                <div key={review.id} className="py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <StarRating rating={review.rating} size="sm" />
                    {review.created_at && (
                      <span className="text-xs text-gray-400">
                        {new Date(review.created_at).toLocaleDateString('ko-KR')}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-gray-700">{review.comment || '코멘트 없음'}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    {review.reviewer_name ? `by ${review.reviewer_name}` : '익명'}
                  </p>
                </div>
              ))
            ) : (
              <div className="py-10 text-center text-sm text-gray-400">아직 받은 리뷰가 없습니다</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )

  // 배경 이미지 배열 처리
  const backgroundImages: string[] = Array.isArray(partner.background_images) && partner.background_images.length > 0
    ? partner.background_images.map((img: any) => typeof img === 'string' ? img : img?.url).filter(Boolean)
    : []

  const previewPostId = previewState?.postId
  const previewPost = previewPostId ? posts.find((item) => item.id === previewPostId) : null
  const previewLikeState = previewPostId ? likesState[previewPostId] : undefined
  const previewIsLiked = previewLikeState?.liked ?? previewPost?.isLiked ?? false
  const previewLikeCount = previewLikeState?.count ?? previewPost?.likes ?? 0
  const previewCommentCount = previewPost?.commentCount ?? 0
  const previewCanInteract = canInteractWithPost(previewPost)

  return (
    <CaptureProtection>
    <>
      <div className={`flex flex-col pb-16 mx-auto w-full border-l border-r border-gray-200`} style={{ maxWidth: '720px' }}>
        {/* 배경 이미지 슬라이드 - 상단/좌우 여백 없이 꽉 차게 */}
        <div className="relative h-64 w-full overflow-visible">
            {backgroundImages.length > 0 ? (
              backgroundImages.length === 1 ? (
                <img 
                  src={backgroundImages[0]} 
                  alt="배경" 
                  className="h-full w-full object-cover" 
                  loading="eager"
                  decoding="async"
                  fetchPriority="high"
                />
              ) : (
                <div className="relative h-full w-full">
                  <Swiper
                    modules={[Pagination]}
                    pagination={{ 
                      clickable: true,
                    }}
                    loop={backgroundImages.length > 1}
                    className="h-full w-full partner-profile-swiper"
                  >
                    {backgroundImages.map((img, idx) => (
                      <SwiperSlide key={idx}>
                        <img 
                          src={img} 
                          alt={`배경 ${idx + 1}`} 
                          className="h-full w-full object-cover" 
                          loading={idx === 0 ? 'eager' : 'lazy'}
                          decoding="async"
                        />
                      </SwiperSlide>
                    ))}
                  </Swiper>
                  <style>{`
                    .partner-profile-swiper .swiper-pagination {
                      top: 12px !important;
                      bottom: auto !important;
                    }
                    .partner-profile-swiper .swiper-pagination-bullet {
                      width: 6px;
                      height: 6px;
                      background: rgba(255, 255, 255, 0.5);
                      opacity: 1;
                    }
                    .partner-profile-swiper .swiper-pagination-bullet-active {
                      background: white;
                      width: 8px;
                      height: 8px;
                    }
                  `}</style>
                </div>
              )
            ) : (
              <div className="h-full w-full bg-gray-200" />
            )}
            <button
              type="button"
              className="absolute left-1/2 bottom-6 -translate-x-1/2 translate-y-1/2 rounded-full border-4 border-white focus:outline-none z-20"
              onClick={() => {
                if (!partner?.member.profile_image) return
                handlePreviewMedia(
                  null,
                  [
                    {
                      type: 'image',
                      src: partner.member.profile_image,
                    },
                  ],
                  0,
                )
              }}
            >
              <AvatarWithFallback
                name={partner.partner_name || partner.member.name || partner.member.member_code || 'Unknown'}
                src={partner.member.profile_image || undefined}
                size="xl"
                className="h-20 w-20"
              />
            </button>
          </div>
        <div className={`mx-auto flex flex-col w-full max-w-6xl flex-1`}>
          <div className="flex-1 pt-12 -mt-6 bg-white rounded-t-2xl overflow-hidden relative z-10">
            <div className="px-4 flex w-full max-w-5xl flex-col gap-6 pb-24">
              <section>
                <div className="flex justify-between gap-4 sm:flex-row sm:items-end sm:justify-between">
                  <div className="w-full flex flex-col items-center gap-4">
                    <div className="relative">
                    </div>
                    <div className="w-full flex flex-col items-start">
                      <div className='w-full flex justify-between items-center gap-2'>
                        <div ref={partnerNameRef} className="flex-1 min-w-0">
                          <Typography 
                            variant="h3" 
                            className={`font-bold text-[#110f1a] mb-1 ${
                              (partner.partner_name || partner.member.member_code).length > 12 
                                ? 'text-xl' 
                                : (partner.partner_name || partner.member.member_code).length > 8 
                                  ? 'text-2xl' 
                                  : 'text-3xl'
                            }`}
                          >
                            {partner.partner_name || partner.member.member_code}
                          </Typography>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          {isOwnProfile ? (
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-full px-3 py-1 text-xs !border-[#FE3A8F] !text-[#FE3A8F] hover:!bg-[#FE3A8F]/10 whitespace-nowrap"
                              onClick={() => setIsProfileModalOpen(true)}
                            >
                              프로필 수정
                            </Button>
                          ) : (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={isFollowProcessing}
                                className={`rounded-full px-3 py-1 text-xs whitespace-nowrap ${
                                  isFollowing
                                    ? '!border-gray-400 !text-gray-600 hover:!bg-gray-50 bg-transparent'
                                    : '!border-[#FE3A8F] !text-[#FE3A8F] hover:!bg-[#FE3A8F]/10'
                                } ${isFollowProcessing ? 'opacity-70 cursor-not-allowed' : ''}`}
                                onClick={handleFollow}
                              >
                                {isFollowProcessing ? '처리중...' : isFollowing ? '팔로우 중' : '팔로우'}
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-full !border-[#FE3A8F] !text-[#FE3A8F] hover:!bg-[#FE3A8F]/10 px-3 py-1 text-xs whitespace-nowrap"
                                onClick={handleQuickChat}
                              >
                                메시지
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      {partner.partner_message && (
                        <div className='mt-1 mb-6'>
                          <p className="text-md text-[#bf221b] font-bold">소개</p>
                          <p className="text-[0.8rem] text-gray-600 whitespace-pre-wrap">{partner.partner_message}</p>
                        </div>
                      )}
                      {/* 카테고리 태그 - 클릭시 /explore 연결 */}
                      {(() => {
                        // categories 배열 (새 API 형식)
                        const categories = (partner as any).categories as Array<{ 
                          category_id: number;
                          detail_category_id: number | null;
                        }> | undefined
                        
                        const hasCategories = categories && categories.length > 0
                        
                        if (!hasCategories) return null
                        
                        return (
                          <div className="w-full flex flex-col items-start">
                            <p className="text-md mb-1 text-[#bf221b] font-bold">특기</p>
                            <div className="w-full flex justify-start flex-wrap gap-2 mb-2">
                              {categories.map((cat, index) => {
                                const catId = cat.category_id
                                const detailId = cat.detail_category_id
                                
                                const categoryLabel = getCategoryLabel(catId)
                                const detailLabel = detailId ? getSubCategoryLabel(catId, detailId) : null
                                const categoryStringId = getCategoryStringId(catId)
                                const detailStringId = detailId ? getSubCategoryStringId(catId, detailId) : null
                                
                                // 표시 형식:
                                // category_id가 1(메이트)일 경우: "메이트 - {소분류}"
                                // category_id가 1이 아닐 경우: "{대분류}" (소분류 없음)
                                let displayLabel: string
                                if (catId === 1 && detailLabel) {
                                  displayLabel = `${categoryLabel} - ${detailLabel}`
                                } else {
                                  displayLabel = categoryLabel
                                }
                                
                                // 라벨이 없으면 표시하지 않음
                                if (!displayLabel) return null
                                
                                return (
                                  <Link
                                    key={`cat-${catId}-${detailId}-${index}`}
                                    to="/explore"
                                    search={{ partner_category: String(catId) }}
                                    className="px-2 py-0.5 bg-[#FE3A8F]/10 text-[0.8rem] font-semibold rounded-[3px] hover:bg-[#FE3A8F]/20 transition-colors cursor-pointer"
                                  >
                                    {displayLabel}
                                  </Link>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                </div>
                <div className="mt-6 flex flex-wrap gap-6 text-sm mb-6 text-gray-600">
                  <span>
                    <strong className="mr-1 text-[#110f1a]">{totalPosts}</strong>게시물
                  </span>
                  <button
                    type="button"
                    onClick={handleOpenFollowers}
                    className="flex items-center gap-1 text-sm text-gray-600 hover:text-[#110f1a]"
                  >
                    <strong className="text-[#110f1a]">{displayFollowerCount.toLocaleString()}</strong>
                    팔로워
                  </button>
                </div>
              </section>
              {/* 룰렛 배너 - 멤버쉽 배너 위에 표시 */}
              {!isViewingOwnProfile && (
                <FeaturedRouletteBanner 
                  partnerId={partner.member_id}
                  memberCode={partner.member.member_code}
                  className="mb-4"
                />
              )}

              {/* 멤버쉽 배너 - 구독 중인 멤버쉽 우선 표시, 없으면 중간 멤버쉽 */}
              {!isViewingOwnProfile && partnerMemberships.length > 0 && (() => {
                // 구독 중인 멤버쉽 찾기
                const subscribedMembershipData = subscribedMembership 
                  ? partnerMemberships.find(m => m.id === subscribedMembership.membership_id)
                  : null
                
                // 구독 중인 멤버쉽이 있으면 그것을, 없으면 중간 인덱스의 멤버쉽 선택
                const displayMembership = subscribedMembershipData || partnerMemberships[Math.floor(partnerMemberships.length / 2)]
                
                const isCurrentlySubscribed = !!subscribedMembershipData
                const isActive = subscribedMembership?.status === 'active'
                const isExpired = isCurrentlySubscribed && !isActive
                
                return (
                  <button
                    type="button"
                    onClick={() => {
                      if (!isActive) {
                        setSelectedMembership(displayMembership)
                        setIsMembershipPurchaseSheetOpen(true)
                      }
                    }}
                    className={`w-full rounded-xl px-4 py-3 text-left transition-transform bg-gradient-to-r from-[#FE3A8F] to-[#ff6b9d] ${
                      isActive 
                        ? 'cursor-default' 
                        : 'hover:scale-[1.02] active:scale-[0.98]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-white">
                          {displayMembership.name}
                        </p>
                        {isExpired ? (
                          <p className="text-xs text-white/90 mt-0.5">
                            기간 만료 - 클릭하여 연장
                          </p>
                        ) : displayMembership.description ? (
                          <p className="text-xs text-white/80 mt-0.5 line-clamp-2 break-words whitespace-pre-line">
                            {displayMembership.description}
                          </p>
                        ) : null}
                      </div>
                      <p className="text-sm font-bold text-white ml-3">
                        {isActive 
                          ? '구독중 ✓' 
                          : isExpired
                            ? '연장하기'
                            : `${displayMembership.monthly_price.toLocaleString()}P/월`
                        }
                      </p>
                    </div>
                  </button>
                )
              })()}
              <div ref={tabSectionRef} className="relative flex items-center rounded-xl bg-gray-100 p-1">
                <div
                  id="partner-tab-indicator"
                  className="absolute top-1 bottom-1 rounded-lg bg-white shadow transition-[left] duration-300 ease-out"
                  style={{ width: `${100 / tabs.length}%`, left: `${(activeTabIndex / tabs.length) * 100}%` }}
                />
                {tabs.map((tab, index) => {
                  const Icon = tab.icon
                  return (
                    <button
                      key={tab.key}
                      className={`relative z-10 flex-1 flex items-center justify-center rounded-lg py-2.5 transition-colors duration-200 ${
                        activeTab === tab.key ? 'text-[#110f1a]' : 'text-gray-400 hover:text-gray-600'
                      }`}
                      onClick={() => {
                        if (activeTab === tab.key) return
                        tabSwiperRef.current?.slideTo(index)
                      }}
                    >
                      <Icon className="h-[18px] w-[18px]" strokeWidth={activeTab === tab.key ? 2.2 : 1.8} />
                    </button>
                  )
                })}
              </div>
              <Swiper
                onSwiper={(swiper) => { tabSwiperRef.current = swiper }}
                onSlideChange={(swiper) => {
                  const newTab = tabs[swiper.activeIndex]
                  if (newTab && newTab.key !== activeTab) {
                    navigate({
                      to: '/partners/$memberCode',
                      params: { memberCode },
                      search: newTab.key === 'posts' ? {} : { tab: newTab.key as PartnerDetailSearch['tab'] },
                      replace: true,
                    })
                  }
                  setTimeout(() => swiper.updateAutoHeight(200), 100)
                }}
                onProgress={(_swiper, progress) => {
                  const indicator = document.getElementById('partner-tab-indicator')
                  if (!indicator) return
                  const clampedProgress = Math.max(0, Math.min(1, progress))
                  const maxIdx = tabs.length - 1
                  const pos = clampedProgress * maxIdx
                  indicator.style.transition = 'none'
                  indicator.style.left = `${(pos / tabs.length) * 100}%`
                }}
                onSlideChangeTransitionEnd={(swiper) => {
                  const indicator = document.getElementById('partner-tab-indicator')
                  if (indicator) {
                    indicator.style.transition = ''
                    indicator.style.left = `${(swiper.activeIndex / tabs.length) * 100}%`
                  }
                }}
                onReachBeginning={(swiper) => { swiper.params.resistanceRatio = 0 }}
                onReachEnd={(swiper) => { swiper.params.resistanceRatio = 0 }}
                onFromEdge={(swiper) => { swiper.params.resistanceRatio = 0.85 }}
                resistanceRatio={0}
                initialSlide={activeTabIndex}
                slidesPerView={1}
                spaceBetween={0}
                autoHeight
                className="w-full"
              >
                {tabs.map((tab) => (
                  <SwiperSlide key={tab.key}>
                    {!visitedTabs.has(tab.key) ? (
                      <div className="flex items-center justify-center py-16">
                        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-[#110f1a]" />
                      </div>
                    ) : tab.key === 'posts' ? renderPostsContent() :
                     tab.key === 'store' ? renderStoreContent() :
                     tab.key === 'membership' ? renderMembershipContent() :
                     tab.key === 'services' ? renderServiceContent() : null}
                  </SwiperSlide>
                ))}
              </Swiper>
            </div>
          </div>
        </div>
      </div>
      <PartnerManagementSheet
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        onSuccess={() => {
          refetchPartner()
        }}
      />
      <SlideSheet
        isOpen={isFollowersModalOpen}
        onClose={() => setIsFollowersModalOpen(false)}
        title="팔로워"
        initialHeight={0.6}
        minHeight={0.3}
        maxHeight={0.9}
        zIndex={120}
      >
        {isFollowersLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            불러오는 중...
          </div>
        ) : followers.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            팔로워가 없습니다.
          </div>
        ) : (
          <div className="pb-4">
            {followers.map((follower, index) => {
              const followerMember = follower.member || follower.member_info || {}
              const followerName =
                follower.partner_name ||
                followerMember.name ||
                followerMember.member_code ||
                follower.name ||
                follower.member_code ||
                '알 수 없음'
              const followerHandle = followerMember.member_code || follower.member_code
              const profileImage = followerMember.profile_image || follower.profile_image
              const key =
                follower.id ||
                follower.partner_id ||
                followerMember.id ||
                `follower-${index}`
              const profileHref = followerHandle ? `/partners/${followerHandle}` : null
              const content = (
                <div className="flex items-center gap-3 py-2">
                  <AvatarWithFallback
                    name={followerName}
                    src={profileImage || undefined}
                    size="sm"
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-[#110f1a]">
                      {followerName}
                    </span>
                    {followerHandle && (
                      <span className="text-xs text-gray-400">@{followerHandle}</span>
                    )}
                  </div>
                </div>
              )
              return profileHref ? (
                <Link
                  key={key}
                  to={profileHref}
                  onClick={() => setIsFollowersModalOpen(false)}
                  className="block hover:bg-gray-50 px-1 rounded-lg"
                >
                  {content}
                </Link>
              ) : (
                <div key={key} className="px-1">
                  {content}
                </div>
              )
            })}
          </div>
        )}
      </SlideSheet>

      {/* 구독자 목록 슬라이드 시트 */}
      <SlideSheet
        isOpen={isSubscribersSheetOpen}
        onClose={() => {
          setIsSubscribersSheetOpen(false)
          setSubscribersMembershipId(null)
          setSubscribersMembershipName('')
          setSubscribers([])
        }}
        title={`${subscribersMembershipName} 구독자`}
        initialHeight={0.6}
        minHeight={0.3}
        maxHeight={0.9}
        zIndex={120}
      >
        {isLoadingSubscribers ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-500">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-[#110f1a]" />
          </div>
        ) : subscribers.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-gray-400">
            <p>아직 구독자가 없습니다</p>
          </div>
        ) : (
          <div className="space-y-2 px-1">
            {subscribers.map((sub) => {
              const member = sub.members
              if (!member) return null
              const key = sub.id
              const content = (
                <div className="flex items-center gap-3 py-2">
                  <div className="flex-shrink-0">
                    <AvatarWithFallback
                      src={member.profile_image}
                      name={member.name}
                      size="sm"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {member.name}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>
                        {new Date(sub.started_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })} 시작
                      </span>
                      {sub.auto_renewal_enabled && (
                        <span className="text-green-600">자동갱신</span>
                      )}
                    </div>
                  </div>
                </div>
              )
              return (
                <div key={key} className="px-1 hover:bg-gray-50 rounded-lg">
                  {content}
                </div>
              )
            })}
          </div>
        )}
      </SlideSheet>

      {previewState && (
        <MediaPreview
          items={previewState.items}
          initialIndex={previewState.index}
          postId={previewCanInteract ? previewPostId : undefined}
          isLiked={previewIsLiked}
          likeCount={previewLikeCount}
          commentCount={previewCommentCount}
          onToggleLike={previewCanInteract ? togglePostLike : undefined}
          onOpenComments={
            previewCanInteract && previewPostId
              ? () => openCommentsForPost(previewPostId)
              : undefined
          }
          onClose={() => setPreviewState(null)}
          memberCode={user?.member_code}
        />
      )}

      {/* 댓글 슬라이드 시트 (모바일) */}
      {isMobile && (
        <SlideSheet
          isOpen={!!activeCommentPostId}
          onClose={() => {
            setActiveCommentPostId(null)
            setActiveComments([])
            setCommentDraft('')
            setReplyingToId(null)
          }}
          title="댓글"
          initialHeight={0.6}
          minHeight={0.3}
          maxHeight={0.9}
          zIndex={9999999}
          footer={
            user ? (
              <div className="space-y-2">
                {replyingToId && (() => {
                  const replyingToComment = activeComments.find(c => c.id === replyingToId) ||
                    activeComments.flatMap(c => c.replies || []).find(r => r.id === replyingToId)
                  return (
                    <div className="flex items-center gap-2 rounded-2xl bg-gray-50 px-3 py-2 text-xs text-gray-500">
                      <MessageCircle className="h-4 w-4" />
                      <span>{replyingToComment?.user || '사용자'}님에게 답글 작성중</span>
                      <button
                        className="ml-auto text-gray-400 hover:text-[#110f1a]"
                        onClick={() => setReplyingToId(null)}
                      >
                        취소
                      </button>
                    </div>
                  )
                })()}
                <div className="relative rounded-full border border-gray-100 bg-gray-100 px-3 py-1.5">
                  <Input
                    className="w-full border-none bg-transparent p-0 pr-12 text-sm focus:border-none focus:ring-0 focus:ring-offset-0 focus:outline-none caret-[#FE3A8F]"
                    placeholder={replyingToId ? '대댓글을 입력해주세요' : '댓글을 입력해주세요'}
                    value={commentDraft}
                    onChange={(e) => setCommentDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && activeCommentPostId) {
                        e.preventDefault()
                        submitPartnerComment(activeCommentPostId)
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="absolute right-1.5 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full !bg-[#FE3A8F] p-0 text-white hover:!bg-[#e8a0c0] disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => activeCommentPostId && submitPartnerComment(activeCommentPostId)}
                    disabled={isSubmittingComment || !commentDraft.trim()}
                  >
                    {isSubmittingComment ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <button
                  onClick={() => navigate({ to: '/login' })}
                  className="text-[#FE3A8F] hover:underline"
                >
                  로그인하고 댓글 작성하기
                </button>
              </div>
            )
          }
        >
          {isCommentsLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-[#FE3A8F]" />
            </div>
          ) : activeComments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <MessageCircle className="h-12 w-12 mb-2" />
              <p>아직 댓글이 없습니다</p>
              <p className="text-sm">첫 댓글을 남겨보세요!</p>
            </div>
          ) : (
            <CommentList
              comments={activeComments}
              onReply={(commentId) => setReplyingToId(commentId)}
              replyingToId={replyingToId}
              collapsedReplies={collapsedReplies}
              onToggleReplies={(commentId) =>
                setCollapsedReplies((prev) => ({
                  ...prev,
                  [commentId]: !prev[commentId],
                }))
              }
              postAuthorMemberCode={memberCode}
              currentUserId={user?.id}
              currentUserMemberCode={user?.member_code}
              onDeleteComment={(commentId) => activeCommentPostId && handleDeleteComment(activeCommentPostId, commentId)}
              onRequireLogin={() => navigate({ to: '/login' })}
              onReportComment={(commentId, commentUser) => {
                setUserReportModal({
                  isOpen: true,
                  targetType: 'comment',
                  targetId: commentId,
                  targetName: `${commentUser}의 댓글`,
                })
              }}
              onBlockUser={(blockedMemberCode, userName) => {
                if (confirm(`${userName}님을 차단하시겠습니까?\n차단하면 해당 사용자의 게시물과 댓글이 더 이상 표시되지 않습니다.`)) {
                  edgeApi.blocks.block(blockedMemberCode).then((response: any) => {
                    if (response.success) {
                      toast.success(`${userName}님을 차단했습니다.`)
                      // 차단한 사용자의 댓글 제거 (재귀적으로 replies도 필터링)
                      const filterBlockedComments = (comments: FeedComment[]): FeedComment[] => {
                        return comments
                          .filter(c => c.memberCode !== blockedMemberCode)
                          .map(c => ({
                            ...c,
                            replies: c.replies ? filterBlockedComments(c.replies) : [],
                          }))
                      }
                      setActiveComments(prev => filterBlockedComments(prev))
                    }
                  }).catch(() => {
                    toast.error('차단에 실패했습니다.')
                  })
                }
              }}
            />
          )}
        </SlideSheet>
      )}

      {/* 댓글 모달 (데스크톱) */}
      {!isMobile && activeCommentPostId && (() => {
        const commentPost = posts.find((p) => p.id === activeCommentPostId)
        if (!commentPost) return null

        return (
          <CommentModal
            post={commentPost}
            comments={activeComments}
            draft={commentDraft}
            replyingToId={replyingToId}
            visibleCount={activeComments.length}
            totalCount={activeComments.length}
            isLoadingComments={isCommentsLoading}
            onChangeDraft={setCommentDraft}
            onAddComment={async () => {
              if (isSubmittingComment || !activeCommentPostId) return
              await submitPartnerComment(activeCommentPostId)
            }}
            onReply={(commentId) => setReplyingToId(commentId)}
            onClose={() => {
              setActiveCommentPostId(null)
              setActiveComments([])
              setCommentDraft('')
              setReplyingToId(null)
            }}
            onLoadMore={() => {}}
            onCollapseAll={() => {}}
            collapsedReplies={collapsedReplies}
            onToggleReplies={(commentId) =>
              setCollapsedReplies((prev) => {
                const current = prev[commentId] ?? true
                return {
                  ...prev,
                  [commentId]: !current,
                }
              })
            }
            isSubmitting={isSubmittingComment}
            onDeleteComment={(commentId) => handleDeleteComment(activeCommentPostId, commentId)}
          />
        )
      })()}

      {/* 구독/단건구매 선택용 슬라이드 시트 */}
      <SlideSheet
        isOpen={!!purchaseTargetPost}
        onClose={closePurchaseSheet}
        title="포스트 열기"
        initialHeight={0.5}
        minHeight={0.3}
        maxHeight={0.8}
        footer={
          purchaseTargetPost && (
            <div className="flex gap-3">
              <button
                type="button"
                className="flex-1 rounded-xl bg-gray-100 px-4 py-3 text-sm font-semibold text-[#110f1a] hover:bg-gray-200"
                onClick={closePurchaseSheet}
              >
                취소
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl bg-[#110f1a] px-4 py-3 text-sm font-semibold text-white hover:bg-[#241f3f] disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => {
                  if (purchaseTargetPost.pointPrice !== undefined && purchaseTargetPost.pointPrice > 0) {
                    handleOneTimePurchase()
                  } else if (purchaseTargetPost.isSubscribersOnly) {
                    closePurchaseSheet()
                    setIsMembershipPurchaseSheetOpen(true)
                  }
                }}
                disabled={isProcessingPurchase || (!(purchaseTargetPost.pointPrice !== undefined && purchaseTargetPost.pointPrice > 0) && !purchaseTargetPost.isSubscribersOnly)}
              >
                {isProcessingPurchase ? '결제 중...' : '포스트 열기'}
              </button>
            </div>
          )
        }
      >
        {purchaseTargetPost && (
          <div className="space-y-3">
            {/* 멤버십 구독 옵션 */}
            {purchaseTargetPost.isSubscribersOnly && (
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Star className="h-5 w-5 text-[#FE3A8F]" />
                  <Typography variant="body1" className="font-semibold text-[#110f1a]">
                    멤버십 구독해서 열기
                  </Typography>
                </div>
                <div className="mb-3 flex items-center gap-3">
                  <Avatar
                    src={purchaseTargetPost.author.avatar || partner?.member.profile_image || undefined}
                    alt={purchaseTargetPost.author.name || partner?.member.name || ''}
                    size="md"
                    className="h-12 w-12"
                  />
                  <div className="flex-1">
                    <Typography variant="body1" className="font-medium text-[#110f1a]">
                      {purchaseTargetPost.author.name || partner?.member.name || '파트너'}
                    </Typography>
                    <Typography variant="caption" className="text-gray-500">
                      {partnerMemberships.length > 0 
                        ? `${partnerMemberships[0].monthly_price?.toLocaleString() || 0}P/월 부터`
                        : '멤버십 구독으로 모든 전용 포스트 열람'}
                    </Typography>
                  </div>
                </div>
                <button
                  type="button"
                  className="w-full rounded-xl bg-[#FE3A8F] px-4 py-3 text-sm font-semibold text-white hover:bg-[#e8338a]"
                  onClick={() => {
                    closePurchaseSheet()
                    setIsMembershipPurchaseSheetOpen(true)
                  }}
                >
                  멤버십 구독하기
                </button>
              </div>
            )}

            {/* 단건구매 옵션 */}
            {(purchaseTargetPost.pointPrice !== undefined && purchaseTargetPost.pointPrice > 0) && (
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="mb-3">
                  <Typography variant="body1" className="font-semibold text-[#110f1a]">
                    이 포스트만 구매하기
                  </Typography>
                </div>
                <div className="flex items-center gap-2">
                  <Heart className="h-5 w-5 fill-[#FE3A8F] text-[#FE3A8F]" />
                  <Typography variant="body1" className="font-semibold text-[#110f1a]">
                    {purchaseTargetPost.pointPrice.toLocaleString()}P
                  </Typography>
                </div>
                <button
                  type="button"
                  className="mt-3 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-[#110f1a] hover:bg-gray-50"
                  onClick={() => {
                    // 단건구매는 하단 언락 버튼에서 처리
                  }}
                >
                  이 포스트만 구매하기
                </button>
              </div>
            )}
          </div>
        )}
      </SlideSheet>

      {/* 개별 미디어 구매 팝업 */}
      {mediaPurchaseTarget && (
        <SlideSheet
          isOpen={isMediaPurchaseSheetVisible}
          onClose={() => {
            setIsMediaPurchaseSheetVisible(false)
            setMediaPurchaseTarget(null)
            setSelectedMediaPurchaseOption(null)
          }}
          title="미디어 구매"
          initialHeight={0.4}
          minHeight={0.2}
          maxHeight={0.6}
          footer={
            (() => {
              const { post, mediaIndex } = mediaPurchaseTarget
              const media = post.media?.[mediaIndex]
              if (!media || !media.point_price || media.point_price <= 0) return null

              return (
                <div className="flex gap-3">
                  <button
                    type="button"
                    className="flex-1 rounded-xl bg-gray-100 px-4 py-3 text-sm font-semibold text-[#110f1a] hover:bg-gray-200"
                    onClick={() => {
                      setIsMediaPurchaseSheetVisible(false)
                      setMediaPurchaseTarget(null)
                      setSelectedMediaPurchaseOption(null)
                    }}
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    className="flex-1 rounded-xl bg-[#110f1a] px-4 py-3 text-sm font-semibold text-white hover:bg-[#241f3f] disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => {
                      if (selectedMediaPurchaseOption && mediaPurchaseTarget) {
                        executeMediaPurchase(
                          mediaPurchaseTarget.post,
                          mediaPurchaseTarget.mediaIndex,
                          selectedMediaPurchaseOption === 'bundle'
                        )
                      }
                    }}
                    disabled={isProcessingPurchase || !selectedMediaPurchaseOption}
                  >
                    {isProcessingPurchase ? '결제 중...' : '구매하기'}
                  </button>
                </div>
              )
            })()
          }
        >
          {(() => {
            const { post, mediaIndex } = mediaPurchaseTarget
            const media = post.media?.[mediaIndex]
            if (!media || !media.point_price || media.point_price <= 0) return null

            const discountRate = post.discountRate ?? 0
            
            const mediaUpToIndex = post.media?.slice(0, mediaIndex + 1).filter((m, idx) => {
              const isPurchased = post.purchasedMediaOrder != null && idx <= post.purchasedMediaOrder
              return !m.signed_url && m.point_price != null && m.point_price > 0 && !isPurchased
            }) || []
            const basePrice = mediaUpToIndex.reduce((sum, m) => sum + (m.point_price || 0), 0)
            const finalPrice = discountRate > 0 && discountRate <= 100
              ? Math.round(basePrice * (1 - discountRate / 100))
              : basePrice
            const hasDiscount = discountRate > 0 && discountRate <= 100 && basePrice > 0
            const mediaCountUpToIndex = mediaUpToIndex.length

            const unpurchasedMedia = post.media?.filter((m, idx) => {
              const isPurchased = post.purchasedMediaOrder != null && idx <= post.purchasedMediaOrder
              return !m.signed_url && m.point_price != null && m.point_price > 0 && !isPurchased
            }) || []
            const bundleBasePrice = unpurchasedMedia.reduce((sum, m) => sum + (m.point_price || 0), 0)
            const bundleFinalPrice = discountRate > 0 && discountRate <= 100
              ? Math.round(bundleBasePrice * (1 - discountRate / 100))
              : bundleBasePrice
            const bundleHasDiscount = discountRate > 0 && discountRate <= 100 && bundleBasePrice > 0

            return (
              <div className="flex flex-col gap-4 px-4 pb-8">
                <div className="text-sm text-gray-600">
                  구매 방식을 선택해주세요
                </div>

                <div
                  className={`cursor-pointer rounded-2xl border-2 p-4 transition-all ${
                    selectedMediaPurchaseOption === 'single'
                      ? 'border-[#FE3A8F] bg-[#FE3A8F]/5'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedMediaPurchaseOption('single')}
                >
                  <div className="mb-3">
                    <Typography variant="body1" className="font-semibold text-[#110f1a]">
                      여기까지 구매하기
                    </Typography>
                    {mediaCountUpToIndex > 1 && (
                      <Typography variant="body2" className="text-xs text-gray-500 mt-1">
                        1~{mediaIndex + 1}번 미디어 ({mediaCountUpToIndex}개)
                      </Typography>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Heart className="h-5 w-5 fill-[#FE3A8F] text-[#FE3A8F]" />
                    <div className="flex flex-col">
                      {hasDiscount && (
                        <Typography variant="body2" className="text-xs text-gray-500 line-through">
                          {basePrice.toLocaleString()}P
                        </Typography>
                      )}
                      <Typography variant="body1" className={`font-semibold ${hasDiscount ? 'text-[#FE3A8F]' : 'text-[#110f1a]'}`}>
                        {finalPrice.toLocaleString()}P
                      </Typography>
                    </div>
                  </div>
                </div>

                {post.isBundle && unpurchasedMedia.length > 1 && (
                  <div
                    className={`cursor-pointer rounded-2xl border-2 p-4 transition-all ${
                      selectedMediaPurchaseOption === 'bundle'
                        ? 'border-[#FE3A8F] bg-[#FE3A8F]/5'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedMediaPurchaseOption('bundle')}
                  >
                    <div className="mb-3">
                      <Typography variant="body1" className="font-semibold text-[#110f1a]">
                        모든 미구매 미디어 묶음 구매하기
                      </Typography>
                      <Typography variant="body2" className="text-xs text-gray-500 mt-1">
                        {unpurchasedMedia.length}개의 미디어를 한 번에 구매
                      </Typography>
                    </div>
                    <div className="flex items-center gap-2">
                      <Heart className="h-5 w-5 fill-[#FE3A8F] text-[#FE3A8F]" />
                      <div className="flex flex-col">
                        {bundleHasDiscount && (
                          <Typography variant="body2" className="text-xs text-gray-500 line-through">
                            {bundleBasePrice.toLocaleString()}P
                          </Typography>
                        )}
                        <Typography variant="body1" className={`font-semibold ${bundleHasDiscount ? 'text-[#FE3A8F]' : 'text-[#110f1a]'}`}>
                          {bundleFinalPrice.toLocaleString()}P
                        </Typography>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
        </SlideSheet>
      )}

      {/* 가격 수정 슬라이드 시트 */}
      <SlideSheet
        isOpen={!!priceEditTargetPost}
        onClose={closePriceEditSheet}
        title={priceEditType === 'membership' ? '멤버쉽 설정' : '단건 구매 가격 설정'}
        initialHeight={0.45}
        minHeight={0.3}
        maxHeight={0.6}
        footer={
          <div className="flex gap-3">
            <button
              type="button"
              className="flex-1 rounded-xl bg-gray-100 px-4 py-3 text-sm font-semibold text-[#110f1a] hover:bg-gray-200"
              onClick={closePriceEditSheet}
            >
              취소
            </button>
            <button
              type="button"
              className="flex-1 rounded-xl bg-[#110f1a] px-4 py-3 text-sm font-semibold text-white hover:bg-[#241f3f] disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleSavePrice}
              disabled={isSavingPrice}
            >
              {isSavingPrice ? '저장 중...' : '저장'}
            </button>
          </div>
        }
      >
        {priceEditType === 'membership' && priceEditTargetPost ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-purple-500" />
                  <Typography variant="body1" className="font-medium text-[#110f1a]">
                    멤버쉽 전용
                  </Typography>
                </div>
                <div 
                  className={`relative w-12 h-6 rounded-full cursor-pointer transition-colors ${
                    priceEditTargetPost.isSubscribersOnly ? 'bg-purple-500' : 'bg-gray-300'
                  }`}
                  onClick={() => {
                    setPriceEditTargetPost(prev => prev ? {
                      ...prev,
                      isSubscribersOnly: !prev.isSubscribersOnly
                    } : null)
                  }}
                >
                  <div 
                    className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                      priceEditTargetPost.isSubscribersOnly ? 'translate-x-7' : 'translate-x-1'
                    }`}
                  />
                </div>
              </div>
              <Typography variant="caption" className="mt-2 block text-gray-500">
                활성화하면 멤버쉽 구독자만 이 포스트를 볼 수 있습니다.
              </Typography>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Heart className="h-5 w-5 fill-red-500 text-red-500" />
                <Typography variant="body1" className="font-medium text-[#110f1a]">
                  단건 구매 가격
                </Typography>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={priceEditValue}
                  onChange={(e) => setPriceEditValue(e.target.value)}
                  placeholder="0"
                  min="0"
                  className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-lg font-semibold text-[#110f1a] focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                />
                <span className="text-lg font-semibold text-[#110f1a]">P</span>
              </div>
              <Typography variant="caption" className="mt-2 block text-gray-500">
                0을 입력하면 무료 공개로 전환됩니다.
              </Typography>
            </div>
          </div>
        )}
      </SlideSheet>

      {/* 포스트 메뉴 슬라이드 시트 */}
      <SlideSheet
        isOpen={!!postMenuTargetPost}
        onClose={closePostMenuSheet}
        initialHeight={0.32}
        minHeight={0.2}
        maxHeight={0.45}
      >
        <div className="rounded-md bg-gray-100">
          <button
            type="button"
            onClick={() => {
              if (postMenuTargetPost) {
                handleTogglePin(postMenuTargetPost.id, !!postMenuTargetPost.isPinned)
              }
              closePostMenuSheet()
            }}
            className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-300 hover:bg-gray-50 transition-colors"
          >
            <Pin className={`h-5 w-5 ${postMenuTargetPost?.isPinned ? 'text-[#FE3A8F]' : 'text-gray-600'}`} />
            <span className={`text-base font-medium ${postMenuTargetPost?.isPinned ? 'text-[#FE3A8F]' : 'text-[#110f1a]'}`}>
              {postMenuTargetPost?.isPinned ? '고정 해제' : '게시물 고정'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (postMenuTargetPost) {
                openEditSheet(postMenuTargetPost)
              }
              closePostMenuSheet()
            }}
            className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-300 hover:bg-gray-50 transition-colors"
          >
            <Pencil className="h-5 w-5 text-gray-600" />
            <span className="text-base font-medium text-[#110f1a]">수정</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (postMenuTargetPost) {
                handleDeletePost(postMenuTargetPost.id)
              }
              closePostMenuSheet()
            }}
            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-red-50 transition-colors"
          >
            <Trash2 className="h-5 w-5 text-red-500" />
            <span className="text-base font-medium text-red-500">삭제</span>
          </button>
        </div>
      </SlideSheet>

      {/* 다른 사용자 게시물 메뉴 슬라이드 시트 */}
      <SlideSheet
        isOpen={!!otherPostMenuTargetPost}
        onClose={() => setOtherPostMenuTargetPost(null)}
        title=""
        showSubmit={false}
      >
        <div className="space-y-1 py-2">
          {/* 컬렉션 저장 */}
          <button
            type="button"
            onClick={() => {
              if (otherPostMenuTargetPost) {
                handleSavePost(otherPostMenuTargetPost)
              }
              setOtherPostMenuTargetPost(null)
            }}
            className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
          >
            <Bookmark className={`h-5 w-5 ${otherPostMenuTargetPost && savedPostIds.has(otherPostMenuTargetPost.id) ? 'text-[#FE3A8F] fill-current' : 'text-gray-500'}`} />
            <span className="text-base text-gray-900">컬렉션 저장</span>
          </button>
          
          {/* 신고하기 */}
          <button
            type="button"
            onClick={() => {
              if (otherPostMenuTargetPost) {
                setUserReportModal({
                  isOpen: true,
                  targetType: 'post',
                  targetId: otherPostMenuTargetPost.id,
                  targetName: otherPostMenuTargetPost.content?.slice(0, 50) || '게시물',
                })
              }
              setOtherPostMenuTargetPost(null)
            }}
            className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
          >
            <Flag className="h-5 w-5 text-gray-500" />
            <span className="text-base text-gray-900">신고하기</span>
          </button>
        </div>
      </SlideSheet>

      {/* 게시글 수정 슬라이드 시트 */}
      <SlideSheet
        isOpen={!!editTargetPost}
        onClose={closeEditSheet}
        title="게시글 수정"
        initialHeight={0.5}
        minHeight={0.3}
        maxHeight={0.7}
        footer={
          <div className="flex gap-3 px-4">
            <button
              type="button"
              onClick={closeEditSheet}
              disabled={isSavingEdit}
              className="flex-1 rounded-xl border border-gray-300 py-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={isSavingEdit}
              className="flex-1 rounded-xl bg-[#FE3A8F] py-3 text-sm font-medium text-white transition hover:bg-[#e5327f] disabled:opacity-50"
            >
              {isSavingEdit ? '저장 중...' : '저장'}
            </button>
          </div>
        }
      >
        <div className="px-4 space-y-4">
          {/* 미디어 미리보기 (읽기 전용) */}
          {editTargetPost && editTargetPost.media && editTargetPost.media.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {editTargetPost.media.slice(0, 4).map((file: FeedMedia, idx: number) => (
                <div key={idx} className="relative h-16 w-16 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
                  {file.type === 'video' ? (
                    <div className="flex h-full w-full items-center justify-center bg-gray-200">
                      <span className="text-xs text-gray-500">동영상</span>
                    </div>
                  ) : (
                    <img
                      src={file.src}
                      alt={`미디어 ${idx + 1}`}
                      className="h-full w-full object-cover opacity-60"
                    />
                  )}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                    <span className="text-xs text-white">🔒</span>
                  </div>
                </div>
              ))}
              {editTargetPost.media.length > 4 && (
                <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-gray-200">
                  <span className="text-xs text-gray-500">+{editTargetPost.media.length - 4}</span>
                </div>
              )}
            </div>
          )}

          {/* 내용 수정 */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              내용
            </label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              placeholder="게시글 내용을 입력하세요"
              rows={5}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-[#FE3A8F] focus:outline-none focus:ring-1 focus:ring-[#FE3A8F] resize-none"
            />
          </div>
        </div>
      </SlideSheet>

      {/* 멤버쉽 구매 슬라이드 시트 */}
      <SlideSheet
        isOpen={isMembershipPurchaseSheetOpen}
        onClose={() => {
          setIsMembershipPurchaseSheetOpen(false)
          setSelectedMembership(null)
          setTargetMembershipId(null)
        }}
        title="멤버쉽 구독"
        initialHeight={0.7}
        minHeight={0.4}
        maxHeight={0.9}
        zIndex={200}
        footer={
          selectedMembership && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">구독 가격</span>
                <span className="font-bold text-[#FE3A8F]">
                  {selectedMembership.monthly_price.toLocaleString()}P/월
                </span>
              </div>
              <button
                type="button"
                onClick={handleMembershipPurchase}
                disabled={isProcessingMembershipPurchase}
                className="w-full py-3 bg-[#FE3A8F] text-white font-semibold rounded-xl hover:bg-[#e8338a] transition-colors disabled:opacity-50"
              >
                {isProcessingMembershipPurchase ? '처리 중...' : '구독하기'}
              </button>
            </div>
          )
        }
      >
        {isMembershipsLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#FE3A8F] border-t-transparent" />
          </div>
        ) : partnerMemberships.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            이 파트너의 멤버쉽이 없습니다
          </div>
        ) : (
          <div className="space-y-3 px-4">
            <p className="text-sm text-gray-600 mb-4">
              구독할 멤버쉽을 선택하세요
            </p>
            {(targetMembershipId
              ? [...partnerMemberships].filter(m => m.id === targetMembershipId)
              : [...partnerMemberships]
            ).sort((a, b) => (a.tier_rank || 0) - (b.tier_rank || 0)).map((membership) => (
              <button
                key={membership.id}
                type="button"
                onClick={() => setSelectedMembership(membership)}
                className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                  selectedMembership?.id === membership.id
                    ? 'border-[#FE3A8F] bg-[#FE3A8F]/5'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <h4 className="font-semibold text-gray-900">{membership.name}</h4>
                  <span className={`text-sm font-bold ${
                    selectedMembership?.id === membership.id ? 'text-[#FE3A8F]' : 'text-gray-700'
                  }`}>
                    {membership.monthly_price.toLocaleString()}P/월
                  </span>
                </div>
                {membership.description && (
                  <p className="text-xs text-gray-500 break-words whitespace-pre-wrap">{membership.description}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </SlideSheet>

      {/* 저장 슬라이드 시트 */}
      <SavePostSheet
        isOpen={isSaveSheetOpen}
        onClose={() => setIsSaveSheetOpen(false)}
        savedPost={savedPostInfo}
        onUnsave={handleUnsavePost}
      />

      {/* 일반 사용자 신고 모달 */}
      <ReportModal
        isOpen={userReportModal.isOpen}
        onClose={() => setUserReportModal({ isOpen: false, targetType: 'post', targetId: '' })}
        targetType={userReportModal.targetType}
        targetId={userReportModal.targetId}
        targetName={userReportModal.targetName}
      />

      {/* 관리자 제재 슬라이드 팝업 */}
      <SlideSheet
        isOpen={!!reportSheetPostId}
        onClose={() => {
          setReportSheetPostId(null)
          setReportReasonDetail('')
        }}
        title="포스트 제재"
        initialHeight={0.5}
        minHeight={0.3}
        maxHeight={0.7}
        zIndex={9999999}
        footer={
          <Button
            className="w-full rounded-full bg-red-500 text-white hover:bg-red-600"
            disabled={!reportReasonDetail.trim() || isSubmittingReport}
            onClick={handleSubmitReport}
          >
            {isSubmittingReport ? '처리 중...' : '제재 처리'}
          </Button>
        }
      >
        <div className="space-y-4 p-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">제재 유형</label>
            <select
              value={reportReasonType}
              onChange={(e) => setReportReasonType(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#FE3A8F] focus:outline-none cursor-pointer"
            >
              <option value={1}>욕설/비방</option>
              <option value={2}>음란물</option>
              <option value={3}>스팸/광고</option>
              <option value={4}>개인정보 노출</option>
              <option value={5}>기타</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">제재 사유</label>
            <textarea
              value={reportReasonDetail}
              onChange={(e) => setReportReasonDetail(e.target.value)}
              placeholder="제재 사유를 입력해주세요"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#FE3A8F] focus:outline-none resize-none"
              rows={4}
            />
          </div>
        </div>
      </SlideSheet>

      {/* 배송지 입력 슬라이드 */}
      <SlideSheet
        isOpen={isDeliverySheetOpen}
        onClose={() => {
          setIsDeliverySheetOpen(false)
          setUseDirectInput(false)
          setDeliveryInfo({
            recipient_name: '',
            recipient_phone: '',
            recipient_address: '',
            recipient_address_detail: '',
            recipient_postal_code: '',
            delivery_memo: '',
          })
        }}
        title="배송지 입력"
        initialHeight={0.7}
        minHeight={0.5}
        maxHeight={0.9}
        zIndex={9999999}
        footer={
          <Button
            className="w-full rounded-full bg-[#FE3A8F] text-white hover:bg-[#E0357F]"
            onClick={handleDeliveryPurchase}
            disabled={useDirectInput ? !deliveryInfo.recipient_name || !deliveryInfo.recipient_phone || !deliveryInfo.recipient_address || !deliveryInfo.recipient_postal_code : !selectedShippingAddressId}
          >
            주문하기
          </Button>
        }
      >
        <div className="space-y-4 p-4">
          {/* 배송지 선택 방식 토글 */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setUseDirectInput(false)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${!useDirectInput ? 'bg-[#FE3A8F] text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              기존 배송지
            </button>
            <button
              onClick={() => setUseDirectInput(true)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${useDirectInput ? 'bg-[#FE3A8F] text-white' : 'bg-gray-100 text-gray-600'}`}
            >
              직접 입력
            </button>
          </div>

          {!useDirectInput ? (
            // 저장된 배송지 목록
            <div className="space-y-3">
              {isLoadingAddresses ? (
                <div className="text-center py-8 text-gray-500">배송지 불러오는 중...</div>
              ) : shippingAddresses.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-3">저장된 배송지가 없습니다</p>
                  <button
                    onClick={() => setUseDirectInput(true)}
                    className="text-[#FE3A8F] font-medium"
                  >
                    직접 입력하기
                  </button>
                </div>
              ) : (
                shippingAddresses.map((addr) => (
                  <button
                    key={addr.id}
                    onClick={() => setSelectedShippingAddressId(addr.id)}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-colors ${selectedShippingAddressId === addr.id ? 'border-[#FE3A8F] bg-pink-50' : 'border-gray-200 bg-white'}`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{addr.name}</span>
                      {addr.is_default && (
                        <span className="text-xs bg-[#FE3A8F] text-white px-2 py-0.5 rounded-full">기본</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600">{addr.phone}</p>
                    <p className="text-sm text-gray-600">{addr.address} {addr.address_detail}</p>
                    <p className="text-xs text-gray-400">{addr.postal_code}</p>
                  </button>
                ))
              )}
            </div>
          ) : (
            // 직접 입력 폼
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">받는 분 *</label>
                <Input
                  value={deliveryInfo.recipient_name}
                  onChange={(e) => setDeliveryInfo(prev => ({ ...prev, recipient_name: e.target.value }))}
                  placeholder="이름 입력"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">연락처 *</label>
                <Input
                  value={deliveryInfo.recipient_phone}
                  onChange={(e) => setDeliveryInfo(prev => ({ ...prev, recipient_phone: e.target.value }))}
                  placeholder="01012345678"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">우편번호 *</label>
                <Input
                  value={deliveryInfo.recipient_postal_code}
                  onChange={(e) => setDeliveryInfo(prev => ({ ...prev, recipient_postal_code: e.target.value }))}
                  placeholder="12345"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">주소 *</label>
                <Input
                  value={deliveryInfo.recipient_address}
                  onChange={(e) => setDeliveryInfo(prev => ({ ...prev, recipient_address: e.target.value }))}
                  placeholder="기본 주소"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">상세주소</label>
                <Input
                  value={deliveryInfo.recipient_address_detail}
                  onChange={(e) => setDeliveryInfo(prev => ({ ...prev, recipient_address_detail: e.target.value }))}
                  placeholder="상세 주소 (동/호수 등)"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">배송 메모</label>
                <Input
                  value={deliveryInfo.delivery_memo}
                  onChange={(e) => setDeliveryInfo(prev => ({ ...prev, delivery_memo: e.target.value }))}
                  placeholder="배송 시 요청사항"
                />
              </div>
            </div>
          )}
        </div>
      </SlideSheet>

      {/* 퀘스트 멤버십 필요 팝업 */}
      <SlideSheet
        isOpen={questMembershipPopup.isOpen}
        onClose={() => setQuestMembershipPopup({ isOpen: false, membershipId: null, minTierRank: 0 })}
        title="멤버십 가입 필요"
        initialHeight={0.5}
        minHeight={0.3}
        maxHeight={0.7}
        footer={
          <div className="p-4">
            <Button
              variant="primary"
              className="w-full !bg-[#FE3A8F] !text-white rounded-full py-3"
              onClick={() => {
                setQuestMembershipPopup({ isOpen: false, membershipId: null, minTierRank: 0 })
                navigate({
                  to: '/partners/$memberCode',
                  params: { memberCode },
                  search: { tab: 'membership' },
                  replace: true,
                })
              }}
            >
              멤버십 가입하러 가기
            </Button>
          </div>
        }
      >
        {(() => {
          const requiredMembership = partnerMemberships.find(m => m.id === questMembershipPopup.membershipId)
          if (!requiredMembership) return <div className="p-4 text-center text-gray-500">멤버십 정보를 불러올 수 없습니다.</div>
          
          return (
            <div className="p-4 space-y-4">
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-4">
                  이 퀘스트는 아래 멤버십 구독자만 이용할 수 있습니다.
                </p>
              </div>
              
              <div className="bg-gradient-to-r from-[#FE3A8F]/5 to-purple-50 rounded-2xl p-5 border border-[#FE3A8F]/20">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-bold text-[#110f1a]">{requiredMembership.name}</h3>
                  {requiredMembership.tier_rank && (
                    <span className="text-xs px-2 py-1 rounded-full bg-[#FE3A8F]/10 text-[#FE3A8F]">
                      {TIER_OPTIONS.find(t => t.rank === requiredMembership.tier_rank)?.emoji} {TIER_OPTIONS.find(t => t.rank === requiredMembership.tier_rank)?.name}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-1">
                  {requiredMembership.discount_rate && requiredMembership.discount_rate > 0 ? (
                    <>
                      <p className="text-sm text-gray-400 line-through">
                        {requiredMembership.monthly_price?.toLocaleString()}P
                      </p>
                      <p className="text-sm text-[#FE3A8F] font-medium">
                        {Math.round((requiredMembership.monthly_price || 0) * (1 - requiredMembership.discount_rate / 100)).toLocaleString()}P
                        {requiredMembership.active_months && requiredMembership.active_months > 1 && `/${requiredMembership.active_months}개월`}
                        {!requiredMembership.active_months && '/월'}
                      </p>
                      <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                        {requiredMembership.discount_rate}% OFF
                      </span>
                    </>
                  ) : (
                    <p className="text-sm text-[#FE3A8F] font-medium">
                      {requiredMembership.monthly_price?.toLocaleString()}P
                      {requiredMembership.active_months && requiredMembership.active_months > 1 && `/${requiredMembership.active_months}개월`}
                      {!requiredMembership.active_months && '/월'}
                    </p>
                  )}
                </div>

                {requiredMembership.description && (
                  <p className="text-sm text-gray-500 mt-2 break-words whitespace-pre-wrap">{requiredMembership.description}</p>
                )}

                <ul className="mt-3 space-y-1 text-xs text-gray-600">
                  {requiredMembership.paid_message_quota > 0 && (
                    <li className="flex items-center gap-1.5">
                      <span className="text-gray-400">•</span>
                      무료 메시지 {requiredMembership.paid_message_quota}개 제공
                    </li>
                  )}
                  {requiredMembership.paid_call_quota > 0 && (
                    <li className="flex items-center gap-1.5">
                      <span className="text-gray-400">•</span>
                      음성통화 {requiredMembership.paid_call_quota}분 무료 이용
                    </li>
                  )}
                  {requiredMembership.paid_video_quota > 0 && (
                    <li className="flex items-center gap-1.5">
                      <span className="text-gray-400">•</span>
                      영상통화 {requiredMembership.paid_video_quota}분 무료 이용
                    </li>
                  )}
                  {requiredMembership.post_access_mode && (
                    <li className="flex items-center gap-1.5">
                      <span className="text-gray-400">•</span>
                      {requiredMembership.post_access_mode === 'all_periods' 
                        ? '모든 기간의 포스트를 열람할 수 있어요' 
                        : '최근 30일 포스트만 볼 수 있어요'}
                    </li>
                  )}
                </ul>
                {requiredMembership.membership_message && (
                  <div className="mt-2">
                    <span className="text-xs bg-pink-50 text-[#FE3A8F] px-2 py-1 rounded-full">💌 환영 메시지</span>
                  </div>
                )}
              </div>
            </div>
          )
        })()}
      </SlideSheet>

      {/* 멤버십 정보 시트 (뱃지 클릭 시) */}
      <SlideSheet
        isOpen={isMembershipInfoSheetOpen && membershipInfoSheetPost !== null}
        onClose={() => {
          setIsMembershipInfoSheetOpen(false)
          setMembershipInfoSheetPost(null)
          setMembershipInfoSheetTargetId(null)
        }}
        title="멤버십 안내"
        initialHeight={0.35}
        minHeight={0.25}
        maxHeight={0.5}
      >
        <div className="flex flex-col gap-3 px-4 pb-6">
          {membershipInfoSheetPost && (
            <>
              <p className="text-sm text-gray-600">이 콘텐츠는 다음 멤버십으로 열람 가능합니다.</p>
              <ul className="space-y-2">
                {(() => {
                  if (membershipInfoSheetTargetId) {
                    const m = partnerMemberships.find((x) => x.id === membershipInfoSheetTargetId)
                    const name = m?.name ?? '멤버십'
                    return (
                      <li className="flex items-center gap-2 text-sm font-medium text-[#110f1a]">
                        <Star className="h-4 w-4 text-[#FE3A8F] flex-shrink-0" />
                        {name}
                      </li>
                    )
                  }
                  const ids = getPostMembershipIds(membershipInfoSheetPost)
                  const names = ids
                    .map((id) => partnerMemberships.find((m) => m.id === id)?.name ?? '멤버십')
                    .filter((n, i, arr) => arr.indexOf(n) === i)
                  return names.length ? names.map((name) => (
                    <li key={name} className="flex items-center gap-2 text-sm font-medium text-[#110f1a]">
                      <Star className="h-4 w-4 text-[#FE3A8F] flex-shrink-0" />
                      {name}
                    </li>
                  )) : (
                    <li className="text-sm text-gray-500">구독자 전용</li>
                  )
                })()}
              </ul>
            </>
          )}
        </div>
      </SlideSheet>

    </>
    </CaptureProtection>
  )
}

