import { Avatar, Button, Input } from '@/components'
import { DateRangeCalendar } from '@/components/features/timesheet'
import { AdminLayout } from '@/components/layouts/AdminLayout'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import {
  getAuditLogs,
  getStores,
  type TimesheetAuditAction,
  type TimesheetAuditLog,
  type TimesheetStore,
} from '@/lib/timesheetApi'
import { createFileRoute } from '@tanstack/react-router'
import { clsx, type ClassValue } from 'clsx'
import { ChevronDown, Code, Eye, EyeOff } from 'lucide-react'
import React, { useEffect, useState } from 'react'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const Route = createFileRoute('/timesheet/admin/audit')({
  component: AuditPage,
})

const actionLabels: Record<string, string> = {
  // 근태 관련
  attendance_request: '근태 요청',
  attendance_approve: '근태 승인',
  attendance_reject: '근태 반려',
  attendance_cancel: '근태 요청 취소',
  attendance_create: '근태 생성',
  attendance_modify: '근태 수정',
  attendance_delete: '근태 삭제',
  // 파트너+ 관련
  partner_plus_add: '파트너+ 추가',
  partner_plus_remove: '파트너+ 삭제',
  // 파트너 매니저 관련
  partner_manager_assign: '파트너 매니저 할당',
  partner_manager_unassign: '파트너 매니저 해제',
  // 가게 관련
  store_create: '가게 생성',
  store_update: '가게 정보 수정',
  store_activate: '가게 활성화',
  store_deactivate: '가게 비활성화',
  // 가게-매니저 관계
  store_manager_add: '가게 매니저 추가',
  store_manager_remove: '가게 매니저 제거',
}

const actionBadgeColors: Record<string, { bg: string; text: string }> = {
  // 근태 관련
  attendance_request: { bg: 'bg-blue-100', text: 'text-blue-700' },
  attendance_approve: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  attendance_reject: { bg: 'bg-rose-100', text: 'text-rose-700' },
  attendance_cancel: { bg: 'bg-amber-100', text: 'text-amber-700' },
  attendance_create: { bg: 'bg-teal-100', text: 'text-teal-700' },
  attendance_modify: { bg: 'bg-orange-100', text: 'text-orange-700' },
  attendance_delete: { bg: 'bg-red-100', text: 'text-red-700' },
  // 파트너+ 관련
  partner_plus_add: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  partner_plus_remove: { bg: 'bg-rose-100', text: 'text-rose-700' },
  // 파트너 매니저 관련
  partner_manager_assign: { bg: 'bg-indigo-100', text: 'text-indigo-700' },
  partner_manager_unassign: { bg: 'bg-slate-100', text: 'text-slate-700' },
  // 가게 관련
  store_create: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  store_update: { bg: 'bg-blue-100', text: 'text-blue-700' },
  store_activate: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  store_deactivate: { bg: 'bg-slate-100', text: 'text-slate-700' },
  // 가게-매니저 관계
  store_manager_add: { bg: 'bg-teal-100', text: 'text-teal-700' },
  store_manager_remove: { bg: 'bg-rose-100', text: 'text-rose-700' },
}

