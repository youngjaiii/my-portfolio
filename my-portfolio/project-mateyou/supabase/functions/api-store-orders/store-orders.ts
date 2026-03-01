import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, createSupabaseClient, errorResponse, successResponse, getAuthUser, parseRequestBody, getQueryParams } from '../_shared/utils.ts';

// ===== 배송추적 헬퍼 함수 (tracker.delivery API) =====

// courier → carrierId 매핑 (공통 사용)
const CARRIER_MAP: Record<string, string> = {
  cj: 'kr.cjlogistics',
  lotte: 'kr.lotte',
  epost: 'kr.epost',
  hanjin: 'kr.hanjin',
  logen: 'kr.logen',
  kdexp: 'kr.kdexp',       // 경동택배
  daesin: 'kr.daesin',     // 대신택배
  ilyang: 'kr.ilyang',     // 일양로지스
  chunil: 'kr.chunil',     // 천일택배
  cvsnet: 'kr.cvsnet',     // 편의점택배
};

interface DeliveryTrackingEvent {
  time: string;
  status: {
    code: string;
  };
  description: string | null;
}

// 전체 배송 이벤트 조회용 인터페이스
interface FullDeliveryTrackingResult {
  lastEvent: DeliveryTrackingEvent | null;
  events: DeliveryTrackingEvent[];
}

// OAuth 토큰 캐시 (메모리)
let cachedToken: { token: string; expiresAt: number } | null = null;

// OAuth 토큰 발급
async function getTrackerAccessToken(): Promise<string | null> {
  // 캐시된 토큰이 유효하면 재사용
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const clientId = Deno.env.get('TRACKER_DELIVERY_CLIENT_ID');
  const clientSecret = Deno.env.get('TRACKER_DELIVERY_CLIENT_SECRET');
  
  if (!clientId || !clientSecret) {
    console.log('[배송추적] Client ID/Secret이 설정되지 않음');
    return null;
  }

  try {
    const res = await fetch('https://auth.tracker.delivery/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`
    });

    const json = await res.json();
    if (json.access_token) {
      cachedToken = {
        token: json.access_token,
        expiresAt: Date.now() + (json.expires_in - 60) * 1000 // 1분 여유
      };
      console.log('[배송추적] OAuth 토큰 발급 성공');
      return json.access_token;
    }
    console.error('[배송추적] OAuth 토큰 발급 실패:', json);
    return null;
  } catch (error) {
    console.error('[배송추적] OAuth 토큰 발급 에러:', error);
    return null;
  }
}

