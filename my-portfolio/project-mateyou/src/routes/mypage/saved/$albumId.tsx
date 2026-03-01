import { useState, useEffect, useCallback, useRef } from 'react'
import { createFileRoute, useNavigate, useParams, Link } from '@tanstack/react-router'
import { Heart, MessageCircle, Bookmark, Trash2, ChevronLeft, Play, Repeat2, Send, CornerDownRight, Star, Lock } from 'lucide-react'
import { SlideSheet, AvatarWithFallback, Input, Typography } from '@/components'
import { useAuthStore } from '@/store/useAuthStore'
import { useUIStore } from '@/store/useUIStore'
import { resolveAccessToken } from '@/utils/sessionToken'
import { toast } from '@/components/ui/sonner'
import { CaptureProtection } from '@/components/CaptureProtection'
import { useAuth } from '@/hooks/useAuth'
import { FeedMediaCarousel, MediaPreview, updateGlobalMembershipState } from '@/routes/feed/all'
import { useMemberPoints } from '@/hooks/useMemberPoints'

const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const Route = createFileRoute('/mypage/saved/$albumId')({
  component: AlbumDetailPage,
})

interface AlbumPost {
  id: string
  post_id: string
  content?: string
  thumbnail_url?: string
  is_video?: boolean
  media?: Array<{
    type: 'image' | 'video'
    src: string
    point_price?: number | null
    membership_id?: string | null
    signed_url?: string | null
  }>
  author?: {
    name: string
    handle: string
    avatar?: string
    member_code?: string
  }
  likes?: number
  comment_count?: number
  is_liked?: boolean
  created_at?: string
  // 접근 권한 관련 필드
  is_subscribers_only?: boolean
  point_price?: number
  has_membership?: boolean
  is_purchased?: boolean
  partner_id?: string
  is_bundle?: boolean
  discount_rate?: number
  purchased_media_order?: number | null
}

interface Membership {
  id: string
  name: string
  monthly_price: number
  description?: string
}

interface Album {
  id: string
  title: string
  post_count?: number
}

interface Comment {
  id: string
  text: string
  author: string
  avatar?: string
  handle?: string
  createdAt: string
  parentId?: string | null
  replies?: Comment[]
}

// 최대 컨텐츠 넓이
const MAX_CONTENT_WIDTH = 720

