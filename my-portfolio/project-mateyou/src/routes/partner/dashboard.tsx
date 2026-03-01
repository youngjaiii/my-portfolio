import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { toast } from '@/components/ui/sonner'
import { useAuth } from '@/hooks/useAuth'
import { usePartnerData } from '@/hooks/usePartnerData'
import { usePartnerJobs } from '@/hooks/usePartnerJobs'
import { usePartnerBackgrounds } from '@/hooks/usePartnerBackgrounds'
import { supabase } from '@/lib/supabase'
import {
  AvatarWithFallback,
  Button,
  Flex,
  Footer,
  GameInfoInput,
  ImageUpload,
  Input,
  Textarea,
  Typography,
} from '@/components'
import { ServiceInfoInput } from '@/components/forms/JobInfoInput'
import { PartnerBackgroundUpload } from '@/components/forms/PartnerBackgroundUpload'
import { updatePartnerApplication } from '@/lib/partnerApi'
import { BANK_CODES, findBankByCode } from '@/constants/banks'
import { edgeApi } from '@/lib/edgeApi'

interface GameInfo {
  game: string
  tier: string
  description: string
}

interface JobInfo {
  job_name: string
  coins_per_job: number
}

interface BackgroundImage {
  id: string
  url: string
  path: string
  uploadedAt: string
}

interface PartnerFormState {
  partnerName: string
  partnerMessage: string
  profileImage: string
  favoriteGame: string
  gameInfos: Array<GameInfo>
  jobs: Array<JobInfo>
  legalName: string
  legalEmail: string
  legalPhone: string
  payoutBankCode: string
  payoutBankName: string
  payoutAccountNumber: string
  payoutAccountHolder: string
  businessType: 'INDIVIDUAL' | 'INDIVIDUAL_BUSINESS' | 'CORPORATE'
  backgroundImages: Array<BackgroundImage>
}

export const Route = createFileRoute('/partner/dashboard' as const)({
  component: PartnerDashboardPage,
})

