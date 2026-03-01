import { Button, Modal, PartnerPlusAutocomplete } from '@/components'
import { DateTimePicker } from '@/components/features/timesheet'
import type { TimesheetStore, TimesheetStoreSchedule } from '@/lib/timesheetApi'
import { getDefaultStoreSchedule } from '@/lib/timesheetApi'
import { useAuthStore } from '@/store/useAuthStore'
import { useState, useEffect } from 'react'
import { getStoreManagers } from '@/lib/timesheetApi'
import type { PartnerPlusSearchResult } from '@/lib/partnerPlusSearchApi'

interface AttendanceAddModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (data: {
    partnerPlusId: string
    storeId: string
    managerId: string
    startedAt: string
    endedAt: string | null
    reason: string
  }) => Promise<void>
  stores: TimesheetStore[]
  isSaving: boolean
}

export function AttendanceAddModal({
  isOpen,
  onClose,
  onSave,
  stores,
  isSaving,
}: AttendanceAddModalProps) {
  const { user } = useAuthStore()
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('')
  const [selectedPartner, setSelectedPartner] = useState<PartnerPlusSearchResult | null>(null)
  const [selectedStoreId, setSelectedStoreId] = useState('')
  const [selectedManagerId, setSelectedManagerId] = useState('')
  const [startedAt, setStartedAt] = useState('')
  const [endedAt, setEndedAt] = useState('')
  const [reason, setReason] = useState('')
  const [managers, setManagers] = useState<Array<{ id: string; name: string }>>([])
  const [loadingManagers, setLoadingManagers] = useState(false)

  // 모달이 열릴 때 초기값 설정
  useEffect(() => {
    if (isOpen) {
      const now = new Date()
      const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
      setStartedAt(today)
      setEndedAt('')
      setReason('')
      setSelectedPartnerId('')
      setSelectedPartner(null)
      setSelectedStoreId('')
      setSelectedManagerId('')
      setManagers([])
    }
  }, [isOpen])

  // 가게 선택 시 매니저 목록 로드 및 스케줄 기본값 설정
  useEffect(() => {
    if (selectedStoreId && isOpen) {
      loadManagers(selectedStoreId)
      applyStoreSchedule(selectedStoreId)
    } else {
      setManagers([])
      setSelectedManagerId('')
    }
  }, [selectedStoreId, isOpen])

  // 출근 시간 날짜 변경 시 스케줄 재적용 (가게가 선택된 경우에만)
  useEffect(() => {
    if (selectedStoreId && startedAt && isOpen) {
      // 날짜가 변경되었을 때만 스케줄 재적용
      applyStoreSchedule(selectedStoreId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAt ? startedAt.slice(0, 10) : null, selectedStoreId, isOpen]) // 날짜 부분만 추적

  // 가게 스케줄을 출근/퇴근 시간에 적용
  function applyStoreSchedule(storeId: string) {
    const selectedStore = stores.find(s => s.id === storeId)
    if (!selectedStore) return

    // 가게 스케줄 가져오기 (없으면 기본값 사용)
    const schedule: TimesheetStoreSchedule = selectedStore.schedule || getDefaultStoreSchedule()

    // 현재 출근 시간이 설정되어 있으면 그 날짜 사용, 없으면 오늘 날짜 사용
    const baseDate = startedAt ? new Date(startedAt) : new Date()
    const dayOfWeek = baseDate.getDay() // 0: 일요일, 6: 토요일
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6

    // 요일에 따라 스케줄 선택
    const startHour = isWeekend ? schedule.weekend_start_hour : schedule.weekday_start_hour
    const startMinute = isWeekend ? schedule.weekend_start_minute : schedule.weekday_start_minute
    const endHour = isWeekend ? schedule.weekend_end_hour : schedule.weekday_end_hour
    const endMinute = isWeekend ? schedule.weekend_end_minute : schedule.weekend_end_minute

    // 출근 시간 설정
    const newStartedAt = new Date(baseDate)
    newStartedAt.setHours(startHour, startMinute, 0, 0)
    const startedAtString = new Date(newStartedAt.getTime() - newStartedAt.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16)
    setStartedAt(startedAtString)

    // 퇴근 시간 설정 (기본값으로 설정)
    const newEndedAt = new Date(baseDate)
    newEndedAt.setHours(endHour, endMinute, 0, 0)
    const endedAtString = new Date(newEndedAt.getTime() - newEndedAt.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16)
    setEndedAt(endedAtString)
  }

  async function loadManagers(storeId: string) {
    setLoadingManagers(true)
    try {
      const storeManagers = await getStoreManagers(storeId)
      setManagers(
        storeManagers
          .filter(sm => sm.manager)
          .map(sm => ({
            id: sm.manager_id,
            name: sm.manager?.name || '',
          }))
      )
    } catch (error) {
      console.error('❌ loadManagers error:', error)
    } finally {
      setLoadingManagers(false)
    }
  }

  async function handleSave() {
    if (!selectedPartnerId || !selectedStoreId || !selectedManagerId || !startedAt || !reason.trim()) {
      return
    }

    // member_id가 있으면 member_id 사용, 없으면 id 사용 (timesheet_attendance_records의 partner_plus_id는 member_id를 참조)
    const partnerPlusId = selectedPartner?.member_id || selectedPartnerId

    await onSave({
      partnerPlusId,
      storeId: selectedStoreId,
      managerId: selectedManagerId,
      startedAt: new Date(startedAt).toISOString(),
      endedAt: endedAt ? new Date(endedAt).toISOString() : null,
      reason: reason.trim(),
    })
  }

  const canSave = selectedPartnerId && selectedStoreId && selectedManagerId && startedAt && reason.trim().length > 0

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="출근 기록 추가" size="lg">
      <div className="space-y-5">
        {/* 파트너+ 선택 */}
        <div>
          <label className="text-xs font-medium text-gray-700 mb-2 block">파트너+</label>
          <PartnerPlusAutocomplete
            value={selectedPartnerId}
            onChange={(partnerId, partnerPlus) => {
              setSelectedPartnerId(partnerId)
              setSelectedPartner(partnerPlus || null)
            }}
            placeholder="파트너+를 검색하세요..."
            className="w-full"
          />
        </div>

        {/* 가게 선택 */}
        <div>
          <label className="text-xs font-medium text-gray-700 mb-2 block">근무 매장</label>
          <select
            value={selectedStoreId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-gray-300"
          >
            <option value="">매장을 선택하세요</option>
            {stores.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {/* 매니저 선택 */}
        <div>
          <label className="text-xs font-medium text-gray-700 mb-2 block">담당 매니저</label>
          {loadingManagers ? (
            <div className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-400">
              매니저 목록을 불러오는 중...
            </div>
          ) : (
            <select
              value={selectedManagerId}
              onChange={(e) => setSelectedManagerId(e.target.value)}
              disabled={!selectedStoreId || managers.length === 0}
              className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed"
            >
              <option value="">매니저를 선택하세요</option>
              {managers.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          )}
          {selectedStoreId && managers.length === 0 && !loadingManagers && (
            <p className="text-xs text-gray-400 mt-1">해당 매장에 할당된 매니저가 없습니다</p>
          )}
        </div>

        {/* 출퇴근 시간 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
            <label className="text-xs font-medium text-blue-600 mb-2 block">출근 시간</label>
            <DateTimePicker value={startedAt} onChange={setStartedAt} />
          </div>
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
            <label className="text-xs font-medium text-gray-700 mb-2 block">퇴근 시간 (선택)</label>
            <DateTimePicker value={endedAt} onChange={setEndedAt} />
            {!endedAt && (
              <p className="text-[10px] text-gray-400 mt-1">퇴근 시간을 입력하지 않으면 진행 중으로 표시됩니다</p>
            )}
          </div>
        </div>

        {/* 추가 사유 */}
        <div className="p-3 bg-rose-50 rounded-xl border-2 border-rose-300">
          <label className="flex items-center gap-2 text-xs font-medium text-rose-600 mb-2">
            추가 사유
            <span className="text-[9px] font-medium text-white bg-rose-500 px-1.5 py-0.5 rounded">필수</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full bg-white rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none h-16 resize-none placeholder:text-gray-300 border border-rose-200 focus:border-rose-400"
            placeholder="출근 기록 추가 사유를 입력해주세요"
          />
        </div>

        {/* 버튼 */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 px-4 py-2.5 text-sm text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
          >
            취소
          </button>
          <Button
            variant="primary"
            onClick={handleSave}
            isLoading={isSaving}
            disabled={!canSave}
            className="flex-1 py-2.5 rounded-lg"
          >
            추가
          </Button>
        </div>
      </div>
    </Modal>
  )
}

