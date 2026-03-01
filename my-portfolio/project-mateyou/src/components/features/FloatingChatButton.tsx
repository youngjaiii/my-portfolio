import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { useAuthStore } from '@/store/useAuthStore'
import { useGlobalRealtime } from '@/contexts/GlobalRealtimeProvider'
import { useDevice } from '@/hooks/useDevice'
import { InstagramStyleMessages } from '@/components'

export function FloatingChatButton() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { isMobile } = useDevice()
  const [isExpanded, setIsExpanded] = useState(false)

  // 전역 실시간 데이터 사용
  const { chatRooms: rooms, totalUnreadCount, markChatAsRead } = useGlobalRealtime()

  // 채팅 중인 모든 파트너들을 InstagramStyleMessages 형태로 변환
  const instagramPartners = rooms
    .slice(0, 5) // 최대 5개까지
    .map(room => ({
      id: room.partnerId,
      name: room.partnerName,
      profileImage: room.partnerAvatar,
      hasUnreadMessage: room.unreadCount > 0
    }))

  // 모바일에서는 표시하지 않음
  if (isMobile) {
    return null
  }

  // 로그인하지 않았으면 표시하지 않음
  if (!user) {
    return null
  }

  // 읽지 않은 메시지가 없어도 버튼은 표시 (다만 내용이 달라짐)

  const handlePartnerClick = (partnerId: string) => {
    const partner = rooms.find(room => room.partnerId === partnerId)
    if (partner) {
      // 읽지 않은 메시지 읽음 처리
      markChatAsRead(partnerId)

      navigate({
        to: '/chat',
        search: {
          partnerId: partnerId,
          partnerName: partner.partnerName,
        },
      })
      setIsExpanded(false)
    }
  }

  const handleToggleExpanded = () => {
    setIsExpanded(!isExpanded)
  }

  const handleGoToChat = () => {
    navigate({ to: '/chat' })
    setIsExpanded(false)
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <InstagramStyleMessages
        partners={instagramPartners}
        onPartnerClick={handlePartnerClick}
        className="mb-4 cursor-pointer"
      />
    </div>
  )
}