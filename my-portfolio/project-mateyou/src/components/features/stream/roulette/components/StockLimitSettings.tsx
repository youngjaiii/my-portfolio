/**
 * StockLimitSettings - 수량 제한 설정 컴포넌트
 * 
 * - 전체 수량 제한 또는 유저별 수량 제한 중 하나만 선택 가능
 */

import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { Infinity, Package, Users } from 'lucide-react'
import { useState } from 'react'

export type StockLimitType = 'global' | 'per_user' | null

export interface StockLimitValues {
  /** 수량 제한 타입: 'global'(전체), 'per_user'(유저별), null(무제한) */
  stockLimitType: StockLimitType
  /** 수량 제한 값 */
  stockLimit: number | null
  /** 꽝 여부 (레거시 호환용, 별도 컴포넌트에서 관리) */
  isBlank: boolean
}

interface StockLimitSettingsProps {
  value: StockLimitValues
  onChange: (value: StockLimitValues) => void
  defaultExpanded?: boolean
  className?: string
  /** 디지털 타입 여부 - true면 유저당 1회 제한으로 고정 */
  isDigitalType?: boolean
}

export function StockLimitSettings({
  value,
  onChange,
  defaultExpanded = false,
  className,
  isDigitalType = false,
}: StockLimitSettingsProps) {
  const [isExpanded, setIsExpanded] = useState(
    defaultExpanded || 
    value.stockLimitType != null ||
    isDigitalType // 디지털 타입이면 항상 펼침
  )

  const hasSettings = value.stockLimitType != null

  const updateValue = (partial: Partial<StockLimitValues>) => {
    // 디지털 타입이면 설정 변경 불가
    if (isDigitalType) return
    onChange({ ...value, ...partial })
  }

  const handleLimitTypeChange = (type: StockLimitType) => {
    // 디지털 타입이면 설정 변경 불가
    if (isDigitalType) return
    
    if (type === null) {
      // 무제한 선택 시 수량도 초기화
      updateValue({ stockLimitType: null, stockLimit: null })
    } else {
      updateValue({ 
        stockLimitType: type, 
        stockLimit: value.stockLimit ?? 10 // 기본값 10
      })
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
      {/* 토글 버튼 */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-purple-600 transition-colors"
      >
        <Package className="w-4 h-4" />
        수량 제한 설정
        <span className={cn(
          "transform transition-transform text-xs",
          isExpanded ? "rotate-180" : ""
        )}>▼</span>
        {hasSettings && (
          <span className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 rounded">
            설정됨
          </span>
        )}
      </button>
      
      {/* 설정 패널 */}
      {isExpanded && (
        <div className="p-4 bg-gray-50 rounded-xl space-y-4 border border-gray-200">
          {/* 디지털 타입 안내 메시지 */}
          {isDigitalType && (
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-medium text-purple-700">
                  디지털 상품은 유저당 1회만 당첨됩니다
                </span>
              </div>
              <p className="text-xs text-purple-600 mt-1 ml-6">
                동일한 디지털 콘텐츠는 중복으로 받을 수 없습니다.
              </p>
            </div>
          )}

          <div>
            <p className="text-sm font-medium text-gray-700 mb-3">수량 제한 방식</p>
            
            {/* 라디오 옵션들 */}
            <div className={cn("space-y-3", isDigitalType && "opacity-50 pointer-events-none")}>
              {/* 무제한 */}
              <RadioOption
                checked={value.stockLimitType === null}
                onChange={() => handleLimitTypeChange(null)}
                icon={<Infinity className="w-4 h-4" />}
                label="무제한"
                description="수량 제한 없이 계속 당첨 가능"
                disabled={isDigitalType}
              />

              {/* 전체 수량 제한 */}
              <RadioOption
                checked={value.stockLimitType === 'global'}
                onChange={() => handleLimitTypeChange('global')}
                icon={<Package className="w-4 h-4" />}
                label="전체 수량 제한"
                description="모든 유저 합산 N개까지만 당첨"
                disabled={isDigitalType}
              >
                {value.stockLimitType === 'global' && !isDigitalType && (
                  <div className="mt-2 ml-6 flex items-center gap-2">
                    <Input
                      type="number"
                      value={value.stockLimit ?? ''}
                      onChange={(e) => {
                        const val = e.target.value
                        updateValue({ stockLimit: val === '' ? null : parseInt(val, 10) })
                      }}
                      min={1}
                      placeholder="10"
                      inputSize="sm"
                      className="w-20"
                    />
                    <span className="text-xs text-gray-500">개</span>
                  </div>
                )}
              </RadioOption>

              {/* 유저별 수량 제한 */}
              <RadioOption
                checked={value.stockLimitType === 'per_user'}
                onChange={() => handleLimitTypeChange('per_user')}
                icon={<Users className="w-4 h-4" />}
                label="유저별 수량 제한"
                description={isDigitalType ? "디지털 상품은 유저당 1회로 고정됩니다" : "각 유저당 N개까지만 당첨"}
                disabled={isDigitalType}
              >
                {value.stockLimitType === 'per_user' && !isDigitalType && (
                  <div className="mt-2 ml-6 flex items-center gap-2">
                    <Input
                      type="number"
                      value={value.stockLimit ?? ''}
                      onChange={(e) => {
                        const val = e.target.value
                        updateValue({ stockLimit: val === '' ? null : parseInt(val, 10) })
                      }}
                      min={1}
                      placeholder="1"
                      inputSize="sm"
                      className="w-20"
                    />
                    <span className="text-xs text-gray-500">개 (유저당)</span>
                  </div>
                )}
              </RadioOption>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================
// 내부 서브 컴포넌트
// ============================================================

interface RadioOptionProps {
  checked: boolean
  onChange: () => void
  icon: React.ReactNode
  label: string
  description: string
  children?: React.ReactNode
  disabled?: boolean
}

function RadioOption({ checked, onChange, icon, label, description, children, disabled = false }: RadioOptionProps) {
  return (
    <div>
      <label className={cn(
        "flex items-start gap-3",
        disabled ? "cursor-not-allowed" : "cursor-pointer"
      )}>
        <input
          type="radio"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="mt-1 w-4 h-4 border-gray-300 text-purple-600 focus:ring-purple-500 disabled:opacity-50"
        />
        <div className="flex items-start gap-2 flex-1">
          <div className="mt-0.5 text-gray-500">{icon}</div>
          <div className="flex-1">
            <span className="text-sm font-medium text-gray-700">{label}</span>
            <p className="text-xs text-gray-500">{description}</p>
            {children}
          </div>
        </div>
      </label>
    </div>
  )
}
