import { registerPlugin } from '@capacitor/core'

export interface PluginListenerHandle {
  remove: () => Promise<void>
}

export interface LiveKitPlugin {
  /**
   * LiveKit 룸에 연결
   */
  connect(options: {
    url: string
    token: string
    roomName: string
    callType?: 'voice' | 'video'
  }): Promise<{ success: boolean; roomId: string }>

  /**
   * 룸에서 연결 해제
   */
  disconnect(): Promise<{ success: boolean }>

  /**
   * 마이크 음소거 토글
   */
  setMicrophoneEnabled(options: { enabled: boolean }): Promise<{ success: boolean; enabled: boolean }>

  /**
   * 스피커 모드 설정
   */
  setSpeakerMode(options: { speaker: boolean }): Promise<{ success: boolean; speaker: boolean }>

  /**
   * 현재 연결 상태 확인
   */
  isConnected(): Promise<{ connected: boolean; roomName?: string }>

  // ============ CallKit Methods ============

  /**
   * 발신 통화 시작 (CallKit)
   */
  startOutgoingCall(options: {
    callerName: string
    callUUID?: string
  }): Promise<{ success: boolean; callUUID: string }>

  /**
   * 발신 통화 연결 완료 보고 (CallKit)
   */
  reportOutgoingCallConnected(): Promise<{ success: boolean }>

  /**
   * 수신 통화 보고 (CallKit)
   */
  reportIncomingCall(options: {
    callerId: string
    callerName: string
    roomName: string
  }): Promise<{ success: boolean; callUUID: string }>

  /**
   * 통화 종료 (CallKit)
   */
  endCall(): Promise<{ success: boolean }>

  // ============ Dial Tone Methods ============

  /**
   * 다이얼톤 시작 (iOS 네이티브)
   */
  startDialTone(): Promise<{ success: boolean }>

  /**
   * 다이얼톤 중지 (iOS 네이티브)
   */
  stopDialTone(): Promise<{ success: boolean }>

  // ============ PushKit VoIP Methods ============

  /**
   * VoIP 푸시 등록 (이미 자동 등록되지만 토큰 조회용)
   */
  registerVoIPPush(): Promise<{ success: boolean; token: string | null }>

  /**
   * 현재 VoIP 토큰 조회
   */
  getVoIPToken(): Promise<{ token: string | null; apnsEnv?: string }>

  // ============ Pending Call Info (iOS) ============

  /**
   * 대기 중인 통화 정보 조회 (VoIP 푸시에서 저장된 정보)
   */
  getPendingCallInfo(): Promise<{
    hasPendingCall: boolean
    callerId?: string
    callerName?: string
    roomName?: string
    livekitUrl?: string
    livekitToken?: string
    callType?: 'voice' | 'video'
  }>

  /**
   * 대기 중인 통화 정보 삭제
   */
  clearPendingCallInfo(): Promise<{ success: boolean }>

  /**
   * 활성 통화 상태 확인 (포그라운드 복귀 시 사용)
   */
  getActiveCallState(): Promise<{
    hasActiveCall: boolean
    isConnected: boolean
    callerId?: string
    callerName?: string
    roomName?: string
    livekitUrl?: string
    livekitToken?: string
  }>

  /**
   * 활성 통화 상태 삭제
   */
  clearActiveCallState(): Promise<{ success: boolean }>

  // ============ Native Video Views (iOS) ============

  /**
   * 네이티브 비디오 뷰 표시 (WebView 위에)
   */
  showVideoViews(options: {
    localX?: number
    localY?: number
    localWidth?: number
    localHeight?: number
    remoteX?: number
    remoteY?: number
    remoteWidth?: number
    remoteHeight?: number
  }): Promise<{ success: boolean }>

  /**
   * 네이티브 비디오 뷰 숨기기
   */
  hideVideoViews(): Promise<{ success: boolean }>

  /**
   * 로컬 비디오 미러링 설정
   */
  setLocalVideoMirrored(options: { mirrored: boolean }): Promise<{ success: boolean }>

