/**
 * useCheckSubscription - 구독자 전용방 구독 여부 확인 훅
 * 
 * 밴 확인과 동일한 단계에서 구독자 전용방의 경우 구독 여부를 확인합니다.
 */

import { useAuth } from '@/hooks/useAuth'
import { edgeApi } from '@/lib/edgeApi'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

interface UseCheckSubscriptionOptions {
  userId: string | undefined
  roomId: string | undefined
  hostPartnerId: string | null | undefined
  accessType: 'public' | 'private' | 'subscriber' | undefined
}

interface SubscriptionCheckResult {
  isSubscribed: boolean
  isChecking: boolean
  error: string | null
}

export function useCheckSubscription({
  userId,
  roomId,
  hostPartnerId,
  accessType,
}: UseCheckSubscriptionOptions): SubscriptionCheckResult {
  const { user } = useAuth()

  // 관리자 여부 확인
  const isAdmin = useMemo(() => user?.role === 'admin', [user?.role])

  // enabled 조건을 더 명확하게 체크
  const hasUserId = !!userId
  const hasRoomId = !!roomId
  const isSubscriberRoom = accessType === 'subscriber'
  const hasHostPartnerId = !!hostPartnerId
  const shouldCheck = !isAdmin

  const enabled = hasUserId && hasRoomId && isSubscriberRoom && hasHostPartnerId && shouldCheck

  const { data, isLoading, error } = useQuery({
    queryKey: ['subscription-check', userId, roomId, hostPartnerId, isAdmin],
    queryFn: async () => {
      // 구독자 전용방이 아니면 확인 불필요
      if (accessType !== 'subscriber') {
        return { isSubscribed: true, isChecking: false }
      }

      // 관리자는 구독 확인 불필요
      if (isAdmin) {
        return { isSubscribed: true, isChecking: false }
      }

      // 필수 파라미터 확인
      if (!userId || !roomId || !hostPartnerId) {
        return { isSubscribed: false, isChecking: false }
      }

      // Edge Function을 통해 구독 여부 확인 (RLS 우회)
      const response = await edgeApi.membershipSubscriptions.getMySubscriptions()

      if (!response.success) {
        throw new Error(response.error?.message || '구독 여부 확인에 실패했습니다')
      }

      // 사용자의 활성 구독 목록에서 해당 파트너의 멤버십 구독 확인
      const subscriptions = response.data || []
      const hasSubscription = subscriptions.some((sub: any) => 
        sub.status === 'active' && 
        sub.membership?.partner_id === hostPartnerId
      )

      return {
        isSubscribed: hasSubscription,
        isChecking: false,
      }
    },
    enabled,
    retry: false,
  })

  // 기본값 결정: 구독자 전용방이 아니면 true, 구독자 전용방이면 false (확인 전까지는 구독 안 된 것으로 간주)
  const defaultValue = accessType === 'subscriber' ? false : true
  
  return {
    isSubscribed: data?.isSubscribed ?? defaultValue,
    isChecking: isLoading,
    error: error instanceof Error ? error.message : null,
  }
}

