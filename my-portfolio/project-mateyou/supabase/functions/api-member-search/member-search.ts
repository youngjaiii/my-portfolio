import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, createSupabaseClient, errorResponse, getAuthUser, getQueryParams, successResponse } from '../_shared/utils.ts';

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const supabase = createSupabaseClient();

    // ============================================
    // 보안: 관리자(admin)만 접근 가능
    // ============================================
    let user: any = null;
    try {
      user = await getAuthUser(req);
    } catch (_e) {
      return errorResponse('UNAUTHORIZED', '로그인이 필요합니다.', null, 401);
    }

    if (!user?.id) {
      return errorResponse('UNAUTHORIZED', '로그인이 필요합니다.', null, 401);
    }

    // 사용자 역할 확인
    const { data: memberData, error: memberError } = await supabase
      .from('members')
      .select('role')
      .eq('id', user.id)
      .single();

    if (memberError || !memberData) {
      return errorResponse('MEMBER_NOT_FOUND', '회원 정보를 찾을 수 없습니다.', null, 404);
    }

    // 관리자(admin)만 접근 가능
    if (memberData.role !== 'admin') {
      return errorResponse('FORBIDDEN', '접근 권한이 없습니다. 관리자만 접근할 수 있습니다.', null, 403);
    }

    // GET /api-member-search - Search members
    if (pathname === '/api-member-search' && req.method === 'GET') {
      const params = getQueryParams(req.url);
      const query = params.q?.trim() || '';
      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '50');
      const filterRole = params.filterRole; // 'partner' 또는 'admin' 필터링

      try {
        // 검색어가 없으면 전체 멤버 반환 (limit 제한 해제)
        const isAllMembers = query.length === 0;
        const effectiveLimit = isAllMembers ? 1000 : limit;
        const offset = (page - 1) * effectiveLimit;

        let queryBuilder = supabase
          .from('members')
          .select('id, member_code, name, profile_image, current_status, email, role', { count: 'exact' });

        // 검색어가 있을 때만 필터 적용
        if (query.length > 0) {
          // 검색어 이스케이프 처리 (SQL injection 방지)
          const escapedQuery = query.replace(/%/g, '\\%').replace(/_/g, '\\_');
          queryBuilder = queryBuilder.or(
            `name.ilike.%${escapedQuery}%,member_code.ilike.%${escapedQuery}%,email.ilike.%${escapedQuery}%`
          );
        }

        // 역할 필터링
        if (filterRole === 'partner') {
          queryBuilder = queryBuilder.in('role', ['partner', 'admin']);
        } else if (filterRole) {
          queryBuilder = queryBuilder.eq('role', filterRole);
        }

        // 이름으로 정렬 (null 값은 뒤로)
        queryBuilder = queryBuilder.order('name', { ascending: true, nullsFirst: false });

        const { data: members, error: searchError, count } = await queryBuilder
          .range(offset, offset + effectiveLimit - 1);

        if (searchError) throw searchError;

        return successResponse(members || [], {
          total: count || 0,
          page,
          limit: effectiveLimit,
        });

      } catch (error) {
        return errorResponse('SEARCH_ERROR', 'Failed to search members', error.message);
      }
    }

    // GET /api-member-search/:memberId - Get member details by ID
    if (pathname.includes('/api-member-search/') && req.method === 'GET') {
      const parts = pathname.split('/api-member-search/');
      const memberId = parts.length > 1 ? parts[1].split('/')[0] : null;

      if (!memberId) {
        return errorResponse('INVALID_MEMBER_ID', 'Member ID is required');
      }

      try {
        const { data: member, error: memberFetchError } = await supabase
          .from('members')
          .select('id, member_code, name, profile_image, current_status, email, role')
          .eq('id', memberId)
          .maybeSingle();

        if (memberFetchError) throw memberFetchError;

        if (!member) {
          return errorResponse('MEMBER_NOT_FOUND', 'Member not found');
        }

        return successResponse(member);

      } catch (error) {
        return errorResponse('FETCH_ERROR', 'Failed to fetch member', error.message);
      }
    }

    return errorResponse('NOT_FOUND', 'Endpoint not found', null, 404);

  } catch (error) {
    return errorResponse('INTERNAL_ERROR', 'Internal server error', error.message, 500);
  }
});
