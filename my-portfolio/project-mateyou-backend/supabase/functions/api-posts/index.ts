import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  corsHeaders,
  createSupabaseClient,
  successResponse,
  errorResponse,
  getAuthUser,
  parseRequestBody,
} from '../_shared/utils.ts';

serve(async (req) => {
  // CORS 처리
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient();

    // POST /api-posts
    if (req.url.endsWith('/api-posts') && req.method === 'POST') {
      // 1) JWT 토큰으로 사용자 인증
      const user = await getAuthUser(req);

      // 2) 토큰 기반으로 partner_id 조회
      const { data: partner, error: partnerError } = await supabase
        .from('partner')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (partnerError) throw partnerError;
      if (!partner) {
        return errorResponse('PARTNER_NOT_FOUND', 'Partner profile not found for this user');
      }

      // 3) 요청 body 파싱
      const body = await parseRequestBody(req);
      if (!body) {
        return errorResponse('INVALID_BODY', 'Request body is required');
      }

      const {
        content,
        post_type = 'free',
        point_price,
        is_published = true,
        is_pinned = false,
      } = body;

      // 4) 유료 게시물 validation
      if (post_type === 'paid' && (!point_price || point_price <= 0)) {
        return errorResponse(
          'VALIDATION_ERROR',
          'Paid posts require a point_price greater than 0'
        );
      }

      // 5) published_at 자동 설정
      const published_at = is_published ? new Date().toISOString() : null;

      // 6) DB Insert
      const { data: newPost, error: insertError } = await supabase
        .from('posts')
        .insert([{
          partner_id: partner.id, // 토큰 기반 조회
          content,
          post_type,
          point_price: post_type === 'paid' ? point_price : null,
          is_pinned,
          is_published,
          published_at,
        }])
        .select()
        .single();

      if (insertError) throw insertError;

      return successResponse(newPost);
    }

    // 기타 라우트 → 404
    return errorResponse('NOT_FOUND', 'Endpoint not found', null, 404);

  } catch (err: any) {
    return errorResponse('SERVER_ERROR', err.message ?? 'Unknown server error', err, 500);
  }
});
