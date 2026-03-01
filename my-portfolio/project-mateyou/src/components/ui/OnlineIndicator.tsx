interface OnlineIndicatorProps {
  isOnline?: boolean
  size?: 'sm' | 'md' | 'lg'
}

const sizeClasses = {
  sm: 'w-2 h-2',
  md: 'w-3 h-3',
  lg: 'w-4 h-4',
}

export function OnlineIndicator({
  isOnline = false,
  size = 'sm',
}: OnlineIndicatorProps) {
  if (!isOnline) return null

  return (
    <div className="relative">
      <div
        className={`${sizeClasses[size]} bg-green-500 rounded-full border-2 border-white shadow-sm`}
      >
        <div
          className={`${sizeClasses[size]} bg-green-500 rounded-full animate-ping absolute inset-0`}
        />
      </div>
    </div>
  )
}
