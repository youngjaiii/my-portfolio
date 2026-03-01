import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createSupabaseClient, corsHeaders } from '../_shared/utils.ts';

/**
 * 월간 시즌 리셋 크론잡 (매월 1일 KST 00:05 = UTC 15:05)
 *
 * "배치고사" 개념: 전 시즌 성적을 기반으로 소프트 리셋 후 티어 재배치
 *
 * 1) 전 시즌 최종 점수 조회 (마지막 일별 스냅샷 total_score)
 * 2) 소프트 리셋: 새 점수 = (전 시즌 최종 점수 × 0.4) + 기본 보정치(30)
 * 3) 압축된 점수로 전체 파트너 순위 산출 후 티어 재배치
 *    - 상위 ~5%: 다이아, ~15%: 플래티넘, ~30%: 골드, ~30%: 실버, ~20%: 브론즈
 * 4) 하락 제한:
 *    - 다이아/플래티넘: 최대 2단계 하락
 *    - 골드/실버: 최소 실버 보장 (이탈 방지 하한선)
 * 5) partner_tier_current UPDATE + season_ym, season_start_score 기록
 *
 * 크론 설정:
 *   SELECT cron.schedule(
 *     'monthly-tier-season-reset',
 *     '5 15 1 * *',
 *     $$SELECT net.http_post(
 *       url := 'https://<project-ref>.supabase.co/functions/v1/cron-tier-season-reset',
 *       headers := '{"Authorization": "Bearer <service_role_key>", "Content-Type": "application/json"}'::jsonb,
 *       body := '{}'::jsonb
 *     )$$
 *   );
 */

type TierCode = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
const TIER_ORDER: TierCode[] = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];

// 소프트 리셋 파라미터
const CARRYOVER_RATE = 0.4;    // 전 시즌 점수 이월률 (40%)
const BASE_CORRECTION = 30;     // 기본 보정치 (중앙 수렴)

// 시즌 재배치 비율 (상위부터)
const PLACEMENT_RATIOS = [
  { tier: 'diamond' as TierCode,  cumulative: 0.05 },   // 상위 5%
  { tier: 'platinum' as TierCode, cumulative: 0.20 },   // 상위 5~20%
  { tier: 'gold' as TierCode,     cumulative: 0.50 },   // 상위 20~50%
  { tier: 'silver' as TierCode,   cumulative: 0.80 },   // 상위 50~80%
  { tier: 'bronze' as TierCode,   cumulative: 1.00 },   // 하위 20%
];

// 하락 제한 설정
const MAX_DROP_HIGH_TIER = 2;   // 다이아/플래티넘: 최대 2단계 하락
const MIN_TIER_FOR_LOW = 'silver' as TierCode;  // 골드/실버: 최소 실버 보장

