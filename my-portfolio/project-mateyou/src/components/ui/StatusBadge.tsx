interface StatusBadgeProps {
  children: React.ReactNode
  variant?: 'success' | 'warning' | 'error' | 'info' | 'secondary'
  size?: 'sm' | 'md'
  className?: string
}

export function StatusBadge({
  children,
  variant = 'secondary',
  size = 'sm',
  className = '',
}: StatusBadgeProps) {
  const variantClasses = {
    success: 'bg-green-100 text-green-800 border-green-200',
    warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    error: 'bg-red-100 text-red-800 border-red-200',
    info: 'bg-blue-100 text-blue-800 border-blue-200',
    secondary: 'bg-gray-100 text-gray-800 border-gray-200',
  }

  const sizeClasses = {
    sm: 'text-xs px-2 py-1',
    md: 'text-sm px-3 py-1.5',
  }

  return (
    <span
      className={`
        inline-flex items-center gap-1
        ${sizeClasses[size]}
        ${variantClasses[variant]}
        border rounded-full
        font-medium
        ${className}
      `}
    >
      {children}
    </span>
  )
}