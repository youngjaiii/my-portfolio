/**
 * useStreamApi - 보안이 강화된 스트림 API 훅
 * 
 * Edge Function을 통해 서버 사이드에서 권한 검증 및 Rate Limiting 적용
 * 기존 useVoiceRoom.ts의 직접 Supabase 호출을 대체
 */

import { useAuth } from '@/hooks/useAuth'
import { edgeApi } from '@/lib/edgeApi'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

// ========== 타입 정의 ==========

export type StreamType = 'video' | 'audio'
export type AccessType = 'public' | 'private' | 'subscriber'
export type StreamStatus = 'scheduled' | 'live' | 'ended'
export type HostRole = 'owner' | 'co_host' | 'guest'
export type ChatType = 'text' | 'donation' | 'system'

export interface StreamRoom {
  id: string
  title: string
  description: string | null
  stream_type: StreamType
  access_type: AccessType
  status: StreamStatus
  viewer_count: number
  total_viewers: number
  max_participants: number
  tags: string[]
  thumbnail_url: string | null
  started_at: string | null
  ended_at: string | null
  created_at: string
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
  role: HostRole
  joined_at: string
  member?: { id: string; name: string; profile_image: string }
  partner?: { 
    id: string
    partner_name: string
    member: { id: string; name: string; profile_image: string } 
  }
}

export interface StreamChat {
  id: number
  content: string
  chat_type: ChatType
  is_pinned: boolean
  is_hidden: boolean
  hidden_by?: string | null
  hidden_at?: string | null
  created_at: string
  sender?: { id: string; name: string; profile_image: string | null }
}

export interface SpeakerRequest {
  id: string
  status: 'pending' | 'approved' | 'rejected'
  message: string | null
  created_at: string
  requester?: { id: string; name: string; profile_image: string }
}

export interface CreateRoomParams {
  title: string
  description?: string
  stream_type?: StreamType
  access_type?: AccessType
  password?: string
  max_participants?: number
  category_id?: string
}

// ========== 방 목록 조회 ==========

export function useStreamRoomsApi(options: {
  status?: 'live' | 'scheduled' | 'ended' | 'all'
  streamType?: 'video' | 'audio' | 'all'
  limit?: number
  enabled?: boolean
} = {}) {
  const { status = 'live', streamType = 'all', limit = 20, enabled = true } = options

  return useQuery({
    queryKey: ['stream-rooms-api', status, streamType, limit],
    queryFn: async (): Promise<StreamRoom[]> => {
      const response = await edgeApi.stream.getRooms({
        status,
        stream_type: streamType,
        limit,
      })

      if (!response.success) {
        throw new Error(response.error?.message || '목록 조회에 실패했습니다')
      }

      return response.data || []
    },
    enabled,
    staleTime: 1000 * 30,
    gcTime: 1000 * 60 * 5,
  })
}

// ========== 방 상세 조회 ==========

export function useStreamRoomDetail(roomId: string | undefined) {
  return useQuery({
    queryKey: ['stream-room-detail', roomId],
    queryFn: async (): Promise<StreamRoom | null> => {
      if (!roomId) return null

      const response = await edgeApi.stream.getRoom(roomId)

      if (!response.success) {
        throw new Error(response.error?.message || '방 조회에 실패했습니다')
      }

      return response.data
    },
    enabled: !!roomId,
    staleTime: 1000 * 10,
  })
}

// ========== 방 생성 ==========

export function useCreateRoom() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: CreateRoomParams) => {
      const response = await edgeApi.stream.createRoom(params)

      if (!response.success) {
        throw new Error(response.error?.message || '방 생성에 실패했습니다')
      }

      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['stream-rooms-api'] })
      navigate({ to: '/stream/chat/$roomId', params: { roomId: data.room_id } })
    },
  })
}

// ========== 방 입장 ==========

export function useJoinRoom() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ roomId, password }: { roomId: string; password?: string }) => {
      const response = await edgeApi.stream.joinRoom(roomId, password)

      if (!response.success) {
        throw new Error(response.error?.message || '입장에 실패했습니다')
      }

      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['stream-room-detail', variables.roomId] })
    },
  })
}

// ========== 방 퇴장 ==========

export function useLeaveRoom() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (roomId: string) => {
      const response = await edgeApi.stream.leaveRoom(roomId)

      if (!response.success) {
        throw new Error(response.error?.message || '퇴장에 실패했습니다')
      }

      return response.data
    },
    onSuccess: (_, roomId) => {
      queryClient.invalidateQueries({ queryKey: ['stream-room-detail', roomId] })
    },
  })
}

// ========== 방 종료 ==========

export function useEndRoom() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (roomId: string) => {
      const response = await edgeApi.stream.endRoom(roomId)

      if (!response.success) {
        throw new Error(response.error?.message || '방 종료에 실패했습니다')
      }

      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stream-rooms-api'] })
    },
  })
}

