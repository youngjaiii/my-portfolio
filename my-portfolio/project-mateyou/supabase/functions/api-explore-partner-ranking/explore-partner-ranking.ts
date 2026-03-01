import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders, successResponse, errorResponse, createSupabaseClient, getQueryParams, getAuthUser } from '../_shared/utils.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'GET') {
    return errorResponse('METHOD_NOT_ALLOWED', 'GET만 지원합니다', null, 405)
  }

  try {
    const supabase = createSupabaseClient()
    const params = getQueryParams(req.url)
    const sortBy = params.sort_by || 'total_earnings'
    const limit = Math.min(parseInt(params.limit || '10'), 100)
    const rawCat = params.category_id
    const categoryId = rawCat != null && rawCat !== '' ? (() => { const n = parseInt(rawCat, 10); return Number.isFinite(n) ? n : null })() : null

    let allowedPartnerIds: Set<string> | null = null
    if (categoryId != null) {
      const { data: pcRows } = await supabase.from('partner_categories').select('user_id').eq('category_id', categoryId)
      const userIds = [...new Set((pcRows || []).map((r: any) => r.user_id).filter(Boolean))]
      if (userIds.length > 0) {
        const { data: partnersInCat } = await supabase.from('partners').select('id').in('member_id', userIds).eq('partner_status', 'approved')
        allowedPartnerIds = new Set((partnersInCat || []).map((p: any) => p.id))
      } else {
        allowedPartnerIds = new Set()
      }
    }

    let currentUserId: string | null = null
    try {
      const user = await getAuthUser(req)
      currentUserId = user?.id || null
    } catch {
      // 비로그인 사용자도 접근 가능
    }

    let rankings: any[] = []

    if (sortBy === 'total_earnings') {
      const partnerTotals: Record<string, { total: number; partner: any }> = {}

      const { data: storeOrders, error: storeOrdersError } = await supabase
        .from('store_orders')
        .select(`
          partner_id,
          total_amount,
          partners!inner (
            id,
            partner_name,
            partner_status,
            member:members!partners_member_id_fkey (
              id,
              profile_image,
              member_code,
              admin_role
            )
          )
        `)
        .in('status', ['confirmed', 'delivered'])
        .not('partner_id', 'is', null)

      if (storeOrdersError) {
        console.error('스토어 주문 조회 실패:', storeOrdersError)
        return errorResponse('FETCH_ERROR', '랭킹 조회 실패', storeOrdersError.message)
      }

      for (const order of storeOrders || []) {
        const partnerId = order.partner_id
        const partner = order.partners as any
        if (!partnerId || !partner || partner.partner_status !== 'approved') continue
        if ((partner.member?.admin_role ?? 0) >= 2) continue
        if (!partnerTotals[partnerId]) partnerTotals[partnerId] = { total: 0, partner }
        partnerTotals[partnerId].total += order.total_amount || 0
      }

      const { data: membershipSubs, error: membershipError } = await supabase
        .from('membership_subscriptions')
        .select(`
          membership:membership_id (
            id,
            partner_id,
            monthly_price,
            partners:partner_id (
              id,
              partner_name,
              partner_status,
              member:members!partners_member_id_fkey (
                id,
                profile_image,
                member_code,
                admin_role
              )
            )
          )
        `)
        .eq('status', 'active')

      if (membershipError) {
        console.error('멤버십 구독 조회 실패:', membershipError)
        return errorResponse('FETCH_ERROR', '랭킹 조회 실패', membershipError.message)
      }

      for (const sub of membershipSubs || []) {
        const membership = sub.membership as any
        if (!membership?.partners) continue
        const partner = membership.partners
        if (partner.partner_status !== 'approved') continue
        if ((partner.member?.admin_role ?? 0) >= 2) continue
        const partnerId = partner.id
        const amount = Number(membership.monthly_price || 0)
        if (!partnerTotals[partnerId]) partnerTotals[partnerId] = { total: 0, partner }
        partnerTotals[partnerId].total += amount
      }

      const { data: postUnlocks, error: postUnlocksError } = await supabase
        .from('post_unlocks')
        .select(`
          point_price,
          post:post_id (
            id,
            partner_id,
            partners:partner_id (
              id,
              partner_name,
              partner_status,
              member:members!partners_member_id_fkey (
                id,
                profile_image,
                member_code,
                admin_role
              )
            )
          )
        `)

      if (postUnlocksError) {
        console.error('게시글 잠금해제 조회 실패:', postUnlocksError)
        return errorResponse('FETCH_ERROR', '랭킹 조회 실패', postUnlocksError.message)
      }

      for (const unlock of postUnlocks || []) {
        const post = unlock.post as any
        if (!post?.partners) continue
        const partner = post.partners
        if (partner.partner_status !== 'approved') continue
        if ((partner.member?.admin_role ?? 0) >= 2) continue
        const partnerId = partner.id
        if (!partnerTotals[partnerId]) partnerTotals[partnerId] = { total: 0, partner }
        partnerTotals[partnerId].total += unlock.point_price || 0
      }

      const entries = allowedPartnerIds != null
        ? Object.entries(partnerTotals).filter(([pid]) => allowedPartnerIds!.has(pid))
        : Object.entries(partnerTotals)
      const sorted = entries.sort((a, b) => b[1].total - a[1].total).slice(0, limit)

      rankings = sorted.map(([partnerId, data], index) => ({
        rank: index + 1,
        partner_id: partnerId,
        partner_name: data.partner.partner_name,
        profile_image: data.partner.member?.profile_image || null,
        member_code: data.partner.member?.member_code || null,
        value: data.total,
      }))
    } else if (sortBy === 'followers') {
      const { data: partners, error: partnersError } = await supabase
        .from('partners')
        .select(`
          id,
          partner_name,
          partner_status,
          follow_count,
          member:members!partners_member_id_fkey (
            id,
            profile_image,
            member_code,
            admin_role
          )
        `)
        .eq('partner_status', 'approved')
        .gt('follow_count', 0)
        .order('follow_count', { ascending: false })
        .limit(limit * 2)

      if (partnersError) {
        console.error('팔로워 랭킹 조회 실패:', partnersError)
        return errorResponse('FETCH_ERROR', '랭킹 조회 실패', partnersError.message)
      }

      let list = (partners || []).filter((p: any) => (p.member?.admin_role ?? 0) < 2)
      if (allowedPartnerIds != null) list = list.filter((p: any) => allowedPartnerIds!.has(p.id))
      rankings = list.slice(0, limit).map((partner: any, index: number) => ({
        rank: index + 1,
        partner_id: partner.id,
        partner_name: partner.partner_name,
        profile_image: partner.member?.profile_image || null,
        member_code: partner.member?.member_code || null,
        value: partner.follow_count || 0,
      }))
    } else if (sortBy === 'subscribers') {
      const { data: subscriptions, error: subError } = await supabase
        .from('membership_subscriptions')
        .select(`
          membership:membership_id (
            id,
            partner_id,
            partners:partner_id (
              id,
              partner_name,
              partner_status,
              member:members!partners_member_id_fkey (
                id,
                profile_image,
                member_code,
                admin_role
              )
            )
          )
        `)
        .eq('status', 'active')

      if (subError) {
        console.error('구독자 랭킹 조회 실패:', subError)
        return errorResponse('FETCH_ERROR', '랭킹 조회 실패', subError.message)
      }

      const partnerCounts: Record<string, { count: number; partner: any }> = {}
      for (const sub of subscriptions || []) {
        const membership = sub.membership as any
        if (!membership?.partners) continue
        const partner = membership.partners
        if (partner.partner_status !== 'approved') continue
        if ((partner.member?.admin_role ?? 0) >= 2) continue
        const partnerId = partner.id
        if (!partnerCounts[partnerId]) partnerCounts[partnerId] = { count: 0, partner }
        partnerCounts[partnerId].count += 1
      }

      const entries = allowedPartnerIds != null
        ? Object.entries(partnerCounts).filter(([pid]) => allowedPartnerIds!.has(pid))
        : Object.entries(partnerCounts)
      const sorted = entries.sort((a, b) => b[1].count - a[1].count).slice(0, limit)

      rankings = sorted.map(([partnerId, data], index) => ({
        rank: index + 1,
        partner_id: partnerId,
        partner_name: data.partner.partner_name,
        profile_image: data.partner.member?.profile_image || null,
        member_code: data.partner.member?.member_code || null,
        value: data.count,
      }))
    }

    if (rankings.length > 0) {
      const partnerIds = rankings.map(r => r.partner_id)
      const { data: partnersData } = await supabase
        .from('partners')
        .select('id, follow_count')
        .in('id', partnerIds)

      const followCountMap: Record<string, number> = {}
      for (const p of partnersData || []) {
        followCountMap[p.id] = p.follow_count || 0
      }

      let followedSet = new Set<string>()
      if (currentUserId) {
        const { data: followsData } = await supabase
          .from('follow')
          .select('partner_id')
          .eq('follower_id', currentUserId)
          .in('partner_id', partnerIds)
        followedSet = new Set((followsData || []).map(f => f.partner_id))
      }

      rankings = rankings.map(r => ({
        ...r,
        follow_count: followCountMap[r.partner_id] || 0,
        is_followed: followedSet.has(r.partner_id),
      }))
    }

    return successResponse({
      rankings,
      total_count: rankings.length,
      sort_by: sortBy,
      period: params.period || 'all',
    })
  } catch (error) {
    console.error('api-explore-partner-ranking error:', error)
    return errorResponse('INTERNAL_ERROR', '서버 내부 오류가 발생했습니다', error instanceof Error ? error.message : String(error), 500)
  }
})
