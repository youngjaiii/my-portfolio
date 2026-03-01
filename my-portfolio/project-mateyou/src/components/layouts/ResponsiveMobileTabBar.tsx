import { memo } from 'react'
import { useDevice } from '@/hooks/useDevice'
import { MobileTabBar } from '@/components'

interface ResponsiveMobileTabBarProps {
  shouldHide: boolean
}

/**
 * 모바일 탭바 - isMobile 의존성 격리
 * 모바일에서만 표시
 */
export const ResponsiveMobileTabBar = memo(function ResponsiveMobileTabBar({
  shouldHide,
}: ResponsiveMobileTabBarProps) {
  const { isMobile } = useDevice()

  if (!isMobile || shouldHide) return null

  return <MobileTabBar />
})
