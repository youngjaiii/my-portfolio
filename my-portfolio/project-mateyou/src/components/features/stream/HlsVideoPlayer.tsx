/**
 * HlsVideoPlayer - HLS 스트림 재생 컴포넌트
 * 
 * hls.js를 사용하여 HLS 스트림을 재생합니다.
 * 테스트 페이지와 동일한 안정적 설정 적용
 */

import Hls from 'hls.js'
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface HlsVideoPlayerProps {
  hlsUrl: string | null
  roomTitle?: string
  hostName?: string
  hostInitial?: string
  isConnecting?: boolean
  className?: string
  onError?: (error: string) => void
  onReady?: () => void
  autoPlay?: boolean
  lowLatency?: boolean
}

// 모바일 디바이스 감지
const isMobile = () => {
  if (typeof navigator === 'undefined') return false
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (typeof window !== 'undefined' && window.innerWidth < 768)
}

// HLS 기본 설정 - 데스크탑용 (저지연 + 고품질)
const HLS_DESKTOP_CONFIG = {
  enableWorker: true,
  lowLatencyMode: true,
  liveSyncDurationCount: 2,
  liveMaxLatencyDurationCount: 3,
  liveDurationInfinity: true,
  maxBufferLength: 8,
  maxMaxBufferLength: 15,
  maxBufferSize: 30 * 1024 * 1024,
  maxBufferHole: 0.3,
  backBufferLength: 20,
  liveBackBufferLength: 15,
  startPosition: -1,
  startFragPrefetch: true,
  testBandwidth: false,
  fragLoadingMaxRetry: 6,
  manifestLoadingMaxRetry: 6,
  levelLoadingMaxRetry: 6,
  fragLoadingRetryDelay: 300,
  manifestLoadingRetryDelay: 300,
  levelLoadingRetryDelay: 300,
  abrEwmaDefaultEstimate: 5000000,
  abrBandWidthFactor: 0.95,
  abrBandWidthUpFactor: 0.7,
  abrMaxWithRealBitrate: true,
  stretchShortVideoTrack: true,
  forceKeyFrameOnDiscontinuity: true,
  nudgeOffset: 0.05,
  nudgeMaxRetry: 3,
  highBufferWatchdogPeriod: 1,
  progressive: true,
}

// HLS 모바일 설정 - 안정성 우선 (버퍼 증가, 저지연 비활성화)
const HLS_MOBILE_CONFIG = {
  enableWorker: true,
  // 모바일에서는 저지연 모드 비활성화 (안정성 우선)
  lowLatencyMode: false,
  liveSyncDurationCount: 4,        // 4세그먼트(8초) 지연 허용 - 안정적
  liveMaxLatencyDurationCount: 6,  // 최대 6세그먼트(12초) 허용
  liveDurationInfinity: true,
  // 버퍼 설정 - 모바일 안정성 최적화
  maxBufferLength: 30,             // 30초 버퍼 (끊김 방지)
  maxMaxBufferLength: 60,          // 최대 60초까지 확장
  maxBufferSize: 60 * 1024 * 1024, // 60MB 버퍼
  maxBufferHole: 0.5,              // 버퍼 갭 허용치 증가
  backBufferLength: 30,            // 30초 백버퍼
  liveBackBufferLength: 20,        // 20초 라이브 백버퍼
  startPosition: -1,
  startFragPrefetch: true,
  testBandwidth: true,             // 대역폭 테스트 활성화 (적절한 품질 선택)
  // 에러 복구 - 더 여유롭게
  fragLoadingMaxRetry: 10,
  manifestLoadingMaxRetry: 10,
  levelLoadingMaxRetry: 10,
  fragLoadingRetryDelay: 500,      // 재시도 간격 증가
  manifestLoadingRetryDelay: 500,
  levelLoadingRetryDelay: 500,
  fragLoadingMaxRetryTimeout: 64000, // 타임아웃 증가
  manifestLoadingMaxRetryTimeout: 64000,
  levelLoadingMaxRetryTimeout: 64000,
  // 품질 설정 - 안정적 ABR
  abrEwmaDefaultEstimate: 2000000, // 2Mbps 보수적 시작
  abrBandWidthFactor: 0.8,         // 대역폭 80%만 활용 (안정성)
  abrBandWidthUpFactor: 0.5,       // 품질 상승 보수적
  abrMaxWithRealBitrate: true,
  // 세그먼트 전환 최적화
  stretchShortVideoTrack: true,
  forceKeyFrameOnDiscontinuity: true,
  nudgeOffset: 0.1,                // 미세조정 여유 증가
  nudgeMaxRetry: 5,                // 더 많은 복구 시도
  highBufferWatchdogPeriod: 2,     // 버퍼 감시 주기 증가
  progressive: true,
}

