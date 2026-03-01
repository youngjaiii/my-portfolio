import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createSupabaseClient, getAuthUser } from '../_shared/utils.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
};

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

const POST_SELECT_QUERY = `
  *,
  partner:partners!partner_id(id, partner_name, member:members!member_id(id, name, profile_image, member_code)),
  post_media(*, membership:membership_id(tier_rank)),
  post_likes(id, user_id)
`;

/**
 * 미디어 접근 권한 처리
 */
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
    const postUnlockOrder = unlockedMediaOrders.get(post.id);
    const userTierRank = subscribedMembershipTierRanks.get(post.partner_id) ?? 0;
    
    const sortedMedia = post.post_media.sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
    
    for (let i = 0; i < sortedMedia.length; i++) {
      const media = sortedMedia[i];
      const originalMediaUrl = media.media_url;
      media.signed_url = null;
      
      let canAccess = false;
      
      if (isAdmin || isOwner) {
        canAccess = true;
      } else {
        const isSubscribersOnly = post.is_subscribers_only === true || post.is_subscribers_only === 1 || post.is_subscribers_only === '1';
        const postPrice = post.point_price ?? 0;
        const mediaPrice = media.point_price ?? 0;
        const mediaTierRank = media.membership?.tier_rank ?? 0;
        
        // 멤버쉽 접근 권한 체크
        let hasMembershipAccess: boolean;
        if (isSubscribersOnly) {
          // 구독자 전용 게시글: 멤버쉽 필수 + tier 체크
          hasMembershipAccess = userTierRank > 0 && (mediaTierRank === 0 || userTierRank >= mediaTierRank);
        } else {
          // 일반 게시글: tier 체크만 (tier=0이면 누구나 접근)
          hasMembershipAccess = mediaTierRank === 0 || userTierRank >= mediaTierRank;
        }
        
        // 유료 미디어: 반드시 구매해야 접근 가능 (멤버쉽 무관)
        if (mediaPrice > 0) {
          const isPurchased = postUnlockOrder !== null && postUnlockOrder !== undefined && i <= postUnlockOrder;
          canAccess = isPurchased;
        }
        // post 레벨 가격이 있는 경우: 반드시 구매해야 접근 가능
        else if (postPrice > 0) {
          const isPurchased = postUnlockOrder !== null && postUnlockOrder !== undefined && i <= postUnlockOrder;
          canAccess = isPurchased;
        }
        // 무료: 멤버쉽 조건만 체크
        else {
          canAccess = hasMembershipAccess;
        }
      }
      
      if (canAccess && originalMediaUrl) {
        const { data: signed } = await supabase.storage
          .from("post-media")
          .createSignedUrl(originalMediaUrl, 3600);
        media.signed_url = signed?.signedUrl || null;
      }
      
      // media_url 제거 (응답에 포함하지 않음)
      delete media.media_url;
    }
  }
}


/**
 * 차단된 파트너 ID 목록 조회
 */
