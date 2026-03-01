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

    // 인증된 사용자 확인 (관리자 또는 출근부 매니저만 접근 가능)
    let user: any = null;
    try {
      user = await getAuthUser(req);
    } catch (_e) {
      return errorResponse('UNAUTHORIZED', '로그인이 필요합니다.', null, 401);
    }

    if (!user?.id) {
      return errorResponse('UNAUTHORIZED', '로그인이 필요합니다.', null, 401);
    }

    // ============================================
    // 보안: 관리자(admin) 또는 출근부 매니저(partner_manager)만 접근 가능
    // ============================================
    
    // 사용자 역할 확인
    const { data: memberData, error: memberError } = await supabase
      .from('members')
      .select('role')
      .eq('id', user.id)
      .single();

    if (memberError || !memberData) {
      return errorResponse('MEMBER_NOT_FOUND', '회원 정보를 찾을 수 없습니다.', null, 404);
    }

    // 관리자(admin) 확인
    let hasAccess = memberData.role === 'admin';

    // 어드민이 아니면 timesheet_partner_roles에서 partner_manager 역할 확인
    if (!hasAccess) {
      const { data: roleData } = await supabase
        .from('timesheet_partner_roles')
        .select('role_type')
        .eq('member_id', user.id)
        .eq('is_active', true)
        .single();

      hasAccess = roleData?.role_type === 'partner_manager';
    }

    if (!hasAccess) {
      return errorResponse('FORBIDDEN', '접근 권한이 없습니다. 관리자 또는 출근부 매니저만 접근할 수 있습니다.', null, 403);
    }

    // GET /api-partner-search - Search partners
    if (pathname === '/api-partner-search' && req.method === 'GET') {
      const params = getQueryParams(req.url);
      const query = params.q?.trim() || '';
      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '50');

      try {
        // 검색어가 없으면 전체 파트너 반환 (limit 제한 해제)
        const isAllPartners = query.length === 0;
        const effectiveLimit = isAllPartners ? 1000 : limit;
        const offset = (page - 1) * effectiveLimit;

        // partners 테이블에서 검색 (승인된 파트너만)
        let queryBuilder = supabase
          .from('partners')
          .select(`
            id,
            member_id,
            partner_name,
            partner_status,
            members!inner (
              id,
              member_code,
              name,
              profile_image,
              email
            )
          `, { count: 'exact' })
          .eq('partner_status', 'approved');

        // 검색어가 있을 때만 필터 적용 (파트너 이름으로 검색)
        if (query.length > 0) {
          // 검색어 이스케이프 처리 (SQL injection 방지)
          const escapedQuery = query.replace(/%/g, '\\%').replace(/_/g, '\\_');
          queryBuilder = queryBuilder.ilike('partner_name', `%${escapedQuery}%`);
        }

        // 파트너 이름으로 정렬 (null 값은 뒤로)
        queryBuilder = queryBuilder.order('partner_name', { ascending: true, nullsFirst: false });

        const { data: partners, error: searchError, count } = await queryBuilder
          .range(offset, offset + effectiveLimit - 1);

        if (searchError) throw searchError;

        // 응답 형태 정리 (프론트엔드에서 사용하기 쉽게)
        const formattedPartners = (partners || []).map((partner: any) => ({
          id: partner.id,
          member_id: partner.member_id,
          partner_name: partner.partner_name,
          partner_status: partner.partner_status,
          member_code: partner.members?.member_code,
          name: partner.members?.name,
          profile_image: partner.members?.profile_image,
          email: partner.members?.email,
        }));

        return successResponse(formattedPartners, {
          total: count || 0,
          page,
          limit: effectiveLimit,
        });

      } catch (error) {
        return errorResponse('SEARCH_ERROR', 'Failed to search partners', error.message);
      }
    }

    // GET /api-partner-search/:partnerId - Get partner details by ID
    if (pathname.includes('/api-partner-search/') && req.method === 'GET') {
      const parts = pathname.split('/api-partner-search/');
      const partnerId = parts.length > 1 ? parts[1].split('/')[0] : null;

      if (!partnerId) {
        return errorResponse('INVALID_PARTNER_ID', 'Partner ID is required');
      }

      try {
        const { data: partner, error: partnerError } = await supabase
          .from('partners')
          .select(`
            id,
            member_id,
            partner_name,
            partner_status,
            members!inner (
              id,
              member_code,
              name,
              profile_image,
              email
            )
          `)
          .eq('id', partnerId)
          .maybeSingle();

        if (partnerError) throw partnerError;

        if (!partner) {
          return errorResponse('PARTNER_NOT_FOUND', 'Partner not found');
        }

        // 응답 형태 정리
        const formattedPartner = {
          id: partner.id,
          member_id: partner.member_id,
          partner_name: partner.partner_name,
          partner_status: partner.partner_status,
          member_code: (partner.members as any)?.member_code,
          name: (partner.members as any)?.name,
          profile_image: (partner.members as any)?.profile_image,
          email: (partner.members as any)?.email,
        };

        return successResponse(formattedPartner);

      } catch (error) {
        return errorResponse('FETCH_ERROR', 'Failed to fetch partner', error.message);
      }
    }

    return errorResponse('NOT_FOUND', 'Endpoint not found', null, 404);

  } catch (error) {
    return errorResponse('INTERNAL_ERROR', 'Internal server error', error.message, 500);
  }
});
