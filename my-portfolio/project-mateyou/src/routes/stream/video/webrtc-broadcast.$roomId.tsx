/**
 * WebRTC 모바일 방송 페이지
 * 모바일 웹 브라우저에서 카메라로 직접 방송 송출
 * 기존 방송 페이지와 동일한 UI/UX 제공
 */

import { WebRTCBroadcast } from '@/components/features/stream/WebRTCBroadcast'
import { ChatPanel } from '@/components/features/stream/ChatPanel'
import { StreamHudControls } from '@/components/features/stream/StreamHudControls'
import { StreamHudGuideSheet } from '@/components/features/stream/StreamHudGuideSheet'
import {
  DonationControlCenter,
  MissionListBar,
} from '@/components/features/stream/donation'
import type { StreamDonation } from '@/components/features/stream/donation/types'
import { DonationEffectOverlay } from '@/components/features/stream/DonationEffectOverlay'
import { DonationRankingTicker } from '@/components/features/stream/DonationRankingTicker'
import { RouletteOverlay } from '@/components/features/stream/roulette'
import { StreamRoomSidebar } from '@/components/features/stream/sidebar'
import { VideoDonationPlayer } from '@/components/features/stream/VideoDonationPlayer'
import { StreamSettingsSheet } from '@/components/modals'
import { Button } from '@/components/ui/Button'
import { Typography } from '@/components/ui/Typography'
import { useAuth } from '@/hooks/useAuth'
import { useDonationQueue } from '@/hooks/useDonationQueue'
import { usePinChat } from '@/hooks/usePinChat'
import { useStreamDonations } from '@/hooks/useStreamDonations'
import { useStreamModeration } from '@/hooks/useStreamModeration'
import { useVideoDonationPlayer } from '@/hooks/useVideoDonationPlayer'
import { useVoiceRoom } from '@/hooks/useVoiceRoom'
import { useFanRanking } from '@/hooks/useFanRanking'
import { edgeApi } from '@/lib/edgeApi'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  Gift,
  Loader2,
  MessageCircle,
  Settings,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'

export const Route = createFileRoute('/stream/video/webrtc-broadcast/$roomId')({
  component: WebRTCBroadcastPage,
})

