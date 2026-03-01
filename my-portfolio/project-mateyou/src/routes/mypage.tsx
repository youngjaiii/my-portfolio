import { Outlet, createFileRoute, useMatches, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight, Plus, X, ToggleLeft, ToggleRight, ShoppingBag, Store, Crown, LayoutDashboard, FileText, PackageSearch, Heart, Disc3, Medal } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useDevice } from '@/hooks/useDevice'
import { resolveAccessToken } from '@/utils/sessionToken'
import { useAuthStore } from '@/store/useAuthStore'
import { toast } from 'sonner'
import { Capacitor } from '@capacitor/core'
import { edgeApi } from '@/lib/edgeApi'
import { supabase } from '@/lib/supabase'
import {
  Button,
  ChargeModal,
  Grid,
  HelpCenterSheet,
  PartnerListSheet,
  PartnerManagementSheet,
  PointsHistoryModal,
  ProfileEditModal,
  SlideSheet,
  Typography,
} from '@/components'

export const Route = createFileRoute('/mypage')({
  component: MyPage,
})

type MenuItem = {
  label: string
  rightText?: string
  onClick?: () => void
  path?: '/mypage/purchases' | '/dashboard/partner' | '/dashboard/admin' | '/store/partner/products' | '/store/admin/collaboration' | '/mypage/inventory/roulette'
  hidden?: boolean
}

function MyPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const matches = useMatches()
  const authAccessToken = useAuthStore((state) => state.accessToken)
  const authRefreshToken = useAuthStore((state) => state.refreshToken)
  const syncSession = useAuthStore((state) => state.syncSession)
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
  const [isSettlementModalOpen, setIsSettlementModalOpen] = useState(false)
  const [isPointsHistoryModalOpen, setIsPointsHistoryModalOpen] =
    useState(false)
  const [isChargeModalOpen, setIsChargeModalOpen] = useState(false)
  const [isPartnerManagementSheetOpen, setIsPartnerManagementSheetOpen] = useState(false)
  const [isHelpCenterOpen, setIsHelpCenterOpen] = useState(false)
  const [partnerListSheetMode, setPartnerListSheetMode] = useState<'subscriptions' | 'following' | null>(null)
  
  // 파트너 상태 (pending 체크)
  const [partnerStatus, setPartnerStatus] = useState<string | null>(null)
  const [isLoadingPartnerStatus, setIsLoadingPartnerStatus] = useState(true)
  
  // 마이 플랜 상태
  const [isMyPlanSheetOpen, setIsMyPlanSheetOpen] = useState(false)
  const [isNewPlanSheetOpen, setIsNewPlanSheetOpen] = useState(false)
  const [isEditPlanSheetOpen, setIsEditPlanSheetOpen] = useState(false)
  const [editingMembership, setEditingMembership] = useState<any>(null)
  const [isUpdatingMembership, setIsUpdatingMembership] = useState(false)
  const [memberships, setMemberships] = useState<Array<{
    id: string
    name: string
    description: string
    monthly_price: number
    is_active: boolean
    created_at: string
    membership_message?: string
    paid_message_quota?: number
    paid_call_quota?: number
    paid_video_quota?: number
    post_access_mode?: string
    subscription_count?: number
    info_media_paths?: Array<{ path: string; signed_url: string }> | string
    tier_rank?: number
  }>>([])
  const [isLoadingMemberships, setIsLoadingMemberships] = useState(false)
  const [isCreatingMembership, setIsCreatingMembership] = useState(false)
  // 기본 정보
  const [newMembershipName, setNewMembershipName] = useState('')
  const [newMembershipPrice, setNewMembershipPrice] = useState('')
  const [newMembershipDescription, setNewMembershipDescription] = useState('')
  // 포스트 공개기한
  const [postAccessPeriod, setPostAccessPeriod] = useState<'30days' | 'all'>('30days')
  // 메시지
  const [messageEnabled, setMessageEnabled] = useState(false)
  const [freeMessageCount, setFreeMessageCount] = useState('')
  // 음성통화
  const [voiceCallEnabled, setVoiceCallEnabled] = useState(false)
  const [voiceCallMinutes, setVoiceCallMinutes] = useState('')
  // 영상통화
  const [videoCallEnabled, setVideoCallEnabled] = useState(false)
  const [videoCallMinutes, setVideoCallMinutes] = useState('')
  // 구독 메시지
  const [welcomeMessageEnabled, setWelcomeMessageEnabled] = useState(false)
  const [welcomeMedia, setWelcomeMedia] = useState<File | null>(null)
  const [welcomeMediaPreview, setWelcomeMediaPreview] = useState<string | null>(null)
  const [welcomeMessage, setWelcomeMessage] = useState('')
  // 자동 갱신 메시지
  const [renewalMessageEnabled, setRenewalMessageEnabled] = useState(false)
  const [renewalMedia, setRenewalMedia] = useState<File | null>(null)
  const [renewalMediaPreview, setRenewalMediaPreview] = useState<string | null>(null)
  const [renewalMessage, setRenewalMessage] = useState('')
  // 플랜 공개
  const [isPlanActive, setIsPlanActive] = useState(true)
  // 티어 랭크
  const [tierRank, setTierRank] = useState<number>(1)

  const { isMobile } = useDevice()

  // 티어 이름 옵션 (1~10)
  const TIER_OPTIONS = [
    { rank: 1, name: '베이직 (Basic)', emoji: '🌱' },
    { rank: 2, name: '실버 (Silver)', emoji: '🥈' },
    { rank: 3, name: '골드 (Gold)', emoji: '🥇' },
    { rank: 4, name: '플래티넘 (Platinum)', emoji: '💠' },
    { rank: 5, name: '다이아 (Diamond)', emoji: '💎' },
    { rank: 6, name: '마스터 (Master)', emoji: '🏆' },
    { rank: 7, name: '엘리트 (Elite)', emoji: '⭐' },
    { rank: 8, name: '프레스티지 (Prestige)', emoji: '✨' },
    { rank: 9, name: '로열 (Royal)', emoji: '👑' },
    { rank: 10, name: '시그니처 (Signature)', emoji: '🔱' },
  ]

  // 멤버쉽 목록 조회
  const fetchMemberships = useCallback(async () => {
    setIsLoadingMemberships(true)
    try {
      const token = await resolveAccessToken({
        accessToken: authAccessToken,
        refreshToken: authRefreshToken,
        syncSession,
      })
      if (!token) return
      
      const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
      
      const response = await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/api-membership`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
        },
      })
      
      const result = await response.json()
      if (result.success && result.data) {
        setMemberships(result.data)
      }
    } catch (error) {
      console.error('멤버쉽 조회 실패:', error)
    } finally {
      setIsLoadingMemberships(false)
    }
  }, [])

  // 구독 메시지 미디어 선택 핸들러
  const handleWelcomeMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setWelcomeMedia(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setWelcomeMediaPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  // 자동 갱신 메시지 미디어 선택 핸들러
  const handleRenewalMediaSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setRenewalMedia(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setRenewalMediaPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  // 폼 초기화
  const resetMembershipForm = () => {
    setNewMembershipName('')
    setNewMembershipPrice('')
    setNewMembershipDescription('')
    setPostAccessPeriod('30days')
    setMessageEnabled(false)
    setFreeMessageCount('')
    setVoiceCallEnabled(false)
    setVoiceCallMinutes('')
    setVideoCallEnabled(false)
    setVideoCallMinutes('')
    setWelcomeMessageEnabled(false)
    setWelcomeMedia(null)
    setWelcomeMediaPreview(null)
    setWelcomeMessage('')
    setRenewalMessageEnabled(false)
    setRenewalMedia(null)
    setRenewalMediaPreview(null)
    setRenewalMessage('')
    setIsPlanActive(true)
    setTierRank(1)
  }

  // 멤버쉽 생성
  const handleCreateMembership = async () => {
    if (!newMembershipName.trim()) {
      toast.error('플랜 제목을 입력해주세요')
      return
    }
    if (!newMembershipPrice || Number(newMembershipPrice) <= 0) {
      toast.error('플랜 가격을 입력해주세요')
      return
    }

    setIsCreatingMembership(true)
    try {
      const token = await resolveAccessToken({
        accessToken: authAccessToken,
        refreshToken: authRefreshToken,
        syncSession,
      })
      if (!token) return
      
      const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
      
      const formData = new FormData()
      formData.append('name', newMembershipName.trim())
      formData.append('monthly_price', String(Number(newMembershipPrice)))
      formData.append('description', newMembershipDescription.trim())
      formData.append('is_active', String(isPlanActive))
      formData.append('message_type', messageEnabled ? 'free' : 'none')
      formData.append('paid_message_quota', String(messageEnabled ? Number(freeMessageCount) || 0 : 0))
      formData.append('paid_call_quota', String(voiceCallEnabled ? Number(voiceCallMinutes) || 0 : 0))
      formData.append('paid_video_quota', String(videoCallEnabled ? Number(videoCallMinutes) || 0 : 0))
      formData.append('post_access_mode', postAccessPeriod === '30days' ? 'limited_30_days' : 'all_periods')
      formData.append('tier_rank', String(tierRank))
      
      // membership_message - 환영 메시지
      if (welcomeMessageEnabled && welcomeMessage.trim()) {
        formData.append('membership_message', welcomeMessage.trim())
      }
      
      // info_media_paths - welcomeMedia가 있으면 blob으로 추가
      if (welcomeMedia) {
        formData.append('info_media_paths', welcomeMedia)
      }
      
      // renewal_message - 자동 갱신 메시지
      if (renewalMessageEnabled && renewalMessage.trim()) {
        formData.append('renewal_message', renewalMessage.trim())
      }
      
      // renewal_media_info - renewalMedia가 있으면 blob으로 추가
      if (renewalMedia) {
        formData.append('renewal_media_info', renewalMedia)
      }

      const response = await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/api-membership`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: formData,
      })
      
      const result = await response.json()
      if (result.success) {
        toast.success('플랜이 생성되었습니다')
        resetMembershipForm()
        fetchMemberships()
      } else {
        toast.error(result.error || '플랜 생성에 실패했습니다')
      }
    } catch (error) {
      console.error('플랜 생성 실패:', error)
      toast.error('플랜 생성에 실패했습니다')
    } finally {
      setIsCreatingMembership(false)
    }
  }

  // 멤버쉽 활성화/비활성화 토글
  const handleToggleMembership = async (membership: typeof memberships[0]) => {
    try {
      const token = await resolveAccessToken({
        accessToken: authAccessToken,
        refreshToken: authRefreshToken,
        syncSession,
      })
      if (!token) return
      
      const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
      
      const response = await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/api-membership`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: membership.id,
          is_active: !membership.is_active,
        }),
      })
      
      const result = await response.json()
      if (result.success) {
        toast.success(membership.is_active ? '멤버쉽이 비활성화되었습니다' : '멤버쉽이 활성화되었습니다')
        fetchMemberships()
      } else {
        toast.error(result.error || '변경에 실패했습니다')
      }
    } catch (error) {
      console.error('멤버쉽 토글 실패:', error)
      toast.error('변경에 실패했습니다')
    }
  }

  // 멤버쉽 수정 팝업 열기
  const openEditMembership = (membership: any) => {
    console.log('🔍 openEditMembership - membership:', membership)
    console.log('🔍 info_media_paths:', membership.info_media_paths)
    console.log('🔍 info_media_paths type:', typeof membership.info_media_paths)
    console.log('🔍 info_media_paths isArray:', Array.isArray(membership.info_media_paths))
    
    setEditingMembership(membership)
    // 폼 필드에 기존 값 설정
    setNewMembershipName(membership.name || '')
    setNewMembershipPrice(String(membership.monthly_price || ''))
    setNewMembershipDescription(membership.description || '')
    setPostAccessPeriod(membership.post_access_mode === 'all_periods' ? 'all' : '30days')
    setMessageEnabled(membership.paid_message_quota > 0)
    setFreeMessageCount(String(membership.paid_message_quota || ''))
    setVoiceCallEnabled(membership.paid_call_quota > 0)
    setVoiceCallMinutes(String(membership.paid_call_quota || ''))
    setVideoCallEnabled(membership.paid_video_quota > 0)
    setVideoCallMinutes(String(membership.paid_video_quota || ''))
    setWelcomeMessageEnabled(!!membership.membership_message || (Array.isArray(membership.info_media_paths) && membership.info_media_paths.length > 0))
    setWelcomeMessage(membership.membership_message || '')
    setIsPlanActive(membership.is_active)
    setTierRank(membership.tier_rank || 1)
    setWelcomeMedia(null)
    
    // info_media_paths 처리 - API 응답의 signed_url 사용
    let mediaUrl: string | null = null
    
    if (membership.info_media_paths) {
      if (Array.isArray(membership.info_media_paths) && membership.info_media_paths.length > 0) {
        const firstMedia = membership.info_media_paths[0]
        
        if (typeof firstMedia === 'string') {
          mediaUrl = firstMedia.startsWith('http') ? firstMedia : null
        } else if (firstMedia?.signed_url) {
          mediaUrl = firstMedia.signed_url
        }
      } else if (typeof membership.info_media_paths === 'string') {
        mediaUrl = membership.info_media_paths.startsWith('http') ? membership.info_media_paths : null
      }
    }
    
    setWelcomeMediaPreview(mediaUrl)
    
    // 자동 갱신 메시지 관련 필드 복원
    setRenewalMessageEnabled(!!membership.renewal_message || (Array.isArray(membership.renewal_media_info) && membership.renewal_media_info.length > 0))
    setRenewalMessage(membership.renewal_message || '')
    setRenewalMedia(null)
    
    // renewal_media_info 처리
    let renewalMediaUrl: string | null = null
    if (membership.renewal_media_info) {
      if (Array.isArray(membership.renewal_media_info) && membership.renewal_media_info.length > 0) {
        const firstMedia = membership.renewal_media_info[0]
        if (typeof firstMedia === 'string') {
          renewalMediaUrl = firstMedia.startsWith('http') ? firstMedia : null
        } else if (firstMedia?.signed_url) {
          renewalMediaUrl = firstMedia.signed_url
        }
      } else if (typeof membership.renewal_media_info === 'string') {
        renewalMediaUrl = membership.renewal_media_info.startsWith('http') ? membership.renewal_media_info : null
      }
    }
    setRenewalMediaPreview(renewalMediaUrl)
    
    setIsEditPlanSheetOpen(true)
  }

  // 멤버쉽 수정
  const handleUpdateMembership = async () => {
    if (!editingMembership) return
    if (!newMembershipName.trim()) {
      toast.error('플랜 제목을 입력해주세요')
      return
    }

    setIsUpdatingMembership(true)
    try {
      const token = await resolveAccessToken({
        accessToken: authAccessToken,
        refreshToken: authRefreshToken,
        syncSession,
      })
      if (!token) return
      
      const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
      
      const formData = new FormData()
      formData.append('id', editingMembership.id)
      formData.append('name', newMembershipName.trim())
      formData.append('description', newMembershipDescription.trim())
      formData.append('monthly_price', String(Number(newMembershipPrice)))
      formData.append('is_active', String(isPlanActive))
      formData.append('paid_message_quota', String(messageEnabled ? Number(freeMessageCount) || 0 : 0))
      formData.append('paid_call_quota', String(voiceCallEnabled ? Number(voiceCallMinutes) || 0 : 0))
      formData.append('paid_video_quota', String(videoCallEnabled ? Number(videoCallMinutes) || 0 : 0))
      formData.append('post_access_mode', postAccessPeriod === '30days' ? 'limited_30_days' : 'all_periods')
      formData.append('tier_rank', String(tierRank))
      
      // 항상 수정 가능한 필드
      // membership_message는 항상 보냄 (비활성화시 빈 문자열로)
      formData.append('membership_message', welcomeMessageEnabled ? welcomeMessage.trim() : '')
      
      // info_media_paths 처리
      if (welcomeMedia) {
        // 새로운 파일이 있으면 파일 전송
        formData.append('info_media_paths', welcomeMedia)
      } else if (editingMembership.info_media_paths && Array.isArray(editingMembership.info_media_paths) && editingMembership.info_media_paths.length > 0) {
        // 기존 미디어가 있고 새 파일이 없으면 signed_url에서 다운로드하여 Blob으로 전송
        const mediaItem = editingMembership.info_media_paths[0]
        const signedUrl = mediaItem.signed_url
        
        if (signedUrl) {
          try {
            const response = await fetch(signedUrl)
            if (response.ok) {
              const blob = await response.blob()
              // 파일명 추출 (path에서)
              const path = mediaItem.path || ''
              const fileName = path.split('/').pop() || 'media.png'
              const file = new File([blob], fileName, { type: blob.type })
              formData.append('info_media_paths', file)
            }
          } catch (e) {
            console.error('기존 미디어 다운로드 실패:', e)
          }
        }
      }
      
      // 자동 갱신 메시지
      formData.append('renewal_message', renewalMessageEnabled ? renewalMessage.trim() : '')
      
      // renewal_media_info 처리
      if (renewalMedia) {
        formData.append('renewal_media_info', renewalMedia)
      } else if (editingMembership.renewal_media_info && Array.isArray(editingMembership.renewal_media_info) && editingMembership.renewal_media_info.length > 0) {
        const mediaItem = editingMembership.renewal_media_info[0]
        const signedUrl = mediaItem.signed_url
        
        if (signedUrl) {
          try {
            const response = await fetch(signedUrl)
            if (response.ok) {
              const blob = await response.blob()
              const path = mediaItem.path || ''
              const fileName = path.split('/').pop() || 'media.png'
              const file = new File([blob], fileName, { type: blob.type })
              formData.append('renewal_media_info', file)
            }
          } catch (e) {
            console.error('기존 갱신 미디어 다운로드 실패:', e)
          }
        }
      }

      const response = await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/api-membership`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
        },
        body: formData,
      })
      
      const result = await response.json()
      if (result.success) {
        toast.success('플랜이 수정되었습니다')
        setIsEditPlanSheetOpen(false)
        setEditingMembership(null)
        resetMembershipForm()
        fetchMemberships()
      } else {
        toast.error(result.error || '플랜 수정에 실패했습니다')
      }
    } catch (error) {
      console.error('플랜 수정 실패:', error)
      toast.error('플랜 수정에 실패했습니다')
    } finally {
      setIsUpdatingMembership(false)
    }
  }

  // 멤버쉽 삭제
  const handleDeleteMembership = async (membershipId: string) => {
    if (!confirm('정말 이 멤버쉽을 삭제하시겠습니까?')) return
    
    try {
      const token = await resolveAccessToken({
        accessToken: authAccessToken,
        refreshToken: authRefreshToken,
        syncSession,
      })
      if (!token) return

      const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
      
      const response = await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/api-membership`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: membershipId }),
      })
      
      const result = await response.json()
      if (result.success) {
        toast.success('멤버쉽이 삭제되었습니다')
        fetchMemberships()
      } else {
        toast.error(result.error || '삭제에 실패했습니다')
      }
    } catch (error) {
      console.error('멤버쉽 삭제 실패:', error)
      toast.error('삭제에 실패했습니다')
    }
  }

  // 파트너 상태 확인
  useEffect(() => {
    const fetchPartnerStatus = async () => {
      if (!user?.id) {
        setIsLoadingPartnerStatus(false)
        return
      }
      
      try {
        const response = await edgeApi.auth.getPartnerStatus()
        if (response.success) {
          setPartnerStatus(response.data?.partnerStatus || 'none')
        }
      } catch (error) {
        console.error('파트너 상태 조회 실패:', error)
      } finally {
        setIsLoadingPartnerStatus(false)
      }
    }
    
    fetchPartnerStatus()
  }, [user?.id])

  // 마이 플랜 시트 열 때 데이터 조회
  useEffect(() => {
    if (isMyPlanSheetOpen && user?.role === 'partner') {
      fetchMemberships()
    }
  }, [isMyPlanSheetOpen, user?.role, fetchMemberships])

  const menuItems = useMemo<MenuItem[]>(() => {
    if (!user) return []

    return [
      {
        label: '포인트',
        rightText: `${(user.total_points || 0).toLocaleString('ko-kr')} P`,
        onClick: () => setIsChargeModalOpen(true),
      },
      {
        label: '구독',
        onClick: () => setPartnerListSheetMode('subscriptions'),
      },
      {
        label: '팔로잉',
        onClick: () => setPartnerListSheetMode('following'),
      },
      {
        label: '고객센터',
        onClick: () => setIsHelpCenterOpen(true),
      },
    ]
  }, [setPartnerListSheetMode, user])

  if (!user) {
    return (
      <div className={`${isMobile ? 'h-full' : 'min-h-screen'}`}>
        <div className="container mx-auto p-6">
          <Typography variant="h3">로그인이 필요합니다</Typography>
        </div>
      </div>
    )
  }

  const lastMatch = matches[matches.length - 1]
  const isNestedRouteActive = lastMatch?.routeId && lastMatch.routeId !== Route.id

  if (isNestedRouteActive) {
    return (
      <div className={`${isMobile ? 'h-full' : 'min-h-screen'}`}>
        <Outlet />
      </div>
    )
  }

  const handleCharge = async () => {
    // 충전 로직은 Navigation에서 가져와서 사용
    try {
      // 실제 충전 로직 구현
      setIsChargeModalOpen(false)
    } catch (error) {}
  }

  const handleMenuItemClick = (item: MenuItem) => {
    if (item.path) {
      navigate({ to: item.path as any })
      return
    }
    item.onClick?.()
  }

  // 파트너 심사 대기 중일 때 별도 UI 표시
  if (partnerStatus === 'pending') {
    return (
      <div className={`flex flex-col ${isMobile ? 'h-full overflow-hidden' : 'min-h-screen'}`}>
        <div className={`container mx-auto py-6 flex flex-col flex-1 ${isMobile ? 'pt-16' : ''} items-center justify-center`}>
          <div className="flex flex-col items-center text-center px-6">
            <Typography variant="h4" className="mb-4 text-[#110f1a]">
              파트너 심사 대기중이예요
            </Typography>
            <Typography variant="body1" className="text-gray-500">
              조금만 기다려주세요😊
            </Typography>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`flex flex-col ${isMobile ? 'h-full overflow-hidden' : 'min-h-screen'}`}>
      <div className={`container mx-auto py-6 pb-16 flex flex-col flex-1 ${isMobile ? 'overflow-y-auto pt-14' : 'justify-center items-center pt-16'}`}>
        {/* 하단 탭바 공간 확보 */}
        <Grid cols={1} lgCols={2} className={isMobile ? '' : 'w-full max-w-4xl'}>
          {/* 프로필 카드 */}
          
          <div className={`flex flex-col items-center bg-white p-6 lg:col-span-2 ${isMobile ? '' : 'justify-center'}`}>
            <div className="flex flex-col items-center mb-2">
              <Typography variant="h4" className="mb-1 text-center">
                {user.name || user.username}
              </Typography>
              <Typography
                variant="body2"
                color="text-secondary"
                className="mb-2"
              >
                {user.email}
              </Typography>
              {/* <Typography
                variant="body2"
                className="text-[#FE3A8F] font-semibold"
              >
                {user.role === 'partner'
                  ? '파트너'
                  : user.role === 'admin'
                    ? '관리자'
                    : '일반 회원'}
              </Typography> */}
            </div>

            <div className="space-y-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (user.role === 'partner') {
                    setIsPartnerManagementSheetOpen(true)
                  } else {
                    setIsProfileModalOpen(true)
                  }
                }}
                className="w-full !bg-[#FE3A8F] hover:!bg-[#e8a0c0] !text-white !border-[#FE3A8F]"
              >
                프로필 수정
              </Button>

              {user.role === 'normal' && (
                <button
                  onClick={() => setIsPartnerManagementSheetOpen(true)}
                  className="w-full text-[#FE3A8F] hover:text-[#fe4a9a] text-sm font-medium py-2 transition-colors duration-200 bg-transparent border-none cursor-pointer"
                >
                  파트너 신청하기
                </button>
              )}
            </div>
          </div>

          {/* 구분 영역 1 */}
          <div className="w-full h-2 bg-gray-100 lg:col-span-2" />

          {/* Quick Action Row */}
          <div className="bg-white px-4 lg:col-span-2">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide py-1">
              {/* 파트너: 티어 / 그 외: 찜 목록 (admin 제외) */}
              {user.role === 'partner' && (
                <button
                  type="button"
                  onClick={() => navigate({ to: '/mypage/tier' })}
                  className="flex flex-1 flex-col items-center justify-center gap-1.5 p-3 rounded-xl hover:bg-gray-100 transition-colors min-w-[72px]"
                >
                  <Medal className="h-6 w-6 text-[#FE3A8F]" />
                  <span className="text-[11px] font-medium text-gray-700 text-center leading-tight whitespace-nowrap">티어</span>
                </button>
              )}
              {user.role !== 'admin' && user.role !== 'partner' && (
                <button
                  type="button"
                  onClick={() => navigate({ to: '/store/wishlist' })}
                  className="flex flex-1 flex-col items-center justify-center gap-1.5 p-3 rounded-xl hover:bg-gray-100 transition-colors min-w-[72px]"
                >
                  <Heart className="h-6 w-6 text-[#FE3A8F]" />
                  <span className="text-[11px] font-medium text-gray-700 text-center leading-tight whitespace-nowrap">찜 목록</span>
                </button>
              )}

              {/* 구매 내역 - partner 제외 */}
              {user.role !== 'partner' && (
                <button
                  type="button"
                  onClick={() => navigate({ to: '/mypage/purchases' })}
                  className="flex flex-1 flex-col items-center justify-center gap-1.5 p-3 rounded-xl hover:bg-gray-100 transition-colors min-w-[72px]"
                >
                  <ShoppingBag className="h-6 w-6 text-[#FE3A8F]" />
                  <span className="text-[11px] font-medium text-gray-700 text-center leading-tight whitespace-nowrap">구매 내역</span>
                </button>
              )}

              {/* Partner: 스토어 관리 / 마이플랜 / 파트너 대시보드 */}
              {user.role === 'partner' && (
                <>
                  <button
                    type="button"
                    onClick={() => navigate({ to: '/store/partner/products' })}
                    className="flex flex-1 flex-col items-center justify-center gap-1.5 p-3 rounded-xl hover:bg-gray-100 transition-colors min-w-[72px]"
                  >
                    <Store className="h-6 w-6 text-[#FE3A8F]" />
                    <span className="text-[11px] font-medium text-gray-700 text-center leading-tight whitespace-nowrap">스토어 관리</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsMyPlanSheetOpen(true)}
                    className="flex flex-1 flex-col items-center justify-center gap-1.5 p-3 rounded-xl hover:bg-gray-100 transition-colors min-w-[72px]"
                  >
                    <Crown className="h-6 w-6 text-[#FE3A8F]" />
                    <span className="text-[11px] font-medium text-gray-700 text-center leading-tight whitespace-nowrap">마이 플랜</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate({ to: '/dashboard/partner' })}
                    className="flex flex-1 flex-col items-center justify-center gap-1.5 p-3 rounded-xl hover:bg-gray-100 transition-colors min-w-[72px]"
                  >
                    <LayoutDashboard className="h-6 w-6 text-[#FE3A8F]" />
                    <span className="text-[11px] font-medium text-gray-700 text-center leading-tight whitespace-nowrap">대시보드</span>
                  </button>
                </>
              )}

              {/* Normal: 룰렛 당첨 내역 */}
              {user.role === 'normal' && (
                <button
                  type="button"
                  onClick={() => navigate({ to: '/mypage/inventory/roulette' })}
                  className="flex flex-1 flex-col items-center justify-center gap-1.5 p-3 rounded-xl hover:bg-gray-100 transition-colors min-w-[72px]"
                >
                  <Disc3 className="h-6 w-6 text-[#FE3A8F]" />
                  <span className="text-[11px] font-medium text-gray-700 text-center leading-tight whitespace-nowrap">당첨 내역</span>
                </button>
              )}

              {/* Admin: 협업 상품 관리 / 관리자 대시보드 */}
              {user.role === 'admin' && (
                <>
                  <button
                    type="button"
                    onClick={() => navigate({ to: '/store/admin/collaboration' })}
                    className="flex flex-1 flex-col items-center justify-center gap-1.5 p-3 rounded-xl hover:bg-gray-100 transition-colors min-w-[72px]"
                  >
                    <FileText className="h-6 w-6 text-[#FE3A8F]" />
                    <span className="text-[11px] font-medium text-gray-700 text-center leading-tight whitespace-nowrap">협업 상품</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate({ to: '/dashboard/admin' })}
                    className="flex flex-1 flex-col items-center justify-center gap-1.5 p-3 rounded-xl hover:bg-gray-100 transition-colors min-w-[72px]"
                  >
                    <LayoutDashboard className="h-6 w-6 text-[#FE3A8F]" />
                    <span className="text-[11px] font-medium text-gray-700 text-center leading-tight whitespace-nowrap">대시보드</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 구분 영역 2 */}
          <div className="w-full h-2 bg-gray-100 lg:col-span-2" />

          <div className="bg-white lg:col-span-2">
            {menuItems
              .filter((item) => !item.hidden)
              .map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => handleMenuItemClick(item)}
                  className="flex w-full items-center justify-between border-b border-gray-200 bg-white p-6 text-left transition-colors duration-200 hover:bg-gray-50 cursor-pointer"
                >
                  <Typography variant="body1" className="font-semibold text-[#110f1a]">
                    {item.label}
                  </Typography>
                  <div className="flex items-center gap-3">
                    {item.rightText ? (
                      <Typography variant="body1" className="font-semibold text-[#110f1a]">
                        {item.rightText}
                      </Typography>
                    ) : null}
                    <ChevronRight className="h-5 w-5 text-gray-300" />
                  </div>
                </button>
              ))}
          </div>

          {/* 계정 정보 */}
          {/* <div className="bg-white rounded-lg shadow-md p-6">
            <Typography variant="h5" className="mb-4">
              계정 정보
            </Typography>

            <div className="space-y-4">
              <div>
                <Typography
                  variant="body2"
                  color="text-secondary"
                  className="mb-1"
                >
                  사용자명
                </Typography>
                <Typography variant="body1">{user.username}</Typography>
              </div>

              <div>
                <Typography
                  variant="body2"
                  color="text-secondary"
                  className="mb-1"
                >
                  이메일
                </Typography>
                <Typography variant="body1">{user.email}</Typography>
              </div>

              <div>
                <Typography
                  variant="body2"
                  color="text-secondary"
                  className="mb-1"
                >
                  가입일
                </Typography>
                <Typography variant="body1">
                  {new Date(user.created_at).toLocaleDateString('ko-kr')}
                </Typography>
              </div>
            </div>
          </div> */}

          {/* 최근 활동 */}
          {/* <div className="bg-white rounded-lg shadow-md p-6">
            <Flex justify="between" align="center" className="mb-4">
              <Typography variant="h5">최근 활동</Typography>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsPointsHistoryModalOpen(true)}
                className="text-[#FE3A8F] hover:text-[#fe4a9a]"
              >
                전체보기
              </Button>
            </Flex>

            <div className="space-y-3">
              {pointsHistory.length > 0 ? (
                pointsHistory.slice(0, 5).map((activity, index) => {
                  const isLastItem = index === pointsHistory.slice(0, 5).length - 1
                  const activityDate = new Date(activity.created_at)
                  const now = new Date()
                  const daysDiff = Math.floor((now.getTime() - activityDate.getTime()) / (1000 * 60 * 60 * 24))

                  const getActivityIcon = (type: string) => {
                    switch (type) {
                      case 'earn':
                        return '💰'
                      case 'spend':
                        return '💸'
                      case 'withdraw':
                        return '🏦'
                      default:
                        return '📝'
                    }
                  }

                  const getActivityDescription = (type: string, amount: number) => {
                    switch (type) {
                      case 'earn':
                        return `포인트 획득 (+${amount.toLocaleString('ko-kr')}P)`
                      case 'spend':
                        return `포인트 사용 (-${amount.toLocaleString('ko-kr')}P)`
                      case 'withdraw':
                        return `포인트 출금 (-${amount.toLocaleString('ko-kr')}P)`
                      default:
                        return activity.description || '알 수 없는 활동'
                    }
                  }

                  const getTimeString = (daysDiff: number) => {
                    if (daysDiff === 0) return '오늘'
                    if (daysDiff === 1) return '어제'
                    if (daysDiff < 7) return `${daysDiff}일 전`
                    if (daysDiff < 30) return `${Math.floor(daysDiff / 7)}주 전`
                    return activityDate.toLocaleDateString('ko-kr')
                  }

                  return (
                    <div
                      key={activity.id}
                      className={`flex justify-between items-center py-3 ${
                        !isLastItem ? 'border-b border-gray-100' : ''
                      }`}
                    >
                      <Flex align="center" gap={3}>
                        <span className="text-lg">{getActivityIcon(activity.type)}</span>
                        <div>
                          <Typography variant="body2" className="font-medium">
                            {getActivityDescription(activity.type, activity.amount)}
                          </Typography>
                          {activity.description && (
                            <Typography variant="caption" color="text-secondary">
                              {activity.description}
                            </Typography>
                          )}
                        </div>
                      </Flex>
                      <Typography variant="body2" color="text-secondary">
                        {getTimeString(daysDiff)}
                      </Typography>
                    </div>
                  )
                })
              ) : (
                <div className="text-center py-8">
                  <Typography variant="body2" color="text-secondary">
                    최근 활동 내역이 없습니다
                  </Typography>
                </div>
              )}
            </div>
          </div> */}
        </Grid>
      </div>

      {/* 모달들 */}
      <ProfileEditModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        mode="profile"
      />
      {user.role === 'partner' && (
        <ProfileEditModal
          isOpen={isSettlementModalOpen}
          onClose={() => setIsSettlementModalOpen(false)}
          mode="partner"
        />
      )}

      <PointsHistoryModal
        isOpen={isPointsHistoryModalOpen}
        onClose={() => setIsPointsHistoryModalOpen(false)}
      />

      <ChargeModal
        isOpen={isChargeModalOpen}
        onClose={() => setIsChargeModalOpen(false)}
        onCharge={handleCharge}
      />

      <PartnerManagementSheet
        isOpen={isPartnerManagementSheetOpen}
        onClose={() => setIsPartnerManagementSheetOpen(false)}
      />

      <HelpCenterSheet isOpen={isHelpCenterOpen} onClose={() => setIsHelpCenterOpen(false)} />
      {partnerListSheetMode && (
        <PartnerListSheet
          mode={partnerListSheetMode}
          isOpen={Boolean(partnerListSheetMode)}
          onClose={() => setPartnerListSheetMode(null)}
        />
      )}

      {/* 마이 플랜 리스트 슬라이드 시트 */}
      <SlideSheet
        isOpen={isMyPlanSheetOpen}
        onClose={() => setIsMyPlanSheetOpen(false)}
        title="마이 플랜"
        initialHeight={0.9}
        minHeight={0.5}
        maxHeight={0.95}
        zIndex={200}
      >
        <div 
          className="flex flex-col h-full"
          style={{ 
            paddingBottom: Capacitor.isNativePlatform() 
              ? 'calc(env(safe-area-inset-bottom, 0px) + 16px)' 
              : '16px' 
          }}
        >
          {/* 새 플랜 추가 버튼 */}
          <button
            type="button"
            onClick={() => {
              resetMembershipForm()
              setIsNewPlanSheetOpen(true)
            }}
            className="w-full py-3 mb-4 bg-[#FE3A8F] text-white text-sm font-semibold rounded-xl hover:bg-[#e8338a] transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="h-4 w-4" />
            새 플랜 추가
          </button>

          {/* 플랜 목록 */}
          <div className="flex-1 overflow-y-auto">
            {isLoadingMemberships ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#FE3A8F] border-t-transparent" />
              </div>
            ) : memberships.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <p className="text-sm">등록된 플랜이 없습니다</p>
                <p className="text-xs mt-1">새 플랜을 추가해보세요</p>
              </div>
            ) : (
              <div className="space-y-3">
                {memberships.map((membership) => (
                  <div
                    key={membership.id}
                    className={`p-4 rounded-xl border transition-all cursor-pointer hover:shadow-md ${
                      membership.is_active 
                        ? 'bg-white border-gray-200 hover:border-[#FE3A8F]/50' 
                        : 'bg-gray-50 border-gray-100'
                    }`}
                    onClick={() => openEditMembership(membership)}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className={`font-semibold ${membership.is_active ? 'text-gray-900' : 'text-gray-500'}`}>
                            {membership.name}
                          </h4>
                          {membership.tier_rank && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-600">
                              {TIER_OPTIONS.find(t => t.rank === membership.tier_rank)?.emoji} Lv.{membership.tier_rank}
                            </span>
                          )}
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                            membership.is_active 
                              ? 'bg-[#FE3A8F]/10 text-[#FE3A8F]' 
                              : 'bg-gray-200 text-gray-500'
                          }`}>
                            {membership.is_active ? '공개' : '비공개'}
                          </span>
                        </div>
                        {membership.description && (
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{membership.description}</p>
                        )}
                      </div>
                      <span className={`text-sm font-bold ${membership.is_active ? 'text-[#FE3A8F]' : 'text-gray-400'}`}>
                        {membership.monthly_price.toLocaleString()}P/월
                      </span>
                    </div>
                    <div className="flex items-center pt-2 border-t border-gray-100">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleToggleMembership(membership)
                        }}
                        className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900"
                      >
                        {membership.is_active ? (
                          <>
                            <ToggleRight className="h-5 w-5 text-[#FE3A8F]" />
                            <span>활성</span>
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="h-5 w-5 text-gray-400" />
                            <span>비활성</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SlideSheet>

      {/* 새 플랜 추가 슬라이드 시트 */}
      <SlideSheet
        isOpen={isNewPlanSheetOpen}
        onClose={() => setIsNewPlanSheetOpen(false)}
        title="새 플랜 추가"
        initialHeight={0.95}
        minHeight={0.5}
        maxHeight={0.95}
        zIndex={210}
        noPadding
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* 스크롤 가능한 콘텐츠 영역 */}
          <div className="flex-1 overflow-y-auto">
          {/* 기본 정보 섹션 */}
          <div className="bg-white p-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">기본 정보</h3>
            
            {/* 플랜 제목 */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">플랜 제목</label>
              <input
                type="text"
                placeholder="플랜 이름을 입력하세요"
                value={newMembershipName}
                onChange={(e) => setNewMembershipName(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/50"
              />
              <p className="text-xs text-gray-400 mt-1.5">✨ 다른 플랜과 구별되는 매력적인 이름으로 팬들의 눈길을 사로잡아보세요!</p>
            </div>

            {/* 티어 등급 */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">티어 등급</label>
              <select
                value={tierRank}
                onChange={(e) => setTierRank(Number(e.target.value))}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/50 bg-white"
              >
                {TIER_OPTIONS.map((tier) => (
                  <option key={tier.rank} value={tier.rank}>
                    {tier.emoji} Lv.{tier.rank} - {tier.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1.5">🏆 높은 티어일수록 더 특별한 혜택을 제공해보세요!</p>
            </div>

            {/* 플랜 가격 */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">플랜 가격 (포인트)</label>
              <div className="relative">
                <input
                  type="number"
                  placeholder="월 구독 가격"
                  value={newMembershipPrice}
                  onChange={(e) => setNewMembershipPrice(e.target.value)}
                  className="w-full px-3 py-2.5 pr-14 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/50"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">P/월</span>
              </div>
            </div>

            {/* 플랜 소개 */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">플랜 소개</label>
              <textarea
                placeholder={`플랜을 더 구체적으로 소개해보세요.\n\n예시)\n• 메이트유 독점 공개 사진/영상\n• 구독자 전용 풀영상 공개\n• 구독자에게 보내는 특별한 1:1 메시지\n• 1달 1회 영상통화`}
                value={newMembershipDescription}
                onChange={(e) => setNewMembershipDescription(e.target.value)}
                rows={5}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/50 resize-none"
              />
            </div>
          </div>

          {/* 구분선 */}
          <div className="w-full bg-gray-200 my-4 flex-shrink-0" style={{ height: '4px', minHeight: '4px' }} />

          {/* 콘텐츠 접근 섹션 */}
          <div className="bg-white p-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">콘텐츠 접근</h3>
            
            {/* 포스트 공개기한 - 라디오 버튼 */}
            <div className="space-y-3">
              <label className="text-xs text-gray-500 block">포스트 공개기한</label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="postAccessPeriod"
                  value="30days"
                  checked={postAccessPeriod === '30days'}
                  onChange={(e) => setPostAccessPeriod(e.target.value as '30days' | 'all')}
                  className="w-5 h-5 text-[#FE3A8F] border-gray-300 focus:ring-[#FE3A8F] accent-[#FE3A8F]"
                />
                <span className="text-sm text-gray-700">구독 시작일 기준 30일 전 포스트부터 열람</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="postAccessPeriod"
                  value="all"
                  checked={postAccessPeriod === 'all'}
                  onChange={(e) => setPostAccessPeriod(e.target.value as '30days' | 'all')}
                  className="w-5 h-5 text-[#FE3A8F] border-gray-300 focus:ring-[#FE3A8F] accent-[#FE3A8F]"
                />
                <span className="text-sm text-gray-700">모든 기간의 포스트 열람</span>
              </label>
            </div>
          </div>

          {/* 구분선 */}
          <div className="w-full bg-gray-200 my-4 flex-shrink-0" style={{ height: '4px', minHeight: '4px' }} />

          {/* 소통 혜택 섹션 */}
          <div className="bg-white p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-800">소통 혜택</h3>

            {/* 메시지 */}
            <div className="border border-gray-900 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">메시지</span>
                <button
                  type="button"
                  onClick={() => setMessageEnabled(!messageEnabled)}
                  className={`relative w-12 h-7 rounded-full transition-all border-2 ${
                    messageEnabled 
                      ? 'bg-transparent border-[#FE3A8F]' 
                      : 'bg-transparent border-gray-300'
                  }`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full shadow transition-all ${
                    messageEnabled 
                      ? 'bg-[#FE3A8F] left-[calc(100%-22px)]' 
                      : 'bg-gray-300 left-0.5'
                  }`} />
                </button>
              </div>
              {messageEnabled && (
                <div className="mt-3">
                  <label className="text-xs text-gray-500 mb-1 block">무료 메시지 갯수</label>
                  <div className="relative">
                    <input
                      type="number"
                      placeholder="0"
                      min="0"
                      value={freeMessageCount}
                      onChange={(e) => setFreeMessageCount(e.target.value)}
                      className="w-full px-3 py-2 pr-10 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/50"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">개</span>
                  </div>
                </div>
              )}
            </div>

            {/* 음성통화 */}
            <div className="border border-gray-900 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">음성통화</span>
                <button
                  type="button"
                  onClick={() => setVoiceCallEnabled(!voiceCallEnabled)}
                  className={`relative w-12 h-7 rounded-full transition-all border-2 ${
                    voiceCallEnabled 
                      ? 'bg-transparent border-[#FE3A8F]' 
                      : 'bg-transparent border-gray-300'
                  }`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full shadow transition-all ${
                    voiceCallEnabled 
                      ? 'bg-[#FE3A8F] left-[calc(100%-22px)]' 
                      : 'bg-gray-300 left-0.5'
                  }`} />
                </button>
              </div>
              {voiceCallEnabled && (
                <div className="mt-3">
                  <label className="text-xs text-gray-500 mb-1 block">음성통화 시간</label>
                  <div className="relative">
                    <input
                      type="number"
                      placeholder="0"
                      min="0"
                      value={voiceCallMinutes}
                      onChange={(e) => setVoiceCallMinutes(e.target.value)}
                      className="w-full px-3 py-2 pr-10 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/50"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">분</span>
                  </div>
                </div>
              )}
            </div>

            {/* 영상통화 */}
            <div className="border border-gray-900 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">영상통화</span>
                <button
                  type="button"
                  onClick={() => setVideoCallEnabled(!videoCallEnabled)}
                  className={`relative w-12 h-7 rounded-full transition-all border-2 ${
                    videoCallEnabled 
                      ? 'bg-transparent border-[#FE3A8F]' 
                      : 'bg-transparent border-gray-300'
                  }`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full shadow transition-all ${
                    videoCallEnabled 
                      ? 'bg-[#FE3A8F] left-[calc(100%-22px)]' 
                      : 'bg-gray-300 left-0.5'
                  }`} />
                </button>
              </div>
              {videoCallEnabled && (
                <div className="mt-3">
                  <label className="text-xs text-gray-500 mb-1 block">영상통화 시간</label>
                  <div className="relative">
                    <input
                      type="number"
                      placeholder="0"
                      min="0"
                      value={videoCallMinutes}
                      onChange={(e) => setVideoCallMinutes(e.target.value)}
                      className="w-full px-3 py-2 pr-10 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/50"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">분</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 구분선 */}
          <div className="w-full bg-gray-200 my-4 flex-shrink-0" style={{ height: '4px', minHeight: '4px' }} />

          {/* 기본 설정 섹션 */}
          <div className="bg-white p-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">기본 설정</h3>
            
            {/* 구독 메시지 + 플랜 공개하기 통합 */}
            <div className="border border-gray-900 rounded-lg p-4 space-y-4">
              {/* 구독 메시지 */}
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-800">구독 메시지</h4>
                    <p className="text-xs text-gray-400 mt-0.5">구독 시 자동 발송</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setWelcomeMessageEnabled(!welcomeMessageEnabled)}
                    className={`relative w-12 h-7 rounded-full transition-all border-2 ${
                      welcomeMessageEnabled 
                        ? 'bg-transparent border-[#FE3A8F]' 
                        : 'bg-transparent border-gray-300'
                    }`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full shadow transition-all ${
                      welcomeMessageEnabled 
                        ? 'bg-[#FE3A8F] left-[calc(100%-22px)]' 
                        : 'bg-gray-300 left-0.5'
                    }`} />
                  </button>
                </div>
                
                {welcomeMessageEnabled && (
                  <div className="space-y-3 pt-3 mt-3 border-t border-gray-200">
                    <p className="text-xs text-gray-400 bg-gray-50 p-3 rounded-lg">
                      💌 새로운 구독자에게 보내는 첫 인사는 특별한 인연의 시작이에요! 따뜻한 환영 메시지로 팬들에게 잊지 못할 긍정적인 첫 경험을 선물해주세요 ✨
                    </p>
                    
                    {/* 미디어 업로드 */}
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">사진/동영상 (1개)</label>
                      {welcomeMediaPreview ? (
                        <div className="relative w-full aspect-video bg-gray-100 rounded-lg overflow-hidden">
                          {welcomeMedia?.type.startsWith('video/') ? (
                            <video src={welcomeMediaPreview} className="w-full h-full object-cover" />
                          ) : (
                            <img src={welcomeMediaPreview} alt="미리보기" className="w-full h-full object-cover" />
                          )}
                          <button
                            type="button"
                            onClick={() => { setWelcomeMedia(null); setWelcomeMediaPreview(null) }}
                            className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full text-white hover:bg-black/70"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <label className="flex items-center justify-center w-full h-28 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-[#FE3A8F]/50 transition-colors">
                          <input
                            type="file"
                            accept="image/*,video/*"
                            onChange={handleWelcomeMediaSelect}
                            className="hidden"
                          />
                          <div className="text-center">
                            <Plus className="h-8 w-8 text-gray-300 mx-auto" />
                            <span className="text-xs text-gray-400 mt-1 block">클릭하여 업로드</span>
                          </div>
                        </label>
                      )}
                    </div>
                    
                    {/* 메시지 입력 */}
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">메시지</label>
                      <textarea
                        placeholder="예시) 구독해주셔서 정말 감사해요! 💕 앞으로 더 특별한 콘텐츠로 보답할게요~"
                        defaultValue={welcomeMessage}
                        onBlur={(e) => setWelcomeMessage(e.target.value)}
                        onInput={(e) => setWelcomeMessage((e.target as HTMLTextAreaElement).value)}
                        rows={3}
                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/50 resize-y placeholder:text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 구분선 */}
              <div className="border-t border-gray-200" />

              {/* 자동 갱신 메시지 */}
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-800">자동 갱신 메시지</h4>
                    <p className="text-xs text-gray-400 mt-0.5">멤버십 갱신 시 자동 발송</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRenewalMessageEnabled(!renewalMessageEnabled)}
                    className={`relative w-12 h-7 rounded-full transition-all border-2 ${
                      renewalMessageEnabled 
                        ? 'bg-transparent border-[#FE3A8F]' 
                        : 'bg-transparent border-gray-300'
                    }`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full shadow transition-all ${
                      renewalMessageEnabled 
                        ? 'bg-[#FE3A8F] left-[calc(100%-22px)]' 
                        : 'bg-gray-300 left-0.5'
                    }`} />
                  </button>
                </div>
                
                {renewalMessageEnabled && (
                  <div className="space-y-3 pt-3 mt-3 border-t border-gray-200">
                    <p className="text-xs text-gray-400 bg-gray-50 p-3 rounded-lg">
                      🔄 구독을 갱신해주신 팬분들께 감사의 메시지를 전해보세요! 지속적인 관심에 대한 특별한 감사 인사가 더 깊은 유대감을 만들어줄 거예요 💝
                    </p>
                    
                    {/* 미디어 업로드 */}
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">사진/동영상 (1개)</label>
                      {renewalMediaPreview ? (
                        <div className="relative w-full aspect-video bg-gray-100 rounded-lg overflow-hidden">
                          {renewalMedia?.type.startsWith('video/') ? (
                            <video src={renewalMediaPreview} className="w-full h-full object-cover" />
                          ) : (
                            <img src={renewalMediaPreview} alt="미리보기" className="w-full h-full object-cover" />
                          )}
                          <button
                            type="button"
                            onClick={() => { setRenewalMedia(null); setRenewalMediaPreview(null) }}
                            className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full text-white hover:bg-black/70"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <label className="flex items-center justify-center w-full h-28 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-[#FE3A8F]/50 transition-colors">
                          <input
                            type="file"
                            accept="image/*,video/*"
                            onChange={handleRenewalMediaSelect}
                            className="hidden"
                          />
                          <div className="text-center">
                            <Plus className="h-8 w-8 text-gray-300 mx-auto" />
                            <span className="text-xs text-gray-400 mt-1 block">클릭하여 업로드</span>
                          </div>
                        </label>
                      )}
                    </div>
                    
                    {/* 메시지 입력 */}
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">메시지</label>
                      <textarea
                        placeholder="예시) 이번 달도 함께해주셔서 감사해요! 🎉 앞으로도 더 좋은 콘텐츠로 보답할게요~"
                        defaultValue={renewalMessage}
                        onBlur={(e) => setRenewalMessage(e.target.value)}
                        onInput={(e) => setRenewalMessage((e.target as HTMLTextAreaElement).value)}
                        rows={3}
                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/50 resize-y placeholder:text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 구분선 */}
              <div className="border-t border-gray-200" />

              {/* 플랜 공개하기 */}
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-gray-800">플랜 공개하기</h4>
                  <p className="text-xs text-gray-400 mt-0.5">비공개 시 구독자만 확인 가능</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPlanActive(!isPlanActive)}
                  className={`relative w-12 h-7 rounded-full transition-all border-2 ${
                    isPlanActive 
                      ? 'bg-transparent border-[#FE3A8F]' 
                      : 'bg-transparent border-gray-300'
                  }`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full shadow transition-all ${
                    isPlanActive 
                      ? 'bg-[#FE3A8F] left-[calc(100%-22px)]' 
                      : 'bg-gray-300 left-0.5'
                  }`} />
                </button>
              </div>
            </div>
          </div>
          </div>
          {/* 생성 버튼 - 스크롤 영역 밖에 고정 */}
          <div 
            className="flex-shrink-0 bg-white p-4 border-t border-gray-100"
            style={{ 
              paddingBottom: Capacitor.isNativePlatform() 
                ? 'calc(env(safe-area-inset-bottom, 0px) + 16px)' 
                : '16px' 
            }}
          >
            <button
              type="button"
              onClick={() => {
                handleCreateMembership()
                setIsNewPlanSheetOpen(false)
              }}
              disabled={isCreatingMembership}
              className="w-full py-3.5 bg-[#FE3A8F] text-white text-sm font-semibold rounded-xl hover:bg-[#e8338a] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isCreatingMembership ? '생성 중...' : '플랜 생성'}
            </button>
          </div>
        </div>
      </SlideSheet>

      {/* 플랜 수정 슬라이드 시트 */}
      <SlideSheet
        isOpen={isEditPlanSheetOpen}
        onClose={() => {
          setIsEditPlanSheetOpen(false)
          setEditingMembership(null)
          resetMembershipForm()
        }}
        title="플랜 수정"
        initialHeight={0.95}
        minHeight={0.5}
        maxHeight={0.95}
        zIndex={210}
        noPadding
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* 스크롤 가능한 콘텐츠 영역 */}
          <div className="flex-1 overflow-y-auto">
          {/* 구독자 경고 메시지 */}

          {/* 기본 정보 섹션 */}
          <div className="bg-white p-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">기본 정보</h3>
            
            {/* 플랜 제목 */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">플랜 제목</label>
              <input
                type="text"
                placeholder="플랜 이름을 입력하세요"
                value={newMembershipName}
                onChange={(e) => setNewMembershipName(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/50"
              />
            </div>

            {/* 티어 등급 */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">티어 등급</label>
              <select
                value={tierRank}
                onChange={(e) => setTierRank(Number(e.target.value))}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/50 bg-white"
              >
                {TIER_OPTIONS.map((tier) => (
                  <option key={tier.rank} value={tier.rank}>
                    {tier.emoji} Lv.{tier.rank} - {tier.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 플랜 가격 */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">플랜 가격 (포인트)</label>
              <div className="relative">
                <input
                  type="number"
                  placeholder="월 구독 가격"
                  value={newMembershipPrice}
                  onChange={(e) => setNewMembershipPrice(e.target.value)}
                  className="w-full px-3 py-2.5 pr-14 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/50"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">P/월</span>
              </div>
            </div>

            {/* 플랜 소개 */}
            <div>
              <label className="text-xs text-gray-500 mb-1 block">플랜 소개</label>
              <textarea
                placeholder="플랜에 대한 설명을 입력하세요"
                value={newMembershipDescription}
                onChange={(e) => setNewMembershipDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/50 resize-none"
              />
            </div>
          </div>

          {/* 구분선 */}
          <div className="w-full bg-gray-200 my-4 flex-shrink-0" style={{ height: '4px', minHeight: '4px' }} />

          {/* 콘텐츠 접근 섹션 */}
          <div className="bg-white p-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">콘텐츠 접근</h3>
            
            <div className="space-y-3">
              <label className="text-xs text-gray-500 block">포스트 공개기한</label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="editPostAccessPeriod"
                  value="30days"
                  checked={postAccessPeriod === '30days'}
                  onChange={(e) => setPostAccessPeriod(e.target.value as '30days' | 'all')}
                  className="w-5 h-5 text-[#FE3A8F] border-gray-300 focus:ring-[#FE3A8F] accent-[#FE3A8F]"
                />
                <span className="text-sm text-gray-700">구독 시작일 기준 30일 전 포스트부터 열람</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="editPostAccessPeriod"
                  value="all"
                  checked={postAccessPeriod === 'all'}
                  onChange={(e) => setPostAccessPeriod(e.target.value as '30days' | 'all')}
                  className="w-5 h-5 text-[#FE3A8F] border-gray-300 focus:ring-[#FE3A8F] accent-[#FE3A8F]"
                />
                <span className="text-sm text-gray-700">모든 기간의 포스트 열람</span>
              </label>
            </div>
          </div>

          {/* 구분선 */}
          <div className="w-full bg-gray-200 my-4 flex-shrink-0" style={{ height: '4px', minHeight: '4px' }} />

          {/* 소통 혜택 섹션 */}
          <div className="bg-white p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-800">소통 혜택</h3>

            {/* 메시지 */}
            <div className="border border-gray-900 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">메시지</span>
                <button
                  type="button"
                  onClick={() => setMessageEnabled(!messageEnabled)}
                  className={`relative w-12 h-7 rounded-full transition-all border-2 ${
                    messageEnabled 
                      ? 'bg-transparent border-[#FE3A8F]' 
                      : 'bg-transparent border-gray-300'
                  }`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full shadow transition-all ${
                    messageEnabled 
                      ? 'bg-[#FE3A8F] left-[calc(100%-22px)]' 
                      : 'bg-gray-300 left-0.5'
                  }`} />
                </button>
              </div>
              {messageEnabled && (
                <div className="mt-3">
                  <label className="text-xs text-gray-500 mb-1 block">무료 메시지 갯수</label>
                  <div className="relative">
                    <input
                      type="number"
                      placeholder="0"
                      min="0"
                      value={freeMessageCount}
                      onChange={(e) => setFreeMessageCount(e.target.value)}
                      className="w-full px-3 py-2 pr-10 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/50"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">개</span>
                  </div>
                </div>
              )}
            </div>

            {/* 음성통화 */}
            <div className="border border-gray-900 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">음성통화</span>
                <button
                  type="button"
                  onClick={() => setVoiceCallEnabled(!voiceCallEnabled)}
                  className={`relative w-12 h-7 rounded-full transition-all border-2 ${
                    voiceCallEnabled 
                      ? 'bg-transparent border-[#FE3A8F]' 
                      : 'bg-transparent border-gray-300'
                  }`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full shadow transition-all ${
                    voiceCallEnabled 
                      ? 'bg-[#FE3A8F] left-[calc(100%-22px)]' 
                      : 'bg-gray-300 left-0.5'
                  }`} />
                </button>
              </div>
              {voiceCallEnabled && (
                <div className="mt-3">
                  <label className="text-xs text-gray-500 mb-1 block">음성통화 시간</label>
                  <div className="relative">
                    <input
                      type="number"
                      placeholder="0"
                      min="0"
                      value={voiceCallMinutes}
                      onChange={(e) => setVoiceCallMinutes(e.target.value)}
                      className="w-full px-3 py-2 pr-10 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/50"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">분</span>
                  </div>
                </div>
              )}
            </div>

            {/* 영상통화 */}
            <div className="border border-gray-900 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">영상통화</span>
                <button
                  type="button"
                  onClick={() => setVideoCallEnabled(!videoCallEnabled)}
                  className={`relative w-12 h-7 rounded-full transition-all border-2 ${
                    videoCallEnabled 
                      ? 'bg-transparent border-[#FE3A8F]' 
                      : 'bg-transparent border-gray-300'
                  }`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full shadow transition-all ${
                    videoCallEnabled 
                      ? 'bg-[#FE3A8F] left-[calc(100%-22px)]' 
                      : 'bg-gray-300 left-0.5'
                  }`} />
                </button>
              </div>
              {videoCallEnabled && (
                <div className="mt-3">
                  <label className="text-xs text-gray-500 mb-1 block">영상통화 시간</label>
                  <div className="relative">
                    <input
                      type="number"
                      placeholder="0"
                      min="0"
                      value={videoCallMinutes}
                      onChange={(e) => setVideoCallMinutes(e.target.value)}
                      className="w-full px-3 py-2 pr-10 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/50"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">분</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 구분선 */}
          <div className="w-full bg-gray-200 my-4 flex-shrink-0" style={{ height: '4px', minHeight: '4px' }} />

          {/* 기본 설정 섹션 */}
          <div className="bg-white p-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">기본 설정</h3>
            
            {/* 구독 메시지 + 플랜 공개하기 통합 */}
            <div className="border border-gray-900 rounded-lg p-4 space-y-4">
              {/* 구독 메시지 */}
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-800">구독 메시지</h4>
                    <p className="text-xs text-gray-400 mt-0.5">구독 시 자동 발송</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setWelcomeMessageEnabled(!welcomeMessageEnabled)}
                    className={`relative w-12 h-7 rounded-full transition-all border-2 ${
                      welcomeMessageEnabled 
                        ? 'bg-transparent border-[#FE3A8F]' 
                        : 'bg-transparent border-gray-300'
                    }`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full shadow transition-all ${
                      welcomeMessageEnabled 
                        ? 'bg-[#FE3A8F] left-[calc(100%-22px)]' 
                        : 'bg-gray-300 left-0.5'
                    }`} />
                  </button>
                </div>
                
                {welcomeMessageEnabled && (
                  <div className="space-y-3 pt-3 mt-3 border-t border-gray-200">
                    {/* 미디어 업로드 */}
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">사진/동영상 (1개)</label>
                      {welcomeMediaPreview ? (
                        <div className="relative w-full aspect-video bg-gray-100 rounded-lg overflow-hidden">
                          {(welcomeMedia?.type.startsWith('video/') || (!welcomeMedia && (welcomeMediaPreview.includes('.mp4') || welcomeMediaPreview.includes('.mov') || welcomeMediaPreview.includes('.webm')))) ? (
                            <video 
                              src={welcomeMedia ? welcomeMediaPreview : `${welcomeMediaPreview}${welcomeMediaPreview.includes('?') ? '&' : '?'}t=${Date.now()}`} 
                              className="w-full h-full object-cover" 
                              controls={false} 
                            />
                          ) : (
                            <img 
                              src={welcomeMedia ? welcomeMediaPreview : `${welcomeMediaPreview}${welcomeMediaPreview.includes('?') ? '&' : '?'}t=${Date.now()}`} 
                              alt="미리보기" 
                              className="w-full h-full object-cover" 
                            />
                          )}
                          <button
                            type="button"
                            onClick={() => { setWelcomeMedia(null); setWelcomeMediaPreview(null) }}
                            className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full text-white hover:bg-black/70"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <label className="flex items-center justify-center w-full h-28 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-[#FE3A8F]/50 transition-colors">
                          <input
                            type="file"
                            accept="image/*,video/*"
                            onChange={handleWelcomeMediaSelect}
                            className="hidden"
                          />
                          <div className="text-center">
                            <Plus className="h-8 w-8 text-gray-300 mx-auto" />
                            <span className="text-xs text-gray-400 mt-1 block">클릭하여 업로드</span>
                          </div>
                        </label>
                      )}
                    </div>
                    
                    {/* 메시지 입력 */}
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">메시지</label>
                      <textarea
                        placeholder="구독자에게 보낼 환영 메시지를 입력하세요"
                        defaultValue={welcomeMessage}
                        onBlur={(e) => setWelcomeMessage(e.target.value)}
                        onInput={(e) => setWelcomeMessage((e.target as HTMLTextAreaElement).value)}
                        rows={3}
                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/50 resize-y placeholder:text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 구분선 */}
              <div className="border-t border-gray-200" />

              {/* 자동 갱신 메시지 */}
              <div>
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-medium text-gray-800">자동 갱신 메시지</h4>
                    <p className="text-xs text-gray-400 mt-0.5">멤버십 갱신 시 자동 발송</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setRenewalMessageEnabled(!renewalMessageEnabled)}
                    className={`relative w-12 h-7 rounded-full transition-all border-2 ${
                      renewalMessageEnabled 
                        ? 'bg-transparent border-[#FE3A8F]' 
                        : 'bg-transparent border-gray-300'
                    }`}
                  >
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full shadow transition-all ${
                      renewalMessageEnabled 
                        ? 'bg-[#FE3A8F] left-[calc(100%-22px)]' 
                        : 'bg-gray-300 left-0.5'
                    }`} />
                  </button>
                </div>
                
                {renewalMessageEnabled && (
                  <div className="space-y-3 pt-3 mt-3 border-t border-gray-200">
                    {/* 미디어 업로드 */}
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">사진/동영상 (1개)</label>
                      {renewalMediaPreview ? (
                        <div className="relative w-full aspect-video bg-gray-100 rounded-lg overflow-hidden">
                          {(renewalMedia?.type.startsWith('video/') || (!renewalMedia && (renewalMediaPreview.includes('.mp4') || renewalMediaPreview.includes('.mov') || renewalMediaPreview.includes('.webm')))) ? (
                            <video 
                              src={renewalMedia ? renewalMediaPreview : `${renewalMediaPreview}${renewalMediaPreview.includes('?') ? '&' : '?'}t=${Date.now()}`} 
                              className="w-full h-full object-cover" 
                              controls={false} 
                            />
                          ) : (
                            <img 
                              src={renewalMedia ? renewalMediaPreview : `${renewalMediaPreview}${renewalMediaPreview.includes('?') ? '&' : '?'}t=${Date.now()}`} 
                              alt="미리보기" 
                              className="w-full h-full object-cover" 
                            />
                          )}
                          <button
                            type="button"
                            onClick={() => { setRenewalMedia(null); setRenewalMediaPreview(null) }}
                            className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-full text-white hover:bg-black/70"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <label className="flex items-center justify-center w-full h-28 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-[#FE3A8F]/50 transition-colors">
                          <input
                            type="file"
                            accept="image/*,video/*"
                            onChange={handleRenewalMediaSelect}
                            className="hidden"
                          />
                          <div className="text-center">
                            <Plus className="h-8 w-8 text-gray-300 mx-auto" />
                            <span className="text-xs text-gray-400 mt-1 block">클릭하여 업로드</span>
                          </div>
                        </label>
                      )}
                    </div>
                    
                    {/* 메시지 입력 */}
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">메시지</label>
                      <textarea
                        placeholder="예시) 이번 달도 함께해주셔서 감사해요! 🎉 앞으로도 더 좋은 콘텐츠로 보답할게요~"
                        defaultValue={renewalMessage}
                        onBlur={(e) => setRenewalMessage(e.target.value)}
                        onInput={(e) => setRenewalMessage((e.target as HTMLTextAreaElement).value)}
                        rows={3}
                        className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/50 resize-y placeholder:text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 구분선 */}
              <div className="border-t border-gray-200" />

              {/* 플랜 공개하기 */}
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-medium text-gray-800">플랜 공개하기</h4>
                  <p className="text-xs text-gray-400 mt-0.5">비공개 시 구독자만 확인 가능</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPlanActive(!isPlanActive)}
                  className={`relative w-12 h-7 rounded-full transition-all border-2 ${
                    isPlanActive 
                      ? 'bg-transparent border-[#FE3A8F]' 
                      : 'bg-transparent border-gray-300'
                  }`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full shadow transition-all ${
                    isPlanActive 
                      ? 'bg-[#FE3A8F] left-[calc(100%-22px)]' 
                      : 'bg-gray-300 left-0.5'
                  }`} />
                </button>
              </div>
            </div>
          </div>
          </div>

          {/* 수정 버튼 - 스크롤 영역 밖에 고정 */}
          <div 
            className="flex-shrink-0 bg-white p-4 border-t border-gray-100"
            style={{ 
              paddingBottom: Capacitor.isNativePlatform() 
                ? 'calc(env(safe-area-inset-bottom, 0px) + 16px)' 
                : '16px' 
            }}
          >
            <button
              type="button"
              onClick={handleUpdateMembership}
              disabled={isUpdatingMembership}
              className="w-full py-3.5 bg-[#FE3A8F] text-white text-sm font-semibold rounded-xl hover:bg-[#e8338a] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isUpdatingMembership ? '수정 중...' : '플랜 수정'}
            </button>
          </div>
        </div>
      </SlideSheet>

    </div>
  )
}
