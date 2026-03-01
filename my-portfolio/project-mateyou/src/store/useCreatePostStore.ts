import { create } from 'zustand'

export interface SelectedMedia {
  file: File
  preview: string
  type: 'image' | 'video'
  nativeIdentifier?: string // 네이티브 환경에서 사용하는 미디어 식별자
  pointPrice?: number // 개별 판매 시 각 미디어별 가격
  membershipId?: string | null // 개별 설정 시 각 미디어별 멤버쉽 ID
}

interface CreatePostState {
  selectedMedia: SelectedMedia[]
  selectedIndex: number
  caption: string
  postType: 'free' | 'paid' | 'membership' | 'follow'
  hasPaid: boolean // 단건 구매 선택 여부
  hasMembership: boolean // 멤버쉽 선택 여부
  pointPrice: number // 단건 구매용 (일괄 판매 시)
  followPointPrice: number // 팔로우 전용 (별도 관리)
  selectedMembershipId: string | null // 멤버쉽 일괄 설정용
  galleryImages: SelectedMedia[]
  hasRequestedPermission: boolean
  
  // 판매 설정
  isBulkSale: boolean // true: 일괄 판매, false: 개별 판매
  isBulkMembership: boolean // true: 일괄 멤버쉽 설정, false: 개별 설정
  discountRate: number // 할인율 (0-100)
  isBundle: boolean // 묶음 판매 여부 (개별 판매 시)
  
  // Actions
  setSelectedMedia: (media: SelectedMedia[]) => void
  addSelectedMedia: (media: SelectedMedia[]) => void
  removeSelectedMedia: (index: number) => void
  setSelectedIndex: (index: number) => void
  setCaption: (caption: string) => void
  setPostType: (type: 'free' | 'paid' | 'membership' | 'follow') => void
  setHasPaid: (hasPaid: boolean) => void
  setHasMembership: (hasMembership: boolean) => void
  setPointPrice: (price: number) => void
  setFollowPointPrice: (price: number) => void
  setSelectedMembershipId: (membershipId: string | null) => void
  setGalleryImages: (images: SelectedMedia[]) => void
  addGalleryImages: (images: SelectedMedia[]) => void
  setHasRequestedPermission: (hasRequested: boolean) => void
  setIsBulkSale: (isBulk: boolean) => void
  setIsBulkMembership: (isBulk: boolean) => void
  setDiscountRate: (rate: number) => void
  setIsBundle: (isBundle: boolean) => void
  setMediaPointPrice: (index: number, price: number) => void
  setMediaMembershipId: (index: number, membershipId: string | null) => void
  clearAll: () => void
  reset: () => void
}

const initialState = {
  selectedMedia: [],
  selectedIndex: 0,
  caption: '',
  postType: 'free' as const,
  hasPaid: false,
  hasMembership: false,
  pointPrice: 0,
  followPointPrice: 0,
  selectedMembershipId: null,
  galleryImages: [],
  hasRequestedPermission: false,
  isBulkSale: true, // 기본값: 일괄 판매
  isBulkMembership: true, // 기본값: 일괄 멤버쉽 설정
  discountRate: 0,
  isBundle: false,
}

