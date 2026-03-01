'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type SyntheticEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { motion, useMotionValue } from 'framer-motion'
import { Link, createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  Bookmark,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Heart,
  MessageCircle,
  MoreVertical,
  Plus,
  Search as SearchIcon,
  Send,
  Repeat2,
  Star,
  Trash2,
  Volume2,
  VolumeX,
  X,
  Flag,
  Ban,
} from 'lucide-react'
import { MobileTabBar } from '@/components/layouts/MobileTabBar'
import { Navigation } from '@/components/layouts/Navigation'
import type { FeedNavTab } from '@/components/layouts/MobileTabBar'
import { Avatar, AvatarWithFallback, Button, Input, Typography, SlideSheet, SavePostSheet, AdBanner } from '@/components'
import { 
  ReportModal, 
  type ReportTargetType, 
  EventPopupModal, 
  shouldShowEventPopup,
  MembershipNotificationPopup,
  saveMembershipNotificationData,
  getMembershipNotificationData,
  clearMembershipNotificationData,
  hasMembershipNotificationData,
  type MembershipNotificationData,
} from '@/components/modals'
import { useDevice } from '@/hooks/useDevice'
import { useAuth } from '@/hooks/useAuth'
import { Capacitor } from '@capacitor/core'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { useCreatePostStore } from '@/store/useCreatePostStore'
import { useAuthStore } from '@/store/useAuthStore'
import { resolveAccessToken } from '@/utils/sessionToken'
import { captureVideoThumbnail } from '@/utils/media'
import { supabase } from '@/lib/supabase'
import { edgeApi } from '@/lib/apiClient'
import { toast } from '@/components/ui/sonner'
import { CaptureProtection } from '@/components/CaptureProtection'
import {
  mapApiFilesToMedia,
  mapApiFilesToMediaWithSignedUrls,
  type NormalizedMedia,
} from '@/utils/media'

type NavTab = FeedNavTab
type FeedCategory = 'following' | 'subscription'

// 모듈 레벨 변수 - 컴포넌트 리마운트에도 유지됨
let globalFeedFetched = false
let globalFeedData: FeedPost[] | null = null
let globalLikesState: Record<string, { liked: boolean; count: number }> = {}
let globalCommentCounts: Record<string, number> = {}
let globalFollowState: Record<string, boolean> = {}

// 다른 페이지에서 좋아요 상태 업데이트시 호출
export function updateGlobalLikeState(postId: string, liked: boolean, count: number) {
  globalLikesState[postId] = { liked, count }
  // globalFeedData도 업데이트
  if (globalFeedData) {
    globalFeedData = globalFeedData.map((post) =>
      post.id === postId ? { ...post, isLiked: liked, likes: count } : post
    )
  }
}

// 다른 페이지에서 댓글 카운트 업데이트시 호출
export function updateGlobalCommentCount(postId: string, count: number) {
  globalCommentCounts[postId] = count
  // globalFeedData도 업데이트
  if (globalFeedData) {
    globalFeedData = globalFeedData.map((post) =>
      post.id === postId ? { ...post, commentCount: count } : post
    )
  }
}

// 다른 페이지에서 댓글 추가시 호출 (카운트 증가)
export function incrementGlobalCommentCount(postId: string) {
  // globalCommentCounts에 없으면 globalFeedData에서 가져옴
  let currentCount = globalCommentCounts[postId]
  if (currentCount === undefined && globalFeedData) {
    const post = globalFeedData.find(p => p.id === postId)
    currentCount = post?.commentCount ?? 0
  }
  updateGlobalCommentCount(postId, (currentCount ?? 0) + 1)
}

// 다른 페이지에서 팔로우 상태 업데이트시 호출 (memberCode 기반)
export function updateGlobalFollowState(memberCode: string, followed: boolean) {
  globalFollowState[memberCode] = followed
  // globalFeedData도 업데이트 - author.handle (memberCode)로 매칭
  if (globalFeedData) {
    globalFeedData = globalFeedData.map((post) =>
      post.author?.handle === memberCode ? { ...post, isFollowed: followed } : post
    )
  }
}

// 전역 구매 상태 - 구매 완료된 포스트 ID 저장
let globalPurchasedPosts: Set<string> = new Set()

// 전역 멤버십 구독 상태 - 구독한 파트너 ID 저장
let globalMembershipPartners: Set<string> = new Set()

// 다른 페이지에서 구매 상태 업데이트시 호출
export function updateGlobalPurchaseState(postId: string, purchased: boolean, media?: FeedMedia[]) {
  if (purchased) {
    globalPurchasedPosts.add(postId)
  } else {
    globalPurchasedPosts.delete(postId)
  }
  // globalFeedData도 업데이트
  if (globalFeedData) {
    globalFeedData = globalFeedData.map((post) =>
      post.id === postId 
        ? { ...post, isPurchased: purchased, ...(media ? { media } : {}) } 
        : post
    )
  }
}

// 다른 페이지에서 멤버십 구독 상태 업데이트시 호출
export function updateGlobalMembershipState(partnerId: string, hasMembership: boolean) {
  if (hasMembership) {
    globalMembershipPartners.add(partnerId)
  } else {
    globalMembershipPartners.delete(partnerId)
  }
  // globalFeedData도 업데이트 - 해당 파트너의 모든 게시물에 hasMembership 적용
  if (globalFeedData) {
    globalFeedData = globalFeedData.map((post) =>
      post.partnerId === partnerId 
        ? { ...post, hasMembership } 
        : post
    )
  }
}

// 다른 페이지에서 게시물 고정 상태 업데이트시 호출
export function updateGlobalPinState(postId: string, isPinned: boolean) {
  if (globalFeedData) {
    globalFeedData = globalFeedData.map((post) =>
      post.id === postId 
        ? { ...post, isPinned } 
        : post
    )
  }
}

// 포스트가 구매되었는지 확인
export function isPostPurchased(postId: string): boolean {
  if (globalPurchasedPosts.has(postId)) return true
  if (globalFeedData) {
    const post = globalFeedData.find(p => p.id === postId)
    return post?.isPurchased ?? false
  }
  return false
}

// 전역 캐시에서 포스트 제거 (제재/삭제 시 호출)
export function removePostFromGlobalCache(postId: string) {
  if (globalFeedData) {
    globalFeedData = globalFeedData.filter(p => p.id !== postId)
  }
  // 관련 상태도 정리
  delete globalLikesState[postId]
  delete globalCommentCounts[postId]
  globalPurchasedPosts.delete(postId)
}

// 전역 캐시 완전 무효화 (멤버쉽 구독 등 상태 변경 시 호출)
export function invalidateGlobalFeedCache() {
  globalFeedFetched = false
  globalFeedData = null
  globalLikesState = {}
  globalCommentCounts = {}
  globalFollowState = {}
  globalPurchasedPosts = new Set()
  globalMembershipPartners = new Set()
}

export interface FeedMedia extends NormalizedMedia {
  aspectRatio?: number
  point_price?: number | null // 개별 미디어 가격
  signed_url?: string | null // 미디어 접근 URL (null이면 미구매)
  membership_id?: string | null // 멤버십 구매 필요 여부
}

export interface FeedComment {
  id: string
  /** 화면에 표시할 이름 */
  user: string
  /** 댓글 텍스트 */
  text: string
  replies?: FeedComment[]
  /** 실제 사용자 ID */
  userId?: string
  /** 사용자 member_code */
  memberCode?: string
  /** 작성 시각 */
  createdAt?: string
  /** 사용자 프로필 이미지 URL */
  avatar?: string
}

export interface FeedPost {
  id: string
  partnerId?: string
  category: FeedCategory
  author: {
    name: string
    handle: string
    avatar: string
  }
  postedAt: string
  content: string
  media?: FeedMedia[]
  likes: number
  comments: FeedComment[]
  tags: string[]
  isLiked?: boolean
  isFollowed?: boolean
  isSubscribersOnly?: boolean
  pointPrice?: number
  /** API에서 내려오는 총 댓글 수 (옵션) */
  commentCount?: number
  /** 이미 단건구매 완료 여부 */
  isPurchased?: boolean
  /** 유료 포스트 여부 */
  isPaidPost?: boolean
  /** 앨범에 저장되어 있는지 여부 */
  isInAlbum?: boolean
  /** 해당 파트너의 멤버쉽을 구독 중인지 여부 */
  hasMembership?: boolean
  /** 게시물 고정 여부 */
  isPinned?: boolean
  /** 묶음 판매 여부 */
  isBundle?: boolean
  /** 할인율 (0-100) */
  discountRate?: number
  /** 멤버십 ID */
  membershipId?: string | null
  /** 구매한 미디어 인덱스 (개별 판매인 경우) */
  purchasedMediaOrder?: number | null
}

const searchUsers = [
  {
    id: 'user-1',
    name: '정밀조준 서윤',
    handle: 'aim.soul',
    avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=200',
    specialty: '발로란트 · 에임 교정',
  },
  {
    id: 'user-2',
    name: '프로 탑솔러 혁진',
    handle: 'topking',
    avatar: 'https://images.unsplash.com/photo-1544723795-3fb6469f5b39?w=200',
    specialty: 'LOL · 탑티어 운영',
  },
  {
    id: 'user-3',
    name: '커뮤니케이션 천재 하린',
    handle: 'callmeharin',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200',
    specialty: '팀 전략 · 멘탈 케어',
  },
]


export const feedSeeds: FeedPost[] = [
  {
    id: 'post-1',
    partnerId: '7840b00b-8b49-49fd-82a3-c10417bb651f',
    category: 'following',
    author: {
      name: '프로게이머 아린',
      handle: 'arin.gg',
      avatar: 'https://images.unsplash.com/photo-1544723795-3fb6469f5b39?w=200',
    },
    postedAt: '2시간 전',
    content:
      '오늘은 바텀 듀오 운영 팁 3가지를 정리해봤어요. 라인전에서 주도권 잡는 법 + 시야 장악 루틴 공유합니다.',
    media: [
      { type: 'image', src: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?w=900', aspectRatio: 3 / 4 },
      { type: 'image', src: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=900', aspectRatio: 4 / 5 },
    ],
    likes: 128,
    comments: [
      {
        id: 'post-1-c1',
        user: '듀오찾아요',
        text: '정리 최고네요! 실전에서 바로 써봤어요.',
        replies: [
          { id: 'post-1-c1-r1', user: '프로게이머 아린', text: '바로 적용해주셔서 감사해요!' },
          { id: 'post-1-c1-r2', user: 'LOL 박사', text: '저도 참고해볼게요!' },
        ],
      },
      { id: 'post-1-c2', user: '원딜요정', text: '라인전 주도권 팁 진짜 도움됐습니다 🙌' },
    ],
    tags: ['바텀 운영', '시야 장악', 'LOL'],
  },
  {
    id: 'post-2',
    partnerId: '0c2c3b94-5f83-4b01-a021-2c1bf2a66c88',
    category: 'subscription',
    author: {
      name: '멘탈코치 은영',
      handle: 'coach.eunyoung',
      avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=200',
    },
    postedAt: '5시간 전',
    content:
      '구독자 전용 멘탈 리셋 루틴 올려요. 랭크 연패 후 회복 루틴 체크리스트와 호흡법 녹음본 포함!',
    media: [
      {
        type: 'video',
        src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
        aspectRatio: 16 / 9,
      },
    ],
    likes: 342,
    comments: [{ id: 'post-2-c1', user: '멘탈필수', text: '이 루틴 덕분에 다시 승승장구 중!' }],
    tags: ['멘탈 케어', '구독 전용'],
  },
  {
    id: 'post-3',
    partnerId: '1f7f642b-65e7-4d2d-8e35-5d8b59fa4a99',
    category: 'following',
    author: {
      name: '하루만에 에임UP',
      handle: 'aimcoach',
      avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200',
    },
    postedAt: '어제',
    content: 'FPS 스프레이 컨트롤 세션 라이브 복습 영상입니다. 30분만 투자하면 확실히 체감돼요.',
    media: [
      { type: 'image', src: 'https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?w=900', aspectRatio: 4 / 3 },
      {
        type: 'video',
        src: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
        aspectRatio: 16 / 9,
      },
    ],
    likes: 201,
    comments: [
      {
        id: 'post-3-c1',
        user: '헤드헌터',
        text: '따라 했더니 승률이 올라서 놀람!',
        replies: [{ id: 'post-3-c1-r1', user: 'aimcoach', text: '꾸준히 하시면 더 좋아져요!' }],
      },
    ],
    tags: ['FPS', '컨트롤'],
  },
  {
    id: 'post-4',
    partnerId: '5f1b3d0d-2fda-4f5d-8550-22fcb5b04675',
    category: 'subscription',
    author: {
      name: '포지션 아티스트 린',
      handle: 'vision.linn',
      avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=200',
    },
    postedAt: '2일 전',
    content:
      '세로형 하이라이트 클립 묶어서 올려요. 모바일 시청자 피드백 분석과 세로 캡쳐 프리셋까지 공유합니다.',
    media: [
      {
        type: 'image',
        src: 'https://images.unsplash.com/photo-1459257868276-5e65389e2722?w=900',
        aspectRatio: 9 / 16,
      },
      {
        type: 'image',
        src: 'https://images.unsplash.com/photo-1485988412941-77a35537dae4?w=900',
        aspectRatio: 2 / 3,
      },
    ],
    likes: 418,
    comments: [
      {
        id: 'post-4-c1',
        user: '모바일기획자',
        text: '세로 감각 참고 많이 됐어요!',
      },
    ],
    tags: ['세로 콘텐츠', '하이라이트', '모바일 최적화'],
  },
  {
    id: 'post-5',
    partnerId: 'af0d01c0-cc30-4aec-9c4e-4d24dd47dbf8',
    category: 'following',
    author: {
      name: '싱글샷 전략가 태유',
      handle: 'singlefocus',
      avatar: 'https://images.unsplash.com/photo-1529665253569-6d01c0eaf7b6?w=200',
    },
    postedAt: '이번 주',
    content: '하나의 장면만으로 전달력 살리는 법. 단일 컷 편집 템플릿을 공유합니다.',
    media: [
      {
        type: 'image',
        src: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=900',
        aspectRatio: 4 / 5,
      },
    ],
    likes: 95,
    comments: [{ id: 'post-5-c1', user: '컷편집러', text: '단일컷 작업에 바로 적용했어요.' }],
    tags: ['싱글컷', '편집 템플릿'],
  },
]

type FeedViewMode =
  | { type: 'following' }
  | { type: 'subscription' }
  | { type: 'user'; userId: string }

export interface FeedPageProps {
  mode: FeedViewMode
  tab?: NavTab
}

/** 피드 이미지/영상 비율 규격화 */
// 가로 비율: 5:4, 3:2, 16:9, 1:1
const LANDSCAPE_RATIOS = [5/4, 3/2, 16/9, 1/1]
// 세로 비율: 9:16, 2:3, 3:4, 3/5, 10/16
const PORTRAIT_RATIOS = [9/16, 2/3, 3/4, 3/5, 10/16]

// 원본 비율을 가장 가까운 규격 비율로 클램프
const clampRatio = (r: number) => {
  if (!Number.isFinite(r) || r <= 0) return 1
  
  const isLandscape = r >= 1
  const targetRatios = isLandscape ? LANDSCAPE_RATIOS : PORTRAIT_RATIOS
  
  // 가장 가까운 비율 찾기
  let closestRatio = targetRatios[0]
  let minDiff = Math.abs(r - closestRatio)
  
  for (const ratio of targetRatios) {
    const diff = Math.abs(r - ratio)
    if (diff < minDiff) {
      minDiff = diff
      closestRatio = ratio
    }
  }
  
  return closestRatio
}
const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

interface ApiCommentUser {
  id: string
  name: string
  profile_image?: string | null
  member_code?: string | null
}

interface ApiComment {
  id: string
  post_id: string
  user_id: string
  parent_id: string | null
  index: number | null
  content: string
  created_at: string
  user?: ApiCommentUser | null
  replies?: ApiComment[]
}

const mapApiComments = (comments: ApiComment[]): FeedComment[] =>
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
      replies: comment.replies ? mapApiComments(comment.replies as ApiComment[]) : [],
    }
  })

const countTotalComments = (list: FeedComment[] = []): number =>
  list.reduce(
    (sum, comment) => sum + 1 + countTotalComments(comment.replies || []),
    0,
  )

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

