import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState, useCallback, useRef } from 'react'
import { ArrowLeft, Heart, MessageCircle, Loader2, X, Send } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { AvatarWithFallback, Typography, SlideSheet } from '@/components'
import { formatDistanceToNow } from 'date-fns'
import { ko } from 'date-fns/locale'
import { toast } from '@/components/ui/sonner'
import { FeedMediaCarousel, type FeedMedia, updateGlobalLikeState, incrementGlobalCommentCount } from './all'
import { CaptureProtection } from '@/components/CaptureProtection'

export const Route = createFileRoute('/feed/$postId')({
  component: SinglePostPage,
})

interface PostData {
  id: string
  content: string
  published_at: string
  partner_id: string
  partner: {
    name: string
    profile_image: string | null
    member_code: string
  }
  files: Array<{
    id: string
    media_type: string
    media_url: string
    signed_url: string | null
    point_price?: number | null
  }>
  like_count: number
  comment_count: number
  is_liked: boolean
  is_purchased: boolean
  is_subscribers_only: boolean
  is_paid_post: boolean
  point_price: number | null
  has_membership: boolean
  is_authenticated?: boolean
  is_bundle?: boolean
  discount_rate?: number
  membership_id?: string | null
  purchased_media_order?: number | null
}

interface Comment {
  id: number
  content: string
  created_at: string
  user_id: string
  user?: {
    id: string
    name: string
    profile_image: string | null
    member_code: string
  }
  replies?: Comment[]
}

