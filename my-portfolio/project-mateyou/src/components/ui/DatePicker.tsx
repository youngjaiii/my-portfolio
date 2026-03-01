import * as React from 'react'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import { ko } from 'date-fns/locale'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'

interface DatePickerProps {
  value?: string
  onChange: (date: string) => void
  placeholder?: string
  className?: string
  position?: 'top' | 'bottom'
}

export function DatePicker({ value, onChange, placeholder = '날짜 선택', className, position = 'bottom' }: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [currentMonth, setCurrentMonth] = React.useState(() => {
    return value ? new Date(value) : new Date()
  })
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const calendarRef = React.useRef<HTMLDivElement>(null)
  const [calendarPos, setCalendarPos] = React.useState({ top: 0, left: 0 })

  const selectedDate = value ? new Date(value) : undefined

  const updatePosition = React.useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const calendarHeight = 320
    const spaceBelow = window.innerHeight - rect.bottom
    const openAbove = position === 'top' || (position === 'bottom' && spaceBelow < calendarHeight && rect.top > calendarHeight)

    setCalendarPos({
      top: openAbove ? rect.top - calendarHeight - 4 : rect.bottom + 4,
      left: rect.left,
    })
  }, [position])

  React.useEffect(() => {
    if (!open) return

    updatePosition()

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target)) return
      if (calendarRef.current?.contains(target)) return
      setOpen(false)
    }

    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [open, updatePosition])

  const handleSelect = (date: Date) => {
    onChange(format(date, 'yyyy-MM-dd'))
    setOpen(false)
  }

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startDayOfWeek = firstDay.getDay()

    const days: (Date | null)[] = []
    for (let i = 0; i < startDayOfWeek; i++) days.push(null)
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i))
    return days
  }

  const days = getDaysInMonth(currentMonth)
  const weekDays = ['일', '월', '화', '수', '목', '금', '토']

  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))

  const isToday = (date: Date) => date.toDateString() === new Date().toDateString()
  const isSelected = (date: Date) => selectedDate ? date.toDateString() === selectedDate.toDateString() : false

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#FE3A8F] focus:border-transparent bg-white ${className}`}
      >
        <span className={selectedDate ? 'text-gray-900' : 'text-gray-400'}>
          {selectedDate ? format(selectedDate, 'yyyy년 MM월 dd일', { locale: ko }) : placeholder}
        </span>
        <CalendarIcon className="w-4 h-4 text-gray-400" />
      </button>

      {open && createPortal(
        <div
          ref={calendarRef}
          style={{ position: 'fixed', top: calendarPos.top, left: calendarPos.left, zIndex: 99999 }}
          className="bg-white rounded-lg shadow-lg border border-gray-200 p-3 w-[280px]"
        >
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={prevMonth} className="p-1 rounded hover:bg-gray-100">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-sm font-medium">
              {format(currentMonth, 'yyyy년 MM월', { locale: ko })}
            </span>
            <button type="button" onClick={nextMonth} className="p-1 rounded hover:bg-gray-100">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {weekDays.map((day) => (
              <div key={day} className="text-center text-xs font-medium text-gray-500 py-1">{day}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((date, index) => (
              <div key={index} className="aspect-square">
                {date ? (
                  <button
                    type="button"
                    onClick={() => handleSelect(date)}
                    className={`w-full h-full rounded-md text-sm flex items-center justify-center transition-colors
                      ${isSelected(date)
                        ? 'bg-[#FE3A8F] text-white'
                        : isToday(date)
                          ? 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                          : 'text-gray-700 hover:bg-gray-100'
                      }
                    `}
                  >
                    {date.getDate()}
                  </button>
                ) : (
                  <div className="w-full h-full" />
                )}
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
