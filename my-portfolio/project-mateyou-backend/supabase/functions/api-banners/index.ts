import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders, successResponse, errorResponse } from '../_shared/utils.ts'

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // GET /api-banners - 활성화된 배너 목록 조회 (공개 - 인증 불필요)
    if (req.method === 'GET') {
      // For now, return empty array to test if the endpoint works without database access
      return successResponse([], {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0
      })
    }

    return errorResponse('METHOD_NOT_ALLOWED', '지원되지 않는 HTTP 메서드입니다', null, 405)
  } catch (error) {
    console.error('예상치 못한 오류:', error)
    return errorResponse('INTERNAL_ERROR', '서버 내부 오류가 발생했습니다', error, 500)
  }
})