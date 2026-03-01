/**
 * useStreamModeration - 스트림 모더레이션 (강퇴/차단/뮤트) 훅
 */

import { useAuth } from '@/hooks/useAuth'
import { useUnifiedStreamChannel } from '@/hooks/useUnifiedStreamChannel'
import { supabase } from '@/lib/supabase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

// 테이블 헬퍼
const streamChatBans = () => supabase.from('stream_chat_bans') as any
const streamHosts = () => supabase.from('stream_hosts') as any
const streamViewers = () => supabase.from('stream_viewers') as any
const streamForceMutes = () => supabase.from('stream_force_mutes') as any
const streamChats = () => supabase.from('stream_chats') as any

// ========== 타입 정의 ==========

export type BanType = 'mute' | 'kick' | 'ban'
export type BanScope = 'room' | 'global'

export interface BanDuration {
  label: string
  minutes: number | null // null = 영구
}

export const BAN_DURATIONS: BanDuration[] = [
  { label: '10분', minutes: 10 },
  { label: '1시간', minutes: 60 },
  { label: '6시간', minutes: 360 },
  { label: '1일', minutes: 1440 },
  { label: '7일', minutes: 10080 },
  { label: '영구', minutes: null },
]

export interface StreamBan {
  id: string
  room_id: string | null
  target_member_id: string
  banned_by_member_id: string
  ban_type: BanType
  scope: BanScope
  host_partner_id: string | null
  host_member_id: string | null
  reason: string | null
  expires_at: string | null
  is_active: boolean
  created_at: string
  // 조인 데이터
  room?: { id: string; title: string }
  banned_by?: { id: string; name: string }
  target_member?: { id: string; name: string; profile_image: string }
}

export interface BanHistoryItem {
  ban_id: string
  room_id: string | null
  room_title: string
  ban_type: BanType
  ban_scope: BanScope
  reason: string | null
  expires_at: string | null
  is_active: boolean
  created_at: string
  banned_by_name: string
}

export interface MemberMessage {
  message_id: number
  room_id: string
  room_title: string
  content: string
  chat_type: 'text' | 'donation' | 'system'
  created_at: string
}

export interface KickParams {
  roomId: string
  targetMemberId: string
  reason?: string
}

export interface BanParams {
  roomId: string
  targetMemberId: string
  banType: BanType
  scope: BanScope
  durationMinutes: number | null // null = 영구
  reason?: string
  hostPartnerId?: string
  hostMemberId?: string
}

export interface ForceMuteParams {
  roomId: string
  targetMemberId: string
  reason?: string
}

export interface HideMessageParams {
  roomId: string
  messageId: number
}

// ========== 차단 체크 타입 ==========

export interface BanCheckResult {
  is_banned: boolean
  ban_type: BanType
  ban_scope: BanScope
  expires_at: string | null
  reason: string | null
  banned_at: string
  banned_by: string
}

// ========== 방 기준 차단 목록 조회 ==========

export function useRoomBans(roomId: string | undefined) {
  return useQuery({
    queryKey: ['room-bans', roomId],
    queryFn: async (): Promise<StreamBan[]> => {
      if (!roomId) return []

      const { data, error } = await streamChatBans()
        .select(`
          *,
          target_member:members!stream_chat_bans_target_member_id_fkey(id, name, profile_image),
          banned_by:members!stream_chat_bans_banned_by_member_id_fkey(id, name)
        `)
        .eq('room_id', roomId)
        .eq('is_active', true)
        .or('expires_at.is.null,expires_at.gt.now()')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('방 차단 목록 조회 실패:', error)
        return []
      }

      return (data as StreamBan[]) || []
    },
    enabled: !!roomId,
    staleTime: 1000 * 10, // 10초
    refetchOnWindowFocus: true,
  })
}

// ========== 차단 체크 ==========

