import { useState, useEffect, useCallback } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Bookmark, Grid3X3 } from 'lucide-react'
import { SlideSheet } from '@/components'
import { useAuthStore } from '@/store/useAuthStore'
import { resolveAccessToken } from '@/utils/sessionToken'
import { toast } from '@/components/ui/sonner'
import { CaptureProtection } from '@/components/CaptureProtection'
import { useAuth } from '@/hooks/useAuth'

const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const Route = createFileRoute('/mypage/saved/')({
  component: SavedPage,
})

interface Album {
  id: string
  title: string
  thumbnail?: string | null // API에서 넘어오는 썸네일 URL
  thumbnail_url?: string | null // 기존 필드 (호환성)
  post_count?: number
  created_at?: string
  is_default?: boolean
  member_code?: string | null // 워터마크용
}

// 비디오 URL인지 확인하는 함수
const isVideoUrl = (url: string): boolean => {
  if (!url) return false
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v']
  const lowerUrl = url.toLowerCase()
  return videoExtensions.some(ext => lowerUrl.includes(ext)) || lowerUrl.includes('video')
}

// 앨범별 member_code 매핑 타입
interface AlbumMemberCodeMap {
  [albumId: string]: string | null
}

function SavedPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const authAccessToken = useAuthStore((state) => state.accessToken)
  const authRefreshToken = useAuthStore((state) => state.refreshToken)
  const syncSession = useAuthStore((state) => state.syncSession)
  
  const [albums, setAlbums] = useState<Album[]>([])
  const [allPostsCount, setAllPostsCount] = useState(0)
  const [allPostsThumbnail, setAllPostsThumbnail] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAddAlbumSheetOpen, setIsAddAlbumSheetOpen] = useState(false)
  const [newAlbumName, setNewAlbumName] = useState('')
  const [isCreatingAlbum, setIsCreatingAlbum] = useState(false)
  const [albumMemberCodes, setAlbumMemberCodes] = useState<AlbumMemberCodeMap>({})

  const getAccessToken = useCallback(async () => {
    return resolveAccessToken({
      accessToken: authAccessToken,
      refreshToken: authRefreshToken,
      syncSession,
    })
  }, [authAccessToken, authRefreshToken, syncSession])

  // 전역 헤더에서 + 버튼 클릭 이벤트 수신
  useEffect(() => {
    const handleOpenAddAlbumSheet = () => {
      setIsAddAlbumSheetOpen(true)
    }
    
    window.addEventListener('openAddAlbumSheet', handleOpenAddAlbumSheet)
    return () => {
      window.removeEventListener('openAddAlbumSheet', handleOpenAddAlbumSheet)
    }
  }, [])

  // 전체 게시물 카운트 계산 (앨범 목록에서 합산)
  const calculateAllPostsInfo = useCallback((albumList: Album[]) => {
    const totalCount = albumList.reduce((sum, album) => sum + (album.post_count || 0), 0)
    setAllPostsCount(totalCount)
    
    // 첫 번째 앨범의 썸네일을 전체 게시물 썸네일로 사용
    const firstAlbumWithThumbnail = albumList.find(album => album.thumbnail_url)
    if (firstAlbumWithThumbnail) {
      setAllPostsThumbnail(firstAlbumWithThumbnail.thumbnail_url || null)
    }
  }, [])

  // 앨범별 member_code 가져오기 (각 앨범의 첫 번째 게시물에서 추출)
  const fetchAlbumMemberCodes = useCallback(async (albumIds: string[]) => {
    try {
      const token = await getAccessToken()
      if (!token || albumIds.length === 0) return

      const memberCodeMap: AlbumMemberCodeMap = {}
      
      // 병렬로 각 앨범의 게시물 정보 가져오기
      await Promise.all(albumIds.map(async (albumId) => {
        try {
          const response = await fetch(
            `${EDGE_FUNCTIONS_URL}/functions/v1/api-album-posts/list?album_id=${albumId}`,
            {
              method: 'GET',
              headers: {
                Authorization: `Bearer ${token}`,
                apikey: SUPABASE_ANON_KEY,
              },
            }
          )
          
          const result = await response.json()
          
          if (result.success && result.data && result.data.length > 0) {
            const firstPost = result.data[0]
            // partner 정보에서 member_code 추출 - 모든 가능한 경로 시도
            const partner = firstPost.partner 
              || firstPost.post?.partner 
              || firstPost.author
              || firstPost.post?.author
              || firstPost.user
              || firstPost.post?.user
              || firstPost.creator
              || firstPost.post?.creator
            
            const memberCode = partner?.member_code 
              || partner?.memberCode
              || partner?.handle
              || partner?.username
              || firstPost.member_code 
              || firstPost.memberCode
              || firstPost.post?.member_code
              || firstPost.post?.memberCode
              || firstPost.partner_member_code
              || firstPost.post?.partner_member_code
              || null
            
            if (memberCode) {
              memberCodeMap[albumId] = memberCode
            }
          }
        } catch (err) {
          console.error(`앨범 ${albumId} member_code 가져오기 실패:`, err)
        }
      }))
      
      setAlbumMemberCodes(prev => ({ ...prev, ...memberCodeMap }))
    } catch (error) {
      console.error('앨범별 member_code 불러오기 실패:', error)
    }
  }, [getAccessToken])

  // 앨범 목록 불러오기
  const fetchAlbums = useCallback(async () => {
    setIsLoading(true)
    try {
      const token = await getAccessToken()
      if (!token) return

      const response = await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/api-albums`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
        },
      })

      const result = await response.json()
      if (result.success && result.data) {
        const processedAlbums = result.data.map((album: any) => {
          let thumbnailUrl: string | null = null
          let isVideoThumbnail = false
          let memberCode: string | null = null
          
          if (album.thumbnail) {
            if (typeof album.thumbnail === 'object') {
              thumbnailUrl = album.thumbnail.signed_url || null
              isVideoThumbnail = album.thumbnail.media_type?.includes('video') || (thumbnailUrl ? isVideoUrl(thumbnailUrl) : false)
              // thumbnail 객체 내 partner 정보에서 member_code 추출
              memberCode = album.thumbnail.partner?.member_code || album.thumbnail.member_code || null
            } else if (typeof album.thumbnail === 'string') {
              thumbnailUrl = album.thumbnail
              isVideoThumbnail = isVideoUrl(thumbnailUrl)
            }
          } else if (album.thumbnail_url) {
            thumbnailUrl = album.thumbnail_url
            isVideoThumbnail = isVideoUrl(thumbnailUrl)
          }
          
          // 파트너의 member_code 추출 (워터마크용) - 다양한 경로에서 시도
          if (!memberCode) {
            memberCode = album.partner?.member_code 
              || album.member_code 
              || album.first_post?.partner?.member_code
              || album.posts?.[0]?.partner?.member_code
              || null
          }
          
          return {
            id: album.id,
            title: album.title,
            thumbnail_url: thumbnailUrl,
            is_video_thumbnail: isVideoThumbnail,
            post_count: album.count ?? album.post_count ?? 0,
            created_at: album.created_at,
            is_default: album.is_default || false,
            member_code: memberCode,
          }
        })
        
        // '저장됨' 폴더를 첫 번째로 정렬
        const sortedAlbums = processedAlbums.sort((a, b) => {
          // '저장됨' 폴더 또는 is_default가 true인 폴더를 우선
          const aIsDefault = a.is_default || a.title === '저장됨'
          const bIsDefault = b.is_default || b.title === '저장됨'
          
          if (aIsDefault && !bIsDefault) return -1
          if (!aIsDefault && bIsDefault) return 1
          
          // 둘 다 기본 폴더이거나 둘 다 아닌 경우, '저장됨' 제목을 가진 것을 우선
          if (a.title === '저장됨' && b.title !== '저장됨') return -1
          if (a.title !== '저장됨' && b.title === '저장됨') return 1
          
          // 나머지는 생성일 기준 정렬 (최신순)
          const aDate = a.created_at ? new Date(a.created_at).getTime() : 0
          const bDate = b.created_at ? new Date(b.created_at).getTime() : 0
          return bDate - aDate
        })
        
        setAlbums(sortedAlbums)
        
        // 전체 게시물 정보 계산 (앨범 목록에서 합산)
        calculateAllPostsInfo(sortedAlbums)
        
        // 앨범별 member_code 가져오기
        const albumIds = processedAlbums
          .filter((a: Album) => !a.member_code) // member_code가 없는 앨범만
          .map((a: Album) => a.id)
        if (albumIds.length > 0) {
          fetchAlbumMemberCodes(albumIds)
        }
      }
    } catch (error) {
      console.error('앨범 목록 불러오기 실패:', error)
    } finally {
      setIsLoading(false)
    }
  }, [getAccessToken, fetchAlbumMemberCodes, calculateAllPostsInfo])

  useEffect(() => {
    fetchAlbums()
  }, [fetchAlbums])

  // 앨범 생성
  const handleCreateAlbum = async () => {
    if (!newAlbumName.trim()) return
    
    setIsCreatingAlbum(true)
    try {
      const token = await getAccessToken()
      if (!token) return

      const response = await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/api-albums`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: newAlbumName.trim() }),
      })

      const result = await response.json()
      if (result.success) {
        toast.success('컬렉션이 생성되었습니다')
        setNewAlbumName('')
        setIsAddAlbumSheetOpen(false)
        fetchAlbums()
      } else {
        toast.error(result.error || '생성에 실패했습니다')
      }
    } catch (error) {
      console.error('앨범 생성 실패:', error)
      toast.error('생성에 실패했습니다')
    } finally {
      setIsCreatingAlbum(false)
    }
  }

  // 앨범 클릭 핸들러
  const handleAlbumClick = (albumId: string) => {
    navigate({ to: '/mypage/saved/$albumId', params: { albumId } })
  }

  // 전체 게시물 클릭 핸들러
  const handleAllPostsClick = () => {
    navigate({ to: '/mypage/saved/$albumId', params: { albumId: 'all' } })
  }

  return (
    <CaptureProtection>
    <div className="min-h-screen pb-20">
      {/* Navigation은 __root.tsx에서 전역 처리 */}
      <div className="mx-auto w-full max-w-5xl px-4 pb-8 pt-16 sm:px-8">
        <div className="mt-8">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#FE3A8F] border-t-transparent" />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">

              {/* 앨범 목록 */}
              {albums.map((album) => {
                // API에서 넘어오는 thumbnail 값 사용
                const displayThumbnail = album.thumbnail || album.thumbnail_url
                // 워터마크는 현재 로그인한 사용자의 member_code (유출자 추적용)
                const watermarkCode = user?.member_code || 'unknown'
                
                return (
                  <button
                    key={album.id}
                    type="button"
                    onClick={() => handleAlbumClick(album.id)}
                    className="text-left"
                  >
                    <div className="aspect-square rounded-xl overflow-hidden bg-gray-100 relative shadow-md hover:shadow-lg transition-shadow">
                      {displayThumbnail ? (
                        <>
                          <img
                            src={displayThumbnail}
                            alt={album.title}
                            className="w-full h-full object-cover"
                            draggable={false}
                            onContextMenu={(e) => e.preventDefault()}
                          />
                          {/* 워터마크 오버레이 - 항상 표시 */}
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
                                gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                                gap: '40px 20px',
                                padding: '15px',
                              }}
                            >
                              {Array.from({ length: 50 }).map((_, i) => (
                                <span
                                  key={i}
                                  className="text-white font-bold whitespace-nowrap"
                                  style={{
                                    fontSize: '9px',
                                    opacity: 0.15,
                                    textShadow: '1px 1px 2px rgba(0,0,0,0.5)',
                                  }}
                                >
                                  @{watermarkCode}
                                </span>
                              ))}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-white">
                          <Bookmark className="h-8 w-8 text-gray-300" />
                        </div>
                      )}
                    </div>
                    <div className="mt-2">
                      <p className="text-sm font-semibold text-[#110f1a] truncate">{album.title}</p>
                      <p className="text-xs text-gray-400">{album.post_count ?? 0}개</p>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* 새 컬렉션 추가 슬라이드 시트 */}
      <SlideSheet
        isOpen={isAddAlbumSheetOpen}
        onClose={() => {
          setIsAddAlbumSheetOpen(false)
          setNewAlbumName('')
        }}
        title="새 컬렉션"
        footer={
          <button
            type="button"
            onClick={handleCreateAlbum}
            disabled={!newAlbumName.trim() || isCreatingAlbum}
            className="w-full py-3 bg-[#FE3A8F] text-white rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreatingAlbum ? '생성 중...' : '저장'}
          </button>
        }
      >
        <div className="px-2 py-4">
          <input
            type="text"
            value={newAlbumName}
            onChange={(e) => setNewAlbumName(e.target.value)}
            placeholder="컬렉션 이름"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#FE3A8F]"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newAlbumName.trim()) {
                handleCreateAlbum()
              }
            }}
          />
        </div>
      </SlideSheet>
    </div>
    </CaptureProtection>
  )
}
