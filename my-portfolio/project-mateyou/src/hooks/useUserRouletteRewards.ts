/**
 * 사용자 룰렛 보상 훅
 * 보유 중인 사용형 아이템/쿠폰/디지털 보상 관리
 */

import type { RouletteRewardUsageLog, UserRouletteReward } from '@/components/features/inventory/roulette/types';
import { supabase } from '@/lib/supabase';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * 디지털 보상의 signed URL을 생성
 */
async function generateSignedUrlsForRewards(rewards: UserRouletteReward[]): Promise<UserRouletteReward[]> {
  const results = await Promise.all(
    rewards.map(async (reward) => {
      // 디지털 보상인 경우 signed URL 생성
      if (reward.reward_type === 'digital') {
        // path가 있으면 사용, 없으면 name으로 fallback (기존 데이터 호환)
        const filePath = reward.digital_file_path || reward.digital_file_name;
        
        if (!filePath) {
          return reward;
        }

        try {
          const { data, error } = await supabase.storage
            .from('roulette-rewards')
            .createSignedUrl(filePath, 3600); // 1시간 유효

          if (data?.signedUrl && !error) {
            return {
              ...reward,
              digital_file_url: data.signedUrl,
            };
          } else {
            console.warn('[useUserRouletteRewards] Signed URL 생성 실패:', filePath, error);
          }
        } catch (err) {
          console.error('[useUserRouletteRewards] Signed URL 생성 에러:', err);
        }
      }
      return reward;
    })
  );
  return results;
}

interface UseUserRouletteRewardsOptions {
  userId: string | undefined;
  enabled?: boolean;
}

interface UseUserRouletteRewardsReturn {
  rewards: UserRouletteReward[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  requestUsage: (params: {
    rewardId: string;
    usageType: string;
    amount: number;
    roomId?: string;
    context?: Record<string, any>;
  }) => Promise<any>;
  isRequesting: boolean;
  // 사용 이력 조회
  usageLogs: RouletteRewardUsageLog[];
  isLoadingLogs: boolean;
}

export function useUserRouletteRewards({
  userId,
  enabled = true,
}: UseUserRouletteRewardsOptions): UseUserRouletteRewardsReturn {
  const queryClient = useQueryClient();

  // 보유 보상 조회
  const rewardsQuery = useQuery({
    queryKey: ['user-roulette-rewards', userId],
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('user_roulette_rewards_inventory')
        .select('*')
        .eq('user_id', userId)
        .order('won_at', { ascending: false });

      if (error) {
        console.error('[useUserRouletteRewards] 조회 실패:', error);
        throw error;
      }

      const rewards = (data || []) as UserRouletteReward[];
      
      // 디지털 보상의 signed URL 생성
      return await generateSignedUrlsForRewards(rewards);
    },
    enabled: !!userId && enabled,
    staleTime: 30000,
  });

  // 사용 이력 조회
  const usageLogsQuery = useQuery({
    queryKey: ['user-roulette-reward-usage-logs', userId],
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('roulette_reward_usage_logs')
        .select('*')
        .eq('user_id', userId)
        .order('requested_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('[useUserRouletteRewards] 사용 이력 조회 실패:', error);
        throw error;
      }

      return (data || []) as RouletteRewardUsageLog[];
    },
    enabled: !!userId && enabled,
    staleTime: 30000,
  });

  // 사용 요청
  const requestUsageMutation = useMutation({
    mutationFn: async ({
      rewardId,
      usageType,
      amount,
      roomId,
      context,
    }: {
      rewardId: string;
      usageType: string;
      amount: number;
      roomId?: string;
      context?: Record<string, any>;
    }) => {
      const { data, error } = await supabase.rpc('request_roulette_reward_usage', {
        p_reward_id: rewardId,
        p_usage_type: usageType,
        p_amount: amount,
        p_room_id: roomId || null,
        p_context: context || null,
      });

      if (error) {
        console.error('[useUserRouletteRewards] 사용 요청 실패:', error);
        throw error;
      }

      if (!data || !data.success) {
        throw new Error(data?.message || '사용 요청에 실패했습니다');
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-roulette-rewards', userId] });
      queryClient.invalidateQueries({ queryKey: ['user-roulette-reward-usage-logs', userId] });
    },
  });

  return {
    rewards: rewardsQuery.data || [],
    isLoading: rewardsQuery.isLoading,
    error: rewardsQuery.error,
    refetch: rewardsQuery.refetch,
    requestUsage: requestUsageMutation.mutateAsync,
    isRequesting: requestUsageMutation.isPending,
    usageLogs: usageLogsQuery.data || [],
    isLoadingLogs: usageLogsQuery.isLoading,
  };
}

