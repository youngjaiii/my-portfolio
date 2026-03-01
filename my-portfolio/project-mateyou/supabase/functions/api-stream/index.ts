/**
 * api-stream - 스트림 방 관리 Edge Function
 * 
 * 엔드포인트:
 * - POST /api-stream/rooms - 방 생성
 * - POST /api-stream/rooms/:roomId/join - 방 입장
 * - POST /api-stream/rooms/:roomId/leave - 방 퇴장
 * - POST /api-stream/rooms/:roomId/end - 방 종료 (호스트만)
 * - GET /api-stream/rooms/:roomId - 방 상세 조회
 * - GET /api-stream/rooms - 방 목록 조회
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
    createDonationSuccessResponse,
    handleDonationRpcError,
    processDonationRpc,
    validateDonationAmount,
    validateDonationType
} from '../_shared/donation.ts';
import type { CreateStreamRoomBody, JoinStreamRoomBody } from '../_shared/types.ts';
import { corsHeaders, createSupabaseClient, errorResponse, getAuthUser, getQueryParams, parseRequestBody, successResponse } from '../_shared/utils.ts';

serve(async (req) => {
  // CORS 처리
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const supabase = createSupabaseClient();

    // ========== POST /api-stream/rooms - 방 생성 ==========
    if (pathname === '/api-stream/rooms' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req) as CreateStreamRoomBody;

      if (!body?.title?.trim()) {
        return errorResponse('INVALID_TITLE', '방 제목을 입력해주세요');
      }

      const title = body.title.trim();
      const streamType = body.stream_type || 'audio';
      const accessType = body.access_type || 'public';
      const password = body.password;
      const maxParticipants = body.max_participants || 10;
      const categoryId = body.category_id;

      // 비공개방 비밀번호 검증
      if (accessType === 'private') {
        if (!password || password.length < 4 || password.length > 50) {
          return errorResponse('INVALID_PASSWORD', '비공개방은 4~50자 비밀번호가 필요합니다');
        }
      }

      // 파트너 정보 조회
      const { data: partner } = await supabase
        .from('partners')
        .select('id, partner_status')
        .eq('member_id', user.id)
        .eq('partner_status', 'approved')
        .maybeSingle();

      const isPartner = !!partner;

      // 권한 검증
      // - 영상방: 파트너만 가능
      // - 공개/구독자 음성방: 파트너만 가능
      // - 비공개 음성방: 누구나 가능
      if (streamType === 'video' && !isPartner) {
        return errorResponse('PARTNER_REQUIRED', '영상방은 파트너만 만들 수 있습니다');
      }

      if (streamType === 'audio' && accessType !== 'private' && !isPartner) {
        return errorResponse('PARTNER_REQUIRED', '공개 음성방은 파트너만 만들 수 있습니다');
      }

      // 방 생성 데이터
      // 비디오 방송은 scheduled 상태로 시작 (리허설 후 방송 시작)
      // 오디오 방송은 바로 live 상태로 시작
      // NOTE: DB에 rehearsal enum이 추가되면 'scheduled' → 'rehearsal'로 변경
      const initialStatus = streamType === 'video' ? 'scheduled' : 'live';
      const insertData: Record<string, unknown> = {
        title,
        description: body.description?.trim() || null,
        stream_type: streamType,
        // 비디오 방송은 HLS 전용, 오디오 방송은 WebRTC
        broadcast_type: streamType === 'video' ? 'hls' : 'webrtc',
        video_mode: streamType === 'video' ? '1_n' : null,
        access_type: accessType,
        password: accessType === 'private' ? password : null,
        max_participants: Math.min(Math.max(maxParticipants, 1), 10),
        category_id: categoryId || null,
        thumbnail_url: body.thumbnail_url || null,
        status: initialStatus,
        started_at: streamType === 'video' ? null : new Date().toISOString(),
      };

      // 호스트 설정
      if (isPartner) {
        insertData.host_partner_id = partner.id;
      } else {
        insertData.host_member_id = user.id;
      }

      // 방 생성
      const { data: room, error: roomError } = await supabase
        .from('stream_rooms')
        .insert(insertData)
        .select('id')
        .single();

      if (roomError) {
        console.error('Room creation error:', roomError);
        console.error('Insert data was:', JSON.stringify(insertData, null, 2));
        return errorResponse('CREATE_FAILED', `방 생성에 실패했습니다: ${roomError.message}`, roomError.details || roomError.hint);
      }

      // 방장을 호스트 목록에 추가
      const hostData: Record<string, unknown> = {
        room_id: room.id,
        role: 'owner',
      };

      if (isPartner) {
        hostData.partner_id = partner.id;
      } else {
        hostData.member_id = user.id;
      }

      await supabase.from('stream_hosts').insert(hostData);

      return successResponse({ 
        room_id: room.id,
        message: '방이 생성되었습니다'
      });
    }

    // ========== POST /api-stream/rooms/:roomId/join - 방 입장 ==========
    const joinMatch = pathname.match(/^\/api-stream\/rooms\/([^\/]+)\/join$/);
    if (joinMatch && req.method === 'POST') {
      const roomId = joinMatch[1];
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req) as JoinStreamRoomBody;

      // 방 정보 조회
      const { data: room, error: roomError } = await supabase
        .from('stream_rooms')
        .select('*, host_partner:partners!stream_rooms_host_partner_id_fkey(id, member_id)')
        .eq('id', roomId)
        .single();

      if (roomError || !room) {
        return errorResponse('ROOM_NOT_FOUND', '방을 찾을 수 없습니다', null, 404);
      }

      if (room.status === 'ended') {
        return errorResponse('ROOM_ENDED', '종료된 방입니다');
      }

      // 리허설(scheduled) 상태인 경우 호스트만 입장 가능
      if (room.status === 'scheduled') {
        const isHost = room.host_member_id === user.id || 
                       room.host_partner?.member_id === user.id;
        if (!isHost) {
          return errorResponse('ROOM_REHEARSAL', '아직 방송이 시작되지 않았습니다');
        }
      }

      if (room.is_hidden) {
        return errorResponse('ROOM_HIDDEN', '숨김 처리된 방입니다');
      }

      // 관리자 권한 확인
      const { data: memberData, error: memberError } = await supabase
        .from('members')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      
      const isAdmin = !memberError && memberData?.role === 'admin';

      // 비공개방 비밀번호 검증
      if (room.access_type === 'private') {
        // 호스트 본인 또는 관리자는 비밀번호 없이 입장 가능
        const isHost = room.host_member_id === user.id || 
                       room.host_partner?.member_id === user.id;

        if (!isHost && !isAdmin) {
          // 초대 받은 사용자인지 확인
          const { data: invite } = await supabase
            .from('stream_room_invites')
            .select('id')
            .eq('room_id', roomId)
            .eq('invited_member_id', user.id)
            .eq('status', 'accepted')
            .maybeSingle();

          if (!invite) {
            // 비밀번호 검증
            const inputPassword = body?.password?.trim() || '';
            const roomPassword = room.password?.trim() || '';
            
            if (!inputPassword) {
              return errorResponse('PASSWORD_REQUIRED', '비밀번호를 입력해주세요');
            }

            if (inputPassword !== roomPassword) {
              return errorResponse('WRONG_PASSWORD', '비밀번호가 틀렸습니다', null, 401);
            }
          }
        }
      }

      // 구독자 전용방 검증
      if (room.access_type === 'subscriber') {
        console.log('[joinRoom] 구독자 전용방 검증 시작:', {
          roomId,
          userId: user.id,
          hostMemberId: room.host_member_id,
          hostPartnerId: room.host_partner_id,
          hostPartnerMemberId: room.host_partner?.member_id,
          isAdmin
        });

        // 호스트 본인 또는 관리자는 구독 확인 불필요
        const isHost = room.host_member_id === user.id || 
                       room.host_partner?.member_id === user.id;

        console.log('[joinRoom] 호스트/관리자 확인:', { isHost, isAdmin });

        if (!isHost && !isAdmin) {
          // 호스트 파트너 ID 확인
          const hostPartnerId = room.host_partner_id;
          
          if (!hostPartnerId) {
            return errorResponse('INVALID_ROOM', '구독자 전용방은 파트너만 생성할 수 있습니다');
          }

          // 해당 파트너의 활성 멤버십 목록 조회
          console.log('[joinRoom] 구독 확인 시작:', { 
            userId: user.id, 
            hostPartnerId, 
            roomId 
          });

          const { data: membershipList, error: membershipError } = await supabase
            .from('membership')
            .select('id, partner_id, is_active')
            .eq('partner_id', hostPartnerId)
            .eq('is_active', true);

          console.log('[joinRoom] 멤버십 조회 결과:', { 
            membershipList, 
            error: membershipError,
            count: membershipList?.length || 0
          });

          if (membershipError) {
            console.error('[joinRoom] 멤버십 조회 실패:', membershipError);
            return errorResponse('SUBSCRIPTION_CHECK_FAILED', '구독 여부 확인에 실패했습니다');
          }

          // 활성 멤버십이 없으면 구독자 전용방이 아님
          if (!membershipList || membershipList.length === 0) {
            console.log('[joinRoom] 활성 멤버십 없음:', { hostPartnerId });
            return errorResponse('NO_MEMBERSHIP', '구독자 전용방이지만 멤버십이 설정되지 않았습니다');
          }

          const membershipIds = membershipList.map((m: any) => m.id);

          if (membershipIds.length === 0) {
            console.error('[joinRoom] 멤버십 ID 목록이 비어있음:', { hostPartnerId, membershipList });
            return errorResponse('NO_MEMBERSHIP', '구독자 전용방이지만 멤버십이 설정되지 않았습니다');
          }

          console.log('[joinRoom] 구독 조회 쿼리:', { 
            userId: user.id, 
            membershipIds 
          });

          // 현재 유저가 해당 파트너의 멤버십을 구독 중인지 확인
          // 다른 API와 동일하게 status = 'active'만 확인 (expired_at은 확인하지 않음)
          // expired_at은 cron job에서 자동으로 status를 'inactive'로 변경하므로
          // status = 'active'인 구독은 모두 유효한 구독으로 간주
          const { data: subscription, error: subscriptionError } = await supabase
            .from('membership_subscriptions')
            .select('id, status, membership_id, user_id')
            .eq('user_id', user.id)
            .in('membership_id', membershipIds)
            .eq('status', 'active');

          console.log('[joinRoom] 구독 조회 결과:', { 
            subscription, 
            error: subscriptionError,
            count: subscription?.length || 0,
            subscriptionData: subscription
          });

          if (subscriptionError) {
            console.error('[joinRoom] 구독 조회 실패:', subscriptionError);
            return errorResponse('SUBSCRIPTION_CHECK_FAILED', '구독 여부 확인에 실패했습니다');
          }

          // maybeSingle() 대신 배열로 조회했으므로 첫 번째 구독 확인
          const hasSubscription = subscription && subscription.length > 0;

          console.log('[joinRoom] 구독 여부 최종 확인:', { 
            hasSubscription, 
            subscriptionCount: subscription?.length || 0 
          });

          if (!hasSubscription) {
            // 디버깅: 사용자의 모든 구독 조회
            const { data: allSubscriptions } = await supabase
              .from('membership_subscriptions')
              .select('id, status, membership_id, membership:membership_id(partner_id)')
              .eq('user_id', user.id)
              .eq('status', 'active');
            
            console.log('[joinRoom] 사용자의 모든 활성 구독:', { 
              allSubscriptions,
              count: allSubscriptions?.length || 0
            });

            return errorResponse('SUBSCRIPTION_REQUIRED', '구독자만 입장할 수 있는 방입니다', null, 403);
          }
        }
      }

      // 이미 입장했는지 확인
      const { data: existingViewer } = await supabase
        .from('stream_viewers')
        .select('id, left_at')
        .eq('room_id', roomId)
        .eq('member_id', user.id)
        .maybeSingle();

      if (existingViewer) {
        if (!existingViewer.left_at) {
          // 이미 참가 중
          return successResponse({ 
            viewer_id: existingViewer.id,
            message: '이미 참가 중입니다'
          });
        }

        // 재입장: left_at을 null로 업데이트
        const { error: updateError } = await supabase
          .from('stream_viewers')
          .update({ left_at: null, joined_at: new Date().toISOString() })
          .eq('id', existingViewer.id);

        if (updateError) {
          return errorResponse('JOIN_FAILED', '입장에 실패했습니다', updateError.message);
        }

        return successResponse({ 
          viewer_id: existingViewer.id,
          message: '방에 재입장했습니다'
        });
      }

      // 신규 입장
      const { data: viewer, error: viewerError } = await supabase
        .from('stream_viewers')
        .insert({
          room_id: roomId,
          member_id: user.id,
        })
        .select('id')
        .single();

      if (viewerError) {
        console.error('Join error:', viewerError);
        return errorResponse('JOIN_FAILED', '입장에 실패했습니다', viewerError.message);
      }

      return successResponse({ 
        viewer_id: viewer.id,
        message: '방에 입장했습니다'
      });
    }

    // ========== POST /api-stream/rooms/:roomId/leave - 방 퇴장 ==========
    const leaveMatch = pathname.match(/^\/api-stream\/rooms\/([^\/]+)\/leave$/);
    if (leaveMatch && req.method === 'POST') {
      const roomId = leaveMatch[1];
      const user = await getAuthUser(req);

      // 시청자 기록 업데이트
      const { error: viewerError } = await supabase
        .from('stream_viewers')
        .update({ left_at: new Date().toISOString() })
        .eq('room_id', roomId)
        .eq('member_id', user.id)
        .is('left_at', null);

      // 호스트/발언자 기록 업데이트
      const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', user.id)
        .maybeSingle();

      if (partner) {
        await supabase
          .from('stream_hosts')
          .update({ left_at: new Date().toISOString() })
          .eq('room_id', roomId)
          .eq('partner_id', partner.id)
          .is('left_at', null);
      } else {
        await supabase
          .from('stream_hosts')
          .update({ left_at: new Date().toISOString() })
          .eq('room_id', roomId)
          .eq('member_id', user.id)
          .is('left_at', null);
      }

      return successResponse({ message: '방에서 퇴장했습니다' });
    }

    // ========== POST /api-stream/rooms/:roomId/heartbeat - 호스트 하트비트 ==========
    const heartbeatMatch = pathname.match(/^\/api-stream\/rooms\/([^\/]+)\/heartbeat$/);
    if (heartbeatMatch && req.method === 'POST') {
      const roomId = heartbeatMatch[1];
      const user = await getAuthUser(req);

      // 방 정보 조회
      const { data: room, error: roomError } = await supabase
        .from('stream_rooms')
        .select('id, status, host_member_id, host_partner:partners!stream_rooms_host_partner_id_fkey(id, member_id)')
        .eq('id', roomId)
        .single();

      if (roomError || !room) {
        return errorResponse('ROOM_NOT_FOUND', '방을 찾을 수 없습니다', null, 404);
      }

      // 호스트 권한 검증
      const isHost = room.host_member_id === user.id || 
                     room.host_partner?.member_id === user.id;

      if (!isHost) {
        return errorResponse('NOT_HOST', '호스트만 하트비트를 전송할 수 있습니다', null, 403);
      }

      // scheduled(리허설) 또는 live 상태에서만 하트비트 가능
      if (room.status !== 'live' && room.status !== 'scheduled') {
        return errorResponse('NOT_LIVE', '방송 중이 아닙니다');
      }

      // 하트비트 업데이트
      const { error: updateError } = await supabase
        .from('stream_rooms')
        .update({ last_heartbeat: new Date().toISOString() })
        .eq('id', roomId);

      if (updateError) {
        return errorResponse('UPDATE_FAILED', '하트비트 업데이트에 실패했습니다', updateError.message);
      }

      return successResponse({ message: '하트비트 수신됨' });
    }

    // ========== POST /api-stream/rooms/:roomId/viewer-heartbeat - 시청자 하트비트 ==========
    const viewerHeartbeatMatch = pathname.match(/^\/api-stream\/rooms\/([^\/]+)\/viewer-heartbeat$/);
    if (viewerHeartbeatMatch && req.method === 'POST') {
      const roomId = viewerHeartbeatMatch[1];
      const user = await getAuthUser(req);

      // 시청자 Heartbeat 업데이트
      const { data: updated, error: updateError } = await supabase
        .from('stream_viewers')
        .update({ last_heartbeat: new Date().toISOString() })
        .eq('room_id', roomId)
        .eq('member_id', user.id)
        .is('left_at', null)
        .select('id')
        .maybeSingle();

      if (updateError) {
        return errorResponse('UPDATE_FAILED', 'Heartbeat 업데이트에 실패했습니다', updateError.message);
      }

      if (!updated) {
        return errorResponse('NOT_IN_ROOM', '해당 방에 입장하지 않았습니다', null, 404);
      }

      return successResponse({ 
        timestamp: new Date().toISOString(),
        message: 'Heartbeat 수신됨' 
      });
    }

    // ========== POST /api-stream/rooms/:roomId/start - 방송 시작 (rehearsal → live) ==========
    const startMatch = pathname.match(/^\/api-stream\/rooms\/([^\/]+)\/start$/);
    if (startMatch && req.method === 'POST') {
      const roomId = startMatch[1];
      const user = await getAuthUser(req);

      // 방 정보 조회
      const { data: room, error: roomError } = await supabase
        .from('stream_rooms')
        .select('*, host_partner:partners!stream_rooms_host_partner_id_fkey(id, member_id)')
        .eq('id', roomId)
        .single();

      if (roomError || !room) {
        return errorResponse('ROOM_NOT_FOUND', '방을 찾을 수 없습니다', null, 404);
      }

      // 호스트 권한 검증
      const isHost = room.host_member_id === user.id || 
                     room.host_partner?.member_id === user.id;

      if (!isHost) {
        return errorResponse('NOT_HOST', '방장만 방송을 시작할 수 있습니다', null, 403);
      }

      // scheduled 상태 = 리허설 상태 (DB에 rehearsal enum 추가 전까지)
      if (room.status !== 'scheduled') {
        return errorResponse('INVALID_STATUS', '리허설 상태에서만 방송을 시작할 수 있습니다');
      }

      // 방송 시작 (status를 live로 변경)
      const { error: startError } = await supabase
        .from('stream_rooms')
        .update({ 
          status: 'live',
          started_at: new Date().toISOString(),
        })
        .eq('id', roomId);

      if (startError) {
        return errorResponse('START_FAILED', '방송 시작에 실패했습니다', startError.message);
      }

      return successResponse({ message: '방송이 시작되었습니다' });
    }

    // ========== POST /api-stream/rooms/:roomId/end - 방 종료 ==========
    const endMatch = pathname.match(/^\/api-stream\/rooms\/([^\/]+)\/end$/);
    if (endMatch && req.method === 'POST') {
      const roomId = endMatch[1];
      const user = await getAuthUser(req);

      // 방 정보 조회
      const { data: room, error: roomError } = await supabase
        .from('stream_rooms')
        .select('*, host_partner:partners!stream_rooms_host_partner_id_fkey(id, member_id)')
        .eq('id', roomId)
        .single();

      if (roomError || !room) {
        return errorResponse('ROOM_NOT_FOUND', '방을 찾을 수 없습니다', null, 404);
      }

      // 관리자 권한 확인
      const { data: memberData, error: memberError } = await supabase
        .from('members')
        .select('role')
        .eq('id', user.id)
        .single();

      const isAdmin = !memberError && memberData?.role === 'admin';

      // 호스트 권한 검증
      const isHost = room.host_member_id === user.id || 
                     room.host_partner?.member_id === user.id;

      // 호스트 또는 관리자만 방을 종료할 수 있음
      if (!isHost && !isAdmin) {
        return errorResponse('NOT_AUTHORIZED', '방장 또는 관리자만 방을 종료할 수 있습니다', null, 403);
      }

      if (room.status === 'ended') {
        return errorResponse('ALREADY_ENDED', '이미 종료된 방입니다');
      }

      // rehearsal 상태에서도 종료 가능

      // 방 종료
      const { error: endError } = await supabase
        .from('stream_rooms')
        .update({ 
          status: 'ended',
          ended_at: new Date().toISOString(),
          ended_by: user.id
        })
        .eq('id', roomId);

      if (endError) {
        return errorResponse('END_FAILED', '방 종료에 실패했습니다', endError.message);
      }

      // 모든 참가자 퇴장 처리
      await supabase
        .from('stream_viewers')
        .update({ left_at: new Date().toISOString() })
        .eq('room_id', roomId)
        .is('left_at', null);

      await supabase
        .from('stream_hosts')
        .update({ left_at: new Date().toISOString() })
        .eq('room_id', roomId)
        .is('left_at', null);

      return successResponse({ message: '방이 종료되었습니다' });
    }

    // ========== PATCH /api-stream/rooms/:roomId/settings - 방 설정 수정 ==========
    const settingsMatch = pathname.match(/^\/api-stream\/rooms\/([^\/]+)\/settings$/);
    if (settingsMatch && req.method === 'PATCH') {
      const roomId = settingsMatch[1];
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      // 방 정보 조회
      const { data: room, error: roomError } = await supabase
        .from('stream_rooms')
        .select('*, host_partner:partners!stream_rooms_host_partner_id_fkey(id, member_id)')
        .eq('id', roomId)
        .single();

      if (roomError || !room) {
        return errorResponse('ROOM_NOT_FOUND', '방을 찾을 수 없습니다', null, 404);
      }

      // 관리자 권한 확인
      const { data: memberData } = await supabase
        .from('members')
        .select('role')
        .eq('id', user.id)
        .single();

      const isAdmin = memberData?.role === 'admin';

      // 호스트 권한 검증
      const isHost = room.host_member_id === user.id || 
                     room.host_partner?.member_id === user.id;

      if (!isHost && !isAdmin) {
        return errorResponse('NOT_AUTHORIZED', '방장 또는 관리자만 설정을 수정할 수 있습니다', null, 403);
      }

      if (room.status === 'ended') {
        return errorResponse('ROOM_ENDED', '종료된 방은 설정을 수정할 수 없습니다');
      }

      // 수정 가능한 필드 정의
      const allowedFields = [
        'title', 'description', 'category_id', 'access_type', 
        'password', 'chat_mode', 'thumbnail_url', 'tags'
      ];

      // 업데이트 데이터 구성
      const updateData: Record<string, unknown> = {};

      // 제목 검증
      if (body.title !== undefined) {
        const title = String(body.title).trim();
        if (!title || title.length < 1 || title.length > 50) {
          return errorResponse('INVALID_TITLE', '제목은 1~50자 사이여야 합니다');
        }
        updateData.title = title;
      }

      // 설명 검증
      if (body.description !== undefined) {
        const description = body.description ? String(body.description).trim() : null;
        if (description && description.length > 200) {
          return errorResponse('INVALID_DESCRIPTION', '설명은 200자 이하여야 합니다');
        }
        updateData.description = description;
      }

      // 카테고리 검증
      if (body.category_id !== undefined) {
        if (body.category_id !== null) {
          const { data: category } = await supabase
            .from('stream_categories')
            .select('id')
            .eq('id', body.category_id)
            .single();
          
          if (!category) {
            return errorResponse('INVALID_CATEGORY', '유효하지 않은 카테고리입니다');
          }
        }
        updateData.category_id = body.category_id;
      }

      // 접근 유형 검증
      if (body.access_type !== undefined) {
        const validAccessTypes = ['public', 'private', 'subscriber'];
        if (!validAccessTypes.includes(body.access_type)) {
          return errorResponse('INVALID_ACCESS_TYPE', '유효하지 않은 접근 유형입니다');
        }
        updateData.access_type = body.access_type;

        // 비공개로 변경 시 비밀번호 필수
        if (body.access_type === 'private') {
          const password = body.password || room.password;
          if (!password || password.length < 4) {
            return errorResponse('PASSWORD_REQUIRED', '비공개 방은 4자리 이상 비밀번호가 필요합니다');
          }
          updateData.password = body.password || room.password;
        } else {
          // 공개/구독자 전용으로 변경 시 비밀번호 제거
          updateData.password = null;
        }
      }

      // 비밀번호 단독 변경 (access_type이 private인 경우만)
      if (body.password !== undefined && body.access_type === undefined) {
        if (room.access_type === 'private') {
          if (!body.password || body.password.length < 4) {
            return errorResponse('INVALID_PASSWORD', '비밀번호는 4자리 이상이어야 합니다');
          }
          updateData.password = body.password;
        }
      }

      // 채팅 모드 검증
      if (body.chat_mode !== undefined) {
        const validChatModes = ['all', 'subscriber', 'disabled'];
        if (!validChatModes.includes(body.chat_mode)) {
          return errorResponse('INVALID_CHAT_MODE', '유효하지 않은 채팅 모드입니다');
        }
        updateData.chat_mode = body.chat_mode;
      }

      // 썸네일 URL
      if (body.thumbnail_url !== undefined) {
        updateData.thumbnail_url = body.thumbnail_url;
      }

      // 태그
      if (body.tags !== undefined) {
        if (body.tags !== null && !Array.isArray(body.tags)) {
          return errorResponse('INVALID_TAGS', '태그는 배열이어야 합니다');
        }
        updateData.tags = body.tags;
      }

      // 업데이트할 내용이 없으면 에러
      if (Object.keys(updateData).length === 0) {
        return errorResponse('NO_CHANGES', '수정할 내용이 없습니다');
      }

      // 업데이트 시간 추가
      updateData.updated_at = new Date().toISOString();

      // 방 설정 업데이트
      const { error: updateError } = await supabase
        .from('stream_rooms')
        .update(updateData)
        .eq('id', roomId);

      if (updateError) {
        console.error('Failed to update room settings:', updateError);
        return errorResponse('UPDATE_FAILED', '설정 수정에 실패했습니다', updateError.message);
      }

      // 업데이트된 방 정보 조회
      const { data: updatedRoom } = await supabase
        .from('stream_rooms')
        .select(`
          id, title, description, access_type, chat_mode, thumbnail_url, tags,
          category:stream_categories(id, name, slug)
        `)
        .eq('id', roomId)
        .single();

      return successResponse({ 
        message: '설정이 수정되었습니다',
        room: updatedRoom
      });
    }

    // ========== GET /api-stream/rooms/:roomId - 방 상세 조회 ==========
    const detailMatch = pathname.match(/^\/api-stream\/rooms\/([^\/]+)$/);
    if (detailMatch && req.method === 'GET') {
      const roomId = detailMatch[1];

      const { data: room, error: roomError } = await supabase
        .from('stream_rooms')
        .select(`
          id, title, description, stream_type, access_type, status,
          viewer_count, total_viewers, max_participants, tags,
          started_at, ended_at, created_at,
          category:stream_categories(id, name, slug),
          host_partner:partners!stream_rooms_host_partner_id_fkey(
            id, partner_name,
            member:members(id, name, profile_image)
          ),
          host_member:members!stream_rooms_host_member_id_fkey(id, name, profile_image)
        `)
        .eq('id', roomId)
        .eq('is_hidden', false)
        .single();

      if (roomError || !room) {
        return errorResponse('ROOM_NOT_FOUND', '방을 찾을 수 없습니다', null, 404);
      }

      // 비밀번호 필드 제거
      return successResponse(room);
    }

    // ========== GET /api-stream/rooms - 방 목록 조회 ==========
    if (pathname === '/api-stream/rooms' && req.method === 'GET') {
      const params = getQueryParams(req.url);
      const status = params.status || 'live';
      const streamType = params.stream_type;
      const limit = Math.min(parseInt(params.limit || '20'), 50);
      const offset = parseInt(params.offset || '0');

      let query = supabase
        .from('stream_rooms')
        .select(`
          id, title, description, stream_type, access_type, status,
          viewer_count, total_viewers, thumbnail_url, tags,
          started_at, created_at,
          category:stream_categories(id, name, slug),
          host_partner:partners!stream_rooms_host_partner_id_fkey(
            id, partner_name,
            member:members(id, name, profile_image)
          ),
          host_member:members!stream_rooms_host_member_id_fkey(id, name, profile_image)
        `)
        .eq('is_hidden', false)
        .order('started_at', { ascending: false })
        .range(offset, offset + limit - 1);

      // 상태 필터
      // scheduled 상태(리허설)는 목록에서 제외 (호스트만 접근 가능)
      if (status !== 'all') {
        query = query.eq('status', status);
      } else {
        // 'all' 조회 시 scheduled(리허설) 상태는 제외 - live와 ended만 표시
        query = query.in('status', ['live', 'ended']);
      }

      if (streamType && streamType !== 'all') {
        query = query.eq('stream_type', streamType);
      }

      const { data: rooms, error: roomsError } = await query;

      if (roomsError) {
        return errorResponse('FETCH_FAILED', '목록 조회에 실패했습니다', roomsError.message);
      }

      return successResponse(rooms || []);
    }

    // ========== POST /api-stream/donation - 방송 후원 (미션 escrow 처리 포함) ==========
    if (pathname === '/api-stream/donation' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body || !body.partner_id || !body.amount) {
        return errorResponse('INVALID_BODY', 'Partner ID and amount are required');
      }

      const { partner_id, amount, description, log_id, donation_type, room_id } = body;
      const donationAmount = parseInt(amount, 10);

      // donation_type 검증
      const validatedDonationType = validateDonationType(donation_type);
      if (validatedDonationType === null) {
        return errorResponse('INVALID_DONATION_TYPE', '유효하지 않은 후원 타입입니다.');
      }

      // 금액 검증
      const amountValidationError = validateDonationAmount(donationAmount);
      if (amountValidationError) {
        return amountValidationError;
      }

      try {
        // 고유한 log_id 생성 (중복 요청 방지)
        const donationLogId = log_id || `stream_donation_${room_id || 'unknown'}_${partner_id}_${user.id}_${Date.now()}`;

        // RPC 함수 호출 (원자적 트랜잭션)
        const result = await processDonationRpc(supabase, {
          donorId: user.id,
          partnerId: partner_id,
          amount: donationAmount,
          description: description || '스트림 후원',
          logId: donationLogId,
          donationType: validatedDonationType,
        });

        // RPC 에러 처리
        const rpcErrorResponse = handleDonationRpcError(result);
        if (rpcErrorResponse) {
          return rpcErrorResponse;
        }

        return createDonationSuccessResponse(result, true);

      } catch (error) {
        console.error('Stream donation error:', error);
        return errorResponse(
          'DONATION_ERROR',
          'Failed to process stream donation',
          {
            message: error.message,
            ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
          }
        );
      }
    }

    // ========== PATCH /api-stream/rooms/:roomId/thumbnail - 썸네일 업데이트 ==========
    const thumbnailUpdateMatch = pathname.match(/^\/api-stream\/rooms\/([^\/]+)\/thumbnail$/);
    if (thumbnailUpdateMatch && req.method === 'PATCH') {
      const roomId = thumbnailUpdateMatch[1];
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req) as { thumbnail_url: string };

      if (!body?.thumbnail_url) {
        return errorResponse('INVALID_URL', '썸네일 URL이 필요합니다');
      }

      // 방 정보 조회
      const { data: room, error: roomError } = await supabase
        .from('stream_rooms')
        .select('id, status, host_member_id, host_partner:partners!stream_rooms_host_partner_id_fkey(id, member_id)')
        .eq('id', roomId)
        .single();

      if (roomError || !room) {
        return errorResponse('ROOM_NOT_FOUND', '방을 찾을 수 없습니다', null, 404);
      }

      // 호스트 권한 검증
      const isHost = room.host_member_id === user.id || 
                     room.host_partner?.member_id === user.id;

      if (!isHost) {
        return errorResponse('NOT_HOST', '호스트만 썸네일을 변경할 수 있습니다', null, 403);
      }

      // 방 상태 확인 (scheduled 또는 live 상태에서만 변경 가능)
      if (room.status === 'ended') {
        return errorResponse('ROOM_ENDED', '종료된 방의 썸네일은 변경할 수 없습니다');
      }

      // 썸네일 업데이트
      const { error: updateError } = await supabase
        .from('stream_rooms')
        .update({ thumbnail_url: body.thumbnail_url })
        .eq('id', roomId);

      if (updateError) {
        return errorResponse('UPDATE_FAILED', '썸네일 업데이트에 실패했습니다', updateError.message);
      }

      return successResponse({ 
        thumbnail_url: body.thumbnail_url,
        message: '썸네일이 업데이트되었습니다'
      });
    }

    // ========== DELETE /api-stream/rooms/:roomId/thumbnail - 썸네일 삭제 ==========
    if (thumbnailUpdateMatch && req.method === 'DELETE') {
      const roomId = thumbnailUpdateMatch[1];
      const user = await getAuthUser(req);

      // 방 정보 조회
      const { data: room, error: roomError } = await supabase
        .from('stream_rooms')
        .select('id, status, thumbnail_url, host_member_id, host_partner:partners!stream_rooms_host_partner_id_fkey(id, member_id)')
        .eq('id', roomId)
        .single();

      if (roomError || !room) {
        return errorResponse('ROOM_NOT_FOUND', '방을 찾을 수 없습니다', null, 404);
      }

      // 호스트 권한 검증
      const isHost = room.host_member_id === user.id || 
                     room.host_partner?.member_id === user.id;

      if (!isHost) {
        return errorResponse('NOT_HOST', '호스트만 썸네일을 삭제할 수 있습니다', null, 403);
      }

      // 방 상태 확인 (scheduled 또는 live 상태에서만 변경 가능)
      if (room.status === 'ended') {
        return errorResponse('ROOM_ENDED', '종료된 방의 썸네일은 삭제할 수 없습니다');
      }

      // 썸네일 삭제 (thumbnail_url을 null로 업데이트)
      const { error: updateError } = await supabase
        .from('stream_rooms')
        .update({ thumbnail_url: null })
        .eq('id', roomId);

      if (updateError) {
        return errorResponse('DELETE_FAILED', '썸네일 삭제에 실패했습니다', updateError.message);
      }

      // Storage에서 파일 삭제 (선택사항 - URL에서 경로 추출)
      if (room.thumbnail_url) {
        try {
          // URL에서 경로 추출 (예: https://xxx.supabase.co/storage/v1/object/public/stream-thumbnails/room-id/file.jpg)
          const url = new URL(room.thumbnail_url);
          const pathParts = url.pathname.split('/');
          const filePath = pathParts.slice(pathParts.indexOf('stream-thumbnails') + 1).join('/');
          
          if (filePath) {
            await supabase.storage
              .from('stream-thumbnails')
              .remove([filePath]);
          }
        } catch (storageError) {
          // Storage 삭제 실패는 로그만 남기고 계속 진행 (DB는 이미 업데이트됨)
          console.warn('Storage 파일 삭제 실패 (무시됨):', storageError);
        }
      }

      return successResponse({ 
        message: '썸네일이 삭제되었습니다'
      });
    }

    // ========== POST /api-stream/keys/generate - 스트림 키 생성 ==========
    if (pathname === '/api-stream/keys/generate' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);
      const partnerId = body?.partnerId;

      if (!partnerId) {
        return errorResponse('MISSING_PARTNER_ID', 'Partner ID is required');
      }

      // 파트너 권한 확인
      const { data: partner, error: partnerError } = await supabase
        .from('partners')
        .select('id, member_id, partner_status')
        .eq('id', partnerId)
        .single();

      if (partnerError || !partner) {
        return errorResponse('PARTNER_NOT_FOUND', '파트너를 찾을 수 없습니다', null, 404);
      }

      if (partner.member_id !== user.id) {
        return errorResponse('NOT_AUTHORIZED', '본인의 스트림 키만 생성할 수 있습니다', null, 403);
      }

      if (partner.partner_status !== 'approved') {
        return errorResponse('PARTNER_NOT_APPROVED', '승인된 파트너만 스트림 키를 생성할 수 있습니다');
      }

      // 기존 비활성 키 삭제 (유니크 제약조건 충돌 방지)
      // 제약조건: (partner_id, is_active) UNIQUE - 비활성 키도 1개만 허용됨
      await supabase
        .from('mt_live_stream_keys')
        .delete()
        .eq('partner_id', partnerId)
        .eq('is_active', false);

      // 스트림 키 생성 (RPC 함수 호출)
      const { data: streamKey, error: keyError } = await supabase
        .rpc('mt_live_generate_stream_key', { p_partner_id: partnerId });

      if (keyError) {
        console.error('Stream key generation error:', keyError);
        return errorResponse('GENERATION_FAILED', '스트림 키 생성에 실패했습니다', keyError.message);
      }

      return successResponse({
        stream_key: streamKey,
        rtmp_url: 'rtmp://stream.mateyou.me:1935/live',
        message: '스트림 키가 생성되었습니다',
      });
    }

    // ========== POST /api-stream/keys/refresh - 스트림 키 재발급 ==========
    if (pathname === '/api-stream/keys/refresh' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);
      const partnerId = body?.partnerId;

      if (!partnerId) {
        return errorResponse('MISSING_PARTNER_ID', 'Partner ID is required');
      }

      // 파트너 권한 확인
      const { data: partner, error: partnerError } = await supabase
        .from('partners')
        .select('id, member_id')
        .eq('id', partnerId)
        .single();

      if (partnerError || !partner) {
        return errorResponse('PARTNER_NOT_FOUND', '파트너를 찾을 수 없습니다', null, 404);
      }

      if (partner.member_id !== user.id) {
        return errorResponse('NOT_AUTHORIZED', '본인의 스트림 키만 재발급할 수 있습니다', null, 403);
      }

      // 기존 비활성 키 삭제 (유니크 제약조건 충돌 방지)
      // 제약조건: (partner_id, is_active) UNIQUE - 비활성 키도 1개만 허용됨
      await supabase
        .from('mt_live_stream_keys')
        .delete()
        .eq('partner_id', partnerId)
        .eq('is_active', false);

      // 기존 키 비활성화 후 새 키 생성 (RPC 함수 호출)
      const { data: streamKey, error: keyError } = await supabase
        .rpc('mt_live_generate_stream_key', { p_partner_id: partnerId });

      if (keyError) {
        console.error('Stream key refresh error:', keyError);
        return errorResponse('REFRESH_FAILED', '스트림 키 재발급에 실패했습니다', keyError.message);
      }

      return successResponse({
        stream_key: streamKey,
        rtmp_url: 'rtmp://stream.mateyou.me:1935/live',
        message: '스트림 키가 재발급되었습니다. 기존 키는 더 이상 사용할 수 없습니다.',
      });
    }

    // ========== GET /api-stream/keys/:partnerId - 스트림 키 조회 ==========
    const keyMatch = pathname.match(/^\/api-stream\/keys\/([^\/]+)$/);
    if (keyMatch && req.method === 'GET') {
      const partnerId = keyMatch[1];
      const user = await getAuthUser(req);

      // 파트너 권한 확인
      const { data: partner, error: partnerError } = await supabase
        .from('partners')
        .select('id, member_id')
        .eq('id', partnerId)
        .single();

      if (partnerError || !partner) {
        return errorResponse('PARTNER_NOT_FOUND', '파트너를 찾을 수 없습니다', null, 404);
      }

      if (partner.member_id !== user.id) {
        return errorResponse('NOT_AUTHORIZED', '본인의 스트림 키만 조회할 수 있습니다', null, 403);
      }

      // 활성 스트림 키 조회
      const { data: streamKey, error: keyError } = await supabase
        .from('mt_live_stream_keys')
        .select('id, stream_key, created_at, last_used_at, use_count')
        .eq('partner_id', partnerId)
        .eq('is_active', true)
        .maybeSingle();

      if (keyError) {
        return errorResponse('FETCH_FAILED', '스트림 키 조회에 실패했습니다', keyError.message);
      }

      return successResponse({
        has_key: !!streamKey,
        stream_key: streamKey?.stream_key || null,
        rtmp_url: 'rtmp://stream.mateyou.me:1935/live',
        created_at: streamKey?.created_at || null,
        last_used_at: streamKey?.last_used_at || null,
        use_count: streamKey?.use_count || 0,
      });
    }

    // ========== POST /api-stream/session/start - 방송 세션 시작 (임시 토큰 발급) ==========
    if (pathname === '/api-stream/session/start' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);
      const partnerId = body?.partnerId;

      if (!partnerId) {
        return errorResponse('MISSING_PARTNER_ID', 'Partner ID is required');
      }

      // 파트너 권한 확인
      const { data: partner, error: partnerError } = await supabase
        .from('partners')
        .select('id, member_id, partner_status')
        .eq('id', partnerId)
        .single();

      if (partnerError || !partner) {
        return errorResponse('PARTNER_NOT_FOUND', '파트너를 찾을 수 없습니다', null, 404);
      }

      if (partner.member_id !== user.id) {
        return errorResponse('NOT_AUTHORIZED', '본인의 방송 세션만 시작할 수 있습니다', null, 403);
      }

      // 세션 토큰 생성 (RPC 함수 호출)
      const { data: sessionData, error: sessionError } = await supabase
        .rpc('mt_live_create_stream_session', { p_partner_id: partnerId });

      if (sessionError) {
        console.error('Stream session creation error:', sessionError);
        return errorResponse('SESSION_FAILED', '방송 세션 시작에 실패했습니다', sessionError.message);
      }

      if (!sessionData || sessionData.length === 0) {
        return errorResponse('NO_STREAM_KEY', '먼저 스트림 키를 생성해주세요');
      }

      const session = sessionData[0];

      return successResponse({
        session_token: session.session_token,
        rtmp_url: session.rtmp_url,
        expires_at: session.expires_at,
        message: '방송 세션이 시작되었습니다. 30분 내에 OBS에서 방송을 시작해주세요.',
        // 보안 안내
        security_note: '이 URL은 30분간 유효하며, 한 번만 사용할 수 있습니다.',
      });
    }

    // ========== POST /api-stream/rtmp/auth - RTMP 인증 (Nginx on_publish) ==========
    if (pathname === '/api-stream/rtmp/auth' && req.method === 'POST') {
      // 이 엔드포인트는 Nginx RTMP 모듈에서 호출됨
      // RTMP 모듈은 POST body에 application/x-www-form-urlencoded 형식으로 전달:
      // call=publish&addr=IP&clientid=X&app=live&name=STREAM_KEY&...
      
      let streamToken = req.headers.get('X-Stream-Key') || '';
      let clientIp = req.headers.get('X-Client-IP') || req.headers.get('X-Real-IP') || '';
      let rtmpClientId = '';
      let rtmpApp = '';
      let rtmpCall = '';
      
      // 헤더에 없으면 POST body에서 추출 (RTMP 모듈 방식)
      if (!streamToken) {
        try {
          const bodyText = await req.text();
          const params = new URLSearchParams(bodyText);
          streamToken = params.get('name') || '';
          clientIp = clientIp || params.get('addr') || '';
          rtmpClientId = params.get('clientid') || '';
          rtmpApp = params.get('app') || '';
          rtmpCall = params.get('call') || '';
          console.log('RTMP auth from body:', { 
            streamToken: streamToken.slice(0, 16), 
            clientIp,
            clientid: rtmpClientId,
            call: rtmpCall,
            app: rtmpApp,
          });
        } catch (e) {
          console.error('Failed to parse RTMP body:', e);
        }
      }

      if (!streamToken) {
        console.log('RTMP auth failed: No stream key in header or body');
        return new Response('No stream key or token', { status: 403 });
      }

      // 세션 토큰 또는 스트림 키 검증 (통합 RPC 함수 호출)
      // mt_live_verify_stream_token은 먼저 세션 토큰을 확인하고, 없으면 스트림 키로 검증
      const { data: authResult, error: authError } = await supabase
        .rpc('mt_live_verify_stream_token', { 
          p_token: streamToken, 
          p_client_ip: clientIp || null 
        });

      if (authError) {
        console.error('RTMP auth error:', authError);
        return new Response('Auth failed', { status: 500 });
      }

      if (!authResult || !authResult[0]?.is_valid) {
        const errorMsg = authResult?.[0]?.error_message || 'Invalid stream key or token';
        console.log('RTMP auth denied:', { token: streamToken.slice(0, 12), errorMsg });
        return new Response(errorMsg, { status: 403 });
      }

      console.log('RTMP auth success:', { 
        token: streamToken.slice(0, 12), 
        partnerId: authResult[0].partner_id,
        roomId: authResult[0].room_id,
      });

      // 파트너의 활성 방에 스트림 키 저장 (HLS URL 생성용)
      const partnerId = authResult[0].partner_id;
      if (partnerId) {
        let roomIdForLog: string | null = null;
        
        // 세션 UUID 생성 (CDN 캐시 버스팅용 - 쿼리 파라미터로 사용)
        const hlsSessionId = crypto.randomUUID();
        console.log('Generated HLS session ID:', { partnerId, hlsSessionId });

        // 파트너의 live 또는 scheduled 상태의 방 확인
        const { data: existingRoom } = await supabase
          .from('stream_rooms')
          .select('id, status')
          .eq('host_partner_id', partnerId)
          .eq('stream_type', 'video')
          .in('status', ['live', 'scheduled'])
          .maybeSingle();

        // CDN URL 생성 (스트림 키 경로 + 세션 UUID 쿼리 파라미터로 캐시 버스팅)
        const cdnDomain = Deno.env.get('CDN_DOMAIN') || 'cdn.mateyou.me';
        const publicHlsUrl = `https://${cdnDomain}/hls/${streamToken}/index.m3u8?s=${hlsSessionId}`;

        if (existingRoom) {
          roomIdForLog = existingRoom.id;
          // 기존 방이 있으면 스트림 키와 세션 ID 저장하고 live 상태로 전환
          const { error: updateError } = await supabase
            .from('stream_rooms')
            .update({ 
              stream_key: streamToken,
              hls_session_id: hlsSessionId,
              hls_url: publicHlsUrl,
              broadcast_type: 'hls',
              status: 'live',
              started_at: existingRoom.status === 'scheduled' ? new Date().toISOString() : undefined,
            })
            .eq('id', existingRoom.id);
          
          if (updateError) {
            console.error('Failed to save stream key to room:', updateError);
          } else {
            console.log('Stream key saved with cache-busting URL:', { partnerId, roomId: existingRoom.id, streamKey: streamToken.slice(0, 16), hlsSessionId, publicHlsUrl });
          }
        } else {
          // 기존 방이 없으면 자동으로 방 생성
          // 파트너 정보 조회 (파트너명 + OBS 기본 설정 가져오기)
          const { data: partnerInfo } = await supabase
            .from('partners')
            .select('partner_name, default_stream_title, default_category_id, default_access_type')
            .eq('id', partnerId)
            .single();

          const partnerName = partnerInfo?.partner_name || '파트너';
          const now = new Date();
          
          // 기본 설정 적용 (설정이 없으면 기본값 사용)
          const roomTitle = partnerInfo?.default_stream_title || `${partnerName}님의 방송`;
          const categoryId = partnerInfo?.default_category_id || null;
          const accessType = partnerInfo?.default_access_type || 'public';

          const { data: newRoom, error: createError } = await supabase
            .from('stream_rooms')
            .insert({
              title: roomTitle,
              stream_type: 'video',
              broadcast_type: 'hls',
              access_type: accessType,
              category_id: categoryId,
              max_participants: 10,
              status: 'live',
              started_at: now.toISOString(),
              host_partner_id: partnerId,
              stream_key: streamToken,
              hls_session_id: hlsSessionId,
              hls_url: publicHlsUrl,
            })
            .select('id')
            .single();

          if (createError) {
            console.error('Failed to auto-create room on RTMP auth:', createError);
          } else {
            roomIdForLog = newRoom.id;
            console.log('Auto-created room with cache-busting URL:', { partnerId, roomId: newRoom.id, streamKey: streamToken.slice(0, 16), hlsSessionId, publicHlsUrl });

            // 호스트 참가 기록 추가
            const { data: partnerData } = await supabase
              .from('partners')
              .select('member_id')
              .eq('id', partnerId)
              .single();

            if (partnerData?.member_id) {
              await supabase
                .from('stream_hosts')
                .insert({
                  room_id: newRoom.id,
                  member_id: partnerData.member_id,
                  partner_id: partnerId,
                  role: 'main',
                });
            }
          }
        }

        // publish_start 로그 기록 (clientid로 재연결/중복 이벤트 구분)
        // - streamToken(= RTMP name)은 스트림 키 또는 세션 토큰일 수 있음
        try {
          const { data: activeKey } = await supabase
            .from('mt_live_stream_keys')
            .select('id')
            .eq('partner_id', partnerId)
            .eq('is_active', true)
            .maybeSingle();

          if (activeKey?.id) {
            await supabase
              .from('mt_live_stream_key_logs')
              .insert({
                stream_key_id: activeKey.id,
                event_type: 'publish_start',
                client_ip: clientIp || null,
                room_id: roomIdForLog,
                metadata: {
                  stream_name: streamToken,
                  rtmp_clientid: rtmpClientId || null,
                  app: rtmpApp || null,
                  call: rtmpCall || null,
                },
              });
          }
        } catch (logErr) {
          console.error('Failed to write publish_start log:', logErr);
        }
      }

      return new Response('OK', { status: 200 });
    }

    // ========== POST /api-stream/rtmp/done - RTMP 스트림 종료 알림 ==========
    if (pathname === '/api-stream/rtmp/done' && req.method === 'POST') {
      console.log('=== RTMP DONE START ===');
      
      let streamKey = req.headers.get('X-Stream-Key') || '';
      console.log('RTMP done X-Stream-Key header:', streamKey ? streamKey.slice(0, 16) : '(empty)');
      let rtmpClientId = '';
      let rtmpApp = '';
      let rtmpCall = '';
      
      // 헤더에 없으면 POST body에서 추출
      if (!streamKey) {
        try {
          const bodyText = await req.text();
          console.log('RTMP done raw body:', bodyText.slice(0, 200));
          const params = new URLSearchParams(bodyText);
          streamKey = params.get('name') || '';
          rtmpClientId = params.get('clientid') || '';
          rtmpApp = params.get('app') || '';
          rtmpCall = params.get('call') || '';
          console.log('RTMP done from body:', { 
            streamKey: streamKey ? streamKey.slice(0, 16) : '(empty)',
            clientid: rtmpClientId,
            call: rtmpCall,
            app: rtmpApp,
          });
        } catch (e) {
          console.error('Failed to parse RTMP done body:', e);
        }
      }

      if (!streamKey) {
        console.log('RTMP done: No stream key found');
        return new Response('No stream key', { status: 400 });
      }

      // =========================================================
      // 재연결/중복 송출 보호:
      // - 기존 퍼블리셔가 끊기며 publish_done이 오더라도,
      //   같은 streamKey로 더 "새로운 publish_start"가 있었다면 방을 종료하지 않음
      // =========================================================
      let shouldIgnoreDone = false;
      try {
        if (rtmpClientId) {
          const { data: lastStart } = await supabase
            .from('mt_live_stream_key_logs')
            .select('id, created_at, metadata')
            .eq('event_type', 'publish_start')
            .filter('metadata->>stream_name', 'eq', streamKey)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          const lastStartClientId = (lastStart?.metadata as any)?.rtmp_clientid;
          if (lastStartClientId && String(lastStartClientId) !== String(rtmpClientId)) {
            shouldIgnoreDone = true;
            console.log('RTMP done ignored: newer publish_start exists', {
              streamKey: streamKey.slice(0, 16),
              doneClientId: rtmpClientId,
              lastStartClientId,
            });
          }
        }
      } catch (ignoreCheckErr) {
        console.error('RTMP done ignore-check failed:', ignoreCheckErr);
      }

      // 스트림 종료 로그 기록
      const { data: keyData } = await supabase
        .from('mt_live_stream_keys')
        .select('id')
        .eq('stream_key', streamKey)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (keyData) {
        await supabase
          .from('mt_live_stream_key_logs')
          .insert({
            stream_key_id: keyData.id,
            event_type: 'publish_stop',
            client_ip: req.headers.get('X-Real-IP'),
            metadata: {
              stream_name: streamKey,
              rtmp_clientid: rtmpClientId || null,
              app: rtmpApp || null,
              call: rtmpCall || null,
              ignored: shouldIgnoreDone,
            },
          });
      }

      if (shouldIgnoreDone) {
        console.log('=== RTMP DONE END (IGNORED) ===');
        return new Response('IGNORED', { status: 200 });
      }

      // 해당 스트림 키를 사용 중인 모든 라이브 방 찾기 (여러개면 버그이므로 전부 종료)
      console.log('Looking for live rooms with stream_key:', streamKey.slice(0, 16));
      
      const { data: rooms, error: roomError } = await supabase
        .from('stream_rooms')
        .select('id, status, host_partner_id, stream_key')
        .eq('stream_key', streamKey)
        .eq('stream_type', 'video')
        .eq('status', 'live');

      console.log('Room query result:', { 
        count: rooms?.length || 0,
        roomIds: rooms?.map(r => r.id),
        error: roomError?.message 
      });

      if (roomError) {
        console.error('Failed to find rooms by stream key:', roomError);
      }

      if (rooms && rooms.length > 0) {
        const roomIds = rooms.map(r => r.id);
        const now = new Date().toISOString();
        
        // 모든 방 상태를 'ended'로 업데이트
        const { error: endError } = await supabase
          .from('stream_rooms')
          .update({ 
            status: 'ended',
            ended_at: now,
          })
          .in('id', roomIds);

        if (endError) {
          console.error('Failed to end rooms on RTMP done:', endError);
        } else {
          console.log('Rooms ended by RTMP done:', { 
            count: rooms.length, 
            roomIds, 
            streamKey: streamKey.slice(0, 12) 
          });

          // (선택) 추가 메타 초기화 - 컬럼이 없으면 무시됨
          try {
            const { error: clearError } = await supabase
              .from('stream_rooms')
              .update({ hls_url: null, egress_id: null })
              .in('id', roomIds);
            if (clearError) {
              console.warn('Failed to clear hls_url/egress_id (ignored):', clearError.message);
            }
          } catch (e) {
            // ignore
          }

          // 모든 시청자 퇴장 처리
          await supabase
            .from('stream_viewers')
            .update({ left_at: now })
            .in('room_id', roomIds)
            .is('left_at', null);

          // 모든 호스트 퇴장 처리
          await supabase
            .from('stream_hosts')
            .update({ left_at: now })
            .in('room_id', roomIds)
            .is('left_at', null);
        }
      } else {
        // 혹시 다른 상태의 방이 있는지도 확인 (디버깅용)
        const { data: anyRooms } = await supabase
          .from('stream_rooms')
          .select('id, status, stream_key')
          .eq('stream_key', streamKey);
        
        console.log('No live room found for stream key:', { 
          streamKey: streamKey.slice(0, 16),
          otherStatusRooms: anyRooms?.map(r => ({ id: r.id, status: r.status })) || []
        });
      }
      
      console.log('=== RTMP DONE END ===');

      console.log('RTMP stream ended:', { streamKey: streamKey.slice(0, 12) });
      return new Response('OK', { status: 200 });
    }

    // ========== GET /api-stream/get-hls-session - 스트림 키 → 세션 UUID 조회 (nginx 내부용) ==========
    // nginx exec_push에서 호출하여 HLS 경로에 사용할 세션 UUID를 조회
    if (pathname === '/api-stream/get-hls-session' && req.method === 'GET') {
      const params = getQueryParams(req.url);
      const streamKey = params.stream_key;

      if (!streamKey) {
        return new Response('', { 
          status: 400,
          headers: { 'Content-Type': 'text/plain' }
        });
      }

      // 스트림 키로 활성 방의 세션 UUID 조회
      const { data: room, error: roomError } = await supabase
        .from('stream_rooms')
        .select('hls_session_id')
        .eq('stream_key', streamKey)
        .in('status', ['live', 'scheduled'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (roomError) {
        console.error('Failed to get hls_session_id:', roomError);
        return new Response('', { 
          status: 500,
          headers: { 'Content-Type': 'text/plain' }
        });
      }

      if (!room?.hls_session_id) {
        // 세션 ID가 없으면 빈 문자열 반환 (nginx에서 스트림 키로 fallback)
        console.log('No hls_session_id found for stream key:', streamKey.slice(0, 16));
        return new Response('', { 
          status: 200,
          headers: { 'Content-Type': 'text/plain' }
        });
      }

      console.log('HLS session ID retrieved:', { streamKey: streamKey.slice(0, 16), hlsSessionId: room.hls_session_id });
      
      // 세션 UUID만 텍스트로 반환 (nginx에서 파싱하기 쉽도록)
      return new Response(room.hls_session_id, { 
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      });
    }

    // ========== GET /api-stream/resolve-key - 파트너 ID → 스트림 키 조회 (내부용) ==========
    if (pathname === '/api-stream/resolve-key' && req.method === 'GET') {
      const params = getQueryParams(req.url);
      const partnerId = params.partner_id;

      if (!partnerId) {
        return new Response('Missing partner_id', { 
          status: 400,
          headers: { 'X-Stream-Key': '' }
        });
      }

      // 파트너의 활성 스트림 키 조회
      const { data: streamKey, error: keyError } = await supabase
        .from('mt_live_stream_keys')
        .select('stream_key')
        .eq('partner_id', partnerId)
        .eq('is_active', true)
        .maybeSingle();

      if (keyError || !streamKey) {
        return new Response('Stream key not found', { 
          status: 403,
          headers: { 'X-Stream-Key': '' }
        });
      }

      // 해당 스트림이 현재 방송 중인지 확인 (HLS 파일 존재 여부로 판단)
      // 또는 stream_rooms에서 live 상태 확인
      const { data: liveRoom } = await supabase
        .from('stream_rooms')
        .select('id')
        .eq('host_partner_id', partnerId)
        .eq('status', 'live')
        .eq('broadcast_type', 'hls')
        .maybeSingle();

      if (!liveRoom) {
        return new Response('Not streaming', { 
          status: 403,
          headers: { 'X-Stream-Key': '' }
        });
      }

      // 스트림 키를 헤더로 반환 (Nginx auth_request_set으로 읽음)
      return new Response('OK', { 
        status: 200,
        headers: { 
          'X-Stream-Key': streamKey.stream_key,
          'Content-Type': 'text/plain'
        }
      });
    }

    // ========== GET /api-stream/rooms/:roomId/hls - HLS URL 조회 ==========
    const hlsMatch = pathname.match(/^\/api-stream\/rooms\/([^\/]+)\/hls$/);
    if (hlsMatch && req.method === 'GET') {
      const roomId = hlsMatch[1];

      // 방 정보 조회
      const { data: room, error: roomError } = await supabase
        .from('stream_rooms')
        .select('id, status, stream_key, broadcast_type, host_partner_id')
        .eq('id', roomId)
        .single();

      if (roomError || !room) {
        return errorResponse('ROOM_NOT_FOUND', '방을 찾을 수 없습니다', null, 404);
      }

      if (room.status !== 'live') {
        return errorResponse('NOT_LIVE', '방송 중이 아닙니다');
      }

      if (room.broadcast_type !== 'hls') {
        return errorResponse('NOT_HLS', '이 방송은 HLS 방송이 아닙니다');
      }

      // HLS URL 생성
      let hlsUrl: string | null = null;
      
      if (room.stream_key) {
        const cloudfrontDomain = Deno.env.get('CLOUDFRONT_DOMAIN');
        const hlsBaseUrl = Deno.env.get('HLS_BASE_URL') || 'https://stream.mateyou.me';
        
        if (cloudfrontDomain) {
          hlsUrl = `https://${cloudfrontDomain}/hls/${room.stream_key}/index.m3u8`;
        } else {
          hlsUrl = `${hlsBaseUrl}/hls/${room.stream_key}/index.m3u8`;
        }
      } else if (room.host_partner_id) {
        // 파트너의 기본 스트림 키로 fallback
        const { data: streamKey } = await supabase
          .from('mt_live_stream_keys')
          .select('stream_key')
          .eq('partner_id', room.host_partner_id)
          .eq('is_active', true)
          .single();

        if (streamKey) {
          const cloudfrontDomain = Deno.env.get('CLOUDFRONT_DOMAIN');
          const hlsBaseUrl = Deno.env.get('HLS_BASE_URL') || 'https://stream.mateyou.me';
          
          if (cloudfrontDomain) {
            hlsUrl = `https://${cloudfrontDomain}/hls/${streamKey.stream_key}/index.m3u8`;
          } else {
            hlsUrl = `${hlsBaseUrl}/hls/${streamKey.stream_key}/index.m3u8`;
          }
        }
      }

      if (!hlsUrl) {
        return errorResponse('NO_STREAM', '스트림을 찾을 수 없습니다');
      }

      return successResponse({ 
        hls_url: hlsUrl,
        broadcast_type: room.broadcast_type,
      });
    }

    // ========== GET/HEAD /api-stream/hls/{partnerId}/* - HLS 프록시 (스트림 키 숨김) ==========
    // 경로: /api-stream/hls/{partnerId}/index.m3u8 또는 /api-stream/hls/{partnerId}/segment.ts
    const hlsProxyMatch = pathname.match(/^\/api-stream\/hls\/([^/]+)\/(.+)$/);
    if (hlsProxyMatch && (req.method === 'GET' || req.method === 'HEAD')) {
      const partnerId = hlsProxyMatch[1];
      const filePath = hlsProxyMatch[2]; // index.m3u8 또는 segment0.ts 등

      // 파트너 ID로 스트림 키 조회
      const { data: keyData, error: keyError } = await supabase
        .from('mt_live_stream_keys')
        .select('stream_key')
        .eq('partner_id', partnerId)
        .eq('is_active', true)
        .maybeSingle();

      if (keyError) {
        console.error('Failed to fetch stream key for proxy:', keyError);
        return errorResponse('KEY_ERROR', '스트림 키 조회 실패', null, 500);
      }

      if (!keyData?.stream_key) {
        return errorResponse('NO_STREAM_KEY', '활성화된 스트림 키가 없습니다', null, 404);
      }

      const streamKey = keyData.stream_key;
      const cdnDomain = Deno.env.get('CDN_DOMAIN') || 'cdn.mateyou.me';
      const targetUrl = `https://${cdnDomain}/hls/${streamKey}/${filePath}`;

      console.log('HLS Proxy:', { partnerId, filePath, targetUrl });

      try {
        // CloudFront/S3에서 HLS 파일 가져오기
        const response = await fetch(targetUrl);
        
        if (!response.ok) {
          return new Response('Stream not found', { 
            status: response.status,
            headers: corsHeaders 
          });
        }

        const contentType = response.headers.get('content-type') || 
          (filePath.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t');

        // m3u8 파일인 경우 세그먼트 URL을 프록시 URL로 변환
        if (filePath.endsWith('.m3u8')) {
          let m3u8Content = await response.text();
          
          // 세그먼트 URL을 프록시 URL로 변환
          // 예: segment0.ts → /api-stream/hls/{partnerId}/segment0.ts
          // 상대 경로이므로 그대로 두면 됨 (같은 경로에서 요청됨)
          
          return new Response(m3u8Content, {
            status: 200,
            headers: {
              ...corsHeaders,
              'Content-Type': contentType,
              'Cache-Control': 'no-cache, no-store, must-revalidate',
            },
          });
        }

        // .ts 세그먼트 파일은 스트림으로 전달
        return new Response(response.body, {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': contentType,
            'Cache-Control': 'max-age=3600',
          },
        });
      } catch (fetchError) {
        console.error('HLS proxy fetch error:', fetchError);
        return errorResponse('PROXY_ERROR', '스트림 프록시 실패', null, 502);
      }
    }

    return errorResponse('ROUTE_NOT_FOUND', 'API route not found', null, 404);

  } catch (error) {
    console.error('Stream API error:', error);

    if (error.message?.includes('authorization') || error.message?.includes('token')) {
      return errorResponse('UNAUTHORIZED', '로그인이 필요합니다', null, 401);
    }

    return errorResponse('INTERNAL_ERROR', '서버 오류가 발생했습니다', error.message, 500);
  }
});
