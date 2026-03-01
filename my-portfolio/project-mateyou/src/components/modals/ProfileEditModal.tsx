import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import { X, Trash2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/sonner'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Pagination } from 'swiper/modules'
// @ts-ignore
import 'swiper/css'
// @ts-ignore
import 'swiper/css/pagination'
import {
  AvatarWithFallback,
  Button,
  GameBadges,
  Input,
  Modal,
  PartnerApplicationForm,
  Textarea,
  Typography,
} from '@/components'
import { useAuth } from '@/hooks/useAuth'
import { usePartnerData } from '@/hooks/usePartnerData'
import { edgeApi } from '@/lib/edgeApi'
import { mateYouApi } from '@/lib/apiClient'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CATEGORIES } from '@/constants/categories'

interface ProfileEditModalProps {
  isOpen: boolean
  onClose: () => void
  mode?: 'auto' | 'profile' | 'partner' | 'settlement'
}

type PartnerPreviewData = {
  partnerName: string
  partnerMessage: string
  profileImage?: string | null
  favoriteGame?: string
  gameInfos?: Array<{
    game: string
    tier: string
    description: string
  }>
  backgroundImages?: Array<{ id?: string; url: string }>
}

type PartnerProfileDefaults = {
  partnerName: string
  partnerMessage: string
  categoryId: string
  categoryDetailId: string
  profileImage: string | null
  backgroundUrls: string[]
}

