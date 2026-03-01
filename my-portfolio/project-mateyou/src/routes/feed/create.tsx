import { useState, useRef, useEffect, useCallback } from 'react'
import { createFileRoute, useNavigate, useRouterState } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, X, Plus, Camera, Globe, Lock, Users, ChevronRight, ChevronDown, Volume2, VolumeX, UserPlus } from 'lucide-react'
import { SlideSheet } from '@/components'
import { useDevice } from '@/hooks/useDevice'
import { Camera as CapacitorCamera } from '@capacitor/camera'
import type { GalleryPhoto } from '@capacitor/camera'
import { Capacitor } from '@capacitor/core'
import { Gallery, type GalleryAlbum } from '@/lib/galleryPlugin'
import { useCreatePostStore, type SelectedMedia } from '@/store/useCreatePostStore'
import { useAuthStore } from '@/store/useAuthStore'
import { resolveAccessToken } from '@/utils/sessionToken'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { compressVideo, isVideoCompressionSupported } from '@/utils/videoCompression'
import { compressImage } from '@/utils/imageCompression'

export const Route = createFileRoute('/feed/create' as const)({
  component: CreatePostPage,
})

function CreatePostPage() {
  const navigate = useNavigate()
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname
  const { isMobile } = useDevice()
  const queryClient = useQueryClient()
  const [currentPage, setCurrentPage] = useState<1 | 2>(1)
  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [showPostTypeModal, setShowPostTypeModal] = useState(false)
  const [showMembershipTooltip, setShowMembershipTooltip] = useState(false)
  const [isLoadingGallery, setIsLoadingGallery] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false) // 게시물 업로드 중
  // 모달 내부에서 사용할 임시 상태
  const [tempIsPrivate, setTempIsPrivate] = useState(false)
  const [tempHasPaid, setTempHasPaid] = useState(false)
  const [tempHasMembership, setTempHasMembership] = useState(false)
  const [tempIsFollow, setTempIsFollow] = useState(false)
  const [tempPointPrice, setTempPointPrice] = useState(0)
  const [tempFollowPointPrice, setTempFollowPointPrice] = useState(0)
  const [tempSelectedMembershipId, setTempSelectedMembershipId] = useState<string | null>(null)
  const [tempIsBulkSale, setTempIsBulkSale] = useState(true)
  const [tempIsBulkMembership, setTempIsBulkMembership] = useState(true)
  const [tempDiscountRate, setTempDiscountRate] = useState(0)
  const [tempIsBundle, setTempIsBundle] = useState(false)
  const [tempMediaPrices, setTempMediaPrices] = useState<Record<number, number>>({})
  const [tempMediaMemberships, setTempMediaMemberships] = useState<Record<number, string | null>>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const processedPendingFilesRef = useRef<string | null>(null) // 처리된 파일 해시 저장
  const galleryLoadedRef = useRef<boolean>(false) // 갤러리 로드 여부
  const swipeContainerRef = useRef<HTMLDivElement>(null)
  const touchStartX = useRef<number>(0)
  const touchEndX = useRef<number>(0)
  const [galleryHeight, setGalleryHeight] = useState<number>(300) // 최근 항목 영역 높이 (기본값 더 높게)
  const defaultGalleryHeight = 300 // 기본 높이
  const [isDraggingHeader, setIsDraggingHeader] = useState(false) // 헤더 드래그 중
  const [isScrollingGallery, setIsScrollingGallery] = useState(false) // 스크롤 중 (높이 증가 시)
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragStartY = useRef<number>(0) // 드래그 시작 Y 위치
  const dragStartHeight = useRef<number>(300) // 드래그 시작 높이
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({}) // 비디오 URL 캐시 (네이티브용)
  const videoBlobUrlsRef = useRef<Record<string, string>>({}) // 비디오 Blob URL 캐시 (웹용, ref로 즉시 접근)
  const [videoMuted, setVideoMuted] = useState<Record<number, boolean>>({}) // 비디오 음소거 상태
  const [videoProgress, setVideoProgress] = useState<Record<number, number>>({}) // 비디오 진행도 (0~1)
  const [videoDuration, setVideoDuration] = useState<Record<number, number>>({}) // 비디오 전체 길이
  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({}) // 비디오 요소 참조
  const [isDraggingProgress, setIsDraggingProgress] = useState(false) // 프로그레스바 드래그 중
  const [albums, setAlbums] = useState<GalleryAlbum[]>([]) // 앨범 목록
  const [selectedAlbum, setSelectedAlbum] = useState<GalleryAlbum | null>(null) // 선택된 앨범
  const [showAlbumPicker, setShowAlbumPicker] = useState(false) // 앨범 선택 모달
  const [galleryOffset, setGalleryOffset] = useState(0) // 페이지네이션 오프셋
  const [hasMorePhotos, setHasMorePhotos] = useState(true) // 더 로드할 사진 있는지
  const [isLoadingMore, setIsLoadingMore] = useState(false) // 추가 로딩 중
  const [totalPhotoCount, setTotalPhotoCount] = useState(0) // 전체 사진 수
  const galleryScrollRef = useRef<HTMLDivElement>(null) // 갤러리 스크롤 컨테이너
  const lastScrollTopRef = useRef<number>(0) // 마지막 스크롤 위치
  const page2SwipeContainerRef = useRef<HTMLDivElement>(null)
  const page2TouchStartX = useRef<number>(0)
  const page2TouchEndX = useRef<number>(0)
  const captionTextareaRef = useRef<HTMLTextAreaElement>(null)
  const isComposingRef = useRef<boolean>(false)

  // 전역 상태에서 가져오기
  const {
    selectedMedia,
    selectedIndex,
    caption,
    postType,
    hasPaid,
    hasMembership,
    pointPrice,
    followPointPrice,
    selectedMembershipId,
    galleryImages,
    hasRequestedPermission,
    isBulkSale,
    isBulkMembership,
    discountRate,
    isBundle,
    addSelectedMedia,
    removeSelectedMedia,
    setSelectedIndex,
    setCaption,
    setPostType,
    setHasPaid,
    setHasMembership,
    setPointPrice,
    setFollowPointPrice,
    setSelectedMembershipId,
    setGalleryImages,
    addGalleryImages,
    setHasRequestedPermission,
    setIsBulkSale,
    setIsBulkMembership,
    setDiscountRate,
    setIsBundle,
    setMediaPointPrice,
    setMediaMembershipId,
    clearAll,
  } = useCreatePostStore()

  const { user } = useAuth()
  const authAccessToken = useAuthStore((state) => state.accessToken)
  const authRefreshToken = useAuthStore((state) => state.refreshToken)
  const syncSession = useAuthStore((state) => state.syncSession)
  const [isPrivate, setIsPrivate] = useState(hasPaid || hasMembership)
  const [memberships, setMemberships] = useState<Array<{ id: string; name: string; description?: string }>>([])
  const [isLoadingMemberships, setIsLoadingMemberships] = useState(false)

  // 모달이 열릴 때 현재 상태를 임시 상태로 복사
  useEffect(() => {
    if (showPostTypeModal) {
      setTempIsPrivate(hasPaid || hasMembership)
      setTempIsFollow(postType === 'follow')
      setTempHasPaid(hasPaid)
      setTempHasMembership(hasMembership)
      setTempPointPrice(pointPrice)
      setTempFollowPointPrice(followPointPrice)
      setTempSelectedMembershipId(selectedMembershipId)
      setTempIsBulkSale(isBulkSale)
      setTempIsBulkMembership(isBulkMembership)
      setTempDiscountRate(discountRate)
      setTempIsBundle(isBundle)
      // 개별 미디어 가격/멤버쉽 복사
      const mediaPrices: Record<number, number> = {}
      const mediaMemberships: Record<number, string | null> = {}
      selectedMedia.forEach((media, index) => {
        if (media.pointPrice !== undefined) mediaPrices[index] = media.pointPrice
        if (media.membershipId !== undefined) mediaMemberships[index] = media.membershipId
      })
      setTempMediaPrices(mediaPrices)
      setTempMediaMemberships(mediaMemberships)
    }
  }, [showPostTypeModal, hasPaid, hasMembership, pointPrice, followPointPrice, selectedMembershipId, postType, isBulkSale, isBulkMembership, discountRate, isBundle, selectedMedia])

  // 확인 버튼 클릭 시 실제 상태에 반영
  const handlePostTypeConfirm = () => {
    // 팔로우 피드는 무조건 일괄 판매
    const finalIsBulkSale = tempIsFollow ? true : tempIsBulkSale
    
    console.log('🔍 [handlePostTypeConfirm] 호출됨', {
      tempIsFollow,
      tempHasPaid,
      tempPointPrice,
      tempFollowPointPrice,
      tempHasMembership,
      tempSelectedMembershipId,
      tempIsBulkSale,
      finalIsBulkSale,
      tempIsBulkMembership,
      tempDiscountRate,
      tempIsBundle,
      tempMediaPrices,
      tempMediaMemberships,
    })
    
    setSelectedMembershipId(tempSelectedMembershipId)
    setIsBulkSale(finalIsBulkSale)
    setIsBulkMembership(tempIsBulkMembership)
    setDiscountRate(tempDiscountRate)
    setIsBundle(tempIsBundle)
    
    // 개별 미디어 가격/멤버쉽 반영
    selectedMedia.forEach((media, index) => {
      // 개별 판매인 경우: tempMediaPrices에 값이 있으면 반영, 없으면 0으로 설정
      // 팔로우는 일괄 판매이지만 개별 가격은 화면 표시용으로 유지
      if ((tempIsFollow || tempHasPaid) && !finalIsBulkSale) {
        const price = tempMediaPrices[index] !== undefined ? tempMediaPrices[index] : 0
        setMediaPointPrice(index, price)
        console.log(`🔍 [handlePostTypeConfirm] 미디어 ${index} 개별 가격 설정:`, price, `(tempMediaPrices[${index}]: ${tempMediaPrices[index]})`)
      }
      // 개별 멤버쉽 설정인 경우: tempMediaMemberships에 값이 있으면 반영
      if (tempHasMembership && !tempIsBulkMembership) {
        const membershipId = tempMediaMemberships[index] !== undefined ? tempMediaMemberships[index] : null
        setMediaMembershipId(index, membershipId)
        console.log(`🔍 [handlePostTypeConfirm] 미디어 ${index} 개별 멤버쉽 설정:`, membershipId)
      }
    })
    
    // 스토어 상태 확인
    setTimeout(() => {
      const storeState = useCreatePostStore.getState()
      console.log('🔍 [handlePostTypeConfirm] 스토어 상태 확인:', {
        selectedMedia: storeState.selectedMedia.map((m, i) => ({
          index: i,
          pointPrice: m.pointPrice,
          membershipId: m.membershipId,
        })),
      })
    }, 100)
    
    // 팔로우와 단건구매는 완전히 분리 - 선택하지 않은 공개대상의 값 초기화
    if (tempIsFollow) {
      setPostType('follow')
      setFollowPointPrice(tempFollowPointPrice)
      // 비공개 관련 값 초기화
      setHasPaid(false)
      setHasMembership(false)
      setPointPrice(0)
      setSelectedMembershipId(null)
      setIsPrivate(false)
    } else if (tempIsPrivate) {
      // 팔로우 관련 값 초기화
      setFollowPointPrice(0)
      setIsPrivate(tempIsPrivate)
      setHasPaid(tempHasPaid)
      setHasMembership(tempHasMembership)
      setPointPrice(tempPointPrice)
      
      if (!tempHasPaid && !tempHasMembership) {
        setPostType('free')
      } else if (tempHasPaid) {
        setPostType('paid')
      } else if (tempHasMembership) {
        setPostType('membership')
      }
    } else {
      // 전체 공개: 모든 유료 관련 값 초기화
      setPostType('free')
      setFollowPointPrice(0)
      setHasPaid(false)
      setHasMembership(false)
      setPointPrice(0)
      setSelectedMembershipId(null)
      setIsPrivate(false)
      setDiscountRate(0)
    }
    
    console.log('🔍 [handlePostTypeConfirm] 스토어에 저장:', {
      postType: tempIsFollow ? 'follow' : (tempHasPaid ? 'paid' : 'free'),
      pointPrice: tempIsFollow ? tempFollowPointPrice : tempPointPrice,
    })
    
    setShowPostTypeModal(false)
  }

  // hasPaid/hasMembership 변경 시 isPrivate 상태 동기화
  useEffect(() => {
    setIsPrivate(hasPaid || hasMembership)
  }, [hasPaid, hasMembership])

  // 파일 선택 처리 (공통 함수) - useCallback으로 메모이제이션
  const handleFilesSelected = useCallback((files: File[]) => {
    if (files.length === 0) return

    console.log('📁 handleFilesSelected 호출됨:', files.length, '개 파일')

    // 최대 10개 제한
    const remainingSlots = 10 - selectedMedia.length
    if (remainingSlots <= 0) {
      alert('최대 10개의 파일만 업로드할 수 있습니다.')
      return
    }

    const filesToProcess = files.slice(0, remainingSlots)
    if (files.length > remainingSlots) {
      alert(`${remainingSlots}개만 추가됩니다. (최대 10개)`)
    }

    // 미디어 생성 및 Blob URL 캐시
    const newMedia: SelectedMedia[] = filesToProcess.map((file) => {
      const isVideo = file.type.startsWith('video/')
      const fileKey = `${file.name}-${file.size}-${file.lastModified}`
      
      if (isVideo) {
        // 동영상: Blob URL을 ref에 저장 (한 번만 생성)
        if (!videoBlobUrlsRef.current[fileKey]) {
          videoBlobUrlsRef.current[fileKey] = URL.createObjectURL(file)
        }
        return {
          file,
          preview: '', // 동영상은 video 태그로 직접 표시
          type: 'video' as const,
        }
      } else {
        // 이미지: blob URL을 preview로 사용
        return {
          file,
          preview: URL.createObjectURL(file),
          type: 'image' as const,
        }
      }
    })

    console.log('📁 newMedia 생성됨:', newMedia.length, '개')

    // 전역 상태에 추가
    const currentLength = selectedMedia.length
    addSelectedMedia(newMedia)
    addGalleryImages(newMedia)

    // 웹에서 파일 업로드 시 자동으로 마지막 추가된 항목으로 선택
    if (!Capacitor.isNativePlatform()) {
      // 상태 업데이트 후 실행되도록 약간의 지연
      setTimeout(() => {
        setSelectedIndex(currentLength + newMedia.length - 1)
      }, 50)
    }

    // 파일이 선택되면 권한 요청 완료로 표시 (웹/네이티브 모두)
    setHasRequestedPermission(true)
  }, [selectedMedia.length, addSelectedMedia, addGalleryImages, setHasRequestedPermission, setSelectedIndex])

  // 페이지 진입 시 인덱스 재계산 (중복 방지)
  useEffect(() => {
    // selectedMedia의 인덱스가 올바른지 확인하고 재계산
    if (selectedMedia.length > 0) {
      const maxIndex = selectedMedia.length - 1
      if (selectedIndex > maxIndex) {
        setSelectedIndex(maxIndex)
      }
    }
  }, [selectedMedia.length, selectedIndex, setSelectedIndex])

  // 웹에서 파일 선택 처리 (Navigation에서 window 객체에 저장된 파일)
  // 컴포넌트 마운트 시 한 번만 실행되도록 빈 dependency 배열 사용
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (Capacitor.isNativePlatform()) return // 네이티브에서는 필요 없음

    // 이미 처리 중이면 스킵
    if (processedPendingFilesRef.current !== null) {
      return
    }

    const checkAndProcessFiles = () => {
      // 이미 처리 중이면 스킵
      if (processedPendingFilesRef.current !== null) {
        return
      }

      const pendingFiles = (window as any).__feedCreatePendingFiles
      if (!pendingFiles || !Array.isArray(pendingFiles) || pendingFiles.length === 0) {
        return
      }

      // 파일 해시 생성 (파일 이름과 크기 기반)
      const filesHash = pendingFiles
        .map((f: File) => `${f.name}-${f.size}-${f.lastModified}`)
        .join('|')
      
      // 이미 처리한 파일이면 스킵
      if (processedPendingFilesRef.current === filesHash) {
        delete (window as any).__feedCreatePendingFiles
        return
      }

      // 파일 처리 플래그 설정 (먼저 설정하여 중복 실행 방지)
      processedPendingFilesRef.current = filesHash
      
      // 전역 변수 즉시 정리 (무한루프 방지)
      delete (window as any).__feedCreatePendingFiles
      
      // 파일 배열 복사 (원본 참조 제거)
      const filesToProcess = Array.from(pendingFiles)
      
      console.log('📁 processFiles 시작:', filesToProcess.length, '개 파일')
      
      // handleFilesSelected를 직접 호출하여 일관된 처리
      // 약간의 지연을 두어 라우터 이동이 완료된 후 처리
      setTimeout(() => {
        handleFilesSelected(filesToProcess)
      }, 50)
    }

    // 즉시 체크
    checkAndProcessFiles()
    
    // 라우터 이동 후에도 파일이 있을 수 있으므로 약간의 지연 후 다시 체크
    const timer1 = setTimeout(() => {
      checkAndProcessFiles()
    }, 100)
    
    const timer2 = setTimeout(() => {
      checkAndProcessFiles()
    }, 300)
    
    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // dependency 제거 - 마운트 시 한 번만 실행

  // 네이티브에서 보낸 메시지 수신 리스너
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleMessage = (event: MessageEvent) => {
      try {
        // React Native WebView에서 온 메시지
        let data = event.data
        if (typeof data === 'string') {
          try {
            data = JSON.parse(data)
          } catch {
            // JSON이 아닌 경우 그대로 사용
          }
        }

        // 권한 요청 응답 처리
        if (data?.type === 'PHOTO_PERMISSION_RESPONSE') {
          const granted = data.granted === true || data.status === 'authorized' || data.status === 'granted'
          if (permissionCallbackRef.current) {
            permissionCallbackRef.current(granted)
            permissionCallbackRef.current = null
          }
          if (granted) {
            loadGalleryImages()
          }
        }

        // 갤러리 이미지 데이터 수신
        if (data?.type === 'GALLERY_IMAGES') {
          const photos = data.photos || data.images || data.assets || []
          if (photos.length > 0) {
            const mediaList: SelectedMedia[] = photos.map((photo: any) => ({
              file: photo.file || new File([], photo.uri || photo.path || photo.url || '', { 
                type: photo.type || (photo.mediaType === 'video' ? 'video/mp4' : 'image/jpeg') 
              }),
              preview: photo.uri || photo.path || photo.url || photo.thumbnailUri || '',
              type: (photo.type?.includes('video') || photo.mediaType === 'video') ? 'video' : 'image',
            }))
            setGalleryImages(mediaList)
            setHasRequestedPermission(true)
          }
        }
      } catch (error) {
        console.error('메시지 처리 실패:', error)
      }
    }

    window.addEventListener('message', handleMessage)
    
    // iOS WKWebView용 (직접 호출 방식)
    const win = window as any
    if (win.receiveMessageFromNative) {
      // 네이티브에서 직접 함수를 호출하는 경우
      win.receiveMessageFromNative = (data: any) => {
        handleMessage({ data } as MessageEvent)
      }
    }

    return () => {
      window.removeEventListener('message', handleMessage)
    }
  }, [])

  // 페이지 진입 시 자동으로 갤러리 로드 (네이티브)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (currentPage !== 1) return
    
    // 웹에서는 파일 인풋 사용
    if (!Capacitor.isNativePlatform()) {
      return
    }
    
    // 이미 로드했거나 갤러리가 있으면 스킵
    if (galleryLoadedRef.current || galleryImages.length > 0) {
      return
    }
    
    // 파일 처리 중이면 스킵
    if (processedPendingFilesRef.current !== null) {
      return
    }

    // 네이티브에서 자동으로 갤러리 로드
    const timer = setTimeout(() => {
      if (!galleryLoadedRef.current && galleryImages.length === 0) {
        loadNativeGallery()
      }
    }, 100)
    
    return () => clearTimeout(timer)
  }, [currentPage, galleryImages.length])

  // 앨범 목록 로드
  const loadAlbums = async () => {
    if (!Capacitor.isNativePlatform()) return
    
    try {
      const result = await Gallery.getAlbums()
      if (result.albums && result.albums.length > 0) {
        setAlbums(result.albums)
        // 기본으로 "최근 항목" 선택
        const recentAlbum = result.albums.find(a => a.id === 'all')
        if (recentAlbum) {
          setSelectedAlbum(recentAlbum)
        }
      }
    } catch (error) {
      console.error('❌ 앨범 목록 로드 실패:', error)
    }
  }

  // 앨범에서 사진 로드 (페이지네이션)
  const loadPhotosFromAlbum = async (albumId: string, offset: number = 0, append: boolean = false) => {
    if (!Capacitor.isNativePlatform()) return
    
    if (offset === 0) {
      setIsLoadingGallery(true)
    } else {
      setIsLoadingMore(true)
    }
    
    try {
      const result = await Gallery.getPhotosFromAlbum({
        albumId,
        offset,
        limit: 50, // 한 번에 50개씩
        thumbnailWidth: 300,
        thumbnailHeight: 300,
      })
      
      console.log('📸 앨범에서 사진 로드됨:', result.photos?.length || 0, '/ 전체:', result.totalCount)
      
      if (result.photos && result.photos.length > 0) {
        const mediaList: SelectedMedia[] = result.photos.map((photo) => {
          const isVideo = photo.mediaType === 'video' || (photo.duration && photo.duration > 0)
          const dataUrl = `data:image/jpeg;base64,${photo.data}`
          
          return {
            file: new File([], photo.identifier || 'media', { 
              type: isVideo ? 'video/mp4' : 'image/jpeg' 
            }),
            preview: dataUrl,
            type: isVideo ? 'video' : 'image',
            nativeIdentifier: photo.identifier,
          } as SelectedMedia
        })
        
        if (append) {
          addGalleryImages(mediaList)
        } else {
          setGalleryImages(mediaList)
        }
        
        setHasMorePhotos(result.hasMore)
        setTotalPhotoCount(result.totalCount)
        setGalleryOffset(offset + result.photos.length)
      setHasRequestedPermission(true)
        galleryLoadedRef.current = true
      } else if (offset === 0) {
        setGalleryImages([])
        setHasMorePhotos(false)
      }
    } catch (error: any) {
      console.error('❌ 앨범 사진 로드 실패:', error)
    } finally {
      setIsLoadingGallery(false)
      setIsLoadingMore(false)
    }
  }

  // 더 많은 사진 로드
  const loadMorePhotos = useCallback(() => {
    if (!hasMorePhotos || isLoadingMore || !selectedAlbum) return
    loadPhotosFromAlbum(selectedAlbum.id, galleryOffset, true)
  }, [hasMorePhotos, isLoadingMore, selectedAlbum, galleryOffset])

  // 앨범 변경 시 사진 다시 로드
  const handleAlbumChange = (album: GalleryAlbum) => {
    setSelectedAlbum(album)
    setShowAlbumPicker(false)
    setGalleryOffset(0)
    setHasMorePhotos(true)
    loadPhotosFromAlbum(album.id, 0, false)
  }

  // 네이티브 환경에서 갤러리 이미지 자동 로드
  const loadNativeGallery = async () => {
    if (!Capacitor.isNativePlatform()) return
    if (galleryLoadedRef.current) return
    
    console.log('🔵 loadNativeGallery 호출됨!')
    setIsLoadingGallery(true)
    
    try {
          // 먼저 권한 상태 확인
          const permissionStatus = await CapacitorCamera.checkPermissions()
          console.log('📋 현재 권한 상태:', permissionStatus)
          
      if (permissionStatus.photos !== 'granted') {
        // 권한 요청
            console.log('🔐 권한 요청 중...')
        const requestResult = await CapacitorCamera.requestPermissions({ permissions: ['photos'] })
        console.log('📋 권한 요청 결과:', requestResult)
        
        if (requestResult.photos !== 'granted') {
          console.log('❌ 권한 거부됨')
          setIsLoadingGallery(false)
          return
        }
      }
      
      // 앨범 목록 로드
      await loadAlbums()
      
      // 최근 항목 (전체) 사진 로드
      await loadPhotosFromAlbum('all', 0, false)
      
        } catch (error: any) {
      console.error('❌ 갤러리 로드 실패:', error)
    } finally {
      setIsLoadingGallery(false)
    }
  }

  // 갤러리 스크롤 핸들러 (무한 스크롤 + 높이 조절)
  const handleGalleryScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget
    const { scrollTop, scrollHeight, clientHeight } = container
    const maxHeight = typeof window !== 'undefined' ? window.innerHeight * 0.8 : 600
    
    // 스크롤 방향 감지
    const isScrollingDown = scrollTop > lastScrollTopRef.current
    
    // 스크롤 아래로 내릴 때 높이 증가 (80vh까지) - 트랜지션 없이 즉시
    if (isScrollingDown && galleryHeight < maxHeight) {
      setIsScrollingGallery(true)
      const delta = scrollTop - lastScrollTopRef.current
      const newHeight = Math.min(maxHeight, galleryHeight + delta * 0.5)
      setGalleryHeight(newHeight)
      
      // 스크롤이 멈추면 상태 리셋
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current)
      scrollTimeoutRef.current = setTimeout(() => {
        setIsScrollingGallery(false)
      }, 150)
    }
    
    // 스크롤이 맨 위에 도달하면 (scrollTop <= 5px) 기본 높이로 복원 - 부드러운 트랜지션
    if (scrollTop <= 5 && galleryHeight > defaultGalleryHeight) {
      setIsScrollingGallery(false) // 트랜지션 활성화
      setGalleryHeight(defaultGalleryHeight)
          }
    
    lastScrollTopRef.current = scrollTop
    
    // 무한 스크롤: 하단에 도달하면 더 로드
    if (scrollHeight - scrollTop - clientHeight < 100) {
      loadMorePhotos()
    }
  }, [loadMorePhotos, galleryHeight])

  // 비디오 URL 가져오기
  const loadVideoUrl = useCallback(async (identifier: string) => {
    if (!Capacitor.isNativePlatform() || !identifier || videoUrls[identifier]) return
    
    try {
      const result = await Gallery.getVideoUrl({ identifier })
      if (result.url) {
        // file:// URL을 웹뷰에서 접근 가능한 URL로 변환
        const webViewUrl = Capacitor.convertFileSrc(result.url)
        console.log('비디오 URL 변환:', result.url, '→', webViewUrl)
        setVideoUrls(prev => ({ ...prev, [identifier]: webViewUrl }))
      }
    } catch (error) {
      console.error('비디오 URL 로드 실패:', error)
    }
  }, [videoUrls])

  // 비디오 음소거 토글
  const toggleVideoMute = useCallback((index: number) => {
    setVideoMuted(prev => {
      const newMuted = !prev[index]
      const video = videoRefs.current[index]
      if (video) {
        video.muted = newMuted
      }
      return { ...prev, [index]: newMuted }
    })
  }, [])

  // 비디오 진행도 업데이트
  const handleVideoTimeUpdate = useCallback((index: number) => {
    const video = videoRefs.current[index]
    if (video && video.duration) {
      setVideoProgress(prev => ({ ...prev, [index]: video.currentTime / video.duration }))
    }
  }, [])

  // 비디오 메타데이터 로드
  const handleVideoLoadedMetadata = useCallback((index: number) => {
    const video = videoRefs.current[index]
    if (video) {
      setVideoDuration(prev => ({ ...prev, [index]: video.duration }))
      // 기본 음소거 상태 설정
      if (videoMuted[index] === undefined) {
        setVideoMuted(prev => ({ ...prev, [index]: true }))
      }
    }
  }, [videoMuted])

  // 프로그레스바 클릭/드래그로 시간 이동
  const handleProgressChange = useCallback((index: number, clientX: number, rect: DOMRect) => {
    const video = videoRefs.current[index]
    if (video && video.duration) {
      const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
      video.currentTime = percent * video.duration
      setVideoProgress(prev => ({ ...prev, [index]: percent }))
    }
  }, [])

  // 프로그레스바 드래그 시작
  const handleProgressDragStart = useCallback((index: number, e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation()
    setIsDraggingProgress(true)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    handleProgressChange(index, clientX, rect)
  }, [handleProgressChange])

  // 선택된 미디어가 비디오일 때 URL 로드
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    
    const currentMedia = selectedMedia[selectedIndex]
    if (currentMedia?.type === 'video' && currentMedia.nativeIdentifier) {
      loadVideoUrl(currentMedia.nativeIdentifier)
    }
  }, [selectedMedia, selectedIndex, loadVideoUrl])

  // 헤더 드래그 핸들러
  const handleHeaderDragStart = useCallback((clientY: number) => {
    setIsDraggingHeader(true)
    dragStartY.current = clientY
    dragStartHeight.current = galleryHeight
  }, [galleryHeight])

  const handleHeaderDragMove = useCallback((clientY: number) => {
    if (!isDraggingHeader) return
    
    const maxHeight = typeof window !== 'undefined' ? window.innerHeight * 0.8 : 600
    const delta = dragStartY.current - clientY // 위로 드래그하면 높이 증가
    const newHeight = Math.max(defaultGalleryHeight, Math.min(maxHeight, dragStartHeight.current + delta))
    setGalleryHeight(newHeight)
  }, [isDraggingHeader])

  const handleHeaderDragEnd = useCallback(() => {
    setIsDraggingHeader(false)
  }, [])

  // 전역 드래그 이벤트 리스너
  useEffect(() => {
    if (!isDraggingHeader) return

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault()
      handleHeaderDragMove(e.clientY)
    }
    const handleMouseUp = () => handleHeaderDragEnd()
    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      handleHeaderDragMove(e.touches[0].clientY)
    }
    const handleTouchEnd = () => handleHeaderDragEnd()

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('touchend', handleTouchEnd)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleTouchEnd)
    }
  }, [isDraggingHeader, handleHeaderDragMove, handleHeaderDragEnd])

  // 추가 이미지 선택 (+ 버튼 클릭 시)
  const handleAddMoreImages = async () => {
    try {
      const isNative = Capacitor.isNativePlatform()
      
      if (isNative) {
        // Capacitor Camera API로 이미지 선택
        try {
          const photos = await CapacitorCamera.pickImages({
            quality: 90,
            limit: 10 - selectedMedia.length, // 남은 슬롯만큼
          })
          
          console.log('📸 이미지 선택됨:', photos)
          
          // Capacitor GalleryPhoto를 SelectedMedia 형식으로 변환
          const mediaList: SelectedMedia[] = await Promise.all(
            photos.photos.map(async (photo: GalleryPhoto) => {
              const response = await fetch(photo.webPath || '')
              const blob = await response.blob()
              const file = new File([blob], photo.path?.split('/').pop() || 'image.jpg', { type: blob.type })
              
              return {
                file,
                preview: photo.webPath || '',
                type: blob.type.startsWith('video/') ? 'video' : 'image',
              }
            })
          )
          
          if (mediaList.length > 0) {
            const currentLength = selectedMedia.length
            addSelectedMedia(mediaList)
            addGalleryImages(mediaList)
            setTimeout(() => {
              setSelectedIndex(currentLength + mediaList.length - 1)
            }, 50)
          }
        } catch (error: any) {
          console.error('이미지 선택 실패:', error)
          if (!error.message?.includes('cancel')) {
            alert(`이미지 선택 실패: ${error.message || error}`)
          }
        }
      } else {
        // 웹 환경에서는 file input 사용
        fileInputRef.current?.click()
      }
    } catch (error) {
      console.error('이미지 선택 실패:', error)
    }
  }


  // 페이지 1: 갤러리 선택 (권한 요청 후 사용)
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    console.log('📁 handleFileSelect 호출됨:', files.length, '개 파일')
    handleFilesSelected(Array.from(files))

    // input 초기화 (같은 파일 다시 선택 가능하도록)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // 카메라 촬영 (권한 요청 후 사용)
  const handleCameraCapture = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    handleFilesSelected(Array.from(files))

    // input 초기화
    if (cameraInputRef.current) {
      cameraInputRef.current.value = ''
    }
  }

  const handleNext = useCallback(() => {
    if (selectedMedia.length === 0) return
    setCurrentPage(2)
  }, [selectedMedia.length])

  const handleBack = () => {
    if (currentPage === 1) {
      if (selectedMedia.length > 0) {
        setShowExitConfirm(true)
      } else {
        navigate({ to: '/feed/all' })
      }
    } else {
      // 페이지 2에서 뒤로 가기 버튼을 누르면 페이지 1로 이동
      setCurrentPage(1)
    }
  }

  const handleClose = () => {
    // 닫기 버튼 (X 버튼) - 항상 뒤로 가기
    if (selectedMedia.length > 0) {
      setShowExitConfirm(true)
    } else {
      navigate({ to: '/feed/all' })
    }
  }

  const getStoredAccessToken = useCallback(() => {
    return resolveAccessToken({
      accessToken: authAccessToken,
      refreshToken: authRefreshToken,
      syncSession,
    })
  }, [authAccessToken, authRefreshToken, syncSession])

  // base64를 File로 변환하는 헬퍼 함수
  const base64ToFile = useCallback((base64: string, filename: string, mimeType: string): File => {
    const byteCharacters = atob(base64)
    const byteNumbers = new Array(byteCharacters.length)
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i)
    }
    const byteArray = new Uint8Array(byteNumbers)
    const blob = new Blob([byteArray], { type: mimeType })
    return new File([blob], filename, { type: mimeType })
  }, [])

  // 미디어 업로드
  // 미디어 압축 진행률 상태
  const [compressionProgress, setCompressionProgress] = useState<number>(0)
  const [isCompressing, setIsCompressing] = useState(false)
  const [compressionType, setCompressionType] = useState<'image' | 'video' | null>(null)

  // 게시물 작성 완료 (form-data로 파일과 함께 한 번에 업로드)
  const handlePostSubmit = useCallback(async () => {
    // 중복 클릭 방지
    if (isSubmitting) {
      console.log('⚠️ 이미 업로드 중입니다.')
      return
    }
    if (selectedMedia.length === 0) {
      alert('사진을 선택해주세요.')
      return
    }

    setIsSubmitting(true)

    try {
      const accessToken = await getStoredAccessToken()
      if (!accessToken) {
        alert('로그인이 필요합니다.')
        setIsSubmitting(false)
        return
      }

      // textarea에서 직접 값을 읽어오기 (상태 동기화 문제 방지)
      await new Promise(resolve => setTimeout(resolve, 50))
      const currentCaption = captionTextareaRef.current?.value || caption || ''

      // 스토어에서 직접 최신 값 읽기 (클로저 문제 방지)
      const storeState = useCreatePostStore.getState()
      const currentPostType = storeState.postType
      const currentHasPaid = storeState.hasPaid
      const currentPointPrice = storeState.pointPrice
      const currentFollowPointPrice = storeState.followPointPrice
      const currentHasMembership = storeState.hasMembership
      const currentIsBulkSale = storeState.isBulkSale
      const currentIsBulkMembership = storeState.isBulkMembership
      const currentDiscountRate = storeState.discountRate
      const currentIsBundle = storeState.isBundle
      const currentSelectedMembershipId = storeState.selectedMembershipId
      const currentSelectedMedia = storeState.selectedMedia

      // FormData 생성
      const formData = new FormData()
      formData.append('content', currentCaption)
      
      console.log('📤 [handlePostSubmit] 스토어 값:', {
        currentPostType,
        currentPointPrice,
        currentFollowPointPrice,
        currentHasPaid,
        currentHasMembership,
        currentIsBulkSale,
        currentIsBulkMembership,
        currentDiscountRate,
        currentIsBundle,
        selectedMedia: currentSelectedMedia.map((m, idx) => ({
          index: idx,
          pointPrice: m.pointPrice,
          membershipId: m.membershipId,
        })),
      })
      
      // 할인율 설정 (공통)
      formData.append('discount_rate', String(currentDiscountRate || 0))
      
      // 팔로우와 단건구매는 완전히 분리
      if (currentPostType === 'follow') {
        // 팔로우 전용 point_price 사용
        if (currentIsBulkSale) {
          // 일괄 판매
          const pointPriceToSend = String(currentFollowPointPrice || 0)
          console.log('📤 [handlePostSubmit] 팔로우 게시물 일괄 판매 point_price:', pointPriceToSend)
          formData.append('point_price', pointPriceToSend)
        } else {
          // 개별 판매 - 각 미디어별 가격은 나중에 추가
          formData.append('point_price', '0') // 기본값
          formData.append('is_bulk_sale', 'false')
          formData.append('is_bundle', String(currentIsBundle ? 'true' : 'false'))
        }
        formData.append('is_subscribers_only', '0')
      } else {
        // 단건구매/멤버쉽
        if (currentHasPaid) {
          if (currentIsBulkSale) {
            // 일괄 판매
            formData.append('point_price', String(currentPointPrice || 0))
            formData.append('is_bulk_sale', 'true')
          } else {
            // 개별 판매 - 각 미디어별 가격은 나중에 추가
            formData.append('point_price', '0') // 기본값
            formData.append('is_bulk_sale', 'false')
            formData.append('is_bundle', String(currentIsBundle ? 'true' : 'false'))
          }
        } else {
          formData.append('point_price', '0')
        }
        
        if (currentHasMembership) {
          if (currentIsBulkMembership) {
            // 일괄 멤버쉽 설정
            formData.append('membership_id', currentSelectedMembershipId || '')
            formData.append('is_bulk_membership', 'true')
          } else {
            // 개별 멤버쉽 설정 - 각 미디어별 멤버쉽은 나중에 추가
            formData.append('membership_id', '') // 기본값
            formData.append('is_bulk_membership', 'false')
          }
          formData.append('is_subscribers_only', '1')
        } else {
          formData.append('is_subscribers_only', '0')
        }
      }
      
      formData.append('is_published', 'true')

      const MAX_VIDEO_SIZE = 15 * 1024 * 1024 // 15MB

      // 파일 처리 및 추가
      // 제출 시점에 스토어 상태 다시 확인 (최신 상태 보장)
      const latestStoreState = useCreatePostStore.getState()
      const latestSelectedMedia = latestStoreState.selectedMedia
      const latestIsBulkSale = latestStoreState.isBulkSale
      const latestHasPaid = latestStoreState.hasPaid
      const latestPostType = latestStoreState.postType
      const latestHasMembership = latestStoreState.hasMembership
      const latestIsBulkMembership = latestStoreState.isBulkMembership
      
      console.log('🔍 [제출 시점] 스토어 최신 상태:', {
        selectedMedia: latestSelectedMedia.map((m, idx) => ({
          index: idx,
          pointPrice: m.pointPrice,
          membershipId: m.membershipId,
        })),
        isBulkSale: latestIsBulkSale,
        hasPaid: latestHasPaid,
        postType: latestPostType,
        hasMembership: latestHasMembership,
        isBulkMembership: latestIsBulkMembership,
      })
      
      for (let i = 0; i < latestSelectedMedia.length; i++) {
        const media = latestSelectedMedia[i]
        let fileToUpload = media.file

        // 네이티브에서 nativeIdentifier가 있는 경우 고화질 이미지 가져오기
        if (Capacitor.isNativePlatform() && media.nativeIdentifier) {
          try {
            console.log('📸 고화질 이미지 가져오기:', media.nativeIdentifier)
            const result = await Gallery.getFullResolutionPhoto({
              identifier: media.nativeIdentifier,
              quality: 0.9,
              maxWidth: 2048,
              maxHeight: 2048,
            })
            
            if (result.data) {
              const filename = media.type === 'video' 
                ? `video_${Date.now()}.mp4` 
                : `image_${Date.now()}.jpg`
              fileToUpload = base64ToFile(result.data, filename, result.mimeType)
              console.log('✅ 고화질 파일 생성됨:', fileToUpload.size, 'bytes')
            }
          } catch (error) {
            console.error('❌ 고화질 이미지 가져오기 실패:', error)
            if (media.preview && media.preview.startsWith('data:')) {
              try {
                const [header, data] = media.preview.split(',')
                const mimeType = header.match(/:(.*?);/)?.[1] || 'image/jpeg'
                const filename = media.type === 'video' ? 'video.mp4' : 'image.jpg'
                fileToUpload = base64ToFile(data, filename, mimeType)
              } catch (e) {
                console.error('❌ preview에서 파일 생성 실패:', e)
              }
            }
          }
        }

        // 이미지 압축 (15MB 초과 시)
        if (media.type === 'image' && fileToUpload.size > MAX_VIDEO_SIZE) {
          try {
            console.log(`📸 이미지 압축 시작: ${(fileToUpload.size / 1024 / 1024).toFixed(1)}MB`)
            setIsCompressing(true)
            setCompressionType('image')
            setCompressionProgress(0)
            
            fileToUpload = await compressImage(fileToUpload, 15, (progress) => {
              setCompressionProgress(progress)
            })
            
            console.log(`✅ 이미지 압축 완료: ${(fileToUpload.size / 1024 / 1024).toFixed(1)}MB`)
          } catch (error) {
            console.error('❌ 이미지 압축 실패:', error)
            throw new Error('이미지 압축에 실패했습니다. 더 작은 이미지를 선택해주세요.')
          } finally {
            setIsCompressing(false)
            setCompressionType(null)
            setCompressionProgress(0)
          }
        }

        // 동영상 압축 (15MB 초과 시) - 서버 FFmpeg API 사용
        if (media.type === 'video' && fileToUpload.size > MAX_VIDEO_SIZE) {
          const MAX_COMPRESSIBLE_SIZE = 500 * 1024 * 1024 // 500MB - 서버에서 압축 가능한 최대 크기
          
          // 500MB 초과 시 압축 불가
          if (fileToUpload.size > MAX_COMPRESSIBLE_SIZE) {
            throw new Error(`동영상이 너무 큽니다 (${(fileToUpload.size / 1024 / 1024).toFixed(0)}MB). 500MB 이하의 동영상을 선택해주세요.`)
          }
          
          if (isVideoCompressionSupported()) {
            try {
              console.log(`🎬 동영상 압축 시작: ${(fileToUpload.size / 1024 / 1024).toFixed(1)}MB`)
              setIsCompressing(true)
              setCompressionType('video')
              setCompressionProgress(0)
              
              fileToUpload = await compressVideo(fileToUpload, 15, (progress) => {
                setCompressionProgress(progress)
              })
              
              console.log(`✅ 동영상 압축 완료: ${(fileToUpload.size / 1024 / 1024).toFixed(1)}MB`)
            } catch (error) {
              console.error('❌ 동영상 압축 실패:', error)
              throw new Error('동영상 압축에 실패했습니다. 더 작은 동영상을 선택해주세요.')
            } finally {
              setIsCompressing(false)
              setCompressionType(null)
              setCompressionProgress(0)
            }
          } else {
            throw new Error('이 브라우저에서는 동영상 압축을 지원하지 않습니다. 15MB 이하의 동영상을 선택해주세요.')
          }
        }

        // 파일 유효성 검사
        if (!fileToUpload || fileToUpload.size === 0) {
          throw new Error(`파일 "${media.file.name || '알 수 없음'}"을(를) 처리할 수 없습니다. 다시 선택해주세요.`)
        }
        
        console.log('📤 파일 추가:', fileToUpload.name, `(${(fileToUpload.size / 1024 / 1024).toFixed(2)}MB)`)
        formData.append('files', fileToUpload)
        
        // 개별 판매/멤버쉽 설정인 경우 각 미디어별 정보 추가
        console.log(`📤 [미디어 ${i}] 상태 확인:`, {
          postType: latestPostType,
          isBulkSale: latestIsBulkSale,
          hasPaid: latestHasPaid,
          hasMembership: latestHasMembership,
          isBulkMembership: latestIsBulkMembership,
          mediaPointPrice: media.pointPrice,
          mediaMembershipId: media.membershipId,
        })
        
        // 개별 판매인 경우 무조건 가격 추가 (값이 없으면 0)
        if (latestPostType === 'follow' && !latestIsBulkSale) {
          // 팔로우 개별 판매
          const pointPrice = media.pointPrice !== undefined && media.pointPrice !== null ? media.pointPrice : 0
          formData.append(`media_point_price_${i}`, String(pointPrice))
          console.log(`📤 [미디어 ${i}] 팔로우 개별 가격 추가:`, pointPrice, `(원본: ${media.pointPrice}, 타입: ${typeof media.pointPrice})`)
        } else if (latestHasPaid && !latestIsBulkSale) {
          // 단건구매 개별 판매
          const pointPrice = media.pointPrice !== undefined && media.pointPrice !== null ? media.pointPrice : 0
          formData.append(`media_point_price_${i}`, String(pointPrice))
          console.log(`📤 [미디어 ${i}] 단건구매 개별 가격 추가:`, pointPrice, `(원본: ${media.pointPrice}, 타입: ${typeof media.pointPrice})`)
        }
        
        // 개별 멤버쉽 설정인 경우
        if (latestHasMembership && !latestIsBulkMembership) {
          if (media.membershipId) {
            formData.append(`media_membership_id_${i}`, media.membershipId)
            console.log(`📤 [미디어 ${i}] 개별 멤버쉽 ID 추가:`, media.membershipId)
          } else {
            console.log(`📤 [미디어 ${i}] 개별 멤버쉽 설정이지만 ID 없음`)
          }
        }
      }

      // 게시물 생성 + 미디어 업로드 (한 번에)
      console.log('📤 게시물 업로드 중... postType:', latestPostType)
      console.log('📤 [FormData] 모든 필드 확인:', {
        isBulkSale: latestIsBulkSale,
        isBulkMembership: latestIsBulkMembership,
        hasPaid: latestHasPaid,
        hasMembership: latestHasMembership,
        selectedMedia: latestSelectedMedia.map((m, idx) => ({
          index: idx,
          pointPrice: m.pointPrice,
          membershipId: m.membershipId,
        })),
      })
      
      // FormData의 모든 필드 로그 출력
      const formDataEntries: string[] = []
      for (const [key, value] of formData.entries()) {
        if (key.startsWith('media_')) {
          formDataEntries.push(`${key}: ${value}`)
        }
      }
      console.log('📤 [FormData] 개별 미디어 필드:', formDataEntries)
      
      const apiEndpoint = latestPostType === 'follow' 
        ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-posts/chat`
        : `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-posts`
      
      console.log('📤 [API] 엔드포인트:', apiEndpoint)
      
      const response = await fetch(
        apiEndpoint,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            // Content-Type은 FormData일 때 자동 설정됨 (boundary 포함)
          },
          body: formData,
        }
      )

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || '게시물 저장에 실패했습니다.')
      }

      console.log('✅ 게시물 업로드 성공:', result.data.id)

      // 파트너 쿼리 무효화 (posts_count 갱신을 위해)
      queryClient.invalidateQueries({ queryKey: ['partner-details-by-member-code'] })
      queryClient.invalidateQueries({ queryKey: ['feed-posts'] })

      // 성공 시 상태 초기화 및 이동
      clearAll()
      navigate({ to: '/feed/all' })
    } catch (error: any) {
      console.error('게시물 작성 실패:', error)
      alert(error.message || '게시물 작성에 실패했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }, [
    isSubmitting,
    caption,
    clearAll,
    getStoredAccessToken,
    navigate,
    queryClient,
    selectedMedia,
    base64ToFile,
    postType,
  ])

  // 임시 저장 (form-data로 한 번에 업로드)
  const handleSaveDraft = useCallback(async () => {
    if (selectedMedia.length === 0) {
      clearAll()
      navigate({ to: '/feed/all' })
      return
    }

    try {
      const accessToken = await getStoredAccessToken()
      if (!accessToken) {
        alert('로그인이 필요합니다.')
        return
      }

      await new Promise(resolve => setTimeout(resolve, 50))
      const currentCaption = captionTextareaRef.current?.value || caption || ''

      // FormData 생성
      const formData = new FormData()
      formData.append('content', currentCaption)
      formData.append('point_price', String(hasPaid ? pointPrice : 0))
      formData.append('is_subscribers_only', String(hasMembership ? 1 : 0))
      formData.append('is_published', 'false') // 임시 저장

      // 파일 추가 (압축 없이 간단하게)
      for (const media of selectedMedia) {
        if (media.file && media.file.size > 0) {
          formData.append('files', media.file)
        }
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-posts`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: formData,
        }
      )

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || '임시 저장에 실패했습니다.')
      }

      clearAll()
      navigate({ to: '/feed/all' })
    } catch (error: any) {
      console.error('임시 저장 실패:', error)
      alert(error.message || '임시 저장에 실패했습니다.')
    }
  }, [
    caption,
    clearAll,
    getStoredAccessToken,
    hasMembership,
    hasPaid,
    navigate,
    pointPrice,
    selectedMedia,
  ])

  const handleExitConfirm = (action: 'delete' | 'save' | 'cancel') => {
    setShowExitConfirm(false)
    if (action === 'delete') {
      clearAll()
      navigate({ to: '/feed/all' })
    } else if (action === 'save') {
      handleSaveDraft()
    } else {
      // cancel - 아무것도 하지 않음
    }
  }

  // 정리는 전역 상태의 clearAll에서 처리됨

  // 페이지 상태를 전역에 저장하여 Navigation 컴포넌트에서 사용
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__feedCreateCurrentPage = currentPage
      // 커스텀 이벤트로 Navigation 컴포넌트에 알림
      window.dispatchEvent(new CustomEvent('feedCreatePageChange', { detail: { page: currentPage } }))
    }
  }, [currentPage])

  // Navigation 컴포넌트에서 뒤로가기 버튼 클릭 시 페이지 1로 이동
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleGoBack = () => {
      if (currentPage === 2) {
        setCurrentPage(1)
      }
    }

    window.addEventListener('feedCreateGoBack', handleGoBack)
    return () => {
      window.removeEventListener('feedCreateGoBack', handleGoBack)
    }
  }, [currentPage])

  // /feed/create 경로가 아닐 때 버튼 완전히 제거
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const cleanup = () => {
      // 문서 전체에서 모든 create 관련 버튼 제거
      const allNextButtons = document.querySelectorAll('[data-create-next-button]')
      allNextButtons.forEach(btn => btn.remove())
      
      const allPostButtons = document.querySelectorAll('[data-create-post-button]')
      allPostButtons.forEach(btn => btn.remove())
    }

    if (!currentPath.startsWith('/feed/create')) {
      // /feed/create가 아니면 모든 버튼 완전히 제거
      cleanup()
    }

    // 컴포넌트 언마운트 시에도 정리
    return cleanup
  }, [currentPath])

  // Blob URL 메모리 정리 (언마운트 시)
  useEffect(() => {
    return () => {
      // 저장된 모든 blob URL 해제
      Object.values(videoBlobUrlsRef.current).forEach(url => {
        try {
          URL.revokeObjectURL(url)
        } catch (e) {
          // ignore
        }
      })
      videoBlobUrlsRef.current = {}
    }
  }, [])

  // 전역 헤더의 다음/작성 버튼을 업데이트하기 위한 useEffect
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!currentPath.startsWith('/feed/create')) return

    const updateHeaderButton = () => {
      const header = document.querySelector('header[class*="fixed"]')
      if (!header) return

      // 오른쪽 섹션 찾기 (justify-end 클래스를 가진 div)
      const rightSection = header.querySelector('div[class*="justify-end"]')
      if (!rightSection) return

      // 기존 버튼 찾기 (다음 또는 작성)
      const existingNextButton = rightSection.querySelector('[data-create-next-button]') as HTMLButtonElement | null
      const existingPostButton = rightSection.querySelector('[data-create-post-button]') as HTMLButtonElement | null

      if (currentPage === 1) {
        // 페이지 1: 다음 버튼 표시
        // 작성 버튼 제거
        if (existingPostButton) {
          existingPostButton.remove()
        }
        
        if (existingNextButton) {
          // 기존 다음 버튼이 있으면 내용만 업데이트
          const isDisabled = selectedMedia.length === 0
          existingNextButton.className = `text-sm font-semibold flex-1 text-right transition-colors ${
            isDisabled 
              ? 'text-gray-400 cursor-not-allowed' 
              : 'text-[#FE3A8F] cursor-pointer'
          }`
          existingNextButton.disabled = isDisabled
          existingNextButton.textContent = '다음'
          existingNextButton.onclick = (e: Event) => {
            e.preventDefault()
            if (!isDisabled) {
              handleNext()
            }
          }
        } else {
          // 버튼이 없으면 새로 생성
          const nextButton = document.createElement('button')
          nextButton.setAttribute('data-create-next-button', 'true')
          const isDisabled = selectedMedia.length === 0
          nextButton.className = `text-sm font-semibold flex-1 text-right transition-colors ${
            isDisabled 
              ? 'text-gray-400 cursor-not-allowed' 
              : 'text-[#FE3A8F] cursor-pointer'
          }`
          nextButton.disabled = isDisabled
          nextButton.textContent = '다음'
          nextButton.onclick = (e: Event) => {
            e.preventDefault()
            if (!isDisabled) {
              handleNext()
            }
          }
          rightSection.appendChild(nextButton)
        }
      } else if (currentPage === 2) {
        // 페이지 2: 작성 버튼 표시
        // 다음 버튼 제거
        if (existingNextButton) {
          existingNextButton.remove()
        }
        
        if (existingPostButton) {
          // 기존 작성 버튼이 있으면 그대로 유지
        } else {
          // 버튼이 없으면 새로 생성
          const postButton = document.createElement('button')
          postButton.setAttribute('data-create-post-button', 'true')
          postButton.className = 'flex-1 text-right text-sm font-semibold text-[#FE3A8F]'
          postButton.textContent = '작성'
          postButton.onclick = (e: Event) => {
            e.preventDefault()
            handlePostSubmit()
          }
          rightSection.appendChild(postButton)
        }
      }
    }

    const timer = setTimeout(updateHeaderButton, 0)

    return () => {
      clearTimeout(timer)
    }
  }, [currentPath, currentPage, selectedMedia.length, handleNext, selectedMedia, caption, postType, pointPrice, selectedMembershipId, handlePostSubmit])


  // 스와이퍼 터치 이벤트 핸들러
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX
  }

  const handleTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return
    
    const distance = touchStartX.current - touchEndX.current
    const minSwipeDistance = 50

    if (Math.abs(distance) > minSwipeDistance) {
      if (distance > 0 && selectedIndex < selectedMedia.length - 1) {
        // 왼쪽으로 스와이프 (다음)
        setSelectedIndex(selectedIndex + 1)
      } else if (distance < 0 && selectedIndex > 0) {
        // 오른쪽으로 스와이프 (이전)
        setSelectedIndex(selectedIndex - 1)
      }
    }

    touchStartX.current = 0
    touchEndX.current = 0
  }

  // 페이지 1 렌더링 (인스타그램 스타일)
  const renderPage1 = () => {
    const minGalleryHeight = 300 // 갤러리 최소 높이
    const maxGalleryHeight = typeof window !== 'undefined' ? window.innerHeight * 0.8 : 600 // 뷰포트 80%

    return (
    <div className="relative h-full bg-white overflow-hidden">
      {/* 상단: 선택된 미디어 큰 화면 (스와이퍼) - 전체 높이 */}
      <div 
        ref={swipeContainerRef}
        className="absolute inset-0 flex items-center justify-center overflow-hidden bg-white"
        style={{ 
          bottom: `${minGalleryHeight}px`, // 기본 갤러리 높이만큼 여백
          zIndex: 1,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {selectedMedia.length > 0 ? (
          <div 
            className="flex h-full w-full transition-transform duration-300 ease-out"
            style={{
              transform: `translateX(-${selectedIndex * 100}%)`,
              width: `${selectedMedia.length * 100}%`,
            }}
          >
            {selectedMedia.map((media, index) => (
              <div
                key={index}
                className="w-full h-full flex-shrink-0 flex items-center justify-center relative"
                style={{ height: '100%' }}
              >
                {media.type === 'video' ? (
                  // 비디오 프리뷰 (커스텀 컨트롤)
                  (() => {
                    // 파일 키로 저장된 Blob URL 찾기
                    const fileKey = media.file ? `${media.file.name}-${media.file.size}-${media.file.lastModified}` : ''
                    
                    // ref에 없으면 즉시 생성
                    if (media.file && !videoBlobUrlsRef.current[fileKey]) {
                      videoBlobUrlsRef.current[fileKey] = URL.createObjectURL(media.file)
                    }
                    
                    const videoSrc = media.nativeIdentifier && videoUrls[media.nativeIdentifier]
                      ? videoUrls[media.nativeIdentifier]
                      : videoBlobUrlsRef.current[fileKey] || null
                    
                    const isLoading = media.nativeIdentifier && !videoUrls[media.nativeIdentifier]
                    
                    if (isLoading) {
                      return (
                        <>
                          <img
                            src={media.preview}
                            alt={`미리보기 ${index + 1}`}
                            className="w-full h-full object-contain"
                            style={{ maxHeight: '100%', objectFit: 'contain' }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <div className="w-16 h-16 rounded-full bg-white/80 flex items-center justify-center animate-pulse">
                              <div className="w-6 h-6 border-2 border-[#110f1a] border-t-transparent rounded-full animate-spin" />
                            </div>
                          </div>
                        </>
                      )
                    }
                    
                    return (
                      <div className="relative w-full h-full">
                        <video
                          ref={(el) => { videoRefs.current[index] = el }}
                          src={videoSrc}
                          autoPlay
                          muted={videoMuted[index] !== false}
                          loop
                          playsInline
                          className="w-full h-full object-contain"
                          style={{ maxHeight: '100%', objectFit: 'contain' }}
                          onTimeUpdate={() => handleVideoTimeUpdate(index)}
                          onLoadedMetadata={() => handleVideoLoadedMetadata(index)}
                        />
                        
                        {/* 소리 토글 버튼 (오른쪽 하단) */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleVideoMute(index)
                          }}
                          className="absolute bottom-16 right-3 w-8 h-8 rounded-full bg-black/60 flex items-center justify-center z-20"
                        >
                          {videoMuted[index] !== false ? (
                            <VolumeX className="w-4 h-4 text-white" />
                          ) : (
                            <Volume2 className="w-4 h-4 text-white" />
                          )}
                        </button>
                        
                        {/* 프로그레스바 (하단) */}
                        <div 
                          className="absolute bottom-0 left-0 right-0 h-8 flex items-end px-3 pb-3 z-20"
                          onMouseDown={(e) => handleProgressDragStart(index, e)}
                          onTouchStart={(e) => handleProgressDragStart(index, e)}
                          onMouseMove={(e) => {
                            if (isDraggingProgress) {
                              const rect = e.currentTarget.getBoundingClientRect()
                              handleProgressChange(index, e.clientX, rect)
                            }
                          }}
                          onTouchMove={(e) => {
                            if (isDraggingProgress) {
                              const rect = e.currentTarget.getBoundingClientRect()
                              handleProgressChange(index, e.touches[0].clientX, rect)
                            }
                          }}
                          onMouseUp={() => setIsDraggingProgress(false)}
                          onMouseLeave={() => setIsDraggingProgress(false)}
                          onTouchEnd={() => setIsDraggingProgress(false)}
                        >
                          <div className="w-full h-1 bg-white/30 rounded-full overflow-hidden cursor-pointer">
                            <div 
                              className="h-full bg-white rounded-full transition-all duration-100"
                              style={{ width: `${(videoProgress[index] || 0) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )
                  })()
                ) : (
                  // 이미지
                  <img
                    src={media.preview}
                    alt={`미리보기 ${index + 1}`}
                    className="w-full h-full object-contain"
                    style={{ maxHeight: '100%', objectFit: 'contain' }}
                  />
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-500">
            <Camera className="h-16 w-16 mx-auto mb-4 opacity-50" />
            <p className="text-sm">사진을 선택해주세요</p>
          </div>
        )}
        {/* 선택된 미디어 인덱스 표시 */}
        {selectedMedia.length > 1 && (
          <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-1 z-10">
            {selectedMedia.map((_, index) => (
              <div
                key={index}
                className={`h-1 rounded-full transition-all ${
                  selectedIndex === index ? 'w-6 bg-[#110f1a]' : 'w-1 bg-[#110f1a]/50'
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* 하단: 갤러리 리스트 (스크롤 가능) - 프리뷰 위로 덮힘 */}
      <div 
        className="absolute left-0 right-0 bottom-0 border-t border-gray-200 bg-white flex flex-col shadow-[0_-4px_20px_rgba(0,0,0,0.1)]"
        style={{ 
          height: `${galleryHeight}px`,
          maxHeight: `${maxGalleryHeight}px`,
          // 드래그 중이거나 스크롤로 높이 증가 중에는 트랜지션 없음
          // 맨 위로 복원할 때만 부드러운 트랜지션
          transition: (isDraggingHeader || isScrollingGallery) ? 'none' : 'height 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          zIndex: 10,
        }}
      >
        {/* 갤러리 헤더 - 드래그 핸들 + 앨범 선택 */}
        <div 
          className="flex-shrink-0 cursor-ns-resize select-none"
          onMouseDown={(e) => handleHeaderDragStart(e.clientY)}
          onTouchStart={(e) => handleHeaderDragStart(e.touches[0].clientY)}
        >
          {/* 드래그 핸들 바 */}
          <div className="flex justify-center py-2">
            <div className="w-10 h-1 rounded-full bg-gray-300" />
          </div>
          
          {/* 앨범 선택 */}
          <div className="px-4 pb-2 flex items-center justify-between border-b border-gray-200">
            <button
              onClick={(e) => {
                e.stopPropagation()
                Capacitor.isNativePlatform() && albums.length > 0 && setShowAlbumPicker(true)
              }}
              className="flex items-center gap-1 text-sm font-medium text-[#110f1a]"
            >
              <span>{selectedAlbum?.title || '최근 항목'}</span>
              {Capacitor.isNativePlatform() && albums.length > 0 && (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
            {totalPhotoCount > 0 && (
              <span className="text-xs text-gray-400">{totalPhotoCount}개</span>
            )}
          </div>
        </div>

        {/* 갤러리 그리드 (스크롤 가능) */}
        <div 
          ref={galleryScrollRef}
          className="p-2 bg-white overflow-y-auto flex-1" 
          onScroll={handleGalleryScroll}
        >
          {isLoadingGallery ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FE3A8F]" />
            </div>
          ) : galleryImages.length === 0 && selectedMedia.length === 0 ? (
            <div className="grid grid-cols-4 gap-1">
              {/* 카메라 버튼 */}
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="aspect-square bg-gray-100 rounded flex items-center justify-center cursor-pointer border border-gray-300 hover:bg-gray-200 transition-colors"
              >
                <Camera className="h-6 w-6 text-[#110f1a]" />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*,video/*"
                  capture="environment"
                  onChange={handleCameraCapture}
                  className="hidden"
                />
              </button>
              {/* 빈 슬롯들 - 클릭 시 사진 선택 */}
              {[...Array(7)].map((_, i) => (
                <div
                  key={i}
                  onClick={() => {
                    if (Capacitor.isNativePlatform()) {
                      handleAddMoreImages()
                    } else {
                      fileInputRef.current?.click()
                    }
                  }}
                  className="aspect-square bg-gray-100 rounded flex items-center justify-center cursor-pointer hover:bg-gray-200 transition-colors"
                >
                  <Plus className="h-6 w-6 text-gray-400" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-1">
              {/* 카메라 촬영 버튼 */}
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="aspect-square bg-gray-100 rounded flex items-center justify-center cursor-pointer border border-gray-300 hover:bg-gray-200 transition-colors"
              >
                <Camera className="h-6 w-6 text-[#110f1a]" />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*,video/*"
                  capture="environment"
                  onChange={handleCameraCapture}
                  className="hidden"
                />
              </button>

              {/* 선택된 미디어와 갤러리 이미지를 합쳐서 표시 (갤러리 순서 유지, 선택된 항목은 표시만) */}
              {(() => {
                // galleryImages를 기준으로 하되, 선택된 항목은 표시
                // 선택된 미디어는 갤러리에서 찾아서 표시하되, 갤러리 순서는 유지
                const selectedKeys = new Set(selectedMedia.map(s => `${s.file.name}-${s.file.size}`))
                
                // 갤러리 이미지 순서 유지하면서 선택된 항목 표시
                return galleryImages.map((media, index) => {
                  const mediaKey = `${media.file.name}-${media.file.size}`
                  const isInSelected = selectedKeys.has(mediaKey)
                  
                  // selectedMedia에서 정확한 인덱스 찾기 (같은 파일이 여러 개 있을 수 있으므로 주의)
                  let selectedIndexInSelected = -1
                  if (isInSelected) {
                    // selectedMedia에서 해당 미디어의 인덱스 찾기
                    selectedIndexInSelected = selectedMedia.findIndex(
                      s => s.file.name === media.file.name && s.file.size === media.file.size
                    )
                  }
                  
                  const isSelected = isInSelected && selectedIndexInSelected >= 0 && selectedIndex === selectedIndexInSelected
                  
                  return (
                    <div
                      key={`media-${index}-${media.file.name}-${media.file.size}`}
                      className={`relative aspect-square rounded overflow-hidden cursor-pointer border-2 ${
                        isInSelected ? 'border-[#FE3A8F]' : 'border-transparent'
                      }`}
                      onClick={() => {
                        if (isInSelected && selectedIndexInSelected >= 0) {
                          // 이미 선택된 미디어면 토글하여 제거
                          const currentSelectedIndex = selectedIndex
                          removeSelectedMedia(selectedIndexInSelected)
                          
                          // 제거 후 인덱스 조정 (상태 업데이트 후 실행)
                          setTimeout(() => {
                            const newSelectedMedia = useCreatePostStore.getState().selectedMedia
                            if (selectedIndexInSelected < currentSelectedIndex) {
                              // 현재 선택된 인덱스보다 앞의 항목이 제거되면 인덱스 감소
                              setSelectedIndex(Math.max(0, currentSelectedIndex - 1))
                            } else if (selectedIndexInSelected === currentSelectedIndex) {
                              // 현재 선택된 항목이 제거되면 다음 항목 선택 (없으면 이전 항목)
                              const newLength = newSelectedMedia.length
                              setSelectedIndex(newLength > 0 ? Math.min(currentSelectedIndex, newLength - 1) : 0)
                            }
                          }, 0)
                        } else {
                          // 갤러리에서 클릭하면 선택에 추가 (순서대로)
                          const currentLength = selectedMedia.length
                          if (currentLength >= 10) {
                            alert('최대 10개의 파일만 업로드할 수 있습니다.')
                            return
                          }
                          addSelectedMedia([media])
                          // 추가된 항목으로 자동 선택 (상태 업데이트 후 실행)
                          setTimeout(() => {
                            setSelectedIndex(currentLength)
                          }, 0)
                        }
                      }}
                    >
                      {/* 썸네일 표시 */}
                      {media.type === 'video' ? (
                        <>
                          {/* 동영상: video 태그로 첫 프레임 표시 */}
                          {(() => {
                            const fileKey = media.file ? `${media.file.name}-${media.file.size}-${media.file.lastModified}` : ''
                            if (media.file && !videoBlobUrlsRef.current[fileKey]) {
                              videoBlobUrlsRef.current[fileKey] = URL.createObjectURL(media.file)
                            }
                            const videoSrc = videoBlobUrlsRef.current[fileKey]
                            return videoSrc ? (
                              <video
                                src={videoSrc}
                                muted
                                playsInline
                                preload="metadata"
                                className="w-full h-full object-cover"
                                onLoadedData={(e) => {
                                  // 첫 프레임 표시를 위해 0.1초로 이동
                                  const video = e.currentTarget
                                  if (video.currentTime === 0) {
                                    video.currentTime = 0.1
                                  }
                                }}
                              />
                            ) : (
                              <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                                  <div className="w-0 h-0 border-t-4 border-t-transparent border-l-6 border-l-white border-b-4 border-b-transparent ml-0.5" />
                                </div>
                              </div>
                            )
                          })()}
                          {/* 비디오 아이콘 오버레이 */}
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-8 h-8 rounded-full bg-black/50 flex items-center justify-center">
                              <div className="w-0 h-0 border-t-4 border-t-transparent border-l-6 border-l-white border-b-4 border-b-transparent ml-0.5" />
                            </div>
                          </div>
                        </>
                      ) : (
                        /* 이미지: img 태그로 표시 */
                        <img
                          src={media.preview}
                          alt={`미디어 ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      )}
                      {/* 선택된 미디어는 항상 분홍색 백그라운드와 순서 번호 표시 */}
                      {isInSelected && selectedIndexInSelected >= 0 && (
                        <div className="absolute inset-0 flex items-center justify-center bg-[#FE3A8F]/20">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                            isSelected ? 'bg-[#FE3A8F]' : 'bg-[#FE3A8F]/80'
                          }`}>
                            <span className="text-white text-xs font-bold">{selectedIndexInSelected + 1}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              })()}

              {/* 사진 추가 버튼 (10개 미만일 때만 표시) */}
              {selectedMedia.length < 10 && (
                <button
                  onClick={() => {
                    if (Capacitor.isNativePlatform()) {
                      handleAddMoreImages()
                    } else {
                      fileInputRef.current?.click()
                    }
                  }}
                  className="aspect-square bg-gray-100 rounded flex items-center justify-center cursor-pointer border border-dashed border-gray-300 hover:bg-gray-200 transition-colors"
                >
                  <Plus className="h-6 w-6 text-gray-500" />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </button>
              )}
              
              {/* 무한 스크롤 로딩 인디케이터 */}
              {isLoadingMore && (
                <div className="col-span-4 py-4 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#FE3A8F]" />
            </div>
          )}
              
              {/* 더 이상 로드할 사진 없음 */}
              {!hasMorePhotos && galleryImages.length > 0 && !isLoadingMore && (
                <div className="col-span-4 py-2 text-center text-xs text-gray-400">
                  모든 사진을 불러왔습니다
        </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
    )
  }


  // 내 멤버쉽 플랜 목록 로드
  const loadMemberships = async () => {
    if (!user?.id) return
    
    setIsLoadingMemberships(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-membership`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
        }
      )

      if (response.ok) {
        const result = await response.json()
        if (result.success && result.data) {
          const membershipList = result.data
            .filter((m: any) => m.is_active)
            .map((m: any) => ({
              id: m.id,
              name: m.name,
              description: m.description,
            }))
          setMemberships(membershipList)
        }
      }
    } catch (error) {
      console.error('멤버쉽 목록 로드 실패:', error)
    } finally {
      setIsLoadingMemberships(false)
    }
  }

  // 페이지 2 스와이퍼 터치 이벤트 핸들러
  const handlePage2TouchStart = (e: React.TouchEvent) => {
    page2TouchStartX.current = e.touches[0].clientX
  }

  const handlePage2TouchMove = (e: React.TouchEvent) => {
    page2TouchEndX.current = e.touches[0].clientX
  }

  const handlePage2TouchEnd = () => {
    if (!page2TouchStartX.current || !page2TouchEndX.current) return
    
    const distance = page2TouchStartX.current - page2TouchEndX.current
    const minSwipeDistance = 50

    if (Math.abs(distance) > minSwipeDistance) {
      if (distance > 0 && selectedIndex < selectedMedia.length - 1) {
        // 왼쪽으로 스와이프 (다음)
        setSelectedIndex(selectedIndex + 1)
      } else if (distance < 0 && selectedIndex > 0) {
        // 오른쪽으로 스와이프 (이전)
        setSelectedIndex(selectedIndex - 1)
      }
    }

    page2TouchStartX.current = 0
    page2TouchEndX.current = 0
  }

  // 페이지 2 렌더링
  const renderPage2 = () => (
    <div className="flex flex-col h-full">
      {/* 스와이퍼와 캡션 영역을 flex로 배치 */}
      <div className="flex gap-4 p-4">
        {/* 미디어 슬라이드 (스와이퍼) - 작은 크기 */}
        <div 
          ref={page2SwipeContainerRef}
          className="w-24 h-24 flex-shrink-0 relative overflow-hidden rounded-lg bg-gray-100"
          onTouchStart={handlePage2TouchStart}
          onTouchMove={handlePage2TouchMove}
          onTouchEnd={handlePage2TouchEnd}
        >
        {selectedMedia.length > 0 && (
          <>
            <div
              className="flex h-full transition-transform duration-300 ease-out"
              style={{
                transform: `translateX(-${selectedIndex * (100 / selectedMedia.length)}%)`,
                width: `${selectedMedia.length * 100}%`,
              }}
            >
              {selectedMedia.map((media, index) => (
                <div
                  key={index}
                  className="flex-shrink-0 flex items-center justify-center relative"
                  style={{ 
                    width: `${100 / selectedMedia.length}%`,
                    height: '100%',
                    minWidth: 0,
                    minHeight: 0
                  }}
                >
                    {/* 썸네일 표시 */}
                  {media.type === 'video' ? (
                    <>
                      {(() => {
                        const fileKey = media.file ? `${media.file.name}-${media.file.size}-${media.file.lastModified}` : ''
                        if (media.file && !videoBlobUrlsRef.current[fileKey]) {
                          videoBlobUrlsRef.current[fileKey] = URL.createObjectURL(media.file)
                        }
                        const videoSrc = videoBlobUrlsRef.current[fileKey]
                        return videoSrc ? (
                          <video
                            src={videoSrc}
                            muted
                            playsInline
                            preload="metadata"
                            className="w-full h-full object-cover"
                            onLoadedData={(e) => {
                              const video = e.currentTarget
                              if (video.currentTime === 0) {
                                video.currentTime = 0.1
                              }
                            }}
                          />
                        ) : (
                          <div className="w-full h-full bg-gray-800" />
                        )
                      })()}
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="w-6 h-6 rounded-full bg-black/50 flex items-center justify-center">
                          <div className="w-0 h-0 border-t-3 border-t-transparent border-l-4 border-l-white border-b-3 border-b-transparent ml-0.5" />
                        </div>
                      </div>
                    </>
                  ) : (
                    <img
                      src={media.preview}
                      alt={`미디어 ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
              ))}
            </div>

            {/* 슬라이드 인디케이터 - 작은 크기에 맞게 조정 */}
            {selectedMedia.length > 1 && (
              <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 flex gap-1">
                {selectedMedia.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedIndex(index)}
                    className={`h-1 rounded-full transition-all ${
                      selectedIndex === index
                        ? 'w-3 bg-white'
                        : 'w-1 bg-white/50'
                    }`}
                    aria-label={`슬라이드 ${index + 1}`}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

        {/* 캡션 영역 - flex로 배치 */}
        <div className="flex-1 flex flex-col">
          <textarea
            ref={captionTextareaRef}
            value={caption}
            onInput={(e) => {
              // onInput은 composition과 무관하게 항상 최신 값을 제공
              const newValue = e.currentTarget.value
              setCaption(newValue)
            }}
            onCompositionStart={() => {
              isComposingRef.current = true
            }}
            onCompositionEnd={(e) => {
              isComposingRef.current = false
              // composition 완료 후 최종 값 업데이트
              const finalValue = e.currentTarget.value
              setCaption(finalValue)
            }}
            onChange={(e) => {
              // onChange는 onInput의 fallback으로 사용
              if (!isComposingRef.current) {
                setCaption(e.currentTarget.value)
              }
            }}
            placeholder="캡션 추가..."
            className="w-full flex-1 resize-none border-none outline-none text-sm text-[#110f1a] placeholder:text-gray-400"
            rows={4}
          />
        </div>
      </div>

      {/* 공개 대상 */}
      <div className="border-t border-gray-200 pt-4 px-4 pb-4">
        <button
          onClick={() => {
            setShowPostTypeModal(true)
            // 모달이 열릴 때 멤버쉽 목록 로드 (멤버쉽 설정이 필요한 경우)
            if (user?.id && memberships.length === 0) {
              loadMemberships()
            }
          }}
          className="w-full flex items-center justify-between py-3 hover:border-[#FE3A8F] transition-colors bg-white"
        >
          <div className="flex items-center gap-3">
            {postType === 'free' ? (
              <Globe className="h-5 w-5 text-[#110f1a]" />
            ) : postType === 'follow' ? (
              <UserPlus className="h-5 w-5 text-[#110f1a]" />
            ) : hasPaid && hasMembership ? (
              <Lock className="h-5 w-5 text-[#110f1a]" />
            ) : hasPaid ? (
              <Lock className="h-5 w-5 text-[#110f1a]" />
            ) : (
              <Users className="h-5 w-5 text-[#110f1a]" />
            )}
            <div className="text-left">
              <div className="text-sm font-medium text-[#110f1a]">
                {postType === 'free' 
                  ? '전체 공개'
                  : postType === 'follow'
                  ? '팔로우'
                  : hasPaid && hasMembership
                  ? '단건 구매 + 멤버쉽'
                  : hasPaid
                  ? '단건 구매'
                  : '멤버쉽 전용'}
              </div>
              {postType === 'follow' && followPointPrice > 0 && (
                <div className="text-xs text-gray-500">{followPointPrice}P</div>
              )}
              {postType !== 'follow' && hasPaid && pointPrice > 0 && (
                <div className="text-xs text-gray-500">{pointPrice}P</div>
              )}
              {postType !== 'follow' && hasMembership && selectedMembershipId && (
                <div className="text-xs text-gray-500">
                  {memberships.find(m => m.id === selectedMembershipId)?.name || '멤버쉽 선택됨'}
                </div>
              )}
            </div>
          </div>
          <ChevronRight className="h-5 w-5 text-gray-400" />
        </button>
      </div>

      {/* 공개 대상 슬라이드 팝업 */}
      <SlideSheet
        isOpen={showPostTypeModal}
        onClose={() => setShowPostTypeModal(false)}
        title="공개 대상"
      >
        <div className="flex flex-col h-full">
            <div className="flex-1 overflow-y-auto px-6">
              <div className="space-y-6">
              {/* 전체 공개 / 팔로우 / 비공개 선택 */}
              <div className="space-y-5">
                <label className="flex items-center gap-3 cursor-pointer hover:border-[#FE3A8F] transition-colors">
                  <div className="flex items-center gap-3 flex-1">
                    <Globe className="h-5 w-5 text-[#110f1a]" />
                    <div className="flex-1">
                      <div className="font-medium text-[#110f1a]">전체 공개</div>
                      <div className="text-sm text-gray-500">모든 사용자가 볼 수 있습니다</div>
                    </div>
                  </div>
                  <input
                    type="radio"
                    name="postType"
                    checked={!tempIsPrivate && !tempIsFollow}
                    onChange={() => {
                      setTempIsPrivate(false)
                      setTempIsFollow(false)
                      setTempHasPaid(false)
                      setTempHasMembership(false)
                      // 전체 공개: 모든 가격/멤버쉽 관련 값 초기화
                      setTempPointPrice(0)
                      setTempFollowPointPrice(0)
                      setTempSelectedMembershipId(null)
                      setTempDiscountRate(0)
                      setTempMediaPrices({})
                      setTempMediaMemberships({})
                    }}
                    className="w-5 h-5 custom-radio"
                  />
                </label>

                <div>
                  <label className="flex items-center gap-3 cursor-pointer hover:border-[#FE3A8F] transition-colors">
                    <div className="flex items-center gap-3 flex-1">
                      <UserPlus className="h-5 w-5 text-[#110f1a]" />
                      <div className="flex-1">
                        <div className="font-medium text-[#110f1a]">팔로우</div>
                        <div className="text-sm text-gray-500">팔로우한 사용자에게 채팅으로 전송됩니다</div>
                      </div>
                    </div>
                    <input
                      type="radio"
                      name="postType"
                      checked={tempIsFollow}
                      onChange={() => {
                        setTempIsFollow(true)
                        setTempIsPrivate(false)
                        setTempHasPaid(false)
                        setTempHasMembership(false)
                        // 팔로우 선택: 비공개 관련 값 초기화
                        setTempPointPrice(0)
                        setTempSelectedMembershipId(null)
                        setTempMediaPrices({})
                        setTempMediaMemberships({})
                      }}
                      className="w-5 h-5 custom-radio"
                    />
                  </label>
                  
                  {/* 팔로우 선택 시 point_price 입력 필드 (별도 변수) */}
                  {tempIsFollow && (
                    <div className="mt-3 space-y-3">
                      <div className="p-3 rounded-lg border border-gray-200">
                        {/* 팔로우는 무조건 일괄 판매 */}
                        <div>
                          <div className="text-sm font-medium text-[#110f1a]">포인트 가격 설정</div>
                          <p className="text-xs text-[#FE3A8F] mb-2">
                            0P로 설정하면 공개 게시물로 전환됩니다
                          </p>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              value={tempFollowPointPrice || ''}
                              onChange={(e) => {
                                const value = e.target.value.replace(/[^0-9]/g, '')
                                setTempFollowPointPrice(Number(value) || 0)
                              }}
                              onWheel={(e) => e.currentTarget.blur()}
                              onKeyDown={(e) => {
                                // 숫자, 백스페이스, 삭제, 탭, 화살표 키만 허용
                                if (!/[0-9]/.test(e.key) && !['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && !(e.ctrlKey || e.metaKey)) {
                                  e.preventDefault()
                                }
                              }}
                              placeholder="가격 입력"
                              min="0"
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm"
                            />
                            <span className="text-sm text-gray-500">P</span>
                          </div>
                        </div>

                        {/* 할인율 설정 */}
                        <div className="my-3">
                          <div className="text-sm font-medium text-[#110f1a] mb-2">할인율</div>
                          <div className="flex items-center gap-2">
                            <select
                              value={tempDiscountRate || 0}
                              onChange={(e) => setTempDiscountRate(Number(e.target.value) || 0)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm"
                            >
                              {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((rate) => (
                                <option key={rate} value={rate}>
                                  {rate}
                                </option>
                              ))}
                            </select>
                            <span className="text-sm text-gray-500">%</span>
                          </div>
                        </div>

                        {/* 개별 가격 설정 (화면 표시용) */}
                        <div className="mt-4 space-y-3">
                          <div>
                            <div className="text-sm font-medium text-[#110f1a]">각 콘텐츠별 가격 설정</div>
                            <p className="text-xs text-pink-500 mt-1">
                              화면에 노출될 개별 가격을 설정해주세요
                            </p>
                          </div>
                          {selectedMedia.map((media, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <div className="w-12 h-12 rounded overflow-hidden flex-shrink-0">
                                {media.type === 'image' ? (
                                  <img src={media.preview} alt={`미디어 ${index + 1}`} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                                    <div className="w-0 h-0 border-t-3 border-t-transparent border-l-4 border-l-white border-b-3 border-b-transparent ml-0.5" />
                                  </div>
                                )}
                              </div>
                              <input
                                type="number"
                                value={tempMediaPrices[index] || ''}
                                onChange={(e) => {
                                  const value = e.target.value.replace(/[^0-9]/g, '')
                                  setTempMediaPrices({ ...tempMediaPrices, [index]: Number(value) || 0 })
                                }}
                                onWheel={(e) => e.currentTarget.blur()}
                                onKeyDown={(e) => {
                                  // 숫자, 백스페이스, 삭제, 탭, 화살표 키만 허용
                                  if (!/[0-9]/.test(e.key) && !['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && !(e.ctrlKey || e.metaKey)) {
                                    e.preventDefault()
                                  }
                                }}
                                placeholder={`가격`}
                                min="0"
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                              />
                              <span className="text-sm text-gray-500">P</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <label className="flex items-center gap-3 cursor-pointer hover:border-[#FE3A8F] transition-colors">
                  <div className="flex items-center gap-3 flex-1">
                    <Lock className="h-5 w-5 text-[#110f1a]" />
                    <div className="flex-1">
                      <div className="font-medium text-[#110f1a]">비공개</div>
                      <div className="text-sm text-gray-500">제한된 사용자만 볼 수 있습니다</div>
                    </div>
                  </div>
                  <input
                    type="radio"
                    name="postType"
                    checked={tempIsPrivate && !tempIsFollow}
                    onChange={() => {
                      setTempIsPrivate(true)
                      setTempIsFollow(false)
                      // 비공개 선택: 팔로우 관련 값 초기화
                      setTempFollowPointPrice(0)
                      setTempMediaPrices({})
                      setTempDiscountRate(0)
                      // 비공개 선택 시 기본값은 단건 구매
                      if (!tempHasPaid && !tempHasMembership) {
                        setTempHasPaid(true)
                      }
                    }}
                    className="w-5 h-5 custom-radio"
                  />
                </label>
              </div>

              {/* 비공개 선택 시 추가 옵션 */}
              {tempIsPrivate && (
                <div className="space-y-4">
                  {/* 단건 구매 Switch */}
                  <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-[#110f1a]">단건 구매</div>
                      <div className="text-xs text-gray-500">포인트를 지불한 사용자만 볼 수 있습니다</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const newValue = !tempHasPaid
                        setTempHasPaid(newValue)
                        if (!newValue && !tempHasMembership) {
                          setTempIsPrivate(false)
                        }
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        tempHasPaid ? 'bg-[#FE3A8F]' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          tempHasPaid ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* 단건 구매 설정 */}
                  {tempHasPaid && (
                    <div className="mt-3 space-y-3 p-3 rounded-lg border border-gray-200 bg-gray-50">
                      {/* 일괄/개별 판매 선택 - 탭바 형태 */}
                      <div className="relative flex items-center bg-gray-100 rounded-lg p-1">
                        <button
                          type="button"
                          onClick={() => setTempIsBulkSale(true)}
                          className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all duration-200 ${
                            tempIsBulkSale
                              ? 'bg-white text-[#FE3A8F] shadow-sm'
                              : 'text-gray-600'
                          }`}
                        >
                          일괄 판매
                        </button>
                        <button
                          type="button"
                          onClick={() => setTempIsBulkSale(false)}
                          className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all duration-200 ${
                            !tempIsBulkSale
                              ? 'bg-white text-[#FE3A8F] shadow-sm'
                              : 'text-gray-600'
                          }`}
                        >
                          개별 판매
                        </button>
                      </div>

                      {tempIsBulkSale ? (
                        // 일괄 판매: 기존처럼 point_price만 설정
                        <div>
                          <div className="text-sm font-medium text-[#110f1a]">포인트 가격</div>
                          <p className="text-xs text-[#FE3A8F] mb-2">
                            0P로 설정하면 공개 게시물로 전환됩니다
                          </p>
                          <input
                            type="number"
                            value={tempPointPrice || ''}
                            onChange={(e) => {
                              const value = e.target.value.replace(/[^0-9]/g, '')
                              setTempPointPrice(Number(value) || 0)
                            }}
                            onWheel={(e) => e.currentTarget.blur()}
                            onKeyDown={(e) => {
                              // 숫자, 백스페이스, 삭제, 탭, 화살표 키만 허용
                              if (!/[0-9]/.test(e.key) && !['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && !(e.ctrlKey || e.metaKey)) {
                                e.preventDefault()
                              }
                            }}
                            placeholder="가격 입력 (P)"
                            min="0"
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>
                      ) : (
                        // 개별 판매: 각 미디어별 가격 설정
                        <div className="space-y-3">
                          {/* 할인율 설정 (공통) */}
                          <div>
                            <div className="text-sm font-medium text-[#110f1a] mb-2">할인율</div>
                            <div className="flex items-center gap-2">
                              <select
                                  value={tempDiscountRate || 0}
                                  onChange={(e) => setTempDiscountRate(Number(e.target.value) || 0)}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm"
                                >
                                  {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((rate) => (
                                    <option key={rate} value={rate}>
                                      {rate}
                                    </option>
                                  ))}
                                </select>
                                <span className="text-sm text-gray-500">%</span>
                            </div>
                            <p className="text-xs text-pink-500 mt-1">
                              Tip. 할인율을 설정하면 같은 가격이어도 사용자의 구매 욕구가 올라가요
                            </p>
                          </div>
                          <div className="mb-2">
                            <div className="text-sm font-medium text-[#110f1a]">각 콘텐츠별 가격 설정</div>
                            <p className="text-xs text-gray-500 mt-1">
                              화면에 노출될 개별 가격을 설정해주세요
                            </p>
                          </div>
                          {selectedMedia.map((media, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <div className="w-12 h-12 rounded overflow-hidden flex-shrink-0">
                                {media.type === 'image' ? (
                                  <img src={media.preview} alt={`미디어 ${index + 1}`} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                                    <div className="w-0 h-0 border-t-3 border-t-transparent border-l-4 border-l-white border-b-3 border-b-transparent ml-0.5" />
                                  </div>
                                )}
                              </div>
                              <input
                                type="number"
                                value={tempMediaPrices[index] || ''}
                                onChange={(e) => {
                                  setTempMediaPrices({ ...tempMediaPrices, [index]: Number(e.target.value) || 0 })
                                }}
                                placeholder={`가격`}
                                min="0"
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                              />
                              <span className="text-sm text-gray-500">P</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 멤버쉽 Switch */}
                  <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-[#110f1a]">멤버쉽 전용</div>
                      <div className="text-xs text-gray-500">멤버쉽 구독자만 볼 수 있습니다</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const newValue = !tempHasMembership
                        setTempHasMembership(newValue)
                        if (!newValue && !tempHasPaid) {
                          setTempIsPrivate(false)
                        }
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        tempHasMembership ? 'bg-[#FE3A8F]' : 'bg-gray-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          tempHasMembership ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* 멤버쉽 설정 */}
                  {tempHasMembership && (
                    <div className="mt-3 space-y-3 p-3 rounded-lg border border-gray-200 bg-gray-50">
                      {/* 일괄/개별 멤버쉽 설정 선택 - 탭바 형태 */}
                      <div className="relative flex items-center bg-gray-100 rounded-lg p-1">
                        <button
                          type="button"
                          onClick={() => setTempIsBulkMembership(true)}
                          className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all duration-200 ${
                            tempIsBulkMembership
                              ? 'bg-white text-[#FE3A8F] shadow-sm'
                              : 'text-gray-600'
                          }`}
                        >
                          일괄 설정
                        </button>
                        <button
                          type="button"
                          onClick={() => setTempIsBulkMembership(false)}
                          className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-all duration-200 ${
                            !tempIsBulkMembership
                              ? 'bg-white text-[#FE3A8F] shadow-sm'
                              : 'text-gray-600'
                          }`}
                        >
                          개별 설정
                        </button>
                      </div>

                      {tempIsBulkMembership ? (
                        // 일괄 설정: post의 membership_id 설정
                        <div>
                          <div className="text-sm font-medium text-[#110f1a] mb-2">멤버쉽 선택</div>
                          {isLoadingMemberships ? (
                            <div className="text-sm text-gray-500">로딩 중...</div>
                          ) : memberships.length > 0 ? (
                            <select
                              value={tempSelectedMembershipId || ''}
                              onChange={(e) => setTempSelectedMembershipId(e.target.value || null)}
                              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm"
                            >
                              <option value="">멤버쉽 선택</option>
                              {memberships.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div className="text-sm text-gray-500">사용 가능한 멤버쉽이 없습니다</div>
                          )}
                        </div>
                      ) : (
                        // 개별 설정: 각 미디어별 멤버쉽 설정
                        <div className="space-y-3">
                          <div className="text-sm font-medium text-[#110f1a] mb-2">각 콘텐츠별 멤버쉽 설정</div>
                          {selectedMedia.map((media, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <div className="w-12 h-12 rounded overflow-hidden flex-shrink-0">
                                {media.type === 'image' ? (
                                  <img src={media.preview} alt={`미디어 ${index + 1}`} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                                    <div className="w-0 h-0 border-t-3 border-t-transparent border-l-4 border-l-white border-b-3 border-b-transparent ml-0.5" />
                                  </div>
                                )}
                              </div>
                              <select
                                value={tempMediaMemberships[index] ?? ''}
                                onChange={(e) => {
                                  setTempMediaMemberships({ ...tempMediaMemberships, [index]: e.target.value || null })
                                }}
                                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                              >
                                <option value="">멤버쉽 선택</option>
                                {memberships.map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              </div>
            </div>

          <div className="p-6 pt-4 flex-shrink-0">
              <button
                onClick={handlePostTypeConfirm}
                className="w-full py-3 bg-[#FE3A8F] text-white rounded-lg font-semibold"
              >
                확인
              </button>
            </div>
          </div>
      </SlideSheet>
    </div>
  )

  // 종료 확인 모달
  const renderExitConfirm = () => (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end">
      <div className="w-full bg-white rounded-t-2xl p-6">
        <h2 className="text-lg font-semibold text-[#110f1a] mb-4">게시물 작성을 중단하시겠어요?</h2>
        <div className="space-y-3">
          <button
            onClick={() => handleExitConfirm('delete')}
            className="w-full py-3 bg-red-500 text-white rounded-lg font-semibold"
          >
            삭제
          </button>
          <button
            onClick={() => handleExitConfirm('save')}
            className="w-full py-3 bg-gray-200 text-[#110f1a] rounded-lg font-semibold"
          >
            임시 저장
          </button>
          <button
            onClick={() => handleExitConfirm('cancel')}
            className="w-full py-3 border border-gray-300 text-[#110f1a] rounded-lg font-semibold"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  )


  return (
    <div 
      className={`${isMobile ? 'fixed inset-0' : 'min-h-screen'} bg-white flex flex-col`} 
      style={isMobile ? { paddingTop: 'calc(56px + env(safe-area-inset-top, 0px))' } : {}}
    >
      {currentPage === 1 ? renderPage1() : renderPage2()}
      {showExitConfirm && renderExitConfirm()}
      
      {/* 게시물 업로드 중 로딩 오버레이 */}
      {isSubmitting && (
        <div className="fixed inset-0 z-[99999999] bg-black/60 flex flex-col items-center justify-center">
          <div className="bg-white rounded-2xl p-8 shadow-2xl flex flex-col items-center gap-4 mx-4">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-gray-200 rounded-full" />
              <div className="absolute inset-0 w-16 h-16 border-4 border-[#FE3A8F] rounded-full border-t-transparent animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-[#110f1a]">
                {isCompressing 
                  ? compressionType === 'video' ? '동영상 압축 중' : '이미지 압축 중'
                  : '게시물 업로드 중'}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {isCompressing 
                  ? `압축 진행률: ${compressionProgress}%` 
                  : '잠시만 기다려주세요...'}
              </p>
            </div>
            <div className="w-48 h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-[#FE3A8F] to-[#FF6B9D] rounded-full transition-all duration-300" 
                style={{ width: isCompressing ? `${compressionProgress}%` : '60%' }} 
              />
            </div>
          </div>
        </div>
      )}
      
      {/* 앨범 선택 모달 */}
      {showAlbumPicker && (
        <div 
          className="fixed inset-0 z-50 bg-black/50 flex items-end"
          onClick={() => setShowAlbumPicker(false)}
        >
          <div 
            className="w-full bg-white rounded-t-2xl max-h-[60vh] flex flex-col"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#110f1a]">앨범 선택</h3>
              <button onClick={() => setShowAlbumPicker(false)}>
                <X className="h-5 w-5 text-gray-500" />
          </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {albums.map((album) => (
          <button
                  key={album.id}
                  onClick={() => handleAlbumChange(album)}
                  className={`w-full px-4 py-3 flex items-center justify-between border-b border-gray-100 ${
                    selectedAlbum?.id === album.id ? 'bg-pink-50' : ''
                  }`}
                >
                  <span className={`text-sm ${selectedAlbum?.id === album.id ? 'text-[#FE3A8F] font-medium' : 'text-[#110f1a]'}`}>
                    {album.title}
                  </span>
                  <span className="text-xs text-gray-400">{album.count}</span>
          </button>
              ))}
        </div>
      </div>
    </div>
      )}
    </div>
  )
}

