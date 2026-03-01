import { Avatar, Button, Flex, Input, LoadingSpinner, Modal, Typography } from '@/components'
import { AdminLayout } from '@/components/layouts/AdminLayout'
import { useAdminGuard } from '@/hooks/useAdminGuard'
import { useConfirm } from '@/hooks/useConfirm'
import {
  assignStoreManager,
  createStore,
  getAllManagers,
  getStoreManagers,
  getStores,
  toggleStoreStatus,
  unassignStoreManager,
  updateStore,
  type TimesheetStore,
  type TimesheetStoreManager,
} from '@/lib/timesheetApi'
import { useAuthStore } from '@/store/useAuthStore'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

export const Route = createFileRoute('/timesheet/admin/stores')({
  component: StoresPage,
})

function StoresPage() {
  const { user } = useAuthStore()
  useAdminGuard()
  const confirm = useConfirm()

  const [stores, setStores] = useState<TimesheetStore[]>([])
  const [storesLoading, setStoresLoading] = useState(false)
  const [storeModalOpen, setStoreModalOpen] = useState(false)
  const [editingStore, setEditingStore] = useState<TimesheetStore | null>(null)
  const [storeForm, setStoreForm] = useState({ name: '' })
  const [storeManagers, setStoreManagers] = useState<
    Array<
      TimesheetStoreManager & {
        manager?: {
          id: string
          name: string
          profile_image?: string
        }
      }
    >
  >([])
  const [storeManagersLoading, setStoreManagersLoading] = useState(false)
  const [selectedManagerIdForStore, setSelectedManagerIdForStore] = useState('')
  const [managers, setManagers] = useState<any[]>([])

  useEffect(() => {
    loadStores()
  }, [])

  async function loadStores() {
    setStoresLoading(true)
    try {
      const storeList = await getStores({ includeInactive: true })
      setStores(storeList)
    } catch (error) {
      console.error('❌ loadStores error:', error)
    } finally {
      setStoresLoading(false)
    }
  }

  async function loadManagers() {
    try {
      const managerList = await getAllManagers()
      setManagers(managerList)
    } catch (error) {
      console.error('❌ loadManagers error:', error)
    }
  }

  async function loadStoreManagers(storeId: string) {
    setStoreManagersLoading(true)
    try {
      const managers = await getStoreManagers(storeId)
      setStoreManagers(managers)
    } catch (error) {
      console.error('❌ loadStoreManagers error:', error)
    } finally {
      setStoreManagersLoading(false)
    }
  }

  async function handleCreateStore() {
    if (!user?.id || !storeForm.name.trim()) return

    const success = await createStore(storeForm.name, undefined, undefined, user.id)
    if (success) {
      setStoreModalOpen(false)
      setStoreForm({ name: '' })
      await loadStores()
    }
  }

  async function handleUpdateStore() {
    if (!user?.id || !editingStore || !storeForm.name.trim()) return

    const success = await updateStore(editingStore.id, { name: storeForm.name }, user.id)
    if (success) {
      setStoreModalOpen(false)
      setEditingStore(null)
      setStoreForm({ name: '' })
      setStoreManagers([])
      await loadStores()
    }
  }

  async function handleToggleStoreStatus(store: TimesheetStore) {
    if (!user?.id) return

    const success = await toggleStoreStatus(store.id, !store.is_active, user.id)
    if (success) {
      await loadStores()
    }
  }

  async function handleEditStore(store: TimesheetStore) {
    setEditingStore(store)
    setStoreForm({
      name: store.name,
    })
    setStoreModalOpen(true)
    if (managers.length === 0) {
      await loadManagers()
    }
    await loadStoreManagers(store.id)
  }

  function handleOpenStoreModal() {
    setEditingStore(null)
    setStoreForm({ name: '' })
    setStoreManagers([])
    setStoreModalOpen(true)
  }

  async function handleAssignStoreManager() {
    if (!user?.id || !editingStore || !selectedManagerIdForStore) return

    const success = await assignStoreManager(editingStore.id, selectedManagerIdForStore, user.id)
    if (success) {
      setSelectedManagerIdForStore('')
      await loadStoreManagers(editingStore.id)
    }
  }

  async function handleUnassignStoreManager(managerId: string) {
    if (!user?.id || !editingStore) return

    if (await confirm({
      title: '매니저 제거',
      message: '정말 매니저를 가게에서 제거하시겠습니까?',
      variant: 'danger'
    })) {
      const success = await unassignStoreManager(editingStore.id, managerId, user.id)
      if (success) {
        await loadStoreManagers(editingStore.id)
      }
    }
  }

  return (
    <AdminLayout activeTab="stores">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">가게 관리</h2>
            <p className="text-slate-500 mt-1">가게 정보를 추가하고 관리하세요</p>
          </div>
          <Button onClick={handleOpenStoreModal} variant="primary">
            + 가게 추가
          </Button>
        </div>

        {storesLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : stores.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stores.map((store) => (
              <div
                key={store.id}
                className={`bg-white rounded-2xl border p-5 transition-all hover:shadow-md ${
                  store.is_active ? 'border-slate-200' : 'border-red-200 bg-red-50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{store.name}</h3>
                      {!store.is_active && (
                        <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">비활성</span>
                      )}
                    </div>
                    {store.address && (
                      <p className="text-sm text-slate-500 mt-1 flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {store.address}
                      </p>
                    )}
                    {store.phone && (
                      <p className="text-sm text-slate-500 mt-1 flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        {store.phone}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-4 pt-4 border-t border-slate-100">
                  <Button
                    onClick={() => handleEditStore(store)}
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                  >
                    수정
                  </Button>
                  <Button
                    onClick={() => handleToggleStoreStatus(store)}
                    variant={store.is_active ? 'secondary' : 'primary'}
                    size="sm"
                    className="flex-1"
                  >
                    {store.is_active ? '비활성화' : '활성화'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <p className="text-slate-400">등록된 가게가 없습니다.</p>
          </div>
        )}
      </div>

      <Modal
        isOpen={storeModalOpen}
        onClose={() => {
          setStoreModalOpen(false)
          setEditingStore(null)
          setStoreForm({ name: '' })
          setStoreManagers([])
          setSelectedManagerIdForStore('')
        }}
        title={editingStore ? '가게 수정' : '가게 추가'}
      >
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">가게 이름 *</label>
            <Input
              value={storeForm.name}
              onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })}
              placeholder="가게 이름을 입력하세요"
            />
          </div>

          {editingStore && (
            <div className="border-t border-slate-200 pt-4 mt-4">
              <Flex justify="between" align="center" className="mb-3">
                <Typography variant="body1" className="font-semibold text-slate-900">
                  매니저 목록
                </Typography>
                <Button
                  onClick={handleAssignStoreManager}
                  variant="primary"
                  size="sm"
                  disabled={!selectedManagerIdForStore}
                >
                  + 추가
                </Button>
              </Flex>

              <div className="mb-4">
                <select
                  value={selectedManagerIdForStore}
                  onChange={(e) => setSelectedManagerIdForStore(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="">매니저를 선택하세요</option>
                  {managers
                    .filter(
                      (m) => !storeManagers.some((sm) => sm.manager_id === m.id)
                    )
                    .map((manager) => (
                      <option key={manager.id} value={manager.id}>
                        {manager.name}
                      </option>
                    ))}
                </select>
              </div>

              {storeManagersLoading ? (
                <LoadingSpinner />
              ) : storeManagers.length > 0 ? (
                <div className="space-y-2">
                  {storeManagers.map((sm) => (
                    <Flex
                      key={sm.id}
                      align="center"
                      justify="between"
                      className="p-3 bg-slate-50 rounded-xl"
                    >
                      <Flex align="center" gap={3}>
                        {sm.manager?.profile_image && (
                          <Avatar
                            src={sm.manager.profile_image}
                            alt={sm.manager.name}
                            size="sm"
                          />
                        )}
                        <span className="font-medium text-slate-900">
                          {sm.manager?.name || '알 수 없음'}
                        </span>
                      </Flex>
                      <Button
                        onClick={() => handleUnassignStoreManager(sm.manager_id)}
                        variant="secondary"
                        size="sm"
                      >
                        삭제
                      </Button>
                    </Flex>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">할당된 매니저가 없습니다.</p>
              )}
            </div>
          )}

          <Flex gap={2} justify="end" className="pt-4">
            <Button
              onClick={() => {
                setStoreModalOpen(false)
                setEditingStore(null)
                setStoreForm({ name: '' })
                setStoreManagers([])
                setSelectedManagerIdForStore('')
              }}
              variant="secondary"
            >
              취소
            </Button>
            <Button
              onClick={editingStore ? handleUpdateStore : handleCreateStore}
              variant="primary"
            >
              {editingStore ? '수정' : '추가'}
            </Button>
          </Flex>
        </div>
      </Modal>
    </AdminLayout>
  )
}
