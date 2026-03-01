import { Navigate, createFileRoute } from '@tanstack/react-router'

interface MessagesSearch {
  partnerId?: string
  partnerName?: string
}

export const Route = createFileRoute('/messages' as const)({
  component: MessagesRedirect,
  validateSearch: (search: Record<string, unknown>): MessagesSearch => ({
    partnerId: typeof search.partnerId === 'string' ? search.partnerId : undefined,
    partnerName: typeof search.partnerName === 'string' ? search.partnerName : undefined,
  }),
})

function MessagesRedirect() {
  const { partnerId, partnerName } = Route.useSearch()

  return (
    <Navigate
      to="/chat"
      search={() => ({
        ...(partnerId ? { partnerId } : {}),
        ...(partnerName ? { partnerName } : {}),
      })}
      replace
    />
  )
}
