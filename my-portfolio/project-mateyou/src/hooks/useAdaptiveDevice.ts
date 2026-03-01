/**
 * useAdaptiveDevice - User-Agent 기반 적응형 디바이스 판별
 * 
 * 반응형(responsive)과 달리 초기 로드 시 한 번만 디바이스 타입을 결정하고 고정합니다.
 * 브라우저 크기가 변경되어도 레이아웃 타입이 변경되지 않습니다.
 * 
 * 사용 사례: HLS 플레이어처럼 리마운트되면 안 되는 컴포넌트가 있는 페이지
 */

import { useMemo } from 'react'
import { Capacitor } from '@capacitor/core'

// 모바일 User-Agent 패턴
const MOBILE_UA_REGEX = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i

/**
 * User-Agent 기반으로 모바일 여부 판별
 */
function detectMobileByUserAgent(): boolean {
  if (typeof navigator === 'undefined') return false
  return MOBILE_UA_REGEX.test(navigator.userAgent)
}

/**
 * 터치 디바이스 여부 판별 (보조 판단)
 */
function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0
}

export const useAdaptiveDevice = () => {
  // useMemo로 한 번만 계산하고 고정
  const deviceInfo = useMemo(() => {
    // Capacitor 네이티브 앱은 항상 모바일
    const isNative = Capacitor.isNativePlatform()
    if (isNative) {
      return {
        deviceType: 'mobile' as const,
        isMobile: true,
        isDesktop: false,
        isNative: true,
        detectionMethod: 'native' as const,
      }
    }

    // User-Agent 기반 판별
    const isMobileUA = detectMobileByUserAgent()
    
    // 터치 디바이스 여부 (보조)
    const isTouch = isTouchDevice()
    
    // User-Agent가 모바일이면 모바일, 아니면 데스크탑
    // (터치 디바이스라도 UA가 데스크탑이면 데스크탑으로 처리 - 예: Surface)
    const isMobile = isMobileUA
    
    return {
      deviceType: isMobile ? 'mobile' as const : 'desktop' as const,
      isMobile,
      isDesktop: !isMobile,
      isNative: false,
      isTouch,
      detectionMethod: 'user-agent' as const,
    }
  }, []) // 빈 의존성 배열 = 마운트 시 한 번만 실행

  return deviceInfo
}