export const useCreatePostStore = create<CreatePostState>((set, get) => ({
  ...initialState,

  setSelectedMedia: (media) => {
    set({ selectedMedia: media, selectedIndex: media.length > 0 ? media.length - 1 : 0 })
  },

  addSelectedMedia: (media) => {
    const { selectedMedia } = get()
    // 중복 제거: 이미 선택된 미디어는 추가하지 않음
    const existingKeys = new Set(selectedMedia.map(s => `${s.file.name}-${s.file.size}`))
    const newMedia = media.filter(m => !existingKeys.has(`${m.file.name}-${m.file.size}`))
    
    if (newMedia.length === 0) return
    
    const updated = [...selectedMedia, ...newMedia]
    set({ 
      selectedMedia: updated, 
      selectedIndex: updated.length > 0 ? updated.length - 1 : 0 
    })
  },

  removeSelectedMedia: (index) => {
    const { selectedMedia, selectedIndex } = get()
    const updated = selectedMedia.filter((_, i) => i !== index)
    set({ 
      selectedMedia: updated,
      selectedIndex: updated.length > 0 
        ? Math.min(selectedIndex, updated.length - 1) 
        : 0
    })
  },

  setSelectedIndex: (index) => {
    set({ selectedIndex: index })
  },

  setCaption: (caption) => {
    set({ caption })
  },

  setPostType: (type) => {
    const updates: Partial<CreatePostState> = { postType: type }
    if (type === 'free') {
      updates.hasPaid = false
      updates.hasMembership = false
      updates.pointPrice = 0
      updates.selectedMembershipId = null
    } else if (type === 'paid') {
      updates.hasPaid = true
    } else if (type === 'membership') {
      updates.hasMembership = true
      updates.pointPrice = 0
    } else if (type === 'follow') {
      // 팔로우는 단건구매와 별개 - hasPaid, pointPrice 건드리지 않음
      // followPointPrice는 별도로 관리
    }
    set(updates)
  },

  setHasPaid: (hasPaid) => {
    set({ hasPaid, postType: hasPaid || get().hasMembership ? (hasPaid ? 'paid' : 'membership') : 'free' })
  },

  setHasMembership: (hasMembership) => {
    set({ 
      hasMembership, 
      postType: hasMembership || get().hasPaid ? (get().hasPaid ? 'paid' : 'membership') : 'free',
      pointPrice: hasMembership ? get().pointPrice : (get().hasPaid ? get().pointPrice : 0)
    })
  },

  setPointPrice: (price) => {
    set({ pointPrice: price })
  },

  setFollowPointPrice: (price) => {
    set({ followPointPrice: price })
  },

  setSelectedMembershipId: (membershipId) => {
    set({ selectedMembershipId: membershipId })
  },

  setGalleryImages: (images) => {
    set({ galleryImages: images })
  },

  addGalleryImages: (images) => {
    const { galleryImages } = get()
    const existing = galleryImages.map((g) => `${g.file.name}-${g.file.size}`)
    const newGallery = images.filter(
      (m) => !existing.includes(`${m.file.name}-${m.file.size}`)
    )
    // 새로 추가된 미디어를 뒤에 추가 (무한 스크롤 - 기존 순서 유지)
    set({ galleryImages: [...galleryImages, ...newGallery] })
  },

  setHasRequestedPermission: (hasRequested) => {
    set({ hasRequestedPermission: hasRequested })
  },

  setIsBulkSale: (isBulk) => {
    set({ isBulkSale: isBulk })
  },

  setIsBulkMembership: (isBulk) => {
    set({ isBulkMembership: isBulk })
  },

  setDiscountRate: (rate) => {
    set({ discountRate: Math.max(0, Math.min(100, rate)) })
  },

  setIsBundle: (isBundle) => {
    set({ isBundle })
  },

  setMediaPointPrice: (index, price) => {
    const { selectedMedia } = get()
    const updated = [...selectedMedia]
    if (updated[index]) {
      updated[index] = { ...updated[index], pointPrice: price }
      set({ selectedMedia: updated })
    }
  },

  setMediaMembershipId: (index, membershipId) => {
    const { selectedMedia } = get()
    const updated = [...selectedMedia]
    if (updated[index]) {
      updated[index] = { ...updated[index], membershipId }
      set({ selectedMedia: updated })
    }
  },

  clearAll: () => {
    // 미리보기 URL 정리
    const { selectedMedia, galleryImages } = get()
    selectedMedia.forEach((media) => URL.revokeObjectURL(media.preview))
    galleryImages.forEach((media) => URL.revokeObjectURL(media.preview))
    set(initialState)
  },

  reset: () => {
    get().clearAll()
  },
}))

