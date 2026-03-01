/**
 * VideoRoomMiniPlayer - 라이브룸 미니 플레이어 & 확장 모달
 * 
 * 라이브룸에 연결된 상태에서 다른 페이지에 있을 때
 * 하단에 미니 플레이어를 표시하고, 클릭 시 전체 모달로 확장
 * HLS 스트림 사용
 * 
 * 라이브룸 페이지와 유사한 디자인으로 영상 위주 구성
 */

import { SlideSheet } from '@/components'
import { ActiveMissionDisplay } from '@/components/features/stream/donation'
import { MissionListBar } from '@/components/features/stream/donation/MissionListBar'
import { DonationRankingTicker } from '@/components/features/stream/DonationRankingTicker'
import { HlsVideoPlayer } from '@/components/features/stream/HlsVideoPlayer'
import { PinnedChatMessage } from '@/components/features/stream/PinnedChatMessage'
import { useAuth } from '@/hooks/useAuth'
import { useDonationQueue } from '@/hooks/useDonationQueue'
import { useFollowHost } from '@/hooks/useFollowHost'
import { useRoomHlsUrl } from '@/hooks/useHlsStream'
import { useStreamDonations } from '@/hooks/useStreamDonations'
import { useStreamHeartbeat } from '@/hooks/useStreamHeartbeat'
import { useViewerHeartbeat } from '@/hooks/useViewerHeartbeat'
import type { StreamChat, StreamHost } from '@/hooks/useVoiceRoom'
import { useVoiceRoom } from '@/hooks/useVoiceRoom'
import { supabase } from '@/lib/supabase'
import { useVideoRoomMiniPlayerStore } from '@/store/useVideoRoomMiniPlayerStore'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'framer-motion'
import {
    ArrowLeft,
    ExternalLink,
    Gift,
    LogOut,
    Send,
    UserCheck,
    UserPlus,
    Users,
    X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'


// ========== 채팅 메시지 컴포넌트 ==========
function ChatMessage({ 
  message, 
  hosts,
  role = 'listener'
}: { 
  message: StreamChat
  hosts: Array<StreamHost>
  role?: 'owner' | 'speaker' | 'listener'
}) {
  const senderName = message.sender?.name || '알 수 없음'
  const isHost = hosts.some(h => 
    h.member_id === message.sender_id || h.partner?.member?.id === message.sender_id
  )
  const isOwner = role === 'owner'
  
  return (
    <div className="flex items-start gap-2 py-1">
      <img
        src={message.sender?.profile_image || `https://api.dicebear.com/7.x/avataaars/svg?seed=${senderName}`}
        alt={senderName}
        className="w-6 h-6 rounded-full object-cover flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <span className={`text-[11px] font-semibold mr-1 ${isOwner ? 'text-[#FE3A8F]' : isHost ? 'text-purple-600' : 'text-white/90'}`}>
          {senderName}
        </span>
        {(isOwner || isHost) && (
          <span className={`text-[9px] px-1 py-0.5 rounded mr-1 ${isOwner ? 'bg-[#FE3A8F]/20 text-[#FE3A8F]' : 'bg-purple-500/20 text-purple-300'}`}>
            {isOwner ? '방장' : '발언자'}
          </span>
        )}
        <span className="text-[11px] text-white/80 break-words">{message.content}</span>
      </div>
    </div>
  )
}

// ========== 채팅 섹션 컴포넌트 ==========
interface ChatSectionProps {
  chats: StreamChat[]
  hosts: StreamHost[]
  chatInput: string
  setChatInput: (value: string) => void
  onSendChat: () => void
  isSendingChat: boolean
  isModeratorView: boolean
  chatContainerRef: React.RefObject<HTMLDivElement>
  pinnedMessage?: StreamChat | null
  getSenderRole?: (senderId: string) => 'owner' | 'speaker' | 'listener'
}

function ChatSection({
  chats,
  hosts,
  chatInput,
  setChatInput,
  onSendChat,
  isSendingChat,
  isModeratorView,
  chatContainerRef,
  pinnedMessage,
  getSenderRole,
}: ChatSectionProps) {
  const filteredChats = chats.filter(chat => {
    // 일반 시청자는 숨김 메시지 제외
    if (!isModeratorView && chat.is_hidden) return false
    // 고정된 메시지는 일반 목록에서 제외
    if (pinnedMessage && chat.id === pinnedMessage.id) return false
    return true
  })

  return (
    <div className="absolute bottom-0 left-0 right-0 z-20">
      {/* 채팅 토글 영역 */}
      <div className="flex items-center justify-end px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-white/70 text-xs">
            {filteredChats.length}개 메시지
          </span>
        </div>
      </div>

      {/* 고정된 메시지 - 상단에 sticky로 고정 */}
      {pinnedMessage && (
        <div className="sticky top-0 z-10 px-4 pb-2 bg-black/20 backdrop-blur-sm">
          <PinnedChatMessage
            message={pinnedMessage}
            role={getSenderRole ? getSenderRole(pinnedMessage.sender_id) : 'listener'}
            variant="video"
            canUnpin={false}
          />
        </div>
      )}

      {/* 채팅 메시지 리스트 */}
      <div
        ref={chatContainerRef}
        className="max-h-[25vh] overflow-y-auto px-4 py-2 space-y-1 scrollbar-hide relative"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          maskImage: 'linear-gradient(to top, black 0%, black 60%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to top, black 0%, black 60%, transparent 100%)',
        }}
      >
        <style>{`
          .scrollbar-hide::-webkit-scrollbar {
            display: none;
          }
        `}</style>
        {filteredChats.length === 0 ? (
          <div className="text-center py-4 text-white/50 text-sm">
            채팅이 없습니다
          </div>
        ) : (
          filteredChats.slice(-30).map((chat) => (
            <ChatMessage
              key={chat.id}
              message={chat}
              hosts={hosts}
              role={getSenderRole ? getSenderRole(chat.sender_id) : 'listener'}
            />
          ))
        )}
      </div>

      {/* 채팅 입력 */}
      <div className="flex items-center gap-2 px-4 py-2 border-t border-white/10 min-w-0">
        <input
          type="text"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Enter') onSendChat()
          }}
          placeholder="메시지를 입력하세요..."
          className="flex-1 min-w-0 px-4 py-2.5 bg-white/10 backdrop-blur-sm rounded-md text-[14px] text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-100/30 transition-all"
        />
        <button
          onClick={onSendChat}
          disabled={!chatInput.trim() || isSendingChat}
          className={`flex-shrink-0 p-2.5 rounded-full transition-all duration-200 ${
            chatInput.trim() 
              ? 'bg-[#FE3A8F] text-white shadow-lg shadow-[#FE3A8F]/30 hover:bg-[#fe4a9a]' 
              : 'bg-white/10 hover:bg-white/20 backdrop-blur-sm text-gray-400'
          }`}
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}

