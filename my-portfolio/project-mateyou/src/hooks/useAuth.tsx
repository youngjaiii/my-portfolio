import { useEffect } from 'react'
import { useAuthStore } from '@/store/useAuthStore'
import { useUser } from '@/hooks/useUser'
import { useMemberPoints } from '@/hooks/useMemberPoints'

// 기존 컴포넌트들과의 호환성을 위한 wrapper
export function useAuth() {
  const {
    user: authStoreUser,
    isLoading: authLoading,
    isAuthenticated,
    login,
    loginWithDiscord,
    loginWithTwitter,
    loginWithGoogle,
    loginWithApple,
    signup,
    logout: logoutStore,
    initialize,
    refreshUser: refreshAuthStoreUser,
  } = useAuthStore()

  const {
    user: reactQueryUser,
    isLoading: userLoading,
    error: userError,
    updateUserPoints,
    refreshUser: refreshReactQueryUser,
    clearUser,
    invalidateUser,
  } = useUser()

  const {
    totalPoints,
    isLoading: pointsLoading,
    refetch: refetchPoints,
  } = useMemberPoints(reactQueryUser?.id || '')

  // 실제 DB 데이터(reactQueryUser)를 우선 사용, 없을 때만 authStore 사용
  const user = reactQueryUser
    ? { ...reactQueryUser, total_points: totalPoints }
    : authStoreUser

  // userError가 있고 인증 관련 에러인 경우 추가 로그아웃 처리 (이중 안전장치)
  useEffect(() => {
    if (userError && isAuthenticated) {
      const errorAny = userError as any
      const status = errorAny?.response?.status || errorAny?.status
      const errorMessage = errorAny?.response?.data?.error?.message || errorAny?.message || ''
      
      // 인증 관련 에러이고 아직 로그인 상태로 남아있는 경우
      if (status === 401 || status === 403 || errorMessage.includes('Unauthorized') || errorMessage.includes('Authentication')) {
        console.warn('🚪 [useAuth] 인증 에러 감지, 자동 로그아웃 처리:', {
          status,
          message: errorMessage,
          hasAuthStoreUser: !!authStoreUser,
          hasReactQueryUser: !!reactQueryUser
        })
        
        // 로그아웃 처리
        const handleLogout = async () => {
          try {
            await logoutStore()
            clearUser()
            invalidateUser()
          } catch (logoutError) {
            console.error('❌ [useAuth] 자동 로그아웃 중 에러:', logoutError)
          }
        }
        
        handleLogout()
      }
    }
  }, [userError, isAuthenticated, authStoreUser, reactQueryUser, logoutStore, clearUser, invalidateUser])

  // 통합된 refreshUser 함수
  const refreshUser = async () => {
    try {
      // authStore와 reactQuery 둘 다 새로고침
      await Promise.all([refreshAuthStoreUser(), refreshReactQueryUser()])
    } catch (error) {
      console.error('❌ useAuth: refreshUser 실패:', error)
    }
  }

  const logout = async () => {
    await logoutStore()
    clearUser()
    invalidateUser()
  }

  return {
    user,
    isLoading: authLoading || userLoading || pointsLoading,
    isAuthenticated,
    login,
    loginWithDiscord,
    loginWithTwitter,
    loginWithGoogle,
    loginWithApple,
    signup,
    logout,
    updateUserPoints,
    refreshUser,
    initialize,
    refetchPoints,
  }
}

// AuthProvider는 더 이상 필요하지 않지만 기존 코드와의 호환성을 위해 유지
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
