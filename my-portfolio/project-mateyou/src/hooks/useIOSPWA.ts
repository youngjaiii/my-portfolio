import { useState, useEffect } from 'react'

interface IOSPWAState {
  isIOS: boolean
  isInStandaloneMode: boolean
  canInstall: boolean
  iosVersion: number | null
}

/**
 * iOS Safari PWA 관련 상태를 감지하는 훅
 *
 * iOS Safari에서는 PWA(홈화면에 추가)로 실행되어야만 Push 알림을 지원합니다.
 * - iOS 16.4+ 필요
 * - 홈화면에 추가된 상태에서만 Push 지원
 */
export function useIOSPWA(): IOSPWAState {
  const [state, setState] = useState<IOSPWAState>({
    isIOS: false,
    isInStandaloneMode: false,
    canInstall: false,
    iosVersion: null,
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    // iOS 감지
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream

    // PWA(Standalone) 모드인지 확인
    const isInStandaloneMode =
      (window.navigator as any).standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches

    // iOS 버전 추출
    let iosVersion: number | null = null
    if (isIOS) {
      const match = navigator.userAgent.match(/OS (\d+)_/)
      if (match && match[1]) {
        iosVersion = parseInt(match[1], 10)
      }
    }

    // iOS이고, 아직 PWA로 설치 안 했고, 버전이 16.4 이상이면 설치 가능
    const canInstall = isIOS && !isInStandaloneMode && (iosVersion ? iosVersion >= 16 : false)

    setState({
      isIOS,
      isInStandaloneMode,
      canInstall,
      iosVersion,
    })
  }, [])

  return state
}
