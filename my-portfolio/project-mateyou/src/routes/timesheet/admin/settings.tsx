import { Button, LoadingSpinner } from '@/components'
import { AdminLayout } from '@/components/layouts/AdminLayout'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import {
  getDefaultStoreSchedule,
  getStores,
  updateStoreSchedule,
  type TimesheetStore,
  type TimesheetStoreSchedule,
} from '@/lib/timesheetApi'
import { useAuthStore } from '@/store/useAuthStore'
import { createFileRoute } from '@tanstack/react-router'
import { Clock, Save, Store } from 'lucide-react'
import { useEffect, useState } from 'react'

export const Route = createFileRoute('/timesheet/admin/settings')({
  component: SettingsPage,
})

// 매장별 고정 색상
const STORE_COLORS: Record<string, string> = {
  메이드: 'bg-pink-100 border-pink-300 text-pink-800',
  마츠리: 'bg-amber-100 border-amber-300 text-amber-800',
  데빌: 'bg-red-100 border-red-300 text-red-800',
  이세카이: 'bg-indigo-100 border-indigo-300 text-indigo-800',
  누아르: 'bg-slate-800 border-slate-600 text-slate-100',
}

function getStoreColor(storeName: string): string {
  for (const [key, color] of Object.entries(STORE_COLORS)) {
    if (storeName.includes(key)) {
      return color
    }
  }
  return 'bg-slate-100 border-slate-300 text-slate-800'
}

