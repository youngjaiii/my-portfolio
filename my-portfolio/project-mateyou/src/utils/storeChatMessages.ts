import { edgeApi } from '@/lib/edgeApi';
import { supabase } from '@/lib/supabase';

/**
 * 개인 택배 상품 결제 완료 후 구매요청 메시지 발송
 * 멱등성: 동일 order_id로 중복 발송 방지
 */
export async function sendPurchaseRequestMessage(
  orderId: string,
  order: {
    product: {
      name: string;
      partner_id: string;
      partner?: {
        member?: {
          id: string;
        };
      };
    };
    quantity: number;
    total_amount: number;
    recipient_name?: string;
    recipient_address?: string;
  },
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // 파트너 member_id 조회
    const partnerMemberId = order.product.partner?.member?.id;
    if (!partnerMemberId) {
      console.warn('파트너 member_id를 찾을 수 없습니다.');
      return { success: false, error: '파트너 정보를 찾을 수 없습니다.' };
    }

    // 채팅방 조회/생성
    const roomResponse = await edgeApi.chat.createRoom(partnerMemberId);
    if (!roomResponse.success || !roomResponse.data?.id) {
      return { success: false, error: '채팅방 생성 실패' };
    }
    const roomId = roomResponse.data.id;

    // 멱등성 체크: 기존 메시지에서 동일 order_id로 발송된 메시지 확인
    const { data: existingMessages } = await supabase
      .from('member_chats')
      .select('id, message')
      .eq('chat_room_id', roomId)
      .eq('sender_id', userId)
      .contains('message', `주문번호: ${orderId}`)
      .order('created_at', { ascending: false })
      .limit(1);

    if (existingMessages && existingMessages.length > 0) {
      console.log('이미 구매요청 메시지가 발송되었습니다.');
      return { success: true };
    }

    // 구매요청 메시지 생성
    const message = `🛒 택배 상품 구매 알림\n\n` +
      `상품명: ${order.product.name}\n` +
      `주문번호: ${orderId}\n` +
      `구매 수량: ${order.quantity}개\n` +
      `결제 금액: ${order.total_amount.toLocaleString()}P\n` +
      (order.recipient_name ? `받는 분: ${order.recipient_name}\n` : '') +
      (order.recipient_address ? `배송지: ${order.recipient_address}\n` : '') +
      `\n배송 준비 부탁드립니다. 감사합니다!`;

    // 메시지 발송
    const sendResponse = await edgeApi.chat.sendMessage(roomId, message, 'text');
    if (!sendResponse.success) {
      return { success: false, error: sendResponse.error?.message || '메시지 발송 실패' };
    }

    return { success: true };
  } catch (error: any) {
    console.error('구매요청 메시지 발송 실패:', error);
    return { success: false, error: error.message || '메시지 발송 중 오류가 발생했습니다.' };
  }
}

/**
 * 송장 입력 후 배송정보 메시지 발송
 * 멱등성: 동일 송장번호로 중복 발송 방지
 */
export async function sendShippingInfoMessage(
  orderId: string,
  order: {
    product: {
      name: string;
      partner_id: string;
      partner?: {
        member?: {
          id: string;
        };
      };
    };
    user_id: string;
    courier: string;
    tracking_number: string;
  },
  currentUserId: string // 파트너의 member_id (현재 로그인한 사용자)
): Promise<{ success: boolean; error?: string }> {
  try {
    // 유저 member_id (메시지를 받을 사람)
    const userMemberId = order.user_id;
    if (!userMemberId) {
      console.warn('유저 member_id를 찾을 수 없습니다.');
      return { success: false, error: '유저 정보를 찾을 수 없습니다.' };
    }

    // 채팅방 조회/생성 (파트너가 유저와의 채팅방을 생성/조회)
    // createRoom의 partner_id는 상대방의 member_id를 의미
    const roomResponse = await edgeApi.chat.createRoom(userMemberId);
    if (!roomResponse.success || !roomResponse.data?.id) {
      return { success: false, error: '채팅방 생성 실패' };
    }
    const roomId = roomResponse.data.id;

    // 멱등성 체크: 기존 메시지에서 동일 송장번호로 발송된 메시지 확인
    const { data: existingMessages } = await supabase
      .from('member_chats')
      .select('id, message')
      .eq('chat_room_id', roomId)
      .eq('sender_id', currentUserId) // 파트너가 보낸 메시지
      .contains('message', `송장번호: ${order.tracking_number}`)
      .order('created_at', { ascending: false })
      .limit(1);

    if (existingMessages && existingMessages.length > 0) {
      console.log('이미 배송정보 메시지가 발송되었습니다.');
      return { success: true };
    }

    // 배송정보 메시지 생성
    const message = `🚚 배송 정보 안내\n\n` +
      `상품명: ${order.product.name}\n` +
      `주문번호: ${orderId}\n` +
      `택배사: ${order.courier}\n` +
      `송장번호: ${order.tracking_number}\n\n` +
      `배송이 시작되었습니다. 배송 추적은 택배사 홈페이지에서 확인하실 수 있습니다.`;

    // 메시지 발송 (파트너가 유저에게 발송)
    // edgeApi.chat.sendMessage는 현재 로그인한 사용자(파트너)가 sender가 됨
    const sendResponse = await edgeApi.chat.sendMessage(roomId, message, 'text');
    if (!sendResponse.success) {
      return { success: false, error: sendResponse.error?.message || '메시지 발송 실패' };
    }

    return { success: true };
  } catch (error: any) {
    console.error('배송정보 메시지 발송 실패:', error);
    return { success: false, error: error.message || '메시지 발송 중 오류가 발생했습니다.' };
  }
}

