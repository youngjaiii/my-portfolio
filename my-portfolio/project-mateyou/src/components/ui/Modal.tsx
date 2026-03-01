import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { Button, Flex } from '@/components'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  children: ReactNode
  title?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showCloseButton?: boolean
  headerActions?: ReactNode
  disableBackdropClose?: boolean
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

export function Modal({
  isOpen,
  onClose,
  children,
  title,
  size = 'lg',
  showCloseButton = true,
  headerActions,
  disableBackdropClose = false,
}: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
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

  if (!isOpen) return null

  const modalContent = (
    <div className="fixed inset-0 z-9999 overflow-y-auto">
      <Flex align="center" justify="center" className="min-h-screen p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black opacity-60"
          onClick={disableBackdropClose ? undefined : onClose}
          aria-hidden="true"
        />

        {/* Modal */}
        <div
          className={`relative bg-white rounded-lg shadow-xl w-full ${sizeClasses[size]} mx-auto max-h-[90vh] flex flex-col`}
          role="dialog"
          aria-modal="true"
        >
          {/* Sticky Header */}
          {(title || showCloseButton || headerActions) && (
            <Flex
              align="center"
              justify="between"
              className="sticky top-0 z-10 p-4 sm:p-6 border-b border-gray-200 bg-white rounded-t-lg"
            >
              <Flex align="center" gap={3} className="flex-1 min-w-0">
                {title && (
                  <h2 className="text-lg sm:text-xl font-semibold text-gray-900 truncate">
                    {title}
                  </h2>
                )}
                {headerActions && (
                  <div className="flex-shrink-0">{headerActions}</div>
                )}
              </Flex>
              {showCloseButton && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClose}
                  className="ml-auto flex-shrink-0"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </Button>
              )}
            </Flex>
          )}

          {/* Scrollable Content */}
          <div className="overflow-y-auto flex-1">
            <div className="p-4 sm:p-6">{children}</div>
          </div>
        </div>
      </Flex>
    </div>
  )

  // Portal로 document.body에 직접 렌더링
  return createPortal(modalContent, document.body)
}
