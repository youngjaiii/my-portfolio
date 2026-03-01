import { useInfiniteQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'

const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export interface FeedMedia {
  id: string
  media_type: 'image' | 'video'
  media_url: string
  signed_url?: string
  sort_order?: number
}

export interface FeedPost {
  id: string
  content: string
  published_at: string
  partner_id: string
  partner: {
    name: string
    profile_image: string | null
    member_code: string | null
  }
  files: FeedMedia[]
  like_count: number
  comment_count: number
  is_liked: boolean
  is_followed: boolean
  is_purchased: boolean
  is_subscribers_only: boolean
  is_paid_post: boolean
  point_price: number | null
  has_membership: boolean
}

interface FeedResponse {
  success: boolean
  data: FeedPost[]
  nextCursor: string | null
  hasMore: boolean
  limit: number
}

interface UseFeedInfiniteOptions {
  partnerId?: string
  limit?: number
  enabled?: boolean
}

export function useFeedInfinite(options: UseFeedInfiniteOptions = {}) {
  const { partnerId, limit = 20, enabled = true } = options
  const { getAccessToken, isAuthenticated } = useAuth()

  return useInfiniteQuery({
    queryKey: ['feed', 'infinite', partnerId ?? 'all', isAuthenticated],
    queryFn: async ({ pageParam }) => {
      const token = await getAccessToken()
      
      const params = new URLSearchParams()
      params.set('limit', String(limit))
      
      if (pageParam) {
        params.set('cursor', pageParam)
      }
      
      if (partnerId) {
        params.set('partner_id', partnerId)
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
      }
      
      if (token) {
        headers.Authorization = `Bearer ${token}`
      }

      const response = await fetch(
        `${EDGE_FUNCTIONS_URL}/functions/v1/api-posts-list?${params.toString()}`,
        { headers }
      )

      if (!response.ok) {
        throw new Error('피드를 불러오는데 실패했습니다.')
      }

      const result: FeedResponse = await response.json()
      
      if (!result.success) {
        throw new Error('피드 데이터 오류')
      }

      // 미디어 데이터 정규화
      const normalizedPosts = result.data.map((post) => ({
        ...post,
        files: (post.files || []).map((file) => ({
          ...file,
          type: file.media_type,
          src: file.signed_url || file.media_url,
        })),
      }))

      return {
        posts: normalizedPosts,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      }
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: null as string | null,
    enabled,
    staleTime: 1000 * 60 * 2, // 2분
    gcTime: 1000 * 60 * 10, // 10분 (garbage collection)
    refetchOnWindowFocus: false,
  })
}

// 피드 데이터를 평탄화하는 유틸리티
export function flattenFeedPages(
  pages: Array<{ posts: FeedPost[]; nextCursor: string | null; hasMore: boolean }> | undefined
): FeedPost[] {
  if (!pages) return []
  return pages.flatMap((page) => page.posts)
}

