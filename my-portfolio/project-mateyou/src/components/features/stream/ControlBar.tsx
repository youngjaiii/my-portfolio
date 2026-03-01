/**
 * ControlBar - 호스트 컨트롤 바 컴포넌트
 * 
 * 마이크, 카메라, 화면 공유 등 호스트 컨트롤 버튼들
 */

import { Camera, FlipHorizontal2, Mic, MicOff, Monitor, MonitorOff, Video, VideoOff } from 'lucide-react'

interface ControlBarProps {
  isMuted: boolean
  hasCamera: boolean
  isScreenSharing: boolean
  isFlipped: boolean
  onToggleMute: () => void
  onToggleVideo: () => void
  onStartScreenShare: () => void
  onStopScreenShare: () => void
  onSwitchCamera: () => void
  onToggleFlip: () => void
  variant?: 'mobile' | 'desktop'
}

export function ControlBar({
  isMuted,
  hasCamera,
  isScreenSharing,
  isFlipped,
  onToggleMute,
  onToggleVideo,
  onStartScreenShare,
  onStopScreenShare,
  onSwitchCamera,
  onToggleFlip,
  variant = 'mobile',
}: ControlBarProps) {
  const isDesktop = variant === 'desktop'
  const supportsScreenShare =
    typeof navigator !== 'undefined' && navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices

  if (isDesktop) {
    // 데스크톱: 하단 중앙에 가로 배치
    return (
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20">
        <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md rounded-full px-4 py-2">
          {/* 마이크 */}
          <ControlButton
            icon={isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            label={isMuted ? '음소거' : '마이크'}
            isActive={!isMuted}
            activeColor="green"
            inactiveColor="red"
            onClick={onToggleMute}
          />

          {/* 카메라 */}
          <ControlButton
            icon={hasCamera ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            label={hasCamera ? '카메라' : '카메라 끔'}
            isActive={hasCamera}
            activeColor="blue"
            onClick={onToggleVideo}
          />

          {/* 화면 공유 */}
          {supportsScreenShare && (
            <ControlButton
              icon={isScreenSharing ? <MonitorOff className="w-5 h-5" /> : <Monitor className="w-5 h-5" />}
              label={isScreenSharing ? '공유 중' : '화면'}
              isActive={isScreenSharing}
              activeColor="purple"
              onClick={isScreenSharing ? onStopScreenShare : onStartScreenShare}
            />
          )}

          {/* 카메라 전환 */}
          {hasCamera && (
            <ControlButton
              icon={<Camera className="w-5 h-5" />}
              label="전환"
              onClick={onSwitchCamera}
            />
          )}

          {/* 좌우 반전 */}
          {hasCamera && !isScreenSharing && (
            <ControlButton
              icon={<FlipHorizontal2 className="w-5 h-5" />}
              label="반전"
              isActive={isFlipped}
              activeColor="indigo"
              onClick={onToggleFlip}
            />
          )}
        </div>
      </div>
    )
  }

  // 모바일: 좌우 세로 배치 (기존 방식)
  return (
    <>
      {/* 좌측 컨트롤 */}
      <div className="absolute left-2 top-32 z-20 flex flex-col gap-1.5">
        <ControlButton
          icon={isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          label={isMuted ? '음소거' : '마이크'}
          isActive={!isMuted}
          activeColor="green"
          inactiveColor="red"
          onClick={onToggleMute}
        />
        <ControlButton
          icon={hasCamera ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
          label={hasCamera ? '카메라' : '카메라 끔'}
          isActive={hasCamera}
          activeColor="blue"
          onClick={onToggleVideo}
        />
      </div>

      {/* 우측 컨트롤 */}
      <div className="absolute right-2 top-32 z-20 flex flex-col gap-1.5">
        {supportsScreenShare && (
          <ControlButton
            icon={isScreenSharing ? <MonitorOff className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
            label={isScreenSharing ? '공유 중' : '화면'}
            isActive={isScreenSharing}
            activeColor="purple"
            onClick={isScreenSharing ? onStopScreenShare : onStartScreenShare}
          />
        )}
        {hasCamera && (
          <ControlButton
            icon={<Camera className="w-4 h-4" />}
            label="전환"
            onClick={onSwitchCamera}
          />
        )}
        {hasCamera && !isScreenSharing && (
          <ControlButton
            icon={<FlipHorizontal2 className="w-4 h-4" />}
            label="반전"
            isActive={isFlipped}
            activeColor="indigo"
            onClick={onToggleFlip}
          />
        )}
      </div>
    </>
  )
}

interface ControlButtonProps {
  icon: React.ReactNode
  label: string
  isActive?: boolean
  activeColor?: 'green' | 'blue' | 'purple' | 'indigo' | 'red'
  inactiveColor?: 'gray' | 'red'
  onClick: () => void
}

function ControlButton({
  icon,
  label,
  isActive = false,
  activeColor = 'blue',
  inactiveColor = 'gray',
  onClick,
}: ControlButtonProps) {
  const getBackgroundClass = () => {
    if (isActive) {
      switch (activeColor) {
        case 'green':
          return 'bg-green-500/80 hover:bg-green-500'
        case 'blue':
          return 'bg-blue-500/80 hover:bg-blue-500'
        case 'purple':
          return 'bg-purple-500/80 hover:bg-purple-500'
        case 'indigo':
          return 'bg-indigo-500/80 hover:bg-indigo-500'
        case 'red':
          return 'bg-red-500/80 hover:bg-red-500'
        default:
          return 'bg-blue-500/80 hover:bg-blue-500'
      }
    } else {
      switch (inactiveColor) {
        case 'red':
          return 'bg-red-500/80 hover:bg-red-500'
        case 'gray':
          return 'bg-black/50 hover:bg-black/70'
        default:
          return 'bg-black/50 hover:bg-black/70'
      }
    }
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`flex items-center justify-center w-9 h-9 rounded-full backdrop-blur-sm transition-colors text-white ${getBackgroundClass()}`}
      title={label}
    >
      {icon}
    </button>
  )
}