// ========== 발언자 목록 ==========

export function useStreamHosts(roomId: string | undefined) {
  return useQuery({
    queryKey: ['stream-hosts', roomId],
    queryFn: async (): Promise<StreamHost[]> => {
      if (!roomId) return []

      const response = await edgeApi.streamSpeaker.getHosts(roomId)

      if (!response.success) {
        throw new Error(response.error?.message || '발언자 조회에 실패했습니다')
      }

      return response.data || []
    },
    enabled: !!roomId,
    refetchInterval: 5000,
  })
}

// ========== 발언권 요청 목록 (호스트용) ==========

export function useSpeakerRequestsApi(roomId: string | undefined, enabled: boolean = true) {
  return useQuery({
    queryKey: ['speaker-requests-api', roomId],
    queryFn: async (): Promise<SpeakerRequest[]> => {
      if (!roomId) return []

      const response = await edgeApi.streamSpeaker.getRequests(roomId)

      if (!response.success) {
        // 권한 없음은 빈 배열 반환
        if (response.error?.code === 'NOT_HOST') {
          return []
        }
        throw new Error(response.error?.message || '요청 목록 조회에 실패했습니다')
      }

      return response.data || []
    },
    enabled: !!roomId && enabled,
    refetchInterval: 3000,
  })
}

// ========== 발언권 요청 ==========

export function useRequestSpeaker() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ roomId, message }: { roomId: string; message?: string }) => {
      const response = await edgeApi.streamSpeaker.request(roomId, message)

      if (!response.success) {
        throw new Error(response.error?.message || '발언권 요청에 실패했습니다')
      }

      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['speaker-requests-api', variables.roomId] })
    },
  })
}

// ========== 발언권 승인 ==========

export function useApproveSpeaker() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ requestId, roomId }: { requestId: string; roomId: string }) => {
      const response = await edgeApi.streamSpeaker.approve(requestId)

      if (!response.success) {
        throw new Error(response.error?.message || '승인에 실패했습니다')
      }

      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['speaker-requests-api', variables.roomId] })
      queryClient.invalidateQueries({ queryKey: ['stream-hosts', variables.roomId] })
    },
  })
}

// ========== 발언권 거절 ==========

export function useRejectSpeaker() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ requestId, roomId }: { requestId: string; roomId: string }) => {
      const response = await edgeApi.streamSpeaker.reject(requestId)

      if (!response.success) {
        throw new Error(response.error?.message || '거절에 실패했습니다')
      }

      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['speaker-requests-api', variables.roomId] })
    },
  })
}

// ========== 발언권 박탈 ==========

export function useRevokeSpeaker() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ hostId, roomId }: { hostId: string; roomId: string }) => {
      const response = await edgeApi.streamSpeaker.revoke(hostId)

      if (!response.success) {
        throw new Error(response.error?.message || '발언권 박탈에 실패했습니다')
      }

      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['stream-hosts', variables.roomId] })
    },
  })
}

// ========== 채팅 목록 ==========

export function useStreamChatsApi(roomId: string | undefined) {
  return useQuery({
    queryKey: ['stream-chats-api', roomId],
    queryFn: async (): Promise<StreamChat[]> => {
      if (!roomId) return []

      const response = await edgeApi.streamChat.getMessages(roomId, 100)

      if (!response.success) {
        throw new Error(response.error?.message || '채팅 조회에 실패했습니다')
      }

      return response.data || []
    },
    enabled: !!roomId,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  })
}

// ========== 채팅 전송 ==========

export function useSendChat() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ 
      roomId, 
      content, 
      chatType 
    }: { 
      roomId: string
      content: string
      chatType?: ChatType 
    }) => {
      const response = await edgeApi.streamChat.send(roomId, content, chatType)

      if (!response.success) {
        throw new Error(response.error?.message || '메시지 전송에 실패했습니다')
      }

      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['stream-chats-api', variables.roomId] })
    },
  })
}

// ========== 사용자 밴 ==========

export function useBanUser() {
  return useMutation({
    mutationFn: async (data: {
      room_id: string
      target_member_id: string
      ban_type: 'mute' | 'kick' | 'ban'
      reason?: string
      duration_minutes?: number
    }) => {
      const response = await edgeApi.streamChat.ban(data)

      if (!response.success) {
        throw new Error(response.error?.message || '밴에 실패했습니다')
      }

      return response.data
    },
  })
}

// ========== 메시지 삭제 ==========

export function useDeleteMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ messageId, roomId }: { messageId: string; roomId: string }) => {
      const response = await edgeApi.streamChat.deleteMessage(messageId)

      if (!response.success) {
        throw new Error(response.error?.message || '삭제에 실패했습니다')
      }

      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['stream-chats-api', variables.roomId] })
    },
  })
}

