import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, createSupabaseClient, errorResponse, successResponse, getAuthUser, getQueryParams, parseMultipartFormData, ParsedFile, parseRequestBody } from '../_shared/utils.ts';

// 파일을 버킷에 업로드하고 public URL 반환
const uploadFileToBucket = async (
  supabase: ReturnType<typeof createSupabaseClient>,
  bucketName: string,
  filePath: string,
  file: ParsedFile
): Promise<string> => {
  const { error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(filePath, file.content, {
      contentType: file.mimetype,
      upsert: true
    });

  if (uploadError) {
    throw new Error(`파일 업로드 실패: ${uploadError.message}`);
  }

  // Public URL 생성
  const { data: { publicUrl } } = supabase.storage
    .from(bucketName)
    .getPublicUrl(filePath);

  return publicUrl;
};

// 파일 확장자 추출
const getFileExtension = (filename: string): string => {
  const parts = filename.split('.');
  return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
};

// UUID 생성
const generateUUID = (): string => {
  return crypto.randomUUID();
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const supabase = createSupabaseClient();
    const params = getQueryParams(req.url);

    // ===== GET /api-store-products/terms/status - 스토어 이용약관 동의 상태 확인 =====
    if (pathname === '/api-store-products/terms/status' && req.method === 'GET') {
      const user = await getAuthUser(req);

      // 파트너 확인 및 동의 상태 조회
      const { data: partner, error: partnerError } = await supabase
        .from('partners')
        .select('id, is_seller, store_terms_agreed_at, store_prohibited_items_agreed_at, store_fee_policy_agreed_at, store_privacy_policy_agreed_at')
        .eq('member_id', user.id)
        .single();

      if (partnerError || !partner) {
        return errorResponse('FORBIDDEN', '파트너만 접근할 수 있습니다.', null, 403);
      }

      const termsStatus = {
        is_seller: partner.is_seller || false,
        store_terms_agreed_at: partner.store_terms_agreed_at,
        store_prohibited_items_agreed_at: partner.store_prohibited_items_agreed_at,
        store_fee_policy_agreed_at: partner.store_fee_policy_agreed_at,
        store_privacy_policy_agreed_at: partner.store_privacy_policy_agreed_at,
        all_agreed: !!(
          partner.store_terms_agreed_at &&
          partner.store_prohibited_items_agreed_at &&
          partner.store_fee_policy_agreed_at &&
          partner.store_privacy_policy_agreed_at
        )
      };

      return successResponse(termsStatus);
    }

    // ===== POST /api-store-products/terms/agree - 스토어 이용약관 동의 처리 =====
    if (pathname === '/api-store-products/terms/agree' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await req.json();

      // 파트너 확인
      const { data: partner, error: partnerError } = await supabase
        .from('partners')
        .select('id, partner_status')
        .eq('member_id', user.id)
        .single();

      if (partnerError || !partner) {
        return errorResponse('FORBIDDEN', '파트너만 접근할 수 있습니다.', null, 403);
      }

      if (partner.partner_status !== 'approved') {
        return errorResponse('FORBIDDEN', '승인된 파트너만 이용약관에 동의할 수 있습니다.', null, 403);
      }

      // 동의 항목 검증 (4개 모두 true여야 함)
      const {
        store_terms_agreed,
        store_prohibited_items_agreed,
        store_fee_policy_agreed,
        store_privacy_policy_agreed
      } = body;

      if (!store_terms_agreed || !store_prohibited_items_agreed || !store_fee_policy_agreed || !store_privacy_policy_agreed) {
        return errorResponse('INVALID_REQUEST', '모든 이용약관에 동의해야 합니다. (store_terms_agreed, store_prohibited_items_agreed, store_fee_policy_agreed, store_privacy_policy_agreed)');
      }

      const now = new Date().toISOString();

      // 동의 정보 업데이트 (4개 약관 + is_seller를 true로)
      const { error: updateError } = await supabase
        .from('partners')
        .update({
          store_terms_agreed_at: now,
          store_prohibited_items_agreed_at: now,
          store_fee_policy_agreed_at: now,
          store_privacy_policy_agreed_at: now,
          is_seller: true
        })
        .eq('id', partner.id);

      if (updateError) throw updateError;

      return successResponse({
        message: '스토어 이용약관에 동의되었습니다.',
        is_seller: true,
        agreed_at: now
      });
    }

    // ===== GET /api-store-products - 상품 목록 조회 =====
    // partner_id: 파트너별 상품 조회 (협업 상품 포함)
    // include_collaboration: partner_id와 함께 사용 시 협업 상품 포함 여부 (기본 true)
    if (pathname === '/api-store-products' && req.method === 'GET') {
      const partnerId = params.partner_id;
      const productType = params.product_type; // digital, on_site, delivery
      const source = params.source; // partner, collaboration
      const isActive = params.is_active !== 'false'; // 기본 true
      const includeCollaboration = params.include_collaboration !== 'false'; // 기본 true
      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '20');
      const offset = (page - 1) * limit;

      // partner_id가 있고 협업 상품도 포함해야 하는 경우
      // 협업 상품 복제본은 이미 해당 파트너의 partner_id를 가지고 있으므로 partner_id만으로 필터링
      if (partnerId && includeCollaboration) {
        let query = supabase
          .from('store_products')
          .select(`
            *,
            partner:partners(id, partner_name, member:members(id, name, profile_image)),
            images:store_product_images(image_id, image_url, display_order),
            collaboration_request:store_collaboration_requests!store_collaboration_requests_product_id_fkey(request_id, status, admin_id, distribution_rate, created_at)
          `, { count: 'exact' });

        // partner_id로 필터링 (협업 복제본도 해당 파트너의 partner_id를 가짐)
        query = query.eq('partner_id', partnerId);

        if (productType) {
          query = query.eq('product_type', productType);
        }
        if (source) {
          query = query.eq('source', source);
        }
        if (isActive) {
          query = query.eq('is_active', true);
        }

        const { data, error, count } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;

        // 유저 정보 확인 및 구매/찜 여부 처리
        let userId: string | null = null;
        let isAdmin = false;
        let userPartnerId: string | null = null;

        try {
          const user = await getAuthUser(req);
          userId = user.id;

          const { data: member } = await supabase
            .from('members')
            .select('role')
            .eq('id', user.id)
            .single();
          isAdmin = member?.role === 'admin';

          const { data: partner } = await supabase
            .from('partners')
            .select('id')
            .eq('member_id', user.id)
            .single();
          userPartnerId = partner?.id || null;
        } catch {
          // 인증되지 않은 사용자
        }

        // 파트너 본인/관리자가 아닌 경우에만 구매 여부 및 찜 여부 추가
        if (userId && !isAdmin && data) {
          const { data: confirmedOrderItems } = await supabase
            .from('store_order_items')
            .select('product_id, order:store_orders!inner(user_id)')
            .eq('is_confirmed', true)
            .eq('order.user_id', userId);

          const purchasedProductIds = new Set(confirmedOrderItems?.map((oi: any) => oi.product_id) || []);

          const { data: wishlists } = await supabase
            .from('store_wishlists')
            .select('product_id')
            .eq('member_id', userId);

          const wishlistedProductIds = new Set(wishlists?.map((w: { product_id: string }) => w.product_id) || []);

          for (const product of data) {
            if (userPartnerId && product.partner_id === userPartnerId) {
              (product as any).is_purchased = undefined;
              (product as any).is_wishlisted = undefined;
            } else {
              (product as any).is_purchased = purchasedProductIds.has(product.product_id);
              (product as any).is_wishlisted = wishlistedProductIds.has(product.product_id);
            }
          }
        }

        return successResponse(data, {
          total: count,
          page,
          limit,
          totalPages: Math.ceil((count || 0) / limit)
        });
      }

      // partner_id가 없거나 협업 상품 미포함인 경우 기존 로직
      let query = supabase
        .from('store_products')
        .select(`
          *,
          partner:partners(id, partner_name, member:members(id, name, profile_image)),
          images:store_product_images(image_id, image_url, display_order),
          collaboration_request:store_collaboration_requests!store_collaboration_requests_product_id_fkey(request_id, status, admin_id, distribution_rate, created_at)
        `, { count: 'exact' });

      if (partnerId) {
        query = query.eq('partner_id', partnerId);
      }
      if (productType) {
        query = query.eq('product_type', productType);
      }
      if (source) {
        query = query.eq('source', source);
      }
      if (isActive) {
        query = query.eq('is_active', true);
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      // 유저 정보 확인 및 구매 여부 처리
      let userId: string | null = null;
      let isAdmin = false;
      let userPartnerId: string | null = null;

      try {
        const user = await getAuthUser(req);
        userId = user.id;

        // 관리자 여부 확인
        const { data: member } = await supabase
          .from('members')
          .select('role')
          .eq('id', user.id)
          .single();
        isAdmin = member?.role === 'admin';

        // 파트너 여부 확인
        const { data: partner } = await supabase
          .from('partners')
          .select('id')
          .eq('member_id', user.id)
          .single();
        userPartnerId = partner?.id || null;
      } catch {
        // 인증되지 않은 사용자
      }

      // 파트너 본인/관리자가 아닌 경우에만 구매 여부 및 찜 여부 추가
      if (userId && !isAdmin && data) {
        // 유저의 확정된 주문 아이템 목록 조회 (store_order_items 기준)
        const { data: confirmedOrderItems } = await supabase
          .from('store_order_items')
          .select('product_id, order:store_orders!inner(user_id)')
          .eq('is_confirmed', true)
          .eq('order.user_id', userId);

        const purchasedProductIds = new Set(confirmedOrderItems?.map((oi: any) => oi.product_id) || []);

        // 유저의 찜 목록 조회
        const { data: wishlists } = await supabase
          .from('store_wishlists')
          .select('product_id')
          .eq('member_id', userId);

        const wishlistedProductIds = new Set(wishlists?.map((w: { product_id: string }) => w.product_id) || []);

        // 각 상품에 구매 여부 및 찜 여부 추가
        for (const product of data) {
          // 파트너 본인의 상품이면 is_purchased 필드 추가하지 않음
          if (userPartnerId && product.partner_id === userPartnerId) {
            (product as any).is_purchased = undefined;
            (product as any).is_wishlisted = undefined;
          } else {
            (product as any).is_purchased = purchasedProductIds.has(product.product_id);
            (product as any).is_wishlisted = wishlistedProductIds.has(product.product_id);
          }
        }
      }

      return successResponse(data, {
        total: count,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      });
    }

    // ===== GET /api-store-products/admin/search - 관리자 상품 검색 =====
    // keyword: 상품명 부분 일치 검색 (필수)
    // product_type, source, is_active: 추가 필터 (선택)
    if (pathname === '/api-store-products/admin/search' && req.method === 'GET') {
      // 1. 인증 확인
      const user = await getAuthUser(req);

      // 2. 관리자 권한 확인
      const { data: member, error: memberError } = await supabase
        .from('members')
        .select('role')
        .eq('id', user.id)
        .single();

      if (memberError || member?.role !== 'admin') {
        return errorResponse('FORBIDDEN', '관리자만 접근할 수 있습니다.', null, 403);
      }

      // 3. 파라미터 처리
      const keyword = params.keyword;
      const productType = params.product_type;
      const source = params.source;
      const isActive = params.is_active; // undefined면 전체, 'true'/'false'로 필터
      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '10');
      const offset = (page - 1) * limit;

      if (!keyword || keyword.trim() === '') {
        return errorResponse('INVALID_REQUEST', 'keyword 파라미터가 필요합니다.');
      }

      // 4. 쿼리 생성
      let query = supabase
        .from('store_products')
        .select(`
          *,
          partner:partners(id, partner_name, member:members(id, name, profile_image)),
          images:store_product_images(image_id, image_url, display_order),
          collaboration_request:store_collaboration_requests!store_collaboration_requests_product_id_fkey(request_id, status, admin_id, distribution_rate, created_at)
        `, { count: 'exact' });

      // 상품명 부분 일치 검색 (대소문자 무시)
      query = query.ilike('name', `%${keyword.trim()}%`);

      // 추가 필터
      if (productType) {
        query = query.eq('product_type', productType);
      }
      if (source) {
        query = query.eq('source', source);
      }
      if (isActive === 'true') {
        query = query.eq('is_active', true);
      } else if (isActive === 'false') {
        query = query.eq('is_active', false);
      }
      // isActive가 없으면 전체 조회 (활성/비활성 모두)

      // 5. 페이지네이션 및 정렬
      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      return successResponse(data, {
        total: count,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit),
        keyword: keyword.trim()
      });
    }

    // ===== GET /api-store-products/detail - 상품 상세 조회 (Query Param: product_id) =====
    if (pathname === '/api-store-products/detail' && req.method === 'GET') {
      const productId = params.product_id;

      if (!productId) {
        return errorResponse('INVALID_REQUEST', 'product_id 파라미터가 필요합니다.');
      }

      const { data, error } = await supabase
        .from('store_products')
        .select(`
          *,
          partner:partners(id, partner_name, member:members(id, name, profile_image)),
          images:store_product_images(image_id, image_url, display_order),
          digital_assets:store_digital_assets(asset_id, file_url, file_name, display_order),
          collaboration_request:store_collaboration_requests!store_collaboration_requests_product_id_fkey(request_id, status, admin_id, rejection_reason, created_at, updated_at),
          schedules:store_partner_schedules(schedule_id, start_time, end_time, location, location_point, is_available, current_bookings),
          options:store_product_options(option_id, name, option_type, is_required, display_order, values:store_product_option_values(value_id, value, price_adjustment, stock, display_order))
        `)
        .eq('product_id', productId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return errorResponse('NOT_FOUND', '상품을 찾을 수 없습니다.', null, 404);
        }
        throw error;
      }

      // 파트너 본인이 아닌 경우 digital_assets 숨기기 및 구매 여부 확인
      let isOwner = false;
      let userId: string | null = null;
      let isAdmin = false;

      try {
        const user = await getAuthUser(req);
        userId = user.id;

        // 관리자 여부 확인
        const { data: member } = await supabase
          .from('members')
          .select('role')
          .eq('id', user.id)
          .single();
        isAdmin = member?.role === 'admin';

        const { data: partner } = await supabase
          .from('partners')
          .select('id')
          .eq('member_id', user.id)
          .single();

        if (partner && data.partner_id === partner.id) {
          isOwner = true;
        }
      } catch {
        // 인증되지 않은 사용자는 owner가 아님
      }

      if (!isOwner) {
        data.digital_assets = null;
      }

      // 파트너 본인/관리자가 아닌 경우 구매 여부 및 찜 여부 추가
      if (userId && !isAdmin && !isOwner) {
        // store_order_items 기준으로 구매 여부 확인
        const { data: confirmedOrderItem } = await supabase
          .from('store_order_items')
          .select('order_item_id, order:store_orders!inner(user_id)')
          .eq('product_id', productId)
          .eq('is_confirmed', true)
          .eq('order.user_id', userId)
          .limit(1)
          .maybeSingle();

        (data as any).is_purchased = !!confirmedOrderItem;

        // 찜 여부 확인
        const { data: wishlist } = await supabase
          .from('store_wishlists')
          .select('id')
          .eq('member_id', userId)
          .eq('product_id', productId)
          .maybeSingle();

        (data as any).is_wishlisted = !!wishlist;
      }

      return successResponse(data);
    }

    // ===== POST /api-store-products - 상품 등록 (파트너 또는 Admin, form-data) =====
    if (pathname === '/api-store-products' && req.method === 'POST') {
      const user = await getAuthUser(req);
      
      // form-data 파싱
      const { fields, files } = await parseMultipartFormData(req);

      // 유저 역할 확인
      const { data: member } = await supabase
        .from('members')
        .select('role')
        .eq('id', user.id)
        .single();

      const isAdmin = member?.role === 'admin';
      const isCollaborationProduct = fields.is_collaboration === 'true'; // Admin이 협업 상품으로 등록

      let targetPartnerId: string | null = null;
      let productSource: 'partner' | 'collaboration';
      let isActiveOnCreate: boolean;

      if (isAdmin && isCollaborationProduct) {
        // Admin이 협업 상품 생성 (파트너 없이 등록 가능)
        // 협업 상품은 digital, delivery, on_site 모두 허용
        // partner_id가 없어도 됨 - 나중에 협업 요청 API로 파트너 지정
        targetPartnerId = null;
        productSource = 'collaboration';
        isActiveOnCreate = false; // 협업 상품은 파트너 수락 전까지 비활성
      } else if (isAdmin) {
        // Admin이 일반 상품 등록 (파트너 역할 없이)
        return errorResponse('FORBIDDEN', '관리자는 협업 상품만 등록할 수 있습니다. is_collaboration=true를 설정하세요.', null, 403);
      } else {
        // 일반 파트너가 상품 등록
        const { data: partner, error: partnerError } = await supabase
          .from('partners')
          .select('id, partner_status')
          .eq('member_id', user.id)
          .single();

        if (partnerError || !partner) {
          return errorResponse('FORBIDDEN', '파트너만 상품을 등록할 수 있습니다.', null, 403);
        }

        if (partner.partner_status !== 'approved') {
          return errorResponse('FORBIDDEN', '승인된 파트너만 상품을 등록할 수 있습니다.', null, 403);
        }

        targetPartnerId = partner.id;
        productSource = 'partner';
        isActiveOnCreate = true;
      }

      const name = fields.name;
      const description = fields.description;
      const price = fields.price ? parseInt(fields.price) : null;
      const product_type = fields.product_type;
      const stock = fields.stock ? parseInt(fields.stock) : null;
      // 택배 수령 상품용 배송비 필드
      const shipping_fee_base = fields.shipping_fee_base ? parseInt(fields.shipping_fee_base) : 0;
      const shipping_fee_remote = fields.shipping_fee_remote ? parseInt(fields.shipping_fee_remote) : 0;
      // 묶음배송 가능 여부 (택배수령 상품만 해당, 기본값 true)
      const is_bundle_available = fields.is_bundle_available !== undefined 
        ? fields.is_bundle_available === 'true' 
        : true;
      // 협업 상품 배분율 (기본값 100%)
      const distribution_rate = fields.distribution_rate ? parseInt(fields.distribution_rate) : 100;
      // 현장수령 상품 수령 장소
      const pickup_location = fields.pickup_location || null;
      let pickup_location_point = null;
      if (fields.pickup_location_point) {
        try { pickup_location_point = JSON.parse(fields.pickup_location_point); } catch (_) {}
      }

      // 현장수령 상품용 스케줄 파라미터 (JSON 배열)
      let schedules: Array<{
        start_time: string;
        end_time: string;
        location?: string;
        location_point?: { lat: number; lng: number };
      }> = [];
      
      if (fields.schedules) {
        try {
          schedules = JSON.parse(fields.schedules);
          if (!Array.isArray(schedules)) {
            schedules = [];
          }
        } catch (e) {
          console.error('스케줄 파싱 오류:', e);
          schedules = [];
        }
      }

      // 상품 옵션 파라미터 (JSON 배열) - on_site, delivery 상품만 해당
      let productOptions: Array<{
        name: string;
        option_type: 'select' | 'text';
        is_required: boolean;
        values?: Array<{
          value: string;
          price_adjustment?: number;
          stock?: number;
        }>;
      }> = [];

      if (fields.options) {
        try {
          productOptions = JSON.parse(fields.options);
          if (!Array.isArray(productOptions)) {
            productOptions = [];
          }
        } catch (e) {
          console.error('옵션 파싱 오류:', e);
          productOptions = [];
        }
      }

      if (!name || !price || !product_type) {
        return errorResponse('INVALID_REQUEST', '상품명(name), 가격(price), 상품 유형(product_type)은 필수입니다.');
      }

      // 협업 상품 배분율 검증 (0~100)
      if (isCollaborationProduct && (distribution_rate < 0 || distribution_rate > 100)) {
        return errorResponse('INVALID_REQUEST', 'distribution_rate는 0~100 사이의 값이어야 합니다.');
      }

      // 택배 수령 상품인 경우 배송비 검증
      if (product_type === 'delivery') {
        if (shipping_fee_base < 0 || shipping_fee_remote < 0) {
          return errorResponse('INVALID_REQUEST', '배송비는 0 이상이어야 합니다.');
        }
      }

      // 썸네일 필수 검증 - 모든 상품 유형
      const thumbnailFile = files.find(f => f.fieldName === 'thumbnail');
      if (!thumbnailFile) {
        return errorResponse('INVALID_REQUEST', '썸네일(thumbnail) 이미지는 필수입니다.');
      }

      // 디지털 자산 필수 검증 - 디지털 화보 상품인 경우
      const digitalAssetFiles = files.filter(f => f.fieldName === 'digital_assets' || f.fieldName.startsWith('digital_assets['));
      if (product_type === 'digital' && digitalAssetFiles.length === 0) {
        return errorResponse('INVALID_REQUEST', '디지털 화보 상품은 디지털 자산(digital_assets) 파일이 필수입니다.');
      }

      // 재고 필수 검증 - 현장수령/택배배송 상품인 경우
      if ((product_type === 'on_site' || product_type === 'delivery') && (!stock || stock <= 0)) {
        return errorResponse('INVALID_REQUEST', '현장수령/택배배송 상품은 재고(stock)가 1개 이상이어야 합니다.');
      }

      // 임시 UUID 생성 (상품 생성 전 파일 경로에 사용)
      const tempProductId = generateUUID();
      
      // 썸네일 파일 업로드 처리
      let thumbnail_url: string | null = null;
      if (thumbnailFile) {
        const ext = getFileExtension(thumbnailFile.filename);
        const filePath = `products/${tempProductId}/thumbnail${ext}`;
        thumbnail_url = await uploadFileToBucket(supabase, 'store-assets', filePath, thumbnailFile);
      }

      // 상품 이미지 파일들 업로드 처리
      const imageFiles = files.filter(f => f.fieldName === 'images' || f.fieldName.startsWith('images['));
      const uploadedImages: { image_url: string }[] = [];
      for (let i = 0; i < imageFiles.length; i++) {
        const imgFile = imageFiles[i];
        const ext = getFileExtension(imgFile.filename);
        const filePath = `products/${tempProductId}/images/${i}_${generateUUID()}${ext}`;
        const imageUrl = await uploadFileToBucket(supabase, 'store-assets', filePath, imgFile);
        uploadedImages.push({ image_url: imageUrl });
      }
      const uploadedDigitalAssets: { file_url: string; file_name: string }[] = [];
      for (let i = 0; i < digitalAssetFiles.length; i++) {
        const assetFile = digitalAssetFiles[i];
        const ext = getFileExtension(assetFile.filename);
        const filePath = `products/${tempProductId}/digital_assets/${i}_${generateUUID()}${ext}`;
        const fileUrl = await uploadFileToBucket(supabase, 'store-assets', filePath, assetFile);
        uploadedDigitalAssets.push({ file_url: fileUrl, file_name: assetFile.filename });
      }

      // 상품 생성
      const productInsertData: Record<string, any> = {
        name,
        description,
        price,
        product_type,
        source: productSource,
        stock,
        thumbnail_url,
        is_active: isActiveOnCreate
      };

      // 파트너 ID가 있는 경우에만 추가 (협업 상품은 파트너가 없을 수 있음)
      if (targetPartnerId) {
        productInsertData.partner_id = targetPartnerId;
      }

      // 협업 상품인 경우 배분율 추가
      if (isCollaborationProduct) {
        productInsertData.distribution_rate = distribution_rate;
      }

      // 택배 수령 상품인 경우 배송비 및 묶음배송 정보 추가
      if (product_type === 'delivery') {
        productInsertData.shipping_fee_base = shipping_fee_base;
        productInsertData.shipping_fee_remote = shipping_fee_remote;
        productInsertData.is_bundle_available = is_bundle_available;
      }

      // 현장수령 상품 수령 장소
      if (product_type === 'on_site' && pickup_location) {
        productInsertData.pickup_location = pickup_location;
        if (pickup_location_point) {
          productInsertData.pickup_location_point = pickup_location_point;
        }
      }

      const { data: product, error: productError } = await supabase
        .from('store_products')
        .insert(productInsertData)
        .select()
        .single();

      if (productError) throw productError;

      // 협업 상품의 경우, 협업 요청은 별도 API (/api-store-collaboration/send-requests)로 처리
      // 상품 등록 시에는 협업 요청을 생성하지 않음

      // 이미지 등록
      if (uploadedImages.length > 0) {
        const imageInserts = uploadedImages.map((img, idx) => ({
          product_id: product.product_id,
          image_url: img.image_url,
          display_order: idx
        }));

        await supabase.from('store_product_images').insert(imageInserts);
      }

      // 디지털 파일 등록 (디지털 화보인 경우)
      if (product_type === 'digital' && uploadedDigitalAssets.length > 0) {
        const assetInserts = uploadedDigitalAssets.map((asset, idx) => ({
          product_id: product.product_id,
          file_url: asset.file_url,
          file_name: asset.file_name,
          display_order: idx
        }));

        await supabase.from('store_digital_assets').insert(assetInserts);
      }

      // 상품 옵션 등록 (on_site, delivery 상품만 해당)
      if ((product_type === 'on_site' || product_type === 'delivery') && productOptions.length > 0) {
        for (let optIdx = 0; optIdx < productOptions.length; optIdx++) {
          const opt = productOptions[optIdx];
          if (!opt.name || !opt.option_type) continue;

          // 옵션 그룹 생성
          const { data: optionGroup, error: optionError } = await supabase
            .from('store_product_options')
            .insert({
              product_id: product.product_id,
              name: opt.name,
              option_type: opt.option_type,
              is_required: opt.is_required ?? (opt.option_type === 'select'),
              display_order: optIdx
            })
            .select('option_id')
            .single();

          if (optionError) {
            console.error('옵션 그룹 생성 실패:', optionError);
            continue;
          }

          // select 타입인 경우 옵션 값들 생성
          if (opt.option_type === 'select' && opt.values && opt.values.length > 0) {
            const valueInserts = opt.values.map((val, valIdx) => ({
              option_id: optionGroup.option_id,
              value: val.value,
              price_adjustment: val.price_adjustment || 0,
              stock: val.stock ?? null,
              display_order: valIdx
            }));

            const { error: valuesError } = await supabase
              .from('store_product_option_values')
              .insert(valueInserts);

            if (valuesError) {
              console.error('옵션 값 생성 실패:', valuesError);
            }
          }
        }
      }

      // 현장수령 상품의 스케줄 등록
      if (product_type === 'on_site' && schedules.length > 0 && targetPartnerId) {
        const now = new Date();
        const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        
        const validSchedules = schedules.filter(s => {
          if (!s.start_time || !s.end_time) return false;
          const startDate = new Date(s.start_time);
          const endDate = new Date(s.end_time);
          if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return false;
          if (startDate >= endDate) return false;
          // 과거 날짜 제외
          const startDateUTC = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
          return startDateUTC >= todayUTC;
        });

        if (validSchedules.length > 0) {
          const scheduleInserts = validSchedules.map(s => ({
            product_id: product.product_id,
            partner_id: targetPartnerId,
            start_time: s.start_time,
            end_time: s.end_time,
            location: s.location || null,
            location_point: s.location_point || null,
            is_available: true,
            current_bookings: 0
          }));

          const { error: scheduleError } = await supabase
            .from('store_partner_schedules')
            .insert(scheduleInserts);

          if (scheduleError) {
            console.error('스케줄 등록 실패:', scheduleError);
            // 스케줄 등록 실패해도 상품 등록은 성공으로 처리
          }
        }
      }


      // 협업 on_site 상품: 베이스 schedule 생성 (위치만, 시간 NULL)
      if (product_type === 'on_site' && isCollaborationProduct && pickup_location) {
        const baseScheduleData: Record<string, any> = {
          product_id: product.product_id,
          location: pickup_location,
          is_available: true,
          current_bookings: 0
        };
        if (pickup_location_point) {
          baseScheduleData.location_point = pickup_location_point;
        }
        const { error: baseScheduleError } = await supabase
          .from('store_partner_schedules')
          .insert(baseScheduleData);
        if (baseScheduleError) {
          console.error('협업 상품 베이스 스케줄 생성 실패:', baseScheduleError);
        }
      }

      // 생성된 상품 정보 전체 조회 (images, digital_assets, collaboration_request, schedules, options 포함)
      const { data: fullProduct, error: fetchError } = await supabase
        .from('store_products')
        .select(`
          *,
          partner:partners(id, partner_name, member:members(id, name, profile_image)),
          images:store_product_images(image_id, image_url, display_order),
          digital_assets:store_digital_assets(asset_id, file_url, file_name, display_order),
          collaboration_request:store_collaboration_requests!store_collaboration_requests_product_id_fkey(request_id, status, admin_id, created_at),
          schedules:store_partner_schedules(schedule_id, start_time, end_time, location, location_point, is_available, current_bookings),
          options:store_product_options(option_id, name, option_type, is_required, display_order, values:store_product_option_values(value_id, value, price_adjustment, stock, display_order))
        `)
        .eq('product_id', product.product_id)
        .single();

      if (fetchError) throw fetchError;

      return successResponse(fullProduct);
    }

    // ===== PUT /api-store-products/update - 상품 수정 (Query Param: product_id, form-data) =====
    if (pathname === '/api-store-products/update' && req.method === 'PUT') {
      const user = await getAuthUser(req);
      const productId = params.product_id;

      if (!productId) {
        return errorResponse('INVALID_REQUEST', 'product_id 파라미터가 필요합니다.');
      }

      // form-data 파싱
      const { fields, files } = await parseMultipartFormData(req);

      // 파트너 확인
      const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', user.id)
        .single();

      // 상품 소유권 확인 (parent_product_id, source 포함)
      const { data: existingProduct, error: checkError } = await supabase
        .from('store_products')
        .select('product_id, partner_id, parent_product_id, source, product_type')
        .eq('product_id', productId)
        .single();

      if (checkError || !existingProduct) {
        return errorResponse('NOT_FOUND', '상품을 찾을 수 없습니다.', null, 404);
      }

      // Admin 확인
      const { data: member } = await supabase
        .from('members')
        .select('role')
        .eq('id', user.id)
        .single();

      const isAdmin = member?.role === 'admin';

      if (!isAdmin && (!partner || existingProduct.partner_id !== partner.id)) {
        return errorResponse('FORBIDDEN', '본인의 상품만 수정할 수 있습니다.', null, 403);
      }

      // form-data 필드 추출
      const name = fields.name;
      const description = fields.description;
      const price = fields.price ? parseInt(fields.price) : undefined;
      const stock = fields.stock ? parseInt(fields.stock) : undefined;
      const is_active = fields.is_active !== undefined ? fields.is_active === 'true' : undefined;
      // 택배 수령 상품용 배송비 필드
      const shipping_fee_base = fields.shipping_fee_base !== undefined ? parseInt(fields.shipping_fee_base) : undefined;
      const shipping_fee_remote = fields.shipping_fee_remote !== undefined ? parseInt(fields.shipping_fee_remote) : undefined;
      // 묶음배송 가능 여부 (택배수령 상품만 해당)
      const is_bundle_available = fields.is_bundle_available !== undefined ? fields.is_bundle_available === 'true' : undefined;
      // 협업 상품 배분율 (관리자만 수정 가능)
      const distribution_rate = fields.distribution_rate !== undefined ? parseInt(fields.distribution_rate) : undefined;

      // 현장수령 상품용 스케줄 추가/삭제 파라미터
      let add_schedules: Array<{
        start_time: string;
        end_time: string;
        location?: string;
        location_point?: { lat: number; lng: number };
      }> = [];
      let remove_schedule_ids: string[] = [];
      
      if (fields.add_schedules) {
        try {
          add_schedules = JSON.parse(fields.add_schedules);
          if (!Array.isArray(add_schedules)) add_schedules = [];
        } catch (e) {
          console.error('스케줄 추가 파싱 오류:', e);
          add_schedules = [];
        }
      }
      
      if (fields.remove_schedule_ids) {
        try {
          remove_schedule_ids = JSON.parse(fields.remove_schedule_ids);
          if (!Array.isArray(remove_schedule_ids)) remove_schedule_ids = [];
        } catch (e) {
          console.error('스케줄 삭제 ID 파싱 오류:', e);
          remove_schedule_ids = [];
        }
      }

      // 상품 옵션 파라미터 (JSON 배열) - 전체 교체 방식
      let updateOptions: Array<{
        name: string;
        option_type: 'select' | 'text';
        is_required: boolean;
        values?: Array<{
          value: string;
          price_adjustment?: number;
          stock?: number;
        }>;
      }> | null = null;

      if (fields.options !== undefined) {
        try {
          if (fields.options === '' || fields.options === '[]') {
            updateOptions = []; // 빈 배열이면 기존 옵션 모두 삭제
          } else {
            updateOptions = JSON.parse(fields.options);
            if (!Array.isArray(updateOptions)) {
              updateOptions = null;
            }
          }
        } catch (e) {
          console.error('옵션 파싱 오류:', e);
          updateOptions = null;
        }
      }

      // 상품 업데이트 데이터
      const updateData: Record<string, any> = {};
      if (name !== undefined) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      if (price !== undefined) updateData.price = price;
      if (stock !== undefined) updateData.stock = stock;
      if (is_active !== undefined) updateData.is_active = is_active;
      // 택배 수령 상품 배송비 업데이트
      if (shipping_fee_base !== undefined) updateData.shipping_fee_base = shipping_fee_base;
      if (shipping_fee_remote !== undefined) updateData.shipping_fee_remote = shipping_fee_remote;
      // 묶음배송 가능 여부 업데이트
      if (is_bundle_available !== undefined) updateData.is_bundle_available = is_bundle_available;
      // 협업 상품 배분율 업데이트 (관리자만, 협업 상품만)
      if (isAdmin && existingProduct.source === 'collaboration' && distribution_rate !== undefined) {
        if (distribution_rate < 0 || distribution_rate > 100) {
          return errorResponse('INVALID_REQUEST', 'distribution_rate는 0~100 사이의 값이어야 합니다.');
        }
        updateData.distribution_rate = distribution_rate;
      }

      // 썸네일 파일 업로드 처리
      const thumbnailFile = files.find(f => f.fieldName === 'thumbnail');
      if (thumbnailFile) {
        const ext = getFileExtension(thumbnailFile.filename);
        const filePath = `products/${productId}/thumbnail${ext}`;
        const thumbnailUrl = await uploadFileToBucket(supabase, 'store-assets', filePath, thumbnailFile);
        updateData.thumbnail_url = thumbnailUrl;
      }

      const { data: _updatedProduct, error: updateError } = await supabase
        .from('store_products')
        .update(updateData)
        .eq('product_id', productId)
        .select()
        .single();

      if (updateError) throw updateError;

      // 상품 이미지 파일들 업로드 처리
      const imageFiles = files.filter(f => f.fieldName === 'images' || f.fieldName.startsWith('images['));
      let uploadedImageUrls: string[] = [];
      if (imageFiles.length > 0) {
        // 기존 이미지 삭제
        await supabase.from('store_product_images').delete().eq('product_id', productId);
        
        const uploadedImages: { image_url: string }[] = [];
        for (let i = 0; i < imageFiles.length; i++) {
          const imgFile = imageFiles[i];
          const ext = getFileExtension(imgFile.filename);
          const filePath = `products/${productId}/images/${i}_${generateUUID()}${ext}`;
          const imageUrl = await uploadFileToBucket(supabase, 'store-assets', filePath, imgFile);
          uploadedImages.push({ image_url: imageUrl });
          uploadedImageUrls.push(imageUrl);
        }

        if (uploadedImages.length > 0) {
          const imageInserts = uploadedImages.map((img, idx) => ({
            product_id: productId,
            image_url: img.image_url,
            display_order: idx
          }));
          await supabase.from('store_product_images').insert(imageInserts);
        }
      }

      // 디지털 자산 파일들 업로드 처리
      const digitalAssetFiles = files.filter(f => f.fieldName === 'digital_assets' || f.fieldName.startsWith('digital_assets['));
      let uploadedAssetData: { file_url: string; file_name: string }[] = [];
      if (digitalAssetFiles.length > 0) {
        // 기존 디지털 자산 삭제
        await supabase.from('store_digital_assets').delete().eq('product_id', productId);
        
        const uploadedDigitalAssets: { file_url: string; file_name: string }[] = [];
        for (let i = 0; i < digitalAssetFiles.length; i++) {
          const assetFile = digitalAssetFiles[i];
          const ext = getFileExtension(assetFile.filename);
          const filePath = `products/${productId}/digital_assets/${i}_${generateUUID()}${ext}`;
          const fileUrl = await uploadFileToBucket(supabase, 'store-assets', filePath, assetFile);
          uploadedDigitalAssets.push({ file_url: fileUrl, file_name: assetFile.filename });
        }

        if (uploadedDigitalAssets.length > 0) {
          const assetInserts = uploadedDigitalAssets.map((asset, idx) => ({
            product_id: productId,
            file_url: asset.file_url,
            file_name: asset.file_name,
            display_order: idx
          }));
          await supabase.from('store_digital_assets').insert(assetInserts);
          uploadedAssetData = uploadedDigitalAssets;
        }
      }

      // ===== 상품 옵션 업데이트 (on_site, delivery 상품만) =====
      if ((existingProduct.product_type === 'on_site' || existingProduct.product_type === 'delivery') && updateOptions !== null) {
        // 기존 옵션 모두 삭제 (CASCADE로 option_values도 삭제됨)
        await supabase.from('store_product_options').delete().eq('product_id', productId);

        // 새 옵션 등록
        if (updateOptions.length > 0) {
          for (let optIdx = 0; optIdx < updateOptions.length; optIdx++) {
            const opt = updateOptions[optIdx];
            if (!opt.name || !opt.option_type) continue;

            // 옵션 그룹 생성
            const { data: optionGroup, error: optionError } = await supabase
              .from('store_product_options')
              .insert({
                product_id: productId,
                name: opt.name,
                option_type: opt.option_type,
                is_required: opt.is_required ?? (opt.option_type === 'select'),
                display_order: optIdx
              })
              .select('option_id')
              .single();

            if (optionError) {
              console.error('옵션 그룹 생성 실패:', optionError);
              continue;
            }

            // select 타입인 경우 옵션 값들 생성
            if (opt.option_type === 'select' && opt.values && opt.values.length > 0) {
              const valueInserts = opt.values.map((val, valIdx) => ({
                option_id: optionGroup.option_id,
                value: val.value,
                price_adjustment: val.price_adjustment || 0,
                stock: val.stock ?? null,
                display_order: valIdx
              }));

              const { error: valuesError } = await supabase
                .from('store_product_option_values')
                .insert(valueInserts);

              if (valuesError) {
                console.error('옵션 값 생성 실패:', valuesError);
              }
            }
          }
        }
      }

      // ===== 협업 상품 원본 수정 시 복제된 상품들도 동기화 =====
      let syncedClonedCount = 0;
      const isOriginalCollaborationProduct = existingProduct.source === 'collaboration' && !existingProduct.parent_product_id;
      
      if (isOriginalCollaborationProduct) {
        // 복제된 상품 목록 조회
        const { data: clonedProducts, error: clonedError } = await supabase
          .from('store_products')
          .select('product_id')
          .eq('parent_product_id', productId);

        if (!clonedError && clonedProducts && clonedProducts.length > 0) {
          const clonedIds = clonedProducts.map((p: { product_id: string }) => p.product_id);

          // 동기화할 필드 준비 (is_active 제외 - 복제된 상품의 활성 상태는 개별 관리)
          const syncUpdateData: Record<string, any> = {};
          if (name !== undefined) syncUpdateData.name = name;
          if (description !== undefined) syncUpdateData.description = description;
          if (price !== undefined) syncUpdateData.price = price;
          if (stock !== undefined) syncUpdateData.stock = stock;
          if (shipping_fee_base !== undefined) syncUpdateData.shipping_fee_base = shipping_fee_base;
          if (shipping_fee_remote !== undefined) syncUpdateData.shipping_fee_remote = shipping_fee_remote;
          if (is_bundle_available !== undefined) syncUpdateData.is_bundle_available = is_bundle_available;
          if (updateData.thumbnail_url) syncUpdateData.thumbnail_url = updateData.thumbnail_url;

          // 복제된 상품 기본 정보 동기화
          if (Object.keys(syncUpdateData).length > 0) {
            const { error: syncError } = await supabase
              .from('store_products')
              .update(syncUpdateData)
              .in('product_id', clonedIds);

            if (syncError) {
              console.error('복제된 상품 동기화 실패:', syncError);
            }
          }

          // 이미지 동기화 (새 이미지가 업로드된 경우)
          if (uploadedImageUrls.length > 0) {
            for (const clonedId of clonedIds) {
              // 기존 이미지 삭제
              await supabase.from('store_product_images').delete().eq('product_id', clonedId);
              
              // 원본의 이미지 URL 복사
              const imageInserts = uploadedImageUrls.map((url, idx) => ({
                product_id: clonedId,
                image_url: url,
                display_order: idx
              }));
              await supabase.from('store_product_images').insert(imageInserts);
            }
          }

          // 디지털 자산 동기화 (digital 상품이고 새 자산이 업로드된 경우)
          if (existingProduct.product_type === 'digital' && uploadedAssetData.length > 0) {
            for (const clonedId of clonedIds) {
              // 기존 디지털 자산 삭제
              await supabase.from('store_digital_assets').delete().eq('product_id', clonedId);
              
              // 원본의 디지털 자산 URL 복사
              const assetInserts = uploadedAssetData.map((asset, idx) => ({
                product_id: clonedId,
                file_url: asset.file_url,
                file_name: asset.file_name,
                display_order: idx
              }));
              await supabase.from('store_digital_assets').insert(assetInserts);
            }
          }

          // 옵션 동기화 (on_site/delivery 상품이고 옵션이 업데이트된 경우)
          if ((existingProduct.product_type === 'on_site' || existingProduct.product_type === 'delivery') && updateOptions !== null) {
            // 원본의 새 옵션 조회
            const { data: originalOptions } = await supabase
              .from('store_product_options')
              .select('option_id, name, option_type, is_required, display_order')
              .eq('product_id', productId)
              .order('display_order');

            for (const clonedId of clonedIds) {
              // 복제된 상품의 기존 옵션 삭제
              await supabase.from('store_product_options').delete().eq('product_id', clonedId);

              // 원본의 옵션 복사
              if (originalOptions && originalOptions.length > 0) {
                for (const opt of originalOptions) {
                  // 옵션 그룹 복사
                  const { data: clonedOption, error: cloneOptError } = await supabase
                    .from('store_product_options')
                    .insert({
                      product_id: clonedId,
                      name: opt.name,
                      option_type: opt.option_type,
                      is_required: opt.is_required,
                      display_order: opt.display_order
                    })
                    .select('option_id')
                    .single();

                  if (cloneOptError || !clonedOption) continue;

                  // 옵션 값들 복사 (select 타입만)
                  if (opt.option_type === 'select') {
                    const { data: originalValues } = await supabase
                      .from('store_product_option_values')
                      .select('value, price_adjustment, stock, display_order')
                      .eq('option_id', opt.option_id)
                      .order('display_order');

                    if (originalValues && originalValues.length > 0) {
                      const valueInserts = originalValues.map(val => ({
                        option_id: clonedOption.option_id,
                        value: val.value,
                        price_adjustment: val.price_adjustment,
                        stock: val.stock,
                        display_order: val.display_order
                      }));
                      await supabase.from('store_product_option_values').insert(valueInserts);
                    }
                  }
                }
              }
            }
          }

          syncedClonedCount = clonedProducts.length;
          console.log(`[협업 상품 동기화] 원본=${productId}, 복제된 상품 ${syncedClonedCount}개 동기화 완료`);
        }
      }

      // ===== 현장수령 상품 스케줄 관리 =====
      if (existingProduct.product_type === 'on_site') {
        // 스케줄 삭제 처리
        if (remove_schedule_ids.length > 0) {
          // 예약이 없는 스케줄만 삭제 가능
          const { data: schedulesToDelete } = await supabase
            .from('store_partner_schedules')
            .select('schedule_id, current_bookings')
            .in('schedule_id', remove_schedule_ids)
            .eq('product_id', productId);

          const deletableIds = (schedulesToDelete || [])
            .filter((s: { current_bookings: number }) => (s.current_bookings || 0) === 0)
            .map((s: { schedule_id: string }) => s.schedule_id);

          if (deletableIds.length > 0) {
            await supabase
              .from('store_partner_schedules')
              .delete()
              .in('schedule_id', deletableIds);
          }

          const skippedCount = remove_schedule_ids.length - deletableIds.length;
          if (skippedCount > 0) {
            console.log(`[스케줄 삭제] ${skippedCount}개 스케줄은 예약이 있어 삭제되지 않았습니다.`);
          }
        }

        // 스케줄 추가 처리
        if (add_schedules.length > 0 && existingProduct.partner_id) {
          const now = new Date();
          const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
          
          const validSchedules = add_schedules.filter(s => {
            if (!s.start_time || !s.end_time) return false;
            const startDate = new Date(s.start_time);
            const endDate = new Date(s.end_time);
            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return false;
            if (startDate >= endDate) return false;
            const startDateUTC = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
            return startDateUTC >= todayUTC;
          });

          if (validSchedules.length > 0) {
            const scheduleInserts = validSchedules.map(s => ({
              product_id: productId,
              partner_id: existingProduct.partner_id,
              start_time: s.start_time,
              end_time: s.end_time,
              location: s.location || null,
              location_point: s.location_point || null,
              is_available: true,
              current_bookings: 0
            }));

            const { error: scheduleError } = await supabase
              .from('store_partner_schedules')
              .insert(scheduleInserts);

            if (scheduleError) {
              console.error('스케줄 추가 실패:', scheduleError);
            }
          }
        }
      }

      // 수정된 상품 정보 전체 조회 (images, digital_assets, schedules, options 포함)
      const { data: fullProduct, error: fetchError } = await supabase
        .from('store_products')
        .select(`
          *,
          partner:partners(id, partner_name, member:members(id, name, profile_image)),
          images:store_product_images(image_id, image_url, display_order),
          digital_assets:store_digital_assets(asset_id, file_url, file_name, display_order),
          schedules:store_partner_schedules(schedule_id, start_time, end_time, location, location_point, is_available, current_bookings),
          options:store_product_options(option_id, name, option_type, is_required, display_order, values:store_product_option_values(value_id, value, price_adjustment, stock, display_order))
        `)
        .eq('product_id', productId)
        .single();

      if (fetchError) throw fetchError;

      return successResponse({
        ...fullProduct,
        synced_cloned_products: syncedClonedCount
      });
    }

    // ===== DELETE /api-store-products/delete - 상품 삭제 (Query Param: product_id) =====
    if (pathname === '/api-store-products/delete' && req.method === 'DELETE') {
      const user = await getAuthUser(req);
      const productId = params.product_id;

      if (!productId) {
        return errorResponse('INVALID_REQUEST', 'product_id 파라미터가 필요합니다.');
      }

      // 파트너 확인
      const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', user.id)
        .single();

      // 상품 소유권 확인
      const { data: existingProduct } = await supabase
        .from('store_products')
        .select('product_id, partner_id')
        .eq('product_id', productId)
        .single();

      if (!existingProduct) {
        return errorResponse('NOT_FOUND', '상품을 찾을 수 없습니다.', null, 404);
      }

      // Admin 확인
      const { data: member } = await supabase
        .from('members')
        .select('role')
        .eq('id', user.id)
        .single();

      const isAdmin = member?.role === 'admin';

      if (!isAdmin && (!partner || existingProduct.partner_id !== partner.id)) {
        return errorResponse('FORBIDDEN', '본인의 상품만 삭제할 수 있습니다.', null, 403);
      }

      // 소프트 삭제 (비활성화)
      const { error: deleteError } = await supabase
        .from('store_products')
        .update({ is_active: false })
        .eq('product_id', productId);

      if (deleteError) throw deleteError;

      return successResponse({ message: '상품이 삭제되었습니다.' });
    }

    // ===== GET /api-store-products/partner/my - 파트너 본인 상품 목록 =====
    if (pathname === '/api-store-products/partner/my' && req.method === 'GET') {
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
      const includeInactive = params.include_inactive === 'true';
      const source = params.source; // 'partner' | 'collaboration' | undefined

      let query = supabase
        .from('store_products')
        .select(`
          *,
          images:store_product_images(image_id, image_url, display_order),
          collaboration_request:store_collaboration_requests!store_collaboration_requests_product_id_fkey(request_id, status, admin_id, created_at, cloned_product_id),
          parent_product:store_products!parent_product_id(product_id, name, thumbnail_url)
        `, { count: 'exact' })
        .eq('partner_id', partner.id);

      // source 필터 (partner: 파트너 개인 상품, collaboration: 협업 상품)
      if (source) {
        query = query.eq('source', source);
      }

      if (!includeInactive) {
        query = query.eq('is_active', true);
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

    // ===== POST /api-store-products/terms/agree - 스토어 이용약관 동의 =====
    if (pathname === '/api-store-products/terms/agree' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body) {
        return errorResponse('INVALID_REQUEST', '요청 본문이 필요합니다.');
      }

      const {
        store_terms_agreed,
        store_prohibited_items_agreed,
        store_fee_policy_agreed,
        store_privacy_policy_agreed,
      } = body;

      // 파트너 확인
      const { data: partner, error: partnerError } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', user.id)
        .single();

      if (partnerError || !partner) {
        return errorResponse('FORBIDDEN', '파트너만 접근할 수 있습니다.', null, 403);
      }

      // 동의 정보 업데이트
      const updateData: Record<string, boolean> = {};
      if (store_terms_agreed !== undefined) updateData.store_terms_agreed = store_terms_agreed;
      if (store_prohibited_items_agreed !== undefined) updateData.store_prohibited_items_agreed = store_prohibited_items_agreed;
      if (store_fee_policy_agreed !== undefined) updateData.store_fee_policy_agreed = store_fee_policy_agreed;
      if (store_privacy_policy_agreed !== undefined) updateData.store_privacy_policy_agreed = store_privacy_policy_agreed;

      // 모든 동의가 완료되면 is_seller를 true로 설정
      if (
        store_terms_agreed &&
        store_prohibited_items_agreed &&
        store_fee_policy_agreed &&
        store_privacy_policy_agreed
      ) {
        updateData.is_seller = true;
      }

      const agreedAt = new Date().toISOString();

      const { data: updatedPartner, error: updateError } = await supabase
        .from('partners')
        .update(updateData)
        .eq('id', partner.id)
        .select()
        .single();

      if (updateError) throw updateError;

      return successResponse({
        message: '스토어 이용약관에 동의되었습니다.',
        is_seller: updatedPartner.is_seller || false,
        agreed_at: agreedAt,
      });
    }

    // ===== POST /api-store-products/wishlist - 상품 찜하기 =====
    if (pathname === '/api-store-products/wishlist' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body || !body.product_id) {
        return errorResponse('INVALID_REQUEST', 'product_id는 필수입니다.');
      }

      const { product_id } = body;

      // 상품 존재 확인
      const { data: product, error: productError } = await supabase
        .from('store_products')
        .select('product_id, is_active, name')
        .eq('product_id', product_id)
        .single();

      if (productError || !product) {
        return errorResponse('NOT_FOUND', '상품을 찾을 수 없습니다.', null, 404);
      }

      if (!product.is_active) {
        return errorResponse('INVALID_REQUEST', '비활성 상품은 찜할 수 없습니다.');
      }

      // 이미 찜했는지 확인
      const { data: existingWishlist } = await supabase
        .from('store_wishlists')
        .select('id')
        .eq('member_id', user.id)
        .eq('product_id', product_id)
        .maybeSingle();

      if (existingWishlist) {
        return errorResponse('DUPLICATE', '이미 찜한 상품입니다.');
      }

      // 찜 추가 (트리거가 자동으로 wishlist_count 증가)
      const { data: wishlist, error: insertError } = await supabase
        .from('store_wishlists')
        .insert({
          member_id: user.id,
          product_id
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // 업데이트된 상품 정보 조회
      const { data: updatedProduct } = await supabase
        .from('store_products')
        .select('product_id, name, wishlist_count')
        .eq('product_id', product_id)
        .single();

      return successResponse({
        ...wishlist,
        product: updatedProduct,
        message: '찜 목록에 추가되었습니다.'
      });
    }

    // ===== DELETE /api-store-products/wishlist - 상품 찜 취소 (Query Param: product_id) =====
    if (pathname === '/api-store-products/wishlist' && req.method === 'DELETE') {
      const user = await getAuthUser(req);
      const productId = params.product_id;

      if (!productId) {
        return errorResponse('INVALID_REQUEST', 'product_id 파라미터가 필요합니다.');
      }

      // 찜 삭제 (트리거가 자동으로 wishlist_count 감소)
      const { error: deleteError } = await supabase
        .from('store_wishlists')
        .delete()
        .eq('member_id', user.id)
        .eq('product_id', productId);

      if (deleteError) throw deleteError;

      // 업데이트된 상품 정보 조회
      const { data: updatedProduct } = await supabase
        .from('store_products')
        .select('product_id, name, wishlist_count')
        .eq('product_id', productId)
        .single();

      return successResponse({
        product: updatedProduct,
        message: '찜 목록에서 삭제되었습니다.'
      });
    }

    // ===== GET /api-store-products/wishlist - 내 찜 목록 조회 =====
    if (pathname === '/api-store-products/wishlist' && req.method === 'GET') {
      const user = await getAuthUser(req);
      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '20');
      const offset = (page - 1) * limit;

      const { data, error, count } = await supabase
        .from('store_wishlists')
        .select(`
          *,
          product:store_products(
            product_id, name, description, price, product_type, source, thumbnail_url,
            stock, is_active, wishlist_count, purchase_count,
            partner:partners(id, partner_name, member:members(id, name, profile_image)),
            images:store_product_images(image_id, image_url, display_order)
          )
        `, { count: 'exact' })
        .eq('member_id', user.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      // 활성 상품만 필터링
      const activeWishlists = (data || []).filter((w: { product: { is_active: boolean } | null }) => w.product?.is_active);

      return successResponse(activeWishlists, {
        total: count,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      });
    }

    // ===== GET /api-store-products/wishlist/check - 찜 여부 확인 (Query Param: product_id) =====
    if (pathname === '/api-store-products/wishlist/check' && req.method === 'GET') {
      const user = await getAuthUser(req);
      const productId = params.product_id;

      if (!productId) {
        return errorResponse('INVALID_REQUEST', 'product_id 파라미터가 필요합니다.');
      }

      const { data: wishlist } = await supabase
        .from('store_wishlists')
        .select('id, created_at')
        .eq('member_id', user.id)
        .eq('product_id', productId)
        .maybeSingle();

      return successResponse({
        is_wishlisted: !!wishlist,
        wishlist_id: wishlist?.id || null,
        wishlisted_at: wishlist?.created_at || null
      });
    }

    return errorResponse('NOT_FOUND', '요청한 엔드포인트를 찾을 수 없습니다.', null, 404);

  } catch (error) {
    console.error('Store Products API Error:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : '서버 오류가 발생했습니다.',
      null,
      500
    );
  }
});
