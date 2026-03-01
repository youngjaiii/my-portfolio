import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  createSupabaseClient,
  getAuthUser,
  parseRequestBody,
  parseMultipartFormData,
} from '../_shared/utils.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createSupabaseClient();
    const user = await getAuthUser(req);

    const urlObj = new URL(req.url);
    const pathname = urlObj.pathname;
    const partnerIdParam =
      urlObj.searchParams.get('partner_id') || urlObj.searchParams.get('partnerId');

    // 1) 파트너 조회
    const { data: partnerData, error: partnerError } = await supabase
      .from('partners')
      .select('id, partner_status')
      .eq('member_id', user.id)
      .maybeSingle();

    if (partnerError) throw partnerError;

    // 멤버십 관리(POST/PUT/DELETE) 에서는 자신의 파트너 계정이 반드시 있어야 함
    // GET 의 경우에는 partner_id 파라미터가 있으면 다른 파트너의 멤버십을 조회할 수 있게 허용
    const isMembershipRoute = pathname.endsWith('/api-membership');
    if (!partnerData && isMembershipRoute && req.method !== 'GET') {
      return new Response(JSON.stringify({ success: false, error: 'Partner profile not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      });
    }

    // ------------------------
    // POST /api-membership → 멤버십 생성
    // ------------------------
    if (pathname.endsWith('/api-membership') && req.method === 'POST') {
      // partner_status가 approved가 아니면 멤버십 생성 불가
      if (partnerData && partnerData.partner_status !== 'approved') {
        return new Response(JSON.stringify({ success: false, error: 'Only approved partners can create memberships' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 403,
        });
      }

      // FormData 또는 JSON 처리
      let body: any = {};
      let mediaFile: { data: Uint8Array; filename: string; mimetype: string } | null = null;
      let renewalMediaFile: { data: Uint8Array; filename: string; mimetype: string } | null = null;
      
      const contentType = req.headers.get('content-type') || '';
      if (contentType.includes('multipart/form-data')) {
        const formData = await parseMultipartFormData(req);
        body = formData.fields;
        // info_media_paths 파일 찾기
        const foundMediaFile = formData.files.find((f: any) => f.fieldName === 'info_media_paths');
        if (foundMediaFile) {
          mediaFile = {
            data: foundMediaFile.content,
            filename: foundMediaFile.filename,
            mimetype: foundMediaFile.mimetype,
          };
        }
        // renewal_media_info 파일 찾기
        const foundRenewalMediaFile = formData.files.find((f: any) => f.fieldName === 'renewal_media_info');
        if (foundRenewalMediaFile) {
          renewalMediaFile = {
            data: foundRenewalMediaFile.content,
            filename: foundRenewalMediaFile.filename,
            mimetype: foundRenewalMediaFile.mimetype,
          };
        }
      } else {
        const jsonBody = await parseRequestBody(req);
        if (jsonBody) body = jsonBody;
      }

      if (!body || Object.keys(body).length === 0) {
        return new Response(JSON.stringify({ success: false, error: 'Request body is required' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      const { 
        name, 
        description = '', 
        monthly_price, 
        is_active = true,
        paid_message_quota,
        paid_call_quota,
        paid_video_quota,
        post_access_mode,
        membership_message,
        discount_rate,
        info_media_paths,
        tier_rank,
        renewal_message,
        renewal_media_info,
      } = body;

      // monthly_price를 숫자로 변환
      const parsedMonthlyPrice = typeof monthly_price === 'string' ? parseInt(monthly_price) : monthly_price;

      if (!name || isNaN(parsedMonthlyPrice)) {
        return new Response(JSON.stringify({ success: false, error: 'name and monthly_price are required' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      // 멤버십 생성
      const insertData: any = {
        partner_id: partnerData.id,
        name,
        description,
        monthly_price: parsedMonthlyPrice,
        is_active: is_active === 'true' || is_active === true,
      };

      // 추가 필드들 처리
      if (paid_message_quota !== undefined) {
        insertData.paid_message_quota = parseInt(paid_message_quota) || 0;
      }
      if (paid_call_quota !== undefined) {
        insertData.paid_call_quota = parseInt(paid_call_quota) || 0;
      }
      if (paid_video_quota !== undefined) {
        insertData.paid_video_quota = parseInt(paid_video_quota) || 0;
      }
      if (post_access_mode !== undefined) {
        insertData.post_access_mode = post_access_mode;
      }
      if (membership_message !== undefined) {
        insertData.membership_message = membership_message;
      }
      if (discount_rate !== undefined) {
        insertData.discount_rate = Math.min(100, Math.max(0, parseInt(discount_rate) || 0));
      }
      if (tier_rank !== undefined) {
        insertData.tier_rank = Math.min(10, Math.max(1, parseInt(tier_rank) || 1));
      }

      // info_media_paths 처리 (파일 업로드 또는 문자열)
      if (mediaFile) {
        const ext = mediaFile.filename.split('.').pop() || 'jpg';
        const filePath = `${partnerData.id}/${Date.now()}.${ext}`;
        const storage = supabase.storage.from('membership_info_media');
        
        const { error: uploadError } = await storage.upload(filePath, mediaFile.data, {
          contentType: mediaFile.mimetype,
          upsert: true,
        });

        if (!uploadError) {
          insertData.info_media_paths = filePath;
        }
      } else if (info_media_paths !== undefined && info_media_paths !== null && info_media_paths !== '') {
        // 문자열로 전달된 경우
        insertData.info_media_paths = info_media_paths;
      }
      
      // renewal_message 처리
      if (renewal_message !== undefined) {
        insertData.renewal_message = renewal_message;
      }
      
      // renewal_media_info 처리 (파일 업로드 또는 문자열)
      if (renewalMediaFile) {
        const ext = renewalMediaFile.filename.split('.').pop() || 'jpg';
        const filePath = `${partnerData.id}/renewal_${Date.now()}.${ext}`;
        const storage = supabase.storage.from('membership_info_media');
        
        const { error: uploadError } = await storage.upload(filePath, renewalMediaFile.data, {
          contentType: renewalMediaFile.mimetype,
          upsert: true,
        });

        if (!uploadError) {
          insertData.renewal_media_info = filePath;
        }
      } else if (renewal_media_info !== undefined && renewal_media_info !== null && renewal_media_info !== '') {
        insertData.renewal_media_info = renewal_media_info;
      }

      const { data: newMembership, error: membershipError } = await supabase
        .from('membership')
        .insert([insertData])
        .select()
        .single();

      if (membershipError) throw membershipError;

      return new Response(JSON.stringify({ success: true, data: newMembership }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // ------------------------
    // GET /api-membership → 파트너의 멤버십 조회
    // ------------------------
    if (pathname.endsWith('/api-membership') && req.method === 'GET') {
      /**
       * 1) partner_id 파라미터가 있는 경우
       *    - 해당 파트너의 멤버십을 조회
       *    - is_active = true 인 것만 반환 (유저가 다른 파트너의 멤버십을 보는 용도)
       *
       * 2) partner_id 파라미터가 없는 경우
       *    - 토큰 기준 자신의 파트너 멤버십 목록 조회 (기존 동작 유지)
       *    - is_active 필터 없이 전체 조회 (대시보드 관리용)
       */
      let query = supabase.from('membership').select('*').order('created_at', {
        ascending: false,
      });

      if (partnerIdParam) {
        // 다른 파트너의 멤버십 조회: 활성 멤버십만
        query = query.eq('partner_id', partnerIdParam).eq('is_active', true);
      } else {
        if (!partnerData) {
          return new Response(
            JSON.stringify({ success: false, error: 'Partner profile not found' }),
            {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 404,
            },
          );
        }
        query = query.eq('partner_id', partnerData.id);
      }

      const { data: memberships, error: membershipError } = await query;

      if (membershipError) throw membershipError;

      // info_media_paths 및 renewal_media_info에 대한 signed_url 생성
      const storage = supabase.storage.from('membership_info_media');
      const membershipsWithSignedUrls = await Promise.all(
        (memberships || []).map(async (membership: any) => {
          let result = { ...membership };
          
          // info_media_paths 처리
          if (membership.info_media_paths) {
            if (typeof membership.info_media_paths === 'string') {
              const path = membership.info_media_paths;
              const { data: signedData } = await storage.createSignedUrl(path, 3600);
              result.info_media_paths = [{
                path,
                signed_url: signedData?.signedUrl || null,
              }];
            } else if (Array.isArray(membership.info_media_paths) && membership.info_media_paths.length > 0) {
              const infoMediaWithUrls = await Promise.all(
                membership.info_media_paths.map(async (item: any) => {
                  const path = typeof item === 'string' ? item : item.path;
                  if (!path) return item;
                  const { data: signedData } = await storage.createSignedUrl(path, 3600);
                  return { path, signed_url: signedData?.signedUrl || null };
                })
              );
              result.info_media_paths = infoMediaWithUrls;
            }
          }
          
          // renewal_media_info 처리
          if (membership.renewal_media_info) {
            if (typeof membership.renewal_media_info === 'string') {
              const path = membership.renewal_media_info;
              const { data: signedData } = await storage.createSignedUrl(path, 3600);
              result.renewal_media_info = [{
                path,
                signed_url: signedData?.signedUrl || null,
              }];
            } else if (Array.isArray(membership.renewal_media_info) && membership.renewal_media_info.length > 0) {
              const renewalMediaWithUrls = await Promise.all(
                membership.renewal_media_info.map(async (item: any) => {
                  const path = typeof item === 'string' ? item : item.path;
                  if (!path) return item;
                  const { data: signedData } = await storage.createSignedUrl(path, 3600);
                  return { path, signed_url: signedData?.signedUrl || null };
                })
              );
              result.renewal_media_info = renewalMediaWithUrls;
            }
          }
          
          return result;
        })
      );

      return new Response(JSON.stringify({ success: true, data: membershipsWithSignedUrls }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // ------------------------
    // PUT /api-membership → 멤버십 수정
    // ------------------------
    if (pathname.endsWith('/api-membership') && req.method === 'PUT') {
      const contentType = req.headers.get('content-type') || '';
      
      let body: Record<string, any> = {};
      let infoMediaFile: { content: Uint8Array; filename: string; mimetype: string } | null = null;
      let renewalMediaFile: { content: Uint8Array; filename: string; mimetype: string } | null = null;
      
      // FormData 또는 JSON 파싱
      if (contentType.startsWith('multipart/form-data')) {
        const { fields, files } = await parseMultipartFormData(req);
        body = fields;
        
        // info_media_paths 파일 찾기
        const mediaFile = files.find(f => f.fieldName === 'info_media_paths');
        if (mediaFile) {
          infoMediaFile = {
            content: mediaFile.content,
            filename: mediaFile.filename,
            mimetype: mediaFile.mimetype,
          };
        }
        
        // renewal_media_info 파일 찾기
        const renewalFile = files.find(f => f.fieldName === 'renewal_media_info');
        if (renewalFile) {
          renewalMediaFile = {
            content: renewalFile.content,
            filename: renewalFile.filename,
            mimetype: renewalFile.mimetype,
          };
        }
      } else {
        const jsonBody = await parseRequestBody(req);
        if (jsonBody) body = jsonBody;
      }
      
      if (!body || !body.id) {
        return new Response(JSON.stringify({ success: false, error: 'Membership id is required' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      const { id } = body;

      const { data: existing, error: existError } = await supabase
        .from('membership')
        .select('id, info_media_paths')
        .eq('id', id)
        .eq('partner_id', partnerData.id)
        .maybeSingle();

      if (existError) throw existError;
      if (!existing) {
        return new Response(JSON.stringify({ success: false, error: 'Membership not found or unauthorized' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        });
      }

      const updateData: Record<string, any> = {};
      if (body.name !== undefined) updateData.name = body.name;
      if (body.description !== undefined) updateData.description = body.description;
      if (body.monthly_price !== undefined) updateData.monthly_price = Number(body.monthly_price);
      if (body.is_active !== undefined) updateData.is_active = body.is_active === 'true' || body.is_active === true;
      if (body.active_months !== undefined) {
        updateData.active_months = Math.min(12, Math.max(1, parseInt(body.active_months) || 1));
      }
      if (body.discount_rate !== undefined) {
        updateData.discount_rate = Math.min(100, Math.max(0, parseInt(body.discount_rate) || 0));
      }
      
      // 추가 필드들 처리
      if (body.paid_message_quota !== undefined) {
        updateData.paid_message_quota = parseInt(body.paid_message_quota) || 0;
      }
      if (body.paid_call_quota !== undefined) {
        updateData.paid_call_quota = parseInt(body.paid_call_quota) || 0;
      }
      if (body.paid_video_quota !== undefined) {
        updateData.paid_video_quota = parseInt(body.paid_video_quota) || 0;
      }
      if (body.post_access_mode !== undefined) {
        updateData.post_access_mode = body.post_access_mode;
      }
      if (body.membership_message !== undefined) {
        updateData.membership_message = body.membership_message;
      }
      if (body.tier_rank !== undefined) {
        updateData.tier_rank = Math.min(10, Math.max(1, parseInt(body.tier_rank) || 1));
      }
      
      // info_media_paths 처리
      const storage = supabase.storage.from('membership_info_media');
      
      if (infoMediaFile) {
        // 새로운 파일 업로드
        const fileExt = infoMediaFile.filename.split('.').pop() || 'png';
        const filePath = `${id}/${crypto.randomUUID()}.${fileExt}`;
        
        const { error: uploadError } = await storage.upload(filePath, infoMediaFile.content, {
          contentType: infoMediaFile.mimetype,
          upsert: true,
        });
        
        if (uploadError) {
          console.error('Upload error:', uploadError);
        } else {
          // 문자열로 저장 (배열 아님)
          updateData.info_media_paths = filePath;
        }
      } else if (body.info_media_paths !== undefined) {
        // info_media_paths가 직접 전달된 경우 (문자열)
        updateData.info_media_paths = body.info_media_paths || null;
      } else if (body.existing_info_media_paths) {
        // 기존 미디어 유지 (문자열로 저장)
        try {
          const existingPaths = JSON.parse(body.existing_info_media_paths);
          if (Array.isArray(existingPaths) && existingPaths.length > 0) {
            // 첫 번째 경로만 문자열로 저장
            const firstPath = existingPaths[0];
            updateData.info_media_paths = typeof firstPath === 'string' ? firstPath : firstPath.path;
          } else if (typeof existingPaths === 'string') {
            updateData.info_media_paths = existingPaths;
          }
        } catch (e) {
          // JSON 파싱 실패 시 원본 문자열 그대로 사용
          updateData.info_media_paths = body.existing_info_media_paths;
        }
      }
      
      // renewal_message 처리
      if (body.renewal_message !== undefined) {
        updateData.renewal_message = body.renewal_message;
      }
      
      // renewal_media_info 처리
      if (renewalMediaFile) {
        const fileExt = renewalMediaFile.filename.split('.').pop() || 'png';
        const filePath = `${id}/renewal_${crypto.randomUUID()}.${fileExt}`;
        
        const { error: uploadError } = await storage.upload(filePath, renewalMediaFile.content, {
          contentType: renewalMediaFile.mimetype,
          upsert: true,
        });
        
        if (uploadError) {
          console.error('Renewal media upload error:', uploadError);
        } else {
          updateData.renewal_media_info = filePath;
        }
      } else if (body.renewal_media_info !== undefined) {
        updateData.renewal_media_info = body.renewal_media_info || null;
      } else if (body.existing_renewal_media_info) {
        try {
          const existingPaths = JSON.parse(body.existing_renewal_media_info);
          if (Array.isArray(existingPaths) && existingPaths.length > 0) {
            const firstPath = existingPaths[0];
            updateData.renewal_media_info = typeof firstPath === 'string' ? firstPath : firstPath.path;
          } else if (typeof existingPaths === 'string') {
            updateData.renewal_media_info = existingPaths;
          }
        } catch (e) {
          updateData.renewal_media_info = body.existing_renewal_media_info;
        }
      }

      const { data: updatedMembership, error: updateError } = await supabase
        .from('membership')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;

      return new Response(JSON.stringify({ success: true, data: updatedMembership }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // ------------------------
    // DELETE /api-membership → 멤버십 삭제
    // ------------------------
    if (pathname.endsWith('/api-membership') && req.method === 'DELETE') {
      const body = await parseRequestBody(req);
      if (!body || !body.id) {
        return new Response(JSON.stringify({ success: false, error: 'Membership id is required' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      const { id } = body;

      const { data: existing, error: existError } = await supabase
        .from('membership')
        .select('id')
        .eq('id', id)
        .eq('partner_id', partnerData.id)
        .maybeSingle();

      if (existError) throw existError;
      if (!existing) {
        return new Response(JSON.stringify({ success: false, error: 'Membership not found or unauthorized' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404,
        });
      }

      const { error: deleteError } = await supabase
        .from('membership')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      return new Response(JSON.stringify({ success: true, data: { id, deleted: true } }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // ------------------------
    // 기타 라우트 → 404
    // ------------------------
    return new Response(JSON.stringify({ success: false, error: 'Endpoint not found' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 404,
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ success: false, error: err.message || 'Unknown server error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
