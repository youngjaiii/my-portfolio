// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, createSupabaseClient, errorResponse, successResponse, validateMethod, getQueryParams, maskName } from '../_shared/utils.ts';
import type { PartnerWithMember, PartnerJob, Partner } from '../_shared/types.ts';

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const supabase = createSupabaseClient();

    // GET /api-partners/details/:memberCode - Get partner details by member code
    if (pathname.includes('/details/') && req.method === 'GET') {
      const memberCode = pathname.split('/details/')[1];

      if (!memberCode) {
        return errorResponse('INVALID_MEMBER_CODE', 'Member code is required');
      }

      // 1. Find member by member_code
      const { data: memberData, error: memberError } = await supabase
        .from('members')
        .select('*')
        .eq('member_code', memberCode)
        .maybeSingle();

      if (memberError || !memberData) {
        return errorResponse('MEMBER_NOT_FOUND', 'Member not found');
      }

      // 2. Find partner by member_id (only approved partners)
      const { data: partnerData, error: partnerError } = await supabase
        .from('partners')
        .select('*')
        .eq('member_id', memberData.id)
        .eq('partner_status', 'approved')
        .maybeSingle();

      if (partnerError || !partnerData) {
        return errorResponse('PARTNER_NOT_FOUND', 'Partner not found or not approved');
      }

      // 3. Get reviews (excluding 0-rating reviews)
      const { data: reviewsData, error: reviewsError } = await supabase
        .from('reviews')
        .select(`
          id, rating, comment, points_earned, created_at, member_id,
          members!member_id(name)
        `)
        .eq('target_partner_id', partnerData.id)
        .gt('rating', 0)
        .order('created_at', { ascending: false });

      if (reviewsError) {
        console.error('Reviews fetch error:', reviewsError);
      }

      // 4. Mask reviewer names
      const reviewsWithMaskedNames = (reviewsData || []).map((review) => ({
        ...review,
        reviewer_name: maskName((review.members as any)?.name),
      }));

      // 5. Combine data
      const result: PartnerWithMember = {
        ...partnerData,
        member: memberData,
        reviews: reviewsWithMaskedNames,
      };

      return successResponse(result);
    }

    // GET /api-partners/home - Aggregated data for home screen
    if (pathname === '/api-partners/home' && req.method === 'GET') {
      const params = getQueryParams(req.url);
      const onlineLimit = Math.min(parseInt(params.onlineLimit || '8', 10), 20);
      const recentLimit = Math.min(parseInt(params.recentLimit || '5', 10), 20);
      const currentUserId = params.currentUserId;

      const shuffleArray = <T>(array: T[]): T[] => {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
      };

      const { data: partnersData, error: partnersError } = await supabase
        .from('partners')
        .select(`
          id,
          member_id,
          partner_name,
          partner_message,
          partner_status,
          partner_applied_at,
          partner_reviewed_at,
          total_points,
          game_info,
          created_at,
          updated_at,
          background_images,
          member:members!member_id(
            id,
            member_code,
            name,
            profile_image,
            favorite_game,
            current_status,
            updated_at,
            social_id
          )
        `)
        .eq('partner_status', 'approved')
        .order('created_at', { ascending: false });

      if (partnersError) {
        console.error('Partners fetch error:', partnersError);
        return errorResponse(
          'PARTNER_FETCH_FAILED',
          'Failed to load partners list',
          partnersError.message,
          500,
        );
      }

      if (!partnersData) {
        return successResponse({
          partners: [],
          onlinePartners: [],
          recentPartners: [],
          userReviews: [],
        });
      }

      const filteredPartners = partnersData.filter((partner) => {
        const member = partner.member;
        if (!member) return false;
        return !(member.social_id && member.social_id.startsWith('test-social-'));
      });

      const partnerIds = filteredPartners.map((partner) => partner.id);

      const { data: reviewsData, error: reviewsError } = partnerIds.length
        ? await supabase
            .from('reviews')
            .select(
              `
                id,
                rating,
                comment,
                points_earned,
                created_at,
                target_partner_id,
                member_id
              `,
            )
            .in('target_partner_id', partnerIds)
            .gt('rating', 0)
        : { data: [], error: null };

      if (reviewsError) {
        console.error('Reviews fetch error:', reviewsError);
      }

      const reviewsByPartner = new Map<
        string,
        { totalRating: number; count: number; reviews: Array<any> }
      >();

      (reviewsData || []).forEach((review) => {
        if (!review.target_partner_id || review.rating == null) return;
        const existing =
          reviewsByPartner.get(review.target_partner_id) || {
            totalRating: 0,
            count: 0,
            reviews: [],
          };
        existing.totalRating += review.rating;
        existing.count += 1;
        existing.reviews.push(review);
        reviewsByPartner.set(review.target_partner_id, existing);
      });

      const partnersWithStats = filteredPartners.map((partner) => {
        const member = partner.member;
        const stats = reviewsByPartner.get(partner.id);
        const { social_id: _socialId, ...sanitizedMember } = member || {};
        return {
          ...partner,
          member: sanitizedMember,
          averageRating:
            stats && stats.count > 0 ? stats.totalRating / stats.count : undefined,
          reviewCount: stats?.count || 0,
        };
      });

      const nonOfflinePartners = partnersWithStats.filter(
        (partner) => partner.member?.current_status !== 'offline',
      );
      const offlinePartners = partnersWithStats.filter(
        (partner) => partner.member?.current_status === 'offline',
      );

      const shuffledOnline = shuffleArray(nonOfflinePartners);
      const onlinePartners = shuffledOnline.slice(0, onlineLimit);
      const remainingOnline = shuffledOnline.slice(onlineLimit);
      const shuffledOffline = shuffleArray(offlinePartners);
      const allPartners = [...onlinePartners, ...remainingOnline, ...shuffledOffline];

      let recentPartners: Array<any> = [];
      let userReviews: Array<any> = [];

      if (currentUserId) {
        const { data: userReviewsData, error: userReviewsError } = await supabase
          .from('reviews')
          .select(
            `
              id,
              rating,
              comment,
              points_earned,
              created_at,
              target_partner_id
            `,
          )
          .eq('member_id', currentUserId)
          .order('created_at', { ascending: false })
          .limit(recentLimit * 3);

        if (userReviewsError) {
          console.error('User reviews fetch error:', userReviewsError);
        } else if (userReviewsData) {
          userReviews = userReviewsData;
          const seen = new Set<string>();
          for (const review of userReviewsData) {
            if (!review.target_partner_id || seen.has(review.target_partner_id)) continue;
            const partner = partnersWithStats.find((p) => p.id === review.target_partner_id);
            if (partner) {
              recentPartners.push({
                ...partner,
                lastReviewDate: review.created_at,
                lastReview: review,
              });
              seen.add(review.target_partner_id);
            }
            if (recentPartners.length >= recentLimit) break;
          }
        }
      }

      return successResponse({
        partners: partnersWithStats,
        allPartners,
        onlinePartners,
        recentPartners,
        userReviews,
      });
    }

    // GET /api-partners/jobs/:memberId - Get partner jobs
    if (pathname.includes('/jobs/') && req.method === 'GET') {
      const memberId = pathname.split('/jobs/')[1];
      const params = getQueryParams(req.url);
      const activeOnly = params.active === 'true';

      if (!memberId) {
        return errorResponse('INVALID_MEMBER_ID', 'Member ID is required');
      }

      // 1. Find partner by member_id
      const { data: partnerData, error: partnerError } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', memberId)
        .single();

      if (partnerError) {
        if (partnerError.code === 'PGRST116') {
          // Partner not found - return empty array
          return successResponse([], { isPartner: false });
        }
        throw partnerError;
      }

      // 2. Get partner jobs
      let query = supabase
        .from('partner_jobs')
        .select('*')
        .eq('partner_id', partnerData.id);

      if (activeOnly) {
        query = query.eq('is_active', true);
      }

      const { data: jobsData, error: jobsError } = await query.order('created_at', {
        ascending: true,
      });

      if (jobsError) throw jobsError;

      return successResponse(jobsData || [], { isPartner: true });
    }

    // GET /api-partners/list - Get partners list with pagination
    if (pathname === '/api-partners/list' && req.method === 'GET') {
      const params = getQueryParams(req.url);
      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '10');
      const search = params.search;
      const gameFilter = params.game;
      const offset = (page - 1) * limit;

      let query = supabase
        .from('partners')
        .select(`
          *,
          members!member_id(id, member_code, name, profile_image, favorite_game, current_status)
        `, { count: 'exact' })
        .eq('partner_status', 'approved');

      // Apply search filter
      if (search) {
        query = query.or(`partner_name.ilike.%${search}%,members.name.ilike.%${search}%`);
      }

      // Apply game filter
      if (gameFilter) {
        query = query.contains('members.favorite_game', [gameFilter]);
      }

      const { data: partnersData, error: partnersError, count } = await query
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false });

      if (partnersError) throw partnersError;

      return successResponse(partnersData || [], {
        total: count || 0,
        page,
        limit,
      });
    }

    // GET /api-partners/recent - Get recent partners
    if (pathname === '/api-partners/recent' && req.method === 'GET') {
      const params = getQueryParams(req.url);
      const limit = parseInt(params.limit || '6');

      const { data: partnersData, error: partnersError } = await supabase
        .from('partners')
        .select(`
          *,
          members!member_id(id, member_code, name, profile_image, favorite_game, current_status)
        `)
        .eq('partner_status', 'approved')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (partnersError) throw partnersError;

      return successResponse(partnersData || []);
    }

    // GET /api-partners/request-status - Get request status between two users
    if (pathname === '/api-partners/request-status' && req.method === 'GET') {
      const params = getQueryParams(req.url);
      const currentUserId = params.currentUserId;
      const partnerId = params.partnerId;

      if (!currentUserId || !partnerId) {
        return errorResponse('INVALID_PARAMS', 'currentUserId and partnerId are required');
      }

      try {
        // 상대방이 파트너인지 확인
        const { data: partnerData, error: partnerError } = await supabase
          .from('partners')
          .select('id')
          .eq('member_id', partnerId)
          .maybeSingle();

        if (partnerError && partnerError.code !== 'PGRST116') {
          throw partnerError;
        }

        if (!partnerData) {
          return successResponse({
            hasActiveRequest: false,
            requestInfo: null,
            activeRequests: [],
          });
        }

        // 현재 사용자가 파트너인지 확인 (양방향 요청 조회용)
        const { data: currentUserPartnerData, error: currentUserPartnerError } = await supabase
          .from('partners')
          .select('id')
          .eq('member_id', currentUserId)
          .maybeSingle();

        if (currentUserPartnerError && currentUserPartnerError.code !== 'PGRST116') {
          throw currentUserPartnerError;
        }

        const filters = [
          `and(client_id.eq.${currentUserId},partner_id.eq.${partnerData.id})`,
        ];

        if (currentUserPartnerData) {
          filters.push(
            `and(client_id.eq.${partnerId},partner_id.eq.${currentUserPartnerData.id})`
          );
        }

        const partnerIdsToCheck = new Set<string>();
        partnerIdsToCheck.add(partnerData.id);
        if (currentUserPartnerData) {
          partnerIdsToCheck.add(currentUserPartnerData.id);
        }

        const { data: partnerJobsData, error: partnerJobsError } = await supabase
          .from('partner_jobs')
          .select('id, partner_id')
          .in('partner_id', Array.from(partnerIdsToCheck));

        if (partnerJobsError) throw partnerJobsError;

        const partnerJobMap = new Map<string, Set<string>>();

        (partnerJobsData || []).forEach((job: any) => {
          const set = partnerJobMap.get(job.partner_id) || new Set<string>();
          set.add(job.id);
          partnerJobMap.set(job.partner_id, set);
        });

        const { data: requestsData, error: requestsError } = await supabase
          .from('partner_requests')
          .select('id, request_type, partner_job_id, job_count, coins_per_job, status, call_id, created_at, updated_at')
          .or(filters.join(','))
          .in('status', ['pending', 'in_progress'])
          .order('created_at', { ascending: false });

        if (requestsError) throw requestsError;

        const activeRequests = (requestsData || []).filter((request: any) => {
          if (!request.partner_job_id) {
            return true;
          }

          const jobSet = partnerJobMap.get(request.partner_id);
          return Boolean(jobSet && jobSet.has(request.partner_job_id));
        });

        if (activeRequests.length > 0) {
          return successResponse({
            hasActiveRequest: true,
            requestInfo: activeRequests[0],
            activeRequests,
          });
        }

        return successResponse({
          hasActiveRequest: false,
          requestInfo: null,
          activeRequests: [],
          debug: {
            partnerIdPassed: partnerId,
            resolvedPartnerId: partnerData.id,
            asPartners: Array.from(partnerIdsToCheck),
            partnerJobCount: partnerJobMap.size,
            filters,
            fetchedRequests: requestsData?.length || 0,
          },
        });

      } catch (error) {
        console.error('Error checking request status:', error);
        return errorResponse('REQUEST_STATUS_ERROR', 'Failed to check request status', error.message);
      }
    }

    // GET /api-partners/lookup-by-member-id/:memberId - Get partner id by member_id
    if (pathname.includes('/lookup-by-member-id/') && req.method === 'GET') {
      const memberId = pathname.split('/lookup-by-member-id/')[1];

      if (!memberId) {
        return errorResponse('INVALID_MEMBER_ID', 'Member ID is required');
      }

      try {
        // Find partner by member_id
        const { data: partnerData, error: partnerError } = await supabase
          .from('partners')
          .select('id')
          .eq('member_id', memberId)
          .maybeSingle();

        if (partnerError) {
          if (partnerError.code === 'PGRST116') {
            // Partner not found - return null
            return successResponse(null, { isPartner: false });
          }
          throw partnerError;
        }

        return successResponse(partnerData, { isPartner: !!partnerData });
      } catch (error) {
        return errorResponse('LOOKUP_ERROR', 'Failed to lookup partner', error.message);
      }
    }

    return errorResponse('ROUTE_NOT_FOUND', 'API route not found', null, 404);

  } catch (error) {
    console.error('Partners API error:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      'Internal server error',
      error.message,
      500
    );
  }
});