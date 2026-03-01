import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, createSupabaseClient, errorResponse, successResponse, getAuthUser, parseRequestBody, getQueryParams } from '../_shared/utils.ts';
import type { PartnerJob } from '../_shared/types.ts';

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const supabase = createSupabaseClient();

    // POST /api-partner-dashboard/jobs - Create new partner job
    if (pathname === '/api-partner-dashboard/jobs' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body || !body.job_name || !body.coins_per_job) {
        return errorResponse('INVALID_BODY', 'Job name and coins per job are required');
      }

      const { job_name, job_description, coins_per_job } = body;

      try {
        // Get user's partner info
        const { data: partnerData, error: partnerError } = await supabase
          .from('partners')
          .select('id, partner_status')
          .eq('member_id', user.id)
          .eq('partner_status', 'approved')
          .single();

        if (partnerError || !partnerData) {
          return errorResponse('NOT_APPROVED_PARTNER', 'You must be an approved partner to create jobs');
        }

        // Create new job
        const { data: newJob, error: createError } = await supabase
          .from('partner_jobs')
          .insert({
            partner_id: partnerData.id,
            job_name: job_name.trim(),
            job_description: job_description?.trim() || null,
            job_price: coins_per_job,
            is_active: true,
          })
          .select()
          .single();

        if (createError) throw createError;

        return successResponse({
          job: newJob,
          message: 'Job created successfully',
        });

      } catch (error) {
        return errorResponse('JOB_CREATION_ERROR', 'Failed to create job', error.message);
      }
    }

    // PUT /api-partner-dashboard/jobs/{jobId} - Update partner job
    if (pathname.includes('/jobs/') && req.method === 'PUT') {
      const user = await getAuthUser(req);
      const jobId = pathname.split('/jobs/')[1];
      const body = await parseRequestBody(req);

      if (!jobId) {
        return errorResponse('INVALID_JOB_ID', 'Job ID is required');
      }

      if (!body) {
        return errorResponse('INVALID_BODY', 'Request body is required');
      }

      try {
        // Verify user owns this job
        const { data: jobData, error: jobError } = await supabase
          .from('partner_jobs')
          .select(`
            id, partner_id,
            partners!partner_id(member_id)
          `)
          .eq('id', jobId)
          .single();

        if (jobError) {
          if (jobError.code === 'PGRST116') {
            return errorResponse('JOB_NOT_FOUND', 'Job not found');
          }
          throw jobError;
        }

        if ((jobData.partners as any).member_id !== user.id) {
          return errorResponse('UNAUTHORIZED', 'You can only update your own jobs', null, 403);
        }

        // Update job
        const updateData: any = {};
        if (body.job_name !== undefined) updateData.job_name = body.job_name.trim();
        if (body.job_description !== undefined) updateData.job_description = body.job_description?.trim() || null;
        if (body.job_price !== undefined) updateData.job_price = body.job_price;
        if (body.is_active !== undefined) updateData.is_active = body.is_active;

        const { data: updatedJob, error: updateError } = await supabase
          .from('partner_jobs')
          .update(updateData)
          .eq('id', jobId)
          .select()
          .single();

        if (updateError) throw updateError;

        return successResponse({
          job: updatedJob,
          message: 'Job updated successfully',
        });

      } catch (error) {
        return errorResponse('JOB_UPDATE_ERROR', 'Failed to update job', error.message);
      }
    }

    // DELETE /api-partner-dashboard/jobs/{jobId} - Delete partner job
    if (pathname.includes('/jobs/') && req.method === 'DELETE') {
      const user = await getAuthUser(req);
      const jobId = pathname.split('/jobs/')[1];

      if (!jobId) {
        return errorResponse('INVALID_JOB_ID', 'Job ID is required');
      }

      try {
        // Verify user owns this job
        const { data: jobData, error: jobError } = await supabase
          .from('partner_jobs')
          .select(`
            id, partner_id,
            partners!partner_id(member_id)
          `)
          .eq('id', jobId)
          .single();

        if (jobError) {
          if (jobError.code === 'PGRST116') {
            return errorResponse('JOB_NOT_FOUND', 'Job not found');
          }
          throw jobError;
        }

        if ((jobData.partners as any).member_id !== user.id) {
          return errorResponse('UNAUTHORIZED', 'You can only delete your own jobs', null, 403);
        }

        // Delete job
        const { error: deleteError } = await supabase
          .from('partner_jobs')
          .delete()
          .eq('id', jobId);

        if (deleteError) throw deleteError;

        return successResponse({
          message: 'Job deleted successfully',
          jobId,
        });

      } catch (error) {
        return errorResponse('JOB_DELETE_ERROR', 'Failed to delete job', error.message);
      }
    }

    // GET /api-partner-dashboard/requests - Get partner requests
    if (pathname === '/api-partner-dashboard/requests' && req.method === 'GET') {
      const user = await getAuthUser(req);
      const params = getQueryParams(req.url);
      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '20');
      const status = params.status;
      const offset = (page - 1) * limit;

      try {
        // Get user's partner info
        const { data: partnerData, error: partnerError } = await supabase
          .from('partners')
          .select('id')
          .eq('member_id', user.id)
          .single();

        if (partnerError) {
          if (partnerError.code === 'PGRST116') {
            return errorResponse('NOT_A_PARTNER', 'User is not a partner');
          }
          throw partnerError;
        }

        // Build query
        let query = supabase
          .from('partner_requests')
          .select('*', { count: 'exact' })
          .eq('partner_id', partnerData.id);

        // Apply status filter if provided
        if (status) {
          query = query.eq('status', status);
        }

        const { data: requests, error: requestsError, count } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (requestsError) throw requestsError;

        return successResponse(requests || [], {
          total: count || 0,
          page,
          limit,
        });

      } catch (error) {
        return errorResponse('REQUESTS_FETCH_ERROR', 'Failed to fetch partner requests', error.message);
      }
    }

    // PUT /api-partner-dashboard/requests/{requestId}/status - Update request status
    if (pathname.includes('/requests/') && pathname.includes('/status') && req.method === 'PUT') {
      const user = await getAuthUser(req);
      const requestId = pathname.split('/requests/')[1].split('/status')[0];
      const body = await parseRequestBody(req);

      if (!requestId) {
        return errorResponse('INVALID_REQUEST_ID', 'Request ID is required');
      }

      if (!body || !body.status) {
        return errorResponse('INVALID_BODY', 'Status is required');
      }

      const { status, response_message, call_id } = body;

      // Validate status
      if (!['pending', 'in_progress', 'cancelled', 'completed'].includes(status)) {
        return errorResponse('INVALID_STATUS', 'Invalid status value');
      }

      try {
        // Get user's partner info first
        const { data: userPartner, error: userPartnerError } = await supabase
          .from('partners')
          .select('id')
          .eq('member_id', user.id)
          .single();

        if (userPartnerError) {
          if (userPartnerError.code === 'PGRST116') {
            return errorResponse('NOT_A_PARTNER', 'User is not a partner');
          }
          throw userPartnerError;
        }

        // Verify user owns this request
        const { data: requestData, error: requestError } = await supabase
          .from('partner_requests')
          .select('id, partner_id')
          .eq('id', requestId)
          .eq('partner_id', userPartner.id)
          .single();

        if (requestError) {
          if (requestError.code === 'PGRST116') {
            return errorResponse('REQUEST_NOT_FOUND', 'Request not found or you do not have permission');
          }
          throw requestError;
        }

        // Get full request data for points calculation
        const { data: fullRequestData, error: fullRequestError } = await supabase
          .from('partner_requests')
          .select(`
            *,
            partner_job:partner_jobs(job_name),
            client:members(id, name, total_points)
          `)
          .eq('id', requestId)
          .single();

        if (fullRequestError) throw fullRequestError;

        // Prevent status change if request is already cancelled or completed
        if (fullRequestData.status === 'cancelled' && status !== 'cancelled') {
          return errorResponse('INVALID_STATUS_CHANGE', 'Cannot change status from cancelled to another status');
        }

        if (fullRequestData.status === 'completed' && status !== 'completed') {
          return errorResponse('INVALID_STATUS_CHANGE', 'Cannot change status from completed to another status');
        }

        // Check if points have already been refunded for this request
        // by checking if a log entry with this request ID exists
        // Also check if request is already cancelled to prevent duplicate refunds
        let pointsAlreadyRefunded = false;
        if (status === 'cancelled') {
          // If already cancelled, don't refund again
          if (fullRequestData.status === 'cancelled') {
            pointsAlreadyRefunded = true;
          } else {
            // Check if refund log already exists
            const jobName = (fullRequestData.partner_job as any)?.job_name || '서비스';
            const { data: existingLog, error: logCheckError } = await supabase
              .from('member_points_logs')
              .select('id')
              .eq('log_id', fullRequestData.id)
              .eq('type', 'earn')
              .eq('description', `${jobName} ${fullRequestData.job_count}회 의뢰 취소 환불`)
              .maybeSingle();

            if (!logCheckError && existingLog) {
              pointsAlreadyRefunded = true;
            }
          }
        }

        // Update request status
        const updateData: any = {
          status,
          updated_at: new Date().toISOString(),
        };

        // Add call_id if provided (only if status is not cancelled)
        // Once cancelled, the request should not be updated with call_id
        if (call_id && status !== 'cancelled') {
          updateData.call_id = call_id;
        }

        const { data: updatedRequest, error: updateError } = await supabase
          .from('partner_requests')
          .update(updateData)
          .eq('id', requestId)
          .select('*')
          .single();

        if (updateError) throw updateError;

        // 🔔 푸시 알림 전송
        try {
          const clientId = fullRequestData.client_id;
          const partnerName = fullRequestData.partner?.partner_name || '파트너';
          const jobName = (fullRequestData.partner_job as any)?.job_name || '서비스';

          let notificationTitle = '';
          let notificationBody = '';
          let notificationType: 'request' | 'system' = 'request';

          switch (status) {
            case 'in_progress':
              notificationTitle = `의뢰 수락 완료!`;
              notificationBody = `${partnerName}님이 ${jobName} 의뢰를 수락했습니다. 음성 통화로 게임을 시작해보세요!`;
              break;
            case 'completed':
              notificationTitle = `의뢰 완료!`;
              notificationBody = `${partnerName}님과의 ${jobName} 의뢰가 성공적으로 완료되었습니다.`;
              notificationType = 'system';
              break;
            case 'cancelled':
              notificationTitle = `의뢰 취소됨`;
              notificationBody = `${partnerName}님이 ${jobName} 의뢰를 취소했습니다. 포인트가 환불되었습니다.`;
              notificationType = 'system';
              break;
          }

          if (notificationTitle && clientId) {
            const pushResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/send-push`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': req.headers.get('Authorization') || '',
                'apikey': Deno.env.get('SUPABASE_ANON_KEY') || '',
              },
              body: JSON.stringify({
                user_id: clientId,
                title: notificationTitle,
                body: notificationBody,
                notification_type: notificationType,
                url: status === 'in_progress' ? `/chat?request_id=${requestId}` : '/dashboard',
                tag: `request-${requestId}`,
                data: {
                  request_id: requestId,
                  status,
                  partner_name: partnerName,
                  job_name: jobName
                }
              }),
            });

            if (pushResponse.ok) {
              console.log('🔔 Request notification sent successfully');
            } else {
              console.error('❌ Request notification failed:', await pushResponse.text());
            }
          }
        } catch (pushError) {
          console.error('❌ Request notification error:', pushError);
          // 푸시 알림 실패는 의뢰 처리에 영향을 주지 않음
        }

        // Handle points based on request status
        if (status === 'completed') {
          // When completed: Only give points to partner (client already paid when requesting)
          const totalPoints = fullRequestData.total_coins || (fullRequestData.coins_per_job * fullRequestData.job_count);
          const jobName = (fullRequestData.partner_job as any)?.job_name || '서비스';

          // Update partner total_points
          const { data: currentPartner, error: partnerSelectError } = await supabase
            .from('partners')
            .select('total_points')
            .eq('id', fullRequestData.partner_id)
            .single();

          if (partnerSelectError) throw partnerSelectError;

          const { error: partnerUpdateError } = await supabase
            .from('partners')
            .update({
              total_points: (currentPartner?.total_points || 0) + totalPoints
            })
            .eq('id', fullRequestData.partner_id);

          if (partnerUpdateError) throw partnerUpdateError;

          // Log partner points earning
          const { error: partnerLogError } = await supabase
            .from('partner_points_logs')
            .insert({
              partner_id: fullRequestData.partner_id,
              type: 'earn',
              amount: totalPoints,
              description: `${jobName} ${fullRequestData.job_count}회 완료`,
              log_id: fullRequestData.id,
            });

          if (partnerLogError) {
            console.error('Failed to log partner points:', partnerLogError);
            // Log error doesn't fail the request, but we should log it
          }

        } else if (status === 'cancelled' && !pointsAlreadyRefunded) {
          // When cancelled/rejected: Refund points to client
          // Only refund if points haven't been refunded already
          // Double-check: Verify request is not already cancelled before refunding
          if (fullRequestData.status !== 'cancelled') {
            const totalPoints = fullRequestData.total_coins || (fullRequestData.coins_per_job * fullRequestData.job_count);
            const jobName = (fullRequestData.partner_job as any)?.job_name || '서비스';

            // Final check: Verify no refund log exists with this exact description
            const { data: finalCheckLog, error: finalCheckError } = await supabase
              .from('member_points_logs')
              .select('id')
              .eq('log_id', fullRequestData.id)
              .eq('type', 'earn')
              .eq('description', `${jobName} ${fullRequestData.job_count}회 의뢰 취소 환불`)
              .maybeSingle();

            if (!finalCheckError && !finalCheckLog) {
              // Refund points to client
              const { error: refundError } = await supabase.rpc('update_member_points_with_log', {
                p_member_id: fullRequestData.client_id,
                p_type: 'earn',
                p_amount: totalPoints,
                p_description: `${jobName} ${fullRequestData.job_count}회 의뢰 취소 환불`,
                p_log_id: fullRequestData.id
              });

              if (refundError) throw refundError;
            }
          }
        }

        return successResponse({
          request: updatedRequest,
          message: 'Request status updated successfully',
        });

      } catch (error) {
        return errorResponse('REQUEST_UPDATE_ERROR', 'Failed to update request status', error.message);
      }
    }

    // GET /api-partner-dashboard/stats - Get partner statistics
    if (pathname === '/api-partner-dashboard/stats' && req.method === 'GET') {
      const user = await getAuthUser(req);

      try {
        // Get user's partner info including ben_lists
        const { data: partnerData, error: partnerError } = await supabase
          .from('partners')
          .select('id, total_points, ben_lists')
          .eq('member_id', user.id)
          .single();

        if (partnerError) {
          if (partnerError.code === 'PGRST116') {
            return errorResponse('NOT_A_PARTNER', 'User is not a partner');
          }
          throw partnerError;
        }

        // Get request statistics
        const { data: requestStats, error: statsError } = await supabase
          .from('partner_requests')
          .select('status')
          .eq('partner_id', partnerData.id);

        if (statsError) throw statsError;

        // Calculate statistics
        const stats = {
          totalRequests: requestStats?.length || 0,
          pendingRequests: requestStats?.filter(r => r.status === 'pending' || r.status === 'in_progress').length || 0,
          acceptedRequests: requestStats?.filter(r => r.status === 'in_progress').length || 0,
          completedRequests: requestStats?.filter(r => r.status === 'completed').length || 0,
          rejectedRequests: requestStats?.filter(r => r.status === 'rejected').length || 0,
          totalPoints: partnerData.total_points || 0,
        };

        // Get active jobs count
        const { data: jobsData, error: jobsError } = await supabase
          .from('partner_jobs')
          .select('id')
          .eq('partner_id', partnerData.id)
          .eq('is_active', true);

        if (jobsError) throw jobsError;

        stats.activeJobs = jobsData?.length || 0;

        // Get banned users information from partners.ben_lists
        let formattedBannedUsers = [];

        if (partnerData.ben_lists) {
          let blockedUserIds = [];

          // Parse ben_lists based on its type
          if (Array.isArray(partnerData.ben_lists)) {
            blockedUserIds = partnerData.ben_lists;
          } else if (typeof partnerData.ben_lists === 'string') {
            try {
              blockedUserIds = JSON.parse(partnerData.ben_lists);
            } catch (e) {
              console.error('Failed to parse ben_lists as JSON:', e);
              blockedUserIds = [];
            }
          } else if (typeof partnerData.ben_lists === 'object') {
            blockedUserIds = Object.values(partnerData.ben_lists);
          }

          // Get user information for blocked users
          if (blockedUserIds.length > 0) {
            const { data: blockedUsersInfo, error: blockedUsersError } = await supabase
              .from('members')
              .select('id, name, profile_image, member_code')
              .in('id', blockedUserIds);

            if (!blockedUsersError && blockedUsersInfo) {
              formattedBannedUsers = blockedUsersInfo.map(user => ({
                id: `blocked_${user.id}`,
                user_id: user.id,
                user_name: user.name,
                banned_at: new Date().toISOString(), // We don't have exact ban date, use current time
                user_info: user
              }));
            }
          }
        }

        const response = {
          ...stats,
          banned_users: formattedBannedUsers
        };

        return successResponse(response);

      } catch (error) {
        return errorResponse('STATS_ERROR', 'Failed to fetch partner statistics', error.message);
      }
    }


    // GET /api-partner-dashboard/monthly-client-ranking - Get monthly client ranking
    // memberId 쿼리 파라미터가 있으면 특정 파트너의 의뢰자 랭킹, 없으면 전체 랭킹
    if (pathname === '/api-partner-dashboard/monthly-client-ranking' && req.method === 'GET') {
      try {
        const params = getQueryParams(req.url);
        const memberId = params.memberId; // 파트너의 members.id (선택적)

        // Get current month start and end dates
        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth(); // 0-based

        const startOfMonth = new Date(currentYear, currentMonth, 1);
        const endOfMonth = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999);

        // Build query for completed partner requests
        let query = supabase
          .from('partner_requests')
          .select(`
            client_id,
            partner_id,
            total_coins,
            members!partner_requests_client_id_fkey (
              id,
              name,
              profile_image,
              member_code
            )
          `)
          .eq('status', 'completed')
          .gte('updated_at', startOfMonth.toISOString())
          .lte('updated_at', endOfMonth.toISOString());

        // 특정 파트너의 의뢰자 랭킹을 조회하는 경우
        if (memberId) {
          // 1. members.id로 partners.id 찾기
          const { data: partnerData, error: partnerError } = await supabase
            .from('partners')
            .select('id')
            .eq('member_id', memberId)
            .maybeSingle();

          if (partnerError) {
            throw partnerError;
          }

          if (partnerData) {
            // 2. partners.id로 partner_requests 필터링
            query = query.eq('partner_id', partnerData.id);
          } else {
            // 파트너가 없으면 빈 배열 반환
            return successResponse({
              ranking: [],
              month: `${currentYear}년 ${currentMonth + 1}월`,
              total_clients: 0
            });
          }
        }

        const { data: monthlyRequests, error: requestsError } = await query;

        if (requestsError) throw requestsError;

        // Group by client_id and sum total_coins
        const clientRankingMap = new Map();

        (monthlyRequests || []).forEach(request => {
          const clientId = request.client_id;
          const totalCoins = request.total_coins || 0;

          if (clientRankingMap.has(clientId)) {
            const existing = clientRankingMap.get(clientId);
            existing.totalCoins += totalCoins;
            existing.requestCount += 1;
          } else {
            clientRankingMap.set(clientId, {
              clientId: clientId,
              clientInfo: request.members,
              totalCoins: totalCoins,
              requestCount: 1
            });
          }
        });

        // Convert to array and sort by totalCoins descending
        const ranking = Array.from(clientRankingMap.values())
          .sort((a, b) => b.totalCoins - a.totalCoins)
          .slice(0, 10) // Top 10
          .map((item, index) => ({
            rank: index + 1,
            client_id: item.clientId,
            client_name: item.clientInfo?.name || '알 수 없음',
            client_profile_image: item.clientInfo?.profile_image || null,
            client_member_code: item.clientInfo?.member_code || null,
            total_coins: item.totalCoins,
            request_count: item.requestCount
          }));

        return successResponse({
          ranking: ranking,
          month: `${currentYear}년 ${currentMonth + 1}월`,
          total_clients: clientRankingMap.size
        });

      } catch (error) {
        return errorResponse('MONTHLY_RANKING_ERROR', 'Failed to fetch monthly client ranking', error.message);
      }
    }

    return errorResponse('ROUTE_NOT_FOUND', 'API route not found', null, 404);

  } catch (error) {
    console.error('Partner Dashboard API error:', error);

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