// GraphQL 요청 헤더 생성 (OAuth Bearer 토큰 방식)
async function getTrackerHeaders(): Promise<Record<string, string>> {
  const token = await getTrackerAccessToken();
  const headers: Record<string, string> = { 
    'Content-Type': 'application/json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// 배송 상태 조회 (Query.track) - 전체 이벤트 히스토리 포함
async function fetchDeliveryTracking(
  courier: string,
  trackingNumber: string
): Promise<FullDeliveryTrackingResult | null> {
  const carrierId = CARRIER_MAP[courier.toLowerCase()];
  console.log('[배송추적]', carrierId);
  if (!carrierId) return null;

  try {
    const res = await fetch('https://apis.tracker.delivery/graphql', {
      method: 'POST',
      headers: await getTrackerHeaders(),
      body: JSON.stringify({
        query: `
          query Track($carrierId: ID!, $trackingNumber: String!) {
            track(carrierId: $carrierId, trackingNumber: $trackingNumber) {
              lastEvent {
                time
                status { code }
                description
              }
              events(last: 100) {
                edges {
                  node {
                    time
                    status { code }
                    description
                  }
                }
              }
            }
          }
        `,
        variables: { carrierId, trackingNumber }
      })
    });
    const json = await res.json();
    console.log('[배송추적 결과]', JSON.stringify({ carrierId, trackingNumber, response: json }, null, 2));
    
    const track = json?.data?.track;
    if (!track) return null;

    // events를 배열로 변환 (시간순 정렬)
    const events: DeliveryTrackingEvent[] = (track.events?.edges || [])
      .map((edge: { node: DeliveryTrackingEvent }) => edge.node)
      .sort((a: DeliveryTrackingEvent, b: DeliveryTrackingEvent) => 
        new Date(a.time).getTime() - new Date(b.time).getTime()
      );

    return {
      lastEvent: track.lastEvent || null,
      events
    };
  } catch (error) {
    console.error('Delivery tracking fetch error:', error);
    return null;
  }
}

// Webhook 등록 (Mutation.registerTrackWebhook)
async function registerTrackWebhook(
  courier: string,
  trackingNumber: string,
  callbackUrl: string,
  expirationHours: number = 48
): Promise<boolean> {
  const carrierId = CARRIER_MAP[courier.toLowerCase()];
  if (!carrierId) {
    console.log('[Webhook 등록] 지원하지 않는 택배사:', courier);
    return false;
  }

  // 만료 시간 계산 (기본 48시간)
  const expirationTime = new Date(Date.now() + expirationHours * 60 * 60 * 1000).toISOString();

  try {
    const res = await fetch('https://apis.tracker.delivery/graphql', {
      method: 'POST',
      headers: await getTrackerHeaders(),
      body: JSON.stringify({
        query: `
          mutation RegisterTrackWebhook($input: RegisterTrackWebhookInput!) {
            registerTrackWebhook(input: $input)
          }
        `,
        variables: {
          input: {
            carrierId,
            trackingNumber,
            callbackUrl,
            expirationTime
          }
        }
      })
    });

    const json = await res.json();
    console.log('[Webhook 등록 결과]', JSON.stringify({ carrierId, trackingNumber, callbackUrl, expirationTime, response: json }, null, 2));
    
    if (json?.errors) {
      console.error('[Webhook 등록 에러]', json.errors);
      return false;
    }
    
    return json?.data?.registerTrackWebhook === true;
  } catch (error) {
    console.error('Webhook registration error:', error);
    return false;
  }
}

// 배송 상태 코드 → 한글 변환
function getDeliveryStatusText(code: string): string {
  const statusMap: Record<string, string> = {
    'INFORMATION_RECEIVED': '운송장 등록',
    'AT_PICKUP': '상품 인수',
    'IN_TRANSIT': '배송 중',
    'OUT_FOR_DELIVERY': '배달 출발',
    'ATTEMPT_FAIL': '배달 실패',
    'DELIVERED': '배달 완료',
    'AVAILABLE_FOR_PICKUP': '수령 가능',
    'EXCEPTION': '배송 예외',
  };
  return statusMap[code] || code;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const supabase = createSupabaseClient();

    // ===== POST /api-store-orders/tracking-webhook - Webhook Callback (인증 불필요) =====
    if (pathname === '/api-store-orders/tracking-webhook' && req.method === 'POST') {
      const body = await req.json();
      const { carrierId, trackingNumber } = body;

      console.log('[Webhook 수신]', { carrierId, trackingNumber });

      if (!carrierId || !trackingNumber) {
        return new Response(null, { status: 202, headers: corsHeaders });
      }

      // carrierId에서 courier 코드 추출 (kr.cjlogistics → cj)
      const courierEntry = Object.entries(CARRIER_MAP).find(([, id]) => id === carrierId);
      const courier = courierEntry?.[0];

      if (!courier) {
        console.log('[Webhook] 알 수 없는 carrierId:', carrierId);
        return new Response(null, { status: 202, headers: corsHeaders });
      }

      // 해당 운송장 번호로 배송 정보 조회 (store_shipments 테이블)
      const { data: shipments, error: shipmentError } = await supabase
        .from('store_shipments')
        .select('shipment_id, order_id, status, courier, tracking_number')
        .eq('tracking_number', trackingNumber)
        .eq('courier', courier)
        .in('status', ['shipped', 'delivered']);

      if (shipmentError || !shipments || shipments.length === 0) {
        console.log('[Webhook] 배송 정보를 찾을 수 없음:', { trackingNumber, courier });
        return new Response(null, { status: 202, headers: corsHeaders });
      }

      // Query.track으로 최신 상태 조회 (전체 이벤트 포함)
      const tracking = await fetchDeliveryTracking(courier, trackingNumber);
      
      if (tracking) {
        const lastEvent = tracking.lastEvent;
        const deliveryStatus = lastEvent?.status?.code || null;
        const deliveryStatusText = deliveryStatus ? getDeliveryStatusText(deliveryStatus) : null;
        const deliveryDescription = lastEvent?.description || null;
        const deliveryUpdatedAt = lastEvent?.time || new Date().toISOString();

        // 이벤트 히스토리를 한글 상태와 함께 저장
        const deliveryEvents = tracking.events.map(event => ({
          time: event.time,
          status: event.status?.code,
          statusText: getDeliveryStatusText(event.status?.code || ''),
          description: event.description
        }));

        // 배송 상태 업데이트 (store_shipments 테이블)
        for (const shipment of shipments) {
          const shipmentUpdateData: Record<string, unknown> = {
            delivery_status: deliveryStatus,
            delivery_status_text: deliveryStatusText,
            delivery_description: deliveryDescription,
            delivery_updated_at: deliveryUpdatedAt,
            delivery_events: deliveryEvents,
          };

          // 배달 완료 상태면 배송 상태도 delivered로 변경
          if (deliveryStatus === 'DELIVERED' && shipment.status === 'shipped') {
            shipmentUpdateData.status = 'delivered';
            shipmentUpdateData.delivered_at = new Date().toISOString();

            // 주문 상태도 delivered로 변경
          await supabase
            .from('store_orders')
              .update({ status: 'delivered' })
              .eq('order_id', shipment.order_id);

            // order_items 상태도 업데이트
            await supabase
              .from('store_order_items')
              .update({ status: 'delivered' })
              .eq('order_id', shipment.order_id)
              .eq('product_type', 'delivery');
          }

          await supabase
            .from('store_shipments')
            .update(shipmentUpdateData)
            .eq('shipment_id', shipment.shipment_id);

          console.log('[Webhook] 배송 정보 업데이트:', { 
            shipmentId: shipment.shipment_id, 
            orderId: shipment.order_id,
            deliveryStatus, 
            deliveryStatusText,
            eventsCount: deliveryEvents.length 
          });
        }
      }

      // 202 Accepted 반환 (1초 내 응답 필수)
      return new Response(null, { status: 202, headers: corsHeaders });
    }

    // ===== GET /api-store-orders - 내 주문 목록 조회 =====
    // 날짜 필터: created_from, created_to (주문생성시간), completed_from, completed_to (주문완료시간)
    if (pathname === '/api-store-orders' && req.method === 'GET') {
      const user = await getAuthUser(req);
      const params = getQueryParams(req.url);
      const status = params.status;
      const includeTracking = params.includeTracking === 'true';
      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '20');
      const offset = (page - 1) * limit;
      
      // 날짜 필터 파라미터
      const createdFrom = params.created_from; // 주문생성 시작일 (ISO 8601)
      const createdTo = params.created_to; // 주문생성 종료일 (ISO 8601)
      const completedFrom = params.completed_from; // 주문완료 시작일 (ISO 8601)
      const completedTo = params.completed_to; // 주문완료 종료일 (ISO 8601)

      let query = supabase
        .from('store_orders')
        .select(`
          *,
          order_items:store_order_items(
            order_item_id, product_id, product_name, product_price, product_type, product_source,
            quantity, unit_price, subtotal, status, is_confirmed, confirmed_at, selected_options,
            product:store_products(product_id, name, thumbnail_url, is_bundle_available)
          ),
          shipments:store_shipments(
            shipment_id, shipping_fee, status, courier, tracking_number,
            recipient_name, recipient_phone, recipient_address, recipient_postal_code,
            delivery_status, delivery_status_text, shipped_at, delivered_at
          ),
          partner:partners(id, partner_name, member:members(id, name, profile_image))
        `, { count: 'exact' })
        .eq('user_id', user.id);

      if (status) {
        query = query.eq('status', status);
      }

      // 주문생성시간 필터
      if (createdFrom) {
        query = query.gte('created_at', createdFrom);
      }
      if (createdTo) {
        query = query.lte('created_at', createdTo);
      }

      // 주문완료시간 필터 (confirmed_at 사용)
      if (completedFrom) {
        query = query.gte('confirmed_at', completedFrom);
      }
      if (completedTo) {
        query = query.lte('confirmed_at', completedTo);
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      // 배송추적 정보 포함 옵션 처리
      if (includeTracking && data) {
        // deno-lint-ignore no-explicit-any
        const trackingPromises = data.map(async (order: Record<string, any>) => {
          // shipments에서 배송 정보 확인
          const shipment = order.shipments?.[0];
          if (
            shipment &&
            ['shipped', 'delivered'].includes(shipment.status) &&
            shipment.courier &&
            shipment.tracking_number
          ) {
            const tracking = await fetchDeliveryTracking(
              shipment.courier,
              shipment.tracking_number
            );

            return {
              ...order,
              delivery_tracking: tracking
            };
          }

          return {
            ...order,
            delivery_tracking: null
          };
        });

        const ordersWithTracking = await Promise.all(trackingPromises);

        return successResponse(ordersWithTracking, {
          total: count,
          page,
          limit,
          totalPages: Math.ceil((count || 0) / limit)
        });
      }

      return successResponse(data, {
        total: count,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      });
    }

    // ===== GET /api-store-orders/:id - 주문 상세 조회 =====
    const orderDetailMatch = pathname.match(/^\/api-store-orders\/([a-f0-9-]+)$/);
    if (orderDetailMatch && req.method === 'GET') {
      const user = await getAuthUser(req);
      const orderId = orderDetailMatch[1];

      // Admin 확인
      const { data: member } = await supabase
        .from('members')
        .select('role')
        .eq('id', user.id)
        .single();

      const isAdmin = member?.role === 'admin';

      // 파트너 확인 (상품 등록자)
      const { data: partnerData } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', user.id)
        .maybeSingle();

      // 주문 조회 (정규화된 구조: order_items, shipments 포함)
      const { data, error } = await supabase
        .from('store_orders')
        .select(`
          *,
          order_items:store_order_items(
            order_item_id, product_id, product_name, product_price, product_type, product_source,
            quantity, unit_price, subtotal, status, is_confirmed, confirmed_at, created_at, selected_options,
            product:store_products(product_id, name, description, thumbnail_url, is_bundle_available,
              images:store_product_images(image_id, image_url, display_order)
            )
          ),
          shipments:store_shipments(
            shipment_id, order_id, shipping_fee, status, courier, tracking_number,
            recipient_name, recipient_phone, recipient_address, recipient_address_detail, recipient_postal_code,
            delivery_memo, delivery_status, delivery_status_text, delivery_description,
            delivery_updated_at, delivery_events, shipped_at, delivered_at, created_at,
            shipment_items:store_shipment_items(
              shipment_item_id, order_item_id, quantity
            )
          ),
          partner:partners(id, partner_name, member:members(id, name, profile_image)),
          buyer:members!user_id(id, name, profile_image)
        `)
        .eq('order_id', orderId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return errorResponse('NOT_FOUND', '주문을 찾을 수 없습니다.', null, 404);
        }
        throw error;
      }

      // 권한 확인: Admin, 주문자, 상품 등록 파트너
      const isOrderOwner = data.user_id === user.id;
      const isProductPartner = partnerData && data.partner_id === partnerData.id;

      if (!isAdmin && !isOrderOwner && !isProductPartner) {
        return errorResponse('FORBIDDEN', '이 주문을 조회할 권한이 없습니다.', null, 403);
      }

      // 결제 정보 별도 조회
      const { data: payment } = await supabase
        .from('store_payments')
        .select('*')
        .eq('order_id', orderId)
        .maybeSingle();

      // 환불 정보 별도 조회
      const { data: refund } = await supabase
        .from('store_refunds')
        .select('*')
        .eq('order_id', orderId)
        .maybeSingle();

      // 배송추적 정보 구성 (shipments 테이블 기준)
      let deliveryTracking: Record<string, unknown> | null = null;
      let deliveryEvents: Array<Record<string, unknown>> = [];

      // 첫 번째 배송 정보 확인 (택배 상품인 경우)
      const shipment = data.shipments?.[0];
      const trackableStatuses = ['shipped', 'delivered', 'refund_requested', 'refunded'];

      if (
        shipment &&
        trackableStatuses.includes(shipment.status) &&
        shipment.courier &&
        shipment.tracking_number
      ) {
        // 저장된 배송 정보가 있으면 사용
        if (shipment.delivery_status) {
          deliveryTracking = {
            time: shipment.delivery_updated_at,
            status: { code: shipment.delivery_status },
            statusText: shipment.delivery_status_text,
            description: shipment.delivery_description,
            source: 'cached'
          };
          deliveryEvents = shipment.delivery_events || [];
        }

        // 저장된 정보가 없거나 5분 이상 지났으면 실시간 조회
        const lastUpdate = shipment.delivery_updated_at ? new Date(shipment.delivery_updated_at).getTime() : 0;
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        
        if (!shipment.delivery_status || lastUpdate < fiveMinutesAgo) {
          const liveTracking = await fetchDeliveryTracking(
            shipment.courier,
            shipment.tracking_number
          );
          
          if (liveTracking) {
            const lastEvent = liveTracking.lastEvent;
            const deliveryStatus = lastEvent?.status?.code || null;
            const deliveryStatusText = deliveryStatus ? getDeliveryStatusText(deliveryStatus) : null;
            
            deliveryEvents = liveTracking.events.map(event => ({
              time: event.time,
              status: event.status?.code,
              statusText: getDeliveryStatusText(event.status?.code || ''),
              description: event.description
            }));

            deliveryTracking = {
              time: lastEvent?.time,
              status: lastEvent?.status,
              statusText: deliveryStatusText,
              description: lastEvent?.description,
              source: 'live'
            };

            // store_shipments 테이블에 최신 정보 저장
            const shipmentUpdateData: Record<string, unknown> = {
              delivery_status: deliveryStatus,
              delivery_status_text: deliveryStatusText,
              delivery_description: lastEvent?.description,
              delivery_updated_at: lastEvent?.time || new Date().toISOString(),
              delivery_events: deliveryEvents,
            };

            // 배달 완료 상태면 배송 상태도 변경
            if (deliveryStatus === 'DELIVERED' && shipment.status === 'shipped') {
              shipmentUpdateData.status = 'delivered';
              shipmentUpdateData.delivered_at = new Date().toISOString();

              // 주문 상태도 변경
            await supabase
              .from('store_orders')
                .update({ status: 'delivered' })
              .eq('order_id', orderId);
            }

            await supabase
              .from('store_shipments')
              .update(shipmentUpdateData)
              .eq('shipment_id', shipment.shipment_id);
          }
        }
      }

      return successResponse({
        ...data,
        payment,
        refund,
        delivery_tracking: deliveryTracking,
        delivery_events: deliveryEvents
      });
    }

    // ===== POST /api-store-orders - 주문 생성 및 결제 =====
    if (pathname === '/api-store-orders' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body) {
        return errorResponse('INVALID_REQUEST', '요청 본문이 필요합니다.');
      }

      const { 
        product_id, 
        quantity = 1, 
        recipient_name, 
        recipient_phone, 
        recipient_address, 
        recipient_postal_code, 
        delivery_memo,
        shipping_fee = 0, // 배송비 (택배수령 상품용)
        schedule_id, // 현장수령 스케줄 ID (신규)
        reserved_start_time, // 현장수령 예약 시작 시간 (하위호환)
        reserved_end_time, // 현장수령 예약 종료 시간 (하위호환)
        reserved_location, // 현장수령 장소 (하위호환)
        reserved_location_point, // 현장수령 좌표 (하위호환)
        partner_id: requestPartnerId, // 채팅방 연결용 파트너 ID (협업 상품 등)
        selected_options // 선택한 옵션 배열 [{ option_id, value_id?, text_value? }]
      } = body;

      if (!product_id) {
        return errorResponse('INVALID_REQUEST', '상품 ID는 필수입니다.');
      }

      // 상품 확인
      const { data: product, error: productError } = await supabase
        .from('store_products')
        .select('*')
        .eq('product_id', product_id)
        .eq('is_active', true)
        .single();

      if (productError || !product) {
        return errorResponse('NOT_FOUND', '상품을 찾을 수 없습니다.', null, 404);
      }

      // 재고 확인 (delivery, on_site 상품)
      if ((product.product_type === 'delivery' || product.product_type === 'on_site') && product.stock !== null) {
        if (product.stock < quantity) {
          return errorResponse('INVALID_REQUEST', '재고가 부족합니다.');
        }
      }

      // ===== 옵션 검증 및 추가 금액 계산 (on_site, delivery 상품만) =====
      let optionsPriceAdjustment = 0;
      const validatedOptions: Array<{
        option_id: string;
        option_name: string;
        option_type: string;
        value_id?: string;
        value?: string;
        text_value?: string;
        price_adjustment: number;
      }> = [];

      if ((product.product_type === 'on_site' || product.product_type === 'delivery') && selected_options && Array.isArray(selected_options)) {
        // 상품의 옵션 조회
        const { data: productOptions, error: optionsError } = await supabase
          .from('store_product_options')
          .select('option_id, name, option_type, is_required')
          .eq('product_id', product_id)
          .order('display_order');

        if (optionsError) {
          console.error('옵션 조회 실패:', optionsError);
        }

        if (productOptions && productOptions.length > 0) {
          // 필수 옵션 체크
          const requiredOptions = productOptions.filter(opt => opt.is_required);
          for (const reqOpt of requiredOptions) {
            const selectedOpt = selected_options.find((so: { option_id: string }) => so.option_id === reqOpt.option_id);
            if (!selectedOpt) {
              return errorResponse('INVALID_REQUEST', `필수 옵션 "${reqOpt.name}"을(를) 선택해주세요.`);
            }
            // select 타입의 필수 옵션은 value_id 필수
            if (reqOpt.option_type === 'select' && !selectedOpt.value_id) {
              return errorResponse('INVALID_REQUEST', `필수 옵션 "${reqOpt.name}"의 값을 선택해주세요.`);
            }
          }

          // 선택된 옵션 검증 및 가격 계산
          for (const selOpt of selected_options as Array<{ option_id: string; value_id?: string; text_value?: string }>) {
            const productOption = productOptions.find(po => po.option_id === selOpt.option_id);
            if (!productOption) {
              return errorResponse('INVALID_REQUEST', `유효하지 않은 옵션입니다: ${selOpt.option_id}`);
            }

            if (productOption.option_type === 'select') {
              // select 타입: value_id로 옵션 값 조회
              if (!selOpt.value_id) {
                if (productOption.is_required) {
                  return errorResponse('INVALID_REQUEST', `옵션 "${productOption.name}"의 값을 선택해주세요.`);
                }
                continue; // 필수가 아니면 건너뛰기
              }

              const { data: optionValue, error: valueError } = await supabase
                .from('store_product_option_values')
                .select('value_id, value, price_adjustment, stock')
                .eq('value_id', selOpt.value_id)
                .eq('option_id', selOpt.option_id)
                .single();

              if (valueError || !optionValue) {
                return errorResponse('INVALID_REQUEST', `유효하지 않은 옵션 값입니다: ${selOpt.value_id}`);
              }

              // 옵션 값 재고 확인 (개별 재고가 설정된 경우)
              if (optionValue.stock !== null && optionValue.stock < quantity) {
                return errorResponse('INVALID_REQUEST', `옵션 "${productOption.name}: ${optionValue.value}"의 재고가 부족합니다.`);
              }

              // 가격 조정 누적
              optionsPriceAdjustment += (optionValue.price_adjustment || 0) * quantity;

              validatedOptions.push({
                option_id: selOpt.option_id,
                option_name: productOption.name,
                option_type: 'select',
                value_id: selOpt.value_id,
                value: optionValue.value,
                price_adjustment: optionValue.price_adjustment || 0
              });
            } else if (productOption.option_type === 'text') {
              // text 타입: 구매자 입력 (가격 조정 없음)
              validatedOptions.push({
                option_id: selOpt.option_id,
                option_name: productOption.name,
                option_type: 'text',
                text_value: selOpt.text_value || '',
                price_adjustment: 0
              });
            }
          }
        }
      }

      // 택배 수령 상품인 경우 배송 정보 및 배송비 필수
      if (product.product_type === 'delivery') {
        if (!recipient_name || !recipient_phone || !recipient_address) {
          return errorResponse('INVALID_REQUEST', '배송 정보(수령인, 연락처, 주소)는 필수입니다.');
        }
        if (shipping_fee < 0) {
          return errorResponse('INVALID_REQUEST', '배송비는 0 이상이어야 합니다.');
        }
        // 배송비 유효성 검증 (상품에 설정된 배송비 범위 내인지)
        const minShippingFee = product.shipping_fee_base || 0;
        const maxShippingFee = (product.shipping_fee_base || 0) + (product.shipping_fee_remote || 0);
        if (shipping_fee < minShippingFee || shipping_fee > maxShippingFee) {
          return errorResponse('INVALID_REQUEST', `배송비가 유효하지 않습니다. (${minShippingFee}~${maxShippingFee})`);
        }
      }

      // 현장수령 상품인 경우 스케줄 검증 및 예약 정보 구성
      let scheduleInfo: { start_time: string; end_time: string; location: string | null; location_point: { lat: number; lng: number } | null; } | null = null;
      let validatedScheduleId: string | null = null;
      
      // 디버그: 전달받은 예약 정보 로그
      console.log('[현장수령 주문] 전달받은 예약 정보:', { 
        product_type: product.product_type,
        schedule_id,
        reserved_start_time, 
        reserved_end_time, 
        reserved_location,
        reserved_location_point
      });
      
      if (product.product_type === 'on_site') {
        // 신규: schedule_id로 스케줄 조회 및 검증
        if (schedule_id) {
          const { data: schedule, error: scheduleError } = await supabase
            .from('store_partner_schedules')
            .select('schedule_id, product_id, start_time, end_time, location, location_point, is_available, current_bookings')
            .eq('schedule_id', schedule_id)
            .single();

          if (scheduleError || !schedule) {
            return errorResponse('NOT_FOUND', '스케줄을 찾을 수 없습니다.', null, 404);
          }

          // 스케줄이 해당 상품에 연결되어 있는지 검증
          if (schedule.product_id !== product_id) {
            return errorResponse('INVALID_REQUEST', '해당 상품의 스케줄이 아닙니다.');
          }

          // 스케줄 가용 여부 확인
          if (!schedule.is_available) {
            return errorResponse('INVALID_REQUEST', '해당 스케줄은 현재 예약할 수 없습니다.');
          }

          // 스케줄 정보 설정
        scheduleInfo = {
            start_time: schedule.start_time,
            end_time: schedule.end_time,
            location: schedule.location || null,
            location_point: schedule.location_point || null,
          };
          validatedScheduleId = schedule_id;
          console.log('[현장수령 주문] schedule_id로 스케줄 검증 완료:', scheduleInfo);
        }
        // 하위호환: reserved_start_time/end_time으로 직접 전달 (schedule_id가 없는 경우)
        else if (reserved_start_time && reserved_end_time) {
          const startDate = new Date(reserved_start_time);
          const endDate = new Date(reserved_end_time);
          const startValid = !isNaN(startDate.getTime());
          const endValid = !isNaN(endDate.getTime());
          
          console.log('[현장수령 주문] 하위호환 - 직접 전달된 예약 시간:', { 
            startDateStr: startValid ? startDate.toISOString() : 'Invalid',
            endDateStr: endValid ? endDate.toISOString() : 'Invalid'
          });
          
          if (startValid && endValid) {
            scheduleInfo = {
              start_time: startDate.toISOString(),
              end_time: endDate.toISOString(),
          location: reserved_location || null,
              location_point: reserved_location_point || null,
        };
          }
        } else if (product.source === 'collaboration') {
          // 협업 on_site: schedule에서 베이스 위치 조회 (start_time IS NULL인 베이스 schedule)
          const { data: baseSchedule } = await supabase
            .from('store_partner_schedules')
            .select('location, location_point')
            .eq('product_id', product_id)
            .is('start_time', null)
            .maybeSingle();

          if (baseSchedule) {
            scheduleInfo = {
              start_time: '',
              end_time: '',
              location: baseSchedule.location || reserved_location || null,
              location_point: baseSchedule.location_point || reserved_location_point || null,
            };
            console.log('[현장수령 주문] 협업 상품 베이스 스케줄에서 위치 조회:', scheduleInfo);
          } else {
            // fallback: 프론트에서 전달받은 값 사용
            scheduleInfo = {
              start_time: '',
              end_time: '',
              location: reserved_location || product.pickup_location || null,
              location_point: reserved_location_point || product.pickup_location_point || null,
            };
            console.log('[현장수령 주문] 협업 상품 베이스 스케줄 없음, fallback:', scheduleInfo);
          }
        } else {
          console.log('[현장수령 주문] 스케줄 정보 없음 - 스케줄 없이 주문 생성');
        }
      }

      // 상품 금액 계산 (옵션 추가 금액 포함)
      const productAmount = (product.price * quantity) + optionsPriceAdjustment;
      // 택배수령 상품인 경우 배송비 포함, 그 외는 배송비 0
      const deliveryFee = product.product_type === 'delivery' ? shipping_fee : 0;
      // 총 결제 금액 = 상품 금액 + 옵션 추가 금액 + 배송비
      const totalAmount = productAmount + deliveryFee;

      // ===== 포인트 결제 처리 =====
      // 유저 포인트 확인
      const { data: member, error: memberError } = await supabase
        .from('members')
        .select('id, total_points')
        .eq('id', user.id)
        .single();

      if (memberError || !member) {
        return errorResponse('NOT_FOUND', '회원 정보를 찾을 수 없습니다.', null, 404);
      }

      const userPoints = member.total_points || 0;

      // 포인트 부족 확인
      if (userPoints < totalAmount) {
        return errorResponse('INSUFFICIENT_POINTS', '포인트가 부족합니다.', {
          current_points: userPoints,
          required_points: totalAmount,
          shortage: totalAmount - userPoints
        });
      }

      // 프론트에서 전달받은 partner_id 우선 사용, 없으면 상품의 partner_id 사용
      const targetPartnerId = requestPartnerId || product.partner_id;

      // 주문 생성 (결제 완료 상태로) - product_id는 store_order_items에서 관리
      const orderInsertData: Record<string, any> = {
        user_id: user.id,
        partner_id: targetPartnerId, // 파트너 ID 저장
        quantity,
        order_type: 'single',
        subtotal_amount: productAmount,
        total_shipping_fee: deliveryFee,
        total_amount: totalAmount,
        status: 'paid', // 바로 결제 완료 상태로 생성
        recipient_name: product.product_type === 'delivery' ? recipient_name : null,
        recipient_phone: product.product_type === 'delivery' ? recipient_phone : null,
        recipient_address: product.product_type === 'delivery' ? recipient_address : null,
        recipient_postal_code: product.product_type === 'delivery' ? recipient_postal_code : null,
        delivery_memo: product.product_type === 'delivery' ? delivery_memo : null
      };

      // 현장수령 상품이고 스케줄 정보가 있는 경우 예약 정보 추가
      if (product.product_type === 'on_site' && scheduleInfo) {
        if (scheduleInfo.start_time) orderInsertData.reserved_start_time = scheduleInfo.start_time;
        if (scheduleInfo.end_time) orderInsertData.reserved_end_time = scheduleInfo.end_time;
        orderInsertData.reserved_location = scheduleInfo.location;
        if (scheduleInfo.location_point) {
          orderInsertData.reserved_location_point = scheduleInfo.location_point;
        }
      }

      const { data: order, error: orderError } = await supabase
        .from('store_orders')
        .insert(orderInsertData)
        .select()
        .single();

      if (orderError) {
        return errorResponse('INVALID_REQUEST', `주문 생성 실패: ${orderError.message}`, { code: orderError.code, details: orderError.details });
      }

      // store_order_items 생성
      const orderItemData: Record<string, unknown> = {
        order_id: order.order_id,
        product_id: product_id,
        product_name: product.name,
        product_price: product.price,
        product_type: product.product_type,
        product_source: product.source || 'partner',
        quantity,
        unit_price: product.price + (validatedOptions.length > 0 ? optionsPriceAdjustment / quantity : 0), // 개별 옵션 가격 포함
        subtotal: productAmount,
        status: product.product_type === 'digital' ? 'confirmed' : 'pending',
        is_confirmed: product.product_type === 'digital',
        confirmed_at: product.product_type === 'digital' ? new Date().toISOString() : null
      };

      // 옵션 정보가 있으면 저장
      if (validatedOptions.length > 0) {
        orderItemData.selected_options = validatedOptions;
      }

      const { data: orderItem, error: orderItemError } = await supabase
        .from('store_order_items')
        .insert(orderItemData)
        .select('order_item_id')
        .single();

      if (orderItemError) {
        console.error('주문 아이템 생성 실패:', orderItemError);
      }

      // 택배 상품인 경우 store_shipments 생성
      if (product.product_type === 'delivery') {
        const { error: shipmentError } = await supabase
          .from('store_shipments')
          .insert({
            order_id: order.order_id,
            shipping_fee: deliveryFee,
            recipient_name,
            recipient_phone,
            recipient_address,
            recipient_address_detail: body.recipient_address_detail || null,
            recipient_postal_code,
            delivery_memo: delivery_memo || null,
            status: 'pending'
          });

        if (shipmentError) {
          console.error('배송 정보 생성 실패:', shipmentError);
        }
        // 협업 택배 상품의 경우, 파트너가 수동으로 관리자에게 출고 요청을 보내는 구조
        // 자동 출고 요청 생성하지 않음
      }

      // 포인트 차감
      const newPoints = userPoints - totalAmount;
      const { error: pointUpdateError } = await supabase
        .from('members')
        .update({ total_points: newPoints })
        .eq('id', user.id);

      if (pointUpdateError) {
        // 포인트 차감 실패 시 주문 취소
        await supabase
          .from('store_orders')
          .update({ status: 'cancelled' })
          .eq('order_id', order.order_id);
        throw pointUpdateError;
      }

      // member_points_logs 기록
      const logId = `store_purchase_${order.order_id}_${user.id}`;
      const pointLogDescription = deliveryFee > 0 
        ? `스토어 상품 구매: ${product.name} (상품 ${productAmount.toLocaleString()}P + 배송비 ${deliveryFee.toLocaleString()}P)`
        : `스토어 상품 구매: ${product.name}`;
      
      const { error: pointLogError } = await supabase.from('member_points_logs').insert({
        member_id: user.id,
        type: 'spend',
        amount: totalAmount,
        description: pointLogDescription,
        log_id: logId
      });

      if (pointLogError) {
        console.error('포인트 로그 기록 실패:', pointLogError);
      }

      // 재고 차감 (delivery, on_site 상품, stock이 있는 경우) - 원본/복제 상품 동기화
      if ((product.product_type === 'delivery' || product.product_type === 'on_site') && product.stock !== null) {
        const newStock = product.stock - quantity;
        
        // 현재 상품 재고 차감
        await supabase
          .from('store_products')
          .update({ stock: newStock })
          .eq('product_id', product_id);

        // 협업 상품인 경우 원본/복제 상품 재고 동기화
        if (product.source === 'collaboration') {
          const parentProductId = product.parent_product_id;
          
          if (parentProductId) {
            // 복제된 상품인 경우: 원본 상품과 다른 복제 상품 동기화
            await supabase
              .from('store_products')
              .update({ stock: newStock })
              .eq('product_id', parentProductId);

            await supabase
              .from('store_products')
              .update({ stock: newStock })
              .eq('parent_product_id', parentProductId)
              .neq('product_id', product_id);
          } else {
            // 원본 상품인 경우: 모든 복제 상품 동기화
            await supabase
              .from('store_products')
              .update({ stock: newStock })
              .eq('parent_product_id', product_id);
          }
        }
      }

      // 옵션 값 재고 차감 (개별 재고가 설정된 옵션만)
      if (validatedOptions.length > 0) {
        for (const opt of validatedOptions) {
          if (opt.option_type === 'select' && opt.value_id) {
            // 현재 재고 조회
            const { data: optValue } = await supabase
              .from('store_product_option_values')
              .select('stock')
              .eq('value_id', opt.value_id)
              .single();

            // 개별 재고가 설정된 경우에만 차감
            if (optValue && optValue.stock !== null) {
              const newOptionStock = optValue.stock - quantity;
              await supabase
                .from('store_product_option_values')
                .update({ stock: newOptionStock })
                .eq('value_id', opt.value_id);
            }
          }
        }
      }

      // 구매 카운트 증가 (모든 상품 타입, 취소/환불 시에도 차감 안함)
      await supabase
        .from('store_products')
        .update({ purchase_count: (product.purchase_count || 0) + 1 })
        .eq('product_id', product_id);

      // 디지털 상품인 경우 다운로드 권한 부여 및 바로 구매 확정
      if (product.product_type === 'digital') {
        // 디지털 파일 조회
        const { data: assets } = await supabase
          .from('store_digital_assets')
          .select('asset_id')
          .eq('product_id', product_id);

        if (assets && assets.length > 0) {
          const downloadInserts = assets.map((asset: { asset_id: string }) => ({
            order_id: order.order_id,
            order_item_id: orderItem?.order_item_id || null,
            user_id: user.id,
            asset_id: asset.asset_id,
            download_count: 0
          }));

          await supabase.from('store_digital_downloads').insert(downloadInserts);
        }

        // 디지털 상품은 바로 구매 확정 처리
        await supabase
          .from('store_orders')
          .update({
            status: 'confirmed',
            is_confirmed: true,
            confirmed_at: new Date().toISOString()
          })
          .eq('order_id', order.order_id);

        // 디지털 상품 구매 확정 시 파트너 포인트 적립 처리
        try {
          await processPartnerPointSettlement(supabase, order.order_id, product, totalAmount);
        } catch (settlementError) {
          console.error('파트너 포인트 정산 실패:', settlementError);
        }
      }

      // 현장 수령 상품인 경우 - 픽업 기록 생성 및 채팅방 생성
      if (product.product_type === 'on_site') {
        // 픽업 기록 생성
        await supabase.from('store_on_site_pickups').insert({
          order_id: order.order_id,
          is_picked_up: false,
          no_show: false
        });

        // 스케줄 예약 시 current_bookings 증가
        if (validatedScheduleId) {
          const { data: currentSchedule } = await supabase
            .from('store_partner_schedules')
            .select('current_bookings')
            .eq('schedule_id', validatedScheduleId)
            .single();

          if (currentSchedule) {
            await supabase
              .from('store_partner_schedules')
              .update({ current_bookings: (currentSchedule.current_bookings || 0) + 1 })
              .eq('schedule_id', validatedScheduleId);
            
            console.log(`[현장수령 주문] 스케줄 current_bookings 증가: ${validatedScheduleId}`);
          }
        }

        // 파트너의 member_id 조회
        const { data: partnerData } = await supabase
          .from('partners')
          .select('id, member_id, partner_name, on_site_location')
          .eq('id', targetPartnerId)
          .single();

        if (partnerData?.member_id) {
          const partnerId = partnerData.member_id;

          // 기존 채팅방 확인 또는 생성
          let chatRoomId: string | null = null;
          
          const { data: existingRoom } = await supabase
            .from('chat_rooms')
            .select('id, left_by_creator, left_by_partner, created_by')
            .or(`and(created_by.eq.${user.id},partner_id.eq.${partnerId}),and(created_by.eq.${partnerId},partner_id.eq.${user.id})`)
            .maybeSingle();

          if (existingRoom) {
            chatRoomId = existingRoom.id;
            
            // 나간 채팅방인 경우 복원
            const isCreator = existingRoom.created_by === user.id;
            const myLeftField = isCreator ? 'left_by_creator' : 'left_by_partner';
            const myLeftValue = isCreator ? existingRoom.left_by_creator : existingRoom.left_by_partner;
            
            if (myLeftValue) {
              await supabase
                .from('chat_rooms')
                .update({ 
                  [myLeftField]: false,
                  is_active: true 
                })
                .eq('id', chatRoomId);
            }
          } else {
            // 새 채팅방 생성
            const { data: newRoom } = await supabase
              .from('chat_rooms')
              .insert({
                created_by: user.id,
                partner_id: partnerId,
                is_active: true
              })
              .select('id')
              .single();
            
            chatRoomId = newRoom?.id || null;
          }

          // 초기 메시지 발송 (시스템 메시지)
          if (chatRoomId) {
            const isCollabOnSite = product.source === 'collaboration';
            let locationText: string;
            let dateTimeText: string;
            let scheduleNote: string;

            if (isCollabOnSite) {
              // 협업 현장수령: 스케줄 없이 구매, 관리자가 일정 지정
              locationText = reserved_location || product.pickup_location || partnerData.on_site_location || '추후 안내 예정';
              dateTimeText = '상품 준비 후 안내 예정';
              scheduleNote = '수령 일정은 상품 준비 후 안내됩니다.';
            } else if (scheduleInfo) {
              locationText = scheduleInfo.location || partnerData.on_site_location || '추후 채팅으로 안내드립니다';
              const startTimeFormatted = new Date(scheduleInfo.start_time).toLocaleString('ko-KR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                weekday: 'short',
                hour: '2-digit',
                minute: '2-digit'
              });
              const endTimeFormatted = new Date(scheduleInfo.end_time).toLocaleString('ko-KR', {
                hour: '2-digit',
                minute: '2-digit'
              });
              dateTimeText = `${startTimeFormatted} ~ ${endTimeFormatted}`;
              scheduleNote = '예약 시간에 방문해 주세요!';
            } else {
              locationText = partnerData.on_site_location || '추후 채팅으로 안내드립니다';
              dateTimeText = '추후 확정 예정';
              scheduleNote = '수령 일정은 채팅을 통해 조율해 주세요.';
            }
            
            // 옵션 정보 문자열 생성
            let onSiteOptionsText = '';
            if (validatedOptions.length > 0) {
              onSiteOptionsText = '\n📋 선택 옵션\n';
              for (const opt of validatedOptions) {
                if (opt.option_type === 'select') {
                  onSiteOptionsText += `• ${opt.option_name}: ${opt.value}`;
                  if (opt.price_adjustment > 0) {
                    onSiteOptionsText += ` (+${opt.price_adjustment.toLocaleString()}P)`;
                  }
                  onSiteOptionsText += '\n';
                } else if (opt.option_type === 'text' && opt.text_value) {
                  onSiteOptionsText += `• ${opt.option_name}: ${opt.text_value}\n`;
                }
              }
            }

            // 협업 현장수령: STORE_ORDER_ON_SITE_COLLAB 태그 사용
            const orderTag = isCollabOnSite
              ? `[STORE_ORDER_ON_SITE_COLLAB:${order.order_id}:${targetPartnerId}]`
              : `[STORE_ORDER_ON_SITE:${order.order_id}:${targetPartnerId}]`;

            const initialMessage = `🛒 현장수령 상품 구매 알림\n\n` +
              `상품명: ${product.name}\n` +
              `구매 수량: ${quantity}개\n` +
              `결제 금액: ${order.total_amount.toLocaleString()}P` +
              (onSiteOptionsText ? `\n${onSiteOptionsText}` : '\n') +
              `\n📍 수령 장소: ${locationText}\n` +
              `📅 수령 일시: ${dateTimeText}\n\n` +
              `감사합니다! ${scheduleNote}\n\n` +
              orderTag;

            // 시스템 메시지는 partnerId를 sender로 설정하여 유저가 받는 메시지로 표시
            await supabase.from('member_chats').insert({
              chat_room_id: chatRoomId,
              sender_id: partnerId,
              receiver_id: user.id,
              message: initialMessage,
              message_type: 'system',
              is_read: false
            });

            // 채팅방 updated_at 갱신
            await supabase
              .from('chat_rooms')
              .update({ updated_at: new Date().toISOString() })
              .eq('id', chatRoomId);

            // 주문에 채팅방 ID 저장 (추후 참조용)
            await supabase
              .from('store_orders')
              .update({ chat_room_id: chatRoomId })
              .eq('order_id', order.order_id);
          }

          // === 파트너에게 새 주문 푸시 알림 발송 (현장수령) ===
          const supabaseUrl = Deno.env.get('SUPABASE_URL');
          const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
          const authHeader = req.headers.get('Authorization') || `Bearer ${anonKey}`;

          console.log('[주문 알림] 현장수령 상품 주문 - 푸시 알림 시도:', {
            partnerId,
            targetPartnerId,
            orderId: order.order_id,
            productName: product.name,
            totalAmount,
            supabaseUrl: supabaseUrl ? '있음' : '없음',
            anonKey: anonKey ? '있음' : '없음'
          });

          try {
            const pushResponse = await fetch(`${supabaseUrl}/functions/v1/push-native`, {
              method: 'POST',
              headers: {
                'Authorization': authHeader,
                'apikey': anonKey || '',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                action: 'enqueue_notification',
                user_id: partnerId,
                target_member_id: partnerId,
                title: '🛒 새로운 주문',
                body: `${product.name} 현장수령 상품 주문이 들어왔습니다. (${totalAmount.toLocaleString()}P)`,
                icon: null,
                url: '/partner/store/orders',
                notification_type: 'store_new_order',
                tag: `new_order_${order.order_id}`,
                data: { 
                  order_id: order.order_id, 
                  product_name: product.name,
                  product_type: 'on_site',
                  total_amount: totalAmount
                },
                process_immediately: true,
              }),
            });
            const pushResult = await pushResponse.text();
            console.log('[주문 알림] 현장수령 푸시 알림 응답:', {
              status: pushResponse.status,
              ok: pushResponse.ok,
              result: pushResult
            });
          } catch (e) {
            console.error('[주문 알림] 현장수령 푸시 알림 발송 실패:', e);
          }
        }
      }

      // 택배/디지털 상품인 경우 - 채팅방 생성 및 메시지 발송
      if (product.product_type === 'delivery' || product.product_type === 'digital') {
        const { data: partnerData } = await supabase
          .from('partners')
          .select('id, member_id, partner_name')
          .eq('id', targetPartnerId)
          .single();

        if (partnerData?.member_id) {
          const partnerId = partnerData.member_id;

          // 기존 채팅방 확인 또는 생성
          let chatRoomId: string | null = null;
          
          const { data: existingRoom } = await supabase
            .from('chat_rooms')
            .select('id, left_by_creator, left_by_partner, created_by')
            .or(`and(created_by.eq.${user.id},partner_id.eq.${partnerId}),and(created_by.eq.${partnerId},partner_id.eq.${user.id})`)
            .maybeSingle();

          if (existingRoom) {
            chatRoomId = existingRoom.id;
            
            // 나간 채팅방인 경우 복원
            const isCreator = existingRoom.created_by === user.id;
            const myLeftField = isCreator ? 'left_by_creator' : 'left_by_partner';
            const myLeftValue = isCreator ? existingRoom.left_by_creator : existingRoom.left_by_partner;
            
            if (myLeftValue) {
              await supabase
                .from('chat_rooms')
                .update({ 
                  [myLeftField]: false,
                  is_active: true 
                })
                .eq('id', chatRoomId);
            }
          } else {
            // 새 채팅방 생성
            const { data: newRoom } = await supabase
              .from('chat_rooms')
              .insert({
                created_by: user.id,
                partner_id: partnerId,
                is_active: true
              })
              .select('id')
              .single();
            
            chatRoomId = newRoom?.id || null;
          }

          // 초기 메시지 발송 (시스템 메시지)
          if (chatRoomId) {
            let initialMessage = '';
            
            // 옵션 정보 문자열 생성
            let optionsText = '';
            if (validatedOptions.length > 0) {
              optionsText = '\n📋 선택 옵션\n';
              for (const opt of validatedOptions) {
                if (opt.option_type === 'select') {
                  optionsText += `• ${opt.option_name}: ${opt.value}`;
                  if (opt.price_adjustment > 0) {
                    optionsText += ` (+${opt.price_adjustment.toLocaleString()}P)`;
                  }
                  optionsText += '\n';
                } else if (opt.option_type === 'text' && opt.text_value) {
                  optionsText += `• ${opt.option_name}: ${opt.text_value}\n`;
                }
              }
            }
            
            if (product.product_type === 'delivery') {
              // 택배 상품 (협업/개인 분기)
              const isCollaboration = product.source === 'collaboration';
              const messageTag = isCollaboration 
                ? `[STORE_ORDER_DELIVERY_COLLAB:${order.order_id}:${targetPartnerId}]`
                : `[STORE_ORDER_DELIVERY:${order.order_id}:${targetPartnerId}]`;
              const actionGuide = isCollaboration
                ? `\n협업 상품입니다. 출고요청을 등록해 주세요.\n\n`
                : `\n상품 준비 후 송장번호를 입력해 주세요.\n\n`;
              
              initialMessage = `🛒 택배 상품 구매 알림\n\n` +
                `상품명: ${product.name}\n` +
                `구매 수량: ${quantity}개\n` +
                `결제 금액: ${order.total_amount.toLocaleString()}P\n` +
                (deliveryFee > 0 ? `배송비: ${deliveryFee.toLocaleString()}P\n` : '') +
                (optionsText ? optionsText : '') +
                `\n📦 배송지 정보\n` +
                `받는 분: ${recipient_name || '-'}\n` +
                `연락처: ${recipient_phone || '-'}\n` +
                `주소: ${recipient_address || '-'}\n` +
                (delivery_memo ? `요청사항: ${delivery_memo}\n` : '') +
                actionGuide + messageTag;
            } else {
              // 디지털 상품
              initialMessage = `🛒 디지털 상품 구매 알림\n\n` +
                `상품명: ${product.name}\n` +
                `구매 수량: ${quantity}개\n` +
                `결제 금액: ${order.total_amount.toLocaleString()}P\n` +
                (optionsText ? optionsText : '') +
                `\n구매해 주셔서 감사합니다!\n` +
                `구매 내역에서 다운로드가 가능합니다.\n\n` +
                `[STORE_ORDER_DIGITAL:${order.order_id}:${targetPartnerId}]`;
            }

            // 시스템 메시지는 partnerId를 sender로 설정하여 유저가 받는 메시지로 표시
            await supabase.from('member_chats').insert({
              chat_room_id: chatRoomId,
              sender_id: partnerId,
              receiver_id: user.id,
              message: initialMessage,
              message_type: 'system',
              is_read: false
            });

            // 채팅방 updated_at 갱신
            await supabase
              .from('chat_rooms')
              .update({ updated_at: new Date().toISOString() })
              .eq('id', chatRoomId);

            // 주문에 채팅방 ID 저장
            await supabase
              .from('store_orders')
              .update({ chat_room_id: chatRoomId })
              .eq('order_id', order.order_id);
          }

          // === 파트너에게 새 주문 푸시 알림 발송 ===
          const supabaseUrl = Deno.env.get('SUPABASE_URL');
          const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
          const authHeader = req.headers.get('Authorization') || `Bearer ${anonKey}`;

          console.log('[주문 알림] 택배/디지털 상품 주문 - 푸시 알림 시도:', {
            partnerId,
            targetPartnerId,
            orderId: order.order_id,
            productName: product.name,
            productType: product.product_type,
            totalAmount,
            supabaseUrl: supabaseUrl ? '있음' : '없음',
            anonKey: anonKey ? '있음' : '없음'
          });

          try {
            const pushResponse = await fetch(`${supabaseUrl}/functions/v1/push-native`, {
              method: 'POST',
              headers: {
                'Authorization': authHeader,
                'apikey': anonKey || '',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                action: 'enqueue_notification',
                user_id: partnerId,
                target_member_id: partnerId,
                title: '🛒 새로운 주문',
                body: `${product.name} ${product.product_type === 'delivery' ? '택배' : '디지털'} 상품 주문이 들어왔습니다. (${totalAmount.toLocaleString()}P)`,
                icon: null,
                url: '/partner/store/orders',
                notification_type: 'store_new_order',
                tag: `new_order_${order.order_id}`,
                data: { 
                  order_id: order.order_id, 
                  product_name: product.name,
                  product_type: product.product_type,
                  total_amount: totalAmount
                },
                process_immediately: true,
              }),
            });
            const pushResult = await pushResponse.text();
            console.log('[주문 알림] 택배/디지털 푸시 알림 응답:', {
              status: pushResponse.status,
              ok: pushResponse.ok,
              result: pushResult
            });
          } catch (e) {
            console.error('[주문 알림] 택배/디지털 푸시 알림 발송 실패:', e);
          }
        }
      }

      return successResponse({
        ...order,
        status: product.product_type === 'digital' ? 'confirmed' : 'paid',
        message: '주문 및 결제가 완료되었습니다.',
        product_amount: productAmount,
        shipping_fee: deliveryFee,
        paid_amount: totalAmount,
        remaining_points: newPoints
      });
    }

    // ===== PUT /api-store-orders/:id/status - 주문 상태 변경 (파트너/관리자) =====
    const orderStatusMatch = pathname.match(/^\/api-store-orders\/([a-f0-9-]+)\/status$/);
    if (orderStatusMatch && req.method === 'PUT') {
      const user = await getAuthUser(req);
      const orderId = orderStatusMatch[1];
      const body = await parseRequestBody(req);

      if (!body || !body.status) {
        return errorResponse('INVALID_REQUEST', '상태 값이 필요합니다.');
      }

      const { status, courier, tracking_number, shipment_id } = body;

      // 주문 확인 (shipments 포함)
      const { data: order, error: orderError } = await supabase
        .from('store_orders')
        .select(`
          *,
          order_items:store_order_items(order_item_id, product_type),
          shipments:store_shipments(shipment_id, status),
          partner:partners(id, member_id)
        `)
        .eq('order_id', orderId)
        .single();

      if (orderError || !order) {
        return errorResponse('NOT_FOUND', '주문을 찾을 수 없습니다.', null, 404);
      }

      // 권한 확인 (파트너 또는 관리자)
      const { data: member } = await supabase
        .from('members')
        .select('role')
        .eq('id', user.id)
        .single();

      const isAdmin = member?.role === 'admin';

      const { data: partnerCheck } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', user.id)
        .single();

      const isOwner = partnerCheck && order.partner_id === partnerCheck.id;

      if (!isAdmin && !isOwner) {
        return errorResponse('FORBIDDEN', '권한이 없습니다.', null, 403);
      }

      // 배송이 있는 주문인지 확인
      const hasDeliveryItems = order.order_items?.some((item: any) => item.product_type === 'delivery');
      const shipment = shipment_id 
        ? order.shipments?.find((s: any) => s.shipment_id === shipment_id)
        : order.shipments?.[0];

      // 주문 상태 업데이트
      const orderUpdateData: Record<string, any> = { status };
      
      if (status === 'delivered') {
        orderUpdateData.delivered_at = new Date().toISOString();
      }

      const { data: updatedOrder, error: updateError } = await supabase
        .from('store_orders')
        .update(orderUpdateData)
        .eq('order_id', orderId)
        .select()
        .single();

      if (updateError) throw updateError;

      // 배송 시작인 경우 (shipped) - shipments 테이블 업데이트
      if (status === 'shipped' && hasDeliveryItems && shipment) {
        if (!courier || !tracking_number) {
          return errorResponse('INVALID_REQUEST', '택배사와 송장번호는 필수입니다.');
        }

        const shipmentUpdateData: Record<string, any> = {
            status: 'shipped', 
          courier,
          tracking_number,
          shipped_at: new Date().toISOString()
        };

        await supabase
          .from('store_shipments')
          .update(shipmentUpdateData)
          .eq('shipment_id', shipment.shipment_id);

        // order_items 상태도 업데이트
        await supabase
          .from('store_order_items')
          .update({ status: 'shipped' })
          .eq('order_id', orderId)
          .eq('product_type', 'delivery');

        // Webhook 등록
        const baseUrl = Deno.env.get('SUPABASE_URL') || '';
        const callbackUrl = `${baseUrl}/functions/v1/api-store-orders/tracking-webhook`;
        
        const webhookRegistered = await registerTrackWebhook(
          courier,
          tracking_number,
          callbackUrl,
          48
        );

        if (webhookRegistered) {
          const webhookExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
          await supabase
            .from('store_shipments')
            .update({ webhook_expires_at: webhookExpiresAt })
            .eq('shipment_id', shipment.shipment_id);
          
          console.log('[배송 시작] Webhook 등록 완료:', { orderId, shipmentId: shipment.shipment_id, courier, tracking_number });
        }
      }

      // 배송 완료인 경우 - shipments 테이블 업데이트
      if (status === 'delivered' && shipment) {
        await supabase
          .from('store_shipments')
          .update({
            status: 'delivered',
            delivered_at: new Date().toISOString()
          })
          .eq('shipment_id', shipment.shipment_id);

        // order_items 상태도 업데이트
        await supabase
          .from('store_order_items')
          .update({ status: 'delivered' })
          .eq('order_id', orderId)
          .eq('product_type', 'delivery');
      }

      // 협업 상품이고 배송 시작인 경우 협업 출고 요청 업데이트
      if (status === 'shipped') {
        await supabase
          .from('store_collaboration_requests')
          .update({ 
            status: 'shipped', 
            processed_at: new Date().toISOString() 
          })
            .eq('order_id', orderId);
      }

      // === 구매자에게 출고/배송완료 푸시 알림 발송 ===
      if (['shipped', 'delivered'].includes(status)) {
        const buyerId = order.user_id;
        // deno-lint-ignore no-explicit-any
        const productNames = order.order_items?.filter((item: any) => item.product_type === 'delivery').map((item: any) => item.product_name).join(', ') || '상품';
        
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
        const authHeader = req.headers.get('Authorization') || `Bearer ${anonKey}`;

        let title = '';
        let bodyText = '';

        if (status === 'shipped') {
          title = '🚚 상품 출고';
          bodyText = `${productNames} 상품이 출고되었습니다. (${courier || '택배'} ${tracking_number || ''})`;
        } else if (status === 'delivered') {
          title = '✅ 배송 완료';
          bodyText = `${productNames} 상품이 배송 완료되었습니다. 구매 확정해 주세요!`;
        }

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
              user_id: buyerId,
              target_member_id: buyerId,
              title,
              body: bodyText,
              icon: null,
              url: `/store/orders/${orderId}`,
              notification_type: status === 'shipped' ? 'store_order_shipped' : 'store_order_delivered',
              tag: `order_${status}_${orderId}`,
              data: { order_id: orderId, status, courier, tracking_number },
              process_immediately: true,
            }),
          });
        } catch (e) {
          console.error('배송 알림 푸시 발송 실패:', e);
        }
      }

      // 최종 주문 정보 조회하여 반환
      const { data: finalOrder } = await supabase
        .from('store_orders')
        .select(`
          *,
          order_items:store_order_items(*),
          shipments:store_shipments(*)
        `)
        .eq('order_id', orderId)
        .single();

      return successResponse(finalOrder || updatedOrder);
    }

    // ===== PUT /api-store-orders/:id/confirm - 구매 확정 =====
    const orderConfirmMatch = pathname.match(/^\/api-store-orders\/([a-f0-9-]+)\/confirm$/);
    if (orderConfirmMatch && req.method === 'PUT') {
      const user = await getAuthUser(req);
      const orderId = orderConfirmMatch[1];

      // 주문 확인 (order_items를 통해 상품 정보 조회)
      const { data: order, error: orderError } = await supabase
        .from('store_orders')
        .select(`
          *,
          order_items:store_order_items(
            order_item_id, product_id, product_name, product_type, product_source, quantity, subtotal,
            product:store_products(product_id, name, source, partner_id, parent_product_id)
          )
        `)
        .eq('order_id', orderId)
        .eq('user_id', user.id)
        .single();

      if (orderError || !order) {
        return errorResponse('NOT_FOUND', '주문을 찾을 수 없습니다.', null, 404);
      }

      // 구매 확정 가능 상태 확인
      const confirmableStatuses = ['paid', 'delivered'];
      if (!confirmableStatuses.includes(order.status)) {
        return errorResponse('INVALID_REQUEST', '구매 확정이 불가능한 상태입니다.');
      }

      if (order.is_confirmed) {
        return errorResponse('INVALID_REQUEST', '이미 구매 확정된 주문입니다.');
      }

      // 구매 확정 처리
      const { data: confirmedOrder, error: confirmError } = await supabase
        .from('store_orders')
        .update({
          is_confirmed: true,
          confirmed_at: new Date().toISOString(),
          status: 'confirmed'
        })
        .eq('order_id', orderId)
        .select()
        .single();

      if (confirmError) throw confirmError;

      // order_items 상태도 업데이트
      await supabase
        .from('store_order_items')
        .update({
          status: 'confirmed',
          is_confirmed: true,
          confirmed_at: new Date().toISOString()
        })
        .eq('order_id', orderId);

      // ===== 파트너 포인트 적립 처리 (각 아이템별로) =====
      for (const item of order.order_items || []) {
        const productSource = item.product_source;
        const productId = item.product_id;
        const parentProductId = item.product?.parent_product_id;
        const itemAmount = item.subtotal;

        // 협업 상품인 경우: 같은 원본 상품을 가진 모든 협업 파트너에게 배분
        if (productSource === 'collaboration') {
          // 원본 상품 ID 찾기 (parent_product_id가 있으면 그것, 없으면 현재 product_id)
          const originalProductId = parentProductId || productId;
          
          // 해당 원본 상품의 모든 협업 요청 조회 (모든 파트너)
          const { data: allCollaborationRequests } = await supabase
            .from('store_collaboration_requests')
            .select('request_id, partner_id, share_rate, distribution_rate, status')
            .eq('product_id', originalProductId)
            .eq('status', 'accepted');
          
          if (allCollaborationRequests && allCollaborationRequests.length > 0) {
            const allShareRateNull = allCollaborationRequests.every((r: any) => r.share_rate == null);

            if (allShareRateNull) {
              // 개별 정산 모드: 주문 파트너에게만, distribution_rate 적용
              const orderPartnerId = order.partner_id;
              if (orderPartnerId) {
                const orderPartnerReq = allCollaborationRequests.find((r: any) => r.partner_id === orderPartnerId);
                const distRate = orderPartnerReq?.distribution_rate ?? 100;
                const settledAmount = Math.floor(itemAmount * (Number(distRate) / 100));
                if (settledAmount > 0) {
                  const { data: partner } = await supabase
                    .from('partners')
                    .select('id, collaboration_store_points')
                    .eq('id', orderPartnerId)
                    .single();
                  if (partner) {
                    const saleLogId = `store_sale_${orderId}_${item.order_item_id}_${orderPartnerId}`;
                    const { data: existingLog } = await supabase.from('partner_points_logs').select('id').eq('log_id', saleLogId).maybeSingle();
                    if (!existingLog) {
                      const newCollabPoints = (partner.collaboration_store_points || 0) + settledAmount;
                      await supabase.from('partners').update({ collaboration_store_points: newCollabPoints }).eq('id', orderPartnerId);
                      await supabase.from('partner_points_logs').insert({
                        partner_id: orderPartnerId, type: 'earn', amount: settledAmount,
                        description: `협업 상품 판매 (개별 정산, 정산율 ${distRate}%): ${item.product_name}`,
                        log_id: saleLogId, point_type: 'collaboration_store_points'
                      });
                      console.log(`협업 개별 정산: 파트너=${orderPartnerId}, 정산율=${distRate}%, 적립금=${settledAmount}`);
                    }
                  }
                }
              }
            } else {
              // 배분율 모드: share_rate로 분배 후 distribution_rate 적용
              console.log(`협업상품 포인트 배분: 원본상품=${originalProductId}, 파트너수=${allCollaborationRequests.length}, 총금액=${itemAmount}`);
              for (const collabRequest of allCollaborationRequests) {
                const targetPartnerId = collabRequest.partner_id;
                const shareRate = collabRequest.share_rate ?? 100;
                const distRate = Number(collabRequest.distribution_rate ?? 100);
                const partnerAmount = Math.floor(itemAmount * (shareRate / 100) * (distRate / 100));
                if (partnerAmount <= 0) continue;
                const { data: partner } = await supabase
                  .from('partners')
                  .select('id, collaboration_store_points')
                  .eq('id', targetPartnerId)
                  .single();
                if (partner) {
                  const saleLogId = `store_sale_${orderId}_${item.order_item_id}_${targetPartnerId}`;
                  const { data: existingLog } = await supabase.from('partner_points_logs').select('id').eq('log_id', saleLogId).maybeSingle();
                  if (existingLog) { console.log(`이미 적립됨: ${saleLogId}`); continue; }
                  const newCollabPoints = (partner.collaboration_store_points || 0) + partnerAmount;
                  await supabase.from('partners').update({ collaboration_store_points: newCollabPoints }).eq('id', targetPartnerId);
                  await supabase.from('partner_points_logs').insert({
                    partner_id: targetPartnerId, type: 'earn', amount: partnerAmount,
                    description: `협업 상품 판매 (배분 ${shareRate}%, 정산율 ${distRate}%): ${item.product_name}`,
                    log_id: saleLogId, point_type: 'collaboration_store_points'
                  });
                  console.log(`협업 포인트 적립: 파트너=${targetPartnerId}, share_rate=${shareRate}%, dist_rate=${distRate}%, 적립금=${partnerAmount}`);
                }
              }
            }
          } else {
            // 협업 요청이 없는 경우 주문의 파트너에게만 적립 (fallback)
            const orderPartnerId = order.partner_id;
            if (orderPartnerId) {
              const { data: partner } = await supabase
                .from('partners')
                .select('id, collaboration_store_points')
                .eq('id', orderPartnerId)
                .single();
              
              if (partner) {
                const saleLogId = `store_sale_${orderId}_${item.order_item_id}_${orderPartnerId}`;
                const newCollabPoints = (partner.collaboration_store_points || 0) + itemAmount;
                await supabase
                  .from('partners')
                  .update({ collaboration_store_points: newCollabPoints })
                  .eq('id', orderPartnerId);
                
                await supabase.from('partner_points_logs').insert({
                  partner_id: orderPartnerId,
                  type: 'earn',
                  amount: itemAmount,
                  description: `협업 상품 판매: ${item.product_name}`,
                  log_id: saleLogId,
                  point_type: 'collaboration_store_points'
                });
              }
            }
          }
        } else {
          // 개인 상품: 주문의 파트너에게 전액 적립
          const orderPartnerId = order.partner_id;
          if (orderPartnerId) {
            const { data: partner } = await supabase
              .from('partners')
              .select('id, store_points')
              .eq('id', orderPartnerId)
              .single();
            
            if (partner) {
              const saleLogId = `store_sale_${orderId}_${item.order_item_id}_${orderPartnerId}`;
              const newStorePoints = (partner.store_points || 0) + itemAmount;
              await supabase
                .from('partners')
                .update({ store_points: newStorePoints })
                .eq('id', orderPartnerId);
              
              await supabase.from('partner_points_logs').insert({
                partner_id: orderPartnerId,
                type: 'earn',
                amount: itemAmount,
                description: `스토어 상품 판매: ${item.product_name}`,
                log_id: saleLogId,
                point_type: 'store_points'
              });
            }
          }
        }
      }

      return successResponse({
        ...confirmedOrder,
        message: '구매가 확정되었습니다.'
      });
    }

    // ===== PUT /api-store-orders/:id/cancel - 주문 전체 취소 =====
    const orderCancelMatch = pathname.match(/^\/api-store-orders\/([a-f0-9-]+)\/cancel$/);
    if (orderCancelMatch && req.method === 'PUT') {
      const user = await getAuthUser(req);
      const orderId = orderCancelMatch[1];

      // 주문 확인 (order_items를 통해 상품 정보 조회, selected_options 포함) - user_id 조건 제거하여 파트너도 조회 가능
      const { data: order, error: orderError } = await supabase
        .from('store_orders')
        .select(`
          *,
          order_items:store_order_items(
            order_item_id, product_id, product_name, product_type, product_source, quantity, subtotal, status, selected_options,
            product:store_products(product_id, stock, source, parent_product_id)
          ),
          schedule:store_partner_schedules(schedule_id, current_bookings)
        `)
        .eq('order_id', orderId)
        .single();

      if (orderError || !order) {
        return errorResponse('NOT_FOUND', '주문을 찾을 수 없습니다.', null, 404);
      }

      // 권한 확인: 구매자 또는 파트너만 취소 가능
      const isBuyer = order.user_id === user.id;
      
      // 파트너 확인
      const { data: partnerCheck } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', user.id)
        .single();
      
      const isPartner = partnerCheck && order.partner_id === partnerCheck.id;

      if (!isBuyer && !isPartner) {
        return errorResponse('FORBIDDEN', '주문을 취소할 권한이 없습니다.', null, 403);
      }

      // 디지털 상품 포함 여부 확인
      // deno-lint-ignore no-explicit-any
      const digitalItems = order.order_items?.filter((item: any) => item.product_type === 'digital') || [];
      // deno-lint-ignore no-explicit-any
      const nonDigitalItems = order.order_items?.filter((item: any) => item.product_type !== 'digital') || [];

      // 디지털 상품만 있는 경우 전체 취소 불가
      if (digitalItems.length > 0 && nonDigitalItems.length === 0) {
        return errorResponse('INVALID_REQUEST', '디지털 상품은 취소할 수 없습니다.');
      }

      // 디지털 상품이 포함된 경우 전체 취소 불가 (개별 취소 안내)
      if (digitalItems.length > 0 && nonDigitalItems.length > 0) {
        return errorResponse('INVALID_REQUEST', 
          '디지털 상품이 포함된 주문은 전체 취소가 불가합니다. 개별 상품 취소를 이용해주세요. (PUT /api-store-orders/:id/cancel-item)',
          { 
            digital_items_count: digitalItems.length,
            cancellable_items_count: nonDigitalItems.length 
          }
        );
      }

      // 첫 번째 아이템에서 상품 타입 확인 (단일 상품 주문 기준)
      const firstItem = order.order_items?.[0];
      const productType = firstItem?.product_type;

      // === 취소 불가 조건 확인 ===

      // 현장수령 상품 - 수령 완료(confirmed) 시 취소 불가
      if (productType === 'on_site') {
        if (order.status === 'confirmed' || order.is_confirmed) {
          return errorResponse('INVALID_REQUEST', '이미 수령 완료된 주문은 취소할 수 없습니다.');
        }
        // paid 상태만 취소 가능
        if (order.status !== 'paid') {
          return errorResponse('INVALID_REQUEST', '취소할 수 없는 주문 상태입니다.');
        }
      }

      // 택배 수령 상품 - 구매확정(confirmed) 또는 출고(shipped) 이후 취소 불가
      if (productType === 'delivery') {
        if (order.status === 'confirmed' || order.is_confirmed) {
          return errorResponse('INVALID_REQUEST', '구매 확정된 주문은 취소할 수 없습니다.');
        }
        if (['shipped', 'delivered'].includes(order.status)) {
          return errorResponse('INVALID_REQUEST', '출고된 주문은 취소할 수 없습니다.');
        }
        // paid 상태만 취소 가능
        if (order.status !== 'paid') {
          return errorResponse('INVALID_REQUEST', '취소할 수 없는 주문 상태입니다.');
        }
      }

      // === 취소 처리 ===
      const { data: cancelledOrder, error: cancelError } = await supabase
        .from('store_orders')
        .update({ status: 'cancelled' })
        .eq('order_id', orderId)
        .select()
        .single();

      if (cancelError) throw cancelError;

      // === 포인트 환불 처리 ===
      // 택배수령 상품: 상품 금액 + 배송비 전액 환불
      const shippingFee = order.total_shipping_fee || 0;
      const refundAmount = order.total_amount; // total_amount에는 배송비가 이미 포함되어 있음

      // 유저 현재 포인트 조회
      const { data: member, error: memberError } = await supabase
        .from('members')
        .select('id, total_points')
        .eq('id', user.id)
        .single();

      if (!memberError && member) {
        const newTotalPoints = (member.total_points || 0) + refundAmount;

        // 포인트 복구
        await supabase
          .from('members')
          .update({ total_points: newTotalPoints })
          .eq('id', user.id);

        // member_points_logs 기록 (배송비 포함 여부 명시)
        const refundLogId = `store_cancel_${orderId}_${user.id}`;
        // deno-lint-ignore no-explicit-any
        const productNames = order.order_items?.map((item: any) => item.product_name).join(', ') || '상품';
        const refundDescription = shippingFee > 0
          ? `주문 취소 환불: ${productNames} (상품 ${(refundAmount - shippingFee).toLocaleString()}P + 배송비 ${shippingFee.toLocaleString()}P)`
          : `주문 취소 환불: ${productNames}`;

        await supabase.from('member_points_logs').insert({
          member_id: user.id,
          type: 'earn',
          amount: refundAmount,
          description: refundDescription,
          log_id: refundLogId
        });

        // store_refunds 테이블에 환불 기록 추가
        const { error: refundInsertError } = await supabase
          .from('store_refunds')
          .insert({
            order_id: orderId,
            reason: '주문 취소 - 고객 요청',
            status: 'completed',
            refund_amount: refundAmount,
            return_shipping_fee: shippingFee,
            processed_at: new Date().toISOString()
          });

        if (refundInsertError) {
          console.error('환불 기록 생성 실패:', refundInsertError);
        }
      }

      // 재고 복구 (delivery, on_site 상품) - 원본/복제 상품 동기화
      for (const item of order.order_items || []) {
        if (['delivery', 'on_site'].includes(item.product_type) && item.product?.stock !== null) {
        // 현재 재고 조회 후 복구
        const { data: currentProduct } = await supabase
          .from('store_products')
          .select('stock')
            .eq('product_id', item.product_id)
          .single();

        if (currentProduct) {
            const newStock = (currentProduct.stock || 0) + item.quantity;
          
          // 현재 상품 재고 복구
          await supabase
            .from('store_products')
            .update({ stock: newStock })
              .eq('product_id', item.product_id);

          // 협업 상품인 경우 원본/복제 상품 재고 동기화
            if (item.product?.source === 'collaboration') {
              const parentProductId = item.product?.parent_product_id;
            
            if (parentProductId) {
              // 복제된 상품인 경우: 원본 상품과 다른 복제 상품 동기화
              await supabase
                .from('store_products')
                .update({ stock: newStock })
                .eq('product_id', parentProductId);

              await supabase
                .from('store_products')
                .update({ stock: newStock })
                .eq('parent_product_id', parentProductId)
                  .neq('product_id', item.product_id);
            } else {
              // 원본 상품인 경우: 모든 복제 상품 동기화
              await supabase
                .from('store_products')
                .update({ stock: newStock })
                  .eq('parent_product_id', item.product_id);
              }
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
              const newOptionStock = optValue.stock + item.quantity;
              await supabase
                .from('store_product_option_values')
                .update({ stock: newOptionStock })
                .eq('value_id', opt.value_id);
              
              console.log(`[주문 취소] 옵션 재고 복구: ${opt.value_id}, ${newOptionStock}`);
            }
          }
        }
      }

      // 현장수령 상품 픽업 기록 삭제 및 스케줄 복구
      if (productType === 'on_site') {
        await supabase
          .from('store_on_site_pickups')
          .delete()
          .eq('order_id', orderId);

        // 스케줄 예약 복구 (current_bookings 감소)
        // deno-lint-ignore no-explicit-any
        const scheduleData = (order as any).schedule;
        if (scheduleData && scheduleData.length > 0) {
          const schedule = scheduleData[0];
          const newBookings = Math.max(0, (schedule.current_bookings || 0) - 1);
          await supabase
            .from('store_partner_schedules')
            .update({ 
              current_bookings: newBookings,
              is_available: true // 예약 감소 시 다시 예약 가능하도록
            })
            .eq('schedule_id', schedule.schedule_id);
          
          console.log(`[주문 취소] 스케줄 current_bookings 감소: ${schedule.schedule_id}, ${newBookings}`);
        }
      }

      // order_items 상태도 업데이트
      await supabase
        .from('store_order_items')
        .update({ status: 'cancelled' })
        .eq('order_id', orderId);

      // === 주문 취소 푸시 알림 발송 ===
      // deno-lint-ignore no-explicit-any
      const cancelledProductNames = order.order_items?.map((item: any) => item.product_name).join(', ') || '상품';
      
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
      const authHeader = req.headers.get('Authorization') || `Bearer ${anonKey}`;

      if (isPartner) {
        // 파트너가 취소한 경우 → 구매자에게 알림
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
              user_id: order.user_id,
              target_member_id: order.user_id,
              title: '❌ 주문 취소',
              body: `${cancelledProductNames} 주문이 판매자에 의해 취소되었습니다. (환불: ${refundAmount.toLocaleString()}P)`,
              icon: null,
              url: `/store/orders/${orderId}`,
              notification_type: 'store_order_cancelled_by_partner',
              tag: `order_cancelled_${orderId}`,
              data: { order_id: orderId, refund_amount: refundAmount, cancelled_by: 'partner' },
              process_immediately: true,
            }),
          });
        } catch (e) {
          console.error('주문 취소 푸시 알림 발송 실패 (구매자):', e);
        }
      } else if (isBuyer && order.partner_id) {
        // 구매자가 취소한 경우 → 파트너에게 알림
        const { data: partnerData } = await supabase
          .from('partners')
          .select('member_id')
          .eq('id', order.partner_id)
          .single();

        if (partnerData?.member_id) {
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
                user_id: partnerData.member_id,
                target_member_id: partnerData.member_id,
                title: '❌ 주문 취소',
                body: `${cancelledProductNames} 주문이 취소되었습니다. (환불: ${refundAmount.toLocaleString()}P)`,
                icon: null,
                url: '/partner/store/orders',
                notification_type: 'store_order_cancelled',
                tag: `order_cancelled_${orderId}`,
                data: { order_id: orderId, refund_amount: refundAmount, cancelled_by: 'buyer' },
                process_immediately: true,
              }),
            });
          } catch (e) {
            console.error('주문 취소 푸시 알림 발송 실패 (파트너):', e);
          }
        }
      }

      return successResponse({
        ...cancelledOrder,
        message: '주문이 취소되었습니다.',
        product_refund: refundAmount - shippingFee,
        shipping_fee_refund: shippingFee,
        refunded_points: refundAmount,
        cancelled_by: isPartner ? 'partner' : 'buyer'
      });
    }

    // ===== PUT /api-store-orders/:id/cancel-item - 개별 아이템 취소 =====
    const orderCancelItemMatch = pathname.match(/^\/api-store-orders\/([a-f0-9-]+)\/cancel-item$/);
    if (orderCancelItemMatch && req.method === 'PUT') {
      const user = await getAuthUser(req);
      const orderId = orderCancelItemMatch[1];
      const body = await parseRequestBody(req);

      if (!body || !body.order_item_id) {
        return errorResponse('INVALID_REQUEST', 'order_item_id는 필수입니다.');
      }

      const { order_item_id } = body;

      // 주문 확인 (스케줄 정보, selected_options 포함)
      const { data: order, error: orderError } = await supabase
        .from('store_orders')
        .select(`
          *,
          order_items:store_order_items(
            order_item_id, product_id, product_name, product_type, product_source, quantity, subtotal, status, selected_options,
            product:store_products(product_id, stock, source, parent_product_id)
          ),
          schedule:store_partner_schedules(schedule_id, current_bookings)
        `)
        .eq('order_id', orderId)
        .eq('user_id', user.id)
        .single();

      if (orderError || !order) {
        return errorResponse('NOT_FOUND', '주문을 찾을 수 없습니다.', null, 404);
      }

      // 해당 아이템 찾기
      // deno-lint-ignore no-explicit-any
      const targetItem = order.order_items?.find((item: any) => item.order_item_id === order_item_id);

      if (!targetItem) {
        return errorResponse('NOT_FOUND', '해당 주문 아이템을 찾을 수 없습니다.', null, 404);
      }

      // === 취소 불가 조건 확인 ===

      // 1. 디지털 상품은 취소 불가
      if (targetItem.product_type === 'digital') {
        return errorResponse('INVALID_REQUEST', '디지털 상품은 취소할 수 없습니다.');
      }

      // 2. 이미 취소된 아이템
      if (targetItem.status === 'cancelled') {
        return errorResponse('INVALID_REQUEST', '이미 취소된 상품입니다.');
      }

      // 3. 구매 확정된 아이템
      if (targetItem.status === 'confirmed') {
        return errorResponse('INVALID_REQUEST', '구매 확정된 상품은 취소할 수 없습니다.');
      }

      // 4. 출고된 아이템 (택배)
      if (targetItem.product_type === 'delivery' && ['shipped', 'delivered'].includes(targetItem.status)) {
        return errorResponse('INVALID_REQUEST', '출고된 상품은 취소할 수 없습니다.');
      }

      // === 아이템 취소 처리 ===
      const { error: itemCancelError } = await supabase
        .from('store_order_items')
        .update({ status: 'cancelled' })
        .eq('order_item_id', order_item_id);

      if (itemCancelError) throw itemCancelError;

      // === 포인트 환불 처리 (해당 아이템 금액만) ===
      const itemRefundAmount = targetItem.subtotal;

      const { data: member, error: memberError } = await supabase
        .from('members')
        .select('id, total_points')
        .eq('id', user.id)
        .single();

      if (!memberError && member) {
        const newTotalPoints = (member.total_points || 0) + itemRefundAmount;

        // 포인트 복구
        await supabase
          .from('members')
          .update({ total_points: newTotalPoints })
          .eq('id', user.id);

        // member_points_logs 기록
        const refundLogId = `store_cancel_item_${order_item_id}_${user.id}`;
        const refundDescription = `주문 상품 취소 환불: ${targetItem.product_name}`;

        await supabase.from('member_points_logs').insert({
          member_id: user.id,
          type: 'earn',
          amount: itemRefundAmount,
          description: refundDescription,
          log_id: refundLogId
        });

        // store_refunds 테이블에 환불 기록 추가
        const { error: refundInsertError } = await supabase
          .from('store_refunds')
          .insert({
            order_id: orderId,
            reason: `개별 상품 취소 - ${targetItem.product_name}`,
            status: 'completed',
            refund_amount: itemRefundAmount,
            return_shipping_fee: 0, // 개별 취소는 배송비 환불 없음
            processed_at: new Date().toISOString()
          });

        if (refundInsertError) {
          console.error('환불 기록 생성 실패:', refundInsertError);
        }
      }

      // === 재고 복구 ===
      if (['delivery', 'on_site'].includes(targetItem.product_type) && targetItem.product?.stock !== null) {
        const { data: currentProduct } = await supabase
          .from('store_products')
          .select('stock')
          .eq('product_id', targetItem.product_id)
          .single();

        if (currentProduct) {
          const newStock = (currentProduct.stock || 0) + targetItem.quantity;
          
          // 현재 상품 재고 복구
          await supabase
            .from('store_products')
            .update({ stock: newStock })
            .eq('product_id', targetItem.product_id);

          // 협업 상품인 경우 원본/복제 상품 재고 동기화
          if (targetItem.product?.source === 'collaboration') {
            const parentProductId = targetItem.product?.parent_product_id;
            
            if (parentProductId) {
              await supabase
                .from('store_products')
                .update({ stock: newStock })
                .eq('product_id', parentProductId);

              await supabase
                .from('store_products')
                .update({ stock: newStock })
                .eq('parent_product_id', parentProductId)
                .neq('product_id', targetItem.product_id);
            } else {
              await supabase
                .from('store_products')
                .update({ stock: newStock })
                .eq('parent_product_id', targetItem.product_id);
            }
          }
        }

        // 옵션 재고 복구 (selected_options가 있는 경우)
        const selectedOptions = targetItem.selected_options || [];
        for (const opt of selectedOptions as Array<{ option_type: string; value_id?: string }>) {
          if (opt.option_type === 'select' && opt.value_id) {
            const { data: optValue } = await supabase
              .from('store_product_option_values')
              .select('stock')
              .eq('value_id', opt.value_id)
              .single();

            if (optValue && optValue.stock !== null) {
              const newOptionStock = optValue.stock + targetItem.quantity;
              await supabase
                .from('store_product_option_values')
                .update({ stock: newOptionStock })
                .eq('value_id', opt.value_id);
              
              console.log(`[개별 아이템 취소] 옵션 재고 복구: ${opt.value_id}, ${newOptionStock}`);
            }
          }
        }
      }

      // === 현장수령 상품 스케줄 복구 ===
      if (targetItem.product_type === 'on_site') {
        // deno-lint-ignore no-explicit-any
        const scheduleData = (order as any).schedule;
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
          
          console.log(`[개별 아이템 취소] 스케줄 current_bookings 감소: ${schedule.schedule_id}, ${newBookings}`);
        }
      }

      // === 주문 전체 상태 업데이트 확인 ===
      // 취소되지 않은 아이템 확인
      // deno-lint-ignore no-explicit-any
      const remainingActiveItems = order.order_items?.filter((item: any) => 
        item.order_item_id !== order_item_id && 
        item.status !== 'cancelled'
      ) || [];

      // 모든 아이템이 취소되었거나 디지털(확정)인 경우 주문 상태 업데이트
      if (remainingActiveItems.length === 0) {
        // 디지털 상품만 남은 경우 확인
        // deno-lint-ignore no-explicit-any
        const digitalItems = order.order_items?.filter((item: any) => 
          item.product_type === 'digital' && item.status === 'confirmed'
        ) || [];

        if (digitalItems.length > 0) {
          // 디지털 상품만 남은 경우 - 주문 상태를 confirmed로
          await supabase
            .from('store_orders')
            .update({ 
              status: 'confirmed',
              is_confirmed: true,
              confirmed_at: new Date().toISOString()
            })
            .eq('order_id', orderId);
        } else {
          // 모든 아이템이 취소된 경우 - 주문 상태를 cancelled로
          await supabase
            .from('store_orders')
            .update({ status: 'cancelled' })
            .eq('order_id', orderId);
        }
      } else {
        // 주문 금액 재계산 (취소되지 않은 아이템들만)
        // deno-lint-ignore no-explicit-any
        const newSubtotal = remainingActiveItems.reduce((sum: number, item: any) => sum + item.subtotal, 0);
        
        await supabase
          .from('store_orders')
          .update({ 
            subtotal_amount: newSubtotal,
            total_amount: newSubtotal + (order.total_shipping_fee || 0)
          })
          .eq('order_id', orderId);
      }

      // 최종 주문 정보 조회
      const { data: updatedOrder } = await supabase
        .from('store_orders')
        .select(`
          *,
          order_items:store_order_items(*)
        `)
        .eq('order_id', orderId)
        .single();

      // === 파트너에게 개별 상품 취소 푸시 알림 발송 ===
      if (order.partner_id) {
        const { data: partnerData } = await supabase
          .from('partners')
          .select('member_id')
          .eq('id', order.partner_id)
          .single();

        if (partnerData?.member_id) {
          const supabaseUrl = Deno.env.get('SUPABASE_URL');
          const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
          const authHeader = req.headers.get('Authorization') || `Bearer ${anonKey}`;

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
                user_id: partnerData.member_id,
                target_member_id: partnerData.member_id,
                title: '❌ 상품 취소',
                body: `${targetItem.product_name} (${targetItem.quantity}개) 상품이 취소되었습니다. (환불: ${itemRefundAmount.toLocaleString()}P)`,
                icon: null,
                url: '/partner/store/orders',
                notification_type: 'store_order_item_cancelled',
                tag: `order_item_cancelled_${order_item_id}`,
                data: { order_id: orderId, order_item_id, refund_amount: itemRefundAmount },
                process_immediately: true,
              }),
            });
          } catch (e) {
            console.error('상품 취소 푸시 알림 발송 실패:', e);
          }
        }
      }

      return successResponse({
        order: updatedOrder,
        cancelled_item: {
          order_item_id: order_item_id,
          product_name: targetItem.product_name,
          refunded_amount: itemRefundAmount
        },
        message: `${targetItem.product_name} 상품이 취소되었습니다.`
      });
    }

    // ===== GET /api-store-orders/partner/orders - 파트너 주문 관리 =====
    // 날짜 필터: created_from, created_to (주문생성시간), completed_from, completed_to (주문완료시간)
    if (pathname === '/api-store-orders/partner/orders' && req.method === 'GET') {
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

      const status = params.status;
      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '20');
      const offset = (page - 1) * limit;
      
      // 날짜 필터 파라미터
      const createdFrom = params.created_from;
      const createdTo = params.created_to;
      const completedFrom = params.completed_from;
      const completedTo = params.completed_to;

      // 파트너의 주문 목록 조회 (partner_id로 직접 조회)
      let query = supabase
        .from('store_orders')
        .select(`
          *,
          order_items:store_order_items(
            order_item_id, product_id, product_name, product_price, product_type, product_source,
            quantity, unit_price, subtotal, status, is_confirmed, confirmed_at,
            product:store_products(product_id, name, thumbnail_url, is_bundle_available)
          ),
          shipments:store_shipments(
            shipment_id, shipping_fee, status, courier, tracking_number,
            recipient_name, recipient_phone, recipient_address, recipient_postal_code,
            shipped_at, delivered_at, delivery_status, delivery_status_text,
            delivery_memo, delivery_description, delivery_updated_at, webhook_expires_at, delivery_events
          ),
          buyer:members!user_id(id, name, profile_image)
        `, { count: 'exact' })
        .eq('partner_id', partner.id);

      if (status) {
        query = query.eq('status', status);
      }

      // 주문생성시간 필터
      if (createdFrom) {
        query = query.gte('created_at', createdFrom);
      }
      if (createdTo) {
        query = query.lte('created_at', createdTo);
      }

      // 주문완료시간 필터 (confirmed_at 사용)
      if (completedFrom) {
        query = query.gte('confirmed_at', completedFrom);
      }
      if (completedTo) {
        query = query.lte('confirmed_at', completedTo);
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      // 각 shipment별로 배달 추적 정보 포함
        // deno-lint-ignore no-explicit-any
      const ordersWithShipmentTracking = (data || []).map((order: Record<string, any>) => {
        // shipments에 배달 추적 정보 추가
        const shipmentsWithTracking = (order.shipments || []).map((shipment: Record<string, unknown>) => {
          // 배송 중이거나 배송 완료된 경우에만 추적 정보 포함
          if (
            ['shipped', 'delivered'].includes(shipment.status as string) &&
            shipment.delivery_status
          ) {
            return {
              ...shipment,
              delivery_tracking: {
                status: shipment.delivery_status,
                status_text: shipment.delivery_status_text,
                description: shipment.delivery_description,
                updated_at: shipment.delivery_updated_at,
                events: shipment.delivery_events
              }
            };
          }
          return {
            ...shipment,
            delivery_tracking: null
          };
        });

          return {
            ...order,
          shipments: shipmentsWithTracking
          };
        });

      return successResponse(ordersWithShipmentTracking, {
          total: count,
          page,
          limit,
          totalPages: Math.ceil((count || 0) / limit)
        });
      }

    // ===== GET /api-store-orders/admin/stats - 관리자 판매 통계 조회 =====
    // 쿼리 파라미터: period (day/month/year), start_date, end_date, partner_id (선택), product_id (선택)
    if (pathname === '/api-store-orders/admin/stats' && req.method === 'GET') {
      const user = await getAuthUser(req);
      const params = getQueryParams(req.url);

      // 관리자 권한 확인
      const { data: member } = await supabase
        .from('members')
        .select('role')
        .eq('id', user.id)
        .single();

      if (member?.role !== 'admin') {
        return errorResponse('FORBIDDEN', '관리자만 접근할 수 있습니다.', null, 403);
      }

      const period = params.period || 'day'; // day, month, year
      const startDate = params.start_date;
      const endDate = params.end_date;
      const partnerId = params.partner_id;
      const productId = params.product_id;

      // 기간 필터 기본값 설정 (오늘부터 30일 전)
      const now = new Date();
      const defaultEndDate = now.toISOString();
      const defaultStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      
      const filterStartDate = startDate || defaultStartDate;
      const filterEndDate = endDate || defaultEndDate;

      // ===== 1. 주문 통계 (store_orders) - 전체 주문 건수 (취소 제외) =====
      let allOrdersQuery = supabase
        .from('store_orders')
        .select('order_id, total_amount, status, created_at, partner_id')
        .gte('created_at', filterStartDate)
        .lte('created_at', filterEndDate)
        .not('status', 'eq', 'cancelled');

      if (partnerId) {
        allOrdersQuery = allOrdersQuery.eq('partner_id', partnerId);
      }

      const { data: allOrders, error: allOrdersError } = await allOrdersQuery;
      if (allOrdersError) throw allOrdersError;

      // ===== 2. 매출 통계 (구매확정 주문만) =====
      let confirmedOrdersQuery = supabase
        .from('store_orders')
        .select('order_id, total_amount, status, created_at, partner_id')
        .gte('created_at', filterStartDate)
        .lte('created_at', filterEndDate)
        .eq('status', 'confirmed'); // 구매확정만

      if (partnerId) {
        confirmedOrdersQuery = confirmedOrdersQuery.eq('partner_id', partnerId);
      }

      const { data: confirmedOrders, error: confirmedOrdersError } = await confirmedOrdersQuery;
      if (confirmedOrdersError) throw confirmedOrdersError;

      // 기간별 주문 집계 (전체)
      const ordersByPeriod: Record<string, { count: number; amount: number }> = {};
      let totalOrderCount = 0;
      let totalOrderAmount = 0;

      for (const order of allOrders || []) {
        const date = new Date(order.created_at);
        let periodKey: string;

        switch (period) {
          case 'year':
            periodKey = date.getFullYear().toString();
            break;
          case 'month':
            periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            break;
          default: // day
            periodKey = date.toISOString().split('T')[0];
        }

        if (!ordersByPeriod[periodKey]) {
          ordersByPeriod[periodKey] = { count: 0, amount: 0 };
        }
        ordersByPeriod[periodKey].count++;
        ordersByPeriod[periodKey].amount += order.total_amount || 0;

        totalOrderCount++;
        totalOrderAmount += order.total_amount || 0;
      }

      // 기간별 매출 집계 (구매확정만)
      const revenueByPeriod: Record<string, { count: number; amount: number }> = {};
      const revenueByPartner: Record<string, { count: number; amount: number; partner_name?: string }> = {};
      let totalRevenueCount = 0;
      let totalRevenueAmount = 0;

      for (const order of confirmedOrders || []) {
        const date = new Date(order.created_at);
        let periodKey: string;

        switch (period) {
          case 'year':
            periodKey = date.getFullYear().toString();
            break;
          case 'month':
            periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            break;
          default: // day
            periodKey = date.toISOString().split('T')[0];
        }

        if (!revenueByPeriod[periodKey]) {
          revenueByPeriod[periodKey] = { count: 0, amount: 0 };
        }
        revenueByPeriod[periodKey].count++;
        revenueByPeriod[periodKey].amount += order.total_amount || 0;

        // 파트너별 매출 집계
        if (order.partner_id) {
          if (!revenueByPartner[order.partner_id]) {
            revenueByPartner[order.partner_id] = { count: 0, amount: 0 };
          }
          revenueByPartner[order.partner_id].count++;
          revenueByPartner[order.partner_id].amount += order.total_amount || 0;
        }

        totalRevenueCount++;
        totalRevenueAmount += order.total_amount || 0;
      }

      // 파트너 정보 조회
      const partnerIds = Object.keys(revenueByPartner);
      if (partnerIds.length > 0) {
        const { data: partners } = await supabase
          .from('partners')
          .select('id, partner_name')
          .in('id', partnerIds);

        for (const partner of partners || []) {
          if (revenueByPartner[partner.id]) {
            revenueByPartner[partner.id].partner_name = partner.partner_name;
          }
        }
      }

      // ===== 3. 상품별 매출 통계 (store_order_items) - 구매확정만 =====
      let productStatsQuery = supabase
        .from('store_order_items')
        .select(`
          product_id, product_name, quantity, subtotal, created_at,
          order:store_orders!inner(order_id, partner_id, status, created_at)
        `)
        .gte('created_at', filterStartDate)
        .lte('created_at', filterEndDate)
        .eq('order.status', 'confirmed'); // 구매확정만

      if (productId) {
        productStatsQuery = productStatsQuery.eq('product_id', productId);
      }

      const { data: orderItems, error: orderItemsError } = await productStatsQuery;
      if (orderItemsError) throw orderItemsError;

      // 상품별 매출 집계
      const productStats: Record<string, { 
        product_id: string;
        product_name: string;
        total_quantity: number; 
        total_amount: number;
        by_period: Record<string, { quantity: number; amount: number }>;
      }> = {};

      for (const item of orderItems || []) {
        // deno-lint-ignore no-explicit-any
        const orderData = item.order as Record<string, any>;
        // 구매확정 아닌 주문 제외 (이중 체크)
        if (orderData?.status !== 'confirmed') continue;

        // 파트너 필터
        if (partnerId && orderData?.partner_id !== partnerId) continue;

        const pid = item.product_id;
        if (!productStats[pid]) {
          productStats[pid] = {
            product_id: pid,
            product_name: item.product_name,
            total_quantity: 0,
            total_amount: 0,
            by_period: {}
          };
        }

        const date = new Date(item.created_at);
        let periodKey: string;

        switch (period) {
          case 'year':
            periodKey = date.getFullYear().toString();
            break;
          case 'month':
            periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            break;
          default:
            periodKey = date.toISOString().split('T')[0];
        }

        if (!productStats[pid].by_period[periodKey]) {
          productStats[pid].by_period[periodKey] = { quantity: 0, amount: 0 };
        }

        productStats[pid].total_quantity += item.quantity;
        productStats[pid].total_amount += item.subtotal || 0;
        productStats[pid].by_period[periodKey].quantity += item.quantity;
        productStats[pid].by_period[periodKey].amount += item.subtotal || 0;
      }

      // ===== 3. 배송 상태별 통계 (store_shipments) =====
      const { data: shipments, error: shipmentsError } = await supabase
        .from('store_shipments')
        .select('shipment_id, status, shipping_fee, created_at, order:store_orders!inner(partner_id)')
        .gte('created_at', filterStartDate)
        .lte('created_at', filterEndDate);

      if (shipmentsError) throw shipmentsError;

      const shipmentStats: Record<string, { 
        count: number; 
        total_shipping_fee: number;
        by_period: Record<string, { count: number; shipping_fee: number }>;
      }> = {
        pending: { count: 0, total_shipping_fee: 0, by_period: {} },
        shipped: { count: 0, total_shipping_fee: 0, by_period: {} },
        delivered: { count: 0, total_shipping_fee: 0, by_period: {} }
      };

      for (const shipment of shipments || []) {
        // deno-lint-ignore no-explicit-any
        const shipmentOrder = shipment.order as Record<string, any>;
        // 파트너 필터
        if (partnerId && shipmentOrder?.partner_id !== partnerId) continue;

        const status = shipment.status || 'pending';
        if (!shipmentStats[status]) {
          shipmentStats[status] = { count: 0, total_shipping_fee: 0, by_period: {} };
        }

        const date = new Date(shipment.created_at);
        let periodKey: string;

        switch (period) {
          case 'year':
            periodKey = date.getFullYear().toString();
            break;
          case 'month':
            periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            break;
          default:
            periodKey = date.toISOString().split('T')[0];
        }

        if (!shipmentStats[status].by_period[periodKey]) {
          shipmentStats[status].by_period[periodKey] = { count: 0, shipping_fee: 0 };
        }

        shipmentStats[status].count++;
        shipmentStats[status].total_shipping_fee += shipment.shipping_fee || 0;
        shipmentStats[status].by_period[periodKey].count++;
        shipmentStats[status].by_period[periodKey].shipping_fee += shipment.shipping_fee || 0;
      }

      // ===== 4. 환불 통계 (store_refunds) =====
      const { data: refunds, error: refundsError } = await supabase
        .from('store_refunds')
        .select('refund_id, status, refund_amount, created_at, order:store_orders!inner(partner_id)')
        .gte('created_at', filterStartDate)
        .lte('created_at', filterEndDate);

      if (refundsError) throw refundsError;

      const refundStats: Record<string, { 
        count: number; 
        total_amount: number;
        by_period: Record<string, { count: number; amount: number }>;
      }> = {
        pending: { count: 0, total_amount: 0, by_period: {} },
        approved: { count: 0, total_amount: 0, by_period: {} },
        rejected: { count: 0, total_amount: 0, by_period: {} },
        completed: { count: 0, total_amount: 0, by_period: {} }
      };

      let totalRefundAmount = 0;

      for (const refund of refunds || []) {
        // deno-lint-ignore no-explicit-any
        const refundOrder = refund.order as Record<string, any>;
        // 파트너 필터
        if (partnerId && refundOrder?.partner_id !== partnerId) continue;

        const status = refund.status || 'pending';
        if (!refundStats[status]) {
          refundStats[status] = { count: 0, total_amount: 0, by_period: {} };
        }

        const date = new Date(refund.created_at);
        let periodKey: string;

        switch (period) {
          case 'year':
            periodKey = date.getFullYear().toString();
            break;
          case 'month':
            periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            break;
          default:
            periodKey = date.toISOString().split('T')[0];
        }

        if (!refundStats[status].by_period[periodKey]) {
          refundStats[status].by_period[periodKey] = { count: 0, amount: 0 };
        }

        refundStats[status].count++;
        refundStats[status].total_amount += refund.refund_amount || 0;
        refundStats[status].by_period[periodKey].count++;
        refundStats[status].by_period[periodKey].amount += refund.refund_amount || 0;

        if (['approved', 'completed'].includes(status)) {
          totalRefundAmount += refund.refund_amount || 0;
        }
      }

      return successResponse({
        period,
        filter: {
          start_date: filterStartDate,
          end_date: filterEndDate,
          partner_id: partnerId || null,
          product_id: productId || null
        },
        summary: {
          total_orders: totalOrderCount,           // 전체 주문 건수 (취소 제외)
          total_order_amount: totalOrderAmount,    // 전체 주문 금액 (취소 제외)
          total_revenue: totalRevenueAmount,       // 매출 (구매확정만)
          total_revenue_count: totalRevenueCount,  // 구매확정 건수
          total_refund_amount: totalRefundAmount,
          net_revenue: totalRevenueAmount - totalRefundAmount  // 순매출 (구매확정 - 환불)
        },
        orders: {
          total: { count: totalOrderCount, amount: totalOrderAmount },
          by_period: ordersByPeriod
        },
        revenue: {
          total: { count: totalRevenueCount, amount: totalRevenueAmount },
          by_period: revenueByPeriod,
          by_partner: Object.entries(revenueByPartner).map(([id, data]) => ({
            partner_id: id,
            ...data
          }))
        },
        products: Object.values(productStats).sort((a, b) => b.total_amount - a.total_amount), // 매출 금액순 정렬
        shipments: shipmentStats,
        refunds: refundStats
      });
    }

    // ===== GET /api-store-orders/partner/stats - 파트너 판매 통계 조회 =====
    // 쿼리 파라미터: period (day/month/year), start_date, end_date, product_id (선택)
    if (pathname === '/api-store-orders/partner/stats' && req.method === 'GET') {
      const user = await getAuthUser(req);
      const params = getQueryParams(req.url);

      // 파트너 확인
      const { data: partner } = await supabase
        .from('partners')
        .select('id, partner_name')
        .eq('member_id', user.id)
        .single();

      if (!partner) {
        return errorResponse('FORBIDDEN', '파트너만 접근할 수 있습니다.', null, 403);
      }

      const period = params.period || 'day'; // day, month, year
      const startDate = params.start_date;
      const endDate = params.end_date;
      const productId = params.product_id;

      // 기간 필터 기본값 설정 (오늘부터 30일 전)
      const now = new Date();
      const defaultEndDate = now.toISOString();
      const defaultStartDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      
      const filterStartDate = startDate || defaultStartDate;
      const filterEndDate = endDate || defaultEndDate;

      // ===== 1. 주문 통계 (store_orders) - 전체 주문 건수 (취소 제외) =====
      const { data: allOrders, error: allOrdersError } = await supabase
        .from('store_orders')
        .select('order_id, total_amount, status, created_at')
        .eq('partner_id', partner.id)
        .gte('created_at', filterStartDate)
        .lte('created_at', filterEndDate)
        .not('status', 'eq', 'cancelled');

      if (allOrdersError) throw allOrdersError;

      // ===== 2. 매출 통계 (구매확정 주문만) =====
      const { data: confirmedOrders, error: confirmedOrdersError } = await supabase
        .from('store_orders')
        .select('order_id, total_amount, status, created_at')
        .eq('partner_id', partner.id)
        .gte('created_at', filterStartDate)
        .lte('created_at', filterEndDate)
        .eq('status', 'confirmed'); // 구매확정만

      if (confirmedOrdersError) throw confirmedOrdersError;

      // 기간별 주문 집계 (전체)
      const ordersByPeriod: Record<string, { count: number; amount: number }> = {};
      let totalOrderCount = 0;
      let totalOrderAmount = 0;

      for (const order of allOrders || []) {
        const date = new Date(order.created_at);
        let periodKey: string;

        switch (period) {
          case 'year':
            periodKey = date.getFullYear().toString();
            break;
          case 'month':
            periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            break;
          default:
            periodKey = date.toISOString().split('T')[0];
        }

        if (!ordersByPeriod[periodKey]) {
          ordersByPeriod[periodKey] = { count: 0, amount: 0 };
        }
        ordersByPeriod[periodKey].count++;
        ordersByPeriod[periodKey].amount += order.total_amount || 0;

        totalOrderCount++;
        totalOrderAmount += order.total_amount || 0;
      }

      // 기간별 매출 집계 (구매확정만)
      const revenueByPeriod: Record<string, { count: number; amount: number }> = {};
      let totalRevenueCount = 0;
      let totalRevenueAmount = 0;

      for (const order of confirmedOrders || []) {
        const date = new Date(order.created_at);
        let periodKey: string;

        switch (period) {
          case 'year':
            periodKey = date.getFullYear().toString();
            break;
          case 'month':
            periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            break;
          default:
            periodKey = date.toISOString().split('T')[0];
        }

        if (!revenueByPeriod[periodKey]) {
          revenueByPeriod[periodKey] = { count: 0, amount: 0 };
        }
        revenueByPeriod[periodKey].count++;
        revenueByPeriod[periodKey].amount += order.total_amount || 0;

        totalRevenueCount++;
        totalRevenueAmount += order.total_amount || 0;
      }

      // ===== 3. 상품별 매출 통계 (store_order_items) - 구매확정만 =====
      let productStatsQuery = supabase
        .from('store_order_items')
        .select(`
          product_id, product_name, quantity, subtotal, created_at,
          order:store_orders!inner(order_id, partner_id, status)
        `)
        .eq('order.partner_id', partner.id)
        .gte('created_at', filterStartDate)
        .lte('created_at', filterEndDate)
        .eq('order.status', 'confirmed'); // 구매확정만

      if (productId) {
        productStatsQuery = productStatsQuery.eq('product_id', productId);
      }

      const { data: orderItems, error: orderItemsError } = await productStatsQuery;
      if (orderItemsError) throw orderItemsError;

      // 상품별 매출 집계
      const productStats: Record<string, { 
        product_id: string;
        product_name: string;
        total_quantity: number; 
        total_amount: number;
        by_period: Record<string, { quantity: number; amount: number }>;
      }> = {};

      for (const item of orderItems || []) {
        // deno-lint-ignore no-explicit-any
        const itemOrder = item.order as Record<string, any>;
        // 구매확정 아닌 주문 제외 (이중 체크)
        if (itemOrder?.status !== 'confirmed') continue;

        const pid = item.product_id;
        if (!productStats[pid]) {
          productStats[pid] = {
            product_id: pid,
            product_name: item.product_name,
            total_quantity: 0,
            total_amount: 0,
            by_period: {}
          };
        }

        const date = new Date(item.created_at);
        let periodKey: string;

        switch (period) {
          case 'year':
            periodKey = date.getFullYear().toString();
            break;
          case 'month':
            periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            break;
          default:
            periodKey = date.toISOString().split('T')[0];
        }

        if (!productStats[pid].by_period[periodKey]) {
          productStats[pid].by_period[periodKey] = { quantity: 0, amount: 0 };
        }

        productStats[pid].total_quantity += item.quantity;
        productStats[pid].total_amount += item.subtotal || 0;
        productStats[pid].by_period[periodKey].quantity += item.quantity;
        productStats[pid].by_period[periodKey].amount += item.subtotal || 0;
      }

      // ===== 3. 배송 상태별 통계 (store_shipments) =====
      const { data: shipments, error: shipmentsError } = await supabase
        .from('store_shipments')
        .select('shipment_id, status, shipping_fee, created_at, order:store_orders!inner(partner_id)')
        .eq('order.partner_id', partner.id)
        .gte('created_at', filterStartDate)
        .lte('created_at', filterEndDate);

      if (shipmentsError) throw shipmentsError;

      const shipmentStats: Record<string, { 
        count: number; 
        total_shipping_fee: number;
        by_period: Record<string, { count: number; shipping_fee: number }>;
      }> = {
        pending: { count: 0, total_shipping_fee: 0, by_period: {} },
        shipped: { count: 0, total_shipping_fee: 0, by_period: {} },
        delivered: { count: 0, total_shipping_fee: 0, by_period: {} }
      };

      for (const shipment of shipments || []) {
        const status = shipment.status || 'pending';
        if (!shipmentStats[status]) {
          shipmentStats[status] = { count: 0, total_shipping_fee: 0, by_period: {} };
        }

        const date = new Date(shipment.created_at);
        let periodKey: string;

        switch (period) {
          case 'year':
            periodKey = date.getFullYear().toString();
            break;
          case 'month':
            periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            break;
          default:
            periodKey = date.toISOString().split('T')[0];
        }

        if (!shipmentStats[status].by_period[periodKey]) {
          shipmentStats[status].by_period[periodKey] = { count: 0, shipping_fee: 0 };
        }

        shipmentStats[status].count++;
        shipmentStats[status].total_shipping_fee += shipment.shipping_fee || 0;
        shipmentStats[status].by_period[periodKey].count++;
        shipmentStats[status].by_period[periodKey].shipping_fee += shipment.shipping_fee || 0;
      }

      // ===== 4. 환불 통계 (store_refunds) =====
      const { data: refunds, error: refundsError } = await supabase
        .from('store_refunds')
        .select('refund_id, status, refund_amount, created_at, order:store_orders!inner(partner_id)')
        .eq('order.partner_id', partner.id)
        .gte('created_at', filterStartDate)
        .lte('created_at', filterEndDate);

      if (refundsError) throw refundsError;

      const refundStats: Record<string, { 
        count: number; 
        total_amount: number;
        by_period: Record<string, { count: number; amount: number }>;
      }> = {
        pending: { count: 0, total_amount: 0, by_period: {} },
        approved: { count: 0, total_amount: 0, by_period: {} },
        rejected: { count: 0, total_amount: 0, by_period: {} },
        completed: { count: 0, total_amount: 0, by_period: {} }
      };

      let totalRefundAmount = 0;

      for (const refund of refunds || []) {
        const status = refund.status || 'pending';
        if (!refundStats[status]) {
          refundStats[status] = { count: 0, total_amount: 0, by_period: {} };
        }

        const date = new Date(refund.created_at);
        let periodKey: string;

        switch (period) {
          case 'year':
            periodKey = date.getFullYear().toString();
            break;
          case 'month':
            periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            break;
          default:
            periodKey = date.toISOString().split('T')[0];
        }

        if (!refundStats[status].by_period[periodKey]) {
          refundStats[status].by_period[periodKey] = { count: 0, amount: 0 };
        }

        refundStats[status].count++;
        refundStats[status].total_amount += refund.refund_amount || 0;
        refundStats[status].by_period[periodKey].count++;
        refundStats[status].by_period[periodKey].amount += refund.refund_amount || 0;

        if (['approved', 'completed'].includes(status)) {
          totalRefundAmount += refund.refund_amount || 0;
        }
      }

      return successResponse({
        partner: {
          id: partner.id,
          name: partner.partner_name
        },
        period,
        filter: {
          start_date: filterStartDate,
          end_date: filterEndDate,
          product_id: productId || null
        },
        summary: {
          total_orders: totalOrderCount,           // 전체 주문 건수 (취소 제외)
          total_order_amount: totalOrderAmount,    // 전체 주문 금액 (취소 제외)
          total_revenue: totalRevenueAmount,       // 매출 (구매확정만)
          total_revenue_count: totalRevenueCount,  // 구매확정 건수
          total_refund_amount: totalRefundAmount,
          net_revenue: totalRevenueAmount - totalRefundAmount  // 순매출 (구매확정 - 환불)
        },
        orders: {
          total: { count: totalOrderCount, amount: totalOrderAmount },
          by_period: ordersByPeriod
        },
        revenue: {
          total: { count: totalRevenueCount, amount: totalRevenueAmount },
          by_period: revenueByPeriod
        },
        products: Object.values(productStats).sort((a, b) => b.total_amount - a.total_amount), // 매출 금액순 정렬
        shipments: shipmentStats,
        refunds: refundStats
      });
    }

    return errorResponse('NOT_FOUND', '요청한 엔드포인트를 찾을 수 없습니다.', null, 404);

  } catch (error) {
    console.error('Store Orders API Error:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : '서버 오류가 발생했습니다.',
      null,
      500
    );
  }
});

