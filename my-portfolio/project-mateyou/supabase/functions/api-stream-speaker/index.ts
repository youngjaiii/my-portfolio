/**
 * api-stream-speaker - 발언권 관리 Edge Function
 * 
 * 엔드포인트:
 * - POST /api-stream-speaker/request - 발언권 요청
 * - POST /api-stream-speaker/approve/:requestId - 발언권 승인 (호스트만)
 * - POST /api-stream-speaker/reject/:requestId - 발언권 거절 (호스트만)
 * - POST /api-stream-speaker/revoke/:hostId - 발언권 박탈 (호스트만)
 * - GET /api-stream-speaker/requests/:roomId - 발언권 요청 목록 (호스트만)
 * - GET /api-stream-speaker/hosts/:roomId - 발언자 목록
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import type { RequestSpeakerBody } from '../_shared/types.ts';
import { corsHeaders, createSupabaseClient, errorResponse, getAuthUser, parseRequestBody, successResponse } from '../_shared/utils.ts';

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

    // ========== POST /api-stream-speaker/request - 발언권 요청 ==========
    if (pathname === '/api-stream-speaker/request' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req) as RequestSpeakerBody;

      if (!body?.room_id) {
        return errorResponse('INVALID_ROOM', '방 ID가 필요합니다');
      }

      const roomId = body.room_id;

      // 방 존재 확인
      const { data: room, error: roomError } = await supabase
        .from('stream_rooms')
        .select('id, status, max_participants')
        .eq('id', roomId)
        .single();

      if (roomError || !room) {
        return errorResponse('ROOM_NOT_FOUND', '방을 찾을 수 없습니다', null, 404);
      }

      if (room.status !== 'live') {
        return errorResponse('ROOM_NOT_LIVE', '라이브 중인 방에서만 요청할 수 있습니다');
      }

      // 이미 발언자인지 확인
      const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', user.id)
        .maybeSingle();

      let isAlreadySpeaker = false;

      if (partner) {
        const { data: existingHost } = await supabase
          .from('stream_hosts')
          .select('id')
          .eq('room_id', roomId)
          .eq('partner_id', partner.id)
          .is('left_at', null)
          .maybeSingle();

        isAlreadySpeaker = !!existingHost;
      } else {
        const { data: existingHost } = await supabase
          .from('stream_hosts')
          .select('id')
          .eq('room_id', roomId)
          .eq('member_id', user.id)
          .is('left_at', null)
          .maybeSingle();

        isAlreadySpeaker = !!existingHost;
      }

      if (isAlreadySpeaker) {
        return errorResponse('ALREADY_SPEAKER', '이미 발언자입니다');
      }

      // 현재 발언자 수 확인
      const { count: speakerCount } = await supabase
        .from('stream_hosts')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', roomId)
        .is('left_at', null);

      if ((speakerCount || 0) >= room.max_participants) {
        return errorResponse('ROOM_FULL', '발언자 수가 최대입니다');
      }

      // 이미 대기 중인 요청이 있는지 확인
      const { data: existingRequest } = await supabase
        .from('stream_speaker_requests')
        .select('id, status')
        .eq('room_id', roomId)
        .eq('requester_member_id', user.id)
        .eq('status', 'pending')
        .maybeSingle();

      if (existingRequest) {
        return errorResponse('REQUEST_EXISTS', '이미 발언권을 요청했습니다');
      }

      // 발언권 요청 생성
      const { data: request, error: requestError } = await supabase
        .from('stream_speaker_requests')
        .insert({
          room_id: roomId,
          requester_member_id: user.id,
          message: body.message?.trim() || null,
          status: 'pending',
        })
        .select('id')
        .single();

      if (requestError) {
        console.error('Request creation error:', requestError);
        return errorResponse('REQUEST_FAILED', '요청에 실패했습니다', requestError.message);
      }

      return successResponse({
        request_id: request.id,
        message: '발언권을 요청했습니다'
      });
    }

    // ========== POST /api-stream-speaker/approve/:requestId - 발언권 승인 ==========
    const approveMatch = pathname.match(/^\/api-stream-speaker\/approve\/([^\/]+)$/);
    if (approveMatch && req.method === 'POST') {
      const requestId = approveMatch[1];
      const user = await getAuthUser(req);

      // 요청 조회
      const { data: request, error: requestError } = await supabase
        .from('stream_speaker_requests')
        .select('*, room:stream_rooms!stream_speaker_requests_room_id_fkey(id, max_participants)')
        .eq('id', requestId)
        .single();

      if (requestError || !request) {
        return errorResponse('REQUEST_NOT_FOUND', '요청을 찾을 수 없습니다', null, 404);
      }

      if (request.status !== 'pending') {
        return errorResponse('REQUEST_PROCESSED', '이미 처리된 요청입니다');
      }

      // 호스트 권한 확인
      const isHost = await checkHostPermission(request.room_id, user.id);
      if (!isHost) {
        return errorResponse('NOT_HOST', '호스트만 승인할 수 있습니다', null, 403);
      }

      // 현재 발언자 수 확인
      const { count: speakerCount } = await supabase
        .from('stream_hosts')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', request.room_id)
        .is('left_at', null);

      if ((speakerCount || 0) >= request.room.max_participants) {
        return errorResponse('ROOM_FULL', '발언자 수가 최대입니다');
      }

      // 요청 상태 업데이트
      const { error: updateError } = await supabase
        .from('stream_speaker_requests')
        .update({
          status: 'approved',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (updateError) {
        return errorResponse('APPROVE_FAILED', '승인에 실패했습니다', updateError.message);
      }

      // 요청자의 파트너 정보 확인
      const { data: requesterPartner } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', request.requester_member_id)
        .maybeSingle();

      // 호스트 목록에 추가
      const hostData: Record<string, unknown> = {
        room_id: request.room_id,
        role: 'guest',
      };

      if (requesterPartner) {
        hostData.partner_id = requesterPartner.id;
      } else {
        hostData.member_id = request.requester_member_id;
      }

      const { error: hostError } = await supabase
        .from('stream_hosts')
        .insert(hostData);

      if (hostError) {
        console.error('Host insert error:', hostError);
        // 롤백: 요청 상태를 pending으로 되돌림
        await supabase
          .from('stream_speaker_requests')
          .update({ status: 'pending', reviewed_by: null, reviewed_at: null })
          .eq('id', requestId);

        return errorResponse('HOST_INSERT_FAILED', '발언자 등록에 실패했습니다', hostError.message);
      }

      return successResponse({ message: '발언권을 승인했습니다' });
    }

    // ========== POST /api-stream-speaker/reject/:requestId - 발언권 거절 ==========
    const rejectMatch = pathname.match(/^\/api-stream-speaker\/reject\/([^\/]+)$/);
    if (rejectMatch && req.method === 'POST') {
      const requestId = rejectMatch[1];
      const user = await getAuthUser(req);

      // 요청 조회
      const { data: request, error: requestError } = await supabase
        .from('stream_speaker_requests')
        .select('room_id, status')
        .eq('id', requestId)
        .single();

      if (requestError || !request) {
        return errorResponse('REQUEST_NOT_FOUND', '요청을 찾을 수 없습니다', null, 404);
      }

      if (request.status !== 'pending') {
        return errorResponse('REQUEST_PROCESSED', '이미 처리된 요청입니다');
      }

      // 호스트 권한 확인
      const isHost = await checkHostPermission(request.room_id, user.id);
      if (!isHost) {
        return errorResponse('NOT_HOST', '호스트만 거절할 수 있습니다', null, 403);
      }

      // 요청 상태 업데이트
      const { error: updateError } = await supabase
        .from('stream_speaker_requests')
        .update({
          status: 'rejected',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (updateError) {
        return errorResponse('REJECT_FAILED', '거절에 실패했습니다', updateError.message);
      }

      return successResponse({ message: '발언권을 거절했습니다' });
    }

    // ========== POST /api-stream-speaker/revoke/:hostId - 발언권 박탈 ==========
    const revokeMatch = pathname.match(/^\/api-stream-speaker\/revoke\/([^\/]+)$/);
    if (revokeMatch && req.method === 'POST') {
      const hostId = revokeMatch[1];
      const user = await getAuthUser(req);

      // 호스트 레코드 조회
      const { data: hostRecord, error: hostError } = await supabase
        .from('stream_hosts')
        .select('room_id, role, member_id, partner_id')
        .eq('id', hostId)
        .is('left_at', null)
        .single();

      if (hostError || !hostRecord) {
        return errorResponse('HOST_NOT_FOUND', '발언자를 찾을 수 없습니다', null, 404);
      }

      // owner는 박탈 불가
      if (hostRecord.role === 'owner') {
        return errorResponse('CANNOT_REVOKE_OWNER', '방장의 발언권은 박탈할 수 없습니다');
      }

      // 호스트 권한 확인
      const isHost = await checkHostPermission(hostRecord.room_id, user.id);
      if (!isHost) {
        return errorResponse('NOT_HOST', '호스트만 발언권을 박탈할 수 있습니다', null, 403);
      }

      // 발언권 박탈 (left_at 설정)
      const { error: revokeError } = await supabase
        .from('stream_hosts')
        .update({ left_at: new Date().toISOString() })
        .eq('id', hostId);

      if (revokeError) {
        return errorResponse('REVOKE_FAILED', '발언권 박탈에 실패했습니다', revokeError.message);
      }

      return successResponse({ message: '발언권을 박탈했습니다' });
    }

    // ========== GET /api-stream-speaker/requests/:roomId - 발언권 요청 목록 ==========
    const requestsMatch = pathname.match(/^\/api-stream-speaker\/requests\/([^\/]+)$/);
    if (requestsMatch && req.method === 'GET') {
      const roomId = requestsMatch[1];
      const user = await getAuthUser(req);

      // 호스트 권한 확인
      const isHost = await checkHostPermission(roomId, user.id);
      if (!isHost) {
        return errorResponse('NOT_HOST', '호스트만 조회할 수 있습니다', null, 403);
      }

      const { data: requests, error: requestsError } = await supabase
        .from('stream_speaker_requests')
        .select(`
          id, status, message, created_at,
          requester:members!stream_speaker_requests_requester_member_id_fkey(
            id, name, profile_image
          )
        `)
        .eq('room_id', roomId)
        .eq('status', 'pending')
        .order('created_at', { ascending: true });

      if (requestsError) {
        return errorResponse('FETCH_FAILED', '조회에 실패했습니다', requestsError.message);
      }

      return successResponse(requests || []);
    }

    // ========== GET /api-stream-speaker/hosts/:roomId - 발언자 목록 ==========
    const hostsMatch = pathname.match(/^\/api-stream-speaker\/hosts\/([^\/]+)$/);
    if (hostsMatch && req.method === 'GET') {
      const roomId = hostsMatch[1];

      const { data: hosts, error: hostsError } = await supabase
        .from('stream_hosts')
        .select(`
          id, role, joined_at,
          member:members(id, name, profile_image),
          partner:partners(id, partner_name, member:members(id, name, profile_image))
        `)
        .eq('room_id', roomId)
        .is('left_at', null)
        .order('joined_at', { ascending: true });

      if (hostsError) {
        return errorResponse('FETCH_FAILED', '조회에 실패했습니다', hostsError.message);
      }

      return successResponse(hosts || []);
    }

    return errorResponse('ROUTE_NOT_FOUND', 'API route not found', null, 404);

  } catch (error) {
    console.error('Speaker API error:', error);

    if (error.message?.includes('authorization') || error.message?.includes('token')) {
      return errorResponse('UNAUTHORIZED', '로그인이 필요합니다', null, 401);
    }

    return errorResponse('INTERNAL_ERROR', '서버 오류가 발생했습니다', error.message, 500);
  }
});
