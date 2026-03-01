import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, createSupabaseClient, errorResponse, successResponse, getAuthUser, parseRequestBody, getQueryParams } from '../_shared/utils.ts';

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const supabase = createSupabaseClient();

    // PUBLIC ENDPOINT: GET /api-admin/public/banners - Get active banners (no auth required)
    if (pathname === '/api-admin/public/banners' && req.method === 'GET') {
      const params = getQueryParams(req.url);
      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '20');
      const offset = (page - 1) * limit;
      const location = params.location; // 'main' | 'partner_dashboard'

      try {
        let query = supabase
          .from('ad_banners')
          .select('*', { count: 'exact' })
          .eq('is_active', true)
          .order('created_at', { ascending: false });

        // 위치 필터링 (있는 경우)
        if (location) {
          query = query.eq('display_location', location);
        }

        const { data: banners, error: bannersError, count } = await query
          .range(offset, offset + limit - 1);

        if (bannersError) throw bannersError;

        // 서버 측 시간 필터링 (start_at, end_at 기준)
        const now = new Date();
        const validBanners = (banners || []).filter((banner) => {
          // 시작 시간 체크: start_at이 있고 현재 시간이 시작 시간 이전이면 제외
          if (banner.start_at) {
            const startTime = new Date(banner.start_at);
            if (now < startTime) return false;
          }
          // 종료 시간 체크: end_at이 있고 현재 시간이 종료 시간 이후면 제외
          if (banner.end_at) {
            const endTime = new Date(banner.end_at);
            if (now > endTime) return false;
          }
          return true;
        });

        return successResponse(validBanners, {
          total: validBanners.length,
          page,
          limit,
          totalPages: Math.ceil(validBanners.length / limit)
        });

      } catch (error) {
        console.error('Banner fetch error:', error);
        return errorResponse('BANNERS_FETCH_ERROR', 'Failed to fetch banners', error.message);
      }
    }

    // Check if user is admin (for all other endpoints)
    const user = await getAuthUser(req);

    // Verify admin role
    const { data: memberData, error: memberError } = await supabase
      .from('members')
      .select('role')
      .eq('id', user.id)
      .single();

    if (memberError || memberData.role !== 'admin') {
      return errorResponse('UNAUTHORIZED', 'Admin access required', null, 403);
    }

    // GET /api-admin/partners - Get all partners with status filter
    if (pathname === '/api-admin/partners' && req.method === 'GET') {
      const params = getQueryParams(req.url);
      const status = params.status;
      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '20');
      const offset = (page - 1) * limit;

      try {
        let query = supabase
          .from('partners')
          .select(`
            *,
            member:members!member_id(*)
          `, { count: 'exact' });

        if (status) {
          query = query.eq('partner_status', status);
        }

        const { data: partners, error: partnersError, count } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (partnersError) throw partnersError;

        return successResponse(partners || [], {
          total: count || 0,
          page,
          limit,
        });

      } catch (error) {
        return errorResponse('PARTNERS_FETCH_ERROR', 'Failed to fetch partners', error.message);
      }
    }

    // GET /api-admin/partners/{memberId} - Get single partner detail with business info
    if (pathname.match(/\/api-admin\/partners\/[^\/]+$/) && req.method === 'GET') {
      const memberId = pathname.split('/partners/')[1];

      if (!memberId) {
        return errorResponse('INVALID_MEMBER_ID', 'Member ID is required');
      }

      try {
        // 파트너 정보 조회 (member, partner_business_info 포함)
        const { data: partner, error: partnerError } = await supabase
          .from('partners')
          .select(`
            *,
            member:members!member_id(*),
            partner_business_info(*)
          `)
          .eq('member_id', memberId)
          .single();

        if (partnerError) {
          if (partnerError.code === 'PGRST116') {
            return errorResponse('PARTNER_NOT_FOUND', 'Partner not found', null, 404);
          }
          throw partnerError;
        }

        return successResponse(partner);

      } catch (error) {
        return errorResponse('PARTNER_FETCH_ERROR', 'Failed to fetch partner detail', error.message);
      }
    }

    // PUT /api-admin/partners/{memberId}/status - Update partner status
    // partnerId는 이제 members.id를 받습니다 (partners.member_id로 조회)
    if (pathname.includes('/partners/') && pathname.includes('/status') && req.method === 'PUT') {
      const memberId = pathname.split('/partners/')[1].split('/status')[0];
      const body = await parseRequestBody(req);

      if (!memberId) {
        return errorResponse('INVALID_MEMBER_ID', 'Member ID is required');
      }

      if (!body || !body.status) {
        return errorResponse('INVALID_BODY', 'Status is required');
      }

      const { status } = body;

      // Validate status
      if (!['pending', 'approved', 'rejected'].includes(status)) {
        return errorResponse('INVALID_STATUS', 'Invalid status value');
      }

      try {
        const updateData: any = {
          partner_status: status,
          partner_reviewed_at: new Date().toISOString(),
        };

        // members.id로 partners 정보 업데이트 (partners.member_id로 조회)
        const { data: updatedPartner, error: updateError } = await supabase
          .from('partners')
          .update(updateData)
          .eq('member_id', memberId)  // partners.id → partners.member_id로 변경
          .select(`
            *,
            member:members!member_id(*)
          `)
          .single();

        if (updateError) throw updateError;

        // 추천인 보너스는 출금 승인 시점에 지급 (PUT /api-admin/withdrawals/:id/status)

        return successResponse({
          partner: updatedPartner,
          message: 'Partner status updated successfully',
        });

      } catch (error) {
        return errorResponse('PARTNER_UPDATE_ERROR', 'Failed to update partner status', error.message);
      }
    }

    // PUT /api-admin/partners/{memberId}/tax - Update partner tax
    // partnerId는 이제 members.id를 받습니다 (partners.member_id로 조회)
    // tax는 partner_business_info 테이블에서 관리
    if (pathname.includes('/partners/') && pathname.includes('/tax') && req.method === 'PUT') {
      const memberId = pathname.split('/partners/')[1].split('/tax')[0];
      const body = await parseRequestBody(req);

      if (!memberId) {
        return errorResponse('INVALID_MEMBER_ID', 'Member ID is required');
      }

      if (!body || body.tax === undefined) {
        return errorResponse('INVALID_BODY', 'Tax value is required');
      }

      const { tax } = body;

      // Validate tax value
      if (typeof tax !== 'number' || tax < 0 || tax > 100) {
        return errorResponse('INVALID_TAX', 'Tax must be a number between 0 and 100');
      }

      try {
        // 1. 먼저 partner_id 조회
        const { data: partnerData, error: partnerError } = await supabase
          .from('partners')
          .select('id')
          .eq('member_id', memberId)
          .single();

        if (partnerError) {
          if (partnerError.code === 'PGRST116') {
            return errorResponse('PARTNER_NOT_FOUND', 'Partner not found', null, 404);
          }
          throw partnerError;
        }

        // 2. partner_business_info.tax 업데이트 (upsert)
        const { error: upsertError } = await supabase
          .from('partner_business_info')
          .upsert({
            partner_id: partnerData.id,
            tax,
          }, {
            onConflict: 'partner_id',
          });

        if (upsertError) throw upsertError;

        // 3. 업데이트된 파트너 정보 조회 (partner_business_info 포함)
        const { data: updatedPartner, error: fetchError } = await supabase
          .from('partners')
          .select(`
            *,
            member:members!member_id(*),
            partner_business_info(*)
          `)
          .eq('member_id', memberId)
          .single();

        if (fetchError) throw fetchError;

        return successResponse({
          partner: updatedPartner,
          message: 'Partner tax updated successfully',
        });

      } catch (error) {
        return errorResponse('PARTNER_TAX_UPDATE_ERROR', 'Failed to update partner tax', error.message);
      }
    }

    // DELETE /api-admin/partners/{partnerId} - Delete partner
    if (pathname.includes('/partners/') && req.method === 'DELETE') {
      const partnerId = pathname.split('/partners/')[1];

      if (!partnerId) {
        return errorResponse('INVALID_PARTNER_ID', 'Partner ID is required');
      }

      try {
        // Get partner info first
        const { data: partnerData, error: partnerError } = await supabase
          .from('partners')
          .select('member_id')
          .eq('id', partnerId)
          .single();

        if (partnerError) {
          if (partnerError.code === 'PGRST116') {
            return errorResponse('PARTNER_NOT_FOUND', 'Partner not found');
          }
          throw partnerError;
        }

        // Delete partner record
        const { error: deleteError } = await supabase
          .from('partners')
          .delete()
          .eq('id', partnerId);

        if (deleteError) throw deleteError;

        return successResponse({
          message: 'Partner deleted successfully',
          partnerId,
          memberId: partnerData.member_id,
        });

      } catch (error) {
        return errorResponse('PARTNER_DELETE_ERROR', 'Failed to delete partner', error.message);
      }
    }

    // DELETE /api-admin/members/{memberId}/partner - Delete partner by member ID
    if (pathname.includes('/members/') && pathname.includes('/partner') && req.method === 'DELETE') {
      const memberId = pathname.split('/members/')[1].split('/partner')[0];

      if (!memberId) {
        return errorResponse('INVALID_MEMBER_ID', 'Member ID is required');
      }

      try {
        // First check if partner exists for this member
        const { data: partnerData, error: checkError } = await supabase
          .from('partners')
          .select('id')
          .eq('member_id', memberId)
          .single();

        if (checkError) {
          if (checkError.code === 'PGRST116') {
            // Partner not found, but still update member role to 'normal'
            const { error: memberUpdateError } = await supabase
              .from('members')
              .update({ role: 'normal' })
              .eq('id', memberId);

            if (memberUpdateError) throw memberUpdateError;

            return successResponse({
              message: 'Member role updated to normal (no partner record found)',
              memberId,
            });
          }
          throw checkError;
        }

        // Delete partner record by member ID
        const { data: deletedPartner, error: deleteError } = await supabase
          .from('partners')
          .delete()
          .eq('member_id', memberId)
          .select('id')
          .single();

        if (deleteError) throw deleteError;

        // Update member role to 'normal'
        const { error: memberUpdateError } = await supabase
          .from('members')
          .update({ role: 'normal' })
          .eq('id', memberId);

        if (memberUpdateError) throw memberUpdateError;

        return successResponse({
          message: 'Partner deleted and member role updated to normal successfully',
          partnerId: deletedPartner.id,
          memberId,
        });

      } catch (error) {
        return errorResponse('PARTNER_DELETE_ERROR', 'Failed to delete partner', error.message);
      }
    }

    // GET /api-admin/banners - Get all banners
    if (pathname === '/api-admin/banners' && req.method === 'GET') {
      const params = getQueryParams(req.url);
      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '20');
      const offset = (page - 1) * limit;

      try {
        const { data: banners, error: bannersError, count } = await supabase
          .from('ad_banners')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (bannersError) throw bannersError;

        return successResponse(banners || [], {
          total: count || 0,
          page,
          limit,
        });

      } catch (error) {
        return errorResponse('BANNERS_FETCH_ERROR', 'Failed to fetch banners', error.message);
      }
    }

    // POST /api-admin/banners - Create banner
    if (pathname === '/api-admin/banners' && req.method === 'POST') {
      const body = await parseRequestBody(req);

      if (!body || !body.title || !body.image_url) {
        return errorResponse('INVALID_BODY', 'Title and image URL are required');
      }

      const { title, description, image_url, link_url, is_active = true } = body;

      try {
        const { data: newBanner, error: createError } = await supabase
          .from('ad_banners')
          .insert({
            title: title.trim(),
            description: description?.trim() || null,
            image_url: image_url.trim(),
            link_url: link_url?.trim() || null,
            is_active,
          })
          .select()
          .single();

        if (createError) throw createError;

        return successResponse({
          banner: newBanner,
          message: 'Banner created successfully',
        });

      } catch (error) {
        return errorResponse('BANNER_CREATE_ERROR', 'Failed to create banner', error.message);
      }
    }

    // PUT /api-admin/banners/{bannerId} - Update banner
    if (pathname.includes('/banners/') && req.method === 'PUT') {
      const bannerId = pathname.split('/banners/')[1];
      const body = await parseRequestBody(req);

      if (!bannerId) {
        return errorResponse('INVALID_BANNER_ID', 'Banner ID is required');
      }

      if (!body) {
        return errorResponse('INVALID_BODY', 'Request body is required');
      }

      try {
        const updateData: any = {};
        if (body.title !== undefined) updateData.title = body.title.trim();
        if (body.description !== undefined) updateData.description = body.description?.trim() || null;
        if (body.image_url !== undefined) updateData.image_url = body.image_url.trim();
        if (body.link_url !== undefined) updateData.link_url = body.link_url?.trim() || null;
        if (body.is_active !== undefined) updateData.is_active = body.is_active;

        const { data: updatedBanner, error: updateError } = await supabase
          .from('ad_banners')
          .update(updateData)
          .eq('id', bannerId)
          .select()
          .single();

        if (updateError) throw updateError;

        return successResponse({
          banner: updatedBanner,
          message: 'Banner updated successfully',
        });

      } catch (error) {
        return errorResponse('BANNER_UPDATE_ERROR', 'Failed to update banner', error.message);
      }
    }

    // DELETE /api-admin/banners/{bannerId} - Delete banner
    if (pathname.includes('/banners/') && req.method === 'DELETE') {
      const bannerId = pathname.split('/banners/')[1];

      if (!bannerId) {
        return errorResponse('INVALID_BANNER_ID', 'Banner ID is required');
      }

      try {
        const { error: deleteError } = await supabase
          .from('ad_banners')
          .delete()
          .eq('id', bannerId);

        if (deleteError) throw deleteError;

        return successResponse({
          message: 'Banner deleted successfully',
          bannerId,
        });

      } catch (error) {
        return errorResponse('BANNER_DELETE_ERROR', 'Failed to delete banner', error.message);
      }
    }

    // GET /api-admin/withdrawals - Get withdrawal requests
    if (pathname === '/api-admin/withdrawals' && req.method === 'GET') {
      const params = getQueryParams(req.url);
      const status = params.status;
      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '20');
      const offset = (page - 1) * limit;

      try {
        let query = supabase
          .from('partner_withdrawals')
          .select(`
            *,
            partner:partners!partner_id(
              *,
              member:members!member_id(*)
            )
          `, { count: 'exact' });

        if (status) {
          query = query.eq('status', status);
        }

        const { data: withdrawals, error: withdrawalsError, count } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (withdrawalsError) throw withdrawalsError;

        // 각 출금 건에 파트너 티어 정보 추가
        const partnerIds = [...new Set((withdrawals || []).map((w: any) => w.partner_id).filter(Boolean))];
        const tierMap = new Map<string, { tier_code: string; tier_frozen: boolean }>();
        const feeMap = new Map<string, number>();

        if (partnerIds.length > 0) {
          // partner_tier_current 조회
          const { data: tierData } = await supabase
            .from('partner_tier_current')
            .select('partner_id, tier_code, tier_frozen')
            .in('partner_id', partnerIds);
          for (const t of (tierData || [])) {
            tierMap.set(t.partner_id, {
              tier_code: t.tier_frozen ? 'bronze' : (t.tier_code || 'bronze'),
              tier_frozen: t.tier_frozen || false,
            });
          }

          // fee_policy 전체 조회
          const { data: feeData } = await supabase
            .from('fee_policy')
            .select('tier_code, partner_share_pct');
          for (const f of (feeData || [])) {
            feeMap.set(f.tier_code, Number(f.partner_share_pct));
          }
        }

        const enrichedWithdrawals = (withdrawals || []).map((w: any) => {
          const tier = tierMap.get(w.partner_id);
          const tierCode = tier?.tier_code || 'bronze';
          const partnerSharePct = feeMap.get(tierCode) ?? 75;
          return {
            ...w,
            tier_code: tierCode,
            applicable_rate: partnerSharePct,
            rate_type: `tier_${tierCode}`,
          };
        });

        return successResponse(enrichedWithdrawals, {
          total: count || 0,
          page,
          limit,
        });

      } catch (error) {
        return errorResponse('WITHDRAWALS_FETCH_ERROR', 'Failed to fetch withdrawals', error.message);
      }
    }

    // PUT /api-admin/withdrawals/{withdrawalId}/status - Update withdrawal status
    if (pathname.includes('/withdrawals/') && pathname.includes('/status') && req.method === 'PUT') {
      const withdrawalId = pathname.split('/withdrawals/')[1].split('/status')[0];
      const body = await parseRequestBody(req);

      if (!withdrawalId) {
        return errorResponse('INVALID_WITHDRAWAL_ID', 'Withdrawal ID is required');
      }

      if (!body || !body.status) {
        return errorResponse('INVALID_BODY', 'Status is required');
      }

      const { status, admin_notes } = body;

      // Validate status
      if (!['pending', 'approved', 'rejected', 'completed'].includes(status)) {
        return errorResponse('INVALID_STATUS', 'Invalid status value');
      }

      try {
        const updateData: any = {
          status,
          processed_at: new Date().toISOString(),
        };

        if (admin_notes) {
          updateData.admin_notes = admin_notes.trim();
        }

        const { data: updatedWithdrawal, error: updateError } = await supabase
          .from('partner_withdrawals')
          .update(updateData)
          .eq('id', withdrawalId)
          .select(`
            *,
            partner:partners!partner_id(
              *,
              member:members!member_id(*)
            )
          `)
          .single();

        if (updateError) throw updateError;

        // 출금 승인 시 추천인에게 0.5% 보너스 지급
        if (status === 'approved' && updatedWithdrawal?.partner?.referrer_member_code) {
          try {
            const referrerCode = updatedWithdrawal.partner.referrer_member_code;
            const requestedAmount = updatedWithdrawal.requested_amount;
            const bonusRate = 0.005; // 0.5%
            const bonusAmount = Math.floor(requestedAmount * bonusRate);

            if (bonusAmount > 0) {
              const { data: referrer } = await supabase
                .from('members')
                .select('id, total_points')
                .eq('member_code', referrerCode)
                .single();

              if (referrer) {
                const pointsBefore = referrer.total_points || 0;

                // 1. 추천인 포인트 업데이트
                await supabase
                  .from('members')
                  .update({ total_points: pointsBefore + bonusAmount })
                  .eq('id', referrer.id);

                // 2. member_points_logs 기록
                await supabase
                  .from('member_points_logs')
                  .insert({
                    member_id: referrer.id,
                    log_id: `referral_withdrawal_${updatedWithdrawal.id}`,
                    type: 'earn',
                    amount: bonusAmount,
                    description: '추천 파트너 출금 보너스 (0.5%)',
                  });

                // 3. referral_bonus_logs 기록 (withdrawal_id 포함)
                await supabase
                  .from('referral_bonus_logs')
                  .insert({
                    referrer_member_id: referrer.id,
                    referred_partner_id: updatedWithdrawal.partner.id,
                    points_before: pointsBefore,
                    points_after: pointsBefore + bonusAmount,
                    bonus_amount: bonusAmount,
                    withdrawal_id: updatedWithdrawal.id,
                  });

                console.log(`Referrer bonus paid: ${bonusAmount}P to ${referrer.id} for withdrawal ${updatedWithdrawal.id}`);
              }
            }
          } catch (bonusErr) {
            console.error('Referrer withdrawal bonus error:', bonusErr);
            // 보너스 지급 실패해도 출금 승인은 계속 진행
          }
        }

        return successResponse({
          withdrawal: updatedWithdrawal,
          message: 'Withdrawal status updated successfully',
        });

      } catch (error) {
        return errorResponse('WITHDRAWAL_UPDATE_ERROR', 'Failed to update withdrawal status', error.message);
      }
    }

    // GET /api-admin/members - Get all members with role filter
    if (pathname === '/api-admin/members' && req.method === 'GET') {
      const params = getQueryParams(req.url);
      const role = params.role;
      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '100'); // 높은 제한으로 설정
      const offset = (page - 1) * limit;

      try {
        let query = supabase
          .from('members')
          .select('*', { count: 'exact' });

        if (role) {
          query = query.eq('role', role);
        }

        const { data: members, error: membersError, count } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (membersError) throw membersError;

        return successResponse(members || [], {
          total: count || 0,
          page,
          limit,
        });

      } catch (error) {
        return errorResponse('MEMBERS_FETCH_ERROR', 'Failed to fetch members', error.message);
      }
    }

    // GET /api-admin/stats - Get admin dashboard statistics
    if (pathname === '/api-admin/stats' && req.method === 'GET') {
      try {
        // Get partner statistics
        const { data: partnerStats, error: partnerStatsError } = await supabase
          .from('partners')
          .select('partner_status');

        if (partnerStatsError) throw partnerStatsError;

        // Get member count
        const { count: memberCount, error: memberCountError } = await supabase
          .from('members')
          .select('id', { count: 'exact' });

        if (memberCountError) throw memberCountError;

        // Get withdrawal statistics
        const { data: withdrawalStats, error: withdrawalStatsError } = await supabase
          .from('partner_withdrawals')
          .select('status');

        if (withdrawalStatsError) throw withdrawalStatsError;

        // Get banner count
        const { count: bannerCount, error: bannerCountError } = await supabase
          .from('ad_banners')
          .select('id', { count: 'exact' });

        if (bannerCountError) throw bannerCountError;

        // Calculate statistics
        const stats = {
          members: {
            total: memberCount || 0,
          },
          partners: {
            total: partnerStats?.length || 0,
            pending: partnerStats?.filter(p => p.partner_status === 'pending').length || 0,
            approved: partnerStats?.filter(p => p.partner_status === 'approved').length || 0,
            rejected: partnerStats?.filter(p => p.partner_status === 'rejected').length || 0,
          },
          withdrawals: {
            total: withdrawalStats?.length || 0,
            pending: withdrawalStats?.filter(w => w.status === 'pending').length || 0,
            approved: withdrawalStats?.filter(w => w.status === 'approved').length || 0,
            completed: withdrawalStats?.filter(w => w.status === 'completed').length || 0,
            rejected: withdrawalStats?.filter(w => w.status === 'rejected').length || 0,
          },
          banners: {
            total: bannerCount || 0,
          },
        };

        return successResponse(stats);

      } catch (error) {
        return errorResponse('STATS_ERROR', 'Failed to fetch admin statistics', error.message);
      }
    }

    // GET /api-admin/member-points-logs - Get member points logs
    if (pathname === '/api-admin/member-points-logs' && req.method === 'GET') {
      const params = getQueryParams(req.url);
      const page = parseInt(params.page || '1');
      const limit = Math.min(parseInt(params.limit || '20'), 1000);
      const offset = (page - 1) * limit;
      const type = params.type;
      const search = params.search;
      const startDate = params.start_date;
      const endDate = params.end_date;

      try {
        let query = supabase
          .from('member_points_logs')
          .select(`
            *,
            member:members!member_id(name, member_code)
          `, { count: 'exact' });

        if (type && ['earn', 'spend', 'withdraw'].includes(type)) {
          query = query.eq('type', type);
        }

        if (startDate) {
          query = query.gte('created_at', `${startDate}T00:00:00`);
        }

        if (endDate) {
          query = query.lte('created_at', `${endDate}T23:59:59`);
        }

        if (search) {
          query = query.or(`description.ilike.%${search}%`);
        }

        const { data: logs, error: logsError, count } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (logsError) throw logsError;

        const formattedLogs = (logs || []).map(log => ({
          ...log,
          member_name: log.member?.name || null,
          member_code: log.member?.member_code || null,
          member: undefined,
        }));

        return successResponse(formattedLogs, {
          total: count || 0,
          page,
          limit,
        });

      } catch (error) {
        return errorResponse('MEMBER_POINTS_LOGS_ERROR', 'Failed to fetch member points logs', error.message);
      }
    }

    // GET /api-admin/partner-points-logs - Get partner points logs
    if (pathname === '/api-admin/partner-points-logs' && req.method === 'GET') {
      const params = getQueryParams(req.url);
      const page = parseInt(params.page || '1');
      const limit = Math.min(parseInt(params.limit || '20'), 1000);
      const offset = (page - 1) * limit;
      const type = params.type;
      const search = params.search;
      const startDate = params.start_date;
      const endDate = params.end_date;

      try {
        let query = supabase
          .from('partner_points_logs')
          .select(`
            *,
            partner:partners!partner_id(
              member:members!member_id(name)
            )
          `, { count: 'exact' });

        if (type && ['earn', 'spend', 'withdraw'].includes(type)) {
          query = query.eq('type', type);
        }

        if (startDate) {
          query = query.gte('created_at', `${startDate}T00:00:00`);
        }

        if (endDate) {
          query = query.lte('created_at', `${endDate}T23:59:59`);
        }

        if (search) {
          query = query.or(`description.ilike.%${search}%`);
        }

        const { data: logs, error: logsError, count } = await query
          .not('description', 'ilike', '%total_points changed%')
          .not('description', 'ilike', '%총 포인트 변경%')
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (logsError) throw logsError;

        const formattedLogs = (logs || []).map(log => ({
          ...log,
          partner_name: log.partner?.member?.name || null,
          partner: undefined,
        }));

        return successResponse(formattedLogs, {
          total: count || 0,
          page,
          limit,
        });

      } catch (error) {
        return errorResponse('PARTNER_POINTS_LOGS_ERROR', 'Failed to fetch partner points logs', error.message);
      }
    }

    // GET /api-admin/partner-revenue - Partner revenue by quest, membership, post unlocks
    if (pathname === '/api-admin/partner-revenue' && req.method === 'GET') {
      const params = getQueryParams(req.url);
      const partnerId = params.partner_id;
      if (!partnerId) {
        return errorResponse('INVALID_REQUEST', 'partner_id is required');
      }
      try {
        const { data: partner, error: partnerErr } = await supabase.from('partners').select('id, member_id').eq('id', partnerId).maybeSingle();
        if (partnerErr || !partner) {
          return errorResponse('PARTNER_NOT_FOUND', 'Partner not found', null, 404);
        }
        const partnerMemberId = partner.member_id;

        const { data: partnerPostIds } = await supabase
          .from('posts')
          .select('id')
          .eq('partner_id', partnerId);
        const postIds = (partnerPostIds || []).map((p: any) => p.id);

        const [questRes, membershipRes, postUnlocksRes, donationsRes] = await Promise.all([
          supabase
            .from('partner_requests')
            .select(`
              id, client_id, total_coins, requested_at, completed_at, job_count, coins_per_job,
              client:members!partner_requests_client_id_fkey(name, member_code)
            `)
            .eq('partner_id', partnerId)
            .eq('status', 'completed')
            .order('completed_at', { ascending: false }),
          supabase
            .from('membership_subscriptions')
            .select(`
              id, user_id, started_at, expired_at,
              membership:membership_id(id, name, monthly_price, discount_rate, partner_id)
            `)
            .eq('status', 'active'),
          postIds.length > 0
            ? supabase
                .from('post_unlocks')
                .select(`
                  id, user_id, post_id, point_price, purchased_at,
                  post:post_id(id, content)
                `)
                .in('post_id', postIds)
            : Promise.resolve({ data: [], error: null }),
          supabase
            .from('member_points_logs')
            .select(`
              id, member_id, amount, created_at, description, log_id,
              donor:members!member_id(name, member_code)
            `)
            .eq('type', 'spend')
            .like('log_id', `donation_${partnerMemberId}_%`)
            .order('created_at', { ascending: false }),
        ]);

        if (questRes.error) throw questRes.error;
        if (membershipRes.error) throw membershipRes.error;
        if (postUnlocksRes.error) throw postUnlocksRes.error;
        if (donationsRes.error) throw donationsRes.error;

        const questRows = (questRes.data || []).map((r: any) => ({
          id: r.id,
          client_id: r.client_id,
          client_name: r.client?.name ?? null,
          client_code: r.client?.member_code ?? null,
          total_coins: r.total_coins ?? 0,
          requested_at: r.requested_at,
          completed_at: r.completed_at,
          job_count: r.job_count,
          coins_per_job: r.coins_per_job,
        }));

        const membershipByPartner = (membershipRes.data || []).filter(
          (s: any) => s.membership?.partner_id === partnerId
        );
        const subscriberUserIds = [...new Set((membershipByPartner as any[]).map((s: any) => s.user_id).filter(Boolean))];
        let membersMap: Record<string, { name: string | null; member_code: string | null }> = {};
        if (subscriberUserIds.length > 0) {
          const { data: membersData } = await supabase
            .from('members')
            .select('id, name, member_code')
            .in('id', subscriberUserIds);
          membersMap = (membersData || []).reduce((acc: Record<string, { name: string | null; member_code: string | null }>, m: any) => {
            acc[m.id] = { name: m.name ?? null, member_code: m.member_code ?? null };
            return acc;
          }, {});
        }
        const membershipRows = membershipByPartner.map((s: any) => {
          const start = s.started_at ? new Date(s.started_at) : null;
          const end = s.expired_at ? new Date(s.expired_at) : null;
          let months = 0;
          if (start && end) {
            months = Math.max(0, Math.round((end.getTime() - start.getTime()) / (30.44 * 24 * 60 * 60 * 1000)));
            if (months < 1) months = 1;
          }
          const monthlyPrice = s.membership?.monthly_price ?? 0;
          const discountRate = (s.membership?.discount_rate ?? 0) / 100;
          const pricePerMonth = Math.round(monthlyPrice * (1 - discountRate));
          const totalAmount = pricePerMonth * months;
          const subscriber = membersMap[s.user_id];
          return {
            id: s.id,
            user_id: s.user_id,
            subscriber_name: subscriber?.name ?? null,
            subscriber_code: subscriber?.member_code ?? null,
            started_at: s.started_at,
            expired_at: s.expired_at,
            membership_name: s.membership?.name ?? null,
            months,
            price_per_month: pricePerMonth,
            total_amount: totalAmount,
          };
        });

        const postUnlocksRows = (postUnlocksRes.data || []).map((u: any) => ({
          id: u.id,
          user_id: u.user_id,
          post_id: u.post_id,
          point_price: u.point_price ?? 0,
          purchased_at: u.purchased_at,
          post_title: u.post?.content ?? null,
        }));

        const donationRows = (donationsRes.data || []).map((d: any) => ({
          id: d.id,
          donor_id: d.member_id,
          donor_name: d.donor?.name ?? null,
          donor_code: d.donor?.member_code ?? null,
          amount: d.amount ?? 0,
          created_at: d.created_at,
          description: d.description ?? null,
        }));

        const totalQuest = questRows.reduce((sum: number, r: any) => sum + (r.total_coins || 0), 0);
        const totalMembership = membershipRows.reduce((sum: number, r: any) => sum + (r.total_amount || 0), 0);
        const totalPostUnlocks = postUnlocksRows.reduce((sum: number, r: any) => sum + (r.point_price || 0), 0);
        const totalDonations = donationRows.reduce((sum: number, r: any) => sum + (r.amount || 0), 0);

        return successResponse({
          quest: questRows,
          membership: membershipRows,
          postUnlocks: postUnlocksRows,
          donations: donationRows,
          totals: {
            quest: totalQuest,
            membership: totalMembership,
            postUnlocks: totalPostUnlocks,
            donations: totalDonations,
            total: totalQuest + totalMembership + totalPostUnlocks + totalDonations,
          },
        });
      } catch (error) {
        return errorResponse('PARTNER_REVENUE_ERROR', 'Failed to fetch partner revenue', error.message);
      }
    }

    return errorResponse('ROUTE_NOT_FOUND', 'API route not found', null, 404);

  } catch (error) {
    console.error('Admin API error:', error);

    // Handle authentication errors
    if (error.message.includes('authorization') || error.message.includes('token')) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', null, 401);
    }

    return errorResponse(
      'INTERNAL_ERROR',
      'Internal server error',
      error.message,
      500
    );
  }
});