// @ts-nocheck
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
      // call_type: 'audio' | 'video' (기본값: 'audio')
      // 잘못된 값이 오더라도 audio로 처리
      const rawCallType = (body.call_type || 'audio') as string;
      const callType = rawCallType === 'video' ? 'video' : 'audio';

      const { partner_id: targetMemberId, partner_name: partnerName, call_id: callId } = body;

      try {
        console.log('[VoiceCall] Start call request:', {
          callerId: user.id,
          targetMemberId,
          partnerName,
          callId,
          callType,
          timestamp: new Date().toISOString()
        })

        // Get caller's member info
        const { data: memberData, error: memberError } = await supabase
          .from('members')
          .select('name, role')
          .eq('id', user.id)
          .single();

        if (memberError) {
          console.error('[VoiceCall] Failed to get caller info:', memberError)
        }

        const callerName = memberData?.name || '사용자';
        const callerRole = memberData?.role || 'normal';

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
        // partner_id: 전화를 건 사람의 members.id (파트너, 관리자 모두)
        // member_id: 전화를 받는 사람의 member_id
        // 이제 partner_id와 member_id 모두 members.id를 참조함
        let finalPartnerId = null;
        let finalMemberId = null;

        if (callerPartnerData) {
          // 통화를 거는 사람이 파트너인 경우
          // partner_id에 파트너의 members.id 저장
          finalPartnerId = user.id; // 파트너의 members.id
          finalMemberId = targetMemberId; // 상대방(클라이언트)
        } else if (targetPartnerData) {
          // 통화를 받는 사람이 파트너인 경우
          // partner_id에 파트너의 members.id 저장
          finalPartnerId = targetMemberId; // 파트너의 members.id
          finalMemberId = user.id; // 본인(클라이언트)
        } else if (callerRole === 'admin') {
          // 관리자가 전화를 거는 경우
          // partner_id에 관리자의 members.id 저장
          finalPartnerId = user.id; // 관리자의 members.id
          finalMemberId = targetMemberId; // 상대방(파트너의 member_id)
        } else {
          // 일반 클라이언트가 파트너에게 전화를 거는 경우
          finalPartnerId = targetMemberId; // 파트너의 members.id
          finalMemberId = user.id; // 클라이언트의 members.id
        }

        // 기존에 waiting 또는 in_call 상태의 통화방이 있는지 확인 (양방향)
        // 두 사용자 간의 활성 통화방 확인 (방향 1)
        const { data: callsDir1, error: checkError1 } = await supabase
          .from('call_rooms')
          .select('id, status, started_at, member_id, partner_id')
          .in('status', ['waiting', 'in_call'])
          .eq('member_id', user.id)
          .eq('partner_id', targetMemberId);
        
        // 두 사용자 간의 활성 통화방 확인 (방향 2)
        const { data: callsDir2, error: checkError2 } = await supabase
          .from('call_rooms')
          .select('id, status, started_at, member_id, partner_id')
          .in('status', ['waiting', 'in_call'])
          .eq('member_id', targetMemberId)
          .eq('partner_id', user.id);
        
        // 두 결과 합치기
        const existingActiveCalls = [...(callsDir1 || []), ...(callsDir2 || [])];
        const checkError = checkError1 || checkError2;
        
        // 내가 포함된 다른 활성 통화도 확인 (동시에 여러 통화 방지)
        const { data: myCallsAsMember } = await supabase
          .from('call_rooms')
          .select('id, status, started_at')
          .in('status', ['waiting', 'in_call'])
          .eq('member_id', user.id);
        
        const { data: myCallsAsPartner } = await supabase
          .from('call_rooms')
          .select('id, status, started_at')
          .in('status', ['waiting', 'in_call'])
          .eq('partner_id', user.id);
        
        const myOtherActiveCalls = [...(myCallsAsMember || []), ...(myCallsAsPartner || [])];
        
        console.log('[VoiceCall] Existing calls check:', {
          existingActiveCalls: existingActiveCalls?.length || 0,
          myOtherActiveCalls: myOtherActiveCalls?.length || 0,
          userId: user.id,
          targetMemberId
        });
        
        const existingActiveCall = existingActiveCalls?.[0] || null;

        if (checkError && checkError.code !== 'PGRST116') {
          throw checkError;
        }

        // 내가 이미 다른 통화 중인 경우 방지 (같은 상대와의 통화는 제외)
        if (myOtherActiveCalls && myOtherActiveCalls.length > 0) {
          const now = new Date();
          
          // 1분 이상 된 waiting 통화 또는 같은 상대와의 통화는 자동 정리
          const callsToCleanup = myOtherActiveCalls.filter(call => {
            const startedAt = new Date(call.started_at);
            const diffMinutes = (now.getTime() - startedAt.getTime()) / (1000 * 60);
            // waiting 상태이고 1분 이상 된 통화는 정리
            return call.status === 'waiting' && diffMinutes > 1;
          });
          
          // 오래된 통화방 정리
          for (const staleCall of callsToCleanup) {
            console.log('[VoiceCall] Auto-ending stale call:', staleCall.id);
            await supabase
              .from('call_rooms')
              .update({ status: 'ended', ended_at: now.toISOString(), end_reason: 'auto_timeout' })
              .eq('id', staleCall.id);
          }
          
          // 현재 상대와의 통화는 existingActiveCalls에서 처리하므로 제외
          // in_call 상태인 다른 통화만 확인
          const inCallWithOthers = myOtherActiveCalls.filter(call => 
            call.status === 'in_call' && !callsToCleanup.some(s => s.id === call.id)
          );
          
          if (inCallWithOthers.length > 0) {
            console.log('[VoiceCall] User already in another call:', {
              userId: user.id,
              activeCallIds: inCallWithOthers.map(c => c.id)
            });
            return errorResponse('ALREADY_IN_CALL', '이미 다른 통화가 진행 중입니다. 기존 통화를 종료한 후 다시 시도해주세요.', {
              existingRoomIds: inCallWithOthers.map(c => c.id)
            });
          }
        }

        if (existingActiveCall) {
          // 5분 이상 된 waiting 상태의 통화방은 자동으로 ended 처리
          const startedAt = new Date(existingActiveCall.started_at);
          const now = new Date();
          const diffMinutes = (now.getTime() - startedAt.getTime()) / (1000 * 60);
          
          if (existingActiveCall.status === 'waiting' && diffMinutes > 5) {
            console.log('[VoiceCall] Auto-ending stale waiting call:', {
              roomId: existingActiveCall.id,
              startedAt: existingActiveCall.started_at,
              diffMinutes
            });
            
            // 오래된 waiting 통화방 자동 종료
            await supabase
              .from('call_rooms')
              .update({ 
                status: 'ended', 
                ended_at: new Date().toISOString(),
                end_reason: 'auto_timeout'
              })
              .eq('id', existingActiveCall.id);
            
            // 계속 진행하여 새 통화방 생성
          } else if (existingActiveCall.status === 'waiting') {
            // waiting 상태의 통화방이 있음 - 정리하고 새로 생성
            // 30초 이상 된 waiting 통화방은 무조건 정리
            const waitingAge = (now.getTime() - startedAt.getTime()) / 1000;
            
            console.log('[VoiceCall] Found existing waiting call, cleaning up:', {
              roomId: existingActiveCall.id,
              waitingAge: `${waitingAge}초`,
              callerId: user.id,
              targetMemberId
            });
            
            // 기존 waiting 통화방 종료
            await supabase
              .from('call_rooms')
              .update({ 
                status: 'ended', 
                ended_at: new Date().toISOString(),
                end_reason: 'new_call_requested'
              })
              .eq('id', existingActiveCall.id);
            
            console.log('[VoiceCall] Cleaned up old waiting call, proceeding with new call');
            // 새 통화방 생성으로 계속 진행
          } else {
            // in_call 상태 - 이미 통화 중
            console.log('[VoiceCall] Call already in progress:', {
              roomId: existingActiveCall.id,
              status: existingActiveCall.status
            });
            return errorResponse('CALL_IN_PROGRESS', '이미 통화가 진행 중입니다.', {
              existingRoomId: existingActiveCall.id,
              status: existingActiveCall.status
            });
          }
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
            call_type: callType,
            topic: `${callerName}님과의 ${callType === 'video' ? '영상' : '음성'} 통화`,
            started_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (roomError) {
          console.error('[VoiceCall] Failed to create call room:', {
            error: roomError,
            finalPartnerId,
            finalMemberId,
            callerRole
          })
          throw roomError;
        }

        // Add caller as participant
        // call_rooms의 partner_id와 member_id를 관계 컨텍스트로 저장하고
        // 실제 통화 시작한 사람 정보도 함께 저장
        const callerParticipant = {
          room_id: callRoom.id,
          partner_id: callRoom.partner_id,  // 관계 컨텍스트 (이제 members.id 참조)
          member_id: callRoom.member_id,    // 관계 컨텍스트 (members.id 참조)
          joined_at: new Date().toISOString(),
          device_info: {
            os: body.device_info?.os || 'Unknown',
            browser: body.device_info?.browser || 'Unknown',
            timestamp: new Date().toISOString()
          },
          connection_quality: 'good'
        };

        // participant_type 설정
        // 관리자는 partners 테이블에 없으므로 'member'로 처리
        if (callerPartnerData) {
          // 통화를 거는 사람이 파트너인 경우
          // actual_partner_id는 partners.id를 참조 (외래키 제약조건 유지)
          callerParticipant.actual_partner_id = callerPartnerData.id;
          callerParticipant.actual_member_id = null;
          callerParticipant.participant_type = 'partner';
        } else {
          // 통화를 거는 사람이 클라이언트 또는 관리자인 경우
          // 관리자는 partners 테이블에 없으므로 'member'로 처리
          callerParticipant.actual_member_id = user.id;
          callerParticipant.actual_partner_id = null;
          callerParticipant.participant_type = 'member';
        }

        console.log('[VoiceCall] Inserting participant:', {
          roomId: callRoom.id,
          partner_id: callerParticipant.partner_id,
          member_id: callerParticipant.member_id,
          actual_member_id: callerParticipant.actual_member_id,
          actual_partner_id: callerParticipant.actual_partner_id,
          participant_type: callerParticipant.participant_type,
          callerRole
        })

        const { error: participantError } = await supabase
          .from('call_participants')
          .insert(callerParticipant);

        if (participantError) {
          console.error('[VoiceCall] Failed to add participant:', {
            error: participantError,
            participant: callerParticipant,
            callerRole
          })
          throw participantError
        }

        console.log('[VoiceCall] Call started successfully:', {
          roomId: callRoom.id,
          roomCode: callRoom.room_code,
          status: callRoom.status,
          callerId: user.id,
          targetMemberId,
          timestamp: new Date().toISOString()
        })

        // 상대방에게 푸시 알림 전송 (백그라운드, await 없이)
        const authHeader = req.headers.get('Authorization') || `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`;
        fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/notify-call`,
          {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              roomId: callRoom.id,
              callerName: callerName,
              targetMemberId: targetMemberId,
              callerId: user.id,
              callType: callType, // 'audio' | 'video' - 푸시 알림에서 구분하기 위함
            }),
          }
        ).then(async (notifyResponse) => {
          if (notifyResponse.ok) {
            console.log('[VoiceCall] Push notification sent successfully')
          } else {
            const errorText = await notifyResponse.text()
            console.warn('[VoiceCall] Push notification failed:', errorText)
          }
        }).catch((notifyError) => {
          console.warn('[VoiceCall] Push notification error:', notifyError)
        });

        // 푸시 알림 응답을 기다리지 않고 즉시 통화방 응답 반환
        return successResponse({
          room: callRoom,
          message: 'Call started successfully',
        });

      } catch (error: any) {
        console.error('[VoiceCall] Start call error:', {
          callerId: user.id,
          targetMemberId,
          error: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString()
        })
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

      const { room_id: roomId } = body;

      try {
        console.log('[VoiceCall] Join call request:', {
          userId: user.id,
          roomId,
          timestamp: new Date().toISOString()
        })

        // Check if room exists and is active
        const { data: room, error: roomError } = await supabase
          .from('call_rooms')
          .select('*')
          .eq('id', roomId)
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
          .eq('id', roomId);

        if (updateError) throw updateError;

        // Add participant - 통화 수락한 사람 추가
        // 통화 수락하는 사람이 파트너인지 클라이언트인지 확인
        const { data: joinPartnerData } = await supabase
          .from('partners')
          .select('id')
          .eq('member_id', user.id)
          .single();

        const joinParticipant = {
          room_id: roomId,
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
          .eq('room_id', roomId)
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

          if (insertError) {
            console.error('[VoiceCall] Failed to insert participant:', insertError)
            throw insertError
          }
        }

        console.log('[VoiceCall] Call joined successfully:', {
          roomId,
          userId: user.id,
          status: 'in_call',
          timestamp: new Date().toISOString()
        })

        return successResponse({
          room,
          message: 'Successfully joined call',
        });

      } catch (error: any) {
        console.error('[VoiceCall] Join call error:', {
          userId: user.id,
          roomId,
          error: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString()
        })
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

      const { room_id: roomId } = body;

      try {
        console.log('[VoiceCall] End call request:', {
          userId: user.id,
          roomId,
          timestamp: new Date().toISOString()
        })

        // Get room info before ending for logging
        const { data: roomBeforeEnd } = await supabase
          .from('call_rooms')
          .select('started_at, status')
          .eq('id', roomId)
          .single()

        // Update room status to ended
        const { error: roomError } = await supabase
          .from('call_rooms')
          .update({
            status: 'ended',
            ended_at: new Date().toISOString()
          })
          .eq('id', roomId);

        if (roomError) throw roomError;

        // Update participant left time
        const { error: participantError } = await supabase
          .from('call_participants')
          .update({
            left_at: new Date().toISOString(),
            connection_quality: 'disconnected'
          })
          .eq('room_id', roomId)
          .eq('member_id', user.id)
          .is('left_at', null);

        if (participantError) {
          console.error('[VoiceCall] Failed to update participant:', participantError)
          throw participantError
        }

        // Calculate duration for logging
        let duration = null
        if (roomBeforeEnd?.started_at) {
          const startTime = new Date(roomBeforeEnd.started_at)
          const endTime = new Date()
          duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000)
        }

        console.log('[VoiceCall] Call ended successfully:', {
          roomId,
          userId: user.id,
          duration: duration ? `${duration}초` : 'N/A',
          timestamp: new Date().toISOString()
        })

        return successResponse({
          message: 'Call ended successfully',
        });

      } catch (error: any) {
        console.error('[VoiceCall] End call error:', {
          userId: user.id,
          roomId,
          error: error.message,
          stack: error.stack,
          timestamp: new Date().toISOString()
        })
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