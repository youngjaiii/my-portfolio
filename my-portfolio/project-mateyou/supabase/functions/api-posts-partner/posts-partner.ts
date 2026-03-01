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
        
        // 유료: 구독 OR 구매로 접근 가능
        if (postPrice > 0 || mediaPrice > 0) {
          const isPurchased = postUnlockOrder != null && i <= postUnlockOrder;
          canAccess = hasMembershipAccess || isPurchased;  // 구독자이거나 구매했으면 접근
        } 
        // 무료: 멤버쉽 조건만 체크
        else {
          canAccess = hasMembershipAccess;
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

/**
 * 게시물 정렬 (고정 게시물 우선)
 */
function sortPostsByPinnedAndDate(posts: any[]): any[] {
  return posts.sort((a: any, b: any) => {
    const aPinned = a.is_pinned === true || a.is_pinned === 'true' || a.is_pinned === 1;
    const bPinned = b.is_pinned === true || b.is_pinned === 'true' || b.is_pinned === 1;
    if (aPinned === bPinned) {
      return new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime();
    }
    return aPinned ? -1 : 1;
  });
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
    const partner_id = url.searchParams.get("partner_id");

    if (!partner_id) {
      return new Response(JSON.stringify({ success: false, error: "partner_id is required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400
      });
    }

    // 1. 게시물 조회
    let query = supabase
      .from("posts")
      .select(POST_SELECT_QUERY)
      .eq("partner_id", partner_id)
      .eq("context", "feed");

    if (!isAdmin) {
      query = query.eq("is_published", true);
    }

    query = query.order("published_at", { ascending: false }).limit(limit + 10);

    if (cursor) {
      query = query.lt("published_at", cursor);
    } else if (page_no > 0) {
      query = query.range((page_no - 1) * limit, page_no * limit);
    }

    const { data: partnerPosts, error: postsError } = await query;

    if (postsError) {
      return new Response(JSON.stringify({ success: false, error: postsError.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500
      });
    }

    const postIds = (partnerPosts || []).map((p: any) => p.id);

    // 2. 팔로우 여부 확인
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

    // 3. unlock 및 앨범 정보 조회
    let unlockedPostIds = new Set<string>();
    let unlockedMediaOrders = new Map<string, number | null>();
    let inAlbumPostIds = new Set<string>();

    if (isAuthenticated && !isAdmin && postIds.length > 0) {
      const { data: unlocks } = await supabase
        .from("post_unlocks")
        .select("post_id, media_order")
        .eq("user_id", user.id)
        .in("post_id", postIds);
      unlockedPostIds = new Set((unlocks || []).map((u: any) => u.post_id));
      unlockedMediaOrders = new Map((unlocks || []).map((u: any) => [u.post_id, u.media_order]));
    }

    if (isAuthenticated && postIds.length > 0) {
      const { data: albumPosts } = await supabase
        .from("album_posts")
        .select("post_id")
        .eq("user_id", user.id)
        .in("post_id", postIds);
      inAlbumPostIds = new Set((albumPosts || []).map((ap: any) => ap.post_id));
    }

    // 4. 멤버쉽 tier_rank 조회
    const subscribedMembershipTierRanks = new Map<string, number>();
    if (isAuthenticated && !isAdmin) {
      const { data: subscriptions } = await supabase
        .from("membership_subscriptions")
        .select(`
          id, status, started_at,
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

    // 5. 정렬 및 페이지네이션
    const sortedPosts = sortPostsByPinnedAndDate(partnerPosts || []);
    const hasMore = sortedPosts.length > limit;
    const actualPosts = hasMore ? sortedPosts.slice(0, limit) : sortedPosts;

    // 6. 미디어 접근 권한 처리
    await processMediaAccess(
      supabase, actualPosts, isAuthenticated ? user.id : null, isAdmin,
      subscribedMembershipTierRanks, unlockedMediaOrders
    );

    // 7. 응답 매핑
    const hasMembership = subscribedMembershipTierRanks.has(partner_id);
    const posts = actualPosts.map((p: any) => ({
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
      is_in_album: inAlbumPostIds.has(p.id),
      is_purchased: isAdmin ? false : unlockedPostIds.has(p.id),
      is_subscribers_only: !!p.is_subscribers_only,
      is_paid_post: p.point_price != null && p.point_price > 0,
      point_price: p.point_price ?? null,
      has_membership: isAdmin ? false : hasMembership,
      is_pinned: p.is_pinned === true || p.is_pinned === 'true' || p.is_pinned === 1,
    }));

    const nextCursor = hasMore && actualPosts.length > 0 
      ? actualPosts[actualPosts.length - 1].published_at 
      : null;

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
