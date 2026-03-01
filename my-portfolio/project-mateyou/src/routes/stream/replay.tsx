import { StreamCard, StreamCardSkeleton, StreamEmptyState } from '@/components/features/stream/StreamCard'
import { useStreamRooms } from '@/hooks/useStreamRooms'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Film } from 'lucide-react'
import { useState } from 'react'

export const Route = createFileRoute('/stream/replay')({
  component: RouteComponent,
})

type SortOption = 'latest' | 'viewers' | 'popular'

const sortOptions: { value: SortOption; label: string }[] = [
  { value: 'latest', label: '최신순' },
  { value: 'viewers', label: '조회수순' },
  { value: 'popular', label: '인기순' },
]

function RouteComponent() {
  const navigate = useNavigate()
  const [sortBy, setSortBy] = useState<SortOption>('latest')

  // 스트림 데이터 가져오기
  const { data: streams = [], isLoading, error } = useStreamRooms({ limit: 100 })

  // 다시보기(리플레이) 스트림 필터링
  const replayStreams = streams.filter((s) => s.streamType === 'review')

  // 정렬 적용
  const sortedStreams = [...replayStreams].sort((a, b) => {
    switch (sortBy) {
      case 'viewers':
      case 'popular':
        return b.viewerCount - a.viewerCount
      case 'latest':
      default:
        return new Date(b.whenStart).getTime() - new Date(a.whenStart).getTime()
    }
  })

  return (
    <div 
      className="min-h-screen bg-white"
      style={{
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 56px)',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)',
      }}
    >
      <div className="px-4">
        {/* 필터 및 정렬 */}
        <div className="flex items-center justify-between py-3 border-b border-gray-100">
          <span className="text-sm text-gray-500">
            {isLoading ? '로딩 중...' : `총 ${sortedStreams.length}개`}
          </span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="text-sm text-gray-600 bg-transparent border-none outline-none cursor-pointer"
          >
            {sortOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* 에러 상태 */}
        {error && (
          <div className="mt-4 p-3 bg-red-50 text-red-600 text-sm rounded-lg">
            영상을 불러오는데 문제가 발생했습니다.
          </div>
        )}

        {/* 스트림 그리드 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-4">
          {isLoading ? (
            Array.from({ length: 8 }).map((_, idx) => <StreamCardSkeleton key={`skeleton-${idx}`} />)
          ) : sortedStreams.length > 0 ? (
            sortedStreams.map((stream) => (
              <StreamCard
                key={stream.id}
                stream={stream}
                onClick={() => navigate({ to: '/stream/video/$roomId', params: { roomId: stream.id } })}
              />
            ))
          ) : (
            <StreamEmptyState
              message="다시보기 콘텐츠가 없습니다"
              icon={<Film className="w-12 h-12 mb-3 opacity-50 text-emerald-300" />}
            />
          )}
        </div>
      </div>
    </div>
  )
}
