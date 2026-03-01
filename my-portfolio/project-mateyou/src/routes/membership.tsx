import { createFileRoute } from '@tanstack/react-router'
import { FeedScreen } from './feed/all'

function MembershipFeedRoute() {
  return <FeedScreen mode={{ type: 'subscription' }} tab="home" />
}

export const Route = createFileRoute('/membership' as const)({
  component: MembershipFeedRoute,
})

