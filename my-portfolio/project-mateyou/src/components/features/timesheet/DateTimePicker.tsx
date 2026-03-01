import { Calendar as CalendarIcon, ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import Calendar from 'react-calendar'
import 'react-calendar/dist/Calendar.css'

interface DateTimePickerProps {
  value: string // 'YYYY-MM-DDTHH:mm' 형식
  onChange: (value: string) => void
  label?: string
  required?: boolean
  placeholder?: string
  className?: string
  disabled?: boolean
}

/**
 * 날짜 + 시간 선택 컴포넌트
 * - 날짜: react-calendar
 * - 시간: 시/분 직접 입력
 */
export function DateTimePicker({
  value,
  onChange,
  label,
  required,
  placeholder = '날짜와 시간을 선택하세요',
  className = '',
  disabled = false,
}: DateTimePickerProps) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const calendarRef = useRef<HTMLDivElement>(null)
  
  // 로컬 입력 상태 (입력 중에는 이 값을 표시)
  const [localHour, setLocalHour] = useState('')
  const [localMinute, setLocalMinute] = useState('')
  const [isHourFocused, setIsHourFocused] = useState(false)
  const [isMinuteFocused, setIsMinuteFocused] = useState(false)

  // value에서 날짜 문자열, 시, 분 추출
  const parseValue = () => {
    if (!value) return { dateStr: '', date: null, hour: '', minute: '' }
    
    const [datePart, timePart] = value.split('T')
    const date = datePart ? new Date(datePart + 'T00:00:00') : null
    const [hour, minute] = timePart ? timePart.split(':') : ['', '']
    
    return { dateStr: datePart || '', date, hour: hour || '', minute: minute || '' }
  }

  const { dateStr, date, hour, minute } = parseValue()
  
  // value가 변경되면 로컬 상태 동기화 (포커스 안된 경우에만)
  useEffect(() => {
    if (!isHourFocused) {
      setLocalHour(hour)
    }
  }, [hour, isHourFocused])
  
  useEffect(() => {
    if (!isMinuteFocused) {
      setLocalMinute(minute)
    }
  }, [minute, isMinuteFocused])
  
  // 로컬 날짜를 YYYY-MM-DD 형식으로 변환 (UTC 변환 없이)
  const formatDateToString = (d: Date) => {
    const year = d.getFullYear()
    const month = (d.getMonth() + 1).toString().padStart(2, '0')
    const day = d.getDate().toString().padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // 날짜 변경
  const handleDateChange = (newDate: Date) => {
    const newDateStr = formatDateToString(newDate)
    const timeStr = hour && minute ? `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}` : '00:00'
    onChange(`${newDateStr}T${timeStr}`)
    setIsCalendarOpen(false)
  }

  // 시간 입력 변경 (로컬 상태만 업데이트)
  const handleHourInput = (newHour: string) => {
    // 숫자만 허용
    const numericValue = newHour.replace(/\D/g, '').slice(0, 2)
    setLocalHour(numericValue)
  }

  // 시간 blur 시 최종 값 적용
  const handleHourBlur = () => {
    setIsHourFocused(false)
    
    if (!dateStr) return
    
    let hourNum = parseInt(localHour, 10)
    
    // 범위 제한 (0-23)
    if (isNaN(hourNum) || localHour === '') {
      hourNum = 0
    } else if (hourNum > 23) {
      hourNum = 23
    }
    
    const hourStr = hourNum.toString().padStart(2, '0')
    const minuteStr = minute || '00'
    
    setLocalHour(hourStr)
    onChange(`${dateStr}T${hourStr}:${minuteStr}`)
  }

  // 분 입력 변경 (로컬 상태만 업데이트)
  const handleMinuteInput = (newMinute: string) => {
    // 숫자만 허용
    const numericValue = newMinute.replace(/\D/g, '').slice(0, 2)
    setLocalMinute(numericValue)
  }

  // 분 blur 시 최종 값 적용
  const handleMinuteBlur = () => {
    setIsMinuteFocused(false)
    
    if (!dateStr) return
    
    let minuteNum = parseInt(localMinute, 10)
    
    // 범위 제한 (0-59)
    if (isNaN(minuteNum) || localMinute === '') {
      minuteNum = 0
    } else if (minuteNum > 59) {
      minuteNum = 59
    }
    
    const minuteStr = minuteNum.toString().padStart(2, '0')
    const hourStr = hour || '00'
    
    setLocalMinute(minuteStr)
    onChange(`${dateStr}T${hourStr}:${minuteStr}`)
  }

  // 외부 클릭 감지
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (calendarRef.current && !calendarRef.current.contains(event.target as Node)) {
        setIsCalendarOpen(false)
      }
    }

    if (isCalendarOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isCalendarOpen])

  // 날짜 포맷팅
  const formatDate = (d: Date | null) => {
    if (!d) return ''
    const year = d.getFullYear()
    const month = d.getMonth() + 1
    const day = d.getDate()
    return `${year}년 ${month}월 ${day}일`
  }

  return (
    <div className={className}>
      {label && (
        <label className="block text-xs font-medium text-slate-600 mb-1.5">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}
      
      <div className="space-y-2">
        {/* 날짜 선택 버튼 */}
        <div ref={calendarRef} className="relative">
          <button
            type="button"
            onClick={() => !disabled && setIsCalendarOpen(!isCalendarOpen)}
            disabled={disabled}
            className={`w-full px-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-200 focus:border-gray-300 text-left flex items-center justify-between hover:border-gray-300 transition-all ${disabled ? 'opacity-50 cursor-not-allowed bg-gray-50' : ''}`}
          >
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className={date ? 'text-gray-900' : 'text-gray-400'}>
                {date ? formatDate(date) : placeholder}
              </span>
            </div>
            <ChevronDown className={`w-4 h-4 text-gray-300 transition-transform ${isCalendarOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* 캘린더 드롭다운 */}
          {isCalendarOpen && (
            <div className="absolute top-full left-0 mt-2 z-50 bg-white rounded-xl border border-slate-200 shadow-xl p-3">
              <Calendar
                onChange={(value) => handleDateChange(value as Date)}
                value={date}
                formatDay={(locale, d) => d.getDate().toString()}
                formatShortWeekday={(locale, d) => {
                  const weekdays = ['일', '월', '화', '수', '목', '금', '토']
                  return weekdays[d.getDay()]
                }}
                formatMonthYear={(locale, d) => {
                  return `${d.getFullYear()}년 ${d.getMonth() + 1}월`
                }}
                className="!border-0 !w-full"
                locale="ko-KR"
              />
              
              {/* 커스텀 스타일 */}
              <style>{`
                .react-calendar {
                  width: 280px;
                  border: none;
                  font-family: inherit;
                }
                .react-calendar__navigation {
                  display: flex;
                  height: 40px;
                  margin-bottom: 0.5em;
                }
                .react-calendar__navigation button {
                  min-width: 36px;
                  background: none;
                  font-size: 14px;
                  font-weight: 600;
                  color: #1e293b;
                }
                .react-calendar__navigation button:enabled:hover,
                .react-calendar__navigation button:enabled:focus {
                  background-color: #f1f5f9;
                  border-radius: 6px;
                }
                .react-calendar__navigation button[disabled] {
                  background-color: transparent;
                  color: #cbd5e1;
                }
                .react-calendar__month-view__weekdays {
                  text-align: center;
                  font-weight: 600;
                  font-size: 0.7em;
                  color: #64748b;
                  margin-bottom: 0.25em;
                }
                .react-calendar__month-view__weekdays__weekday {
                  padding: 0.4em;
                }
                .react-calendar__month-view__weekdays__weekday abbr {
                  text-decoration: none;
                }
                .react-calendar__month-view__days {
                  display: grid !important;
                  grid-template-columns: repeat(7, 1fr);
                }
                .react-calendar__tile {
                  max-width: 100%;
                  padding: 0.6em 0.4em;
                  background: none;
                  text-align: center;
                  line-height: 14px;
                  font-size: 0.8em;
                  color: #1e293b;
                  border-radius: 6px;
                  transition: all 0.15s;
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
                  background: #6366f1 !important;
                  color: white !important;
                  font-weight: 600;
                }
                .react-calendar__tile--active:enabled:hover,
                .react-calendar__tile--active:enabled:focus {
                  background: #4f46e5 !important;
                }
              `}</style>
            </div>
          )}
        </div>

        {/* 시간 입력 */}
        <div className="flex items-center gap-1.5 bg-gray-50 p-1.5 rounded-lg border border-gray-100">
          <div className="flex items-center bg-white px-2 py-1.5 rounded-md border border-gray-100 flex-1">
            <input
              type="text"
              inputMode="numeric"
              value={isHourFocused ? localHour : hour}
              onChange={(e) => handleHourInput(e.target.value)}
              onFocus={() => {
                setIsHourFocused(true)
                setLocalHour(hour)
              }}
              onBlur={handleHourBlur}
              placeholder="00"
              maxLength={2}
              disabled={disabled || !date}
              className="w-8 text-center text-sm text-gray-900 focus:outline-none disabled:opacity-50 bg-transparent px-1"
            />
            <span className="text-[11px] text-gray-400">시</span>
          </div>
          
          <span className="text-gray-300 text-sm">:</span>
          
          <div className="flex items-center bg-white px-2 py-1.5 rounded-md border border-gray-100 flex-1">
            <input
              type="text"
              inputMode="numeric"
              value={isMinuteFocused ? localMinute : minute}
              onChange={(e) => handleMinuteInput(e.target.value)}
              onFocus={() => {
                setIsMinuteFocused(true)
                setLocalMinute(minute)
              }}
              onBlur={handleMinuteBlur}
              placeholder="00"
              maxLength={2}
              disabled={disabled || !date}
              className="w-8 text-center text-sm text-gray-900 focus:outline-none disabled:opacity-50 bg-transparent px-1"
            />
            <span className="text-[11px] text-gray-400">분</span>
          </div>
        </div>
      </div>
    </div>
  )
}
