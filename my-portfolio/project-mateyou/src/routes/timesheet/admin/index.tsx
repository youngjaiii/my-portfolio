import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

export const Route = createFileRoute('/timesheet/admin/')({
  component: AdminIndexRedirect,
})

function AdminIndexRedirect() {
  const navigate = useNavigate()

  useEffect(() => {
    // 기본적으로 stats 페이지로 리다이렉트 (히스토리 교체)
    navigate({ to: '/timesheet/admin/stats', replace: true })
  }, [navigate])

  return null
}
