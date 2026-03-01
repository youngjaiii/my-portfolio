import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createSupabaseClient, corsHeaders } from '../_shared/utils.ts';

/**
 * 일일 티어 승강 크론잡 (매일 자정 KST = UTC 15:00)
 *
 * 1) 해당 일자의 partner_tier_snapshot_hourly에서 파트너별 평균 점수 산출
 * 2) 각 티어 그룹별로 파트너를 평균 점수 순 정렬
 * 3) 상위 10% → 1단계 승급 (다이아는 유지)
 * 4) 하위 10% → 1단계 강등 (브론즈는 유지)
 * 5) 중위 80% → 현재 티어 유지
 * 6) partner_tier_current UPDATE
 * 7) partner_tier_snapshot (일별 요약)에도 기록
 *
 * 크론 설정:
 *   SELECT cron.schedule(
 *     'daily-tier-eval',
 *     '0 15 * * *',
 *     $$SELECT net.http_post(
 *       url := 'https://<project-ref>.supabase.co/functions/v1/cron-tier-daily-eval',
 *       headers := '{"Authorization": "Bearer <service_role_key>", "Content-Type": "application/json"}'::jsonb,
 *       body := '{}'::jsonb
 *     )$$
 *   );
 */

type TierCode = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
const TIER_ORDER: TierCode[] = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];

// 승강 비율
const PROMOTE_PERCENT = 0.10;  // 상위 10% 승급
const DEMOTE_PERCENT = 0.10;   // 하위 10% 강등

interface PartnerDailyScore {
  partner_id: string;
  avg_score: number;
  current_tier: TierCode;
  tier_frozen: boolean;
}

