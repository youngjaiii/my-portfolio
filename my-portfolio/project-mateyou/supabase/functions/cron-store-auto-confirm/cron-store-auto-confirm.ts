import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createSupabaseClient, corsHeaders } from '../_shared/utils.ts';

/**
 * 스토어 자동 구매확정 크론잡 (RPC 버전)
 * 
 * 🔒 100% 트랜잭션 안전성 보장
 * - PostgreSQL RPC 함수(rpc_store_auto_confirm)를 호출하여 모든 작업을 DB 트랜잭션으로 처리
 * - 중복 실행 방어, 원자적 포인트 증가, 실패 시 롤백 보장
 * 
 * 주기: 매일 자정 실행 (Supabase Dashboard에서 설정)
 * 
 * 택배수령 상품의 경우:
 * - 배송완료(delivered) 이후 3일이 지나면 자동으로 구매확정(confirmed)
 * - 파트너에게 포인트 적립 (store_points / collaboration_store_points)
 * - partner_points_logs에 기록 (중복 방지)
 * 
 * 설정 방법:
 * 1. documents/migration_rpc_store_auto_confirm.sql 실행 (RPC 함수 생성)
 * 2. pg_cron으로 이 Edge Function 호출 또는 DB에서 직접 RPC 호출
 * 
 * 크론 설정 방법 (2가지 중 택1):
 * 
 * [방법 1] Edge Function 호출 (기존 방식):
 *   SELECT cron.schedule(
 *     'store-auto-confirm',
 *     '0 0 * * *',
 *     $$SELECT net.http_post(
 *       url := 'https://<project-ref>.supabase.co/functions/v1/cron-store-auto-confirm',
 *       headers := '{"Authorization": "Bearer <service_role_key>", "Content-Type": "application/json"}'::jsonb,
 *       body := '{}'::jsonb
 *     )$$
 *   );
 * 
 * [방법 2] DB에서 직접 RPC 호출 (더 빠르고 안전):
 *   SELECT cron.schedule(
 *     'store-auto-confirm-rpc',
 *     '0 0 * * *',
 *     $$SELECT rpc_store_auto_confirm(3)$$
 *   );
 */

// 응답 타입
interface AutoConfirmResult {
  success: boolean;
  data?: {
    total: number;
    success: number;
    failed: number;
    skipped?: number;
    details: Array<{
  order_id: string;
  status: string;
      message: string;
      store_points?: number;
      collab_points?: number;
    }>;
  };
  error?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient();
    
    // POST: 크론잡 실행 (RPC 호출)
    if (req.method === 'POST') {
      const now = new Date();
      console.log(`[cron-store-auto-confirm] RPC 실행 시작: ${now.toISOString()}`);

      // URL 파라미터에서 days_threshold 읽기 (기본값 3일)
      const url = new URL(req.url);
      const daysThreshold = parseInt(url.searchParams.get('days') || '3');

      // 🔒 RPC 함수 호출 (트랜잭션 보장)
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        'rpc_store_auto_confirm',
        { p_days_threshold: daysThreshold }
      );

      if (rpcError) {
        console.error('[cron-store-auto-confirm] RPC 실행 실패:', rpcError);
        throw rpcError;
      }

      const result = rpcResult as AutoConfirmResult;

      console.log(`[cron-store-auto-confirm] RPC 실행 완료:`, JSON.stringify(result.data));

      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET: 자동 구매확정 대상 주문 조회 (디버깅/모니터링용)
    if (req.method === 'GET') {
      const now = new Date();
      const url = new URL(req.url);
      const daysThreshold = parseInt(url.searchParams.get('days') || '3');
      const threeDaysAgo = new Date(now.getTime() - daysThreshold * 24 * 60 * 60 * 1000);

      const { data: orders, error } = await supabase
        .from('store_orders')
        .select(`
          order_id,
          order_number,
          user_id,
          partner_id,
          total_amount,
          status,
          delivered_at,
          is_confirmed,
          order_items:store_order_items(
            order_item_id,
            product_id,
            product_name,
            product_type,
            product_source,
            quantity,
            subtotal
          )
        `)
        .eq('status', 'delivered')
        .eq('is_confirmed', false)
        .lte('delivered_at', threeDaysAgo.toISOString());

      if (error) throw error;

      // 택배수령 상품이 포함된 주문만 필터링
      // deno-lint-ignore no-explicit-any
      const deliveryOrders = (orders || []).filter((order: any) => 
        order.order_items?.some((item: { product_type: string }) => item.product_type === 'delivery')
      );

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            pending_auto_confirm: deliveryOrders.length,
            days_threshold: daysThreshold,
            threshold_date: threeDaysAgo.toISOString(),
            orders: deliveryOrders
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PUT: 단일 주문 수동 구매확정 (관리자용)
    if (req.method === 'PUT') {
      const body = await req.json();
      const { order_id } = body;

      if (!order_id) {
        return new Response(
          JSON.stringify({ success: false, error: 'order_id가 필요합니다.' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      console.log(`[cron-store-auto-confirm] 수동 구매확정 시작: ${order_id}`);

      // 🔒 RPC 함수 호출 (트랜잭션 보장)
      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        'rpc_store_confirm_order',
        { p_order_id: order_id }
      );

      if (rpcError) {
        console.error('[cron-store-auto-confirm] 수동 구매확정 RPC 실패:', rpcError);
        throw rpcError;
      }

      console.log(`[cron-store-auto-confirm] 수동 구매확정 완료:`, JSON.stringify(rpcResult));

      return new Response(
        JSON.stringify(rpcResult),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 405 }
    );

  } catch (error) {
    console.error('[cron-store-auto-confirm] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : '서버 오류가 발생했습니다.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
