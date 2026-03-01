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
      console.log('📝 Creating job for user:', user.id);
      
      const body = await parseRequestBody(req);
      console.log('📝 Request body:', JSON.stringify(body));

      if (!body || !body.job_name || !body.coins_per_job) {
        return errorResponse('INVALID_BODY', 'Job name and coins per job are required');
      }

      const { job_name, coins_per_job, membership_id, min_tier_rank } = body;

      try {
        // Get user's partner info
        const { data: partnerData, error: partnerError } = await supabase
          .from('partners')
          .select('id, partner_status')
          .eq('member_id', user.id)
          .eq('partner_status', 'approved')
          .single();

        console.log('📝 Partner lookup result:', { partnerData, partnerError: partnerError?.message });

        if (partnerError || !partnerData) {
          const errorMsg = partnerError?.message || 'Partner not found or not approved';
          console.log('❌ Partner check failed:', errorMsg);
          return errorResponse('NOT_APPROVED_PARTNER', `You must be an approved partner to create jobs. (${errorMsg})`);
        }

        console.log('📝 Creating job with partner_id:', partnerData.id);

        // 먼저 같은 이름의 퀘스트가 있는지 확인
        const { data: existingJob, error: checkError } = await supabase
          .from('partner_jobs')
          .select('id, is_active')
          .eq('partner_id', partnerData.id)
          .eq('job_name', job_name.trim())
          .maybeSingle();

        if (checkError) {
          console.log('❌ Job check error:', checkError.message);
          throw checkError;
        }

        // 같은 이름의 퀘스트가 이미 존재하는 경우
        if (existingJob) {
          if (existingJob.is_active) {
            // 이미 활성화된 같은 이름의 퀘스트가 있음
            return errorResponse('DUPLICATE_JOB_NAME', '이미 같은 이름의 퀘스트가 존재합니다.');
          } else {
            // 비활성화된 퀘스트가 있으면 재활성화하고 가격 업데이트
            const reactivateData: any = {
              is_active: true,
              coins_per_job: coins_per_job,
            };
            if (membership_id) reactivateData.membership_id = membership_id;
            if (min_tier_rank !== undefined) reactivateData.min_tier_rank = Math.min(10, Math.max(1, parseInt(min_tier_rank) || 1));
            
            const { data: reactivatedJob, error: reactivateError } = await supabase
              .from('partner_jobs')
              .update(reactivateData)
              .eq('id', existingJob.id)
              .select()
              .single();

            if (reactivateError) {
              console.log('❌ Job reactivation error:', reactivateError.message);
              throw reactivateError;
            }

            console.log('✅ Job reactivated successfully:', reactivatedJob.id);

            return successResponse({
              job: reactivatedJob,
              message: '기존 퀘스트가 재활성화되었습니다.',
            });
          }
        }

        // Create new job
        const insertData: any = {
          partner_id: partnerData.id,
          job_name: job_name.trim(),
          coins_per_job: coins_per_job,
          is_active: true,
        };
        if (membership_id) insertData.membership_id = membership_id;
        if (min_tier_rank !== undefined) insertData.min_tier_rank = Math.min(10, Math.max(1, parseInt(min_tier_rank) || 1));
        
        console.log('📝 Insert data:', JSON.stringify(insertData));
        
        const { data: newJob, error: createError } = await supabase
          .from('partner_jobs')
          .insert(insertData)
          .select()
          .single();

        if (createError) {
          console.log('❌ Job creation error:', createError.message);
          throw createError;
        }

        console.log('✅ Job created successfully:', newJob.id);

        return successResponse({
          job: newJob,
          message: 'Job created successfully',
        });

      } catch (error) {
        console.error('❌ JOB_CREATION_ERROR:', error);
        return errorResponse('JOB_CREATION_ERROR', `Failed to create job: ${error.message}`);
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
        if (body.coins_per_job !== undefined) updateData.coins_per_job = body.coins_per_job;
        if (body.is_active !== undefined) updateData.is_active = body.is_active;
        if (body.membership_id !== undefined) updateData.membership_id = body.membership_id || null;
        if (body.min_tier_rank !== undefined) updateData.min_tier_rank = Math.min(10, Math.max(1, parseInt(body.min_tier_rank) || 1));

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

      console.log('🔍 [Get Partner Requests] Start:', { userId: user.id, status, page, limit });

      try {
        // Get user's partner info
        const { data: partnerData, error: partnerError } = await supabase
          .from('partners')
          .select('id')
          .eq('member_id', user.id)
          .single();

        console.log('📋 [Get Partner Requests] Partner lookup:', { partnerData, partnerError });

        if (partnerError) {
          if (partnerError.code === 'PGRST116') {
            return errorResponse('NOT_A_PARTNER', 'User is not a partner');
          }
          throw partnerError;
        }

        console.log('✅ [Get Partner Requests] Querying partner_id:', partnerData.id);

        // Build query - client 정보 포함
        let query = supabase
          .from('partner_requests')
          .select(`
            *,
            client:members!partner_requests_client_id_fkey(id, name, profile_image, member_code)
          `, { count: 'exact' })
          .eq('partner_id', partnerData.id);

        // Apply status filter if provided
        if (status) {
          query = query.eq('status', status);
        }

        const { data: requests, error: requestsError, count } = await query
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        console.log('📊 [Get Partner Requests] Results:', { 
          count, 
          requestsCount: requests?.length || 0,
          requestsError 
        });

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

      console.log('📝 [Request Status Update] Start:', { userId: user.id, requestId });

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

        console.log('📝 [Request Status Update] User partner lookup:', { userPartner, userPartnerError });

        if (userPartnerError) {
          if (userPartnerError.code === 'PGRST116') {
            return errorResponse('NOT_A_PARTNER', 'User is not a partner');
          }
          throw userPartnerError;
        }

        // 먼저 requestId로 요청 데이터 조회 (partner_id 확인용)
        const { data: originalRequest, error: originalRequestError } = await supabase
          .from('partner_requests')
          .select('id, partner_id, client_id, status')
          .eq('id', requestId)
          .single();

        console.log('📝 [Request Status Update] Original request:', { originalRequest, originalRequestError });

        // Verify user owns this request
        const { data: requestData, error: requestError } = await supabase
          .from('partner_requests')
          .select('id, partner_id')
          .eq('id', requestId)
          .eq('partner_id', userPartner.id)
          .single();

        console.log('📝 [Request Status Update] Request verification:', { 
          requestData, 
          requestError,
          expectedPartnerId: userPartner.id,
          actualPartnerId: originalRequest?.partner_id
        });

        if (requestError) {
          if (requestError.code === 'PGRST116') {
            return errorResponse('REQUEST_NOT_FOUND', 'Request not found or you do not have permission', {
              debug: {
                requestId,
                userPartnerId: userPartner.id,
                actualPartnerId: originalRequest?.partner_id,
                mismatch: userPartner.id !== originalRequest?.partner_id
              }
            });
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

        // Update request status
        const updateData: any = {
          status,
          updated_at: new Date().toISOString(),
        };

        // Add call_id if provided
        if (call_id) {
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

          // 📨 채팅 메시지 발송 (수락/거절 시)
          if (status === 'in_progress' || status === 'cancelled') {
            const chatMessage = status === 'in_progress' 
              ? `✅ 의뢰가 수락되었습니다!\n\n📋 **${jobName}**\n\n음성 통화 버튼을 클릭하여 게임을 시작해주세요!`
              : `❌ 의뢰가 거절되었습니다.\n\n📋 **${jobName}**\n\n포인트가 환불되었습니다.`;

            try {
              // 파트너의 member_id 조회
              const { data: partnerMemberData, error: partnerMemberError } = await supabase
                .from('partners')
                .select('member_id')
                .eq('id', fullRequestData.partner_id)
                .single();

              if (!partnerMemberError && partnerMemberData) {
                // 채팅 메시지 삽입
                const { error: messageError } = await supabase
                  .from('chat_messages')
                  .insert({
                    sender_id: partnerMemberData.member_id,
                    receiver_id: clientId,
                    content: chatMessage,
                    is_read: false,
                  });

                if (messageError) {
                  console.error('❌ Chat message insert error:', messageError);
                } else {
                  console.log('📨 Chat message sent successfully');

                  // notify-chat 호출하여 실시간 알림
                  const notifyChatResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/notify-chat`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': req.headers.get('Authorization') || '',
                      'apikey': Deno.env.get('SUPABASE_ANON_KEY') || '',
                    },
                    body: JSON.stringify({
                      receiver_id: clientId,
                      sender_id: partnerMemberData.member_id,
                      message: chatMessage.substring(0, 50) + '...',
                    }),
                  });

                  if (notifyChatResponse.ok) {
                    console.log('📨 Chat notification sent');
                  }
                }
              }
            } catch (chatError) {
              console.error('❌ Chat message error:', chatError);
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

          // partner_points_logs에 로그 추가
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
            console.error('Failed to insert partner points log:', partnerLogError);
            // 로그 실패는 치명적이지 않으므로 경고만 남기고 계속 진행
          }

        } else if (status === 'cancelled') {
          // When cancelled/rejected: Refund points to client
          const totalPoints = fullRequestData.total_coins || (fullRequestData.coins_per_job * fullRequestData.job_count);
          const jobName = (fullRequestData.partner_job as any)?.job_name || '서비스';

          // Refund points to client
          const { error: refundError } = await supabase.rpc('update_member_points_with_log', {
            p_member_id: fullRequestData.client_id,
            p_type: 'earn',
            p_amount: totalPoints,
            p_description: `${jobName} ${fullRequestData.job_count}회 의뢰 취소 환불`,
            p_log_id: `refund_${fullRequestData.id}`
          });

          if (refundError) throw refundError;
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
          pendingRequests: requestStats?.filter(r => r.status === 'pending').length || 0,
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