// 디바이스에 따른 설정 선택
const getHlsConfig = () => isMobile() ? HLS_MOBILE_CONFIG : HLS_DESKTOP_CONFIG

// Supabase 프록시 URL인지 확인 (인증이 필요한 엔드포인트만)
// api-stream-hls는 --no-verify-jwt로 배포되어 인증 불필요
const isSupabaseProxy = (url: string) => {
  // api-stream-hls는 인증 불필요
  if (url.includes('api-stream-hls')) return false
  // 다른 api-stream 엔드포인트는 인증 필요
  return url.includes('supabase.co/functions') || url.includes('api-stream')
}

const MAX_RETRIES = 10
const MAX_LATENCY_DESKTOP = 6   // 데스크탑: 6초 초과 시 자동 라이브 복구
const MAX_LATENCY_MOBILE = 15   // 모바일: 15초 초과 시 자동 라이브 복구 (안정성 우선)

export const HlsVideoPlayer = memo(function HlsVideoPlayer({
  hlsUrl,
  roomTitle,
  hostInitial,
  isConnecting = false,
  className = '',
  onError,
  onReady,
  autoPlay = true,
}: HlsVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const retryCountRef = useRef(0)
  const latencyIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const bufferingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  // 콜백들을 ref로 저장해서 useEffect 의존성에서 제거
  const onErrorRef = useRef(onError)
  const onReadyRef = useRef(onReady)
  const autoPlayRef = useRef(autoPlay)
  const authTokenRef = useRef<string | null>(null)
  
  // ref 업데이트
  onErrorRef.current = onError
  onReadyRef.current = onReady
  autoPlayRef.current = autoPlay
  
  const [hasStream, setHasStream] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [showBuffering, setShowBuffering] = useState(false) // 실제 UI 표시용 (딜레이 적용)
  const [, setLatency] = useState<number>(0) // updateLatency에서 사용

  // 인증 토큰 가져오기 (프록시 URL용) - 마운트 시 한 번만
  useEffect(() => {
    const getToken = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        authTokenRef.current = session.access_token
      }
    }
    getToken()
  }, [])

  // 버퍼링 UI 딜레이 처리 (짧은 버퍼링은 표시하지 않음)
  useEffect(() => {
    if (isBuffering) {
      // 800ms 이상 버퍼링 지속 시에만 표시
      bufferingTimeoutRef.current = setTimeout(() => {
        setShowBuffering(true)
      }, 800)
    } else {
      // 버퍼링 종료 시 즉시 숨김
      if (bufferingTimeoutRef.current) {
        clearTimeout(bufferingTimeoutRef.current)
        bufferingTimeoutRef.current = null
      }
      setShowBuffering(false)
    }

    return () => {
      if (bufferingTimeoutRef.current) {
        clearTimeout(bufferingTimeoutRef.current)
      }
    }
  }, [isBuffering])

  // 라이브 엣지로 점프 (저지연 최적화)
  const jumpToLive = useCallback(() => {
    const video = videoRef.current
    const hls = hlsRef.current
    if (!video || !hls) return

    // hls.js의 liveSyncPosition 우선 사용 (가장 정확)
    if (hls.liveSyncPosition && hls.liveSyncPosition > 0) {
      const jump = hls.liveSyncPosition - video.currentTime
      if (jump > 0.3) {
        video.currentTime = hls.liveSyncPosition
        console.log(`🔴 [HlsPlayer] 라이브로 점프 (sync): ${jump.toFixed(1)}초`)
      }
    } else {
      // 버퍼 끝으로 점프 (폴백)
      const buffered = video.buffered
      if (buffered.length > 0) {
        const liveEdge = buffered.end(buffered.length - 1)
        const jump = liveEdge - video.currentTime
        if (jump > 0.3) {
          video.currentTime = liveEdge - 0.2 // 약간의 여유
          console.log(`🔴 [HlsPlayer] 라이브로 점프 (buffer): ${jump.toFixed(1)}초`)
        }
      }
    }

    video.play().catch(() => {})
  }, [])

  // 레이턴시 업데이트
  const updateLatency = useCallback(() => {
    const video = videoRef.current
    if (!video || video.paused) return

    const buffered = video.buffered
    if (buffered.length > 0) {
      const bufferedEnd = buffered.end(buffered.length - 1)
      const currentLatency = bufferedEnd - video.currentTime
      setLatency(currentLatency)

      // 지연이 MAX_LATENCY 초과시 자동 라이브 복구 (모바일은 더 여유롭게)
      const maxLatency = isMobile() ? MAX_LATENCY_MOBILE : MAX_LATENCY_DESKTOP
      if (currentLatency > maxLatency) {
        console.log(`⚠️ [HlsPlayer] 지연 ${currentLatency.toFixed(1)}초 초과 (한도: ${maxLatency}초) - 자동 복구`)
        jumpToLive()
      }
    }
  }, [jumpToLive])

  // HLS 초기화 - hlsUrl만 의존
  useEffect(() => {
    if (!hlsUrl) {
      setHasStream(false)
      return
    }

    const video = videoRef.current
    if (!video) return

    // 기존 HLS 인스턴스 정리
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    // 기존 인터벌 정리
    if (latencyIntervalRef.current) {
      clearInterval(latencyIntervalRef.current)
      latencyIntervalRef.current = null
    }

    retryCountRef.current = 0
    console.log(`🎬 [HlsPlayer] 재생 시작: ${hlsUrl}`)

    if (Hls.isSupported()) {
      // 프록시 URL인 경우 인증 헤더 설정
      const needsAuth = isSupabaseProxy(hlsUrl)
      const currentAuthToken = authTokenRef.current
      const isMobileDevice = isMobile()
      
      console.log(`📱 [HlsPlayer] 디바이스: ${isMobileDevice ? '모바일' : '데스크탑'}`)
      
      const hlsConfig = {
        ...getHlsConfig(),
        // Supabase 프록시 URL인 경우 인증 헤더 추가
        xhrSetup: needsAuth && currentAuthToken ? (xhr: XMLHttpRequest) => {
          xhr.setRequestHeader('Authorization', `Bearer ${currentAuthToken}`)
        } : undefined,
      }
      
      const hls = new Hls(hlsConfig)
      hlsRef.current = hls
      
      if (needsAuth && currentAuthToken) {
        console.log('🔐 [HlsPlayer] 인증 헤더 활성화 (프록시 URL)')
      }

      // 에러 핸들러
      hls.on(Hls.Events.ERROR, (_, data) => {
        const { type, details, fatal } = data

        if (fatal) {
          console.error('❌ [HlsPlayer] 치명적 에러:', details)

          switch (type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              console.log('⚠️ [HlsPlayer] 네트워크 에러 - 복구 시도...')
              if (retryCountRef.current < MAX_RETRIES) {
                retryCountRef.current++
                setTimeout(() => {
                  hls.startLoad()
                }, 2000)
              } else {
                onErrorRef.current?.('네트워크 오류가 발생했습니다')
                setHasStream(false)
              }
              break

            case Hls.ErrorTypes.MEDIA_ERROR:
              console.log('⚠️ [HlsPlayer] 미디어 에러 - 복구 시도...')
              hls.recoverMediaError()
              break

            default:
              onErrorRef.current?.('스트림을 재생할 수 없습니다')
              setHasStream(false)
              break
          }
        }
      })

      hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
        const levels = data.levels
        console.log(`✅ [HlsPlayer] 스트림 로드됨 (${levels.length}개 화질)`)
        
        // 최고 품질 자동 선택 (여러 화질이 있을 경우)
        if (levels.length > 1) {
          const highestLevel = levels.length - 1
          hls.currentLevel = highestLevel
          console.log(`🎬 [HlsPlayer] 최고 품질 선택: ${levels[highestLevel].height}p`)
        }
        
        setHasStream(true)
        retryCountRef.current = 0
        onReadyRef.current?.()

        if (autoPlayRef.current) {
          video.play().catch(() => {})
        }
      })

      hls.on(Hls.Events.FRAG_LOADED, () => {
        retryCountRef.current = 0
      })

      hls.on(Hls.Events.LIVE_BACK_BUFFER_REACHED, () => {
        jumpToLive()
      })

      hls.attachMedia(video)
      hls.loadSource(hlsUrl)

      // 레이턴시 체크 인터벌 (500ms)
      latencyIntervalRef.current = setInterval(updateLatency, 500)

    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari/iOS 네이티브 HLS - iOS 최적화 설정 추가
      console.log('📱 [HlsPlayer] iOS Safari 네이티브 HLS 사용')
      
      video.src = hlsUrl
      
      // iOS 네이티브 HLS 버퍼 설정 (서버 느림 대응 - 여유롭게)
      const IOS_BUFFER_PADDING = 10      // 라이브 엣지에서 10초 뒤에서 시작
      const IOS_MAX_LATENCY = 45         // 45초 이상 지연 시에만 자동 복구
      const IOS_RECOVERY_PADDING = 8     // 복구 시 8초 여유
      const IOS_STALLED_TIMEOUT = 8000   // stalled 후 8초 대기
      const IOS_WAITING_TIMEOUT = 10000  // waiting 후 10초 대기
      
      // iOS 네이티브 HLS 전용 이벤트 핸들러
      const handleLoadedMetadata = () => {
        console.log('✅ [HlsPlayer] iOS: 메타데이터 로드됨')
        setHasStream(true)
        onReadyRef.current?.()
        
        // 라이브 스트림인 경우 - 충분한 버퍼 확보 후 재생
        if (video.duration === Infinity || !isFinite(video.duration)) {
          if (video.seekable.length > 0) {
            const liveEdge = video.seekable.end(video.seekable.length - 1)
            // 라이브 엣지에서 10초 뒤에서 시작 (버퍼 여유 확보)
            video.currentTime = Math.max(0, liveEdge - IOS_BUFFER_PADDING)
            console.log(`🔴 [HlsPlayer] iOS: 라이브 엣지에서 ${IOS_BUFFER_PADDING}초 뒤에서 시작 (${liveEdge.toFixed(1)}초)`)
          }
        }
      }
      
      // iOS 전용: 버퍼링 복구 및 라이브 엣지 유지 (여유롭게)
      const handleTimeUpdate = () => {
        // 라이브 스트림에서 지연이 너무 크면 라이브 엣지로 점프
        if (video.duration === Infinity && video.seekable.length > 0) {
          const liveEdge = video.seekable.end(video.seekable.length - 1)
          const currentLatency = liveEdge - video.currentTime
          
          // 45초 이상 지연 시에만 자동 복구 (서버 느림 대응)
          if (currentLatency > IOS_MAX_LATENCY) {
            console.log(`⚠️ [HlsPlayer] iOS: 지연 ${currentLatency.toFixed(1)}초 - 라이브로 복구`)
            video.currentTime = Math.max(0, liveEdge - IOS_RECOVERY_PADDING)
          }
        }
      }
      
      // iOS 전용: 버퍼링 시 복구 시도 (여유롭게)
      const handleIOSStalled = () => {
        console.log('⚠️ [HlsPlayer] iOS: 스트림 지연됨 - 복구 대기')
        setIsBuffering(true)
        
        // 8초 후에도 재생되지 않으면 라이브 엣지로 점프
        setTimeout(() => {
          if (video.paused || video.readyState < 3) {
            if (video.seekable.length > 0) {
              const liveEdge = video.seekable.end(video.seekable.length - 1)
              video.currentTime = Math.max(0, liveEdge - IOS_RECOVERY_PADDING)
              video.play().catch(() => {})
              console.log('🔄 [HlsPlayer] iOS: 강제 라이브 복구')
            }
          }
        }, IOS_STALLED_TIMEOUT)
      }
      
      // iOS 전용: waiting 이벤트에서 복구 (여유롭게)
      const handleIOSWaiting = () => {
        setIsBuffering(true)
        
        // 10초 이상 버퍼링 시 라이브 엣지로 점프
        const waitingTimeout = setTimeout(() => {
          if (video.readyState < 3 && video.seekable.length > 0) {
            const liveEdge = video.seekable.end(video.seekable.length - 1)
            const jump = liveEdge - video.currentTime
            
            if (jump > 5) {
              video.currentTime = Math.max(0, liveEdge - IOS_RECOVERY_PADDING)
              console.log(`🔄 [HlsPlayer] iOS: 버퍼링 복구 (${jump.toFixed(1)}초 점프)`)
            }
            video.play().catch(() => {})
          }
        }, IOS_WAITING_TIMEOUT)
        
        // playing 이벤트에서 타임아웃 취소
        const clearWaitingTimeout = () => {
          clearTimeout(waitingTimeout)
          video.removeEventListener('playing', clearWaitingTimeout)
        }
        video.addEventListener('playing', clearWaitingTimeout)
      }
      
      // iOS 에러 처리
      const handleIOSError = () => {
        const error = video.error
        if (error) {
          console.error('❌ [HlsPlayer] iOS 에러:', error.code, error.message)
          
          // 네트워크 에러(2) 또는 디코딩 에러(3)인 경우 재시도
          if (error.code === 2 || error.code === 3) {
            if (retryCountRef.current < MAX_RETRIES) {
              retryCountRef.current++
              console.log(`🔄 [HlsPlayer] iOS: 재시도 ${retryCountRef.current}/${MAX_RETRIES}`)
              
              setTimeout(() => {
                video.src = ''
                video.src = hlsUrl
                video.load()
                video.play().catch(() => {})
              }, 2000)
            } else {
              onErrorRef.current?.('스트림을 재생할 수 없습니다')
              setHasStream(false)
            }
          }
        }
      }
      
      video.addEventListener('loadedmetadata', handleLoadedMetadata)
      video.addEventListener('timeupdate', handleTimeUpdate)
      video.addEventListener('stalled', handleIOSStalled)
      video.addEventListener('waiting', handleIOSWaiting)
      video.addEventListener('error', handleIOSError)
      
      // cleanup에 iOS 이벤트 정리 추가
      const originalCleanup = () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata)
        video.removeEventListener('timeupdate', handleTimeUpdate)
        video.removeEventListener('stalled', handleIOSStalled)
        video.removeEventListener('waiting', handleIOSWaiting)
        video.removeEventListener('error', handleIOSError)
      }
      
      // 스트림 로드 시작
      video.load()
      
      if (autoPlayRef.current) {
        video.play().catch((err) => {
          console.log('⚠️ [HlsPlayer] iOS: 자동재생 실패, 사용자 상호작용 필요:', err.name)
        })
      }
      
      // 레이턴시 체크 인터벌 (iOS용) - 1초마다
      latencyIntervalRef.current = setInterval(() => {
        if (video.paused || video.seekable.length === 0) return
        
        const liveEdge = video.seekable.end(video.seekable.length - 1)
        const currentLatency = liveEdge - video.currentTime
        setLatency(currentLatency)
      }, 1000)
      
      // cleanup 확장 - 기존 return 전에 originalCleanup 호출 필요
      // (이 부분은 기존 cleanup과 통합되어야 함)
      const existingCleanup = () => {
        originalCleanup()
        if (latencyIntervalRef.current) {
          clearInterval(latencyIntervalRef.current)
          latencyIntervalRef.current = null
        }
      }
      
      // 반환될 cleanup에서 호출하도록 설정
      ;(video as HTMLVideoElement & { __iosCleanup?: () => void }).__iosCleanup = existingCleanup
    } else {
      onErrorRef.current?.('이 브라우저는 HLS를 지원하지 않습니다')
    }

    // 비디오 이벤트 핸들러
    const handleWaiting = () => setIsBuffering(true)
    const handlePlaying = () => setIsBuffering(false)
    const handleStalled = () => {
      setIsBuffering(true)
      // 일정 시간 후에도 버퍼링 중이면 라이브로 점프 (모바일은 더 여유롭게)
      const recoveryDelay = isMobile() ? 8000 : 3000
      setTimeout(() => {
        if (videoRef.current?.paused) {
          jumpToLive()
        }
      }, recoveryDelay)
    }

    video.addEventListener('waiting', handleWaiting)
    video.addEventListener('playing', handlePlaying)
    video.addEventListener('stalled', handleStalled)

    return () => {
      if (latencyIntervalRef.current) {
        clearInterval(latencyIntervalRef.current)
        latencyIntervalRef.current = null
      }

      video.removeEventListener('waiting', handleWaiting)
      video.removeEventListener('playing', handlePlaying)
      video.removeEventListener('stalled', handleStalled)

      // iOS Safari 네이티브 HLS 이벤트 정리
      const iosCleanup = (video as HTMLVideoElement & { __iosCleanup?: () => void }).__iosCleanup
      if (iosCleanup) {
        iosCleanup()
        delete (video as HTMLVideoElement & { __iosCleanup?: () => void }).__iosCleanup
      }

      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- hlsUrl만 변경 시 재초기화, 나머지는 ref로 접근
  }, [hlsUrl])

  return (
    <div className={`relative w-full h-full overflow-hidden ${className}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={false}
        preload="auto"
        className="absolute inset-0 w-full h-full object-contain bg-black"
        style={{ transform: 'translateZ(0)' }}
      />

      {/* 버퍼링 오버레이 (800ms 이상 지속 시에만 표시, 페이드 애니메이션) */}
      <div 
        className={`absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity duration-300 ${
          showBuffering && hasStream ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-3 border-white/80 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>

      {/* 레이턴시 표시 - 개발용으로만 사용, 프로덕션에서는 숨김 */}
      {/* {hasStream && latency > 0 && (
        <div className={`absolute top-2 right-2 px-2 py-1 rounded text-xs text-white ${
          latency > MAX_LATENCY ? 'bg-red-500' : latency > 4 ? 'bg-yellow-500' : 'bg-green-600/80'
        }`}>
          {latency.toFixed(1)}s
        </div>
      )} */}

      {/* 대기 화면 */}
      {!hasStream && (
        <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#1a1825] via-[#0d0b12] to-[#110f1a]">
          {/* 배경 장식 */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-[#FE3A8F]/10 rounded-full blur-3xl" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
          </div>

          {/* 컨텐츠 */}
          <div className="relative z-10 flex flex-col items-center">
            {/* 프로필 이미지 영역 */}
            <div className="relative mb-8">
              <div className="w-28 h-28 rounded-2xl bg-gradient-to-br from-[#FE3A8F] to-[#ff6b9d] flex items-center justify-center shadow-2xl shadow-[#FE3A8F]/30 ring-4 ring-white/10">
                <span className="text-4xl font-bold text-white">
                  {hostInitial?.charAt(0)?.toUpperCase() || 'U'}
                </span>
              </div>
              {/* 라이브 배지 */}
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 px-3 py-1 bg-red-500 rounded-full shadow-lg shadow-red-500/50">
                <span className="text-xs font-bold text-white tracking-wider">LIVE</span>
              </div>
            </div>

            {/* 제목 */}
            <h3 className="text-2xl font-bold text-white mb-2 text-center max-w-md">
              {roomTitle || '방송 대기 중'}
            </h3>

            {/* 상태 표시 */}
            {isConnecting ? (
              <div className="flex items-center gap-3 mt-4">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 bg-[#FE3A8F] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2.5 h-2.5 bg-[#FE3A8F] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2.5 h-2.5 bg-[#FE3A8F] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-gray-400 text-sm">스트림 연결 중...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-4 text-gray-500">
                <div className="w-2 h-2 bg-gray-500 rounded-full animate-pulse" />
                <span className="text-sm">방송 대기 중</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
})
