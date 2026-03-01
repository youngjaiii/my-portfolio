import { useNavigate } from '@tanstack/react-router'
import type { Database } from '@/types/database'
import { AvatarWithFallback } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Flex } from '@/components/ui/Flex'
import { GameBadges } from '@/components/ui/GameBadges'
import { OnlineIndicator } from '@/components/ui/OnlineIndicator'
import { StarRating } from '@/components/ui/StarRating'
import { Typography } from '@/components/ui/Typography'
import { useChatStore } from '@/store/useChatStore'
import { useAuthStore } from '@/store/useAuthStore'
import { getStatusColor, getStatusLabel } from '@/utils/statusUtils'

type Member = Database['public']['Tables']['members']['Row']

interface PartnerWithMember {
  id: string // partners 테이블의 ID
  member_id: string
  partner_name: string | null
  partner_message: string | null
  partner_status: 'none' | 'pending' | 'approved' | 'rejected'
  partner_applied_at: string
  partner_reviewed_at: string | null
  total_points: number
  game_info: any | null
  created_at: string
  updated_at: string
  member: Member
  averageRating?: number
  reviewCount?: number
  receivedReviews?: Array<any>
}

interface PartnerCardProps {
  partner: PartnerWithMember
  variant?: 'default' | 'recent'
}

const isOnlineStatus = (status: Member['current_status']) => {
  return status !== 'offline'
}

