import { memo } from 'react'
import { useDevice } from '@/hooks/useDevice'
import { DesktopNavRail } from './Navigation'

interface ResponsiveDesktopNavRailProps {
  shouldHide: boolean
}

/**
 * 데스크탑 네비게이션 레일 - isMobile 의존성 격리
 * memo로 감싸서 isMobile 변경 시에만 리렌더링
 */
export const ResponsiveDesktopNavRail = memo(function ResponsiveDesktopNavRail({
  shouldHide,
}: ResponsiveDesktopNavRailProps) {
  const { isMobile } = useDevice()

  if (isMobile || shouldHide) return null

  return <DesktopNavRail />
})
