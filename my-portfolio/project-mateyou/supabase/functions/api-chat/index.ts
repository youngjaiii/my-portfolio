import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, createSupabaseClient, errorResponse, successResponse, validateMethod, getAuthUser, parseRequestBody, getQueryParams } from '../_shared/utils.ts';

// Express API URL (동영상 썸네일 생성용)
const EXPRESS_API_URL = Deno.env.get('EXPRESS_API_URL') || 'https://api.mateyou.me';

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const supabase = createSupabaseClient();

    // GET /api-chat/rooms - Get user's chat rooms
    if (pathname === '/api-chat/rooms' && req.method === 'GET') {
      const user = await getAuthUser(req);
      const params = getQueryParams(req.url);
      const sortBy = params.sort_by; // subscriber, follower, normal (미지정 시 전체)

      // sort_by 파라미터 유효성 검사
      const validSortOptions = ['subscriber', 'follower', 'normal'];
      if (sortBy && !validSortOptions.includes(sortBy)) {
        return errorResponse('INVALID_REQUEST', `sort_by는 ${validSortOptions.join(', ')} 중 하나여야 합니다.`);
      }

      // 현재 사용자 정보 조회 (role, admin_role 확인)
      const { data: currentUser, error: currentUserError } = await supabase
        .from('members')
        .select('id, role, admin_role')
        .eq('id', user.id)
        .single();

      if (currentUserError) {
        console.error('Current user lookup error:', currentUserError);
      }

      let csRoom: any = null;
      let csRooms: any[] = [];
      const isCurrentUserAdmin = currentUser?.role === 'admin' || (currentUser?.admin_role ?? 0) >= 4;

      // ===== CS 문의방 처리 (is_cs_room 기반) =====
      if (isCurrentUserAdmin) {
        // 관리자(admin_role >= 4): 모든 CS 문의방 목록 조회
        const { data: allCsRooms, error: csRoomsError } = await supabase
          .from('chat_rooms')
          .select(`
            *,
            creator:members!created_by(id, member_code, name, profile_image)
          `)
          .eq('is_cs_room', true)
          .eq('is_active', true)
          .order('updated_at', { ascending: false });

        if (csRoomsError) {
          console.error('CS rooms fetch error:', csRoomsError);
        }

        // 각 CS 방의 최신 메시지 + 미읽음 수 조회
        const allCsRoomsMapped = await Promise.all((allCsRooms || []).map(async (room: any) => {
          const { data: latestMsg } = await supabase
            .from('member_chats')
            .select('id, message, message_type, created_at, sender_id')
            .eq('chat_room_id', room.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          // CS 방 미읽음: receiver_id=null (유저→CS) 이고 is_read=false
          const { count: unread } = await supabase
            .from('member_chats')
            .select('*', { count: 'exact', head: true })
            .eq('chat_room_id', room.id)
            .is('receiver_id', null)
            .eq('is_read', false);

          return {
            ...room,
            partner: null,
            is_admin_room: true,
            is_cs_room: true,
            display_name: room.creator?.name || '문의',
            latest_message: latestMsg || null,
            unread_count: unread || 0,
          };
        }));
        // 메시지가 없는 빈 CS방은 관리자 목록에서 제외
        csRooms = allCsRoomsMapped.filter(room => room.latest_message !== null);
      } else {
        // 일반 사용자: 본인의 CS 문의방 1개 조회/생성
        const { data: existingCsRoom, error: csRoomError } = await supabase
          .from('chat_rooms')
          .select('*')
          .eq('is_cs_room', true)
          .eq('created_by', user.id)
          .eq('is_active', true)
          .maybeSingle();

        if (csRoomError && csRoomError.code !== 'PGRST116') {
          console.error('CS room check error:', csRoomError);
        }

        if (!existingCsRoom) {
          // CS 문의방 자동 생성
          const { data: newCsRoom, error: createCsError } = await supabase
            .from('chat_rooms')
            .insert([{
              created_by: user.id,
              partner_id: null,
              is_active: true,
              is_cs_room: true,
            }])
            .select('*')
            .single();

          if (!createCsError && newCsRoom) {
            csRoom = {
              ...newCsRoom,
              creator: currentUser,
              partner: null,
              is_admin_room: true,
              is_cs_room: true,
            display_name: '1:1 문의',
            latest_message: null,
            unread_count: 0,
            };
          }
        } else {
          // 기존 CS 방의 최신 메시지 + 미읽음 수 조회
          const { data: latestCsMsg } = await supabase
            .from('member_chats')
            .select('id, message, message_type, created_at, sender_id')
            .eq('chat_room_id', existingCsRoom.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          // 유저 입장에서 미읽음: receiver_id=user.id 이고 is_read=false
          const { count: csUnread } = await supabase
            .from('member_chats')
            .select('*', { count: 'exact', head: true })
            .eq('chat_room_id', existingCsRoom.id)
            .eq('receiver_id', user.id)
            .eq('is_read', false);

          csRoom = {
            ...existingCsRoom,
            creator: currentUser,
            partner: null,
            is_admin_room: true,
            is_cs_room: true,
            display_name: '1:1 문의',
            latest_message: latestCsMsg || null,
            unread_count: csUnread || 0,
          };
        }
      }

      // 2. 현재 사용자의 파트너 여부 확인
      const { data: currentUserPartner } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', user.id)
        .maybeSingle();

      const isPartner = !!currentUserPartner?.id;

      // 3. 관계 데이터 조회 (sort_by 필터링을 위해)
      // 파트너: 상대가 나를 구독/팔로우하는지 (역방향)
      // 일반 사용자: 내가 상대를 구독/팔로우하는지 (정방향)
      let subscribedMemberIds: string[] = [];
      let followedMemberIds: string[] = [];

      if (sortBy) {
        if (isPartner && currentUserPartner) {
          // 파트너인 경우: 나를 구독/팔로우하는 사용자 목록 조회
          if (sortBy === 'subscriber' || sortBy === 'normal') {
            const { data: mySubscribers } = await supabase
              .from('membership_subscriptions')
              .select('user_id, membership!inner(partner_id)')
              .eq('membership.partner_id', currentUserPartner.id)
              .eq('status', 'active');

            if (mySubscribers) {
              subscribedMemberIds = [...new Set(mySubscribers
                // deno-lint-ignore no-explicit-any
                .map((sub: any) => sub.user_id)
                .filter(Boolean))];
            }
          }

          if (sortBy === 'follower' || sortBy === 'normal') {
            const { data: myFollowers } = await supabase
              .from('follow')
              .select('follower_id')
              .eq('partner_id', currentUserPartner.id);

            if (myFollowers) {
              followedMemberIds = [...new Set(myFollowers
                .map((f) => f.follower_id)
                .filter(Boolean))];
            }
          }
        } else {
          // 일반 사용자인 경우: 내가 구독/팔로우하는 파트너 목록 조회
          if (sortBy === 'subscriber' || sortBy === 'normal') {
            const { data: subscriptions } = await supabase
              .from('membership_subscriptions')
              .select(`
                membership:membership!inner(
                  partner_id,
                  partner:partners!inner(member_id)
                )
              `)
              .eq('user_id', user.id)
              .eq('status', 'active');

            if (subscriptions) {
              subscribedMemberIds = [...new Set(subscriptions
                // deno-lint-ignore no-explicit-any
                .map((sub: any) => sub.membership?.partner?.member_id)
                .filter(Boolean))];
            }
          }

          if (sortBy === 'follower' || sortBy === 'normal') {
            const { data: follows } = await supabase
              .from('follow')
              .select(`
                partner:partners!inner(member_id)
              `)
              .eq('follower_id', user.id);

            if (follows) {
              followedMemberIds = [...new Set(follows
                // deno-lint-ignore no-explicit-any
                .map((f: any) => f.partner?.member_id)
                .filter(Boolean))];
            }
          }
        }
      }

      // 4. 일반 채팅방 조회 (본인이 나간 채팅방은 제외)
      const { data: roomsData, error: roomsError } = await supabase
        .from('chat_rooms')
        .select(`
          *,
          creator:members!created_by(id, member_code, name, profile_image),
          partner:members!partner_id(id, member_code, name, profile_image)
        `)
        .or(`created_by.eq.${user.id},partner_id.eq.${user.id}`)
        .eq('is_active', true)
        .order('updated_at', { ascending: false });

      if (roomsError) throw roomsError;

      // 본인이 나간 채팅방 및 CS 채팅방 필터링
      let filteredRooms = (roomsData || []).filter(room => {
        const isCreator = room.created_by === user.id;
        if (isCreator && room.left_by_creator) return false;
        if (!isCreator && room.left_by_partner) return false;
        // CS 방은 별도 처리하므로 일반 목록에서 제외
        if (room.is_cs_room) return false;
        return true;
      });

      // 5. sort_by에 따른 관계 기반 필터링
      if (sortBy) {
        filteredRooms = filteredRooms.filter(room => {
          const isCreator = room.created_by === user.id;
          const chatPartnerId = isCreator ? room.partner_id : room.created_by;

          const isSubscribed = subscribedMemberIds.includes(chatPartnerId);
          const isFollowed = followedMemberIds.includes(chatPartnerId);

          switch (sortBy) {
            case 'subscriber':
              return isSubscribed;
            case 'follower':
              return isFollowed;
            case 'normal':
              return !isSubscribed && !isFollowed;
            default:
              return true;
          }
        });
      }

      // 각 채팅방의 최신 메시지 조회 (member_chats 사용)
      // chat_room_id가 null인 레거시 데이터도 sender_id/receiver_id로 조회
      const roomsWithLatestMessage = await Promise.all(filteredRooms.map(async (room) => {
        // 채팅 참여자 ID 추출
        const participantIds = [room.created_by, room.partner_id];
        const isCreator = room.created_by === user.id;
        const chatPartnerId = isCreator ? room.partner_id : room.created_by;
        
        // 방법 1: chat_room_id로 조회
        let { data: latestMessage } = await supabase
          .from('member_chats')
          .select('id, message, message_type, created_at, sender_id')
          .eq('chat_room_id', room.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // 방법 2: chat_room_id가 없으면 sender_id/receiver_id로 조회 (레거시 데이터 지원)
        if (!latestMessage) {
          const { data: legacyMessage } = await supabase
            .from('member_chats')
            .select('id, message, message_type, created_at, sender_id')
            .or(`and(sender_id.eq.${participantIds[0]},receiver_id.eq.${participantIds[1]}),and(sender_id.eq.${participantIds[1]},receiver_id.eq.${participantIds[0]})`)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          
          latestMessage = legacyMessage;
        }

        // 읽지 않은 메시지 수 계산 (chat_room_id 기준)
        let unreadCount = 0;
        
        // 실제 데이터 조회해서 확인
        const { data: unreadMessages, error: countError } = await supabase
          .from('member_chats')
          .select('id, is_read, receiver_id, chat_room_id')
          .eq('chat_room_id', room.id)
          .eq('receiver_id', user.id)
          .eq('is_read', false);
        
        const roomUnreadCount = unreadMessages?.length || 0;
        console.log(`[DEBUG] Room ${room.id}: user=${user.id}, roomUnreadCount=${roomUnreadCount}, messages=${JSON.stringify(unreadMessages)}, error=${countError?.message}`);
        unreadCount = roomUnreadCount;

        // 레거시 데이터도 카운트 (chat_room_id가 null인 경우)
        // 상대방이 나에게 보낸 메시지만 카운트
        if (unreadCount === 0) {
          const partnerId = isCreator ? room.partner_id : room.created_by;
          
          const { data: legacyMessages, error: legacyError } = await supabase
            .from('member_chats')
            .select('id, is_read, sender_id, receiver_id')
            .is('chat_room_id', null)
            .eq('sender_id', partnerId)
            .eq('receiver_id', user.id)
            .eq('is_read', false);
          
          const legacyUnreadCount = legacyMessages?.length || 0;
          console.log(`[DEBUG] Room ${room.id} legacy: partnerId=${partnerId}, legacyUnreadCount=${legacyUnreadCount}, messages=${JSON.stringify(legacyMessages)}, error=${legacyError?.message}`);
          unreadCount = legacyUnreadCount;
        }
        
        console.log(`[DEBUG] Room ${room.id} final unreadCount=${unreadCount}`);

        // 관계 유형 결정
        const isSubscribed = subscribedMemberIds.includes(chatPartnerId);
        const isFollowed = followedMemberIds.includes(chatPartnerId);
        let relationshipType: 'subscriber' | 'follower' | 'normal' = 'normal';
        if (isSubscribed) relationshipType = 'subscriber';
        else if (isFollowed) relationshipType = 'follower';

        return {
          ...room,
          latest_message: latestMessage || null,
          unread_count: unreadCount,
          is_admin_room: false,
          relationship_type: relationshipType,
        };
      }));

      // 3. 최신 메시지 기준으로 정렬 (latest_message.created_at 기준)
      const sortedRooms = roomsWithLatestMessage.sort((a, b) => {
        const aTime = a.latest_message?.created_at ? new Date(a.latest_message.created_at).getTime() : 0;
        const bTime = b.latest_message?.created_at ? new Date(b.latest_message.created_at).getTime() : 0;
        return bTime - aTime; // 내림차순 (최신순)
      });

      // 4. CS 채팅방을 최상단에 고정 배치
      let allRooms;
      if (isCurrentUserAdmin) {
        // 관리자: CS 방 전체 + 일반 방
        allRooms = [...csRooms, ...sortedRooms];
      } else {
        // 일반 유저: CS 방 1개 + 일반 방
        allRooms = csRoom ? [csRoom, ...sortedRooms] : sortedRooms;
      }

      return successResponse(allRooms);
    }

    // GET /api-chat/search - 채팅방 검색 (파트너명 또는 대화 내용)
    if (pathname === '/api-chat/search' && req.method === 'GET') {
      const user = await getAuthUser(req);
      const params = getQueryParams(req.url);
      
      const keyword = params.q || '';
      const searchType = params.type || 'all'; // partner, message, all
      const limit = Math.min(parseInt(params.limit || '20'), 50);

      if (!keyword || keyword.trim().length === 0) {
        return errorResponse('INVALID_REQUEST', '검색어를 입력해주세요.');
      }

      const trimmedKeyword = keyword.trim();
      const validTypes = ['partner', 'message', 'all'];
      if (!validTypes.includes(searchType)) {
        return errorResponse('INVALID_REQUEST', `type은 ${validTypes.join(', ')} 중 하나여야 합니다.`);
      }

      // 1. 사용자가 참여한 채팅방 조회
      const { data: userRooms, error: roomsError } = await supabase
        .from('chat_rooms')
        .select(`
          id,
          created_by,
          partner_id,
          is_active,
          left_by_creator,
          left_by_partner,
          created_at,
          creator:members!created_by(id, name, member_code, profile_image),
          partner:members!partner_id(id, name, member_code, profile_image)
        `)
        .or(`created_by.eq.${user.id},partner_id.eq.${user.id}`)
        .eq('is_active', true);

      if (roomsError) {
        return errorResponse('FETCH_ERROR', '채팅방 조회 실패', roomsError.message);
      }

      // 본인이 나간 채팅방 제외
      const activeRooms = (userRooms || []).filter(room => {
        const isCreator = room.created_by === user.id;
        const hasLeft = isCreator ? room.left_by_creator : room.left_by_partner;
        return !hasLeft;
      });

      if (activeRooms.length === 0) {
        return successResponse({ 
          rooms_by_partner: [], 
          rooms_by_message: [],
          total_count: { partner: 0, message: 0 }
        });
      }

      const roomIds = activeRooms.map(r => r.id);
      const roomMap = new Map(activeRooms.map(r => [r.id, r]));

      // 결과 저장용 (분리)
      type RoomResult = {
        room_id: string;
        partner: { id: string; name: string; member_code: string; profile_image: string | null };
        latest_message: { message: string; message_type: string; created_at: string } | null;
        last_activity: string;
      };

      type MessageResult = RoomResult & {
        matched_messages: Array<{ message: string; created_at: string }>;
      };

      const roomsByPartner: RoomResult[] = [];
      const roomsByMessage: MessageResult[] = [];

      // 2. 파트너명 검색 (partner 또는 all)
      if (searchType === 'partner' || searchType === 'all') {
        for (const room of activeRooms) {
          const isCreator = room.created_by === user.id;
          const partnerInfo = isCreator ? room.partner : room.creator;
          
          // deno-lint-ignore no-explicit-any
          const partner = partnerInfo as any;
          if (partner?.name && partner.name.toLowerCase().includes(trimmedKeyword.toLowerCase())) {
            
            // 최신 메시지 조회
            const { data: latestMsg } = await supabase
              .from('member_chats')
              .select('message, message_type, created_at')
              .eq('chat_room_id', room.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            roomsByPartner.push({
              room_id: room.id,
              partner: {
                id: partner.id,
                name: partner.name,
                member_code: partner.member_code,
                profile_image: partner.profile_image
              },
              latest_message: latestMsg || null,
              last_activity: latestMsg?.created_at || room.created_at
            });
          }
        }
      }

      // 3. 대화 내용 검색 (message 또는 all)
      if (searchType === 'message' || searchType === 'all') {
        // 메시지에서 키워드 검색 (ILIKE 부분 검색)
        const { data: matchedMessages, error: msgError } = await supabase
          .from('member_chats')
          .select('id, chat_room_id, message, created_at')
          .in('chat_room_id', roomIds)
          .ilike('message', `%${trimmedKeyword}%`)
          .order('created_at', { ascending: false })
          .limit(100);

        if (msgError) {
          console.error('메시지 검색 오류:', msgError);
        }

        if (matchedMessages && matchedMessages.length > 0) {
          // 채팅방별 매칭 메시지 그룹화
          const messagesByRoom = new Map<string, Array<{ message: string; created_at: string }>>();
          
          for (const msg of matchedMessages) {
            if (!msg.chat_room_id) continue;
            
            if (!messagesByRoom.has(msg.chat_room_id)) {
              messagesByRoom.set(msg.chat_room_id, []);
            }
            messagesByRoom.get(msg.chat_room_id)!.push({
              message: msg.message,
              created_at: msg.created_at
            });
          }

          // 결과에 추가
          for (const [roomId, messages] of messagesByRoom) {
            const room = roomMap.get(roomId);
            if (!room) continue;

            const isCreator = room.created_by === user.id;
            const partnerInfo = isCreator ? room.partner : room.creator;
            // deno-lint-ignore no-explicit-any
            const partner = partnerInfo as any;

            // 최신 메시지 조회
            const { data: latestMsg } = await supabase
              .from('member_chats')
              .select('message, message_type, created_at')
              .eq('chat_room_id', roomId)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            roomsByMessage.push({
              room_id: roomId,
              partner: {
                id: partner?.id || '',
                name: partner?.name || '',
                member_code: partner?.member_code || '',
                profile_image: partner?.profile_image || null
              },
              latest_message: latestMsg || null,
              matched_messages: messages.slice(0, 5), // 최대 5개
              last_activity: latestMsg?.created_at || room.created_at
            });
          }
        }
      }

      // 4. 각각 최신 활동 순 정렬
      roomsByPartner.sort((a, b) => {
        const aTime = new Date(a.last_activity).getTime();
        const bTime = new Date(b.last_activity).getTime();
        return bTime - aTime;
      });

      roomsByMessage.sort((a, b) => {
        const aTime = new Date(a.last_activity).getTime();
        const bTime = new Date(b.last_activity).getTime();
        return bTime - aTime;
      });

      // 5. limit 적용
      const limitedPartnerRooms = roomsByPartner.slice(0, limit);
      const limitedMessageRooms = roomsByMessage.slice(0, limit);

      return successResponse({
        rooms_by_partner: limitedPartnerRooms,
        rooms_by_message: limitedMessageRooms,
        total_count: {
          partner: roomsByPartner.length,
          message: roomsByMessage.length
        }
      });
    }

    // POST /api-chat/rooms - Create or get existing chat room
    // - 나갔던 채팅방에 다시 들어오면 left_by_xxx를 false로 복원
    // - 채팅 기록은 유지됨
    if (pathname === '/api-chat/rooms' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body || !body.partner_id) {
        return errorResponse('INVALID_BODY', 'Partner ID is required');
      }

      const { partner_id } = body;

      // Check if room already exists (is_active 상관없이 모든 채팅방 조회)
      const { data: existingRoom, error: checkError } = await supabase
        .from('chat_rooms')
        .select('*')
        .or(`and(created_by.eq.${user.id},partner_id.eq.${partner_id}),and(created_by.eq.${partner_id},partner_id.eq.${user.id})`)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      if (existingRoom) {
        // 기존 채팅방이 있는 경우
        const isCreator = existingRoom.created_by === user.id;
        const myLeftField = isCreator ? 'left_by_creator' : 'left_by_partner';
        const myLeftValue = isCreator ? existingRoom.left_by_creator : existingRoom.left_by_partner;

        // 본인이 나갔던 상태라면 복원
        if (myLeftValue || !existingRoom.is_active) {
          const updateData: any = {
            is_active: true, // 채팅방 활성화
          };
          
          if (isCreator) {
            updateData.left_by_creator = false;
          } else {
            updateData.left_by_partner = false;
          }

          const { data: updatedRoom, error: updateError } = await supabase
            .from('chat_rooms')
            .update(updateData)
            .eq('id', existingRoom.id)
            .select()
            .single();

          if (updateError) throw updateError;

          return successResponse({
            ...updatedRoom,
            restored: true,
            message: '채팅방이 복원되었습니다.',
          });
        }

        return successResponse(existingRoom);
      }

      // Create new room
      const { data: newRoom, error: createError } = await supabase
        .from('chat_rooms')
        .insert([{
          created_by: user.id,
          partner_id: partner_id,
          is_active: true,
        }])
        .select()
        .single();

      if (createError) throw createError;

      return successResponse(newRoom);
    }

    // GET /api-chat/messages/:roomId - Get messages for a room
    if (pathname.includes('/messages/') && !pathname.includes('/media') && req.method === 'GET') {
      const user = await getAuthUser(req);
      const roomId = pathname.split('/messages/')[1]?.split('/')[0];
      const params = getQueryParams(req.url);
      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '50');
      const offset = (page - 1) * limit;

      if (!roomId) {
        return errorResponse('INVALID_ROOM_ID', 'Room ID is required');
      }

      const { data: roomData, error: roomError } = await supabase
        .from('chat_rooms')
        .select('id, created_by, partner_id, is_cs_room')
        .eq('id', roomId)
        .eq('is_active', true)
        .single();

      if (roomError) {
        if (roomError.code === 'PGRST116') {
          return errorResponse('ROOM_NOT_FOUND', 'Chat room not found');
        }
        throw roomError;
      }

      // CS 방 접근 권한
      if (roomData.is_cs_room) {
        const { data: getMsgMember } = await supabase.from('members').select('role, admin_role').eq('id', user.id).single();
        if (roomData.created_by !== user.id && getMsgMember?.role !== 'admin' && (getMsgMember?.admin_role ?? 0) < 4) {
          return errorResponse('UNAUTHORIZED', 'Access denied to this chat room', null, 403);
        }
      } else if (roomData.created_by !== user.id && roomData.partner_id !== user.id) {
        return errorResponse('UNAUTHORIZED', 'Access denied to this chat room', null, 403);
      }

      // Get messages from member_chats
      const { data: messagesData, error: messagesError, count } = await supabase
        .from('member_chats')
        .select(`
          *,
          sender:members!sender_id(id, name, profile_image),
          receiver:members!receiver_id(id, name, profile_image),
          media:chat_media(id, media_url, media_type, file_name, thumbnail_url)
        `, { count: 'exact' })
        .eq('chat_room_id', roomId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (messagesError) throw messagesError;

      // 각 메시지의 미디어에 signed URL 추가
      const messagesWithSignedUrls = await Promise.all((messagesData || []).map(async (msg: any) => {
        if (!msg.media || msg.media.length === 0) {
          return msg;
        }

        const mediaWithUrls = await Promise.all(msg.media.map(async (media: any) => {
          let signedMediaUrl = null;
          let signedThumbnailUrl = null;

          // media_url signed URL
          if (media.media_url) {
            let storagePath = media.media_url;
            if (media.media_url.includes('/storage/v1/object/')) {
              const match = media.media_url.match(/chat-media\/(.+?)(\?|$)/);
              if (match) storagePath = match[1];
            }
            const { data: mediaSignedData } = await supabase.storage
              .from('chat-media')
              .createSignedUrl(storagePath, 3600);
            signedMediaUrl = mediaSignedData?.signedUrl || null;
          }

          // thumbnail_url signed URL
          if (media.thumbnail_url) {
            if (media.thumbnail_url.startsWith('chat-thumbnail:')) {
              const thumbPath = media.thumbnail_url.replace('chat-thumbnail:', '');
              const { data: thumbSignedData } = await supabase.storage
                .from('chat-thumbnail')
                .createSignedUrl(thumbPath, 3600);
              signedThumbnailUrl = thumbSignedData?.signedUrl || null;
            } else if (media.thumbnail_url.startsWith('chat-media:')) {
              const transformPath = media.thumbnail_url.replace('chat-media:', '');
              const [path] = transformPath.split('?');
              const { data: baseSignedData } = await supabase.storage
                .from('chat-media')
                .createSignedUrl(path, 3600, {
                  transform: { width: 200, height: 200, resize: 'contain' }
                });
              signedThumbnailUrl = baseSignedData?.signedUrl || null;
            } else if (media.thumbnail_url.includes('/storage/v1/object/')) {
              signedThumbnailUrl = media.thumbnail_url;
            }
          }

          return {
            ...media,
            media_url: signedMediaUrl,
            thumbnail_url: signedThumbnailUrl,
          };
        }));

        return { ...msg, media: mediaWithUrls };
      }));

      return successResponse(messagesWithSignedUrls?.reverse() || [], {
        total: count || 0,
        page,
        limit,
      });
    }

    // POST /api-chat/messages - Send a message (텍스트, 미디어, 또는 둘 다)
    // - Content-Type: application/json → 텍스트만 (하위 호환성)
    // - Content-Type: multipart/form-data → 텍스트 + 미디어 모두 지원
    // - /api-chat/messages/with-media도 하위 호환성을 위해 같은 핸들러로 처리
    if ((pathname === '/api-chat/messages' || pathname === '/api-chat/messages/with-media') && req.method === 'POST') {
      const user = await getAuthUser(req);
      const contentType = req.headers.get('Content-Type') || '';
      
      let room_id: string;
      let message: string = '';
      let message_type: string = 'text';
      let files: File[] = [];

      // Content-Type에 따라 파싱 분기
      if (contentType.includes('multipart/form-data')) {
        // FormData 파싱 (미디어 포함 가능)
        const formData = await req.formData();
        room_id = formData.get('room_id') as string;
        message = (formData.get('message') as string) || '';
        files = formData.getAll('files') as File[];
        
        // message_type 자동 결정 (body 내용에 따라)
        if (files.length > 0) {
          const hasVideo = files.some(f => f.type.startsWith('video/'));
          const hasImage = files.some(f => f.type.startsWith('image/'));
          
          if (message && files.length > 0) {
            // 텍스트 + 미디어 혼합
            message_type = 'mixed';
          } else if (files.length > 1) {
            // 여러 파일
            message_type = 'media';
          } else if (hasVideo) {
            message_type = 'video';
          } else if (hasImage) {
            message_type = 'image';
          } else {
            message_type = 'file';
          }
        } else {
          // 텍스트만
          message_type = 'text';
        }
      } else {
        // JSON 파싱 (텍스트만, 하위 호환성)
        const body = await parseRequestBody(req);
        if (!body || !body.room_id) {
          return errorResponse('INVALID_BODY', 'Room ID is required');
        }
        room_id = body.room_id;
        message = body.message || '';
        message_type = 'text'; // JSON은 텍스트만
      }

      // room_id 필수
      if (!room_id) {
        return errorResponse('INVALID_BODY', 'Room ID is required');
      }

      // 메시지나 파일 중 하나는 있어야 함
      if (!message && files.length === 0) {
        return errorResponse('INVALID_BODY', '메시지 또는 미디어 파일이 필요합니다.');
      }

      // 미디어 파일 최대 10개 제한
      if (files.length > 10) {
        return errorResponse('TOO_MANY_FILES', '미디어 파일은 최대 10개까지 첨부할 수 있습니다.');
      }

      // Verify user has access to this room
      const { data: roomData, error: roomError } = await supabase
        .from('chat_rooms')
        .select('id, created_by, partner_id, left_by_creator, left_by_partner, used_free_message_count, is_cs_room')
        .eq('id', room_id)
        .eq('is_active', true)
        .single();

      if (roomError) {
        if (roomError.code === 'PGRST116') {
          return errorResponse('ROOM_NOT_FOUND', 'Chat room not found');
        }
        throw roomError;
      }

      // CS 방 접근 권한: role='admin' 또는 admin_role >= 4 이면 모든 CS 방 접근 가능
      const { data: msgSenderMember } = await supabase
        .from('members')
        .select('role, admin_role')
        .eq('id', user.id)
        .single();
      const senderAdminRole = msgSenderMember?.admin_role ?? 0;
      const isSenderAdmin = msgSenderMember?.role === 'admin' || senderAdminRole >= 4;

      if (roomData.is_cs_room) {
        // CS 방: 방 생성자이거나 관리자만 접근 가능
        if (roomData.created_by !== user.id && !isSenderAdmin) {
          return errorResponse('UNAUTHORIZED', 'Access denied to this chat room', null, 403);
        }
      } else {
        if (roomData.created_by !== user.id && roomData.partner_id !== user.id) {
          return errorResponse('UNAUTHORIZED', 'Access denied to this chat room', null, 403);
        }
      }

      const isCreator = roomData.created_by === user.id;
      // CS 방: 유저가 보내면 receiver_id=null, 관리자가 보내면 receiver_id=방 생성자
      const receiverId = roomData.is_cs_room
        ? (isCreator ? null : roomData.created_by)
        : (isCreator ? roomData.partner_id : roomData.created_by);

      // 상대방이 나간 채팅방에 메시지를 보내면 상대방의 채팅방을 다시 활성화
      const receiverLeft = isCreator ? roomData.left_by_partner : roomData.left_by_creator;
      if (receiverLeft) {
        const reactivateField = isCreator 
          ? { left_by_partner: false } 
          : { left_by_creator: false };
        
        await supabase
          .from('chat_rooms')
          .update(reactivateField)
          .eq('id', room_id);
      }

      // ========== 메시지 발송 포인트 차감 (role='normal'일 때만, 파트너 설정 chat_price 적용) ==========
      let pointsDeducted = false;
      let usedFreeMessage = false;
      let usedMembershipQuota = false;
      let messageCost = 0;

      // 발신자 정보 조회 (role 확인)
      const { data: senderData, error: senderError } = await supabase
        .from('members')
        .select('role, total_points')
        .eq('id', user.id)
        .single();

      if (senderError || !senderData) {
        return errorResponse('USER_NOT_FOUND', '사용자 정보를 찾을 수 없습니다.');
      }

      // CS 방은 포인트 차감 없이 무료, role이 'normal'인 경우에만 포인트 차감
      if (!roomData.is_cs_room && senderData.role === 'normal') {
        const currentUsedFreeCount = roomData.used_free_message_count || 0;
        
        let partnerInfo: any = null;
        let partnerFreeMessageCount = 0;
        let membershipSubscription: any = null;
        let membershipQuota = 0;

        if (receiverId === roomData.partner_id) {
          const { data: pInfo } = await supabase
            .from('partners')
            .select('id, free_message_count, total_points, chat_price')
            .eq('member_id', receiverId)
            .single();

          if (pInfo) {
            partnerInfo = pInfo;
            partnerFreeMessageCount = pInfo.free_message_count || 0;
            messageCost = pInfo.chat_price || 100;
            
            const { data: subscription } = await supabase
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
              .eq('user_id', user.id)
              .eq('status', 'active')
              .not('membership', 'is', null);

            if (subscription && subscription.length > 0) {
              const partnerSubscription = subscription.find(
                (sub: any) => sub.membership?.partner_id === pInfo.id
              );
              if (partnerSubscription) {
                membershipSubscription = partnerSubscription;
                membershipQuota = partnerSubscription.membership?.paid_message_quota || 0;
              }
            }
          }
        }

        const incrementUsedFreeCount = async () => {
          await supabase
            .from('chat_rooms')
            .update({ used_free_message_count: currentUsedFreeCount + 1 })
            .eq('id', room_id);
        };

        // 1단계: 기본 무료 메시지 확인
        if (currentUsedFreeCount < partnerFreeMessageCount) {
          await incrementUsedFreeCount();
          usedFreeMessage = true;
          console.log(`🆓 기본 무료 메시지 사용: user=${user.id}, count=${currentUsedFreeCount + 1}/${partnerFreeMessageCount}`);
        }
        // 2단계: 멤버십 quota 확인
        else if (membershipSubscription && membershipQuota > 0) {
          const currentMembershipMessageCount = membershipSubscription.message_count || 0;
          
          if (currentMembershipMessageCount < membershipQuota) {
            const { error: updateCountError } = await supabase
              .from('membership_subscriptions')
              .update({ message_count: currentMembershipMessageCount + 1 })
              .eq('id', membershipSubscription.id);

            if (updateCountError) {
              console.error('Message count update error:', updateCountError);
            } else {
              await incrementUsedFreeCount();
              usedMembershipQuota = true;
              console.log(`🎫 멤버십 메시지 quota 사용: user=${user.id}, count=${currentMembershipMessageCount + 1}/${membershipQuota}`);
            }
          }
        }

        // 3단계: 유료 메시지 - 파트너가 설정한 chat_price만큼 차감
        if (!usedFreeMessage && !usedMembershipQuota) {
          if (senderData.total_points < messageCost) {
            return errorResponse('INSUFFICIENT_POINTS', '포인트가 부족합니다.', { 
              required: messageCost, 
              current: senderData.total_points,
              used_free_count: currentUsedFreeCount,
              partner_free_count: partnerFreeMessageCount,
              has_membership: !!membershipSubscription,
              membership_quota_remaining: membershipSubscription 
                ? membershipQuota - (membershipSubscription.message_count || 0) 
                : 0
            });
          }

          // 발신자 포인트 차감
          const { error: deductError } = await supabase
            .from('members')
            .update({ total_points: senderData.total_points - messageCost })
            .eq('id', user.id);

          if (deductError) {
            console.error('Point deduction error:', deductError);
            return errorResponse('POINT_DEDUCTION_FAILED', '포인트 차감에 실패했습니다.');
          }

          // 파트너에게 포인트 적립
          if (partnerInfo) {
            const { error: partnerUpdateError } = await supabase
              .from('partners')
              .update({ total_points: (partnerInfo.total_points || 0) + messageCost })
              .eq('id', partnerInfo.id);

            if (partnerUpdateError) {
              console.error('Partner points update error:', partnerUpdateError);
            }
          }

          await incrementUsedFreeCount();
          pointsDeducted = true;
          console.log(`💰 메시지 발송 포인트 차감: user=${user.id}, cost=${messageCost}P`);
        }
      }
      // ========== 포인트 차감 로직 끝 ==========

      // 파일 업로드 및 썸네일 처리
      const uploadedFiles: any[] = [];
      
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          // 파일 타입 확인
          const isImage = file.type.startsWith('image/');
          const isVideo = file.type.startsWith('video/');
          const mediaType = isImage ? 'image' : isVideo ? 'video' : 'file';

          // 파일명 생성 (room_id/timestamp_randomstring.ext)
          const ext = file.name.split('.').pop() || 'bin';
          const timestamp = Date.now();
          const randomStr = Math.random().toString(36).substring(2, 8);
          const filePath = `${room_id}/${timestamp}_${randomStr}.${ext}`;

          // Supabase Storage에 업로드
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('chat-media')
            .upload(filePath, file, {
              contentType: file.type,
              upsert: false,
            });

          if (uploadError) {
            console.error('Upload error:', uploadError);
            continue;
          }

          let thumbnailUrl: string | null = null;

          // 이미지인 경우: Transform 파라미터 경로 저장
          if (isImage) {
            thumbnailUrl = `chat-media:${filePath}?width=200&height=200`;
          }

          // 비디오인 경우: Express API를 통해 chat-thumbnail 버킷에 썸네일 생성
          if (isVideo) {
            try {
              const { data: signedUrl } = await supabase.storage
                .from('chat-media')
                .createSignedUrl(filePath, 600); // 10분 유효

              if (signedUrl?.signedUrl) {
                const expressApiUrl = 'https://api.mateyou.me/api/chat/generate-thumbnail';
                const thumbnailResponse = await fetch(expressApiUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    room_id: room_id,
                    file_path: filePath,
                    video_url: signedUrl.signedUrl,
                  }),
                });

                if (thumbnailResponse.ok) {
                  const thumbResult = await thumbnailResponse.json();
                  if (thumbResult.thumbnail_path) {
                    thumbnailUrl = `chat-thumbnail:${thumbResult.thumbnail_path}`;
                  }
                } else {
                  console.error('Express thumbnail API error:', thumbnailResponse.status);
                }
              }
            } catch (thumbError) {
              console.error('Thumbnail generation error:', thumbError);
            }
          }

          uploadedFiles.push({
            media_url: filePath, // storage path only
            media_type: mediaType,
            file_name: file.name,
            thumbnail_url: thumbnailUrl,
          });

        } catch (err) {
          console.error('File processing error:', err);
        }
      }

      // Create message in member_chats
      const { data: newMessage, error: messageError } = await supabase
        .from('member_chats')
        .insert([{
          chat_room_id: room_id,
          sender_id: user.id,
          receiver_id: receiverId,
          message: message || (uploadedFiles.length > 0 ? '미디어를 전송했습니다.' : ''),
          message_type,
          is_read: false,
          is_paid: pointsDeducted,
          chat_price: pointsDeducted ? messageCost : 0,
        }])
        .select(`
          *,
          sender:members!sender_id(id, name, profile_image),
          receiver:members!receiver_id(id, name, profile_image)
        `)
        .single();

      if (messageError) throw messageError;

      // Insert media files to chat_media table
      let insertedMedia = [];
      if (uploadedFiles.length > 0) {
        const mediaInserts = uploadedFiles.map((file: any) => ({
          chat_id: newMessage.id,
          chat_room_id: room_id,
          media_url: file.media_url,
          media_type: file.media_type,
          file_name: file.file_name,
          thumbnail_url: file.thumbnail_url,
        }));

        const { data: mediaData, error: mediaError } = await supabase
          .from('chat_media')
          .insert(mediaInserts)
          .select();

        if (mediaError) {
          console.error('Media insert error:', mediaError);
        } else {
          insertedMedia = mediaData || [];
        }
      }

      // Update room's updated_at timestamp
      await supabase
        .from('chat_rooms')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', room_id);

      // 🔔 푸시 알림 전송 (네이티브 + 웹)
      try {
        console.log('[Push Debug] receiverId:', receiverId, 'senderId:', user.id);
        
        const senderName = newMessage.sender?.name || '사용자';
        const senderProfileImage = newMessage.sender?.profile_image || null;
        
        console.log('[Push Debug] senderName:', senderName);
        
        // 푸시 알림 본문 결정
        let pushBody: string;
        if (message && uploadedFiles.length > 0) {
          // 텍스트 + 미디어: 텍스트 표시
          pushBody = message;
        } else if (uploadedFiles.length > 0) {
          // 미디어만: 미디어 타입에 따라
          const hasVideo = uploadedFiles.some(f => f.media_type === 'video');
          const hasImage = uploadedFiles.some(f => f.media_type === 'image');
          if (hasVideo && hasImage) {
            pushBody = '미디어를 보냈습니다.';
          } else if (hasVideo) {
            pushBody = '영상을 보냈습니다.';
          } else if (hasImage) {
            pushBody = '사진을 보냈습니다.';
          } else {
            pushBody = '파일을 보냈습니다.';
          }
        } else {
          // 텍스트만
          pushBody = message;
        }
        
        const nativePushUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/push-native`;
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

        // 1. 네이티브 푸시 알림 (FCM)
        const nativePushResponse = await fetch(nativePushUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceRoleKey}`,
            'apikey': anonKey || '',
          },
          body: JSON.stringify({
            action: 'enqueue_notification',
            user_id: receiverId,
            target_member_id: receiverId,
            title: senderName,
            body: pushBody,
            icon: senderProfileImage,
            notification_type: 'chat',
            url: `/chat?room_id=${room_id}`,
            tag: `chat-${room_id}-${Date.now()}`,
            data: { room_id, sender_id: user.id, message_type, partnerId: user.id },
            process_immediately: true,
          }),
        });

        const nativePushResult = await nativePushResponse.text();
        console.log('[Push Debug] Native push response:', nativePushResponse.status, nativePushResult);
        
        if (nativePushResponse.ok) {
          console.log('🔔 Native push notification queued');
        } else {
          console.log('⚠️ Native push error:', nativePushResponse.status, nativePushResult);
        }

        // 2. 웹 푸시 알림
        const webPushResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': req.headers.get('Authorization') || '',
            'apikey': anonKey || '',
          },
          body: JSON.stringify({
            user_id: receiverId,
            title: senderName,
            body: pushBody,
            notification_type: 'message',
            url: `/chat?room_id=${room_id}`,
            tag: `chat-${room_id}`,
            data: {
              room_id,
              sender_id: user.id,
              sender_name: senderName,
              message_type
            }
          }),
        });

        const webPushResult = await webPushResponse.text();
        console.log('[Push Debug] Web push response:', webPushResponse.status, webPushResult);
        
        if (webPushResponse.ok) {
          console.log('🔔 Web push notification sent');
        } else {
          console.log('⚠️ Web push skipped:', webPushResult);
        }
      } catch (pushError) {
        console.error('❌ Push notification error:', pushError);
      }

      // 응답 시 signed URL 생성
      const mediaWithSignedUrls = await Promise.all((insertedMedia || []).map(async (media: any) => {
        let signedMediaUrl = null;
        let signedThumbnailUrl = null;

        // media_url signed URL
        if (media.media_url) {
          const { data: mediaSignedData } = await supabase.storage
            .from('chat-media')
            .createSignedUrl(media.media_url, 3600);
          signedMediaUrl = mediaSignedData?.signedUrl || null;
        }

        // thumbnail_url signed URL
        if (media.thumbnail_url) {
          if (media.thumbnail_url.startsWith('chat-thumbnail:')) {
            const thumbPath = media.thumbnail_url.replace('chat-thumbnail:', '');
            const { data: thumbSignedData } = await supabase.storage
              .from('chat-thumbnail')
              .createSignedUrl(thumbPath, 3600);
            signedThumbnailUrl = thumbSignedData?.signedUrl || null;
          } else if (media.thumbnail_url.startsWith('chat-media:')) {
            // 이미지 transform
            const transformPath = media.thumbnail_url.replace('chat-media:', '');
            const [path, queryStr] = transformPath.split('?');
            const { data: baseSignedData } = await supabase.storage
              .from('chat-media')
              .createSignedUrl(path, 3600, {
                transform: { width: 200, height: 200, resize: 'contain' }
              });
            signedThumbnailUrl = baseSignedData?.signedUrl || null;
          }
        }

        return {
          ...media,
          media_url: signedMediaUrl,
          thumbnail_url: signedThumbnailUrl,
        };
      }));

      return successResponse({
        ...newMessage,
        media: mediaWithSignedUrls,
      });
    }

    // GET /api-chat/rooms/:roomId/media - Get all media in a chat room (카카오톡 스타일)
    if (pathname.includes('/rooms/') && pathname.includes('/media') && req.method === 'GET') {
      const user = await getAuthUser(req);
      const pathParts = pathname.split('/');
      const roomsIndex = pathParts.indexOf('rooms');
      const roomId = pathParts[roomsIndex + 1];
      
      const params = getQueryParams(req.url);
      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '50');
      const offset = (page - 1) * limit;
      const mediaType = params.media_type; // 'image', 'video', 'file' 필터링

      if (!roomId || roomId === 'media') {
        return errorResponse('INVALID_ROOM_ID', 'Room ID is required');
      }

      // Verify user has access to this room
      const { data: roomData, error: roomError } = await supabase
        .from('chat_rooms')
        .select('id, created_by, partner_id')
        .eq('id', roomId)
        .eq('is_active', true)
        .single();

      if (roomError) {
        if (roomError.code === 'PGRST116') {
          return errorResponse('ROOM_NOT_FOUND', 'Chat room not found');
        }
        throw roomError;
      }

      if (roomData.created_by !== user.id && roomData.partner_id !== user.id) {
        return errorResponse('UNAUTHORIZED', 'Access denied to this chat room', null, 403);
      }

      // Build query
      let query = supabase
        .from('chat_media')
        .select(`
          *,
          member_chats!chat_id(
            id, sender_id, created_at,
            sender:members!sender_id(id, name, profile_image)
          )
        `, { count: 'exact' })
        .eq('chat_room_id', roomId)
        .order('created_at', { ascending: false });

      // 미디어 타입 필터링
      if (mediaType) {
        query = query.eq('media_type', mediaType);
      }

      const { data: mediaData, error: mediaError, count } = await query
        .range(offset, offset + limit - 1);

      if (mediaError) throw mediaError;

      // 미디어 데이터에 signed URL 추가
      const mediaWithSignedUrls = await Promise.all((mediaData || []).map(async (media: any) => {
        let signedMediaUrl = null;
        let signedThumbnailUrl = null;

        // media_url signed URL
        if (media.media_url) {
          // 저장 형식: storage path만 저장된 경우 (예: room_id/timestamp_random.ext)
          // 또는 full URL로 저장된 경우
          let storagePath = media.media_url;
          
          // Full URL인 경우 path 추출
          if (media.media_url.includes('/storage/v1/object/')) {
            const match = media.media_url.match(/chat-media\/(.+?)(\?|$)/);
            if (match) storagePath = match[1];
          }
          
          const { data: mediaSignedData } = await supabase.storage
            .from('chat-media')
            .createSignedUrl(storagePath, 3600);
          signedMediaUrl = mediaSignedData?.signedUrl || null;
        }

        // thumbnail_url signed URL
        if (media.thumbnail_url) {
          if (media.thumbnail_url.startsWith('chat-thumbnail:')) {
            // chat-thumbnail 버킷 (비디오 썸네일)
            const thumbPath = media.thumbnail_url.replace('chat-thumbnail:', '');
            const { data: thumbSignedData } = await supabase.storage
              .from('chat-thumbnail')
              .createSignedUrl(thumbPath, 3600);
            signedThumbnailUrl = thumbSignedData?.signedUrl || null;
          } else if (media.thumbnail_url.startsWith('chat-media:')) {
            // chat-media 버킷 이미지 transform
            const transformPath = media.thumbnail_url.replace('chat-media:', '');
            const [path, queryStr] = transformPath.split('?');
            const { data: baseSignedData } = await supabase.storage
              .from('chat-media')
              .createSignedUrl(path, 3600, {
                transform: { width: 200, height: 200, resize: 'contain' }
              });
            signedThumbnailUrl = baseSignedData?.signedUrl || null;
          } else if (media.thumbnail_url.includes('/storage/v1/object/')) {
            // Legacy: Full URL로 저장된 경우 (기존 데이터 호환)
            signedThumbnailUrl = media.thumbnail_url;
          }
        }

        return {
          ...media,
          media_url: signedMediaUrl,
          thumbnail_url: signedThumbnailUrl,
          // 원본 경로도 포함 (디버깅용)
          _original_media_url: media.media_url,
          _original_thumbnail_url: media.thumbnail_url,
        };
      }));

      // 날짜별로 그룹핑 (카카오톡 스타일)
      const groupedByDate: Record<string, any[]> = {};
      mediaWithSignedUrls.forEach((media: any) => {
        const date = new Date(media.created_at).toISOString().split('T')[0];
        if (!groupedByDate[date]) {
          groupedByDate[date] = [];
        }
        groupedByDate[date].push(media);
      });

      return successResponse({
        media: mediaWithSignedUrls,
        grouped_by_date: groupedByDate,
        pagination: {
          total: count || 0,
          page,
          limit,
        },
      });
    }

    // GET /api-chat/quests - Get quest list for chat room
    if (pathname === '/api-chat/quests' && req.method === 'GET') {
      const user = await getAuthUser(req);
      const params = getQueryParams(req.url);
      const partnerId = params.partnerId; // 상대방 member_id
      const status = params.status; // pending, in_progress, completed, all

      if (!partnerId) {
        return errorResponse('INVALID_PARAMS', 'partnerId is required');
      }

      try {
        // 현재 사용자 role 확인
        const { data: currentUserData, error: currentUserError } = await supabase
          .from('members')
          .select('role')
          .eq('id', user.id)
          .single();

        if (currentUserError) throw currentUserError;

        const isCurrentUserPartner = currentUserData?.role === 'partner';

        // client_id: 일반 사용자 (의뢰 요청자)
        // partner_id: 파트너 (의뢰 수행자) - partners 테이블의 id 참조
        const clientMemberId = isCurrentUserPartner ? partnerId : user.id;
        const partnerMemberId = isCurrentUserPartner ? user.id : partnerId;

        // partner의 member_id로 partners 테이블에서 id 조회
        const { data: partnerData, error: partnerError } = await supabase
          .from('partners')
          .select('id')
          .eq('member_id', partnerMemberId)
          .maybeSingle();

        if (partnerError && partnerError.code !== 'PGRST116') {
          throw partnerError;
        }

        if (!partnerData) {
          // 파트너가 없으면 빈 배열 반환
          return successResponse([]);
        }

        // 상대방이 파트너인지 확인 (양방향 퀘스트 조회용)
        const { data: partnerAsPartner } = await supabase
          .from('partners')
          .select('id')
          .eq('member_id', partnerId)
          .maybeSingle();

        // 현재 사용자가 파트너인지 확인
        const { data: currentUserAsPartner } = await supabase
          .from('partners')
          .select('id')
          .eq('member_id', user.id)
          .maybeSingle();

        // 양방향 퀘스트 조회를 위한 필터 생성
        const filters: string[] = [];
        
        // 방향 1: 내가 클라이언트, 상대방이 파트너
        if (partnerAsPartner?.id) {
          filters.push(`and(client_id.eq.${user.id},partner_id.eq.${partnerAsPartner.id})`);
        }
        
        // 방향 2: 상대방이 클라이언트, 내가 파트너
        if (currentUserAsPartner?.id) {
          filters.push(`and(client_id.eq.${partnerId},partner_id.eq.${currentUserAsPartner.id})`);
        }

        if (filters.length === 0) {
          return successResponse([]);
        }

        // partner_requests 조회 (partner_jobs 조인으로 job_name 가져오기)
        let query = supabase
          .from('partner_requests')
          .select(`
            id, partner_job_id, coins_per_job, job_count, total_coins, status, created_at, updated_at, request_type,
            client:members!client_id(id, name, profile_image),
            partner:partners!partner_id(id, member_id),
            job:partner_jobs!partner_job_id(id, job_name)
          `)
          .or(filters.join(','))
          .order('created_at', { ascending: false });

        if (status && status !== 'all') {
          query = query.eq('status', status);
        }

        const { data: questsData, error: questsError } = await query;

        if (questsError) throw questsError;

        return successResponse(questsData || []);
      } catch (error: any) {
        console.error('퀘스트 조회 실패:', error);
        return errorResponse('QUEST_FETCH_ERROR', error.message || 'Failed to fetch quests');
      }
    }

    // GET /api-chat/profiles - Get chat room member profiles
    if (pathname === '/api-chat/profiles' && req.method === 'GET') {
      const user = await getAuthUser(req);
      const params = getQueryParams(req.url);
      const partnerId = params.partnerId;
      const partnerName = params.partnerName;

      if (!partnerId) {
        return errorResponse('INVALID_PARAMS', 'partnerId is required');
      }

      try {
        // 채팅방 찾기 (partnerId로)
        const { data: roomData, error: roomError } = await supabase
          .from('chat_rooms')
          .select('id, created_by, partner_id')
          .or(`and(created_by.eq.${user.id},partner_id.eq.${partnerId}),and(created_by.eq.${partnerId},partner_id.eq.${user.id})`)
          .eq('is_active', true)
          .maybeSingle();

        if (roomError && roomError.code !== 'PGRST116') {
          throw roomError;
        }

        // 채팅방에 참여한 멤버 ID 목록 수집
        const memberIds = new Set<string>();
        if (roomData) {
          if (roomData.created_by) memberIds.add(roomData.created_by);
          if (roomData.partner_id) {
            // partner_id가 partners 테이블의 id인지 확인
            const { data: partnerData } = await supabase
              .from('partners')
              .select('member_id')
              .eq('id', roomData.partner_id)
              .maybeSingle();
            
            if (partnerData?.member_id) {
              memberIds.add(partnerData.member_id);
            } else {
              // partner_id가 member_id인 경우
              memberIds.add(roomData.partner_id);
            }
          }
        } else {
          // 채팅방이 없으면 partnerId로부터 member_id 찾기
          const { data: partnerData } = await supabase
            .from('partners')
            .select('member_id')
            .eq('id', partnerId)
            .maybeSingle();
          
          if (partnerData?.member_id) {
            memberIds.add(partnerData.member_id);
          }
          memberIds.add(user.id);
        }

        if (memberIds.size === 0) {
          return successResponse([]);
        }

        // 멤버 정보 조회 (불필요한 필드 제외)
        const { data: membersData, error: membersError } = await supabase
          .from('members')
          .select(`
            id,
            member_code,
            name,
            profile_image,
            email
          `)
          .in('id', Array.from(memberIds));

        if (membersError) throw membersError;

        // 각 멤버의 파트너 정보 조회
        const memberIdsArray = Array.from(memberIds);
        const { data: partnersData, error: partnersError } = await supabase
          .from('partners')
          .select(`
            id,
            member_id,
            partner_name,
            partner_message,
            partner_status,
            background_images
          `)
          .in('member_id', memberIdsArray)
          .eq('partner_status', 'approved');

        if (partnersError) {
          console.error('Partners fetch error:', partnersError);
        }

        // member_id -> partner_info 매핑
        const partnerMap = new Map<string, any>();
        (partnersData || []).forEach(partner => {
          partnerMap.set(partner.member_id, partner);
        });

        // 각 멤버의 멤버십 구독 정보 조회 (현재 로그인한 유저 기준)
        const membershipMap = new Map<string, { has_membership: boolean; subscribed_membership: any }>();
        
        for (const member of membersData || []) {
          const partnerInfo = partnerMap.get(member.id);
          
          if (partnerInfo) {
            // 해당 파트너의 멤버십 목록 조회
            const { data: membershipList } = await supabase
              .from('membership')
              .select('id')
              .eq('partner_id', partnerInfo.id)
              .eq('is_active', true);

            if (membershipList && membershipList.length > 0) {
              const membershipIds = membershipList.map((m: any) => m.id);

              // 현재 유저가 구독 중인 멤버십 확인
              const { data: subscription } = await supabase
                .from('membership_subscriptions')
                .select(`
                  id,
                  membership_id,
                  status,
                  started_at,
                  expired_at,
                  next_billing_at,
                  membership:membership!membership_id(
                    id,
                    name,
                    description,
                    monthly_price,
                    is_active,
                    created_at
                  )
                `)
                .eq('user_id', user.id)
                .in('membership_id', membershipIds)
                .eq('status', 'active')
                .maybeSingle();

              if (subscription) {
                membershipMap.set(member.id, {
                  has_membership: true,
                  subscribed_membership: {
                    subscription_id: subscription.id,
                    membership_id: subscription.membership_id,
                    status: subscription.status,
                    started_at: subscription.started_at ? String(subscription.started_at).split('T')[0] : null,
                    expired_at: subscription.expired_at ? String(subscription.expired_at).split('T')[0] : null,
                    next_billing_at: subscription.next_billing_at,
                    membership: subscription.membership,
                  },
                });
              } else {
                membershipMap.set(member.id, {
                  has_membership: false,
                  subscribed_membership: null,
                });
              }
            } else {
              membershipMap.set(member.id, {
                has_membership: false,
                subscribed_membership: null,
              });
            }
          } else {
            // 파트너가 아닌 경우
            membershipMap.set(member.id, {
              has_membership: false,
              subscribed_membership: null,
            });
          }
        }

        // 응답 구성 (불필요한 필드 제외)
        const profiles = (membersData || []).map(member => {
          const partnerInfo = partnerMap.get(member.id);
          const membershipInfo = membershipMap.get(member.id) || { has_membership: false, subscribed_membership: null };
          
          return {
            id: member.id,
            member_code: member.member_code,
            name: member.name,
            profile_image: member.profile_image,
            email: member.email,
            partner_info: partnerInfo ? {
              id: partnerInfo.id,
              partner_name: partnerInfo.partner_name,
              partner_message: partnerInfo.partner_message,
              partner_status: partnerInfo.partner_status,
              background_images: partnerInfo.background_images,
            } : null,
            has_membership: membershipInfo.has_membership,
            subscribed_membership: membershipInfo.subscribed_membership,
          };
        });

        return successResponse(profiles);

      } catch (error) {
        console.error('Chat profiles error:', error);
        return errorResponse('PROFILES_FETCH_ERROR', 'Failed to fetch chat profiles', error.message);
      }
    }

    // DELETE /api-chat/rooms/:roomId - Leave a chat room
    // - 본인만 나가면: 본인 기준에서만 채팅방 숨김
    // - 상대방의 채팅방은 유지, 채팅 기록도 유지
    // - 둘 다 나가면: 채팅방 비활성화 + 관련 데이터 삭제
    // - partner/normal 유저는 관리자 채팅방 삭제 불가
    // - 관리자는 모든 채팅방 삭제 가능
    if (pathname.includes('/rooms/') && !pathname.includes('/media') && req.method === 'DELETE') {
      const user = await getAuthUser(req);
      const roomId = pathname.split('/rooms/')[1]?.split('/')[0];

      if (!roomId) {
        return errorResponse('INVALID_ROOM_ID', 'Room ID is required');
      }

      const { data: roomData, error: roomError } = await supabase
        .from('chat_rooms')
        .select('id, created_by, partner_id, left_by_creator, left_by_partner, is_cs_room')
        .eq('id', roomId)
        .single();

      if (roomError) {
        if (roomError.code === 'PGRST116') {
          return errorResponse('ROOM_NOT_FOUND', 'Chat room not found');
        }
        throw roomError;
      }

      // CS 방은 일반 유저가 삭제 불가
      if (roomData.is_cs_room) {
        const { data: delMember } = await supabase.from('members').select('role, admin_role').eq('id', user.id).single();
        if (delMember?.role !== 'admin' && (delMember?.admin_role ?? 0) < 4 && roomData.created_by !== user.id) {
          return errorResponse('CANNOT_DELETE_ADMIN_ROOM', '관리자 채팅방은 삭제할 수 없습니다.', null, 403);
        }
        // 유저 본인이 CS방을 나가는 것은 허용하되, 방을 삭제하지 않음
      }

      if (!roomData.is_cs_room && roomData.created_by !== user.id && roomData.partner_id !== user.id) {
        return errorResponse('UNAUTHORIZED', 'Access denied to this chat room', null, 403);
      }

      // 현재 사용자가 creator인지 partner인지 확인
      const isCreator = roomData.created_by === user.id;
      const isPartner = roomData.partner_id === user.id;

      // 본인만 나감 → 본인 기준에서만 채팅방 숨김 (데이터는 삭제하지 않음)
      // 채팅 데이터(member_chats, chat_media)는 유지되며, 다시 채팅방에 들어오면 복원됨
      const updateData = isCreator
        ? { left_by_creator: true }
        : { left_by_partner: true };

      const { data: updatedRoom, error: updateError } = await supabase
        .from('chat_rooms')
        .update(updateData)
        .eq('id', roomId)
        .select()
        .single();

      if (updateError) throw updateError;

      return successResponse({
        ...updatedRoom,
        message: '채팅방에서 나갔습니다. 채팅 기록은 유지됩니다.',
      });
    }

    // POST /api-chat/upload - Upload media files to chat-media bucket
    // 비디오 썸네일은 Express API를 통해 chat-thumbnail 버킷에 자동 생성
    if (pathname === '/api-chat/upload' && req.method === 'POST') {
      const user = await getAuthUser(req);
      
      // FormData 파싱
      const formData = await req.formData();
      const roomId = formData.get('room_id') as string;
      const files = formData.getAll('files') as File[];

      if (!roomId) {
        return errorResponse('INVALID_BODY', 'Room ID is required');
      }

      if (!files || files.length === 0) {
        return errorResponse('INVALID_BODY', 'At least one file is required');
      }

      if (files.length > 10) {
        return errorResponse('TOO_MANY_FILES', '파일은 최대 10개까지 업로드할 수 있습니다.');
      }

      // Verify user has access to this room
      const { data: roomData, error: roomError } = await supabase
        .from('chat_rooms')
        .select('id, created_by, partner_id')
        .eq('id', roomId)
        .eq('is_active', true)
        .single();

      if (roomError) {
        if (roomError.code === 'PGRST116') {
          return errorResponse('ROOM_NOT_FOUND', 'Chat room not found');
        }
        throw roomError;
      }

      if (roomData.created_by !== user.id && roomData.partner_id !== user.id) {
        return errorResponse('UNAUTHORIZED', 'Access denied to this chat room', null, 403);
      }

      const uploadedFiles: any[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          // 파일 타입 확인
          const isImage = file.type.startsWith('image/');
          const isVideo = file.type.startsWith('video/');
          const mediaType = isImage ? 'image' : isVideo ? 'video' : 'file';

          // 파일명 생성 (room_id/timestamp_randomstring.ext)
          const ext = file.name.split('.').pop() || 'bin';
          const timestamp = Date.now();
          const randomStr = Math.random().toString(36).substring(2, 8);
          const filePath = `${roomId}/${timestamp}_${randomStr}.${ext}`;

          // Supabase Storage에 업로드 (chat-media 버킷)
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('chat-media')
            .upload(filePath, file, {
              contentType: file.type,
              upsert: false,
            });

          if (uploadError) {
            console.error('Upload error:', uploadError);
            continue;
          }

          let thumbnailUrl: string | null = null;

          // 이미지인 경우: Transform 파라미터 저장 (signed URL 생성 시 적용)
          if (isImage) {
            thumbnailUrl = `chat-media:${filePath}?width=200&height=200`;
          }

          // 비디오인 경우: Express API를 통해 chat-thumbnail 버킷에 썸네일 자동 생성
          if (isVideo) {
            try {
              // 비디오 signed URL 생성 (10분 유효)
              const { data: signedUrl } = await supabase.storage
                .from('chat-media')
                .createSignedUrl(filePath, 600);

              if (signedUrl?.signedUrl) {
                const expressApiUrl = 'https://api.mateyou.me/api/chat/generate-thumbnail';
                const thumbnailResponse = await fetch(expressApiUrl, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    room_id: roomId,
                    file_path: filePath,
                    video_url: signedUrl.signedUrl,
                  }),
                });

                if (thumbnailResponse.ok) {
                  const thumbResult = await thumbnailResponse.json();
                  if (thumbResult.thumbnail_path) {
                    thumbnailUrl = `chat-thumbnail:${thumbResult.thumbnail_path}`;
                  }
                } else {
                  console.error('Express thumbnail API error:', thumbnailResponse.status);
                }
              }
            } catch (thumbError) {
              console.error('Thumbnail generation error:', thumbError);
            }
          }

          uploadedFiles.push({
            media_url: filePath, // storage path only (버킷 경로)
            media_type: mediaType,
            file_name: file.name,
            thumbnail_url: thumbnailUrl,
          });

        } catch (err) {
          console.error('File processing error:', err);
        }
      }

      if (uploadedFiles.length === 0) {
        return errorResponse('UPLOAD_FAILED', '파일 업로드에 실패했습니다.');
      }

      // 응답에 signed URL 포함
      const filesWithSignedUrls = await Promise.all(uploadedFiles.map(async (file: any) => {
        let signedMediaUrl = null;
        let signedThumbnailUrl = null;

        // media_url signed URL
        if (file.media_url) {
          const { data: mediaSignedData } = await supabase.storage
            .from('chat-media')
            .createSignedUrl(file.media_url, 3600);
          signedMediaUrl = mediaSignedData?.signedUrl || null;
        }

        // thumbnail_url signed URL
        if (file.thumbnail_url) {
          if (file.thumbnail_url.startsWith('chat-thumbnail:')) {
            const thumbPath = file.thumbnail_url.replace('chat-thumbnail:', '');
            const { data: thumbSignedData } = await supabase.storage
              .from('chat-thumbnail')
              .createSignedUrl(thumbPath, 3600);
            signedThumbnailUrl = thumbSignedData?.signedUrl || null;
          } else if (file.thumbnail_url.startsWith('chat-media:')) {
            // 이미지 transform
            const transformPath = file.thumbnail_url.replace('chat-media:', '');
            const [path, queryStr] = transformPath.split('?');
            const { data: baseSignedData } = await supabase.storage
              .from('chat-media')
              .createSignedUrl(path, 3600, {
                transform: { width: 200, height: 200, resize: 'contain' }
              });
            signedThumbnailUrl = baseSignedData?.signedUrl || null;
          }
        }

        return {
          ...file,
          media_url_signed: signedMediaUrl,
          thumbnail_url_signed: signedThumbnailUrl,
        };
      }));

      return successResponse({
        uploaded_files: filesWithSignedUrls,
        room_id: roomId,
      });
    }

    // GET /api-chat/rooms/:roomId/media - Get media from chat room
    const mediaMatch = pathname.match(/^\/api-chat\/rooms\/([^\/]+)\/media$/);
    if (mediaMatch && req.method === 'GET') {
      const user = await getAuthUser(req);
      const roomId = mediaMatch[1];
      const queryParams = getQueryParams(url.href);
      const page = parseInt(queryParams.page || '1');
      const limit = parseInt(queryParams.limit || '50');
      const mediaType = queryParams.media_type || 'all'; // 'image', 'video', 'all'
      const offset = (page - 1) * limit;

      // 채팅방 접근 권한 확인
      const { data: roomData, error: roomError } = await supabase
        .from('chat_rooms')
        .select('id, created_by, partner_id')
        .eq('id', roomId)
        .eq('is_active', true)
        .single();

      if (roomError) {
        if (roomError.code === 'PGRST116') {
          return errorResponse('ROOM_NOT_FOUND', 'Chat room not found');
        }
        throw roomError;
      }

      if (roomData.created_by !== user.id && roomData.partner_id !== user.id) {
        return errorResponse('UNAUTHORIZED', 'Access denied to this chat room', null, 403);
      }

      // 미디어 조회 쿼리
      let query = supabase
        .from('chat_media')
        .select('id, message_id, media_url, media_type, file_name, thumbnail_url, created_at', { count: 'exact' })
        .eq('chat_room_id', roomId)
        .order('created_at', { ascending: false });

      // 미디어 타입 필터
      if (mediaType === 'image') {
        query = query.eq('media_type', 'image');
      } else if (mediaType === 'video') {
        query = query.eq('media_type', 'video');
      } else if (mediaType !== 'all') {
        query = query.eq('media_type', mediaType);
      }

      const { data: mediaData, error: mediaError, count } = await query
        .range(offset, offset + limit - 1);

      if (mediaError) throw mediaError;

      return successResponse({
        media: mediaData || [],
        total: count || 0,
        page,
        limit,
      });
    }

    // PUT /api-chat/messages/read - Mark messages as read
    if (pathname === '/api-chat/messages/read' && req.method === 'PUT') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body || !body.room_id) {
        return errorResponse('INVALID_BODY', 'Room ID is required');
      }

      const { room_id } = body;

      const { data: roomData, error: roomError } = await supabase
        .from('chat_rooms')
        .select('id, created_by, partner_id, is_cs_room')
        .eq('id', room_id)
        .eq('is_active', true)
        .single();

      if (roomError) {
        if (roomError.code === 'PGRST116') {
          return errorResponse('ROOM_NOT_FOUND', 'Chat room not found');
        }
        throw roomError;
      }

      // CS 방 접근 권한 확인
      if (roomData.is_cs_room) {
        const { data: readMember } = await supabase.from('members').select('role, admin_role').eq('id', user.id).single();
        if (roomData.created_by !== user.id && readMember?.role !== 'admin' && (readMember?.admin_role ?? 0) < 4) {
          return errorResponse('UNAUTHORIZED', 'Access denied to this chat room', null, 403);
        }
      } else if (roomData.created_by !== user.id && roomData.partner_id !== user.id) {
        return errorResponse('UNAUTHORIZED', 'Access denied to this chat room', null, 403);
      }

      let totalUpdated = 0;

      if (roomData.is_cs_room) {
        if (roomData.created_by === user.id) {
          // 유저가 읽음: receiver_id=user.id 인 메시지 (관리자→유저)
          const { data: updated } = await supabase
            .from('member_chats')
            .update({ is_read: true })
            .eq('chat_room_id', room_id)
            .eq('receiver_id', user.id)
            .eq('is_read', false)
            .select();
          totalUpdated = updated?.length || 0;
        } else {
          // 관리자가 읽음: receiver_id=null 인 메시지 (유저→CS팀)
          const { data: updated } = await supabase
            .from('member_chats')
            .update({ is_read: true })
            .eq('chat_room_id', room_id)
            .is('receiver_id', null)
            .eq('is_read', false)
            .select();
          totalUpdated = updated?.length || 0;
        }
      } else {
        // 일반 방: 기존 로직
        const { data: updatedMessages, error: updateError } = await supabase
          .from('member_chats')
          .update({ is_read: true })
          .eq('chat_room_id', room_id)
          .eq('receiver_id', user.id)
          .eq('is_read', false)
          .select();

        if (updateError) throw updateError;

        const isCreator = roomData.created_by === user.id;
        const partnerId = isCreator ? roomData.partner_id : roomData.created_by;
        
        const { data: updatedLegacyMessages, error: legacyUpdateError } = await supabase
          .from('member_chats')
          .update({ is_read: true, chat_room_id: room_id })
          .is('chat_room_id', null)
          .eq('sender_id', partnerId)
          .eq('receiver_id', user.id)
          .eq('is_read', false)
          .select();

        if (legacyUpdateError) {
          console.error('Legacy update error:', legacyUpdateError);
        }

        totalUpdated = (updatedMessages?.length || 0) + (updatedLegacyMessages?.length || 0);
      }

      console.log(`[markAsRead] Room ${room_id}: updated ${totalUpdated}`);

      return successResponse({
        updated_count: totalUpdated,
      });
    }

    // =============================================
    // Chat Notices (채팅 공지) API
    // =============================================

    // GET /api-chat/notices?partner_id=xxx - partner_id 기준 공지 조회
    if (pathname === '/api-chat/notices' && req.method === 'GET') {
      const user = await getAuthUser(req);
      const params = getQueryParams(req.url);
      const partnerId = params.partner_id;

      if (!partnerId) {
        return errorResponse('INVALID_PARAMS', 'partner_id is required');
      }

      // 현재 사용자와 상대방의 role 조회
      const { data: usersData } = await supabase
        .from('members')
        .select('id, role')
        .in('id', [user.id, partnerId]);

      const currentUserRole = usersData?.find(u => u.id === user.id)?.role || 'normal';
      const partnerRole = usersData?.find(u => u.id === partnerId)?.role || 'normal';

      const isCurrentUserPartnerOrAdmin = currentUserRole === 'partner' || currentUserRole === 'admin';
      const isPartnerPartnerOrAdmin = partnerRole === 'partner' || partnerRole === 'admin';

      // 공지 조회 로직
      // 1. 기본: 상대방(partner/admin)이 작성한 공지 조회
      // 2. 양쪽 모두 partner/admin인 경우: 상대방이 작성한 공지만 조회 (단, 공지가 1개면 그냥 보여줌)
      
      let notices: any[] = [];

      if (isPartnerPartnerOrAdmin) {
        // 상대방이 partner/admin인 경우 상대방의 공지 조회
        const { data: partnerNotices, error: noticesError } = await supabase
          .from('chat_notices')
          .select(`
            *,
            creator:members!creator_id(id, name, profile_image, role)
          `)
          .eq('creator_id', partnerId)
          .order('created_at', { ascending: false });

        if (noticesError) throw noticesError;
        notices = partnerNotices || [];
      }

      // 양쪽 모두 partner/admin이고, 공지가 없는 경우 본인 공지도 조회
      if (isCurrentUserPartnerOrAdmin && isPartnerPartnerOrAdmin && notices.length === 0) {
        const { data: myNotices, error: myNoticesError } = await supabase
          .from('chat_notices')
          .select(`
            *,
            creator:members!creator_id(id, name, profile_image, role)
          `)
          .eq('creator_id', user.id)
          .order('created_at', { ascending: false });

        if (myNoticesError) throw myNoticesError;
        notices = myNotices || [];
      }

      return successResponse(notices);
    }

    // POST /api-chat/notices - 공지 작성 (partner/admin만 가능)
    if (pathname === '/api-chat/notices' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body || !body.content) {
        return errorResponse('INVALID_BODY', '공지 내용이 필요합니다.');
      }

      // 현재 사용자 role 확인
      const { data: userData, error: userError } = await supabase
        .from('members')
        .select('id, role')
        .eq('id', user.id)
        .single();

      if (userError) throw userError;

      if (userData.role !== 'partner' && userData.role !== 'admin') {
        return errorResponse('FORBIDDEN', '공지 작성 권한이 없습니다. partner 또는 admin만 작성할 수 있습니다.', null, 403);
      }

      // 이미 작성한 공지가 있는지 확인 (creator_id 기준 1개만 작성 가능)
      const { data: existingNotice, error: checkError } = await supabase
        .from('chat_notices')
        .select('id')
        .eq('creator_id', user.id)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existingNotice) {
        return errorResponse('ALREADY_EXISTS', '이미 작성한 공지가 있습니다. 수정 또는 삭제만 가능합니다.', null, 400);
      }

      // 공지 생성
      const { data: newNotice, error: createError } = await supabase
        .from('chat_notices')
        .insert([{
          creator_id: user.id,
          content: body.content,
        }])
        .select(`
          *,
          creator:members!creator_id(id, name, profile_image, role)
        `)
        .single();

      if (createError) throw createError;

      return successResponse(newNotice);
    }

    // PUT /api-chat/notices/:noticeId - 공지 수정 (작성자만 가능)
    if (pathname.includes('/notices/') && req.method === 'PUT') {
      const user = await getAuthUser(req);
      const noticeId = pathname.split('/notices/')[1]?.split('/')[0];
      const body = await parseRequestBody(req);

      if (!noticeId) {
        return errorResponse('INVALID_PARAMS', 'notice_id is required');
      }

      if (!body || !body.content) {
        return errorResponse('INVALID_BODY', '공지 내용이 필요합니다.');
      }

      // 공지 조회 및 작성자 확인
      const { data: existingNotice, error: noticeError } = await supabase
        .from('chat_notices')
        .select('*')
        .eq('id', noticeId)
        .single();

      if (noticeError) {
        if (noticeError.code === 'PGRST116') {
          return errorResponse('NOT_FOUND', '공지를 찾을 수 없습니다.');
        }
        throw noticeError;
      }

      // 작성자만 수정 가능
      if (existingNotice.creator_id !== user.id) {
        return errorResponse('FORBIDDEN', '본인이 작성한 공지만 수정할 수 있습니다.', null, 403);
      }

      // 공지 수정
      const { data: updatedNotice, error: updateError } = await supabase
        .from('chat_notices')
        .update({ content: body.content })
        .eq('id', noticeId)
        .select(`
          *,
          creator:members!creator_id(id, name, profile_image, role)
        `)
        .single();

      if (updateError) throw updateError;

      return successResponse(updatedNotice);
    }

    // DELETE /api-chat/notices/:noticeId - 공지 삭제 (작성자만 가능)
    if (pathname.includes('/notices/') && req.method === 'DELETE') {
      const user = await getAuthUser(req);
      const noticeId = pathname.split('/notices/')[1]?.split('/')[0];

      if (!noticeId) {
        return errorResponse('INVALID_PARAMS', 'notice_id is required');
      }

      // 공지 조회 및 작성자 확인
      const { data: existingNotice, error: noticeError } = await supabase
        .from('chat_notices')
        .select('*')
        .eq('id', noticeId)
        .single();

      if (noticeError) {
        if (noticeError.code === 'PGRST116') {
          return errorResponse('NOT_FOUND', '공지를 찾을 수 없습니다.');
        }
        throw noticeError;
      }

      // 작성자만 삭제 가능
      if (existingNotice.creator_id !== user.id) {
        return errorResponse('FORBIDDEN', '본인이 작성한 공지만 삭제할 수 있습니다.', null, 403);
      }

      // 공지 삭제
      const { error: deleteError } = await supabase
        .from('chat_notices')
        .delete()
        .eq('id', noticeId);

      if (deleteError) throw deleteError;

      return successResponse({ message: '공지가 삭제되었습니다.' });
    }

    // GET /api-chat/notices/my - 내가 작성한 공지 목록 조회
    if (pathname === '/api-chat/notices/my' && req.method === 'GET') {
      const user = await getAuthUser(req);

      const { data: myNotices, error: noticesError } = await supabase
        .from('chat_notices')
        .select(`
          *,
          creator:members!creator_id(id, name, profile_image, role)
        `)
        .eq('creator_id', user.id)
        .order('created_at', { ascending: false });

      if (noticesError) throw noticesError;

      return successResponse(myNotices || []);
    }

    // GET /api-chat/rooms/:roomId/memo - 채팅방 메모 조회 (본인 메모만)
    if (pathname.includes('/rooms/') && pathname.endsWith('/memo') && req.method === 'GET') {
      const user = await getAuthUser(req);
      const pathParts = pathname.split('/');
      const roomsIndex = pathParts.indexOf('rooms');
      const roomId = pathParts[roomsIndex + 1];

      if (!roomId) {
        return errorResponse('INVALID_ROOM_ID', 'Room ID is required');
      }

      // 방 존재 + 참여 권한 + CS방 제외
      const { data: roomData, error: roomError } = await supabase
        .from('chat_rooms')
        .select('id, created_by, partner_id, is_cs_room')
        .eq('id', roomId)
        .eq('is_active', true)
        .single();

      if (roomError) {
        if (roomError.code === 'PGRST116') return errorResponse('ROOM_NOT_FOUND', 'Chat room not found');
        throw roomError;
      }
      if (roomData.created_by !== user.id && roomData.partner_id !== user.id) {
        return errorResponse('UNAUTHORIZED', 'Access denied', null, 403);
      }
      if (roomData.is_cs_room) {
        return errorResponse('INVALID_REQUEST', 'Memo is not available for CS rooms');
      }

      const { data: memo, error: memoError } = await supabase
        .from('chat_room_memos')
        .select('id, body, updated_at')
        .eq('chat_room_id', roomId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (memoError) throw memoError;

      return successResponse({ body: memo?.body ?? '', updated_at: memo?.updated_at ?? null });
    }

    // PUT /api-chat/rooms/:roomId/memo - 채팅방 메모 저장 (upsert)
    if (pathname.includes('/rooms/') && pathname.endsWith('/memo') && req.method === 'PUT') {
      const user = await getAuthUser(req);
      const pathParts = pathname.split('/');
      const roomsIndex = pathParts.indexOf('rooms');
      const roomId = pathParts[roomsIndex + 1];
      const body = await parseRequestBody(req);

      if (!roomId) {
        return errorResponse('INVALID_ROOM_ID', 'Room ID is required');
      }
      if (typeof body?.body !== 'string') {
        return errorResponse('INVALID_PARAMS', 'body (string) is required');
      }

      const { data: roomData, error: roomError } = await supabase
        .from('chat_rooms')
        .select('id, created_by, partner_id, is_cs_room')
        .eq('id', roomId)
        .eq('is_active', true)
        .single();

      if (roomError) {
        if (roomError.code === 'PGRST116') return errorResponse('ROOM_NOT_FOUND', 'Chat room not found');
        throw roomError;
      }
      if (roomData.created_by !== user.id && roomData.partner_id !== user.id) {
        return errorResponse('UNAUTHORIZED', 'Access denied', null, 403);
      }
      if (roomData.is_cs_room) {
        return errorResponse('INVALID_REQUEST', 'Memo is not available for CS rooms');
      }

      const { data: memo, error: upsertError } = await supabase
        .from('chat_room_memos')
        .upsert(
          { chat_room_id: roomId, user_id: user.id, body: body.body, updated_at: new Date().toISOString() },
          { onConflict: 'chat_room_id,user_id' }
        )
        .select('id, body, updated_at')
        .single();

      if (upsertError) throw upsertError;

      return successResponse(memo);
    }

    return errorResponse('ROUTE_NOT_FOUND', 'API route not found', null, 404);

  } catch (error) {
    console.error('Chat API error:', error);

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