export function PartnerCard({
  partner,
  variant = 'default',
}: PartnerCardProps) {
  const navigate = useNavigate()
  const { addTempChatRoom } = useChatStore()
  const { user } = useAuthStore()

  const handleQuickChat = () => {
    // 로그인 체크
    if (!user) {
      navigate({ to: '/login' })
      return
    }

    const partnerName =
      partner.partner_name ||
      partner.member.name ||
      partner.member.member_code ||
      'Unknown'

    // Zustand store에 임시 채팅방 추가
    addTempChatRoom({
      partnerId: partner.member_id,
      partnerName,
      partnerAvatar: partner.member.profile_image || undefined,
    })

    // 채팅 페이지로 이동
    navigate({
      to: '/chat',
      search: {
        partnerId: partner.member_id,
        partnerName,
      },
    })
  }

  const handleProfileView = () => {
    navigate({ to: `/partners/${partner.member.member_code}` })
  }

  if (variant === 'recent') {
    return (
      <div
        className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg hover:shadow-blue-50 transition-all duration-300 cursor-pointer transform hover:scale-[1.02] group"
        onClick={handleProfileView}
      >
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-full overflow-hidden ring-2 ring-transparent group-hover:ring-blue-200 transition-all duration-300">
              {partner.member.profile_image ? (
                <img
                  src={partner.member.profile_image}
                  alt={partner.partner_name || partner.member.name || partner.member.member_code || 'Unknown'}
                  className="w-full h-full object-cover"
                />
              ) : (
                <AvatarWithFallback
                  name={
                    partner.partner_name ||
                    partner.member.name ||
                    partner.member.member_code ||
                    'Unknown'
                  }
                  src={undefined}
                  size="md"
                  className="w-full h-full"
                />
              )}
            </div>
            <div className="absolute -bottom-1 -right-1">
              <OnlineIndicator
                isOnline={isOnlineStatus(partner.member.current_status)}
                size="sm"
              />
            </div>
          </div>

          <div className="flex-1">
            <Typography
              variant="h5"
              className="font-semibold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors duration-300"
            >
              {partner.partner_name ||
                partner.member.name ||
                partner.member.member_code}
            </Typography>
            <div className="mb-1">
              <GameBadges
                favoriteGames={partner.member.favorite_game}
                size="sm"
                maxDisplay={2}
              />
            </div>
            <Typography variant="caption" color="text-secondary">
              마지막 접속:{' '}
              {new Date(partner.member.updated_at).toLocaleDateString('ko-KR')}
            </Typography>
          </div>

          <div className="text-right">
            {partner.averageRating ? (
              <Flex align="center" gap={1} className="mb-2 justify-end">
                <StarRating rating={partner.averageRating} size="sm" />
                <Typography variant="caption" color="text-secondary">
                  ({partner.averageRating.toFixed(1)})
                </Typography>
              </Flex>
            ) : (
              <Flex align="center" gap={1} className="mb-2 justify-end">
                <Typography
                  variant="caption"
                  color="text-secondary"
                  className="mb-2"
                >
                  새로운 파트너예요
                </Typography>
              </Flex>
            )}
            <div className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium group-hover:bg-blue-100 transition-colors duration-300">
              프로필 보기
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="bg-gradient-to-br from-white via-blue-50/30 to-purple-50/20 rounded-2xl shadow-lg border border-gray-100 p-4 md:p-6 hover:shadow-xl hover:shadow-blue-100/50 transition-all duration-300 cursor-pointer transform hover:scale-[1.02] group backdrop-blur-sm h-full flex flex-col"
      onClick={handleProfileView}
    >
      <div className="flex flex-col h-full flex-1">
        <div className="flex-1">
          <Flex justify="center" className="mb-3 md:mb-4">
            <div className="relative">
              <div className="w-20 h-20 md:w-24 md:h-24 lg:w-28 lg:h-28 rounded-full overflow-hidden ring-4 ring-white shadow-lg group-hover:ring-blue-100 transition-all duration-300">
                {partner.member.profile_image ? (
                  <img
                    src={partner.member.profile_image}
                    alt={partner.partner_name || partner.member.name || partner.member.member_code || 'Unknown'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <AvatarWithFallback
                    name={
                      partner.partner_name ||
                      partner.member.name ||
                      partner.member.member_code ||
                      'Unknown'
                    }
                    src={undefined}
                    size="lg"
                    className="w-full h-full"
                  />
                )}
              </div>
              <div className="absolute -bottom-1 -right-1">
                <OnlineIndicator
                  isOnline={isOnlineStatus(partner.member.current_status)}
                />
              </div>
            </div>
          </Flex>

          <div className="text-center mb-3 md:mb-4">
            <Typography
              variant="h5"
              className="font-bold text-gray-900 mb-1 group-hover:text-blue-700 transition-colors duration-300 md:text-lg"
            >
              {partner.partner_name ||
                partner.member.name ||
                partner.member.member_code}
            </Typography>
            <div className="mb-2 flex justify-center">
              <GameBadges
                favoriteGames={partner.member.favorite_game}
                size="sm"
                maxDisplay={2}
              />
            </div>

            {partner.averageRating ? (
              <Flex align="center" gap={2} className="mb-2" justify="center">
                <StarRating rating={partner.averageRating} size="sm" />
                <Typography variant="caption" color="text-secondary" className="text-xs">
                  ({partner.averageRating.toFixed(1)}) · 리뷰{' '}
                  {partner.reviewCount || 0}개
                </Typography>
              </Flex>
            ) : (
              <div className="mb-2 inline-block px-2 py-1 bg-gradient-to-r from-green-100 to-emerald-100 text-green-700 rounded-full text-xs font-medium">
                새로운 파트너예요 ✨
              </div>
            )}

            <Typography
              variant="body2"
              className="text-gray-600 mb-2 line-clamp-2 italic text-sm"
            >
              {partner.partner_message || '인사말이 없습니다'}
            </Typography>

            <Flex align="center" gap={1} className="mb-3" justify="center">
              <div
                className={`w-2 h-2 rounded-full ${
                  isOnlineStatus(partner.member.current_status)
                    ? 'bg-green-500 animate-pulse'
                    : 'bg-gray-400'
                }`}
              />
              <Typography
                variant="caption"
                className={`${getStatusColor(partner.member.current_status)} font-medium text-xs`}
              >
                {getStatusLabel(partner.member.current_status)}
              </Typography>
            </Flex>
          </div>
        </div>

        <div className="flex flex-col gap-2 pt-3 border-t border-gray-100/80">
          <div className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold py-2.5 px-4 rounded-xl text-center group-hover:from-blue-600 group-hover:to-purple-700 transition-all duration-300 shadow-lg text-sm">
            프로필 보기
          </div>

          <button
            className="w-full bg-white/80 hover:bg-white border border-gray-200 text-gray-700 font-medium py-2 px-4 rounded-xl transition-all duration-300 hover:shadow-md text-sm"
            onClick={(e) => {
              e.stopPropagation()
              handleQuickChat()
            }}
          >
            빠른 채팅
          </button>
        </div>
      </div>
    </div>
  )
}
