type PendingTransition =
  | {
      direction: number
      path: string
      type: 'tab'
    }
  | null

let pendingTransition: PendingTransition = null

export function setPendingTransitionIntent(path: string, direction: number) {
  pendingTransition = {
    path,
    direction,
    type: 'tab',
  }
}

export function consumePendingTransitionIntent(): PendingTransition {
  const intent = pendingTransition
  pendingTransition = null
  return intent
}

export function peekPendingTransitionIntent(): PendingTransition {
  return pendingTransition
}

