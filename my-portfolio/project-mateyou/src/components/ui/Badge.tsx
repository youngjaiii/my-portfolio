interface BadgeProps {
  count: number
  max?: number
  className?: string
  size?: 'sm' | 'md'
  position?: 'top-right' | 'top-left' | 'left'
}

export function Badge({
  count,
  max = 99,
  className = '',
  size = 'sm',
  position = 'top-right'
}: BadgeProps) {
  if (count <= 0) return null

  const displayCount = count > max ? `${max}+` : count.toString()

  const sizeClasses = {
    sm: 'text-xs min-w-[18px] h-[18px] px-1',
    md: 'text-sm min-w-[20px] h-[20px] px-1.5'
  }

  const positionClasses = {
    'top-right': '-top-2 -right-2',
    'top-left': '-top-2 -left-2',
    'left': 'top-0 right-[100%]',
  }

  return (
    <div
      className={`
        absolute ${positionClasses[position]}
        bg-red-500 text-white
        ${sizeClasses[size]}
        rounded-full
        flex items-center justify-center
        font-medium leading-none
        shadow-sm border-2 border-white
        z-10
        ${className}
      `}
    >
      {displayCount}
    </div>
  )
}