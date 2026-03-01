import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { corsHeaders, createSupabaseClient, getAuthUser } from '../_shared/utils.ts';

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    // 사용자 인증 및 관리자 권한 확인
    const user = await getAuthUser(req);
    const supabase = createSupabaseClient();

    const { data: userData, error: userError } = await supabase
      .from('members')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userError || !userData || userData.role !== 'admin') {
      return new Response('Admin access required', { status: 403 });
    }

    // 정확히 curl 명령어처럼 호출
    const res = await fetch("https://api.tosspayments.com/v2/balances", {
      method: "GET",
      headers: {
        "Authorization": "Basic bGl2ZV9za19BTG5RdkRkMlZKUFFCMHBRNkR4eDhNajdYNDFtOg==",
      },
    });

    const responseText = await res.text();

    // 응답을 JSON으로 파싱 시도
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { rawResponse: responseText };
    }

    // 성공 응답 포맷
    const result = {
      success: res.ok,
      status: res.status,
      data: responseData,
      retrievedAt: new Date().toISOString()
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });

  } catch (error) {
    console.error('Toss Balance API error:', error);

    const errorResult = {
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Internal server error',
        code: 'INTERNAL_ERROR'
      }
    };

    return new Response(JSON.stringify(errorResult), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
});