// 파트너 티어 기반 수수료 차감 후 정산 금액 계산
async function getSettlementAmount(
  supabase: ReturnType<typeof createSupabaseClient>,
  partnerId: string,
  grossAmount: number,
  orderId?: string,
): Promise<{ netAmount: number; takeRate: number; tierCode: string }> {
  try {
    const { data: tierData } = await supabase
      .from('partner_tier_current')
      .select('tier_code, tier_frozen')
      .eq('partner_id', partnerId)
      .single();

    const tierCode = (tierData?.tier_frozen ? 'bronze' : tierData?.tier_code) || 'bronze';

    const { data: feeData } = await supabase
      .from('fee_policy')
      .select('take_rate_pct')
      .eq('tier_code', tierCode)
      .single();

    const takeRate = feeData?.take_rate_pct ?? 25.0;
    const netAmount = Math.floor(grossAmount * (100 - takeRate) / 100);

    if (orderId) {
      await supabase.from('store_orders').update({
        applied_take_rate: takeRate,
        applied_tier_code: tierCode,
      }).eq('order_id', orderId);
    }

    return { netAmount, takeRate, tierCode };
  } catch (err) {
    console.error('티어 수수료 조회 실패, 기본 25% 적용:', err);
    return { netAmount: Math.floor(grossAmount * 0.75), takeRate: 25.0, tierCode: 'bronze' };
  }
}

