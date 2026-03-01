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

    // POST /api-partner-settlement/withdraw - Submit withdrawal request
    if (pathname === '/api-partner-settlement/withdraw' && req.method === 'POST') {
      const user = await getAuthUser(req);
      const body = await parseRequestBody(req);

      if (!body || !body.amount || !body.bank_info) {
        return errorResponse('INVALID_BODY', 'Amount and bank info are required');
      }

      const { amount, bank_info, notes } = body;

      try {
        // Get user's partner info
        const { data: partnerData, error: partnerError } = await supabase
          .from('partners')
          .select('id, total_points, tosspayments_seller_id')
          .eq('member_id', user.id)
          .single();

        if (partnerError) {
          console.error('❌ Failed to fetch partner data for withdrawal:', {
            error: partnerError,
            memberId: user.id,
          });
          if (partnerError.code === 'PGRST116') {
            return errorResponse('NOT_A_PARTNER', 'User is not a partner');
          }
          throw partnerError;
        }

        // Check if seller ID exists (셀러 ID가 없으면 출금 불가)
        if (!partnerData.tosspayments_seller_id) {
          console.error('❌ Withdrawal request rejected: Missing tosspayments_seller_id', {
            partnerId: partnerData.id,
            memberId: user.id,
            amount,
          });
          return errorResponse(
            'WITHDRAWAL_DISABLED',
            '출금을 위해서는 토스페이먼츠 셀러 등록이 필요합니다.',
            null,
            403
          );
        }

        // Check if user has enough points
        if (partnerData.total_points < amount) {
          return errorResponse('INSUFFICIENT_POINTS', 'Insufficient points for withdrawal');
        }

        // Minimum withdrawal amount check
        if (amount < 1000) {
          return errorResponse('MINIMUM_WITHDRAWAL', 'Minimum withdrawal amount is 1000 points');
        }

        // Create withdrawal request
        // bank_info에서 bank_name, bank_owner, bank_num 추출
        const bankName = bank_info?.bank_name || bank_info?.bankName || null;
        const bankOwner = bank_info?.bank_owner || bank_info?.bankOwner || null;
        const bankNum = bank_info?.bank_num || bank_info?.bankNum || null;

        const { data: withdrawalRequest, error: createError } = await supabase
          .from('partner_withdrawals')
          .insert({
            partner_id: partnerData.id,
            requested_amount: amount,
            bank_name: bankName,
            bank_owner: bankOwner,
            bank_num: bankNum,
            status: 'pending',
          })
          .select()
          .single();

        if (createError) throw createError;

        // 출금 신청 시 포인트 로그 기록
        const { error: logError } = await supabase
          .from('partner_points_logs')
          .insert({
            partner_id: partnerData.id,
            type: 'spend',
            amount: amount,
            description: `출금 신청 (대기 중, 요청 금액: ${amount} 포인트)`,
            log_id: withdrawalRequest.id.toString(),
          });

        if (logError) {
          console.error('❌ Failed to add log for withdrawal request:', logError);
          // 로그 추가 실패는 경고만 하고 계속 진행 (출금 신청은 이미 성공)
          console.warn('⚠️  Warning: Failed to add log for withdrawal request, but withdrawal request was created');
        } else {
          console.log(`✅ Added log for withdrawal request: ${withdrawalRequest.id}`);
        }

        return successResponse({
          withdrawal: withdrawalRequest,
          message: 'Withdrawal request submitted successfully',
        });

      } catch (error) {
        return errorResponse('WITHDRAWAL_ERROR', 'Failed to submit withdrawal request', error.message);
      }
    }

    // PUT /api-partner-settlement/payment-info - Update payment settlement info (Toss related)
    if (pathname === '/api-partner-settlement/payment-info' && req.method === 'PUT') {
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

        // Update only payment settlement related fields
        const updateData: any = {};

        // Toss Payments related fields
        if (body.payoutBankCode !== undefined) updateData.payout_bank_code = body.payoutBankCode;
        if (body.payoutBankName !== undefined) updateData.payout_bank_name = body.payoutBankName;
        if (body.payoutAccountNumber !== undefined) updateData.payout_account_number = body.payoutAccountNumber;
        if (body.payoutAccountHolder !== undefined) updateData.payout_account_holder = body.payoutAccountHolder;
        if (body.businessType !== undefined) updateData.tosspayments_business_type = body.businessType;

        const { data: updatedPartner, error: updateError } = await supabase
          .from('partners')
          .update(updateData)
          .eq('id', partnerData.id)
          .select()
          .single();

        if (updateError) throw updateError;

        return successResponse({
          partner: updatedPartner,
          message: 'Payment settlement info updated successfully',
        });

      } catch (error) {
        return errorResponse('PAYMENT_INFO_UPDATE_ERROR', 'Failed to update payment info', error.message);
      }
    }

    // GET /api-partner-settlement/stats - Get settlement statistics
    if (pathname === '/api-partner-settlement/stats' && req.method === 'GET') {
      const user = await getAuthUser(req);

      try {
        // Get user's partner info
        const { data: partnerData, error: partnerError } = await supabase
          .from('partners')
          .select('id, total_points, payout_bank_name, payout_account_number, tosspayments_seller_id')
          .eq('member_id', user.id)
          .single();

        if (partnerError) {
          console.error('❌ Failed to fetch partner data for stats:', {
            error: partnerError,
            memberId: user.id,
          });
          if (partnerError.code === 'PGRST116') {
            return errorResponse('NOT_A_PARTNER', 'User is not a partner');
          }
          throw partnerError;
        }

        // Get withdrawal requests
        const { data: withdrawalRequests, error: withdrawalError } = await supabase
          .from('partner_withdrawals')
          .select('*')
          .eq('partner_id', partnerData.id)
          .order('created_at', { ascending: false });

        if (withdrawalError) {
          console.error('❌ Failed to fetch withdrawal requests:', {
            error: withdrawalError,
            partnerId: partnerData.id,
          });
          throw withdrawalError;
        }

        // Calculate pending withdrawal amount
        const pendingWithdrawals = withdrawalRequests
          ?.filter(req => req.status === 'pending')
          ?.reduce((sum, req) => sum + (req.requested_amount || 0), 0) || 0;

        // Check if withdrawal is disabled (셀러 ID가 없으면 출금 불가)
        const withdrawalDisabled = !partnerData.tosspayments_seller_id;
        
        if (withdrawalDisabled) {
          console.warn('⚠️  Withdrawal disabled: Missing tosspayments_seller_id', {
            partnerId: partnerData.id,
            memberId: user.id,
          });
        }

        const stats = {
          totalPoints: partnerData.total_points || 0,
          pendingWithdrawals,
          withdrawalHistory: withdrawalRequests || [],
          paymentInfoSet: !!(partnerData.payout_bank_name && partnerData.payout_account_number),
          withdrawalDisabled, // 셀러 ID가 없으면 true
        };

        return successResponse(stats);

      } catch (error) {
        return errorResponse('SETTLEMENT_STATS_ERROR', 'Failed to fetch settlement statistics', error.message);
      }
    }

    return errorResponse('ROUTE_NOT_FOUND', 'API route not found', null, 404);

  } catch (error) {
    console.error('Partner Settlement API error:', error);

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