function FeedPage({ mode, tab }: FeedPageProps) {
  const { isMobile } = useDevice()
  const navigate = useNavigate()
  const { user, refetchPoints, refreshUser, isAuthenticated } = useAuth()
  const authAccessToken = useAuthStore((state) => (state as any).accessToken)
  const authRefreshToken = useAuthStore((state) => (state as any).refreshToken)
  const syncSession = useAuthStore((state) => state.syncSession)
  const storeUser = useAuthStore((state) => state.user)
  const updateAuthStorePoints = useAuthStore((state) => state.updateUserPoints)
  const queryClient = useQueryClient()
  // strict: false로 현재 라우트에 관계없이 검색 파라미터 가져오기
  const search = useSearch({ strict: false }) as { postId?: string }
  const currentTab = tab ?? 'home'
  const initialFilter = mode.type === 'subscription' ? 'subscription' : 'following'
  const [feedFilter, setFeedFilter] = useState<FeedCategory>(initialFilter)
  const [feed, setFeed] = useState<FeedPost[]>([])
  const [isLoadingFeed, setIsLoadingFeed] = useState(true)
  
  // 이벤트 배너 상태
  const [eventBanners, setEventBanners] = useState<Array<{
    id: string
    imageUrl?: string
    linkUrl?: string
    altText?: string
  }>>([])
  const eventBannersFetchedRef = useRef(false)
  const pageRef = useRef(1)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [hasMoreFeed, setHasMoreFeed] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const pullStartYRef = useRef<number | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  
  // 저장(북마크) 관련 상태
  const [isSaveSheetOpen, setIsSaveSheetOpen] = useState(false)
  const [savedPostInfo, setSavedPostInfo] = useState<{
    post_id: string
    thumbnail_url?: string
  } | null>(null)
  const [savedPostIds, setSavedPostIds] = useState<Set<string>>(new Set())
  
  // 관리자 제재 팝업 상태
  const [reportSheetPostId, setReportSheetPostId] = useState<string | null>(null)
  const [reportReasonType, setReportReasonType] = useState<number>(1)
  const [reportReasonDetail, setReportReasonDetail] = useState('')
  const [isSubmittingReport, setIsSubmittingReport] = useState(false)
  
  // 일반 사용자 신고 모달 상태
  const [userReportModal, setUserReportModal] = useState<{
    isOpen: boolean
    targetType: ReportTargetType
    targetId: string
    targetName?: string
  }>({ isOpen: false, targetType: 'post', targetId: '' })
  
  // 더보기 메뉴 상태 (포스트별)
  const [moreMenuPost, setMoreMenuPost] = useState<{
    isOpen: boolean
    postId: string
    authorHandle: string
    authorName: string
    authorId: string
  } | null>(null)
  
  // 이벤트 팝업 상태
  const [isEventPopupOpen, setIsEventPopupOpen] = useState(false)
  
  // 멤버십 알림 팝업 상태
  const [isMembershipNotificationOpen, setIsMembershipNotificationOpen] = useState(false)
  const [membershipNotificationData, setMembershipNotificationData] = useState<MembershipNotificationData | null>(null)
  
  const getAccessToken = useCallback(() => {
    return resolveAccessToken({
      accessToken: authAccessToken,
      refreshToken: authRefreshToken,
      syncSession,
    })
  }, [authAccessToken, authRefreshToken, syncSession])
  // TODO: 임시로 approved 조건 제거 - 나중에 복원 필요
  // const canCreatePost = (user?.role === 'partner' || user?.role === 'admin') && 
  //   user?.partner_status === 'approved' && 
  //   mode.type !== 'subscription'
  const canCreatePost = (user?.role === 'partner' || user?.role === 'admin') && 
    mode.type !== 'subscription'
  const handleCreatePost = useCallback(() => {
    if (!canCreatePost) return
    const isNative = Capacitor.isNativePlatform()
    if (isNative) {
      navigate({ to: '/feed/create' })
      return
    }

    if (typeof window === 'undefined' || typeof document === 'undefined') return

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*,video/*'
    input.multiple = true
    input.onchange = (event) => {
      const target = event.target as HTMLInputElement
      if (target.files && target.files.length > 0) {
        const files = Array.from(target.files)
        const newMedia = files.map((file) => ({
          file,
          preview: URL.createObjectURL(file),
          type: file.type.startsWith('video/') ? ('video' as const) : ('image' as const),
        }))
        const store = useCreatePostStore.getState()
        store.addSelectedMedia(newMedia)
        store.addGalleryImages(newMedia)
        store.setHasRequestedPermission(true)
        navigate({ to: '/feed/create' })
      }
    }
    input.click()
  }, [canCreatePost, navigate])

  useEffect(() => {
    if (mode.type === 'subscription') {
      setFeedFilter('subscription')
    } else {
      setFeedFilter('following')
    }
  }, [mode])

  // 멤버십 알림 API 호출 여부 추적 (중복 호출 방지)
  const membershipNotificationFetchedRef = useRef(false)

  // 이벤트 팝업 표시 여부 확인 (최초 앱 시작시)
  useEffect(() => {
    // 멤버십 알림 API 호출 (한 번만)
    const fetchMembershipNotifications = async () => {
      if (!isAuthenticated || membershipNotificationFetchedRef.current) return
      membershipNotificationFetchedRef.current = true
      
      try {
        const token = await getAccessToken()
        if (!token) return
        
        const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
        const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
        
        const response = await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/cron-membership-renewal`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: SUPABASE_ANON_KEY,
          },
        })
        
        const result = await response.json()
        console.log('📬 멤버십 알림 API 응답:', result)
        
        // GET 응답 형식: result.data.notifications (개별 알림)
        // POST 응답 형식: result.results (리스트 형태)
        if (result.success && result.results) {
          const notificationData: MembershipNotificationData = {
            renewed: result.results.renewed || [],
            renewal_failed: result.results.renewal_failed || [],
            expiry_notified: result.results.expiry_notified || [],
            errors: result.results.errors || [],
            today: result.today,
            tomorrow: result.tomorrow,
          }
          
          const hasNotifications = 
            notificationData.renewed.length > 0 ||
            notificationData.renewal_failed.length > 0 ||
            notificationData.expiry_notified.length > 0
          
          if (hasNotifications) {
            console.log('📬 멤버십 알림 저장:', notificationData)
            saveMembershipNotificationData(notificationData)
          }
        }
      } catch (error) {
        console.error('멤버십 알림 조회 실패:', error)
      }
    }

    // 로그인된 경우 멤버십 알림 API 호출
    if (isAuthenticated) {
      fetchMembershipNotifications()
    }
    
    // 이벤트 팝업은 이벤트 배너 API 호출 후 결과에 따라 열림
    // 여기서는 멤버십 알림만 확인 (이벤트 팝업이 없거나 닫힌 후 처리됨)
  }, [isAuthenticated, getAccessToken])

  // 이벤트 배너 API 호출 및 팝업 표시
  useEffect(() => {
    const fetchEventBanners = async () => {
      if (eventBannersFetchedRef.current) return
      eventBannersFetchedRef.current = true

      try {
        const token = await getAccessToken()
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        }
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }

        const response = await fetch(
          `${EDGE_FUNCTIONS_URL}/functions/v1/api-notice?category=event&active_events_only=true`,
          {
            method: 'GET',
            headers,
          }
        )

        const result = await response.json()

        if (result.success && Array.isArray(result.data) && result.data.length > 0) {
          const banners = result.data
            .filter((notice: any) => notice.image_url) // 이미지가 있는 것만
            .map((notice: any) => ({
              id: notice.id,
              imageUrl: notice.image_url,
              linkUrl: `/notifications?tab=notices&noticeId=${notice.id}`,
              title: notice.title,
            }))
          setEventBanners(banners)
          
          // 이벤트가 있고 오늘 숨기기가 아니면 팝업 표시
          if (banners.length > 0 && shouldShowEventPopup()) {
            setTimeout(() => {
              setIsEventPopupOpen(true)
            }, 500)
          }
        }
      } catch (err) {
        console.error('[Feed] Failed to fetch event banners:', err)
      }
    }

    fetchEventBanners()
  }, [getAccessToken])

  // 멤버십 알림 확인 함수 (localStorage에서 가져옴)
  const checkMembershipNotifications = useCallback(() => {
    if (hasMembershipNotificationData()) {
      const data = getMembershipNotificationData()
      if (data) {
        setMembershipNotificationData(data)
        // 약간의 딜레이 후 팝업 표시
        setTimeout(() => {
          setIsMembershipNotificationOpen(true)
        }, 300)
      }
    }
  }, [])

  // 이벤트 팝업이 열리지 않을 때 멤버십 알림 확인
  useEffect(() => {
    // 이벤트 배너가 fetch 완료되고 팝업이 열리지 않을 때
    if (eventBannersFetchedRef.current && !isEventPopupOpen) {
      const timer = setTimeout(() => {
        checkMembershipNotifications()
      }, 1000)
      return () => clearTimeout(timer)
    }
  }, [eventBanners, isEventPopupOpen, checkMembershipNotifications])

  // 이벤트 팝업이 닫힌 후 멤버십 알림 확인
  const handleEventPopupClose = useCallback(() => {
    setIsEventPopupOpen(false)
    // 이벤트 팝업 닫힌 후 멤버십 알림 확인
    setTimeout(() => {
      checkMembershipNotifications()
    }, 300)
  }, [checkMembershipNotifications])

  // 멤버십 알림 팝업 닫기 핸들러
  const handleMembershipNotificationClose = useCallback(() => {
    setIsMembershipNotificationOpen(false)
    setMembershipNotificationData(null)
    // localStorage에서도 삭제
    clearMembershipNotificationData()
  }, [])

  // 인증 상태 변경 감지 - 로그인/로그아웃 시 캐시 리셋 및 피드 새로고침
  const prevAuthRef = useRef<boolean | null>(null)
  const [authTrigger, setAuthTrigger] = useState(0)
  useEffect(() => {
    // 첫 렌더링은 무시
    if (prevAuthRef.current === null) {
      prevAuthRef.current = isAuthenticated
      return
    }
    
    // 인증 상태가 변경되었을 때만 캐시 리셋
    if (prevAuthRef.current !== isAuthenticated) {
      console.log('🔄 인증 상태 변경 감지:', prevAuthRef.current, '->', isAuthenticated)
      prevAuthRef.current = isAuthenticated
      
      // 캐시 리셋
      globalFeedFetched = false
      globalFeedData = null
      
      // 피드 새로고침 트리거
            setFeed([])
      setIsLoadingFeed(true)
      setAuthTrigger(prev => prev + 1)
    }
  }, [isAuthenticated])

  // /api-posts-list로 피드 데이터 가져오기 (전역 변수로 중복 방지)
  useEffect(() => {
    // subscription 모드에서는 캐시 사용 안함 (별도 API 호출)
    const useGlobalCache = mode.type !== 'subscription'
    
    // 이미 캐시된 데이터가 있으면 바로 사용 (subscription 모드 제외)
    if (useGlobalCache && globalFeedData !== null) {
      console.log('🔄 캐시된 피드 데이터 사용:', globalFeedData.length, '개')
      setFeed(globalFeedData)
      
      // globalFeedData에서 likesState, visibleCommentCount, followState 초기화
      const initialLikes: Record<string, { liked: boolean; count: number }> = {}
      const initialComments: Record<string, number> = {}
      const initialFollow: Record<string, boolean> = {}
      globalFeedData.forEach(post => {
        initialLikes[post.id] = { liked: post.isLiked ?? false, count: post.likes ?? 0 }
        if (post.commentCount !== undefined) {
          initialComments[post.id] = post.commentCount
        }
        const followKey = post.author?.handle || post.partnerId || post.id
        initialFollow[followKey] = post.isFollowed ?? false
      })
      
      // globalFeedData 기본값 + 전역 상태(최신) 병합
      setLikesState({ ...initialLikes, ...globalLikesState })
      setVisibleCommentCount({ ...initialComments, ...globalCommentCounts })
      setFollowState({ ...initialFollow, ...globalFollowState })
      
      setIsLoadingFeed(false)
          return
        }
    
    // 이미 fetch 진행 중이면 데이터가 올 때까지 폴링 (subscription 모드 제외)
    if (useGlobalCache && globalFeedFetched) {
      console.log('⏳ 피드 fetch 진행 중... 데이터 대기')
      const checkInterval = setInterval(() => {
        if (globalFeedData !== null) {
          console.log('✅ 피드 데이터 도착:', globalFeedData.length, '개')
          setFeed(globalFeedData)
          
          // globalFeedData에서 likesState, visibleCommentCount, followState 초기화
          const initialLikes: Record<string, { liked: boolean; count: number }> = {}
          const initialComments: Record<string, number> = {}
          const initialFollow: Record<string, boolean> = {}
          globalFeedData.forEach(post => {
            initialLikes[post.id] = { liked: post.isLiked ?? false, count: post.likes ?? 0 }
            if (post.commentCount !== undefined) {
              initialComments[post.id] = post.commentCount
            }
            const followKey = post.author?.handle || post.partnerId || post.id
            initialFollow[followKey] = post.isFollowed ?? false
          })
          setLikesState({ ...initialLikes, ...globalLikesState })
          setVisibleCommentCount({ ...initialComments, ...globalCommentCounts })
          setFollowState({ ...initialFollow, ...globalFollowState })
          
          setIsLoadingFeed(false)
          clearInterval(checkInterval)
        }
      }, 100) // 100ms마다 확인
      
      // 10초 후 타임아웃
      const timeout = setTimeout(() => {
        clearInterval(checkInterval)
        if (globalFeedData === null) {
          console.log('⚠️ 피드 데이터 타임아웃, 재시도')
          globalFeedFetched = false // 재시도 허용
          setAuthTrigger(prev => prev + 1)
        }
      }, 10000)
      
      return () => {
        clearInterval(checkInterval)
        clearTimeout(timeout)
      }
    }
    
    // 플래그 설정 후 fetch 시작 (subscription 모드에서는 글로벌 플래그 사용 안함)
    if (useGlobalCache) {
      globalFeedFetched = true
    }
    console.log('🚀 피드 fetch 시작')
    
    const fetchFeed = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token
        
        const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
        const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
        
        // 헤더 구성 (토큰 있으면 추가, 없으면 apikey만)
        const headers: Record<string, string> = {
          apikey: SUPABASE_ANON_KEY,
        }
        if (token) {
          headers.Authorization = `Bearer ${token}`
        }
        
        // mode.type에 따라 API 엔드포인트 결정
        const apiEndpoint = mode.type === 'subscription' 
          ? `${EDGE_FUNCTIONS_URL}/functions/v1/api-posts-list/membership-paid?page_no=1&_t=${Date.now()}`
          : `${EDGE_FUNCTIONS_URL}/functions/v1/api-posts-feed?page_no=1&_t=${Date.now()}`
        
        console.log('📡 API 호출', token ? '(인증됨)' : '(비인증)', mode.type === 'subscription' ? '(멤버쉽)' : '(일반)')
        const response = await fetch(apiEndpoint, {
          method: 'GET',
          headers: {
            ...headers,
          },
        })
        
        const result = await response.json()
        console.log('📥 API 응답:', result.success, result.data?.length)
        
        if (!response.ok || !result.success) {
          throw new Error(result.error || '피드를 불러오지 못했습니다.')
        }
        
        const apiData = result.data || []
        
        // API 응답을 FeedPost 형식으로 변환
        const convertedFeed: FeedPost[] = apiData.map((item: any) => {
          const files = Array.isArray(item.files) ? item.files : []
          const media = mapApiFilesToMedia(files) as FeedMedia[]
          // 각 미디어에 point_price, signed_url, membership_id 정보 포함
          media.forEach((m, idx) => {
            const file = files[idx]
            if (file) {
              m.point_price = file.point_price ?? null
              m.signed_url = file.signed_url ?? null
              m.membership_id = file.membership_id ?? null
            }
          })

          return {
            id: item.id,
            partnerId: item.partner_id,
            category: feedFilter,
            author: {
              name: item.partner?.member?.name || item.partner?.name || 'Unknown',
              handle:
                item.partner?.member?.member_code ||
                item.partner?.member_code ||
                item.partner_id ||
                'unknown',
              avatar:
                item.partner?.member?.profile_image ||
                item.partner?.profile_image ||
                '',
            },
            postedAt: item.published_at || new Date().toISOString(),
            content: item.content || '',
            media,
            likes: item.like_count || 0,
            comments: [],
            tags: [],
            isLiked: item.is_liked || false,
            isFollowed: item.is_followed || false,
            isSubscribersOnly: item.is_subscribers_only || false,
            pointPrice: item.point_price ?? undefined,
            commentCount: item.comment_count ?? 0,
            isPurchased: item.is_purchased || false,
            isPaidPost: item.is_paid_post || false,
            isInAlbum: item.is_in_album || false,
            hasMembership: item.has_membership || false,
            isBundle: item.is_bundle ?? false,
            discountRate: item.discount_rate ?? 0,
            membershipId: item.membership_id ?? null,
            purchasedMediaOrder: item.purchased_media_order ?? null,
          }
        })
        
        // 전역 캐시에 저장 (subscription 모드 제외)
        if (mode.type !== 'subscription') {
          globalFeedData = convertedFeed
          console.log('✅ 피드 캐시 완료:', convertedFeed.length, '개')
        } else {
          console.log('📋 멤버쉽 피드 로드 완료:', convertedFeed.length, '개 (캐시 안함)')
        }
        
        // 컴포넌트 state 업데이트 (언마운트되어도 에러 안남)
        pageRef.current = 1
        setHasMoreFeed(true)
        setFeed(convertedFeed)
        
        // savedPostIds 초기화 (is_in_album 기준)
        const initialSavedPostIds = new Set<string>()
        convertedFeed.forEach(post => {
          if (post.isInAlbum) {
            initialSavedPostIds.add(post.id)
          }
        })
        setSavedPostIds(initialSavedPostIds)
        
        const newLikesState: Record<string, { liked: boolean; count: number }> = {}
        const newFollowState: Record<string, boolean> = {}
        const newVisibleCommentCount: Record<string, number> = {}
        convertedFeed.forEach((post, index) => {
          newLikesState[post.id] = {
            liked: post.isLiked ?? false,
            count: post.likes ?? 0,
          }
          const key = post.partnerId || post.id
          newFollowState[key] = post.isFollowed ?? false
          const commentCount = (result.data[index]?.comment_count || 0) as number
          newVisibleCommentCount[post.id] = commentCount === 0 ? 0 : Math.min(10, commentCount)
        })
        setLikesState(newLikesState)
        setFollowState(newFollowState)
        setVisibleCommentCount(newVisibleCommentCount)
        setIsLoadingFeed(false)
        console.log('🏁 완료')
        
      } catch (error: any) {
        console.error('❌ 피드 로딩 실패:', error?.message || error)
        // subscription 모드가 아닐 때만 전역 캐시에 빈 배열 설정
        if (mode.type !== 'subscription') {
          globalFeedData = [] // 실패해도 빈 배열로 설정 (재시도 방지)
        }
        setFeed([])
        setHasMoreFeed(false)
        setIsLoadingFeed(false)
      }
    }
    
    fetchFeed()
    // cleanup 없음 - fetch 완료까지 진행
  }, [authTrigger])

  // 추가 페이지 로딩 (무한 스크롤)
  const loadMoreFeed = useCallback(async () => {
    if (isLoadingFeed || isLoadingMore || !hasMoreFeed) return

    try {
      setIsLoadingMore(true)
      const token = await getAccessToken()
      if (!token) {
        return
      }

      const nextPage = pageRef.current + 1
      const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
      
      // mode.type에 따라 API 엔드포인트 결정
      const apiEndpoint = mode.type === 'subscription'
        ? `${EDGE_FUNCTIONS_URL}/functions/v1/api-posts-list/membership-paid?page_no=${nextPage}&_t=${Date.now()}`
        : `${EDGE_FUNCTIONS_URL}/functions/v1/api-posts-feed?page_no=${nextPage}&_t=${Date.now()}`
      
      const response = await fetch(
        apiEndpoint,
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
        throw new Error(result.error || '피드를 불러오지 못했습니다.')
      }

      const apiData = result.data || []
      if (apiData.length === 0) {
        setHasMoreFeed(false)
        return
      }

      const convertedFeed: FeedPost[] = apiData.map((item: any) => {
        const files = Array.isArray(item.files) ? item.files : []
        const media = mapApiFilesToMedia(files) as FeedMedia[]
        media.forEach((m, idx) => {
          const file = files[idx]
          if (file) {
            m.point_price = file.point_price ?? null
            m.signed_url = file.signed_url ?? null
            m.membership_id = file.membership_id ?? null
          }
        })

        return {
          id: item.id,
          partnerId: item.partner_id,
          category: feedFilter,
          author: {
            name: item.partner?.member?.name || item.partner?.name || 'Unknown',
            handle:
              item.partner?.member?.member_code ||
              item.partner?.member_code ||
              item.partner_id ||
              'unknown',
            avatar:
              item.partner?.member?.profile_image ||
              item.partner?.profile_image ||
              '',
          },
          postedAt: item.published_at || new Date().toISOString(),
          content: item.content || '',
          media,
          likes: item.like_count || 0,
          comments: [],
          tags: [],
          isLiked: item.is_liked || false,
          isFollowed: item.is_followed || false,
          isSubscribersOnly: item.is_subscribers_only || false,
          pointPrice: item.point_price ?? undefined,
          commentCount: item.comment_count ?? 0,
          isPurchased: item.is_purchased || false,
          isPaidPost: item.is_paid_post || false,
          isInAlbum: item.is_in_album || false,
          hasMembership: item.has_membership || false,
        }
      })

      // 중복 방지: 이미 있는 포스트 ID 제외
      setFeed((prev) => {
        const existingIds = new Set(prev.map(p => p.id))
        const newPosts = convertedFeed.filter(p => !existingIds.has(p.id))
        return [...prev, ...newPosts]
      })
      
      // savedPostIds 업데이트 (추가된 피드의 is_in_album 기준)
      setSavedPostIds(prev => {
        const newSet = new Set(prev)
        convertedFeed.forEach(post => {
          if (post.isInAlbum) {
            newSet.add(post.id)
          }
        })
        return newSet
      })

      const likesPatch: Record<string, { liked: boolean; count: number }> = {}
      const followPatch: Record<string, boolean> = {}
      const visiblePatch: Record<string, number> = {}

      convertedFeed.forEach((post, index) => {
        likesPatch[post.id] = {
          liked: post.isLiked ?? false,
          count: post.likes ?? 0,
        }
        const key = post.partnerId || post.id
        followPatch[key] = post.isFollowed ?? false
        const commentCount = (apiData[index]?.comment_count || 0) as number
        visiblePatch[post.id] = commentCount === 0 ? 0 : Math.min(10, commentCount)
      })

      setLikesState((prev) => ({ ...prev, ...likesPatch }))
      setFollowState((prev) => ({ ...prev, ...followPatch }))
      setVisibleCommentCount((prev) => ({ ...prev, ...visiblePatch }))

      pageRef.current = nextPage
    } catch (error: any) {
      console.error('추가 피드 로딩 실패:', error?.message || error, JSON.stringify(error, null, 2))
    } finally {
      setIsLoadingMore(false)
    }
  }, [feedFilter, getAccessToken, hasMoreFeed, isLoadingFeed, isLoadingMore])

  const [likesState, setLikesState] = useState<
    Record<string, { liked: boolean; count: number }>
  >({})
  const [followState, setFollowState] = useState<Record<string, boolean>>({})
  
  // 페이지가 다시 visible 될 때 또는 뒤로가기로 돌아왔을 때 globalFollowState 동기화
  useEffect(() => {
    const syncFollowState = () => {
      setFollowState((prev) => ({ ...prev, ...globalFollowState }))
    }
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncFollowState()
      }
    }
    
    const handlePopState = () => {
      syncFollowState()
    }
    
    // 초기 마운트 시에도 동기화 (다른 페이지에서 돌아왔을 때)
    syncFollowState()
    
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('popstate', handlePopState)
    window.addEventListener('focus', syncFollowState)
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('popstate', handlePopState)
      window.removeEventListener('focus', syncFollowState)
    }
  }, [])
  
  const [commentState, setCommentState] = useState<Record<string, FeedPost['comments']>>({})
  const [commentLoadingState, setCommentLoadingState] = useState<Record<string, boolean>>({})
  const commentsFetchedRef = useRef<Set<string>>(new Set())
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({})
  const [commentSheetPostId, setCommentSheetPostId] = useState<string | null>(null)
  const [commentModalPostId, setCommentModalPostId] = useState<string | null>(null)
  const [commentSheetHeight, setCommentSheetHeight] = useState(0.6)
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)
  const [isSheetClosing, setIsSheetClosing] = useState(false)
  const sheetDragRef = useRef<{ startY: number; startHeight: number } | null>(null)
  const sheetCloseTimeoutRef = useRef<number | null>(null)
  const touchCleanupRef = useRef<(() => void) | null>(null)
  const [isSheetDragging, setIsSheetDragging] = useState(false)
  const [sheetDraft, setSheetDraft] = useState('')
  const [sheetReplyTarget, setSheetReplyTarget] = useState<string | null>(null)
  const [modalReplyTarget, setModalReplyTarget] = useState<string | null>(null)
  const [visibleCommentCount, setVisibleCommentCount] = useState<Record<string, number>>({})
  const [collapsedReplies, setCollapsedReplies] = useState<Record<string, Record<string, boolean>>>({})
  const [purchaseTargetPost, setPurchaseTargetPost] = useState<FeedPost | null>(null)
  const [isPurchaseSheetVisible, setIsPurchaseSheetVisible] = useState(false)
  const [isProcessingPurchase, setIsProcessingPurchase] = useState(false)
  const [selectedPurchaseOption, setSelectedPurchaseOption] = useState<'membership' | 'single' | null>(null)
  const [purchaseFlowState, setPurchaseFlowState] = useState<'select' | 'success'>('select')
  // 개별 미디어 구매 관련 상태
  const [mediaPurchaseTarget, setMediaPurchaseTarget] = useState<{ post: FeedPost; mediaIndex: number } | null>(null)
  const [isMediaPurchaseSheetVisible, setIsMediaPurchaseSheetVisible] = useState(false)
  const [selectedMediaPurchaseOption, setSelectedMediaPurchaseOption] = useState<'single' | 'bundle' | null>(null)
  
  // 멤버쉽 구독 관련 상태
  const [membershipList, setMembershipList] = useState<Array<{ id: string; name: string; monthly_price: number; description?: string }>>([])
  const [isMembershipSheetOpen, setIsMembershipSheetOpen] = useState(false)
  const [isLoadingMemberships, setIsLoadingMemberships] = useState(false)
  const [selectedMembership, setSelectedMembership] = useState<{ id: string; name: string; monthly_price: number } | null>(null)
  const [isProcessingMembershipPurchase, setIsProcessingMembershipPurchase] = useState(false)
  const [targetMembershipId, setTargetMembershipId] = useState<string | null>(null)
  const [membershipInfoSheetPost, setMembershipInfoSheetPost] = useState<FeedPost | null>(null)
  const [membershipInfoSheetTargetId, setMembershipInfoSheetTargetId] = useState<string | null>(null)
  const [isMembershipInfoSheetOpen, setIsMembershipInfoSheetOpen] = useState(false)

  // 풀투리프레시
  const refreshFeed = useCallback(async () => {
    if (isRefreshing) return
    try {
      setIsRefreshing(true)
      setHasMoreFeed(true)
      pageRef.current = 1

      const token = await getAccessToken()
      if (!token) {
        setFeed([])
        return
      }

      const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
      
      // mode.type에 따라 API 엔드포인트 결정
      const apiEndpoint = mode.type === 'subscription'
        ? `${EDGE_FUNCTIONS_URL}/functions/v1/api-posts-list/membership-paid?page_no=1&_t=${Date.now()}`
        : `${EDGE_FUNCTIONS_URL}/functions/v1/api-posts-feed?page_no=1&_t=${Date.now()}`
      
      const response = await fetch(
        apiEndpoint,
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
        throw new Error(result.error || '피드를 불러오지 못했습니다.')
      }

      const apiData = result.data || []
      const convertedFeed: FeedPost[] = apiData.map((item: any) => {
        const files = Array.isArray(item.files) ? item.files : []
        const media = mapApiFilesToMedia(files) as FeedMedia[]
        media.forEach((m, idx) => {
          const file = files[idx]
          if (file) {
            m.point_price = file.point_price ?? null
            m.signed_url = file.signed_url ?? null
            m.membership_id = file.membership_id ?? null
          }
        })

        return {
          id: item.id,
          partnerId: item.partner_id,
          category: feedFilter,
          author: {
            name: item.partner?.member?.name || item.partner?.name || 'Unknown',
            handle:
              item.partner?.member?.member_code ||
              item.partner?.member_code ||
              item.partner_id ||
              'unknown',
            avatar:
              item.partner?.member?.profile_image ||
              item.partner?.profile_image ||
              '',
          },
          postedAt: item.published_at || new Date().toISOString(),
          content: item.content || '',
          media,
          likes: item.like_count || 0,
          comments: [],
          tags: [],
          isLiked: item.is_liked || false,
          isFollowed: item.is_followed || false,
          isSubscribersOnly: item.is_subscribers_only || false,
          pointPrice: item.point_price ?? undefined,
          commentCount: item.comment_count ?? 0,
          isPurchased: item.is_purchased || false,
          isPaidPost: item.is_paid_post || false,
          isInAlbum: item.is_in_album || false,
          hasMembership: item.has_membership || false,
        }
      })
      
      // savedPostIds 초기화 (is_in_album 기준)
      const initialSavedPostIds = new Set<string>()
      convertedFeed.forEach(post => {
        if (post.isInAlbum) {
          initialSavedPostIds.add(post.id)
        }
      })
      setSavedPostIds(initialSavedPostIds)

      // 서버 데이터와 기존 캐시 병합
      // 1. 기존 캐시에 없는 새 게시물 추가
      // 2. 기존 게시물의 좋아요/댓글/팔로우 상태만 서버 데이터로 동기화
      // 3. 로컬에서 변경한 구매 상태는 유지
      
      const existingPostIds = new Set(globalFeedData?.map(p => p.id) ?? [])
      const serverPostIds = new Set(convertedFeed.map(p => p.id))
      
      // 서버 데이터를 기준으로 병합
      const mergedFeed = convertedFeed.map(serverPost => {
        // 로컬 구매 상태 유지 (서버에서 isPurchased=false여도 로컬에서 true면 true 유지)
        const isLocallyPurchased = globalPurchasedPosts.has(serverPost.id)
        return {
          ...serverPost,
          isPurchased: serverPost.isPurchased || isLocallyPurchased,
        }
      })
      
      // 전역 캐시 업데이트
      globalFeedData = mergedFeed
      setFeed(mergedFeed)

      const newLikesState: Record<string, { liked: boolean; count: number }> = {}
      const newFollowState: Record<string, boolean> = {}
      const newVisibleCommentCount: Record<string, number> = {}
      
      mergedFeed.forEach((post, index) => {
        // 서버 데이터로 좋아요/댓글/팔로우 상태 동기화
        newLikesState[post.id] = {
          liked: post.isLiked ?? false,
          count: post.likes ?? 0,
        }
        globalLikesState[post.id] = { liked: post.isLiked ?? false, count: post.likes ?? 0 }
        globalCommentCounts[post.id] = post.commentCount ?? 0
        
        // 구매 상태 동기화 (서버 + 로컬 병합)
        if (post.isPurchased) {
          globalPurchasedPosts.add(post.id)
        }
        
        const key = post.partnerId || post.id
        newFollowState[key] = post.isFollowed ?? false
        globalFollowState[key] = post.isFollowed ?? false
        
        const commentCount = (apiData[index]?.comment_count || 0) as number
        newVisibleCommentCount[post.id] = commentCount === 0 ? 0 : Math.min(10, commentCount)
      })
      
      setLikesState(newLikesState)
      setFollowState(newFollowState)
      setVisibleCommentCount(newVisibleCommentCount)
    } catch (error: any) {
      console.error('피드 새로고침 실패:', error?.message || error, JSON.stringify(error, null, 2))
    } finally {
      setIsRefreshing(false)
      setPullDistance(0)
    }
  }, [feedFilter, getAccessToken, isRefreshing])

  const closePurchaseSheet = () => {
    setIsPurchaseSheetVisible(false)
    setSelectedPurchaseOption(null)
    setPurchaseFlowState('select')
    setTimeout(() => {
      setPurchaseTargetPost(null)
    }, 250)
  }

  const handleLockedPostClick = useCallback((post: FeedPost) => {
    setPurchaseTargetPost(post)
    // 기본 선택: 둘 다 있으면 단건구매, 구독만 있으면 구독, 단건만 있으면 단건
    if (post.pointPrice) {
      setSelectedPurchaseOption('single')
    } else {
      setSelectedPurchaseOption(null)
    }
    setPurchaseFlowState('select')
    requestAnimationFrame(() => {
      setIsPurchaseSheetVisible(true)
    })
  }, [])

  const fetchPostMediaFiles = useCallback(
    async (postId: string): Promise<FeedMedia[] | null> => {
      if (!postId) return null
      try {
        const token = await getAccessToken()
        if (!token) return null

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
    [getAccessToken],
  )

  const applyPointDeduction = useCallback(
    (amount: number) => {
      if (!amount || amount <= 0) return
      const basePoints =
        user?.total_points ??
        storeUser?.total_points ??
        0
      const nextPoints = Math.max(0, basePoints - amount)
      updateAuthStorePoints(nextPoints)
      const userId = user?.id || storeUser?.id
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
      queryClient,
      storeUser?.id,
      storeUser?.total_points,
      updateAuthStorePoints,
      user?.id,
      user?.total_points,
    ],
  )

  // 개별 미디어 구매 팝업 열기
  const handleMediaPurchaseClick = useCallback((post: FeedPost, mediaIndex: number) => {
    // post 레벨 가격이 있고 모든 미디어에 개별 가격이 없으면 post 레벨 구매로 처리
    const hasPostPointPrice = post.pointPrice !== undefined && post.pointPrice > 0
    const allMediaHaveNoPointPrice = post.media?.every(m => !m.point_price || m.point_price <= 0) ?? true
    
    if (hasPostPointPrice && allMediaHaveNoPointPrice) {
      // post 레벨 구매로 처리
      setPurchaseTargetPost(post)
      setSelectedPurchaseOption(null)
      requestAnimationFrame(() => {
        setIsPurchaseSheetVisible(true)
      })
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
    async (post: FeedPost, mediaIndex: number, isBundle: boolean) => {
      if (isProcessingPurchase) return
      const media = post.media?.[mediaIndex]
      if (!media || !media.point_price || media.point_price <= 0) return

      setIsProcessingPurchase(true)
      try {
        const token = await getAccessToken()
        if (!token) {
          alert('로그인이 필요합니다.')
          setIsProcessingPurchase(false)
          return
        }

        // 할인율 적용 가격 계산
        const discountRate = post.discountRate ?? 0
        
        let finalPrice = 0
        let mediaIndices: number[] = []
        
        if (isBundle && post.isBundle) {
          // 묶음 구매: 모든 미구매 미디어들의 가격 합계
          const unpurchasedMedia = post.media?.filter((m, idx) => {
            const isPurchased = post.purchasedMediaOrder != null && idx <= post.purchasedMediaOrder
            return !m.signed_url && m.point_price != null && m.point_price > 0 && !isPurchased
          }) || []
          
          const totalBasePrice = unpurchasedMedia.reduce((sum, m) => sum + (m.point_price || 0), 0)
          finalPrice = discountRate > 0 && discountRate <= 100
            ? Math.round(totalBasePrice * (1 - discountRate / 100))
            : totalBasePrice
          
          // 모든 미구매 미디어의 인덱스
          mediaIndices = post.media?.map((m, idx) => {
            const isPurchased = post.purchasedMediaOrder != null && idx <= post.purchasedMediaOrder
            if (!m.signed_url && m.point_price != null && m.point_price > 0 && !isPurchased) {
              return idx
            }
            return -1
          }).filter(idx => idx >= 0) || []
        } else {
          // 여기까지 구매: 0~mediaIndex까지의 미구매 미디어 합계
          const mediaUpToIndex = post.media?.slice(0, mediaIndex + 1).filter((m, idx) => {
            const isPurchased = post.purchasedMediaOrder != null && idx <= post.purchasedMediaOrder
            return !m.signed_url && m.point_price != null && m.point_price > 0 && !isPurchased
          }) || []
          
          const totalBasePrice = mediaUpToIndex.reduce((sum, m) => sum + (m.point_price || 0), 0)
          finalPrice = discountRate > 0 && discountRate <= 100
            ? Math.round(totalBasePrice * (1 - discountRate / 100))
            : totalBasePrice
          
          // 0~mediaIndex까지의 미구매 미디어 인덱스
          mediaIndices = post.media?.slice(0, mediaIndex + 1).map((m, idx) => {
            const isPurchased = post.purchasedMediaOrder != null && idx <= post.purchasedMediaOrder
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
          const errorMessage: string =
            result?.error || result?.message || '미디어를 구매할 수 없습니다.'
          const normalized = errorMessage.toLowerCase()
          if (
            normalized.includes('point') ||
            normalized.includes('포인트') ||
            (typeof result?.code === 'string' &&
              result.code.toLowerCase().includes('insufficient'))
          ) {
            alert('포인트가 부족합니다. 포인트 페이지로 이동합니다.')
            navigate({ to: '/points' as '/points' })
          } else {
            alert(errorMessage)
          }
          setIsProcessingPurchase(false)
          return
        }

        // 피드 상태 업데이트
        const refreshedMedia = await fetchPostMediaFiles(post.id)
        const newPurchasedOrder = Math.max(...mediaIndices)
        setFeed((prev) =>
          prev.map((p) => {
            if (p.id !== post.id) return p
            // 기존 미디어 데이터(point_price, membership_id 등)를 유지하면서, 구매한 미디어만 업데이트
            const mergedMedia = p.media?.map((m, idx) => {
              // 구매한 미디어(newPurchasedOrder까지)만 업데이트
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

        // 전역 구매 상태 업데이트
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

        // 팝업 닫기
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
      getAccessToken,
      navigate,
      fetchPostMediaFiles,
      applyPointDeduction,
      refetchPoints,
      refreshUser,
    ],
  )

  const handleOneTimePurchase = useCallback(
    async () => {
      if (!purchaseTargetPost || isProcessingPurchase) return
      if (!purchaseTargetPost.pointPrice || purchaseTargetPost.pointPrice <= 0) return

      setIsProcessingPurchase(true)
      try {
        const token = await getAccessToken()
        if (!token) {
          alert('로그인이 필요합니다.')
          setIsProcessingPurchase(false)
          return
        }

        // 할인율 적용 가격 계산
        const discountRate = purchaseTargetPost.discountRate ?? 0
        const basePrice = purchaseTargetPost.pointPrice
        const finalPrice = discountRate > 0 && discountRate <= 100
          ? Math.round(basePrice * (1 - discountRate / 100))
          : basePrice

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
          const errorMessage: string =
            result?.error || result?.message || '포스트를 열 수 없습니다.'
          const normalized = errorMessage.toLowerCase()
          if (
            normalized.includes('point') ||
            normalized.includes('포인트') ||
            (typeof result?.code === 'string' &&
              result.code.toLowerCase().includes('insufficient'))
          ) {
            alert('포인트가 부족합니다. 포인트 페이지로 이동합니다.')
            closePurchaseSheet()
            navigate({ to: '/points' as '/points' })
          } else {
            alert(errorMessage)
          }
          setIsProcessingPurchase(false)
          return
        }

        const refreshedMedia = await fetchPostMediaFiles(purchaseTargetPost.id)

        setFeed((prev) =>
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
        // 전역 구매 상태 업데이트
        updateGlobalPurchaseState(purchaseTargetPost.id, true, refreshedMedia ?? undefined)
        setPurchaseFlowState('success')
        setSelectedPurchaseOption(null)

        // 할인율 적용 가격으로 포인트 차감 (이미 위에서 계산됨)
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
      } catch (error: any) {
        console.error('포스트 결제 실패:', error)
        alert(error?.message || '결제 처리 중 오류가 발생했습니다.')
      } finally {
        setIsProcessingPurchase(false)
      }
    },
    [
      closePurchaseSheet,
      getAccessToken,
      isProcessingPurchase,
      navigate,
      purchaseTargetPost,
      fetchPostMediaFiles,
      applyPointDeduction,
      refetchPoints,
      refreshUser,
    ],
  )
  
  // 멤버쉽 목록 로드
  const loadMemberships = useCallback(async (partnerId: string) => {
    setIsLoadingMemberships(true)
    try {
      const token = await getAccessToken()
      if (!token) return
      
      const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
      
      const response = await fetch(
        `${EDGE_FUNCTIONS_URL}/functions/v1/api-membership?partner_id=${partnerId}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: SUPABASE_ANON_KEY,
          },
        },
      )
      
      const result = await response.json()
      if (result.success && result.data) {
        setMembershipList(result.data)
      }
    } catch (error) {
      console.error('멤버쉽 목록 로드 실패:', error)
    } finally {
      setIsLoadingMemberships(false)
    }
  }, [getAccessToken])

  // 개별 미디어 멤버십 클릭 (특정 멤버십으로 팝업 열기)
  const handleMediaMembershipClick = useCallback(async (post: FeedPost, membershipId: string, _mediaIndex: number) => {
    if (!post.partnerId) return
    setPurchaseTargetPost(post)
    setTargetMembershipId(membershipId)
    await loadMemberships(post.partnerId)
    setIsMembershipSheetOpen(true)
  }, [loadMemberships])
  
  // 멤버쉽 구독 옵션 클릭
  const handleMembershipOptionClick = useCallback(async () => {
    if (!purchaseTargetPost?.partnerId) return
    
    setSelectedPurchaseOption('membership')
    setIsPurchaseSheetVisible(false)
    
    // 멤버쉽 목록 로드 후 팝업 열기
    await loadMemberships(purchaseTargetPost.partnerId)
    setIsMembershipSheetOpen(true)
  }, [purchaseTargetPost, loadMemberships])
  
  // 멤버쉽 구독 처리
  const handleMembershipPurchase = useCallback(async () => {
    if (!selectedMembership || !user?.id) return
    
    setIsProcessingMembershipPurchase(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        toast.error('로그인이 필요합니다')
        return
      }
      
      const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
      
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
          }),
        },
      )
      
      const result = await response.json()
      if (result.success) {
        toast.success(`${selectedMembership.name} 멤버쉽 구독을 시작했습니다!`)
        setIsMembershipSheetOpen(false)
        setSelectedMembership(null)
        
        // 전역 멤버십 상태 업데이트
        if (purchaseTargetPost?.partnerId) {
          updateGlobalMembershipState(purchaseTargetPost.partnerId, true)
        }
        
        // 전역 캐시 무효화 후 피드 새로고침하여 잠금 해제된 포스트 반영
        invalidateGlobalFeedCache()
        await refreshFeed()
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
      console.error('멤버쉽 구독 실패:', error)
      toast.error('구독에 실패했습니다')
    } finally {
      setIsProcessingMembershipPurchase(false)
    }
  }, [selectedMembership, user?.id, getAccessToken, refreshFeed])
  
  const fetchComments = useCallback(
    async (postId: string, options: { force?: boolean } = {}) => {
      if (!postId) return
      if (!options.force && commentsFetchedRef.current.has(postId)) return
      if (options.force) {
        commentsFetchedRef.current.delete(postId)
      }

      setCommentLoadingState((prev) => ({ ...prev, [postId]: true }))
      const token = await getAccessToken()
      // 토큰 없어도 댓글 조회 가능
      try {
        const headers: Record<string, string> = {
          apikey: SUPABASE_ANON_KEY,
        }
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }
        const response = await fetch(
          `${EDGE_FUNCTIONS_URL}/functions/v1/api-comments/${postId}`,
          {
            method: 'GET',
            headers,
          },
        )
        const result = await response.json()
        if (!response.ok || !result.success) {
          throw new Error(result.error || '댓글을 불러오지 못했습니다.')
        }
        const mapped = mapApiComments((result.data as ApiComment[]) || [])
        setCommentState((prev) => ({
          ...prev,
          [postId]: mapped,
        }))
        setVisibleCommentCount((prev) => {
          const total = countTotalComments(mapped)
          const newCount = total === 0 ? 0 : Math.min(10, total)
          // 전역 상태도 업데이트
          globalCommentCounts[postId] = total
          return {
            ...prev,
            [postId]: newCount,
          }
        })
        commentsFetchedRef.current.add(postId)
      } catch (error: any) {
        console.error('댓글 조회 실패:', error)
      } finally {
        setCommentLoadingState((prev) => ({ ...prev, [postId]: false }))
      }
    },
    [getAccessToken],
  )

  const submitComment = useCallback(
    async (postId: string, content: string, parentId?: string | null) => {
      const token = await getAccessToken()
      if (!token) {
        alert('로그인이 필요합니다.')
        return false
      }
      try {
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
              content,
              parent_id: parentId ?? null,
            }),
          },
        )
        const result = await response.json()
        if (!response.ok || !result.success) {
          throw new Error(result.error || '댓글 작성에 실패했습니다.')
        }
        await fetchComments(postId, { force: true })
        return true
      } catch (error: any) {
        console.error('댓글 작성 실패:', error)
        alert(error.message || '댓글 작성에 실패했습니다.')
        return false
      }
    },
    [fetchComments, getAccessToken],
  )
  const [searchKeyword, setSearchKeyword] = useState('')
  const [previewState, setPreviewState] = useState<{
    items: Array<FeedMedia>
    index: number
    postId?: string
  } | null>(null)

  const filteredFeed = useMemo(() => {
    // 유저 프로필 모드일 때만 사용자별 필터 적용
    if (mode.type === 'user') {
      return feed.filter((post) => post.author.handle === mode.userId)
    }
    // /feed/all 기본 탭에서는 카테고리와 상관없이 받아온 피드를 모두 표시
    return feed
  }, [feed, mode])

  const filteredUsers = searchUsers.filter(
    (user) =>
      user.name.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      user.handle.toLowerCase().includes(searchKeyword.toLowerCase()),
  )

  const feedDictionary = useMemo(
    () =>
      feed.reduce((acc, post) => {
        acc[post.id] = post
        return acc
      }, {} as Record<string, FeedPost>),
    [feed],
  )

  const getTotalComments = (postId: string) => countTotalComments(commentState[postId] ?? [])
  const getVisibleCountForPost = (postId: string) => {
    return getTotalComments(postId)
  }

  const handleToggleLike = useCallback(
    async (postId: string) => {
      const previous = likesState[postId] ?? {
        liked: false,
        count: feedDictionary[postId]?.likes ?? 0,
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
      // 전역 상태도 업데이트 (globalFeedData도 함께 업데이트)
      updateGlobalLikeState(postId, nextLiked, optimisticCount)

      const token = await getAccessToken()
      if (!token) {
        alert('로그인이 필요합니다.')
        setLikesState((prev) => ({
          ...prev,
          [postId]: previous,
        }))
        // 전역 상태 롤백 (globalFeedData도 함께 업데이트)
        updateGlobalLikeState(postId, previous.liked, previous.count)
        return
      }

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
        // 전역 상태 롤백 (globalFeedData도 함께 업데이트)
        updateGlobalLikeState(postId, previous.liked, previous.count)
      }
    },
    [feedDictionary, getAccessToken, likesState],
  )

  const handleToggleFollow = useCallback(
    async (post: FeedPost) => {
      const partnerId = post.partnerId
      if (!partnerId) {
        alert('파트너 정보를 찾을 수 없습니다.')
        return
      }

      if (!user) {
        navigate({ to: '/login' })
        return
      }

      // member_code (author.handle)을 키로 사용 - partners 페이지와 동일한 키
      const key = post.author?.handle || partnerId
      const previous = followState[key] ?? globalFollowState[key] ?? false
      const next = !previous

      // 낙관적 업데이트 - 로컬 상태
      setFollowState((prev) => ({
        ...prev,
        [key]: next,
      }))
      // 전역 상태도 업데이트 (globalFeedData 포함)
      updateGlobalFollowState(key, next)

      const token = await getAccessToken()
      if (!token) {
        alert('로그인이 필요합니다.')
        setFollowState((prev) => ({
          ...prev,
          [key]: previous,
        }))
        updateGlobalFollowState(key, previous) // 전역 상태 롤백
        return
      }

      try {
        const response = await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/api-follow`, {
          method: next ? 'POST' : 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ partner_id: partnerId }),
        })
        const result = await response.json()
        if (!response.ok || !result.success) {
          throw new Error(result.error || '팔로우 처리에 실패했습니다.')
        }
      } catch (error: any) {
        console.error('팔로우 처리 실패:', error)
        alert(error.message || '팔로우 처리에 실패했습니다.')
        setFollowState((prev) => ({
          ...prev,
          [key]: previous,
        }))
        updateGlobalFollowState(key, previous) // 전역 상태 롤백
      }
    },
    [followState, getAccessToken, navigate, user],
  )

  // 미디어에서 썸네일 추출 (비디오인 경우 캡처)
  const getThumbnailFromMedia = useCallback(async (post: FeedPost): Promise<string | undefined> => {
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
  }, [])

  // 포스트 저장 핸들러
  const handleSavePost = useCallback(
    async (post: FeedPost) => {
      if (!user) {
        navigate({ to: '/login' })
        return
      }

      const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

      // 이미 저장된 경우 DELETE로 저장 취소
      if (savedPostIds.has(post.id)) {
        try {
          const token = await getAccessToken()
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
        const token = await getAccessToken()
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
    },
    [user?.id, navigate, getAccessToken, savedPostIds, getThumbnailFromMedia],
  )

  // 저장 취소 핸들러
  const handleUnsavePost = useCallback(() => {
    if (savedPostInfo?.post_id) {
      setSavedPostIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(savedPostInfo.post_id)
        return newSet
      })
    }
    setSavedPostInfo(null)
  }, [savedPostInfo])

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
      const token = await getAccessToken()
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
        setFeed(prev => prev.filter(p => p.id !== reportSheetPostId))
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
  }, [reportSheetPostId, reportReasonType, reportReasonDetail, getAccessToken, navigate])

  // 차단 처리 함수
  const handleBlockUser = useCallback(async (memberCode: string, authorName: string) => {
    if (!user) {
      toast.error('로그인이 필요합니다.')
      return
    }
    
    try {
      const response = await edgeApi.blocks.block(memberCode) as { success: boolean; error?: { message: string } }
      
      if (response.success) {
        toast.success(`${authorName}님을 차단했습니다.`)
        // 차단한 사용자의 모든 포스트를 피드에서 제거
        setFeed(prev => prev.filter(p => p.author?.handle !== memberCode))
        
        // 차단한 사용자의 모든 댓글을 제거 (재귀적으로 replies도 필터링)
        const filterBlockedComments = (comments: FeedComment[]): FeedComment[] => {
          return comments
            .filter(c => c.memberCode !== memberCode)
            .map(c => ({
              ...c,
              replies: c.replies ? filterBlockedComments(c.replies) : [],
            }))
        }
        
        setCommentState(prev => {
          const updated: Record<string, FeedComment[]> = {}
          for (const postId of Object.keys(prev)) {
            updated[postId] = filterBlockedComments(prev[postId] || [])
          }
          return updated
        })
        
        setMoreMenuPost(null)
      } else {
        throw new Error(response.error?.message || '차단에 실패했습니다.')
      }
    } catch (error) {
      console.error('차단 실패:', error)
      toast.error('차단에 실패했습니다. 잠시 후 다시 시도해주세요.')
    }
  }, [user?.id])

  const commentModalPost = commentModalPostId
    ? feedDictionary[commentModalPostId] ?? null
    : null

  const commentSheetPost = commentSheetPostId
    ? feedDictionary[commentSheetPostId] ?? null
    : null

  const toggleRepliesVisibility = (postId: string, commentId: string) => {
    setCollapsedReplies((prev) => {
      const postMap = prev[postId] || {}
      const current = postMap[commentId] ?? true
      return {
        ...prev,
        [postId]: {
          ...postMap,
          [commentId]: !current,
        },
      }
    })
  }

  const handlePreviewMedia = (postId: string, mediaList: Array<FeedMedia>, index: number) => {
    setPreviewState({ postId, items: mediaList, index })
  }

  const handleCommentButton = (postId: string) => {
    // 댓글 팝업 열 때마다 항상 최신 댓글을 불러옴
    fetchComments(postId, { force: true })
    if (isMobile) {
      if (sheetCloseTimeoutRef.current) {
        window.clearTimeout(sheetCloseTimeoutRef.current)
        sheetCloseTimeoutRef.current = null
      }
      setIsSheetClosing(false)
      setCommentSheetPostId(postId)
      setCommentSheetHeight(0.6)
      setSheetDraft('')
      setSheetReplyTarget(null)
    } else {
      setCommentModalPostId(postId)
      setModalReplyTarget(null)
    }
  }

  // /feed/all?postId=... 로 진입했을 때 자동으로 해당 게시글 댓글 팝업 열기
  useEffect(() => {
    if (!search?.postId) return
    handleCommentButton(search.postId)
  }, [search?.postId])

  const closeSheetWithAnimation = useCallback(() => {
    if (!commentSheetPostId || isSheetClosing) return
    setSheetReplyTarget(null)
    setIsSheetClosing(true)
    if (sheetCloseTimeoutRef.current) {
      window.clearTimeout(sheetCloseTimeoutRef.current)
    }
    sheetCloseTimeoutRef.current = window.setTimeout(() => {
      setCommentSheetPostId(null)
      setIsSheetClosing(false)
      sheetCloseTimeoutRef.current = null
    }, 280)
  }, [commentSheetPostId, isSheetClosing])

  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value))

  const updateSheetHeightFromClientY = (clientY: number) => {
    if (!sheetDragRef.current) return
    const deltaY = clientY - sheetDragRef.current.startY
    const newHeight = clamp(
      sheetDragRef.current.startHeight - deltaY / window.innerHeight,
      0.25,
      0.95,
    )
    setCommentSheetHeight(newHeight)
  }

  const finalizeSheetDrag = () => {
    setIsSheetDragging(false)
    if (commentSheetHeight < 0.35) {
      closeSheetWithAnimation()
    } else if (commentSheetHeight < 0.5) {
      setCommentSheetHeight(0.5)
    } else if (commentSheetHeight > 0.9) {
      setCommentSheetHeight(0.9)
    }
    sheetDragRef.current = null
  }

  const handleSheetPointerMove = (event: PointerEvent) => {
    updateSheetHeightFromClientY(event.clientY)
  }

  const handleSheetPointerUp = () => {
    window.removeEventListener('pointermove', handleSheetPointerMove)
    window.removeEventListener('pointerup', handleSheetPointerUp)
    finalizeSheetDrag()
  }

  const handleSheetPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    event.preventDefault()
    setIsSheetDragging(true)
    sheetDragRef.current = {
      startY: event.clientY,
      startHeight: commentSheetHeight,
    }
    window.addEventListener('pointermove', handleSheetPointerMove)
    window.addEventListener('pointerup', handleSheetPointerUp)
  }

  const handleSheetTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0]
    if (!touch) return
    event.stopPropagation()
    event.preventDefault()
    setIsSheetDragging(true)
    sheetDragRef.current = {
      startY: touch.clientY,
      startHeight: commentSheetHeight,
    }

    const handleTouchMove = (moveEvent: TouchEvent) => {
      const currentTouch = moveEvent.touches[0]
      if (!currentTouch) return
      moveEvent.preventDefault()
      updateSheetHeightFromClientY(currentTouch.clientY)
    }

    const handleTouchEnd = () => {
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
      window.removeEventListener('touchcancel', handleTouchEnd)
      finalizeSheetDrag()
      touchCleanupRef.current = null
    }

    touchCleanupRef.current = () => {
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
      window.removeEventListener('touchcancel', handleTouchEnd)
    }

    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('touchend', handleTouchEnd)
    window.addEventListener('touchcancel', handleTouchEnd)
  }

  useEffect(
    () => () => {
      window.removeEventListener('pointermove', handleSheetPointerMove)
      window.removeEventListener('pointerup', handleSheetPointerUp)
      touchCleanupRef.current?.()
      if (sheetCloseTimeoutRef.current) {
        window.clearTimeout(sheetCloseTimeoutRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    if (!commentSheetPostId) {
      setSheetDraft('')
      setSheetReplyTarget(null)
      setCommentSheetHeight(0.6)
    }
  }, [commentSheetPostId])

  const handleAddComment = useCallback(
    async (postId: string, customText?: string, parentId?: string | null) => {
      const sourceText = customText ?? commentDrafts[postId]
      const draft = sourceText?.trim()
      if (!draft) return false
      const success = await submitComment(postId, draft, parentId)
      if (success && !customText) {
        setCommentDrafts((prev) => ({ ...prev, [postId]: '' }))
      }
      return success
    },
    [commentDrafts, submitComment],
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

        // 로컬 상태에서 삭제된 댓글 제거 (재귀적으로 replies도 확인)
        let newCommentCount = 0
        setCommentState((prev) => {
          const currentComments = prev[postId] || []
          const removeComment = (comments: FeedComment[]): FeedComment[] => {
            return comments
              .filter((c) => c.id !== commentId)
              .map((c) => ({
                ...c,
                replies: c.replies ? removeComment(c.replies) : undefined,
              }))
          }
          const newComments = removeComment(currentComments)
          
          // 댓글 카운트 정확히 계산
          const countComments = (comments: FeedComment[]): number => {
            return comments.reduce((acc, c) => acc + 1 + (c.replies ? countComments(c.replies) : 0), 0)
          }
          newCommentCount = countComments(newComments)
          
          // 전역 상태 업데이트
          globalCommentCounts[postId] = newCommentCount
          updateGlobalCommentCount(postId, newCommentCount)
          
          return { ...prev, [postId]: newComments }
        })
        
        // 로컬 feed 상태도 업데이트 (UI 즉시 반영)
        setFeed((prevFeed) =>
          prevFeed.map((post) =>
            post.id === postId ? { ...post, commentCount: newCommentCount } : post
          )
        )
        
        // visibleCommentCount도 업데이트
        setVisibleCommentCount((prevVisible) => {
          return {
            ...prevVisible,
            [postId]: Math.min(prevVisible[postId] || 10, newCommentCount),
          }
        })

        alert('댓글이 삭제되었습니다.')
      } catch (error: any) {
        console.error('댓글 삭제 실패:', error)
        alert(error.message || '댓글 삭제에 실패했습니다.')
      }
    },
    [authAccessToken, authRefreshToken, syncSession],
  )

  const copyPostLink = async (postId: string) => {
    try {
      // 네이티브 앱에서는 capacitor://localhost가 되므로 프로덕션 URL 사용
      const baseUrl = window.location.origin.includes('capacitor://') || window.location.origin.includes('localhost')
        ? 'https://mateyou.me'
        : window.location.origin
      const url = `${baseUrl}/feed/${postId}`
      await navigator.clipboard?.writeText(url)
      toast.success('링크가 복사되었습니다')
    } catch (error) {
      console.error('링크 복사 실패', error)
      toast.error('링크 복사에 실패했습니다')
    }
  }

  const renderContent = () => {
    switch (currentTab) {
      case 'home':
        return (
          <HomeSection
            feed={filteredFeed}
            likesState={likesState}
            comments={commentState}
            visibleCommentCount={visibleCommentCount}
            onToggleLike={handleToggleLike}
            onCommentButtonClick={handleCommentButton}
            onCopyLink={copyPostLink}
            followState={followState}
            onToggleFollow={handleToggleFollow}
            onPreviewMedia={handlePreviewMedia}
            canCreatePost={!!canCreatePost}
            isLoadingFeed={isLoadingFeed}
            onCreatePost={handleCreatePost}
            onLockedPostClick={handleLockedPostClick}
            onSavePost={handleSavePost}
            savedPostIds={savedPostIds}
            isAdmin={user?.role === 'admin'}
            onAdminReport={handleOpenReportSheet}
            onOpenMoreMenu={(post) => setMoreMenuPost({
              isOpen: true,
              postId: post.id,
              authorHandle: post.author.handle,
              authorName: post.author.name,
              authorId: post.partnerId || '',
            })}
            onMediaPurchaseClick={handleMediaPurchaseClick}
            onMembershipClick={(post) => {
              setPurchaseTargetPost(post)
              setTargetMembershipId(null)
              loadMemberships(post.partnerId!)
              setIsMembershipSheetOpen(true)
            }}
            onMediaMembershipClick={handleMediaMembershipClick}
            onMembershipBadgeClick={async (post, membershipId) => {
              setMembershipInfoSheetPost(post)
              setMembershipInfoSheetTargetId(membershipId ?? null)
              await loadMemberships(post.partnerId!)
              setIsMembershipInfoSheetOpen(true)
            }}
          />
        )
      case 'notifications':
        return (
          <PlaceholderSection
            title="알림 화면"
            description="알림은 별도 페이지에서 확인할 수 있습니다."
          />
        )
      case 'explore':
        return (
          <PlaceholderSection
            title="탐색 화면 준비 중"
            description="기존 메인 대시보드가 이 영역에 연결될 예정입니다."
          />
        )
      case 'mypage':
        return (
          <PlaceholderSection
            title="마이페이지"
            description="하단 탭의 ‘마이’ 메뉴는 별도의 페이지에서 제공됩니다."
          />
        )
      case 'messages':
      default:
        return (
          <PlaceholderSection
            title="메시지 화면 준비 중"
            description="실시간 메시지 컴포넌트가 연결되면 이 영역이 자동으로 갱신됩니다."
          />
        )
    }
  }

  // iOS에서 스크롤 이벤트가 제대로 발생하지 않는 문제 해결을 위한 IntersectionObserver 사용
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    if (!isMobile || !loadMoreTriggerRef.current || !scrollContainerRef.current) return
    
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (entry.isIntersecting && !isLoadingMore && hasMoreFeed) {
          void loadMoreFeed()
        }
      },
      {
        root: scrollContainerRef.current,
        rootMargin: '200px',
        threshold: 0.1,
      }
    )
    
    const triggerElement = loadMoreTriggerRef.current
    observer.observe(triggerElement)
    
    return () => {
      observer.disconnect()
    }
  }, [isMobile, isLoadingMore, hasMoreFeed, loadMoreFeed])

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (!isMobile) return
      const target = event.currentTarget
      const { scrollTop, scrollHeight, clientHeight } = target
      const distanceFromBottom = scrollHeight - (scrollTop + clientHeight)
      // iOS에서 스크롤 이벤트가 부드러운 스크롤 중에는 발생하지 않을 수 있으므로
      // IntersectionObserver를 주로 사용하고, 이 핸들러는 백업으로만 사용
      if (distanceFromBottom < 300 && !isLoadingMore && hasMoreFeed) {
        void loadMoreFeed()
      }
    },
    [isMobile, isLoadingMore, hasMoreFeed, loadMoreFeed],
  )

  const handlePullTouchStart = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobile) return
    const container = scrollContainerRef.current
    if (!container) return
    
    // 스크롤이 맨 위가 아니면 pull 시작 안함
    if (container.scrollTop > 0) {
      pullStartYRef.current = null
      return
    }
    
    const touch = event.touches[0]
    if (!touch) return
    pullStartYRef.current = touch.clientY
    setPullDistance(0)
  }, [isMobile])

  const handlePullTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobile) return
    if (pullStartYRef.current == null) return
    
    const container = scrollContainerRef.current
    if (!container) return
    
    // 스크롤 중이면 pull 취소
    if (container.scrollTop > 0) {
      pullStartYRef.current = null
      setPullDistance(0)
      return
    }
    
    const touch = event.touches[0]
    if (!touch) return
    const delta = touch.clientY - pullStartYRef.current
    
    if (delta > 0) {
      // 아래로 당기는 경우에만 처리
      event.preventDefault()
      // 최대 120px까지만 당겨지도록 제한
      setPullDistance(Math.min(delta, 120))
    }
  }, [isMobile])

  const handlePullTouchEnd = useCallback(() => {
    if (!isMobile) return
    
    if (pullDistance > 60 && !isRefreshing) {
      void refreshFeed()
    }
    
    pullStartYRef.current = null
    setPullDistance(0)
  }, [isMobile, pullDistance, isRefreshing, refreshFeed])

  const previewPostId = previewState?.postId
  const previewPost = previewPostId ? feedDictionary[previewPostId] ?? null : null
  const previewLikeState = previewPostId ? likesState[previewPostId] : undefined
  const previewIsLiked = previewLikeState?.liked ?? previewPost?.isLiked ?? false
  const previewLikeCount = previewLikeState?.count ?? previewPost?.likes ?? 0
  const previewCommentCount = previewPostId 
    ? (getTotalComments(previewPostId) || (previewPost?.commentCount ?? 0))
    : 0

  // 웹용 비디오 음소거 상태
  const [videoMuted, setVideoMuted] = useState(true)

  // 웹용 스크롤 컨테이너 ref
  const webScrollContainerRef = useRef<HTMLDivElement>(null)

  // 웹 무한 스크롤 핸들러
  const handleWebScroll = useCallback(() => {
    if (isMobile) return
    
    const container = webScrollContainerRef.current
    if (!container) return
    
    const { scrollTop, scrollHeight, clientHeight } = container
    
    // 페이지 하단에서 200px 이내이면 더 불러오기
    if (scrollHeight - scrollTop - clientHeight < 200) {
      if (!isLoadingMore && hasMoreFeed) {
        loadMoreFeed()
      }
    }
  }, [isMobile, isLoadingMore, hasMoreFeed, loadMoreFeed])

  // 웹 레이아웃
  if (!isMobile) {
    return (
      <CaptureProtection>
      <div
        ref={webScrollContainerRef}
        className="flex h-full flex-col overflow-y-auto bg-white text-[#110f1a]"
        onScroll={handleWebScroll}
      >
        <div className="mx-auto flex w-full flex-1 flex-col px-4 pt-16 pb-6 border-l border-r border-gray-200" style={{ maxWidth: '720px' }}>
          {/* 상단 광고 배너 - 이벤트가 있을 때만 표시 */}
          
          <main className="w-full space-y-2">
            <AdBanner className="mb-4 rounded-lg overflow-hidden" />
            {renderContent()}
            
            {/* 웹 로딩 더 보기 인디케이터 */}
            {isLoadingMore && (
              <div className="flex items-center justify-center py-4">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#FE3A8F] border-t-transparent" />
              </div>
            )}
          </main>
        </div>

        {/* 웹에서의 모달/팝업들 */}
        {commentSheetPostId && (
          <SlideSheet
            isOpen={!!commentSheetPostId}
            onClose={() => {
              setCommentSheetPostId(null)
              setSheetDraft('')
              setSheetReplyTarget(null)
            }}
            title="댓글"
            initialHeight={0.6}
            minHeight={0.3}
            maxHeight={0.9}
            zIndex={9999999}
            footer={
              <div className="space-y-2">
                {sheetReplyTarget && (() => {
                  const comments = commentSheetPostId ? (commentState[commentSheetPostId] ?? []) : []
                  const replyingToComment = comments.find(c => c.id === sheetReplyTarget) ||
                    comments.flatMap(c => c.replies || []).find(r => r.id === sheetReplyTarget)
                  return (
                    <div className="flex items-center gap-2 rounded-2xl bg-gray-50 px-3 py-2 text-xs text-gray-500">
                      <MessageCircle className="h-4 w-4" />
                      <span>{replyingToComment?.user || '사용자'}님에게 답글 작성중</span>
                      <button
                        className="ml-auto text-gray-400 hover:text-[#110f1a]"
                        onClick={() => setSheetReplyTarget(null)}
                      >
                        취소
                      </button>
                    </div>
                  )
                })()}
                <div className="relative rounded-full border border-gray-100 bg-gray-100 px-3 py-1.5">
                  <Input
                    className="w-full border-none bg-transparent p-0 pr-12 text-sm focus:border-none focus:ring-0 focus:ring-offset-0 focus:outline-none caret-[#FE3A8F]"
                    placeholder={sheetReplyTarget ? '대댓글을 입력해주세요' : '댓글을 입력해주세요'}
                    value={sheetDraft}
                    onChange={(e) => setSheetDraft(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter' && !e.shiftKey && commentSheetPostId) {
                        e.preventDefault()
                        if (isSubmittingComment) return
                        setIsSubmittingComment(true)
                        try {
                          if (sheetReplyTarget) {
                            const success = await handleAddComment(commentSheetPostId, sheetDraft, sheetReplyTarget)
                            if (success) {
                              setSheetReplyTarget(null)
                              setSheetDraft('')
                            }
                          } else {
                            const success = await handleAddComment(commentSheetPostId, sheetDraft)
                            if (success) {
                              setSheetDraft('')
                            }
                          }
                        } finally {
                          setIsSubmittingComment(false)
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#FE3A8F] disabled:opacity-50"
                    disabled={!sheetDraft.trim() || isSubmittingComment}
                    onClick={async () => {
                      if (!commentSheetPostId || isSubmittingComment) return
                      setIsSubmittingComment(true)
                      try {
                        if (sheetReplyTarget) {
                          const success = await handleAddComment(commentSheetPostId, sheetDraft, sheetReplyTarget)
                          if (success) {
                            setSheetReplyTarget(null)
                            setSheetDraft('')
                          }
                        } else {
                          const success = await handleAddComment(commentSheetPostId, sheetDraft)
                          if (success) {
                            setSheetDraft('')
                          }
                        }
                      } finally {
                        setIsSubmittingComment(false)
                      }
                    }}
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </div>
            }
          >
            <div className="flex h-full flex-col">
              {(() => {
                const comments = commentSheetPostId ? (commentState[commentSheetPostId] ?? []) : []
                if (comments.length === 0) {
                  return (
                    <div className="flex flex-1 items-center justify-center">
                      <p className="text-gray-400">아직 댓글이 없어요</p>
                    </div>
                  )
                }
                return (
                  <div className="flex-1 space-y-3 overflow-y-auto">
                    {comments.map((c) => (
                      <div key={c.id} className="space-y-2">
                        <div className="flex gap-3">
                          <Link
                            to={c.memberCode ? `/partners/${c.memberCode}` : '#'}
                            onClick={(e) => {
                              if (!c.memberCode) e.preventDefault()
                            }}
                          >
                            <AvatarWithFallback
                              src={c.avatar}
                              fallback={c.user?.charAt(0) || 'U'}
                              size="sm"
                            />
                          </Link>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <Link
                                to={c.memberCode ? `/partners/${c.memberCode}` : '#'}
                                onClick={(e) => {
                                  if (!c.memberCode) e.preventDefault()
                                }}
                                className="text-sm font-medium"
                              >
                                {c.user}
                              </Link>
                              <span className="text-xs text-gray-400">{c.time}</span>
                            </div>
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{c.text}</p>
                            <button
                              className="mt-1 text-xs text-gray-400"
                              onClick={() => setSheetReplyTarget(c.id)}
                            >
                              답글달기
                            </button>
                          </div>
                        </div>
                        {c.replies && c.replies.length > 0 && (
                          <div className="ml-10 space-y-2">
                            {c.replies.map((r) => (
                              <div key={r.id} className="flex gap-2">
                                <Link
                                  to={r.memberCode ? `/partners/${r.memberCode}` : '#'}
                                  onClick={(e) => {
                                    if (!r.memberCode) e.preventDefault()
                                  }}
                                >
                                  <AvatarWithFallback
                                    src={r.avatar}
                                    fallback={r.user?.charAt(0) || 'U'}
                                    size="xs"
                                  />
                                </Link>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1">
                                    <Link
                                      to={r.memberCode ? `/partners/${r.memberCode}` : '#'}
                                      onClick={(e) => {
                                        if (!r.memberCode) e.preventDefault()
                                      }}
                                      className="text-xs font-medium"
                                    >
                                      {r.user}
                                    </Link>
                                    <span className="text-xs text-gray-400">{r.time}</span>
                                  </div>
                                  <p className="text-xs text-gray-700 whitespace-pre-wrap">{r.text}</p>
                                  <button
                                    className="mt-0.5 text-xs text-gray-400"
                                    onClick={() => setSheetReplyTarget(r.id)}
                                  >
                                    답글달기
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          </SlideSheet>
        )}

        {/* 저장 팝업 */}
        <SavePostSheet
          isOpen={isSaveSheetOpen}
          onClose={() => setIsSaveSheetOpen(false)}
          savedPost={savedPostInfo}
          onUnsave={handleUnsavePost}
        />

        {/* 구매 팝업 */}
        <SlideSheet
          isOpen={!!purchaseTargetPost && isPurchaseSheetVisible}
          onClose={closePurchaseSheet}
          title="포스트 열기"
          initialHeight={0.5}
          minHeight={0.3}
          maxHeight={0.7}
        >
          <div className="flex flex-col gap-4 px-4 pb-8">
            {purchaseTargetPost && (
              <>
                {purchaseTargetPost.isSubscribersOnly && (
                  <button
                    type="button"
                    className="flex items-center justify-between rounded-2xl border border-gray-200 p-4 hover:bg-gray-50"
                    onClick={() => {
                      closePurchaseSheet()
                      setIsMembershipSheetOpen(true)
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FE3A8F]/10">
                        <Star className="h-5 w-5 text-[#FE3A8F]" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium">멤버쉽 구독하기</p>
                        <p className="text-sm text-gray-500">모든 구독자 전용 콘텐츠 이용</p>
                      </div>
                    </div>
                    <ChevronRight className="h-5 w-5 text-gray-400" />
                  </button>
                )}
                {(purchaseTargetPost.pointPrice !== undefined && purchaseTargetPost.pointPrice > 0) && (() => {
                  const discountRate = purchaseTargetPost.discountRate ?? 0
                  const basePrice = purchaseTargetPost.pointPrice
                  const finalPrice = discountRate > 0 && discountRate <= 100
                    ? Math.round(basePrice * (1 - discountRate / 100))
                    : basePrice
                  const hasDiscount = discountRate > 0 && discountRate <= 100
                  
                  return (
                    <button
                      type="button"
                      className="flex items-center justify-between rounded-2xl border border-gray-200 p-4 hover:bg-gray-50"
                      onClick={() => {
                        setSelectedPurchaseOption('single')
                        handleOneTimePurchase()
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
                          <CreditCard className="h-5 w-5 text-blue-500" />
                        </div>
                        <div className="text-left">
                          <p className="font-medium">단건 구매</p>
                          <div className="flex items-center gap-2">
                            {hasDiscount && (
                              <p className="text-xs text-gray-400 line-through">{basePrice.toLocaleString()}P</p>
                            )}
                            <p className={`text-sm ${hasDiscount ? 'text-[#FE3A8F] font-semibold' : 'text-gray-500'}`}>
                              {finalPrice.toLocaleString()}P로 이 포스트만 구매
                            </p>
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    </button>
                  )
                })()}
              </>
            )}
            <Button
              variant="secondary"
              className="w-full rounded-full"
              onClick={closePurchaseSheet}
            >
              닫기
            </Button>
          </div>
        </SlideSheet>

        {/* 멤버쉽 구독 팝업 */}
        <SlideSheet
          isOpen={isMembershipSheetOpen}
          onClose={() => {
            setIsMembershipSheetOpen(false)
            setSelectedMembership(null)
            setTargetMembershipId(null)
          }}
          title="멤버쉽 구독"
          initialHeight="auto"
        >
          <div className="flex flex-col gap-4 px-4 pb-8">
            {isLoadingMemberships ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#FE3A8F] border-t-transparent" />
              </div>
            ) : membershipList.length === 0 ? (
              <p className="text-center text-gray-500 py-8">구독 가능한 멤버쉽이 없습니다.</p>
            ) : (
              (targetMembershipId 
                ? membershipList.filter(m => m.id === targetMembershipId)
                : membershipList
              ).map((membership) => (
                <button
                  key={membership.id}
                  type="button"
                  className={`flex items-center justify-between rounded-2xl border p-4 hover:bg-gray-50 ${
                    selectedMembership?.id === membership.id ? 'border-[#FE3A8F] bg-[#FE3A8F]/5' : 'border-gray-200'
                  }`}
                  onClick={() => setSelectedMembership(membership)}
                >
                  <div className="text-left">
                    <p className="font-medium">{membership.name}</p>
                    {membership.description && (
                      <p className="text-sm text-gray-500">{membership.description}</p>
                    )}
                  </div>
                  <p className="font-semibold text-[#FE3A8F]">{membership.monthly_price?.toLocaleString()}P/월</p>
                </button>
              ))
            )}
            <Button
              className="w-full rounded-full bg-[#FE3A8F] text-white hover:bg-[#FE3A8F]/90"
              disabled={!selectedMembership || isProcessingMembershipPurchase}
              onClick={handleMembershipPurchase}
            >
              {isProcessingMembershipPurchase ? '처리 중...' : selectedMembership ? `${selectedMembership.monthly_price.toLocaleString()}P로 구독하기` : '멤버쉽을 선택해주세요'}
            </Button>
          </div>
        </SlideSheet>

        {/* 전체화면 미디어 프리뷰 */}
        {previewState && (
          <MediaPreview
            items={previewState.items}
            initialIndex={previewState.index}
            postId={previewPostId}
            isLiked={previewIsLiked}
            likeCount={previewLikeCount}
            commentCount={previewCommentCount}
            onToggleLike={handleToggleLike}
            onOpenComments={
              previewPostId ? () => handleCommentButton(previewPostId) : undefined
            }
            onClose={() => setPreviewState(null)}
            memberCode={user?.member_code}
          />
        )}

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

        {/* 일반 사용자 신고 모달 */}
        <ReportModal
          isOpen={userReportModal.isOpen}
          onClose={() => setUserReportModal({ isOpen: false, targetType: 'post', targetId: '' })}
          targetType={userReportModal.targetType}
          targetId={userReportModal.targetId}
          targetName={userReportModal.targetName}
        />

        {/* 더보기 메뉴 슬라이드 시트 */}
        <SlideSheet
          isOpen={!!moreMenuPost?.isOpen}
          onClose={() => setMoreMenuPost(null)}
          title=""
          showSubmit={false}
        >
          <div className="space-y-1 py-2">
            {/* 컬렉션 저장 */}
            <button
              type="button"
              onClick={() => {
                if (moreMenuPost) {
                  const post = feedDictionary[moreMenuPost.postId]
                  if (post) {
                    onSavePost?.(post)
                  }
                }
                setMoreMenuPost(null)
              }}
              className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
            >
              <Bookmark className={`h-5 w-5 ${moreMenuPost && savedPostIds.has(moreMenuPost.postId) ? 'text-[#FE3A8F] fill-current' : 'text-gray-500'}`} />
              <span className="text-base text-gray-900">컬렉션 저장</span>
            </button>
            
            {/* 신고하기 */}
            <button
              type="button"
              onClick={() => {
                if (moreMenuPost) {
                  setUserReportModal({
                    isOpen: true,
                    targetType: 'post',
                    targetId: moreMenuPost.postId,
                    targetName: `${moreMenuPost.authorName}의 포스트`,
                  })
                }
                setMoreMenuPost(null)
              }}
              className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
            >
              <Flag className="h-5 w-5 text-gray-500" />
              <span className="text-base text-gray-900">신고하기</span>
            </button>
            
            {/* 차단하기 (본인 게시물이 아닐 때만) */}
            {moreMenuPost && user?.member_code !== moreMenuPost.authorHandle && (
              <button
                type="button"
                onClick={() => {
                  if (moreMenuPost) {
                    if (confirm(`${moreMenuPost.authorName}님을 차단하시겠습니까?\n차단하면 해당 사용자의 게시물이 더 이상 표시되지 않습니다.`)) {
                      handleBlockUser(moreMenuPost.authorHandle, moreMenuPost.authorName)
                    }
                  }
                  setMoreMenuPost(null)
                }}
                className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                <Ban className="h-5 w-5 text-red-500" />
                <span className="text-base text-red-500">차단하기</span>
              </button>
            )}
          </div>
        </SlideSheet>

        {/* PC 댓글 모달 */}
        {commentModalPostId && commentModalPost && (
          <CommentModal
            post={commentModalPost}
            comments={commentState[commentModalPostId] ?? []}
            draft={commentDrafts[commentModalPostId] ?? ''}
            replyingToId={modalReplyTarget}
            visibleCount={getVisibleCountForPost(commentModalPostId)}
            totalCount={getTotalComments(commentModalPostId)}
            isLoadingComments={!!commentLoadingState[commentModalPostId]}
            onChangeDraft={(value) =>
              setCommentDrafts((prev) => ({ ...prev, [commentModalPostId]: value }))
            }
            onAddComment={async () => {
              if (isSubmittingComment) return
              setIsSubmittingComment(true)
              try {
                const currentDraft = commentDrafts[commentModalPostId] ?? ''
                if (modalReplyTarget) {
                  const success = await handleAddComment(commentModalPostId, currentDraft, modalReplyTarget)
                  if (success) {
                    setModalReplyTarget(null)
                    setCommentDrafts((prev) => ({
                      ...prev,
                      [commentModalPostId]: '',
                    }))
                  }
                } else {
                  const success = await handleAddComment(commentModalPostId, currentDraft)
                  if (success) {
                    setCommentDrafts((prev) => ({
                      ...prev,
                      [commentModalPostId]: '',
                    }))
                  }
                }
              } finally {
                setIsSubmittingComment(false)
              }
            }}
            isSubmitting={isSubmittingComment}
            onReply={(commentId) => setModalReplyTarget(commentId ?? null)}
            onLoadMore={() => {}}
            onCollapseAll={() => {}}
            onClose={() => {
              setCommentModalPostId(null)
              setModalReplyTarget(null)
            }}
            collapsedReplies={collapsedReplies[commentModalPostId] || {}}
            onToggleReplies={(commentId) =>
              toggleRepliesVisibility(commentModalPostId, commentId)
            }
            onDeleteComment={handleDeleteComment}
            onReportComment={(commentId, commentUser) => {
              setUserReportModal({
                isOpen: true,
                targetType: 'comment',
                targetId: commentId,
                targetName: `${commentUser}의 댓글`,
              })
            }}
            onBlockUser={(memberCode, userName) => handleBlockUser(memberCode, userName)}
          />
        )}
      </div>
      </CaptureProtection>
    )
  }

  // 모바일 레이아웃
  return (
    <CaptureProtection>
    <div
      className="flex h-full flex-col overflow-hidden bg-white text-[#110f1a]"
    >
      <div
        ref={scrollContainerRef}
        className="mx-auto flex w-full max-w-6xl flex-1 gap-6 overflow-y-auto px-4 pt-16 pb-6"
        onScroll={handleScroll}
        onTouchStart={handlePullTouchStart}
        onTouchMove={handlePullTouchMove}
        onTouchEnd={handlePullTouchEnd}
        style={{
          transform: pullDistance > 0 ? `translateY(${pullDistance / 2}px)` : undefined,
          transition: pullDistance === 0 ? 'transform 0.2s ease-out' : undefined,
        }}
      >
        <div className="flex w-full flex-1 flex-col gap-6">
          {/* 상단 광고 배너 */}
          <AdBanner className="rounded-lg overflow-hidden" />
          
          <main className="w-full flex-1 space-y-2">
            {(isRefreshing || pullDistance > 0) && (
              <div className="flex items-center justify-center text-xs text-gray-400">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-transparent" />
              </div>
            )}
            {renderContent()}
            
            {/* iOS 무한 스크롤 트리거 (IntersectionObserver용) */}
            {hasMoreFeed && (
              <div 
                ref={loadMoreTriggerRef}
                className="flex items-center justify-center py-4"
                style={{ minHeight: '1px' }}
              >
                {isLoadingMore && (
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#FE3A8F] border-t-transparent" />
                )}
              </div>
            )}
          </main>
        </div>
      </div>

      {isMobile && (
        <SlideSheet
          isOpen={!!commentSheetPostId}
          onClose={() => {
            setCommentSheetPostId(null)
            setSheetDraft('')
            setSheetReplyTarget(null)
          }}
          title="댓글"
          initialHeight={0.6}
          minHeight={0.3}
          maxHeight={0.9}
          zIndex={9999999}
          footer={
            user ? (
              <div className="space-y-2">
                {sheetReplyTarget && (() => {
                  const comments = commentSheetPostId ? (commentState[commentSheetPostId] ?? []) : []
                  const replyingToComment = comments.find(c => c.id === sheetReplyTarget) ||
                    comments.flatMap(c => c.replies || []).find(r => r.id === sheetReplyTarget)
                  return (
                    <div className="flex items-center gap-2 rounded-2xl bg-gray-50 px-3 py-2 text-xs text-gray-500">
                      <MessageCircle className="h-4 w-4" />
                      <span>{replyingToComment?.user || '사용자'}님에게 답글 작성중</span>
                      <button
                        className="ml-auto text-gray-400 hover:text-[#110f1a]"
                        onClick={() => setSheetReplyTarget(null)}
                      >
                        취소
                      </button>
                    </div>
                  )
                })()}
                <div className="relative rounded-full border border-gray-100 bg-gray-100 px-3 py-1.5">
                  <Input
                    className="w-full border-none bg-transparent p-0 pr-12 text-sm focus:border-none focus:ring-0 focus:ring-offset-0 focus:outline-none caret-[#FE3A8F]"
                    placeholder={sheetReplyTarget ? '대댓글을 입력해주세요' : '댓글을 입력해주세요'}
                    value={sheetDraft}
                    onChange={(e) => setSheetDraft(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter' && !e.shiftKey && commentSheetPostId) {
                        e.preventDefault()
                        if (isSubmittingComment) return
                        setIsSubmittingComment(true)
                        try {
                          if (sheetReplyTarget) {
                            const success = await handleAddComment(commentSheetPostId, sheetDraft, sheetReplyTarget)
                            if (success) {
                              setSheetReplyTarget(null)
                              setSheetDraft('')
                            }
                          } else {
                            const success = await handleAddComment(commentSheetPostId, sheetDraft)
                            if (success) {
                              setSheetDraft('')
                            }
                          }
                        } finally {
                          setIsSubmittingComment(false)
                        }
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="absolute right-1.5 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full !bg-[#FE3A8F] p-0 text-white hover:!bg-[#e8a0c0] disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={async () => {
                      if (!commentSheetPostId || isSubmittingComment) return
                      setIsSubmittingComment(true)
                      try {
                        if (sheetReplyTarget) {
                          const success = await handleAddComment(commentSheetPostId, sheetDraft, sheetReplyTarget)
                          if (success) {
                            setSheetReplyTarget(null)
                            setSheetDraft('')
                          }
                        } else {
                          const success = await handleAddComment(commentSheetPostId, sheetDraft)
                          if (success) {
                            setSheetDraft('')
                          }
                        }
                      } finally {
                        setIsSubmittingComment(false)
                      }
                    }}
                    disabled={isSubmittingComment || !sheetDraft.trim()}
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
              <div className="text-center py-2">
                <button
                  onClick={() => navigate({ to: '/login' })}
                  className="text-[#FE3A8F] hover:underline text-sm font-medium"
                >
                  로그인하고 댓글 작성하기
                </button>
              </div>
            )
          }
        >
          {commentSheetPostId && (
            <>
              {commentLoadingState[commentSheetPostId] ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-gray-200" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-24 animate-pulse rounded-full bg-gray-200" />
                        <div className="h-3 w-40 animate-pulse rounded-full bg-gray-100" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (commentState[commentSheetPostId] ?? []).length > 0 ? (
                <>
                  <CommentList
                    comments={(commentState[commentSheetPostId] ?? []).slice(0, getVisibleCountForPost(commentSheetPostId))}
                    onReply={(commentId) => setSheetReplyTarget(commentId ?? null)}
                    replyingToId={sheetReplyTarget}
                    collapsedReplies={collapsedReplies[commentSheetPostId] || {}}
                    onToggleReplies={(commentId) => toggleRepliesVisibility(commentSheetPostId, commentId)}
                    postAuthorMemberCode={commentSheetPost?.author?.handle}
                    currentUserId={user?.id}
                    currentUserMemberCode={user?.member_code}
                    onDeleteComment={(commentId) => handleDeleteComment(commentSheetPostId, commentId)}
                    onRequireLogin={() => navigate({ to: '/login' })}
                    onReportComment={(commentId, commentUser) => {
                      setUserReportModal({
                        isOpen: true,
                        targetType: 'comment',
                        targetId: commentId,
                        targetName: `${commentUser}의 댓글`,
                      })
                    }}
                    onBlockUser={(memberCode, userName) => handleBlockUser(memberCode, userName)}
                  />
                </>
              ) : (
                <p className="py-6 text-center text-sm text-gray-400">
                  첫 댓글을 남겨보세요.
                </p>
              )}
            </>
          )}
        </SlideSheet>
      )}

      {!isMobile && commentModalPostId && commentModalPost && (
        <CommentModal
          post={commentModalPost}
          comments={commentState[commentModalPostId] ?? []}
          draft={commentDrafts[commentModalPostId] ?? ''}
          replyingToId={modalReplyTarget}
          visibleCount={getVisibleCountForPost(commentModalPostId)}
          totalCount={getTotalComments(commentModalPostId)}
          isLoadingComments={!!commentLoadingState[commentModalPostId]}
          onChangeDraft={(value) =>
            setCommentDrafts((prev) => ({ ...prev, [commentModalPostId]: value }))
          }
          onAddComment={async () => {
            if (isSubmittingComment) return
            setIsSubmittingComment(true)
            try {
              const currentDraft = commentDrafts[commentModalPostId] ?? ''
              if (modalReplyTarget) {
                const success = await handleAddComment(commentModalPostId, currentDraft, modalReplyTarget)
                if (success) {
                  setModalReplyTarget(null)
                  setCommentDrafts((prev) => ({
                    ...prev,
                    [commentModalPostId]: '',
                  }))
                }
              } else {
                const success = await handleAddComment(commentModalPostId, currentDraft)
                if (success) {
                  setCommentDrafts((prev) => ({
                    ...prev,
                    [commentModalPostId]: '',
                  }))
                }
              }
            } finally {
              setIsSubmittingComment(false)
            }
          }}
          isSubmitting={isSubmittingComment}
          onReply={(commentId) => setModalReplyTarget(commentId ?? null)}
          onLoadMore={() => {}}
          onCollapseAll={() => {}}
          onClose={() => {
            setCommentModalPostId(null)
            setModalReplyTarget(null)
          }}
          collapsedReplies={collapsedReplies[commentModalPostId] || {}}
          onToggleReplies={(commentId) =>
            toggleRepliesVisibility(commentModalPostId, commentId)
          }
          onDeleteComment={(commentId) => handleDeleteComment(commentModalPostId, commentId)}
          onReportComment={(commentId, commentUser) => {
            setUserReportModal({
              isOpen: true,
              targetType: 'comment',
              targetId: commentId,
              targetName: `${commentUser}의 댓글`,
            })
          }}
          onBlockUser={(memberCode, userName) => handleBlockUser(memberCode, userName)}
        />
      )}

      {/* MobileTabBar는 __root.tsx에서 전역으로 렌더링됨 */}

      {previewState && (
        <MediaPreview
          items={previewState.items}
          initialIndex={previewState.index}
          postId={previewPostId}
          isLiked={previewIsLiked}
          likeCount={previewLikeCount}
          commentCount={previewCommentCount}
          onToggleLike={handleToggleLike}
          onOpenComments={
            previewPostId ? () => handleCommentButton(previewPostId) : undefined
          }
          onClose={() => setPreviewState(null)}
          memberCode={user?.member_code}
        />
      )}

      {/* 개별 미디어 구매 팝업 */}
      <SlideSheet
        isOpen={isMediaPurchaseSheetVisible && !!mediaPurchaseTarget}
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
          mediaPurchaseTarget && (() => {
            const { post, mediaIndex } = mediaPurchaseTarget
            const media = post.media?.[mediaIndex]
            if (!media || !media.point_price || media.point_price <= 0) return null

            const discountRate = post.discountRate ?? 0
            const basePrice = media.point_price
            const finalPrice = discountRate > 0 && discountRate <= 100
              ? Math.round(basePrice * (1 - discountRate / 100))
              : basePrice

            // 묶음 구매 가격 계산
            const unpurchasedMedia = post.media?.filter((m, idx) => {
              const isPurchased = post.purchasedMediaOrder != null && idx <= post.purchasedMediaOrder
              return !m.signed_url && m.point_price != null && m.point_price > 0 && !isPurchased
            }) || []
            const bundleBasePrice = unpurchasedMedia.reduce((sum, m) => sum + (m.point_price || 0), 0)
            const bundleFinalPrice = discountRate > 0 && discountRate <= 100
              ? Math.round(bundleBasePrice * (1 - discountRate / 100))
              : bundleBasePrice

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
                  disabled={
                    isProcessingPurchase ||
                    !selectedMediaPurchaseOption
                  }
                >
                  {isProcessingPurchase ? '결제 중...' : '구매하기'}
                </button>
              </div>
            )
          })()
        }
      >
        {mediaPurchaseTarget && (() => {
          const { post, mediaIndex } = mediaPurchaseTarget
          const media = post.media?.[mediaIndex]
          if (!media || !media.point_price || media.point_price <= 0) return null

          const discountRate = post.discountRate ?? 0
          
          // "여기까지 구매하기" 가격 계산: 0번부터 클릭한 인덱스까지의 미구매 미디어 합계
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

          // 묶음 구매 가격 계산 (모든 미구매 미디어)
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

              {/* 여기까지 구매 옵션 */}
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

              {/* 묶음 구매 옵션 (is_bundle이 true이고 미구매 미디어가 2개 이상일 때만 표시) */}
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

              const discountRate = post.discountRate ?? 0
              const basePrice = media.point_price
              const finalPrice = discountRate > 0 && discountRate <= 100
                ? Math.round(basePrice * (1 - discountRate / 100))
                : basePrice

              // 묶음 구매 가격 계산
              const unpurchasedMedia = post.media?.filter((m, idx) => {
                const isPurchased = post.purchasedMediaOrder != null && idx <= post.purchasedMediaOrder
                return !m.signed_url && m.point_price != null && m.point_price > 0 && !isPurchased
              }) || []
              const bundleBasePrice = unpurchasedMedia.reduce((sum, m) => sum + (m.point_price || 0), 0)
              const bundleFinalPrice = discountRate > 0 && discountRate <= 100
                ? Math.round(bundleBasePrice * (1 - discountRate / 100))
                : bundleBasePrice

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
                      if (selectedMediaPurchaseOption) {
                        executeMediaPurchase(
                          post,
                          mediaIndex,
                          selectedMediaPurchaseOption === 'bundle'
                        )
                      }
                    }}
                    disabled={
                      isProcessingPurchase ||
                      !selectedMediaPurchaseOption
                    }
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
            
            // "여기까지 구매하기" 가격 계산: 0번부터 클릭한 인덱스까지의 미구매 미디어 합계
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

            // 묶음 구매 가격 계산 (모든 미구매 미디어)
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

                {/* 여기까지 구매 옵션 */}
                <div
                  className={`cursor-pointer rounded-2xl border-2 p-4 transition-all ${
                    selectedMediaPurchaseOption === 'single'
                      ? 'border-[#FE3A8F] bg-[#FE3A8F]/5'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedMediaPurchaseOption('single')}
                >
                  <div className="mb-3">
                    <p className="text-base font-semibold text-[#110f1a]">
                      여기까지 구매하기
                    </p>
                    {mediaCountUpToIndex > 1 && (
                      <p className="text-xs text-gray-500 mt-1">
                        1~{mediaIndex + 1}번 미디어 ({mediaCountUpToIndex}개)
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Heart className="h-5 w-5 fill-[#FE3A8F] text-[#FE3A8F]" />
                    <div className="flex flex-col">
                      {hasDiscount && (
                        <span className="text-xs text-gray-500 line-through">
                          {basePrice.toLocaleString()}P
                        </span>
                      )}
                      <span className={`text-base font-semibold ${hasDiscount ? 'text-[#FE3A8F]' : 'text-[#110f1a]'}`}>
                        {finalPrice.toLocaleString()}P
                      </span>
                    </div>
                  </div>
                </div>

                {/* 묶음 구매 옵션 (is_bundle이 true이고 미구매 미디어가 2개 이상일 때만 표시) */}
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
                      <p className="text-base font-semibold text-[#110f1a]">
                        모든 미구매 미디어 묶음 구매하기
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {unpurchasedMedia.length}개의 미디어를 한 번에 구매
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Heart className="h-5 w-5 fill-[#FE3A8F] text-[#FE3A8F]" />
                      <div className="flex flex-col">
                        {bundleHasDiscount && (
                          <span className="text-xs text-gray-500 line-through">
                            {bundleBasePrice.toLocaleString()}P
                          </span>
                        )}
                        <span className={`text-base font-semibold ${bundleHasDiscount ? 'text-[#FE3A8F]' : 'text-[#110f1a]'}`}>
                          {bundleFinalPrice.toLocaleString()}P
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
        </SlideSheet>
      )}

      {/* 구독/단건구매 선택용 슬라이드 시트 */}
      <SlideSheet
        isOpen={!!purchaseTargetPost && isPurchaseSheetVisible}
        onClose={closePurchaseSheet}
        title="포스트 열기"
        initialHeight={0.5}
        minHeight={0.3}
        maxHeight={0.7}
        footer={
          purchaseTargetPost && (
            <div className="flex gap-3">
              {purchaseFlowState === 'success' ? (
                <button
                  type="button"
                  className="flex-1 rounded-xl bg-[#110f1a] px-4 py-3 text-sm font-semibold text-white hover:bg-[#241f3f]"
          onClick={closePurchaseSheet}
        >
                  확인
                </button>
              ) : (
                <>
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
                      if (selectedPurchaseOption === 'single' && purchaseTargetPost.pointPrice !== undefined && purchaseTargetPost.pointPrice > 0) {
                        handleOneTimePurchase()
                      }
                    }}
                    disabled={
                      isProcessingPurchase ||
                      selectedPurchaseOption !== 'single' ||
                      !(purchaseTargetPost.pointPrice !== undefined && purchaseTargetPost.pointPrice > 0)
                    }
                  >
                    {isProcessingPurchase ? '결제 중...' : '포스트 열기'}
                  </button>
                </>
              )}
            </div>
          )
        }
      >
        {purchaseTargetPost && (
          <>
              {purchaseFlowState === 'success' ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center py-8">
                  <CheckCircle className="h-14 w-14 text-[#FE3A8F]" />
                  <div>
                    <Typography variant="body1" className="text-lg font-semibold text-[#110f1a]">
                      구매가 완료되었습니다!
                    </Typography>
                    <p className="mt-2 text-sm text-gray-500">이제 전체 포스트를 바로 확인할 수 있어요.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* 멤버십 구독 옵션 */}
            {purchaseFlowState === 'select' && purchaseTargetPost.isSubscribersOnly && (
              <div
                className={`cursor-pointer rounded-2xl border-2 p-4 transition-all ${
                  selectedPurchaseOption === 'membership'
                    ? 'border-[#FE3A8F] bg-[#FE3A8F]/5'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
                onClick={handleMembershipOptionClick}
              >
                <div className="mb-3 flex items-center gap-2">
                  <Star className="h-5 w-5 text-[#FE3A8F]" />
                  <Typography variant="body1" className="font-semibold text-[#110f1a]">
                    멤버십 구독해서 열기
                  </Typography>
                </div>
                <Typography variant="caption" className="text-gray-500">
                  멤버십을 구독하면 모든 구독자 전용 포스트를 볼 수 있습니다.
                </Typography>
              </div>
            )}

                  {/* 단건구매 옵션 */}
                  {(purchaseTargetPost.pointPrice !== undefined && purchaseTargetPost.pointPrice > 0) && (() => {
                    const discountRate = purchaseTargetPost.discountRate ?? 0
                    const basePrice = purchaseTargetPost.pointPrice
                    const finalPrice = discountRate > 0 && discountRate <= 100
                      ? Math.round(basePrice * (1 - discountRate / 100))
                      : basePrice
                    const hasDiscount = discountRate > 0 && discountRate <= 100
                    
                    return (
                      <div
                        className={`cursor-pointer rounded-2xl border-2 p-4 transition-all ${
                          selectedPurchaseOption === 'single'
                            ? 'border-[#FE3A8F] bg-[#FE3A8F]/5'
                            : 'border-gray-200 bg-white hover:border-gray-300'
                        }`}
                        onClick={() => setSelectedPurchaseOption('single')}
                      >
                        <div className="mb-3">
                          <Typography variant="body1" className="font-semibold text-[#110f1a]">
                            이 포스트만 구매하기
                          </Typography>
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
                    )
                  })()}
                </div>
              )}
                </>
              )}
      </SlideSheet>

      {/* 저장 슬라이드 시트 */}
      <SavePostSheet
        isOpen={isSaveSheetOpen}
        onClose={() => setIsSaveSheetOpen(false)}
        savedPost={savedPostInfo}
        onUnsave={handleUnsavePost}
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
      >
        <div className="space-y-4 p-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">제재 유형</label>
            <select
              value={reportReasonType}
              onChange={(e) => setReportReasonType(Number(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-[#FE3A8F] focus:outline-none"
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
          <Button
            className="w-full rounded-full bg-red-500 text-white hover:bg-red-600"
            disabled={!reportReasonDetail.trim() || isSubmittingReport}
            onClick={handleSubmitReport}
          >
            {isSubmittingReport ? '처리 중...' : '제재 처리'}
          </Button>
        </div>
      </SlideSheet>
      
      {/* 멤버쉽 구독 슬라이드 시트 */}
      <SlideSheet
        isOpen={isMembershipSheetOpen}
        onClose={() => {
          setIsMembershipSheetOpen(false)
          setSelectedMembership(null)
          setTargetMembershipId(null)
        }}
        title="멤버쉽 구독"
        height="60vh"
      >
        <div className="flex flex-col h-full">
          <div className="flex-1 overflow-y-auto px-6">
            {isLoadingMemberships ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#FE3A8F] border-t-transparent" />
              </div>
            ) : membershipList.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                구독 가능한 멤버쉽이 없습니다.
              </div>
            ) : (
              <div className="space-y-3">
                {(targetMembershipId 
                  ? membershipList.filter(m => m.id === targetMembershipId)
                  : membershipList
                ).map((membership) => (
                  <div
                    key={membership.id}
                    className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
                      selectedMembership?.id === membership.id
                        ? 'border-[#FE3A8F] bg-[#FE3A8F]/5'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedMembership(membership)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <Typography variant="body1" className="font-semibold text-[#110f1a]">
                          {membership.name}
                        </Typography>
                        {membership.description && (
                          <Typography variant="caption" className="text-gray-500 whitespace-pre-wrap break-words">
                            {membership.description}
                          </Typography>
                        )}
                      </div>
                      <div className="text-right whitespace-nowrap">
                        <Typography variant="body1" className="font-bold text-[#FE3A8F] inline">
                          {membership.monthly_price.toLocaleString()}P
                        </Typography>
                        <Typography variant="caption" className="text-gray-400 inline">
                          /월
                        </Typography>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="p-6 pt-4 flex-shrink-0">
            <button
              onClick={handleMembershipPurchase}
              disabled={!selectedMembership || isProcessingMembershipPurchase}
              className="w-full py-3 bg-[#FE3A8F] text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isProcessingMembershipPurchase ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  처리 중...
                </>
              ) : selectedMembership ? (
                `${selectedMembership.monthly_price.toLocaleString()}P로 구독하기`
              ) : (
                '멤버쉽을 선택해주세요'
              )}
            </button>
          </div>
        </div>
      </SlideSheet>

      {/* 모바일 더보기 메뉴 슬라이드 시트 */}
      <SlideSheet
        isOpen={!!moreMenuPost?.isOpen}
        onClose={() => setMoreMenuPost(null)}
        title=""
        showSubmit={false}
      >
        <div className="space-y-1 py-2">
          {/* 컬렉션 저장 */}
          <button
            type="button"
            onClick={() => {
              if (moreMenuPost) {
                const post = feedDictionary[moreMenuPost.postId]
                if (post) {
                  handleSavePost(post)
                }
              }
              setMoreMenuPost(null)
            }}
            className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
          >
            <Bookmark className={`h-5 w-5 ${moreMenuPost && savedPostIds.has(moreMenuPost.postId) ? 'text-[#FE3A8F] fill-current' : 'text-gray-500'}`} />
            <span className="text-base text-gray-900">컬렉션 저장</span>
          </button>
          
          {/* 신고하기 */}
          <button
            type="button"
            onClick={() => {
              if (moreMenuPost) {
                setUserReportModal({
                  isOpen: true,
                  targetType: 'post',
                  targetId: moreMenuPost.postId,
                  targetName: `${moreMenuPost.authorName}의 포스트`,
                })
              }
              setMoreMenuPost(null)
            }}
            className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
          >
            <Flag className="h-5 w-5 text-gray-500" />
            <span className="text-base text-gray-900">신고하기</span>
          </button>
          
          {/* 차단하기 (본인 게시물이 아닐 때만) */}
          {moreMenuPost && user?.member_code !== moreMenuPost.authorHandle && (
            <button
              type="button"
              onClick={() => {
                if (moreMenuPost) {
                  if (confirm(`${moreMenuPost.authorName}님을 차단하시겠습니까?\n차단하면 해당 사용자의 게시물이 더 이상 표시되지 않습니다.`)) {
                    handleBlockUser(moreMenuPost.authorHandle, moreMenuPost.authorName)
                  }
                }
                setMoreMenuPost(null)
              }}
              className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
            >
              <Ban className="h-5 w-5 text-red-500" />
              <span className="text-base text-red-500">차단하기</span>
            </button>
          )}
        </div>
      </SlideSheet>

      {/* 모바일 신고 모달 */}
      <ReportModal
        isOpen={userReportModal.isOpen}
        onClose={() => setUserReportModal({ isOpen: false, targetType: 'post', targetId: '' })}
        targetType={userReportModal.targetType}
        targetId={userReportModal.targetId}
        targetName={userReportModal.targetName}
      />

      {/* 이벤트 팝업 모달 */}
      <EventPopupModal
        isOpen={isEventPopupOpen}
        onClose={handleEventPopupClose}
        events={eventBanners}
      />

      {/* 멤버십 알림 팝업 */}
      <MembershipNotificationPopup
        isOpen={isMembershipNotificationOpen}
        onClose={handleMembershipNotificationClose}
        data={membershipNotificationData}
      />

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
              {isLoadingMemberships ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#FE3A8F] border-t-transparent" />
                </div>
              ) : (
                <ul className="space-y-2">
                  {(() => {
                    if (membershipInfoSheetTargetId) {
                      const m = membershipList.find((x) => x.id === membershipInfoSheetTargetId)
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
                      .map((id) => membershipList.find((m) => m.id === id)?.name ?? '멤버십')
                      .filter((n, i, arr) => arr.indexOf(n) === i)
                    return names.length ? names.map((name) => (
                      <li key={name} className="flex items-center gap-2 text-sm font-medium text-[#110f1a]">
                        <Star className="h-4 w-4 text-[#FE3A8F] flex-shrink-0" />
                        {name}
                      </li>
                    )) : (
                      <li className="text-sm text-center text-gray-500">모든 멤버쉽</li>
                    )
                  })()}
                </ul>
              )}
            </>
          )}
        </div>
      </SlideSheet>
    </div>
    </CaptureProtection>
  )
}

interface HomeSectionProps {
  feed: FeedPost[]
  likesState: Record<string, { liked: boolean; count: number }>
  comments: Record<string, FeedPost['comments']>
  visibleCommentCount?: Record<string, number>
  onToggleLike: (id: string) => void
  onCommentButtonClick: (id: string) => void
  onCopyLink: (id: string) => void
  followState: Record<string, boolean>
  onToggleFollow: (post: FeedPost) => void
  onPreviewMedia: (postId: string, mediaList: Array<FeedMedia>, index: number) => void
  canCreatePost: boolean
  onCreatePost?: () => void
  isLoadingFeed?: boolean
  onLockedPostClick?: (post: FeedPost) => void
  onSavePost?: (post: FeedPost) => void
  savedPostIds?: Set<string>
  isAdmin?: boolean
  onAdminReport?: (postId: string) => void
  onOpenMoreMenu?: (post: FeedPost) => void
  onMediaPurchaseClick?: (post: FeedPost, mediaIndex: number) => void
  onMembershipClick?: (post: FeedPost) => void
  onMediaMembershipClick?: (post: FeedPost, membershipId: string, mediaIndex: number) => void
  onMembershipBadgeClick?: (post: FeedPost, membershipId?: string | null) => void
}

export function getPostMembershipIds(post: FeedPost): string[] {
  const ids = new Set<string>()
  if (post.membershipId) ids.add(post.membershipId)
  post.media?.forEach((m: FeedMedia) => { if (m.membership_id) ids.add(m.membership_id) })
  return Array.from(ids)
}

function HomeSection({
  feed,
  likesState,
  comments,
  visibleCommentCount = {},
  onToggleLike,
  onCommentButtonClick,
  onCopyLink,
  followState,
  onToggleFollow,
  onPreviewMedia,
  canCreatePost,
  onCreatePost,
  onSavePost,
  savedPostIds = new Set(),
  isLoadingFeed = false,
  onLockedPostClick,
  isAdmin = false,
  onAdminReport,
  onOpenMoreMenu,
  onMediaPurchaseClick,
  onMembershipClick,
  onMediaMembershipClick,
  onMembershipBadgeClick,
}: HomeSectionProps) {
  const { user } = useAuth()
  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(new Set())
  return (
    <div className="space-y-12">
      {isLoadingFeed && feed.length === 0 ? (
        <FeedSkeleton />
      ) : feed.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <p className="text-gray-500">표시할 피드가 없습니다.</p>
        </div>
      ) : (
        feed.map((post) => {
        const followKey = post.author?.handle || post.partnerId || post.id
        
        // 접근 권한 체크:
        // 1. 관리자는 모든 콘텐츠 접근 가능
        // 2. is_subscribers_only: has_membership이 true면 접근 가능
        // 3. point_price > 0: is_purchased가 true면 접근 가능
        // 4. 둘 다 있으면: has_membership OR is_purchased 중 하나면 접근 가능
        const canAccessContent = (() => {
          // 관리자는 모든 콘텐츠 접근 가능
          if (isAdmin) return true
          
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
        const hasAccessBadge = (!post.media || post.media.length === 0) && isLocked

        return (
        <article
          key={post.id}
          className="space-y-4 w-full mx-auto"
          draggable={false}
          onDragStart={(event) => event.preventDefault()}
        >
          <header className="flex items-start gap-4">
            <Link
              to="/partners/$memberCode"
              params={{ memberCode: post.author.handle }}
              className="flex flex-1 items-start gap-4 rounded-2xl p-1 text-left no-underline transition hover:bg-gray-50 focus:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#110f1a]/30"
            >
              {/* 프로필 사진 + 팔로우 버튼 오버레이 */}
              <div className="relative flex-shrink-0">
                <AvatarWithFallback
                  src={post.author.avatar}
                  name={post.author.name}
                  className="h-8 w-8"
                />
                {/* 팔로우 안 한 상태 && 내 게시물이 아닐 때 + 버튼 표시 */}
                {user?.member_code !== post.author.handle && !(followState[followKey] ?? globalFollowState[followKey]) && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      onToggleFollow(post)
                    }}
                    className="absolute -bottom-0 -right-0 flex h-4 w-4 items-center justify-center rounded-full bg-[#FE3A8F] text-white shadow-sm hover:bg-[#e8328a] transition-colors"
                  >
                    <Plus className="h-3 w-3" strokeWidth={3} />
                  </button>
                )}
              </div>
              <div className="flex flex-col flex-1">
                <div className="flex flex-col">
                  <p className="font-semibold text-[#110f1a]">{post.author.name}</p>
                </div>
                <div className="flex items-center gap-2 font-bold">
                  <span className="text-xs text-gray-400">@{post.author.handle}</span>
                  <span className="text-xs text-gray-400">·</span>
                  <p className="text-xs text-gray-400">{formatRelativeTime(post.postedAt)}</p>
                </div>
              </div>
            </Link>
            {/* 더보기 메뉴 버튼 */}
            <button
              type="button"
              onClick={() => onOpenMoreMenu?.(post)}
              className="flex items-center justify-center p-2 transition-colors text-gray-400 hover:text-gray-600"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
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
              {(post.content.split('\n').length > 1 || post.content.length > 50) && !expandedPosts.has(post.id) && (
                <button
                  type="button"
                  onClick={() => setExpandedPosts(prev => new Set(prev).add(post.id))}
                  className="text-gray-500 text-sm font-medium mt-1 hover:text-gray-700"
                >
                  더보기
                </button>
              )}
            </div>
          )}

          <FeedMediaCarousel
            media={post.media}
            onMediaClick={({ mediaList, index }) => onPreviewMedia(post.id, mediaList, index)}
            isSubscribersOnly={post.isSubscribersOnly}
            pointPrice={post.pointPrice}
            isPurchased={canAccessContent}
            onLockedClick={
              !canAccessContent && onLockedPostClick
                ? () => onLockedPostClick(post)
                : undefined
            }
            memberCode={user?.member_code}
            isBundle={post.isBundle}
            discountRate={post.discountRate ?? 0}
            purchasedMediaOrder={post.purchasedMediaOrder ?? null}
            onMediaPurchaseClick={onMediaPurchaseClick ? (mediaIndex) => {
              onMediaPurchaseClick(post, mediaIndex)
            } : undefined}
            postPointPrice={post.pointPrice}
            postIsSubscribersOnly={post.isSubscribersOnly}
            onMembershipClick={onMembershipClick ? () => {
              onMembershipClick(post)
            } : undefined}
            onMediaMembershipClick={onMediaMembershipClick ? (membershipId, mediaIndex) => {
              onMediaMembershipClick(post, membershipId, mediaIndex)
            } : undefined}
            onMembershipBadgeClick={onMembershipBadgeClick ? (membershipId) => onMembershipBadgeClick(post, membershipId) : undefined}
          />

          <div className="flex flex-wrap items-center gap-4 py-3 text-sm">
            <button
              className={`flex items-center gap-2 font-medium cursor-pointer ${
                likesState[post.id]?.liked ? 'text-red-500' : 'text-gray-500'
              }`}
              onClick={() => {
                if (isLocked) return
                onToggleLike(post.id)
              }}
            >
              <Heart
                className={`h-5 w-5 ${
                  likesState[post.id]?.liked ? 'fill-red-500 text-red-500' : ''
                }`}
              />
              {likesState[post.id]?.count ?? post.likes}
            </button>
            <button
              className={`flex items-center gap-2 text-gray-500 cursor-pointer`}
              onClick={() => {
                if (isLocked) return
                onCommentButtonClick(post.id)
              }}
            >
              <MessageCircle className="h-5 w-5" />
              {visibleCommentCount[post.id] ?? comments[post.id]?.length ?? 0}
            </button>
            {/* 공개 게시물만 공유 버튼 표시 (유료/구독자 전용은 숨김) */}
            {!post.isSubscribersOnly && !post.pointPrice && (
              <button
                className="flex items-center gap-2 text-gray-500 cursor-pointer"
                onClick={() => onCopyLink(post.id)}
              >
                <Repeat2 className="h-5 w-5" />
              </button>
            )}
            {/* 관리자용 삭제 버튼 */}
            {isAdmin && onAdminReport && (
              <button
                className="flex items-center gap-2 text-red-500 hover:text-red-600 ml-auto cursor-pointer"
                onClick={() => onAdminReport(post.id)}
              >
                <Trash2 className="h-5 w-5" />
              </button>
            )}
          </div>
        </article>
        )
        })
      )}
    </div>
  )
}

interface SearchSectionProps {
  keyword: string
  onKeywordChange: (value: string) => void
  users: typeof searchUsers
}

function SearchSection({ keyword, onKeywordChange, users }: SearchSectionProps) {
  return (
    <section className="space-y-4 rounded-3xl border border-white/70 bg-white p-6 shadow-sm">
      <Typography variant="h3" className="text-lg font-semibold text-[#110f1a]">
        사용자 검색
      </Typography>
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        <Input
          className="pl-10"
          placeholder="닉네임 또는 아이디 검색"
          value={keyword}
          onChange={(event) => onKeywordChange(event.target.value)}
        />
      </div>
      <div className="space-y-3">
        {users.map((user) => (
          <div
            key={user.id}
            className="flex items-center gap-4 rounded-2xl border border-gray-100 p-4"
          >
            <AvatarWithFallback src={user.avatar} name={user.name} className="h-8 w-8" />
            <div className="flex-1">
              <p className="font-semibold text-[#110f1a]">{user.name}</p>
              <p className="text-sm text-gray-400">@{user.handle}</p>
              <p className="text-sm text-[#FE3A8F]">{user.specialty}</p>
            </div>
            <Button variant="outline" size="sm">
              프로필
            </Button>
          </div>
        ))}
        {users.length === 0 && (
          <div className="rounded-2xl bg-gray-50 py-6 text-center text-sm text-gray-500">
            검색 결과가 없습니다.
          </div>
        )}
      </div>
    </section>
  )
}


interface PlaceholderSectionProps {
  title: string
  description: string
}

function PlaceholderSection({ title, description }: PlaceholderSectionProps) {
  return (
    <section className="rounded-3xl border border-white/70 bg-white p-6 text-center shadow-sm">
      <Typography variant="h3" className="text-lg font-semibold text-[#110f1a]">
        {title}
      </Typography>
      <p className="mt-2 text-sm text-gray-500">{description}</p>
    </section>
  )
}

function SideRail() {
  return (
    <aside className="hidden w-full max-w-[280px] xl:block">
      <div className="sticky top-6 space-y-4">
        <section className="rounded-3xl border border-white/70 bg-white p-4 shadow-sm">
          <Typography variant="h3" className="mb-4 text-base font-bold text-[#110f1a]">
            회원님을 위한 추천
          </Typography>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((index) => (
              <div
                key={index}
                className="flex animate-pulse items-center gap-3 rounded-2xl border border-gray-100 p-3"
              >
                <div className="h-8 w-8 rounded-full bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 rounded-full bg-gray-200" />
                  <div className="h-3 w-1/2 rounded-full bg-gray-100" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </aside>
  )
}

const findCommentById = (comments: FeedComment[], id: string | null): FeedComment | null => {
  if (!id) return null
  for (const comment of comments) {
    if (comment.id === id) return comment
    if (comment.replies?.length) {
      const nested = findCommentById(comment.replies, id)
      if (nested) return nested
    }
  }
  return null
}

interface CommentListProps {
  comments: FeedComment[]
  onReply?: (commentId: string | null) => void
  replyingToId?: string | null
  level?: number
  collapsedReplies?: Record<string, boolean>
  onToggleReplies?: (commentId: string) => void
  /** 게시글 작성자 member_code (내 피드이면 현재 사용자와 동일) */
  postAuthorMemberCode?: string | null
  /** 현재 로그인한 사용자 ID */
  currentUserId?: string | null
  /** 현재 로그인한 사용자 member_code */
  currentUserMemberCode?: string | null
  /** 댓글 삭제 핸들러 */
  onDeleteComment?: (commentId: string) => void
  /** 로그인 필요 시 호출되는 핸들러 (웹 전용) */
  onRequireLogin?: () => void
  /** 댓글 신고 핸들러 */
  onReportComment?: (commentId: string, commentUser: string) => void
  /** 사용자 차단 핸들러 */
  onBlockUser?: (userMemberCode: string, userName: string) => void
}

/** 피드 스켈레톤 UI */
function FeedSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2, 3].map((i) => (
        <article key={i} className="space-y-4">
          <header className="flex items-start gap-4">
            <div className="flex flex-1 items-start gap-4">
              <div className="h-8 w-8 animate-pulse rounded-full bg-gray-200" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
                <div className="flex items-center gap-2">
                  <div className="h-3 w-16 animate-pulse rounded bg-gray-200" />
                  <div className="h-3 w-1 animate-pulse rounded bg-gray-200" />
                  <div className="h-3 w-12 animate-pulse rounded bg-gray-200" />
                </div>
              </div>
            </div>
            <div className="h-6 w-20 animate-pulse rounded-full bg-gray-200" />
          </header>
          <div className="space-y-2">
            <div className="h-4 w-full animate-pulse rounded bg-gray-200" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
          </div>
          <div className="aspect-[4/3] w-full animate-pulse rounded-2xl bg-gray-200" />
          <div className="flex items-center gap-4">
            <div className="h-5 w-12 animate-pulse rounded bg-gray-200" />
            <div className="h-5 w-12 animate-pulse rounded bg-gray-200" />
            <div className="h-5 w-8 animate-pulse rounded bg-gray-200" />
          </div>
        </article>
      ))}
    </div>
  )
}

/** 미디어 캐러셀 + 쓰레드 스타일 레이아웃 */

export interface FeedMediaCarouselProps {
  media?: Array<FeedMedia>
  variant?: 'feed' | 'modal'
  onMediaClick?: (payload: {
    media: FeedMedia
    index: number
    mediaList: Array<FeedMedia>
  }) => void
  isSubscribersOnly?: boolean
  pointPrice?: number
  isPurchased?: boolean
  /** 잠금 뱃지 영역 클릭 시 호출되는 콜백 */
  onLockedClick?: () => void
  /** 워터마크용 멤버 코드 */
  memberCode?: string | null
  /** 묶음 판매 여부 */
  isBundle?: boolean
  /** 할인율 (0-100) */
  discountRate?: number
  /** 구매한 미디어 인덱스 (개별 판매인 경우) */
  purchasedMediaOrder?: number | null
  /** 개별 미디어 구매 클릭 시 호출되는 콜백 */
  onMediaPurchaseClick?: (index: number) => void
  /** 멤버십 가입 클릭 시 호출되는 콜백 (post 레벨) */
  onMembershipClick?: () => void
  /** post 레벨 가격 (일괄 구매용) */
  postPointPrice?: number
  /** post 레벨 구독자 전용 여부 */
  postIsSubscribersOnly?: boolean
  /** 개별 미디어 멤버십 클릭 시 호출되는 콜백 */
  onMediaMembershipClick?: (membershipId: string, index: number) => void
  /** 각 콘텐츠 위 멤버십 뱃지 클릭 시 - 해당 파일의 membership_id 전달 (없으면 undefined, 해당 멤버십 정보만 시트에 표시) */
  onMembershipBadgeClick?: (membershipId?: string | null) => void
}

export function FeedMediaCarousel({
  media,
  variant = 'feed',
  onMediaClick,
  isSubscribersOnly = false,
  pointPrice,
  isPurchased = false,
  onLockedClick,
  memberCode,
  isBundle = false,
  discountRate = 0,
  purchasedMediaOrder = null,
  onMediaPurchaseClick,
  onMembershipClick,
  postPointPrice,
  postIsSubscribersOnly = false,
  onMediaMembershipClick,
  onMembershipBadgeClick,
}: FeedMediaCarouselProps) {
  const mediaList = media ?? []
  
  // 전체 미디어의 membership_id와 point_price 상태 확인
  const allMediaHaveNoMembershipId = mediaList.every(item => !item.membership_id)
  const allMediaHaveNoPointPrice = mediaList.every(item => !item.point_price || item.point_price <= 0)
  const hasPostPointPrice = postPointPrice !== undefined && postPointPrice > 0
  
  // 케이스 1: 모든 파일에 membership_id가 없고 is_subscribers_only가 true인 경우
  const shouldShowEmptyBoxForMembership = !isPurchased && postIsSubscribersOnly && allMediaHaveNoMembershipId && mediaList.length > 0
  
  // 케이스 2: post 레벨 가격이 있고 모든 미디어에 개별 가격이 없는 경우
  const shouldShowEmptyBoxForPurchase = !isPurchased && hasPostPointPrice && allMediaHaveNoPointPrice && mediaList.length > 0
  
  // media가 비어있고 뱃지가 필요한 경우 뱃지 표시
  const hasPointPrice = pointPrice !== undefined && pointPrice > 0
  if (!mediaList.length && (isSubscribersOnly || hasPointPrice) && !isPurchased) {
    return (
      <div
        className="relative flex aspect-[4/3] w-full items-center justify-center gap-1 rounded-2xl bg-gray-100 cursor-pointer"
        onClick={onLockedClick}
      >
        {isSubscribersOnly && (
          <div className="flex items-center gap-2 rounded-full bg-[#FE3A8F] px-4 py-2">
            <Star className="h-5 w-5 text-yellow-300" />
            <span className="text-sm font-semibold text-white">구독자 전용</span>
          </div>
        )}
        {hasPointPrice && (
          <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 shadow-md">
            <Heart className="h-5 w-5 fill-red-500 text-red-500" />
            <span className="text-sm font-semibold text-[#110f1a]">{pointPrice.toLocaleString()}P</span>
          </div>
        )}
      </div>
    )
  }
  
  // 케이스 1 또는 케이스 2에 해당하면 빈 박스와 버튼만 표시
  if (shouldShowEmptyBoxForMembership || shouldShowEmptyBoxForPurchase) {
    // 할인율 적용 가격 계산
    const calculateFinalPrice = (price: number | null | undefined, discount: number): number => {
      if (!price || price <= 0) return 0
      if (discount <= 0 || discount > 100) return price
      return Math.round(price * (1 - discount / 100))
    }
    
    const finalPrice = shouldShowEmptyBoxForPurchase && postPointPrice 
      ? calculateFinalPrice(postPointPrice, discountRate) 
      : 0
    
    return (
      <div className="relative flex aspect-[4/3] w-full items-center justify-center rounded-2xl bg-gray-100">
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-2xl">
          <div className="flex items-center gap-3">
            {shouldShowEmptyBoxForMembership && onMembershipClick && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onMembershipClick()
                }}
                className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-lg"
              >
                <Star className="h-5 w-5 text-yellow-500" />
                <span className="text-sm font-semibold text-[#110f1a]">멤버십 가입</span>
              </button>
            )}
            {shouldShowEmptyBoxForPurchase && onMediaPurchaseClick && finalPrice > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onMediaPurchaseClick(0)
                }}
                className="flex items-center gap-2 px-4 py-2 bg-[#FE3A8F] text-white rounded-lg"
              >
                <Heart className="h-5 w-5" />
                <span className="text-sm font-semibold">{finalPrice.toLocaleString()}P 구매</span>
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }
  
  if (!mediaList.length) return null

  const wrapperRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const dragGuardRef = useRef(false)
  const dragMovedRef = useRef(false)
  const { isMobile } = useDevice()

  const [containerWidth, setContainerWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 360,
  )
  const [trackWidth, setTrackWidth] = useState<number>(0)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState(0)
  const [videoMuted, setVideoMuted] = useState(true)
  const x = useMotionValue(0)

  // ✅ 실제 로드된 이미지/비디오의 비율 저장 (index → ratio)
  const [measuredRatios, setMeasuredRatios] = useState<Record<number, number>>({})

  // 트랙 전체 길이 측정 (드래그 한계 계산용)
  const measureTrackWidth = useCallback(() => {
    if (typeof window === 'undefined') return
    const track = trackRef.current
    if (!track) return

    requestAnimationFrame(() => {
      const children = Array.from(track.children) as HTMLElement[]
      if (!children.length) {
        setTrackWidth(0)
        return
      }

      const childrenWidth = children.reduce(
        (sum, child) => sum + child.getBoundingClientRect().width,
        0,
      )

      const computedStyle = window.getComputedStyle(track)
      const gapValue =
        parseFloat(
          computedStyle.columnGap || computedStyle.gap || computedStyle.rowGap || '0',
        ) || 0
      const totalGap = children.length > 1 ? gapValue * (children.length - 1) : 0

      setTrackWidth(childrenWidth + totalGap)
    })
  }, [])

  // ✅ index, ratio 업데이트
  const handleMeasuredRatio = useCallback((index: number, ratio: number) => {
    if (!Number.isFinite(ratio) || ratio <= 0) return
    setMeasuredRatios((prev) => {
      if (prev[index] === ratio) return prev
      const updated = { ...prev, [index]: ratio }
      // 비율이 업데이트되면 트랙 너비 재측정
      setTimeout(() => measureTrackWidth(), 100)
      return updated
    })
  }, [measureTrackWidth])

  // 1. 이미지/비디오 자체 비율 + 기존 aspectRatio + 타입별 기본값으로 "기본 비율" 계산
  const baseRatios = useMemo(
    () =>
      mediaList.map((item, index) => {
        const measured = measuredRatios[index]
        if (measured && Number.isFinite(measured)) {
          return measured
        }
        if (typeof item.aspectRatio === 'number' && Number.isFinite(item.aspectRatio)) {
          return item.aspectRatio
        }
        // 기본값: 비디오 16:9, 이미지 4:5
        return item.type === 'video' ? 16 / 9 : 4 / 5
      }),
    [mediaList, measuredRatios],
  )

  // 2. 첫 번째 콘텐츠 기준으로 가로/세로 분기 및 규격화
  const firstBaseRatio = baseRatios[0] ?? 4 / 5
  const firstIsLandscape = firstBaseRatio >= 1 // 가로가 세로보다 길면 true

  // ✅ 첫 번째 콘텐츠를 규격화 (이 비율이 전체 캐러셀의 기준 높이가 됨)
  const firstClampedRatio = clampRatio(firstBaseRatio || (firstIsLandscape ? 16 / 9 : 4 / 5))
  const layoutRatio = firstClampedRatio

  // 3. 각 콘텐츠를 독립적으로 규격 비율에 맞게 클램프
  const ratios = useMemo(
    () =>
      baseRatios.map((raw) => {
        // 각 콘텐츠의 원본 비율을 규격 비율로 개별적으로 클램프
        return clampRatio(raw || 1)
      }),
    [baseRatios],
  )

  // 4. 같은 피드 내 모든 슬라이드가 함께 줄어들도록 스케일 팩터 계산
  const scaleFactor = useMemo(() => {
    if (!containerWidth || !Number.isFinite(containerWidth) || containerWidth <= 0) return 1
    if (!ratios.length) return 1

    const BASE_LANDSCAPE_HEIGHT = 245
    const BASE_PORTRAIT_HEIGHT = 280

    // 첫 번째 콘텐츠 기준으로 모든 슬라이드의 baseHeight 통일
    const baseHeight = firstIsLandscape ? BASE_LANDSCAPE_HEIGHT : BASE_PORTRAIT_HEIGHT

    // 각 슬라이드의 기준 폭 (스케일 전) - 모두 동일한 baseHeight 사용
    const baseWidths = ratios.map((r) => {
      return baseHeight * r
    })

    const maxBaseWidth = Math.max(...baseWidths)
    if (!maxBaseWidth || !Number.isFinite(maxBaseWidth)) return 1

    // 최소 1.1개가 보이도록 → 한 슬라이드의 최대 폭은 containerWidth / 1.1
    const targetMaxWidth = containerWidth / 1.1
    const s = targetMaxWidth / maxBaseWidth

    // 1보다 크면 확대가 되므로, 최대 1로 제한 (즉, 필요할 때만 줄이기)
    return Math.min(1, s)
  }, [containerWidth, ratios, firstIsLandscape])
  
  // 컨테이너 너비 측정 (wrapperRef 대신 실제 뷰포트 너비 기반)
  useEffect(() => {
    const handleResize = () => {
      if (typeof window === 'undefined') {
        setContainerWidth(360)
        return
      }

      const viewportWidth =
        window.innerWidth ||
        document.documentElement.clientWidth ||
        360

      const wrapperWidth = wrapperRef.current?.clientWidth
      const width = wrapperWidth && wrapperWidth > 0 ? wrapperWidth : viewportWidth
      setContainerWidth(width)
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    measureTrackWidth()
  }, [measureTrackWidth, mediaList.length, containerWidth, ratios])
  
  // 이미지/비디오 로드 후에도 트랙 너비 재측정
  useEffect(() => {
    const timer = setTimeout(() => {
      measureTrackWidth()
    }, 300)
    return () => clearTimeout(timer)
  }, [measureTrackWidth, measuredRatios])

  // 미디어 리스트/폭이 바뀌면 드래그 위치 리셋
  useEffect(() => {
    x.set(0)
    setCurrentIndex(0)
  }, [mediaList, containerWidth, x])
  
  // 모달에서 PC일 때 슬라이드 네비게이션
  const handlePrev = useCallback(() => {
    if (variant === 'modal' && !isMobile && currentIndex > 0) {
      const newIndex = currentIndex - 1
      setCurrentIndex(newIndex)
      const slideWidth = containerWidth || 0
      x.set(-newIndex * slideWidth)
    }
  }, [variant, isMobile, currentIndex, containerWidth, x])
  
  const handleNext = useCallback(() => {
    if (variant === 'modal' && !isMobile && currentIndex < mediaList.length - 1) {
      const newIndex = currentIndex + 1
      setCurrentIndex(newIndex)
      const slideWidth = containerWidth || 0
      x.set(-newIndex * slideWidth)
    }
  }, [variant, isMobile, currentIndex, mediaList.length, containerWidth, x])
  
  // 드래그 종료 시 가장 가까운 슬라이드로 스냅
  const handleDragEnd = useCallback((event: any, info: { offset: { x: number }; velocity: { x: number } }) => {
    if (variant === 'modal' && !isMobile) {
      const slideWidth = containerWidth || 0
      if (slideWidth === 0) {
        setDragOffset(0)
        setTimeout(() => {
          dragGuardRef.current = false
          dragMovedRef.current = false
          setIsDragging(false)
        }, 80)
        return
      }
      
      const offsetX = info.offset.x
      const threshold = Math.max(60, slideWidth * 0.15) // 최소 60px 또는 15% 이상 드래그
      const velocity = info.velocity.x
      
      let newIndex = currentIndex
      
      // 속도가 빠르면 방향에 따라 이동
      if (Math.abs(velocity) > 500) {
        if (velocity < 0 && currentIndex < mediaList.length - 1) {
          newIndex = currentIndex + 1
        } else if (velocity > 0 && currentIndex > 0) {
          newIndex = currentIndex - 1
        }
      } else if (Math.abs(offsetX) > threshold) {
        // 드래그 거리에 따라 결정 (오른쪽으로 드래그하면 이전, 왼쪽으로 드래그하면 다음)
        if (offsetX < 0 && currentIndex < mediaList.length - 1) {
          newIndex = currentIndex + 1
        } else if (offsetX > 0 && currentIndex > 0) {
          newIndex = currentIndex - 1
        }
      }
      
      setCurrentIndex(newIndex)
      setDragOffset(0)
      x.set(-newIndex * slideWidth)
    }
    
    setTimeout(() => {
      dragGuardRef.current = false
      dragMovedRef.current = false
      setIsDragging(false)
    }, 80)
  }, [variant, isMobile, currentIndex, containerWidth, mediaList.length, x])

  // 드래그 제한 계산: 트랙 전체 너비 - 컨테이너 너비
  // 트랙이 컨테이너보다 넓을 때만 드래그 가능
  // feed variant에서는 px-4 패딩(32px)을 고려
  const paddingOffset = variant === 'feed' ? 32 : 0
  const effectiveContainerWidth = Math.max(0, (containerWidth || 0) - paddingOffset)
  const dragLimit = Math.max(0, trackWidth - effectiveContainerWidth)

  // 피드 캐러셀 스와이프시 부모 DOM 스크롤 방지
  // 수평 드래그 시작 시 수직 스크롤을 막아 캐러셀 사용성 개선
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const isHorizontalSwipeRef = useRef(false)
  
  useEffect(() => {
    const track = trackRef.current
    if (!track) return

    const handleTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0]
      if (touch) {
        touchStartRef.current = { x: touch.clientX, y: touch.clientY }
        isHorizontalSwipeRef.current = false
      }
    }

    const handleTouchMove = (event: TouchEvent) => {
      if (!touchStartRef.current) return
      const touch = event.touches[0]
      if (!touch) return
      
      const deltaX = Math.abs(touch.clientX - touchStartRef.current.x)
      const deltaY = Math.abs(touch.clientY - touchStartRef.current.y)
      
      // 수평 이동이 수직 이동보다 크면 수평 스와이프로 판단
      if (!isHorizontalSwipeRef.current && (deltaX > 8 || deltaY > 8)) {
        isHorizontalSwipeRef.current = deltaX > deltaY
      }
      
      // 수평 스와이프일 때만 기본 스크롤 방지
      if (isHorizontalSwipeRef.current) {
        event.preventDefault()
      event.stopPropagation()
      }
    }

    const handleTouchEnd = () => {
      touchStartRef.current = null
      isHorizontalSwipeRef.current = false
    }

    // passive: false로 등록하여 preventDefault 호출 가능
    track.addEventListener('touchstart', handleTouchStart, { passive: true })
    track.addEventListener('touchmove', handleTouchMove, { passive: false })
    track.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      track.removeEventListener('touchstart', handleTouchStart)
      track.removeEventListener('touchmove', handleTouchMove)
      track.removeEventListener('touchend', handleTouchEnd)
    }
  }, [variant])

  return (
    <div
      ref={wrapperRef}
      data-feed-carousel
      className={`relative ${
        variant === 'modal'
          ? 'h-full w-full overflow-hidden'
          : 'w-full mt-2 overflow-hidden'
      }`}
    >
      {variant === 'modal' && !isMobile && mediaList.length > 1 && (
        <>
          {currentIndex > 0 && (
            <button
              type="button"
              className="absolute left-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/40 p-3 text-white hover:bg-black/60 transition-colors"
              onClick={handlePrev}
              aria-label="이전 이미지"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          )}
          {currentIndex < mediaList.length - 1 && (
            <button
              type="button"
              className="absolute right-4 top-1/2 z-20 -translate-y-1/2 rounded-full bg-black/40 p-3 text-white hover:bg-black/60 transition-colors"
              onClick={handleNext}
              aria-label="다음 이미지"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          )}
        </>
      )}
      {variant === 'modal' && !isMobile ? (
        <div
          ref={trackRef}
          className="flex h-full w-full gap-0"
          style={{
            cursor: 'grab',
            userSelect: 'none',
            transform: `translate3d(${-currentIndex * (containerWidth || 0) + dragOffset}px, 0, 0)`,
            transition: isDragging ? 'none' : 'transform 0.3s ease',
          }}
          onMouseDown={(e) => {
            if (e.button !== 0) return
            e.preventDefault()
            const startX = e.clientX
            setIsDragging(true)
            setDragOffset(0)
            
            const handleMouseMove = (moveEvent: MouseEvent) => {
              const deltaX = moveEvent.clientX - startX
              setDragOffset(deltaX)
            }
            
            const handleMouseUp = (upEvent: MouseEvent) => {
              const deltaX = upEvent.clientX - startX
              const threshold = Math.max(60, (containerWidth || 0) * 0.15)
              
              let newIndex = currentIndex
              if (Math.abs(deltaX) > threshold) {
                if (deltaX < 0 && currentIndex < mediaList.length - 1) {
                  newIndex = currentIndex + 1
                } else if (deltaX > 0 && currentIndex > 0) {
                  newIndex = currentIndex - 1
                }
              }
              
              setCurrentIndex(newIndex)
              setDragOffset(0)
              setIsDragging(false)
              
              document.removeEventListener('mousemove', handleMouseMove)
              document.removeEventListener('mouseup', handleMouseUp)
            }
            
            document.addEventListener('mousemove', handleMouseMove)
            document.addEventListener('mouseup', handleMouseUp)
          }}
          onTouchStart={(e) => {
            const touch = e.touches[0]
            if (!touch) return
            const startX = touch.clientX
            setIsDragging(true)
            setDragOffset(0)
            
            const handleTouchMove = (moveEvent: TouchEvent) => {
              const touch = moveEvent.touches[0]
              if (!touch) return
              const deltaX = touch.clientX - startX
              setDragOffset(deltaX)
            }
            
            const handleTouchEnd = (endEvent: TouchEvent) => {
              const touch = endEvent.changedTouches[0]
              if (!touch) return
              const deltaX = touch.clientX - startX
              const threshold = Math.max(60, (containerWidth || 0) * 0.15)
              
              let newIndex = currentIndex
              if (Math.abs(deltaX) > threshold) {
                if (deltaX < 0 && currentIndex < mediaList.length - 1) {
                  newIndex = currentIndex + 1
                } else if (deltaX > 0 && currentIndex > 0) {
                  newIndex = currentIndex - 1
                }
              }
              
              setCurrentIndex(newIndex)
              setDragOffset(0)
              setIsDragging(false)
              
              document.removeEventListener('touchmove', handleTouchMove)
              document.removeEventListener('touchend', handleTouchEnd)
            }
            
            document.addEventListener('touchmove', handleTouchMove, { passive: false })
            document.addEventListener('touchend', handleTouchEnd)
          }}
        >
          {mediaList.map((item, index) => (
            <div
              key={`${item.src}-${index}`}
              className="flex h-full w-full flex-shrink-0 items-center justify-center overflow-hidden"
              style={{ width: containerWidth || '100%' }}
            >
              {item.type === 'image' ? (
                <img
                  src={item.src}
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                  loading="lazy"
                  decoding="async"
                  fetchPriority={index === currentIndex ? 'high' : 'low'}
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                  onDragStart={(event) => event.preventDefault()}
                />
              ) : (
                <div className="relative h-full w-full">
                  <video
                    src={item.src}
                    controls
                    autoPlay={index === currentIndex}
                    playsInline
                    loop
                    muted={videoMuted}
                    preload="metadata"
                    className="h-full w-full object-cover"
                    draggable={false}
                    onDragStart={(event) => event.preventDefault()}
                  />
                  {/* 음소거 토글 버튼 */}
                  {index === currentIndex && (
                    <button
                      type="button"
                      className="absolute right-3 bottom-14 z-30 rounded-full bg-black/60 p-2 text-white"
                      onClick={(e) => {
                        e.stopPropagation()
                        setVideoMuted(!videoMuted)
                      }}
                    >
                      {videoMuted ? (
                        <VolumeX className="h-5 w-5" />
                      ) : (
                        <Volume2 className="h-5 w-5" />
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <motion.div
          ref={trackRef}
          className={`flex ${
            isMobile && variant === 'feed' ? 'gap-2' : 'gap-3'
          } ${variant === 'modal' ? 'w-full' : ''}`}
          style={{
            cursor: 'grab',
            userSelect: 'none',
            x,
          }}
          drag="x"
          dragConstraints={{ left: -dragLimit, right: 0 }}
          dragElastic={0.2}
          dragMomentum={true}
          dragTransition={{ 
            bounceStiffness: 100, 
            bounceDamping: 10,
            power: 0.8,
            timeConstant: 700,
          }}
          whileTap={{ cursor: 'grabbing' }}
          onDragStart={() => {
            dragGuardRef.current = false
            dragMovedRef.current = false
          }}
          onDrag={(_, info) => {
            if (dragMovedRef.current) return
            if (Math.abs(info.offset.x) > 12) {
              dragMovedRef.current = true
              dragGuardRef.current = true
            }
          }}
          onDragEnd={() => {
            setTimeout(() => {
              dragGuardRef.current = false
              dragMovedRef.current = false
            }, 80)
          }}
        >
          {(() => {
            // 전체 미디어의 membership_id와 point_price 상태 확인
            const allMediaHaveNoMembershipId = mediaList.every(item => !item.membership_id)
            const allMediaHaveNoPointPrice = mediaList.every(item => !item.point_price || item.point_price <= 0)
            const hasPostPointPrice = postPointPrice !== undefined && postPointPrice > 0
            
            return mediaList.map((item, index) => {
              // signed_url이 있으면 무조건 표시
              const isLockedMedia = !item.signed_url
              const isPurchasedMedia = purchasedMediaOrder != null && index <= purchasedMediaOrder
              const hasMediaPointPrice = item.point_price != null && item.point_price > 0
              const hasMediaMembershipId = item.membership_id != null
              
              // 구매 버튼 표시 조건:
              // 1. post 레벨 가격이 있고 모든 미디어에 개별 가격이 없으면 post 레벨 가격으로 구매 버튼 표시
              // 2. post 레벨 가격이 없고 media 레벨 가격이 있을 때만 개별 구매 버튼 표시
              const showPostPurchaseBtn = isLockedMedia && !isPurchasedMedia && hasPostPointPrice && allMediaHaveNoPointPrice && onMediaPurchaseClick
              const showMediaPurchaseBtn = isLockedMedia && !isPurchasedMedia && !hasPostPointPrice && hasMediaPointPrice && onMediaPurchaseClick
              
              // 멤버십 버튼 표시 조건:
              // 1. post.is_subscribers_only가 true이고 모든 미디어에 membership_id가 없으면, 첫 번째 미디어에만 멤버쉽 버튼 표시
              // 2. 미디어에 membership_id가 있으면 해당 미디어에 멤버쉽 버튼 표시 (is_subscribers_only 여부 무관)
              const showPostMembershipBtn = isLockedMedia && !isPurchasedMedia && postIsSubscribersOnly && allMediaHaveNoMembershipId && index === 0 && onMembershipClick
              const showMediaMembershipBtn = isLockedMedia && !isPurchasedMedia && hasMediaMembershipId && onMediaMembershipClick
              const showMembershipBadge = (hasMediaMembershipId || (postIsSubscribersOnly && allMediaHaveNoMembershipId && index === 0)) && !!onMembershipBadgeClick
              
              return (
                <MediaSlide
                  key={`${item.src}-${index}`}
                  media={item}
                  mediaList={mediaList}
                  index={index}
                  ratio={ratios[index] ?? 1}
                  layoutRatio={layoutRatio}
                  scaleFactor={scaleFactor}
                  variant={variant}
                  onMediaClick={onMediaClick}
                  dragGuardRef={variant === 'feed' ? dragGuardRef : undefined}
                  containerWidth={containerWidth}
                  onMeasureRatio={handleMeasuredRatio}
                  memberCode={memberCode}
                  firstIsLandscape={firstIsLandscape}
                  isLocked={isLockedMedia && !isPurchasedMedia}
                  pointPrice={showPostPurchaseBtn ? postPointPrice : item.point_price}
                  membershipId={item.membership_id}
                  discountRate={discountRate}
                  onPurchaseClick={showPostPurchaseBtn || showMediaPurchaseBtn ? () => {
                    if (showPostPurchaseBtn && onMediaPurchaseClick) {
                      // post 레벨 구매는 첫 번째 미디어 인덱스로 호출 (실제로는 전체 구매)
                      onMediaPurchaseClick(0)
                    } else if (showMediaPurchaseBtn && onMediaPurchaseClick) {
                      onMediaPurchaseClick(index)
                    }
                  } : undefined}
                  onMembershipClick={showPostMembershipBtn ? onMembershipClick : undefined}
                  onMediaMembershipClick={showMediaMembershipBtn ? () => onMediaMembershipClick(item.membership_id!, index) : undefined}
                  showMembershipBadge={showMembershipBadge}
                  onMembershipBadgeClick={onMembershipBadgeClick ? () => onMembershipBadgeClick(item.membership_id ?? null) : undefined}
                />
              )
            })
          })()}
        </motion.div>
      )}
    </div>
  )
}

interface AutoPlayVideoProps {
  src: string
  className?: string
  onLoadedMetadata?: (event: SyntheticEvent<HTMLVideoElement>) => void
}

function AutoPlayVideo({ src, className, onLoadedMetadata }: AutoPlayVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [isMuted, setIsMuted] = useState(true)
  const [isInView, setIsInView] = useState(false)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') {
      setIsInView(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        setIsInView(entries[0]?.isIntersecting ?? false)
      },
      { threshold: 0.6 },
    )
    observer.observe(video)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (isInView) {
      const playPromise = video.play()
      if (playPromise?.catch) {
        playPromise.catch(() => {})
      }
    } else {
      video.pause()
    }
  }, [isInView])

  useEffect(() => {
    const video = videoRef.current
    if (video) {
      video.muted = isMuted
    }
  }, [isMuted])

  const handleToggleMute = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    event.preventDefault()
    setIsMuted((prev) => !prev)
  }

  return (
    <div className="relative h-full w-full">
      <video
        ref={videoRef}
        src={src}
        className={className}
        loop
        playsInline
        preload="metadata"
        muted={isMuted}
        onLoadedMetadata={onLoadedMetadata}
        draggable={false}
        onDragStart={(event) => event.preventDefault()}
      />
      <button
        type="button"
        onClick={handleToggleMute}
        className="absolute bottom-3 right-3 text-white drop-shadow"
        aria-label={isMuted ? '사운드 켜기' : '사운드 끄기'}
        aria-pressed={!isMuted}
      >
        {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
      </button>
    </div>
  )
}

interface MediaSlideProps {
  media: FeedMedia
  mediaList: Array<FeedMedia>
  index: number
  ratio: number
  layoutRatio: number
  scaleFactor?: number
  variant: 'feed' | 'modal'
  onMediaClick?: (payload: {
    media: FeedMedia
    index: number
    mediaList: Array<FeedMedia>
  }) => void
  dragGuardRef?: MutableRefObject<boolean>
  containerWidth?: number
  onMeasureRatio?: (index: number, ratio: number) => void
  firstIsLandscape?: boolean
  memberCode?: string | null
  isLocked?: boolean
  pointPrice?: number | null
  membershipId?: string | null
  discountRate?: number
  onPurchaseClick?: () => void
  onMembershipClick?: () => void
  onMediaMembershipClick?: () => void
  showMembershipBadge?: boolean
  onMembershipBadgeClick?: () => void
}


function MediaSlide({
  media,
  mediaList,
  index,
  ratio,
  layoutRatio,
  scaleFactor,
  variant,
  onMediaClick,
  dragGuardRef,
  containerWidth,
  onMeasureRatio,
  memberCode,
  firstIsLandscape,
  isLocked = false,
  pointPrice,
  membershipId,
  discountRate = 0,
  onPurchaseClick,
  onMembershipClick,
  onMediaMembershipClick,
  showMembershipBadge = false,
  onMembershipBadgeClick,
}: MediaSlideProps) {
  // 피드와 모달 모두 컨테이너를 꽉 채우도록 설정
  const baseMediaClasses =
    variant === 'feed'
      ? 'h-full w-full rounded-3xl object-cover' // 피드 리스트에서는 꽉 차게
      : 'h-full w-full object-cover' // 모달에서도 꽉 차게

  // 유효한 memberCode 체크
  const validMemberCode = memberCode && memberCode !== 'unknown' && memberCode !== 'undefined' ? memberCode : null
  
  // CSS 워터마크 오버레이 (피드 리스트에서만 표시, 모달에서는 MediaPreview에서 처리)
  const WatermarkOverlay = validMemberCode && variant === 'feed' ? (
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
            @{validMemberCode}
          </span>
        ))}
      </div>
    </div>
  ) : null

  // 할인율 적용 가격 계산
  const calculateFinalPrice = (price: number | null | undefined, discount: number): number => {
    if (!price || price <= 0) return 0
    if (discount <= 0 || discount > 100) return price
    return Math.round(price * (1 - discount / 100))
  }

  const finalPrice = pointPrice != null && pointPrice > 0 ? calculateFinalPrice(pointPrice, discountRate) : 0
  const hasDiscount = discountRate > 0 && discountRate <= 100 && pointPrice != null && pointPrice > 0

  const mediaElement =
    media.type === 'image' ? (
      <div className="relative w-full h-full">
      <img
        src={media.src || '/placeholder.png'} // 미구매 미디어는 placeholder 사용
        alt=""
        className={`${baseMediaClasses} ${isLocked ? 'blur-md' : ''}`}
        draggable={false}
        loading="lazy"
        decoding="async"
        fetchPriority={index === 0 ? 'high' : 'low'}
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        onDragStart={(event) => event.preventDefault()}
          onContextMenu={(event) => event.preventDefault()}
        onLoad={(event) => {
          const img = event.currentTarget
          if (onMeasureRatio && img.naturalWidth && img.naturalHeight) {
            onMeasureRatio(index, img.naturalWidth / img.naturalHeight)
          }
        }}
      />
        {WatermarkOverlay}
        {showMembershipBadge && onMembershipBadgeClick && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMembershipBadgeClick() }}
            className="absolute top-2 right-2 z-20 flex items-center gap-1 px-2 py-1 rounded-full bg-black/50 text-white text-xs font-medium hover:bg-black/60 transition-colors"
          >
            <Star className="h-3.5 w-3.5" />
            <span>멤버십</span>
          </button>
        )}
        {isLocked && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-3xl">
            <div className="flex flex-col items-center gap-3">
              {onMembershipClick && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onMembershipClick()
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-lg"
                >
                  <Star className="h-5 w-5 text-yellow-500" />
                  <span className="text-sm font-semibold text-[#110f1a]">멤버십 가입</span>
                </button>
              )}
              {onMediaMembershipClick && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onMediaMembershipClick()
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-lg"
                >
                  <Star className="h-5 w-5 text-yellow-500" />
                  <span className="text-sm font-semibold text-[#110f1a]">멤버십 가입</span>
                </button>
              )}
              {onPurchaseClick && finalPrice > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onPurchaseClick()
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-[#FE3A8F] text-white rounded-lg"
                >
                  <Heart className="h-5 w-5" />
                  <span className="text-sm font-semibold">{finalPrice.toLocaleString()}P 구매</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    ) : variant === 'feed' ? (
      <div className="relative w-full h-full">
      <AutoPlayVideo
        src={media.src || ''}
        className={`${baseMediaClasses} ${isLocked ? 'blur-md' : ''}`}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget
          if (onMeasureRatio && video.videoWidth && video.videoHeight) {
            onMeasureRatio(index, video.videoWidth / video.videoHeight)
          }
        }}
      />
        {WatermarkOverlay}
        {showMembershipBadge && onMembershipBadgeClick && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMembershipBadgeClick() }}
            className="absolute top-2 right-2 z-20 flex items-center gap-1 px-2 py-1 rounded-full bg-black/50 text-white text-xs font-medium hover:bg-black/60 transition-colors"
          >
            <Star className="h-3.5 w-3.5" />
            <span>멤버십</span>
          </button>
        )}
        {isLocked && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-3xl">
            <div className="flex flex-col items-center gap-3">
              {onMembershipClick && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onMembershipClick()
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-lg"
                >
                  <Star className="h-5 w-5 text-yellow-500" />
                  <span className="text-sm font-semibold text-[#110f1a]">멤버십 가입</span>
                </button>
              )}
              {onMediaMembershipClick && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onMediaMembershipClick()
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-lg"
                >
                  <Star className="h-5 w-5 text-yellow-500" />
                  <span className="text-sm font-semibold text-[#110f1a]">멤버십 가입</span>
                </button>
              )}
              {onPurchaseClick && finalPrice > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onPurchaseClick()
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-[#FE3A8F] text-white rounded-lg"
                >
                  <Heart className="h-5 w-5" />
                  <span className="text-sm font-semibold">{finalPrice.toLocaleString()}P 구매</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    ) : (
      <div className="relative w-full h-full">
      <video
        src={media.src || ''}
        controls
        playsInline
        loop
        preload="metadata"
        className={`${baseMediaClasses} ${isLocked ? 'blur-md' : ''}`}
        draggable={false}
        onDragStart={(event) => event.preventDefault()}
          onContextMenu={(event) => event.preventDefault()}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget
          if (onMeasureRatio && video.videoWidth && video.videoHeight) {
            onMeasureRatio(index, video.videoWidth / video.videoHeight)
          }
        }}
      />
        {WatermarkOverlay}
        {showMembershipBadge && onMembershipBadgeClick && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onMembershipBadgeClick() }}
            className="absolute top-2 right-2 z-20 flex items-center gap-1 px-2 py-1 rounded-full bg-black/50 text-white text-xs font-medium hover:bg-black/60 transition-colors"
          >
            <Star className="h-3.5 w-3.5" />
            <span>멤버십</span>
          </button>
        )}
        {isLocked && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-3xl">
            <div className="flex flex-col items-center gap-3">
              {onMembershipClick && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onMembershipClick()
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-lg"
                >
                  <Star className="h-5 w-5 text-yellow-500" />
                  <span className="text-sm font-semibold text-[#110f1a]">멤버십 가입</span>
                </button>
              )}
              {onMediaMembershipClick && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onMediaMembershipClick()
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-lg"
                >
                  <Star className="h-5 w-5 text-yellow-500" />
                  <span className="text-sm font-semibold text-[#110f1a]">멤버십 가입</span>
                </button>
              )}
              {onPurchaseClick && finalPrice > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onPurchaseClick()
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-[#FE3A8F] text-white rounded-lg"
                >
                  <Heart className="h-5 w-5" />
                  <span className="text-sm font-semibold">{finalPrice.toLocaleString()}P 구매</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    )

  const content =
    variant === 'feed' && onMediaClick ? (
      <div
        role="button"
        tabIndex={0}
        className="flex h-full w-full items-center justify-center overflow-hidden focus:outline-none"
        onClick={() => {
          if (dragGuardRef?.current) return
          onMediaClick({ media, index, mediaList })
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onMediaClick({ media, index, mediaList })
          }
        }}
        onDragStart={(event) => event.preventDefault()}
      >
        <div className="h-full w-full flex items-center justify-center">
          {mediaElement}
        </div>
      </div>
    ) : (
      mediaElement
    )

  // ---- 카드 크기 / 비율 계산 ----
  // 개별 콘텐츠의 실제 비율을 측정한 뒤, 요구한 규격 비율로 클램프
  const rawRatio = ratio || layoutRatio || 1
  const clampedRatio = clampRatio(rawRatio)

  // ✅ feed: 슬라이드 하나가 항상 컨테이너 폭 100%를 차지
  if (variant === 'feed') {
    const s = typeof scaleFactor === 'number' ? scaleFactor : 1
    // 첫 번째 콘텐츠 기준으로 모든 슬라이드의 최대 높이 결정
    const useFirstLandscape = firstIsLandscape !== undefined ? firstIsLandscape : clampedRatio >= 1
    // 가로/세로 기준 높이 (첫 번째 콘텐츠 기준으로 통일)
    const baseHeight = useFirstLandscape ? 245 : 280
    const height = baseHeight * s
    const width = height * clampedRatio

    return (
      <div
        className="flex flex-shrink-0 snap-start overflow-hidden rounded-sm"
        style={{
          flex: '0 0 auto',
          height,
          width,
        }}
        draggable={false}
      >
        <div className="h-full w-full flex items-center justify-center">
          {content}
        </div>
      </div>
    )
  }

  // ✅ modal 등 나머지 variant: 전체 높이를 차지하도록 설정
  return (
    <div
      className="flex flex-shrink-0 snap-start overflow-hidden"
      style={{
        flex: '0 0 auto',
        width: '100%',
        maxWidth: '100%',
        height: '100%',
      }}
      draggable={false}
    >
      <div className="h-full w-full flex items-center justify-center">
        {content}
      </div>
    </div>
  )
  }