export function useCheckBan(
  memberId: string | undefined,
  roomId: string | undefined,
  hostPartnerId?: string | null,
  hostMemberId?: string | null
) {
  return useQuery({
    queryKey: ['stream-ban-check', memberId, roomId, hostPartnerId, hostMemberId],
    queryFn: async (): Promise<BanCheckResult | null> => {
      if (!memberId) return null

      const { data, error } = await (supabase.rpc as any)('get_stream_ban_status', {
        p_member_id: memberId,
        p_room_id: roomId || null,
        p_host_partner_id: hostPartnerId || null,
        p_host_member_id: hostMemberId || null,
      })

      if (error) {
        console.error('차단 체크 실패:', error)
        return null
      }

      return (data as BanCheckResult[])?.[0] || null
    },
    enabled: !!memberId,
    staleTime: 1000 * 10, // 10초
    refetchOnWindowFocus: true,
  })
}

// ========== 제재 내역 조회 ==========

export function useBanHistory(
  targetMemberId: string | undefined,
  hostPartnerId?: string | null,
  hostMemberId?: string | null
) {
  return useQuery({
    queryKey: ['stream-ban-history', targetMemberId, hostPartnerId, hostMemberId],
    queryFn: async () => {
      if (!targetMemberId) return []

      const { data, error } = await supabase.rpc('get_member_ban_history', {
        p_target_member_id: targetMemberId,
        p_host_partner_id: hostPartnerId || null,
        p_host_member_id: hostMemberId || null,
      })

      if (error) {
        console.error('제재 내역 조회 실패:', error)
        return []
      }

      return (data as BanHistoryItem[]) || []
    },
    enabled: !!targetMemberId,
    staleTime: 1000 * 10, // 10초
    refetchOnWindowFocus: true,
  })
}

// ========== 메시지 내역 조회 ==========

export function useMemberMessages(
  targetMemberId: string | undefined,
  hostPartnerId?: string | null,
  hostMemberId?: string | null
) {
  return useQuery({
    queryKey: ['stream-member-messages', targetMemberId, hostPartnerId, hostMemberId],
    queryFn: async () => {
      if (!targetMemberId) return []

      const { data, error } = await supabase.rpc('get_member_messages_in_host_streams', {
        p_target_member_id: targetMemberId,
        p_host_partner_id: hostPartnerId || null,
        p_host_member_id: hostMemberId || null,
        p_limit: 50,
      })

      if (error) {
        console.error('메시지 내역 조회 실패:', error)
        return []
      }

      return (data as MemberMessage[]) || []
    },
    enabled: !!targetMemberId,
    staleTime: 1000 * 30, // 30초
    refetchOnWindowFocus: true,
  })
}

// ========== 모더레이션 액션 ==========

