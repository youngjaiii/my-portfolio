import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, createSupabaseClient, errorResponse, successResponse, getAuthUser, parseRequestBody, getQueryParams } from '../_shared/utils.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const supabase = createSupabaseClient();

    // ===== POST /api-store-refunds - 환불 요청 (order_item_id 기준) =====
    if (pathname === '/api-store-refunds' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body) {
        return errorResponse('INVALID_REQUEST', '요청 본문이 필요합니다.');
      }

      const { order_item_id, reason } = body;

      if (!order_item_id) {
        return errorResponse('INVALID_REQUEST', '주문 아이템 ID는 필수입니다.');
      }

      // 주문 아이템 확인
      const { data: orderItem, error: orderItemError } = await supabase
        .from('store_order_items')
        .select(`
          order_item_id, product_id, product_name, product_type, product_source, 
          quantity, subtotal, status, is_confirmed,
          order:store_orders(
            order_id, user_id, status, is_confirmed, total_amount, total_shipping_fee,
            partner_id, reserved_end_time,
            partner:partners(id, partner_name, member_id)
          )
        `)
        .eq('order_item_id', order_item_id)
        .single();

      if (orderItemError || !orderItem) {
        return errorResponse('NOT_FOUND', '주문 아이템을 찾을 수 없습니다.', null, 404);
      }

      // deno-lint-ignore no-explicit-any
      const order = orderItem.order as any;

      // 소유권 확인
      if (order?.user_id !== user.id) {
        return errorResponse('FORBIDDEN', '권한이 없습니다.', null, 403);
      }

      // 1. 구매 확정된 아이템 환불 불가
      if (orderItem.is_confirmed || orderItem.status === 'confirmed') {
        return errorResponse('INVALID_REQUEST', '구매 확정된 상품은 환불이 불가능합니다.');
      }

      // 기존 환불 요청 확인 (해당 아이템에 대해)
      const { data: existingRefund } = await supabase
        .from('store_refunds')
        .select('refund_id, status')
        .eq('order_item_id', order_item_id)
        .not('status', 'in', '("rejected","completed")')
        .maybeSingle();

      if (existingRefund) {
        return errorResponse('INVALID_REQUEST', '이미 환불 요청이 진행 중입니다.');
      }

      // 환불 가능 여부 체크 (product_type 기준)
      const productType = orderItem.product_type;
      const productSource = orderItem.product_source;

      // 디지털 화보: 결제 즉시 환불 불가
      if (productType === 'digital') {
        return errorResponse('INVALID_REQUEST', '디지털 화보는 환불이 불가능합니다.');
      }

      // 현장 수령: 미수령(no_show)인 경우만 환불 가능
      if (productType === 'on_site') {
        const { data: pickup } = await supabase
          .from('store_on_site_pickups')
          .select('is_picked_up, no_show')
          .eq('order_id', order.order_id)
          .single();

        if (pickup?.is_picked_up) {
          return errorResponse('INVALID_REQUEST', '이미 수령한 상품은 환불이 불가능합니다.');
        }

        if (order.reserved_end_time && new Date(order.reserved_end_time) < new Date() && !pickup?.no_show) {
          return errorResponse('INVALID_REQUEST', '수령 시간이 지났습니다. 파트너에게 문의해주세요.');
        }
      }

      // 택배 수령: 출고 이후 또는 배송완료(구매확정 전) 상태에서 환불 가능
      if (productType === 'delivery') {
        if (order.status === 'paid' || order.status === 'pending') {
          return errorResponse('INVALID_REQUEST', '출고 전 주문은 주문 취소를 이용해주세요.');
        }

        if (!['shipped', 'delivered'].includes(order.status)) {
          return errorResponse('INVALID_REQUEST', '배송 중 또는 배송 완료(구매확정 전) 상태의 주문만 환불 요청이 가능합니다.');
        }
      }

      // 환불 금액 계산 (해당 아이템의 금액)
      const refundAmount = orderItem.subtotal || 0;

      // 환불 요청 생성 (order_item_id 기준)
      const { data: refund, error: refundError } = await supabase
        .from('store_refunds')
        .insert({
          order_id: order.order_id,
          order_item_id: order_item_id,
          refund_amount: refundAmount,
          reason: reason || '고객 요청에 의한 환불',
          status: 'requested',
          return_shipping_fee: 0 // 아이템별 환불에서는 배송비 미포함
        })
        .select()
        .single();

      if (refundError) throw refundError;

      // 해당 order_item 상태 업데이트
      await supabase
        .from('store_order_items')
        .update({ status: 'refund_requested' })
        .eq('order_item_id', order_item_id);

      // === 판매자(파트너/관리자)에게 환불 요청 푸시 알림 발송 ===
      const isCollaborationProduct = productSource === 'collaboration';
      const productName = orderItem.product_name || '상품';

      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
      const authHeader = req.headers.get('Authorization') || `Bearer ${anonKey}`;

      if (isCollaborationProduct) {
        // 협업 상품: 관리자에게 알림
        const { data: admins } = await supabase
          .from('members')
          .select('id')
          .eq('role', 'admin')
          .limit(1);

        if (admins && admins.length > 0) {
          try {
            await fetch(`${supabaseUrl}/functions/v1/push-native`, {
              method: 'POST',
              headers: {
                'Authorization': authHeader,
                'apikey': anonKey || '',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                action: 'enqueue_notification',
                user_id: admins[0].id,
                target_member_id: admins[0].id,
                title: '💸 환불 요청 (협업)',
                body: `${productName} 상품의 환불 요청이 접수되었습니다. (${refundAmount.toLocaleString()}P)`,
                icon: null,
                url: '/admin/store/refunds',
                notification_type: 'store_refund_requested',
                tag: `refund_requested_${refund.refund_id}`,
                data: { refund_id: refund.refund_id, order_item_id, refund_amount: refundAmount },
                process_immediately: true,
              }),
            });
          } catch (e) {
            console.error('환불 요청 푸시 알림 발송 실패:', e);
          }
        }
      } else {
        // 일반 상품: 파트너에게 알림
        // deno-lint-ignore no-explicit-any
        const partner = order.partner as any;
        if (partner?.member_id) {
          try {
            await fetch(`${supabaseUrl}/functions/v1/push-native`, {
              method: 'POST',
              headers: {
                'Authorization': authHeader,
                'apikey': anonKey || '',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                action: 'enqueue_notification',
                user_id: partner.member_id,
                target_member_id: partner.member_id,
                title: '💸 환불 요청',
                body: `${productName} 상품의 환불 요청이 접수되었습니다. (${refundAmount.toLocaleString()}P)`,
                icon: null,
                url: '/partner/store/refunds',
                notification_type: 'store_refund_requested',
                tag: `refund_requested_${refund.refund_id}`,
                data: { refund_id: refund.refund_id, order_item_id, refund_amount: refundAmount },
                process_immediately: true,
              }),
            });
          } catch (e) {
            console.error('환불 요청 푸시 알림 발송 실패:', e);
          }
        }
      }

      // 환불 상태에 따른 메시지 (상품 source로 구분)
      const statusMessage = productSource === 'collaboration'
        ? '환불 요청이 접수되었습니다. 관리자의 승인을 기다려주세요.'
        : '환불 요청이 접수되었습니다. 파트너의 승인을 기다려주세요.';

      return successResponse({
        ...refund,
        original_amount: orderItem.subtotal,
        refund_amount: refundAmount,
        message: statusMessage
      });
    }

    // ===== GET /api-store-refunds - 내 환불 요청 목록 =====
    // 날짜 필터: requested_from, requested_to (환불요청시간), processed_from, processed_to (환불응답시간)
    if (pathname === '/api-store-refunds' && req.method === 'GET') {
      const user = await getAuthUser(req);
      const params = getQueryParams(req.url);
      const status = params.status;
      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '20');
      const offset = (page - 1) * limit;
      
      // 날짜 필터 파라미터
      const requestedFrom = params.requested_from; // 환불요청 시작일 (ISO 8601)
      const requestedTo = params.requested_to; // 환불요청 종료일 (ISO 8601)
      const processedFrom = params.processed_from; // 환불응답 시작일 (ISO 8601)
      const processedTo = params.processed_to; // 환불응답 종료일 (ISO 8601)

      // 내 주문 ID 목록
      const { data: orders } = await supabase
        .from('store_orders')
        .select('order_id')
        .eq('user_id', user.id);

      const orderIds = orders?.map((o: { order_id: string }) => o.order_id) || [];

      if (orderIds.length === 0) {
        return successResponse([], { total: 0, page, limit, totalPages: 0 });
      }

      let query = supabase
        .from('store_refunds')
        .select(`
          *,
          order:store_orders(
            order_id, order_number, total_amount, total_shipping_fee, status,
            order_items:store_order_items(order_item_id, product_id, product_name, product_type, product_source, quantity, subtotal),
            shipments:store_shipments(shipment_id, status, shipping_fee),
            partner:partners(id, partner_name)
          )
        `, { count: 'exact' })
        .in('order_id', orderIds);

      if (status) {
        query = query.eq('status', status);
      }

      // 환불요청시간 필터 (created_at)
      if (requestedFrom) {
        query = query.gte('created_at', requestedFrom);
      }
      if (requestedTo) {
        query = query.lte('created_at', requestedTo);
      }

      // 환불응답시간 필터 (processed_at)
      if (processedFrom) {
        query = query.gte('processed_at', processedFrom);
      }
      if (processedTo) {
        query = query.lte('processed_at', processedTo);
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      return successResponse(data, {
        total: count,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      });
    }

    // ===== GET /api-store-refunds/:id - 환불 상세 조회 =====
    const refundDetailMatch = pathname.match(/^\/api-store-refunds\/([a-f0-9-]+)$/);
    if (refundDetailMatch && req.method === 'GET') {
      const user = await getAuthUser(req);
      const refundId = refundDetailMatch[1];

      const { data: refund, error } = await supabase
        .from('store_refunds')
        .select(`
          *,
          order:store_orders(
            order_id, order_number, user_id, partner_id, total_amount, total_shipping_fee, status, is_confirmed,
            order_items:store_order_items(
              order_item_id, product_id, product_name, product_type, product_source, quantity, subtotal, is_confirmed
            ),
            shipments:store_shipments(shipment_id, status, shipping_fee, courier, tracking_number),
            partner:partners(id, partner_name),
            buyer:members!user_id(id, name, profile_image, member_code)
          )
        `)
        .eq('refund_id', refundId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return errorResponse('NOT_FOUND', '환불 요청을 찾을 수 없습니다.', null, 404);
        }
        throw error;
      }

      // 권한 확인
      const { data: member } = await supabase
        .from('members')
        .select('role')
        .eq('id', user.id)
        .single();

      const isAdmin = member?.role === 'admin';
      const isOwner = refund.order?.user_id === user.id;

      const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', user.id)
        .maybeSingle();

      const isPartnerOwner = partner && refund.order?.partner_id === partner.id;

      if (!isAdmin && !isOwner && !isPartnerOwner) {
        return errorResponse('FORBIDDEN', '권한이 없습니다.', null, 403);
      }

      return successResponse(refund);
    }

    // ===== PUT /api-store-refunds/:id/partner-respond - 파트너 환불 요청 수락/거절 =====
    const partnerRespondMatch = pathname.match(/^\/api-store-refunds\/([a-f0-9-]+)\/partner-respond$/);
    if (partnerRespondMatch && req.method === 'PUT') {
      const user = await getAuthUser(req);
      const refundId = partnerRespondMatch[1];
      const body = await parseRequestBody(req);

      if (!body || !body.action) {
        return errorResponse('INVALID_REQUEST', 'action (accept/reject)이 필요합니다.');
      }

      const { action, rejection_reason } = body;

      if (!['accept', 'reject'].includes(action)) {
        return errorResponse('INVALID_REQUEST', 'action은 accept 또는 reject이어야 합니다.');
      }

      // 파트너 확인
      const { data: partner, error: partnerCheckError } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', user.id)
        .maybeSingle();

      if (partnerCheckError) throw partnerCheckError;

      if (!partner) {
        return errorResponse('FORBIDDEN', '파트너만 환불 요청을 처리할 수 있습니다.', null, 403);
      }

      // 환불 요청 확인 (정규화된 구조, 스케줄 정보, selected_options 포함)
      const { data: refund, error: refundError } = await supabase
        .from('store_refunds')
        .select(`
          *,
          order:store_orders(
            order_id, user_id, partner_id, total_amount, total_shipping_fee, status,
            order_items:store_order_items(
              order_item_id, product_id, product_name, product_type, product_source, quantity, subtotal, selected_options,
              product:store_products(product_id, stock, parent_product_id)
            ),
            shipments:store_shipments(shipment_id, status, shipping_fee),
            schedule:store_partner_schedules(schedule_id, current_bookings)
          )
        `)
        .eq('refund_id', refundId)
        .single();

      if (refundError || !refund) {
        return errorResponse('NOT_FOUND', '환불 요청을 찾을 수 없습니다.', null, 404);
      }

      // 파트너 소유 상품인지 확인
      if (refund.order?.partner_id !== partner.id) {
        return errorResponse('FORBIDDEN', '본인 상품의 환불 요청만 처리할 수 있습니다.', null, 403);
      }

      // 일반 파트너 상품인지 확인 (협업 상품은 관리자가 처리)
      const orderItems = refund.order?.order_items || [];
      const hasCollaborationItem = orderItems.some((item: any) => item.product_source === 'collaboration');
      if (hasCollaborationItem) {
        return errorResponse('INVALID_REQUEST', '협업 상품의 환불 요청은 관리자가 처리합니다.');
      }

      // 환불 요청 대기 상태인지 확인
      if (refund.status !== 'requested') {
        return errorResponse('INVALID_REQUEST', '승인 대기 중인 환불 요청만 처리할 수 있습니다.');
      }

      // ===== 환불 수락 처리 =====
      if (action === 'accept') {
        // 배송비는 shipments에서 가져오거나 total_shipping_fee 사용
        const shipment = refund.order.shipments?.[0];
        const shippingFee = shipment?.shipping_fee || refund.order.total_shipping_fee || 0;
        const refundAmount = refund.refund_amount || Math.max(0, refund.order.total_amount - shippingFee);
        const orderItems = refund.order.order_items || [];
        const hasDeliveryItem = orderItems.some((item: any) => item.product_type === 'delivery');

        // 구매자에게 포인트 환불
        const buyerId = refund.order.user_id;
        const productNames = orderItems.map((item: any) => item.product_name).join(', ');
        const logId = crypto.randomUUID();

        // 택배수령 상품일 때만 배송비 정보 표시
        const description = hasDeliveryItem && shippingFee > 0
          ? `[환불] ${productNames} (배송비 ${shippingFee.toLocaleString()}원 제외)`
          : `[환불] ${productNames}`;

        const { error: pointsError } = await supabase.rpc('update_member_points_with_log', {
          p_member_id: buyerId,
          p_type: 'earn',
          p_amount: refundAmount,
          p_description: description,
          p_log_id: logId
        });

        if (pointsError) {
          console.error('포인트 환불 오류:', pointsError);
          throw new Error('포인트 환불 처리 중 오류가 발생했습니다.');
        }

        // ===== 택배수령상품 환불 시 파트너에게 배송비 지급 =====
        // 파트너 개인상품만 처리 (협업상품은 배송비 지급 없음)
        const partnerId = refund.order.partner_id;
        if (partnerId && hasDeliveryItem && shippingFee > 0) {
          const { data: partnerData, error: partnerFetchError } = await supabase
            .from('partners')
            .select('id, store_points')
            .eq('id', partnerId)
            .single();

          if (!partnerFetchError && partnerData) {
            // 배송비를 파트너 store_points에 추가 (배송은 완료되었으므로 배송비 수익은 파트너 것)
            const newStorePoints = (partnerData.store_points || 0) + shippingFee;

            await supabase
              .from('partners')
              .update({ store_points: newStorePoints })
              .eq('id', partnerId);

            // 파트너 포인트 로그 기록
            const partnerLogId = `store_refund_shipping_${refund.refund_id}_${partnerId}`;
            await supabase.from('partner_points_logs').insert({
              partner_id: partnerId,
              type: 'earn',
              amount: shippingFee,
              description: `[환불 배송비 정산] ${productNames}`,
              log_id: partnerLogId,
              point_type: 'store_points'
            });

            console.log(`[환불] 파트너 배송비 지급 완료: partnerId=${partnerId}, shippingFee=${shippingFee}`);
          }
        }

        // 환불 상태 업데이트
        const { error: updateRefundError } = await supabase
          .from('store_refunds')
          .update({
            status: 'completed',
            processed_by: user.id,
            processed_date: new Date().toISOString()
          })
          .eq('refund_id', refundId);

        if (updateRefundError) throw updateRefundError;

        // 주문 상태 업데이트
        await supabase
          .from('store_orders')
          .update({ status: 'refunded' })
          .eq('order_id', refund.order_id);

        // order_items 상태도 업데이트
        await supabase
          .from('store_order_items')
          .update({ status: 'refunded' })
          .eq('order_id', refund.order_id);

        // 재고 복구 (delivery, on_site 상품)
        for (const item of orderItems) {
          if (['delivery', 'on_site'].includes(item.product_type) && item.product?.stock !== null) {
            const quantityToRestore = item.quantity || 1;
            const newStock = (item.product.stock || 0) + quantityToRestore;
            
            // 현재 상품 재고 복구
            await supabase
              .from('store_products')
              .update({ stock: newStock })
              .eq('product_id', item.product_id);

            // 복제된 상품인 경우 원본 상품 재고도 동기화
            const parentProductId = item.product?.parent_product_id;
            if (parentProductId) {
              const { data: parentProduct } = await supabase
                .from('store_products')
                .select('product_id, stock')
                .eq('product_id', parentProductId)
                .single();

              if (parentProduct) {
                const parentNewStock = (parentProduct.stock || 0) + quantityToRestore;
                await supabase
                  .from('store_products')
                  .update({ stock: parentNewStock })
                  .eq('product_id', parentProductId);

                await supabase
                  .from('store_products')
                  .update({ stock: parentNewStock })
                  .eq('parent_product_id', parentProductId)
                  .neq('product_id', item.product_id);
              }
            }
          }

          // 옵션 재고 복구 (selected_options가 있는 경우)
          const selectedOptions = item.selected_options || [];
          for (const opt of selectedOptions as Array<{ option_type: string; value_id?: string }>) {
            if (opt.option_type === 'select' && opt.value_id) {
              const { data: optValue } = await supabase
                .from('store_product_option_values')
                .select('stock')
                .eq('value_id', opt.value_id)
                .single();

              if (optValue && optValue.stock !== null) {
                const newOptionStock = optValue.stock + (item.quantity || 1);
                await supabase
                  .from('store_product_option_values')
                  .update({ stock: newOptionStock })
                  .eq('value_id', opt.value_id);
                
                console.log(`[환불 수락] 옵션 재고 복구: ${opt.value_id}, ${newOptionStock}`);
              }
            }
          }
        }

        // 현장수령 상품의 경우 스케줄 복구
        const hasOnSiteItem = orderItems.some((item: any) => item.product_type === 'on_site');
        if (hasOnSiteItem) {
          const scheduleData = refund.order?.schedule;
          if (scheduleData && scheduleData.length > 0) {
            const schedule = scheduleData[0];
            const newBookings = Math.max(0, (schedule.current_bookings || 0) - 1);
            await supabase
              .from('store_partner_schedules')
              .update({ 
                current_bookings: newBookings,
                is_available: true
              })
              .eq('schedule_id', schedule.schedule_id);
            
            console.log(`[환불 수락] 스케줄 current_bookings 감소: ${schedule.schedule_id}, ${newBookings}`);
          }
        }

        // 정산 취소
        await supabase
          .from('store_transactions')
          .delete()
          .eq('order_id', refund.order_id)
          .eq('status', 'pending');

        // 업데이트된 환불 정보 조회
        const { data: updatedRefund } = await supabase
          .from('store_refunds')
          .select(`
            *,
            order:store_orders(
              order_id, order_number, total_amount, status, chat_room_id,
              order_items:store_order_items(order_item_id, product_name, quantity),
              buyer:members!user_id(id, name, profile_image)
            )
          `)
          .eq('refund_id', refundId)
          .single();

        // === 구매자에게 환불 수락 푸시 알림 발송 ===
        if (buyerId) {
          const pushUrl = Deno.env.get('SUPABASE_URL');
          const pushKey = Deno.env.get('SUPABASE_ANON_KEY');
          const pushAuthHeader = req.headers.get('Authorization') || `Bearer ${pushKey}`;

          try {
            await fetch(`${pushUrl}/functions/v1/push-native`, {
              method: 'POST',
              headers: {
                'Authorization': pushAuthHeader,
                'apikey': pushKey || '',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                action: 'enqueue_notification',
                user_id: buyerId,
                target_member_id: buyerId,
                title: '✅ 환불 승인',
                body: `${productNames} 상품 환불이 승인되었습니다. (${refundAmount.toLocaleString()}P 지급)`,
                icon: null,
                url: `/store/orders/${refund.order_id}`,
                notification_type: 'store_refund_approved',
                tag: `refund_approved_${refundId}`,
                data: { refund_id: refundId, refund_amount: refundAmount },
                process_immediately: true,
              }),
            });
          } catch (e) {
            console.error('환불 승인 푸시 알림 발송 실패:', e);
          }
        }

        return successResponse({
          ...updatedRefund,
          refund_amount: refundAmount,
          shipping_fee_deducted: shippingFee,
          message: `환불이 완료되었습니다. ${refundAmount.toLocaleString()}P가 구매자에게 지급되었습니다.`
        });
      }

      // ===== 환불 거절 처리 =====
      if (action === 'reject') {
        if (!rejection_reason) {
          return errorResponse('INVALID_REQUEST', '거절 사유가 필요합니다.');
        }

        // 환불 상태 업데이트
        const { error: updateRefundError } = await supabase
          .from('store_refunds')
          .update({
            status: 'rejected',
            rejection_reason,
            processed_by: user.id,
            processed_date: new Date().toISOString()
          })
          .eq('refund_id', refundId);

        if (updateRefundError) throw updateRefundError;

        // 주문 상태 원복 (배송 중으로)
        await supabase
          .from('store_orders')
          .update({ status: 'shipped' })
          .eq('order_id', refund.order_id);

        // order_items 상태도 원복
        await supabase
          .from('store_order_items')
          .update({ status: 'shipped' })
          .eq('order_id', refund.order_id);

        // 업데이트된 환불 정보 조회
        const { data: updatedRefund } = await supabase
          .from('store_refunds')
          .select(`
            *,
            order:store_orders(
              order_id, order_number, total_amount, status,
              order_items:store_order_items(order_item_id, product_name, quantity)
            )
          `)
          .eq('refund_id', refundId)
          .single();

        // === 구매자에게 환불 거절 푸시 알림 발송 ===
        if (refund.order?.user_id) {
          // deno-lint-ignore no-explicit-any
          const productNames = orderItems.map((item: any) => item.product_name).join(', ');
          const pushUrl = Deno.env.get('SUPABASE_URL');
          const pushKey = Deno.env.get('SUPABASE_ANON_KEY');
          const pushAuthHeader = req.headers.get('Authorization') || `Bearer ${pushKey}`;

          try {
            await fetch(`${pushUrl}/functions/v1/push-native`, {
              method: 'POST',
              headers: {
                'Authorization': pushAuthHeader,
                'apikey': pushKey || '',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                action: 'enqueue_notification',
                user_id: refund.order.user_id,
                target_member_id: refund.order.user_id,
                title: '❌ 환불 거절',
                body: `${productNames} 상품 환불이 거절되었습니다. 사유: ${rejection_reason}`,
                icon: null,
                url: `/store/orders/${refund.order_id}`,
                notification_type: 'store_refund_rejected',
                tag: `refund_rejected_${refundId}`,
                data: { refund_id: refundId, rejection_reason },
                process_immediately: true,
              }),
            });
          } catch (e) {
            console.error('환불 거절 푸시 알림 발송 실패:', e);
          }
        }

        return successResponse({
          ...updatedRefund,
          message: '환불 요청이 거절되었습니다.'
        });
      }
    }

    // ===== PUT /api-store-refunds/:id/process - 환불 처리 (관리자) =====
    const processMatch = pathname.match(/^\/api-store-refunds\/([a-f0-9-]+)\/process$/);
    if (processMatch && req.method === 'PUT') {
      const user = await getAuthUser(req);
      const refundId = processMatch[1];
      const body = await parseRequestBody(req);

      if (!body || !body.action) {
        return errorResponse('INVALID_REQUEST', 'action (approve/reject)이 필요합니다.');
      }

      const { action, rejection_reason } = body;

      // 환불 요청 확인 (정규화된 구조, 스케줄 정보, selected_options 포함)
      const { data: refund, error: refundError } = await supabase
        .from('store_refunds')
        .select(`
          *,
          order:store_orders(
            order_id, user_id, partner_id, total_amount, total_shipping_fee, status,
            order_items:store_order_items(
              order_item_id, product_id, product_name, product_type, product_source, quantity, subtotal, selected_options,
              product:store_products(product_id, stock, parent_product_id)
            ),
            shipments:store_shipments(shipment_id, status, shipping_fee),
            schedule:store_partner_schedules(schedule_id, current_bookings)
          )
        `)
        .eq('refund_id', refundId)
        .single();

      if (refundError || !refund) {
        return errorResponse('NOT_FOUND', '환불 요청을 찾을 수 없습니다.', null, 404);
      }

      // 권한 확인 (관리자만)
      const { data: member } = await supabase
        .from('members')
        .select('role')
        .eq('id', user.id)
        .single();

      const isAdmin = member?.role === 'admin';

      if (!isAdmin) {
        return errorResponse('FORBIDDEN', '관리자만 환불을 처리할 수 있습니다.', null, 403);
      }

      // 협업 상품만 관리자가 처리 가능
      const orderItems = refund.order?.order_items || [];
      const hasCollaborationItem = orderItems.some((item: any) => item.product_source === 'collaboration');
      if (!hasCollaborationItem) {
        return errorResponse('INVALID_REQUEST', '협업 상품의 환불 요청만 관리자가 처리할 수 있습니다. 일반 상품은 파트너가 처리해야 합니다.');
      }

      // 이미 완료된 환불인지 확인
      if (refund.status === 'completed') {
        return errorResponse('INVALID_REQUEST', '이미 완료된 환불 요청입니다.');
      }

      // requested 상태인지 확인
      if (refund.status !== 'requested') {
        return errorResponse('INVALID_REQUEST', '승인 대기 중인 환불 요청만 처리할 수 있습니다.');
      }

      // ===== 환불 승인 처리 =====
      if (action === 'approve') {
        // 배송비는 shipments에서 가져오거나 total_shipping_fee 사용
        const shipment = refund.order.shipments?.[0];
        const shippingFee = shipment?.shipping_fee || refund.order.total_shipping_fee || 0;
        const refundAmount = refund.refund_amount || Math.max(0, refund.order.total_amount - shippingFee);
        const hasDeliveryItem = orderItems.some((item: any) => item.product_type === 'delivery');

        // 구매자에게 포인트 환불
        const buyerId = refund.order.user_id;
        const productNames = orderItems.map((item: any) => item.product_name).join(', ');
        const logId = crypto.randomUUID();

        // 택배수령 상품일 때만 배송비 정보 표시
        const description = hasDeliveryItem && shippingFee > 0
          ? `[환불] ${productNames} (배송비 ${shippingFee.toLocaleString()}원 제외)`
          : `[환불] ${productNames}`;

        const { error: pointsError } = await supabase.rpc('update_member_points_with_log', {
          p_member_id: buyerId,
          p_type: 'earn',
          p_amount: refundAmount,
          p_description: description,
          p_log_id: logId
        });

        if (pointsError) {
          console.error('포인트 환불 오류:', pointsError);
          throw new Error('포인트 환불 처리 중 오류가 발생했습니다.');
        }

        // 환불 상태 업데이트
        const { error: updateRefundError } = await supabase
          .from('store_refunds')
          .update({
            status: 'completed',
            processed_by: user.id,
            processed_date: new Date().toISOString()
          })
          .eq('refund_id', refundId);

        if (updateRefundError) throw updateRefundError;

        // 주문 상태 업데이트
        await supabase
          .from('store_orders')
          .update({ status: 'refunded' })
          .eq('order_id', refund.order_id);

        // order_items 상태도 업데이트
        await supabase
          .from('store_order_items')
          .update({ status: 'refunded' })
          .eq('order_id', refund.order_id);

        // 정산 취소
        await supabase
          .from('store_transactions')
          .delete()
          .eq('order_id', refund.order_id)
          .eq('status', 'pending');

        // 재고 복구 (delivery, on_site 상품)
        for (const item of orderItems) {
          if (['delivery', 'on_site'].includes(item.product_type) && item.product?.stock !== null) {
            const quantityToRestore = item.quantity || 1;
            const newStock = (item.product.stock || 0) + quantityToRestore;
            
            // 현재 상품 재고 복구
            await supabase
              .from('store_products')
              .update({ stock: newStock })
              .eq('product_id', item.product_id);

            // 복제된 상품인 경우 원본 상품 재고도 동기화
            const parentProductId = item.product?.parent_product_id;
            if (parentProductId) {
              const { data: parentProduct } = await supabase
                .from('store_products')
                .select('product_id, stock')
                .eq('product_id', parentProductId)
                .single();

              if (parentProduct) {
                const parentNewStock = (parentProduct.stock || 0) + quantityToRestore;
                await supabase
                  .from('store_products')
                  .update({ stock: parentNewStock })
                  .eq('product_id', parentProductId);

                await supabase
                  .from('store_products')
                  .update({ stock: parentNewStock })
                  .eq('parent_product_id', parentProductId)
                  .neq('product_id', item.product_id);
              }
            }
          }

          // 옵션 재고 복구 (selected_options가 있는 경우)
          const selectedOptions = item.selected_options || [];
          for (const opt of selectedOptions as Array<{ option_type: string; value_id?: string }>) {
            if (opt.option_type === 'select' && opt.value_id) {
              const { data: optValue } = await supabase
                .from('store_product_option_values')
                .select('stock')
                .eq('value_id', opt.value_id)
                .single();

              if (optValue && optValue.stock !== null) {
                const newOptionStock = optValue.stock + (item.quantity || 1);
                await supabase
                  .from('store_product_option_values')
                  .update({ stock: newOptionStock })
                  .eq('value_id', opt.value_id);
                
                console.log(`[관리자 환불 승인] 옵션 재고 복구: ${opt.value_id}, ${newOptionStock}`);
              }
            }
          }
        }

        // 현장수령 상품의 경우 스케줄 복구 (관리자 환불 승인)
        const hasOnSiteItem = orderItems.some((item: any) => item.product_type === 'on_site');
        if (hasOnSiteItem) {
          const scheduleData = refund.order?.schedule;
          if (scheduleData && scheduleData.length > 0) {
            const schedule = scheduleData[0];
            const newBookings = Math.max(0, (schedule.current_bookings || 0) - 1);
            await supabase
              .from('store_partner_schedules')
              .update({ 
                current_bookings: newBookings,
                is_available: true
              })
              .eq('schedule_id', schedule.schedule_id);
            
            console.log(`[관리자 환불 승인] 스케줄 current_bookings 감소: ${schedule.schedule_id}, ${newBookings}`);
          }
        }

        // 업데이트된 환불 정보 조회 (채팅방 정보 포함)
        const { data: updatedRefund } = await supabase
          .from('store_refunds')
          .select(`
            *,
            order:store_orders(
              order_id, order_number, total_amount, status, chat_room_id,
              order_items:store_order_items(order_item_id, product_name, quantity),
              buyer:members!user_id(id, name, profile_image)
            )
          `)
          .eq('refund_id', refundId)
          .single();

        // === 구매자에게 환불 수락 푸시 알림 발송 (관리자) ===
        if (buyerId) {
          const pushUrl = Deno.env.get('SUPABASE_URL');
          const pushKey = Deno.env.get('SUPABASE_ANON_KEY');
          const pushAuthHeader = req.headers.get('Authorization') || `Bearer ${pushKey}`;

          try {
            await fetch(`${pushUrl}/functions/v1/push-native`, {
              method: 'POST',
              headers: {
                'Authorization': pushAuthHeader,
                'apikey': pushKey || '',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                action: 'enqueue_notification',
                user_id: buyerId,
                target_member_id: buyerId,
                title: '✅ 환불 승인',
                body: `${productNames} 상품 환불이 승인되었습니다. (${refundAmount.toLocaleString()}P 지급)`,
                icon: null,
                url: `/store/orders/${refund.order_id}`,
                notification_type: 'store_refund_approved',
                tag: `refund_approved_${refundId}`,
                data: { refund_id: refundId, refund_amount: refundAmount },
                process_immediately: true,
              }),
            });
          } catch (e) {
            console.error('환불 승인 푸시 알림 발송 실패:', e);
          }
        }

        return successResponse({
          ...updatedRefund,
          refund_amount: refundAmount,
          shipping_fee_deducted: shippingFee,
          message: `환불이 완료되었습니다. ${refundAmount.toLocaleString()}P가 구매자에게 지급되었습니다.`
        });
      }

      // ===== 환불 거절 처리 =====
      if (action === 'reject') {
        if (!rejection_reason) {
          return errorResponse('INVALID_REQUEST', '거절 사유가 필요합니다.');
        }

        // 환불 상태 업데이트
        const { error: updateRefundError } = await supabase
          .from('store_refunds')
          .update({
            status: 'rejected',
            rejection_reason,
            processed_by: user.id,
            processed_date: new Date().toISOString()
          })
          .eq('refund_id', refundId);

        if (updateRefundError) throw updateRefundError;

        // 주문 상태 원복
        await supabase
          .from('store_orders')
          .update({ status: 'shipped' })
          .eq('order_id', refund.order_id);

        // order_items 상태도 원복
        await supabase
          .from('store_order_items')
          .update({ status: 'shipped' })
          .eq('order_id', refund.order_id);

        // 업데이트된 환불 정보 조회
        const { data: updatedRefund } = await supabase
          .from('store_refunds')
          .select(`
            *,
            order:store_orders(
              order_id, order_number, total_amount, status,
              order_items:store_order_items(order_item_id, product_name, quantity)
            )
          `)
          .eq('refund_id', refundId)
          .single();

        // === 구매자에게 환불 거절 푸시 알림 발송 (관리자) ===
        if (refund.order?.user_id) {
          const productNames = orderItems.map((item: any) => item.product_name).join(', ');
          const pushUrl = Deno.env.get('SUPABASE_URL');
          const pushKey = Deno.env.get('SUPABASE_ANON_KEY');
          const pushAuthHeader = req.headers.get('Authorization') || `Bearer ${pushKey}`;

          try {
            await fetch(`${pushUrl}/functions/v1/push-native`, {
              method: 'POST',
              headers: {
                'Authorization': pushAuthHeader,
                'apikey': pushKey || '',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                action: 'enqueue_notification',
                user_id: refund.order.user_id,
                target_member_id: refund.order.user_id,
                title: '❌ 환불 거절',
                body: `${productNames} 상품 환불이 거절되었습니다. 사유: ${rejection_reason}`,
                icon: null,
                url: `/store/orders/${refund.order_id}`,
                notification_type: 'store_refund_rejected',
                tag: `refund_rejected_${refundId}`,
                data: { refund_id: refundId, rejection_reason },
                process_immediately: true,
              }),
            });
          } catch (e) {
            console.error('환불 거절 푸시 알림 발송 실패:', e);
          }
        }

        return successResponse({
          ...updatedRefund,
          message: '환불 요청이 거절되었습니다.'
        });
      }

      return errorResponse('INVALID_REQUEST', '올바른 action을 입력해주세요. (approve/reject)');
    }

     // ===== GET /api-store-refunds/admin/list - 관리자 환불 요청 목록 (협업 상품) =====
    // 날짜 필터: requested_from, requested_to (환불요청시간), processed_from, processed_to (환불응답시간)
    if (pathname === '/api-store-refunds/admin/list' && req.method === 'GET') {
      const user = await getAuthUser(req);
      const params = getQueryParams(req.url);

      // 관리자 확인
      const { data: member } = await supabase
        .from('members')
        .select('role')
        .eq('id', user.id)
        .single();

      if (member?.role !== 'admin') {
        return errorResponse('FORBIDDEN', '관리자만 접근할 수 있습니다.', null, 403);
      }

      const status = params.status;
      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '20');
      const offset = (page - 1) * limit;
      
      // 날짜 필터 파라미터
      const requestedFrom = params.requested_from; // 환불요청 시작일 (ISO 8601)
      const requestedTo = params.requested_to; // 환불요청 종료일 (ISO 8601)
      const processedFrom = params.processed_from; // 환불응답 시작일 (ISO 8601)
      const processedTo = params.processed_to; // 환불응답 종료일 (ISO 8601)

      // 협업 상품이 포함된 주문 ID 목록 (store_order_items를 통해 조회)
      const { data: collabOrderItems } = await supabase
        .from('store_order_items')
        .select('order_id')
        .eq('product_source', 'collaboration');

      const orderIds = [...new Set(collabOrderItems?.map((o: { order_id: string }) => o.order_id) || [])];

      if (orderIds.length === 0) {
        return successResponse([], { total: 0, page, limit, totalPages: 0 });
      }

      let query = supabase
        .from('store_refunds')
        .select(`
          *,
          order:store_orders(
            order_id, order_number, total_amount, total_shipping_fee, status, is_confirmed,
            order_items:store_order_items(order_item_id, product_id, product_name, product_type, product_source, quantity, subtotal),
            shipments:store_shipments(shipment_id, status, shipping_fee),
            partner:partners(id, partner_name),
            buyer:members!user_id(id, name, profile_image, member_code)
          )
        `, { count: 'exact' })
        .in('order_id', orderIds);

      if (status) {
        query = query.eq('status', status);
      }

      // 환불요청시간 필터 (created_at)
      if (requestedFrom) {
        query = query.gte('created_at', requestedFrom);
      }
      if (requestedTo) {
        query = query.lte('created_at', requestedTo);
      }

      // 환불응답시간 필터 (processed_at)
      if (processedFrom) {
        query = query.gte('processed_at', processedFrom);
      }
      if (processedTo) {
        query = query.lte('processed_at', processedTo);
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      return successResponse(data, {
        total: count,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      });
    }

     // ===== GET /api-store-refunds/partner/list - 파트너 환불 요청 목록 =====
    // 날짜 필터: requested_from, requested_to (환불요청시간), processed_from, processed_to (환불응답시간)
    if (pathname === '/api-store-refunds/partner/list' && req.method === 'GET') {
      const user = await getAuthUser(req);
      const params = getQueryParams(req.url);

      // 파트너 확인
      const { data: partner, error: partnerError } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', user.id)
        .maybeSingle();

      if (partnerError) throw partnerError;

      if (!partner) {
        return errorResponse('FORBIDDEN', '파트너만 접근할 수 있습니다.', null, 403);
      }

      const status = params.status;
      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '20');
      const offset = (page - 1) * limit;
      
      // 날짜 필터 파라미터
      const requestedFrom = params.requested_from; // 환불요청 시작일 (ISO 8601)
      const requestedTo = params.requested_to; // 환불요청 종료일 (ISO 8601)
      const processedFrom = params.processed_from; // 환불응답 시작일 (ISO 8601)
      const processedTo = params.processed_to; // 환불응답 종료일 (ISO 8601)

      // 파트너의 주문 중 협업 상품 제외한 주문만 조회
      const { data: orders } = await supabase
        .from('store_orders')
        .select(`
          order_id,
          order_items:store_order_items(product_source)
        `)
        .eq('partner_id', partner.id);

      // 협업 상품이 포함되지 않은 주문만 필터링
      const nonCollabOrderIds = (orders || [])
        .filter((o: any) => !o.order_items?.some((item: any) => item.product_source === 'collaboration'))
        .map((o: { order_id: string }) => o.order_id);

      if (nonCollabOrderIds.length === 0) {
        return successResponse([], { total: 0, page, limit, totalPages: 0 });
      }

      let query = supabase
        .from('store_refunds')
        .select(`
          *,
          order:store_orders(
            order_id, order_number, total_amount, total_shipping_fee, status, is_confirmed,
            order_items:store_order_items(order_item_id, product_id, product_name, product_type, product_source, quantity, subtotal),
            buyer:members!user_id(id, name, profile_image, member_code)
          )
        `, { count: 'exact' })
        .in('order_id', nonCollabOrderIds);

      if (status) {
        query = query.eq('status', status);
      }

      // 환불요청시간 필터 (created_at)
      if (requestedFrom) {
        query = query.gte('created_at', requestedFrom);
      }
      if (requestedTo) {
        query = query.lte('created_at', requestedTo);
      }

      // 환불응답시간 필터 (processed_at)
      if (processedFrom) {
        query = query.gte('processed_at', processedFrom);
      }
      if (processedTo) {
        query = query.lte('processed_at', processedTo);
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      return successResponse(data, {
        total: count,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      });
    }

    return errorResponse('NOT_FOUND', '요청한 엔드포인트를 찾을 수 없습니다.', null, 404);

  } catch (error) {
    console.error('Store Refunds API Error:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : '서버 오류가 발생했습니다.',
      null,
      500
    );
  }
});

