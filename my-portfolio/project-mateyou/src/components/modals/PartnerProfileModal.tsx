import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { Database } from '@/types/database'
import {
  AvatarWithFallback,
  Button,
  Flex,
  GameBadges,
  GameInfoDisplay,
  Modal,
  OnlineIndicator,
  PartnerRequestModal,
  StarRating,
  Typography,
} from '@/components'
import { usePartnerReviews } from '@/hooks/useMembers'
import { usePartnerJobs } from '@/hooks/usePartnerJobs'
import { useAuthStore } from '@/store/useAuthStore'
import { getStatusColor } from '@/utils/statusUtils'

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

interface PartnerProfileModalProps {
  isOpen: boolean
  onClose: () => void
  partner: PartnerWithMember
  onQuickChat?: () => void
  isLoading?: boolean
}

const isOnlineStatus = (
  status: 'online' | 'offline' | 'in_game' | 'matching' | string,
) => {
  return status !== 'offline'
}

export function PartnerProfileModal({
  isOpen,
  onClose,
  partner,
  onQuickChat,
  isLoading = false,
}: PartnerProfileModalProps) {
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false)
  const navigate = useNavigate()
  const { user } = useAuthStore()

  // 파트너의 리뷰를 동적으로 가져오기 (partners 테이블의 ID 사용)
  const { data: partnerReviews = [], isLoading: isReviewsLoading } =
    usePartnerReviews(partner.id) // partner.id는 이럴 partners 테이블의 ID

  // 파트너의 직무 정보 가져오기 (member_id 사용) - 활성화된 것만
  const { jobs: activeJobs, isLoading: jobsLoading } = usePartnerJobs(
    partner.member_id,
    true,
  )
  const hasActiveJobs = activeJobs.length > 0

  const handleRequestClick = () => {
    // 로그인 체크
    if (!user) {
      navigate({ to: '/login' })
      return
    }
    setIsRequestModalOpen(true)
  }

  const handleQuickChatClick = () => {
    // 로그인 체크
    if (!user) {
      navigate({ to: '/login' })
      return
    }
    onQuickChat?.()
  }
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="파트너 프로필" size="md">
      <div className="p-6">
        {/* 프로필 헤더 */}
        <Flex justify="center" className="mb-6">
          <div className="relative">
            <AvatarWithFallback
              name={
                partner.partner_name ||
                partner.member.name ||
                partner.member.member_code ||
                'Unknown'
              }
              src={partner.member.profile_image || undefined}
              size="xl"
            />
            <div className="absolute -bottom-2 -right-2">
              <OnlineIndicator
                isOnline={isOnlineStatus(partner.member.current_status)}
                size="lg"
              />
            </div>
          </div>
        </Flex>

        {/* 기본 정보 */}
        <div className="text-center mb-6">
          <Typography variant="h3" className="font-bold text-gray-900 mb-2">
            {partner.partner_name ||
              partner.member.name ||
              partner.member.member_code}
          </Typography>

          <Flex align="center" gap={1} className="mb-3" justify="center">
            <div
              className={`w-2 h-2 rounded-full ${
                isOnlineStatus(partner.member.current_status)
                  ? 'bg-green-500'
                  : 'bg-gray-400'
              }`}
            />
            <Typography
              variant="body1"
              className={getStatusColor(partner.member.current_status)}
            >
              {partner.member.current_status}
            </Typography>
          </Flex>

          {partnerReviews.length > 0 ? (
            <Flex align="center" gap={2} className="mb-4" justify="center">
              <StarRating
                rating={
                  partnerReviews.reduce(
                    (sum: number, review: any) => sum + review.rating,
                    0,
                  ) / partnerReviews.length
                }
                size="md"
              />
              <Typography variant="body1" color="text-secondary">
                (
                {(
                  partnerReviews.reduce(
                    (sum: number, review: any) => sum + review.rating,
                    0,
                  ) / partnerReviews.length
                ).toFixed(1)}
                ) · 리뷰 {partnerReviews.length}개
              </Typography>
            </Flex>
          ) : (
            <Typography variant="body1" color="text-secondary" className="mb-4">
              새로운 파트너예요
            </Typography>
          )}
        </div>

        {/* 상세 정보 */}
        <div className="space-y-4 mb-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <Typography variant="body2" color="text-secondary" className="mb-3">
              선호 게임
            </Typography>
            <GameBadges
              favoriteGames={partner.member.favorite_game}
              size="md"
            />
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <Typography variant="body2" color="text-secondary" className="mb-1">
              인사말
            </Typography>
            <Typography variant="body1">
              {partner.partner_message || '인사말이 없습니다'}
            </Typography>
          </div>

          {partner.game_info && (
            <div>
              <Typography
                variant="body2"
                color="text-secondary"
                className="mb-3"
              >
                게임 정보
              </Typography>
              <GameInfoDisplay gameInfo={partner.game_info} />
            </div>
          )}

          <div className="bg-gray-50 rounded-lg p-4">
            <Typography variant="body2" color="text-secondary" className="mb-1">
              가입일
            </Typography>
            <Typography variant="body1">
              {new Date(partner.member.created_at).toLocaleDateString('ko-KR')}
            </Typography>
          </div>

          {/* 받은 리뷰 섹션 */}
          {isReviewsLoading ? (
            <div className="flex justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            </div>
          ) : partnerReviews.length > 0 ? (
            <div>
              <Typography
                variant="body2"
                color="text-secondary"
                className="mb-3"
              >
                최근 리뷰 ({partnerReviews.length}개)
              </Typography>
              <div className="space-y-3 max-h-40 overflow-y-auto">
                {partnerReviews
                  .slice(0, 5)
                  .map((review: any, index: number) => (
                    <div
                      key={review.id || index}
                      className="bg-white rounded-lg p-3 border border-gray-100"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <StarRating rating={review.rating} size="sm" />
                        <Typography variant="caption" color="text-secondary">
                          {new Date(review.created_at).toLocaleDateString(
                            'ko-KR',
                          )}
                        </Typography>
                      </div>
                      <Typography variant="body2" className="text-gray-700">
                        {review.comment || '코멘트 없음'}
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text-secondary"
                        className="mt-1 block"
                      >
                        by {review.reviewer_name || '익명***'}
                      </Typography>
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <Typography variant="body2" color="text-disabled">
                아직 받은 리뷰가 없습니다
              </Typography>
            </div>
          )}
        </div>

        {/* 액션 버튼 */}
        <Flex gap={2}>
          <Button
            variant="outline"
            size="md"
            onClick={onClose}
            className="flex-1"
          >
            닫기
          </Button>
          <Button
            variant="outline"
            size="md"
            onClick={handleRequestClick}
            disabled={!hasActiveJobs || jobsLoading}
            className="flex-1"
            title={
              !hasActiveJobs ? '현재 활성화된 서비스가 없습니다' : undefined
            }
          >
            {jobsLoading
              ? '확인 중...'
              : !hasActiveJobs
                ? '서비스 중단'
                : '의뢰하기'}
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleQuickChatClick}
            disabled={isLoading || partner.member.current_status !== 'online'}
            className="flex-1"
          >
            {isLoading ? '연결 중...' : '빠른 채팅'}
          </Button>
        </Flex>

        {/* 의뢰하기 모달 */}
        <PartnerRequestModal
          isOpen={isRequestModalOpen}
          onClose={() => setIsRequestModalOpen(false)}
          partnerId={partner.member_id}
          partnerName={partner.partner_name || partner.member.name || undefined}
          onSuccess={() => {
            // 의뢰 성공 시 메인 모달도 닫기
            setIsRequestModalOpen(false)
            onClose()
          }}
        />
      </div>
    </Modal>
  )
}
