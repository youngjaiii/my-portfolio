import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, Heart, MessageCircle, Send, X, Package } from 'lucide-react'
import { createFileRoute, useNavigate, Outlet, useMatches } from '@tanstack/react-router'
import { AvatarWithFallback, Typography, SlideSheet, Input } from '@/components'
import {
  FeedMediaCarousel,
  type FeedPost,
  type FeedMedia,
  type FeedComment,
  MediaPreview,
  CommentList,
  updateGlobalLikeState,
  incrementGlobalCommentCount,
} from '../feed/all'
import { mapApiFilesToMediaWithSignedUrls } from '@/utils/media'
import { useAuthStore } from '@/store/useAuthStore'
import { resolveAccessToken } from '@/utils/sessionToken'
import { CaptureProtection } from '@/components/CaptureProtection'
import { useBannedWords } from '@/hooks/useBannedWords'
import { storeOrdersApi, type StoreOrder, type OrderItem, type Shipment } from '@/api/store/orders'

const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const CURRENT_YEAR = new Date().getFullYear()
const YEAR_OPTIONS = [CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2] as const
const DEFAULT_YEAR = YEAR_OPTIONS[0]

export const Route = createFileRoute('/mypage/purchases' as const)({
  component: PurchasesPage,
})

const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
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
    }
    const diffInYears = Math.floor(diffInDays / 365)
    return `${diffInYears}년 전`
  }
}

const mapApiCommentsToFeed = (comments: any[]): FeedComment[] =>
  comments.map((comment) => {
    const userName =
      comment.user?.name ||
      (comment.user_id ? comment.user_id.slice(0, 8) : '익명')

    const avatar = comment.user?.profile_image ?? undefined

    return {
      id: comment.id,
      user: userName,
      userId: comment.user?.id || comment.user_id,
      createdAt: comment.created_at,
      text: comment.content,
      avatar,
      replies: comment.replies ? mapApiCommentsToFeed(comment.replies) : [],
    }
  })

function PurchasesPage() {
  const matches = useMatches()
  
  const lastMatch = matches[matches.length - 1]
  const isChildRouteActive = lastMatch?.routeId && lastMatch.routeId !== Route.id
  
  if (isChildRouteActive) {
    return <Outlet />
  }
  
  return <PurchasesPageContent />
}

