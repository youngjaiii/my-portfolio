import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createSupabaseClient, getAuthUser } from '../_shared/utils.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const pathname = url.pathname

    if (req.method === 'POST' && pathname === '/api-post-purchase') {
      const user = await getAuthUser(req)
      if (!user) {
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized' }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 401,
          },
        )
      }

      const body = await req.json()
      const post_id = body.post_id as string | undefined

      if (!post_id) {
        return new Response(
          JSON.stringify({ success: false, error: 'post_id is required' }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          },
        )
      }

      const supabase = createSupabaseClient()

      // 1. 게시글 정보 조회 (가격 등)
      const { data: post, error: postError } = await supabase
        .from('posts')
        .select('id, partner_id, point_price, is_paid_post')
        .eq('id', post_id)
        .single()

      if (postError || !post) {
        return new Response(
          JSON.stringify({
            success: false,
            error: postError?.message || 'Post not found',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 404,
          },
        )
      }

      const price = (post.point_price as number | null) ?? 0
      const isPaidPost = !!post.is_paid_post

      if (!isPaidPost || price <= 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'This post is not configured as a paid post.',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          },
        )
      }

      // 2. 회원 포인트 조회
      const { data: member, error: memberError } = await supabase
        .from('members')
        .select('id, total_points')
        .eq('id', user.id)
        .single()

      if (memberError || !member) {
        return new Response(
          JSON.stringify({
            success: false,
            error: memberError?.message || 'Member not found',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 404,
          },
        )
      }

      const currentPoints = (member.total_points as number | null) ?? 0
      if (currentPoints < price) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `포인트가 부족합니다. 필요: ${price}, 보유: ${currentPoints}`,
            code: 'INSUFFICIENT_POINTS',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          },
        )
      }

      // 3. 이미 구매했는지 확인
      const { data: existingPurchase, error: purchaseCheckError } = await supabase
        .from('purchases')
        .select('id')
        .eq('member_id', user.id)
        .eq('post_id', post_id)
        .maybeSingle()

      if (purchaseCheckError) {
        return new Response(
          JSON.stringify({
            success: false,
            error: purchaseCheckError.message,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          },
        )
      }

      if (existingPurchase) {
        return new Response(
          JSON.stringify({
            success: true,
            alreadyPurchased: true,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          },
        )
      }

      // 4. 포인트 차감 & 구매 기록 생성 (트랜잭션이 없으므로 순차 처리)

      // 4-1. 포인트 차감
      const newTotalPoints = currentPoints - price

      const { error: pointsUpdateError } = await supabase
        .from('members')
        .update({ total_points: newTotalPoints })
        .eq('id', user.id)

      if (pointsUpdateError) {
        return new Response(
          JSON.stringify({
            success: false,
            error: pointsUpdateError.message,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          },
        )
      }

      // 4-2. 구매 테이블에 기록
      const { data: newPurchase, error: purchaseInsertError } = await supabase
        .from('purchases')
        .insert({
          member_id: user.id,
          post_id,
        })
        .select('*')
        .single()

      if (purchaseInsertError) {
        return new Response(
          JSON.stringify({
            success: false,
            error: purchaseInsertError.message,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
          },
        )
      }

      // 4-3. 포인트 로그 기록 (실패하더라도 결제 자체는 성공 처리)
      const { error: logError } = await supabase.from('points_log').insert({
        member_id: user.id,
        points: -price,
        reason: `포스트 단건구매: ${post_id}`,
        reference_type: 'post_purchase',
        reference_id: newPurchase.id,
      })

      if (logError) {
        console.error('Failed to log post purchase points:', logError)
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: {
            purchase: newPurchase,
            remaining_points: newTotalPoints,
          },
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      )
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Endpoint not found' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      },
    )
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})


