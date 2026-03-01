/**
 * 후원 사운드 관리
 * Web Audio API를 사용하여 티어별 다른 사운드 생성
 */

import { getTierConfig, type DonationTier } from './donationTiers'

// AudioContext 싱글톤
let audioContext: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
  }
  return audioContext
}

// 티어별 사운드 설정
interface SoundConfig {
  frequencies: number[]
  durations: number[]
  type: OscillatorType
  volume: number
  echo: boolean
}

const TIER_SOUNDS: Record<DonationTier, SoundConfig> = {
  bronze: {
    frequencies: [523, 659], // C5, E5
    durations: [0.15, 0.2],
    type: 'sine',
    volume: 0.3,
    echo: false,
  },
  silver: {
    frequencies: [523, 659, 784], // C5, E5, G5
    durations: [0.12, 0.12, 0.25],
    type: 'sine',
    volume: 0.35,
    echo: false,
  },
  gold: {
    frequencies: [523, 659, 784, 1047], // C5, E5, G5, C6
    durations: [0.1, 0.1, 0.1, 0.3],
    type: 'sine',
    volume: 0.4,
    echo: true,
  },
  platinum: {
    frequencies: [523, 659, 784, 1047, 1319], // C5, E5, G5, C6, E6
    durations: [0.08, 0.08, 0.08, 0.15, 0.4],
    type: 'sine',
    volume: 0.45,
    echo: true,
  },
  diamond: {
    frequencies: [523, 659, 784, 1047, 1319, 1568], // C5, E5, G5, C6, E6, G6
    durations: [0.06, 0.06, 0.06, 0.1, 0.15, 0.5],
    type: 'sine',
    volume: 0.5,
    echo: true,
  },
}

/**
 * 단일 음 재생
 */
function playNote(
  ctx: AudioContext,
  frequency: number,
  startTime: number,
  duration: number,
  volume: number,
  type: OscillatorType,
): void {
  const oscillator = ctx.createOscillator()
  const gainNode = ctx.createGain()

  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, startTime)

  // ADSR 엔벨로프
  gainNode.gain.setValueAtTime(0, startTime)
  gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.02)
  gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration)

  oscillator.connect(gainNode)
  gainNode.connect(ctx.destination)

  oscillator.start(startTime)
  oscillator.stop(startTime + duration)
}

/**
 * 에코 효과 추가
 */
function createEchoEffect(ctx: AudioContext): ConvolverNode | null {
  try {
    const convolver = ctx.createConvolver()
    const sampleRate = ctx.sampleRate
    const length = sampleRate * 0.5
    const impulse = ctx.createBuffer(2, length, sampleRate)

    for (let channel = 0; channel < 2; channel++) {
      const channelData = impulse.getChannelData(channel)
      for (let i = 0; i < length; i++) {
        channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2)
      }
    }

    convolver.buffer = impulse
    return convolver
  } catch {
    return null
  }
}

/**
 * 후원 사운드 재생
 */
export function playDonationSound(amount: number): void {
  try {
    const tier = getTierConfig(amount)
    const config = TIER_SOUNDS[tier.tier]
    const ctx = getAudioContext()

    // AudioContext가 suspended 상태면 resume
    if (ctx.state === 'suspended') {
      ctx.resume()
    }

    const now = ctx.currentTime
    let currentTime = now

    // 각 음 순차 재생
    config.frequencies.forEach((freq, i) => {
      playNote(ctx, freq, currentTime, config.durations[i], config.volume, config.type)
      currentTime += config.durations[i] * 0.7 // 약간 겹치게
    })

    // 다이아몬드: 추가 효과음 (하이 벨 사운드)
    if (tier.tier === 'diamond') {
      setTimeout(() => {
        const shimmerFreqs = [2093, 2637, 3136] // C7, E7, G7
        let t = ctx.currentTime
        shimmerFreqs.forEach((freq) => {
          playNote(ctx, freq, t, 0.3, 0.15, 'sine')
          t += 0.05
        })
      }, 300)
    }

    // 플래티넘: 크리스탈 효과
    if (tier.tier === 'platinum') {
      setTimeout(() => {
        playNote(ctx, 1760, ctx.currentTime, 0.4, 0.2, 'triangle') // A6
      }, 200)
    }
  } catch (error) {
    console.warn('후원 사운드 재생 실패:', error)
  }
}

/**
 * 코인 드롭 사운드 (추가 효과)
 */
export function playCoinSound(): void {
  try {
    const ctx = getAudioContext()
    if (ctx.state === 'suspended') ctx.resume()

    const now = ctx.currentTime
    
    // 코인 떨어지는 소리
    const frequencies = [1200, 1400, 1600, 1800]
    frequencies.forEach((freq, i) => {
      playNote(ctx, freq, now + i * 0.03, 0.08, 0.15, 'sine')
    })
  } catch (error) {
    console.warn('코인 사운드 재생 실패:', error)
  }
}

/**
 * 사운드 미리 로드 (AudioContext 초기화)
 */
export function preloadDonationSounds(): void {
  // AudioContext는 사용자 인터랙션 후에만 생성 가능
  // 이 함수는 사용자가 처음 상호작용할 때 호출
  try {
    getAudioContext()
  } catch {
    // 무시
  }
}

