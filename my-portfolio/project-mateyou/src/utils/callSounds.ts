// 전화 알림음 유틸리티
// 통화 오디오와 완전히 분리된 별도의 AudioContext 사용

// 알림음 볼륨
const SOUND_VOLUME = 0.6 // 볼륨 더 높임

// 각 알림음마다 독립적인 AudioContext 생성/정리
class CallSound {
  protected audioContext: AudioContext | null = null
  protected intervalId: number | null = null
  protected isPlaying = false

  protected createContext(): AudioContext | null {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
      return ctx
    } catch (e) {
      console.warn('AudioContext 생성 실패:', e)
      return null
    }
  }

  protected cleanup() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close()
      } catch (e) {
        // 무시
      }
    }
    this.audioContext = null
    this.isPlaying = false
  }

  stop() {
    this.cleanup()
  }
}

// 발신음 (링백톤) - 전화 거는 사람에게만 재생
class DialingTone extends CallSound {
  async start() {
    if (this.isPlaying) {
      console.log('📞 다이얼 톤 이미 재생 중')
      return
    }
    
    console.log('📞 다이얼 톤 시작 시도')

    try {
      this.isPlaying = true
      this.audioContext = this.createContext()
      if (!this.audioContext) {
        console.warn('📞 AudioContext 생성 실패')
        this.isPlaying = false
        return
      }

      if (this.audioContext.state === 'suspended') {
        console.log('📞 AudioContext suspended - resume 시도')
        await this.audioContext.resume()
      }

      console.log('📞 AudioContext 상태:', this.audioContext.state)

      const playTone = () => {
        if (!this.isPlaying || !this.audioContext) return

        try {
          const ctx = this.audioContext
          if (ctx.state === 'suspended') {
            ctx.resume()
          }

          console.log('📞 다이얼 톤 재생')

          // 두 주파수 혼합 (링백톤 느낌)
          const osc1 = ctx.createOscillator()
          const osc2 = ctx.createOscillator()
          const gain = ctx.createGain()

          osc1.type = 'sine'
          osc1.frequency.setValueAtTime(400, ctx.currentTime)
          osc2.type = 'sine'
          osc2.frequency.setValueAtTime(450, ctx.currentTime)

          // 부드러운 페이드인/페이드아웃 (틱틱 노이즈 방지)
          const vol = SOUND_VOLUME * 0.7
          gain.gain.setValueAtTime(0, ctx.currentTime)
          gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.05) // 부드러운 시작
          gain.gain.setValueAtTime(vol, ctx.currentTime + 0.8)
          gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1) // 부드러운 끝

          osc1.connect(gain)
          osc2.connect(gain)
          gain.connect(ctx.destination)

          osc1.start(ctx.currentTime)
          osc2.start(ctx.currentTime)
          osc1.stop(ctx.currentTime + 1.1)
          osc2.stop(ctx.currentTime + 1.1)
        } catch (e) {
          console.warn('📞 다이얼 톤 개별 재생 실패:', e)
        }
      }

      playTone()
      this.intervalId = window.setInterval(playTone, 3000) // 3초 간격 (1초 소리 + 2초 무음)
    } catch (e) {
      console.warn('📞 다이얼 톤 시작 실패:', e)
      this.cleanup()
    }
  }
}

// 수신음 (벨소리) - 전화 받는 사람에게만 재생
// 단순한 멜로디 + DynamicsCompressor로 클리핑 방지
class RingingTone extends CallSound {
  private compressor: DynamicsCompressorNode | null = null
  private masterGain: GainNode | null = null

