import { memo } from 'react'
import { Send } from 'lucide-react'
import { Avatar } from '@/components'

interface MessagePartner {
  id: string
  name: string
  profileImage?: string | null
  hasUnreadMessage?: boolean
}

interface InstagramStyleMessagesProps {
  partners: MessagePartner[]
  onPartnerClick?: (partnerId: string) => void
  className?: string
}

export const InstagramStyleMessages = memo(function InstagramStyleMessages({
  partners,
  onPartnerClick,
  className = ''
}: InstagramStyleMessagesProps) {
  // 읽지 않은 메시지가 있는 파트너들을 앞으로 정렬
  const sortedPartners = [...partners].sort((a, b) => {
    if (a.hasUnreadMessage && !b.hasUnreadMessage) return -1
    if (!a.hasUnreadMessage && b.hasUnreadMessage) return 1
    return 0
  })

  return (
    <div className={`flex items-center gap-3 p-4 bg-white rounded-2xl shadow-md ${className}`}>
      {/* 메시지 아이콘 */}
      <div className="flex items-center justify-center w-10 h-10 bg-gray-100 rounded-full">
        <Send size={20} className="text-gray-600" />
      </div>

      {/* 메시지 텍스트 */}
      <span className="text-gray-800 font-medium mr-2">메시지</span>

      {/* 파트너 프로필 이미지들 */}
      <div className="flex -space-x-2">
        {sortedPartners.slice(0, 3).map((partner, index) => (
          <div
            key={partner.id}
            onClick={() => onPartnerClick?.(partner.id)}
            className="relative cursor-pointer hover:z-10 hover:scale-110 transition-transform"
            style={{ zIndex: 3 - index }}
          >
            <Avatar
              src={partner.profileImage}
              alt={partner.name}
              size="md"
              className={`border-2 border-white ${
                partner.hasUnreadMessage ? 'ring-2 ring-red-500' : ''
              }`}
            />
            {partner.hasUnreadMessage && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 border-2 border-white rounded-full"></div>
            )}
          </div>
        ))}

        {/* 더 많은 파트너가 있는 경우 표시 */}
        {partners.length > 3 && (
          <div className="flex items-center justify-center w-10 h-10 bg-gray-200 border-2 border-white rounded-full text-xs font-medium text-gray-600">
            +{partners.length - 3}
          </div>
        )}
      </div>
    </div>
  )
})