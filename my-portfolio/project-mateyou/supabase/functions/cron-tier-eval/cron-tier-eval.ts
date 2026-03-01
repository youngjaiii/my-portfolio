import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createSupabaseClient, corsHeaders } from '../_shared/utils.ts';

/**
 * 시간별 티어 점수 산정 크론잡
 *
 * 매 시간 정각 실행 (0 * * * *)
 * 1) 전체 approved 파트너에 대해 30일 롤링 지표 집계
 * 2) 5축 점수 계산 (Revenue, Activity, Quality, Volume, Content)
 * 3) partner_tier_snapshot_hourly INSERT (시간 단위 upsert)
 *
 * ※ 티어 결정은 cron-tier-daily-eval이 매일 자정에 수행
 *
 * 크론 설정:
 *   SELECT cron.schedule(
 *     'hourly-tier-score',
 *     '0 * * * *',
 *     $$SELECT net.http_post(
 *       url := 'https://<project-ref>.supabase.co/functions/v1/cron-tier-eval',
 *       headers := '{"Authorization": "Bearer <service_role_key>", "Content-Type": "application/json"}'::jsonb,
 *       body := '{}'::jsonb
 *     )$$
 *   );
 */

const REVENUE_CAP = 5_000_000;
const ACTIVITY_CAP = 400;
const VOLUME_CAP = 200;
const BUYER_REPEAT_CAP = 5;

function logScore(value: number, cap: number): number {
  if (cap <= 0) return 0;
  return Math.min(100, 100 * Math.log(1 + value) / Math.log(1 + cap));
}

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