interface MediaPreviewProps {
  items: Array<FeedMedia>
  initialIndex: number
  onClose: () => void
  postId?: string
  isLiked?: boolean
  likeCount?: number
  commentCount?: number
  onToggleLike?: (postId: string) => void
  onOpenComments?: (postId: string) => void
  memberCode?: string | null
}

export function MediaPreview({
  items,
  initialIndex,
  onClose,
  postId,
  isLiked = false,
  likeCount = 0,
  commentCount = 0,
  onToggleLike,
  onOpenComments,
  memberCode,
}: MediaPreviewProps) {
  // 유효한 memberCode만 사용 (unknown, undefined 제외)
  const validMemberCode = memberCode && memberCode !== 'unknown' && memberCode !== 'undefined' ? memberCode : null
  
  const [currentIndex, setCurrentIndex] = useState(() =>
    Math.min(initialIndex, Math.max(items.length - 1, 0)),
  )
  
  // CSS 워터마크 오버레이 (전체화면용)
  const PreviewWatermarkOverlay = validMemberCode ? (
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
            @{validMemberCode}
          </span>
        ))}
      </div>
    </div>
  ) : null
  const containerRef = useRef<HTMLDivElement>(null)
  const swipeStartRef = useRef<number | null>(null)
  const [dragOffset, setDragOffset] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [containerWidth, setContainerWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 360,
  )
  const [showControls, setShowControls] = useState(true)
  const [heartBurst, setHeartBurst] = useState(false)
  const heartTimeoutRef = useRef<number | null>(null)
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null)
  
  // 전체화면 열기 애니메이션 상태
  const [isEntering, setIsEntering] = useState(true)
  
  // 슬라이드 다운/업 닫기 관련 상태
  const [verticalDragOffset, setVerticalDragOffset] = useState(0)
  const [isVerticalDragging, setIsVerticalDragging] = useState(false)
  const verticalSwipeStartRef = useRef<{ x: number; y: number } | null>(null)
  const swipeDirectionRef = useRef<'horizontal' | 'vertical' | null>(null)
  
  // 핀치 줌 관련 상태
  const [scale, setScale] = useState(1)
  const [translateX, setTranslateX] = useState(0)
  const [translateY, setTranslateY] = useState(0)
  const initialPinchDistanceRef = useRef<number | null>(null)
  const initialScaleRef = useRef(1)
  const isPinchingRef = useRef(false)
  const lastPinchCenterRef = useRef<{ x: number; y: number } | null>(null)
  
  // 열기 애니메이션 - 마운트 후 바로 실행
  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      setIsEntering(false)
    })
    return () => cancelAnimationFrame(timer)
  }, [])
  
  // 동영상 관련 상태
  const [videoMuted, setVideoMuted] = useState(true)
  const [videoProgress, setVideoProgress] = useState(0)
  const [videoDuration, setVideoDuration] = useState(0)
  const [isLongPressing, setIsLongPressing] = useState(false)
  const [isSeeking, setIsSeeking] = useState(false)
  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({})
  const longPressTimerRef = useRef<number | null>(null)
  const wasPlayingBeforeLongPressRef = useRef(false)

  useEffect(() => {
    return () => {
      if (heartTimeoutRef.current) {
        window.clearTimeout(heartTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  useEffect(() => {
    if (!items.length) return
    setCurrentIndex(Math.min(initialIndex, items.length - 1))
  }, [initialIndex, items])

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev))
  }, [])

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) =>
      prev < items.length - 1 ? prev + 1 : prev,
    )
  }, [items.length])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        handlePrev()
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        handleNext()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleNext, handlePrev, onClose])

  useEffect(() => {
    const measure = () => {
      const width =
        containerRef.current?.clientWidth ??
        (typeof window !== 'undefined' ? window.innerWidth : 360)
      setContainerWidth(width)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const slideGap = 48
  const slideWidth = containerWidth || 0
  const totalSlideWidth = slideWidth + slideGap

  // 핀치 줌 거리 계산
  const getPinchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return null
    const dx = touches[0].clientX - touches[1].clientX
    const dy = touches[0].clientY - touches[1].clientY
    return Math.hypot(dx, dy)
  }
  
  // 핀치 줌 중심점 계산
  const getPinchCenter = (touches: React.TouchList) => {
    if (touches.length < 2) return null
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2,
    }
  }
  
  // 줌 리셋
  const resetZoom = useCallback(() => {
    setScale(1)
    setTranslateX(0)
    setTranslateY(0)
  }, [])
  
  // 슬라이드 변경 시 줌 리셋
  useEffect(() => {
    resetZoom()
  }, [currentIndex, resetZoom])

  const beginSwipe = (clientX: number | null, clientY: number | null) => {
    if (clientX == null || clientY == null) return
    // 줌 상태일 때는 스와이프 무시
    if (scale > 1) return
    swipeStartRef.current = clientX
    verticalSwipeStartRef.current = { x: clientX, y: clientY }
    swipeDirectionRef.current = null
    setIsDragging(true)
    setIsVerticalDragging(true)
    setDragOffset(0)
    setVerticalDragOffset(0)
  }

  const moveSwipe = (clientX: number | null, clientY: number | null) => {
    if (!isDragging || swipeStartRef.current == null || clientX == null) return
    if (!verticalSwipeStartRef.current || clientY == null) return
    
    // 줌 상태일 때는 스와이프 무시
    if (scale > 1) return
    
    const deltaX = clientX - swipeStartRef.current
    const deltaY = clientY - verticalSwipeStartRef.current.y
    
    // 스와이프 방향 결정 (아직 결정되지 않은 경우)
    if (!swipeDirectionRef.current && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
      swipeDirectionRef.current = Math.abs(deltaX) > Math.abs(deltaY) ? 'horizontal' : 'vertical'
    }
    
    if (swipeDirectionRef.current === 'horizontal') {
      setDragOffset(deltaX)
      setVerticalDragOffset(0)
    } else if (swipeDirectionRef.current === 'vertical') {
      // 위/아래 모두 드래그 허용 (닫기 제스처)
      setVerticalDragOffset(deltaY)
      setDragOffset(0)
    }
  }

  const endSwipe = (clientX: number | null, clientY: number | null) => {
    // 줌 상태일 때는 스와이프 무시
    if (scale > 1) {
      swipeStartRef.current = null
      verticalSwipeStartRef.current = null
      swipeDirectionRef.current = null
      setIsDragging(false)
      setIsVerticalDragging(false)
      setDragOffset(0)
      setVerticalDragOffset(0)
      return
    }
    
    if (!isDragging || swipeStartRef.current == null) {
      swipeStartRef.current = null
      verticalSwipeStartRef.current = null
      swipeDirectionRef.current = null
      setIsDragging(false)
      setIsVerticalDragging(false)
      setDragOffset(0)
      setVerticalDragOffset(0)
      return
    }
    
    const deltaX = clientX != null ? clientX - swipeStartRef.current : dragOffset
    const deltaY = verticalSwipeStartRef.current && clientY != null 
      ? clientY - verticalSwipeStartRef.current.y 
      : verticalDragOffset
    const threshold = Math.max(60, (containerWidth || 0) * 0.15)
    const verticalThreshold = 100 // 수직 드래그 임계값 (위/아래 모두)
    
    if (swipeDirectionRef.current === 'horizontal' && Math.abs(deltaX) > threshold) {
      if (deltaX > 0) {
        handlePrev()
      } else {
        handleNext()
      }
    } else if (swipeDirectionRef.current === 'vertical' && Math.abs(deltaY) > verticalThreshold) {
      // 위 또는 아래로 충분히 드래그하면 닫기
      onClose()
      return
    }
    
    swipeStartRef.current = null
    verticalSwipeStartRef.current = null
    swipeDirectionRef.current = null
    setIsDragging(false)
    setIsVerticalDragging(false)
    setDragOffset(0)
    setVerticalDragOffset(0)
  }

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    // 핀치 줌 시작
    if (event.touches.length === 2) {
      // 핀치 중 슬라이드 이동 방지
      event.preventDefault()
      event.stopPropagation()
      const distance = getPinchDistance(event.touches)
      const center = getPinchCenter(event.touches)
      if (distance && center) {
        initialPinchDistanceRef.current = distance
        initialScaleRef.current = scale
        lastPinchCenterRef.current = center
        isPinchingRef.current = true
        // 핀치 시작시 스와이프 상태 초기화
        setIsDragging(false)
        setIsVerticalDragging(false)
        setDragOffset(0)
        setVerticalDragOffset(0)
        swipeStartRef.current = null
        verticalSwipeStartRef.current = null
        swipeDirectionRef.current = null
      }
      return
    }
    
    // 핀치 중이면 단일 터치 무시
    if (isPinchingRef.current) return
    
    const touch = event.touches[0]
    if (touch) {
      beginSwipe(touch.clientX, touch.clientY)
    }
  }

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    // 핀치 줌 중
    if (event.touches.length === 2 && isPinchingRef.current && initialPinchDistanceRef.current) {
      // 핀치 중 슬라이드 이동 방지
      event.preventDefault()
      event.stopPropagation()
      const distance = getPinchDistance(event.touches)
      const center = getPinchCenter(event.touches)
      if (distance && center) {
        const newScale = Math.min(4, Math.max(1, initialScaleRef.current * (distance / initialPinchDistanceRef.current)))
        setScale(newScale)
        
        // 줌 상태에서 패닝
        if (newScale > 1 && lastPinchCenterRef.current) {
          const deltaX = center.x - lastPinchCenterRef.current.x
          const deltaY = center.y - lastPinchCenterRef.current.y
          setTranslateX(prev => prev + deltaX)
          setTranslateY(prev => prev + deltaY)
          lastPinchCenterRef.current = center
        }
      }
      return
    }
    
    // 핀치 중이면 단일 터치 무시
    if (isPinchingRef.current) return
    
    const touch = event.touches[0]
    if (touch) {
      moveSwipe(touch.clientX, touch.clientY)
    }
  }

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    // 핀치 줌 종료 - 손가락 놓으면 원래 크기로 복귀
    if (isPinchingRef.current) {
      event.preventDefault()
      event.stopPropagation()
      isPinchingRef.current = false
      initialPinchDistanceRef.current = null
      lastPinchCenterRef.current = null
      // 손가락 놓으면 항상 원래 크기로 복귀
      resetZoom()
      return
    }
    
    const touchPoint = event.changedTouches[0]
    const wasDragging = isDragging
    endSwipe(touchPoint?.clientX ?? null, touchPoint?.clientY ?? null)
    if (wasDragging && swipeDirectionRef.current) return

    const touch = event.changedTouches[0]
    if (!touch) return
    const now = Date.now()
    const lastTap = lastTapRef.current
    if (lastTap && now - lastTap.time < 300) {
      const dx = touch.clientX - lastTap.x
      const dy = touch.clientY - lastTap.y
      if (Math.hypot(dx, dy) < 20) {
        // 더블탭으로 좋아요
        performLikeGesture()
        lastTapRef.current = null
        return
      }
    }
    lastTapRef.current = { time: now, x: touch.clientX, y: touch.clientY }
  }

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    beginSwipe(event.clientX, event.clientY)
  }

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return
    moveSwipe(event.clientX, event.clientY)
  }

  const handleMouseUp = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return
    endSwipe(event.clientX, event.clientY)
  }

  const handleMouseLeave = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging) return
    endSwipe(event.clientX, event.clientY)
  }

  const handleContainerClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation()
    if (event.detail > 1) return
    setShowControls((prev) => !prev)
  }

  const triggerHeartBurst = () => {
    if (heartTimeoutRef.current) {
      window.clearTimeout(heartTimeoutRef.current)
    }
    setHeartBurst(true)
    heartTimeoutRef.current = window.setTimeout(() => {
      setHeartBurst(false)
    }, 650)
  }

  const performLikeGesture = () => {
    if (postId && !isLiked) {
      onToggleLike?.(postId)
    }
    triggerHeartBurst()
  }

  const handleDoubleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.stopPropagation()
    performLikeGesture()
  }

  const handleLikeButton = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (!postId) return
    onToggleLike?.(postId)
  }

  const handleCommentButton = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (!postId) return
    onOpenComments?.(postId)
  }

  const controlsVisibilityClass = `transition-opacity duration-200 ${
    showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
  }`
  const formattedLikeCount =
    typeof likeCount === 'number' ? likeCount.toLocaleString() : likeCount ?? '0'
  const formattedCommentCount =
    typeof commentCount === 'number' ? commentCount.toLocaleString() : commentCount ?? '0'
  const canShowActions = Boolean(postId && (onToggleLike || onOpenComments))

  // 슬라이드 위/아래 드래그 투명도 및 스케일 계산
  const verticalDragOpacity = Math.max(0, 1 - Math.abs(verticalDragOffset) / 300)
  const verticalDragScale = Math.max(0.85, 1 - Math.abs(verticalDragOffset) / 800)
  
  // 열기 애니메이션 스케일
  const enterScale = isEntering ? 0.9 : 1
  const enterOpacity = isEntering ? 0 : 1

  return (
    <div
      className="fixed inset-0 z-[99999]"
      style={{
        backgroundColor: `rgba(0, 0, 0, ${1 * verticalDragOpacity * enterOpacity})`,
        transition: isVerticalDragging ? 'none' : 'background-color 0.25s ease-out',
      }}
      onClick={onClose}
      onWheel={(event) => {
        // 줌 상태에서 스크롤로 줌 조절
        if (scale > 1) {
          event.preventDefault()
          const delta = event.deltaY > 0 ? -0.1 : 0.1
          const newScale = Math.min(4, Math.max(1, scale + delta))
          setScale(newScale)
          if (newScale <= 1) {
            resetZoom()
          }
        } else {
        event.preventDefault()
        event.stopPropagation()
        }
      }}
      onTouchMove={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
    >
      {/* 컨트롤 버튼들 - 720px 범위 내에 배치 */}
      <div className="absolute inset-0 flex justify-center pointer-events-none z-20">
        <div className="relative w-full" style={{ maxWidth: '720px' }}>
          <button
            type="button"
            className={`pointer-events-auto absolute right-4 rounded-full bg-black/70 p-2 text-white cursor-pointer ${controlsVisibilityClass}`}
            style={{
              top: Capacitor.isNativePlatform() 
                ? 'calc(1rem + env(safe-area-inset-top, 0px))' 
                : '1rem',
              opacity: verticalDragOpacity * enterOpacity,
              transition: isVerticalDragging ? 'none' : 'opacity 0.25s ease-out',
            }}
            onClick={(event) => {
              event.stopPropagation()
              onClose()
            }}
            aria-label="미디어 닫기"
          >
            <X className="h-5 w-5" />
          </button>

          {items.length > 1 && currentIndex > 0 ? (
            <button
              type="button"
              className={`pointer-events-auto absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-3 text-white ${controlsVisibilityClass}`}
              onClick={(event) => {
                event.stopPropagation()
                handlePrev()
              }}
              aria-label="이전 콘텐츠"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          ) : null}

          {items.length > 1 && currentIndex < items.length - 1 ? (
            <button
              type="button"
              className={`pointer-events-auto absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-3 text-white cursor-pointer ${controlsVisibilityClass}`}
              onClick={(event) => {
                event.stopPropagation()
                handleNext()
              }}
              aria-label="다음 콘텐츠"
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          ) : null}
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex h-full w-full items-center justify-center overflow-hidden z-[99999] mx-auto"
        style={{
          maxWidth: '720px',
          transform: `translateY(${verticalDragOffset}px) scale(${verticalDragScale * enterScale})`,
          opacity: enterOpacity,
          transition: isVerticalDragging 
            ? 'opacity 0.25s ease-out' 
            : 'transform 0.25s ease-out, opacity 0.25s ease-out',
        }}
        onClick={handleContainerClick}
        onDoubleClick={handleDoubleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        <div
          className="flex h-full w-full"
          style={{
            transform: `translate3d(${-(totalSlideWidth) * currentIndex + dragOffset}px, 0, 0)`,
            transition: isDragging ? 'none' : 'transform 0.3s ease',
            gap: `${slideGap}px`,
          }}
        >
          {items.map((item, slideIndex) => (
            <div
              key={`preview-slide-${slideIndex}`}
              className="flex h-full w-full flex-shrink-0 items-center justify-center relative"
              style={{ width: slideWidth }}
            >
              {item.type === 'image' ? (
                <div 
                  className="relative w-full h-full flex items-center justify-center"
                  style={{
                    transform: slideIndex === currentIndex 
                      ? `scale(${scale}) translate(${translateX / scale}px, ${translateY / scale}px)` 
                      : 'none',
                    transition: isPinchingRef.current ? 'none' : 'transform 0.2s ease',
                    touchAction: scale > 1 ? 'none' : 'pan-y',
                  }}
                >
                <img
                  src={item.src}
                  alt=""
                  className="block w-full max-h-screen select-none object-contain"
                  style={{ height: 'auto' }}
                  draggable={false}
                  loading="lazy"
                  decoding="async"
                  fetchPriority={slideIndex === currentIndex ? 'high' : 'low'}
                  referrerPolicy="no-referrer"
                  crossOrigin="anonymous"
                  onDragStart={(event) => event.preventDefault()}
                    onContextMenu={(event) => event.preventDefault()}
                  />
                  {PreviewWatermarkOverlay}
                </div>
              ) : (
                <div 
                  className="relative w-full h-full flex items-center justify-center"
                  style={{
                    transform: slideIndex === currentIndex 
                      ? `scale(${scale}) translate(${translateX / scale}px, ${translateY / scale}px)` 
                      : 'none',
                    transition: isPinchingRef.current ? 'none' : 'transform 0.2s ease',
                    touchAction: scale > 1 ? 'none' : 'pan-y',
                  }}
                  onTouchStart={(e) => {
                    if (slideIndex !== currentIndex) return
                    // 길게 누르기 시작
                    longPressTimerRef.current = window.setTimeout(() => {
                      const video = videoRefs.current[slideIndex]
                      if (video && !video.paused) {
                        wasPlayingBeforeLongPressRef.current = true
                        video.pause()
                        setIsLongPressing(true)
                      }
                    }, 200)
                  }}
                  onTouchEnd={() => {
                    // 길게 누르기 종료
                    if (longPressTimerRef.current) {
                      window.clearTimeout(longPressTimerRef.current)
                      longPressTimerRef.current = null
                    }
                    if (isLongPressing) {
                      const video = videoRefs.current[currentIndex]
                      if (video && wasPlayingBeforeLongPressRef.current) {
                        video.play().catch(() => {})
                      }
                      setIsLongPressing(false)
                      wasPlayingBeforeLongPressRef.current = false
                    }
                  }}
                  onMouseDown={() => {
                    if (slideIndex !== currentIndex) return
                    longPressTimerRef.current = window.setTimeout(() => {
                      const video = videoRefs.current[slideIndex]
                      if (video && !video.paused) {
                        wasPlayingBeforeLongPressRef.current = true
                        video.pause()
                        setIsLongPressing(true)
                      }
                    }, 200)
                  }}
                  onMouseUp={() => {
                    if (longPressTimerRef.current) {
                      window.clearTimeout(longPressTimerRef.current)
                      longPressTimerRef.current = null
                    }
                    if (isLongPressing) {
                      const video = videoRefs.current[currentIndex]
                      if (video && wasPlayingBeforeLongPressRef.current) {
                        video.play().catch(() => {})
                      }
                      setIsLongPressing(false)
                      wasPlayingBeforeLongPressRef.current = false
                    }
                  }}
                  onMouseLeave={() => {
                    if (longPressTimerRef.current) {
                      window.clearTimeout(longPressTimerRef.current)
                      longPressTimerRef.current = null
                    }
                    if (isLongPressing) {
                      const video = videoRefs.current[currentIndex]
                      if (video && wasPlayingBeforeLongPressRef.current) {
                        video.play().catch(() => {})
                      }
                      setIsLongPressing(false)
                      wasPlayingBeforeLongPressRef.current = false
                    }
                  }}
                >
                <video
                    ref={(el) => { videoRefs.current[slideIndex] = el }}
                  src={item.src}
                  autoPlay={slideIndex === currentIndex}
                  playsInline
                  loop
                    muted={videoMuted}
                  preload="metadata"
                    className="w-full h-full select-none object-contain"
                  draggable={false}
                  onDragStart={(event) => event.preventDefault()}
                    onLoadedMetadata={(e) => {
                      if (slideIndex === currentIndex) {
                        setVideoDuration(e.currentTarget.duration)
                      }
                    }}
                    onTimeUpdate={(e) => {
                      if (slideIndex === currentIndex && !isSeeking) {
                        const video = e.currentTarget
                        setVideoProgress(video.currentTime / video.duration)
                      }
                    }}
                    onContextMenu={(event) => event.preventDefault()}
                  />
                  
                  {/* {PreviewWatermarkOverlay} */}
                  
                  {/* 동영상 음소거 토글 버튼 */}
                  {slideIndex === currentIndex && (
                    <button
                      type="button"
                      className="absolute right-4 bottom-18 z-50 rounded-full bg-black/60 p-2.5 text-white"
                      onClick={(e) => {
                        e.stopPropagation()
                        setVideoMuted(!videoMuted)
                      }}
                    >
                      {videoMuted ? (
                        <VolumeX className="h-5 w-5" />
                      ) : (
                        <Volume2 className="h-5 w-5" />
                      )}
                    </button>
                  )}
                  
                  {/* 동영상 프로그레스바 - 터치 영역 확대 */}
                  {slideIndex === currentIndex && (
                    <div 
                      className="absolute bottom-0 left-0 right-0 z-30 cursor-pointer"
                      style={{ height: '20px', paddingTop: '18px' }}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        setIsSeeking(true)
                        const rect = e.currentTarget.getBoundingClientRect()
                        const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
                        const video = videoRefs.current[currentIndex]
                        let wasPlaying = false
                        if (video) {
                          wasPlaying = !video.paused
                          if (wasPlaying) video.pause()
                          video.currentTime = percent * video.duration
                          setVideoProgress(percent)
                        }
                        
                        // document level에서 마우스 이벤트 처리
                        const handleMouseMove = (moveEvent: MouseEvent) => {
                          const pct = Math.max(0, Math.min(1, (moveEvent.clientX - rect.left) / rect.width))
                          const vid = videoRefs.current[currentIndex]
                          if (vid) {
                            vid.currentTime = pct * vid.duration
                            setVideoProgress(pct)
                          }
                        }
                        const handleMouseUp = () => {
                          setIsSeeking(false)
                          const vid = videoRefs.current[currentIndex]
                          if (vid && wasPlaying) vid.play().catch(() => {})
                          document.removeEventListener('mousemove', handleMouseMove)
                          document.removeEventListener('mouseup', handleMouseUp)
                        }
                        document.addEventListener('mousemove', handleMouseMove)
                        document.addEventListener('mouseup', handleMouseUp)
                      }}
                      onTouchStart={(e) => {
                        e.stopPropagation()
                        setIsSeeking(true)
                        const rect = e.currentTarget.getBoundingClientRect()
                        const touch = e.touches[0]
                        const percent = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width))
                        const video = videoRefs.current[currentIndex]
                        if (video) {
                          // 조절 시작 시 동영상 멈춤
                          wasPlayingBeforeLongPressRef.current = !video.paused
                          if (!video.paused) video.pause()
                          video.currentTime = percent * video.duration
                          setVideoProgress(percent)
                        }
                      }}
                      onTouchMove={(e) => {
                        if (!isSeeking) return
                        e.stopPropagation()
                        e.preventDefault()
                        const rect = e.currentTarget.getBoundingClientRect()
                        const touch = e.touches[0]
                        const percent = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width))
                        const video = videoRefs.current[currentIndex]
                        if (video) {
                          video.currentTime = percent * video.duration
                          setVideoProgress(percent)
                        }
                      }}
                      onTouchEnd={() => {
                        setIsSeeking(false)
                        // 조절 종료 시 재생 재개
                        const video = videoRefs.current[currentIndex]
                        if (video && wasPlayingBeforeLongPressRef.current) {
                          video.play().catch(() => {})
                        }
                        wasPlayingBeforeLongPressRef.current = false
                      }}
                    >
                      <div className="h-[2px] bg-white/30 w-full">
                        <div 
                          className="h-full bg-white"
                          style={{ width: `${videoProgress * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                  
                  {/* 동영상 워터마크 오버레이 */}
                  {validMemberCode && (
                    <div 
                      className="absolute inset-0 overflow-hidden pointer-events-none select-none"
                      style={{ zIndex: 1 }}
                    >
                      <div 
                        className="text-center"
                        style={{
                          position: 'absolute',
                          top: '-50%',
                          left: '-50%',
                          width: '200%',
                          height: '200%',
                          transform: 'rotate(-30deg)',
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                          gap: '60px 30px',
                          padding: '30px',
                        }}
                      >
                        {Array.from({ length: 200 }).map((_, i) => (
                          <span
                            key={i}
                            className="text-white font-bold whitespace-nowrap"
                            style={{
                              fontSize: '12px',
                              opacity: 0.1,
                              textShadow: '0 0 3px rgba(0,0,0,0.5)',
                              letterSpacing: '1px',
                            }}
                          >
                            @{validMemberCode}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {heartBurst && (
        <motion.div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <Heart className="h-24 w-24 text-white drop-shadow-lg" fill="currentColor" strokeWidth={1.2} />
        </motion.div>
      )}

      {canShowActions && (
        <div
          className={`pointer-events-none absolute inset-x-0 bottom-10 z-20 flex justify-center px-6 pb-10 pt-16 text-white ${controlsVisibilityClass}`}
        >
          <div className="flex items-center gap-3 w-full" style={{ maxWidth: '720px' }}>
            <button
              type="button"
              className="pointer-events-auto flex items-center gap-2 text-base font-semibold cursor-pointer"
              onClick={handleLikeButton}
            >
              <Heart
                className={`h-6 w-6 ${isLiked ? 'fill-white text-white' : 'text-white'}`}
                fill={isLiked ? 'currentColor' : 'none'}
              />
              <span>{formattedLikeCount}</span>
            </button>
            <button
              type="button"
              className="pointer-events-auto flex items-center gap-2 text-base font-semibold cursor-pointer"
              onClick={handleCommentButton}
            >
              <MessageCircle className="h-6 w-6 text-white" />
              <span>{formattedCommentCount}</span>
            </button>
          </div>
        </div>
      )}

      {items.length > 1 && (
        <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-2">
          {items.map((_, indicatorIndex) => (
            <span
              key={`preview-indicator-${indicatorIndex}`}
              className={`h-2 w-2 rounded-full ${
                indicatorIndex === currentIndex ? 'bg-white' : 'bg-white/30'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function FeedScreen(props: FeedPageProps) {
  return <FeedPage {...props} />
}

function FeedAllRouteComponent() {
  return <FeedPage mode={{ type: 'following' }} tab="home" />
}

export const Route = createFileRoute('/feed/all' as const)({
  component: FeedAllRouteComponent,
})

export function CommentList({
  comments,
  onReply,
  replyingToId,
  level = 0,
  collapsedReplies,
  onToggleReplies,
  postAuthorMemberCode,
  currentUserId,
  currentUserMemberCode,
  onDeleteComment,
  onRequireLogin,
  onReportComment,
  onBlockUser,
}: CommentListProps) {
  const [longPressCommentId, setLongPressCommentId] = useState<string | null>(null)
  const [selectedPosition, setSelectedPosition] = useState<{ top: number; left: number; width: number } | null>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const commentRefs = useRef<Record<string, HTMLDivElement | null>>({})
  
  // 내 피드인지 여부 (게시글 작성자 == 현재 사용자)
  const isMyPost = postAuthorMemberCode && currentUserMemberCode && postAuthorMemberCode === currentUserMemberCode
  
  // 네이티브 진동
  const triggerHaptic = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      try {
        await Haptics.impact({ style: ImpactStyle.Medium })
      } catch (e) {
        // Haptics not available
      }
    }
  }, [])
  
  const canDeleteComment = useCallback((comment: FeedComment) => {
    // 내 피드면 모든 댓글 삭제 가능
    if (isMyPost) return true
    // 내 피드가 아니면 내 댓글만 삭제 가능
    return comment.userId === currentUserId
  }, [isMyPost, currentUserId])

  // 내 댓글인지 확인
  const isMyComment = useCallback((comment: FeedComment) => {
    return comment.userId === currentUserId
  }, [currentUserId])
  
  const handleLongPressStart = useCallback((commentId: string, comment: FeedComment) => {
    // 모든 댓글에서 길게 누르기 가능
    longPressTimerRef.current = setTimeout(async () => {
      // 위치를 먼저 저장
      const el = commentRefs.current[commentId]
      if (el) {
        const rect = el.getBoundingClientRect()
        setSelectedPosition({
          top: rect.top - 12,
          left: rect.left - 12,
          width: rect.width + 24,
        })
      }
      setLongPressCommentId(commentId)
      await triggerHaptic()
    }, 500) // 500ms 길게 누르기
  }, [triggerHaptic])
  
  const handleLongPressEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])
  
  const handleContextMenu = useCallback((e: React.MouseEvent, comment: FeedComment) => {
    e.preventDefault()
    // 모든 댓글에서 우클릭 메뉴 가능
    const el = commentRefs.current[comment.id]
    if (el) {
      const rect = el.getBoundingClientRect()
      setSelectedPosition({
        top: rect.top - 12,
        left: rect.left - 12,
        width: rect.width + 24,
      })
    }
    setLongPressCommentId(comment.id)
    triggerHaptic()
  }, [triggerHaptic])
  
  const closeDropdown = useCallback(() => {
    setLongPressCommentId(null)
    setSelectedPosition(null)
  }, [])

  // 선택된 댓글 정보
  const selectedComment = longPressCommentId 
    ? comments.find(c => c.id === longPressCommentId) || 
      comments.flatMap(c => c.replies || []).find(r => r.id === longPressCommentId)
    : null
  
  return (
    <div className="space-y-4">
      {/* Portal: 전역 오버레이 + 선택된 댓글 + 드롭다운 */}
      {longPressCommentId && selectedComment && selectedPosition && typeof document !== 'undefined' && createPortal(
        <>
          {/* 오버레이 - 댓글 팝업(z-[100]) 위로 올라옴 */}
          <div 
            className="fixed inset-0 z-[9999999] bg-black/20 backdrop-blur-[2px]"
            onClick={closeDropdown}
          />
          
          {/* 선택된 댓글 복제본 + 드롭다운 메뉴 */}
          <div className="fixed z-[10000000]" style={{ top: selectedPosition.top, left: selectedPosition.left, width: selectedPosition.width }}>
            <motion.div
              initial={{ scale: 1 }}
              animate={{ scale: [1, 1.02, 1] }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="bg-white rounded-xl p-3 shadow-xl"
            >
              <div className="flex items-start gap-3">
                <AvatarWithFallback
                  src={selectedComment.avatar}
                  name={selectedComment.user}
                  size="sm"
                  className="border border-gray-100"
                />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-[#110f1a]">
                      {selectedComment.user}
                    </p>
                    {selectedComment.createdAt && (
                      <span className="text-xs text-gray-400">
                        {formatRelativeTime(selectedComment.createdAt)}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600">{selectedComment.text}</p>
                </div>
              </div>
            </motion.div>
            
            {/* 메뉴 버튼들 */}
            <div className="mt-2 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
              {/* 삭제 버튼 (삭제 가능한 경우에만) */}
              {canDeleteComment(selectedComment) && (
                <button
                  type="button"
                  className="w-full px-4 py-3 flex items-center gap-2 text-red-600 hover:bg-red-50 transition-colors border-b border-gray-100 last:border-b-0"
                  onClick={async () => {
                    if (onDeleteComment && longPressCommentId) {
                      await onDeleteComment(longPressCommentId)
                    }
                    closeDropdown()
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="text-sm font-medium">삭제</span>
                </button>
              )}
              
              {/* 신고/차단 버튼 (내 댓글이 아닌 경우에만) */}
              {!isMyComment(selectedComment) && (
                <>
                  <button
                    type="button"
                    className="w-full px-4 py-3 flex items-center gap-2 text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0"
                    onClick={() => {
                      if (onReportComment && longPressCommentId && selectedComment) {
                        onReportComment(longPressCommentId, selectedComment.user)
                      }
                      closeDropdown()
                    }}
                  >
                    <Flag className="h-4 w-4" />
                    <span className="text-sm font-medium">신고하기</span>
                  </button>
                  <button
                    type="button"
                    className="w-full px-4 py-3 flex items-center gap-2 text-red-600 hover:bg-red-50 transition-colors"
                    onClick={() => {
                      if (onBlockUser && selectedComment) {
                        if (!selectedComment.memberCode) {
                          toast.error('사용자 정보를 불러올 수 없습니다.')
                          closeDropdown()
                          return
                        }
                        if (confirm(`${selectedComment.user}님을 차단하시겠습니까?\n차단하면 해당 사용자의 게시물과 댓글이 더 이상 표시되지 않습니다.`)) {
                          onBlockUser(selectedComment.memberCode, selectedComment.user)
                        }
                      }
                      closeDropdown()
                    }}
                  >
                    <Ban className="h-4 w-4" />
                    <span className="text-sm font-medium">차단하기</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </>,
        document.body
      )}
      
      {comments.map((comment) => {
        const avatarSrc = comment.avatar
        const isCollapsed = collapsedReplies ? collapsedReplies[comment.id] ?? true : true
        const isSelected = longPressCommentId === comment.id
        
        return (
          <div key={comment.id} className="space-y-2">
            <div 
              ref={(el) => { commentRefs.current[comment.id] = el }}
              className={`relative flex items-start gap-3 transition-opacity duration-150 ${isSelected ? 'opacity-0' : ''}`}
              onMouseDown={() => handleLongPressStart(comment.id, comment)}
              onMouseUp={handleLongPressEnd}
              onMouseLeave={handleLongPressEnd}
              onTouchStart={() => handleLongPressStart(comment.id, comment)}
              onTouchEnd={handleLongPressEnd}
              onContextMenu={(e) => handleContextMenu(e, comment)}
            >
              <AvatarWithFallback
                src={avatarSrc}
                name={comment.user}
                size="sm"
                className="border border-gray-100"
              />
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-[#110f1a]">
                    {comment.user}
                  </p>
                  {comment.createdAt && (
                    <span className="text-xs text-gray-400">
                      {formatRelativeTime(comment.createdAt)}
                    </span>
                  )}
                  {replyingToId === comment.id && (
                    <span className="rounded-full bg-pink-50 px-2 py-0.5 text-xs text-[#FE3A8F]">
                      답글 작성중
                    </span>
                  )}
                  {onReply && level === 0 && (
                    <button
                      className="ml-auto text-xs font-medium text-gray-400 hover:text-[#110f1a]"
                      onClick={(e) => {
                        e.stopPropagation()
                        // 비로그인 시 로그인 필요 안내 (웹 전용)
                        if (!currentUserId && onRequireLogin) {
                          onRequireLogin()
                          return
                        }
                        onReply(comment.id)
                      }}
                    >
                      답글
                    </button>
                  )}
                </div>
                <p className="text-sm text-gray-600">{comment.text}</p>
              </div>
            </div>
            {comment.replies?.length ? (
              <div className="flex gap-3">
                <div className="h-8 w-8 shrink-0" />
                <div className="flex-1 space-y-2">
                  <button
                    type="button"
                    className="text-xs text-[#110f1a]"
                    onClick={() => onToggleReplies?.(comment.id)}
                  >
                    {isCollapsed
                      ? `답글 ${comment.replies.length}개 보기`
                      : '답글 접기'}
                  </button>
                  {!isCollapsed && (
                    <CommentList
                      comments={comment.replies}
                      onReply={onReply}
                      replyingToId={replyingToId}
                      level={level + 1}
                      collapsedReplies={collapsedReplies}
                      onToggleReplies={onToggleReplies}
                      postAuthorMemberCode={postAuthorMemberCode}
                      currentUserId={currentUserId}
                      currentUserMemberCode={currentUserMemberCode}
                      onDeleteComment={onDeleteComment}
                      onRequireLogin={onRequireLogin}
                      onReportComment={onReportComment}
                      onBlockUser={onBlockUser}
                    />
                  )}
                </div>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

interface CommentSheetProps {
  comments: FeedComment[]
  draft: string
  replyingToId: string | null
  visibleCount: number
  totalCount: number
  isLoadingComments?: boolean
  onChangeDraft: (value: string) => void
  onAddComment: () => void | Promise<void>
  onReply: (commentId: string | null) => void
  onClose: () => void
  sheetHeight: number
  isDragging: boolean
  isClosing: boolean
  onHandlePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
  onHandleTouchStart: (event: React.TouchEvent<HTMLDivElement>) => void
  onLoadMore: () => void
  onCollapseAll: () => void
  collapsedReplies: Record<string, boolean>
  onToggleReplies: (commentId: string) => void
  isSubmitting?: boolean
  /** 게시글 작성자 member_code */
  postAuthorMemberCode?: string | null
  /** 현재 로그인한 사용자 ID */
  currentUserId?: string | null
  /** 현재 로그인한 사용자 member_code */
  currentUserMemberCode?: string | null
  /** 댓글 삭제 핸들러 */
  onDeleteComment?: (commentId: string) => void
  /** 로그인 필요 시 호출되는 핸들러 (웹 전용) */
  onRequireLogin?: () => void
  /** 댓글 신고 핸들러 */
  onReportComment?: (commentId: string, commentUser: string) => void
  /** 사용자 차단 핸들러 */
  onBlockUser?: (userMemberCode: string, userName: string) => void
}

export function CommentSheet({
  comments,
  draft,
  replyingToId,
  visibleCount,
  totalCount,
  isLoadingComments = false,
  onChangeDraft,
  onAddComment,
  onReply,
  onClose,
  sheetHeight,
  isDragging,
  isClosing,
  onHandlePointerDown,
  onHandleTouchStart,
  onLoadMore,
  onCollapseAll,
  collapsedReplies,
  onToggleReplies,
  isSubmitting = false,
  postAuthorMemberCode,
  currentUserId,
  currentUserMemberCode,
  onDeleteComment,
  onRequireLogin,
  onReportComment,
  onBlockUser,
}: CommentSheetProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  useEffect(() => {
    const frame = requestAnimationFrame(() => setIsVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  const handleClose = () => {
    onClose()
  }

  const replyingToComment = findCommentById(comments, replyingToId)
  const displayedComments = useMemo(
    () => (visibleCount > 0 ? comments.slice(0, visibleCount) : []),
    [comments, visibleCount],
  )
  const isSkeletonLoading =
    isLoadingComments || (totalCount > 0 && comments.length === 0)

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/40 backdrop-blur-sm"
      onClick={handleClose}
      onWheel={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
      onTouchMove={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
    >
      <div
        className="mt-auto flex h-full w-full flex-col rounded-t-3xl bg-white p-4 shadow-2xl"
        style={{
          height: `${sheetHeight * 100}vh`,
          transition: isDragging
            ? 'none'
            : 'height 0.25s ease, transform 0.25s ease',
          transform:
            isClosing || !isVisible ? 'translateY(110%)' : 'translateY(0)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="mx-auto mb-3 h-1 w-12 rounded-full bg-gray-200"
          onPointerDown={(event) => {
            event.stopPropagation()
            event.preventDefault()
            onHandlePointerDown(event)
          }}
          onTouchStart={onHandleTouchStart}
        />

        <div className="pb-4 text-center">
          <Typography
            variant="body1"
            className="text-base font-semibold text-[#110f1a]"
          >
            댓글
          </Typography>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isSkeletonLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-gray-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-24 animate-pulse rounded-full bg-gray-200" />
                    <div className="h-3 w-40 animate-pulse rounded-full bg-gray-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : displayedComments.length > 0 ? (
            <CommentList
              comments={displayedComments}
              onReply={onReply}
              replyingToId={replyingToId}
              collapsedReplies={collapsedReplies}
              onToggleReplies={onToggleReplies}
              postAuthorMemberCode={postAuthorMemberCode}
              currentUserId={currentUserId}
              currentUserMemberCode={currentUserMemberCode}
              onDeleteComment={onDeleteComment}
              onRequireLogin={onRequireLogin}
              onReportComment={onReportComment}
              onBlockUser={onBlockUser}
            />
          ) : (
            <p className="py-6 text-center text-sm text-gray-400">
              첫 댓글을 남겨보세요.
            </p>
          )}
        </div>

        <div 
          className="space-y-2 pt-3"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          {replyingToComment && (
            <div className="flex items-center gap-2 rounded-2xl bg-gray-50 px-3 py-2 text-xs text-gray-500">
              <MessageCircle className="h-4 w-4" />
              <span>{replyingToComment.user}님에게 답글 작성중</span>
              <button
                className="ml-auto text-gray-400 hover:text-[#110f1a]"
                onClick={() => onReply(null)}
              >
                취소
              </button>
            </div>
          )}

          <div className="relative rounded-full border border-gray-100 bg-gray-100 px-3 py-1.5">
            <Input
              className="w-full border-none bg-transparent p-0 pr-12 text-sm focus:border-none focus:ring-0 focus:ring-offset-0 focus:outline-none caret-[#FE3A8F]"
              placeholder={
                replyingToId ? '대댓글을 입력해주세요' : '댓글을 입력해주세요'
              }
              value={draft}
              onChange={(event) => onChangeDraft(event.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (!isSubmitting && draft.trim()) {
                    onAddComment()
                  }
                }
              }}
            />
            <button
              type="button"
              className="absolute right-1.5 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full !bg-[#FE3A8F] p-0 text-white hover:!bg-[#e8a0c0] disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={onAddComment}
              disabled={isSubmitting || !draft.trim()}
            >
              {isSubmitting ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

interface CommentModalProps {
  post: FeedPost
  comments: FeedComment[]
  draft: string
  replyingToId: string | null
  visibleCount: number
  totalCount: number
  isLoadingComments?: boolean
  onChangeDraft: (value: string) => void
  onAddComment: () => void | Promise<void>
  onReply: (commentId: string | null) => void
  onClose: () => void
  onLoadMore: () => void
  onCollapseAll: () => void
  collapsedReplies: Record<string, boolean>
  onToggleReplies: (commentId: string) => void
  isSubmitting?: boolean
  /** 댓글 삭제 핸들러 */
  onDeleteComment?: (commentId: string) => void
  /** 댓글 신고 핸들러 */
  onReportComment?: (commentId: string, commentUser: string) => void
  /** 사용자 차단 핸들러 */
  onBlockUser?: (userMemberCode: string, userName: string) => void
}

export function CommentModal({
  post,
  comments,
  draft,
  replyingToId,
  visibleCount,
  totalCount,
  isLoadingComments = false,
  onChangeDraft,
  onAddComment,
  onReply,
  onClose,
  onLoadMore,
  onCollapseAll,
  collapsedReplies,
  onToggleReplies,
  isSubmitting = false,
  onDeleteComment,
  onReportComment,
  onBlockUser,
}: CommentModalProps) {
  const { isMobile } = useDevice()
  const { user } = useAuth()
  const navigate = useNavigate()
  
  useEffect(() => {
    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = originalOverflow
    }
  }, [])

  const handleOverlayClick = () => {
    onClose()
  }

  const replyingToComment = findCommentById(comments, replyingToId)
  const displayedComments = useMemo(
    () => (visibleCount > 0 ? comments.slice(0, visibleCount) : []),
    [comments, visibleCount],
  )
  const isSkeletonLoading =
    isLoadingComments || (totalCount > 0 && comments.length === 0)

  return (
    <div
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/70 p-4 md:p-8"
      onClick={handleOverlayClick}
      onWheel={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
      onTouchMove={(event) => {
        if (event.target === event.currentTarget) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
    >
      <div
        className="flex w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl md:h-[720px] md:flex-row"
        onClick={(event) => event.stopPropagation()}
      >
        <article className="relative flex flex-1 flex-col overflow-hidden bg-[#FE3A8F] text-white">
          {post.media?.length ? (
            <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
              <FeedMediaCarousel media={post.media} variant="modal" memberCode={user?.member_code} />
              {/* 댓글 모달 전용 워터마크 오버레이 - 현재 로그인 사용자 (유출자 추적용) */}
              {user?.member_code && (
                <div 
                  className="absolute inset-0 overflow-hidden pointer-events-none select-none"
                  style={{ zIndex: 20 }}
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
                    {Array.from({ length: 100 }).map((_, i) => (
                      <span
                        key={i}
                        className="text-white font-bold whitespace-nowrap"
                        style={{
                          fontSize: '12px',
                          opacity: 0.15,
                          textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
                        }}
                      >
                        @{user.member_code}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className={`flex h-full flex-col justify-center gap-4 p-8 ${isMobile ? 'text-lg' : 'text-3xl'} leading-relaxed`}>
              <p className="whitespace-pre-wrap">{post.content}</p>
            </div>
          )}
        </article>

        <div className="flex w-full max-w-md flex-col border-t border-gray-100 bg-white md:h-full md:max-w-sm md:border-l md:border-t-0">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <AvatarWithFallback
                src={post.author.avatar}
                name={post.author.name}
                size="sm"
                className="border border-gray-100"
              />
              <div>
                <p className="font-semibold text-[#110f1a]">
                  {post.author.name}
                </p>
                <p className="text-xs text-gray-400">@{post.author.handle}</p>
              </div>
            </div>
            <button
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gray-50 text-gray-500 hover:bg-gray-100 cursor-pointer"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {isSkeletonLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-gray-200" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-24 animate-pulse rounded-full bg-gray-200" />
                      <div className="h-3 w-40 animate-pulse rounded-full bg-gray-100" />
                    </div>
                  </div>
                ))}
              </div>
            ) : displayedComments.length > 0 ? (
              <CommentList
                comments={displayedComments}
                onReply={onReply}
                replyingToId={replyingToId}
                collapsedReplies={collapsedReplies}
                onToggleReplies={onToggleReplies}
                postAuthorMemberCode={post.author?.handle}
                currentUserId={user?.id}
                currentUserMemberCode={user?.member_code}
                onDeleteComment={onDeleteComment}
                onRequireLogin={() => navigate({ to: '/login' })}
                onReportComment={onReportComment}
                onBlockUser={onBlockUser}
              />
            ) : (
              <p className="py-12 text-center text-sm text-gray-400">
                첫 댓글을 남겨보세요.
              </p>
            )}
          </div>

          {replyingToComment && (
            <div className="mx-4 mb-2 flex items-center gap-2 rounded-2xl bg-gray-50 px-3 py-2 text-xs text-gray-500">
              <MessageCircle className="h-4 w-4" />
              <span>{replyingToComment.user}님에게 답글 작성중</span>
              <button
                className="ml-auto text-gray-400 hover:text-[#110f1a]"
                onClick={() => onReply(null)}
              >
                취소
              </button>
            </div>
          )}

          <div className="p-4">
            <div className="relative rounded-2xl border border-gray-100 bg-white px-3 py-1.5">
              <Input
                className="w-full border-none bg-transparent p-0 pr-12 text-sm focus:border-none focus:ring-0 focus:ring-offset-0 focus:outline-none caret-[#FE3A8F]"
                placeholder={
                  replyingToId ? '답글을 입력해주세요' : '댓글을 입력해주세요'
                }
                value={draft}
                onChange={(event) => onChangeDraft(event.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    if (!isSubmitting && draft.trim()) {
                      onAddComment()
                    }
                  }
                }}
              />
              <button
                type="button"
                className="absolute right-1.5 top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full !bg-[#FE3A8F] p-0 text-white hover:!bg-[#e8a0c0] disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={onAddComment}
                disabled={isSubmitting || !draft.trim()}
              >
                {isSubmitting ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
