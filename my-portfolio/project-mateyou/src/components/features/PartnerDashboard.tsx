import React, { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { se } from 'date-fns/locale'
import type { Database } from '@/types/database'
import {
  AvatarWithFallback,
  Button,
  Grid,
  Modal,
  Navigation,
  Typography,
  WithdrawModal,
} from '@/components'
import { StreamManagementSection } from '@/components/features/partner/StreamManagementSection'
import { RouletteManagementSection } from '@/components/features/partner/RouletteManagementSection'
import { TossSellerRegistrationModal } from '@/components/modals/TossSellerRegistrationModal'
import { toast } from '@/components/ui/sonner'
import { useAuth } from '@/hooks/useAuth'
import { usePartnerData } from '@/hooks/usePartnerData'
import { usePartnerRequests } from '@/hooks/usePartnerRequests'
import { usePartnerJobs } from '@/hooks/usePartnerJobs'
import { usePartnerRequestNotification } from '@/hooks/usePartnerRequestNotification'
import { useDevice } from '@/hooks/useDevice'
import {
  submitWithdrawalRequest,
  syncPartnerSeller,
  syncPartnerSellerContact,
  updatePartnerCurrentStatus,
} from '@/lib/partnerApi'
import { edgeApi } from '@/lib/edgeApi'
import { mateYouApi } from '@/lib/apiClient'
import { supabase } from '@/lib/supabase'
import { findBankByCode } from '@/constants/banks'

type PartnerRequest =
  Database['public']['Tables']['partner_requests']['Row'] & {
    client?: Database['public']['Tables']['members']['Row']
  }

type PartnerStatus = 'none' | 'pending' | 'approved' | 'rejected'

const partnerStatusLabels: Record<PartnerStatus, string> = {
  none: '일반 회원',
  pending: '심사 대기중',
  approved: '승인된 파트너',
  rejected: '거부된 신청',
}

const partnerStatusColors: Record<PartnerStatus, string> = {
  none: 'bg-gray-100 text-gray-700',
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

const getNextStatus = (currentStatus: PartnerStatus): PartnerStatus => {
  switch (currentStatus) {
    case 'none':
      return 'pending'
    case 'pending':
      return 'none'
    case 'approved':
      return 'approved'
    case 'rejected':
      return 'none'
    default:
      return 'none'
  }
}

// 토스 셀러 상태 한글 변환
const getSellerStatusLabel = (status: string | undefined): string => {
  if (!status) return '알 수 없음'
  
  switch (status) {
    case 'APPROVAL_REQUIRED':
      return '본인인증 필요'
    case 'PARTIALLY_APPROVED':
      return '제한적 지급대행 가능 (1천만원까지)'
    case 'KYC_REQUIRED':
      return 'KYC 심사 필요'
    case 'APPROVED':
      return '무제한 지급대행 가능'
    case 'ACTIVE':
      return '활성'
    case 'PENDING':
      return '대기 중'
    case 'REVIEWING':
      return '검토 중'
    case 'REJECTED':
      return '거부됨'
    case 'SUSPENDED':
      return '중지됨'
    default:
      return status
  }
}

// 토스 셀러 상태 색상 결정
const getSellerStatusColor = (status: string | undefined): string => {
  if (!status) return 'bg-gray-100 text-gray-800'
  
  switch (status) {
    case 'APPROVED':
    case 'ACTIVE':
      return 'bg-green-100 text-green-800'
    case 'PARTIALLY_APPROVED':
      return 'bg-orange-100 text-orange-800'
    case 'APPROVAL_REQUIRED':
    case 'KYC_REQUIRED':
      return 'bg-yellow-100 text-yellow-800'
    case 'PENDING':
    case 'REVIEWING':
      return 'bg-blue-100 text-blue-800'
    case 'REJECTED':
    case 'SUSPENDED':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

export function PartnerDashboard() {
  const { user, refreshUser, initialize } = useAuth()
  const navigate = useNavigate()
  const {
    partnerData,
    pointHistory,
    pendingWithdrawals,
    isLoading,
    updatePartnerStatus,
    refetch,
  } = usePartnerData(user?.id || '')
  const { acceptRequest, rejectRequest, completeRequest, isAccepting } =
    usePartnerRequests()
  const {
    jobs: partnerJobs,
    isLoading: jobsLoading,
    refetch: refetchJobs,
  } = usePartnerJobs(user?.id || '')
  // 파트너 요청 실시간 알림 활성화
  usePartnerRequestNotification()
  const queryClient = useQueryClient()
  const { isMobile } = useDevice()


  // 세션 문제 해결을 위한 초기화
  React.useEffect(() => {
    if (!user) {
      console.error('🔄 사용자가 없음 - 인증 초기화 시도')
      initialize()
    }
  }, [user?.id, initialize])

  const [activeTab, setActiveTab] = useState<'history' | 'requests' | 'jobs' | 'blocked' | 'stream' | 'roulette'>(() => {
    if (typeof window === 'undefined') {
      return 'history'
    }
    try {
      const urlParams = new URLSearchParams(window.location.search)
      const tab = urlParams.get('tab') || 'profile'
      if (['history', 'requests', 'jobs', 'blocked', 'stream', 'roulette'].includes(tab)) {
        return tab as 'history' | 'requests' | 'jobs' | 'blocked' | 'stream' | 'roulette'
      }
    } catch (error) {
      // URL parsing 실패 시 기본값
    }
    return 'history'
  })

  const handleTabChange = (tab: 'history' | 'requests' | 'jobs' | 'blocked' | 'stream' | 'roulette') => {
    setActiveTab(tab)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', tab)
    const nextUrl = `${url.pathname}${url.search}${url.hash}`
    try {
      window.history.pushState({}, '', nextUrl)
    } catch (error) {
      console.warn('pushState failed:', error)
    }
  }
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false)
  const [isStoreWithdrawModalOpen, setIsStoreWithdrawModalOpen] = useState(false)
  const [isCollabWithdrawModalOpen, setIsCollabWithdrawModalOpen] = useState(false)
  const [storePointsTab, setStorePointsTab] = useState<'store' | 'collab'>('store')
  const [isAccountInfoModalOpen, setIsAccountInfoModalOpen] = useState(false)
  const [partnerRequests, setPartnerRequests] = useState<Array<PartnerRequest>>(
    [],
  )
  const [requestsLoading, setRequestsLoading] = useState(false)
  const [isAddJobModalOpen, setIsAddJobModalOpen] = useState(false)
  const [newJob, setNewJob] = useState({ job_name: '', coins_per_job: 0, membership_id: '', min_tier_rank: 0 })
  const [isAddingJob, setIsAddingJob] = useState(false)
  const [partnerMemberships, setPartnerMemberships] = useState<Array<{ id: string; name: string; tier_rank?: number }>>([])
  const [editingJob, setEditingJob] = useState<any>(null)
  const [isEditJobModalOpen, setIsEditJobModalOpen] = useState(false)
  const [isUpdatingJob, setIsUpdatingJob] = useState(false)
  const [blockedUsers, setBlockedUsers] = useState<Array<any>>([])
  const [blockedLoading, setBlockedLoading] = useState(false)

  // 토스 셀러 관련 상태
  const [isRegisteringSeller, setIsRegisteringSeller] = useState(false)
  const [sellerStatus, setSellerStatus] = useState<any>(null)
  const [isLoadingSellerStatus, setIsLoadingSellerStatus] = useState(false)
  const [isDeleteSellerModalOpen, setIsDeleteSellerModalOpen] = useState(false)
  const [isDeletingSeller, setIsDeletingSeller] = useState(false)
  const [isTossSellerModalOpen, setIsTossSellerModalOpen] = useState(false)
  const [tossSellerModalMode, setTossSellerModalMode] = useState<'register' | 'edit'>('register')

  // 방송 관리 관련 상태
  const [streamStats, setStreamStats] = useState<{
    totalDonations: number
    recentRooms: Array<any>
    topDonors: Array<any>
    isLoading: boolean
  }>({
    totalDonations: 0,
    recentRooms: [],
    topDonors: [],
    isLoading: false,
  })

  // 직무 활성화/비활성화 토글
  const toggleJobStatus = async (jobId: string, currentStatus: boolean) => {
    try {
      const response = await edgeApi.partnerDashboard.updateJob(jobId, {
        is_active: !currentStatus,
      })

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to update job status')
      }

      toast.success(`서비스가 ${!currentStatus ? '활성화' : '비활성화'}되었습니다.`)
      refetchJobs()
    } catch (error) {
      console.error('서비스 상태 변경 실패:', error)
      toast.error('서비스 상태 변경에 실패했습니다.')
    }
  }

  const openEditJobModal = (job: any) => {
    setEditingJob({
      ...job,
      membership_id: job.membership_id || '',
      min_tier_rank: job.min_tier_rank || 0,
    })
    setIsEditJobModalOpen(true)
  }

  const handleUpdateJob = async () => {
    if (!editingJob) return
    if (!editingJob.job_name?.trim() || editingJob.coins_per_job <= 0) {
      toast.error('퀘스트명과 올바른 코인 금액을 입력해주세요.')
      return
    }

    setIsUpdatingJob(true)
    try {
      const updateData: any = {
        job_name: editingJob.job_name.trim(),
        coins_per_job: editingJob.coins_per_job,
        is_active: editingJob.is_active,
      }
      if (editingJob.membership_id) {
        updateData.membership_id = editingJob.membership_id
        updateData.min_tier_rank = editingJob.min_tier_rank || 0
      } else {
        updateData.membership_id = null
        updateData.min_tier_rank = 0
      }

      const response = await edgeApi.partnerDashboard.updateJob(editingJob.id, updateData)

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to update job')
      }

      toast.success('퀘스트가 수정되었습니다.')
      setIsEditJobModalOpen(false)
      setEditingJob(null)
      refetchJobs()
    } catch (error) {
      console.error('퀘스트 수정 실패:', error)
      toast.error('퀘스트 수정에 실패했습니다.')
    } finally {
      setIsUpdatingJob(false)
    }
  }

  // 차단된 사용자 목록 가져오기 (member_blocks 테이블)
  const fetchBlockedUsers = async () => {
    if (!user?.id) {
      console.error('user?.id가 없어서 함수 종료')
      return
    }

    try {
      setBlockedLoading(true)

      // api-blocks를 통해 차단 목록 조회
      const response = await edgeApi.blocks.getList()

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch blocked users')
      }

      // 차단된 사용자 목록
      setBlockedUsers(response.data || [])
    } catch (error) {
      console.error('Error fetching blocked users:', error)
      toast.error('차단된 사용자 목록을 불러오는 중 오류가 발생했습니다.')
      setBlockedUsers([]) // 오류 시에도 빈 배열로 설정
    } finally {
      setBlockedLoading(false)
    }
  }

  // 사용자 차단 해제 (member_blocks 테이블)
  const handleUnblockUser = async (memberCode: string, userName: string) => {
    if (!user?.id) return

    const confirmed = confirm(`${userName}님의 차단을 해제하시겠습니까?`)
    if (!confirmed) return

    try {
      const response = await edgeApi.blocks.unblock(memberCode)

      if (response.success) {
        toast.success(`${userName}님의 차단이 해제되었습니다.`)

        // 차단된 사용자 목록 새로고침
        await fetchBlockedUsers()
      } else {
        throw new Error(response.error?.message || '차단 해제 실패')
      }
    } catch (error) {
      console.error('Error unblocking user:', error)
      toast.error('차단 해제에 실패했습니다.')
    }
  }

  // 토스 셀러 상태 조회
  const fetchSellerStatus = async () => {
    const sellerId = partnerData?.partner_data?.partner_business_info?.tosspayments_seller_id

    if (!sellerId) {
      setSellerStatus(null)
      return
    }

    try {
      setIsLoadingSellerStatus(true)
      const response = await mateYouApi.toss.getSeller(sellerId)

      if (response.data.success) {
        const sellerData = response.data.data
        const entityBody = sellerData?.entityBody || sellerData
        setSellerStatus(entityBody || sellerData)
      } else {
        setSellerStatus(null)
      }
    } catch (error) {
      console.error('셀러 상태 조회 오류:', error)
      setSellerStatus(null)
    } finally {
      setIsLoadingSellerStatus(false)
    }
  }

  // 토스 셀러 등록 핸들러 - 모달 열기
  const handleRegisterSeller = async () => {
    if (!user?.id) {
      toast.error('사용자 정보를 확인할 수 없습니다.')
      return
    }

    if (!partnerData?.partner_data) {
      toast.error('파트너 정보를 확인할 수 없습니다.')
      return
    }

    // 등록 모드로 모달 열기
    setTossSellerModalMode('register')
    setIsTossSellerModalOpen(true)
  }

  // 정산 정보 수정 핸들러 - 모달 열기
  const handleEditSettlement = () => {
    // 수정 모드로 모달 열기
    setTossSellerModalMode('edit')
    setIsTossSellerModalOpen(true)
  }

  // 실제 토스 셀러 등록/수정 처리
  const handleTossSellerSubmit = async (tossInfo: any) => {
    if (!user?.id || !partnerData?.partner_data) {
      return
    }

    setIsRegisteringSeller(true)
    try {
      // 백엔드 API가 partner_business_info 테이블 업데이트 처리
      if (tossSellerModalMode === 'register') {
        // 등록 모드: 토스 셀러 등록
        const result = await syncPartnerSeller(user.id)

        if (!result.success) {
          throw new Error(result.message || '토스 셀러 등록에 실패했습니다.')
        }

        toast.success('토스 셀러 등록이 완료되었습니다.')
        await refetch()
        await fetchSellerStatus()
        setIsTossSellerModalOpen(false)
      } else {
        // 수정 모드: 먼저 정산 정보를 DB에 저장
        const businessInfoResult = await mateYouApi.partnerDashboard.updateBusinessInfo({
          legalName: tossInfo.legalName,
          legalEmail: tossInfo.legalEmail,
          legalPhone: tossInfo.legalPhone,
          payoutBankCode: tossInfo.payoutBankCode,
          payoutBankName: tossInfo.payoutBankName,
          payoutAccountNumber: tossInfo.payoutAccountNumber,
          payoutAccountHolder: tossInfo.payoutAccountHolder,
        })

        if (!businessInfoResult.data?.success) {
          throw new Error(businessInfoResult.data?.error?.message || '정산 정보 저장에 실패했습니다.')
        }

        // 토스 셀러가 이미 등록되어 있으면 토스 측 정보도 업데이트
        if (partnerData.partner_data.partner_business_info?.tosspayments_seller_id) {
          const updateResult = await syncPartnerSellerContact(user.id)

          if (!updateResult.success) {
            throw new Error(updateResult.message || '토스 셀러 정보 업데이트에 실패했습니다.')
          }

          toast.success('정산 정보가 저장되고 토스 셀러 정보가 업데이트되었습니다.')
          await refetch()
          await fetchSellerStatus()
          setIsTossSellerModalOpen(false)
        } else {
          // 토스 셀러가 등록되어 있지 않으면 정보만 저장 (이미 위에서 저장됨)
          toast.success('정산 정보가 저장되었습니다.')
          await refetch()
          setIsTossSellerModalOpen(false)
        }
      }
    } catch (error) {
      console.error('정산 정보 처리 오류:', error)

      let errorMessage = '정산 정보 처리 중 오류가 발생했습니다.'

      if (error instanceof Error) {
        errorMessage = error.message
      } else if (typeof error === 'string') {
        errorMessage = error
      } else if (error && typeof error === 'object') {
        const err = error as any
        errorMessage = err.message || err.error?.message || err.data?.message || errorMessage
      }

      toast.error(errorMessage)
    } finally {
      setIsRegisteringSeller(false)
    }
  }

  // 토스 셀러 삭제 핸들러
  const handleDeleteSeller = async () => {
    const sellerId = partnerData?.partner_data?.partner_business_info?.tosspayments_seller_id
    if (!sellerId) {
      toast.error('셀러 ID를 찾을 수 없습니다.')
      return
    }

    setIsDeletingSeller(true)
    try {
      const response = await mateYouApi.toss.deleteSeller(sellerId)

      if (response.data.success) {
        // 백엔드에서 partner_business_info 업데이트 처리됨
        toast.success('토스 셀러가 삭제되었습니다.')
        await refetch()
        setSellerStatus(null)
        setIsDeleteSellerModalOpen(false)
      } else {
        toast.error(response.data.error?.message || '셀러 삭제에 실패했습니다.')
      }
    } catch (error) {
      console.error('토스 셀러 삭제 오류:', error)
      toast.error(
        error instanceof Error ? error.message : '셀러 삭제 중 오류가 발생했습니다.'
      )
    } finally {
      setIsDeletingSeller(false)
    }
  }

  // 새 퀘스트 추가
  const handleAddJob = async () => {
    if (isAddingJob) return // 중복 실행 방지
    
    if (!newJob.job_name.trim() || newJob.coins_per_job <= 0) {
      toast.error('퀘스트명과 올바른 코인 금액을 입력해주세요.')
      return
    }

    if (!partnerData?.partner_data?.id) {
      toast.error('파트너 정보를 찾을 수 없습니다.')
      return
    }

    setIsAddingJob(true)
    try {
      console.log('🔍 newJob 상태:', newJob)
      console.log('🔍 partnerMemberships:', partnerMemberships)
      
      const jobData: any = {
        job_name: newJob.job_name.trim(),
        coins_per_job: newJob.coins_per_job,
      }
      if (newJob.membership_id) jobData.membership_id = newJob.membership_id
      if (newJob.min_tier_rank > 0) jobData.min_tier_rank = newJob.min_tier_rank
      
      console.log('🔍 퀘스트 생성 요청 데이터:', JSON.stringify(jobData))
      
      const response = await edgeApi.partnerDashboard.createJob(jobData)
      console.log('🔍 퀘스트 생성 응답:', JSON.stringify(response))

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to create job')
      }

      toast.success('새 퀘스트가 추가되었습니다.')
      setNewJob({ job_name: '', coins_per_job: 0, membership_id: '', min_tier_rank: 0 })
      setIsAddJobModalOpen(false)
      refetchJobs()
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('퀘스트 추가 실패:', errorMessage)
      toast.error(`퀘스트 추가에 실패했습니다: ${errorMessage}`)
    } finally {
      setIsAddingJob(false)
    }
  }

  const partnerStatus = partnerData?.partner_data?.partner_status || 'none'

  // 의뢰 데이터 가져오기
  const fetchPartnerRequests = async () => {
    if (!partnerData?.partner_data?.id) return

    try {
      setRequestsLoading(true)
      const response = await edgeApi.partnerDashboard.getRequests()

      if (!response.success) {
        throw new Error(response.error?.message || 'Failed to fetch partner requests')
      }

      setPartnerRequests((response.data as Array<PartnerRequest>) || [])
    } catch (error) {
      console.error('Error fetching partner requests:', error)
      toast.error('의뢰 목록을 불러오는 중 오류가 발생했습니다.')
    } finally {
      setRequestsLoading(false)
    }
  }

  // 의뢰 완료 처리 (포인트 지급 포함)
  const handleCompleteRequest = async (request: any) => {
    try {
      await completeRequest(request.id)
    } catch (error) {
      console.error('의뢰 완료 처리 실패:', error)
      throw error
    }
  }

  // 의뢰 탭이 활성화될 때 데이터 가져오기
  React.useEffect(() => {
    if (activeTab === 'requests' && partnerData?.partner_data?.id) {
      fetchPartnerRequests()
    }
  }, [activeTab, partnerData?.partner_data?.id])

  // 차단 탭이 활성화될 때 차단된 사용자 목록 가져오기
  React.useEffect(() => {
    if (activeTab === 'blocked') {
      fetchBlockedUsers()
    }
  }, [activeTab, user?.id])

  // 멤버십 목록 가져오기 함수
  const fetchPartnerMemberships = React.useCallback(async () => {
    try {
      const response = await edgeApi.membership.getMyMemberships()
      if (response.success && response.data) {
        const memberships = (response.data as any[]).map((m: any) => ({
          id: m.id,
          name: m.name,
          tier_rank: m.tier_rank,
        }))
        setPartnerMemberships(memberships)
      }
    } catch (error) {
      console.error('멤버십 조회 실패:', error)
    }
  }, [])

  // 퀘스트 탭이 활성화될 때 멤버십 목록 가져오기
  React.useEffect(() => {
    if (activeTab === 'jobs') {
      fetchPartnerMemberships()
    }
  }, [activeTab, fetchPartnerMemberships])

  // 새 퀘스트 모달이 열릴 때도 멤버십 조회
  React.useEffect(() => {
    if (isAddJobModalOpen && partnerMemberships.length === 0) {
      fetchPartnerMemberships()
    }
  }, [isAddJobModalOpen, partnerMemberships.length, fetchPartnerMemberships])

  // 포인트/정산 탭이 활성화될 때 셀러 상태 조회
  React.useEffect(() => {
    if (activeTab === 'history' && partnerData?.partner_data?.partner_business_info?.tosspayments_seller_id) {
      fetchSellerStatus()
    }
  }, [activeTab, partnerData?.partner_data?.partner_business_info?.tosspayments_seller_id])

  // 방송 관리 탭이 활성화될 때 통계 조회
  const fetchStreamStats = React.useCallback(async () => {
    if (!partnerData?.partner_data?.id) return

    setStreamStats(prev => ({ ...prev, isLoading: true }))
    try {
      // 총 후원 금액 조회
      const { data: donationsData } = await supabase
        .from('stream_donations')
        .select('amount')
        .eq('recipient_partner_id', partnerData.partner_data.id)

      const totalDonations = donationsData?.reduce((sum, d) => sum + (d.amount || 0), 0) || 0

      // 최근 방송 목록 조회
      const { data: recentRooms } = await supabase
        .from('stream_rooms')
        .select('id, title, stream_type, status, started_at, ended_at, viewer_count, total_viewers')
        .eq('host_partner_id', partnerData.partner_data.id)
        .order('created_at', { ascending: false })
        .limit(5)

      // 누적 후원자 TOP 10 조회
      const { data: topDonors } = await supabase
        .from('stream_donations')
        .select(`
          donor_id,
          amount,
          donor:members!stream_donations_donor_id_fkey(id, name, profile_image)
        `)
        .eq('recipient_partner_id', partnerData.partner_data.id)

      // 후원자별 합계 계산
      const donorTotals = new Map<string, { name: string; profileImage: string | null; total: number }>()
      topDonors?.forEach((d: any) => {
        const existing = donorTotals.get(d.donor_id)
        if (existing) {
          existing.total += d.amount
        } else {
          donorTotals.set(d.donor_id, {
            name: d.donor?.name || '익명',
            profileImage: d.donor?.profile_image || null,
            total: d.amount,
          })
        }
      })

      const sortedDonors = Array.from(donorTotals.entries())
        .map(([id, data]) => ({ id, ...data }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10)

      setStreamStats({
        totalDonations,
        recentRooms: recentRooms || [],
        topDonors: sortedDonors,
        isLoading: false,
      })
    } catch (error) {
      console.error('방송 통계 조회 실패:', error)
      setStreamStats(prev => ({ ...prev, isLoading: false }))
    }
  }, [partnerData?.partner_data?.id])

  React.useEffect(() => {
    if (activeTab === 'stream' && partnerData?.partner_data?.id) {
      fetchStreamStats()
    }
  }, [activeTab, partnerData?.partner_data?.id, fetchStreamStats])

  const handleStatusChange = async () => {
    const nextStatus = getNextStatus(partnerStatus)
    try {
      await updatePartnerStatus(nextStatus)
    } catch (error) {
      console.error('Failed to update status:', error)
    }
  }

  const handleWithdraw = async (
    amount: number,
    accountHolder: string,
    bankName: string,
    accountNumber: string,
  ) => {
    try {
      const memberId = user?.id
      if (!memberId) {
        throw new Error('사용자 정보를 찾을 수 없습니다.')
      }

      const result = await submitWithdrawalRequest(
        memberId,
        amount,
        accountHolder,
        bankName,
        accountNumber,
      )

      if (result.success) {
        setIsWithdrawModalOpen(false)
        toast.success(result.message)
        window.location.reload()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error('Failed to process withdrawal:', error)
      toast.error('출금 요청 중 오류가 발생했습니다.')
      throw error
    }
  }

  const handleStoreWithdraw = async (
    amount: number,
    accountHolder: string,
    bankName: string,
    accountNumber: string,
  ) => {
    try {
      const memberId = user?.id
      if (!memberId) {
        throw new Error('사용자 정보를 찾을 수 없습니다.')
      }

      // 배분율 적용 (default_distribution_rate, 기본값 85%)
      const distributionRate = partnerData?.partner_data?.partner_business_info?.default_distribution_rate ?? 85
      const actualAmount = Math.floor(amount * (distributionRate / 100))

      const result = await submitWithdrawalRequest(
        memberId,
        actualAmount,
        accountHolder,
        bankName,
        accountNumber,
        'store_points'
      )

      if (result.success) {
        setIsStoreWithdrawModalOpen(false)
        toast.success(`${result.message} (배분율 ${distributionRate}% 적용)`)
        window.location.reload()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error('Failed to process store withdrawal:', error)
      toast.error('스토어 포인트 출금 요청 중 오류가 발생했습니다.')
      throw error
    }
  }

  const handleCollabWithdraw = async (
    amount: number,
    accountHolder: string,
    bankName: string,
    accountNumber: string,
  ) => {
    try {
      const memberId = user?.id
      if (!memberId) {
        throw new Error('사용자 정보를 찾을 수 없습니다.')
      }

      // 협업 배분율 적용 (collaboration_distribution_rate, 기본값 85%)
      const distributionRate = partnerData?.partner_data?.partner_business_info?.collaboration_distribution_rate ?? 85
      const actualAmount = Math.floor(amount * (distributionRate / 100))

      const result = await submitWithdrawalRequest(
        memberId,
        actualAmount,
        accountHolder,
        bankName,
        accountNumber,
        'collaboration_store_points'
      )

      if (result.success) {
        setIsCollabWithdrawModalOpen(false)
        toast.success(`${result.message} (배분율 ${distributionRate}% 적용)`)
        window.location.reload()
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error('Failed to process collab withdrawal:', error)
      toast.error('협업 스토어 포인트 출금 요청 중 오류가 발생했습니다.')
      throw error
    }
  }

  const handleStatusToggle = async () => {
    if (!user?.social_id) {
      toast.error('사용자 정보를 찾을 수 없습니다.')
      return
    }

    // 매칭중이나 게임중일 때는 변경 불가
    if (
      user.current_status === 'matching' ||
      user.current_status === 'in_game'
    ) {
      toast.error('매칭중이나 게임중이면 상태 변경이 불가능합니다')
      return
    }

    const newStatus = user.current_status !== 'offline' ? 'offline' : 'online'


    try {
      // 낙관적 업데이트: UI를 먼저 변경
      queryClient.setQueryData(['user'], (oldData: any) => {
        if (oldData) {
          return { ...oldData, current_status: newStatus }
        }
        return oldData
      })

      const result = await updatePartnerCurrentStatus(user.social_id, newStatus)


      if (result.success) {
        toast.success(result.message)
        // 사용자 정보 새로고침으로 최종 확인

        // React Query 캐시 무효화 및 새로고침
        queryClient.invalidateQueries({ queryKey: ['user'] })
        queryClient.invalidateQueries({ queryKey: ['partner-details'] })
        queryClient.invalidateQueries({ queryKey: ['members'] })

        await refreshUser()
        refetch() // 파트너 데이터도 새로고침

      } else {
        // 실패 시 원래 상태로 롤백
        queryClient.setQueryData(['user'], (oldData: any) => {
          if (oldData) {
            return { ...oldData, current_status: user.current_status }
          }
          return oldData
        })
        console.error('❌ 상태 변경 실패:', result.message)
        toast.error(result.message)
      }
    } catch (error) {
      // 에러 시 원래 상태로 롤백
      queryClient.setQueryData(['user'], (oldData: any) => {
        if (oldData) {
          return { ...oldData, current_status: user.current_status }
        }
        return oldData
      })
      console.error('❌ Status toggle error:', error)
      toast.error(
        error instanceof Error ? error.message : '상태 변경 중 오류가 발생했습니다.',
      )
    }
  }

  if (!user || (user.role !== 'partner' && user.role !== 'admin')) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Typography variant="h3" color="error">
          파트너 권한이 필요합니다
        </Typography>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Typography variant="h3">로딩 중...</Typography>
      </div>
    )
  }

  if (partnerStatus === 'pending') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white border rounded-2xl shadow-sm p-6 text-center space-y-3">
          <Typography variant="h3" className="text-gray-900">
            파트너 심사 대기중이에요
          </Typography>
          <Typography variant="body1" color="text-secondary">
            파트너 신청이 접수되어 심사 중입니다. 심사가 완료되면 대시보드와
            서비스 관리 기능을 이용하실 수 있습니다.
          </Typography>
          <Typography variant="body2" color="text-secondary">
            심사 상태는 마이페이지 또는 파트너 신청 페이지에서 확인해 주세요.
          </Typography>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24 lg:pb-16">
      <Navigation />
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col space-y-4 py-4 sm:flex-row sm:items-start sm:space-y-0 sm:py-6">
            <div className="flex w-full flex-col gap-3 pt-16 sm:w-auto">
              <Button
                variant="outline"
                size={isMobile ? 'sm' : 'md'}
                onClick={handleEditSettlement}
                className="w-full sm:w-auto"
              >
                정산 정보 수정
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav
            className={`flex ${isMobile ? 'space-x-2' : 'space-x-4 sm:space-x-8'} overflow-x-auto ${isMobile ? 'pb-0' : ''}`}
          >
            {[
              { id: 'stream', label: isMobile ? '방송' : '방송 관리' },
              { id: 'roulette', label: isMobile ? '룰렛' : '룰렛 관리' },
              { id: 'jobs', label: isMobile ? '퀘스트' : '퀘스트 관리' },
              { id: 'history', label: isMobile ? '포인트' : '포인트 결산' },
              { id: 'requests', label: isMobile ? '요청' : '요청 관리' },
              { id: 'blocked', label: isMobile ? '차단' : '차단 관리' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id as any)}
                className={`${isMobile ? 'py-3 px-3' : 'py-4 px-2 sm:px-1'} border-b-2 font-medium ${isMobile ? 'text-xs' : 'text-sm'} whitespace-nowrap cursor-pointer transition-colors duration-200 ${
                  activeTab === tab.id
                    ? 'border-[#FE3A8F] text-[#FE3A8F]'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {tab.label}
                  {tab.id === 'history' && !partnerData?.partner_data?.partner_business_info?.tosspayments_seller_id && (
                    <span className="inline-flex items-center justify-center w-2 h-2 bg-red-500 rounded-full animate-pulse" title="토스 셀러 미등록">
                      <span className="sr-only">토스 셀러 미등록</span>
                    </span>
                  )}
                </span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-32">
        {activeTab === 'history' && (
          <div className="space-y-6">
            {/* Points Summary Cards */}
            <Grid cols={1} mdCols={isMobile ? 1 : 2} gap={isMobile ? 3 : 4}>
              <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border">
                <Typography
                  variant="body2"
                  color="text-secondary"
                  className="mb-2"
                >
                  파트너 수익 포인트
                </Typography>
                <Typography
                  variant="h3"
                  color="primary"
                  className={`${isMobile ? 'text-xl' : 'text-2xl sm:text-3xl'} mb-3`}
                >
                  {partnerData?.partner_data?.total_points?.toLocaleString() || '0'}P
                </Typography>
                <div className="flex items-center gap-2 mb-3">
                  <Typography variant="caption" color="text-secondary">
                    출금 가능: {((partnerData?.partner_data?.total_points ?? 0) - pendingWithdrawals.byType.total_points).toLocaleString()}P
                  </Typography>
                </div>
                <Button
                  variant="primary"
                  size={isMobile ? 'sm' : 'sm'}
                  className="w-full"
                  onClick={() => {
                    if (!sellerStatus?.status) {
                      alert('정산 정보가 등록되어 있지 않습니다. 먼저 정산 정보를 등록해주세요.')
                      return
                    }
                    if (sellerStatus?.status === 'APPROVAL_REQUIRED') {
                      alert('토스 신청시 적었던 이메일 혹은 카카오톡을 확인해주세요.')
                      return
                    }
                    if (sellerStatus?.status.includes('APPROVED')) {
                      setIsWithdrawModalOpen(true)
                    } else {
                      alert('지급대행이 불가능한 상태입니다. 관리자에게 문의하여 셀러 상태를 확인해주세요.')
                    }
                  }}
                >
                  포인트 출금
                </Button>
              </div>

              <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border">
                {/* 탭 */}
                <div className="flex gap-1 mb-4 p-1 bg-gray-100 rounded-lg">
                  <button
                    onClick={() => setStorePointsTab('store')}
                    className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      storePointsTab === 'store'
                        ? 'bg-white text-emerald-700 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    스토어
                  </button>
                  <button
                    onClick={() => setStorePointsTab('collab')}
                    className={`flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      storePointsTab === 'collab'
                        ? 'bg-white text-purple-700 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    협업
                  </button>
                </div>

                {/* 스토어 포인트 탭 */}
                {storePointsTab === 'store' && (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <Typography variant="body2" color="text-secondary">
                        스토어 포인트
                      </Typography>
                    </div>
                    <Typography
                      variant="h3"
                      color="success"
                      className={`${isMobile ? 'text-xl' : 'text-2xl sm:text-3xl'} mb-3`}
                    >
                      {(partnerData?.partner_data as any)?.store_points?.toLocaleString() || '0'}P
                    </Typography>
                    <Button
                      variant="primary"
                      size={isMobile ? 'sm' : 'sm'}
                      className="w-full bg-emerald-600 hover:bg-emerald-700"
                      onClick={() => {
                        if (!sellerStatus?.status) {
                          alert('정산 정보가 등록되어 있지 않습니다. 먼저 정산 정보를 등록해주세요.')
                          return
                        }
                        if (sellerStatus?.status === 'APPROVAL_REQUIRED') {
                          alert('토스 신청시 적었던 이메일 혹은 카카오톡을 확인해주세요.')
                          return
                        }
                        if (sellerStatus?.status.includes('APPROVED')) {
                          setIsStoreWithdrawModalOpen(true)
                        } else {
                          alert('지급대행이 불가능한 상태입니다. 관리자에게 문의하여 셀러 상태를 확인해주세요.')
                        }
                      }}
                    >
                      스토어 포인트 출금
                    </Button>
                  </>
                )}

                {/* 협업 포인트 탭 */}
                {storePointsTab === 'collab' && (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <Typography variant="body2" color="text-secondary">
                        협업 스토어 포인트
                      </Typography>
                    </div>
                    <Typography
                      variant="h3"
                      className={`${isMobile ? 'text-xl' : 'text-2xl sm:text-3xl'} mb-3 text-purple-600`}
                    >
                      {(partnerData?.partner_data as any)?.collaboration_store_points?.toLocaleString() || '0'}P
                    </Typography>
                    <Button
                      variant="primary"
                      size={isMobile ? 'sm' : 'sm'}
                      className="w-full bg-purple-600 hover:bg-purple-700"
                      onClick={() => {
                        if (!sellerStatus?.status) {
                          alert('정산 정보가 등록되어 있지 않습니다. 먼저 정산 정보를 등록해주세요.')
                          return
                        }
                        if (sellerStatus?.status === 'APPROVAL_REQUIRED') {
                          alert('토스 신청시 적었던 이메일 혹은 카카오톡을 확인해주세요.')
                          return
                        }
                        if (sellerStatus?.status.includes('APPROVED')) {
                          setIsCollabWithdrawModalOpen(true)
                        } else {
                          alert('지급대행이 불가능한 상태입니다. 관리자에게 문의하여 셀러 상태를 확인해주세요.')
                        }
                      }}
                    >
                      협업 포인트 출금
                    </Button>
                  </>
                )}
              </div>
            </Grid>

            {/* 환전 대기 포인트 */}
            <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border">
              <Typography variant="body2" color="text-secondary" className="mb-2">
                환전 대기 포인트
              </Typography>
              <Typography
                variant="h3"
                color="warning"
                className={`${isMobile ? 'text-xl' : 'text-2xl sm:text-3xl'} mb-3`}
              >
                {pendingWithdrawals.total.toLocaleString()}P
              </Typography>
              <div className="space-y-1.5 pt-2 border-t border-gray-100">
                <div className="flex justify-between items-center">
                  <Typography variant="caption" color="text-secondary">일반 포인트</Typography>
                  <Typography variant="caption" className="font-medium text-orange-600">
                    {pendingWithdrawals.byType.total_points.toLocaleString()}P
                  </Typography>
                </div>
                <div className="flex justify-between items-center">
                  <Typography variant="caption" color="text-secondary">스토어 포인트</Typography>
                  <Typography variant="caption" className="font-medium text-orange-600">
                    {pendingWithdrawals.byType.store_points.toLocaleString()}P
                  </Typography>
                </div>
                <div className="flex justify-between items-center">
                  <Typography variant="caption" color="text-secondary">협업 포인트</Typography>
                  <Typography variant="caption" className="font-medium text-orange-600">
                    {pendingWithdrawals.byType.collaboration_store_points.toLocaleString()}P
                  </Typography>
                </div>
              </div>
            </div>

            {/* 토스페이먼츠 셀러 등록 섹션 */}
            <div className="bg-white rounded-lg shadow-sm border">
              <div className={`${isMobile ? 'p-4' : 'p-6'} border-b`}>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Typography variant="h4">정산 정보</Typography>
                      {!partnerData?.partner_data?.partner_business_info?.tosspayments_seller_id && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 animate-pulse">
                          미등록
                        </span>
                      )}
                    </div>
                    <Typography variant="body2" color="text-secondary">
                      {partnerData?.partner_data?.partner_business_info?.tosspayments_seller_id
                        ? `토스 셀러 등록 완료 (ID: ${String(partnerData.partner_data.partner_business_info.tosspayments_seller_id).slice(0, 8)}...)`
                        : '토스 셀러 미등록'}
                    </Typography>
                    {sellerStatus?.status ? (
                      <Typography variant="caption" className="mt-1 block">
                        상태: <span className={`px-2 py-0.5 rounded text-xs ${getSellerStatusColor(sellerStatus.status)}`}>
                          {getSellerStatusLabel(sellerStatus.status)}
                        </span>
                      </Typography>
                    ) : partnerData?.partner_data?.partner_business_info?.tosspayments_status && (
                      <Typography variant="caption" color="text-secondary" className="mt-1">
                        상태: {getSellerStatusLabel(partnerData.partner_data.partner_business_info.tosspayments_status)}
                      </Typography>
                    )}
                    {partnerData?.partner_data?.partner_business_info?.tosspayments_synced_at && (
                      <Typography variant="caption" color="text-secondary" className="mt-1 block">
                        최종 동기화: {new Date(partnerData.partner_data.partner_business_info.tosspayments_synced_at).toLocaleString('ko-KR')}
                      </Typography>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {partnerData?.partner_data?.partner_business_info?.tosspayments_seller_id && sellerStatus?.status !== 'PARTIALLY_APPROVED' && (
                      <Button
                        variant="outline"
                        size={isMobile ? 'sm' : 'md'}
                        onClick={fetchSellerStatus}
                        disabled={isLoadingSellerStatus}
                      >
                        {isLoadingSellerStatus ? '조회 중...' : '상태 조회'}
                      </Button>
                    )}

                    {sellerStatus?.status === 'PARTIALLY_APPROVED' ? (
                      <>
                        <Button
                          variant="outline"
                          size={isMobile ? 'sm' : 'md'}
                          onClick={handleRegisterSeller}
                          disabled={isRegisteringSeller}
                          loading={isRegisteringSeller}
                        >
                          KYC 인증 진행
                        </Button>
                        <Button
                          variant="outline"
                          size={isMobile ? 'sm' : 'md'}
                          onClick={() => setIsDeleteSellerModalOpen(true)}
                          className="text-red-600 border-red-300 hover:bg-red-50"
                        >
                          셀러 삭제
                        </Button>
                      </>
                    ) : partnerData?.partner_data?.partner_business_info?.tosspayments_seller_id ? (
                      <Button
                        variant="outline"
                        size={isMobile ? 'sm' : 'md'}
                        onClick={() => setIsDeleteSellerModalOpen(true)}
                        className="text-red-600 border-red-300 hover:bg-red-50"
                      >
                        셀러 삭제
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        size={isMobile ? 'sm' : 'md'}
                        onClick={handleRegisterSeller}
                        disabled={isRegisteringSeller}
                        loading={isRegisteringSeller}
                      >
                        {isRegisteringSeller ? '등록 중...' : '토스 셀러 등록'}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* 셀러 상세 정보 */}
              {sellerStatus && (
                <div className={`${isMobile ? 'p-4' : 'p-6'}`}>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {sellerStatus.sellerName && (
                      <div>
                        <Typography variant="caption" color="text-secondary">셀러명</Typography>
                        <Typography variant="body2">{sellerStatus.sellerName}</Typography>
                      </div>
                    )}
                    {sellerStatus.account?.bankCode && (
                      <div>
                        <Typography variant="caption" color="text-secondary">정산 계좌</Typography>
                        <Typography variant="body2">
                          {findBankByCode(sellerStatus.account.bankCode)?.name || sellerStatus.account.bankCode} {sellerStatus.account.accountNumber || ''}
                        </Typography>
                      </div>
                    )}
                    {sellerStatus.createdAt && (
                      <div>
                        <Typography variant="caption" color="text-secondary">등록일</Typography>
                        <Typography variant="body2">
                          {new Date(sellerStatus.createdAt).toLocaleDateString('ko-KR')}
                        </Typography>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 인증 안내문 */}
              <div className={`${isMobile ? 'px-4 py-4' : 'px-6 py-6'}`}>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <Typography variant="body2" className="text-blue-800">
                    <span className="font-medium">인증 안내</span>
                  </Typography>
                  <ul className="mt-2 space-y-1 text-sm text-blue-700">
                    <li>1. 셀러 등록을 하면 알림톡(카카오톡)으로 토스가 인증 메시지를 보내요</li>
                    <li>2. 만약 인증 메시지가 오지 않았다면 등록한 메일로 인증 메일이 가니 꼭 확인해주세요</li>
                    <li>3. 셀러 등록을 완료하지 않으면 정상적인 포인트 출금이 되지 않아요</li>
                    <li>4. 포인트 출금 실패했을 경우 상태 조회를 눌려주시고 문제가 있다면 셀러 삭제 후 다시 등록해주세요</li>
                    <li>5. 이외의 문제가 발생하면 꼭 관리자에게 문의해주세요</li>
                    <li>추가적으로 셀러는 개인 셀러로 등록되어서 일주일 동안 최대 1천만원까지 출금할 수 있어요. 1천만원이 초과되면 출금이 제한됩니다.</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* 포인트 히스토리 */}
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="p-6 border-b">
                <div>
                  <Typography variant="h4">포인트 내역</Typography>
                  <Typography
                    variant="body2"
                    color="text-secondary"
                    className="mt-1"
                  >
                    포인트 적립 및 차감 내역을 확인할 수 있습니다.
                  </Typography>
                </div>
              </div>
              <div className="p-6">
                {pointHistory.length === 0 ? (
                  <div className="text-center py-8">
                    <Typography variant="body1" color="text-secondary">
                      포인트 내역이 없습니다.
                    </Typography>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pointHistory.slice(0, 10).map((log, index) => (
                      <div
                        key={index}
                        className="flex justify-between items-center py-3 border-b border-gray-100 last:border-b-0"
                      >
                        <div>
                          <Typography variant="body1" className="font-medium">
                            {log.description}
                          </Typography>
                          <Typography variant="caption" color="text-secondary">
                            {new Date(log.created_at).toLocaleString('ko-KR')}
                          </Typography>
                        </div>
                        <div className="text-right">
                          <Typography
                            variant="body1"
                            className={`font-semibold ${log.type === 'earn' ? 'text-green-600' : 'text-red-600'}`}
                          >
                            {log.type === 'earn' ? '+' : '-'}
                            {log.amount.toLocaleString()}P
                          </Typography>
                        </div>
                      </div>
                    ))}
                    {pointHistory.length > 10 && (
                      <div className="text-center pt-4">
                        <Typography variant="body2" color="text-secondary">
                          더 많은 내역을 보려면 상세 페이지를 확인하세요.
                        </Typography>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'requests' && (
          <div className="space-y-6">
            {/* 의뢰 현황 카드 */}
            <Grid cols={isMobile ? 2 : 1} mdCols={4} gap={isMobile ? 3 : 4}>
              <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border">
                <Typography
                  variant="body2"
                  color="text-secondary"
                  className="mb-2"
                >
                  전체 의뢰
                </Typography>
                <Typography
                  variant="h3"
                  className={`${isMobile ? 'text-lg' : 'text-2xl sm:text-3xl'} mb-1`}
                >
                  {partnerRequests.length}
                </Typography>
              </div>
              <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border">
                <Typography
                  variant="body2"
                  color="text-secondary"
                  className="mb-2"
                >
                  대기중
                </Typography>
                <Typography
                  variant="h3"
                  color="warning"
                  className={`${isMobile ? 'text-lg' : 'text-2xl sm:text-3xl'} mb-1`}
                >
                  {
                    partnerRequests.filter((req) => req.status === 'pending')
                      .length
                  }
                </Typography>
              </div>
              <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border">
                <Typography
                  variant="body2"
                  color="text-secondary"
                  className="mb-2"
                >
                  진행중
                </Typography>
                <Typography
                  variant="h3"
                  color="primary"
                  className={`${isMobile ? 'text-lg' : 'text-2xl sm:text-3xl'} mb-1`}
                >
                  {
                    partnerRequests.filter(
                      (req) => req.status === 'in_progress',
                    ).length
                  }
                </Typography>
              </div>
              <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border">
                <Typography
                  variant="body2"
                  color="text-secondary"
                  className="mb-2"
                >
                  완료
                </Typography>
                <Typography
                  variant="h3"
                  color="success"
                  className={`${isMobile ? 'text-lg' : 'text-2xl sm:text-3xl'} mb-1`}
                >
                  {
                    partnerRequests.filter((req) => req.status === 'completed')
                      .length
                  }
                </Typography>
              </div>
            </Grid>

            {/* 의뢰 목록 */}
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="p-6 border-b">
                <Typography variant="h4">의뢰 목록</Typography>
                <Typography
                  variant="body2"
                  color="text-secondary"
                  className="mt-1"
                >
                  받은 의뢰를 관리할 수 있습니다.
                </Typography>
              </div>
              <div className="p-6">
                {requestsLoading ? (
                  <div className="text-center py-8">
                    <Typography variant="body1">로딩 중...</Typography>
                  </div>
                ) : partnerRequests.length === 0 ? (
                  <div className="text-center py-8">
                    <Typography variant="body1" color="text-secondary">
                      아직 받은 의뢰가 없습니다.
                    </Typography>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {partnerRequests.map((request) => {
                      return (
                        <div
                          key={request.id}
                          className="border rounded-lg p-4 space-y-3"
                        >
                          <div
                            className={`flex ${isMobile ? 'flex-col gap-2' : 'flex-col sm:flex-row sm:items-start sm:justify-between gap-3'}`}
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <Typography
                                  variant="h6"
                                  className="font-medium"
                                >
                                  {request.request_type}
                                </Typography>
                                <span
                                  className={`px-2 py-1 text-xs rounded-full font-medium ${
                                    request.status === 'pending'
                                      ? 'bg-yellow-100 text-yellow-800'
                                      : request.status === 'in_progress'
                                        ? 'bg-blue-100 text-blue-800'
                                        : request.status === 'completed'
                                          ? 'bg-green-100 text-green-800'
                                          : 'bg-gray-100 text-gray-800'
                                  }`}
                                >
                                  {request.status === 'pending'
                                    ? '대기중'
                                    : request.status === 'in_progress'
                                      ? '진행중'
                                      : request.status === 'completed'
                                        ? '완료'
                                        : request.status === 'cancelled'
                                          ? '취소'
                                          : '알 수 없음'}
                                </span>
                              </div>
                              <Typography
                                variant="body2"
                                color="text-secondary"
                                className="mb-1"
                              >
                                클라이언트:{' '}
                                {request.client?.name || '알 수 없음'}
                              </Typography>
                              <Typography
                                variant="body2"
                                color="text-secondary"
                                className="mb-1"
                              >
                                작업 수량: {request.job_count}개
                              </Typography>
                              <Typography
                                variant="body2"
                                color="text-secondary"
                                className="mb-1"
                              >
                                총 금액: {request.total_coins.toLocaleString()}P
                              </Typography>
                              <Typography
                                variant="body2"
                                color="text-secondary"
                              >
                                요청일:{' '}
                                {new Date(
                                  request.requested_at,
                                ).toLocaleDateString('ko-KR')}
                              </Typography>
                              {request.note && (
                                <Typography
                                  variant="body2"
                                  className="mt-2 p-2 bg-gray-50 rounded"
                                >
                                  {request.note}
                                </Typography>
                              )}
                            </div>
                            <div className="flex flex-row sm:flex-col gap-2">
                              {request.status === 'pending' && (
                                <>
                                  <Button
                                    variant="primary"
                                    size="sm"
                                    onClick={async () => {
                                      try {
                                        await acceptRequest(request.id)

                                        // 로컬 상태 즉시 업데이트 (낙관적 업데이트)
                                        setPartnerRequests((prev) =>
                                          prev.map((req) =>
                                            req.id === request.id
                                              ? {
                                                  ...req,
                                                  status: 'in_progress',
                                                  started_at:
                                                    new Date().toISOString(),
                                                }
                                              : req,
                                          ),
                                        )

                                        // 한 번만 새로고침 (낙관적 업데이트로 이미 UI 변경됨)
                                        setTimeout(() => {
                                          fetchPartnerRequests() // 의뢰 목록만 새로고침
                                        }, 500)
                                      } catch (error) {
                                        console.error('수락 실패:', error)
                                        // 실패 시 원래 상태로 롤백
                                        setPartnerRequests((prev) =>
                                          prev.map((req) =>
                                            req.id === request.id
                                              ? { ...req, status: 'pending' }
                                              : req,
                                          ),
                                        )
                                      }
                                    }}
                                    disabled={isAccepting}
                                    className="flex-1 sm:flex-none"
                                  >
                                    {isAccepting ? '처리중...' : '수락'}
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={async () => {
                                      const reason = prompt(
                                        '거절 사유를 입력해주세요 (선택사항):',
                                      )
                                      if (reason === null) return // 취소

                                      try {
                                        await rejectRequest(
                                          request.id,
                                          reason || undefined,
                                        )

                                        // 로컬 상태 즉시 업데이트
                                        setPartnerRequests((prev) =>
                                          prev.map((req) =>
                                            req.id === request.id
                                              ? {
                                                  ...req,
                                                  status: 'cancelled',
                                                  cancelled_at:
                                                    new Date().toISOString(),
                                                }
                                              : req,
                                          ),
                                        )

                                        // 의뢰 목록만 새로고침
                                        setTimeout(() => {
                                          fetchPartnerRequests()
                                        }, 500)
                                      } catch (error) {
                                        console.error('거절 실패:', error)
                                      }
                                    }}
                                    disabled={isAccepting}
                                    className="flex-1 sm:flex-none"
                                  >
                                    거절
                                  </Button>
                                </>
                              )}
                              {request.status === 'in_progress' && (
                                <Button
                                  variant="success"
                                  size="sm"
                                  onClick={async () => {
                                    try {

                                      // 로컬 상태 즉시 업데이트
                                      setPartnerRequests((prev) =>
                                        prev.map((req) =>
                                          req.id === request.id
                                            ? {
                                                ...req,
                                                status: 'completed',
                                                completed_at:
                                                  new Date().toISOString(),
                                              }
                                            : req,
                                        ),
                                      )

                                      // 완료 처리 및 포인트 지급
                                      await handleCompleteRequest(request)

                                      // 완료 후 포인트 데이터도 새로고침 필요
                                      setTimeout(() => {
                                        fetchPartnerRequests()
                                        refetch() // 포인트 데이터 새로고침
                                      }, 500)

                                    } catch (error) {
                                      console.error('완료 처리 실패:', error)
                                      alert('완료 처리에 실패했습니다.')
                                      // 실패 시 원래 상태로 롤백
                                      setPartnerRequests((prev) =>
                                        prev.map((req) =>
                                          req.id === request.id
                                            ? { ...req, status: 'in_progress' }
                                            : req,
                                        ),
                                      )
                                    }
                                  }}
                                  disabled={isAccepting}
                                  className="flex-1 sm:flex-none"
                                >
                                  {isAccepting ? '처리중...' : '완료'}
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'jobs' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="p-6 border-b">
                <div className="flex items-center justify-between">
                  <Typography variant="h4">퀘스트 관리</Typography>
                  <Button
                    variant="primary"
                    size={isMobile ? 'sm' : 'md'}
                    onClick={() => setIsAddJobModalOpen(true)}
                  >
                    새 퀘스트 추가
                  </Button>
                </div>
                <Typography
                  variant="caption"
                  color="text-secondary"
                  className="mt-1"
                >
                  제공하는 서비스를 관리하고 활성화/비활성화할 수 있습니다.
                </Typography>
              </div>
              <div className="p-6">
                {jobsLoading ? (
                  <div className="text-center py-8">
                    <Typography variant="body1">로딩 중...</Typography>
                  </div>
                ) : partnerJobs.length === 0 ? (
                  <div className="text-center py-8">
                    <Typography variant="body1" color="text-secondary">
                      등록된 서비스가 없습니다.
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text-secondary"
                      className="mt-2"
                    >
                      새 퀘스트 추가 버튼을 눌러 퀘스트를 추가해주세요.
                    </Typography>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {partnerJobs.map((job) => (
                      <div
                        key={job.id}
                        onClick={() => openEditJobModal(job)}
                        className={`border rounded-lg ${isMobile ? 'p-3' : 'p-4'} transition-colors cursor-pointer hover:shadow-md ${
                          job.is_active
                            ? 'bg-white border-[#FE3A8F]/30'
                            : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        <div
                          className={`flex ${isMobile ? 'flex-col gap-2' : 'flex-col sm:flex-row sm:items-center sm:justify-between gap-3'}`}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Typography variant="h6" className="font-medium">
                                {job.job_name}
                              </Typography>
                              {(job as any).membership_id && (
                                <span className="px-2 py-0.5 text-xs rounded-full bg-purple-100 text-purple-600">
                                  멤버십 전용
                                </span>
                              )}
                            </div>
                            <Typography
                              variant="body2"
                              color="text-secondary"
                              className="mb-1"
                            >
                              건당{' '}
                              {(
                                (job as typeof job & { coins_per_job?: number }).coins_per_job ?? 0
                              ).toLocaleString()}
                              코인
                            </Typography>
                            <Typography
                              variant="caption"
                              color="text-secondary"
                            >
                              등록일:{' '}
                              {new Date(job.created_at).toLocaleDateString(
                                'ko-KR',
                              )}
                            </Typography>
                          </div>
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => toggleJobStatus(job.id, job.is_active)}
                              className={`relative w-12 h-7 rounded-full transition-all border-2 ${
                                job.is_active 
                                  ? 'bg-transparent border-[#FE3A8F]' 
                                  : 'bg-transparent border-gray-300'
                              }`}
                            >
                              <span className={`absolute top-0.5 w-5 h-5 rounded-full shadow transition-all ${
                                job.is_active 
                                  ? 'bg-[#FE3A8F] left-[calc(100%-22px)]' 
                                  : 'bg-gray-300 left-0.5'
                              }`} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'blocked' && (
          <div className="space-y-6">
            <div>
              <div>
                {user?.role !== 'partner' ? (
                  <div className="text-center py-8">
                    <Typography variant="body1" color="text-secondary">
                      파트너만 사용할 수 있는 기능입니다.
                    </Typography>
                  </div>
                ) : !partnerData?.partner_data ? (
                  <div className="text-center py-8">
                    <Typography variant="body1" color="text-secondary">
                      파트너 등록이 필요합니다.
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text-secondary"
                      className="mt-2"
                    >
                      파트너 승인 후 이용할 수 있습니다.
                    </Typography>
                  </div>
                ) : blockedLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
                    <Typography variant="body1">
                      차단 목록을 불러오는 중...
                    </Typography>
                  </div>
                ) : blockedUsers.length === 0 ? (
                  <div className="text-center py-8">
                    <Typography variant="body1" color="text-secondary">
                      차단된 사용자가 없습니다.
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text-secondary"
                      className="mt-2"
                    >
                      채팅에서 사용자를 차단할 수 있습니다.
                    </Typography>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {blockedUsers.map((blockedUser) => (
                      <div
                        key={blockedUser.id}
                      >
                        <div
                          className={`flex items-center ${isMobile ? 'gap-2' : 'sm:flex-row sm:items-center sm:justify-between gap-3'}`}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                                {blockedUser.user_info?.profile_image ? (
                                  <img
                                    src={blockedUser.user_info.profile_image}
                                    alt={blockedUser.user_info.name}
                                    className="w-10 h-10 rounded-full object-cover"
                                  />
                                ) : (
                                  <span className="text-gray-500 font-medium">
                                    {blockedUser.user_info?.name?.charAt(0) ||
                                      blockedUser.user_name?.charAt(0) ||
                                      '?'}
                                  </span>
                                )}
                              </div>
                              <div>
                                <Typography
                                  variant="h6"
                                  className="font-medium"
                                >
                                  {blockedUser.user_info?.name ||
                                    blockedUser.user_name ||
                                    '알 수 없음'}
                                </Typography>
                                <Typography
                                  variant="caption"
                                  color="text-secondary"
                                >
                                  @
                                  {blockedUser.user_info?.member_code ||
                                    'unknown'}
                                </Typography>
                              </div>
                            </div>
                          </div>
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() =>
                              handleUnblockUser(
                                blockedUser.blocked_member,
                                blockedUser.user_info?.name ||
                                  blockedUser.user_name ||
                                  '사용자',
                              )
                            }
                            className="bg-[#FE3A8F] hover:bg-[#E5327F] text-white h-7 px-3 text-xs"
                          >
                            차단 해제
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 방송 관리 탭 */}
        {activeTab === 'stream' && partnerData?.partner_data?.id && (
          <StreamManagementSection
            partnerId={partnerData.partner_data.id}
            userId={user?.id || ''}
            streamStats={streamStats}
            isMobile={isMobile}
          />
        )}

        {/* 룰렛 관리 탭 */}
        {activeTab === 'roulette' && user?.id && (
          <RouletteManagementSection
            partnerId={user.id}
            isMobile={isMobile}
          />
        )}
      </div>

      {/* Withdraw Modal - 파트너 수익 포인트 */}
      <WithdrawModal
        isOpen={isWithdrawModalOpen}
        onClose={() => setIsWithdrawModalOpen(false)}
        availablePoints={(partnerData?.partner_data?.total_points || 0) - pendingWithdrawals.byType.total_points}
        accountHolder={partnerData?.partner_data?.partner_business_info?.payout_account_holder || ''}
        bankName={partnerData?.partner_data?.partner_business_info?.payout_bank_name || ''}
        accountNumber={partnerData?.partner_data?.partner_business_info?.payout_account_number || ''}
        tax={partnerData?.partner_data?.partner_business_info?.tax ?? undefined}
        onWithdraw={handleWithdraw}
      />

      {/* Store Withdraw Modal - 스토어 포인트 */}
      <WithdrawModal
        isOpen={isStoreWithdrawModalOpen}
        onClose={() => setIsStoreWithdrawModalOpen(false)}
        availablePoints={((partnerData?.partner_data as any)?.store_points || 0) - pendingWithdrawals.byType.store_points}
        accountHolder={partnerData?.partner_data?.partner_business_info?.payout_account_holder || ''}
        bankName={partnerData?.partner_data?.partner_business_info?.payout_bank_name || ''}
        accountNumber={partnerData?.partner_data?.partner_business_info?.payout_account_number || ''}
        tax={partnerData?.partner_data?.partner_business_info?.tax ?? undefined}
        onWithdraw={handleStoreWithdraw}
        title={`스토어 포인트 출금 (배분율 ${partnerData?.partner_data?.partner_business_info?.default_distribution_rate ?? 85}%)`}
      />

      {/* Collaboration Store Withdraw Modal - 협업 스토어 포인트 */}
      <WithdrawModal
        isOpen={isCollabWithdrawModalOpen}
        onClose={() => setIsCollabWithdrawModalOpen(false)}
        availablePoints={((partnerData?.partner_data as any)?.collaboration_store_points || 0) - pendingWithdrawals.byType.collaboration_store_points}
        accountHolder={partnerData?.partner_data?.partner_business_info?.payout_account_holder || ''}
        bankName={partnerData?.partner_data?.partner_business_info?.payout_bank_name || ''}
        accountNumber={partnerData?.partner_data?.partner_business_info?.payout_account_number || ''}
        tax={partnerData?.partner_data?.partner_business_info?.tax ?? undefined}
        onWithdraw={handleCollabWithdraw}
        title={`협업 스토어 포인트 출금 (배분율 ${partnerData?.partner_data?.partner_business_info?.collaboration_distribution_rate ?? 85}%)`}
      />

      {/* Delete Seller Modal */}
      <Modal
        isOpen={isDeleteSellerModalOpen}
        onClose={() => setIsDeleteSellerModalOpen(false)}
        title="토스 셀러 삭제"
        size={isMobile ? 'xl' : 'md'}
      >
        <div className="space-y-4">
          <Typography variant="body1" color="text-secondary">
            정말로 토스 셀러를 삭제하시겠습니까?
          </Typography>
          <Typography variant="body2" color="text-secondary">
            삭제 후에는 정산을 받을 수 없으며, 다시 등록해야 합니다.
          </Typography>
          <div className={`${isMobile ? 'mt-4 flex flex-col gap-2' : 'mt-6 flex justify-end gap-3'}`}>
            <Button
              variant="outline"
              size={isMobile ? 'sm' : 'md'}
              onClick={() => setIsDeleteSellerModalOpen(false)}
              className={isMobile ? 'w-full' : ''}
            >
              취소
            </Button>
            <Button
              variant="primary"
              size={isMobile ? 'sm' : 'md'}
              onClick={handleDeleteSeller}
              disabled={isDeletingSeller}
              loading={isDeletingSeller}
              className={`${isMobile ? 'w-full' : ''} bg-red-500 hover:bg-red-600`}
            >
              {isDeletingSeller ? '삭제 중...' : '삭제'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add Job Modal */}
      <Modal
        isOpen={isAddJobModalOpen}
        onClose={() => setIsAddJobModalOpen(false)}
        title="새 퀘스트 추가"
        size={isMobile ? 'xl' : 'md'}
      >
        <div className={`${isMobile ? 'space-y-3' : 'space-y-4'}`}>
          <div>
            <Typography variant="body2" className="mb-2 font-medium">
              서비스명 *
            </Typography>
            <input
              type="text"
              value={newJob.job_name}
              onChange={(e) =>
                setNewJob({ ...newJob, job_name: e.target.value })
              }
              placeholder="예: 듀오 대리, 코칭, 아이템 파밍"
              className={`w-full ${isMobile ? 'p-2' : 'p-3'} border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
            />
          </div>

          <div>
            <Typography variant="body2" className="mb-2 font-medium">
              건당 코인 *
            </Typography>
            <input
              type="number"
              value={newJob.coins_per_job || ''}
              onChange={(e) =>
                setNewJob({
                  ...newJob,
                  coins_per_job: parseInt(e.target.value) || 0,
                })
              }
              placeholder="예: 1000"
              min="1"
              className={`w-full ${isMobile ? 'p-2' : 'p-3'} border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500`}
            />
          </div>

          <div>
            <Typography variant="body2" className="mb-2 font-medium">
              멤버십 지정 (선택)
            </Typography>
            <select
              value={newJob.membership_id}
              onChange={(e) => {
                const selectedMembership = partnerMemberships.find(m => m.id === e.target.value)
                setNewJob({ 
                  ...newJob, 
                  membership_id: e.target.value,
                  min_tier_rank: selectedMembership?.tier_rank || 0
                })
              }}
              className={`w-full ${isMobile ? 'p-2' : 'p-3'} border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white`}
            >
              <option value="">전체 공개 (멤버십 제한 없음)</option>
              {partnerMemberships.map((membership) => (
                <option key={membership.id} value={membership.id}>
                  {membership.name} {membership.tier_rank ? `(Lv.${membership.tier_rank})` : ''}
                </option>
              ))}
            </select>
            <Typography variant="caption" color="text-secondary" className="mt-1">
              선택한 멤버십의 티어 등급 이상 구독자만 신청 가능
            </Typography>
          </div>
        </div>

        <div
          className={`${isMobile ? 'mt-4 flex flex-col gap-2' : 'mt-6 flex justify-end gap-3'}`}
        >
          <Button
            variant="outline"
            size={isMobile ? 'sm' : 'md'}
            onClick={() => setIsAddJobModalOpen(false)}
            className={isMobile ? 'w-full' : ''}
          >
            취소
          </Button>
          <Button
            variant="primary"
            size={isMobile ? 'sm' : 'md'}
            onClick={handleAddJob}
            disabled={!newJob.job_name.trim() || newJob.coins_per_job <= 0 || isAddingJob}
            className={isMobile ? 'w-full' : ''}
          >
            {isAddingJob ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                추가 중...
              </span>
            ) : '추가'}
          </Button>
        </div>
      </Modal>

      {/* Edit Job Modal */}
      <Modal
        isOpen={isEditJobModalOpen}
        onClose={() => { setIsEditJobModalOpen(false); setEditingJob(null); }}
        title="퀘스트 수정"
        size={isMobile ? 'xl' : 'md'}
      >
        {editingJob && (
          <>
            <div className={`${isMobile ? 'space-y-3' : 'space-y-4'}`}>
              <div>
                <Typography variant="body2" className="mb-2 font-medium">
                  서비스명 *
                </Typography>
                <input
                  type="text"
                  value={editingJob.job_name || ''}
                  onChange={(e) => setEditingJob({ ...editingJob, job_name: e.target.value })}
                  placeholder="예: 듀오 대리, 코칭, 아이템 파밍"
                  className={`w-full ${isMobile ? 'p-2' : 'p-3'} border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]`}
                />
              </div>

              <div>
                <Typography variant="body2" className="mb-2 font-medium">
                  건당 코인 *
                </Typography>
                <input
                  type="number"
                  value={editingJob.coins_per_job || ''}
                  onChange={(e) => setEditingJob({ ...editingJob, coins_per_job: parseInt(e.target.value) || 0 })}
                  placeholder="예: 1000"
                  min="1"
                  className={`w-full ${isMobile ? 'p-2' : 'p-3'} border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]`}
                />
              </div>

              <div>
                <Typography variant="body2" className="mb-2 font-medium">
                  멤버십 지정 (선택)
                </Typography>
                <select
                  value={editingJob.membership_id || ''}
                  onChange={(e) => {
                    const selectedMembership = partnerMemberships.find(m => m.id === e.target.value)
                    setEditingJob({ 
                      ...editingJob, 
                      membership_id: e.target.value,
                      min_tier_rank: selectedMembership?.tier_rank || 0
                    })
                  }}
                  className={`w-full ${isMobile ? 'p-2' : 'p-3'} border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F] bg-white`}
                >
                  <option value="">전체 공개 (멤버십 제한 없음)</option>
                  {partnerMemberships.map((membership) => (
                    <option key={membership.id} value={membership.id}>
                      {membership.name} {membership.tier_rank ? `(Lv.${membership.tier_rank})` : ''}
                    </option>
                  ))}
                </select>
                <Typography variant="caption" color="text-secondary" className="mt-1">
                  선택한 멤버십의 티어 등급 이상 구독자만 신청 가능
                </Typography>
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <div>
                  <Typography variant="body2" className="font-medium">활성화</Typography>
                  <Typography variant="caption" color="text-secondary">퀘스트 공개 여부</Typography>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingJob({ ...editingJob, is_active: !editingJob.is_active })}
                  className={`relative w-12 h-7 rounded-full transition-all border-2 ${
                    editingJob.is_active 
                      ? 'bg-transparent border-[#FE3A8F]' 
                      : 'bg-transparent border-gray-300'
                  }`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full shadow transition-all ${
                    editingJob.is_active 
                      ? 'bg-[#FE3A8F] left-[calc(100%-22px)]' 
                      : 'bg-gray-300 left-0.5'
                  }`} />
                </button>
              </div>
            </div>

            <div className={`${isMobile ? 'mt-4 flex flex-col gap-2' : 'mt-6 flex justify-end gap-3'}`}>
              <Button
                variant="outline"
                size={isMobile ? 'sm' : 'md'}
                onClick={() => { setIsEditJobModalOpen(false); setEditingJob(null); }}
                className={isMobile ? 'w-full' : ''}
              >
                취소
              </Button>
              <Button
                variant="primary"
                size={isMobile ? 'sm' : 'md'}
                onClick={handleUpdateJob}
                disabled={!editingJob.job_name?.trim() || editingJob.coins_per_job <= 0 || isUpdatingJob}
                className={isMobile ? 'w-full' : ''}
              >
                {isUpdatingJob ? '수정 중...' : '수정'}
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* Account Info Modal */}
      <Modal
        isOpen={isAccountInfoModalOpen}
        onClose={() => setIsAccountInfoModalOpen(false)}
        title="계좌 정보"
        size={isMobile ? 'xl' : 'md'}
      >
        <div className="space-y-4">
          <div className="bg-blue-50 p-3 rounded-lg border">
            <Typography variant="body2" color="text-secondary" className="mb-1">
              현재 포인트
            </Typography>
            <Typography variant="h4" color="primary">
              {(partnerData?.partner_data?.total_points || 0).toLocaleString()}P
            </Typography>
          </div>

          <div className="bg-gray-50 p-3 rounded-lg border">
            <Typography variant="body2" color="text-secondary" className="mb-1">
              시간당 수수료
            </Typography>
            <Typography variant="h4">계약별 설정</Typography>
          </div>

          {pointHistory.filter(
            (log) =>
              log.type === 'withdraw' && log.description?.includes('요청'),
          ).length > 0 && (
            <div className="bg-yellow-50 p-3 rounded-lg border">
              <Typography
                variant="body2"
                color="text-secondary"
                className="mb-1"
              >
                처리 중인 출금 요청
              </Typography>
              <Typography variant="body1" color="warning">
                {
                  pointHistory.filter(
                    (log) =>
                      log.type === 'withdraw' &&
                      log.description?.includes('요청'),
                  ).length
                }
                건
              </Typography>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <Button
            variant="secondary"
            onClick={() => setIsAccountInfoModalOpen(false)}
          >
            닫기
          </Button>
        </div>
      </Modal>

      {/* 토스 셀러 등록/수정 모달 */}
      <TossSellerRegistrationModal
        isOpen={isTossSellerModalOpen}
        onClose={() => setIsTossSellerModalOpen(false)}
        onSubmit={handleTossSellerSubmit}
        mode={tossSellerModalMode}
        initialData={{
          legalName: partnerData?.partner_data?.partner_business_info?.legal_name,
          legalEmail: partnerData?.partner_data?.partner_business_info?.legal_email,
          legalPhone: partnerData?.partner_data?.partner_business_info?.legal_phone,
          businessType: partnerData?.partner_data?.partner_business_info?.tosspayments_business_type as any,
          payoutBankCode: partnerData?.partner_data?.partner_business_info?.payout_bank_code,
          payoutBankName: partnerData?.partner_data?.partner_business_info?.payout_bank_name,
          payoutAccountNumber: partnerData?.partner_data?.partner_business_info?.payout_account_number,
          payoutAccountHolder: partnerData?.partner_data?.partner_business_info?.payout_account_holder,
        }}
        userName={user?.name}
        userEmail={user?.email}
      />

    </div>
  )
}
