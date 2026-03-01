import {
    Avatar,
    ChargeModal,
    CreateStreamSheet,
    DonationModal,
    PartnerListSheet,
    SlideSheet
} from '@/components'
import type { FeedNavTab } from '@/components/layouts/MobileTabBar'
import { feedNavItems } from '@/components/layouts/MobileTabBar'
import { ReportModal } from '@/components/modals'
import { useGlobalRealtime } from '@/contexts/GlobalRealtimeProvider'
import { useAuth } from '@/hooks/useAuth'
import { useDevice } from '@/hooks/useDevice'
import { usePartnerRequests } from '@/hooks/usePartnerRequests'
import { useTimesheetRole } from '@/hooks/useTimesheetRole'
import { mateYouApi } from '@/lib/apiClient'
import { edgeApi } from '@/lib/edgeApi'
import { storeSchedulesApi } from '@/api/store/schedules'
import { supabase } from '@/lib/supabase'
import { useCartStore } from '@/store/useCartStore'
import { useCreatePostStore } from '@/store/useCreatePostStore'
import { useUIStore } from '@/store/useUIStore'
import { Capacitor } from '@capacitor/core'
import { Link, useNavigate, useRouterState } from '@tanstack/react-router'
import { animate, motion, useMotionValue, useTransform } from 'framer-motion'
import {
    AlignLeft,
    AlignRight,
    Ban,
    Bookmark,
    Calendar,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
  Crown,
    Dices,
    Flag,
    Heart,
    MoreVertical,
    Pause,
    Play,
    PlayCircle,
    Plus,
    PlusSquare,
  Radio,
    RefreshCw,
  Search as SearchIcon,
    Settings,
    ShoppingBag,
    ShoppingCart,
    SquarePen,
    Volume2,
    VolumeX,
    Wallet,
    X
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { useQuery } from '@tanstack/react-query'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Pagination } from 'swiper/modules'
import 'swiper/css'
import 'swiper/css/pagination'

export type { FeedNavTab } from '@/components/layouts/MobileTabBar'

type FeedCategory = 'following' | 'subscription'

interface FeedSideNavigationProps {
  activeTab: FeedNavTab
  onChange: (key: FeedNavTab) => void
}

