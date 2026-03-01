import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, createSupabaseClient, errorResponse, successResponse, getAuthUser, parseRequestBody } from '../_shared/utils.ts';

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const supabase = createSupabaseClient();

    // POST /api-voice-call/start - Start a voice call
    if (pathname === '/api-voice-call/start' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body || !body.partner_id || !body.partner_name) {
        return errorResponse('INVALID_BODY', 'Partner ID and name are required');
      }

      const { partner_id: targetMemberId, partner_name, call_id } = body;

      try {
        // Get caller's member info
        const { data: memberData, error: memberError } = await supabase
          .from('members')
          .select('name')
          .eq('id', user.id)
          .single();

        const callerName = memberData?.name || '사용자';

        // 통화를 거는 사람(user.id)이 파트너인지 클라이언트인지 확인
        const { data: callerPartnerData } = await supabase
          .from('partners')
          .select('id')
          .eq('member_id', user.id)
          .single();

        const { data: targetPartnerData } = await supabase
          .from('partners')
          .select('id')
          .eq('member_id', targetMemberId)
          .single();

        // call_rooms 테이블의 구조에 맞게 설정
        // partner_id: 파트너의 members.id (not partners.id)
        // member_id: 클라이언트의 members.id
        let finalPartnerId = null;
        let finalMemberId = null;

        if (callerPartnerData) {
          // 통화를 거는 사람이 파트너인 경우
          finalPartnerId = user.id; // 파트너의 member_id
          finalMemberId = targetMemberId; // 상대방(클라이언트)
        } else if (targetPartnerData) {
          // 통화를 받는 사람이 파트너인 경우
          finalPartnerId = targetMemberId; // 파트너의 member_id
          finalMemberId = user.id; // 본인(클라이언트)
        }

        // Generate room code
        const roomCode = `call_${user.id}_${targetMemberId}_${Date.now()}`;

        // Create call room
        const { data: callRoom, error: roomError } = await supabase
          .from('call_rooms')
          .insert({
            room_code: roomCode,
            status: 'waiting',
            member_id: finalMemberId,
            partner_id: finalPartnerId,
            topic: `${callerName}님과의 음성 통화`,
            started_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (roomError) throw roomError;

        // Add caller as participant
        // call_rooms의 partner_id와 member_id를 관계 컨텍스트로 저장하고
        // 실제 통화 시작한 사람 정보도 함께 저장
        const callerParticipant = {
          room_id: callRoom.id,
          partner_id: callRoom.partner_id,  // 관계 컨텍스트
          member_id: callRoom.member_id,    // 관계 컨텍스트
          joined_at: new Date().toISOString(),
          device_info: {
            os: body.device_info?.os || 'Unknown',
            browser: body.device_info?.browser || 'Unknown',
            timestamp: new Date().toISOString()
          },
          connection_quality: 'good'
        };

        // constraint 문제로 인해 기존 방식 유지
        if (callerPartnerData) {
          // 통화를 거는 사람이 파트너인 경우
          callerParticipant.actual_partner_id = callerPartnerData.id;
          callerParticipant.actual_member_id = null;
          callerParticipant.participant_type = 'partner';
        } else {
          // 통화를 거는 사람이 클라이언트인 경우
          callerParticipant.actual_member_id = user.id;
          callerParticipant.actual_partner_id = null;
          callerParticipant.participant_type = 'member';
        }

        const { error: participantError } = await supabase
          .from('call_participants')
          .insert(callerParticipant);

        if (participantError) throw participantError;

        return successResponse({
          room: callRoom,
          message: 'Call started successfully',
        });

      } catch (error) {
        return errorResponse('CALL_START_ERROR', 'Failed to start call', error.message);
      }
    }

    // POST /api-voice-call/join - Join an existing call
    if (pathname === '/api-voice-call/join' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body || !body.room_id) {
        return errorResponse('INVALID_BODY', 'Room ID is required');
      }

      const { room_id } = body;

      try {
        // Check if room exists and is active
        const { data: room, error: roomError } = await supabase
          .from('call_rooms')
          .select('*')
          .eq('id', room_id)
          .eq('status', 'waiting')
          .single();

        if (roomError) {
          if (roomError.code === 'PGRST116') {
            return errorResponse('ROOM_NOT_FOUND', 'Call room not found or already in progress');
          }
          throw roomError;
        }

        // Update room status to in_call
        const { error: updateError } = await supabase
          .from('call_rooms')
          .update({
            status: 'in_call',
            started_at: new Date().toISOString()
          })
          .eq('id', room_id);

        if (updateError) throw updateError;

        // Add participant - 통화 수락한 사람 추가
        // 통화 수락하는 사람이 파트너인지 클라이언트인지 확인
        const { data: joinPartnerData } = await supabase
          .from('partners')
          .select('id')
          .eq('member_id', user.id)
          .single();

        const joinParticipant = {
          room_id: room_id,
          partner_id: room.partner_id,  // 관계 컨텍스트
          member_id: room.member_id,    // 관계 컨텍스트
          joined_at: new Date().toISOString(),
          device_info: {
            os: body.device_info?.os || 'Unknown',
            browser: body.device_info?.browser || 'Unknown',
            timestamp: new Date().toISOString()
          },
          connection_quality: 'good'
        };

        // constraint 문제로 인해 기존 방식 유지
        if (joinPartnerData) {
          // 통화 수락한 사람이 파트너인 경우
          joinParticipant.actual_partner_id = joinPartnerData.id;
          joinParticipant.actual_member_id = null;
          joinParticipant.participant_type = 'partner';
        } else {
          // 통화 수락한 사람이 클라이언트인 경우
          joinParticipant.actual_member_id = user.id;
          joinParticipant.actual_partner_id = null;
          joinParticipant.participant_type = 'member';
        }

        // 기존 participant 레코드 확인
        const { data: existingParticipant } = await supabase
          .from('call_participants')
          .select('id')
          .eq('room_id', room_id)
          .eq('member_id', room.member_id)
          .is('left_at', null)
          .maybeSingle();

        if (existingParticipant) {
          // 기존 레코드 업데이트
          const { error: updateError } = await supabase
            .from('call_participants')
            .update({
              joined_at: joinParticipant.joined_at,
              device_info: joinParticipant.device_info,
              connection_quality: joinParticipant.connection_quality,
              actual_member_id: joinParticipant.actual_member_id,
              actual_partner_id: joinParticipant.actual_partner_id,
              participant_type: joinParticipant.participant_type
            })
            .eq('id', existingParticipant.id);

          if (updateError) throw updateError;
        } else {
          // 새 레코드 생성
          const { error: insertError } = await supabase
            .from('call_participants')
            .insert(joinParticipant);

          if (insertError) throw insertError;
        }

        return successResponse({
          room,
          message: 'Successfully joined call',
        });

      } catch (error) {
        return errorResponse('CALL_JOIN_ERROR', 'Failed to join call', error.message);
      }
    }

    // POST /api-voice-call/end - End a call
    if (pathname === '/api-voice-call/end' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body || !body.room_id) {
        return errorResponse('INVALID_BODY', 'Room ID is required');
      }

      const { room_id } = body;

      try {
        // Update room status to ended
        const { error: roomError } = await supabase
          .from('call_rooms')
          .update({
            status: 'ended',
            ended_at: new Date().toISOString()
          })
          .eq('id', room_id);

        if (roomError) throw roomError;

        // Update participant left time
        const { error: participantError } = await supabase
          .from('call_participants')
          .update({
            left_at: new Date().toISOString(),
            connection_quality: 'disconnected'
          })
          .eq('room_id', room_id)
          .eq('member_id', user.id)
          .is('left_at', null);

        if (participantError) throw participantError;

        return successResponse({
          message: 'Call ended successfully',
        });

      } catch (error) {
        return errorResponse('CALL_END_ERROR', 'Failed to end call', error.message);
      }
    }

    // GET /api-voice-call/status/{roomId} - Get call status
    if (pathname.includes('/status/') && req.method === 'GET') {
      const user = await getAuthUser(req);
      const roomId = pathname.split('/status/')[1];

      if (!roomId) {
        return errorResponse('INVALID_ROOM_ID', 'Room ID is required');
      }

      try {
        // Get room with participants
        const { data: room, error: roomError } = await supabase
          .from('call_rooms')
          .select(`
            *,
            call_participants(*)
          `)
          .eq('id', roomId)
          .single();

        if (roomError) {
          if (roomError.code === 'PGRST116') {
            return errorResponse('ROOM_NOT_FOUND', 'Call room not found');
          }
          throw roomError;
        }

        // Calculate call duration if in progress
        let duration = null;
        if (room.started_at && room.status === 'in_call') {
          const startTime = new Date(room.started_at);
          const now = new Date();
          duration = Math.floor((now.getTime() - startTime.getTime()) / 1000); // seconds
        }

        return successResponse({
          room,
          duration,
        });

      } catch (error) {
        return errorResponse('STATUS_ERROR', 'Failed to get call status', error.message);
      }
    }

    // GET /api-voice-call/active - Get user's active calls
    if (pathname === '/api-voice-call/active' && req.method === 'GET') {
      const user = await getAuthUser(req);

      try {
        // Find active calls for this user
        const { data: activeCalls, error: callsError } = await supabase
          .from('call_rooms')
          .select(`
            *,
            call_participants(*)
          `)
          .or(`member_id.eq.${user.id},partner_id.eq.${user.id}`)
          .in('status', ['waiting', 'in_call'])
          .order('started_at', { ascending: false });

        if (callsError) throw callsError;

        // Add duration for active calls
        const callsWithDuration = activeCalls?.map(call => {
          let duration = null;
          if (call.started_at && call.status === 'in_call') {
            const startTime = new Date(call.started_at);
            const now = new Date();
            duration = Math.floor((now.getTime() - startTime.getTime()) / 1000);
          }
          return { ...call, duration };
        });

        return successResponse({
          activeCalls: callsWithDuration || [],
        });

      } catch (error) {
        return errorResponse('ACTIVE_CALLS_ERROR', 'Failed to get active calls', error.message);
      }
    }

    return errorResponse('ROUTE_NOT_FOUND', 'API route not found', null, 404);

  } catch (error) {
    console.error('Voice Call API error:', error);

    // Handle authentication errors
    if (error.message.includes('authorization') || error.message.includes('token')) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', null, 401);
    }

    return errorResponse(
      'INTERNAL_ERROR',
      'Internal server error',
      error.message,
      500
    );
  }
});