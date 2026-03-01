import { StreamCard, StreamCardSkeleton, StreamEmptyState } from '@/components/features/stream/StreamCard'
import { StreamFAB } from '@/components/features/stream/StreamFAB'
import { CreateStreamSheet } from '@/components/modals/CreateStreamSheet'
import { useAuth } from '@/hooks/useAuth'
import { useStreamRooms } from '@/hooks/useStreamRooms'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { ChevronRight, Mic, PlayCircle, Radio, Settings, Video } from 'lucide-react'
import { useState } from 'react'

export const Route = createFileRoute('/stream/')({
  component: RouteComponent,
})

function RouteComponent() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [showCreateSheet, setShowCreateSheet] = useState(false)
  const [initialStreamType, setInitialStreamType] = useState<'audio' | 'video'>('audio')
  const [isMobileLiveMode, setIsMobileLiveMode] = useState(false)
  
  // DB에서 스트림 데이터 가져오기
  const { data: streams = [], isLoading, error } = useStreamRooms({ limit: 50 })
  
  // 파트너인지 확인
  const isPartner = user?.role === 'partner'
  
  // 스트림 타입별로 필터링
  const liveStreams = streams.filter(s => s.streamType === 'live')
  const radioStreams = streams.filter(s => s.streamType === 'radio')

  // FAB에서 방송 시작 시트 열기
  const handleOpenCreateSheet = (streamType: 'audio' | 'video' = 'audio', mobileMode = false) => {
    setInitialStreamType(streamType)
    setIsMobileLiveMode(mobileMode)
    setShowCreateSheet(true)
  }
 
  return (
    <div className="flex flex-col overflow-x-hidden bg-gradient-to-b from-slate-50 to-white text-[#110f1a] min-h-screen">
      <div 
        className="container mx-auto max-w-5xl px-4 py-4 sm:px-6 lg:px-8 pb-24"
        style={{ 
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 72px)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)'
        }}
      >
        {/* 빠른 시작 섹션 (파트너만) */}
        {isPartner && (
          <section className="mb-6">
            <h2 className="text-sm font-semibold text-gray-500 mb-3">빠른 시작</h2>
            <div className="grid grid-cols-2 gap-3">
              {/* 보이스 시작 */}
              <button
                onClick={() => handleOpenCreateSheet('audio')}
                className="flex items-center gap-3 p-4 bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl text-white shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                  <Mic className="w-6 h-6" />
                </div>
                <div className="text-left flex-1">
                  <p className="font-bold text-base">보이스</p>
                  <p className="text-xs text-white/80">음성 방송 시작</p>
                </div>
              </button>

              {/* 라이브 시작 */}
              <button
                onClick={() => handleOpenCreateSheet('video', true)}
                className="flex items-center gap-3 p-4 bg-gradient-to-br from-pink-500 to-red-500 rounded-2xl text-white shadow-lg hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                  <Video className="w-6 h-6" />
                </div>
                <div className="text-left flex-1">
                  <p className="font-bold text-base">라이브</p>
                  <p className="text-xs text-white/80">영상 방송 시작</p>
                </div>
              </button>
            </div>

            {/* 방송 관리 버튼 */}
            <button
              onClick={() => navigate({ to: '/dashboard/partner', search: { tab: 'stream' } })}
              className="w-full flex items-center gap-3 p-4 mt-3 bg-gradient-to-br from-slate-600 to-slate-700 rounded-2xl text-white shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all"
            >
              <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                <Settings className="w-6 h-6" />
              </div>
              <div className="text-left flex-1">
                <p className="font-bold text-base">방송 관리</p>
                <p className="text-xs text-white/80">스트림 키, 룰렛, 통계</p>
              </div>
              <ChevronRight className="w-5 h-5 text-white/60" />
            </button>
          </section>
        )}

        {/* 에러 상태 */}
        {error && (
          <div className="p-4 mb-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            스트림을 불러오는데 문제가 발생했습니다. 잠시 후 다시 시도해주세요.
          </div>
        )}

        {/* 라이브 스트림 섹션 */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <h2 className="text-base font-bold text-[#110f1a]">라이브 중</h2>
              <span className="text-sm text-gray-400">
                {isLoading ? '' : `${liveStreams.length}개`}
              </span>
            </div>
            <Link 
              to="/stream/live" 
              className="flex items-center gap-1 text-sm text-purple-600 hover:text-purple-700 font-medium transition-colors"
            >
              전체보기
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, idx) => (
                <StreamCardSkeleton key={`live-skeleton-${idx}`} />
              ))
            ) : liveStreams.length > 0 ? (
              liveStreams.slice(0, 4).map((stream) => (
                <StreamCard 
                  key={stream.id} 
                  stream={stream}
                  onClick={() => navigate({ to: '/stream/video/$roomId', params: { roomId: stream.id } })}
                />
              ))
            ) : (
              <div className="col-span-full">
                <StreamEmptyState 
                  message="현재 진행 중인 라이브가 없습니다" 
                  icon={<PlayCircle className="w-12 h-12 mb-3 opacity-50 text-red-300" />} 
                />
              </div>
            )}
          </div>
        </section>

        {/* 보이스(오디오) 섹션 */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
              <h2 className="text-base font-bold text-[#110f1a]">보이스</h2>
              <span className="text-sm text-gray-400">
                {isLoading ? '' : `${radioStreams.length}개`}
              </span>
            </div>
            <Link 
              to="/stream/voice" 
              className="flex items-center gap-1 text-sm text-purple-600 hover:text-purple-700 font-medium transition-colors"
            >
              전체보기
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, idx) => (
                <StreamCardSkeleton key={`radio-skeleton-${idx}`} />
              ))
            ) : radioStreams.length > 0 ? (
              radioStreams.slice(0, 4).map((stream) => (
                <StreamCard 
                  key={stream.id} 
                  stream={stream}
                  onClick={() => navigate({ to: '/stream/chat/$roomId', params: { roomId: stream.id } })}
                />
              ))
            ) : (
              <div className="col-span-full">
                <StreamEmptyState 
                  message="현재 진행 중인 보이스 방송이 없습니다" 
                  icon={<Radio className="w-12 h-12 mb-3 opacity-50 text-purple-300" />} 
                />
              </div>
            )}
          </div>
        </section>
      </div>

      {/* 방송 시작 FAB */}
      <StreamFAB onOpenCreateSheet={handleOpenCreateSheet} />

      {/* 방송 생성 시트 */}
      <CreateStreamSheet
        isOpen={showCreateSheet}
        onClose={() => setShowCreateSheet(false)}
        initialStreamType={initialStreamType}
        isMobileLiveMode={isMobileLiveMode}
      />
    </div>
  )
}
