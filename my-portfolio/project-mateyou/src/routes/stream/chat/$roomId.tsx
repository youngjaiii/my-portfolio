/**
 * 보이스 채팅방 페이지
 */

import { ChatActionSheet } from '@/components/features/stream/ChatActionSheet'
import {
    ActiveMissionDisplay,
    DonationControlCenter,
    MissionListPanel,
    SpeakerMissionPanel,
    ViewerMissionPanel,
} from '@/components/features/stream/donation'
import { DonationEffectOverlay } from '@/components/features/stream/DonationEffectOverlay'
import { DonationRankingTicker } from '@/components/features/stream/DonationRankingTicker'
import { HostProfileSheet } from '@/components/features/stream/HostProfileSheet'
import { ParticipantProfileSheet } from '@/components/features/stream/ParticipantProfileSheet'
import { PinnedChatMessage } from '@/components/features/stream/PinnedChatMessage'
import { RouletteOverlay } from '@/components/features/stream/roulette'
import { StreamChatMessage } from '@/components/features/stream/StreamChatMessage'
import { StreamDonationSheetV2 } from '@/components/features/stream/StreamDonationSheetV2'
import { VoiceRoomHostProfile } from '@/components/features/stream/VoiceRoomHostProfile'
import { VoiceRoomPasswordModal } from '@/components/features/stream/VoiceRoomPasswordModal'
import { VoiceRoomSidebar } from '@/components/features/stream/VoiceRoomSidebar'
import { VoiceRoomSpeakerRequestCard } from '@/components/features/stream/VoiceRoomSpeakerRequestCard'
import { useFanRanking } from '@/hooks/useFanRanking'
import { usePinChat } from '@/hooks/usePinChat'
import { useStreamDonations } from '@/hooks/useStreamDonations'
import { useStreamModeration } from '@/hooks/useStreamModeration'
import type { StreamChat, StreamHost, StreamViewer } from '@/hooks/useVoiceRoom'
import { useVoiceRoomPage } from '@/hooks/useVoiceRoomPage'
import { canOpenProfile, canOpenProfileFromChat } from '@/utils/streamProfileAccess'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Crown, Gift, Hand, List, Mic, MicOff, Send, Target, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

export const Route = createFileRoute('/stream/chat/$roomId')({
  component: VoiceRoomPage,
})

