import { Avatar, Button, LoadingSpinner, Modal, SlideSheet } from '@/components'
import { supabase } from '@/lib/supabase'
import {
  calculateWorkTime,
  getAttendanceRequestLogs,
  getStores,
  logAuditAction,
  modifyAttendanceRecord,
  type TimesheetAttendanceRecord,
  type TimesheetAttendanceRequest,
  type TimesheetRequestType,
  type TimesheetStore,
} from '@/lib/timesheetApi'
import { globalToast } from '@/lib/toast'
import { useAuthStore } from '@/store/useAuthStore'
import { AlertCircle, Check, Clock, Coffee, Edit3, LogOut, MapPin } from 'lucide-react'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { DateTimePicker } from './DateTimePicker'

interface WorkingPartnerDetailSheetProps {
  isOpen: boolean
  onClose: () => void
  record: TimesheetAttendanceRecord | null
  onRecordUpdate?: () => void
  assignedStoreIds?: string[] // 매니저가 관리하는 가게 ID 목록
}

// 요청 타입별 설정
const REQUEST_TYPE_CONFIG: Record<
  TimesheetRequestType,
  { label: string; color: string; bgColor: string; icon: typeof Check }
> = {
  WORKING: {
    label: '출근',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-100',
    icon: Check,
  },
  BREAK: {
    label: '휴게 시작',
    color: 'text-amber-700',
    bgColor: 'bg-amber-100',
    icon: Coffee,
  },
  BREAK_END: {
    label: '휴게 종료',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    icon: Check,
  },
  OFF: {
    label: '퇴근',
    color: 'text-rose-700',
    bgColor: 'bg-rose-100',
    icon: LogOut,
  },
}

// 요청 상태별 설정
const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  pending: { label: '대기', color: 'text-amber-700', bgColor: 'bg-amber-100' },
  approved: { label: '승인', color: 'text-emerald-700', bgColor: 'bg-emerald-100' },
  rejected: { label: '반려', color: 'text-rose-700', bgColor: 'bg-rose-100' },
  cancelled: { label: '취소', color: 'text-gray-600', bgColor: 'bg-gray-100' },
}

// 수정 모달 타입
type ModifyModalType = 'break_start' | 'break_end' | 'checkout' | 'edit_time' | null