export function useStreamModeration(roomId: string | undefined) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  
  // 통합 채널 사용
  const unifiedChannel = useUnifiedStreamChannel(roomId, {
    enabled: !!roomId,
  })

  // 강퇴 (해당 방 영구 차단)
  const kick = useMutation({
    mutationFn: async ({ roomId, targetMemberId, reason }: KickParams) => {
      if (!user) throw new Error('로그인이 필요합니다')

      // 자기 자신은 강퇴 불가
      if (targetMemberId === user.id) {
        throw new Error('자기 자신을 강퇴할 수 없습니다')
      }

      // 방 정보 조회하여 호스트 확인
      const { data: room, error: roomError } = await supabase
        .from('stream_rooms')
        .select('host_member_id, host_partner_id, host_partner:partners!stream_rooms_host_partner_id_fkey(member_id)')
        .eq('id', roomId)
        .single()

      if (roomError || !room) {
        throw new Error('방을 찾을 수 없습니다')
      }

      // 호스트인지 확인
      const isTargetHost = targetMemberId === room.host_member_id || 
                          targetMemberId === room.host_partner?.member_id

      if (isTargetHost) {
        throw new Error('호스트는 강퇴할 수 없습니다')
      }

      // 1. 차단 레코드 생성 (kick은 항상 room scope + 영구)
      const { error: banError } = await streamChatBans().insert({
        room_id: roomId,
        target_member_id: targetMemberId,
        banned_by_member_id: user.id,
        ban_type: 'kick',
        scope: 'room',
        reason: reason || '강퇴',
        expires_at: null, // 영구
        is_active: true,
      })

      if (banError) throw banError

      // 2. stream_hosts에서 발언자 제거
      await streamHosts()
        .update({ left_at: new Date().toISOString() })
        .eq('room_id', roomId)
        .eq('member_id', targetMemberId)
        .is('left_at', null)

      // 3. stream_viewers에서 시청자 제거
      await streamViewers()
        .update({ left_at: new Date().toISOString() })
        .eq('room_id', roomId)
        .eq('member_id', targetMemberId)
        .is('left_at', null)

      return { success: true, targetMemberId }
    },
    onSuccess: (_, variables) => {
      const targetRoomId = variables.roomId
      // 참가자 목록 갱신
      queryClient.invalidateQueries({ queryKey: ['room-hosts', targetRoomId] })
      queryClient.invalidateQueries({ queryKey: ['room-viewers', targetRoomId] })
      // 차단 관련 쿼리 갱신
      queryClient.invalidateQueries({ queryKey: ['room-bans', targetRoomId] })
      queryClient.invalidateQueries({ queryKey: ['stream-ban-history', variables.targetMemberId] })
      queryClient.invalidateQueries({ queryKey: ['stream-ban-check', variables.targetMemberId] })
    },
  })

  // 차단 (시간/범위 지정 가능)
  const ban = useMutation({
    mutationFn: async ({
      roomId,
      targetMemberId,
      banType,
      scope,
      durationMinutes,
      reason,
      hostPartnerId,
      hostMemberId,
    }: BanParams) => {
      if (!user) throw new Error('로그인이 필요합니다')

      // 자기 자신은 차단 불가
      if (targetMemberId === user.id) {
        throw new Error('자기 자신을 차단할 수 없습니다')
      }

      // 방 정보 조회하여 호스트 확인 (room scope인 경우)
      if (scope === 'room' && roomId) {
        const { data: room, error: roomError } = await supabase
          .from('stream_rooms')
          .select('host_member_id, host_partner_id, host_partner:partners!stream_rooms_host_partner_id_fkey(member_id)')
          .eq('id', roomId)
          .single()

        if (roomError || !room) {
          throw new Error('방을 찾을 수 없습니다')
        }

        // 호스트인지 확인
        const isTargetHost = targetMemberId === room.host_member_id || 
                            targetMemberId === room.host_partner?.member_id

        if (isTargetHost) {
          throw new Error('호스트는 차단할 수 없습니다')
        }
      }

      // global scope인 경우 hostMemberId로 확인
      if (scope === 'global' && hostMemberId && targetMemberId === hostMemberId) {
        throw new Error('호스트는 차단할 수 없습니다')
      }

      const expiresAt = durationMinutes
        ? new Date(Date.now() + durationMinutes * 60 * 1000).toISOString()
        : null

      // 차단 레코드 생성
      const { error: banError } = await streamChatBans().insert({
        room_id: scope === 'room' ? roomId : null,
        target_member_id: targetMemberId,
        banned_by_member_id: user.id,
        ban_type: banType,
        scope: scope,
        host_partner_id: scope === 'global' ? hostPartnerId : null,
        host_member_id: scope === 'global' ? hostMemberId : null,
        reason: reason || '차단',
        expires_at: expiresAt,
        is_active: true,
      })

      if (banError) throw banError

      // 현재 방에서 제거
      if (banType !== 'mute') {
        await streamHosts()
          .update({ left_at: new Date().toISOString() })
          .eq('room_id', roomId)
          .eq('member_id', targetMemberId)
          .is('left_at', null)

        await streamViewers()
          .update({ left_at: new Date().toISOString() })
          .eq('room_id', roomId)
          .eq('member_id', targetMemberId)
          .is('left_at', null)
      }

      return { success: true, targetMemberId }
    },
    onSuccess: (_, variables) => {
      const targetRoomId = variables.roomId
      // 참가자 목록 갱신
      queryClient.invalidateQueries({ queryKey: ['room-hosts', targetRoomId] })
      queryClient.invalidateQueries({ queryKey: ['room-viewers', targetRoomId] })
      // 차단 관련 쿼리 갱신
      queryClient.invalidateQueries({ queryKey: ['room-bans', targetRoomId] })
      queryClient.invalidateQueries({ queryKey: ['stream-ban-history', variables.targetMemberId] })
      queryClient.invalidateQueries({ queryKey: ['stream-ban-check', variables.targetMemberId] })
    },
  })

  // 강제 뮤트 (발언자 마이크 끄기)
  const forceMute = useMutation({
    mutationFn: async ({ roomId, targetMemberId, reason }: ForceMuteParams) => {
      if (!user) throw new Error('로그인이 필요합니다')

      const { error } = await streamForceMutes().insert({
        room_id: roomId,
        target_member_id: targetMemberId,
        muted_by_member_id: user.id,
        reason: reason || '강제 뮤트',
      })

      if (error) throw error

      // 통합 채널로 브로드캐스트
      if (unifiedChannel.isConnected) {
        await unifiedChannel.broadcast('moderation:force-mute', {
          targetMemberId,
          mutedBy: user.id,
          reason: reason || '강제 뮤트',
        })
      }

      return { success: true, targetMemberId, roomId }
    },
    onSuccess: (result) => {
      // 강제 뮤트 상태를 즉시 true로 설정
      queryClient.setQueryData(
        ['force-mute-status', result.roomId, result.targetMemberId],
        { isMuted: true, mutedAt: new Date().toISOString() }
      )
    },
  })

  // 강제 뮤트 해제 (발언자 마이크 다시 허용)
  const forceUnmute = useMutation({
    mutationFn: async ({ roomId, targetMemberId }: { roomId: string; targetMemberId: string }) => {
      if (!user) throw new Error('로그인이 필요합니다')

      // 해당 방의 활성 뮤트 레코드를 해제 처리
      const { data, error } = await streamForceMutes()
        .update({ unmuted_at: new Date().toISOString(), unmuted_by_member_id: user.id })
        .eq('room_id', roomId)
        .eq('target_member_id', targetMemberId)
        .is('unmuted_at', null)
        .select()

      if (error) throw error

      console.log('🔊 [forceUnmute] 업데이트 결과:', { 
        roomId, 
        targetMemberId, 
        updatedRows: data?.length || 0,
        data 
      })

      // 업데이트된 행이 없으면 이미 해제된 상태
      if (!data || data.length === 0) {
        console.log('⚠️ [forceUnmute] 업데이트할 레코드가 없음 (이미 해제됨)')
      }

      // 통합 채널로 브로드캐스트
      if (unifiedChannel.isConnected) {
        await unifiedChannel.broadcast('moderation:force-unmute', {
          targetMemberId,
          unmutedBy: user.id,
        })
      }

      return { success: true, targetMemberId, roomId }
    },
    onSuccess: (result) => {
      // 강제 뮤트 상태를 즉시 false로 설정
      queryClient.setQueryData(
        ['force-mute-status', result.roomId, result.targetMemberId],
        { isMuted: false, mutedAt: null }
      )
    },
  })

  // 차단 해제
  const unban = useMutation({
    mutationFn: async (banId: string) => {
      if (!user) throw new Error('로그인이 필요합니다')

      // 먼저 해당 ban의 target_member_id를 가져옴
      const { data: banData } = await streamChatBans()
        .select('target_member_id')
        .eq('id', banId)
        .single()

      const { error } = await streamChatBans()
        .update({
          is_active: false,
          unban_at: new Date().toISOString(),
          unban_by: user.id,
        })
        .eq('id', banId)

      if (error) throw error

      return { success: true, targetMemberId: banData?.target_member_id }
    },
    onSuccess: (result) => {
      // 차단 관련 쿼리 전체 갱신
      queryClient.invalidateQueries({ queryKey: ['stream-ban-history'] })
      queryClient.invalidateQueries({ queryKey: ['room-bans', roomId] })
      if (result.targetMemberId) {
        queryClient.invalidateQueries({ queryKey: ['stream-ban-check', result.targetMemberId] })
      }
    },
  })

  // 채팅 숨기기
  const hideMessage = useMutation({
    mutationFn: async ({ roomId, messageId }: HideMessageParams) => {
      if (!user) throw new Error('로그인이 필요합니다')

      const { error } = await streamChats()
        .update({
          is_hidden: true,
          hidden_by: user.id,
          hidden_at: new Date().toISOString(),
        })
        .eq('id', messageId)
        .eq('room_id', roomId)

      if (error) throw error

      return { success: true, messageId, roomId }
    },
    // Realtime으로 자동 업데이트되므로 무효화 불필요
  })

  // 채팅 숨기기 해제
  const unhideMessage = useMutation({
    mutationFn: async ({ roomId, messageId }: HideMessageParams) => {
      if (!user) throw new Error('로그인이 필요합니다')

      const { error } = await streamChats()
        .update({
          is_hidden: false,
          hidden_by: null,
          hidden_at: null,
        })
        .eq('id', messageId)
        .eq('room_id', roomId)

      if (error) throw error

      return { success: true, messageId, roomId }
    },
    // Realtime으로 자동 업데이트되므로 무효화 불필요
  })

  return {
    kick,
    ban,
    forceMute,
    forceUnmute,
    unban,
    hideMessage,
    unhideMessage,
  }
}

