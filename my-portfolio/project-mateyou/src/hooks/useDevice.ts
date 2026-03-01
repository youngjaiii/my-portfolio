import { useMemo } from 'react'
import { useMediaQuery } from 'react-responsive'
import { Capacitor } from '@capacitor/core'

const MOBILE_BREAKPOINT = 1024

export const useDevice = () => {
  // Capacitor 네이티브 앱에서는 항상 모바일로 처리
  const isNative = Capacitor.isNativePlatform()
  
  const mediaQueryOptions = useMemo(
    () => ({
      query: `(max-width: ${MOBILE_BREAKPOINT - 1}px)`,
    }),
    [],
  )
  const mediaQueryMobile = useMediaQuery(mediaQueryOptions)
  
  // 네이티브 앱이면 항상 모바일, 아니면 미디어 쿼리 결과 사용
  const isMobile = isNative || mediaQueryMobile
  const deviceType = isMobile ? 'mobile' : 'desktop'

  return {
    deviceType,
    isMobile,
    isDesktop: !isMobile,
    isNative,
  }
}