export function WorkingPartnerDetailSheet({
  isOpen,
  onClose,
  record,
  onRecordUpdate,
  assignedStoreIds,
}: WorkingPartnerDetailSheetProps) {
  const { user } = useAuthStore()
  const [requestLogs, setRequestLogs] = useState<TimesheetAttendanceRequest[]>([])
  const [isLoading, setIsLoading] = useState(false)
  
  // 수정 모달 상태
  const [modifyModalType, setModifyModalType] = useState<ModifyModalType>(null)
  const [modifyTime, setModifyTime] = useState('')
  const [modifyReason, setModifyReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // 근무지 변경 관련 상태
  const [stores, setStores] = useState<TimesheetStore[]>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')

  // 시트가 열릴 때 요청 로그 및 가게 목록 조회
  useEffect(() => {
    if (isOpen && record?.id) {
      loadRequestLogs()
      loadStores()
    } else {
      setRequestLogs([])
    }
  }, [isOpen, record?.id])

  // 가게 목록 로드
  async function loadStores() {
    try {
      const storeList = await getStores({ includeInactive: false })
      // 매니저인 경우 할당된 가게만 필터링
      if (assignedStoreIds && assignedStoreIds.length > 0) {
        setStores(storeList.filter(s => assignedStoreIds.includes(s.id)))
      } else {
        // 어드민인 경우 전체 가게
        setStores(storeList)
      }
    } catch (error) {
      console.error('❌ loadStores error:', error)
    }
  }

  // 모달이 열릴 때 시간 초기화 (edit_time인 경우 출근 시간, 그 외는 현재 시간)
  useEffect(() => {
    if (modifyModalType) {
      let baseTime: Date
      if (modifyModalType === 'edit_time' && record?.started_at) {
        // 출근 정보 수정: 해당 출근 시간으로 초기화
        baseTime = new Date(record.started_at)
      } else {
        // 휴게 시작/종료, 퇴근 처리: 현재 시간으로 초기화
        baseTime = new Date()
      }
      const localDateTime = new Date(baseTime.getTime() - baseTime.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
      setModifyTime(localDateTime)
      setModifyReason('')
      // 현재 근무지를 선택 상태로 설정
      setSelectedStoreId(record?.store_id || '')
    }
  }, [modifyModalType, record?.store_id, record?.started_at])

  async function loadRequestLogs() {
    if (!record?.id) return

    setIsLoading(true)
    try {
      const logs = await getAttendanceRequestLogs(record.id)
      setRequestLogs(logs)
    } catch (error) {
      console.error('❌ loadRequestLogs error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // 휴게 시작 처리
  async function handleBreakStart() {
    if (!record?.id || !user?.id || !modifyTime || !modifyReason.trim()) {
      globalToast.error('시간과 사유를 입력해주세요.')
      return
    }

    setIsSubmitting(true)
    try {
      const breakStartTime = new Date(modifyTime).toISOString()
      
      // 1. timesheet_attendance_records 업데이트
      const { error } = await supabase
        .from('timesheet_attendance_records')
        .update({
          status: 'BREAK',
          break_started_at: breakStartTime,
          is_modified: true,
          modification_reason: modifyReason,
          modified_by: user.id,
          modified_at: new Date().toISOString(),
        })
        .eq('id', record.id)

      if (error) throw error

      // 2. timesheet_break_records에 새 휴게 레코드 삽입
      const { error: breakInsertError } = await supabase
        .from('timesheet_break_records')
        .insert({
          attendance_record_id: record.id,
          started_at: breakStartTime,
        })

      if (breakInsertError) {
        console.error('휴게 기록 삽입 실패:', breakInsertError)
        // 휴게 기록 삽입 실패해도 출근 기록은 이미 업데이트됨
      }

      // 감사 로그 기록
      await logAuditAction({
        actorId: user.id,
        actorRole: 'partner_manager',
        action: 'attendance_modify',
        targetType: 'attendance_record',
        targetId: record.id,
        reason: modifyReason,
        metadata: {
          action_type: '휴게 시작 등록',
          partner_plus_id: record.partner_plus_id,
          partner_plus_name: record.partner_plus?.name,
          store_id: record.store_id,
          store_name: record.store?.name,
          break_started_at: breakStartTime,
        },
      })

      globalToast.success('휴게가 등록되었습니다.')
      setModifyModalType(null)
      onRecordUpdate?.()
      onClose()
    } catch (error: any) {
      console.error('❌ handleBreakStart error:', error)
      globalToast.error(error.message || '휴게 등록에 실패했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 휴게 종료 처리
  async function handleBreakEnd() {
    if (!record?.id || !user?.id || !modifyTime || !modifyReason.trim()) {
      globalToast.error('시간과 사유를 입력해주세요.')
      return
    }

    // 휴게 종료 시간이 휴게 시작 시간보다 이전인지 검증
    if (record.break_started_at) {
      const breakStartTimestamp = new Date(record.break_started_at).getTime()
      const breakEndTimestamp = new Date(modifyTime).getTime()
      if (breakEndTimestamp < breakStartTimestamp) {
        globalToast.error('휴게 종료 시간은 휴게 시작 시간보다 이후여야 합니다.')
        return
      }
    }

    setIsSubmitting(true)
    try {
      const breakEndTime = new Date(modifyTime).toISOString()
      
      // 현재 휴게 시간 계산
      let additionalBreakMinutes = 0
      if (record.break_started_at) {
        const breakStartTime = new Date(record.break_started_at).getTime()
        const breakEndTimestamp = new Date(breakEndTime).getTime()
        additionalBreakMinutes = Math.floor((breakEndTimestamp - breakStartTime) / (1000 * 60))
      }
      
      const existingBreakMinutes = record.total_break_minutes || 0
      
      // 1. timesheet_break_records에서 진행 중인 휴게 찾아 종료 처리
      const { data: currentBreak, error: breakSelectError } = await supabase
        .from('timesheet_break_records')
        .select('*')
        .eq('attendance_record_id', record.id)
        .is('ended_at', null)
        .eq('is_deleted', false)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (breakSelectError) {
        console.error('휴게 기록 조회 실패:', breakSelectError)
      }

      if (currentBreak) {
        // 휴게 기록 종료 처리 (duration_minutes는 트리거가 자동 계산)
        const { error: breakUpdateError } = await supabase
          .from('timesheet_break_records')
          .update({
            ended_at: breakEndTime,
          })
          .eq('id', currentBreak.id)

        if (breakUpdateError) {
          console.error('휴게 기록 업데이트 실패:', breakUpdateError)
        }
      }

      // 2. timesheet_attendance_records 업데이트
      const { error } = await supabase
        .from('timesheet_attendance_records')
        .update({
          status: 'WORKING',
          break_ended_at: breakEndTime,
          total_break_minutes: existingBreakMinutes + additionalBreakMinutes,
          is_modified: true,
          modification_reason: modifyReason,
          modified_by: user.id,
          modified_at: new Date().toISOString(),
        })
        .eq('id', record.id)

      if (error) throw error

      // 감사 로그 기록
      await logAuditAction({
        actorId: user.id,
        actorRole: 'partner_manager',
        action: 'attendance_modify',
        targetType: 'attendance_record',
        targetId: record.id,
        reason: modifyReason,
        metadata: {
          action_type: '휴게 종료 등록',
          partner_plus_id: record.partner_plus_id,
          partner_plus_name: record.partner_plus?.name,
          store_id: record.store_id,
          store_name: record.store?.name,
          break_ended_at: breakEndTime,
          additional_break_minutes: additionalBreakMinutes,
          total_break_minutes: existingBreakMinutes + additionalBreakMinutes,
        },
      })

      globalToast.success('휴게가 종료되었습니다.')
      setModifyModalType(null)
      onRecordUpdate?.()
      onClose()
    } catch (error: any) {
      console.error('❌ handleBreakEnd error:', error)
      globalToast.error(error.message || '휴게 종료에 실패했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 퇴근 처리
  async function handleCheckout() {
    if (!record?.id || !user?.id || !modifyTime || !modifyReason.trim()) {
      globalToast.error('시간과 사유를 입력해주세요.')
      return
    }

    // 퇴근 시간이 출근 시간보다 이전인지 검증
    const startedAtTimestamp = new Date(record.started_at).getTime()
    const checkoutTimestamp = new Date(modifyTime).getTime()
    if (checkoutTimestamp < startedAtTimestamp) {
      globalToast.error('퇴근 시간은 출근 시간보다 이후여야 합니다.')
      return
    }

    // 휴게 중인 경우, 퇴근 시간이 휴게 시작 시간보다 이전인지 검증
    if (record.status === 'BREAK' && record.break_started_at) {
      const breakStartTimestamp = new Date(record.break_started_at).getTime()
      if (checkoutTimestamp < breakStartTimestamp) {
        globalToast.error('퇴근 시간은 휴게 시작 시간보다 이후여야 합니다.')
        return
      }
    }

    setIsSubmitting(true)
    try {
      const checkoutTime = new Date(modifyTime).toISOString()
      
      // 휴게 중에 퇴근하는 경우 휴게 시간 누적
      let additionalBreakMinutes = 0
      if (record.status === 'BREAK' && record.break_started_at) {
        const breakStartTime = new Date(record.break_started_at).getTime()
        const checkoutTimestamp = new Date(checkoutTime).getTime()
        additionalBreakMinutes = Math.floor((checkoutTimestamp - breakStartTime) / (1000 * 60))

        // timesheet_break_records에서 진행 중인 휴게 종료 처리
        const { data: currentBreak, error: breakSelectError } = await supabase
          .from('timesheet_break_records')
          .select('*')
          .eq('attendance_record_id', record.id)
          .is('ended_at', null)
          .eq('is_deleted', false)
          .order('started_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (breakSelectError) {
          console.error('휴게 기록 조회 실패:', breakSelectError)
        }

        if (currentBreak) {
          const { error: breakUpdateError } = await supabase
            .from('timesheet_break_records')
            .update({
              ended_at: checkoutTime,
            })
            .eq('id', currentBreak.id)

          if (breakUpdateError) {
            console.error('휴게 기록 업데이트 실패:', breakUpdateError)
          }
        }
      }
      
      const existingBreakMinutes = record.total_break_minutes || 0
      
      const { error } = await supabase
        .from('timesheet_attendance_records')
        .update({
          status: 'OFF',
          ended_at: checkoutTime,
          break_ended_at: record.status === 'BREAK' ? checkoutTime : record.break_ended_at,
          total_break_minutes: existingBreakMinutes + additionalBreakMinutes,
          is_modified: true,
          modification_reason: modifyReason,
          modified_by: user.id,
          modified_at: new Date().toISOString(),
        })
        .eq('id', record.id)

      if (error) throw error

      // 감사 로그 기록
      await logAuditAction({
        actorId: user.id,
        actorRole: 'partner_manager',
        action: 'attendance_modify',
        targetType: 'attendance_record',
        targetId: record.id,
        reason: modifyReason,
        metadata: {
          action_type: '퇴근 처리',
          partner_plus_id: record.partner_plus_id,
          partner_plus_name: record.partner_plus?.name,
          store_id: record.store_id,
          store_name: record.store?.name,
          ended_at: checkoutTime,
          was_on_break: record.status === 'BREAK',
          additional_break_minutes: additionalBreakMinutes,
          total_break_minutes: existingBreakMinutes + additionalBreakMinutes,
        },
      })

      globalToast.success('퇴근 처리되었습니다.')
      setModifyModalType(null)
      onRecordUpdate?.()
      onClose()
    } catch (error: any) {
      console.error('❌ handleCheckout error:', error)
      globalToast.error(error.message || '퇴근 처리에 실패했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 시간 수정 처리
  async function handleEditTime() {
    if (!record?.id || !user?.id || !modifyReason.trim()) {
      globalToast.error('수정 사유를 입력해주세요.')
      return
    }

    // 변경 사항 확인
    const originalStartedMinutes = Math.floor(new Date(record.started_at).getTime() / 60000)
    const newStartedMinutes = Math.floor(new Date(modifyTime).getTime() / 60000)
    const isTimeModified = originalStartedMinutes !== newStartedMinutes
    const isStoreModified = selectedStoreId !== record.store_id

    if (!isTimeModified && !isStoreModified) {
      globalToast.error('변경된 내용이 없습니다.')
      return
    }

    setIsSubmitting(true)
    try {
      const updates: { started_at?: string; store_id?: string } = {}
      
      if (isTimeModified) {
        updates.started_at = new Date(modifyTime).toISOString()
      }
      if (isStoreModified) {
        updates.store_id = selectedStoreId
      }

      const success = await modifyAttendanceRecord(
        record.id,
        updates,
        modifyReason,
        user.id
      )

      if (success) {
        setModifyModalType(null)
        onRecordUpdate?.()
        onClose()
      }
    } catch (error: any) {
      console.error('❌ handleEditTime error:', error)
      globalToast.error(error.message || '수정에 실패했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 모달 제출 핸들러
  function handleModifySubmit() {
    switch (modifyModalType) {
      case 'break_start':
        handleBreakStart()
        break
      case 'break_end':
        handleBreakEnd()
        break
      case 'checkout':
        handleCheckout()
        break
      case 'edit_time':
        handleEditTime()
        break
    }
  }

  // 모달 설정
  const modalConfig: Record<string, { title: string; timeLabel: string; placeholder: string; showStore?: boolean }> = {
    break_start: {
      title: '휴게 시작 등록',
      timeLabel: '휴게 시작 시간',
      placeholder: '휴게 시작 등록 사유를 입력해주세요...',
    },
    break_end: {
      title: '휴게 종료 등록',
      timeLabel: '휴게 종료 시간',
      placeholder: '휴게 종료 등록 사유를 입력해주세요...',
    },
    checkout: {
      title: '퇴근 처리',
      timeLabel: '퇴근 시간',
      placeholder: '퇴근 처리 사유를 입력해주세요...',
    },
    edit_time: {
      title: '출근 정보 수정',
      timeLabel: '출근 시간',
      placeholder: '수정 사유를 입력해주세요...',
      showStore: true,
    },
  }

  if (!record) return null

  const isBreak = record.status === 'BREAK'
  const workTimeInfo = calculateWorkTime(record)
  const startTime = new Date(record.started_at)
  const currentModalConfig = modifyModalType ? modalConfig[modifyModalType] : null

  return (
    <>
    <SlideSheet
      isOpen={isOpen}
      onClose={onClose}
      title="출근 상세 정보"
      initialHeight={0.7}
      minHeight={0.4}
      maxHeight={0.9}
    >
      <div className="p-5 space-y-6">
        {/* 파트너 정보 헤더 */}
        <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-gray-50 to-gray-100 rounded-2xl">
          <Avatar
            src={record.partner_plus?.profile_image}
            alt={record.partner_plus?.name || ''}
            size="lg"
          />
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-gray-900 truncate">
              {record.partner_plus?.name || '알 수 없음'}
            </h3>
            <p className="text-sm text-gray-500">{record.store?.name}</p>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md ${
                  isBreak
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isBreak ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'
                  }`}
                />
                {isBreak ? '휴게 중' : '근무 중'}
              </span>
            </div>
          </div>
        </div>

        {/* 근무 시간 요약 */}
        <div className="grid grid-cols-2 gap-3">
          {/* 실 근무 시간 */}
          <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-emerald-600" />
              <span className="text-xs font-semibold text-emerald-700">실 근무 시간</span>
            </div>
            <p className="text-2xl font-bold text-emerald-800 tabular-nums">
              {Math.floor(workTimeInfo.actualWorkMinutes / 60)}
              <span className="text-sm font-medium text-emerald-600">h </span>
              {workTimeInfo.actualWorkMinutes % 60}
              <span className="text-sm font-medium text-emerald-600">m</span>
            </p>
          </div>

          {/* 휴게 시간 */}
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
            <div className="flex items-center gap-2 mb-2">
              <Coffee className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-semibold text-amber-700">총 휴게 시간</span>
            </div>
            <p className="text-2xl font-bold text-amber-800 tabular-nums">
              {Math.floor(workTimeInfo.breakMinutes / 60)}
              <span className="text-sm font-medium text-amber-600">h </span>
              {workTimeInfo.breakMinutes % 60}
              <span className="text-sm font-medium text-amber-600">m</span>
            </p>
          </div>
        </div>

        {/* 출근 시간 정보 */}
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">출근 시간</span>
            <span className="text-sm font-semibold text-gray-900">
              {startTime.toLocaleString('ko-KR', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
          {isBreak && record.break_started_at && (
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-200">
              <span className="text-sm text-gray-600">휴게 시작</span>
              <span className="text-sm font-semibold text-amber-600">
                {new Date(record.break_started_at).toLocaleTimeString('ko-KR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          )}
        </div>

        {/* 요청 로그 타임라인 */}
        <div className="pb-32">
          <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-500" />
            요청 기록
          </h4>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : requestLogs.length > 0 ? (
            <div className="relative">
              {/* 타임라인 라인 */}
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />

              <div className="space-y-4">
                {requestLogs.map((log, index) => {
                  const typeConfig = REQUEST_TYPE_CONFIG[log.request_type]
                  const statusConfig = STATUS_CONFIG[log.status]
                  const TypeIcon = typeConfig.icon
                  const requestedTime = new Date(log.requested_time)
                  const isTimeModified =
                    log.approved_time && log.approved_time !== log.requested_time

                  return (
                    <div key={log.id} className="relative pl-10">
                      {/* 타임라인 도트 */}
                      <div
                        className={`absolute left-2 w-5 h-5 rounded-full border-2 border-white shadow-sm flex items-center justify-center ${typeConfig.bgColor}`}
                      >
                        <TypeIcon className={`w-3 h-3 ${typeConfig.color}`} />
                      </div>

                      {/* 로그 카드 */}
                      <div className="bg-white rounded-xl p-3 border border-gray-100 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`text-sm font-semibold ${typeConfig.color}`}
                              >
                                {typeConfig.label}
                              </span>
                              <span
                                className={`text-xs font-medium px-1.5 py-0.5 rounded ${statusConfig.bgColor} ${statusConfig.color}`}
                              >
                                {statusConfig.label}
                              </span>
                            </div>

                            {/* 요청 시간 */}
                            <p className="text-xs text-gray-500 mt-1">
                              요청: {requestedTime.toLocaleTimeString('ko-KR', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                              {isTimeModified && (
                                <span className="text-amber-600 ml-2">
                                  → 승인:{' '}
                                  {new Date(log.approved_time!).toLocaleTimeString('ko-KR', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              )}
                            </p>

                            {/* 처리자 정보 */}
                            {log.processed_at && (
                              <p className="text-xs text-gray-400 mt-0.5">
                                {log.processor?.name || log.manager?.name || '매니저'}님이{' '}
                                {new Date(log.processed_at).toLocaleTimeString('ko-KR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}에 처리
                              </p>
                            )}

                            {/* 반려 사유 */}
                            {log.status === 'rejected' && log.rejection_reason && (
                              <div className="mt-2 p-2 bg-rose-50 rounded-lg border border-rose-100">
                                <div className="flex items-start gap-1.5">
                                  <AlertCircle className="w-3.5 h-3.5 text-rose-500 flex-shrink-0 mt-0.5" />
                                  <p className="text-xs text-rose-700">
                                    {log.rejection_reason}
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-xl p-6 text-center border border-gray-100">
              <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">요청 기록이 없습니다</p>
            </div>
          )}
        </div>
      </div>

      {/* 수정 모달 */}
      <Modal
        isOpen={modifyModalType !== null}
        onClose={() => {
          setModifyModalType(null)
          setModifyTime('')
          setModifyReason('')
          setSelectedStoreId('')
        }}
        title={currentModalConfig?.title || ''}
        size="sm"
      >
        <div className="space-y-4">
          {/* 파트너 정보 */}
          <div className="bg-gray-50 rounded-xl p-3">
            <div className="flex items-center gap-3">
              <Avatar
                src={record.partner_plus?.profile_image}
                alt={record.partner_plus?.name || ''}
                size="sm"
              />
              <div>
                <p className="font-semibold text-gray-900">{record.partner_plus?.name}</p>
                <p className="text-xs text-gray-500">{record.store?.name}</p>
              </div>
            </div>
          </div>

          {/* 시간 입력 */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
              <Clock className="w-4 h-4 text-gray-500" />
              {currentModalConfig?.timeLabel}
            </label>
            <DateTimePicker
              value={modifyTime}
              onChange={setModifyTime}
              className="mt-1"
            />
          </div>

          {/* 근무지 선택 (edit_time 모달에서만 표시) */}
          {currentModalConfig?.showStore && stores.length > 0 && (
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                <MapPin className="w-4 h-4 text-gray-500" />
                근무지
              </label>
              <select
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/30 focus:border-[#FE3A8F] bg-gray-50"
              >
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
              {selectedStoreId !== record?.store_id && (
                <p className="text-xs text-indigo-600 mt-1">
                  📍 근무지가 변경됩니다
                </p>
              )}
            </div>
          )}

          {/* 사유 입력 */}
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-2 block">
              수정 사유 <span className="text-rose-500">*</span>
            </label>
            <textarea
              value={modifyReason}
              onChange={(e) => setModifyReason(e.target.value)}
              placeholder={currentModalConfig?.placeholder}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/30 focus:border-[#FE3A8F] min-h-[80px] resize-none"
            />
            <p className="text-xs text-amber-600 mt-1">
              ⚠️ 수정 내역은 감사 로그에 기록됩니다
            </p>
          </div>

          {/* 버튼 */}
          <div className="flex gap-2 pt-2">
            <Button
              onClick={() => {
                setModifyModalType(null)
                setModifyTime('')
                setModifyReason('')
                setSelectedStoreId('')
              }}
              variant="ghost"
              className="flex-1"
              disabled={isSubmitting}
            >
              취소
            </Button>
            <Button
              onClick={handleModifySubmit}
              variant="primary"
              className="flex-1"
              disabled={isSubmitting || !modifyTime || !modifyReason.trim()}
            >
              {isSubmitting ? '처리 중...' : '확인'}
            </Button>
          </div>
        </div>
      </Modal>
    </SlideSheet>

    {/* 화면 하단 고정 버튼 바 (바텀시트와 별개로 Portal로 렌더링) */}
    {isOpen && createPortal(
      <div 
        className="fixed left-0 right-0 z-[10001] bg-white border-t border-gray-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px))' }}
      >
        <div className="px-5 py-4">
          {/* 파트너 정보 */}
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0 border border-gray-200">
              {record.partner_plus?.profile_image ? (
                <img 
                  src={record.partner_plus.profile_image} 
                  alt="" 
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xs font-bold text-gray-500">
                  {record.partner_plus?.name?.charAt(0) || '?'}
                </span>
              )}
            </div>
            <span className="text-sm font-bold text-gray-900 truncate">
              {record.partner_plus?.name}
            </span>
            <span className="text-xs text-gray-400 ml-auto">근태 수정</span>
          </div>
          
          {/* 버튼 그리드 */}
          <div className="flex gap-3">
            {/* 휴게 시작 등록 (근무 중일 때만) */}
            {record.status === 'WORKING' && (
              <button
                onClick={() => setModifyModalType('break_start')}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-amber-50 hover:bg-amber-100 text-amber-700 font-semibold rounded-xl border border-amber-200 transition-colors"
              >
                <Coffee className="w-5 h-5" />
                <span className="text-sm">휴게 등록</span>
              </button>
            )}
            
            {/* 휴게 종료 등록 (휴게 중일 때만) */}
            {record.status === 'BREAK' && (
              <button
                onClick={() => setModifyModalType('break_end')}
                className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-xl border border-blue-200 transition-colors"
              >
                <Check className="w-5 h-5" />
                <span className="text-sm">휴게 종료</span>
              </button>
            )}
            
            {/* 퇴근 처리 */}
            <button
              onClick={() => setModifyModalType('checkout')}
              className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-[#FE3A8F] hover:bg-[#e8357f] text-white font-semibold rounded-xl transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span className="text-sm">퇴근 처리</span>
            </button>
            
            {/* 출근 시간 수정 */}
            <button
              onClick={() => setModifyModalType('edit_time')}
              className="flex items-center justify-center py-3 px-4 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl transition-colors"
            >
              <Edit3 className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}
  </>
  )
}

