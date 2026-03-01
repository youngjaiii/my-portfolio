import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, createSupabaseClient, errorResponse, successResponse, getAuthUser, parseRequestBody } from '../_shared/utils.ts';

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const supabase = createSupabaseClient();

    // PUT /api-partner-profile/update - Update partner profile info (excluding Toss payment info)
    if (pathname === '/api-partner-profile/update' && req.method === 'PUT') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body) {
        return errorResponse('INVALID_BODY', 'Request body is required');
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

        // Update only profile related fields (excluding Toss payment info)
        const updateData: any = {};

        // Profile fields for partners table
        if (body.partnerName !== undefined) updateData.partner_name = body.partnerName?.trim();
        if (body.partnerMessage !== undefined) updateData.partner_message = body.partnerMessage?.trim();
        if (body.gameInfos !== undefined) updateData.game_info = body.gameInfos;
        if (body.backgroundImages !== undefined) updateData.background_images = body.backgroundImages;

        // Update partners table if there are profile fields to update
        let updatedPartner = null;
        if (Object.keys(updateData).length > 0) {
          const { data, error: partnerUpdateError } = await supabase
            .from('partners')
            .update(updateData)
            .eq('id', partnerData.id)
            .select()
            .single();

          if (partnerUpdateError) throw partnerUpdateError;
          updatedPartner = data;
        }

        // Update partner_business_info for legal and payout fields
        const businessInfoUpdateData: any = {};

        // Legal fields
        if (body.legalName !== undefined) businessInfoUpdateData.legal_name = body.legalName?.trim();
        if (body.legalEmail !== undefined) businessInfoUpdateData.legal_email = body.legalEmail?.trim();
        if (body.legalPhone !== undefined) businessInfoUpdateData.legal_phone = body.legalPhone?.trim();

        // Payout fields
        if (body.payoutBankCode !== undefined) businessInfoUpdateData.payout_bank_code = body.payoutBankCode?.trim();
        if (body.payoutBankName !== undefined) businessInfoUpdateData.payout_bank_name = body.payoutBankName?.trim();
        if (body.payoutAccountNumber !== undefined) businessInfoUpdateData.payout_account_number = body.payoutAccountNumber?.trim();
        if (body.payoutAccountHolder !== undefined) businessInfoUpdateData.payout_account_holder = body.payoutAccountHolder?.trim();

        if (Object.keys(businessInfoUpdateData).length > 0) {
          businessInfoUpdateData.updated_at = new Date().toISOString();

          const { error: businessInfoError } = await supabase
            .from('partner_business_info')
            .update(businessInfoUpdateData)
            .eq('partner_id', partnerData.id);

          if (businessInfoError) throw businessInfoError;
        }

        // Update member profile if provided
        const memberUpdateData: any = {};
        if (body.profileImage !== undefined) memberUpdateData.profile_image = body.profileImage;
        if (body.favoriteGame !== undefined) memberUpdateData.favorite_game = body.favoriteGame;

        if (Object.keys(memberUpdateData).length > 0) {
          const { error: memberUpdateError } = await supabase
            .from('members')
            .update(memberUpdateData)
            .eq('id', user.id);

          if (memberUpdateError) throw memberUpdateError;
        }

        return successResponse({
          partner: updatedPartner,
          message: 'Partner profile updated successfully',
        });

      } catch (error) {
        return errorResponse('PROFILE_UPDATE_ERROR', 'Failed to update partner profile', error.message);
      }
    }

    // GET /api-partner-profile/info - Get partner profile info
    if (pathname === '/api-partner-profile/info' && req.method === 'GET') {
      const user = await getAuthUser(req);

      try {
        // Get complete partner profile info
        const { data: partnerData, error: partnerError } = await supabase
          .from('partners')
          .select(`
            *,
            members!member_id (
              id, name, profile_image, favorite_game, email
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

        return successResponse({
          partner: partnerData,
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