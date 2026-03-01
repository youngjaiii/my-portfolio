import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, createSupabaseClient, errorResponse, successResponse, getAuthUser, parseRequestBody, getQueryParams, parseMultipartFormData } from '../_shared/utils.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const supabase = createSupabaseClient();

    // ===== GET /api-store-schedules - 스케줄 목록 조회 (상품별) =====
    if (pathname === '/api-store-schedules' && req.method === 'GET') {
      const params = getQueryParams(req.url);
      const productId = params.product_id;
      const partnerId = params.partner_id; // 하위 호환성 유지 (deprecated)
      const startDate = params.start_date; // YYYY-MM-DD
      const endDate = params.end_date; // YYYY-MM-DD
      const availableOnly = params.available_only === 'true';

      // product_id 또는 partner_id 중 하나 필수
      if (!productId && !partnerId) {
        return errorResponse('INVALID_REQUEST', 'product_id가 필요합니다.');
      }

      let query = supabase
        .from('store_partner_schedules')
        .select(`
          *,
          partner:partners(id, partner_name, member:members(id, name, profile_image)),
          product:store_products(product_id, name, thumbnail_url, product_type)
        `);

      // product_id로 조회 (권장)
      if (productId) {
        query = query.eq('product_id', productId);
      } else if (partnerId) {
        // partner_id로 조회 (하위 호환성)
        query = query.eq('partner_id', partnerId);
      }

      if (availableOnly) {
        query = query.eq('is_available', true);
      }
      
      // 오늘 날짜 00:00:00 기준 (startDate가 없으면 오늘 날짜 사용)
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const filterStartDate = startDate || todayStr;
      
      query = query.gte('start_time', `${filterStartDate}T00:00:00`);
      
      if (endDate) {
        query = query.lte('start_time', `${endDate}T23:59:59`);
      }

      const { data, error } = await query
        .order('start_time', { ascending: true });

      if (error) throw error;

      return successResponse(data);
    }

    // ===== GET /api-store-schedules/:id - 스케줄 상세 조회 =====
    const scheduleDetailMatch = pathname.match(/^\/api-store-schedules\/([a-f0-9-]+)$/);
    if (scheduleDetailMatch && req.method === 'GET') {
      const scheduleId = scheduleDetailMatch[1];

      const { data, error } = await supabase
        .from('store_partner_schedules')
        .select(`
          *,
          partner:partners(id, partner_name, member:members(id, name, profile_image)),
          product:store_products(product_id, name, thumbnail_url, product_type, source)
        `)
        .eq('schedule_id', scheduleId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return errorResponse('NOT_FOUND', '스케줄을 찾을 수 없습니다.', null, 404);
        }
        throw error;
      }

      return successResponse(data);
    }

    // ===== POST /api-store-schedules - 스케줄 생성 (파트너, 상품별) =====
    if (pathname === '/api-store-schedules' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body) {
        return errorResponse('INVALID_REQUEST', '요청 본문이 필요합니다.');
      }

      // 파트너 확인
      const { data: partner, error: partnerError } = await supabase
        .from('partners')
        .select('id, partner_status')
        .eq('member_id', user.id)
        .single();

      if (partnerError || !partner) {
        return errorResponse('FORBIDDEN', '파트너만 스케줄을 생성할 수 있습니다.', null, 403);
      }

      if (partner.partner_status !== 'approved') {
        return errorResponse('FORBIDDEN', '승인된 파트너만 스케줄을 생성할 수 있습니다.', null, 403);
      }

      const { product_id, start_time, end_time, location, location_point } = body;

      // product_id 필수 검증
      if (!product_id) {
        return errorResponse('INVALID_REQUEST', 'product_id가 필요합니다.');
      }

      if (!start_time || !end_time) {
        return errorResponse('INVALID_REQUEST', '시작 시간과 종료 시간은 필수입니다.');
      }

      // 상품 조회 및 소유권 검증
      const { data: product, error: productError } = await supabase
        .from('store_products')
        .select('product_id, partner_id, product_type')
        .eq('product_id', product_id)
        .single();

      if (productError || !product) {
        return errorResponse('NOT_FOUND', '상품을 찾을 수 없습니다.', null, 404);
      }

      if (product.partner_id !== partner.id) {
        return errorResponse('FORBIDDEN', '본인 상품의 스케줄만 등록할 수 있습니다.', null, 403);
      }

      if (product.product_type !== 'on_site') {
        return errorResponse('INVALID_REQUEST', '현장수령 상품만 스케줄을 등록할 수 있습니다.');
      }

      // 시간 유효성 검사
      const startDate = new Date(start_time);
      const endDate = new Date(end_time);
      const now = new Date();

      if (startDate >= endDate) {
        return errorResponse('INVALID_REQUEST', '종료 시간은 시작 시간보다 이후여야 합니다.');
      }

      // 날짜만 비교: 오늘 이전 날짜만 불가능 (시간은 제한 없음)
      const startDateUTC = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
      const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      
      if (startDateUTC < todayUTC) {
        return errorResponse('INVALID_REQUEST', '과거 날짜로 스케줄을 생성할 수 없습니다.');
      }

      const insertData: Record<string, any> = {
        product_id: product_id,
        partner_id: partner.id,
        start_time,
        end_time,
        location,
        is_available: true,
        current_bookings: 0
      };
      
      if (location_point) {
        insertData.location_point = location_point;
      }

      const { data: schedule, error: scheduleError } = await supabase
        .from('store_partner_schedules')
        .insert(insertData)
        .select(`
          *,
          product:store_products(product_id, name, thumbnail_url, product_type)
        `)
        .single();

      if (scheduleError) throw scheduleError;

      return successResponse(schedule);
    }

    // ===== POST /api-store-schedules/bulk - 스케줄 일괄 생성 (파트너, 상품별) =====
    if (pathname === '/api-store-schedules/bulk' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body) {
        return errorResponse('INVALID_REQUEST', '요청 본문이 필요합니다.');
      }

      // 파트너 확인
      const { data: partner } = await supabase
        .from('partners')
        .select('id, partner_status')
        .eq('member_id', user.id)
        .single();

      if (!partner || partner.partner_status !== 'approved') {
        return errorResponse('FORBIDDEN', '승인된 파트너만 스케줄을 생성할 수 있습니다.', null, 403);
      }

      const { product_id, schedules, location } = body;

      // product_id 필수 검증
      if (!product_id) {
        return errorResponse('INVALID_REQUEST', 'product_id가 필요합니다.');
      }

      if (!schedules || !Array.isArray(schedules) || schedules.length === 0) {
        return errorResponse('INVALID_REQUEST', '스케줄 배열이 필요합니다.');
      }

      // 상품 조회 및 소유권 검증
      const { data: product, error: productError } = await supabase
        .from('store_products')
        .select('product_id, partner_id, product_type')
        .eq('product_id', product_id)
        .single();

      if (productError || !product) {
        return errorResponse('NOT_FOUND', '상품을 찾을 수 없습니다.', null, 404);
      }

      if (product.partner_id !== partner.id) {
        return errorResponse('FORBIDDEN', '본인 상품의 스케줄만 등록할 수 있습니다.', null, 403);
      }

      if (product.product_type !== 'on_site') {
        return errorResponse('INVALID_REQUEST', '현장수령 상품만 스케줄을 등록할 수 있습니다.');
      }

      // 스케줄 시간 유효성 검사
      const now = new Date();
      const todayOnly = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      
      for (const s of schedules) {
        const startDate = new Date(s.start_time);
        const endDate = new Date(s.end_time);

        if (startDate >= endDate) {
          return errorResponse('INVALID_REQUEST', '종료 시간은 시작 시간보다 이후여야 합니다.');
        }

        const startDateUTC = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
        
        if (startDateUTC < todayOnly) {
          return errorResponse('INVALID_REQUEST', '과거 날짜로 스케줄을 생성할 수 없습니다.');
        }
      }

      const scheduleInserts = schedules.map((s: { start_time: string; end_time: string; location?: string; location_point?: { lat: number; lng: number } }) => ({
        product_id: product_id,
        partner_id: partner.id,
        start_time: s.start_time,
        end_time: s.end_time,
        location: s.location || location,
        location_point: s.location_point || null,
        is_available: true,
        current_bookings: 0
      }));

      const { data: createdSchedules, error: scheduleError } = await supabase
        .from('store_partner_schedules')
        .insert(scheduleInserts)
        .select(`
          *,
          product:store_products(product_id, name, thumbnail_url, product_type)
        `);

      if (scheduleError) throw scheduleError;

      return successResponse(createdSchedules);
    }

    // ===== PUT /api-store-schedules/:id - 스케줄 수정 (해당 파트너만 가능) =====
    if (scheduleDetailMatch && req.method === 'PUT') {
      const user = await getAuthUser(req);
      const scheduleId = scheduleDetailMatch[1];
      const body = await parseRequestBody(req);

      if (!body) {
        return errorResponse('INVALID_REQUEST', '요청 본문이 필요합니다.');
      }

      // 파트너 확인
      const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', user.id)
        .single();

      if (!partner) {
        return errorResponse('FORBIDDEN', '파트너만 스케줄을 수정할 수 있습니다.', null, 403);
      }

      // 스케줄 조회 (product_id 포함)
      const { data: existingSchedule } = await supabase
        .from('store_partner_schedules')
        .select('schedule_id, partner_id, product_id, current_bookings, start_time, end_time')
        .eq('schedule_id', scheduleId)
        .single();

      if (!existingSchedule) {
        return errorResponse('NOT_FOUND', '스케줄을 찾을 수 없습니다.', null, 404);
      }

      // 상품 조회하여 소유권 검증
      const { data: product } = await supabase
        .from('store_products')
        .select('partner_id')
        .eq('product_id', existingSchedule.product_id)
        .single();

      if (product?.partner_id !== partner.id) {
        return errorResponse('FORBIDDEN', '본인 상품의 스케줄만 수정할 수 있습니다.', null, 403);
      }

      const { start_time, end_time, location, location_point, is_available, product_id } = body;

      // product_id 변경 시도 차단
      if (product_id && product_id !== existingSchedule.product_id) {
        return errorResponse('INVALID_REQUEST', '스케줄의 상품은 변경할 수 없습니다.');
      }

      const updateData: Record<string, any> = {};

      if (existingSchedule.current_bookings > 0) {
        // 예약이 있으면 시간 변경 불가, 장소/가용여부만 변경 가능
        if (location !== undefined) updateData.location = location;
        if (location_point !== undefined) updateData.location_point = location_point;
        if (is_available !== undefined) updateData.is_available = is_available;
      } else {
        // 예약이 없으면 모든 필드 수정 가능
        // 시간 유효성 검사
        if (start_time !== undefined || end_time !== undefined) {
          const finalStartTime = start_time !== undefined ? start_time : existingSchedule.start_time;
          const finalEndTime = end_time !== undefined ? end_time : existingSchedule.end_time;
          
          const startDate = new Date(finalStartTime);
          const endDate = new Date(finalEndTime);
          const now = new Date();

          if (startDate >= endDate) {
            return errorResponse('INVALID_REQUEST', '종료 시간은 시작 시간보다 이후여야 합니다.');
          }

          // 날짜만 비교: 오늘 이전 날짜만 불가능 (시간은 제한 없음)
          const startDateUTC = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
          const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
          
          if (startDateUTC < todayUTC) {
            return errorResponse('INVALID_REQUEST', '과거 날짜로 스케줄을 수정할 수 없습니다.');
          }
        }

        if (start_time !== undefined) updateData.start_time = start_time;
        if (end_time !== undefined) updateData.end_time = end_time;
        if (location !== undefined) updateData.location = location;
        if (location_point !== undefined) updateData.location_point = location_point;
        if (is_available !== undefined) updateData.is_available = is_available;
      }

      const { data: updatedSchedule, error: updateError } = await supabase
        .from('store_partner_schedules')
        .update(updateData)
        .eq('schedule_id', scheduleId)
        .select(`
          *,
          product:store_products(product_id, name, thumbnail_url, product_type)
        `)
        .single();

      if (updateError) throw updateError;

      return successResponse(updatedSchedule);
    }

    // ===== DELETE /api-store-schedules/:id - 스케줄 삭제 (해당 파트너만 가능) =====
    if (scheduleDetailMatch && req.method === 'DELETE') {
      const user = await getAuthUser(req);
      const scheduleId = scheduleDetailMatch[1];

      // 파트너 확인
      const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', user.id)
        .single();

      if (!partner) {
        return errorResponse('FORBIDDEN', '파트너만 스케줄을 삭제할 수 있습니다.', null, 403);
      }

      // 스케줄 조회 (product_id 포함)
      const { data: existingSchedule } = await supabase
        .from('store_partner_schedules')
        .select('schedule_id, partner_id, product_id, current_bookings')
        .eq('schedule_id', scheduleId)
        .single();

      if (!existingSchedule) {
        return errorResponse('NOT_FOUND', '스케줄을 찾을 수 없습니다.', null, 404);
      }

      // 상품 조회하여 소유권 검증
      const { data: product } = await supabase
        .from('store_products')
        .select('partner_id')
        .eq('product_id', existingSchedule.product_id)
        .single();

      if (product?.partner_id !== partner.id) {
        return errorResponse('FORBIDDEN', '본인 상품의 스케줄만 삭제할 수 있습니다.', null, 403);
      }

      // 예약이 있는 경우 삭제 불가
      if (existingSchedule.current_bookings > 0) {
        return errorResponse('INVALID_REQUEST', '예약이 있는 스케줄은 삭제할 수 없습니다. 비활성화해주세요.');
      }

      const { error: deleteError } = await supabase
        .from('store_partner_schedules')
        .delete()
        .eq('schedule_id', scheduleId);

      if (deleteError) throw deleteError;

      return successResponse({ message: '스케줄이 삭제되었습니다.' });
    }

    // ===== GET /api-store-schedules/partner/my - 파트너 본인 스케줄 목록 =====
    if (pathname === '/api-store-schedules/partner/my' && req.method === 'GET') {
      const user = await getAuthUser(req);
      const params = getQueryParams(req.url);

      // 파트너 확인
      const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', user.id)
        .single();

      if (!partner) {
        return errorResponse('FORBIDDEN', '파트너만 접근할 수 있습니다.', null, 403);
      }

      const startDate = params.start_date;
      const endDate = params.end_date;
      const productId = params.product_id;
      const includeExpired = params.include_expired === 'true';

      let query = supabase
        .from('store_partner_schedules')
        .select(`
          *,
          product:store_products(product_id, name, thumbnail_url, product_type, source)
        `)
        .eq('partner_id', partner.id);

      // product_id로 필터링 (선택)
      if (productId) {
        query = query.eq('product_id', productId);
      }

      if (startDate) {
        query = query.gte('start_time', `${startDate}T00:00:00`);
      }
      if (endDate) {
        query = query.lte('start_time', `${endDate}T23:59:59`);
      }
      if (!includeExpired) {
        query = query.gte('end_time', new Date().toISOString());
      }

      const { data, error } = await query.order('start_time', { ascending: true });

      if (error) {
        return errorResponse('INTERNAL_ERROR', `스케줄 조회 실패: ${error.message}`, { code: error.code, details: error.details });
      }

      return successResponse(data);
    }

    // ===== GET /api-store-schedules/reserved - 특정 날짜의 예약된 시간 슬롯 조회 =====
    if (pathname === '/api-store-schedules/reserved' && req.method === 'GET') {
      const params = getQueryParams(req.url);
      const partnerId = params.partner_id;
      const date = params.date; // YYYY-MM-DD

      if (!partnerId) {
        return errorResponse('INVALID_REQUEST', 'partner_id가 필요합니다.');
      }
      if (!date) {
        return errorResponse('INVALID_REQUEST', 'date가 필요합니다. (YYYY-MM-DD 형식)');
      }

      // 해당 날짜의 예약된 주문 조회 (현장수령 상품, 결제 완료/확정된 주문)
      const { data: reservedOrders, error } = await supabase
        .from('store_orders')
        .select(`
          order_id,
          reserved_start_time,
          reserved_end_time,
          status,
          items:store_order_items!inner(
            product:store_products!inner(partner_id, product_type)
          )
        `)
        .in('status', ['paid', 'confirmed'])
        .gte('reserved_start_time', `${date}T00:00:00`)
        .lte('reserved_start_time', `${date}T23:59:59`);

      if (error) {
        return errorResponse('INTERNAL_ERROR', `예약 조회 실패: ${error.message}`, { code: error.code, details: error.details });
      }

      // 파트너ID와 현장수령 상품 필터링 후 시간 슬롯만 추출
      const reservedTimes = (reservedOrders || [])
        // deno-lint-ignore no-explicit-any
        .filter((order: any) => {
          const item = order.items?.[0];
          return item?.product?.partner_id === partnerId && item?.product?.product_type === 'on_site';
        })
        // deno-lint-ignore no-explicit-any
        .map((order: any) => ({
          start_time: order.reserved_start_time,
          end_time: order.reserved_end_time,
        }));

      return successResponse({
        date,
        partner_id: partnerId,
        reserved_times: reservedTimes,
      });
    }

    // ===== PUT /api-store-schedules/order/:order_id/status - 현장수령 상태 변경 (유저) =====
    // 상태: reserved(예약됨), completed(수령완료), no_show(노쇼)
    const orderStatusMatch = pathname.match(/^\/api-store-schedules\/order\/([a-f0-9-]+)\/status$/);
    if (orderStatusMatch && req.method === 'PUT') {
      const user = await getAuthUser(req);
      const orderId = orderStatusMatch[1];
      const body = await parseRequestBody(req);

      if (!body || !body.status) {
        return errorResponse('INVALID_REQUEST', 'status가 필요합니다.');
      }

      const { status } = body;
      const validStatuses = ['reserved', 'completed', 'no_show'];
      
      if (!validStatuses.includes(status)) {
        return errorResponse('INVALID_REQUEST', `status는 ${validStatuses.join(', ')} 중 하나여야 합니다.`);
      }

      // 주문 확인 (본인 주문인지)
      const { data: order, error: orderError } = await supabase
        .from('store_orders')
        .select(`
          *,
          items:store_order_items(
            *,
            product:store_products(product_id, product_type, partner_id, name, source)
          )
        `)
        .eq('order_id', orderId)
        .eq('user_id', user.id)
        .single();

      if (orderError || !order) {
        return errorResponse('NOT_FOUND', '주문을 찾을 수 없습니다.', null, 404);
      }

      // 첫 번째 주문 아이템에서 상품 정보 가져오기
      const firstItem = order.items?.[0];
      const product = firstItem?.product;

      // 현장수령 상품인지 확인
      if (product?.product_type !== 'on_site') {
        return errorResponse('INVALID_REQUEST', '현장수령 상품 주문만 상태 변경이 가능합니다.');
      }

      // 결제 완료 상태인지 확인
      if (!['paid', 'confirmed'].includes(order.status)) {
        return errorResponse('INVALID_REQUEST', '결제 완료된 주문만 상태 변경이 가능합니다.');
      }

      // 픽업 기록 확인/생성
      let { data: pickup } = await supabase
        .from('store_on_site_pickups')
        .select('*')
        .eq('order_id', orderId)
        .maybeSingle();

      if (!pickup) {
        // 픽업 기록이 없으면 생성
        const { data: newPickup, error: createError } = await supabase
          .from('store_on_site_pickups')
          .insert({
            order_id: orderId,
            status: 'reserved',
            is_picked_up: false,
            no_show: false
          })
          .select()
          .single();

        if (createError) throw createError;
        pickup = newPickup;
      }

      // 이미 처리된 상태인지 확인 (중복 처리 방지)
      if (pickup.status === 'completed') {
        return errorResponse('INVALID_REQUEST', '이미 수령완료 처리된 주문입니다. 상태를 변경할 수 없습니다.');
      }
      if (pickup.status === 'no_show') {
        return errorResponse('INVALID_REQUEST', '이미 노쇼 처리된 주문입니다. 상태를 변경할 수 없습니다.');
      }

      // 상태 업데이트
      const updateData: Record<string, any> = { status };

      if (status === 'completed') {
        updateData.is_picked_up = true;
        updateData.picked_up_at = new Date().toISOString();
        updateData.no_show = false;

        // 주문 상태도 confirmed로 업데이트 (수령 완료 = 구매 확정)
        await supabase
          .from('store_orders')
          .update({ 
            status: 'confirmed',
            is_confirmed: true,
            confirmed_at: new Date().toISOString()
          })
          .eq('order_id', orderId);

        // === 파트너 포인트 적립 처리 ===
        const partnerId = product?.partner_id;
        const productSource = product?.source;
        const productName = product?.name || '상품';
        let partnerAmount = order.total_amount;

        if (partnerId) {
          // 중복 적립 방지: 이미 포인트가 적립되었는지 확인
          const saleLogId = `store_sale_${orderId}_${partnerId}`;
          const { data: existingLog } = await supabase
            .from('partner_points_logs')
            .select('id')
            .eq('log_id', saleLogId)
            .maybeSingle();

          if (!existingLog) {
            // 협업 상품인 경우 배분 비율 적용
            if (productSource === 'collaboration') {
              // 1. 상품 테이블에서 배분율 우선 조회
              const { data: productData } = await supabase
                .from('store_products')
                .select('distribution_rate')
                .eq('product_id', product?.product_id)
                .maybeSingle();

              let distributionRate = 100; // 기본값 100%
              
              if (productData?.distribution_rate != null) {
                distributionRate = productData.distribution_rate;
              } else {
                // 2. 협업 요청에서 배분율 조회 (fallback)
                const { data: collaborationRequest } = await supabase
                  .from('store_collaboration_requests')
                  .select('distribution_rate')
                  .eq('product_id', product?.product_id)
                  .maybeSingle();

                if (collaborationRequest?.distribution_rate != null) {
                  distributionRate = collaborationRequest.distribution_rate;
                }
              }

              partnerAmount = Math.floor(order.total_amount * (distributionRate / 100));
            }
            // else: 파트너 개인상품은 partnerAmount = order.total_amount (100%)

            // 파트너 스토어 포인트 조회
            const { data: partner, error: partnerError } = await supabase
              .from('partners')
              .select('id, store_points, collaboration_store_points')
              .eq('id', partnerId)
              .single();

            if (!partnerError && partner) {
              // 협업 상품은 collaboration_store_points에, 개인상품은 store_points에 적립
              if (productSource === 'collaboration') {
                const newCollabPoints = (partner.collaboration_store_points || 0) + partnerAmount;
                await supabase
                  .from('partners')
                  .update({ collaboration_store_points: newCollabPoints })
                  .eq('id', partnerId);
              } else {
                const newStorePoints = (partner.store_points || 0) + partnerAmount;
                await supabase
                  .from('partners')
                  .update({ store_points: newStorePoints })
                  .eq('id', partnerId);
              }

              // partner_points_logs 기록
              await supabase.from('partner_points_logs').insert({
                partner_id: partnerId,
                type: 'earn',
                amount: partnerAmount,
                description: productSource === 'collaboration' 
                  ? `협업 상품 판매 (배분): ${productName}`
                  : `스토어 상품 판매: ${productName}`,
                log_id: saleLogId,
                point_type: productSource === 'collaboration' ? 'collaboration_store_points' : 'store_points'
              });
            }
          } else {
            console.log(`포인트 이미 적립됨: ${saleLogId}`);
          }
        }
      }

      if (status === 'no_show') {
        updateData.no_show = true;
        updateData.is_picked_up = false;

        // === 노쇼 시 자동 환불 처리 (포인트 복구) ===
        const refundAmount = order.total_amount;

        // 1. 유저의 현재 포인트 조회
        const { data: member, error: memberError } = await supabase
          .from('members')
          .select('id, total_points')
          .eq('id', user.id)
          .single();

        if (memberError) {
          console.error('회원 조회 실패:', memberError);
        } else {
          const currentPoint = member.total_points || 0;
          const newTotalPoint = currentPoint + refundAmount;

          // 2. members 테이블의 total_points 복구
          const { error: pointUpdateError } = await supabase
            .from('members')
            .update({ total_points: newTotalPoint })
            .eq('id', user.id);

          if (pointUpdateError) {
            console.error('포인트 복구 실패:', pointUpdateError);
          } else {
            // 3. member_points_logs에 환불 로그 추가
            const refundLogId = `store_refund_${orderId}_${user.id}`;
            await supabase
              .from('member_points_logs')
              .insert({
                member_id: user.id,
                type: 'earn',
                amount: refundAmount,
                description: `노쇼(No-Show) 자동 환불 - 주문번호: ${order.order_number || orderId}`,
                log_id: refundLogId
              });

            // 4. 환불 기록 생성
            const { error: refundInsertError } = await supabase
              .from('store_refunds')
              .insert({
                order_id: orderId,
                reason: '노쇼(No-Show) - 자동 환불 처리',
                status: 'completed',
                refund_amount: refundAmount,
                processed_at: new Date().toISOString(),
                return_shipping_fee: 0
              });

            if (refundInsertError) {
              console.error('환불 기록 생성 실패:', refundInsertError);
            }

            // 5. 주문 상태를 refunded로 업데이트
            await supabase
              .from('store_orders')
              .update({ status: 'refunded' })
              .eq('order_id', orderId);

            // 6. 파트너에게 노쇼 환불 푸시 알림 발송
            const partnerId = product?.partner_id;
            if (partnerId) {
              const { data: partnerInfo } = await supabase
                .from('partners')
                .select('member_id')
                .eq('id', partnerId)
                .single();

              if (partnerInfo?.member_id) {
                const productName = product?.name || '상품';
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
                      user_id: partnerInfo.member_id,
                      target_member_id: partnerInfo.member_id,
                      title: '⚠️ 노쇼 환불',
                      body: `${productName} 상품이 노쇼 처리되어 자동 환불되었습니다. (${refundAmount.toLocaleString()}P)`,
                      icon: null,
                      url: '/partner/store/orders',
                      notification_type: 'store_no_show_refund',
                      tag: `no_show_refund_${orderId}`,
                      data: { order_id: orderId, refund_amount: refundAmount },
                      process_immediately: true,
                    }),
                  });
                } catch (e) {
                  console.error('노쇼 환불 푸시 알림 발송 실패:', e);
                }
              }
            }
          }
        }
      }

      const { data: updatedPickup, error: updateError } = await supabase
        .from('store_on_site_pickups')
        .update(updateData)
        .eq('pickup_id', pickup.pickup_id)
        .select()
        .single();

      if (updateError) throw updateError;

      return successResponse({
        ...updatedPickup,
        message: status === 'no_show' ? '노쇼 처리 및 자동 환불이 완료되었습니다.' : '상태가 변경되었습니다.'
      });
    }

    // ===== PUT /api-store-schedules/order/:order_id/confirm - 파트너가 스케줄 확정 =====
    // 파트너가 채팅을 통해 조율 후 최종 스케줄을 확정
    const orderConfirmMatch = pathname.match(/^\/api-store-schedules\/order\/([a-f0-9-]+)\/confirm$/);
    if (orderConfirmMatch && req.method === 'PUT') {
      const user = await getAuthUser(req);
      const orderId = orderConfirmMatch[1];
      const body = await parseRequestBody(req);

      if (!body) {
        return errorResponse('INVALID_REQUEST', '요청 본문이 필요합니다.');
      }

      const { schedule_id, start_time, end_time, location, location_point } = body;

      // 파트너 확인
      const { data: partner, error: partnerError } = await supabase
        .from('partners')
        .select('id, partner_status')
        .eq('member_id', user.id)
        .single();

      if (partnerError || !partner) {
        return errorResponse('FORBIDDEN', '파트너만 스케줄을 확정할 수 있습니다.', null, 403);
      }

      // 주문 확인 (본인 상품 주문인지)
      const { data: order, error: orderError } = await supabase
        .from('store_orders')
        .select(`
          *,
          items:store_order_items(
            *,
            product:store_products(product_id, product_type, partner_id)
          )
        `)
        .eq('order_id', orderId)
        .single();

      if (orderError || !order) {
        return errorResponse('NOT_FOUND', '주문을 찾을 수 없습니다.', null, 404);
      }

      // 첫 번째 주문 아이템에서 상품 정보 가져오기
      const confirmFirstItem = order.items?.[0];
      const confirmProduct = confirmFirstItem?.product;

      // 본인 상품인지 확인
      if (confirmProduct?.partner_id !== partner.id) {
        return errorResponse('FORBIDDEN', '본인의 상품 주문만 스케줄을 확정할 수 있습니다.', null, 403);
      }

      // 현장수령 상품인지 확인
      if (confirmProduct?.product_type !== 'on_site') {
        return errorResponse('INVALID_REQUEST', '현장수령 상품 주문만 스케줄 확정이 가능합니다.');
      }

      // 시간 정보 확정 (schedule_id가 있으면 해당 스케줄에서 가져오고, 없으면 직접 입력값 사용)
      let finalStartTime = start_time;
      let finalEndTime = end_time;
      let finalLocation = location;

      if (schedule_id) {
        // 기존 스케줄에서 시간/장소 정보 가져오기
        const { data: schedule, error: scheduleError } = await supabase
          .from('store_partner_schedules')
          .select('start_time, end_time, location, current_bookings')
          .eq('schedule_id', schedule_id)
          .single();

        if (scheduleError || !schedule) {
          return errorResponse('NOT_FOUND', '스케줄을 찾을 수 없습니다.', null, 404);
        }

        finalStartTime = schedule.start_time;
        finalEndTime = schedule.end_time;
        finalLocation = location || schedule.location; // location이 직접 입력되면 사용, 아니면 스케줄 것 사용

        // 스케줄의 current_bookings 증가
        await supabase
          .from('store_partner_schedules')
          .update({ current_bookings: (schedule.current_bookings || 0) + 1 })
          .eq('schedule_id', schedule_id);
      }

      if (!finalStartTime || !finalEndTime) {
        return errorResponse('INVALID_REQUEST', 'schedule_id 또는 (start_time, end_time)이 필요합니다.');
      }

      // 주문의 예약 시간/장소 업데이트
      const updateData: Record<string, any> = { 
        reserved_start_time: finalStartTime,
        reserved_end_time: finalEndTime,
        reserved_location: finalLocation
      };
      if (location_point) {
        updateData.reserved_location_point = location_point;
      }

      const { data: updatedOrder, error: updateError } = await supabase
        .from('store_orders')
        .update(updateData)
        .eq('order_id', orderId)
        .select('reserved_start_time, reserved_end_time, reserved_location, reserved_location_point, order_id, order_number, user_id, chat_room_id')
        .single();

      if (updateError) throw updateError;

      // 픽업 기록 생성/업데이트
      const { data: existingPickup } = await supabase
        .from('store_on_site_pickups')
        .select('pickup_id')
        .eq('order_id', orderId)
        .maybeSingle();

      if (existingPickup) {
        await supabase
          .from('store_on_site_pickups')
          .update({ status: 'reserved' })
          .eq('pickup_id', existingPickup.pickup_id);
      } else {
        await supabase.from('store_on_site_pickups').insert({
          order_id: orderId,
          status: 'reserved',
          is_picked_up: false,
          no_show: false
        });
      }

      // 유저에게 채팅 메시지 전송 (스케줄 확정 알림)
      if (order.chat_room_id) {
        // reserved_start_time, reserved_end_time, reserved_location을 직접 사용
        const reservedStartTime = updatedOrder.reserved_start_time;
        const reservedEndTime = updatedOrder.reserved_end_time;
        const reservedLocation = updatedOrder.reserved_location || location;
        
        // UTC 시간을 한국 시간(KST, UTC+9)으로 변환
        let startTime = '미정';
        let endTime = '';
        
        if (reservedStartTime) {
          // "YYYY-MM-DD HH:mm" 형식의 UTC 문자열을 파싱
          let utcDate: Date;
          if (typeof reservedStartTime === 'string') {
            // "YYYY-MM-DD HH:mm" 형식을 UTC로 파싱
            const [datePart, timePart] = reservedStartTime.split(' ');
            if (datePart && timePart) {
              const [year, month, day] = datePart.split('-').map(Number);
              const [hour, minute] = timePart.split(':').map(Number);
              // UTC로 명시적으로 Date 객체 생성
              utcDate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
            } else {
              utcDate = new Date(reservedStartTime);
            }
          } else {
            utcDate = new Date(reservedStartTime);
          }
          // UTC에 9시간 추가하여 한국 시간으로 변환
          const kstTimestamp = utcDate.getTime() + 9 * 60 * 60 * 1000;
          const kstDate = new Date(kstTimestamp);
          // 한국 시간으로 포맷팅 (UTC 메서드 사용하여 변환된 값 직접 사용)
          const year = kstDate.getUTCFullYear();
          const month = kstDate.getUTCMonth() + 1;
          const day = kstDate.getUTCDate();
          const hour = kstDate.getUTCHours();
          const minute = kstDate.getUTCMinutes();
          const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
          startTime = `${year}년 ${monthNames[month - 1]} ${day}일 ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        }
        
        if (reservedEndTime) {
          let utcEndDate: Date;
          if (typeof reservedEndTime === 'string') {
            const [datePart, timePart] = reservedEndTime.split(' ');
            if (datePart && timePart) {
              const [year, month, day] = datePart.split('-').map(Number);
              const [hour, minute] = timePart.split(':').map(Number);
              utcEndDate = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
            } else {
              utcEndDate = new Date(reservedEndTime);
            }
          } else {
            utcEndDate = new Date(reservedEndTime);
          }
          const kstEndTimestamp = utcEndDate.getTime() + 9 * 60 * 60 * 1000;
          const kstEndDate = new Date(kstEndTimestamp);
          const hour = kstEndDate.getUTCHours();
          const minute = kstEndDate.getUTCMinutes();
          endTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        }
        
        const locationInfo = reservedLocation || '미정';

        const confirmMessage = `✅ 현장수령 스케줄이 변경되었습니다!\n\n` +
          `📅 수령 일시: ${startTime}${endTime ? ` ~ ${endTime}` : ''}\n` +
          `📍 수령 장소: ${locationInfo}\n\n` +
          `예약 시간에 방문해 주세요.`;

        await supabase.from('member_chats').insert({
          chat_room_id: order.chat_room_id,
          sender_id: user.id,
          receiver_id: order.user_id,
          message: confirmMessage,
          message_type: 'system',
          is_read: false
        });

        await supabase
          .from('chat_rooms')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', order.chat_room_id);

        // === 구매자에게 스케줄 확정 푸시 알림 발송 ===
        const pushUrl = Deno.env.get('SUPABASE_URL');
        const pushKey = Deno.env.get('SUPABASE_ANON_KEY');
        const pushAuthHeader = req.headers.get('Authorization') || `Bearer ${pushKey}`;

        console.log('[스케줄 확정 알림] 푸시 알림 시도:', {
          orderId,
          userId: order.user_id,
          startTime,
          endTime,
          locationInfo,
          pushUrl: pushUrl ? '있음' : '없음',
          pushKey: pushKey ? '있음' : '없음',
          authHeader: pushAuthHeader ? '있음' : '없음'
        });

        try {
          const pushResponse = await fetch(`${pushUrl}/functions/v1/push-native`, {
            method: 'POST',
            headers: {
              'Authorization': pushAuthHeader,
              'apikey': pushKey || '',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'enqueue_notification',
              user_id: order.user_id,
              target_member_id: order.user_id,
              title: '📅 현장수령 스케줄 확정',
              body: `수령 일시: ${startTime}${endTime ? ` ~ ${endTime}` : ''} / 장소: ${locationInfo}`,
              icon: null,
              url: `/store/orders/${orderId}`,
              notification_type: 'store_schedule_confirmed',
              tag: `schedule_confirmed_${orderId}_${Date.now()}`,
              data: { 
                order_id: orderId, 
                start_time: finalStartTime, 
                end_time: finalEndTime,
                location: finalLocation
              },
              process_immediately: true,
            }),
          });
          const pushResult = await pushResponse.text();
          console.log('[스케줄 확정 알림] 푸시 알림 응답:', {
            status: pushResponse.status,
            ok: pushResponse.ok,
            result: pushResult
          });
        } catch (e) {
          console.error('[스케줄 확정 알림] 푸시 알림 발송 실패:', e);
        }
      }

      return successResponse({
        ...updatedOrder,
        message: '스케줄이 변경되었습니다.'
      });
    }

    // ===== GET /api-store-schedules/reserved - 파트너의 특정 날짜 예약된 시간대 조회 (중복 예약 방지용) =====
    if (pathname === '/api-store-schedules/reserved' && req.method === 'GET') {
      const params = getQueryParams(req.url);
      const partnerId = params.partner_id;
      const date = params.date; // YYYY-MM-DD

      if (!partnerId) {
        return errorResponse('INVALID_REQUEST', 'partner_id가 필요합니다.');
      }

      if (!date) {
        return errorResponse('INVALID_REQUEST', 'date가 필요합니다. (YYYY-MM-DD 형식)');
      }

      // store_orders 테이블에서 partner_id 기준으로 해당 날짜에 예약된 주문 조회 (취소/환불 제외)
      const { data: orders, error: ordersError } = await supabase
        .from('store_orders')
        .select('order_id, reserved_start_time, reserved_end_time')
        .eq('partner_id', partnerId)
        .not('reserved_start_time', 'is', null)
        .gte('reserved_start_time', `${date} 00:00:00`)
        .lte('reserved_start_time', `${date} 23:59:59`)
        .not('status', 'in', '("cancelled","refunded")');

      if (ordersError) throw ordersError;

      // 예약된 시간대 목록 반환
      const reservedTimes = (orders || []).map((order: { order_id: string; reserved_start_time: string; reserved_end_time: string }) => ({
        start_time: order.reserved_start_time,
        end_time: order.reserved_end_time
      }));

      return successResponse({
        partner_id: partnerId,
        date,
        reserved_times: reservedTimes
      });
    }

    // ===== GET /api-store-schedules/chat/:chat_room_id - 채팅방 기준 현장수령 주문 목록 =====
    const chatRoomMatch = pathname.match(/^\/api-store-schedules\/chat\/([a-f0-9-]+)$/);
    if (chatRoomMatch && req.method === 'GET') {
      const user = await getAuthUser(req);
      const chatRoomId = chatRoomMatch[1];

      // 채팅방 접근 권한 확인
      const { data: chatRoom, error: chatRoomError } = await supabase
        .from('chat_rooms')
        .select('id, created_by, partner_id')
        .eq('id', chatRoomId)
        .single();

      if (chatRoomError || !chatRoom) {
        return errorResponse('NOT_FOUND', '채팅방을 찾을 수 없습니다.', null, 404);
      }

      if (chatRoom.created_by !== user.id && chatRoom.partner_id !== user.id) {
        return errorResponse('FORBIDDEN', '권한이 없습니다.', null, 403);
      }

      // 해당 채팅방의 현장수령 주문 목록 조회
      const { data: orders, error: ordersError } = await supabase
        .from('store_orders')
        .select(`
          *,
          items:store_order_items(
            *,
            product:store_products(product_id, name, thumbnail_url, price, product_type)
          ),
          pickup:store_on_site_pickups(pickup_id, status, is_picked_up, no_show, picked_up_at)
        `)
        .eq('chat_room_id', chatRoomId)
        .order('created_at', { ascending: false });

      if (ordersError) throw ordersError;

      // 프론트엔드 호환성을 위해 첫 번째 아이템의 상품 정보를 product로 추가
      // deno-lint-ignore no-explicit-any
      const formattedOrders = (orders || []).map((order: any) => ({
        ...order,
        product: order.items?.[0]?.product || null
      }));

      return successResponse(formattedOrders);
    }

    // ===== GET /api-store-schedules/order/:order_id/fulfillment - 이행완료 기록 조회 (관리자/파트너) =====
    const fulfillmentGetMatch = pathname.match(/^\/api-store-schedules\/order\/([a-f0-9-]+)\/fulfillment$/);
    if (fulfillmentGetMatch && req.method === 'GET') {
      const user = await getAuthUser(req);
      const orderId = fulfillmentGetMatch[1];

      // 사용자 권한 확인 (관리자 또는 해당 파트너)
      const { data: member } = await supabase
        .from('members')
        .select('id, role')
        .eq('id', user.id)
        .single();

      const isAdmin = member?.role === 'admin';

      // 파트너 확인
      const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', user.id)
        .maybeSingle();

      // 주문 조회
      const { data: order, error: orderError } = await supabase
        .from('store_orders')
        .select(`
          order_id,
          partner_id,
          items:store_order_items(
            product:store_products(product_id, name, partner_id)
          )
        `)
        .eq('order_id', orderId)
        .single();

      if (orderError || !order) {
        return errorResponse('NOT_FOUND', '주문을 찾을 수 없습니다.', null, 404);
      }

      // 권한 체크: 관리자이거나 해당 주문의 파트너
      // deno-lint-ignore no-explicit-any
      const orderItems = order.items as any[];
      const orderPartnerId = orderItems?.[0]?.product?.partner_id;
      if (!isAdmin && partner?.id !== orderPartnerId) {
        return errorResponse('FORBIDDEN', '이행완료 기록을 조회할 권한이 없습니다.', null, 403);
      }

      // 이행완료 기록 조회
      const { data: fulfillments, error: fulfillmentError } = await supabase
        .from('store_fulfillment_records')
        .select(`
          *,
          partner:partners(id, partner_name)
        `)
        .eq('order_id', orderId)
        .order('created_at', { ascending: false });

      if (fulfillmentError) throw fulfillmentError;

      return successResponse({
        order_id: orderId,
        fulfillments: fulfillments || [],
        total_count: fulfillments?.length || 0
      });
    }

    // ===== POST /api-store-schedules/order/:order_id/fulfill - 협업 상품 이행완료 알림 =====
    // 파트너가 구매자 요구사항 이행 후 관리자에게 알림 (미디어 필수)
    // Content-Type: multipart/form-data
    const fulfillMatch = pathname.match(/^\/api-store-schedules\/order\/([a-f0-9-]+)\/fulfill$/);
    if (fulfillMatch && req.method === 'POST') {
      const user = await getAuthUser(req);
      const orderId = fulfillMatch[1];
      
      console.log('[fulfill] 시작 - orderId:', orderId, 'userId:', user.id);

      // 1. 파트너 확인 (먼저 수행)
      const { data: partner, error: partnerError } = await supabase
        .from('partners')
        .select('id, partner_name, member_id')
        .eq('member_id', user.id)
        .single();

      if (partnerError || !partner) {
        console.log('[fulfill] 파트너 확인 실패:', partnerError);
        return errorResponse('FORBIDDEN', '파트너만 이행완료 알림을 보낼 수 있습니다.', null, 403);
      }

      console.log('[fulfill] 파트너 확인 완료:', partner.id, partner.partner_name);

      // 2. 주문 조회 (파일 업로드 전에 먼저 확인)
      const { data: order, error: orderError } = await supabase
        .from('store_orders')
        .select(`
          *,
          items:store_order_items(
            *,
            product:store_products(product_id, name, product_type, source, partner_id)
          ),
          buyer:members!store_orders_user_id_fkey(id, name)
        `)
        .eq('order_id', orderId)
        .single();

      console.log('[fulfill] 주문 조회 결과:', order ? '성공' : '실패', orderError?.message || '');

      if (orderError || !order) {
        console.error('[fulfill] 주문 조회 실패 - orderId:', orderId, 'error:', orderError);
        return errorResponse('NOT_FOUND', `주문을 찾을 수 없습니다. (orderId: ${orderId})`, { error: orderError?.message }, 404);
      }

      // deno-lint-ignore no-explicit-any
      const orderItems = order.items as any[];
      const firstItem = orderItems?.[0];
      const product = firstItem?.product;

      console.log('[fulfill] 상품 정보:', product?.name, 'source:', product?.source, 'partner_id:', product?.partner_id);

      // 3. 협업 상품인지 확인
      if (product?.source !== 'collaboration') {
        return errorResponse('INVALID_REQUEST', '협업 상품만 이행완료 알림을 보낼 수 있습니다.');
      }

      // 4. 해당 파트너의 상품인지 확인
      if (product?.partner_id !== partner.id) {
        return errorResponse('FORBIDDEN', '본인의 협업 상품 주문만 이행완료 알림을 보낼 수 있습니다.', null, 403);
      }

      // 5. multipart/form-data 파싱 및 파일 업로드
      const contentType = req.headers.get('content-type') || '';
      let media_urls: string[] = [];
      let note: string | null = null;

      if (contentType.includes('multipart/form-data')) {
        // FormData로 파일 업로드 처리
        const formData = await req.formData();
        
        // 'files' 또는 'file' 필드명 모두 지원
        let files = formData.getAll('files') as File[];
        if (files.length === 0) {
          files = formData.getAll('file') as File[];
        }
        note = formData.get('note') as string | null;

        console.log('[fulfill] FormData 파싱 - files 개수:', files.length);

        if (!files || files.length === 0) {
          return errorResponse('INVALID_REQUEST', '미디어 파일이 필수입니다. 최소 1개 이상의 이미지를 첨부해주세요. (files 필드로 전송)');
        }

        // Supabase Storage에 파일 업로드
        const uploadErrors: string[] = [];
        
        for (const file of files) {
          if (!(file instanceof File)) {
            console.log('[fulfill] 유효하지 않은 파일 타입:', typeof file);
            continue;
          }
          
          const fileExt = file.name.split('.').pop() || 'jpg';
          const fileName = `${orderId}/${crypto.randomUUID()}.${fileExt}`;
          const filePath = `fulfillment/${fileName}`;

          console.log('[fulfill] 업로드 시도:', filePath, 'size:', file.size);

          const { error: uploadError } = await supabase.storage
            .from('store')
            .upload(filePath, file, {
              contentType: file.type,
              upsert: false
            });

          if (uploadError) {
            console.error('[fulfill] 파일 업로드 실패:', uploadError);
            uploadErrors.push(`${file.name}: ${uploadError.message}`);
            continue;
          }

          // Public URL 생성
          const { data: urlData } = supabase.storage
            .from('store')
            .getPublicUrl(filePath);

          if (urlData?.publicUrl) {
            media_urls.push(urlData.publicUrl);
            console.log('[fulfill] 업로드 성공:', urlData.publicUrl);
          }
        }

        // 모든 파일 업로드 실패 시 에러 반환
        if (media_urls.length === 0 && uploadErrors.length > 0) {
          return errorResponse('UPLOAD_FAILED', `파일 업로드에 실패했습니다: ${uploadErrors.join(', ')}`);
        }
      } else {
        // JSON으로 URL 직접 전달 (기존 방식도 지원)
        const body = await parseRequestBody(req);
        media_urls = body?.media_urls || [];
        note = body?.note || null;
      }

      // 미디어 URL 필수 체크
      if (!media_urls || media_urls.length === 0) {
        return errorResponse('INVALID_REQUEST', '미디어가 필수입니다. 최소 1개 이상의 이미지를 첨부해주세요.');
      }

      // 6. 이행완료 기록 생성
      const { data: fulfillment, error: fulfillmentError } = await supabase
        .from('store_fulfillment_records')
        .insert({
          order_id: orderId,
          partner_id: partner.id,
          product_type: product.product_type,
          media_urls: media_urls,
          note: note || null
        })
        .select()
        .single();

      if (fulfillmentError) {
        console.error('이행완료 기록 생성 실패:', fulfillmentError);
        throw fulfillmentError;
      }

      // === 출고 요청 자동 생성 (이행완료 → 출고요청 통합) ===
      const shipmentProductId = product?.product_id || firstItem?.product_id;
      console.log(`[이행완료] 출고 요청 자동 생성 시도 - orderId: ${orderId}, productId: ${shipmentProductId}, partnerId: ${partner.id}`);

      const { data: existingShipmentReq } = await supabase
        .from('store_shipment_requests')
        .select('request_id')
        .eq('order_id', orderId)
        .maybeSingle();

      if (!existingShipmentReq) {
        const { data: newShipmentReq, error: shipmentReqError } = await supabase
          .from('store_shipment_requests')
          .insert({
            order_id: orderId,
            product_id: shipmentProductId,
            partner_id: partner.id,
            status: 'pending',
            notes: note || null
          })
          .select('request_id')
          .single();

        if (shipmentReqError) {
          console.error('[이행완료] 출고 요청 자동 생성 실패:', JSON.stringify(shipmentReqError));
        } else {
          console.log(`[이행완료] 출고 요청 자동 생성 완료 - orderId: ${orderId}, requestId: ${newShipmentReq?.request_id}`);
        }
      } else {
        console.log(`[이행완료] 출고 요청 이미 존재 - orderId: ${orderId}, requestId: ${existingShipmentReq.request_id}`);
      }

      // === 관리자에게 푸시 알림 발송 ===
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
      const authHeader = req.headers.get('Authorization') || `Bearer ${anonKey}`;

      const { data: admins } = await supabase
        .from('members')
        .select('id')
        .eq('role', 'admin');

      const productName = product?.name || '상품';

      if (admins && admins.length > 0) {
        for (const admin of admins) {
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
                user_id: admin.id,
                target_member_id: admin.id,
                title: '📦 출고 요청',
                body: `${partner.partner_name}님이 [${productName}] 이행완료 및 출고를 요청했습니다.`,
                icon: media_urls[0] || null,
                url: `/store/admin/collaboration`,
                notification_type: 'shipment_request',
                tag: `shipment_request_${orderId}`,
                data: { 
                  order_id: orderId, 
                  partner_id: partner.id,
                  fulfillment_id: fulfillment.id,
                  media_count: media_urls.length
                },
                process_immediately: true,
              }),
            });
          } catch (e) {
            console.error('관리자 푸시 알림 발송 실패:', e);
          }
        }
      }

      // === 채팅방에 시스템 메시지 발송 ===
      // 이행 완료 시 채팅 메시지는 발송하지 않음 (관리자 승인 시 일정 확정 메시지로 대체)

      return successResponse({
        fulfillment_id: fulfillment.id,
        order_id: orderId,
        media_urls: media_urls,
        notified_at: fulfillment.notified_at,
        message: '이행완료 알림이 관리자에게 전송되었습니다.'
      });
    }

    return errorResponse('NOT_FOUND', '요청한 엔드포인트를 찾을 수 없습니다.', null, 404);

  } catch (error) {
    console.error('Store Schedules API Error:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : '서버 오류가 발생했습니다.',
      null,
      500
    );
  }
});