// ========== 메시지 고정 ==========

export function useTogglePinMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ messageId, roomId }: { messageId: string; roomId: string }) => {
      const response = await edgeApi.streamChat.togglePin(messageId)

      if (!response.success) {
        throw new Error(response.error?.message || '고정에 실패했습니다')
      }

      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['stream-chats-api', variables.roomId] })
    },
  })
}

// ========== 통합 스트림 룸 훅 ==========

export function useStreamRoomApi(roomId: string | undefined) {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  // 방 상세 정보
  const { data: room, isLoading: roomLoading, error: roomError } = useStreamRoomDetail(roomId)

  // 발언자 목록
  const { data: hosts = [] } = useStreamHosts(roomId)

  // 채팅 메시지
  const { data: chats = [] } = useStreamChatsApi(roomId)

  // 호스트 여부 확인
  const isHost = !!(room && user && (
    room.host_member?.id === user.id ||
    room.host_partner?.member?.id === user.id
  ))

  // 발언권 요청 목록 (호스트만)
  const { data: speakerRequests = [] } = useSpeakerRequestsApi(roomId, isHost)

  // 발언자 여부 확인
  const isSpeaker = isHost || hosts.some(h =>
    h.member?.id === user?.id || h.partner?.member?.id === user?.id
  )

  // 뮤테이션
  const joinRoom = useJoinRoom()
  const leaveRoom = useLeaveRoom()
  const endRoom = useEndRoom()
  const requestSpeaker = useRequestSpeaker()
  const approveSpeaker = useApproveSpeaker()
  const rejectSpeaker = useRejectSpeaker()
  const revokeSpeaker = useRevokeSpeaker()
  const sendChat = useSendChat()
  const banUser = useBanUser()
  const deleteMessage = useDeleteMessage()
  const togglePin = useTogglePinMessage()

  return {
    // 상태
    room,
    hosts,
    chats,
    speakerRequests,
    isLoading: roomLoading,
    error: roomError,

    // 권한
    isHost,
    isSpeaker,

    // 방 관리
    joinRoom: (password?: string) => roomId && joinRoom.mutateAsync({ roomId, password }),
    leaveRoom: () => roomId && leaveRoom.mutateAsync(roomId),
    endRoom: () => roomId && endRoom.mutateAsync(roomId),

    // 발언권 관리
    requestSpeaker: (message?: string) => roomId && requestSpeaker.mutateAsync({ roomId, message }),
    approveSpeaker: (requestId: string) => roomId && approveSpeaker.mutateAsync({ requestId, roomId }),
    rejectSpeaker: (requestId: string) => roomId && rejectSpeaker.mutateAsync({ requestId, roomId }),
    revokeSpeaker: (hostId: string) => roomId && revokeSpeaker.mutateAsync({ hostId, roomId }),

    // 채팅
    sendMessage: (content: string, chatType?: ChatType) => 
      roomId && sendChat.mutateAsync({ roomId, content, chatType }),
    deleteMessage: (messageId: string) => 
      roomId && deleteMessage.mutateAsync({ messageId, roomId }),
    togglePinMessage: (messageId: string) => 
      roomId && togglePin.mutateAsync({ messageId, roomId }),

    // 유저 관리
    banUser: (targetMemberId: string, banType: 'mute' | 'kick' | 'ban', reason?: string, durationMinutes?: number) =>
      roomId && banUser.mutateAsync({
        room_id: roomId,
        target_member_id: targetMemberId,
        ban_type: banType,
        reason,
        duration_minutes: durationMinutes,
      }),

    // 로딩 상태
    isJoining: joinRoom.isPending,
    isLeaving: leaveRoom.isPending,
    isEnding: endRoom.isPending,
    isSending: sendChat.isPending,

    // 쿼리 무효화
    refetchRoom: () => queryClient.invalidateQueries({ queryKey: ['stream-room-detail', roomId] }),
    refetchHosts: () => queryClient.invalidateQueries({ queryKey: ['stream-hosts', roomId] }),
    refetchChats: () => queryClient.invalidateQueries({ queryKey: ['stream-chats-api', roomId] }),
  }
}

// 라이브 스트림만 조회
export function useLiveStreamsApi(limit?: number) {
  return useStreamRoomsApi({ status: 'live', limit })
}

// 라디오(오디오) 스트림만 조회
export function useRadioStreamsApi(limit?: number) {
  return useStreamRoomsApi({ status: 'live', streamType: 'audio', limit })
}

// 다시보기(종료된) 스트림만 조회
export function useReplayStreamsApi(limit?: number) {
  return useStreamRoomsApi({ status: 'ended', limit })
}
