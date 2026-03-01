import { Button, Modal } from '@/components'
import { DateTimePicker } from '@/components/features/timesheet'
import type { BreakRecord } from '@/hooks/useAttendanceStats'
import type { TimesheetStore } from '@/lib/timesheetApi'
import { Plus, Trash2 } from 'lucide-react'
import { useMemo } from 'react'

// 로컬 시간으로 변환하는 헬퍼
function formatToLocal(dateStr: string | null) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

interface TimeEditModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: () => void
  isSaving: boolean
  editingRecord: any
  editStartedAt: string
  setEditStartedAt: (val: string) => void
  editEndedAt: string
  setEditEndedAt: (val: string) => void
  editBreakRecords: BreakRecord[]
  setEditBreakRecords: (records: BreakRecord[]) => void
  editModificationReason: string
  setEditModificationReason: (val: string) => void
  editStoreId: string
  setEditStoreId: (val: string) => void
  stores: TimesheetStore[]
}

export function TimeEditModal({
  isOpen,
  onClose,
  onSave,
  isSaving,
  editingRecord,
  editStartedAt,
  setEditStartedAt,
  editEndedAt,
  setEditEndedAt,
  editBreakRecords,
  setEditBreakRecords,
  editModificationReason,
  setEditModificationReason,
  editStoreId,
  setEditStoreId,
  stores,
}: TimeEditModalProps) {
  
  if (!editingRecord) return null

  const handleAddBreak = () => {
    const baseTime = editStartedAt ? new Date(editStartedAt) : new Date()
    const breakStart = new Date(baseTime.getTime() + 2 * 60 * 60 * 1000)
    const breakEnd = new Date(breakStart.getTime() + 60 * 60 * 1000)
    
    const newBreak: BreakRecord = {
      id: `new-${Date.now()}`,
      started_at: new Date(breakStart.getTime() - breakStart.getTimezoneOffset() * 60000).toISOString().slice(0, 16),
      ended_at: new Date(breakEnd.getTime() - breakEnd.getTimezoneOffset() * 60000).toISOString().slice(0, 16),
      isNew: true,
    }
    setEditBreakRecords([...editBreakRecords, newBreak])
  }

  const handleDeleteBreak = (id: string) => {
    setEditBreakRecords(editBreakRecords.map(b => b.id === id ? { ...b, isDeleted: true } : b))
  }

  const handleBreakTimeChange = (id: string, field: 'started_at' | 'ended_at', value: string) => {
    setEditBreakRecords(editBreakRecords.map(b => b.id === id ? { ...b, [field]: value } : b))
  }

  const activeBreaks = editBreakRecords.filter(b => !b.isDeleted)
  const hasReason = editModificationReason.trim().length > 0

  // 변경 여부 감지
  const hasChanges = useMemo(() => {
    // 원본 값들
    const originalStartedAt = formatToLocal(editingRecord.started_at)
    const originalEndedAt = formatToLocal(editingRecord.ended_at)
    const originalStoreId = editingRecord.store_id || ''
    
    // 출퇴근 시간 변경 확인
    if (editStartedAt !== originalStartedAt) return true
    if (editEndedAt !== originalEndedAt) return true
    
    // 매장 변경 확인
    if (editStoreId !== originalStoreId) return true
    
    // 휴게 기록 변경 확인
    const originalBreaks = (editingRecord.break_records || []).map((br: any) => ({
      id: br.id,
      started_at: formatToLocal(br.started_at),
      ended_at: formatToLocal(br.ended_at),
    }))
    
    // 새로 추가된 휴게 기록이 있는지
    const hasNewBreaks = editBreakRecords.some(b => b.isNew && !b.isDeleted)
    if (hasNewBreaks) return true
    
    // 삭제된 휴게 기록이 있는지
    const hasDeletedBreaks = editBreakRecords.some(b => b.isDeleted && !b.isNew)
    if (hasDeletedBreaks) return true
    
    // 기존 휴게 기록 시간 변경 확인
    for (const br of editBreakRecords) {
      if (br.isNew || br.isDeleted) continue
      const original = originalBreaks.find((o: any) => o.id === br.id)
      if (!original) continue
      if (br.started_at !== original.started_at || br.ended_at !== original.ended_at) {
        return true
      }
    }
    
    return false
  }, [editingRecord, editStartedAt, editEndedAt, editStoreId, editBreakRecords])

  // 저장 가능 여부: 변경이 있고, 수정 사유가 입력되어야 함
  const canSave = hasChanges && hasReason

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="근태 기록 수정" size="lg">
      <div className="space-y-5">
        {/* 파트너 정보 - 작게 */}
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-gray-900">{editingRecord.partnerName}</span>
          <span className="text-gray-300">|</span>
          <span className="text-gray-500">{editingRecord.date}</span>
        </div>

        {/* 출퇴근 시간 - 푸른/검정 하이라이팅 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
            <label className="text-xs font-medium text-blue-600 mb-2 block">출근</label>
            <DateTimePicker value={editStartedAt} onChange={setEditStartedAt} />
          </div>
          <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
            <label className="text-xs font-medium text-gray-700 mb-2 block">퇴근</label>
            <DateTimePicker value={editEndedAt} onChange={setEditEndedAt} />
          </div>
        </div>

        {/* 근무 매장 */}
        <div>
          <label className="text-xs text-gray-500 mb-2 block">근무 매장</label>
          <select
            value={editStoreId}
            onChange={(e) => setEditStoreId(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-gray-300"
          >
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* 휴게 기록 - 노란색 하이라이팅 */}
        <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-amber-700 flex items-center gap-2">
              휴게 기록
              {activeBreaks.length > 0 && (
                <span className="text-[10px] text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full">
                  {activeBreaks.length}건
                </span>
              )}
            </label>
            <button 
              onClick={handleAddBreak} 
              className="flex items-center gap-1 text-[10px] text-amber-600 hover:text-amber-700 px-2 py-1 rounded hover:bg-amber-100"
            >
              <Plus className="w-3 h-3" /> 추가
            </button>
          </div>
          
          <div className="space-y-2">
            {activeBreaks.length === 0 ? (
              <div className="py-3 text-center text-[10px] text-amber-500">
                휴게 기록 없음
              </div>
            ) : (
              activeBreaks.map((br, index) => (
                <div 
                  key={br.id} 
                  className="p-2.5 bg-white rounded-lg border border-amber-200"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-amber-500">#{index + 1}</span>
                      {br.isNew && (
                        <span className="text-[9px] font-medium text-amber-600 bg-amber-100 px-1 py-0.5 rounded">NEW</span>
                      )}
                    </div>
                    <button 
                      onClick={() => handleDeleteBreak(br.id)} 
                      className="w-5 h-5 rounded text-amber-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-amber-600 mb-1 block">시작</label>
                      <DateTimePicker 
                        value={br.started_at} 
                        onChange={(val) => handleBreakTimeChange(br.id, 'started_at', val)} 
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-amber-600 mb-1 block">종료</label>
                      <DateTimePicker 
                        value={br.ended_at} 
                        onChange={(val) => handleBreakTimeChange(br.id, 'ended_at', val)} 
                      />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 수정 사유 - 변경이 있을 때 하이라이트 */}
        <div className={`p-3 rounded-xl border-2 transition-colors ${
          hasChanges
            ? hasReason 
              ? 'bg-rose-50 border-rose-300' 
              : 'bg-rose-50 border-rose-400 animate-pulse'
            : 'bg-gray-50 border-gray-200 opacity-60'
        }`}>
          <label className={`flex items-center gap-2 text-xs font-medium mb-2 ${
            hasChanges
              ? hasReason ? 'text-rose-600' : 'text-rose-500'
              : 'text-gray-400'
          }`}>
            수정 사유
            {hasChanges && (
              <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${
                hasReason 
                  ? 'text-white bg-rose-500' 
                  : 'text-white bg-rose-400'
              }`}>필수</span>
            )}
          </label>
          <textarea
            value={editModificationReason}
            onChange={(e) => setEditModificationReason(e.target.value)}
            disabled={!hasChanges}
            className={`w-full bg-white rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none h-16 resize-none placeholder:text-gray-300 border transition-colors disabled:bg-gray-100 disabled:cursor-not-allowed ${
              hasChanges
                ? hasReason 
                  ? 'border-rose-200 focus:border-rose-400' 
                  : 'border-rose-300 focus:border-rose-400'
                : 'border-gray-200'
            }`}
            placeholder={hasChanges ? "수정 사유를 입력해주세요" : "변경 사항이 없습니다"}
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
            onClick={onSave} 
            isLoading={isSaving} 
            disabled={!canSave}
            className="flex-1 py-2.5 rounded-lg"
          >
            저장
          </Button>
        </div>
      </div>
    </Modal>
  )
}
