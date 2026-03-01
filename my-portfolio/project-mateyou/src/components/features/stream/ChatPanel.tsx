/**
 * ChatPanel - 채팅 패널 컴포넌트
 * 
 * 채팅 메시지 목록과 입력 영역을 포함하는 공통 컴포넌트
 * 채팅 입력 상태를 내부에서 관리하여 불필요한 부모 리렌더링 방지
 * 
 * PC 버전: 프로페셔널한 스타일, 더 넓은 채팅 영역
 * 모바일 버전: 반투명 오버레이 스타일
 */

import { PinnedChatMessage } from './PinnedChatMessage'
import { StreamChatMessage } from './StreamChatMessage'
import { useStreamChat } from '@/hooks/useStreamChat'
import { Gift, List, MessageCircle, Send, Smile } from 'lucide-react'
import { memo } from 'react'
import type { StreamChat } from '@/hooks/useVoiceRoom'

interface ChatPanelProps {
  roomId: string
  filteredChats: StreamChat[]
  pinnedMessage: StreamChat | null
  isChatOpen: boolean
  isHost: boolean
  isModeratorView: boolean
  rankMap: Map<string, number>
  chatContainerRef: React.RefObject<HTMLDivElement | null>
  getSenderRole: (senderId: string) => 'owner' | 'speaker' | 'listener'
  onMessageClick?: (message: StreamChat) => void
  onHideToggle?: (messageId: number, isHidden: boolean) => Promise<void>
  onUnpinMessage?: () => void
  onOpenDonationList?: () => void
  onOpenDonationSheet?: () => void
  /** 
   * mobile: 세로모드 모바일 (하단 오버레이)
   * mobile-landscape: 가로모드 모바일 (우측 사이드바, 컴팩트)
   * desktop: PC 버전
   */
  variant?: 'mobile' | 'mobile-landscape' | 'desktop'
  /** 전체화면 집중 모드에서 채팅 헤더를 숨길 때 사용 */
  hideChatHeader?: boolean
}

