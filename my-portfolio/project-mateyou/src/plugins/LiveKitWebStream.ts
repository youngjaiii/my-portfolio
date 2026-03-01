/**
 * LiveKitWebStream - 방송 송출 전용 플러그인
 *
 * 통화용 LiveKitWeb과 분리된 방송 전용 구현
 * - Canvas 기반 비디오 처리(좌우반전 토글을 실제 송출에 반영)
 * - 세로 모드(9:16) 방송 지원
 * - HLS Egress 연동에 최적화
 */

import {
  Room,
  RoomEvent,
  createLocalAudioTrack,
  LocalVideoTrack,
  LocalAudioTrack,
  Track,
  VideoPresets,
} from 'livekit-client'

// 방송 모드 타입
export type StreamMode = 'audio' | 'video'

// 방송 옵션
export interface StreamBroadcastOptions {
  url: string
  token: string
  roomName: string
  mode?: StreamMode
  videoDeviceId?: string
  audioDeviceId?: string
  videoResolution?: 'low' | 'medium' | 'high' | 'hd'
  facingMode?: 'user' | 'environment'
  isMirrored?: boolean
  /**
   * 비디오 프레이밍 방식
   * - cover: 화면을 꽉 채우되 일부가 잘릴 수 있음
   * - contain: 전체 화면을 보여주되 레터박스가 생길 수 있음
   */
  videoFit?: 'cover' | 'contain'
}

// 세로 모드 비디오 해상도 프리셋 (9:16 비율)
const PORTRAIT_VIDEO_PRESETS = {
  low: { width: 180, height: 320, frameRate: 24 },
  medium: { width: 360, height: 640, frameRate: 30 },
  high: { width: 540, height: 960, frameRate: 30 },
  hd: { width: 720, height: 1280, frameRate: 30 },
}

/**
 * 방송 송출 전용 클래스
 */
export class LiveKitWebStream {
  private room: Room | null = null
  private localAudioTrack: LocalAudioTrack | null = null
  private localVideoTrack: LocalVideoTrack | null = null
  private isBroadcasting: boolean = false
  private streamMode: StreamMode = 'video'
  private currentFacingMode: 'user' | 'environment' = 'user'
  private currentResolution = PORTRAIT_VIDEO_PRESETS.high
  private isMirrored: boolean = true
  private currentVideoFit: 'cover' | 'contain' = 'cover'

  // Canvas 기반 비디오 처리
  private sourceStream: MediaStream | null = null
  private sourceVideoEl: HTMLVideoElement | null = null
  private canvas: HTMLCanvasElement | null = null
  private canvasCtx: CanvasRenderingContext2D | null = null
  private canvasStream: MediaStream | null = null
  private canvasVideoTrack: MediaStreamTrack | null = null
  private drawTimer: ReturnType<typeof setInterval> | null = null
  private currentVideoDeviceId: string | undefined

