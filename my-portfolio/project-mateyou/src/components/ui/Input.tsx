import { forwardRef } from 'react'

interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  error?: string
  helpText?: string
  fullWidth?: boolean
  inputSize?: 'sm' | 'md' | 'lg'
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helpText,
      className = '',
      fullWidth,
      inputSize = 'md',
      onWheel,
      type,
      ...props
    },
    ref,
  ) => {
    const sizeClasses = {
      sm: 'px-2 py-1.5 text-base', // text-sm을 text-base로 변경 (16px)
      md: 'px-3 py-2 text-base',   // 명시적으로 text-base 추가 (16px)
      lg: 'px-4 py-3 text-lg',
    }

    const baseClasses = `w-full border rounded-lg transition-colors ${sizeClasses[inputSize]}`
    const stateClasses = error
      ? 'border-red-300'
      : 'border-gray-300'

    // number 타입일 때 스크롤로 값 변경 방지
    const handleWheel = (e: React.WheelEvent<HTMLInputElement>) => {
      if (type === 'number') {
        e.currentTarget.blur()
      }
      onWheel?.(e)
    }

    return (
      <div className={`space-y-1 ${fullWidth ? 'w-full' : ''}`}>
        {label && (
          <label className="block text-sm font-medium text-gray-700">
            {label}
          </label>
        )}
        <input
          ref={ref}
          type={type}
          className={`${baseClasses} ${stateClasses} ${className}`}
          onWheel={handleWheel}
          {...props}
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        {helpText && !error && (
          <p className="text-xs text-gray-500">{helpText}</p>
        )}
      </div>
    )
  },
)

Input.displayName = 'Input'
