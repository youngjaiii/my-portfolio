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

    // 인증된 사용자 확인 (관리자 또는 파트너 매니저만 접근 가능)
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

    // GET /api-partner-plus-search - Search partner+ (파트너+ 역할이 있는 파트너만)
    if (pathname === '/api-partner-plus-search' && req.method === 'GET') {
      const params = getQueryParams(req.url);
      const query = params.q?.trim() || '';
      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '50');

      try {
        // 검색어가 없으면 전체 파트너+ 반환 (limit 제한 해제)
        const isAllPartnerPlus = query.length === 0;
        const effectiveLimit = isAllPartnerPlus ? 1000 : limit;
        const offset = (page - 1) * effectiveLimit;

        // 1. 먼저 partner_plus 역할인 member_id 목록 조회
        const { data: partnerPlusMembers, error: rolesError } = await supabase
          .from('timesheet_partner_roles')
          .select('member_id')
          .eq('role_type', 'partner_plus')
          .eq('is_active', true);

        if (rolesError) throw rolesError;

        const partnerPlusMemberIds = (partnerPlusMembers || []).map((r: any) => r.member_id);

        if (partnerPlusMemberIds.length === 0) {
          return successResponse([], {
            total: 0,
            page,
            limit: effectiveLimit,
          });
        }

        // 2. partners 테이블에서 해당 member_id를 가진 승인된 파트너 조회
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
          .eq('partner_status', 'approved')
          .in('member_id', partnerPlusMemberIds);

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

        // 응답 형태 정리 (파트너 정보 기반)
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
        return errorResponse('SEARCH_ERROR', 'Failed to search partner+', error.message);
      }
    }

    // GET /api-partner-plus-search/:id - Get partner+ details by partner ID
    if (pathname.includes('/api-partner-plus-search/') && req.method === 'GET') {
      const parts = pathname.split('/api-partner-plus-search/');
      const partnerId = parts.length > 1 ? parts[1].split('/')[0] : null;

      if (!partnerId) {
        return errorResponse('INVALID_ID', 'Partner ID is required');
      }

      try {
        // 파트너 정보 조회
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
          return errorResponse('NOT_FOUND', 'Partner not found');
        }

        // partner_plus 역할인지 확인
        const { data: roleCheck } = await supabase
          .from('timesheet_partner_roles')
          .select('id')
          .eq('member_id', partner.member_id)
          .eq('role_type', 'partner_plus')
          .eq('is_active', true)
          .maybeSingle();

        if (!roleCheck) {
          return errorResponse('NOT_FOUND', 'Partner+ not found');
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
        return errorResponse('FETCH_ERROR', 'Failed to fetch partner+', error.message);
      }
    }

    return errorResponse('NOT_FOUND', 'Endpoint not found', null, 404);

  } catch (error) {
    return errorResponse('INTERNAL_ERROR', 'Internal server error', error.message, 500);
  }
});
