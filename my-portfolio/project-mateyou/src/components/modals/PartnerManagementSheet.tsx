import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Plus, Loader2, Trash2, X } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/sonner'
import {
  SlideSheet,
  Typography,
} from '@/components'
import { useAuth } from '@/hooks/useAuth'
import { usePartnerData } from '@/hooks/usePartnerData'
import { mateYouApi } from '@/lib/apiClient'
import { edgeApi } from '@/lib/apiClient'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CATEGORIES } from '@/constants/categories'
import { BANK_CODES, findBankByCode } from '@/constants/banks'
import { submitPartnerApplication } from '@/lib/partnerApi'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Pagination } from 'swiper/modules'
import { Link } from '@tanstack/react-router'
// @ts-ignore
import 'swiper/css'
// @ts-ignore
import 'swiper/css/pagination'

const REFERRAL_SOURCE_OPTIONS = [
  { value: 'sns', label: 'SNS (인스타그램, 트위터 등)' },
  { value: 'friend', label: '지인 추천' },
  { value: 'search', label: '검색 (구글, 네이버 등)' },
  { value: 'ad', label: '광고' },
  { value: 'youtube', label: '유튜브' },
  { value: 'community', label: '커뮤니티' },
  { value: 'other', label: '기타' },
]

const SNS_TYPE_OPTIONS = [
  { value: 'instagram', label: '인스타그램' },
  { value: 'threads', label: '쓰레드' },
  { value: 'tiktok', label: '틱톡' },
  { value: 'youtube', label: '유튜브' },
  { value: 'twitter', label: '트위터' },
  { value: 'other', label: '기타' },
]

const GENDER_OPTIONS = [
  { value: 'male', label: '남성' },
  { value: 'female', label: '여성' },
  { value: 'other', label: '기타' },
  { value: 'prefer_not_to_say', label: '비공개' },
]

const OTHER_PLATFORM_OPTIONS = [
  { value: 'youtube', label: '유튜브' },
  { value: 'twitch', label: '트위치' },
  { value: 'soop', label: '숲' },
  { value: 'chzzk', label: '치지직' },
  { value: 'liky', label: '라이키' },
  { value: 'fantrie', label: '팬트리' },
  { value: 'other', label: '기타' },
]

const MAIN_CONTENT_OPTIONS = [
  { value: 'gaming', label: '게임' },
  { value: 'variety', label: '예능/토크' },
  { value: 'music', label: '음악' },
  { value: 'vlog', label: 'Vlog' },
  { value: 'asmr', label: 'ASMR' },
  { value: 'adult', label: '19금' },
  { value: 'other', label: '기타' },
]

interface PartnerManagementSheetProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

interface GameInfo {
  game: string
  tier: string
  description: string
}

interface SelectedCategory {
  categoryId: number
  detailId: number | null
  categoryLabel: string
  detailLabel: string | null
}

type TabType = 'profile' | 'settlement'

