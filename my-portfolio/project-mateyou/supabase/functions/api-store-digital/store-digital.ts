import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, createSupabaseClient, errorResponse, successResponse, getAuthUser, getQueryParams } from '../_shared/utils.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const supabase = createSupabaseClient();
    const params = getQueryParams(req.url);

    // ===== GET /api-store-digital/downloads - 디지털 다운로드 관련 통합 엔드포인트 =====
    // - download_id 파라미터: 해당 파일 다운로드 URL 생성 + 카운트 증가
    // - order_item_id 파라미터: 해당 주문 아이템의 다운로드 가능 파일 목록
    // - order_id 파라미터: 해당 주문의 다운로드 가능 파일 목록 (하위 호환)
    // - 파라미터 없음: 내 전체 다운로드 목록
    if (pathname === '/api-store-digital/downloads' && req.method === 'GET') {
      const user = await getAuthUser(req);
      const downloadId = params.download_id;
      const orderItemId = params.order_item_id;
      const orderId = params.order_id;

      // ===== download_id가 있으면 파일 다운로드 URL 생성 =====
      if (downloadId) {
        // 다운로드 권한 확인
        const { data: download, error: downloadError } = await supabase
          .from('store_digital_downloads')
          .select(`
            *,
            asset:store_digital_assets(asset_id, file_name, file_url),
            order:store_orders(order_id, status, is_confirmed)
          `)
          .eq('download_id', downloadId)
          .eq('user_id', user.id)
          .single();

        if (downloadError || !download) {
          return errorResponse('NOT_FOUND', '다운로드 권한이 없습니다.', null, 404);
        }

        // 결제 완료 확인 (order 상태 확인)
        // deno-lint-ignore no-explicit-any
        const orderStatus = (download.order as any)?.status;
        if (!['paid', 'confirmed'].includes(orderStatus)) {
          return errorResponse('FORBIDDEN', '결제가 완료된 주문만 다운로드할 수 있습니다.', null, 403);
        }

        // 만료 확인
        if (download.expires_at && new Date(download.expires_at) < new Date()) {
          return errorResponse('FORBIDDEN', '다운로드 기간이 만료되었습니다.', null, 403);
        }

        const fileUrl = download.asset?.file_url;
        if (!fileUrl) {
          return errorResponse('NOT_FOUND', '파일을 찾을 수 없습니다.', null, 404);
        }

        // Supabase Storage signed URL 생성
        let signedUrl = fileUrl;

        if (fileUrl.includes('supabase') && fileUrl.includes('/storage/')) {
          const storagePath = fileUrl.split('/storage/v1/object/public/')[1] || 
                             fileUrl.split('/storage/v1/object/sign/')[1];
          
          if (storagePath) {
            const bucketAndPath = storagePath.split('/');
            const bucket = bucketAndPath[0];
            const path = bucketAndPath.slice(1).join('/');

            const { data: signedData, error: signError } = await supabase
              .storage
              .from(bucket)
              .createSignedUrl(path, 3600);

            if (!signError && signedData?.signedUrl) {
              signedUrl = signedData.signedUrl;
            }
          }
        }

        // 다운로드 횟수 업데이트
        await supabase
          .from('store_digital_downloads')
          .update({
            download_count: (download.download_count || 0) + 1,
            last_downloaded_at: new Date().toISOString()
          })
          .eq('download_id', downloadId);

        return successResponse({
          download_id: downloadId,
          download_url: signedUrl,
          file_name: download.asset?.file_name,
          download_count: (download.download_count || 0) + 1,
          expires_in: 3600
        });
      }

      // ===== order_item_id가 있으면 해당 주문 아이템의 다운로드 가능 파일 목록 =====
      if (orderItemId) {
        // 주문 아이템 소유권 확인
        const { data: orderItem, error: orderItemError } = await supabase
          .from('store_order_items')
          .select(`
            order_item_id, product_id, product_name, product_type, status, is_confirmed,
            order:store_orders(order_id, order_number, user_id, status, is_confirmed),
            product:store_products(product_id, name, thumbnail_url, product_type)
          `)
          .eq('order_item_id', orderItemId)
          .single();

        if (orderItemError || !orderItem) {
          return errorResponse('NOT_FOUND', '주문 아이템을 찾을 수 없습니다.', null, 404);
        }

        // deno-lint-ignore no-explicit-any
        const orderData = orderItem.order as any;

        // 소유권 확인
        if (orderData?.user_id !== user.id) {
          return errorResponse('FORBIDDEN', '권한이 없습니다.', null, 403);
        }

        if (orderItem.product_type !== 'digital') {
          return errorResponse('INVALID_REQUEST', '디지털 상품 주문이 아닙니다.');
        }

        // 결제 완료 확인
        if (!['paid', 'confirmed'].includes(orderData?.status)) {
          return errorResponse('FORBIDDEN', '결제가 완료된 주문만 다운로드할 수 있습니다.', null, 403);
        }

        // 다운로드 권한이 없으면 생성
        const { data: existingDownloads } = await supabase
          .from('store_digital_downloads')
          .select('download_id')
          .eq('order_item_id', orderItemId)
          .eq('user_id', user.id);

        if (!existingDownloads || existingDownloads.length === 0) {
          // 상품의 디지털 에셋 조회
          const { data: assets } = await supabase
            .from('store_digital_assets')
            .select('asset_id')
            .eq('product_id', orderItem.product_id);

          if (assets && assets.length > 0) {
            // 다운로드 권한 생성
            const downloadInserts = assets.map(asset => ({
              user_id: user.id,
              order_item_id: orderItemId,
              asset_id: asset.asset_id,
              download_count: 0
            }));

            await supabase
              .from('store_digital_downloads')
              .insert(downloadInserts);
          }
        }

        // 다운로드 가능 파일 목록 조회
        const { data: downloads, error: downloadsError } = await supabase
          .from('store_digital_downloads')
          .select(`
            download_id, download_count, last_downloaded_at, expires_at,
            asset:store_digital_assets(asset_id, file_name, file_url, display_order)
          `)
          .eq('order_item_id', orderItemId)
          .eq('user_id', user.id);

        if (downloadsError) throw downloadsError;

        // display_order로 정렬
        // deno-lint-ignore no-explicit-any
        const sortedDownloads = (downloads || []).sort((a: any, b: any) => 
          (a.asset?.display_order || 0) - (b.asset?.display_order || 0)
        );

        return successResponse({
          order_item: orderItem,
          downloads: sortedDownloads
        });
      }

      // ===== order_id가 있으면 해당 주문의 다운로드 가능 파일 목록 (하위 호환) =====
      if (orderId) {
        // 주문 소유권 확인
        const { data: order, error: orderError } = await supabase
          .from('store_orders')
          .select(`
            order_id, order_number, status, is_confirmed,
            order_items:store_order_items(order_item_id, product_id, product_name, product_type)
          `)
          .eq('order_id', orderId)
          .eq('user_id', user.id)
          .single();

        if (orderError || !order) {
          return errorResponse('NOT_FOUND', '주문을 찾을 수 없습니다.', null, 404);
        }

        // 디지털 상품 확인
        // deno-lint-ignore no-explicit-any
        const digitalItem = (order.order_items as any[])?.find((item: any) => item.product_type === 'digital');
        if (!digitalItem) {
          return errorResponse('INVALID_REQUEST', '디지털 상품 주문이 아닙니다.');
        }

        // 결제 완료 확인
        if (!['paid', 'confirmed'].includes(order.status)) {
          return errorResponse('FORBIDDEN', '결제가 완료된 주문만 다운로드할 수 있습니다.', null, 403);
        }

        // 다운로드 권한이 없으면 생성
        const { data: existingDownloads } = await supabase
          .from('store_digital_downloads')
          .select('download_id')
          .eq('order_id', orderId)
          .eq('user_id', user.id);

        if (!existingDownloads || existingDownloads.length === 0) {
          // 디지털 상품의 에셋 조회
          const { data: assets } = await supabase
            .from('store_digital_assets')
            .select('asset_id')
            .eq('product_id', digitalItem.product_id);

          if (assets && assets.length > 0) {
            // 다운로드 권한 생성
            const downloadInserts = assets.map(asset => ({
              user_id: user.id,
              order_id: orderId,
              order_item_id: digitalItem.order_item_id || null,
              asset_id: asset.asset_id,
              download_count: 0
            }));

            await supabase
              .from('store_digital_downloads')
              .insert(downloadInserts);
          }
        }

        // 다운로드 가능 파일 목록 조회
        const { data: downloads, error: downloadsError } = await supabase
          .from('store_digital_downloads')
          .select(`
            download_id, download_count, last_downloaded_at, expires_at,
            asset:store_digital_assets(asset_id, file_name, file_url, display_order)
          `)
          .eq('order_id', orderId)
          .eq('user_id', user.id);

        if (downloadsError) throw downloadsError;

        // display_order로 정렬
        // deno-lint-ignore no-explicit-any
        const sortedDownloads = (downloads || []).sort((a: any, b: any) => 
          (a.asset?.display_order || 0) - (b.asset?.display_order || 0)
        );

        return successResponse({
          order,
          downloads: sortedDownloads
        });
      }

      // ===== 파라미터 없으면 전체 다운로드 목록 =====
      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '20');
      const offset = (page - 1) * limit;

      const { data, error, count } = await supabase
        .from('store_digital_downloads')
        .select(`
          *,
          asset:store_digital_assets(asset_id, file_name, file_url, display_order),
          order:store_orders(
            order_id, order_number, status, created_at,
            order_items:store_order_items(order_item_id, product_id, product_name, product_type),
            product:store_products(product_id, name, thumbnail_url, partner:partners(id, partner_name))
          )
        `, { count: 'exact' })
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      return successResponse(data, {
        total: count,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      });
    }

    // ===== GET /api-store-digital/assets - 상품의 디지털 파일 목록 (파트너/관리자용, 쿼리 파라미터: product_id) =====
    if (pathname === '/api-store-digital/assets' && req.method === 'GET') {
      const user = await getAuthUser(req);
      const productId = params.product_id;

      if (!productId) {
        return errorResponse('INVALID_REQUEST', 'product_id 파라미터가 필요합니다.');
      }

      // 상품 소유권 확인
      const { data: product, error: productError } = await supabase
        .from('store_products')
        .select('product_id, partner_id')
        .eq('product_id', productId)
        .single();

      if (productError || !product) {
        return errorResponse('NOT_FOUND', '상품을 찾을 수 없습니다.', null, 404);
      }

      // 파트너 확인
      const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', user.id)
        .single();

      // Admin 확인
      const { data: member } = await supabase
        .from('members')
        .select('role')
        .eq('id', user.id)
        .single();

      const isAdmin = member?.role === 'admin';

      if (!isAdmin && (!partner || product.partner_id !== partner.id)) {
        return errorResponse('FORBIDDEN', '권한이 없습니다.', null, 403);
      }

      const { data: assets, error: assetsError } = await supabase
        .from('store_digital_assets')
        .select('*')
        .eq('product_id', productId)
        .order('display_order', { ascending: true });

      if (assetsError) throw assetsError;

      return successResponse(assets);
    }

    // ===== GET /api-store-digital/purchased - 내가 구매한 디지털 상품 목록 (파일 데이터 포함) =====
    if (pathname === '/api-store-digital/purchased' && req.method === 'GET') {
      const user = await getAuthUser(req);
      const page = parseInt(params.page || '1');
      const limit = parseInt(params.limit || '20');
      const offset = (page - 1) * limit;

      // 결제 완료된 디지털 상품 주문 아이템 조회
      const { data, error, count } = await supabase
        .from('store_order_items')
        .select(`
          order_item_id, product_id, product_name, product_type, status, is_confirmed, created_at,
          order:store_orders!inner(order_id, order_number, user_id, status, is_confirmed, created_at),
          product:store_products(
            product_id, name, description, thumbnail_url, product_type,
            partner:partners(id, partner_name, member:members(id, name, profile_image)),
            digital_assets:store_digital_assets(asset_id, file_name, file_url, display_order)
          )
        `, { count: 'exact' })
        .eq('order.user_id', user.id)
        .eq('product_type', 'digital')
        .in('order.status', ['paid', 'confirmed'])
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      // 각 주문 아이템에 대한 다운로드 정보 추가
      // deno-lint-ignore no-explicit-any
      const orderItemsWithDownloadInfo = await Promise.all((data || []).map(async (orderItem: any) => {
        const orderId = orderItem.order?.order_id;
        const userId = orderItem.order?.user_id;
        
        // 다운로드 권한 확인 (order_id 기반으로 조회)
        const { data: downloads } = await supabase
          .from('store_digital_downloads')
          .select(`
            download_id, download_count, last_downloaded_at,
            asset:store_digital_assets(asset_id, file_name, display_order)
          `)
          .eq('order_id', orderId)
          .eq('user_id', userId);

        // 다운로드 권한이 없으면 생성
        if (!downloads || downloads.length === 0) {
          const productAssets = orderItem.product?.digital_assets || [];
          if (productAssets.length > 0) {
            // deno-lint-ignore no-explicit-any
            const downloadInserts = productAssets.map((asset: any) => ({
              user_id: userId,
              order_id: orderId,
              order_item_id: orderItem.order_item_id || null,
              asset_id: asset.asset_id,
              download_count: 0
            }));

            const { data: newDownloads } = await supabase
              .from('store_digital_downloads')
              .insert(downloadInserts)
              .select(`
                download_id, download_count, last_downloaded_at,
                asset:store_digital_assets(asset_id, file_name, display_order)
              `);

            return {
              ...orderItem,
              // deno-lint-ignore no-explicit-any
              downloads: (newDownloads || []).sort((a: any, b: any) => 
                (a.asset?.display_order || 0) - (b.asset?.display_order || 0)
              ),
              total_files: productAssets.length
            };
          }
        }

        // 마지막 다운로드 시간
        // deno-lint-ignore no-explicit-any
        const lastDownloadAt = downloads?.reduce((latest: string | null, d: any) => {
          if (!d.last_downloaded_at) return latest;
          if (!latest) return d.last_downloaded_at;
          return new Date(d.last_downloaded_at) > new Date(latest) ? d.last_downloaded_at : latest;
        }, null);

        return {
          ...orderItem,
          // deno-lint-ignore no-explicit-any
          downloads: (downloads || []).sort((a: any, b: any) => 
            (a.asset?.display_order || 0) - (b.asset?.display_order || 0)
          ),
          total_files: downloads?.length || 0,
          last_downloaded_at: lastDownloadAt
        };
      }));

      return successResponse(orderItemsWithDownloadInfo, {
        total: count,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      });
    }

    // ===== POST /api-store-digital/grant-access - 디지털 다운로드 권한 부여 (결제 완료 시 호출) =====
    if (pathname === '/api-store-digital/grant-access' && req.method === 'POST') {
      await getAuthUser(req); // 인증 확인
      const body = await req.json();
      const { order_id, order_item_id } = body;

      if (!order_id && !order_item_id) {
        return errorResponse('INVALID_REQUEST', 'order_id 또는 order_item_id가 필요합니다.');
      }

      // order_id로 처리
      if (order_id) {
        // 주문 확인
        const { data: order, error: orderError } = await supabase
          .from('store_orders')
          .select(`
            order_id, user_id, status,
            order_items:store_order_items(order_item_id, product_id, product_type)
          `)
          .eq('order_id', order_id)
          .single();

        if (orderError || !order) {
          return errorResponse('NOT_FOUND', '주문을 찾을 수 없습니다.', null, 404);
        }

        // 디지털 상품 찾기
        // deno-lint-ignore no-explicit-any
        const digitalItem = (order.order_items as any[])?.find((item: any) => item.product_type === 'digital');
        if (!digitalItem) {
          return errorResponse('INVALID_REQUEST', '디지털 상품 주문이 아닙니다.');
        }

        // 결제 완료 확인
        if (!['paid', 'confirmed'].includes(order.status)) {
          return errorResponse('INVALID_REQUEST', '결제가 완료되지 않은 주문입니다.');
        }

        // 이미 권한이 있는지 확인
        const { data: existingDownloads } = await supabase
          .from('store_digital_downloads')
          .select('download_id')
          .eq('order_id', order_id);

        if (existingDownloads && existingDownloads.length > 0) {
          return successResponse({
            message: '이미 다운로드 권한이 부여되어 있습니다.',
            download_count: existingDownloads.length
          });
        }

        // 상품의 디지털 에셋 조회
        const { data: assets, error: assetsError } = await supabase
          .from('store_digital_assets')
          .select('asset_id')
          .eq('product_id', digitalItem.product_id);

        if (assetsError) throw assetsError;

        if (!assets || assets.length === 0) {
          return errorResponse('NOT_FOUND', '디지털 파일이 없습니다.', null, 404);
        }

        // 다운로드 권한 생성
        const downloadInserts = assets.map(asset => ({
          user_id: order.user_id,
          order_id: order_id,
          order_item_id: digitalItem.order_item_id || null,
          asset_id: asset.asset_id,
          download_count: 0
        }));

        const { data: downloads, error: insertError } = await supabase
          .from('store_digital_downloads')
          .insert(downloadInserts)
          .select();

        if (insertError) throw insertError;

        return successResponse({
          message: '다운로드 권한이 부여되었습니다.',
          downloads
        });
      }

      // order_item_id로 처리 (기존 로직)
      // 주문 아이템 확인
      const { data: orderItem, error: orderItemError } = await supabase
        .from('store_order_items')
        .select(`
          order_item_id, product_id, product_type, status,
          order:store_orders(order_id, user_id, status)
        `)
        .eq('order_item_id', order_item_id)
        .single();

      if (orderItemError || !orderItem) {
        return errorResponse('NOT_FOUND', '주문 아이템을 찾을 수 없습니다.', null, 404);
      }

      // 디지털 상품인지 확인
      if (orderItem.product_type !== 'digital') {
        return errorResponse('INVALID_REQUEST', '디지털 상품 주문이 아닙니다.');
      }

      // 결제 완료 확인
      // deno-lint-ignore no-explicit-any
      const orderStatus = (orderItem.order as any)?.status;
      // deno-lint-ignore no-explicit-any
      const orderId = (orderItem.order as any)?.order_id;
      if (!['paid', 'confirmed'].includes(orderStatus)) {
        return errorResponse('INVALID_REQUEST', '결제가 완료되지 않은 주문입니다.');
      }

      // 이미 권한이 있는지 확인 (order_id 기반)
      const { data: existingDownloads } = await supabase
        .from('store_digital_downloads')
        .select('download_id')
        .eq('order_id', orderId);

      if (existingDownloads && existingDownloads.length > 0) {
        return successResponse({
          message: '이미 다운로드 권한이 부여되어 있습니다.',
          download_count: existingDownloads.length
        });
      }

      // 상품의 디지털 에셋 조회
      const { data: assets, error: assetsError } = await supabase
        .from('store_digital_assets')
        .select('asset_id')
        .eq('product_id', orderItem.product_id);

      if (assetsError) throw assetsError;

      if (!assets || assets.length === 0) {
        return errorResponse('NOT_FOUND', '디지털 파일이 없습니다.', null, 404);
      }

      // 다운로드 권한 생성
      // deno-lint-ignore no-explicit-any
      const userId = (orderItem.order as any)?.user_id;
      const downloadInserts = assets.map(asset => ({
        user_id: userId,
        order_id: orderId,
        order_item_id: order_item_id,
        asset_id: asset.asset_id,
        download_count: 0
      }));

      const { data: downloads, error: insertError } = await supabase
        .from('store_digital_downloads')
        .insert(downloadInserts)
        .select();

      if (insertError) throw insertError;

      return successResponse({
        message: '다운로드 권한이 부여되었습니다.',
        downloads
      });
    }

    return errorResponse('NOT_FOUND', '요청한 엔드포인트를 찾을 수 없습니다.', null, 404);

  } catch (error) {
    console.error('Store Digital API Error:', error);
    return errorResponse(
      'INTERNAL_ERROR',
      error instanceof Error ? error.message : '서버 오류가 발생했습니다.',
      null,
      500
    );
  }
});