// 채팅 입력 컴포넌트 분리 (입력 시 이 컴포넌트만 리렌더링)
const ChatInput = memo(function ChatInput({
  roomId,
  isHost,
  onOpenDonationList,
  onOpenDonationSheet,
  variant,
}: {
  roomId: string
  isHost: boolean
  onOpenDonationList?: () => void
  onOpenDonationSheet?: () => void
  variant: 'mobile' | 'mobile-landscape' | 'desktop'
}) {
  const { inputValue, setInputValue, sendMessage } = useStreamChat({
    roomId,
    enableOptimisticUI: true,
  })

  const handleSend = () => {
    if (!inputValue.trim()) return
    sendMessage()
  }

  // 가로모드 모바일: 매우 컴팩트한 입력창
  if (variant === 'mobile-landscape') {
    return (
      <div 
        className="flex items-center gap-1 px-1 py-1 border-t border-white/10 min-w-0"
        style={{
          // 키보드가 올라오면 패딩 추가 (iOS Safari 대응)
          paddingBottom: 'max(4px, var(--keyboard-height, 0px))',
        }}
      >
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return
            if (e.key === 'Enter') handleSend()
          }}
          placeholder="메시지..."
          className="flex-1 min-w-0 px-2 py-1 bg-white/10 rounded text-[10px] text-gray-100 placeholder:text-gray-500 focus:outline-none"
        />
        <button
          onClick={handleSend}
          disabled={!inputValue.trim()}
          className={`flex-shrink-0 p-1.5 rounded transition-all ${
            inputValue.trim()
              ? 'bg-[#FE3A8F] text-white'
              : 'bg-white/10 text-gray-500'
          }`}
        >
          <Send className="w-3 h-3" />
        </button>
        {isHost ? (
          <button
            onClick={onOpenDonationList}
            className="flex-shrink-0 p-1.5 rounded bg-gradient-to-br from-amber-400 to-orange-500 text-white"
            title="후원 목록"
          >
            <List className="w-3 h-3" />
          </button>
        ) : (
          <button
            onClick={onOpenDonationSheet}
            className="flex-shrink-0 p-1.5 rounded bg-gradient-to-br from-amber-400 to-orange-500 text-white"
            title="후원하기"
          >
            <Gift className="w-3 h-3" />
          </button>
        )}
      </div>
    )
  }

  if (variant === 'desktop') {
    return (
      <div className="p-4 bg-[#1a1825]/80 border-t border-white/10">
        {/* 입력 영역 */}
        <div className="flex items-center gap-2 bg-white/5 rounded-xl p-1 border border-white/10">
          <button
            className="p-2 text-gray-400 hover:text-white transition-colors"
            title="이모지"
          >
            <Smile className="w-5 h-5" />
          </button>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return
              if (e.key === 'Enter') handleSend()
            }}
            placeholder="채팅을 입력하세요..."
            className="flex-1 min-w-0 px-2 py-2 bg-transparent text-sm text-white placeholder:text-gray-500 focus:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim()}
            className={`p-2 rounded-lg transition-all duration-200 ${
              inputValue.trim()
                ? 'bg-[#FE3A8F] text-white shadow-lg shadow-[#FE3A8F]/30 hover:bg-[#fe4a9a]'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        
        {/* 후원 버튼 */}
        <div className="mt-3">
          {isHost ? (
            <button
              onClick={onOpenDonationList}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium text-sm shadow-lg shadow-amber-500/20 hover:from-amber-400 hover:to-orange-400 transition-all duration-200"
            >
              <List className="w-4 h-4" />
              <span>후원 관리</span>
            </button>
          ) : (
            <button
              onClick={onOpenDonationSheet}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium text-sm shadow-lg shadow-amber-500/20 hover:from-amber-400 hover:to-orange-400 transition-all duration-200"
            >
              <Gift className="w-4 h-4" />
              <span>후원하기</span>
            </button>
          )}
        </div>
      </div>
    )
  }

  // 모바일 버전
  return (
    <div 
      className="flex items-center gap-2 px-2 py-2 border-t border-white/10 min-w-0"
      style={{
        // 키보드가 올라오면 패딩 추가 (iOS Safari 대응)
        paddingBottom: 'max(8px, var(--keyboard-height, 0px))',
      }}
    >
      <input
        type="text"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Enter') handleSend()
        }}
        placeholder="메시지를 입력하세요..."
        className="flex-1 min-w-0 px-4 py-2.5 bg-white/10 backdrop-blur-sm rounded-md text-[14px] text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-100/30 transition-all"
      />
      <button
        onClick={handleSend}
        disabled={!inputValue.trim()}
        className={`flex-shrink-0 p-2.5 rounded-full transition-all duration-200 ${
          inputValue.trim()
            ? 'bg-[#FE3A8F] text-white shadow-lg shadow-[#FE3A8F]/30 hover:bg-[#fe4a9a]'
            : 'bg-white/10 hover:bg-white/20 backdrop-blur-sm text-gray-400'
        }`}
      >
        <Send className="w-5 h-5" />
      </button>
      {isHost ? (
        <button
          onClick={onOpenDonationList}
          className="flex-shrink-0 p-2.5 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-400/30 hover:from-amber-500 hover:to-orange-600 transition-all duration-200"
          title="후원 목록"
        >
          <List className="w-5 h-5" />
        </button>
      ) : (
        <button
          onClick={onOpenDonationSheet}
          className="flex-shrink-0 p-2.5 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-lg shadow-amber-400/30 hover:from-amber-500 hover:to-orange-600 transition-all duration-200"
          title="후원하기"
        >
          <Gift className="w-5 h-5" />
        </button>
      )}
    </div>
  )
})

export function ChatPanel({
  roomId,
  filteredChats,
  pinnedMessage,
  isChatOpen,
  isHost,
  isModeratorView,
  rankMap,
  chatContainerRef,
  getSenderRole,
  onMessageClick,
  onHideToggle,
  onUnpinMessage,
  onOpenDonationList,
  onOpenDonationSheet,
  variant = 'mobile',
  hideChatHeader = false,
}: ChatPanelProps) {
  const isDesktop = variant === 'desktop'
  const isLandscape = variant === 'mobile-landscape'
  const density = isDesktop ? 'comfortable' : 'compact'

  // 모바일 세로: 토글 가능, 데스크톱/가로모드: 항상 표시
  if (!isChatOpen && !isDesktop && !isLandscape) {
    return null
  }

  // PC 버전: 프로페셔널한 채팅 패널
  if (isDesktop) {
    return (
      <div className="flex flex-col h-full bg-gradient-to-b from-[#1a1825] to-[#110f1a]">
        {/* 채팅 헤더 - hideChatHeader가 true면 숨김 */}
        {!hideChatHeader && (
          <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
            <MessageCircle className="w-4 h-4 text-[#FE3A8F]" />
            <span className="text-white font-medium text-sm">실시간 채팅</span>
            <span className="ml-auto text-xs text-gray-500">{filteredChats.length}개 메시지</span>
          </div>
        )}

        {/* 고정된 메시지 */}
        {pinnedMessage && (
          <div className="px-4 py-3 bg-[#FE3A8F]/10 border-b border-[#FE3A8F]/20">
            <PinnedChatMessage
              message={pinnedMessage}
              role={getSenderRole(pinnedMessage.sender_id)}
              variant="video"
              density={density}
              onUnpin={onUnpinMessage}
              canUnpin={isModeratorView}
              fanRank={rankMap.get(pinnedMessage.sender_id) || null}
            />
          </div>
        )}

        {/* 채팅 메시지 리스트 */}
        <div
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent hover:scrollbar-thumb-white/20"
        >
          {filteredChats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <MessageCircle className="w-12 h-12 mb-3 opacity-30" />
              <p className="text-sm">아직 채팅이 없습니다</p>
              <p className="text-xs mt-1">첫 번째 메시지를 보내보세요!</p>
            </div>
          ) : (
            filteredChats.map((chat) => (
              <StreamChatMessage
                key={chat.id}
                message={chat}
                role={getSenderRole(chat.sender_id)}
                variant="video"
                density={density}
                isModeratorView={isModeratorView}
                onMessageClick={onMessageClick}
                onHideToggle={onHideToggle}
                fanRank={rankMap.get(chat.sender_id) || null}
              />
            ))
          )}
        </div>

        {/* 채팅 입력 */}
        <ChatInput
          roomId={roomId}
          isHost={isHost}
          onOpenDonationList={onOpenDonationList}
          onOpenDonationSheet={onOpenDonationSheet}
          variant={variant}
        />
      </div>
    )
  }

  // 가로모드 모바일: 우측 사이드바에 꽉 차게, 매우 컴팩트
  if (isLandscape) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* 고정된 메시지 */}
        {pinnedMessage && (
          <div className="flex-shrink-0 px-1 py-0.5 bg-[#FE3A8F]/10 border-b border-[#FE3A8F]/20">
            <PinnedChatMessage
              message={pinnedMessage}
              role={getSenderRole(pinnedMessage.sender_id)}
              variant="video"
              density="compact"
              onUnpin={onUnpinMessage}
              canUnpin={isModeratorView}
              fanRank={rankMap.get(pinnedMessage.sender_id) || null}
            />
          </div>
        )}

        {/* 채팅 메시지 리스트 - 전체 높이 사용 */}
        <div
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto px-1 py-0.5 space-y-px scrollbar-thin scrollbar-thumb-white/10"
          style={{
            scrollbarWidth: 'thin',
          }}
        >
          {filteredChats.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-500 text-[9px]">
              채팅이 없습니다
            </div>
          ) : (
            filteredChats.map((chat) => (
              <StreamChatMessage
                key={chat.id}
                message={chat}
                role={getSenderRole(chat.sender_id)}
                variant="video"
                density="compact"
                isModeratorView={isModeratorView}
                onMessageClick={onMessageClick}
                onHideToggle={onHideToggle}
                fanRank={rankMap.get(chat.sender_id) || null}
              />
            ))
          )}
        </div>

        {/* 채팅 입력 */}
        <ChatInput
          roomId={roomId}
          isHost={isHost}
          onOpenDonationList={onOpenDonationList}
          onOpenDonationSheet={onOpenDonationSheet}
          variant={variant}
        />
      </div>
    )
  }

  // 모바일 세로 버전
  return (
    <div className="relative bg-black/10 overflow-hidden">
      {/* 상단 fade out 효과 */}
      <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-transparent via-black/20 to-transparent pointer-events-none z-10" />

      {/* 고정된 메시지 */}
      {pinnedMessage && (
        <div className="sticky top-0 z-10 px-4 pb-2 bg-black/20 backdrop-blur-sm">
          <PinnedChatMessage
            message={pinnedMessage}
            role={getSenderRole(pinnedMessage.sender_id)}
            variant="video"
            density={density}
            onUnpin={onUnpinMessage}
            canUnpin={isModeratorView}
            fanRank={rankMap.get(pinnedMessage.sender_id) || null}
          />
        </div>
      )}

      {/* 채팅 메시지 리스트 */}
      <div
        ref={chatContainerRef}
        className="max-h-[25vh] overflow-y-auto px-0 py-1.5 space-y-0.5 scrollbar-hide relative"
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
          <div className="text-center py-4 text-white/50 text-sm">채팅이 없습니다</div>
        ) : (
          filteredChats.map((chat) => (
            <StreamChatMessage
              key={chat.id}
              message={chat}
              role={getSenderRole(chat.sender_id)}
              variant="video"
              density={density}
              isModeratorView={isModeratorView}
              onMessageClick={onMessageClick}
              onHideToggle={onHideToggle}
              fanRank={rankMap.get(chat.sender_id) || null}
            />
          ))
        )}
      </div>

      {/* 채팅 입력 */}
      <ChatInput
        roomId={roomId}
        isHost={isHost}
        onOpenDonationList={onOpenDonationList}
        onOpenDonationSheet={onOpenDonationSheet}
        variant={variant}
      />
    </div>
  )
}
