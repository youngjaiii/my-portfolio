import { forwardRef, useState, useRef, useCallback, useEffect } from 'react'
import { Avatar, Button, SlideSheet, Typography } from '@/components'
import { useDevice } from '@/hooks/useDevice'
import { X, Volume2, VolumeX, Play, Pause, Heart } from 'lucide-react'
import { FeedMediaCarousel, type FeedMedia, MediaPreview } from '@/routes/feed/all'
import { edgeApi } from '@/lib/edgeApi'
import { useAuth } from '@/hooks/useAuth'
import { toast } from 'sonner'

interface ChatMedia {
  id: number
  media_url: string
  media_type: 'image' | 'video' | 'file'
  file_name?: string
  thumbnail_url?: string
}

interface Message {
  id: string
  message: string
  message_type?: 'text' | 'image' | 'video' | 'file' | 'media'
  media_urls?: Array<{
    type: 'image' | 'video' | 'file'
    url: string
    file_path?: string
  }>
  sender_id: string
  created_at: string
  is_read?: boolean
  sender?: {
    name: string
    profile_image?: string
  }
  chat_media?: ChatMedia[]
}

interface PendingRequest {
  id: string
  status: string
  created_at?: string
  job_name?: string | null
  job_count?: number
  total_coins?: number
}

interface ChatMessagesProps {
  messages: Array<Message>
  currentUserId: string
  partnerName?: string
  partnerAvatar?: string | null
  isLoading: boolean
  messageTopOffset: number
  messageBottomPadding: number
  messagesEndRef: React.RefObject<HTMLDivElement>
  postsCount?: number
  followersCount?: number
  // 퀘스트 수락/거절 관련
  isCurrentUserPartner?: boolean
  currentUserPartnerId?: string | null
  pendingRequests?: PendingRequest[]
  onAcceptRequest?: (requestId: string) => void
  onRejectRequest?: (requestId: string) => void
  isAccepting?: boolean
  // 제한시간 관련
  remainingSeconds?: number | null
  formatRemainingTime?: (seconds: number) => string
  // 워터마크용 멤버 코드
  memberCode?: string | null
  // 페이지네이션
  onLoadMore?: () => void
  hasMore?: boolean
  isLoadingMore?: boolean
  // 현장수령 스케줄 관련 (파트너용)
  onScheduleConfirm?: (orderId: string) => void
  onScheduleReject?: (orderId: string) => void
  // 현장수령 스케줄 관련 (구매자용)
  onPickupComplete?: (orderId: string) => void
  onNoShow?: (orderId: string) => void
  // 택배 주문 관련
  onTrackingInput?: (orderId: string) => void
  onOrderCancel?: (orderId: string) => void
  // 장바구니 주문 확인 관련
  onViewStoreOrder?: (orderId: string, sellerPartnerId: string | null, isSeller: boolean) => void
  // 디지털 상품 관련
  onDigitalView?: (orderId: string) => void
  onDigitalDownload?: (orderId: string) => void
  // 협업 상품 이행완료 관련
  onFulfillOrder?: (orderId: string) => void
  // 처리 완료된 주문 ID 목록 (수령완료/미수령 처리 후 버튼 숨김용)
  processedOrderIds?: string[]
  // 게시물 단건구매 클릭 시 구매 시트 띄우기
  onLockedPostClick?: (postId: string, pointPrice: number) => void
  // 게시물 구매 성공 후 캐시 업데이트용 (postId 전달)
  onPostPurchaseSuccess?: (postId: string) => void
  // 사용자 포인트
  userPoints?: number
  // 포인트 충전 요청 (필요 포인트 전달)
  onChargeRequest?: (requiredPoints: number) => void
  // 게시물 직접 구매 (포인트 확인 후 구매 처리)
  onDirectPostPurchase?: (postId: string, pointPrice: number) => Promise<boolean>
  // CS 문의방 여부 (프로필 이미지 크기 축소)
  isCsRoom?: boolean
}