function VoiceRoomPage() {
  const { roomId } = Route.useParams()
  const navigate = useNavigate()
  
  const {
    user,
    room,
    hosts,
    viewers,
    chats,
    speakerRequests,
    isLoading,
    roomError,
    isHost,
    isAdmin,
    isSpeaker,
    mySpeakerRequest,
    isConnected,
    isConnecting,
    isMuted,
    isForceMuted,
    localIsSpeaking,
    peers,
    inputValue,
    setInputValue,
    showPasswordModal,
    passwordError,
    showRequestsPanel,
    showSidebar,
    hasJoined,
    chatContainerRef,
    handleJoinRoom,
    handleLeaveRoom,
    handleSendMessage,
    handleRequestSpeaking,
    handleResignSpeaking,
    handleEndRoom,
    handleForceEndRoom,
    handleClosePasswordModal,
    toggleRequestsPanel,
    closeSidebar,
    toggleMute,
    approveSpeaker,
    rejectSpeaker,
    getSenderRole,
  } = useVoiceRoomPage(roomId)

  // 발언자 프로필 시트 상태
  const [selectedParticipant, setSelectedParticipant] = useState<StreamHost | StreamViewer | null>(null)
  const [selectedParticipantIsSpeaker, setSelectedParticipantIsSpeaker] = useState(false)
  const [isProfileSheetOpen, setIsProfileSheetOpen] = useState(false)
  
  // 일반 유저용 호스트 프로필 시트 상태
  const [selectedHost, setSelectedHost] = useState<StreamHost | null>(null)
  const [isHostProfileSheetOpen, setIsHostProfileSheetOpen] = useState(false)

  // 채팅 액션 시트 상태
  const [selectedChatMessage, setSelectedChatMessage] = useState<StreamChat | null>(null)
  const [isChatActionSheetOpen, setIsChatActionSheetOpen] = useState(false)

  // 후원 시트 상태
  const [isDonationSheetOpen, setIsDonationSheetOpen] = useState(false)
  
  // 후원 목록 상태 (호스트용)
  const [isDonationListOpen, setIsDonationListOpen] = useState(false)
  
  // 미션 패널 상태 (시청자용)
  const [isMissionPanelOpen, setIsMissionPanelOpen] = useState(false)
  
  // 발언자용 미션 패널 상태 (호스트 아닌 발언자 파트너용)
  const [isSpeakerMissionPanelOpen, setIsSpeakerMissionPanelOpen] = useState(false)

  // 모더레이션 훅
  const { hideMessage, unhideMessage } = useStreamModeration(roomId)

  // 고정 훅
  const { togglePin } = usePinChat()

  // 후원 관련 훅 (Realtime으로 모든 이펙트 수신 + 룰렛)
  const { 
    rankings, 
    activeEffects,
    currentRoulette,
    rouletteQueueLength,
    skipCurrentRoulette,
  } = useStreamDonations({ roomId, enableRealtime: true, enableRoulette: true })

  // 팬 랭킹 훅 (채팅 메시지에 메달 표시용)
  const { rankMap } = useFanRanking({ 
    partnerId: room?.host_partner_id || null,
    enabled: !!room?.host_partner_id,
  })

  // 관리자/호스트 여부
  const isModeratorView = isHost || isAdmin

  // 현재 사용자가 발언자이면서 파트너인 경우의 partner_id (호스트는 제외)
  const mySpeakerPartnerId = useMemo(() => {
    if (!user || isHost) return null
    const myHost = hosts.find(h => 
      (h.member_id === user.id || h.partner?.member?.id === user.id) && !h.left_at
    )
    // partner_id가 있으면 파트너 발언자
    return myHost?.partner_id || null
  }, [hosts, user, isHost])

  // 고정된 메시지 찾기
  const pinnedMessage = useMemo(() => {
    return chats.find(chat => chat.is_pinned && !chat.is_hidden) || null
  }, [chats])

  // 채팅 필터링 (일반 시청자는 숨김 메시지 제외, 고정된 메시지도 제외)
  const filteredChats = useMemo(() => {
    let filtered = isModeratorView 
      ? chats 
      : chats.filter(chat => !chat.is_hidden)
    
    // 고정된 메시지는 일반 목록에서 제외
    if (pinnedMessage) {
      filtered = filtered.filter(chat => chat.id !== pinnedMessage.id)
    }
    
    return filtered
  }, [chats, isModeratorView, pinnedMessage])

  // 발언자 프로필 클릭 핸들러 (호스트 아바타 클릭)
  const handleSpeakerProfileClick = (host: StreamHost) => {
    // 호스트나 관리자인 경우 기존 ParticipantProfileSheet 사용
    if (isHost || isAdmin) {
      const canOpen = canOpenProfile({
        target: host,
        hostMemberId: room?.host_member_id,
        isCurrentUserAdmin: isAdmin,
        isCurrentUserHost: isHost,
      })

      if (!canOpen) return

      setSelectedParticipant(host)
      setSelectedParticipantIsSpeaker(true)
      setIsProfileSheetOpen(true)
    } else {
      // 일반 유저인 경우 HostProfileSheet 사용
      setSelectedHost(host)
      setIsHostProfileSheetOpen(true)
    }
  }

  // 채팅 메시지 클릭 핸들러 (액션 시트 열기)
  const handleChatMessageClick = (message: StreamChat) => {
    // 관리자/호스트만 채팅 액션 시트 열 수 있음
    if (!isModeratorView) return
    
    setSelectedChatMessage(message)
    setIsChatActionSheetOpen(true)
  }

  // 채팅 액션 시트에서 프로필 열기
  const handleOpenProfileFromChat = () => {
    if (!selectedChatMessage) return

    // 메시지 발신자 정보로 참가자 찾기
    const host = hosts.find(h => 
      h.member_id === selectedChatMessage.sender_id || h.partner?.member?.id === selectedChatMessage.sender_id
    )
    
    if (host) {
      setSelectedParticipant(host)
      setSelectedParticipantIsSpeaker(true)
    } else {
      // 시청자에서 찾기
      const viewer = viewers.find(v => v.member_id === selectedChatMessage.sender_id)
      if (viewer) {
        setSelectedParticipant(viewer)
        setSelectedParticipantIsSpeaker(false)
      } else {
        // 없으면 임시 뷰어 객체 생성
        setSelectedParticipant({
          id: `temp-${selectedChatMessage.sender_id}`,
          room_id: roomId,
          member_id: selectedChatMessage.sender_id,
          joined_at: selectedChatMessage.created_at,
          left_at: null,
          member: selectedChatMessage.sender ? {
            id: selectedChatMessage.sender.id,
            name: selectedChatMessage.sender.name,
            profile_image: selectedChatMessage.sender.profile_image,
          } : undefined,
        } as StreamViewer)
        setSelectedParticipantIsSpeaker(false)
      }
    }
    setIsProfileSheetOpen(true)
  }

  // 선택된 채팅 메시지의 프로필 열기 가능 여부 확인
  const canOpenSelectedChatProfile = selectedChatMessage
    ? canOpenProfileFromChat({
        senderId: selectedChatMessage.sender_id,
        hosts,
        viewers,
        hostMemberId: room?.host_member_id,
        isCurrentUserAdmin: isAdmin,
        isCurrentUserHost: isHost,
      })
    : false

  // 채팅 숨기기/해제 핸들러
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
      console.error('채팅 숨기기 처리 실패:', err)
      toast.error('채팅 처리에 실패했습니다')
    }
  }

  // 채팅 고정/해제 핸들러
  const handleChatPinToggle = async (messageId: number, isPinned: boolean) => {
    try {
      await togglePin.mutateAsync({ messageId, roomId })
      toast.success(isPinned ? '고정이 해제되었습니다' : '메시지가 고정되었습니다')
    } catch (err) {
      console.error('채팅 고정 처리 실패:', err)
      toast.error('고정 처리에 실패했습니다')
    }
  }

  // 고정된 메시지 해제 핸들러
  const handleUnpinMessage = async () => {
    if (!pinnedMessage) return
    await handleChatPinToggle(pinnedMessage.id, true)
  }

  const handleCloseProfileSheet = () => {
    setIsProfileSheetOpen(false)
    setSelectedParticipant(null)
  }


  // 로딩 상태
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500">로딩 중...</p>
        </div>
      </div>
    )
  }

  // 에러 또는 방 없음
  if (roomError || !room) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-center">
          <p className="text-gray-500 mb-4">방을 찾을 수 없습니다</p>
          <button
            onClick={() => navigate({ to: '/stream/voice' })}
            className="px-6 py-2 bg-purple-500 text-white rounded-lg"
          >
            목록으로 돌아가기
          </button>
        </div>
      </div>
    )
  }

  // 종료된 방
  if (room.status === 'ended') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="text-center">
          <p className="text-gray-500 mb-4">종료된 방송입니다</p>
          <button
            onClick={() => navigate({ to: '/stream/voice' })}
            className="px-6 py-2 bg-purple-500 text-white rounded-lg"
          >
            목록으로 돌아가기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col overflow-x-hidden bg-gradient-to-b from-slate-50 to-white text-[#110f1a] min-h-screen">
      {/* 비밀번호 모달 */}
      {showPasswordModal && (
        <VoiceRoomPasswordModal
          onSubmit={handleJoinRoom}
          onClose={handleClosePasswordModal}
          error={passwordError}
        />
      )}

      {/* 사이드바 (관리자/호스트 전용) */}
      <VoiceRoomSidebar
        isOpen={showSidebar}
        onClose={closeSidebar}
        roomId={roomId}
        roomTitle={room.title}
        hosts={hosts}
        viewers={viewers}
        isAdmin={isAdmin}
        isHost={isHost}
        hostPartnerId={room.host_partner?.id}
        hostMemberId={room.host_member_id}
        onForceEndRoom={isAdmin ? handleForceEndRoom : undefined}
      />

      {/* 메인 컨테이너 */}
      <div 
        className="container mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 flex flex-col"
        style={{ 
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 56px)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 72px)',
          minHeight: '100vh'
        }}
      >
        {/* 방 정보 헤더 */}
        <header className="py-2 border-b border-gray-100 -mx-4 sm:-mx-6 lg:-mx-8 px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="min-w-0">
                <h1 className="text-sm font-bold text-[#110f1a] truncate">{room.title}</h1>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] text-gray-500">
                    <Users className="w-2.5 h-2.5 inline mr-0.5" />
                    {viewers.length > 0 ? viewers.length : room.viewer_count}명
                  </span>
                  {room.category && (
                    <span className="text-[10px] px-1.5 py-[1px] bg-purple-100 text-purple-600 rounded">
                      {room.category.name}
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            {/* 호스트 컨트롤 */}
            {isHost && (
              <div className="flex items-center gap-1.5">
                {/* 오늘 후원 목록 버튼 - 프리즘 글래스 */}
                <button
                  onClick={() => setIsDonationListOpen(true)}
                  className="relative p-1.5 rounded-full overflow-hidden group transition-all duration-300 hover:scale-105"
                  title="오늘 후원 목록"
                  style={{
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.7) 100%)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.8)',
                  }}
                >
                  {/* 프리즘 무지개 반사 효과 */}
                  <div 
                    className="absolute inset-0 opacity-60 group-hover:opacity-80 transition-opacity"
                    style={{
                      background: 'linear-gradient(135deg, #ff9a9e 0%, #fecfef 20%, #fecfef 40%, #a18cd1 60%, #5fc3e4 80%, #e6dee9 100%)',
                      mixBlendMode: 'overlay',
                    }}
                  />
                  {/* 글래스 하이라이트 */}
                  <div 
                    className="absolute inset-0 opacity-40"
                    style={{
                      background: 'linear-gradient(180deg, rgba(255,255,255,0.8) 0%, transparent 50%)',
                    }}
                  />
                  <List className="w-4 h-4 text-gray-700 relative z-10" />
                </button>
                {speakerRequests.length > 0 && (
                  <button
                    onClick={toggleRequestsPanel}
                    className="relative p-1.5 bg-purple-100 hover:bg-purple-200 rounded-full transition-colors"
                  >
                    <Hand className="w-4 h-4 text-purple-600" />
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                      {speakerRequests.length}
                    </span>
                  </button>
                )}
                <button
                  onClick={handleEndRoom}
                  className="px-2 py-1 bg-red-500 hover:bg-red-600 text-white text-[10px] font-medium rounded-md transition-colors"
                >
                  방송 종료
                </button>
              </div>
            )}
          </div>
        </header>

        {/* 발언권 요청 패널 (호스트용) */}
        {isHost && showRequestsPanel && speakerRequests.length > 0 && (
          <div className="py-2 space-y-1.5 border-b border-gray-100 -mx-4 sm:-mx-6 lg:-mx-8 px-3 sm:px-6 lg:px-8">
            <p className="text-xs font-medium text-[#110f1a]">발언권 요청 ({speakerRequests.length})</p>
            {speakerRequests.map((req) => (
              <VoiceRoomSpeakerRequestCard
                key={req.id}
                request={req}
                onApprove={() => approveSpeaker(req.id)}
                onReject={() => rejectSpeaker(req.id)}
              />
            ))}
          </div>
        )}

        {/* 호스트 섹션 */}
        <section className="py-2 bg-gradient-to-r from-[#FE3A8F]/5 to-purple-500/5 border-b border-gray-100 -mx-4 sm:-mx-6 lg:-mx-8 px-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-1.5 mb-2">
            <Crown className="w-3 h-3 text-[#FE3A8F]" />
            <span className="text-[10px] font-bold text-[#110f1a]">
              발언자 ({hosts.length}/{room.max_participants})
            </span>
          </div>
          <div className="grid grid-cols-5 gap-2 justify-items-center">
            {hosts.map((host) => {
              const memberId = host.member_id || host.partner?.member?.id
              const isCurrentUser = memberId === user?.id
              // peers Map에서 memberId가 일치하는 피어 찾기 (세션 ID가 포함된 key 형식)
              const peerEntry = memberId ? Array.from(peers.entries()).find(
                ([key]) => key.includes(`-${memberId}-`)
              ) : undefined
              const peerData = peerEntry?.[1]
              const isPeerSpeaking = peerData?.isSpeaking ?? false
              const isPeerMuted = peerData?.isMuted ?? false
              const isLocalSpeaking = isCurrentUser && localIsSpeaking
              
              // 프로필 클릭 가능 여부
              // 호스트/관리자는 기존 권한 체크, 일반 유저는 항상 클릭 가능
              const hostClickable = isHost || isAdmin
                ? canOpenProfile({
                    target: host,
                    hostMemberId: room?.host_member_id,
                    isCurrentUserAdmin: isAdmin,
                    isCurrentUserHost: isHost,
                  })
                : !isCurrentUser // 일반 유저는 자기 자신이 아닌 경우 클릭 가능
              
              return (
                <VoiceRoomHostProfile
                  key={host.id}
                  host={host}
                  isSpeaking={isPeerSpeaking || isLocalSpeaking}
                  isMuted={isCurrentUser ? isMuted : isPeerMuted}
                  isCurrentUser={isCurrentUser}
                  isClickable={hostClickable}
                  onProfileClick={handleSpeakerProfileClick}
                />
              )
            })}
            {/* 빈 슬롯 */}
            {Array.from({ length: Math.max(0, room.max_participants - hosts.length) }).map((_, i) => (
              <div 
                key={`empty-${i}`} 
                className="w-10 h-10 rounded-full bg-gray-100/50 border border-dashed border-gray-200 flex items-center justify-center"
              >
                <span className="text-gray-300 text-sm">+</span>
              </div>
            ))}
          </div>
        </section>

        {/* 후원 랭킹 티커 */}
        {rankings.length > 0 && (
          <DonationRankingTicker 
            rankings={rankings} 
            className="-mx-4 sm:-mx-6 lg:-mx-8"
          />
        )}

        {/* 시청자용 진행 중인 미션 표시 (컴팩트 모드) */}
        {!isHost && (
          <button
            type="button"
            onClick={() => setIsMissionPanelOpen(true)}
            className="w-full"
          >
            <ActiveMissionDisplay
              roomId={roomId}
              maxItems={3}
              compact={true}
            />
          </button>
        )}

        {/* 채팅 영역 */}
        <div className="flex-1 flex flex-col bg-white -mx-4 sm:-mx-6 lg:-mx-8 min-h-[200px] relative">
          {/* 고정된 메시지 - 상단에 sticky로 고정 */}
          {pinnedMessage && (
            <div className="sticky top-0 z-10 bg-white">
              <PinnedChatMessage
                message={pinnedMessage}
                role={getSenderRole(pinnedMessage.sender_id)}
                variant="voice"
                onUnpin={handleUnpinMessage}
                canUnpin={isModeratorView}
                fanRank={rankMap.get(pinnedMessage.sender_id) || null}
              />
            </div>
          )}

          <div 
            ref={chatContainerRef}
            className="flex-1 overflow-y-auto"
          >
            <div className="px-2 sm:px-4 lg:px-6 py-1">
            {filteredChats.length === 0 ? (
              <div className="text-center py-4 text-gray-400">
                <p className="text-xs">첫 번째 메시지를 남겨보세요!</p>
              </div>
            ) : (
              filteredChats.map((message) => (
                <StreamChatMessage 
                  key={message.id} 
                  message={message}
                  role={getSenderRole(message.sender_id)}
                  variant="voice"
                  isModeratorView={isModeratorView}
                  onMessageClick={handleChatMessageClick}
                  onHideToggle={isModeratorView ? handleChatHideToggle : undefined}
                  fanRank={rankMap.get(message.sender_id) || null}
                />
              ))
            )}
            </div>
          </div>
        </div>

        {/* 하단 컨트롤 영역 */}
        <footer className="bg-white border-t border-gray-100 py-2 -mx-4 sm:-mx-6 lg:-mx-8 px-3 sm:px-6 lg:px-8 sticky bottom-0">
          {/* 발언자/호스트 마이크 컨트롤 */}
          {(isSpeaker || isHost) && (
            <div className="flex items-center gap-1.5 mb-2">
              <button
                onClick={toggleMute}
                disabled={isForceMuted}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all ${
                  isForceMuted 
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
                    : isMuted 
                      ? 'bg-red-100 text-red-600' 
                      : 'bg-emerald-100 text-emerald-600'
                }`}
              >
                {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                <span className="text-[11px] font-medium">
                  {isForceMuted ? '음소거됨' : isMuted ? '음소거' : '마이크 켜짐'}
                </span>
              </button>

              {/* 발언 나가기 버튼 (방장이 아닌 발언자만) */}
              {isSpeaker && !isHost && (
                <button
                  onClick={handleResignSpeaking}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-100 hover:bg-orange-200 text-orange-600 rounded-full transition-colors"
                >
                  <MicOff className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-medium">발언 나가기</span>
                </button>
              )}
              
              {isConnecting && (
                <span className="text-[10px] text-gray-400">연결 중...</span>
              )}
              {!isConnected && !isConnecting && (
                <span className="text-[10px] text-yellow-600">연결 대기 중...</span>
              )}
            </div>
          )}

          {/* 청취자 - 발언권 요청 버튼 */}
          {!isSpeaker && !isHost && hasJoined && (
            <div className="mb-2">
              {mySpeakerRequest?.status === 'pending' ? (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 text-yellow-700 rounded-full">
                  <Hand className="w-3.5 h-3.5" />
                  <span className="text-[11px]">발언권 요청 대기 중...</span>
                </div>
              ) : hosts.length < room.max_participants ? (
                <button
                  onClick={handleRequestSpeaking}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 hover:bg-purple-200 text-purple-600 rounded-full transition-colors"
                >
                  <Hand className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-medium">발언권 요청</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-500 rounded-full">
                  <Users className="w-3.5 h-3.5" />
                  <span className="text-[11px]">발언자가 가득 찼습니다</span>
                </div>
              )}
            </div>
          )}

          {/* 채팅 입력 */}
          <div className="flex items-center gap-1 min-w-0">            
            <div className="flex-1 relative min-w-0">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return
                  if (e.key === 'Enter' && !e.shiftKey) handleSendMessage()
                }}
                placeholder="메시지를 입력하세요..."
                className="w-full px-2.5 py-1.5 bg-gray-100 rounded text-[11px] text-[#110f1a] placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-500/30 transition-all"
              />
            </div>
            
            <button
              onClick={handleSendMessage}
              disabled={!inputValue.trim()}
              className={`flex-shrink-0 p-1.5 rounded-full transition-all duration-200 ${
                inputValue.trim() 
                  ? 'bg-[#FE3A8F] text-white shadow-sm shadow-[#FE3A8F]/30 hover:bg-[#fe4a9a]' 
                  : 'bg-gray-200 text-gray-400'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
            </button>
            
            <button 
              onClick={() => setIsDonationSheetOpen(true)}
              className="flex-shrink-0 p-1.5 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm shadow-amber-400/30 hover:from-amber-500 hover:to-orange-600 transition-all duration-200"
              title="후원하기"
            >
              <Gift className="w-3.5 h-3.5" />
            </button>

            {/* 미션 목록 버튼 - 발언자(파트너)는 자신의 미션 관리, 그 외는 통합 뷰어 */}
            {mySpeakerPartnerId ? (
              <button 
                onClick={() => setIsSpeakerMissionPanelOpen(true)}
                className="flex-shrink-0 p-1.5 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-sm shadow-green-400/30 hover:from-green-600 hover:to-emerald-700 transition-all duration-200"
                title="내 미션 관리"
              >
                <Target className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button 
                onClick={() => setIsMissionPanelOpen(true)}
                className="flex-shrink-0 p-1.5 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-sm shadow-purple-400/30 hover:from-purple-600 hover:to-indigo-700 transition-all duration-200"
                title="미션 목록"
              >
                <Target className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </footer>
      </div>

      {/* 채팅 액션 바텀시트 */}
      <ChatActionSheet
        isOpen={isChatActionSheetOpen}
        onClose={() => setIsChatActionSheetOpen(false)}
        message={selectedChatMessage}
        isHidden={selectedChatMessage?.is_hidden ?? false}
        isPinned={selectedChatMessage?.is_pinned ?? false}
        onHideToggle={handleChatHideToggle}
        onPinToggle={handleChatPinToggle}
        onOpenProfile={handleOpenProfileFromChat}
        canOpenProfile={canOpenSelectedChatProfile}
        canPin={isModeratorView}
      />

      {/* 참가자 프로필 바텀시트 (호스트/관리자용) */}
      <ParticipantProfileSheet
        isOpen={isProfileSheetOpen}
        onClose={handleCloseProfileSheet}
        roomId={roomId}
        participant={selectedParticipant}
        hostPartnerId={room.host_partner?.id}
        hostMemberId={room.host_member_id}
        isSpeaker={selectedParticipantIsSpeaker}
        isCurrentUserHost={isHost}
        onKicked={handleCloseProfileSheet}
      />

      {/* 호스트 프로필 바텀시트 (일반 유저용) */}
      <HostProfileSheet
        isOpen={isHostProfileSheetOpen}
        onClose={() => {
          setIsHostProfileSheetOpen(false)
          setSelectedHost(null)
        }}
        host={selectedHost}
      />

      {/* 후원 바텀시트 (V2 - 타입 선택 지원) */}
      <StreamDonationSheetV2
        isOpen={isDonationSheetOpen}
        onClose={() => setIsDonationSheetOpen(false)}
        roomId={roomId}
        hosts={hosts}
        roomType="voice"
      />

      {/* 도네이션 컨트롤 센터 (호스트용) */}
      <DonationControlCenter
        isOpen={isDonationListOpen}
        onClose={() => setIsDonationListOpen(false)}
        roomId={roomId}
        roomType="voice"
      />

      {/* 미션 목록 패널 - 호스트용 (수락/거절/성공/실패 가능) */}
      {isHost && (
        <MissionListPanel
          roomId={roomId}
          isHost={isHost}
          isOpen={isMissionPanelOpen}
          onClose={() => setIsMissionPanelOpen(false)}
        />
      )}

      {/* 미션 목록 패널 - 시청자용 (통합 뷰어, 읽기 전용) */}
      {!isHost && !mySpeakerPartnerId && (
        <ViewerMissionPanel
          roomId={roomId}
          isOpen={isMissionPanelOpen}
          onClose={() => setIsMissionPanelOpen(false)}
        />
      )}

      {/* 미션 목록 패널 - 발언자(파트너)용 (자신에게 온 미션만, 수락/거절/성공/실패 가능) */}
      {mySpeakerPartnerId && (
        <SpeakerMissionPanel
          roomId={roomId}
          myPartnerId={mySpeakerPartnerId}
          isOpen={isSpeakerMissionPanelOpen}
          onClose={() => setIsSpeakerMissionPanelOpen(false)}
        />
      )}

      {/* 후원 이펙트 오버레이 */}
      <DonationEffectOverlay effects={activeEffects} />

      {/* 룰렛 오버레이 */}
      <RouletteOverlay
        roulette={currentRoulette}
        queueLength={rouletteQueueLength}
        isHost={isHost}
        onSkip={skipCurrentRoulette}
      />
    </div>
  )
}
