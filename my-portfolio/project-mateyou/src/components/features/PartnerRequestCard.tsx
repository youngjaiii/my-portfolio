import { memo } from 'react'
import type { Database } from '@/types/database'
import { Button } from '@/components/ui/Button'
import { usePartnerRequests } from '@/hooks/usePartnerRequests'

type PartnerRequest = Database['public']['Tables']['partner_requests']['Row']

interface PartnerRequestCardProps {
  request: PartnerRequest & {
    client: { id: string; name: string | null }
  }
  onUpdate?: () => void
}

export const PartnerRequestCard = memo(function PartnerRequestCard({
  request,
  onUpdate,
}: PartnerRequestCardProps) {
  const { acceptRequest, rejectRequest, isAccepting } = usePartnerRequests()

  const handleAccept = async () => {
    try {
      await acceptRequest(request.id)
      alert(
        '의뢰를 수락했습니다! 음성 통화 버튼을 클릭하여 게임을 시작해주세요.',
      )
      onUpdate?.()
    } catch (error) {
      alert('의뢰 수락에 실패했습니다.')
    }
  }

  const handleReject = async () => {
    const reason = prompt('거절 사유를 입력해주세요 (선택사항):')
    if (reason === null) return // 취소

    try {
      await rejectRequest(request.id, reason || undefined)
      alert('의뢰를 거절했습니다.')
      onUpdate?.()
    } catch (error) {
      alert('의뢰 거절에 실패했습니다.')
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="font-semibold text-lg text-gray-900">
            {request.request_type}
          </h3>
          <p className="text-sm text-gray-600">
            {request.client.name || '알 수 없는 사용자'}님의 의뢰
          </p>
        </div>
        <span
          className={`px-2 py-1 text-xs font-medium rounded-full ${
            request.status === 'pending'
              ? 'bg-yellow-100 text-yellow-800'
              : request.status === 'in_progress'
                ? 'bg-blue-100 text-blue-800'
                : request.status === 'completed'
                  ? 'bg-green-100 text-green-800'
                  : request.status === 'rejected'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-gray-100 text-gray-800'
          }`}
        >
          {request.status === 'pending' && '대기중'}
          {request.status === 'in_progress' && '진행중'}
          {request.status === 'completed' && '완료'}
          {request.status === 'rejected' && '거절됨'}
          {request.status === 'cancelled' && '취소됨'}
        </span>
      </div>

      <div className="space-y-2 mb-4">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">횟수:</span>
          <span className="font-medium">{request.job_count}회</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">회당 포인트:</span>
          <span className="font-medium">
            {request.coins_per_job?.toLocaleString()}P
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">총 포인트:</span>
          <span className="font-medium text-blue-600">
            {(
              (request.coins_per_job || 0) * request.job_count
            ).toLocaleString()}
            P
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">요청 시간:</span>
          <span className="text-gray-500">
            {formatDate(request.requested_at)}
          </span>
        </div>
      </div>

      {request.note && (
        <div className="mb-4 p-3 bg-gray-50 rounded-md">
          <p className="text-sm text-gray-700">{request.note}</p>
        </div>
      )}

      {request.status === 'pending' && (
        <div className="flex space-x-3">
          <Button
            onClick={handleAccept}
            disabled={isAccepting}
            loading={isAccepting}
            variant="primary"
            className="flex-1 bg-green-500 hover:bg-green-600"
          >
            수락
          </Button>
          <Button
            onClick={handleReject}
            disabled={isAccepting}
            variant="outline"
            className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
          >
            거절
          </Button>
        </div>
      )}
    </div>
  )
})
