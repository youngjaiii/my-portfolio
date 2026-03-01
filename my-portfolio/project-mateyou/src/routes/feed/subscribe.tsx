import { createFileRoute } from '@tanstack/react-router'
import { FeedScreen } from './all'

function FeedSubscribeRoute() {
  return <FeedScreen mode={{ type: 'subscription' }} tab="home" />
}

export const Route = createFileRoute('/feed/subscribe' as const)({
  component: FeedSubscribeRoute,
})
