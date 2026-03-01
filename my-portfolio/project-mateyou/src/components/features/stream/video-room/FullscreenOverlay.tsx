/**
 * FullscreenOverlay - 전체화면 모드 오버레이 컴포넌트
 * 
 * PC/모바일 공통으로 사용되는 전체화면 모드 UI
 * - 상단 컨트롤 (나가기, LIVE 배지, 채팅 토글)
 * - PC: 우측 채팅 사이드 패널
 * - 모바일: 하단 채팅
 */

import { ChatPanel } from '@/components/features/stream/ChatPanel'
import type { StreamChat } from '@/hooks/useVoiceRoom'
import {
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Minimize,
} from 'lucide-react'

interface FullscreenOverlayProps {
  // 레이아웃
  isDesktopLayout: boolean
  
  // 방 정보
  roomId: string
  
  // 사용자 상태
  isHost: boolean
  isModeratorView: boolean
  
  // 채팅 상태
  isChatOpen: boolean
  onToggleChat: () => void
  filteredChats: StreamChat[]
  pinnedMessage: StreamChat | null
  rankMap: Map<string, number>
  chatContainerRef: React.RefObject<HTMLDivElement | null>
  getSenderRole: (senderId: string) => 'owner' | 'speaker' | 'listener'
  onMessageClick: (message: StreamChat) => void
  onChatHideToggle?: (messageId: number, isHidden: boolean) => Promise<void>
  onUnpinMessage: () => void
  onOpenDonationList: () => void
  onOpenDonationSheet: () => void
  
  // 네비게이션
  onExitFullscreen: () => void
}

export function FullscreenOverlay({
  isDesktopLayout,
  roomId,
  isHost,
  isModeratorView,
  isChatOpen,
  onToggleChat,
  filteredChats,
  pinnedMessage,
  rankMap,
  chatContainerRef,
  getSenderRole,
  onMessageClick,
  onChatHideToggle,
  onUnpinMessage,
  onOpenDonationList,
  onOpenDonationSheet,
  onExitFullscreen,
}: FullscreenOverlayProps) {
  // PC 레이아웃: 우측 채팅 사이드 패널
  if (isDesktopLayout) {
    return (
      <>
        {/* 상단 컨트롤 */}
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
          {/* 전체화면 종료 버튼 */}
          <button
            onClick={onExitFullscreen}
            className="flex items-center gap-2 px-3 py-2 bg-black/60 hover:bg-black/80 backdrop-blur-sm rounded-lg text-white transition-colors"
            title="전체화면 종료 (ESC)"
          >
            <Minimize className="w-4 h-4" />
            <span className="text-sm">나가기</span>
          </button>
          {/* LIVE 배지 */}
          <div className="flex items-center gap-2 px-3 py-2 bg-black/60 backdrop-blur-sm rounded-lg">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-red-400 font-semibold text-sm">LIVE</span>
          </div>
        </div>

        {/* 채팅 토글 버튼 (< >) */}
        <button
          onClick={onToggleChat}
          className="fixed top-1/2 -translate-y-1/2 z-[9999] flex items-center justify-center w-10 h-24 bg-[#FE3A8F]/90 hover:bg-[#FE3A8F] text-white transition-all duration-300 rounded-l-xl shadow-lg shadow-[#FE3A8F]/30"
          style={{ right: isChatOpen ? '340px' : '0' }}
          title={isChatOpen ? '채팅 닫기' : '채팅 열기'}
        >
          {isChatOpen ? <ChevronRight className="w-6 h-6" /> : <ChevronLeft className="w-6 h-6" />}
        </button>

        {/* 우측 채팅 사이드 패널 */}
        <div className={`absolute top-0 right-0 bottom-0 transition-all duration-300 ease-in-out overflow-hidden ${
          isChatOpen ? 'w-[340px]' : 'w-0'
        }`}>
          <div className="flex flex-col border-l border-white/10 bg-gradient-to-b from-[#1a1825] to-[#110f1a] h-full w-[340px]">
            {/* 채팅 패널 */}
            <div className="flex-1 min-h-0">
              <ChatPanel
                roomId={roomId}
                filteredChats={filteredChats}
                pinnedMessage={pinnedMessage}
                isChatOpen={true}
                isHost={isHost}
                isModeratorView={isModeratorView}
                rankMap={rankMap}
                chatContainerRef={chatContainerRef}
                getSenderRole={getSenderRole}
                onMessageClick={onMessageClick}
                onHideToggle={onChatHideToggle}
                onUnpinMessage={onUnpinMessage}
                onOpenDonationList={onOpenDonationList}
                onOpenDonationSheet={onOpenDonationSheet}
                variant="desktop"
                hideChatHeader={false}
              />
            </div>
          </div>
        </div>
      </>
    )
  }

  // 모바일 레이아웃: 상단 컨트롤 + 하단 채팅
  return (
    <>
      {/* 상단 컨트롤 */}
      <div className="absolute top-0 left-0 right-0 z-30 p-4 bg-gradient-to-b from-black/50 to-transparent">
        <div className="flex items-center justify-between">
          {/* 전체화면 종료 버튼 */}
          <button
            onClick={onExitFullscreen}
            className="flex items-center gap-2 px-3 py-2 bg-black/60 hover:bg-black/80 backdrop-blur-sm rounded-full text-white transition-colors"
          >
            <Minimize className="w-4 h-4" />
            <span className="text-sm">나가기</span>
          </button>
          
          {/* LIVE 배지 */}
          <div className="flex items-center gap-2 px-3 py-2 bg-black/60 backdrop-blur-sm rounded-full">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-red-400 font-semibold text-sm">LIVE</span>
          </div>

          {/* 채팅 토글 버튼 */}
          <button
            onClick={onToggleChat}
            className={`flex items-center gap-2 px-3 py-2 backdrop-blur-sm rounded-full transition-colors ${
              isChatOpen
                ? 'bg-[#FE3A8F]/80 hover:bg-[#FE3A8F] text-white'
                : 'bg-black/60 hover:bg-black/80 text-white'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 하단 채팅 영역 */}
      {isChatOpen && (
        <div className="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/80 to-transparent">
          <ChatPanel
            roomId={roomId}
            filteredChats={filteredChats}
            pinnedMessage={pinnedMessage}
            isChatOpen={true}
            isHost={isHost}
            isModeratorView={isModeratorView}
            rankMap={rankMap}
            chatContainerRef={chatContainerRef}
            getSenderRole={getSenderRole}
            onMessageClick={onMessageClick}
            onHideToggle={onChatHideToggle}
            onUnpinMessage={onUnpinMessage}
            onOpenDonationList={onOpenDonationList}
            onOpenDonationSheet={onOpenDonationSheet}
            variant="mobile"
          />
        </div>
      )}
    </>
  )
}
