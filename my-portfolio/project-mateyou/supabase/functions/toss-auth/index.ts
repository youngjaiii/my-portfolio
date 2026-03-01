import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { corsHeaders, createSupabaseClient, errorResponse, successResponse, getAuthUser } from '../_shared/utils.ts'

serve(async (req) => {
  try {
    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response('ok', { headers: corsHeaders })
    }

    if (req.method !== 'GET') {
      return errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', null, 405)
    }

    // 인증 확인
    const user = await getAuthUser(req)

    // Secret Key 가져오기
    const secretKey = Deno.env.get('TOSS_PAYMENTS_SECRET_KEY')?.trim()
    if (!secretKey) {
      return errorResponse('ENV_ERROR', 'TOSS_PAYMENTS_SECRET_KEY not configured', null, 500)
    }

    // Basic Authentication 토큰 생성 (Secret Key + ':' 를 Base64 인코딩)
    const authToken = btoa(`${secretKey}:`)

    // API Base URL - 올바른 Toss API URL 사용
    const apiBase = 'https://api.tosspayments.com'

    return successResponse({
      authToken,
      authHeader: `Basic ${authToken}`,
      apiBase,
      keyType: secretKey.startsWith('test_sk') ? 'test' : secretKey.startsWith('live_sk') ? 'live' : 'unknown',
      userId: user.id
    })

  } catch (error) {
    console.error('[TOSS-AUTH] unexpected error', error)

    // Handle authentication errors
    if (error.message.includes('authorization') || error.message.includes('token')) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', null, 401)
    }

    const message = error instanceof Error ? error.message : 'Unknown error occurred'
    return errorResponse('INTERNAL_ERROR', 'Internal server error', message, 500)
  }
})