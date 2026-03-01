import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  corsHeaders,
  createSupabaseClient,
  successResponse,
  errorResponse,
  getAuthUser,
  parseRequestBody,
} from '../_shared/utils.ts';

interface SubscriptionRequestBody {
  membership_id?: string;
  status?: 'active' | 'inactive';  // active: 구독 중, inactive: 기간 만료/자동연장 실패
  next_billing_at?: string;
  expired_at?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createSupabaseClient();
    const user = await getAuthUser(req);

    // ------------------------
    // POST /api-subscriptions → 구독 생성
    // ------------------------
    if (req.url.endsWith('/api-subscriptions') && req.method === 'POST') {
      const body: SubscriptionRequestBody = await parseRequestBody(req);
      if (!body?.membership_id) {
        return errorResponse('VALIDATION_ERROR', 'membership_id is required');
      }

      // 이미 구독했는지 확인
      const { data: existing, error: existingError } = await supabase
        .from('membership_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .eq('membership_id', body.membership_id)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) return errorResponse('ALREADY_SUBSCRIBED', 'User already subscribed');

      const { data, error } = await supabase
        .from('membership_subscriptions')
        .insert([{
          user_id: user.id,
          membership_id: body.membership_id,
          status: 'active',
          started_at: new Date().toISOString(),
          next_billing_at: body.next_billing_at || null,
        }])
        .select()
        .single();

      if (error) throw error;
      return successResponse(data, { headers: corsHeaders });
    }

    // ------------------------
    // GET /api-subscriptions → 사용자의 구독 조회
    // ------------------------
    if (req.url.endsWith('/api-subscriptions') && req.method === 'GET') {
      const { data, error } = await supabase
        .from('membership_subscriptions')
        .select(`*, membership(name, description, monthly_price, is_active, partner_id)`)
        .eq('user_id', user.id);

      if (error) throw error;
      return successResponse(data, { headers: corsHeaders });
    }

    // ------------------------
    // PATCH /api-subscriptions/:id → 구독 상태 수정
    // ------------------------
    if (req.url.match(/^\/api-subscriptions\/[a-zA-Z0-9-]+$/) && req.method === 'PATCH') {
      const subscriptionId = req.url.split('/').pop()!;
      const body: SubscriptionRequestBody = await parseRequestBody(req);
      if (!body || Object.keys(body).length === 0) {
        return errorResponse('INVALID_REQUEST', 'At least one field to update is required');
      }

      const { data: updated, error } = await supabase
        .from('membership_subscriptions')
        .update(body)
        .eq('id', subscriptionId)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return successResponse(updated, { headers: corsHeaders });
    }

    // DELETE 엔드포인트 제거 - 사용자가 직접 멤버십 취소 불가
    // 멤버십은 기간 만료 또는 자동 연장 실패 시에만 inactive로 변경됨

    return errorResponse('NOT_FOUND', 'Endpoint not found', null, 404);

  } catch (err: any) {
    return errorResponse(
      'SERVER_ERROR',
      err.message ?? 'Unknown server error',
      err,
      500,
      { headers: corsHeaders }
    );
  }
});
