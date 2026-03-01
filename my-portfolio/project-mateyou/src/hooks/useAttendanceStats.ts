import {
  addBreakRecord,
  createAttendanceRecord,
  deleteAttendanceRecord,
  deleteBreakRecord,
  getAttendanceStats,
  getStores,
  modifyAttendanceRecord,
  updateBreakRecord,
  type AttendanceStats,
  type TimesheetStore
} from '@/lib/timesheetApi'
import { globalToast } from '@/lib/toast'
import { useAuthStore } from '@/store/useAuthStore'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTimesheetRealtime } from './useTimesheetRealtime'

export interface BreakRecord {
  id: string
  started_at: string
  ended_at: string
  isNew?: boolean
  isDeleted?: boolean
}

export interface AttendanceRecord {
  id: string
  date: string
  started_at: string
  ended_at: string | null
  store_id: string
  store_name: string
  total_work_minutes: number
  total_break_minutes: number
  work_minutes: number
  break_records: any[]
  partnerName?: string
  break_started_at?: string
  break_ended_at?: string
}

export interface StoreGroupedData {
  store_id: string
  store_name: string
  partners: {
    partner_plus_id: string
    partner_plus_name: string
    partner_plus_image?: string
    records: AttendanceRecord[]
    total_work_hours: number
    total_break_hours: number
  }[]
  total_work_hours: number
  total_break_hours: number
}

type StatsDateRange = {
  startDate: string
  endDate: string
}

type SortBy = 'name' | 'work' | 'break'

type GroupBy = 'partner' | 'store'

type PartnerDetailView = 'list' | 'calendar'

