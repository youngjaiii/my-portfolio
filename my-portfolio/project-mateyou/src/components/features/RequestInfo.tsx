import { Button } from '@/components'

interface RequestInfoProps {
  jobName: string
  coinsPerJob: number
  jobCount: number
  onRequest: () => void
  onClose: () => void
}

export function RequestInfo({
  jobName,
  coinsPerJob,
  jobCount,
  onRequest,
  onClose,
}: RequestInfoProps) {
  const totalCost = coinsPerJob * jobCount

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-sm font-medium text-blue-900">
                {jobName}
              </span>
              <span className="text-sm text-blue-700 ml-2">
                {coinsPerJob.toLocaleString()}P × {jobCount}회 ={' '}
                {totalCost.toLocaleString()}P
              </span>
            </div>
            <Button
              variant="primary"
              size="sm"
              onClick={onRequest}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1"
            >
              의뢰하기
            </Button>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="text-blue-600 hover:bg-blue-100 p-1"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </Button>
      </div>
    </div>
  )
}
