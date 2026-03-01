import { useState, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Modal, Button, Typography, StarRating, GameBadges, AvatarWithFallback, OnlineIndicator, GameInfoDisplay } from '@/components'
import { usePartnerDetailsByMemberId } from '@/hooks/usePartnerDetailsByMemberId'
import { usePartnerJobs } from '@/hooks/usePartnerJobs'
import { useAuthStore } from '@/store/useAuthStore'
import { useChatStore } from '@/store/useChatStore'
import { Pagination } from 'swiper/modules';
import { Swiper, SwiperSlide } from 'swiper/react';

interface ChatPartnerProfileModalProps {
  isOpen: boolean
  onClose: () => void
  partnerId: string // member_id
  partnerName?: string
  partnerAvatar?: string | null
  isButtonsDisabled?: boolean // dashboard/partner에서 버튼 비활성화용
}

export function ChatPartnerProfileModal({
  isOpen,
  onClose,
  partnerId,
  partnerName,
  partnerAvatar,
  isButtonsDisabled = false,
}: ChatPartnerProfileModalProps) {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { addTempChatRoom } = useChatStore()

  // member_id로 파트너 정보 조회
  const { data: partner, isLoading, error } = usePartnerDetailsByMemberId(partnerId)

  // 파트너의 직무 정보 가져오기 (활성화된 것만)
  const { jobs: activeJobs, isLoading: jobsLoading } = usePartnerJobs(
    partnerId,
    true,
  )
  const hasActiveJobs = activeJobs.length > 0

  // partner가 아닌 경우 모달 자동 닫기
  useEffect(() => {
    if (error && error.message === 'Not a partner' && isOpen) {
      onClose()
    }
  }, [error, isOpen, onClose])

  const [jobSessions, setJobSessions] = useState<{[key: string]: number}>({})

  const handleJobRequest = async (job: any) => {
    if (!user || !partner) {
      navigate({ to: '/login' })
      return
    }

    try {
      const partnerName = partner.partner_name || partner.member.name || partner.member.member_code || 'Unknown'

      // Zustand store에 임시 채팅방 추가
      addTempChatRoom({
        partnerId: partner.member_id,
        partnerName,
        partnerAvatar: partner.member.profile_image || undefined,
      })

      // 의뢰 신청 메시지 생성
      const sessions = jobSessions[job.id] || 1
      const requestMessage = `안녕하세요! "${job.job_name}" 서비스를 의뢰하고 싶습니다.\n\n📋 서비스 정보:\n• 가격: ${job.coins_per_job || 0} P\n• 횟수: ${sessions}회\n\n문의사항이나 추가 요청사항이 있으시면 말씀해주세요!`

      onClose()

      // 채팅 페이지로 이동하면서 임시 메시지 전달
      navigate({
        to: '/chat',
        search: {
          partnerId: partner.member_id,
          partnerName,
          tempMessage: requestMessage,
        },
      })
    } catch (error) {
      console.error('의뢰 처리 중 오류:', error)
      handleQuickChat()
    }
  }

  const handleViewFullProfile = () => {
    if (!partner?.member?.member_code) return

    onClose()
    navigate({
      to: `/partners/${partner.member.member_code}`
    })
  }

  const handleQuickChat = () => {
    if (!user || !partner) {
      navigate({ to: '/login' })
      return
    }

    const displayName = partner.partner_name || partner.member.name || partner.member.member_code || 'Unknown'

    // Zustand store에 임시 채팅방 추가
    addTempChatRoom({
      partnerId: partner.member_id,
      partnerName: displayName,
      partnerAvatar: partner.member.profile_image || partnerAvatar || undefined,
    })

    onClose()

    // 현재 이미 채팅 페이지에 있으면 선택된 파트너만 변경
    // 다른 페이지에 있으면 채팅 페이지로 이동
    navigate({
      to: '/chat',
      search: {
        partnerId: partner.member_id,
        partnerName: displayName,
      },
    })
  }

  const isOnlineStatus = (status: string) => {
    return status !== 'offline'
  }

  if (!isOpen) return null

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="파트너 프로필"
      size="lg"
    >
      <div className="max-h-[85vh] overflow-y-auto m-[-1.5rem] sm:m-[-1.5rem]">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-100 border-t-blue-600"></div>
              <Typography variant="body2" className="text-gray-600">
                프로필을 불러오는 중...
              </Typography>
            </div>
          </div>
        ) : error || !partner ? (
          <div className="text-center py-12">
            <Typography variant="h5" className="text-red-600 mb-2">
              프로필을 불러올 수 없습니다
            </Typography>
            <Typography variant="body2" className="text-gray-600 mb-4">
              파트너 정보를 찾을 수 없거나 오류가 발생했습니다.
            </Typography>
            <Button variant="outline" onClick={onClose}>
              닫기
            </Button>
          </div>
        ) : (
          <div className="p-4 space-y-6">
            {partner.background_images && Array.isArray(partner.background_images) && partner.background_images.length > 0 && (
              <div className="h-48 rounded-t-lg overflow-hidden">
                <Swiper
                  modules={[Pagination]}
                  spaceBetween={0}
                  slidesPerView={1}
                  pagination={{
                    clickable: true,
                    bulletClass: 'swiper-pagination-bullet !bg-white !opacity-60',
                    bulletActiveClass: 'swiper-pagination-bullet-active !opacity-100',
                  }}
                  className="h-full"
                >
                  {partner.background_images.map((image: any, index: number) => (
                    <SwiperSlide key={image.id || index}>
                      <div className="relative h-full">
                        <img
                          src={image.url}
                          alt={`배경 이미지 ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </SwiperSlide>
                  ))}
                </Swiper>
              </div>
            )}


            {/* 프로필 헤더 카드 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-4">
                {/* 프로필 사진 */}
                <div className="relative flex-shrink-0">
                  <div className="rounded-full overflow-hidden border-4 border-gray-200 shadow-lg bg-white w-20 h-20">
                    <AvatarWithFallback
                      name={
                        partner.partner_name ||
                        partner.member.name ||
                        partner.member.member_code ||
                        'Unknown'
                      }
                      src={partner.member.profile_image || partnerAvatar || undefined}
                      size="xl"
                      className="w-full h-full"
                    />
                  </div>
                  <div className="absolute bottom-0 right-0">
                    <OnlineIndicator
                      isOnline={isOnlineStatus(partner.member.current_status)}
                      size="md"
                    />
                  </div>
                </div>

                {/* 프로필 정보 */}
                <div className="flex-grow">
                  <Typography variant="h3" className="font-bold text-gray-900 mb-2">
                    {partner.partner_name ||
                      partner.member.name ||
                      partner.member.member_code}
                  </Typography>

                  <div className="flex flex-col gap-2 mb-3">
                    {/* 리뷰 정보 */}
                    {(() => {
                      const validReviews = partner.reviews?.filter((review: any) =>
                        review.rating && review.comment
                      ) || []

                      if (validReviews.length > 0) {
                        const avgRating = validReviews.reduce(
                          (sum: number, review: any) => sum + review.rating,
                          0
                        ) / validReviews.length

                        return (
                          <div className="flex items-center gap-2">
                            <StarRating rating={avgRating} size="sm" />
                            <Typography variant="body2" className="text-gray-600">
                              {avgRating.toFixed(1)} · 리뷰 {validReviews.length}개
                            </Typography>
                          </div>
                        )
                      }

                      return (
                        <Typography variant="body2" className="text-gray-600">
                          새로운 파트너예요
                        </Typography>
                      )
                    })()}

                    {/* 온라인 상태 */}
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          isOnlineStatus(partner.member.current_status)
                            ? 'bg-green-500'
                            : 'bg-gray-400'
                        }`}
                      />
                      <Typography variant="body2" className="text-gray-600 capitalize">
                        {partner.member.current_status}
                      </Typography>
                    </div>
                  </div>

                  {/* 액션 버튼 */}
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleViewFullProfile}
                      className="px-3 py-1 text-sm"
                      disabled={isButtonsDisabled}
                    >
                      상세 프로필 보기
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* 의뢰 영역 */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              {/* 헤더 */}
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-3 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <Typography variant="h5" className="font-bold text-gray-900">
                      서비스 의뢰
                    </Typography>
                    <Typography variant="caption" className="text-gray-600 text-xs">
                      원하는 서비스를 선택하고 의뢰해보세요
                    </Typography>
                  </div>
                  {hasActiveJobs && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-white rounded-full shadow-sm border border-green-200">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
                      <Typography variant="caption" className="font-semibold text-green-700 text-xs">
                        서비스 중
                      </Typography>
                    </div>
                  )}
                </div>
              </div>

              {/* 콘텐츠 */}
              <div className="p-3">
                {jobsLoading ? (
                  <div className="flex flex-col items-center justify-center py-6">
                    <div className="relative">
                      <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-100 border-t-blue-600"></div>
                    </div>
                    <Typography variant="caption" className="text-gray-600 mt-2">
                      서비스 정보를 불러오는 중...
                    </Typography>
                  </div>
                ) : activeJobs && activeJobs.length > 0 ? (
                  <div className="space-y-2">
                    {activeJobs.map((job: any) => (
                      <div
                        key={job.id}
                        className="group relative bg-gradient-to-r from-gray-50 to-gray-50/50 border border-gray-200 rounded-lg p-3 hover:shadow-sm hover:border-blue-200 transition-all duration-200"
                      >
                        {/* 서비스 제목 */}
                        <div className="flex items-center gap-2 mb-2">
                          <Typography variant="body1" className="font-bold text-gray-900">
                            {job.job_name || '서비스 제목 없음'}
                          </Typography>
                        </div>

                        {/* 서비스 옵션 */}
                        <div className="flex flex-col space-y-2">
                          {/* 횟수 조절 */}
                          <div className="flex items-center gap-2">
                            <Typography variant="body2" className="font-medium text-gray-700 text-sm">
                              횟수
                            </Typography>
                            <div className="flex items-center bg-white border border-gray-200 rounded-md overflow-hidden shadow-sm">
                              <button
                                type="button"
                                onClick={() => setJobSessions(prev => ({
                                  ...prev,
                                  [job.id]: Math.max(1, (prev[job.id] || 1) - 1)
                                }))}
                                className="px-2 py-1 text-gray-600 hover:bg-gray-100 transition-colors text-sm disabled:opacity-50"
                                disabled={(jobSessions[job.id] || 1) <= 1}
                              >
                                -
                              </button>
                              <div className="px-2 py-1 text-center min-w-[2rem] bg-gray-50 border-x border-gray-200">
                                <Typography variant="caption" className="font-bold text-gray-900">
                                  {jobSessions[job.id] || 1}
                                </Typography>
                              </div>
                              <button
                                type="button"
                                onClick={() => setJobSessions(prev => ({
                                  ...prev,
                                  [job.id]: Math.min(10, (prev[job.id] || 1) + 1)
                                }))}
                                className="px-2 py-1 text-gray-600 hover:bg-gray-100 transition-colors text-sm disabled:opacity-50"
                                disabled={(jobSessions[job.id] || 1) >= 10}
                              >
                                +
                              </button>
                            </div>
                            <Typography variant="caption" className="text-gray-600">
                              회
                            </Typography>
                          </div>

                          {/* 가격과 의뢰 버튼 */}
                          <div className="flex items-center justify-between pt-1 border-t border-gray-200">
                            <div className="flex items-center gap-1">
                              <Typography variant="caption" className="text-gray-600">
                                총 금액:
                              </Typography>
                              <div className="flex items-center gap-1">
                                <Typography variant="body1" className="font-bold text-blue-600">
                                  {(jobSessions[job.id] || 1) * job.coins_per_job}
                                </Typography>
                                <Typography variant="caption" className="font-semibold text-blue-600">
                                  P
                                </Typography>
                              </div>
                              <div className="text-gray-400 text-xs">
                                ({job.coins_per_job}P × {jobSessions[job.id] || 1}회)
                              </div>
                            </div>
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() => handleJobRequest(job)}
                              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-4 py-1 rounded-md text-sm"
                              disabled={isButtonsDisabled}
                            >
                              의뢰하기
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <div className="w-12 h-12 bg-gradient-to-r from-gray-100 to-gray-200 rounded-lg flex items-center justify-center mx-auto mb-2">
                      <Typography variant="h4" className="text-gray-400">
                        💼
                      </Typography>
                    </div>
                    <Typography variant="body2" className="font-semibold text-gray-900 mb-1">
                      현재 활성화된 서비스가 없습니다
                    </Typography>
                    <Typography variant="caption" className="text-gray-600">
                      파트너가 새로운 서비스를 준비 중이에요
                    </Typography>
                  </div>
                )}
              </div>
            </div>

            {/* 상세 정보 섹션 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 소개 */}
              {partner.partner_message && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
                  <Typography variant="body1" className="font-semibold text-gray-900 mb-2">
                    소개
                  </Typography>
                  <Typography variant="body2" className="text-gray-700 leading-relaxed text-sm">
                    {partner.partner_message}
                  </Typography>
                </div>
              )}

              {/* 선호 게임 */}
              {partner.member.favorite_game && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
                  <Typography variant="body1" className="font-semibold text-gray-900 mb-2">
                    🎮 선호 게임
                  </Typography>
                  <GameBadges
                    favoriteGames={
                      Array.isArray(partner.member.favorite_game)
                        ? partner.member.favorite_game.join(', ')
                        : partner.member.favorite_game
                    }
                    size="sm"
                  />
                </div>
              )}

              {/* 게임 정보 */}
              {partner.game_info && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 max-h-fit">
                  <Typography variant="body1" className="font-semibold text-gray-900 mb-2">
                    📊 게임 정보
                  </Typography>
                  <GameInfoDisplay gameInfo={partner.game_info} />
                </div>
              )}

              {/* 최근 리뷰 */}
              {partner.reviews && partner.reviews.length > 0 && (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
                  <Typography variant="body1" className="font-semibold text-gray-900 mb-2">
                    최근 리뷰
                  </Typography>
                  <div className="space-y-2">
                    {partner.reviews.map((review: any, index: number) => (
                      <div key={review.id || index} className="border border-gray-200 rounded-md p-2">
                        <div className="flex items-center justify-between mb-1">
                          <Typography variant="caption" className="font-semibold text-gray-900">
                            {review.reviewer?.name || '익명 사용자'}
                          </Typography>
                          <StarRating rating={review.rating} size="sm" />
                        </div>
                        <Typography variant="caption" className="text-gray-700">
                          {review.comment && review.comment.length > 50
                            ? `${review.comment.substring(0, 50)}...`
                            : review.comment || '코멘트 없음'}
                        </Typography>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 하단 닫기 버튼 */}
            <div className="flex justify-center pt-4 border-t border-gray-200">
              <Button
                variant="outline"
                onClick={onClose}
                className="px-8"
              >
                닫기
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}