import { useState, useRef, useEffect } from 'react'
import Calendar from 'react-calendar'
import 'react-calendar/dist/Calendar.css'
import { Calendar as CalendarIcon, X } from 'lucide-react'

type ValuePiece = Date | null
type Value = ValuePiece | [ValuePiece, ValuePiece]

interface DateRangeCalendarProps {
  startDate: string
  endDate: string
  onChange: (startDate: string, endDate: string) => void
  className?: string
}

export function DateRangeCalendar({
  startDate,
  endDate,
  onChange,
  className = '',
}: DateRangeCalendarProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [dateRange, setDateRange] = useState<Value>(() => {
    const start = startDate ? new Date(startDate + 'T00:00:00') : null
    const end = endDate ? new Date(endDate + 'T00:00:00') : null
    if (start && end) {
      return [start, end]
    }
    return null
  })
  const calendarRef = useRef<HTMLDivElement>(null)

  // props 변경 시 dateRange 동기화
  useEffect(() => {
    const start = startDate ? new Date(startDate + 'T00:00:00') : null
    const end = endDate ? new Date(endDate + 'T00:00:00') : null
    if (start && end) {
      setDateRange([start, end])
    } else if (!startDate && !endDate) {
      setDateRange(null)
    }
  }, [startDate, endDate])

  // 외부 클릭 감지
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // 로컬 시간대 기준으로 날짜를 YYYY-MM-DD 형식으로 포맷팅
  const formatDateToLocal = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // 날짜 범위 변경 처리
  const handleDateChange = (value: Value) => {
    setDateRange(value)
    
    if (Array.isArray(value) && value[0] && value[1]) {
      // 두 날짜가 모두 선택된 경우
      const start = formatDateToLocal(value[0])
      const end = formatDateToLocal(value[1])
      onChange(start, end)
      setIsOpen(false)
    } else if (Array.isArray(value) && value[0] && !value[1]) {
      // 시작일만 선택된 경우 (range 선택 중)
      // onChange는 호출하지 않고 state만 업데이트
    } else if (!value) {
      // 선택 해제
      onChange('', '')
    }
  }

  // 날짜 포맷팅
  const formatDate = (dateString: string) => {
    if (!dateString) return ''
    const date = new Date(dateString + 'T00:00:00')
    const month = date.getMonth() + 1
    const day = date.getDate()
    return `${month}월 ${day}일`
  }

  // 날짜 범위 표시 텍스트
  const displayText = startDate && endDate
    ? `${formatDate(startDate)} ~ ${formatDate(endDate)}`
    : '날짜 범위를 선택하세요'

  // 초기화
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    setDateRange(null)
    onChange('', '')
  }

  return (
    <div ref={calendarRef} className={`relative ${className}`}>
      {/* 입력 필드 */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-left flex items-center justify-between hover:border-slate-300 transition-colors"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <CalendarIcon className="w-4 h-4 text-slate-500 flex-shrink-0" />
          <span className={`text-sm truncate ${startDate && endDate ? 'text-slate-900' : 'text-slate-500'}`}>
            {displayText}
          </span>
        </div>
        {startDate && endDate && (
          <button
            type="button"
            onClick={handleClear}
            className="ml-2 p-1 hover:bg-slate-200 rounded transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        )}
      </button>

      {/* 달력 드롭다운 */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 z-50 bg-white rounded-2xl border border-slate-200 shadow-xl p-4 min-w-[320px]">
          <Calendar
            onChange={handleDateChange}
            value={dateRange}
            selectRange={true}
            formatDay={(locale, date) => date.getDate().toString()}
            formatShortWeekday={(locale, date) => {
              const weekdays = ['일', '월', '화', '수', '목', '금', '토']
              return weekdays[date.getDay()]
            }}
            formatMonthYear={(locale, date) => {
              return `${date.getFullYear()}년 ${date.getMonth() + 1}월`
            }}
            className="!border-0 !w-full"
            locale="ko-KR"
            tileClassName={({ date, view }) => {
              if (view === 'month') {
                const dateStr = formatDateToLocal(date)
                
                // 선택 중인 range 확인
                let isInSelectingRange = false
                let isSelectingStart = false
                if (Array.isArray(dateRange) && dateRange[0] && !dateRange[1]) {
                  const selectingStart = formatDateToLocal(dateRange[0])
                  isSelectingStart = dateStr === selectingStart
                  // 선택 중인 시작일 이후의 날짜들
                  if (dateStr > selectingStart) {
                    isInSelectingRange = true
                  }
                }
                
                // 완료된 range 확인
                const isInRange = startDate && endDate && dateStr >= startDate && dateStr <= endDate
                const isStart = dateStr === startDate
                const isEnd = dateStr === endDate
                
                if (isStart || isEnd || isSelectingStart) {
                  return 'bg-indigo-500 text-white rounded-lg font-semibold'
                }
                if (isInRange || isInSelectingRange) {
                  return 'bg-indigo-100 text-indigo-700'
                }
              }
              return ''
            }}
          />
          
          {/* 커스텀 스타일 */}
          <style>{`
            .react-calendar {
              width: 100%;
              border: none;
              font-family: inherit;
            }
            .react-calendar__navigation {
              display: flex;
              height: 44px;
              margin-bottom: 1em;
            }
            .react-calendar__navigation button {
              min-width: 44px;
              background: none;
              font-size: 16px;
              font-weight: 600;
              color: #1e293b;
            }
            .react-calendar__navigation button:enabled:hover,
            .react-calendar__navigation button:enabled:focus {
              background-color: #f1f5f9;
              border-radius: 8px;
            }
            .react-calendar__navigation button[disabled] {
              background-color: transparent;
              color: #cbd5e1;
            }
            .react-calendar__month-view__weekdays {
              text-align: center;
              text-transform: uppercase;
              font-weight: 600;
              font-size: 0.75em;
              color: #64748b;
              margin-bottom: 0.5em;
            }
            .react-calendar__month-view__weekdays__weekday {
              padding: 0.5em;
            }
            .react-calendar__month-view__days {
              display: grid !important;
              grid-template-columns: repeat(7, 1fr);
            }
            .react-calendar__tile {
              max-width: 100%;
              padding: 0.75em 0.5em;
              background: none;
              text-align: center;
              line-height: 16px;
              font-size: 0.875em;
              color: #1e293b;
              border-radius: 8px;
              transition: all 0.2s;
            }
            .react-calendar__tile:enabled:hover,
            .react-calendar__tile:enabled:focus {
              background-color: #f1f5f9;
              color: #1e293b;
            }
            .react-calendar__tile--now {
              background: #fef3c7;
              color: #92400e;
              font-weight: 600;
            }
            .react-calendar__tile--now:enabled:hover,
            .react-calendar__tile--now:enabled:focus {
              background: #fde68a;
            }
            .react-calendar__tile--active {
              background: #6366f1;
              color: white;
              font-weight: 600;
            }
            .react-calendar__tile--active:enabled:hover,
            .react-calendar__tile--active:enabled:focus {
              background: #4f46e5;
            }
            .react-calendar__tile--rangeStart,
            .react-calendar__tile--rangeEnd {
              background: #6366f1;
              color: white;
              font-weight: 600;
            }
            .react-calendar__tile--range {
              background: #e0e7ff;
              color: #4338ca;
            }
            .react-calendar__tile--rangeStart {
              border-top-left-radius: 8px;
              border-bottom-left-radius: 8px;
            }
            .react-calendar__tile--rangeEnd {
              border-top-right-radius: 8px;
              border-bottom-right-radius: 8px;
            }
            .react-calendar__tile--rangeBothEnds {
              border-radius: 8px;
            }
            .react-calendar__tile:disabled {
              background-color: transparent !important;
            }
          `}</style>
        </div>
      )}
    </div>
  )
}

