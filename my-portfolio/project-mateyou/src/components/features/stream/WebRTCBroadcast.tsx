/**
 * WebRTCBroadcast - 모바일 웹 WebRTC 방송 송출 컴포넌트
 *
 * 모바일 웹 브라우저에서 카메라/마이크를 통해 직접 방송 송출
 * LiveKit → Egress → HLS 변환 후 시청자에게 제공
 */

import { useEffect, useRef, useState } from 'react'
import { useLiveKitBroadcast, type BroadcastStatus } from '@/hooks/useLiveKitBroadcast'
import { cn } from '@/lib/utils'
import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
  SwitchCamera,
  Radio,
  CircleStop,
  Loader2,
  AlertCircle,
  FlipHorizontal,
} from 'lucide-react'

interface WebRTCBroadcastProps {
  roomId: string
  className?: string
  onBroadcastStart?: () => void
  onBroadcastStop?: () => void
}

export function WebRTCBroadcast({
  roomId,
  className,
  onBroadcastStart,
  onBroadcastStop,
}: WebRTCBroadcastProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  
  // 실제 송출 화면 보기 모드 (false = 미러링 적용, true = 실제 송출 화면)
  const [showActualOutput, setShowActualOutput] = useState(false)

  const {
    status,
    isBroadcasting,
    error,
    facingMode,
    localVideoTrack,
    previewTrack,
    isPreviewReady,
    startBroadcast,
    stopBroadcast,
    switchCamera,
    toggleMicrophone,
    toggleCamera,
    isMicEnabled,
    isCameraEnabled,
    initPreview,
    isMirrored,     // hook에서 관리하는 좌우반전 상태
    setMirrored,    // 좌우반전 설정 함수
    videoFit,
    setVideoFit,
  } = useLiveKitBroadcast({
    roomId,
    mode: 'video',
    videoResolution: 'high',  // 540p 세로 (540x960, 9:16)
    facingMode: 'user',
    isMirrored: true,  // 기본값: 전면 카메라 미러링 (실제 송출에도 반영)
    onBroadcastStart,
    onBroadcastStop,
  })
  
  // 방송 시작 전 카메라 프리뷰 초기화 (한 번만 실행)
  const hasInitializedRef = useRef(false)
  
  useEffect(() => {
    // 이미 초기화했거나 방송 중이면 스킵
    if (hasInitializedRef.current || status !== 'idle') return
    
    hasInitializedRef.current = true
    
    // 약간의 딜레이 후 초기화 (컴포넌트 완전히 마운트 후)
    const timer = setTimeout(() => {
      initPreview().catch(() => {
        console.log('📷 [Preview] 자동 초기화 실패 - 버튼 클릭으로 재시도')
      })
    }, 100)
    
    return () => clearTimeout(timer)
  }, []) // 빈 의존성 - 마운트 시 한 번만

  // 비디오 트랙을 video 엘리먼트에 연결 (프리뷰 또는 방송 트랙)
  // 현재 연결된 트랙 추적 (불필요한 재설정 방지)
  const currentTrackRef = useRef<MediaStreamTrack | null>(null)
  
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    
    // 방송 중이면 localVideoTrack, 프리뷰 중이면 previewTrack 사용
    const activeTrack = isBroadcasting 
      ? localVideoTrack?.mediaStreamTrack 
      : previewTrack?.mediaStreamTrack
    
    // 같은 트랙이면 재설정 안함 (깜빡임 방지)
    if (activeTrack && currentTrackRef.current !== activeTrack) {
      currentTrackRef.current = activeTrack
      const newStream = new MediaStream([activeTrack])
      video.srcObject = newStream
      video.play().catch((err) => {
        if (err.name !== 'AbortError') {
          console.error('비디오 재생 실패:', err)
        }
      })
    }
  }, [isBroadcasting, localVideoTrack, previewTrack])
  
  // 좌우반전 토글 핸들러 (실제 송출에도 반영됨)
  const toggleMirror = () => {
    setMirrored(!isMirrored)
  }
  
  // 실제 송출 화면 보기 토글
  const toggleShowActualOutput = () => {
    setShowActualOutput(prev => !prev)
  }

  // 화면 맞춤 토글 (cover ↔ contain)
  const toggleVideoFit = () => {
    setVideoFit(videoFit === 'cover' ? 'contain' : 'cover')
  }
  
  // 현재 미러링 적용 여부 계산
  // - showActualOutput이 true면 미러링 안함 (실제 송출 화면)
  // - 그렇지 않으면 전면 카메라 + isMirrored 상태에 따라 결정
  // 방송 중에는 Canvas 트랙이 이미 반전을 포함하므로 CSS 반전을 적용하지 않음 (중복 반전 방지)
  const shouldMirror = !isBroadcasting && !showActualOutput && facingMode === 'user' && isMirrored

  // 상태별 UI 렌더링
  const renderStatusBadge = () => {
    const statusConfig: Record<BroadcastStatus, { text: string; color: string; icon: React.ReactNode }> = {
      idle: { text: '대기 중', color: 'bg-gray-500', icon: <CircleStop className="w-3 h-3" /> },
      connecting: { text: '연결 중...', color: 'bg-yellow-500', icon: <Loader2 className="w-3 h-3 animate-spin" /> },
      broadcasting: { text: 'LIVE', color: 'bg-red-500', icon: <Radio className="w-3 h-3 animate-pulse" /> },
      error: { text: '오류', color: 'bg-red-700', icon: <AlertCircle className="w-3 h-3" /> },
    }

    const config = statusConfig[status]

    return (
      <div className={cn(
        'absolute top-4 left-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white text-xs font-medium shadow-lg',
        config.color
      )}>
        {config.icon}
        <span>{config.text}</span>
      </div>
    )
  }

  return (
    <div className={cn('relative flex flex-col bg-[#110f1a] h-full', className)}>
      {/* 비디오 프리뷰/송출 화면 */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={cn(
            'absolute inset-0 w-full h-full',
            videoFit === 'contain' ? 'object-contain bg-black' : 'object-cover',
            shouldMirror && 'scale-x-[-1]', // 좌우반전 적용
            !isCameraEnabled && 'hidden'
          )}
        />
        
        {/* 실제 송출 화면 보기 모드 표시 */}
        {showActualOutput && (
          <div className="absolute top-4 right-4 px-2.5 py-1 rounded-full bg-blue-500/80 backdrop-blur-sm text-white text-xs font-medium">
            시청자 화면
          </div>
        )}

        {/* 카메라 꺼진 상태 또는 프리뷰 준비 안됨 */}
        {(!isCameraEnabled || (!isPreviewReady && !localVideoTrack)) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-[#1a1825] to-[#110f1a]">
            <CameraOff className="w-16 h-16 text-white/30 mb-3" />
            <p className="text-white/50 text-sm mb-4">
              {!isCameraEnabled ? '카메라가 꺼져있습니다' : '카메라를 불러오는 중...'}
            </p>
            {!isPreviewReady && !localVideoTrack && isCameraEnabled && (
              <button
                onClick={() => initPreview()}
                className="px-4 py-2 bg-pink-500 hover:bg-pink-400 text-white rounded-full text-sm font-medium transition-colors"
              >
                카메라 시작
              </button>
            )}
          </div>
        )}

        {/* 상태 배지 */}
        {renderStatusBadge()}

        {/* 에러 메시지 */}
        {error && (
          <div className="absolute bottom-20 left-4 right-4 p-3 bg-red-500/90 backdrop-blur rounded-xl text-white text-sm">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          </div>
        )}
      </div>

      {/* 컨트롤 바 - flex-shrink-0으로 절대 줄어들지 않게 */}
      <div 
        className="flex-shrink-0 flex items-center justify-between gap-1.5 px-2 py-2 bg-[#1a1825] border-t border-white/10"
        style={{ paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))' }}
      >
        {/* 왼쪽: 미디어 컨트롤 */}
        <div className="flex items-center gap-1">
          {/* 마이크 토글 */}
          <button
            onClick={toggleMicrophone}
            disabled={status === 'connecting'}
            className={cn(
              'w-9 h-9 rounded-full flex items-center justify-center transition-all',
              isMicEnabled 
                ? 'bg-white/10 hover:bg-white/20 text-white' 
                : 'bg-red-500 hover:bg-red-400 text-white'
            )}
          >
            {isMicEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          </button>

          {/* 카메라 토글 */}
          <button
            onClick={toggleCamera}
            disabled={status === 'connecting'}
            className={cn(
              'w-9 h-9 rounded-full flex items-center justify-center transition-all',
              isCameraEnabled 
                ? 'bg-white/10 hover:bg-white/20 text-white' 
                : 'bg-red-500 hover:bg-red-400 text-white'
            )}
          >
            {isCameraEnabled ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
          </button>

          {/* 카메라 전환 */}
          <button
            onClick={switchCamera}
            disabled={!isCameraEnabled}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-white transition-all disabled:opacity-30"
            title="카메라 전환"
          >
            <SwitchCamera className="w-4 h-4" />
          </button>
          
          {/* 좌우반전 토글 */}
          <button
            onClick={toggleMirror}
            disabled={!isCameraEnabled || facingMode !== 'user'}
            className={cn(
              'w-9 h-9 rounded-full flex items-center justify-center transition-all disabled:opacity-30',
              isMirrored && facingMode === 'user'
                ? 'bg-blue-500 hover:bg-blue-400 text-white' 
                : 'bg-white/10 hover:bg-white/20 text-white'
            )}
            title="좌우반전"
          >
            <FlipHorizontal className="w-4 h-4" />
          </button>
          
          {/* 실제 송출 화면 보기 토글 */}
          <button
            onClick={toggleShowActualOutput}
            disabled={!isCameraEnabled}
            className={cn(
              'px-2 h-9 rounded-full flex items-center justify-center transition-all disabled:opacity-30 text-[10px] font-medium',
              showActualOutput
                ? 'bg-blue-500 hover:bg-blue-400 text-white' 
                : 'bg-white/10 hover:bg-white/20 text-white'
            )}
          >
            {showActualOutput ? '내화면' : '시청자'}
          </button>

          {/* 화면 맞춤 토글 */}
          <button
            onClick={toggleVideoFit}
            disabled={!isCameraEnabled}
            className={cn(
              'px-2 h-9 rounded-full flex items-center justify-center transition-all disabled:opacity-30 text-[10px] font-medium',
              videoFit === 'contain'
                ? 'bg-blue-500 hover:bg-blue-400 text-white'
                : 'bg-white/10 hover:bg-white/20 text-white'
            )}
            title="화면 맞춤"
          >
            {videoFit === 'cover' ? '전체' : '꽉채움'}
          </button>
        </div>

        {/* 오른쪽: 방송 시작/종료 버튼 */}
        {!isBroadcasting ? (
          <button
            onClick={startBroadcast}
            disabled={status === 'connecting'}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-400 hover:to-rose-400 text-white font-semibold shadow-lg shadow-pink-500/30 transition-all disabled:opacity-50 text-xs"
          >
            {status === 'connecting' ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>연결중</span>
              </>
            ) : (
              <>
                <Radio className="w-3.5 h-3.5" />
                <span>방송 시작</span>
              </>
            )}
          </button>
        ) : (
          <button
            onClick={stopBroadcast}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 text-white font-semibold transition-all border border-white/20 text-xs"
          >
            <CircleStop className="w-3.5 h-3.5 text-red-400" />
            <span>방송 종료</span>
          </button>
        )}
      </div>
    </div>
  )
}

export default WebRTCBroadcast
