import { memo } from 'react'
import { useDevice } from '@/hooks/useDevice'
import { Navigation } from '@/components'

interface ResponsiveNavigationProps {
  shouldHide: boolean
}

/**
 * 반응형 네비게이션 - isMobile 의존성 격리
 * 모바일: Navigation 그대로
 * 데스크탑: 중앙 정렬 + 최대 너비 제한
 */
export const ResponsiveNavigation = memo(function ResponsiveNavigation({
  shouldHide,
}: ResponsiveNavigationProps) {
  const { isMobile } = useDevice()

  if (shouldHide) return null

  if (isMobile) {
    return <Navigation />
  }

  return (
    <div className="mx-auto w-full" style={{ maxWidth: '720px' }}>
      <Navigation variant="relative" />
    </div>
  )
})