  // ============ Voice Call Mini Mode (iOS) ============

  /**
   * 음성통화 미니모드 팝업 표시
   */
  showVoiceCallMiniMode(options: { partnerName: string }): Promise<{ success: boolean }>

  /**
   * 음성통화 미니모드 팝업 숨기기
   */
  hideVoiceCallMiniMode(): Promise<{ success: boolean }>

  // ============ Event Listeners ============

  // LiveKit 이벤트
  addListener(
    eventName: 'connected',
    listenerFunc: (info: { roomName: string }) => void,
  ): Promise<PluginListenerHandle>

  addListener(
    eventName: 'disconnected',
    listenerFunc: (info: { reason: string }) => void,
  ): Promise<PluginListenerHandle>

  addListener(
    eventName: 'participantConnected',
    listenerFunc: (info: { participantId: string; participantName: string }) => void,
  ): Promise<PluginListenerHandle>

  addListener(
    eventName: 'participantDisconnected',
    listenerFunc: (info: { participantId: string }) => void,
  ): Promise<PluginListenerHandle>

  addListener(
    eventName: 'trackSubscribed',
    listenerFunc: (info: { participantId: string; trackType: 'audio' | 'video' }) => void,
  ): Promise<PluginListenerHandle>

  // CallKit 이벤트
  addListener(
    eventName: 'outgoingCallStarted',
    listenerFunc: (info: { callUUID: string }) => void,
  ): Promise<PluginListenerHandle>

  addListener(
    eventName: 'callAnswered',
    listenerFunc: (info: { callUUID: string; hasPendingInfo?: boolean }) => void,
  ): Promise<PluginListenerHandle>

  addListener(
    eventName: 'callEnded',
    listenerFunc: (info: {
      callUUID: string
      reason: string
      pendingCallInfo?: { callerId: string; roomName: string } | null
    }) => void,
  ): Promise<PluginListenerHandle>

  addListener(
    eventName: 'muteChanged',
    listenerFunc: (info: { muted: boolean }) => void,
  ): Promise<PluginListenerHandle>

  // PushKit VoIP 이벤트
  addListener(
    eventName: 'voipTokenReceived',
    listenerFunc: (info: { token: string }) => void,
  ): Promise<PluginListenerHandle>

  addListener(
    eventName: 'voipTokenInvalidated',
    listenerFunc: (info: Record<string, never>) => void,
  ): Promise<PluginListenerHandle>

  addListener(
    eventName: 'incomingCall',
    listenerFunc: (info: {
      callUUID: string
      callerName: string
      callerId: string
      roomName: string
      livekitUrl?: string
      livekitToken?: string
    }) => void,
  ): Promise<PluginListenerHandle>

  // iOS 자동 연결 완료 이벤트
  addListener(
    eventName: 'autoConnected',
    listenerFunc: (info: { roomName: string; success: boolean; error?: string }) => void,
  ): Promise<PluginListenerHandle>

  // 네이티브 영상통화 종료 버튼 탭
  addListener(
    eventName: 'nativeEndCallTapped',
    listenerFunc: () => void,
  ): Promise<PluginListenerHandle>

  // 음성통화 미니모드 이벤트
  addListener(
    eventName: 'voiceMiniModeChanged',
    listenerFunc: (info: { isMinimized: boolean }) => void,
  ): Promise<PluginListenerHandle>

  addListener(
    eventName: 'voiceMiniModeCallEnded',
    listenerFunc: () => void,
  ): Promise<PluginListenerHandle>

  addListener(
    eventName: 'voiceMiniModeExpanded',
    listenerFunc: (info: { partnerName: string }) => void,
  ): Promise<PluginListenerHandle>
}

export { PluginListenerHandle }

const LiveKit = registerPlugin<LiveKitPlugin>('LiveKit', {
  web: () => import('./LiveKitWeb').then((m) => new m.LiveKitWeb()),
})

export default LiveKit
