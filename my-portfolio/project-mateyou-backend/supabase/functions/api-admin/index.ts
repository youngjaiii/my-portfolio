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
        // members.id로 partners 정보 업데이트 (partners.member_id로 조회)
        const { data: updatedPartner, error: updateError } = await supabase
          .from('partners')
          .update({ tax })
          .eq('member_id', memberId)  // partners.id → partners.member_id로 변경
          .select(`
            *,
            member:members!member_id(*)
          `)
          .single();

        if (updateError) throw updateError;

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
          .select('id, tosspayments_seller_id')
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

        const partnerId = partnerData.id;

        // 0. call_participants 처리 (체크 제약 조건 위반 방지 - 파트너 삭제 전에 먼저 처리)
        // participant_type = 'partner'이고 actual_partner_id가 삭제될 파트너인 경우 처리
        const { data: partnerParticipants, error: participantsFetchError } = await supabase
          .from('call_participants')
          .select('id, participant_type, actual_partner_id')
          .eq('actual_partner_id', partnerId);

        if (participantsFetchError) {
          console.error('Error fetching call_participants:', participantsFetchError);
        } else if (partnerParticipants && partnerParticipants.length > 0) {
          // 레코드를 삭제 (체크 제약 조건 위반 방지)
          const { error: participantsDeleteError } = await supabase
            .from('call_participants')
            .delete()
            .eq('actual_partner_id', partnerId);

          if (participantsDeleteError) {
            console.error('Error deleting call_participants:', participantsDeleteError);
            throw participantsDeleteError; // 파트너 삭제 전에 반드시 처리해야 함
          } else {
            console.log(`✅ Deleted ${partnerParticipants.length} call_participants record(s) for partner ${partnerId}`);
          }
        }

        // 1. 토스 셀러 삭제 (tosspayments_seller_id가 있는 경우)
        // Edge Function에서는 토스 API 호출이 복잡하므로 스킵
        // 실제 삭제는 Express 서버에서 처리됨
        if (partnerData.tosspayments_seller_id) {
          console.log('⚠️ Toss seller deletion should be handled by Express server:', partnerData.tosspayments_seller_id);
        }

        // 2. partner_withdrawals 삭제
        const { error: withdrawalsDeleteError } = await supabase
          .from('partner_withdrawals')
          .delete()
          .eq('partner_id', partnerId);

        if (withdrawalsDeleteError) {
          console.error('Error deleting partner_withdrawals:', withdrawalsDeleteError);
          // 에러가 발생해도 계속 진행
        }

        // 3. partner_requests에서 in_progress나 pending 상태인 요청들을 rejected로 변경
        const { data: activeRequests, error: requestsFetchError } = await supabase
          .from('partner_requests')
          .select('id, client_id, status')
          .eq('partner_id', partnerId)
          .in('status', ['pending', 'in_progress']);

        if (requestsFetchError) {
          console.error('Error fetching partner_requests:', requestsFetchError);
        } else if (activeRequests && activeRequests.length > 0) {
          // 상태를 rejected로 변경
          const requestIds = activeRequests.map((r) => r.id);
          const { error: updateRequestsError } = await supabase
            .from('partner_requests')
            .update({ status: 'rejected', cancelled_at: new Date().toISOString() })
            .in('id', requestIds);

          if (updateRequestsError) {
            console.error('Error updating partner_requests:', updateRequestsError);
          } else {
            // 3-1. rejected된 요청들에 대해 채팅 메시지 전송
            for (const request of activeRequests) {
              try {
                // 채팅방 찾기 또는 생성
                const { data: existingRoom, error: roomCheckError } = await supabase
                  .from('chat_rooms')
                  .select('id')
                  .or(`and(created_by.eq.${request.client_id},partner_id.eq.${memberId}),and(created_by.eq.${memberId},partner_id.eq.${request.client_id})`)
                  .eq('is_active', true)
                  .maybeSingle();

                let roomId: string;

                if (existingRoom) {
                  roomId = existingRoom.id;
                } else {
                  // 채팅방이 없으면 생성
                  const { data: newRoom, error: createRoomError } = await supabase
                    .from('chat_rooms')
                    .insert([
                      {
                        created_by: request.client_id,
                        partner_id: memberId,
                        is_active: true,
                      },
                    ])
                    .select('id')
                    .single();

                  if (createRoomError) {
                    console.error('Error creating chat room:', createRoomError);
                    continue;
                  }
                  roomId = newRoom.id;
                }

                // 시스템 메시지 전송
                const { error: messageError } = await supabase
                  .from('chat_messages')
                  .insert([
                    {
                      room_id: roomId,
                      sender_id: memberId, // 파트너의 member_id
                      message: '파트너 해제로 인해 의뢰가 취소 되었습니다',
                      message_type: 'system',
                    },
                  ]);

                if (messageError) {
                  console.error('Error sending chat message:', messageError);
                } else {
                  // 채팅방 updated_at 업데이트
                  await supabase
                    .from('chat_rooms')
                    .update({ updated_at: new Date().toISOString() })
                    .eq('id', roomId);
                }
              } catch (chatError: any) {
                console.error('Error processing chat message for request:', request.id, chatError);
              }
            }
          }
        }

        // 4. Delete partner record by member ID (partners 테이블 삭제)
        const { data: deletedPartner, error: deleteError } = await supabase
          .from('partners')
          .delete()
          .eq('member_id', memberId)
          .select('id')
          .single();

        if (deleteError) throw deleteError;

        // 5. Update member role to 'normal'
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

        return successResponse(withdrawals || [], {
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

        // Get withdrawal statistics (including withdrawal_type)
        const { data: withdrawalStats, error: withdrawalStatsError } = await supabase
          .from('partner_withdrawals')
          .select('status, withdrawal_type');

        if (withdrawalStatsError) throw withdrawalStatsError;

        // Get banner count
        const { count: bannerCount, error: bannerCountError } = await supabase
          .from('ad_banners')
          .select('id', { count: 'exact' });

        if (bannerCountError) throw bannerCountError;

        // Calculate statistics
        const totalPointsWithdrawals = withdrawalStats?.filter(w => !w.withdrawal_type || w.withdrawal_type === 'total_points') || [];
        const storePointsWithdrawals = withdrawalStats?.filter(w => w.withdrawal_type === 'store_points') || [];
        const collaborationStorePointsWithdrawals = withdrawalStats?.filter(w => w.withdrawal_type === 'collaboration_store_points') || [];

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
            // withdrawal_type별 통계
            byType: {
              total_points: {
                total: totalPointsWithdrawals.length,
                pending: totalPointsWithdrawals.filter(w => w.status === 'pending').length,
                approved: totalPointsWithdrawals.filter(w => w.status === 'approved').length,
                completed: totalPointsWithdrawals.filter(w => w.status === 'completed').length,
                rejected: totalPointsWithdrawals.filter(w => w.status === 'rejected').length,
              },
              store_points: {
                total: storePointsWithdrawals.length,
                pending: storePointsWithdrawals.filter(w => w.status === 'pending').length,
                approved: storePointsWithdrawals.filter(w => w.status === 'approved').length,
                completed: storePointsWithdrawals.filter(w => w.status === 'completed').length,
                rejected: storePointsWithdrawals.filter(w => w.status === 'rejected').length,
              },
              collaboration_store_points: {
                total: collaborationStorePointsWithdrawals.length,
                pending: collaborationStorePointsWithdrawals.filter(w => w.status === 'pending').length,
                approved: collaborationStorePointsWithdrawals.filter(w => w.status === 'approved').length,
                completed: collaborationStorePointsWithdrawals.filter(w => w.status === 'completed').length,
                rejected: collaborationStorePointsWithdrawals.filter(w => w.status === 'rejected').length,
              },
            },
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