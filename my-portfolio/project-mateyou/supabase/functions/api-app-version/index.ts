import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

const DEFAULT_STORE_URLS: Record<string, string> = {
  ios: 'https://apps.apple.com/kr/app/id6755867402',
  android: 'https://play.google.com/store/apps/details?id=com.mateyou.app&hl=ko',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const url = new URL(req.url)
    const platform = url.searchParams.get('platform')

    if (!platform) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'platform parameter is required (ios, android, web)',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }

    // app_versions 테이블에서 해당 platform의 active 버전 정보 조회
    const { data, error } = await supabase
      .from('app_versions')
      .select('*')
      .eq('platform', platform)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      console.error('앱 버전 조회 DB 오류:', error.code, error.message)
      // 데이터가 없는 경우
      if (error.code === 'PGRST116') {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              platform,
              version: '1.0.0',
              force_update: false,
              store_url: DEFAULT_STORE_URLS[platform] || null,
              release_notes: null,
            },
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        )
      }
      throw error
    }

    // metadata에서 store_url 추출 또는 기본값 사용
    const metadata = data.metadata || {}
    const storeUrl = metadata.store_url || DEFAULT_STORE_URLS[platform] || null

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          platform: data.platform,
          version: data.version,
          force_update: data.force_update || false,
          store_url: storeUrl,
          release_notes: data.release_notes,
          min_version: data.min_supported,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error: any) {
    console.error('앱 버전 조회 오류:', error?.message || error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || '앱 버전 조회 중 오류가 발생했습니다',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})

