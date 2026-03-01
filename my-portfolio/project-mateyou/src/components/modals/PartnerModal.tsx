import {
  AvatarWithFallback,
  Button,
  Flex,
  Modal,
  OnlineIndicator,
  StarRating,
  Typography,
} from '@/components'
import { maskId } from '@/utils/maskId'

interface Partner {
  id: string
  name: string
  favoriteGames: string
  greeting: string
  photo?: string
  gameInfo?: string
  isOnline?: boolean
}

interface Review {
  id: string
  text: string
  author: string
  authorId: string
  rating: number
}

interface PartnerModalProps {
  isOpen: boolean
  onClose: () => void
  partner: Partner | null
}

const mockReviews: Array<Review> = [
  {
    id: '1',
    text: '정말 친절하고 실력도 좋아요!',
    author: '김민수',
    authorId: 'discord123456789',
    rating: 5,
  },
  {
    id: '2',
    text: '함께 게임하는 동안 너무 즐거웠습니다.',
    author: '박영희',
    authorId: 'gamer987654321',
    rating: 4.5,
  },
  {
    id: '3',
    text: '프로페셔널하고 재미있는 파트너입니다.',
    author: '이철수',
    authorId: 'player555666777',
    rating: 4,
  },
]

export function PartnerModal({ isOpen, onClose, partner }: PartnerModalProps) {
  if (!partner) return null

  const averageRating =
    mockReviews.reduce((sum, review) => sum + review.rating, 0) /
    mockReviews.length

  const headerActions = partner.isOnline ? (
    <Flex align="center" gap={2}>
      <Button variant="primary" size="sm">
        예약하기
      </Button>
    </Flex>
  ) : null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={partner.name}
      size="xl"
      headerActions={headerActions}
    >
      <Flex direction="column" className="lg:flex-row gap-6 lg:gap-8">
        <div className="lg:w-1/3 w-full">
          <Flex
            className="relative w-full h-48 sm:h-56 lg:h-64 bg-gray-200 rounded-lg mb-4"
            justify="center"
            align="center"
          >
            <AvatarWithFallback
              name={partner.name}
              src={partner.photo}
              size="xl"
              className="w-24 h-24 sm:w-28 sm:h-28 lg:w-32 lg:h-32"
            />
            {partner.isOnline && (
              <div className="absolute top-3 right-3">
                <OnlineIndicator isOnline={partner.isOnline} size="lg" />
              </div>
            )}
          </Flex>
          <Flex
            direction="column"
            className="lg:block items-center lg:items-start"
          >
            <Flex align="center" gap={2} className="mb-2">
              <Typography variant="h4" className="text-center lg:text-left">
                {partner.name}
              </Typography>
            </Flex>
            <Typography
              variant="body2"
              color="text-secondary"
              className="text-center lg:text-left"
            >
              파트너 ID: {maskId(partner.id)}
            </Typography>
          </Flex>
        </div>

        <div className="lg:w-2/3 w-full">
          <div className="space-y-4 sm:space-y-6">
            <div>
              <Typography variant="h5" className="mb-2">
                선호하는 게임
              </Typography>
              <Typography variant="body1" color="text-secondary">
                {partner.favoriteGames}
              </Typography>
            </div>

            <div>
              <Typography variant="h5" className="mb-2">
                게임 정보
              </Typography>
              <Typography variant="body1" color="text-secondary">
                {partner.gameInfo || '랭크: 다이아몬드, 주 포지션: 원딜'}
              </Typography>
            </div>

            <div>
              <Typography variant="h5" className="mb-2">
                인사말
              </Typography>
              <Typography variant="body1" color="text-secondary">
                {partner.greeting}
              </Typography>
            </div>

            <div>
              <Flex
                direction="column"
                className="sm:flex-row sm:items-center sm:justify-between mb-4 gap-2"
              >
                <Typography variant="h5">리뷰</Typography>
                <Flex align="center" gap={2}>
                  <StarRating rating={averageRating} showRating />
                  <Typography variant="caption" color="text-disabled">
                    ({mockReviews.length}개 리뷰)
                  </Typography>
                </Flex>
              </Flex>

              <div className="space-y-3 sm:space-y-4 max-h-48 sm:max-h-60 overflow-y-auto">
                {mockReviews.map((review) => (
                  <div
                    key={review.id}
                    className="border-l-4 border-blue-500 pl-3 sm:pl-4 py-2"
                  >
                    <Flex
                      justify="between"
                      align="center"
                      className="mb-1 sm:mb-2"
                    >
                      <StarRating rating={review.rating} size="sm" />
                      <div className="text-right">
                        <Typography variant="caption" color="text-disabled">
                          {review.author} · ID: {maskId(review.authorId)}
                        </Typography>
                      </div>
                    </Flex>
                    <Typography
                      variant="body2"
                      color="text-secondary"
                      className="break-words"
                    >
                      "{review.text}"
                    </Typography>
                  </div>
                ))}
              </div>
            </div>

            <Flex
              direction="column"
              className="sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3 pt-4 border-t"
            >
              <Button
                variant="outline"
                onClick={onClose}
                className="w-full sm:w-auto"
              >
                닫기
              </Button>
              {!partner.isOnline && (
                <Button variant="primary" className="w-full sm:w-auto">
                  예약하기
                </Button>
              )}
            </Flex>
          </div>
        </div>
      </Flex>
    </Modal>
  )
}
