import { Typography } from '@/components'

export function ScheduleTimeSlotSelector({
  selectedDate,
  selectedTimeSlot,
  onSelect,
}: {
  selectedDate: Date
  selectedTimeSlot: string | null
  onSelect: (timeSlot: string) => void
}) {
  const now = new Date()
  const isToday = 
    selectedDate.getFullYear() === now.getFullYear() &&
    selectedDate.getMonth() === now.getMonth() &&
    selectedDate.getDate() === now.getDate()

  const allTimeSlots: Array<{ time: string; dateTime: Date }> = []
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const slotDateTime = new Date(selectedDate)
      slotDateTime.setHours(hour, minute, 0, 0)
      
      if (!isToday || slotDateTime > now) {
        const hours = hour.toString().padStart(2, '0')
        const minutes = minute.toString().padStart(2, '0')
        const timeStr = `${hours}:${minutes}`
        allTimeSlots.push({
          time: timeStr,
          dateTime: slotDateTime,
        })
      }
    }
  }

  const morningSlots = allTimeSlots.filter(slot => {
    const hour = parseInt(slot.time.split(':')[0])
    return hour < 12
  })
  const afternoonSlots = allTimeSlots.filter(slot => {
    const hour = parseInt(slot.time.split(':')[0])
    return hour >= 12
  })

  const formatTimeDisplay = (time: string) => {
    const [hours, minutes] = time.split(':')
    const hour = parseInt(hours)
    if (hour === 0) return `오전 12:${minutes}`
    if (hour < 12) return `오전 ${hour}:${minutes}`
    if (hour === 12) return `오후 12:${minutes}`
    return `오후 ${hour - 12}:${minutes}`
  }

  return (
    <div className="space-y-4">
      {morningSlots.length > 0 && (
        <div>
          <Typography variant="body2" className="font-medium text-gray-700 mb-2">
            오전
          </Typography>
          <div className="grid grid-cols-3 gap-2">
            {morningSlots.map((slot) => {
              const isSelected = selectedTimeSlot === slot.time
              return (
                <button
                  key={slot.time}
                  onClick={() => onSelect(slot.time)}
                  className={`px-4 py-2 rounded-lg border-2 transition-colors ${
                    isSelected
                      ? 'bg-[#FE3A8F] text-white border-[#FE3A8F]'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-[#FE3A8F] hover:text-[#FE3A8F]'
                  }`}
                >
                  <Typography variant="body2" className={`font-medium ${isSelected ? 'text-white' : 'text-gray-700'}`}>
                    {formatTimeDisplay(slot.time)}
                  </Typography>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {afternoonSlots.length > 0 && (
        <div>
          <Typography variant="body2" className="font-medium text-gray-700 mb-2">
            오후
          </Typography>
          <div className="grid grid-cols-3 gap-2">
            {afternoonSlots.map((slot) => {
              const isSelected = selectedTimeSlot === slot.time
              return (
                <button
                  key={slot.time}
                  onClick={() => onSelect(slot.time)}
                  className={`px-4 py-2 rounded-lg border-2 transition-colors ${
                    isSelected
                      ? 'bg-[#FE3A8F] text-white border-[#FE3A8F]'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-[#FE3A8F] hover:text-[#FE3A8F]'
                  }`}
                >
                  <Typography variant="body2" className={`font-medium ${isSelected ? 'text-white' : 'text-gray-700'}`}>
                    {formatTimeDisplay(slot.time)}
                  </Typography>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export const CALENDAR_STYLES = `
  .react-calendar {
    width: 100%;
    border: none;
    font-family: inherit;
  }
  .react-calendar__navigation {
    display: flex;
    height: 40px;
    margin-bottom: 1em;
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
    margin-bottom: 0.5em;
  }
  .react-calendar__month-view__weekdays__weekday {
    padding: 0.5em;
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
    padding: 0.75em 0.5em;
    background: none;
    text-align: center;
    line-height: 1.5;
    font-size: 0.9em;
    color: #1e293b;
    border-radius: 6px;
    transition: all 0.15s;
    position: relative;
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
    background: #FE3A8F !important;
    color: white !important;
    font-weight: 600;
  }
  .react-calendar__tile--active:enabled:hover,
  .react-calendar__tile--active:enabled:focus {
    background: #e8a0c0 !important;
  }
  .react-calendar__tile:disabled {
    background-color: transparent !important;
  }
`
