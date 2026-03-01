/**
 * useFollowHost - 스트리밍 방의 호스트 팔로우 상태 관리 훅
 * 기존 파트너 페이지(partners/$memberCode.tsx)의 팔로우 로직을 참고하여 구현
 */

import { useCallback, useEffect, useState } from 'react'
import { useAuthStore } from '@/store/useAuthStore'
import { useAuth } from '@/hooks/useAuth'
import { resolveAccessToken } from '@/utils/sessionToken'
import { supabase } from '@/lib/supabase'
import { useNavigate } from '@tanstack/react-router'

const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

interface UseFollowHostParams {
  hostPartnerId: string | null | undefined
  hostMemberId: string | null | undefined
}

interface UseFollowHostResult {
  isFollowing: boolean
  isLoading: boolean
  toggleFollow: () => Promise<void>
}

export function useFollowHost({
  hostPartnerId,
  hostMemberId,
}: UseFollowHostParams): UseFollowHostResult {
  const { user } = useAuth()
  const { syncSession } = useAuthStore()
  const navigate = useNavigate()
  
  const [isFollowing, setIsFollowing] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isCheckingFollowStatus, setIsCheckingFollowStatus] = useState(true)

  // 팔로우 상태 확인 - api-follow GET 엔드포인트 사용 (RLS 우회)
  useEffect(() => {
    if (!hostPartnerId || !user?.id) {
      setIsCheckingFollowStatus(false)
      return
    }

    let mounted = true

    const checkFollowStatus = async () => {
      try {
        // 세션에서 토큰 가져오기
        const session = await supabase.auth.getSession()
        const token = await resolveAccessToken({
          accessToken: session.data.session?.access_token,
          refreshToken: session.data.session?.refresh_token,
          syncSession,
        })

        if (!token) {
          if (mounted) {
            setIsFollowing(false)
            setIsCheckingFollowStatus(false)
          }
          return
        }

        // api-follow GET 호출 - 내가 팔로우한 파트너 목록 조회
        const response = await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/api-follow`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: SUPABASE_ANON_KEY,
          },
        })

        const result = await response.json()

        if (mounted) {
          if (response.ok && result.success && Array.isArray(result.data)) {
            // 팔로우한 파트너 목록에서 hostPartnerId가 있는지 확인
            const isFollowed = result.data.some((partner: { id: string }) => partner.id === hostPartnerId)
            setIsFollowing(isFollowed)
          } else {
            setIsFollowing(false)
          }
          setIsCheckingFollowStatus(false)
        }
      } catch (err) {
        console.error('팔로우 상태 확인 실패:', err)
        if (mounted) {
          setIsFollowing(false)
          setIsCheckingFollowStatus(false)
        }
      }
    }

    checkFollowStatus()

    return () => {
      mounted = false
    }
  }, [hostPartnerId, user?.id, syncSession])

  // 팔로우 토글
  const toggleFollow = useCallback(async () => {
    if (!hostPartnerId) {
      console.warn('호스트 파트너 ID가 없습니다.')
      return
    }

    if (!user) {
      navigate({ to: '/login' })
      return
    }

    // 자기 자신을 팔로우하려는 경우 방지
    if (hostMemberId === user.id) {
      return
    }

    const previous = isFollowing
    const next = !previous

    // 낙관적 업데이트
    setIsFollowing(next)
    setIsLoading(true)

    try {
      const session = await supabase.auth.getSession()
      const token = await resolveAccessToken({
        accessToken: session.data.session?.access_token,
        refreshToken: session.data.session?.refresh_token,
        syncSession,
      })

      if (!token) {
        throw new Error('로그인이 필요합니다.')
      }

      const response = await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/api-follow`, {
        method: next ? 'POST' : 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ partner_id: hostPartnerId }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || '팔로우 처리에 실패했습니다.')
      }
    } catch (error: any) {
      console.error('팔로우 처리 실패:', error)
      // 롤백
      setIsFollowing(previous)
    } finally {
      setIsLoading(false)
    }
  }, [hostPartnerId, hostMemberId, user, isFollowing, navigate, syncSession])

  return {
    isFollowing,
    isLoading: isLoading || isCheckingFollowStatus,
    toggleFollow,
  }
}

