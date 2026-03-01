import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'

interface DrawerProps {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  side?: 'left' | 'right'
  width?: string
}

export function Drawer({
  isOpen,
  onClose,
  children,
  side = 'right',
  width = 'w-80',
}: DrawerProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true)
      document.body.style.overflow = 'hidden'
      // 더 안정적인 애니메이션 시작을 위해 이중 RAF 사용
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsAnimating(true)
        })
      })
    } else {
      setIsAnimating(false)
      document.body.style.overflow = 'unset'
      // 애니메이션 시간을 늘려서 더 부드럽게
      const timer = setTimeout(() => {
        setIsVisible(false)
      }, 350)
      return () => clearTimeout(timer)
    }

    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  if (!isVisible) return null

  const sideClasses = {
    left: 'left-0',
    right: 'right-0',
  }

  const slideClasses = {
    left: isAnimating ? 'translate-x-0' : '-translate-x-full',
    right: isAnimating ? 'translate-x-0' : 'translate-x-full',
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black z-40 md:hidden transition-opacity duration-350 ${
          isAnimating ? 'opacity-40' : 'opacity-0'
        }`}
        onClick={onClose}
        aria-hidden="true"
        style={{
          transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />

      {/* Drawer */}
      <div
        className={`fixed top-0 ${sideClasses[side]} h-full ${width} bg-white shadow-xl z-50 md:hidden transform transition-transform duration-350 ${slideClasses[side]}`}
        role="dialog"
        aria-modal="true"
        style={{
          boxShadow:
            side === 'right'
              ? '-4px 0 20px rgba(0, 0, 0, 0.15)'
              : '4px 0 20px rgba(0, 0, 0, 0.15)',
          transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }}
      >
        {children}
      </div>
    </>
  )
}
