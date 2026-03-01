import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Avatar, SlideSheet } from '@/components'
import { useAuthStore } from '@/store/useAuthStore'
import { resolveAccessToken } from '@/utils/sessionToken'
import { 
  MessageCircle, 
  Heart, 
  ShoppingCart, 
  Bell, 
  Loader2, 
  Megaphone, 
  CreditCard,
  Pin,
  ChevronRight,
  CheckCircle,
  AlertCircle,
  Clock,
  Gift,
  XCircle
} from 'lucide-react'

const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL

// 탭 타입
type NotificationTab = 'notifications' | 'membership' | 'notice'
const NOTIFICATION_TABS: NotificationTab[] = ['notifications', 'membership', 'notice']

// 멤버십 알림 타입
interface MembershipNotification {
  id: string
  title: string
  body: string
  notification_type: string // 'membership_expiry_reminder' | 'membership_subscription' | 'membership_renewed' | 'membership_renewal_failed'
  data?: {
    type?: string
    popup_data?: {
      type?: string
      title?: string
      description?: string
      memberships?: Array<{
        id: string
        name: string
        price: number
        partner_id: string
      }>
    }
    membership_id?: string
    subscriber_id?: string
  }
  status?: string
  created_at: string
  url?: string
}

interface NotificationData {
  url?: string
  type?: string
  post_id?: string
  comment_id?: string
  commenter_id?: string
  liker_id?: string
  buyer_id?: string
  senderId?: string
  partnerId?: string
  messageId?: number
}

interface NotificationItem {
  id: string
  user_id: string
  target_member_id: string
  target_partner_id: string | null
  title: string
  body: string
  icon: string | null
  url: string | null
  tag: string | null
  notification_type: string
  data: NotificationData | null
  status: string
  retry_count: number
  max_retries: number
  error_message: string | null
  scheduled_at: string
  processed_at: string | null
  created_at: string
  updated_at: string
}

interface NotificationsResponse {
  success: boolean
  data: {
    notifications: NotificationItem[]
    pagination: {
      total: number
      limit: number
      offset: number
      has_more: boolean
    }
    unread_count: number
  }
}

// 공지사항 타입
interface NoticeItem {
  id: string
  title: string
  content: string
  category: 'general' | 'update' | 'event' | 'maintenance'
  is_pinned: boolean
  view_count: number
  created_at: string
  updated_at: string
  author_id?: string
  author_name?: string
}

interface NoticeResponse {
  success: boolean
  data: NoticeItem[] | NoticeItem
  meta?: {
    total: number
    page: number
    limit: number
  }
}

// 카테고리 라벨 및 색상
const CATEGORY_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  general: { label: '일반', color: 'text-gray-700', bgColor: 'bg-gray-100' },
  update: { label: '업데이트', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  event: { label: '이벤트', color: 'text-[#FE3A8F]', bgColor: 'bg-pink-100' },
  maintenance: { label: '점검', color: 'text-orange-700', bgColor: 'bg-orange-100' },
}

