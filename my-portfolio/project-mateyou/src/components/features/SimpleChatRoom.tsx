import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { X, CreditCard, ChevronRight, Camera as CameraIcon } from 'lucide-react'
import { ChatInput, ChatMessages } from './chat'
import type { Swiper as SwiperType } from 'swiper'
import { toast } from 'sonner'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'

import { supabase } from '@/lib/supabase'
import { useChatMessages, useSendMessage } from '@/hooks/useSimpleChat'
import { usePartnerJobs } from '@/hooks/usePartnerJobs'
import { useGlobalRealtime } from '@/contexts/GlobalRealtimeProvider'
import { useDevice } from '@/hooks/useDevice'
import { useAuth } from '@/hooks/useAuth'
import { useRequestStatus } from '@/hooks/useRequestStatus'
import { usePartnerRequests } from '@/hooks/usePartnerRequests'
import { useChatReviewTrigger } from '@/hooks/useChatReviewTrigger'
import { edgeApi } from '@/lib/edgeApi'
import { mateYouApi } from '@/lib/apiClient'
import { useBannedWords } from '@/hooks/useBannedWords'
import { ReviewModal, ChargeModal } from '@/components/modals'
import { Button, SlideSheet, Input } from '@/components'
import { LocationPickerSheet } from '@/components/ui/LocationPickerSheet'
import { useUIStore } from '@/store/useUIStore'
import { storeSchedulesApi, type StoreSchedule } from '@/api/store/schedules'
import { storeOrdersApi } from '@/api/store/orders'
import { storeCollaborationApi, type OrderFulfillment } from '@/api/store/collaboration'
import Calendar from 'react-calendar'
import 'react-calendar/dist/Calendar.css'
import { Typography } from '@/components'
import { ScheduleTimeSlotSelector, CALENDAR_STYLES } from '@/components/ui/ScheduleTimeSlotSelector'
import { MapContainer, TileLayer, Marker } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Leaflet 기본 마커 아이콘 설정
const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
})
L.Marker.prototype.options.icon = defaultIcon

const MOBILE_HEADER_EXTRA_GAP = 12
const MOBILE_TABBAR_HEIGHT = 48
// 한국 시간 문자열을 UTC 변환 없이 로컬 Date로 파싱
// "2026-01-22 14:00:00" 또는 "2026-01-22T14:00:00" 형식
function parseKoreanDateTime(dateTimeStr: string): Date {
  if (!dateTimeStr) return new Date()
  // "YYYY-MM-DD HH:mm:ss" 또는 "YYYY-MM-DDTHH:mm:ss" 형식 처리
  const normalized = dateTimeStr.replace(' ', 'T').split('.')[0] // 밀리초 제거
  const [datePart, timePart] = normalized.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const [hours, minutes, seconds] = (timePart || '00:00:00').split(':').map(Number)
  return new Date(year, month - 1, day, hours, minutes, seconds || 0)
}

// 한국 시간 문자열에서 날짜 포맷팅 (UTC 변환 없이)
function formatKoreanDate(dateTimeStr: string, options: { month?: 'long' | 'short'; day?: 'numeric' } = {}): string {
  const date = parseKoreanDateTime(dateTimeStr)
  const month = date.getMonth() + 1
  const day = date.getDate()
  if (options.month === 'long') {
    return `${month}월 ${day}일`
  }
  if (options.month === 'short') {
    return `${month}월 ${day}일`
  }
  return `${month}월 ${day}일`
}

