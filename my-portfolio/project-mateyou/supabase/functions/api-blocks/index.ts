import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Authorization header에서 사용자 정보 추출
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: '인증이 필요합니다.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: '유효하지 않은 인증입니다.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const url = new URL(req.url)
    const pathParts = url.pathname.split('/').filter(Boolean)
    // pathParts: ["functions", "v1", "api-blocks", ...]

    // POST /api-blocks - 사용자 차단
    if (req.method === 'POST') {
      const body = await req.json()
      const { blocked_member_code } = body

      if (!blocked_member_code) {
        return new Response(
          JSON.stringify({ success: false, error: '차단할 사용자 코드가 필요합니다.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // 자기 자신 차단 방지
      const { data: currentUser } = await supabase
        .from('members')
        .select('member_code')
        .eq('id', user.id)
        .single()

      if (currentUser?.member_code === blocked_member_code) {
        return new Response(
          JSON.stringify({ success: false, error: '자기 자신을 차단할 수 없습니다.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // 이미 차단했는지 확인
      const { data: existingBlock } = await supabase
        .from('member_blocks')
        .select('id')
        .eq('blocker_member', user.id)
        .eq('blocked_member', blocked_member_code)
        .single()

      if (existingBlock) {
        return new Response(
          JSON.stringify({ success: false, error: '이미 차단한 사용자입니다.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // 차단 추가
      const { data: blockData, error: blockError } = await supabase
        .from('member_blocks')
        .insert({
          blocker_member: user.id,
          blocked_member: blocked_member_code,
        })
        .select()
        .single()

      if (blockError) {
        console.error('차단 추가 실패:', blockError)
        return new Response(
          JSON.stringify({ success: false, error: '차단에 실패했습니다.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ success: true, data: blockData }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // DELETE /api-blocks - 차단 해제
    if (req.method === 'DELETE') {
      const body = await req.json()
      const { blocked_member_code } = body

      if (!blocked_member_code) {
        return new Response(
          JSON.stringify({ success: false, error: '차단 해제할 사용자 코드가 필요합니다.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { error: deleteError } = await supabase
        .from('member_blocks')
        .delete()
        .eq('blocker_member', user.id)
        .eq('blocked_member', blocked_member_code)

      if (deleteError) {
        console.error('차단 해제 실패:', deleteError)
        return new Response(
          JSON.stringify({ success: false, error: '차단 해제에 실패했습니다.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ success: true, message: '차단이 해제되었습니다.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // GET /api-blocks - 차단 목록 조회
    if (req.method === 'GET') {
      // 내가 차단한 목록 조회 (blocker_member = user.id - uuid)
      const { data: blocks, error: blocksError } = await supabase
        .from('member_blocks')
        .select('*')
        .eq('blocker_member', user.id)
        .order('created_at', { ascending: false })

      if (blocksError) {
        console.error('차단 목록 조회 실패:', blocksError)
        return new Response(
          JSON.stringify({ success: false, error: '차단 목록 조회에 실패했습니다.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // 차단된 사용자들의 정보 조회
      const blockedMemberCodes = (blocks || []).map(b => b.blocked_member)
      
      let blockedUsersInfo: any[] = []
      if (blockedMemberCodes.length > 0) {
        const { data: membersData } = await supabase
          .from('members')
          .select('id, member_code, name, profile_image')
          .in('member_code', blockedMemberCodes)

        // 차단 정보와 사용자 정보 결합
        blockedUsersInfo = (blocks || []).map(block => {
          const userInfo = (membersData || []).find(m => m.member_code === block.blocked_member)
          return {
            id: block.id,
            blocked_member: block.blocked_member,
            created_at: block.created_at,
            user_id: userInfo?.id || null,
            user_info: userInfo ? {
              name: userInfo.name,
              profile_image: userInfo.profile_image,
              member_code: userInfo.member_code,
            } : null,
            user_name: userInfo?.name || block.blocked_member,
            banned_at: block.created_at,
          }
        })
      }

      return new Response(
        JSON.stringify({ success: true, data: blockedUsersInfo }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // GET /api-blocks/check/:memberCode - 특정 사용자 차단 여부 확인
    // memberCode: 상대방의 member_code
    if (req.method === 'GET' && pathParts.length >= 5 && pathParts[3] === 'check') {
      const targetMemberCode = pathParts[4]

      console.log('🔍 [api-blocks/check] targetMemberCode:', targetMemberCode)
      console.log('🔍 [api-blocks/check] user.id (나):', user.id)

      // 현재 사용자의 member_code 조회
      const { data: currentUser } = await supabase
        .from('members')
        .select('member_code')
        .eq('id', user.id)
        .single()

      console.log('🔍 [api-blocks/check] currentUser (내 정보):', currentUser)

      // 상대방의 uuid 조회 (member_code로)
      const { data: targetUser } = await supabase
        .from('members')
        .select('id')
        .eq('member_code', targetMemberCode)
        .single()

      console.log('🔍 [api-blocks/check] targetUser (상대 정보):', targetUser)

      // 내가 상대방을 차단했는지 확인
      // blocker_member = 나의 uuid, blocked_member = 상대방의 member_code
      const { data: blockedByMe } = await supabase
        .from('member_blocks')
        .select('id')
        .eq('blocker_member', user.id)
        .eq('blocked_member', targetMemberCode)
        .maybeSingle()

      console.log('🔍 [api-blocks/check] blockedByMe:', blockedByMe)

      // 상대방이 나를 차단했는지 확인
      // blocker_member = 상대방의 uuid, blocked_member = 나의 member_code
      let blockedByTarget = null
      if (targetUser?.id && currentUser?.member_code) {
        const { data: blockData } = await supabase
          .from('member_blocks')
          .select('id')
          .eq('blocker_member', targetUser.id)
          .eq('blocked_member', currentUser.member_code)
          .maybeSingle()
        blockedByTarget = blockData
        console.log('🔍 [api-blocks/check] blockedByTarget query:', { blocker_member: targetUser.id, blocked_member: currentUser.member_code })
        console.log('🔍 [api-blocks/check] blockedByTarget:', blockedByTarget)
      }

      const result = {
        blockedByMe: !!blockedByMe,        // 내가 상대방을 차단했는지
        blockedByTarget: !!blockedByTarget, // 상대방이 나를 차단했는지
      }
      console.log('🔍 [api-blocks/check] 최종 결과:', result)

      return new Response(
        JSON.stringify({ 
          success: true, 
          data: result
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: false, error: '지원하지 않는 요청입니다.' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('api-blocks error:', error)
    return new Response(
      JSON.stringify({ success: false, error: '서버 오류가 발생했습니다.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

