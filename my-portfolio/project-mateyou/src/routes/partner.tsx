import { createFileRoute } from '@tanstack/react-router'
import { PartnerDashboard } from '@/components'

export const Route = createFileRoute('/partner')({
  component: PartnerPage,
})

function PartnerPage() {
  return <PartnerDashboard />
}
