import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
// lucide-react icons removed - not currently used
import { Button } from './Button'
import { useAuth } from '@/hooks/useAuth'
import { usePartnerRequests } from '@/hooks/usePartnerRequests'
import { useToast } from '@/hooks/useToast'
import { useDevice } from '@/hooks/useDevice'
import { mateYouApi } from '@/lib/apiClient'
import { useLocation } from '@tanstack/react-router'
import { supabase } from '@/lib/supabase'

interface PendingRequest {
  id: string
  client_id: string
  partner_id: string
  request_type: string
  job_count: number
  coins_per_job: number
  total_coins: number
  note?: string
  created_at: string
  client: {
    id: string
    name: string
    profile_image?: string
  }
}

interface MobileRequestBannerProps {
  className?: string
}

export function MobileRequestBanner({ className = '' }: MobileRequestBannerProps) {
  // 🚫 SimpleChatRoom에서 기존 배너를 사용하므로 이 컴포넌트는 비활성화
  // 추후 필요시 아래 return null을 제거하여 재활성화 가능
  return null
  
  const { user } = useAuth()
  const { isMobile } = useDevice()
  const { acceptRequest, rejectRequest, isAccepting } = usePartnerRequests()
  const { addToast } = useToast()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [dismissedRequests, setDismissedRequests] = useState<Set<string>>(new Set())
  const [currentRequestIndex, setCurrentRequestIndex] = useState(0)
  const subscriptionRef = useRef<any>(null)

  // URL에서 현재 채팅 중인 사용자 ID 추출
  const getCurrentChatUserId = () => {
    // /chat?partnerId=xxx 형태에서 partnerId 추출
    const searchParams = new URLSearchParams(location.search)
    const partnerId = searchParams.get('partnerId')

    console.log('🔍 현재 경로 정보:', {
      pathname: location.pathname,
      search: location.search,
      partnerId
    })

    return partnerId
  }

  const currentChatUserId = getCurrentChatUserId()

  console.log('🔍 MobileRequestBanner 렌더링:', {
    user: user ? { id: user.id, role: user.role, name: user.name } : null,
    isMobile,
    shouldShow: !!(user && user.role === 'partner')
  })

  // 대기 중인 파트너 요청들 가져오기
  const { data: pendingRequestsResponse, refetch } = useQuery({
    queryKey: ['partner-requests-pending', user?.id],
    queryFn: async () => {
      const response = await mateYouApi.partnerDashboard.getRequests({
        page: 1,
        limit: 50,
        status: 'pending',
      })
      console.log('📋 파트너 요청 데이터:', response)
      return response
    },
    refetchInterval: 5000, // 5초마다 새로고침 (더 빠른 업데이트)
    enabled: !!user?.id && user?.role === 'partner' // isMobile 조건 제거
  })

  // 실시간 구독 설정 - partner_requests 테이블 변경 감지
  useEffect(() => {
    if (!user?.id || user?.role !== 'partner') return // isMobile 조건 제거

    // 기존 구독 해제
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe()
    }

    console.log('🔔 MobileRequestBanner 실시간 구독 시작:', user.id)

    // partner_requests 테이블의 변경 감지
    subscriptionRef.current = supabase
      .channel(`partner-requests-banner-${user.id}`)
      .on('postgres_changes', {
        event: '*', // INSERT, UPDATE, DELETE 모두 감지
        schema: 'public',
        table: 'partner_requests',
      }, (payload) => {
        console.log('🔔 partner_requests 변경 감지:', payload)
        // 즉시 refetch
        refetch()
        // queryClient 캐시도 무효화
        queryClient.invalidateQueries({ queryKey: ['partner-requests-pending'] })
      })
      .subscribe((status) => {
        console.log('🔔 MobileRequestBanner 구독 상태:', status)
      })

    return () => {
      console.log('🔔 MobileRequestBanner 실시간 구독 해제')
      if (subscriptionRef.current) {
        subscriptionRef.current.unsubscribe()
        subscriptionRef.current = null
      }
    }
  }, [user?.id, user?.role, isMobile, refetch, queryClient])

  // 파트너만 보이도록 (isMobile 조건 제거 - 데스크톱에서도 표시)
  if (!user || user.role !== 'partner') {
    console.log('❌ MobileRequestBanner 조건 불만족:', {
      hasUser: !!user,
      userRole: user?.role
    })
    return null
  }

  const pendingRequests = (pendingRequestsResponse?.data?.data || []) as PendingRequest[]

  console.log('📋 대기 중인 요청들:', {
    total: pendingRequests.length,
    requests: pendingRequests.map(r => ({
      id: r.id,
      client: r.client,
      clientName: r.client?.name || '알 수 없음',
      type: r.request_type,
      coins: r.total_coins,
      rawData: r
    }))
  })

  // 보여줄 요청들 (해제하지 않은 것)
  // 채팅 페이지에 있으면 현재 채팅 상대의 의뢰를 우선 정렬
  const visibleRequests = pendingRequests
    .filter(request => {
      // 해제된 요청 제외
      if (dismissedRequests.has(request.id)) return false
      // 모든 pending 의뢰 표시
      return true
    })
    .sort((a, b) => {
      // 현재 채팅 중인 사용자의 의뢰를 우선
      if (currentChatUserId) {
        const aIsCurrentChat = a.client_id === currentChatUserId
        const bIsCurrentChat = b.client_id === currentChatUserId
        if (aIsCurrentChat && !bIsCurrentChat) return -1
        if (!aIsCurrentChat && bIsCurrentChat) return 1
      }
      // 최신 순으로 정렬
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

  const currentRequest = visibleRequests[currentRequestIndex]

  console.log('📋 필터링된 요청들:', {
    currentChatUserId,
    totalRequests: pendingRequests.length,
    visibleRequests: visibleRequests.length,
    currentRequest: currentRequest ? {
      id: currentRequest.id,
      clientId: currentRequest.client_id,
      type: currentRequest.request_type
    } : null
  })

  // 현재 요청이 없으면 인덱스 리셋
  useEffect(() => {
    if (visibleRequests.length === 0) {
      setCurrentRequestIndex(0)
    } else if (currentRequestIndex >= visibleRequests.length) {
      setCurrentRequestIndex(0)
    }
  }, [visibleRequests.length, currentRequestIndex])

  // 핸들러 함수들 정의
  const handleAccept = async () => {
    if (!currentRequest) return
    try {
      await acceptRequest(currentRequest.id)
      addToast('의뢰를 수락했습니다!', 'success')
      refetch()

      // 수락한 요청을 dismissed에 추가
      setDismissedRequests(prev => new Set([...prev, currentRequest.id]))
    } catch (error) {
      console.error('요청 수락 실패:', error)
      addToast('요청 수락에 실패했습니다', 'error')
    }
  }

  const handleReject = async () => {
    if (!currentRequest) return
    try {
      await rejectRequest(currentRequest.id, '파트너가 현재 다른 업무로 인해 의뢰를 수행할 수 없습니다.')
      addToast('의뢰를 거절했습니다', 'info')
      refetch()

      // 거절한 요청을 dismissed에 추가
      setDismissedRequests(prev => new Set([...prev, currentRequest.id]))
    } catch (error) {
      console.error('요청 거절 실패:', error)
      addToast('요청 거절에 실패했습니다', 'error')
    }
  }

  const handleDismiss = () => {
    if (!currentRequest) return
    setDismissedRequests(prev => new Set([...prev, currentRequest.id]))
  }

  const handleNext = () => {
    if (visibleRequests.length > 1) {
      setCurrentRequestIndex((prev) => (prev + 1) % visibleRequests.length)
    }
  }

  // 요청이 없으면 렌더링하지 않음
  if (!currentRequest) {
    console.log('❌ 현재 요청 없음:', {
      visibleRequestsLength: visibleRequests.length,
      pendingRequestsLength: pendingRequests.length,
      dismissedRequestsSize: dismissedRequests.size,
      currentRequestIndex
    })

    return null
  }


  return (
    <div 
      className={`fixed left-0 right-0 z-[9999] shadow-lg ${className}`}
      style={{ 
        top: 'calc(env(safe-area-inset-top) + 56px)',
        backgroundColor: '#FFF0F5' // 연한 핑크색
      }}
    >
      {/* 의뢰 정보 */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          {/* 왼쪽: 프로필 + 의뢰 정보 */}
          <div className="flex items-center space-x-3">
            {/* 프로필 이미지 */}
            {currentRequest.client?.profile_image ? (
              <img 
                src={currentRequest.client.profile_image} 
                alt={currentRequest.client?.name || '사용자'}
                className="w-10 h-10 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-10 h-10 bg-pink-200 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-[#FE3A8F] font-semibold text-sm">
                  {currentRequest.client?.name?.[0] || '?'}
                </span>
              </div>
            )}
            
            {/* 의뢰 정보 */}
            <div className="flex flex-col">
              <div className="text-sm font-medium text-gray-900">
                {currentRequest.client?.name || '알 수 없는 사용자'}
              </div>
              <div className="flex items-center space-x-2 text-xs text-gray-600">
                <span>{currentRequest.request_type || '알 수 없는 작업'}</span>
                <span className="text-[#FE3A8F] font-semibold whitespace-nowrap">
                  {(currentRequest.total_coins || 0).toLocaleString()}P / {currentRequest.job_count || 1}회
                </span>
              </div>
            </div>
          </div>

          {/* 오른쪽: 액션 버튼들 */}
          <div className="flex items-center space-x-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReject}
              disabled={isAccepting}
              className="px-3 h-8 border-gray-300 text-gray-600 hover:bg-gray-100 text-xs font-medium"
            >
              거절
            </Button>

            <Button
              size="sm"
              onClick={handleAccept}
              disabled={isAccepting}
              className="px-3 h-8 text-white text-xs font-medium"
              style={{ backgroundColor: '#FE3A8F' }}
            >
              수락
            </Button>
          </div>
        </div>

        {/* 여러 요청이 있을 때 인디케이터 */}
        {visibleRequests.length > 1 && (
          <div className="flex justify-center mt-2">
            <span className="text-xs text-[#FE3A8F] bg-pink-100 px-2 py-0.5 rounded-full">
              {currentRequestIndex + 1}/{visibleRequests.length}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}