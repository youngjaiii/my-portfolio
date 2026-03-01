/**
 * useVoiceRoom - 보이스 채팅방 관리 훅
 * stream-summary.md 요구사항 기반
 *
 * 기능:
 * - 방 생성 (일반 유저: 비공개만, 파트너: 모든 타입)
 * - 방 입장/퇴장 (stream_viewers)
 * - 발언권 요청/승인/거절 (stream_speaker_requests)
 * - 호스트 관리 (stream_hosts)
 * - 실시간 채팅 (stream_chats)
 *
 * 방 생성은 Edge Function API를 통해 처리 (RLS 우회, 호스트 자동 등록)
 */

import { useAuth } from '@/hooks/useAuth'
import { useUnifiedStreamChannel } from '@/hooks/useUnifiedStreamChannel'
import { edgeApi } from '@/lib/edgeApi'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// Supabase 테이블 타입 헬퍼 (stream 테이블은 database.ts에 없으므로 any 사용)
const streamRooms = () => supabase.from('stream_rooms') as any
const streamHosts = () => supabase.from('stream_hosts') as any
const streamViewers = () => supabase.from('stream_viewers') as any
const streamChats = () => supabase.from('stream_chats') as any
const streamSpeakerRequests = () =>
  supabase.from('stream_speaker_requests') as any

// ========== 타입 정의 ==========

export type StreamType = 'video' | 'audio'
export type AccessType = 'public' | 'private' | 'subscriber'
// scheduled = 리허설 상태 (비디오 방송 시작 전 대기)
export type StreamStatus = 'scheduled' | 'live' | 'ended'
export type HostRole = 'owner' | 'co_host' | 'guest'
export type RequestStatus = 'pending' | 'approved' | 'rejected'
export type ChatType = 'text' | 'donation' | 'system'

export interface StreamRoom {
  id: string
  host_partner_id: string | null
  host_member_id: string | null
  title: string
  description: string | null
  stream_type: StreamType
  access_type: AccessType
  password: string | null
  max_participants: number
  viewer_count: number
  total_viewers: number
  status: StreamStatus
  category_id: string | null
  started_at: string | null
  ended_at: string | null
  created_at: string
  // 조인된 데이터
  category?: { id: string; name: string; slug: string }
  host_partner?: {
    id: string
    partner_name: string
    member: { id: string; name: string; profile_image: string }
  }
  host_member?: { id: string; name: string; profile_image: string }
}

export interface StreamHost {
  id: string
  room_id: string
  partner_id: string | null
  member_id: string | null
  role: HostRole
  joined_at: string
  left_at: string | null
  // 조인된 데이터
  member?: { id: string; name: string; profile_image: string }
  partner?: {
    id: string
    partner_name: string
    member: { id: string; name: string; profile_image: string }
  }
}

export interface StreamViewer {
  id: string
  room_id: string
  member_id: string
  joined_at: string
  left_at: string | null
  member?: { id: string; name: string; profile_image: string; role?: string }
}

export interface StreamChat {
  id: number
  room_id: string
  sender_id: string
  content: string
  chat_type: ChatType
  is_pinned: boolean
  is_deleted: boolean
  is_hidden: boolean
  hidden_by?: string | null
  hidden_at?: string | null
  created_at: string
  // 조인된 데이터
  sender?: { id: string; name: string; profile_image: string | null }
}

export interface SpeakerRequest {
  id: string
  room_id: string
  requester_member_id: string
  status: RequestStatus
  message: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  // 조인된 데이터
  requester?: { id: string; name: string; profile_image: string }
}

export interface StreamCategory {
  id: string
  name: string
  slug: string
  icon_url: string | null
  sort_order: number
  is_active: boolean
}

export interface CreateRoomParams {
  title: string
  description?: string
  access_type: AccessType
  password?: string
  max_participants?: number
  category_id?: string
}

// ========== 카테고리 조회 ==========

export function useStreamCategories() {
  return useQuery({
    queryKey: ['stream-categories'],
    queryFn: async () => {
      const { data, error } = await (supabase.from('stream_categories') as any)
        .select('*')
        .eq('is_active', true)
        .order('sort_order')

      if (error) throw error
      return data as Array<StreamCategory>
    },
    staleTime: 1000 * 60 * 30, // 30분
  })
}

// ========== 방 상세 조회 ==========

export function useVoiceRoomDetail(roomId: string | undefined) {
  return useQuery({
    queryKey: ['voice-room', roomId],
    queryFn: async () => {
      if (!roomId) return null

      const { data, error } = await streamRooms()
        .select(
          `
          id,
          host_partner_id,
          host_member_id,
          title,
          description,
          stream_type,
          access_type,
          max_participants,
          viewer_count,
          total_viewers,
          status,
          category_id,
          tags,
          thumbnail_url,
          started_at,
          ended_at,
          created_at,
          category:stream_categories(id, name, slug),
          host_partner:partners!stream_rooms_host_partner_id_fkey(
            id, partner_name,
            member:members(id, name, profile_image)
          ),
          host_member:members!stream_rooms_host_member_id_fkey(id, name, profile_image)
        `,
        )
        .eq('id', roomId)
        .single()

      if (error) throw error
      return data as StreamRoom
    },
    enabled: !!roomId,
    staleTime: 1000 * 10,
  })
}

// ========== 호스트 목록 조회 ==========

export function useRoomHosts(roomId: string | undefined) {
  return useQuery({
    queryKey: ['room-hosts', roomId],
    queryFn: async () => {
      if (!roomId) return []

      const { data, error } = await streamHosts()
        .select(
          `
          *,
          member:members(id, name, profile_image),
          partner:partners(id, partner_name, member:members(id, name, profile_image))
        `,
        )
        .eq('room_id', roomId)
        .is('left_at', null)
        .order('joined_at')

      if (error) throw error
      return data as Array<StreamHost>
    },
    enabled: !!roomId,
    staleTime: 0, // 항상 새로운 데이터 fetch
    refetchInterval: 3000, // 3초마다 갱신
    refetchOnWindowFocus: true,
  })
}

