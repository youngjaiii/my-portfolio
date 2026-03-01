import { Button, PartnerPlusAutocomplete } from '@/components'
import { DateRangeCalendar } from '@/components/features/timesheet'
import type { AttendanceStats, TimesheetStore } from '@/lib/timesheetApi'
import { exportAttendanceStatsToExcel } from '@/utils/exportExcel'
import { Calendar, Download, Search, X } from 'lucide-react'

interface StatsFiltersProps {
  statsDateRange: { startDate: string; endDate: string }
  setStatsDateRange: (range: { startDate: string; endDate: string }) => void
  selectedStoreForStats: string
  setSelectedStoreForStats: (id: string) => void
  selectedPartnerIds: { id: string; name: string }[]
  setSelectedPartnerIds: (partners: { id: string; name: string }[]) => void
  stores: TimesheetStore[]
  stats: AttendanceStats | null
  loadStats: () => void
}

export function StatsFilters({
  statsDateRange,
  setStatsDateRange,
  selectedStoreForStats,
  setSelectedStoreForStats,
  selectedPartnerIds,
  setSelectedPartnerIds,
  stores,
  stats,
  loadStats,
}: StatsFiltersProps) {
  
  const handleExportExcel = () => {
    if (!stats) return
    const selectedStoreName = selectedStoreForStats
      ? stores.find((s) => s.id === selectedStoreForStats)?.name
      : undefined
    
    const storeSchedules = stores.map((s) => ({
      storeId: s.id,
      storeName: s.name,
      ...(s.schedule || {
        weekday_start_hour: 16,
        weekday_start_minute: 0,
        weekday_end_hour: 22,
        weekday_end_minute: 0,
        weekend_start_hour: 16,
        weekend_start_minute: 0,
        weekend_end_hour: 22,
        weekend_end_minute: 0,
        late_threshold_minutes: 5,
        early_leave_threshold_minutes: 5,
        overtime_threshold_minutes: 30,
        undertime_threshold_minutes: 30,
      }),
    }))

    exportAttendanceStatsToExcel({
      stats,
      dateRange: statsDateRange,
      storeName: selectedStoreName,
      partnerNames: selectedPartnerIds.map((p) => p.name),
      storeSchedules,
    })
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
      <div className="p-4 sm:p-5 space-y-4">
        {/* 필터 그리드 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 기간 설정 */}
          <div className="sm:col-span-2 lg:col-span-1">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-2">
              <Calendar className="w-3.5 h-3.5" />
              기간 설정
            </label>
            <DateRangeCalendar
              startDate={statsDateRange.startDate}
              endDate={statsDateRange.endDate}
              onChange={(start, end) => setStatsDateRange({ startDate: start, endDate: end })}
            />
          </div>
          
          {/* 가게 필터 */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-2 block">가게 선택</label>
            <select
              value={selectedStoreForStats || ''}
              onChange={(e) => setSelectedStoreForStats(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:ring-2 focus:ring-[#FE3A8F]/20 focus:border-[#FE3A8F] outline-none transition-all hover:border-gray-300"
            >
              <option value="">전체 가게</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>{store.name}</option>
              ))}
            </select>
          </div>
          
          {/* 파트너 필터 */}
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-2 block">파트너 검색</label>
            <PartnerPlusAutocomplete
              value=""
              onChange={(id, partner) => {
                const memberId = partner?.member_id || id
                if (memberId && !selectedPartnerIds.find(p => p.id === memberId)) {
                  setSelectedPartnerIds([...selectedPartnerIds, { id: memberId, name: partner?.name || '알 수 없음' }])
                }
              }}
              placeholder="파트너 검색..."
              selectedIds={selectedPartnerIds.map(p => p.id)}
              resetOnSelect
            />
          </div>

          {/* 버튼 영역 */}
          <div className="flex items-end gap-2">
            <Button 
              onClick={loadStats} 
              variant="primary" 
              className="flex-1 py-2.5 rounded-xl"
            >
              <Search className="w-4 h-4 mr-1.5" /> 조회
            </Button>
            {stats && (
              <button 
                onClick={handleExportExcel} 
                className="px-3 py-2.5 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-600 rounded-xl transition-colors touch-manipulation"
                title="엑셀 다운로드"
              >
                <Download className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        
        {/* 선택된 파트너 태그 */}
        {selectedPartnerIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-gray-100">
            <span className="text-xs text-gray-400">선택된 파트너:</span>
            {selectedPartnerIds.map((partner) => (
              <span
                key={partner.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#FE3A8F]/10 text-[#FE3A8F] rounded-full text-xs font-medium"
              >
                {partner.name}
                <button
                  onClick={() => setSelectedPartnerIds(selectedPartnerIds.filter(p => p.id !== partner.id))}
                  className="hover:bg-[#FE3A8F]/20 active:bg-[#FE3A8F]/30 rounded-full p-0.5 transition-colors touch-manipulation"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            <button
              onClick={() => setSelectedPartnerIds([])}
              className="text-xs text-gray-400 hover:text-gray-600 active:text-gray-800 ml-1 transition-colors touch-manipulation"
            >
              전체 해제
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