export function PartnerManagementSheet({ isOpen, onClose, onSuccess }: PartnerManagementSheetProps) {
  const { user, refreshUser } = useAuth()
  const queryClient = useQueryClient()
  const { refetch: refetchPartnerData } = usePartnerData(user?.id || '')
  
  const [activeTab, setActiveTab] = useState<TabType>('profile')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  
  // 프로필 폼 상태
  const [partnerName, setPartnerName] = useState('')
  const [partnerMessage, setPartnerMessage] = useState('')
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [favoriteGame, setFavoriteGame] = useState('')
  const [gameInfos, setGameInfos] = useState<GameInfo[]>([])
  const [profileImage, setProfileImage] = useState<string | null>(null)
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null)
  const [backgroundUrls, setBackgroundUrls] = useState<string[]>([])
  const [backgroundFiles, setBackgroundFiles] = useState<File[]>([])
  const [backgroundUploadMode, setBackgroundUploadMode] = useState<'replace' | 'add'>('replace')
  
  // 카테고리 선택 상태
  const [selectedCategories, setSelectedCategories] = useState<SelectedCategory[]>([])
  const [currentMainCategory, setCurrentMainCategory] = useState('')
  const [currentDetailCategory, setCurrentDetailCategory] = useState('')
  
  // 정산 정보 상태
  const [legalName, setLegalName] = useState('')
  const [legalEmail, setLegalEmail] = useState('')
  const [legalPhone, setLegalPhone] = useState('')
  const [payoutBankCode, setPayoutBankCode] = useState('')
  const [payoutAccountNumber, setPayoutAccountNumber] = useState('')
  const [payoutAccountHolder, setPayoutAccountHolder] = useState('')
  
  const profileImageInputRef = useRef<HTMLInputElement>(null)
  const backgroundInputRef = useRef<HTMLInputElement>(null)
  const objectUrlsRef = useRef<string[]>([])

  const isNormalUser = user?.role === 'normal'

  const [applicationStep, setApplicationStep] = useState<1 | 2>(1)
  const [interviewReferralSource, setInterviewReferralSource] = useState('')
  const [interviewSnsType, setInterviewSnsType] = useState('')
  const [interviewContactId, setInterviewContactId] = useState('')
  const [referrerMemberCode, setReferrerMemberCode] = useState('')
  const [interviewGender, setInterviewGender] = useState('')
  const [interviewOtherPlatforms, setInterviewOtherPlatforms] = useState<string[]>([])
  const [interviewMainContent, setInterviewMainContent] = useState('')
  const [termsAgreed, setTermsAgreed] = useState(false)
  const [privacyAgreed, setPrivacyAgreed] = useState(false)

  // 데이터 로드 - isOpen이 true로 변경될 때만 실행
  const dataLoadedRef = useRef(false)
  
  useEffect(() => {
    if (!isOpen) {
      dataLoadedRef.current = false
      if (isNormalUser) setApplicationStep(1)
      return
    }
    
    // 이미 로드했으면 스킵
    if (dataLoadedRef.current) return
    if (!user) return

    dataLoadedRef.current = true

    const loadData = async () => {
      setIsLoading(true)
      try {
        // 기본값 설정
        setPartnerName(user.name || '')
        setLegalName(user.name || '')
        setLegalEmail(user.email || '')
        setProfileImage(user.profile_image || null)

        if (user.role === 'partner') {
          // 파트너인 경우 API에서 정보 가져오기
          const response = await mateYouApi.partnerProfile.info()

          if (response.data.success && response.data.data) {
            const data = response.data.data as any
            const partner = data.partner || {}
            const categories = partner.categories || data.categories || []

            // partner_business_info 추출 (API 응답에서)
            const businessInfo = partner.partner_business_info

            setPartnerName(partner.partner_name || user.name || '')
            setPartnerMessage(partner.partner_message || '')
            setFavoriteGame(user.favorite_game || '')

            // 게임 정보
            if (partner.game_info) {
              const gameInfo = Array.isArray(partner.game_info) ? partner.game_info : [partner.game_info]
              setGameInfos(gameInfo)
            }

            // 프로필 이미지
            const profileImg = partner.members?.profile_image || user.profile_image
            setProfileImage(profileImg || null)

            // 배경 이미지
            if (Array.isArray(partner.background_images)) {
              const urls = partner.background_images
                .map((img: any) => typeof img === 'string' ? img : img?.url)
                .filter(Boolean)
              setBackgroundUrls(urls)
            }

            // 카테고리
            if (Array.isArray(categories) && categories.length > 0) {
              const loadedCategories = categories
                .map((cat: any) => {
                  const category = CATEGORIES.find(c => c.apiId === cat.category_id)
                  if (!category) return null
                  const detail = cat.detail_category_id
                    ? category.details.find(d => d.apiId === cat.detail_category_id)
                    : null
                  return {
                    categoryId: cat.category_id,
                    detailId: cat.detail_category_id,
                    categoryLabel: category.label,
                    detailLabel: detail?.label || null,
                  }
                })
                .filter(Boolean) as SelectedCategory[]
              setSelectedCategories(loadedCategories)
            }

            // 정산 정보 (partner_business_info 우선, fallback으로 partner 필드)
            setLegalName(businessInfo?.legal_name || partner.legal_name || user.name || '')
            setLegalEmail(businessInfo?.legal_email || partner.legal_email || user.email || '')
            setLegalPhone(businessInfo?.legal_phone || partner.legal_phone || '')
            setPayoutBankCode(businessInfo?.payout_bank_code || partner.payout_bank_code || '')
            setPayoutAccountNumber(businessInfo?.payout_account_number || partner.payout_account_number || '')
            setPayoutAccountHolder(businessInfo?.payout_account_holder || partner.payout_account_holder || businessInfo?.legal_name || partner.legal_name || user.name || '')
          }

          // 환영 메시지 조회
          try {
            const welcomeResponse = await edgeApi.partners.getWelcomeMessage()
            if (welcomeResponse.success && welcomeResponse.data) {
              setWelcomeMessage(welcomeResponse.data.welcome_message || '')
            }
          } catch (error) {
            console.error('환영 메시지 로드 실패:', error)
          }
        }
      } catch (error) {
        console.error('데이터 로드 실패:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [isOpen]) // user 제거, isOpen만 의존

  // 정리
  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
      objectUrlsRef.current = []
    }
  }, [])

  const handleProfileImageChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      toast.error('파일 크기는 5MB 이하여야 합니다')
      return
    }

    if (!file.type.startsWith('image/')) {
      toast.error('이미지 파일만 업로드 가능합니다')
      return
    }

    const url = URL.createObjectURL(file)
    objectUrlsRef.current.push(url)
    setProfileImageFile(file)
    setProfileImage(url)
  }

  const handleBackgroundChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    if (files.length === 0) return

    const newUrls: string[] = []
    const validFiles: File[] = []

    files.forEach(file => {
      if (!file.type.startsWith('image/')) return
      if (file.size > 5 * 1024 * 1024) return
      const url = URL.createObjectURL(file)
      objectUrlsRef.current.push(url)
      newUrls.push(url)
      validFiles.push(file)
    })

    if (backgroundUploadMode === 'replace') {
      // 교체 모드: 기존 이미지 모두 제거하고 새 이미지로 대체
      setBackgroundFiles(validFiles)
      setBackgroundUrls(newUrls)
    } else {
      // 추가 모드: 기존 이미지에 추가
      setBackgroundFiles(prev => [...prev, ...validFiles])
      setBackgroundUrls(prev => [...prev, ...newUrls])
    }
    e.target.value = ''
  }

  const handleClearBackgroundSelection = () => {
    setBackgroundUrls([])
    setBackgroundFiles([])
  }

  const handleRemoveProfileImage = () => {
    setProfileImage(null)
    setProfileImageFile(null)
  }

  // URL을 File 객체로 변환하는 헬퍼 함수
  const urlToFile = async (url: string, filename: string): Promise<File> => {
    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
    }

    // URL에서 실제 확장자 추출
    const getExtFromUrl = (urlStr: string): string => {
      try {
        const pathname = new URL(urlStr).pathname
        const ext = pathname.split('.').pop()?.toLowerCase() || ''
        return ext.split('?')[0] // query string 제거
      } catch {
        return ''
      }
    }

    // response로 mime type 얻기 (가장 정확)
    const response = await fetch(url, { mode: 'cors' })
    if (!response.ok) throw new Error(`Failed to fetch: ${response.status}`)
    
    const blob = await response.blob()
    
    // blob type이 있으면 사용, 없으면 URL 확장자로 추론
    let mimeType = blob.type
    if (!mimeType || mimeType === 'application/octet-stream') {
      const ext = getExtFromUrl(url)
      mimeType = mimeTypes[ext] || 'image/jpeg'
    }
    
    // 파일명에 올바른 확장자 적용
    const ext = Object.entries(mimeTypes).find(([, v]) => v === mimeType)?.[0] || 'jpg'
    const finalFilename = `${filename.split('.')[0]}.${ext}`
    
    return new File([blob], finalFilename, { type: mimeType })
  }

  const handleAddCategory = () => {
    if (!currentMainCategory) {
      toast.error('대분류를 선택해주세요')
      return
    }

    const mainCategory = CATEGORIES.find(c => c.id === currentMainCategory)
    if (!mainCategory) return

    const detailCategory = currentDetailCategory
      ? mainCategory.details.find(d => d.id === currentDetailCategory)
      : null

    // 중복 체크
    const isDuplicate = selectedCategories.some(
      cat => cat.categoryId === mainCategory.apiId && cat.detailId === (detailCategory?.apiId || null)
    )

    if (isDuplicate) {
      toast.error('이미 추가된 카테고리입니다')
      return
    }

    setSelectedCategories(prev => [...prev, {
      categoryId: mainCategory.apiId,
      detailId: detailCategory?.apiId || null,
      categoryLabel: mainCategory.label,
      detailLabel: detailCategory?.label || null,
    }])

    setCurrentMainCategory('')
    setCurrentDetailCategory('')
  }

  const handleRemoveCategory = (index: number) => {
    setSelectedCategories(prev => prev.filter((_, i) => i !== index))
  }

  const selectedMainCategory = CATEGORIES.find(c => c.id === currentMainCategory)

  const handleNextToStep2 = () => {
    if (!partnerName.trim()) {
      toast.error('파트너명을 입력해주세요')
      return
    }
    if (!partnerMessage.trim()) {
      toast.error('파트너 메시지를 입력해주세요')
      return
    }
    if (!profileImage) {
      toast.error('프로필 이미지를 등록해주세요')
      return
    }
    if (selectedCategories.length === 0) {
      toast.error('최소 1개 이상의 카테고리를 선택해주세요')
      return
    }
    setApplicationStep(2)
  }

  const handleSubmit = async () => {
    if (isSubmitting) return

    if (isNormalUser && applicationStep === 1) {
      handleNextToStep2()
      return
    }

    if (isNormalUser && applicationStep === 2) {
      if (!legalName.trim()) {
        toast.error('실명을 입력해주세요')
        return
      }
      if (!legalEmail.trim()) {
        toast.error('이메일을 입력해주세요')
        return
      }
      if (!legalPhone.trim() || legalPhone.replace(/\D/g, '').length < 8) {
        toast.error('연락처를 입력해주세요 (8자리 이상)')
        return
      }
      if (!payoutBankCode) {
        toast.error('은행을 선택해주세요')
        return
      }
      if (!payoutAccountNumber.trim()) {
        toast.error('계좌번호를 입력해주세요')
        return
      }
      if (!payoutAccountHolder.trim()) {
        toast.error('예금주를 입력해주세요')
        return
      }
      setApplicationStep(3)
      return
    }

    if (isNormalUser && applicationStep === 3) {
      if (!termsAgreed || !privacyAgreed) {
        toast.error('개인정보처리방침과 이용약관에 동의해주세요')
        return
      }
      setIsSubmitting(true)
      try {
        let profileImageUrl = profileImage && !profileImage.startsWith('blob:') ? profileImage : ''
        if (profileImage?.startsWith('blob:') && profileImageFile) {
          const uploadResponse = await mateYouApi.storage.upload(
            profileImageFile,
            'profile-images',
            `partners/${user?.id}/profile-${Date.now()}.jpg`
          )
          if (uploadResponse.data.success && uploadResponse.data.data?.url) {
            profileImageUrl = uploadResponse.data.data.url
          }
        }
        const uploadedBackgroundUrls: string[] = []
        for (let i = 0; i < backgroundFiles.length; i++) {
          const file = backgroundFiles[i]
          const uploadResponse = await mateYouApi.storage.upload(
            file,
            'profile-images',
            `partners/${user?.id}/background-${Date.now()}-${i}.jpg`
          )
          if (uploadResponse.data.success && uploadResponse.data.data?.url) {
            uploadedBackgroundUrls.push(uploadResponse.data.data.url)
          }
        }
        for (const url of backgroundUrls) {
          if (url && !url.startsWith('blob:')) uploadedBackgroundUrls.push(url)
        }
        const now = new Date().toISOString()
        const bankName = payoutBankCode ? findBankByCode(payoutBankCode)?.name : ''
        const result = await submitPartnerApplication({
          partnerName: partnerName.trim(),
          partnerMessage: partnerMessage.trim(),
          profileImage: profileImageUrl,
          favoriteGame: favoriteGame.trim(),
          gameInfo: gameInfos.length > 0 ? JSON.stringify(gameInfos) : '',
          socialId: user?.social_id || '',
          categories: selectedCategories.map(c => ({ category_id: c.categoryId, detail_category_id: c.detailId })),
          referralSource: interviewReferralSource || undefined,
          referrerMemberCode: referrerMemberCode.trim() || undefined,
          interviewSnsType: interviewSnsType || undefined,
          interviewContactId: interviewContactId.trim() || undefined,
          interviewGender: interviewGender || undefined,
          interviewOtherPlatforms: interviewOtherPlatforms.length > 0 ? interviewOtherPlatforms.join(',') : undefined,
          interviewMainContent: interviewMainContent || undefined,
          termsAgreedAt: termsAgreed ? now : undefined,
          privacyAgreedAt: privacyAgreed ? now : undefined,
          legalName: legalName.trim(),
          legalEmail: legalEmail.trim(),
          legalPhone: legalPhone.trim(),
          payoutBankCode,
          payoutBankName: bankName || undefined,
          payoutAccountNumber: payoutAccountNumber.trim(),
          payoutAccountHolder: payoutAccountHolder.trim(),
        })
        if (result.success) {
          toast.success('파트너 신청이 완료되었습니다!')
          await refreshUser()
          onSuccess?.()
          onClose()
        } else {
          toast.error(result.message || '파트너 신청에 실패했습니다')
        }
      } catch (e) {
        console.error(e)
        toast.error('신청 처리 중 오류가 발생했습니다')
      } finally {
        setIsSubmitting(false)
      }
      return
    }

    if (!partnerName.trim()) {
      toast.error('파트너명을 입력해주세요')
      return
    }
    if (!partnerMessage.trim()) {
      toast.error('파트너 메시지를 입력해주세요')
      return
    }
    if (selectedCategories.length === 0) {
      toast.error('최소 1개 이상의 카테고리를 선택해주세요')
      return
    }
    if (!isNormalUser) {
      if (!legalName.trim()) {
        toast.error('실명을 입력해주세요')
        setActiveTab('settlement')
        return
      }
      if (!legalEmail.trim()) {
        toast.error('이메일을 입력해주세요')
        setActiveTab('settlement')
        return
      }
      if (!legalPhone.trim() || legalPhone.replace(/\D/g, '').length < 8) {
        toast.error('연락처를 입력해주세요')
        setActiveTab('settlement')
        return
      }
      if (!payoutBankCode) {
        toast.error('은행을 선택해주세요')
        setActiveTab('settlement')
        return
      }
      if (!payoutAccountNumber.trim()) {
        toast.error('계좌번호를 입력해주세요')
        setActiveTab('settlement')
        return
      }
      if (!payoutAccountHolder.trim()) {
        toast.error('예금주를 입력해주세요')
        setActiveTab('settlement')
        return
      }
    }

    setIsSubmitting(true)

    try {
      if (!isNormalUser) {
        // 파트너 프로필 수정 (JSON body 사용)

        // 프로필 이미지 업로드
        let profileImageUrl: string | undefined = undefined
        if (profileImageFile) {
          try {
            console.log('📸 Uploading profile image...')
            const uploadResponse = await mateYouApi.storage.upload(
              profileImageFile,
              'profile-images',
              `partners/${user?.id}/profile-${Date.now()}.jpg`
            )
            if (uploadResponse.data.success && uploadResponse.data.data?.url) {
              profileImageUrl = uploadResponse.data.data.url
              console.log('📸 Profile image uploaded:', profileImageUrl)
            }
          } catch (err) {
            console.error('프로필 이미지 업로드 실패:', err)
          }
        } else if (profileImage && !profileImage.startsWith('blob:')) {
          profileImageUrl = profileImage
        }

        // 배경 이미지 업로드
        const uploadedBackgroundUrls: string[] = []
        console.log('📸 Processing background images:', {
          newFiles: backgroundFiles.length,
          totalUrls: backgroundUrls.length
        })

        // 1. 새로 선택한 파일들 업로드
        for (let i = 0; i < backgroundFiles.length; i++) {
          const file = backgroundFiles[i]
          try {
            console.log(`  - Uploading new file ${i}:`, file.name, file.size)
            const uploadResponse = await mateYouApi.storage.upload(
              file,
              'profile-images',
              `partners/${user?.id}/background-${Date.now()}-${i}.jpg`
            )
            if (uploadResponse.data.success && uploadResponse.data.data?.url) {
              uploadedBackgroundUrls.push(uploadResponse.data.data.url)
              console.log(`  - Uploaded:`, uploadResponse.data.data.url)
            }
          } catch (err) {
            console.error(`배경 이미지 ${i} 업로드 실패:`, err)
          }
        }

        // 2. 기존 URL들 중 blob이 아닌 것들 유지
        for (let i = 0; i < backgroundUrls.length; i++) {
          const url = backgroundUrls[i]
          if (url && !url.startsWith('blob:')) {
            uploadedBackgroundUrls.push(url)
            console.log(`  - Keeping existing URL ${i}:`, url)
          }
        }

        // JSON body 구성 - 이미지 필드는 항상 전송 (빈 배열/null이면 삭제)
        const requestData = {
          partnerName: partnerName.trim(),
          partnerMessage: partnerMessage.trim(),
          categories: selectedCategories.map(c => ({
            category_id: c.categoryId,
            detail_category_id: c.detailId,
          })),
          gameInfos: gameInfos.length > 0 ? gameInfos : undefined,
          legalName: legalName.trim(),
          legalEmail: legalEmail.trim(),
          legalPhone: legalPhone.replace(/\D/g, ''),
          profileImage: profileImageUrl || null, // 없으면 null 전송 (삭제)
          backgroundImages: uploadedBackgroundUrls, // 항상 전송 (빈 배열이면 삭제)
        }

        const response = await mateYouApi.partnerProfile.update(requestData)

        if (response.data.success) {
          // 환영 메시지 업데이트
          try {
            const trimmedMessage = welcomeMessage.trim()
            await edgeApi.partners.updateWelcomeMessage(trimmedMessage || '')
          } catch (error) {
            console.error('환영 메시지 업데이트 실패:', error)
            // 환영 메시지 업데이트 실패해도 프로필 수정은 성공했으므로 계속 진행
          }

          toast.success('프로필이 수정되었습니다!')
          await refreshUser()
          refetchPartnerData()
          queryClient.invalidateQueries({ queryKey: ['partner'] })
          queryClient.invalidateQueries({ queryKey: ['partners'] })
          onSuccess?.()
          onClose()
        } else {
          toast.error(response.data.error?.message || '프로필 수정에 실패했습니다')
        }
      }
    } catch (error) {
      console.error('제출 실패:', error)
      toast.error('처리 중 오류가 발생했습니다')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <SlideSheet
      isOpen={isOpen}
      onClose={onClose}
      title={isNormalUser ? '파트너 신청' : '프로필 관리'}
      initialHeight={0.92}
      minHeight={0.5}
      maxHeight={0.95}
      zIndex={120}
      noPadding
      renderHeader={({ onPointerDown, onTouchStart }) => (
        <div 
          className="relative border-b border-gray-100 px-6 py-4 touch-none cursor-grab"
          onPointerDown={onPointerDown}
          onTouchStart={onTouchStart}
        >
          {(isNormalUser && (applicationStep === 2 || applicationStep === 3)) && (
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-200"
              onClick={() => setApplicationStep(applicationStep === 3 ? 2 : 1)}
            >
              이전
            </button>
          )}
          <Typography variant="h5" className="text-center text-lg font-semibold text-[#110f1a]">
            {isNormalUser ? '파트너 신청' : '프로필 관리'}
          </Typography>
          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-lg bg-[#FE3A8F] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#e5327f] disabled:opacity-50"
            onClick={handleSubmit}
            disabled={isSubmitting}
          >
            {isSubmitting ? '처리중...' : isNormalUser && applicationStep === 1 ? '다음' : isNormalUser && applicationStep === 2 ? '다음' : isNormalUser ? '신청하기' : '저장'}
          </button>
        </div>
      )}
    >
      {!isNormalUser && (
      <div className="flex border-b border-gray-100 px-4">
          <button
            className={`flex-1 py-3 text-sm font-medium transition ${
              activeTab === 'profile'
                ? 'border-b-2 border-[#FE3A8F] text-[#FE3A8F]'
                : 'text-gray-500'
            }`}
            onClick={() => setActiveTab('profile')}
          >
            프로필 정보
          </button>
          <button
            className={`flex-1 py-3 text-sm font-medium transition ${
              activeTab === 'settlement'
                ? 'border-b-2 border-[#FE3A8F] text-[#FE3A8F]'
                : 'text-gray-500'
            }`}
            onClick={() => setActiveTab('settlement')}
          >
            정산 정보
          </button>
        </div>
      )}

        {/* 콘텐츠 */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-gray-400 px-6 py-6">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>정보를 불러오는 중...</span>
            </div>
          ) : isNormalUser && applicationStep === 2 ? (
            <div className="px-4 py-6 space-y-4">
              <div className="rounded-lg bg-blue-50 p-4">
                <Typography variant="body2" className="text-blue-700">
                  정산 정보는 수익금 지급을 위해 필요합니다. 정확하게 입력해주세요.
                </Typography>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">실명 *</label>
                <input
                  type="text"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder="정산 받을 실명"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-[#FE3A8F] focus:outline-none focus:ring-1 focus:ring-[#FE3A8F]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">이메일 *</label>
                <input
                  type="email"
                  value={legalEmail}
                  onChange={(e) => setLegalEmail(e.target.value)}
                  placeholder="정산 안내 이메일"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-[#FE3A8F] focus:outline-none focus:ring-1 focus:ring-[#FE3A8F]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">연락처 *</label>
                <input
                  type="tel"
                  value={legalPhone}
                  onChange={(e) => setLegalPhone(e.target.value.replace(/[^\d-]/g, ''))}
                  placeholder="01012345678 (하이픈 없이)"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-[#FE3A8F] focus:outline-none focus:ring-1 focus:ring-[#FE3A8F]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">정산 은행 *</label>
                <select
                  value={payoutBankCode}
                  onChange={(e) => setPayoutBankCode(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-[#FE3A8F] focus:outline-none focus:ring-1 focus:ring-[#FE3A8F]"
                >
                  <option value="">은행을 선택하세요</option>
                  {BANK_CODES.map((bank) => (
                    <option key={bank.code} value={bank.code}>{bank.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">계좌번호 *</label>
                <input
                  type="text"
                  value={payoutAccountNumber}
                  onChange={(e) => setPayoutAccountNumber(e.target.value.replace(/\D/g, ''))}
                  placeholder="하이픈 없이 입력"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-[#FE3A8F] focus:outline-none focus:ring-1 focus:ring-[#FE3A8F]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">예금주 *</label>
                <input
                  type="text"
                  value={payoutAccountHolder}
                  onChange={(e) => setPayoutAccountHolder(e.target.value)}
                  placeholder="계좌 예금주명"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-[#FE3A8F] focus:outline-none focus:ring-1 focus:ring-[#FE3A8F]"
                />
              </div>
            </div>
          ) : isNormalUser && applicationStep === 3 ? (
            <div className="px-4 py-6 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">유입 경로</label>
                <select
                  value={interviewReferralSource}
                  onChange={(e) => setInterviewReferralSource(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-[#FE3A8F] focus:outline-none focus:ring-1 focus:ring-[#FE3A8F]"
                >
                  <option value="">어디서 메이트유를 알게 되었나요?</option>
                  {REFERRAL_SOURCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">신원 확인 SNS</label>
                <select
                  value={interviewSnsType}
                  onChange={(e) => setInterviewSnsType(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-[#FE3A8F] focus:outline-none focus:ring-1 focus:ring-[#FE3A8F]"
                >
                  <option value="">SNS 선택</option>
                  {SNS_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">SNS 계정 ID</label>
                <input
                  type="text"
                  value={interviewContactId}
                  onChange={(e) => setInterviewContactId(e.target.value)}
                  placeholder="해당 SNS 계정 ID"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-[#FE3A8F] focus:outline-none focus:ring-1 focus:ring-[#FE3A8F]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">추천인 코드 (선택)</label>
                <input
                  type="text"
                  value={referrerMemberCode}
                  onChange={(e) => setReferrerMemberCode(e.target.value)}
                  placeholder="추천인 멤버 코드"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-[#FE3A8F] focus:outline-none focus:ring-1 focus:ring-[#FE3A8F]"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">성별</label>
                <select
                  value={interviewGender}
                  onChange={(e) => setInterviewGender(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-[#FE3A8F] focus:outline-none focus:ring-1 focus:ring-[#FE3A8F]"
                >
                  <option value="">선택</option>
                  {GENDER_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">다른 플랫폼 활동 이력</label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {OTHER_PLATFORM_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => {
                        setInterviewOtherPlatforms((prev) =>
                          prev.includes(o.value) ? prev.filter((x) => x !== o.value) : [...prev, o.value]
                        )
                      }}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition ${
                        interviewOtherPlatforms.includes(o.value)
                          ? 'bg-[#FE3A8F] text-white border-[#FE3A8F]'
                          : 'border-gray-300 text-gray-700'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">주 콘텐츠</label>
                <select
                  value={interviewMainContent}
                  onChange={(e) => setInterviewMainContent(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-[#FE3A8F] focus:outline-none focus:ring-1 focus:ring-[#FE3A8F]"
                >
                  <option value="">선택</option>
                  {MAIN_CONTENT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-3 pt-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={privacyAgreed}
                    onChange={(e) => setPrivacyAgreed(e.target.checked)}
                    className="mt-1 rounded border-gray-300 text-[#FE3A8F] focus:ring-[#FE3A8F]"
                  />
                  <span className="text-sm">
                    <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="text-[#FE3A8F] underline">개인정보처리방침</Link>에 동의합니다 (필수)
                  </span>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={termsAgreed}
                    onChange={(e) => setTermsAgreed(e.target.checked)}
                    className="mt-1 rounded border-gray-300 text-[#FE3A8F] focus:ring-[#FE3A8F]"
                  />
                  <span className="text-sm">
                    <Link to="/terms" target="_blank" rel="noopener noreferrer" className="text-[#FE3A8F] underline">이용약관</Link>에 동의합니다 (필수)
                  </span>
                </label>
              </div>
            </div>
          ) : (activeTab === 'profile' || (isNormalUser && applicationStep === 1)) ? (
            <div>
              {/* 배경 이미지 섹션 - ProfileEditModal과 동일 */}
              <section>
                <div className="relative h-48 w-full overflow-hidden">
                  {backgroundUrls.length > 0 ? (
                    backgroundUrls.length === 1 ? (
                      <img
                        src={backgroundUrls[0]}
                        alt="배경 이미지"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Swiper
                        modules={[Pagination]}
                        pagination={{ 
                          clickable: true,
                        }}
                        loop={backgroundUrls.length > 1}
                        className="h-full w-full partner-bg-swiper"
                      >
                        {backgroundUrls.map((url, idx) => (
                          <SwiperSlide key={idx}>
                            <div className="relative h-full w-full">
                              <img
                                src={url}
                                alt={`배경 이미지 ${idx + 1}`}
                                className="h-full w-full object-cover"
                              />
                            </div>
                          </SwiperSlide>
                        ))}
                      </Swiper>
                    )
                  ) : (
                    <div className="h-full w-full bg-gray-200" />
                  )}
                  {/* 하단 버튼들: 왼쪽에 교체+추가, 오른쪽에 삭제 */}
                  <div className="absolute bottom-2 left-2 right-2 flex items-center z-20 pointer-events-none">
                    {/* 왼쪽: 교체 + 추가 버튼 */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        setBackgroundUploadMode('replace')
                        backgroundInputRef.current?.click()
                      }}
                      disabled={isSubmitting}
                      className="bg-black/60 hover:bg-black/80 text-white text-xs px-3 py-1.5 rounded-full transition cursor-pointer pointer-events-auto"
                    >
                      교체
                    </button>
                    {backgroundUrls.length > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          e.preventDefault()
                          setBackgroundUploadMode('add')
                          backgroundInputRef.current?.click()
                        }}
                        disabled={isSubmitting}
                        className="bg-black/60 hover:bg-black/80 text-white text-xs px-3 py-1.5 rounded-full transition cursor-pointer pointer-events-auto ml-1.5"
                      >
                        추가
                      </button>
                    )}
                    {/* 오른쪽: 삭제 아이콘 버튼 */}
                    {backgroundUrls.length > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          e.preventDefault()
                          handleClearBackgroundSelection()
                        }}
                        disabled={isSubmitting}
                        className="bg-black/60 hover:bg-black/80 text-white p-2 rounded-full transition cursor-pointer pointer-events-auto ml-auto"
                        title="배경 이미지 삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                <input
                  ref={backgroundInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleBackgroundChange}
                  className="hidden"
                />
                
                {/* 프로필 이미지 (배경 위에 겹침) - z-index 추가 */}
                <div className="-mt-14 flex flex-col items-center relative z-10">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => profileImageInputRef.current?.click()}
                      disabled={isSubmitting}
                      className="rounded-full border-4 border-white focus:outline-none group relative"
                    >
                      {profileImage ? (
                        <img
                          src={profileImage}
                          alt="프로필"
                          className="h-24 w-24 rounded-full object-cover"
                        />
                      ) : (
                        <div className="h-24 w-24 rounded-full bg-white" />
                      )}
                      {/* 프로필 이미지가 있을 때: 호버 오버레이 */}
                      {profileImage && (
                        <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </div>
                      )}
                      {/* 프로필 이미지가 없을 때: 중앙 카메라 아이콘 */}
                      {!profileImage && (
                        <div className="absolute inset-0 rounded-full flex items-center justify-center">
                          <div className="bg-[#FE3A8F] text-white p-3 rounded-full shadow-lg">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                          </div>
                        </div>
                      )}
                    </button>
                    {profileImage && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemoveProfileImage()
                        }}
                        disabled={isSubmitting}
                        className="absolute right-0 top-0 z-10 inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white shadow-lg transition hover:bg-black"
                        aria-label="이미지 제거"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-gray-500">클릭하여 프로필 사진 변경</p>
                </div>
                <input
                  ref={profileImageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleProfileImageChange}
                  className="hidden"
                />
                
              </section>

              {/* Swiper 커스텀 스타일 */}
              <style>{`
                .partner-bg-swiper .swiper-pagination {
                  top: 8px !important;
                  bottom: auto !important;
                }
                .partner-bg-swiper .swiper-pagination-bullet {
                  width: 6px;
                  height: 6px;
                  background: rgba(255, 255, 255, 0.5);
                  opacity: 1;
                }
                .partner-bg-swiper .swiper-pagination-bullet-active {
                  background: white;
                  width: 8px;
                  height: 8px;
                }
              `}</style>

              {/* 폼 영역 */}
              <div className="px-4 flex flex-col gap-6 pb-6 pt-4">
                  {/* 파트너명 */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  파트너명 *
                </label>
                <input
                  type="text"
                  value={partnerName}
                  onChange={(e) => setPartnerName(e.target.value)}
                  placeholder="파트너로 활동할 이름"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-[#FE3A8F] focus:outline-none focus:ring-1 focus:ring-[#FE3A8F]"
                />
              </div>

              {/* 파트너 메시지 */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  파트너 메시지 *
                </label>
                <textarea
                  value={partnerMessage}
                  onChange={(e) => setPartnerMessage(e.target.value)}
                  placeholder="자기소개나 어필하고 싶은 내용"
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-[#FE3A8F] focus:outline-none focus:ring-1 focus:ring-[#FE3A8F] resize-none"
                />
              </div>

              {/* 팔로우 환영 메시지 */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  팔로우 환영 메시지
                </label>
                <textarea
                  value={welcomeMessage}
                  onChange={(e) => {
                    const value = e.target.value
                    if (value.length <= 500) {
                      setWelcomeMessage(value)
                    }
                  }}
                  placeholder="팔로우 해주신 분들에게 자동으로 전송되는 환영 메시지를 입력하세요"
                  rows={3}
                  maxLength={500}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-[#FE3A8F] focus:outline-none focus:ring-1 focus:ring-[#FE3A8F] resize-none"
                />
                <div className="mt-1 flex justify-end">
                  <span className={`text-xs ${welcomeMessage.length > 500 ? 'text-red-500' : 'text-gray-500'}`}>
                    {welcomeMessage.length}/500
                  </span>
                </div>
              </div>

              {/* 전문분야 - partners/$memberCode 스타일 */}
              <div>
                <p className="text-md mb-2 text-[#bf221b] font-bold">특기</p>
                
                {/* 선택된 카테고리 태그 - partners/$memberCode와 동일 스타일 */}
                {selectedCategories.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {selectedCategories.map((cat, index) => {
                      // 표시 형식: categoryId가 1(메이트)일 경우 "메이트 - {소분류}", 그 외 "{대분류}"
                      const displayLabel = cat.categoryId === 1 && cat.detailLabel
                        ? `${cat.categoryLabel} - ${cat.detailLabel}`
                        : cat.categoryLabel
                      
                      return (
                        <span
                          key={`${cat.categoryId}-${cat.detailId}-${index}`}
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-[#FE3A8F]/10 text-[0.8rem] font-semibold rounded-[3px] text-[#110f1a]"
                        >
                          {displayLabel}
                          <button
                            type="button"
                            onClick={() => handleRemoveCategory(index)}
                            className="rounded-full hover:bg-[#FE3A8F]/20 p-0.5"
                          >
                            <X className="h-3 w-3 text-gray-500" />
                          </button>
                        </span>
                      )
                    })}
                  </div>
                )}

                {/* 카테고리 선택 UI */}
                <div className="flex gap-2">
                  <Select value={currentMainCategory} onValueChange={(v) => {
                    setCurrentMainCategory(v)
                    setCurrentDetailCategory('')
                  }}>
                    <SelectTrigger className="flex-1 h-10">
                      <SelectValue placeholder="대분류 선택" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {CATEGORIES.map(cat => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>

                  {selectedMainCategory && selectedMainCategory.details.length > 0 && (
                    <Select value={currentDetailCategory} onValueChange={setCurrentDetailCategory}>
                      <SelectTrigger className="flex-1 h-10">
                        <SelectValue placeholder="소분류 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {selectedMainCategory.details.map(detail => (
                            <SelectItem key={detail.id} value={detail.id}>
                              {detail.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}

                  <button
                    type="button"
                    onClick={handleAddCategory}
                    className="rounded-lg bg-[#FE3A8F] px-4 py-2 text-white hover:bg-[#e5327f] transition-colors"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-400">
                  대분류를 선택하고 + 버튼을 눌러 추가하세요
                </p>
              </div>
              </div>
            </div>
          ) : (
            /* 정산 정보 탭 */
            <div className="px-6 py-6 space-y-6">
              <div className="rounded-lg bg-blue-50 p-4">
                <Typography variant="body2" className="text-blue-700">
                  정산 정보는 수익금 지급을 위해 필요합니다. 정확하게 입력해주세요.
                </Typography>
              </div>

              {/* 실명 */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  실명 *
                </label>
                <input
                  type="text"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder="정산 받을 실명"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-[#FE3A8F] focus:outline-none focus:ring-1 focus:ring-[#FE3A8F]"
                />
              </div>

              {/* 이메일 */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  이메일 *
                </label>
                <input
                  type="email"
                  value={legalEmail}
                  onChange={(e) => setLegalEmail(e.target.value)}
                  placeholder="정산 안내 이메일"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-[#FE3A8F] focus:outline-none focus:ring-1 focus:ring-[#FE3A8F]"
                />
              </div>

              {/* 연락처 */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  연락처 *
                </label>
                <input
                  type="tel"
                  value={legalPhone}
                  onChange={(e) => setLegalPhone(e.target.value.replace(/[^\d-]/g, ''))}
                  placeholder="01012345678 (하이픈 없이)"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-[#FE3A8F] focus:outline-none focus:ring-1 focus:ring-[#FE3A8F]"
                />
              </div>

              {/* 은행 선택 */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  정산 은행 *
                </label>
                <select
                  value={payoutBankCode}
                  onChange={(e) => setPayoutBankCode(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-[#FE3A8F] focus:outline-none focus:ring-1 focus:ring-[#FE3A8F]"
                >
                  <option value="">은행을 선택하세요</option>
                  {BANK_CODES.map((bank) => (
                    <option key={bank.code} value={bank.code}>
                      {bank.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 계좌번호 */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  계좌번호 *
                </label>
                <input
                  type="text"
                  value={payoutAccountNumber}
                  onChange={(e) => setPayoutAccountNumber(e.target.value.replace(/\D/g, ''))}
                  placeholder="하이픈 없이 입력"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-[#FE3A8F] focus:outline-none focus:ring-1 focus:ring-[#FE3A8F]"
                />
              </div>

              {/* 예금주 */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  예금주 *
                </label>
                <input
                  type="text"
                  value={payoutAccountHolder}
                  onChange={(e) => setPayoutAccountHolder(e.target.value)}
                  placeholder="계좌 예금주명"
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-[#FE3A8F] focus:outline-none focus:ring-1 focus:ring-[#FE3A8F]"
                />
              </div>
            </div>
          )}
        </div>
    </SlideSheet>
  )
}

