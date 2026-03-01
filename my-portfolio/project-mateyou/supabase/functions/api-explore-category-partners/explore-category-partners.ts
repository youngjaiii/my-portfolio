import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders, successResponse, errorResponse, createSupabaseClient, getAuthUser, parseRequestBody, getQueryParams } from '../_shared/utils.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createSupabaseClient()
    const url = new URL(req.url)
    const pathname = url.pathname.replace('/api-explore-category-partners', '') || '/'
    const params = getQueryParams(req.url)

    // GET - 카테고리별 파트너 목록 조회
    if (req.method === 'GET') {
      const user = await getAuthUser(req)
      const { data: member } = await supabase
        .from('members')
        .select('role')
        .eq('id', user.id)
        .single()

      if (member?.role !== 'admin') {
        return errorResponse('FORBIDDEN', '관리자 권한이 필요합니다', null, 403)
      }

      let query = supabase
        .from('explore_category_partners')
        .select(`
          *,
          partner:partners(
            id,
            partner_name,
            partner_message,
            member:members(id, name, member_code, profile_image)
          )
        `)
        .order('sort_order', { ascending: true })

      if (params.category_id) {
        query = query.eq('explore_category_id', params.category_id)
      }

      const { data, error } = await query

      if (error) {
        return errorResponse('FETCH_ERROR', '파트너 목록 조회 실패', error.message)
      }

      return successResponse(data)
    }

    // POST - 파트너 할당
    if (req.method === 'POST') {
      const user = await getAuthUser(req)
      const { data: member } = await supabase
        .from('members')
        .select('role')
        .eq('id', user.id)
        .single()

      if (member?.role !== 'admin') {
        return errorResponse('FORBIDDEN', '관리자 권한이 필요합니다', null, 403)
      }

      const body = await parseRequestBody(req)
      if (!body?.explore_category_id || !body?.partner_id) {
        return errorResponse('INVALID_BODY', 'explore_category_id와 partner_id는 필수입니다')
      }

      // sort_order 계산
      const { data: maxOrderData } = await supabase
        .from('explore_category_partners')
        .select('sort_order')
        .eq('explore_category_id', body.explore_category_id)
        .order('sort_order', { ascending: false })
        .limit(1)
        .single()

      const newSortOrder = (maxOrderData?.sort_order ?? -1) + 1

      const { data, error } = await supabase
        .from('explore_category_partners')
        .insert({
          explore_category_id: body.explore_category_id,
          partner_id: body.partner_id,
          banners: body.banners || null,
          sort_order: newSortOrder,
        })
        .select(`
          *,
          partner:partners(
            id,
            partner_name,
            partner_message,
            member:members(id, name, member_code, profile_image)
          )
        `)
        .single()

      if (error) {
        if (error.code === '23505') {
          return errorResponse('DUPLICATE', '이미 해당 카테고리에 할당된 파트너입니다')
        }
        return errorResponse('CREATE_ERROR', '파트너 할당 실패', error.message)
      }

      return successResponse(data)
    }

    // PUT - 파트너 정보 수정 (banner 교체 등)
    if (req.method === 'PUT') {
      const user = await getAuthUser(req)
      const { data: member } = await supabase
        .from('members')
        .select('role')
        .eq('id', user.id)
        .single()

      if (member?.role !== 'admin') {
        return errorResponse('FORBIDDEN', '관리자 권한이 필요합니다', null, 403)
      }

      const body = await parseRequestBody(req)

      // /reorder - 배치 순서 변경
      if (pathname === '/reorder') {
        if (!body?.items || !Array.isArray(body.items)) {
          return errorResponse('INVALID_BODY', 'items 배열이 필요합니다')
        }

        const updates = body.items.map((item: { id: string; sort_order: number }) =>
          supabase
            .from('explore_category_partners')
            .update({ sort_order: item.sort_order, updated_at: new Date().toISOString() })
            .eq('id', item.id)
        )

        await Promise.all(updates)
        return successResponse({ message: '순서가 변경되었습니다' })
      }

      // /:id - 개별 수정
      const idMatch = pathname.match(/^\/([a-f0-9-]+)$/i)
      if (!idMatch) {
        return errorResponse('INVALID_PATH', '유효하지 않은 경로입니다')
      }

      const recordId = idMatch[1]
      const updateData: Record<string, any> = { updated_at: new Date().toISOString() }

      if (body.banners !== undefined) updateData.banners = body.banners
      if (body.sort_order !== undefined) updateData.sort_order = body.sort_order

      const { data, error } = await supabase
        .from('explore_category_partners')
        .update(updateData)
        .eq('id', recordId)
        .select(`
          *,
          partner:partners(
            id,
            partner_name,
            partner_message,
            member:members(id, name, member_code, profile_image)
          )
        `)
        .single()

      if (error) {
        return errorResponse('UPDATE_ERROR', '수정 실패', error.message)
      }

      return successResponse(data)
    }

    // DELETE - 파트너 할당 해제
    if (req.method === 'DELETE') {
      const user = await getAuthUser(req)
      const { data: member } = await supabase
        .from('members')
        .select('role')
        .eq('id', user.id)
        .single()

      if (member?.role !== 'admin') {
        return errorResponse('FORBIDDEN', '관리자 권한이 필요합니다', null, 403)
      }

      const idMatch = pathname.match(/^\/([a-f0-9-]+)$/i)
      if (!idMatch) {
        return errorResponse('INVALID_PATH', '유효하지 않은 경로입니다')
      }

      const recordId = idMatch[1]

      // 기존 배너 이미지 삭제 (있다면)
      const { data: existing } = await supabase
        .from('explore_category_partners')
        .select('banners')
        .eq('id', recordId)
        .single()

      if (existing?.banners) {
        try {
          const bannerPath = existing.banners.split('/').pop()
          if (bannerPath) {
            await supabase.storage.from('explore_partner_banner').remove([bannerPath])
          }
        } catch (e) {
          console.error('배너 이미지 삭제 실패:', e)
        }
      }

      const { error } = await supabase
        .from('explore_category_partners')
        .delete()
        .eq('id', recordId)

      if (error) {
        return errorResponse('DELETE_ERROR', '삭제 실패', error.message)
      }

      return successResponse({ message: '파트너 할당이 해제되었습니다' })
    }

    return errorResponse('METHOD_NOT_ALLOWED', '지원되지 않는 HTTP 메서드입니다', null, 405)
  } catch (error) {
    console.error('api-explore-category-partners error:', error)
    if (error.message?.includes('authorization') || error.message?.includes('token')) {
      return errorResponse('UNAUTHORIZED', '인증이 필요합니다', null, 401)
    }
    return errorResponse('INTERNAL_ERROR', '서버 내부 오류가 발생했습니다', error.message, 500)
  }
})
