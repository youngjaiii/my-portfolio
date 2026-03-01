import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/' as const)({
  beforeLoad: () => {
    throw redirect({
      to: '/dashboard/admin',
    })
  },
  component: () => null,
})
