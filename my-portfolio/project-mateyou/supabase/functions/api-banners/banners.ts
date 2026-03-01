import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders, successResponse, errorResponse, createSupabaseClient } from '../_shared/utils.ts'

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // GET /api-banners - 활성화된 배너 목록 조회 (공개 - 인증 불필요)
    if (req.method === 'GET') {
      const url = new URL(req.url)
      const page = parseInt(url.searchParams.get('page') || '1')
      const limit = parseInt(url.searchParams.get('limit') || '20')
      const offset = (page - 1) * limit
      const location = url.searchParams.get('location') // 'main' | 'partner_dashboard'

      const supabase = createSupabaseClient()

      try {
        let query = supabase
          .from('ad_banners')
          .select('*', { count: 'exact' })
          .eq('is_active', true)
          .order('created_at', { ascending: false })

        // 위치 필터링 (있는 경우)
        if (location) {
          query = query.eq('display_location', location)
        }

        const { data: banners, error: bannersError, count } = await query
          .range(offset, offset + limit - 1)

        if (bannersError) throw bannersError

        // 서버 측 시간 필터링 (start_at, end_at 기준)
        const now = new Date()
        const validBanners = (banners || []).filter((banner) => {
          // 시작 시간 체크: start_at이 있고 현재 시간이 시작 시간 이전이면 제외
          if (banner.start_at) {
            const startTime = new Date(banner.start_at)
            if (now < startTime) return false
          }

          // 종료 시간 체크: end_at이 있고 현재 시간이 종료 시간 이후면 제외
          if (banner.end_at) {
            const endTime = new Date(banner.end_at)
            if (now > endTime) return false
          }

          return true
        })

        // background_image를 image_url로 매핑
        const formattedBanners = validBanners.map(banner => ({
          ...banner,
          image_url: banner.background_image || banner.mobile_background_image,
        }))

        return successResponse(formattedBanners, {
          total: validBanners.length,
          page,
          limit,
          totalPages: Math.ceil(validBanners.length / limit)
        })
      } catch (error) {
        console.error('배너 조회 에러:', error)
        return errorResponse('BANNERS_FETCH_ERROR', '배너 조회 실패', error.message)
      }
    }

    return errorResponse('METHOD_NOT_ALLOWED', '지원되지 않는 HTTP 메서드입니다', null, 405)
  } catch (error) {
    console.error('예상치 못한 오류:', error)
    return errorResponse('INTERNAL_ERROR', '서버 내부 오류가 발생했습니다', error, 500)
  }
})