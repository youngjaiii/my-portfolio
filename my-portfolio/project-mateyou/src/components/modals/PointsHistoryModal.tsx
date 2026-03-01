import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { Button, Flex, Typography } from '@/components'
import { useAuth } from '@/hooks/useAuth'
import { useMemberPoints } from '@/hooks/useMemberPoints'
import type { Database } from '@/types/database'

type MemberPointsLog = Database['public']['Tables']['member_points_logs']['Row']

interface PointsHistoryModalProps {
  isOpen: boolean
  onClose: () => void
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getTypeLabel = (type: string, description: string) => {
  switch (type) {
    case 'earn':
      return {
        label: '충전',
        color: 'text-green-600',
        bgColor: 'bg-green-100',
        icon: '💳',
      }
    case 'spend':
      if (description.includes('의뢰')) {
        return {
          label: '파트너 의뢰',
          color: 'text-blue-600',
          bgColor: 'bg-blue-100',
          icon: '🎮',
        }
      }
      if (description.includes('선물') || description.includes('이용권')) {
        return {
          label: '선물하기',
          color: 'text-pink-600',
          bgColor: 'bg-pink-100',
          icon: '🎁',
        }
      }
      if (description.includes('이벤트') || description.includes('티켓')) {
        return {
          label: '이벤트',
          color: 'text-orange-600',
          bgColor: 'bg-orange-100',
          icon: '🎊',
        }
      }
      if (description.includes('아이템') || description.includes('프리미엄')) {
        return {
          label: '아이템',
          color: 'text-purple-600',
          bgColor: 'bg-purple-100',
          icon: '⭐',
        }
      }
      return {
        label: '사용',
        color: 'text-red-600',
        bgColor: 'bg-red-100',
        icon: '💰',
      }
    case 'withdraw':
      return {
        label: '출금',
        color: 'text-blue-600',
        bgColor: 'bg-blue-100',
        icon: '💸',
      }
    default:
      return {
        label: type,
        color: 'text-gray-600',
        bgColor: 'bg-gray-100',
        icon: '📝',
      }
  }
}

interface PointsHistoryListProps {
  pointsHistory: MemberPointsLog[]
  isLoading: boolean
  title?: string
  showLimitNotice?: boolean
}

export function PointsHistoryList({
  pointsHistory,
  isLoading,
  title = '최근 내역',
  showLimitNotice = true,
}: PointsHistoryListProps) {
  return (
    <div>
      <Typography variant="h6" className="mb-3">
        {title}
      </Typography>
      {isLoading ? (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        </div>
      ) : pointsHistory.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <div className="mb-4">
            <svg className="w-12 h-12 text-gray-300 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 5H7a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
          </div>
          <Typography variant="body1">포인트 내역이 없습니다</Typography>
        </div>
      ) : (
        <div className="space-y-2">
          {pointsHistory.map((log) => {
            const descriptionText = log.description || ''
            const typeInfo = getTypeLabel(log.type, descriptionText)
            const isPositive = log.type === 'earn'

            return (
              <div
                key={log.id}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
              >
                <Flex justify="between" align="start" className="mb-2">
                  <div className="flex-1">
                    <Flex align="center" gap={2} className="mb-2">
                      <span className="text-lg">{typeInfo.icon}</span>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${typeInfo.bgColor} ${typeInfo.color}`}
                      >
                        {typeInfo.label}
                      </span>
                      <Typography variant="caption" color="text-secondary">
                        {formatDate(log.created_at)}
                      </Typography>
                    </Flex>
                    {descriptionText ? (
                      <Typography variant="body2" className="text-gray-700 leading-relaxed">
                        {descriptionText}
                      </Typography>
                    ) : null}
                  </div>
                  <div className="text-right ml-4">
                    <Typography
                      variant="h6"
                      className={`font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {isPositive ? '+' : '-'}
                      {Math.abs(log.amount).toLocaleString()}P
                    </Typography>
                    {log.type === 'spend' && (
                      <Typography variant="caption" className="block text-gray-400 mt-1">
                        차감됨
                      </Typography>
                    )}
                  </div>
                </Flex>
              </div>
            )
          })}
        </div>
      )}

      {showLimitNotice && pointsHistory.length >= 50 && (
        <div className="text-center py-2">
          <Typography variant="caption" color="text-secondary">
            최근 50개 내역만 표시됩니다
          </Typography>
        </div>
      )}
    </div>
  )
}