serve(async (req) => {
  console.log('[cron-tier-daily-eval] 실행 시작:', new Date().toISOString());

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createSupabaseClient();
  const now = new Date();

  // KST 기준 "오늘" 날짜 계산 (UTC+9)
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const todayKST = kstNow.toISOString().split('T')[0]; // 'YYYY-MM-DD'

  // 오늘 KST 00:00 ~ 23:59를 UTC 범위로 변환
  const dayStartUTC = new Date(`${todayKST}T00:00:00+09:00`).toISOString();
  const dayEndUTC = new Date(`${todayKST}T23:59:59+09:00`).toISOString();

  try {
    // 1) 오늘의 시간별 스냅샷에서 파트너별 평균 점수 집계
    const { data: hourlySnapshots, error: snapErr } = await supabase
      .from('partner_tier_snapshot_hourly')
      .select('partner_id, total_score, revenue_score, activity_score, quality_score, volume_score, content_score')
      .gte('snapshot_hour', dayStartUTC)
      .lte('snapshot_hour', dayEndUTC);

    if (snapErr) throw snapErr;
    if (!hourlySnapshots || hourlySnapshots.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No hourly snapshots found for today',
        date: todayKST,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 파트너별 평균 점수 계산
    const partnerScoreMap = new Map<string, {
      scores: number[];
      revenueScores: number[];
      activityScores: number[];
      qualityScores: number[];
      volumeScores: number[];
      contentScores: number[];
    }>();

    for (const snap of hourlySnapshots) {
      if (!partnerScoreMap.has(snap.partner_id)) {
        partnerScoreMap.set(snap.partner_id, {
          scores: [],
          revenueScores: [],
          activityScores: [],
          qualityScores: [],
          volumeScores: [],
          contentScores: [],
        });
      }
      const entry = partnerScoreMap.get(snap.partner_id)!;
      entry.scores.push(Number(snap.total_score) || 0);
      entry.revenueScores.push(Number(snap.revenue_score) || 0);
      entry.activityScores.push(Number(snap.activity_score) || 0);
      entry.qualityScores.push(Number(snap.quality_score) || 0);
      entry.volumeScores.push(Number(snap.volume_score) || 0);
      entry.contentScores.push(Number(snap.content_score) || 0);
    }

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    // 2) 현재 티어 정보 조회
    const partnerIds = Array.from(partnerScoreMap.keys());
    const { data: tierCurrentList, error: tierErr } = await supabase
      .from('partner_tier_current')
      .select('partner_id, tier_code, tier_frozen')
      .in('partner_id', partnerIds);

    if (tierErr) throw tierErr;

    const tierMap = new Map<string, { tier_code: TierCode; tier_frozen: boolean }>();
    for (const t of (tierCurrentList || [])) {
      tierMap.set(t.partner_id, {
        tier_code: (t.tier_code || 'bronze') as TierCode,
        tier_frozen: t.tier_frozen || false,
      });
    }

    // 파트너별 일일 데이터 조합
    const dailyPartners: PartnerDailyScore[] = [];
    for (const [partnerId, scoreData] of partnerScoreMap) {
      const tierInfo = tierMap.get(partnerId);
      dailyPartners.push({
        partner_id: partnerId,
        avg_score: Math.round(avg(scoreData.scores) * 100) / 100,
        current_tier: tierInfo?.tier_code || 'bronze',
        tier_frozen: tierInfo?.tier_frozen || false,
      });
    }

    // 3) 티어별 그룹 분류
    const tierGroups = new Map<TierCode, PartnerDailyScore[]>();
    for (const tier of TIER_ORDER) {
      tierGroups.set(tier, []);
    }
    for (const p of dailyPartners) {
      if (p.tier_frozen) continue; // 동결된 파트너는 승강 대상에서 제외
      const group = tierGroups.get(p.current_tier);
      if (group) group.push(p);
    }

    // 4) 각 티어별 승강 결정
    let upgraded = 0;
    let downgraded = 0;
    let maintained = 0;
    const updates: { partner_id: string; new_tier: TierCode; avg_score: number }[] = [];

    for (const [tier, members] of tierGroups) {
      if (members.length === 0) continue;

      // 점수 내림차순 정렬
      members.sort((a, b) => b.avg_score - a.avg_score);

      const tierIdx = TIER_ORDER.indexOf(tier);
      const total = members.length;

      // 전원 동점이면 승강 없이 전원 유지 (전원 0점 포함)
      const topScore = members[0].avg_score;
      const bottomScore = members[members.length - 1].avg_score;
      if (topScore === bottomScore) {
        maintained += members.length;
        for (const p of members) {
          updates.push({ partner_id: p.partner_id, new_tier: tier, avg_score: p.avg_score });
        }
        continue;
      }

      // 상위 10% 인원 수 (최소 1명, 단 1명뿐이면 승강 없음)
      const promoteCount = total >= 3 ? Math.max(1, Math.floor(total * PROMOTE_PERCENT)) : 0;
      // 하위 10% 인원 수
      const demoteCount = total >= 3 ? Math.max(1, Math.floor(total * DEMOTE_PERCENT)) : 0;

      for (let i = 0; i < total; i++) {
        const partner = members[i];
        let newTier = tier;

        if (i < promoteCount) {
          // 상위 10% → 승급 (단, 0점이면 승급 불가)
          if (partner.avg_score > 0 && tierIdx < TIER_ORDER.length - 1) {
            newTier = TIER_ORDER[tierIdx + 1];
            upgraded++;
          } else {
            maintained++;
          }
        } else if (i >= total - demoteCount) {
          // 하위 10% → 강등
          if (tierIdx > 0) {
            newTier = TIER_ORDER[tierIdx - 1];
            downgraded++;
          } else {
            maintained++; // 브론즈는 더 내려갈 수 없음
          }
        } else {
          maintained++;
        }

        updates.push({
          partner_id: partner.partner_id,
          new_tier: newTier,
          avg_score: partner.avg_score,
        });
      }
    }

    // 5) partner_tier_current 업데이트 + partner_tier_snapshot 일별 요약 기록
    for (const upd of updates) {
      const scoreData = partnerScoreMap.get(upd.partner_id)!;

      // partner_tier_current 업데이트
      await supabase.from('partner_tier_current').upsert({
        partner_id: upd.partner_id,
        tier_code: upd.new_tier,
        effective_from: now.toISOString(),
        evaluated_at: now.toISOString(),
        updated_at: now.toISOString(),
      }, { onConflict: 'partner_id' });

      // partner_tier_snapshot (일별 요약) 기록
      await supabase.from('partner_tier_snapshot').upsert({
        partner_id: upd.partner_id,
        snapshot_date: todayKST,
        revenue_score: Math.round(avg(scoreData.revenueScores) * 100) / 100,
        activity_score: Math.round(avg(scoreData.activityScores) * 100) / 100,
        quality_score: Math.round(avg(scoreData.qualityScores) * 100) / 100,
        volume_score: Math.round(avg(scoreData.volumeScores) * 100) / 100,
        content_score: Math.round(avg(scoreData.contentScores) * 100) / 100,
        total_score: upd.avg_score,
        tier_eligible: upd.new_tier,
        hard_gate_fail: {},
        // 원시 지표는 0으로 기본값 (시간별 스냅샷에서 평균으로 대체)
        net_revenue_30d: 0,
        gross_revenue_30d: 0,
        refund_amount_30d: 0,
        refund_rate_30d: 0,
        valid_reports_30d: 0,
        major_violations_90d: 0,
        paid_orders_count_30d: 0,
        fulfilled_orders_count_30d: 0,
        unique_buyers_30d: 0,
        active_products_30d: 0,
        new_listings_30d: 0,
      }, { onConflict: 'partner_id,snapshot_date' });
    }

    return new Response(JSON.stringify({
      success: true,
      date: todayKST,
      total_evaluated: updates.length,
      upgraded,
      downgraded,
      maintained,
      frozen_skipped: dailyPartners.filter(p => p.tier_frozen).length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Daily tier evaluation error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
