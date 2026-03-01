import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { mateYouApi, edgeApi } from '@/lib/apiClient'

interface ChatRoom {
  roomId: string
  partnerId: string
  partnerName: string
  partnerAvatar?: string | null
  lastMessage: string
  lastMessageTime: string
  unreadCount: number
  isAdminRoom?: boolean
  isCsRoom?: boolean
}

interface PartnerRequest {
  id: string
  status: 'pending' | 'accepted' | 'rejected' | 'completed' | 'in_progress'
  partner_id: string
  client_id: string
}

interface GlobalRealtimeContextType {
  // 채팅 관련
  chatRooms: ChatRoom[]
  totalUnreadCount: number
  currentOpenChatPartnerId: string | null

  // 파트너 요청 관련
  partnerRequests: PartnerRequest[]
  pendingRequestsCount: number

  // 액션
  markChatAsRead: (partnerId: string) => void
  markAllChatsAsRead: () => void
  refreshChatRooms: () => void
  refreshPartnerRequests: () => void
  setCurrentOpenChatPartnerId: (partnerId: string | null) => void
}

const GlobalRealtimeContext = createContext<GlobalRealtimeContextType | null>(null)

// 채팅방 정렬 함수: 관리자 → CS → 나머지 최신 메시지 순
const sortChatRooms = (rooms: ChatRoom[]): ChatRoom[] => {
  return [...rooms].sort((a, b) => {
    if (a.isAdminRoom && !b.isAdminRoom) return -1
    if (!a.isAdminRoom && b.isAdminRoom) return 1
    if (a.isCsRoom && !b.isCsRoom) return -1
    if (!a.isCsRoom && b.isCsRoom) return 1
    const aT = new Date(a.lastMessageTime).getTime()
    const bT = new Date(b.lastMessageTime).getTime()
    if (Number.isNaN(aT) || Number.isNaN(bT)) return 0
    return bT - aT
  })
}

interface GlobalRealtimeProviderProps {
  children: ReactNode
}

