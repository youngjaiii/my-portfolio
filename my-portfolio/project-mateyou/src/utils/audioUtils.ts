/**
 * 안드로이드 기기 감지 유틸리티
 */
export const isAndroid = (): boolean => {
  const ua = navigator.userAgent.toLowerCase()
  return (
    ua.includes('android') ||
    ua.includes('linux;') ||
    /sm-|samsung|pixel|mi|redmi/g.test(ua)
  )
}

/**
 * 글로벌 AudioContext 관리
 * 안드로이드에서 AudioContext 상태 관리를 위한 싱글톤
 */
let audioContext: AudioContext | null = null

export const getAudioContext = (): AudioContext | null => {
  if (!audioContext) {
    try {
      const AudioContextClass =
        window.AudioContext || (window as any).webkitAudioContext
      if (AudioContextClass) {
        audioContext = new AudioContextClass()
        // suspended 상태로 시작하는 것이 정상이므로 경고 무시
      }
    } catch (e) {
      // AudioContext 생성 실패 시 null 반환
      console.warn('AudioContext 생성 실패:', e)
      return null
    }
  }
  return audioContext
}

/**
 * AudioContext 상태 복구
 */
export const resumeAudioContext = async (): Promise<void> => {
  const ctx = getAudioContext()
  if (!ctx) return
  
  try {
    if (ctx.state === 'suspended') {
      await ctx.resume()
      console.log('✅ AudioContext resumed')
    }
  } catch (e) {
    // 사용자 제스처 없이 resume 시도 시 에러 무시
    // console.warn('AudioContext resume 실패:', e)
  }
}

/**
 * 안드로이드 최적화된 원격 오디오 재생
 * @param stream - MediaStream from remote peer
 */
export const playRemoteAudio = async (stream: MediaStream): Promise<void> => {
  console.log('🔊 Remote Stream Received:', stream)

  // 기존 오디오 엘리먼트 재사용 또는 생성
  let audio = document.getElementById('remoteAudio') as HTMLAudioElement
  if (!audio) {
    audio = new Audio()
    audio.id = 'remoteAudio'
  }

  audio.srcObject = stream

  // iOS/Android WebRTC 공통 필수
  audio.autoplay = true
  audio.playsInline = true
  audio.setAttribute('playsinline', 'true')
  audio.setAttribute('webkit-playsinline', 'true')

  // ✅ 볼륨 보장
  audio.muted = false
  audio.volume = 1.0

  // ✅ AudioContext 깨져 있으면 복구
  const ctx = getAudioContext()
  if (ctx && ctx.state === 'suspended') {
    try {
      await ctx.resume()
      console.log('✅ AudioContext resumed')
    } catch (e) {
      // 사용자 제스처 없이 resume 시도 시 에러 무시
    }
  }

  // ✅ Android 전용 강제 스피커 출력
  if (isAndroid()) {
    console.log('🤖 Android detected — enabling speaker mode')
    audio.setAttribute('x-webkit-airplay', 'allow')
  }

  // ✅ DOM에 추가해야 Android에서 안정적으로 출력됨
  if (!document.body.contains(audio)) {
    audio.style.display = 'none'
    document.body.appendChild(audio)
  }

  try {
    await audio.play()
    console.log('✅ Remote audio playing!')
  } catch (err) {
    console.warn('⚠️ Autoplay blocked. Waiting for user interaction...', err)

    // ✅ 사용자 터치 후 재생하도록 리스너 등록
    const handler = async () => {
      try {
        await ctx.resume()
        await audio.play()
        console.log('✅ Audio started after user gesture')
      } catch (error) {
        console.error('Failed to play after gesture:', error)
      } finally {
        window.removeEventListener('touchstart', handler)
        window.removeEventListener('click', handler)
      }
    }

    window.addEventListener('touchstart', handler, { once: true })
    window.addEventListener('click', handler, { once: true })
  }
}

/**
 * 안드로이드 디버그 로그
 */
export const logAndroidDebugInfo = (): void => {
  if (isAndroid()) {
    console.log('🟢 Android mode enabled')
    console.log('🔎 AudioContext state:', getAudioContext().state)
    console.log('🔎 User Agent:', navigator.userAgent)
  }
}
