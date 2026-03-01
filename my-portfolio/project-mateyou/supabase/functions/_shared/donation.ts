/**
 * 공통 후원 처리 헬퍼 함수
 * 일반 후원과 방송 후원에서 공통으로 사용되는 로직
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';
import { errorResponse, successResponse } from './utils.ts';

export interface ProcessDonationParams {
  donorId: string;
  partnerId: string;
  amount: number;
  description: string;
  logId: string;
  donationType?: 'basic' | 'mission' | 'video';
}

export interface DonationRpcResult {
  success: boolean;
  error_code?: string;
  error_message?: string;
  member_new_points?: number;
  partner_new_points?: number | null;
  amount?: number;
  log_id?: string;
  is_mission?: boolean;
  required?: number;
  available?: number;
}

/**
 * RPC 에러를 API 응답으로 변환
 */
export const handleDonationRpcError = (result: DonationRpcResult | null): Response | null => {
  if (!result || result.success) {
    return null;
  }

  const errorCode = result.error_code || 'DONATION_FAILED';
  const errorMessage = result.error_message || '후원 처리에 실패했습니다.';

  // 특정 에러 코드에 따른 응답
  if (errorCode === 'INSUFFICIENT_POINTS') {
    return errorResponse('INSUFFICIENT_POINTS', errorMessage, {
      required: result.required,
      available: result.available,
    });
  }

  if (errorCode === 'DUPLICATE_REQUEST') {
    return errorResponse('DUPLICATE_REQUEST', errorMessage);
  }

  if (errorCode === 'MIN_AMOUNT_REQUIRED') {
    return errorResponse('MIN_AMOUNT_REQUIRED', errorMessage);
  }

  if (errorCode === 'INVALID_DONATION_TYPE') {
    return errorResponse('INVALID_DONATION_TYPE', errorMessage);
  }

  return errorResponse(errorCode, errorMessage);
};

/**
 * 후원 금액 검증
 */
export const validateDonationAmount = (amount: number): Response | null => {
  if (amount < 1000) {
    return errorResponse('MIN_AMOUNT_REQUIRED', '최소 1,000P 이상 후원해야 합니다.');
  }
  return null;
};

/**
 * donation_type 검증
 */
export const validateDonationType = (
  donationType: string | undefined
): 'basic' | 'mission' | 'video' | null => {
  if (!donationType) {
    return 'basic'; // 기본값
  }

  const validTypes: ('basic' | 'mission' | 'video')[] = ['basic', 'mission', 'video'];
  if (validTypes.includes(donationType as any)) {
    return donationType as 'basic' | 'mission' | 'video';
  }

  return null;
};

/**
 * process_donation RPC 호출
 */
export const processDonationRpc = async (
  supabase: SupabaseClient,
  params: ProcessDonationParams
): Promise<DonationRpcResult> => {
  const rpcParams: Record<string, any> = {
    p_donor_id: params.donorId,
    p_partner_id: params.partnerId,
    p_amount: params.amount,
    p_description: params.description,
    p_log_id: params.logId,
  };

  // donation_type이 명시적으로 전달된 경우만 추가
  if (params.donationType) {
    rpcParams.p_donation_type = params.donationType;
  }

  const { data: result, error: rpcError } = await supabase.rpc('process_donation', rpcParams);

  if (rpcError) {
    throw rpcError;
  }

  return result as DonationRpcResult;
};

/**
 * 후원 성공 응답 생성
 */
export const createDonationSuccessResponse = (result: DonationRpcResult, isStream: boolean = false) => {
  return successResponse({
    success: true,
    message: isStream ? 'Stream donation completed successfully' : 'Donation completed successfully',
    memberNewPoints: result.member_new_points,
    partnerNewPoints: result.partner_new_points ?? null,
    amount: result.amount,
    logId: result.log_id,
    ...(isStream && { isMission: result.is_mission || false }),
  });
};

