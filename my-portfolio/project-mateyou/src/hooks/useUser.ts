import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import type { Database } from '@/types/database'
import { supabase } from '@/lib/supabase'
import { mateYouApi } from '@/lib/apiClient'
import { useAuthStore } from '@/store/useAuthStore'

type User = Database['public']['Tables']['members']['Row'] & {
  username?: string
  email?: string
  avatar?: string
  points?: { total: number }
}

export function useUser() {
  const queryClient = useQueryClient()
  const { user: authUser } = useAuthStore()

  const {
    data: user,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['user', authUser?.id],
    queryFn: async (): Promise<User | null> => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      // AuthStore에서 사용자 정보가 있다면 해당 ID 사용
      const userId = authUser?.id || session?.user?.id

      if (!userId) {
        return null
      }

      try {
        // API를 통해 사용자 정보 조회
        const response = await mateYouApi.auth.getMe()

        // 응답 형식 처리
        let userData: any
        if (response.data.success && response.data.data) {
          userData = response.data.data
        } else if (response.data.id || response.data.name) {
          userData = response.data
        } else {
          return null
        }

        const finalUser = {
          ...userData,
          username: userData.name || userData.member_code || 'Unknown',
          email: session?.user?.email || authUser?.email || '',
          avatar: userData.profile_image,
        }

        return finalUser
      } catch (error: any) {
        console.error('Failed to fetch user data:', error)
        
        // 인증 관련 에러인 경우 로그아웃 처리
        const status = error?.response?.status || error?.status
        const errorMessage = error?.response?.data?.error?.message || error?.message || ''
        
        if (status === 401 || status === 403 || errorMessage.includes('Unauthorized') || errorMessage.includes('Authentication')) {
          console.warn('🚪 [useUser] 인증 에러 감지, 자동 로그아웃 처리:', {
            status,
            message: errorMessage
          })
          
          // 비동기로 로그아웃 처리 (에러를 throw하지 않고 null 반환)
          setTimeout(async () => {
            try {
              const { globalToast } = await import('@/lib/toast')
              globalToast.warning('세션이 만료되어서 다시 로그인해주세요', 5000)
              await useAuthStore.getState().logout()
              queryClient.setQueryData(['user'], null)
            } catch (logoutError) {
              console.error('❌ [useUser] 자동 로그아웃 중 에러:', logoutError)
            }
          }, 0)
        }
        
        return null
      }
    },
    staleTime: 1000 * 30, // 30초 후 stale 처리
    retry: 1,
    enabled: !!authUser?.id || !!useAuthStore.getState().isAuthenticated, // authStore에 사용자가 있을 때만 실행
  })

  // 에러 발생 시 로그아웃 처리
  useEffect(() => {
    if (error) {
      const errorAny = error as any
      const status = errorAny?.response?.status || errorAny?.status
      const errorMessage = errorAny?.response?.data?.error?.message || errorAny?.message || ''
      
      // 인증 관련 에러인 경우
      if (status === 401 || status === 403 || errorMessage.includes('Unauthorized') || errorMessage.includes('Authentication')) {
        console.warn('🚪 [useUser] useEffect에서 인증 에러 감지, 자동 로그아웃 처리:', {
          status,
          message: errorMessage
        })
        
        // 로그아웃 처리
        const handleLogout = async () => {
          try {
            const { globalToast } = await import('@/lib/toast')
            globalToast.warning('세션이 만료되어서 다시 로그인해주세요', 5000)
            await useAuthStore.getState().logout()
            queryClient.setQueryData(['user'], null)
          } catch (logoutError) {
            console.error('❌ [useUser] useEffect 자동 로그아웃 중 에러:', logoutError)
          }
        }
        
        handleLogout()
      }
    }
  }, [error, queryClient])

  const updateUserPointsMutation = useMutation({
    mutationFn: async (newPoints: number) => {
      if (!user) throw new Error('User not found')

      const response = await mateYouApi.members.logPoints({
        points: newPoints - (user.total_points || 0),
        reason: 'Points updated',
        reference_type: 'manual_update',
        reference_id: user.id,
      })

      if (!response.data.success) {
        throw new Error(response.data.error?.message || 'Failed to update points')
      }

      return newPoints
    },
    onSuccess: (newPoints) => {
      // 캐시 업데이트
      queryClient.setQueryData(['user'], (oldUser: User | null) => {
        if (!oldUser) return null
        return { ...oldUser, total_points: newPoints }
      })
    },
  })

  const refreshUser = () => {
    return refetch()
  }

  const invalidateUser = () => {
    queryClient.invalidateQueries({ queryKey: ['user'] })
  }

  const clearUser = () => {
    queryClient.setQueryData(['user'], null)
  }

  const updateUserPoints = (newPoints: number) => {
    updateUserPointsMutation.mutate(newPoints)
  }

  return {
    user,
    isLoading,
    error,
    refreshUser,
    invalidateUser,
    clearUser,
    updateUserPoints,
    isUpdatingPoints: updateUserPointsMutation.isPending,
  }
}