function SinglePostPage() {
  const { postId } = Route.useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [post, setPost] = useState<PostData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isLiked, setIsLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(0)
  const [isLiking, setIsLiking] = useState(false)
  
  // 댓글 관련 상태
  const [isCommentSheetOpen, setIsCommentSheetOpen] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [isLoadingComments, setIsLoadingComments] = useState(false)
  const [commentText, setCommentText] = useState('')
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)
  const [replyTarget, setReplyTarget] = useState<{ commentId: number; userName: string } | null>(null)
  const commentInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // AbortController로 이전 요청 취소 (라우터 전환 시 race condition 방지)
    const abortController = new AbortController()
    
    const fetchPost = async () => {
      // postId가 없으면 요청하지 않음
      if (!postId) return
      
      try {
        setIsLoading(true)
        setError(null)

        const { data: { session } } = await supabase.auth.getSession()
        const token = session?.access_token

        const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
        const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

        const headers: Record<string, string> = {
          apikey: SUPABASE_ANON_KEY,
        }
        if (token) {
          headers['Authorization'] = `Bearer ${token}`
        }

        console.log('📄 게시물 API 요청:', postId)
        
        const response = await fetch(
          `${EDGE_FUNCTIONS_URL}/functions/v1/api-posts/${postId}`,
          {
            method: 'GET',
            headers,
            signal: abortController.signal, // 요청 취소 가능하도록 signal 추가
          }
        )

        // 요청이 취소된 경우 무시
        if (abortController.signal.aborted) return

        const result = await response.json()
        console.log('📄 게시물 API 응답:', { postId, status: response.status, result })

        if (!response.ok || !result.success) {
          const errorMessage = result.error || '게시물을 불러올 수 없습니다'
          console.error('❌ 게시물 로딩 오류:', { postId, status: response.status, error: errorMessage })
          throw new Error(errorMessage)
        }

        // 요청이 취소된 경우 상태 업데이트 하지 않음
        if (abortController.signal.aborted) return

        setPost(result.data)
        setIsLiked(result.data.is_liked)
        setLikeCount(result.data.like_count)
      } catch (err: any) {
        // AbortError는 무시 (정상적인 취소)
        if (err.name === 'AbortError') return
        
        console.error('게시물 로딩 실패:', err)
        setError(err.message || '게시물을 불러올 수 없습니다')
      } finally {
        // 요청이 취소된 경우 로딩 상태 유지
        if (!abortController.signal.aborted) {
          setIsLoading(false)
        }
      }
    }

    fetchPost()
    
    // cleanup: 컴포넌트 언마운트 또는 postId 변경 시 이전 요청 취소
    return () => {
      abortController.abort()
    }
  }, [postId])

  const handleBack = () => {
    navigate({ to: '/feed/all' })
  }

  const handleToggleLike = useCallback(async () => {
    if (!post || isLiking) return

    if (!user) {
      toast('로그인이 필요합니다')
      navigate({ to: '/login' })
      return
    }

    setIsLiking(true)
    
    // Optimistic update
    const prevLiked = isLiked
    const prevCount = likeCount
    const newLiked = !prevLiked
    const newCount = prevLiked ? prevCount - 1 : prevCount + 1
    setIsLiked(newLiked)
    setLikeCount(newCount)
    // 전역 피드 상태도 업데이트
    if (post) {
      updateGlobalLikeState(post.id, newLiked, newCount)
    }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        // Rollback
        setIsLiked(prevLiked)
        setLikeCount(prevCount)
        if (post) updateGlobalLikeState(post.id, prevLiked, prevCount)
        setIsLiking(false)
        return
      }

      const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

      const endpoint = prevLiked
        ? `${EDGE_FUNCTIONS_URL}/functions/v1/api-post-likes/${post.id}`
        : `${EDGE_FUNCTIONS_URL}/functions/v1/api-post-likes`

      const response = await fetch(endpoint, {
        method: prevLiked ? 'DELETE' : 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
          ...(!prevLiked ? { 'Content-Type': 'application/json' } : {}),
        },
        body: !prevLiked ? JSON.stringify({ post_id: post.id }) : undefined,
      })

      if (!response.ok) {
        // Rollback on error
        setIsLiked(prevLiked)
        setLikeCount(prevCount)
        if (post) updateGlobalLikeState(post.id, prevLiked, prevCount)
      }
    } catch (err) {
      console.error('좋아요 처리 실패:', err)
      // Rollback on error
      setIsLiked(prevLiked)
      setLikeCount(prevCount)
      if (post) updateGlobalLikeState(post.id, prevLiked, prevCount)
    } finally {
      setIsLiking(false)
    }
  }, [post, isLiking, isLiked, likeCount, user, navigate])

  // 댓글 불러오기
  const fetchComments = useCallback(async () => {
    if (!postId) return
    
    setIsLoadingComments(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
      
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
        }
      )
      
      const result = await response.json()
      if (response.ok && result.success) {
        setComments(result.data || [])
      }
    } catch (err) {
      console.error('댓글 로딩 실패:', err)
    } finally {
      setIsLoadingComments(false)
    }
  }, [postId])

  // 댓글 버튼 클릭
  const handleCommentButton = useCallback(() => {
    setIsCommentSheetOpen(true)
    fetchComments()
  }, [fetchComments])

  // 댓글 시트 닫기
  const closeCommentSheet = useCallback(() => {
    setIsCommentSheetOpen(false)
    setReplyTarget(null)
    setCommentText('')
  }, [])

  // 댓글 제출
  const handleSubmitComment = useCallback(async () => {
    if (!commentText.trim() || isSubmittingComment || !user) return

    setIsSubmittingComment(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      
      if (!token) {
        toast.error('로그인이 필요합니다')
        setIsSubmittingComment(false)
        return
      }
      
      const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
      
      const response = await fetch(
        `${EDGE_FUNCTIONS_URL}/functions/v1/api-comments`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            post_id: postId,
            content: commentText.trim(),
            parent_id: replyTarget?.commentId ?? null,
          }),
        }
      )
      
      const result = await response.json()
      if (response.ok && result.success) {
        setCommentText('')
        // 답글이 아닐 때만 댓글 카운트 증가
        const wasReply = !!replyTarget
        setReplyTarget(null)
        fetchComments()
        // 댓글 수 업데이트
        if (post && !wasReply) {
          setPost(prev => prev ? { ...prev, comment_count: prev.comment_count + 1 } : null)
          // 전역 피드 상태도 업데이트
          incrementGlobalCommentCount(post.id)
        }
      } else {
        toast.error(result.error || '댓글 작성에 실패했습니다')
      }
    } catch (err) {
      console.error('댓글 작성 실패:', err)
      toast.error('댓글 작성에 실패했습니다')
    } finally {
      setIsSubmittingComment(false)
    }
  }, [commentText, isSubmittingComment, user, postId, replyTarget, fetchComments, post])

  // 답글 버튼 클릭
  const handleReplyClick = useCallback((commentId: number, userName: string) => {
    setReplyTarget({ commentId, userName })
    commentInputRef.current?.focus()
  }, [])

  const formatDate = (dateString: string) => {
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true, locale: ko })
    } catch {
      return dateString
    }
  }

  // 미디어 변환
  const convertFilesToMedia = (files: PostData['files']): FeedMedia[] => {
    if (!files || files.length === 0) return []
    return files.map(file => ({
      type: file.media_type === 'video' ? 'video' : 'image',
      src: file.signed_url || file.media_url || '',
      point_price: file.point_price ?? null,
      signed_url: file.signed_url ?? null,
    }))
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-[#FE3A8F]" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-4">
        <Typography variant="h5" className="text-gray-800">
          {error}
        </Typography>
        <button
          onClick={handleBack}
          className="rounded-lg bg-[#FE3A8F] px-6 py-2 text-white hover:bg-[#e5327f]"
        >
          피드로 돌아가기
        </button>
      </div>
    )
  }

  if (!post) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-4">
        <Typography variant="h5" className="text-gray-800">
          게시물을 찾을 수 없습니다
        </Typography>
        <button
          onClick={handleBack}
          className="rounded-lg bg-[#FE3A8F] px-6 py-2 text-white hover:bg-[#e5327f]"
        >
          피드로 돌아가기
        </button>
      </div>
    )
  }

  const mediaList = convertFilesToMedia(post.files)

  return (
    <CaptureProtection>
    <div className="min-h-screen bg-white pb-20">
      <div className="mx-auto w-full max-w-[720px]">
        {/* 헤더 - /feed/all 과 동일한 스타일 */}
        <header className="sticky top-0 z-50 flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-3">
          <button onClick={handleBack} className="p-1">
            <ArrowLeft className="h-6 w-6 text-gray-800" />
          </button>
          <Typography variant="h6" className="font-semibold text-gray-800">
            게시물
          </Typography>
        </header>

      {/* 게시물 */}
      <article className="border-b border-gray-100 px-4">
        {/* 작성자 정보 */}
        <div className="flex items-center gap-3 py-3">
          <Link to="/partners/$memberCode" params={{ memberCode: post.partner.member_code }}>
            <AvatarWithFallback
              src={post.partner.profile_image || undefined}
              name={post.partner.name}
              size="md"
            />
          </Link>
          <div className="flex-1">
            <Link to="/partners/$memberCode" params={{ memberCode: post.partner.member_code }}>
              <Typography variant="body1" className="font-semibold text-gray-900">
                {post.partner.name}
              </Typography>
            </Link>
            <Typography variant="body2" className="text-gray-500">
              {formatDate(post.published_at)}
            </Typography>
          </div>
        </div>

        {/* 미디어 - FeedMediaCarousel 사용 */}
        {mediaList.length > 0 && (
          <div className="-mx-4 w-[calc(100%+2rem)] px-4">
            <FeedMediaCarousel
              media={mediaList}
              variant="feed"
              memberCode={user?.member_code}
              isSubscribersOnly={post.is_subscribers_only}
              pointPrice={post.point_price ?? undefined}
              isPurchased={post.is_purchased}
              isBundle={post.is_bundle ?? false}
              discountRate={post.discount_rate ?? 0}
              purchasedMediaOrder={post.purchased_media_order ?? null}
              onMediaPurchaseClick={(mediaIndex) => {
                // 개별 미디어 구매 처리
                // TODO: 개별 미디어 구매 팝업 구현
                alert('개별 미디어 구매 기능은 준비 중입니다.')
              }}
            />
          </div>
        )}

        {/* 내용 */}
        {post.content && (
          <div className="py-3">
            <Typography variant="body1" className="whitespace-pre-wrap text-gray-800">
              <span className="font-semibold">{post.partner.name}</span>{' '}
              {post.content}
            </Typography>
          </div>
        )}

        {/* 액션 버튼 */}
        <div className="flex items-center gap-4 py-3">
          <button
            onClick={handleToggleLike}
            disabled={isLiking}
            className="flex items-center gap-1 disabled:opacity-50"
          >
            <Heart
              className={`h-6 w-6 transition-colors ${isLiked ? 'fill-red-500 text-red-500' : 'text-gray-700'}`}
            />
            <span className="text-sm text-gray-700">{likeCount}</span>
          </button>
          <button 
            className="flex items-center gap-1"
            onClick={handleCommentButton}
          >
            <MessageCircle className="h-6 w-6 text-gray-700" />
            <span className="text-sm text-gray-700">{post.comment_count}</span>
          </button>
        </div>
      </article>

      {/* 댓글 시트 */}
      <SlideSheet
        isOpen={isCommentSheetOpen}
        onClose={closeCommentSheet}
        title={`댓글${post.comment_count > 0 ? ` (${post.comment_count})` : ''}`}
        initialHeight={0.6}
        minHeight={0.3}
        maxHeight={0.9}
        footer={
          user ? (
            <div>
              {replyTarget && (
                <div className="mb-2 flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
                  <span className="text-sm text-gray-600">
                    @{replyTarget.userName}에게 답글 작성 중
                  </span>
                  <button 
                    onClick={() => setReplyTarget(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input
                  ref={commentInputRef}
                  type="text"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder={replyTarget ? "답글을 입력하세요..." : "댓글을 입력하세요..."}
                  className="flex-1 rounded-full border border-gray-200 px-4 py-2 text-sm focus:border-[#FE3A8F] focus:outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSubmitComment()
                    }
                  }}
                />
                <button
                  onClick={handleSubmitComment}
                  disabled={!commentText.trim() || isSubmittingComment}
                  className="rounded-full bg-[#FE3A8F] p-2 text-white disabled:opacity-50"
                >
                  {isSubmittingComment ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Send className="h-5 w-5" />
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
        {isLoadingComments ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400">
            <MessageCircle className="h-12 w-12 mb-2" />
            <p>아직 댓글이 없습니다</p>
            <p className="text-sm">첫 댓글을 남겨보세요!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                onReply={handleReplyClick}
                formatDate={formatDate}
              />
            ))}
          </div>
        )}
      </SlideSheet>
      </div>
    </div>
    </CaptureProtection>
  )
}