serve(async (req) => {
  console.log('[cron-tier-season-reset] 실행 시작:', new Date().toISOString());
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createSupabaseClient();
  const now = new Date();

  // KST 기준 현재 월 계산
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const currentYM = `${kstNow.getFullYear()}-${String(kstNow.getMonth() + 1).padStart(2, '0')}`;

  // 전 시즌 (전월) 계산
  const prevMonth = new Date(kstNow);
  prevMonth.setMonth(prevMonth.getMonth() - 1);
  const prevYM = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;

  try {
    // 1) 전체 approved 파트너 + 현재 티어 조회
    const { data: partners, error: pErr } = await supabase
      .from('partners')
      .select('id, member_id')
      .eq('partner_status', 'approved');

    if (pErr) throw pErr;
    if (!partners || partners.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No partners to reset',
        season: currentYM,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const partnerIds = partners.map(p => p.id);

    // 현재 티어 정보 조회
    const { data: tierCurrentList } = await supabase
      .from('partner_tier_current')
      .select('partner_id, tier_code, tier_frozen')
      .in('partner_id', partnerIds);

    const currentTierMap = new Map<string, { tier_code: TierCode; tier_frozen: boolean }>();
    for (const t of (tierCurrentList || [])) {
      currentTierMap.set(t.partner_id, {
        tier_code: (t.tier_code || 'bronze') as TierCode,
        tier_frozen: t.tier_frozen || false,
      });
    }

    // 2) 전 시즌 마지막 일별 스냅샷에서 최종 점수 조회
    // 전월의 마지막 날 기준
    const lastDayOfPrevMonth = new Date(kstNow.getFullYear(), kstNow.getMonth(), 0);
    const prevMonthLastDate = lastDayOfPrevMonth.toISOString().split('T')[0];
    const prevMonthFirstDate = `${prevYM}-01`;

    // 전월 마지막 스냅샷 조회 (가장 최신 snapshot_date의 점수 사용)
    const { data: prevSnapshots } = await supabase
      .from('partner_tier_snapshot')
      .select('partner_id, total_score, snapshot_date')
      .in('partner_id', partnerIds)
      .gte('snapshot_date', prevMonthFirstDate)
      .lte('snapshot_date', prevMonthLastDate)
      .order('snapshot_date', { ascending: false });

    // 파트너별 마지막 점수 (첫 번째 등장이 가장 최신)
    const prevScoreMap = new Map<string, number>();
    for (const snap of (prevSnapshots || [])) {
      if (!prevScoreMap.has(snap.partner_id)) {
        prevScoreMap.set(snap.partner_id, Number(snap.total_score) || 0);
      }
    }

    // 3) 소프트 리셋: 새 점수 = (전 시즌 최종 점수 × 0.4) + 기본 보정치(30)
    interface PartnerReset {
      partner_id: string;
      prev_score: number;
      compressed_score: number;
      prev_tier: TierCode;
      tier_frozen: boolean;
    }

    const resetData: PartnerReset[] = [];
    for (const partner of partners) {
      const prevScore = prevScoreMap.get(partner.id) ?? 0;
      const compressed = Math.round((prevScore * CARRYOVER_RATE + BASE_CORRECTION) * 100) / 100;
      const tierInfo = currentTierMap.get(partner.id);

      resetData.push({
        partner_id: partner.id,
        prev_score: prevScore,
        compressed_score: Math.min(100, Math.max(0, compressed)),
        prev_tier: tierInfo?.tier_code || 'bronze',
        tier_frozen: tierInfo?.tier_frozen || false,
      });
    }

    // 동결 파트너 분리
    const activePartners = resetData.filter(p => !p.tier_frozen);
    const frozenPartners = resetData.filter(p => p.tier_frozen);

    // 4) 압축 점수 내림차순 정렬 후 비율 기반 티어 재배치
    activePartners.sort((a, b) => b.compressed_score - a.compressed_score);

    const total = activePartners.length;
    const placements: { partner_id: string; new_tier: TierCode; compressed_score: number; prev_tier: TierCode }[] = [];

    for (let i = 0; i < total; i++) {
      const partner = activePartners[i];
      const percentile = (i + 1) / total;

      // 비율에 따른 티어 결정
      let placedTier: TierCode = 'bronze';
      for (const pr of PLACEMENT_RATIOS) {
        if (percentile <= pr.cumulative) {
          placedTier = pr.tier;
          break;
        }
      }

      // 5) 하락 제한 적용
      const prevTierIdx = TIER_ORDER.indexOf(partner.prev_tier);
      const placedTierIdx = TIER_ORDER.indexOf(placedTier);

      if (placedTierIdx < prevTierIdx) {
        // 하락하는 경우
        const dropAmount = prevTierIdx - placedTierIdx;

        if (prevTierIdx >= 3) {
          // 다이아(4)/플래티넘(3): 최대 2단계 하락
          if (dropAmount > MAX_DROP_HIGH_TIER) {
            placedTier = TIER_ORDER[Math.max(0, prevTierIdx - MAX_DROP_HIGH_TIER)];
          }
        } else {
          // 골드(2)/실버(1): 최소 실버 보장
          const minTierIdx = TIER_ORDER.indexOf(MIN_TIER_FOR_LOW);
          if (placedTierIdx < minTierIdx) {
            placedTier = MIN_TIER_FOR_LOW;
          }
        }
      }

      placements.push({
        partner_id: partner.partner_id,
        new_tier: placedTier,
        compressed_score: partner.compressed_score,
        prev_tier: partner.prev_tier,
      });
    }

    // 6) DB 업데이트
    let upgraded = 0;
    let downgraded = 0;
    let maintained = 0;

    for (const p of placements) {
      const prevIdx = TIER_ORDER.indexOf(p.prev_tier);
      const newIdx = TIER_ORDER.indexOf(p.new_tier);
      if (newIdx > prevIdx) upgraded++;
      else if (newIdx < prevIdx) downgraded++;
      else maintained++;

      await supabase.from('partner_tier_current').upsert({
        partner_id: p.partner_id,
        tier_code: p.new_tier,
        effective_from: now.toISOString(),
        evaluated_at: now.toISOString(),
        updated_at: now.toISOString(),
        season_ym: currentYM,
        season_start_score: p.compressed_score,
      }, { onConflict: 'partner_id' });
    }

    // 동결된 파트너도 시즌 정보만 업데이트
    for (const fp of frozenPartners) {
      const compressed = Math.round((fp.prev_score * CARRYOVER_RATE + BASE_CORRECTION) * 100) / 100;
      await supabase.from('partner_tier_current').update({
        season_ym: currentYM,
        season_start_score: Math.min(100, Math.max(0, compressed)),
        updated_at: now.toISOString(),
      }).eq('partner_id', fp.partner_id);
    }

    return new Response(JSON.stringify({
      success: true,
      season: currentYM,
      prev_season: prevYM,
      total_partners: partners.length,
      active_evaluated: activePartners.length,
      frozen_skipped: frozenPartners.length,
      upgraded,
      downgraded,
      maintained,
      placement_ratios: PLACEMENT_RATIOS.map(p => `${p.tier}: top ${Math.round(p.cumulative * 100)}%`),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Season reset error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
