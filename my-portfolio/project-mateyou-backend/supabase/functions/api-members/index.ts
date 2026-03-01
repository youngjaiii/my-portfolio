import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, createSupabaseClient, errorResponse, successResponse, getAuthUser, parseRequestBody, getQueryParams } from '../_shared/utils.ts';

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const supabase = createSupabaseClient();

    // GET /api-members/search - Search members
    if (pathname === '/api-members/search' && req.method === 'GET') {
      const params = getQueryParams(req.url);
      const query = params.q;
      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '20');
      const offset = (page - 1) * limit;

      if (!query || query.length < 2) {
        return errorResponse('INVALID_QUERY', 'Search query must be at least 2 characters');
      }

      try {
        const { data: members, error: searchError, count } = await supabase
          .from('members')
          .select('id, member_code, name, profile_image, current_status', { count: 'exact' })
          .or(`name.ilike.%${query}%,member_code.ilike.%${query}%`)
          .range(offset, offset + limit - 1);

        if (searchError) throw searchError;

        return successResponse(members || [], {
          total: count || 0,
          page,
          limit,
        });

      } catch (error) {
        return errorResponse('SEARCH_ERROR', 'Failed to search members', error.message);
      }
    }

    // GET /api-members/points - Get current user's points
    if (pathname === '/api-members/points' && req.method === 'GET') {
      const user = await getAuthUser(req);

      try {
        const { data: memberData, error: memberError } = await supabase
          .from('members')
          .select('total_points')
          .eq('id', user.id)
          .single();

        if (memberError) {
          if (memberError.code === 'PGRST116') {
            return errorResponse('MEMBER_NOT_FOUND', 'Member not found');
          }
          throw memberError;
        }

        return successResponse({ points: memberData.total_points || 0 });

      } catch (error) {
        return errorResponse('POINTS_FETCH_ERROR', 'Failed to fetch member points', error.message);
      }
    }

    // POST /api-members/partner/unblock - Unblock a user (only for partners)
    if (pathname === '/api-members/partner/unblock' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body || !body.partner_id) {
        return errorResponse('INVALID_BODY', 'Partner ID is required');
      }

      const { partner_id } = body;

      try {
        // Check if current user is a partner
        const { data: currentPartnerData, error: currentPartnerError } = await supabase
          .from('partners')
          .select('id, ben_lists')
          .eq('member_id', user.id)
          .single();

        if (currentPartnerError) {
          if (currentPartnerError.code === 'PGRST116') {
            return errorResponse('NOT_PARTNER', 'Only partners can unblock users');
          }
          throw currentPartnerError;
        }

        // Get current ben_lists
        let currentBlockedUsers = [];
        if (currentPartnerData.ben_lists) {
          if (Array.isArray(currentPartnerData.ben_lists)) {
            currentBlockedUsers = currentPartnerData.ben_lists;
          } else if (typeof currentPartnerData.ben_lists === 'string') {
            try {
              currentBlockedUsers = JSON.parse(currentPartnerData.ben_lists);
            } catch (e) {
              currentBlockedUsers = [];
            }
          } else if (typeof currentPartnerData.ben_lists === 'object') {
            currentBlockedUsers = Object.values(currentPartnerData.ben_lists);
          }
        }

        // Check if user is actually blocked
        if (!currentBlockedUsers.includes(partner_id)) {
          return errorResponse('USER_NOT_BLOCKED', 'User is not blocked');
        }

        // Remove from blocked list
        const updatedBlockedUsers = currentBlockedUsers.filter(id => id !== partner_id);

        // Update partner's ben_lists
        const { error: updateError } = await supabase
          .from('partners')
          .update({ ben_lists: updatedBlockedUsers })
          .eq('id', currentPartnerData.id);

        if (updateError) throw updateError;

        return successResponse({
          message: 'User unblocked successfully',
          unblocked_user_id: partner_id,
          total_blocked: updatedBlockedUsers.length
        });

      } catch (error) {
        return errorResponse('UNBLOCK_USER_ERROR', 'Failed to unblock user', error.message);
      }
    }

    // POST /api-members/partner/block - Block a user (only for partners)
    if (pathname === '/api-members/partner/block' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body || !body.partner_id) {
        return errorResponse('INVALID_BODY', 'Partner ID is required');
      }

      const { partner_id } = body;

      try {
        // Check if current user is a partner
        const { data: currentPartnerData, error: currentPartnerError } = await supabase
          .from('partners')
          .select('id, ben_lists')
          .eq('member_id', user.id)
          .single();

        if (currentPartnerError) {
          if (currentPartnerError.code === 'PGRST116') {
            return errorResponse('NOT_PARTNER', 'Only partners can block users');
          }
          throw currentPartnerError;
        }

        // Verify the partner_id to block exists
        const { data: targetMember, error: targetMemberError } = await supabase
          .from('members')
          .select('id')
          .eq('id', partner_id)
          .single();

        if (targetMemberError) {
          if (targetMemberError.code === 'PGRST116') {
            return errorResponse('USER_NOT_FOUND', 'User to block not found');
          }
          throw targetMemberError;
        }

        // Cannot block yourself
        if (partner_id === user.id) {
          return errorResponse('SELF_BLOCK_NOT_ALLOWED', 'Cannot block yourself');
        }

        // Get current ben_lists
        let currentBlockedUsers = [];
        if (currentPartnerData.ben_lists) {
          if (Array.isArray(currentPartnerData.ben_lists)) {
            currentBlockedUsers = currentPartnerData.ben_lists;
          } else if (typeof currentPartnerData.ben_lists === 'string') {
            try {
              currentBlockedUsers = JSON.parse(currentPartnerData.ben_lists);
            } catch (e) {
              currentBlockedUsers = [];
            }
          } else if (typeof currentPartnerData.ben_lists === 'object') {
            currentBlockedUsers = Object.values(currentPartnerData.ben_lists);
          }
        }

        // Check if user is already blocked
        if (currentBlockedUsers.includes(partner_id)) {
          return errorResponse('ALREADY_BLOCKED', 'User is already blocked');
        }

        // Add to blocked list
        const updatedBlockedUsers = [...currentBlockedUsers, partner_id];

        // Update partner's ben_lists
        const { error: updateError } = await supabase
          .from('partners')
          .update({ ben_lists: updatedBlockedUsers })
          .eq('id', currentPartnerData.id);

        if (updateError) throw updateError;

        return successResponse({
          message: 'User blocked successfully',
          blocked_user_id: partner_id,
          total_blocked: updatedBlockedUsers.length
        });

      } catch (error) {
        return errorResponse('BLOCK_USER_ERROR', 'Failed to block user', error.message);
      }
    }

    // GET /api-members/partner/blocked-users - Get blocked users for current partner
    if (pathname === '/api-members/partner/blocked-users' && req.method === 'GET') {
      const user = await getAuthUser(req);

      try {
        // Check if user is a partner
        const { data: partnerData, error: partnerError } = await supabase
          .from('partners')
          .select('id, ben_lists')
          .eq('member_id', user.id)
          .single();

        if (partnerError) {
          if (partnerError.code === 'PGRST116') {
            // User is not a partner, return empty array
            return successResponse([]);
          }
          throw partnerError;
        }

        console.log('Partner data:', partnerData);
        console.log('ben_lists type:', typeof partnerData.ben_lists);
        console.log('ben_lists value:', partnerData.ben_lists);

        // ben_lists에서 차단된 사용자 ID 배열 가져오기
        let blockedUserIds = [];

        // ben_lists가 배열인지 확인하고 처리
        if (partnerData.ben_lists) {
          if (Array.isArray(partnerData.ben_lists)) {
            blockedUserIds = partnerData.ben_lists;
          } else if (typeof partnerData.ben_lists === 'string') {
            // JSON 문자열인 경우 파싱
            try {
              blockedUserIds = JSON.parse(partnerData.ben_lists);
            } catch (e) {
              console.error('Failed to parse ben_lists as JSON:', e);
              blockedUserIds = [];
            }
          } else if (typeof partnerData.ben_lists === 'object') {
            // 객체인 경우 값들을 배열로 변환
            try {
              blockedUserIds = Object.values(partnerData.ben_lists);
            } catch (e) {
              console.error('Failed to get values from ben_lists object:', e);
              blockedUserIds = [];
            }
          }
        }

        console.log('Processed blockedUserIds:', blockedUserIds);

        // 배열이 아니거나 빈 배열인 경우
        if (!Array.isArray(blockedUserIds) || blockedUserIds.length === 0) {
          return successResponse([]);
        }

        // 차단된 사용자들의 정보 가져오기
        const { data: blockedUsers, error: blockedError } = await supabase
          .from('members')
          .select('id, name, profile_image, member_code')
          .in('id', blockedUserIds);

        if (blockedError) throw blockedError;

        // 응답 형식을 맞춤 (blocked_users 테이블 형식과 호환)
        const formattedBlockedUsers = (blockedUsers || []).map(user => ({
          id: `blocked_${user.id}`, // 임시 ID
          blocked_user_id: user.id,
          created_at: new Date().toISOString(), // 임시 생성일
          members: {
            id: user.id,
            name: user.name,
            profile_image: user.profile_image
          }
        }));

        return successResponse(formattedBlockedUsers);

      } catch (error) {
        return errorResponse('BLOCKED_USERS_FETCH_ERROR', 'Failed to fetch blocked users', error.message);
      }
    }

    // GET /api-members/by-code/{code} - Get member by member_code
    if (pathname.startsWith('/api-members/by-code/') && req.method === 'GET') {
      const memberCode = pathname.split('/api-members/by-code/')[1];

      if (!memberCode) {
        return errorResponse('INVALID_MEMBER_CODE', 'Member code is required');
      }

      try {
        const { data: member, error: memberError } = await supabase
          .from('members')
          .select('*')
          .eq('member_code', memberCode)
          .maybeSingle();

        if (memberError) {
          throw memberError;
        }

        if (!member) {
          return errorResponse('MEMBER_NOT_FOUND', 'Member not found');
        }

        return successResponse(member);

      } catch (error) {
        return errorResponse('MEMBER_FETCH_ERROR', 'Failed to fetch member by code', error.message);
      }
    }

    // GET /api-members/member/{memberId} - Get member details (더 구체적인 경로로 변경)
    if (pathname.startsWith('/api-members/member/') && req.method === 'GET') {
      const memberId = pathname.split('/api-members/member/')[1];

      if (!memberId) {
        return errorResponse('INVALID_MEMBER_ID', 'Member ID is required');
      }

      try {
        const { data: member, error: memberError} = await supabase
          .from('members')
          .select('id, member_code, name, profile_image, favorite_game, current_status, created_at')
          .eq('id', memberId)
          .single();

        if (memberError) {
          if (memberError.code === 'PGRST116') {
            return errorResponse('MEMBER_NOT_FOUND', 'Member not found');
          }
          throw memberError;
        }

        return successResponse(member);

      } catch (error) {
        return errorResponse('MEMBER_FETCH_ERROR', 'Failed to fetch member details', error.message);
      }
    }

    // POST /api-members/chat/send - Send chat message
    if (pathname === '/api-members/chat/send' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body || !body.receiver_id || !body.message) {
        return errorResponse('INVALID_BODY', 'Receiver ID and message are required');
      }

      const { receiver_id, message } = body;

      // Validate message
      if (!message.trim()) {
        return errorResponse('EMPTY_MESSAGE', 'Message cannot be empty');
      }

      if (message.trim().length > 1000) {
        return errorResponse('MESSAGE_TOO_LONG', 'Message cannot exceed 1000 characters');
      }

      // Check for prohibited words
      const prohibitedWord = findProhibitedWord(message.trim());
      if (prohibitedWord) {
        return errorResponse('PROHIBITED_CONTENT', `Message contains prohibited word: ${prohibitedWord}`);
      }

      try {
        // Verify receiver exists
        const { data: receiver, error: receiverError } = await supabase
          .from('members')
          .select('id')
          .eq('id', receiver_id)
          .single();

        if (receiverError) {
          if (receiverError.code === 'PGRST116') {
            return errorResponse('RECEIVER_NOT_FOUND', 'Receiver not found');
          }
          throw receiverError;
        }

        // Check if receiver is a partner and has blocked the sender
        const { data: receiverPartnerData, error: receiverPartnerError } = await supabase
          .from('partners')
          .select('ben_lists')
          .eq('member_id', receiver_id)
          .single();

        if (!receiverPartnerError && receiverPartnerData?.ben_lists) {
          let blockedUserIds = [];

          if (Array.isArray(receiverPartnerData.ben_lists)) {
            blockedUserIds = receiverPartnerData.ben_lists;
          } else if (typeof receiverPartnerData.ben_lists === 'string') {
            try {
              blockedUserIds = JSON.parse(receiverPartnerData.ben_lists);
            } catch (e) {
              blockedUserIds = [];
            }
          } else if (typeof receiverPartnerData.ben_lists === 'object') {
            blockedUserIds = Object.values(receiverPartnerData.ben_lists);
          }

          // If sender is blocked by receiver, deny sending message
          if (blockedUserIds.includes(user.id)) {
            return errorResponse('USER_BLOCKED', 'You have been blocked by this user and cannot send messages');
          }
        }

        // Insert message
        const { data: newMessage, error: insertError } = await supabase
          .from('member_chats')
          .insert({
            sender_id: user.id,
            receiver_id: receiver_id,
            message: message.trim(),
          })
          .select(`
            *,
            sender:members!sender_id(*),
            receiver:members!receiver_id(*)
          `)
          .single();

        if (insertError) throw insertError;

        // ✅ 메시지 전송 후 푸시 알림 트리거 (비동기로 실행, 실패해도 메시지 전송은 성공)
        if (newMessage) {
          fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/notify-chat`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              messageId: newMessage.id,
              targetMemberId: receiver_id,
              senderId: user.id,
            }),
          }).catch((err) => {
            console.error('푸시 알림 트리거 실패 (무시됨):', err)
          })
        }

        // Remove sensitive sender and receiver information from response
        const { sender: _sender, receiver: _receiver, ...messageWithoutSensitiveData } = newMessage;

        return successResponse({
          message: messageWithoutSensitiveData,
          success: true,
        });

      } catch (error) {
        return errorResponse('MESSAGE_SEND_ERROR', 'Failed to send message', error.message);
      }
    }

    // GET /api-members/chat/messages - Get chat messages between two users
    if (pathname === '/api-members/chat/messages' && req.method === 'GET') {
      const user = await getAuthUser(req);
      const params = getQueryParams(req.url);
      const partnerId = params.partner_id;
      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '50');
      const offset = (page - 1) * limit;

      if (!partnerId) {
        return errorResponse('INVALID_PARTNER_ID', 'Partner ID is required');
      }

      try {
        const { data: messages, error: messagesError, count } = await supabase
          .from('member_chats')
          .select(`
            *,
            sender:members!sender_id(id, name, profile_image),
            receiver:members!receiver_id(id, name, profile_image)
          `, { count: 'exact' })
          .or(`and(sender_id.eq.${user.id},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${user.id})`)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (messagesError) throw messagesError;

        // Reverse to get chronological order
        const sortedMessages = (messages || []).reverse();

        return successResponse(sortedMessages, {
          total: count || 0,
          page,
          limit,
        });

      } catch (error) {
        return errorResponse('MESSAGES_FETCH_ERROR', 'Failed to fetch messages', error.message);
      }
    }

    // PUT /api-members/chat/mark-read - Mark messages as read
    if (pathname === '/api-members/chat/mark-read' && req.method === 'PUT') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body || !body.sender_id) {
        return errorResponse('INVALID_BODY', 'Sender ID is required');
      }

      const { sender_id } = body;

      try {
        const { data: updatedMessages, error: updateError } = await supabase
          .from('member_chats')
          .update({ is_read: true })
          .eq('sender_id', sender_id)
          .eq('receiver_id', user.id)
          .eq('is_read', false)
          .select('id');

        if (updateError) throw updateError;

        return successResponse({
          success: true,
          updatedCount: updatedMessages?.length || 0,
        });

      } catch (error) {
        return errorResponse('MARK_READ_ERROR', 'Failed to mark messages as read', error.message);
      }
    }

    // GET /api-members/chat/rooms - Get chat rooms (conversations)
    if (pathname === '/api-members/chat/rooms' && req.method === 'GET') {
      const user = await getAuthUser(req);

      try {
        // Get blocked user IDs if current user is a partner
        let blockedUserIds = [];
        const { data: partnerData, error: partnerError } = await supabase
          .from('partners')
          .select('ben_lists')
          .eq('member_id', user.id)
          .single();

        if (!partnerError && partnerData?.ben_lists) {
          if (Array.isArray(partnerData.ben_lists)) {
            blockedUserIds = partnerData.ben_lists;
          } else if (typeof partnerData.ben_lists === 'string') {
            try {
              blockedUserIds = JSON.parse(partnerData.ben_lists);
            } catch (e) {
              blockedUserIds = [];
            }
          } else if (typeof partnerData.ben_lists === 'object') {
            blockedUserIds = Object.values(partnerData.ben_lists);
          }
        }

        // Get all conversations where user is involved
        const { data: conversations, error: conversationsError } = await supabase
          .from('member_chats')
          .select(`
            sender_id, receiver_id, created_at, message, is_read,
            sender:members!sender_id(id, member_code, name, profile_image, current_status),
            receiver:members!receiver_id(id, member_code, name, profile_image, current_status)
          `)
          .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
          .order('created_at', { ascending: false });

        if (conversationsError) throw conversationsError;

        // Group conversations by partner
        const roomsMap = new Map();

        conversations?.forEach(conv => {
          const isUserSender = conv.sender_id === user.id;
          const partner = isUserSender ? conv.receiver : conv.sender;
          const partnerId = partner.id;

          // Skip blocked users from chat rooms list
          if (blockedUserIds.includes(partnerId)) {
            return;
          }

          if (!roomsMap.has(partnerId)) {
            roomsMap.set(partnerId, {
              partnerId: partnerId,
              partnerName: partner.name,
              partnerAvatar: partner.profile_image,
              partnerMemberCode: partner.member_code,
              partnerStatus: partner.current_status,
              lastMessage: conv.message,
              lastMessageTime: conv.created_at,
              unreadCount: 0,
              messages: [],
            });
          }

          const room = roomsMap.get(partnerId);

          // Update last message if this message is newer
          if (new Date(conv.created_at) > new Date(room.lastMessageTime)) {
            room.lastMessage = conv.message;
            room.lastMessageTime = conv.created_at;
          }

          // Count unread messages
          if (!isUserSender && !conv.is_read) {
            room.unreadCount++;
          }
        });

        // Convert map to array and sort by last message time
        const rooms = Array.from(roomsMap.values()).sort((a, b) =>
          new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
        );

        return successResponse(rooms);

      } catch (error) {
        return errorResponse('CHAT_ROOMS_ERROR', 'Failed to fetch chat rooms', error.message);
      }
    }

    // GET /api-members/recent-partners - Get recent partners
    if (pathname === '/api-members/recent-partners' && req.method === 'GET') {
      const user = await getAuthUser(req);
      const params = getQueryParams(req.url);
      const limit = parseInt(params.limit || '6');

      try {
        // Get recent chat partners
        const { data: recentChats, error: chatsError } = await supabase
          .from('member_chats')
          .select(`
            sender_id, receiver_id, created_at,
            sender:members!sender_id(id, member_code, name, profile_image, current_status),
            receiver:members!receiver_id(id, member_code, name, profile_image, current_status)
          `)
          .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
          .order('created_at', { ascending: false })
          .limit(50); // Get more to ensure we have enough unique partners

        if (chatsError) throw chatsError;

        // Extract unique partners
        const partnersMap = new Map();

        recentChats?.forEach(chat => {
          const isUserSender = chat.sender_id === user.id;
          const partner = isUserSender ? chat.receiver : chat.sender;

          if (partner.id !== user.id && !partnersMap.has(partner.id)) {
            partnersMap.set(partner.id, {
              id: partner.id,
              member_code: partner.member_code,
              name: partner.name,
              profile_image: partner.profile_image,
              current_status: partner.current_status,
              last_chat_at: chat.created_at,
            });
          }
        });

        // Convert to array and limit
        const recentPartners = Array.from(partnersMap.values())
          .slice(0, limit);

        return successResponse(recentPartners);

      } catch (error) {
        return errorResponse('RECENT_PARTNERS_ERROR', 'Failed to fetch recent partners', error.message);
      }
    }

    // GET /api-members/partner/lookup/{memberId} - Get partner ID by member ID
    if (pathname.startsWith('/api-members/partner/lookup/') && req.method === 'GET') {
      const memberId = pathname.split('/api-members/partner/lookup/')[1];

      if (!memberId) {
        return errorResponse('INVALID_MEMBER_ID', 'Member ID is required');
      }

      try {
        const { data: partnerData, error: partnerError } = await supabase
          .from('partners')
          .select('id')
          .eq('member_id', memberId)
          .single();

        if (partnerError) {
          if (partnerError.code === 'PGRST116') {
            return errorResponse('PARTNER_NOT_FOUND', 'Partner not found for this member');
          }
          throw partnerError;
        }

        return successResponse({ partner_id: partnerData.id });

      } catch (error) {
        return errorResponse('PARTNER_LOOKUP_ERROR', 'Failed to lookup partner', error.message);
      }
    }

    // POST /api-members/partner/request - Create partner request
    if (pathname === '/api-members/partner/request' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body || !body.partner_id || !body.job_id || !body.job_name || !body.job_count || !body.coins_per_job) {
        return errorResponse('INVALID_BODY', 'Partner ID, job ID, job name, job count, and coins per job are required');
      }

      const { partner_id, job_id, job_name, job_count, coins_per_job, note } = body;
      const totalCost = job_count * coins_per_job;

      try {
        // Check if user has enough points
        const { data: memberData, error: memberError } = await supabase
          .from('members')
          .select('total_points')
          .eq('id', user.id)
          .single();

        if (memberError) {
          if (memberError.code === 'PGRST116') {
            return errorResponse('MEMBER_NOT_FOUND', 'Member not found');
          }
          throw memberError;
        }

        if ((memberData.total_points || 0) < totalCost) {
          return errorResponse('INSUFFICIENT_POINTS', `Insufficient points. Required: ${totalCost}, Available: ${memberData.total_points || 0}`);
        }

        // Verify partner exists and check if user is blocked
        const { data: partnerData, error: partnerError } = await supabase
          .from('partners')
          .select('id, member_id, ben_lists')
          .eq('id', partner_id)
          .single();

        if (partnerError) {
          if (partnerError.code === 'PGRST116') {
            return errorResponse('PARTNER_NOT_FOUND', 'Partner not found');
          }
          throw partnerError;
        }

        // Check if user is trying to request themselves (자기 자신에게만 의뢰 금지)
        if (partnerData.member_id === user.id) {
          return errorResponse('SELF_REQUEST_NOT_ALLOWED', 'Cannot request yourself as partner');
        }

        // Check if user is blocked by partner
        if (partnerData.ben_lists) {
          let blockedUserIds: string[] = [];

          if (Array.isArray(partnerData.ben_lists)) {
            blockedUserIds = partnerData.ben_lists;
          } else if (typeof partnerData.ben_lists === 'string') {
            try {
              blockedUserIds = JSON.parse(partnerData.ben_lists);
            } catch (e) {
              blockedUserIds = [];
            }
          } else if (typeof partnerData.ben_lists === 'object') {
            blockedUserIds = Object.values(partnerData.ben_lists);
          }

          // If user is blocked by partner, deny request
          if (blockedUserIds.includes(user.id)) {
            return errorResponse('USER_BLOCKED', 'You have been blocked by this partner and cannot send requests');
          }
        }

        // 의뢰 생성 (누구나 의뢰 가능 - 의뢰자의 members.id가 client_id에 저장)
        const { data: newRequest, error: requestError } = await supabase
          .from('partner_requests')
          .insert({
            client_id: user.id,           // 의뢰자의 members.id (파트너든 일반 회원이든 상관없이)
            partner_id: partner_id,       // 의뢰받을 파트너의 partners.id
            partner_job_id: job_id,
            request_type: job_name,
            job_count: job_count,
            coins_per_job: coins_per_job,
            note: note || null,
            status: 'pending',
          })
          .select('*')
          .single();

        if (requestError) throw requestError;

        // Deduct points from user using RPC (ensures transaction safety and consistent logging)
        const { error: pointsDeductionError } = await supabase.rpc(
          'update_member_points_with_log',
          {
            p_member_id: user.id,
            p_type: 'spend',
            p_amount: totalCost,
            p_description: `${job_name} ${job_count}회 의뢰`,
            p_log_id: newRequest.id,
          }
        );

        if (pointsDeductionError) {
          // If points deduction fails, delete the request to maintain consistency
          await supabase.from('partner_requests').delete().eq('id', newRequest.id);
          throw pointsDeductionError;
        }

        // 🔔 파트너에게 새 의뢰 푸시 알림 전송
        try {
          const { data: clientInfo, error: clientError } = await supabase
            .from('members')
            .select('name')
            .eq('id', user.id)
            .single();

          const clientName = clientInfo?.name || '클라이언트';

          const pushResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': req.headers.get('Authorization') || '',
              'apikey': Deno.env.get('SUPABASE_ANON_KEY') || '',
            },
            body: JSON.stringify({
              user_id: partnerData.member_id, // 파트너의 member_id
              title: `새로운 의뢰 요청!`,
              body: `${clientName}님이 ${job_name} ${job_count}회 의뢰를 요청했습니다. (${totalCost} 코인)`,
              notification_type: 'request',
              url: `/partner/dashboard?tab=requests`,
              tag: `new-request-${newRequest.id}`,
              data: {
                request_id: newRequest.id,
                client_name: clientName,
                job_name: job_name,
                job_count: job_count,
                total_cost: totalCost
              }
            }),
          });

          if (pushResponse.ok) {
            console.log('🔔 New request notification sent to partner');
          } else {
            console.error('❌ Partner notification failed:', await pushResponse.text());
          }
        } catch (pushError) {
          console.error('❌ Partner notification error:', pushError);
          // 푸시 알림 실패는 의뢰 생성에 영향을 주지 않음
        }

        return successResponse({
          request: newRequest,
          newTotalPoints,
          message: 'Partner request created successfully',
        });

      } catch (error) {
        return errorResponse('REQUEST_CREATE_ERROR', 'Failed to create partner request', error.message);
      }
    }

    // GET /api-members/points/logs - Get points history
    if (pathname === '/api-members/points/logs' && req.method === 'GET') {
      const user = await getAuthUser(req);
      const url = new URL(req.url);
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      try {
        // Get points logs from member_points_logs table
        const { data: pointsLogs, error: logsError } = await supabase
          .from('member_points_logs')
          .select('*')
          .eq('member_id', user.id)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (logsError) throw logsError;

        // Transform data to match the expected format (already in correct format)
        const transformedLogs = (pointsLogs || []).map(log => ({
          id: log.id,
          member_id: log.member_id,
          type: log.type,
          amount: log.amount,
          description: log.description,
          log_id: log.log_id,
          created_at: log.created_at,
        }));

        return successResponse({
          logs: transformedLogs,
          total: transformedLogs.length,
          hasMore: transformedLogs.length === limit
        });

      } catch (error) {
        return errorResponse('POINTS_LOGS_ERROR', 'Failed to get points logs', error.message);
      }
    }

    // POST /api-members/points/log - Add points log entry
    if (pathname === '/api-members/points/log' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body || !body.type || !body.amount || !body.description) {
        return errorResponse('INVALID_BODY', 'Type, amount, and description are required');
      }

      const { type, amount, description, log_id } = body;

      // Convert type to points value
      const points = type === 'earn' ? Math.abs(amount) : -Math.abs(amount);

      try {
        // Use transaction to ensure atomicity
        const { data: result, error: transactionError } = await supabase.rpc('update_member_points_with_log', {
          p_member_id: user.id,
          p_type: type,
          p_amount: Math.abs(amount),
          p_description: description.trim(),
          p_log_id: log_id || null
        });

        if (transactionError) throw transactionError;

        return successResponse({
          log: result.log,
          newTotalPoints: result.new_total_points,
          message: 'Points logged successfully',
        });

      } catch (error) {
        return errorResponse('POINTS_LOG_ERROR', 'Failed to log points', error.message);
      }
    }

    // GET /api-members/requests - Get user's partner requests (as client or partner)
    if (pathname === '/api-members/requests' && req.method === 'GET') {
      const user = await getAuthUser(req);
      const params = getQueryParams(req.url);
      const status = params.status; // pending, in_progress, completed, cancelled
      const asRole = params.as; // 'client' or 'partner'
      const limit = parseInt(params.limit || '20');
      const offset = parseInt(params.offset || '0');

      try {
        let query = supabase
          .from('partner_requests')
          .select(`
            *,
            client:members!client_id(id, name, profile_image),
            partner:partners!partner_id(id, partner_name, member:members!member_id(id, name, profile_image))
          `, { count: 'exact' });

        // Filter by role
        if (asRole === 'client') {
          query = query.eq('client_id', user.id);
        } else if (asRole === 'partner') {
          // Get user's partner ID first
          const { data: partnerData } = await supabase
            .from('partners')
            .select('id')
            .eq('member_id', user.id)
            .maybeSingle();

          if (!partnerData) {
            return successResponse([], { total: 0, limit, offset });
          }

          query = query.eq('partner_id', partnerData.id);
        } else {
          // Get both (client or partner)
          const { data: partnerData } = await supabase
            .from('partners')
            .select('id')
            .eq('member_id', user.id)
            .maybeSingle();

          if (partnerData) {
            query = query.or(`client_id.eq.${user.id},partner_id.eq.${partnerData.id}`);
          } else {
            query = query.eq('client_id', user.id);
          }
        }

        if (status) {
          query = query.eq('status', status);
        }

        const { data: requests, error: requestsError, count } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (requestsError) throw requestsError;

        return successResponse(requests || [], {
          total: count || 0,
          limit,
          offset,
        });

      } catch (error) {
        return errorResponse('REQUESTS_FETCH_ERROR', 'Failed to fetch requests', error.message);
      }
    }

    // GET /api-members/requests/{requestId} - Get specific partner request
    if (pathname.startsWith('/api-members/requests/') && req.method === 'GET') {
      const user = await getAuthUser(req);
      const requestId = pathname.split('/api-members/requests/')[1];

      if (!requestId) {
        return errorResponse('INVALID_REQUEST_ID', 'Request ID is required');
      }

      try {
        const { data: request, error: requestError } = await supabase
          .from('partner_requests')
          .select(`
            *,
            client:members!client_id(id, name, profile_image, member_code),
            partner:partners!partner_id(id, partner_name, member:members!member_id(id, name, profile_image, member_code))
          `)
          .eq('id', requestId)
          .single();

        if (requestError) {
          if (requestError.code === 'PGRST116') {
            return errorResponse('REQUEST_NOT_FOUND', 'Request not found');
          }
          throw requestError;
        }

        // Verify user has access to this request
        const { data: partnerData } = await supabase
          .from('partners')
          .select('id')
          .eq('member_id', user.id)
          .maybeSingle();

        const isClient = request.client_id === user.id;
        const isPartner = partnerData && request.partner_id === partnerData.id;

        if (!isClient && !isPartner) {
          return errorResponse('UNAUTHORIZED', 'You do not have access to this request', null, 403);
        }

        return successResponse(request);

      } catch (error) {
        return errorResponse('REQUEST_FETCH_ERROR', 'Failed to fetch request', error.message);
      }
    }

    return errorResponse('ROUTE_NOT_FOUND', 'API route not found', null, 404);

  } catch (error) {
    console.error('Members API error:', error);

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

// Helper function to find prohibited words
function findProhibitedWord(message: string): string | null {
  const prohibitedWords = [
    '씨발', '개새끼', '병신', '멍청이', '바보', '시발',
    '좆', '존나', '개놈', '년놈', '미친놈', '또라이'
  ];

  const lowerMessage = message.toLowerCase();

  for (const word of prohibitedWords) {
    if (lowerMessage.includes(word)) {
      return word;
    }
  }

  return null;
}