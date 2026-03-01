import { WebPlugin } from '@capacitor/core'
import type { AudioTogglePlugin } from './AudioToggle'

/**
 * 웹 폴백 구현 (브라우저에서 동작)
 * 실제 스피커/이어피스 전환은 불가능하지만, 볼륨 조절은 가능
 */
export class AudioToggleWeb extends WebPlugin implements AudioTogglePlugin {
  private _isSpeakerOn = true
  private _volume = 1.0

  async setSpeakerOn(): Promise<{ success: boolean; isSpeakerOn: boolean }> {
    console.log('🔊 [Web] Speaker mode ON (simulated)')
    this._isSpeakerOn = true
    this._volume = 1.0
    
    // 모든 audio/video 요소의 볼륨 조절
    this.setAllMediaVolume(1.0)
    
    return { success: true, isSpeakerOn: true }
  }

  async setEarpieceOn(): Promise<{ success: boolean; isSpeakerOn: boolean }> {
    console.log('🔈 [Web] Earpiece mode ON (simulated - reduced volume)')
    this._isSpeakerOn = false
    this._volume = 0.5
    
    // 모든 audio/video 요소의 볼륨 조절
    this.setAllMediaVolume(0.5)
    
    return { success: true, isSpeakerOn: false }
  }

  async isSpeakerOn(): Promise<{ isSpeakerOn: boolean }> {
    return { isSpeakerOn: this._isSpeakerOn }
  }

  async setVolume(options: { volume: number }): Promise<{
    success: boolean
    volume: number
    actualVolume: number
    maxVolume: number
  }> {
    const volume = Math.max(0, Math.min(1, options.volume))
    this._volume = volume
    
    // 모든 audio/video 요소의 볼륨 조절
    this.setAllMediaVolume(volume)
    
    console.log(`🔊 [Web] Volume set to: ${volume}`)
    
    return {
      success: true,
      volume,
      actualVolume: Math.round(volume * 100),
      maxVolume: 100,
    }
  }

  async getVolume(): Promise<{
    volume: number
    currentVolume: number
    maxVolume: number
  }> {
    return {
      volume: this._volume,
      currentVolume: Math.round(this._volume * 100),
      maxVolume: 100,
    }
  }

  async resetAudioMode(): Promise<{ success: boolean }> {
    console.log('🔄 [Web] Audio mode reset')
    this._isSpeakerOn = true
    this._volume = 1.0
    this.setAllMediaVolume(1.0)
    return { success: true }
  }

  /**
   * 페이지 내 모든 audio/video 요소의 볼륨 설정
   */
  private setAllMediaVolume(volume: number): void {
    try {
      // audio 요소
      const audioElements = document.querySelectorAll('audio')
      audioElements.forEach((audio) => {
        audio.volume = volume
      })

      // video 요소
      const videoElements = document.querySelectorAll('video')
      videoElements.forEach((video) => {
        video.volume = volume
      })

      console.log(`🔊 [Web] Applied volume ${volume} to ${audioElements.length} audio and ${videoElements.length} video elements`)
    } catch (error) {
      console.warn('Failed to set media volume:', error)
    }
  }
}

