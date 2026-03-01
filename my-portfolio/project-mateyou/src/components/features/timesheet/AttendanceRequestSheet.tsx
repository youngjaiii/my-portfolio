import { Button, LoadingSpinner, SlideSheet } from '@/components'
import {
  createAttendanceRequest,
  getCurrentAttendanceRecord,
  getCurrentAttendanceStatus,
  getStoreManagers,
  getStores,
  type TimesheetAttendanceStatus,
  type TimesheetRequestType,
  type TimesheetStore,
  type TimesheetStoreManager,
} from '@/lib/timesheetApi'
import { useAuthStore } from '@/store/useAuthStore'
import { Clock } from 'lucide-react'
import { useEffect, useState } from 'react'

interface AttendanceRequestSheetProps {
  isOpen: boolean
  onClose: () => void
  requestType: TimesheetRequestType
  currentStatus?: TimesheetAttendanceStatus
  onSuccess?: () => void
}

const REQUEST_TYPE_CONFIG: Record<TimesheetRequestType, { label: string; timeLabel: string; color: string }> = {
  WORKING: { label: '출근', timeLabel: '출근 시간', color: 'text-emerald-600' },
  BREAK: { label: '휴게', timeLabel: '휴게 시작 시간', color: 'text-amber-600' },
  BREAK_END: { label: '휴게 해제', timeLabel: '복귀 시간', color: 'text-blue-600' },
  OFF: { label: '퇴근', timeLabel: '퇴근 시간', color: 'text-rose-600' },
}

// localStorage 키
const LAST_STORE_KEY = 'timesheet_last_store'

