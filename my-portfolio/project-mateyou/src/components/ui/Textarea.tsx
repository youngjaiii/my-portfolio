import { forwardRef } from 'react'

interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  helpText?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helpText, className = '', ...props }, ref) => {
    const baseClasses =
      'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 transition-colors resize-none'
    const stateClasses = error
      ? 'border-red-300 focus:ring-red-500'
      : 'border-gray-300 focus:ring-blue-500'

    return (
      <div className="space-y-1">
        {label && (
          <label className="block text-sm font-medium text-gray-700">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={`${baseClasses} ${stateClasses} ${className}`}
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

Textarea.displayName = 'Textarea'
