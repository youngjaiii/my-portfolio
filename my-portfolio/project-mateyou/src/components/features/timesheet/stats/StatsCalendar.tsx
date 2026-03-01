import { ChevronLeft, ChevronRight, Clock, Coffee } from 'lucide-react'
import { useMemo } from 'react'

// UTC ISO 문자열을 한국시간 HH:MM으로 변환
function toKST(isoString: string | null | undefined): string {
  if (!isoString) return '?'
  try {
    const date = new Date(isoString)
    return date.toLocaleTimeString('ko-KR', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Seoul'
    })
  } catch {
    return isoString.slice(11, 16)
  }
}

interface StatsCalendarProps {
  partnerId: string
  records: any[]
  partnerName: string
  onEdit: (record: any, partnerName: string) => void
  currentMonth: { year: number; month: number }
  onMonthChange: (direction: 'prev' | 'next') => void
}

export function StatsCalendar({
  records,
  partnerName,
  onEdit,
  currentMonth,
  onMonthChange,
}: StatsCalendarProps) {
  const { year, month } = currentMonth

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const days = []
    
    const startDayOfWeek = firstDay.getDay()
    for (let i = 0; i < startDayOfWeek; i++) {
       days.push(null)
    }
    
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i))
    }
    return days
  }, [year, month])

  const recordsByDate = useMemo(() => {
    const map = new Map<string, any[]>()
    records.forEach(r => {
      const dateStr = r.date
      if (!map.has(dateStr)) map.set(dateStr, [])
      map.get(dateStr)?.push(r)
    })
    return map
  }, [records])

  const formatDay = (date: Date) => {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* 헤더 */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <h4 className="text-sm font-bold text-gray-800">
          {year}년 {month + 1}월
        </h4>
        <div className="flex gap-1">
          <button 
            onClick={() => onMonthChange('prev')} 
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-200 active:bg-gray-300 transition-colors text-gray-500 touch-manipulation"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button 
            onClick={() => onMonthChange('next')} 
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-200 active:bg-gray-300 transition-colors text-gray-500 touch-manipulation"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/50">
        {['일', '월', '화', '수', '목', '금', '토'].map((d, idx) => (
          <div 
            key={d} 
            className={`py-1.5 sm:py-2 text-center text-[10px] sm:text-xs font-semibold ${
              idx === 0 ? 'text-rose-500' : idx === 6 ? 'text-blue-500' : 'text-gray-500'
            }`}
          >
            {d}
          </div>
        ))}
      </div>
      
      {/* 캘린더 그리드 */}
      <div className="grid grid-cols-7">
        {calendarDays.map((date, i) => {
          if (!date) {
            return (
              <div 
                key={`empty-${i}`} 
                className="min-h-[50px] sm:min-h-[60px] bg-gray-50/30 border-r border-b border-gray-100 last:border-r-0" 
              />
            )
          }
          
          const dateStr = formatDay(date)
          const dayRecords = recordsByDate.get(dateStr) || []
          const isToday = formatDay(new Date()) === dateStr
          const isSunday = date.getDay() === 0
          const isSaturday = date.getDay() === 6
          const hasRecords = dayRecords.length > 0

          // 총 근무시간 계산
          const totalWorkMinutes = dayRecords.reduce((sum, r) => {
            if (r.work_hours) return sum + r.work_hours * 60
            if (r.started_at && r.ended_at) {
              const start = new Date(r.started_at)
              const end = new Date(r.ended_at)
              return sum + (end.getTime() - start.getTime()) / 60000 - (r.total_break_minutes || 0)
            }
            return sum
          }, 0)
          
          const totalBreakMinutes = dayRecords.reduce((sum, r) => sum + (r.total_break_minutes || 0), 0)

          return (
            <div 
              key={dateStr} 
              className={`min-h-[50px] sm:min-h-[60px] p-0.5 sm:p-1.5 border-r border-b border-gray-100 last:border-r-0 overflow-hidden ${
                isToday ? 'bg-[#FE3A8F]/5' : hasRecords ? 'bg-white' : 'bg-gray-50/30'
              }`}
            >
              {/* 날짜 */}
              <div className="flex items-center justify-between mb-0.5 sm:mb-1">
                <span 
                  className={`text-[10px] sm:text-xs font-semibold leading-none ${
                    isToday 
                      ? 'w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-[#FE3A8F] text-white flex items-center justify-center text-[9px] sm:text-[11px]' 
                      : isSunday 
                        ? 'text-rose-500' 
                        : isSaturday 
                          ? 'text-blue-500' 
                          : 'text-gray-700'
                  }`}
                >
                  {date.getDate()}
                </span>
              </div>
              
              {/* 기록 카드들 */}
              <div className="space-y-0.5 sm:space-y-1">
                {dayRecords.map((r) => (
                  <button
                    key={r.id} 
                    onClick={() => onEdit(r, partnerName)}
                    className="w-full text-left bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 rounded px-1 py-0.5 sm:px-1.5 sm:py-1 transition-colors border border-emerald-100 touch-manipulation overflow-hidden"
                  >
                    {/* 가게명 (모바일: 숨김, 데스크톱: 표시) */}
                    <div className="hidden sm:block text-[10px] font-semibold text-emerald-700 truncate mb-0.5">
                      {r.store_name}
                    </div>
                    {/* 시간 (모바일: 간소화) */}
                    <div className="flex items-center gap-0.5 sm:gap-1 text-[8px] sm:text-[9px] text-emerald-600 min-w-0">
                      <Clock className="w-2 h-2 sm:w-2.5 sm:h-2.5 flex-shrink-0" />
                      <span className="truncate min-w-0">
                        <span className="hidden sm:inline">{toKST(r.started_at)}</span>
                        <span className="sm:hidden">{toKST(r.started_at).slice(0, 5)}</span>
                        <span className="mx-0.5">-</span>
                        <span className="hidden sm:inline">{r.ended_at ? toKST(r.ended_at) : '진행중'}</span>
                        <span className="sm:hidden">{r.ended_at ? toKST(r.ended_at).slice(0, 5) : '진행중'}</span>
                      </span>
                    </div>
                    {/* 휴게 표시 (모바일: 숨김) */}
                    {r.total_break_minutes > 0 && (
                      <div className="hidden sm:flex items-center gap-0.5 text-[9px] text-amber-600 mt-0.5">
                        <Coffee className="w-2.5 h-2.5" />
                        <span>{r.total_break_minutes}분</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {/* 일일 요약 (기록이 있을 때만) */}
              {hasRecords && totalWorkMinutes > 0 && (
                <div className="hidden sm:flex items-center gap-1 mt-1 pt-1 border-t border-gray-100">
                  <span className="text-[9px] text-gray-500 font-medium">
                    {Math.floor(totalWorkMinutes / 60)}h{Math.round(totalWorkMinutes % 60)}m
                  </span>
                  {totalBreakMinutes > 0 && (
                    <span className="text-[9px] text-amber-500">
                      ({totalBreakMinutes}m 휴게)
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
