import { registerPlugin } from '@capacitor/core'

export interface AudioTogglePlugin {
  /**
   * 스피커폰 모드로 전환
   */
  setSpeakerOn(): Promise<{ success: boolean; isSpeakerOn: boolean }>

  /**
   * 이어피스(귀대고) 모드로 전환
   */
  setEarpieceOn(): Promise<{ success: boolean; isSpeakerOn: boolean }>

  /**
   * 현재 스피커 상태 확인
   */
  isSpeakerOn(): Promise<{ isSpeakerOn: boolean }>

  /**
   * 볼륨 설정 (0.0 ~ 1.0)
   */
  setVolume(options: { volume: number }): Promise<{
    success: boolean
    volume: number
    actualVolume: number
    maxVolume: number
  }>

  /**
   * 현재 볼륨 가져오기
   */
  getVolume(): Promise<{
    volume: number
    currentVolume: number
    maxVolume: number
  }>

  /**
   * 오디오 모드 리셋 (통화 종료시)
   */
  resetAudioMode(): Promise<{ success: boolean }>
}

// 네이티브 플러그인 등록
const AudioToggle = registerPlugin<AudioTogglePlugin>('AudioToggle', {
  // 웹 폴백 (웹에서는 기본 동작)
  web: () =>
    import('./AudioToggleWeb').then((m) => new m.AudioToggleWeb()),
})

export default AudioToggle

