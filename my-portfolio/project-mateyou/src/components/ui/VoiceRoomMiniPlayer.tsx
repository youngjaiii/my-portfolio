/**
 * VoiceRoomMiniPlayer - 보이스룸 미니 플레이어 & 확장 모달
 * 
 * 보이스룸에 연결된 상태에서 다른 페이지에 있을 때
 * 하단에 미니 플레이어를 표시하고, 클릭 시 전체 모달로 확장
 */

import { SlideSheet } from '@/components'
import { useVoiceRoomConnection } from '@/contexts/VoiceRoomProvider'
import type { StreamChat, StreamHost } from '@/hooks/useVoiceRoom'
import { useVoiceRoom } from '@/hooks/useVoiceRoom'
import { supabase } from '@/lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'framer-motion'
import {
    Crown,
    LogOut,
    MessageCircle,
    Mic,
    MicOff,
    Send,
    Users,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

// 채팅 메시지 컴포넌트 (간소화)
function ChatMessage({ 
  message, 
  hosts 
}: { 
  message: StreamChat
  hosts: Array<StreamHost>
}) {
  const senderName = message.sender?.name || '알 수 없음'
  const isHost = hosts.some(h => 
    h.member_id === message.sender_id || h.partner?.member?.id === message.sender_id
  )
  const isOwner = hosts.some(h => 
    (h.member_id === message.sender_id || h.partner?.member?.id === message.sender_id) && h.role === 'owner'
  )
  
  return (
    <div className="flex items-start gap-2 py-1">
      <img
        src={message.sender?.profile_image || `https://api.dicebear.com/7.x/avataaars/svg?seed=${senderName}`}
        alt={senderName}
        className="w-6 h-6 rounded-full object-cover flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <span className={`text-[11px] font-semibold mr-1 ${isOwner ? 'text-[#FE3A8F]' : isHost ? 'text-purple-600' : 'text-gray-700'}`}>
          {senderName}
        </span>
        {(isOwner || isHost) && (
          <span className={`text-[9px] px-1 py-0.5 rounded mr-1 ${isOwner ? 'bg-[#FE3A8F]/10 text-[#FE3A8F]' : 'bg-purple-100 text-purple-600'}`}>
            {isOwner ? '방장' : '발언자'}
          </span>
        )}
        <span className="text-[11px] text-gray-600 break-words">{message.content}</span>
      </div>
    </div>
  )
}

// 발언자 아바타
function SpeakerAvatar({ host, isSpeaking, isMuted }: { host: StreamHost; isSpeaking: boolean; isMuted: boolean }) {
  const name = host.member?.name || host.partner?.partner_name || '알 수 없음'
  const profileImage = host.member?.profile_image || host.partner?.member?.profile_image
  const isOwner = host.role === 'owner'
  
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        <img
          src={profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`}
          alt={name}
          className={`w-10 h-10 rounded-full object-cover border-2 transition-all ${
            isSpeaking && !isMuted 
              ? 'border-emerald-500 shadow-lg shadow-emerald-400/30 scale-105' 
              : isMuted 
                ? 'border-gray-300 opacity-70'
                : isOwner 
                  ? 'border-[#FE3A8F]' 
                  : 'border-purple-300'
          }`}
        />
        {/* 역할/음소거 뱃지 */}
        <div className={`absolute -bottom-0.5 -right-0.5 rounded-full p-0.5 ${
          isMuted ? 'bg-red-500' : isOwner ? 'bg-[#FE3A8F]' : 'bg-purple-500'
        }`}>
          {isMuted ? (
            <MicOff className="w-2.5 h-2.5 text-white" />
          ) : isOwner ? (
            <Crown className="w-2.5 h-2.5 text-white" />
          ) : (
            <Mic className="w-2.5 h-2.5 text-white" />
          )}
        </div>
        {/* 발언 중 인디케이터 */}
        {isSpeaking && !isMuted && (
          <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </div>
        )}
      </div>
      <span className={`text-[10px] truncate max-w-[50px] ${isMuted ? 'text-gray-400' : 'text-gray-600'}`}>
        {name}
      </span>
    </div>
  )
}

export function VoiceRoomMiniPlayer() {
  const navigate = useNavigate()
  const location = useRouterState({ select: (state) => state.location })
  const currentPath = location.pathname

  const {
    isConnected,
    currentRoomId,
    isMuted,
    isSpeaking: localIsSpeaking,
    isListenerMode,
    peers,
    toggleMute,
    stopMicrophone,
  } = useVoiceRoomConnection()

  const {
    room,
    hosts,
    chats,
    sendChat,
    leaveRoom,
    resignSpeaking,
    isSpeaker,
    isHost,
    isAdmin,
  } = useVoiceRoom(currentRoomId || undefined)

  const [isExpanded, setIsExpanded] = useState(false)

  // 관리자/호스트 여부
  const isModeratorView = isHost || isAdmin

  // 채팅 필터링 (일반 시청자는 숨김 메시지 제외)
  const filteredChats = chats.filter(chat => isModeratorView || !chat.is_hidden)
  const [chatInput, setChatInput] = useState('')
  const [isSendingChat, setIsSendingChat] = useState(false)
  const chatContainerRef = useRef<HTMLDivElement>(null)

  // 현재 보이스룸 페이지에 있는지 확인
  const isOnVoiceRoomPage = currentPath.startsWith('/stream/chat/')

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

  // 방송 종료 시 연결 해제 (room이 ended 상태이거나 없으면)
  useEffect(() => {
    if (!currentRoomId || !isConnected) return

    // room 데이터가 로드되었고, 방송이 종료된 경우
    if (room && room.status === 'ended') {
      console.log('🎵 [미니플레이어] 방송 종료 감지 - 연결 해제')
      stopMicrophone()
    }
  }, [room, currentRoomId, isConnected, stopMicrophone])
  
  useEffect(() => {
    if (!currentRoomId || isOnVoiceRoomPage) return

    console.log('🎵 미니플레이어 Realtime 구독 시작:', currentRoomId)
    const channel = supabase.channel(`mini-player-${currentRoomId}`)

    // 호스트 변경 실시간 수신
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'stream_hosts',
        filter: `room_id=eq.${currentRoomId}`,
      },
      (payload) => {
        console.log('🎵 [미니플레이어] 호스트 변경:', payload)
        queryClient.invalidateQueries({ queryKey: ['room-hosts', currentRoomId] })
      }
    )

    // 방 상태 변경 실시간 수신
    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'stream_rooms',
        filter: `id=eq.${currentRoomId}`,
      },
      (payload) => {
        console.log('🎵 [미니플레이어] 방 상태 변경:', payload)
        queryClient.invalidateQueries({ queryKey: ['voice-room', currentRoomId] })
        
        // 방송 종료 시 즉시 연결 해제
        const newRoom = payload.new as { status?: string }
        if (newRoom?.status === 'ended') {
          console.log('🎵 [미니플레이어] 방송 종료 감지 (Realtime) - 연결 해제')
          stopMicrophone()
        }
      }
    )

    channel.subscribe((status) => {
      console.log('🎵 미니플레이어 Realtime 상태:', status)
      if (status === 'SUBSCRIBED') {
        // 구독 성공 시 호스트 데이터 가져오기
        queryClient.invalidateQueries({ queryKey: ['room-hosts', currentRoomId] })
      }
    })

    return () => {
      console.log('🎵 미니플레이어 Realtime 구독 해제')
      channel.unsubscribe()
    }
  }, [currentRoomId, isOnVoiceRoomPage, queryClient, stopMicrophone])

  // 연결 안됐거나 보이스룸 페이지에 있으면 표시 안함
  if (!isConnected || !currentRoomId || isOnVoiceRoomPage) {
    return null
  }

  // 방으로 이동
  const handleGoToRoom = () => {
    setIsExpanded(false)
    navigate({ to: `/stream/chat/${currentRoomId}` })
  }

  // 나가기 (완전 퇴장)
  const handleLeave = async () => {
    // 마이크 강제 종료 (모든 연결 및 세션 정리)
    stopMicrophone()
    await leaveRoom()
    setIsExpanded(false)
  }

  // 발언 나가기 (발언자 → 청취자)
  const handleResignSpeaking = async () => {
    // 마이크 강제 종료 (모든 연결 및 세션 정리)
    stopMicrophone()
    await resignSpeaking()
    setIsExpanded(false)
  }

  // 활성 발언자 수
  const activeSpeakers = hosts.filter(h => !h.left_at).length

  return (
    <>
      {/* 미니 플레이어 바 */}
      <AnimatePresence>
        {!isExpanded && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-20 left-4 right-4 z-40 md:left-auto md:right-6 md:w-80"
          >
            <div 
              onClick={() => setIsExpanded(true)}
              className="bg-gradient-to-r from-purple-600 to-[#FE3A8F] rounded-2xl p-3 shadow-lg cursor-pointer"
            >
              <div className="flex items-center gap-3">
                {/* 발언자 아이콘 */}
                <div className="flex -space-x-2">
                  {hosts.slice(0, 3).map((host) => (
                    <img
                      key={host.id}
                      src={host.member?.profile_image || host.partner?.member?.profile_image || `https://api.dicebear.com/7.x/avataaars/svg?seed=${host.member?.name || 'user'}`}
                      alt=""
                      className="w-8 h-8 rounded-full border-2 border-white object-cover"
                    />
                  ))}
                </div>

                {/* 방 정보 */}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold truncate">
                    {room?.title || '보이스룸'}
                  </p>
                  <p className="text-white/70 text-xs flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {activeSpeakers}명 참여 중
                    {localIsSpeaking && (
                      <span className="ml-1 flex items-center gap-0.5 text-emerald-300">
                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                        말하는 중
                      </span>
                    )}
                  </p>
                </div>

                {/* 마이크 토글 (청취자 모드에서는 숨김) */}
                {!isListenerMode && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleMute()
                    }}
                    className={`p-2 rounded-full ${isMuted ? 'bg-red-500' : 'bg-white/20'}`}
                  >
                    {isMuted ? (
                      <MicOff className="w-4 h-4 text-white" />
                    ) : (
                      <Mic className="w-4 h-4 text-white" />
                    )}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 확장 바텀시트 (SlideSheet 사용) */}
      <SlideSheet
        isOpen={isExpanded}
        onClose={() => setIsExpanded(false)}
        initialHeight={0.92}
        minHeight={0.3}
        maxHeight={0.95}
        zIndex={9999}
        renderHeader={({ onPointerDown, onTouchStart }) => (
          <div 
            className="flex items-center gap-3 px-4 pb-3 cursor-grab"
            onPointerDown={onPointerDown}
            onTouchStart={onTouchStart}
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-[#FE3A8F] flex items-center justify-center">
              <Mic className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-[#110f1a] truncate max-w-[200px]">
                {room?.title || '보이스룸'}
              </h3>
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <Users className="w-3 h-3" />
                {activeSpeakers}명 참여 중
              </p>
            </div>
          </div>
        )}
        footer={
          <div className="space-y-3 px-4">
            {/* 채팅 입력 */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  // IME 조합 중이면 무시 (한글 입력 시 Enter 두 번 방지)
                  if (e.nativeEvent.isComposing) return
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleSendChat()
                  }
                }}
                placeholder="메시지를 입력하세요..."
                className="flex-1 px-4 py-2 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30"
              />
              <button
                onClick={handleSendChat}
                disabled={!chatInput.trim() || isSendingChat}
                className="p-2 bg-purple-500 text-white rounded-full disabled:opacity-50 disabled:cursor-not-allowed hover:bg-purple-600 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>

            {/* 마이크 & 액션 버튼 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* 마이크 버튼 (청취자 모드에서는 숨김) */}
                {!isListenerMode && (
                  <button
                    onClick={toggleMute}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
                      isMuted 
                        ? 'bg-red-100 text-red-600' 
                        : 'bg-emerald-100 text-emerald-600'
                    }`}
                  >
                    {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    <span className="text-sm font-medium">
                      {isMuted ? '음소거' : '마이크 켜짐'}
                    </span>
                  </button>
                )}

                {/* 발언 나가기 (방장 아닌 발언자만) */}
                {isSpeaker && !isHost && (
                  <button
                    onClick={handleResignSpeaking}
                    className="flex items-center gap-2 px-4 py-2 bg-orange-100 hover:bg-orange-200 text-orange-600 rounded-full transition-colors"
                  >
                    <MicOff className="w-4 h-4" />
                    <span className="text-sm font-medium">발언 나가기</span>
                  </button>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={handleGoToRoom}
                  className="px-4 py-2 bg-purple-100 text-purple-600 rounded-full text-sm font-medium hover:bg-purple-200 transition-colors"
                >
                  방으로 이동
                </button>
                {/* 방 나가기 버튼 (호스트는 숨김 - 방송 종료로만 퇴장 가능) */}
                {!isHost && (
                  <button
                    onClick={handleLeave}
                    className="p-2 bg-red-100 text-red-600 rounded-full hover:bg-red-200 transition-colors"
                    title="방 나가기"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        }
      >
        {/* 발언자 목록 */}
        <div className="px-4 py-3 bg-gradient-to-r from-purple-50 to-pink-50 border-b border-gray-100">
          <div className="flex items-center gap-2 mb-3">
            <Crown className="w-4 h-4 text-[#FE3A8F]" />
            <span className="text-xs font-bold text-gray-700">발언자</span>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2">
            {hosts.filter(h => !h.left_at).map((host) => {
              const memberId = host.member_id || host.partner?.member?.id
              // peers Map에서 memberId가 일치하는 피어 찾기
              const peerEntry = memberId ? Array.from(peers.entries()).find(
                ([key]) => key.includes(`-${memberId}-`)
              ) : undefined
              const peerData = peerEntry?.[1]
              const isPeerSpeaking = peerData?.isSpeaking ?? false
              const isPeerMuted = peerData?.isMuted ?? false
              
              // 현재 사용자인지 확인 (로컬 사용자의 상태 사용)
              const isCurrentUser = isSpeaker && (
                host.member_id === room?.host_member_id || 
                host.partner?.member?.id === room?.host_partner?.member?.id
              )
              
              return (
                <SpeakerAvatar
                  key={host.id}
                  host={host}
                  isSpeaking={isCurrentUser ? localIsSpeaking : isPeerSpeaking}
                  isMuted={isCurrentUser ? isMuted : isPeerMuted}
                />
              )
            })}
          </div>
        </div>

        {/* 채팅 영역 */}
        <div 
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto px-4 py-3"
          style={{ minHeight: '250px' }}
        >
          {filteredChats.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              <MessageCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>채팅이 없습니다</p>
            </div>
          ) : (
            filteredChats.slice(-50).map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                hosts={hosts}
              />
            ))
          )}
        </div>
      </SlideSheet>
    </>
  )
}

