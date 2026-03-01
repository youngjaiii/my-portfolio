/**
 * 라이브 방송 리허설 페이지
 * 호스트가 카메라/마이크를 테스트하고 방송을 시작하는 준비 화면
 */

import { Button } from '@/components/ui/Button'
import { Typography } from '@/components/ui/Typography'
import { useVideoRoomConnection } from '@/contexts/VideoRoomProvider'
import { useAuth } from '@/hooks/useAuth'
import { useStreamHeartbeat } from '@/hooks/useStreamHeartbeat'
import { useVoiceRoom } from '@/hooks/useVoiceRoom'
import { edgeApi } from '@/lib/edgeApi'
import { safeGetUserMedia } from '@/lib/utils'
import {
  allowScreenSharing,
  disableCaptureProtection,
  disallowScreenSharing,
  enableCaptureProtection
} from '@/utils/captureProtection'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  Camera,
  CameraOff,
  FlipHorizontal2,
  Loader2,
  Mic,
  MicOff,
  Monitor,
  MonitorOff,
  Radio,
  RefreshCw,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

export const Route = createFileRoute('/stream/video/rehearsal/$roomId')({
  component: RehearsalPage,
})

function RehearsalPage() {
  const { roomId } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()

  // 방 정보 조회
  const { room, isLoading: isRoomLoading, isHost, joinRoom } = useVoiceRoom(roomId)
  const { disconnect } = useVideoRoomConnection()

  // 호스트일 때 하트비트 전송 (리허설=scheduled 상태에서도 필요)
  useStreamHeartbeat({
    roomId,
    isHost,
    isLive: room?.status === 'scheduled' || room?.status === 'live',
  })

  // 미디어 상태
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [hasCamera, setHasCamera] = useState(false)
  const [hasMic, setHasMic] = useState(false)
  const [isCameraOn, setIsCameraOn] = useState(true)
  const [isMicOn, setIsMicOn] = useState(true)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')
  const [isFlipped, setIsFlipped] = useState(false)
  const [isMediaLoading, setIsMediaLoading] = useState(true)
  const [mediaError, setMediaError] = useState<string | null>(null)
  const [hasJoined, setHasJoined] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)

  // 미디어 스트림 초기화
  const initMedia = useCallback(async () => {
    setIsMediaLoading(true)
    setMediaError(null)

    try {
      const stream = await safeGetUserMedia({
        video: { facingMode },
        audio: true,
      })

      // 기존 스트림 정리
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop())
      }

      setLocalStream(stream)
      setHasCamera(stream.getVideoTracks().length > 0)
      setHasMic(stream.getAudioTracks().length > 0)

      // 비디오 엘리먼트에 연결
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch (err) {
      console.error('미디어 초기화 실패:', err)
      setMediaError(err instanceof Error ? err.message : '카메라/마이크 접근에 실패했습니다')
    } finally {
      setIsMediaLoading(false)
    }
  }, [facingMode])

  // 화면 캡처 방지 비활성화 및 화면 공유 허용 (리허설 페이지에서는 캡처 허용)
  useEffect(() => {
    disableCaptureProtection()
    allowScreenSharing() // 화면 공유 허용

    return () => {
      // 페이지를 떠날 때 다시 활성화
      disallowScreenSharing() // 화면 공유 허용 해제
      enableCaptureProtection()
    }
  }, [])

  // 초기 미디어 설정
  useEffect(() => {
    initMedia()

    return () => {
      // 클린업
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  // 방 입장 (호스트로)
  useEffect(() => {
    if (!room || hasJoined || !user || !isHost) return

    const autoJoin = async () => {
      try {
        await joinRoom(room.password || undefined)
        setHasJoined(true)
      } catch (err) {
        console.error('방 입장 실패:', err)
        toast.error('방 입장에 실패했습니다')
      }
    }

    autoJoin()
  }, [room, hasJoined, user, isHost, joinRoom])

  // 카메라 토글
  const toggleCamera = useCallback(() => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
        setIsCameraOn(videoTrack.enabled)
      }
    }
  }, [localStream])

  // 마이크 토글
  const toggleMic = useCallback(() => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setIsMicOn(audioTrack.enabled)
      }
    }
  }, [localStream])

  // 카메라 전환
  const switchCamera = useCallback(async () => {
    if (isScreenSharing) return // 화면 공유 중에는 카메라 전환 불가

    const newFacingMode = facingMode === 'user' ? 'environment' : 'user'
    setFacingMode(newFacingMode)

    try {
      const stream = await safeGetUserMedia({
        video: { facingMode: newFacingMode },
        audio: true,
      })

      // 기존 스트림 정리
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop())
      }

      setLocalStream(stream)
      setHasCamera(true)
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch (err) {
      console.error('카메라 전환 실패:', err)
    }
  }, [facingMode, localStream, isScreenSharing])

  // 좌우 반전 토글
  const toggleFlip = useCallback(() => {
    setIsFlipped(prev => !prev)
  }, [])

  // 화면 공유 시작
  const startScreenShare = useCallback(async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      toast.error('화면 공유를 지원하지 않는 브라우저입니다')
      return
    }

    try {
      // 화면 공유 허용 (캡처 방지 우회)
      allowScreenSharing()
      await new Promise(resolve => setTimeout(resolve, 10))

      // 기존 카메라 스트림 정리
      if (localStream) {
        localStream.getVideoTracks().forEach(track => track.stop())
      }

      // 화면 공유 성능 최적화: 해상도 및 프레임레이트 제한 (540p, 20fps)
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { 
          displaySurface: 'monitor' as any,
          // 성능 최적화: 540p 해상도 (960x540), 프레임레이트 20fps로 제한
          width: { ideal: 960, max: 960 },
          height: { ideal: 540, max: 540 },
          frameRate: { ideal: 20, max: 20 },
        },
        audio: { echoCancellation: false, noiseSuppression: false } as any,
      })

      // 기존 오디오 트랙 유지
      const audioTrack = localStream?.getAudioTracks()[0]
      if (audioTrack) {
        screenStream.addTrack(audioTrack)
      }

      // 비디오 트랙에 직접 제약 조건 적용 (추가 최적화)
      const videoTrack = screenStream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.applyConstraints({
          width: { ideal: 960, max: 960 },
          height: { ideal: 540, max: 540 },
          frameRate: { ideal: 20, max: 20 },
        }).catch(() => {
          // 제약 조건 적용 실패는 무시 (일부 브라우저에서 지원하지 않을 수 있음)
        })
      }

      setLocalStream(screenStream)
      setIsScreenSharing(true)
      setHasCamera(false)
      setIsCameraOn(false)

      if (videoRef.current) {
        videoRef.current.srcObject = screenStream
      }

      // 화면 공유 종료 감지
      if (videoTrack) {
        videoTrack.onended = () => {
          stopScreenShare()
        }
      }
    } catch (err) {
      console.error('화면 공유 시작 실패:', err)
      // 사용자가 취소한 경우는 에러 표시 안함
      if ((err as any)?.name !== 'AbortError') {
        toast.error('화면 공유를 시작할 수 없습니다')
      }
    }
  }, [localStream])

  // 화면 공유 중지
  const stopScreenShare = useCallback(async () => {
    setIsScreenSharing(false)

    try {
      // 카메라로 다시 전환
      const stream = await safeGetUserMedia({
        video: { facingMode },
        audio: true,
      })

      // 기존 스트림 정리
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop())
      }

      setLocalStream(stream)
      setHasCamera(stream.getVideoTracks().length > 0)
      setIsCameraOn(true)

      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
    } catch (err) {
      console.error('카메라 복귀 실패:', err)
      setMediaError('카메라를 다시 시작할 수 없습니다')
    }
  }, [facingMode, localStream])

  // 방송 시작 뮤테이션
  const startBroadcastMutation = useMutation({
    mutationFn: async () => {
      const response = await edgeApi.stream.startBroadcast(roomId)
      if (!response.success) {
        throw new Error(response.error?.message || '방송 시작에 실패했습니다')
      }
      return response.data
    },
    onSuccess: async () => {
      // 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: ['stream-rooms'] })
      queryClient.invalidateQueries({ queryKey: ['stream-rooms-api'] })
      queryClient.invalidateQueries({ queryKey: ['stream-room', roomId] })

      // 리허설 설정을 세션 스토리지에 저장 (방송 페이지에서 사용)
      const rehearsalSettings = {
        roomId,
        isScreenSharing,
        isMicOn,
        isCameraOn,
        facingMode,
        isFlipped,
        timestamp: Date.now(),
      }
      sessionStorage.setItem('rehearsal-settings', JSON.stringify(rehearsalSettings))

      // 스트림은 정리하지 않음 - 방송 페이지에서 동일한 설정으로 다시 시작
      // (스트림 자체는 PeerJS에서 새로 생성하므로 여기서 정리)
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop())
        setLocalStream(null)
      }

      toast.success('방송이 시작되었습니다!')

      // 비디오 방송 페이지로 이동
      navigate({ to: '/stream/video/$roomId', params: { roomId } })
    },
    onError: (err) => {
      console.error('방송 시작 실패:', err)
      toast.error(err instanceof Error ? err.message : '방송 시작에 실패했습니다')
    },
  })

  // 방송 취소 (방 삭제)
  const cancelBroadcast = useCallback(async () => {
    if (!confirm('방송을 취소하시겠습니까? 생성된 방이 삭제됩니다.')) return

    try {
      await edgeApi.stream.endRoom(roomId)
      queryClient.invalidateQueries({ queryKey: ['stream-rooms'] })
      
      // 스트림 정리
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop())
      }
      disconnect()
      
      toast.success('방송이 취소되었습니다')
      navigate({ to: '/stream/live' })
    } catch (err) {
      console.error('방송 취소 실패:', err)
      toast.error('방송 취소에 실패했습니다')
    }
  }, [roomId, localStream, disconnect, navigate, queryClient])

  // 로딩 상태
  if (isRoomLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-[#1a1825] to-[#110f1a]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-[#FE3A8F] animate-spin" />
          <Typography variant="body1" className="text-white">
            방 정보를 불러오는 중...
          </Typography>
        </div>
      </div>
    )
  }

  // 방이 없거나 호스트가 아닌 경우
  if (!room || !isHost) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-b from-[#1a1825] to-[#110f1a]">
        <div className="text-center">
          <Typography variant="h5" className="text-white mb-4">
            접근 권한이 없습니다
          </Typography>
          <Button
            variant="primary"
            onClick={() => navigate({ to: '/stream/live' })}
          >
            목록으로 돌아가기
          </Button>
        </div>
      </div>
    )
  }

  // 이미 live 상태인 경우 바로 방송 페이지로 이동
  // (scheduled = 리허설 상태, live = 방송 중)
  if (room.status === 'live') {
    navigate({ to: '/stream/video/$roomId', params: { roomId } })
    return null
  }

  // ended 상태인 경우 목록으로
  if (room.status === 'ended') {
    navigate({ to: '/stream/live' })
    return null
  }

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      {/* 배경 비디오 (전체 화면) */}
      <div className="absolute inset-0 w-full h-full">
        {isMediaLoading ? (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-[#1a1825] to-[#110f1a]">
            <Loader2 className="w-12 h-12 text-[#FE3A8F] animate-spin" />
          </div>
        ) : mediaError ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#1a1825] to-[#110f1a] p-4">
            <CameraOff className="w-20 h-20 text-gray-500 mb-4" />
            <Typography variant="body1" className="text-gray-400 text-center mb-4">
              {mediaError}
            </Typography>
            <Button variant="outline" size="sm" onClick={initMedia}>
              <RefreshCw className="w-4 h-4 mr-2" />
              다시 시도
            </Button>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-contain ${
                !isScreenSharing && 
                ((facingMode === 'user' && !isFlipped) || (facingMode === 'environment' && isFlipped))
                  ? 'scale-x-[-1]' 
                  : ''
              }`}
            />
            {!isCameraOn && !isScreenSharing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[#1a1825] to-[#110f1a]">
                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-[#FE3A8F] to-[#ff6b9d] flex items-center justify-center mb-6 shadow-lg shadow-[#FE3A8F]/30">
                  <CameraOff className="w-16 h-16 text-white" />
                </div>
                <Typography variant="body1" className="text-gray-400">
                  카메라가 꺼져있습니다
                </Typography>
              </div>
            )}
          </>
        )}
      </div>

      {/* 상단 헤더 (반투명) */}
      <div className="absolute top-0 left-0 right-0 z-20 bg-gradient-to-b from-black/60 to-transparent p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={cancelBroadcast}
              className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-white font-bold text-lg">{room.title}</h1>
              <p className="text-white/70 text-sm">방송 준비 중</p>
            </div>
          </div>
          
          {/* 우측: 취소 버튼 */}
          <button
            onClick={cancelBroadcast}
            className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 상태 표시 뱃지들 */}
      <div className="absolute top-20 right-4 z-20 flex flex-col gap-2">
        {/* 화면 공유 상태 표시 */}
        {isScreenSharing && (
          <div className="px-3 py-1.5 rounded-full bg-blue-500/80 backdrop-blur-sm flex items-center gap-1.5">
            <Monitor className="w-4 h-4 text-white" />
            <Typography variant="caption" className="text-white">
              화면 공유 중
            </Typography>
          </div>
        )}
        
        {/* 마이크 상태 표시 */}
        {!isMicOn && (
          <div className="px-3 py-1.5 rounded-full bg-red-500/80 backdrop-blur-sm flex items-center gap-1.5">
            <MicOff className="w-4 h-4 text-white" />
            <Typography variant="caption" className="text-white">
              음소거
            </Typography>
          </div>
        )}
      </div>

      {/* 하단 컨트롤 바 (반투명) */}
      <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/80 to-transparent">
        {/* 컨트롤 버튼 */}
        <div className="flex items-center justify-center gap-3 px-4 pt-6 pb-4">
          {/* 화면 공유 (데스크톱만) */}
          {typeof navigator !== 'undefined' && navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices && (
            !isScreenSharing ? (
              <button
                onClick={startScreenShare}
                disabled={isMediaLoading}
                className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="화면 공유"
              >
                <Monitor className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={stopScreenShare}
                className="w-12 h-12 rounded-full bg-red-500/80 backdrop-blur-sm flex items-center justify-center text-white hover:bg-red-500 transition-colors"
                title="화면 공유 중지"
              >
                <MonitorOff className="w-5 h-5" />
              </button>
            )
          )}

          {/* 카메라 토글 */}
          <button
            onClick={toggleCamera}
            disabled={isScreenSharing || isMediaLoading}
            className={`w-12 h-12 rounded-full backdrop-blur-sm flex items-center justify-center transition-colors ${
              isCameraOn && !isScreenSharing
                ? 'bg-black/50 hover:bg-black/70 text-white'
                : 'bg-gray-500/80 hover:bg-gray-500 text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
            title={isCameraOn ? '카메라 끄기' : '카메라 켜기'}
          >
            {isCameraOn && !isScreenSharing ? <Camera className="w-5 h-5" /> : <CameraOff className="w-5 h-5" />}
          </button>

          {/* 카메라 전환 */}
          {hasCamera && !isScreenSharing && (
            <button
              onClick={switchCamera}
              disabled={isMediaLoading}
              className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="카메라 전환"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          )}

          {/* 좌우 반전 */}
          {hasCamera && !isScreenSharing && (
            <button
              onClick={toggleFlip}
              disabled={isMediaLoading}
              className={`w-12 h-12 rounded-full backdrop-blur-sm flex items-center justify-center text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                isFlipped
                  ? 'bg-indigo-500/80 hover:bg-indigo-500'
                  : 'bg-black/50 hover:bg-black/70'
              }`}
              title="좌우 반전"
            >
              <FlipHorizontal2 className="w-5 h-5" />
            </button>
          )}

          {/* 마이크 토글 */}
          <button
            onClick={toggleMic}
            disabled={!hasMic || isMediaLoading}
            className={`w-12 h-12 rounded-full backdrop-blur-sm flex items-center justify-center transition-colors ${
              isMicOn
                ? 'bg-black/50 hover:bg-black/70'
                : 'bg-red-500/80 hover:bg-red-500'
            } text-white disabled:opacity-50 disabled:cursor-not-allowed`}
            title={isMicOn ? '음소거' : '음소거 해제'}
          >
            {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
          </button>
        </div>

        {/* 방송 시작 버튼 */}
        <div 
          className="px-4 pb-4"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
        >
          <Button
            variant="primary"
            className="w-full h-14 text-lg font-bold bg-gradient-to-r from-[#FE3A8F] to-[#ff6b9d] hover:from-[#fe4a9a] hover:to-[#ff7ba8] shadow-lg shadow-[#FE3A8F]/30"
            onClick={() => startBroadcastMutation.mutate()}
            disabled={startBroadcastMutation.isPending || isMediaLoading}
          >
            {startBroadcastMutation.isPending ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                시작 중...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Radio className="w-5 h-5" />
                방송 시작
              </span>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
