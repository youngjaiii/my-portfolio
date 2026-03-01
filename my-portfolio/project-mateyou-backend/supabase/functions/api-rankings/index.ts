import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RankingData {
  id: string
  name: string
  profileImage?: string | null
  count: number
  memberCode?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    )

    // 지난 30일 날짜 계산
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    // 1. 인기 파트너 (의뢰를 받은 수)
    const { data: popularData, error: popularError } = await supabaseClient
      .from('partner_requests')
      .select(`
        partner_id,
        partners!inner(
          member_id,
          partner_name,
          members!inner(
            id,
            name,
            profile_image,
            member_code
          )
        )
      `)
      .eq('status', 'completed')
      .gte('updated_at', thirtyDaysAgo.toISOString())

    if (popularError) throw popularError

    // 파트너별 완료된 의뢰 수 계산
    const partnerCounts = popularData?.reduce((acc: any, request: any) => {
      const partnerId = request.partner_id
      const partner = request.partners
      if (partner && partner.members) {
        if (!acc[partnerId]) {
          acc[partnerId] = {
            id: partner.members.id,
            name: partner.partner_name || partner.members.name,
            profileImage: partner.members.profile_image,
            memberCode: partner.members.member_code,
            count: 0
          }
        }
        acc[partnerId].count++
      }
      return acc
    }, {}) || {}

    const popularRanking = Object.values(partnerCounts)
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, 3) as RankingData[]

    // 2. 핫한 파트너 (의뢰를 받은 금액 순)
    const { data: hotData, error: hotError } = await supabaseClient
      .from('partner_requests')
      .select(`
        partner_id,
        total_coins,
        partners!inner(
          member_id,
          partner_name,
          members!inner(
            id,
            name,
            profile_image,
            member_code
          )
        )
      `)
      .eq('status', 'completed')
      .gte('updated_at', thirtyDaysAgo.toISOString())

    if (hotError) throw hotError

    // 파트너별 총 수익 계산
    const partnerEarnings = hotData?.reduce((acc: any, request: any) => {
      const partnerId = request.partner_id
      const partner = request.partners
      if (partner && partner.members) {
        if (!acc[partnerId]) {
          acc[partnerId] = {
            id: partner.members.id,
            name: partner.partner_name || partner.members.name,
            profileImage: partner.members.profile_image,
            memberCode: partner.members.member_code,
            count: 0
          }
        }
        acc[partnerId].count += request.total_coins || 0
      }
      return acc
    }, {}) || {}

    const hotRanking = Object.values(partnerEarnings)
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, 3) as RankingData[]

    // 3. 활동 활발한 회원 (클라이언트 요청 수)
    const { data: activeData, error: activeError } = await supabaseClient
      .from('partner_requests')
      .select(`
        client_id,
        members!inner(
          id,
          name,
          profile_image,
          member_code
        )
      `)
      .eq('status', 'completed')
      .gte('updated_at', thirtyDaysAgo.toISOString())

    if (activeError) throw activeError

    // 클라이언트별 요청 수 계산
    const clientCounts = activeData?.reduce((acc: any, request: any) => {
      const clientId = request.client_id
      const member = request.members
      if (member) {
        if (!acc[clientId]) {
          acc[clientId] = {
            id: member.id,
            name: member.name,
            profileImage: member.profile_image,
            memberCode: member.member_code,
            count: 0
          }
        }
        acc[clientId].count++
      }
      return acc
    }, {}) || {}

    const activeRanking = Object.values(clientCounts)
      .sort((a: any, b: any) => b.count - a.count)
      .slice(0, 3) as RankingData[]

    return new Response(
      JSON.stringify({
        popularPartners: popularRanking,
        hotPartners: hotRanking,
        activeMembers: activeRanking
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    )
  } catch (error) {
    console.error('Rankings API error:', error)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch rankings' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})