function SettingsPage() {
  const { user } = useAuthStore()
  useAdminGuard()

  const [stores, setStores] = useState<TimesheetStore[]>([])
  const [storesLoading, setStoresLoading] = useState(false)
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null)
  const [schedule, setSchedule] = useState<TimesheetStoreSchedule | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    loadStores()
  }, [])

  async function loadStores() {
    setStoresLoading(true)
    try {
      const storeList = await getStores({ includeInactive: false })
      setStores(storeList)
      if (storeList.length > 0 && !selectedStoreId) {
        handleSelectStore(storeList[0])
      }
    } catch (error) {
      console.error('❌ loadStores error:', error)
    } finally {
      setStoresLoading(false)
    }
  }

  function handleSelectStore(store: TimesheetStore) {
    setSelectedStoreId(store.id)
    // 저장된 스케줄이 있으면 사용, 없으면 기본값
    const storeSchedule = store.schedule || getDefaultStoreSchedule()
    setSchedule(storeSchedule)
    setHasChanges(false)
  }

  function handleScheduleChange<K extends keyof TimesheetStoreSchedule>(
    field: K,
    value: TimesheetStoreSchedule[K]
  ) {
    if (!schedule) return
    setSchedule({ ...schedule, [field]: value })
    setHasChanges(true)
  }

  async function handleSave() {
    if (!user?.id || !selectedStoreId || !schedule) return

    setIsSaving(true)
    try {
      const success = await updateStoreSchedule(selectedStoreId, schedule, user.id)
      if (success) {
        setHasChanges(false)
        // 스토어 목록 갱신
        await loadStores()
      }
    } finally {
      setIsSaving(false)
    }
  }

  function handleResetToDefault() {
    const selectedStore = stores.find((s) => s.id === selectedStoreId)
    if (!selectedStore) return
    setSchedule(getDefaultStoreSchedule())
    setHasChanges(true)
  }

  const selectedStore = stores.find((s) => s.id === selectedStoreId)

  if (storesLoading) {
    return (
      <AdminLayout activeTab="settings">
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout activeTab="settings">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">근무시간 설정</h2>
          <p className="text-slate-500 mt-1">매장별 출퇴근 시간과 여유 시간을 설정합니다</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* 매장 목록 */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Store className="w-5 h-5 text-indigo-600" />
                매장 선택
              </h3>
              <div className="space-y-2">
                {stores.map((store) => (
                  <button
                    key={store.id}
                    onClick={() => handleSelectStore(store)}
                    className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${
                      selectedStoreId === store.id
                        ? `${getStoreColor(store.name)} font-semibold`
                        : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{store.name}</span>
                      {store.schedule && (
                        <span className="text-xs opacity-60">설정됨</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 설정 폼 */}
          <div className="lg:col-span-3">
            {selectedStore && schedule ? (
              <div className="space-y-6">
                {/* 매장 헤더 */}
                <div className={`rounded-2xl border-2 p-6 ${getStoreColor(selectedStore.name)}`}>
                  <h3 className="text-xl font-bold">{selectedStore.name}</h3>
                  <p className="text-sm opacity-70 mt-1">근무시간 및 여유시간 설정</p>
                </div>

                {/* 평일 설정 */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-blue-600" />
                    평일 (월~금) 근무시간
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        출근 시간
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={schedule.weekday_start_hour}
                          onChange={(e) =>
                            handleScheduleChange('weekday_start_hour', Number(e.target.value))
                          }
                          className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          {Array.from({ length: 24 }, (_, i) => (
                            <option key={i} value={i}>
                              {String(i).padStart(2, '0')}시
                            </option>
                          ))}
                        </select>
                        <select
                          value={schedule.weekday_start_minute}
                          onChange={(e) =>
                            handleScheduleChange('weekday_start_minute', Number(e.target.value))
                          }
                          className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          {[0, 15, 30, 45].map((m) => (
                            <option key={m} value={m}>
                              {String(m).padStart(2, '0')}분
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        퇴근 시간
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={schedule.weekday_end_hour}
                          onChange={(e) =>
                            handleScheduleChange('weekday_end_hour', Number(e.target.value))
                          }
                          className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          {Array.from({ length: 24 }, (_, i) => (
                            <option key={i} value={i}>
                              {String(i).padStart(2, '0')}시
                            </option>
                          ))}
                        </select>
                        <select
                          value={schedule.weekday_end_minute}
                          onChange={(e) =>
                            handleScheduleChange('weekday_end_minute', Number(e.target.value))
                          }
                          className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          {[0, 15, 30, 45].map((m) => (
                            <option key={m} value={m}>
                              {String(m).padStart(2, '0')}분
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-slate-500 mt-3">
                    기준 근무시간:{' '}
                    <span className="font-semibold text-indigo-600">
                      {(
                        (schedule.weekday_end_hour * 60 +
                          schedule.weekday_end_minute -
                          (schedule.weekday_start_hour * 60 + schedule.weekday_start_minute)) /
                        60
                      ).toFixed(1)}
                      시간
                    </span>
                  </p>
                </div>

                {/* 주말 설정 */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <h4 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-orange-600" />
                    주말 (토~일) 근무시간
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        출근 시간
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={schedule.weekend_start_hour}
                          onChange={(e) =>
                            handleScheduleChange('weekend_start_hour', Number(e.target.value))
                          }
                          className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          {Array.from({ length: 24 }, (_, i) => (
                            <option key={i} value={i}>
                              {String(i).padStart(2, '0')}시
                            </option>
                          ))}
                        </select>
                        <select
                          value={schedule.weekend_start_minute}
                          onChange={(e) =>
                            handleScheduleChange('weekend_start_minute', Number(e.target.value))
                          }
                          className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          {[0, 15, 30, 45].map((m) => (
                            <option key={m} value={m}>
                              {String(m).padStart(2, '0')}분
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        퇴근 시간
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={schedule.weekend_end_hour}
                          onChange={(e) =>
                            handleScheduleChange('weekend_end_hour', Number(e.target.value))
                          }
                          className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          {Array.from({ length: 24 }, (_, i) => (
                            <option key={i} value={i}>
                              {String(i).padStart(2, '0')}시
                            </option>
                          ))}
                        </select>
                        <select
                          value={schedule.weekend_end_minute}
                          onChange={(e) =>
                            handleScheduleChange('weekend_end_minute', Number(e.target.value))
                          }
                          className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          {[0, 15, 30, 45].map((m) => (
                            <option key={m} value={m}>
                              {String(m).padStart(2, '0')}분
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                  <p className="text-sm text-slate-500 mt-3">
                    기준 근무시간:{' '}
                    <span className="font-semibold text-orange-600">
                      {(
                        (schedule.weekend_end_hour * 60 +
                          schedule.weekend_end_minute -
                          (schedule.weekend_start_hour * 60 + schedule.weekend_start_minute)) /
                        60
                      ).toFixed(1)}
                      시간
                    </span>
                  </p>
                </div>

                {/* 여유 시간 설정 */}
                <div className="bg-white rounded-2xl border border-slate-200 p-6">
                  <h4 className="font-semibold text-slate-900 mb-4">⏱️ 판정 기준 설정</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        지각 기준 (출근 시간 초과)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={schedule.late_threshold_minutes}
                          onChange={(e) =>
                            handleScheduleChange(
                              'late_threshold_minutes',
                              Math.max(0, Number(e.target.value))
                            )
                          }
                          className="w-20 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          min={0}
                        />
                        <span className="text-slate-600">분 초과 시 지각</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        예: 5분이면 출근시간 +5분까지는 정상
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        조기퇴근 기준 (퇴근 시간 미만)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={schedule.early_leave_threshold_minutes}
                          onChange={(e) =>
                            handleScheduleChange(
                              'early_leave_threshold_minutes',
                              Math.max(0, Number(e.target.value))
                            )
                          }
                          className="w-20 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          min={0}
                        />
                        <span className="text-slate-600">분 전 퇴근 시 조기퇴근</span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        예: 5분이면 퇴근시간 -5분까지는 정상
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        시간미달 기준
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={schedule.undertime_threshold_minutes}
                          onChange={(e) =>
                            handleScheduleChange(
                              'undertime_threshold_minutes',
                              Math.max(0, Number(e.target.value))
                            )
                          }
                          className="w-20 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          min={0}
                        />
                        <span className="text-slate-600">분 미달 시 시간미달</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        시간초과 기준
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          value={schedule.overtime_threshold_minutes}
                          onChange={(e) =>
                            handleScheduleChange(
                              'overtime_threshold_minutes',
                              Math.max(0, Number(e.target.value))
                            )
                          }
                          className="w-20 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          min={0}
                        />
                        <span className="text-slate-600">분 초과 시 시간초과</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 버튼 영역 */}
                <div className="flex justify-between items-center">
                  <button
                    onClick={handleResetToDefault}
                    className="text-sm text-slate-500 hover:text-slate-700 underline"
                  >
                    기본값으로 초기화
                  </button>
                  <div className="flex gap-3">
                    {hasChanges && (
                      <span className="text-sm text-amber-600 flex items-center gap-1">
                        ⚠️ 저장되지 않은 변경사항이 있습니다
                      </span>
                    )}
                    <Button
                      onClick={handleSave}
                      variant="primary"
                      disabled={isSaving || !hasChanges}
                    >
                      {isSaving ? (
                        '저장 중...'
                      ) : (
                        <>
                          <Save className="w-4 h-4 mr-1.5" />
                          저장
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                <Store className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">매장을 선택해주세요</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}