// 상대 시간 포맷
const formatRelativeTime = (dateString?: string) => {
  if (!dateString) return ''
  const date = new Date(dateString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  
  if (minutes < 1) return '방금 전'
  if (minutes < 60) return `${minutes}분 전`
  if (hours < 24) return `${hours}시간 전`
  if (days < 7) return `${days}일 전`
  return date.toLocaleDateString('ko-KR')
}

function AlbumDetailPage() {
  const navigate = useNavigate()
  const params = useParams({ from: '/mypage/saved/$albumId' })
  const albumId = params.albumId
  const { user } = useAuth()
  
  const authAccessToken = useAuthStore((state) => state.accessToken)
  const authRefreshToken = useAuthStore((state) => state.refreshToken)
  const syncSession = useAuthStore((state) => state.syncSession)
  
  const [album, setAlbum] = useState<Album | null>(null)
  const [posts, setPosts] = useState<AlbumPost[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedPostIndex, setSelectedPostIndex] = useState<number | null>(null)
  const [likesState, setLikesState] = useState<Record<string, { liked: boolean; count: number }>>({})
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isDeletingAlbum, setIsDeletingAlbum] = useState(false)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [isSavingTitle, setIsSavingTitle] = useState(false)
  const [isFeedView, setIsFeedView] = useState(false)
  const feedScrollRef = useRef<HTMLDivElement>(null)
  
  // 댓글 관련 상태
  const [commentSheetPostId, setCommentSheetPostId] = useState<string | null>(null)
  const [commentState, setCommentState] = useState<Record<string, Comment[]>>({})
  const [commentDraft, setCommentDraft] = useState('')
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)
  const [replyTarget, setReplyTarget] = useState<{ id: string; author: string } | null>(null)
  const [commentLoadingState, setCommentLoadingState] = useState<Record<string, boolean>>({})
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({})
  const [collapsedReplies, setCollapsedReplies] = useState<Record<string, boolean>>({})
  
  // 답글 접기/펴기
  const handleToggleReplies = useCallback((commentId: string) => {
    setCollapsedReplies(prev => ({
      ...prev,
      [commentId]: !prev[commentId]
    }))
  }, [])
  
  // 구매/멤버쉽 관련 상태
  const [purchaseTargetPost, setPurchaseTargetPost] = useState<AlbumPost | null>(null)
  const [isProcessingPurchase, setIsProcessingPurchase] = useState(false)
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [isMembershipSheetOpen, setIsMembershipSheetOpen] = useState(false)
  const [selectedMembershipId, setSelectedMembershipId] = useState<string | null>(null)
  const [isSubscribing, setIsSubscribing] = useState(false)
  // 개별 미디어 구매 상태
  const [mediaPurchaseTarget, setMediaPurchaseTarget] = useState<{ post: AlbumPost; mediaIndex: number } | null>(null)
  const [isMediaPurchaseSheetVisible, setIsMediaPurchaseSheetVisible] = useState(false)
  const [selectedMediaPurchaseOption, setSelectedMediaPurchaseOption] = useState<'single' | 'bundle' | null>(null)
  
  // 전체화면 프리뷰 상태
  const [previewState, setPreviewState] = useState<{
    postId?: string
    items: Array<{ type: 'image' | 'video'; src: string }>
    index: number
    memberCode?: string | null
  } | null>(null)
  
  // 포인트 관련
  const { applyPointDeduction, refetch: refetchPoints } = useMemberPoints()

  const getAccessToken = useCallback(async () => {
    return resolveAccessToken({
      accessToken: authAccessToken,
      refreshToken: authRefreshToken,
      syncSession,
    })
  }, [authAccessToken, authRefreshToken, syncSession])

  const isAllPosts = albumId === 'all'

  // 전역 헤더에서 메뉴 열기 이벤트 수신
  useEffect(() => {
    const handleOpenAlbumMenu = () => {
      setIsMenuOpen(true)
    }
    
    window.addEventListener('openAlbumMenu', handleOpenAlbumMenu)
    return () => {
      window.removeEventListener('openAlbumMenu', handleOpenAlbumMenu)
      // 페이지 이탈 시 기본 앨범 상태 초기화
      useUIStore.getState().setIsDefaultAlbum(false)
    }
  }, [])

  // 앨범 상세 정보 불러오기
  const fetchAlbumDetails = useCallback(async () => {
    setIsLoading(true)
    try {
      const token = await getAccessToken()
      if (!token) return

      // API URL 설정
      const postsUrl = isAllPosts 
        ? `${EDGE_FUNCTIONS_URL}/functions/v1/api-album-posts/list`
        : `${EDGE_FUNCTIONS_URL}/functions/v1/api-album-posts/list?album_id=${albumId}`

      if (isAllPosts) {
        setAlbum({
          id: 'all',
          title: '전체 게시물',
          post_count: 0,
        })
        // 전역 헤더 타이틀 업데이트
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('setAlbumHeaderTitle', { detail: { title: '전체 게시물' } }))
        }
      } else {
        // 특정 앨범 정보 가져오기
        const albumsResponse = await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/api-albums`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: SUPABASE_ANON_KEY,
          },
        })
        const albumsResult = await albumsResponse.json()
        if (albumsResult.success && albumsResult.data) {
          const currentAlbum = albumsResult.data.find((a: any) => a.id === albumId)
          if (currentAlbum) {
            setAlbum({
              id: currentAlbum.id,
              title: currentAlbum.title,
              post_count: currentAlbum.count ?? currentAlbum.post_count ?? 0,
            })
            // 기본 앨범 여부 설정 (삭제/이름 수정 불가)
            const isDefault = currentAlbum.is_default || currentAlbum.title === '저장됨'
            useUIStore.getState().setIsDefaultAlbum(isDefault)
            // 전역 헤더 타이틀 업데이트
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('setAlbumHeaderTitle', { detail: { title: currentAlbum.title } }))
            }
          }
        }
      }

      // 포스트 목록 가져오기
      const postsResponse = await fetch(postsUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
        },
      })
      const postsResult = await postsResponse.json()
      
      if (postsResult.success && postsResult.data) {
        const processedPosts: AlbumPost[] = postsResult.data.map((item: any) => {
          let media: AlbumPost['media'] = []
          let isVideo = false

          // API 응답 구조: item.files (직접 접근) 또는 item.post?.files (중첩 구조)
          const files = item.files || item.post?.files
          if (files && Array.isArray(files)) {
            media = files.map((file: any) => ({
              type: file.media_type?.includes('video') ? 'video' : 'image',
              src: file.signed_url || file.media_full_url || file.url || '',
            }))
            
            // 첫 번째 미디어가 비디오인지 확인
            if (media.length > 0) {
              isVideo = media[0].type === 'video'
            }
          }

          // thumbnail_url: API에서 직접 제공하는 값 우선 사용, 없으면 첫 번째 미디어 사용
          const thumbnailUrl = item.thumbnail_url || (media.length > 0 ? media[0].src : undefined)

          // API 응답 구조: item.partner (직접 접근) 또는 item.post?.partner (중첩 구조)
          const partner = item.partner || item.post?.partner
          // API 응답: id = album_posts.id, post_id = posts.id (원본 포스트 ID)
          const albumPostId = item.id // album_posts.id
          const postId = item.post_id // posts.id (삭제 시 이 ID 사용)

          return {
            id: albumPostId,
            post_id: postId,
            content: item.content || item.post?.content || '',
            thumbnail_url: thumbnailUrl,
            is_video: isVideo,
            media,
            author: {
              name: partner?.name || 'Unknown',
              handle: partner?.member_code || 'unknown',
              avatar: partner?.profile_image || '',
              member_code: partner?.member_code || '',
            },
            likes: item.like_count || item.post?.like_count || 0,
            comment_count: item.comment_count || item.post?.comment_count || 0,
            is_liked: item.is_liked || item.post?.is_liked || false,
            created_at: item.published_at || item.created_at,
            // 접근 권한 관련 필드
            is_subscribers_only: item.is_subscribers_only || item.post?.is_subscribers_only || false,
            point_price: item.point_price ?? item.post?.point_price ?? 0,
            has_membership: item.has_membership || item.post?.has_membership || false,
            is_purchased: item.is_purchased || item.post?.is_purchased || false,
            partner_id: item.partner_id || item.post?.partner_id || partner?.id || '',
          }
        })
        
        setPosts(processedPosts)
        
        if (isAllPosts) {
          setAlbum(prev => prev ? { ...prev, post_count: processedPosts.length } : null)
        }

        const initialLikesState: Record<string, { liked: boolean; count: number }> = {}
        const initialCommentCounts: Record<string, number> = {}
        processedPosts.forEach((post) => {
          initialLikesState[post.post_id] = {
            liked: post.is_liked || false,
            count: post.likes || 0,
          }
          initialCommentCounts[post.post_id] = post.comment_count || 0
        })
        setLikesState(initialLikesState)
        setCommentCounts(initialCommentCounts)

      }
    } catch (error) {
      console.error('앨범 상세 불러오기 실패:', error)
    } finally {
      setIsLoading(false)
    }
  }, [albumId, getAccessToken, isAllPosts])

  useEffect(() => {
    if (albumId) {
      fetchAlbumDetails()
    }
  }, [albumId, fetchAlbumDetails])

  // 좋아요 토글
  const handleToggleLike = async (postId: string) => {
    const currentState = likesState[postId]
    if (!currentState) return

    // 낙관적 업데이트
    setLikesState((prev) => ({
      ...prev,
      [postId]: {
        liked: !currentState.liked,
        count: currentState.liked ? currentState.count - 1 : currentState.count + 1,
      },
    }))

    try {
      const token = await getAccessToken()
      if (!token) return

      const nextLiked = !currentState.liked
      const endpoint = nextLiked
        ? `${EDGE_FUNCTIONS_URL}/functions/v1/api-post-likes`
        : `${EDGE_FUNCTIONS_URL}/functions/v1/api-post-likes/${postId}`

      await fetch(endpoint, {
        method: nextLiked ? 'POST' : 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': SUPABASE_ANON_KEY,
          ...(nextLiked ? { 'Content-Type': 'application/json' } : {}),
        },
        body: nextLiked ? JSON.stringify({ post_id: postId }) : undefined,
      })
    } catch (error) {
      // 롤백
      setLikesState((prev) => ({
        ...prev,
        [postId]: currentState,
      }))
    }
  }

  // 잠금 콘텐츠 클릭 핸들러
  const handleLockedPostClick = useCallback((post: AlbumPost) => {
    setPurchaseTargetPost(post)
  }, [])

  // 구매 시트 닫기
  const closePurchaseSheet = useCallback(() => {
    setPurchaseTargetPost(null)
  }, [])

  // 멤버쉽 목록 로드
  const loadMemberships = useCallback(async (partnerId: string) => {
    try {
      const token = await getAccessToken()
      if (!token) return

      const response = await fetch(
        `${EDGE_FUNCTIONS_URL}/functions/v1/api-membership?partner_id=${partnerId}`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': SUPABASE_ANON_KEY,
          },
        }
      )
      const result = await response.json()
      if (result.success && result.data) {
        setMemberships(result.data.filter((m: any) => m.is_active))
      }
    } catch (error) {
      console.error('멤버쉽 로드 실패:', error)
    }
  }, [getAccessToken])

  // 단건 구매 처리
  const handleOneTimePurchase = useCallback(async () => {
    if (!purchaseTargetPost || isProcessingPurchase) return
    if (!purchaseTargetPost.point_price || purchaseTargetPost.point_price <= 0) return

    setIsProcessingPurchase(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        toast.error('로그인이 필요합니다.')
        return
      }

      const response = await fetch(
        `${EDGE_FUNCTIONS_URL}/functions/v1/api-post-unlocks`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            post_id: purchaseTargetPost.post_id,
          }),
        }
      )

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || '구매에 실패했습니다.')
      }

      // 포스트 상태 업데이트
      setPosts((prev) =>
        prev.map((post) =>
          post.post_id === purchaseTargetPost.post_id
            ? { ...post, is_purchased: true }
            : post
        )
      )

      applyPointDeduction(purchaseTargetPost.point_price ?? 0)
      
      if (typeof refetchPoints === 'function') {
        await refetchPoints()
      }

      toast.success('구매가 완료되었습니다!')
      closePurchaseSheet()
    } catch (error: any) {
      toast.error(error.message || '구매에 실패했습니다.')
    } finally {
      setIsProcessingPurchase(false)
    }
  }, [purchaseTargetPost, isProcessingPurchase, getAccessToken, applyPointDeduction, refetchPoints, closePurchaseSheet])

  // 개별 미디어 구매 클릭 핸들러
  const handleMediaPurchaseClick = useCallback((post: AlbumPost, mediaIndex: number) => {
    // post 레벨 가격이 있고 모든 미디어에 개별 가격이 없으면 post 레벨 구매
    const allMediaHaveNoPointPrice = post.media?.every(m => !m.point_price || m.point_price <= 0)
    if (post.point_price && post.point_price > 0 && allMediaHaveNoPointPrice) {
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

  // 개별 미디어 구매 실행
  const executeMediaPurchase = useCallback(
    async (post: AlbumPost, mediaIndex: number, isBundle: boolean) => {
      if (isProcessingPurchase) return
      const media = post.media?.[mediaIndex]
      if (!media || !media.point_price || media.point_price <= 0) return

      setIsProcessingPurchase(true)
      try {
        const token = await getAccessToken()
        if (!token) {
          toast.error('로그인이 필요합니다.')
          setIsProcessingPurchase(false)
          return
        }

        const discountRate = post.discount_rate ?? 0
        let finalPrice = 0
        let mediaIndices: number[] = []
        
        if (isBundle && post.is_bundle) {
          const unpurchasedMedia = post.media?.filter((m, idx) => {
            const isPurchased = post.purchased_media_order != null && idx <= post.purchased_media_order
            return !m.signed_url && m.point_price != null && m.point_price > 0 && !isPurchased
          }) || []
          
          const totalBasePrice = unpurchasedMedia.reduce((sum, m) => sum + (m.point_price || 0), 0)
          finalPrice = discountRate > 0 && discountRate <= 100
            ? Math.round(totalBasePrice * (1 - discountRate / 100))
            : totalBasePrice
          
          mediaIndices = post.media?.map((m, idx) => {
            const isPurchased = post.purchased_media_order != null && idx <= post.purchased_media_order
            if (!m.signed_url && m.point_price != null && m.point_price > 0 && !isPurchased) {
              return idx
            }
            return -1
          }).filter(idx => idx >= 0) || []
        } else {
          const mediaUpToIndex = post.media?.slice(0, mediaIndex + 1).filter((m, idx) => {
            const isPurchased = post.purchased_media_order != null && idx <= post.purchased_media_order
            return !m.signed_url && m.point_price != null && m.point_price > 0 && !isPurchased
          }) || []
          
          const totalBasePrice = mediaUpToIndex.reduce((sum, m) => sum + (m.point_price || 0), 0)
          finalPrice = discountRate > 0 && discountRate <= 100
            ? Math.round(totalBasePrice * (1 - discountRate / 100))
            : totalBasePrice
          
          mediaIndices = post.media?.slice(0, mediaIndex + 1).map((m, idx) => {
            const isPurchased = post.purchased_media_order != null && idx <= post.purchased_media_order
            if (!m.signed_url && m.point_price != null && m.point_price > 0 && !isPurchased) {
              return idx
            }
            return -1
          }).filter(idx => idx >= 0) || []
        }

        const response = await fetch(
          `${EDGE_FUNCTIONS_URL}/functions/v1/api-post-unlocks`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'apikey': SUPABASE_ANON_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              post_id: post.post_id,
              media_order: Math.max(...mediaIndices),
              media_indices: mediaIndices,
              is_bundle: isBundle || mediaIndices.length > 1,
            }),
          },
        )

        const result = await response.json()
        if (!response.ok || !result.success) {
          throw new Error(result.error || '미디어를 구매할 수 없습니다.')
        }

        const newPurchasedOrder = Math.max(...mediaIndices)
        setPosts((prev) =>
          prev.map((p) => {
            if (p.post_id !== post.post_id) return p
            return {
              ...p,
              purchased_media_order: Math.max(p.purchased_media_order ?? -1, newPurchasedOrder),
            }
          }),
        )

        applyPointDeduction(finalPrice)

        if (typeof refetchPoints === 'function') {
          await refetchPoints()
        }

        toast.success('미디어 구매가 완료되었습니다!')
        setIsMediaPurchaseSheetVisible(false)
        setMediaPurchaseTarget(null)
        setSelectedMediaPurchaseOption(null)
      } catch (error: any) {
        toast.error(error.message || '구매 처리 중 오류가 발생했습니다.')
      } finally {
        setIsProcessingPurchase(false)
      }
    },
    [isProcessingPurchase, getAccessToken, applyPointDeduction, refetchPoints],
  )

  // 멤버쉽 구독 옵션 클릭
  const handleMembershipOptionClick = useCallback(async () => {
    if (!purchaseTargetPost?.partner_id) return
    
    closePurchaseSheet()
    await loadMemberships(purchaseTargetPost.partner_id)
    setIsMembershipSheetOpen(true)
  }, [purchaseTargetPost, loadMemberships, closePurchaseSheet])

  // 멤버쉽 구독 처리
  const handleSubscribe = useCallback(async () => {
    if (!selectedMembershipId || isSubscribing) return

    setIsSubscribing(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        toast.error('로그인이 필요합니다.')
        return
      }

      const response = await fetch(
        `${EDGE_FUNCTIONS_URL}/functions/v1/api-membership-subscriptions`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            membership_id: selectedMembershipId,
          }),
        }
      )

      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || '구독에 실패했습니다.')
      }

      toast.success('멤버쉽 구독이 완료되었습니다!')
      setIsMembershipSheetOpen(false)
      setSelectedMembershipId(null)
      
      // 전역 멤버십 상태 업데이트 (/feed/all 등 다른 페이지에서도 반영)
      if (purchaseTargetPost?.partner_id) {
        updateGlobalMembershipState(purchaseTargetPost.partner_id, true)
      }
      
      // 구독 완료 후 포스트 목록 다시 가져오기 (서버에서 접근 권한 갱신)
      fetchAlbumDetails()
    } catch (error: any) {
      toast.error(error.message || '구독에 실패했습니다.')
    } finally {
      setIsSubscribing(false)
    }
  }, [selectedMembershipId, isSubscribing, getAccessToken, fetchAlbumDetails, purchaseTargetPost])

  // 전체화면 미디어 프리뷰 열기
  const handlePreviewMedia = useCallback((postId: string, mediaList: Array<{ type: 'image' | 'video'; src: string }>, index: number, memberCode?: string | null) => {
    setPreviewState({ postId, items: mediaList, index, memberCode })
  }, [])

  // 댓글 불러오기
  const fetchComments = useCallback(async (postId: string) => {
    setCommentLoadingState(prev => ({ ...prev, [postId]: true }))
    try {
      const token = await getAccessToken()
      if (!token) return

      const response = await fetch(
        `${EDGE_FUNCTIONS_URL}/functions/v1/api-comments/${postId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: SUPABASE_ANON_KEY,
          },
        }
      )

      const result = await response.json()
      if (result.success && result.data) {
        // /feed/all.tsx의 mapApiComments와 동일한 재귀 함수
        const mapComments = (apiComments: any[]): Comment[] => 
          apiComments.map((c: any) => ({
          id: c.id,
          text: c.content,
            author: c.user?.name || (c.user_id ? c.user_id.slice(0, 8) : '익명'),
            avatar: c.user?.profile_image ?? '',
            handle: c.user?.member_code || '',
          createdAt: c.created_at,
            parentId: c.parent_id,
            replies: c.replies ? mapComments(c.replies) : [],
          }))
        
        const mappedComments = mapComments(result.data)
        
        // 전체 댓글 수 (대댓글 포함)
        const countTotal = (list: Comment[]): number =>
          list.reduce((sum, c) => sum + 1 + countTotal(c.replies || []), 0)
        
        setCommentState(prev => ({ ...prev, [postId]: mappedComments }))
        setCommentCounts(prev => ({ ...prev, [postId]: countTotal(mappedComments) }))
      }
    } catch (error) {
      console.error('댓글 불러오기 실패:', error)
    } finally {
      setCommentLoadingState(prev => ({ ...prev, [postId]: false }))
    }
  }, [getAccessToken])

  // 댓글 작성
  const handleSubmitComment = async () => {
    if (!commentSheetPostId || !commentDraft.trim() || isSubmittingComment) return
    
    setIsSubmittingComment(true)
    try {
      const token = await getAccessToken()
      if (!token) return

      const body: any = {
        post_id: commentSheetPostId,
        content: commentDraft.trim(),
      }
      
      if (replyTarget) {
        body.parent_comment_id = replyTarget.id
      }

      const response = await fetch(
        `${EDGE_FUNCTIONS_URL}/functions/v1/api-comments`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      )

      const result = await response.json()
      if (result.success) {
        setCommentDraft('')
        setReplyTarget(null)
        await fetchComments(commentSheetPostId)
        toast.success('댓글이 작성되었습니다')
      }
    } catch (error) {
      console.error('댓글 작성 실패:', error)
      toast.error('댓글 작성에 실패했습니다')
    } finally {
      setIsSubmittingComment(false)
    }
  }

  // 댓글 버튼 클릭
  const handleCommentButtonClick = (postId: string) => {
    setCommentSheetPostId(postId)
    if (!commentState[postId]) {
      fetchComments(postId)
    }
  }

  // 링크 복사
  const handleCopyLink = async (postId: string) => {
    try {
      const url = `${window.location.origin}/feed/${postId}`
      await navigator.clipboard.writeText(url)
      toast.success('링크가 복사되었습니다')
    } catch (error) {
      toast.error('링크 복사에 실패했습니다')
    }
  }

  // 앨범명 수정 시작
  const handleStartEditTitle = () => {
    setEditTitle(album?.title || '')
    setIsEditingTitle(true)
    setIsMenuOpen(false)
  }

  // 앨범명 저장
  const handleSaveTitle = async () => {
    if (!albumId || !editTitle.trim() || isSavingTitle) return
    
    setIsSavingTitle(true)
    try {
      const token = await getAccessToken()
      if (!token) return

      const response = await fetch(
        `${EDGE_FUNCTIONS_URL}/functions/v1/api-albums`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            album_id: albumId,
            title: editTitle.trim(),
          }),
        }
      )

      const result = await response.json()
      if (result.success) {
        toast.success('컬렉션 이름이 변경되었습니다')
        setAlbum(prev => prev ? { ...prev, title: editTitle.trim() } : null)
        // 전역 헤더 타이틀 업데이트
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('setAlbumHeaderTitle', { detail: { title: editTitle.trim() } }))
        }
        setIsEditingTitle(false)
      } else {
        toast.error(result.error || '이름 변경에 실패했습니다')
      }
    } catch (error) {
      console.error('앨범명 수정 실패:', error)
      toast.error('이름 변경에 실패했습니다')
    } finally {
      setIsSavingTitle(false)
    }
  }

  // 앨범 삭제
  const handleDeleteAlbum = async () => {
    if (!albumId) return
    
    setIsDeletingAlbum(true)
    try {
      const token = await getAccessToken()
      if (!token) return

      const response = await fetch(
        `${EDGE_FUNCTIONS_URL}/functions/v1/api-albums?album_id=${albumId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: SUPABASE_ANON_KEY,
          },
        }
      )

      const result = await response.json()
      if (result.success) {
        toast.success('컬렉션이 삭제되었습니다')
        navigate({ to: '/mypage/saved/' })
      } else {
        toast.error(result.error || '삭제에 실패했습니다')
      }
    } catch (error) {
      console.error('앨범 삭제 실패:', error)
      toast.error('삭제에 실패했습니다')
    } finally {
      setIsDeletingAlbum(false)
      setIsMenuOpen(false)
    }
  }

  // 포스트 저장 취소 (postId = posts.id, 원본 포스트 ID)
  const handleRemoveFromAlbum = async (e: React.MouseEvent, postId: string) => {
    e.stopPropagation() // 이벤트 전파 방지
    e.preventDefault()
    
    try {
      const token = await getAccessToken()
      if (!token) return

      const response = await fetch(
        `${EDGE_FUNCTIONS_URL}/functions/v1/api-album-posts/${postId}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: SUPABASE_ANON_KEY,
          },
        }
      )

      const result = await response.json()
      if (result.success) {
        toast.success('저장이 취소되었습니다')
        
        // 삭제된 포스트의 인덱스 찾기 (post_id = posts.id 기준)
        const deletedIndex = posts.findIndex((p) => p.post_id === postId)
        
        // 포스트 목록에서 제거 (post_id 기준)
        const newPosts = posts.filter((p) => p.post_id !== postId)
        setPosts(newPosts)
        
        // 피드 뷰에서 마지막 포스트를 삭제한 경우 그리드로 돌아가기
        if (newPosts.length === 0) {
          setIsFeedView(false)
          setSelectedPostIndex(null)
        } else if (selectedPostIndex !== null) {
          // 삭제된 인덱스가 현재 선택된 인덱스보다 작거나 같으면 인덱스 조정
          if (deletedIndex <= selectedPostIndex) {
            const newIndex = Math.max(0, Math.min(selectedPostIndex - 1, newPosts.length - 1))
            setSelectedPostIndex(newIndex)
          }
          // 현재 인덱스가 새 배열 길이를 초과하면 조정
          if (selectedPostIndex >= newPosts.length) {
            setSelectedPostIndex(Math.max(0, newPosts.length - 1))
          }
        }
      }
    } catch (error) {
      console.error('저장 취소 실패:', error)
      toast.error('저장 취소에 실패했습니다')
    }
  }

  // 그리드 아이템 클릭 - 피드 뷰로 전환
  const handleGridItemClick = (index: number) => {
    setSelectedPostIndex(index)
    setIsFeedView(true)
  }

  // 피드 뷰 닫기
  const handleCloseFeedView = useCallback(() => {
    setIsFeedView(false)
    setSelectedPostIndex(null)
  }, [])

  // 선택한 피드로 스크롤
  const postRefs = useRef<Record<string, HTMLElement | null>>({})
  
  useEffect(() => {
    if (isFeedView && selectedPostIndex !== null && posts[selectedPostIndex]) {
      const selectedPostId = posts[selectedPostIndex].id
      // 약간의 딜레이 후 스크롤 (렌더링 완료 대기)
      setTimeout(() => {
        const element = postRefs.current[selectedPostId]
        if (element) {
          element.scrollIntoView({ behavior: 'auto', block: 'start' })
        }
      }, 100)
    }
  }, [isFeedView, selectedPostIndex, posts])

  // 피드 뷰 상태를 전역 헤더에 알림
  useEffect(() => {
    if (isFeedView) {
      // 피드 뷰 열림 이벤트 발행
      window.dispatchEvent(new CustomEvent('setAlbumFeedViewState', { 
        detail: { 
          isOpen: true, 
          title: album?.title || '컬렉션',
        } 
      }))
    } else {
      // 피드 뷰 닫힘 이벤트 발행
      window.dispatchEvent(new CustomEvent('setAlbumFeedViewState', { 
        detail: { isOpen: false } 
      }))
    }
  }, [isFeedView, album?.title])
  
  // 컴포넌트 언마운트 시 피드 뷰 상태 초기화
  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent('setAlbumFeedViewState', { 
        detail: { isOpen: false } 
      }))
    }
  }, [])

  // 전역 헤더에서 피드 뷰 닫기 이벤트 수신
  useEffect(() => {
    const handleCloseFeedViewEvent = () => {
      handleCloseFeedView()
    }
    
    window.addEventListener('closeAlbumFeedView', handleCloseFeedViewEvent)
    return () => {
      window.removeEventListener('closeAlbumFeedView', handleCloseFeedViewEvent)
    }
  }, [handleCloseFeedView])

  // 피드 뷰 렌더링
  if (isFeedView && selectedPostIndex !== null) {
    return (
      <CaptureProtection>
      <div className="min-h-screen bg-white">
        {/* Navigation은 __root.tsx에서 전역 처리 */}

        {/* 피드 리스트 - 원래 순서 유지 */}
        <div 
          ref={feedScrollRef}
          className="pt-16 px-4 pb-20"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 56px)' }}
        >
          {posts.map((post, index) => (
            <article
              key={post.id}
              ref={(el) => { postRefs.current[post.id] = el }}
              className="space-y-4 w-full mx-auto pb-4 mb-4"
              style={{ maxWidth: `${MAX_CONTENT_WIDTH}px` }}
            >
              {/* 헤더 */}
              <header className="flex items-start gap-4 pt-4">
                <Link
                  to="/partners/$memberCode"
                  params={{ memberCode: post.author?.member_code || '' }}
                  className="flex flex-1 items-start gap-4 rounded-2xl p-1 text-left no-underline transition hover:bg-gray-50"
                >
                  <div className="relative flex-shrink-0">
                    <AvatarWithFallback
                      src={post.author?.avatar}
                      name={post.author?.name || ''}
                      className="h-8 w-8"
                    />
                  </div>
                  <div className="flex flex-col flex-1">
                    <p className="font-semibold text-[#110f1a]">{post.author?.name}</p>
                    <div className="flex items-center gap-2 font-bold">
                      <span className="text-xs text-gray-400">@{post.author?.handle}</span>
                      <span className="text-xs text-gray-400">·</span>
                      <p className="text-xs text-gray-400">{formatRelativeTime(post.created_at)}</p>
                    </div>
                  </div>
                </Link>
                {/* 저장 버튼 (post.post_id = posts.id 기준으로 삭제) */}
                <button
                  type="button"
                  onClick={(e) => handleRemoveFromAlbum(e, post.post_id)}
                  className="p-2 text-[#FE3A8F]"
                >
                  <Bookmark className="h-5 w-5 fill-[#FE3A8F]" />
                </button>
              </header>
              {/* 접근 권한 체크 */}
              {(() => {
                const hasPointPrice = post.point_price !== undefined && post.point_price > 0
                
                // canAccessContent 계산 (feed/all.tsx와 동일한 로직)
                const canAccessContent = (() => {
                  // 둘 다 조건이 있는 경우
                  if (post.is_subscribers_only && hasPointPrice) {
                    return post.has_membership || post.is_purchased
                  }
                  // 구독자 전용만
                  if (post.is_subscribers_only) {
                    return post.has_membership
                  }
                  // 유료 포스트만 (point_price > 0)
                  if (hasPointPrice) {
                    return post.is_purchased
                  }
                  return true // 무료 공개 콘텐츠
                })()
                
                const isLocked = !canAccessContent && (post.is_subscribers_only || hasPointPrice)

                return (
                  <>
                    {/* 콘텐츠 */}
                    {post.content && (
                      <div>
                        <p className="text-sm text-[#110f1a] whitespace-pre-wrap">{post.content}</p>
                      </div>
                    )}
                    {/* 미디어 캐러셀 - 워터마크는 현재 로그인 사용자 (유출자 추적용) */}
                    {post.media && post.media.length > 0 && (
                      <FeedMediaCarousel
                        media={post.media}
                        variant="feed"
                        isSubscribersOnly={post.is_subscribers_only}
                        pointPrice={post.point_price}
                        isPurchased={canAccessContent}
                        purchasedMediaOrder={post.purchased_media_order ?? null}
                        isBundle={post.is_bundle}
                        discountRate={post.discount_rate ?? 0}
                        postPointPrice={post.point_price}
                        postIsSubscribersOnly={post.is_subscribers_only}
                        onMediaClick={canAccessContent ? ({ mediaList, index }) => handlePreviewMedia(post.post_id, mediaList, index, user?.member_code) : undefined}
                        onLockedClick={isLocked ? () => handleLockedPostClick(post) : undefined}
                        onMediaPurchaseClick={(mediaIndex) => handleMediaPurchaseClick(post, mediaIndex)}
                        onMembershipClick={() => {
                          setPurchaseTargetPost(post)
                        }}
                        onMediaMembershipClick={(membershipId, _mediaIndex) => {
                          setPurchaseTargetPost(post)
                          if (post.partner_id) {
                            loadMemberships(post.partner_id)
                            setIsMembershipSheetOpen(true)
                          }
                        }}
                        memberCode={user?.member_code}
                      />
                    )}
                    {/* 잠금 상태일 때 미디어 없어도 잠금 표시 */}
                    {isLocked && (!post.media || post.media.length === 0) && (
                      <FeedMediaCarousel
                        media={[]}
                        isSubscribersOnly={post.is_subscribers_only}
                        pointPrice={post.point_price}
                        isPurchased={false}
                        onLockedClick={() => handleLockedPostClick(post)}
                        memberCode={user?.member_code}
                      />
                    )}

                    {/* 액션 버튼 */}
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      <button
                        className={`flex items-center gap-2 font-medium ${
                          likesState[post.post_id]?.liked ? 'text-red-500' : 'text-gray-500'
                        } ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onClick={() => !isLocked && handleToggleLike(post.post_id)}
                        disabled={isLocked}
                      >
                        <Heart
                          className={`h-5 w-5 ${
                            likesState[post.post_id]?.liked ? 'fill-red-500 text-red-500' : ''
                          }`}
                        />
                        {likesState[post.post_id]?.count ?? post.likes}
                      </button>
                      <button
                        className={`flex items-center gap-2 text-gray-500 ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                        onClick={() => !isLocked && handleCommentButtonClick(post.post_id)}
                        disabled={isLocked}
                      >
                        <MessageCircle className="h-5 w-5" />
                        {commentCounts[post.post_id] ?? post.comment_count ?? 0}
                      </button>
                      {!isLocked && (
                        <button
                          className="flex items-center gap-2 text-gray-500 cursor-pointer"
                          onClick={() => handleCopyLink(post.post_id)}
                        >
                          <Repeat2 className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </>
                )
              })()}
            </article>
          ))}
        </div>

        {/* 댓글 슬라이드시트 */}
        <SlideSheet
          isOpen={!!commentSheetPostId}
          onClose={() => {
            setCommentSheetPostId(null)
            setReplyTarget(null)
            setCommentDraft('')
          }}
          title="댓글"
          initialHeight={0.7}
          footer={
            <div 
              className="py-3 bg-white"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
            >
              {replyTarget && (
                <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
                  <CornerDownRight className="h-3 w-3" />
                  <span>{replyTarget.author}님에게 답글 작성 중</span>
                  <button
                    type="button"
                    className="ml-auto text-[#FE3A8F]"
                    onClick={() => setReplyTarget(null)}
                  >
                    취소
                  </button>
                </div>
              )}
              <div className="relative">
                <Input
                  type="text"
                  placeholder={replyTarget ? "답글을 입력하세요..." : "댓글을 입력하세요..."}
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSubmitComment()
                    }
                  }}
                  className="pr-12 rounded-full bg-gray-100 border-0"
                />
                <button
                  type="button"
                  className="absolute right-1.5 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-[#FE3A8F] text-white disabled:opacity-50"
                  onClick={handleSubmitComment}
                  disabled={!commentDraft.trim() || isSubmittingComment}
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          }
        >
          {commentSheetPostId && (
            <>
              {commentLoadingState[commentSheetPostId] ? (
                <div className="flex items-center justify-center py-10">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#FE3A8F] border-t-transparent" />
                </div>
              ) : commentState[commentSheetPostId]?.length ? (
                <div className="space-y-4">
                  {commentState[commentSheetPostId].map((comment) => (
                    <div key={comment.id} className="space-y-2">
                      <div className="flex items-start gap-3">
                        <AvatarWithFallback
                          src={comment.avatar}
                          name={comment.author}
                          size="sm"
                          className="border border-gray-100"
                        />
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-[#110f1a]">
                              {comment.author}
                            </p>
                            {comment.createdAt && (
                            <span className="text-xs text-gray-400">
                              {formatRelativeTime(comment.createdAt)}
                            </span>
                            )}
                            {replyTarget?.id === comment.id && (
                              <span className="rounded-full bg-pink-50 px-2 py-0.5 text-xs text-[#FE3A8F]">
                                답글 작성중
                              </span>
                            )}
                          <button
                              className="ml-auto text-xs font-medium text-gray-400 hover:text-[#110f1a]"
                              onClick={(e) => {
                                e.stopPropagation()
                                setReplyTarget({ id: comment.id, author: comment.author })
                              }}
                          >
                              답글
                          </button>
                          </div>
                          <p className="text-sm text-gray-600">{comment.text}</p>
                        </div>
                      </div>
                      
                      {/* 대댓글 */}
                      {comment.replies && comment.replies.length > 0 && (
                        <div className="flex gap-3">
                          <div className="h-8 w-8 shrink-0" />
                          <div className="flex-1 space-y-2">
                            <button
                              type="button"
                              className="text-xs text-[#110f1a]"
                              onClick={() => handleToggleReplies(comment.id)}
                            >
                              {collapsedReplies[comment.id]
                                ? '답글 접기'
                                : `답글 ${comment.replies.length}개 보기`}
                            </button>
                            {collapsedReplies[comment.id] && comment.replies.map((reply) => (
                              <div key={reply.id} className="flex items-start gap-3">
                              <AvatarWithFallback
                                src={reply.avatar}
                                name={reply.author}
                                  size="sm"
                                  className="border border-gray-100"
                              />
                                <div className="flex-1 space-y-1">
                                <div className="flex items-center gap-2">
                                    <p className="text-sm font-semibold text-[#110f1a]">
                                    {reply.author}
                                    </p>
                                    {reply.createdAt && (
                                  <span className="text-xs text-gray-400">
                                    {formatRelativeTime(reply.createdAt)}
                                  </span>
                                    )}
                                </div>
                                  <p className="text-sm text-gray-600">{reply.text}</p>
                              </div>
                            </div>
                          ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-gray-400">
                  첫 댓글을 남겨보세요.
                </p>
              )}
            </>
          )}
        </SlideSheet>

        {/* 개별 미디어 구매 팝업 - 피드 뷰 */}
        {mediaPurchaseTarget && (
          <SlideSheet
            isOpen={isMediaPurchaseSheetVisible}
            onClose={() => {
              setIsMediaPurchaseSheetVisible(false)
              setMediaPurchaseTarget(null)
              setSelectedMediaPurchaseOption(null)
            }}
            title="미디어 구매"
            footer={
              (() => {
                const { post, mediaIndex } = mediaPurchaseTarget
                const media = post.media?.[mediaIndex]
                if (!media || !media.point_price || media.point_price <= 0) return null

                return (
                  <div className="flex gap-3 px-4 pb-4">
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

              const discountRate = post.discount_rate ?? 0
              
              const mediaUpToIndex = post.media?.slice(0, mediaIndex + 1).filter((m, idx) => {
                const isPurchased = post.purchased_media_order != null && idx <= post.purchased_media_order
                return !m.signed_url && m.point_price != null && m.point_price > 0 && !isPurchased
              }) || []
              const basePrice = mediaUpToIndex.reduce((sum, m) => sum + (m.point_price || 0), 0)
              const finalPrice = discountRate > 0 && discountRate <= 100
                ? Math.round(basePrice * (1 - discountRate / 100))
                : basePrice
              const hasDiscount = discountRate > 0 && discountRate <= 100 && basePrice > 0
              const mediaCountUpToIndex = mediaUpToIndex.length

              const unpurchasedMedia = post.media?.filter((m, idx) => {
                const isPurchased = post.purchased_media_order != null && idx <= post.purchased_media_order
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

                  {post.is_bundle && unpurchasedMedia.length > 1 && (
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

        {/* 포스트 열기 (구매) 팝업 - 피드 뷰 */}
        <SlideSheet
          isOpen={!!purchaseTargetPost}
          onClose={closePurchaseSheet}
          title="포스트 열기"
          footer={
            purchaseTargetPost && (
              <div className="flex gap-2 px-4 pb-4">
                <button
                  type="button"
                  className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-[#110f1a] hover:bg-gray-50"
                  onClick={closePurchaseSheet}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-xl bg-[#110f1a] px-4 py-3 text-sm font-semibold text-white hover:bg-[#241f3f] disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={() => {
                    if (purchaseTargetPost.point_price && purchaseTargetPost.point_price > 0) {
                      handleOneTimePurchase()
                    } else if (purchaseTargetPost.is_subscribers_only) {
                      handleMembershipOptionClick()
                    }
                  }}
                  disabled={isProcessingPurchase || (!(purchaseTargetPost.point_price && purchaseTargetPost.point_price > 0) && !purchaseTargetPost.is_subscribers_only)}
                >
                  {isProcessingPurchase ? '결제 중...' : '포스트 열기'}
                </button>
              </div>
            )
          }
        >
          {purchaseTargetPost && (
            <div className="space-y-3 px-4">
              {/* 멤버십 구독 옵션 */}
              {purchaseTargetPost.is_subscribers_only && (
                <button
                  type="button"
                  onClick={handleMembershipOptionClick}
                  className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-left hover:bg-gray-50"
                >
                  <div className="mb-3">
                    <Typography variant="body1" className="font-semibold text-[#110f1a]">
                      멤버쉽 구독하기
                    </Typography>
                  </div>
                  <div className="flex items-center gap-2">
                    <Star className="h-5 w-5 fill-purple-500 text-purple-500" />
                    <Typography variant="body2" className="text-gray-500">
                      구독하면 이 파트너의 모든 멤버쉽 전용 콘텐츠를 볼 수 있습니다
                    </Typography>
                  </div>
                </button>
              )}

              {/* 단건구매 옵션 */}
              {purchaseTargetPost.point_price !== undefined && purchaseTargetPost.point_price > 0 && (
                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="mb-3">
                    <Typography variant="body1" className="font-semibold text-[#110f1a]">
                      이 포스트만 구매하기
                    </Typography>
                  </div>
                  <div className="flex items-center gap-2">
                    <Heart className="h-5 w-5 fill-[#FE3A8F] text-[#FE3A8F]" />
                    <Typography variant="body1" className="font-semibold text-[#110f1a]">
                      {purchaseTargetPost.point_price.toLocaleString()}P
                    </Typography>
                  </div>
                  <button
                    type="button"
                    className="mt-3 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-[#110f1a] hover:bg-gray-50"
                    onClick={handleOneTimePurchase}
                    disabled={isProcessingPurchase}
                  >
                    {isProcessingPurchase ? '구매 중...' : '단건 구매하기'}
                  </button>
                </div>
              )}
            </div>
          )}
        </SlideSheet>

        {/* 멤버쉽 선택 팝업 - 피드 뷰 */}
        <SlideSheet
          isOpen={isMembershipSheetOpen}
          onClose={() => {
            setIsMembershipSheetOpen(false)
            setSelectedMembershipId(null)
          }}
          title="멤버쉽 선택"
          footer={
            <div className="flex gap-2 px-4 pb-4">
              <button
                type="button"
                className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-[#110f1a] hover:bg-gray-50"
                onClick={() => {
                  setIsMembershipSheetOpen(false)
                  setSelectedMembershipId(null)
                }}
              >
                취소
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl bg-[#FE3A8F] px-4 py-3 text-sm font-semibold text-white hover:bg-[#e0357f] disabled:opacity-50"
                onClick={handleSubscribe}
                disabled={!selectedMembershipId || isSubscribing}
              >
                {isSubscribing ? '구독 중...' : '구독하기'}
              </button>
            </div>
          }
        >
          <div className="space-y-3 px-4">
            {memberships.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">
                구독 가능한 멤버쉽이 없습니다.
              </p>
            ) : (
              memberships.map((membership) => (
                <button
                  key={membership.id}
                  type="button"
                  onClick={() => setSelectedMembershipId(membership.id)}
                  className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                    selectedMembershipId === membership.id
                      ? 'border-[#FE3A8F] bg-pink-50'
                      : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Typography variant="body1" className="font-semibold text-[#110f1a]">
                      {membership.name}
                    </Typography>
                    <Typography variant="body1" className="font-semibold text-[#FE3A8F]">
                      {membership.monthly_price.toLocaleString()}P/월
                    </Typography>
                  </div>
                  {membership.description && (
                    <Typography variant="body2" className="mt-2 text-gray-500">
                      {membership.description}
                    </Typography>
                  )}
                </button>
              ))
            )}
          </div>
        </SlideSheet>

        {/* 전체화면 미디어 프리뷰 - 피드 뷰 */}
        {previewState && (
          <MediaPreview
            items={previewState.items}
            initialIndex={previewState.index}
            onClose={() => setPreviewState(null)}
            memberCode={user?.member_code}
          />
        )}
      </div>
      </CaptureProtection>
    )
  }

  // 그리드 뷰 (기본)
  return (
    <CaptureProtection>
    <div className="min-h-screen bg-white pb-20">
      {/* Navigation은 __root.tsx에서 전역 처리 */}
      
      {/* 그리드 콘텐츠 */}
      <div 
        className="pt-16 mx-auto"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 64px)', maxWidth: `${MAX_CONTENT_WIDTH}px` }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#FE3A8F] border-t-transparent" />
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <Bookmark className="h-12 w-12 text-gray-300 mb-4" />
            <p className="text-gray-500">저장된 게시물이 없습니다</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-0.5">
            {posts.map((post, index) => {
              // 워터마크는 현재 로그인 사용자 (유출자 추적용)
              const watermarkCode = user?.member_code || 'unknown'
              return (
              <button
                key={post.id}
                type="button"
                onClick={() => handleGridItemClick(index)}
                className="aspect-square overflow-hidden bg-gray-100 relative"
              >
                {/* 썸네일 이미지 */}
                {post.thumbnail_url ? (
                    <>
                  <img
                    src={post.thumbnail_url}
                    alt=""
                    className="w-full h-full object-cover"
                        draggable={false}
                        onContextMenu={(e) => e.preventDefault()}
                      />
                      {/* 워터마크 오버레이 - 현재 로그인 사용자 */}
                      {watermarkCode && (
                        <div 
                          className="absolute inset-0 overflow-hidden pointer-events-none select-none"
                          style={{ zIndex: 5 }}
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
                              gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))',
                              gap: '30px 15px',
                              padding: '10px',
                            }}
                          >
                            {Array.from({ length: 40 }).map((_, i) => (
                              <span
                                key={i}
                                className="text-white font-bold whitespace-nowrap"
                                style={{
                                  fontSize: '8px',
                                  opacity: 0.15,
                                  textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
                                }}
                              >
                                @{watermarkCode}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Bookmark className="h-6 w-6 text-gray-300" />
                  </div>
                )}
                
                {/* 동영상 표시 아이콘 */}
                {post.is_video && (
                    <div className="absolute top-2 right-2 z-10">
                    <Play className="h-4 w-4 text-white drop-shadow-lg" fill="white" />
                  </div>
                )}
              </button>
              )
            })}
          </div>
        )}
      </div>

      {/* 메뉴 슬라이드 시트 */}
      <SlideSheet
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        title="컬렉션 관리"
        height="auto"
      >
        <div className="px-4 pb-6 space-y-2">
          {!isAllPosts && (
            <button
              type="button"
              onClick={handleStartEditTitle}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[#110f1a] hover:bg-gray-50"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span className="font-medium">이름 변경</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleDeleteAlbum}
            disabled={isDeletingAlbum}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-500 hover:bg-red-50"
          >
            <Trash2 className="h-5 w-5" />
            <span className="font-medium">
              {isDeletingAlbum ? '삭제 중...' : '컬렉션 삭제'}
            </span>
          </button>
        </div>
      </SlideSheet>

      {/* 앨범명 수정 모달 */}
      <SlideSheet
        isOpen={isEditingTitle}
        onClose={() => setIsEditingTitle(false)}
        title="컬렉션 이름 변경"
        height="auto"
        footer={
          <div className="flex gap-2 px-4 pb-4">
            <button
              type="button"
              onClick={() => setIsEditingTitle(false)}
              className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-[#110f1a] hover:bg-gray-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSaveTitle}
              disabled={isSavingTitle || !editTitle.trim()}
              className="flex-1 rounded-xl bg-[#FE3A8F] px-4 py-3 text-sm font-semibold text-white hover:bg-[#e5327f] disabled:opacity-50"
            >
              {isSavingTitle ? '저장 중...' : '저장'}
            </button>
          </div>
        }
      >
        <div className="px-4 py-4">
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="컬렉션 이름을 입력하세요"
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:border-[#FE3A8F] focus:outline-none"
            autoFocus
          />
        </div>
      </SlideSheet>

      {/* 포스트 열기 (구매) 팝업 */}
      <SlideSheet
        isOpen={!!purchaseTargetPost}
        onClose={closePurchaseSheet}
        title="포스트 열기"
        footer={
          purchaseTargetPost && (
            <div className="flex gap-2 px-4 pb-4">
              <button
                type="button"
                className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-[#110f1a] hover:bg-gray-50"
                onClick={closePurchaseSheet}
              >
                취소
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl bg-[#110f1a] px-4 py-3 text-sm font-semibold text-white hover:bg-[#241f3f] disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => {
                  if (purchaseTargetPost.point_price && purchaseTargetPost.point_price > 0) {
                    handleOneTimePurchase()
                  } else if (purchaseTargetPost.is_subscribers_only) {
                    handleMembershipOptionClick()
                  }
                }}
                disabled={isProcessingPurchase || (!(purchaseTargetPost.point_price && purchaseTargetPost.point_price > 0) && !purchaseTargetPost.is_subscribers_only)}
              >
                {isProcessingPurchase ? '결제 중...' : '포스트 열기'}
              </button>
            </div>
          )
        }
      >
        {purchaseTargetPost && (
          <div className="space-y-3 px-4">
            {/* 멤버십 구독 옵션 */}
            {purchaseTargetPost.is_subscribers_only && (
              <button
                type="button"
                onClick={handleMembershipOptionClick}
                className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-left hover:bg-gray-50"
              >
                <div className="mb-3">
                  <Typography variant="body1" className="font-semibold text-[#110f1a]">
                    멤버쉽 구독하기
                  </Typography>
                </div>
                <div className="flex items-center gap-2">
                  <Star className="h-5 w-5 fill-purple-500 text-purple-500" />
                  <Typography variant="body2" className="text-gray-500">
                    구독하면 이 파트너의 모든 멤버쉽 전용 콘텐츠를 볼 수 있습니다
                  </Typography>
                </div>
              </button>
            )}

            {/* 단건구매 옵션 */}
            {purchaseTargetPost.point_price !== undefined && purchaseTargetPost.point_price > 0 && (
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="mb-3">
                  <Typography variant="body1" className="font-semibold text-[#110f1a]">
                    이 포스트만 구매하기
                  </Typography>
                </div>
                <div className="flex items-center gap-2">
                  <Heart className="h-5 w-5 fill-[#FE3A8F] text-[#FE3A8F]" />
                  <Typography variant="body1" className="font-semibold text-[#110f1a]">
                    {purchaseTargetPost.point_price.toLocaleString()}P
                  </Typography>
                </div>
                <button
                  type="button"
                  className="mt-3 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-[#110f1a] hover:bg-gray-50"
                  onClick={handleOneTimePurchase}
                  disabled={isProcessingPurchase}
                >
                  {isProcessingPurchase ? '구매 중...' : '단건 구매하기'}
                </button>
              </div>
            )}
          </div>
        )}
      </SlideSheet>

      {/* 멤버쉽 선택 팝업 */}
      <SlideSheet
        isOpen={isMembershipSheetOpen}
        onClose={() => {
          setIsMembershipSheetOpen(false)
          setSelectedMembershipId(null)
        }}
        title="멤버쉽 선택"
        footer={
          <div className="flex gap-2 px-4 pb-4">
            <button
              type="button"
              className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-[#110f1a] hover:bg-gray-50"
              onClick={() => {
                setIsMembershipSheetOpen(false)
                setSelectedMembershipId(null)
              }}
            >
              취소
            </button>
            <button
              type="button"
              className="flex-1 rounded-xl bg-[#FE3A8F] px-4 py-3 text-sm font-semibold text-white hover:bg-[#e0357f] disabled:opacity-50"
              onClick={handleSubscribe}
              disabled={!selectedMembershipId || isSubscribing}
            >
              {isSubscribing ? '구독 중...' : '구독하기'}
            </button>
          </div>
        }
      >
        <div className="space-y-3 px-4">
          {memberships.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">
              구독 가능한 멤버쉽이 없습니다.
            </p>
          ) : (
            memberships.map((membership) => (
              <button
                key={membership.id}
                type="button"
                onClick={() => setSelectedMembershipId(membership.id)}
                className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                  selectedMembershipId === membership.id
                    ? 'border-[#FE3A8F] bg-pink-50'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Typography variant="body1" className="font-semibold text-[#110f1a]">
                    {membership.name}
                  </Typography>
                  <Typography variant="body1" className="font-semibold text-[#FE3A8F]">
                    {membership.monthly_price.toLocaleString()}P/월
                  </Typography>
                </div>
                {membership.description && (
                  <Typography variant="body2" className="mt-2 text-gray-500">
                    {membership.description}
                  </Typography>
                )}
              </button>
            ))
          )}
        </div>
      </SlideSheet>

      {/* 전체화면 미디어 프리뷰 */}
      {previewState && (
        <MediaPreview
          items={previewState.items}
          initialIndex={previewState.index}
          onClose={() => setPreviewState(null)}
          memberCode={previewState.memberCode}
        />
      )}
    </div>
    </CaptureProtection>
  )
}
