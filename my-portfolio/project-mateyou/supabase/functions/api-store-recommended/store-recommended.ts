import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  corsHeaders,
  createSupabaseClient,
  errorResponse,
  successResponse,
  getAuthUser,
  getQueryParams,
} from '../_shared/utils.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient();
    const url = new URL(req.url);
    const pathname = url.pathname;

    // GET /products - 추천 파트너별 상품 3개씩 JOIN (public)
    if (req.method === 'GET' && pathname.includes('/products')) {
      const { data: recommended, error: recError } = await supabase
        .from('store_recommended')
        .select(`
          id,
          partner_id,
          sort_order,
          created_at,
          partner:partners (
            id,
            partner_name,
            member:members (
              id,
              name,
              profile_image,
              member_code
            )
          )
        `)
        .order('sort_order', { ascending: true });

      if (recError) {
        return errorResponse('DB_ERROR', recError.message, null, 500);
      }

      const result = [];
      for (const rec of recommended || []) {
        const { data: products, error: prodError } = await supabase
          .from('store_products')
          .select('product_id, name, price, thumbnail_url, stock, purchase_count')
          .eq('partner_id', rec.partner_id)
          .eq('is_active', true)
          .or('stock.is.null,stock.gt.0')
          .order('purchase_count', { ascending: false })
          .limit(3);

        if (prodError) {
          console.error('Products fetch error:', prodError);
        }

        result.push({
          ...rec,
          products: products || [],
        });
      }

      return successResponse(result);
    }

    // GET - 추천 파트너 목록 조회 (public)
    if (req.method === 'GET' && (pathname.endsWith('/api-store-recommended') || pathname === '/')) {
      const { data, error } = await supabase
        .from('store_recommended')
        .select(`
          id,
          partner_id,
          sort_order,
          created_at,
          partner:partners (
            id,
            partner_name,
            member:members (
              id,
              name,
              profile_image,
              member_code
            )
          )
        `)
        .order('sort_order', { ascending: true });

      if (error) {
        return errorResponse('DB_ERROR', error.message, null, 500);
      }

      return successResponse(data || []);
    }

    // Admin 권한 필요한 엔드포인트
    const user = await getAuthUser(req);
    const { data: member } = await supabase
      .from('members')
      .select('role')
      .eq('id', user.id)
      .single();

    if (member?.role !== 'admin') {
      return errorResponse('FORBIDDEN', '관리자만 접근할 수 있습니다.', null, 403);
    }

    // PUT - 순서 일괄 변경
    if (req.method === 'PUT' && pathname.includes('/reorder')) {
      const body = await req.json();
      const { items } = body;

      if (!Array.isArray(items)) {
        return errorResponse('INVALID_REQUEST', 'items 배열이 필요합니다.', null, 400);
      }

      for (const item of items) {
        const { error } = await supabase
          .from('store_recommended')
          .update({ sort_order: item.sort_order })
          .eq('id', item.id);

        if (error) {
          return errorResponse('DB_ERROR', error.message, null, 500);
        }
      }

      return successResponse({ message: '순서가 변경되었습니다.' });
    }

    // POST - 추천 파트너 추가
    if (req.method === 'POST') {
      const body = await req.json();

      if (!body.partner_id) {
        return errorResponse('INVALID_REQUEST', 'partner_id가 필요합니다.', null, 400);
      }

      // 파트너 존재 확인
      const { data: partner, error: partnerError } = await supabase
        .from('partners')
        .select('id')
        .eq('id', body.partner_id)
        .single();

      if (partnerError || !partner) {
        return errorResponse('NOT_FOUND', '파트너를 찾을 수 없습니다.', null, 404);
      }

      // 중복 확인
      const { data: existing } = await supabase
        .from('store_recommended')
        .select('id')
        .eq('partner_id', body.partner_id)
        .single();

      if (existing) {
        return errorResponse('DUPLICATE', '이미 추천 목록에 있는 파트너입니다.', null, 400);
      }

      // 현재 최대 sort_order 조회
      const { data: maxOrderData } = await supabase
        .from('store_recommended')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1)
        .single();

      const nextOrder = (maxOrderData?.sort_order ?? -1) + 1;

      const { data, error } = await supabase
        .from('store_recommended')
        .insert({
          partner_id: body.partner_id,
          sort_order: body.sort_order ?? nextOrder,
        })
        .select(`
          id,
          partner_id,
          sort_order,
          created_at,
          partner:partners (
            id,
            partner_name,
            member:members (
              id,
              name,
              profile_image,
              member_code
            )
          )
        `)
        .single();

      if (error) {
        return errorResponse('DB_ERROR', error.message, null, 500);
      }

      return successResponse(data);
    }

    // DELETE - 추천 파트너 삭제
    if (req.method === 'DELETE') {
      const idMatch = pathname.match(/\/([a-f0-9-]+)$/);
      if (!idMatch) {
        return errorResponse('INVALID_REQUEST', 'ID가 필요합니다.', null, 400);
      }
      const id = idMatch[1];

      const { error } = await supabase
        .from('store_recommended')
        .delete()
        .eq('id', id);

      if (error) {
        return errorResponse('DB_ERROR', error.message, null, 500);
      }

      return successResponse({ message: '추천 파트너가 삭제되었습니다.' });
    }

    return errorResponse('NOT_FOUND', '요청한 엔드포인트를 찾을 수 없습니다.', null, 404);
  } catch (error: any) {
    console.error('Error:', error);
    return errorResponse('INTERNAL_ERROR', error.message || '서버 오류가 발생했습니다.', null, 500);
  }
});
