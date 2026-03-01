import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, createSupabaseClient, errorResponse, successResponse, getQueryParams, getAuthUser } from '../_shared/utils.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const supabase = createSupabaseClient();

    // 인증 확인 (선택적)
    let user: any = null;
    try {
      user = await getAuthUser(req);
    } catch (_e) {
      user = null;
    }

    // GET /api-partner-categories/counts - 카테고리별 파트너 수 조회
    if (pathname === '/api-partner-categories/counts' && req.method === 'GET') {
      // 1) 승인된 파트너의 auth user_id 목록 조회 (partners.member_id 가 auth.user_id 참조)
      const { data: partnersData, error: partnersError } = await supabase
        .from('partners')
        .select('member_id')
        .eq('partner_status', 'approved');

      if (partnersError) {
        console.error('Partners fetch error:', partnersError);
        return errorResponse('FETCH_ERROR', 'Failed to fetch partners', partnersError.message);
      }

      const userIds = (partnersData || []).map((p: any) => p.member_id);
      if (!userIds.length) {
        return successResponse({
          counts: {},
          categories: [],
        });
      }

      // 2) partner_categories 기준으로 카테고리별 파트너 수 계산 (user_id = auth.user_id)
      const { data: categoryRows, error: categoriesError } = await supabase
        .from('partner_categories')
        .select('user_id, category_id')
        .in('user_id', userIds)
        .not('category_id', 'is', null);

      if (categoriesError) {
        console.error('Partner categories fetch error:', categoriesError);
        return errorResponse('FETCH_ERROR', 'Failed to fetch partner categories', categoriesError.message);
      }

      const categoryCounts: Record<number, number> = {};
      (categoryRows || []).forEach((row: any) => {
        const catId = row.category_id;
        if (catId != null) {
          categoryCounts[catId] = (categoryCounts[catId] || 0) + 1;
        }
      });

      return successResponse({
        counts: categoryCounts,
        categories: Object.keys(categoryCounts).map((k) => Number(k)),
      });
    }

    // GET /api-partner-categories - 카테고리별 파트너 목록 조회
    if (pathname === '/api-partner-categories' && req.method === 'GET') {
      const params = getQueryParams(req.url);
      const categoryId = params.category_id ? parseInt(params.category_id) : undefined;
      const categoryDetailId = params.detail_category_id ? parseInt(params.detail_category_id) : undefined;
      const limit = Math.min(parseInt(params.limit || '50'), 100);

      // 카테고리 필터가 있는 경우 partner_categories 에서 해당 카테고리를 가진 auth user_id 목록을 먼저 조회
      let filteredUserIds: string[] | null = null;
      const hasCategoryFilter =
        typeof categoryId !== 'undefined' || typeof categoryDetailId !== 'undefined';

      if (hasCategoryFilter) {
        let categoryQuery = supabase
          .from('partner_categories')
          .select('user_id, category_id, detail_category_id')
          .not('user_id', 'is', null);

        if (typeof categoryId !== 'undefined' && !Number.isNaN(categoryId)) {
          categoryQuery = categoryQuery.eq('category_id', categoryId);
        }
        if (typeof categoryDetailId !== 'undefined' && !Number.isNaN(categoryDetailId)) {
          categoryQuery = categoryQuery.eq('detail_category_id', categoryDetailId);
        }

        const { data: categoryRows, error: categoryError } = await categoryQuery;

        if (categoryError) {
          console.error('Partner categories fetch error:', categoryError);
          return errorResponse('FETCH_ERROR', 'Failed to fetch partner categories', categoryError.message);
        }

        const idSet = new Set<string>();
        (categoryRows || []).forEach((row: any) => {
          if (row.user_id) {
            idSet.add(row.user_id);
          }
        });

        filteredUserIds = Array.from(idSet);

        // 해당 카테고리를 가진 파트너가 없다면 바로 빈 결과 반환
        if (!filteredUserIds.length) {
          return successResponse({
            partners: [],
            total: 0,
          });
        }
      }

      let query = supabase
        .from('partners')
        .select(`
          id,
          member_id,
          partner_name,
          partner_message,
          partner_status,
          total_points,
          game_info,
          created_at,
          updated_at,
          background_images,
          follow_count,
          member:members!member_id(
            id,
            member_code,
            name,
            profile_image,
            favorite_game,
            current_status
          )
        `)
        .eq('partner_status', 'approved');

      // partner_categories 기반 필터 적용 (user_id = auth.user_id, partners.member_id 와 조인)
      if (filteredUserIds && filteredUserIds.length) {
        query = query.in('member_id', filteredUserIds);
      }

      const { data: partnersData, error: partnersError } = await query
        .order('created_at', { ascending: false })
        .limit(limit);

      if (partnersError) {
        console.error('Partners fetch error:', partnersError);
        return errorResponse('FETCH_ERROR', 'Failed to fetch partners', partnersError.message);
      }

      // 파트너 ID 목록
      const partnerIds = (partnersData || []).map((p) => p.id);

      // 리뷰 데이터 가져오기 (평균 평점 계산용)
      let reviewsData: any[] = [];
      if (partnerIds.length > 0) {
        const { data, error } = await supabase
          .from('reviews')
          .select('target_partner_id, rating')
          .in('target_partner_id', partnerIds)
          .gt('rating', 0);

        if (!error) {
          reviewsData = data || [];
        }
      }

      // 파트너별 평균 평점 계산
      const ratingMap = new Map<string, { total: number; count: number }>();
      reviewsData.forEach((review) => {
        if (review.target_partner_id && review.rating) {
          const existing = ratingMap.get(review.target_partner_id) || { total: 0, count: 0 };
          existing.total += review.rating;
          existing.count += 1;
          ratingMap.set(review.target_partner_id, existing);
        }
      });

      // 결과에 평균 평점 추가
      const partnersWithRating = (partnersData || []).map((partner) => {
        const stats = ratingMap.get(partner.id);
        return {
          ...partner,
          averageRating: stats && stats.count > 0 ? stats.total / stats.count : null,
          reviewCount: stats?.count || 0,
        };
      });

      return successResponse({
        partners: partnersWithRating,
        total: partnersWithRating.length,
      });
    }

    return errorResponse('ROUTE_NOT_FOUND', 'API route not found', null, 404);

  } catch (error) {
    console.error('Partner Categories API error:', error);
    return errorResponse('INTERNAL_ERROR', 'Internal server error', error.message, 500);
  }
});