// ========== 시청자 목록 조회 ==========

export function useRoomViewers(
  roomId: string | undefined,
  enabled: boolean = true,
) {
  return useQuery({
    queryKey: ['room-viewers', roomId],
    queryFn: async () => {
      if (!roomId) return []

      const { data, error } = await streamViewers()
        .select(
          `
          *,
          member:members(id, name, profile_image, role)
        `,
        )
        .eq('room_id', roomId)
        .is('left_at', null)
        .order('joined_at')

      if (error) throw error
      return data as Array<StreamViewer>
    },
    enabled: !!roomId && enabled,
    staleTime: 0, // 항상 새로운 데이터 fetch
    refetchInterval: 3000, // 3초마다 갱신
    refetchOnWindowFocus: true,
  })
}

// ========== 발언권 요청 목록 (호스트용) ==========

export function useSpeakerRequests(
  roomId: string | undefined,
  enabled: boolean = true,
) {
  return useQuery({
    queryKey: ['speaker-requests', roomId],
    queryFn: async () => {
      if (!roomId) return []

      const { data, error } = await streamSpeakerRequests()
        .select(
          `
          *,
          requester:members!stream_speaker_requests_requester_member_id_fkey(id, name, profile_image)
        `,
        )
        .eq('room_id', roomId)
        .eq('status', 'pending')
        .order('created_at')

      if (error) throw error
      return data as Array<SpeakerRequest>
    },
    enabled: !!roomId && enabled,
    refetchInterval: 3000,
  })
}

// ========== 채팅 메시지 조회 ==========

interface UseRoomChatsOptions {
  roomId: string | undefined
  canLoadHistory: boolean // 호스트/admin만 true - 이전 채팅 불러오기 가능
  isRoomLoaded: boolean // room 데이터 로드 완료 여부
}

// ========== 채팅 상태 관리 (React Query 대신 로컬 상태 사용) ==========
// 채팅 데이터를 roomId별로 저장 (컴포넌트 간 공유)
const chatDataMap = new Map<string, Array<StreamChat>>()
const chatInitializedMap = new Map<string, boolean>()
const chatListenersMap = new Map<string, Set<() => void>>()

// 채팅 데이터 구독 함수
function subscribeChatData(roomId: string, listener: () => void) {
  if (!chatListenersMap.has(roomId)) {
    chatListenersMap.set(roomId, new Set())
  }
  chatListenersMap.get(roomId)!.add(listener)
  return () => {
    chatListenersMap.get(roomId)?.delete(listener)
  }
}

// 채팅 데이터 업데이트 및 리스너 알림
function notifyChatListeners(roomId: string) {
  chatListenersMap.get(roomId)?.forEach((listener) => listener())
}

// 채팅 데이터 가져오기
export function getChatData(roomId: string): Array<StreamChat> {
  return chatDataMap.get(roomId) || []
}

// 채팅 데이터 설정
export function setChatData(roomId: string, chats: Array<StreamChat>) {
  chatDataMap.set(roomId, chats)
  notifyChatListeners(roomId)
}

// 채팅 메시지 추가
export function addChatMessage(roomId: string, chat: StreamChat) {
  const currentChats = chatDataMap.get(roomId) || []

  // 중복 체크 (같은 ID)
  if (currentChats.some((c) => c.id === chat.id)) {
    return
  }

  // Optimistic UI: 같은 내용의 임시 메시지가 있으면 교체
  const tempMessageIndex = currentChats.findIndex(
    (c) =>
      typeof c.id === 'string' &&
      String(c.id).startsWith('temp-') &&
      c.content === chat.content &&
      c.sender_id === chat.sender_id,
  )

  if (tempMessageIndex !== -1) {
    // 임시 메시지를 실제 메시지로 교체
    const updatedChats = [...currentChats]
    updatedChats[tempMessageIndex] = chat
    chatDataMap.set(roomId, updatedChats)
    notifyChatListeners(roomId)
    return
  }

  chatDataMap.set(roomId, [...currentChats, chat])
  notifyChatListeners(roomId)
}

// 채팅 메시지 업데이트
export function updateChatMessage(roomId: string, updatedChat: StreamChat) {
  const currentChats = chatDataMap.get(roomId) || []
  const newChats = currentChats.map((chat) =>
    chat.id === updatedChat.id ? updatedChat : chat,
  )
  chatDataMap.set(roomId, newChats)
  notifyChatListeners(roomId)
}

// 채팅 캐시 초기화 함수 (방 퇴장 시 사용)
export function clearChatCache(roomId: string) {
  chatDataMap.delete(roomId)
  chatInitializedMap.delete(roomId)
}

// 채팅 초기화 여부 확인
export function isChatInitialized(roomId: string): boolean {
  return chatInitializedMap.get(roomId) || false
}

// 채팅 초기화 완료 표시
export function markChatInitialized(roomId: string) {
  chatInitializedMap.set(roomId, true)
}

