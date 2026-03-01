import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AvatarWithFallback, Button, Flex, ProfileEditModal, Typography } from '@/components'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/useAuthStore'
import { toggleFollowPartner } from '@/utils/followApi'
import { edgeApi } from '@/lib/edgeApi'
import { updateGlobalFollowState } from '@/routes/feed/all'

export const Route = createFileRoute('/partners/$partnerId' as const)({
  component: PartnerDetailPage,
})

function PartnerDetailPage() {
  const { partnerId } = Route.useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const authAccessToken = useAuthStore((state) => state.accessToken)
  const authRefreshToken = useAuthStore((state) => state.refreshToken)
  const syncSession = useAuthStore((state) => state.syncSession)
  const [isFollowing, setIsFollowing] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
  const isOwnProfile = user?.id === partnerId

  // API 호출하여 파트너 상세 정보 가져오기
  const { data: partnerData, isLoading, error } = useQuery({
    queryKey: ['partner-details-by-id', partnerId],
    queryFn: async () => {
      const response = await edgeApi.partners.getDetailsByPartnerId(partnerId)
      console.log('🔍 response:', response)
      if (!response.success) {
        throw new Error(response.error?.message || '파트너 정보를 불러오지 못했습니다.')
      }
      return response.data as any
    },
    enabled: !!partnerId,
  })

  const followCount = (partnerData as any)?.follow_count ?? 0
  
  // 디버깅
  useEffect(() => {
    if (partnerData) {
      console.log('🔍 partnerData:', partnerData)
      console.log('🔍 follow_count 직접:', (partnerData as any).follow_count)
      console.log('🔍 followCount 계산값:', followCount)
    }
  }, [partnerData, followCount])
  
  // API 응답에서 is_followed 상태 초기화
  useEffect(() => {
    if (partnerData?.is_followed !== undefined) {
      setIsFollowing(partnerData.is_followed)
    }
  }, [partnerData?.is_followed])

  const handleFollow = async () => {
    if (isOwnProfile) return
    if (!user) {
      navigate({ to: '/login' })
      return
    }
    const partnerUuid = partnerId
    const next = !isFollowing
    setIsFollowing(next)
    setIsProcessing(true)
    try {
      await toggleFollowPartner(partnerUuid, next, {
        accessToken: authAccessToken,
        refreshToken: authRefreshToken,
        syncSession,
      })
      // 전역 피드 캐시 업데이트 (팔로우 상태 동기화) - memberCode 사용
      const memberCode = partnerData?.member?.member_code || partnerUuid
      updateGlobalFollowState(memberCode, next)
    } catch (error: any) {
      setIsFollowing(!next)
      // 전역 피드 캐시 롤백 - memberCode 사용
      const memberCode = partnerData?.member?.member_code || partnerUuid
      updateGlobalFollowState(memberCode, !next)
      alert(error?.message || '팔로우 처리에 실패했습니다.')
    } finally {
      setIsProcessing(false)
    }
  }

  const handleMessage = () => {
    if (!user) {
      navigate({ to: '/login' })
      return
    }
    navigate({
      to: '/chat',
      search: {
        partnerId,
        partnerName: '파트너',
      },
    })
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <Typography variant="body1">로딩 중...</Typography>
        </div>
      </div>
    )
  }

  if (error || !partnerData) {
    return (
      <div className="container mx-auto p-6">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <Typography variant="body1" color="text-error">
            파트너 정보를 불러오지 못했습니다.
          </Typography>
        </div>
      </div>
    )
  }

  const partnerName = partnerData?.partner_name || partnerData?.member?.name || '파트너'
  const profileImage = partnerData?.member?.profile_image

  return (
    <>
      <div className="container mx-auto p-6">
        <div className="bg-white rounded-lg shadow-lg p-8 space-y-6">
        <Flex direction="column" gap={8} className="md:flex-row">
          <div className="md:w-1/3">
            <Flex
              align="center"
              justify="center"
              className="w-full h-64 bg-gray-200 rounded-lg mb-4"
            >
              <AvatarWithFallback
                name={partnerName}
                src={profileImage}
                size="xl"
                className="w-32 h-32"
              />
            </Flex>
            <Typography variant="h2" className="mb-2">
              {partnerName}
            </Typography>
            <Typography variant="body2" color="text-secondary" className="mb-2">
              파트너 ID: {partnerId}
            </Typography>
            <div className="mt-6 flex flex-wrap gap-6 text-sm mb-6 text-gray-600">
              <span>
                <strong className="mr-1 text-[#110f1a]">0</strong>게시물
              </span>
              <button
                type="button"
                className="flex items-center gap-1 text-sm text-gray-600 hover:text-[#110f1a]"
              >
                <strong className="text-[#110f1a]">
                  {partnerData ? followCount.toLocaleString() : '0'}
                </strong>
                팔로워
              </button>
              <span>
                <strong className="mr-1 text-[#110f1a]">0</strong>팔로잉
              </span>
            </div>
            <div className="mt-4 flex gap-3">
              {isOwnProfile ? (
                <Button variant="outline" onClick={() => setIsProfileModalOpen(true)}>
                  프로필 수정
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    disabled={isProcessing}
                    onClick={handleFollow}
                  >
                    {isProcessing ? '처리중...' : isFollowing ? '팔로우 중' : '팔로우'}
                  </Button>
                  <Button variant="solid" onClick={handleMessage}>
                    메시지
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="md:w-2/3">
            <div className="space-y-6">
              <div>
                <Typography variant="h5" className="mb-2">
                  선호하는 게임
                </Typography>
                <Typography variant="body1" color="text-secondary">
                  리그 오브 레전드, 배틀그라운드
                </Typography>
              </div>

              <div>
                <Typography variant="h5" className="mb-2">
                  게임 정보
                </Typography>
                <Typography variant="body1" color="text-secondary">
                  랭크: 다이아몬드, 주 포지션: 원딜
                </Typography>
              </div>

              <div>
                <Typography variant="h5" className="mb-2">
                  인사말
                </Typography>
                <Typography variant="body1" color="text-secondary">
                  안녕하세요! 함께 재미있게 게임하며 좋은 시간 보내요~
                </Typography>
              </div>

              <div>
                <Typography variant="h5" className="mb-4">
                  리뷰
                </Typography>
                <div className="space-y-4">
                  <div className="border-l-4 border-[#FE3A8F] pl-4">
                    <Typography variant="body1" color="text-secondary">
                      "정말 친절하고 실력도 좋아요!"
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text-disabled"
                      className="mt-1"
                    >
                      - 사용자1
                    </Typography>
                  </div>
                  <div className="border-l-4 border-[#FE3A8F] pl-4">
                    <Typography variant="body1" color="text-secondary">
                      "함께 게임하는 동안 너무 즐거웠습니다."
                    </Typography>
                    <Typography
                      variant="caption"
                      color="text-disabled"
                      className="mt-1"
                    >
                      - 사용자2
                    </Typography>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Flex>
        </div>
      </div>
      <ProfileEditModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        mode="profile"
      />
    </>
  )
}