// 파트너 포인트 정산 처리 함수 (티어 수수료 차감 적용)
// 협업상품: 같은 원본 상품의 모든 협업 파트너에게 share_rate만큼 배분
// 파트너 개인상품: store_points에 수수료 차감 후 적립
async function processPartnerPointSettlement(
  supabase: ReturnType<typeof createSupabaseClient>, 
  orderId: string,
  product: Record<string, any>,
  totalAmount: number
) {
  const partnerId = product.partner_id;
  const productSource = product.source;

  if (!partnerId) {
    console.error('파트너 ID가 없습니다:', product);
    return;
  }

  // 협업 상품인 경우: 같은 원본 상품의 모든 협업 파트너에게 배분
  if (productSource === 'collaboration') {
    // 원본 상품 ID 찾기 (parent_product_id가 있으면 그것, 없으면 현재 product_id)
    const originalProductId = product.parent_product_id || product.product_id;
    
    // 해당 원본 상품의 모든 협업 요청 조회
    const { data: allCollaborationRequests } = await supabase
      .from('store_collaboration_requests')
      .select('request_id, partner_id, share_rate, distribution_rate, status')
      .eq('product_id', originalProductId)
      .eq('status', 'accepted');
    
    if (allCollaborationRequests && allCollaborationRequests.length > 0) {
      const allShareRateNull = allCollaborationRequests.every((r: any) => r.share_rate == null);

      if (allShareRateNull) {
        // 개별 정산 모드: 주문 파트너에게만, distribution_rate 적용
        const orderPartnerReq = allCollaborationRequests.find((r: any) => r.partner_id === partnerId);
        const distRate = Number(orderPartnerReq?.distribution_rate ?? 100);
        const settledAmount = Math.floor(totalAmount * (distRate / 100));
        if (settledAmount > 0) {
          const { data: partner } = await supabase
            .from('partners')
            .select('id, collaboration_store_points')
            .eq('id', partnerId)
            .single();
          if (partner) {
            const logId = `store_sale_${orderId}_${partnerId}_${product.product_id}`;
            const { data: existingLog } = await supabase.from('partner_points_logs').select('id').eq('log_id', logId).maybeSingle();
            if (!existingLog) {
              const newCollabPoints = (partner.collaboration_store_points || 0) + settledAmount;
              await supabase.from('partners').update({ collaboration_store_points: newCollabPoints }).eq('id', partnerId);
              await supabase.from('partner_points_logs').insert({
                partner_id: partnerId, type: 'earn', amount: settledAmount,
                description: `협업 상품 판매 (개별 정산, 정산율 ${distRate}%): ${product.name}`,
                log_id: logId, point_type: 'collaboration_store_points'
              });
              console.log(`협업 개별 정산: 파트너=${partnerId}, 정산율=${distRate}%, 적립금=${settledAmount}`);
            }
          }
        }
      } else {
        // 배분율 모드: share_rate로 분배 후 distribution_rate 적용
        console.log(`협업상품 포인트 배분: 원본상품=${originalProductId}, 파트너수=${allCollaborationRequests.length}, 총금액=${totalAmount}`);
        for (const collabRequest of allCollaborationRequests) {
          const targetPartnerId = collabRequest.partner_id;
          const shareRate = collabRequest.share_rate ?? 100;
          const distRate = Number(collabRequest.distribution_rate ?? 100);
          const partnerAmount = Math.floor(totalAmount * (shareRate / 100) * (distRate / 100));
          if (partnerAmount <= 0) continue;
          const { data: partner } = await supabase
            .from('partners')
            .select('id, collaboration_store_points')
            .eq('id', targetPartnerId)
            .single();
          if (partner) {
            const logId = `store_sale_${orderId}_${targetPartnerId}_${product.product_id}`;
            const { data: existingLog } = await supabase.from('partner_points_logs').select('id').eq('log_id', logId).maybeSingle();
            if (existingLog) { console.log(`이미 적립됨: ${logId}`); continue; }
            const newCollabPoints = (partner.collaboration_store_points || 0) + partnerAmount;
            await supabase.from('partners').update({ collaboration_store_points: newCollabPoints }).eq('id', targetPartnerId);
            await supabase.from('partner_points_logs').insert({
              partner_id: targetPartnerId, type: 'earn', amount: partnerAmount,
              description: `협업 상품 판매 (배분 ${shareRate}%, 정산율 ${distRate}%): ${product.name}`,
              log_id: logId, point_type: 'collaboration_store_points'
            });
            console.log(`협업 포인트 적립: 파트너=${targetPartnerId}, share_rate=${shareRate}%, dist_rate=${distRate}%, 적립금=${partnerAmount}`);
          }
        }
      }
    } else {
      // 협업 요청이 없는 경우 주문의 파트너에게만 적립 (fallback)
      const { data: partner } = await supabase
        .from('partners')
        .select('id, collaboration_store_points')
        .eq('id', partnerId)
        .single();
      
      if (partner) {
        const logId = `store_sale_${orderId}_${partnerId}_${product.product_id}`;
        const newCollabPoints = (partner.collaboration_store_points || 0) + totalAmount;
        await supabase
          .from('partners')
          .update({ collaboration_store_points: newCollabPoints })
          .eq('id', partnerId);
        
        await supabase.from('partner_points_logs').insert({
          partner_id: partnerId,
          type: 'earn',
          amount: totalAmount,
          description: `협업 상품 판매: ${product.name}`,
          log_id: logId,
          point_type: 'collaboration_store_points'
        });
      }
    }
    return;
  }

  // 개인 상품: 티어 수수료 차감 후 적립
  const { netAmount, takeRate, tierCode } = await getSettlementAmount(supabase, partnerId, totalAmount, orderId);

  const { data: partner, error: partnerError } = await supabase
    .from('partners')
    .select('id, store_points')
    .eq('id', partnerId)
    .single();

  if (partnerError || !partner) {
    console.error('파트너 정보 조회 실패:', partnerError);
    return;
  }

  const logId = `store_sale_${orderId}_${partnerId}_${product.product_id}`;
  const newStorePoints = (partner.store_points || 0) + netAmount;

  const { error: updateError } = await supabase
    .from('partners')
    .update({ store_points: newStorePoints })
    .eq('id', partnerId);

  if (updateError) {
    console.error('파트너 스토어 포인트 업데이트 실패:', updateError);
    return;
  }

  const { error: logError } = await supabase.from('partner_points_logs').insert({
    partner_id: partnerId,
    type: 'earn',
    amount: netAmount,
    description: `스토어 상품 판매 (${tierCode} 티어, 수수료 ${takeRate}%): ${product.name}`,
    log_id: logId,
    point_type: 'store_points'
  });

  if (logError) {
    console.error('파트너 포인트 로그 기록 실패:', logError);
  } else {
    console.log(`파트너 스토어 포인트 정산 완료: partnerId=${partnerId}, gross=${totalAmount}, net=${netAmount}, tier=${tierCode}, takeRate=${takeRate}%, newStorePoints=${newStorePoints}`);
  }
}