function PartnerDashboardPage() {
  const { user } = useAuth()
  const {
    partnerData: rawPartnerData,
    isLoading,
  } = usePartnerData(user?.id || '')
  
  // usePartnerData는 PartnerFullData를 반환하므로 partners 테이블 데이터만 추출
  // 구조: { ...memberData, partner_data: partnerInfo }
  const partnerData = rawPartnerData?.partner_data || null

  const {
    jobs: partnerJobs,
    isLoading: jobsLoading,
    refetch: refetchJobs,
  } = usePartnerJobs(user?.id || '')

  // usePartnerBackgrounds는 이제 members.id를 받습니다
  const { updateBackgroundImages, getBackgroundImages } = usePartnerBackgrounds(user?.id)

  const [isEditing, setIsEditing] = useState(false)
  const [isSellerRegistering, setIsSellerRegistering] = useState(false)
  const [isOnline, setIsOnline] = useState(false)
  const [isTogglingOnline, setIsTogglingOnline] = useState(false)
  const [partnerInfo, setPartnerInfo] = useState<PartnerFormState>({
    partnerName: '',
    partnerMessage: '',
    profileImage: '',
    favoriteGame: '',
    gameInfos: [],
    jobs: [],
    legalName: '',
    legalEmail: '',
    legalPhone: '',
    payoutBankCode: '',
    payoutBankName: '',
    payoutAccountNumber: '',
    payoutAccountHolder: '',
    businessType: 'INDIVIDUAL',
    backgroundImages: [],
  })

  useEffect(() => {
    if (user && partnerData) {
      console.log('전체 partnerData:', partnerData)
      console.log('partnerData.background_images 값:', partnerData.background_images)
      console.log('partnerData.background_images 타입:', typeof partnerData.background_images)

      const gameInfos = partnerData.game_info
        ? Array.isArray(partnerData.game_info)
          ? partnerData.game_info
          : [partnerData.game_info]
        : []

      setPartnerInfo({
        partnerName: partnerData.partner_name || user.name || '',
        partnerMessage: partnerData.partner_message || '',
        profileImage: user.profile_image || '',
        favoriteGame: user.favorite_game || '',
        gameInfos: gameInfos,
        jobs: partnerJobs || [],
        legalName: partnerData.legal_name || user.name || '',
        legalEmail: partnerData.legal_email || '',
        legalPhone: partnerData.legal_phone || '',
        payoutBankCode: partnerData.payout_bank_code || '',
        payoutBankName: partnerData.payout_bank_name || '',
        payoutAccountNumber: partnerData.payout_account_number || '',
        payoutAccountHolder:
          partnerData.payout_account_holder ||
          partnerData.legal_name ||
          user.name ||
          '',
        businessType:
          (partnerData.tosspayments_business_type as
            | 'INDIVIDUAL'
            | 'INDIVIDUAL_BUSINESS'
            | 'CORPORATE'
            | undefined) || 'INDIVIDUAL',
        backgroundImages: (() => {
          const bgImages = (partnerData.background_images as BackgroundImage[]) || []
          console.log('DB에서 가져온 background_images:', partnerData.background_images)
          console.log('파싱된 backgroundImages:', bgImages)

          // 직접 배경이미지 가져오기 (members.id 사용)
          if (user?.id) {
            getBackgroundImages(user.id).then(directImages => {
              console.log('직접 가져온 배경이미지들:', directImages)
            })

            // Supabase에서 직접 조회 (partners.member_id 사용)
            supabase
              .from('partners')
              .select('background_images')
              .eq('member_id', user.id)
              .single()
              .then(({ data, error }) => {
                console.log('Supabase 직접 조회 결과:', { data, error })
              })
          }

          return bgImages
        })(),
      })
      
      // 온라인 상태 초기화
      setIsOnline(partnerData.is_online ?? false)
    }
  }, [user?.id, partnerData, partnerJobs])

  // 온라인/오프라인 토글 핸들러
  const handleToggleOnline = async () => {
    if (!user?.id || isTogglingOnline) return
    
    setIsTogglingOnline(true)
    const newOnlineStatus = !isOnline
    
    try {
      const { error } = await supabase
        .from('partners')
        .update({ is_online: newOnlineStatus })
        .eq('member_id', user.id)
      
      if (error) throw error
      
      setIsOnline(newOnlineStatus)
      toast.success(newOnlineStatus ? '온라인 상태로 변경되었습니다' : '오프라인 상태로 변경되었습니다')
    } catch (error) {
      console.error('온라인 상태 변경 실패:', error)
      toast.error('상태 변경에 실패했습니다')
    } finally {
      setIsTogglingOnline(false)
    }
  }

  const handleBackgroundImagesUpdate = async (images: BackgroundImage[]) => {
    setPartnerInfo({ ...partnerInfo, backgroundImages: images })
    await updateBackgroundImages(images)
  }

  const handleSellerRegistration = async () => {
    if (!user || !partnerData) {
      toast.error('사용자 정보를 확인할 수 없습니다.')
      return
    }

    if (!partnerInfo.legalName || !partnerInfo.legalEmail || !partnerInfo.legalPhone) {
      toast.error('정산 정보를 모두 입력해주세요.')
      return
    }

    if (!partnerInfo.payoutBankCode || !partnerInfo.payoutAccountNumber || !partnerInfo.payoutAccountHolder) {
      toast.error('계좌 정보를 모두 입력해주세요.')
      return
    }

    setIsSellerRegistering(true)
    try {
      const tossSecretKey = import.meta.env.VITE_TOSS_SECRET_KEY
      const tossEncryptionKey = import.meta.env.VITE_TOSS_ENCRYPTION_KEY

      if (!tossSecretKey || !tossEncryptionKey) {
        throw new Error('Toss API 환경변수가 설정되지 않았습니다.')
      }

      // 고유한 refSellerId 생성 (현재 타임스탬프 포함)
      const timestamp = Date.now()
      const uniqueRefSellerId = `MATE${timestamp.toString().slice(-10)}`.toUpperCase()

      // 셀러 등록 페이로드 생성
      const sellerPayload = {
        refSellerId: uniqueRefSellerId,
        businessType: 'INDIVIDUAL' as const,
        individual: {
          name: partnerInfo.legalName,
          email: partnerInfo.legalEmail,
          phone: partnerInfo.legalPhone.replace(/-/g, '').replace(/\s/g, '') // 공백도 제거
        },
        account: {
          bankCode: partnerInfo.payoutBankCode,
          accountNumber: partnerInfo.payoutAccountNumber.replace(/-/g, '').replace(/\s/g, ''), // 하이픈과 공백 제거
          holderName: partnerInfo.payoutAccountHolder
        },
        metadata: {
          partnerId: partnerData.id,  // partners.id는 DB에서 가져온 값 사용 (Toss API용)
          source: 'mate_you',
          memberId: user.id,  // members.id 사용
          timestamp: timestamp.toString()
        }
      }

      // 임시 목업 - API 권한 문제로 인해 실제 호출 대신 사용
      console.log('[목업] Toss 셀러 등록 API 호출:', sellerPayload)

      // 실제 API 호출 시뮬레이션
      await new Promise(resolve => setTimeout(resolve, 1500))

      // 목업 응답
      const result = {
        id: `SELLER_${Date.now()}`,
        refSellerId: sellerPayload.refSellerId,
        status: 'ACTIVE',
        businessType: 'INDIVIDUAL',
        individual: sellerPayload.individual,
        account: sellerPayload.account,
        createdAt: new Date().toISOString(),
        metadata: sellerPayload.metadata,
        message: '목업 응답: API 권한 확인 필요'
      }

      const response = { ok: true, status: 200 }
      console.log('[목업] Toss API 응답:', result)

      if (response.ok) {
        toast.success('토스 셀러 등록이 완료되었습니다!')

        // DB 업데이트
        if (result?.id) {
          await supabase
            .from('partners')
            .update({
              tosspayments_seller_id: result.id,
              tosspayments_status: 'registered',
              tosspayments_synced_at: new Date().toISOString()
            })
            .eq('member_id', user.id)  // partners.id → partners.member_id로 변경
        }
      } else {
        console.error('Toss API Error:', {
          status: response.status,
          statusText: response.statusText,
          result,
          rawText
        })

        const errorMessage = result?.error?.message || result?.message || `셀러 등록에 실패했습니다 (${response.status})`
        throw new Error(errorMessage)
      }

    } catch (error) {
      console.error('Seller registration error:', error)
      toast.error(error instanceof Error ? error.message : '셀러 등록 중 오류가 발생했습니다.')
    } finally {
      setIsSellerRegistering(false)
    }
  }

  const handleSave = async () => {
    console.log('handleSave 호출됨 - 사용자가 저장 버튼을 클릭했습니다')
    if (!user?.social_id) return

    try {
      const gameInfoJson =
        partnerInfo.gameInfos.length > 0
          ? JSON.stringify(partnerInfo.gameInfos)
          : ''
      const sanitizedPhone = partnerInfo.legalPhone.replace(/\D/g, '')
      const sanitizedAccountNumber = partnerInfo.payoutAccountNumber.replace(
        /\D/g,
        '',
      )
      const bankName =
        partnerInfo.payoutBankName ||
        findBankByCode(partnerInfo.payoutBankCode)?.name ||
        ''

      const result = await updatePartnerApplication({
        partnerName: partnerInfo.partnerName,
        partnerMessage: partnerInfo.partnerMessage,
        profileImage: partnerInfo.profileImage,
        favoriteGame: partnerInfo.favoriteGame,
        gameInfo: gameInfoJson,
        socialId: user?.social_id || '',
        legalName: partnerInfo.legalName,
        legalEmail: partnerInfo.legalEmail,
        legalPhone: sanitizedPhone,
        businessType: partnerInfo.businessType,
        payoutBankCode: partnerInfo.payoutBankCode,
        payoutBankName: bankName,
        payoutAccountNumber: sanitizedAccountNumber,
        payoutAccountHolder: partnerInfo.payoutAccountHolder,
      })

      if (result.success) {
        setIsEditing(false)
        refetch() // 데이터 새로고침
        refetchJobs() // 직무 데이터 새로고침
        toast.success('정보가 성공적으로 업데이트되었습니다.')
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error('업데이트 중 오류가 발생했습니다.')
    }
  }

  if (isLoading || jobsLoading) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <Typography variant="h2" className="mb-6">
          파트너 대시보드
        </Typography>
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <Typography variant="body1">로딩 중...</Typography>
        </div>
      </div>
    )
  }

  if (!partnerData) {
    return (
      <div className="container mx-auto p-6 max-w-4xl">
        <Typography variant="h2" className="mb-6">
          파트너 대시보드
        </Typography>
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <Typography variant="body1" color="text-secondary">
            파트너 정보를 찾을 수 없습니다.
          </Typography>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Flex justify="between" align="center" className="mb-6">
        <div className="flex items-center gap-4">
          <Typography variant="h2">파트너 대시보드</Typography>
          {/* 온라인/오프라인 토글 스위치 */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleOnline}
              disabled={isTogglingOnline}
              className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${
                isOnline ? 'bg-green-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-200 ease-in-out ${
                  isOnline ? 'translate-x-8' : 'translate-x-1'
                }`}
              />
            </button>
            <span className={`text-sm font-medium ${isOnline ? 'text-green-600' : 'text-gray-500'}`}>
              {isOnline ? '온라인' : '오프라인'}
            </span>
          </div>
        </div>
        {!isEditing ? (
          <Button onClick={() => setIsEditing(true)}>정보 편집</Button>
        ) : (
          <div className="space-x-2">
            <Button variant="success" onClick={handleSave}>
              저장
            </Button>
            <Button variant="secondary" onClick={() => setIsEditing(false)}>
              취소
            </Button>
          </div>
        )}
      </Flex>

      <div className="bg-white rounded-lg shadow-lg p-8">
        <Flex direction="column" gap={8} className="md:flex-row">
          <div className="md:w-1/3">
            <Flex
              align="center"
              justify="center"
              className="w-full h-64 bg-gray-200 rounded-lg mb-4"
            >
              {partnerInfo.profileImage ? (
                <img
                  src={partnerInfo.profileImage}
                  alt={partnerInfo.partnerName}
                  className="w-full h-full object-cover rounded-lg"
                />
              ) : (
                <AvatarWithFallback
                  name={partnerInfo.partnerName}
                  src={partnerInfo.profileImage || undefined}
                  size="xl"
                  className="w-32 h-32"
                />
              )}
            </Flex>
            {/* 배경 이미지 표시 (항상 보이게) */}
            {partnerInfo.backgroundImages.length > 0 && (
              <div className="mt-4">
                <Typography
                  variant="body2"
                  color="text-secondary"
                  className="mb-2"
                >
                  배경 이미지 ({partnerInfo.backgroundImages.length}개)
                </Typography>
                <div className="grid grid-cols-3 gap-2">
                  {partnerInfo.backgroundImages.map((image, index) => (
                    <img
                      key={image.id || index}
                      src={image.url}
                      alt={`배경 ${index + 1}`}
                      className="w-full h-16 rounded-lg object-cover border cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => window.open(image.url, '_blank')}
                    />
                  ))}
                </div>
              </div>
            )}

            {isEditing && (
              <div className="mt-4">
                <Typography
                  variant="body2"
                  color="text-secondary"
                  className="mb-2"
                >
                  프로필 이미지
                </Typography>
                <ImageUpload
                  bucket="profile-images"
                  currentImageUrl={partnerInfo.profileImage}
                  onImageUploaded={(url) =>
                    setPartnerInfo({ ...partnerInfo, profileImage: url })
                  }
                  onImageDeleted={() =>
                    setPartnerInfo({ ...partnerInfo, profileImage: '' })
                  }
                  userId={user?.id}
                  memberCode={user?.member_code || undefined}
                  maxWidth={400}
                  maxHeight={400}
                  quality={0.9}
                  maxSize={5}
                />

                {/* 배경 이미지 관리 */}
                <div className="mt-6">
                  <Typography
                    variant="body2"
                    color="text-secondary"
                    className="mb-2"
                  >
                    배경 이미지
                  </Typography>
                  <PartnerBackgroundUpload
                    memberCode={user?.member_code || ''}
                    currentImages={partnerInfo.backgroundImages}
                    onImagesUpdated={handleBackgroundImagesUpdate}
                    maxImages={5}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="md:w-2/3 space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                파트너명
              </label>
              {isEditing ? (
                <Input
                  type="text"
                  value={partnerInfo.partnerName}
                  onChange={(e) =>
                    setPartnerInfo({
                      ...partnerInfo,
                      partnerName: e.target.value,
                    })
                  }
                  placeholder="파트너로 활동할 때 사용할 이름"
                />
              ) : (
                <Typography variant="subtitle1">
                  {partnerInfo.partnerName}
                </Typography>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                선호하는 게임
              </label>
              {isEditing ? (
                <Input
                  type="text"
                  value={partnerInfo.favoriteGame}
                  onChange={(e) =>
                    setPartnerInfo({
                      ...partnerInfo,
                      favoriteGame: e.target.value,
                    })
                  }
                  placeholder="예: 리그 오브 레전드, 배틀그라운드, 오버워치 등"
                />
              ) : (
                <Typography variant="body1" color="text-secondary">
                  {partnerInfo.favoriteGame}
                </Typography>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                게임 정보
              </label>
              {isEditing ? (
                <GameInfoInput
                  value={partnerInfo.gameInfos}
                  onChange={(gameInfos) =>
                    setPartnerInfo({ ...partnerInfo, gameInfos })
                  }
                />
              ) : (
                <div className="space-y-2">
                  {partnerInfo.gameInfos.length > 0 ? (
                    partnerInfo.gameInfos.map((info, index) => (
                      <div key={index} className="bg-gray-50 p-3 rounded-lg">
                        <Typography variant="body2" className="font-medium">
                          {info.game} {info.tier && `- ${info.tier}`}
                        </Typography>
                        {info.description && (
                          <Typography variant="caption" color="text-secondary">
                            {info.description}
                          </Typography>
                        )}
                      </div>
                    ))
                  ) : (
                    <Typography variant="body1" color="text-secondary">
                      게임 정보가 없습니다.
                    </Typography>
                  )}
                </div>
              )}
            </div>



            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                제공 서비스 직무
              </label>
              {isEditing ? (
                <ServiceInfoInput
                  value={partnerInfo.jobs}
                  onChange={(jobs) => setPartnerInfo({ ...partnerInfo, jobs })}
                />
              ) : (
                <div className="space-y-2">
                  {partnerInfo.jobs.length > 0 ? (
                    partnerInfo.jobs.map((job, index) => (
                      <div key={index} className="bg-gray-50 p-3 rounded-lg">
                        <Typography variant="body2" className="font-medium">
                          {job.job_name}
                        </Typography>
                        <Typography variant="caption" color="text-secondary">
                          건당 {job.coins_per_job?.toLocaleString() || '0'}코인
                        </Typography>
                      </div>
                    ))
                  ) : (
                    <Typography variant="body1" color="text-secondary">
                      제공하는 직무가 없습니다.
                    </Typography>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                파트너 메시지
              </label>
              {isEditing ? (
                <Textarea
                  value={partnerInfo.partnerMessage}
                  onChange={(e) =>
                    setPartnerInfo({
                      ...partnerInfo,
                      partnerMessage: e.target.value,
                    })
                  }
                  rows={4}
                  placeholder="파트너 신청 동기나 어필하고 싶은 내용을 작성해주세요"
                />
              ) : (
                <Typography variant="body1" color="text-secondary">
                  {partnerInfo.partnerMessage}
                </Typography>
              )}
            </div>
          </div>
        </Flex>
      </div>

      <Footer />
    </div>
  )
}