function PurchasesPageContent() {
  const navigate = useNavigate()
  const authAccessToken = useAuthStore((state) => state.accessToken)
  const authRefreshToken = useAuthStore((state) => state.refreshToken)
  const syncSession = useAuthStore((state) => state.syncSession)
  const user = useAuthStore((state) => state.user)
  const { findProhibitedWord } = useBannedWords()
  const [activeTab, setActiveTab] = useState<'feed' | 'store'>('feed')
  const [purchasedPosts, setPurchasedPosts] = useState<FeedPost[]>([])
  const [likesState, setLikesState] = useState<Record<string, { liked: boolean; count: number }>>({})
  const [isLoadingPurchasedPosts, setIsLoadingPurchasedPosts] = useState(false)
  const [purchasedPostsError, setPurchasedPostsError] = useState<string | null>(null)
  const [selectedYear, setSelectedYear] = useState<number>(DEFAULT_YEAR)
  const [isDateFilterOpen, setIsDateFilterOpen] = useState(false)
  const filterDropdownRef = useRef<HTMLDivElement | null>(null)
  const [storeOrders, setStoreOrders] = useState<StoreOrder[]>([])
  const [isLoadingStoreOrders, setIsLoadingStoreOrders] = useState(false)
  const [storeOrdersError, setStoreOrdersError] = useState<string | null>(null)
  const [storeOrdersPage, setStoreOrdersPage] = useState(1)
  const [hasMoreStoreOrders, setHasMoreStoreOrders] = useState(true)
  const [isLoadingMoreOrders, setIsLoadingMoreOrders] = useState(false)
  const loadMoreOrdersRef = useRef<HTMLDivElement>(null)
  const [previewState, setPreviewState] = useState<{
    postId: string
    items: FeedMedia[]
    index: number
    isLiked?: boolean
    likeCount?: number
    commentCount?: number
  } | null>(null)
  const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(null)
  const [isCommentSheetVisible, setIsCommentSheetVisible] = useState(false)
  const commentSheetCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [activeComments, setActiveComments] = useState<FeedComment[]>([])
  const [collapsedReplies, setCollapsedReplies] = useState<Record<string, boolean>>({})
  const [isCommentsLoading, setIsCommentsLoading] = useState(false)
  const [commentDraft, setCommentDraft] = useState('')
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)
  const [replyingToId, setReplyingToId] = useState<string | null>(null)

  const selectedRange = useMemo(() => {
    const startAt = `${selectedYear}-01-01`
    const endAt = `${selectedYear}-12-31`
    return { startAt, endAt }
  }, [selectedYear])

  useEffect(() => {
    if (!isDateFilterOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (!filterDropdownRef.current) return
      if (!filterDropdownRef.current.contains(event.target as Node)) {
        setIsDateFilterOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isDateFilterOpen])

  useEffect(() => {
    if (activeCommentPostId) {
      setIsCommentSheetVisible(false)
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => setIsCommentSheetVisible(true))
      })
      return () => cancelAnimationFrame(frame)
    }
    setIsCommentSheetVisible(false)
  }, [activeCommentPostId])

  useEffect(() => {
    return () => {
      if (commentSheetCloseTimeoutRef.current) {
        clearTimeout(commentSheetCloseTimeoutRef.current)
      }
    }
  }, [])

  const transformUnlockRecord = useCallback(async (record: any): Promise<FeedPost | null> => {
    const post = record?.post || record
    if (!post) return null

    const id = post.id || post.post_id || record.post_id
    if (!id) return null

    const partnerInfo = post.partner || record.partner || {}
    const partnerMember = partnerInfo.member || {}

    const authorName =
      partnerInfo.name ||
      partnerInfo.partner_name ||
      partnerMember.name ||
      '알 수 없음'

    const authorHandle =
      partnerInfo.member_code ||
      partnerMember.member_code ||
      post.partner_code ||
      post.partner_member_code ||
      (typeof post.partner_id === 'string' ? post.partner_id.slice(0, 6) : id.slice(0, 6))

    const profileImage =
      partnerInfo.profile_image ||
      partnerMember.profile_image ||
      post.profile_image ||
      record.profile_image ||
      undefined

    const rawFiles =
      (Array.isArray(post.files) && post.files.length > 0 && post.files) ||
      (Array.isArray(record.files) && record.files.length > 0 && record.files) ||
      []

    let media: FeedMedia[] | undefined
    if (rawFiles.length > 0) {
      try {
        media = (await mapApiFilesToMediaWithSignedUrls(rawFiles)) as FeedMedia[]
      } catch (error) {
        console.error('구매 포스트 미디어 변환 실패:', error)
      }
    } else if (Array.isArray(post.media) && post.media.length > 0) {
      media = post.media as FeedMedia[]
    }

    return {
      id,
      partnerId: post.partner_id || partnerInfo.id,
      category: 'subscription',
      author: {
        name: authorName,
        handle: authorHandle || 'partner',
        avatar: profileImage,
      },
      postedAt:
        post.published_at ||
        record.unlocked_at ||
        post.created_at ||
        new Date().toISOString(),
      content: post.content || '',
      media,
      likes: Number(post.like_count ?? 0),
      comments: [],
      tags: [],
      isLiked: Boolean(post.is_liked),
      commentCount: Number(post.comment_count ?? 0),
      isSubscribersOnly: Boolean(post.is_subscribers_only),
      pointPrice: post.point_price ?? null,
      isPurchased: true,
      isPaidPost: Boolean(post.is_paid_post ?? post.point_price),
      purchasedMediaOrder: record.media_order ?? null,
    }
  }, [])

  useEffect(() => {
    if (activeTab !== 'feed') return
    let cancelled = false

    const fetchUnlockedPosts = async () => {
      setIsLoadingPurchasedPosts(true)
      setPurchasedPostsError(null)
      try {
        const token = await resolveAccessToken({
          accessToken: authAccessToken,
          refreshToken: authRefreshToken,
          syncSession,
        })

        if (!token) {
          throw new Error('로그인이 필요합니다.')
        }

        const params = new URLSearchParams({
          start_at: selectedRange.startAt,
          end_at: selectedRange.endAt,
        })

        const response = await fetch(
          `${EDGE_FUNCTIONS_URL}/functions/v1/api-post-unlocks?${params.toString()}`,
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
          throw new Error(result.error || '구매한 포스트를 불러오지 못했습니다.')
        }

        const payload = Array.isArray(result.data)
          ? result.data
          : result.data?.posts || result.data?.items || result.data?.unlocks || []

        const normalized = (
          await Promise.all(payload.map((item: any) => transformUnlockRecord(item)))
        )
          .filter(Boolean)
          .map((item) => item as FeedPost)
          .sort(
            (a, b) =>
              new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime(),
          )

        if (cancelled) return
        setPurchasedPosts(normalized)
        setLikesState((prev) => {
          const patch: Record<string, { liked: boolean; count: number }> = {}
          normalized.forEach((post) => {
            if (prev[post.id]) return
            patch[post.id] = {
              liked: post.isLiked ?? false,
              count: post.likes ?? 0,
            }
          })
          return Object.keys(patch).length > 0 ? { ...prev, ...patch } : prev
        })
      } catch (error: any) {
        if (cancelled) return
        setPurchasedPosts([])
        setPurchasedPostsError(error?.message || '구매한 포스트를 불러오지 못했습니다.')
      } finally {
        if (!cancelled) {
          setIsLoadingPurchasedPosts(false)
        }
      }
    }

    fetchUnlockedPosts()
    return () => {
      cancelled = true
    }
  }, [
    activeTab,
    authAccessToken,
    authRefreshToken,
    selectedRange.endAt,
    selectedRange.startAt,
    syncSession,
    transformUnlockRecord,
  ])

  useEffect(() => {
    if (activeTab !== 'store') return
    let cancelled = false

    const fetchStoreOrders = async () => {
      const isFirstPage = storeOrdersPage === 1
      if (isFirstPage) {
        setIsLoadingStoreOrders(true)
      } else {
        setIsLoadingMoreOrders(true)
      }
      setStoreOrdersError(null)
      try {
        const response = await storeOrdersApi.getList({
          page: storeOrdersPage,
          limit: 20,
          includeTracking: true,
        })

        if (response.success && response.data) {
          const orders = Array.isArray(response.data) ? response.data : (response.data as any).orders || []
          if (cancelled) return
          
          if (isFirstPage) {
            setStoreOrders(orders)
          } else {
            setStoreOrders(prev => [...prev, ...orders])
          }
          
          // 20개 미만이면 더 이상 데이터 없음
          setHasMoreStoreOrders(orders.length >= 20)
        } else {
          throw new Error(response.error?.message || '주문 목록을 불러오지 못했습니다.')
        }
      } catch (error: any) {
        if (cancelled) return
        if (isFirstPage) {
          setStoreOrders([])
        }
        setStoreOrdersError(error?.message || '주문 목록을 불러오지 못했습니다.')
      } finally {
        if (!cancelled) {
          setIsLoadingStoreOrders(false)
          setIsLoadingMoreOrders(false)
        }
      }
    }

    fetchStoreOrders()
    return () => {
      cancelled = true
    }
  }, [activeTab, storeOrdersPage])

  // 스토어 주문 무한 스크롤
  const loadMoreOrders = useCallback(() => {
    if (hasMoreStoreOrders && !isLoadingMoreOrders && !isLoadingStoreOrders) {
      setStoreOrdersPage(prev => prev + 1)
    }
  }, [hasMoreStoreOrders, isLoadingMoreOrders, isLoadingStoreOrders])

  useEffect(() => {
    if (activeTab !== 'store') return
    if (storeOrders.length === 0) return // 데이터가 로드된 후에만 observer 연결

    const currentRef = loadMoreOrdersRef.current
    if (!currentRef) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMoreOrders()
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    )

    observer.observe(currentRef)

    return () => {
      observer.disconnect()
    }
  }, [activeTab, loadMoreOrders, storeOrders.length])

  // 탭 변경 시 페이지 초기화 (store 탭 진입 시)
  const prevActiveTabRef = useRef(activeTab)
  useEffect(() => {
    if (activeTab === 'store' && prevActiveTabRef.current !== 'store') {
      // 다른 탭에서 store로 전환했을 때만 초기화
      setStoreOrders([])
      setStoreOrdersPage(1)
      setHasMoreStoreOrders(true)
    }
    prevActiveTabRef.current = activeTab
  }, [activeTab])

  const selectedYearLabel = useMemo(() => `${selectedYear}년 전체`, [selectedYear])

  const handlePreviewMedia = useCallback(
    (
      postId: string,
      mediaList: FeedMedia[],
      index: number,
      meta?: { isLiked?: boolean; likeCount?: number; commentCount?: number },
    ) => {
      if (!mediaList || mediaList.length === 0) return
      const likeSnapshot = likesState[postId]
      setPreviewState({
        postId,
        items: mediaList,
        index,
        isLiked: likeSnapshot?.liked ?? meta?.isLiked,
        likeCount: likeSnapshot?.count ?? meta?.likeCount,
        commentCount: meta?.commentCount,
      })
    },
    [likesState],
  )

  useEffect(() => {
    setPreviewState((prev) => {
      if (!prev?.postId) return prev
      const likeSnapshot = likesState[prev.postId]
      const post = purchasedPosts.find((item) => item.id === prev.postId)
      let changed = false
      const next = { ...prev }

      if (likeSnapshot) {
        if (next.isLiked !== likeSnapshot.liked) {
          next.isLiked = likeSnapshot.liked
          changed = true
        }
        if (typeof next.likeCount !== 'number' || next.likeCount !== likeSnapshot.count) {
          next.likeCount = likeSnapshot.count
          changed = true
        }
      }

      if (post && typeof post.commentCount === 'number' && next.commentCount !== post.commentCount) {
        next.commentCount = post.commentCount
        changed = true
      }

      return changed ? next : prev
    })
  }, [likesState, purchasedPosts])

  const handleYearSelect = useCallback((year: number) => {
    setSelectedYear(year)
    setIsDateFilterOpen(false)
  }, [])

  const fetchPurchasedComments = useCallback(
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
        const mapped = mapApiCommentsToFeed(
          Array.isArray(result.data) ? result.data : result.data?.comments || [],
        )
        setActiveComments(mapped)
        setCollapsedReplies({})
        setReplyingToId(null)
        const updatedCount =
          typeof result.meta?.total === 'number' ? result.meta.total : mapped.length
        setPurchasedPosts((prev) =>
          prev.map((post) =>
            post.id === postId
              ? {
                  ...post,
                  commentCount: updatedCount,
                }
              : post,
          ),
        )
      } catch (error: any) {
        console.error('구매 포스트 댓글 조회 실패:', error)
        alert(error?.message || '댓글을 불러오지 못했습니다.')
      } finally {
        setIsCommentsLoading(false)
      }
    },
    [authAccessToken, authRefreshToken, syncSession],
  )

  const deletePurchasedComment = useCallback(
    async (postId: string, commentId: string) => {
      if (!confirm('댓글을 삭제하시겠습니까?')) return
      
      try {
        const token = await resolveAccessToken({
          accessToken: authAccessToken,
          refreshToken: authRefreshToken,
          syncSession,
        })
        if (!token) return

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

        // 댓글 목록 새로고침
        await fetchPurchasedComments(postId)
        
        // 댓글 카운트 감소
        setPurchasedPosts((prev) =>
          prev.map((post) =>
            post.id === postId
              ? { ...post, commentCount: Math.max(0, (post.commentCount || 0) - 1) }
              : post
          )
        )
      } catch (error: any) {
        console.error('댓글 삭제 실패:', error)
        alert(error?.message || '댓글 삭제에 실패했습니다.')
      }
    },
    [authAccessToken, authRefreshToken, syncSession, fetchPurchasedComments],
  )

  const submitPurchasedComment = useCallback(
    async (postId: string) => {
      if (!commentDraft.trim() || isSubmittingComment) return
      
      const prohibitedWord = findProhibitedWord(commentDraft.trim())
      if (prohibitedWord) {
        alert(`"${prohibitedWord}"는 금지어이므로 댓글을 작성할 수 없습니다.`)
        return
      }
      
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
        // 답글이 아닐 때만 전역 댓글 카운트 증가
        if (!replyingToId) {
          incrementGlobalCommentCount(postId)
        }
        await fetchPurchasedComments(postId)
      } catch (error: any) {
        console.error('구매 포스트 댓글 작성 실패:', error)
        alert(error?.message || '댓글 작성에 실패했습니다.')
      } finally {
        setIsSubmittingComment(false)
      }
    },
    [
      authAccessToken,
      authRefreshToken,
      syncSession,
      commentDraft,
      replyingToId,
      isSubmittingComment,
      fetchPurchasedComments,
    ],
  )

  const togglePurchasedPostLike = useCallback(
    async (postId: string) => {
      const post = purchasedPosts.find((item) => item.id === postId)
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
      setPurchasedPosts((prev) =>
        prev.map((item) =>
          item.id === postId
            ? { ...item, isLiked: nextLiked, likes: optimisticCount }
            : item,
        ),
      )

      const revert = () => {
        setLikesState((prev) => ({
          ...prev,
          [postId]: previous,
        }))
        updateGlobalLikeState(postId, previous.liked, previous.count) // 전역 롤백
        setPurchasedPosts((prev) =>
          prev.map((item) =>
            item.id === postId
              ? { ...item, isLiked: previous.liked, likes: previous.count }
              : item,
          ),
        )
      }

      try {
        const token = await resolveAccessToken({
          accessToken: authAccessToken,
          refreshToken: authRefreshToken,
          syncSession,
        })
        if (!token) {
          revert()
          return
        }

        const endpoint = nextLiked
          ? `${EDGE_FUNCTIONS_URL}/functions/v1/api-post-likes`
          : `${EDGE_FUNCTIONS_URL}/functions/v1/api-post-likes/${postId}`

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
        console.error('구매 포스트 좋아요 실패:', error)
        alert(error?.message || '좋아요 처리에 실패했습니다.')
        revert()
      }
    },
    [
      authAccessToken,
      authRefreshToken,
      syncSession,
      likesState,
      purchasedPosts,
    ],
  )

  const openCommentsForPost = useCallback(
    (postId: string) => {
      setActiveCommentPostId(postId)
      fetchPurchasedComments(postId)
    },
    [fetchPurchasedComments],
  )

  const getStatusLabel = (status: string) => {
    const statusMap: Record<string, string> = {
      pending: '결제 대기',
      paid: '결제 완료',
      shipped: '배송 중',
      delivered: '배송 완료',
      confirmed: '확정',
      refund_requested: '환불 요청',
      refunded: '환불 완료',
      cancelled: '취소됨',
    }
    return statusMap[status] || status
  }

  const getStatusColor = (status: string) => {
    const colorMap: Record<string, string> = {
      pending: 'text-yellow-600 bg-yellow-50',
      paid: 'text-blue-600 bg-blue-50',
      shipped: 'text-purple-600 bg-purple-50',
      delivered: 'text-green-600 bg-green-50',
      confirmed: 'text-green-600 bg-green-50',
      cancelled: 'text-red-600 bg-red-50',
    }
    return colorMap[status] || 'text-gray-600 bg-gray-50'
  }

  return (
    <CaptureProtection>
    <div className="min-h-screen pb-20">
      <div className="mx-auto w-full max-w-5xl px-4 pt-16 pb-24 sm:px-8">
        <div className="space-y-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Typography variant="h5" className="text-lg font-semibold text-[#110f1a]">
                  {activeTab === 'feed' ? '구매한 포스트' : '스토어 주문 조회'}
                </Typography>
                <Typography variant="body2" className="text-sm text-gray-500">
                  {activeTab === 'feed' 
                    ? `${selectedYearLabel} 동안 열람한 포스트입니다.`
                    : '스토어에서 구매한 주문 내역입니다.'}
                </Typography>
              </div>
              {activeTab === 'feed' && (
                <div className="relative" ref={filterDropdownRef}>
                  <button
                    type="button"
                    onClick={() => setIsDateFilterOpen((prev) => !prev)}
                    className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-[#110f1a] shadow-sm transition hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#110f1a]/10"
                  >
                    <CalendarDays className="h-4 w-4 text-[#FE3A8F]" />
                    <span>{selectedYear}년</span>
                  </button>
                  {isDateFilterOpen && (
                    <div className="absolute left-0 z-20 mt-2 w-40 rounded-2xl border border-gray-100 bg-white p-2 text-sm shadow-2xl">
                      {YEAR_OPTIONS.map((year) => (
                        <button
                          key={year}
                          type="button"
                          onClick={() => handleYearSelect(year)}
                          className={`w-full rounded-xl px-3 py-2 text-left font-medium ${
                            selectedYear === year ? 'bg-[#FE3A8F]/10 text-[#FE3A8F]' : 'text-gray-600 hover:bg-gray-50'
                          }`}
                        >
                          {year}년
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 탭 UI */}
            <div className="flex items-center gap-2 rounded-xl bg-gray-100 p-1">
              {[
                { key: 'feed' as const, label: '피드' },
                { key: 'store' as const, label: '스토어' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    activeTab === tab.key ? 'bg-white text-[#110f1a] shadow' : 'text-gray-500 hover:text-[#110f1a]'
                  }`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* 피드 탭 콘텐츠 */}
            {activeTab === 'feed' && (
              <>
                {isLoadingPurchasedPosts ? (
              <div className="space-y-4">
                {[1, 2].map((index) => (
                  <div key={`purchased-skeleton-${index}`} className="rounded-3xl bg-white p-5 shadow-sm">
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
                    <div className="mt-4 h-5 w-32 rounded bg-gray-100 animate-pulse" />
                  </div>
                ))}
              </div>
            ) : purchasedPostsError ? (
              <div className="rounded-3xl border border-red-100 bg-red-50 px-4 py-10 text-center text-sm text-red-600 shadow-sm">
                {purchasedPostsError}
              </div>
            ) : purchasedPosts.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-gray-200 bg-white py-12 text-center text-gray-400 shadow-sm">
                선택한 기간에 구매한 포스트가 없습니다.
              </div>
            ) : (
              <div className="space-y-10">
                {purchasedPosts.map((post) => {
                  const likeSnapshot = likesState[post.id]
                  const isLiked = likeSnapshot?.liked ?? post.isLiked ?? false
                  const likeCount = likeSnapshot?.count ?? post.likes ?? 0
                  const commentCount = post.commentCount ?? 0

                  return (
                    <article
                      key={post.id}
                      className="space-y-4"
                      draggable={false}
                      onDragStart={(event) => event.preventDefault()}
                    >
                      <header className="flex items-start gap-3">
                        <AvatarWithFallback
                          name={post.author.name}
                          src={post.author.avatar || undefined}
                          size="sm"
                          className="h-10 w-10"
                        />
                        <div className="flex-1">
                          <div className="flex flex-col">
                            <p className="font-semibold text-[#110f1a]">{post.author.name}</p>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            <span>@{post.author.handle}</span>
                            <span>·</span>
                            <span>{formatRelativeTime(post.postedAt)}</span>
                          </div>
                        </div>
                      </header>

                      {post.content && (
                        <Typography variant="body1" className="text-gray-700">
                          {post.content}
                        </Typography>
                      )}

                      {post.media && post.media.length > 0 && (
                        <FeedMediaCarousel
                          media={post.media}
                          isSubscribersOnly={post.isSubscribersOnly}
                          pointPrice={post.pointPrice ?? undefined}
                          isPurchased
                          purchasedMediaOrder={post.purchasedMediaOrder ?? null}
                          onMediaClick={({ mediaList, index }) =>
                            handlePreviewMedia(post.id, mediaList, index, {
                              isLiked,
                              likeCount,
                              commentCount,
                            })
                          }
                          memberCode={user?.member_code}
                        />
                      )}

                      <div className="flex flex-wrap items-center gap-4 py-2 text-sm">
                        <button
                          type="button"
                          className={`flex items-center gap-2 font-medium ${
                            isLiked ? 'text-red-500' : 'text-gray-500'
                          }`}
                          onClick={() => togglePurchasedPostLike(post.id)}
                        >
                          <Heart
                            className={`h-5 w-5 ${
                              isLiked ? 'fill-red-500 text-red-500' : ''
                            }`}
                          />
                          {likeCount}
                        </button>
                        <button
                          type="button"
                          className="flex items-center gap-2 text-gray-500"
                          onClick={() => openCommentsForPost(post.id)}
                        >
                          <MessageCircle className="h-5 w-5" />
                          {commentCount}
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
              </>
            )}

            {/* 스토어 탭 콘텐츠 */}
            {activeTab === 'store' && (
              <>
                {isLoadingStoreOrders ? (
                  <div className="space-y-4">
                    {[1, 2].map((index) => (
                      <div key={`order-skeleton-${index}`} className="rounded-3xl bg-white p-5 shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="h-16 w-16 rounded-lg bg-gray-200 animate-pulse" />
                          <div className="flex-1 space-y-2">
                            <div className="h-4 w-32 rounded bg-gray-200 animate-pulse" />
                            <div className="h-3 w-20 rounded bg-gray-100 animate-pulse" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : storeOrdersError ? (
                  <div className="rounded-3xl border border-red-100 bg-red-50 px-4 py-10 text-center text-sm text-red-600 shadow-sm">
                    {storeOrdersError}
                  </div>
                ) : storeOrders.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-gray-200 bg-white py-12 text-center text-gray-400 shadow-sm">
                    주문 내역이 없습니다.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {storeOrders.map((order) => {
                      const orderItems = order.order_items || [];
                      const firstItem = orderItems[0];
                      const displayProduct = firstItem?.product || order.product;
                      const shipment = order.shipments?.[0];
                      
                      // 판매자 정보 추출
                      const partner = order.partner || displayProduct?.partner;
                      const partnerName = partner?.name || partner?.partner_name || displayProduct?.partner_name;
                      const partnerMemberCode = partner?.member_code || displayProduct?.partner_member_code;
                      const partnerAvatar = partner?.profile_image || partner?.avatar || displayProduct?.partner_avatar;
                      
                      return (
                        <div
                          key={order.order_id}
                          className="rounded-3xl bg-white p-5 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                          onClick={() => navigate({ to: `/mypage/purchases/${order.order_id}` })}
                        >
                          {/* 판매자 정보 */}
                          {(partnerName || partnerMemberCode) && (
                            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-100">
                              {partnerAvatar ? (
                                <img src={partnerAvatar} alt={partnerName || '판매자'} className="w-6 h-6 rounded-full object-cover" />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-500">
                                  {(partnerName || partnerMemberCode || 'P').charAt(0)}
                                </div>
                              )}
                              <Typography variant="caption" className="text-gray-600 font-medium">
                                {partnerName || partnerMemberCode}
                              </Typography>
                              {partnerMemberCode && partnerName && (
                                <Typography variant="caption" className="text-gray-400">
                                  @{partnerMemberCode}
                                </Typography>
                              )}
                            </div>
                          )}
                          
                          <div className="flex items-start gap-4">
                            {displayProduct?.thumbnail_url ? (
                              <img
                                src={displayProduct.thumbnail_url}
                                alt={displayProduct.name || '상품 이미지'}
                                className="h-20 w-20 rounded-lg object-cover flex-shrink-0"
                              />
                            ) : (
                              <div className="h-20 w-20 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                                <Package className="h-8 w-8 text-gray-400" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex-1 min-w-0">
                                  <Typography variant="body1" className="font-semibold text-[#110f1a] truncate">
                                    {displayProduct?.name || '상품명 없음'}
                                    {orderItems.length > 1 && (
                                      <span className="text-gray-500 text-sm ml-1">외 {orderItems.length - 1}건</span>
                                    )}
                                  </Typography>
                                  <Typography variant="body2" className="text-sm text-gray-500 mt-1">
                                    주문번호: {order.order_number || order.order_id.slice(0, 8)}...
                                  </Typography>
                                </div>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${getStatusColor(order.status)}`}>
                                  {getStatusLabel(order.status)}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Typography variant="body2" className="text-xs text-gray-400">
                                  {formatRelativeTime(order.created_at)}
                                </Typography>
                                <Typography variant="body2" className="text-sm font-semibold text-[#FE3A8F]">
                                  {order.total_amount.toLocaleString()}P
                                </Typography>
                              </div>
                              {shipment?.tracking_number && (
                                <div className="mt-2 pt-2 border-t border-gray-100">
                                  <Typography variant="body2" className="text-xs text-gray-600">
                                    {shipment.courier} {shipment.tracking_number}
                                  </Typography>
                                  {shipment.status === 'delivered' && (
                                    <span className="text-xs text-green-600 font-medium">배송 완료</span>
                                  )}
                                </div>
                              )}
                              {!shipment?.tracking_number && order.tracking_number && (
                                <div className="mt-2 pt-2 border-t border-gray-100">
                                  <Typography variant="body2" className="text-xs text-gray-600">
                                    운송장번호: {order.tracking_number}
                                  </Typography>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {/* 무한 스크롤 트리거 - 항상 렌더링 */}
                    <div ref={loadMoreOrdersRef} className="py-4 flex justify-center">
                      {isLoadingMoreOrders && (
                        <div className="flex items-center gap-2 text-gray-500 text-sm">
                          <div className="w-4 h-4 border-2 border-gray-300 border-t-[#FE3A8F] rounded-full animate-spin" />
                          불러오는 중...
                        </div>
                      )}
                      {!hasMoreStoreOrders && storeOrders.length > 0 && (
                        <div className="text-gray-400 text-sm">
                          모든 주문을 불러왔습니다
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}
        </div>
        {previewState && (
          <MediaPreview
            items={previewState.items}
            initialIndex={previewState.index}
            postId={previewState.postId}
            isLiked={previewState.isLiked}
            likeCount={previewState.likeCount}
            commentCount={previewState.commentCount}
            onToggleLike={(postId) => togglePurchasedPostLike(postId)}
            onOpenComments={(postId) => openCommentsForPost(postId)}
            onClose={() => setPreviewState(null)}
            memberCode={user?.member_code}
          />
        )}
        <SlideSheet
          isOpen={!!activeCommentPostId && isCommentSheetVisible}
          onClose={() => {
            setIsCommentSheetVisible(false)
            if (commentSheetCloseTimeoutRef.current) {
              clearTimeout(commentSheetCloseTimeoutRef.current)
            }
            commentSheetCloseTimeoutRef.current = setTimeout(() => {
              setActiveCommentPostId(null)
              setActiveComments([])
              setCommentDraft('')
              setReplyingToId(null)
            }, 250)
          }}
          title="댓글"
          initialHeight={0.6}
          minHeight={0.3}
          maxHeight={0.9}
          noPadding
          footer={
            <div className="space-y-2">
              {replyingToId && (
                <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm">
                  <span className="text-gray-600">답글 작성 중...</span>
                  <button
                    type="button"
                    onClick={() => setReplyingToId(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              <div className="relative rounded-full border border-gray-100 bg-gray-100 px-3 py-1.5">
                <Input
                  className="w-full border-none bg-transparent p-0 pr-12 text-sm focus:border-none focus:ring-0 focus:ring-offset-0 focus:outline-none caret-[#FE3A8F]"
                  placeholder={replyingToId ? '대댓글을 입력해주세요' : '댓글을 입력해주세요'}
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && activeCommentPostId) {
                      e.preventDefault()
                      if (!isSubmittingComment && commentDraft.trim()) {
                        submitPurchasedComment(activeCommentPostId)
                      }
                    }
                  }}
                />
                <button
                  type="button"
                  className="absolute right-1.5 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full !bg-[#FE3A8F] p-0 text-white hover:!bg-[#e8a0c0] disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => {
                    if (!isSubmittingComment && activeCommentPostId && commentDraft.trim()) {
                      submitPurchasedComment(activeCommentPostId)
                    }
                  }}
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
          }
        >
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {isCommentsLoading ? (
              <div className="flex h-40 items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#FE3A8F] border-t-transparent" />
              </div>
            ) : activeComments.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-sm text-gray-400">
                아직 댓글이 없습니다.
              </div>
            ) : (
              <CommentList
                comments={activeComments}
                collapsedReplies={collapsedReplies}
                onToggleReplies={(commentId) =>
                  setCollapsedReplies((prev) => ({
                    ...prev,
                    [commentId]: !prev[commentId],
                  }))
                }
                onReply={(commentId) => setReplyingToId(commentId)}
                currentUserId={user?.id}
                onRequireLogin={() => navigate({ to: '/login' })}
                onDeleteComment={activeCommentPostId ? (commentId) => deletePurchasedComment(activeCommentPostId, commentId) : undefined}
              />
            )}
          </div>
        </SlideSheet>
      </div>
    </div>
    </CaptureProtection>
  )
}
