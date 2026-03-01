/**
 * useLiveKitBroadcast - 모바일 웹 WebRTC 방송 송출용 훅
 *
 * LiveKit을 통해 WebRTC 스트림을 송출하고
 * Egress를 통해 HLS로 변환하여 시청자에게 제공
 * 
 * 안정성 개선:
 * - useRef로 상태 유지 (리렌더링 방지)
 * - 모바일 백그라운드 처리
 * - cleanup 로직 통합
 */

import { LiveKitWebStream, type StreamMode, type StreamBroadcastOptions } from '@/plugins/LiveKitWebStream'
import { edgeApi } from '@/lib/edgeApi'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { LocalVideoTrack, LocalAudioTrack, Room } from 'livekit-client'
import { createLocalVideoTrack, createLocalAudioTrack } from 'livekit-client'

// 세로 모드 비디오 해상도 프리셋 (9:16 비율)
const PORTRAIT_VIDEO_PRESETS = {
  low: { width: 180, height: 320, frameRate: 24 },
  medium: { width: 360, height: 640, frameRate: 30 },
  high: { width: 540, height: 960, frameRate: 30 },
  hd: { width: 720, height: 1280, frameRate: 30 },
}

// 방송 상태
export type BroadcastStatus = 'idle' | 'connecting' | 'broadcasting' | 'error'

// 훅 옵션
interface UseLiveKitBroadcastOptions {
  roomId: string
  mode?: StreamMode
  videoResolution?: 'low' | 'medium' | 'high' | 'hd'
  facingMode?: 'user' | 'environment'
  isMirrored?: boolean
  /** 비디오 프레이밍 (cover=크롭, contain=전체) */
  videoFit?: 'cover' | 'contain'
  onBroadcastStart?: () => void
  onBroadcastStop?: () => void
  onError?: (error: string) => void
}

// 훅 반환 타입
interface UseLiveKitBroadcastResult {
  status: BroadcastStatus
  isBroadcasting: boolean
  error: string | null
  participantCount: number
  facingMode: 'user' | 'environment'
  isMirrored: boolean
  videoFit: 'cover' | 'contain'
  localVideoTrack: LocalVideoTrack | null
  previewTrack: LocalVideoTrack | null
  isPreviewReady: boolean
  room: Room | null
  startBroadcast: () => Promise<void>
  stopBroadcast: () => Promise<void>
  switchCamera: () => Promise<void>
  toggleMicrophone: () => Promise<void>
  toggleCamera: () => Promise<void>
  initPreview: () => Promise<void>
  setMirrored: (mirrored: boolean) => void
  setVideoFit: (videoFit: 'cover' | 'contain') => void
  isMicEnabled: boolean
  isCameraEnabled: boolean
}

