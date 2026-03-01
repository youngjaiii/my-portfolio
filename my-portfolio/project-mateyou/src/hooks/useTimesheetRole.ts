import { getTimesheetRole, type TimesheetRoleType } from '@/lib/timesheetApi'
import { useAuthStore } from '@/store/useAuthStore'
import { useEffect, useRef, useState } from 'react'

export type TimesheetUserRole = TimesheetRoleType | 'admin' | null

// 캐시된 role 저장 (컴포넌트 재마운트 시에도 유지)
const roleCache: { userId: string | null; role: TimesheetUserRole } = {
  userId: null,
  role: null,
}

export function useTimesheetRole() {
  const { user } = useAuthStore()
  
  // 캐시된 값이 있고 같은 유저면 캐시 사용
  const initialRole = (roleCache.userId === user?.id && roleCache.role !== null) 
    ? roleCache.role 
    : null
  const initialLoading = !(roleCache.userId === user?.id && roleCache.role !== null)
  
  const [role, setRole] = useState<TimesheetUserRole>(initialRole)
  const [isLoading, setIsLoading] = useState(initialLoading)
  const fetchedRef = useRef<string | null>(null)

  useEffect(() => {
    async function fetchRole() {
      if (!user?.id) {
        setRole(null)
        setIsLoading(false)
        roleCache.userId = null
        roleCache.role = null
        return
      }

      // 이미 같은 유저의 role을 가져왔으면 스킵
      if (fetchedRef.current === user.id && role !== null) {
        setIsLoading(false)
        return
      }

      // 캐시된 값이 있으면 로딩 없이 바로 사용
      if (roleCache.userId === user.id && roleCache.role !== null) {
        setRole(roleCache.role)
        setIsLoading(false)
        fetchedRef.current = user.id
        return
      }

      // 모든 사용자가 timesheet 역할을 가질 수 있음 (매니저는 파트너가 아니어도 가능)
      try {
        const userRole = await getTimesheetRole(user.id)
        setRole(userRole)
        roleCache.userId = user.id
        roleCache.role = userRole
        fetchedRef.current = user.id
      } catch (error) {
        console.error('❌ useTimesheetRole error:', error)
        setRole(null)
      } finally {
        setIsLoading(false)
      }
    }

    fetchRole()
  }, [user?.id, user?.role])

  return {
    role,
    isLoading,
    isAdmin: role === 'admin',
    isPartnerManager: role === 'partner_manager',
    isPartnerPlus: role === 'partner_plus',
    hasAccess: role !== null, // admin, partner_manager, partner_plus 모두 접근 가능
  }
}

