import { createFileRoute, Outlet, useMatches } from '@tanstack/react-router'
import { PartnerDashboard } from '@/components'

export const Route = createFileRoute('/dashboard/partner')({
  component: PartnerDashboardPage,
})

function PartnerDashboardPage() {
  const matches = useMatches()
  
  // 중첩 라우트 확인 (예: /dashboard/partner/inventory/roulette)
  const lastMatch = matches[matches.length - 1]
  const isNestedRouteActive = lastMatch?.routeId && lastMatch.routeId !== Route.id

  // 중첩 라우트가 활성화된 경우 Outlet 렌더링
  if (isNestedRouteActive) {
    return (
      <div className="min-h-screen">
        <Outlet />
      </div>
    )
  }

  // 기본 파트너 대시보드 렌더링
  return <PartnerDashboard />
}
