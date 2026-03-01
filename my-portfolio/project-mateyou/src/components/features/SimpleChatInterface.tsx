import { memo, useCallback, useEffect, useState, useRef } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { SimpleChatRoom } from './SimpleChatRoom'
import { useAuthStore } from '@/store/useAuthStore'
import { useGlobalRealtime } from '@/contexts/GlobalRealtimeProvider'
import { useDevice } from '@/hooks/useDevice'
import { useNotification } from '@/hooks/useNotification'
import { usePartnerRequestNotification } from '@/hooks/usePartnerRequestNotification'
import { useOptimizedRealtime } from '@/hooks/useOptimizedRealtime'
import { supabase } from '@/lib/supabase'
import { Avatar } from '@/components'
import { edgeApi } from '@/lib/edgeApi'
import { Swiper, SwiperSlide } from 'swiper/react'
import type { Swiper as SwiperType } from 'swiper'
// @ts-ignore
import 'swiper/css'

interface SimpleChatInterfaceProps {
  initialPartnerId?: string
  initialPartnerName?: string
  initialChatRoomId?: string
  initialTempMessage?: string
  initialJobRequest?: string // 퀘스트 요청 JSON 데이터
}

interface ChatSearchPartner {
  id: string
  name: string
  member_code: string
  profile_image: string | null
}

interface ChatSearchRoom {
  room_id: string
  partner: ChatSearchPartner
  latest_message: {
    message: string
    message_type: string
    created_at: string
  }
  last_activity: string
}

interface ChatSearchRoomWithMatches extends ChatSearchRoom {
  matched_messages: Array<{
    message: string
    created_at: string
  }>
}

interface ChatSearchResult {
  rooms_by_partner: ChatSearchRoom[]
  rooms_by_message: ChatSearchRoomWithMatches[]
  total_count: {
    partner: number
    message: number
  }
}

type ChatFilterTab = 'all' | 'subscriber' | 'follower' | 'normal'

