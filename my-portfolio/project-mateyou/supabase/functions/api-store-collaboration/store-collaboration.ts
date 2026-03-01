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
    const params = getQueryParams(req.url);

    // =====================================
    // 협업 상품 등록 요청 (Admin → Partner)
    // store_collaboration_requests 테이블 사용
    // =====================================

    // ===== GET /api-store-collaboration/product-requests - 파트너에게 온 협업 상품 등록 요청 목록 =====
    // 날짜 필터: requested_from, requested_to (협업요청 받은 시점), responded_from, responded_to (수락/거절 시점)
    if (pathname === '/api-store-collaboration/product-requests' && req.method === 'GET') {
      const user = await getAuthUser(req);
      const status = params.status; // pending, accepted, rejected

      // 파트너 확인
      const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', user.id)
        .single();

      if (!partner) {
        return errorResponse('FORBIDDEN', '파트너만 접근할 수 있습니다.', null, 403);
      }

      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '20');
      const offset = (page - 1) * limit;
      
      // 날짜 필터 파라미터
      const requestedFrom = params.requested_from; // 협업요청 받은 시작일 (ISO 8601)
      const requestedTo = params.requested_to; // 협업요청 받은 종료일 (ISO 8601)
      const respondedFrom = params.responded_from; // 수락/거절 시작일 (ISO 8601)
      const respondedTo = params.responded_to; // 수락/거절 종료일 (ISO 8601)

      let query = supabase
        .from('store_collaboration_requests')
        .select(`
          *,
          product:store_products!store_collaboration_requests_product_id_fkey(
            product_id, name, description, price, product_type, thumbnail_url, source, is_active, stock,
            shipping_fee_base, shipping_fee_remote,
            images:store_product_images(image_id, image_url, display_order),
            digital_assets:store_digital_assets(asset_id, file_url, file_name, display_order)
          ),
          cloned_product:store_products!store_collaboration_requests_cloned_product_id_fkey(
            product_id, name, description, price, product_type, thumbnail_url, source, is_active, stock,
            partner_id, parent_product_id,
            images:store_product_images(image_id, image_url, display_order)
          ),
          admin:members!store_collaboration_requests_admin_id_fkey(id, name, email)
        `, { count: 'exact' })
        .eq('partner_id', partner.id);

      if (status) {
        query = query.eq('status', status);
      }

      // 협업요청 받은 시점 필터 (created_at)
      if (requestedFrom) {
        query = query.gte('created_at', requestedFrom);
      }
      if (requestedTo) {
        query = query.lte('created_at', requestedTo);
      }

      // 수락/거절 시점 필터 (updated_at)
      if (respondedFrom) {
        query = query.gte('updated_at', respondedFrom);
      }
      if (respondedTo) {
        query = query.lte('updated_at', respondedTo);
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

    // ===== GET /api-store-collaboration/product-requests/admin - Admin 협업 요청 목록 (모든 관리자 요청 조회) =====
    // 날짜 필터: requested_from, requested_to (협업요청한 시점), responded_from, responded_to (수락/거절 시점)
    // admin_id: 특정 관리자가 생성한 요청만 필터 (선택사항)
    if (pathname === '/api-store-collaboration/product-requests/admin' && req.method === 'GET') {
      const user = await getAuthUser(req);
      const status = params.status;
      const adminIdFilter = params.admin_id; // 특정 관리자 필터 (선택사항)

      // Admin 확인
      const { data: member } = await supabase
        .from('members')
        .select('role')
        .eq('id', user.id)
        .single();

      if (member?.role !== 'admin') {
        return errorResponse('FORBIDDEN', '관리자만 접근할 수 있습니다.', null, 403);
      }

      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '20');
      const offset = (page - 1) * limit;
      
      // 날짜 필터 파라미터
      const requestedFrom = params.requested_from; // 협업요청한 시작일 (ISO 8601)
      const requestedTo = params.requested_to; // 협업요청한 종료일 (ISO 8601)
      const respondedFrom = params.responded_from; // 수락/거절 시작일 (ISO 8601)
      const respondedTo = params.responded_to; // 수락/거절 종료일 (ISO 8601)

      let query = supabase
        .from('store_collaboration_requests')
        .select(`
          *,
          product:store_products!store_collaboration_requests_product_id_fkey(
            product_id, name, description, price, product_type, thumbnail_url, source, is_active, stock,
            shipping_fee_base, shipping_fee_remote,
            images:store_product_images(image_id, image_url, display_order)
          ),
          cloned_product:store_products!store_collaboration_requests_cloned_product_id_fkey(
            product_id, name, description, price, product_type, thumbnail_url, source, is_active, stock,
            partner_id, parent_product_id,
            images:store_product_images(image_id, image_url, display_order)
          ),
          partner:partners(id, partner_name, member:members(id, name, profile_image)),
          admin:members!store_collaboration_requests_admin_id_fkey(id, name, email)
        `, { count: 'exact' });

      // 특정 관리자 필터 (선택사항)
      if (adminIdFilter) {
        query = query.eq('admin_id', adminIdFilter);
      }

      if (status) {
        query = query.eq('status', status);
      }

      // 협업요청한 시점 필터 (created_at)
      if (requestedFrom) {
        query = query.gte('created_at', requestedFrom);
      }
      if (requestedTo) {
        query = query.lte('created_at', requestedTo);
      }

      // 수락/거절 시점 필터 (updated_at)
      if (respondedFrom) {
        query = query.gte('updated_at', respondedFrom);
      }
      if (respondedTo) {
        query = query.lte('updated_at', respondedTo);
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

    // ===== GET /api-store-collaboration/product-requests/detail - 협업 상품 등록 요청 상세 (쿼리 파라미터: request_id) =====
    if (pathname === '/api-store-collaboration/product-requests/detail' && req.method === 'GET') {
      const user = await getAuthUser(req);
      const requestId = params.request_id;

      if (!requestId) {
        return errorResponse('INVALID_REQUEST', 'request_id 파라미터가 필요합니다.');
      }

      // 권한 확인
      const { data: member } = await supabase
        .from('members')
        .select('role')
        .eq('id', user.id)
        .single();

      const isAdmin = member?.role === 'admin';

      const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', user.id)
        .single();

      const { data: request, error } = await supabase
        .from('store_collaboration_requests')
        .select(`
          *,
          product:store_products!store_collaboration_requests_product_id_fkey(
            product_id, name, description, price, product_type, thumbnail_url, source, is_active, stock,
            shipping_fee_base, shipping_fee_remote,
            images:store_product_images(image_id, image_url, display_order),
            digital_assets:store_digital_assets(asset_id, file_url, file_name, display_order)
          ),
          cloned_product:store_products!store_collaboration_requests_cloned_product_id_fkey(
            product_id, name, description, price, product_type, thumbnail_url, source, is_active, stock,
            partner_id, parent_product_id,
            images:store_product_images(image_id, image_url, display_order)
          ),
          admin:members!store_collaboration_requests_admin_id_fkey(id, name, email),
          partner:partners(id, partner_name, member:members(id, name, profile_image))
        `)
        .eq('request_id', requestId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return errorResponse('NOT_FOUND', '협업 요청을 찾을 수 없습니다.', null, 404);
        }
        throw error;
      }

      // 권한 확인
      const isOwner = partner && request.partner_id === partner.id;
      if (!isAdmin && !isOwner) {
        return errorResponse('FORBIDDEN', '권한이 없습니다.', null, 403);
      }

      return successResponse(request);
    }

    // ===== POST /api-store-collaboration/product-requests - Admin이 파트너에게 협업 요청 생성 =====
    if (pathname === '/api-store-collaboration/product-requests' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body) {
        return errorResponse('INVALID_REQUEST', '요청 본문이 필요합니다.');
      }

      const { product_id, partner_id, distribution_rate, share_rate } = body;

      if (!product_id || !partner_id) {
        return errorResponse('INVALID_REQUEST', 'product_id와 partner_id는 필수입니다.');
      }

      // share_rate 범위 검증 (0-100, 단일 파트너이므로 기본값 100)
      const finalShareRate = share_rate ?? 100;
      if (finalShareRate < 0 || finalShareRate > 100) {
        return errorResponse('INVALID_REQUEST', '배분율(share_rate)은 0~100 사이여야 합니다.');
      }

      // Admin 확인
      const { data: member } = await supabase
        .from('members')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!member || member.role !== 'admin') {
        return errorResponse('FORBIDDEN', '관리자만 접근할 수 있습니다.', null, 403);
      }

      // 상품 존재 확인
      const { data: product, error: productError } = await supabase
        .from('store_products')
        .select('product_id, name, source')
        .eq('product_id', product_id)
        .single();

      if (productError || !product) {
        return errorResponse('NOT_FOUND', '상품을 찾을 수 없습니다.', null, 404);
      }

      // 파트너 존재 확인
      const { data: partner, error: partnerError } = await supabase
        .from('partners')
        .select('id, partner_name, partner_status')
        .eq('id', partner_id)
        .single();

      if (partnerError || !partner) {
        return errorResponse('NOT_FOUND', '파트너를 찾을 수 없습니다.', null, 404);
      }

      if (partner.partner_status !== 'approved') {
        return errorResponse('INVALID_REQUEST', '승인된 파트너에게만 협업 요청을 보낼 수 있습니다.');
      }

      // 이미 해당 상품에 대한 협업 요청이 있는지 확인
      const { data: existingRequest } = await supabase
        .from('store_collaboration_requests')
        .select('request_id, status')
        .eq('product_id', product_id)
        .single();

      if (existingRequest) {
        return errorResponse('DUPLICATE', `이미 해당 상품에 대한 협업 요청이 있습니다. (상태: ${existingRequest.status})`);
      }

      // 협업 요청 생성
      const { data: newRequest, error: createError } = await supabase
        .from('store_collaboration_requests')
        .insert({
          product_id,
          partner_id,
          admin_id: user.id,
          status: 'pending',
          distribution_rate: distribution_rate || 100,
          share_rate: finalShareRate, // 파트너 간 배분율
        })
        .select(`
          *,
          product:store_products!store_collaboration_requests_product_id_fkey(
            product_id, name, description, price, product_type, thumbnail_url, source, is_active, stock
          ),
          partner:partners(id, partner_name, member:members(id, name, profile_image)),
          admin:members!store_collaboration_requests_admin_id_fkey(id, name, email)
        `)
        .single();

      if (createError) throw createError;

      return successResponse(newRequest);
    }

    // ===== GET /api-store-collaboration/partners-with-rates - 파트너 목록 + 기본 배분 비율 =====
    // store 이용약관 동의(is_seller=true)한 파트너만 조회
    // 배분율은 partner_business_info 테이블에서 조회
    if (pathname === '/api-store-collaboration/partners-with-rates' && req.method === 'GET') {
      const user = await getAuthUser(req);

      // Admin 확인
      const { data: member } = await supabase
        .from('members')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!member || member.role !== 'admin') {
        return errorResponse('FORBIDDEN', '관리자만 접근할 수 있습니다.', null, 403);
      }

      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '20');
      const offset = (page - 1) * limit;
      const partnerNameSearch = params.partner_name;

      let query = supabase
        .from('partners')
        .select(`
          id,
          partner_name,
          partner_status,
          partner_applied_at,
          is_seller,
          member:members(id, name, profile_image, email),
          business_info:partner_business_info(default_distribution_rate, collaboration_distribution_rate)
        `, { count: 'exact' })
        .eq('partner_status', 'approved')
        .eq('is_seller', true); // store 이용약관 동의한 파트너만

      // partner_name 검색 (부분 매칭)
      if (partnerNameSearch) {
        query = query.ilike('partner_name', `%${partnerNameSearch}%`);
      }

      const { data: partners, error, count } = await query
        .order('partner_name', { ascending: true })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      const formattedPartners = (partners || []).map((p: any) => ({
        id: p.id,
        partner_name: p.partner_name,
        partner_status: p.partner_status,
        default_distribution_rate: p.business_info?.default_distribution_rate ?? 100,
        collaboration_distribution_rate: p.business_info?.collaboration_distribution_rate ?? 100,
        partner_applied_at: p.partner_applied_at,
        is_seller: p.is_seller,
        name: p.member?.name,
        profile_image: p.member?.profile_image,
        email: p.member?.email,
      }));

      return successResponse(formattedPartners, {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
      });
    }

    // ===== POST /api-store-collaboration/send-requests - 다중 파트너 협업 상품 즉시 등록 =====
    // 변경: 파트너 수락 과정 없이 즉시 복제 상품 생성 + 활성화
    if (pathname === '/api-store-collaboration/send-requests' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body) {
        return errorResponse('INVALID_REQUEST', '요청 본문이 필요합니다.');
      }

      const { product_id, partners: partnerList } = body;

      if (!product_id || !partnerList || !Array.isArray(partnerList) || partnerList.length === 0) {
        return errorResponse('INVALID_REQUEST', 'product_id와 partners 배열은 필수입니다.');
      }

      // share_rate가 설정된 파트너가 있는지 확인 (null이 아닌 경우)
      const hasShareRate = partnerList.some((p: { share_rate?: number | null }) => p.share_rate != null);

      if (hasShareRate) {
        const totalShareRate = partnerList.reduce((sum: number, p: { share_rate?: number | null }) => {
          return sum + (p.share_rate ?? 0);
        }, 0);

        if (totalShareRate !== 100) {
          return errorResponse('INVALID_REQUEST', `모든 파트너의 배분율(share_rate) 합계는 100%여야 합니다. 현재: ${totalShareRate}%`);
        }

        for (const p of partnerList) {
          const rate = p.share_rate!;
          if (rate < 0 || rate > 100) {
            return errorResponse('INVALID_REQUEST', `배분율(share_rate)은 0~100 사이여야 합니다. partner_id: ${p.partner_id}, share_rate: ${rate}`);
          }
        }
      }

      // Admin 확인
      const { data: member } = await supabase
        .from('members')
        .select('role')
        .eq('id', user.id)
        .single();

      if (!member || member.role !== 'admin') {
        return errorResponse('FORBIDDEN', '관리자만 접근할 수 있습니다.', null, 403);
      }

      // 상품 존재 확인 (복제를 위해 전체 정보 조회, 옵션 포함)
      const { data: product, error: productError } = await supabase
        .from('store_products')
        .select(`
          product_id, name, description, price, product_type, thumbnail_url, source, 
          stock, shipping_fee_base, shipping_fee_remote, distribution_rate,
          pickup_location, pickup_location_point,
          images:store_product_images(image_id, image_url, display_order),
          digital_assets:store_digital_assets(asset_id, file_url, file_name, display_order),
          options:store_product_options(option_id, name, option_type, is_required, display_order, values:store_product_option_values(value_id, value, price_adjustment, stock, display_order))
        `)
        .eq('product_id', product_id)
        .single();

      if (productError || !product) {
        return errorResponse('NOT_FOUND', '상품을 찾을 수 없습니다.', null, 404);
      }

      // 협업 상품인지 확인
      if (product.source !== 'collaboration') {
        return errorResponse('INVALID_REQUEST', '협업 상품만 파트너를 등록할 수 있습니다.');
      }

      const results: any[] = [];
      const errors: any[] = [];

      for (const partnerData of partnerList) {
        const { partner_id, distribution_rate, share_rate } = partnerData;

        if (!partner_id) {
          errors.push({ partner_id: null, error: 'partner_id 누락' });
          continue;
        }

        // 파트너 존재 확인 (배분율은 partner_business_info에서 조회)
        const { data: partner } = await supabase
          .from('partners')
          .select(`
            id, partner_name, partner_status, is_seller, member_id,
            business_info:partner_business_info(default_distribution_rate, collaboration_distribution_rate)
          `)
          .eq('id', partner_id)
          .single();

        if (!partner) {
          errors.push({ partner_id, error: '파트너를 찾을 수 없습니다.' });
          continue;
        }

        if (partner.partner_status !== 'approved') {
          errors.push({ partner_id, error: '승인된 파트너가 아닙니다.' });
          continue;
        }

        // store 이용약관 동의 여부 확인
        if (!partner.is_seller) {
          errors.push({ partner_id, partner_name: partner.partner_name, error: 'store 이용약관에 동의하지 않은 파트너입니다.' });
          continue;
        }

        // 이미 해당 상품+파트너 조합의 협업 요청이 있는지 확인
        const { data: existingRequest } = await supabase
          .from('store_collaboration_requests')
          .select('request_id')
          .eq('product_id', product_id)
          .eq('partner_id', partner_id)
          .single();

        if (existingRequest) {
          errors.push({ partner_id, partner_name: partner.partner_name, error: '이미 등록된 파트너입니다.' });
          continue;
        }

        // 정산율 결정 (전달된 값 > 파트너 협업 정산율 > 100)
        // deno-lint-ignore no-explicit-any
        const businessInfo = partner.business_info as any;
        const finalDistributionRate = distribution_rate ?? businessInfo?.collaboration_distribution_rate ?? 100;
        
        // 배분율 (share_rate): null이면 개별 정산 모드
        const finalShareRate = share_rate != null ? share_rate : null;

        try {
          // ===== 1. 복제 상품 즉시 생성 =====
          const cloneInsertData: Record<string, any> = {
              name: product.name,
              description: product.description,
              price: product.price,
              product_type: product.product_type,
              thumbnail_url: product.thumbnail_url,
            source: 'collaboration',
              partner_id: partner_id,
              parent_product_id: product.product_id,
              stock: product.stock,
              shipping_fee_base: product.shipping_fee_base,
              shipping_fee_remote: product.shipping_fee_remote,
              distribution_rate: finalDistributionRate,
              is_active: true,
            purchase_count: 0
          };
          if (product.pickup_location) cloneInsertData.pickup_location = product.pickup_location;
          if (product.pickup_location_point) cloneInsertData.pickup_location_point = product.pickup_location_point;

        const { data: clonedProduct, error: cloneError } = await supabase
          .from('store_products')
          .insert(cloneInsertData)
          .select('product_id')
          .single();

        if (cloneError) {
            errors.push({ partner_id, partner_name: partner.partner_name, error: `상품 복제 실패: ${cloneError.message}` });
            continue;
        }

          const clonedProductId = clonedProduct.product_id;

          // ===== 2. 상품 이미지 복제 =====
          const originalImages = product.images || [];
        if (originalImages.length > 0) {
          const imageInserts = originalImages.map((img: any) => ({
            product_id: clonedProductId,
            image_url: img.image_url,
            display_order: img.display_order
          }));

            await supabase.from('store_product_images').insert(imageInserts);
        }

          // ===== 3. 디지털 자산 복제 (digital 상품인 경우) =====
          if (product.product_type === 'digital') {
            const originalAssets = product.digital_assets || [];
          if (originalAssets.length > 0) {
            const assetInserts = originalAssets.map((asset: any) => ({
              product_id: clonedProductId,
              file_url: asset.file_url,
              file_name: asset.file_name,
              display_order: asset.display_order
            }));

              await supabase.from('store_digital_assets').insert(assetInserts);
            }
          }

          // ===== 4. 상품 옵션 복제 (on_site, delivery 상품인 경우) =====
          if (['on_site', 'delivery'].includes(product.product_type)) {
            const originalOptions = product.options || [];
            for (const opt of originalOptions as Array<{
              option_id: string;
              name: string;
              option_type: string;
              is_required: boolean;
              display_order: number;
              values?: Array<{
                value_id: string;
                value: string;
                price_adjustment: number;
                stock: number | null;
                display_order: number;
              }>;
            }>) {
              // 옵션 그룹 복제
              const { data: clonedOption, error: optionError } = await supabase
                .from('store_product_options')
                .insert({
                  product_id: clonedProductId,
                  name: opt.name,
                  option_type: opt.option_type,
                  is_required: opt.is_required,
                  display_order: opt.display_order
                })
                .select('option_id')
                .single();

              if (optionError || !clonedOption) {
                console.error('옵션 그룹 복제 실패:', optionError);
                continue;
              }

              // 옵션 값 복제 (select 타입만)
              if (opt.option_type === 'select' && opt.values && opt.values.length > 0) {
                const valueInserts = opt.values.map(val => ({
                  option_id: clonedOption.option_id,
                  value: val.value,
                  price_adjustment: val.price_adjustment,
                  stock: val.stock,
                  display_order: val.display_order
                }));

                const { error: valuesError } = await supabase
                  .from('store_product_option_values')
                  .insert(valueInserts);

                if (valuesError) {
                  console.error('옵션 값 복제 실패:', valuesError);
                }
              }
            }
          }

          // ===== 5. 베이스 schedule 복제 (on_site 상품) =====
          if (product.product_type === 'on_site') {
            const { data: origSchedules } = await supabase
              .from('store_partner_schedules')
              .select('location, location_point')
              .eq('product_id', product.product_id)
              .is('start_time', null);

            if (origSchedules && origSchedules.length > 0) {
              const baseSchedule = origSchedules[0];
              await supabase.from('store_partner_schedules').insert({
                product_id: clonedProductId,
                partner_id: partner_id,
                location: baseSchedule.location,
                location_point: baseSchedule.location_point,
                is_available: true,
                current_bookings: 0
              });
            }
          }

          // ===== 6. 협업 요청 레코드 생성 (즉시 accepted 상태) =====
          const { data: newRequest, error: createError } = await supabase
        .from('store_collaboration_requests')
            .insert({
              product_id,
              partner_id,
              admin_id: user.id,
              status: 'accepted', // 즉시 수락 상태
              distribution_rate: finalDistributionRate,
              share_rate: finalShareRate, // 파트너 간 배분율
              cloned_product_id: clonedProductId,
            })
            .select('request_id, partner_id, distribution_rate, share_rate, status, cloned_product_id')
            .single();

          if (createError) {
            // 협업 요청 생성 실패 시 복제 상품 삭제 (롤백)
            await supabase.from('store_products').delete().eq('product_id', clonedProductId);
            errors.push({ partner_id, partner_name: partner.partner_name, error: createError.message });
            continue;
          }

          results.push({ 
            ...newRequest, 
            partner_name: partner.partner_name,
            cloned_product_id: clonedProductId
          });

          console.log(`[협업 상품 등록] 즉시 등록 완료: 원본=${product_id}, 복제=${clonedProductId}, 파트너=${partner_id}`);

          // ===== 5. 파트너에게 협업 상품 등록 알림 발송 =====
          if (partner.member_id) {
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
                  user_id: partner.member_id,
                  target_member_id: partner.member_id,
                  title: '🎉 협업 상품 등록 완료',
                  body: `${product.name} 상품이 스토어에 등록되었습니다.${finalShareRate != null ? ` (배분율 ${finalShareRate}%)` : ''}`,
                  icon: null,
                  url: '/partner/store/products',
                  notification_type: 'store_collaboration_registered',
                  tag: `collab_registered_${newRequest.request_id}`,
                  data: { request_id: newRequest.request_id, product_id, cloned_product_id: clonedProductId, share_rate: finalShareRate, distribution_rate: finalDistributionRate },
                  process_immediately: true,
                }),
              });
            } catch (e) {
              console.error('협업 상품 등록 푸시 알림 발송 실패:', e);
            }
          }
        } catch (e) {
          console.error('협업 상품 등록 처리 실패:', e);
          errors.push({ partner_id, partner_name: partner.partner_name, error: e instanceof Error ? e.message : '처리 실패' });
        }
      }

      return successResponse({
        success: results,
        failed: errors,
        total_requested: partnerList.length,
        success_count: results.length,
        failed_count: errors.length,
      });
    }

    // ===== [DEPRECATED] PUT /api-store-collaboration/product-requests/respond =====
    // 협업 상품이 즉시 등록되는 새로운 흐름으로 변경됨
    // 파트너 수락/거절 과정이 더 이상 필요 없음
    if (pathname === '/api-store-collaboration/product-requests/respond' && req.method === 'PUT') {
      return errorResponse(
        'DEPRECATED', 
        '이 API는 더 이상 사용되지 않습니다. 협업 상품은 관리자가 등록 시 즉시 활성화됩니다.',
        null,
        410 // Gone
      );
    }

    // =====================================
    // 출고 요청 (Partner → Admin)
    // store_shipment_requests 테이블 사용
    // delivery 협업 상품만 출고 요청 필요
    // =====================================

    // ===== POST /api-store-collaboration/shipment-requests - 파트너가 출고 요청 생성 (delivery 상품만) =====
    if (pathname === '/api-store-collaboration/shipment-requests' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body || !body.order_id) {
        return errorResponse('INVALID_REQUEST', 'order_id는 필수입니다.');
      }

      // 파트너 확인
      const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', user.id)
        .single();

      if (!partner) {
        return errorResponse('FORBIDDEN', '파트너만 출고 요청을 할 수 있습니다.', null, 403);
      }

      // 주문 확인 (정규화된 구조)
      const { data: order, error: orderError } = await supabase
        .from('store_orders')
        .select(`
          order_id, partner_id, status,
          order_items:store_order_items(
            order_item_id, product_id, product_type, product_source, quantity,
            product:store_products(product_id, stock)
          ),
          shipments:store_shipments(shipment_id, status)
        `)
        .eq('order_id', body.order_id)
        .single();

      if (orderError || !order) {
        return errorResponse('NOT_FOUND', '주문을 찾을 수 없습니다.', null, 404);
      }

      const orderItems = order.order_items || [];
      const hasCollaborationItem = orderItems.some((item: any) => item.product_source === 'collaboration');
      
      // 협업 상품 찾기 (delivery 또는 on_site)
      const collabItem = orderItems.find((item: any) => 
        item.product_source === 'collaboration' && (item.product_type === 'delivery' || item.product_type === 'on_site')
      );

      if (!hasCollaborationItem) {
        return errorResponse('INVALID_REQUEST', '협업 상품 주문만 출고 요청이 가능합니다.');
      }

      if (!collabItem) {
        return errorResponse('INVALID_REQUEST', 'delivery 또는 on_site 협업 상품만 출고 요청이 가능합니다.');
      }

      // 본인 상품인지 확인
      if (order.partner_id !== partner.id) {
        return errorResponse('FORBIDDEN', '본인의 상품 주문만 출고 요청할 수 있습니다.', null, 403);
      }

      // 결제 완료 상태인지 확인
      if (order.status !== 'paid') {
        return errorResponse('INVALID_REQUEST', '결제 완료된 주문만 출고 요청이 가능합니다.');
      }

      // 이미 출고 요청이 있는지 확인
      const { data: existingRequest } = await supabase
        .from('store_shipment_requests')
        .select('request_id')
        .eq('order_id', body.order_id)
        .single();

      if (existingRequest) {
        return errorResponse('INVALID_REQUEST', '이미 출고 요청이 존재합니다.');
      }

      // 출고 요청 생성 (delivery 협업 상품의 product_id 사용)
      const { data: shipmentRequest, error: createError } = await supabase
        .from('store_shipment_requests')
        .insert({
          order_id: body.order_id,
          product_id: collabItem.product_id,
          partner_id: partner.id,
          status: 'pending',
          notes: body.notes
        })
        .select()
        .single();

      if (createError) throw createError;

      // === 관리자에게 출고 요청 푸시 알림 발송 ===
      const { data: admins } = await supabase
        .from('members')
        .select('id')
        .eq('role', 'admin');

      const { data: partnerInfo } = await supabase
        .from('partners')
        .select('partner_name')
        .eq('id', partner.id)
        .single();

      const { data: productInfo } = await supabase
        .from('store_products')
        .select('name')
        .eq('product_id', collabItem.product_id)
        .single();

      if (admins && admins.length > 0) {
        console.log(`[출고 요청 알림] 관리자 ${admins.length}명에게 알림 발송 시도`);

        for (const admin of admins) {
          try {
            console.log(`[출고 요청 알림] admin.id: ${admin.id}에게 직접 DB insert 시도`);
            
            // push_notifications_queue 테이블에 직접 insert (push-native 호출 대신)
            const { data: job, error: insertError } = await supabase
              .from('push_notifications_queue')
              .insert({
                user_id: admin.id,
                target_member_id: admin.id,
                title: '📦 출고 요청',
                body: `${partnerInfo?.partner_name || '파트너'}님이 ${productInfo?.name || '협업 상품'}의 출고를 요청했습니다.`,
                icon: null,
                url: '/admin/store/shipment-requests',
                notification_type: 'store_shipment_request',
                tag: `shipment_request_${shipmentRequest.request_id}_${admin.id}`,
                data: { request_id: shipmentRequest.request_id, order_id: body.order_id },
                status: 'pending',
                retry_count: 0,
                max_retries: 3,
                scheduled_at: new Date().toISOString(),
              })
              .select()
              .single();

            if (insertError) {
              console.error(`[출고 요청 알림] admin.id: ${admin.id} DB insert 실패:`, insertError);
            } else {
              console.log(`[출고 요청 알림] admin.id: ${admin.id}에게 알림 큐 등록 성공, job_id: ${job?.id}`);
            }
          } catch (e) {
            console.error(`[출고 요청 알림] admin.id: ${admin.id} 발송 실패:`, e);
          }
        }
      } else {
        console.warn('[출고 요청 알림] 관리자가 없습니다.');
      }

      return successResponse(shipmentRequest);
    }

    // ===== GET /api-store-collaboration/shipment-requests - 출고 요청 목록 =====
    // 날짜 필터: requested_from, requested_to (출고요청 시점), processed_from, processed_to (수락/거절 시점)
    if (pathname === '/api-store-collaboration/shipment-requests' && req.method === 'GET') {
      const user = await getAuthUser(req);
      const status = params.status;

      // Admin 또는 파트너 확인
      const { data: member } = await supabase
        .from('members')
        .select('role')
        .eq('id', user.id)
        .single();

      const isAdmin = member?.role === 'admin';

      const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', user.id)
        .single();

      if (!isAdmin && !partner) {
        return errorResponse('FORBIDDEN', '권한이 없습니다.', null, 403);
      }

      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '20');
      const offset = (page - 1) * limit;
      
      // 날짜 필터 파라미터
      const requestedFrom = params.requested_from; // 출고요청 시작일 (ISO 8601)
      const requestedTo = params.requested_to; // 출고요청 종료일 (ISO 8601)
      const processedFrom = params.processed_from; // 수락/거절 시작일 (ISO 8601)
      const processedTo = params.processed_to; // 수락/거절 종료일 (ISO 8601)

      let query = supabase
        .from('store_shipment_requests')
        .select(`
          *,
          product:store_products(product_id, name, product_type, source, thumbnail_url),
          order:store_orders(
            order_id, order_number, status, total_amount, total_shipping_fee, created_at,
            reserved_location, reserved_location_point,
            order_items:store_order_items(
              order_item_id, product_id, product_name, product_type, product_source, quantity, subtotal
            ),
            shipments:store_shipments(
              shipment_id, status, shipping_fee, courier, tracking_number,
              recipient_name, recipient_phone, recipient_address, recipient_postal_code, delivery_memo
            ),
            buyer:members!user_id(id, name, profile_image, member_code)
          ),
          partner:partners(id, partner_name, member:members(id, name, profile_image)),
          processor:members!store_shipment_requests_processed_by_fkey(id, name)
        `, { count: 'exact' });

      // 파트너는 본인의 요청만
      if (!isAdmin && partner) {
        query = query.eq('partner_id', partner.id);
      }

      if (status) {
        query = query.eq('status', status);
      }

      // 출고요청 시점 필터 (created_at)
      if (requestedFrom) {
        query = query.gte('created_at', requestedFrom);
      }
      if (requestedTo) {
        query = query.lte('created_at', requestedTo);
      }

      // 수락/거절 시점 필터 (processed_at)
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

    // ===== GET /api-store-collaboration/shipment-requests/detail - 출고 요청 상세 (쿼리 파라미터: request_id) =====
    if (pathname === '/api-store-collaboration/shipment-requests/detail' && req.method === 'GET') {
      const user = await getAuthUser(req);
      const requestId = params.request_id;

      if (!requestId) {
        return errorResponse('INVALID_REQUEST', 'request_id 파라미터가 필요합니다.');
      }

      // 권한 확인
      const { data: member } = await supabase
        .from('members')
        .select('role')
        .eq('id', user.id)
        .single();

      const isAdmin = member?.role === 'admin';

      const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', user.id)
        .single();

      const { data: request, error } = await supabase
        .from('store_shipment_requests')
        .select(`
          *,
          product:store_products(product_id, name, product_type, source, thumbnail_url),
          order:store_orders(
            order_id, order_number, status, total_amount, total_shipping_fee, created_at, is_confirmed,
            reserved_location, reserved_location_point, reserved_start_time, reserved_end_time,
            order_items:store_order_items(
              order_item_id, product_id, product_name, product_type, product_source, quantity, subtotal, selected_options,
              product:store_products(product_id, stock, digital_assets:store_digital_assets(asset_id, file_url, file_name, display_order))
            ),
            shipments:store_shipments(
              shipment_id, status, shipping_fee, courier, tracking_number, shipped_at,
              recipient_name, recipient_phone, recipient_address, recipient_postal_code, delivery_memo
            ),
            buyer:members!user_id(id, name, profile_image, member_code)
          ),
          partner:partners(id, partner_name, member:members(id, name, profile_image)),
          processor:members!store_shipment_requests_processed_by_fkey(id, name)
        `)
        .eq('request_id', requestId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return errorResponse('NOT_FOUND', '출고 요청을 찾을 수 없습니다.', null, 404);
        }
        throw error;
      }

      // 권한 확인
      const isOwner = partner && request.partner_id === partner.id;
      if (!isAdmin && !isOwner) {
        return errorResponse('FORBIDDEN', '권한이 없습니다.', null, 403);
      }

      return successResponse(request);
    }

    // ===== PUT /api-store-collaboration/shipment-requests/respond - 관리자 출고 요청 승인/거절 (쿼리 파라미터: request_id) =====
    if (pathname === '/api-store-collaboration/shipment-requests/respond' && req.method === 'PUT') {
      const user = await getAuthUser(req);
      const requestId = params.request_id;

      if (!requestId) {
        return errorResponse('INVALID_REQUEST', 'request_id 파라미터가 필요합니다.');
      }

      const body = await parseRequestBody(req);

      if (!body) {
        return errorResponse('INVALID_REQUEST', '요청 본문이 필요합니다.');
      }

      const { status: requestStatus, courier, tracking_number, rejection_reason, pickup_date, pickup_time } = body;

      if (!requestStatus || !['approved', 'rejected'].includes(requestStatus)) {
        return errorResponse('INVALID_REQUEST', 'status는 approved 또는 rejected이어야 합니다.');
      }

      // Admin 확인
      const { data: member } = await supabase
        .from('members')
        .select('role')
        .eq('id', user.id)
        .single();

      if (member?.role !== 'admin') {
        return errorResponse('FORBIDDEN', '관리자만 처리할 수 있습니다.', null, 403);
      }

      // 출고 요청 확인 (정규화된 구조)
      const { data: request, error: requestError } = await supabase
        .from('store_shipment_requests')
        .select(`
          *,
          order:store_orders(
            order_id, user_id, partner_id, status, total_amount,
            order_items:store_order_items(
              order_item_id, product_id, product_name, product_type, quantity,
              product:store_products(product_id, stock, name)
            ),
            shipments:store_shipments(shipment_id, status)
          )
        `)
        .eq('request_id', requestId)
        .single();

      if (requestError || !request) {
        return errorResponse('NOT_FOUND', '출고 요청을 찾을 수 없습니다.', null, 404);
      }

      if (request.status !== 'pending') {
        return errorResponse('INVALID_REQUEST', '대기 중인 요청만 처리할 수 있습니다.');
      }

      // ===== 승인 처리 =====
      if (requestStatus === 'approved') {
        // 상품 타입 확인
        const orderItem = request.order?.order_items?.[0];
        const isOnSiteProduct = orderItem?.product_type === 'on_site';

        if (isOnSiteProduct) {
          // on_site 상품: 수령 일정 필수
          if (!pickup_date || !pickup_time) {
            return errorResponse('INVALID_REQUEST', '수령 날짜(pickup_date)와 시간(pickup_time)은 필수입니다.');
          }

          // 베이스 schedule에서 위치 정보 조회 (product_id로, start_time IS NULL)
          const productId = orderItem?.product_id || request.product_id;
          const { data: baseSchedule } = await supabase
            .from('store_partner_schedules')
            .select('schedule_id, location, location_point')
            .eq('product_id', productId)
            .is('start_time', null)
            .maybeSingle();

          // 확정 시간 계산
          const startTime = new Date(`${pickup_date}T${pickup_time}:00`);
          const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // +1시간

          // 새 schedule 생성 (확정된 일정)
          const newScheduleData: Record<string, any> = {
            product_id: productId,
            partner_id: request.partner_id,
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString(),
            location: baseSchedule?.location || null,
            location_point: baseSchedule?.location_point || null,
            is_available: false,
            current_bookings: 1
          };
          const { data: newSchedule, error: scheduleCreateError } = await supabase
            .from('store_partner_schedules')
            .insert(newScheduleData)
            .select('schedule_id, location, location_point')
            .single();

          if (scheduleCreateError) {
            console.error('확정 스케줄 생성 실패:', scheduleCreateError);
          }

          const { error: updateError } = await supabase
            .from('store_shipment_requests')
            .update({
              status: 'shipped',
              processed_by: user.id,
              processed_at: new Date().toISOString(),
              pickup_date,
              pickup_time,
              shipped_at: new Date().toISOString()
            })
            .eq('request_id', requestId);

          if (updateError) throw updateError;

          // 주문 상태를 reserved로 변경 + reserved 필드 업데이트
          if (request.order) {
            const orderUpdate: Record<string, any> = { status: 'reserved' };
            orderUpdate.reserved_start_time = startTime.toISOString();
            orderUpdate.reserved_end_time = endTime.toISOString();
            if (newSchedule?.location) orderUpdate.reserved_location = newSchedule.location;
            if (newSchedule?.location_point) orderUpdate.reserved_location_point = newSchedule.location_point;

            await supabase
              .from('store_orders')
              .update(orderUpdate)
              .eq('order_id', request.order.order_id);

            await supabase
              .from('store_order_items')
              .update({ status: 'reserved' })
              .eq('order_id', request.order.order_id)
              .eq('product_type', 'on_site');

            // 채팅방에 일정 확정 메시지 발송 (파트너 명의)
            const buyerId = request.order.user_id;
            const chatPartnerId = request.order.partner_id || request.partner_id;
            const productName = orderItem?.product?.name || orderItem?.product_name || '상품';
            const locationText = newSchedule?.location || baseSchedule?.location || '추후 안내';

            const pickupDateFormatted = new Date(`${pickup_date}T${pickup_time}:00`).toLocaleString('ko-KR', {
              year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
              hour: '2-digit', minute: '2-digit'
            });

            // 파트너의 member_id 조회
            const { data: chatPartner } = await supabase
              .from('partners')
              .select('member_id')
              .eq('id', chatPartnerId)
              .single();

            if (chatPartner && buyerId) {
              const senderMemberId = chatPartner.member_id;

              // 기존 채팅방 조회
              const { data: existingRoom } = await supabase
                .from('chat_rooms')
                .select('id')
                .or(`and(created_by.eq.${buyerId},partner_id.eq.${senderMemberId}),and(created_by.eq.${senderMemberId},partner_id.eq.${buyerId})`)
                .maybeSingle();

              const chatRoomId = existingRoom?.id;
              if (chatRoomId) {
                const scheduleConfirmMsg = `📅 수령 일정이 확정되었습니다!\n\n` +
                  `상품명: ${productName}\n` +
                  `📍 수령 장소: ${locationText}\n` +
                  `📅 수령 일시: ${pickupDateFormatted}\n\n` +
                  `예약 시간에 맞춰 방문해 주세요!\n\n` +
                  `[STORE_PICKUP_CONFIRMED:${request.order.order_id}:${chatPartnerId}]`;

                await supabase.from('member_chats').insert({
                  chat_room_id: chatRoomId,
                  sender_id: senderMemberId,
                  receiver_id: buyerId,
                  message: scheduleConfirmMsg,
                  message_type: 'system',
                  is_read: false
                });

                await supabase
                  .from('chat_rooms')
                  .update({ updated_at: new Date().toISOString() })
                  .eq('id', chatRoomId);

                // 구매자에게 푸시 알림
                try {
                  const supabaseUrl = Deno.env.get('SUPABASE_URL');
                  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
                  const authHeader = req.headers.get('Authorization') || `Bearer ${anonKey}`;

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
                      title: '📅 수령 일정 확정',
                      body: `${productName}의 수령 일정이 확정되었습니다. ${pickupDateFormatted}`,
                      icon: null,
                      url: `/store/orders/${request.order.order_id}`,
                      notification_type: 'store_order_reserved',
                      tag: `order_reserved_${request.order.order_id}`,
                      data: { order_id: request.order.order_id, pickup_date, pickup_time },
                      process_immediately: true,
                    }),
                  });
                } catch (e) {
                  console.error('[수령일정 확정 알림] 푸시 발송 실패:', e);
                }
              }
            }
          }
        } else {
          // delivery 상품: 배송 정보 필수
          if (!courier || !tracking_number) {
            return errorResponse('INVALID_REQUEST', '택배사(courier)와 송장번호(tracking_number)는 필수입니다.');
          }

          const { error: updateError } = await supabase
            .from('store_shipment_requests')
            .update({
              status: 'shipped',
              processed_by: user.id,
              processed_at: new Date().toISOString(),
              courier,
              tracking_number,
              shipped_at: new Date().toISOString()
            })
            .eq('request_id', requestId);

          if (updateError) throw updateError;

          if (request.order) {
            await supabase
              .from('store_orders')
              .update({ status: 'shipped' })
              .eq('order_id', request.order.order_id);

            await supabase
              .from('store_order_items')
              .update({ status: 'shipped' })
              .eq('order_id', request.order.order_id)
              .eq('product_type', 'delivery');

            const shipment = request.order.shipments?.[0];
            if (shipment) {
              await supabase
                .from('store_shipments')
                .update({
                  status: 'shipped',
                  courier,
                  tracking_number,
                  shipped_at: new Date().toISOString()
                })
                .eq('shipment_id', shipment.shipment_id);
            }
          }
        }

        // 재고 감소 처리 (order_items 기준)
        const orderItems = request.order?.order_items || [];
        for (const item of orderItems) {
          if (item.product?.stock !== null && (item.product_type === 'delivery' || item.product_type === 'on_site')) {
            const newStock = Math.max(0, (item.product.stock || 0) - item.quantity);
            await supabase
              .from('store_products')
              .update({ stock: newStock })
              .eq('product_id', item.product_id);
          }
        }

        // 업데이트된 요청 정보 조회
        const { data: updatedRequest, error: fetchError } = await supabase
          .from('store_shipment_requests')
          .select(`
            *,
            order:store_orders(
              order_id, status,
              order_items:store_order_items(order_item_id, product_name, quantity),
              shipments:store_shipments(shipment_id, status, courier, tracking_number)
            )
          `)
          .eq('request_id', requestId)
          .single();

        if (fetchError) throw fetchError;

        // === 구매자에게 배송 시작 푸시 알림 발송 (delivery만, on_site는 위에서 처리) ===
        if (!isOnSiteProduct && request.order?.user_id) {
          const buyerId = request.order.user_id;
          const orderId = request.order.order_id;
          
          const { data: productInfo } = await supabase
            .from('store_products')
            .select('name')
            .eq('product_id', request.product_id)
            .single();

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
                user_id: buyerId,
                target_member_id: buyerId,
                title: '📦 배송 시작',
                body: `${productInfo?.name || '주문하신 상품'}이(가) 배송 시작되었습니다. (${courier} ${tracking_number})`,
                icon: null,
                url: `/store/orders/${orderId}`,
                notification_type: 'store_order_shipped',
                tag: `order_shipped_${orderId}`,
                data: { order_id: orderId, courier, tracking_number },
                process_immediately: true,
              }),
            });
          } catch (e) {
            console.error('[출고 승인 알림] 구매자 알림 발송 실패:', e);
          }
        }

        return successResponse({
          ...updatedRequest,
          message: '출고 요청이 승인되었습니다. 택배 발송 및 재고가 업데이트되었습니다.'
        });
      }

      // ===== 거절 처리 =====
      if (requestStatus === 'rejected') {
        const finalRejectionReason = rejection_reason || '관리자에 의해 거절됨';
        
        const { error: updateError } = await supabase
          .from('store_shipment_requests')
          .update({
            status: 'rejected',
            processed_by: user.id,
            processed_at: new Date().toISOString(),
            rejection_reason: finalRejectionReason
          })
          .eq('request_id', requestId);

        if (updateError) throw updateError;

        // 업데이트된 요청 정보 조회
        const { data: updatedRequest, error: fetchError } = await supabase
          .from('store_shipment_requests')
          .select(`
            *,
            order:store_orders(
              order_id, status,
              order_items:store_order_items(order_item_id, product_name, quantity)
            )
          `)
          .eq('request_id', requestId)
          .single();

        if (fetchError) throw fetchError;

        // === 구매자에게 출고 거절 푸시 알림 발송 ===
        if (request.order?.user_id) {
          const buyerId = request.order.user_id;
          const orderId = request.order.order_id;
          
          // 상품명 조회
          const { data: productInfo } = await supabase
            .from('store_products')
            .select('name')
            .eq('product_id', request.product_id)
            .single();

          const supabaseUrl = Deno.env.get('SUPABASE_URL');
          const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
          const authHeader = req.headers.get('Authorization') || `Bearer ${anonKey}`;

          try {
            console.log(`[출고 거절 알림] 구매자 ${buyerId}에게 출고 거절 알림 발송`);
            const pushResponse = await fetch(`${supabaseUrl}/functions/v1/push-native`, {
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
                title: '❌ 출고 거절',
                body: `${productInfo?.name || '주문하신 상품'}의 출고가 거절되었습니다. 사유: ${finalRejectionReason}`,
                icon: null,
                url: `/store/orders/${orderId}`,
                notification_type: 'store_shipment_rejected',
                tag: `shipment_rejected_${requestId}`,
                data: { order_id: orderId, request_id: requestId, rejection_reason: finalRejectionReason },
                process_immediately: true,
              }),
            });
            const pushResult = await pushResponse.json();
            console.log(`[출고 거절 알림] 구매자 ${buyerId} 응답:`, JSON.stringify(pushResult));
          } catch (e) {
            console.error('[출고 거절 알림] 구매자 알림 발송 실패:', e);
          }
        }

        return successResponse({
          ...updatedRequest,
          message: '출고 요청이 거절되었습니다.'
        });
      }
    }

    // =====================================
    // 기타 유틸리티 API
    // =====================================

    // ===== GET /api-store-collaboration/products - 협업 상품 목록 =====
    // partner_id: 특정 파트너의 협업 상품만 조회
    // is_active: true/false로 활성 상태 필터 (기본값: 전체)
    // product_type: digital, on_site, delivery
    if (pathname === '/api-store-collaboration/products' && req.method === 'GET') {
      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '20');
      const offset = (page - 1) * limit;
      const productType = params.product_type; // digital, on_site, delivery
      const partnerId = params.partner_id; // 특정 파트너의 협업 상품만 조회
      const isActiveFilter = params.is_active; // true/false 또는 미지정(전체)

      // partner_id가 있으면 해당 파트너의 협업 요청을 통해 상품 조회
      if (partnerId) {
        // 해당 파트너의 협업 요청 목록에서 상품 조회
        const requestQuery = supabase
          .from('store_collaboration_requests')
          .select(`
            request_id,
            status,
            distribution_rate,
            rejection_reason,
            created_at,
            updated_at,
            product:store_products!store_collaboration_requests_product_id_fkey(
              product_id, name, description, price, product_type, thumbnail_url,
              source, is_active, stock, shipping_fee_base, shipping_fee_remote, created_at,
              images:store_product_images(image_id, image_url, display_order),
              digital_assets:store_digital_assets(asset_id, file_url, file_name, display_order)
            )
          `, { count: 'exact' })
          .eq('partner_id', partnerId);

        const { data: requests, error: requestError, count } = await requestQuery
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (requestError) throw requestError;

        // 상품 타입 및 활성 상태로 필터링 (클라이언트 측 필터)
        let filteredData = requests || [];
        if (productType) {
          filteredData = filteredData.filter((r: { product: { product_type: string } | null }) => 
            r.product?.product_type === productType
          );
        }
        if (isActiveFilter !== undefined) {
          const isActive = isActiveFilter === 'true';
          filteredData = filteredData.filter((r: { product: { is_active: boolean } | null }) => 
            r.product?.is_active === isActive
          );
        }

        // 각 요청에 배분 비율 정보 명시적으로 추가
        const dataWithRateInfo = filteredData.map((item: { 
          distribution_rate: number | null; 
          status: string;
          product: { name: string } | null;
        }) => ({
          ...item,
          rate_info: {
            distribution_rate: item.distribution_rate ?? 100, // 기본값 100%
            partner_share: item.distribution_rate ?? 100,
            platform_share: 100 - (item.distribution_rate ?? 100)
          }
        }));

        return successResponse(dataWithRateInfo, {
          total: count,
          page,
          limit,
          totalPages: Math.ceil((count || 0) / limit)
        });
      }

      // partner_id가 없으면 전체 협업 상품 조회
      let query = supabase
        .from('store_products')
        .select(`
          *,
          images:store_product_images(image_id, image_url, display_order),
          collaboration_partners:store_collaboration_requests!store_collaboration_requests_product_id_fkey(
            request_id,
            partner_id,
            distribution_rate,
            share_rate,
            status,
            created_at,
            updated_at,
            partner:partners(
              id,
              partner_name,
              business_info:partner_business_info(default_distribution_rate, collaboration_distribution_rate),
              member:members(id, name, profile_image)
            )
          )
        `, { count: 'exact' })
        .eq('source', 'collaboration');

      // is_active 필터가 지정된 경우에만 적용
      if (isActiveFilter !== undefined) {
        query = query.eq('is_active', isActiveFilter === 'true');
      }

      if (productType) {
        query = query.eq('product_type', productType);
      }

      if (partnerId) {
        // 해당 파트너에게 할당된 협업 상품만 조회 (store_collaboration_requests 기준)
        const { data: assignedProducts } = await supabase
          .from('store_collaboration_requests')
          .select('product_id')
          .eq('partner_id', partnerId)
          .eq('status', 'accepted');

        const productIds = (assignedProducts || []).map((p: any) => p.product_id);
        if (productIds.length > 0) {
          query = query.in('product_id', productIds);
        } else {
          // 해당 파트너에게 할당된 상품 없음
          return successResponse([], {
            total: 0,
            page,
            limit,
            totalPages: 0
          });
        }
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      // 각 상품에 협업 파트너 요약 정보 추가
      const productsWithSummary = (data || []).map((product: { 
        collaboration_partners?: Array<{ status: string; distribution_rate: number }> 
      }) => {
        const partners = product.collaboration_partners || [];
        const acceptedPartners = partners.filter((p: { status: string }) => p.status === 'accepted');
        const pendingPartners = partners.filter((p: { status: string }) => p.status === 'pending');
        
        return {
          ...product,
          collaboration_summary: {
            total_partners: partners.length,
            accepted_count: acceptedPartners.length,
            pending_count: pendingPartners.length,
            // 수락된 파트너들의 배분 비율 목록
            accepted_rates: acceptedPartners.map((p: { distribution_rate: number }) => p.distribution_rate)
          }
        };
      });

      return successResponse(productsWithSummary, {
        total: count,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      });
    }

    // ===== GET /api-store-collaboration/products/detail - 협업 상품 상세 (쿼리 파라미터: product_id) =====
    // 협업 상품 상세 정보 + 협업 파트너 목록 및 각 파트너별 배분 비율
    if (pathname === '/api-store-collaboration/products/detail' && req.method === 'GET') {
      const productId = params.product_id;

      if (!productId) {
        return errorResponse('INVALID_REQUEST', 'product_id 파라미터가 필요합니다.');
      }

      const { data, error } = await supabase
        .from('store_products')
        .select(`
          *,
          images:store_product_images(image_id, image_url, display_order),
          digital_assets:store_digital_assets(asset_id, file_url, file_name, display_order),
          collaboration_partners:store_collaboration_requests!store_collaboration_requests_product_id_fkey(
            request_id,
            partner_id,
            distribution_rate,
            share_rate,
            status,
            rejection_reason,
            created_at,
            updated_at,
            partner:partners(
              id,
              partner_name,
              business_info:partner_business_info(default_distribution_rate, collaboration_distribution_rate),
              member:members(id, name, profile_image, email)
            )
          )
        `)
        .eq('product_id', productId)
        .eq('source', 'collaboration')
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return errorResponse('NOT_FOUND', '협업 상품을 찾을 수 없습니다.', null, 404);
        }
        throw error;
      }

      // 협업 파트너 요약 정보 추가
      const collaborationPartners = data.collaboration_partners || [];
      const acceptedPartners = collaborationPartners.filter((cp: { status: string }) => cp.status === 'accepted');
      const pendingPartners = collaborationPartners.filter((cp: { status: string }) => cp.status === 'pending');
      const rejectedPartners = collaborationPartners.filter((cp: { status: string }) => cp.status === 'rejected');

      return successResponse({
        ...data,
        collaboration_summary: {
          total_partners: collaborationPartners.length,
          accepted_count: acceptedPartners.length,
          pending_count: pendingPartners.length,
          rejected_count: rejectedPartners.length
        }
      });
    }

    // ===== PUT /api-store-collaboration/products/stock - 관리자 협업 상품 재고 수정 (쿼리 파라미터: product_id) =====
    if (pathname === '/api-store-collaboration/products/stock' && req.method === 'PUT') {
      const user = await getAuthUser(req);
      const productId = params.product_id;

      if (!productId) {
        return errorResponse('INVALID_REQUEST', 'product_id 파라미터가 필요합니다.');
      }

      const body = await parseRequestBody(req);

      if (!body || body.stock === undefined) {
        return errorResponse('INVALID_REQUEST', 'stock 값이 필요합니다.');
      }

      // Admin 확인
      const { data: member } = await supabase
        .from('members')
        .select('role')
        .eq('id', user.id)
        .single();

      if (member?.role !== 'admin') {
        return errorResponse('FORBIDDEN', '관리자만 재고를 수정할 수 있습니다.', null, 403);
      }

      // 상품 확인 (협업 상품이고 on_site 또는 delivery인지)
      const { data: product, error: productError } = await supabase
        .from('store_products')
        .select('product_id, product_type, source, stock, parent_product_id')
        .eq('product_id', productId)
        .single();

      if (productError || !product) {
        return errorResponse('NOT_FOUND', '상품을 찾을 수 없습니다.', null, 404);
      }

      if (product.source !== 'collaboration') {
        return errorResponse('INVALID_REQUEST', '협업 상품만 재고 수정이 가능합니다.');
      }

      if (product.product_type === 'digital') {
        return errorResponse('INVALID_REQUEST', 'digital 상품은 재고 관리가 필요하지 않습니다.');
      }

      // 원본 상품인지 확인 (parent_product_id가 없으면 원본)
      const isOriginalProduct = !product.parent_product_id;

      // 원본 상품 재고 업데이트
      const { data: updatedProduct, error: updateError } = await supabase
        .from('store_products')
        .update({ stock: body.stock })
        .eq('product_id', productId)
        .select()
        .single();

      if (updateError) throw updateError;

      let syncedCount = 0;

      // 원본 상품인 경우 복제된 상품들도 재고 동기화
      if (isOriginalProduct) {
        const { data: clonedProducts, error: clonedError } = await supabase
          .from('store_products')
          .select('product_id')
          .eq('parent_product_id', productId);

        if (!clonedError && clonedProducts && clonedProducts.length > 0) {
          const clonedIds = clonedProducts.map((p: { product_id: string }) => p.product_id);
          
          const { error: syncError } = await supabase
            .from('store_products')
            .update({ stock: body.stock })
            .in('product_id', clonedIds);

          if (!syncError) {
            syncedCount = clonedProducts.length;
          }
          
          console.log(`[재고 동기화] 원본=${productId}, 복제된 상품 ${syncedCount}개 동기화 완료`);
        }
      }

      return successResponse({
        ...updatedProduct,
        message: '재고가 업데이트되었습니다.',
        synced_cloned_products: syncedCount
      });
    }

    // ===== GET /api-store-collaboration/stats - 협업 통계 (Admin) =====
    if (pathname === '/api-store-collaboration/stats' && req.method === 'GET') {
      const user = await getAuthUser(req);

      // Admin 확인
      const { data: member } = await supabase
        .from('members')
        .select('role')
        .eq('id', user.id)
        .single();

      if (member?.role !== 'admin') {
        return errorResponse('FORBIDDEN', '관리자만 접근할 수 있습니다.', null, 403);
      }

      // 협업 상품 수
      const { count: productCount } = await supabase
        .from('store_products')
        .select('*', { count: 'exact', head: true })
        .eq('source', 'collaboration')
        .eq('is_active', true);

      // 대기 중인 협업 상품 등록 요청
      const { count: pendingProductRequests } = await supabase
        .from('store_collaboration_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      // 대기 중인 출고 요청
      const { count: pendingShipmentRequests } = await supabase
        .from('store_shipment_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      // 이번 달 출고 완료
      const firstDayOfMonth = new Date();
      firstDayOfMonth.setDate(1);
      firstDayOfMonth.setHours(0, 0, 0, 0);

      const { count: shippedThisMonth } = await supabase
        .from('store_shipment_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'shipped')
        .gte('shipped_at', firstDayOfMonth.toISOString());

      return successResponse({
        total_collaboration_products: productCount || 0,
        pending_product_requests: pendingProductRequests || 0,
        pending_shipment_requests: pendingShipmentRequests || 0,
        shipped_this_month: shippedThisMonth || 0
      });
    }

    // ===== GET /api-store-collaboration/partner/pending-orders - 파트너의 출고 요청 대기 주문 (delivery만) =====
    if (pathname === '/api-store-collaboration/partner/pending-orders' && req.method === 'GET') {
      const user = await getAuthUser(req);

      // 파트너 확인
      const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', user.id)
        .single();

      if (!partner) {
        return errorResponse('FORBIDDEN', '파트너만 접근할 수 있습니다.', null, 403);
      }

      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '20');
      const offset = (page - 1) * limit;

      // 이미 출고 요청된 주문 ID 조회
      const { data: existingRequests } = await supabase
        .from('store_shipment_requests')
        .select('order_id')
        .eq('partner_id', partner.id);

      const requestedOrderIds = existingRequests?.map((r: { order_id: string }) => r.order_id) || [];

      // 결제 완료 상태이고 출고 요청이 없는 주문 조회 (partner_id로 직접 조회)
      let query = supabase
        .from('store_orders')
        .select(`
          *,
          order_items:store_order_items(
            order_item_id, product_id, product_name, product_type, product_source, quantity, subtotal,
            product:store_products(product_id, thumbnail_url, stock, shipping_fee_base, shipping_fee_remote)
          ),
          shipments:store_shipments(shipment_id, status, shipping_fee),
          buyer:members!user_id(id, name, profile_image)
        `, { count: 'exact' })
        .eq('partner_id', partner.id)
        .eq('status', 'paid');

      if (requestedOrderIds.length > 0) {
        query = query.not('order_id', 'in', `(${requestedOrderIds.join(',')})`);
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      // delivery 협업 상품이 포함된 주문만 필터링
      const filteredData = (data || []).filter((order: any) => {
        const orderItems = order.order_items || [];
        return orderItems.some((item: any) => 
          item.product_type === 'delivery' && item.product_source === 'collaboration'
        );
      });

      return successResponse(filteredData, {
        total: filteredData.length,
        page,
        limit,
        totalPages: Math.ceil(filteredData.length / limit)
      });
    }

    // =====================================
    // 협업 상품 배분 비율 관리 (Admin)
    // =====================================

    // ===== GET /api-store-collaboration/distribution-rate - 협업 상품 배분 비율 조회 =====
    // 쿼리 파라미터: product_id (필수), partner_id (선택 - 있으면 특정 파트너만, 없으면 모든 파트너)
    if (pathname === '/api-store-collaboration/distribution-rate' && req.method === 'GET') {
      const user = await getAuthUser(req);
      const productId = params.product_id;
      const partnerId = params.partner_id;

      if (!productId) {
        return errorResponse('INVALID_REQUEST', 'product_id 파라미터가 필요합니다.');
      }

      // Admin 확인
      const { data: member } = await supabase
        .from('members')
        .select('role')
        .eq('id', user.id)
        .single();

      if (member?.role !== 'admin') {
        return errorResponse('FORBIDDEN', '관리자만 접근할 수 있습니다.', null, 403);
      }

      // 협업 요청 정보 조회 (product_id 또는 cloned_product_id로 검색)
      let query = supabase
        .from('store_collaboration_requests')
        .select(`
          request_id,
          partner_id,
          distribution_rate,
          share_rate,
          status,
          created_at,
          updated_at,
          product:store_products!store_collaboration_requests_product_id_fkey(product_id, name, price, source, product_type, shipping_fee_base, shipping_fee_remote),
          partner:partners(id, partner_name, member:members(id, name, profile_image))
        `)
        .or(`product_id.eq.${productId},cloned_product_id.eq.${productId}`);

      // partner_id가 있으면 특정 파트너만 필터링
      if (partnerId) {
        query = query.eq('partner_id', partnerId);
      }

      const { data: requests, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;

      // 협업 요청이 없으면 빈 배열 반환
      if (!requests || requests.length === 0) {
      return successResponse({
        product_id: productId,
          total_partners: 0,
          collaboration_requests: []
        });
      }

      // 배열로 반환 (각 요청에 배분 비율 정보 포함)
      const formattedRequests = requests.map((req: {
        request_id: string;
        partner_id: string;
        distribution_rate: number | null;
        share_rate: number | null;
        status: string;
        created_at: string;
        updated_at: string;
        product: Record<string, unknown> | null;
        partner: Record<string, unknown> | null;
      }) => ({
        request_id: req.request_id,
        partner_id: req.partner_id,
        distribution_rate: req.distribution_rate ?? 100,
        share_rate: req.share_rate,
        partner_share: req.distribution_rate ?? 100,
        platform_share: 100 - (req.distribution_rate ?? 100),
        status: req.status,
        created_at: req.created_at,
        updated_at: req.updated_at,
        product: req.product,
        partner: req.partner
      }));

      return successResponse({
        product_id: productId,
        total_partners: formattedRequests.length,
        collaboration_requests: formattedRequests
      });
    }

    // ===== PUT /api-store-collaboration/distribution-rate - 협업 상품 배분 비율 설정/수정 (Admin) =====
    // 특정 파트너의 배분 비율 수정 (request_id 또는 product_id + partner_id 사용)
    if (pathname === '/api-store-collaboration/distribution-rate' && req.method === 'PUT') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body) {
        return errorResponse('INVALID_REQUEST', '요청 본문이 필요합니다.');
      }

      const { request_id, product_id, partner_id, distribution_rate, share_rate } = body;

      if (!request_id && (!product_id || !partner_id)) {
        return errorResponse('INVALID_REQUEST', 'request_id 또는 (product_id + partner_id)가 필요합니다.');
      }

      if (distribution_rate !== undefined && (distribution_rate < 0 || distribution_rate > 100)) {
        return errorResponse('INVALID_REQUEST', 'distribution_rate는 0~100 사이의 값이어야 합니다.');
      }
      if (share_rate !== undefined && share_rate !== null && (share_rate < 0 || share_rate > 100)) {
        return errorResponse('INVALID_REQUEST', 'share_rate는 0~100 사이의 값이어야 합니다.');
      }
      if (distribution_rate === undefined && share_rate === undefined) {
        return errorResponse('INVALID_REQUEST', 'distribution_rate 또는 share_rate 중 하나 이상 필요합니다.');
      }

      // Admin 확인
      const { data: member } = await supabase
        .from('members')
        .select('role')
        .eq('id', user.id)
        .single();

      if (member?.role !== 'admin') {
        return errorResponse('FORBIDDEN', '관리자만 배분 비율을 설정할 수 있습니다.', null, 403);
      }

      // 협업 요청 존재 확인
      let query = supabase
        .from('store_collaboration_requests')
        .select('request_id');

      if (request_id) {
        query = query.eq('request_id', request_id);
      } else {
        query = query.eq('product_id', product_id).eq('partner_id', partner_id);
      }

      const { data: existingRequest, error: findError } = await query.single();

      if (findError || !existingRequest) {
        return errorResponse('NOT_FOUND', '해당 협업 요청을 찾을 수 없습니다.', null, 404);
      }

      // 배분 비율 업데이트
      const updateData: Record<string, any> = {};
      if (distribution_rate !== undefined) updateData.distribution_rate = distribution_rate;
      if (share_rate !== undefined) updateData.share_rate = share_rate;

      const { data: updatedRequest, error: updateError } = await supabase
        .from('store_collaboration_requests')
        .update(updateData)
        .eq('request_id', existingRequest.request_id)
        .select(`
          request_id,
          product_id,
          partner_id,
          distribution_rate,
          share_rate,
          status,
          product:store_products!store_collaboration_requests_product_id_fkey(product_id, name, price),
          partner:partners(id, partner_name, member:members(id, name, profile_image))
        `)
        .single();

      if (updateError) throw updateError;

      return successResponse({
        message: '배분 비율이 업데이트되었습니다.',
        request: updatedRequest
      });
    }

    // ===== PUT /api-store-collaboration/partner-default-rate - 파트너 기본 배분 비율 설정 (Admin) =====
    // partner_business_info 테이블의 default_distribution_rate와 collaboration_distribution_rate 업데이트
    if (pathname === '/api-store-collaboration/partner-default-rate' && req.method === 'PUT') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body) {
        return errorResponse('INVALID_REQUEST', '요청 본문이 필요합니다.');
      }

      const { partner_id, default_distribution_rate, collaboration_distribution_rate } = body;

      if (!partner_id) {
        return errorResponse('INVALID_REQUEST', 'partner_id가 필요합니다.');
      }

      // 둘 중 하나는 필수
      if (default_distribution_rate === undefined && collaboration_distribution_rate === undefined) {
        return errorResponse('INVALID_REQUEST', 'default_distribution_rate 또는 collaboration_distribution_rate가 필요합니다.');
      }

      // 배분율 검증
      if (default_distribution_rate !== undefined && (default_distribution_rate < 0 || default_distribution_rate > 100)) {
        return errorResponse('INVALID_REQUEST', 'default_distribution_rate는 0~100 사이의 값이어야 합니다.');
      }
      if (collaboration_distribution_rate !== undefined && (collaboration_distribution_rate < 0 || collaboration_distribution_rate > 100)) {
        return errorResponse('INVALID_REQUEST', 'collaboration_distribution_rate는 0~100 사이의 값이어야 합니다.');
      }

      // Admin 확인
      const { data: member } = await supabase
        .from('members')
        .select('role')
        .eq('id', user.id)
        .single();

      if (member?.role !== 'admin') {
        return errorResponse('FORBIDDEN', '관리자만 파트너 기본 배분 비율을 설정할 수 있습니다.', null, 403);
      }

      // 파트너 존재 확인
      const { data: partner, error: partnerError } = await supabase
        .from('partners')
        .select('id, partner_name, partner_status')
        .eq('id', partner_id)
        .single();

      if (partnerError || !partner) {
        return errorResponse('NOT_FOUND', '파트너를 찾을 수 없습니다.', null, 404);
      }

      // 업데이트 데이터 구성
      const updateData: Record<string, any> = { partner_id };
      if (default_distribution_rate !== undefined) {
        updateData.default_distribution_rate = default_distribution_rate;
      }
      if (collaboration_distribution_rate !== undefined) {
        updateData.collaboration_distribution_rate = collaboration_distribution_rate;
      }

      // upsert로 기존 레코드 업데이트 또는 새 레코드 생성
      const { error: upsertError } = await supabase
        .from('partner_business_info')
        .upsert(updateData, {
          onConflict: 'partner_id'
        });

      if (upsertError) throw upsertError;

      // 업데이트된 정보 조회
      const { data: updatedBusinessInfo } = await supabase
        .from('partner_business_info')
        .select('default_distribution_rate, collaboration_distribution_rate')
        .eq('partner_id', partner_id)
        .single();

      return successResponse({
        message: '파트너 배분 비율이 업데이트되었습니다.',
        partner: {
          id: partner.id,
          partner_name: partner.partner_name,
          partner_status: partner.partner_status,
          default_distribution_rate: updatedBusinessInfo?.default_distribution_rate ?? 100,
          collaboration_distribution_rate: updatedBusinessInfo?.collaboration_distribution_rate ?? 100
        }
      });
    }

    // ===== GET /api-store-collaboration/partners-with-rates - 파트너 목록 및 기본 배분 비율 조회 (Admin) =====
    // 이 엔드포인트는 위에서 이미 처리됨 (is_seller 필터 버전)
    // 아래는 status 필터를 지원하는 버전 - partner_business_info에서 배분율 조회
    if (pathname === '/api-store-collaboration/partners-with-rates-all' && req.method === 'GET') {
      const user = await getAuthUser(req);

      // Admin 확인
      const { data: member } = await supabase
        .from('members')
        .select('role')
        .eq('id', user.id)
        .single();

      if (member?.role !== 'admin') {
        return errorResponse('FORBIDDEN', '관리자만 접근할 수 있습니다.', null, 403);
      }

      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '20');
      const offset = (page - 1) * limit;
      const statusFilter = params.status; // approved, pending, rejected

      let query = supabase
        .from('partners')
        .select(`
          id,
          partner_name,
          partner_status,
          member:members(id, name, profile_image, email),
          business_info:partner_business_info(default_distribution_rate, collaboration_distribution_rate)
        `, { count: 'exact' });

      if (statusFilter) {
        query = query.eq('partner_status', statusFilter);
      }

      const { data, error, count } = await query
        .order('partner_name', { ascending: true })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      // 배분율 데이터 포맷팅
      // deno-lint-ignore no-explicit-any
      const formattedData = (data || []).map((p: any) => ({
        ...p,
        default_distribution_rate: p.business_info?.default_distribution_rate ?? 100,
        collaboration_distribution_rate: p.business_info?.collaboration_distribution_rate ?? 100
      }));

      return successResponse(formattedData, {
        total: count,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      });
    }

    // ===== GET /api-store-collaboration/distribution-rates - 전체 협업 상품 배분 비율 목록 (Admin) =====
    if (pathname === '/api-store-collaboration/distribution-rates' && req.method === 'GET') {
      const user = await getAuthUser(req);

      // Admin 확인
      const { data: member } = await supabase
        .from('members')
        .select('role')
        .eq('id', user.id)
        .single();

      if (member?.role !== 'admin') {
        return errorResponse('FORBIDDEN', '관리자만 접근할 수 있습니다.', null, 403);
      }

      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '20');
      const offset = (page - 1) * limit;

      const { data, error, count } = await supabase
        .from('store_collaboration_requests')
        .select(`
          request_id,
          distribution_rate,
          status,
          created_at,
          product:store_products!store_collaboration_requests_product_id_fkey(product_id, name, price, thumbnail_url, is_active, product_type, shipping_fee_base, shipping_fee_remote),
          partner:partners(id, partner_name, member:members(id, name, profile_image))
        `, { count: 'exact' })
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
    console.error('Store Collaboration API Error:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : '서버 오류가 발생했습니다.',
      null,
      500
    );
  }
});
