import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Database } from '@/types/database'
import { Button } from '@/components/ui/Button'
import { Flex } from '@/components/ui/Flex'
import { Modal } from '@/components/ui/Modal'
import { Typography } from '@/components/ui/Typography'
import { Input } from '@/components/ui/Input'
import { ChargeModal } from './ChargeModal'
import { useAuth } from '@/hooks/useAuth'
import { useUser } from '@/hooks/useUser'
import { usePartnerJobs } from '@/hooks/usePartnerJobs'
import { useMemberPoints } from '@/hooks/useMemberPoints'
import { useToast } from '@/hooks/useToast'
import { supabase } from '@/lib/supabase'
import { mateYouApi } from '@/lib/apiClient'

type PartnerJob = Database['public']['Tables']['partner_jobs']['Row']

interface PartnerWithMember {
  id: string // partners 테이블의 ID
  member_id: string
  partner_name: string | null
  partner_message: string | null
  partner_status: 'none' | 'pending' | 'approved' | 'rejected'
  partner_applied_at: string
  partner_reviewed_at: string | null
  total_points: number
  created_at: string
  updated_at: string
  member: {
    id: string
    name: string | null
    profile_image: string | null
  }
}

interface PartnerRequestModalProps {
  isOpen: boolean
  onClose: () => void
  partnerId: string
  partnerName?: string
  onSuccess?: () => void
  onRequestCreated?: (
    jobName: string,
    coinsPerJob: number,
    jobCount: number,
  ) => void
}

