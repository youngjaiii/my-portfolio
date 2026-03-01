import { forwardRef, useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Flag, Menu, X, Image, Play, ShoppingBag, Settings } from 'lucide-react'
import { Avatar, Button, ChatPartnerProfileModal, DonationModal } from '@/components'
import { ReportModal } from '@/components/modals'
import { useDevice } from '@/hooks/useDevice'
import { supabase } from '@/lib/supabase'
import { edgeApi } from '@/lib/edgeApi'
import { toast } from 'sonner'

interface ChatMedia {
  id: number
  message_id: number
  media_url: string
  media_type: 'image' | 'video'
  file_name?: string
  thumbnail_url?: string
  created_at: string
}

interface ActiveRequest {
  id: string
  job_name?: string | null
  job_count: number
  coins_per_job?: number | null
  total_coins?: number
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled' | 'rejected'
  created_at?: string
  updated_at?: string
  client_id?: string
}

interface ChatHeaderProps {
  partnerName?: string
  partnerAvatar?: string | null
  partnerId?: string
  roomId?: string | null
  currentUserId?: string
  onGoBack?: () => void
  onBlockUser?: () => void
  isCurrentUserPartner: boolean
  isPartnerBlockedUser: boolean
  activeRequests?: ActiveRequest[]
  onCompleteQuest?: (requestId: string) => void
  onOpenOrderList?: () => void
}