async function getBlockedPartnerIds(supabase: any, userId: string): Promise<string[]> {
  let blockedPartnerIds: string[] = [];

  const { data: currentUserData } = await supabase
    .from("members")
    .select("member_code")
    .eq("id", userId)
    .single();

  const { data: blockedByMeData } = await supabase
    .from("member_blocks")
    .select("blocked_member")
    .eq("blocker_member", userId);

  const blockedByMeMemberCodes: string[] = (blockedByMeData || []).map((b: any) => b.blocked_member);

  let blockedMeUserIds: string[] = [];
  if (currentUserData?.member_code) {
    const { data: blockedMeData } = await supabase
      .from("member_blocks")
      .select("blocker_member")
      .eq("blocked_member", currentUserData.member_code);
    blockedMeUserIds = (blockedMeData || []).map((b: any) => b.blocker_member);
  }

  if (blockedByMeMemberCodes.length > 0) {
    const { data: blockedMembers } = await supabase
      .from("members")
      .select("id")
      .in("member_code", blockedByMeMemberCodes);

    if (blockedMembers && blockedMembers.length > 0) {
      const blockedMemberIds = blockedMembers.map((m: any) => m.id);
      const { data: blockedPartners } = await supabase
        .from("partners")
        .select("id")
        .in("member_id", blockedMemberIds);
      blockedPartnerIds = (blockedPartners || []).map((p: any) => p.id);
    }
  }

  if (blockedMeUserIds.length > 0) {
    const { data: blockedMePartners } = await supabase
      .from("partners")
      .select("id")
      .in("member_id", blockedMeUserIds);
    blockedPartnerIds = [...blockedPartnerIds, ...(blockedMePartners || []).map((p: any) => p.id)];
  }

  return [...new Set(blockedPartnerIds)];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient();
    
    // 인증 확인 (선택적)
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
    const cursor = url.searchParams.get("cursor");
    const limitParam = parseInt(url.searchParams.get("limit") || String(DEFAULT_LIMIT));
    const limit = Math.min(Math.max(1, limitParam), MAX_LIMIT);
    const page_no = parseInt(url.searchParams.get("page_no") || "0");

    let posts: any[] = [];
    let nextCursor: string | null = null;
    let hasMore = false;

    // ========================================
    // 로그인 사용자: 팔로우 기반 피드
    // ========================================
    if (isAuthenticated) {
      const blockedPartnerIds = await getBlockedPartnerIds(supabase, user.id);

      // 팔로우 목록 조회
      const { data: allFollows } = await supabase
        .from("follow")
        .select("partner_id")
        .eq("follower_id", user.id);

      const allFollowedPartnerIds = new Set((allFollows || []).map((f: any) => f.partner_id));
      const followIds = (allFollows || [])
        .map((f: any) => f.partner_id)
        .filter((pid: string) => !blockedPartnerIds.includes(pid));

      let feedPosts: any[] = [];

      // 팔로우한 파트너가 있으면 팔로우 피드
      if (followIds.length > 0) {
        let followQuery = supabase
          .from("posts")
          .select(POST_SELECT_QUERY)
          .in("partner_id", followIds)
          .eq("context", "feed");

        if (!isAdmin) {
          followQuery = followQuery.eq("is_published", true);
        }

        followQuery = followQuery.order("published_at", { ascending: false }).limit(limit + 10);

        if (cursor) {
          followQuery = followQuery.lt("published_at", cursor);
        } else if (page_no > 0) {
          followQuery = followQuery.range((page_no - 1) * limit, page_no * limit);
        }

        const { data: dataPosts } = await followQuery;
        feedPosts = (dataPosts || []).filter((p: any) => p.partner?.member?.id !== user.id);
      }

      // 팔로우 피드가 없으면 랜덤 피드
      if (feedPosts.length === 0) {
        let randomQuery = supabase
          .from("posts")
          .select(POST_SELECT_QUERY)
          .eq("context", "feed");

        if (!isAdmin) {
          randomQuery = randomQuery.eq("is_published", true);
        }

        randomQuery = randomQuery.order("published_at", { ascending: false }).limit(limit + 10);

        if (cursor) {
          randomQuery = randomQuery.lt("published_at", cursor);
        } else if (page_no > 0) {
          randomQuery = randomQuery.range((page_no - 1) * limit, page_no * limit);
        }

        const { data: randomPosts } = await randomQuery;
        feedPosts = (randomPosts || []).filter((p: any) => 
          !blockedPartnerIds.includes(p.partner_id) && p.partner?.member?.id !== user.id
        );
      }

      // 정렬 및 페이지네이션 (전체 리스트는 published_at 기준만)
      const sortedPosts = feedPosts.sort((a: any, b: any) =>
        new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime()
      );
      hasMore = sortedPosts.length > limit;
      const actualPosts = hasMore ? sortedPosts.slice(0, limit) : sortedPosts;

      const postIds = actualPosts.map((p: any) => p.id);

      // unlock 및 앨범 정보 조회
      let unlockedPostIds = new Set<string>();
      let unlockedMediaOrders = new Map<string, number | null>();
      let inAlbumPostIds = new Set<string>();

      if (!isAdmin && postIds.length > 0) {
        const { data: unlocks } = await supabase
          .from("post_unlocks")
          .select("post_id, media_order")
          .eq("user_id", user.id)
          .in("post_id", postIds);
        unlockedPostIds = new Set((unlocks || []).map((u: any) => u.post_id));
        unlockedMediaOrders = new Map((unlocks || []).map((u: any) => [u.post_id, u.media_order]));
      }

      if (postIds.length > 0) {
        const { data: albumPosts } = await supabase
          .from("album_posts")
          .select("post_id")
          .eq("user_id", user.id)
          .in("post_id", postIds);
        inAlbumPostIds = new Set((albumPosts || []).map((ap: any) => ap.post_id));
      }

      // 멤버쉽 tier_rank 조회
      const subscribedMembershipTierRanks = new Map<string, number>();
      if (!isAdmin) {
        const { data: subscriptions } = await supabase
          .from("membership_subscriptions")
          .select(`
            id, status,
            membership:membership_id(partner_id, is_active, tier_rank)
          `)
          .eq("user_id", user.id)
          .eq("status", "active");

        (subscriptions || []).forEach((s: any) => {
          const m = s.membership;
          if (m?.partner_id && m.is_active !== false) {
            const existing = subscribedMembershipTierRanks.get(m.partner_id) ?? 0;
            subscribedMembershipTierRanks.set(m.partner_id, Math.max(existing, m.tier_rank ?? 0));
          }
        });
      }

      // 미디어 접근 권한 처리
      await processMediaAccess(
        supabase, actualPosts, user.id, isAdmin,
        subscribedMembershipTierRanks, unlockedMediaOrders
      );

      // 응답 매핑
      posts = actualPosts.map((p: any) => ({
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
        is_in_album: inAlbumPostIds.has(p.id),
        is_purchased: isAdmin ? false : unlockedPostIds.has(p.id),
        is_subscribers_only: !!p.is_subscribers_only,
        is_paid_post: p.point_price != null && p.point_price > 0,
        point_price: p.point_price ?? null,
        has_membership: isAdmin ? false : subscribedMembershipTierRanks.has(p.partner_id || p.partner?.id),
        is_pinned: p.is_pinned === true || p.is_pinned === 'true' || p.is_pinned === 1,
        membership_id: p.membership_id ?? null,
      }));

      nextCursor = hasMore && actualPosts.length > 0 
        ? actualPosts[actualPosts.length - 1]?.published_at 
        : null;

    } else {
      // ========================================
      // 비로그인(게스트): 기본 피드
      // ========================================
      let guestQuery = supabase
        .from("posts")
        .select(POST_SELECT_QUERY)
        .eq("is_published", true)
        .eq("context", "feed")
        .order("published_at", { ascending: false })
        .limit(limit + 1);

      if (cursor) {
        guestQuery = guestQuery.lt("published_at", cursor);
      } else if (page_no > 0) {
        guestQuery = guestQuery.range((page_no - 1) * limit, page_no * limit);
      }

      const { data: guestPosts } = await guestQuery;

      const allGuestPosts = guestPosts || [];
      hasMore = allGuestPosts.length > limit;
      const actualPosts = hasMore ? allGuestPosts.slice(0, limit) : allGuestPosts;

      // 게스트는 멤버십/구매 정보가 없음
      const emptyTierRanks = new Map<string, number>();
      const emptyMediaOrders = new Map<string, number | null>();

      await processMediaAccess(
        supabase, actualPosts, null, false,
        emptyTierRanks, emptyMediaOrders
      );

      posts = actualPosts.map((p: any) => ({
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
        is_subscribers_only: !!p.is_subscribers_only,
        is_paid_post: p.point_price != null && p.point_price > 0,
        point_price: p.point_price ?? null,
        has_membership: false,
        membership_id: p.membership_id ?? null,
      }));

      nextCursor = hasMore && actualPosts.length > 0 
        ? actualPosts[actualPosts.length - 1]?.published_at 
        : null;
    }

    return new Response(JSON.stringify({ 
      success: true, data: posts, nextCursor, hasMore, limit
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
