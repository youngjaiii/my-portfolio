import { useRef, useEffect, useCallback } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { FeedPost } from '@/hooks/useFeedInfinite'

interface VirtualizedFeedProps {
  posts: FeedPost[]
  hasNextPage: boolean
  isFetchingNextPage: boolean
  fetchNextPage: () => void
  renderPost: (post: FeedPost, index: number) => React.ReactNode
  estimateSize?: number
  overscan?: number
}

export function VirtualizedFeed({
  posts,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  renderPost,
  estimateSize = 600,
  overscan = 3,
}: VirtualizedFeedProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: posts.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  })

  const virtualItems = virtualizer.getVirtualItems()

  // 무한 스크롤 트리거
  const lastItemIndex = virtualItems[virtualItems.length - 1]?.index
  
  useEffect(() => {
    if (
      lastItemIndex !== undefined &&
      lastItemIndex >= posts.length - 3 &&
      hasNextPage &&
      !isFetchingNextPage
    ) {
      fetchNextPage()
    }
  }, [lastItemIndex, posts.length, hasNextPage, isFetchingNextPage, fetchNextPage])

  return (
    <div
      ref={parentRef}
      className="h-full w-full overflow-auto"
      style={{ contain: 'strict' }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualItems.map((virtualRow) => {
          const post = posts[virtualRow.index]
          if (!post) return null

          return (
            <div
              key={post.id}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {renderPost(post, virtualRow.index)}
            </div>
          )
        })}
      </div>

      {isFetchingNextPage && (
        <div className="flex justify-center py-4">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
        </div>
      )}
    </div>
  )
}

export default VirtualizedFeed