function WebRTCBroadcastPage() {
  const { roomId } = Route.useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const chatContainerRef = useRef<HTMLDivElement>(null)

  // 방 정보 조회
  const { 
    room, 
    hosts, 
    viewers, 
    chats, 
    isLoading: isRoomLoading, 
    isHost, 
    isAdmin,
    joinRoom,
  } = useVoiceRoom(roomId)

  // 방송 상태
  const [isBroadcasting, setIsBroadcasting] = useState(false)
  const [hasJoined, setHasJoined] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [isHudHidden, setIsHudHidden] = useState(false)
  const [isHudGuideOpen, setIsHudGuideOpen] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isDonationListOpen, setIsDonationListOpen] = useState(false)

  // 모더레이션 훅
  const { hideMessage, unhideMessage } = useStreamModeration(roomId)
  const { togglePin } = usePinChat()

  // 후원 관련 훅
  const { 
    rankings, 
    activeEffects,
    currentRoulette,
    rouletteQueueLength,
    skipCurrentRoulette,
  } = useStreamDonations({ roomId, enableRealtime: true, enableRoulette: true })

  // 호스트용 후원 통계
  const { stats: donationStats } = useDonationQueue({
    roomId,
    enabled: isHost,
    enableRealtime: true,
  })

  // 영상 도네이션 플레이어
  const {
    currentVideo,
    playVideo,
    stopVideo,
    remainingTime,
  } = useVideoDonationPlayer({ roomId, enabled: true })

  // 팬 랭킹
  const { rankMap } = useFanRanking({ 
    partnerId: room?.host_partner_id || null,
    enabled: !!room?.host_partner_id,
  })

  // 고정된 메시지
  const pinnedMessage = useMemo(() => {
    return chats.find(chat => chat.is_pinned && !chat.is_hidden) || null
  }, [chats])

  // 채팅 필터링
  const filteredChats = useMemo(() => {
    let filtered = isHost || isAdmin 
      ? chats 
      : chats.filter(chat => !chat.is_hidden)
    
    if (pinnedMessage) {
      filtered = filtered.filter(chat => chat.id !== pinnedMessage.id)
    }
    
    return filtered
  }, [chats, isHost, isAdmin, pinnedMessage])

  // 발신자 역할 확인
  const getSenderRole = (senderId: string): 'owner' | 'speaker' | 'listener' => {
    const host = hosts.find(h => 
      h.member_id === senderId || h.partner?.member?.id === senderId
    )
    if (!host) return 'listener'
    return host.role === 'owner' ? 'owner' : 'speaker'
  }

  // 채팅 숨기기/해제
  const handleChatHideToggle = async (messageId: number, isHidden: boolean) => {
    try {
      if (isHidden) {
        await unhideMessage.mutateAsync({ roomId, messageId })
        toast.success('채팅 숨기기가 해제되었습니다')
      } else {
        await hideMessage.mutateAsync({ roomId, messageId })
        toast.success('채팅이 숨겨졌습니다')
      }
    } catch (err) {
      toast.error('채팅 처리에 실패했습니다')
    }
  }

  // 고정 해제
  const handleUnpinMessage = async () => {
    if (!pinnedMessage) return
    try {
      await togglePin.mutateAsync({ messageId: pinnedMessage.id, roomId })
      toast.success('고정이 해제되었습니다')
    } catch (err) {
      toast.error('고정 해제에 실패했습니다')
    }
  }

  // 방 입장 (호스트로)
  useEffect(() => {
    if (!room || hasJoined || !user || !isHost) return

    const autoJoin = async () => {
      try {
        await joinRoom(room.password || undefined)
        setHasJoined(true)
      } catch (err) {
        console.error('방 입장 실패:', err)
        toast.error('방 입장에 실패했습니다')
      }
    }

    autoJoin()
  }, [room, hasJoined, user, isHost, joinRoom])

  // 사이드바 이벤트 리스너
  useEffect(() => {
    const handleOpenSidebar = () => setShowSidebar(true)
    window.addEventListener('openVideoRoomSidebar', handleOpenSidebar)
    return () => window.removeEventListener('openVideoRoomSidebar', handleOpenSidebar)
  }, [])

  // 방송 시작 콜백
  const handleBroadcastStart = async () => {
    try {
      const response = await edgeApi.stream.startBroadcast(roomId)
      if (!response.success) {
        throw new Error(response.error?.message || '방송 시작에 실패했습니다')
      }
      
      setIsBroadcasting(true)
      queryClient.invalidateQueries({ queryKey: ['voice-room', roomId] })
      toast.success('방송이 시작되었습니다!')
    } catch (error: any) {
      toast.error(error.message || '방송 시작에 실패했습니다')
    }
  }

  // 방송 종료 콜백
  const handleBroadcastStop = async () => {
    try {
      const response = await edgeApi.stream.endRoom(roomId)
      if (!response.success) {
        throw new Error(response.error?.message || '방송 종료에 실패했습니다')
      }
      
      setIsBroadcasting(false)
      queryClient.invalidateQueries({ queryKey: ['voice-room', roomId] })
      toast.success('방송이 종료되었습니다')
      navigate({ to: '/stream/live' })
    } catch (error: any) {
      toast.error(error.message || '방송 종료에 실패했습니다')
    }
  }

  // 방송 취소
  const cancelBroadcast = useMutation({
    mutationFn: async () => {
      const response = await edgeApi.stream.endRoom(roomId)
      if (!response.success) {
        throw new Error(response.error?.message || '방송 취소에 실패했습니다')
      }
      return response.data
    },
    onSuccess: () => {
      toast.success('방송이 취소되었습니다')
      navigate({ to: '/stream/live' })
    },
  })

  // 로딩 상태
  if (isRoomLoading) {
    return (
      <div className="min-h-screen bg-[#110f1a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-pink-500 animate-spin" />
      </div>
    )
  }

  // 방이 없는 경우
  if (!room) {
    return (
      <div className="min-h-screen bg-[#110f1a] flex flex-col items-center justify-center text-white">
        <Typography variant="h4">방을 찾을 수 없습니다</Typography>
        <Button className="mt-4" onClick={() => navigate({ to: '/stream/live' })}>
          방송 목록으로
        </Button>
      </div>
    )
  }

  // 호스트가 아닌 경우
  if (!isHost) {
    return (
      <div className="min-h-screen bg-[#110f1a] flex flex-col items-center justify-center text-white">
        <Typography variant="h4">호스트만 접근할 수 있습니다</Typography>
        <Button className="mt-4" onClick={() => navigate({ to: '/stream/video/$roomId', params: { roomId } })}>
          시청자로 입장
        </Button>
      </div>
    )
  }

  return (
    <div className="relative w-full h-screen bg-[#110f1a] overflow-hidden">
      {/* 사이드바 */}
      <StreamRoomSidebar
        isOpen={showSidebar}
        onClose={() => setShowSidebar(false)}
        roomId={roomId}
        roomTitle={room.title}
        hosts={hosts}
        viewers={viewers}
        isAdmin={isAdmin}
        isHost={isHost}
        roomType="video"
        hostPartnerId={room.host_partner_id}
        hostMemberId={room.host_member_id}
      />

      {/* ===== 1. WebRTC 비디오 - 전체 화면 ===== */}
      <div className="absolute inset-0 bg-[#110f1a]">
        <WebRTCBroadcast
          roomId={roomId}
          className="w-full h-full"
          onBroadcastStart={handleBroadcastStart}
          onBroadcastStop={handleBroadcastStop}
        />
      </div>

      {/* ===== 2. 오버레이들 ===== */}
      <div className="absolute inset-0 pointer-events-none">
        {/* 후원 이펙트 오버레이 */}
        <div className="pointer-events-auto">
          <DonationEffectOverlay effects={activeEffects} />
        </div>

        {/* 룰렛 오버레이 */}
        <div className="pointer-events-auto">
          <RouletteOverlay
            roulette={currentRoulette}
            queueLength={rouletteQueueLength}
            isHost={isHost}
            onSkip={skipCurrentRoulette}
          />
        </div>

        {/* 영상 도네이션 플레이어 */}
        {currentVideo && (
          <div className="pointer-events-auto">
            <VideoDonationPlayer
              video={currentVideo}
              remainingTime={remainingTime}
              onClose={stopVideo}
              isHost={isHost}
            />
          </div>
        )}

        {/* 채팅 오버레이 (방송 중 + HUD 표시 상태에서만) */}
        {isBroadcasting && !isHudHidden && (
          <div
            className="absolute left-0 right-0 z-40 bg-gradient-to-t from-black/70 to-transparent pointer-events-auto"
            style={{ bottom: 'calc(72px + env(safe-area-inset-bottom, 0px))' }}
          >
            <div className="flex items-center justify-end px-4 py-2">
              <button
                onClick={() => setShowChat(prev => !prev)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-full backdrop-blur-sm transition-colors ${
                  showChat 
                    ? 'bg-purple-500/80 hover:bg-purple-500' 
                    : 'bg-black/50 hover:bg-black/70'
                } text-white`}
              >
                <MessageCircle className="w-4 h-4" />
                <span className="text-xs font-medium">{showChat ? '채팅 닫기' : '채팅'}</span>
                <span className="px-1.5 py-0.5 text-[10px] bg-white/15 rounded-full">
                  {chats.length}
                </span>
              </button>
            </div>

            <ChatPanel
              roomId={roomId}
              filteredChats={filteredChats}
              pinnedMessage={pinnedMessage}
              isChatOpen={showChat}
              isHost={isHost}
              isModeratorView={isHost || isAdmin}
              rankMap={rankMap}
              chatContainerRef={chatContainerRef}
              getSenderRole={getSenderRole}
              onHideToggle={handleChatHideToggle}
              onUnpinMessage={handleUnpinMessage}
              onOpenDonationList={() => setIsDonationListOpen(true)}
              variant="mobile"
            />
          </div>
        )}
      </div>

      {/* ===== 3. 상단 헤더 ===== */}
      {isHudHidden && (
        <StreamHudControls
          isHudHidden={isHudHidden}
          onToggleHud={() => setIsHudHidden(prev => !prev)}
          onOpenGuide={() => setIsHudGuideOpen(true)}
          className="absolute top-4 right-4 z-50"
        />
      )}

      {!isHudHidden && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-gradient-to-b from-[#110f1a] to-transparent">
          <div className="flex items-center justify-between px-4 h-14">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  if (isBroadcasting) {
                    toast.error('방송 중에는 나갈 수 없습니다. 먼저 방송을 종료해주세요.')
                    return
                  }
                  navigate({ to: '/stream/live' })
                }}
                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <div>
                <h1 className="font-bold text-white text-sm line-clamp-1">{room.title}</h1>
                <div className="flex items-center gap-2">
                  {isBroadcasting && (
                    <span className="flex items-center gap-1 text-xs">
                      <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span className="text-red-400">LIVE</span>
                    </span>
                  )}
                  <span className="text-xs text-white/60">
                    {isBroadcasting ? '방송 중' : '방송 준비'}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <StreamHudControls
                isHudHidden={isHudHidden}
                onToggleHud={() => setIsHudHidden(prev => !prev)}
                onOpenGuide={() => setIsHudGuideOpen(true)}
              />

              {/* 시청자 관리 */}
              <button
                onClick={() => setShowSidebar(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 rounded-full text-white hover:bg-white/20 transition-colors"
              >
                <Users className="w-4 h-4" />
                <span className="text-xs">{viewers.length}</span>
              </button>

              {/* 방송 설정 */}
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
              >
                <Settings className="w-4 h-4 text-white" />
              </button>

              {/* 후원 관리 */}
              <button
                onClick={() => setIsDonationListOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500/80 to-orange-500/80 rounded-full text-white hover:from-amber-500 hover:to-orange-500 transition-colors"
              >
                <Gift className="w-4 h-4" />
                <span className="text-xs">후원</span>
                {(donationStats.pendingCount > 0 || donationStats.acceptedMissionCount > 0) && (
                  <span className="px-1.5 py-0.5 text-[10px] bg-white/30 rounded-full min-w-[16px] text-center font-bold">
                    {donationStats.pendingCount + donationStats.acceptedMissionCount}
                  </span>
                )}
              </button>

              {/* 방송 취소 (방송 시작 전) */}
              {!isBroadcasting && (
                <button
                  onClick={() => cancelBroadcast.mutate()}
                  disabled={cancelBroadcast.isPending}
                  className="w-9 h-9 rounded-full bg-red-500/20 flex items-center justify-center hover:bg-red-500/30 transition-colors"
                >
                  <X className="w-4 h-4 text-red-400" />
                </button>
              )}
            </div>
          </div>

          {/* 후원 랭킹 티커 */}
          {rankings.length > 0 && (
            <DonationRankingTicker rankings={rankings} variant="dark" />
          )}

          {/* 미션 목록 바 */}
          {isBroadcasting && (
            <MissionListBar roomId={roomId} isHost={isHost} maxItems={5} />
          )}
        </div>
      )}

      {/* ===== 4. 후원 관리 센터 ===== */}
      <DonationControlCenter
        isOpen={isDonationListOpen}
        onClose={() => setIsDonationListOpen(false)}
        roomId={roomId}
        roomType="video"
        onPlayVideo={async (videoUrl: string, donation: StreamDonation) => {
          const success = await playVideo(donation)
          if (success) {
            setIsDonationListOpen(false)
            toast.success('영상 재생을 시작합니다')
          } else {
            toast.error('영상 재생에 실패했습니다')
          }
        }}
      />

      {/* 방송 설정 시트 */}
      <StreamSettingsSheet
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        room={{
          id: room.id,
          title: room.title,
          description: room.description,
          category_id: room.category?.id || null,
          access_type: room.access_type,
          chat_mode: room.chat_mode || 'all',
          thumbnail_url: room.thumbnail_url,
          stream_type: room.stream_type,
          tags: room.tags,
        }}
      />

      <StreamHudGuideSheet
        isOpen={isHudGuideOpen}
        onClose={() => setIsHudGuideOpen(false)}
        context="webrtc-broadcast"
      />
    </div>
  )
}
