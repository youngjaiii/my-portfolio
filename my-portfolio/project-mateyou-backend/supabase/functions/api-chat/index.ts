import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, createSupabaseClient, errorResponse, successResponse, validateMethod, getAuthUser, parseRequestBody, getQueryParams } from '../_shared/utils.ts';
import type { ChatRoom, ChatMessage } from '../_shared/types.ts';

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

      const { data: roomsData, error: roomsError } = await supabase
        .from('chat_rooms')
        .select(`
          *,
          members!partner_id(id, member_code, name, profile_image),
          chat_messages(
            id, message, message_type, created_at, sender_id
          )
        `)
        .or(`created_by.eq.${user.id},partner_id.eq.${user.id}`)
        .eq('is_active', true)
        .order('updated_at', { ascending: false });

      if (roomsError) throw roomsError;

      // Get latest message for each room
      const roomsWithLatestMessage = (roomsData || []).map(room => {
        // Sort messages by created_at desc and get the latest one
        const sortedMessages = (room.chat_messages || []).sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        const latestMessage = sortedMessages[0];
        return {
          ...room,
          latest_message: latestMessage || null,
          chat_messages: undefined, // Remove messages array to reduce payload
        };
      });

      return successResponse(roomsWithLatestMessage);
    }

    // POST /api-chat/rooms - Create or get existing chat room
    if (pathname === '/api-chat/rooms' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body || !body.partner_id) {
        return errorResponse('INVALID_BODY', 'Partner ID is required');
      }

      const { partner_id } = body;

      // Check if room already exists
      const { data: existingRoom, error: checkError } = await supabase
        .from('chat_rooms')
        .select('*')
        .or(`and(created_by.eq.${user.id},partner_id.eq.${partner_id}),and(created_by.eq.${partner_id},partner_id.eq.${user.id})`)
        .eq('is_active', true)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      if (existingRoom) {
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
    if (pathname.includes('/messages/') && req.method === 'GET') {
      const user = await getAuthUser(req);
      const roomId = pathname.split('/messages/')[1];
      const params = getQueryParams(req.url);
      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '50');
      const offset = (page - 1) * limit;

      if (!roomId) {
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

      // Get messages
      const { data: messagesData, error: messagesError, count } = await supabase
        .from('chat_messages')
        .select(`
          *,
          members!sender_id(id, name, profile_image)
        `, { count: 'exact' })
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (messagesError) throw messagesError;

      return successResponse(messagesData?.reverse() || [], {
        total: count || 0,
        page,
        limit,
      });
    }

    // POST /api-chat/messages - Send a message
    if (pathname === '/api-chat/messages' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body || !body.room_id || !body.message) {
        return errorResponse('INVALID_BODY', 'Room ID and message are required');
      }

      const { room_id, message, message_type = 'text' } = body;

      // Verify user has access to this room
      const { data: roomData, error: roomError } = await supabase
        .from('chat_rooms')
        .select('id, created_by, partner_id')
        .eq('id', room_id)
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

      // Create message
      const { data: newMessage, error: messageError } = await supabase
        .from('chat_messages')
        .insert([{
          room_id,
          sender_id: user.id,
          message,
          message_type,
        }])
        .select(`
          *,
          members!sender_id(id, name, profile_image)
        `)
        .single();

      if (messageError) throw messageError;

      // Update room's updated_at timestamp
      await supabase
        .from('chat_rooms')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', room_id);

      // 🔔 푸시 알림 전송
      try {
        // 메시지를 받을 사용자 ID 결정 (보낸 사람이 아닌 상대방)
        const receiverId = roomData.created_by === user.id ? roomData.partner_id : roomData.created_by;
        const senderName = newMessage.members?.name || '사용자';

        // 푸시 알림 전송 (새로운 send-push 함수 사용)
        const pushResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': req.headers.get('Authorization') || '',
            'apikey': Deno.env.get('SUPABASE_ANON_KEY') || '',
          },
          body: JSON.stringify({
            user_id: receiverId,
            title: senderName || '사용자',
            body: message_type === 'text' ? message : '새 메시지가 도착했습니다.',
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

        if (pushResponse.ok) {
          const pushResult = await pushResponse.json();
          console.log('🔔 Push notification sent:', pushResult);
        } else {
          console.error('❌ Push notification failed:', await pushResponse.text());
        }
      } catch (pushError) {
        console.error('❌ Push notification error:', pushError);
        // 푸시 알림 실패는 메시지 전송에 영향을 주지 않음
      }

      return successResponse(newMessage);
    }

    // DELETE /api-chat/rooms/:roomId - Deactivate a chat room
    if (pathname.includes('/rooms/') && req.method === 'DELETE') {
      const user = await getAuthUser(req);
      const roomId = pathname.split('/rooms/')[1];

      if (!roomId) {
        return errorResponse('INVALID_ROOM_ID', 'Room ID is required');
      }

      // Verify user has access to this room
      const { data: roomData, error: roomError } = await supabase
        .from('chat_rooms')
        .select('id, created_by, partner_id')
        .eq('id', roomId)
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

      // Deactivate room
      const { data: updatedRoom, error: updateError } = await supabase
        .from('chat_rooms')
        .update({ is_active: false })
        .eq('id', roomId)
        .select()
        .single();

      if (updateError) throw updateError;

      return successResponse(updatedRoom);
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