// 채팅 데이터 훅 (로컬 상태 기반)
export function useRoomChats({
  roomId,
  canLoadHistory,
  isRoomLoaded,
}: UseRoomChatsOptions) {
  const [chats, setChats] = useState<Array<StreamChat>>(() =>
    roomId ? getChatData(roomId) : [],
  )
  const [isLoading, setIsLoading] = useState(false)
  const canLoadHistoryRef = useRef(canLoadHistory)
  const hasLoadedRef = useRef(false)

  // 첫 로딩 시에만 canLoadHistory 값 저장
  useEffect(() => {
    if (!hasLoadedRef.current && isRoomLoaded && roomId) {
      canLoadHistoryRef.current = canLoadHistory
    }
  }, [canLoadHistory, isRoomLoaded, roomId])

  // 채팅 데이터 구독
  useEffect(() => {
    if (!roomId) return

    // 현재 데이터로 초기화
    setChats(getChatData(roomId))

    // 변경 구독
    const unsubscribe = subscribeChatData(roomId, () => {
      setChats(getChatData(roomId))
    })

    return unsubscribe
  }, [roomId])

  // 초기 로딩
  useEffect(() => {
    if (!roomId || !isRoomLoaded || hasLoadedRef.current) return
    if (isChatInitialized(roomId)) {
      hasLoadedRef.current = true
      return
    }

    const loadChats = async () => {
      setIsLoading(true)
      try {
        if (canLoadHistoryRef.current) {
          const { data, error } = await streamChats()
            .select(
              `
              *,
              sender:members!stream_chats_sender_id_fkey(id, name, profile_image)
            `,
            )
            .eq('room_id', roomId)
            .eq('is_deleted', false)
            .order('created_at', { ascending: false })
            .limit(100)

          if (error) throw error
          const reversedData = (data as Array<StreamChat>).reverse()
          setChatData(roomId, reversedData)
        } else {
          // 시청자도 고정된 메시지는 불러오기
          const { data: pinnedData, error: pinnedError } = await streamChats()
            .select(
              `
              *,
              sender:members!stream_chats_sender_id_fkey(id, name, profile_image)
            `,
            )
            .eq('room_id', roomId)
            .eq('is_pinned', true)
            .eq('is_deleted', false)
            .eq('is_hidden', false)
            .order('created_at', { ascending: false })
            .limit(1)

          if (pinnedError) {
            setChatData(roomId, [])
          } else {
            const pinnedChats = (pinnedData as Array<StreamChat>) || []
            setChatData(roomId, pinnedChats)
          }
        }
        markChatInitialized(roomId)
        hasLoadedRef.current = true
      } catch (error) {
        // 채팅 로딩 실패 무시
      } finally {
        setIsLoading(false)
      }
    }

    loadChats()
  }, [roomId, isRoomLoaded])

  // roomId 변경 시 리셋
  useEffect(() => {
    hasLoadedRef.current = false
  }, [roomId])

  return { data: chats, isLoading }
}

// ========== 메인 훅 ==========