export function useLiveKitBroadcast(options: UseLiveKitBroadcastOptions): UseLiveKitBroadcastResult {
  // options를 ref로 저장하여 콜백에서 최신 값 참조
  const optionsRef = useRef(options)
  optionsRef.current = options

  // LiveKitWebStream 인스턴스 (싱글톤)
  const streamRef = useRef<LiveKitWebStream | null>(null)
  
  // 프리뷰 트랙 refs
  const previewTrackRef = useRef<LocalVideoTrack | null>(null)
  const previewAudioRef = useRef<LocalAudioTrack | null>(null)
  
  // 초기화 상태 ref (중복 초기화 방지)
  const isInitializingRef = useRef(false)
  const isBroadcastingRef = useRef(false)

  // 상태 (최소한으로 유지)
  const [status, setStatus] = useState<BroadcastStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [participantCount, setParticipantCount] = useState(0)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>(options.facingMode || 'user')
  const [isMicEnabled, setIsMicEnabled] = useState(true)
  const [isCameraEnabled, setIsCameraEnabled] = useState(true)
  const [isMirrored, setIsMirrored] = useState(options.isMirrored ?? true)
  const [videoFit, setVideoFitState] = useState<'cover' | 'contain'>(options.videoFit || 'cover')
  
  // 트랙 상태 (비디오 렌더링용)
  const [previewTrack, setPreviewTrack] = useState<LocalVideoTrack | null>(null)
  const [localVideoTrack, setLocalVideoTrack] = useState<LocalVideoTrack | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [isPreviewReady, setIsPreviewReady] = useState(false)

  // LiveKitWebStream 인스턴스 생성 (한 번만)
  useEffect(() => {
    if (!streamRef.current) {
      streamRef.current = new LiveKitWebStream()
      console.log('🎬 [Broadcast] LiveKitWebStream 인스턴스 생성')
    }
    
    // cleanup은 컴포넌트 완전히 언마운트될 때만
    return () => {
      console.log('🧹 [Broadcast] 컴포넌트 언마운트 - 전체 정리')
      cleanupAll()
    }
  }, []) // 빈 의존성 - 마운트/언마운트 시에만 실행

  // 전체 정리 함수
  const cleanupAll = useCallback(() => {
    // 프리뷰 트랙 정리
    if (previewTrackRef.current) {
      previewTrackRef.current.stop()
      previewTrackRef.current = null
    }
    if (previewAudioRef.current) {
      previewAudioRef.current.stop()
      previewAudioRef.current = null
    }
    
    // 방송 정리
    if (streamRef.current && isBroadcastingRef.current) {
      streamRef.current.stopBroadcast().catch(console.error)
    }
    
    isBroadcastingRef.current = false
    isInitializingRef.current = false
  }, [])

  // 프리뷰 트랙만 정리
  const cleanupPreview = useCallback(() => {
    if (previewTrackRef.current) {
      previewTrackRef.current.stop()
      previewTrackRef.current = null
    }
    if (previewAudioRef.current) {
      previewAudioRef.current.stop()
      previewAudioRef.current = null
    }
    setPreviewTrack(null)
    setIsPreviewReady(false)
  }, [])

  // 카메라/마이크 프리뷰 초기화 (안정화)
  const initPreview = useCallback(async () => {
    // 이미 초기화 중이거나 준비됐거나 방송 중이면 스킵
    if (isInitializingRef.current || previewTrackRef.current || isBroadcastingRef.current) {
      return
    }
    
    isInitializingRef.current = true
    
    try {
      console.log('📷🎤 [Preview] 카메라/마이크 프리뷰 초기화...')
      
      const { videoResolution = 'high', facingMode: fm = 'user' } = optionsRef.current
      const resolution = PORTRAIT_VIDEO_PRESETS[videoResolution]
      
      const [videoTrack, audioTrack] = await Promise.all([
        createLocalVideoTrack({
          resolution: {
            width: resolution.width,
            height: resolution.height,
            frameRate: resolution.frameRate,
          },
          facingMode: fm,
        }),
        createLocalAudioTrack({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }),
      ])
      
      // 이미 방송 중이면 생성한 트랙 정리
      if (isBroadcastingRef.current) {
        videoTrack.stop()
        audioTrack.stop()
        isInitializingRef.current = false
        return
      }
      
      previewTrackRef.current = videoTrack
      previewAudioRef.current = audioTrack
      setPreviewTrack(videoTrack)
      setIsPreviewReady(true)
      
      console.log('✅ [Preview] 카메라/마이크 프리뷰 준비 완료')
    } catch (err: any) {
      console.error('❌ [Preview] 카메라/마이크 프리뷰 실패:', err)
    } finally {
      isInitializingRef.current = false
    }
  }, []) // 의존성 없음 - optionsRef 사용

  // 방송 시작
  const startBroadcast = useCallback(async () => {
    if (!streamRef.current || isBroadcastingRef.current) {
      return
    }

    const { roomId, mode = 'video', videoResolution = 'high', onBroadcastStart, onError } = optionsRef.current

    if (!roomId || roomId.trim() === '') {
      setError('방 ID가 유효하지 않습니다')
      return
    }

    try {
      setStatus('connecting')
      setError(null)
      isBroadcastingRef.current = true
      
      // 프리뷰 트랙 정리
      cleanupPreview()

      // 1. 토큰 발급
      console.log('📡 [Broadcast] 토큰 요청:', roomId)
      const tokenResponse = await edgeApi.livekitStream.getBroadcastToken({
        roomId: roomId.trim(),
        mode: mode as 'audio' | 'video',
      })

      if (!tokenResponse.success) {
        throw new Error(tokenResponse.error?.message || '토큰 발급 실패')
      }

      const responseData = tokenResponse.data || tokenResponse
      const { token, url } = responseData as { token: string; url: string }

      if (!token || !url) {
        throw new Error('토큰 정보가 올바르지 않습니다')
      }

      // 2. 방송 시작
      console.log('📡 [Broadcast] 방송 시작...')
      const broadcastOptions: StreamBroadcastOptions = {
        url,
        token,
        roomName: roomId,
        mode,
        videoResolution,
        facingMode,
        isMirrored,
        videoFit,
      }

      const result = await streamRef.current.startBroadcast(broadcastOptions)

      if (!result.success) {
        throw new Error(result.error || '방송 시작 실패')
      }

      // 3. Egress 시작
      const egressResponse = await edgeApi.livekitStream.startEgress({
        roomId: roomId.trim(),
        mode: mode as 'audio' | 'video',
      })

      if (!egressResponse.success) {
        await streamRef.current.stopBroadcast().catch(() => {})
        throw new Error(egressResponse.error?.message || 'HLS 변환 시작 실패')
      }

      // 상태 업데이트
      setStatus('broadcasting')
      setLocalVideoTrack(streamRef.current.getLocalVideoTrack())
      setRoom(streamRef.current.getRoom())

      onBroadcastStart?.()
      console.log('✅ [Broadcast] 방송 시작 완료')
    } catch (err: any) {
      console.error('❌ [Broadcast] 방송 시작 실패:', err)
      isBroadcastingRef.current = false
      setStatus('error')
      
      let errorMsg = err.message || '방송 시작 중 오류가 발생했습니다'
      if (errorMsg.includes('Only approved partners can broadcast')) {
        errorMsg = '승인된 파트너만 방송할 수 있습니다'
      } else if (errorMsg.includes('NotAllowedError')) {
        errorMsg = '카메라/마이크 권한을 허용해주세요.'
      }
      
      setError(errorMsg)
      onError?.(errorMsg)
    }
  }, [facingMode, isMirrored, videoFit, cleanupPreview])

  // 방송 종료
  const stopBroadcast = useCallback(async () => {
    if (!streamRef.current || !isBroadcastingRef.current) return

    const { roomId, onBroadcastStop } = optionsRef.current

    try {
      console.log('📡 [Broadcast] 방송 종료...')

      await edgeApi.livekitStream.stopEgress({ roomId }).catch(() => {})
      await streamRef.current.stopBroadcast()

      isBroadcastingRef.current = false
      setStatus('idle')
      setLocalVideoTrack(null)
      setRoom(null)
      setParticipantCount(0)

      onBroadcastStop?.()
      console.log('✅ [Broadcast] 방송 종료 완료')
    } catch (err: any) {
      console.error('❌ [Broadcast] 방송 종료 실패:', err)
      isBroadcastingRef.current = false
      setStatus('idle')
    }
  }, [])

  // 카메라 전환
  const switchCamera = useCallback(async () => {
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user'
    
    if (streamRef.current && isBroadcastingRef.current) {
      const result = await streamRef.current.switchCamera()
      if (result.success && result.facingMode) {
        setFacingMode(result.facingMode as 'user' | 'environment')
        setLocalVideoTrack(streamRef.current.getLocalVideoTrack())
      }
    } else if (previewTrackRef.current) {
      try {
        previewTrackRef.current.stop()
        
        const { videoResolution = 'high' } = optionsRef.current
        const resolution = PORTRAIT_VIDEO_PRESETS[videoResolution]
        const newTrack = await createLocalVideoTrack({
          resolution: {
            width: resolution.width,
            height: resolution.height,
            frameRate: resolution.frameRate,
          },
          facingMode: newFacingMode,
        })
        
        previewTrackRef.current = newTrack
        setPreviewTrack(newTrack)
        setFacingMode(newFacingMode)
      } catch (err) {
        console.error('❌ [Preview] 카메라 전환 실패:', err)
      }
    }
  }, [facingMode])

  // 마이크 토글
  const toggleMicrophone = useCallback(async () => {
    if (!streamRef.current || !isBroadcastingRef.current) return

    const newEnabled = !isMicEnabled
    const result = await streamRef.current.setMicrophoneEnabled({ enabled: newEnabled })
    if (result.success) {
      setIsMicEnabled(newEnabled)
    }
  }, [isMicEnabled])

  // 카메라 토글
  const toggleCamera = useCallback(async () => {
    if (!streamRef.current || !isBroadcastingRef.current) return

    const newEnabled = !isCameraEnabled
    const result = await streamRef.current.setCameraEnabled({ enabled: newEnabled })
    if (result.success) {
      setIsCameraEnabled(newEnabled)
    }
  }, [isCameraEnabled])

  // 좌우반전 설정 (방송 중이면 즉시 송출에도 반영)
  const setMirrored = useCallback((mirrored: boolean) => {
    setIsMirrored(mirrored)

    // 방송 중일 때만 LiveKitWebStream에 즉시 반영
    if (streamRef.current && isBroadcastingRef.current) {
      streamRef.current.setMirrored(mirrored)
    }
  }, [])

  // 비디오 프레이밍 설정 (방송 중이면 즉시 송출에도 반영)
  const setVideoFit = useCallback((fit: 'cover' | 'contain') => {
    setVideoFitState(fit)

    if (streamRef.current && isBroadcastingRef.current) {
      streamRef.current.setVideoFit(fit)
    }
  }, [])

  // 참가자 수 업데이트 (방송 중일 때만)
  useEffect(() => {
    if (status !== 'broadcasting') return

    const interval = setInterval(async () => {
      if (streamRef.current && isBroadcastingRef.current) {
        const broadcastStatus = await streamRef.current.getBroadcastStatus()
        if (broadcastStatus?.participantCount !== undefined) {
          setParticipantCount(broadcastStatus.participantCount)
        }
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [status])

  // 모바일 백그라운드 처리 (화면 나가도 방송 유지)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isBroadcastingRef.current) {
        // 화면 복귀 시 상태 복원
        console.log('📱 [Broadcast] 화면 복귀 - 방송 상태 확인')
        if (streamRef.current) {
          setLocalVideoTrack(streamRef.current.getLocalVideoTrack())
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // beforeunload 처리 (페이지 닫을 때 방송 정리)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isBroadcastingRef.current && streamRef.current) {
        // 동기적으로 정리 시도
        const { roomId } = optionsRef.current
        navigator.sendBeacon?.(
          `/api/stream/cleanup?roomId=${roomId}`,
          JSON.stringify({ action: 'stop' })
        )
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  return {
    status,
    isBroadcasting: status === 'broadcasting',
    error,
    participantCount,
    facingMode,
    isMirrored,
    videoFit,
    localVideoTrack,
    previewTrack,
    isPreviewReady,
    room,
    startBroadcast,
    stopBroadcast,
    switchCamera,
    toggleMicrophone,
    toggleCamera,
    initPreview,
    setMirrored,
    setVideoFit,
    isMicEnabled,
    isCameraEnabled,
  }
}

export default useLiveKitBroadcast