// 변경 내용 렌더링 컴포넌트
function ChangesDisplay({ changes }: { changes?: Array<{ field: string; label: string; before: any; after: any }> }) {
  if (!changes || changes.length === 0) return null

  return (
    <div className="mt-4 space-y-2">
      <h5 className="text-xs font-bold text-slate-500 uppercase tracking-widest">실시간 변경 요약</h5>
      <div className="grid grid-cols-1 gap-2">
        {changes.map((change, index) => (
          <div key={index} className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm bg-white border border-slate-100 rounded-xl px-4 py-3 shadow-sm">
            <span className="font-semibold text-slate-700 sm:w-24 shrink-0">{change.label}</span>
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="text-rose-500 line-through truncate opacity-60 italic">{String(change.before ?? '(없음)')}</span>
              <span className="text-slate-300 text-xs text-center shrink-0">━━▶</span>
              <span className="text-emerald-600 font-bold truncate">{String(change.after ?? '(없음)')}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// JSON 뷰어 컴포넌트
function JsonViewer({ data, title }: { data: any; title?: string }) {
  const [isOpen, setIsOpen] = useState(false)

  if (!data) return null

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-indigo-100 bg-indigo-50/30">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen(!isOpen)
        }}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Code className="w-4 h-4" />
          <span>{title || '원본 데이터 (JSON Snapshot)'}</span>
        </div>
        {isOpen ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
      {isOpen && (
        <div className="p-4 bg-slate-900 overflow-x-auto max-h-[400px]">
          <pre className="text-xs text-indigo-200 font-mono leading-relaxed">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

// 엔티티 스냅샷 비교 뷰어
function SnapshotComparison({ before, after, title }: { before?: any; after?: any; title?: string }) {
  if (!before && !after) return null

  return (
    <div className="mt-4 space-y-3">
      <h5 className="text-xs font-bold text-slate-500 uppercase tracking-widest">{title || '데이터 스냅샷'}</h5>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {before && (
          <div className="rounded-2xl border border-rose-100 bg-rose-50/30 p-4">
            <h6 className="text-[10px] font-bold text-rose-600 uppercase mb-2">변경 전 (Before)</h6>
            <pre className="text-[11px] text-rose-800 font-mono overflow-x-auto max-h-60 leading-tight">
              {JSON.stringify(before, null, 2)}
            </pre>
          </div>
        )}
        {after && (
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/30 p-4">
            <h6 className="text-[10px] font-bold text-emerald-600 uppercase mb-2">변경 후 (After)</h6>
            <pre className="text-[11px] text-emerald-800 font-mono overflow-x-auto max-h-60 leading-tight">
              {JSON.stringify(after, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}

function AuditPage() {
  useAdminGuard()
  const [auditLogs, setAuditLogs] = useState<TimesheetAuditLog[]>([])
  const [auditLogsLoading, setAuditLogsLoading] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [offset, setOffset] = useState(0)
  const LIMIT = 50
  const [auditFilters, setAuditFilters] = useState({
    searchQuery: '',
    action: '' as TimesheetAuditAction | '',
    actorRole: '',
    startDate: '',
    endDate: '',
    storeId: '',
    partnerPlusId: '',
  })
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null)
  const [stores, setStores] = useState<TimesheetStore[]>([])

  useEffect(() => {
    loadStores()
    handleResetAndLoad()
  }, [])

  function handleResetAndLoad() {
    setOffset(0)
    setHasMore(true)
    loadAuditLogs(0, true)
  }

  async function loadStores() {
    try {
      const storeList = await getStores({ includeInactive: true })
      setStores(storeList)
    } catch (error) {
      console.error('❌ loadStores error:', error)
    }
  }

  async function loadAuditLogs(currentOffset: number = offset, reset: boolean = false) {
    setAuditLogsLoading(true)
    try {
      const logs = await getAuditLogs({
        limit: LIMIT,
        offset: currentOffset,
        action: auditFilters.action || undefined,
        actorRole: auditFilters.actorRole || undefined,
        startDate: auditFilters.startDate || undefined,
        endDate: auditFilters.endDate || undefined,
        searchQuery: auditFilters.searchQuery || undefined,
        storeId: auditFilters.storeId || undefined,
        partnerPlusId: auditFilters.partnerPlusId || undefined,
      })
      
      if (reset) {
        setAuditLogs(logs)
      } else {
        setAuditLogs(prev => [...prev, ...logs])
      }
      
      setHasMore(logs.length === LIMIT)
      setOffset(currentOffset + logs.length)
    } catch (error) {
      console.error('❌ loadAuditLogs error:', error)
    } finally {
      setAuditLogsLoading(false)
    }
  }

  function handleLoadMore(e?: React.MouseEvent<HTMLButtonElement>) {
    e?.preventDefault()
    e?.stopPropagation()
    if (auditLogsLoading || !hasMore) return
    loadAuditLogs(offset, false)
  }

  return (
    <AdminLayout activeTab="audit">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">감사 로그</h2>
          <p className="text-slate-500 mt-1">시스템 내 모든 활동 기록을 확인하세요</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="sm:col-span-2 lg:col-span-1">
                <label className="block text-sm font-medium text-slate-700 mb-2">검색</label>
                <Input
                  value={auditFilters.searchQuery}
                  onChange={(e) => setAuditFilters({ ...auditFilters, searchQuery: e.target.value })}
                  placeholder="이름, 가게명, 사유로 검색..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      loadAuditLogs()
                    }
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">활동 타입</label>
                <select
                  value={auditFilters.action}
                  onChange={(e) => setAuditFilters({ ...auditFilters, action: e.target.value as TimesheetAuditAction | '' })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="">전체</option>
                  {Object.entries(actionLabels).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">역할</label>
                <select
                  value={auditFilters.actorRole}
                  onChange={(e) => setAuditFilters({ ...auditFilters, actorRole: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="">전체</option>
                  <option value="partner_plus">파트너+</option>
                  <option value="partner_manager">파트너 매니저</option>
                  <option value="admin">관리자</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">가게</label>
                <select
                  value={auditFilters.storeId}
                  onChange={(e) => setAuditFilters({ ...auditFilters, storeId: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="">전체 가게</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>{store.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">날짜 범위</label>
              <DateRangeCalendar
                startDate={auditFilters.startDate}
                endDate={auditFilters.endDate}
                onChange={(start, end) => setAuditFilters({ ...auditFilters, startDate: start, endDate: end })}
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                onClick={() => {
                  setAuditFilters({
                    searchQuery: '',
                    action: '',
                    actorRole: '',
                    startDate: '',
                    endDate: '',
                    storeId: '',
                    partnerPlusId: '',
                  })
                  setTimeout(() => loadAuditLogs(), 100)
                  setTimeout(() => handleResetAndLoad(), 100)
                }}
                variant="secondary"
                size="sm"
              >
                초기화
              </Button>
              <Button onClick={handleResetAndLoad} variant="primary" size="sm">
                조회하기
              </Button>
            </div>
          </div>
        </div>

        {auditLogsLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : auditLogs.length > 0 ? (
          <>
            {/* 모바일: 카드 형태 */}
            <div className="md:hidden space-y-3">
              {auditLogs.map((log) => {
                const colors = actionBadgeColors[log.action] || { bg: 'bg-slate-100', text: 'text-slate-700' }
                const isExpanded = expandedLogId === log.id
                return (
                  <div 
                    key={log.id} 
                    className="bg-white rounded-2xl border border-slate-200 p-4 cursor-pointer transition-colors active:bg-slate-50"
                    onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {log.actor && (
                          <Avatar
                            src={log.actor.profile_image}
                            alt={log.actor.name}
                            size="sm"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-900 truncate">{log.actor?.name || '알 수 없음'}</p>
                          <p className="text-xs text-slate-500">
                            {log.actor_role === 'partner_plus' ? '파트너+' : log.actor_role === 'partner_manager' ? '파트너 매니저' : log.actor_role}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text} flex-shrink-0`}>
                          {actionLabels[log.action] || log.action}
                        </span>
                        <ChevronDown 
                          className={`w-5 h-5 text-slate-400 transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} 
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2 text-sm">
                      {log.metadata?.store_name && (
                        <div className="text-slate-600">
                          <span className="font-medium">가게:</span> {log.metadata.store_name}
                        </div>
                      )}
                      {log.metadata?.partner_plus_name && (
                        <div className="text-slate-600">
                          <span className="font-medium">파트너+:</span> {log.metadata.partner_plus_name}
                        </div>
                      )}
                      <div className="text-slate-500 text-xs">
                        {new Date(log.created_at).toLocaleString('ko-KR', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t border-slate-200 space-y-4 text-sm">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <h4 className="font-bold text-slate-400 text-[10px] uppercase tracking-tighter mb-1">액션 정보</h4>
                            <div className="space-y-1 text-slate-600 text-xs">
                              <div><span className="font-medium">타입:</span> {actionLabels[log.action] || log.action}</div>
                              <div><span className="font-medium">대상:</span> {log.target_type || '-'}</div>
                            </div>
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-400 text-[10px] uppercase tracking-tighter mb-1">추가 정보</h4>
                            <div className="space-y-1 text-slate-600 text-xs">
                              {log.metadata?.request_type_label && (
                                <div><span className="font-medium text-emerald-600">유형: {log.metadata.request_type_label}</span></div>
                              )}
                              {log.metadata?.approved_time && <div className="text-indigo-600 font-medium tracking-tighter">시간 수정 승인됨</div>}
                            </div>
                          </div>
                        </div>

                        {log.reason && (
                          <div className="p-3 bg-amber-50 rounded-2xl border border-amber-100">
                            <span className="font-bold text-amber-900 text-xs">사유:</span>
                            <p className="text-amber-800 mt-1 text-xs break-all">{log.reason}</p>
                          </div>
                        )}

                        {/* 변경 내역 요약 */}
                        {log.metadata?.changes && log.metadata.changes.length > 0 && (
                          <ChangesDisplay changes={log.metadata.changes} />
                        )}

                        {/* 스냅샷 비교 (Before/After) */}
                        {(log.metadata?.before || log.metadata?.after) && (
                          <SnapshotComparison 
                            before={log.metadata.before || log.metadata.request_snapshot || log.metadata.role_before || log.metadata.assignment_before} 
                            after={log.metadata.after || log.metadata.role_after || log.metadata.assignment_after}
                          />
                        )}

                        {/* 원본 데이터 */}
                        <JsonViewer data={log.metadata} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* 데스크톱: 테이블 형태 */}
            <div className="hidden md:block bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-10"></th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">수행자</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">활동</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">대상</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">시간</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {auditLogs.map((log) => (
                      <>
                        <tr 
                          key={log.id} 
                          className="hover:bg-slate-50 cursor-pointer transition-colors"
                          onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                        >
                          <td className="px-6 py-4">
                            <ChevronDown 
                              className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${expandedLogId === log.id ? 'rotate-180' : ''}`} 
                            />
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              {log.actor && (
                                <Avatar
                                  src={log.actor.profile_image}
                                  alt={log.actor.name}
                                  size="sm"
                                />
                              )}
                              <div>
                                <p className="font-medium text-slate-900">{log.actor?.name || '알 수 없음'}</p>
                                <p className="text-xs text-slate-500">
                                  {log.actor_role === 'partner_plus' ? '파트너+' : log.actor_role === 'partner_manager' ? '파트너 매니저' : log.actor_role}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            {(() => {
                              const colors = actionBadgeColors[log.action] || { bg: 'bg-slate-100', text: 'text-slate-700' }
                              return (
                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
                                  {actionLabels[log.action] || log.action}
                                </span>
                              )
                            })()}
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-slate-600 space-y-0.5">
                              {log.metadata?.store_name && (
                                <div>가게: <span className="font-medium">{log.metadata.store_name}</span></div>
                              )}
                              {log.metadata?.partner_plus_name && (
                                <div>파트너+: <span className="font-medium">{log.metadata.partner_plus_name}</span></div>
                              )}
                              {log.metadata?.member_name && (
                                <div>회원: <span className="font-medium">{log.metadata.member_name}</span></div>
                              )}
                              {log.metadata?.manager_name && !log.metadata?.member_name && (
                                <div>매니저: <span className="font-medium">{log.metadata.manager_name}</span></div>
                              )}
                              {/* 변경 내용 미리보기 */}
                              {log.metadata?.changes && log.metadata.changes.length > 0 && (
                                <div className="mt-1 text-xs text-slate-500">
                                  {log.metadata.changes.map((c: any, i: number) => (
                                    <span key={i} className="inline-block bg-slate-100 rounded px-1.5 py-0.5 mr-1">
                                      {c.label}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-500 whitespace-nowrap">
                            {new Date(log.created_at).toLocaleString('ko-KR', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                        </tr>
                        {expandedLogId === log.id && (
                          <tr key={`${log.id}-detail`}>
                            <td colSpan={5} className="px-6 py-6 bg-slate-50/50">
                              <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                  <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
                                    <h4 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                      작업 정보
                                    </h4>
                                    <div className="space-y-2 text-slate-600 text-sm">
                                      <div className="flex justify-between border-b border-slate-50 pb-1.5">
                                        <span className="text-slate-400">액션 타입</span>
                                        <span className="font-medium text-slate-900">{actionLabels[log.action] || log.action}</span>
                                      </div>
                                      <div className="flex justify-between border-b border-slate-50 pb-1.5">
                                        <span className="text-slate-400">기록 ID</span>
                                        <span className="font-mono text-[11px] text-slate-400">{log.id}</span>
                                      </div>
                                      <div className="flex justify-between border-b border-slate-50 pb-1.5">
                                        <span className="text-slate-400">대상 타입</span>
                                        <span className="font-medium text-slate-700">{log.target_type || '-'}</span>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm md:col-span-2">
                                    <h4 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                                      컨텍스트 상세
                                    </h4>
                                    <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                                      {log.metadata?.request_type_label && (
                                        <div className="flex justify-between border-b border-slate-50 pb-1.5">
                                          <span className="text-slate-400">요청 유형</span>
                                          <span className="font-bold text-indigo-600">{log.metadata.request_type_label}</span>
                                        </div>
                                      )}
                                      {log.metadata?.store_name && (
                                        <div className="flex justify-between border-b border-slate-50 pb-1.5">
                                          <span className="text-slate-400">관련 매장</span>
                                          <span className="font-medium text-slate-900">{log.metadata.store_name}</span>
                                        </div>
                                      )}
                                      {log.metadata?.partner_plus_name && (
                                        <div className="flex justify-between border-b border-slate-50 pb-1.5">
                                          <span className="text-slate-400">파트너+</span>
                                          <span className="font-medium text-slate-900">{log.metadata.partner_plus_name}</span>
                                        </div>
                                      )}
                                      {log.metadata?.requested_time && (
                                        <div className="flex justify-between border-b border-slate-50 pb-1.5">
                                          <span className="text-slate-400">요청 시각(지정)</span>
                                          <span className="text-slate-900">{new Date(log.metadata.requested_time).toLocaleString('ko-KR')}</span>
                                        </div>
                                      )}
                                      {log.metadata?.approved_time && (
                                        <div className="flex justify-between border-b border-slate-50 pb-1.5">
                                          <span className="text-slate-400">승인 시각(지정)</span>
                                          <span className="text-slate-900 font-bold text-emerald-600">{new Date(log.metadata.approved_time).toLocaleString('ko-KR')}</span>
                                        </div>
                                      )}
                                    </div>

                                    {log.reason && (
                                      <div className="mt-4 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                                        <div className="text-amber-900 font-bold text-xs flex items-center gap-1.5 mb-1">
                                          <div className="w-1 h-3 bg-amber-400 rounded-full" />
                                          첨부 사유
                                        </div>
                                        <p className="text-amber-800 text-sm leading-relaxed">{log.reason}</p>
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* 변경 사항 (구조화 데이터) */}
                                {log.metadata?.changes && log.metadata.changes.length > 0 && (
                                  <div className="bg-slate-50 border border-slate-200 p-5 rounded-3xl">
                                    <ChangesDisplay changes={log.metadata.changes} />
                                  </div>
                                )}

                                {/* 스냅샷 비교 (Before/After) */}
                                {(log.metadata?.before || log.metadata?.after || log.metadata?.request_snapshot || log.metadata?.role_before || log.metadata?.assignment_before) && (
                                  <div className="bg-slate-50 border border-slate-200 p-5 rounded-3xl">
                                    <SnapshotComparison 
                                      before={log.metadata.before || log.metadata.request_snapshot || log.metadata.role_before || log.metadata.assignment_before} 
                                      after={log.metadata.after || log.metadata.role_after || log.metadata.assignment_after}
                                      title="전체 데이터 스냅샷 비교 (JSON)"
                                    />
                                  </div>
                                )}

                                {/* 원본 JSON 메타데이터 */}
                                <JsonViewer data={log.metadata} title="모든 데이터 필드 확인 (Raw Metadata)" />
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {hasMore && (
                <div className="mt-8 flex justify-center pb-8">
                  <Button 
                    type="button"
                    onClick={handleLoadMore} 
                    variant="secondary" 
                    isLoading={auditLogsLoading}
                    className="px-8 shadow-sm"
                  >
                    더 보기 (현재 {auditLogs.length}개)
                  </Button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <p className="text-slate-400">감사 로그가 없습니다.</p>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