export function useVoiceRoom(roomId: string | undefined) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [realtimeChannel, setRealtimeChannel] =
    useState<RealtimeChannel | null>(null)
  const [myViewerRecord, setMyViewerRecord] = useState<StreamViewer | null>(
    null,
  )
  const [myHostRecord, setMyHostRecord] = useState<StreamHost | null>(null)
  const [mySpeakerRequest, setMySpeakerRequest] =
    useState<SpeakerRequest | null>(null)

  // 입장 시점 기록 (시청자용 채팅 필터링에 사용)
  const joinedAtRef = useRef<string | null>(null)

  // 채널 연결 후 최신 채팅 확인을 위한 ref
  const channelConnectedRef = useRef(false)

  // 채널 연결 시 누락된 채팅 확인 및 동기화
  const handleChannelConnected = useCallback(async () => {
    if (!roomId) return
    
    // 이미 연결 처리됨
    if (channelConnectedRef.current) return
    channelConnectedRef.current = true
    
    console.log('[useVoiceRoom] 채널 연결 완료 - 최신 채팅 동기화 확인')
    
    // 현재 채팅 데이터에서 가장 최근 메시지 ID 확인
    const currentChats = getChatData(roomId)
    const tempChats = currentChats.filter((c) => String(c.id).startsWith('temp-'))
    
    // 임시 메시지가 있으면 (낙관적 UI로 보낸 메시지), 최신 채팅 동기화
    if (tempChats.length > 0) {
      console.log('[useVoiceRoom] 임시 메시지 감지, 최신 채팅 동기화 시작')
      
      // 최근 5개 메시지 조회하여 동기화
      const { data: latestChats } = await streamChats()
        .select(`
          *,
          sender:members!stream_chats_sender_id_fkey(id, name, profile_image)
        `)
        .eq('room_id', roomId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: false })
        .limit(5)

      if (latestChats && latestChats.length > 0) {
        // 최신 채팅을 하나씩 추가 (중복 체크는 addChatMessage에서 처리)
        const reversedChats = [...latestChats].reverse()
        for (const chat of reversedChats) {
          addChatMessage(roomId, chat as StreamChat)
        }
      }
    }
  }, [roomId])

  // 통합 채널 사용 (채팅 이벤트용)
  const unifiedChannel = useUnifiedStreamChannel(roomId, {
    enabled: !!roomId,
    enableChats: true,
    onConnected: handleChannelConnected,
  })
  
  // on/off 함수를 ref로 저장 (의존성 안정화)
  const unifiedChannelRef = useRef(unifiedChannel)
  useEffect(() => {
    unifiedChannelRef.current = unifiedChannel
  }, [unifiedChannel])
  
  // roomId 변경 시 연결 상태 리셋
  useEffect(() => {
    channelConnectedRef.current = false
  }, [roomId])

  // 방 상세 정보
  const {
    data: room,
    isLoading: roomLoading,
    error: roomError,
  } = useVoiceRoomDetail(roomId)

  // 호스트 목록
  const { data: hosts = [] } = useRoomHosts(roomId)

  // 시청자 목록
  const { data: viewers = [] } = useRoomViewers(roomId)

  // 내가 호스트(방장)인지 확인
  const isHost = !!(
    room &&
    user &&
    (room.host_member_id === user.id ||
      (room.host_partner && room.host_partner.member?.id === user.id))
  )

  // 시스템 관리자인지 확인 (role = 'admin')
  const isAdmin = user?.role === 'admin'

  // 이전 채팅 불러오기 가능 여부 (호스트 또는 관리자)
  const canLoadHistory = isHost || isAdmin

  // room 데이터 로드 완료 여부 (권한 판단에 필요)
  const isRoomLoaded = !!room

  // 채팅 메시지 (호스트/admin만 이전 채팅 불러옴, room 로드 후 실행)
  const { data: historyChats = [] } = useRoomChats({
    roomId,
    canLoadHistory,
    isRoomLoaded,
  })

  // 최종 채팅 목록: 모두 queryClient 데이터 사용 (실시간으로 업데이트됨)
  // viewerChats는 더 이상 사용하지 않음 - queryClient.setQueryData로 통합
  const chats = historyChats

  // 발언권 요청 목록 (호스트만)
  const { data: speakerRequests = [] } = useSpeakerRequests(roomId, isHost)

  // 현재 발언자인지 확인 (호스트도 발언자로 간주)
  const isSpeakerFromHosts = hosts.some(
    (h) =>
      (h.member_id === user?.id || h.partner?.member?.id === user?.id) &&
      !h.left_at,
  )

  // 호스트는 항상 발언자 (hosts 쿼리 갱신 전에도 발언자로 인식)
  const isSpeaker = isHost || isSpeakerFromHosts

  // canLoadHistory를 ref로 저장 (핸들러 내에서 최신 값 접근)
  const canLoadHistoryRef = useRef(canLoadHistory)
  useEffect(() => {
    canLoadHistoryRef.current = canLoadHistory
  }, [canLoadHistory])

  // 통합 채널을 통한 채팅 이벤트 처리
  // roomId가 변경될 때만 핸들러를 다시 등록 (리렌더링 시 불필요한 재등록 방지)
  useEffect(() => {
    if (!roomId) {
      return
    }

    const channel = unifiedChannelRef.current

    // chat:new 이벤트 리스닝
    const handleNewChat = async (data: { message: StreamChat }) => {
      const newChat = data.message
      if (!newChat || !newChat.sender_id) {
        return
      }

      // sender 정보 조회
      const { data: senderData } = await supabase
        .from('members')
        .select('id, name, profile_image')
        .eq('id', newChat.sender_id)
        .single()

      const chatWithSender: StreamChat = {
        ...newChat,
        sender: senderData || undefined,
      }

      // 로컬 상태 기반 채팅 데이터에 추가
      addChatMessage(roomId, chatWithSender)
    }

    // chat:update 이벤트 리스닝
    const handleUpdateChat = async (data: { message: StreamChat }) => {
      const updatedChat = data.message
      if (!updatedChat) return

      // sender 정보 조회
      const { data: senderData } = await supabase
        .from('members')
        .select('id, name, profile_image')
        .eq('id', updatedChat.sender_id)
        .single()

      const chatWithSender: StreamChat = {
        ...updatedChat,
        sender: senderData || undefined,
      }

      // 로컬 상태 기반 채팅 데이터 업데이트
      updateChatMessage(roomId, chatWithSender)

      // 고정 상태가 변경되었을 때, 시청자는 고정된 메시지만 다시 불러오기
      const isPinnedChanged = updatedChat.is_pinned && !updatedChat.is_hidden
      if (isPinnedChanged && !canLoadHistoryRef.current) {
        const currentChats = getChatData(roomId)
        const hasPinned = currentChats.some(
          (chat) => chat.is_pinned && !chat.is_hidden,
        )

        // 고정된 메시지가 없으면 새로 불러오기
        if (!hasPinned) {
          const { data: pinnedData } = await streamChats()
            .select(
              `
              *,
              sender:members!stream_chats_sender_id_fkey(id, name, profile_image)
            `,
            )
            .eq('room_id', roomId)
            .eq('is_pinned', true)
            .eq('is_deleted', false)
            .eq('is_hidden', false)
            .order('created_at', { ascending: false })
            .limit(1)

          if (pinnedData && pinnedData.length > 0) {
            const pinnedChat = pinnedData[0] as StreamChat
            addChatMessage(roomId, pinnedChat)
          }
        }
      }
    }

    // 핸들러 등록
    channel.on('chat:new', handleNewChat)
    channel.on('chat:update', handleUpdateChat)

    return () => {
      // cleanup 시 최신 ref 사용
      unifiedChannelRef.current.off('chat:new', handleNewChat)
      unifiedChannelRef.current.off('chat:update', handleUpdateChat)
    }
  }, [roomId]) // roomId만 의존성으로 사용

  // ========== 방 생성 - Edge Function API 사용 (RLS 우회, 호스트 자동 등록) ==========
  const createRoom = useMutation({
    mutationFn: async (params: CreateRoomParams) => {
      if (!user) throw new Error('로그인이 필요합니다')

      // Edge Function API 호출 (서버에서 방 생성 + 호스트 등록 처리)
      const response = await edgeApi.stream.createRoom({
        title: params.title,
        description: params.description,
        stream_type: 'audio',
        access_type: params.access_type,
        password: params.password,
        max_participants: params.max_participants || 10,
        category_id: params.category_id,
      })

      if (!response.success) {
        throw new Error(response.error?.message || '방 생성에 실패했습니다')
      }

      // API 응답에서 room_id를 가져와서 방 상세 정보 조회
      const roomId = (response.data as { room_id: string }).room_id
      const { data: roomData, error: fetchError } = await streamRooms()
        .select(
          `
          id,
          host_partner_id,
          host_member_id,
          title,
          description,
          stream_type,
          access_type,
          max_participants,
          viewer_count,
          total_viewers,
          status,
          category_id,
          tags,
          thumbnail_url,
          started_at,
          ended_at,
          created_at,
          category:stream_categories(id, name, slug),
          host_partner:partners!stream_rooms_host_partner_id_fkey(
            id, partner_name,
            member:members(id, name, profile_image)
          ),
          host_member:members!stream_rooms_host_member_id_fkey(id, name, profile_image)
        `,
        )
        .eq('id', roomId)
        .single()

      if (fetchError) throw fetchError
      return roomData as StreamRoom
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stream-rooms'] })
      queryClient.invalidateQueries({ queryKey: ['stream-rooms-api'] })
    },
  })

  // ========== 방 입장 ==========
  const isJoiningRef = useRef(false) // 중복 호출 방지

  const joinRoom = useCallback(
    async (password?: string) => {
      if (!roomId || !user || !room) return

      // 이미 입장 중이면 스킵
      if (isJoiningRef.current) {
        return myViewerRecord
      }

      // 이미 활성 레코드가 있으면 스킵
      if (myViewerRecord && !myViewerRecord.left_at) {
        return myViewerRecord
      }

      isJoiningRef.current = true

      // 입장 시점 기록
      joinedAtRef.current = new Date().toISOString()

      try {
        // Edge API를 통해 입장 (비밀번호 검증 포함)
        // 비밀번호는 trim 처리하여 전달
        const trimmedPassword = password?.trim()
        const response = await edgeApi.stream.joinRoom(roomId, trimmedPassword)

        if (!response.success) {
          throw new Error(response.error?.message || '입장에 실패했습니다')
        }

        // Edge API에서 viewer를 생성/업데이트했으므로 조회하여 로컬 상태 업데이트
        // 타이밍 이슈를 고려하여 잠시 대기 후 조회
        await new Promise(resolve => setTimeout(resolve, 100))
        
        const { data: viewer, error } = await streamViewers()
          .select('*')
          .eq('room_id', roomId)
          .eq('member_id', user.id)
          .maybeSingle()

        if (error) {
          console.error('Viewer 조회 실패:', error)
          // Edge API는 성공했으므로 queryClient만 invalidate
          queryClient.invalidateQueries({ queryKey: ['voice-room', roomId] })
          return null
        }

        if (viewer) {
          setMyViewerRecord(viewer)
          queryClient.invalidateQueries({ queryKey: ['voice-room', roomId] })
          return viewer
        }

        // Edge API에서 viewer를 생성했다고 했지만 조회가 안 되는 경우
        // queryClient만 invalidate (다음 쿼리에서 자동으로 업데이트됨)
        queryClient.invalidateQueries({ queryKey: ['voice-room', roomId] })
        return null
      } finally {
        isJoiningRef.current = false
      }
    },
    [roomId, user, room, queryClient, myViewerRecord],
  )

  // ========== 방 퇴장 ==========
  const leaveRoom = useCallback(async () => {
    if (!roomId || !user) return

    // 청취자 기록 업데이트
    if (myViewerRecord) {
      await streamViewers()
        .update({ left_at: new Date().toISOString() })
        .eq('id', myViewerRecord.id)
    }

    // 호스트 기록 업데이트 (발언자였다면)
    // myHostRecord가 없을 수 있으므로 hosts 배열에서도 확인
    const hostToLeave =
      myHostRecord ||
      hosts.find(
        (h) =>
          (h.member_id === user.id || h.partner?.member?.id === user.id) &&
          !h.left_at,
      )

    if (hostToLeave) {
      await streamHosts()
        .update({ left_at: new Date().toISOString() })
        .eq('id', hostToLeave.id)
    }

    setMyViewerRecord(null)
    setMyHostRecord(null)
    setMySpeakerRequest(null)
    joinedAtRef.current = null
    // 채팅 캐시 초기화
    clearChatCache(roomId)
    // 참가자 목록 갱신
    queryClient.invalidateQueries({ queryKey: ['voice-room', roomId] })
    queryClient.invalidateQueries({ queryKey: ['room-hosts', roomId] })
    queryClient.invalidateQueries({ queryKey: ['room-viewers', roomId] })
  }, [roomId, user, myViewerRecord, myHostRecord, hosts, queryClient])

  // ========== 발언 나가기 (발언자 → 청취자) ==========
  const resignSpeaking = useCallback(async () => {
    if (!roomId || !user) return

    // 호스트 기록 업데이트 (발언자였다면)
    // myHostRecord가 없을 수 있으므로 hosts 배열에서도 확인
    const hostToResign =
      myHostRecord ||
      hosts.find(
        (h) =>
          (h.member_id === user.id || h.partner?.member?.id === user.id) &&
          !h.left_at,
      )

    if (hostToResign) {
      const { error } = await streamHosts()
        .update({ left_at: new Date().toISOString() })
        .eq('id', hostToResign.id)

      if (error) {
        throw error
      }

      setMyHostRecord(null)
      setMySpeakerRequest(null) // 발언권 요청 상태도 초기화
      queryClient.invalidateQueries({ queryKey: ['room-hosts', roomId] })
      queryClient.invalidateQueries({ queryKey: ['speaker-requests', roomId] })
    }
  }, [roomId, user, myHostRecord, hosts, queryClient])

  // ========== 발언권 요청 ==========
  const requestSpeaking = useCallback(
    async (message?: string) => {
      if (!roomId || !user) return

      // 이미 pending 요청이 있는지 확인 (0개일 수 있으므로 maybeSingle 사용)
      const { data: existing } = await streamSpeakerRequests()
        .select('*')
        .eq('room_id', roomId)
        .eq('requester_member_id', user.id)
        .eq('status', 'pending')
        .maybeSingle()

      if (existing) {
        setMySpeakerRequest(existing)
        return existing
      }

      const { data, error } = await streamSpeakerRequests()
        .insert({
          room_id: roomId,
          requester_member_id: user.id,
          message: message || null,
          status: 'pending' as RequestStatus,
        })
        .select()
        .single()

      if (error) throw error
      setMySpeakerRequest(data)
      return data
    },
    [roomId, user],
  )

  // ========== 발언권 승인 (호스트용) ==========
  const approveSpeaker = useCallback(
    async (requestId: string) => {
      if (!roomId || !isHost) {
        return
      }

      try {
        // 요청 정보 조회
        const { data: request, error: fetchError } =
          await streamSpeakerRequests().select('*').eq('id', requestId).single()

        if (fetchError) {
          throw fetchError
        }

        if (!request) throw new Error('요청을 찾을 수 없습니다')

        // 현재 발언자 수 확인
        const currentHostCount = hosts.filter((h) => !h.left_at).length
        if (room && currentHostCount >= room.max_participants) {
          throw new Error('최대 참여 인원을 초과했습니다')
        }

        // 요청 상태 업데이트
        const { error: updateError } = await streamSpeakerRequests()
          .update({
            status: 'approved' as RequestStatus,
            reviewed_by: user?.id,
            reviewed_at: new Date().toISOString(),
          })
          .eq('id', requestId)

        if (updateError) {
          console.error('❌ 발언권 요청 상태 업데이트 실패:', updateError)
          throw updateError
        }

        // 요청자가 파트너인지 확인
        const { data: requesterPartner } = await supabase
          .from('partners')
          .select('id')
          .eq('member_id', request.requester_member_id)
          .eq('partner_status', 'approved')
          .maybeSingle()

        // stream_hosts에 추가 (파트너면 partner_id, 아니면 member_id)
        const hostInsertData: {
          room_id: string
          role: HostRole
          partner_id?: string
          member_id?: string
        } = {
          room_id: roomId,
          role: 'guest' as HostRole,
        }

        if (requesterPartner) {
          hostInsertData.partner_id = (requesterPartner as any).id
        } else {
          hostInsertData.member_id = request.requester_member_id
        }

        const { data: _hostData, error: insertError } = await streamHosts()
          .insert(hostInsertData)
          .select()
          .single()

        if (insertError) {
          throw insertError
        }

        queryClient.invalidateQueries({
          queryKey: ['speaker-requests', roomId],
        })
        queryClient.invalidateQueries({ queryKey: ['room-hosts', roomId] })
      } catch (error) {
        throw error
      }
    },
    [roomId, isHost, user, hosts, room, queryClient],
  )

  // ========== 발언권 거절 (호스트용) ==========
  const rejectSpeaker = useCallback(
    async (requestId: string) => {
      if (!roomId || !isHost) return

      await streamSpeakerRequests()
        .update({
          status: 'rejected' as RequestStatus,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', requestId)

      queryClient.invalidateQueries({ queryKey: ['speaker-requests', roomId] })
    },
    [roomId, isHost, user, queryClient],
  )

  // ========== 채팅 메시지 전송 ==========
  const sendChat = useCallback(
    async (content: string) => {
      if (!roomId || !user || !content.trim()) return

      const { data, error } = await streamChats()
        .insert({
          room_id: roomId,
          sender_id: user.id,
          content: content.trim(),
          chat_type: 'text' as ChatType,
        })
        .select()
        .single()

      if (error) throw error
      return data
    },
    [roomId, user],
  )

  // ========== 방송 종료 (호스트용) ==========
  const endRoom = useCallback(async () => {
    if (!roomId || !isHost) return

    await streamRooms()
      .update({
        status: 'ended' as StreamStatus,
        ended_at: new Date().toISOString(),
      })
      .eq('id', roomId)

    queryClient.invalidateQueries({ queryKey: ['voice-room', roomId] })
    queryClient.invalidateQueries({ queryKey: ['stream-rooms'] })
  }, [roomId, isHost, queryClient])

  // ========== roomId 변경 시 채팅 초기화 ==========
  const prevRoomIdForChatsRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (roomId !== prevRoomIdForChatsRef.current) {
      // roomId가 변경되면 채팅 캐시 초기화
      if (prevRoomIdForChatsRef.current) {
        clearChatCache(prevRoomIdForChatsRef.current)
      }
      joinedAtRef.current = null
      prevRoomIdForChatsRef.current = roomId
    }
  }, [roomId])

  // ========== Realtime 구독 ==========
  // roomId별 채널 세션 ID 관리 (같은 roomId면 같은 세션 ID 사용)
  const channelSessionIdsRef = useRef<Map<string, string>>(new Map())
  const realtimeChannelRef = useRef<RealtimeChannel | null>(null)
  const isSettingUpChannelRef = useRef(false) // 채널 설정 중 플래그
  const retryCountRef = useRef(0) // 재시도 횟수 추적
  const previousRoomIdRef = useRef<string | undefined>(undefined) // 이전 roomId 추적

  useEffect(() => {
    if (!roomId) {
      return
    }

    const previousRoomId = previousRoomIdRef.current
    const roomIdChanged =
      previousRoomId !== undefined && previousRoomId !== roomId

    // roomId 업데이트
    previousRoomIdRef.current = roomId

    const maxRetries = 3
    let currentChannel: RealtimeChannel | null = null
    let isUnmounted = false
    let retryTimeout: NodeJS.Timeout | null = null
    const currentRoomId = roomId // cleanup에서 사용할 roomId 저장

    const setupChannel = async () => {
      if (isUnmounted) {
        return
      }

      // ✅ 이미 채널 설정 중이면 스킵
      if (isSettingUpChannelRef.current) {
        return
      }

      // ✅ channelSessionIdsRef가 Map인지 확인하고 초기화
      if (!(channelSessionIdsRef.current instanceof Map)) {
        channelSessionIdsRef.current = new Map()
      }

      // ✅ realtimeChannelRef에 이미 활성 채널이 있는지 확인
      if (realtimeChannelRef.current) {
        const existingChannel = realtimeChannelRef.current
        const topic = existingChannel.topic

        // 같은 roomId의 활성 채널이면 재사용
        if (
          topic.includes(`voice-room-${roomId}`) &&
          existingChannel.state !== 'closed' &&
          existingChannel.state !== 'errored'
        ) {
          return
        }
      }

      // ✅ 같은 roomId에 대해 이미 구독된 채널이 있는지 확인
      const existingChannels = supabase.getChannels()

      const existingChannel = existingChannels.find((ch) => {
        const topic = ch.topic
        // voice-room-{roomId}-{sessionId} 형식 확인
        // CLOSED 상태가 아닌 채널은 재사용 가능
        return (
          topic.startsWith(`realtime:voice-room-${roomId}-`) &&
          ch.state !== 'closed' &&
          ch.state !== 'errored'
        )
      })

      if (existingChannel) {
        // 이미 구독된 채널이 있으면 재사용
        realtimeChannelRef.current = existingChannel
        setRealtimeChannel(existingChannel)
        retryCountRef.current = 0 // 재시도 카운트 리셋
        return
      }

      // 채널 설정 시작
      isSettingUpChannelRef.current = true

      // 기존 채널이 있으면 완전히 제거 (unsubscribe만으로는 부족)
      if (currentChannel) {
        try {
          await supabase.removeChannel(currentChannel)
        } catch (e) {
          // 채널 제거 실패 무시 (이미 닫힌 경우 등)
        }
        currentChannel = null
      }

      // 이전 세션의 CLOSED/ERRORED 상태 채널만 정리
      // 같은 roomId의 활성 채널은 유지
      let cleanedCount = 0
      for (const ch of existingChannels) {
        const topic = ch.topic
        // voice-room-{roomId}로 시작하는 CLOSED/ERRORED 채널만 정리
        if (
          topic.includes(`voice-room-${roomId}`) &&
          topic.startsWith(`realtime:voice-room-${roomId}-`) &&
          (ch.state === 'closed' || ch.state === 'errored')
        ) {
          try {
            await supabase.removeChannel(ch)
            cleanedCount++
          } catch (e) {
            // 무시
          }
        }
      }

      // roomId별 세션 ID 가져오기 또는 생성
      let sessionId = channelSessionIdsRef.current.get(roomId)
      if (!sessionId) {
        sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
        channelSessionIdsRef.current.set(roomId, sessionId)
      }

      // 고유한 채널 이름 생성 (세션 ID 포함하여 mismatch 방지)
      const channelName = `voice-room-${roomId}-${sessionId}`
      const channel = supabase.channel(channelName)
      currentChannel = channel
      realtimeChannelRef.current = channel

      // 채팅은 통합 채널로 처리 (별도 useEffect에서 처리)

      // 호스트 변경 실시간 수신
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stream_hosts',
          filter: `room_id=eq.${roomId}`,
        },
        (_payload) => {
          queryClient.invalidateQueries({ queryKey: ['room-hosts', roomId] })
        },
      )

      // 발언권 요청 실시간 수신 (호스트용)
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stream_speaker_requests',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          queryClient.invalidateQueries({
            queryKey: ['speaker-requests', roomId],
          })

          // 내 요청 상태 업데이트
          if (
            payload.new &&
            (payload.new as any).requester_member_id === user?.id
          ) {
            setMySpeakerRequest(payload.new as SpeakerRequest)
          }
        },
      )

      // 시청자 변경 실시간 수신
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stream_viewers',
          filter: `room_id=eq.${roomId}`,
        },
        (_payload) => {
          queryClient.invalidateQueries({ queryKey: ['room-viewers', roomId] })
        },
      )

      // 방 상태 변경 실시간 수신
      channel.on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'stream_rooms',
          filter: `id=eq.${roomId}`,
        },
        (_payload) => {
          queryClient.invalidateQueries({ queryKey: ['voice-room', roomId] })
        },
      )

      // 채널 연결 상태 콜백과 함께 구독
      channel.subscribe((status, _err) => {
        if (status === 'SUBSCRIBED') {
          retryCountRef.current = 0 // 성공 시 재시도 카운트 리셋
          isSettingUpChannelRef.current = false // 채널 설정 완료
          // 구독 성공 시 참가자 목록/발언권 데이터 새로고침
          // 채팅은 실시간 리스너로 받으므로 무효화하지 않음 (시청자의 경우 빈 배열로 덮어쓰는 문제 방지)
          queryClient.invalidateQueries({ queryKey: ['room-hosts', roomId] })
          queryClient.invalidateQueries({ queryKey: ['room-viewers', roomId] })
          queryClient.invalidateQueries({
            queryKey: ['speaker-requests', roomId],
          })
        } else if (status === 'CHANNEL_ERROR') {
          isSettingUpChannelRef.current = false // 재시도 전 플래그 해제
          // 재연결 시도
          if (retryCountRef.current < maxRetries && !isUnmounted) {
            retryCountRef.current++
            const delay = Math.min(
              1000 * Math.pow(2, retryCountRef.current),
              10000,
            ) // 지수 백오프 (최대 10초)
            retryTimeout = setTimeout(() => {
              if (!isUnmounted) {
                setupChannel()
              }
            }, delay)
          } else {
            // 최대 재시도 횟수 초과
            realtimeChannelRef.current = null
            isSettingUpChannelRef.current = false
          }
        } else if (status === 'TIMED_OUT') {
          isSettingUpChannelRef.current = false // 재시도 전 플래그 해제
          // 타임아웃 시에도 재연결 시도
          if (retryCountRef.current < maxRetries && !isUnmounted) {
            retryCountRef.current++
            const delay = Math.min(
              1000 * Math.pow(2, retryCountRef.current),
              10000,
            )
            retryTimeout = setTimeout(() => {
              if (!isUnmounted) {
                setupChannel()
              }
            }, delay)
          } else {
            // 최대 재시도 횟수 초과
            realtimeChannelRef.current = null
            isSettingUpChannelRef.current = false
          }
        } else if (status === 'CLOSED') {
          // 채널이 닫혔을 때
          isSettingUpChannelRef.current = false
        }
      })

      setRealtimeChannel(channel)
    }

    // ✅ 이미 채널이 있으면 스킵
    if (realtimeChannelRef.current) {
      const existingChannel = realtimeChannelRef.current
      const topic = existingChannel.topic

      if (
        topic.includes(`voice-room-${roomId}`) &&
        existingChannel.state !== 'closed' &&
        existingChannel.state !== 'errored'
      ) {
        return
      }
    }

    // ✅ roomId가 변경되었을 때만 이전 채널 정리 (useEffect 시작 시)
    if (roomIdChanged && previousRoomId) {
      // 이전 roomId의 채널 정리
      const existingChannels = supabase.getChannels()
      for (const ch of existingChannels) {
        if (ch.topic.includes(`voice-room-${previousRoomId}`)) {
          supabase.removeChannel(ch)
        }
      }
      // 이전 roomId의 세션 ID 제거
      channelSessionIdsRef.current.delete(previousRoomId)
      // ref도 정리
      if (
        realtimeChannelRef.current &&
        realtimeChannelRef.current.topic.includes(
          `voice-room-${previousRoomId}`,
        )
      ) {
        realtimeChannelRef.current = null
        setRealtimeChannel(null)
      }
    }

    // ✅ 이미 채널이 있으면 스킵 (roomId 변경이 아닐 때만)
    if (realtimeChannelRef.current && !roomIdChanged) {
      const existingChannel = realtimeChannelRef.current
      const topic = existingChannel.topic

      if (
        topic.includes(`voice-room-${roomId}`) &&
        existingChannel.state !== 'closed' &&
        existingChannel.state !== 'errored'
      ) {
        return
      }
    }

    setupChannel()

    return () => {
      // cleanup에서 사용할 roomId 변경 여부 (클로저로 저장)
      const cleanupRoomIdChanged =
        previousRoomId !== undefined && previousRoomId !== currentRoomId

      console.log('🧹 [Realtime] cleanup 시작:', {
        roomId: currentRoomId,
        hasCurrentChannel: !!currentChannel,
        cleanupRoomIdChanged,
        previousRoomId,
        currentPreviousRoomId: previousRoomIdRef.current,
        hasRefChannel: !!realtimeChannelRef.current,
      })
      isUnmounted = true
      isSettingUpChannelRef.current = false

      if (retryTimeout) {
        console.log('⏹️ [Realtime] 재시도 timeout 취소')
        clearTimeout(retryTimeout)
      }

      // ✅ roomId가 변경되었을 때만 채널과 ref 정리
      // 같은 roomId로 재진입하는 경우는 채널과 ref를 유지
      if (cleanupRoomIdChanged) {
        console.log('🔄 [Realtime] roomId 변경됨 - 채널 및 ref 정리:', {
          previousRoomId,
          currentRoomId,
        })
        if (currentChannel) {
          console.log('🧹 [Realtime] currentChannel 제거 (roomId 변경):', {
            topic: currentChannel.topic,
          })
          try {
            void supabase.removeChannel(currentChannel).catch(() => {})
          } catch (e) {
            /* 무시 */
          }
        }
        // ref도 정리 (다음 useEffect에서 새로 설정됨)
        if (
          realtimeChannelRef.current &&
          realtimeChannelRef.current.topic.includes(
            `voice-room-${previousRoomId}`,
          )
        ) {
          console.log('🧹 [Realtime] ref 채널 정리 (roomId 변경)')
          realtimeChannelRef.current = null
          setRealtimeChannel(null)
        }
      } else {
        // 같은 roomId로 재진입하는 경우 - 채널과 ref 유지
        console.log('✅ [Realtime] 같은 roomId - 채널 및 ref 유지:', {
          roomId: currentRoomId,
          hasRefChannel: !!realtimeChannelRef.current,
          refChannelTopic: realtimeChannelRef.current?.topic,
          refChannelState: realtimeChannelRef.current?.state,
        })
        // currentChannel만 정리 (이 useEffect에서 생성한 채널)
        // realtimeChannelRef는 유지하여 다음 useEffect에서 재사용
        if (currentChannel && currentChannel !== realtimeChannelRef.current) {
          console.log('🧹 [Realtime] currentChannel만 제거 (ref는 유지):', {
            topic: currentChannel.topic,
          })
          try {
            void supabase.removeChannel(currentChannel).catch(() => {})
          } catch (e) {
            /* 무시 */
          }
        }
        // realtimeChannelRef와 state는 유지 (다음 useEffect에서 재사용)
        // cleanup에서 null로 설정하지 않음
      }

      console.log('✅ [Realtime] cleanup 완료')
    }
  }, [roomId, user?.id, queryClient])

  // hosts 배열의 안정적인 키 생성 (내용 기반)
  const hostsKey = useMemo(
    () =>
      hosts
        .map((h) => `${h.id}-${h.member_id}-${h.partner?.member?.id || ''}-${h.left_at || ''}`)
        .join(','),
    [hosts],
  )

  // 내 호스트 기록 계산 (useMemo로 안정화)
  const myHostRecordValue = useMemo(() => {
    if (!user || !hosts.length) return null

    return (
      hosts.find(
        (h) =>
          (h.member_id === user.id || h.partner?.member?.id === user.id) &&
          !h.left_at,
      ) || null
    )
  }, [hostsKey, user?.id])

  // 입장 시 내 호스트 기록 확인 (안정화된 값 사용)
  const prevMyHostRef = useRef<StreamHost | null>(null)
  useEffect(() => {
    // 실제로 변경되었을 때만 업데이트
    if (prevMyHostRef.current?.id !== myHostRecordValue?.id) {
      prevMyHostRef.current = myHostRecordValue
      setMyHostRecord(myHostRecordValue)
    }
  }, [myHostRecordValue])

  return {
    // 상태
    room,
    hosts,
    viewers,
    chats,
    speakerRequests,
    isLoading: roomLoading,
    error: roomError,

    // 내 상태
    isHost,
    isAdmin,
    isSpeaker,
    myViewerRecord,
    myHostRecord,
    mySpeakerRequest,

    // 액션
    createRoom,
    joinRoom,
    leaveRoom,
    resignSpeaking,
    requestSpeaking,
    approveSpeaker,
    rejectSpeaker,
    sendChat,
    endRoom,

    // 유틸
    realtimeChannel,
  }
}
