/**
 * 캡처 방지 래퍼 컴포넌트
 */
import { useEffect, type ReactNode } from 'react'
import { 
  CAPTURE_PROTECTION_CLASS, 
  enableCaptureProtection, 
  disableCaptureProtection 
} from '@/utils/captureProtection'

interface CaptureProtectionProps {
  children: ReactNode
  className?: string
  enabled?: boolean
}

export function CaptureProtection({ 
  children, 
  className = '',
  enabled = true 
}: CaptureProtectionProps) {
  useEffect(() => {
    if (enabled) {
      enableCaptureProtection()
    }
    
    return () => {
      if (enabled) {
        disableCaptureProtection()
      }
    }
  }, [enabled])

  if (!enabled) {
    return <>{children}</>
  }

  return (
    <div 
      className={`${CAPTURE_PROTECTION_CLASS} h-full w-full flex flex-col ${className}`}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      {children}
    </div>
  )
}

