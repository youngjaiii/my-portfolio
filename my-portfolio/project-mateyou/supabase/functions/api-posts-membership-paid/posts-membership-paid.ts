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
  userId: string,
  isAdmin: boolean,
  subscribedMembershipTierRanks: Map<string, number>,
  unlockedMediaOrders: Map<string, number | null>
) {
  for (const post of posts) {
    if (!post.post_media) continue;
    
    const isOwner = post.partner?.member?.id === userId;
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient();
    
    // 인증 필수
    let user: any;
    let isAdmin = false;
    try {
      user = await getAuthUser(req);
      const { data: memberData, error: memberError } = await supabase
        .from("members")
        .select("role")
        .eq("id", user.id)
        .single();
      isAdmin = !memberError && memberData?.role === 'admin';
    } catch {
      return new Response(JSON.stringify({ success: false, error: "Authentication required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401
      });
    }

    const url = new URL(req.url);
    const cursor = url.searchParams.get("cursor");
    const limitParam = parseInt(url.searchParams.get("limit") || String(DEFAULT_LIMIT));
    const limit = Math.min(Math.max(1, limitParam), MAX_LIMIT);
    const page_no = parseInt(url.searchParams.get("page_no") || "0");

    // 1. 활성 구독 조회
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
        success: true, data: [], nextCursor: null, hasMore: false, limit
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      });
    }

    const membershipIds = subscriptions.map((s: any) => s.membership_id).filter(Boolean);
    if (membershipIds.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, data: [], nextCursor: null, hasMore: false, limit
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      });
    }

    // 2. 멤버쉽 정보 조회
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
        success: true, data: [], nextCursor: null, hasMore: false, limit
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      });
    }

    // 3. 구독한 파트너 ID 및 tier_rank 맵 생성
    const subscribedPartnerIds = [...new Set(
      memberships.filter((m: any) => m.partner_id && m.is_active !== false).map((m: any) => m.partner_id)
    )];

    const subscribedMembershipTierRanks = new Map<string, number>();
    memberships
      .filter((m: any) => m.partner_id && m.is_active !== false)
      .forEach((m: any) => {
        const existing = subscribedMembershipTierRanks.get(m.partner_id) ?? 0;
        subscribedMembershipTierRanks.set(m.partner_id, Math.max(existing, m.tier_rank ?? 0));
      });

    if (subscribedPartnerIds.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, data: [], nextCursor: null, hasMore: false, limit
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200
      });
    }

    // 4. 구독자 전용 게시물 조회
    let query = supabase
      .from("posts")
      .select(POST_SELECT_QUERY)
      .in("partner_id", subscribedPartnerIds)
      .eq("context", "feed")
      .eq("is_subscribers_only", true);

    if (!isAdmin) {
      query = query.eq("is_published", true);
    }

    query = query.order("published_at", { ascending: false });

    const { data: allPosts, error: allPostsError } = await query;

    if (allPostsError) {
      return new Response(JSON.stringify({ success: false, error: allPostsError.message }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500
      });
    }

    // 5. 페이지네이션 처리
    let filteredPosts = allPosts || [];
    if (cursor) {
      const cursorTime = new Date(cursor).getTime();
      filteredPosts = filteredPosts.filter((p: any) => 
        new Date(p.published_at || 0).getTime() < cursorTime
      );
    }

    let hasMore = filteredPosts.length > limit;
    let actualPosts = hasMore ? filteredPosts.slice(0, limit) : filteredPosts;

    if (page_no > 0 && !cursor) {
      const offset = (page_no - 1) * limit;
      actualPosts = filteredPosts.slice(offset, offset + limit);
      hasMore = filteredPosts.length > offset + limit;
    }

    // 6. unlock 및 앨범 정보 조회
    const postIds = actualPosts.map((p: any) => p.id);
    
    let unlockedPostIds = new Set<string>();
    let unlockedMediaOrders = new Map<string, number | null>();
    if (postIds.length > 0) {
      const { data: unlocks } = await supabase
        .from("post_unlocks")
        .select("post_id, media_order")
        .eq("user_id", user.id)
        .in("post_id", postIds);
      unlockedPostIds = new Set((unlocks || []).map((u: any) => u.post_id));
      unlockedMediaOrders = new Map((unlocks || []).map((u: any) => [u.post_id, u.media_order]));
    }

    let inAlbumPostIds = new Set<string>();
    if (postIds.length > 0) {
      const { data: albumPosts } = await supabase
        .from("album_posts")
        .select("post_id")
        .eq("user_id", user.id)
        .in("post_id", postIds);
      inAlbumPostIds = new Set((albumPosts || []).map((ap: any) => ap.post_id));
    }

    // 7. 미디어 접근 권한 처리
    await processMediaAccess(
      supabase, actualPosts, user.id, isAdmin,
      subscribedMembershipTierRanks, unlockedMediaOrders
    );

    // 8. 응답 매핑
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
      is_liked: (p.post_likes || []).some((l: any) => l.user_id === user.id),
      is_followed: false,
      is_in_album: inAlbumPostIds.has(p.id),
      is_purchased: isAdmin ? false : unlockedPostIds.has(p.id),
      is_subscribers_only: true,
      is_paid_post: p.point_price != null && p.point_price > 0,
      point_price: p.point_price ?? null,
      has_membership: true,
    }));

    const nextCursor = hasMore && actualPosts.length > 0 
      ? actualPosts[actualPosts.length - 1]?.published_at 
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
