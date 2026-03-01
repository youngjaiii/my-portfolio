import { registerPlugin, type PluginListenerHandle } from '@capacitor/core'

export interface CallKitPlugin {
  /**
   * 오디오 세션만 구성 (CallKit UI 없이)
   * 앱 내 통화에서 사용 - 마이크/스피커 접근 전에 호출
   */
  configureAudioSession(options: { speaker?: boolean }): Promise<{
    success: boolean
    speaker: boolean
    route: string
    actuallyCorrect: boolean
  }>

  /**
   * 발신 통화 시작 (CallKit UI 표시됨 - 필요한 경우만 사용)
   */
  startCall(options: { handle: string }): Promise<{
    success: boolean
    callUUID: string
  }>

  /**
   * 수신 통화 보고 (CallKit UI 표시됨)
   * 통화 요청을 받았을 때 호출 - CallKit UI가 표시됨
   */
  reportIncomingCall(options: {
    handle: string
    callerName?: string
  }): Promise<{
    success: boolean
    callUUID: string
  }>

  /**
   * 발신 통화 연결됨 보고 (상대방이 응답했을 때 호출)
   * 이 시점부터 CallKit 통화 시간 카운트 시작
   */
  reportCallConnected(): Promise<{
    success: boolean
    callUUID?: string
    message?: string
  }>

  /**
   * 앱 내 UI에서 통화 수락 시 호출
   * CallKit에 "응답됨"을 보고
   */
  answerCall(): Promise<{
    success: boolean
    callUUID: string
  }>

  /**
   * 통화 종료
   */
  endCall(): Promise<{ success: boolean }>

  /**
   * 오디오 라우트 설정 (스피커/이어피스)
   */
  setAudioRoute(options: { speaker: boolean }): Promise<{
    success: boolean
    speaker: boolean
    route: string
    actuallyCorrect: boolean
  }>

  /**
   * 현재 통화 활성 상태 확인
   */
  isCallActive(): Promise<{
    isActive: boolean
    callUUID: string
  }>

  /**
   * 통화 시작됨 이벤트
   */
  addListener(
    eventName: 'callStarted',
    listenerFunc: (data: { callUUID: string; isOutgoing: boolean }) => void,
  ): Promise<PluginListenerHandle>

  /**
   * 통화 응답됨 이벤트 (수신 통화 응답 시)
   */
  addListener(
    eventName: 'callAnswered',
    listenerFunc: (data: { callUUID: string }) => void,
  ): Promise<PluginListenerHandle>

  /**
   * 통화 종료됨 이벤트
   */
  addListener(
    eventName: 'callEnded',
    listenerFunc: (data: { callUUID: string; reason: string }) => void,
  ): Promise<PluginListenerHandle>

  /**
   * 음소거 변경 이벤트
   */
  addListener(
    eventName: 'muteChanged',
    listenerFunc: (data: { callUUID: string; isMuted: boolean }) => void,
  ): Promise<PluginListenerHandle>

  /**
   * 통화 연결됨 이벤트 (발신 통화에서 상대방이 응답했을 때)
   */
  addListener(
    eventName: 'callConnected',
    listenerFunc: (data: { callUUID: string }) => void,
  ): Promise<PluginListenerHandle>

  /**
   * 오디오 세션 활성화됨 이벤트 (이 시점에 WebRTC 오디오 시작)
   */
  addListener(
    eventName: 'audioSessionActivated',
    listenerFunc: (data: { speaker: boolean }) => void,
  ): Promise<PluginListenerHandle>

  /**
   * 오디오 세션 비활성화됨 이벤트
   */
  addListener(
    eventName: 'audioSessionDeactivated',
    listenerFunc: (data: Record<string, never>) => void,
  ): Promise<PluginListenerHandle>
}

// 네이티브 플러그인 등록
const CallKit = registerPlugin<CallKitPlugin>('CallKit', {
  // 웹 폴백 (웹에서는 CallKit 없음)
  web: () => import('./CallKitWeb').then((m) => new m.CallKitWeb()),
})

export default CallKit