// ========== 실시간 차단 감지 훅 ==========

export function useRealtimeBanDetection(
  roomId: string | undefined,
  memberId: string | undefined,
  onBanned: (ban: StreamBan) => void
) {
  const channelRef = useCallback(() => {
    if (!roomId || !memberId) return null

    const channel = supabase.channel(`ban-detection-${roomId}-${memberId}`)

    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'stream_chat_bans',
        filter: `target_member_id=eq.${memberId}`,
      },
      (payload) => {
        const ban = payload.new as StreamBan

        // 현재 방에 해당하는 차단인지 확인
        if (
          ban.is_active &&
          (ban.room_id === roomId || ban.scope === 'global')
        ) {
          onBanned(ban)
        }
      }
    )

    channel.subscribe()

    return channel
  }, [roomId, memberId, onBanned])

  return channelRef
}

// ========== 강제 뮤트 상태 조회 ==========

export function useForceMuteStatus(
  roomId: string | undefined,
  targetMemberId: string | undefined
) {
  return useQuery({
    queryKey: ['force-mute-status', roomId, targetMemberId],
    queryFn: async (): Promise<{ isMuted: boolean; mutedAt: string | null }> => {
      if (!roomId || !targetMemberId) {
        return { isMuted: false, mutedAt: null }
      }

      // 가장 최근 강제 뮤트 레코드 조회
      const { data, error } = await streamForceMutes()
        .select('id, created_at')
        .eq('room_id', roomId)
        .eq('target_member_id', targetMemberId)
        .is('unmuted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        console.error('강제 뮤트 상태 조회 실패:', error)
        return { isMuted: false, mutedAt: null }
      }

      return {
        isMuted: !!data,
        mutedAt: data?.created_at || null,
      }
    },
    enabled: !!roomId && !!targetMemberId,
    staleTime: 1000 * 30, // 30초 (setQueryData로 업데이트하므로 자주 리페치할 필요 없음)
    refetchOnWindowFocus: false, // 포커스 시 리페치 비활성화 (setQueryData와 충돌 방지)
  })
}

// ========== 강제 뮤트 실시간 감지 훅 ==========

export function useRealtimeForceMute(
  roomId: string | undefined,
  memberId: string | undefined,
  onForceMuted: () => void
) {
  const channelRef = useCallback(() => {
    if (!roomId || !memberId) return null

    const channel = supabase.channel(`force-mute-${roomId}-${memberId}`)

    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'stream_force_mutes',
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => {
        const mute = payload.new as { target_member_id: string }
        if (mute.target_member_id === memberId) {
          onForceMuted()
        }
      }
    )

    channel.subscribe()

    return channel
  }, [roomId, memberId, onForceMuted])

  return channelRef
}
