/**
 * VideoDonationPlayer - 영상 도네이션 재생 오버레이
 * 
 * 화면 상단에 작게 유튜브 영상 10초 재생 (음소거)
 * 후원자 정보 간단히 표시
 */

import type { VideoPlayInfo } from '@/hooks/useVideoDonationPlayer'
import { X } from 'lucide-react'
import { useEffect } from 'react'

interface VideoDonationPlayerProps {
  video: VideoPlayInfo
  remainingTime: number
  onClose?: () => void
  isHost?: boolean
}

export function VideoDonationPlayer({
  video,
  remainingTime,
  onClose,
  isHost = false,
}: VideoDonationPlayerProps) {
  // 유튜브 임베드 URL (컨트롤 없이, 자동재생, 소리 켜짐)
  const embedUrl = `https://www.youtube.com/embed/${video.videoId}?autoplay=1&start=${Math.floor(video.startTime)}&mute=0&controls=0&modestbranding=1&rel=0&showinfo=0&fs=0&iv_load_policy=3&disablekb=1&playsinline=1`

  useEffect(() => {
    // 영상 재생 시작
  }, [video])

  return (
    <div className="fixed top-16 left-2 right-2 z-[9998] animate-in slide-in-from-top-4 duration-300">
      {/* 컨테이너 - 더 작게 */}
      <div className="relative bg-black/95 backdrop-blur-md rounded-xl overflow-hidden shadow-xl border border-white/20 max-w-[280px] mx-auto">
        {/* 상단: 후원자 정보 + 남은시간 + 닫기 */}
        <div className="flex items-center justify-between px-2 py-1.5 bg-gradient-to-r from-red-500/30 to-pink-500/30">
          <div className="flex items-center gap-1.5 min-w-0">
            {/* 프로필 */}
            <div className="w-5 h-5 rounded-full overflow-hidden bg-gradient-to-br from-red-400 to-pink-500 flex items-center justify-center flex-shrink-0">
              {video.donorProfileImage ? (
                <img
                  src={video.donorProfileImage}
                  alt={video.donorName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-white text-[8px] font-bold">
                  {video.donorName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            {/* 이름 & 금액 */}
            <div className="min-w-0 flex items-center gap-1">
              <span className="text-white text-[10px] font-medium truncate max-w-[60px]">
                {video.donorName}
              </span>
              <span className="text-amber-400 text-[10px] font-bold">
                {video.amount.toLocaleString()}P
              </span>
              <span className="text-[8px]">🎬</span>
            </div>
          </div>

          {/* 남은 시간 & 닫기 */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <div className="px-1.5 py-0.5 bg-red-500 rounded-full">
              <span className="text-white font-bold text-[9px]">
                {remainingTime}s
              </span>
            </div>
            {isHost && onClose && (
              <button
                onClick={onClose}
                className="w-5 h-5 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            )}
          </div>
        </div>

        {/* 영상 - 작게 */}
        <div className="relative w-full" style={{ height: '120px' }}>
          <iframe
            src={embedUrl}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
            title={video.videoTitle || '영상 도네이션'}
          />
          
          {/* 진행 바 */}
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20">
            <div
              className="h-full bg-gradient-to-r from-red-500 to-pink-500 transition-all duration-1000 ease-linear"
              style={{
                width: `${(remainingTime / video.duration) * 100}%`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