// 한국 시간 문자열에서 시간 포맷팅 (UTC 변환 없이)
function formatKoreanTime(dateTimeStr: string): string {
  const date = parseKoreanDateTime(dateTimeStr)
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${hours}:${minutes}`
}

// 스케줄 시간 슬롯 선택 컴포넌트
interface SimpleChatRoomProps {
  currentUserId: string
  partnerId: string
  partnerName?: string
  partnerAvatar?: string | null
  chatRoomId?: string
  isCsRoom?: boolean
  hideHeader?: boolean
  onGoBack?: () => void
  onUserBlocked?: () => void
  initialTempMessage?: string
  initialJobRequest?: string // 퀘스트 요청 JSON 데이터
}

export const SimpleChatRoom = memo(function SimpleChatRoom({
  currentUserId,
  partnerId,
  partnerName,
  partnerAvatar,
  chatRoomId,
  isCsRoom: isCsRoomProp = false,
  hideHeader = false,
  onGoBack,
  onUserBlocked,
  initialTempMessage,
  initialJobRequest,
}: SimpleChatRoomProps) {
  const { isMobile, isNative } = useDevice()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { markChatAsRead } = useGlobalRealtime()
  
  const [newMessage, setNewMessage] = useState('')
  const [jobCounts, setJobCounts] = useState<Record<string, number>>({})
  const [userPoints, setUserPoints] = useState<number>(user?.total_points || 0)
  const [userPointsLoading, setUserPointsLoading] = useState(true)
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0)
  const [blockedUsers, setBlockedUsers] = useState<Array<string>>([])
  const [isComposing, setIsComposing] = useState(false)
  const [isBlockedByPartner, setIsBlockedByPartner] = useState<boolean | null>(null) // null = 로딩중
  const [isBlockedByMe, setIsBlockedByMe] = useState(false) // 내가 상대방을 차단했는지
  const [partnerMemberCode, setPartnerMemberCode] = useState<string | null>(null)
  const [partnerStats, setPartnerStats] = useState<{ postsCount: number; followersCount: number }>({ postsCount: 0, followersCount: 0 })
  const [resolvedPartnerName, setResolvedPartnerName] = useState<string>(partnerName || '')
  const [isSubscribedToPartner, setIsSubscribedToPartner] = useState(false) // 파트너 멤버십 구독 여부
  const [isPartnerRolePartner, setIsPartnerRolePartner] = useState(false) // 상대방이 실제 파트너(role=partner)인지
  const [isCurrentUserActualPartner, setIsCurrentUserActualPartner] = useState(false) // 현재 사용자가 실제 파트너인지
  const [currentUserPartnerId, setCurrentUserPartnerId] = useState<string | null>(null) // 현재 사용자의 partner_id
  const [messageCostInfo, setMessageCostInfo] = useState<{
    shouldPay: boolean
    freeRemaining: number
    membershipQuotaRemaining: number
    chatPrice: number
  }>({ shouldPay: true, freeRemaining: 0, membershipQuotaRemaining: 0, chatPrice: 100 })
  const [csInquiryCategory, setCsInquiryCategory] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const swiperRef = useRef<SwiperType | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)

  const isAdmin = user?.role === 'admin' || ((user as any)?.admin_role ?? 0) >= 4
  const isCsRoom = Boolean(isCsRoomProp)
  const isCsRoomUser = isCsRoom && !isAdmin
  const { messages, isLoading, isLoadingMore, addMessage, removeMessage, refreshMessages, roomId, loadMoreMessages, hasMore } =
    useChatMessages(currentUserId, partnerId, chatRoomId)
  const { sendMessage, sendMessageWithMedia, uploadFiles, isSending } = useSendMessage()
  const { findProhibitedWord } = useBannedWords()
  const { jobs, isLoading: jobsLoading, isPartner } =
    usePartnerJobs(isCsRoom ? null : partnerId, true)
  const { requestInfo, activeRequests, refreshStatus } =
    useRequestStatus(currentUserId, isCsRoom ? '' : partnerId)
  const { acceptRequest, rejectRequest, completeRequest, isAccepting } =
    usePartnerRequests()
  const { completedRequest, closeReviewModal } = useChatReviewTrigger(
    currentUserId,
    isCsRoom ? '' : partnerId,
  )
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    null,
  )
  const [isChargeModalOpen, setIsChargeModalOpen] = useState(false)
  const [chargeRequiredPoints, setChargeRequiredPoints] = useState<number>(0)
  const [isJobsSectionVisible, setIsJobsSectionVisible] = useState(false)
  const [isQuestPopupOpen, setIsQuestPopupOpen] = useState(false)
  const [isRequesting, setIsRequesting] = useState(false)
  const isRequestingRef = useRef(false) // 더블클릭 방지용 ref
  
  // 일정 확정 팝업 상태
  const [isScheduleConfirmSheetOpen, setIsScheduleConfirmSheetOpen] = useState(false)
  const [selectedOrderIdForSchedule, setSelectedOrderIdForSchedule] = useState<string | null>(null)
  const [selectedOrderNumber, setSelectedOrderNumber] = useState<string | null>(null)
  const [selectedOrderProduct, setSelectedOrderProduct] = useState<{ name?: string; thumbnail_url?: string; price?: number } | null>(null)
  const [originalSchedule, setOriginalSchedule] = useState<{ start_time?: string; end_time?: string; location?: string; location_point?: { lat: number; lng: number } } | null>(null)
  const [isEditingSchedule, setIsEditingSchedule] = useState(false)
  const [scheduleStartTime, setScheduleStartTime] = useState('')
  const [scheduleEndTime, setScheduleEndTime] = useState('')
  const [scheduleLocation, setScheduleLocation] = useState('')
  const [scheduleLocationPoint, setScheduleLocationPoint] = useState<{ lat: number; lng: number } | null>(null)
  const [isScheduleLocationPickerOpen, setIsScheduleLocationPickerOpen] = useState(false)
  const [isConfirmingSchedule, setIsConfirmingSchedule] = useState(false)
  const [isRejectingSchedule, setIsRejectingSchedule] = useState(false)
  
  // 스케줄 선택 관련 상태
  const [partnerSchedules, setPartnerSchedules] = useState<any[]>([])
  const [isLoadingPartnerSchedules, setIsLoadingPartnerSchedules] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedStartTimeSlot, setSelectedStartTimeSlot] = useState<string | null>(null)
  const [selectedEndTimeSlot, setSelectedEndTimeSlot] = useState<string | null>(null)
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null)
  
  // 처리 완료된 주문 ID 목록 (수령완료/미수령 처리 후 버튼 숨김용)
  const [processedOrderIds, setProcessedOrderIds] = useState<string[]>([])
  
  // 중복 클릭 방지용 상태
  const [isCompletingRequest, setIsCompletingRequest] = useState(false)
  const [processingOrderActionIds, setProcessingOrderActionIds] = useState<Set<string>>(new Set())
  
  // 택배 송장 입력 모달 상태
  const [isTrackingSheetOpen, setIsTrackingSheetOpen] = useState(false)
  const [selectedOrderIdForTracking, setSelectedOrderIdForTracking] = useState<string | null>(null)
  const [trackingCourier, setTrackingCourier] = useState('')
  const [trackingNumber, setTrackingNumber] = useState('')
  const [isSubmittingTracking, setIsSubmittingTracking] = useState(false)
  
  // 이행완료 모달 상태
  const [isFulfillmentSheetOpen, setIsFulfillmentSheetOpen] = useState(false)
  const [selectedOrderIdForFulfillment, setSelectedOrderIdForFulfillment] = useState<string | null>(null)
  const [fulfillmentFiles, setFulfillmentFiles] = useState<File[]>([])
  const [fulfillmentNote, setFulfillmentNote] = useState('')
  const [isSubmittingFulfillment, setIsSubmittingFulfillment] = useState(false)
  const [orderFulfillments, setOrderFulfillments] = useState<OrderFulfillment[]>([])
  const [fulfillmentOrderInfo, setFulfillmentOrderInfo] = useState<{ delivery_memo?: string; product_name?: string } | null>(null)
  const fulfillmentFileInputRef = useRef<HTMLInputElement>(null)
  
  // 미수령 팝업 상태 (구매자용)
  const [isNoShowSheetOpen, setIsNoShowSheetOpen] = useState(false)
  const [selectedOrderIdForNoShow, setSelectedOrderIdForNoShow] = useState<string | null>(null)
  const [noShowReason, setNoShowReason] = useState('')
  const [isSubmittingNoShow, setIsSubmittingNoShow] = useState(false)
  
  // 주문 조회 팝업 상태
  const [isOrderListSheetOpen, setIsOrderListSheetOpen] = useState(false)
  const [chatRoomOrders, setChatRoomOrders] = useState<any[]>([])
  const [isLoadingChatRoomOrders, setIsLoadingChatRoomOrders] = useState(false)
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<any>(null)
  const [isOrderDetailSheetOpen, setIsOrderDetailSheetOpen] = useState(false)
  
  // 전역 하트 보내기 팝업
  const { openDonationSheet, isDonationSheetOpen } = useUIStore()
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null)
  const headerRef = useRef<HTMLDivElement>(null)
  const requestStatusRef = useRef<HTMLDivElement>(null)
  const [requestStatusHeight, setRequestStatusHeight] = useState(0)
  
  // 채팅방 공지 상태
  const [chatNotice, setChatNotice] = useState<{ id: string; content: string; created_at: string } | null>(null)
  const [isNoticeCollapsed, setIsNoticeCollapsed] = useState(false)
  const [isNoticeExpanded, setIsNoticeExpanded] = useState(false)
  const [isNoticeLoading, setIsNoticeLoading] = useState(true)
  const lastCheckedNoticeMessageRef = useRef<string | null>(null)

  // 남은 시간을 "00:00" 형식(분:초)으로 변환하는 함수
  const formatRemainingTime = (seconds: number): string => {
    if (seconds <= 0) return '00:00'
    const minutes = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  const inputContainerRef = useRef<HTMLDivElement>(null)
  const [mobileLayoutHeights, setMobileLayoutHeights] = useState<{
    header: number
    jobs: number
    input: number
  }>({
    header: 0,
    jobs: 0,
    input: 0,
  })

  // 현재 사용자가 파트너인지 확인 (admin은 제외)
  const isCurrentUserPartner = user?.role === 'partner'

  const shouldRenderJobsSection = isPartner && (!hideHeader || isMobile) && !isBlockedByPartner

  // 모바일 레이아웃 높이 계산
  useEffect(() => {
    if (!isMobile) return

    const updateHeights = () => {
      const headerHeight = hideHeader
        ? 0
        : (headerRef.current?.offsetHeight ?? 0)
      const jobsHeight = 0 // 퀘스트 배너 제거됨 (팝업으로 변경)
      const inputHeight = inputContainerRef.current?.offsetHeight ?? 0

      setMobileLayoutHeights({
        header: headerHeight,
        jobs: jobsHeight,
        input: inputHeight,
      })
    }

    const observer = new ResizeObserver(updateHeights)
    if (headerRef.current) observer.observe(headerRef.current)
    if (inputContainerRef.current) observer.observe(inputContainerRef.current)

    updateHeights()
    window.addEventListener('resize', updateHeights)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updateHeights)
    }
  }, [hideHeader, isMobile, isPartner, shouldRenderJobsSection])

  useEffect(() => {
    const checkBlockedStatus = async () => {
      if (isCsRoom || !currentUserId || !partnerId) {
        if (isCsRoom) {
          setIsBlockedByPartner(false)
          setIsBlockedByMe(false)
          setIsPartnerRolePartner(false)
        }
        return
      }

      try {
        // 파트너의 member_code 먼저 조회
        const { data: memberData } = await supabase
          .from('members')
          .select('member_code')
          .eq('id', partnerId)
          .single() as { data: { member_code: string } | null }

        if (memberData?.member_code) {
          setPartnerMemberCode(memberData.member_code)
        }

        // 상대방이 파트너인지 확인 (members.role + partners 테이블 모두 확인)
        const { data: partnerMemberData } = await supabase
          .from('members')
          .select('role')
          .eq('id', partnerId)
          .single() as { data: { role?: string } | null }
        
        const partnerRole = partnerMemberData?.role
        const isPartnerByRole = partnerRole === 'partner' || partnerRole === 'admin'
        
        // partners 테이블에도 있는지 확인
        const { data: partnerData } = await supabase
          .from('partners')
          .select('id')
          .eq('member_id', partnerId)
          .maybeSingle()
        
        // members.role이 partner/admin이고 partners 테이블에도 있어야 진짜 파트너
        const isRealPartner = isPartnerByRole && !!partnerData
        console.log('[SimpleChatRoom] 파트너 확인:', { partnerId, memberRole: partnerRole, partnerData: !!partnerData, isRealPartner })
        setIsPartnerRolePartner(isRealPartner)

        // 현재 사용자가 파트너인지 확인 (partners 테이블에서 조회)
        const { data: currentUserPartnerData } = await supabase
          .from('partners')
          .select('id')
          .eq('member_id', currentUserId)
          .maybeSingle()
        
        setIsCurrentUserActualPartner(!!currentUserPartnerData)
        setCurrentUserPartnerId(currentUserPartnerData?.id || null)

        // 차단 상태 확인 (실패해도 채팅은 계속 진행)
        try {
          const response = await edgeApi.members.checkBlockedByTarget(partnerId) as {
            success: boolean
            data?: { blockedByTarget: boolean; blockedByMe: boolean }
          }
          
          if (response.success && response.data) {
            setIsBlockedByPartner(!!response.data.blockedByTarget)
            setIsBlockedByMe(!!response.data.blockedByMe)
          } else {
            setIsBlockedByPartner(false)
            setIsBlockedByMe(false)
          }
        } catch {
          // 차단 상태 확인 실패해도 채팅은 정상 진행
          setIsBlockedByPartner(false)
          setIsBlockedByMe(false)
        }
      } catch (error) {
        console.error('파트너 상태 확인 실패:', error)
        // 파트너 상태만 초기화, 차단 상태는 기본값으로
        setIsBlockedByPartner(false)
        setIsBlockedByMe(false)
      }
    }

    // 상태 초기화 후 체크
    setIsBlockedByPartner(null)
    setIsBlockedByMe(false)
    setIsPartnerRolePartner(false)
    setIsCurrentUserActualPartner(false)
    setCurrentUserPartnerId(null)
    checkBlockedStatus()
  }, [currentUserId, partnerId, isCsRoom])

  useEffect(() => {
    const fetchPartnerStats = async () => {
      if (isCsRoom || !partnerId) return

      try {
        // 파트너의 member_code 조회
        const { data: memberData } = await supabase
          .from('members')
          .select('member_code')
          .eq('id', partnerId)
          .single() as { data: { member_code: string } | null }

        console.log('📊 [PartnerStats] memberData:', memberData)

        if (memberData?.member_code) {
          const response = await edgeApi.partners.getDetailsByMemberCode(memberData.member_code) as {
            success: boolean
            data?: { posts_count?: number; followers_count?: number }
          }

          console.log('📊 [PartnerStats] API response:', response)

          if (response.success && response.data) {
            const stats = {
              postsCount: response.data.posts_count || 0,
              followersCount: response.data.followers_count || 0,
            }
            console.log('📊 [PartnerStats] Setting stats:', stats)
            setPartnerStats(stats)
          }
        }
      } catch (error) {
        console.error('파트너 정보 조회 실패:', error)
      }
    }

    fetchPartnerStats()
  }, [partnerId, isCsRoom])

  useEffect(() => {
    if (partnerName) {
      setResolvedPartnerName(partnerName)
      return
    }
    if (isCsRoom) {
      setResolvedPartnerName('CS 문의')
      return
    }
    if (!partnerId) return

    const fetchPartnerName = async () => {
      try {
        const { data } = await supabase
          .from('members')
          .select('name')
          .eq('id', partnerId)
          .single() as { data: { name: string } | null }
        if (data?.name) {
          setResolvedPartnerName(data.name)
        }
      } catch (e) {
        console.error('파트너 이름 조회 실패:', e)
      }
    }
    fetchPartnerName()
  }, [partnerId, partnerName, isCsRoom])

  // 채팅방 입장 시 메시지 읽음 처리
  useEffect(() => {
    if (partnerId) {
      markChatAsRead(partnerId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partnerId])
  
  useEffect(() => {
    const loadMessageCostInfo = async () => {
      if (isCsRoom || !currentUserId || !partnerId || !roomId || !isPartnerRolePartner) {
        return
      }
      
      try {
        // 1. 채팅방의 used_free_message_count 조회
        const { data: roomData } = await supabase
          .from('chat_rooms')
          .select('used_free_message_count')
          .eq('id', roomId)
          .single() as { data: { used_free_message_count: number | null } | null }
        
        const usedFreeCount = roomData?.used_free_message_count || 0
        
        // 2. 파트너 정보 조회 (free_message_count, chat_price)
        const { data: partnerData } = await supabase
          .from('partners')
          .select('id, free_message_count, chat_price')
          .eq('member_id', partnerId)
          .single() as { data: { id: string; free_message_count: number | null; chat_price: number | null } | null }
        
        const partnerFreeCount = partnerData?.free_message_count || 0
        const chatPrice = partnerData?.chat_price || 100
        const freeRemaining = Math.max(0, partnerFreeCount - usedFreeCount)
        
        // 3. 멤버십 구독 정보 조회
        let membershipQuotaRemaining = 0
        
        if (partnerData?.id) {
          const { data: subscriptions } = await supabase
            .from('membership_subscriptions')
            .select(`
              id,
              message_count,
              membership:membership_id(
                id,
                partner_id,
                paid_message_quota
              )
            `)
            .eq('user_id', currentUserId)
            .eq('status', 'active') as { data: Array<{
              id: string
              message_count: number | null
              membership: { id: string; partner_id: string; paid_message_quota: number | null } | null
            }> | null }
          
          if (subscriptions && subscriptions.length > 0) {
            const partnerSub = subscriptions.find(
              (sub) => sub.membership?.partner_id === partnerData.id
            )
            if (partnerSub) {
              const quota = partnerSub.membership?.paid_message_quota || 0
              const usedCount = partnerSub.message_count || 0
              membershipQuotaRemaining = Math.max(0, quota - usedCount)
            }
          }
        }
        
        // 4. 비용 지불 여부 계산
        const shouldPay = freeRemaining <= 0 && membershipQuotaRemaining <= 0
        
        setMessageCostInfo({
          shouldPay,
          freeRemaining,
          membershipQuotaRemaining,
          chatPrice,
        })
      } catch (error) {
        console.error('메시지 비용 정보 로드 실패:', error)
      }
    }
    
    loadMessageCostInfo()
  }, [currentUserId, partnerId, roomId, isPartnerRolePartner, messages.length, isCsRoom])

  // 새 메시지 수신 시 즉시 읽음 처리
  const prevMessagesLengthRef = useRef(messages.length)
  useEffect(() => {
    if (messages.length > prevMessagesLengthRef.current && partnerId) {
      const lastMessage = messages[messages.length - 1]
      // 상대방이 보낸 메시지면 읽음 처리
      if (lastMessage && lastMessage.sender_id === partnerId) {
        markChatAsRead(partnerId)
      }
    }
    prevMessagesLengthRef.current = messages.length
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, partnerId])

  const fetchChatNotice = useCallback(async () => {
    if (isCsRoom || !currentUserId || !partnerId) {
      setIsNoticeLoading(false)
      return
    }

    try {
      setIsNoticeLoading(true)
      
      const { data: currentUserPartner } = await supabase
        .from('partners')
        .select('id, member_id')
        .eq('member_id', currentUserId)
        .maybeSingle()
      
      const { data: otherUserPartner } = await supabase
        .from('partners')
        .select('id, member_id')
        .eq('member_id', partnerId)
        .maybeSingle()
      
      type NoticeItem = { id: string; content: string; created_at: string }
      type NoticeResponse = { success: boolean; data?: NoticeItem[] | NoticeItem | null }
      
      const extractNotice = (response: NoticeResponse, creatorId?: string): NoticeItem | null => {
        if (!response.success || !response.data) return null
        if (Array.isArray(response.data)) {
          const items = creatorId 
            ? response.data.filter((item: any) => item.creator_id === creatorId)
            : response.data
          const first = items[0]
          if (first?.id && first?.content) return first
          return null
        }
        if (response.data.id && response.data.content) {
          if (creatorId && (response.data as any).creator_id !== creatorId) return null
          return response.data
        }
        return null
      }
      
      if (otherUserPartner) {
        const otherResponse = await edgeApi.chatNotice.getByPartnerId(partnerId) as NoticeResponse
        const otherNotice = extractNotice(otherResponse, partnerId)
        if (otherNotice) {
          setChatNotice(otherNotice)
        } else if (currentUserPartner) {
          const myResponse = await edgeApi.chatNotice.getByPartnerId(currentUserId) as NoticeResponse
          const myNotice = extractNotice(myResponse, currentUserId)
          setChatNotice(myNotice)
        } else {
          setChatNotice(null)
        }
      } else if (currentUserPartner) {
        const response = await edgeApi.chatNotice.getByPartnerId(currentUserId) as NoticeResponse
        const notice = extractNotice(response, currentUserId)
        setChatNotice(notice)
      } else {
        setChatNotice(null)
      }
    } catch {
      setChatNotice(null)
    } finally {
      setIsNoticeLoading(false)
    }
  }, [currentUserId, partnerId, isCsRoom])

  // 채팅방 공지 초기 조회
  useEffect(() => {
    fetchChatNotice()
  }, [fetchChatNotice])

  // [NOTICE_UPDATED] 메시지 감지 시 공지 새로고침
  useEffect(() => {
    if (messages.length === 0) return
    
    const lastMessage = messages[messages.length - 1]
    if (
      lastMessage?.message === '[NOTICE_UPDATED]' &&
      lastMessage?.sender_id !== currentUserId &&
      lastCheckedNoticeMessageRef.current !== lastMessage.id
    ) {
      lastCheckedNoticeMessageRef.current = lastMessage.id
      fetchChatNotice()
    }
  }, [messages, currentUserId, fetchChatNotice])

  // 파트너 멤버십 구독 여부 확인 (양방향: 내가 상대를 구독 OR 상대가 나를 구독)
  useEffect(() => {
    let isCancelled = false
    
    const checkSubscription = async () => {
      if (isCsRoom || !currentUserId || !partnerId) {
        console.log('🎫 [Subscription] 조건 불충족:', { currentUserId, partnerId })
        return
      }

      try {
        const session = await supabase.auth.getSession()
        const token = session.data.session?.access_token
        
        if (isCancelled) return
        
        if (!token) {
          console.log('🎫 [Subscription] 토큰 없음')
          if (!isCancelled) setIsSubscribedToPartner(false)
          return
        }

        // 1) 상대방(partnerId)이 파트너인지 확인 -> 내가 상대를 구독중인지 체크
        const { data: partnerData } = await supabase
          .from('partners')
          .select('id')
          .eq('member_id', partnerId)
          .maybeSingle()

        if (isCancelled) return

        // 2) 내가 파트너인지 확인 -> 상대가 나를 구독중인지 체크
        const { data: myPartnerData } = await supabase
          .from('partners')
          .select('id')
          .eq('member_id', currentUserId)
          .maybeSingle()

        if (isCancelled) return

        console.log('🎫 [Subscription] 파트너 조회:', { 
          partnerDataId: partnerData?.id, 
          myPartnerDataId: myPartnerData?.id 
        })

        let iAmSubscribedToPartner = false
        let partnerIsSubscribedToMe = false

        // 3) 내가 상대 파트너를 구독중인지 확인
        if (partnerData?.id) {
          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-membership-subscriptions`,
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            }
          )

          if (isCancelled) return

          const result = await response.json()
          console.log('🎫 [Subscription] 내 구독 목록:', result)
          
          if (result.success && Array.isArray(result.data)) {
            console.log('🎫 [Subscription] 내 구독 비교:', {
              targetPartnerId: partnerData.id,
              mySubscriptions: result.data.map((sub: any) => ({
                status: sub.status,
                partner_id: sub.membership?.partner_id
              }))
            })
            iAmSubscribedToPartner = result.data.some((sub: any) => 
              sub.status === 'active' && sub.membership?.partner_id === partnerData.id
            )
          }
        }

        if (isCancelled) return

        // 4) 내가 파트너일 경우, 상대방이 나를 구독중인지 확인 (Edge API 사용)
        if (myPartnerData?.id) {
          const checkResponse = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/api-membership-subscriptions/check-subscriber?user_id=${partnerId}`,
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
            }
          )

          if (isCancelled) return

          const checkResult = await checkResponse.json()
          console.log('🎫 [Subscription] 상대방 구독 확인 (Edge API):', checkResult)

          if (checkResult.success) {
            partnerIsSubscribedToMe = checkResult.data?.isSubscribed ?? false
          }
        }

        const hasActiveSubscription = iAmSubscribedToPartner || partnerIsSubscribedToMe
        
        console.log('🎫 [Subscription] 구독 여부:', { 
          iAmSubscribedToPartner,
          partnerIsSubscribedToMe,
          hasActiveSubscription 
        })
        
        if (!isCancelled) {
          console.log('🎫 [Subscription] ✅ 상태 업데이트:', hasActiveSubscription)
          setIsSubscribedToPartner(hasActiveSubscription)
        }
      } catch (error) {
        console.error('구독 여부 확인 실패:', error)
        if (!isCancelled) setIsSubscribedToPartner(false)
      }
    }

    checkSubscription()
    
    return () => {
      isCancelled = true
    }
  }, [currentUserId, partnerId, isCsRoom])

  // 메시지 추가 시 자동 스크롤 - 최하단으로 이동 (이전 메시지 로드 시에는 스크롤 안 함)
  const prevMessagesCountRef = useRef(0)
  const prevFirstMessageIdRef = useRef<string | number | null>(null)
  const wasLoadingMoreRef = useRef(false)
  
  useEffect(() => {
    const scrollToBottom = () => {
      if (messagesContainerRef.current) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (messagesContainerRef.current) {
              messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
            }
          })
        })
      }
    }

    // 이전 메시지가 앞에 추가되었는지 확인 (첫 번째 메시지 ID 비교)
    const isPreviousMessagesLoaded = prevFirstMessageIdRef.current !== null && 
      messages.length > 0 && 
      messages[0]?.id !== prevFirstMessageIdRef.current &&
      wasLoadingMoreRef.current &&
      isLoadingMore === false

    // 새 메시지가 뒤에 추가된 경우에만 스크롤 (이전 메시지 로드 시에는 앞에 추가되므로 스크롤 안 함)
    const isNewMessageAdded = messages.length > prevMessagesCountRef.current && 
      prevMessagesCountRef.current > 0 && 
      !isLoadingMore &&
      !isPreviousMessagesLoaded

    // 이전 메시지 로드가 아닌 경우에만 스크롤
    if (messages.length > 0 && (prevMessagesCountRef.current === 0 || isNewMessageAdded) && !isPreviousMessagesLoaded) {
      scrollToBottom()
    }
    
    // 첫 번째 메시지 ID 업데이트
    if (messages.length > 0) {
      prevFirstMessageIdRef.current = messages[0].id
    }
    wasLoadingMoreRef.current = isLoadingMore
    prevMessagesCountRef.current = messages.length
  }, [messages.length, isLoadingMore, messages])

  // 초기 로딩 완료 후 스크롤 최하단
  useEffect(() => {
    if (!isLoading && messages.length > 0 && messagesContainerRef.current) {
      setTimeout(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
        }
      }, 100)
    }
  }, [isLoading, messages.length])

  // 임시 메시지가 있으면 자동으로 전송
  useEffect(() => {
    if (initialTempMessage && sendMessage && currentUserId && partnerId) {
      const timer = setTimeout(() => {
        setNewMessage(initialTempMessage)
        // 메시지를 설정한 후 바로 전송
        setTimeout(async () => {
          await sendMessage(currentUserId, partnerId, initialTempMessage, roomId || undefined)
          setNewMessage('')

          // tempMessage 전송 후 URL에서 tempMessage 쿼리만 제거 (partnerName은 유지)
          navigate({
            to: '/chat',
            search: {
              partnerId,
              partnerName: partnerName,
            }
          })
        }, 100)
      }, 500) // 컴포넌트가 완전히 로드된 후 전송

      return () => clearTimeout(timer)
    }
  }, [initialTempMessage, sendMessage, currentUserId, partnerId, navigate])

  // 퀘스트 요청 데이터가 있으면 자동으로 퀘스트 생성
  const jobRequestProcessedRef = useRef<string | null>(null)
  const isProcessingJobRequestRef = useRef(false)
  useEffect(() => {
    if (!initialJobRequest || !currentUserId || !partnerId || !user) return
    // 이미 처리된 요청이면 스킵
    if (jobRequestProcessedRef.current === initialJobRequest) return
    // 현재 처리 중이면 스킵 (중복 실행 방지)
    if (isProcessingJobRequestRef.current) return
    
    const processJobRequest = async () => {
      // 처리 시작 즉시 플래그 설정 (중복 실행 방지)
      isProcessingJobRequestRef.current = true
      jobRequestProcessedRef.current = initialJobRequest
      
      try {
        const jobData = JSON.parse(initialJobRequest)
        const { jobId, jobName, count, coinsPerJob, totalCost } = jobData

        // 포인트 확인
        const currentPoints = userPoints || user?.total_points || 0
        if (currentPoints < totalCost) {
          toast.error(`포인트가 부족합니다. (보유: ${currentPoints}P, 필요: ${totalCost}P)`)
          isProcessingJobRequestRef.current = false
          return
        }

        // partnerId (member.id)를 partner.id로 변환 - Edge Function 사용
        const partnerLookupResponse = await edgeApi.members.getPartnerIdByMemberId(partnerId)
        console.log('🔍 파트너 조회 결과:', { partnerId, partnerLookupResponse })

        if (!partnerLookupResponse.success || !partnerLookupResponse.data?.partner_id) {
          toast.error('파트너 정보를 찾을 수 없습니다.')
          isProcessingJobRequestRef.current = false
          return
        }

        const targetPartnerId = partnerLookupResponse.data.partner_id

        // Edge function을 통한 파트너 요청 생성
        const response = await edgeApi.members.createPartnerRequest({
          partner_id: targetPartnerId,
          job_id: jobId,
          job_name: jobName,
          job_count: count,
          coins_per_job: coinsPerJob,
          note: `${jobName} ${count}회 의뢰를 신청했습니다. (${totalCost.toLocaleString()}P)`,
        })

        if (response.success) {
          // request_id 가져오기 (응답 형식: { request: { id: ... }, ... })
          const requestId = response.data?.request?.id || response.data?.id || ''
          
          // [QUEST_REQUEST:퀘스트이름:횟수:총금액:request_id] 형식으로 메시지 전송
          const message = `[QUEST_REQUEST:${jobName}:${count}:${totalCost}:${requestId}]`
          
          // UI에 즉시 반영
          const tempMessage = {
            id: `temp-${Date.now()}`,
            message: message,
            sender_id: currentUserId,
            receiver_id: partnerId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
          addMessage(tempMessage as any)

          await sendMessage(currentUserId, partnerId, message, roomId || undefined)
          setUserPoints((prev) => prev - totalCost)
          
          toast.success(`${jobName} 의뢰가 성공적으로 전송되었습니다.`)
          
          // URL에서 jobRequest 쿼리 제거
          navigate({
            to: '/chat',
            search: {
              partnerId,
              partnerName: partnerName,
            }
          })
        } else {
          throw new Error(response.error?.message || '의뢰 요청 생성 실패')
        }
      } catch (error) {
        console.error('퀘스트 요청 처리 실패:', error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        toast.error(`의뢰 요청에 실패했습니다: ${errorMessage}`)
      } finally {
        isProcessingJobRequestRef.current = false
      }
    }

    // 약간의 딜레이 후 처리 (컴포넌트 로드 완료 대기)
    const timer = setTimeout(processJobRequest, 800)
    return () => clearTimeout(timer)
  }, [initialJobRequest, currentUserId, partnerId, user, userPoints, sendMessage, addMessage, navigate, partnerName])

  // 활성 요청이 변경될 때 자동으로 첫 번째 요청 선택 (FIFO - 가장 오래된 요청 먼저)
  // pending, in_progress 상태인 요청만 대상으로 선택
  useEffect(() => {
    // pending 또는 in_progress 상태인 요청만 필터링
    const activeOnlyRequests = activeRequests.filter(
      req => req.status === 'pending' || req.status === 'in_progress'
    )
    
    if (activeOnlyRequests.length > 0) {
      // 현재 선택된 요청이 없거나, 선택된 요청이 더 이상 활성 요청에 없으면
      if (!selectedRequestId || !activeOnlyRequests.find(req => req.id === selectedRequestId)) {
        // 가장 오래된 요청을 선택 (created_at 기준 오름차순 - FIFO)
        const oldestRequest = [...activeOnlyRequests].sort((a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        )[0]
        if (oldestRequest) {
          setSelectedRequestId(oldestRequest.id)
        }
      }
    } else {
      setSelectedRequestId(null)
    }
  }, [activeRequests, selectedRequestId])

  // 게시물 구매 시트 관련 상태
  const [purchaseTargetPost, setPurchaseTargetPost] = useState<{ postId: string; pointPrice: number } | null>(null)
  const [isPurchaseSheetVisible, setIsPurchaseSheetVisible] = useState(false)
  const [isProcessingPurchase, setIsProcessingPurchase] = useState(false)

  // 게시물 단건 구매 클릭 시 시트 띄우기
  const handleLockedPostClick = useCallback((postId: string, pointPrice: number) => {
    setPurchaseTargetPost({ postId, pointPrice })
    requestAnimationFrame(() => {
      setIsPurchaseSheetVisible(true)
    })
  }, [])

  const closePurchaseSheet = useCallback(() => {
    setIsPurchaseSheetVisible(false)
    setTimeout(() => {
      setPurchaseTargetPost(null)
    }, 250)
  }, [])

  // 게시물 단건 구매 핸들러 (성공 시 true 반환)
  const handlePostPurchase = useCallback(async (postId: string, pointPrice: number): Promise<boolean> => {
    if (!postId || pointPrice <= 0) return false
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        toast.error('로그인이 필요합니다.')
        return false
      }
      
      const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
      const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
      
      const response = await fetch(
        `${EDGE_FUNCTIONS_URL}/functions/v1/api-post-unlocks`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            apikey: SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ post_id: postId }),
        }
      )
      
      const result = await response.json()
      if (!response.ok || !result.success) {
        const errorMessage = result?.error || result?.message || '구매에 실패했습니다.'
        if (errorMessage.toLowerCase().includes('point') || errorMessage.includes('포인트')) {
          toast.error('포인트가 부족합니다.')
          navigate({ to: '/points' })
        } else {
          toast.error(errorMessage)
        }
        return false
      }
      
      toast.success('구매 완료! 앱에서 콘텐츠를 확인하세요.')
      return true
    } catch (error: any) {
      console.error('게시물 구매 실패:', error)
      toast.error(error?.message || '구매 처리 중 오류가 발생했습니다.')
      return false
    }
  }, [navigate])

  // 구매 시트에서 단건 구매 실행
  const handlePurchaseSinglePost = useCallback(async () => {
    if (!purchaseTargetPost || isProcessingPurchase) return
    
    setIsProcessingPurchase(true)
    try {
      const success = await handlePostPurchase(purchaseTargetPost.postId, purchaseTargetPost.pointPrice)
      if (success) {
        closePurchaseSheet()
        // postCache 업데이트
        if ((window as any).__refreshChatPostCache) {
          (window as any).__refreshChatPostCache(purchaseTargetPost.postId)
        }
      }
    } finally {
      setIsProcessingPurchase(false)
    }
  }, [purchaseTargetPost, isProcessingPurchase, handlePostPurchase, closePurchaseSheet])

  // pending, in_progress 상태인 요청 중에서 선택
  const activeOnlyRequests = activeRequests.filter(
    req => req.status === 'pending' || req.status === 'in_progress'
  )
  const selectedRequest =
    activeOnlyRequests.find((request) => request.id === selectedRequestId) ??
    activeOnlyRequests[0] ??
    null
  const hasAnyActiveRequest = activeRequests.length > 0
  
  // 현재 사용자가 의뢰를 보낸 사람인지 확인
  const isRequestedByCurrentUser = selectedRequest && 
    (selectedRequest as any).client_id === currentUserId

  // 의뢰 상태 표시 영역 높이 측정
  useLayoutEffect(() => {
    const updateHeight = () => {
      if (requestStatusRef.current) {
        setRequestStatusHeight(requestStatusRef.current.offsetHeight)
      } else {
        setRequestStatusHeight(0)
      }
    }
    // 약간의 딜레이로 DOM 업데이트 후 측정
    const timer = setTimeout(updateHeight, 50)
    return () => clearTimeout(timer)
  }, [hasAnyActiveRequest, selectedRequest, isCurrentUserPartner, isRequestedByCurrentUser])

  // 진행 타이머용 상태 추가
  const [progressSeconds, setProgressSeconds] = useState<number | null>(null)

  // 타이머 업데이트 (pending: 남은 시간, in_progress: 경과 시간)
  useEffect(() => {
    if (!selectedRequest || (selectedRequest.status !== 'pending' && selectedRequest.status !== 'in_progress')) {
      setRemainingSeconds(null)
      setProgressSeconds(null)
      return
    }

    console.log('⏱️ 타이머 설정 - selectedRequest:', selectedRequest)

    const updateTimer = () => {
      if (selectedRequest.status === 'pending') {
        // pending: 남은 시간 계산 (60분 타이머)
        const createdAt = (selectedRequest as any).created_at || (selectedRequest as any).requested_at
        if (!createdAt) {
          console.warn('⚠️ created_at/requested_at 없음, 타이머 시작 불가')
          // fallback: 60분으로 시작 (API에서 시간 정보가 없는 경우)
          setRemainingSeconds(60 * 60)
          setProgressSeconds(null)
          return
        }
        const requestTime = new Date(createdAt).getTime()
        const currentTime = new Date().getTime()
        const elapsedSeconds = (currentTime - requestTime) / 1000
        const remaining = Math.max(0, 60 * 60 - elapsedSeconds) // 60분 = 3600초
        setRemainingSeconds(Math.floor(remaining))
        setProgressSeconds(null)
      } else if (selectedRequest.status === 'in_progress') {
        // in_progress: 경과 시간 계산
        const acceptedAt = (selectedRequest as any).accepted_at || (selectedRequest as any).updated_at
        if (!acceptedAt) {
          console.warn('⚠️ accepted_at/updated_at 없음, 0초부터 시작')
          setProgressSeconds(0)
          setRemainingSeconds(null)
          return
        }
        const startTime = new Date(acceptedAt).getTime()
        const currentTime = new Date().getTime()
        const elapsed = Math.floor((currentTime - startTime) / 1000)
        setProgressSeconds(elapsed)
        setRemainingSeconds(null)
      }
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)

    return () => clearInterval(interval)
  }, [selectedRequest])

  // 의뢰 시간 체크 및 자동 취소 (remainingSeconds가 0이 되면 즉시 취소)
  useEffect(() => {
    if (!selectedRequest || selectedRequest.status !== 'pending') {
      return
    }

    // 요청자 또는 파트너 모두 자동 취소 가능
    if (remainingSeconds !== null && remainingSeconds <= 0) {
      const cancelExpiredRequest = async () => {
        try {
          // 의뢰 자동 취소 처리 (Express API 사용 - 권한 체크 없이 자동 취소)
          await mateYouApi.partnerDashboard.autoCancelRequest(selectedRequest.id)
          console.log('⏰ 의뢰 시간 만료로 자동 취소됨:', selectedRequest.id)
          refreshStatus()
        } catch (error) {
          console.error('의뢰 자동 취소 실패:', error)
        }
      }
      cancelExpiredRequest()
    }
  }, [selectedRequest, remainingSeconds, refreshStatus])


  // 차단된 사용자의 메시지 필터링 (파트너 시점에서만)
  const filteredMessages = isCurrentUserPartner
    ? messages.filter((message) => {
        if (message.sender_id === currentUserId) return true
        return !blockedUsers.includes(message.sender_id)
      })
    : messages

  const CS_WELCOME_FAKE_ID = 'cs-welcome'
  const CS_INQUIRY_MAIN = ['결제/환불 문의', '이용 문의', '기타 문의'] as const
  const CS_INQUIRY_SUB: Record<string, string[]> = {
    '결제/환불 문의': ['환불 요청', '결제 오류', '영수증/결제내역'],
    '이용 문의': ['앱 이용 방법', '계정 문의', '오류/버그'],
    '기타 문의': [],
  }
  const csWelcomeMessage = useMemo(() => ({
    id: CS_WELCOME_FAKE_ID,
    sender_id: 'cs-system',
    receiver_id: currentUserId,
    message: '안녕하세요. 고객센터입니다.',
    created_at: new Date().toISOString(),
    message_type: 'text' as const,
    chat_room_id: roomId || '',
    sender: { id: 'cs-system', name: '고객센터', profile_image: null },
  }), [currentUserId, roomId])

  const displayMessages = useMemo(() => {
    if (isCsRoomUser && !isLoading) {
      return [csWelcomeMessage, ...filteredMessages] as typeof filteredMessages
    }
    return filteredMessages
  }, [isCsRoomUser, filteredMessages, isLoading, csWelcomeMessage])

  const isPartnerBlockedUser =
    isCurrentUserPartner && blockedUsers.includes(partnerId || '')

  const customMobileHeaderHeight = hideHeader && isMobile ? 68 : 0
  const headerHeightForLayout = hideHeader
    ? customMobileHeaderHeight
    : mobileLayoutHeights.header || 68
  const jobsHeightForLayout =
    shouldRenderJobsSection ? mobileLayoutHeights.jobs || 96 : 0
  const combinedTopOffset = headerHeightForLayout + jobsHeightForLayout
  const messageTopOffset = isMobile
    ? combinedTopOffset > 0
      ? combinedTopOffset + MOBILE_HEADER_EXTRA_GAP
      : 0
    : 0
  const inputHeightForLayout = isMobile ? mobileLayoutHeights.input || 56 : 0
  const messageBottomPadding = isMobile
    ? inputHeightForLayout + MOBILE_TABBAR_HEIGHT + MOBILE_HEADER_EXTRA_GAP
    : 0

  // 차단 기능
  const handleBlockUser = async () => {
    if (isCsRoom || !user || !partnerId) return

    try {
      if (user.role === 'admin') {
        alert('관리자는 차단할 수 없습니다.')
        return
      }

      const response = await edgeApi.members.blockPartner(partnerId)

      if (response.success) {
        setBlockedUsers((prev) => [...prev, partnerId])
        alert(`${partnerName || '사용자'}님을 차단했습니다.`)

        if (onUserBlocked) {
          onUserBlocked()
        }
      } else {
        throw new Error(response.error?.message || '차단 처리 실패')
      }
    } catch (error) {
      console.error('차단 실패:', error)
      alert('차단에 실패했습니다. 잠시 후 다시 시도해주세요.')
    }
  }

  // 사용자 포인트 조회
  useEffect(() => {
    const fetchUserPoints = async () => {
      if (!currentUserId) {
        setUserPointsLoading(false)
        return
      }

      try {
        setUserPointsLoading(true)
        const response = await edgeApi.members.getUserPoints()

        if (response.success && response.data) {
          setUserPoints(response.data.points || 0)
        } else {
          console.log('Points API failed or no data:', response)
          // API 실패 시 user 객체의 total_points 사용
          if (user?.total_points !== undefined) {
            setUserPoints(user.total_points)
          }
        }
      } catch (error) {
        console.error('사용자 포인트 조회 실패:', error)
        // API 에러 시 user 객체의 total_points 사용
        if (user?.total_points !== undefined) {
          setUserPoints(user.total_points)
        }
      } finally {
        setUserPointsLoading(false)
      }
    }

    fetchUserPoints()
  }, [currentUserId, user?.total_points])

  // 차단된 사용자 목록 가져오기 (파트너인 경우)
  const fetchBlockedUsers = async () => {
    if (!user?.id || user.role !== 'partner') return

    try {
      // 파트너가 차단한 사용자 목록 조회 (api-blocks 사용)
      const response = await edgeApi.blocks.getList() as {
        success: boolean
        data?: Array<{ blocked_user_id?: string; user_id?: string }>
      }

      if (response.success && response.data && Array.isArray(response.data)) {
        const blockedUserIds = response.data.map((ban: any) => ban.blocked_user_id || ban.user_id).filter(Boolean)
        setBlockedUsers(blockedUserIds)
      }
    } catch (error) {
      console.error('차단 사용자 목록 조회 실패:', error)
    }
  }

  useEffect(() => {
    if (isCurrentUserPartner) {
      fetchBlockedUsers()
    }
  }, [isCurrentUserPartner, user?.id])

  // 직접 의뢰하기 핸들러
  const handleDirectRequest = async (job: any) => {
    // 차단된 경우 의뢰 요청 불가
    if (isBlockedByPartner) {
      alert('상대방에게 차단되어 의뢰를 요청할 수 없습니다.')
      return
    }

    // 중복 실행 방지 (ref 사용으로 즉시 체크)
    if (isRequestingRef.current || isRequesting) return
    isRequestingRef.current = true

    const count = getJobCount(job.id)
    const totalCost = job.coins_per_job * count

    // 포인트 로딩 중이면 대기
    if (userPointsLoading) {
      alert('포인트 정보를 불러오는 중입니다. 잠시 후 다시 시도해주세요.')
      return
    }

    // 포인트 부족 체크 (실시간 확인)
    if (userPoints < totalCost) {
      setChargeRequiredPoints(totalCost)
      setIsChargeModalOpen(true)
      return
    }

    setIsRequesting(true)
    try {
      // partnerId (member.id)를 partner.id로 변환 - Edge Function 사용
      const partnerLookupResponse = await edgeApi.members.getPartnerIdByMemberId(partnerId)
      console.log('🔍 파트너 조회 결과:', { partnerId, partnerLookupResponse })

      if (!partnerLookupResponse.success || !partnerLookupResponse.data?.partner_id) {
        throw new Error('파트너 정보를 찾을 수 없습니다.')
      }

      const targetPartnerId = partnerLookupResponse.data.partner_id
      console.log('✅ 의뢰 대상 partner_id:', targetPartnerId)

      // Edge function을 통한 파트너 요청 생성
      const response = await edgeApi.members.createPartnerRequest({
        partner_id: targetPartnerId, // partner.id 사용
        job_id: job.id,
        job_name: job.job_name,
        job_count: count,
        coins_per_job: job.coins_per_job,
        note: `${job.job_name} ${count}회 의뢰를 신청했습니다. (${totalCost.toLocaleString()}P)`,
        chat_room_id: roomId || undefined,
      })
      console.log('📤 의뢰 생성 응답:', response)

      if (response.success) {
        // 생성된 request_id 가져오기 (응답 형식: { request: { id: ... }, ... })
        const requestId = response.data?.request?.id || response.data?.id || ''
        
        // 특별 형식: [QUEST_REQUEST:퀘스트이름:횟수:총금액:request_id]
        const message = `[QUEST_REQUEST:${job.job_name}:${count}:${totalCost}:${requestId}]`

        // UI에 즉시 반영하기 위해 임시 메시지 추가
        const tempMessage = {
          id: `temp-${Date.now()}`,
          message: message,
          sender_id: currentUserId,
          receiver_id: partnerId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        addMessage(tempMessage as any)

        await sendMessage(currentUserId, partnerId, message, roomId || undefined)

        setJobCount(job.id, 1)
        setUserPoints((prevPoints) => prevPoints - totalCost)

        toast.success(`${job.job_name} 의뢰가 성공적으로 전송되었습니다.`)
      } else {
        throw new Error(response.error?.message || '의뢰 요청 생성 실패')
      }
    } catch (error) {
      console.error('Error creating partner request:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)
      toast.error(`의뢰 요청 생성에 실패했습니다: ${errorMessage}`)

      // 실패 시 user 객체의 포인트로 복원
      if (user?.total_points !== undefined) {
        setUserPoints(user.total_points)
      }
    } finally {
      setIsRequesting(false)
      isRequestingRef.current = false
    }
  }

  // 횟수 관리 함수들
  const getJobCount = (jobId: string) => {
    return jobCounts[jobId] || 1
  }

  const setJobCount = (jobId: string, count: number) => {
    setJobCounts((prev) => ({
      ...prev,
      [jobId]: Math.max(1, count),
    }))
  }

  // 메시지 전송
  const handleSendMessage = async (keepFocus = false) => {
    console.log('💬 handleSendMessage 호출:', { newMessage: newMessage.substring(0, 20), isSending, isBlockedByPartner })
    
    // 차단된 경우 메시지 전송 불가
    if (isBlockedByPartner) {
      console.log('🚫 차단된 사용자에게는 메시지를 보낼 수 없습니다.')
      return
    }
    
    if (!newMessage.trim() || isSending) {
      console.log('💬 메시지 전송 중단:', { empty: !newMessage.trim(), isSending })
      return
    }

    const messageToSend = newMessage.trim()
    const prohibitedWord = findProhibitedWord(messageToSend)

    if (prohibitedWord) {
      alert(`"${prohibitedWord}"는 금지어이므로 메시지를 전송할 수 없습니다.`)
      return
    }

    setNewMessage('')
    if (inputRef.current) {
      inputRef.current.value = ''
      if (!keepFocus) {
        inputRef.current.blur()
      }
    }

    const tempMessage = {
      id: `temp-${Date.now()}`,
      message: messageToSend,
      sender_id: currentUserId,
      receiver_id: partnerId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    addMessage(tempMessage as any)

    try {
      await sendMessage(currentUserId, partnerId, messageToSend, roomId || undefined)
      
      // 무료 메시지 카운터 낙관적 업데이트
      if (user?.role === 'normal' && isPartnerRolePartner) {
        setMessageCostInfo(prev => {
          if (prev.freeRemaining > 0) {
            const newFree = prev.freeRemaining - 1
            return { ...prev, freeRemaining: newFree, shouldPay: newFree <= 0 && prev.membershipQuotaRemaining <= 0 }
          } else if (prev.membershipQuotaRemaining > 0) {
            const newQuota = prev.membershipQuotaRemaining - 1
            return { ...prev, membershipQuotaRemaining: newQuota, shouldPay: newQuota <= 0 }
          }
          return prev
        })
      }
    } catch (error) {
      console.error('메시지 전송 실패:', error)

      setNewMessage(messageToSend)
      if (inputRef.current) {
        inputRef.current.value = messageToSend
        inputRef.current.focus()
      }
      
      const errorMessage = error instanceof Error ? error.message : String(error)
      
      // 인증 관련 에러인 경우 더 명확한 안내
      if (errorMessage.includes('Authentication') || errorMessage.includes('로그인') || errorMessage.includes('401')) {
        console.warn('인증 에러 - 세션 갱신 필요')
        // 인증 에러는 조용히 처리 (edgeApi에서 재시도함)
        return
      }
      
      // 금지어 에러는 사용자에게 알림 및 메시지 제거
      if ((error as any)?.code === 'PROHIBITED_WORD' || errorMessage.includes('금지어')) {
        // 낙관적으로 추가했던 메시지 제거
        removeMessage(tempMessage.id)
        alert(errorMessage)
        return
      }
      
      // 포인트 부족 에러 처리
      if ((error as any)?.code === 'INSUFFICIENT_POINTS' || errorMessage.includes('포인트가 부족')) {
        removeMessage(tempMessage.id)
        toast.error('포인트가 부족합니다. 충전 후 다시 시도해주세요.')
        return
      }
      
      // 그 외 에러는 콘솔에만 기록 (반복적인 alert 방지)
      console.error('메시지 전송 에러:', errorMessage)
    }
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !isComposing) {
      if (isMobile) return // 모바일: Enter는 줄바꿈만 (전송은 버튼으로)
      if (!event.shiftKey) {
        event.preventDefault()
        handleSendMessage(true)
      }
    }
  }

  const handleCompositionStart = () => {
    setIsComposing(true)
  }

  const handleCompositionEnd = () => {
    setIsComposing(false)
  }

  const handleButtonClick = () => {
    handleSendMessage(false)
  }

  const handleSendMessageToChat = (message: string) => {
    sendMessage(currentUserId, partnerId, message, roomId || undefined)
  }

  const sendCsAutoReply = useCallback(() => {
    const now = new Date()
    const hour = now.getHours()
    const day = now.getDay()
    const isBusinessHour = day >= 1 && day <= 5 && hour >= 10 && hour < 19
    const autoMsg = isBusinessHour
      ? '상담사 연결 중입니다. 잠시만 기다려 주세요.'
      : '현재 상담 시간(평일 오전 10시~오후 7시)이 아닙니다.\n업무 시간에 순차적으로 답변드리겠습니다.'
    setTimeout(() => {
      addMessage({
        id: `cs-auto-${Date.now()}`,
        sender_id: 'cs-system',
        receiver_id: currentUserId,
        message: autoMsg,
        created_at: new Date().toISOString(),
        message_type: 'text',
        chat_room_id: roomId || '',
        sender: { id: 'cs-system', name: '고객센터', profile_image: null },
      } as any)
    }, 500)
  }, [addMessage, currentUserId, roomId])

  const handleCsInquiryExample = (label: string, isSub: boolean) => {
    if (isSub || label === '기타 문의') {
      const fullLabel = csInquiryCategory ? `${csInquiryCategory} > ${label}` : label
      handleSendMessageToChat(fullLabel)
      setCsInquiryCategory(null)
      sendCsAutoReply()
    } else {
      const hasSub = (CS_INQUIRY_SUB[label]?.length ?? 0) > 0
      if (hasSub) {
        setCsInquiryCategory(label)
      } else {
        handleSendMessageToChat(label)
        setCsInquiryCategory(null)
        sendCsAutoReply()
      }
    }
  }

  const handleJobCountChange = (jobId: string, count: number) => {
    setJobCount(jobId, count)
  }

  const handleSlideChange = (index: number) => {
    setCurrentSlideIndex(index)
  }

  const handleToggleJobs = useCallback(() => {
    setIsQuestPopupOpen((prev) => !prev)
  }, [])

  const handleToggleDonation = useCallback(() => {
    setIsQuestPopupOpen(false)
    openDonationSheet(partnerId, partnerName)
  }, [openDonationSheet, partnerId, partnerName])

  // base64를 File로 변환하는 유틸리티
  const base64ToFile = useCallback(async (base64: string, filename: string): Promise<File> => {
    const response = await fetch(`data:image/jpeg;base64,${base64}`)
    const blob = await response.blob()
    return new File([blob], filename, { type: 'image/jpeg' })
  }, [])

  // 앨범 선택 핸들러 (네이티브: Capacitor, 웹: input)
  const handleSelectAlbum = useCallback(async () => {
    if (isNative) {
      try {
        const images = await Camera.pickImages({
          quality: 90,
          limit: 10,
        })
        
        if (images.photos.length === 0 || !roomId) return
        
        const files: File[] = []
        for (let i = 0; i < images.photos.length; i++) {
          const photo = images.photos[i]
          if (photo.webPath) {
            const response = await fetch(photo.webPath)
            const blob = await response.blob()
            const file = new File([blob], `image-${Date.now()}-${i}.jpg`, { type: 'image/jpeg' })
            files.push(file)
          }
        }
        
        if (files.length > 0) {
          const uploadedFiles = await uploadFiles(roomId, files)
          if (uploadedFiles && uploadedFiles.length > 0) {
            const mediaFiles = uploadedFiles.map((f: any) => ({
              media_url: f.url,
              media_type: f.type.startsWith('image') ? 'image' as const : f.type.startsWith('video') ? 'video' as const : 'file' as const,
              file_name: f.name,
              thumbnail_url: f.thumbnail_url,
            }))
            const newMessage = await sendMessageWithMedia(roomId, '사진 보냅니다', mediaFiles)
            if (newMessage) {
              const messageWithMedia = {
                ...newMessage,
                chat_media: newMessage.media_files || mediaFiles,
              }
              addMessage(messageWithMedia as any)
            }
            toast.success('사진이 전송되었습니다.')
          }
        }
      } catch (error: any) {
        if (error.message !== 'User cancelled photos app') {
          console.error('앨범 선택 실패:', error)
          toast.error('사진 선택에 실패했습니다.')
        }
      }
    } else {
      fileInputRef.current?.click()
    }
  }, [isNative, roomId, uploadFiles, sendMessageWithMedia, addMessage])

  // 카메라 선택 핸들러 (네이티브: Capacitor, 웹: input)
  const handleSelectCamera = useCallback(async () => {
    if (isNative) {
      try {
        const photo = await Camera.getPhoto({
          quality: 90,
          allowEditing: false,
          resultType: CameraResultType.Base64,
          source: CameraSource.Camera,
        })
        
        if (!photo.base64String || !roomId) return
        
        const file = await base64ToFile(photo.base64String, `camera-${Date.now()}.jpg`)
        const uploadedFiles = await uploadFiles(roomId, [file])
        
        if (uploadedFiles && uploadedFiles.length > 0) {
          const mediaFiles = uploadedFiles.map((f: any) => ({
            media_url: f.url,
            media_type: f.type.startsWith('image') ? 'image' as const : f.type.startsWith('video') ? 'video' as const : 'file' as const,
            file_name: f.name,
            thumbnail_url: f.thumbnail_url,
          }))
          const newMessage = await sendMessageWithMedia(roomId, '사진 보냅니다', mediaFiles)
          if (newMessage) {
            const messageWithMedia = {
              ...newMessage,
              chat_media: newMessage.media_files || mediaFiles,
            }
            addMessage(messageWithMedia as any)
          }
          toast.success('사진이 전송되었습니다.')
        }
      } catch (error: any) {
        if (error.message !== 'User cancelled photos app') {
          console.error('카메라 촬영 실패:', error)
          toast.error('사진 촬영에 실패했습니다.')
        }
      }
    } else {
      cameraInputRef.current?.click()
    }
  }, [isNative, roomId, uploadFiles, sendMessageWithMedia, base64ToFile, addMessage])

  // 파일 선택 후 업로드 및 전송 처리
  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0 || !roomId) return

    try {
      const fileArray = Array.from(files)
      const uploadedFiles = await uploadFiles(roomId, fileArray)
      
      if (uploadedFiles && uploadedFiles.length > 0) {
        const mediaFiles = uploadedFiles.map((f: any) => ({
          media_url: f.url,
          media_type: f.type.startsWith('image') ? 'image' as const : f.type.startsWith('video') ? 'video' as const : 'file' as const,
          file_name: f.name,
          thumbnail_url: f.thumbnail_url,
        }))
        const newMessage = await sendMessageWithMedia(roomId, '사진 보냅니다', mediaFiles)
        if (newMessage) {
          // media_files -> chat_media 변환
          const messageWithMedia = {
            ...newMessage,
            chat_media: newMessage.media_files || mediaFiles,
          }
          addMessage(messageWithMedia as any)
        }
        toast.success('파일이 전송되었습니다.')
      }
    } catch (error) {
      console.error('파일 업로드 실패:', error)
      toast.error('파일 전송에 실패했습니다.')
    }
    
    // input 초기화
    event.target.value = ''
  }, [roomId, uploadFiles, sendMessageWithMedia, addMessage])

  // 포인트 충전 핸들러
  const handleChargeRequest = (requiredPoints: number) => {
    setChargeRequiredPoints(requiredPoints)
    setIsChargeModalOpen(true)
  }

  const handleChargeComplete = async (points: number, amount: number) => {
    // 충전 완료 후 포인트 다시 조회
    try {
      setUserPointsLoading(true)
      const response = await edgeApi.members.getUserPoints()
      if (response.success && response.data) {
        setUserPoints(response.data.points || 0)
      }
    } catch (error) {
      console.error('포인트 재조회 실패:', error)
    } finally {
      setUserPointsLoading(false)
    }
    setIsChargeModalOpen(false)
  }

  // 의뢰 수락 핸들러
  const handleAcceptRequest = async (requestId: string) => {
    try {
      await acceptRequest(requestId)
      await sendMessage(currentUserId, partnerId, '의뢰를 수락했습니다! 🎮', roomId || undefined)
      await refreshStatus()
      await refreshMessages()
    } catch (error) {
      console.error('의뢰 수락 실패:', error)
      const errorMessage = error instanceof Error ? error.message : '의뢰 수락에 실패했습니다.'
      alert(errorMessage)
    }
  }

  // 의뢰 거절 핸들러
  const handleRejectRequest = async (requestId: string) => {
    const reason = prompt('거절 사유를 입력해주세요 (선택사항):')
    if (reason === null) return

    try {
      await rejectRequest(requestId, reason || undefined)
      await sendMessage(currentUserId, partnerId, `의뢰를 거절했습니다. ${reason ? `사유: ${reason}` : ''}`, roomId || undefined)
      await refreshStatus()
      await refreshMessages()
    } catch (error) {
      console.error('의뢰 거절 실패:', error)
      alert('의뢰 거절에 실패했습니다.')
    }
  }

  // 의뢰 완료 핸들러
  const handleCompleteRequest = async (requestId: string) => {
    if (isCompletingRequest) return
    setIsCompletingRequest(true)
    try {
      await completeRequest(requestId)
      await sendMessage(currentUserId, partnerId, '의뢰가 완료되었습니다! 🎉', roomId || undefined)
      refreshStatus()
    } catch (error) {
      console.error('의뢰 완료 실패:', error)
      alert('의뢰 완료에 실패했습니다.')
    } finally {
      setIsCompletingRequest(false)
    }
  }

  // 주문 조회 핸들러
  const handleOpenOrderList = useCallback(async () => {
    setIsLoadingChatRoomOrders(true)
    setIsOrderListSheetOpen(true)
    try {
      const response = await storeOrdersApi.getList({ limit: 100 })
      if (response.success && response.data) {
        const allOrders = Array.isArray(response.data) ? response.data : (response.data as any).orders || []
        // partnerId 기준으로 필터링 (상품의 partner_id가 현재 채팅 상대인 경우)
        const filteredOrders = allOrders.filter((order: any) => 
          order.product?.partner_id === partnerId ||
          order.product?.partner?.member_id === partnerId
        )
        setChatRoomOrders(filteredOrders)
      } else {
        setChatRoomOrders([])
      }
    } catch (error) {
      console.error('주문 목록 조회 실패:', error)
      setChatRoomOrders([])
    } finally {
      setIsLoadingChatRoomOrders(false)
    }
  }, [partnerId])

  return (
    <div
      className={`relative flex flex-col h-full bg-white overflow-hidden ${isMobile ? '' : 'rounded-lg'}`}
    >

      {/* 채팅방 공지 - 모바일: fixed, PC: absolute (채팅 영역 내부) */}
      {chatNotice && !isNoticeLoading && (
        isNoticeCollapsed ? (
          // 접힌 상태 - 우측 상단 아이콘
          <button
            onClick={() => setIsNoticeCollapsed(false)}
            className={`${isMobile ? 'fixed right-3 top-18' : 'absolute right-3 top-2'} z-[30] p-2 bg-white rounded-full shadow-lg border border-gray-200 hover:bg-gray-50 transition-colors`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FE3A8F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m3 11 18-5v12L3 14v-3z"/>
              <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>
            </svg>
          </button>
        ) : (
          // 펼친 상태 - 모바일: fixed, PC: absolute 배너
          <div 
            className={`${isMobile ? 'fixed left-4 right-4 top-18' : 'absolute left-4 right-4 top-2'} z-[30] rounded-md bg-pink-50 to-white shadow-md`}
          >
            <div className="px-4 py-3">
              <div className="flex items-start gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                  <path d="m3 11 18-5v12L3 14v-3z"/>
                  <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>
                </svg>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm text-gray-700 whitespace-pre-wrap break-words ${!isNoticeExpanded ? 'line-clamp-2' : ''}`}>
                    {chatNotice.content}
                  </p>
                  {chatNotice.content.split('\n').length > 2 || chatNotice.content.length > 60 ? (
                    <button
                      onClick={() => setIsNoticeExpanded(!isNoticeExpanded)}
                      className="text-xs text-[#FE3A8F] font-medium mt-1"
                    >
                      {isNoticeExpanded ? '접기' : '펼치기'}
                    </button>
                  ) : null}
                </div>
                <button
                  onClick={() => setIsNoticeCollapsed(true)}
                  className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )
      )}

      {/* 퀘스트 팝업 모달 */}
      {isQuestPopupOpen && shouldRenderJobsSection && (
        <div 
          className="fixed inset-0 z-[9999] bg-black/50 flex items-end justify-center"
          onClick={() => setIsQuestPopupOpen(false)}
        >
          <div 
            className="bg-white w-full max-w-lg rounded-t-2xl max-h-[70vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">퀘스트 선택</h2>
              <button 
                onClick={() => setIsQuestPopupOpen(false)}
                className="p-1 hover:bg-gray-100 rounded-full"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {jobsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-pink-500" />
                </div>
              ) : jobs.length === 0 ? (
                <p className="text-center text-gray-500 py-8">등록된 퀘스트가 없습니다</p>
              ) : (
                <div className="space-y-3">
                  {jobs.map((job) => {
                    const currentCount = jobCounts[job.id] || 1
                    const totalCost = job.coins_per_job * currentCount
                    const hasEnoughPoints = userPoints >= totalCost
                    
                    return (
                      <div key={job.id} className="bg-gray-50 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-semibold text-gray-800">{job.job_name}</h3>
                          <span className="text-pink-500 font-medium">{job.coins_per_job.toLocaleString()}P</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleJobCountChange(job.id, currentCount - 1)}
                              disabled={currentCount <= 1}
                              className="w-8 h-8 flex items-center justify-center border-2 border-gray-300 rounded-full font-bold disabled:opacity-40"
                            >
                              -
                            </button>
                            <span className="w-8 text-center font-semibold">{currentCount}</span>
                            <button
                              onClick={() => handleJobCountChange(job.id, currentCount + 1)}
                              className="w-8 h-8 flex items-center justify-center border-2 border-gray-300 rounded-full font-bold"
                            >
                              +
                            </button>
                          </div>
                          <button
                            onClick={() => {
                              if (hasEnoughPoints) {
                                handleDirectRequest(job)
                                setIsQuestPopupOpen(false)
                              } else if (handleChargeRequest) {
                                handleChargeRequest(totalCost - userPoints)
                              }
                            }}
                            disabled={isSending || isRequesting}
                            className={`px-4 py-2 rounded-full font-medium text-sm transition-colors ${
                              hasEnoughPoints 
                                ? 'bg-pink-500 text-white hover:bg-pink-600' 
                                : 'bg-gray-200 text-gray-600'
                            } disabled:opacity-50`}
                          >
                            {hasEnoughPoints ? `${totalCost.toLocaleString()}P 요청` : '충전 필요'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 의뢰 상태 표시 - in_progress 상태일 때만 배너 표시 */}
      {/* {(isCurrentUserPartner || isRequestedByCurrentUser) && hasAnyActiveRequest && selectedRequest && selectedRequest.status === 'in_progress' && (
        <div 
          ref={requestStatusRef}
          className={`${isMobile ? 'fixed left-0 right-0 z-20 px-4 py-3 shadow-lg' : 'px-4 py-3'}`}
          style={{
            ...(isMobile ? {
              top: `calc(${hideHeader ? customMobileHeaderHeight : mobileLayoutHeights.header || 68}px + env(safe-area-inset-top, 0px))`,
            } : {}),
            backgroundColor: '#FFF0F5', // 연한 핑크색
          }}
        >
          <div className="flex items-center gap-3 text-sm">
            {progressSeconds !== null && (
              <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0">
                <img src="/icon/stop-watch.png" alt="" className="h-5 w-5" />
                {formatRemainingTime(progressSeconds)}
              </span>
            )}
            <span className="text-gray-900 font-medium truncate min-w-0 flex-1 max-w-[120px]">
              {selectedRequest.job_name || selectedRequest.request_type}
            </span>
            <span className="text-[#FE3A8F] font-semibold whitespace-nowrap flex-shrink-0">
              {((selectedRequest.coins_per_job || 0) * selectedRequest.job_count).toLocaleString()}P / {selectedRequest.job_count}회
            </span>
            {isCurrentUserPartner && (
              <Button
                onClick={() => handleCompleteRequest(selectedRequest.id)}
                variant="primary"
                size="sm"
                className="py-1 px-3 text-xs font-medium text-white flex-shrink-0"
                style={{ backgroundColor: '#FE3A8F' }}
              >
                완료
              </Button>
            )}
          </div>
        </div>
      )} */}

      {/* 메시지 영역 */}
      <ChatMessages
        ref={messagesContainerRef}
        messages={displayMessages}
        currentUserId={currentUserId}
        partnerName={partnerName}
        partnerAvatar={partnerAvatar}
        isCsRoom={isCsRoom}
        isLoading={isLoading}
        messageTopOffset={messageTopOffset}
        messageBottomPadding={messageBottomPadding}
        messagesEndRef={messagesEndRef}
        postsCount={partnerStats.postsCount}
        followersCount={partnerStats.followersCount}
        isCurrentUserPartner={isCurrentUserActualPartner}
        currentUserPartnerId={currentUserPartnerId}
        pendingRequests={activeRequests || []}
        onAcceptRequest={handleAcceptRequest}
        onRejectRequest={handleRejectRequest}
        isAccepting={isAccepting}
        remainingSeconds={remainingSeconds}
        formatRemainingTime={formatRemainingTime}
        memberCode={user?.member_code}
        onLoadMore={loadMoreMessages}
        hasMore={hasMore}
        isLoadingMore={isLoadingMore}
        onLockedPostClick={handleLockedPostClick}
        onPostPurchaseSuccess={(postId) => {
          if ((window as any).__refreshChatPostCache) {
            (window as any).__refreshChatPostCache(postId)
          }
        }}
        userPoints={userPoints}
        onChargeRequest={(requiredPoints) => {
          setChargeRequiredPoints(requiredPoints)
          setIsChargeModalOpen(true)
        }}
        onDirectPostPurchase={handlePostPurchase}
        onScheduleConfirm={async (orderId) => {
          // 주문 정보 조회하여 order_number 및 스케줄 정보 가져오기
          try {
            const orderResponse = await storeOrdersApi.getDetail(orderId)
            if (orderResponse.success && orderResponse.data) {
              const order = orderResponse.data as any
              setSelectedOrderNumber(order.order_number || order.order_id)
              
              // 제품 정보 저장
              if (order.product) {
                setSelectedOrderProduct({
                  name: order.product.name,
                  thumbnail_url: order.product.thumbnail_url,
                  price: order.product.price,
                })
              }
              
              // 스케줄 정보 저장 (최초 일정 표시용) - reserved_start_time, reserved_end_time, reserved_location 사용
              if (order.reserved_start_time || order.reserved_end_time || order.reserved_location) {
                setOriginalSchedule({
                  start_time: order.reserved_start_time,
                  end_time: order.reserved_end_time,
                  location: order.reserved_location,
                  location_point: order.reserved_location_point,
                })
                // reserved_start_time이 있으면 selectedDate 초기화 (UTC 변환 없이)
                if (order.reserved_start_time) {
                  setSelectedDate(parseKoreanDateTime(order.reserved_start_time))
                }
                // 장소 정보 초기화
                if (order.reserved_location) {
                  setScheduleLocation(order.reserved_location)
                }
                // 좌표 정보 초기화 (지도 표시용)
                if (order.reserved_location_point) {
                  setScheduleLocationPoint(order.reserved_location_point)
                }
              } else {
                setOriginalSchedule(null)
                setScheduleLocation('')
                setScheduleLocationPoint(null)
              }
            } else {
              setSelectedOrderNumber(orderId)
              setOriginalSchedule(null)
            }
          } catch (error) {
            console.error('주문 정보 조회 실패:', error)
            setSelectedOrderNumber(orderId)
            setOriginalSchedule(null)
          }
          setSelectedOrderIdForSchedule(orderId)
          setIsEditingSchedule(false)
          // selectedDate는 이미 위에서 설정되었으므로 여기서는 초기화하지 않음
          setSelectedStartTimeSlot(null)
          setSelectedEndTimeSlot(null)
          setSelectedScheduleId(null)
          setIsScheduleConfirmSheetOpen(true)
        }}
        onScheduleReject={async (orderId) => {
          if (!confirm('이 주문의 일정 변경을 거절하시겠습니까? 주문이 취소됩니다.')) {
            return
          }
          
          setIsRejectingSchedule(true)
          try {
            const response = await storeOrdersApi.cancel(orderId)
            if (response.success) {
              toast.success('주문이 취소되었습니다.')
              refreshMessages()
            } else {
              toast.error(response.error?.message || '주문 취소에 실패했습니다.')
            }
          } catch (error: any) {
            console.error('주문 취소 실패:', error)
            toast.error(error.message || '주문 취소에 실패했습니다.')
          } finally {
            setIsRejectingSchedule(false)
          }
        }}
        onTrackingInput={(orderId) => {
          setSelectedOrderIdForTracking(orderId)
          setTrackingCourier('')
          setTrackingNumber('')
          setIsTrackingSheetOpen(true)
        }}
        onFulfillOrder={async (orderId) => {
          setSelectedOrderIdForFulfillment(orderId)
          setFulfillmentFiles([])
          setFulfillmentNote('')
          setOrderFulfillments([])
          setFulfillmentOrderInfo(null)
          // 주문 정보 조회 (구매자 요청사항 포함)
          try {
            const orderResponse = await storeOrdersApi.getDetail(orderId)
            if (orderResponse.success && orderResponse.data) {
              const order = orderResponse.data as any
              // delivery_memo는 order에 직접 있거나 shipments 안에 있을 수 있음
              const deliveryMemo = order.delivery_memo || order.shipments?.[0]?.delivery_memo
              setFulfillmentOrderInfo({
                delivery_memo: deliveryMemo,
                product_name: order.order_items?.[0]?.product_name || order.items?.[0]?.product_name
              })
            }
          } catch (error) {
            console.error('주문 정보 조회 실패:', error)
          }
          // 기존 이행완료 조회
          try {
            const response = await storeCollaborationApi.getFulfillment(orderId)
            if (response.success && response.data) {
              const data = response.data as { fulfillments?: OrderFulfillment[] }
              setOrderFulfillments(data.fulfillments || [])
            }
          } catch (error) {
            console.error('이행완료 조회 실패:', error)
          }
          setIsFulfillmentSheetOpen(true)
        }}
        onOrderCancel={async (orderId) => {
          if (processingOrderActionIds.has(orderId)) return
          if (!confirm('이 주문을 취소하시겠습니까? 구매자에게 환불됩니다.')) {
            return
          }
          
          setProcessingOrderActionIds(prev => new Set(prev).add(orderId))
          try {
            const response = await storeOrdersApi.cancel(orderId)
            if (response.success) {
              toast.success('주문이 취소되었습니다.')
              refreshMessages()
            } else {
              toast.error(response.error?.message || '주문 취소에 실패했습니다.')
            }
          } catch (error: any) {
            console.error('주문 취소 실패:', error)
            toast.error(error.message || '주문 취소에 실패했습니다.')
          } finally {
            setProcessingOrderActionIds(prev => {
              const next = new Set(prev)
              next.delete(orderId)
              return next
            })
          }
        }}
        onPickupComplete={async (orderId) => {
          if (processingOrderActionIds.has(orderId)) return
          if (!confirm('수령을 완료하셨나요?')) {
            return
          }
          
          setProcessingOrderActionIds(prev => new Set(prev).add(orderId))
          try {
            const response = await storeSchedulesApi.updateOrderStatus(orderId, { status: 'completed' })
            if (response.success) {
              toast.success('수령 완료 처리되었습니다.')
              setProcessedOrderIds(prev => [...prev, orderId])
              refreshMessages()
            } else {
              toast.error(response.error?.message || '수령 완료 처리에 실패했습니다.')
            }
          } catch (error: any) {
            console.error('수령 완료 처리 실패:', error)
            toast.error(error.message || '수령 완료 처리에 실패했습니다.')
          } finally {
            setProcessingOrderActionIds(prev => {
              const next = new Set(prev)
              next.delete(orderId)
              return next
            })
          }
        }}
        onNoShow={(orderId) => {
          setSelectedOrderIdForNoShow(orderId)
          setNoShowReason('')
          setIsNoShowSheetOpen(true)
        }}
        processedOrderIds={processedOrderIds}
        onViewStoreOrder={(orderId, sellerPartnerId, isSeller) => {
          if (isSeller) {
            navigate({ to: '/store/partner/products', search: { tab: 'orders', orderId } })
          } else {
            navigate({ to: `/mypage/purchases/${orderId}` })
          }
        }}
        onDigitalView={(orderId) => {
          navigate({ to: `/store/orders/${orderId}/viewer` as any })
        }}
        onDigitalDownload={(orderId) => {
          navigate({ to: '/store/digital/orders/$orderId', params: { orderId } })
        }}
      />

      {/* 입력 영역 */}
      {isBlockedByPartner === null ? (
        /* 차단 상태 확인 중 - 로딩 */
        <div 
          className="flex-shrink-0 bg-gray-50 px-4 pt-3 pb-4 flex items-center justify-center w-full box-border"
          style={{ minHeight: '48px' }}
        >
          <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : isBlockedByPartner ? (
        /* 상대방에게 차단당한 경우 안내 메시지 */
        <div 
          className="flex-shrink-0 bg-gray-100 px-4 pt-3 pb-4 flex items-center justify-center w-full box-border"
          style={{ minHeight: '48px' }}
        >
          <p className="text-sm text-gray-500 text-center whitespace-nowrap">더 이상 해당 채팅을 이용할 수 없습니다</p>
        </div>
      ) : isBlockedByMe ? (
        /* 내가 상대방을 차단한 경우 안내 메시지 + 차단 해제 버튼 */
        <div 
          className="flex-shrink-0 bg-gray-100 px-4 pt-3 pb-4 flex items-center justify-center gap-3 w-full box-border"
          style={{ minHeight: '48px' }}
        >
          <p className="text-sm text-gray-500 text-center whitespace-nowrap">차단한 사용자입니다</p>
          <button
            onClick={async () => {
              if (!partnerMemberCode) return
              try {
                await edgeApi.blocks.unblock(partnerMemberCode)
                setIsBlockedByMe(false)
              } catch (error) {
                console.error('차단 해제 실패:', error)
              }
            }}
            className="text-sm text-gray-500 underline hover:text-gray-700"
          >
            차단 해제
          </button>
        </div>
      ) : (
        <>
          {isCsRoomUser && (
            <div className="flex-shrink-0 px-3 py-2.5 bg-white border-t border-gray-100">
              <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-1 px-1">
                {(csInquiryCategory ? CS_INQUIRY_SUB[csInquiryCategory] ?? [] : CS_INQUIRY_MAIN).map((label) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => handleCsInquiryExample(label, !!csInquiryCategory)}
                    className="shrink-0 px-4 py-2 text-sm font-medium rounded-xl bg-gray-100 text-gray-700 active:bg-pink-100 active:text-pink-700 transition-colors"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <ChatInput
            ref={inputContainerRef}
            newMessage={newMessage}
            isPartnerBlockedUser={isPartnerBlockedUser}
            hasAnyActiveRequest={hasAnyActiveRequest}
            selectedRequest={selectedRequest}
            isSending={isSending || !!isBlockedByPartner}
            partnerId={partnerId}
            partnerName={partnerName || resolvedPartnerName || '통화 상대'}
            partnerAvatar={partnerAvatar}
            inputRef={inputRef}
            onMessageChange={setNewMessage}
            onKeyDown={handleKeyDown}
            onButtonClick={handleButtonClick}
            onSendMessageToChat={handleSendMessageToChat}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            onToggleJobs={isPartnerRolePartner ? handleToggleJobs : undefined}
            onToggleDonation={isPartnerRolePartner ? handleToggleDonation : undefined}
            onSelectAlbum={handleSelectAlbum}
            onSelectCamera={handleSelectCamera}
            isJobsVisible={isQuestPopupOpen}
            isDonationVisible={isDonationSheetOpen}
            showDonationButton={isPartnerRolePartner}
            disabled={!!isBlockedByPartner}
            userRole={user?.role}
            isSubscribedToPartner={isSubscribedToPartner}
            isCurrentUserPartner={isCurrentUserActualPartner}
            isPartnerRolePartner={isPartnerRolePartner}
            messageCostInfo={messageCostInfo}
            hideAttachButton={isCsRoomUser}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={handleFileSelect}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileSelect}
          />
        </>
      )}

      {/* 리뷰 모달 - 의뢰 완료 시 자동 노출 */}
      {completedRequest && (
        <ReviewModal
          isOpen={true}
          onClose={closeReviewModal}
          partnerId={partnerId}
          partnerName={partnerName || '파트너'}
          requestId={completedRequest.id}
        />
      )}

      {/* 포인트 충전 모달 */}
      <ChargeModal
        isOpen={isChargeModalOpen}
        onClose={() => setIsChargeModalOpen(false)}
        onCharge={handleChargeComplete}
      />

      {/* 일정 변경 시트 */}
      <SlideSheet
        isOpen={isScheduleConfirmSheetOpen}
        onClose={() => {
          setIsScheduleConfirmSheetOpen(false)
          setIsEditingSchedule(false)
          setScheduleStartTime('')
          setScheduleEndTime('')
          setScheduleLocation('')
          setScheduleLocationPoint(null)
          setSelectedOrderIdForSchedule(null)
          setSelectedOrderNumber(null)
          setSelectedOrderProduct(null)
          setOriginalSchedule(null)
          setSelectedDate(null)
          setSelectedStartTimeSlot(null)
          setSelectedEndTimeSlot(null)
          setSelectedScheduleId(null)
          setPartnerSchedules([])
        }}
        title="약속 잡기"
        footer={
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => {
                if (isEditingSchedule) {
                  setIsEditingSchedule(false)
                  setSelectedDate(null)
                  setSelectedStartTimeSlot(null)
                  setSelectedEndTimeSlot(null)
                  setSelectedScheduleId(null)
                  setScheduleStartTime('')
                  setScheduleEndTime('')
                  setScheduleLocation('')
                } else {
                setIsScheduleConfirmSheetOpen(false)
                  setIsEditingSchedule(false)
                setScheduleStartTime('')
                setScheduleEndTime('')
                setScheduleLocation('')
                setSelectedOrderIdForSchedule(null)
                  setSelectedOrderNumber(null)
                  setSelectedOrderProduct(null)
                  setOriginalSchedule(null)
                  setSelectedDate(null)
                  setSelectedStartTimeSlot(null)
                  setSelectedEndTimeSlot(null)
                  setSelectedScheduleId(null)
                  setPartnerSchedules([])
                }
              }}
              className="flex-1"
              disabled={isConfirmingSchedule}
            >
              취소
            </Button>
            <Button
              onClick={async () => {
                if (!isEditingSchedule) {
                  return
                }

                if (!selectedOrderIdForSchedule || !selectedStartTimeSlot || !selectedDate) {
                  toast.error('시간을 선택해주세요.')
                  return
                }

                // 종료 시간이 없으면 시작 시간 + 30분으로 설정
                let finalEndTimeSlot: string = selectedEndTimeSlot || ''
                if (!finalEndTimeSlot && selectedStartTimeSlot) {
                  const [hours, minutes] = selectedStartTimeSlot.split(':').map(Number)
                  const endDate = new Date(selectedDate)
                  endDate.setHours(hours, minutes + 30, 0, 0)
                  const endHours = endDate.getHours().toString().padStart(2, '0')
                  const endMinutes = endDate.getMinutes().toString().padStart(2, '0')
                  finalEndTimeSlot = `${endHours}:${endMinutes}`
                }

                if (!finalEndTimeSlot) {
                  toast.error('종료 시간을 설정할 수 없습니다.')
                  return
                }

                setIsConfirmingSchedule(true)
                try {
                  // 선택한 날짜와 시간을 한국 시간(KST, UTC+9)으로 해석 후 UTC로 변환
                  const [startHours, startMinutes] = selectedStartTimeSlot.split(':').map(Number)
                  const year = selectedDate.getFullYear()
                  const month = selectedDate.getMonth() + 1
                  const day = selectedDate.getDate()
                  
                  // 한국 시간(KST)으로 Date 객체 생성 (UTC+9)
                  const startDateKST = new Date(Date.UTC(year, month - 1, day, startHours, startMinutes, 0))
                  // KST를 UTC로 변환 (9시간 빼기)
                  const startTimeUTC = new Date(startDateKST.getTime() - 9 * 60 * 60 * 1000)
                  const startTimeISO = `${startTimeUTC.getUTCFullYear()}-${String(startTimeUTC.getUTCMonth() + 1).padStart(2, '0')}-${String(startTimeUTC.getUTCDate()).padStart(2, '0')} ${String(startTimeUTC.getUTCHours()).padStart(2, '0')}:${String(startTimeUTC.getUTCMinutes()).padStart(2, '0')}`

                  const [endHours, endMinutes] = finalEndTimeSlot.split(':').map(Number)
                  // 한국 시간(KST)으로 Date 객체 생성 (UTC+9)
                  const endDateKST = new Date(Date.UTC(year, month - 1, day, endHours, endMinutes, 0))
                  // KST를 UTC로 변환 (9시간 빼기)
                  const endTimeUTC = new Date(endDateKST.getTime() - 9 * 60 * 60 * 1000)
                  const endTimeISO = `${endTimeUTC.getUTCFullYear()}-${String(endTimeUTC.getUTCMonth() + 1).padStart(2, '0')}-${String(endTimeUTC.getUTCDate()).padStart(2, '0')} ${String(endTimeUTC.getUTCHours()).padStart(2, '0')}:${String(endTimeUTC.getUTCMinutes()).padStart(2, '0')}`

                  const response = await storeSchedulesApi.confirmOrder(selectedOrderIdForSchedule, {
                    start_time: startTimeISO,
                    end_time: endTimeISO,
                    location: scheduleLocation || undefined,
                    location_point: scheduleLocationPoint || undefined,
                  })

                  if (response.success) {
                    toast.success('스케줄이 변경되었습니다.')
                    setIsScheduleConfirmSheetOpen(false)
                    setIsEditingSchedule(false)
                    setScheduleStartTime('')
                    setScheduleEndTime('')
                    setScheduleLocation('')
                    setScheduleLocationPoint(null)
                    setSelectedOrderIdForSchedule(null)
                    setSelectedOrderNumber(null)
                    setSelectedOrderProduct(null)
                    setOriginalSchedule(null)
                    setSelectedDate(null)
                    setSelectedStartTimeSlot(null)
                    setSelectedEndTimeSlot(null)
                    setSelectedScheduleId(null)
                    setPartnerSchedules([])
                    // 메시지 새로고침
                    refreshMessages()
                  } else {
                    toast.error(response.error?.message || '스케줄 변경에 실패했습니다.')
                  }
                } catch (err: any) {
                  toast.error(err.message || '스케줄 변경에 실패했습니다.')
                } finally {
                  setIsConfirmingSchedule(false)
                }
              }}
              disabled={isConfirmingSchedule || !isEditingSchedule || !selectedStartTimeSlot || !selectedDate}
              className="flex-1 bg-[#FE3A8F] text-white"
            >
              {isConfirmingSchedule ? '처리 중...' : '완료'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {selectedOrderIdForSchedule && (
            <>
              {/* 주문 번호 */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500">주문번호: {selectedOrderNumber || selectedOrderIdForSchedule}</p>
              </div>

              {/* 제품 정보 */}
              {selectedOrderProduct && (
                <div className="flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-lg">
                  {selectedOrderProduct.thumbnail_url && (
                    <img
                      src={selectedOrderProduct.thumbnail_url}
                      alt={selectedOrderProduct.name || '상품'}
                      className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{selectedOrderProduct.name}</p>
                    {selectedOrderProduct.price !== undefined && (
                      <p className="text-sm text-gray-500 mt-1">{selectedOrderProduct.price.toLocaleString()}P</p>
                    )}
                  </div>
                </div>
              )}

              {!isEditingSchedule ? (
                // 최초 일정 표시
                <>
                  {originalSchedule && (
                <div>
                      {originalSchedule.start_time && (
                        <div className="flex items-center justify-between mb-6 gap-2">
                          <p className="text-md font-medium">날짜</p>
                          <p className="text-sm text-gray-900">
                            {formatKoreanDate(originalSchedule.start_time, { month: 'long' })}
                          </p>
                        </div>
                      )}
                      {originalSchedule.start_time && (
                        <div className="flex items-center justify-between mb-6 gap-2">
                          <p className="text-md font-medium">시간</p>
                          <p className="text-sm text-gray-900">
                            {formatKoreanTime(originalSchedule.start_time)}
                          </p>
                        </div>
                      )}
                      {originalSchedule.location && (
                        <div className="flex items-center justify-between mb-2 gap-2">
                          <p className="text-md font-medium whitespace-nowrap">장소</p>
                          <p className="text-sm text-gray-900">{originalSchedule.location}</p>
                        </div>
                      )}
                      {/* 좌표가 있으면 지도 미리보기 표시 */}
                      {originalSchedule.location_point && (
                        <div className="mt-3 rounded-lg overflow-hidden border border-gray-200" style={{ height: 150 }}>
                          <MapContainer
                            center={[originalSchedule.location_point.lat, originalSchedule.location_point.lng] as L.LatLngExpression}
                            zoom={16}
                            style={{ height: '100%', width: '100%' }}
                            zoomControl={false}
                            attributionControl={false}
                            dragging={false}
                            scrollWheelZoom={false}
                            doubleClickZoom={false}
                            touchZoom={false}
                          >
                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                            <Marker position={[originalSchedule.location_point.lat, originalSchedule.location_point.lng] as L.LatLngExpression} />
                          </MapContainer>
                        </div>
                      )}
                      <div className="mt-3 pt-3">
                        <Button
                          onClick={() => {
                            // reserved_start_time이 있으면 selectedDate 설정
                            if (originalSchedule?.start_time) {
                              setSelectedDate(parseKoreanDateTime(originalSchedule.start_time))
                              // 시간 슬롯도 설정
                              setSelectedStartTimeSlot(formatKoreanTime(originalSchedule.start_time))
                              // 종료 시간도 설정
                              if (originalSchedule.end_time) {
                                setSelectedEndTimeSlot(formatKoreanTime(originalSchedule.end_time))
                              }
                              // 장소도 설정
                              if (originalSchedule.location) {
                                setScheduleLocation(originalSchedule.location)
                              }
                              // 좌표도 설정
                              if (originalSchedule.location_point) {
                                setScheduleLocationPoint(originalSchedule.location_point)
                              }
                            } else {
                              setSelectedDate(new Date())
                            }
                            setIsEditingSchedule(true)
                          }}
                          variant="outline"
                          size="sm"
                    className="w-full"
                        >
                          수정
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                // 일정 변경 UI (캘린더 + 시간 선택)
                <>
                  {isLoadingPartnerSchedules ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-6 h-6 border-2 border-[#FE3A8F] border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : (
                    <>
                      {/* 캘린더 */}
                      <div className="bg-white p-4">
                        <Calendar
                          onChange={(value) => {
                            if (value instanceof Date) {
                              setSelectedDate(value)
                              setSelectedStartTimeSlot(null)
                              setSelectedEndTimeSlot(null)
                              setSelectedScheduleId(null)
                            } else if (Array.isArray(value) && value[0] instanceof Date) {
                              setSelectedDate(value[0])
                              setSelectedStartTimeSlot(null)
                              setSelectedEndTimeSlot(null)
                              setSelectedScheduleId(null)
                            }
                          }}
                          value={selectedDate}
                          formatDay={(_locale, date) => date.getDate().toString()}
                          formatShortWeekday={(_locale, date) => {
                            const weekdays = ['일', '월', '화', '수', '목', '금', '토']
                            return weekdays[date.getDay()]
                          }}
                          formatMonthYear={(_locale, date) => {
                            return `${date.getFullYear()}년 ${date.getMonth() + 1}월`
                          }}
                          className="!border-0 !w-full"
                          locale="ko-KR"
                          minDate={new Date()}
                        />
                        
                        <style>{CALENDAR_STYLES}</style>
                </div>

                      {/* 시간 선택 */}
                      {selectedDate && (
                        <div className="space-y-4 pb-4">
                          {/* 시작 시간 선택 */}
                <div>
                            <Typography variant="body2" className="font-medium mb-2">
                              시간 선택
                            </Typography>
                            <ScheduleTimeSlotSelector
                              selectedDate={selectedDate}
                              selectedTimeSlot={selectedStartTimeSlot}
                              onSelect={(timeSlot) => {
                                setSelectedStartTimeSlot(timeSlot)
                                setSelectedScheduleId(null)
                                // 시작 시간 + 30분으로 종료 시간 자동 설정
                                const [hours, minutes] = timeSlot.split(':').map(Number)
                                const endDate = new Date(selectedDate)
                                endDate.setHours(hours, minutes + 30, 0, 0)
                                const endHours = endDate.getHours().toString().padStart(2, '0')
                                const endMinutes = endDate.getMinutes().toString().padStart(2, '0')
                                setSelectedEndTimeSlot(`${endHours}:${endMinutes}`)
                              }}
                  />
                </div>

                          {/* 장소 선택 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    장소 (선택)
                  </label>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal text-gray-700"
                    onClick={() => setIsScheduleLocationPickerOpen(true)}
                  >
                    {scheduleLocation || '수령 장소를 선택하세요'}
                  </Button>
                  {/* 좌표가 있으면 지도 미리보기 표시 */}
                  {scheduleLocationPoint && (
                    <div className="mt-3 rounded-lg overflow-hidden border border-gray-200" style={{ height: 150 }}>
                      <MapContainer
                        key={`${scheduleLocationPoint.lat}-${scheduleLocationPoint.lng}`}
                        center={[scheduleLocationPoint.lat, scheduleLocationPoint.lng] as L.LatLngExpression}
                        zoom={16}
                        style={{ height: '100%', width: '100%' }}
                        zoomControl={false}
                        attributionControl={false}
                        dragging={false}
                        scrollWheelZoom={false}
                        doubleClickZoom={false}
                        touchZoom={false}
                      >
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        <Marker position={[scheduleLocationPoint.lat, scheduleLocationPoint.lng] as L.LatLngExpression} />
                      </MapContainer>
                    </div>
                  )}
                </div>
              </div>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </SlideSheet>

      {/* 송장 입력 모달 */}
      <SlideSheet
        isOpen={isTrackingSheetOpen}
        onClose={() => {
          setIsTrackingSheetOpen(false)
          setSelectedOrderIdForTracking(null)
          setTrackingCourier('')
          setTrackingNumber('')
        }}
        title="송장 입력"
      >
        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              택배사
            </label>
            <select
              value={trackingCourier}
              onChange={(e) => setTrackingCourier(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]"
            >
              <option value="">택배사 선택</option>
              <option value="cj">CJ대한통운</option>
              <option value="lotte">롯데택배</option>
              <option value="post">우체국</option>
              <option value="hanjin">한진택배</option>
              <option value="logen">로젠택배</option>
              <option value="kdexp">경동택배</option>
              <option value="daesin">대신택배</option>
              <option value="ilyang">일양로지스</option>
              <option value="chunil">천일택배</option>
              <option value="cvs">편의점택배</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              송장번호
            </label>
            <Input
              type="text"
              value={trackingNumber}
              onChange={(e) => setTrackingNumber(e.target.value)}
              placeholder="송장번호를 입력하세요"
              className="w-full"
            />
          </div>
          <Button
            onClick={async () => {
              if (!trackingCourier || !trackingNumber.trim()) {
                toast.error('택배사와 송장번호를 모두 입력해주세요.')
                return
              }
              if (!selectedOrderIdForTracking) return
              
              setIsSubmittingTracking(true)
              try {
                const response = await storeOrdersApi.updateStatus(selectedOrderIdForTracking, {
                  status: 'shipped',
                  courier: trackingCourier,
                  tracking_number: trackingNumber.trim()
                })
                if (response.success) {
                  toast.success('송장이 등록되었습니다.')
                  setIsTrackingSheetOpen(false)
                  setSelectedOrderIdForTracking(null)
                  setTrackingCourier('')
                  setTrackingNumber('')
                  refreshMessages()
                } else {
                  toast.error(response.error?.message || '송장 등록에 실패했습니다.')
                }
              } catch (error: any) {
                console.error('송장 등록 실패:', error)
                toast.error(error.message || '송장 등록에 실패했습니다.')
              } finally {
                setIsSubmittingTracking(false)
              }
            }}
            disabled={isSubmittingTracking || !trackingCourier || !trackingNumber.trim()}
            className="w-full bg-[#FE3A8F] text-white hover:bg-[#e8a0c0]"
          >
            {isSubmittingTracking ? '등록 중...' : '송장 등록'}
          </Button>
        </div>
      </SlideSheet>

      {/* 이행완료 등록 모달 */}
      <SlideSheet
        isOpen={isFulfillmentSheetOpen}
        onClose={() => {
          setIsFulfillmentSheetOpen(false)
          setSelectedOrderIdForFulfillment(null)
          setFulfillmentFiles([])
          setFulfillmentNote('')
          setFulfillmentOrderInfo(null)
        }}
        title="이행완료 등록"
      >
        <div className="p-4 space-y-4">
          {/* 구매자 요청사항 표시 */}
          {fulfillmentOrderInfo?.delivery_memo && (
            <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
              <Typography variant="caption" className="font-medium text-yellow-700 block mb-1">
                구매자 요청사항
              </Typography>
              <Typography variant="body2" className="text-yellow-800">
                {fulfillmentOrderInfo.delivery_memo}
              </Typography>
            </div>
          )}
          {orderFulfillments.length > 0 ? (
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
              <div className="flex items-center gap-2 mb-3">
                <Typography variant="body2" className="font-medium text-blue-700">
                  이행완료가 이미 등록되었습니다
                </Typography>
              </div>
              {orderFulfillments.map((fulfillment) => (
                <div key={fulfillment.id} className="mt-3">
                  <div className="flex flex-wrap gap-2 mb-2">
                    {fulfillment.media_urls.map((url, idx) => (
                      <img
                        key={idx}
                        src={url}
                        alt={`이행완료 사진 ${idx + 1}`}
                        className="w-16 h-16 object-cover rounded-lg cursor-pointer"
                        onClick={() => window.open(url, '_blank')}
                      />
                    ))}
                  </div>
                  {fulfillment.note && (
                    <Typography variant="caption" className="text-blue-600 block">
                      메모: {fulfillment.note}
                    </Typography>
                  )}
                  <Typography variant="caption" className="text-blue-500 mt-1 block">
                    등록일시: {new Date(fulfillment.created_at).toLocaleString('ko-KR')}
                  </Typography>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  인증 사진 (필수)
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {fulfillmentFiles.map((file, index) => (
                    <div key={index} className="relative w-20 h-20">
                      <img
                        src={URL.createObjectURL(file)}
                        alt={`인증사진 ${index + 1}`}
                        className="w-full h-full object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => setFulfillmentFiles(prev => prev.filter((_, i) => i !== index))}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <label className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-[#FE3A8F] transition-colors">
                    <input
                      type="file"
                      ref={fulfillmentFileInputRef}
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        const files = Array.from(e.target.files || [])
                        const imageFiles = files.filter(f => f.type.startsWith('image/'))
                        if (imageFiles.length !== files.length) {
                          toast.error('이미지 파일만 업로드 가능합니다.')
                        }
                        setFulfillmentFiles(prev => [...prev, ...imageFiles])
                        e.target.value = ''
                      }}
                      className="hidden"
                    />
                    <CameraIcon className="h-6 w-6 text-gray-400" />
                  </label>
                </div>
                <Typography variant="caption" className="text-gray-500">
                  서비스 완료를 증명하는 사진을 업로드해주세요
                </Typography>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  메모 (선택)
                </label>
                <textarea
                  value={fulfillmentNote}
                  onChange={(e) => setFulfillmentNote(e.target.value)}
                  placeholder="이행 완료에 대한 메모를 남겨주세요"
                  rows={2}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F] resize-none"
                />
              </div>
              <Button
                onClick={async () => {
                  if (fulfillmentFiles.length === 0) {
                    toast.error('최소 1개 이상의 인증 사진을 등록해주세요.')
                    return
                  }
                  if (!selectedOrderIdForFulfillment) return
                  
                  setIsSubmittingFulfillment(true)
                  try {
                    const response = await storeCollaborationApi.fulfillOrder(
                      selectedOrderIdForFulfillment,
                      fulfillmentFiles,
                      fulfillmentNote || undefined
                    )
                    if (response.success) {
                      toast.success('이행완료가 등록되었습니다.')
                      setIsFulfillmentSheetOpen(false)
                      setSelectedOrderIdForFulfillment(null)
                      setFulfillmentFiles([])
                      setFulfillmentNote('')
                      refreshMessages()
                    } else {
                      toast.error(response.error?.message || '이행완료 등록에 실패했습니다.')
                    }
                  } catch (error: any) {
                    console.error('이행완료 등록 실패:', error)
                    toast.error(error.message || '이행완료 등록에 실패했습니다.')
                  } finally {
                    setIsSubmittingFulfillment(false)
                  }
                }}
                disabled={isSubmittingFulfillment || fulfillmentFiles.length === 0}
                className="w-full bg-[#FE3A8F] text-white hover:bg-[#e8a0c0]"
              >
                {isSubmittingFulfillment ? '등록 중...' : '이행완료 등록'}
              </Button>
            </>
          )}
        </div>
      </SlideSheet>

      {/* 미수령 팝업 (구매자용) */}
      <SlideSheet
        isOpen={isNoShowSheetOpen}
        onClose={() => {
          setIsNoShowSheetOpen(false)
          setSelectedOrderIdForNoShow(null)
          setNoShowReason('')
        }}
        title="미수령 신고"
      >
        <div className="p-4 space-y-4">
          <Typography variant="body2" className="text-gray-600">
            상품을 수령하지 못한 사유를 입력해주세요.
          </Typography>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              미수령 사유
            </label>
            <textarea
              value={noShowReason}
              onChange={(e) => setNoShowReason(e.target.value)}
              placeholder="미수령 사유를 입력해주세요"
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F] resize-none"
            />
          </div>
          <Button
            onClick={async () => {
              if (!noShowReason.trim()) {
                toast.error('미수령 사유를 입력해주세요.')
                return
              }
              if (!selectedOrderIdForNoShow) return
              
              setIsSubmittingNoShow(true)
              try {
                const response = await storeSchedulesApi.updateOrderStatus(selectedOrderIdForNoShow, {
                  status: 'no_show',
                  reason: noShowReason.trim(),
                })
                if (response.success) {
                  toast.success('미수령 신고가 접수되었습니다.')
                  setProcessedOrderIds(prev => [...prev, selectedOrderIdForNoShow])
                  setIsNoShowSheetOpen(false)
                  setSelectedOrderIdForNoShow(null)
                  setNoShowReason('')
                  refreshMessages()
                } else {
                  toast.error(response.error?.message || '미수령 신고에 실패했습니다.')
                }
              } catch (error: any) {
                console.error('미수령 신고 실패:', error)
                toast.error(error.message || '미수령 신고에 실패했습니다.')
              } finally {
                setIsSubmittingNoShow(false)
              }
            }}
            disabled={isSubmittingNoShow || !noShowReason.trim()}
            className="w-full bg-[#FE3A8F] text-white hover:bg-[#e8a0c0]"
          >
            {isSubmittingNoShow ? '처리 중...' : '미수령 신고'}
          </Button>
        </div>
      </SlideSheet>

      {/* 주문 조회 팝업 */}
      <SlideSheet
        isOpen={isOrderListSheetOpen}
        onClose={() => {
          setIsOrderListSheetOpen(false)
          setChatRoomOrders([])
        }}
        title="주문 내역"
      >
        <div className="p-4">
          {isLoadingChatRoomOrders ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#FE3A8F]" />
            </div>
          ) : chatRoomOrders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              주문 내역이 없습니다.
            </div>
          ) : (
            <div className="space-y-3">
              {chatRoomOrders.map((order) => (
                <div
                  key={order.order_id}
                  className="p-4 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => {
                    setSelectedOrderDetail(order)
                    setIsOrderDetailSheetOpen(true)
                  }}
                >
                  <div className="flex items-start gap-3">
                    {order.product?.thumbnail_url && (
                      <img
                        src={order.product.thumbnail_url}
                        alt={order.product.name}
                        className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <Typography variant="body1" className="font-medium truncate">
                        {order.product?.name || '상품명 없음'}
                      </Typography>
                      <Typography variant="caption" className="text-gray-500">
                        주문번호: {order.order_number || order.order_id.slice(0, 8)}...
                      </Typography>
                      <div className="flex items-center justify-between mt-2">
                        <Typography variant="body2" className="font-semibold text-[#FE3A8F]">
                          {order.total_amount?.toLocaleString()}P
                        </Typography>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          order.status === 'paid' ? 'bg-blue-100 text-blue-700' :
                          order.status === 'completed' ? 'bg-green-100 text-green-700' :
                          order.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {order.status === 'pending' ? '대기' :
                           order.status === 'paid' ? '결제완료' :
                           order.status === 'completed' ? '완료' :
                           order.status === 'cancelled' ? '취소' :
                           order.status === 'no_show' ? '미수령' :
                           order.status}
                        </span>
                      </div>
                      {order.schedule && (
                        <Typography variant="caption" className="text-gray-500 mt-1 block">
                          일정: {formatKoreanDate(order.schedule.start_time, { month: 'short' })} {formatKoreanTime(order.schedule.start_time)}
                        </Typography>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SlideSheet>

      {/* 주문 상세 슬라이드 팝업 */}
      <SlideSheet
        isOpen={isOrderDetailSheetOpen}
        onClose={() => {
          setIsOrderDetailSheetOpen(false)
          setSelectedOrderDetail(null)
        }}
        title="주문 상세"
      >
        {selectedOrderDetail && (
          <div className="p-4 space-y-4">
            {/* 상품 정보 */}
            <div className="flex gap-4">
              {selectedOrderDetail.product?.thumbnail_url && (
                <img
                  src={selectedOrderDetail.product.thumbnail_url}
                  alt={selectedOrderDetail.product.name}
                  className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                />
              )}
              <div className="flex-1 min-w-0">
                <Typography variant="body1" className="font-medium">
                  {selectedOrderDetail.product?.name || '상품명 없음'}
                </Typography>
                <Typography variant="caption" className="text-gray-500">
                  {selectedOrderDetail.product?.product_type === 'digital' ? '디지털' :
                   selectedOrderDetail.product?.product_type === 'on_site' ? '현장수령' :
                   selectedOrderDetail.product?.product_type === 'delivery' ? '택배' :
                   selectedOrderDetail.product?.product_type}
                </Typography>
              </div>
            </div>

            {/* 주문 정보 */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">주문번호</span>
                <span className="font-medium">{selectedOrderDetail.order_number || selectedOrderDetail.order_id.slice(0, 8)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">주문일시</span>
                <span className="font-medium">{new Date(selectedOrderDetail.created_at).toLocaleString('ko-KR')}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">수량</span>
                <span className="font-medium">{selectedOrderDetail.quantity}개</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">상태</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  selectedOrderDetail.status === 'paid' ? 'bg-blue-100 text-blue-700' :
                  selectedOrderDetail.status === 'shipped' ? 'bg-purple-100 text-purple-700' :
                  selectedOrderDetail.status === 'delivered' ? 'bg-green-100 text-green-700' :
                  selectedOrderDetail.status === 'confirmed' ? 'bg-gray-100 text-gray-700' :
                  selectedOrderDetail.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {selectedOrderDetail.status === 'pending' ? '결제 대기' :
                   selectedOrderDetail.status === 'paid' ? '결제완료' :
                   selectedOrderDetail.status === 'shipped' ? '배송중' :
                   selectedOrderDetail.status === 'delivered' ? '배송완료' :
                   selectedOrderDetail.status === 'confirmed' ? '구매확정' :
                   selectedOrderDetail.status === 'cancelled' ? '취소' :
                   selectedOrderDetail.status === 'no_show' ? '미수령' :
                   selectedOrderDetail.status}
                </span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                <span className="text-gray-600 font-medium">총 금액</span>
                <span className="font-bold text-[#FE3A8F]">{selectedOrderDetail.total_amount?.toLocaleString()}P</span>
              </div>
            </div>

            {/* 배송 정보 (택배 상품인 경우) */}
            {selectedOrderDetail.product?.product_type === 'delivery' && selectedOrderDetail.recipient_name && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <Typography variant="body2" className="font-medium text-gray-700 mb-2">배송 정보</Typography>
                <div className="text-sm space-y-1">
                  <div><span className="text-gray-600">받는 분: </span>{selectedOrderDetail.recipient_name}</div>
                  {selectedOrderDetail.recipient_phone && (
                    <div><span className="text-gray-600">연락처: </span>{selectedOrderDetail.recipient_phone}</div>
                  )}
                  {selectedOrderDetail.recipient_address && (
                    <div><span className="text-gray-600">주소: </span>{selectedOrderDetail.recipient_address}</div>
                  )}
                  {selectedOrderDetail.courier && selectedOrderDetail.tracking_number && (
                    <div className="pt-2 border-t border-gray-200">
                      <span className="text-gray-600">택배사: </span>{selectedOrderDetail.courier}<br/>
                      <span className="text-gray-600">송장번호: </span>{selectedOrderDetail.tracking_number}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 일정 정보 (현장수령 상품인 경우) */}
            {selectedOrderDetail.schedule && (
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <Typography variant="body2" className="font-medium text-gray-700 mb-2">일정 정보</Typography>
                <div className="text-sm space-y-1">
                  <div>
                    <span className="text-gray-600">일시: </span>
                    {(() => {
                      const date = parseKoreanDateTime(selectedOrderDetail.schedule.start_time)
                      return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 ${formatKoreanTime(selectedOrderDetail.schedule.start_time)}`
                    })()}
                  </div>
                  {selectedOrderDetail.schedule.location && (
                    <div><span className="text-gray-600">장소: </span>{selectedOrderDetail.schedule.location}</div>
                  )}
                </div>
              </div>
            )}

            {/* 주문 상세 바로가기 버튼 */}
            <Button
              onClick={() => {
                navigate({ to: `/mypage/purchases/${selectedOrderDetail.order_id}` })
              }}
              className="w-full bg-[#FE3A8F] text-white hover:bg-[#e8a0c0]"
            >
              주문 상세 페이지로 이동
            </Button>
          </div>
        )}
      </SlideSheet>

      {/* 게시물 구매 시트 */}
      <SlideSheet
        isOpen={!!purchaseTargetPost && isPurchaseSheetVisible}
        onClose={closePurchaseSheet}
        title="포스트 열기"
        initialHeight="auto"
      >
        <div className="flex flex-col gap-4 px-4 pb-8">
          {purchaseTargetPost && (
            <>
              {purchaseTargetPost.pointPrice > 0 && (
                <button
                  type="button"
                  className="flex items-center justify-between rounded-2xl border border-gray-200 p-4 hover:bg-gray-50"
                  onClick={handlePurchaseSinglePost}
                  disabled={isProcessingPurchase}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
                      <CreditCard className="h-5 w-5 text-blue-500" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium">단건 구매</p>
                      <p className="text-sm text-gray-500">{purchaseTargetPost.pointPrice.toLocaleString()}P로 이 포스트만 구매</p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                </button>
              )}
            </>
          )}
          <Button
            variant="secondary"
            className="w-full rounded-full"
            onClick={closePurchaseSheet}
          >
            닫기
          </Button>
        </div>
      </SlideSheet>

      {/* 지도 위치 선택 */}
      <LocationPickerSheet
        isOpen={isScheduleLocationPickerOpen}
        onClose={() => setIsScheduleLocationPickerOpen(false)}
        onConfirm={(result) => {
          setScheduleLocation(result.address)
          setScheduleLocationPoint({ lat: result.lat, lng: result.lng })
          setIsScheduleLocationPickerOpen(false)
        }}
      />
    </div>
  )
})