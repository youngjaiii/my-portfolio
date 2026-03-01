loimport { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import type { PartnerWithMember } from '../_shared/types.ts';
import { corsHeaders, createSupabaseClient, errorResponse, getAuthUser, getQueryParams, maskName, parseRequestBody, successResponse } from '../_shared/utils.ts';

serve(async (req) => {
  try {
    // Handle CORS preflight - must be inside try-catch
    if (req.method === 'OPTIONS') {
      return new Response('ok', { 
        status: 200,
        headers: corsHeaders 
      });
    }

    const url = new URL(req.url);
    const pathname = url.pathname;
    const supabase = createSupabaseClient();

    // Get authenticated user (optional)
    let user: any = null;
    try {
      user = await getAuthUser(req);
    } catch (_e) {
      // 로그인 안 되어 있으면 user null
      user = null;
    }

    // GET /api-partners/details/:memberCode - Get partner details by member code
    if (pathname.includes('/details/') && req.method === 'GET') {
      // Extract memberCode from pathname (handles both /details/MY778954 and /functions/v1/api-partners/details/MY778954)
      const parts = pathname.split('/details/');
      const memberCode = parts.length > 1 ? parts[1].split('/')[0] : null;

      if (!memberCode) {
        return errorResponse('INVALID_MEMBER_CODE', 'Member code is required');
      }

      // 1. Find member by member_code (차단 확인을 위해 먼저 조회)
      const { data: memberData, error: memberError } = await supabase
        .from('members')
        .select('*')
        .eq('member_code', memberCode)
        .maybeSingle();

      if (memberError || !memberData) {
        return errorResponse('MEMBER_NOT_FOUND', 'Member not found');
      }

      // Remove email from member data before sending response
      const { email: _email, ...sanitizedMemberData } = memberData;

      // 0. 차단 여부 확인 (로그인한 사용자가 있을 때만)
      if (user?.id) {
        // 현재 사용자의 member_code 조회
        const { data: currentUserData } = await supabase
          .from('members')
          .select('member_code')
          .eq('id', user.id)
          .single();

        console.log('🔍 [차단 체크] user.id:', user.id);
        console.log('🔍 [차단 체크] currentUserData:', currentUserData);
        console.log('🔍 [차단 체크] memberData.id (타겟 uuid):', memberData.id);
        console.log('🔍 [차단 체크] currentUserData.member_code (내 member_code):', currentUserData?.member_code);

        // 상대방(memberData.id)이 나를 차단했는지 확인
        if (currentUserData?.member_code) {
          const { data: blockedByData, error: blockCheckError } = await supabase
            .from('member_blocks')
            .select('id')
            .eq('blocker_member', memberData.id)  // ✅ uuid 사용 (차단한 사람)
            .eq('blocked_member', currentUserData.member_code)  // member_code 사용 (차단당한 사람)
            .maybeSingle();

          console.log('🔍 [차단 체크] 쿼리:', { blocker_member: memberData.id, blocked_member: currentUserData.member_code });
          console.log('🔍 [차단 체크] blockedByData:', blockedByData);
          console.log('🔍 [차단 체크] blockCheckError:', blockCheckError);

          if (blockedByData) {
            console.log('🚫 [차단됨] 상대방이 나를 차단함');
            return errorResponse('BLOCKED_BY_USER', '이 사용자의 프로필을 볼 수 없습니다.', null, 403);
          }
        }
      }

      // 2. Find partner by member_id
      // - 본인 프로필: 모든 상태 조회 가능 (pending, approved, rejected)
      // - 타인 프로필: approved만 조회 가능
      const isOwnProfile = user?.id === memberData.id;

      let partnerQuery = supabase
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
          ben_lists,
          is_seller
        `)
        .eq('member_id', memberData.id);

      // 타인 프로필인 경우에만 approved 필터 적용
      if (!isOwnProfile) {
        partnerQuery = partnerQuery.eq('partner_status', 'approved');
      }

      const { data: partnerData, error: partnerError } = await partnerQuery.maybeSingle();

      if (partnerError || !partnerData) {
        const errorMsg = isOwnProfile
          ? 'Partner data not found. Please apply as a partner first.'
          : 'Partner not found or not approved';
        return errorResponse('PARTNER_NOT_FOUND', errorMsg);
      }

      // 타인의 pending/rejected 파트너는 조회 불가
      if (!isOwnProfile && partnerData.partner_status !== 'approved') {
        return errorResponse('PARTNER_NOT_APPROVED', 'This partner is not approved yet');
      }

      // 2-1. Load partner categories (N:N via partner_categories, user_id = auth.user_id = members.id)
      let categories: Array<{ category_id: number | null; detail_category_id: number | null; created_at: string }> = [];
      try {
        const { data: categoryRows, error: categoryError } = await supabase
          .from('partner_categories')
          .select('category_id, detail_category_id, created_at')
          .eq('user_id', memberData.id)
          .order('created_at', { ascending: true });

        if (!categoryError && categoryRows) {
          categories = categoryRows as any;
        } else if (categoryError) {
          console.error('Partner categories fetch error (details):', categoryError);
        }
      } catch (e) {
        console.error('Partner categories fetch exception (details):', e);
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

      // 5. Check follow status
      let is_followed = false;
      if (user?.id) {
        const { data: followData, error: followError } = await supabase
          .from('follow')
          .select('id')
          .eq('follower_id', user.id)
          .eq('partner_id', partnerData.id)
          .maybeSingle();

        if (followError) throw followError;
        is_followed = !!followData;
      }

      // 5-1. Check membership subscription status
      let subscribed_membership: any = null;
      let has_membership = false;
      if (user?.id) {
        // 해당 파트너의 멤버십 목록 조회 (테이블명: membership)
        const { data: membershipList } = await supabase
          .from('membership')
          .select('id')
          .eq('partner_id', partnerData.id)
          .eq('is_active', true);

        if (membershipList && membershipList.length > 0) {
          const membershipIds = membershipList.map((m: any) => m.id);

          // 현재 유저가 구독 중인 멤버십 확인 (멤버십 상세 정보 포함)
          const { data: subscription } = await supabase
            .from('membership_subscriptions')
            .select(`
              id,
              membership_id,
              status,
              started_at,
              expired_at,
              next_billing_at,
              membership:membership!membership_id(
                id,
                name,
                description,
                monthly_price,
                is_active,
                created_at
              )
            `)
            .eq('user_id', user.id)
            .in('membership_id', membershipIds)
            .eq('status', 'active')
            .maybeSingle();

          if (subscription) {
            subscribed_membership = {
              subscription_id: subscription.id,
              membership_id: subscription.membership_id,
              status: subscription.status,
              started_at: subscription.started_at ? String(subscription.started_at).split('T')[0] : null,
              expired_at: subscription.expired_at ? String(subscription.expired_at).split('T')[0] : null,
              next_billing_at: subscription.next_billing_at,
              membership: subscription.membership,
            };
            has_membership = true;
          }
        }
      }

      // 6. Get posts count
      const { count: postsCount, error: postsCountError } = await supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('partner_id', partnerData.id)
        .eq('is_published', true);

      if (postsCountError) {
        console.error('Posts count error:', postsCountError);
      }

      // 7. Get followers count
      const { count: followersCount, error: followersCountError } = await supabase
        .from('follow')
        .select('*', { count: 'exact', head: true })
        .eq('partner_id', partnerData.id);

      if (followersCountError) {
        console.error('Followers count error:', followersCountError);
      }

      // 8. 채팅방 자동 생성/조회 (로그인 + 타인 프로필 + admin이 아닌 경우에만)
      let chat_room_id: string | null = null;
      let visitorRole: string | null = null;
      if (user?.id) {
        const { data: visitorData } = await supabase
          .from('members')
          .select('role')
          .eq('id', user.id)
          .single();
        visitorRole = visitorData?.role ?? null;
      }
      if (user?.id && !isOwnProfile && visitorRole !== 'admin') {
        // 기존 채팅방 조회
        const { data: existingRoom } = await supabase
          .from('chat_rooms')
          .select('id, left_by_creator, left_by_partner, created_by')
          .or(`and(created_by.eq.${user.id},partner_id.eq.${memberData.id}),and(created_by.eq.${memberData.id},partner_id.eq.${user.id})`)
          .maybeSingle();

        if (existingRoom) {
          // 본인이 나갔던 채팅방이면 복원
          const isCreator = existingRoom.created_by === user.id;
          const hasLeft = isCreator ? existingRoom.left_by_creator : existingRoom.left_by_partner;

          if (hasLeft) {
            // 나갔던 채팅방 복원
            const updateData: Record<string, boolean> = { is_active: true };
            if (isCreator) {
              updateData.left_by_creator = false;
            } else {
              updateData.left_by_partner = false;
            }

            await supabase
              .from('chat_rooms')
              .update(updateData)
              .eq('id', existingRoom.id);
          }

          chat_room_id = existingRoom.id;
        } else {
          // 새 채팅방 생성
          const { data: newRoom } = await supabase
            .from('chat_rooms')
            .insert([{ created_by: user.id, partner_id: memberData.id, is_active: true }])
            .select('id')
            .single();

          if (newRoom) {
            chat_room_id = newRoom.id;
          }
        }
      }

      // 9. Combine data and add is_followed, posts_count, followers_count, categories, membership info, chat_room_id
      //    원본 partners 테이블의 follow_count, post_count 컬럼은 응답에서 제거
      const { follow_count: _followCount, post_count: _postCount, ...partnerWithoutCounts } = partnerData as any;

      const result: PartnerWithMember & {
        is_followed: boolean;
        posts_count: number;
        followers_count: number;
        categories: typeof categories;
        has_membership: boolean;
        subscribed_membership: any;
        chat_room_id: string | null;
      } = {
        ...partnerWithoutCounts,
        member: sanitizedMemberData,
        reviews: reviewsWithMaskedNames,
        is_followed,
        posts_count: postsCount || 0,
        followers_count: followersCount || 0,
        categories,
        has_membership,
        subscribed_membership,
        chat_room_id,
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
      // Extract memberId from pathname (handles both /jobs/{id} and /functions/v1/api-partners/jobs/{id})
      const parts = pathname.split('/jobs/');
      const memberId = parts.length > 1 ? parts[1].split('/')[0] : null;
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

      // 검색어가 있으면 먼저 members 테이블에서 이름 검색해서 member_id 목록 가져오기
      let searchMemberIds: string[] = [];
      if (search) {
        const { data: matchedMembers } = await supabase
          .from('members')
          .select('id')
          .ilike('name', `%${search}%`);
        
        searchMemberIds = (matchedMembers || []).map((m: any) => m.id);
      }

      let query = supabase
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
          ben_lists,
          members!member_id(id, member_code, name, profile_image, favorite_game, current_status)
        `, { count: 'exact' })
        .eq('partner_status', 'approved');

      // Apply search filter (partner_name OR member_id in searchMemberIds)
      if (search) {
        if (searchMemberIds.length > 0) {
          // partner_name 매칭 또는 member_id가 검색된 회원에 포함
          query = query.or(`partner_name.ilike.%${search}%,member_id.in.(${searchMemberIds.join(',')})`);
        } else {
          // member 이름으로 검색된 결과가 없으면 partner_name만 검색
          query = query.ilike('partner_name', `%${search}%`);
        }
      }

      // Apply game filter - members 테이블에서 먼저 필터링
      if (gameFilter) {
        const { data: gameMembers } = await supabase
          .from('members')
          .select('id')
          .contains('favorite_game', [gameFilter]);
        
        const gameMemberIds = (gameMembers || []).map((m: any) => m.id);
        if (gameMemberIds.length > 0) {
          query = query.in('member_id', gameMemberIds);
        } else {
          // 해당 게임을 하는 회원이 없으면 빈 결과 반환
          return successResponse([], {
            total: 0,
            page,
            limit,
          });
        }
      }

      const { data: partnersData, error: partnersError, count } = await query
        .range(offset, offset + limit - 1)
        .order('created_at', { ascending: false });

      if (partnersError) throw partnersError;

      // 현재 사용자가 팔로우한 파트너 ID 목록 조회 (로그인한 경우에만)
      let followedPartnerIds = new Set<string>();
      if (user?.id && partnersData && partnersData.length > 0) {
        const partnerIds = partnersData.map((p: any) => p.id);
        console.log(`[api-partners/list] 팔로우 여부 확인 - user_id: ${user.id}, partner_ids: ${partnerIds.join(', ')}`);
        
        const { data: followsData, error: followsError } = await supabase
          .from('follow')
          .select('partner_id')
          .eq('follower_id', user.id)
          .in('partner_id', partnerIds);
        
        if (followsError) {
          console.error(`[api-partners/list] 팔로우 조회 오류:`, followsError);
        } else if (followsData) {
          followedPartnerIds = new Set(followsData.map((f: any) => f.partner_id));
          console.log(`[api-partners/list] 팔로우한 파트너 ID: ${Array.from(followedPartnerIds).join(', ')}`);
        }
      }

      // 각 파트너에 is_followed 값 추가
      const partnersWithFollow = (partnersData || []).map((partner: any) => {
        const isFollowed = user?.id ? followedPartnerIds.has(partner.id) : false;
        console.log(`[api-partners/list] 파트너 ${partner.id} (${partner.partner_name}) - is_followed: ${isFollowed}`);
        return {
          ...partner,
          is_followed: isFollowed,
        };
      });

      return successResponse(partnersWithFollow || [], {
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
          ben_lists,
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
        // 현재 사용자가 파트너인지 확인
        const { data: currentUserPartnerData } = await supabase
          .from('partners')
          .select('id')
          .eq('member_id', currentUserId)
          .single();

        // 상대방이 파트너인지 확인
        const { data: partnerData } = await supabase
          .from('partners')
          .select('id')
          .eq('member_id', partnerId)
          .single();

        let activeRequests: Array<any> = [];

        if (currentUserPartnerData && partnerData) {
          // 둘 다 파트너인 경우는 처리하지 않음
          return successResponse({
            hasActiveRequest: false,
            requestInfo: null,
            activeRequests: [],
          });
        } else         if (currentUserPartnerData) {
          // 현재 사용자가 파트너인 경우: 상대방이 클라이언트
          const result = await supabase
            .from('partner_requests')
            .select('id, request_type, job_name, job_count, coins_per_job, status, call_id, created_at, accepted_at, updated_at, client_id')
            .eq('client_id', partnerId)
            .eq('partner_id', currentUserPartnerData.id)
            .in('status', ['pending', 'in_progress'])
            .order('created_at', { ascending: false });

          activeRequests = result.data || [];
        } else if (partnerData) {
          // 상대방이 파트너인 경우: 현재 사용자가 클라이언트
          const result = await supabase
            .from('partner_requests')
            .select('id, request_type, job_name, job_count, coins_per_job, status, call_id, created_at, accepted_at, updated_at, client_id')
            .eq('client_id', currentUserId)
            .eq('partner_id', partnerData.id)
            .in('status', ['pending', 'in_progress'])
            .order('created_at', { ascending: false });

          activeRequests = result.data || [];
        } else {
          // 둘 다 일반 사용자인 경우
          return successResponse({
            hasActiveRequest: false,
            requestInfo: null,
            activeRequests: [],
          });
        }

        if (activeRequests && activeRequests.length > 0) {
          return successResponse({
            hasActiveRequest: true,
            requestInfo: activeRequests[0],
            activeRequests,
          });
        } else {
          return successResponse({
            hasActiveRequest: false,
            requestInfo: null,
            activeRequests: [],
          });
        }

      } catch (error) {
        console.error('Error checking request status:', error);
        return errorResponse('REQUEST_STATUS_ERROR', 'Failed to check request status', error.message);
      }
    }

    // ----------------------------------
    // GET /api-partners/ranking → 특정 파트너에 대한 사용자 순위 조회
    // query: partner_id (필수), limit? (기본값: 100)
    //  - 해당 파트너에게 포인트를 사용한 사용자들의 순위 계산
    //  - 같은 포인트일 경우 같은 순위 부여
    // ----------------------------------
    if (pathname === '/api-partners/ranking' && req.method === 'GET') {
      const params = getQueryParams(req.url);
      let partnerId = params.partner_id || params.partnerId;
      const limit = parseInt(params.limit || '100');
      const maxLimit = Math.min(limit, 1000); // 최대 1000개

      // partner_id가 없으면 토큰 기준으로 현재 유저가 파트너인지 확인
      if (!partnerId) {
        if (!user || !user.id) {
          return errorResponse('PARTNER_ID_REQUIRED', 'partner_id is required or authentication is required', null, 400);
        }

        // 현재 유저가 파트너인지 확인
        const { data: userPartner, error: userPartnerError } = await supabase
          .from('partners')
          .select('id, partner_status')
          .eq('member_id', user.id)
          .maybeSingle();

        if (userPartnerError) {
          return errorResponse('PARTNER_CHECK_ERROR', userPartnerError.message, null, 500);
        }

        if (!userPartner || userPartner.partner_status !== 'approved') {
          return errorResponse('PARTNER_ID_REQUIRED', 'partner_id is required or user must be an approved partner', null, 400);
        }

        // 현재 유저의 파트너 ID 사용
        partnerId = userPartner.id;
      }

      // 1. 파트너 존재 확인
      const { data: partner, error: partnerError } = await supabase
        .from('partners')
        .select('id, partner_name, partner_status, member_id')
        .eq('id', partnerId)
        .maybeSingle();

      if (partnerError) {
        return errorResponse('PARTNER_FETCH_ERROR', partnerError.message, null, 500);
      }

      if (!partner || partner.partner_status !== 'approved') {
        return errorResponse('PARTNER_NOT_FOUND', 'Partner not found or not approved', null, 404);
      }

      // 2. 해당 파트너에 대한 포인트 사용 내역 집계
      // 2-1. 퀘스트 신청 완료 (partner_requests)
      const { data: completedRequests, error: requestsError } = await supabase
        .from('partner_requests')
        .select('client_id, total_coins, coins_per_job, job_count')
        .eq('partner_id', partnerId)
        .eq('status', 'completed');

      // 2-1-1. 후원 포인트 (member_points_logs에서 log_id가 donation_으로 시작하는 것)
      // log_id 형식: donation_{member_id}_{timestamp}
      // partner.member_id를 사용하여 후원 로그 조회
      const { data: donationLogs, error: donationLogsError } = await supabase
        .from('member_points_logs')
        .select('member_id, amount')
        .eq('type', 'spend')
        .like('log_id', `donation_${partner.member_id}_%`);

      if (requestsError) {
        return errorResponse('REQUESTS_FETCH_ERROR', requestsError.message, null, 500);
      }

      // 2-2. 멤버십 구독 (membership_subscriptions)
      const { data: memberships, error: membershipsError } = await supabase
        .from('membership')
        .select('id, monthly_price, discount_rate')
        .eq('partner_id', partnerId)
        .eq('is_active', true);

      if (membershipsError) {
        return errorResponse('MEMBERSHIPS_FETCH_ERROR', membershipsError.message, null, 500);
      }

      const membershipIds = (memberships || []).map((m: any) => m.id);
      let activeSubscriptions: any[] = [];
      
      if (membershipIds.length > 0) {
        const { data: subscriptions, error: subsError } = await supabase
          .from('membership_subscriptions')
          .select('user_id, membership_id')
          .in('membership_id', membershipIds)
          .eq('status', 'active');

        if (subsError) {
          return errorResponse('SUBSCRIPTIONS_FETCH_ERROR', subsError.message, null, 500);
        }

        activeSubscriptions = subscriptions || [];
      }

      // 2-3. 게시글 구매 (post_unlocks)
      const { data: partnerPosts, error: postsError } = await supabase
        .from('posts')
        .select('id, point_price')
        .eq('partner_id', partnerId)
        .not('point_price', 'is', null)
        .gt('point_price', 0);

      if (postsError) {
        return errorResponse('POSTS_FETCH_ERROR', postsError.message, null, 500);
      }

      const postIds = (partnerPosts || []).map((p: any) => p.id);
      let postUnlocks: any[] = [];

      if (postIds.length > 0) {
        const { data: unlocks, error: unlocksError } = await supabase
          .from('post_unlocks')
          .select('user_id, post_id')
          .in('post_id', postIds);

        if (unlocksError) {
          return errorResponse('UNLOCKS_FETCH_ERROR', unlocksError.message, null, 500);
        }

        postUnlocks = unlocks || [];
      }

      // 2-4. 스트림 후원 (stream_donations)
      // 성공적으로 완료된 후원만 포함 (completed, success)
      // 제외: pending(대기), accepted(수락됨), rejected(거절-환불), playing(재생중), failed(실패-환불), skipped(스킵)
      const { data: streamDonations, error: streamDonationsError } = await supabase
        .from('stream_donations')
        .select('donor_id, amount')
        .eq('recipient_partner_id', partnerId)
        .in('status', ['completed', 'success']);

      // 3. 사용자별 포인트 합계 계산
      const userPointsMap = new Map<string, number>();

      // 3-1. 퀘스트 신청 포인트
      (completedRequests || []).forEach((req: any) => {
        const points = req.total_coins || (req.coins_per_job * req.job_count) || 0;
        const current = userPointsMap.get(req.client_id) || 0;
        userPointsMap.set(req.client_id, current + points);
      });

      // 3-1-1. 1:1 채팅 후원 포인트
      if (!donationLogsError && donationLogs) {
        donationLogs.forEach((log: any) => {
          const current = userPointsMap.get(log.member_id) || 0;
          userPointsMap.set(log.member_id, current + (log.amount || 0));
        });
      }

      // 3-1-2. 스트림 후원 포인트
      if (!streamDonationsError && streamDonations) {
        streamDonations.forEach((donation: any) => {
          const current = userPointsMap.get(donation.donor_id) || 0;
          userPointsMap.set(donation.donor_id, current + (donation.amount || 0));
        });
      }

      // 3-2. 멤버십 구독 포인트
      const membershipPriceMap = new Map<string, number>();
      (memberships || []).forEach((m: any) => {
        const basePrice = m.monthly_price || 0;
        const discountRate = m.discount_rate || 0;
        const finalPrice = discountRate > 0 
          ? Math.round(basePrice * (1 - discountRate / 100))
          : basePrice;
        membershipPriceMap.set(m.id, finalPrice);
      });

      activeSubscriptions.forEach((sub: any) => {
        const price = membershipPriceMap.get(sub.membership_id) || 0;
        const current = userPointsMap.get(sub.user_id) || 0;
        userPointsMap.set(sub.user_id, current + price);
      });

      // 3-3. 게시글 구매 포인트
      const postPriceMap = new Map<string, number>();
      (partnerPosts || []).forEach((p: any) => {
        postPriceMap.set(p.id, p.point_price || 0);
      });

      postUnlocks.forEach((unlock: any) => {
        const price = postPriceMap.get(unlock.post_id) || 0;
        const current = userPointsMap.get(unlock.user_id) || 0;
        userPointsMap.set(unlock.user_id, current + price);
      });

      // 4. 사용자 정보 조회
      const userIds = Array.from(userPointsMap.keys());
      if (userIds.length === 0) {
        return successResponse([]);
      }

      const { data: users, error: usersError } = await supabase
        .from('members')
        .select('id, name, profile_image, member_code')
        .in('id', userIds);

      if (usersError) {
        return errorResponse('USERS_FETCH_ERROR', usersError.message, null, 500);
      }

      // 5. 사용자 정보와 포인트 합계 결합
      const usersWithPoints = (users || []).map((user: any) => ({
        user_id: user.id,
        user_name: user.name,
        profile_image: user.profile_image,
        member_code: user.member_code,
        total_points_spent: userPointsMap.get(user.id) || 0,
      }));

      // 6. 포인트 기준 내림차순 정렬
      usersWithPoints.sort((a: any, b: any) => b.total_points_spent - a.total_points_spent);

      // 7. 순위 계산 (같은 포인트일 경우 같은 순위)
      let currentRank = 1;
      let previousPoints: number | null = null;
      const rankedUsers = usersWithPoints.map((user: any, index: number) => {
        // 첫 번째 항목이 아니고, 이전 포인트보다 적으면 순위 업데이트
        if (previousPoints !== null && user.total_points_spent < previousPoints) {
          currentRank = index + 1;
        }
        // 같은 포인트면 currentRank 유지
        
        previousPoints = user.total_points_spent;
        
        return {
          rank: currentRank,
          user_id: user.user_id,
          user_name: user.user_name,
          profile_image: user.profile_image,
          member_code: user.member_code,
          total_points_spent: user.total_points_spent,
        };
      });

      // 8. limit 적용
      const limitedUsers = rankedUsers.slice(0, maxLimit);

      return successResponse(limitedUsers, {
        partner_id: partnerId,
        partner_name: partner.partner_name,
        total: rankedUsers.length,
        limit: maxLimit,
      });
    }

    // PUT /api-partners/store-agreements - 스토어 이용 동의 업데이트
    if (pathname.includes('/store-agreements') && req.method === 'PUT') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body) {
        return errorResponse('INVALID_REQUEST', '요청 본문이 필요합니다.');
      }

      const {
        store_terms_agreed,
        store_prohibited_items_agreed,
        store_fee_settlement_agreed,
        store_privacy_agreed,
      } = body;

      // 파트너 확인
      const { data: partner, error: partnerError } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', user.id)
        .single();

      if (partnerError || !partner) {
        return errorResponse('FORBIDDEN', '파트너만 접근할 수 있습니다.', null, 403);
      }

      // 동의 정보 업데이트
      const updateData: Record<string, boolean> = {};
      if (store_terms_agreed !== undefined) updateData.store_terms_agreed = store_terms_agreed;
      if (store_prohibited_items_agreed !== undefined) updateData.store_prohibited_items_agreed = store_prohibited_items_agreed;
      if (store_fee_settlement_agreed !== undefined) updateData.store_fee_settlement_agreed = store_fee_settlement_agreed;
      if (store_privacy_agreed !== undefined) updateData.store_privacy_agreed = store_privacy_agreed;

      const { data: updatedPartner, error: updateError } = await supabase
        .from('partners')
        .update(updateData)
        .eq('id', partner.id)
        .select()
        .single();

      if (updateError) throw updateError;

      return successResponse(updatedPartner);
    }

    // ===== GET /api-partners/welcome-message - 본인 환영 메시지 조회 (파트너 전용) =====
    if (pathname === '/api-partners/welcome-message' && req.method === 'GET') {
      const user = await getAuthUser(req);

      // 파트너 확인 및 환영 메시지 조회
      const { data: partner, error: partnerError } = await supabase
        .from('partners')
        .select('id, welcome_message')
        .eq('member_id', user.id)
        .single();

      if (partnerError || !partner) {
        return errorResponse('FORBIDDEN', '파트너만 접근할 수 있습니다.', null, 403);
      }

      return successResponse({
        welcome_message: partner.welcome_message || null
      });
    }

    // ===== PUT /api-partners/welcome-message - 환영 메시지 설정/수정 (파트너 전용) =====
    if (pathname === '/api-partners/welcome-message' && req.method === 'PUT') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body) {
        return errorResponse('INVALID_REQUEST', '요청 본문이 필요합니다.');
      }

      const { welcome_message } = body;

      // welcome_message는 null 또는 문자열
      if (welcome_message !== null && typeof welcome_message !== 'string') {
        return errorResponse('INVALID_REQUEST', 'welcome_message는 문자열 또는 null이어야 합니다.');
      }

      // 메시지 길이 제한 (500자)
      if (welcome_message && welcome_message.length > 500) {
        return errorResponse('INVALID_REQUEST', '환영 메시지는 500자 이하로 입력해주세요.');
      }

      // 파트너 확인
      const { data: partner, error: partnerError } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', user.id)
        .single();

      if (partnerError || !partner) {
        return errorResponse('FORBIDDEN', '파트너만 접근할 수 있습니다.', null, 403);
      }

      // 환영 메시지 업데이트
      const { data: updatedPartner, error: updateError } = await supabase
        .from('partners')
        .update({ welcome_message: welcome_message || null })
        .eq('id', partner.id)
        .select('id, welcome_message')
        .single();

      if (updateError) throw updateError;

      return successResponse({
        welcome_message: updatedPartner.welcome_message
      });
    }

    // ===== GET /api-partners/:partnerId/welcome-message - 특정 파트너 환영 메시지 조회 (공개) =====
    const welcomeMsgMatch = pathname.match(/^\/api-partners\/([a-f0-9-]+)\/welcome-message$/);
    if (welcomeMsgMatch && req.method === 'GET') {
      const partnerId = welcomeMsgMatch[1];

      // 파트너의 환영 메시지 조회
      const { data: partner, error: partnerError } = await supabase
        .from('partners')
        .select('id, partner_name, welcome_message')
        .eq('id', partnerId)
        .eq('partner_status', 'approved')
        .single();

      if (partnerError || !partner) {
        return errorResponse('NOT_FOUND', '파트너를 찾을 수 없습니다.', null, 404);
      }

      return successResponse({
        partner_id: partner.id,
        partner_name: partner.partner_name,
        welcome_message: partner.welcome_message || null
      });
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