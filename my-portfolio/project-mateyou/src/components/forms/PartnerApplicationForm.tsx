import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Flex } from '@/components/ui/Flex'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Typography } from '@/components/ui/Typography'
import { GameInfoInput } from './GameInfoInput'
import { ImageUpload } from './ImageUpload'
import { PartnerBackgroundUpload } from './PartnerBackgroundUpload'
import { useAuth } from '@/hooks/useAuth'
import { usePartnerBackgrounds } from '@/hooks/usePartnerBackgrounds'
import {
  submitPartnerApplication,
  syncPartnerSellerContact,
  updatePartnerApplication,
} from '@/lib/partnerApi'

interface GameInfo {
  game: string
  tier: string
  description: string
}

interface BackgroundImage {
  id: string
  url: string
  path: string
  uploadedAt: string
}

interface PartnerApplicationFormProps {
  initialData?: {
    partnerName?: string
    partnerMessage?: string
    profileImage?: string
    favoriteGame?: string
    gameInfos?: Array<GameInfo>
    legalName?: string
    legalEmail?: string
    legalPhone?: string
    payoutBankCode?: string
    payoutBankName?: string
    payoutAccountNumber?: string
    payoutAccountHolder?: string
    businessType?: 'INDIVIDUAL' | 'INDIVIDUAL_BUSINESS' | 'CORPORATE'
    backgroundImages?: Array<BackgroundImage>
  }
  mode?: 'create' | 'edit'
  onSuccess?: () => void
  onShowToast?: (message: string, type: 'success' | 'error') => void
  onCancel?: () => void
  showButtons?: boolean
  readOnly?: boolean
  partnerId?: string  // 이제 members.id를 받습니다 (deprecated, memberId 사용 권장)
  memberId?: string   // members.id (partners.member_id로 조회)
  isSettlementOnly?: boolean  // 정산 정보만 표시
  onSubmitRef?: React.MutableRefObject<(() => void) | null>  // 외부에서 제출 트리거
}

