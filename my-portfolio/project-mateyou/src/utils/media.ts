import { supabase } from '@/lib/supabase'

const ABSOLUTE_URL_REGEX = /^https?:\/\//i
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, '') || ''

const buildStoragePublicUrl = (path: string) => {
  if (!SUPABASE_URL) return ''
  const normalizedPath = path.replace(/^\/+/, '')
  return `${SUPABASE_URL}/storage/v1/object/public/post-media/${normalizedPath}`
}

const resolveStoragePath = (path: string) => {
  try {
    const { data } = supabase.storage.from('post-media').getPublicUrl(path)
    if (data?.publicUrl && ABSOLUTE_URL_REGEX.test(data.publicUrl)) {
      return data.publicUrl
    }
  } catch (error) {
    console.warn('Failed to resolve storage public URL via getPublicUrl:', path, error)
  }

  const fallback = buildStoragePublicUrl(path)
  if (fallback) {
    return fallback
  }

  console.warn('Unable to resolve media path to URL:', path)
  return ''
}

const resolveSignedStoragePath = async (path: string) => {
  try {
    const result = await supabase.storage.from('post-media').createSignedUrl(path, 60 * 60 * 24)
    if (result?.data?.signedUrl) {
      return result.data.signedUrl
    }
  } catch (error) {
    console.warn('Failed to create signed storage URL:', path, error)
  }

  return resolveStoragePath(path)
}

export type NormalizedMedia = {
  type: 'image' | 'video'
  src: string
}

export interface ApiPostMediaRecord {
  media_type?: string | null
  media_full_url?: string | null
  signed_url?: string | null
  media_url?: string | null
  path?: string | null
  url?: string | null
  point_price?: number | null // 개별 미디어 가격
}

/**
 * API에서 내려오는 미디어 파일 정보를 FeedMedia 형태로 변환한다.
 */
export function mapApiFilesToMedia(files: Array<ApiPostMediaRecord | null | undefined>): Array<NormalizedMedia & { point_price?: number | null; signed_url?: string | null }> {
  if (!Array.isArray(files)) return []

  return files.map((file) => {
    const normalized = file ?? {}
    const type: 'image' | 'video' = normalized.media_type === 'video' ? 'video' : 'image'

    // signed_url이 있으면 우선 사용
    if (normalized.signed_url) {
      return { type, src: normalized.signed_url }
    }

    if (normalized.media_full_url) {
      return { type, src: normalized.media_full_url }
    }

    const rawPath = normalized.media_url || normalized.path || normalized.url || ''
    if (!rawPath) {
      return { type, src: '' }
    }

    if (ABSOLUTE_URL_REGEX.test(rawPath)) {
      return { type, src: rawPath }
    }

    return { type, src: resolveStoragePath(rawPath) }
  })
}

export async function mapApiFilesToMediaWithSignedUrls(
  files: Array<ApiPostMediaRecord | null | undefined>,
): Promise<NormalizedMedia[]> {
  if (!Array.isArray(files)) return []

  return Promise.all(
    files.map(async (file) => {
      const normalized = file ?? {}
      const type: 'image' | 'video' = normalized.media_type === 'video' ? 'video' : 'image'

      if (normalized.media_full_url) {
        return { type, src: normalized.media_full_url }
      }

      if (normalized.signed_url) {
        return { type, src: normalized.signed_url }
      }

      const rawPath = normalized.media_url || normalized.path || normalized.url || ''
      if (!rawPath) {
        return { type, src: '' }
      }

      if (ABSOLUTE_URL_REGEX.test(rawPath)) {
        return { type, src: rawPath }
      }

      const signedUrl = await resolveSignedStoragePath(rawPath)
      return { type, src: signedUrl }
    }),
  )
}

/**
 * 비디오 URL에서 첫 프레임을 캡처하여 썸네일 데이터 URL을 반환합니다.
 * @param videoUrl 비디오 URL
 * @param seekTime 캡처할 시간 (초), 기본값 0.5초
 * @param maxSize 최대 썸네일 크기 (픽셀), 기본값 600px
 * @returns 썸네일 데이터 URL (실패시 null)
 */
export function captureVideoThumbnail(
  videoUrl: string, 
  seekTime = 0.5,
  maxSize = 600
): Promise<string | null> {
  return new Promise((resolve) => {
    if (!videoUrl) {
      resolve(null)
      return
    }

    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.playsInline = true
    video.preload = 'metadata'
    video.setAttribute('webkit-playsinline', 'true')
    
    let isResolved = false

    const timeout = setTimeout(() => {
      if (!isResolved) {
        isResolved = true
        cleanup()
        console.warn('Video thumbnail capture timeout:', videoUrl)
        resolve(null)
      }
    }, 15000) // 타임아웃을 15초로 증가

    const cleanup = () => {
      clearTimeout(timeout)
      video.removeEventListener('loadeddata', handleLoadedData)
      video.removeEventListener('seeked', handleSeeked)
      video.removeEventListener('error', handleError)
      video.removeEventListener('canplay', handleCanPlay)
      video.pause()
      video.removeAttribute('src')
      video.load()
    }

    const handleError = (e: Event) => {
      if (isResolved) return
      isResolved = true
      console.warn('Video thumbnail load error:', videoUrl, e)
      cleanup()
      resolve(null)
    }

    const captureFrame = () => {
      try {
        const canvas = document.createElement('canvas')
        
        // 원본 크기 가져오기
        let width = video.videoWidth || 480
        let height = video.videoHeight || 270
        
        // 크기가 0이면 실패
        if (width === 0 || height === 0) {
          console.warn('Video dimensions are 0:', videoUrl)
          return null
        }
        
        // 최대 크기에 맞게 리사이즈
        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height)
          width = Math.floor(width * ratio)
          height = Math.floor(height * ratio)
        }
        
        canvas.width = width
        canvas.height = height
        
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(video, 0, 0, width, height)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
          // 유효한 데이터인지 확인
          if (dataUrl && dataUrl.length > 100) {
            return dataUrl
          }
        }
        return null
      } catch (e) {
        console.error('Video thumbnail capture error:', e)
        return null
      }
    }

    const handleSeeked = () => {
      if (isResolved) return
      
      // seeked 이벤트 후 약간 대기 (프레임 렌더링 완료 대기)
      setTimeout(() => {
        if (isResolved) return
        isResolved = true
        
        const dataUrl = captureFrame()
        cleanup()
        resolve(dataUrl)
      }, 100)
    }

    const handleCanPlay = () => {
      // canplay 시점에 seek 시도
      if (video.readyState >= 3 && video.duration > 0) {
        const targetTime = Math.min(seekTime, video.duration * 0.1)
        if (video.currentTime !== targetTime) {
          video.currentTime = targetTime
        }
      }
    }

    const handleLoadedData = () => {
      // loadeddata 시점에 seek 시도
      if (video.duration > 0) {
        video.currentTime = Math.min(seekTime, video.duration * 0.1)
      } else {
        video.currentTime = 0.1
      }
    }

    video.addEventListener('loadeddata', handleLoadedData)
    video.addEventListener('canplay', handleCanPlay)
    video.addEventListener('seeked', handleSeeked)
    video.addEventListener('error', handleError)
    
    video.src = videoUrl
    video.load()
  })
}

