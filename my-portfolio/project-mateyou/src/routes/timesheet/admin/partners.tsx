import { Avatar, Button, Flex, LoadingSpinner, Modal, PartnerAutocomplete } from '@/components'
import { AdminLayout } from '@/components/layouts/AdminLayout'
import { useConfirm } from '@/hooks/useConfirm'
import {
    addPartnerPlus,
    getAllPartnerPlus,
    removePartnerPlus,
} from '@/lib/timesheetApi'
import { useAuthStore } from '@/store/useAuthStore'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState } from 'react'

// 상태별 정렬 우선순위 (출근 > 휴게 > 미출근)
const STATUS_PRIORITY: Record<string, number> = {
  WORKING: 0,
  BREAK: 1,
  OFF: 2,
}

export const Route = createFileRoute('/timesheet/admin/partners')({
  component: PartnersPage,
})

function PartnersPage() {
  const { user } = useAuthStore()
  // admin과 파트너 매니저 모두 접근 가능 (상위 admin.tsx에서 가드)
  const confirm = useConfirm()

  const [partnerPlusList, setPartnerPlusList] = useState<any[]>([])
  const [partnerPlusLoading, setPartnerPlusLoading] = useState(false)
  const [partnerPlusModalOpen, setPartnerPlusModalOpen] = useState(false)
  const [selectedMemberId, setSelectedMemberId] = useState('')

  // 출근 상태 기준으로 정렬된 목록
  const sortedPartnerPlusList = useMemo(() => {
    return [...partnerPlusList].sort((a, b) => {
      const priorityA = STATUS_PRIORITY[a.current_status] ?? 2
      const priorityB = STATUS_PRIORITY[b.current_status] ?? 2
      return priorityA - priorityB
    })
  }, [partnerPlusList])

  useEffect(() => {
    loadPartnerPlus()
  }, [])

  async function loadPartnerPlus() {
    setPartnerPlusLoading(true)
    try {
      const partnerList = await getAllPartnerPlus()
      setPartnerPlusList(partnerList)
    } catch (error) {
      console.error('❌ loadPartnerPlus error:', error)
    } finally {
      setPartnerPlusLoading(false)
    }
  }

  async function handleAddPartnerPlus() {
    if (!user?.id || !selectedMemberId) return

    const success = await addPartnerPlus(selectedMemberId, user.id)
    if (success) {
      setPartnerPlusModalOpen(false)
      setSelectedMemberId('')
      await loadPartnerPlus()
    }
  }

  function handleOpenPartnerPlusModal() {
    setSelectedMemberId('')
    setPartnerPlusModalOpen(true)
  }

  async function handleRemovePartnerPlus(memberId: string) {
    if (!user?.id) return

    if (await confirm({
      title: '파트너+ 삭제',
      message: '정말 파트너+를 삭제하시겠습니까?',
      variant: 'danger'
    })) {
      const success = await removePartnerPlus(memberId, user.id)
      if (success) {
        await loadPartnerPlus()
      }
    }
  }

  return (
    <AdminLayout activeTab="partners">
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-slate-900">파트너+ 관리</h2>
              <span className="inline-flex items-center justify-center px-3 py-1 text-sm font-semibold rounded-full bg-indigo-100 text-indigo-700">
                {partnerPlusList.length}명
              </span>
            </div>
            <p className="text-slate-500 mt-1">파트너+를 추가하고 관리하세요</p>
          </div>
          <Button onClick={handleOpenPartnerPlusModal} variant="primary">
            + 파트너+ 추가
          </Button>
        </div>

        {partnerPlusLoading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : sortedPartnerPlusList.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sortedPartnerPlusList.map((partner) => (
              <div
                key={partner.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-md transition-all"
              >
                <div className="flex items-center gap-4">
                  <Avatar
                    src={partner.profile_image}
                    alt={partner.name}
                    size="lg"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900 truncate">{partner.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                        partner.current_status === 'WORKING'
                          ? 'bg-green-100 text-green-700'
                          : partner.current_status === 'BREAK'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          partner.current_status === 'WORKING'
                            ? 'bg-green-500'
                            : partner.current_status === 'BREAK'
                            ? 'bg-amber-500'
                            : 'bg-slate-400'
                        }`} />
                        {partner.current_status === 'WORKING' ? '출근 중' : partner.current_status === 'BREAK' ? '휴게 중' : '미출근'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100">
                  <Button
                    onClick={() => handleRemovePartnerPlus(partner.id)}
                    variant="secondary"
                    size="sm"
                    className="w-full"
                  >
                    파트너+ 삭제
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <p className="text-slate-400">등록된 파트너+가 없습니다.</p>
          </div>
        )}
      </div>

      <Modal
        isOpen={partnerPlusModalOpen}
        onClose={() => {
          setPartnerPlusModalOpen(false)
          setSelectedMemberId('')
        }}
        title="파트너+ 추가"
      >
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">파트너 선택</label>
            <PartnerAutocomplete
              value={selectedMemberId}
              onChange={(partnerId, partner) => {
                setSelectedMemberId(partner?.member_id || partnerId)
              }}
              placeholder="파트너 이름으로 검색..."
              selectedIds={partnerPlusList.map(p => p.id)}
              showSelectedDisplay
            />
          </div>
          <Flex gap={2} justify="end" className="pt-4">
            <Button
              onClick={() => {
                setPartnerPlusModalOpen(false)
                setSelectedMemberId('')
              }}
              variant="secondary"
            >
              취소
            </Button>
            <Button onClick={handleAddPartnerPlus} variant="primary">
              추가
            </Button>
          </Flex>
        </div>
      </Modal>
    </AdminLayout>
  )
}