// ========== 메인 컴포넌트 ==========
export function VideoRoomMiniPlayer() {
  const navigate = useNavigate()
  const location = useRouterState({ select: (state) => state.location })
  const currentPath = location.pathname
  const isOnVideoRoomPage = currentPath.startsWith('/stream/video/')
  const { user } = useAuth()
  const activeRoomId = useVideoRoomMiniPlayerStore((s) => s.activeRoomId)
  const closeMiniPlayer = useVideoRoomMiniPlayerStore((s) => s.close)
  const enabled = !!activeRoomId && !isOnVideoRoomPage
  const miniRoomId = enabled ? activeRoomId : undefined

  const {
    room,
    hosts,
    viewers,
    chats,
    sendChat,
    leaveRoom,
    isHost,
    isAdmin,
  } = useVoiceRoom(miniRoomId)

  const [isExpanded, setIsExpanded] = useState(false)
  
  // 드래그 관련 상태
  const constraintsRef = useRef<HTMLDivElement>(null)

  // 관리자/호스트 여부
  const isModeratorView = isHost || isAdmin

  const [chatInput, setChatInput] = useState('')
  const [isSendingChat, setIsSendingChat] = useState(false)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  // 후원 관련 훅
  const { 
    rankings, 
  } = useStreamDonations({ 
    roomId: miniRoomId, 
    enableRealtime: true, 
    enableRoulette: false 
  })

  // 호스트 팔로우 상태 훅
  const { isFollowing, isLoading: isFollowLoading, toggleFollow } = useFollowHost({
    hostPartnerId: room?.host_partner?.id,
    hostMemberId: room?.host_member_id,
  })
  
  // 호스트용 후원 통계
  const { stats: donationStats } = useDonationQueue({
    roomId: miniRoomId,
    enabled: enabled && isHost,
    enableRealtime: true,
  })

  // 미션 패널 상태 (시청자용)
  const [isMissionPanelOpen, setIsMissionPanelOpen] = useState(false)

  // HLS 스트림 URL 조회
  const { data: hlsUrl, isLoading: isHlsLoading } = useRoomHlsUrl(miniRoomId)

  // OBS/HLS 기반: 미니플레이어 상태에서 하트비트 유지
  useStreamHeartbeat({
    roomId: miniRoomId,
    isHost: enabled && isHost,
    isLive: enabled && room?.status === 'live',
  })

  useViewerHeartbeat({
    roomId: miniRoomId,
    isViewer: enabled && !isHost,
    isLive: enabled && room?.status === 'live',
    isHost: enabled && isHost,
  })

  // 고정된 메시지 찾기
  const pinnedMessage = useMemo(() => {
    return chats.find(chat => chat.is_pinned && !chat.is_hidden) || null
  }, [chats])

  // 채팅 보내기 (중복 전송 방지)
  const handleSendChat = useCallback(async () => {
    if (!chatInput.trim() || isSendingChat) return
    setIsSendingChat(true)
    try {
      await sendChat(chatInput)
      setChatInput('')
    } catch (err) {
      console.error('채팅 전송 실패:', err)
    } finally {
      setIsSendingChat(false)
    }
  }, [chatInput, sendChat, isSendingChat])

  // 채팅 스크롤
  const scrollToBottom = useCallback(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [])

  // 새 채팅 시 스크롤
  useEffect(() => {
    if (isExpanded) {
      scrollToBottom()
    }
  }, [chats, isExpanded, scrollToBottom])

  // 미니플레이어 전용 Realtime 구독 (채팅, 호스트 실시간 동기화)
  const queryClient = useQueryClient()

  // 방송 종료 시 연결 해제
  useEffect(() => {
    if (room && room.status === 'ended') {
      console.log('🎥 [미니플레이어] 방송 종료 감지 - 미니플레이어 종료')
      if (activeRoomId) {
        closeMiniPlayer()
      }
      setIsExpanded(false)
    }
  }, [room, activeRoomId, closeMiniPlayer])
  
  useEffect(() => {
    if (!activeRoomId || isOnVideoRoomPage) return

    console.log('🎥 미니플레이어 Realtime 구독 시작:', activeRoomId)
    const channel = supabase.channel(`video-mini-player-${activeRoomId}`)

    // 채팅 메시지 실시간 수신
    // 호스트 변경 실시간 수신
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'stream_hosts',
        filter: `room_id=eq.${activeRoomId}`,
      },
      (payload) => {
        console.log('🎥 [미니플레이어] 호스트 변경:', payload)
        queryClient.invalidateQueries({ queryKey: ['room-hosts', activeRoomId] })
      }
    )

    // 방 상태 변경 실시간 수신
    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'stream_rooms',
        filter: `id=eq.${activeRoomId}`,
      },
      (payload) => {
        console.log('🎥 [미니플레이어] 방 상태 변경:', payload)
        queryClient.invalidateQueries({ queryKey: ['voice-room', activeRoomId] })
        
        // 방송 종료 시 즉시 미니플레이어 종료
        const newRoom = payload.new as { status?: string }
        if (newRoom?.status === 'ended') {
          console.log('🎥 [미니플레이어] 방송 종료 감지 (Realtime) - 미니플레이어 종료')
          closeMiniPlayer()
          setIsExpanded(false)
        }
      }
    )

    channel.subscribe((status) => {
      console.log('🎥 미니플레이어 Realtime 상태:', status)
      if (status === 'SUBSCRIBED') {
        queryClient.invalidateQueries({ queryKey: ['room-hosts', activeRoomId] })
      }
    })

    return () => {
      console.log('🎥 미니플레이어 Realtime 구독 해제')
      channel.unsubscribe()
    }
  }, [activeRoomId, isOnVideoRoomPage, queryClient, closeMiniPlayer])

  // 연결 안됐거나 라이브룸 페이지에 있으면 표시 안함
  if (!activeRoomId || isOnVideoRoomPage) {
    return null
  }

  // 방으로 이동
  const handleGoToRoom = () => {
    setIsExpanded(false)
    closeMiniPlayer()
    navigate({ to: `/stream/video/${activeRoomId}` })
  }

  // 나가기 (완전 퇴장)
  const handleLeave = async () => {
    try {
      closeMiniPlayer()
      await leaveRoom()
    } catch (err) {
      console.error('퇴장 처리 실패:', err)
    } finally {
      setIsExpanded(false)
    }
  }

  // 발언자 역할 확인
  const getSenderRole = (senderId: string): 'owner' | 'speaker' | 'listener' => {
    const host = hosts.find(h => 
      h.member_id === senderId || h.partner?.member?.id === senderId
    )
    if (!host) return 'listener'
    return host.role === 'owner' ? 'owner' : 'speaker'
  }

  // 호스트 이름 및 초기 추출
  const hostName = room?.host_partner?.member?.name || room?.host_member?.name
  const hostInitial = hostName?.charAt(0)?.toUpperCase() || 'U'

  return (
    <>
      {/* 드래그 경계 영역 (전체 화면) */}
      <div 
        ref={constraintsRef} 
        className="fixed inset-0 pointer-events-none z-30"
        style={{ 
          top: 'env(safe-area-inset-top, 0px)',
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)',
          left: 'env(safe-area-inset-left, 0px)',
          right: 'env(safe-area-inset-right, 0px)',
        }}
      />
      
      {/* 미니 플레이어 바 - 드래그 가능, 컴팩트 디자인 */}
      <AnimatePresence>
        {!isExpanded && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            drag
            dragConstraints={constraintsRef}
            dragElastic={0.1}
            dragMomentum={false}
            whileDrag={{ scale: 1.02 }}
            className="fixed bottom-24 right-4 z-40 w-[160px] md:w-[200px] cursor-grab active:cursor-grabbing pointer-events-auto touch-none"
          >
            <div className="bg-black/95 backdrop-blur-md rounded-xl overflow-hidden shadow-2xl border border-white/20">
              {/* 비디오 영역 (16:9 비율) */}
              <div 
                className="relative w-full aspect-video bg-black"
                onClick={handleGoToRoom}
              >
                <HlsVideoPlayer
                  hlsUrl={hlsUrl || null}
                  roomTitle={room?.title}
                  hostInitial={hostInitial}
                  isConnecting={isHlsLoading}
                  className="absolute inset-0"
                />
                
                {/* LIVE 뱃지 */}
                <div className="absolute top-1.5 left-1.5 flex items-center gap-1 px-1.5 py-0.5 bg-red-500 rounded text-[10px] text-white font-bold">
                  <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                  LIVE
                </div>
                
                {/* 시청자 수 */}
                <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 px-1.5 py-0.5 bg-black/60 backdrop-blur-sm rounded text-[10px] text-white">
                  <Users className="w-2.5 h-2.5" />
                  {room?.viewer_count || 0}
                </div>
                
                {/* 이동 아이콘 오버레이 */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/30 transition-colors group">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/20 backdrop-blur-sm rounded-full p-2">
                    <ExternalLink className="w-4 h-4 text-white" />
                  </div>
                </div>
              </div>

              {/* 하단 정보 바 */}
              <div className="flex items-center justify-between px-2 py-1.5 bg-black/80">
                <p className="text-white text-[10px] font-medium truncate flex-1 min-w-0 mr-1">
                  {room?.title || '라이브'}
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleLeave()
                  }}
                  className="flex-shrink-0 p-1 text-white/60 hover:text-white hover:bg-white/10 rounded transition-colors"
                  title="나가기"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 확장 바텀시트 - 라이브룸 페이지 스타일 */}
      <SlideSheet
        isOpen={isExpanded}
        onClose={() => setIsExpanded(false)}
        initialHeight={0.95}
        minHeight={0.5}
        maxHeight={0.95}
        zIndex={9999}
        renderHeader={({ onPointerDown, onTouchStart }) => (
          <div>
            <div 
              className="flex items-center gap-3 px-4 pb-3 cursor-grab"
              onPointerDown={onPointerDown}
              onTouchStart={onTouchStart}
            >
              <button
                onClick={() => setIsExpanded(false)}
                className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/70 transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-black truncate">
                  {room?.title || '라이브룸'}
                </h3>
                <p className="text-black/70 text-sm">
                  {viewers.length > 0 ? viewers.length : room?.viewer_count || 0}명 시청 중
                </p>
              </div>
              {/* 호스트 팔로우 버튼 (호스트 본인이 아닐 때만 표시) */}
              {room?.host_partner && !isHost && user && (
                <button
                  onClick={toggleFollow}
                  disabled={isFollowLoading}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
                    isFollowing
                      ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      : 'bg-[#FE3A8F] text-white hover:bg-[#e8328a] shadow-lg shadow-[#FE3A8F]/30'
                  } ${isFollowLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isFollowing ? (
                    <>
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>팔로잉</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>팔로우</span>
                    </>
                  )}
                </button>
              )}
              
              {/* 우측: 호스트/관리자 버튼들 */}
              {(isHost || isAdmin) && (
                <div className="flex items-center gap-2">
                  {/* 시청자 관리 */}
                  <button
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700 transition-colors"
                    title="시청자 관리"
                  >
                    <Users className="w-4 h-4" />
                    <span className="text-xs">{viewers.length > 0 ? viewers.length : room?.viewer_count || 0}</span>
                  </button>
                  
                  {/* 후원 관리 (호스트만) */}
                  {isHost && (
                    <button
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-gradient-to-r from-amber-500/80 to-orange-500/80 backdrop-blur-sm rounded-full text-white hover:from-amber-500 hover:to-orange-500 transition-colors"
                      title="후원 관리"
                    >
                      <Gift className="w-4 h-4" />
                      <span className="text-xs">후원</span>
                      {(donationStats.pendingCount > 0 || donationStats.acceptedMissionCount > 0) && (
                        <span className="px-1 py-0.5 text-[10px] bg-white rounded-full min-w-[16px] text-center text-amber-600 font-bold">
                          {donationStats.pendingCount + donationStats.acceptedMissionCount}
                        </span>
                      )}
                    </button>
                  )}
                </div>
              )}
            </div>
            
            {/* 후원 랭킹 티커 (헤더 바로 아래) */}
            {rankings.length > 0 && (
              <DonationRankingTicker 
                rankings={rankings} 
                variant="light"
              />
            )}

            {/* 미션 목록 바 (호스트: 관리 버튼) */}
            {isHost && activeRoomId && (
              <MissionListBar
                roomId={activeRoomId}
                isHost={isHost}
                maxItems={5}
              />
            )}
          </div>
        )}
        footer={
          <div className="space-y-3 px-4 pb-4 bg-white">
            {/* 컨트롤 버튼 */}
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={handleGoToRoom}
                className="px-4 py-2 bg-[#FE3A8F] text-white rounded-full text-sm font-medium hover:bg-[#fe4a9a] transition-colors"
              >
                방으로 이동
              </button>
              {/* 방 나가기 (방송 종료는 OBS에서만) */}
              <button
                onClick={handleLeave}
                className="p-2 bg-red-500/80 text-white rounded-full hover:bg-red-500 transition-colors"
                title="방 나가기"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        }
      >
        {/* 비디오 영역 (메인) */}
        <div className="relative w-full h-full bg-black">
          <HlsVideoPlayer
            hlsUrl={hlsUrl || null}
            roomTitle={room?.title}
            hostInitial={hostInitial}
            isConnecting={isHlsLoading}
            className="absolute inset-0"
          />
          
          {/* 시청자용 미션 배지 (우측 상단) */}
          {!isHost && activeRoomId && (
            <div className="absolute top-2 right-2 z-20 max-w-[240px]">
              <ActiveMissionDisplay
                roomId={activeRoomId}
                maxItems={3}
                compact={true}
                onOpenPanel={() => setIsMissionPanelOpen(true)}
              />
            </div>
          )}
          
          {/* 채팅 섹션 (하단 오버레이) */}
          <ChatSection
            chats={chats}
            hosts={hosts}
            chatInput={chatInput}
            setChatInput={setChatInput}
            onSendChat={handleSendChat}
            isSendingChat={isSendingChat}
            isModeratorView={isModeratorView}
            chatContainerRef={chatContainerRef}
            pinnedMessage={pinnedMessage}
            getSenderRole={getSenderRole}
          />
        </div>
      </SlideSheet>
    </>
  )
}
