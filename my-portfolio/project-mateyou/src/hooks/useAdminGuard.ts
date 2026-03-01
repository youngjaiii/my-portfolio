import { globalToast } from '@/lib/toast'
import { useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useTimesheetRole } from './useTimesheetRole'

/**
 * 어드민 전용 접근 제어 훅
 * - 어드민 권한이 없으면 메인 페이지로 리다이렉트
 * - 로딩 중이 아닐 때만 체크 수행
 */
export function useAdminGuard() {
  const navigate = useNavigate()
  const { isAdmin, isLoading, role } = useTimesheetRole()

  useEffect(() => {
    if (!isLoading) {
      if (!isAdmin) {
        console.warn('🚫 Admin access denied. Current role:', role)
        globalToast.error('관리자 권한이 필요한 페이지입니다.')
        navigate({ to: '/' })
      }
    }
  }, [isAdmin, isLoading, navigate, role])

  return { isAdmin, isLoading }
}
