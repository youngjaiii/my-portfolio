/**
 * 파트너 사용 요청 관리 훅
 * 사용자가 요청한 사용형 아이템/쿠폰 승인/거절 처리
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { RouletteRewardUsageRequest } from '@/components/features/inventory/roulette/types';

interface UsePartnerRewardUsageRequestsOptions {
  partnerId: string | undefined;
  enabled?: boolean;
}

interface UsePartnerRewardUsageRequestsReturn {
  requests: RouletteRewardUsageRequest[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  approve: (usageLogId: string) => Promise<any>;
  reject: (params: { usageLogId: string; reason?: string }) => Promise<any>;
  isApproving: boolean;
  isRejecting: boolean;
  /** 대기 중인 요청 수 (뱃지 표시용) */
  pendingCount: number;
}

export function usePartnerRewardUsageRequests({
  partnerId, // members.id (user.id)
  enabled = true,
}: UsePartnerRewardUsageRequestsOptions): UsePartnerRewardUsageRequestsReturn {
  const queryClient = useQueryClient();

  // 승인 대기 중인 요청 목록 조회
  const query = useQuery({
    queryKey: ['partner-reward-usage-requests', partnerId],
    queryFn: async () => {
      if (!partnerId) return [];

      // 먼저 user.id로 partners 테이블에서 실제 partner_id 찾기
      const { data: partnerData, error: partnerError } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', partnerId)
        .single();

      if (partnerError || !partnerData) {
        console.error('[usePartnerRewardUsageRequests] 파트너 조회 실패:', partnerError);
        // 파트너가 아니면 빈 배열 반환
        return [];
      }

      const actualPartnerId = partnerData.id;

      // 사용자 정보와 보상 정보를 함께 조회
      const { data, error } = await supabase
        .from('roulette_reward_usage_logs')
        .select(`
          *,
          user:members!roulette_reward_usage_logs_user_id_fkey (
            id,
            name,
            profile_image,
            member_code
          ),
          reward:user_roulette_rewards!roulette_reward_usage_logs_reward_id_fkey (
            id,
            reward_name,
            reward_type,
            reward_value,
            usable_type,
            initial_amount
          )
        `)
        .eq('partner_id', actualPartnerId)
        .eq('status', 'pending')
        .order('requested_at', { ascending: false });

      if (error) {
        console.error('🎰 [usePartnerRewardUsageRequests] 조회 실패:', error);
        throw error;
      }

      console.log('🎰 [usePartnerRewardUsageRequests] pending 요청 조회 결과:', {
        memberId: partnerId,
        actualPartnerId,
        requestsCount: data?.length || 0,
      });

      return (data || []) as RouletteRewardUsageRequest[];
    },
    enabled: !!partnerId && enabled,
    staleTime: 10000, // 10초 (실시간 업데이트 필요)
  });

  // 승인
  const approveMutation = useMutation({
    mutationFn: async (usageLogId: string) => {
      if (!partnerId) throw new Error('파트너 ID가 필요합니다');

      // 실제 partner_id 찾기
      const { data: partnerData, error: partnerError } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', partnerId)
        .single();

      if (partnerError || !partnerData) {
        throw new Error('파트너 정보를 찾을 수 없습니다');
      }

      const actualPartnerId = partnerData.id;

      const { data, error } = await supabase.rpc('approve_roulette_reward_usage', {
        p_usage_log_id: usageLogId,
        p_partner_id: actualPartnerId,
      });

      if (error) {
        console.error('[usePartnerRewardUsageRequests] 승인 실패:', error);
        throw error;
      }

      if (!data || !data.success) {
        throw new Error(data?.message || '승인에 실패했습니다');
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partner-reward-usage-requests', partnerId] });
      queryClient.invalidateQueries({ queryKey: ['user-roulette-rewards'] });
    },
  });

  // 거절
  const rejectMutation = useMutation({
    mutationFn: async ({ usageLogId, reason }: { usageLogId: string; reason?: string }) => {
      if (!partnerId) throw new Error('파트너 ID가 필요합니다');

      // 실제 partner_id 찾기
      const { data: partnerData, error: partnerError } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', partnerId)
        .single();

      if (partnerError || !partnerData) {
        throw new Error('파트너 정보를 찾을 수 없습니다');
      }

      const actualPartnerId = partnerData.id;

      const { data, error } = await supabase.rpc('reject_roulette_reward_usage', {
        p_usage_log_id: usageLogId,
        p_partner_id: actualPartnerId,
        p_reason: reason || null,
      });

      if (error) {
        console.error('[usePartnerRewardUsageRequests] 거절 실패:', error);
        throw error;
      }

      if (!data || !data.success) {
        throw new Error(data?.message || '거절에 실패했습니다');
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partner-reward-usage-requests', partnerId] });
      queryClient.invalidateQueries({ queryKey: ['user-roulette-rewards'] });
    },
  });

  const requests = query.data || [];

  return {
    requests,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    approve: approveMutation.mutateAsync,
    reject: rejectMutation.mutateAsync,
    isApproving: approveMutation.isPending,
    isRejecting: rejectMutation.isPending,
    pendingCount: requests.length,
  };
}

