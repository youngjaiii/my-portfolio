import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders, successResponse, errorResponse, createSupabaseClient, getQueryParams } from '../_shared/utils.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders })
  }

  try {
    const supabase = createSupabaseClient()
    const params = getQueryParams(req.url)
    const rawId = params.partner_category_id
    const parsed = rawId != null && rawId !== '' ? parseInt(rawId, 10) : NaN
    const partnerCategoryId = Number.isFinite(parsed) ? parsed : null

    // GET - 카테고리별 파트너 정보 조회 (수동 + 자동화 섹션 통합)
    if (req.method === 'GET') {
      // 1. 카테고리 조회 (is_pinned 우선, sort_order 순)
      let categoryQuery = supabase
        .from('explore_category')
        .select('*')
        .order('is_pinned', { ascending: false })
        .order('sort_order', { ascending: true })

      if (partnerCategoryId) {
        categoryQuery = categoryQuery.or(`partner_category_id.eq.${partnerCategoryId},partner_category_id.is.null`)
      }

      const { data: rawCategories, error: catError } = await categoryQuery

      if (catError) {
        return errorResponse('FETCH_ERROR', '카테고리 조회 실패', catError.message)
      }

      if (!rawCategories || rawCategories.length === 0) {
        return successResponse([])
      }

      // section_type별·id별 중복 제거 (DB에 동일 section_type 2건 있는 경우 첫 번째만 사용)
      const seenSectionTypes = new Set<string | null>()
      const seenIds = new Set<string>()
      const categories = rawCategories.filter((c: any) => {
        if (c.section_type != null) {
          if (seenSectionTypes.has(c.section_type)) return false
          seenSectionTypes.add(c.section_type)
        } else {
          if (seenIds.has(c.id)) return false
          seenIds.add(c.id)
        }
        return true
      })

      let allowedPartnerIds: Set<string> | null = null
      if (partnerCategoryId != null) {
        const { data: pcRows } = await supabase.from('partner_categories').select('user_id').eq('category_id', partnerCategoryId)
        const userIds = [...new Set((pcRows || []).map((r: any) => r.user_id).filter(Boolean))]
        if (userIds.length > 0) {
          const { data: partnersInCat } = await supabase.from('partners').select('id').in('member_id', userIds).eq('partner_status', 'approved')
          allowedPartnerIds = new Set((partnersInCat || []).map((p: any) => p.id))
        } else {
          allowedPartnerIds = new Set()
        }
      }

      // 자동화 섹션용: 승인된 파트너 중 팀색 제외(admin_role >= 2 제외), 탭별로 partner_category 필터
      const fetchEligiblePartners = async () => {
        const { data } = await supabase
          .from('partners')
          .select(`
            id, partner_name, partner_message, member_id, follow_count, partner_reviewed_at,
            member:members!partners_member_id_fkey(id, name, member_code, profile_image, admin_role)
          `)
          .eq('partner_status', 'approved')
        let list = (data || []).filter((p: any) => {
          const m = p.member
          if (!m) return false
          return (m.admin_role ?? 0) < 2
        })
        if (allowedPartnerIds != null) list = list.filter((p: any) => allowedPartnerIds!.has(p.id))
        return list
      }

      // 자동화 섹션 데이터 가져오기
      const fetchAutoSectionPartners = async (sectionType: string) => {
        const eligible = await fetchEligiblePartners()
        if (eligible.length === 0) return []
        const partnerIds = eligible.map((p: any) => p.id)
        const mapPartner = (p: any) => ({
          partner_id: p.id,
          partner_name: p.partner_name,
          partner_message: p.partner_message,
          profile_image: p.member?.profile_image || null,
          member_code: p.member?.member_code || null,
          member_name: p.member?.name || null,
          banners: null,
          sort_order: 0,
        })

        switch (sectionType) {
          case 'new_partners': {
            const sorted = [...eligible].sort((a: any, b: any) =>
              new Date(b.partner_reviewed_at || 0).getTime() - new Date(a.partner_reviewed_at || 0).getTime()
            ).slice(0, 10)
            return sorted.map(mapPartner)
          }
          case 'store_sales': {
            const { data: orders } = await supabase
              .from('store_orders')
              .select('partner_id, total_amount')
              .in('status', ['confirmed', 'delivered'])
              .in('partner_id', partnerIds)
            const totals: Record<string, number> = {}
            for (const o of orders || []) {
              if (o.partner_id) totals[o.partner_id] = (totals[o.partner_id] || 0) + (o.total_amount || 0)
            }
            const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 10)
            return sorted.map(([pid]) => {
              const p = eligible.find((e: any) => e.id === pid)
              return p ? mapPartner(p) : null
            }).filter(Boolean)
          }
          case 'top_posts': {
            const { data: posts } = await supabase
              .from('posts')
              .select('partner_id')
              .in('partner_id', partnerIds)
            const counts: Record<string, number> = {}
            for (const p of posts || []) {
              if (p.partner_id) counts[p.partner_id] = (counts[p.partner_id] || 0) + 1
            }
            const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10)
            return sorted.map(([pid]) => {
              const p = eligible.find((e: any) => e.id === pid)
              return p ? mapPartner(p) : null
            }).filter(Boolean)
          }
          case 'top_quests': {
            const { data: requests } = await supabase
              .from('partner_requests')
              .select('partner_id')
              .in('partner_id', partnerIds)
            const counts: Record<string, number> = {}
            for (const r of requests || []) {
              if (r.partner_id) counts[r.partner_id] = (counts[r.partner_id] || 0) + 1
            }
            const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10)
            return sorted.map(([pid]) => {
              const p = eligible.find((e: any) => e.id === pid)
              return p ? mapPartner(p) : null
            }).filter(Boolean)
          }
          case 'subscriber_growth': {
            const memberIdMap: Record<string, any> = {}
            for (const p of eligible as any[]) { memberIdMap[p.member_id] = p }
            const eligibleMemberIds = eligible.map((p: any) => p.member_id)

            const { data: memberships } = await supabase
              .from('membership')
              .select('id, partner_id')
              .in('partner_id', partnerIds)
              .eq('is_active', true)
            const membershipIds = (memberships || []).map(m => m.id)
            if (membershipIds.length === 0) return []

            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
            const { data: subs } = await supabase
              .from('membership_subscriptions')
              .select('membership_id, created_at')
              .in('membership_id', membershipIds)
              .eq('status', 'active')
              .gte('created_at', sevenDaysAgo)

            const mToP: Record<string, string> = {}
            for (const m of memberships || []) { mToP[m.id] = m.partner_id }
            const counts: Record<string, number> = {}
            for (const s of subs || []) {
              const pid = mToP[s.membership_id]
              if (pid) counts[pid] = (counts[pid] || 0) + 1
            }
            const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10)
            return sorted.map(([pid]) => {
              const p = eligible.find((e: any) => e.id === pid)
              return p ? mapPartner(p) : null
            }).filter(Boolean)
          }
          case 'live': {
            const { data: rooms } = await supabase
              .from('stream_rooms')
              .select('host_partner_id')
              .eq('status', 'live')
            if (!rooms || rooms.length === 0) return []
            const livePartnerIds = rooms.map(r => r.host_partner_id).filter(Boolean)
            return eligible
              .filter((p: any) => livePartnerIds.includes(p.id))
              .map(mapPartner)
          }
          case 'ranking':
            return []
          default:
            return []
        }
      }

      const formatHashtag = (raw: unknown): string | null => {
        if (raw == null) return null
        if (Array.isArray(raw)) {
          const prefixed = (raw as string[]).map((s) => (typeof s === 'string' && s.startsWith('#') ? s : '#' + (s || '')))
          return prefixed.length ? prefixed.join(' ') : null
        }
        if (typeof raw === 'string') {
          return raw.startsWith('#') ? raw : '#' + raw
        }
        return null
      }

      // 2. 각 카테고리별 파트너 조회 (수동 vs 자동화)
      const result = await Promise.all(
        categories.map(async (category) => {
          const catInfo = {
            id: category.id,
            name: category.name,
            hashtag: formatHashtag(category.hashtag),
            is_pinned: category.is_pinned,
            sort_order: category.sort_order,
            partner_category_id: category.partner_category_id,
            section_type: category.section_type || null,
          }

          // 자동화 섹션
          if (category.section_type) {
            const autoPartners = await fetchAutoSectionPartners(category.section_type)
            return { category: catInfo, partners: autoPartners }
          }

          // 수동 카테고리 (기존 로직) — admin_role >= 2(팀색) 제외
          const { data: categoryPartners, error: cpError } = await supabase
            .from('explore_category_partners')
            .select(`
              id, banners, sort_order, partner_id,
              partner:partners(id, partner_name, partner_message, member_id,
                member:members!partners_member_id_fkey(id, name, member_code, profile_image, admin_role))
            `)
            .eq('explore_category_id', category.id)
            .order('sort_order', { ascending: true })

          if (cpError) {
            console.error(`카테고리 ${category.id} 파트너 조회 실패:`, cpError)
            return { category: catInfo, partners: [] }
          }

          const partnersWithCategories = await Promise.all(
            (categoryPartners || []).map(async (cp) => {
              const partner = cp.partner as any
              if (!partner) return null
              if ((partner.member?.admin_role ?? 0) >= 2) return null
              if (allowedPartnerIds != null && !allowedPartnerIds.has(partner.id)) return null
              const { data: partnerCats } = await supabase
                .from('partner_categories')
                .select('category_id, detail_category_id')
                .eq('user_id', partner.member_id)
              return {
                id: cp.id,
                partner_id: cp.partner_id,
                partner_name: partner.partner_name,
                partner_message: partner.partner_message,
                profile_image: partner.member?.profile_image || null,
                member_code: partner.member?.member_code || null,
                member_name: partner.member?.name || null,
                categories: partnerCats || [],
                banners: cp.banners,
                sort_order: cp.sort_order,
              }
            })
          )

          return { category: catInfo, partners: partnersWithCategories.filter(Boolean) }
        })
      )

      // 수동 카테고리는 파트너 있을 때만, 자동화 섹션(section_type 있음)은 파트너 없어도 반환
      let filteredResult = result.filter((r) =>
        r.partners.length > 0 || r.category.section_type != null
      )
      // ranking은 한 번만 (중복 방지)
      const seenRanking = { current: false }
      filteredResult = filteredResult.filter((r) => {
        if (r.category.section_type === 'ranking') {
          if (seenRanking.current) return false
          seenRanking.current = true
        }
        return true
      })
      // 같은 카테고리 id 중복 제거 (첫 번째만 유지)
      const seenCategoryIds = new Set<string>()
      filteredResult = filteredResult.filter((r) => {
        if (seenCategoryIds.has(r.category.id)) return false
        seenCategoryIds.add(r.category.id)
        return true
      })

      return successResponse(filteredResult)
    }

    return errorResponse('METHOD_NOT_ALLOWED', '지원되지 않는 HTTP 메서드입니다', null, 405)
  } catch (error) {
    console.error('api-explore error:', error)
    return errorResponse('INTERNAL_ERROR', '서버 내부 오류가 발생했습니다', error instanceof Error ? error.message : String(error), 500)
  }
})
