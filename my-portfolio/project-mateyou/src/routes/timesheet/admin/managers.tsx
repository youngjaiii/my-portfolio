import { Avatar, Button, Flex, LoadingSpinner, MemberAutocomplete, Modal } from '@/components'
import { AdminLayout } from '@/components/layouts/AdminLayout'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import { useConfirm } from '@/hooks/useConfirm'
import type { TimesheetStore } from '@/lib/timesheetApi'
import {
    assignManager,
    getAllManagers,
    unassignManager,
} from '@/lib/timesheetApi'
import { useAuthStore } from '@/store/useAuthStore'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

export const Route = createFileRoute('/timesheet/admin/managers')({
  component: ManagersPage,
})

function ManagersPage() {
  const { user } = useAuthStore()
  useAdminGuard()
  const confirm = useConfirm()

  const [managers, setManagers] = useState<any[]>([])
  const [managersLoading, setManagersLoading] = useState(false) // Reverted the partial edit here
  const [managerAssignModalOpen, setManagerAssignModalOpen] = useState(false)
  const [selectedMemberId, setSelectedMemberId] = useState('')

  useEffect(() => {
    loadManagers()
  }, [])

  async function loadManagers() {
    setManagersLoading(true)
    try {
      const managerList = await getAllManagers()
      setManagers(managerList)
    } catch (error) {
      console.error('❌ loadManagers error:', error)
    } finally {
      setManagersLoading(false)
    }
  }

  async function handleAssignManager() {
    if (!user?.id || !selectedMemberId) return

    const success = await assignManager(selectedMemberId, user.id)
    if (success) {
      setManagerAssignModalOpen(false)
      setSelectedMemberId('')
      await loadManagers()
    }
  }

  function handleOpenManagerAssignModal() {
    setSelectedMemberId('')
    setManagerAssignModalOpen(true)
  }

  async function handleUnassignManager(memberId: string) {
    if (!user?.id) return

    if (await confirm({
      title: '매니저 해제',
      message: '정말 매니저를 해제하시겠습니까?',
      variant: 'danger'
    })) {
      const success = await unassignManager(memberId, user.id)
      if (success) {
        await loadManagers()
      }
    }
  }

  return (
    <AdminLayout activeTab="managers">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">매니저 관리</h2>
            <p className="text-slate-500 mt-1">매니저를 지정하고 관리하세요</p>
          </div>
          <Button onClick={handleOpenManagerAssignModal} variant="primary">
            + 매니저 지정
          </Button>
        </div>

        {managersLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : managers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {managers.map((manager) => (
              <div
                key={manager.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-4">
                  <Avatar
                    src={manager.profile_image}
                    alt={manager.name}
                    size="lg"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 truncate">{manager.name}</h3>
                    {manager.stores && manager.stores.length > 0 ? (
                      <p className="text-sm text-slate-500 truncate">
                        {manager.stores.map((s: TimesheetStore) => s.name).join(', ')}
                      </p>
                    ) : (
                      <p className="text-sm text-slate-400">할당된 가게 없음</p>
                    )}
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <Button
                    onClick={() => handleUnassignManager(manager.id)}
                    variant="secondary"
                    size="sm"
                    className="w-full"
                  >
                    매니저 해제
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <p className="text-slate-400">등록된 매니저가 없습니다.</p>
          </div>
        )}
      </div>

      <Modal
        isOpen={managerAssignModalOpen}
        onClose={() => {
          setManagerAssignModalOpen(false)
          setSelectedMemberId('')
        }}
        title="매니저 지정"
      >
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">회원 선택</label>
            <MemberAutocomplete
              value={selectedMemberId}
              onChange={setSelectedMemberId}
              placeholder="이름, 이메일, 닉네임으로 검색..."
              selectedIds={managers.map(m => m.id)}
              showSelectedDisplay
            />
          </div>
          <Flex gap={2} justify="end" className="pt-4">
            <Button
              onClick={() => {
                setManagerAssignModalOpen(false)
                setSelectedMemberId('')
              }}
              variant="secondary"
            >
              취소
            </Button>
            <Button onClick={handleAssignManager} variant="primary">
              지정
            </Button>
          </Flex>
        </div>
      </Modal>
    </AdminLayout>
  )
}
