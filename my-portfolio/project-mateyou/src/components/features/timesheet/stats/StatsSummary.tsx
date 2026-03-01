import { Users, Store, Clock, Coffee } from 'lucide-react'
import type { AttendanceStats } from '@/lib/timesheetApi'

interface StatsSummaryProps {
  summary: AttendanceStats['summary']
}

export function StatsSummary({ summary }: StatsSummaryProps) {
  const items = [
    { 
      label: '총 파트너+', 
      value: summary.total_partners, 
      unit: '명',
      icon: Users,
      gradient: 'from-emerald-50 to-emerald-100',
      iconBg: 'bg-emerald-500',
      textColor: 'text-emerald-700',
      ring: 'ring-emerald-200',
    },
    { 
      label: '총 가게', 
      value: summary.total_stores, 
      unit: '개',
      icon: Store,
      gradient: 'from-blue-50 to-blue-100',
      iconBg: 'bg-blue-500',
      textColor: 'text-blue-700',
      ring: 'ring-blue-200',
    },
    { 
      label: '실 근무시간', 
      value: summary.total_work_hours.toFixed(1), 
      unit: '시간',
      icon: Clock,
      gradient: 'from-[#FE3A8F]/5 to-[#FE3A8F]/10',
      iconBg: 'bg-[#FE3A8F]',
      textColor: 'text-[#FE3A8F]',
      ring: 'ring-[#FE3A8F]/20',
    },
    { 
      label: '총 휴게시간', 
      value: summary.total_break_hours.toFixed(1), 
      unit: '시간',
      icon: Coffee,
      gradient: 'from-amber-50 to-amber-100',
      iconBg: 'bg-amber-500',
      textColor: 'text-amber-700',
      ring: 'ring-amber-200',
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <div 
            key={item.label} 
            className={`bg-gradient-to-br ${item.gradient} rounded-2xl p-4 ring-1 ${item.ring}`}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-8 h-8 rounded-xl ${item.iconBg} flex items-center justify-center`}>
                <Icon className="w-4 h-4 text-white" />
              </div>
              <span className="text-xs font-medium text-gray-600">{item.label}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={`text-2xl sm:text-3xl font-bold ${item.textColor}`}>{item.value}</span>
              <span className="text-sm text-gray-400">{item.unit}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