export function PointsHistoryModal({
  isOpen,
  onClose,
}: PointsHistoryModalProps) {
  const { user } = useAuth()
  const today = useMemo(() => new Date(), [])
  const initialEndDate = useMemo(
    () => today.toISOString().slice(0, 10),
    [today],
  )
  const initialStartDate = useMemo(() => {
    const date = new Date(today)
    date.setDate(date.getDate() - 29)
    return date.toISOString().slice(0, 10)
  }, [today])
  const [startDate, setStartDate] = useState(initialStartDate)
  const [endDate, setEndDate] = useState(initialEndDate)
  const startInputRef = useRef<HTMLInputElement | null>(null)
  const endInputRef = useRef<HTMLInputElement | null>(null)
  const { pointsHistory, isLoading } = useMemberPoints(user?.id || '', {
    limit: 50,
    startAt: startDate,
    endAt: endDate,
  })
  const [mounted, setMounted] = useState(isOpen)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>

    if (isOpen) {
      setMounted(true)
      requestAnimationFrame(() => setVisible(true))
      document.body.style.overflow = 'hidden'
    } else {
      setVisible(false)
      timeoutId = setTimeout(() => setMounted(false), 250)
      document.body.style.overflow = 'unset'
    }

    return () => {
      clearTimeout(timeoutId)
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!mounted) {
    return null
  }

  const openDatePicker = (ref: { current: HTMLInputElement | null }) => {
    if (!ref.current) return
    const input = ref.current as HTMLInputElement & { showPicker?: () => void }
    if (typeof input.showPicker === 'function') {
      input.showPicker()
      return
    }
    input.click()
  }

  const handleStartDateChange = (value: string) => {
    if (!value) return
    setStartDate(value)
    if (endDate && value > endDate) {
      setEndDate(value)
    }
  }

  const handleEndDateChange = (value: string) => {
    if (!value) return
    setEndDate(value)
    if (startDate && value < startDate) {
      setStartDate(value)
    }
  }

  const sheetContent = (
    <div className="fixed inset-0 z-[9999] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        className={`relative mx-auto w-full max-w-3xl rounded-t-[16px] bg-white shadow-2xl transition-transform duration-300 ${
          visible ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{ height: '95vh' }}
        role="dialog"
        aria-modal="true"
      >
        <div className="py-4 text-center relative">
          <Typography variant="h5" className="font-semibold text-[#110f1a]">
            포인트 충전
          </Typography>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-800"
            aria-label="닫기"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          <div className="flex flex-col justify-center items-center p-4 rounded-lg">
            <Typography variant="body1" className="text-blue-800 text-medium">
              현재 보유 포인트
            </Typography>
            <Typography variant="h4" className="font-bold text-blue-600">
              {user?.total_points?.toLocaleString() || '0'}P
            </Typography>
          </div>

          <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-3">
            <Typography variant="body2" className="font-semibold text-[#110f1a]">
              조회 기간
            </Typography>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-[#FE3A8F] text-[#FE3A8F] hover:bg-[#FE3A8F]/10"
                  onClick={() => openDatePicker(startInputRef)}
                >
                  시작일 설정
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-[#FE3A8F] text-[#FE3A8F] hover:bg-[#FE3A8F]/10"
                  onClick={() => openDatePicker(endInputRef)}
                >
                  종료일 설정
                </Button>
              </div>
              <Typography variant="caption" color="text-secondary" className="whitespace-nowrap">
                {startDate} ~ {endDate}
              </Typography>
            </div>
            <input
              ref={startInputRef}
              type="date"
              value={startDate}
              max={endDate}
              onChange={(event) => handleStartDateChange(event.target.value)}
              className="hidden"
            />
            <input
              ref={endInputRef}
              type="date"
              value={endDate}
              min={startDate}
              max={initialEndDate}
              onChange={(event) => handleEndDateChange(event.target.value)}
              className="hidden"
            />
          </div>

          <PointsHistoryList pointsHistory={pointsHistory} isLoading={isLoading} />
        </div>
      </div>
    </div>
  )

  return createPortal(sheetContent, document.body)
}
