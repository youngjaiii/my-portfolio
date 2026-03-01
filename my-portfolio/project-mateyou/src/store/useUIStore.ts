import { create } from 'zustand'

interface UIState {
  isPartnerPageScrolled: boolean
  setIsPartnerPageScrolled: (scrolled: boolean) => void
  partnerHeaderName: string | null
  setPartnerHeaderName: (name: string | null) => void
  // 랭킹 팝업 상태
  isRankingSheetOpen: boolean
  setIsRankingSheetOpen: (open: boolean) => void
  // 현재 보고 있는 파트너 ID (랭킹 조회용)
  currentViewingPartnerId: string | null
  setCurrentViewingPartnerId: (partnerId: string | null) => void
  // 랭킹 팝업 열기 (파트너 ID 포함)
  openRankingSheet: (partnerId?: string | null) => void
  // 하트 보내기 (후원) 팝업 상태
  isDonationSheetOpen: boolean
  donationTargetPartnerId: string | null
  donationTargetPartnerName: string | null
  openDonationSheet: (partnerId: string, partnerName?: string) => void
  closeDonationSheet: () => void
  // 기본 앨범 여부 (삭제/이름 수정 불가)
  isDefaultAlbum: boolean
  setIsDefaultAlbum: (isDefault: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  isPartnerPageScrolled: false,
  setIsPartnerPageScrolled: (scrolled) => set({ isPartnerPageScrolled: scrolled }),
  partnerHeaderName: null,
  setPartnerHeaderName: (name) => set({ partnerHeaderName: name }),
  // 랭킹 팝업 상태
  isRankingSheetOpen: false,
  setIsRankingSheetOpen: (open) => set({ isRankingSheetOpen: open }),
  // 현재 보고 있는 파트너 ID
  currentViewingPartnerId: null,
  setCurrentViewingPartnerId: (partnerId) => set({ currentViewingPartnerId: partnerId }),
  // 랭킹 팝업 열기
  openRankingSheet: (partnerId) => set((state) => ({ 
    isRankingSheetOpen: true, 
    currentViewingPartnerId: partnerId !== undefined ? partnerId : state.currentViewingPartnerId 
  })),
  // 하트 보내기 (후원) 팝업 상태
  isDonationSheetOpen: false,
  donationTargetPartnerId: null,
  donationTargetPartnerName: null,
  openDonationSheet: (partnerId, partnerName) => set({
    isDonationSheetOpen: true,
    donationTargetPartnerId: partnerId,
    donationTargetPartnerName: partnerName || null,
  }),
  closeDonationSheet: () => set({
    isDonationSheetOpen: false,
    donationTargetPartnerId: null,
    donationTargetPartnerName: null,
  }),
  // 기본 앨범 여부
  isDefaultAlbum: false,
  setIsDefaultAlbum: (isDefault) => set({ isDefaultAlbum: isDefault }),
}))

