import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, createSupabaseClient, errorResponse, getAuthUser, getQueryParams, parseRequestBody, successResponse } from '../_shared/utils.ts';

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
        const authHeader = req.headers.get('Authorization') || null

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
    // GET /api-members/partner/blocked-users?targetId={uuid}
    // 양방향 차단 상태 확인: blockedByMe (내가 상대방을), blockedByTarget (상대방이 나를)
    if (pathname === '/api-members/partner/blocked-users' && req.method === 'GET') {
      const user = await getAuthUser(req);
      const params = getQueryParams(req.url);
      const targetId = params.targetId; // 타겟 파트너의 members.id (uuid)

      console.log('🔍 [blocked-users] user.id (나):', user.id);
      console.log('🔍 [blocked-users] targetId (타겟):', targetId);

      if (!targetId) {
        return errorResponse('INVALID_TARGET_ID', 'targetId is required');
      }

      try {
        // 1. 내 member_code 조회
        const { data: currentUser, error: currentUserError } = await supabase
          .from('members')
          .select('member_code')
          .eq('id', user.id)
          .single();

        if (currentUserError || !currentUser?.member_code) {
          console.log('❌ [blocked-users] 내 member_code 조회 실패:', currentUserError);
          return errorResponse('USER_NOT_FOUND', 'Current user not found');
        }

        // 2. 타겟의 member_code 조회
        const { data: targetUser, error: targetUserError } = await supabase
          .from('members')
          .select('member_code')
          .eq('id', targetId)
          .single();

        if (targetUserError || !targetUser?.member_code) {
          console.log('❌ [blocked-users] 타겟 member_code 조회 실패:', targetUserError);
          return errorResponse('TARGET_NOT_FOUND', 'Target user not found');
        }

        console.log('🔍 [blocked-users] 내 member_code:', currentUser.member_code);
        console.log('🔍 [blocked-users] 타겟 member_code:', targetUser.member_code);

        // 3. 상대방이 나를 차단했는지 확인
        // blocker_member = 타겟의 uuid, blocked_member = 내 member_code
        const { data: blockedByTargetRecord, error: blockedByTargetError } = await supabase
          .from('member_blocks')
          .select('id')
          .eq('blocker_member', targetId)
          .eq('blocked_member', currentUser.member_code)
          .maybeSingle();

        console.log('🔍 [blocked-users] blockedByTarget 쿼리:', { blocker_member: targetId, blocked_member: currentUser.member_code });
        if (blockedByTargetError) throw blockedByTargetError;

        // 4. 내가 상대방을 차단했는지 확인
        // blocker_member = 나의 uuid, blocked_member = 타겟의 member_code
        const { data: blockedByMeRecord, error: blockedByMeError } = await supabase
          .from('member_blocks')
          .select('id')
          .eq('blocker_member', user.id)
          .eq('blocked_member', targetUser.member_code)
          .maybeSingle();

        console.log('🔍 [blocked-users] blockedByMe 쿼리:', { blocker_member: user.id, blocked_member: targetUser.member_code });
        if (blockedByMeError) throw blockedByMeError;

        const blockedByTarget = !!blockedByTargetRecord;
        const blockedByMe = !!blockedByMeRecord;

        console.log('🔍 [blocked-users] 결과 - blockedByTarget:', blockedByTarget, ', blockedByMe:', blockedByMe);

        return successResponse({ blockedByTarget, blockedByMe });

      } catch (error) {
        console.error('❌ [blocked-users] 에러:', error);
        return errorResponse('BLOCKED_CHECK_ERROR', 'Failed to check block status', error.message);
      }
    }

    // GET /api-members/member/{memberId} - Get member details (더 구체적인 경로로 변경)
    if (pathname.startsWith('/api-members/member/') && req.method === 'GET') {
      const memberId = pathname.split('/api-members/member/')[1];

      if (!memberId) {
        return errorResponse('INVALID_MEMBER_ID', 'Member ID is required');
      }

      try {
        const { data: member, error: memberError } = await supabase
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

        // chat_room 찾기 또는 생성
        let chatRoomId: string | null = null;
        
        // 기존 채팅방 찾기 (sender와 receiver 간)
        const { data: existingRoom } = await supabase
          .from('chat_rooms')
          .select('id')
          .or(`and(created_by.eq.${user.id},partner_id.eq.${receiver_id}),and(created_by.eq.${receiver_id},partner_id.eq.${user.id})`)
          .eq('is_active', true)
          .maybeSingle();

        if (existingRoom) {
          chatRoomId = existingRoom.id;
        } else {
          // 새 채팅방 생성
          const { data: newRoom } = await supabase
            .from('chat_rooms')
            .insert({
              created_by: user.id,
              partner_id: receiver_id,
              is_active: true,
            })
            .select('id')
            .single();

          if (newRoom) {
            chatRoomId = newRoom.id;
          }
        }

        // Insert message
        const { data: newMessage, error: insertError } = await supabase
          .from('member_chats')
          .insert({
            sender_id: user.id,
            receiver_id: receiver_id,
            message: message.trim(),
            is_read: false,
            chat_room_id: chatRoomId,
          })
          .select(`
            *,
            sender:members!sender_id(*),
            receiver:members!receiver_id(*)
          `)
          .single();

        if (insertError) throw insertError;

        // ✅ 메시지 전송 후 푸시 알림 트리거 (실패해도 본문 응답에는 영향 없음)
        if (newMessage) {
          // sender 정보 별도 조회 (foreign key 관계 문제 방지)
          let senderName = '알 수 없는 사용자'
          let senderProfileImage: string | null = null
          
          try {
            const { data: senderInfo } = await supabase
              .from('members')
              .select('name, profile_image')
              .eq('id', user.id)
              .single()
            
            if (senderInfo) {
              senderName = senderInfo.name || '알 수 없는 사용자'
              senderProfileImage = senderInfo.profile_image
              console.log('📷 Sender info:', { name: senderName, profile_image: senderProfileImage })
            }
          } catch (e) {
            console.error('Sender info lookup failed:', e)
          }
          
          const messageText = newMessage.message.trim()
          
          // 특수 메시지 형식을 읽기 쉬운 텍스트로 변환
          let messagePreview = newMessage.message
          
          // 하트 선물 [HEART_GIFT:이미지:개수:포인트]
          if (messagePreview.startsWith('[HEART_GIFT:')) {
            const match = messagePreview.match(/\[HEART_GIFT:[^:]+:(\d+):(\d+)\]/)
            if (match) {
              messagePreview = `❤️ 하트 ${match[1]}개를 선물했습니다`
            }
          }
          // 퀘스트 요청 [QUEST_REQUEST:퀘스트이름:횟수:총금액]
          else if (messagePreview.startsWith('[QUEST_REQUEST:')) {
            const match = messagePreview.match(/\[QUEST_REQUEST:([^:]+):(\d+):(\d+)\]/)
            if (match) {
              messagePreview = `📋 퀘스트 요청: ${match[1]} ${match[2]}회`
            }
          }
          // // 통화 시작 [CALL_START:voice] 또는 [CALL_START:video]
          // else if (messagePreview.startsWith('[CALL_START:')) {
          //   const isVideo = messagePreview.includes(':video]')
          //   messagePreview = isVideo ? '📹 영상통화가 시작됩니다' : '📞 음성통화가 시작됩니다'
          // }
          // // 통화 수락 [CALL_ACCEPT:voice] 또는 [CALL_ACCEPT:video]
          // else if (messagePreview.startsWith('[CALL_ACCEPT:')) {
          //   const isVideo = messagePreview.includes(':video]')
          //   messagePreview = isVideo ? '📹 영상통화를 수락했습니다' : '📞 음성통화를 수락했습니다'
          // }
          // 통화 종료 [CALL_END:voice:초] 또는 [CALL_END:video:초]
          else if (messagePreview.startsWith('[CALL_END:')) {
            const match = messagePreview.match(/\[CALL_END:(voice|video):(\d+)\]/)
            if (match) {
              const isVideo = match[1] === 'video'
              const seconds = Number(match[2])
              const mins = Math.floor(seconds / 60)
              const secs = seconds % 60
              const duration = seconds > 0 
                ? mins > 0 ? `${mins}분 ${secs}초` : `${secs}초`
                : ''
              messagePreview = isVideo 
                ? `📹 영상통화가 종료되었습니다${duration ? ` (${duration})` : ''}`
                : `📞 음성통화가 종료되었습니다${duration ? ` (${duration})` : ''}`
            }
          }
          // 일반 메시지는 50자로 잘라서 미리보기
          else if (messagePreview.length > 50) {
            messagePreview = messagePreview.substring(0, 50) + '...'
          }
          const chatUrl = `/chat?partnerId=${user.id}`
          const supabaseUrl = Deno.env.get('SUPABASE_URL')!
          const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
          // 원래 요청의 Authorization 헤더 사용 (사용자 JWT)
          const authHeader = req.headers.get('Authorization') || `Bearer ${anonKey}`
          const functionHeaders = {
            'Authorization': authHeader,
            'apikey': anonKey,
              'Content-Type': 'application/json',
          }

          // 🔔 후원 메시지 감지 및 알림 전송 (HEART_GIFT 형식)
          const heartGiftMatch = messageText.match(/^\[HEART_GIFT:([^:]+):(\d+):(\d+)\]$/)
          if (heartGiftMatch) {
            const [, heartImage, heartCount, donationAmount] = heartGiftMatch
            const amount = parseInt(donationAmount, 10)
            
            console.log('💝 후원 메시지 감지:', { senderName, amount, receiver_id })
            
            // 후원받은 유저(파트너)에게 알림 전송
            try {
              const donationNotificationResponse = await fetch(`${supabaseUrl}/functions/v1/push-native`, {
                method: 'POST',
                headers: functionHeaders,
                body: JSON.stringify({
                  action: 'enqueue_notification',
                  user_id: receiver_id,
                  target_member_id: receiver_id,
                  title: '💝 후원 알림',
                  body: `${senderName}님이 ${amount.toLocaleString()}포인트를 후원했습니다`,
                  icon: senderProfileImage || null,
                  url: `/chat?partnerId=${user.id}`,
                  notification_type: 'payment',
                  tag: `donation_${user.id}_${receiver_id}`,
                  process_immediately: true, // 즉시 처리하도록 설정
                  data: {
                    type: 'donation',
                    senderId: user.id,
                    senderName: senderName,
                    amount: amount,
                    partnerId: user.id,
                  },
                }),
              })

              if (donationNotificationResponse.ok) {
                const donationResult = await donationNotificationResponse.json()
                console.log('💝 후원 알림 전송 성공:', donationResult)
              } else {
                console.error('💝 후원 알림 전송 실패:', await donationNotificationResponse.text())
              }
            } catch (donationError) {
              console.error('💝 후원 알림 전송 중 예외 발생:', donationError)
            }
          }

          // 수신자 환경 확인: 네이티브 앱인지 웹인지 확인
          const { data: nativeTokens } = await supabase
            .from('push_native_tokens')
            .select('id')
            .eq('user_id', receiver_id)
            .eq('is_active', true)
            .limit(1)

          const { data: webSubscriptions } = await supabase
            .from('web_push_subscriptions')
            .select('id')
            .eq('member_id', receiver_id)
            .limit(1)

          const isNativeUser = nativeTokens && nativeTokens.length > 0
          const isWebUser = webSubscriptions && webSubscriptions.length > 0

          console.log('📱 수신자 환경 확인:', {
            receiver_id,
            isNativeUser,
            isWebUser,
            nativeTokenCount: nativeTokens?.length || 0,
            webSubscriptionCount: webSubscriptions?.length || 0
          })

          // 네이티브 앱 사용자에게는 push-native 전송
          if (isNativeUser) {
            Promise.resolve().then(async () => {
              try {
                const nativeResponse = await fetch(`${supabaseUrl}/functions/v1/push-native`, {
                  method: 'POST',
                  headers: functionHeaders,
                  body: JSON.stringify({
                    action: 'enqueue_notification',
                    user_id: receiver_id,
                    target_member_id: receiver_id,
                    title: `💬 ${senderName}`,
                    body: messagePreview,
                    icon: senderProfileImage || null,
                    url: chatUrl,
                    notification_type: 'chat',
                    data: {
                      messageId: newMessage.id,
                      senderId: user.id,
                      partnerId: user.id,
                      roomId: newMessage.room_id || null,
                      url: chatUrl,
                      type: 'chat',
                    },
                    process_immediately: false,
                  }),
                })

                const nativeJson = await nativeResponse.json().catch(() => null)
                if (!nativeResponse.ok || nativeJson?.success === false) {
                  console.warn('네이티브 푸시 큐 등록 실패:', nativeJson || nativeResponse.statusText)
                } else {
                  console.log('✅ 네이티브 푸시 큐 등록 성공')
                }
              } catch (err) {
                console.warn('네이티브 푸시 트리거 중 예외 발생:', err)
              }
            }).catch(() => {})
          }

          // 웹 사용자에게는 notify-chat 전송
          if (isWebUser) {
            try {
              const notifyResponse = await fetch(`${supabaseUrl}/functions/v1/notify-chat`, {
                method: 'POST',
                headers: functionHeaders,
                body: JSON.stringify({
                  messageId: newMessage.id,
                  targetMemberId: receiver_id,
                  senderId: user.id,
                }),
              })

              if (!notifyResponse.ok) {
                const errorPayload = await notifyResponse.text().catch(() => notifyResponse.statusText)
                console.error('웹 푸시 트리거 실패:', errorPayload)
              } else {
                console.log('✅ 웹 푸시 전송 성공')
              }
            } catch (err) {
              console.error('웹 푸시 트리거 중 예외 발생:', err)
            }
          }

          // 둘 다 없으면 로그만 출력
          if (!isNativeUser && !isWebUser) {
            console.warn('⚠️ 수신자에게 활성 푸시 구독이 없음:', receiver_id)
          }
        }

        return successResponse({
          message: newMessage,
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

        // Verify partner exists
        const { data: partnerData, error: partnerError } = await supabase
          .from('partners')
          .select('id, member_id')
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

        // Deduct points from user
        const newTotalPoints = Math.max(0, memberData.total_points - totalCost);

        const { error: pointsUpdateError } = await supabase
          .from('members')
          .update({ total_points: newTotalPoints })
          .eq('id', user.id);

        if (pointsUpdateError) throw pointsUpdateError;

        // 참고: 의뢰자가 파트너여도 partners.total_points는 차감하지 않음
        // partners.total_points는 번 포인트, members.total_points는 충전/사용 포인트로 분리됨

        // Log points deduction to member_points_logs
        const { error: logError } = await supabase
          .from('member_points_logs')
          .insert({
            member_id: user.id,
            type: 'spend',
            amount: totalCost,
            description: `${job_name} ${job_count}회 의뢰`,
            log_id: newRequest.id,
          });

        if (logError) console.error('Failed to log points deduction:', logError);

        // 참고: 의뢰자가 파트너여도 partner_points_logs에는 기록하지 않음
        // partners.total_points는 번 포인트, members.total_points는 충전/사용 포인트로 분리됨

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

        // 참고: 사용자가 파트너여도 partners.total_points는 동기화하지 않음
        // partners.total_points는 번 포인트, members.total_points는 충전/사용 포인트로 분리됨

        return successResponse({
          log: result.log,
          newTotalPoints: result.new_total_points,
          message: 'Points logged successfully',
        });

      } catch (error) {
        return errorResponse('POINTS_LOG_ERROR', 'Failed to log points', error.message);
      }
    }

    // POST /api-members/donation - Donate points to partner
    // 안전한 RPC 함수 사용 (원자적 트랜잭션 + 중복 방지 + 자동 롤백)
    if (pathname === '/api-members/donation' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body || !body.partner_id || !body.amount) {
        return errorResponse('INVALID_BODY', 'Partner ID and amount are required');
      }

      const { partner_id, amount, description, log_id } = body;
      const donationAmount = parseInt(amount, 10);

      // 프론트엔드 검증 (RPC에서도 다시 검증함)
      if (donationAmount < 1000) {
        return errorResponse('MIN_AMOUNT_REQUIRED', '최소 1,000P 이상 후원해야 합니다.');
      }

      try {
        // 고유한 log_id 생성 (중복 요청 방지)
        const donationLogId = log_id || `donation_${partner_id}_${user.id}_${Date.now()}`;

        // RPC 함수 호출 (원자적 트랜잭션)
        const { data: result, error: rpcError } = await supabase.rpc('process_donation', {
          p_donor_id: user.id,
          p_partner_id: partner_id,
          p_amount: donationAmount,
          p_description: description || '파트너 후원',
          p_log_id: donationLogId,
        });

        if (rpcError) {
          console.error('Donation RPC error:', rpcError);
          throw rpcError;
        }

        // RPC 함수 결과 확인
        if (!result || !result.success) {
          const errorCode = result?.error_code || 'DONATION_FAILED';
          const errorMessage = result?.error_message || '후원 처리에 실패했습니다.';
          
          // 특정 에러 코드에 따른 응답
          if (errorCode === 'INSUFFICIENT_POINTS') {
            return errorResponse('INSUFFICIENT_POINTS', errorMessage, {
              required: result?.required,
              available: result?.available,
            });
          }
          if (errorCode === 'DUPLICATE_REQUEST') {
            return errorResponse('DUPLICATE_REQUEST', errorMessage);
          }
          if (errorCode === 'MIN_AMOUNT_REQUIRED') {
            return errorResponse('MIN_AMOUNT_REQUIRED', errorMessage);
          }
          
          return errorResponse(errorCode, errorMessage);
        }

        return successResponse({
          success: true,
          message: 'Donation completed successfully',
          memberNewPoints: result.member_new_points,
          partnerNewPoints: result.partner_new_points,
          amount: result.amount,
          logId: result.log_id,
        });

      } catch (error) {
        console.error('Donation error:', error);
        return errorResponse('DONATION_ERROR', 'Failed to process donation', error.message);
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