import { WebPlugin } from '@capacitor/core'
import type { CallKitPlugin } from './CallKit'

/**
 * 웹 폴백 구현 (브라우저에서는 CallKit 없음)
 * 기본적인 시뮬레이션만 제공
 */
export class CallKitWeb extends WebPlugin implements CallKitPlugin {
  private currentCallUUID: string | null = null
  private isSpeakerEnabled = false

  async configureAudioSession(options: { speaker?: boolean }): Promise<{
    success: boolean
    speaker: boolean
    route: string
    actuallyCorrect: boolean
  }> {
    const speaker = options.speaker ?? false
    console.log('🎧 [Web] configureAudioSession (simulated):', speaker)
    this.isSpeakerEnabled = speaker
    this.currentCallUUID = `web-${Date.now()}`
    return {
      success: true,
      speaker,
      route: speaker ? 'Speaker (simulated)' : 'Earpiece (simulated)',
      actuallyCorrect: true,
    }
  }

  async startCall(options: { handle: string }): Promise<{
    success: boolean
    callUUID: string
  }> {
    console.log('📞 [Web] CallKit startCall (simulated):', options.handle)
    this.currentCallUUID = `web-${Date.now()}`
    return {
      success: true,
      callUUID: this.currentCallUUID,
    }
  }

  async reportIncomingCall(options: {
    handle: string
    callerName?: string
  }): Promise<{
    success: boolean
    callUUID: string
  }> {
    console.log('📞 [Web] CallKit reportIncomingCall (simulated):', options)
    this.currentCallUUID = `web-${Date.now()}`
    return {
      success: true,
      callUUID: this.currentCallUUID,
    }
  }

  async reportCallConnected(): Promise<{
    success: boolean
    callUUID?: string
    message?: string
  }> {
    console.log('📞 [Web] CallKit reportCallConnected (simulated)')
    return {
      success: true,
      callUUID: this.currentCallUUID || `web-${Date.now()}`,
    }
  }

  async answerCall(): Promise<{
    success: boolean
    callUUID: string
  }> {
    console.log('📞 [Web] CallKit answerCall (simulated)')
    return {
      success: true,
      callUUID: this.currentCallUUID || `web-${Date.now()}`,
    }
  }

  async endCall(): Promise<{ success: boolean }> {
    console.log('📞 [Web] CallKit endCall (simulated)')
    this.currentCallUUID = null
    return { success: true }
  }

  async setAudioRoute(options: { speaker: boolean }): Promise<{
    success: boolean
    speaker: boolean
    route: string
    actuallyCorrect: boolean
  }> {
    console.log('🔊 [Web] CallKit setAudioRoute (simulated):', options.speaker)
    this.isSpeakerEnabled = options.speaker

    // 웹에서는 audio 요소의 볼륨으로 시뮬레이션
    const audioElements = document.querySelectorAll('audio')
    audioElements.forEach((audio) => {
      audio.volume = options.speaker ? 1.0 : 0.6
    })

    return {
      success: true,
      speaker: options.speaker,
      route: options.speaker ? 'Speaker (simulated)' : 'Earpiece (simulated)',
      actuallyCorrect: true,
    }
  }

  async isCallActive(): Promise<{
    isActive: boolean
    callUUID: string
  }> {
    return {
      isActive: this.currentCallUUID !== null,
      callUUID: this.currentCallUUID || '',
    }
  }
}

