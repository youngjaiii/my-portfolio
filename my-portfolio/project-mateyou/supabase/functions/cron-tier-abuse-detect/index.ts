import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

/**
 * 악용 탐지 크론잡 (일일 또는 주 2회 실행 권장)
 *
 * 탐지 항목:
 * 1) 환불폭증: 7일 환불률 > 20% 또는 전주 대비 2배
 * 2) 자기거래: 파트너 본인(member_id) 계정 구매
 * 3) 30일 환불률 > 15% → 즉시 동결
 *
 * 크론 설정:
 *   SELECT cron.schedule(
 *     'daily-abuse-detect',
 *     '30 3 * * *',
 *     $$SELECT net.http_post(
 *       url := 'https://<project-ref>.supabase.co/functions/v1/cron-tier-abuse-detect',
 *       headers := '{"Authorization": "Bearer <service_role_key>", "Content-Type": "application/json"}'::jsonb,
 *       body := '{}'::jsonb
 *     )$$
 *   );
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function createSupabaseClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

interface AbuseAlert {
  partner_id: string;
  type: string;
  detail: string;
  severity: 'warning' | 'freeze';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createSupabaseClient();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const alerts: AbuseAlert[] = [];
  let frozen = 0;

  try {
    const { data: partners } = await supabase
      .from('partners')
      .select('id, member_id')
      .eq('partner_status', 'approved');

    if (!partners || partners.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No partners', alerts: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    for (const partner of partners) {
      const pid = partner.id;
      const mid = partner.member_id;

      // 이미 동결된 파트너는 스킵
      const { data: tierData } = await supabase
        .from('partner_tier_current')
        .select('tier_frozen')
        .eq('partner_id', pid)
        .single();
      if (tierData?.tier_frozen) continue;

      // --- 1) 30일 환불률 체크 ---
      const { data: orders30d } = await supabase
        .from('store_orders')
        .select('total_amount')
        .eq('partner_id', pid)
        .in('status', ['confirmed', 'delivered'])
        .gte('created_at', thirtyDaysAgo);
      const gross30d = (orders30d || []).reduce((s: number, o: any) => s + (o.total_amount || 0), 0);

      const { data: refunds30dData } = await supabase
        .from('store_refunds')
        .select('refund_amount, order:store_orders!inner(partner_id)')
        .eq('status', 'completed')
        .gte('created_at', thirtyDaysAgo);
      const refund30d = (refunds30dData || [])
        .filter((r: any) => r.order?.partner_id === pid)
        .reduce((s: number, r: any) => s + (r.refund_amount || 0), 0);

      const refundRate30d = gross30d > 0 ? (refund30d / gross30d) * 100 : 0;

      if (refundRate30d > 15) {
        alerts.push({
          partner_id: pid,
          type: 'refund_rate_30d_high',
          detail: `30일 환불률 ${refundRate30d.toFixed(1)}% > 15% → 즉시 동결`,
          severity: 'freeze',
        });
        await freezePartner(supabase, pid, `30일 환불률 ${refundRate30d.toFixed(1)}% 초과`);
        frozen++;
        continue;
      }

      // --- 2) 7일 환불폭증 체크 ---
      const { data: orders7d } = await supabase
        .from('store_orders')
        .select('total_amount')
        .eq('partner_id', pid)
        .in('status', ['confirmed', 'delivered'])
        .gte('created_at', sevenDaysAgo);
      const gross7d = (orders7d || []).reduce((s: number, o: any) => s + (o.total_amount || 0), 0);

      const { data: refunds7dData } = await supabase
        .from('store_refunds')
        .select('refund_amount, order:store_orders!inner(partner_id)')
        .eq('status', 'completed')
        .gte('created_at', sevenDaysAgo);
      const refund7d = (refunds7dData || [])
        .filter((r: any) => r.order?.partner_id === pid)
        .reduce((s: number, r: any) => s + (r.refund_amount || 0), 0);

      const refundRate7d = gross7d > 0 ? (refund7d / gross7d) * 100 : 0;

      if (refundRate7d > 20) {
        alerts.push({
          partner_id: pid,
          type: 'refund_spike_7d',
          detail: `7일 환불률 ${refundRate7d.toFixed(1)}% > 20%`,
          severity: 'warning',
        });
      }

      // 전주 대비 환불 2배 체크
      const { data: refundsPrevWeek } = await supabase
        .from('store_refunds')
        .select('refund_amount, order:store_orders!inner(partner_id)')
        .eq('status', 'completed')
        .gte('created_at', fourteenDaysAgo)
        .lt('created_at', sevenDaysAgo);
      const refundPrevWeek = (refundsPrevWeek || [])
        .filter((r: any) => r.order?.partner_id === pid)
        .reduce((s: number, r: any) => s + (r.refund_amount || 0), 0);

      if (refundPrevWeek > 0 && refund7d >= refundPrevWeek * 2) {
        alerts.push({
          partner_id: pid,
          type: 'refund_double_week',
          detail: `7일 환불(${refund7d}) ≥ 전주(${refundPrevWeek})의 2배`,
          severity: 'warning',
        });
      }

      // --- 3) 자기거래 탐지 ---
      const { data: selfOrders } = await supabase
        .from('store_orders')
        .select('order_id')
        .eq('partner_id', pid)
        .eq('user_id', mid)
        .in('status', ['confirmed', 'delivered', 'pending', 'paid', 'shipping'])
        .gte('created_at', thirtyDaysAgo);

      if (selfOrders && selfOrders.length > 0) {
        alerts.push({
          partner_id: pid,
          type: 'self_transaction',
          detail: `파트너 본인 계정 거래 ${selfOrders.length}건 발견 → 즉시 동결`,
          severity: 'freeze',
        });
        await freezePartner(supabase, pid, `자기거래 ${selfOrders.length}건 발견`);
        frozen++;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      total_partners: partners.length,
      alerts_count: alerts.length,
      frozen_count: frozen,
      alerts,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Abuse detection error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

async function freezePartner(
  supabase: ReturnType<typeof createClient>,
  partnerId: string,
  reason: string,
) {
  await supabase.from('partner_tier_current').update({
    tier_frozen: true,
    frozen_reason: reason,
    frozen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('partner_id', partnerId);
}
