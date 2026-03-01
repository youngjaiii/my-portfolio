import { mateYouApi } from './apiClient'
import { supabase } from './supabase'
import { globalToast } from './toast'

// Timesheet 타입 정의
export type TimesheetAttendanceStatus = 'OFF' | 'WORKING' | 'BREAK'
export type TimesheetRequestType = 'WORKING' | 'BREAK' | 'BREAK_END' | 'OFF'
export type TimesheetRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type TimesheetRoleType = 'partner_plus' | 'partner_manager'
export type TimesheetAuditAction =
  // 근태 관련
  | 'attendance_request'
  | 'attendance_approve'
  | 'attendance_reject'
  | 'attendance_cancel'
  | 'attendance_create'
  | 'attendance_modify'
  | 'attendance_delete'
  // 파트너+ 관련
  | 'partner_plus_add'
  | 'partner_plus_remove'
  // 파트너 매니저 관련
  | 'partner_manager_assign'
  | 'partner_manager_unassign'
  // 가게 관련
  | 'store_create'
  | 'store_update'
  | 'store_activate'
  | 'store_deactivate'
  // 가게-매니저 관계
  | 'store_manager_add'
  | 'store_manager_remove'

export interface TimesheetStoreSchedule {
  // 평일 (월~금) 설정
  weekday_start_hour: number
  weekday_start_minute: number
  weekday_end_hour: number
  weekday_end_minute: number
  // 주말 (토~일) 설정
  weekend_start_hour: number
  weekend_start_minute: number
  weekend_end_hour: number
  weekend_end_minute: number
  // 여유 시간 설정 (분 단위)
  late_threshold_minutes: number // 지각 기준 (기본 5분)
  early_leave_threshold_minutes: number // 조기퇴근 기준 (기본 5분)
  overtime_threshold_minutes: number // 초과근무 기준 (기본 30분)
  undertime_threshold_minutes: number // 미달근무 기준 (기본 30분)
}

export interface TimesheetStore {
  id: string
  name: string
  address?: string
  phone?: string
  is_active: boolean
  created_at: string
  updated_at: string
  // 근무 스케줄 설정
  schedule?: TimesheetStoreSchedule
}

export interface TimesheetPartnerRole {
  id: string
  member_id: string
  role_type: TimesheetRoleType
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface TimesheetStoreManager {
  id: string
  store_id: string
  manager_id: string
  is_active: boolean
  created_at: string
  updated_at: string
  store?: TimesheetStore
}

export interface TimesheetAttendanceRequest {
  id: string
  partner_plus_id: string
  store_id: string
  manager_id: string
  request_type: TimesheetRequestType
  status: TimesheetRequestStatus
  requested_time: string
  requested_at: string
  approved_time?: string
  processed_at?: string
  processed_by?: string
  rejection_reason?: string
  created_at: string
  updated_at: string
  store?: TimesheetStore
  // 실제 처리자 정보 (processed_by 조인)
  processor?: {
    id: string
    name: string
    profile_image?: string
  }
  partner_plus?: {
    id: string
    name: string
    profile_image?: string
  }
  manager?: {
    id: string
    name: string
    profile_image?: string
  }
}

export interface TimesheetAttendanceRecord {
  id: string
  partner_plus_id: string
  store_id: string
  manager_id: string
  request_id?: string
  status: TimesheetAttendanceStatus
  started_at: string
  ended_at?: string
  break_started_at?: string
  break_ended_at?: string
  total_break_minutes: number // 총 휴게 시간 (분 단위)
  is_modified: boolean
  modification_reason?: string
  modified_by?: string
  modified_at?: string
  created_at: string
  updated_at: string
  store?: TimesheetStore
  partner_plus?: {
    id: string
    name: string
    profile_image?: string
  }
  break_records?: TimesheetBreakRecord[] // 연결된 휴게 기록들
}

// 개별 휴게 기록 (여러 휴게 지원)
export interface TimesheetBreakRecord {
  id: string
  attendance_record_id: string
  started_at: string
  ended_at?: string
  duration_minutes?: number
  is_deleted: boolean
  created_at: string
  updated_at: string
}

/**
 * 휴게 시간을 포함한 근무 시간 계산 결과
 */
export interface WorkTimeCalculation {
  totalMinutes: number // 총 경과 시간 (분)
  breakMinutes: number // 휴게 시간 (분)
  actualWorkMinutes: number // 실 근무 시간 (분)
  currentBreakMinutes: number // 현재 진행 중인 휴게 시간 (분, 휴게 중일 때만)
}

/**
 * 근무 시간 계산 (휴게 시간 제외)
 */
export function calculateWorkTime(record: TimesheetAttendanceRecord): WorkTimeCalculation {
  const now = Date.now()
  const startTime = new Date(record.started_at).getTime()
  const endTime = record.ended_at ? new Date(record.ended_at).getTime() : now
  
  // 총 경과 시간 (분)
  const totalMinutes = Math.floor((endTime - startTime) / (1000 * 60))
  
  // 누적된 휴게 시간 (분)
  let breakMinutes = record.total_break_minutes || 0
  
  // 현재 진행 중인 휴게 시간 계산
  let currentBreakMinutes = 0
  if (record.status === 'BREAK' && record.break_started_at) {
    const breakStartTime = new Date(record.break_started_at).getTime()
    currentBreakMinutes = Math.floor((now - breakStartTime) / (1000 * 60))
  }
  
  // 실 근무 시간 = 총 시간 - 누적 휴게 - 현재 휴게
  const actualWorkMinutes = Math.max(0, totalMinutes - breakMinutes - currentBreakMinutes)
  
  return {
    totalMinutes,
    breakMinutes: breakMinutes + currentBreakMinutes,
    actualWorkMinutes,
    currentBreakMinutes,
  }
}

/**
 * 시간을 시:분 형식으로 포맷
 */
export function formatMinutesToTime(minutes: number): { hours: number; mins: number } {
  return {
    hours: Math.floor(minutes / 60),
    mins: minutes % 60,
  }
}

export interface TimesheetAuditLog {
  id: string
  actor_id: string
  actor_role: string
  action: TimesheetAuditAction
  target_type?: string
  target_id?: string
  reason?: string
  metadata?: Record<string, any>
  created_at: string
  actor?: {
    id: string
    name: string
    profile_image?: string
  }
}

export interface TimesheetSettlement {
  id: string
  partner_plus_id: string
  store_id: string
  attendance_record_id: string
  work_date: string
  work_hours: number
  hourly_rate?: number
  total_amount?: number
  is_paid: boolean
  paid_at?: string
  notes?: string
  created_at: string
  updated_at: string
}

// API 함수들

/**
 * 사용자의 Timesheet 역할 조회
 */
export async function getTimesheetRole(
  memberId: string
): Promise<TimesheetRoleType | 'admin' | null> {
  try {
    // 먼저 admin인지 확인
    const { data: member, error: memberError } = await supabase
      .from('members')
      .select('role')
      .eq('id', memberId)
      .single()

    if (memberError) throw memberError

    if (member?.role === 'admin') {
      return 'admin'
    }

    // 모든 사용자가 timesheet 역할을 가질 수 있음 (파트너 여부와 무관)
    const { data: role, error: roleError } = await supabase
      .from('timesheet_partner_roles')
      .select('role_type')
      .eq('member_id', memberId)
      .eq('is_active', true)
      .maybeSingle()

    if (roleError) throw roleError
    return role?.role_type || null
  } catch (error) {
    console.error('❌ getTimesheetRole error:', error)
    return null
  }
}

/**
 * 파트너+의 현재 근태 상태 조회
 */
export async function getCurrentAttendanceStatus(
  partnerPlusId: string
): Promise<TimesheetAttendanceStatus> {
  try {
    const { data, error } = await supabase.rpc('get_timesheet_current_status', {
      p_partner_plus_id: partnerPlusId,
    })

    if (error) throw error
    return (data as TimesheetAttendanceStatus) || 'OFF'
  } catch (error) {
    console.error('❌ getCurrentAttendanceStatus error:', error)
    return 'OFF'
  }
}

/**
 * 승인 대기 중인 요청이 있는지 확인
 */
export async function hasPendingRequest(partnerPlusId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('has_pending_timesheet_request', {
      p_partner_plus_id: partnerPlusId,
    })

    if (error) throw error
    return data as boolean
  } catch (error) {
    console.error('❌ hasPendingRequest error:', error)
    return false
  }
}

/**
 * 파트너+의 현재 출근 기록 조회 (출근 중/휴게 중인 경우)
 */
export async function getCurrentAttendanceRecord(
  partnerPlusId: string
): Promise<TimesheetAttendanceRecord | null> {
  try {
    const { data, error } = await supabase
      .from('timesheet_attendance_records')
      .select('*, store:timesheet_stores(*)')
      .eq('partner_plus_id', partnerPlusId)
      .eq('is_deleted', false)
      .in('status', ['WORKING', 'BREAK'])
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return data || null
  } catch (error) {
    console.error('❌ getCurrentAttendanceRecord error:', error)
    return null
  }
}

/**
 * 기본 스케줄 설정 반환 (모든 매장 16:00 ~ 22:00)
 */
export function getDefaultStoreSchedule(): TimesheetStoreSchedule {
  return {
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
  }
}

/**
 * 가게 스케줄 업데이트
 */
export async function updateStoreSchedule(
  storeId: string,
  schedule: TimesheetStoreSchedule,
  adminId: string
): Promise<boolean> {
  try {
    const { data: existingStore } = await supabase
      .from('timesheet_stores')
      .select('name, schedule')
      .eq('id', storeId)
      .single()

    const { error } = await supabase
      .from('timesheet_stores')
      .update({ schedule })
      .eq('id', storeId)

    if (error) throw error

    // 감사 로그 기록
    await logAuditAction({
      actorId: adminId,
      actorRole: 'admin',
      action: 'store_update',
      targetType: 'store',
      targetId: storeId,
      metadata: {
        store_id: storeId,
        store_name: existingStore?.name,
        before: { schedule: existingStore?.schedule },
        after: { schedule },
        changes: [{ field: 'schedule', label: '근무 스케줄', before: existingStore?.schedule, after: schedule }],
      },
    })

    globalToast.success('근무 스케줄이 저장되었습니다.')
    return true
  } catch (error: any) {
    console.error('❌ updateStoreSchedule error:', error)
    globalToast.error(error.message || '스케줄 저장에 실패했습니다.')
    return false
  }
}

/**
 * 가게 목록 조회
 */
export async function getStores(
  options?: { includeInactive?: boolean }
): Promise<TimesheetStore[]> {
  try {
    let query = supabase.from('timesheet_stores').select('*').order('name')

    if (!options?.includeInactive) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('❌ getStores error:', error)
    globalToast.error('가게 목록을 불러오는데 실패했습니다.')
    return []
  }
}

/**
 * 가게에 할당된 매니저 목록 조회
 */
export async function getStoreManagers(storeId: string): Promise<
  Array<TimesheetStoreManager & {
    manager?: {
      id: string
      name: string
      profile_image?: string
    }
  }>
