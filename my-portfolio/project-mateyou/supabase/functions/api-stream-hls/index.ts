/**
 * api-stream-hls - HLS 프록시 Edge Function (인증 불필요)
 * 
 * 스트림 키를 숨기고 파트너 ID로 HLS 스트림을 제공합니다.
 * 이 함수는 --no-verify-jwt 옵션으로 배포되어 인증 없이 접근 가능합니다.
 * 
 * 엔드포인트:
 * - GET /api-stream-hls/{partnerId}/{file} - HLS 파일 프록시 (index.m3u8, *.ts)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
}

serve(async (req) => {
  // CORS 처리
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // GET/HEAD만 허용
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const pathname = url.pathname
    
    // 경로 파싱: /api-stream-hls/{partnerId}/{filePath}
    // 예: /api-stream-hls/abc-123/index.m3u8
    // 예: /api-stream-hls/abc-123/0.ts
    const match = pathname.match(/^\/api-stream-hls\/([^/]+)\/(.+)$/)
    
    if (!match) {
      return new Response('Invalid path', { 
        status: 400, 
        headers: corsHeaders 
      })
    }

    const partnerId = match[1]
    const filePath = match[2]

    // Supabase 클라이언트 (서비스 역할 키 사용)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 파트너 ID로 활성 방의 스트림 키 조회
    const { data: roomData, error: roomError } = await supabase
      .from('stream_rooms')
      .select('stream_key')
      .eq('host_partner_id', partnerId)
      .eq('status', 'live')
      .eq('broadcast_type', 'hls')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // 스트림 키 결정
    let streamKey: string | null = null
    
    if (roomData?.stream_key) {
      streamKey = roomData.stream_key
      console.log('Using stream key from room:', streamKey.slice(0, 16))
    } else {
      // 방이 없거나 라이브가 아닌 경우, 스트림 키 테이블에서 조회 (하위 호환)
      const { data: keyData, error: keyError } = await supabase
        .from('mt_live_stream_keys')
        .select('stream_key')
        .eq('partner_id', partnerId)
        .eq('is_active', true)
        .maybeSingle()
      
      if (keyError) {
        console.error('Failed to fetch stream key:', keyError)
        return new Response(JSON.stringify({ error: 'KEY_ERROR', message: '스트림 키 조회 실패' }), { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      
      if (keyData?.stream_key) {
        streamKey = keyData.stream_key
        console.log('Using stream key from keys table:', streamKey.slice(0, 16))
      }
    }

    if (!streamKey) {
      return new Response(JSON.stringify({ error: 'NOT_STREAMING', message: '방송 중이 아닙니다' }), { 
        status: 404, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const cdnDomain = Deno.env.get('CDN_DOMAIN') || 'cdn.mateyou.me'
    const targetUrl = `https://${cdnDomain}/hls/${streamKey}/${filePath}`

    console.log('HLS Proxy:', { partnerId, filePath, streamKey: streamKey.slice(0, 16) })

    // CDN에서 HLS 파일 가져오기
    const response = await fetch(targetUrl)
    
    if (!response.ok) {
      console.error('CDN fetch failed:', response.status, response.statusText)
      return new Response('Stream not found', { 
        status: response.status,
        headers: corsHeaders 
      })
    }

    const contentType = response.headers.get('content-type') || 
      (filePath.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t')

    // m3u8 파일인 경우
    if (filePath.endsWith('.m3u8')) {
      const m3u8Content = await response.text()
      
      // 세그먼트 URL은 상대 경로이므로 그대로 두면 됨
      // 예: 0.ts, 1.ts는 같은 경로에서 /api-stream-hls/{partnerId}/0.ts로 요청됨
      
      return new Response(m3u8Content, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': contentType,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      })
    }

    // .ts 세그먼트 파일
    return new Response(response.body, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': contentType,
        'Cache-Control': 'max-age=3600',
      },
    })

  } catch (error) {
    console.error('HLS proxy error:', error)
    return new Response(JSON.stringify({ error: 'PROXY_ERROR', message: '프록시 오류' }), { 
      status: 502, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
