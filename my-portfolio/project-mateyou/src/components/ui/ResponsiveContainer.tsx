import type { ReactNode } from 'react'
import { useDevice } from '@/hooks/useDevice'

interface ResponsiveContainerProps {
  children: ReactNode
  mobileStyle?: string
  desktopStyle?: string
  className?: string
}

export function ResponsiveContainer({
  children,
  mobileStyle,
  desktopStyle,
  className = '',
}: ResponsiveContainerProps) {
  const { isMobile, isDesktop } = useDevice()

  let responsiveClasses = className

  if (isMobile && mobileStyle) {
    responsiveClasses += ` ${mobileStyle}`
  } else if (isDesktop && desktopStyle) {
    responsiveClasses += ` ${desktopStyle}`
  }

  return <div className={responsiveClasses.trim()}>{children}</div>
}