export const ChatMessages = forwardRef<HTMLDivElement, ChatMessagesProps>(
  function ChatMessages({
    messages,
    currentUserId,
    partnerName,
    partnerAvatar,
    isLoading,
    messageTopOffset,
    messageBottomPadding,
    messagesEndRef,
    postsCount = 0,
    followersCount = 0,
    isCurrentUserPartner = false,
    currentUserPartnerId = null,
    pendingRequests = [],
    onAcceptRequest,
    onRejectRequest,
    isAccepting = false,
    remainingSeconds = null,
    formatRemainingTime,
    memberCode = null,
    onLoadMore,
    hasMore = false,
    isLoadingMore = false,
    onScheduleConfirm,
    onScheduleReject,
    onPickupComplete,
    onNoShow,
    onTrackingInput,
    onFulfillOrder,
    processedOrderIds = [],
    onOrderCancel,
    onViewStoreOrder,
    onDigitalView,
    onDigitalDownload,
    onLockedPostClick,
    onPostPurchaseSuccess,
    userPoints = 0,
    onChargeRequest,
    onDirectPostPurchase,
    isCsRoom = false,
  }, ref) {
  const { isMobile, isNative } = useDevice()
  const { user } = useAuth()
  const [now, setNow] = useState(Date.now())
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [previewVideo, setPreviewVideo] = useState<string | null>(null)
  const [showAppDownloadPopup, setShowAppDownloadPopup] = useState(false)
  
  // 미디어 전체 화면 프리뷰 상태
  const [mediaPreviewState, setMediaPreviewState] = useState<{
    items: Array<FeedMedia>
    index: number
    postId?: string
  } | null>(null)
  
  // 웹 환경인지 확인 (개발 환경 포함)
  const isWebEnvironment = !isNative && typeof window !== 'undefined'
  
  // 게시물 구매 옵션 선택 팝업
  const [purchaseOptionSheet, setPurchaseOptionSheet] = useState<{
    isOpen: boolean
    postId: string | null
    bundleTotal: number
    individualPrices: Array<{ id: string; price: number }>
    isBundle: boolean
    selectedOption: 'bundle' | 'individual' | null
    selectedIndividualId: string | null
  }>({
    isOpen: false,
    postId: null,
    bundleTotal: 0,
    individualPrices: [],
    isBundle: false,
    selectedOption: null,
    selectedIndividualId: null,
  })
  
  // 중복 클릭 방지용 처리 중 상태
  const [processingOrderIds, setProcessingOrderIds] = useState<Set<string>>(new Set())
  const [isProcessingPurchase, setIsProcessingPurchase] = useState(false)
  
  // 협업 택배 이행완료 상태 추적
  const [fulfillmentStatus, setFulfillmentStatus] = useState<Map<string, boolean>>(new Map())
  const fetchedFulfillmentRef = useRef<Set<string>>(new Set())
  
  // 협업 메시지에서 orderId 추출 및 이행완료 상태 조회 (택배 + 현장수령)
  useEffect(() => {
    const orderIdsToFetch: string[] = []
    
    messages.forEach((msg) => {
      const match = msg.message.match(/\[STORE_ORDER_(?:DELIVERY_COLLAB|ON_SITE_COLLAB):([a-f0-9-]+)/)
      if (match) {
        const orderId = match[1]
        if (!fetchedFulfillmentRef.current.has(orderId)) {
          orderIdsToFetch.push(orderId)
          fetchedFulfillmentRef.current.add(orderId)
        }
      }
    })
    
    if (orderIdsToFetch.length === 0) return
    
    Promise.all(
      orderIdsToFetch.map(orderId =>
        edgeApi.makeRequest('api-store-schedules', `/order/${orderId}/fulfillment`)
          .then((response: any) => {
            const hasFulfillment = response.success && response.data?.fulfillments?.length > 0
            return { orderId, hasFulfillment }
          })
          .catch(() => ({ orderId, hasFulfillment: false }))
      )
    ).then(results => {
      setFulfillmentStatus(prev => {
        const next = new Map(prev)
        results.forEach(({ orderId, hasFulfillment }) => {
          next.set(orderId, hasFulfillment)
        })
        return next
      })
    })
  }, [messages])
  
  // 이행완료 후 상태 갱신 함수
  const refreshFulfillmentStatus = useCallback((orderId: string) => {
    edgeApi.makeRequest('api-store-schedules', `/order/${orderId}/fulfillment`)
      .then((response: any) => {
        const hasFulfillment = response.success && response.data?.fulfillments?.length > 0
        setFulfillmentStatus(prev => new Map(prev).set(orderId, hasFulfillment))
      })
      .catch(() => {})
  }, [])
  
  // 게시물 데이터 캐시
  const [postCache, setPostCache] = useState<Map<string, any>>(new Map())
  const fetchedPostsRef = useRef<Set<string>>(new Set())
    
    // 메시지에서 postId 추출 및 게시물 조회
    useEffect(() => {
      const postIdsToFetch: string[] = []
      
      messages.forEach((msg) => {
        const match = msg.message.match(/\[POST:([a-f0-9-]+)\]/)
        if (match) {
          const postId = match[1]
          if (!fetchedPostsRef.current.has(postId)) {
            postIdsToFetch.push(postId)
            fetchedPostsRef.current.add(postId)
          }
        }
      })
      
      if (postIdsToFetch.length === 0) return
      
      // 병렬로 모든 post 가져오기
      Promise.all(
        postIdsToFetch.map(postId =>
          edgeApi.posts.getPost(postId)
            .then((response: any) => ({ postId, data: response.success ? response.data : null, fetched: true }))
            .catch(() => ({ postId, data: null, fetched: true }))
        )
      ).then(results => {
        setPostCache(prev => {
          const next = new Map(prev)
          results.forEach(({ postId, data, fetched }) => {
            // 삭제된 게시물도 캐시에 저장 (null로 표시)
            if (fetched) next.set(postId, data)
          })
          return next
        })
      })
    }, [messages])
    
    // 구매 성공 후 postCache 업데이트
    useEffect(() => {
      if (!onPostPurchaseSuccess) return
      
      // 외부에서 호출할 수 있도록 ref에 저장
      const handlePurchaseSuccess = (postId: string) => {
        fetchedPostsRef.current.delete(postId)
        edgeApi.posts.getPost(postId)
          .then((response: any) => {
            if (response.success && response.data) {
              setPostCache(prev => new Map(prev).set(postId, response.data))
            }
          })
          .catch(() => {})
      }
      
      // 전역 함수로 등록 (SimpleChatRoom에서 호출 가능하도록)
      ;(window as any).__refreshChatPostCache = handlePurchaseSuccess
      
      return () => {
        delete (window as any).__refreshChatPostCache
      }
    }, [onPostPurchaseSuccess])
    
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

    // 스크롤 이벤트 핸들러 (이전 메시지 로드)
    const internalScrollRef = useRef<HTMLDivElement>(null)
    const prevScrollHeightRef = useRef<number>(0)
    const prevScrollTopRef = useRef<number>(0)
    const isRestoringScrollRef = useRef<boolean>(false)
    
    // 외부 ref와 내부 ref 병합
    const setScrollRef = useCallback((node: HTMLDivElement | null) => {
      (internalScrollRef as any).current = node
      if (typeof ref === 'function') {
        ref(node)
      } else if (ref) {
        (ref as any).current = node
      }
    }, [ref])
    
    const handleScroll = useCallback(() => {
      const container = internalScrollRef.current
      if (!container || !onLoadMore || !hasMore || isLoadingMore || isRestoringScrollRef.current) return

      // 스크롤이 상단 100px 이내면 이전 메시지 로드
      if (container.scrollTop < 100) {
        prevScrollHeightRef.current = container.scrollHeight
        prevScrollTopRef.current = container.scrollTop
        onLoadMore()
      }
    }, [onLoadMore, hasMore, isLoadingMore])

    // 이전 메시지 로드 후 스크롤 위치 유지
    useEffect(() => {
      const container = internalScrollRef.current
      if (!container || isLoadingMore || prevScrollHeightRef.current === 0) return

      // 메시지가 추가되었고, 이전 메시지 로드가 완료된 경우
      const newScrollHeight = container.scrollHeight
      const scrollDiff = newScrollHeight - prevScrollHeightRef.current
      
      if (scrollDiff > 0) {
        isRestoringScrollRef.current = true
        // 새로 추가된 메시지의 높이만큼 스크롤 위치 조정
        container.scrollTop = prevScrollTopRef.current + scrollDiff
        
        // 스크롤 복원 완료 후 플래그 해제
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            isRestoringScrollRef.current = false
          })
        })
      }
      
      prevScrollHeightRef.current = 0
      prevScrollTopRef.current = 0
    }, [messages.length, isLoadingMore])
    
    // 워터마크 오버레이 (채팅 내 썸네일용 - 작은 사이즈)
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
    
    // 카운트다운 타이머 (1초마다 업데이트) - 퀘스트 메시지가 있으면 항상 실행
    useEffect(() => {
      const hasQuestMessages = messages.some(m => 
        m.message?.startsWith('[QUEST_REQUEST:')
      )
      
      if (!hasQuestMessages) return
      
      // 즉시 now 업데이트
      setNow(Date.now())
      
      const timer = setInterval(() => setNow(Date.now()), 1000)
      return () => clearInterval(timer)
    }, [messages])
    
    // 비디오 프리뷰 상태
    const videoPreviewRef = useRef<HTMLVideoElement>(null)
    const [isVideoMuted, setIsVideoMuted] = useState(false)
    const [isVideoPlaying, setIsVideoPlaying] = useState(true)
    const [videoProgress, setVideoProgress] = useState(0)
    const [videoDuration, setVideoDuration] = useState(0)
    
    // 프리뷰 드래그 상태
    const [verticalDragOffset, setVerticalDragOffset] = useState(0)
    const [isDragging, setIsDragging] = useState(false)
    const dragStartRef = useRef<{ x: number; y: number } | null>(null)
    
    const handlePreviewTouchStart = useCallback((e: React.TouchEvent) => {
      const touch = e.touches[0]
      dragStartRef.current = { x: touch.clientX, y: touch.clientY }
      setIsDragging(true)
    }, [])
    
    const handlePreviewTouchMove = useCallback((e: React.TouchEvent) => {
      if (!dragStartRef.current || !isDragging) return
      const touch = e.touches[0]
      const deltaY = touch.clientY - dragStartRef.current.y
      setVerticalDragOffset(deltaY)
    }, [isDragging])
    
    const handlePreviewTouchEnd = useCallback(() => {
      if (Math.abs(verticalDragOffset) > 100) {
        setPreviewImage(null)
        setPreviewVideo(null)
      }
      setVerticalDragOffset(0)
      setIsDragging(false)
      dragStartRef.current = null
    }, [verticalDragOffset])
    
    const handlePreviewMouseDown = useCallback((e: React.MouseEvent) => {
      dragStartRef.current = { x: e.clientX, y: e.clientY }
      setIsDragging(true)
    }, [])
    
    const handlePreviewMouseMove = useCallback((e: React.MouseEvent) => {
      if (!dragStartRef.current || !isDragging) return
      const deltaY = e.clientY - dragStartRef.current.y
      setVerticalDragOffset(deltaY)
    }, [isDragging])
    
    const handlePreviewMouseUp = useCallback(() => {
      if (Math.abs(verticalDragOffset) > 100) {
        setPreviewImage(null)
        setPreviewVideo(null)
      }
      setVerticalDragOffset(0)
      setIsDragging(false)
      dragStartRef.current = null
    }, [verticalDragOffset])
    
    // 비디오 프리뷰 핸들러
    const handleVideoTimeUpdate = useCallback(() => {
      if (videoPreviewRef.current) {
        setVideoProgress(videoPreviewRef.current.currentTime)
      }
    }, [])
    
    const handleVideoLoadedMetadata = useCallback(() => {
      if (videoPreviewRef.current) {
        setVideoDuration(videoPreviewRef.current.duration)
      }
    }, [])
    
    const toggleVideoPlay = useCallback((e: React.MouseEvent) => {
      e.stopPropagation()
      if (videoPreviewRef.current) {
        if (isVideoPlaying) {
          videoPreviewRef.current.pause()
        } else {
          videoPreviewRef.current.play()
        }
        setIsVideoPlaying(!isVideoPlaying)
      }
    }, [isVideoPlaying])
    
    const toggleVideoMute = useCallback((e: React.MouseEvent) => {
      e.stopPropagation()
      if (videoPreviewRef.current) {
        videoPreviewRef.current.muted = !isVideoMuted
        setIsVideoMuted(!isVideoMuted)
      }
    }, [isVideoMuted])
    
    const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      e.stopPropagation()
      if (videoPreviewRef.current && videoDuration > 0) {
        const rect = e.currentTarget.getBoundingClientRect()
        const clickX = e.clientX - rect.left
        const newTime = (clickX / rect.width) * videoDuration
        videoPreviewRef.current.currentTime = newTime
        setVideoProgress(newTime)
      }
    }, [videoDuration])
    
    const closePreview = useCallback(() => {
      setPreviewImage(null)
      setPreviewVideo(null)
      setVideoProgress(0)
      setVideoDuration(0)
      setIsVideoPlaying(true)
      setIsVideoMuted(false)
    }, [])
    
    const formatVideoTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60)
      const secs = Math.floor(seconds % 60)
      return `${mins}:${secs.toString().padStart(2, '0')}`
    }
    
    // 비디오 프리뷰 열릴 때 자동 재생
    useEffect(() => {
      if (previewVideo && videoPreviewRef.current) {
        videoPreviewRef.current.play().catch(() => {})
        setIsVideoPlaying(true)
      }
    }, [previewVideo])

    const formatTime = (dateString: string): string => {
      if (!dateString) return ''
      const date = new Date(dateString)
      if (Number.isNaN(date.getTime())) return ''
      return date.toLocaleTimeString('ko-kr', { hour: '2-digit', minute: '2-digit' })
    }

    const formatDate = (dateString: string): string => {
      if (!dateString) return ''
      const date = new Date(dateString)
      if (Number.isNaN(date.getTime())) return ''
      return date.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
    }
    
    const isSameDate = (date1: string, date2: string): boolean => {
      const d1 = new Date(date1)
      const d2 = new Date(date2)
      return (
        d1.getFullYear() === d2.getFullYear() &&
        d1.getMonth() === d2.getMonth() &&
        d1.getDate() === d2.getDate()
      )
    }

    // 퀘스트 메시지에서 정보 추출
    const parseQuestMessage = (message: string): { jobName: string | null; requestId: string | null } => {
      const match = message.match(/\[QUEST_REQUEST:([^:]+):(\d+):(\d+):?([a-f0-9-]*)\]/)
      if (match) {
        return { jobName: match[1], requestId: match[4] || null }
      }
      return { jobName: null, requestId: null }
    }

    // 퀘스트 메시지와 요청을 1:1 매칭 (request_id 우선, 없으면 job_name 기반)
    const questRequestMap = (() => {
      const map = new Map<string, PendingRequest>()
      const usedRequestIds = new Set<string>()
      
      const questMessages = messages
        .filter(m => m.message.startsWith('[QUEST_REQUEST:'))
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      
      // 1단계: request_id가 있는 메시지들 먼저 처리
      questMessages.forEach((msg) => {
        const { requestId } = parseQuestMessage(msg.message)
        if (requestId) {
          const matchingRequest = pendingRequests.find(r => r.id === requestId)
          if (matchingRequest) {
            map.set(msg.id, matchingRequest)
            usedRequestIds.add(matchingRequest.id)
          }
        }
      })
      
      // 2단계: request_id가 없는 메시지들은 job_name 기반 매칭
      const sortedAllRequests = [...pendingRequests]
        .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())
      
      questMessages.forEach((msg) => {
        if (map.has(msg.id)) return // 이미 매칭됨
        
        const { jobName } = parseQuestMessage(msg.message)
        if (!jobName) return
        
        const matchingRequest = sortedAllRequests.find(r => 
          r.job_name === jobName && !usedRequestIds.has(r.id)
        )
        
        if (matchingRequest) {
          map.set(msg.id, matchingRequest)
          usedRequestIds.add(matchingRequest.id)
        }
      })
      
      return map
    })()

    return (
      <>
        {/* 이미지 프리뷰 모달 */}
        {previewImage && (
          <div 
            className="fixed inset-0 z-50 bg-black flex items-center justify-center"
            style={{
              opacity: 1 - Math.abs(verticalDragOffset) / 300,
              transition: isDragging ? 'none' : 'opacity 0.2s ease',
            }}
            onClick={closePreview}
            onContextMenu={(e) => e.preventDefault()}
            onTouchStart={handlePreviewTouchStart}
            onTouchMove={handlePreviewTouchMove}
            onTouchEnd={handlePreviewTouchEnd}
            onMouseDown={handlePreviewMouseDown}
            onMouseMove={handlePreviewMouseMove}
            onMouseUp={handlePreviewMouseUp}
            onMouseLeave={handlePreviewMouseUp}
          >
            <button 
              className="absolute top-4 right-4 p-2 text-white hover:bg-white/20 rounded-full transition-colors z-20"
              onClick={(e) => { e.stopPropagation(); closePreview() }}
            >
              <X className="w-8 h-8" />
            </button>
            <img 
              src={previewImage} 
              alt="프리뷰" 
              className={`w-full h-full object-contain select-none transition-all duration-300 ${!isPageVisible ? 'blur-xl' : ''}`}
              draggable={false}
              style={{
                transform: `translateY(${verticalDragOffset}px)`,
                transition: isDragging ? 'none' : 'transform 0.2s ease',
              }}
              onClick={(e) => e.stopPropagation()}
            />
            {/* 워터마크 */}
            {PreviewWatermarkOverlay}
          </div>
        )}
        
        {/* 비디오 프리뷰 모달 */}
        {previewVideo && (
          <div 
            className="fixed inset-0 z-50 bg-black flex items-center justify-center"
            style={{
              opacity: 1 - Math.abs(verticalDragOffset) / 300,
              transition: isDragging ? 'none' : 'opacity 0.2s ease',
            }}
            onClick={closePreview}
            onContextMenu={(e) => e.preventDefault()}
            onTouchStart={handlePreviewTouchStart}
            onTouchMove={handlePreviewTouchMove}
            onTouchEnd={handlePreviewTouchEnd}
            onMouseDown={handlePreviewMouseDown}
            onMouseMove={handlePreviewMouseMove}
            onMouseUp={handlePreviewMouseUp}
            onMouseLeave={handlePreviewMouseUp}
          >
            {/* 닫기 버튼 */}
            <button 
              className="absolute top-4 right-4 p-2 text-white hover:bg-white/20 rounded-full transition-colors z-20"
              onClick={(e) => { e.stopPropagation(); closePreview() }}
            >
              <X className="w-8 h-8" />
            </button>
            
            {/* 음소거 버튼 */}
            <button
              className="absolute top-4 left-4 p-2 text-white hover:bg-white/20 rounded-full transition-colors z-10"
              onClick={toggleVideoMute}
            >
              {isVideoMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6" />}
            </button>
            
            {/* 비디오 */}
            <video
              ref={videoPreviewRef}
              src={previewVideo}
              className={`w-full h-full object-contain select-none transition-all duration-300 ${!isPageVisible ? 'blur-xl' : ''}`}
              style={{
                transform: `translateY(${verticalDragOffset}px)`,
                transition: isDragging ? 'none' : 'transform 0.2s ease',
              }}
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
              <div 
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                style={{ transform: `translateY(${verticalDragOffset}px)` }}
              >
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
          </div>
        )}
        
        {/* 앱 다운로드 팝업 */}
        {showAppDownloadPopup && (
          <div 
            className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
            onClick={() => setShowAppDownloadPopup(false)}
          >
            <div 
              className="bg-white rounded-2xl p-6 max-w-sm w-full text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-gray-900 mb-2">앱에서 콘텐츠 보기</h3>
              <p className="text-sm text-gray-500 mb-6">
                유료 콘텐츠는 메이트유 앱에서만<br />구매 및 열람이 가능합니다.
              </p>
              
              {/* QR 코드 영역 */}
              <div className="flex justify-center gap-6 mb-6">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-24 h-24 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                    <img 
                      src="https://api.qrserver.com/v1/create-qr-code/?size=96x96&data=https://apps.apple.com/kr/app/id6755867402"
                      alt="App Store QR"
                      className="w-full h-full"
                    />
                  </div>
                  <span className="text-xs text-gray-500">App Store</span>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <div className="w-24 h-24 bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden">
                    <img 
                      src="https://api.qrserver.com/v1/create-qr-code/?size=96x96&data=https://play.google.com/store/apps/details?id=com.mateyou.app&hl=ko"
                      alt="Google Play QR"
                      className="w-full h-full"
                    />
                  </div>
                  <span className="text-xs text-gray-500">Google Play</span>
                </div>
              </div>
              
              <button
                type="button"
                onClick={() => setShowAppDownloadPopup(false)}
                className="w-full py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        )}

        <div
          ref={setScrollRef}
          onScroll={handleScroll}
          className={`flex-1 overflow-y-auto space-y-2 min-h-0 ${
            isMobile ? 'px-4' : 'p-6'
          }`}
          style={isMobile ? {
            // 상단: 헤더 높이 (56px)
            // 하단: ChatInput이 flex item이므로 패딩 불필요
            paddingTop: '56px',
          } : undefined}
        >
        {/* 이전 메시지 로딩 인디케이터 */}
        {isLoadingMore && (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#FE3A8F]"></div>
          </div>
        )}
        
        {/* 더 불러올 메시지가 있음을 표시 */}
        {hasMore && !isLoadingMore && messages.length > 0 && (
          <div className="flex justify-center py-2">
            <span className="text-xs text-gray-400">위로 스크롤하여 이전 메시지 보기</span>
          </div>
        )}
        
        {/* 파트너 정보 영역 - 더 이상 불러올 메시지가 없을 때만 표시 */}
        {!hasMore && (
          <div className="flex flex-col items-center justify-center pt-8 pb-6 text-gray-500">
            {isCsRoom ? (
              <>
                <img
                  src={partnerAvatar}
                  alt={partnerName || '파트너'}
                  width={24}
                  height={24}
                  className="object-contain"
                  style={{ width: 24, height: 24, minWidth: 24, minHeight: 24, maxWidth: 24, maxHeight: 24 }}
                  data-cs-avatar
                />
                <p className="text-base font-medium text-gray-700 text-center">
                  자유롭게 문의해 주세요.
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  운영시간: 오전 10시 ~ 오후 7시
                </p>
              </>
            ) : (
              <>
                <div className="mb-3">
                  <Avatar
                    src={partnerAvatar || undefined}
                    name={partnerName || '상대방'}
                    alt={partnerName || '파트너'}
                    size="xl"
                    className="w-16 h-16"
                  />
                </div>
                <p className="text-base font-medium text-gray-700">
                  {partnerName || '파트너'}
                </p>
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                  <span>게시글 <strong className="text-gray-700">{postsCount}</strong></span>
                  <span>팔로워 <strong className="text-gray-700">{followersCount}</strong></span>
                </div>
              </>
            )}
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#FE3A8F]"></div>
          </div>
        ) : (
          messages.map((message, index) => {
            // 시스템 메시지 건너뛰기
            if (message.message === '[NOTICE_UPDATED]') return null
            
            const isOwn = message.sender_id === currentUserId
            const prevMessage = index > 0 ? messages[index - 1] : null
            const nextMessage =
              index < messages.length - 1 ? messages[index + 1] : null

            // 연속 메시지 여부 확인
            const isContinuation =
              prevMessage && prevMessage.sender_id === message.sender_id
            const isLastInGroup =
              !nextMessage || nextMessage.sender_id !== message.sender_id

            // 날짜가 바뀌었는지 확인
            const shouldShowDateBadge = 
              !prevMessage || 
              prevMessage.message === '[NOTICE_UPDATED]' ||
              !isSameDate(prevMessage.created_at, message.created_at)

            // 프로필 정보
            const senderInfo = isOwn ? null : (message as any).sender
            const showProfile = !isOwn && !isContinuation

            return (
              <div key={`${message.id}-${index}`}>
                {/* 날짜 뱃지 */}
                {shouldShowDateBadge && (
                  <div className="flex justify-center my-12">
                    <span className="chat-date-root text-xs text-gray-500 px-3 py-1 bg-gray-100 rounded-full">
                      {formatDate(message.created_at)}
                    </span>
                  </div>
                )}
                <div
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${
                    isContinuation ? 'mt-1' : 'mt-4'
                  }`}
                >
                {!isOwn && (
                  <div className="flex-shrink-0 mr-3">
                    {showProfile ? (
                      isCsRoom ? (
                        <div className="rounded-full overflow-hidden shrink-0 w-8 h-8 flex items-center justify-center bg-gray-100">
                          {(senderInfo?.profile_image || partnerAvatar) ? (
                            <img
                              src={senderInfo?.profile_image || partnerAvatar || ''}
                              alt={senderInfo?.name || partnerName || 'User'}
                              width={20}
                              height={20}
                              className="object-contain"
                              style={{ width: 20, height: 20, minWidth: 20, minHeight: 20, maxWidth: 20, maxHeight: 20 }}
                              data-cs-avatar
                            />
                          ) : (
                            <span className="text-xs font-semibold text-gray-500">
                              {(senderInfo?.name || partnerName || '?').charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                      ) : (
                        <Avatar
                          src={senderInfo?.profile_image || partnerAvatar}
                          name={senderInfo?.name || partnerName || '상대방'}
                          alt={senderInfo?.name || partnerName || 'User'}
                          size="sm"
                        />
                      )
                    ) : (
                      <div className="w-8 h-8" />
                    )}
                  </div>
                )}

                <div
                  className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
                >
                  {showProfile && (
                    <p className="text-xs text-gray-600 mb-1 px-1">
                      {senderInfo?.name || partnerName || 'Unknown User'}
                    </p>
                  )}

                  {/* 하트 선물 메시지 특별 렌더링 */}
                  {message.message.startsWith('[HEART_GIFT:') ? (() => {
                    const match = message.message.match(/\[HEART_GIFT:([^:]+):(\d+):(\d+)\]/)
                    if (match) {
                      const [, heartImage, heartCount, points] = match
                      return (
                        <div className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                          <div className={`flex flex-col items-center p-4 rounded-2xl ${
                            isOwn ? 'bg-[#FFE4EC]' : 'bg-gray-100'
                          } ${
                            isContinuation ? (isOwn ? 'rounded-tr-md' : 'rounded-tl-md') : ''
                          } ${
                            !isLastInGroup ? (isOwn ? 'rounded-br-md' : 'rounded-bl-md') : ''
                          }`}>
                            <img src={heartImage} alt="하트" className="w-16 h-16 object-contain mb-2" />
                            <p className="text-base font-bold text-gray-900">
                              하트 {heartCount}개 선물
                            </p>
                            <p className="text-xs text-gray-500">
                              {Number(points).toLocaleString()}P
                            </p>
                          </div>
                          {isLastInGroup && (
                            <p className="text-xs text-gray-400 whitespace-nowrap">
                              {formatTime(message.created_at)}
                            </p>
                          )}
                        </div>
                      )
                    }
                    return null
                  })() : message.message.startsWith('[QUEST_REQUEST:') ? (() => {
                    /* 퀘스트 요청 메시지 특별 렌더링 */
                    const match = message.message.match(/\[QUEST_REQUEST:([^:]+):(\d+):(\d+):?([a-f0-9-]*)\]/)
                    if (match) {
                      const [, questName, count, totalCost] = match
                      
                      // questRequestMap에서 매칭된 요청 가져오기 (이미 request_id 우선 처리됨)
                      const matchedRequest = questRequestMap.get(message.id)
                      
                      const targetRequestId = matchedRequest?.id || null
                      const requestStatus = matchedRequest?.status || null
                      
                      // 파트너이고, 본인 메시지가 아니고, pending 상태의 요청이 있으면 버튼 표시
                      const showAcceptReject = isCurrentUserPartner && !isOwn && requestStatus === 'pending' && onAcceptRequest && onRejectRequest
                      
                      // 이 메시지의 개별 카운트다운 계산 (메시지 생성 시간 기준 1시간)
                      const messageCreatedAt = new Date(message.created_at).getTime()
                      const TIMEOUT_MS = 60 * 60 * 1000 // 1시간
                      const elapsed = now - messageCreatedAt
                      const thisMessageRemainingSeconds = Math.max(0, Math.floor((TIMEOUT_MS - elapsed) / 1000))
                      const isExpired = thisMessageRemainingSeconds <= 0
                      
                      // 개별 메시지용 시간 포맷 함수
                      const formatThisRemainingTime = (seconds: number): string => {
                        const hours = Math.floor(seconds / 3600)
                        const mins = Math.floor((seconds % 3600) / 60)
                        const secs = seconds % 60
                        if (hours > 0) {
                          return `${hours}시간 ${mins}분`
                        }
                        return `${mins}분 ${secs}초`
                      }
                      
                      return (
                        <div className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                          <div className={`relative flex flex-col items-center p-4 rounded-2xl ${
                            isOwn ? 'bg-[#FFE4EC]' : 'bg-gray-100'
                          } ${
                            isContinuation ? (isOwn ? 'rounded-tr-md' : 'rounded-tl-md') : ''
                          } ${
                            !isLastInGroup ? (isOwn ? 'rounded-br-md' : 'rounded-bl-md') : ''
                          }`}>
                            {/* 제한시간 뱃지 - pending 상태일 때만 표시 */}
                            {requestStatus === 'pending' && targetRequestId && !isExpired && (
                              <div className="absolute -top-2 -right-2 flex items-center gap-1 bg-white shadow-md px-2 py-1 rounded-full">
                                <img src="/icon/stop-watch.png" alt="" className="h-3 w-3" />
                                <span className="text-xs font-medium text-gray-700">
                                  {formatThisRemainingTime(thisMessageRemainingSeconds)}
                                </span>
                              </div>
                            )}
                            <img src="/icon/quest.png" alt="퀘스트" className="w-16 h-16 object-contain mb-2" />
                            <p className="text-base font-bold text-gray-900">
                              퀘스트 도착!
                            </p>
                            <p className="text-sm font-medium text-gray-600">
                              {questName} X {count}
                            </p>
                            <p className="text-xs text-gray-500">
                              {Number(totalCost).toLocaleString()}P
                            </p>
                            {showAcceptReject && !isExpired ? (
                              <div className="flex gap-2 mt-3">
                                <Button
                                  onClick={() => onRejectRequest(targetRequestId!)}
                                  disabled={isAccepting}
                                  variant="outline"
                                  size="sm"
                                  className="border-gray-300 text-gray-600 hover:bg-white py-1 px-4 text-xs font-medium"
                                >
                                  거절
                                </Button>
                                <Button
                                  onClick={() => onAcceptRequest(targetRequestId!)}
                                  disabled={isAccepting}
                                  variant="primary"
                                  size="sm"
                                  className="py-1 px-4 text-xs font-medium text-white"
                                  style={{ backgroundColor: '#FE3A8F' }}
                                >
                                  수락
                                </Button>
                              </div>
                            ) : (
                              <p className="text-xs mt-2 text-gray-500">
                                {requestStatus === 'completed' ? '🎉 퀘스트 완료!' : 
                                 requestStatus === 'in_progress' ? '✅ 수락 완료' : 
                                 requestStatus === 'cancelled' ? '❌ 거절됨' :
                                 requestStatus === 'pending' && isExpired ? '⏰ 시간 만료' :
                                 requestStatus === 'pending' ? (isOwn ? '수락 대기중...' : '수락 대기중') :
                                 isOwn ? '수락 대기중...' : '수락 대기중'}
                              </p>
                            )}
                          </div>
                          {isLastInGroup && (
                            <p className="text-xs text-gray-400 whitespace-nowrap">
                              {formatTime(message.created_at)}
                            </p>
                          )}
                        </div>
                      )
                    }
                    return null
                  })() : message.message.startsWith('[CALL_START:') ? (() => {
                    /* 통화 시작 메시지 렌더링 */
                    const isVideo = message.message.includes(':video]')
                    return (
                      <div className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div className={`flex flex-col items-center p-4 rounded-2xl ${
                          isOwn ? 'bg-[#FFE4EC]' : 'bg-gray-100'
                        }`}>
                          <img 
                            src={isVideo ? '/icon/video_call.png' : '/icon/call_out.png'} 
                            alt={isVideo ? '영상통화' : '음성통화'} 
                            className="w-12 h-12 object-contain" 
                          />
                        </div>
                        {isLastInGroup && (
                          <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                            <p className="text-xs text-gray-400 whitespace-nowrap">
                              {formatTime(message.created_at)}
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  })() : message.message.startsWith('[CALL_ACCEPT:') ? (() => {
                    /* 통화 수락 메시지 렌더링 */
                    const isVideo = message.message.includes(':video]')
                    return (
                      <div className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div className={`flex flex-col items-center p-4 rounded-2xl ${
                          isOwn ? 'bg-[#FFE4EC]' : 'bg-gray-100'
                        }`}>
                          <img 
                            src={isVideo ? '/icon/video_call.png' : '/icon/call_in.png'} 
                            alt={isVideo ? '영상통화 수락' : '통화 수락'} 
                            className="w-12 h-12 object-contain" 
                          />
                        </div>
                        {isLastInGroup && (
                          <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                            <p className="text-xs text-gray-400 whitespace-nowrap">
                              {formatTime(message.created_at)}
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  })() : message.message.startsWith('[CALL_END:') ? (() => {
                    /* 통화 종료 메시지 렌더링 */
                    const match = message.message.match(/\[CALL_END:(voice|video):(\d+)\]/)
                    if (match) {
                      const [, callType, durationStr] = match
                      const durationSeconds = Number(durationStr)
                      const isVideo = callType === 'video'
                      
                      // 통화 시간 포맷팅
                      const formatCallDuration = (seconds: number) => {
                        if (seconds === 0) return '0초'
                        const mins = Math.floor(seconds / 60)
                        const secs = seconds % 60
                        if (mins === 0) return `${secs}초`
                        return `${mins}분 ${secs}초`
                      }

                      return (
                        <div className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                          <div className={`flex flex-col items-center p-4 rounded-2xl ${
                            isOwn ? 'bg-[#FFE4EC]' : 'bg-gray-100'
                          }`}>
                            <img 
                              src="/icon/call_end.png" 
                              alt="통화 종료" 
                              className="w-12 h-12 object-contain mb-2" 
                            />
                            <p className="text-sm font-medium text-gray-900">
                              {isVideo ? '영상통화' : '통화'}가 종료되었습니다.
                            </p>
                            <p className="text-xs text-gray-500">
                              통화 시간: {formatCallDuration(durationSeconds)}
                            </p>
                          </div>
                          {isLastInGroup && (
                            <p className="text-xs text-gray-400 whitespace-nowrap">
                              {formatTime(message.created_at)}
                            </p>
                          )}
                        </div>
                      )
                    }
                    return null
                  })() : message.message.includes('[POST:') ? (() => {
                    /* 게시물 메시지 렌더링 - 콘텐츠만 노출 */
                    const match = message.message.match(/\[POST:([a-f0-9-]+)\]/)
                    const postId = match ? match[1] : null
                    
                    if (!postId) return null
                    
                    const postData = postCache.get(postId)
                    const isPostFetched = postCache.has(postId)
                    
                    // 로딩 중 (아직 fetch 안됨)
                    if (!isPostFetched) {
                      return (
                        <div className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                          <div className={`rounded-2xl overflow-hidden w-64 ${
                            isOwn ? 'bg-[#FFE4EC]' : 'bg-gray-100'
                          } animate-pulse`}>
                            <div className="h-48 bg-gray-300/50" />
                            <div className="p-3">
                              <div className="h-4 bg-gray-300/50 rounded w-3/4" />
                            </div>
                          </div>
                        </div>
                      )
                    }
                    
                    // 삭제된 게시물
                    if (!postData) {
                      return (
                        <div className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                          <div className={`rounded-2xl overflow-hidden w-64 ${
                            isOwn ? 'bg-[#FFE4EC]' : 'bg-gray-100'
                          }`}>
                            <div className="h-32 bg-gray-200 flex items-center justify-center">
                              <span className="text-gray-500 text-sm">삭제된 게시물입니다</span>
                            </div>
                          </div>
                        </div>
                      )
                    }
                    
                    // 게시물 정보 추출
                    const hasIndividualMediaPrices = (postData.files || []).some((f: any) => f.point_price != null && f.point_price > 0)
                    const purchasedMediaOrder = postData.purchased_media_order ?? null
                    const isBundle = postData.is_bundle ?? false
                    const discountRate = postData.discount_rate ?? 0
                    const pointPrice = postData.point_price || 0
                    const isPurchased = postData.is_purchased || false
                    // 내 게시물이면 무료 게시물처럼 표시
                    const isFreePost = isOwn || (pointPrice === 0 && !hasIndividualMediaPrices)
                    
                    // 할인율 적용 가격 계산 함수
                    const calculateFinalPrice = (price: number, discount: number): number => {
                      if (!price || price <= 0) return 0
                      if (discount <= 0 || discount > 100) return price
                      return Math.round(price * (1 - discount / 100))
                    }
                    
                    // 미디어 파일 변환
                    // isOwn이면 내 게시물이므로 모두 볼 수 있음
                    const mediaFiles = (postData.files || []).map((file: any, index: number) => {
                      // 개별 판매인 경우: signed_url이 null이고 point_price가 있으면 미구매
                      // purchasedMediaOrder가 null이면 구매 이력 없음
                      const hasMediaPrice = file.point_price != null && file.point_price > 0
                      const isPurchasedMedia = purchasedMediaOrder != null && index <= purchasedMediaOrder
                      // 내 게시물(isOwn)이면 잠금 없음
                      const isLockedMedia = !isOwn && hasIndividualMediaPrices && hasMediaPrice && !file.signed_url && !isPurchasedMedia
                      
                      const mediaPrice = file.point_price ?? null
                      const basePrice = mediaPrice ?? pointPrice
                      const finalPrice = calculateFinalPrice(basePrice, discountRate)
                      const hasDiscount = discountRate > 0 && discountRate <= 100 && basePrice > 0
                      
                      // 구매 완료된 미디어인지 확인 (웹 환경에서 blur 처리용)
                      const isMediaPurchased = !isLockedMedia && (isPurchasedMedia || (!hasIndividualMediaPrices && isPurchased))
                      
                      return {
                        id: file.id,
                        type: file.media_type === 'image' ? 'image' : 'video',
                        // 내 게시물이면 signed_url 또는 media_url 사용
                        src: file.signed_url || (isOwn ? file.media_url : (isLockedMedia ? null : file.media_url)),
                        point_price: mediaPrice,
                        is_locked: isLockedMedia,
                        is_purchased: isMediaPurchased,
                        base_price: basePrice,
                        final_price: finalPrice,
                        has_discount: hasDiscount,
                        media_url: file.media_url, // 전체 화면 뷰어용 원본 URL
                      }
                    })
                    
                    // 전체 금액 합산 (할인율 적용)
                    const totalBasePrice = mediaFiles.reduce((sum: number, m: any) => sum + m.base_price, 0)
                    const totalFinalPrice = calculateFinalPrice(totalBasePrice, discountRate)
                    const hasLockedMedia = mediaFiles.some((m: any) => m.is_locked)
                    const hasPurchasedMedia = mediaFiles.some((m: any) => m.is_purchased && !m.is_locked)
                    
                    // FeedMedia 형식으로 변환 (전체 화면 뷰어용)
                    // 구매 완료된 미디어는 signed_url 사용, 미구매는 placeholder
                    const feedMediaList: Array<FeedMedia> = mediaFiles.map((m: any, idx: number) => {
                      const file = postData.files?.[idx]
                      const signedUrl = file?.signed_url || (m.is_purchased && !m.is_locked ? m.src : null)
                      return {
                        id: m.id?.toString() || '',
                        type: m.type,
                        src: signedUrl || m.media_url || m.src || '',
                        thumbnail: m.src || '',
                      }
                    })
                    
                    return (
                      <div className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                        <article className={`rounded-2xl overflow-hidden p-2 ${
                          isOwn ? 'bg-[#FFE4EC]' : 'bg-gray-100'
                        }`}>
                          {/* 미디어 (상단) */}
                          {mediaFiles.length > 0 && (
                            isFreePost && !hasIndividualMediaPrices ? (
                              // 완전 무료 게시물: 첫 번째 미디어만 표시
                              mediaFiles[0].src ? (
                                <div className="overflow-hidden">
                                  {mediaFiles[0].type === 'video' ? (
                                    <video
                                      src={mediaFiles[0].src}
                                      className="w-full max-h-80 object-cover rounded-t-2xl"
                                      controls
                                      playsInline
                                    />
                                  ) : (
                                    <img
                                      src={mediaFiles[0].src}
                                      alt=""
                                      className="w-full max-h-80 object-cover rounded-t-2xl"
                                    />
                                  )}
                                </div>
                              ) : null
                            ) : (
                              // 유료 게시물 또는 개별 가격이 있는 미디어: 그리드로 표시
                              <div>
                                {mediaFiles.length === 1 ? (
                                  // 단일 미디어
                                  (() => {
                                    const media = mediaFiles[0]
                                    const displaySrc = media.src || '/placeholder.png'
                                    const shouldBlur = isWebEnvironment && media.is_purchased && !media.is_locked
                                    
                                    return (
                                      <div className="space-y-2">
                                        <div 
                                          className={`relative overflow-hidden rounded-xl ${!isWebEnvironment ? 'cursor-pointer' : ''}`}
                                          onClick={() => {
                                            if (!isWebEnvironment && !media.is_locked && feedMediaList.length > 0) {
                                              setMediaPreviewState({
                                                items: feedMediaList,
                                                index: 0,
                                                postId,
                                              })
                                            }
                                          }}
                                        >
                                          <div className="overflow-hidden w-full h-48">
                                            {media.type === 'video' ? (
                                              <video
                                                src={displaySrc}
                                                className={`w-full h-full object-cover ${shouldBlur ? 'blur-xl' : ''}`}
                                                muted
                                              />
                                            ) : (
                                              <img
                                                src={displaySrc}
                                                alt=""
                                                className={`w-full h-full object-cover ${shouldBlur ? 'blur-xl' : ''}`}
                                              />
                                            )}
                                          </div>
                                          {media.is_locked && (
                                            <>
                                              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                                              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                                <button
                                                  type="button"
                                                  onClick={(e) => {
                                                    e.stopPropagation()
                                                    onLockedPostClick?.(postId, media.final_price)
                                                  }}
                                                  className="flex flex-col items-center gap-1 rounded-full bg-white px-4 py-2 shadow-md hover:bg-gray-50 transition-colors"
                                                >
                                                  <div className="flex items-center gap-2">
                                                    <Heart className="h-4 w-4 fill-red-500 text-red-500" />
                                                    <div className="flex flex-col items-center">
                                                      {media.has_discount && (
                                                        <span className="text-xs text-gray-500 line-through">{media.base_price.toLocaleString()}P</span>
                                                      )}
                                                      <span className={`text-sm font-semibold ${media.has_discount ? 'text-[#FE3A8F]' : 'text-[#110f1a]'}`}>
                                                        {media.final_price.toLocaleString()}P
                                                      </span>
                                                    </div>
                                                  </div>
                                                </button>
                                              </div>
                                            </>
                                          )}
                                          {!media.is_locked && isWebEnvironment && (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  setShowAppDownloadPopup(true)
                                                }}
                                                className="px-4 py-2 bg-black text-white text-sm font-medium rounded-full hover:bg-[#e8328a] transition-colors"
                                              >
                                                앱에서 보기
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )
                                  })()
                                ) : (
                                  // 여러 미디어: 그리드로 표시
                                  <div className="space-y-2">
                                    <div className="px-2 -mx-2">
                                      <div className={`grid gap-1 ${
                                        mediaFiles.length === 2 ? 'grid-cols-2' : 'grid-cols-2'
                                      }`} style={{ minWidth: '240px', maxWidth: '100%' }}>
                                        {mediaFiles.map((media: any, idx: number) => {
                                          const displaySrc = media.src || '/placeholder.png'
                                          const shouldBlur = isWebEnvironment && media.is_purchased && !media.is_locked
                                          
                                          return (
                                            <div 
                                              key={media.id || idx} 
                                              className={`relative overflow-hidden rounded-lg ${!isWebEnvironment ? 'cursor-pointer' : ''}`} 
                                              style={{ minHeight: '100px', aspectRatio: '1/1' }}
                                              onClick={() => {
                                                if (!isWebEnvironment && !media.is_locked && feedMediaList.length > 0) {
                                                  setMediaPreviewState({
                                                    items: feedMediaList,
                                                    index: idx,
                                                    postId,
                                                  })
                                                }
                                              }}
                                            >
                                              <div className="overflow-hidden w-full h-full">
                                                {media.type === 'video' ? (
                                                  <video
                                                    src={displaySrc}
                                                    className={`w-full h-full object-cover ${shouldBlur ? 'blur-xl' : (!media.src ? 'blur-md' : '')}`}
                                                    muted
                                                  />
                                                ) : (
                                                  <img
                                                    src={displaySrc}
                                                    alt=""
                                                    className={`w-full h-full object-cover ${shouldBlur ? 'blur-xl' : (!media.src ? 'blur-md' : '')}`}
                                                  />
                                                )}
                                              </div>
                                              
                                              {media.is_locked ? (
                                                <>
                                                  <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
                                                  <div className="absolute inset-0 flex flex-col items-center justify-center p-2">
                                                    <button
                                                      type="button"
                                                      className="flex flex-col items-center gap-1 rounded-xl bg-white px-1 py-0.5 shadow-md hover:bg-gray-50 transition-colors"
                                                    >
                                                      <div className="flex items-center gap-1.5">
                                                        <Heart className="h-3 w-3 fill-red-500 text-red-500" />
                                                        <div className="flex flex-col items-center">
                                                          <span className={`text-xs font-bold ${media.has_discount ? 'text-[#FE3A8F]' : 'text-[#110f1a]'}`}>
                                                            {media.final_price.toLocaleString()}P
                                                          </span>
                                                        </div>
                                                      </div>
                                                    </button>
                                                  </div>
                                                </>
                                              ) : null}
                                            </div>
                                          )
                                        })}
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          )}
                          
                          {/* 본문 텍스트 (하단) */}
                          {postData.content && (
                            <div className="p-3">
                              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                                {postData.content}
                              </p>
                            </div>
                          )}
                          {/* 전체 금액 표시 및 포스트 열기 버튼 */}
                          {hasLockedMedia && (
                            <div className="p-2 space-y-2">
                              {/* 전체 금액 표시 */}
                              <div className="flex flex-col mb-1">
                                <div className="flex items-center gap-1">
                                  <Heart className="h-3 w-3 fill-red-500 text-red-500" />
                                  <span className={`text-sm font-semibold ${discountRate > 0 ? 'text-[#FE3A8F]' : 'text-[#110f1a]'}`}>
                                    {totalFinalPrice.toLocaleString()}P
                                  </span>
                                </div>
                                {discountRate > 0 && discountRate <= 100 && totalBasePrice > 0 && (
                                  <div className="flex items-center gap-1 pl-2 opacity-50">  
                                    <Heart className="h-2 w-2 fill-red-500 text-red-500" />
                                    <span className="text-xs text-gray-500 line-through mr-2">
                                      {totalBasePrice.toLocaleString()}P
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                           {hasLockedMedia && (
                             <div className="space-y-2">
                               <button
                                 type="button"
                                 onClick={() => {
                                   // 모든 구매에 바로 구매 확인 팝업만 띄우기
                                   setPurchaseOptionSheet({
                                     isOpen: true,
                                     postId,
                                     bundleTotal: totalFinalPrice,
                                     individualPrices: [],
                                     isBundle: true,
                                     selectedOption: null,
                                     selectedIndividualId: null,
                                   })
                                 }}
                                 className="w-full px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
                               >
                                 포스트 열기 ({totalFinalPrice.toLocaleString()}P)
                               </button>
                             </div>
                           )}
                           {!hasLockedMedia && hasPurchasedMedia && isWebEnvironment && (
                             <div className="space-y-2">
                               <button
                                 type="button"
                                 onClick={() => setShowAppDownloadPopup(true)}
                                 className="w-full px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-[#e8328a] transition-colors"
                               >
                                 앱에서 보기
                               </button>
                             </div>
                           )}
                        </article>
                        {isLastInGroup && (
                          <p className="text-xs text-gray-400 whitespace-nowrap">
                            {formatTime(message.created_at)}
                          </p>
                        )}
                      </div>
                    )
                  })() : message.message.includes('[STORE_PICKUP_CONFIRMED:') ? (() => {
                    const match = message.message.match(/\[STORE_PICKUP_CONFIRMED:([a-f0-9-]+)(?::([a-f0-9-]+))?\]/)
                    const orderId = match ? match[1] : null
                    const sellerPartnerId = match ? match[2] : null
                    const displayMessage = message.message.replace(/\n*\[STORE_PICKUP_CONFIRMED:[^\]]+\]/g, '').trim()
                    
                    const isSellerOfThisOrder = currentUserPartnerId && (
                      sellerPartnerId ? currentUserPartnerId === sellerPartnerId : true
                    )
                    const isProcessed = orderId && processedOrderIds.includes(orderId)
                    const showBuyerButtons = !isSellerOfThisOrder && !isOwn && orderId && onPickupComplete && onNoShow && !isProcessed
                    const hasButtons = !!showBuyerButtons
                    
                    return (
                      <div className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div className={`flex flex-col p-4 rounded-2xl ${
                          isOwn ? 'bg-[#FFE4EC]' : 'bg-gray-100'
                        } ${
                          isContinuation ? (isOwn ? 'rounded-tr-md' : 'rounded-tl-md') : ''
                        } ${
                          !isLastInGroup ? (isOwn ? 'rounded-br-md' : 'rounded-bl-md') : ''
                        }`}>
                          <div className={`text-sm leading-relaxed break-words whitespace-pre-wrap ${hasButtons ? 'mb-3' : ''}`}>
                            {displayMessage}
                          </div>
                          {showBuyerButtons && (
                            <div className="flex gap-2 mt-3">
                              <Button
                                onClick={() => {
                                  if (processingOrderIds.has(orderId)) return
                                  onNoShow(orderId)
                                }}
                                variant="outline"
                                size="sm"
                                className="border-gray-300 text-gray-600 hover:bg-white py-1 px-4 text-xs font-medium flex-1"
                                disabled={processingOrderIds.has(orderId)}
                              >
                                미수령
                              </Button>
                              <Button
                                onClick={() => {
                                  if (processingOrderIds.has(orderId)) return
                                  setProcessingOrderIds(prev => new Set(prev).add(orderId))
                                  onPickupComplete(orderId)
                                }}
                                variant="primary"
                                size="sm"
                                className="py-1 px-4 text-xs font-medium text-white flex-1"
                                style={{ backgroundColor: '#FE3A8F' }}
                                disabled={processingOrderIds.has(orderId)}
                              >
                                {processingOrderIds.has(orderId) ? '처리 중...' : '수령 완료'}
                              </Button>
                            </div>
                          )}
                        </div>
                        {isLastInGroup && (
                          <p className="text-xs text-gray-400 whitespace-nowrap">
                            {formatTime(message.created_at)}
                          </p>
                        )}
                      </div>
                    )
                  })() : message.message.includes('[STORE_ORDER_ON_SITE_COLLAB:') ? (() => {
                    /* 협업 현장수령 상품 구매 알림 - 이행완료 버튼만 표시 */
                    const match = message.message.match(/\[STORE_ORDER_ON_SITE_COLLAB:([a-f0-9-]+)(?::([a-f0-9-]+))?\]/)
                    const orderId = match ? match[1] : null
                    const sellerPartnerId = match ? match[2] : null
                    const displayMessage = message.message.replace(/\n*\[STORE_ORDER_ON_SITE_COLLAB:[^\]]+\]/g, '').trim()
                    
                    const isSellerOfThisOrder = currentUserPartnerId && (
                      sellerPartnerId ? currentUserPartnerId === sellerPartnerId : true
                    )
                    const hasFulfillment = orderId ? fulfillmentStatus.get(orderId) === true : false
                    const showFulfillButton = isSellerOfThisOrder && orderId && onFulfillOrder
                    const hasButtons = !!showFulfillButton
                    
                    return (
                      <div className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div className={`flex flex-col p-4 rounded-2xl ${
                          isOwn ? 'bg-[#FFE4EC]' : 'bg-gray-100'
                        } ${
                          isContinuation ? (isOwn ? 'rounded-tr-md' : 'rounded-tl-md') : ''
                        } ${
                          !isLastInGroup ? (isOwn ? 'rounded-br-md' : 'rounded-bl-md') : ''
                        }`}>
                          <div className={`text-sm leading-relaxed break-words whitespace-pre-wrap ${hasButtons ? 'mb-3' : ''}`}>
                            {displayMessage}
                          </div>
                          {showFulfillButton && (
                            <div className="flex gap-2 mt-3">
                              <Button
                                onClick={() => {
                                  onFulfillOrder(orderId)
                                  setTimeout(() => refreshFulfillmentStatus(orderId), 1000)
                                }}
                                variant="primary"
                                size="sm"
                                className={`py-1 px-4 text-xs font-medium text-white flex-1 ${hasFulfillment ? 'opacity-50' : ''}`}
                                style={{ backgroundColor: '#FE3A8F' }}
                                disabled={hasFulfillment}
                              >
                                {hasFulfillment ? '이행완료됨' : '이행완료'}
                              </Button>
                            </div>
                          )}
                        </div>
                        {isLastInGroup && (
                          <p className="text-xs text-gray-400 whitespace-nowrap">
                            {formatTime(message.created_at)}
                          </p>
                        )}
                      </div>
                    )
                  })() : message.message.includes('[STORE_ORDER_ON_SITE:') ? (() => {
                    /* 현장수령 상품 구매 알림 메시지 렌더링 */
                    const match = message.message.match(/\[STORE_ORDER_ON_SITE:([a-f0-9-]+)(?::([a-f0-9-]+))?\]/)
                    const orderId = match ? match[1] : null
                    const sellerPartnerId = match ? match[2] : null
                    const displayMessage = message.message.replace(/\n\[STORE_ORDER_ON_SITE:[^\]]+\]/, '')
                    
                    // sellerPartnerId가 있으면 매칭, 없으면 현재 사용자가 파트너인지만 확인
                    const isSellerOfThisOrder = currentUserPartnerId && (
                      sellerPartnerId ? currentUserPartnerId === sellerPartnerId : true
                    )
                    // 시스템 메시지인 경우: 파트너가 받는 메시지로 간주
                    const isSystemMessage = message.message_type === 'system' || message.sender_id !== currentUserId
                    // 이미 처리된 주문인지 확인
                    const isProcessed = orderId && processedOrderIds.includes(orderId)
                    // 파트너용 버튼 (일정확인/거절) - 해당 주문의 판매자만 볼 수 있음
                    const showPartnerButtons = isSellerOfThisOrder && isSystemMessage && orderId && onScheduleConfirm && onScheduleReject && !isProcessed
                    // 파트너용 이행완료 버튼
                    const showFulfillButton = isSellerOfThisOrder && orderId && onFulfillOrder
                    // 구매자용 버튼 (수령 완료/미수령) - 판매자가 아니고 본인이 보낸 메시지인 경우, 처리되지 않은 경우만
                    const showBuyerButtons = !isSellerOfThisOrder && isOwn && orderId && onPickupComplete && onNoShow && !isProcessed
                    const hasButtons = showPartnerButtons || showBuyerButtons || showFulfillButton
                    
                    return (
                      <div className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div className={`flex flex-col p-4 rounded-2xl ${
                          isOwn ? 'bg-[#FFE4EC]' : 'bg-gray-100'
                        } ${
                          isContinuation ? (isOwn ? 'rounded-tr-md' : 'rounded-tl-md') : ''
                        } ${
                          !isLastInGroup ? (isOwn ? 'rounded-br-md' : 'rounded-bl-md') : ''
                        }`}>
                          <div className={`text-sm leading-relaxed break-words whitespace-pre-wrap ${hasButtons ? 'mb-3' : ''}`}>
                            {displayMessage}
                          </div>
                          {showPartnerButtons && (
                            <div className="flex gap-2 mt-3">
                              <Button
                                onClick={() => {
                                  if (processingOrderIds.has(orderId)) return
                                  setProcessingOrderIds(prev => new Set(prev).add(orderId))
                                  onScheduleReject(orderId)
                                }}
                                variant="outline"
                                size="sm"
                                className="border-gray-300 text-gray-600 hover:bg-white py-1 px-4 text-xs font-medium flex-1"
                                disabled={processingOrderIds.has(orderId)}
                              >
                                {processingOrderIds.has(orderId) ? '처리 중...' : '거절'}
                              </Button>
                              <Button
                                onClick={() => {
                                  if (processingOrderIds.has(orderId)) return
                                  onScheduleConfirm(orderId)
                                }}
                                variant="primary"
                                size="sm"
                                className="py-1 px-4 text-xs font-medium text-white flex-1"
                                style={{ backgroundColor: '#FE3A8F' }}
                                disabled={processingOrderIds.has(orderId)}
                              >
                                일정확인
                              </Button>
                            </div>
                          )}
                          {showFulfillButton && !showPartnerButtons && (
                            <div className="flex gap-2 mt-3">
                              <Button
                                onClick={() => onFulfillOrder(orderId)}
                                variant="primary"
                                size="sm"
                                className="py-1 px-4 text-xs font-medium text-white flex-1"
                                style={{ backgroundColor: '#FE3A8F' }}
                              >
                                이행완료
                              </Button>
                            </div>
                          )}
                          {showBuyerButtons && (
                            <div className="flex gap-2 mt-3">
                              <Button
                                onClick={() => {
                                  if (processingOrderIds.has(orderId)) return
                                  onNoShow(orderId)
                                }}
                                variant="outline"
                                size="sm"
                                className="border-gray-300 text-gray-600 hover:bg-white py-1 px-4 text-xs font-medium flex-1"
                                disabled={processingOrderIds.has(orderId)}
                              >
                                미수령
                              </Button>
                              <Button
                                onClick={() => {
                                  if (processingOrderIds.has(orderId)) return
                                  setProcessingOrderIds(prev => new Set(prev).add(orderId))
                                  onPickupComplete(orderId)
                                }}
                                variant="primary"
                                size="sm"
                                className="py-1 px-4 text-xs font-medium text-white flex-1"
                                style={{ backgroundColor: '#FE3A8F' }}
                                disabled={processingOrderIds.has(orderId)}
                              >
                                {processingOrderIds.has(orderId) ? '처리 중...' : '수령 완료'}
                              </Button>
                            </div>
                          )}
                        </div>
                        {isLastInGroup && (
                          <p className="text-xs text-gray-400 whitespace-nowrap">
                            {formatTime(message.created_at)}
                          </p>
                        )}
                      </div>
                    )
                  })() : message.message.includes('[STORE_ORDER_DELIVERY_COLLAB:') ? (() => {
                    /* 협업 택배 상품 구매 알림 메시지 렌더링 */
                    const match = message.message.match(/\[STORE_ORDER_DELIVERY_COLLAB:([a-f0-9-]+)(?::([a-f0-9-]+))?\]/)
                    const orderId = match ? match[1] : null
                    const sellerPartnerId = match ? match[2] : null
                    const displayMessage = message.message.replace(/\n*\[STORE_ORDER_DELIVERY_COLLAB:[^\]]+\]/g, '').trim()
                    
                    // sellerPartnerId가 있으면 매칭, 없으면 현재 사용자가 파트너인지만 확인
                    const isSellerOfThisOrder = currentUserPartnerId && (
                      sellerPartnerId ? currentUserPartnerId === sellerPartnerId : true
                    )
                    const hasFulfillment = orderId ? fulfillmentStatus.get(orderId) === true : false
                    const showFulfillButton = isSellerOfThisOrder && orderId && onFulfillOrder
                    const hasButtons = !!showFulfillButton
                    
                    return (
                      <div className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div className={`flex flex-col p-2 rounded-2xl ${
                          isOwn ? 'bg-[#FFE4EC]' : 'bg-gray-100'
                        } ${
                          isContinuation ? (isOwn ? 'rounded-tr-md' : 'rounded-tl-md') : ''
                        } ${
                          !isLastInGroup ? (isOwn ? 'rounded-br-md' : 'rounded-bl-md') : ''
                        }`}>
                          <div className={`text-sm leading-relaxed break-words whitespace-pre-wrap p-2 ${hasButtons ? 'mb-3' : ''}`}>
                            {displayMessage}
                          </div>
                          {showFulfillButton && (
                            <div className="flex gap-2 mt-3">
                              <Button
                                onClick={() => {
                                  onFulfillOrder(orderId)
                                  setTimeout(() => refreshFulfillmentStatus(orderId), 1000)
                                }}
                                variant="primary"
                                size="sm"
                                className={`py-1 px-4 text-xs font-medium text-white flex-1 ${hasFulfillment ? 'opacity-50' : ''}`}
                                style={{ backgroundColor: '#FE3A8F' }}
                                disabled={hasFulfillment}
                              >
                                {hasFulfillment ? '이행완료됨' : '이행완료'}
                              </Button>
                            </div>
                          )}
                        </div>
                        {isLastInGroup && (
                          <p className="text-xs text-gray-400 whitespace-nowrap">
                            {formatTime(message.created_at)}
                          </p>
                        )}
                      </div>
                    )
                  })() : message.message.includes('[STORE_ORDER_DELIVERY:') ? (() => {
                    /* 택배 상품 구매 알림 메시지 렌더링 */
                    const match = message.message.match(/\[STORE_ORDER_DELIVERY:([a-f0-9-]+)(?::([a-f0-9-]+))?\]/)
                    const orderId = match ? match[1] : null
                    const sellerPartnerId = match ? match[2] : null
                    const displayMessage = message.message.replace(/\n\[STORE_ORDER_DELIVERY:[^\]]+\]/, '')
                    
                    // sellerPartnerId가 있으면 매칭, 없으면 현재 사용자가 파트너인지만 확인
                    const isSellerOfThisOrder = currentUserPartnerId && (
                      sellerPartnerId ? currentUserPartnerId === sellerPartnerId : true
                    )
                    const isSystemMessage = message.message_type === 'system' || message.sender_id !== currentUserId
                    const showButtons = isSellerOfThisOrder && isSystemMessage && orderId && onTrackingInput && onOrderCancel
                    const showFulfillButton = isSellerOfThisOrder && orderId && onFulfillOrder
                    const hasButtons = showButtons || showFulfillButton
                    
                    return (
                      <div className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div className={`flex flex-col p-2 rounded-2xl ${
                          isOwn ? 'bg-[#FFE4EC]' : 'bg-gray-100'
                        } ${
                          isContinuation ? (isOwn ? 'rounded-tr-md' : 'rounded-tl-md') : ''
                        } ${
                          !isLastInGroup ? (isOwn ? 'rounded-br-md' : 'rounded-bl-md') : ''
                        }`}>
                          <div className={`text-sm leading-relaxed break-words whitespace-pre-wrap p-2 ${hasButtons ? 'mb-3' : ''}`}>
                            {displayMessage}
                          </div>
                          {hasButtons && (
                            <div className="flex flex-col gap-2 mt-3">
                              {showFulfillButton && (
                                <Button
                                  onClick={() => onFulfillOrder(orderId)}
                                  variant="primary"
                                  size="sm"
                                  className="py-1 px-4 text-xs font-medium text-white w-full"
                                  style={{ backgroundColor: '#FE3A8F' }}
                                >
                                  이행완료
                                </Button>
                              )}
                              {showButtons && (
                                <div className="flex gap-2">
                                  <Button
                                    onClick={() => {
                                      if (processingOrderIds.has(orderId)) return
                                      setProcessingOrderIds(prev => new Set(prev).add(orderId))
                                      onOrderCancel(orderId)
                                    }}
                                    variant="outline"
                                    size="sm"
                                    className="border-red-300 text-red-600 hover:bg-red-50 py-1 px-4 text-xs font-medium flex-1"
                                    disabled={processingOrderIds.has(orderId)}
                                  >
                                    {processingOrderIds.has(orderId) ? '처리 중...' : '주문 취소'}
                                  </Button>
                                  <Button
                                    onClick={() => {
                                      if (processingOrderIds.has(orderId)) return
                                      onTrackingInput(orderId)
                                    }}
                                    variant="primary"
                                    size="sm"
                                    className="py-1 px-4 text-xs font-medium text-white flex-1"
                                    style={{ backgroundColor: 'black' }}
                                    disabled={processingOrderIds.has(orderId)}
                                  >
                                    송장 입력
                                  </Button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        {isLastInGroup && (
                          <p className="text-xs text-gray-400 whitespace-nowrap">
                            {formatTime(message.created_at)}
                          </p>
                        )}
                      </div>
                    )
                  })() : message.message.includes('[STORE_ORDER_DIGITAL:') ? (() => {
                    /* 디지털 상품 구매 알림 메시지 렌더링 */
                    const match = message.message.match(/\[STORE_ORDER_DIGITAL:([a-f0-9-]+)(?::([a-f0-9-]+))?\]/)
                    const orderId = match ? match[1] : null
                    const sellerPartnerId = match ? match[2] : null
                    const displayMessage = message.message.replace(/\n*\[STORE_ORDER_DIGITAL:[^\]]+\]/g, '').trim()
                    
                    // 구매자인지 확인: 현재 사용자가 판매자가 아닌 경우
                    // sellerPartnerId가 있으면 매칭, 없으면 현재 사용자가 파트너인지만 확인
                    const isSellerOfThisOrder = currentUserPartnerId && (
                      sellerPartnerId ? currentUserPartnerId === sellerPartnerId : true
                    )
                    const isBuyer = !isSellerOfThisOrder
                    const showButtons = isBuyer && orderId && (onDigitalView || onDigitalDownload)
                    
                    return (
                      <div className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div className={`flex flex-col p-2 rounded-2xl ${
                          isOwn ? 'bg-[#FFE4EC]' : 'bg-gray-100'
                        } ${
                          isContinuation ? (isOwn ? 'rounded-tr-md' : 'rounded-tl-md') : ''
                        } ${
                          !isLastInGroup ? (isOwn ? 'rounded-br-md' : 'rounded-bl-md') : ''
                        }`}>
                          <div className={`text-sm leading-relaxed break-words whitespace-pre-wrap p-2 ${showButtons ? 'mb-3' : ''}`}>
                            {displayMessage}
                          </div>
                          {showButtons && (
                            <div className="flex gap-2 mt-3">
                              {onDigitalView && (
                                <Button
                                  onClick={() => {
                                    if (processingOrderIds.has(orderId)) return
                                    setProcessingOrderIds(prev => new Set(prev).add(orderId))
                                    onDigitalView(orderId)
                                    setTimeout(() => setProcessingOrderIds(prev => {
                                      const next = new Set(prev)
                                      next.delete(orderId)
                                      return next
                                    }), 2000)
                                  }}
                                  variant="primary"
                                  size="sm"
                                  className="py-1 px-4 text-xs font-medium text-white flex-1"
                                  style={{ backgroundColor: 'black' }}
                                  disabled={processingOrderIds.has(orderId)}
                                >
                                  {processingOrderIds.has(orderId) ? '처리 중...' : '바로보기'}
                                </Button>
                              )}
                              {onDigitalDownload && (
                                <Button
                                  onClick={() => {
                                    if (processingOrderIds.has(orderId)) return
                                    setProcessingOrderIds(prev => new Set(prev).add(orderId))
                                    onDigitalDownload(orderId)
                                    setTimeout(() => setProcessingOrderIds(prev => {
                                      const next = new Set(prev)
                                      next.delete(orderId)
                                      return next
                                    }), 2000)
                                  }}
                                  variant="outline"
                                  size="sm"
                                  className="py-1 px-4 text-xs font-medium flex-1"
                                  disabled={processingOrderIds.has(orderId)}
                                >
                                  {processingOrderIds.has(orderId) ? '처리 중...' : '다운로드'}
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                        {isLastInGroup && (
                          <p className="text-xs text-gray-400 whitespace-nowrap">
                            {formatTime(message.created_at)}
                          </p>
                        )}
                      </div>
                    )
                  })() : message.message.includes('[STORE_ORDER:') || message.message.includes('[STORE_ORDER_COLLAB:') || message.message.includes('[STORE_ORDER_CART:') ? (() => {
                    /* 장바구니 주문 알림 메시지 렌더링 (협업 상품 포함) */
                    const match = message.message.match(/\[STORE_ORDER(?:_COLLAB|_CART)?:([a-f0-9-]+)(?::([a-f0-9-]+))?\]/)
                    const orderId = match ? match[1] : null
                    const sellerPartnerId = match ? match[2] : null
                    // STORE_ORDER, STORE_ORDER_COLLAB, STORE_ORDER_CART 태그 모두 제거
                    const displayMessage = message.message
                      .replace(/\n*\[STORE_ORDER:[^\]]+\]/g, '')
                      .replace(/\n*\[STORE_ORDER_COLLAB:[^\]]+\]/g, '')
                      .replace(/\n*\[STORE_ORDER_CART:[^\]]+\]/g, '')
                      .trim()
                    
                    // sellerPartnerId가 있으면 매칭, 없으면 현재 사용자가 파트너인지만 확인
                    const isSellerOfThisOrder = currentUserPartnerId && (
                      sellerPartnerId ? currentUserPartnerId === sellerPartnerId : true
                    )
                    const showButton = orderId && onViewStoreOrder
                    
                    return (
                      <div className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div className={`flex flex-col p-2 rounded-2xl ${
                          isOwn ? 'bg-[#FFE4EC]' : 'bg-gray-100'
                        } ${
                          isContinuation ? (isOwn ? 'rounded-tr-md' : 'rounded-tl-md') : ''
                        } ${
                          !isLastInGroup ? (isOwn ? 'rounded-br-md' : 'rounded-bl-md') : ''
                        }`}>
                          <div className={`text-sm leading-relaxed break-words whitespace-pre-wrap p-2 ${showButton ? 'mb-3' : ''}`}>
                            {displayMessage}
                          </div>
                          {showButton && (
                            <Button
                              onClick={() => onViewStoreOrder(orderId, sellerPartnerId, isSellerOfThisOrder || false)}
                              variant="primary"
                              size="sm"
                              className="w-full py-2 px-4 text-sm font-medium text-white"
                              style={{ backgroundColor: 'black' }}
                            >
                              주문 확인
                            </Button>
                          )}
                        </div>
                        {isLastInGroup && (
                          <p className="text-xs text-gray-400 whitespace-nowrap">
                            {formatTime(message.created_at)}
                          </p>
                        )}
                      </div>
                    )
                  })() : message.message.includes('[FULFILLMENT_MEDIA:') ? (() => {
                    /* 이행완료 미디어 메시지 렌더링 */
                    const mediaMatch = message.message.match(/\[FULFILLMENT_MEDIA:([^\]]+)\]/)
                    const mediaUrls = mediaMatch ? mediaMatch[1].split(',').filter(url => url.trim()) : []
                    const displayMessage = message.message
                      .replace(/\n*\[FULFILLMENT_MEDIA:[^\]]+\]/g, '')
                      .trim()
                    
                    return (
                      <div className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                        <div className={`flex flex-col max-w-sm lg:max-w-lg rounded-2xl ${
                          isOwn ? 'bg-[#FFE4EC]' : 'bg-gray-100'
                        } ${
                          isContinuation ? (isOwn ? 'rounded-tr-md' : 'rounded-tl-md') : ''
                        } ${
                          !isLastInGroup ? (isOwn ? 'rounded-br-md' : 'rounded-bl-md') : ''
                        }`}>
                          {displayMessage && (
                            <div className="text-sm leading-relaxed break-words whitespace-pre-wrap px-4 py-3">
                              {displayMessage}
                            </div>
                          )}
                          {mediaUrls.length > 0 && (
                            <div className={`grid gap-1 p-1 ${
                              mediaUrls.length === 1 ? 'grid-cols-1' : 
                              mediaUrls.length === 2 ? 'grid-cols-2' : 
                              'grid-cols-3'
                            }`} style={{ maxWidth: '300px' }}>
                              {mediaUrls.map((url, idx) => (
                                <div key={idx} className="relative" onContextMenu={(e) => e.preventDefault()}>
                                  <img 
                                    src={url.trim()} 
                                    alt={`이행완료 이미지 ${idx + 1}`}
                                    className="rounded-lg w-full h-auto cursor-pointer hover:opacity-90 transition-opacity select-none"
                                    style={{ maxWidth: '150px', maxHeight: '150px', objectFit: 'cover' }}
                                    draggable={false}
                                    onClick={() => setPreviewImage(url.trim())}
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        {isLastInGroup && (
                          <p className="text-xs text-gray-400 whitespace-nowrap">
                            {formatTime(message.created_at)}
                          </p>
                        )}
                      </div>
                    )
                  })() : (
                    <div className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div
                        className={`max-w-sm lg:max-w-lg shadow-sm ${
                          message.chat_media && message.chat_media.length > 0 ? 'p-1' : 'px-4 py-3'
                        } ${
                          isOwn
                            ? 'bg-[#FFE4EC] text-gray-900 rounded-2xl rounded-br-md'
                            : 'bg-gray-100 text-gray-900 rounded-2xl rounded-bl-md'
                        } ${
                          isContinuation
                            ? isOwn
                              ? 'rounded-tr-md'
                              : 'rounded-tl-md'
                            : ''
                        } ${
                          !isLastInGroup
                            ? isOwn
                              ? 'rounded-br-md'
                              : 'rounded-bl-md'
                            : ''
                        }`}
                      >
                        {/* 미디어 렌더링 */}
                        {message.chat_media && message.chat_media.length > 0 && (
                          <div className={`grid gap-1 ${
                            message.chat_media.length === 1 ? 'grid-cols-1' : 
                            message.chat_media.length === 2 ? 'grid-cols-2' : 
                            'grid-cols-3'
                          }`} style={{ maxWidth: '200px' }}>
                            {message.chat_media.map((media, mediaIdx) => {
                              // 상대 경로면 전체 URL로 변환
                              const SUPABASE_URL = 'https://rmooqijhkmomdtkvuzrr.supabase.co'
                              const mediaUrl = media.media_url.startsWith('http') 
                                ? media.media_url 
                                : `${SUPABASE_URL}/storage/v1/object/public/chat-media/${media.media_url}`
                              
                              return (
                                <div 
                                  key={media.id || mediaIdx} 
                                  className="relative"
                                  onContextMenu={(e) => e.preventDefault()}
                                >
                                  {media.media_type === 'image' ? (
                                    <>
                                      <img 
                                        src={mediaUrl} 
                                        alt={media.file_name || '이미지'} 
                                        className="rounded-lg w-full h-auto cursor-pointer hover:opacity-90 transition-opacity select-none"
                                        style={{ maxWidth: '150px', maxHeight: '150px', objectFit: 'cover' }}
                                        draggable={false}
                                        onClick={() => setPreviewImage(mediaUrl)}
                                      />
                                      {WatermarkOverlay}
                                    </>
                                  ) : media.media_type === 'video' ? (
                                    <div 
                                      className="relative rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                                      style={{ maxWidth: '150px', maxHeight: '150px' }}
                                      onClick={() => setPreviewVideo(mediaUrl)}
                                    >
                                      <video 
                                        src={mediaUrl}
                                        poster={media.thumbnail_url}
                                        className="w-full h-full object-cover select-none"
                                        muted
                                        playsInline
                                      />
                                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                        <div className="bg-black/50 rounded-full p-2">
                                          <Play className="w-6 h-6 text-white" fill="white" />
                                        </div>
                                      </div>
                                      {WatermarkOverlay}
                                    </div>
                                  ) : (
                                    <a 
                                      href={mediaUrl} 
                                      target="_blank" 
                                      rel="noopener noreferrer"
                                      className={`block p-2 rounded ${isOwn ? 'text-pink-100' : 'text-blue-600'}`}
                                    >
                                      📎 {media.file_name || '파일'}
                                    </a>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                        {/* 텍스트 메시지 (미디어 전용이 아닐 경우) */}
                        {message.message && !['사진을 보냈습니다', '사진 보냅니다'].includes(message.message) && (
                          <div className={`text-sm leading-relaxed break-words whitespace-pre-wrap ${
                            message.chat_media && message.chat_media.length > 0 ? 'px-3 py-2' : ''
                          }`}>
                            {message.message}
                          </div>
                        )}
                      </div>
                      {isLastInGroup && (
                        <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                          <p className="text-xs text-gray-400 whitespace-nowrap">
                            {formatTime(message.created_at)}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {/* 구매 옵션 선택 팝업 */}
      <SlideSheet
        isOpen={purchaseOptionSheet.isOpen}
        onClose={() => setPurchaseOptionSheet({ 
          isOpen: false, 
          postId: null, 
          bundleTotal: 0, 
          individualPrices: [],
          isBundle: false,
          selectedOption: null,
          selectedIndividualId: null,
        })}
        title="포스트 구매"
        initialHeight={0.35}
        minHeight={0.25}
        maxHeight={0.7}
        footer={
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setPurchaseOptionSheet({ 
                isOpen: false, 
                postId: null, 
                bundleTotal: 0, 
                individualPrices: [],
                isBundle: false,
                selectedOption: null,
                selectedIndividualId: null,
              })}
              className="flex-1 h-12 font-semibold"
            >
              취소
            </Button>
            <Button
              onClick={async () => {
                if (!purchaseOptionSheet.postId || isProcessingPurchase) return
                
                // 포인트 확인
                if (userPoints < purchaseOptionSheet.bundleTotal) {
                  if (onChargeRequest) {
                    onChargeRequest(purchaseOptionSheet.bundleTotal)
                  } else {
                    toast.error(`포인트가 부족합니다. (보유: ${userPoints.toLocaleString()}P, 필요: ${purchaseOptionSheet.bundleTotal.toLocaleString()}P)`)
                  }
                  setPurchaseOptionSheet({ 
                    isOpen: false, 
                    postId: null, 
                    bundleTotal: 0, 
                    individualPrices: [],
                    isBundle: false,
                    selectedOption: null,
                    selectedIndividualId: null,
                  })
                  return
                }
                
                setIsProcessingPurchase(true)
                try {
                  if (onDirectPostPurchase) {
                    const success = await onDirectPostPurchase(purchaseOptionSheet.postId, purchaseOptionSheet.bundleTotal)
                    if (success && onPostPurchaseSuccess) {
                      onPostPurchaseSuccess(purchaseOptionSheet.postId)
                    }
                  } else if (onLockedPostClick) {
                    onLockedPostClick(purchaseOptionSheet.postId, purchaseOptionSheet.bundleTotal)
                  }
                } finally {
                  setIsProcessingPurchase(false)
                  setPurchaseOptionSheet({ 
                    isOpen: false, 
                    postId: null, 
                    bundleTotal: 0, 
                    individualPrices: [],
                    isBundle: false,
                    selectedOption: null,
                    selectedIndividualId: null,
                  })
                }
              }}
              className="flex-1 h-12 bg-[#FE3A8F] text-white font-semibold hover:bg-[#e8328a] transition-colors shadow-sm"
              disabled={isProcessingPurchase}
            >
              {isProcessingPurchase ? '처리 중...' : '구매하기'}
            </Button>
          </div>
        }
      >
        {/* 구매 확인 메시지 */}
        <div className="px-6 py-8">
          <div className="text-center space-y-4">
            <Typography variant="h5" className="font-semibold text-gray-800 mb-2">
              이 포스트를 구매하시겠습니까?
            </Typography>
            <div className="flex items-center justify-center gap-2">
              <Heart className="h-4 w-4 fill-red-500 text-red-500" />
              <Typography variant="h4" className="font-bold text-[#FE3A8F]">
                {purchaseOptionSheet.bundleTotal.toLocaleString()}P
              </Typography>
            </div>
          </div>
        </div>
      </SlideSheet>
      
      {/* 전체 화면 미디어 프리뷰 */}
      {mediaPreviewState && (
        <MediaPreview
          items={mediaPreviewState.items}
          initialIndex={mediaPreviewState.index}
          postId={mediaPreviewState.postId}
          onClose={() => setMediaPreviewState(null)}
          memberCode={memberCode}
        />
      )}
      </>
    )
  }
)