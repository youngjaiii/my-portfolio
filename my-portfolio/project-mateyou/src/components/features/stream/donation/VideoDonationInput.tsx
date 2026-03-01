/**
 * VideoDonationInput - 영상 도네이션 입력 컴포넌트
 */

import { Typography } from '@/components/ui/Typography'
import { AlertCircle, Loader2, Video, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { YoutubeVideoInfo } from './types'

interface VideoDonationInputProps {
  videoUrl: string
  onVideoUrlChange: (url: string) => void
  videoInfo: YoutubeVideoInfo | null
  onVideoInfoChange: (info: YoutubeVideoInfo | null) => void
}

// 유튜브 URL에서 비디오 ID 추출
function extractYoutubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

// 유튜브 영상 정보 가져오기 (noembed API 사용 - CORS 지원)
async function fetchYoutubeInfo(
  videoId: string
): Promise<YoutubeVideoInfo | null> {
  try {
    // noembed.com은 CORS를 지원하는 무료 oEmbed 프록시
    const response = await fetch(
      `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`
    )
    if (!response.ok) return null

    const data = await response.json()
    
    // noembed가 에러를 반환하는 경우 처리
    if (data.error) {
      console.warn('noembed 에러:', data.error)
      return null
    }

    return {
      videoId,
      title: data.title || '제목 없음',
      thumbnail: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
      channelTitle: data.author_name || '채널명 없음',
      duration: '', // oEmbed에서는 duration 제공 안함
    }
  } catch (err) {
    console.error('유튜브 정보 가져오기 실패:', err)
    return null
  }
}

export function VideoDonationInput({
  videoUrl,
  onVideoUrlChange,
  videoInfo,
  onVideoInfoChange,
}: VideoDonationInputProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // URL 변경 시 영상 정보 가져오기
  useEffect(() => {
    const fetchInfo = async () => {
      if (!videoUrl.trim()) {
        onVideoInfoChange(null)
        setError(null)
        return
      }

      const videoId = extractYoutubeVideoId(videoUrl)
      if (!videoId) {
        setError('올바른 유튜브 링크가 아닙니다')
        onVideoInfoChange(null)
        return
      }

      setIsLoading(true)
      setError(null)

      const info = await fetchYoutubeInfo(videoId)
      if (info) {
        onVideoInfoChange(info)
      } else {
        setError('영상 정보를 가져올 수 없습니다')
        onVideoInfoChange(null)
      }

      setIsLoading(false)
    }

    // 디바운스
    const timer = setTimeout(fetchInfo, 500)
    return () => clearTimeout(timer)
  }, [videoUrl, onVideoInfoChange])

  const handleClear = () => {
    onVideoUrlChange('')
    onVideoInfoChange(null)
    setError(null)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Video className="w-4 h-4 text-red-500" />
        <Typography variant="body2" className="font-medium text-gray-700">
          유튜브 링크
        </Typography>
      </div>

      {/* URL 입력 */}
      <div className="relative">
        <input
          type="url"
          value={videoUrl}
          onChange={(e) => onVideoUrlChange(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className={`w-full px-4 py-3 pr-10 text-sm border rounded-xl focus:outline-none focus:ring-2 ${
            error
              ? 'border-red-300 focus:ring-red-200 focus:border-red-400'
              : 'border-gray-200 focus:ring-red-200 focus:border-red-400'
          }`}
        />
        {videoUrl && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* 로딩 */}
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          영상 정보를 가져오는 중...
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* 영상 미리보기 */}
      {videoInfo && (
        <div className="flex gap-3 p-3 bg-red-50 rounded-xl border border-red-100">
          <img
            src={videoInfo.thumbnail}
            alt={videoInfo.title}
            className="w-24 h-16 object-cover rounded-lg flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 line-clamp-2">
              {videoInfo.title}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {videoInfo.channelTitle}
            </p>
          </div>
        </div>
      )}

      <p className="text-[11px] text-gray-500">
        🎬 영상 도네이션은 비디오룸에서만 재생됩니다. 호스트가 재생 여부를
        결정합니다.
      </p>
    </div>
  )
}

