/**
 * api-stream-chat - 스트림 채팅 Edge Function
 * 
 * 보안 기능:
 * - Rate Limiting (분당 30개 메시지 제한)
 * - 밴 유저 차단
 * - 채팅 모드 검증
 * 
 * 엔드포인트:
 * - POST /api-stream-chat/send - 채팅 전송
 * - GET /api-stream-chat/messages/:roomId - 채팅 목록 조회
 * - POST /api-stream-chat/ban - 사용자 밴 (호스트만)
 * - POST /api-stream-chat/unban - 사용자 언밴 (호스트만)
 * - DELETE /api-stream-chat/message/:messageId - 메시지 삭제 (호스트만)
 * - POST /api-stream-chat/pin/:messageId - 메시지 고정 (호스트만)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import type { BanStreamUserBody, SendStreamChatBody } from '../_shared/types.ts';
import { corsHeaders, createSupabaseClient, errorResponse, getAuthUser, getQueryParams, parseRequestBody, successResponse } from '../_shared/utils.ts';

// Rate Limiting 설정
const RATE_LIMIT_MESSAGES = 30; // 분당 최대 메시지 수
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1분

serve(async (req) => {
  // CORS 처리
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const supabase = createSupabaseClient();

    // 호스트 권한 확인 헬퍼
    const checkHostPermission = async (roomId: string, userId: string) => {
      const { data: room } = await supabase
        .from('stream_rooms')
        .select('host_member_id, host_partner:partners!stream_rooms_host_partner_id_fkey(id, member_id)')
        .eq('id', roomId)
        .single();

      if (!room) return false;

      return room.host_member_id === userId || 
             room.host_partner?.member_id === userId;
    };

    // 밴 상태 확인 헬퍼
    const checkBanStatus = async (roomId: string, memberId: string) => {
      const { data: ban } = await supabase
        .from('stream_chat_bans')
        .select('id, ban_type, expires_at')
        .eq('room_id', roomId)
        .eq('target_member_id', memberId)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return ban;
    };

    // Rate Limiting 체크 헬퍼
    const checkRateLimit = async (memberId: string, roomId: string) => {
      const oneMinuteAgo = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();

      const { count } = await supabase
        .from('stream_chats')
        .select('*', { count: 'exact', head: true })
        .eq('sender_id', memberId)
        .eq('room_id', roomId)
        .gte('created_at', oneMinuteAgo);

      return (count || 0) < RATE_LIMIT_MESSAGES;
    };

    // ========== POST /api-stream-chat/send - 채팅 전송 ==========
    if (pathname === '/api-stream-chat/send' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req) as SendStreamChatBody;

      if (!body?.room_id) {
        return errorResponse('INVALID_ROOM', '방 ID가 필요합니다');
      }

      if (!body?.content?.trim()) {
        return errorResponse('INVALID_CONTENT', '메시지 내용이 필요합니다');
      }

      const content = body.content.trim();
      if (content.length > 500) {
        return errorResponse('CONTENT_TOO_LONG', '메시지는 500자 이하여야 합니다');
      }

      const roomId = body.room_id;
      const chatType = body.chat_type || 'text';

      // 방 정보 조회
      const { data: room, error: roomError } = await supabase
        .from('stream_rooms')
        .select('id, status, chat_mode, access_type, host_member_id, host_partner:partners!stream_rooms_host_partner_id_fkey(member_id)')
        .eq('id', roomId)
        .single();

      if (roomError || !room) {
        return errorResponse('ROOM_NOT_FOUND', '방을 찾을 수 없습니다', null, 404);
      }

      if (room.status !== 'live') {
        return errorResponse('ROOM_NOT_LIVE', '종료된 방에서는 채팅할 수 없습니다');
      }

      // 호스트 여부 확인
      const isHost = room.host_member_id === user.id || 
                     room.host_partner?.member_id === user.id;

      // 채팅 모드 검증 (호스트는 항상 가능)
      if (!isHost) {
        if (room.chat_mode === 'disabled') {
          return errorResponse('CHAT_DISABLED', '채팅이 비활성화되어 있습니다');
        }

        if (room.chat_mode === 'subscriber') {
          // TODO: 구독자 여부 확인
          // 현재는 통과 처리
        }
      }

      // 방 참가 여부 확인
      const { data: viewer } = await supabase
        .from('stream_viewers')
        .select('id')
        .eq('room_id', roomId)
        .eq('member_id', user.id)
        .is('left_at', null)
        .maybeSingle();

      const { data: host } = await supabase
        .from('stream_hosts')
        .select('id')
        .eq('room_id', roomId)
        .or(`member_id.eq.${user.id},partner_id.in.(select id from partners where member_id='${user.id}')`)
        .is('left_at', null)
        .maybeSingle();

      if (!viewer && !host && !isHost) {
        return errorResponse('NOT_IN_ROOM', '방에 참가해야 채팅할 수 있습니다');
      }

      // 밴 상태 확인
      const banStatus = await checkBanStatus(roomId, user.id);
      if (banStatus) {
        if (banStatus.ban_type === 'ban') {
          return errorResponse('USER_BANNED', '채팅이 금지되었습니다', null, 403);
        }
        if (banStatus.ban_type === 'mute') {
          return errorResponse('USER_MUTED', '일시적으로 채팅이 금지되었습니다');
        }
      }

      // Rate Limiting 체크
      const isWithinLimit = await checkRateLimit(user.id, roomId);
      if (!isWithinLimit) {
        return errorResponse('RATE_LIMITED', '메시지를 너무 빠르게 보내고 있습니다. 잠시 후 다시 시도해주세요', null, 429);
      }

      // 메시지 저장
      const { data: chat, error: chatError } = await supabase
        .from('stream_chats')
        .insert({
          room_id: roomId,
          sender_id: user.id,
          content,
          chat_type: chatType,
        })
        .select('id, content, chat_type, created_at')
        .single();

      if (chatError) {
        console.error('Chat insert error:', chatError);
        return errorResponse('SEND_FAILED', '메시지 전송에 실패했습니다', chatError.message);
      }

      return successResponse({
        message_id: chat.id,
        content: chat.content,
        chat_type: chat.chat_type,
        created_at: chat.created_at,
      });
    }

    // ========== GET /api-stream-chat/messages/:roomId - 채팅 목록 조회 ==========
    const messagesMatch = pathname.match(/^\/api-stream-chat\/messages\/([^\/]+)$/);
    if (messagesMatch && req.method === 'GET') {
      const roomId = messagesMatch[1];
      const params = getQueryParams(req.url);
      const limit = Math.min(parseInt(params.limit || '100'), 200);
      const before = params.before; // cursor for pagination

      // 방 공개 여부 확인
      const { data: room } = await supabase
        .from('stream_rooms')
        .select('access_type')
        .eq('id', roomId)
        .single();

      if (!room) {
        return errorResponse('ROOM_NOT_FOUND', '방을 찾을 수 없습니다', null, 404);
      }

      // 비공개방인 경우 참가자만 조회 가능
      if (room.access_type === 'private') {
        try {
          const user = await getAuthUser(req);

          const { data: viewer } = await supabase
            .from('stream_viewers')
            .select('id')
            .eq('room_id', roomId)
            .eq('member_id', user.id)
            .maybeSingle();

          const { data: host } = await supabase
            .from('stream_hosts')
            .select('id')
            .eq('room_id', roomId)
            .or(`member_id.eq.${user.id}`)
            .maybeSingle();

          if (!viewer && !host) {
            return errorResponse('NOT_IN_ROOM', '방에 참가해야 채팅을 볼 수 있습니다', null, 403);
          }
        } catch {
          return errorResponse('UNAUTHORIZED', '로그인이 필요합니다', null, 401);
        }
      }

      let query = supabase
        .from('stream_chats')
        .select(`
          id, content, chat_type, is_pinned, created_at,
          sender:members!stream_chats_sender_id_fkey(id, name, profile_image)
        `)
        .eq('room_id', roomId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })
        .limit(limit);

      if (before) {
        query = query.lt('id', before);
      }

      const { data: messages, error: messagesError } = await query;

      if (messagesError) {
        return errorResponse('FETCH_FAILED', '조회에 실패했습니다', messagesError.message);
      }

      return successResponse(messages || []);
    }

    // ========== POST /api-stream-chat/ban - 사용자 밴 ==========
    if (pathname === '/api-stream-chat/ban' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req) as BanStreamUserBody;

      if (!body?.room_id || !body?.target_member_id || !body?.ban_type) {
        return errorResponse('INVALID_PARAMS', '필수 파라미터가 누락되었습니다');
      }

      // 호스트 권한 확인
      const isHost = await checkHostPermission(body.room_id, user.id);
      if (!isHost) {
        return errorResponse('NOT_HOST', '호스트만 사용자를 밴할 수 있습니다', null, 403);
      }

      // 자기 자신은 밴 불가
      if (body.target_member_id === user.id) {
        return errorResponse('CANNOT_BAN_SELF', '자기 자신을 밴할 수 없습니다');
      }

      // 만료 시간 계산
      let expiresAt = null;
      if (body.duration_minutes && body.ban_type !== 'ban') {
        expiresAt = new Date(Date.now() + body.duration_minutes * 60 * 1000).toISOString();
      }

      // 밴 기록 저장
      const { data: ban, error: banError } = await supabase
        .from('stream_chat_bans')
        .insert({
          room_id: body.room_id,
          target_member_id: body.target_member_id,
          banned_by_member_id: user.id,
          ban_type: body.ban_type,
          reason: body.reason || null,
          expires_at: expiresAt,
        })
        .select('id')
        .single();

      if (banError) {
        return errorResponse('BAN_FAILED', '밴에 실패했습니다', banError.message);
      }

      // kick인 경우 viewer에서도 제거
      if (body.ban_type === 'kick') {
        await supabase
          .from('stream_viewers')
          .update({ left_at: new Date().toISOString() })
          .eq('room_id', body.room_id)
          .eq('member_id', body.target_member_id)
          .is('left_at', null);
      }

      return successResponse({
        ban_id: ban.id,
        message: body.ban_type === 'mute' ? '사용자를 뮤트했습니다' :
                 body.ban_type === 'kick' ? '사용자를 내보냈습니다' :
                 '사용자를 영구 밴했습니다'
      });
    }

    // ========== POST /api-stream-chat/unban - 사용자 언밴 ==========
    if (pathname === '/api-stream-chat/unban' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req) as { room_id: string; target_member_id: string };

      if (!body?.room_id || !body?.target_member_id) {
        return errorResponse('INVALID_PARAMS', '필수 파라미터가 누락되었습니다');
      }

      // 호스트 권한 확인
      const isHost = await checkHostPermission(body.room_id, user.id);
      if (!isHost) {
        return errorResponse('NOT_HOST', '호스트만 언밴할 수 있습니다', null, 403);
      }

      // 밴 해제 (만료 시간을 현재로 설정)
      const { error: unbanError } = await supabase
        .from('stream_chat_bans')
        .update({ expires_at: new Date().toISOString() })
        .eq('room_id', body.room_id)
        .eq('target_member_id', body.target_member_id)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`);

      if (unbanError) {
        return errorResponse('UNBAN_FAILED', '언밴에 실패했습니다', unbanError.message);
      }

      return successResponse({ message: '사용자 밴을 해제했습니다' });
    }

    // ========== DELETE /api-stream-chat/message/:messageId - 메시지 삭제 ==========
    const deleteMatch = pathname.match(/^\/api-stream-chat\/message\/([^\/]+)$/);
    if (deleteMatch && req.method === 'DELETE') {
      const messageId = deleteMatch[1];
      const user = await getAuthUser(req);

      // 메시지 조회
      const { data: message, error: messageError } = await supabase
        .from('stream_chats')
        .select('id, room_id, sender_id')
        .eq('id', messageId)
        .single();

      if (messageError || !message) {
        return errorResponse('MESSAGE_NOT_FOUND', '메시지를 찾을 수 없습니다', null, 404);
      }

      // 본인 메시지이거나 호스트인 경우만 삭제 가능
      const isSender = message.sender_id === user.id;
      const isHost = await checkHostPermission(message.room_id, user.id);

      if (!isSender && !isHost) {
        return errorResponse('NO_PERMISSION', '삭제 권한이 없습니다', null, 403);
      }

      // 소프트 삭제
      const { error: deleteError } = await supabase
        .from('stream_chats')
        .update({ is_deleted: true })
        .eq('id', messageId);

      if (deleteError) {
        return errorResponse('DELETE_FAILED', '삭제에 실패했습니다', deleteError.message);
      }

      return successResponse({ message: '메시지를 삭제했습니다' });
    }

    // ========== POST /api-stream-chat/pin/:messageId - 메시지 고정 ==========
    const pinMatch = pathname.match(/^\/api-stream-chat\/pin\/([^\/]+)$/);
    if (pinMatch && req.method === 'POST') {
      const messageId = pinMatch[1];
      const user = await getAuthUser(req);

      // 메시지 조회
      const { data: message, error: messageError } = await supabase
        .from('stream_chats')
        .select('id, room_id, is_pinned')
        .eq('id', messageId)
        .single();

      if (messageError || !message) {
        return errorResponse('MESSAGE_NOT_FOUND', '메시지를 찾을 수 없습니다', null, 404);
      }

      // 호스트 권한 확인
      const isHost = await checkHostPermission(message.room_id, user.id);
      if (!isHost) {
        return errorResponse('NOT_HOST', '호스트만 메시지를 고정할 수 있습니다', null, 403);
      }

      // 고정 토글
      const newPinned = !message.is_pinned;

      // 기존 고정 메시지 해제 (한 개만 고정 가능)
      if (newPinned) {
        await supabase
          .from('stream_chats')
          .update({ is_pinned: false })
          .eq('room_id', message.room_id)
          .eq('is_pinned', true);
      }

      const { error: pinError } = await supabase
        .from('stream_chats')
        .update({ is_pinned: newPinned })
        .eq('id', messageId);

      if (pinError) {
        return errorResponse('PIN_FAILED', '고정에 실패했습니다', pinError.message);
      }

      return successResponse({ 
        is_pinned: newPinned,
        message: newPinned ? '메시지를 고정했습니다' : '메시지 고정을 해제했습니다'
      });
    }

    return errorResponse('ROUTE_NOT_FOUND', 'API route not found', null, 404);

  } catch (error) {
    console.error('Chat API error:', error);

    if (error.message?.includes('authorization') || error.message?.includes('token')) {
      return errorResponse('UNAUTHORIZED', '로그인이 필요합니다', null, 401);
    }

    return errorResponse('INTERNAL_ERROR', '서버 오류가 발생했습니다', error.message, 500);
  }
});