export function PartnerRequestModal({
  isOpen,
  onClose,
  partnerId,
  partnerName,
  onSuccess,
  onRequestCreated,
}: PartnerRequestModalProps) {
  const { user } = useAuth()
  const { invalidateUser } = useUser()
  const queryClient = useQueryClient()
  const { addToast } = useToast()
  const { addPointsLog, refetch } = useMemberPoints(user?.id || '')

  // Fetch partner data
  const { data: partner, isLoading: partnerLoading } = useQuery({
    queryKey: ['partner', partnerId],
    queryFn: async () => {
      // 1. Express API로 partner ID 조회
      const response = await mateYouApi.partners.getPartnerIdByMemberId(partnerId)

      if (!response.data.success || !response.data.data || typeof response.data.data !== 'object' || !('id' in response.data.data)) {
        throw new Error('Partner not found')
      }

      const partnerIdData = response.data.data as { id: string }

      // 2. partners.id로 파트너 정보 조회
      const { data, error } = await supabase
        .from('partners')
        .select(
          `
          *,
          member:members(id, name, profile_image)
        `,
        )
        .eq('id', partnerIdData.id)
        .single()

      if (error) throw error
      return data as PartnerWithMember
    },
    enabled: isOpen && !!partnerId,
  })

  // partnerId를 직접 사용하여 partner_jobs 조회 (member_id 기준) - 활성화된 것만
  const { jobs, isLoading: jobsLoading } = usePartnerJobs(partnerId, true)
  const [selectedJob, setSelectedJob] = useState<PartnerJob | null>(null)
  const [jobCount, setJobCount] = useState(1)
  const [jobCountInput, setJobCountInput] = useState('1')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 모달이 닫힐 때 상태 초기화
  useEffect(() => {
    if (!isOpen) {
      setSelectedJob(null)
      setJobCount(1)
      setJobCountInput('1')
      setIsSubmitting(false)
    }
  }, [isOpen])

  // 횟수 입력 핸들러 (숫자만 허용)
  const handleJobCountChange = (value: string) => {
    // 숫자만 허용
    const numericValue = value.replace(/[^0-9]/g, '')
    if (numericValue === '') {
      setJobCountInput('')
      setJobCount(1)
      return
    }
    const num = parseInt(numericValue, 10)
    if (num >= 1) {
      setJobCountInput(numericValue)
      setJobCount(num)
    }
  }

  // 입력 필드에서 포커스가 벗어날 때 최소값 보장
  const handleJobCountBlur = () => {
    if (jobCount < 1) {
      setJobCount(1)
      setJobCountInput('1')
    } else {
      setJobCountInput(jobCount.toString())
    }
  }
  const [isChargeModalOpen, setIsChargeModalOpen] = useState(false)

  const handleCharge = async (points: number, amount: number) => {
    try {
      await addPointsLog(
        'earn',
        points,
        `포인트 충전 - ${amount.toLocaleString()}원`,
      )
      refetch()
      invalidateUser()
      setIsChargeModalOpen(false)
      addToast(`${points.toLocaleString()}포인트가 충전되었습니다`, 'success')
    } catch (error) {
      console.error('포인트 충전 실패:', error)
      addToast('포인트 충전에 실패했습니다', 'error')
      throw error
    }
  }

  const handleSubmit = async () => {
    // 더블클릭 방지
    if (isSubmitting || !user || !selectedJob || !partner) return

    const totalCost = selectedJob.coins_per_job * jobCount

    // 포인트 부족 체크
    if (user.total_points < totalCost) {
      setIsChargeModalOpen(true)
      return
    }

    try {
      setIsSubmitting(true)

      // 직접 처리 (RPC 함수 없이)
      await handleLegacySubmit(totalCost)
      
      // 성공 시 모달 닫기
      onSuccess?.()
      onClose()
    } catch (error) {
      console.error('Error creating request:', error)
      const errorMessage = error instanceof Error ? error.message : '의뢰 생성 중 오류가 발생했습니다.'
      addToast(errorMessage, 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  // RPC 함수가 없을 때 사용하는 fallback 함수
  const handleLegacySubmit = async (totalCost: number) => {
    if (!user) {
      addToast('사용자 정보를 찾을 수 없습니다', 'error')
      return
    }

    // 1. partner_requests 생성 (total_coins는 generated column이므로 제외)
    const noteMessage = `${selectedJob!.job_name} ${jobCount}회 의뢰를 신청했습니다. (${totalCost.toLocaleString()}P)`
    
    const { data: requestData, error: requestError } = await supabase
      .from('partner_requests')
      .insert({
        client_id: user.id,
        partner_id: partner!.id,
        partner_job_id: selectedJob!.id,
        request_type: selectedJob!.job_name, // job_name을 request_type으로 사용
        job_count: jobCount,
        coins_per_job: selectedJob!.coins_per_job,
        note: noteMessage,
        status: 'pending',
      })
      .select()
      .single()

    if (requestError) {
      console.error('Error creating partner request:', requestError)
      throw new Error(requestError.message || '의뢰 생성에 실패했습니다.')
    }

    // 2. 포인트 사용 로그 추가 (Edge Function 사용)
    await addPointsLog(
      'spend',
      totalCost,
      `${partnerName || partner?.partner_name || partner?.member.name}에게 ${selectedJob!.job_name} ${jobCount}회 의뢰`,
      requestData.id
    )

    // React Query 캐시 무효화하여 최신 user 데이터 불러오기
    invalidateUser()

    // 포인트 관련 쿼리들도 무효화
    queryClient.invalidateQueries({ queryKey: ['member-points'] })

    // 의뢰 정보를 Chat 컴포넌트로 전달 (메시지 전송)
    if (onRequestCreated && selectedJob) {
      await onRequestCreated(
        selectedJob.job_name,
        selectedJob.coins_per_job,
        jobCount,
      )
    }
    
    // 성공 토스트 메시지
    addToast('의뢰가 성공적으로 신청되었습니다!', 'success')
  }

  // 활성화된 직무만 필터링
  const activeJobs = jobs.filter((job) => job.is_active)
  const hasActiveJobs = activeJobs.length > 0

  const totalCost = selectedJob ? selectedJob.coins_per_job * jobCount : 0

  if (partnerLoading) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="의뢰하기">
        <div className="p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <Typography variant="body1" className="mt-4 text-gray-500">
            파트너 정보를 불러오는 중...
          </Typography>
        </div>
      </Modal>
    )
  }

  if (!partner) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="의뢰하기">
        <div className="p-8 text-center">
          <Typography variant="body1" className="text-gray-500">
            파트너 정보를 찾을 수 없습니다.
          </Typography>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${partnerName || partner.partner_name || partner.member.name}에게 의뢰하기`}
    >
      <div className="space-y-4">
        {/* 작업 선택 */}
        <div>
          <Typography variant="h6" className="mb-2">
            작업 선택
          </Typography>
          {jobsLoading ? (
            <div className="p-4 text-center text-gray-500">
              작업 목록을 불러오는 중...
            </div>
          ) : !hasActiveJobs ? (
            <div className="p-4 text-center text-gray-500">
              <Typography variant="body1" className="mb-2">
                현재 활성화된 서비스가 없습니다.
              </Typography>
              <Typography variant="body2" color="text-secondary">
                파트너가 서비스를 일시 중단한 상태입니다.
              </Typography>
            </div>
          ) : (
            <div className="space-y-2">
              {activeJobs.map((job) => (
                <div
                  key={job.id}
                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedJob?.id === job.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedJob(job)}
                >
                  <Flex justify="between" align="center">
                    <div>
                      <Typography variant="body1" className="font-medium">
                        {job.job_name}
                      </Typography>
                      <Typography variant="caption" color="text-secondary">
                        1회당 {job.coins_per_job}포인트
                      </Typography>
                    </div>
                    <div className="w-4 h-4 border-2 border-gray-300 rounded-full flex items-center justify-center">
                      {selectedJob?.id === job.id && (
                        <div className="w-2 h-2 bg-blue-500 rounded-full" />
                      )}
                    </div>
                  </Flex>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 횟수 및 가격 선택 */}
        {selectedJob && (
          <div className="space-y-4">
            <div>
              <Typography variant="h6" className="mb-3">
                횟수 선택
              </Typography>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 flex-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const newCount = Math.max(1, jobCount - 1)
                      setJobCount(newCount)
                      setJobCountInput(newCount.toString())
                    }}
                    disabled={jobCount <= 1}
                    className="w-10 h-10 flex-shrink-0"
                  >
                    -
                  </Button>
                  <div className="flex-1 flex items-center gap-2 px-4 py-3 border-2 border-blue-500 rounded-lg bg-blue-50">
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={jobCountInput}
                      onChange={(e) => handleJobCountChange(e.target.value)}
                      onBlur={handleJobCountBlur}
                      className="flex-1 text-center border-0 bg-transparent p-0 text-blue-600 font-bold text-xl focus:ring-0 focus:outline-none"
                      inputSize="md"
                    />
                    <Typography variant="body1" className="text-blue-600 font-medium flex-shrink-0">
                      회
                    </Typography>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const newCount = jobCount + 1
                      setJobCount(newCount)
                      setJobCountInput(newCount.toString())
                    }}
                    className="w-10 h-10 flex-shrink-0"
                  >
                    +
                  </Button>
                </div>
              </div>
            </div>

            {/* 가격 정보 */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="space-y-2">
                <Flex justify="between" align="center">
                  <Typography variant="body2" className="text-gray-600">
                    1회당 가격
                  </Typography>
                  <Typography variant="body1" className="font-medium">
                    {selectedJob.coins_per_job.toLocaleString()}P
                  </Typography>
                </Flex>
                <Flex justify="between" align="center">
                  <Typography variant="body2" className="text-gray-600">
                    횟수
                  </Typography>
                  <Typography variant="body1" className="font-medium">
                    {jobCount}회
                  </Typography>
                </Flex>
                <div className="border-t border-blue-300 pt-2 mt-2">
                  <Flex justify="between" align="center">
                    <Typography variant="body1" className="font-semibold">
                      총 비용
                    </Typography>
                    <Typography variant="h6" className="text-blue-600 font-bold">
                      {totalCost.toLocaleString()}P
                    </Typography>
                  </Flex>
                </div>
              </div>
            </div>

            {/* 포인트 부족 알림 */}
            {user && user.total_points < totalCost && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <Flex justify="between" align="center" className="mb-2">
                  <Typography
                    variant="body2"
                    className="text-red-800 font-medium"
                  >
                    포인트가 부족합니다
                  </Typography>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsChargeModalOpen(true)}
                    className="border-red-500 text-red-600 hover:bg-red-50"
                  >
                    충전하기
                  </Button>
                </Flex>
                <div className="space-y-1 text-sm text-red-700">
                  <div className="flex justify-between">
                    <span>필요 포인트:</span>
                    <span>{totalCost.toLocaleString()}P</span>
                  </div>
                  <div className="flex justify-between">
                    <span>보유 포인트:</span>
                    <span>{(user.total_points || 0).toLocaleString()}P</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>부족 포인트:</span>
                    <span className="text-red-600">
                      {(totalCost - (user.total_points || 0)).toLocaleString()}P
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 버튼 */}
        <Flex justify="end" gap={4}>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            취소
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedJob || isSubmitting || !user || !hasActiveJobs}
            loading={isSubmitting}
          >
            {!hasActiveJobs ? '서비스 중단 중' : '의뢰하기'}
          </Button>
        </Flex>
      </div>

      {/* Charge Modal */}
      <ChargeModal
        isOpen={isChargeModalOpen}
        onClose={() => setIsChargeModalOpen(false)}
        onCharge={handleCharge}
      />
    </Modal>
  )
}