export function FeedSideNavigation({ activeTab, onChange }: FeedSideNavigationProps) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const routerState = useRouterState()
  const pathname = routerState.location.pathname
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [feedFilter, setFeedFilter] = useState<FeedCategory>(() =>
    pathname.startsWith('/feed/subscribe') || pathname.startsWith('/membership')
      ? 'subscription'
      : 'following',
  )
  const handleAvatarClick = () => setIsMenuOpen(true)
  const partnerAvatar =
    user?.profile_image || (user as { avatar_url?: string } | undefined)?.avatar_url || ''
  const partnerInitial = (user?.name || user?.username || 'M').charAt(0).toUpperCase()
  const isPartner = user?.role === 'partner'

  const resolveMyPagePath = () => {
    if (!user) return '/login'
    // normal, admin: /mypage로 이동
    // partner: /partners/$memberCode로 이동
    if (user.role === 'normal' || user.role === 'admin' || !user.role) {
      return '/mypage'
    }
    if (user.role === 'partner' && user.member_code) {
      return `/partners/${user.member_code}`
    }
    return '/mypage'
  }

  const handleFilterChange = (value: FeedCategory) => {
    setFeedFilter(value)
    if (value === 'following') {
      navigate({ to: '/feed/all' })
    } else {
      navigate({ to: '/feed/subscribe' })
    }
    setIsMenuOpen(false)
  }

  return (
    <aside className="z-[99] hidden w-[110px] shrink-0 lg:block">
      <div className="sticky top-0 flex h-screen flex-col px-4 pt-2 pb-4">
        <Link to="/" className="mb-6 flex w-full items-center rounded-2xl px-3 py-2">
          <img src="/logo.png" alt="MateYou" className="h-8 w-auto" />
        </Link>
        <div className="flex flex-1 flex-col px-4">
          <nav className="flex flex-1 flex-col justify-center gap-3">
            {isPartner && (
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-full ml-1 cursor-pointer"
                onClick={handleAvatarClick}
              >
                {partnerAvatar ? (
                  <img
                    src={partnerAvatar}
                    alt={user.name || user.username || '프로필'}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-semibold text-[#110f1a]">
                    {partnerInitial}
                  </span>
                )}
              </button>
            )}
            {feedNavItems.map((item) => {
              const active = activeTab === item.key
              const targetPath = item.key === 'mypage' ? resolveMyPagePath() : item.path || '#'
              return (
                <Link
                  key={item.key}
                  to={targetPath}
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl transition-colors ${
                    active ? 'bg-[#110f1a] text-white' : 'text-gray-400 hover:bg-gray-50'
                  }`}
                  onClick={() => onChange(item.key)}
                >
                  <span className={`text-lg ${active ? 'text-white' : 'text-gray-400'}`}>{item.icon}</span>
                </Link>
              )
            })}
          </nav>
        </div>
        <div className="p-4 cursor-pointer" onClick={() => setIsMenuOpen(true)}>
          <AlignLeft className="h-5 w-5" />
        </div>
        {/* PC에서도 모바일과 동일한 슬라이드 메뉴 사용 */}
        {typeof document !== 'undefined' && createPortal(
          <FeedMobileMenu
            isOpen={isMenuOpen}
            onClose={() => setIsMenuOpen(false)}
            feedFilter={feedFilter}
            onFilterChange={handleFilterChange}
          />,
          document.body,
        )}
      </div>
    </aside>
  )
}

const resolveActiveTabFromPath = (pathname: string): FeedNavTab => {
  if (pathname.startsWith('/chat')) return 'chat'
  if (pathname.startsWith('/store/cart')) return 'cart'
  if (pathname.startsWith('/mypage') || pathname.startsWith('/partners')) return 'mypage'
  if (pathname.startsWith('/explore')) return 'explore'
  return 'home'
}

export function DesktopNavRail() {
  const { isMobile } = useDevice()
  const navigate = useNavigate()
  const routerState = useRouterState()
  const { user } = useAuth()

  if (isMobile) {
    return null
  }

  const pathname = routerState.location.pathname
  const activeTab = resolveActiveTabFromPath(pathname)

  const resolveMyPagePath = () => {
    if (!user) return '/login'
    // normal, admin: /mypage로 이동
    // partner: /partners/$memberCode로 이동
    if (user.role === 'normal' || user.role === 'admin' || !user.role) {
      return '/mypage'
    }
    if (user.role === 'partner' && user.member_code) {
      return `/partners/${user.member_code}`
    }
    return '/mypage'
  }

  const handleTabChange = (key: FeedNavTab) => {
    if (key === 'mypage') {
      const targetPath = resolveMyPagePath()
      navigate({ to: targetPath as '/' })
      return
    }

    const targetPath = feedNavItems.find((item) => item.key === key)?.path
    if (targetPath) {
      navigate({ to: targetPath as '/' })
    }
  }

  return (
    <div className="hidden lg:flex lg:w-[110px] lg:flex-shrink-0 lg:justify-end lg:bg-white/90">
      <FeedSideNavigation activeTab={activeTab} onChange={handleTabChange} />
    </div>
  )
}

// 채팅 오른쪽 슬라이드 메뉴 컴포넌트
interface ChatRightSlideMenuProps {
  isOpen: boolean
  onClose: () => void
  partnerName: string
  partnerAvatar?: string | null
  partnerHandle?: string | null
  roomId?: string | null
  partnerId?: string | null // 상대방 member_id
  currentUserId?: string | null // 현재 사용자 member_id
  isCurrentUserPartner?: boolean // 현재 사용자가 파트너인지
  onBlock: () => void
  onReport: () => void
}

interface ChatMediaItem {
  id: string
  media_url: string
  media_type: 'image' | 'video'
  thumbnail_url?: string
  file_name?: string
  created_at: string
}

interface QuestItem {
  id: string
  partner_job_id: string | null
  coins_per_job: number | null
  job_count: number
  total_coins: number
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'rejected'
  created_at: string
  updated_at?: string | null
  request_type?: string
  client?: { id: string; name: string; profile_image?: string | null }
  partner?: { id: string; member_id: string }
  job?: { id: string; job_name: string } | null
}

type QuestFilter = 'all' | 'pending' | 'in_progress' | 'completed'

function ChatRightSlideMenu({ isOpen, onClose, partnerName, partnerAvatar, partnerHandle, roomId, partnerId, currentUserId, isCurrentUserPartner, onBlock, onReport }: ChatRightSlideMenuProps) {
  const [mediaList, setMediaList] = useState<ChatMediaItem[]>([])
  const [mediaLoading, setMediaLoading] = useState(false)
  const [isAlbumOpen, setIsAlbumOpen] = useState(false)
  const [allMedia, setAllMedia] = useState<ChatMediaItem[]>([])
  const [albumPage, setAlbumPage] = useState(1)
  const [hasMoreMedia, setHasMoreMedia] = useState(true)
  const [albumLoading, setAlbumLoading] = useState(false)
  const [previewMedia, setPreviewMedia] = useState<string | null>(null)
  const [previewType, setPreviewType] = useState<'image' | 'video'>('image')
  const [previewIndex, setPreviewIndex] = useState<number>(-1)
  
  // 비디오 프리뷰 상태
  const videoPreviewRef = useRef<HTMLVideoElement>(null)
  const [isVideoMuted, setIsVideoMuted] = useState(false)
  const [isVideoPlaying, setIsVideoPlaying] = useState(true)
  const [videoProgress, setVideoProgress] = useState(0)
  const [videoDuration, setVideoDuration] = useState(0)
  const [memberCode, setMemberCode] = useState<string | null>(null)
  
  // 주문 조회 상태
  const [isOrderListOpen, setIsOrderListOpen] = useState(false)
  const [chatRoomOrders, setChatRoomOrders] = useState<any[]>([])
  const [isLoadingOrders, setIsLoadingOrders] = useState(false)
  
  // 멤버십 뱃지 상태
  const [subscriberInfo, setSubscriberInfo] = useState<{
    isSubscribed: boolean
    subscription?: {
      id: string
      membership_name: string | null
      membership_id: string | null
      monthly_price: number | null
      started_at: string | null
      expired_at: string | null
      auto_renewal_enabled: boolean
    }
  } | null>(null)
  const [subscriberLoading, setSubscriberLoading] = useState(false)
  const [isSubscriptionDetailOpen, setIsSubscriptionDetailOpen] = useState(false)
  
  // 메모 상태
  const [memoBody, setMemoBody] = useState('')
  const [memoLoading, setMemoLoading] = useState(false)
  const [memoSaving, setMemoSaving] = useState(false)
  const memoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)
  
  // 프리뷰 드래그 닫기 상태 (framer-motion)
  const previewX = useMotionValue(0)
  const previewY = useMotionValue(0)
  // 드래그 거리 계산 (x, y 합산)
  const dragDistance = useTransform([previewX, previewY], ([x, y]: number[]) => Math.sqrt(x * x + y * y))
  const previewOpacity = useTransform(dragDistance, [0, 300], [1, 0])
  const previewScale = useTransform(dragDistance, [0, 300], [1, 0.8])
  
  // 캡쳐방지 블러 상태
  const [isPageVisible, setIsPageVisible] = useState(true)
  
  // 캡쳐방지: 페이지 visibility 감지
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsPageVisible(document.visibilityState === 'visible')
    }
    
    const handleBlur = () => setIsPageVisible(false)
    const handleFocus = () => setIsPageVisible(true)
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('blur', handleBlur)
    window.addEventListener('focus', handleFocus)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('blur', handleBlur)
      window.removeEventListener('focus', handleFocus)
    }
  }, [])
  
  // 현재 사용자의 member_code 조회 (워터마크용)
  useEffect(() => {
    if (!currentUserId) return
    const fetchMemberCode = async () => {
      const { data } = await supabase.from('members').select('member_code').eq('id', currentUserId).single() as { data: { member_code: string } | null }
      if (data) setMemberCode(data.member_code)
    }
    fetchMemberCode()
  }, [currentUserId])
  
  // 비디오 프리뷰 핸들러
  const toggleVideoPlay = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!videoPreviewRef.current) return
    if (isVideoPlaying) {
      videoPreviewRef.current.pause()
    } else {
      videoPreviewRef.current.play()
    }
    setIsVideoPlaying(!isVideoPlaying)
  }
  
  const toggleVideoMute = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsVideoMuted(!isVideoMuted)
  }
  
  const handleVideoTimeUpdate = () => {
    if (videoPreviewRef.current) {
      setVideoProgress(videoPreviewRef.current.currentTime)
    }
  }
  
  const handleVideoLoadedMetadata = () => {
    if (videoPreviewRef.current) {
      setVideoDuration(videoPreviewRef.current.duration)
    }
  }
  
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoPreviewRef.current || videoDuration === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const newTime = (clickX / rect.width) * videoDuration
    videoPreviewRef.current.currentTime = newTime
    setVideoProgress(newTime)
  }
  
  const formatVideoTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }
  
  // 비디오 프리뷰 열릴 때 자동 재생
  useEffect(() => {
    if (previewType === 'video' && previewMedia && videoPreviewRef.current) {
      videoPreviewRef.current.play()
      setIsVideoPlaying(true)
    }
  }, [previewMedia, previewType])
  
  // 프리뷰 드래그 종료 핸들러
  const handlePreviewDragEnd = (_: any, info: { offset: { x: number, y: number }, velocity: { x: number, y: number } }) => {
    const distance = Math.sqrt(info.offset.x ** 2 + info.offset.y ** 2)
    const velocity = Math.sqrt(info.velocity.x ** 2 + info.velocity.y ** 2)
    const shouldClose = distance > 100 || velocity > 500
    
    if (shouldClose) {
      // 바로 닫기 (관성 없이)
      setPreviewMedia(null)
      previewX.set(0)
      previewY.set(0)
    } else {
      animate(previewX, 0, { type: 'spring', stiffness: 300, damping: 30 })
      animate(previewY, 0, { type: 'spring', stiffness: 300, damping: 30 })
    }
  }
  
  // 이전/다음 미디어로 이동
  const goToPrevMedia = useCallback(() => {
    if (previewIndex <= 0 || allMedia.length === 0) return
    const prevIndex = previewIndex - 1
    const prevMedia = allMedia[prevIndex]
    setPreviewIndex(prevIndex)
    setPreviewMedia(getMediaUrl(prevMedia))
    setPreviewType(prevMedia.media_type)
    previewX.set(0)
    previewY.set(0)
  }, [previewIndex, allMedia, previewX, previewY])
  
  const goToNextMedia = useCallback(() => {
    if (previewIndex >= allMedia.length - 1 || allMedia.length === 0) return
    const nextIndex = previewIndex + 1
    const nextMedia = allMedia[nextIndex]
    setPreviewIndex(nextIndex)
    setPreviewMedia(getMediaUrl(nextMedia))
    setPreviewType(nextMedia.media_type)
    previewX.set(0)
    previewY.set(0)
  }, [previewIndex, allMedia, previewX, previewY])
  
  // 워터마크 오버레이 컴포넌트 (썸네일용 - 작은 사이즈)
  const WatermarkOverlay = memberCode ? (
    <div 
      className="absolute inset-0 overflow-hidden pointer-events-none select-none"
      style={{ zIndex: 10 }}
    >
      <div 
        style={{
          position: 'absolute',
          top: '-50%',
          left: '-50%',
          width: '200%',
          height: '200%',
          transform: 'rotate(-30deg)',
          display: 'flex',
          flexWrap: 'wrap',
          alignContent: 'flex-start',
          gap: '40px 45px',
          padding: '20px',
        }}
      >
        {Array.from({ length: 200 }).map((_, i) => (
          <span
            key={i}
            className="text-white font-bold whitespace-nowrap"
            style={{
              fontSize: '10px',
              opacity: 0.13,
              textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
            }}
          >
            @{memberCode}
          </span>
        ))}
      </div>
    </div>
  ) : null
  
  // 프리뷰용 워터마크 오버레이 (전체화면용 - 큰 사이즈)
  const PreviewWatermarkOverlay = memberCode ? (
    <div 
      className="absolute inset-0 overflow-hidden pointer-events-none select-none"
      style={{ zIndex: 10 }}
    >
      <div 
        style={{
          position: 'absolute',
          top: '-50%',
          left: '-50%',
          width: '200%',
          height: '200%',
          transform: 'rotate(-30deg)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '80px 40px',
          padding: '30px',
        }}
      >
        {Array.from({ length: 150 }).map((_, i) => (
          <span
            key={i}
            className="text-white font-bold whitespace-nowrap"
            style={{
              fontSize: '12px',
              opacity: 0.15,
              textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
            }}
          >
            @{memberCode}
          </span>
        ))}
      </div>
    </div>
  ) : null
  
  // 퀘스트 관련 상태
  const [isQuestModalOpen, setIsQuestModalOpen] = useState(false)
  const [questList, setQuestList] = useState<QuestItem[]>([])
  const [questLoading, setQuestLoading] = useState(false)
  const [questFilter, setQuestFilter] = useState<QuestFilter>('all')
  const [questActionLoading, setQuestActionLoading] = useState<string | null>(null)
  const [questHistoryNow, setQuestHistoryNow] = useState(Date.now())
  
  // 퀘스트 히스토리 타이머 (1초마다 업데이트)
  useEffect(() => {
    if (!isQuestModalOpen || questList.filter(q => q.status === 'in_progress').length === 0) return
    const timer = setInterval(() => setQuestHistoryNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [isQuestModalOpen, questList])
  
  const SUPABASE_URL = 'https://rmooqijhkmomdtkvuzrr.supabase.co'
  
  const getMediaUrl = (media: ChatMediaItem) => {
    if (media.media_url.startsWith('http')) return media.media_url
    return `${SUPABASE_URL}/storage/v1/object/public/chat-media/${media.media_url}`
  }
  
  // 미디어 조회
  useEffect(() => {
    if (!isOpen || !roomId) return
    
    const fetchMedia = async () => {
      setMediaLoading(true)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const response = await fetch(
          `${SUPABASE_URL}/functions/v1/api-chat/rooms/${roomId}/media?page=1&limit=6`,
          {
            headers: {
              'Authorization': `Bearer ${session?.access_token}`,
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
          }
        )
        const result = await response.json()
        if (result.success && result.data?.media) {
          setMediaList(result.data.media)
        }
      } catch (error) {
        console.error('미디어 조회 실패:', error)
      } finally {
        setMediaLoading(false)
      }
    }
    
    fetchMedia()
  }, [isOpen, roomId])
  
  // 메모 조회
  useEffect(() => {
    if (!isOpen || !roomId) return
    setMemoBody('')
    const fetchMemo = async () => {
      setMemoLoading(true)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const response = await fetch(
          `${SUPABASE_URL}/functions/v1/api-chat/rooms/${roomId}/memo`,
          {
            headers: {
              'Authorization': `Bearer ${session?.access_token}`,
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
          }
        )
        const result = await response.json()
        if (result.success) {
          setMemoBody(result.data?.body ?? '')
        }
      } catch (error) {
        console.error('메모 조회 실패:', error)
      } finally {
        setMemoLoading(false)
      }
    }
    fetchMemo()
  }, [isOpen, roomId])
  
  // 메모 자동 저장 (디바운스)
  const saveMemo = useCallback(async (text: string) => {
    if (!roomId) return
    setMemoSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch(
        `${SUPABASE_URL}/functions/v1/api-chat/rooms/${roomId}/memo`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ body: text }),
        }
      )
    } catch (error) {
      console.error('메모 저장 실패:', error)
    } finally {
      setMemoSaving(false)
    }
  }, [roomId])
  
  const handleMemoChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value
    setMemoBody(text)
    if (memoSaveTimerRef.current) clearTimeout(memoSaveTimerRef.current)
    memoSaveTimerRef.current = setTimeout(() => saveMemo(text), 500)
  }, [saveMemo])
  
  // 멤버십 구독 여부 조회 (파트너일 때만)
  useEffect(() => {
    if (!isOpen || !isCurrentUserPartner || !partnerId) {
      setSubscriberInfo(null)
      return
    }
    const fetchSubscriberInfo = async () => {
      setSubscriberLoading(true)
      try {
        const result = await edgeApi.membershipSubscriptions.checkSubscriber(partnerId) as any
        if (result.success) {
          setSubscriberInfo(result.data)
        }
      } catch (error) {
        console.error('구독 확인 실패:', error)
      } finally {
        setSubscriberLoading(false)
      }
    }
    fetchSubscriberInfo()
  }, [isOpen, isCurrentUserPartner, partnerId])
  
  // 앨범 미디어 조회 (21개씩)
  const ALBUM_PAGE_SIZE = 21
  
  const fetchAlbumMedia = useCallback(async (page: number, reset = false) => {
    console.log('[Album] fetchAlbumMedia 호출:', { roomId, page, reset })
    if (!roomId) {
      console.log('[Album] roomId 없음, 스킵')
      return
    }
    setAlbumLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/api-chat/rooms/${roomId}/media?page=${page}&limit=${ALBUM_PAGE_SIZE}`,
        {
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
        }
      )
      const result = await response.json()
      console.log('[Album] API 응답:', result)
      if (result.success && result.data?.media) {
        const newMedia = result.data.media
        console.log('[Album] 미디어 로드됨:', newMedia.length, '개')
        setAllMedia(prev => {
          if (reset) return newMedia
          // 중복 제거
          const existingIds = new Set(prev.map(m => m.id))
          const uniqueNew = newMedia.filter((m: ChatMediaItem) => !existingIds.has(m.id))
          return [...prev, ...uniqueNew]
        })
        setHasMoreMedia(newMedia.length === ALBUM_PAGE_SIZE)
      } else {
        console.log('[Album] 미디어 없음')
        setHasMoreMedia(false)
      }
    } catch (error) {
      console.error('앨범 미디어 조회 실패:', error)
    } finally {
      setAlbumLoading(false)
    }
  }, [roomId])
  
  // 앨범 열릴 때 첫 페이지 조회
  useEffect(() => {
    if (!isAlbumOpen || !roomId) return
    setAlbumPage(1)
    setAllMedia([])
    setHasMoreMedia(true)
    fetchAlbumMedia(1, true)
  }, [isAlbumOpen, roomId, fetchAlbumMedia])
  
  // 더보기 로드
  const loadMoreAlbumMedia = useCallback(() => {
    if (albumLoading || !hasMoreMedia) return
    const nextPage = albumPage + 1
    setAlbumPage(nextPage)
    fetchAlbumMedia(nextPage)
  }, [albumPage, albumLoading, hasMoreMedia, fetchAlbumMedia])

  // 퀘스트 목록 조회 (Edge Function 사용)
  useEffect(() => {
    if (!isQuestModalOpen || !partnerId) return
    
    const fetchQuests = async () => {
      setQuestLoading(true)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const statusParam = questFilter === 'all' ? '' : `&status=${questFilter}`
        const response = await fetch(
          `${SUPABASE_URL}/functions/v1/api-chat/quests?partnerId=${partnerId}${statusParam}`,
          {
            headers: {
              'Authorization': `Bearer ${session?.access_token}`,
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
          }
        )
        const result = await response.json()
        if (result.success && result.data) {
          setQuestList(result.data)
        } else {
          setQuestList([])
        }
      } catch (error) {
        console.error('퀘스트 조회 실패:', error)
        setQuestList([])
      } finally {
        setQuestLoading(false)
      }
    }
    
    fetchQuests()
  }, [isQuestModalOpen, partnerId, questFilter])

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return '수락 대기'
      case 'in_progress': return '진행중'
      case 'completed': return '완료'
      case 'cancelled': return '취소됨'
      case 'rejected': return '거절됨'
      default: return status
    }
  }
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-700'
      case 'in_progress': return 'bg-blue-100 text-blue-700'
      case 'completed': return 'bg-green-100 text-green-700'
      case 'cancelled': return 'bg-gray-100 text-gray-500'
      case 'rejected': return 'bg-red-100 text-red-700'
      default: return 'bg-gray-100 text-gray-500'
    }
  }

  const filteredQuests = questList.filter(q => {
    if (questFilter === 'all') return true
    return q.status === questFilter
  })

  // 퀘스트 수락
  const handleAcceptQuest = async (questId: string) => {
    setQuestActionLoading(questId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/api-partner-dashboard/requests/${questId}/status`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: 'in_progress',
            response_message: '퀘스트를 수락했습니다!',
          }),
        }
      )
      if (response.ok) {
        setQuestList(prev => prev.map(q => 
          q.id === questId ? { ...q, status: 'in_progress' as const } : q
        ))
        // 수락 메시지 발송
        if (roomId) {
          await mateYouApi.chat.sendMessage({
            room_id: roomId,
            message: '의뢰를 수락했습니다! 🎮',
            message_type: 'text'
          })
        }
      }
    } catch (error) {
      console.error('퀘스트 수락 실패:', error)
    } finally {
      setQuestActionLoading(null)
    }
  }

  // 퀘스트 거절
  const handleRejectQuest = async (questId: string) => {
    setQuestActionLoading(questId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/api-partner-dashboard/requests/${questId}/status`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: 'cancelled',
            response_message: '퀘스트가 거절되었습니다.',
          }),
        }
      )
      if (response.ok) {
        setQuestList(prev => prev.map(q => 
          q.id === questId ? { ...q, status: 'rejected' as const } : q
        ))
        // 거절 메시지 발송
        if (roomId) {
          await mateYouApi.chat.sendMessage({
            room_id: roomId,
            message: '의뢰를 거절했습니다.',
            message_type: 'text'
          })
        }
      }
    } catch (error) {
      console.error('퀘스트 거절 실패:', error)
    } finally {
      setQuestActionLoading(null)
    }
  }

  // 퀘스트 완료
  const handleCompleteQuest = async (questId: string) => {
    setQuestActionLoading(questId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/api-partner-dashboard/requests/${questId}/status`,
        {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status: 'completed',
            response_message: '퀘스트가 완료되었습니다.',
          }),
        }
      )
      if (response.ok) {
        setQuestList(prev => prev.map(q => 
          q.id === questId ? { ...q, status: 'completed' as const } : q
        ))
        // 완료 메시지 발송
        if (roomId) {
          await mateYouApi.chat.sendMessage({
            room_id: roomId,
            message: '퀘스트를 완료했습니다! 🎉',
            message_type: 'text'
          })
        }
      }
    } catch (error) {
      console.error('퀘스트 완료 실패:', error)
    } finally {
      setQuestActionLoading(null)
    }
  }

  return (
    <>
      <div
        id="chat-right-menu-container"
        className={`fixed inset-0 z-[9999] ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
        onClick={onClose}
      >
        {/* 오버레이 */}
        <div id="chat-right-menu-overlay" className={`absolute inset-0 bg-black transition-opacity duration-300 ${isOpen ? 'opacity-40' : 'opacity-0'}`} />
        
        {/* 오른쪽 슬라이드 메뉴 */}
        <aside
          id="chat-right-menu-aside"
          className={`absolute inset-y-0 right-0 w-72 bg-white flex flex-col transition-[translate] duration-300 ${
            isOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
          onClick={(event) => event.stopPropagation()}
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between p-4">
            <h2 className="text-lg font-semibold text-[#110f1a]">
              채팅방 메뉴
            </h2>
          </div>
          
          {/* 대화 상대 정보 */}
          <div className="px-4 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-3">
              {/* 프로필 사진 */}
              <div className="flex-shrink-0">
                {partnerAvatar ? (
                  <img
                    src={partnerAvatar}
                    alt={partnerName}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-gray-200 flex items-center justify-center">
                    <span className="text-lg font-semibold text-gray-500">
                      {partnerName?.charAt(0)?.toUpperCase() || '?'}
                    </span>
                  </div>
                )}
              </div>
              {/* 이름, 아이디 */}
              <div className="flex flex-col min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-[#110f1a] truncate">{partnerName || '알 수 없음'}</span>
                  {isCurrentUserPartner && !subscriberLoading && subscriberInfo && (
                    <button
                      onClick={() => setIsSubscriptionDetailOpen(true)}
                      className={`flex-shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                        subscriberInfo.isSubscribed
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      <Crown className="w-3 h-3" />
                      {subscriberInfo.isSubscribed ? '멤버' : '일반'}
                    </button>
                  )}
                </div>
                {partnerHandle && (
                  <span className="text-sm text-gray-500">@{partnerHandle}</span>
                )}
              </div>
            </div>
          </div>
          
          {/* 메모 섹션 */}
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm text-[#110f1a]">메모</h3>
              {memoSaving && <span className="text-[10px] text-gray-400">저장 중...</span>}
            </div>
            {memoLoading ? (
              <div className="flex items-center justify-center h-12">
                <div className="w-4 h-4 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <textarea
                value={memoBody}
                onChange={handleMemoChange}
                placeholder="상대방에 대한 메모를 남겨보세요"
                className="w-full text-sm text-gray-700 bg-gray-50 rounded-lg p-2.5 resize-none focus:outline-none focus:ring-1 focus:ring-pink-300 placeholder:text-gray-400"
                rows={3}
              />
            )}
          </div>
          
          {/* 미디어 섹션 */}
          <div className="flex-1 p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">미디어</h3>
              {mediaList.length > 0 && (
                <button 
                  onClick={() => setIsAlbumOpen(true)}
                  className="text-xs text-pink-500 font-medium hover:underline"
                >
                  더보기
                </button>
              )}
            </div>
            
            {mediaLoading ? (
              <div className="flex items-center justify-center h-24">
                <div className="w-6 h-6 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : mediaList.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">미디어가 없습니다</p>
            ) : (
              <div className="grid grid-cols-3 gap-1">
                {mediaList.slice(0, 6).map((media) => (
                  <button
                    key={media.id}
                    onClick={() => {
                      setPreviewMedia(getMediaUrl(media))
                      setPreviewType(media.media_type)
                    }}
                    className="aspect-square bg-gray-100 rounded overflow-hidden relative"
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    {media.media_type === 'video' ? (
                      <>
                        {media.thumbnail_url ? (
                          <img
                            src={media.thumbnail_url}
                            alt="video"
                            className="w-full h-full object-cover select-none"
                            draggable={false}
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none'
                            }}
                          />
                        ) : (
                          <div className="w-full h-full bg-gray-300" />
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <div className="w-6 h-6 bg-white/80 rounded-full flex items-center justify-center">
                            <div className="w-0 h-0 border-l-[8px] border-l-black border-y-[5px] border-y-transparent ml-0.5" />
                          </div>
                        </div>
                      </>
                    ) : (
                      <img
                        src={getMediaUrl(media)}
                        alt="media"
                        className="w-full h-full object-cover select-none"
                        draggable={false}
                      />
                    )}
                    {WatermarkOverlay}
                  </button>
                ))}
              </div>
            )}
            
            {/* 퀘스트 버튼 */}
            <div className="mt-6 border-t border-gray-100">
              <button
                onClick={() => setIsQuestModalOpen(true)}
                className="w-full flex items-center justify-between py-3 rounded-lg transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-gray-700">퀘스트 히스토리</span>
                </div>
                <ChevronLeft className="w-5 h-5 text-gray-400 rotate-180" />
              </button>
            </div>
            
            {/* 주문 조회 버튼 */}
            {roomId && (
              <div className="border-t border-gray-100">
                <button
                  onClick={async () => {
                    setIsLoadingOrders(true)
                    setChatRoomOrders([])
                    setIsOrderListOpen(true)
                    try {
                      const response = await storeSchedulesApi.getByChatRoom(roomId)
                      if (response.success && response.data) {
                        setChatRoomOrders(Array.isArray(response.data) ? response.data : (response.data as any).orders || [])
                      }
                    } catch (error) {
                      console.error('주문 조회 실패:', error)
                      toast.error('주문 내역을 불러오는데 실패했습니다.')
                    } finally {
                      setIsLoadingOrders(false)
                    }
                  }}
                  className="w-full flex items-center justify-between py-3 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-gray-700">주문 조회</span>
                  </div>
                  <ChevronLeft className="w-5 h-5 text-gray-400 rotate-180" />
                </button>
              </div>
            )}
          </div>
          
          {/* 하단 회색 박스 - 차단, 신고 버튼 */}
          <div className="flex justify-end bg-gray-100">
            <button
              type="button"
              onClick={onBlock}
              className="flex items-center justify-end gap-1 px-3 py-4 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors border-b border-gray-200 cursor-pointer"
            >
              <Ban className="h-4 w-4" />
              차단
            </button>
            <button
              type="button"
              onClick={onReport}
              className="flex items-center justify-end gap-1 px-3 py-4 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors cursor-pointer"
            >
              <Flag className="h-4 w-4" />
              신고
            </button>
          </div>
        </aside>
      </div>
      
      {/* 주문 조회 모달 */}
      {isOrderListOpen && (
        <div 
          className="fixed inset-0 z-[10000] bg-black/80 flex flex-col"
          onClick={() => setIsOrderListOpen(false)}
        >
          <div className="flex items-center justify-between p-4 text-white">
            <button onClick={() => setIsOrderListOpen(false)} className="p-2">
              <X className="w-6 h-6" />
            </button>
            <h2 className="text-lg font-semibold">주문 내역</h2>
            <div className="w-10" />
          </div>
          <div 
            className="flex-1 overflow-y-auto p-4 bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            {isLoadingOrders ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-pink-500 border-t-transparent" />
              </div>
            ) : chatRoomOrders.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                주문 내역이 없습니다.
              </div>
            ) : (
              <div className="space-y-3">
                {chatRoomOrders.map((order: any) => (
                  <div 
                    key={order.order_id || order.id}
                    className="p-4 border border-gray-200 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {order.product?.thumbnail_url && (
                        <img 
                          src={order.product.thumbnail_url} 
                          alt={order.product.name}
                          className="w-16 h-16 rounded-lg object-cover"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">
                          {order.product?.name || '상품명 없음'}
                        </p>
                        <p className="text-sm text-gray-500">
                          {order.quantity || 1}개 · {(order.total_amount || 0).toLocaleString()}P
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {order.created_at ? new Date(order.created_at).toLocaleDateString('ko-KR') : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          order.status === 'paid' ? 'bg-blue-100 text-blue-700' :
                          order.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                          order.status === 'shipped' ? 'bg-purple-100 text-purple-700' :
                          order.status === 'delivered' ? 'bg-green-100 text-green-700' :
                          order.status === 'completed' ? 'bg-gray-100 text-gray-700' :
                          order.status === 'confirmed' ? 'bg-emerald-100 text-emerald-700' :
                          order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                          order.status === 'refund_requested' ? 'bg-orange-100 text-orange-700' :
                          order.status === 'refunded' ? 'bg-gray-100 text-gray-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {order.status === 'paid' ? '결제완료' :
                           order.status === 'pending' ? '결제대기' :
                           order.status === 'shipped' ? '배송중' :
                           order.status === 'delivered' ? '배송완료' :
                           order.status === 'completed' ? '수령완료' :
                           order.status === 'confirmed' ? '구매확정' :
                           order.status === 'cancelled' ? '취소됨' :
                           order.status === 'refund_requested' ? '환불요청' :
                           order.status === 'refunded' ? '환불완료' :
                           order.status || '상태없음'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* 앨범 모달 */}
      {isAlbumOpen && (
        <div 
          className="fixed inset-0 z-[10000] bg-black/80 flex flex-col"
          onClick={() => setIsAlbumOpen(false)}
        >
          <div className="flex items-center justify-between p-4 text-white">
            <button onClick={() => setIsAlbumOpen(false)} className="p-2">
              <X className="w-6 h-6" />
            </button>
            <h2 className="text-lg font-semibold">앨범</h2>
            <div className="w-10" />
          </div>
          <div 
            className="flex-1 overflow-y-auto p-2"
            onClick={(e) => e.stopPropagation()}
            onScroll={(e) => {
              const target = e.target as HTMLDivElement
              const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight
              if (scrollBottom < 200 && hasMoreMedia && !albumLoading) {
                loadMoreAlbumMedia()
              }
            }}
          >
            <div className="grid grid-cols-3 gap-1">
              {allMedia.map((media, index) => (
                <button
                  key={`${media.id}-${index}`}
                  onClick={() => {
                    setPreviewMedia(getMediaUrl(media))
                    setPreviewType(media.media_type)
                    setPreviewIndex(index)
                  }}
                  className="aspect-square bg-gray-800 rounded overflow-hidden relative"
                  onContextMenu={(e) => e.preventDefault()}
                >
                  {media.media_type === 'video' ? (
                    <>
                      {media.thumbnail_url ? (
                        <img
                          src={media.thumbnail_url}
                          alt="video"
                          className="w-full h-full object-cover select-none"
                          draggable={false}
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none'
                          }}
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-500" />
                      )}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <div className="w-8 h-8 bg-white/80 rounded-full flex items-center justify-center">
                          <div className="w-0 h-0 border-l-[10px] border-l-black border-y-[6px] border-y-transparent ml-0.5" />
                        </div>
                      </div>
                    </>
                  ) : (
                    <img
                      src={getMediaUrl(media)}
                      alt="media"
                      className="w-full h-full object-cover select-none"
                      draggable={false}
                    />
                  )}
                  {WatermarkOverlay}
                </button>
              ))}
            </div>
            {/* 로딩 인디케이터 */}
            {albumLoading && (
              <div className="flex justify-center py-4">
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* 미디어 프리뷰 */}
      {previewMedia && (
        <motion.div 
          className="fixed inset-0 z-[10001] flex items-center justify-center"
          style={{ backgroundColor: previewOpacity.get() === 1 ? 'black' : `rgba(0, 0, 0, ${previewOpacity.get()})` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => setPreviewMedia(null)}
          onContextMenu={(e) => e.preventDefault()}
        >
          <motion.div style={{ opacity: previewOpacity }} className="fixed inset-0 bg-black" />
          {/* 닫기 버튼 */}
          <button 
            className="absolute top-4 right-4 p-2 text-white hover:bg-white/20 rounded-full transition-colors z-20"
            onClick={() => setPreviewMedia(null)}
          >
            <X className="w-8 h-8" />
          </button>
          
          {/* 이전/다음 화살표 버튼 */}
          {previewIndex > 0 && allMedia.length > 0 && (
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 p-3 text-white bg-black/40 hover:bg-black/60 rounded-full transition-colors z-20"
              onClick={(e) => { e.stopPropagation(); goToPrevMedia(); }}
            >
              <ChevronLeft className="w-8 h-8" />
            </button>
          )}
          {previewIndex < allMedia.length - 1 && allMedia.length > 0 && (
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 p-3 text-white bg-black/40 hover:bg-black/60 rounded-full transition-colors z-20"
              onClick={(e) => { e.stopPropagation(); goToNextMedia(); }}
            >
              <ChevronLeft className="w-8 h-8 rotate-180" />
            </button>
          )}
          
          {previewType === 'video' ? (
            <motion.div 
              className="relative w-full h-full flex items-center justify-center"
              style={{ x: previewX, y: previewY, scale: previewScale }}
              initial={{ scale: 1, opacity: 1 }}
              drag
              dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }}
              dragElastic={0.9}
              onDragEnd={handlePreviewDragEnd}
            >
              {/* 음소거 버튼 */}
              <button
                className="absolute top-4 left-4 p-2 text-white hover:bg-white/20 rounded-full transition-colors z-20"
                onClick={toggleVideoMute}
              >
                {isVideoMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
              </button>
              
              {/* 비디오 */}
              <video
                ref={videoPreviewRef}
                src={previewMedia}
                className={`max-w-full max-h-full object-contain select-none ${!isPageVisible ? 'blur-xl' : ''}`}
                onClick={toggleVideoPlay}
                onTimeUpdate={handleVideoTimeUpdate}
                onLoadedMetadata={handleVideoLoadedMetadata}
                onEnded={() => setIsVideoPlaying(false)}
                playsInline
                autoPlay
                muted={isVideoMuted}
              />
              
              {/* 재생/일시정지 오버레이 */}
              {!isVideoPlaying && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="bg-black/50 rounded-full p-4">
                    <Play className="w-12 h-12 text-white" fill="white" />
                  </div>
                </div>
              )}
              
              {/* 하단 컨트롤 바 */}
              <div 
                className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 z-10"
                onClick={(e) => e.stopPropagation()}
              >
                {/* 진행바 */}
                <div 
                  className="w-full h-1 bg-white/30 rounded-full cursor-pointer mb-3"
                  onClick={handleProgressClick}
                >
                  <div 
                    className="h-full bg-white rounded-full transition-all"
                    style={{ width: videoDuration > 0 ? `${(videoProgress / videoDuration) * 100}%` : '0%' }}
                  />
                </div>
                
                {/* 컨트롤 버튼들 */}
                <div className="flex items-center justify-between">
                  <button
                    className="p-2 text-white hover:bg-white/20 rounded-full transition-colors"
                    onClick={toggleVideoPlay}
                  >
                    {isVideoPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
                  </button>
                  
                  <span className="text-white text-sm">
                    {formatVideoTime(videoProgress)} / {formatVideoTime(videoDuration)}
                  </span>
                </div>
              </div>
              
              {/* 워터마크 */}
              {PreviewWatermarkOverlay}
            </motion.div>
          ) : (
            <motion.div 
              className="relative w-full h-full flex items-center justify-center"
              style={{ x: previewX, y: previewY, scale: previewScale }}
              initial={{ scale: 1, opacity: 1 }}
              drag
              dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }}
              dragElastic={0.9}
              onDragEnd={handlePreviewDragEnd}
            >
              <img
                src={previewMedia}
                alt="preview"
                className={`max-w-full max-h-full object-contain select-none transition-all duration-300 ${!isPageVisible ? 'blur-xl' : ''}`}
                draggable={false}
                onClick={(e) => e.stopPropagation()}
              />
              {/* 워터마크 */}
              {PreviewWatermarkOverlay}
            </motion.div>
          )}
        </motion.div>
      )}
      
      {/* 퀘스트 목록 모달 */}
      {isQuestModalOpen && (
        <div 
          className="fixed inset-0 z-[10000] bg-black/80 flex flex-col"
          onClick={() => setIsQuestModalOpen(false)}
        >
          <div className="flex items-center justify-between p-4 text-white">
            <button onClick={() => setIsQuestModalOpen(false)} className="p-2">
              <X className="w-6 h-6" />
            </button>
            <h2 className="text-lg font-semibold">퀘스트 히스토리</h2>
            <div className="w-10" />
          </div>
          
          {/* 필터 탭 */}
          <div className="flex gap-2 px-4 pb-3" onClick={(e) => e.stopPropagation()}>
            {([
              { key: 'all', label: '전체' },
              { key: 'pending', label: '수락 대기' },
              { key: 'in_progress', label: '진행중' },
              { key: 'completed', label: '완료' },
            ] as { key: QuestFilter; label: string }[]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setQuestFilter(tab.key)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  questFilter === tab.key
                    ? 'bg-pink-500 text-white'
                    : 'bg-white/20 text-white/70 hover:bg-white/30'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          
          {/* 퀘스트 목록 */}
          <div 
            className="flex-1 overflow-y-auto px-4 pb-4"
            onClick={(e) => e.stopPropagation()}
          >
            {questLoading ? (
              <div className="flex items-center justify-center py-10">
                <div className="w-8 h-8 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredQuests.length === 0 ? (
              <div className="text-center py-10 text-white/60">
                퀘스트가 없습니다
              </div>
            ) : (
              <div className="space-y-3">
                {filteredQuests.map((quest) => {
                  // 내가 보낸 퀘스트인지 확인 (client.id === currentUserId)
                  const isSentByMe = quest.client?.id === currentUserId
                  // 진행 중인지 확인
                  const isInProgress = quest.status === 'in_progress'
                  // 경과 시간 계산 (questHistoryNow 사용으로 실시간 업데이트)
                  const getElapsedTime = () => {
                    if (!isInProgress || !quest.updated_at) return null
                    const startTime = new Date(quest.updated_at).getTime()
                    const elapsed = Math.max(0, Math.floor((questHistoryNow - startTime) / 1000))
                    const hours = Math.floor(elapsed / 3600)
                    const mins = Math.floor((elapsed % 3600) / 60)
                    const secs = elapsed % 60
                    if (hours > 0) return `${hours}시간 ${mins}분`
                    return `${mins}분 ${secs}초`
                  }
                  
                  return (
                    <div 
                      key={quest.id}
                      className={`flex ${isSentByMe ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`bg-white rounded-lg p-4 max-w-[85%] ${isSentByMe ? 'rounded-br-none' : 'rounded-bl-none'}`}>
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <h3 className="font-semibold text-gray-800">{quest.job?.job_name || quest.request_type || '퀘스트'}</h3>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${getStatusColor(quest.status)}`}>
                            {getStatusLabel(quest.status)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">
                            {(quest.coins_per_job || 0).toLocaleString()}P × {quest.job_count}회
                          </span>
                          <span className="font-semibold text-pink-500">
                            {quest.total_coins.toLocaleString()}P
                          </span>
                        </div>
                        <div className="mt-2 text-xs text-gray-400">
                          {new Date(quest.created_at).toLocaleDateString('ko-KR', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                        
                        {/* 진행중일 때 경과 시간 표시 */}
                        {isInProgress && (
                          <div className="mt-2 flex items-center gap-1.5 text-sm text-pink-600">
                            <img src="/icon/stop-watch.png" alt="" className="h-4 w-4" />
                            <span className="font-medium">{getElapsedTime()}</span>
                          </div>
                        )}
                        
                        {/* 수락 대기 상태 + 내가 받은 퀘스트일 때만 수락/거절 버튼 */}
                        {quest.status === 'pending' && !isSentByMe && quest.partner?.member_id === currentUserId && (
                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={() => handleRejectQuest(quest.id)}
                              disabled={questActionLoading === quest.id}
                              className="flex-1 py-2 px-3 rounded-lg border border-gray-300 text-gray-600 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
                            >
                              거절
                            </button>
                            <button
                              onClick={() => handleAcceptQuest(quest.id)}
                              disabled={questActionLoading === quest.id}
                              className="flex-1 py-2 px-3 rounded-lg bg-pink-500 text-white text-sm font-medium hover:bg-pink-600 disabled:opacity-50 transition-colors"
                            >
                              {questActionLoading === quest.id ? '처리중...' : '수락'}
                            </button>
                          </div>
                        )}
                        
                        {/* 진행중 + 내가 받은 퀘스트일 때 완료 버튼 */}
                        {isInProgress && !isSentByMe && quest.partner?.member_id === currentUserId && (
                          <div className="mt-3">
                            <button
                              onClick={() => handleCompleteQuest(quest.id)}
                              disabled={questActionLoading === quest.id}
                              className="w-full py-2 px-3 rounded-lg bg-[#FE3A8F] text-white text-sm font-medium hover:bg-pink-600 disabled:opacity-50 transition-colors"
                            >
                              {questActionLoading === quest.id ? '처리중...' : '완료'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* 구독 상세 슬라이드 시트 */}
      <SlideSheet
        isOpen={isSubscriptionDetailOpen}
        onClose={() => setIsSubscriptionDetailOpen(false)}
        title="멤버십 정보"
        initialHeight={0.4}
        minHeight={0.25}
        maxHeight={0.55}
        zIndex={10001}
      >
        <div className="px-5 pt-2 pb-4">
          <p className="text-xs text-gray-500 mb-4">{partnerName}</p>
          {subscriberInfo?.isSubscribed && subscriberInfo.subscription ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-500" />
                <span className="font-semibold text-[#110f1a]">
                  {subscriberInfo.subscription.membership_name || '멤버십'}
                </span>
              </div>
              <div className="space-y-2 text-sm">
                {subscriberInfo.subscription.monthly_price != null && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">월 구독료</span>
                    <span className="font-medium">{subscriberInfo.subscription.monthly_price.toLocaleString()}P</span>
                  </div>
                )}
                {subscriberInfo.subscription.started_at && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">시작일</span>
                    <span className="font-medium">{subscriberInfo.subscription.started_at}</span>
                  </div>
                )}
                {subscriberInfo.subscription.expired_at && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">만료일</span>
                    <span className="font-medium">{subscriberInfo.subscription.expired_at}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">자동 갱신</span>
                  <span className="font-medium">{subscriberInfo.subscription.auto_renewal_enabled ? '사용' : '미사용'}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-2">
                <Crown className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-sm text-gray-500">구독 중인 멤버십이 없습니다</p>
            </div>
          )}
        </div>
      </SlideSheet>
    </>
  )
}

interface FeedMobileMenuProps {
  isOpen: boolean
  onClose: () => void
  feedFilter: FeedCategory
  onFilterChange: (value: FeedCategory) => void
}

export function FeedMobileMenu({ isOpen, onClose, feedFilter, onFilterChange }: FeedMobileMenuProps) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [isChargeModalOpen, setIsChargeModalOpen] = useState(false)
  const [partnerListSheetMode, setPartnerListSheetMode] = useState<'subscriptions' | 'following' | null>(null)
  
  const { data: pointsData, isLoading: pointsLoading, refetch: refetchPoints, isFetching: pointsFetching } = useQuery({
    queryKey: ['user-points', user?.id],
    queryFn: async () => {
      if (!user?.id) return null
      const response = await mateYouApi.auth.getMe()
      return (response.data as any)?.data
    },
    enabled: !!user?.id,
    staleTime: 1000 * 30,
  })

  const pointsList = [
    {
      label: '일반 포인트',
      value: pointsData?.total_points ?? 0,
      key: 'total_points',
    },
    {
      label: '파트너 수익 포인트',
      value: pointsData?.partner_points ?? 0,
      key: 'partner_points',
    },
    {
      label: '스토어 포인트',
      value: pointsData?.store_points ?? 0,
      key: 'store_points',
    },
    {
      label: '협업 스토어 포인트',
      value: pointsData?.collaboration_store_points ?? 0,
      key: 'collaboration_store_points',
    },
  ]
  
  const profileName = user?.name || user?.username || '로그인이 필요합니다'
  const profileHandle = user ? `@${user.member_code || user.username || 'me'}` : '@guest'
  const profilePoints =
    typeof user?.total_points === 'number'
      ? `${user.total_points.toLocaleString('ko-KR')}P`
      : '0P'
  // 역할에 따른 한글 뱃지 및 색상
  const getRoleBadge = () => {
    const role = user?.role
    if (role === 'admin') {
      return { label: '관리자', bgColor: 'bg-[#FE3A8F]', textColor: 'text-white' }
    }
    if (role === 'partner') {
      return { label: '파트너', bgColor: 'bg-[#FF7EB3]', textColor: 'text-white' }
    }
    return { label: '일반', bgColor: 'bg-[#FFD4E5]', textColor: 'text-[#FE3A8F]' }
  }
  const roleBadge = getRoleBadge()
  const profileInitial = profileName.trim().charAt(0).toUpperCase() || 'M'
  const profileImage =
    user?.profile_image || (user as { avatar_url?: string } | undefined)?.avatar_url || ''

  const handleCharge = async () => {
    try {
      // 실제 충전 로직 구현
      setIsChargeModalOpen(false)
    } catch (error) {}
  }

  const quickLinks = [
    { 
      label: '포인트', 
      icon: <Wallet className="h-4 w-4" />,
      action: () => {
        setIsChargeModalOpen(true)
        onClose()
      },
    },
    { 
      label: '컬렉션', 
      icon: <Bookmark className="h-4 w-4" />,
      action: () => {
        navigate({ to: '/mypage/saved' })
        onClose()
      },
    },
    { 
      label: '멤버쉽', 
      icon: <Crown className="h-4 w-4" />,
      action: () => {
        setPartnerListSheetMode('subscriptions')
        onClose()
      },
    },
    { 
      label: '구매 항목', 
      icon: <ShoppingBag className="h-4 w-4" />,
      action: () => {
        navigate({ to: '/mypage/purchases' })
        onClose()
      },
    },
  ]

  return (
    <div
      id="feed-mobile-menu-container"
      className={`fixed inset-0 z-[9999] ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
      onClick={onClose}
    >
      <div id="feed-mobile-menu-overlay" className={`absolute inset-0 bg-black transition-opacity ${isOpen ? 'opacity-40' : 'opacity-0'}`} />
      <aside
        id="feed-mobile-menu-aside"
        className={`absolute inset-y-0 left-0 w-72 bg-white p-4 transition-transform duration-300 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          paddingTop: '1rem',
          paddingBottom: '1rem',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          {profileImage ? (
            <img
              src={profileImage}
              alt={profileName}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#ffb3b8] text-sm font-semibold text-white">
              {profileInitial}
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-[#110f1a]">{profileName}</p>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${roleBadge.bgColor} ${roleBadge.textColor}`}>
                {roleBadge.label}
              </span>
            </div>
            <p className="text-xs text-gray-400">{profileHandle}</p>
          </div>
        </div>
        <div className="mt-4 points-swiper-container [&_.swiper-pagination]:pointer-events-none">
          <Swiper
            modules={[Pagination]}
            pagination={{ clickable: false }}
            spaceBetween={8}
            slidesPerView={1}
            className="points-swiper"
            style={{ '--swiper-pagination-color': '#9ca3af', '--swiper-pagination-bullet-inactive-color': '#d1d5db' } as React.CSSProperties}
          >
            {pointsList.map((point) => (
              <SwiperSlide key={point.key}>
                <div className="rounded-2xl bg-[#110f1a] px-4 py-3 text-white relative">
                  <button
                    onClick={() => refetchPoints()}
                    disabled={pointsFetching}
                    className="absolute top-3 right-3 p-1 rounded-full hover:bg-white/10 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`h-4 w-4 ${pointsFetching ? 'animate-spin' : ''}`} />
                  </button>
                  <p className="text-xs opacity-70">{point.label}</p>
                  <p className="text-lg font-semibold">
                    {pointsLoading ? '...' : `${point.value.toLocaleString('ko-KR')}P`}
                  </p>
                </div>
              </SwiperSlide>
            ))}
          </Swiper>
        </div>

        <div className="mt-6 space-y-3">
          <div className="flex gap-2">
            {(['following', 'subscription'] as Array<FeedCategory>).map((category) => (
              <button
                key={category}
                className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold ${
                  feedFilter === category
                    ? 'bg-[#110f1a] text-white'
                    : 'bg-gray-100 text-gray-500'
                }`}
                onClick={() => onFilterChange(category)}
              >
                {category === 'following' ? '팔로잉' : '구독'}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 space-y-3">
          <div>
            {quickLinks.map((link) => (
              <button
                key={link.label}
                type="button"
                onClick={link.action}
                className="w-full flex items-center gap-2 border-b border-gray-100 px-3 py-4 text-sm font-semibold text-[#110f1a] hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <span className="rounded-full bg-gray-100 p-2 text-[#110f1a]">{link.icon}</span>
                {link.label}
              </button>
            ))}
          </div>
        </div>

        {/* 웹 전용: 개인정보처리방침, 이용약관 링크 (네이티브에서는 숨김) */}
        {!Capacitor.isNativePlatform() && (
          <div className="absolute bottom-4 left-4 right-4 flex items-center justify-center gap-4 text-xs text-gray-400">
            <Link
              to="/privacy"
              onClick={onClose}
              className="hover:text-gray-600 hover:underline"
            >
              개인정보처리방침
            </Link>
            <span>|</span>
            <Link
              to="/terms"
              onClick={onClose}
              className="hover:text-gray-600 hover:underline"
            >
              이용약관
            </Link>
          </div>
        )}
      </aside>

      {/* 모달 및 시트 */}
      <ChargeModal
        isOpen={isChargeModalOpen}
        onClose={() => setIsChargeModalOpen(false)}
        onCharge={handleCharge}
      />

      {partnerListSheetMode && (
        <PartnerListSheet
          mode={partnerListSheetMode}
          isOpen={Boolean(partnerListSheetMode)}
          onClose={() => setPartnerListSheetMode(null)}
        />
      )}
    </div>
  )
}

interface NavigationProps {
  variant?: 'fixed' | 'relative'
}

export function Navigation({ variant = 'fixed' }: NavigationProps) {
  const { isMobile } = useDevice()
  const navigate = useNavigate()
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname
  const currentSearch = routerState.location.search || ''
  const { user } = useAuth()
  const { isPartnerManager, isPartnerPlus } = useTimesheetRole()
  const { totalUnreadCount } = useGlobalRealtime()
  const cartItemCount = useCartStore((state) => state.getTotalItems())
  const { completeRequest } = usePartnerRequests()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const isMobileMenuOpenRef = useRef(false)

  useEffect(() => { isMobileMenuOpenRef.current = isMobileMenuOpen }, [isMobileMenuOpen])

  // /feed/all 모바일: 어디서든 오른쪽 스와이프 → FeedMobileMenu 열기 (손가락 따라 이동)
  useEffect(() => {
    if (!isMobile || !currentPath.startsWith('/feed/all')) return

    const MENU_WIDTH = 288 // w-72
    const THRESHOLD = MENU_WIDTH * 0.3

    const drag = { startX: 0, startY: 0, currentX: 0, active: false, locked: false, horizontal: false }

    const getEls = () => ({
      aside: document.getElementById('feed-mobile-menu-aside'),
      overlay: document.getElementById('feed-mobile-menu-overlay'),
      container: document.getElementById('feed-mobile-menu-container'),
    })

    const onTouchStart = (e: TouchEvent) => {
      if (isMobileMenuOpenRef.current) return
      const target = e.target as HTMLElement
      if (target.closest('[data-feed-carousel]')) return

      drag.startX = e.touches[0].clientX
      drag.startY = e.touches[0].clientY
      drag.currentX = drag.startX
      drag.active = true
      drag.locked = false
      drag.horizontal = false
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!drag.active) return
      const tx = e.touches[0].clientX
      const ty = e.touches[0].clientY
      drag.currentX = tx
      const dx = tx - drag.startX
      const dy = ty - drag.startY

      if (!drag.locked) {
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
          drag.locked = true
          drag.horizontal = Math.abs(dx) > Math.abs(dy) && dx > 0
          if (!drag.horizontal) { drag.active = false; return }
        } else { return }
      }
      if (!drag.horizontal) return

      e.preventDefault()
      const offset = Math.max(0, Math.min(dx, MENU_WIDTH))
      const progress = offset / MENU_WIDTH
      const { aside, overlay, container } = getEls()
      if (aside) { aside.style.transition = 'none'; aside.style.translate = `${-MENU_WIDTH + offset}px 0` }
      if (overlay) { overlay.style.transition = 'none'; overlay.style.opacity = String(progress * 0.4) }
      if (container) container.style.pointerEvents = offset > 0 ? 'auto' : 'none'
    }

    const onTouchEnd = () => {
      if (!drag.active || !drag.horizontal) { drag.active = false; return }
      drag.active = false

      const dx = drag.currentX - drag.startX
      const shouldOpen = dx > THRESHOLD
      const { aside, overlay, container } = getEls()

      if (shouldOpen) {
        if (aside) { aside.style.transition = 'translate 0.25s ease-out'; aside.style.translate = '0 0' }
        if (overlay) { overlay.style.transition = 'opacity 0.25s ease-out'; overlay.style.opacity = '0.4' }
        setTimeout(() => {
          [aside, overlay, container].forEach(el => { if (el) { el.style.transition = ''; el.style.translate = ''; el.style.opacity = ''; el.style.pointerEvents = '' } })
          setIsMobileMenuOpen(true)
        }, 260)
      } else {
        if (aside) { aside.style.transition = 'translate 0.25s ease-out'; aside.style.translate = '-100% 0' }
        if (overlay) { overlay.style.transition = 'opacity 0.25s ease-out'; overlay.style.opacity = '0' }
        setTimeout(() => {
          [aside, overlay, container].forEach(el => { if (el) { el.style.transition = ''; el.style.translate = ''; el.style.opacity = ''; el.style.pointerEvents = '' } })
        }, 260)
      }
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd)
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [isMobile, currentPath])
  const [feedFilter, setFeedFilter] = useState<FeedCategory>(() =>
    typeof window !== 'undefined' &&
    (window.location.pathname.startsWith('/feed/subscribe') || window.location.pathname.startsWith('/membership'))
      ? 'subscription'
      : 'following',
  )
  const [feedCreatePage, setFeedCreatePage] = useState<1 | 2>(1)
  const [chatHeaderPartner, setChatHeaderPartner] = useState<{
    id: string
    name: string
    avatar: string | null
    isPartner?: boolean
    memberCode?: string | null
    isCsRoom?: boolean
  } | null>(null)
  const [chatRoomId, setChatRoomId] = useState<string | null>(null)
  
  // 채팅 프로필 드롭다운 상태
  const [showChatProfileDropdown, setShowChatProfileDropdown] = useState(false)
  const chatProfileDropdownRef = useRef<HTMLDivElement>(null)
  
  // 확인하지 않은 공지 상태
  const [hasUnreadNotice, setHasUnreadNotice] = useState(false)
  
  // 확인하지 않은 공지 체크
  useEffect(() => {
    const checkUnreadNotice = async () => {
      try {
        const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
        
        // 인증 토큰 가져오기
        const { data: { session } } = await supabase.auth.getSession()
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        }
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`
        }
        
        const response = await fetch(
          `${EDGE_FUNCTIONS_URL}/functions/v1/api-notice?page=1`,
          {
            method: 'GET',
            headers,
          }
        )
        
        const result = await response.json()
        
        if (result.success && Array.isArray(result.data) && result.data.length > 0) {
          // 가장 최신 공지 날짜 찾기
          const latestNotice = result.data.reduce((latest: any, notice: any) => {
            if (!latest || new Date(notice.created_at) > new Date(latest.created_at)) {
              return notice
            }
            return latest
          }, null)
          
          if (!latestNotice) {
            setHasUnreadNotice(false)
            return
          }
          
          const lastCheckedTime = localStorage.getItem('lastNoticeCheckedTime')
          
          if (!lastCheckedTime || new Date(latestNotice.created_at) > new Date(lastCheckedTime)) {
            setHasUnreadNotice(true)
          } else {
            setHasUnreadNotice(false)
          }
        } else {
          setHasUnreadNotice(false)
        }
      } catch (error) {
        console.error('Failed to check unread notice:', error)
      }
    }
    
    checkUnreadNotice()
    
    // 공지 확인 이벤트 리스너 추가
    const handleNoticeChecked = () => {
      setHasUnreadNotice(false)
    }
    
    window.addEventListener('noticeChecked', handleNoticeChecked)
    return () => {
      window.removeEventListener('noticeChecked', handleNoticeChecked)
    }
  }, [])
  
  // 채팅 더보기 오른쪽 슬라이드 메뉴 상태
  const [showChatRightSlideMenu, setShowChatRightSlideMenu] = useState(false)

  useEffect(() => {
    const handleOpenChatRightMenu = () => setShowChatRightSlideMenu(true)
    window.addEventListener('open-chat-right-menu', handleOpenChatRightMenu)
    return () => window.removeEventListener('open-chat-right-menu', handleOpenChatRightMenu)
  }, [])

  // 후원 모달 상태
  const [isDonationModalOpen, setIsDonationModalOpen] = useState(false)
  
  // 신고 모달 상태
  const [isReportModalOpen, setIsReportModalOpen] = useState(false)
  
  // 채팅 공지 모달 상태
  const [isChatNoticeModalOpen, setIsChatNoticeModalOpen] = useState(false)
  const [myNotice, setMyNotice] = useState<{ id: string; content: string } | null>(null)
  const [noticeContent, setNoticeContent] = useState('')
  const [isNoticeSubmitting, setIsNoticeSubmitting] = useState(false)
  
  // 채팅 설정 상태 (파트너용)
  const [isChatSettingsOpen, setIsChatSettingsOpen] = useState(false)
  const [chatFreeMessageCount, setChatFreeMessageCount] = useState<number>(0)
  const [chatPrice, setChatPrice] = useState<number>(100)
  const [chatMemberships, setChatMemberships] = useState<Array<{
    id: string
    name: string
    paid_message_quota: number
  }>>([])
  const [isChatSettingsLoading, setIsChatSettingsLoading] = useState(false)
  const [isChatSettingsSaving, setIsChatSettingsSaving] = useState(false)
  
  // 진행중 퀘스트 상태 및 팝업
  const [inProgressQuests, setInProgressQuests] = useState<Array<{
    id: string
    job_name: string | null
    job_count: number
    total_coins: number
    status: string
    partner_member_id: string | null
    client_id: string | null
    updated_at: string | null
  }>>([])
  const [isQuestPopupOpen, setIsQuestPopupOpen] = useState(false)
  const [questTab, setQuestTab] = useState<'mine' | 'partner'>('mine')
  const [areBothPartners, setAreBothPartners] = useState(false)
  const [questTimerNow, setQuestTimerNow] = useState(Date.now())
  
  // 퀘스트 팝업 타이머 업데이트 (1초마다)
  useEffect(() => {
    if (inProgressQuests.length === 0 || !isQuestPopupOpen) return
    const timer = setInterval(() => setQuestTimerNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [inProgressQuests.length, isQuestPopupOpen])
  
  // 경과 시간 포맷 함수
  const formatElapsedTime = (updatedAt: string | null): string => {
    if (!updatedAt) return '00:00'
    const startTime = new Date(updatedAt).getTime()
    const elapsed = Math.max(0, Math.floor((questTimerNow - startTime) / 1000))
    const hours = Math.floor(elapsed / 3600)
    const mins = Math.floor((elapsed % 3600) / 60)
    const secs = elapsed % 60
    if (hours > 0) {
      return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    }
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  // 스트림 생성 시트 상태
  const [isCreateStreamSheetOpen, setIsCreateStreamSheetOpen] = useState(false)

  // 파트너 페이지 더보기 드롭다운 상태
  const [showPartnerMoreDropdown, setShowPartnerMoreDropdown] = useState(false)
  const partnerMoreDropdownRef = useRef<HTMLDivElement>(null)
  
  // 스크롤 상태 및 파트너 이름 (파트너 페이지 헤더용) - useUIStore에서 가져옴
  const isScrolled = useUIStore((state) => state.isPartnerPageScrolled)
  const partnerHeaderName = useUIStore((state) => state.partnerHeaderName)
  const openRankingSheet = useUIStore((state) => state.openRankingSheet)
  
  // 앨범 상세 페이지 타이틀 (이벤트로 수신)
  const [albumDetailTitle, setAlbumDetailTitle] = useState<string>('')
  
  // 앨범 피드 뷰 상태 (이벤트로 수신)
  const [albumFeedViewState, setAlbumFeedViewState] = useState<{
    isOpen: boolean
    title?: string
  }>({ isOpen: false })
  
  // 앨범 타이틀 변경 이벤트 수신
  useEffect(() => {
    const handleAlbumTitleChange = (event: CustomEvent<{ title: string }>) => {
      setAlbumDetailTitle(event.detail.title)
    }
    
    window.addEventListener('setAlbumHeaderTitle', handleAlbumTitleChange as EventListener)
    return () => {
      window.removeEventListener('setAlbumHeaderTitle', handleAlbumTitleChange as EventListener)
    }
  }, [])
  
  // 앨범 피드 뷰 상태 변경 이벤트 수신
  useEffect(() => {
    const handleFeedViewStateChange = (event: CustomEvent<{ isOpen: boolean; title?: string }>) => {
      setAlbumFeedViewState(event.detail)
    }
    
    window.addEventListener('setAlbumFeedViewState', handleFeedViewStateChange as EventListener)
    return () => {
      window.removeEventListener('setAlbumFeedViewState', handleFeedViewStateChange as EventListener)
    }
  }, [])

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (chatProfileDropdownRef.current && !chatProfileDropdownRef.current.contains(event.target as Node)) {
        setShowChatProfileDropdown(false)
      }
      if (partnerMoreDropdownRef.current && !partnerMoreDropdownRef.current.contains(event.target as Node)) {
        setShowPartnerMoreDropdown(false)
      }
    }
    
    if (showChatProfileDropdown || showPartnerMoreDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showChatProfileDropdown, showPartnerMoreDropdown])
  

  // 차단 처리 함수
  const handleBlockUser = async (memberCodeToBlock: string, userName: string) => {
    if (!user?.id) return
    
    const confirmed = confirm(`${userName}님을 차단하시겠습니까?\n\n차단하면 해당 사용자가 내 프로필을 볼 수 없습니다.`)
    if (!confirmed) return

    try {
      const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData?.session?.access_token
      
      const response = await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/api-blocks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ blocked_member_code: memberCodeToBlock }),
      })
      
      const result = await response.json()
      
      if (result.success) {
        alert(`${userName}님을 차단했습니다.`)
        setShowChatProfileDropdown(false)
        setShowPartnerMoreDropdown(false)
        // 채팅 목록으로 이동
        navigate({ to: '/chat', search: {} })
      } else {
        alert(result.error || '차단에 실패했습니다.')
      }
    } catch (error) {
      console.error('차단 실패:', error)
      alert('차단에 실패했습니다.')
    }
  }

  // 파트너 온라인 상태 (파트너 대시보드용)
  const [isPartnerOnline, setIsPartnerOnline] = useState(false)
  const [isTogglingOnline, setIsTogglingOnline] = useState(false)

  // 파트너 온라인 상태 초기화 (members.current_status 사용)
  useEffect(() => {
    if (!currentPath.startsWith('/dashboard/partner') && !currentPath.startsWith('/partner/dashboard')) return
    if (!user?.id) return

    const fetchOnlineStatus = async () => {
      const { data } = await supabase
        .from('members')
        .select('current_status')
        .eq('id', user.id)
        .single() as { data: { current_status: string } | null }
      
      if (data) {
        setIsPartnerOnline(data.current_status === 'online')
      }
    }
    
    fetchOnlineStatus()
  }, [currentPath, user?.id])

  const handleToggleOnlineStatus = async () => {
    if (!user?.id || isTogglingOnline) return
    
    setIsTogglingOnline(true)
    const newStatus = !isPartnerOnline
    
    try {
      const { error } = await (supabase as any)
        .from('members')
        .update({ current_status: newStatus ? 'online' : 'offline' })
        .eq('id', user.id)
      
      if (error) throw error
      
      setIsPartnerOnline(newStatus)
    } catch (error) {
      console.error('온라인 상태 변경 실패:', error)
    } finally {
      setIsTogglingOnline(false)
    }
  }

  // /feed/create 페이지 상태 감지
  useEffect(() => {
    if (!currentPath.startsWith('/feed/create')) {
      setFeedCreatePage(1)
      return
    }

    // 초기 페이지 상태 확인
    if (typeof window !== 'undefined' && (window as any).__feedCreateCurrentPage) {
      setFeedCreatePage((window as any).__feedCreateCurrentPage)
    }

    // 페이지 변경 이벤트 리스너
    const handlePageChange = (e: CustomEvent) => {
      setFeedCreatePage(e.detail.page)
    }
    window.addEventListener('feedCreatePageChange', handlePageChange as EventListener)

    return () => {
      window.removeEventListener('feedCreatePageChange', handlePageChange as EventListener)
    }
  }, [currentPath])

  useEffect(() => {
    if (currentPath.startsWith('/feed/subscribe') || currentPath.startsWith('/membership')) {
      setFeedFilter('subscription')
    } else if (
      currentPath.startsWith('/feed') ||
      currentPath.startsWith('/explore') ||
      currentPath.startsWith('/search') ||
      currentPath.startsWith('/notifications') ||
      currentPath.startsWith('/chat')
    ) {
      setFeedFilter('following')
    }
  }, [currentPath])

  // /chat?partnerId= 또는 /chat?chatRoomId= 헤더 정보 동기화
  useEffect(() => {
    if (!currentPath.startsWith('/chat')) {
      setChatHeaderPartner(null)
      return
    }

    const searchParams = new URLSearchParams(currentSearch)
    const partnerIdParam = searchParams.get('partnerId')
    const chatRoomIdParam = searchParams.get('chatRoomId')
    const partnerNameParam = searchParams.get('partnerName')
    const decodedPartnerName = partnerNameParam
      ? decodeURIComponent(partnerNameParam)
      : ''

    // CS 문의방 (chatRoomId만 있고 partnerId가 없는 경우)
    if (chatRoomIdParam && !partnerIdParam) {
      setChatHeaderPartner({
        id: chatRoomIdParam,
        name: decodedPartnerName || '1:1 문의',
        avatar: '/logo.svg',
        isCsRoom: true,
      })
      return
    }

    if (!partnerIdParam) {
      setChatHeaderPartner(null)
      return
    }

    setChatHeaderPartner((prev) => {
      if (prev?.id === partnerIdParam) {
        if (decodedPartnerName && prev.name !== decodedPartnerName) {
          return { ...prev, name: decodedPartnerName }
        }
        if (!decodedPartnerName && prev.name) {
          return prev
        }
        return {
          ...prev,
          name: decodedPartnerName || prev.name || '채팅',
        }
      }

      return {
        id: partnerIdParam,
        name: decodedPartnerName || '채팅',
        avatar: null,
      }
    })

    let isActive = true

    const fetchPartnerHeaderInfo = async () => {
      try {
        const { data, error } = await supabase
          .from('members')
          .select('name, profile_image, role, member_code')
          .eq('id', partnerIdParam)
          .single() as { data: { name: string | null; profile_image: string | null; role: string | null; member_code: string | null } | null; error: any }

        if (!isActive) return
        if (error) throw error

        const isPartner = data?.role === 'partner'

        setChatHeaderPartner((prev) => {
          if (!prev || prev.id !== partnerIdParam) {
            return {
              id: partnerIdParam,
              name: data?.name || decodedPartnerName || '채팅',
              avatar: data?.profile_image || null,
              isPartner,
              memberCode: data?.member_code || null,
            }
          }

          return {
            ...prev,
            name: data?.name || prev.name || decodedPartnerName || '채팅',
            avatar: data?.profile_image ?? prev.avatar ?? null,
            isPartner,
            memberCode: data?.member_code || null,
          }
        })
      } catch {
        if (!isActive) return
        setChatHeaderPartner((prev) => {
          if (prev?.id === partnerIdParam) {
            return {
              ...prev,
              name: prev.name || decodedPartnerName || '채팅',
            }
          }
          return {
            id: partnerIdParam,
            name: decodedPartnerName || '채팅',
            avatar: prev?.avatar ?? null,
          }
        })
      }
    }

    fetchPartnerHeaderInfo()

    return () => {
      isActive = false
    }
  }, [currentPath, currentSearch])

  // partnerId로 roomId 조회
  useEffect(() => {
    if (!currentPath.startsWith('/chat')) {
      setChatRoomId(null)
      return
    }

    const searchParams = new URLSearchParams(currentSearch)
    const partnerIdParam = searchParams.get('partnerId')

    if (!partnerIdParam || !user?.id) {
      setChatRoomId(null)
      return
    }

    const fetchRoomId = async () => {
      try {
        const { data } = await supabase
          .from('chat_rooms')
          .select('id')
          .or(`and(created_by.eq.${user.id},partner_id.eq.${partnerIdParam}),and(created_by.eq.${partnerIdParam},partner_id.eq.${user.id})`)
          .eq('is_active', true)
          .single() as { data: { id: string } | null }
        
        if (data) {
          setChatRoomId(data.id)
        }
      } catch {
        setChatRoomId(null)
      }
    }

    fetchRoomId()
  }, [currentPath, currentSearch, user?.id])

  // 진행중인 퀘스트 조회
  useEffect(() => {
    if (!currentPath.startsWith('/chat')) {
      setInProgressQuests([])
      return
    }

    const searchParams = new URLSearchParams(currentSearch)
    const partnerIdParam = searchParams.get('partnerId')

    if (!partnerIdParam || !user?.id) {
      setInProgressQuests([])
      return
    }

    const fetchInProgressQuests = async () => {
      try {
        const { data: currentUserPartner, error: err1 } = await supabase
          .from('partners')
          .select('id')
          .eq('member_id', user.id)
          .maybeSingle() as { data: { id: string } | null; error: any }
        
        const { data: otherPartner, error: err2 } = await supabase
          .from('partners')
          .select('id')
          .eq('member_id', partnerIdParam)
          .maybeSingle() as { data: { id: string } | null; error: any }
        
        console.log('[Quest Debug] currentUserPartner:', currentUserPartner, 'error:', err1)
        console.log('[Quest Debug] otherPartner:', otherPartner, 'error:', err2)
        console.log('[Quest Debug] user.id:', user.id, 'partnerIdParam:', partnerIdParam)
        
        // 둘 다 파트너인지 확인
        const bothPartners = !!(currentUserPartner && otherPartner)
        console.log('[Quest Debug] bothPartners:', bothPartners)
        setAreBothPartners(bothPartners)
        
        const combos: Array<{ clientId: string; partnerId: string }> = []
        if (otherPartner) {
          combos.push({ clientId: user.id, partnerId: otherPartner.id })
        }
        if (currentUserPartner) {
          combos.push({ clientId: partnerIdParam, partnerId: currentUserPartner.id })
        }

        if (combos.length === 0) {
          setInProgressQuests([])
          return
        }

        const filters = combos.map(c => 
          `and(client_id.eq.${c.clientId},partner_id.eq.${c.partnerId})`
        ).join(',')

        const { data: requests } = await supabase
          .from('partner_requests')
          .select(`id, client_id, job_count, total_coins, status, updated_at, partner_job:partner_jobs!partner_job_id(job_name), partner:partners!partner_id(member_id)`)
          .or(filters)
          .in('status', ['pending', 'in_progress'])
          .order('created_at', { ascending: false })

        if (requests) {
          setInProgressQuests(requests.map((r: any) => ({
            id: r.id,
            job_name: r.partner_job?.job_name || null,
            job_count: r.job_count,
            total_coins: r.total_coins,
            status: r.status,
            partner_member_id: r.partner?.member_id || null,
            client_id: r.client_id || null,
            updated_at: r.updated_at || null
          })))
        }
      } catch (error) {
        console.error('진행중 퀘스트 조회 실패:', error)
        setInProgressQuests([])
      }
    }

    fetchInProgressQuests()

    // 실시간 구독 (INSERT, UPDATE 모두 처리)
    const channel = supabase
      .channel(`quest-status-${user.id}-${partnerIdParam}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'partner_requests' }, () => {
        fetchInProgressQuests()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'partner_requests' }, () => {
        fetchInProgressQuests()
      })
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [currentPath, currentSearch, user?.id])

  // 경로 변경 시 헤더 버튼 정리
  useEffect(() => {
    if (typeof window === 'undefined') return

    const cleanup = () => {
      const header = document.querySelector('header[class*="fixed"]')
      if (!header) return

      const rightSection = header.querySelector('div:last-child')
      if (!rightSection) return

      // /feed/create 관련 버튼 제거
      const createButtons = rightSection.querySelectorAll('[data-create-next-button], [data-create-post-button]')
      createButtons.forEach((btn) => btn.remove())

      // /feed/create 경로일 때 /partners 페이지의 버튼들 제거
      if (currentPath.startsWith('/feed/create')) {
        // /partners 페이지의 버튼들 제거 (Plus 버튼, AlignRight 버튼 등)
        const allButtons = rightSection.querySelectorAll('button')
        allButtons.forEach((btn) => {
          const ariaLabel = btn.getAttribute('aria-label')
          if (ariaLabel === '글 작성' || ariaLabel === '마이페이지로 이동' || ariaLabel === '멤버쉽 정보') {
            btn.remove()
          }
        })
      }
    }

    // 약간의 지연을 두고 정리 (React 렌더링 후)
    const timer = setTimeout(cleanup, 0)
    return () => clearTimeout(timer)
  }, [currentPath])

  const handleFilterChange = (value: FeedCategory) => {
    setFeedFilter(value)
    if (value === 'subscription') {
      navigate({ to: '/feed/subscribe' })
    } else {
      navigate({ to: '/feed/all' })
    }
  }

  const openMenuButton = (
    <button
      className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#110f1a] cursor-pointer"
      onClick={() => setIsMobileMenuOpen(true)}
      aria-label="메뉴 열기"
    >
      <AlignLeft className="h-5 w-5 text-[#110f1a]" />
    </button>
  )

  const isExplorePartnerTab = currentPath.startsWith('/explore') && (currentSearch as any)?.tab === 'partner'

  const globalSearchButtonWithStreamAndTimeSheet = (
    <>
      {!isExplorePartnerTab && (
        <button
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-[#110f1a] cursor-pointer"
          onClick={() => navigate({ to: '/store/cart' })}
          aria-label="장바구니로 이동"
        >
          <ShoppingCart className="h-5 w-5 text-[#110f1a]" />
          {cartItemCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FE3A8F] px-1 text-[10px] font-bold text-white">
              {cartItemCount > 99 ? '99+' : cartItemCount}
            </span>
          )}
        </button>
      )}
      {currentPath.startsWith('/explore') && (
        <button
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#110f1a] cursor-pointer"
          onClick={() => navigate({ to: '/search' })}
          aria-label="검색으로 이동"
        >
          <SearchIcon className="h-5 w-5 text-[#110f1a]" />
        </button>
      )}
    </>
  )

  const timeSheetAdminSettingButton = (
    <>
      {(user?.role === 'admin' || isPartnerManager) && (
        <button
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#110f1a] cursor-pointer"
          onClick={() => navigate({ to: '/timesheet/admin' as any })}
          aria-label="타임시트 관리자"
        >
          <Settings className="h-5 w-5 text-[#110f1a]" />
        </button>
      )}
    </>
  )

  // 채팅 설정 로드
  const loadChatSettings = async () => {
    if (!user?.id || user?.role !== 'partner') {
      console.log('[ChatSettings] 조건 불충족:', { userId: user?.id, role: user?.role })
      return
    }
    setIsChatSettingsLoading(true)
    try {
      const { data: partnerData, error: partnerError } = await supabase
        .from('partners')
        .select('id, free_message_count, chat_price')
        .eq('member_id', user.id)
        .maybeSingle()
      
      if (partnerError) {
        console.error('[ChatSettings] 파트너 조회 에러:', partnerError)
      }
      
      if (partnerData) {
        setChatFreeMessageCount((partnerData as any).free_message_count || 0)
        setChatPrice((partnerData as any).chat_price || 100)
      }
      
      // 멤버십 목록은 api-membership API로 조회
      const response = await edgeApi.membership.getMyMemberships() as {
        success: boolean
        data?: Array<{ id: string; name: string; paid_message_quota: number | null }>
        error?: { message: string }
      }
      
      console.log('[ChatSettings] 멤버십 API 응답:', response)
      
      if (response.success && response.data && response.data.length > 0) {
        setChatMemberships(response.data.map((m: any) => ({
          id: m.id,
          name: m.name,
          paid_message_quota: m.paid_message_quota || 0
        })))
      } else {
        setChatMemberships([])
      }
    } catch (error) {
      console.error('[ChatSettings] 로드 실패:', error)
    } finally {
      setIsChatSettingsLoading(false)
    }
  }
  
  // 멤버십 무료 메시지 수 업데이트
  const updateMembershipQuota = (membershipId: string, quota: number) => {
    setChatMemberships(prev => prev.map(m => 
      m.id === membershipId ? { ...m, paid_message_quota: quota } : m
    ))
  }
  
  // 채팅 설정 저장
  const saveChatSettings = async () => {
    if (!user?.id) return
    setIsChatSettingsSaving(true)
    try {
      const { error: partnerError } = await supabase
        .from('partners')
        .update({ free_message_count: chatFreeMessageCount, chat_price: chatPrice } as any)
        .eq('member_id', user.id)
      
      if (partnerError) {
        console.error('파트너 설정 저장 실패:', partnerError)
        throw partnerError
      }
      
      // 각 멤버십의 paid_message_quota 저장 (api-membership PUT 사용)
      for (const membership of chatMemberships) {
        const response = await edgeApi.membership.updateMembership({
          id: membership.id,
          paid_message_quota: membership.paid_message_quota
        }) as { success: boolean; error?: { message: string } }
        
        if (!response.success) {
          console.error(`멤버십 ${membership.name} 저장 실패:`, response.error)
        }
      }
      
      toast.success('채팅 설정이 저장되었습니다')
      setIsChatSettingsOpen(false)
    } catch (error) {
      console.error('채팅 설정 저장 실패:', error)
      toast.error('설정 저장에 실패했습니다')
    } finally {
      setIsChatSettingsSaving(false)
    }
  }
  
  // 채팅 설정 팝업 열릴 때 설정 로드
  useEffect(() => {
    if (isChatSettingsOpen) {
      loadChatSettings()
    }
  }, [isChatSettingsOpen])

  // 내 공지 조회 및 모달 오픈
  const handleOpenNoticeModal = async () => {
    try {
      // 먼저 API 호출하여 데이터 준비
      const response = await edgeApi.chatNotice.getMy() as { success: boolean; data?: { id: string; content: string } | Array<{ id: string; content: string }> }
      
      if (response.success && response.data) {
        const notice = Array.isArray(response.data) ? response.data[0] : response.data
        if (notice?.id && notice?.content) {
          setMyNotice(notice)
          setNoticeContent(notice.content)
        } else {
          setMyNotice(null)
          setNoticeContent('')
        }
      } else {
        setMyNotice(null)
        setNoticeContent('')
      }
    } catch {
      setMyNotice(null)
      setNoticeContent('')
    }
    
    // 데이터 준비 후 팝업 열기
    setIsChatNoticeModalOpen(true)
  }

  // 공지 저장
  const handleSaveNotice = async () => {
    if (!noticeContent.trim()) return
    
    try {
      setIsNoticeSubmitting(true)
      if (myNotice) {
        await edgeApi.chatNotice.update(myNotice.id, noticeContent.trim())
      } else {
        await edgeApi.chatNotice.create(noticeContent.trim())
      }
      
      // 공지 변경 메시지 발송 (현재 채팅방이 있는 경우)
      const partnerId = new URLSearchParams(currentSearch).get('partnerId')
      if (chatRoomId && partnerId) {
        await mateYouApi.chat.sendMessage({
          room_id: chatRoomId,
          message: '[NOTICE_UPDATED]',
          message_type: 'text'
        })
      }
      
      setIsChatNoticeModalOpen(false)
      toast.success('공지가 저장되었습니다.')
    } catch {
      toast.error('공지 저장에 실패했습니다.')
    } finally {
      setIsNoticeSubmitting(false)
    }
  }

  // 공지 삭제
  const handleDeleteNotice = async () => {
    if (!myNotice) return
    
    try {
      setIsNoticeSubmitting(true)
      await edgeApi.chatNotice.delete(myNotice.id)
      setMyNotice(null)
      setNoticeContent('')
      setIsChatNoticeModalOpen(false)
      toast.success('공지가 삭제되었습니다.')
    } catch {
      toast.error('공지 삭제에 실패했습니다.')
    } finally {
      setIsNoticeSubmitting(false)
    }
  }

  const chatActionButtons = (
    <div className="flex items-center gap-2">
      {/* 공지 관리 버튼 (파트너/관리자 표시) */}
      {(user?.role === 'partner' || user?.role === 'admin') && (
        <button
          type="button"
          aria-label="공지 관리"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#110f1a] cursor-pointer hover:bg-gray-100 transition-colors"
          onClick={handleOpenNoticeModal}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m3 11 18-5v12L3 14v-3z"/>
            <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>
          </svg>
        </button>
      )}
      <button
        type="button"
        aria-label="새 메시지"
        className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#110f1a] cursor-pointer"
        onClick={() => navigate({ to: '/chat/new' as '/chat/new' })}
      >
        <SquarePen className="h-5 w-5" />
      </button>
      {/* 채팅 설정 버튼 (파트너만 표시) - 가장 오른쪽 */}
      {user?.role === 'partner' && (
        <button
          type="button"
          aria-label="채팅 설정"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#110f1a] cursor-pointer hover:bg-gray-100 transition-colors"
          onClick={() => setIsChatSettingsOpen(true)}
        >
          <Settings className="h-5 w-5" />
        </button>
      )}
    </div>
  )

  const headerConfig = (() => {
    // 룰렛 페이지는 자체 헤더 사용
    if (currentPath.startsWith('/roulette/')) {
      return null
    }
    
    if (currentPath.startsWith('/feed/create')) {
      // 페이지 상태에 따라 왼쪽 버튼 변경
      // 페이지 1: 닫기 버튼, 페이지 2: 뒤로가기 버튼
      const leftButton = feedCreatePage === 2 ? (
        <button
          className="inline-flex items-center justify-center w-10 h-10 rounded-full text-[#110f1a]"
          aria-label="이전"
          onClick={() => {
            // 페이지 1로 돌아가기 - create.tsx의 setCurrentPage 호출
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('feedCreateGoBack'))
            }
          }}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      ) : (
        <button
          className="inline-flex items-center justify-center w-10 h-10 rounded-full text-[#110f1a]"
          aria-label="닫기"
          onClick={() => {
            if (typeof window !== 'undefined' && window.history.length > 1) {
              window.history.back()
            } else {
              navigate({ to: '/feed/all' })
            }
          }}
        >
          <X className="h-5 w-5" />
        </button>
      )

      return {
        left: leftButton,
        center: <p className="text-sm font-semibold text-[#110f1a]">새 게시물</p>,
        right: <span className="min-w-[40px]" />, // 다음/작성 버튼은 페이지 내부에서 동적으로 추가
      }
    }

    if (currentPath.startsWith('/feed/all')) {
      const canCreatePost = user?.role === 'partner' || user?.role === 'admin'
      
      const handleCreatePostClick = () => {
        if (!user) {
          navigate({ to: '/login' })
          return
        }
        const isNative = Capacitor.isNativePlatform()
        if (isNative) {
          navigate({ to: '/feed/create' })
        } else {
          const input = document.createElement('input')
          input.type = 'file'
          input.accept = 'image/*,video/*'
          input.multiple = true
          input.onchange = (e) => {
            const target = e.target as HTMLInputElement
            if (target.files && target.files.length > 0) {
              const files = Array.from(target.files)
              const newMedia = files.map((file) => ({
                file,
                preview: URL.createObjectURL(file),
                type: file.type.startsWith('video/') ? 'video' as const : 'image' as const,
              }))
              useCreatePostStore.getState().addSelectedMedia(newMedia)
              useCreatePostStore.getState().addGalleryImages(newMedia)
              useCreatePostStore.getState().setHasRequestedPermission(true)
              navigate({ to: '/feed/create' })
            }
          }
          input.click()
        }
      }

      // PC에서는 햄버거 메뉴와 로고 숨김
      if (!isMobile) {
        return {
          left: null,
          center: null,
          right: (
            <div className="flex items-center gap-1">
              <button
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#110f1a] cursor-pointer relative"
                onClick={() => navigate({ to: '/notifications' })}
                aria-label="알림으로 이동"
              >
                <Heart className="h-5 w-5 text-[#110f1a]" />
                {hasUnreadNotice && (
                  <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border border-white" />
                )}
              </button>
              {canCreatePost && (
                <button
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#110f1a] cursor-pointer"
                  onClick={handleCreatePostClick}
                  aria-label="새글 작성"
                >
                  <PlusSquare className="h-5 w-5 text-[#110f1a]" />
                </button>
              )}
              {globalSearchButtonWithStreamAndTimeSheet}
            </div>
          ),
        }
      }
      // 모바일: 로고와 꺽쇠를 하나의 버튼으로 묶어서 왼쪽 메뉴 열기
      return {
        left: (
          <div className="flex items-center gap-1">
            {canCreatePost && (
              <button
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#110f1a] cursor-pointer"
                onClick={handleCreatePostClick}
                aria-label="새글 작성"
              >
                <PlusSquare className="h-5 w-5 text-[#110f1a]" />
              </button>
            )}
          </div>
        ),
        center: (
          <button
            className="flex items-center gap-1 text-lg font-semibold text-[#110f1a] cursor-pointer"
            onClick={() => setIsMobileMenuOpen(true)}
            aria-label="메뉴 열기"
          >
            <img src="/logo.svg" alt="MateYou 로고" className="h-6 w-auto" />
            <ChevronRight className="h-4 w-4 text-[#110f1a]" />
          </button>
        ),
        right: (
          <div className="flex items-center gap-1">
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#110f1a] cursor-pointer relative"
              onClick={() => navigate({ to: '/notifications' })}
              aria-label="알림으로 이동"
            >
              <Heart className="h-5 w-5 text-[#110f1a]" />
              {hasUnreadNotice && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border border-white" />
              )}
            </button>
            {globalSearchButtonWithStreamAndTimeSheet}
          </div>
        ),
      }
    }

  if (currentPath.startsWith('/timesheet/admin')) {
      return {
        left: null,
        center: <p className="text-lg font-semibold text-[#110f1a]">출근부 관리자</p>,
        right: <div className="w-10" />,
      }
    }

    if (currentPath.startsWith('/timesheet')) {
      return {
        left: null,
        center: <p className="text-lg font-semibold text-[#110f1a]">출근부</p>,
        right: timeSheetAdminSettingButton,
      }
    }

    if (currentPath.startsWith('/explore')) {
      return {
        left: <p className="text-2xl font-semibold text-[#110f1a]">탐색</p>,
        right: (
          <div className="flex items-center gap-1">
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#110f1a] cursor-pointer relative"
              onClick={() => navigate({ to: '/notifications' })}
              aria-label="알림으로 이동"
            >
              <Heart className="h-5 w-5 text-[#110f1a]" />
              {hasUnreadNotice && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border border-white" />
              )}
            </button>
            {globalSearchButtonWithStreamAndTimeSheet}
          </div>
        ),
      }
    }

    if (currentPath.startsWith('/search')) {
      // PC에서는 햄버거 메뉴 숨김
      if (!isMobile) {
        return {
          left: null,
          right: null,
        }
      }
      return {
        left: openMenuButton,
        right: null,
      }
    }

    if (currentPath.startsWith('/notifications')) {
      return {
        left: <p className="text-2xl font-semibold text-[#110f1a]">활동</p>,
      }
    }

    if (currentPath.startsWith('/chat/new')) {
      return {
        left: (
          <button
            className="inline-flex h-10 items-center justify-center rounded-full gap-2 text-sm font-semibold text-[#110f1a]"
            aria-label="채팅 목록으로"
            onClick={() => navigate({ to: '/chat', search: {} })}
          >
            <ChevronLeft className="h-8 w-8" />
            뒤로
          </button>
        ),
        center: (
          <p className="text-base font-semibold text-[#110f1a]">새 메시지</p>
        ),
        right: (
          <span className="pointer-events-none inline-flex h-10 items-center justify-center rounded-full gap-2 text-sm font-semibold text-transparent">
            <ChevronLeft className="h-5 w-5" />
            뒤로
          </span>
        ),
      }
    }

    if (currentPath.startsWith('/chat')) {
      let partnerIdParam: string | null = null
      let chatRoomIdParam: string | null = null
      let partnerNameParam: string | null = null
      if (typeof currentSearch === 'string') {
        const sp = new URLSearchParams(currentSearch)
        partnerIdParam = sp.get('partnerId')
        chatRoomIdParam = sp.get('chatRoomId')
        partnerNameParam = sp.get('partnerName')
      } else if (currentSearch && typeof currentSearch === 'object') {
        const s = currentSearch as Record<string, unknown>
        partnerIdParam = typeof s.partnerId === 'string' ? s.partnerId : null
        chatRoomIdParam = typeof s.chatRoomId === 'string' ? s.chatRoomId : null
        partnerNameParam = typeof s.partnerName === 'string' ? s.partnerName : null
      }
      const decodedPartnerName = partnerNameParam ? decodeURIComponent(partnerNameParam) : null
      const isCsRoom = !!chatHeaderPartner?.isCsRoom || (!!chatRoomIdParam && !partnerIdParam)
      const hasPartnerId = Boolean(partnerIdParam) || Boolean(chatRoomIdParam)

      const activePartnerInfo = isCsRoom
        ? chatHeaderPartner || { id: chatRoomIdParam!, name: decodedPartnerName || '1:1 문의', avatar: '/logo.svg' }
        : partnerIdParam && chatHeaderPartner?.id === partnerIdParam
          ? chatHeaderPartner
          : partnerIdParam
            ? {
                id: partnerIdParam,
                name: decodedPartnerName || '채팅',
                avatar: null,
              }
            : null

      const partnerDisplayName =
        activePartnerInfo?.name || decodedPartnerName || '채팅'

      return {
        left: hasPartnerId ? (
          <div className="flex items-center gap-0">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#110f1a] cursor-pointer"
              aria-label="채팅 목록으로"
              onClick={() => navigate({ to: '/chat', search: {} })}
            >
              <ChevronLeft className="h-8 w-8" />
            </button>
            {/* 프로필 클릭 - 파트너일 때만 프로필로 이동 */}
            <button
              type="button"
              className="flex items-center gap-2 px-2 py-1 text-left text-[#110f1a] cursor-pointer hover:bg-gray-50 rounded-lg transition-colors"
              aria-label="프로필"
              onClick={() => {
                // role이 'partner'일 때만 프로필로 이동
                if (chatHeaderPartner?.isPartner && chatHeaderPartner?.memberCode) {
                  navigate({ to: '/partners/$memberCode', params: { memberCode: chatHeaderPartner.memberCode } })
                }
              }}
            >
              {isCsRoom ? (
                <div className="shrink-0 h-9 w-9 rounded-full overflow-hidden flex items-center justify-center bg-gray-100">
                  {activePartnerInfo?.avatar ? (
                    <img
                      src={activePartnerInfo.avatar}
                      alt={partnerDisplayName}
                      width={20}
                      height={20}
                      className="object-contain"
                      style={{ width: 20, height: 20, minWidth: 20, minHeight: 20, maxWidth: 20, maxHeight: 20 }}
                      data-cs-avatar
                    />
                  ) : (
                    <span className="text-sm font-semibold text-gray-500">
                      {(partnerDisplayName || '?').charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
              ) : (
                <Avatar
                  src={activePartnerInfo?.avatar || undefined}
                  alt={partnerDisplayName}
                  name={partnerDisplayName}
                  size="sm"
                  className="h-9 w-9"
                />
              )}
              <div className="leading-tight">
                <p className="text-sm font-semibold text-[#110f1a]">
                  {partnerDisplayName}
                </p>
              </div>
            </button>
          </div>
        ) : (
          <p className="text-2xl font-semibold text-[#110f1a]">다이렉트</p>
        ),
        center: null,
        right: hasPartnerId && !isCsRoom ? (
          <div className="flex items-center gap-1">
            {inProgressQuests.length > 0 && (
              <button
                type="button"
                className="relative p-2 rounded-full hover:bg-pink-50 transition-colors"
                aria-label="진행중인 퀘스트"
                onClick={() => setIsQuestPopupOpen(true)}
              >
                <img src="/icon/quest.png" alt="퀘스트" className="w-6 h-6" />
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-pink-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {inProgressQuests.length}
                </span>
              </button>
            )}
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#110f1a] hover:bg-gray-100 transition-colors"
              aria-label="더보기"
              onClick={() => setShowChatRightSlideMenu(true)}
            >
              <MoreVertical className="h-5 w-5" />
            </button>
          </div>
        ) : isCsRoom ? null : chatActionButtons,
      }
    }

    if (currentPath.startsWith('/partners/')) {
      const [, , param = ''] = currentPath.split('/')
      
      // $partnerId 경로인지 확인 (UUID 형식인지 체크)
      const isPartnerIdRoute = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(param)
      
      let isOwnPartnerPage = false
      let displayName = param
      
      if (isPartnerIdRoute) {
        // $partnerId 경로: user.id와 partnerId 비교
        isOwnPartnerPage = user?.id === param
      } else {
        // $memberCode 경로: user.member_code와 memberCode 비교
        isOwnPartnerPage = !!(user?.role === 'partner' && param && user.member_code === param)
        displayName = `@${param}`
      }

      // 파트너 페이지 헤더 색상: 스크롤 전 흰색, 스크롤 후 검은색
      const ownPartnerHeaderTextColor = isScrolled ? 'text-[#110f1a]' : 'text-white'
      const ownPartnerHeaderBorderColor = isScrolled ? 'border-[#110f1a]' : 'border-white'
      const ownPartnerHeaderIconStyle: React.CSSProperties = isScrolled ? {} : { filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }

      if (isOwnPartnerPage) {
        // /feed/create 경로가 아닐 때만 버튼 표시
        if (!currentPath.startsWith('/feed/create')) {
          return {
            left: <span className="inline-block h-10 w-10" />,
            center: partnerHeaderName ? (
              <p className={`text-sm font-semibold ${ownPartnerHeaderTextColor} max-w-[150px] truncate`} style={ownPartnerHeaderIconStyle}>
                {partnerHeaderName.length > 10 ? `${partnerHeaderName.slice(0, 10)}...` : partnerHeaderName}
              </p>
            ) : null,
            right: (
              <div className="flex items-center gap-2">
                {/* 왕관 버튼 - 항상 표시 */}
                <button
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${ownPartnerHeaderTextColor}`}
                  style={ownPartnerHeaderIconStyle}
                  aria-label="파트너 랭킹"
                  onClick={() => openRankingSheet()}
                >
                  <Crown className="h-5 w-5" />
                </button>
                <button
                  className={`inline-flex items-center justify-center rounded-lg border-2 ${ownPartnerHeaderBorderColor} ${ownPartnerHeaderTextColor}`}
                  style={ownPartnerHeaderIconStyle}
                  aria-label="글 작성"
                  onClick={() => {
                    const isNative = Capacitor.isNativePlatform()
                    if (isNative) {
                      // 네이티브: /feed/create로 이동
                      navigate({ to: '/feed/create' })
                    } else {
                      // 웹: 파일 드롭다운 띄우기
                      const input = document.createElement('input')
                      input.type = 'file'
                      input.accept = 'image/*,video/*'
                      input.multiple = true
                      input.onchange = (e) => {
                        const target = e.target as HTMLInputElement
                        if (target.files && target.files.length > 0) {
                          // 전역 상태에 직접 파일 추가
                          const files = Array.from(target.files)
                          const newMedia = files.map((file) => ({
                            file,
                            preview: URL.createObjectURL(file),
                            type: file.type.startsWith('video/') ? 'video' as const : 'image' as const,
                          }))
                          useCreatePostStore.getState().addSelectedMedia(newMedia)
                          useCreatePostStore.getState().addGalleryImages(newMedia)
                          useCreatePostStore.getState().setHasRequestedPermission(true)
                          // /feed/create로 이동
                          navigate({ to: '/feed/create' })
                        }
                      }
                      input.click()
                    }
                  }}
                >
                  <Plus className="h-5 w-5" />
                </button>
                <button
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${ownPartnerHeaderTextColor}`}
                  style={ownPartnerHeaderIconStyle}
                  aria-label="마이페이지로 이동"
                  onClick={() => navigate({ to: '/mypage' })}
                >
                  <AlignRight className="h-5 w-5" />
                </button>
              </div>
            ),
          }
        } else {
          // /feed/create 경로일 때는 null 반환 (버튼은 create.tsx에서 관리)
          return {
            left: <span className="inline-block h-10 w-10" />,
            center: partnerHeaderName ? (
              <p className={`text-sm font-semibold ${ownPartnerHeaderTextColor} max-w-[150px] truncate`} style={ownPartnerHeaderIconStyle}>
                {partnerHeaderName.length > 10 ? `${partnerHeaderName.slice(0, 10)}...` : partnerHeaderName}
              </p>
            ) : null,
            right: null,
          }
        }
      }

      // 현재 사용자의 memberCode와 페이지 memberCode가 다를 때 더보기(...) 버튼 표시
      // 즉, 다른 사람의 프로필을 볼 때
      const isOtherUserProfile = user?.member_code !== param
      
      // 파트너 페이지 헤더 색상: 스크롤 전 흰색, 스크롤 후 검은색
      const partnerHeaderTextColor = isScrolled ? 'text-[#110f1a]' : 'text-white'
      const partnerHeaderIconStyle = isScrolled ? {} : { filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }

      return {
        left: (
          <button
            className={`inline-flex items-center gap-2 rounded-full py-2 text-sm font-semibold ${partnerHeaderTextColor}`}
            style={partnerHeaderIconStyle}
            aria-label="뒤로가기"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.history.back()
              }
            }}
          >
            <ChevronLeft className="h-5 w-5" />
            뒤로
          </button>
        ),
        center: partnerHeaderName ? (
          <p className={`text-sm font-semibold ${partnerHeaderTextColor} max-w-[150px] truncate`} style={partnerHeaderIconStyle}>
            {partnerHeaderName.length > 10 ? `${partnerHeaderName.slice(0, 10)}...` : partnerHeaderName}
          </p>
        ) : null,
        right: (
          <div className="flex items-center gap-2">
            {/* 왕관 버튼 - 항상 표시 */}
            <button
              className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${partnerHeaderTextColor}`}
              style={partnerHeaderIconStyle}
              aria-label="파트너 랭킹"
              onClick={() => openRankingSheet()}
            >
              <Crown className="h-5 w-5" />
            </button>
            {/* 룰렛 버튼 - 다른 사람 프로필일 때만 */}
            {isOtherUserProfile && (
              <button
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${partnerHeaderTextColor}`}
                style={partnerHeaderIconStyle}
                aria-label="룰렛"
                onClick={() => navigate({ to: '/roulette/$memberCode', params: { memberCode: param } })}
              >
                <Dices className="h-5 w-5" />
              </button>
            )}
            {/* 더보기 버튼 - 다른 사람 프로필일 때만 */}
            {isOtherUserProfile ? (
              <div className="relative" ref={partnerMoreDropdownRef}>
                <button
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${partnerHeaderTextColor} ${isScrolled ? 'hover:bg-gray-100' : 'hover:bg-white/20'} transition-colors`}
                  style={partnerHeaderIconStyle}
                  aria-label="더보기"
                  onClick={() => setShowPartnerMoreDropdown(!showPartnerMoreDropdown)}
                >
                  <MoreVertical className="h-5 w-5" />
                </button>
                
                {/* 더보기 드롭다운 메뉴 */}
                {showPartnerMoreDropdown && (
                  <div className="absolute top-full right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[120px] z-50">
                    <button
                      type="button"
                      className="w-full px-4 py-2 text-left text-sm text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
                      onClick={() => {
                        // param은 memberCode 또는 partnerId
                        const targetName = isPartnerIdRoute ? '이 사용자' : param
                        handleBlockUser(param, targetName)
                        setShowPartnerMoreDropdown(false)
                      }}
                    >
                      차단하기
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${partnerHeaderTextColor}`}
                style={partnerHeaderIconStyle}
                aria-label="마이페이지로 이동"
                onClick={() => navigate({ to: '/mypage' })}
              >
                <AlignRight className="h-5 w-5" />
              </button>
            )}
          </div>
        ),
      }
    }

    if (currentPath.startsWith('/mypage/purchases')) {
      return {
        left: (
          <button
            className="inline-flex h-10 items-center gap-2 rounded-full text-sm font-semibold text-[#110f1a]"
            aria-label="뒤로가기"
            onClick={() => {
              if (typeof window !== 'undefined' && window.history.length > 1) {
                window.history.back()
              } else {
                navigate({ to: '/mypage' })
              }
            }}
          >
            <ChevronLeft className="h-5 w-5" />
            뒤로
          </button>
        ),
        center: <p className="text-lg font-semibold text-[#110f1a]">구매내역</p>,
        right: <span className="inline-block h-10 w-10" />,
      }
    }

    // /mypage/saved/$albumId - 앨범 상세 페이지
    if (currentPath.match(/^\/mypage\/saved\/[^/]+$/)) {
      const albumId = currentPath.split('/').pop() || ''
      const isAllPosts = albumId === 'all'
      const isDefaultAlbum = useUIStore.getState().isDefaultAlbum
      
      // 피드 뷰 상태일 때
      if (albumFeedViewState.isOpen) {
        return {
          left: (
            <button
              className="inline-flex h-10 items-center gap-2 rounded-full text-sm font-semibold text-[#110f1a]"
              aria-label="뒤로가기"
              onClick={() => {
                // 피드 뷰 닫기 이벤트 발행
                window.dispatchEvent(new CustomEvent('closeAlbumFeedView'))
              }}
            >
              <ChevronLeft className="h-5 w-5" />
              뒤로
            </button>
          ),
          center: <p className="text-lg font-semibold text-[#110f1a]">{albumFeedViewState.title || '컬렉션'}</p>,
          right: <span className="inline-block h-10 w-10" />,
        }
      }
      
      const displayTitle = isAllPosts ? '전체 게시물' : (albumDetailTitle || '컬렉션')
      // 기본 앨범(저장됨) 또는 전체 게시물은 메뉴 버튼 숨김
      const hideMenuButton = isAllPosts || isDefaultAlbum
      return {
        left: (
          <button
            className="inline-flex h-10 items-center gap-2 rounded-full text-sm font-semibold text-[#110f1a]"
            aria-label="뒤로가기"
            onClick={() => window.history.back()}
          >
            <ChevronLeft className="h-5 w-5" />
            뒤로
          </button>
        ),
        center: <p className="text-lg font-semibold text-[#110f1a]">{displayTitle}</p>,
        right: hideMenuButton ? (
          <span className="inline-block h-10 w-10" />
        ) : (
          <button
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#110f1a]"
            aria-label="더보기"
            onClick={() => {
              // 앨범 메뉴 열기 이벤트 발행
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('openAlbumMenu'))
              }
            }}
          >
            <MoreVertical className="h-5 w-5" />
          </button>
        ),
      }
    }

    // /mypage/saved - 컬렉션 목록 페이지
    if (currentPath === '/mypage/saved' || currentPath === '/mypage/saved/') {
      return {
        left: (
          <button
            className="inline-flex h-10 items-center gap-2 rounded-full text-sm font-semibold text-[#110f1a]"
            aria-label="뒤로가기"
            onClick={() => window.history.back()}
          >
            <ChevronLeft className="h-5 w-5" />
            뒤로
          </button>
        ),
        center: <p className="text-lg font-semibold text-[#110f1a]">컬렉션</p>,
        right: (
          <button
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#110f1a]"
            aria-label="새 컬렉션"
            onClick={() => {
              // 새 컬렉션 추가 이벤트 발행
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('openAddAlbumSheet'))
              }
            }}
          >
            <Plus className="h-5 w-5" />
          </button>
        ),
      }
    }

    if (currentPath.startsWith('/dashboard/partner') || currentPath.startsWith('/partner/dashboard')) {
      return {
        left: (
          <button
            className="inline-flex h-10 items-center gap-2 rounded-full text-sm font-semibold text-[#110f1a]"
            aria-label="마이페이지로"
            onClick={() => {
              if (typeof window !== 'undefined' && window.history.length > 1) {
                window.history.back()
              } else {
                navigate({ to: '/mypage' })
              }
            }}
          >
            <ChevronLeft className="h-5 w-5" />
            뒤로
          </button>
        ),
        center: <p className="text-lg font-semibold text-[#110f1a] whitespace-nowrap">파트너 대시보드</p>,
        right: (
          <button
            onClick={handleToggleOnlineStatus}
            disabled={isTogglingOnline}
            className={`relative inline-flex h-5 w-11 items-center rounded-full transition-colors duration-200 ${
              isPartnerOnline ? 'bg-[#FE3A8F]' : 'bg-gray-300'
            } ${isTogglingOnline ? 'opacity-50' : ''}`}
            aria-label={isPartnerOnline ? '오프라인으로 전환' : '온라인으로 전환'}
          >
            {/* OFF 텍스트 - 스위치 꺼졌을 때 오른쪽에 표시 */}
            <span className={`absolute right-1 text-[8px] font-bold transition-opacity duration-200 ${
              isPartnerOnline ? 'opacity-0' : 'opacity-100 text-white'
            }`}>
              OFF
            </span>
            {/* ON 텍스트 - 스위치 켜졌을 때 왼쪽에 표시 */}
            <span className={`absolute left-1.5 text-[8px] font-bold transition-opacity duration-200 ${
              isPartnerOnline ? 'opacity-100 text-white' : 'opacity-0'
            }`}>
              ON
            </span>
            {/* 스위치 원형 */}
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform duration-200 ${
                isPartnerOnline ? 'translate-x-6' : 'translate-x-0.5'
              }`}
            />
          </button>
        ),
      }
    }

    if (currentPath === '/mypage/settings') {
      return {
        left: (
          <button
            className="inline-flex h-10 items-center justify-center rounded-full gap-2 text-sm font-semibold text-[#110f1a]"
            aria-label="이전 페이지"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.history.back()
              }
            }}
          >
            <ChevronLeft className="h-5 w-5" />
            뒤로
          </button>
        ),
        center: <p className="text-lg font-semibold text-[#110f1a]">설정</p>,
        right: <div className="w-10" />, // 레이아웃 균형을 위한 빈 공간
      }
    }

    if (currentPath === '/mypage/version') {
      return {
        left: (
          <button
            className="inline-flex h-10 items-center justify-center rounded-full gap-2 text-sm font-semibold text-[#110f1a]"
            aria-label="이전 페이지"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.history.back()
              }
            }}
          >
            <ChevronLeft className="h-5 w-5" />
            뒤로
          </button>
        ),
        center: <p className="text-lg font-semibold text-[#110f1a]">앱 버전</p>,
        right: <div className="w-10" />,
      }
    }

    if (currentPath === '/terms') {
      return {
        left: (
          <button
            className="inline-flex h-10 items-center justify-center rounded-full gap-2 text-sm font-semibold text-[#110f1a]"
            aria-label="이전 페이지"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.history.back()
              }
            }}
          >
            <ChevronLeft className="h-5 w-5" />
            뒤로
          </button>
        ),
        center: <p className="text-lg font-semibold text-[#110f1a]">이용약관</p>,
        right: <div className="w-10" />,
      }
    }

    if (currentPath === '/privacy') {
      return {
        left: (
          <button
            className="inline-flex h-10 items-center justify-center rounded-full gap-2 text-sm font-semibold text-[#110f1a]"
            aria-label="이전 페이지"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.history.back()
              }
            }}
          >
            <ChevronLeft className="h-5 w-5" />
            뒤로
          </button>
        ),
        center: <p className="text-lg font-semibold text-[#110f1a] whitespace-nowrap">개인정보처리방침</p>,
        right: <div className="w-10" />,
      }
    }

    if (currentPath.startsWith('/mypage')) {
      return {
        left: (
          <button
            className="inline-flex h-10 items-center justify-center rounded-full gap-2 text-sm font-semibold text-[#110f1a]"
            aria-label="이전 페이지"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.history.back()
              }
            }}
          >
            <ChevronLeft className="h-5 w-5" />
            뒤로
          </button>
        ),
        center: <p className="text-lg font-semibold text-[#110f1a]">마이 페이지</p>,
        right: (
          <div className="flex items-center gap-1">
            {(user?.role === 'admin' || isPartnerManager || isPartnerPlus) && (
              <button
                className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#110f1a] cursor-pointer"
                onClick={() => navigate({ to: '/timesheet' as any })}
                aria-label="타임시트로 이동"
              >
                <Calendar className="h-5 w-5 text-[#110f1a]" />
              </button>
            )}
            <button
              className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#110f1a]"
              aria-label="설정"
              onClick={() => navigate({ to: '/mypage/settings' })}
            >
              <Settings className="h-5 w-5 text-[#110f1a]" />
            </button>
          </div>
        ),
      }
    }

    if (currentPath.startsWith('/stream/chat')) {
      return {
        left: (
          <button
            onClick={() => navigate({ to: '/stream' })}
            className="p-1.5 -ml-1.5 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="스트리밍 목록으로"
          >
            <ChevronLeft className="w-5 h-5 text-gray-700" />
          </button>
        ),
        center: (
          <div className="flex flex-col items-center">
            <h1 className="text-[14px] font-bold text-[#110f1a]">보이스 채팅방</h1>
          </div>
        ),
        right: (
          <div className="flex items-center gap-1">
            {/* 미니플레이어로 최소화 */}
            <button 
              onClick={() => {
                // useVoiceRoomPage에 이벤트 전달
                window.dispatchEvent(new CustomEvent('minimizeVoiceRoom'))
              }}
              className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
              aria-label="미니플레이어로 전환"
              title="미니플레이어로 전환"
            >
              <ChevronDown className="w-5 h-5 text-gray-700" />
            </button>
            {/* 사이드바 열기 (관리자/호스트만 보임 - 페이지에서 동적으로 숨김 처리) */}
            <button 
              id="voice-room-sidebar-btn"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('openVoiceRoomSidebar'))
              }}
              className="p-1.5 -mr-1.5 rounded-full hover:bg-gray-100 transition-colors"
              aria-label="채팅방 메뉴"
            >
              <MoreVertical className="w-5 h-5 text-gray-700" />
            </button>
          </div>
        ),
      }
    }

    if (currentPath === '/stream/live') {
      return {
        left: (
          <button
            onClick={() => navigate({ to: '/stream' })}
            className="inline-flex h-10 items-center gap-2 rounded-full text-sm font-semibold text-[#110f1a]"
            aria-label="스트리밍 목록으로"
          >
            <ChevronLeft className="w-5 h-5" />
            뒤로
          </button>
        ),
        center: (
          <div className="flex items-center gap-2">
            <PlayCircle className="w-5 h-5 text-red-500" />
            <p className="text-lg font-semibold text-[#110f1a]">라이브</p>
          </div>
        ),
        right: <span className="inline-block h-10 w-10" />,  // FAB로 대체
      }
    }

    if (currentPath === '/stream/voice') {
      return {
        left: (
          <button
            onClick={() => navigate({ to: '/stream' })}
            className="inline-flex h-10 items-center gap-2 rounded-full text-sm font-semibold text-[#110f1a]"
            aria-label="스트리밍 목록으로"
          >
            <ChevronLeft className="w-5 h-5" />
            뒤로
          </button>
        ),
        center: (
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-purple-500" />
            <p className="text-lg font-semibold text-[#110f1a]">보이스</p>
          </div>
        ),
        right: <span className="inline-block h-10 w-10" />,  // FAB로 대체
      }
    }

    if (currentPath === '/stream/replay') {
      return {
        left: (
          <button
            onClick={() => navigate({ to: '/stream' })}
            className="inline-flex h-10 items-center gap-2 rounded-full text-sm font-semibold text-[#110f1a]"
            aria-label="스트리밍 목록으로"
          >
            <ChevronLeft className="w-5 h-5" />
            뒤로
          </button>
        ),
        center: <p className="text-lg font-semibold text-[#110f1a]">다시보기</p>,
        right: <span className="inline-block h-10 w-10" />,
      }
    }

    if (currentPath.startsWith('/stream')) {
      return {
        left: <p className="text-2xl font-semibold text-[#110f1a]">스트리밍</p>,
        right: <span className="inline-block h-10 w-10" />,  // FAB로 대체
      }
    }

    // 장바구니 페이지
    if (currentPath === '/store/cart') {
      return {
        left: <span className="inline-block h-10 w-10" />,
        center: <p className="text-lg font-semibold text-[#110f1a]">장바구니</p>,
        right: (
          <button
            className="text-sm text-gray-500 hover:text-gray-700"
            aria-label="전체 삭제"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('clearCart'))
              }
            }}
          >
            전체 삭제
          </button>
        ),
      }
    }

    // 장바구니 페이지
    if (currentPath === '/store/cart') {
      return {
        left: <span className="inline-block h-10 w-10" />,
        center: <p className="text-lg font-semibold text-[#110f1a]">장바구니</p>,
        right: (
          <button
            className="text-sm text-gray-500 hover:text-gray-700"
            aria-label="전체 삭제"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('clearCart'))
              }
            }}
          >
            전체 삭제
          </button>
        ),
      }
    }

    // 상품 상세 페이지 (/store/products/로 시작하고, /store/partner/products가 아니며, 하위 경로가 없는 경우)
    const isProductDetailPage = currentPath.startsWith('/store/products/') && 
                                 !currentPath.startsWith('/store/partner/products') &&
                                 currentPath.split('/').length === 4 // /store/products/{productId} 형식
    if (isProductDetailPage) {
      return {
        left: (
          <button
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#110f1a] cursor-pointer"
            aria-label="뒤로"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.history.back()
              }
            }}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        ),
        center: partnerHeaderName ? (
          <p className="text-sm font-semibold text-[#110f1a] max-w-[200px] truncate">
            {partnerHeaderName.length > 15 ? `${partnerHeaderName.slice(0, 15)}...` : partnerHeaderName}
          </p>
        ) : null,
        right: <div className="w-10" />,
      }
    }

    // /store/partner/products/$productId/preview - 상품 미리보기
    if (currentPath.includes('/store/partner/products/') && currentPath.endsWith('/preview')) {
      return {
        left: (
          <button
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#110f1a] cursor-pointer"
            aria-label="뒤로"
            onClick={() => navigate({ to: '/store/partner/products' })}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        ),
        center: <p className="text-lg font-semibold text-[#110f1a]">상품 미리보기</p>,
        right: <div className="w-10" />,
      }
    }

    if (currentPath.startsWith('/store/partner/products')) {
      return {
        left: (
          <button
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#110f1a] cursor-pointer"
            aria-label="뒤로"
            onClick={() => navigate({ to: '/mypage' })}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        ),
        center: <p className="text-lg font-semibold text-[#110f1a]">상품 관리</p>,
        right: <div className="w-10" />,
      }
    }

    if (currentPath.startsWith('/store/partner/agreement')) {
      return {
        left: (
          <button
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#110f1a] cursor-pointer"
            aria-label="뒤로"
            onClick={() => {
              if (window.history.length > 1) {
                window.history.back();
              } else {
                navigate({ to: '/mypage' });
              }
            }}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        ),
        center: null,
        right: <div className="w-10" />,
      }
    }

    if (currentPath.startsWith('/store/partner/collaboration')) {
      return {
        left: (
          <button
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#110f1a] cursor-pointer"
            aria-label="뒤로"
            onClick={() => navigate({ to: '/store/partner/products' })}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        ),
        center: <p className="text-lg font-semibold text-[#110f1a]">협업 관리</p>,
        right: <div className="w-10" />,
      }
    }

    if (currentPath.startsWith('/store/admin/collaboration')) {
      return {
        left: (
          <button
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#110f1a] cursor-pointer"
            aria-label="뒤로"
            onClick={() => {
              if (window.history.length > 1) {
                window.history.back()
              } else {
                navigate({ to: '/mypage' })
              }
            }}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        ),
        center: <p className="text-lg font-semibold text-[#110f1a]">협업 상품 관리</p>,
        right: (
          <button
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#110f1a] cursor-pointer hover:bg-gray-100 transition-colors"
            aria-label="상품 추가"
            onClick={() => window.dispatchEvent(new CustomEvent('openCollaborationProductCreate'))}
          >
            <Plus className="h-5 w-5" />
          </button>
        ),
      }
    }

    if (currentPath.startsWith('/store/partner/insights')) {
      return {
        left: (
          <button
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#110f1a] cursor-pointer"
            aria-label="뒤로"
            onClick={() => navigate({ to: '/store/partner/products', search: { tab: undefined, orderId: undefined } })}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        ),
        center: <p className="text-lg font-semibold text-[#110f1a]">판매 인사이트</p>,
        right: <div className="w-10" />,
      }
    }

    if (currentPath.startsWith('/store/admin/insights')) {
      return {
        left: (
          <button
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#110f1a] cursor-pointer"
            aria-label="뒤로"
            onClick={() => {
              if (window.history.length > 1) {
                window.history.back()
              } else {
                navigate({ to: '/store/admin/collaboration' })
              }
            }}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        ),
        center: <p className="text-lg font-semibold text-[#110f1a]">판매 통계</p>,
        right: <div className="w-10" />,
      }
    }

    if (currentPath.startsWith('/store/orders/')) {
      return {
        left: (
          <button
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[#110f1a] cursor-pointer"
            aria-label="뒤로"
            onClick={() => {
              if (window.history.length > 1) {
                window.history.back()
              } else {
                navigate({ to: '/mypage/purchases' })
              }
            }}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        ),
        center: null,
        right: null,
      }
    }

    if (currentPath.startsWith('/timesheet/admin')) {
      return {
        left: null,
        center: <p className="text-lg font-semibold text-[#110f1a]">출근부 관리자</p>,
        right: <div className="w-10" />,
      }
    }

    if (currentPath.startsWith('/timesheet')) {
      return {
        left: null,
        center: <p className="text-lg font-semibold text-[#110f1a]">출근부</p>,
        right: timeSheetAdminSettingButton,
      }
    }

    // 관리자 대시보드: 버튼 없이 헤더만 표시
    if (currentPath.startsWith('/dashboard/admin')) {
      return {
        left: null,
        center: null,
        right: null,
      }
    }

    return {
      left: openMenuButton,
      right: globalSearchButtonWithStreamAndTimeSheet,
    }
  })()

  // 경로 변경 시 이전 버튼 정리
  useEffect(() => {
    if (typeof window === 'undefined') return

    const cleanup = () => {
      const header = document.querySelector('header[class*="fixed"]')
      if (!header) return

      const rightSection = header.querySelector('div:last-child')
      if (!rightSection) return

      // /feed/create 관련 버튼 제거
      const createButtons = rightSection.querySelectorAll('[data-create-next-button], [data-create-post-button]')
      createButtons.forEach((btn) => btn.remove())

      // /partners 관련 버튼이 /feed/create 경로일 때 제거
      if (currentPath.startsWith('/feed/create')) {
        // /partners 페이지의 버튼들 제거 (Plus 버튼, AlignRight 버튼 등)
        const partnerButtons = rightSection.querySelectorAll('button')
        partnerButtons.forEach((btn) => {
          const ariaLabel = btn.getAttribute('aria-label')
          if (ariaLabel === '글 작성' || ariaLabel === '마이페이지로 이동' || ariaLabel === '멤버쉽 정보') {
            btn.remove()
          }
        })
      }
    }

    cleanup()
  }, [currentPath])

  // headerConfig가 null이면 헤더 숨김
  if (headerConfig === null) {
    return null
  }

  // 파트너 프로필 페이지인지 확인
  const isPartnerProfilePage = currentPath.startsWith('/partners/') && !currentPath.includes('/partners/list')
  
  return (
    <>
      <header 
        className={`${variant === 'fixed' ? 'fixed left-0 right-0' : 'relative'} z-50 px-4 py-3 transition-all duration-300 ${
          isPartnerProfilePage
            ? isScrolled
              ? 'bg-white/95 backdrop-blur'
              : 'bg-transparent'
            : 'bg-white/95 backdrop-blur'
        }`}
      >
        <div className={variant === 'fixed' ? 'mx-auto' : ''} style={variant === 'fixed' ? { maxWidth: '720px' } : undefined}>
          <NavigationHeaderLayout config={headerConfig} />
        </div>
      </header>
      {typeof document !== 'undefined'
        ? createPortal(
            <FeedMobileMenu
              isOpen={isMobileMenuOpen}
              onClose={() => setIsMobileMenuOpen(false)}
              feedFilter={feedFilter}
              onFilterChange={(value) => {
                handleFilterChange(value)
                setIsMobileMenuOpen(false)
              }}
            />,
            document.body,
          )
        : null}
      
      {/* 채팅 오른쪽 슬라이드 메뉴 */}
      {typeof document !== 'undefined'
        ? createPortal(
            <ChatRightSlideMenu
              isOpen={showChatRightSlideMenu}
              onClose={() => setShowChatRightSlideMenu(false)}
              partnerName={chatHeaderPartner?.name || ''}
              partnerAvatar={chatHeaderPartner?.avatar}
              partnerHandle={chatHeaderPartner?.memberCode}
              roomId={chatRoomId}
              partnerId={chatHeaderPartner?.id}
              currentUserId={user?.id}
              isCurrentUserPartner={user?.role === 'partner'}
              onBlock={async () => {
                setShowChatRightSlideMenu(false)
                const searchParams = new URLSearchParams(currentSearch)
                const partnerIdParam = searchParams.get('partnerId')
                if (partnerIdParam && chatHeaderPartner?.memberCode) {
                  await handleBlockUser(chatHeaderPartner.memberCode, chatHeaderPartner?.name || '')
                } else if (partnerIdParam) {
                  try {
                    const { data } = await supabase
                      .from('members')
                      .select('member_code')
                      .eq('id', partnerIdParam)
                      .single() as { data: { member_code: string | null } | null }
                    
                    if (data?.member_code) {
                      await handleBlockUser(data.member_code, chatHeaderPartner?.name || '')
                    } else {
                      alert('사용자 정보를 불러올 수 없습니다.')
                    }
                  } catch (error) {
                    console.error('사용자 정보 조회 실패:', error)
                    alert('사용자 정보를 불러올 수 없습니다.')
                  }
                }
              }}
              onReport={() => {
                setShowChatRightSlideMenu(false)
                setIsReportModalOpen(true)
              }}
            />,
            document.body,
          )
        : null}
      
      {/* 후원 모달 (채팅 페이지용) */}
      {chatHeaderPartner?.id && chatHeaderPartner?.isPartner && (
        <DonationModal
          isOpen={isDonationModalOpen}
          onClose={() => setIsDonationModalOpen(false)}
          partnerId={chatHeaderPartner.id}
          partnerName={chatHeaderPartner.name}
        />
      )}
      
      {/* 스트림 생성 시트 */}
      <CreateStreamSheet
        isOpen={isCreateStreamSheetOpen}
        onClose={() => setIsCreateStreamSheetOpen(false)}
      />
      {/* 신고 모달 (채팅 페이지용) */}
      {chatHeaderPartner?.id && (
        <ReportModal
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          targetType="profile"
          targetId={chatHeaderPartner.id}
          targetName={chatHeaderPartner.name}
        />
      )}
      
      {/* 채팅 공지 슬라이드 팝업 */}
      <SlideSheet
        isOpen={isChatNoticeModalOpen}
        onClose={() => setIsChatNoticeModalOpen(false)}
        title={myNotice ? '공지 수정' : '공지 등록'}
        initialHeight={0.45}
        minHeight={0.3}
        maxHeight={0.6}
        footer={
          <div className="flex gap-2">
            {myNotice && (
              <button
                onClick={handleDeleteNotice}
                disabled={isNoticeSubmitting}
                className="flex-1 py-2 px-4 border border-gray-300 text-gray-600 rounded-xl font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
              >
                삭제
              </button>
            )}
            <button
              onClick={handleSaveNotice}
              disabled={isNoticeSubmitting || !noticeContent.trim()}
              className="flex-1 py-2 px-4 bg-[#FE3A8F] text-white rounded-xl font-medium hover:bg-pink-600 disabled:opacity-50 transition-colors"
            >
              {isNoticeSubmitting ? '저장 중...' : (myNotice ? '수정' : '등록')}
            </button>
          </div>
        }
      >
        <div className="p-1">
          <textarea
            value={noticeContent}
            onChange={(e) => setNoticeContent(e.target.value)}
            placeholder="채팅방에 표시될 공지 내용을 입력하세요."
            className="w-full h-40 px-4 py-3 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-transparent"
            maxLength={200}
          />
          <p className="text-xs text-gray-400 text-right mt-1">
            {noticeContent.length}/200
          </p>
        </div>
      </SlideSheet>
      
      {/* 채팅 설정 슬라이드 팝업 (파트너용) */}
      <SlideSheet
        isOpen={isChatSettingsOpen}
        onClose={() => setIsChatSettingsOpen(false)}
        title="채팅 설정"
        initialHeight={0.5}
        minHeight={0.35}
        maxHeight={0.7}
        footer={
          <button
            onClick={saveChatSettings}
            disabled={isChatSettingsSaving}
            className="w-full py-3 px-4 bg-[#FE3A8F] text-white rounded-xl font-medium hover:bg-pink-600 disabled:opacity-50 transition-colors"
          >
            {isChatSettingsSaving ? '저장 중...' : '저장'}
          </button>
        }
      >
        <div className="p-4 space-y-6">
          {isChatSettingsLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-pink-500 border-t-transparent" />
            </div>
          ) : (
            <>
              {/* 기본 무료 메시지 설정 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  기본 무료 메시지 갯수
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    value={chatFreeMessageCount || ''}
                    onChange={(e) => {
                      const val = e.target.value
                      if (val === '') {
                        setChatFreeMessageCount(0)
                      } else {
                        const num = parseInt(val, 10)
                        if (!isNaN(num)) {
                          setChatFreeMessageCount(Math.max(0, num))
                        }
                      }
                    }}
                    className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-pink-500"
                  />
                  <span className="text-sm text-gray-500 whitespace-nowrap">회</span>
                </div>
                <p className="mt-2 text-xs text-gray-400">
                  모든 사용자에게 적용되는 기본 무료 메시지 수입니다.
                </p>
              </div>

              {/* 유료 메시지 포인트 금액 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  유료 메시지 포인트 금액
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    value={chatPrice || ''}
                    onChange={(e) => {
                      const val = e.target.value
                      if (val === '') {
                        setChatPrice(0)
                      } else {
                        const num = parseInt(val, 10)
                        if (!isNaN(num)) {
                          setChatPrice(Math.max(0, num))
                        }
                      }
                    }}
                    className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-pink-500"
                  />
                  <span className="text-sm text-gray-500 whitespace-nowrap">P</span>
                </div>
                <p className="mt-2 text-xs text-gray-400">
                  무료 메시지 소진 후 메시지당 차감되는 포인트입니다.
                </p>
              </div>
              
              {/* 멤버십별 무료 메시지 설정 */}
              {chatMemberships.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    멤버십 추가 무료 메시지
                  </label>
                  <div className="space-y-3">
                    {chatMemberships.map((membership) => (
                      <div key={membership.id} className="flex items-center gap-3 bg-gray-50 p-3 rounded-xl">
                        <span className="flex-1 text-sm font-medium text-gray-800 truncate">
                          {membership.name}
                        </span>
                        <input
                          type="number"
                          min="0"
                          value={membership.paid_message_quota || ''}
                          onChange={(e) => {
                            const val = e.target.value
                            if (val === '') {
                              updateMembershipQuota(membership.id, 0)
                            } else {
                              const num = parseInt(val, 10)
                              if (!isNaN(num)) {
                                updateMembershipQuota(membership.id, Math.max(0, num))
                              }
                            }
                          }}
                          className="w-20 px-3 py-2 border border-gray-200 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-pink-500"
                        />
                        <span className="text-sm text-gray-500">회</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-gray-400">
                    멤버십 구독자에게 기본 무료 메시지 소진 후 추가로 제공되는 무료 메시지 수입니다.
                  </p>
                </div>
              )}
              
              {chatMemberships.length === 0 && (
                <div className="text-center py-4 text-sm text-gray-400">
                  등록된 멤버십이 없습니다.
                </div>
              )}
            </>
          )}
        </div>
      </SlideSheet>
      
      {/* 진행중인 퀘스트 슬라이드 팝업 */}
      <SlideSheet
        isOpen={isQuestPopupOpen}
        onClose={() => setIsQuestPopupOpen(false)}
        title="진행중인 퀘스트"
        initialHeight={0.5}
        minHeight={0.3}
        maxHeight={0.7}
      >
        {/* 탭 버튼 - 둘 다 파트너일 때만 표시 */}
        {areBothPartners && (
          <div className="flex border-b border-gray-200 sticky top-0 bg-white z-10">
            <button
              onClick={() => setQuestTab('mine')}
              className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
                questTab === 'mine' 
                  ? 'text-[#FE3A8F]' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              의뢰한 퀘스트
              {inProgressQuests.filter(q => q.client_id === user?.id).length > 0 && (
                <span className="ml-1.5 px-2 py-0.5 text-xs bg-pink-100 text-pink-600 rounded-full">
                  {inProgressQuests.filter(q => q.client_id === user?.id).length}
                </span>
              )}
              {questTab === 'mine' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FE3A8F]" />
              )}
            </button>
            <button
              onClick={() => setQuestTab('partner')}
              className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
                questTab === 'partner' 
                  ? 'text-[#FE3A8F]' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              받은 퀘스트
              {inProgressQuests.filter(q => q.client_id !== user?.id).length > 0 && (
                <span className="ml-1.5 px-2 py-0.5 text-xs bg-pink-100 text-pink-600 rounded-full">
                  {inProgressQuests.filter(q => q.client_id !== user?.id).length}
                </span>
              )}
              {questTab === 'partner' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FE3A8F]" />
              )}
            </button>
          </div>
        )}
        
        <div className="divide-y divide-gray-100">
          {(() => {
            // 둘 다 파트너면 탭으로 필터링, 아니면 전체 표시
            const filteredQuests = areBothPartners
              ? (questTab === 'mine' 
                  ? inProgressQuests.filter(q => q.client_id === user?.id)
                  : inProgressQuests.filter(q => q.client_id !== user?.id))
              : inProgressQuests
            
            if (filteredQuests.length === 0) {
              return (
                <div className="p-8 text-center text-gray-400 text-sm">
                  {areBothPartners
                    ? (questTab === 'mine' ? '의뢰한 퀘스트가 없습니다' : '받은 퀘스트가 없습니다')
                    : '진행중인 퀘스트가 없습니다'}
                </div>
              )
            }
            
            return filteredQuests.map((quest) => (
              <div 
                key={quest.id}
                className="p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="relative flex-shrink-0">
                    <div className="w-12 h-12 bg-pink-100 rounded-full flex items-center justify-center">
                      <img src="/icon/quest.png" alt="" className="w-7 h-7" />
                    </div>
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 bg-[#FE3A8F] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap">
                      {formatElapsedTime(quest.updated_at)}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 truncate">
                      {quest.job_name || '퀘스트'}
                    </p>
                    <p className="text-sm text-gray-500">
                      {quest.job_count}회 · {(quest.total_coins || 0).toLocaleString()}P
                    </p>
                  </div>
                  {/* 완료 버튼: 둘 다 파트너면 받은 퀘스트 탭에서만, 아니면 내가 파트너일 때만 */}
                  {(areBothPartners ? questTab === 'partner' : true) && quest.partner_member_id === user?.id && (
                    <button
                      onClick={async () => {
                        const questId = quest.id
                        setInProgressQuests(prev => prev.filter(q => q.id !== questId))
                        if (inProgressQuests.length <= 1) {
                          setIsQuestPopupOpen(false)
                        }
                        try {
                          await completeRequest(questId)
                          if (chatRoomId) {
                            await mateYouApi.chat.sendMessage({
                              room_id: chatRoomId,
                              message: '의뢰가 완료되었습니다! 🎉',
                              message_type: 'text'
                            })
                          }
                        } catch (error) {
                          console.error('퀘스트 완료 실패:', error)
                          alert('퀘스트 완료에 실패했습니다.')
                        }
                      }}
                      className="px-4 py-2 bg-[#FE3A8F] text-white text-sm font-medium rounded-xl hover:bg-pink-600 transition-colors flex-shrink-0"
                    >
                      완료
                    </button>
                  )}
                </div>
              </div>
            ))
          })()}
        </div>
      </SlideSheet>
    </>
  )
}

interface HeaderLayoutProps {
  config: {
    left?: React.ReactNode
    center?: React.ReactNode | null
    right?: React.ReactNode | null
  }
}

function NavigationHeaderLayout({ config }: HeaderLayoutProps) {
  const hasCenter = Boolean(config.center)
  const hasRight = config.right !== null && config.right !== undefined

  return (
    <div className="mx-auto flex max-w-6xl items-center gap-3">
      <div className="flex flex-1 items-center justify-start min-w-0">
        {config.left || <span className="inline-block h-10 w-10" />}
      </div>
      {hasCenter && (
        <div className="flex flex-1 items-center justify-center min-w-0">
          {config.center}
        </div>
      )}
      {hasRight && (
        <div
          className={`flex items-center justify-end gap-2 min-w-[80px] ${
            hasCenter ? 'flex-1' : 'ml-auto'
          }`}
        >
          {config.right}
        </div>
      )}
    </div>
  )
}