export const ChatHeader = forwardRef<HTMLDivElement, ChatHeaderProps>(
  function ChatHeader({
    partnerName,
    partnerAvatar,
    partnerId,
    roomId,
    currentUserId,
    onGoBack,
    onBlockUser,
    isCurrentUserPartner,
    isPartnerBlockedUser,
    activeRequests = [],
    onCompleteQuest,
    onOpenOrderList,
  }, ref) {
    const { isMobile } = useDevice()
    const navigate = useNavigate()
    const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
    const [isDonationModalOpen, setIsDonationModalOpen] = useState(false)
    const [isReportModalOpen, setIsReportModalOpen] = useState(false)
    const [isPartner, setIsPartner] = useState(false)
    const [memberCode, setMemberCode] = useState<string | null>(null)
    
    // 사이드 메뉴 상태
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [mediaList, setMediaList] = useState<ChatMedia[]>([])
    const [mediaLoading, setMediaLoading] = useState(false)
    const [totalMedia, setTotalMedia] = useState(0)
    const [isAlbumOpen, setIsAlbumOpen] = useState(false)
    const [allMedia, setAllMedia] = useState<ChatMedia[]>([])
    const [previewMedia, setPreviewMedia] = useState<ChatMedia | null>(null)
    
    // 퀘스트 팝업 상태
    const [isQuestPopupOpen, setIsQuestPopupOpen] = useState(false)
    const [questTab, setQuestTab] = useState<'mine' | 'partner'>('mine')
    const questPopupRef = useRef<HTMLDivElement>(null)
    
    // 채팅 설정 상태 (파트너용)
    const [isChatSettingsOpen, setIsChatSettingsOpen] = useState(false)
    const [freeMessageCount, setFreeMessageCount] = useState<number>(0)
    const [chatPrice, setChatPrice] = useState<number>(100)
    const [isLoadingSettings, setIsLoadingSettings] = useState(false)
    const [isSavingSettings, setIsSavingSettings] = useState(false)
    const chatSettingsRef = useRef<HTMLDivElement>(null)
    
    // 진행중인 퀘스트 필터링
    const inProgressQuests = activeRequests.filter(r => r.status === 'in_progress')
    
    // 상대방이 파트너인지 (partners 테이블 기준)
    const [isOtherPartner, setIsOtherPartner] = useState(false)
    
    useEffect(() => {
      if (!partnerId) {
        setIsOtherPartner(false)
        return
      }
      
      const checkOtherPartner = async () => {
        try {
          const { data } = await supabase
            .from('partners')
            .select('id')
            .eq('member_id', partnerId)
            .maybeSingle()
          
          setIsOtherPartner(!!data)
        } catch {
          setIsOtherPartner(false)
        }
      }
      
      checkOtherPartner()
    }, [partnerId])
    
    // 둘 다 파트너인지 확인
    const areBothPartners = isCurrentUserPartner && isOtherPartner
    
    // 내 퀘스트 / 상대방 퀘스트 분리
    const myQuests = inProgressQuests.filter(q => q.client_id === currentUserId)
    const partnerQuests = inProgressQuests.filter(q => q.client_id !== currentUserId)
    const filteredQuests = areBothPartners 
      ? (questTab === 'mine' ? myQuests : partnerQuests)
      : inProgressQuests
    
    // 퀘스트 팝업 외부 클릭 처리
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (questPopupRef.current && !questPopupRef.current.contains(event.target as Node)) {
          setIsQuestPopupOpen(false)
        }
      }
      if (isQuestPopupOpen) {
        document.addEventListener('mousedown', handleClickOutside)
      }
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isQuestPopupOpen])
    
    // 채팅 설정 팝업 외부 클릭 처리
    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (chatSettingsRef.current && !chatSettingsRef.current.contains(event.target as Node)) {
          setIsChatSettingsOpen(false)
        }
      }
      if (isChatSettingsOpen) {
        document.addEventListener('mousedown', handleClickOutside)
      }
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [isChatSettingsOpen])
    
    // 채팅 설정 로드 (파트너인 경우)
    const loadChatSettings = useCallback(async () => {
      if (!currentUserId || !isCurrentUserPartner) return
      setIsLoadingSettings(true)
      try {
        const { data } = await supabase
          .from('partners')
          .select('free_message_count, chat_price')
          .eq('member_id', currentUserId)
          .single() as { data: { free_message_count: number | null; chat_price: number | null } | null }
        
        if (data) {
          setFreeMessageCount(data.free_message_count || 0)
          setChatPrice(data.chat_price || 100)
        }
      } catch (error) {
        console.error('채팅 설정 로드 실패:', error)
      } finally {
        setIsLoadingSettings(false)
      }
    }, [currentUserId, isCurrentUserPartner])
    
    // 채팅 설정 저장
    const saveChatSettings = async () => {
      if (!currentUserId) return
      setIsSavingSettings(true)
      try {
        const { error } = await supabase
          .from('partners')
          .update({ free_message_count: freeMessageCount, chat_price: chatPrice } as any)
          .eq('member_id', currentUserId)
        
        if (error) throw error
        
        toast.success('채팅 설정이 저장되었습니다')
        setIsChatSettingsOpen(false)
      } catch (error) {
        console.error('채팅 설정 저장 실패:', error)
        toast.error('설정 저장에 실패했습니다')
      } finally {
        setIsSavingSettings(false)
      }
    }
    
    // 채팅 설정 팝업 열릴 때 설정 로드
    useEffect(() => {
      if (isChatSettingsOpen) {
        loadChatSettings()
      }
    }, [isChatSettingsOpen, loadChatSettings])
    
    // 미디어 조회
    const fetchMedia = useCallback(async (limit: number = 6) => {
      if (!roomId) return
      setMediaLoading(true)
      try {
        const response = await edgeApi.chat.getRoomMedia(roomId, 1, limit, 'all')
        if (response.success && response.data) {
          const data = response.data as { media?: ChatMedia[], total?: number }
          setMediaList(data.media || [])
          setTotalMedia(data.total || 0)
        }
      } catch (error) {
        console.error('미디어 조회 실패:', error)
      } finally {
        setMediaLoading(false)
      }
    }, [roomId])
    
    // 전체 미디어 조회 (앨범용)
    const fetchAllMedia = useCallback(async () => {
      if (!roomId) return
      try {
        const response = await edgeApi.chat.getRoomMedia(roomId, 1, 100, 'all')
        if (response.success && response.data) {
          const data = response.data as { media?: ChatMedia[] }
          setAllMedia(data.media || [])
        }
      } catch (error) {
        console.error('전체 미디어 조회 실패:', error)
      }
    }, [roomId])
    
    // 메뉴 열릴 때 미디어 조회
    useEffect(() => {
      if (isMenuOpen && roomId) {
        fetchMedia(6)
      }
    }, [isMenuOpen, roomId, fetchMedia])
    
    // 앨범 열릴 때 전체 미디어 조회
    useEffect(() => {
      if (isAlbumOpen && roomId) {
        fetchAllMedia()
      }
    }, [isAlbumOpen, roomId, fetchAllMedia])
    
    const getMediaUrl = (media: ChatMedia) => {
      const SUPABASE_URL = 'https://rmooqijhkmomdtkvuzrr.supabase.co'
      if (media.media_url.startsWith('http')) return media.media_url
      return `${SUPABASE_URL}/storage/v1/object/public/chat-media/${media.media_url}`
    }

    // partnerId가 실제 partner인지 확인하고 memberCode 가져오기
    useEffect(() => {
      if (!partnerId) {
        setIsPartner(false)
        setMemberCode(null)
        return
      }

      const checkIfPartner = async () => {
        try {
          const { data: memberData } = await supabase
            .from('members')
            .select('role, member_code')
            .eq('id', partnerId)
            .single()

          const member = memberData as { role?: string, member_code?: string } | null
          setIsPartner(member?.role === 'partner')
          setMemberCode(member?.member_code || null)
        } catch (error) {
          setIsPartner(false)
          setMemberCode(null)
        }
      }

      checkIfPartner()
    }, [partnerId])

    // 파트너 프로필 페이지로 이동
    const handleProfileClick = () => {
      if (isPartner && memberCode) {
        navigate({ to: '/partners/$memberCode', params: { memberCode } })
      }
    }

    return (
      <div
        ref={ref}
        className={`${
          isMobile
            ? 'fixed top-0 left-0 right-0 z-10 bg-white border-b shadow-sm'
            : 'border-b bg-gray-50 rounded-t-lg'
        } px-4 py-3 flex-shrink-0`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            {/* 뒤로가기 버튼 (모바일에서만) */}
            {isMobile && onGoBack && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onGoBack}
                className="mr-3 p-2"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </Button>
            )}

            {/* 파트너 정보 */}
            <div
              className={`flex items-center rounded-lg p-2 -m-2 transition-colors ${
                isPartner && memberCode ? 'cursor-pointer hover:bg-gray-50' : ''
              }`}
              onClick={handleProfileClick}
            >
              <Avatar
                src={partnerAvatar || undefined}
                name={partnerName || '상대방'}
                size={isMobile ? 'sm' : 'md'}
                className="mr-3"
              />
              <div>
                <h2
                  className={`font-semibold ${
                    isMobile ? 'text-base' : 'text-lg'
                  } text-gray-900`}
                >
                  {partnerName || '파트너'}
                </h2>
                <p className="text-sm text-gray-500">온라인</p>
              </div>
            </div>

            {/* 후원하기 버튼 (상대방이 파트너일 때만) */}
            {isPartner && !isCurrentUserPartner && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  setIsDonationModalOpen(true)
                }}
                className="ml-3 text-pink-600 hover:text-pink-700 hover:bg-pink-50"
              >
                <svg
                  className="w-4 h-4 mr-1"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z"
                    clipRule="evenodd"
                  />
                </svg>
                후원
              </Button>
            )}
          </div>

          {/* 신고 버튼 (일반 사용자용) */}
          {!isCurrentUserPartner && partnerId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsReportModalOpen(true)}
              className="text-gray-500 hover:text-red-600 hover:bg-red-50"
              title="신고하기"
            >
              <Flag className="w-4 h-4" />
            </Button>
          )}

          {/* 차단 상태 표시 및 차단/설정 버튼 (파트너만) */}
          {isCurrentUserPartner && (
            <div className="flex items-center gap-2">
              {/* 채팅 설정 아이콘 */}
              <div className="relative" ref={chatSettingsRef}>
                <button
                  onClick={() => setIsChatSettingsOpen(!isChatSettingsOpen)}
                  className="p-2 rounded-full hover:bg-gray-100 transition-colors"
                  title="채팅 설정"
                >
                  <Settings className="w-5 h-5 text-gray-600" />
                </button>
                
                {/* 채팅 설정 팝업 */}
                <div 
                  className={`absolute top-full right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50 transform origin-top-right transition-all duration-200 ${
                    isChatSettingsOpen 
                      ? 'opacity-100 scale-100' 
                      : 'opacity-0 scale-95 pointer-events-none'
                  }`}
                >
                  <div className="bg-[#FE3A8F] px-4 py-3">
                    <h4 className="text-white font-semibold">채팅 설정</h4>
                  </div>
                  
                  <div className="p-4 space-y-4">
                    {isLoadingSettings ? (
                      <div className="flex justify-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-pink-500 border-t-transparent" />
                      </div>
                    ) : (
                      <>
                        {/* 기본 무료 메시지 갯수 */}
                        <div>
                          <label className="text-sm font-medium text-gray-700 block mb-2">
                            기본 무료 메시지 갯수
                          </label>
                          <p className="text-xs text-gray-400 mb-2">
                            멤버십 없이도 무료로 보낼 수 있는 메시지 수
                          </p>
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              value={freeMessageCount}
                              onChange={(e) => setFreeMessageCount(Math.max(0, parseInt(e.target.value) || 0))}
                              className="w-full px-3 py-2.5 pr-10 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/50"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">개</span>
                          </div>
                        </div>

                        {/* 유료 메시지 포인트 금액 */}
                        <div>
                          <label className="text-sm font-medium text-gray-700 block mb-2">
                            유료 메시지 포인트 금액
                          </label>
                          <p className="text-xs text-gray-400 mb-2">
                            무료 메시지 소진 후 메시지당 차감 포인트
                          </p>
                          <div className="relative">
                            <input
                              type="number"
                              min="0"
                              value={chatPrice}
                              onChange={(e) => setChatPrice(Math.max(0, parseInt(e.target.value) || 0))}
                              className="w-full px-3 py-2.5 pr-10 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/50"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">P</span>
                          </div>
                        </div>
                        
                        {/* 저장 버튼 */}
                        <button
                          onClick={saveChatSettings}
                          disabled={isSavingSettings}
                          className="w-full py-2.5 bg-[#FE3A8F] text-white text-sm font-semibold rounded-lg hover:bg-pink-600 transition-colors disabled:opacity-50"
                        >
                          {isSavingSettings ? '저장 중...' : '저장'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
              
              {isPartnerBlockedUser ? (
                <div className="flex items-center gap-2 px-3 py-1 bg-red-100 border border-red-300 rounded-full">
                  <svg
                    className="w-4 h-4 text-red-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728"
                    />
                  </svg>
                  <span className="text-sm font-medium text-red-700">
                    차단된 사용자
                  </span>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onBlockUser}
                  className="text-red-600 hover:text-red-800 hover:bg-red-50"
                >
                  차단
                </Button>
              )}
            </div>
          )}
          
          {/* 진행중 퀘스트 아이콘 */}
          {inProgressQuests.length > 0 && (
            <div className="relative ml-2" ref={questPopupRef}>
              <button
                onClick={() => setIsQuestPopupOpen(!isQuestPopupOpen)}
                className="relative p-2 rounded-full hover:bg-pink-50 transition-colors"
              >
                <img src="/icon/quest.png" alt="퀘스트" className="w-6 h-6" />
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-pink-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {inProgressQuests.length}
                </span>
              </button>
              
              {/* 퀘스트 팝업 */}
              <div 
                className={`absolute top-full right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-50 transform origin-top-right transition-all duration-200 ${
                  isQuestPopupOpen 
                    ? 'opacity-100 scale-100' 
                    : 'opacity-0 scale-95 pointer-events-none'
                }`}
              >
                <div className="bg-[#FE3A8F] px-4 py-3">
                  <h4 className="text-white font-semibold">진행중인 퀘스트</h4>
                </div>
                
                {/* 탭 버튼 - 둘 다 파트너일 때만 표시 */}
                {areBothPartners && (
                  <div className="flex border-b border-gray-200">
                    <button
                      onClick={() => setQuestTab('mine')}
                      className={`flex-1 py-2.5 text-sm font-medium transition-colors relative ${
                        questTab === 'mine' 
                          ? 'text-[#FE3A8F]' 
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      의뢰한 퀘스트
                      {myQuests.length > 0 && (
                        <span className="ml-1 px-1.5 py-0.5 text-xs bg-pink-100 text-pink-600 rounded-full">
                          {myQuests.length}
                        </span>
                      )}
                      {questTab === 'mine' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FE3A8F]" />
                      )}
                    </button>
                    <button
                      onClick={() => setQuestTab('partner')}
                      className={`flex-1 py-2.5 text-sm font-medium transition-colors relative ${
                        questTab === 'partner' 
                          ? 'text-[#FE3A8F]' 
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      받은 퀘스트
                      {partnerQuests.length > 0 && (
                        <span className="ml-1 px-1.5 py-0.5 text-xs bg-pink-100 text-pink-600 rounded-full">
                          {partnerQuests.length}
                        </span>
                      )}
                      {questTab === 'partner' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FE3A8F]" />
                      )}
                    </button>
                  </div>
                )}
                
                <div className="max-h-64 overflow-y-auto">
                  {filteredQuests.length === 0 ? (
                    <div className="p-6 text-center text-gray-400 text-sm">
                      {areBothPartners
                        ? (questTab === 'mine' ? '의뢰한 퀘스트가 없습니다' : '받은 퀘스트가 없습니다')
                        : '진행중인 퀘스트가 없습니다'}
                    </div>
                  ) : (
                    filteredQuests.map((quest) => (
                      <div 
                        key={quest.id}
                        className="p-4 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-pink-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <img src="/icon/quest.png" alt="" className="w-6 h-6" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 truncate">
                              {quest.job_name || '퀘스트'}
                            </p>
                            <p className="text-sm text-gray-500">
                              {quest.job_count}회 · {(quest.total_coins || quest.coins_per_job || 0).toLocaleString()}P
                            </p>
                          </div>
                          {/* 완료 버튼: 둘 다 파트너면 받은 퀘스트 탭에서만, 아니면 항상 (파트너가 완료 처리) */}
                          {onCompleteQuest && (areBothPartners ? questTab === 'partner' : true) && (
                            <button
                              onClick={() => {
                                onCompleteQuest(quest.id)
                                setIsQuestPopupOpen(false)
                              }}
                              className="px-3 py-1.5 bg-[#FE3A8F] text-white text-sm font-medium rounded-lg hover:bg-pink-600 transition-colors"
                            >
                              완료
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* 메뉴 버튼 */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsMenuOpen(true)}
            className="ml-2 text-gray-500 hover:text-gray-700"
          >
            <Menu className="w-5 h-5" />
          </Button>
        </div>

        {/* 파트너 프로필 모달 */}
        {partnerId && isPartner && (
          <ChatPartnerProfileModal
            isOpen={isProfileModalOpen}
            onClose={() => setIsProfileModalOpen(false)}
            partnerId={partnerId}
            partnerName={partnerName}
            partnerAvatar={partnerAvatar}
          />
        )}

        {/* 후원하기 모달 */}
        {partnerId && isPartner && (
          <DonationModal
            isOpen={isDonationModalOpen}
            onClose={() => setIsDonationModalOpen(false)}
            partnerId={partnerId}
            partnerName={partnerName}
          />
        )}

        {/* 신고 모달 */}
        {partnerId && (
          <ReportModal
            isOpen={isReportModalOpen}
            onClose={() => setIsReportModalOpen(false)}
            targetType="chat"
            targetId={partnerId}
            targetName={partnerName}
          />
        )}
        
        {/* 사이드 메뉴 드로어 */}
        {isMenuOpen && (
          <>
            {/* 오버레이 */}
            <div 
              className="fixed inset-0 bg-black/50 z-40"
              onClick={() => setIsMenuOpen(false)}
            />
            {/* 드로어 */}
            <div className="fixed top-0 right-0 bottom-0 w-[280px] bg-white z-50 shadow-xl overflow-y-auto">
              <div className="p-4 border-b flex items-center justify-between">
                <h3 className="font-semibold text-lg">채팅 정보</h3>
                <button onClick={() => setIsMenuOpen(false)} className="p-1 hover:bg-gray-100 rounded">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {/* 미디어 섹션 */}
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-medium text-gray-700">미디어</span>
                  {totalMedia > 6 && (
                    <button 
                      onClick={() => { setIsAlbumOpen(true); setIsMenuOpen(false) }}
                      className="text-sm text-pink-600 hover:text-pink-700"
                    >
                      전체보기 ({totalMedia})
                    </button>
                  )}
                </div>
                
                {mediaLoading ? (
                  <div className="flex justify-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-pink-500 border-t-transparent" />
                  </div>
                ) : mediaList.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    주고받은 미디어가 없습니다
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-1">
                    {mediaList.slice(0, 6).map((media) => (
                      <div 
                        key={media.id}
                        className="aspect-square relative cursor-pointer overflow-hidden rounded bg-gray-100"
                        onClick={() => { setPreviewMedia(media); setIsMenuOpen(false) }}
                      >
                        {media.media_type === 'image' ? (
                          <img 
                            src={getMediaUrl(media)} 
                            alt="" 
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full relative">
                            <video 
                              src={getMediaUrl(media)} 
                              className="w-full h-full object-cover"
                              muted
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                              <Play className="w-6 h-6 text-white" fill="white" />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* 주문 조회 버튼 */}
              {onOpenOrderList && (
                <div className="p-4 border-t">
                  <button
                    onClick={() => {
                      onOpenOrderList()
                      setIsMenuOpen(false)
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <ShoppingBag className="w-5 h-5" />
                    <span className="font-medium">주문 조회</span>
                  </button>
                </div>
              )}
              
              {/* 신고 버튼 */}
              {partnerId && (
                <div className="p-4 border-t">
                  <button
                    onClick={() => {
                      setIsReportModalOpen(true)
                      setIsMenuOpen(false)
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Flag className="w-5 h-5" />
                    <span className="font-medium">신고하기</span>
                  </button>
                </div>
              )}
            </div>
          </>
        )}
        
        {/* 전체 앨범 모달 */}
        {isAlbumOpen && (
          <div className="fixed inset-0 bg-white z-50 overflow-y-auto">
            <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between z-10">
              <button onClick={() => setIsAlbumOpen(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
              <h3 className="font-semibold">미디어 ({totalMedia})</h3>
              <div className="w-7" />
            </div>
            <div className="grid grid-cols-3 gap-1 p-1">
              {allMedia.map((media) => (
                <div 
                  key={media.id}
                  className="aspect-square relative cursor-pointer overflow-hidden bg-gray-100"
                  onClick={() => { setPreviewMedia(media); setIsAlbumOpen(false) }}
                >
                  {media.media_type === 'image' ? (
                    <img 
                      src={getMediaUrl(media)} 
                      alt="" 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full relative">
                      <video 
                        src={getMediaUrl(media)} 
                        className="w-full h-full object-cover"
                        muted
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <Play className="w-6 h-6 text-white" fill="white" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* 미디어 프리뷰 모달 */}
        {previewMedia && (
          <div 
            className="fixed inset-0 bg-black z-50 flex items-center justify-center"
            onClick={() => setPreviewMedia(null)}
          >
            <button 
              className="absolute top-4 right-4 p-2 text-white hover:bg-white/20 rounded-full z-10"
              onClick={() => setPreviewMedia(null)}
            >
              <X className="w-8 h-8" />
            </button>
            {previewMedia.media_type === 'image' ? (
              <img 
                src={getMediaUrl(previewMedia)} 
                alt="" 
                className="w-full h-full object-contain"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <video 
                src={getMediaUrl(previewMedia)} 
                className="w-full h-full object-contain"
                controls
                autoPlay
                onClick={(e) => e.stopPropagation()}
              />
            )}
          </div>
        )}
      </div>
    )
  }
)