serve(async (req) => {
  console.log('[cron-tier-eval] 실행 시작:', new Date().toISOString());

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createSupabaseClient();
  const now = new Date();
  // 시간 단위로 내림 (예: 14:32 → 14:00)
  const snapshotHour = new Date(now);
  snapshotHour.setMinutes(0, 0, 0);
  const snapshotHourISO = snapshotHour.toISOString();

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

  try {
    // 1) approved 파트너 목록
    const { data: partners, error: pErr } = await supabase
      .from('partners')
      .select('id, member_id')
      .eq('partner_status', 'approved');

    if (pErr) throw pErr;
    if (!partners || partners.length === 0) {
      console.log('[cron-tier-eval] approved 파트너 없음, 종료');
      return new Response(JSON.stringify({ success: true, message: 'No partners to evaluate', count: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[cron-tier-eval] approved 파트너 ${partners.length}명 조회됨, snapshotHour=${snapshotHourISO}`);

    let evaluated = 0;
    let upsertFailed = 0;

    for (const partner of partners) {
      const pid = partner.id;
      const memberIdOfPartner = partner.member_id;

      // ---------- REVENUE ----------
      // 스토어 Gross (confirmed/delivered)
      const { data: storeOrders } = await supabase
        .from('store_orders')
        .select('total_amount, user_id')
        .eq('partner_id', pid)
        .in('status', ['confirmed', 'delivered'])
        .gte('created_at', thirtyDaysAgo);

      const storeGross = (storeOrders || []).reduce((s: number, o: any) => s + (o.total_amount || 0), 0);

      // 스토어 Refund
      const { data: refunds } = await supabase
        .from('store_refunds')
        .select('refund_amount, order:store_orders!inner(partner_id)')
        .eq('status', 'completed')
        .gte('created_at', thirtyDaysAgo);
      const partnerRefunds = (refunds || []).filter((r: any) => r.order?.partner_id === pid);
      const refundAmount = partnerRefunds.reduce((s: number, r: any) => s + (r.refund_amount || 0), 0);

      // 퀘스트
      const { data: quests } = await supabase
        .from('partner_requests')
        .select('total_coins, client_id')
        .eq('partner_id', pid)
        .eq('status', 'completed')
        .gte('completed_at', thirtyDaysAgo);
      const questRevenue = (quests || []).reduce((s: number, q: any) => s + (q.total_coins || 0), 0);

      // 포스트 언락
      const { data: partnerPosts } = await supabase
        .from('posts')
        .select('id')
        .eq('partner_id', pid);
      const postIds = (partnerPosts || []).map((p: any) => p.id);

      let postUnlockRevenue = 0;
      let postUnlockBuyers: string[] = [];
      if (postIds.length > 0) {
        const { data: unlocks } = await supabase
          .from('post_unlocks')
          .select('point_price, user_id')
          .in('post_id', postIds)
          .gte('purchased_at', thirtyDaysAgo);
        postUnlockRevenue = (unlocks || []).reduce((s: number, u: any) => s + (u.point_price || 0), 0);
        postUnlockBuyers = (unlocks || []).map((u: any) => u.user_id).filter(Boolean);
      }

      // 후원 (stream_donations)
      const { data: donations } = await supabase
        .from('stream_donations')
        .select('amount, donor_id')
        .eq('recipient_partner_id', pid)
        .in('status', ['completed', 'success'])
        .gte('created_at', thirtyDaysAgo);
      const donationRevenue = (donations || []).reduce((s: number, d: any) => s + (d.amount || 0), 0);

      // 멤버십
      const { data: memberships } = await supabase
        .from('membership_subscriptions')
        .select('user_id, started_at, expired_at, membership:membership_id(partner_id, monthly_price, discount_rate)')
        .eq('status', 'active');
      const partnerMemberships = (memberships || []).filter((m: any) => m.membership?.partner_id === pid);
      let membershipRevenue = 0;
      const membershipBuyers: string[] = [];
      for (const m of partnerMemberships) {
        const start = new Date(m.started_at);
        const end = m.expired_at ? new Date(m.expired_at) : now;
        const periodStart = new Date(thirtyDaysAgo);
        const overlapStart = start > periodStart ? start : periodStart;
        const overlapEnd = end < now ? end : now;
        if (overlapEnd > overlapStart) {
          const days = (overlapEnd.getTime() - overlapStart.getTime()) / (24 * 60 * 60 * 1000);
          const monthlyPrice = m.membership?.monthly_price || 0;
          const discountRate = (m.membership?.discount_rate || 0) / 100;
          const dailyRate = Math.round(monthlyPrice * (1 - discountRate) / 30);
          membershipRevenue += Math.round(dailyRate * days);
          if (m.user_id) membershipBuyers.push(m.user_id);
        }
      }

      const grossRevenue = storeGross + questRevenue + postUnlockRevenue + donationRevenue + membershipRevenue;
      const netRevenue = Math.max(0, grossRevenue - refundAmount);
      const refundRate = grossRevenue > 0 ? (refundAmount / grossRevenue) * 100 : 0;
      const revenueScore = clamp(netRevenue / REVENUE_CAP * 100);

      // ---------- ACTIVITY ----------
      const { count: productCount } = await supabase
        .from('store_products')
        .select('product_id', { count: 'exact', head: true })
        .eq('partner_id', pid)
        .gte('created_at', thirtyDaysAgo);

      const { count: sessionCount } = await supabase
        .from('partner_requests')
        .select('id', { count: 'exact', head: true })
        .eq('partner_id', pid)
        .eq('status', 'completed')
        .gte('completed_at', thirtyDaysAgo);

      const { count: postCount } = await supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('partner_id', pid)
        .gte('created_at', thirtyDaysAgo);

      // 채팅 활동일
      const { count: chatDays } = await supabase
        .from('chat_rooms')
        .select('id', { count: 'exact', head: true })
        .eq('partner_id', memberIdOfPartner)
        .eq('is_active', true)
        .gte('updated_at', thirtyDaysAgo);

      const rawActivity = (productCount || 0) * 2 + (sessionCount || 0) * 5 + Math.min(chatDays || 0, 30) + (postCount || 0);
      const cappedActivity = Math.min(rawActivity, ACTIVITY_CAP);
      const activityScore = clamp(cappedActivity / ACTIVITY_CAP * 100);

      // ---------- QUALITY ----------
      const { count: validReports } = await supabase
        .from('post_reports')
        .select('id', { count: 'exact', head: true })
        .eq('outcome', 'valid')
        .gte('created_at', thirtyDaysAgo);

      const { count: majorViolations } = await supabase
        .from('partner_policy_violations')
        .select('id', { count: 'exact', head: true })
        .eq('partner_id', pid)
        .eq('severity', 'major')
        .gte('occurred_at', ninetyDaysAgo);

      const qualityScore = clamp(100 - (refundRate * 50 / 100) - (validReports || 0) * 10 - (majorViolations || 0) * 30);

      // ---------- VOLUME ----------
      const storeOrdersList = storeOrders || [];
      const questList = quests || [];

      // 동일 구매자 반복 감쇠 적용
      const buyerCounts = new Map<string, number>();
      for (const o of storeOrdersList) { if (o.user_id) buyerCounts.set(o.user_id, (buyerCounts.get(o.user_id) || 0) + 1); }
      for (const q of questList) { if (q.client_id) buyerCounts.set(q.client_id, (buyerCounts.get(q.client_id) || 0) + 1); }
      for (const uid of postUnlockBuyers) { buyerCounts.set(uid, (buyerCounts.get(uid) || 0) + 1); }
      for (const d of (donations || [])) { if (d.donor_id) buyerCounts.set(d.donor_id, (buyerCounts.get(d.donor_id) || 0) + 1); }
      for (const uid of membershipBuyers) { buyerCounts.set(uid, (buyerCounts.get(uid) || 0) + 1); }

      // 자기거래 제외
      buyerCounts.delete(memberIdOfPartner);

      let adjustedOrders = 0;
      for (const [, count] of buyerCounts) {
        adjustedOrders += Math.min(count, BUYER_REPEAT_CAP);
      }
      const paidOrdersCount = adjustedOrders;

      const volumeScore = logScore(paidOrdersCount, VOLUME_CAP);

      // ---------- CONTENT ----------
      const { count: activeProducts } = await supabase
        .from('store_products')
        .select('product_id', { count: 'exact', head: true })
        .eq('partner_id', pid)
        .eq('is_active', true);

      const newListings = (productCount || 0) + (postCount || 0);

      const contentRaw = (activeProducts || 0) * 0.4 + newListings * 0.4;
      const contentScore = logScore(contentRaw, 50);

      // ---------- TOTAL ----------
      const totalScore = clamp(
        0.40 * revenueScore +
        0.20 * activityScore +
        0.10 * qualityScore +
        0.15 * volumeScore +
        0.15 * contentScore
      );

      // 점수 로그
      console.log(`[cron-tier-eval] partner=${pid} scores: revenue=${revenueScore.toFixed(2)}, activity=${activityScore.toFixed(2)}, quality=${qualityScore.toFixed(2)}, volume=${volumeScore.toFixed(2)}, content=${contentScore.toFixed(2)}, total=${totalScore.toFixed(2)}`);

      // INSERT into partner_tier_snapshot_hourly (upsert)
      const { error: upsertErr } = await supabase.from('partner_tier_snapshot_hourly').upsert({
        partner_id: pid,
        snapshot_hour: snapshotHourISO,
        revenue_score: Math.round(revenueScore * 100) / 100,
        activity_score: Math.round(activityScore * 100) / 100,
        quality_score: Math.round(qualityScore * 100) / 100,
        volume_score: Math.round(volumeScore * 100) / 100,
        content_score: Math.round(contentScore * 100) / 100,
        total_score: Math.round(totalScore * 100) / 100,
      }, { onConflict: 'partner_id,snapshot_hour' });

      if (upsertErr) {
        console.error(`[cron-tier-eval] upsert 실패 partner=${pid}:`, upsertErr.message);
        upsertFailed++;
        continue;
      }

      evaluated++;
    }

    console.log(`[cron-tier-eval] 완료: evaluated=${evaluated}, upsertFailed=${upsertFailed}, total=${partners.length}`);

    return new Response(JSON.stringify({
      success: true,
      snapshot_hour: snapshotHourISO,
      evaluated,
      upsert_failed: upsertFailed,
      total_partners: partners.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[cron-tier-eval] 에러 발생:', error instanceof Error ? error.message : error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
