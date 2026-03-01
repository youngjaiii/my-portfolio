import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

interface MaskedTextProps {
  /** 원본 텍스트 */
  text: string
  /** 마스킹된 텍스트 */
  maskedText: string
  /** CSS 클래스 */
  className?: string
  /** 버튼 스타일 (기본: hover 시 표시) */
  buttonStyle?: 'hover' | 'always'
  /** 초기 표시 상태 */
  initialVisible?: boolean
}

/**
 * 민감 정보를 마스킹 처리하고, 버튼을 통해 원본을 볼 수 있는 컴포넌트
 * hover 시에만 언마스킹 버튼이 표시됩니다.
 */
export function MaskedText({
  text,
  maskedText,
  className = '',
  buttonStyle = 'hover',
  initialVisible = false,
}: MaskedTextProps) {
  const [isVisible, setIsVisible] = useState(initialVisible)
  const [isHovered, setIsHovered] = useState(false)

  const toggleVisibility = () => {
    setIsVisible(!isVisible)
  }

  const showButton = buttonStyle === 'always' || isHovered

  return (
    <div
      className="inline-flex items-center gap-2 group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span className={className}>{isVisible ? text : maskedText}</span>
      <button
        type="button"
        onClick={toggleVisibility}
        className={`
          p-1 rounded hover:bg-gray-100 transition-all duration-200
          ${showButton ? 'opacity-100 visible' : 'opacity-0 invisible'}
        `}
        title={isVisible ? '숨기기' : '보기'}
        aria-label={isVisible ? '민감 정보 숨기기' : '민감 정보 보기'}
      >
        {isVisible ? (
          <EyeOff className="w-4 h-4 text-gray-500" />
        ) : (
          <Eye className="w-4 h-4 text-gray-500" />
        )}
      </button>
    </div>
  )
}
