import { StatsFilters } from '@/components/features/timesheet/stats/StatsFilters'
import { StatsList } from '@/components/features/timesheet/stats/StatsList'
import { StatsSummary } from '@/components/features/timesheet/stats/StatsSummary'
import { TimeEditModal } from '@/components/features/timesheet/stats/TimeEditModal'
import { AttendanceAddModal } from '@/components/features/timesheet/stats/AttendanceAddModal'
import { AttendanceDeleteConfirm } from '@/components/features/timesheet/stats/AttendanceDeleteConfirm'
import { AdminLayout } from '@/components/layouts/AdminLayout'
import { useAttendanceStats } from '@/hooks/useAttendanceStats'
import { createFileRoute } from '@tanstack/react-router'
import { ArrowDownAZ, BarChart3, Clock, LayoutGrid, Users } from 'lucide-react'

export const Route = createFileRoute('/timesheet/admin/stats')({
  component: StatsPage,
})

function StatsPage() {
  const {
    statsDateRange, setStatsDateRange,
    selectedStoreForStats, setSelectedStoreForStats,
    selectedPartnerIds, setSelectedPartnerIds,
    sortBy, setSortBy,
    groupBy, setGroupBy,
    partnerDetailView, setPartnerDetailView,
    stores,
    stats,
    statsLoading,
    sortedPartners,
    groupedByStore,
    calendarMonths, setCalendarMonths,
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
    loadStats,
    addModalOpen, setAddModalOpen,
    isAdding,
    handleAddRecord,
    deleteModalOpen, setDeleteModalOpen,
    deletingRecord,
    isDeleting,
    handleDeleteRecord,
    handleConfirmDelete,
  } = useAttendanceStats()

  return (
    <AdminLayout activeTab="stats">
      <div className="max-w-7xl mx-auto space-y-5">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">근태 통계 및 정산</h2>
          <p className="text-slate-500 mt-1">기간별 근무 시간과 정산 내역을 확인하세요</p>
        </div>
        
        {/* 필터 */}
        <StatsFilters
          statsDateRange={statsDateRange}
          setStatsDateRange={setStatsDateRange}
          selectedStoreForStats={selectedStoreForStats}
          setSelectedStoreForStats={setSelectedStoreForStats}
          selectedPartnerIds={selectedPartnerIds}
          setSelectedPartnerIds={setSelectedPartnerIds}
          stores={stores}
          stats={stats}
          loadStats={loadStats}
        />

        {statsLoading ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#FE3A8F]/20 to-[#FE3A8F]/10 flex items-center justify-center mb-4">
              <BarChart3 className="w-6 h-6 text-[#FE3A8F] animate-pulse" />
            </div>
            <p className="text-gray-600 font-medium">통계 데이터를 불러오는 중...</p>
            <p className="text-xs text-gray-400 mt-1">잠시만 기다려주세요</p>
          </div>
        ) : stats ? (
          <>
            {/* 요약 */}
            <StatsSummary summary={stats.summary} />

            {/* 컨트롤 바 */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-4">
                  {/* 그룹 */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-400">그룹</span>
                    <div className="flex bg-gray-100 rounded-xl p-1">
                      <button
                        onClick={() => setGroupBy('partner')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all touch-manipulation ${
                          groupBy === 'partner' ? 'bg-white text-[#FE3A8F] shadow-sm' : 'text-gray-500 hover:text-gray-700 active:text-gray-900'
                        }`}
                      >
                        <Users className="w-3.5 h-3.5" /> 파트너별
                      </button>
                      <button
                        onClick={() => setGroupBy('store')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all touch-manipulation ${
                          groupBy === 'store' ? 'bg-white text-[#FE3A8F] shadow-sm' : 'text-gray-500 hover:text-gray-700 active:text-gray-900'
                        }`}
                      >
                        <LayoutGrid className="w-3.5 h-3.5" /> 가게별
                      </button>
                    </div>
                  </div>

                  {/* 정렬 */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-400">정렬</span>
                    <div className="flex bg-gray-100 rounded-xl p-1">
                      <button
                        onClick={() => setSortBy('name')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all touch-manipulation ${
                          sortBy === 'name' ? 'bg-white text-[#FE3A8F] shadow-sm' : 'text-gray-500 hover:text-gray-700 active:text-gray-900'
                        }`}
                      >
                        <ArrowDownAZ className="w-3.5 h-3.5" /> 이름순
                      </button>
                      <button
                        onClick={() => setSortBy('work')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all touch-manipulation ${
                          sortBy === 'work' ? 'bg-white text-[#FE3A8F] shadow-sm' : 'text-gray-500 hover:text-gray-700 active:text-gray-900'
                        }`}
                      >
                        <Clock className="w-3.5 h-3.5" /> 근무시간순
                      </button>
                    </div>
                  </div>
                </div>
                
                {/* 결과 수 */}
                <div className="text-sm text-gray-500">
                  {groupBy === 'partner' ? (
                    <>총 <span className="font-bold text-[#FE3A8F]">{sortedPartners.length}</span>명</>
                  ) : (
                    <>총 <span className="font-bold text-blue-500">{groupedByStore.length}</span>개 가게</>
                  )}
                </div>
              </div>
            </div>

            {/* 목록 */}
            <StatsList
              groupBy={groupBy}
              sortBy={sortBy}
              sortedPartners={sortedPartners}
              groupedByStore={groupedByStore}
              partnerDetailView={partnerDetailView}
              setPartnerDetailView={setPartnerDetailView}
              handleEditTime={handleEditTime}
              handleDeleteRecord={handleDeleteRecord}
              onAddClick={() => setAddModalOpen(true)}
              calendarMonths={calendarMonths}
              setCalendarMonths={setCalendarMonths}
            />
          </>
        ) : (
          <div className="text-center py-20 bg-white rounded-2xl border border-gray-100 border-dashed">
            <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">조회된 데이터가 없습니다</p>
            <p className="text-sm text-gray-400 mt-1">위의 필터를 설정하고 조회 버튼을 눌러주세요</p>
          </div>
        )}
      </div>

      {/* 수정 모달 */}
      <TimeEditModal
        isOpen={timeEditModalOpen}
        onClose={() => setTimeEditModalOpen(false)}
        onSave={handleSaveTimeEdit}
        isSaving={isSaving}
        editingRecord={editingRecord}
        editStartedAt={editStartedAt}
        setEditStartedAt={setEditStartedAt}
        editEndedAt={editEndedAt}
        setEditEndedAt={setEditEndedAt}
        editBreakRecords={editBreakRecords}
        setEditBreakRecords={setEditBreakRecords}
        editModificationReason={editModificationReason}
        setEditModificationReason={setEditModificationReason}
        editStoreId={editStoreId}
        setEditStoreId={setEditStoreId}
        stores={stores}
      />

      {/* 추가 모달 */}
      <AttendanceAddModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSave={handleAddRecord}
        stores={stores}
        isSaving={isAdding}
      />

      {/* 삭제 확인 모달 */}
      <AttendanceDeleteConfirm
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false)
        }}
        onConfirm={handleConfirmDelete}
        record={deletingRecord ? {
          date: deletingRecord.date,
          partnerName: deletingRecord.partnerName || '',
          startedAt: deletingRecord.started_at,
          endedAt: deletingRecord.ended_at,
          storeName: deletingRecord.store_name,
        } : null}
        isDeleting={isDeleting}
      />
    </AdminLayout>
  )
}