> {
  try {
    const { data, error } = await supabase
      .from('timesheet_store_managers')
      .select(
        '*, store:timesheet_stores(*), manager:members!timesheet_store_managers_manager_id_fkey(id, name, profile_image)'
      )
      .eq('store_id', storeId)
      .eq('is_active', true)

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('❌ getStoreManagers error:', error)
    return []
  }
}

/**
 * 근태 요청 생성
 */
export async function createAttendanceRequest(
  partnerPlusId: string,
  storeId: string,
  managerId: string,
  requestType: TimesheetRequestType,
  requestedTime: string
): Promise<TimesheetAttendanceRequest | null> {
  try {
    // 1. 서버의 현재 상태 확인 (프론트엔드 상태와 불일치 방지)
    const currentStatus = await getCurrentAttendanceStatus(partnerPlusId)
    
    // 2. 상태 전이 규칙 검증
    const isValidTransition = (() => {
      switch (requestType) {
        case 'WORKING':
          // 출근 요청: 현재 상태가 OFF여야 함
          if (currentStatus !== 'OFF') {
            return { valid: false, message: `출근 요청은 미출근 상태에서만 가능합니다. 현재 상태: ${currentStatus === 'WORKING' ? '근무 중' : currentStatus === 'BREAK' ? '휴게 중' : '알 수 없음'}` }
          }
          break
        case 'BREAK':
          // 휴게 요청: 현재 상태가 WORKING이어야 함
          if (currentStatus !== 'WORKING') {
            return { valid: false, message: `휴게 요청은 근무 중일 때만 가능합니다. 현재 상태: ${currentStatus === 'OFF' ? '미출근' : currentStatus === 'BREAK' ? '이미 휴게 중' : '알 수 없음'}` }
          }
          break
        case 'BREAK_END':
          // 휴게 해제 요청: 현재 상태가 BREAK이어야 함
          if (currentStatus !== 'BREAK') {
            return { valid: false, message: `휴게 해제 요청은 휴게 중일 때만 가능합니다. 현재 상태: ${currentStatus === 'OFF' ? '미출근' : currentStatus === 'WORKING' ? '근무 중' : '알 수 없음'}` }
          }
          break
        case 'OFF':
          // 퇴근 요청: 현재 상태가 WORKING 또는 BREAK이어야 함
          if (currentStatus !== 'WORKING' && currentStatus !== 'BREAK') {
            return { valid: false, message: `퇴근 요청은 근무 중이거나 휴게 중일 때만 가능합니다. 현재 상태: ${currentStatus === 'OFF' ? '이미 퇴근함' : '알 수 없음'}` }
          }
          break
      }
      return { valid: true }
    })()

    if (!isValidTransition.valid) {
      const errorMessage = isValidTransition.message || '잘못된 상태 전이 요청입니다.'
      globalToast.error(errorMessage)
      throw new Error(errorMessage)
    }

    // 3. 대기 중인 요청이 있는지 확인 (중복 요청 방지)
    const hasPending = await hasPendingRequest(partnerPlusId)
    if (hasPending) {
      const errorMessage = '이미 승인 대기 중인 요청이 있습니다. 요청이 처리될 때까지 기다려주세요.'
      globalToast.error(errorMessage)
      throw new Error(errorMessage)
    }

    // 4. 요청 생성
    const { data, error } = await supabase
      .from('timesheet_attendance_requests')
      .insert({
        partner_plus_id: partnerPlusId,
        store_id: storeId,
        manager_id: managerId,
        request_type: requestType,
        requested_time: requestedTime,
        status: 'pending',
      })
      .select(`
        *,
        store:timesheet_stores(name),
        partner:members!partner_plus_id(name)
      `)
      .single()

    if (error) throw error

    // 요청 타입 라벨
    const requestTypeLabels: Record<TimesheetRequestType, string> = {
      WORKING: '출근',
      BREAK: '휴게',
      BREAK_END: '휴게 해제',
      OFF: '퇴근',
    }

    // 감사 로그 기록 (이미 select에서 정보를 가져왔으므로 추가 쿼리 불필요)
    await logAuditAction({
      actorId: partnerPlusId,
      actorRole: 'partner_plus',
      action: 'attendance_request',
      targetType: 'attendance_request',
      targetId: data.id,
      metadata: {
        request: {
          id: data.id,
          request_type: requestType,
          request_type_label: requestTypeLabels[requestType],
          partner_plus_id: partnerPlusId,
          partner_plus_name: data.partner?.name,
          store_id: storeId,
          store_name: data.store?.name,
          manager_id: managerId,
          requested_time: requestedTime,
          requested_at: data.requested_at,
          status: 'pending',
        },
        // 전체 스냅샷 저장
        full_snapshot: data,
      },
    })

    // 해당 가게의 모든 매니저에게 알림 전송
    try {
      const storeManagers = await getStoreManagers(storeId)
      
      for (const manager of storeManagers) {
        try {
          await mateYouApi.push.queue({
            target_member_id: manager.manager_id,
            title: '근태 요청 알림',
            body: `${data.partner?.name || '파트너+'}님이 ${requestTypeLabels[requestType]} 요청을 보냈습니다.`,
            notification_type: 'system',
            url: '/timesheet',
            tag: `timesheet-request-${data.id}-${manager.manager_id}`,
            data: {
              request_id: data.id,
              request_type: requestType,
              partner_plus_id: partnerPlusId,
              store_id: storeId,
            },
          })
        } catch (error) {
          console.error(`❌ 매니저 ${manager.manager_id} 알림 전송 실패:`, error)
        }
      }
    } catch (error) {
      console.error('❌ 매니저 목록 조회 또는 알림 전송 실패:', error)
      // 알림 실패는 조용히 처리 (사용자 경험에 영향 없음)
    }

    globalToast.success('근태 요청이 제출되었습니다.')
    return data
  } catch (error: any) {
    console.error('❌ createAttendanceRequest error:', error)
    globalToast.error(error.message || '근태 요청 제출에 실패했습니다.')
    return null
  }
}

/**
 * 근태 요청 승인
 */
