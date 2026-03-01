import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  corsHeaders,
  createSupabaseClient,
  errorResponse,
  successResponse,
  getAuthUser,
  getQueryParams,
  parseMultipartFormData,
} from '../_shared/utils.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient();
    const url = new URL(req.url);
    const pathname = url.pathname;
    const params = getQueryParams(req.url);

    // GET - 배너 목록 조회 (public)
    if (req.method === 'GET' && (pathname.endsWith('/api-store-banners') || pathname === '/')) {
      const { data, error } = await supabase
        .from('store_banners')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) {
        return errorResponse('DB_ERROR', error.message, null, 500);
      }

      return successResponse(data || []);
    }

    // Admin 권한 필요한 엔드포인트
    const user = await getAuthUser(req);
    const { data: member } = await supabase
      .from('members')
      .select('role')
      .eq('id', user.id)
      .single();

    if (member?.role !== 'admin') {
      return errorResponse('FORBIDDEN', '관리자만 접근할 수 있습니다.', null, 403);
    }

    // PUT - 순서 일괄 변경
    if (req.method === 'PUT' && pathname.includes('/reorder')) {
      const body = await req.json();
      const { items } = body;

      if (!Array.isArray(items)) {
        return errorResponse('INVALID_REQUEST', 'items 배열이 필요합니다.', null, 400);
      }

      for (const item of items) {
        const { error } = await supabase
          .from('store_banners')
          .update({ sort_order: item.sort_order })
          .eq('id', item.id);

        if (error) {
          return errorResponse('DB_ERROR', error.message, null, 500);
        }
      }

      return successResponse({ message: '순서가 변경되었습니다.' });
    }

    // POST - 배너 추가
    if (req.method === 'POST') {
      let bannerUrl: string;
      let sortOrder = 0;

      const contentType = req.headers.get('content-type') || '';
      if (contentType.includes('multipart/form-data')) {
        const { fields, files } = await parseMultipartFormData(req);
        sortOrder = parseInt(fields.sort_order || '0');

        if (files.length > 0) {
          const file = files[0];
          const ext = file.filename.split('.').pop() || 'jpg';
          const filePath = `banners/${Date.now()}_${crypto.randomUUID()}.${ext}`;

          const { error: uploadError } = await supabase.storage
            .from('store_banners')
            .upload(filePath, file.content, {
              contentType: file.mimetype,
              upsert: false,
            });

          if (uploadError) {
            return errorResponse('UPLOAD_ERROR', uploadError.message, null, 500);
          }

          const { data: urlData } = supabase.storage
            .from('store_banners')
            .getPublicUrl(filePath);
          bannerUrl = urlData.publicUrl;
        } else if (fields.banner) {
          bannerUrl = fields.banner;
        } else {
          return errorResponse('INVALID_REQUEST', '배너 이미지가 필요합니다.', null, 400);
        }
      } else {
        const body = await req.json();
        if (!body.banner) {
          return errorResponse('INVALID_REQUEST', '배너 이미지 URL이 필요합니다.', null, 400);
        }
        bannerUrl = body.banner;
        sortOrder = body.sort_order || 0;
      }

      const { data, error } = await supabase
        .from('store_banners')
        .insert({ banner: bannerUrl, sort_order: sortOrder })
        .select()
        .single();

      if (error) {
        return errorResponse('DB_ERROR', error.message, null, 500);
      }

      return successResponse(data);
    }

    // PUT - 배너 수정
    if (req.method === 'PUT') {
      const idMatch = pathname.match(/\/([a-f0-9-]+)$/);
      if (!idMatch) {
        return errorResponse('INVALID_REQUEST', '배너 ID가 필요합니다.', null, 400);
      }
      const bannerId = idMatch[1];

      let updateData: { banner?: string; sort_order?: number } = {};

      const contentType = req.headers.get('content-type') || '';
      if (contentType.includes('multipart/form-data')) {
        const { fields, files } = await parseMultipartFormData(req);

        if (fields.sort_order) {
          updateData.sort_order = parseInt(fields.sort_order);
        }

        if (files.length > 0) {
          const file = files[0];
          const ext = file.filename.split('.').pop() || 'jpg';
          const filePath = `banners/${Date.now()}_${crypto.randomUUID()}.${ext}`;

          const { error: uploadError } = await supabase.storage
            .from('store_banners')
            .upload(filePath, file.content, {
              contentType: file.mimetype,
              upsert: false,
            });

          if (uploadError) {
            return errorResponse('UPLOAD_ERROR', uploadError.message, null, 500);
          }

          const { data: urlData } = supabase.storage
            .from('store_banners')
            .getPublicUrl(filePath);
          updateData.banner = urlData.publicUrl;
        } else if (fields.banner) {
          updateData.banner = fields.banner;
        }
      } else {
        const body = await req.json();
        if (body.banner) updateData.banner = body.banner;
        if (body.sort_order !== undefined) updateData.sort_order = body.sort_order;
      }

      if (Object.keys(updateData).length === 0) {
        return errorResponse('INVALID_REQUEST', '수정할 데이터가 필요합니다.', null, 400);
      }

      const { data, error } = await supabase
        .from('store_banners')
        .update(updateData)
        .eq('id', bannerId)
        .select()
        .single();

      if (error) {
        return errorResponse('DB_ERROR', error.message, null, 500);
      }

      return successResponse(data);
    }

    // DELETE - 배너 삭제
    if (req.method === 'DELETE') {
      const idMatch = pathname.match(/\/([a-f0-9-]+)$/);
      if (!idMatch) {
        return errorResponse('INVALID_REQUEST', '배너 ID가 필요합니다.', null, 400);
      }
      const bannerId = idMatch[1];

      const { error } = await supabase
        .from('store_banners')
        .delete()
        .eq('id', bannerId);

      if (error) {
        return errorResponse('DB_ERROR', error.message, null, 500);
      }

      return successResponse({ message: '배너가 삭제되었습니다.' });
    }

    return errorResponse('NOT_FOUND', '요청한 엔드포인트를 찾을 수 없습니다.', null, 404);
  } catch (error: any) {
    console.error('Error:', error);
    return errorResponse('INTERNAL_ERROR', error.message || '서버 오류가 발생했습니다.', null, 500);
  }
});
