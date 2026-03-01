import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders, successResponse, errorResponse, createSupabaseClient, getAuthUser, parseRequestBody } from '../_shared/utils.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createSupabaseClient()
    const url = new URL(req.url)
    const pathname = url.pathname.replace('/api-explore-categories', '') || '/'

    // GET - 카테고리 목록 조회
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('explore_category')
        .select('*')
        .order('is_pinned', { ascending: false })
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })

      if (error) {
        return errorResponse('FETCH_ERROR', '카테고리 조회 실패', error.message)
      }

      return successResponse(data)
    }

    // POST - 카테고리 생성 (Admin 전용)
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
      if (!body || !body.name) {
        return errorResponse('INVALID_BODY', '카테고리 이름은 필수입니다')
      }

      // sort_order 계산: 같은 pinned 그룹 내 최대값 + 1
      const isPinned = body.is_pinned || false
      const { data: maxOrderData } = await supabase
        .from('explore_category')
        .select('sort_order')
        .eq('is_pinned', isPinned)
        .order('sort_order', { ascending: false })
        .limit(1)
        .single()

      const newSortOrder = (maxOrderData?.sort_order ?? -1) + 1

      const { data, error } = await supabase
        .from('explore_category')
        .insert({
          name: body.name,
          hashtag: body.hashtag || null,
          is_pinned: isPinned,
          sort_order: newSortOrder,
          partner_category_id: body.partner_category_id || null,
        })
        .select()
        .single()

      if (error) {
        return errorResponse('CREATE_ERROR', '카테고리 생성 실패', error.message)
      }

      return successResponse(data)
    }

    // PUT - 카테고리 수정 또는 reorder
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
            .from('explore_category')
            .update({ sort_order: item.sort_order, updated_at: new Date().toISOString() })
            .eq('id', item.id)
        )

        await Promise.all(updates)
        return successResponse({ message: '순서가 변경되었습니다' })
      }

      // /:id - 개별 카테고리 수정
      const idMatch = pathname.match(/^\/([a-f0-9-]+)$/i)
      if (!idMatch) {
        return errorResponse('INVALID_PATH', '유효하지 않은 경로입니다')
      }

      const categoryId = idMatch[1]
      const updateData: Record<string, any> = { updated_at: new Date().toISOString() }

      if (body.name !== undefined) updateData.name = body.name
      if (body.hashtag !== undefined) updateData.hashtag = body.hashtag
      if (body.is_pinned !== undefined) updateData.is_pinned = body.is_pinned
      if (body.sort_order !== undefined) updateData.sort_order = body.sort_order
      if (body.partner_category_id !== undefined) updateData.partner_category_id = body.partner_category_id

      const { data, error } = await supabase
        .from('explore_category')
        .update(updateData)
        .eq('id', categoryId)
        .select()
        .single()

      if (error) {
        return errorResponse('UPDATE_ERROR', '카테고리 수정 실패', error.message)
      }

      return successResponse(data)
    }

    // DELETE - 카테고리 삭제
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

      const categoryId = idMatch[1]

      const { error: partnersError } = await supabase
        .from('explore_category_partners')
        .delete()
        .eq('explore_category_id', categoryId)

      if (partnersError) {
        return errorResponse('DELETE_ERROR', '카테고리 삭제 실패', partnersError.message)
      }

      const { error } = await supabase
        .from('explore_category')
        .delete()
        .eq('id', categoryId)

      if (error) {
        return errorResponse('DELETE_ERROR', '카테고리 삭제 실패', error.message)
      }

      return successResponse({ message: '카테고리가 삭제되었습니다' })
    }

    return errorResponse('METHOD_NOT_ALLOWED', '지원되지 않는 HTTP 메서드입니다', null, 405)
  } catch (error) {
    console.error('api-explore-categories error:', error)
    if (error.message?.includes('authorization') || error.message?.includes('token')) {
      return errorResponse('UNAUTHORIZED', '인증이 필요합니다', null, 401)
    }
    return errorResponse('INTERNAL_ERROR', '서버 내부 오류가 발생했습니다', error.message, 500)
  }
})