// 상대 시간 포맷
function formatRelativeTime(dateString: string): string {
  const now = new Date()
  const date = new Date(dateString)
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diffInSeconds < 60) return '방금 전'
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}분 전`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}시간 전`
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}일 전`
  
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()
  const currentYear = now.getFullYear()
  
  if (year === currentYear) {
    return `${month}월 ${day}일`
  }
  return `${year}년 ${month}월 ${day}일`
}

// 알림 타입별 아이콘
function getNotificationIcon(type: string) {
  switch (type) {
    case 'chat':
      return <MessageCircle className="h-4 w-4 text-white" />
    case 'post_comment':
      return <MessageCircle className="h-4 w-4 text-white" />
    case 'post_like':
      return <Heart className="h-4 w-4 text-white" />
    case 'post_purchase':
      return <ShoppingCart className="h-4 w-4 text-white" />
    case 'roulette_usage_requested':
      return <Gift className="h-4 w-4 text-white" />
    case 'roulette_usage_approved':
      return <CheckCircle className="h-4 w-4 text-white" />
    case 'roulette_usage_rejected':
      return <XCircle className="h-4 w-4 text-white" />
    default:
      return <Bell className="h-4 w-4 text-white" />
  }
}

function NotificationsPage() {
  const navigate = useNavigate()
  const authAccessToken = useAuthStore((state) => (state as any).accessToken)
  const authRefreshToken = useAuthStore((state) => (state as any).refreshToken)
  const syncSession = useAuthStore((state) => state.syncSession)
  
  // 탭 상태
  const [currentTab, setCurrentTab] = useState<NotificationTab>('notifications')
  
  // 알림 상태
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const offsetRef = useRef(0)
  const isFetchingRef = useRef(false)
  const hasFetchedRef = useRef(false)

  // 공지사항 상태
  const [notices, setNotices] = useState<NoticeItem[]>([])
  const [isLoadingNotices, setIsLoadingNotices] = useState(false)
  const [noticeError, setNoticeError] = useState<string | null>(null)
  const [selectedNotice, setSelectedNotice] = useState<NoticeItem | null>(null)
  const [isNoticeDetailOpen, setIsNoticeDetailOpen] = useState(false)
  const hasFetchedNoticesRef = useRef(false)
  const [hasUnreadNotice, setHasUnreadNotice] = useState(false)

  // 멤버십 알림 상태
  const [membershipNotifications, setMembershipNotifications] = useState<MembershipNotification[]>([])
  const [isLoadingMembership, setIsLoadingMembership] = useState(false)
  const [membershipError, setMembershipError] = useState<string | null>(null)
  const hasFetchedMembershipRef = useRef(false)

  // 스와이프 refs
  const swipeContainerRef = useRef<HTMLDivElement>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const isSwipingRef = useRef(false)
  const isLockedRef = useRef(false)
  const swipeDxRef = useRef(0)

  const LIMIT = 20

  const getAccessToken = useCallback(() => {
    return resolveAccessToken({
      accessToken: authAccessToken,
      refreshToken: authRefreshToken,
      syncSession,
    })
  }, [authAccessToken, authRefreshToken, syncSession])

  // 알림 초기 로딩
  useEffect(() => {
    if (hasFetchedRef.current) return
    
    const fetchInitial = async () => {
      const token = await getAccessToken()
      if (!token) {
        setIsLoading(false)
        return
      }
      
      hasFetchedRef.current = true
      isFetchingRef.current = true
      
      try {
        const response = await fetch(
          `${EDGE_FUNCTIONS_URL}/functions/v1/push-native?limit=${LIMIT}&offset=0&unread_only=false`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          }
        )

        const result: NotificationsResponse = await response.json()

        if (result.success) {
          setNotifications(result.data.notifications)
          setHasMore(result.data.pagination.has_more)
          offsetRef.current = result.data.notifications.length
        } else {
          setError('알림을 불러오는데 실패했습니다.')
        }
      } catch (err) {
        console.error('Failed to fetch notifications:', err)
        setError('알림을 불러오는데 실패했습니다.')
      } finally {
        setIsLoading(false)
        isFetchingRef.current = false
      }
    }
    
    fetchInitial()
  }, [getAccessToken])

  // 확인하지 않은 공지 체크
  useEffect(() => {
    const checkUnreadNotice = async () => {
      try {
        const token = await getAccessToken()
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        }
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
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
        }
      } catch (error) {
        console.error('Failed to check unread notice:', error)
      }
    }
    
    checkUnreadNotice()
  }, [getAccessToken])

  // 공지사항 로딩
  useEffect(() => {
    if (currentTab !== 'notice' || hasFetchedNoticesRef.current) return
    
    const fetchNotices = async () => {
      setIsLoadingNotices(true)
      setNoticeError(null)
      
      try {
        const token = await getAccessToken()
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        }
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }

        const response = await fetch(
          `${EDGE_FUNCTIONS_URL}/functions/v1/api-notice?page=1`,
          {
            method: 'GET',
            headers,
          }
        )

        const result: NoticeResponse = await response.json()

        if (result.success && Array.isArray(result.data)) {
          setNotices(result.data)
          hasFetchedNoticesRef.current = true
        } else {
          setNoticeError('공지사항을 불러오는데 실패했습니다.')
        }
      } catch (err) {
        console.error('Failed to fetch notices:', err)
        setNoticeError('공지사항을 불러오는데 실패했습니다.')
      } finally {
        setIsLoadingNotices(false)
      }
    }
    
    fetchNotices()
  }, [currentTab])

  // 멤버십 탭 선택 시 API 호출
  useEffect(() => {
    if (currentTab !== 'membership' || hasFetchedMembershipRef.current) return
    
    const fetchMembershipNotifications = async () => {
      setIsLoadingMembership(true)
      setMembershipError(null)
      
      try {
        const token = await getAccessToken()
        if (!token) {
          setMembershipError('로그인이 필요합니다.')
          setIsLoadingMembership(false)
          return
        }

        const response = await fetch(
          `${EDGE_FUNCTIONS_URL}/functions/v1/push-native/membership`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
          }
        )

        const result = await response.json()

        if (result.success && result.data) {
          // API 응답 구조: { notifications: [], pagination: {...}, unread_count: 0 }
          const notifications = Array.isArray(result.data) ? result.data : (result.data.notifications || [])
          setMembershipNotifications(notifications)
          hasFetchedMembershipRef.current = true
        } else {
          setMembershipError('멤버십 알림을 불러오는데 실패했습니다.')
        }
      } catch (err) {
        console.error('Failed to fetch membership notifications:', err)
        setMembershipError('멤버십 알림을 불러오는데 실패했습니다.')
      } finally {
        setIsLoadingMembership(false)
      }
    }
    
    fetchMembershipNotifications()
  }, [currentTab, getAccessToken])

  // 알림 더 불러오기
  const loadMore = useCallback(async () => {
    if (isFetchingRef.current) return
    if (!hasMore) return
    
    const token = await getAccessToken()
    if (!token) return
    
    isFetchingRef.current = true
    setIsLoadingMore(true)
    
    try {
      const response = await fetch(
        `${EDGE_FUNCTIONS_URL}/functions/v1/push-native?limit=${LIMIT}&offset=${offsetRef.current}&unread_only=false`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }
      )

      const result: NotificationsResponse = await response.json()

      if (result.success) {
        setNotifications((prev) => [...prev, ...result.data.notifications])
        setHasMore(result.data.pagination.has_more)
        offsetRef.current = offsetRef.current + result.data.notifications.length
      }
    } catch (err) {
      console.error('Failed to load more notifications:', err)
    } finally {
      setIsLoadingMore(false)
      isFetchingRef.current = false
    }
  }, [getAccessToken, hasMore])

  // 무한 스크롤 설정
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore && !isLoading && !isFetchingRef.current) {
          loadMore()
        }
      },
      { threshold: 0.1 }
    )

    const currentRef = loadMoreRef.current
    if (currentRef) {
      observer.observe(currentRef)
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef)
      }
    }
  }, [hasMore, isLoadingMore, isLoading, loadMore])

  // 다시 시도
  const handleRetry = async () => {
    const token = await getAccessToken()
    if (!token) return
    
    hasFetchedRef.current = false
    offsetRef.current = 0
    setError(null)
    setNotifications([])
    setIsLoading(true)
    isFetchingRef.current = true
    
    try {
      const response = await fetch(
        `${EDGE_FUNCTIONS_URL}/functions/v1/push-native?limit=${LIMIT}&offset=0&unread_only=false`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }
      )

      const result: NotificationsResponse = await response.json()

      if (result.success) {
        setNotifications(result.data.notifications)
        setHasMore(result.data.pagination.has_more)
        offsetRef.current = result.data.notifications.length
        hasFetchedRef.current = true
      } else {
        setError('알림을 불러오는데 실패했습니다.')
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err)
      setError('알림을 불러오는데 실패했습니다.')
    } finally {
      setIsLoading(false)
      isFetchingRef.current = false
    }
  }

  // 알림 클릭 핸들러
  const handleNotificationClick = (notification: NotificationItem) => {
    // 포스트 관련 알림
    if (
      (notification.notification_type === 'post_comment' || notification.notification_type === 'post_like') &&
      notification.data?.post_id
    ) {
      navigate({ to: '/feed/$postId', params: { postId: notification.data.post_id } })
      return
    }
    
    // 룰렛 보상 관련 알림
    if (notification.notification_type === 'roulette_usage_requested') {
      navigate({ to: '/dashboard/partner/roulette-requests' })
      return
    }
    if (notification.notification_type === 'roulette_usage_approved' || 
        notification.notification_type === 'roulette_usage_rejected') {
      navigate({ to: '/mypage/inventory/roulette' })
      return
    }
    
    // data.url이 있으면 해당 URL로 이동
    if (notification.data?.url) {
      navigate({ to: notification.data.url as any })
    }
  }

  // 공지 클릭 핸들러 (상세 조회 API 호출로 조회수 증가)
  const handleNoticeClick = async (notice: NoticeItem) => {
    setSelectedNotice(notice)
    setIsNoticeDetailOpen(true)
    
    // 상세 조회 API 호출 (조회수 증가)
    try {
      const response = await fetch(
        `${EDGE_FUNCTIONS_URL}/functions/v1/api-notice/${notice.id}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )

      const result: NoticeResponse = await response.json()

      if (result.success && result.data && !Array.isArray(result.data)) {
        const noticeDetail = result.data as NoticeItem
        // 조회수가 증가된 데이터로 업데이트
        setSelectedNotice(noticeDetail)
        // 목록에서도 조회수 업데이트
        setNotices(prev => prev.map(n => 
          n.id === notice.id ? { ...n, view_count: noticeDetail.view_count } : n
        ))
      }
    } catch (err) {
      console.error('Failed to fetch notice detail:', err)
    }
  }

  // 스와이프 탭 전환 애니메이션
  useEffect(() => {
    if (swipeContainerRef.current) {
      const idx = NOTIFICATION_TABS.indexOf(currentTab)
      swipeContainerRef.current.style.transition = 'transform 0.3s ease-out'
      swipeContainerRef.current.style.transform = `translateX(-${idx * 100}%)`
    }
  }, [currentTab])

  useEffect(() => {
    const el = swipeContainerRef.current
    if (!el) return

    const onTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current || isLockedRef.current) return
      const dx = e.touches[0].clientX - touchStartRef.current.x
      const dy = e.touches[0].clientY - touchStartRef.current.y

      if (!isSwipingRef.current) {
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 5) {
          isLockedRef.current = true
          return
        }
        if (Math.abs(dx) > 10) {
          isSwipingRef.current = true
        } else {
          return
        }
      }

      e.preventDefault()

      const tabIdx = NOTIFICATION_TABS.indexOf(currentTab)
      let clampedDx = dx
      if (tabIdx === 0 && dx > 0) clampedDx = dx * 0.3
      if (tabIdx === NOTIFICATION_TABS.length - 1 && dx < 0) clampedDx = dx * 0.3

      swipeDxRef.current = dx
      el.style.transition = 'none'
      el.style.transform = `translateX(calc(-${tabIdx * 100}% + ${clampedDx}px))`
    }

    el.addEventListener('touchmove', onTouchMove, { passive: false })
    return () => el.removeEventListener('touchmove', onTouchMove)
  }, [currentTab])

  const handleSwipeStart = (e: React.TouchEvent) => {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    isSwipingRef.current = false
    isLockedRef.current = false
    swipeDxRef.current = 0
  }

  const handleSwipeEnd = () => {
    if (!isSwipingRef.current) {
      touchStartRef.current = null
      return
    }

    const threshold = 60
    const tabIdx = NOTIFICATION_TABS.indexOf(currentTab)
    let newIdx = tabIdx

    if (swipeDxRef.current < -threshold && tabIdx < NOTIFICATION_TABS.length - 1) {
      newIdx = tabIdx + 1
    } else if (swipeDxRef.current > threshold && tabIdx > 0) {
      newIdx = tabIdx - 1
    }

    if (swipeContainerRef.current) {
      swipeContainerRef.current.style.transition = 'transform 0.3s ease-out'
      swipeContainerRef.current.style.transform = `translateX(-${newIdx * 100}%)`
    }

    if (newIdx !== tabIdx) {
      const newTab = NOTIFICATION_TABS[newIdx]
      setCurrentTab(newTab)
      if (newTab === 'notice') {
        setHasUnreadNotice(false)
        localStorage.setItem('lastNoticeCheckedTime', new Date().toISOString())
        window.dispatchEvent(new Event('noticeChecked'))
      }
    }

    swipeDxRef.current = 0
    touchStartRef.current = null
    isSwipingRef.current = false
    isLockedRef.current = false
  }

  // 알림 탭 렌더링
  const renderNotifications = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#FE3A8F]" />
        </div>
      )
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-gray-400">{error}</p>
          <button
            type="button"
            className="mt-4 rounded-lg bg-[#110f1a] px-4 py-2 text-sm text-white"
            onClick={handleRetry}
          >
            다시 시도
          </button>
        </div>
      )
    }

    if (notifications.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-20">
          <Bell className="h-12 w-12 text-gray-300 mb-4" />
          <p className="text-gray-400">알림이 없습니다</p>
        </div>
      )
    }

    return (
      <section className="rounded-3xl border border-white/70 bg-white">
        <div>
          {notifications.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNotificationClick(item)}
              className="flex w-full items-start gap-4 py-2 text-left transition-colors hover:bg-gray-50"
            >
              <div className="relative flex-shrink-0">
                {item.icon ? (
                  <Avatar src={item.icon} alt="" className="h-12 w-12" />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-[#FE3A8F] flex items-center justify-center">
                    {getNotificationIcon(item.notification_type)}
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-[#110f1a] line-clamp-1">
                  {item.title}
                </p>
                <p className="text-sm text-gray-600 mt-0.5 line-clamp-2">
                  {item.body}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {formatRelativeTime(item.created_at)}
                </p>
              </div>
            </button>
          ))}
        </div>

        {hasMore && (
          <div ref={loadMoreRef} className="flex justify-center py-4">
            {isLoadingMore && (
              <Loader2 className="h-6 w-6 animate-spin text-[#FE3A8F]" />
            )}
          </div>
        )}
      </section>
    )
  }

  // 멤버쉽 탭 렌더링
  const renderMembership = () => {
    if (isLoadingMembership) {
      return (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#FE3A8F]" />
        </div>
      )
    }

    if (membershipError) {
      return (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-gray-400">{membershipError}</p>
          <button
            type="button"
            className="mt-4 rounded-lg bg-[#110f1a] px-4 py-2 text-sm text-white"
            onClick={() => {
              hasFetchedMembershipRef.current = false
              setMembershipError(null)
            }}
          >
            다시 시도
          </button>
        </div>
      )
    }

    if (membershipNotifications.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-20">
          <CreditCard className="h-12 w-12 text-gray-300 mb-4" />
          <p className="text-gray-400">멤버쉽 알림이 없습니다</p>
        </div>
      )
    }

    const getTitleColor = (notificationType: string) => {
      switch (notificationType) {
        case 'membership_renewed':
          return 'text-emerald-600' // 갱신 완료 - 초록
        case 'membership_renewal_failed':
          return 'text-rose-600' // 갱신 실패 - 빨강
        case 'membership_expiry_reminder':
          return 'text-amber-600' // 만료 예정 - 주황
        case 'membership_subscription':
          return 'text-[#FE3A8F]' // 새 구독 - 테마색
        default:
          return 'text-[#110f1a]'
      }
    }

    return (
      <section className="rounded-3xl border border-white/70 bg-white">
        <div>
          {membershipNotifications.map((item) => (
            <div
              key={item.id}
              className="flex w-full items-start py-3 text-left transition-colors hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
            >
              <div className="flex-1 min-w-0">
                <p className={`font-semibold text-sm line-clamp-1 ${getTitleColor(item.notification_type)}`}>
                  {item.title}
                </p>
                <p className="text-sm text-gray-600 mt-0.5 line-clamp-2">
                  {item.body}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {formatRelativeTime(item.created_at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    )
  }

  // 공지사항 탭 렌더링
  const renderNotices = () => {
    if (isLoadingNotices) {
      return (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#FE3A8F]" />
        </div>
      )
    }

    if (noticeError) {
      return (
        <div className="flex flex-col items-center justify-center py-20">
          <p className="text-gray-400">{noticeError}</p>
          <button
            type="button"
            className="mt-4 rounded-lg bg-[#110f1a] px-4 py-2 text-sm text-white"
            onClick={() => {
              hasFetchedNoticesRef.current = false
              setNoticeError(null)
            }}
          >
            다시 시도
          </button>
        </div>
      )
    }

    if (notices.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-20">
          <Megaphone className="h-12 w-12 text-gray-300 mb-4" />
          <p className="text-gray-400">공지사항이 없습니다</p>
        </div>
      )
    }

    // 고정 공지와 일반 공지 분리
    const pinnedNotices = notices.filter(n => n.is_pinned)
    const normalNotices = notices.filter(n => !n.is_pinned)

    return (
      <section className="space-y-2">
        {/* 고정 공지 */}
        {pinnedNotices.map((notice) => (
          <button
            key={notice.id}
            type="button"
            onClick={() => handleNoticeClick(notice)}
            className="flex w-full items-center gap-3 p-4 bg-[#FFF9FB] border border-[#FE3A8F]/20 rounded-xl text-left transition-colors hover:bg-[#FFF0F5]"
          >
            <Pin className="h-4 w-4 text-[#FE3A8F] flex-shrink-0" />
            <span className={`px-2 py-0.5 text-xs font-medium rounded ${CATEGORY_CONFIG[notice.category]?.bgColor || 'bg-gray-100'} ${CATEGORY_CONFIG[notice.category]?.color || 'text-gray-700'}`}>
              {CATEGORY_CONFIG[notice.category]?.label || notice.category}
            </span>
            <span className="flex-1 font-medium text-sm text-[#110f1a] truncate">
              {notice.title}
            </span>
            <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          </button>
        ))}

        {/* 일반 공지 */}
        {normalNotices.map((notice) => (
          <button
            key={notice.id}
            type="button"
            onClick={() => handleNoticeClick(notice)}
            className="flex w-full items-center gap-3 p-4 bg-white border border-gray-100 rounded-xl text-left transition-colors hover:bg-gray-50"
          >
            <span className={`px-2 py-0.5 text-xs font-medium rounded ${CATEGORY_CONFIG[notice.category]?.bgColor || 'bg-gray-100'} ${CATEGORY_CONFIG[notice.category]?.color || 'text-gray-700'}`}>
              {CATEGORY_CONFIG[notice.category]?.label || notice.category}
            </span>
            <span className="flex-1 font-medium text-sm text-[#110f1a] truncate">
              {notice.title}
            </span>
            <span className="text-xs text-gray-400 flex-shrink-0">
              {formatRelativeTime(notice.created_at)}
            </span>
            <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
          </button>
        ))}
      </section>
    )
  }

  return (
    <div className="flex flex-col h-full bg-white text-[#110f1a]">
      {/* 탭 네비게이션 */}
      <div
        className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8"
        style={{ paddingTop: '56px' }}
      >
        <div className="flex gap-2 py-4">
          <button
            type="button"
            onClick={() => setCurrentTab('notifications')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              currentTab === 'notifications'
                ? 'bg-[#110f1a] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            알림
          </button>
          <button
            type="button"
            onClick={() => setCurrentTab('membership')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              currentTab === 'membership'
                ? 'bg-[#110f1a] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            멤버쉽
          </button>
          <button
            type="button"
            onClick={() => {
              setCurrentTab('notice')
              setHasUnreadNotice(false)
              localStorage.setItem('lastNoticeCheckedTime', new Date().toISOString())
              window.dispatchEvent(new Event('noticeChecked'))
            }}
            className={`relative px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              currentTab === 'notice'
                ? 'bg-[#110f1a] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            공지
            {hasUnreadNotice && currentTab !== 'notice' && (
              <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </button>
        </div>
      </div>

      {/* 스와이프 가능한 탭 컨텐츠 */}
      <div className="flex-1 overflow-hidden">
        <div
          ref={swipeContainerRef}
          className="flex h-full will-change-transform"
          onTouchStart={handleSwipeStart}
          onTouchEnd={handleSwipeEnd}
        >
          <div className="w-full flex-shrink-0 h-full overflow-y-auto">
            <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pb-24">
              {renderNotifications()}
            </div>
          </div>
          <div className="w-full flex-shrink-0 h-full overflow-y-auto">
            <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pb-24">
              {renderMembership()}
            </div>
          </div>
          <div className="w-full flex-shrink-0 h-full overflow-y-auto">
            <div className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pb-24">
              {renderNotices()}
            </div>
          </div>
        </div>
      </div>

      {/* 공지 상세 슬라이드 */}
      <SlideSheet
        isOpen={isNoticeDetailOpen}
        onClose={() => {
          setIsNoticeDetailOpen(false)
          setSelectedNotice(null)
        }}
        title="공지사항"
        initialHeight={0.7}
        minHeight={0.4}
        maxHeight={0.9}
      >
        {selectedNotice && (
          <div>
            {/* 카테고리 뱃지 */}
            <div className="px-4 pt-4">
              <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded mb-3 ${CATEGORY_CONFIG[selectedNotice.category]?.bgColor || 'bg-gray-100'} ${CATEGORY_CONFIG[selectedNotice.category]?.color || 'text-gray-700'}`}>
                {CATEGORY_CONFIG[selectedNotice.category]?.label || selectedNotice.category}
              </span>

              {/* 제목 */}
              <h2 className="text-lg font-bold text-[#110f1a] mb-2">
                {selectedNotice.title}
              </h2>

              {/* 날짜 및 조회수 */}
              <div className="flex items-center gap-3 text-xs text-gray-400 mb-4">
                <span>{formatRelativeTime(selectedNotice.created_at)}</span>
                <span>•</span>
                <span>조회수 {selectedNotice.view_count?.toLocaleString() || 0}</span>
              </div>
            </div>

            {/* 이벤트 배너 이미지 (타이틀 아래, 내용 위) */}
            {selectedNotice.category === 'event' && (selectedNotice as any).image_url && (
              <div className="overflow-hidden mb-4">
                <img
                  src={(selectedNotice as any).image_url}
                  alt="이벤트 배너"
                  className="w-full object-cover"
                />
              </div>
            )}

            {/* 내용 (HTML 렌더링) */}
            <div 
              className="px-4 text-sm text-gray-700 leading-relaxed prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: selectedNotice.content }}
            />

            {/* 이벤트 기간 (하단) */}
            {selectedNotice.category === 'event' && ((selectedNotice as any).start_date || (selectedNotice as any).end_date) && (
              <div className="mx-4 mt-6 pt-4 pb-4 border-t border-gray-100">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="font-medium">이벤트 기간</span>
                  <span className="text-gray-400">|</span>
                  <span>
                    {(selectedNotice as any).start_date && (() => {
                      const d = new Date((selectedNotice as any).start_date)
                      return `${String(d.getFullYear()).slice(-2)}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
                    })()}
                    {(selectedNotice as any).start_date && (selectedNotice as any).end_date && ' ~ '}
                    {(selectedNotice as any).end_date && (() => {
                      const d = new Date((selectedNotice as any).end_date)
                      return `${String(d.getFullYear()).slice(-2)}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
                    })()}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </SlideSheet>
    </div>
  )
}

export const Route = createFileRoute('/notifications' as const)({
  component: NotificationsPage,
})