export function PartnerApplicationForm({
  initialData,
  mode = 'create',
  onSuccess,
  onShowToast,
  onCancel,
  showButtons = true,
  readOnly = false,
  partnerId,  // deprecated, memberId 사용 권장
  memberId,
  isSettlementOnly = false,
  onSubmitRef,
}: PartnerApplicationFormProps) {
  const { user } = useAuth()
  // usePartnerBackgrounds는 이제 members.id를 받습니다
  const actualMemberId = memberId || partnerId || user?.id
  const { updateBackgroundImages } = usePartnerBackgrounds(actualMemberId)

  const [formData, setFormData] = useState({
    partnerName: initialData?.partnerName || user?.name || '',
    partnerMessage: initialData?.partnerMessage || '',
    profileImage: initialData?.profileImage || '',
    favoriteGame: initialData?.favoriteGame || '',
    gameInfos: initialData?.gameInfos || ([] as Array<GameInfo>),
  })

  const [backgroundImages, setBackgroundImages] = useState<BackgroundImage[]>(
    initialData?.backgroundImages || []
  )

  const [errors, setErrors] = useState<{
    partnerName?: string
    partnerMessage?: string
    profileImage?: string
    favoriteGame?: string
    gameInfos?: string
  }>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitMessage, setSubmitMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)
  const [isSyncingSeller, setIsSyncingSeller] = useState(false)

  // 배경 이미지 업데이트 핸들러
  const handleBackgroundImagesUpdate = async (images: BackgroundImage[]) => {
    setBackgroundImages(images)
    if (partnerId) {
      await updateBackgroundImages(images)
    }
  }

  // initialData가 변경될 때 폼 데이터 업데이트
  useEffect(() => {
    if (initialData) {
      setFormData({
        partnerName: initialData.partnerName || user?.name || '',
        partnerMessage: initialData.partnerMessage || '',
        profileImage: initialData.profileImage || '',
        favoriteGame: initialData.favoriteGame || '',
        gameInfos: initialData.gameInfos || [],
      })
      setBackgroundImages(initialData.backgroundImages || [])
    }
  }, [initialData, user?.name])

  // user.name이 변경되었을 때 파트너명 기본값 설정 (신규 신청일 때만)
  useEffect(() => {
    if (user?.name && !initialData?.partnerName && mode === 'create') {
      setFormData((prev) => ({
        ...prev,
        partnerName: prev.partnerName || user.name || '',
      }))
    }
  }, [user?.name, initialData?.partnerName, mode])

  const handleInputChange = (
    field: string,
    value: string | Array<GameInfo>,
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }))

    if (errors[field as keyof typeof errors]) {
      setErrors((prev) => ({ ...prev, [field]: '' }))
    }
  }

  const validateForm = (): boolean => {
    const newErrors: typeof errors = {}

    if (!formData.partnerName.trim()) {
      newErrors.partnerName = '파트너명을 입력해주세요'
    }

    if (!formData.partnerMessage.trim()) {
      newErrors.partnerMessage = '파트너 메시지를 입력해주세요'
    }

    if (formData.gameInfos.length > 0) {
      const hasInvalidGameInfo = formData.gameInfos.some(
        (info) => !info.game.trim(),
      )
      if (hasInvalidGameInfo) {
        newErrors.gameInfos = '모든 게임의 이름을 입력해주세요'
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()

    if (readOnly) return

    if (!user?.social_id) {
      setSubmitMessage({ type: 'error', text: '로그인이 필요합니다.' })
      return
    }

    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)
    setSubmitMessage(null)

    try {
      const gameInfoJson =
        formData.gameInfos.length > 0 ? JSON.stringify(formData.gameInfos) : ''

      const result =
        mode === 'edit'
          ? await updatePartnerApplication({
              partnerName: formData.partnerName,
              partnerMessage: formData.partnerMessage,
              profileImage: formData.profileImage,
              favoriteGame: formData.favoriteGame,
              gameInfo: gameInfoJson,
              socialId: user.social_id,
            })
          : await submitPartnerApplication({
              partnerName: formData.partnerName,
              partnerMessage: formData.partnerMessage,
              profileImage: formData.profileImage,
              favoriteGame: formData.favoriteGame,
              gameInfo: gameInfoJson,
              socialId: user.social_id,
            })

      if (result.success) {
        if (onShowToast) {
          onShowToast(result.message, 'success')
        }

        if (mode === 'create') {
          setFormData({
            partnerName: user?.name || '',
            partnerMessage: '',
            profileImage: '',
            favoriteGame: '',
            gameInfos: [],
          })
        }

        if (onSuccess) {
          onSuccess()
        }
      } else {
        if (onShowToast) {
          onShowToast(result.message, 'error')
        } else {
          setSubmitMessage({ type: 'error', text: result.message })
        }
      }
    } catch (error) {
      console.error('파트너 신청 중 오류가 발생했습니다:', error)
      const errorMessage = '파트너 신청 중 예기치 못한 오류가 발생했습니다.'

      if (onShowToast) {
        onShowToast(errorMessage, 'error')
      } else {
        setSubmitMessage({ type: 'error', text: errorMessage })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // 외부에서 제출 트리거를 위한 ref 설정
  useEffect(() => {
    if (onSubmitRef) {
      onSubmitRef.current = () => handleSubmit()
    }
    return () => {
      if (onSubmitRef) {
        onSubmitRef.current = null
      }
    }
  }, [onSubmitRef, formData, user?.social_id])

  const handleCancel = () => {
    if (mode === 'create') {
      setFormData({
        partnerName: user?.name || '',
        partnerMessage: '',
        profileImage: '',
        favoriteGame: '',
        gameInfos: [],
      })
    } else {
      setFormData({
        partnerName: initialData?.partnerName || '',
        partnerMessage: initialData?.partnerMessage || '',
        profileImage: initialData?.profileImage || '',
        favoriteGame: initialData?.favoriteGame || '',
        gameInfos: initialData?.gameInfos || [],
      })
    }
    setErrors({})
    setSubmitMessage(null)
    if (onCancel) {
      onCancel()
    }
  }

  const handleSyncSeller = async () => {
    if (!partnerId) {
      onShowToast?.(
        '파트너 ID를 확인할 수 없어 셀러 정보를 수정할 수 없습니다.',
        'error',
      )
      return
    }

    try {
      setIsSyncingSeller(true)
      // syncPartnerSellerContact는 이제 members.id를 받습니다
      const actualMemberId = memberId || partnerId || user?.id
      if (!actualMemberId) {
        onShowToast?.('사용자 ID를 확인할 수 없습니다.', 'error')
        return
      }
      const result = await syncPartnerSellerContact(actualMemberId)
      if (onShowToast) {
        onShowToast(result.message, result.success ? 'success' : 'error')
      } else {
        setSubmitMessage({
          type: result.success ? 'success' : 'error',
          text: result.message,
        })
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : '셀러 정보 수정 중 오류가 발생했습니다.'
      if (onShowToast) {
        onShowToast(message, 'error')
      } else {
        setSubmitMessage({ type: 'error', text: message })
      }
    } finally {
      setIsSyncingSeller(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {!readOnly && (
        <Typography variant="body2" color="text-secondary" className="mb-6">
          메이트유의 파트너가 되어 게임 친구들과 함께 즐거운 시간을 보내세요!
        </Typography>
      )}

      {/* 성공/에러 메시지 */}
      {submitMessage && (
        <div
          className={`p-4 rounded-lg mb-6 ${
            submitMessage.type === 'success'
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
          }`}
        >
          <Typography
            variant="body2"
            className={
              submitMessage.type === 'success'
                ? 'text-green-800'
                : 'text-red-800'
            }
          >
            {submitMessage.text}
          </Typography>
        </div>
      )}

      {/* 디스코드 ID 확인용 표시 */}
      <div className="bg-[#FE3A8F]/5 border border-[#FE3A8F]/20 p-4 rounded-xl mb-6">
        <Typography variant="body2" className="text-gray-500 mb-1">
          신청자 ID
        </Typography>
        <Typography variant="body1" className="font-medium text-gray-900">
          {user?.member_code || '로그인이 필요합니다'}
        </Typography>
      </div>

      {!isSettlementOnly && (
        <>
          <Input
            label="파트너명 *"
            type="text"
            placeholder="파트너로 활동할 때 사용할 이름을 입력해주세요"
            value={formData.partnerName}
            onChange={(e) => handleInputChange('partnerName', e.target.value)}
            error={errors.partnerName}
            helpText="예: 팀 루나틱, 에이펙스 크루 등"
            disabled={isSubmitting || readOnly}
            readOnly={readOnly}
          />

          <Textarea
            label="파트너 메시지 *"
            placeholder="파트너 신청 동기나 어필하고 싶은 내용을 작성해주세요"
            value={formData.partnerMessage}
            onChange={(e) => handleInputChange('partnerMessage', e.target.value)}
            error={errors.partnerMessage}
            helpText="승인 검토 시 참고됩니다"
            rows={4}
            disabled={isSubmitting || readOnly}
            readOnly={readOnly}
          />
        </>
      )}

      {!isSettlementOnly && (readOnly ? (
        <div className="space-y-4">
          {/* 배경 이미지 미리보기 (상단) */}
          {backgroundImages.length > 0 && (
            <div>
              <Typography variant="body2" color="text-secondary" className="mb-2">
                배경 이미지 ({backgroundImages.length}개)
              </Typography>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                {backgroundImages.map((image, index) => (
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

          {/* 프로필 이미지 */}
          {formData.profileImage ? (
            <div>
              <Typography variant="body2" color="text-secondary" className="mb-2">
                프로필 이미지
              </Typography>
              <img
                src={formData.profileImage}
                alt="프로필"
                className="w-20 h-20 rounded-lg object-cover border"
              />
            </div>
          ) : (
            <div>
              <Typography variant="body2" color="text-secondary" className="mb-2">
                프로필 이미지
              </Typography>
              <Typography variant="body1" color="text-secondary">
                이미지가 없습니다
              </Typography>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* 프로필 이미지 */}
          <div>
            <Typography variant="body2" color="text-secondary" className="mb-2">
              프로필 이미지
            </Typography>
            <ImageUpload
              bucket="profile-images"
              currentImageUrl={formData.profileImage}
              onImageUploaded={(url) => handleInputChange('profileImage', url)}
              onImageDeleted={() => handleInputChange('profileImage', '')}
              userId={user?.id}
              memberCode={user?.member_code || undefined}
              maxWidth={400}
              maxHeight={400}
              quality={0.9}
              maxSize={5}
            />
            {errors.profileImage && (
              <Typography variant="caption" className="text-red-600 mt-1">
                {errors.profileImage}
              </Typography>
            )}
            <Typography
              variant="caption"
              color="text-secondary"
              className="mt-1 block"
            >
              파트너 프로필에 표시될 이미지를 업로드해주세요
            </Typography>
          </div>
        </div>
      ))}

      {/* 배경 이미지 관리 */}
      {!isSettlementOnly && (readOnly ? (
        backgroundImages.length > 0 ? (
          <div>
            <Typography variant="body2" color="text-secondary" className="mb-2">
              배경 이미지 ({backgroundImages.length}개)
            </Typography>
            <div className="grid grid-cols-4 gap-2">
              {backgroundImages.map((image, index) => (
                <img
                  key={image.id || index}
                  src={image.url}
                  alt={`배경 ${index + 1}`}
                  className="w-full h-16 rounded-lg object-cover border"
                />
              ))}
            </div>
          </div>
        ) : (
          <div>
            <Typography variant="body2" color="text-secondary" className="mb-2">
              배경 이미지
            </Typography>
            <Typography variant="body1" color="text-secondary">
              배경 이미지가 없습니다
            </Typography>
          </div>
        )
      ) : (
        <div>
          <Typography variant="body2" color="text-secondary" className="mb-2">
            배경 이미지
          </Typography>
          <PartnerBackgroundUpload
            memberCode={user?.member_code || ''}
            currentImages={backgroundImages}
            onImagesUpdated={handleBackgroundImagesUpdate}
            maxImages={5}
          />
          <Typography
            variant="caption"
            color="text-secondary"
            className="mt-2 block"
          >
            파트너 프로필 페이지에 표시될 배경 이미지를 업로드해주세요 (최대 5개)
          </Typography>
        </div>
      ))}

      {/* {!isSettlementOnly && (
        <>
          <Input
            label="선호하는 게임 *"
            type="text"
            placeholder="예: 리그 오브 레전드, 배틀그라운드, 오버워치 등"
            value={formData.favoriteGame}
            onChange={(e) => handleInputChange('favoriteGame', e.target.value)}
            error={errors.favoriteGame}
            disabled={isSubmitting || readOnly}
            readOnly={readOnly}
          />

          <GameInfoInput
            value={formData.gameInfos}
            onChange={(gameInfos) => handleInputChange('gameInfos', gameInfos)}
            error={errors.gameInfos}
            disabled={isSubmitting || readOnly}
            readOnly={readOnly}
          />
        </>
      )} */}

      {!isSettlementOnly && (
        <div className="space-y-4 rounded-xl border border-[#FE3A8F]/20 bg-[#FE3A8F]/5 p-4">
          <div>
            <Typography variant="body1" className="font-semibold text-[#FE3A8F]">
              정산 정보 안내
            </Typography>
            <Typography variant="body2" className="text-gray-600 mt-2">
              파트너 승인 후 대시보드에서 토스 셀러 등록을 통해 포인트를 현금으로 환전할 수 있습니다.
              <br />
              토스 셀러 등록 시 본인 인증 및 정산 정보가 필요합니다.
            </Typography>
          </div>
        </div>
      )}

      <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl">
        <Typography variant="caption" className="text-gray-600">
          <strong className="text-gray-700">{readOnly ? '참고사항' : '안내사항'}:</strong>
          <br />
          {readOnly ? (
            <>
              • 파트너 승인 후 프로필이 공개되며, 예약을 받을 수 있습니다.
              <br />
              • 신청 상태가 pending인 경우 내용을 수정할 수 있습니다.
              <br />• 문의사항이 있으시면 관리자에게 연락해주세요.
            </>
          ) : (
            <>
              • 신청서 검토 후 3-5일 내에 이메일로 결과를 알려드립니다.
              <br />
              • 파트너 승인 후 프로필이 공개되며, 예약을 받을 수 있습니다.
              <br />• 건전하고 즐거운 게임 문화를 만들어주세요.
            </>
          )}
        </Typography>
      </div>

      {showButtons && !readOnly && (
        <Flex
          direction="column"
          className="sm:flex-row justify-end space-y-2 sm:space-y-0 sm:space-x-3 pt-4 border-t"
        >
          {mode === 'edit' && partnerId && (
            <Button
              type="button"
              variant="outline"
              onClick={handleSyncSeller}
              disabled={isSubmitting || isSyncingSeller}
              loading={isSyncingSeller}
              className="w-full sm:w-auto"
            >
              {isSyncingSeller ? '셀러 정보 동기화 중...' : '셀러 정보 동기화'}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isSubmitting}
            className="w-full sm:w-auto"
          >
            취소
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting}
            className="w-full sm:w-auto"
          >
            {isSubmitting
              ? mode === 'edit'
                ? '수정 중...'
                : '신청 중...'
              : mode === 'edit'
                ? '수정하기'
                : '신청하기'}
          </Button>
        </Flex>
      )}
    </form>
  )
}
