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
          name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
          email: user.email || null,
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

        return successResponse(createdMember);
      }

      // If role is partner, get partner data
      if (memberData.role === 'partner') {
        const { data: partnerData, error: partnerError } = await supabase
          .from('partners')
          .select('total_points, store_points')
          .eq('member_id', user.id)
          .maybeSingle();

        if (partnerError && partnerError.code !== 'PGRST116') {
          throw partnerError;
        }

        // Add partner_points and store_points to response
        const responseData = {
          ...memberData,
          partner_points: partnerData?.total_points || 0,
          store_points: partnerData?.store_points || 0,
        };

        return successResponse(responseData);
      }

      return successResponse(memberData);
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

    // POST /api-auth/partner-apply - Apply to become a partner
    if (pathname === '/api-auth/partner-apply' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body) {
        return errorResponse('INVALID_BODY', 'Request body is required');
      }

      const { partner_name, partner_message, game_info } = body;

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

      if (existingPartner) {
        return errorResponse('PARTNER_EXISTS', 'Partner application already exists');
      }

      // Create partner application
      const { data: newPartner, error: createError } = await supabase
        .from('partners')
        .insert([{
          member_id: user.id,
          partner_name,
          partner_message: partner_message || null,
          game_info: game_info || null,
          partner_status: 'pending',
          partner_applied_at: new Date().toISOString(),
          total_points: 0,
          coins_per_job: 0,
        }])
        .select()
        .single();

      if (createError) throw createError;

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