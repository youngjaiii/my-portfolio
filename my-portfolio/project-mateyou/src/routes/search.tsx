import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Search as SearchIcon } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from '@/components/ui/sonner'

import { edgeApi } from '@/lib/edgeApi'
import type { ApiResponse, PartnerWithMember } from '@/types/database'
import {
  getPartnerAvatarLabel,
  getPartnerDisplayLabel,
  hydrateProfileData,
  normalizeFavoriteGames,
} from '@/utils/partnerProfile'
import { useDevice } from '@/hooks/useDevice'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/useAuthStore'
import { toggleFollowPartner } from '@/utils/followApi'
import { getAvatarBgColor, getInitialsFromName } from '@/utils/avatarFallback'
import { updateGlobalFollowState } from './feed/all'

export const Route = createFileRoute('/search' as const)({
  component: SearchPage,
})

const statusColorMap: Record<string, string> = {
  online: 'bg-green-600',
  matching: 'bg-yellow-600',
  in_game: 'bg-[#FE3A8F]',
  offline: 'bg-gray-400',
}

interface PinnedPost {
  id: string
  partner: { name: string; profile_image: string | null; member_code: string | null }
  first_media: { media_type: string; signed_url: string }
}

function SearchPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [partners, setPartners] = useState<PartnerWithMember[]>([])
  const [pinnedPosts, setPinnedPosts] = useState<PinnedPost[]>([])
  const [isInitialLoading, setIsInitialLoading] = useState(true)
  const [isPinnedLoading, setIsPinnedLoading] = useState(true)
  const [isSearching, setIsSearching] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    let cancelled = false
    const fetchPinned = async () => {
      try {
        setIsPinnedLoading(true)
        const res = await edgeApi.posts.getPinned() as ApiResponse<PinnedPost[]>
        if (!cancelled && res?.success && Array.isArray(res.data)) {
          setPinnedPosts(res.data)
        }
      } catch (err) {
        console.error('[search] pinned posts fetch failed:', err)
      } finally {
        if (!cancelled) setIsPinnedLoading(false)
      }
    }
    fetchPinned()
    return () => { cancelled = true }
  }, [])

  const fetchPartners = useCallback(
    async (keyword: string, isInitial = false) => {
      try {
        if (isInitial) {
          setIsInitialLoading(true)
        } else {
          setIsSearching(true)
        }

        const response = (await edgeApi.partners.getList({
          limit: 40,
          search: keyword.trim() ? keyword.trim() : undefined,
        })) as ApiResponse<PartnerWithMember[] | { partners: PartnerWithMember[] }>

        if (response?.success) {
          const responseData =
            Array.isArray(response.data) && response.data.length > 0
              ? response.data
              : Array.isArray((response.data as { partners?: PartnerWithMember[] })?.partners)
                ? ((response.data as { partners?: PartnerWithMember[] }).partners ?? [])
                : []

          const enrichedPartners = await hydrateProfileData(responseData ?? [])

          setPartners(enrichedPartners)
          setErrorMessage(null)
        } else {
          setPartners([])
          setErrorMessage(response?.error?.message || '파트너 정보를 불러오지 못했습니다.')
        }
      } catch (error) {
        setPartners([])
        setErrorMessage(error instanceof Error ? error.message : '파트너 정보를 불러오지 못했습니다.')
      } finally {
        if (isInitial) {
          setIsInitialLoading(false)
        } else {
          setIsSearching(false)
        }
      }
    },
    [],
  )

  useEffect(() => {
    const delay = initialized ? 350 : 0
    const timeoutId = window.setTimeout(() => {
      fetchPartners(query, !initialized)
      if (!initialized) {
        setInitialized(true)
      }
    }, delay)

    return () => window.clearTimeout(timeoutId)
  }, [fetchPartners, initialized, query])

  const isQueryEmpty = !query.trim()
  const showEmptyState = !isInitialLoading && !isSearching && partners.length === 0 && !isQueryEmpty
  const { isMobile } = useDevice()

  return (
    <div className={`flex flex-col bg-white text-[#110f1a] ${isMobile ? 'h-full overflow-hidden' : 'min-h-screen'}`}>
      <div className={`mx-auto w-full px-4 pb-24 pt-16 sm:px-8 flex-1 ${isMobile ? 'overflow-y-auto max-w-5xl' : 'max-w-[720px]'}`}>
        <header className="pb-5">
          <div className="flex items-center gap-3">
            <div className="flex flex-1 items-center rounded-2xl border border-gray-200 bg-gray-50/80 px-4 py-2.5 text-sm text-gray-600 shadow-sm transition focus-within:border-[#110f1a] focus-within:bg-white focus-within:text-[#110f1a] sm:text-base">
              <SearchIcon className="h-4 w-4 text-gray-400" aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="ml-3 flex-1 bg-transparent text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none sm:text-base"
                placeholder="검색"
                aria-label="파트너 검색"
                type="search"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </div>

          {isSearching ? (
            <p className="mt-32 text-md text-center text-gray-400" aria-live="polite">
              검색 중...
            </p>
          ) : showEmptyState ? (
            <div className="mt-4">
              {isPinnedLoading ? (
                <div className="grid grid-cols-3 gap-1">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="aspect-square bg-gray-100 animate-pulse rounded-sm" />
                  ))}
                </div>
              ) : pinnedPosts.length > 0 ? (
                <div className="grid grid-cols-3 gap-1">
                  {pinnedPosts.map((post) => (
                    <div
                      key={post.id}
                      className="aspect-square cursor-pointer overflow-hidden rounded-sm bg-gray-100"
                      onClick={() => navigate({ to: '/feed/$postId', params: { postId: post.id } })}
                    >
                      {post.first_media.media_type === 'video' ? (
                        <video
                          src={post.first_media.signed_url}
                          className="h-full w-full object-cover"
                          muted
                          playsInline
                          preload="metadata"
                        />
                      ) : (
                        <img
                          src={post.first_media.signed_url}
                          alt={post.partner.name || ''}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          draggable={false}
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="bg-white px-4 py-6 text-center text-sm text-gray-500">
                  표시할 파트너가 없습니다.
                </p>
              )}
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-lg font-semibold text-[#110f1a] mb-4">파트너 추천</p>
              {errorMessage && (
                <p className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                  {errorMessage}
                </p>
              )}
              {partners.map((partner) => (
                <FollowRow key={partner.id} item={partner} />
              ))}
            </div>
          )}
        </header>

      </div>
    </div>
  )
}

function CircleProfileImage({
  src,
  label,
}: {
  src?: string
  label?: string | null
}) {
  const initials = getInitialsFromName(label)
  const fallbackColor = getAvatarBgColor(label)
  const [showFallback, setShowFallback] = useState(!src)
  const [currentSrc, setCurrentSrc] = useState(src)

  useEffect(() => {
    setCurrentSrc(src)
    setShowFallback(!src)
  }, [src])

  return (
    <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-full border border-gray-100 bg-gray-50">
      {!currentSrc || showFallback ? (
        <div
          className={`flex h-full w-full items-center justify-center text-sm font-semibold text-white ${fallbackColor}`}
        >
          {initials}
        </div>
      ) : (
        <img
          src={currentSrc}
          alt={label || '파트너'}
          className="h-full w-full object-cover"
          draggable={false}
          loading="lazy"
          referrerPolicy="no-referrer"
          crossOrigin="anonymous"
          onError={() => {
            setShowFallback(true)
            setCurrentSrc(undefined)
          }}
        />
      )}
    </div>
  )
}

function FollowRow({ item }: { item: PartnerWithMember }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const authAccessToken = useAuthStore((state) => state.accessToken)
  const authRefreshToken = useAuthStore((state) => state.refreshToken)
  const syncSession = useAuthStore((state) => state.syncSession)
  const member = item.member
  const profileImage = member?.profile_image || undefined
  const partnerLabel = getPartnerDisplayLabel(item)
  const avatarLabel = getPartnerAvatarLabel(item)
  const displayName = partnerLabel
  const profileHref = member?.member_code ? `/partners/${member.member_code}` : undefined
  const status = member?.current_status ?? 'offline'
  const statusColor = statusColorMap[status] ?? 'bg-gray-400'

  const [isFollowing, setIsFollowing] = useState<boolean>(
    (item as PartnerWithMember & { is_followed?: boolean }).is_followed ?? false,
  )
  const [isProcessing, setIsProcessing] = useState(false)
  const isOwnProfile = user?.id === item.member_id

  const handleToggleFollow = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    
    if (isOwnProfile) {
      return
    }
    if (!user) {
      navigate({ to: '/login' })
      return
    }
    if (!item.id) return
    const next = !isFollowing
    setIsFollowing(next)
    setIsProcessing(true)
    try {
      await toggleFollowPartner(item.id, next, {
        accessToken: authAccessToken,
        refreshToken: authRefreshToken,
        syncSession,
      })
      // 전역 피드 캐시 업데이트 (팔로우 상태 동기화) - memberCode 사용
      const memberCode = item.member?.member_code || item.id
      updateGlobalFollowState(memberCode, next)
      toast.success(next ? '팔로우했습니다' : '팔로우를 취소했습니다', {
        duration: 2000,
      })
    } catch (error: any) {
      setIsFollowing(!next)
      // 전역 피드 캐시 롤백 - memberCode 사용
      const memberCode = item.member?.member_code || item.id
      updateGlobalFollowState(memberCode, !next)
      toast.error(error?.message || '팔로우 처리에 실패했습니다.', {
        duration: 3000,
      })
    } finally {
      setIsProcessing(false)
    }
  }, [authAccessToken, authRefreshToken, isFollowing, isOwnProfile, item.id, navigate, syncSession, user])

  useEffect(() => {
    const initial =
      (item as PartnerWithMember & { is_followed?: boolean }).is_followed ?? false
    setIsFollowing(initial)
  }, [item])

  const content = (
    <div className="flex items-center gap-3 py-3 w-full">
      <div className="relative flex-shrink-0">
        <CircleProfileImage
          src={profileImage}
          label={avatarLabel}
        />
        {status !== 'offline' && (
          <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${statusColor}`} />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#110f1a] truncate">
          {displayName || '소개 준비 중'}
        </p>
        <p className="text-xs text-gray-400 truncate">
          @{member?.member_code || ''}
        </p>
      </div>
      {!isOwnProfile && (
        <button
          type="button"
          disabled={isProcessing}
          onClick={handleToggleFollow}
          className={`flex-shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition ${
            isFollowing
              ? 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
              : 'bg-[#110f1a] text-white hover:bg-[#241f3f]'
          } ${isProcessing ? 'opacity-70 cursor-not-allowed' : ''}`}
        >
          {isProcessing ? '...' : isFollowing ? '팔로잉' : '팔로우'}
        </button>
      )}
    </div>
  )

  return (
    <div 
      className="border-b border-gray-100 last:border-b-0 cursor-pointer hover:bg-gray-50 transition-colors px-1"
      onClick={() => {
        if (profileHref) {
          navigate({ to: '/partners/$memberCode', params: { memberCode: member?.member_code || '' } })
        }
      }}
    >
      {content}
    </div>
  )
}

