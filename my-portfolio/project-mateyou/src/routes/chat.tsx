import { useEffect } from 'react'
import { Outlet, createFileRoute, useMatches } from '@tanstack/react-router'
import { NotificationPermissionBanner, SimpleChatInterface } from '../components'
import { useDevice } from '@/hooks/useDevice'
import { clearAppBadge } from '@/hooks/useInitialPermissions'

interface ChatSearch {
  partnerId?: string
  partnerName?: string
  chatRoomId?: string
  tempMessage?: string
  jobRequest?: string // 퀘스트 요청 데이터 (JSON)
}

export const Route = createFileRoute('/chat')({
  component: ChatPage,
  validateSearch: (search: Record<string, unknown>): ChatSearch => {
    return {
      partnerId:
        typeof search.partnerId === 'string' ? search.partnerId : undefined,
      partnerName:
        typeof search.partnerName === 'string' ? search.partnerName : undefined,
      chatRoomId:
        typeof search.chatRoomId === 'string' ? search.chatRoomId : undefined,
      tempMessage:
        typeof search.tempMessage === 'string' ? search.tempMessage : undefined,
      jobRequest:
        typeof search.jobRequest === 'string' ? search.jobRequest : undefined,
    }
  },
})

function ChatPage() {
  const { partnerId, partnerName, chatRoomId, tempMessage, jobRequest } = Route.useSearch()
  const { isMobile } = useDevice()
  const matches = useMatches()

  // 채팅 화면 진입 시 뱃지 초기화
  useEffect(() => {
    void clearAppBadge()
  }, [])

  const hasChildRoute = matches.some(
    (match) => match.routeId.startsWith('/chat/') && match.routeId !== '/chat',
  )

  if (hasChildRoute) {
    return (
      <div className="min-h-screen">
        <Outlet />
      </div>
    )
  }

  // partnerName 디코딩
  const decodedPartnerName = partnerName ? decodeURIComponent(partnerName) : undefined

  // 모바일: 전체 화면 레이아웃 (헤더/푸터 없음, 하단 탭바 공간 확보)
  return (
    <div className={`flex flex-col bg-white text-[#110f1a] ${isMobile ? 'h-full overflow-hidden' : ''}`}>

      {isMobile ? (
        <div className="w-full flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <SimpleChatInterface
              initialPartnerId={partnerId}
              initialPartnerName={decodedPartnerName}
              initialChatRoomId={chatRoomId}
              initialTempMessage={tempMessage}
              initialJobRequest={jobRequest}
            />
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 relative min-h-[calc(100dvh-68px)]">
          <div className="w-full h-[calc(100dvh-68px)] bg-white rounded-lg shadow-sm">
            <SimpleChatInterface
              initialPartnerId={partnerId}
              initialPartnerName={decodedPartnerName}
              initialChatRoomId={chatRoomId}
              initialTempMessage={tempMessage}
              initialJobRequest={jobRequest}
            />
          </div>
          <div className="fixed bottom-4 left-0 right-0 z-50 px-4">
            <NotificationPermissionBanner id="chat-desktop" />
          </div>
        </div>
      )}
    </div>
  )
}
