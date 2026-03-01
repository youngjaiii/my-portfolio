import { useEffect, useState } from 'react'
import { Typography } from './Typography'

interface ToastProps {
  id: string
  message: string
  type?: 'success' | 'error' | 'warning' | 'info'
  duration?: number
  onClose: (id: string) => void
}

const typeStyles = {
  success: 'bg-green-500 text-white border-green-600',
  error: 'bg-red-500 text-white border-red-600',
  warning: 'bg-yellow-500 text-white border-yellow-600',
  info: 'bg-blue-500 text-white border-blue-600',
}

const typeIcons = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
}

export function Toast({
  id,
  message,
  type = 'info',
  duration = 3000,
  onClose,
}: ToastProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    // 마운트 후 애니메이션 시작
    const showTimer = setTimeout(() => {
      setIsVisible(true)
    }, 50)

    return () => clearTimeout(showTimer)
  }, [])

  useEffect(() => {
    if (duration > 0 && isVisible) {
      const hideTimer = setTimeout(() => {
        handleClose()
      }, duration)

      return () => clearTimeout(hideTimer)
    }
  }, [isVisible, duration])

  const handleClose = () => {
    setIsExiting(true)
    setTimeout(() => {
      onClose(id)
    }, 300) // 애니메이션 시간과 맞춤
  }

  return (
    <div
      className={`
        mb-3 transform transition-all duration-300 ease-in-out
        ${
          isVisible && !isExiting
            ? 'translate-x-0 opacity-100 scale-100'
            : 'translate-x-full opacity-0 scale-95'
        }
      `}
    >
      <div
        className={`
          px-4 py-3 rounded-lg shadow-lg border-l-4 min-w-[300px] max-w-md backdrop-blur-sm
          ${typeStyles[type]}
          hover:shadow-xl transition-shadow duration-200
        `}
        style={{
          opacity: 0.8,
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">{typeIcons[type]}</span>
            <Typography variant="body2" className="text-current font-medium">
              {message}
            </Typography>
          </div>
          <button
            onClick={handleClose}
            className="ml-3 text-current hover:opacity-75 transition-opacity duration-200 text-lg font-bold"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  )
}