export function AttendanceRequestSheet({
  isOpen,
  onClose,
  requestType,
  currentStatus,
  onSuccess,
}: AttendanceRequestSheetProps) {
  const { user } = useAuthStore()
  const [stores, setStores] = useState<TimesheetStore[]>([])
  const [managers, setManagers] = useState<Array<TimesheetStoreManager & {
    manager?: {
      id: string
      name: string
      profile_image?: string
    }
  }>>([])
  const [selectedStoreId, setSelectedStoreId] = useState<string>('')
  const [selectedManagerId, setSelectedManagerId] = useState<string>('')
  const [requestedTime, setRequestedTime] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const config = REQUEST_TYPE_CONFIG[requestType]
  
  // 출근 요청인지 확인
  const isCheckIn = requestType === 'WORKING' && currentStatus === 'OFF'

  // 현재 시간을 가져오는 헬퍼 함수
  const getCurrentTimeString = () => {
    const now = new Date()
    // 로컬 시간을 datetime-local 형식으로 변환
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16)
  }

  // 시트가 열려있는 동안 현재 시간을 실시간으로 업데이트
  useEffect(() => {
    if (isOpen) {
      // 즉시 현재 시간 설정
      setRequestedTime(getCurrentTimeString())
      
      // 1초마다 현재 시간 업데이트
      const interval = setInterval(() => {
        setRequestedTime(getCurrentTimeString())
      }, 1000)
      
      return () => clearInterval(interval)
    }
  }, [isOpen])

  // 가게 목록 로드 및 출근이 아닌 경우(휴게, 휴게 종료, 퇴근) 현재 출근 기록에서 기본값 설정
  useEffect(() => {
    if (isOpen && user?.id) {
      async function initialize() {
        // 모든 경우에 가게 목록 로드 (가게 변경 가능하도록)
        await loadStores()
        
        // 출근이 아닌 경우(휴게, 휴게 종료, 퇴근): 가게 목록 로드 완료 후 현재 출근 기록에서 가게와 매니저 정보를 기본값으로 설정
        if (!isCheckIn) {
          await loadCurrentRecord()
        }
      }
      initialize()
    }
  }, [isOpen, user?.id, isCheckIn])

  // 출근이 아닌 경우(휴게, 휴게 종료, 퇴근) 현재 출근 기록에서 가게 정보를 기본값으로 설정
  async function loadCurrentRecord() {
    if (!user?.id) return
    
    try {
      const record = await getCurrentAttendanceRecord(user.id)
      if (record) {
        // 현재 출근 기록의 가게를 기본값으로 설정 (매니저는 가게 선택 시 자동 선택됨)
        setSelectedStoreId(record.store_id)
      } else {
        // 출근 기록이 없으면 localStorage에서 가게 복원 시도
        const savedStoreId = localStorage.getItem(LAST_STORE_KEY)
        if (savedStoreId) {
          setSelectedStoreId(savedStoreId)
        }
      }
    } catch (error) {
      console.error('❌ loadCurrentRecord error:', error)
    }
  }

  useEffect(() => {
    // 가게가 선택되면 해당 가게의 매니저 목록 로드 및 첫 번째 매니저 자동 선택
    if (selectedStoreId) {
      loadManagersAndAutoSelect(selectedStoreId)
    } else {
      setManagers([])
      setSelectedManagerId('')
    }
  }, [selectedStoreId])

  // 매니저 로드 후 첫 번째 매니저 자동 선택
  async function loadManagersAndAutoSelect(storeId: string) {
    if (!storeId) {
      setManagers([])
      setSelectedManagerId('')
      return
    }
    
    setIsLoading(true)
    try {
      const managerList = await getStoreManagers(storeId)
      setManagers(managerList)
      
      // 첫 번째 매니저 자동 선택
      if (managerList.length > 0) {
        setSelectedManagerId(managerList[0].manager_id)
      } else {
        setSelectedManagerId('')
      }
    } catch (error) {
      console.error('❌ loadManagersAndAutoSelect error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  async function loadStores() {
    setIsLoading(true)
    try {
      const storeList = await getStores()
      setStores(storeList)
    } catch (error) {
      console.error('❌ loadStores error:', error)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSubmit() {
    if (!user?.id || !selectedStoreId || !selectedManagerId || !requestedTime) {
      return
    }

    setIsSubmitting(true)
    try {
      // 요청 전에 최신 상태 확인 (관리자가 강제로 상태를 변경했을 수 있음)
      const latestStatus = await getCurrentAttendanceStatus(user.id)
      
      // 프론트엔드 상태와 서버 상태 불일치 시 경고
      if (latestStatus !== currentStatus) {
        console.warn('⚠️ 상태 불일치 감지:', { frontend: currentStatus, server: latestStatus })
        // 서버 상태를 기준으로 요청 진행 (서버에서 다시 검증하므로 안전)
      }

      // 파트너+는 항상 현재 시간으로 요청 (시간 조작 방지)
      const now = new Date()
      const requestedTimeISO = now.toISOString()

      const result = await createAttendanceRequest(
        user.id,
        selectedStoreId,
        selectedManagerId,
        requestType,
        requestedTimeISO
      )

      if (result) {
        // 출근 요청 성공 시 가게 정보 저장
        if (isCheckIn) {
          localStorage.setItem(LAST_STORE_KEY, selectedStoreId)
        }
        
        onSuccess?.()
        onClose()
        // 상태 초기화
        setSelectedStoreId('')
        setSelectedManagerId('')
        setRequestedTime('')
      }
    } catch (error) {
      console.error('❌ handleSubmit error:', error)
      // 에러는 createAttendanceRequest에서 이미 토스트로 표시됨
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleClose() {
    setSelectedStoreId('')
    setSelectedManagerId('')
    setRequestedTime('')
    onClose()
  }

  const canSubmit = selectedStoreId && selectedManagerId && requestedTime && !isSubmitting

  // 라벨 사용
  const displayLabel = config.label
  const displayTimeLabel = config.timeLabel

  return (
    <SlideSheet
      isOpen={isOpen}
      onClose={handleClose}
      title={`${displayLabel} 요청`}
      footer={
        <div className="p-4 border-t border-gray-100">
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full"
            variant="primary"
            size="lg"
          >
            {isSubmitting ? '제출 중...' : '요청 제출'}
          </Button>
        </div>
      }
    >
      <div className="p-5 space-y-6">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : (
          <>
            {/* 시간 표시 (파트너+는 변경 불가, 실시간 업데이트) */}
            <div>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                <Clock className={`w-4 h-4 ${config.color}`} />
                {displayTimeLabel}
              </label>
              <div className="w-full px-4 py-3 text-base border border-gray-200 rounded-xl bg-gray-100 text-gray-600">
                {requestedTime ? new Date(requestedTime).toLocaleString('ko-KR', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit'
                }) : '현재 시간'}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                현재 시간이 실시간으로 표시됩니다. 요청 제출 시점의 시간이 적용됩니다.
              </p>
            </div>

            {/* 가게 선택 */}
            <div>
              <label className="text-sm font-semibold text-gray-700 mb-3 block">
                가게 선택 *
              </label>
              <select
                value={selectedStoreId}
                onChange={(e) => setSelectedStoreId(e.target.value)}
                className="w-full px-4 py-3 text-base border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/30 focus:border-[#FE3A8F] bg-gray-50 appearance-none"
              >
                <option value="">가게를 선택하세요</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
              {!isCheckIn && (
                <p className="text-xs text-gray-500 mt-2">
                  현재 출근 중인 가게가 기본 선택됩니다. 필요시 변경 가능합니다.
                </p>
              )}
            </div>

            {/* 가게에 매니저가 없는 경우 안내 */}
            {selectedStoreId && managers.length === 0 && (
              <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                <p className="text-sm text-amber-700">
                  ⚠️ 이 가게에 담당 매니저가 없어 요청을 제출할 수 없습니다.
                </p>
              </div>
            )}

            {/* 안내 메시지 */}
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
              <p className="text-sm text-blue-700">
                💡 요청이 제출되면 담당 매니저의 승인을 기다려야 합니다.
              </p>
            </div>
          </>
        )}
      </div>
    </SlideSheet>
  )
}
