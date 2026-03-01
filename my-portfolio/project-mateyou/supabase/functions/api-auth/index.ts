import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, createSupabaseClient, errorResponse, successResponse, validateMethod, getAuthUser, parseRequestBody } from '../_shared/utils.ts';
import type { Member } from '../_shared/types.ts';

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const supabase = createSupabaseClient();

    // GET /api-auth/me - Get current user info
    if (pathname === '/api-auth/me' && req.method === 'GET') {
      const user = await getAuthUser(req);

      // Get member data
      const { data: memberData, error: memberError } = await supabase
        .from('members')
        .select('*')
        .eq('id', user.id)
        .single();

      if (memberError && memberError.code !== 'PGRST116') {
        throw memberError;
      }

      // If member doesn't exist, create one
      if (!memberData) {
        const newMember = {
          id: user.id,
          social_id: user.id, // Set social_id to match auth.uid()
          name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
          member_code: `USER_${Date.now()}`, // Generate unique code
          profile_image: user.user_metadata?.avatar_url,
          current_status: 'online',
          favorite_game: [],
        };

        const { data: createdMember, error: createError } = await supabase
          .from('members')
          .insert([newMember])
          .select()
          .single();

        if (createError) throw createError;

        return successResponse({ ...createdMember, partner_status: null });
      }

      // 파트너 상태 조회
      let partnerStatus = null;
      const { data: partnerData } = await supabase
        .from('partners')
        .select('status')
        .eq('member_id', user.id)
        .maybeSingle();
      
      if (partnerData) {
        partnerStatus = partnerData.status;
      }

      return successResponse({ ...memberData, partner_status: partnerStatus });
    }

    // PUT /api-auth/profile - Update user profile
    if (pathname === '/api-auth/profile' && req.method === 'PUT') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body) {
        return errorResponse('INVALID_BODY', 'Request body is required');
      }

      const { name, favorite_game, current_status, profile_image } = body;

      const updateData: Partial<Member> = {};
      if (name !== undefined) updateData.name = name;
      if (favorite_game !== undefined) updateData.favorite_game = favorite_game;
      if (current_status !== undefined) updateData.current_status = current_status;
      if (profile_image !== undefined) updateData.profile_image = profile_image;

      const { data: updatedMember, error: updateError } = await supabase
        .from('members')
        .update(updateData)
        .eq('id', user.id)
        .select()
        .single();

      if (updateError) throw updateError;

      return successResponse(updatedMember);
    }

    // GET /api-auth/partner-status - Get user's partner status
    if (pathname === '/api-auth/partner-status' && req.method === 'GET') {
      const user = await getAuthUser(req);

      const { data: partnerData, error: partnerError } = await supabase
        .from('partners')
        .select('id, partner_status, partner_name, total_points')
        .eq('member_id', user.id)
        .maybeSingle();

      if (partnerError && partnerError.code !== 'PGRST116') {
        throw partnerError;
      }

      return successResponse({
        isPartner: !!partnerData,
        partnerStatus: partnerData?.partner_status || 'none',
        partnerId: partnerData?.id,
        partnerName: partnerData?.partner_name,
        totalPoints: partnerData?.total_points || 0,
      });
    }

    // DELETE /api-auth/account - Delete user account (회원탈퇴)
    if (pathname === '/api-auth/account' && req.method === 'DELETE') {
      const user = await getAuthUser(req);
      console.log('🗑️ Account deletion started for user:', user.id);

      try {
        // 1. 파트너 데이터 삭제 (존재하는 경우)
        const { data: partnerData } = await supabase
          .from('partners')
          .select('id')
          .eq('member_id', user.id)
          .maybeSingle();

        if (partnerData) {
          console.log('🗑️ Deleting partner data:', partnerData.id);
          // partner_requests 삭제 (client_id, partner_id 둘 다)
          await supabase.from('partner_requests').delete().eq('client_id', user.id);
          await supabase.from('partner_requests').delete().eq('partner_id', partnerData.id);
          // partner_categories 삭제
          await supabase.from('partner_categories').delete().eq('user_id', user.id);
          // partner_jobs 삭제
          await supabase.from('partner_jobs').delete().eq('partner_id', partnerData.id);
          // partner_points_logs 삭제
          await supabase.from('partner_points_logs').delete().eq('partner_id', partnerData.id);
          // partner_withdrawals 삭제
          await supabase.from('partner_withdrawals').delete().eq('partner_id', partnerData.id);
          // partners 삭제
          const { error: partnerDeleteError } = await supabase.from('partners').delete().eq('id', partnerData.id);
          if (partnerDeleteError) {
            console.error('Partner delete error:', partnerDeleteError);
          }
        }

        // 2. 회원 관련 데이터 삭제 (에러 무시하고 계속 진행)
        console.log('🗑️ Deleting member related data');
        try { await supabase.from('call_participants').delete().eq('member_id', user.id); } catch {}
        try { await supabase.from('member_points_logs').delete().eq('member_id', user.id); } catch {}
        try { await supabase.from('member_chats').delete().or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`); } catch {}
        try { await supabase.from('member_blocks').delete().eq('blocker_member', user.id); } catch {}
        try { await supabase.from('follows').delete().or(`follower_id.eq.${user.id},following_id.eq.${user.id}`); } catch {}
        try { await supabase.from('post_likes').delete().eq('member_id', user.id); } catch {}
        try { await supabase.from('post_comments').delete().eq('member_id', user.id); } catch {}
        try { await supabase.from('post_purchases').delete().eq('member_id', user.id); } catch {}
        try { await supabase.from('post_unlocks').delete().eq('member_id', user.id); } catch {}
        try { await supabase.from('album_saves').delete().eq('member_id', user.id); } catch {}
        try { await supabase.from('push_native_tokens').delete().eq('user_id', user.id); } catch {}
        try { await supabase.from('web_push_subscriptions').delete().eq('member_id', user.id); } catch {}
        try { await supabase.from('notifications').delete().eq('member_id', user.id); } catch {}
        try { await supabase.from('chat_rooms').delete().or(`created_by.eq.${user.id},partner_id.eq.${user.id}`); } catch {}

        // 3. members 테이블 삭제
        console.log('🗑️ Deleting member record');
        const { error: memberDeleteError } = await supabase
          .from('members')
          .delete()
          .eq('id', user.id);

        if (memberDeleteError) {
          console.error('Member delete error:', JSON.stringify(memberDeleteError));
          throw new Error(`Member delete failed: ${memberDeleteError.message || JSON.stringify(memberDeleteError)}`);
        }

        // 4. Supabase Auth 사용자 삭제
        console.log('🗑️ Deleting auth user');
        const { error: authDeleteError } = await supabase.auth.admin.deleteUser(user.id);

        if (authDeleteError) {
          console.error('Auth delete error:', JSON.stringify(authDeleteError));
          throw new Error(`Auth delete failed: ${authDeleteError.message || JSON.stringify(authDeleteError)}`);
        }

        console.log('✅ Account deleted successfully:', user.id);
        return successResponse({ message: 'Account deleted successfully' });

      } catch (error: any) {
        console.error('Account deletion error:', JSON.stringify(error));
        const errorMessage = error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
        return errorResponse('ACCOUNT_DELETE_ERROR', errorMessage || 'Failed to delete account', null);
      }
    }

    // POST /api-auth/partner-apply - Apply to become a partner
    if (pathname === '/api-auth/partner-apply' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body) {
        return errorResponse('INVALID_BODY', 'Request body is required');
      }

      const { partner_name, partner_message, game_info, category_id, detail_category_id, categories,
        referral_source, referrer_member_code, interview_legal_name, interview_phone, interview_email, interview_contact_id,
        interview_sns_type, interview_gender, interview_other_platforms, interview_main_content,
        terms_agreed_at, privacy_agreed_at,
        legal_name, legal_email, legal_phone, payout_bank_code, payout_bank_name, payout_account_number, payout_account_holder } = body;

      if (!partner_name) {
        return errorResponse('MISSING_PARTNER_NAME', 'Partner name is required');
      }

      // Check if user already has a partner application
      const { data: existingPartner, error: checkError } = await supabase
        .from('partners')
        .select('id, partner_status')
        .eq('member_id', user.id)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      const isRejected = existingPartner && String(existingPartner.partner_status || '').toLowerCase() === 'rejected';
      if (existingPartner && !isRejected) {
        return errorResponse('PARTNER_EXISTS', 'Partner application already exists');
      }

      const now = new Date().toISOString();
      let categoryPairs: Array<{ category_id: number | null; detail_category_id: number | null }> = [];
      if (categories !== undefined) {
        try {
          const raw = typeof categories === 'string' ? JSON.parse(categories) : categories;
          if (Array.isArray(raw)) {
            categoryPairs = raw
              .map((item: any) => {
                const cId = item?.categoryId ?? item?.category_id ?? null;
                const dId = item?.detailCategoryId ?? item?.detail_category_id ?? null;
                const parsedC = cId !== null && cId !== undefined ? parseInt(String(cId), 10) : null;
                const parsedD = dId !== null && dId !== undefined ? parseInt(String(dId), 10) : null;
                return {
                  category_id: Number.isNaN(parsedC as any) ? null : parsedC,
                  detail_category_id: Number.isNaN(parsedD as any) ? null : parsedD,
                };
              })
              .filter((p) => p.category_id !== null || p.detail_category_id !== null);
          }
        } catch (_) {}
      } else if (category_id !== undefined || detail_category_id !== undefined) {
        const parsedC = category_id !== undefined ? parseInt(String(category_id), 10) : null;
        const parsedD = detail_category_id !== undefined ? parseInt(String(detail_category_id), 10) : null;
        const pair = {
          category_id: parsedC !== null && !Number.isNaN(parsedC as any) ? parsedC : null,
          detail_category_id: parsedD !== null && !Number.isNaN(parsedD as any) ? parsedD : null,
        };
        if (pair.category_id !== null || pair.detail_category_id !== null) categoryPairs = [pair];
      }

      let newPartner: any;

      if (isRejected && existingPartner) {
        const { data: updated, error: updateError } = await supabase
          .from('partners')
          .update({
            partner_name,
            partner_message: partner_message || null,
            game_info: game_info || null,
            partner_status: 'pending',
            partner_applied_at: now,
            referral_source: referral_source || null,
            referrer_member_code: referrer_member_code || null,
            interview_legal_name: interview_legal_name || null,
            interview_phone: interview_phone || null,
            interview_email: interview_email || null,
            interview_contact_id: interview_contact_id || null,
            interview_sns_type: interview_sns_type || null,
            interview_gender: interview_gender || null,
            interview_other_platforms: interview_other_platforms || null,
            interview_main_content: interview_main_content || null,
            terms_agreed_at: terms_agreed_at || null,
            privacy_agreed_at: privacy_agreed_at || null,
          })
          .eq('id', existingPartner.id)
          .select()
          .single();
        if (updateError) throw updateError;
        newPartner = updated;

        await supabase.from('partner_categories').delete().eq('user_id', user.id);
        if (categoryPairs.length > 0) {
          await supabase.from('partner_categories').insert(
            categoryPairs.map((p) => ({ user_id: user.id, category_id: p.category_id, detail_category_id: p.detail_category_id }))
          );
        }
      } else {
        const { data: created, error: createError } = await supabase
          .from('partners')
          .insert([{
            member_id: user.id,
            partner_name,
            partner_message: partner_message || null,
            game_info: game_info || null,
            partner_status: 'pending',
            partner_applied_at: now,
            total_points: 0,
            coins_per_job: 0,
            default_distribution_rate: 85,
            collaboration_distribution_rate: 100,
            referral_source: referral_source || null,
            referrer_member_code: referrer_member_code || null,
            interview_legal_name: interview_legal_name || null,
            interview_phone: interview_phone || null,
            interview_email: interview_email || null,
            interview_contact_id: interview_contact_id || null,
            interview_sns_type: interview_sns_type || null,
            interview_gender: interview_gender || null,
            interview_other_platforms: interview_other_platforms || null,
            interview_main_content: interview_main_content || null,
            terms_agreed_at: terms_agreed_at || null,
            privacy_agreed_at: privacy_agreed_at || null,
          }])
          .select()
          .single();
        if (createError) throw createError;
        newPartner = created;

        if (categoryPairs.length > 0) {
          await supabase.from('partner_categories').insert(
            categoryPairs.map((p) => ({ user_id: user.id, category_id: p.category_id, detail_category_id: p.detail_category_id }))
          );
        }
      }

      if (legal_name && legal_email && legal_phone && payout_bank_code && payout_account_number && payout_account_holder) {
        try {
          await supabase.from('partner_business_info').upsert({
            partner_id: newPartner.id,
            legal_name: legal_name || null,
            legal_email: legal_email || null,
            legal_phone: String(legal_phone || '').replace(/\D/g, ''),
            payout_bank_code: payout_bank_code || null,
            payout_bank_name: payout_bank_name || null,
            payout_account_number: String(payout_account_number || '').replace(/\D/g, ''),
            payout_account_holder: payout_account_holder || null,
            default_distribution_rate: 85,
            collaboration_distribution_rate: 100,
          }, { onConflict: 'partner_id' });
        } catch (e) {
          console.error('Partner business info insert error:', e);
        }
      }

      return successResponse(newPartner);
    }

    return errorResponse('ROUTE_NOT_FOUND', 'API route not found', null, 404);

  } catch (error) {
    console.error('Auth API error:', error);

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