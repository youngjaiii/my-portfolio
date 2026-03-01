import { Button, Modal } from '@/components'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'

interface AttendanceDeleteConfirmProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (reason: string) => Promise<void>
  record: {
    date: string
    partnerName: string
    startedAt: string
    endedAt?: string | null
    storeName?: string
  } | null
  isDeleting: boolean
}

export function AttendanceDeleteConfirm({
  isOpen,
  onClose,
  onConfirm,
  record,
  isDeleting,
}: AttendanceDeleteConfirmProps) {
  const [reason, setReason] = useState('')

  if (!record) return null

  const handleConfirm = async () => {
    if (!reason.trim()) return
    await onConfirm(reason.trim())
    setReason('')
  }

  const handleClose = () => {
    setReason('')
    onClose()
  }

  const canConfirm = reason.trim().length > 0

  // UTC ISO 문자열을 한국시간 HH:MM으로 변환
  const toKST = (isoString: string | null | undefined): string => {
    if (!isoString) return ''
    try {
      const date = new Date(isoString)
      return date.toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Seoul'
      })
    } catch {
      return isoString.slice(11, 16)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="출근 기록 삭제" size="md">
      <div className="space-y-5">
        {/* 경고 메시지 */}
        <div className="flex items-start gap-3 p-4 bg-red-50 rounded-xl border border-red-200">
          <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <Trash2 className="w-5 h-5 text-red-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-900 mb-1">출근 기록을 삭제하시겠습니까?</p>
            <p className="text-xs text-red-700">삭제된 기록은 복구할 수 없습니다.</p>
          </div>
        </div>

        {/* 기록 정보 */}
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">파트너+</span>
              <span className="text-sm font-semibold text-gray-900">{record.partnerName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">날짜</span>
              <span className="text-sm font-medium text-gray-800">{record.date}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">출근</span>
              <span className="text-sm font-medium text-gray-800">{toKST(record.startedAt)}</span>
            </div>
            {record.endedAt && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">퇴근</span>
                <span className="text-sm font-medium text-gray-800">{toKST(record.endedAt)}</span>
              </div>
            )}
            {record.storeName && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">매장</span>
                <span className="text-sm font-medium text-gray-800">{record.storeName}</span>
              </div>
            )}
          </div>
        </div>

        {/* 삭제 사유 */}
        <div className="p-3 bg-rose-50 rounded-xl border-2 border-rose-300">
          <label className="flex items-center gap-2 text-xs font-medium text-rose-600 mb-2">
            삭제 사유
            <span className="text-[9px] font-medium text-white bg-rose-500 px-1.5 py-0.5 rounded">필수</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full bg-white rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none h-20 resize-none placeholder:text-gray-300 border border-rose-200 focus:border-rose-400"
            placeholder="출근 기록 삭제 사유를 입력해주세요"
          />
        </div>

        {/* 버튼 */}
        <div className="flex gap-3">
          <button
            onClick={handleClose}
            disabled={isDeleting}
            className="flex-1 px-4 py-2.5 text-sm text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
          >
            취소
          </button>
          <Button
            variant="danger"
            onClick={handleConfirm}
            isLoading={isDeleting}
            disabled={!canConfirm}
            className="flex-1 py-2.5 rounded-lg"
          >
            삭제
          </Button>
        </div>
      </div>
    </Modal>
  )
}

