import {
  Avatar,
  Button,
  LoadingSpinner,
  Modal,
} from '@/components'
import { AttendanceRequestSheet, DateTimePicker, WorkingPartnerDetailSheet } from '@/components/features/timesheet'
import { useTimesheetRealtime } from '@/hooks/useTimesheetRealtime'
import { useTimesheetRole } from '@/hooks/useTimesheetRole'
import { supabase } from '@/lib/supabase'
import {
  approveAttendanceRequest,
  calculateWorkTime,
  cancelAttendanceRequest,
  getCurrentAttendanceRecord,
  getCurrentAttendanceStatus,
  getMyPendingRequest,
  getMyRecentRejectedRequest,
  getPendingRequests,
  getWorkingPartners,
  hasPendingRequest,
  rejectAttendanceRequest,
  type TimesheetAttendanceRecord,
  type TimesheetAttendanceRequest,
  type TimesheetAttendanceStatus,
  type TimesheetRequestType,
  type WorkTimeCalculation,
} from '@/lib/timesheetApi'
import { useAuthStore } from '@/store/useAuthStore'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Check, ChevronDown, ChevronUp, Clock, Coffee, LogOut, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

export const Route = createFileRoute('/timesheet/')({
  component: TimesheetDashboard,
})

const REQUEST_TYPE_LABELS: Record<TimesheetRequestType, string> = {
  WORKING: '출근',
  BREAK: '휴게',
  BREAK_END: '휴게 해제',
  OFF: '퇴근',
}