export function GlobalRealtimeProvider({ children }: GlobalRealtimeProviderProps) {
  const { user } = useAuth()
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([])
  const [partnerRequests, setPartnerRequests] = useState<PartnerRequest[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [currentOpenChatPartnerId, setCurrentOpenChatPartnerId] = useState<string | null>(null)
  const subscriptionsRef = useRef<Array<any>>([])
  const currentOpenChatPartnerIdRef = useRef<string | null>(null)
  const chatRoomsRef = useRef<ChatRoom[]>([])
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isReconnectingRef = useRef(false)
  const MAX_RECONNECT_ATTEMPTS = 5
  
  // chatRooms 변경 시 ref도 업데이트
  useEffect(() => {
    chatRoomsRef.current = chatRooms
  }, [chatRooms])

  // ref 동기화 (실시간 콜백에서 최신 값 참조용)
  useEffect(() => {
    currentOpenChatPartnerIdRef.current = currentOpenChatPartnerId
  }, [currentOpenChatPartnerId])

  // 채팅 관련 계산된 값들
  const totalUnreadCount = chatRooms.reduce((total, room) => total + room.unreadCount, 0)
  const pendingRequestsCount = partnerRequests.filter(req => req.status === 'pending' || req.status === 'in_progress').length

  // 채팅방 데이터 가져오기 (api-chat Edge Function 사용)
  const fetchChatRooms = async () => {
    if (!user?.id) return

    try {
      // api-chat/rooms로 채팅방 목록 조회
      const response = await edgeApi.chat.getRooms()

      if (!response.success || !response.data) {
        throw new Error('채팅방 목록 조회 실패')
      }

      const apiRooms = response.data || []

      // API 응답을 ChatRoom 형식으로 변환
      const allRooms: ChatRoom[] = apiRooms.map((room: any) => {
        const isCreator = room.created_by === user.id
        const partnerInfo = isCreator ? room.partner : room.creator
        const isCs = room.is_cs_room === true
        const partnerId = isCs ? (room.id || '') : (partnerInfo?.id || room.partner_id || '')

        let partnerName: string
        let partnerAvatar: string | null
        if (isCs) {
          if (isCreator) {
            partnerName = '1:1 문의'
            partnerAvatar = '/logo.svg'
          } else {
            partnerName = room.creator?.name || room.display_name || '문의'
            partnerAvatar = room.creator?.profile_image || null
          }
        } else {
          partnerName = partnerInfo?.name || 'Unknown'
          partnerAvatar = partnerInfo?.profile_image || null
        }

        return {
          roomId: room.id || '',
          partnerId,
          partnerName,
          partnerAvatar,
          lastMessage: room.latest_message?.message || '',
          lastMessageTime: room.latest_message?.created_at || room.updated_at || '',
          unreadCount: room.unread_count || 0,
          isAdminRoom: room.is_admin_room || false,
          isCsRoom: room.is_cs_room || false,
        }
      })

      // 관리자 최상단 고정, 나머지는 최신순 정렬
      setChatRooms(sortChatRooms(allRooms))
    } catch (error) {
      console.error('Error fetching chat rooms:', error)
    }
  }

  // 파트너 요청 데이터 가져오기 (파트너인 경우에만)
  const fetchPartnerRequests = async () => {
    if (!user?.id) return
    
    // 파트너가 아닌 경우 조회하지 않음
    if (user.role !== 'partner') {
      setPartnerRequests([])
      return
    }

    try {
      // partner_requests.partner_id는 partners.id를 참조하므로, members.id로 partners.id를 찾아야 함
      // client_id는 members.id를 참조하므로 그대로 사용 가능
      
      // partner_requests 조회 - Express API 사용 (파트너 여부 자동 처리)
      const requestsResponse = await mateYouApi.partnerDashboard.getRequests({ limit: 100 })

      if (requestsResponse.data.success && requestsResponse.data.data) {
        const requestsData = Array.isArray(requestsResponse.data.data)
          ? requestsResponse.data.data
          : []
        setPartnerRequests(requestsData)
      } else {
        console.log('ℹ️ 파트너 요청 데이터 없음 (정상)')
        setPartnerRequests([])
      }
    } catch (error) {
      console.error('Error fetching partner requests:', error)
      // 에러 발생 시 빈 배열로 설정
      setPartnerRequests([])
    }
  }

  // 재연결 스케줄링 함수
  const scheduleReconnect = useCallback(() => {
    if (isReconnectingRef.current) return
    if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
      console.warn('[Realtime] 최대 재연결 시도 횟수 도달')
      return
    }

    isReconnectingRef.current = true
    const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000)
    console.log(`[Realtime] ${delay}ms 후 재연결 시도 (${reconnectAttemptsRef.current + 1}/${MAX_RECONNECT_ATTEMPTS})`)

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }

    reconnectTimeoutRef.current = setTimeout(() => {
      reconnectAttemptsRef.current++
      isReconnectingRef.current = false
      setupRealtimeSubscriptions()
    }, delay)
  }, [])

  // 실시간 구독 설정
  const setupRealtimeSubscriptions = useCallback(() => {
    if (!user?.id) return

    // 기존 구독 해제
    subscriptionsRef.current.forEach(sub => sub?.unsubscribe?.())
    subscriptionsRef.current = []

    // 채팅 메시지 실시간 구독
    const chatSubscription = supabase
      .channel(`global-chat-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'member_chats',
      }, async (payload) => {
        const newMessage = payload.new as any
        const isRelevantMessage =
          newMessage.sender_id === user.id || newMessage.receiver_id === user.id

        if (isRelevantMessage) {
          // 전체 refetch 대신 로컬 상태만 업데이트 (성능 최적화)
          const partnerId = newMessage.sender_id === user.id
            ? newMessage.receiver_id
            : newMessage.sender_id

          console.log('[Realtime] New message received:', {
            messageId: newMessage.id,
            partnerId,
            message: newMessage.message?.substring(0, 30),
          })

          // setChatRooms 내부에서 existingRoom 체크 (클로저 문제 해결)
          // 메시지 업데이트 후 최신순 정렬 적용 (관리자 제외)
          setChatRooms(prev => {
            console.log('[Realtime] Current rooms:', prev.map(r => ({ partnerId: r.partnerId, lastMsg: r.lastMessage?.substring(0, 20) })))
            const existingRoom = prev.find(r => r.partnerId === partnerId)
            console.log('[Realtime] existingRoom found:', !!existingRoom)

            if (existingRoom) {
              // 현재 열린 채팅방인지 확인 (열린 채팅방이면 unreadCount 증가 안함)
              const isCurrentlyOpenChat = currentOpenChatPartnerIdRef.current === partnerId
              
              // 기존 채팅방 업데이트 후 정렬
              const updated = prev.map(room =>
                room.partnerId === partnerId
                  ? {
                      ...room,
                      lastMessage: newMessage.message,
                      lastMessageTime: newMessage.created_at,
                      unreadCount: newMessage.receiver_id === user.id && !newMessage.is_read && !isCurrentlyOpenChat
                        ? room.unreadCount + 1
                        : room.unreadCount,
                    }
                  : room
              )
              console.log('[Realtime] Updated room lastMessage:', newMessage.message?.substring(0, 30))
              return sortChatRooms(updated)
            }

            // 기존 채팅방이 없으면 현재 상태 유지 (비동기로 추가될 예정)
            console.log('[Realtime] Room not found, will be added async')
            return prev
          })

          // 새 채팅방인 경우 - 비동기로 상대방 정보 조회 후 추가
          // 비동기 작업이므로 별도로 처리
          ;(async () => {
            try {
              const { data: partnerData } = await supabase
                .from('members')
                .select('name, profile_image, role')
                .eq('id', partnerId)
                .single()

              if (partnerData) {
                const partner = partnerData as {
                  name: string | null
                  profile_image: string | null
                  role: 'normal' | 'partner' | 'admin'
                }

                // 새 채팅방 추가 (중복 체크 강화, 최신순 정렬 적용)
                setChatRooms(prev => {
                  // 다시 한번 중복 체크 (비동기 작업 중 추가되었을 수 있음)
                  const alreadyExists = prev.find(r => r.partnerId === partnerId)
                  if (alreadyExists) {
                    return prev // 이미 있으면 추가하지 않음
                  }

                  // 현재 열린 채팅방인지 확인
                  const isCurrentlyOpenChat = currentOpenChatPartnerIdRef.current === partnerId
                  
                  const newRoom: ChatRoom = {
                    roomId: newMessage.chat_room_id || '',
                    partnerId,
                    partnerName: partner.name || 'Unknown',
                    partnerAvatar: partner.profile_image || null,
                    lastMessage: newMessage.message,
                    lastMessageTime: newMessage.created_at,
                    unreadCount: newMessage.receiver_id === user.id && !newMessage.is_read && !isCurrentlyOpenChat ? 1 : 0,
                  }

                  // 새 채팅방 추가 후 최신순 정렬 적용
                  return sortChatRooms([...prev, newRoom])
                })
              }
            } catch (error) {
              console.error('Failed to fetch partner info for new chat room:', error)
            }
          })()
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'member_chats',
      }, (payload) => {
        // 읽음 상태 변경 시 로컬 상태 업데이트 (순서 유지)
        const updatedMessage = payload.new as any
        if (updatedMessage.receiver_id === user.id && updatedMessage.is_read) {
          setChatRooms(prev => 
            prev.map(room =>
              room.partnerId === updatedMessage.sender_id
                ? { ...room, unreadCount: Math.max(0, room.unreadCount - 1) }
                : room
            )
          )
        }
      })
      .subscribe((status, err) => {
        console.log('[Realtime] Chat 채널 상태:', status, err?.message || '')
        if (status === 'SUBSCRIBED') {
          reconnectAttemptsRef.current = 0
          console.log('[Realtime] Chat 채널 연결 성공')
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('[Realtime] Chat 채널 연결 끊김:', status)
          scheduleReconnect()
        }
      })

    // 파트너 요청 실시간 구독 (파트너인 경우에만)
    let requestSubscription: any = null
    if (user.role === 'partner') {
      // partner_requests.partner_id는 partners.id를 참조하므로,
      // 실시간 구독에서는 전체 refetch를 하는 것이 안전
      requestSubscription = supabase
        .channel(`global-requests-${user.id}`)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'partner_requests',
        }, (payload) => {
          const request = payload.new as any
          // client_id는 members.id를 참조하므로 그대로 비교 가능
          const isClientRequest = request?.client_id === user.id
          
          // partner_id로 받은 요청인지 확인하려면 partners.id를 찾아야 하는데,
          // 실시간 구독에서는 성능을 위해 전체 refetch를 하는 것이 안전
          // (성능 최적화는 나중에 할 수 있음)
          if (isClientRequest) {
            fetchPartnerRequests()
          } else {
            // partner_id인 경우도 확인하기 위해 refetch (안전하게 처리)
            fetchPartnerRequests()
          }
        })
        .subscribe((status, err) => {
          console.log('[Realtime] Request 채널 상태:', status, err?.message || '')
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            scheduleReconnect()
          }
        })
    }

    subscriptionsRef.current = requestSubscription 
      ? [chatSubscription, requestSubscription]
      : [chatSubscription]
  }, [user?.id, user?.role, scheduleReconnect])

  // 채팅을 읽음으로 표시 (api-chat Edge Function 사용)
  const markChatAsRead = useCallback(async (partnerId: string) => {
    if (!user?.id) return

    try {
      // partnerId로 roomId 찾기 (ref 사용으로 안정적인 참조)
      let targetRoom = chatRoomsRef.current.find(room => room.partnerId === partnerId)
      
      // roomId가 없으면 채팅방 목록을 먼저 새로고침
      if (!targetRoom?.roomId) {
        console.log('[Chat] Room not found in cache, fetching rooms...')
        const response = await edgeApi.chat.getRooms()
        if (response.success && response.data) {
          const apiRooms = response.data as any[]
          const foundRoom = apiRooms.find((room: any) => {
            if (room.is_cs_room && room.id === partnerId) return true
            const isCreator = room.created_by === user.id
            const partnerInfo = isCreator ? room.partner : room.creator
            return partnerInfo?.id === partnerId
          })
          if (foundRoom?.id) {
            targetRoom = { roomId: foundRoom.id, partnerId } as any
          }
        }
      }
      
      if (targetRoom?.roomId) {
        console.log('[Chat] Marking room as read:', targetRoom.roomId)
        await edgeApi.chat.markAsRead(targetRoom.roomId)
      } else {
        console.warn('[Chat] Could not find room for partner:', partnerId)
      }

      // 로컬 상태 즉시 업데이트 (순서 유지)
      setChatRooms(prev => 
        prev.map(room =>
          room.partnerId === partnerId
            ? { ...room, unreadCount: 0 }
            : room
        )
      )
    } catch (error) {
      console.error('Error marking chat as read:', error)
    }
  }, [user?.id])

  // 모든 채팅을 읽음으로 표시 (api-chat Edge Function 사용)
  const markAllChatsAsRead = useCallback(async () => {
    if (!user?.id) return

    try {
      // 읽지 않은 메시지가 있는 모든 채팅방에 대해 읽음 처리 (ref 사용)
      const unreadRooms = chatRoomsRef.current.filter(room => room.unreadCount > 0 && room.roomId)
      await Promise.all(
        unreadRooms.map(room => edgeApi.chat.markAsRead(room.roomId))
      )

      // 로컬 상태 즉시 업데이트 (순서 유지)
      setChatRooms(prev => prev.map(room => ({ ...room, unreadCount: 0 })))
    } catch (error) {
      console.error('Error marking all chats as read:', error)
    }
  }, [user?.id])

  // 앱 visibility 변경 시 재연결 체크
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user?.id) {
        console.log('[Realtime] 앱 포그라운드 복귀 - 연결 상태 체크')
        // 채널 상태 확인 후 필요시 재연결
        const hasValidSubscription = subscriptionsRef.current.some(
          sub => sub?.state === 'joined' || sub?.state === 'joining'
        )
        if (!hasValidSubscription) {
          console.log('[Realtime] 연결 끊김 감지 - 재연결 시도')
          reconnectAttemptsRef.current = 0
          setupRealtimeSubscriptions()
        }
        // 데이터 새로고침
        fetchChatRooms()
      }
    }

    const handleOnline = () => {
      if (user?.id) {
        console.log('[Realtime] 네트워크 복구 - 재연결 시도')
        reconnectAttemptsRef.current = 0
        setupRealtimeSubscriptions()
        fetchChatRooms()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', handleOnline)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleOnline)
    }
  }, [user?.id, setupRealtimeSubscriptions])

  // 초기 데이터 로드 및 실시간 구독 설정
  useEffect(() => {
    if (!user?.id) {
      setChatRooms([])
      setPartnerRequests([])
      return
    }

    setIsLoading(true)

    Promise.all([
      fetchChatRooms(),
      fetchPartnerRequests()
    ]).finally(() => {
      setIsLoading(false)
    })

    setupRealtimeSubscriptions()

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      subscriptionsRef.current.forEach(sub => sub?.unsubscribe?.())
    }
  }, [user?.id, setupRealtimeSubscriptions])

  const value: GlobalRealtimeContextType = {
    chatRooms,
    totalUnreadCount,
    currentOpenChatPartnerId,
    partnerRequests,
    pendingRequestsCount,
    markChatAsRead,
    markAllChatsAsRead,
    refreshChatRooms: fetchChatRooms,
    refreshPartnerRequests: fetchPartnerRequests,
    setCurrentOpenChatPartnerId,
  }

  return (
    <GlobalRealtimeContext.Provider value={value}>
      {children}
    </GlobalRealtimeContext.Provider>
  )
}

export function useGlobalRealtime() {
  const context = useContext(GlobalRealtimeContext)
  if (!context) {
    throw new Error('useGlobalRealtime must be used within GlobalRealtimeProvider')
  }
  return context
}