export function ProfileEditModal({
  isOpen,
  onClose,
  mode = 'auto',
}: ProfileEditModalProps) {
  const { user, refreshUser } = useAuth()
  const queryClient = useQueryClient()
  const { partnerData, isLoading: partnerLoading, refetch: refetchPartnerData } = usePartnerData(
    user?.id || '',
  )
  const fileInputRef = useRef<HTMLInputElement>(null)
  const submitRef = useRef<(() => void) | null>(null)
  const partnerProfileImageInputRef = useRef<HTMLInputElement>(null)
  const partnerBackgroundInputRef = useRef<HTMLInputElement>(null)
  const partnerProfileImageObjectUrlRef = useRef<string | null>(null)
  const partnerBackgroundObjectUrlsRef = useRef<string[]>([])

  const [name, setName] = useState(user?.name || '')
  const [isUploading, setIsUploading] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isMounted, setIsMounted] = useState(isOpen)
  const [visible, setVisible] = useState(false)
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)
  const [partnerProfileForm, setPartnerProfileForm] = useState({
    partnerName: '',
    partnerMessage: '',
    categoryId: '',
    categoryDetailId: '',
  })
  // 복수 카테고리 선택을 위한 상태
  const [selectedCategories, setSelectedCategories] = useState<Array<{
    categoryId: number
    detailId: number | null
    categoryLabel: string
    detailLabel: string | null
  }>>([])
  const [isUpdatingFromSave, setIsUpdatingFromSave] = useState(false)
  const [partnerProfileImageFile, setPartnerProfileImageFile] = useState<File | null>(null)
  const [partnerProfileImagePreview, setPartnerProfileImagePreview] = useState<string | null>(null)
  const [partnerBackgroundFiles, setPartnerBackgroundFiles] = useState<File[]>([])
  const [partnerBackgroundPreviewUrls, setPartnerBackgroundPreviewUrls] = useState<string[]>([])
  const [isPartnerProfileSaving, setIsPartnerProfileSaving] = useState(false)
  const [backgroundUploadMode, setBackgroundUploadMode] = useState<'replace' | 'add'>('replace')

  const shouldShowPartnerForm =
    mode === 'partner' || mode === 'settlement' ? true : mode === 'profile' ? false : user?.role === 'partner'
  const isPartnerProfileEdit = !shouldShowPartnerForm && user?.role === 'partner'
  const isSettlementOnly = mode === 'settlement'

  const extractImageUrl = (value: unknown): string | null => {
    if (!value) return null
    if (typeof value === 'string') return value
    if (typeof value === 'object' && 'url' in (value as Record<string, unknown>)) {
      const maybeUrl = (value as { url?: string }).url
      return typeof maybeUrl === 'string' ? maybeUrl : null
    }
    return null
  }

  const resolveTextValue = (value: unknown): string =>
    typeof value === 'string' ? value : ''

  const resolveNumericInput = (value: unknown): string => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value)
    }
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed.length === 0) return ''
      return trimmed
    }
    return ''
  }

  const partnerInitialData = useMemo(() => {
    if (!shouldShowPartnerForm || !partnerData?.partner_data || !user) {
      return undefined
    }

    const partnerDetails = partnerData.partner_data as typeof partnerData.partner_data & {
      game_info?: unknown
      background_images?: unknown
    }

    const gameInfos = partnerDetails.game_info
      ? Array.isArray(partnerDetails.game_info)
        ? partnerDetails.game_info
        : [partnerDetails.game_info]
      : []

    const backgroundImages = partnerDetails.background_images
      ? Array.isArray(partnerDetails.background_images)
        ? partnerDetails.background_images
        : []
      : []

    return {
      partnerName: partnerDetails.partner_name || user.name || '',
      partnerMessage: partnerDetails.partner_message || '',
      profileImage: partnerData.profile_image || user.profile_image || '',
      favoriteGame: user.favorite_game || '',
      gameInfos,
      backgroundImages,
      legalName: partnerDetails.legal_name || user.name || '',
      legalEmail: partnerDetails.legal_email || user.email || '',
      legalPhone: partnerDetails.legal_phone || '',
      payoutBankCode: partnerDetails.payout_bank_code || '',
      payoutBankName: partnerDetails.payout_bank_name || '',
      payoutAccountNumber: partnerDetails.payout_account_number || '',
      payoutAccountHolder:
        partnerDetails.payout_account_holder || partnerDetails.legal_name || user.name || '',
      businessType:
        (partnerDetails.tosspayments_business_type as
          | 'INDIVIDUAL'
          | 'INDIVIDUAL_BUSINESS'
          | 'CORPORATE'
          | undefined) || 'INDIVIDUAL',
    }
  }, [partnerData, shouldShowPartnerForm, user])

  const partnerProfileDefaults = useMemo<PartnerProfileDefaults>(() => {
    if (!isPartnerProfileEdit || !user) {
      return {
      partnerName: resolveTextValue(user?.name),
      partnerMessage: '',
        categoryId: '',
        categoryDetailId: '',
      profileImage: extractImageUrl(user?.profile_image) || null,
        backgroundUrls: [] as string[],
      }
    }

    const partnerDetails = ((partnerData && partnerData.partner_data) ||
      {}) as (typeof partnerData extends { partner_data: infer T } ? T : Record<string, unknown>) & {
      category_id?: number | string | null
      detail_category_id?: number | string | null
      background_images?: Array<{ url?: string } | string>
      profile_image?: string | { url?: string }
    }

    const backgroundUrls = Array.isArray(partnerDetails.background_images)
      ? partnerDetails.background_images
          .map((image) => extractImageUrl(image))
          .filter((url): url is string => Boolean(url))
      : []

    return {
      partnerName:
        resolveTextValue(partnerDetails.partner_name) || resolveTextValue(user?.name) || '',
      partnerMessage: resolveTextValue(partnerDetails.partner_message),
      categoryId: resolveNumericInput(partnerDetails.category_id),
      categoryDetailId: resolveNumericInput(partnerDetails.detail_category_id),
      profileImage:
        extractImageUrl(partnerDetails.profile_image) ||
        extractImageUrl(partnerData?.profile_image) ||
        extractImageUrl(user.profile_image) ||
        null,
      backgroundUrls,
    }
  }, [
    isPartnerProfileEdit,
    partnerData?.partner_data,
    partnerData?.profile_image,
    user,
  ])

  const partnerProfileDefaultsKey = useMemo(
    () =>
      JSON.stringify({
        partnerName: partnerProfileDefaults.partnerName,
        partnerMessage: partnerProfileDefaults.partnerMessage,
        categoryId: partnerProfileDefaults.categoryId,
        categoryDetailId: partnerProfileDefaults.categoryDetailId,
        profileImage: partnerProfileDefaults.profileImage,
        backgroundUrls: partnerProfileDefaults.backgroundUrls,
      }),
    [partnerProfileDefaults],
  )

  const previewDefaults = useMemo(
    () =>
      ({
        partnerName: partnerInitialData?.partnerName || user?.name || '',
        partnerMessage: partnerInitialData?.partnerMessage || '',
        profileImage:
          partnerInitialData?.profileImage ||
          partnerData?.profile_image ||
          user?.profile_image ||
          null,
        favoriteGame: partnerInitialData?.favoriteGame || user?.favorite_game || '',
        gameInfos: partnerInitialData?.gameInfos || [],
        backgroundImages: partnerInitialData?.backgroundImages || [],
      }) satisfies PartnerPreviewData,
    [
      partnerInitialData?.partnerName,
      partnerInitialData?.partnerMessage,
      partnerInitialData?.profileImage,
      partnerInitialData?.favoriteGame,
      partnerInitialData?.gameInfos,
      partnerInitialData?.backgroundImages,
      partnerData?.profile_image,
      user?.name,
      user?.profile_image,
      user?.favorite_game,
    ],
  )

  const [partnerPreviewData, setPartnerPreviewData] =
    useState<PartnerPreviewData>(previewDefaults)

  useEffect(() => {
    if (!shouldShowPartnerForm) return
    setPartnerPreviewData((prev) =>
      arePreviewDataEqual(prev, previewDefaults) ? prev : previewDefaults,
    )
  }, [previewDefaults, shouldShowPartnerForm])

  useEffect(() => {
    if (!isPartnerProfileEdit || isUpdatingFromSave) return
    setPartnerProfileForm({
      partnerName: partnerProfileDefaults.partnerName,
      partnerMessage: partnerProfileDefaults.partnerMessage,
      categoryId: partnerProfileDefaults.categoryId,
      categoryDetailId: partnerProfileDefaults.categoryDetailId,
    })
    // 기존 카테고리 데이터로 selectedCategories 초기화
    if (partnerProfileDefaults.categoryId) {
      const categoryId = Number(partnerProfileDefaults.categoryId)
      const detailId = partnerProfileDefaults.categoryDetailId ? Number(partnerProfileDefaults.categoryDetailId) : null
      const category = CATEGORIES.find(c => c.apiId === categoryId)
      if (category) {
        const detail = detailId ? category.details.find(d => d.apiId === detailId) : null
        setSelectedCategories([{
          categoryId,
          detailId,
          categoryLabel: category.label,
          detailLabel: detail?.label || null,
        }])
      }
    } else {
      setSelectedCategories([])
    }
    setPartnerProfileImagePreview(partnerProfileDefaults.profileImage || null)
    setPartnerProfileImageFile(null)
    setPartnerBackgroundFiles([])
    setPartnerBackgroundPreviewUrls(partnerProfileDefaults.backgroundUrls)
    if (partnerProfileImageInputRef.current) {
      partnerProfileImageInputRef.current.value = ''
    }
    if (partnerBackgroundInputRef.current) {
      partnerBackgroundInputRef.current.value = ''
    }
  }, [isPartnerProfileEdit, partnerProfileDefaultsKey, isUpdatingFromSave])

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    if (isOpen) {
      setIsMounted(true)
      timeoutId = setTimeout(() => setVisible(true), 16)
      document.body.style.overflow = 'hidden'
      
      // 모달이 열릴 때 파트너 프로필 정보를 API에서 직접 가져옴
      if (isPartnerProfileEdit && user?.role === 'partner') {
        mateYouApi.partnerProfile.info().then((response) => {
          console.log('🏷️ [ProfileEditModal] API 응답:', response.data)

          if (response.data.success && response.data.data) {
            const responseData = response.data.data as {
              partner?: {
                partner_name?: string
                partner_message?: string
                category_id?: number | string | null
                detail_category_id?: number | string | null
                categories?: Array<{ category_id: number; detail_category_id: number | null }>
                background_images?: Array<string | { url?: string }>
                members?: {
                  profile_image?: string | null
                }
              }
              // categories가 partner 외부에 있을 수도 있음
              categories?: Array<{ category_id: number; detail_category_id: number | null }>
            }
            
            const partnerInfo = responseData.partner || {}
            
            // categories는 partner 내부 또는 외부에 있을 수 있음
            const categoriesData = partnerInfo.categories || responseData.categories || []
            
            console.log('🏷️ [ProfileEditModal] partnerInfo:', partnerInfo)
            console.log('🏷️ [ProfileEditModal] categoriesData:', categoriesData)
            
            setPartnerProfileForm({
              partnerName: resolveTextValue(partnerInfo.partner_name) || resolveTextValue(user?.name) || '',
              partnerMessage: resolveTextValue(partnerInfo.partner_message),
              categoryId: resolveNumericInput(partnerInfo.category_id),
              categoryDetailId: resolveNumericInput(partnerInfo.detail_category_id),
            })
            
            // categories 배열이 있으면 selectedCategories 상태 업데이트
            if (Array.isArray(categoriesData) && categoriesData.length > 0) {
              const loadedCategories = categoriesData
                .map(cat => {
                  const category = CATEGORIES.find(c => c.apiId === cat.category_id)
                  console.log('🏷️ [ProfileEditModal] 카테고리 매핑:', { cat, category })
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
                .filter((cat): cat is NonNullable<typeof cat> => cat !== null)
              console.log('🏷️ [ProfileEditModal] 최종 loadedCategories:', loadedCategories)
              setSelectedCategories(loadedCategories)
            } else {
              console.log('🏷️ [ProfileEditModal] categories가 비어있거나 없음')
              setSelectedCategories([])
            }
            
            const profileImageUrl = extractImageUrl(partnerInfo.members?.profile_image) || extractImageUrl(user?.profile_image)
            setPartnerProfileImagePreview(profileImageUrl || null)
            
            const backgroundUrls = Array.isArray(partnerInfo.background_images)
              ? partnerInfo.background_images
                  .map((image) => extractImageUrl(image))
                  .filter((url): url is string => Boolean(url))
              : []
            setPartnerBackgroundPreviewUrls(backgroundUrls)
          }
        }).catch((err) => {
          console.error('파트너 프로필 정보 조회 실패:', err)
        })
      }
    } else {
      setVisible(false)
      timeoutId = setTimeout(() => setIsMounted(false), 320)
      document.body.style.overflow = ''
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      document.body.style.overflow = ''
    }
  }, [isOpen, isPartnerProfileEdit, user?.role, user?.name, user?.profile_image])

  useEffect(() => {
    return () => {
      if (partnerProfileImageObjectUrlRef.current) {
        URL.revokeObjectURL(partnerProfileImageObjectUrlRef.current)
        partnerProfileImageObjectUrlRef.current = null
      }
      partnerBackgroundObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
      partnerBackgroundObjectUrlsRef.current = []
    }
  }, [])

  const handlePartnerSuccess = async () => {
    await refreshUser()
    refetchPartnerData()
    // 모든 관련 쿼리 무효화
    queryClient.invalidateQueries({ queryKey: ['members'] })
    queryClient.invalidateQueries({ queryKey: ['partner-details'] })
    queryClient.invalidateQueries({ queryKey: ['partner-details-by-id'] })
    queryClient.invalidateQueries({ queryKey: ['partner-details-by-member-code'] })
    queryClient.invalidateQueries({ queryKey: ['partner'] })
    queryClient.invalidateQueries({ queryKey: ['partners'] })
    forceClose()
  }

  const resetPartnerProfileState = () => {
    setPartnerProfileForm({
      partnerName: partnerProfileDefaults.partnerName,
      partnerMessage: partnerProfileDefaults.partnerMessage,
      categoryId: partnerProfileDefaults.categoryId,
      categoryDetailId: partnerProfileDefaults.categoryDetailId,
    })
    // 선택된 카테고리 초기화
    if (partnerProfileDefaults.categoryId) {
      const categoryId = Number(partnerProfileDefaults.categoryId)
      const detailId = partnerProfileDefaults.categoryDetailId ? Number(partnerProfileDefaults.categoryDetailId) : null
      const category = CATEGORIES.find(c => c.apiId === categoryId)
      if (category) {
        const detail = detailId ? category.details.find(d => d.apiId === detailId) : null
        setSelectedCategories([{
          categoryId,
          detailId,
          categoryLabel: category.label,
          detailLabel: detail?.label || null,
        }])
      } else {
        setSelectedCategories([])
      }
    } else {
      setSelectedCategories([])
    }
    setPartnerProfileImageFile(null)
    if (partnerProfileImageObjectUrlRef.current) {
      URL.revokeObjectURL(partnerProfileImageObjectUrlRef.current)
      partnerProfileImageObjectUrlRef.current = null
    }
    setPartnerProfileImagePreview(partnerProfileDefaults.profileImage || null)
    partnerBackgroundObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    partnerBackgroundObjectUrlsRef.current = []
    setPartnerBackgroundFiles([])
    setPartnerBackgroundPreviewUrls(partnerProfileDefaults.backgroundUrls)
    if (partnerProfileImageInputRef.current) {
      partnerProfileImageInputRef.current.value = ''
    }
    if (partnerBackgroundInputRef.current) {
      partnerBackgroundInputRef.current.value = ''
    }
  }

  const handlePartnerProfileFieldChange = (
    field: keyof typeof partnerProfileForm,
    value: string,
  ) => {
    setPartnerProfileForm((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const handlePartnerProfileImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (file.size > 5 * 1024 * 1024) {
      toast.error('파일 크기는 5MB 이하여야 합니다')
      return
    }

    if (!file.type.startsWith('image/')) {
      toast.error('이미지 파일만 업로드 가능합니다')
      return
    }

    if (partnerProfileImageObjectUrlRef.current) {
      URL.revokeObjectURL(partnerProfileImageObjectUrlRef.current)
      partnerProfileImageObjectUrlRef.current = null
    }

    const objectUrl = URL.createObjectURL(file)
    partnerProfileImageObjectUrlRef.current = objectUrl
    setPartnerProfileImageFile(file)
    setPartnerProfileImagePreview(objectUrl)
  }

  const handleRemovePartnerProfileImage = () => {
    if (isPartnerProfileSaving) return
    if (partnerProfileImageObjectUrlRef.current) {
      URL.revokeObjectURL(partnerProfileImageObjectUrlRef.current)
      partnerProfileImageObjectUrlRef.current = null
    }
    setPartnerProfileImageFile(null)
    setPartnerProfileImagePreview(null)
    if (partnerProfileImageInputRef.current) {
      partnerProfileImageInputRef.current.value = ''
    }
  }

  const handlePartnerBackgroundChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newFiles = event.target.files ? Array.from(event.target.files) : []
    if (newFiles.length === 0) return

    const newObjectUrls: string[] = []
    const validFiles: File[] = []
    
    newFiles.forEach((file) => {
      if (!file.type.startsWith('image/')) {
        return
      }
      const url = URL.createObjectURL(file)
      newObjectUrls.push(url)
      validFiles.push(file)
    })

    if (backgroundUploadMode === 'replace') {
      // 교체 모드: 기존 이미지 모두 삭제하고 새 이미지로 대체
      partnerBackgroundObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
      partnerBackgroundObjectUrlsRef.current = newObjectUrls
      setPartnerBackgroundFiles(validFiles)
      setPartnerBackgroundPreviewUrls(
        newObjectUrls.length > 0 ? newObjectUrls : partnerProfileDefaults.backgroundUrls,
      )
    } else {
      // 추가 모드: 기존 이미지에 새 이미지 추가
      partnerBackgroundObjectUrlsRef.current = [...partnerBackgroundObjectUrlsRef.current, ...newObjectUrls]
      setPartnerBackgroundFiles((prev) => [...prev, ...validFiles])
      setPartnerBackgroundPreviewUrls((prev) => [...prev, ...newObjectUrls])
    }
    
    // input 값 초기화 (같은 파일 다시 선택 가능하도록)
    event.target.value = ''
  }

  const handleClearPartnerBackgroundSelection = () => {
    if (isPartnerProfileSaving) return
    partnerBackgroundObjectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url))
    partnerBackgroundObjectUrlsRef.current = []
    setPartnerBackgroundFiles([])
    setPartnerBackgroundPreviewUrls([])
    if (partnerBackgroundInputRef.current) {
      partnerBackgroundInputRef.current.value = ''
    }
  }

  // 개별 배경 이미지 삭제
  const handleRemoveBackgroundImage = (indexToRemove: number) => {
    if (isPartnerProfileSaving) return
    
    // blob URL이면 revoke
    const urlToRemove = partnerBackgroundPreviewUrls[indexToRemove]
    if (urlToRemove?.startsWith('blob:')) {
      URL.revokeObjectURL(urlToRemove)
      // ref에서도 제거
      const refIndex = partnerBackgroundObjectUrlsRef.current.indexOf(urlToRemove)
      if (refIndex > -1) {
        partnerBackgroundObjectUrlsRef.current.splice(refIndex, 1)
      }
    }
    
    // 프리뷰 URL 배열에서 제거
    setPartnerBackgroundPreviewUrls((prev) => prev.filter((_, idx) => idx !== indexToRemove))
    
    // 파일 배열에서도 제거 (blob URL인 경우에만)
    if (urlToRemove?.startsWith('blob:')) {
      setPartnerBackgroundFiles((prev) => prev.filter((_, idx) => idx !== indexToRemove))
    }
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

    // blob URL인 경우
    if (url.startsWith('blob:')) {
      const response = await fetch(url)
      const blob = await response.blob()
      let mimeType = blob.type
      if (!mimeType || !mimeType.startsWith('image/')) {
        mimeType = 'image/jpeg'
      }
      const ext = Object.entries(mimeTypes).find(([, v]) => v === mimeType)?.[0] || 'jpg'
      const finalFilename = `${filename.split('.')[0]}.${ext}`
      return new File([blob], finalFilename, { type: mimeType })
    }

    // HTTP/HTTPS URL인 경우
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`)
    }
    const blob = await response.blob()
    
    // 우선순위: 1. blob.type 2. URL 확장자 3. 기본값 jpeg
    let mimeType = blob.type
    if (!mimeType || !mimeType.startsWith('image/')) {
      const urlExt = getExtFromUrl(url)
      mimeType = mimeTypes[urlExt] || 'image/jpeg'
    }
    
    // 파일명에 올바른 확장자 적용
    const ext = Object.entries(mimeTypes).find(([, v]) => v === mimeType)?.[0] || 'jpg'
    const finalFilename = `${filename.split('.')[0]}.${ext}`
    
    console.log(`📸 urlToFile: ${url.substring(0, 50)}... → ${finalFilename} (${mimeType}, ${blob.size} bytes)`)
    
    return new File([blob], finalFilename, { type: mimeType })
  }

  const handlePartnerProfileSave = async () => {
    if (!partnerProfileForm.partnerName.trim()) {
      toast.error('파트너 이름을 입력해주세요.')
      return
    }

    try {
      setIsPartnerProfileSaving(true)

      console.log('💾 저장 시작 - 현재 상태:', {
        partnerProfileImageFile: !!partnerProfileImageFile,
        partnerProfileImagePreview,
        partnerBackgroundFiles: partnerBackgroundFiles.length,
        partnerBackgroundPreviewUrls,
      })

      // ========== 프로필 이미지 처리 ==========
      // 결과: 새 파일 업로드 URL / 기존 URL / null(삭제)
      let profileImageUrl: string | null = null
      
      if (partnerProfileImageFile) {
        // 새 파일이 있으면 업로드
        try {
          console.log('📸 Uploading profile image:', partnerProfileImageFile.name)
          const uploadResponse = await mateYouApi.storage.upload(
            partnerProfileImageFile,
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
      } else if (partnerProfileImagePreview && !partnerProfileImagePreview.startsWith('blob:')) {
        // 기존 URL 유지
        profileImageUrl = partnerProfileImagePreview
        console.log('📸 Profile image keeping:', profileImageUrl)
      } else {
        // 프리뷰가 없으면 삭제 (null)
        profileImageUrl = null
        console.log('📸 Profile image will be NULL (deleted)')
      }

      // ========== 배경 이미지 처리 ==========
      // 결과: 현재 프리뷰에 보이는 이미지들만 전송 (새 파일 업로드 + 기존 URL)
      const finalBackgroundUrls: string[] = []
      
      // 1. 새 파일들 업로드
      if (partnerBackgroundFiles.length > 0) {
        console.log('📸 Uploading background files:', partnerBackgroundFiles.length)
        for (let i = 0; i < partnerBackgroundFiles.length; i++) {
          const file = partnerBackgroundFiles[i]
          try {
            const uploadResponse = await mateYouApi.storage.upload(
              file,
              'profile-images',
              `partners/${user?.id}/background-${Date.now()}-${i}.jpg`
            )
            if (uploadResponse.data.success && uploadResponse.data.data?.url) {
              finalBackgroundUrls.push(uploadResponse.data.data.url)
              console.log(`  - Uploaded:`, uploadResponse.data.data.url)
            }
          } catch (err) {
            console.error(`배경 이미지 ${i} 업로드 실패:`, err)
          }
        }
      }
      
      // 2. 현재 프리뷰에 있는 기존 URL들 추가 (blob 제외)
      for (const url of partnerBackgroundPreviewUrls) {
        if (url && !url.startsWith('blob:')) {
          finalBackgroundUrls.push(url)
          console.log('  - Keeping existing:', url)
        }
      }
      
      console.log('📸 Final background images:', finalBackgroundUrls)

      // 카테고리 배열을 API 형식으로 변환
      const categoriesForApi = selectedCategories.map(cat => ({
        category_id: cat.categoryId,
        detail_category_id: cat.detailId,
      }))

      // JSON body 구성 - 프로필/배경 이미지 항상 전송
      const requestData = {
        partnerName: partnerProfileForm.partnerName.trim(),
        partnerMessage: partnerProfileForm.partnerMessage.trim(),
        categories: categoriesForApi,
        profileImage: profileImageUrl, // null이면 삭제, string이면 업데이트
        backgroundImages: finalBackgroundUrls, // 빈 배열이면 전체 삭제
      }
      
      console.log('🔥🔥🔥 API 요청 데이터 🔥🔥🔥')
      console.log('profileImage:', profileImageUrl)
      console.log('backgroundImages:', finalBackgroundUrls)
      console.log('backgroundImages 길이:', finalBackgroundUrls.length)
      console.log('전체 requestData:', JSON.stringify(requestData, null, 2))

      // PUT 요청 완료 대기
      const updateResponse = await mateYouApi.partnerProfile.update(requestData)
      if (!updateResponse.data.success) {
        throw new Error(updateResponse.data.error?.message || '프로필 업데이트에 실패했습니다.')
      }

      // 서버 처리 완료를 위해 약간의 지연 (이미지 업로드 등이 완료될 시간)
      await new Promise((resolve) => setTimeout(resolve, 500))

      // 저장 후 상태 업데이트 플래그 설정 (useEffect가 덮어쓰지 않도록)
      setIsUpdatingFromSave(true)

      // 저장 후 최신 정보 가져오기 (PUT 완료 후 GET 실행)
      const infoResponse = await mateYouApi.partnerProfile.info()
      if (infoResponse.data.success && infoResponse.data.data) {
        // API 응답 구조: { partner: {..., members: {...}}, message: "..." }
        const responseData = infoResponse.data.data as {
          partner?: {
            partner_name?: string
            partner_message?: string
            category_id?: number | string | null
            detail_category_id?: number | string | null
            categories?: Array<{ category_id: number; detail_category_id: number | null }>
            background_images?: Array<string | { url?: string }>
            members?: {
              profile_image?: string | null
            }
          }
        }
        
        const partnerInfo = responseData.partner || {}
        
        // 상태 업데이트 (snake_case -> camelCase 변환)
        setPartnerProfileForm({
          partnerName: resolveTextValue(partnerInfo.partner_name) || '',
          partnerMessage: resolveTextValue(partnerInfo.partner_message),
          categoryId: resolveNumericInput(partnerInfo.category_id),
          categoryDetailId: resolveNumericInput(partnerInfo.detail_category_id),
        })
        
        // categories 배열이 있으면 selectedCategories 상태 업데이트
        if (Array.isArray(partnerInfo.categories) && partnerInfo.categories.length > 0) {
          const loadedCategories = partnerInfo.categories
            .map(cat => {
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
            .filter((cat): cat is NonNullable<typeof cat> => cat !== null)
          setSelectedCategories(loadedCategories)
        }
        
        // 프로필 이미지는 members.profile_image에서 가져옴
        const profileImageUrl = extractImageUrl(partnerInfo.members?.profile_image)
        setPartnerProfileImagePreview(profileImageUrl || null)
        
        const backgroundUrls = Array.isArray(partnerInfo.background_images)
          ? partnerInfo.background_images
              .map((image) => extractImageUrl(image))
              .filter((url): url is string => Boolean(url))
          : []
        setPartnerBackgroundPreviewUrls(backgroundUrls)
        
        // 파일 입력 초기화
        setPartnerProfileImageFile(null)
        setPartnerBackgroundFiles([])
        if (partnerProfileImageInputRef.current) {
          partnerProfileImageInputRef.current.value = ''
        }
        if (partnerBackgroundInputRef.current) {
          partnerBackgroundInputRef.current.value = ''
        }
      }
      
      // 파트너 데이터 다시 가져오기 (다른 곳에서 사용할 수 있도록)
      await refetchPartnerData()
      
      // 모든 관련 쿼리 무효화하여 즉시 업데이트
      queryClient.invalidateQueries({ queryKey: ['partner-details-by-id'] })
      queryClient.invalidateQueries({ queryKey: ['partner-details-by-member-code'] })
      queryClient.invalidateQueries({ queryKey: ['partner-details'] })
      queryClient.invalidateQueries({ queryKey: ['partners'] })
      queryClient.invalidateQueries({ queryKey: ['partner'] })
      queryClient.invalidateQueries({ queryKey: ['members'] })
      
      // 상태 업데이트 완료 후 플래그 해제 (충분한 시간 후)
      setTimeout(() => {
        setIsUpdatingFromSave(false)
      }, 300)
      
      toast.success('프로필이 업데이트되었습니다.')
      await refreshUser()
      forceClose()
    } catch (error) {
      console.error('파트너 프로필 업데이트 실패:', error)
      toast.error(error instanceof Error ? error.message : '프로필 업데이트에 실패했습니다.')
    } finally {
      setIsPartnerProfileSaving(false)
    }
  }

  const handlePartnerFormChange = (payload: PartnerPreviewData) => {
    setPartnerPreviewData((prev) => ({
      partnerName: payload.partnerName || prev.partnerName,
      partnerMessage: payload.partnerMessage ?? prev.partnerMessage,
      profileImage: payload.profileImage ?? prev.profileImage,
      favoriteGame: payload.favoriteGame ?? prev.favoriteGame,
      gameInfos: payload.gameInfos ?? prev.gameInfos,
      backgroundImages: payload.backgroundImages ?? prev.backgroundImages,
    }))
  }

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // 파일 크기 체크 (5MB 제한)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('파일 크기는 5MB 이하여야 합니다')
      return
    }

    // 파일 타입 체크
    if (!file.type.startsWith('image/')) {
      toast.error('이미지 파일만 업로드 가능합니다')
      return
    }

    setSelectedFile(file)

    // 미리보기 생성
    const reader = new FileReader()
    reader.onload = (e) => {
      setPreviewImage(e.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  const uploadProfileImage = async (file: File): Promise<string> => {
    if (!user) throw new Error('사용자 정보가 없습니다')

    const fileExt = file.name.split('.').pop()
    const fileName = `${user.id}-${Date.now()}.${fileExt}`

    // Edge Function을 통해 profile-images 버킷에 업로드
    const response = await edgeApi.storage.upload(file, 'profile-images', fileName, false)

    if (!response.success) {
      console.error('이미지 업로드 에러:', response.error)
      throw new Error(response.error?.message || '업로드에 실패했습니다')
    }

    const uploadedUrl = (response.data as { url?: string } | undefined)?.url
    if (!uploadedUrl) {
      throw new Error('이미지 URL을 받을 수 없습니다.')
    }
    return uploadedUrl
  }

  const handleSave = async () => {
    if (!user) return

    try {
      setIsUpdating(true)

      let profileImageUrl: string | undefined = user.profile_image || undefined

      // 새 이미지가 선택된 경우 업로드
      if (selectedFile) {
        setIsUploading(true)
        profileImageUrl = await uploadProfileImage(selectedFile)
        setIsUploading(false)
      }

      // Edge Function을 통해 사용자 정보 업데이트
      const response = await edgeApi.auth.updateProfile({
        name: name.trim() || undefined,
        profile_image: profileImageUrl,
      })

      if (!response.success) {
        throw new Error(response.error?.message || '프로필 업데이트에 실패했습니다')
      }

      // 사용자 데이터 새로고침 및 캐시 무효화
      await refreshUser()
      queryClient.invalidateQueries({ queryKey: ['user'] })
      queryClient.invalidateQueries({ queryKey: ['members'] })

      toast.success('프로필이 성공적으로 업데이트되었습니다')
      handleClose()
    } catch (error) {
      console.error('프로필 업데이트 에러:', error)
      toast.error('프로필 업데이트에 실패했습니다')
    } finally {
      setIsUploading(false)
      setIsUpdating(false)
    }
  }

  const handleCloseInternal = (force = false) => {
    if (shouldShowPartnerForm) {
      if (!force && (isUpdating || isUploading)) return
    } else if (isPartnerProfileEdit) {
      if (!force && isPartnerProfileSaving) return
      resetPartnerProfileState()
    } else {
      if (!force && (isUpdating || isUploading)) return
    setName(user?.name || '')
    setPreviewImage(null)
    setSelectedFile(null)
    }
    setIsPreviewModalOpen(false)
    onClose()
  }

  const handleClose = () => handleCloseInternal(false)
  const forceClose = () => handleCloseInternal(true)

  const handlePartnerSubmit = () => {
    if (submitRef.current) {
      submitRef.current()
    }
  }

  if (!user || !isMounted) {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-[120]">
      <div
        className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${
          visible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleClose}
        aria-hidden="true"
      />
      <div
        className={`absolute inset-x-0 bottom-0 flex flex-col rounded-t-[32px] bg-white shadow-2xl transition-transform duration-400 ease-out ${
          visible ? 'translate-y-0' : 'translate-y-full'
        }`}
        style={{
          height: 'calc(100% - env(safe-area-inset-top, 0px))',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* 고정 헤더 */}
        <header className="flex-shrink-0 relative px-6 py-4">
          <button
            className="absolute left-6 top-1/2 -translate-y-1/2 rounded-full p-2 text-gray-500 transition hover:bg-gray-100"
            onClick={handleClose}
            aria-label="닫기"
            disabled={
              shouldShowPartnerForm
                ? isUpdating || isUploading
                : isPartnerProfileEdit
                  ? isPartnerProfileSaving
                  : isUpdating || isUploading
            }
          >
            <X className="h-5 w-5" />
          </button>
          <Typography variant="h5" className="text-center text-lg font-semibold text-[#110f1a]">
            프로필 관리
          </Typography>
        </header>

        {/* 스크롤 가능한 컨텐츠 영역 */}
        <div className="flex-1 overflow-y-auto pt-6 pb-6">
          {shouldShowPartnerForm ? (
            partnerLoading && !partnerData?.partner_data ? (
              <div className="py-20 text-center text-sm text-gray-500">
                파트너 정보를 불러오는 중입니다...
              </div>
            ) : partnerData?.partner_data ? (
              <div className="mx-auto w-full max-w-5xl space-y-6">
                <PartnerApplicationForm
                  key={partnerData.partner_data.id}
                  initialData={partnerInitialData}
                  mode="edit"
                  memberId={user?.id}
                  onSuccess={handlePartnerSuccess}
                  onCancel={handleClose}
                  onShowToast={(message, type) => toast[type](message)}
                  showButtons={false}
                  isSettlementOnly={isSettlementOnly}
                  onSubmitRef={submitRef}
                />
              </div>
            ) : (
              <div className="py-20 text-center text-sm text-gray-500">
                파트너 정보를 찾을 수 없습니다. 파트너 신청 후 다시 시도해주세요.
              </div>
            )
          ) : isPartnerProfileEdit ? (
            <div className="space-y-6">
              {/* 배경 이미지 + 프로필 이미지 (실제 피드처럼) */}
              <section className="relative">
                {/* 배경 이미지 슬라이드 */}
                <div className="relative h-40 w-full overflow-hidden">
                  {partnerBackgroundPreviewUrls.length > 0 ? (
                    partnerBackgroundPreviewUrls.length === 1 ? (
                      <div className="relative h-full w-full">
                        <img
                          src={partnerBackgroundPreviewUrls[0]}
                          alt="배경 이미지"
                          className="h-full w-full object-cover"
                        />
                        {/* 개별 삭제 버튼 */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleRemoveBackgroundImage(0)
                          }}
                          disabled={isPartnerProfileSaving}
                          className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white p-1.5 rounded-full transition z-10"
                          title="이 이미지 삭제"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <Swiper
                        modules={[Pagination]}
                        pagination={{ clickable: true }}
                        loop={false}
                        className="h-full w-full profile-edit-swiper"
                      >
                        {partnerBackgroundPreviewUrls.map((url, idx) => (
                          <SwiperSlide key={idx}>
                            <div className="relative h-full w-full">
                              <img
                                src={url}
                                alt={`배경 이미지 ${idx + 1}`}
                                className="h-full w-full object-cover"
                              />
                              {/* 개별 삭제 버튼 */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleRemoveBackgroundImage(idx)
                                }}
                                disabled={isPartnerProfileSaving}
                                className="absolute top-2 right-2 bg-black/60 hover:bg-black/80 text-white p-1.5 rounded-full transition z-10"
                                title="이 이미지 삭제"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </SwiperSlide>
                        ))}
                      </Swiper>
                    )
                  ) : (
                    <div className="h-full w-full bg-gray-200" />
                  )}
                  <style>{`
                    .profile-edit-swiper .swiper-pagination {
                      top: 4px !important;
                      bottom: auto !important;
                    }
                    .profile-edit-swiper .swiper-pagination-bullet {
                      width: 6px;
                      height: 6px;
                      background: rgba(255, 255, 255, 0.5);
                      opacity: 1;
                    }
                    .profile-edit-swiper .swiper-pagination-bullet-active {
                      background: white;
                      width: 8px;
                      height: 8px;
                    }
                  `}</style>
                  {/* 하단 버튼들 */}
                  <div className="absolute bottom-2 left-2 right-2 flex items-center z-20 pointer-events-none">
                    {partnerBackgroundPreviewUrls.length > 0 ? (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                            setBackgroundUploadMode('replace')
                            partnerBackgroundInputRef.current?.click()
                          }}
                          disabled={isPartnerProfileSaving}
                          className="bg-black/60 hover:bg-black/80 text-white text-xs px-3 py-1.5 rounded-full transition cursor-pointer pointer-events-auto"
                        >
                          교체
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            e.preventDefault()
                            setBackgroundUploadMode('add')
                            partnerBackgroundInputRef.current?.click()
                          }}
                          disabled={isPartnerProfileSaving}
                          className="bg-black/60 hover:bg-black/80 text-white text-xs px-3 py-1.5 rounded-full transition cursor-pointer pointer-events-auto ml-1.5"
                        >
                          추가
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          e.preventDefault()
                          setBackgroundUploadMode('add')
                          partnerBackgroundInputRef.current?.click()
                        }}
                        disabled={isPartnerProfileSaving}
                        className="bg-black/60 hover:bg-black/80 text-white text-xs px-3 py-1.5 rounded-full transition cursor-pointer pointer-events-auto"
                      >
                        추가
                      </button>
                    )}
                  </div>
                </div>
                <input
                  ref={partnerBackgroundInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePartnerBackgroundChange}
                  className="hidden"
                />
                
                {/* 프로필 이미지 (배경 위에 겹침) - z-index 추가 */}
                <div className="-mt-14 flex flex-col items-center relative z-10">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => partnerProfileImageInputRef.current?.click()}
                      disabled={isPartnerProfileSaving}
                      className="rounded-full border-4 border-white focus:outline-none group relative"
                    >
                      {partnerProfileImagePreview ? (
                        <img
                          src={partnerProfileImagePreview}
                          alt="프로필"
                          className="h-24 w-24 rounded-full object-cover"
                        />
                      ) : (
                        <div className="h-24 w-24 rounded-full bg-white" />
                      )}
                      {/* 프로필 이미지가 있을 때: 호버 오버레이 */}
                      {partnerProfileImagePreview && (
                        <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        </div>
                      )}
                      {/* 프로필 이미지가 없을 때: 중앙 카메라 아이콘 */}
                      {!partnerProfileImagePreview && (
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
                    {partnerProfileImagePreview && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRemovePartnerProfileImage()
                        }}
                        disabled={isPartnerProfileSaving}
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
                  ref={partnerProfileImageInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePartnerProfileImageChange}
                  className="hidden"
                />
                
              </section>

              <section className="space-y-4 px-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">파트너 이름 *</label>
                  <Input
                    value={partnerProfileForm.partnerName}
                    onChange={(e) => handlePartnerProfileFieldChange('partnerName', e.target.value)}
                    placeholder="예: 핑크메이트"
                    disabled={isPartnerProfileSaving}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">소개</label>
                  <Textarea
                    value={partnerProfileForm.partnerMessage}
                    onChange={(e) => handlePartnerProfileFieldChange('partnerMessage', e.target.value)}
                    rows={4}
                    placeholder="파트너 소개나 인사말을 입력해주세요."
                    disabled={isPartnerProfileSaving}
                  />
                </div>
              </section>
              <section className="px-4">
                <Typography variant="subtitle1" className="text-base font-semibold text-[#110f1a]">
                  전문 분야
                </Typography>
                
                {/* 선택된 카테고리 뱃지 표시 */}
                <div className="mt-3 min-h-[44px] rounded-lg border border-gray-200 bg-gray-50 p-2">
                  {selectedCategories.length === 0 ? (
                    <p className="text-sm text-gray-400 py-1 px-1">카테고리를 선택해주세요</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {selectedCategories.map((cat, index) => (
                        <span
                          key={`${cat.categoryId}-${cat.detailId}-${index}`}
                          className="inline-flex items-center gap-1 rounded-full bg-[#FE3A8F]/10 px-3 py-1 text-sm font-medium text-[#FE3A8F]"
                        >
                          {cat.categoryLabel}
                          {cat.detailLabel && ` > ${cat.detailLabel}`}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCategories(prev => prev.filter((_, i) => i !== index))
                            }}
                            className="ml-1 rounded-full p-0.5 hover:bg-[#FE3A8F]/20 transition-colors"
                            disabled={isPartnerProfileSaving}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* 카테고리 선택 드롭다운 */}
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      카테고리 (대분류)
                    </label>
                    <Select
                      value={partnerProfileForm.categoryId || undefined}
                      onValueChange={(value: string) => {
                        handlePartnerProfileFieldChange('categoryId', value)
                        handlePartnerProfileFieldChange('categoryDetailId', '')
                        
                        // 소분류가 없는 카테고리는 바로 추가
                        const category = CATEGORIES.find(c => String(c.apiId) === value)
                        if (category && category.details.length === 0) {
                          const isDuplicate = selectedCategories.some(
                            cat => cat.categoryId === category.apiId && cat.detailId === null
                          )
                          if (!isDuplicate) {
                            setSelectedCategories(prev => [...prev, {
                              categoryId: category.apiId,
                              detailId: null,
                              categoryLabel: category.label,
                              detailLabel: null,
                            }])
                          }
                          // 드롭다운 초기화
                          handlePartnerProfileFieldChange('categoryId', '')
                        }
                      }}
                      disabled={isPartnerProfileSaving}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="카테고리를 선택하세요" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {CATEGORIES.map((category) => (
                            <SelectItem key={category.apiId} value={String(category.apiId)}>
                              {category.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                  {/* 소분류는 해당 대분류에 details가 있을 때만 표시 (현재 메이트만) */}
                  {(() => {
                    const selected = CATEGORIES.find(
                      (category) => String(category.apiId) === partnerProfileForm.categoryId,
                    )
                    if (!selected || selected.details.length === 0) {
                      return null
                    }
                    return (
                      <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">
                          카테고리 (소분류)
                        </label>
                        <Select
                          key={`detail-select-${partnerProfileForm.categoryId}`}
                          value={partnerProfileForm.categoryDetailId || undefined}
                          onValueChange={(value: string) => {
                            const detail = selected.details.find(d => String(d.apiId) === value)
                            if (detail) {
                              // 중복 체크
                              const isDuplicate = selectedCategories.some(
                                cat => cat.categoryId === selected.apiId && cat.detailId === detail.apiId
                              )
                              if (!isDuplicate) {
                                setSelectedCategories(prev => [...prev, {
                                  categoryId: selected.apiId,
                                  detailId: detail.apiId,
                                  categoryLabel: selected.label,
                                  detailLabel: detail.label,
                                }])
                              }
                              // 소분류만 초기화 (대분류는 유지하여 연속 선택 가능)
                              handlePartnerProfileFieldChange('categoryDetailId', '')
                            }
                          }}
                          disabled={isPartnerProfileSaving}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="소분류를 선택하세요" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {selected.details.map((detail) => (
                                <SelectItem key={detail.apiId} value={String(detail.apiId)}>
                                  {detail.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                      </div>
                    )
                  })()}
                </div>
              </section>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="text-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="relative inline-block">
                    <AvatarWithFallback
                      src={previewImage || user?.profile_image || undefined}
                      name={user?.name || user?.username}
                      size="xl"
                      className="h-24 w-24 border-4 border-white shadow-lg"
                    />
                    {(previewImage || user?.profile_image) && (
                      <button
                        type="button"
                        onClick={() => {
                          if (isUploading || isUpdating) return
                          setPreviewImage(null)
                          setSelectedFile(null)
                        }}
                        disabled={isUploading || isUpdating}
                        className="absolute right-0 top-0 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white shadow-lg transition hover:bg-black"
                        aria-label="이미지 제거"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading || isUpdating}
                      className="rounded-full border-[#FE3A8F] px-5 text-[#FE3A8F] hover:bg-[#FE3A8F]/10"
                    >
                      {isUploading ? '업로드 중...' : '이미지 변경'}
                    </Button>
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                <Typography variant="caption" color="text-secondary" className="mt-2">
                  5MB 이하의 이미지 파일만 업로드 가능합니다
                </Typography>
              </div>

              <div>
                <Typography variant="h6" className="mb-2">
                  이름
                </Typography>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="이름을 입력하세요"
                  disabled={isUpdating}
                  maxLength={50}
                />
                <Typography variant="caption" color="text-secondary" className="mt-1">
                  {name.length}/50
                </Typography>
              </div>

              <div className="rounded-lg bg-gray-50 p-4">
                <Typography variant="body2" className="mb-2 font-medium">
                  현재 정보
                </Typography>
                <div className="space-y-1 text-sm text-gray-600">
                  <div className="flex justify-between">
                    <span>가입일:</span>
                    <span>
                      {user?.created_at
                        ? new Date(user.created_at).toLocaleDateString('ko-KR')
                        : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>포인트:</span>
                    <span>{user?.total_points?.toLocaleString() || '0'}P</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 고정 버튼 영역 */}
        <div className="flex-shrink-0 bg-white px-6 py-4">
          {shouldShowPartnerForm ? (
            <div className="flex gap-3 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                className="w-full border-[#FE3A8F] text-[#FE3A8F] hover:bg-[#FE3A8F]/10 sm:flex-1"
              >
                취소
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handlePartnerSubmit}
                className="w-full bg-[#FE3A8F] text-white hover:bg-[#FE3A8F] sm:flex-1"
              >
                수정하기
              </Button>
            </div>
          ) : isPartnerProfileEdit ? (
            <div className="flex gap-3 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isPartnerProfileSaving}
                className="w-full border-[#FE3A8F] text-[#FE3A8F] hover:bg-[#FE3A8F]/10 sm:flex-1"
              >
                취소
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handlePartnerProfileSave}
                disabled={isPartnerProfileSaving}
                loading={isPartnerProfileSaving}
                className="w-full bg-[#FE3A8F] text-white hover:bg-[#FE3A8F] sm:flex-1"
              >
                저장
              </Button>
            </div>
          ) : (
            <div className="flex gap-3 sm:flex-row">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={isUpdating || isUploading}
                className="w-full border-[#FE3A8F] text-[#FE3A8F] hover:bg-[#FE3A8F]/10 sm:flex-1"
              >
                취소
              </Button>
              <Button
                onClick={handleSave}
                disabled={isUpdating || isUploading}
                loading={isUpdating}
                variant="primary"
                className="w-full bg-[#FE3A8F] text-white hover:bg-[#fe4a9a] sm:flex-1"
              >
                저장
              </Button>
            </div>
          )}
        </div>
      </div>

      {shouldShowPartnerForm && (
        <PartnerPreviewModal
          isOpen={isPreviewModalOpen}
          onClose={() => setIsPreviewModalOpen(false)}
          data={partnerPreviewData}
          memberCode={
            (partnerData?.partner_data as { member_code?: string } | undefined)?.member_code ||
            user?.member_code ||
            user?.username
          }
          followerCount={
            (partnerData?.partner_data as { follow_count?: number } | undefined)?.follow_count
          }
          totalPosts={
            (partnerData?.partner_data as { post_count?: number } | undefined)?.post_count
          }
        />
      )}
    </div>,
    document.body,
  )
}

interface PartnerPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  data: PartnerPreviewData
  memberCode?: string | null
  followerCount?: number
  totalPosts?: number
}

function PartnerPreviewModal({
  isOpen,
  onClose,
  data,
  memberCode,
  followerCount = 0,
  totalPosts = 0,
}: PartnerPreviewModalProps) {
  const resolveImageUrl = (value?: { url?: string } | string | null) => {
    if (!value) return null
    if (typeof value === 'string') return value
    return value.url || null
  }

  const heroImage = resolveImageUrl(data.backgroundImages?.[0] || null)
  const safeMemberCode = memberCode || 'partner'

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="프로필 미리보기"
      size="xl"
    >
      <div className="space-y-4">
        {/* Hero Image Section - 실제 파트너 페이지와 동일 */}
        <div className="relative h-56 w-full overflow-hidden rounded-2xl">
          {heroImage ? (
            <img
              src={heroImage}
              alt="배경 이미지"
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
              crossOrigin="anonymous"
            />
          ) : (
            <div className="h-full w-full bg-gray-200" />
          )}
        </div>

        {/* Profile Section - 실제 파트너 페이지와 동일한 레이아웃 */}
        <div className="-mt-12 flex w-full flex-col gap-6 px-4">
          <section>
            <div className="flex justify-between gap-4">
              <div className="w-full flex flex-col items-center gap-4">
                {/* Avatar */}
                <div className="relative">
                  <div className="rounded-full border-4 border-white">
                    <AvatarWithFallback
                      src={data.profileImage || undefined}
                      name={data.partnerName}
                      size="xl"
                      className="h-20 w-20"
                    />
                  </div>
                </div>

                {/* Name and Message */}
                <div className="w-full flex flex-col items-start">
                  <Typography variant="h3" className="text-xl font-bold text-[#110f1a] mb-1">
                    {data.partnerName || '파트너 이름'}
                  </Typography>
                  <p className="text-xs text-gray-400 mb-4">@{safeMemberCode}</p>
                  {data.partnerMessage?.trim() && (
                    <p className="mt-2 text-sm text-gray-600">{data.partnerMessage}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Stats - 실제 파트너 페이지와 동일 */}
            <div className="mt-6 flex flex-wrap gap-6 text-sm text-gray-600">
              <span>
                <strong className="mr-1 text-[#110f1a]">{totalPosts}</strong>게시물
              </span>
              <span>
                <strong className="mr-1 text-[#110f1a]">
                  {Math.max(0, followerCount).toLocaleString()}
                </strong>
                팔로워
              </span>
            </div>
          </section>

          {/* Tabs Section - 실제 파트너 페이지와 동일 */}
          <div className="flex items-center gap-2 rounded-xl bg-gray-100 p-1">
            <button className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold bg-white text-[#110f1a] shadow">
              포스트
            </button>
            <button className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-gray-500">
              멤버쉽
            </button>
            <button className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold text-gray-500">
              퀘스트
            </button>
          </div>

          {/* Game Info Preview - 실제 파트너 페이지의 사이드바 스타일 적용 */}
          {(data.favoriteGame?.trim() || (data.gameInfos && data.gameInfos.length > 0)) && (
            <div className="space-y-4">
              {data.favoriteGame?.trim() && (
                <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                  <Typography variant="h4" className="mb-3 font-semibold text-[#110f1a]">
                    🎮 선호 게임
                  </Typography>
                  <GameBadges favoriteGames={data.favoriteGame} size="sm" maxDisplay={4} />
                </div>
              )}

              {data.gameInfos && data.gameInfos.length > 0 && (
                <div className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                  <Typography variant="h4" className="mb-3 font-semibold text-[#110f1a]">
                    📊 게임 정보
                  </Typography>
                  <div className="space-y-3">
                    {data.gameInfos.map((info, index) => (
                      <div key={`${info.game}-${index}`} className="space-y-1">
                        <p className="text-sm font-semibold text-[#FE3A8F]">
                          {info.game || `게임 ${index + 1}`}
                        </p>
                        {info.tier && (
                          <p className="text-xs text-gray-500">티어: {info.tier}</p>
                        )}
                        {info.description && (
                          <p className="mt-2 text-sm text-gray-600">{info.description}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}

function arePreviewDataEqual(a: PartnerPreviewData, b: PartnerPreviewData) {
  if (a.partnerName !== b.partnerName) return false
  if (a.partnerMessage !== b.partnerMessage) return false
  if (a.profileImage !== b.profileImage) return false
  if (a.favoriteGame !== b.favoriteGame) return false
  if (!areArraysEqual(a.gameInfos || [], b.gameInfos || [])) return false
  if (
    !areArraysEqual(
      (a.backgroundImages || []).map((item) => item?.url),
      (b.backgroundImages || []).map((item) => item?.url),
    )
  ) {
    return false
  }
  return true
}

function areArraysEqual<T>(a: T[], b: T[]) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) {
      return false
    }
  }
  return true
}
