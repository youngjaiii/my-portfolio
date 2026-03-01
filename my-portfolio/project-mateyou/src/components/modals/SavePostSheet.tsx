import { useState, useEffect, useCallback, useRef } from 'react'
import { Bookmark, Plus, X } from 'lucide-react'
import { SlideSheet } from '@/components'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/useAuthStore'
import { useDevice } from '@/hooks/useDevice'
import { resolveAccessToken } from '@/utils/sessionToken'
import { toast } from '@/components/ui/sonner'

interface Album {
  id: string
  title: string
  thumbnail_url?: string | null
  post_count?: number
  created_at?: string
}

interface SavedPostInfo {
  post_id: string
  thumbnail_url?: string
  album_id?: string
  member_code?: string | null // 워터마크용
}

interface SavePostSheetProps {
  isOpen: boolean
  onClose: () => void
  savedPost?: SavedPostInfo | null
  onUnsave?: () => void
}

export function SavePostSheet({ isOpen, onClose, savedPost, onUnsave }: SavePostSheetProps) {
  const { user } = useAuth()
  const { accessToken: authAccessToken, refreshToken: authRefreshToken, syncSession } = useAuthStore()
  const { isMobile } = useDevice()
  
  const [albums, setAlbums] = useState<Album[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isAddingToAlbum, setIsAddingToAlbum] = useState<string | null>(null)
  const [showNewCollectionScreen, setShowNewCollectionScreen] = useState(false)
  const [newAlbumTitle, setNewAlbumTitle] = useState('')
  const [isCreatingAlbum, setIsCreatingAlbum] = useState(false)
  
  // 무한 호출 방지를 위한 ref
  const hasFetchedRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const getAccessToken = useCallback(async () => {
    return resolveAccessToken({
      accessToken: authAccessToken,
      refreshToken: authRefreshToken,
      syncSession,
    })
  }, [authAccessToken, authRefreshToken, syncSession])

  // 비디오에서 썸네일 캡쳐
  const captureVideoThumbnail = useCallback((videoUrl: string): Promise<string | null> => {
    return new Promise((resolve) => {
      const video = document.createElement('video')
      video.crossOrigin = 'anonymous'
      video.muted = true
      video.preload = 'metadata'
      
      const timeoutId = setTimeout(() => {
        video.src = ''
        resolve(null)
      }, 5000)
      
      video.onloadeddata = () => {
        video.currentTime = 0.1
      }
      
      video.onseeked = () => {
        clearTimeout(timeoutId)
        try {
          const canvas = document.createElement('canvas')
          canvas.width = video.videoWidth || 320
          canvas.height = video.videoHeight || 240
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
            const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
            resolve(dataUrl)
          } else {
            resolve(null)
          }
        } catch {
          resolve(null)
        } finally {
          video.src = ''
        }
      }
      
      video.onerror = () => {
        clearTimeout(timeoutId)
        resolve(null)
      }
      
      video.src = videoUrl
    })
  }, [])

  // 앨범 데이터 변환 (워터마크 포함)
  const processAlbumsWithThumbnails = useCallback(async (albumsData: any[]): Promise<Album[]> => {
    const processedAlbums = await Promise.all(albumsData.map(async (album: any) => {
      // thumbnail이 객체인 경우 signed_url 추출
      let thumbnailUrl: string | null = null
      let isVideo = false
      
      if (album.thumbnail) {
        if (typeof album.thumbnail === 'object') {
          thumbnailUrl = album.thumbnail.signed_url || null
          isVideo = album.thumbnail.media_type === 'video'
        } else if (typeof album.thumbnail === 'string') {
          thumbnailUrl = album.thumbnail
          isVideo = /\.(mp4|webm|mov|avi)$/i.test(thumbnailUrl)
        }
      } else if (album.thumbnail_url) {
        thumbnailUrl = album.thumbnail_url
        isVideo = /\.(mp4|webm|mov|avi)$/i.test(thumbnailUrl)
      }
      
      return {
        id: album.id,
        title: album.title,
        thumbnail_url: thumbnailUrl,
        post_count: album.count ?? album.post_count ?? 0,
        created_at: album.created_at,
      }
    }))
    
    return processedAlbums
  }, [])

  // 앨범 목록 불러오기
  const fetchAlbums = useCallback(async () => {
    if (!user) return
    
    setIsLoading(true)
    try {
      const token = await getAccessToken()
      if (!token) return

      const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

      const response = await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/api-albums`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
        },
      })

      const result = await response.json()
      if (result.success && result.data) {
        const processedAlbums = await processAlbumsWithThumbnails(result.data)
        setAlbums(processedAlbums)
      }
    } catch (error) {
      console.error('앨범 목록 불러오기 실패:', error)
    } finally {
      setIsLoading(false)
    }
  }, [user?.id, getAccessToken, processAlbumsWithThumbnails])

  // isOpen 변경 시 한 번만 호출
  useEffect(() => {
    if (isOpen && !hasFetchedRef.current) {
      hasFetchedRef.current = true
      fetchAlbums()
      setShowNewCollectionScreen(false)
      setNewAlbumTitle('')
    }
    
    if (!isOpen) {
      // 팝업 닫힐 때 플래그 리셋
      hasFetchedRef.current = false
      setShowNewCollectionScreen(false)
      setNewAlbumTitle('')
    }
  }, [isOpen]) // fetchAlbums 의존성 제거

  // 앨범 생성 + 현재 포스트 자동 추가
  const handleCreateAlbum = async () => {
    if (!newAlbumTitle.trim() || isCreatingAlbum) return

    setIsCreatingAlbum(true)
    try {
      const token = await getAccessToken()
      if (!token) return

      const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

      // 1. 앨범 생성
      const response = await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/api-albums`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: newAlbumTitle.trim() }),
      })

      const result = await response.json()
      if (result.success && result.data?.id) {
        const newAlbumId = result.data.id

        // 2. 현재 저장된 포스트를 새 앨범에 자동 추가
        if (savedPost?.post_id) {
          try {
            const addResponse = await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/api-album-posts`, {
              method: 'PUT',
              headers: {
                Authorization: `Bearer ${token}`,
                apikey: SUPABASE_ANON_KEY,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                album_id: newAlbumId,
                post_id: savedPost.post_id,
              }),
            })

            const addResult = await addResponse.json()
            if (addResult.success) {
              toast.success('컬렉션이 생성되고 게시물이 추가되었습니다')
            } else {
              toast.success('컬렉션이 생성되었습니다')
              console.warn('포스트 추가 실패:', addResult.error)
            }
          } catch (addError) {
            toast.success('컬렉션이 생성되었습니다')
            console.warn('포스트 추가 실패:', addError)
          }
        } else {
          toast.success('컬렉션이 생성되었습니다')
        }

        setNewAlbumTitle('')
        setShowNewCollectionScreen(false)
        fetchAlbums()
      } else {
        toast.error(result.error || '컬렉션 생성에 실패했습니다')
      }
    } catch (error) {
      console.error('앨범 생성 실패:', error)
      toast.error('컬렉션 생성에 실패했습니다')
    } finally {
      setIsCreatingAlbum(false)
    }
  }

  // 새 컬렉션 화면 열기
  const openNewCollectionScreen = () => {
    setShowNewCollectionScreen(true)
    setNewAlbumTitle('')
    // 약간의 딜레이 후 input에 포커스
    setTimeout(() => {
      inputRef.current?.focus()
    }, 100)
  }

  // 새 컬렉션 화면 닫기
  const closeNewCollectionScreen = () => {
    setShowNewCollectionScreen(false)
    setNewAlbumTitle('')
  }

  // 앨범에 포스트 추가
  const handleAddToAlbum = async (albumId: string) => {
    if (!savedPost?.post_id || isAddingToAlbum) return

    setIsAddingToAlbum(albumId)
    try {
      const token = await getAccessToken()
      if (!token) return

      const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

      const response = await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/api-album-posts`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          album_id: albumId,
          post_id: savedPost.post_id,
        }),
      })

      const result = await response.json()
      if (result.success) {
        toast.success('컬렉션에 추가되었습니다')
        
        // PUT 응답의 data 배열로 앨범 목록 직접 업데이트 (썸네일, 갯수 포함)
        if (result.data && Array.isArray(result.data)) {
          const processedAlbums = await processAlbumsWithThumbnails(result.data)
          setAlbums(processedAlbums)
        }
        
        // 팝업 닫기
        onClose()
      } else {
        toast.error(result.error || '추가에 실패했습니다')
      }
    } catch (error) {
      console.error('앨범에 추가 실패:', error)
      toast.error('추가에 실패했습니다')
    } finally {
      setIsAddingToAlbum(null)
    }
  }

  // 저장 취소
  const handleUnsave = async () => {
    if (!savedPost?.post_id) return

    try {
      const token = await getAccessToken()
      if (!token) return

      const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

      const response = await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/api-album-posts/${savedPost.post_id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
        },
      })

      const result = await response.json()
      if (result.success) {
        toast.success('저장이 취소되었습니다')
        onUnsave?.()
        onClose()
      } else {
        toast.error(result.error || '취소에 실패했습니다')
      }
    } catch (error) {
      console.error('저장 취소 실패:', error)
      toast.error('취소에 실패했습니다')
    }
  }

  // 새 컬렉션 전체 화면 모드
  if (showNewCollectionScreen) {
    // PC 버전: 댓글 팝업과 비슷한 크기의 고정 모달
    if (!isMobile) {
      return (
        <div 
          className="fixed inset-0 z-[400] flex items-center justify-center bg-black/70 p-4 md:p-8"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeNewCollectionScreen()
            }
          }}
        >
          <div 
            className="w-full max-w-md h-auto max-h-[500px] rounded-2xl overflow-hidden shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 상단 썸네일 영역 */}
            <div className="relative h-48 flex-shrink-0">
              {savedPost?.thumbnail_url ? (
                <img
                  src={savedPost.thumbnail_url}
                  alt="게시물 이미지"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 w-full h-full bg-gray-900" />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-black/40 to-transparent" />
            </div>
            
            {/* 하단 입력 영역 */}
            <div className="bg-white p-6 flex flex-col gap-4">
              <h2 className="text-lg font-semibold text-gray-900 text-center">새 컬렉션</h2>
              
              <input
                ref={inputRef}
                type="text"
                value={newAlbumTitle}
                onChange={(e) => setNewAlbumTitle(e.target.value)}
                placeholder="컬렉션 이름"
                className="w-full text-base text-gray-900 placeholder-gray-400 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-[#FE3A8F] focus:ring-1 focus:ring-[#FE3A8F]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newAlbumTitle.trim()) {
                    handleCreateAlbum()
                  }
                }}
              />
              
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closeNewCollectionScreen}
                  className="flex-1 py-3 text-sm font-semibold text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleCreateAlbum}
                  disabled={!newAlbumTitle.trim() || isCreatingAlbum}
                  className="flex-1 py-3 text-sm font-semibold text-white bg-[#FE3A8F] rounded-xl hover:bg-[#e8357f] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isCreatingAlbum ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )
    }
    
    // 모바일 버전: 전체 화면
    return (
      <div 
        className="fixed inset-0 z-[400]"
        style={{ height: '100dvh' }}
      >
        {/* 배경 이미지 - 전체 화면 커버 */}
        {savedPost?.thumbnail_url ? (
          <img
            src={savedPost.thumbnail_url}
            alt="게시물 이미지"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 w-full h-full bg-gray-900" />
        )}

        {/* 오버레이 콘텐츠 */}
        <div className="relative z-10 flex flex-col h-full">
          {/* 헤더 */}
          <div className="flex items-center justify-between px-4 py-3 pt-safe">
            <button
              type="button"
              onClick={closeNewCollectionScreen}
              className="text-white text-sm font-medium"
            >
              취소
            </button>
            <h2 className="text-white text-base font-semibold">새 컬렉션</h2>
            <button
              type="button"
              onClick={handleCreateAlbum}
              disabled={!newAlbumTitle.trim() || isCreatingAlbum}
              className="text-[#FE3A8F] text-sm font-semibold disabled:opacity-40"
            >
              {isCreatingAlbum ? '저장 중...' : '저장'}
            </button>
          </div>

          {/* 빈 공간 (이미지가 보이는 영역) */}
          <div className="flex-1" />

          {/* 하단 입력 영역 */}
          <div 
            className="px-4 py-4"
            style={{
              paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
            }}
          >
            {/* 짙은 회색 배경 박스 */}
            <div className="bg-neutral-800 rounded-xl px-4 py-3">
              <input
                ref={inputRef}
                type="text"
                value={newAlbumTitle}
                onChange={(e) => setNewAlbumTitle(e.target.value)}
                placeholder="컬렉션 이름"
                className="w-full text-base text-white placeholder-neutral-500 bg-transparent border-none outline-none"
                style={{ background: 'none', border: 'none' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newAlbumTitle.trim()) {
                    handleCreateAlbum()
                  }
                }}
              />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <SlideSheet
      isOpen={isOpen}
      onClose={onClose}
      initialHeight={0.5}
      minHeight={0.3}
      maxHeight={0.7}
      zIndex={300}
    >
      <div className="flex flex-col h-full px-4">
        {/* 헤더: 포스트 썸네일 + 저장됨 + 북마크 취소 버튼 */}
        {savedPost && (
          <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
            {savedPost.thumbnail_url ? (
              <img
                src={savedPost.thumbnail_url}
                alt="저장된 포스트"
                className="w-12 h-12 rounded-lg object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-gray-200 flex items-center justify-center">
                <Bookmark className="h-5 w-5 text-gray-400" />
              </div>
            )}
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">저장됨</p>
              <p className="text-xs text-gray-500">내 컬렉션에 저장되었습니다</p>
            </div>
            <button
              type="button"
              onClick={handleUnsave}
              className="p-2 text-[#FE3A8F] hover:bg-[#FE3A8F]/10 rounded-full transition-colors"
            >
              <Bookmark className="h-5 w-5 fill-current" />
            </button>
          </div>
        )}

        {/* 내 컬렉션 타이틀 + 새 컬렉션 추가 */}
        <div className="flex items-center justify-between py-3">
          <p className="text-sm font-semibold text-gray-900">내 컬렉션</p>
          <button
            type="button"
            onClick={openNewCollectionScreen}
            className="text-xs text-[#FE3A8F] font-medium hover:underline"
          >
            + 새 컬렉션
          </button>
        </div>

        {/* 앨범 리스트 - '저장됨' 기본 앨범 제외 */}
        <div className="flex-1 overflow-y-auto -mx-4 px-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-[#FE3A8F] border-t-transparent" />
            </div>
          ) : albums.filter(album => album.title !== '저장됨').length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-400">
              <Bookmark className="h-8 w-8 mb-2" />
              <p className="text-sm">아직 컬렉션이 없습니다</p>
              <p className="text-xs mt-1">새 컬렉션을 만들어보세요</p>
            </div>
          ) : (
            <div className="space-y-2">
              {albums
                .filter(album => album.title !== '저장됨')
                .map((album) => (
                <div
                  key={album.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {album.thumbnail_url ? (
                    <img
                      src={album.thumbnail_url}
                      alt={album.title}
                      className="w-10 h-10 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center">
                      <Bookmark className="h-4 w-4 text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{album.title}</p>
                    <p className="text-xs text-gray-400">{album.post_count ?? 0}개</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddToAlbum(album.id)}
                    disabled={isAddingToAlbum === album.id}
                    className="p-2 text-gray-400 hover:text-[#FE3A8F] hover:bg-[#FE3A8F]/10 rounded-full transition-colors disabled:opacity-50"
                  >
                    {isAddingToAlbum === album.id ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-[#FE3A8F] border-t-transparent" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </SlideSheet>
  )
}

export default SavePostSheet

