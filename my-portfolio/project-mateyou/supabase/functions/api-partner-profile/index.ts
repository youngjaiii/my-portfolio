import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, createSupabaseClient, errorResponse, successResponse, getAuthUser, parseMultipartFormData } from '../_shared/utils.ts';

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const supabase = createSupabaseClient();

    // PUT /update - Update partner profile info (excluding Toss payment info)
    if (pathname.includes('/update') && req.method === 'PUT') {
      const user = await getAuthUser(req);
      
      // Parse FormData directly to preserve field names
      const contentType = req.headers.get('content-type') || '';
      let fields: Record<string, string> = {};
      let profileImageFile: File | null = null;
      const backgroundImageFiles: File[] = [];

      if (contentType.includes('multipart/form-data')) {
        const formData = await req.formData();
        for (const [key, value] of formData.entries()) {
          if (value instanceof File && value.size > 0) {
            if (key === 'profileImage') {
              profileImageFile = value;
            } else if (key === 'backgroundImages') {
              backgroundImageFiles.push(value);
            }
          } else {
            fields[key] = value.toString();
          }
        }
        console.log('📋 Received fields:', Object.keys(fields));
        console.log('📋 Profile image file:', profileImageFile ? `${profileImageFile.name} (${profileImageFile.size} bytes)` : 'none');
        console.log('📋 Background image files:', backgroundImageFiles.length);
      } else {
        // JSON fallback
        try {
          const jsonBody = await req.json();
          fields = jsonBody;
        } catch {
          return errorResponse('INVALID_BODY', 'Request body is required');
        }
      }

      try {
        // Get user's partner info
        const { data: partnerData, error: partnerError } = await supabase
          .from('partners')
          .select('id')
          .eq('member_id', user.id)
          .single();

        if (partnerError) {
          if (partnerError.code === 'PGRST116') {
            return errorResponse('NOT_A_PARTNER', 'User is not a partner');
          }
          throw partnerError;
        }

        // Get user's member_code for storage path
        const { data: memberData } = await supabase
          .from('members')
          .select('member_code')
          .eq('id', user.id)
          .single();

        const memberCode = memberData?.member_code || user.id;

        // Handle profile image - 파일만 업로드
        let profileImageUrl: string | null = null;
        if (profileImageFile && profileImageFile.size > 0) {
          console.log('📸 Uploading profile image:', profileImageFile.name, 'size:', profileImageFile.size, 'type:', profileImageFile.type);
          const fileExt = profileImageFile.name.split('.').pop() || 'jpg';
          const profilePath = `${user.id}/profile-${Date.now()}.${fileExt}`;
          const arrayBuffer = await profileImageFile.arrayBuffer();
          
          const { error: uploadError } = await supabase.storage
            .from('profile-images')
            .upload(profilePath, new Uint8Array(arrayBuffer), {
              contentType: profileImageFile.type || 'image/jpeg',
              upsert: true,
            });

          if (uploadError) {
            console.error('❌ Profile image upload error:', uploadError);
          } else {
            const { data: urlData } = supabase.storage
              .from('profile-images')
              .getPublicUrl(profilePath);
            profileImageUrl = urlData?.publicUrl || null;
            console.log('✅ Profile image uploaded:', profileImageUrl);
          }
        }

        // Handle background images - profile-images 버킷 사용
        const backgroundImageUrls: string[] = [];
        
        console.log('🖼️ Background files to upload:', backgroundImageFiles.length);
        for (const bgFile of backgroundImageFiles) {
          if (bgFile.size === 0) {
            console.log('⚠️ Skipping empty file');
            continue;
          }
          
          console.log('🖼️ Uploading:', bgFile.name, 'size:', bgFile.size, 'type:', bgFile.type);
          const fileExt = bgFile.name.split('.').pop() || 'jpg';
          const bgPath = `${user.id}/background-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
          const arrayBuffer = await bgFile.arrayBuffer();
          
          const { error: uploadError } = await supabase.storage
            .from('profile-images')
            .upload(bgPath, new Uint8Array(arrayBuffer), {
              contentType: bgFile.type || 'image/jpeg',
              upsert: true,
            });

          if (uploadError) {
            console.error('❌ Background upload error:', uploadError);
          } else {
            const { data: urlData } = supabase.storage
              .from('profile-images')
              .getPublicUrl(bgPath);
            if (urlData?.publicUrl) {
              backgroundImageUrls.push(urlData.publicUrl);
              console.log('✅ Background uploaded:', urlData.publicUrl);
            }
          }
        }

        // Update only profile related fields (excluding Toss payment info)
        const updateData: any = {};

        // 카테고리 업데이트 여부 및 값 저장 (partner_categories 테이블에서도 사용)
        let shouldUpdateCategories = false;
        // 여러 개의 (category_id, detail_category_id) 쌍을 저장하기 위한 배열
        let categoryPairs: Array<{ category_id: number | null; detail_category_id: number | null }> = [];

        // Profile fields
        if (fields.partnerName !== undefined) updateData.partner_name = String(fields.partnerName).trim();
        if (fields.partnerMessage !== undefined) updateData.partner_message = String(fields.partnerMessage).trim();

        // ----- 카테고리 정보 저장 (N:N 구조: partner_categories 전용) -----
        // 1) 새 방식: categories 배열이 넘어온 경우
        if (Object.prototype.hasOwnProperty.call(fields, 'categories')) {
          shouldUpdateCategories = true;

          try {
            const raw = typeof fields.categories === 'string'
              ? JSON.parse(fields.categories)
              : fields.categories;

            if (Array.isArray(raw)) {
              categoryPairs = raw
                .map((item: any) => {
                  const cId = item?.categoryId ?? item?.category_id ?? null;
                  const dId = item?.detailCategoryId ?? item?.detail_category_id ?? null;

                  const parsedC = cId !== null && cId !== undefined
                    ? parseInt(String(cId), 10)
                    : null;
                  const parsedD = dId !== null && dId !== undefined
                    ? parseInt(String(dId), 10)
                    : null;

                  return {
                    category_id: Number.isNaN(parsedC as any) ? null : parsedC,
                    detail_category_id: Number.isNaN(parsedD as any) ? null : parsedD,
                  };
                })
                // category_id 와 detail_category_id 둘 다 null 인 항목은 제거
                .filter((p) => p.category_id !== null || p.detail_category_id !== null);
            }
          } catch (_e) {
            // 파싱 실패 시 categories 는 무시 (카테고리만 실패해도 나머지 프로필 업데이트는 진행)
            categoryPairs = [];
          }

          // partners 테이블에는 더 이상 category 컬럼이 없으므로
          // 카테고리 정보는 partner_categories 테이블에만 저장한다.
        } else {
          // 2) 구 방식: 단일 categoryId / categoryDetailId 가 넘어온 경우 (하위 호환)
          if (fields.categoryId !== undefined || fields.categoryDetailId !== undefined) {
            shouldUpdateCategories = true;
            const cRaw = fields.categoryId;
            const dRaw = fields.categoryDetailId;

            const parsedC = cRaw !== undefined ? parseInt(String(cRaw), 10) : null;
            const parsedD = dRaw !== undefined ? parseInt(String(dRaw), 10) : null;

            const pair = {
              category_id: parsedC !== null && !Number.isNaN(parsedC as any) ? parsedC : null,
              detail_category_id: parsedD !== null && !Number.isNaN(parsedD as any) ? parsedD : null,
            };

            categoryPairs = (pair.category_id !== null || pair.detail_category_id !== null)
              ? [pair]
              : [];
          }
        }

        // 같은 (category_id, detail_category_id) 쌍이 여러 번 넘어온 경우
        // unique 제약 조건 위반을 막기 위해 중복을 제거한다.
        if (categoryPairs.length > 0) {
          const uniqueMap = new Map<string, { category_id: number | null; detail_category_id: number | null }>();
          for (const pair of categoryPairs) {
            const key = `${pair.category_id ?? 'null'}-${pair.detail_category_id ?? 'null'}`;
            if (!uniqueMap.has(key)) {
              uniqueMap.set(key, pair);
            }
          }
          categoryPairs = Array.from(uniqueMap.values());
        }
        
        if (fields.gameInfos !== undefined) {
          try {
            updateData.game_info = typeof fields.gameInfos === 'string' ? JSON.parse(fields.gameInfos) : fields.gameInfos;
          } catch {
            updateData.game_info = fields.gameInfos;
          }
        }
        // 배경 이미지가 있으면 업데이트
        if (backgroundImageUrls.length > 0) {
          updateData.background_images = backgroundImageUrls;
        }
        if (fields.legalName !== undefined) updateData.legal_name = String(fields.legalName).trim();
        if (fields.legalEmail !== undefined) updateData.legal_email = String(fields.legalEmail).trim();
        if (fields.legalPhone !== undefined) updateData.legal_phone = String(fields.legalPhone).trim();

        // Update partners table
        const { data: updatedPartner, error: partnerUpdateError } = await supabase
          .from('partners')
          .update(updateData)
          .eq('id', partnerData.id)
          .select()
          .single();

        if (partnerUpdateError) throw partnerUpdateError;

        // partner_categories 테이블 업데이트 (N:N 카테고리 매핑)
        // user_id 는 auth의 user_id 를 그대로 사용 (partners.member_id / partners.user_id 와 동일한 값)
        if (shouldUpdateCategories) {
          // 기존 카테고리 매핑 삭제 (해당 유저 기준: user_id = auth.user_id)
          const { error: deleteError } = await supabase
            .from('partner_categories')
            .delete()
            .eq('user_id', user.id);

          if (deleteError) throw deleteError;

          // categories 배열 기반으로 여러 개의 매핑을 삽입
          if (categoryPairs.length > 0) {
            const rowsToInsert = categoryPairs.map((pair) => ({
              user_id: user.id, // auth.user_id 기준으로 매핑
              category_id: pair.category_id,
              detail_category_id: pair.detail_category_id,
            }));

            const { error: insertError } = await supabase
              .from('partner_categories')
              .insert(rowsToInsert);

            if (insertError) throw insertError;
          }
        }

        // Update member profile if provided
        const memberUpdateData: any = {};
        if (profileImageUrl) memberUpdateData.profile_image = profileImageUrl;
        // partnerName이 있으면 members 테이블의 name도 함께 업데이트
        if (fields.partnerName !== undefined) {
          memberUpdateData.name = String(fields.partnerName).trim();
        }

        if (Object.keys(memberUpdateData).length > 0) {
          const { error: memberUpdateError } = await supabase
            .from('members')
            .update(memberUpdateData)
            .eq('id', user.id);

          if (memberUpdateError) throw memberUpdateError;
        }

        console.log('📋 Final update data:', JSON.stringify(updateData, null, 2));
        console.log('📋 Profile image URL:', profileImageUrl);
        console.log('📋 Background image URLs:', backgroundImageUrls);

        return successResponse({
          partner: updatedPartner,
          profileImageUrl,
          backgroundImageUrls,
          message: 'Partner profile updated successfully',
        });

      } catch (error) {
        return errorResponse('PROFILE_UPDATE_ERROR', 'Failed to update partner profile', error.message);
      }
    }

    // GET /info - Get partner profile info
    if (pathname.includes('/info') && req.method === 'GET') {
      const user = await getAuthUser(req);

      try {
        // Get complete partner profile info
        const { data: partnerData, error: partnerError } = await supabase
          .from('partners')
          .select(`
            *,
            members!member_id (
              id, name, profile_image, favorite_game
            )
          `)
          .eq('member_id', user.id)
          .single();

        if (partnerError) {
          if (partnerError.code === 'PGRST116') {
            return errorResponse('NOT_A_PARTNER', 'User is not a partner');
          }
          throw partnerError;
        }

        // partner_categories 에 저장된 카테고리 목록 조회 (N:N 구조, user_id = auth.user_id)
        const { data: categoryRows, error: categoryError } = await supabase
          .from('partner_categories')
          .select('category_id, detail_category_id, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true });

        if (categoryError) {
          console.error('Partner categories fetch error:', categoryError);
        }

        return successResponse({
          partner: partnerData,
          categories: categoryRows || [],
          message: 'Partner profile retrieved successfully',
        });

      } catch (error) {
        return errorResponse('PROFILE_FETCH_ERROR', 'Failed to fetch partner profile', error.message);
      }
    }

    return errorResponse('ROUTE_NOT_FOUND', 'API route not found', null, 404);

  } catch (error) {
    console.error('Partner Profile API error:', error);

    // Handle authentication errors
    if (error.message.includes('authorization') || error.message.includes('token')) {
      return errorResponse('UNAUTHORIZED', 'Authentication required', null, 401);
    }

    return errorResponse(
      'INTERNAL_ERROR',
      'Internal server error',
      error.message,
      500
    );
  }
});