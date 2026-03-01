import type { ReactNode } from 'react'
import { useDevice } from '@/hooks/useDevice'

interface DeviceWrapperProps {
  children: ReactNode
  mobile?: ReactNode
  desktop?: ReactNode
  showOnMobile?: boolean
  showOnDesktop?: boolean
}

export function DeviceWrapper({
  children,
  mobile,
  desktop,
  showOnMobile = true,
  showOnDesktop = true,
}: DeviceWrapperProps) {
  const { isMobile, isDesktop } = useDevice()

  // 특정 디바이스에서만 표시
  if (isMobile && !showOnMobile) return null
  if (isDesktop && !showOnDesktop) return null

  // 디바이스별 다른 콘텐츠 표시
  if (isMobile && mobile) return <>{mobile}</>
  if (isDesktop && desktop) return <>{desktop}</>

  // 기본 콘텐츠 표시
  return <>{children}</>
}

// 편의 컴포넌트들
export function MobileOnly({ children }: { children: ReactNode }) {
  return <DeviceWrapper showOnDesktop={false}>{children}</DeviceWrapper>
}

export function DesktopOnly({ children }: { children: ReactNode }) {
  return <DeviceWrapper showOnMobile={false}>{children}</DeviceWrapper>
}

export function ResponsiveSwitch({
  mobile,
  desktop,
}: {
  mobile: ReactNode
  desktop: ReactNode
}) {
  return (
    <DeviceWrapper mobile={mobile} desktop={desktop}>
      {null}
    </DeviceWrapper>
  )
}