// 댓글 아이템 컴포넌트
function CommentItem({ 
  comment, 
  onReply, 
  formatDate,
  depth = 0,
}: { 
  comment: Comment
  onReply: (commentId: number, userName: string) => void
  formatDate: (date: string) => string
  depth?: number
}) {
  const userName = comment.user?.name || (comment.user_id ? comment.user_id.slice(0, 8) : '익명')
  const avatarSrc = comment.user?.profile_image || undefined
  
  return (
    <div className={depth > 0 ? 'ml-8 mt-2' : ''}>
      <div className="flex items-start gap-3">
        <AvatarWithFallback
          src={avatarSrc}
          name={userName}
          size="sm"
          className="border border-gray-100"
        />
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-[#110f1a]">
              {userName}
            </span>
            <span className="text-xs text-gray-400">
              {formatDate(comment.created_at)}
            </span>
            {depth === 0 && (
              <button
                onClick={() => onReply(comment.id, userName)}
                className="ml-auto text-xs font-medium text-gray-400 hover:text-[#110f1a]"
              >
                답글
              </button>
            )}
          </div>
          <p className="text-sm text-gray-600">{comment.content}</p>
        </div>
      </div>
      {/* 대댓글 */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="mt-2 flex gap-3">
          <div className="h-8 w-8 shrink-0" />
          <div className="flex-1 space-y-2">
            {comment.replies.map((reply) => (
              <CommentItem
                key={reply.id}
                comment={reply}
                onReply={onReply}
                formatDate={formatDate}
                depth={depth + 1}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
