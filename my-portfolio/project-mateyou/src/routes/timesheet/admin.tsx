import { LoadingSpinner } from '@/components'
import { useTimesheetRole } from '@/hooks/useTimesheetRole'
import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

export const Route = createFileRoute('/timesheet/admin')({
  component: AdminLayout,
})

function AdminLayout() {
  const navigate = useNavigate()
  const { isAdmin, isPartnerManager, isLoading: roleLoading } = useTimesheetRole()

  // admin 또는 파트너 매니저만 접근 가능
  const hasAccess = isAdmin || isPartnerManager

  useEffect(() => {
    if (roleLoading) return

    if (!hasAccess) {
      navigate({ to: '/timesheet', replace: true })
    }
  }, [hasAccess, roleLoading, navigate])

  if (roleLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
        <LoadingSpinner />
      </div>
    )
  }

  if (!hasAccess) {
    return null
  }

  return <Outlet />
}