  /**
   * 방송 시작
   */
  async startBroadcast(options: StreamBroadcastOptions): Promise<{ 
    success: boolean 
    roomId?: string 
    error?: string 
  }> {
    try {
      const mode = options.mode || 'video'
      this.streamMode = mode
      this.currentFacingMode = options.facingMode || 'user'
      this.currentResolution = PORTRAIT_VIDEO_PRESETS[options.videoResolution || 'high']
      this.isMirrored = options.isMirrored ?? true
      this.currentVideoFit = options.videoFit || 'cover'
      this.currentVideoDeviceId = options.videoDeviceId
      
      console.log(`📡 [Stream] 방송 시작: ${options.roomName}, 모드: ${mode}, 반전: ${this.isMirrored}`)

      // 기존 리소스 정리
      await this.cleanup()

      // Room 인스턴스 생성
      this.room = new Room({
        adaptiveStream: true,
        dynacast: true,
        videoCaptureDefaults: {
          resolution: {
            width: this.currentResolution.width,
            height: this.currentResolution.height,
            frameRate: this.currentResolution.frameRate,
          },
          facingMode: this.currentFacingMode,
        },
        publishDefaults: {
          videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360],
          videoCodec: 'h264',
        },
      })

      this.setupRoomListeners()

      // 오디오 트랙 생성
      console.log('🎤 [Stream] 오디오 트랙 생성...')
      this.localAudioTrack = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        deviceId: options.audioDeviceId,
      })

      // 비디오 모드인 경우 Canvas 기반 비디오 트랙 생성
      let publishedVideoTrack: MediaStreamTrack | null = null
      if (mode === 'video') {
        console.log('📷 [Stream] Canvas 비디오 트랙 생성...')
        publishedVideoTrack = await this.createCanvasVideoTrack({
          videoDeviceId: options.videoDeviceId,
        })
      }

      // 서버 연결
      console.log('🔌 [Stream] LiveKit 서버 연결...')
      await this.room.connect(options.url, options.token)

      // 트랙 퍼블리시
      console.log('📤 [Stream] 트랙 퍼블리시...')
      await this.room.localParticipant.publishTrack(this.localAudioTrack)
      
      if (mode === 'video' && publishedVideoTrack) {
        const publication = await this.room.localParticipant.publishTrack(publishedVideoTrack, {
          source: Track.Source.Camera,
          name: 'canvas-video',
          simulcast: true,
          videoCodec: 'h264',
        })

        this.localVideoTrack = publication.track as LocalVideoTrack
        console.log(`📤 [Stream] 비디오 트랙 퍼블리시 완료: ${publication.trackSid}`)
      }

      this.isBroadcasting = true
      console.log('✅ [Stream] 방송 시작 완료')

      return {
        success: true,
        roomId: this.room.name || options.roomName,
      }
    } catch (error: any) {
      console.error('❌ [Stream] 방송 시작 실패:', error)
      await this.cleanup()
      
      let errorMessage = error.message || '방송 시작 실패'
      if (error.name === 'NotReadableError') {
        errorMessage = '카메라 또는 마이크가 다른 앱에서 사용 중입니다.'
      } else if (error.name === 'NotAllowedError') {
        errorMessage = '카메라/마이크 권한이 거부되었습니다.'
      }
      
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 좌우반전 설정 (송출에 즉시 반영)
   */
  setMirrored(mirrored: boolean) {
    this.isMirrored = mirrored
  }

  /**
   * 비디오 프레이밍 설정 (송출에 즉시 반영)
   */
  setVideoFit(videoFit: 'cover' | 'contain') {
    this.currentVideoFit = videoFit
  }

  /**
   * Canvas 기반 비디오 트랙 생성
   * - 원본 카메라 → hidden video → canvas draw → captureStream 트랙 publish
   */
  private async createCanvasVideoTrack(options: { videoDeviceId?: string }): Promise<MediaStreamTrack> {
    const { width, height, frameRate } = this.currentResolution

    // Canvas 생성
    this.canvas = document.createElement('canvas')
    this.canvas.width = width
    this.canvas.height = height
    this.canvas.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:-9999;'
    document.body.appendChild(this.canvas)

    this.canvasCtx = this.canvas.getContext('2d', { alpha: false })
    if (!this.canvasCtx) {
      throw new Error('Canvas 2D context 생성 실패')
    }

    // 소스 비디오 엘리먼트 생성
    this.sourceVideoEl = document.createElement('video')
    this.sourceVideoEl.muted = true
    this.sourceVideoEl.playsInline = true
    this.sourceVideoEl.setAttribute('webkit-playsinline', 'true')
    this.sourceVideoEl.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:-9999;'
    document.body.appendChild(this.sourceVideoEl)

    // 카메라 스트림 준비
    await this.replaceCameraStream({
      facingMode: this.currentFacingMode,
      videoDeviceId: options.videoDeviceId,
    })

    // captureStream
    if (typeof this.canvas.captureStream !== 'function') {
      throw new Error('이 브라우저는 canvas.captureStream을 지원하지 않습니다')
    }
    this.canvasStream = this.canvas.captureStream(frameRate)
    this.canvasVideoTrack = this.canvasStream.getVideoTracks()[0] || null
    if (!this.canvasVideoTrack) {
      throw new Error('Canvas에서 비디오 트랙을 캡처할 수 없습니다')
    }
    try {
      this.canvasVideoTrack.contentHint = 'motion'
    } catch { /* ignore */ }

    // draw loop
    const intervalMs = Math.max(16, Math.floor(1000 / frameRate))
    this.drawTimer = setInterval(() => this.drawFrame(), intervalMs)

    // 첫 프레임 바로 그리기
    this.drawFrame()

    return this.canvasVideoTrack
  }

  private drawFrame() {
    if (!this.canvas || !this.canvasCtx || !this.sourceVideoEl) return
    if (this.sourceVideoEl.readyState < 2) return

    const vw = this.sourceVideoEl.videoWidth
    const vh = this.sourceVideoEl.videoHeight
    if (!vw || !vh) return

    const cw = this.canvas.width
    const ch = this.canvas.height

    const shouldMirror = this.currentFacingMode === 'user' && this.isMirrored

    // contain 모드에서는 레터박스 영역이 생기므로 매 프레임 배경을 초기화
    if (this.currentVideoFit === 'contain') {
      this.canvasCtx.fillStyle = '#000'
      this.canvasCtx.fillRect(0, 0, cw, ch)
    }

    this.canvasCtx.save()
    if (shouldMirror) {
      this.canvasCtx.translate(cw, 0)
      this.canvasCtx.scale(-1, 1)
    }

    if (this.currentVideoFit === 'contain') {
      // contain: 전체 화면을 보여주기 (레터박스 가능)
      const scale = Math.min(cw / vw, ch / vh)
      const dw = Math.floor(vw * scale)
      const dh = Math.floor(vh * scale)
      const dx = Math.floor((cw - dw) / 2)
      const dy = Math.floor((ch - dh) / 2)

      this.canvasCtx.drawImage(this.sourceVideoEl, 0, 0, vw, vh, dx, dy, dw, dh)
    } else {
      // cover(중앙 크롭): 9:16을 꽉 채우기
      const videoAspect = vw / vh
      const canvasAspect = cw / ch

      let sx = 0
      let sy = 0
      let sw = vw
      let sh = vh

      if (videoAspect > canvasAspect) {
        // 소스가 더 넓음 → 좌우 크롭
        sw = Math.floor(vh * canvasAspect)
        sx = Math.floor((vw - sw) / 2)
      } else if (videoAspect < canvasAspect) {
        // 소스가 더 높음 → 상하 크롭
        sh = Math.floor(vw / canvasAspect)
        sy = Math.floor((vh - sh) / 2)
      }

      this.canvasCtx.drawImage(this.sourceVideoEl, sx, sy, sw, sh, 0, 0, cw, ch)
    }
    this.canvasCtx.restore()
  }

  private async replaceCameraStream(options: { facingMode: 'user' | 'environment'; videoDeviceId?: string }) {
    // 기존 소스 정리
    if (this.sourceStream) {
      this.sourceStream.getTracks().forEach((t) => t.stop())
      this.sourceStream = null
    }

    const { width, height, frameRate } = this.currentResolution

    const baseConstraints: MediaStreamConstraints = {
      video: {
        width: { ideal: width },
        height: { ideal: height },
        frameRate: { ideal: frameRate },
        facingMode: options.facingMode,
        ...(options.videoDeviceId ? { deviceId: { exact: options.videoDeviceId } } : {}),
      },
      audio: false,
    }

    try {
      this.sourceStream = await navigator.mediaDevices.getUserMedia(baseConstraints)
    } catch (err: any) {
      // 일부 기기에서 해상도 제약 실패 시 폴백
      console.warn('⚠️ [Stream] getUserMedia 제약 폴백:', err?.name || err)
      this.sourceStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: options.facingMode },
        audio: false,
      })
    }

    if (!this.sourceVideoEl) return

    // srcObject 교체 후 재생
    this.sourceVideoEl.srcObject = this.sourceStream

    await new Promise<void>((resolve, reject) => {
      const video = this.sourceVideoEl
      if (!video) return reject(new Error('비디오 엘리먼트가 없습니다'))

      const timeout = setTimeout(() => reject(new Error('카메라 비디오 로드 타임아웃')), 10000)

      const onCanPlay = () => {
        clearTimeout(timeout)
        video.removeEventListener('canplay', onCanPlay)
        video.removeEventListener('error', onError)
        video.play().then(() => resolve()).catch((e) => {
          if (e?.name === 'AbortError') return resolve()
          reject(e)
        })
      }

      const onError = () => {
        clearTimeout(timeout)
        video.removeEventListener('canplay', onCanPlay)
        video.removeEventListener('error', onError)
        reject(new Error('카메라 비디오 로드 실패'))
      }

      video.addEventListener('canplay', onCanPlay)
      video.addEventListener('error', onError)
    })
  }

  /**
   * 방송 종료
   */
  async stopBroadcast(): Promise<{ success: boolean }> {
    try {
      console.log('📡 [Stream] 방송 종료...')
      await this.cleanup()
      console.log('✅ [Stream] 방송 종료 완료')
      return { success: true }
    } catch (error: any) {
      console.error('❌ [Stream] 방송 종료 실패:', error)
      return { success: false }
    }
  }

  /**
   * 리소스 정리
   */
  private async cleanup(): Promise<void> {
    // Canvas draw loop 정리
    if (this.drawTimer) {
      clearInterval(this.drawTimer)
      this.drawTimer = null
    }

    // Canvas track 정리
    if (this.canvasVideoTrack) {
      try { this.canvasVideoTrack.stop() } catch { /* ignore */ }
      this.canvasVideoTrack = null
    }
    this.canvasStream = null

    // 소스 스트림 정리
    if (this.sourceStream) {
      this.sourceStream.getTracks().forEach((t) => t.stop())
      this.sourceStream = null
    }

    // DOM 엘리먼트 정리
    if (this.sourceVideoEl) {
      try { this.sourceVideoEl.pause() } catch { /* ignore */ }
      this.sourceVideoEl.srcObject = null
      this.sourceVideoEl.remove()
      this.sourceVideoEl = null
    }
    if (this.canvas) {
      this.canvas.remove()
      this.canvas = null
      this.canvasCtx = null
    }

    // 로컬 비디오 트랙 정리
    if (this.localVideoTrack) {
      try {
        await this.room?.localParticipant?.unpublishTrack(this.localVideoTrack)
      } catch { /* ignore */ }
      this.localVideoTrack.stop()
      this.localVideoTrack = null
    }

    // 로컬 오디오 트랙 정리
    if (this.localAudioTrack) {
      try {
        await this.room?.localParticipant?.unpublishTrack(this.localAudioTrack)
      } catch { /* ignore */ }
      this.localAudioTrack.stop()
      this.localAudioTrack = null
    }

    // Room 연결 해제
    if (this.room) {
      try {
        await this.room.disconnect()
      } catch { /* ignore */ }
      this.room = null
    }

    this.isBroadcasting = false
  }

  /**
   * 카메라 전환 (전면/후면)
   */
  async switchCamera(): Promise<{ success: boolean; facingMode?: string }> {
    try {
      if (!this.isBroadcasting || !this.room) {
        return { success: false }
      }

      const newFacingMode = this.currentFacingMode === 'user' ? 'environment' : 'user'

      this.currentFacingMode = newFacingMode
      await this.replaceCameraStream({ facingMode: newFacingMode })

      console.log(`📷 [Stream] 카메라 전환: ${newFacingMode}`)
      return { success: true, facingMode: newFacingMode }
    } catch (error: any) {
      console.error('❌ [Stream] 카메라 전환 실패:', error)
      return { success: false }
    }
  }

  /**
   * 마이크 on/off
   */
  async setMicrophoneEnabled(options: { enabled: boolean }): Promise<{ success: boolean; enabled: boolean }> {
    try {
      if (this.room?.localParticipant) {
        await this.room.localParticipant.setMicrophoneEnabled(options.enabled)
      }
      return { success: true, enabled: options.enabled }
    } catch (error) {
      console.error('❌ [Stream] 마이크 설정 실패:', error)
      return { success: false, enabled: !options.enabled }
    }
  }

  /**
   * 카메라 on/off
   */
  async setCameraEnabled(options: { enabled: boolean }): Promise<{ success: boolean; enabled: boolean }> {
    try {
      if (this.room?.localParticipant) {
        await this.room.localParticipant.setCameraEnabled(options.enabled)
      }
      return { success: true, enabled: options.enabled }
    } catch (error) {
      console.error('❌ [Stream] 카메라 설정 실패:', error)
      return { success: false, enabled: !options.enabled }
    }
  }

  /**
   * 방송 상태 조회
   */
  async getBroadcastStatus(): Promise<{ 
    isBroadcasting: boolean 
    mode: StreamMode
    roomName?: string
    participantCount?: number
  }> {
    return {
      isBroadcasting: this.isBroadcasting,
      mode: this.streamMode,
      roomName: this.room?.name,
      participantCount: this.room?.remoteParticipants.size,
    }
  }

  /**
   * 로컬 비디오 트랙 가져오기
   */
  getLocalVideoTrack(): LocalVideoTrack | null {
    return this.localVideoTrack
  }

  /**
   * Room 인스턴스 가져오기
   */
  getRoom(): Room | null {
    return this.room
  }

  /**
   * Room 이벤트 리스너 설정
   */
  private setupRoomListeners() {
    if (!this.room) return

    this.room.on(RoomEvent.Connected, () => {
      console.log('✅ [Stream] Room 연결됨')
    })

    this.room.on(RoomEvent.Disconnected, (reason) => {
      console.log('🔌 [Stream] Room 연결 해제:', reason)
    })

    this.room.on(RoomEvent.LocalTrackPublished, (publication) => {
      console.log('📤 [Stream] 트랙 퍼블리시됨:', publication.trackSid)
    })

    this.room.on(RoomEvent.LocalTrackUnpublished, (publication) => {
      console.log('📥 [Stream] 트랙 언퍼블리시됨:', publication.trackSid)
    })
  }
}

export default LiveKitWebStream