export async function approveAttendanceRequest(
  requestId: string,
  managerId: string,
  options?: {
    approvedTime?: string
    modificationReason?: string
  }
): Promise<boolean> {
  try {
    // 1. 요청 정보 먼저 조회 (알림 및 로그용)
    const { data: request, error: fetchError } = await supabase
      .from('timesheet_attendance_requests')
      .select('*, store:timesheet_stores(*), partner_plus:members!timesheet_attendance_requests_partner_plus_id_fkey(id, name)')
      .eq('id', requestId)
      .single()

    if (fetchError || !request) {
      throw new Error('요청 정보를 찾을 수 없습니다.')
    }

    // 2. RPC 함수 호출 (트랜잭션 보장)
    const { data, error } = await supabase.rpc('approve_attendance_request', {
      p_request_id: requestId,
      p_manager_id: managerId,
      p_approved_time: options?.approvedTime || null
    })

    if (error) throw error
    
    if (data && !data.success) {
      throw new Error(data.message || '요청 승인에 실패했습니다.')
    }

    // 3. modificationReason이 있는 경우 별도 처리 (기록 테이블 업데이트)
    if (options?.modificationReason && data.attendance_record_id) {
      await supabase
        .from('timesheet_attendance_records')
        .update({
          is_modified: true,
          modification_reason: options.modificationReason,
          modified_by: managerId,
          modified_at: new Date().toISOString()
        })
        .eq('id', data.attendance_record_id)
    }

    // 4. 시간 수정 여부 확인 및 푸시 알림 전송
    const isTimeModified = options?.approvedTime && options.approvedTime !== request.requested_time
    const requestTypeLabels: Record<string, string> = {
      WORKING: '출근',
      BREAK: '휴게',
      BREAK_END: '휴게 해제',
      OFF: '퇴근',
    }

    try {
      const approvedTimeStr = options?.approvedTime
        ? new Date(options.approvedTime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
        : new Date(request.requested_time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
      
      let body = `${requestTypeLabels[request.request_type] || '근태'} 요청이 승인되었습니다.`
      if (isTimeModified) {
        body = `${requestTypeLabels[request.request_type] || '근태'} 요청이 승인되었습니다. (시간: ${approvedTimeStr})`
      }

      await mateYouApi.push.queue({
        target_member_id: request.partner_plus_id,
        title: '근태 요청 승인',
        body,
        notification_type: 'system',
        url: '/timesheet',
        tag: `timesheet-approve-${requestId}`,
        data: {
          request_id: requestId,
          request_type: request.request_type,
          approved: true,
        },
      })
    } catch (pushError) {
      console.error('❌ 알림 전송 실패:', pushError)
    }

    // 감사 로그 기록
    await logAuditAction({
      actorId: managerId,
      actorRole: 'partner_manager',
      action: 'attendance_approve',
      targetType: 'attendance_request',
      targetId: requestId,
      metadata: {
        request_snapshot: request,
        approved_time: options?.approvedTime || request.requested_time,
        attendance_record_id: data.attendance_record_id,
        is_time_modified: isTimeModified,
        modification_reason: options?.modificationReason,
        processed_at: new Date().toISOString(),
      },
    })

    globalToast.success('근태 요청이 승인되었습니다.')
    return true
  } catch (error: any) {
    console.error('❌ approveAttendanceRequest error:', error)
    globalToast.error(error.message || '요청 승인에 실패했습니다.')
    return false
  }
}

/**
 * 근태 요청 반려
 */
export async function rejectAttendanceRequest(
  requestId: string,
  managerId: string,
  rejectionReason: string
): Promise<boolean> {
  try {
    // RPC 함수 호출 (트랜잭션 보장)
    const { data, error } = await supabase.rpc('reject_attendance_request', {
      p_request_id: requestId,
      p_manager_id: managerId,
      p_rejection_reason: rejectionReason
    })

    if (error) throw error

    if (data && !data.success) {
      throw new Error(data.message || '요청 반려에 실패했습니다.')
    }

    // 파트너+ 정보 조회 (알림용)
    const { data: requestInfo } = await supabase
      .from('timesheet_attendance_requests')
      .select('partner_plus_id, request_type')
      .eq('id', requestId)
      .single()

    // 파트너+에게 알림 전송
    if (requestInfo) {
      try {
        const requestTypeLabels: Record<TimesheetRequestType, string> = {
          WORKING: '출근',
          BREAK: '휴게',
          BREAK_END: '휴게 해제',
          OFF: '퇴근',
        }

        await mateYouApi.push.queue({
          target_member_id: requestInfo.partner_plus_id,
          title: '근태 요청 반려',
          body: `${requestTypeLabels[requestInfo.request_type as TimesheetRequestType]} 요청이 반려되었습니다. 사유: ${rejectionReason}`,
          notification_type: 'system',
          url: '/timesheet',
          tag: `timesheet-reject-${requestId}`,
          data: {
            request_id: requestId,
            request_type: requestInfo.request_type,
            approved: false,
          },
        })
      } catch (error) {
        console.error('❌ 알림 전송 실패:', error)
      }
    }

    globalToast.success('근태 요청이 반려되었습니다.')

    // 감사 로그 기록
    await logAuditAction({
      actorId: managerId,
      actorRole: 'partner_manager',
      action: 'attendance_reject',
      targetType: 'attendance_request',
      targetId: requestId,
      reason: rejectionReason,
      metadata: {
        request_id: requestId,
        rejection_reason: rejectionReason,
        processed_at: new Date().toISOString(),
      },
    })

    return true
  } catch (error: any) {
    console.error('❌ rejectAttendanceRequest error:', error)
    globalToast.error(error.message || '요청 반려에 실패했습니다.')
    return false
  }
}

/**
 * 근태 요청 취소 (파트너+가 자신의 요청 취소)
 */
export async function cancelAttendanceRequest(
  requestId: string,
  partnerPlusId: string
): Promise<boolean> {
  try {
    // 요청 정보 조회 및 권한 확인
    const { data: request, error: requestError } = await supabase
      .from('timesheet_attendance_requests')
      .select('*, store:timesheet_stores(*), manager:members!timesheet_attendance_requests_manager_id_fkey(id, name)')
      .eq('id', requestId)
      .single()

    if (requestError) throw requestError
    if (!request) throw new Error('요청을 찾을 수 없습니다.')

    // 본인의 요청인지 확인
    if (request.partner_plus_id !== partnerPlusId) {
      throw new Error('본인의 요청만 취소할 수 있습니다.')
    }

    // pending 상태인지 확인
    if (request.status !== 'pending') {
      throw new Error('대기 중인 요청만 취소할 수 있습니다.')
    }

    const { error } = await supabase
      .from('timesheet_attendance_requests')
      .update({
        status: 'cancelled',
        processed_at: new Date().toISOString(),
        processed_by: partnerPlusId,
        rejection_reason: '사용자에 의해 취소됨',
      })
      .eq('id', requestId)

    if (error) throw error

    // 요청 타입 라벨
    const requestTypeLabels: Record<TimesheetRequestType, string> = {
      WORKING: '출근',
      BREAK: '휴게',
      BREAK_END: '휴게 해제',
      OFF: '퇴근',
    }

    // 파트너+ 정보 조회
    const { data: partnerInfo } = await supabase
      .from('members')
      .select('name')
      .eq('id', partnerPlusId)
      .single()

    // 요청 시간과 취소 시간의 차이 계산
    const requestTime = new Date(request.requested_at).getTime()
    const cancelTime = new Date().getTime()
    const cancelDelayMinutes = Math.floor((cancelTime - requestTime) / (1000 * 60))

    // 감사 로그 기록 (상세 정보 포함)
    await logAuditAction({
      actorId: partnerPlusId,
      actorRole: 'partner_plus',
      action: 'attendance_cancel',
      targetType: 'attendance_request',
      targetId: requestId,
      reason: '사용자에 의해 취소됨',
      metadata: {
        request_snapshot: request,
        partner_plus_name: partnerInfo?.name,
        cancelled_at: new Date().toISOString(),
        cancel_delay_minutes: cancelDelayMinutes,
        reason: '사용자에 의해 취소됨',
      },
    })

    globalToast.success('요청이 취소되었습니다.')
    return true
  } catch (error: any) {
    console.error('❌ cancelAttendanceRequest error:', error)
    globalToast.error(error.message || '요청 취소에 실패했습니다.')
    return false
  }
}

/**
 * 파트너+의 대기 중인 요청 조회
 */
export async function getMyPendingRequest(
  partnerPlusId: string
): Promise<TimesheetAttendanceRequest | null> {
  try {
    const { data, error } = await supabase
      .from('timesheet_attendance_requests')
      .select(
        '*, store:timesheet_stores(*), manager:members!timesheet_attendance_requests_manager_id_fkey(id, name, profile_image)'
      )
      .eq('partner_plus_id', partnerPlusId)
      .eq('status', 'pending')
      .order('requested_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return data || null
  } catch (error) {
    console.error('❌ getMyPendingRequest error:', error)
    return null
  }
}

/**
 * 파트너+의 최근 반려된 요청 조회 (24시간 이내)
 */
export async function getMyRecentRejectedRequest(
  partnerPlusId: string
): Promise<TimesheetAttendanceRequest | null> {
  try {
    const oneDayAgo = new Date()
    oneDayAgo.setHours(oneDayAgo.getHours() - 24)

    const { data, error } = await supabase
      .from('timesheet_attendance_requests')
      .select(
        '*, store:timesheet_stores(*), manager:members!timesheet_attendance_requests_manager_id_fkey(id, name, profile_image)'
      )
      .eq('partner_plus_id', partnerPlusId)
      .eq('status', 'rejected')
      .gte('processed_at', oneDayAgo.toISOString())
      .order('processed_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) throw error
    return data || null
  } catch (error) {
    console.error('❌ getMyRecentRejectedRequest error:', error)
    return null
  }
}

/**
 * 승인 대기 중인 요청 목록 조회
 * - 어드민(managerId 없음): 모든 요청 조회
 * - 파트너 매니저: 본인이 할당된 가게의 요청만 조회 (store_id 기반 필터)
 */
export async function getPendingRequests(
  managerId?: string
): Promise<TimesheetAttendanceRequest[]> {
  try {
    console.log('📋 getPendingRequests called with managerId:', managerId)
    
    // 매니저인 경우 본인이 할당된 가게 목록 조회
    let assignedStoreIds: string[] = []
    if (managerId) {
      const { data: storeManagers, error: storeError } = await supabase
        .from('timesheet_store_managers')
        .select('store_id')
        .eq('manager_id', managerId)
        .eq('is_active', true)

      if (storeError) throw storeError
      assignedStoreIds = (storeManagers || []).map((sm) => sm.store_id)
      console.log('📋 assignedStoreIds:', assignedStoreIds)

      // 할당된 가게가 없으면 빈 배열 반환
      if (assignedStoreIds.length === 0) {
        console.log('📋 No assigned stores, returning empty array')
        return []
      }
    }

    let query = supabase
      .from('timesheet_attendance_requests')
      .select(
        '*, store:timesheet_stores(*), partner_plus:members!timesheet_attendance_requests_partner_plus_id_fkey(id, name, profile_image), manager:members!timesheet_attendance_requests_manager_id_fkey(id, name, profile_image)'
      )
      .eq('status', 'pending')
      .order('requested_at', { ascending: false })

    // 파트너 매니저인 경우 할당된 가게의 요청만 필터링
    if (managerId && assignedStoreIds.length > 0) {
      query = query.in('store_id', assignedStoreIds)
    }

    const { data, error } = await query

    console.log('📋 getPendingRequests result:', data?.length, 'requests')

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('❌ getPendingRequests error:', error)
    return []
  }
}

/**
 * 현재 출근 중인 파트너+ 목록 조회
 * - 어드민(managerId 없음): 모든 가게의 출근자 조회
 * - 파트너 매니저: 본인이 매니저인 가게의 출근자만 조회
 */
export async function getWorkingPartners(
  managerId?: string
): Promise<TimesheetAttendanceRecord[]> {
  try {
    console.log('👥 getWorkingPartners called with managerId:', managerId)
    
    // 매니저인 경우 본인이 할당된 가게 목록 조회
    let assignedStoreIds: string[] = []
    if (managerId) {
      const { data: storeManagers, error: storeError } = await supabase
        .from('timesheet_store_managers')
        .select('store_id')
        .eq('manager_id', managerId)
        .eq('is_active', true)

      if (storeError) throw storeError
      assignedStoreIds = (storeManagers || []).map((sm) => sm.store_id)
      console.log('👥 assignedStoreIds:', assignedStoreIds)

      // 할당된 가게가 없으면 빈 배열 반환
      if (assignedStoreIds.length === 0) {
        console.log('👥 No assigned stores, returning empty array')
        return []
      }
    }

    let query = supabase
      .from('timesheet_attendance_records')
      .select(
        '*, store:timesheet_stores(*), partner_plus:members!timesheet_attendance_records_partner_plus_id_fkey(id, name, profile_image)'
      )
      .eq('is_deleted', false)
      .in('status', ['WORKING', 'BREAK'])
      .is('ended_at', null)
      .order('started_at', { ascending: false })

    // 매니저인 경우 할당된 가게의 출근자만 필터링
    if (managerId && assignedStoreIds.length > 0) {
      query = query.in('store_id', assignedStoreIds)
    }

    const { data, error } = await query

    console.log('👥 getWorkingPartners result:', data?.length, 'partners')

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('❌ getWorkingPartners error:', error)
    return []
  }
}

/**
 * 파트너+의 근태 이력 조회
 */
export async function getAttendanceHistory(
  partnerPlusId: string,
  limit = 30
): Promise<TimesheetAttendanceRecord[]> {
  try {
    const { data, error } = await supabase
      .from('timesheet_attendance_records')
      .select('*, store:timesheet_stores(*)')
      .eq('partner_plus_id', partnerPlusId)
      .eq('is_deleted', false)
      .order('started_at', { ascending: false })
      .limit(limit)

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('❌ getAttendanceHistory error:', error)
    return []
  }
}

/**
 * 특정 출근 기록에 연결된 요청 로그 조회
 */
export async function getAttendanceRequestLogs(
  recordId: string
): Promise<TimesheetAttendanceRequest[]> {
  try {
    // 먼저 해당 출근 기록의 partner_plus_id 조회
    const { data: record, error: recordError } = await supabase
      .from('timesheet_attendance_records')
      .select('partner_plus_id, started_at, ended_at')
      .eq('id', recordId)
      .eq('is_deleted', false)
      .single()

    if (recordError) throw recordError
    if (!record) return []

    // 해당 파트너의 요청 중 해당 출근 기간에 해당하는 요청들 조회
    // manager: 요청 대상 매니저, processor: 실제 처리한 사람
    let query = supabase
      .from('timesheet_attendance_requests')
      .select(
        '*, store:timesheet_stores(*), manager:members!timesheet_attendance_requests_manager_id_fkey(id, name, profile_image), processor:members!timesheet_attendance_requests_processed_by_fkey(id, name, profile_image)'
      )
      .eq('partner_plus_id', record.partner_plus_id)
      .gte('requested_time', record.started_at)
      .order('requested_time', { ascending: true })

    // ended_at이 있으면 해당 시간까지만, 없으면 현재 진행 중인 출근
    if (record.ended_at) {
      query = query.lte('requested_time', record.ended_at)
    }

    const { data, error } = await query

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('❌ getAttendanceRequestLogs error:', error)
    return []
  }
}

/**
 * 출근 기록에 연결된 휴게 기록들 조회
 */
export async function getBreakRecords(
  attendanceRecordId: string
): Promise<TimesheetBreakRecord[]> {
  try {
    const { data, error } = await supabase
      .from('timesheet_break_records')
      .select('*')
      .eq('attendance_record_id', attendanceRecordId)
      .eq('is_deleted', false)
      .order('started_at', { ascending: true })

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('❌ getBreakRecords error:', error)
    return []
  }
}

/**
 * 감사 로그 조회
 */
export async function getAuditLogs(
  options?: {
    limit?: number
    actorId?: string
    action?: TimesheetAuditAction
    actorRole?: string
    startDate?: string
    endDate?: string
    searchQuery?: string
    storeId?: string
    partnerPlusId?: string
    offset?: number
  }
): Promise<TimesheetAuditLog[]> {
  try {
    let query = supabase
      .from('timesheet_audit_logs')
      .select('*, actor:members!timesheet_audit_logs_actor_id_fkey(id, name, profile_image)')
      .order('created_at', { ascending: false })

    if (options?.limit !== undefined) {
      const from = options.offset || 0
      const to = from + options.limit - 1
      query = query.range(from, to)
    }

    if (options?.actorId) {
      query = query.eq('actor_id', options.actorId)
    }

    if (options?.action) {
      query = query.eq('action', options.action)
    }

    if (options?.actorRole) {
      query = query.eq('actor_role', options.actorRole)
    }

    // 한국 시간(KST, UTC+9) 기준으로 날짜 필터링
    if (options?.startDate) {
      const startDateKST = new Date(`${options.startDate}T00:00:00+09:00`)
      query = query.gte('created_at', startDateKST.toISOString())
    }

    if (options?.endDate) {
      // endDate의 23:59:59까지 포함
      const endDateKST = new Date(`${options.endDate}T23:59:59+09:00`)
      query = query.lte('created_at', endDateKST.toISOString())
    }

    // storeId 필터 (metadata에서)
    if (options?.storeId) {
      query = query.eq('metadata->>store_id', options.storeId)
    }

    // partnerPlusId 필터 (metadata에서)
    if (options?.partnerPlusId) {
      query = query.eq('metadata->>partner_plus_id', options.partnerPlusId)
    }

    const { data, error } = await query

    if (error) throw error

    let logs = data || []

    // 검색어 필터 (클라이언트 사이드에서 수행 - metadata JSONB 검색)
    if (options?.searchQuery) {
      const searchTerm = options.searchQuery.toLowerCase()
      logs = logs.filter((log) => {
        // actor 이름 검색
        if (log.actor?.name?.toLowerCase().includes(searchTerm)) {
          return true
        }
        // metadata에서 검색
        if (log.metadata) {
          const metadataStr = JSON.stringify(log.metadata).toLowerCase()
          if (metadataStr.includes(searchTerm)) {
            return true
          }
        }
        // reason 검색
        if (log.reason?.toLowerCase().includes(searchTerm)) {
          return true
        }
        return false
      })
    }

    return logs
  } catch (error) {
    console.error('❌ getAuditLogs error:', error)
    return []
  }
}

/**
 * 감사 로그 기록
 */
export async function logAuditAction(params: {
  actorId: string
  actorRole: string
  action: TimesheetAuditAction
  targetType?: string
  targetId?: string
  reason?: string
  metadata?: Record<string, any>
}): Promise<void> {
  try {
    const { error } = await supabase.from('timesheet_audit_logs').insert({
      actor_id: params.actorId,
      actor_role: params.actorRole,
      action: params.action,
      target_type: params.targetType,
      target_id: params.targetId,
      reason: params.reason,
      metadata: params.metadata,
    })

    if (error) {
      console.error('❌ logAuditAction error:', error)
      // 감사 로그 실패는 조용히 처리 (사용자에게 노출하지 않음)
    }
  } catch (error) {
    console.error('❌ logAuditAction error:', error)
  }
}

/**
 * 파트너+ 목록 조회 (매니저용)
 */
export async function getPartnerPlusList(managerId: string): Promise<
  Array<{
    id: string
    name: string
    profile_image?: string
    current_status: TimesheetAttendanceStatus
  }>
> {
  try {
    // 매니저가 관리하는 가게의 파트너+ 조회
    const { data: requests, error } = await supabase
      .from('timesheet_attendance_requests')
      .select('partner_plus_id, partner_plus:members!timesheet_attendance_requests_partner_plus_id_fkey(id, name, profile_image)')
      .eq('manager_id', managerId)
      .order('requested_at', { ascending: false })

    if (error) throw error

    // 고유 파트너 ID 목록 추출
    const uniquePartnerIds = [...new Set((requests || []).map((r) => r.partner_plus_id))]

    if (uniquePartnerIds.length === 0) {
      return []
    }

    // 현재 출근 중인 기록을 한 번에 조회
    const { data: activeRecords, error: recordsError } = await supabase
      .from('timesheet_attendance_records')
      .select('partner_plus_id, status')
      .in('partner_plus_id', uniquePartnerIds)
      .eq('is_deleted', false)
      .is('ended_at', null)
      .in('status', ['WORKING', 'BREAK'])

    if (recordsError) throw recordsError

    // 파트너별 현재 상태 맵 생성
    const statusMap = new Map<string, TimesheetAttendanceStatus>()
    for (const record of activeRecords || []) {
      statusMap.set(record.partner_plus_id, record.status as TimesheetAttendanceStatus)
    }

    // 중복 제거 및 결과 생성
    const uniquePartners = new Map<string, any>()
    for (const req of requests || []) {
      if (req.partner_plus && !uniquePartners.has(req.partner_plus_id)) {
        uniquePartners.set(req.partner_plus_id, {
          id: req.partner_plus.id,
          name: req.partner_plus.name,
          profile_image: req.partner_plus.profile_image,
          current_status: statusMap.get(req.partner_plus_id) || 'OFF',
        })
      }
    }

    return Array.from(uniquePartners.values())
  } catch (error) {
    console.error('❌ getPartnerPlusList error:', error)
    return []
  }
}

/**
 * 가게 생성
 */
export async function createStore(
  name: string,
  address?: string,
  phone?: string,
  adminId: string
): Promise<TimesheetStore | null> {
  try {
    const { data, error } = await supabase
      .from('timesheet_stores')
      .insert({
        name,
        address,
        phone,
        is_active: true,
      })
      .select()
      .single()

    if (error) throw error

    // 감사 로그 기록 (상세 정보 포함)
    await logAuditAction({
      actorId: adminId,
      actorRole: 'admin',
      action: 'store_create',
      targetType: 'store',
      targetId: data.id,
      metadata: {
        store: data,
        full_snapshot: data,
        created_at: data.created_at,
      },
    })

    globalToast.success('가게가 생성되었습니다.')
    return data
  } catch (error: any) {
    console.error('❌ createStore error:', error)
    globalToast.error(error.message || '가게 생성에 실패했습니다.')
    return null
  }
}

/**
 * 가게 수정
 */
export async function updateStore(
  storeId: string,
  updates: {
    name?: string
    address?: string
    phone?: string
    schedule?: Partial<TimesheetStoreSchedule>
  },
  adminId: string
): Promise<boolean> {
  try {
    // 기존 가게 정보 조회 (상세 로그용)
    const { data: existingStore } = await supabase
      .from('timesheet_stores')
      .select('name, address, phone, schedule')
      .eq('id', storeId)
      .single()

    const { error } = await supabase
      .from('timesheet_stores')
      .update(updates)
      .eq('id', storeId)

    if (error) throw error

    // 변경된 필드만 기록
    const changes: Array<{ field: string; label: string; before: any; after: any }> = []
    if (updates.name !== undefined && updates.name !== existingStore?.name) {
      changes.push({ field: 'name', label: '가게명', before: existingStore?.name, after: updates.name })
    }
    if (updates.address !== undefined && updates.address !== existingStore?.address) {
      changes.push({ field: 'address', label: '주소', before: existingStore?.address || '(없음)', after: updates.address || '(없음)' })
    }
    if (updates.phone !== undefined && updates.phone !== existingStore?.phone) {
      changes.push({ field: 'phone', label: '전화번호', before: existingStore?.phone || '(없음)', after: updates.phone || '(없음)' })
    }
    if (updates.schedule !== undefined) {
      changes.push({ field: 'schedule', label: '근무 스케줄', before: '(변경됨)', after: '(변경됨)' })
    }

    // 감사 로그 기록 (상세 정보 포함)
    await logAuditAction({
      actorId: adminId,
      actorRole: 'admin',
      action: 'store_update',
      targetType: 'store',
      targetId: storeId,
      metadata: {
        store_id: storeId,
        store_name: updates.name || existingStore?.name,
        before: existingStore,
        after: { ...existingStore, ...updates },
        changes,
      },
    })

    globalToast.success('가게 정보가 수정되었습니다.')
    return true
  } catch (error: any) {
    console.error('❌ updateStore error:', error)
    globalToast.error(error.message || '가게 수정에 실패했습니다.')
    return false
  }
}

/**
 * 가게 비활성화/활성화
 */
export async function toggleStoreStatus(
  storeId: string,
  isActive: boolean,
  adminId: string
): Promise<boolean> {
  try {
    // 기존 가게 정보 조회 (상세 로그용)
    const { data: existingStore } = await supabase
      .from('timesheet_stores')
      .select('name, is_active')
      .eq('id', storeId)
      .single()

    const { error } = await supabase
      .from('timesheet_stores')
      .update({ is_active: isActive })
      .eq('id', storeId)

    if (error) throw error

    // 감사 로그 기록 (상세 정보 포함)
    await logAuditAction({
      actorId: adminId,
      actorRole: 'admin',
      action: isActive ? 'store_activate' : 'store_deactivate',
      targetType: 'store',
      targetId: storeId,
      metadata: {
        store_id: storeId,
        store_name: existingStore?.name,
        before: existingStore,
        after: { ...existingStore, is_active: isActive },
        changes: [{
          field: 'is_active',
          label: '활성 상태',
          before: existingStore?.is_active ? '활성' : '비활성',
          after: isActive ? '활성' : '비활성',
        }],
      },
    })

    globalToast.success(isActive ? '가게가 활성화되었습니다.' : '가게가 비활성화되었습니다.')
    return true
  } catch (error: any) {
    console.error('❌ toggleStoreStatus error:', error)
    globalToast.error(error.message || '가게 상태 변경에 실패했습니다.')
    return false
  }
}

/**
 * 매니저 지정
 */
export async function assignManager(
  memberId: string,
  adminId: string
): Promise<boolean> {
  try {
    // 이미 매니저인지 확인 (is_active와 관계없이)
    const { data: existingRole } = await supabase
      .from('timesheet_partner_roles')
      .select('id, is_active, role_type')
      .eq('member_id', memberId)
      .eq('role_type', 'partner_manager')
      .maybeSingle()

    if (existingRole) {
      if (existingRole.is_active) {
        globalToast.error('이미 매니저로 지정되어 있습니다.')
        return false
      } else {
        // 비활성화된 역할이 있으면 활성화
        const { error } = await supabase
          .from('timesheet_partner_roles')
          .update({ is_active: true })
          .eq('id', existingRole.id)

        if (error) throw error

        // 회원 정보 조회 (상세 로그용)
        const { data: memberInfo } = await supabase
          .from('members')
          .select('name, email, role')
          .eq('id', memberId)
          .single()

        // 감사 로그 기록 (상세 정보 포함)
        await logAuditAction({
          actorId: adminId,
          actorRole: 'admin',
          action: 'partner_manager_assign',
          targetType: 'member',
          targetId: memberId,
          metadata: {
            member: memberInfo,
            role_before: existingRole,
            role_after: { ...existingRole, is_active: true },
            is_reactivation: true,
            changes: [{
              field: 'partner_manager',
              label: '파트너 매니저 할당',
              before: '비활성',
              after: memberInfo?.name,
            }],
          },
        })

        globalToast.success('매니저가 지정되었습니다.')
        return true
      }
    }

    // 다른 역할이 있는지 확인 (unique constraint 때문에)
    const { data: otherRole } = await supabase
      .from('timesheet_partner_roles')
      .select('id, role_type, is_active')
      .eq('member_id', memberId)
      .maybeSingle()

    if (otherRole) {
      // 다른 역할이 있으면 업데이트
      const { error } = await supabase
        .from('timesheet_partner_roles')
        .update({
          role_type: 'partner_manager',
          is_active: true,
        })
        .eq('id', otherRole.id)

      if (error) throw error
    } else {
      // 역할 생성
      const { error } = await supabase.from('timesheet_partner_roles').insert({
        member_id: memberId,
        role_type: 'partner_manager',
        is_active: true,
      })

      if (error) throw error
    }

    // 회원 정보 조회 (상세 로그용)
    const { data: memberInfo } = await supabase
      .from('members')
      .select('name, email, role')
      .eq('id', memberId)
      .single()

    // 역할 변경 라벨
    const roleTypeLabels: Record<string, string> = {
      partner_plus: '파트너+',
      partner_manager: '파트너 매니저',
    }

    // 감사 로그 기록 (상세 정보 포함)
    await logAuditAction({
      actorId: adminId,
      actorRole: 'admin',
      action: 'partner_manager_assign',
      targetType: 'member',
      targetId: memberId,
      metadata: {
        member: memberInfo,
        role_before: otherRole,
        role_after: { member_id: memberId, role_type: 'partner_manager', is_active: true },
        is_role_change: !!otherRole,
        changes: [{
          field: 'partner_manager',
          label: '파트너 매니저 할당',
          before: otherRole ? roleTypeLabels[otherRole.role_type] || otherRole.role_type : null,
          after: memberInfo?.name,
        }],
      },
    })

    globalToast.success('매니저가 지정되었습니다.')
    return true
  } catch (error: any) {
    console.error('❌ assignManager error:', error)
    if (error.code === '23505') {
      // Unique constraint 에러
      globalToast.error('이미 다른 역할로 등록되어 있습니다.')
    } else {
      globalToast.error(error.message || '매니저 지정에 실패했습니다.')
    }
    return false
  }
}

/**
 * 매니저 해제
 */
export async function unassignManager(
  memberId: string,
  adminId: string
): Promise<boolean> {
  try {
    // 회원 정보 조회 (상세 로그용)
    const { data: memberInfo } = await supabase
      .from('members')
      .select('name, email, role')
      .eq('id', memberId)
      .single()

    const { error } = await supabase
      .from('timesheet_partner_roles')
      .update({ is_active: false })
      .eq('member_id', memberId)
      .eq('role_type', 'partner_manager')

    if (error) throw error

    // 감사 로그 기록 (상세 정보 포함)
    await logAuditAction({
      actorId: adminId,
      actorRole: 'admin',
      action: 'partner_manager_unassign',
      targetType: 'member',
      targetId: memberId,
      metadata: {
        member: memberInfo,
        changes: [{
          field: 'partner_manager',
          label: '파트너 매니저 해제',
          before: memberInfo?.name,
          after: null,
        }],
      },
    })

    globalToast.success('매니저가 해제되었습니다.')
    return true
  } catch (error: any) {
    console.error('❌ unassignManager error:', error)
    globalToast.error(error.message || '매니저 해제에 실패했습니다.')
    return false
  }
}

/**
 * 가게에 매니저 할당
 */
export async function assignStoreManager(
  storeId: string,
  managerId: string,
  adminId: string
): Promise<boolean> {
  try {
    // 이미 할당된 관계가 있는지 확인
    const { data: existing, error: checkError } = await supabase
      .from('timesheet_store_managers')
      .select('id, is_active')
      .eq('store_id', storeId)
      .eq('manager_id', managerId)
      .maybeSingle()

    if (checkError && checkError.code !== 'PGRST116') {
      // PGRST116은 "no rows returned" 에러이므로 무시
      throw checkError
    }

    if (existing) {
      // 이미 존재하는 경우 활성화
      if (existing.is_active) {
        globalToast.error('이미 해당 가게에 매니저가 할당되어 있습니다.')
        return false
      }

      const { error: updateError } = await supabase
        .from('timesheet_store_managers')
        .update({ is_active: true })
        .eq('id', existing.id)

      if (updateError) throw updateError

      // 가게 및 매니저 정보 조회 (상세 로그용)
      const { data: storeInfo } = await supabase
        .from('timesheet_stores')
        .select('name')
        .eq('id', storeId)
        .single()

      const { data: managerInfo } = await supabase
        .from('members')
        .select('name')
        .eq('id', managerId)
        .single()

      // 감사 로그 기록 (상세 정보 포함)
      await logAuditAction({
        actorId: adminId,
        actorRole: 'admin',
        action: 'store_manager_add',
        targetType: 'store_manager',
        targetId: existing.id,
        metadata: {
          store: storeInfo,
          manager: managerInfo,
          assignment_before: existing,
          assignment_after: { ...existing, is_active: true },
          is_reactivation: true,
          changes: [{
            field: 'manager',
            label: '매니저 추가',
            before: null,
            after: managerInfo?.name,
          }],
        },
      })

      globalToast.success('매니저가 가게에 할당되었습니다.')
      return true
    }

    // 새로 생성
    const { data: newAssignment, error: insertError } = await supabase
      .from('timesheet_store_managers')
      .insert({
        store_id: storeId,
        manager_id: managerId,
        is_active: true,
      })
      .select()
      .single()

    if (insertError) throw insertError

    // 가게 및 매니저 정보 조회 (상세 로그용)
    const { data: storeInfo } = await supabase
      .from('timesheet_stores')
      .select('name')
      .eq('id', storeId)
      .single()

    const { data: managerInfo } = await supabase
      .from('members')
      .select('name')
      .eq('id', managerId)
      .single()

    // 감사 로그 기록 (상세 정보 포함)
    await logAuditAction({
      actorId: adminId,
      actorRole: 'admin',
      action: 'store_manager_add',
      targetType: 'store_manager',
      targetId: newAssignment.id,
      metadata: {
        store_id: storeId,
        store_name: storeInfo?.name,
        manager_id: managerId,
        manager_name: managerInfo?.name,
        is_new_assignment: true,
        changes: [{
          field: 'manager',
          label: '매니저 추가',
          before: null,
          after: managerInfo?.name,
        }],
      },
    })

    globalToast.success('매니저가 가게에 할당되었습니다.')
    return true
  } catch (error: any) {
    console.error('❌ assignStoreManager error:', error)
    if (error.code === '23505') {
      // Unique constraint 에러
      globalToast.error('이미 해당 가게에 매니저가 할당되어 있습니다.')
    } else {
      globalToast.error(error.message || '매니저 할당에 실패했습니다.')
    }
    return false
  }
}

/**
 * 가게에서 매니저 제거
 */
export async function unassignStoreManager(
  storeId: string,
  managerId: string,
  adminId: string
): Promise<boolean> {
  try {
    // 가게 및 매니저 정보 조회 (상세 로그용)
    const { data: storeInfo } = await supabase
      .from('timesheet_stores')
      .select('name')
      .eq('id', storeId)
      .single()

    const { data: managerInfo } = await supabase
      .from('members')
      .select('name')
      .eq('id', managerId)
      .single()

    const { data: assignment } = await supabase
      .from('timesheet_store_managers')
      .select('id')
      .eq('store_id', storeId)
      .eq('manager_id', managerId)
      .single()

    const { error } = await supabase
      .from('timesheet_store_managers')
      .update({ is_active: false })
      .eq('store_id', storeId)
      .eq('manager_id', managerId)

    if (error) throw error

    // 감사 로그 기록 (상세 정보 포함)
    await logAuditAction({
      actorId: adminId,
      actorRole: 'admin',
      action: 'store_manager_remove',
      targetType: 'store_manager',
      targetId: assignment?.id,
      metadata: {
        store: storeInfo,
        manager: managerInfo,
        assignment_id: assignment?.id,
        changes: [{
          field: 'manager',
          label: '매니저 제거',
          before: managerInfo?.name,
          after: null,
        }],
      },
    })

    globalToast.success('매니저가 가게에서 제거되었습니다.')
    return true
  } catch (error: any) {
    console.error('❌ unassignStoreManager error:', error)
    globalToast.error(error.message || '매니저 제거에 실패했습니다.')
    return false
  }
}

/**
 * 파트너+ 추가
 */
export async function addPartnerPlus(
  memberId: string,
  adminId: string
): Promise<boolean> {
  try {
    // 이미 파트너+인지 확인 (is_active와 관계없이)
    const { data: existingRole } = await supabase
      .from('timesheet_partner_roles')
      .select('id, is_active, role_type')
      .eq('member_id', memberId)
      .eq('role_type', 'partner_plus')
      .maybeSingle()

    if (existingRole) {
      if (existingRole.is_active) {
        globalToast.error('이미 파트너+로 등록되어 있습니다.')
        return false
      } else {
        // 비활성화된 역할이 있으면 활성화
        const { error } = await supabase
          .from('timesheet_partner_roles')
          .update({ is_active: true })
          .eq('id', existingRole.id)

        if (error) throw error

        // 회원 정보 조회 (상세 로그용)
        const { data: memberInfo } = await supabase
          .from('members')
          .select('name, email, role')
          .eq('id', memberId)
          .single()

        // 감사 로그 기록 (상세 정보 포함)
        await logAuditAction({
          actorId: adminId,
          actorRole: 'admin',
          action: 'partner_plus_add',
          targetType: 'member',
          targetId: memberId,
          metadata: {
            member: memberInfo,
            role_before: existingRole,
            role_after: { ...existingRole, is_active: true },
            is_reactivation: true,
            changes: [{
              field: 'partner_plus',
              label: '파트너+ 추가',
              before: '비활성',
              after: memberInfo?.name,
            }],
          },
        })

        globalToast.success('파트너+가 추가되었습니다.')
        return true
      }
    }

    // 다른 역할이 있는지 확인 (unique constraint 때문에)
    const { data: otherRole } = await supabase
      .from('timesheet_partner_roles')
      .select('id, role_type, is_active')
      .eq('member_id', memberId)
      .maybeSingle()

    if (otherRole) {
      // 다른 역할이 있으면 업데이트
      const { error } = await supabase
        .from('timesheet_partner_roles')
        .update({
          role_type: 'partner_plus',
          is_active: true,
        })
        .eq('id', otherRole.id)

      if (error) throw error
    } else {
      // 역할 생성
      const { error } = await supabase.from('timesheet_partner_roles').insert({
        member_id: memberId,
        role_type: 'partner_plus',
        is_active: true,
      })

      if (error) throw error
    }

    // 회원 정보 조회 (상세 로그용)
    const { data: memberInfo } = await supabase
      .from('members')
      .select('name, email, role')
      .eq('id', memberId)
      .single()

    // 역할 변경 라벨
    const roleTypeLabels: Record<string, string> = {
      partner_plus: '파트너+',
      partner_manager: '파트너 매니저',
    }

    // 감사 로그 기록 (상세 정보 포함)
    await logAuditAction({
      actorId: adminId,
      actorRole: 'admin',
      action: 'partner_plus_add',
      targetType: 'member',
      targetId: memberId,
      metadata: {
        member: memberInfo,
        role_before: otherRole,
        role_after: { member_id: memberId, role_type: 'partner_plus', is_active: true },
        is_role_change: !!otherRole,
        changes: [{
          field: 'partner_plus',
          label: '파트너+ 추가',
          before: otherRole ? roleTypeLabels[otherRole.role_type] || otherRole.role_type : null,
          after: memberInfo?.name,
        }],
      },
    })

    globalToast.success('파트너+가 추가되었습니다.')
    return true
  } catch (error: any) {
    console.error('❌ addPartnerPlus error:', error)
    if (error.code === '23505') {
      // Unique constraint 에러
      globalToast.error('이미 다른 역할로 등록되어 있습니다.')
    } else {
      globalToast.error(error.message || '파트너+ 추가에 실패했습니다.')
    }
    return false
  }
}

/**
 * 파트너+ 삭제
 */
export async function removePartnerPlus(
  memberId: string,
  adminId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('timesheet_partner_roles')
      .update({ is_active: false })
      .eq('member_id', memberId)
      .eq('role_type', 'partner_plus')

    if (error) throw error

    // 회원 정보 조회 (상세 로그용)
    const { data: memberInfo } = await supabase
      .from('members')
      .select('name, email, role')
      .eq('id', memberId)
      .single()

    // 감사 로그 기록 (상세 정보 포함)
    await logAuditAction({
      actorId: adminId,
      actorRole: 'admin',
      action: 'partner_plus_remove',
      targetType: 'member',
      targetId: memberId,
      metadata: {
        member: memberInfo,
        changes: [{
          field: 'partner_plus',
          label: '파트너+ 삭제',
          before: memberInfo?.name,
          after: null,
        }],
      },
    })

    globalToast.success('파트너+가 삭제되었습니다.')
    return true
  } catch (error: any) {
    console.error('❌ removePartnerPlus error:', error)
    globalToast.error(error.message || '파트너+ 삭제에 실패했습니다.')
    return false
  }
}

/**
 * 전체 파트너+ 목록 조회 (어드민용)
 * partners 테이블의 partner_name을 사용하여 파트너 등록 이름을 표시
 */
export async function getAllPartnerPlus(): Promise<
  Array<{
    id: string
    name: string
    profile_image?: string
    current_status: TimesheetAttendanceStatus
  }>
> {
  try {
    // 1. partner_plus 역할인 member_id 목록 조회
    const { data: roles, error: rolesError } = await supabase
      .from('timesheet_partner_roles')
      .select('member_id')
      .eq('role_type', 'partner_plus')
      .eq('is_active', true)

    if (rolesError) throw rolesError

    const partnerPlusMemberIds = (roles || []).map((r) => r.member_id)

    if (partnerPlusMemberIds.length === 0) {
      return []
    }

    // 2. partners 테이블에서 해당 member_id를 가진 파트너 조회 (partner_name 사용)
    const { data: partnersData, error: partnersError } = await supabase
      .from('partners')
      .select('id, member_id, partner_name, members!inner(id, profile_image)')
      .eq('partner_status', 'approved')
      .in('member_id', partnerPlusMemberIds)

    if (partnersError) throw partnersError

    // 3. 현재 출근 중인 기록을 한 번에 조회 (RPC 개별 호출 대신)
    const { data: activeRecords, error: recordsError } = await supabase
      .from('timesheet_attendance_records')
      .select('partner_plus_id, status')
      .in('partner_plus_id', partnerPlusMemberIds)
      .eq('is_deleted', false)
      .is('ended_at', null)
      .in('status', ['WORKING', 'BREAK'])

    if (recordsError) throw recordsError

    // 파트너별 현재 상태 맵 생성
    const statusMap = new Map<string, TimesheetAttendanceStatus>()
    for (const record of activeRecords || []) {
      statusMap.set(record.partner_plus_id, record.status as TimesheetAttendanceStatus)
    }

    const partners = []
    for (const partner of partnersData || []) {
      const member = partner.members as { id: string; profile_image?: string }
      // 맵에서 상태 조회, 없으면 OFF
      const status = statusMap.get(partner.member_id) || 'OFF'
      partners.push({
        id: partner.member_id,
        name: partner.partner_name || '',
        profile_image: member?.profile_image,
        current_status: status,
      })
    }

    return partners
  } catch (error) {
    console.error('❌ getAllPartnerPlus error:', error)
    return []
  }
}

/**
 * 전체 매니저 목록 조회 (어드민용)
 */
export async function getAllManagers(): Promise<
  Array<{
    id: string
    name: string
    profile_image?: string
    stores: TimesheetStore[]
  }>
> {
  try {
    const { data: roles, error } = await supabase
      .from('timesheet_partner_roles')
      .select('member_id, member:members!timesheet_partner_roles_member_id_fkey(id, name, profile_image)')
      .eq('role_type', 'partner_manager')
      .eq('is_active', true)

    if (error) throw error

    const managers = []
    for (const role of roles || []) {
      if (role.member) {
        // 매니저가 관리하는 가게 조회
        const { data: storeManagers } = await supabase
          .from('timesheet_store_managers')
          .select('store:timesheet_stores(*)')
          .eq('manager_id', role.member_id)
          .eq('is_active', true)

        managers.push({
          id: role.member.id,
          name: role.member.name,
          profile_image: role.member.profile_image,
          stores: (storeManagers || []).map((sm: any) => sm.store).filter(Boolean),
        })
      }
    }

    return managers
  } catch (error) {
    console.error('❌ getAllManagers error:', error)
    return []
  }
}

/**
 * 정산 데이터 조회
 */
export async function getSettlements(
  options?: {
    partnerPlusId?: string
    storeId?: string
    startDate?: string
    endDate?: string
  }
): Promise<TimesheetSettlement[]> {
  try {
    let query = supabase.from('timesheet_settlements').select('*').order('work_date', { ascending: false })

    if (options?.partnerPlusId) {
      query = query.eq('partner_plus_id', options.partnerPlusId)
    }

    if (options?.storeId) {
      query = query.eq('store_id', options.storeId)
    }

    // work_date는 DATE 타입이므로 시간대 변환 필요 없음
    if (options?.startDate) {
      query = query.gte('work_date', options.startDate)
    }

    if (options?.endDate) {
      query = query.lte('work_date', options.endDate)
    }

    const { data, error } = await query

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('❌ getSettlements error:', error)
    return []
  }
}

/**
 * 근태 기록 수정
 */
export async function modifyAttendanceRecord(
  recordId: string,
  updates: {
    started_at?: string
    ended_at?: string
    break_started_at?: string | null
    break_ended_at?: string | null
    total_break_minutes?: number
    store_id?: string
  },
  reason: string,
  managerId: string
): Promise<boolean> {
  try {
    // 기존 기록 정보 조회 (변경 전 상태 기록용)
    const { data: originalRecord } = await supabase
      .from('timesheet_attendance_records')
      .select('*, store:timesheet_stores(*), partner_plus:members!timesheet_attendance_records_partner_plus_id_fkey(id, name)')
      .eq('id', recordId)
      .eq('is_deleted', false)
      .single()

    // undefined를 제외한 실제 업데이트할 필드만 추출
    const updatePayload: Record<string, unknown> = {
      is_modified: true,
      modification_reason: reason,
      modified_by: managerId,
      modified_at: new Date().toISOString(),
    }

    // 각 필드가 명시적으로 전달된 경우에만 업데이트 (null 포함)
    if (updates.started_at !== undefined) {
      updatePayload.started_at = updates.started_at
    }
    if (updates.ended_at !== undefined) {
      updatePayload.ended_at = updates.ended_at
    }
    if (updates.break_started_at !== undefined) {
      updatePayload.break_started_at = updates.break_started_at
    }
    if (updates.break_ended_at !== undefined) {
      updatePayload.break_ended_at = updates.break_ended_at
    }
    if (updates.total_break_minutes !== undefined) {
      updatePayload.total_break_minutes = updates.total_break_minutes
    }
    if (updates.store_id !== undefined) {
      updatePayload.store_id = updates.store_id
    }

    const { error } = await supabase
      .from('timesheet_attendance_records')
      .update(updatePayload)
      .eq('id', recordId)

    if (error) throw error

    // 변경된 가게 정보 조회
    let newStoreName = originalRecord?.store?.name
    if (updates.store_id && updates.store_id !== originalRecord?.store_id) {
      const { data: newStore } = await supabase
        .from('timesheet_stores')
        .select('name')
        .eq('id', updates.store_id)
        .single()
      newStoreName = newStore?.name
    }

    // 감사 로그 기록 (상세 정보 포함)
    await logAuditAction({
      actorId: managerId,
      actorRole: 'partner_manager',
      action: 'attendance_modify',
      targetType: 'attendance_record',
      targetId: recordId,
      reason,
      metadata: {
        record_id: recordId,
        partner_plus_id: originalRecord?.partner_plus_id,
        partner_plus_name: originalRecord?.partner_plus?.name,
        before: originalRecord,
        after: {
          ...originalRecord,
          ...updatePayload,
          store_name: updates.store_id ? newStoreName : originalRecord?.store?.name,
        },
        updates,
        modification_reason: reason,
        updated_at: new Date().toISOString(),
      },
    })

    globalToast.success('근태 기록이 수정되었습니다.')
    return true
  } catch (error: any) {
    console.error('❌ modifyAttendanceRecord error:', error)
    globalToast.error(error.message || '근태 기록 수정에 실패했습니다.')
    return false
  }
}

/**
 * 휴게 기록 추가
 */
export async function addBreakRecord(
  attendanceRecordId: string,
  startedAt: string,
  endedAt: string,
  reason: string,
  managerId: string
): Promise<boolean> {
  try {
    // 휴게 시간 계산
    const durationMinutes = Math.floor(
      (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / (1000 * 60)
    )

    // 1. 휴게 기록 추가
    const { error: insertError } = await supabase
      .from('timesheet_break_records')
      .insert({
        attendance_record_id: attendanceRecordId,
        started_at: startedAt,
        ended_at: endedAt,
        duration_minutes: durationMinutes,
      })

    if (insertError) throw insertError

    // 2. 출근 기록 정보 조회 (파트너/가게 정보 포함)
    const { data: attendanceRecord } = await supabase
      .from('timesheet_attendance_records')
      .select('*, store:timesheet_stores(name), partner_plus:members!timesheet_attendance_records_partner_plus_id_fkey(id, name)')
      .eq('id', attendanceRecordId)
      .single()

    // 3. total_break_minutes 재계산
    await recalculateTotalBreakMinutes(attendanceRecordId)

    // 4. 출근 기록에 수정 표시
    await supabase
      .from('timesheet_attendance_records')
      .update({
        is_modified: true,
        modification_reason: reason,
        modified_by: managerId,
        modified_at: new Date().toISOString(),
      })
      .eq('id', attendanceRecordId)

    // 감사 로그
    await logAuditAction({
      actorId: managerId,
      actorRole: 'partner_manager',
      action: 'attendance_modify',
      targetType: 'break_record',
      targetId: attendanceRecordId,
      reason,
      metadata: {
        action_type: 'add_break',
        attendance_record_id: attendanceRecordId,
        partner_plus_id: attendanceRecord?.partner_plus_id,
        partner_plus_name: attendanceRecord?.partner_plus?.name,
        store_id: attendanceRecord?.store_id,
        store_name: attendanceRecord?.store?.name,
        started_at: startedAt,
        ended_at: endedAt,
        duration_minutes: durationMinutes,
      },
    })

    globalToast.success('휴게 기록이 추가되었습니다.')
    return true
  } catch (error: any) {
    console.error('❌ addBreakRecord error:', error)
    globalToast.error(error.message || '휴게 기록 추가에 실패했습니다.')
    return false
  }
}

/**
 * 휴게 기록 수정
 */
export async function updateBreakRecord(
  breakRecordId: string,
  updates: {
    started_at?: string
    ended_at?: string
  },
  reason: string,
  managerId: string
): Promise<boolean> {
  try {
    // 기존 휴게 기록 조회
    const { data: existingBreak, error: fetchError } = await supabase
      .from('timesheet_break_records')
      .select('*')
      .eq('id', breakRecordId)
      .single()

    if (fetchError) throw fetchError
    if (!existingBreak) throw new Error('휴게 기록을 찾을 수 없습니다.')

    // 업데이트할 데이터 구성
    const updateData: Record<string, unknown> = {}
    if (updates.started_at !== undefined) {
      updateData.started_at = updates.started_at
    }
    if (updates.ended_at !== undefined) {
      updateData.ended_at = updates.ended_at
    }

    // duration_minutes 재계산
    const startedAt = updates.started_at || existingBreak.started_at
    const endedAt = updates.ended_at || existingBreak.ended_at
    if (startedAt && endedAt) {
      updateData.duration_minutes = Math.floor(
        (new Date(endedAt).getTime() - new Date(startedAt).getTime()) / (1000 * 60)
      )
    }

    // 1. 휴게 기록 업데이트
    const { error: updateError } = await supabase
      .from('timesheet_break_records')
      .update(updateData)
      .eq('id', breakRecordId)

    if (updateError) throw updateError

    // 2. 출근 기록 정보 조회 (파트너/가게 정보 포함)
    const { data: attendanceRecord } = await supabase
      .from('timesheet_attendance_records')
      .select('*, store:timesheet_stores(name), partner_plus:members!timesheet_attendance_records_partner_plus_id_fkey(id, name)')
      .eq('id', existingBreak.attendance_record_id)
      .single()

    // 3. total_break_minutes 재계산
    await recalculateTotalBreakMinutes(existingBreak.attendance_record_id)

    // 4. 출근 기록에 수정 표시
    await supabase
      .from('timesheet_attendance_records')
      .update({
        is_modified: true,
        modification_reason: reason,
        modified_by: managerId,
        modified_at: new Date().toISOString(),
      })
      .eq('id', existingBreak.attendance_record_id)

    // 감사 로그
    await logAuditAction({
      actorId: managerId,
      actorRole: 'partner_manager',
      action: 'attendance_modify',
      targetType: 'break_record',
      targetId: breakRecordId,
      reason,
      metadata: {
        action_type: 'update_break',
        attendance_record_id: existingBreak.attendance_record_id,
        partner_plus_id: attendanceRecord?.partner_plus_id,
        partner_plus_name: attendanceRecord?.partner_plus?.name,
        store_id: attendanceRecord?.store_id,
        store_name: attendanceRecord?.store?.name,
        before: {
          started_at: existingBreak.started_at,
          ended_at: existingBreak.ended_at,
        },
        after: {
          started_at: updates.started_at || existingBreak.started_at,
          ended_at: updates.ended_at || existingBreak.ended_at,
        },
      },
    })

    globalToast.success('휴게 기록이 수정되었습니다.')
    return true
  } catch (error: any) {
    console.error('❌ updateBreakRecord error:', error)
    globalToast.error(error.message || '휴게 기록 수정에 실패했습니다.')
    return false
  }
}

/**
 * 휴게 기록 삭제 (소프트 삭제)
 */
export async function deleteBreakRecord(
  breakRecordId: string,
  reason: string,
  managerId: string
): Promise<boolean> {
  try {
    // 기존 휴게 기록 조회
    const { data: existingBreak, error: fetchError } = await supabase
      .from('timesheet_break_records')
      .select('*')
      .eq('id', breakRecordId)
      .single()

    if (fetchError) throw fetchError
    if (!existingBreak) throw new Error('휴게 기록을 찾을 수 없습니다.')

    // 1. 소프트 삭제
    const { error: deleteError } = await supabase
      .from('timesheet_break_records')
      .update({ is_deleted: true })
      .eq('id', breakRecordId)

    if (deleteError) throw deleteError

    // 2. 출근 기록 정보 조회 (파트너/가게 정보 포함)
    const { data: attendanceRecord } = await supabase
      .from('timesheet_attendance_records')
      .select('*, store:timesheet_stores(name), partner_plus:members!timesheet_attendance_records_partner_plus_id_fkey(id, name)')
      .eq('id', existingBreak.attendance_record_id)
      .single()

    // 3. total_break_minutes 재계산
    await recalculateTotalBreakMinutes(existingBreak.attendance_record_id)

    // 4. 출근 기록에 수정 표시
    await supabase
      .from('timesheet_attendance_records')
      .update({
        is_modified: true,
        modification_reason: reason,
        modified_by: managerId,
        modified_at: new Date().toISOString(),
      })
      .eq('id', existingBreak.attendance_record_id)

    // 감사 로그
    await logAuditAction({
      actorId: managerId,
      actorRole: 'partner_manager',
      action: 'attendance_modify',
      targetType: 'break_record',
      targetId: breakRecordId,
      reason,
      metadata: {
        action_type: 'delete_break',
        attendance_record_id: existingBreak.attendance_record_id,
        partner_plus_id: attendanceRecord?.partner_plus_id,
        partner_plus_name: attendanceRecord?.partner_plus?.name,
        store_id: attendanceRecord?.store_id,
        store_name: attendanceRecord?.store?.name,
        deleted_break: {
          started_at: existingBreak.started_at,
          ended_at: existingBreak.ended_at,
          duration_minutes: existingBreak.duration_minutes,
        },
      },
    })

    globalToast.success('휴게 기록이 삭제되었습니다.')
    return true
  } catch (error: any) {
    console.error('❌ deleteBreakRecord error:', error)
    globalToast.error(error.message || '휴게 기록 삭제에 실패했습니다.')
    return false
  }
}

/**
 * 출근 기록의 total_break_minutes 재계산
 */
async function recalculateTotalBreakMinutes(attendanceRecordId: string): Promise<void> {
  try {
    // 모든 활성 휴게 기록 조회
    const { data: breakRecords, error } = await supabase
      .from('timesheet_break_records')
      .select('duration_minutes, started_at, ended_at')
      .eq('attendance_record_id', attendanceRecordId)
      .eq('is_deleted', false)

    if (error) throw error

    // 총 휴게 시간 계산
    const totalBreakMinutes = (breakRecords || []).reduce((sum, br) => {
      if (br.duration_minutes) {
        return sum + br.duration_minutes
      } else if (br.started_at && br.ended_at) {
        const duration = Math.floor(
          (new Date(br.ended_at).getTime() - new Date(br.started_at).getTime()) / (1000 * 60)
        )
        return sum + Math.max(0, duration)
      }
      return sum
    }, 0)

    // 출근 기록 업데이트
    await supabase
      .from('timesheet_attendance_records')
      .update({ total_break_minutes: totalBreakMinutes })
      .eq('id', attendanceRecordId)
  } catch (error) {
    console.error('❌ recalculateTotalBreakMinutes error:', error)
  }
}

/**
 * 근태 기록 목록 조회 (매니저용)
 */
export async function getAttendanceRecords(
  options?: {
    partnerPlusId?: string
    storeId?: string
    managerId?: string
    startDate?: string
    endDate?: string
    limit?: number
  }
): Promise<TimesheetAttendanceRecord[]> {
  try {
    let query = supabase
      .from('timesheet_attendance_records')
      .select('*, store:timesheet_stores(*), partner_plus:members!timesheet_attendance_records_partner_plus_id_fkey(id, name, profile_image)')
      .eq('is_deleted', false)
      .order('started_at', { ascending: false })

    if (options?.partnerPlusId) {
      query = query.eq('partner_plus_id', options.partnerPlusId)
    }

    if (options?.storeId) {
      query = query.eq('store_id', options.storeId)
    }

    if (options?.managerId) {
      query = query.eq('manager_id', options.managerId)
    }

    // 한국 시간(KST, UTC+9) 기준으로 날짜 필터링
    if (options?.startDate) {
      const startDateKST = new Date(`${options.startDate}T00:00:00+09:00`)
      query = query.gte('started_at', startDateKST.toISOString())
    }

    if (options?.endDate) {
      const endDateKST = new Date(`${options.endDate}T23:59:59+09:00`)
      query = query.lte('started_at', endDateKST.toISOString())
    }

    if (options?.limit) {
      query = query.limit(options.limit)
    }

    const { data, error } = await query

    if (error) throw error
    return data || []
  } catch (error) {
    console.error('❌ getAttendanceRecords error:', error)
    return []
  }
}

// 통계 관련 타입
export interface AttendanceStatItem {
  partner_plus_id: string
  partner_plus_name: string
  partner_plus_image?: string
  store_id: string
  store_name: string
  total_work_hours: number // 실 근무 시간 (휴게 제외)
  total_break_hours: number // 총 휴게 시간
  total_work_count: number
  records: Array<{
    id: string // 기록 ID (시간 수정용)
    date: string
    started_at: string
    ended_at?: string
    break_started_at?: string
    break_ended_at?: string
    total_break_minutes: number
    work_hours: number // 실 근무 시간 (휴게 제외)
    break_hours: number // 휴게 시간
    gross_hours: number // 총 경과 시간 (휴게 포함)
    store_id: string
    store_name: string
    break_records?: TimesheetBreakRecord[] // 개별 휴게 기록들
  }>
}

export interface AttendanceStats {
  summary: {
    total_partners: number
    total_stores: number
    total_work_hours: number // 실 근무 시간 (휴게 제외)
    total_break_hours: number // 총 휴게 시간
    total_work_count: number
  }
  by_partner: AttendanceStatItem[]
  by_store: Array<{
    store_id: string
    store_name: string
    total_work_hours: number // 실 근무 시간 (휴게 제외)
    total_break_hours: number // 총 휴게 시간
    total_work_count: number
    partners: Array<{
      partner_plus_id: string
      partner_plus_name: string
      work_hours: number // 실 근무 시간 (휴게 제외)
      break_hours: number // 휴게 시간
      work_count: number
    }>
  }>
}

/**
 * 출근 통계 조회 (관리자용)
 */
export async function getAttendanceStats(
  options?: {
    startDate?: string
    endDate?: string
    storeId?: string
    partnerPlusId?: string
    partnerPlusIds?: string[] // 여러 파트너 ID (OR 조건)
  }
): Promise<AttendanceStats> {
  try {
    let query = supabase
      .from('timesheet_attendance_records')
      .select('*, store:timesheet_stores(*), partner_plus:members!timesheet_attendance_records_partner_plus_id_fkey(id, name, profile_image)')
      // 삭제되지 않은 기록만 조회 (마이그레이션 실행 필요)
      .eq('is_deleted', false)
      // 퇴근 완료되지 않은 항목도 포함 (실시간 업데이트를 위해)
      .order('started_at', { ascending: false })

    // 한국 시간(KST, UTC+9) 기준으로 날짜 필터링
    if (options?.startDate) {
      const startDateKST = new Date(`${options.startDate}T00:00:00+09:00`)
      query = query.gte('started_at', startDateKST.toISOString())
    }

    if (options?.endDate) {
      const endDateKST = new Date(`${options.endDate}T23:59:59+09:00`)
      query = query.lte('started_at', endDateKST.toISOString())
    }

    if (options?.storeId) {
      query = query.eq('store_id', options.storeId)
    }

    // 여러 파트너 ID가 있으면 OR 조건으로 필터링
    if (options?.partnerPlusIds && options.partnerPlusIds.length > 0) {
      query = query.in('partner_plus_id', options.partnerPlusIds)
    } else if (options?.partnerPlusId) {
      query = query.eq('partner_plus_id', options.partnerPlusId)
    }

    const { data, error } = await query

    if (error) throw error

    const records = data || []

    // 모든 출근 기록 ID
    const recordIds = records.map((r: any) => r.id)

    // 모든 휴게 기록을 한 번에 조회 (N+1 쿼리 방지)
    let breakRecordsMap = new Map<string, TimesheetBreakRecord[]>()
    if (recordIds.length > 0) {
      const { data: allBreakRecords } = await supabase
        .from('timesheet_break_records')
        .select('*')
        .in('attendance_record_id', recordIds)
        .eq('is_deleted', false)
        .order('started_at', { ascending: true })

      // attendance_record_id별로 그룹화
      for (const br of allBreakRecords || []) {
        const existing = breakRecordsMap.get(br.attendance_record_id) || []
        existing.push(br)
        breakRecordsMap.set(br.attendance_record_id, existing)
      }
    }

    // 파트너별 통계
    const partnerMap = new Map<string, AttendanceStatItem>()
    // 가게별 통계
    const storeMap = new Map<string, {
      store_id: string
      store_name: string
      total_work_hours: number
      total_break_hours: number
      total_work_count: number
      partners: Map<string, { partner_plus_id: string; partner_plus_name: string; work_hours: number; break_hours: number; work_count: number }>
    }>()

    for (const record of records) {
      if (!record.partner_plus || !record.store) continue

      // 퇴근 완료되지 않은 경우 현재 시간 기준으로 계산
      const endTime = record.ended_at ? new Date(record.ended_at).getTime() : Date.now()
      
      // 총 경과 시간 (시간 단위)
      const grossHours = (endTime - new Date(record.started_at).getTime()) / (1000 * 60 * 60)

      // 휴게 시간 (시간 단위)
      // 현재 진행 중인 휴게 시간도 포함
      let breakMinutes = record.total_break_minutes || 0
      if (record.status === 'BREAK' && record.break_started_at && !record.ended_at) {
        // 현재 휴게 중인 경우 현재 시간까지의 휴게 시간 추가
        const currentBreakMinutes = Math.floor((Date.now() - new Date(record.break_started_at).getTime()) / (1000 * 60))
        breakMinutes += currentBreakMinutes
      }
      const breakHours = breakMinutes / 60

      // 실 근무 시간 = 총 시간 - 휴게 시간
      const workHours = Math.max(0, grossHours - breakHours)

      // 파트너별 집계
      const partnerId = record.partner_plus_id
      const partnerStats = partnerMap.get(partnerId) || {
        partner_plus_id: partnerId,
        partner_plus_name: record.partner_plus.name,
        partner_plus_image: record.partner_plus.profile_image,
        store_id: record.store_id,
        store_name: record.store.name,
        total_work_hours: 0,
        total_break_hours: 0,
        total_work_count: 0,
        records: [],
      }
      partnerStats.total_work_hours += workHours
      partnerStats.total_break_hours += breakHours
      partnerStats.total_work_count += 1
      partnerStats.records.push({
        id: record.id,
        date: record.started_at.slice(0, 10),
        started_at: record.started_at,
        ended_at: record.ended_at,
        break_started_at: record.break_started_at,
        break_ended_at: record.break_ended_at,
        total_break_minutes: record.total_break_minutes || 0,
        work_hours: workHours,
        break_hours: breakHours,
        gross_hours: grossHours,
        store_id: record.store_id,
        store_name: record.store?.name || '',
        break_records: breakRecordsMap.get(record.id) || [], // 휴게 기록 추가
      })
      partnerMap.set(partnerId, partnerStats)

      // 가게별 집계
      const storeId = record.store_id
      const storeStats = storeMap.get(storeId) || {
        store_id: storeId,
        store_name: record.store.name,
        total_work_hours: 0,
        total_break_hours: 0,
        total_work_count: 0,
        partners: new Map(),
      }
      storeStats.total_work_hours += workHours
      storeStats.total_break_hours += breakHours
      storeStats.total_work_count += 1

      const storePartner = storeStats.partners.get(partnerId) || {
        partner_plus_id: partnerId,
        partner_plus_name: record.partner_plus.name,
        work_hours: 0,
        break_hours: 0,
        work_count: 0,
      }
      storePartner.work_hours += workHours
      storePartner.break_hours += breakHours
      storePartner.work_count += 1
      storeStats.partners.set(partnerId, storePartner)
      storeMap.set(storeId, storeStats)
    }

    const byPartner = Array.from(partnerMap.values()).sort((a, b) => b.total_work_hours - a.total_work_hours)
    const byStore = Array.from(storeMap.values()).map((s) => ({
      ...s,
      partners: Array.from(s.partners.values()).sort((a, b) => b.work_hours - a.work_hours),
    })).sort((a, b) => b.total_work_hours - a.total_work_hours)

    return {
      summary: {
        total_partners: partnerMap.size,
        total_stores: storeMap.size,
        total_work_hours: byPartner.reduce((sum, p) => sum + p.total_work_hours, 0),
        total_break_hours: byPartner.reduce((sum, p) => sum + p.total_break_hours, 0),
        total_work_count: byPartner.reduce((sum, p) => sum + p.total_work_count, 0),
      },
      by_partner: byPartner,
      by_store: byStore,
    }
  } catch (error: any) {
    console.error('❌ getAttendanceStats error:', error)
    
    // is_deleted 컬럼이 없는 경우 (마이그레이션 미실행)
    if (error?.code === '42703' && error?.message?.includes('is_deleted')) {
      console.error('⚠️ 마이그레이션이 실행되지 않았습니다. documents/migration_timesheet_attendance_records_soft_delete.sql 파일을 실행해주세요.')
      globalToast.error('데이터베이스 마이그레이션이 필요합니다. 관리자에게 문의하세요.')
    }
    
    return {
      summary: { total_partners: 0, total_stores: 0, total_work_hours: 0, total_break_hours: 0, total_work_count: 0 },
      by_partner: [],
      by_store: [],
    }
  }
}

/**
 * 출근 기록 직접 생성 (관리자용)
 */
export async function createAttendanceRecord(
  partnerPlusId: string,
  storeId: string,
  managerId: string,
  startedAt: string,
  endedAt: string | null,
  reason: string,
  adminId: string
): Promise<TimesheetAttendanceRecord | null> {
  try {
    // 출근 기록 생성
    const { data, error } = await supabase
      .from('timesheet_attendance_records')
      .insert({
        partner_plus_id: partnerPlusId,
        store_id: storeId,
        manager_id: managerId,
        status: endedAt ? 'OFF' : 'WORKING',
        started_at: startedAt,
        ended_at: endedAt || null,
        is_modified: true,
        modification_reason: reason,
        modified_by: adminId,
        modified_at: new Date().toISOString(),
      })
      .select('*, store:timesheet_stores(*), partner_plus:members!timesheet_attendance_records_partner_plus_id_fkey(id, name, profile_image)')
      .single()

    if (error) throw error

    // 감사 로그 기록
    await logAuditAction({
      actorId: adminId,
      actorRole: 'admin',
      action: 'attendance_create',
      targetType: 'attendance_record',
      targetId: data.id,
      reason,
      metadata: {
        partner_plus_id: partnerPlusId,
        partner_plus_name: data.partner_plus?.name,
        store_id: storeId,
        store_name: data.store?.name,
        manager_id: managerId,
        started_at: startedAt,
        ended_at: endedAt,
        record_snapshot: data,
      },
    })

    globalToast.success('출근 기록이 추가되었습니다.')
    return data
  } catch (error: any) {
    console.error('❌ createAttendanceRecord error:', error)
    globalToast.error(error.message || '출근 기록 추가에 실패했습니다.')
    return null
  }
}

/**
 * 출근 기록 삭제 (소프트 삭제)
 */
export async function deleteAttendanceRecord(
  recordId: string,
  reason: string,
  adminId: string
): Promise<boolean> {
  try {
    // 기존 기록 정보 조회 (로그용) - 삭제된 기록도 조회 가능하도록 필터 제외
    const { data: existingRecord, error: fetchError } = await supabase
      .from('timesheet_attendance_records')
      .select('*, store:timesheet_stores(*), partner_plus:members!timesheet_attendance_records_partner_plus_id_fkey(id, name)')
      .eq('id', recordId)
      .single()

    if (fetchError) throw fetchError
    if (!existingRecord) throw new Error('출근 기록을 찾을 수 없습니다.')

    // 소프트 삭제
    const { error: deleteError } = await supabase
      .from('timesheet_attendance_records')
      .update({
        is_deleted: true,
        is_modified: true,
        modification_reason: reason,
        modified_by: adminId,
        modified_at: new Date().toISOString(),
      })
      .eq('id', recordId)

    if (deleteError) throw deleteError

    // 감사 로그 기록
    await logAuditAction({
      actorId: adminId,
      actorRole: 'admin',
      action: 'attendance_delete',
      targetType: 'attendance_record',
      targetId: recordId,
      reason,
      metadata: {
        deleted_record: existingRecord,
        partner_plus_id: existingRecord.partner_plus_id,
        partner_plus_name: existingRecord.partner_plus?.name,
        store_id: existingRecord.store_id,
        store_name: existingRecord.store?.name,
        started_at: existingRecord.started_at,
        ended_at: existingRecord.ended_at,
      },
    })

    globalToast.success('출근 기록이 삭제되었습니다.')
    return true
  } catch (error: any) {
    console.error('❌ deleteAttendanceRecord error:', error)
    globalToast.error(error.message || '출근 기록 삭제에 실패했습니다.')
    return false
  }
}

