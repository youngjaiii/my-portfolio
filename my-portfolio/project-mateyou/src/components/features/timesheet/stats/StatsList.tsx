import { Avatar } from '@/components'
import { Calendar as CalendarIcon, ChevronDown, ChevronUp, Clock, Coffee, Edit2, List, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { StatsCalendar } from './StatsCalendar'

// UTC ISO 문자열을 한국시간 HH:MM으로 변환
function toKST(isoString: string | null | undefined): string {
  if (!isoString) return ''
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

interface StatsListProps {
  groupBy: 'partner' | 'store'
  sortBy: string
  sortedPartners: any[]
  groupedByStore: any[]
  partnerDetailView: 'list' | 'calendar'
  setPartnerDetailView: (view: 'list' | 'calendar') => void
  handleEditTime: (record: any, partnerName: string) => void
  handleDeleteRecord: (record: any) => void
  onAddClick: () => void
  calendarMonths: Record<string, { year: number; month: number }>
  setCalendarMonths: any
}

export function StatsList({
  groupBy,
  sortedPartners,
  groupedByStore,
  partnerDetailView,
  setPartnerDetailView,
  handleEditTime,
  handleDeleteRecord,
  onAddClick,
  calendarMonths,
  setCalendarMonths,
}: StatsListProps) {
  const [expandedPartner, setExpandedPartner] = useState<string | null>(null)
  const [expandedStore, setExpandedStore] = useState<string | null>(null)

  if (groupBy === 'partner') {
    return (
      <div className="space-y-4">
        {/* 추가 버튼 */}
        <div className="flex justify-end">
          <button
            onClick={onAddClick}
            className="flex items-center gap-2 px-4 py-2 bg-[#FE3A8F] text-white rounded-xl text-sm font-semibold hover:bg-[#FE3A8F]/90 active:bg-[#FE3A8F]/80 transition-colors shadow-sm touch-manipulation"
          >
            <Plus className="w-4 h-4" />
            출근 기록 추가
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
        {sortedPartners.length > 0 ? (
          sortedPartners.map((partner) => (
            <div 
              key={partner.partner_plus_id} 
              className="overflow-hidden"
            >
              {/* 파트너 헤더 */}
              <button
                onClick={() => setExpandedPartner(expandedPartner === partner.partner_plus_id ? null : partner.partner_plus_id)}
                className="w-full px-4 py-3 flex items-center gap-4 hover:bg-gray-50 active:bg-gray-100 transition-colors touch-manipulation"
              >
                {/* 아바타 + 링 */}
                <div className="relative p-0.5 rounded-full ring-2 ring-emerald-400">
                  <Avatar src={partner.partner_plus_image} alt={partner.partner_plus_name} size="sm" />
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white bg-emerald-500" />
                </div>

                {/* 정보 */}
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-bold text-gray-900 truncate">{partner.partner_plus_name}</p>
                  <p className="text-xs text-gray-400">{partner.records?.length || 0}건의 기록</p>
                </div>

                {/* 시간 요약 */}
                <div className="hidden sm:flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xs text-gray-400">근무</p>
                    <p className="text-base font-bold text-gray-900 tabular-nums">
                      {partner.total_work_hours.toFixed(1)}<span className="text-xs font-normal text-gray-400">h</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-400">휴게</p>
                    <p className="text-base font-bold text-amber-600 tabular-nums">
                      {partner.total_break_hours.toFixed(1)}<span className="text-xs font-normal text-amber-400">h</span>
                    </p>
                  </div>
                </div>

                {/* 토글 */}
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                  expandedPartner === partner.partner_plus_id ? 'bg-[#FE3A8F]/10 text-[#FE3A8F]' : 'bg-gray-100 text-gray-400'
                }`}>
                  {expandedPartner === partner.partner_plus_id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              </button>

              {/* 상세 기록 */}
              {expandedPartner === partner.partner_plus_id && (
                <div className="bg-gray-50/50 p-4">
                  {/* 모바일 시간 요약 */}
                  <div className="sm:hidden flex items-center justify-center gap-6 mb-4 py-2 bg-white rounded-xl">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-emerald-500" />
                      <span className="text-sm font-bold text-gray-900">{partner.total_work_hours.toFixed(1)}h</span>
                      <span className="text-xs text-gray-400">근무</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Coffee className="w-4 h-4 text-amber-500" />
                      <span className="text-sm font-bold text-amber-600">{partner.total_break_hours.toFixed(1)}h</span>
                      <span className="text-xs text-gray-400">휴게</span>
                    </div>
                  </div>

                  {/* 뷰 전환 */}
                  <div className="flex items-center gap-2 mb-4">
                    <button
                      onClick={() => setPartnerDetailView('list')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors touch-manipulation ${
                        partnerDetailView === 'list' 
                          ? 'bg-[#FE3A8F] text-white' 
                          : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100 active:bg-gray-200'
                      }`}
                    >
                      <List className="w-3.5 h-3.5" />목록
                    </button>
                    <button
                      onClick={() => setPartnerDetailView('calendar')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors touch-manipulation ${
                        partnerDetailView === 'calendar' 
                          ? 'bg-[#FE3A8F] text-white' 
                          : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100 active:bg-gray-200'
                      }`}
                    >
                      <CalendarIcon className="w-3.5 h-3.5" />캘린더
                    </button>
                  </div>

                  {partnerDetailView === 'list' ? (
                    <RecordList 
                      records={partner.records} 
                      partnerName={partner.partner_plus_name} 
                      onEdit={handleEditTime}
                      onDelete={handleDeleteRecord}
                    />
                  ) : (
                    <StatsCalendar 
                      partnerId={partner.partner_plus_id}
                      records={partner.records}
                      partnerName={partner.partner_plus_name}
                      onEdit={handleEditTime}
                      currentMonth={calendarMonths[partner.partner_plus_id] || { year: new Date().getFullYear(), month: new Date().getMonth() }}
                      onMonthChange={(dir) => {
                         const curr = calendarMonths[partner.partner_plus_id] || { year: new Date().getFullYear(), month: new Date().getMonth() }
                         const next = new Date(curr.year, curr.month + (dir === 'next' ? 1 : -1))
                         setCalendarMonths({ ...calendarMonths, [partner.partner_plus_id]: { year: next.getFullYear(), month: next.getMonth() } })
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          ))
        ) : (
          <EmptyState message="조회된 파트너가 없습니다" />
        )}
        </div>
      </div>
    )
  }

  // 가게별 그룹
  return (
    <div className="space-y-4">
      {/* 추가 버튼 */}
      <div className="flex justify-end">
        <button
          onClick={onAddClick}
          className="flex items-center gap-2 px-4 py-2 bg-[#FE3A8F] text-white rounded-xl text-sm font-semibold hover:bg-[#FE3A8F]/90 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          출근 기록 추가
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
      {groupedByStore.length > 0 ? (
        groupedByStore.map((group) => (
          <div 
            key={group.store_id} 
            className="overflow-hidden"
          >
            {/* 가게 헤더 */}
            <button
              onClick={() => setExpandedStore(expandedStore === group.store_id ? null : group.store_id)}
              className="w-full px-4 py-3 flex items-center gap-4 hover:bg-gray-50 active:bg-gray-100 transition-colors touch-manipulation"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white text-sm font-bold">
                {group.store_name?.[0] || '?'}
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-sm font-bold text-gray-900">{group.store_name}</p>
                <p className="text-xs text-gray-400">{group.partners?.length || 0}명의 파트너</p>
              </div>
              <div className="text-right hidden sm:block">
                <p className="text-xs text-gray-400">총 근무</p>
                <p className="text-base font-bold text-gray-900 tabular-nums">
                  {group.total_work_hours.toFixed(1)}<span className="text-xs font-normal text-gray-400">h</span>
                </p>
              </div>
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                expandedStore === group.store_id ? 'bg-blue-100 text-blue-500' : 'bg-gray-100 text-gray-400'
              }`}>
                {expandedStore === group.store_id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </button>
            
            {/* 파트너별 상세 */}
            {expandedStore === group.store_id && (
              <div className="bg-gray-50/50">
                {group.partners.map((p: any, idx: number) => (
                  <div key={p.partner_plus_id} className={`p-4 ${idx > 0 ? 'border-t border-gray-100' : ''}`}>
                    {/* 파트너 헤더 */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className="relative p-0.5 rounded-full ring-2 ring-emerald-400">
                        <Avatar src={p.partner_plus_image} alt={p.partner_plus_name} size="xs" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-semibold text-gray-800">{p.partner_plus_name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="font-semibold text-gray-700">{p.total_work_hours.toFixed(1)}h</span>
                        <span className="text-amber-600 font-medium">{p.total_break_hours.toFixed(1)}h 휴게</span>
                      </div>
                    </div>
                    {/* 기록 목록 */}
                    <RecordList records={p.records} partnerName={p.partner_plus_name} onEdit={handleEditTime} onDelete={handleDeleteRecord} compact />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      ) : (
        <EmptyState message="조회된 가게가 없습니다" />
      )}
      </div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="bg-white rounded-2xl p-12 text-center border border-gray-100 border-dashed">
      <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <p className="text-sm font-medium text-gray-500">{message}</p>
      <p className="text-xs text-gray-400 mt-1">필터 조건을 확인해주세요</p>
    </div>
  )
}

// 기록 목록 (카드 스타일)
function RecordList({ records, partnerName, onEdit, onDelete, compact }: { records: any[], partnerName: string, onEdit: any, onDelete: any, compact?: boolean }) {
  const getDayOfWeek = (dateStr: string) => {
    const days = ['일', '월', '화', '수', '목', '금', '토']
    const date = new Date(dateStr)
    return days[date.getDay()]
  }

  if (records.length === 0) {
    return <div className="py-6 text-center text-gray-400 text-sm">기록이 없습니다</div>
  }

  // 가게별 그룹화 (compact가 아닐 때만)
  const groupedRecords = compact ? null : records.reduce((acc: any, r) => {
    const storeId = r.store_id || 'unknown'
    if (!acc[storeId]) acc[storeId] = { name: r.store_name, records: [], totalWork: 0, totalBreak: 0 }
    acc[storeId].records.push(r)
    acc[storeId].totalWork += (r.work_hours || 0)
    acc[storeId].totalBreak += (r.break_hours || 0)
    return acc
  }, {})

  if (!compact && groupedRecords) {
    return (
      <div className="space-y-3">
        {Object.entries(groupedRecords).map(([storeId, data]: [string, any]) => (
          <div key={storeId} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700">{data.name}</span>
              <div className="flex items-center gap-2 text-[11px]">
                <span className="text-gray-600 font-medium">{data.totalWork.toFixed(1)}h</span>
                <span className="text-amber-600">{data.totalBreak.toFixed(1)}h 휴게</span>
              </div>
            </div>
            <div className="divide-y divide-gray-50">
              {data.records.map((record: any) => (
                <RecordItem 
                  key={record.id} 
                  record={record} 
                  partnerName={partnerName} 
                  onEdit={onEdit}
                  onDelete={onDelete}
                  getDayOfWeek={getDayOfWeek}
                  hideStore
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50 overflow-hidden">
      {records.map((record) => (
        <RecordItem 
          key={record.id} 
          record={record} 
          partnerName={partnerName} 
          onEdit={onEdit}
          onDelete={onDelete}
          getDayOfWeek={getDayOfWeek}
          hideStore={compact}
        />
      ))}
    </div>
  )
}

function RecordItem({ record, partnerName, onEdit, onDelete, getDayOfWeek, hideStore }: any) {
  const dayOfWeek = getDayOfWeek(record.date)
  const isWeekend = dayOfWeek === '토' || dayOfWeek === '일'
  
  return (
    <div className="px-3 py-2.5 flex items-center gap-3 hover:bg-gray-50 active:bg-gray-100 transition-colors group touch-manipulation">
      {/* 날짜 */}
      <div className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center shrink-0 ${
        isWeekend ? 'bg-rose-50 text-rose-600' : 'bg-gray-100 text-gray-600'
      }`}>
        <span className="text-sm font-bold leading-none">{new Date(record.date).getDate()}</span>
        <span className="text-[10px] font-medium">{dayOfWeek}</span>
      </div>

      {/* 정보 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-800">{record.date.slice(5)}</span>
          {!hideStore && <span className="text-xs text-gray-400 truncate">@ {record.store_name}</span>}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {toKST(record.started_at)} - {record.ended_at ? toKST(record.ended_at) : '진행중'}
          </span>
          {record.total_break_minutes > 0 && (
            <span className="text-xs text-amber-600 font-medium flex items-center gap-1">
              <Coffee className="w-3 h-3" />
              {record.total_break_minutes}분
            </span>
          )}
        </div>
      </div>

      {/* 액션 버튼 */}
      {/* 모바일: 항상 표시, 데스크톱: hover 시 표시 */}
      <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <button 
          onClick={() => onEdit(record, partnerName)}
          className="p-2 rounded-lg text-gray-400 hover:text-[#FE3A8F] hover:bg-[#FE3A8F]/10 active:bg-[#FE3A8F]/20 active:text-[#FE3A8F] transition-colors touch-manipulation"
          title="수정"
        >
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button 
          onClick={() => onDelete(record)}
          className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 active:bg-red-100 active:text-red-600 transition-colors touch-manipulation"
          title="삭제"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
