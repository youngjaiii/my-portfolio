import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createSupabaseClient, getAuthUser } from '../_shared/utils.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

// 미디어 접근 권한 처리 헬퍼 함수
async function processMediaAccess(
  supabase: any,
  posts: any[],
  userId: string | null,
  isAdmin: boolean,
  subscribedMembershipTierRanks: Map<string, number>,
  unlockedMediaOrders: Map<string, number | null>
) {
  for (const post of posts) {
    if (!post.post_media) continue;
    
    const isOwner = userId && post.partner?.member?.id === userId;
    const postUnlock = unlockedMediaOrders.get(post.id);
    const userTierRank = subscribedMembershipTierRanks.get(post.partner_id) ?? 0;
    
    const sortedMedia = post.post_media.sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
    
    for (let i = 0; i < sortedMedia.length; i++) {
      const media = sortedMedia[i];
      media.signed_url = null;
      
      let canAccess = false;
      
      if (isAdmin || isOwner) {
        canAccess = true;
      } else {
        const mediaTierRank = media.membership?.tier_rank ?? 0;
        const hasMembershipAccess = mediaTierRank === 0 || userTierRank >= mediaTierRank;
        
        const mediaPrice = media.point_price ?? 0;
        if (mediaPrice === 0) {
          canAccess = hasMembershipAccess;
        } else {
          canAccess = hasMembershipAccess && postUnlock != null && i <= postUnlock;
        }
      }
      
      if (canAccess && media.media_url) {
        const { data: signed } = await supabase.storage
          .from("post-media")
          .createSignedUrl(media.media_url, 3600);
        media.signed_url = signed?.signedUrl || null;
      }
    }
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient();
    let user: any = null;
    let isAuthenticated = false;
    let isAdmin = false;
    try {
      user = await getAuthUser(req);
      isAuthenticated = true;

      const { data: memberData, error: memberError } = await supabase
        .from("members")
        .select("role")
        .eq("id", user.id)
        .single();

      isAdmin = !memberError && memberData?.role === 'admin';
    } catch {
      user = null;
      isAuthenticated = false;
    }
    const url = new URL(req.url);
    const pathname = url.pathname;

    // ======================================================
    // GET /membership-paid → 멤버/api-posts-list 멤버십 구독한 파트너들의 유료 게시글 조회
    // ======================================================
    if (pathname.includes("/membership-paid") || pathname.includes("/membership_paid")) {
      if (!isAuthenticated) {
        return new Response(JSON.stringify({ success: false, error: "Authentication required" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401
        });
      }

      const cursor = url.searchParams.get("cursor");
      const limitParam = parseInt(url.searchParams.get("limit") || String(DEFAULT_LIMIT));
      const limit = Math.min(Math.max(1, limitParam), MAX_LIMIT);
      const page_no = parseInt(url.searchParams.get("page_no") || "0");

      const { data: subscriptions, error: subscriptionsError } = await supabase
        .from("membership_subscriptions")
        .select("id, status, membership_id")
        .eq("user_id", user.id)
        .eq("status", "active");

      if (subscriptionsError) {
        return new Response(JSON.stringify({ success: false, error: subscriptionsError.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500
        });
      }

      if (!subscriptions || subscriptions.length === 0) {
        return new Response(JSON.stringify({ 
          success: true, 
          data: [],
          nextCursor: null,
          hasMore: false,
          limit
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200
        });
      }

      const membershipIds = subscriptions.map((s: any) => s.membership_id).filter(Boolean);

      if (membershipIds.length === 0) {
        return new Response(JSON.stringify({ 
          success: true, 
          data: [],
          nextCursor: null,
          hasMore: false,
          limit
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200
        });
      }

      const { data: memberships, error: membershipsError } = await supabase
        .from("membership")
        .select("id, partner_id, is_active, tier_rank")
        .in("id", membershipIds);

      if (membershipsError) {
        return new Response(JSON.stringify({ success: false, error: membershipsError.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500
        });
      }

      if (!memberships || memberships.length === 0) {
        return new Response(JSON.stringify({ 
          success: true, 
          data: [],
          nextCursor: null,
          hasMore: false,
          limit
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200
        });
      }

      const subscribedPartnerIds = [...new Set(
        (memberships || [])
          .filter((m: any) => m.partner_id && m.is_active !== false)
          .map((m: any) => m.partner_id)
      )];

      const subscribedMembershipTierRanks = new Map<string, number>();
      (memberships || [])
        .filter((m: any) => m.partner_id && m.is_active !== false)
        .forEach((m: any) => {
          const existingTierRank = subscribedMembershipTierRanks.get(m.partner_id) ?? 0;
          subscribedMembershipTierRanks.set(m.partner_id, Math.max(existingTierRank, m.tier_rank ?? 0));
        });

      if (subscribedPartnerIds.length === 0) {
        return new Response(JSON.stringify({ 
          success: true, 
          data: [],
          nextCursor: null,
          hasMore: false,
          limit
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200
        });
      }

      let membershipPostsQuery = supabase
        .from("posts")
        .select(`
          *,
          partner:partners!partner_id(id, partner_name, member:members!member_id(id, name, profile_image, member_code)),
          post_media(*, membership:membership_id(tier_rank)),
          post_likes(id, user_id)
        `)
        .in("partner_id", subscribedPartnerIds)
        .eq("context", "feed");

      if (!isAdmin) {
        membershipPostsQuery = membershipPostsQuery.eq("is_published", true);
      }

      membershipPostsQuery = membershipPostsQuery.order("published_at", { ascending: false });

      const { data: allPosts, error: allPostsError } = await membershipPostsQuery;

      if (allPostsError) {
        return new Response(JSON.stringify({ success: false, error: allPostsError.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500
        });
      }

      const membershipPosts = (allPosts || []).filter((p: any) => {
        const isSubscribersOnly = p.is_subscribers_only === true || p.is_subscribers_only === 'true' || p.is_subscribers_only === 1;
        return isSubscribersOnly;
      });

      membershipPosts.sort((a: any, b: any) => {
        const dateA = new Date(a.published_at || 0).getTime();
        const dateB = new Date(b.published_at || 0).getTime();
        return dateB - dateA;
      });

      let filteredPosts = membershipPosts;
      if (cursor) {
        const cursorTime = new Date(cursor).getTime();
        filteredPosts = membershipPosts.filter((p: any) => {
          const postTime = new Date(p.published_at || 0).getTime();
          return postTime < cursorTime;
        });
      }

      let hasMorePaid = filteredPosts.length > limit;
      let actualPaidPosts = hasMorePaid ? filteredPosts.slice(0, limit) : filteredPosts;

      if (page_no > 0 && !cursor) {
        const offset = (page_no - 1) * limit;
        actualPaidPosts = filteredPosts.slice(offset, offset + limit);
        hasMorePaid = filteredPosts.length > offset + limit;
      }

      const paidPostIds = actualPaidPosts.map((p: any) => p.id);
      let unlockedPostIds = new Set<string>();
      let unlockedMediaOrders = new Map<string, number | null>();
      if (paidPostIds.length > 0) {
        const { data: unlocks } = await supabase
          .from("post_unlocks")
          .select("post_id, media_order")
          .eq("user_id", user.id)
          .in("post_id", paidPostIds);
        unlockedPostIds = new Set((unlocks || []).map((u: any) => u.post_id));
        unlockedMediaOrders = new Map((unlocks || []).map((u: any) => [u.post_id, u.media_order]));
      }

      let inAlbumPostIds = new Set<string>();
      if (paidPostIds.length > 0) {
        const { data: albumPostsForUser } = await supabase
          .from("album_posts")
          .select("post_id")
          .eq("user_id", user.id)
          .in("post_id", paidPostIds);
        inAlbumPostIds = new Set((albumPostsForUser || []).map((ap: any) => ap.post_id));
      }

      await processMediaAccess(
        supabase,
        actualPaidPosts,
        user.id,
        isAdmin,
        subscribedMembershipTierRanks,
        unlockedMediaOrders
      );

      const posts = actualPaidPosts.map((p: any) => {
        const isSubscribersOnly = !!p.is_subscribers_only;
        const isPaidPost = p.point_price != null && p.point_price > 0;
        const isPurchased = unlockedPostIds.has(p.id);
        const isInAlbum = inAlbumPostIds.has(p.id);

        return {
          id: p.id,
          content: p.content,
          published_at: p.published_at,
          partner_id: p.partner?.id,
          partner: {
            name: p.partner?.partner_name || p.partner?.member?.member_code,
            profile_image: p.partner?.member?.profile_image,
            member_code: p.partner?.member?.member_code,
          },
          files: p.post_media || [],
          like_count: p.post_likes?.length || 0,
          comment_count: p.comment_count || 0,
          is_liked: (p.post_likes || []).some((l: any) => l.user_id === user.id),
          is_followed: false,
          is_in_album: isInAlbum,
          is_purchased: isAdmin ? false : isPurchased,
          is_subscribers_only: isSubscribersOnly,
          is_paid_post: isPaidPost,
          point_price: p.point_price ?? null,
          has_membership: true,
          membership_id: p.membership_id ?? null,
        };
      });

      const nextCursor = hasMorePaid && actualPaidPosts.length > 0 
        ? actualPaidPosts[actualPaidPosts.length - 1]?.published_at 
        : null;

      return new Response(JSON.stringify({ 
        success: true, 
        data: posts,
        nextCursor,
        hasMore: hasMorePaid,
        limit,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      });
    }

    // ======================================================
    // 기존 API 로직 (partner_id 파라미터 기반)
    // ======================================================
    const cursor = url.searchParams.get("cursor");
    const limitParam = parseInt(url.searchParams.get("limit") || String(DEFAULT_LIMIT));
    const limit = Math.min(Math.max(1, limitParam), MAX_LIMIT);
    const page_no = parseInt(url.searchParams.get("page_no") || "0");
    const partner_id = url.searchParams.get("partner_id");

    let blockedPartnerIds: string[] = [];

    if (isAuthenticated) {
      const { data: currentUserData } = await supabase
        .from("members")
        .select("member_code")
        .eq("id", user.id)
        .single();

      const { data: blockedByMeData } = await supabase
        .from("member_blocks")
        .select("blocked_member")
        .eq("blocker_member", user.id);

      const blockedByMeMemberCodes: string[] = (blockedByMeData || []).map(b => b.blocked_member);

      let blockedMeUserIds: string[] = [];
      if (currentUserData?.member_code) {
        const { data: blockedMeData } = await supabase
          .from("member_blocks")
          .select("blocker_member")
          .eq("blocked_member", currentUserData.member_code);

        blockedMeUserIds = (blockedMeData || []).map(b => b.blocker_member);
      }

      if (blockedByMeMemberCodes.length > 0) {
        const { data: blockedMembers } = await supabase
          .from("members")
          .select("id")
          .in("member_code", blockedByMeMemberCodes);

        if (blockedMembers && blockedMembers.length > 0) {
          const blockedMemberIds = blockedMembers.map(m => m.id);
          const { data: blockedPartners } = await supabase
            .from("partners")
            .select("id")
            .in("member_id", blockedMemberIds);

          blockedPartnerIds = (blockedPartners || []).map(p => p.id);
        }
      }

      if (blockedMeUserIds.length > 0) {
        const { data: blockedMePartners } = await supabase
          .from("partners")
          .select("id")
          .in("member_id", blockedMeUserIds);

        const blockedMePartnerIds = (blockedMePartners || []).map(p => p.id);
        blockedPartnerIds = [...blockedPartnerIds, ...blockedMePartnerIds];
      }

      blockedPartnerIds = [...new Set(blockedPartnerIds)];
    }

    let posts: any[] = [];
    let nextCursor: string | null = null;
    let hasMore = false;

    let userAlbumIds: string[] = [];
    if (isAuthenticated) {
      const { data: userAlbums } = await supabase
        .from("albums")
        .select("id")
        .eq("user_id", user.id);
      userAlbumIds = (userAlbums || []).map((a: any) => a.id);
    }

    if (partner_id) {
      // --- 조건 1: 특정 파트너 피드만 ---
      let query = supabase
        .from("posts")
        .select(`
          *,
          partner:partners!partner_id(id, partner_name, member:members!member_id(id, name, profile_image, member_code)),
          post_media(*, membership:membership_id(tier_rank)),
          post_likes(id, user_id)
        `)
        .eq("partner_id", partner_id)
        .eq("context", "feed");

      if (!isAdmin) {
        query = query.eq("is_published", true);
      }

      query = query
        .order("published_at", { ascending: false })
        .limit(limit + 10);

      if (cursor) {
        query = query.lt("published_at", cursor);
      } else if (page_no > 0) {
        query = query.range((page_no - 1) * limit, page_no * limit);
      }

      const { data: partnerPosts } = await query;

      const partnerPostIds = (partnerPosts || []).map((p: any) => p.id);

      let isFollowedPartner = false;
      if (isAuthenticated) {
        const { data: followCheck } = await supabase
          .from("follow")
          .select("id")
          .eq("follower_id", user.id)
          .eq("partner_id", partner_id)
          .maybeSingle();
        isFollowedPartner = !!followCheck;
      }

      let unlockedPostIds = new Set<string>();
      let unlockedMediaOrders = new Map<string, number | null>();

      if (isAuthenticated && !isAdmin && partnerPostIds.length > 0) {
        const { data: unlocks } = await supabase
          .from("post_unlocks")
          .select("post_id, media_order")
          .eq("user_id", user.id)
          .in("post_id", partnerPostIds);
        unlockedPostIds = new Set((unlocks || []).map((u: any) => u.post_id));
        unlockedMediaOrders = new Map((unlocks || []).map((u: any) => [u.post_id, u.media_order]));
      }

      let inAlbumPostIds = new Set<string>();
      if (isAuthenticated && partnerPostIds.length > 0) {
        const { data: albumPostsForUser } = await supabase
          .from("album_posts")
          .select("post_id")
          .eq("user_id", user.id)
          .in("post_id", partnerPostIds);
        inAlbumPostIds = new Set((albumPostsForUser || []).map((ap: any) => ap.post_id));
      }

      type PartnerMembershipInfo = {
        partner_id: string;
        post_access_mode: string | null;
        started_at: string | null;
      };
      const partnerMembershipMap = new Map<string, PartnerMembershipInfo>();
      const subscribedMembershipTierRanks = new Map<string, number>();

      if (isAuthenticated && !isAdmin) {
        const { data: subscriptions } = await supabase
          .from("membership_subscriptions")
          .select(`
            id,
            status,
            started_at,
            membership:membership_id(
              partner_id,
              is_active,
              post_access_mode,
              tier_rank
            )
          `)
          .eq("user_id", user.id)
          .eq("status", "active");

        (subscriptions || []).forEach((s: any) => {
          const m = s.membership;
          if (m?.partner_id && m.is_active !== false) {
            partnerMembershipMap.set(m.partner_id, {
              partner_id: m.partner_id,
              post_access_mode: m.post_access_mode ?? null,
              started_at: s.started_at ?? null,
            });
            const existingTierRank = subscribedMembershipTierRanks.get(m.partner_id) ?? 0;
            subscribedMembershipTierRanks.set(m.partner_id, Math.max(existingTierRank, m.tier_rank ?? 0));
          }
        });
      }

      const allPartnerPosts = (partnerPosts || []).sort((a: any, b: any) => {
        const aPinned = a.is_pinned === true || a.is_pinned === 'true' || a.is_pinned === 1;
        const bPinned = b.is_pinned === true || b.is_pinned === 'true' || b.is_pinned === 1;
        if (aPinned === bPinned) {
          return new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime();
        }
        return aPinned ? -1 : 1;
      });

      const hasMorePartner = allPartnerPosts.length > limit;
      const actualPartnerPosts = hasMorePartner ? allPartnerPosts.slice(0, limit) : allPartnerPosts;
      const nextCursorPartner = hasMorePartner && actualPartnerPosts.length > 0 
        ? actualPartnerPosts[actualPartnerPosts.length - 1].published_at 
        : null;

      await processMediaAccess(
        supabase,
        actualPartnerPosts,
        isAuthenticated ? user.id : null,
        isAdmin,
        subscribedMembershipTierRanks,
        unlockedMediaOrders
      );

      posts = actualPartnerPosts.map((p: any) => {
        const isSubscribersOnly = !!p.is_subscribers_only;
        const isPaidPost = p.point_price != null && p.point_price > 0;
        const isPurchased = unlockedPostIds.has(p.id);
        const membershipInfo = partnerMembershipMap.get(p.partner_id || p.partner?.id);
        const hasMembership = !!membershipInfo;
        const isInAlbum = inAlbumPostIds.has(p.id);

        return {
          id: p.id,
          content: p.content,
          published_at: p.published_at,
          partner_id: p.partner?.id,
          partner: {
            name: p.partner?.partner_name || p.partner?.member?.member_code,
            profile_image: p.partner?.member?.profile_image,
            member_code: p.partner?.member?.member_code,
          },
          files: p.post_media || [],
          like_count: p.post_likes?.length || 0,
          comment_count: p.comment_count || 0,
          is_liked: isAuthenticated ? (p.post_likes || []).some((l: any) => l.user_id === user.id) : false,
          is_followed: isFollowedPartner,
          is_in_album: isInAlbum,
          is_purchased: isAdmin ? false : isPurchased,
          is_subscribers_only: isSubscribersOnly,
          is_paid_post: isPaidPost,
          point_price: p.point_price ?? null,
          has_membership: isAdmin ? false : hasMembership,
          is_pinned: p.is_pinned === true || p.is_pinned === 'true' || p.is_pinned === 1,
          membership_id: p.membership_id ?? null,
        };
      });

      hasMore = hasMorePartner;
      nextCursor = nextCursorPartner;

    } else if (isAuthenticated) {
      // --- 조건 2: 팔로우 기준 피드 ---
      const { data: allFollows } = await supabase
        .from("follow")
        .select("partner_id")
        .eq("follower_id", user.id);

      const allFollowedPartnerIds = new Set((allFollows || []).map(f => f.partner_id));

      const followIds = (allFollows || [])
        .map(f => f.partner_id)
        .filter(pid => !blockedPartnerIds.includes(pid));

      let followPosts: any[] = [];

      if (followIds.length > 0) {
        let followQuery = supabase
          .from("posts")
          .select(`
            *,
            partner:partners!partner_id(id, partner_name, member:members!member_id(id, name, profile_image, member_code)),
            post_media(*, membership:membership_id(tier_rank)),
            post_likes(id, user_id),
            purchases(id, member_id)
          `)
          .in("partner_id", followIds)
          .eq("context", "feed");

        if (!isAdmin) {
          followQuery = followQuery.eq("is_published", true);
        }

        followQuery = followQuery
          .order("published_at", { ascending: false })
          .limit(limit + 10);

        if (cursor) {
          followQuery = followQuery.lt("published_at", cursor);
        } else if (page_no > 0) {
          followQuery = followQuery.range((page_no - 1) * limit, page_no * limit);
        }

        const { data: dataPosts } = await followQuery;

        const followPostIds = (dataPosts || []).map((p: any) => p.id);

        let unlockedPostIds = new Set<string>();
        let unlockedMediaOrders = new Map<string, number | null>();

        if (!isAdmin && followPostIds.length > 0) {
          const { data: unlocks } = await supabase
            .from("post_unlocks")
            .select("post_id, media_order")
            .eq("user_id", user.id)
            .in("post_id", followPostIds);
          unlockedPostIds = new Set((unlocks || []).map((u: any) => u.post_id));
          unlockedMediaOrders = new Map((unlocks || []).map((u: any) => [u.post_id, u.media_order]));
        }

        let inAlbumPostIds = new Set<string>();
        if (followPostIds.length > 0) {
          const { data: albumPostsForUser } = await supabase
            .from("album_posts")
            .select("post_id")
            .eq("user_id", user.id)
            .in("post_id", followPostIds);
          inAlbumPostIds = new Set((albumPostsForUser || []).map((ap: any) => ap.post_id));
        }

        type PartnerMembershipInfo = {
          partner_id: string;
          post_access_mode: string | null;
          started_at: string | null;
        };
        const partnerMembershipMap = new Map<string, PartnerMembershipInfo>();
        const subscribedMembershipTierRanks = new Map<string, number>();

        if (!isAdmin) {
          const { data: subscriptions } = await supabase
            .from("membership_subscriptions")
            .select(`
              id,
              status,
              started_at,
              membership:membership_id(
                partner_id,
                is_active,
                post_access_mode,
                tier_rank
              )
            `)
            .eq("user_id", user.id)
            .eq("status", "active");

          (subscriptions || []).forEach((s: any) => {
            const m = s.membership;
            if (m?.partner_id && m.is_active !== false) {
              partnerMembershipMap.set(m.partner_id, {
                partner_id: m.partner_id,
                post_access_mode: m.post_access_mode ?? null,
                started_at: s.started_at ?? null,
              });
              const existingTierRank = subscribedMembershipTierRanks.get(m.partner_id) ?? 0;
              subscribedMembershipTierRanks.set(m.partner_id, Math.max(existingTierRank, m.tier_rank ?? 0));
            }
          });
        }

        const sortedDataPosts = (dataPosts || []).sort((a: any, b: any) => {
          const aPinned = a.is_pinned === true || a.is_pinned === 'true' || a.is_pinned === 1;
          const bPinned = b.is_pinned === true || b.is_pinned === 'true' || b.is_pinned === 1;
          if (aPinned === bPinned) {
            return new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime();
          }
          return aPinned ? -1 : 1;
        });

        const hasMoreFollow = sortedDataPosts.length > limit;
        const actualDataPosts = hasMoreFollow ? sortedDataPosts.slice(0, limit) : sortedDataPosts;

        await processMediaAccess(
          supabase,
          actualDataPosts,
          user.id,
          isAdmin,
          subscribedMembershipTierRanks,
          unlockedMediaOrders
        );

        followPosts = actualDataPosts
          .filter((p: any) => p.partner?.member?.id !== user.id)
          .map((p: any) => {
            const isSubscribersOnly = !!p.is_subscribers_only;
            const isPaidPost = p.point_price != null && p.point_price > 0;
            const isPurchased = unlockedPostIds.has(p.id);
            const postPartnerId = p.partner_id || p.partner?.id;
            const membershipInfo = partnerMembershipMap.get(postPartnerId);
            const hasMembership = !!membershipInfo;
            const isInAlbum = inAlbumPostIds.has(p.id);

            return {
              id: p.id,
              content: p.content,
              published_at: p.published_at,
              partner_id: p.partner?.id,
              partner: {
                name: p.partner?.partner_name || p.partner?.member?.member_code,
                profile_image: p.partner?.member?.profile_image,
                member_code: p.partner?.member?.member_code,
              },
              files: p.post_media || [],
              like_count: p.post_likes?.length || 0,
              comment_count: p.comment_count || 0,
              is_liked: (p.post_likes || []).some((l: any) => l.user_id === user.id),
              is_followed: allFollowedPartnerIds.has(p.partner_id || p.partner?.id),
              is_in_album: isInAlbum,
              is_purchased: isAdmin ? false : isPurchased,
              is_subscribers_only: isSubscribersOnly,
              is_paid_post: isPaidPost,
              point_price: p.point_price ?? null,
              has_membership: isAdmin ? false : hasMembership,
              is_pinned: p.is_pinned === true || p.is_pinned === 'true' || p.is_pinned === 1,
            };
          });

        if (followPosts.length > 0) {
          hasMore = hasMoreFollow;
          nextCursor = hasMoreFollow ? actualDataPosts[actualDataPosts.length - 1]?.published_at : null;
        }
      }

      if (followPosts.length === 0) {
        // 팔로우 피드 없으면 임의 피드
        let randomQuery = supabase
          .from("posts")
          .select(`
            *,
            partner:partners!partner_id(id, partner_name, member:members!member_id(id, name, profile_image, member_code)),
            post_media(*, membership:membership_id(tier_rank)),
            post_likes(id, user_id)
          `)
          .eq("context", "feed");

        if (!isAdmin) {
          randomQuery = randomQuery.eq("is_published", true);
        }

        randomQuery = randomQuery
          .order("published_at", { ascending: false })
          .limit(limit + 10);

        if (cursor) {
          randomQuery = randomQuery.lt("published_at", cursor);
        } else if (page_no > 0) {
          randomQuery = randomQuery.range((page_no - 1) * limit, page_no * limit);
        }

        const { data: randomPosts } = await randomQuery;

        const sortedRandomPosts = (randomPosts || []).sort((a: any, b: any) => {
          const aPinned = a.is_pinned === true || a.is_pinned === 'true' || a.is_pinned === 1;
          const bPinned = b.is_pinned === true || b.is_pinned === 'true' || b.is_pinned === 1;
          if (aPinned === bPinned) {
            return new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime();
          }
          return aPinned ? -1 : 1;
        });

        const hasMoreRandom = sortedRandomPosts.length > limit;
        const actualRandomPosts = hasMoreRandom ? sortedRandomPosts.slice(0, limit) : sortedRandomPosts;

        const filteredPosts = actualRandomPosts.filter((p: any) =>
          !blockedPartnerIds.includes(p.partner_id) && p.partner?.member?.id !== user.id
        );

        const randomPostIds = filteredPosts.map((p: any) => p.id);

        let unlockedPostIds = new Set<string>();
        let unlockedMediaOrders = new Map<string, number | null>();

        if (!isAdmin && randomPostIds.length > 0) {
          const { data: unlocks } = await supabase
            .from("post_unlocks")
            .select("post_id, media_order")
            .eq("user_id", user.id)
            .in("post_id", randomPostIds);
          unlockedPostIds = new Set((unlocks || []).map((u: any) => u.post_id));
          unlockedMediaOrders = new Map((unlocks || []).map((u: any) => [u.post_id, u.media_order]));
        }

        let inAlbumPostIds = new Set<string>();
        if (randomPostIds.length > 0) {
          const { data: albumPostsForUser } = await supabase
            .from("album_posts")
            .select("post_id")
            .eq("user_id", user.id)
            .in("post_id", randomPostIds);
          inAlbumPostIds = new Set((albumPostsForUser || []).map((ap: any) => ap.post_id));
        }

        type PartnerMembershipInfo = {
          partner_id: string;
          post_access_mode: string | null;
          started_at: string | null;
        };
        const partnerMembershipMap = new Map<string, PartnerMembershipInfo>();
        const subscribedMembershipTierRanks = new Map<string, number>();

        if (!isAdmin) {
          const { data: subscriptions } = await supabase
            .from("membership_subscriptions")
            .select(`
              id,
              status,
              started_at,
              membership:membership_id(
                partner_id,
                is_active,
                post_access_mode,
                tier_rank
              )
            `)
            .eq("user_id", user.id)
            .eq("status", "active");

          (subscriptions || []).forEach((s: any) => {
            const m = s.membership;
            if (m?.partner_id && m.is_active !== false) {
              partnerMembershipMap.set(m.partner_id, {
                partner_id: m.partner_id,
                post_access_mode: m.post_access_mode ?? null,
                started_at: s.started_at ?? null,
              });
              const existingTierRank = subscribedMembershipTierRanks.get(m.partner_id) ?? 0;
              subscribedMembershipTierRanks.set(m.partner_id, Math.max(existingTierRank, m.tier_rank ?? 0));
            }
          });
        }

        await processMediaAccess(
          supabase,
          filteredPosts,
          user.id,
          isAdmin,
          subscribedMembershipTierRanks,
          unlockedMediaOrders
        );

        posts = filteredPosts.map((p: any) => {
          const isSubscribersOnly = !!p.is_subscribers_only;
          const isPaidPost = p.point_price != null && p.point_price > 0;
          const isPurchased = unlockedPostIds.has(p.id);
          const postPartnerId = p.partner_id || p.partner?.id;
          const membershipInfo = partnerMembershipMap.get(postPartnerId);
          const hasMembership = !!membershipInfo;
          const isInAlbum = inAlbumPostIds.has(p.id);

          return {
            id: p.id,
            content: p.content,
            published_at: p.published_at,
            partner_id: p.partner?.id,
            partner: {
              name: p.partner?.partner_name || p.partner?.member?.member_code,
              profile_image: p.partner?.member?.profile_image,
              member_code: p.partner?.member?.member_code,
            },
            files: p.post_media || [],
            like_count: p.post_likes?.length || 0,
            comment_count: p.comment_count || 0,
            is_liked: (p.post_likes || []).some((l: any) => l.user_id === user.id),
            is_followed: allFollowedPartnerIds.has(p.partner_id || p.partner?.id),
            is_purchased: isAdmin ? false : isPurchased,
            is_subscribers_only: isSubscribersOnly,
            is_paid_post: isPaidPost,
            point_price: p.point_price ?? null,
            has_membership: isAdmin ? false : hasMembership,
            is_in_album: isInAlbum,
            is_pinned: p.is_pinned === true || p.is_pinned === 'true' || p.is_pinned === 1,
            membership_id: p.membership_id ?? null,
          };
        });

        hasMore = hasMoreRandom;
        nextCursor = hasMoreRandom && actualRandomPosts.length > 0 
          ? actualRandomPosts[actualRandomPosts.length - 1]?.published_at 
          : null;
      } else {
        posts = followPosts;
      }
    } else {
      // --- 조건 3: 비로그인(게스트) 기본 피드 ---
      let guestQuery = supabase
        .from("posts")
        .select(`
          *,
          partner:partners!partner_id(id, partner_name, member:members!member_id(id, name, profile_image, member_code)),
          post_media(*, membership:membership_id(tier_rank))
        `)
        .eq("is_published", true)
        .eq("context", "feed")
        .order("published_at", { ascending: false })
        .limit(limit + 1);

      if (cursor) {
        guestQuery = guestQuery.lt("published_at", cursor);
      } else if (page_no > 0) {
        guestQuery = guestQuery.range((page_no - 1) * limit, page_no * limit);
      }

      const { data: randomPosts } = await guestQuery;

      const allGuestPosts = randomPosts || [];
      const hasMoreGuest = allGuestPosts.length > limit;
      const actualGuestPosts = hasMoreGuest ? allGuestPosts.slice(0, limit) : allGuestPosts;

      // 게스트는 멤버십/구매 정보가 없으므로 빈 Map
      const emptyTierRanks = new Map<string, number>();
      const emptyMediaOrders = new Map<string, number | null>();

      await processMediaAccess(
        supabase,
        actualGuestPosts,
        null,
        false,
        emptyTierRanks,
        emptyMediaOrders
      );

      const filteredPosts = actualGuestPosts.filter((p: any) =>
        !blockedPartnerIds.includes(p.partner_id)
      );

      hasMore = hasMoreGuest;
      nextCursor = hasMoreGuest && actualGuestPosts.length > 0 
        ? actualGuestPosts[actualGuestPosts.length - 1]?.published_at 
        : null;

      posts = filteredPosts.map((p: any) => {
        const isSubscribersOnly = !!p.is_subscribers_only;
        const isPaidPost = p.point_price != null && p.point_price > 0;

        return {
          id: p.id,
          content: p.content,
          published_at: p.published_at,
          partner_id: p.partner?.id,
          partner: {
            name: p.partner?.partner_name || p.partner?.member?.member_code,
            profile_image: p.partner?.member?.profile_image,
            member_code: p.partner?.member?.member_code,
          },
          files: p.post_media || [],
          like_count: p.post_likes?.length || 0,
          comment_count: p.comment_count || 0,
          is_liked: false,
          is_followed: false,
          is_purchased: false,
          is_subscribers_only: isSubscribersOnly,
          is_paid_post: isPaidPost,
          point_price: p.point_price ?? null,
          has_membership: false,
          membership_id: p.membership_id ?? null,
        };
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      data: posts,
      nextCursor,
      hasMore,
      limit,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    });
  }
});
