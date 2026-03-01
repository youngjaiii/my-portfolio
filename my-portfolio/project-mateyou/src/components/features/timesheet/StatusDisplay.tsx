interface StatusDisplayProps {
  status: 'OFF' | 'WORKING' | 'BREAK'
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
}

const statusConfig = {
  OFF: {
    label: '미출근',
    dotColor: 'bg-gray-400',
    textColor: 'text-gray-600',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
  },
  WORKING: {
    label: '출근',
    dotColor: 'bg-emerald-500',
    textColor: 'text-emerald-700',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
  },
  BREAK: {
    label: '휴게',
    dotColor: 'bg-amber-500',
    textColor: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
  },
}

export function StatusDisplay({ status, size = 'md', showLabel = true }: StatusDisplayProps) {
  const config = statusConfig[status]

  // 사이즈별 스타일
  const sizeStyles = {
    sm: {
      container: 'gap-1.5 px-2.5 py-1',
      dot: 'w-2 h-2',
      text: 'text-xs font-medium',
    },
    md: {
      container: 'gap-2 px-3 py-1.5',
      dot: 'w-2.5 h-2.5',
      text: 'text-sm font-semibold',
    },
    lg: {
      container: 'gap-3 px-5 py-2.5',
      dot: 'w-3 h-3',
      text: 'text-base font-bold',
    },
  }

  const styles = sizeStyles[size]

  return (
    <div
      className={`inline-flex items-center justify-center rounded-full border ${config.bgColor} ${config.borderColor} ${styles.container}`}
    >
      {/* 상태 도트 (펄스 애니메이션) */}
      <span className="relative flex">
        <span
          className={`${styles.dot} rounded-full ${config.dotColor} ${
            status === 'WORKING' ? 'animate-pulse' : ''
          }`}
        />
      </span>
      {showLabel && (
        <span className={`${styles.text} ${config.textColor}`}>
          {config.label}
        </span>
      )}
    </div>
  )
}

