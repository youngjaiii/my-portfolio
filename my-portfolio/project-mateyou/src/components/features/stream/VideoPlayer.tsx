/**
 * VideoPlayer - 비디오 플레이어 컴포넌트
 * 
 * 호스트/시청자 비디오 스트림을 표시하는 공통 컴포넌트
 */

import { useEffect, useState } from 'react'

interface VideoPlayerProps {
  videoRef: React.RefObject<HTMLVideoElement>
  roomTitle?: string
  hostName?: string
  hostInitial?: string
  isConnecting?: boolean
  className?: string
  isFlipped?: boolean
}

export function VideoPlayer({
  videoRef,
  roomTitle,
  hostName,
  hostInitial,
  isConnecting = false,
  className = '',
  isFlipped = false,
}: VideoPlayerProps) {
  const [hasStream, setHasStream] = useState(false)

  // 스트림 상태 추적
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const checkStream = () => {
      setHasStream(video.srcObject !== null && video.srcObject !== undefined)
    }

    // 초기 체크
    checkStream()

    // srcObject 변화 감지를 위한 MutationObserver는 사용하지 않고
    // 주기적으로 체크하거나 이벤트 리스너 사용
    const interval = setInterval(checkStream, 100)

    return () => clearInterval(interval)
  }, [videoRef])

  return (
    <div className={`relative w-full h-full ${className}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={false}
        preload="none"
        className={`w-full h-full object-contain ${isFlipped ? 'scale-x-[-1]' : ''}`}
        style={{
          transform: isFlipped ? 'scaleX(-1)' : 'translateZ(0)',
          willChange: 'contents',
        }}
      />
      {!hasStream && (
        <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#1a1825] to-[#110f1a]">
          <div className="w-32 h-32 rounded-full bg-gradient-to-br from-[#FE3A8F] to-[#ff6b9d] flex items-center justify-center mb-6 shadow-lg shadow-[#FE3A8F]/30">
            <span className="text-5xl font-bold text-white">
              {hostInitial?.charAt(0)?.toUpperCase() || 'U'}
            </span>
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">
            {roomTitle || '방송 대기 중'}
          </h3>
          {isConnecting ? (
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-[#FE3A8F] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-[#FE3A8F] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-[#FE3A8F] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-gray-400">연결 중...</span>
            </div>
          ) : (
            <span className="text-gray-400">방송 대기 중</span>
          )}
        </div>
      )}
    </div>
  )
}