export function useAttendanceStats() {
  const { user } = useAuthStore()
  
  // 초기 날짜 범위 (최근 1주일)
  const formatLocalDate = (date: Date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const getLastWeekRange = (): StatsDateRange => {
    const end = new Date()
    const start = new Date()
    start.setDate(start.getDate() - 7)
    return {
      startDate: formatLocalDate(start),
      endDate: formatLocalDate(end),
    }
  }

  // 필터 상태
  const [statsDateRange, setStatsDateRange] = useState<StatsDateRange>(getLastWeekRange())
  const [selectedStoreForStats, setSelectedStoreForStats] = useState<string>('')
  const [selectedPartnerIds, setSelectedPartnerIds] = useState<{ id: string; name: string }[]>([])
  const [sortBy, setSortBy] = useState<SortBy>('name')
  const [groupBy, setGroupBy] = useState<GroupBy>('partner')
  const [partnerDetailView, setPartnerDetailView] = useState<PartnerDetailView>('list')

  // 데이터 상태
  const [stores, setStores] = useState<TimesheetStore[]>([])
  const [stats, setStats] = useState<AttendanceStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [initialLoadDone, setInitialLoadDone] = useState(false)

  // 수정 상태
  const [timeEditModalOpen, setTimeEditModalOpen] = useState(false)
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null)
  const [editStartedAt, setEditStartedAt] = useState('')
  const [editEndedAt, setEditEndedAt] = useState('')
  const [editBreakRecords, setEditBreakRecords] = useState<BreakRecord[]>([])
  const [editModificationReason, setEditModificationReason] = useState('')
  const [editStoreId, setEditStoreId] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // 추가 상태
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [isAdding, setIsAdding] = useState(false)

  // 삭제 상태
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deletingRecord, setDeletingRecord] = useState<AttendanceRecord | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // 캘린더 월 상태
  const [calendarMonths, setCalendarMonths] = useState<Record<string, { year: number; month: number }>>({})

  const loadStores = async () => {
    try {
      const storeList = await getStores({ includeInactive: true })
      setStores(storeList)
    } catch (error) {
      console.error('❌ loadStores error:', error)
    }
  }

  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const partnerIds = selectedPartnerIds.length > 0 ? selectedPartnerIds.map(p => p.id) : undefined
      const data = await getAttendanceStats({
        startDate: statsDateRange.startDate,
        endDate: statsDateRange.endDate,
        storeId: selectedStoreForStats || undefined,
        partnerPlusIds: partnerIds,
      })
      setStats(data)
    } catch (error) {
      console.error('❌ loadStats error:', error)
    } finally {
      setStatsLoading(false)
    }
  }, [statsDateRange, selectedStoreForStats, selectedPartnerIds])

  // 실시간 업데이트 (디바운싱으로 깜빡임 최소화)
  const [pendingRefresh, setPendingRefresh] = useState(false)
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useTimesheetRealtime({
    onRecordChange: () => {
      // 디바운싱: 500ms 내 여러 변경이 있어도 한 번만 리프레시
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }
      
      setPendingRefresh(true)
      refreshTimeoutRef.current = setTimeout(() => {
        loadStats()
        setPendingRefresh(false)
        refreshTimeoutRef.current = null
      }, 500)
    },
  })

  // 클린업
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    loadStores()
  }, [])

  useEffect(() => {
    if (!initialLoadDone) {
      loadStats()
      setInitialLoadDone(true)
    }
  }, [initialLoadDone, loadStats])

  // 정렬된 파트너 목록
  const sortedPartners = useMemo(() => {
    if (!stats?.by_partner) return []
    const partners = [...stats.by_partner]
    switch (sortBy) {
      case 'name':
        return partners.sort((a, b) => a.partner_plus_name.localeCompare(b.partner_plus_name, 'ko'))
      case 'work':
        return partners.sort((a, b) => b.total_work_hours - a.total_work_hours)
      case 'break':
        return partners.sort((a, b) => b.total_break_hours - a.total_break_hours)
      default:
        return partners
    }
  }, [stats?.by_partner, sortBy])

  // 가게별 그룹화 데이터
  const groupedByStore = useMemo<StoreGroupedData[]>(() => {
    if (!stats?.by_partner) return []
    const storeMap = new Map<string, StoreGroupedData>()
    
    stats.by_partner.forEach(partner => {
      const recordsByStore = new Map<string, AttendanceRecord[]>()
      partner.records.forEach((record: any) => {
        const sId = record.store_id || 'unknown'
        if (!recordsByStore.has(sId)) recordsByStore.set(sId, [])
        recordsByStore.get(sId)?.push(record)
      })

      recordsByStore.forEach((records, sId) => {
        if (!storeMap.has(sId)) {
          const storeInfo = stores.find(s => s.id === sId)
          storeMap.set(sId, {
            store_id: sId,
            store_name: storeInfo?.name || records[0]?.store_name || '알 수 없음',
            partners: [],
            total_work_hours: 0,
            total_break_hours: 0,
          })
        }
        const group = storeMap.get(sId)!
        const partner_work_hours = records.reduce((sum, r) => sum + (r.work_hours || 0), 0)
        const partner_break_hours = records.reduce((sum, r) => sum + (r.total_break_minutes || 0), 0) / 60
        
        group.partners.push({
          partner_plus_id: partner.partner_plus_id,
          partner_plus_name: partner.partner_plus_name,
          partner_plus_image: partner.partner_plus_image,
          records,
          total_work_hours: partner_work_hours,
          total_break_hours: partner_break_hours,
        })
        group.total_work_hours += partner_work_hours
        group.total_break_hours += partner_break_hours
      })
    })

    // sortBy에 따라 가게 및 파트너 정렬
    const result = Array.from(storeMap.values())
    
    // 가게 내 파트너 정렬
    result.forEach(store => {
      switch (sortBy) {
        case 'name':
          store.partners.sort((a, b) => a.partner_plus_name.localeCompare(b.partner_plus_name, 'ko'))
          break
        case 'work':
          store.partners.sort((a, b) => b.total_work_hours - a.total_work_hours)
          break
        case 'break':
          store.partners.sort((a, b) => b.total_break_hours - a.total_break_hours)
          break
      }
    })
    
    // 가게 정렬
    switch (sortBy) {
      case 'name':
        return result.sort((a, b) => a.store_name.localeCompare(b.store_name, 'ko'))
      case 'work':
        return result.sort((a, b) => b.total_work_hours - a.total_work_hours)
      case 'break':
        return result.sort((a, b) => b.total_break_hours - a.total_break_hours)
      default:
        return result.sort((a, b) => a.store_name.localeCompare(b.store_name, 'ko'))
    }
  }, [stats?.by_partner, stores, sortBy])

  // 시간 수정 모달 제어
  const handleEditTime = (record: AttendanceRecord, partnerName: string) => {
    const formatToLocal = (dateStr: string | null) => {
      if (!dateStr) return ''
      const d = new Date(dateStr)
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
    }

    setEditingRecord({ ...record, partnerName })
    setEditStoreId(record.store_id || '')
    setEditStartedAt(formatToLocal(record.started_at))
    setEditEndedAt(formatToLocal(record.ended_at))
    
    const breakRecords = (record.break_records || []).map((br: any) => ({
      id: br.id,
      started_at: formatToLocal(br.started_at),
      ended_at: formatToLocal(br.ended_at),
    }))
    
    // 레거시 대응
    if (breakRecords.length === 0 && record.break_started_at) {
      breakRecords.push({
        id: `legacy-${Date.now()}`,
        started_at: formatToLocal(record.break_started_at),
        ended_at: formatToLocal(record.break_ended_at),
      })
    }

    setEditBreakRecords(breakRecords)
    setEditModificationReason('')
    setTimeEditModalOpen(true)
  }

  const handleSaveTimeEdit = async () => {
    if (!user?.id || !editingRecord || !editModificationReason.trim()) {
      globalToast.error('수정 사유를 입력해주세요.')
      return
    }

    setIsSaving(true)
    try {
      // 1. 휴게 기록 처리
      for (const br of editBreakRecords) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(br.id)
        if (br.isDeleted && isUuid) {
          await deleteBreakRecord(br.id, editModificationReason, user.id)
        } else if (br.isNew || !isUuid) {
          if (!br.isDeleted && br.started_at && br.ended_at) {
            await addBreakRecord(editingRecord.id, new Date(br.started_at).toISOString(), new Date(br.ended_at).toISOString(), editModificationReason, user.id)
          }
        } else if (isUuid && !br.isDeleted) {
          await updateBreakRecord(br.id, { started_at: new Date(br.started_at).toISOString(), ended_at: new Date(br.ended_at).toISOString() }, editModificationReason, user.id)
        }
      }

      // 2. 출근/퇴근/근무지 업데이트
      const updates: any = {}
      if (new Date(editStartedAt).toISOString() !== new Date(editingRecord.started_at).toISOString()) {
        updates.started_at = new Date(editStartedAt).toISOString()
      }
      if (editEndedAt && (!editingRecord.ended_at || new Date(editEndedAt).toISOString() !== new Date(editingRecord.ended_at).toISOString())) {
        updates.ended_at = new Date(editEndedAt).toISOString()
      }
      if (editStoreId !== editingRecord.store_id) {
        updates.store_id = editStoreId
      }

      const activeBreaks = editBreakRecords.filter(b => !b.isDeleted && b.started_at && b.ended_at)
      if (activeBreaks.length > 0) {
        const last = activeBreaks[activeBreaks.length - 1]
        updates.break_started_at = new Date(last.started_at).toISOString()
        updates.break_ended_at = new Date(last.ended_at).toISOString()
      }

      if (Object.keys(updates).length > 0) {
        await modifyAttendanceRecord(editingRecord.id, updates, editModificationReason, user.id)
      }

      setTimeEditModalOpen(false)
      loadStats()
      globalToast.success('기록이 수정되었습니다.')
    } catch (error) {
      console.error('❌ save fail:', error)
      globalToast.error('저장에 실패했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  // 출근 기록 추가
  const handleAddRecord = async (data: {
    partnerPlusId: string
    storeId: string
    managerId: string
    startedAt: string
    endedAt: string | null
    reason: string
  }) => {
    if (!user?.id) {
      globalToast.error('사용자 정보를 찾을 수 없습니다.')
      return
    }

    setIsAdding(true)
    try {
      const result = await createAttendanceRecord(
        data.partnerPlusId,
        data.storeId,
        data.managerId,
        data.startedAt,
        data.endedAt,
        data.reason,
        user.id
      )

      if (result) {
        setAddModalOpen(false)
        loadStats()
      }
    } catch (error) {
      console.error('❌ handleAddRecord error:', error)
    } finally {
      setIsAdding(false)
    }
  }

  // 출근 기록 삭제
  const handleDeleteRecord = (record: AttendanceRecord) => {
    setDeletingRecord(record)
    setDeleteModalOpen(true)
  }

  const handleConfirmDelete = async (reason: string) => {
    if (!user?.id || !deletingRecord) {
      globalToast.error('사용자 정보를 찾을 수 없습니다.')
      return
    }

    setIsDeleting(true)
    try {
      const success = await deleteAttendanceRecord(deletingRecord.id, reason, user.id)
      if (success) {
        setDeleteModalOpen(false)
        setDeletingRecord(null)
        loadStats()
      }
    } catch (error) {
      console.error('❌ handleConfirmDelete error:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  return {
    // 상태
    statsDateRange, setStatsDateRange,
    selectedStoreForStats, setSelectedStoreForStats,
    selectedPartnerIds, setSelectedPartnerIds,
    sortBy, setSortBy,
    groupBy, setGroupBy,
    partnerDetailView, setPartnerDetailView,
    stores,
    stats,
    statsLoading,
    
    // 계산된 데이터
    sortedPartners,
    groupedByStore,
    
    // 시간 수정
    timeEditModalOpen, setTimeEditModalOpen,
    editingRecord,
    editStartedAt, setEditStartedAt,
    editEndedAt, setEditEndedAt,
    editBreakRecords, setEditBreakRecords,
    editModificationReason, setEditModificationReason,
    editStoreId, setEditStoreId,
    isSaving,
    handleEditTime,
    handleSaveTimeEdit,
    
    // 기능
    loadStats,
    calendarMonths, setCalendarMonths,

    // 추가
    addModalOpen, setAddModalOpen,
    isAdding,
    handleAddRecord,

    // 삭제
    deleteModalOpen, setDeleteModalOpen,
    deletingRecord,
    isDeleting,
    handleDeleteRecord,
    handleConfirmDelete,
  }
}
