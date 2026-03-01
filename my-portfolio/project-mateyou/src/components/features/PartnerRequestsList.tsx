import { formatDistanceToNow } from 'date-fns'
import { ko } from 'date-fns/locale'
import { AvatarWithFallback, StatusBadge, Typography } from '@/components'
import { usePartnerRequestsList } from '@/hooks/usePartnerRequestsList'

interface PartnerRequestsListProps {
  partnerId: string
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'pending':
      return <StatusBadge variant="warning" size="sm">대기중</StatusBadge>
    case 'in_progress':
      return <StatusBadge variant="info" size="sm">진행중</StatusBadge>
    case 'completed':
      return <StatusBadge variant="success" size="sm">완료</StatusBadge>
    case 'cancelled':
      return <StatusBadge variant="error" size="sm">취소</StatusBadge>
    default:
      return <StatusBadge variant="secondary" size="sm">{status}</StatusBadge>
  }
}

export function PartnerRequestsList({ partnerId }: PartnerRequestsListProps) {
  const { requests, isLoading, error } = usePartnerRequestsList({
    partnerId,
    limit: 10,
  })

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5">
        <Typography variant="h4" className="font-semibold text-gray-900 mb-3">
          최근 의뢰 내역
        </Typography>
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5">
        <Typography variant="h4" className="font-semibold text-gray-900 mb-3">
          최근 의뢰 내역
        </Typography>
        <div className="text-center py-8">
          <Typography variant="body2" className="text-red-600">
            의뢰 내역을 불러올 수 없습니다.
          </Typography>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5">
      <Typography variant="h4" className="font-semibold text-gray-900 mb-3">
        최근 의뢰 내역
      </Typography>

      {requests.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Typography variant="h4" className="text-gray-400">
              📋
            </Typography>
          </div>
          <Typography variant="h5" className="font-semibold text-gray-900 mb-1">
            아직 의뢰 내역이 없어요
          </Typography>
          <Typography variant="body2" className="text-gray-500">
            첫 번째 의뢰를 기다리고 있습니다!
          </Typography>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => (
            <div
              key={request.id}
              className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start gap-3">
                {/* 클라이언트 아바타 */}
                <div className="w-8 h-8 flex-shrink-0">
                  <AvatarWithFallback
                    name={request.client.name || '익명'}
                    src={request.client.profile_image || undefined}
                    size="sm"
                  />
                </div>

                <div className="flex-grow min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-1 gap-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <Typography variant="caption" className="font-semibold text-gray-900 truncate">
                        {request.client.name || '익명 사용자'}
                      </Typography>
                      <Typography variant="caption" className="text-gray-500 text-xs flex-shrink-0">
                        {formatDistanceToNow(new Date(request.created_at), {
                          addSuffix: true,
                          locale: ko,
                        })}
                      </Typography>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(request.status)}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <Typography variant="body2" className="text-gray-700">
                      {request.request_type} · {request.job_count}회
                    </Typography>
                    <Typography variant="caption" className="text-blue-600 font-semibold">
                      {request.total_coins?.toLocaleString()}코인
                    </Typography>
                  </div>

                  {request.note && (
                    <Typography variant="caption" className="text-gray-500 mt-1 line-clamp-2">
                      {request.note}
                    </Typography>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}