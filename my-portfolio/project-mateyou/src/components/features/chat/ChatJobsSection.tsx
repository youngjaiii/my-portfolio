import { forwardRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send } from 'lucide-react'
import { useDevice } from '@/hooks/useDevice'
import { Capacitor } from '@capacitor/core'

interface Job {
  id: string
  job_name: string
  coins_per_job: number
}

interface ChatJobsSectionProps {
  jobs: Array<Job>
  jobsLoading: boolean
  jobCounts: Record<string, number>
  userPoints: number
  userPointsLoading?: boolean
  isSending: boolean
  headerHeight: number
  isVisible?: boolean
  onJobCountChange: (jobId: string, count: number) => void
  onDirectRequest: (job: Job) => void
  onChargeRequest?: (requiredPoints: number) => void
}

export const ChatJobsSection = forwardRef<HTMLDivElement, ChatJobsSectionProps>(
  function ChatJobsSection({
    jobs,
    jobsLoading,
    jobCounts,
    userPoints,
    userPointsLoading = false,
    isSending,
    headerHeight,
    isVisible = true,
    onJobCountChange,
    onDirectRequest,
    onChargeRequest,
  }, ref) {
    const { isMobile } = useDevice()
    const isNative = Capacitor.isNativePlatform()

    const getJobCount = (jobId: string) => {
      return jobCounts[jobId] || 1
    }

    const setJobCount = (jobId: string, count: number) => {
      onJobCountChange(jobId, Math.max(1, count))
    }

    return (
      <AnimatePresence>
        {isVisible && (
          <motion.div
            ref={ref}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className={`${
              isMobile
                ? 'fixed left-0 right-0 z-10 bg-white'
                : 'border-b bg-gray-50'
            } px-4 py-2 flex-shrink-0`}
            style={
              isMobile
                ? {
                    top: isNative 
                      ? `calc(${headerHeight}px + env(safe-area-inset-top, 0px))`
                      : `${headerHeight}px`,
                  }
                : undefined
            }
          >
        {jobsLoading ? (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-[#FE3A8F]"></div>
            <span className="ml-2 text-sm text-gray-500">
              서비스 로딩 중...
            </span>
          </div>
        ) : jobs.length > 0 ? (
          <div className="relative flex items-center gap-2 w-full">
            <p className="text-sm text-gray-500 break-keep">퀘스트: </p>
            <div className="flex-1 flex overflow-x-auto scrollbar-hide gap-2 items-center" style={{ width: 'max-content' }}>
              {jobs.map((job) => {
                const currentCount = getJobCount(job.id)
                const totalCost = job.coins_per_job * currentCount

                return (
                  <div key={job.id} className="flex-shrink-0">
                    <div className="flex gap-2 items-center bg-[#ffd1dd] rounded-full px-1.5 py-1 text-sm transition-colors">
                      <div className="text-[#110f1a] text-xs flex items-center gap-1">
                        <button
                          onClick={() => setJobCount(job.id, currentCount - 1)}
                          disabled={currentCount <= 1}
                          className="w-5 h-5 flex items-center justify-center border-2 border-[#110f1a] rounded-full text-xs font-bold disabled:opacity-40"
                        >
                          -
                        </button>
                        <span className="mx-1 font-medium">
                          {currentCount}
                        </span>
                        <button
                          onClick={() => setJobCount(job.id, currentCount + 1)}
                          className="w-5 h-5 flex items-center justify-center border-2 border-[#110f1a] rounded-full text-xs font-bold"
                        >
                          +
                        </button>
                      </div>
                      <div className="font-medium flex-1 text-[#110f1a] text-xs whitespace-nowrap">
                        {job.job_name}, 
                        <span className="ml-1 text-xs text-[#110f1a]">
                            {totalCost.toLocaleString()}P
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          if (!userPointsLoading && userPoints < totalCost) {
                            onChargeRequest?.(totalCost)
                          } else {
                            onDirectRequest(job)
                          }
                        }}
                        disabled={isSending || userPointsLoading}
                        className={`flex items-center justify-center cursor-pointer disabled:cursor-not-allowed rounded-full p-1.5 ${
                          userPointsLoading || isSending
                            ? 'bg-gray-400'
                            : 'bg-[#FE3A8F] hover:bg-[#e8a0c0]'
                        }`}
                        title={
                          userPointsLoading
                            ? '포인트 정보를 불러오는 중...'
                            : isSending
                            ? '의뢰 처리 중...'
                            : !userPointsLoading && userPoints < totalCost
                            ? `포인트 충전이 필요합니다 (${(totalCost - userPoints).toLocaleString()}P 부족)`
                            : '의뢰하기'
                        }
                      >
                        {isSending ? (
                          <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                        ) : (
                          <Send className={`h-4 w-4 ${userPointsLoading ? 'text-gray-200' : 'text-white'}`} />
                        )}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-500 py-2">
            등록된 퀘스트가 없습니다.
          </div>
        )}
          </motion.div>
        )}
      </AnimatePresence>
    )
  }
)