function TimesheetDashboard() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const { role, isLoading: roleLoading, hasAccess, isAdmin, isPartnerManager } = useTimesheetRole()

  // 파트너+ 상태
  const [currentStatus, setCurrentStatus] = useState<TimesheetAttendanceStatus>('OFF')
  const [currentRecord, setCurrentRecord] = useState<TimesheetAttendanceRecord | null>(null)
  const [hasPending, setHasPending] = useState(false)
  const [myPendingRequest, setMyPendingRequest] = useState<TimesheetAttendanceRequest | null>(null)
  const [rejectedRequest, setRejectedRequest] = useState<TimesheetAttendanceRequest | null>(null)

  // 매니저 상태
  const [pendingRequests, setPendingRequests] = useState<TimesheetAttendanceRequest[]>([])
  const [workingPartners, setWorkingPartners] = useState<TimesheetAttendanceRecord[]>([])
  const [assignedStoreIds, setAssignedStoreIds] = useState<string[]>([])

  // 공통 상태
  const [isLoading, setIsLoading] = useState(true)
  const [requestSheetOpen, setRequestSheetOpen] = useState(false)
  const [requestType, setRequestType] = useState<TimesheetRequestType>('WORKING')
  const [rejectModalOpen, setRejectModalOpen] = useState(false)
  const [approveModalOpen, setApproveModalOpen] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<TimesheetAttendanceRequest | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [approvedTime, setApprovedTime] = useState('')
  const [modificationReason, setModificationReason] = useState('')
  const [isApproving, setIsApproving] = useState(false)
  // 출근 상세 바텀시트 상태
  const [detailSheetOpen, setDetailSheetOpen] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<TimesheetAttendanceRecord | null>(null)
  
  // 가게별 접기/펼치기 상태 (storeId -> isExpanded) - realtime 업데이트 시 유지를 위해 부모에서 관리
  const [expandedStores, setExpandedStores] = useState<Record<string, boolean>>({})

  // 데이터 로드 함수 (useCallback으로 메모이제이션)
  // showLoading: 초기 로딩 시에만 true, realtime 업데이트 시에는 false로 호출
  const loadData = useCallback(async (showLoading = false) => {
    if (!user?.id) return

    if (showLoading) {
      setIsLoading(true)
    }
    try {
      if (role === 'partner_plus') {
        // 파트너+ 전용 화면
        const [status, record, pending, pendingRequest, rejected] = await Promise.all([
          getCurrentAttendanceStatus(user.id),
          getCurrentAttendanceRecord(user.id),
          hasPendingRequest(user.id),
          getMyPendingRequest(user.id),
          getMyRecentRejectedRequest(user.id),
        ])
        setCurrentStatus(status)
        setCurrentRecord(record)
        setHasPending(pending)
        setMyPendingRequest(pendingRequest)
        
        // 이미 확인한 반려 요청인지 체크
        if (rejected) {
          const dismissedIds = JSON.parse(localStorage.getItem('dismissedRejections') || '[]')
          if (!dismissedIds.includes(rejected.id)) {
            setRejectedRequest(rejected)
          } else {
            setRejectedRequest(null)
          }
        } else {
          setRejectedRequest(null)
        }
      } else if (role === 'partner_manager' || isAdmin) {
        // 매니저 및 어드민은 동일한 매니저 화면 표시
        // 어드민: 모든 출근자 조회 (managerId 없이)
        // 파트너 매니저: 본인이 할당된 가게의 출근자만 조회
        const managerId = isAdmin ? undefined : user.id
        const [requests, partners] = await Promise.all([
          getPendingRequests(managerId),
          getWorkingPartners(managerId),
        ])
        setPendingRequests(requests)
        setWorkingPartners(partners)
      }
    } catch (error) {
      console.error('❌ loadData error:', error)
    } finally {
      if (showLoading) {
        setIsLoading(false)
      }
    }
  }, [user?.id, role, isAdmin])

  // Realtime 업데이트용 (로딩 스피너 없이)
  const refreshData = useCallback(() => {
    loadData(false)
  }, [loadData])

  // 요청 실시간 부분 업데이트 핸들러
  const handleRealtimeRequest = useCallback(async (payload: any) => {
    const { eventType, new: newRecord, old: oldRecord } = payload
    console.log('📡 [Timesheet Realtime] 상세 요청 변경:', eventType, newRecord?.id)

    if (role === 'partner_plus') {
      // 파트너+는 상태가 단순하므로 전체 리프레시가 안전함 (또는 선별적 리프레시)
      refreshData()
      return
    }

    // 매니저/어드민 화면 부분 업데이트
    if (eventType === 'INSERT') {
      // 새 요청인 경우 조인된 데이터를 가져와서 추가
      const { data, error } = await supabase
        .from('timesheet_attendance_requests')
        .select('*, store:timesheet_stores(*), partner_plus:members!timesheet_attendance_requests_partner_plus_id_fkey(id, name, profile_image), manager:members!timesheet_attendance_requests_manager_id_fkey(id, name, profile_image)')
        .eq('id', newRecord.id)
        .single()
      
      if (!error && data) {
        setPendingRequests(prev => [data, ...prev])
      }
    } else if (eventType === 'UPDATE') {
      // 상태가 변경된 경우 (승인/반려 등) 목록에서 제거하거나 업데이트
      if (newRecord.status !== 'pending') {
        setPendingRequests(prev => prev.filter(r => r.id !== newRecord.id))
      } else {
        setPendingRequests(prev => prev.map(r => r.id === newRecord.id ? { ...r, ...newRecord } : r))
      }
    } else if (eventType === 'DELETE') {
      setPendingRequests(prev => prev.filter(r => r.id === oldRecord.id))
    }
  }, [role, refreshData])

  // 기록 실시간 부분 업데이트 핸들러
  const handleRealtimeRecord = useCallback(async (payload: any) => {
    const { eventType, new: newRecord, old: oldRecord } = payload
    console.log('📡 [Timesheet Realtime] 상세 기록 변경:', eventType, newRecord?.id)

    if (role === 'partner_plus') {
      refreshData()
      return
    }

    if (eventType === 'INSERT') {
      const { data, error } = await supabase
        .from('timesheet_attendance_records')
        .select('*, store:timesheet_stores(*), partner_plus:members!timesheet_attendance_records_partner_plus_id_fkey(id, name, profile_image), manager:members!timesheet_attendance_records_manager_id_fkey(id, name, profile_image)')
        .eq('id', newRecord.id)
        .single()
      
      if (!error && data && !data.ended_at) {
        setWorkingPartners(prev => [data, ...prev])
      }
    } else if (eventType === 'UPDATE') {
      if (newRecord.ended_at) {
        // 퇴근 처리된 경우 목록에서 제거
        setWorkingPartners(prev => prev.filter(r => r.id !== newRecord.id))
      } else {
        setWorkingPartners(prev => prev.map(r => r.id === newRecord.id ? { ...r, ...newRecord } : r))
      }
    } else if (eventType === 'DELETE') {
      setWorkingPartners(prev => prev.filter(r => r.id === oldRecord.id))
    }
  }, [role, refreshData])

  // 매니저의 담당 가게 ID 목록 조회
  useEffect(() => {
    async function fetchAssignedStores() {
      if (!user?.id || !isPartnerManager) {
        setAssignedStoreIds([])
        return
      }

      try {
        const { data, error } = await supabase
          .from('timesheet_store_managers')
          .select('store_id')
          .eq('manager_id', user.id)
          .eq('is_active', true)

        if (error) throw error
        setAssignedStoreIds((data || []).map((sm: { store_id: string }) => sm.store_id))
      } catch (error) {
        console.error('❌ fetchAssignedStores error:', error)
        setAssignedStoreIds([])
      }
    }

    fetchAssignedStores()
  }, [user?.id, isPartnerManager])

  // Realtime 구독 설정 (로딩 스피너 없이 조용히 업데이트)
  useTimesheetRealtime({
    onRequestChange: handleRealtimeRequest,
    onRecordChange: handleRealtimeRecord,
    assignedStoreIds,
  })

  useEffect(() => {
    if (roleLoading) return

    const canAccess = isAdmin || hasAccess
    if (!canAccess) {
      navigate({ to: '/' })
      return
    }

    loadData(true) // 초기 로딩 시에만 로딩 스피너 표시
  }, [role, roleLoading, hasAccess, isAdmin, user?.id, user?.role, navigate, loadData])

  function handleApproveClick(request: TimesheetAttendanceRequest) {
    setSelectedRequest(request)
    // 요청된 시간을 datetime-local 형식으로 변환
    const requestedDate = new Date(request.requested_time)
    const localDateTime = new Date(requestedDate.getTime() - requestedDate.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16)
    setApprovedTime(localDateTime)
    setModificationReason('')
    setApproveModalOpen(true)
  }

  async function handleApproveSubmit() {
    if (!user?.id || !selectedRequest || isApproving) return

    // 시간이 수정되었는지 확인 (분 단위까지만 비교)
    const originalMinutes = Math.floor(new Date(selectedRequest.requested_time).getTime() / 60000)
    const newMinutes = Math.floor(new Date(approvedTime).getTime() / 60000)
    const isTimeModified = originalMinutes !== newMinutes

    // 시간이 수정되었는데 사유가 없으면 경고
    if (isTimeModified && !modificationReason.trim()) {
      alert('시간을 수정한 경우 사유를 입력해주세요.')
      return
    }

    setIsApproving(true)
    try {
      const newTime = new Date(approvedTime).toISOString()
      const success = await approveAttendanceRequest(selectedRequest.id, user.id, {
        approvedTime: isTimeModified ? newTime : undefined,
        modificationReason: isTimeModified ? modificationReason : undefined,
      })

      if (success) {
        setApproveModalOpen(false)
        setSelectedRequest(null)
        setApprovedTime('')
        setModificationReason('')
        loadData()
      }
    } finally {
      setIsApproving(false)
    }
  }

  function handleRejectClick(request: TimesheetAttendanceRequest) {
    setSelectedRequest(request)
    setRejectModalOpen(true)
  }

  async function handleRejectSubmit() {
    if (!user?.id || !selectedRequest) return
    if (!rejectionReason.trim()) {
      alert('반려 사유를 입력해주세요.')
      return
    }

    const success = await rejectAttendanceRequest(selectedRequest.id, user.id, rejectionReason)
    if (success) {
      setRejectModalOpen(false)
      setSelectedRequest(null)
      setRejectionReason('')
      loadData()
    }
  }

  function handleRequestClick(type: TimesheetRequestType) {
    setRequestType(type)
    setRequestSheetOpen(true)
  }

  function handlePartnerClick(record: TimesheetAttendanceRecord) {
    setSelectedRecord(record)
    setDetailSheetOpen(true)
  }

  async function handleCancelRequest() {
    if (!user?.id || !myPendingRequest) return
    if (!confirm('요청을 취소하시겠습니까?')) return

    const success = await cancelAttendanceRequest(myPendingRequest.id, user.id)
    if (success) loadData()
  }

  if (roleLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* 파트너+ 대시보드 */}
      {role === 'partner_plus' && (
        <PartnerPlusView
          currentStatus={currentStatus}
          currentRecord={currentRecord}
          hasPending={hasPending}
          myPendingRequest={myPendingRequest}
          rejectedRequest={rejectedRequest}
          onRequestClick={handleRequestClick}
          onCancelRequest={handleCancelRequest}
          onDismissRejected={() => {
            if (rejectedRequest) {
              const dismissedIds = JSON.parse(localStorage.getItem('dismissedRejections') || '[]')
              if (!dismissedIds.includes(rejectedRequest.id)) {
                dismissedIds.push(rejectedRequest.id)
                localStorage.setItem('dismissedRejections', JSON.stringify(dismissedIds))
              }
            }
            setRejectedRequest(null)
          }}
        />
      )}

      {/* 매니저/어드민 대시보드 */}
      {(role === 'partner_manager' || isAdmin) && (
        <ManagerView
          pendingRequests={pendingRequests}
          workingPartners={workingPartners}
          onApproveClick={handleApproveClick}
          onRejectClick={handleRejectClick}
          onPartnerClick={handlePartnerClick}
          isAdmin={isAdmin}
          onNavigateAdmin={() => navigate({ to: '/timesheet/admin' })}
          expandedStores={expandedStores}
          setExpandedStores={setExpandedStores}
        />
      )}

      {/* 요청 시트 (파트너+용) */}
      {role === 'partner_plus' && (
        <AttendanceRequestSheet
          isOpen={requestSheetOpen}
          onClose={() => setRequestSheetOpen(false)}
          requestType={requestType}
          currentStatus={currentStatus}
          onSuccess={loadData}
        />
      )}

      {/* 승인 모달 (매니저용) */}
      <Modal
        isOpen={approveModalOpen}
        onClose={() => {
          setApproveModalOpen(false)
          setSelectedRequest(null)
          setApprovedTime('')
          setModificationReason('')
        }}
        title="요청 승인"
      >
        <div className="p-5 space-y-4">
          {selectedRequest && (
            <>
              {/* 요청 정보 */}
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="flex items-center gap-3">
                  <Avatar
                    src={selectedRequest.partner_plus?.profile_image}
                    alt={selectedRequest.partner_plus?.name || ''}
                    size="sm"
                  />
                  <div>
                    <p className="font-semibold text-gray-900">{selectedRequest.partner_plus?.name}</p>
                    <p className="text-xs text-gray-500">
                      {REQUEST_TYPE_LABELS[selectedRequest.request_type]} 요청 · {selectedRequest.store?.name}
                    </p>
                  </div>
                </div>
              </div>

              {/* 시간 수정 */}
              <div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-2">
                  <Clock className="w-4 h-4 text-gray-500" />
                  승인 시간
                </label>
                <DateTimePicker
                  value={approvedTime}
                  onChange={setApprovedTime}
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  필요시 시간을 수정할 수 있습니다
                </p>
              </div>

              {/* 시간 수정 사유 (시간이 변경된 경우에만 표시) */}
              {approvedTime && selectedRequest.requested_time && (() => {
                // 분 단위까지만 비교 (초, 밀리초 무시)
                const approvedMinutes = Math.floor(new Date(approvedTime).getTime() / 60000)
                const requestedMinutes = Math.floor(new Date(selectedRequest.requested_time).getTime() / 60000)
                return approvedMinutes !== requestedMinutes
              })() && (
                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-2 block">
                    수정 사유 *
                  </label>
                  <textarea
                    value={modificationReason}
                    onChange={(e) => setModificationReason(e.target.value)}
                    placeholder="시간 수정 사유를 입력해주세요..."
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/30 focus:border-[#FE3A8F] min-h-[80px] resize-none"
                  />
                  <p className="text-xs text-amber-600 mt-1">
                    ⚠️ 수정 사유는 감사 로그에만 기록되며 파트너+에게는 표시되지 않습니다
                  </p>
                </div>
              )}
            </>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              onClick={() => {
                setApproveModalOpen(false)
                setSelectedRequest(null)
                setApprovedTime('')
                setModificationReason('')
              }}
              variant="ghost"
              className="flex-1"
            >
              취소
            </Button>
            <Button 
              onClick={handleApproveSubmit} 
              variant="primary" 
              className="flex-1"
              disabled={isApproving}
            >
              {isApproving ? '처리 중...' : '승인'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 반려 모달 (매니저용) */}
      <Modal
        isOpen={rejectModalOpen}
        onClose={() => {
          setRejectModalOpen(false)
          setSelectedRequest(null)
          setRejectionReason('')
        }}
        title="요청 반려"
      >
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600">반려 사유를 입력해주세요.</p>
          <textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            placeholder="반려 사유 입력..."
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/30 focus:border-[#FE3A8F] min-h-[100px] resize-none"
          />
          <div className="flex gap-2 pt-2">
            <Button
              onClick={() => {
                setRejectModalOpen(false)
                setSelectedRequest(null)
                setRejectionReason('')
              }}
              variant="ghost"
              className="flex-1"
            >
              취소
            </Button>
            <Button onClick={handleRejectSubmit} variant="primary" className="flex-1">
              반려
            </Button>
          </div>
        </div>
      </Modal>

      {/* 출근 상세 바텀시트 (매니저/어드민용) */}
      <WorkingPartnerDetailSheet
        isOpen={detailSheetOpen}
        onClose={() => {
          setDetailSheetOpen(false)
          setSelectedRecord(null)
        }}
        record={selectedRecord}
        onRecordUpdate={() => loadData(false)}
        assignedStoreIds={assignedStoreIds}
      />
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────────────────
   파트너+ 뷰 컴포넌트
────────────────────────────────────────────────────────────────────────── */
interface PartnerPlusViewProps {
  currentStatus: TimesheetAttendanceStatus
  currentRecord: TimesheetAttendanceRecord | null
  hasPending: boolean
  myPendingRequest: TimesheetAttendanceRequest | null
  rejectedRequest: TimesheetAttendanceRequest | null
  onRequestClick: (type: TimesheetRequestType) => void
  onCancelRequest: () => void
  onDismissRejected: () => void
}

function PartnerPlusView({
  currentStatus,
  currentRecord,
  hasPending,
  myPendingRequest,
  rejectedRequest,
  onRequestClick,
  onCancelRequest,
  onDismissRejected,
}: PartnerPlusViewProps) {
  // 실시간 시간 업데이트 (실 근무 시간 또는 휴게 시간)
  const [displayTime, setDisplayTime] = useState({ hours: 0, minutes: 0, seconds: 0 })
  const [workTimeInfo, setWorkTimeInfo] = useState<WorkTimeCalculation | null>(null)
  
  useEffect(() => {
    if (!currentRecord?.started_at || currentStatus === 'OFF') {
      setDisplayTime({ hours: 0, minutes: 0, seconds: 0 })
      setWorkTimeInfo(null)
      return
    }

    const updateTime = () => {
      const calcResult = calculateWorkTime(currentRecord)
      setWorkTimeInfo(calcResult)
      
      let displayMinutes: number
      
      if (currentStatus === 'BREAK') {
        // 휴게 중: 현재 진행 중인 휴게 시간 표시
        displayMinutes = calcResult.currentBreakMinutes
      } else {
        // 근무 중: 실 근무 시간 표시 (휴게 시간 차감)
        displayMinutes = calcResult.actualWorkMinutes
      }
      
      const hours = Math.floor(displayMinutes / 60)
      const minutes = displayMinutes % 60
      // 초 단위는 현재 시간 기준으로 계산
      const now = Date.now()
      let refTime: number
      if (currentStatus === 'BREAK' && currentRecord.break_started_at) {
        refTime = new Date(currentRecord.break_started_at).getTime()
      } else {
        refTime = new Date(currentRecord.started_at).getTime()
      }
      const totalMs = now - refTime
      const seconds = Math.floor((totalMs % (1000 * 60)) / 1000)
      
      setDisplayTime({ hours, minutes, seconds })
    }

    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [currentRecord, currentStatus])

  // 상태별 스타일 설정
  const statusStyles = {
    OFF: {
      gradient: 'from-slate-100 via-gray-100 to-slate-200',
      glow: '',
      textMain: 'text-gray-700',
      textSub: 'text-gray-500',
      ringOuter: 'ring-gray-200',
      ringInner: 'bg-gradient-to-br from-gray-200 to-gray-300',
      dotColor: 'bg-gray-400',
    },
    WORKING: {
      gradient: 'from-emerald-400 via-green-500 to-teal-500',
      glow: 'shadow-[0_0_60px_-15px_rgba(16,185,129,0.6)]',
      textMain: 'text-white',
      textSub: 'text-emerald-100',
      ringOuter: 'ring-emerald-300/50',
      ringInner: 'bg-gradient-to-br from-emerald-400 to-teal-500',
      dotColor: 'bg-white',
    },
    BREAK: {
      gradient: 'from-amber-400 via-orange-400 to-yellow-500',
      glow: 'shadow-[0_0_60px_-15px_rgba(245,158,11,0.6)]',
      textMain: 'text-white',
      textSub: 'text-amber-100',
      ringOuter: 'ring-amber-300/50',
      ringInner: 'bg-gradient-to-br from-amber-400 to-orange-500',
      dotColor: 'bg-white',
    },
  }
  
  const style = statusStyles[currentStatus]
  const statusLabels = { OFF: '미출근', WORKING: '근무 중', BREAK: '휴게 중' }

  return (
    <div
      className="flex flex-col flex-1"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 60px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 160px)',
      }}
    >
      {/* 메인 상태 표시 영역 */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        
        {/* 히어로 카드 */}
        <div className={`relative w-full max-w-sm rounded-[2rem] bg-gradient-to-br ${style.gradient} ${style.glow} p-8 overflow-hidden`}>
          {/* 배경 장식 */}
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-black/5 rounded-full blur-xl translate-y-1/2 -translate-x-1/2" />
          
          {/* 상태 인디케이터 */}
          <div className="relative flex flex-col items-center">
            {/* 상태 도트 + 라벨 */}
            <div className="flex items-center gap-2 mb-6">
              <span className={`w-2.5 h-2.5 rounded-full ${style.dotColor} ${currentStatus !== 'OFF' ? 'animate-pulse' : ''}`} />
              <span className={`text-sm font-semibold uppercase tracking-wider ${style.textSub}`}>
                {statusLabels[currentStatus]}
              </span>
            </div>

            {/* 시간 표시 (출근/휴게 중일 때) */}
            {currentStatus !== 'OFF' && currentRecord ? (
              <>
                {/* 시간 라벨 */}
                <div className={`text-center mb-2 ${style.textSub}`}>
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    {currentStatus === 'BREAK' ? '휴게 시간' : '실 근무 시간'}
                  </span>
                </div>
                
                {/* 큰 시간 표시 */}
                <div className={`text-center mb-4 ${style.textMain}`}>
                  <div className="flex items-baseline justify-center gap-1 tabular-nums">
                    <span className="text-6xl font-bold tracking-tight">
                      {String(displayTime.hours).padStart(2, '0')}
                    </span>
                    <span className="text-4xl font-light opacity-60">:</span>
                    <span className="text-6xl font-bold tracking-tight">
                      {String(displayTime.minutes).padStart(2, '0')}
                    </span>
                    <span className="text-2xl font-medium opacity-40 ml-1">
                      {String(displayTime.seconds).padStart(2, '0')}
                    </span>
                  </div>
                </div>

                {/* 출근/휴게 시간 정보 */}
                <div className={`text-center ${style.textSub} space-y-1`}>
                  <p className="text-sm font-medium">
                    {new Date(currentRecord.started_at).toLocaleTimeString('ko-KR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })} 출근
                  </p>
                  {/* 근무 중일 때 누적 휴게 시간 표시 */}
                  {currentStatus === 'WORKING' && workTimeInfo && workTimeInfo.breakMinutes > 0 && (
                    <p className="text-xs opacity-80">
                      휴게 {Math.floor(workTimeInfo.breakMinutes / 60)}시간 {workTimeInfo.breakMinutes % 60}분
                    </p>
                  )}
                  {/* 휴게 중이면 휴게 시작 시간과 실 근무 시간 표시 */}
                  {currentStatus === 'BREAK' && currentRecord.break_started_at && (
                    <>
                      <p className="text-xs opacity-80">
                        {new Date(currentRecord.break_started_at).toLocaleTimeString('ko-KR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })} 휴게 시작
                      </p>
                    </>
                  )}
                  {currentRecord.store?.name && (
                    <p className="text-xs mt-1 opacity-70">{currentRecord.store.name}</p>
                  )}
                </div>
              </>
            ) : (
              /* 미출근 상태 */
              <div className="text-center py-4">
                <Clock className={`w-16 h-16 mx-auto mb-4 ${style.textMain} opacity-40`} />
                <p className={`text-lg font-medium ${style.textMain}`}>
                  아직 출근하지 않았습니다
                </p>
                <p className={`text-sm mt-1 ${style.textSub}`}>
                  출근 버튼을 눌러 시작하세요
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 반려 알림 */}
        {rejectedRequest && (
          <div className="mt-6 w-full max-w-sm">
            <div className="bg-gradient-to-r from-rose-50 to-red-50 border border-rose-200/60 rounded-2xl p-4 backdrop-blur">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0">
                  <X className="w-5 h-5 text-rose-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-bold text-rose-900">요청 반려됨</span>
                    <button 
                      onClick={onDismissRejected}
                      className="text-rose-400 hover:text-rose-600 p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-sm text-rose-800 font-medium">
                    {REQUEST_TYPE_LABELS[rejectedRequest.request_type]} 요청이 반려되었습니다
                  </p>
                  {rejectedRequest.rejection_reason && (
                    <div className="mt-2 p-2 bg-rose-100/50 rounded-lg">
                      <p className="text-xs text-rose-700">
                        <span className="font-semibold">반려 사유:</span> {rejectedRequest.rejection_reason}
                      </p>
                    </div>
                  )}
                  <p className="text-xs text-rose-500 mt-2">
                    {new Date(rejectedRequest.processed_at || '').toLocaleString('ko-KR', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 대기 중 알림 */}
        {hasPending && myPendingRequest && (
          <div className="mt-6 w-full max-w-sm">
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/60 rounded-2xl p-4 backdrop-blur">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <Clock className="w-5 h-5 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-bold text-amber-900">승인 대기 중</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  </div>
                  <p className="text-sm text-amber-800 font-medium">
                    {REQUEST_TYPE_LABELS[myPendingRequest.request_type]} 요청
                  </p>
                  <p className="text-xs text-amber-600 mt-0.5">
                    {myPendingRequest.store?.name} · {new Date(myPendingRequest.requested_time).toLocaleTimeString('ko-KR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 하단 고정 버튼 영역 */}
      <div
        className="fixed left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-100 px-6 py-4"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)' }}
      >
        <div className="max-w-md mx-auto">
          {hasPending && myPendingRequest ? (
            <Button onClick={onCancelRequest} variant="secondary" size="lg" className="w-full">
              요청 취소
            </Button>
          ) : (
            <ActionButtons currentStatus={currentStatus} onRequestClick={onRequestClick} />
          )}
        </div>
      </div>
    </div>
  )
}

/* 액션 버튼 */
interface ActionButtonsProps {
  currentStatus: TimesheetAttendanceStatus
  onRequestClick: (type: TimesheetRequestType) => void
}

function ActionButtons({ currentStatus, onRequestClick }: ActionButtonsProps) {
  switch (currentStatus) {
    case 'OFF':
      return (
        <Button onClick={() => onRequestClick('WORKING')} variant="primary" size="lg" className="w-full">
          <Check className="w-5 h-5 mr-2" />
          출근 요청
        </Button>
      )
    case 'WORKING':
      return (
        <div className="flex gap-3">
          <Button onClick={() => onRequestClick('BREAK')} variant="secondary" size="lg" className="flex-1">
            <Coffee className="w-4 h-4 mr-1.5" />
            휴게
          </Button>
          <Button onClick={() => onRequestClick('OFF')} variant="primary" size="lg" className="flex-1">
            <LogOut className="w-4 h-4 mr-1.5" />
            퇴근
          </Button>
        </div>
      )
    case 'BREAK':
      return (
        <div className="flex flex-col gap-3">
          <Button onClick={() => onRequestClick('BREAK_END')} variant="primary" size="lg" className="w-full">
            <Check className="w-4 h-4 mr-1.5" />
            휴게 종료 (복귀)
          </Button>
          <p className="text-xs text-center text-gray-500">
            ⚠️ 휴게 중에는 퇴근할 수 없습니다. 먼저 휴게를 종료하고 승인받은 후 퇴근해주세요.
          </p>
        </div>
      )
    default:
      return null
  }
}

/* ──────────────────────────────────────────────────────────────────────────
   매니저 뷰 컴포넌트
────────────────────────────────────────────────────────────────────────── */
interface ManagerViewProps {
  pendingRequests: TimesheetAttendanceRequest[]
  workingPartners: TimesheetAttendanceRecord[]
  onApproveClick: (request: TimesheetAttendanceRequest) => void
  onRejectClick: (request: TimesheetAttendanceRequest) => void
  onPartnerClick: (record: TimesheetAttendanceRecord) => void
  isAdmin?: boolean
  onNavigateAdmin?: () => void
  expandedStores: Record<string, boolean>
  setExpandedStores: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
}

function ManagerView({ pendingRequests, workingPartners, onApproveClick, onRejectClick, onPartnerClick, isAdmin, onNavigateAdmin, expandedStores, setExpandedStores }: ManagerViewProps) {
  const [showAllPending, setShowAllPending] = useState(false)
  
  // 초기 표시 개수
  const INITIAL_DISPLAY_COUNT = 5
  
  const displayedPending = showAllPending 
    ? pendingRequests 
    : pendingRequests.slice(0, INITIAL_DISPLAY_COUNT)
  
  // 가게별로 출근 중인 파트너 그룹화
  const groupedByStore = workingPartners.reduce((acc, record) => {
    const storeId = record.store_id
    const storeName = record.store?.name || '미지정 가게'
    if (!acc[storeId]) {
      acc[storeId] = { storeName, records: [] }
    }
    acc[storeId].records.push(record)
    return acc
  }, {} as Record<string, { storeName: string; records: TimesheetAttendanceRecord[] }>)
  
  // 가게명 순 정렬
  const sortedStores = Object.entries(groupedByStore).sort((a, b) => 
    a[1].storeName.localeCompare(b[1].storeName, 'ko')
  )
  
  // 토글 핸들러
  const toggleStore = (storeId: string) => {
    setExpandedStores(prev => ({ ...prev, [storeId]: !prev[storeId] }))
  }
  
  // 전체 펼치기/접기
  const expandAll = () => {
    const allExpanded: Record<string, boolean> = {}
    sortedStores.forEach(([storeId]) => { allExpanded[storeId] = true })
    setExpandedStores(allExpanded)
  }
  
  const collapseAll = () => {
    setExpandedStores({})
  }
  
  const allExpanded = sortedStores.length > 0 && sortedStores.every(([storeId]) => expandedStores[storeId])

  return (
    <div
      className="flex-1 bg-gray-50"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 60px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 100px)',
      }}
    >
      {/* 상단 요약 카드 */}
      <div className="bg-white border-b border-gray-100 px-5 py-5">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-gray-500 mb-3">실시간 현황</h3>
            <div className="grid grid-cols-2 gap-3">
              {/* 출근 중 카드 */}
              <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  <span className="text-xs text-emerald-700 font-medium">출근 중</span>
                </div>
                <div className="flex items-end gap-1 py-1">
                  <p className="text-3xl leading-none font-bold text-emerald-700">{workingPartners.length}</p>
                  <p className="text-xs text-emerald-600 mt-1">명</p>
                </div>
              </div>
              {/* 승인 대기 카드 */}
              <div className={`rounded-xl p-4 ${pendingRequests.length > 0 ? 'bg-gradient-to-br from-amber-50 to-amber-100' : 'bg-gray-50'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <Clock className={`w-3 h-3 ${pendingRequests.length > 0 ? 'text-amber-600' : 'text-gray-400'}`} />
                  <span className={`text-xs font-medium ${pendingRequests.length > 0 ? 'text-amber-700' : 'text-gray-500'}`}>승인 대기</span>
                </div>
                <div className="flex items-end gap-1 py-1">
                  <p className={`text-3xl leading-none font-bold ${pendingRequests.length > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{pendingRequests.length}</p>
                  <p className={`text-xs ${pendingRequests.length > 0 ? 'text-amber-600' : 'text-gray-400'}`}>건</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 리스트 영역 */}
      <div className="px-5 py-6">
        <div className="max-w-2xl mx-auto space-y-8">
          {/* 승인 대기 섹션 */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1.5 h-5 bg-[#FE3A8F] rounded-full" />
              <h2 className="text-base font-bold text-gray-900">승인 대기 요청</h2>
              {pendingRequests.length > 0 && (
                <span className="ml-auto text-xs text-gray-400">
                  {pendingRequests.length}건의 요청
                </span>
              )}
            </div>

            {pendingRequests.length > 0 ? (
              <>
                <div className="space-y-3">
                  {displayedPending.map((request) => (
                    <PendingRequestCard
                      key={request.id}
                      request={request}
                      onApprove={onApproveClick}
                      onReject={onRejectClick}
                    />
                  ))}
                </div>
                {/* 더보기 버튼 */}
                {pendingRequests.length > INITIAL_DISPLAY_COUNT && (
                  <button
                    onClick={() => setShowAllPending(!showAllPending)}
                    className="w-full mt-3 py-3 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
                  >
                    {showAllPending 
                      ? '접기' 
                      : `${pendingRequests.length - INITIAL_DISPLAY_COUNT}건 더보기`}
                  </button>
                )}
              </>
            ) : (
              <EmptyState 
                icon={<Clock className="w-8 h-8 text-gray-300" />}
                message="대기 중인 요청이 없습니다" 
                subMessage="새로운 출근/퇴근 요청이 들어오면 여기에 표시됩니다"
              />
            )}
          </section>

          {/* 현재 출근 중 섹션 */}
          <section>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1.5 h-5 bg-emerald-500 rounded-full" />
              <h2 className="text-base font-bold text-gray-900">현재 출근 중</h2>
              {workingPartners.length > 0 && (
                <>
                  <span className="text-xs text-gray-400">
                    {workingPartners.length}명 근무 중
                  </span>
                  <button
                    onClick={allExpanded ? collapseAll : expandAll}
                    className="ml-auto text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    {allExpanded ? '전체 접기' : '전체 펼치기'}
                  </button>
                </>
              )}
            </div>

            {workingPartners.length > 0 ? (
              <div className="space-y-3">
                {sortedStores.map(([storeId, { storeName, records }]) => (
                  <StoreGroup
                    key={storeId}
                    storeName={storeName}
                    records={records}
                    isExpanded={!!expandedStores[storeId]}
                    onToggle={() => toggleStore(storeId)}
                    onPartnerClick={onPartnerClick}
                  />
                ))}
              </div>
            ) : (
              <EmptyState 
                icon={<Coffee className="w-8 h-8 text-gray-300" />}
                message="출근 중인 파트너가 없습니다" 
                subMessage="파트너가 출근하면 여기에 표시됩니다"
              />
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

/* 대기 요청 카드 */
interface PendingRequestCardProps {
  request: TimesheetAttendanceRequest
  onApprove: (request: TimesheetAttendanceRequest) => void
  onReject: (request: TimesheetAttendanceRequest) => void
}

function PendingRequestCard({ request, onApprove, onReject }: PendingRequestCardProps) {
  const typeConfig: Record<TimesheetRequestType, { label: string; color: string; icon: typeof Check }> = {
    WORKING: { label: '출근 요청', color: 'bg-emerald-100 text-emerald-700', icon: Check },
    BREAK: { label: '휴게 요청', color: 'bg-amber-100 text-amber-700', icon: Coffee },
    BREAK_END: { label: '휴게 해제 요청', color: 'bg-blue-100 text-blue-700', icon: Check },
    OFF: { label: '퇴근 요청', color: 'bg-rose-100 text-rose-700', icon: LogOut },
  }
  
  const config = typeConfig[request.request_type]
  const TypeIcon = config.icon

  // 요청 시간 계산
  const requestTime = new Date(request.requested_at)
  const now = new Date()
  const diffMinutes = Math.floor((now.getTime() - requestTime.getTime()) / (1000 * 60))
  const timeAgo = diffMinutes < 1 ? '방금' : diffMinutes < 60 ? `${diffMinutes}분 전` : `${Math.floor(diffMinutes / 60)}시간 전`

  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-4">
        {/* 아바타 */}
        <Avatar
          src={request.partner_plus?.profile_image}
          alt={request.partner_plus?.name || ''}
          size="md"
        />

        {/* 정보 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base font-bold text-gray-900 truncate">
              {request.partner_plus?.name || '알 수 없음'}
            </span>
          </div>
          
          <div className="flex items-center gap-2 mb-2">
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg ${config.color}`}>
              <TypeIcon className="w-3 h-3" />
              {config.label}
            </span>
          </div>
          
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="font-medium">{request.store?.name}</span>
            <span className="text-gray-300">•</span>
            <span>{timeAgo}</span>
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex flex-row gap-2">
          <button
            onClick={() => onApprove(request)}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#FE3A8F] text-white hover:bg-[#e8357f] transition-colors shadow-sm"
          >
            <Check className="w-5 h-5" />
          </button>
          <button
            onClick={() => onReject(request)}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}

/* 가게별 그룹 컴포넌트 */
interface StoreGroupProps {
  storeName: string
  records: TimesheetAttendanceRecord[]
  isExpanded: boolean
  onToggle: () => void
  onPartnerClick: (record: TimesheetAttendanceRecord) => void
}

function StoreGroup({ storeName, records, isExpanded, onToggle, onPartnerClick }: StoreGroupProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* 헤더 (접기/펼치기 토글) */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-gray-900">{storeName}</span>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            {records.length}명
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        )}
      </button>

      {/* 콘텐츠 영역 */}
      {isExpanded ? (
        /* 펼친 상태: 상세 카드 목록 */
        <div className="border-t border-gray-100 p-3 space-y-2">
          {records.map((record) => (
            <WorkingPartnerCard 
              key={record.id} 
              record={record} 
              onClick={() => onPartnerClick(record)}
              compact
            />
          ))}
        </div>
      ) : (
        /* 접힌 상태: 귀여운 컴팩트 UI */
        <div className="border-t border-gray-100 px-4 py-3">
          <div className="flex flex-wrap gap-3">
            {records.slice(0, 8).map((record) => (
              <CompactPartnerCard
                key={record.id}
                record={record}
                onClick={() => onPartnerClick(record)}
              />
            ))}
            {records.length > 8 && (
              <div className="flex items-center justify-center w-14">
                <span className="text-xs text-gray-400 font-medium">
                  +{records.length - 8}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* 컴팩트 파트너 카드 (접힌 상태용) */
interface CompactPartnerCardProps {
  record: TimesheetAttendanceRecord
  onClick?: () => void
}

function CompactPartnerCard({ record, onClick }: CompactPartnerCardProps) {
  const isBreak = record.status === 'BREAK'
  const workTimeInfo = calculateWorkTime(record)
  
  // 근무 중이면 실근무 시간, 휴게 중이면 현재 휴게 시간
  const displayMinutes = isBreak ? workTimeInfo.currentBreakMinutes : workTimeInfo.actualWorkMinutes
  const hours = Math.floor(displayMinutes / 60)
  const minutes = displayMinutes % 60
  
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 group"
    >
      {/* 프로필 with 링 */}
      <div className={`relative p-0.5 rounded-full ${isBreak ? 'ring-2 ring-amber-400' : 'ring-2 ring-emerald-400'}`}>
        <Avatar
          src={record.partner_plus?.profile_image}
          alt={record.partner_plus?.name || ''}
          size="sm"
        />
        {/* 상태 도트 */}
        <span 
          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${isBreak ? 'bg-amber-500' : 'bg-emerald-500'} ${!isBreak ? 'animate-pulse' : ''}`} 
        />
      </div>
      
      {/* 이름 */}
      <span className="text-[11px] font-medium text-gray-700 truncate max-w-[56px] group-hover:text-gray-900">
        {record.partner_plus?.name?.split(' ')[0] || '알 수 없음'}
      </span>
      
      {/* 시간 표시 */}
      <span className={`text-[10px] font-semibold tabular-nums ${isBreak ? 'text-amber-600' : 'text-emerald-600'}`}>
        {hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`}
      </span>
    </button>
  )
}

/* 출근 중 파트너 카드 */
interface WorkingPartnerCardProps {
  record: TimesheetAttendanceRecord
  onClick?: () => void
  compact?: boolean
}

function WorkingPartnerCard({ record, onClick, compact = false }: WorkingPartnerCardProps) {
  const isBreak = record.status === 'BREAK'
  const statusConfig = isBreak
    ? { bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-500', label: '휴게 중', labelBg: 'bg-amber-100 text-amber-700' }
    : { bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500', label: '근무 중', labelBg: 'bg-emerald-100 text-emerald-700' }

  // 실 근무 시간 계산 (휴게 시간 차감)
  const workTimeInfo = calculateWorkTime(record)
  const startTime = new Date(record.started_at)
  
  // 실 근무 시간 (항상 표시)
  const actualHours = Math.floor(workTimeInfo.actualWorkMinutes / 60)
  const actualMinutes = workTimeInfo.actualWorkMinutes % 60

  // compact 모드: 그룹 내부에서 사용 (펼친 상태)
  if (compact) {
    return (
      <div 
        className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer active:scale-[0.98]"
        onClick={onClick}
      >
        {/* 아바타 + 링 */}
        <div className={`relative p-0.5 rounded-full ${isBreak ? 'ring-2 ring-amber-400' : 'ring-2 ring-emerald-400'}`}>
          <Avatar
            src={record.partner_plus?.profile_image}
            alt={record.partner_plus?.name || ''}
            size="sm"
          />
          <span 
            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${statusConfig.dot} ${!isBreak ? 'animate-pulse' : ''}`} 
          />
        </div>

        {/* 정보 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 truncate">
              {record.partner_plus?.name || '알 수 없음'}
            </span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${statusConfig.labelBg}`}>
              {statusConfig.label}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span>{startTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 출근</span>
            {/* 휴게 시간이 있으면 표시 */}
            {workTimeInfo.breakMinutes > 0 && (
              <>
                <span className="text-gray-300">•</span>
                <span className="text-amber-600">
                  휴게 {Math.floor(workTimeInfo.breakMinutes / 60) > 0 && `${Math.floor(workTimeInfo.breakMinutes / 60)}h `}{workTimeInfo.breakMinutes % 60}m
                </span>
              </>
            )}
          </div>
        </div>

        {/* 실 근무 시간 표시 (항상 실 근무) */}
        <div className="text-right">
          <p className="text-base font-bold text-gray-900 tabular-nums">
            {actualHours > 0 && <><span>{actualHours}</span><span className="text-xs font-medium text-gray-400">h </span></>}
            <span>{actualMinutes}</span><span className="text-xs font-medium text-gray-400">m</span>
          </p>
          <p className="text-[10px] text-gray-400">실 근무</p>
        </div>
      </div>
    )
  }

  // 기본 모드: 전체 너비 카드
  return (
    <div 
      className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer active:scale-[0.98]"
      onClick={onClick}
    >
      <div className="flex items-center gap-4">
        {/* 아바타 + 상태 인디케이터 */}
        <div className="relative">
          <Avatar
            src={record.partner_plus?.profile_image}
            alt={record.partner_plus?.name || ''}
            size="md"
          />
          {/* 상태 도트 */}
          <span 
            className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-white ${statusConfig.dot} ${!isBreak ? 'animate-pulse' : ''}`} 
          />
        </div>

        {/* 정보 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base font-bold text-gray-900 truncate">
              {record.partner_plus?.name || '알 수 없음'}
            </span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${statusConfig.labelBg}`}>
              {statusConfig.label}
            </span>
          </div>
          <p className="text-sm text-gray-500">{record.store?.name}</p>
          {/* 휴게 시간이 있으면 표시 */}
          {workTimeInfo.breakMinutes > 0 && (
            <p className="text-xs text-amber-600 mt-0.5">
              휴게 {Math.floor(workTimeInfo.breakMinutes / 60)}h {workTimeInfo.breakMinutes % 60}m
            </p>
          )}
        </div>

        {/* 실 근무 시간 표시 (항상 실 근무) */}
        <div className="text-right pl-2">
          <p className="text-xl font-bold text-gray-900 tabular-nums">
            {actualHours > 0 && <><span>{actualHours}</span><span className="text-sm font-medium text-gray-400">h </span></>}
            <span>{actualMinutes}</span><span className="text-sm font-medium text-gray-400">m</span>
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            실 근무
          </p>
          <p className="text-xs text-gray-400">
            {startTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 출근
          </p>
        </div>
      </div>
    </div>
  )
}

/* 빈 상태 */
interface EmptyStateProps {
  icon?: React.ReactNode
  message: string
  subMessage?: string
}

function EmptyState({ icon, message, subMessage }: EmptyStateProps) {
  return (
    <div className="bg-white rounded-2xl p-8 text-center border border-gray-100 border-dashed">
      {icon && (
        <div className="flex justify-center mb-3">
          {icon}
        </div>
      )}
      <p className="text-sm font-medium text-gray-500">{message}</p>
      {subMessage && (
        <p className="text-xs text-gray-400 mt-1">{subMessage}</p>
      )}
    </div>
  )
}

