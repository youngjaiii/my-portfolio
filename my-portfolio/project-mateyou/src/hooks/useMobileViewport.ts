/**
 * useMobileViewport - 모바일 뷰포트 높이 및 키보드 대응 훅
 * 
 * iOS Safari의 100vh 문제와 가상 키보드 대응을 위한 훅
 * - 실제 뷰포트 높이를 CSS 변수로 설정 (--vh, --viewport-height)
 * - 키보드 높이를 감지하여 CSS 변수로 설정 (--keyboard-height)
 * - Visual Viewport API 사용 (모던 브라우저 지원)
 */

import { useCallback, useEffect, useState } from 'react'

interface MobileViewportState {
  viewportHeight: number      // 실제 뷰포트 높이 (px)
  keyboardHeight: number      // 키보드 높이 (px)
  isKeyboardOpen: boolean     // 키보드 열림 여부
  safeViewportHeight: number  // 키보드를 제외한 안전 영역 높이
}

/**
 * 모바일 뷰포트 높이 및 키보드 감지 훅
 * 
 * @example
 * const { viewportHeight, keyboardHeight, isKeyboardOpen } = useMobileViewport()
 * 
 * // CSS 변수 사용:
 * // height: calc(var(--viewport-height, 100vh))
 * // height: calc(var(--safe-viewport-height, 100vh))
 * // padding-bottom: var(--keyboard-height, 0px)
 */
export function useMobileViewport(): MobileViewportState {
  const [state, setState] = useState<MobileViewportState>(() => ({
    viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
    keyboardHeight: 0,
    isKeyboardOpen: false,
    safeViewportHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
  }))

  // CSS 변수 업데이트
  const updateCSSVariables = useCallback((height: number, keyboardH: number) => {
    const root = document.documentElement
    // 1vh = viewportHeight / 100
    root.style.setProperty('--vh', `${height / 100}px`)
    root.style.setProperty('--viewport-height', `${height}px`)
    root.style.setProperty('--keyboard-height', `${keyboardH}px`)
    root.style.setProperty('--safe-viewport-height', `${height - keyboardH}px`)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    // 초기 설정
    const initialHeight = window.innerHeight
    updateCSSVariables(initialHeight, 0)

    // Visual Viewport API 사용 (모던 브라우저)
    const visualViewport = window.visualViewport

    if (visualViewport) {
      const handleViewportResize = () => {
        const viewportHeight = visualViewport.height
        const windowHeight = window.innerHeight
        
        // 키보드 높이 = 윈도우 높이 - 비주얼 뷰포트 높이
        // (키보드가 올라오면 visualViewport.height가 줄어듦)
        const keyboardHeight = Math.max(0, windowHeight - viewportHeight)
        const isKeyboardOpen = keyboardHeight > 100 // 100px 이상이면 키보드로 판단
        
        setState({
          viewportHeight: windowHeight,
          keyboardHeight,
          isKeyboardOpen,
          safeViewportHeight: viewportHeight,
        })

        updateCSSVariables(windowHeight, keyboardHeight)
      }

      // 스크롤 시에도 처리 (iOS Safari에서 주소창 숨김/표시)
      const handleViewportScroll = () => {
        const viewportHeight = visualViewport.height
        const windowHeight = window.innerHeight
        const keyboardHeight = Math.max(0, windowHeight - viewportHeight)

        // 키보드가 열려있지 않을 때만 뷰포트 높이 업데이트
        if (keyboardHeight < 100) {
          updateCSSVariables(viewportHeight, 0)
          setState(prev => ({
            ...prev,
            viewportHeight: viewportHeight,
            safeViewportHeight: viewportHeight,
          }))
        }
      }

      visualViewport.addEventListener('resize', handleViewportResize)
      visualViewport.addEventListener('scroll', handleViewportScroll)

      // 초기 실행
      handleViewportResize()

      return () => {
        visualViewport.removeEventListener('resize', handleViewportResize)
        visualViewport.removeEventListener('scroll', handleViewportScroll)
      }
    } else {
      // Visual Viewport API 미지원 시 폴백 (구형 브라우저)
      const handleResize = () => {
        const height = window.innerHeight
        setState({
          viewportHeight: height,
          keyboardHeight: 0,
          isKeyboardOpen: false,
          safeViewportHeight: height,
        })
        updateCSSVariables(height, 0)
      }

      // 화면 방향 변경 시에도 업데이트
      const handleOrientationChange = () => {
        // 방향 변경 후 약간의 딜레이를 두고 업데이트 (브라우저가 새 크기를 계산할 시간 필요)
        setTimeout(handleResize, 100)
      }

      window.addEventListener('resize', handleResize)
      window.addEventListener('orientationchange', handleOrientationChange)

      return () => {
        window.removeEventListener('resize', handleResize)
        window.removeEventListener('orientationchange', handleOrientationChange)
      }
    }
  }, [updateCSSVariables])

  return state
}

/**
 * 모바일 뷰포트 초기화 함수 (앱 시작 시 한 번 호출)
 * __root.tsx 등에서 사용
 */
export function initMobileViewport() {
  if (typeof window === 'undefined') return

  const updateHeight = () => {
    const vh = window.innerHeight * 0.01
    document.documentElement.style.setProperty('--vh', `${vh}px`)
    document.documentElement.style.setProperty('--viewport-height', `${window.innerHeight}px`)
    document.documentElement.style.setProperty('--safe-viewport-height', `${window.innerHeight}px`)
    document.documentElement.style.setProperty('--keyboard-height', '0px')
  }

  updateHeight()
  window.addEventListener('resize', updateHeight)
  window.addEventListener('orientationchange', () => setTimeout(updateHeight, 100))
}
