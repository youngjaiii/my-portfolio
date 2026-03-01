import { Modal, Typography, Button, Flex, AvatarWithFallback, OnlineIndicator, StarRating, GameBadges, GameInfoDisplay } from '@/components'

interface PartnerPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  partnerData: {
    partnerName: string
    partnerMessage: string
    profileImage: string
    favoriteGame: string
    gameInfos: any[]
    backgroundImages: any[]
    legalName: string
    legalEmail: string
    legalPhone: string
    averageRating?: number
    reviewCount?: number
  }
}

export function PartnerPreviewModal({ isOpen, onClose, partnerData }: PartnerPreviewModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="파트너 프로필 미리보기" size="lg">
      <div className="max-h-[80vh] overflow-y-auto">
        {/* Header Section with Background */}
        <div className="relative h-80 bg-gradient-to-br from-blue-500 to-purple-600 rounded-t-lg">
          {/* 기본 배경 */}
          <div className="relative h-full">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-purple-600 rounded-t-lg"></div>
            <div className="absolute inset-0 bg-black opacity-10 rounded-t-lg"></div>
          </div>
        </div>

        <div className="bg-gray-100 min-h-screen pt-8">
          <div className="container mx-auto px-4 sm:px-6 pb-12">
            <div className="max-w-4xl mx-auto">

              {/* 프로필 헤더 카드 */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-8 mb-6 -mt-24 relative">
                <div className="flex flex-col sm:flex-row items-center sm:items-center gap-4 sm:gap-8">
                  {/* 프로필 사진 */}
                  <div className="relative flex-shrink-0">
                    <div className="rounded-full overflow-hidden border-4 border-gray-200 shadow-lg bg-white w-24 h-24 sm:w-30 sm:h-30">
                      {partnerData.profileImage ? (
                        <img
                          src={partnerData.profileImage}
                          alt={partnerData.partnerName}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <AvatarWithFallback
                          name={partnerData.partnerName || 'Unknown'}
                          src={undefined}
                          size="xl"
                          className="w-full h-full"
                        />
                      )}
                    </div>
                    <div className="absolute bottom-1 right-1">
                      <OnlineIndicator
                        isOnline={true}
                        size="lg"
                      />
                    </div>
                  </div>

                  {/* 프로필 정보 */}
                  <div className="flex-grow text-center sm:text-left">
                    <Typography variant="h2" className="font-bold text-gray-900 mb-2 text-xl sm:text-2xl">
                      {partnerData.partnerName || '파트너 이름'}
                    </Typography>

                    <div className="flex flex-col sm:flex-row items-center justify-center sm:justify-start gap-3 sm:gap-4 mb-4">
                      {/* 리뷰 정보 */}
                      {partnerData.averageRating ? (
                        <div className="flex items-center gap-2">
                          <StarRating
                            rating={partnerData.averageRating}
                            size="sm"
                          />
                          <Typography variant="body2" className="text-gray-600">
                            {partnerData.averageRating.toFixed(1)} · 리뷰 {partnerData.reviewCount || 0}개
                          </Typography>
                        </div>
                      ) : (
                        <Typography variant="body2" className="text-gray-600">
                          새로운 파트너예요
                        </Typography>
                      )}

                      {/* 온라인 상태 */}
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
                        <Typography variant="body2" className="text-gray-600 capitalize">
                          온라인
                        </Typography>
                      </div>
                    </div>

                    {/* 액션 버튼 */}
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                      <Button
                        variant="outline"
                        size="md"
                        disabled={true}
                        title="미리보기 모드에서는 사용할 수 없습니다"
                        className="w-full sm:w-auto px-5 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg transition-all text-sm opacity-50"
                      >
                        의뢰하기
                      </Button>
                      <Button
                        variant="primary"
                        size="md"
                        disabled={true}
                        title="미리보기 모드에서는 사용할 수 없습니다"
                        className="w-full sm:w-auto px-5 py-2 bg-blue-600 text-white font-medium rounded-lg transition-all text-sm opacity-50"
                      >
                        빠른 채팅
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* 메인 콘텐츠 영역 */}
              <div className="space-y-6 lg:grid lg:grid-cols-3 lg:gap-6 lg:space-y-0">

                {/* 왼쪽 사이드바 - 기본 정보 */}
                <div className="lg:col-span-1 space-y-4">

                  {/* 소개 카드 */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5">
                    <Typography variant="h4" className="font-semibold text-gray-900 mb-3">
                      소개
                    </Typography>
                    <Typography variant="body2" className="text-gray-700 leading-relaxed">
                      {partnerData.partnerMessage || '아직 인사말을 작성하지 않았습니다.'}
                    </Typography>
                  </div>

                  {/* 선호 게임 카드 */}
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5">
                    <Typography variant="h4" className="font-semibold text-gray-900 mb-3">
                      🎮 선호 게임
                    </Typography>
                    <GameBadges
                      favoriteGames={partnerData.favoriteGame}
                      size="sm"
                    />
                  </div>

                  {/* 게임 정보 카드 */}
                  {partnerData.gameInfos && partnerData.gameInfos.length > 0 && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5">
                      <Typography variant="h4" className="font-semibold text-gray-900 mb-3">
                        📊 게임 정보
                      </Typography>
                      <GameInfoDisplay gameInfo={partnerData.gameInfos} />
                    </div>
                  )}

                  {/* 포트폴리오 이미지 카드 */}
                  {partnerData.backgroundImages && partnerData.backgroundImages.length > 0 && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 sm:p-5">
                      <Typography variant="h4" className="font-semibold text-gray-900 mb-3">
                        🎨 포트폴리오 ({partnerData.backgroundImages.length}개)
                      </Typography>
                      <div className="grid grid-cols-2 gap-3">
                        {partnerData.backgroundImages.slice(0, 6).map((image: any, index: number) => (
                          <div key={index} className="aspect-square rounded-lg overflow-hidden border border-gray-200">
                            <img
                              src={image.url || image}
                              alt={`포트폴리오 ${index + 1}`}
                              className="w-full h-full object-cover hover:scale-105 transition-transform duration-200 cursor-pointer"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>

                {/* 오른쪽 메인 콘텐츠 - 리뷰 피드 */}
                <div className="lg:col-span-2">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200">

                    {/* 리뷰 헤더 */}
                    <div className="border-b border-gray-200 p-4 sm:p-5">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div>
                          <Typography variant="h4" className="font-semibold text-gray-900">
                            받은 리뷰
                          </Typography>
                          <Typography variant="caption" className="text-gray-500 mt-1">
                            미리보기 모드입니다
                          </Typography>
                        </div>
                        {partnerData.averageRating && (
                          <div className="flex items-center gap-2">
                            <StarRating
                              rating={partnerData.averageRating}
                              size="sm"
                            />
                            <Typography variant="h5" className="font-semibold text-gray-900">
                              {partnerData.averageRating.toFixed(1)}
                            </Typography>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 리뷰 목록 - 미리보기용 */}
                    <div className="p-4 sm:p-5">
                      <div className="text-center py-8 sm:py-12">
                        <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                          <Typography variant="h4" className="text-gray-400 text-lg sm:text-2xl">
                            👁️
                          </Typography>
                        </div>
                        <Typography variant="h5" className="font-semibold text-gray-900 mb-1">
                          미리보기 모드
                        </Typography>
                        <Typography variant="body2" className="text-gray-500">
                          실제 프로필에서 리뷰를 확인할 수 있습니다
                        </Typography>
                      </div>
                    </div>

                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>

        {/* 닫기 버튼 */}
        <div className="p-6 border-t bg-white rounded-b-lg">
          <Button
            variant="outline"
            size="md"
            onClick={onClose}
            className="w-full"
          >
            닫기
          </Button>
        </div>
      </div>
    </Modal>
  )
}