// 채팅방 목록 컴포넌트 (memo 제거 - 쿼리 파라미터 변경 시에도 리렌더링 필요)
function ChatRoomList({
  rooms,
  isLoading,
  selectedPartnerId,
  onSelectRoom,
  isPartner,
  isAdmin,
  currentUserId,
}: {
  rooms: Array<any>
  isLoading: boolean
  selectedPartnerId: string | null
  onSelectRoom: (partnerId: string, partnerName: string, roomId?: string, isCsRoom?: boolean) => void
  isPartner: boolean
  isAdmin: boolean
  currentUserId: string
}) {
  const { isMobile } = useDevice()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const chatSwiperRef = useRef<SwiperType | null>(null)
  
  // 검색 상태
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ChatSearchResult | null>(null)
  const [isSearching, setIsSearching] = useState(false)
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // 파트너 필터 탭 상태
  const [filterTab, setFilterTab] = useState<ChatFilterTab>('all')
  const [filteredRooms, setFilteredRooms] = useState<Array<any>>(rooms)
  const [isFilterLoading, setIsFilterLoading] = useState(false)

  // 관리자 탭 상태 — 관리자면 기본 1:1 문의 탭
  type AdminChatTab = 'normal' | 'cs'
  const [adminTab, setAdminTab] = useState<AdminChatTab>(isAdmin ? 'cs' : 'normal')
  
  // 컴포넌트 마운트 시 스크롤 초기화
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0
    }
  }, [])

  // rooms prop 변경 시 filteredRooms 업데이트 (전체 탭일 때)
  useEffect(() => {
    if (filterTab === 'all') {
      setFilteredRooms(rooms)
    }
  }, [rooms, filterTab])

  // 파트너 필터 탭 변경 시 API 호출
  useEffect(() => {
    if (!isPartner) {
      setFilteredRooms(rooms)
      return
    }

    const fetchFilteredRooms = async () => {
      if (filterTab === 'all') {
        setFilteredRooms(rooms)
        return
      }

      setIsFilterLoading(true)
      try {
        const response = await edgeApi.chat.getRooms({ sort_by: filterTab })
        if (response.success && response.data) {
          const apiRooms = response.data as any[]
          const mappedRooms = apiRooms.map((room: any) => {
            const isCreator = room.created_by === currentUserId
            const partnerInfo = isCreator ? room.partner : room.creator
            const isCs = room.is_cs_room === true
            const partnerId = isCs ? (room.id || '') : (partnerInfo?.id || room.partner_id || '')
            let pName: string
            let pAvatar: string | null
            if (isCs) {
              if (isCreator) {
                pName = '1:1 문의'
                pAvatar = '/logo.svg'
              } else {
                pName = room.creator?.name || room.display_name || '문의'
                pAvatar = room.creator?.profile_image || null
              }
            } else {
              pName = partnerInfo?.name || 'Unknown'
              pAvatar = partnerInfo?.profile_image || null
            }
            return {
              roomId: room.id || '',
              partnerId,
              partnerName: pName,
              partnerAvatar: pAvatar,
              lastMessage: room.latest_message?.message || '',
              lastMessageTime: room.latest_message?.created_at || room.updated_at || '',
              unreadCount: room.unread_count || 0,
              isAdminRoom: room.is_admin_room || false,
              isCsRoom: room.is_cs_room || false,
            }
          })
          setFilteredRooms(mappedRooms)
        }
      } catch (error) {
        console.error('Failed to fetch filtered rooms:', error)
        setFilteredRooms([])
      } finally {
        setIsFilterLoading(false)
      }
    }

    fetchFilteredRooms()
  }, [filterTab, isPartner, rooms, currentUserId])

  // 검색 디바운스 로직
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null)
      setIsSearching(false)
      return
    }
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }
    
    setIsSearching(true)
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const result = await edgeApi.chat.search({ q: searchQuery.trim() })
        if (result.success && result.data) {
          setSearchResults(result.data as ChatSearchResult)
        }
      } catch (error) {
        console.error('Chat search failed:', error)
      } finally {
        setIsSearching(false)
      }
    }, 300)
    
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchQuery])

  const formatTime = (dateString: string) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    if (Number.isNaN(date.getTime())) return ''
    const now = new Date()
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60)
    if (diffInHours < 24) {
      return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    }
    return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
  }

  const formatMessagePreview = (message: string): string => {
    if (!message) return ''
    if (message.includes('[POST:')) return '게시물'
    if (message.startsWith('[HEART_GIFT:')) {
      const match = message.match(/\[HEART_GIFT:[^:]+:(\d+):(\d+)\]/)
      if (match) return `❤️ 하트 ${match[1]}개 선물`
    }
    if (message.startsWith('[QUEST_REQUEST:')) {
      const match = message.match(/\[QUEST_REQUEST:([^:]+):(\d+):(\d+)(?::[a-f0-9-]*)?\]/)
      if (match) return `📋 퀘스트 요청: ${match[1]}`
    }
    if (message === '[NOTICE_UPDATED]') return '📢 공지가 변경되었습니다'
    if (message.startsWith('[CALL_START:')) {
      return message.includes(':video]') ? '📹 영상통화 시작' : '📞 통화 시작'
    }
    if (message.startsWith('[CALL_ACCEPT:')) {
      return message.includes(':video]') ? '📹 영상통화 수락' : '📞 통화 수락'
    }
    if (message.startsWith('[CALL_END:')) {
      const match = message.match(/\[CALL_END:(voice|video):(\d+)\]/)
      if (match) {
        const isVideo = match[1] === 'video'
        const seconds = Number(match[2])
        const mins = Math.floor(seconds / 60)
        const secs = seconds % 60
        const duration = seconds > 0 ? (mins > 0 ? `${mins}분 ${secs}초` : `${secs}초`) : ''
        return isVideo 
          ? `📹 영상통화 종료${duration ? ` (${duration})` : ''}`
          : `📞 통화 종료${duration ? ` (${duration})` : ''}`
      }
    }
    return message
  }

  const containerClass = isMobile
    ? 'w-full flex-1'
    : 'w-full flex-shrink-0 md:w-[320px] lg:w-[360px]'

  const isSearchMode = searchQuery.trim().length > 0
  const hasSearchResults = searchResults && (searchResults.rooms_by_partner.length > 0 || searchResults.rooms_by_message.length > 0)

  // 검색 결과 렌더링
  const renderSearchResults = () => {
    if (isSearching) {
      return (
        <div className="flex min-h-[200px] items-center justify-center text-gray-400">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#FE3A8F]"></div>
        </div>
      )
    }

    if (!hasSearchResults) {
      return (
        <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
          <svg className="w-12 h-12 text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <p className="text-sm text-gray-500">검색 결과가 없습니다</p>
        </div>
      )
    }

    return (
      <div className="p-3 space-y-3">
        {/* 파트너 검색 결과 */}
        {searchResults!.rooms_by_partner.length > 0 && (
          <div className="bg-gray-50 rounded-xl overflow-hidden">
            <div className="px-4 py-2">
              <h4 className="text-xs font-semibold text-gray-500 uppercase">파트너 ({searchResults!.total_count.partner})</h4>
            </div>
            <div>
              {searchResults!.rooms_by_partner.map((room) => (
                <div
                  key={room.room_id}
                  onClick={() => onSelectRoom(room.partner.id, room.partner.name)}
                  className={`relative flex items-center px-4 py-2 hover:bg-gray-50 cursor-pointer transition-colors ${
                    selectedPartnerId === room.partner.id ? 'bg-pink-50' : ''
                  }`}
                >
                  <Avatar
                    src={room.partner.profile_image || undefined}
                    alt={room.partner.name}
                    name={room.partner.name}
                    size="md"
                    className="flex-shrink-0"
                  />
                  <div className="ml-3 flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-sm font-medium text-gray-900 truncate">{room.partner.name}</h3>
                      <span className="text-xs text-gray-500">{formatTime(room.last_activity)}</span>
                    </div>
                    <p className="text-sm text-gray-600 truncate">
                      {formatMessagePreview(room.latest_message?.message || '')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 메시지 검색 결과 */}
        {searchResults!.rooms_by_message.length > 0 && (
          <div className="bg-gray-50 rounded-xl overflow-hidden">
            <div className="px-4 py-2">
              <h4 className="text-xs font-semibold text-gray-500 uppercase">대화 내용 ({searchResults!.total_count.message})</h4>
            </div>
            <div>
              {searchResults!.rooms_by_message.map((room) => (
                <div
                  key={room.room_id}
                  onClick={() => onSelectRoom(room.partner.id, room.partner.name)}
                  className={`relative flex items-center px-4 py-2 hover:bg-gray-50 cursor-pointer transition-colors ${
                    selectedPartnerId === room.partner.id ? 'bg-pink-50' : ''
                  }`}
                >
                  <Avatar
                    src={room.partner.profile_image || undefined}
                    alt={room.partner.name}
                    name={room.partner.name}
                    size="md"
                    className="flex-shrink-0"
                  />
                  <div className="ml-3 flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="text-sm font-medium text-gray-900 truncate">{room.partner.name}</h3>
                      <span className="text-xs text-gray-500">{formatTime(room.last_activity)}</span>
                    </div>
                    {room.matched_messages.length > 0 && (
                      <p className="text-sm text-gray-600 truncate">
                        "{room.matched_messages[0].message}"
                      </p>
                    )}
                    {room.matched_messages.length > 1 && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        외 {room.matched_messages.length - 1}개 메시지
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // 일반 채팅방 목록 렌더링
  const renderRoomList = () => {
    if (isLoading || isFilterLoading) {
      return (
        <div className="flex min-h-[320px] items-center justify-center text-gray-400">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#FE3A8F]"></div>
        </div>
      )
    }

    let displayRooms = isPartner ? filteredRooms : rooms

    if (isAdmin) {
      // 관리자: 탭별 분리 (CS 방 상단 고정 없음)
      if (adminTab === 'cs') {
        displayRooms = displayRooms.filter((r: any) => r.isCsRoom && r.lastMessage)
      } else {
        displayRooms = displayRooms.filter((r: any) => !r.isCsRoom)
      }
    } else {
      // 일반/파트너: CS 방 상단 고정
      const csRoom = rooms.find((r: any) => r.isCsRoom) || displayRooms.find((r: any) => r.isCsRoom)
      const csEntry = csRoom || {
        roomId: '',
        partnerId: 'cs-placeholder',
        partnerName: '1:1 문의',
        partnerAvatar: '/logo.svg',
        lastMessage: '',
        lastMessageTime: '',
        unreadCount: 0,
        isCsRoom: true,
        isAdminRoom: true,
      }
      const rest = displayRooms.filter((r: any) => !r.isCsRoom)
      displayRooms = [csEntry, ...rest]
    }

    const sortedDisplayRooms = [...displayRooms].sort((a, b) => {
      if (!isAdmin) {
        const aCs = a.isCsRoom || a.isAdminRoom
        const bCs = b.isCsRoom || b.isAdminRoom
        if (aCs && !bCs) return -1
        if (!aCs && bCs) return 1
      }
      const aT = new Date(a.lastMessageTime || 0).getTime()
      const bT = new Date(b.lastMessageTime || 0).getTime()
      if (Number.isNaN(aT) || Number.isNaN(bT)) return 0
      return bT - aT
    })

    if (sortedDisplayRooms.length === 0) {
      const emptyMessage = isAdmin && adminTab === 'cs'
        ? { title: '문의가 없습니다', subtitle: '새로운 문의가 들어오면 여기에 표시됩니다.' }
        : isPartner && filterTab !== 'all'
        ? { title: '해당하는 채팅방이 없습니다', subtitle: '다른 탭을 선택해 보세요.' }
        : { title: '아직 팔로우한 파트너가 없습니다', subtitle: '팔로우를 시작하고 새로운 대화를 만들어보세요.' }

      return (
        <div className="flex h-full flex-col items-center justify-center px-6 pb-[65px] text-center text-gray-500">
          <p className="text-sm font-medium text-gray-700">{emptyMessage.title}</p>
          <p className="mt-1 text-xs text-gray-400">{emptyMessage.subtitle}</p>
          {(!isPartner || filterTab === 'all') && !(isAdmin && adminTab === 'cs') && (
            <Link
              to="/chat/new"
              className="mt-4 inline-flex items-center rounded-full px-5 py-2 text-sm font-semibold bg-[#FE3A8F] text-white"
            >
              새 대화 시작
            </Link>
          )}
        </div>
      )
    }

    return (
      <div className="divide-y divide-gray-100">
        {sortedDisplayRooms.map((room) => (
          <div
            key={room.roomId || room.partnerId}
            onClick={() => onSelectRoom(room.partnerId, room.partnerName, room.roomId, room.isCsRoom)}
            className={`relative flex items-center px-4 py-2 hover:bg-gray-50 cursor-pointer transition-colors ${
              selectedPartnerId === room.partnerId ? 'bg-pink-50' : ''
            }`}
          >
            <div className="relative">
              {room.isCsRoom && !isAdmin ? (
                <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-full bg-gray-100 overflow-hidden">
                  <img src="/logo.svg" alt={room.partnerName} className="w-7 h-7 object-contain" />
                </div>
              ) : (
                <Avatar
                  src={room.partnerAvatar || undefined}
                  alt={room.partnerName}
                  name={room.partnerName}
                  size="md"
                  className="flex-shrink-0"
                />
              )}
              {room.unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 inline-flex items-center justify-center w-5 h-5 text-xs font-medium text-white bg-red-500 rounded-full border-2 border-white">
                  {room.unreadCount > 99 ? '99+' : room.unreadCount}
                </span>
              )}
            </div>
            <div className="ml-3 flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-medium text-gray-900 truncate">{room.partnerName}</h3>
                <span className="text-xs text-gray-500">{formatTime(room.lastMessageTime)}</span>
              </div>
              <p className="text-sm text-gray-600 truncate">{formatMessagePreview(room.lastMessage)}</p>
            </div>
          </div>
        ))}
      </div>
    )
  }

  const filterTabs: { value: ChatFilterTab; label: string }[] = [
    { value: 'all', label: '전체' },
    { value: 'subscriber', label: '구독자' },
    { value: 'follower', label: '팔로워' },
    { value: 'normal', label: '일반' },
  ]

  return (
    <div className={`flex flex-col border-r border-gray-200 bg-white ${containerClass}`}>
      {/* 검색 입력 */}
      <div 
        className="sticky top-0 z-10 bg-white"
        style={isMobile ? { paddingTop: '60px' } : undefined}
      >
        <div className="px-3 py-2">
          <div className="relative flex items-center rounded-2xl border border-gray-200 bg-gray-50/80 px-3 py-2 focus-within:border-[#110f1a] focus-within:bg-white transition-colors">
            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="검색"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 ml-2 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="p-0.5 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* 관리자 탭: 일반 / 1:1 문의 */}
        {isAdmin && !isSearchMode && (
          <div className="px-3 pb-2">
            <div className="flex gap-1.5">
              {([
                { value: 'normal' as AdminChatTab, label: '일반' },
                { value: 'cs' as AdminChatTab, label: '1:1 문의' },
              ]).map((tab, index) => {
                const csUnread = tab.value === 'cs' ? rooms.filter((r: any) => r.isCsRoom).reduce((sum: number, r: any) => sum + (r.unreadCount || 0), 0) : 0
                return (
                  <button
                    key={tab.value}
                    onClick={() => chatSwiperRef.current?.slideTo(index)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors relative ${
                      adminTab === tab.value
                        ? 'bg-[#FE3A8F] text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {tab.label}
                    {csUnread > 0 && tab.value === 'cs' && adminTab !== 'cs' && (
                      <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">
                        {csUnread > 99 ? '99+' : csUnread}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* 파트너 필터 탭 */}
        {isPartner && !isAdmin && !isSearchMode && (
          <div className="px-3 pb-2">
            <div className="flex gap-1.5">
              {filterTabs.map((tab, index) => (
                <button
                  key={tab.value}
                  onClick={() => chatSwiperRef.current?.slideTo(index)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                    filterTab === tab.value
                      ? 'bg-[#FE3A8F] text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 콘텐츠 영역 */}
      {isSearchMode ? (
        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto"
          style={isMobile ? { paddingBottom: '68px' } : undefined}
        >
          {renderSearchResults()}
        </div>
      ) : (isAdmin || isPartner) ? (
        <div className="flex-1 min-h-0">
          <Swiper
            onSwiper={(swiper) => { chatSwiperRef.current = swiper }}
            onSlideChange={(swiper) => {
              if (isAdmin) {
                const adminTabs: AdminChatTab[] = ['normal', 'cs']
                setAdminTab(adminTabs[swiper.activeIndex])
              } else {
                setFilterTab(filterTabs[swiper.activeIndex].value)
              }
            }}
            initialSlide={
              isAdmin
                ? (adminTab === 'cs' ? 1 : 0)
                : Math.max(0, filterTabs.findIndex(t => t.value === filterTab))
            }
            slidesPerView={1}
            spaceBetween={0}
            className="h-full"
          >
            {(isAdmin
              ? [{ value: 'normal' }, { value: 'cs' }]
              : filterTabs
            ).map((tab) => (
              <SwiperSlide key={tab.value}>
                <div
                  className="h-full overflow-y-auto"
                  style={isMobile ? { paddingBottom: '68px' } : undefined}
                >
                  {(isAdmin ? adminTab : filterTab) === tab.value
                    ? renderRoomList()
                    : (
                      <div className="flex min-h-[200px] items-center justify-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#FE3A8F]" />
                      </div>
                    )
                  }
                </div>
              </SwiperSlide>
            ))}
          </Swiper>
        </div>
      ) : (
        <div 
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto"
          style={isMobile ? { paddingBottom: '68px' } : undefined}
        >
          {renderRoomList()}
        </div>
      )}
    </div>
  )
}

// 빈 채팅 화면 컴포넌트 (메모화)
const EmptyChatView = memo(function EmptyChatView() {
  return (
    <div className="hidden md:flex flex-1 items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="mb-4">
          <svg
            className="mx-auto h-16 w-16 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-3.582 8-8 8a8.959 8.959 0 01-4.906-1.456L3 21l2.456-5.094A8.959 8.959 0 013 12c0-4.418 3.582-8 8-8s8 3.582 8 8z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          대화를 시작하세요
        </h3>
        <p className="text-gray-500">
          왼쪽에서 채팅방을 선택하거나 새로운 대화를 시작하세요
        </p>
      </div>
    </div>
  )
})

export const SimpleChatInterface = memo(function SimpleChatInterface({
  initialPartnerId,
  initialPartnerName,
  initialChatRoomId,
  initialTempMessage,
  initialJobRequest,
}: SimpleChatInterfaceProps) {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const { isMobile } = useDevice()
  const { showNotification } = useNotification()

  const isPartner = user?.role === 'partner'
  const isAdmin = user?.role === 'admin' || ((user as any)?.admin_role ?? 0) >= 4

  usePartnerRequestNotification()

  const realtimeConnection = useOptimizedRealtime({
    channelName: 'chat-updates',
    userId: user?.id,
    enabled: !!user?.id
  })

  const [stableConnectionError, setStableConnectionError] = useState(false)
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const edgeSwipeRef = useRef({ startX: 0, startY: 0, active: false })

  useEffect(() => {
    const clearErrorTimeout = () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current)
        errorTimeoutRef.current = null
      }
    }

    if (realtimeConnection.status === 'error') {
      clearErrorTimeout()
      errorTimeoutRef.current = setTimeout(() => {
        setStableConnectionError(true)
      }, 5000)
    } else if (realtimeConnection.status === 'connected') {
      clearErrorTimeout()
      setStableConnectionError(false)
    }

    return clearErrorTimeout
  }, [realtimeConnection.status])

  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(
    initialChatRoomId || initialPartnerId || null,
  )
  const [selectedChatRoomId, setSelectedChatRoomId] = useState<string | null>(
    initialChatRoomId || null,
  )
  const [selectedPartnerName, setSelectedPartnerName] = useState<string>(
    initialPartnerName || (initialChatRoomId ? '1:1 문의' : ''),
  )
  const [selectedPartnerAvatar, setSelectedPartnerAvatar] = useState<string | null>(
    initialChatRoomId ? '/logo.svg' : null,
  )
  const [selectedIsCsRoom, setSelectedIsCsRoom] = useState<boolean>(
    !!initialChatRoomId && !initialPartnerId,
  )
  const [headerPartnerName, setHeaderPartnerName] = useState<string>(
    initialPartnerName || (initialChatRoomId ? '1:1 문의' : ''),
  )

  const {
    chatRooms: rooms,
    markChatAsRead,
    refreshChatRooms,
    setCurrentOpenChatPartnerId,
  } = useGlobalRealtime()

  const handleSelectRoom = useCallback(
    async (partnerId: string, partnerName: string, roomId?: string, isCsRoom?: boolean) => {
      const isCs = isCsRoom === true

      if (partnerId === 'cs-placeholder') {
        // 1) rooms에서 CS방 찾기
        const csFromRooms = rooms.find((r) => r.isCsRoom)
        if (csFromRooms?.roomId) {
          const rid = csFromRooms.roomId
          const pname = csFromRooms.partnerName || '1:1 문의'
          setSelectedPartnerId(rid)
          setSelectedChatRoomId(rid)
          setSelectedPartnerName(pname)
          setHeaderPartnerName(pname)
          setSelectedPartnerAvatar('/logo.svg')
          setSelectedIsCsRoom(true)
          navigate({ to: '/chat', search: { chatRoomId: rid, partnerName: encodeURIComponent(pname) } })
          markChatAsRead(rid)
          refreshChatRooms()
          return
        }
        // 2) API로 rooms 조회 (서버에서 CS방 자동 생성됨)
        try {
          const res = await edgeApi.chat.getRooms()
          const data = Array.isArray(res.data) ? res.data : []
          const csRoom = res.success && data.length
            ? data.find((r: any) => r.is_cs_room === true)
            : null
          if (csRoom?.id) {
            const rid = csRoom.id
            const pname = (csRoom.display_name as string) || '1:1 문의'
            setSelectedPartnerId(rid)
            setSelectedChatRoomId(rid)
            setSelectedPartnerName(pname)
            setHeaderPartnerName(pname)
            setSelectedPartnerAvatar('/logo.svg')
            setSelectedIsCsRoom(true)
            navigate({ to: '/chat', search: { chatRoomId: rid, partnerName: encodeURIComponent(pname) } })
            markChatAsRead(rid)
            refreshChatRooms()
          }
        } catch (e) {
          console.error('CS room open failed:', e)
        }
        return
      }

      // CS방: chatRoomId만, 일반방: partnerId + chatRoomId
      const effectiveRoomId = roomId || null

      if (isCs) {
        const rid = effectiveRoomId || partnerId
        setSelectedPartnerId(rid)
        setSelectedChatRoomId(rid)
        setSelectedPartnerName(partnerName)
        setHeaderPartnerName(partnerName)
        setSelectedPartnerAvatar('/logo.svg')
        setSelectedIsCsRoom(true)
        navigate({ to: '/chat', search: { chatRoomId: rid, partnerName: encodeURIComponent(partnerName) } })
        markChatAsRead(rid)
      } else {
        const selectedRoom = rooms.find((r) => r.partnerId === partnerId || r.roomId === partnerId)
        setSelectedPartnerId(partnerId)
        setSelectedChatRoomId(effectiveRoomId)
        setSelectedPartnerName(partnerName)
        setHeaderPartnerName(partnerName)
        setSelectedPartnerAvatar(selectedRoom?.partnerAvatar || null)
        setSelectedIsCsRoom(false)

        const search: Record<string, string> = {
          partnerId,
          partnerName: encodeURIComponent(partnerName),
        }
        if (effectiveRoomId) search.chatRoomId = effectiveRoomId
        navigate({ to: '/chat', search })
        markChatAsRead(partnerId)
      }
    },
    [rooms, markChatAsRead, navigate, refreshChatRooms],
  )

  const handleGoBack = useCallback(() => {
    setSelectedPartnerId(null)
    setSelectedChatRoomId(null)
    setSelectedPartnerName('')
    setSelectedPartnerAvatar(null)
    setSelectedIsCsRoom(false)
    setHeaderPartnerName('')
    navigate({ to: '/chat', search: {} })
  }, [navigate])

  const handleUserBlocked = useCallback(() => {
    refreshChatRooms()
    setSelectedPartnerId(null)
    setSelectedChatRoomId(null)
    setSelectedPartnerName('')
  }, [refreshChatRooms])

  const markCurrentRoomAsRead = useCallback(async () => {
    if (!user?.id || !selectedPartnerId) return
    markChatAsRead(selectedPartnerId)
  }, [user?.id, selectedPartnerId, markChatAsRead])

  // 아바타/이름 fetch (CS방은 스킵)
  useEffect(() => {
    const pid = initialPartnerId
    if (!pid || pid === 'cs-placeholder') return
    if (initialChatRoomId) return // chatRoomId가 있으면 CS방
    const isCsInRooms = rooms.some((r) => (r.roomId === pid || r.partnerId === pid) && r.isCsRoom)
    if (isCsInRooms) return
    supabase
      .from('members')
      .select('profile_image, name')
      .eq('id', pid)
      .single()
      .then(({ data: memberData }) => {
        if (memberData?.profile_image) setSelectedPartnerAvatar((prev) => prev || memberData.profile_image)
        if (memberData?.name) setHeaderPartnerName((prev) => prev || memberData.name)
      })
      .catch(() => {})
  }, [initialPartnerId, initialChatRoomId, rooms])

  useEffect(() => {
    const handleWindowFocus = () => {
      if (selectedPartnerId) markCurrentRoomAsRead()
    }
    window.addEventListener('focus', handleWindowFocus)
    return () => window.removeEventListener('focus', handleWindowFocus)
  }, [markCurrentRoomAsRead, selectedPartnerId])

  // cs-placeholder → 실제 CS방으로 치환
  useEffect(() => {
    if (initialPartnerId !== 'cs-placeholder') return
    const openCsRoom = (rid: string, pname: string) => {
      setSelectedPartnerId(rid)
      setSelectedChatRoomId(rid)
      setSelectedPartnerName(pname)
      setHeaderPartnerName(pname)
      setSelectedPartnerAvatar('/logo.svg')
      navigate({ to: '/chat', search: { chatRoomId: rid, partnerName: encodeURIComponent(pname) } })
      markChatAsRead(rid)
    }
    const csFromRooms = rooms.find((r) => r.isCsRoom)
    if (csFromRooms?.roomId) {
      openCsRoom(csFromRooms.roomId, csFromRooms.partnerName || '1:1 문의')
      return
    }
    edgeApi.chat.getRooms().then((res) => {
      const data = Array.isArray(res.data) ? res.data : []
      const csRoom = res.success && data.length
        ? data.find((r: any) => r.is_cs_room === true)
        : null
      if (csRoom?.id) {
        openCsRoom(csRoom.id, csRoom.display_name || '1:1 문의')
        refreshChatRooms()
      } else {
        navigate({ to: '/chat', search: {} })
      }
    }).catch(() => {})
  }, [initialPartnerId, rooms, navigate, refreshChatRooms, markChatAsRead])

  // URL props → 상태 동기화 (뒤로가기, URL 직접 입력 등)
  useEffect(() => {
    if (initialPartnerId && initialPartnerId !== 'cs-placeholder') {
      setSelectedPartnerId(initialPartnerId)
      setSelectedChatRoomId(initialChatRoomId || null)
      setSelectedPartnerName(initialPartnerName || '')
      setHeaderPartnerName(initialPartnerName || '')
      setSelectedIsCsRoom(false)
    } else if (initialChatRoomId && !initialPartnerId) {
      // CS방: chatRoomId만 있고 partnerId가 없는 경우
      setSelectedPartnerId(initialChatRoomId)
      setSelectedChatRoomId(initialChatRoomId)
      setSelectedPartnerName(initialPartnerName || '1:1 문의')
      setHeaderPartnerName(initialPartnerName || '1:1 문의')
      setSelectedPartnerAvatar('/logo.svg')
      setSelectedIsCsRoom(true)
    } else if (!initialPartnerId && !initialChatRoomId) {
      setSelectedPartnerId(null)
      setSelectedChatRoomId(null)
      setSelectedPartnerName('')
      setSelectedPartnerAvatar(null)
      setHeaderPartnerName('')
      setSelectedIsCsRoom(false)
    }
  }, [initialPartnerId, initialPartnerName, initialChatRoomId])

  // rooms 보강
  useEffect(() => {
    if (!selectedPartnerId || !rooms.length) return
    const matchingRoom = rooms.find(r => r.partnerId === selectedPartnerId || r.roomId === selectedPartnerId)
    if (!matchingRoom) return
    if (matchingRoom.isCsRoom) {
      setSelectedChatRoomId(matchingRoom.roomId || selectedPartnerId)
      setSelectedPartnerAvatar('/logo.svg')
      setSelectedIsCsRoom(true)
    } else if (matchingRoom.partnerAvatar) {
      setSelectedPartnerAvatar(matchingRoom.partnerAvatar)
    }
    if (matchingRoom.partnerName && !selectedPartnerName) {
      setSelectedPartnerName(matchingRoom.partnerName)
      setHeaderPartnerName(matchingRoom.partnerName)
    }
  }, [selectedPartnerId, rooms])

  // 현재 열린 채팅방 추적 (실시간 읽음 처리용)
  useEffect(() => {
    setCurrentOpenChatPartnerId(selectedPartnerId && selectedPartnerId !== 'cs-placeholder' ? selectedPartnerId : null)
    return () => {
      setCurrentOpenChatPartnerId(null)
    }
  }, [selectedPartnerId, setCurrentOpenChatPartnerId])

  // 실시간 메시지 및 읽기 상태 변경 감지
  useEffect(() => {
    if (!user?.id || !realtimeConnection.isConnected) return

    // 새 메시지 구독
    const unsubscribeMessages = realtimeConnection.subscribe({
      event: 'INSERT',
      schema: 'public',
      table: 'member_chats',
      callback: (payload) => {
        const newMessage = payload.new as any
        // 내가 관련된 메시지인지 확인 (보내거나 받는 메시지)
        if (
          newMessage.sender_id === user.id ||
          newMessage.receiver_id === user.id
        ) {
          // 채팅방 목록은 전역 Provider에서 자동 업데이트됨

          // 상대방이 보낸 메시지인 경우
          if (newMessage.sender_id !== user.id) {
            // 현재 열린 채팅방이 아닌 경우에만 읽지 않은 메시지로 카운트
            if (newMessage.sender_id !== selectedPartnerId) {
              // 오프라인/백그라운드 상태 감지
              const isOffline = typeof navigator !== 'undefined' ? !navigator.onLine : false
              const isDocumentHidden =
                typeof document !== 'undefined' ? document.visibilityState === 'hidden' : false
              const hasNotificationApi = typeof Notification !== 'undefined'
              const hasPermission = hasNotificationApi && Notification.permission === 'granted'
              const shouldRelyOnServerPush = isOffline || !hasPermission || isDocumentHidden

              // 알림 표시
              const sendNotification = async () => {
                try {
                  const { data: senderData } = await supabase
                    .from('members')
                    .select('name, profile_image')
                    .eq('id', newMessage.sender_id)
                    .single()

                  const senderName = senderData?.name || '알 수 없는 사용자'
                  const messagePreview =
                    newMessage.message.length > 50
                      ? newMessage.message.substring(0, 50) + '...'
                      : newMessage.message

                  // 오프라인 상태이거나 브라우저 알림이 허용되지 않은 경우
                  // 혹은 문서가 백그라운드 상태라면 서버 푸시에 의존
                  if (shouldRelyOnServerPush) {
                    try {
                      // 서버에 푸시 알림 요청 (push-notification-auto 엔드포인트 사용)
                      // 이는 Supabase 트리거가 이미 처리하지만, 클라이언트에서도 명시적으로 요청 가능
                      // 실제로는 Supabase Edge Function이 자동으로 네이티브 푸시를 큐잉함
                      console.log('📱 서버 푸시에 의존 (오프라인/백그라운드/권한 없음)')
                    } catch (error) {
                      console.error('푸시 알림 요청 실패:', error)
                    }
                  } else {
                    // 온라인 상태이고 알림 권한이 있으면 브라우저 알림 표시
                  await showNotification(`${senderName}님으로부터 메시지`, {
                    body: messagePreview,
                    icon: senderData?.profile_image || '/favicon.ico',
                  })
                  }
                } catch (error) {
                  console.error('알림 표시 실패:', error)
                }
              }
              void sendNotification()
            }
          }
        }
      }
    })

    return () => {
      unsubscribeMessages()
    }
  }, [
    user?.id,
    realtimeConnection.isConnected,
    realtimeConnection.subscribe,
    selectedPartnerId,
    showNotification
  ])

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500">로그인이 필요합니다.</p>
      </div>
    )
  }

  const showCompactHeader = Boolean(selectedPartnerId || initialPartnerId)

  // 모바일에서 채팅방 선택 여부에 따라 표시/숨김 결정
  const showChatRoomList = !isMobile || !selectedPartnerId
  const showChatContent = !isMobile || selectedPartnerId

  // 채팅방 메뉴: 오른쪽→왼쪽 스와이프 제스처 (손가락 따라 이동)
  useEffect(() => {
    if (!isMobile || !selectedPartnerId) return

    const MENU_W = 288
    const THRESHOLD = MENU_W * 0.3
    const drag = { startX: 0, startY: 0, currentX: 0, active: false, locked: false, horizontal: false }

    const getEls = () => ({
      aside: document.getElementById('chat-right-menu-aside'),
      overlay: document.getElementById('chat-right-menu-overlay'),
      container: document.getElementById('chat-right-menu-container'),
    })

    const onStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('[data-feed-carousel]')) return
      drag.startX = e.touches[0].clientX
      drag.startY = e.touches[0].clientY
      drag.currentX = drag.startX
      drag.active = true
      drag.locked = false
      drag.horizontal = false
    }
    const onMove = (e: TouchEvent) => {
      if (!drag.active) return
      drag.currentX = e.touches[0].clientX
      const dx = drag.currentX - drag.startX
      const dy = e.touches[0].clientY - drag.startY
      if (!drag.locked) {
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
          drag.locked = true
          drag.horizontal = Math.abs(dx) > Math.abs(dy) && dx < 0
          if (!drag.horizontal) { drag.active = false; return }
        } else return
      }
      if (!drag.horizontal) return
      e.preventDefault()
      const absDx = Math.max(0, Math.min(-dx, MENU_W))
      const progress = absDx / MENU_W
      const { aside, overlay, container } = getEls()
      if (aside) { aside.style.transition = 'none'; aside.style.translate = `${MENU_W - absDx}px 0` }
      if (overlay) { overlay.style.transition = 'none'; overlay.style.opacity = String(progress * 0.4) }
      if (container) container.style.pointerEvents = absDx > 0 ? 'auto' : 'none'
    }
    const onEnd = () => {
      if (!drag.active || !drag.horizontal) { drag.active = false; return }
      drag.active = false
      const absDx = Math.max(0, -(drag.currentX - drag.startX))
      const shouldOpen = absDx > THRESHOLD
      const { aside, overlay, container } = getEls()
      if (shouldOpen) {
        if (aside) { aside.style.transition = 'translate 0.25s ease-out'; aside.style.translate = '0 0' }
        if (overlay) { overlay.style.transition = 'opacity 0.25s ease-out'; overlay.style.opacity = '0.4' }
        setTimeout(() => {
          [aside, overlay, container].forEach(el => { if (el) { el.style.transition = ''; el.style.translate = ''; el.style.opacity = ''; el.style.pointerEvents = '' } })
          window.dispatchEvent(new CustomEvent('open-chat-right-menu'))
        }, 260)
      } else {
        if (aside) { aside.style.transition = 'translate 0.25s ease-out'; aside.style.translate = '100% 0' }
        if (overlay) { overlay.style.transition = 'opacity 0.25s ease-out'; overlay.style.opacity = '0' }
        setTimeout(() => {
          [aside, overlay, container].forEach(el => { if (el) { el.style.transition = ''; el.style.translate = ''; el.style.opacity = ''; el.style.pointerEvents = '' } })
        }, 260)
      }
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: false })
    document.addEventListener('touchend', onEnd)
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      document.removeEventListener('touchend', onEnd)
    }
  }, [isMobile, selectedPartnerId])

  return (
    <div
      className={`flex bg-white ${isMobile ? 'h-full relative' : 'h-full'}`}
    >
      {/* 연결 상태 표시 - 에러일 때만 표시 */}
      {stableConnectionError && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-red-100 border-b border-red-300 px-4 py-2">
          <div className="flex items-center justify-center gap-2">
            <div className="w-4 h-4 bg-red-500 rounded-full"></div>
            <span className="text-sm text-red-800">채팅 연결에 문제가 발생했습니다.</span>
            <button
              onClick={realtimeConnection.reconnect}
              className="text-sm text-red-900 underline hover:no-underline"
            >
              다시 연결
            </button>
          </div>
        </div>
      )}

      {/* 채팅방 목록 (모바일: 채팅방 선택 시 숨김) */}
      {showChatRoomList && (
        <ChatRoomList
          key={`chat-room-list-${selectedPartnerId || 'home'}`}
          rooms={rooms}
          isLoading={false}
          selectedPartnerId={selectedPartnerId}
          onSelectRoom={handleSelectRoom}
          isPartner={isPartner}
          isAdmin={isAdmin}
          currentUserId={user.id}
        />
      )}

      {/* 모바일 왼쪽 엣지 스와이프 → 채팅방 목록 복귀 */}
      {isMobile && selectedPartnerId && (
        <div
          className="fixed left-0 top-0 bottom-0 w-6 z-30"
          onTouchStart={(e) => {
            edgeSwipeRef.current.startX = e.touches[0].clientX
            edgeSwipeRef.current.startY = e.touches[0].clientY
            edgeSwipeRef.current.active = true
          }}
          onTouchMove={(e) => {
            if (!edgeSwipeRef.current.active) return
            const dx = e.touches[0].clientX - edgeSwipeRef.current.startX
            const dy = Math.abs(e.touches[0].clientY - edgeSwipeRef.current.startY)
            if (dx > 50 && dy < 30) {
              edgeSwipeRef.current.active = false
              handleGoBack()
            }
          }}
          onTouchEnd={() => { edgeSwipeRef.current.active = false }}
        />
      )}

      {/* 모바일 오른쪽→왼쪽 스와이프 → 채팅방 메뉴 열기 (손가락 따라 이동) */}

      {/* 채팅 콘텐츠 (모바일: 채팅방 선택 시만 표시) */}
      {showChatContent && (
        <div
          className={`flex-1 flex flex-col bg-white ${isMobile ? 'absolute inset-0' : ''} ${stableConnectionError ? 'pt-12' : ''}`}
        >
          {/* 채팅 룸 또는 빈 화면 - cs-placeholder는 API에서 UUID 필요하므로 렌더 제외 */}
          {selectedPartnerId && selectedPartnerId !== 'cs-placeholder' ? (
            <SimpleChatRoom
              currentUserId={user.id}
              partnerId={selectedPartnerId}
              partnerName={selectedPartnerName}
              partnerAvatar={selectedPartnerAvatar}
              chatRoomId={selectedChatRoomId || undefined}
              isCsRoom={selectedIsCsRoom}
              hideHeader={showCompactHeader && isMobile}
              onGoBack={showCompactHeader ? handleGoBack : undefined}
              onUserBlocked={handleUserBlocked}
              initialTempMessage={selectedPartnerId === initialPartnerId ? initialTempMessage : undefined}
              initialJobRequest={selectedPartnerId === initialPartnerId ? initialJobRequest : undefined}
            />
          ) : (
            <EmptyChatView />
          )}
        </div>
      )}
    </div>
  )
})