  async start() {
    if (this.isPlaying) {
      console.log('🔔 벨소리 이미 재생 중')
      return
    }

    console.log('🔔 벨소리 시작 시도')

    try {
      this.isPlaying = true
      this.audioContext = this.createContext()
      if (!this.audioContext) {
        console.warn('🔔 AudioContext 생성 실패')
        this.isPlaying = false
        return
      }

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
      }

      console.log('🔔 AudioContext 상태:', this.audioContext.state)

      const ctx = this.audioContext

      // 마스터 볼륨 + 컴프레서 (클리핑 방지)
      this.masterGain = ctx.createGain()
      this.masterGain.gain.value = 0.9 // 볼륨 높임

      this.compressor = ctx.createDynamicsCompressor()
      this.compressor.threshold.value = -20
      this.compressor.knee.value = 10
      this.compressor.ratio.value = 8
      this.compressor.attack.value = 0.003
      this.compressor.release.value = 0.1

      this.masterGain.connect(this.compressor)
      this.compressor.connect(ctx.destination)

      // 120 BPM
      const HALF_BEAT = 250 // 반박자 = 250ms

      // 단일 음 재생 (레가토 - 부드럽게 연결, 노이즈 방지)
      const playNote = (frequency: number, startTime: number) => {
        if (!this.isPlaying || !this.audioContext || !this.masterGain) return

        try {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()

          osc.type = 'sine'
          osc.frequency.value = frequency

          // 부드러운 envelope (틱틱 노이즈 방지)
          const duration = 0.45 // 450ms
          const vol = 0.5 // 개별 음 볼륨
          gain.gain.setValueAtTime(0, startTime) // 0에서 시작
          gain.gain.linearRampToValueAtTime(vol, startTime + 0.05) // 50ms 페이드인
          gain.gain.setValueAtTime(vol, startTime + duration - 0.1) // 서스테인
          gain.gain.linearRampToValueAtTime(0, startTime + duration) // 100ms 페이드아웃

          osc.connect(gain)
          gain.connect(this.masterGain!)

          osc.start(startTime)
          osc.stop(startTime + duration + 0.05)
        } catch (e) {
          // 무시
        }
      }

      const playMelody = () => {
        if (!this.isPlaying || !this.audioContext) return
        console.log('🔔 벨소리 재생')

        const now = ctx.currentTime

        // 멜로디: 미-도-파-미-레-솔-미-도
        const notes = [330, 262, 349, 330, 294, 392, 330, 262]
        
        notes.forEach((freq, i) => {
          playNote(freq, now + (i * HALF_BEAT / 1000))
        })
      }

      playMelody()
      this.intervalId = window.setInterval(playMelody, 3000)
    } catch (e) {
      console.warn('🔔 벨소리 시작 실패:', e)
      this.cleanup()
    }
  }

  stop() {
    super.stop()
    this.compressor = null
    this.masterGain = null
  }
}

// 연결음 (짧은 효과음)
function playConnectedTone() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(523, ctx.currentTime)
    osc.frequency.setValueAtTime(659, ctx.currentTime + 0.1)

    gain.gain.setValueAtTime(SOUND_VOLUME, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.25)

    osc.onended = () => {
      try { ctx.close() } catch (e) { /* 무시 */ }
    }
  } catch (e) {
    console.warn('연결음 재생 실패:', e)
  }
}

// 종료음 (짧은 비프 3회)
function playEndTone() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(480, ctx.currentTime)

    // 3번 비프
    gain.gain.setValueAtTime(SOUND_VOLUME, ctx.currentTime)
    gain.gain.setValueAtTime(0, ctx.currentTime + 0.1)
    gain.gain.setValueAtTime(SOUND_VOLUME, ctx.currentTime + 0.2)
    gain.gain.setValueAtTime(0, ctx.currentTime + 0.3)
    gain.gain.setValueAtTime(SOUND_VOLUME, ctx.currentTime + 0.4)
    gain.gain.setValueAtTime(0, ctx.currentTime + 0.5)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.5)

    osc.onended = () => {
      try { ctx.close() } catch (e) { /* 무시 */ }
    }
  } catch (e) {
    console.warn('종료음 재생 실패:', e)
  }
}

// 싱글톤 인스턴스
export const dialingTone = new DialingTone()
export const ringingTone = new RingingTone()
export { playConnectedTone, playEndTone }

// 모든 알림음 강제 중지 (안전장치)
export function stopAllCallSounds() {
  dialingTone.stop()
  ringingTone.stop()
}

