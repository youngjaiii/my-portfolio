/**
 * AccordionSection - 공통 아코디언 섹션 컴포넌트
 * 
 * 파트너 대시보드 전반에서 사용하는 접기/펼치기 섹션
 */

import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface AccordionSectionProps {
  /** 섹션 제목 */
  title: string
  /** 섹션 설명 */
  description?: string
  /** 열림 상태 */
  isOpen: boolean
  /** 토글 핸들러 */
  onToggle: () => void
  /** 섹션 내용 */
  children: React.ReactNode
  /** 뱃지 숫자 */
  badge?: number
  /** 뱃지 색상 */
  badgeColor?: 'red' | 'blue' | 'green' | 'yellow'
  /** 강조 표시 (테두리 링) */
  highlight?: boolean
  /** 추가 클래스 */
  className?: string
}

export function AccordionSection({
  title,
  description,
  isOpen,
  onToggle,
  children,
  badge,
  badgeColor = 'red',
  highlight = false,
  className,
}: AccordionSectionProps) {
  const badgeColors = {
    red: 'bg-red-500',
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    yellow: 'bg-yellow-500',
  }

  return (
    <div
      className={cn(
        'rounded-xl border bg-white shadow-sm overflow-hidden',
        highlight && 'ring-2 ring-red-200',
        className
      )}
    >
      {/* 헤더 (클릭 가능) */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
      >
        {/* 왼쪽: 화살표 + 텍스트 */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className={cn(
              'flex items-center justify-center w-6 h-6 rounded-full shrink-0',
              isOpen ? 'bg-gray-100' : 'bg-gray-50'
            )}
          >
            {isOpen ? (
              <ChevronDown className="h-4 w-4 text-gray-500" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-400" />
            )}
          </div>
          <div className="text-left min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-gray-900">{title}</span>
              {badge !== undefined && badge > 0 && (
                <span
                  className={cn(
                    'px-1.5 py-0.5 text-xs font-bold text-white rounded-full',
                    badgeColors[badgeColor]
                  )}
                >
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </div>
            {description && (
              <p className="text-sm text-gray-500 truncate">{description}</p>
            )}
          </div>
        </div>
      </button>

      {/* 컨텐츠 */}
      {isOpen && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-4">{children}</div>
      )}
    </div>
  )
}
