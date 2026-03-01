/**
 * 사용자 룰렛 인벤토리 훅
 * 본인이 당첨한 룰렛 아이템 목록 조회
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { UserRouletteInventoryItem, RouletteInventoryFilter } from '@/components/features/inventory/roulette/types';

interface UseUserRouletteInventoryOptions {
  userId: string | undefined;
  filters?: RouletteInventoryFilter;
  enabled?: boolean;
}

interface UseUserRouletteInventoryReturn {
  items: UserRouletteInventoryItem[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useUserRouletteInventory({
  userId,
  filters,
  enabled = true,
}: UseUserRouletteInventoryOptions): UseUserRouletteInventoryReturn {
  const query = useQuery({
    queryKey: ['user-roulette-inventory', userId, filters],
    queryFn: async () => {
      if (!userId) return [];

      let query = supabase
        .from('user_roulette_inventory')
        .select('*')
        .eq('donor_id', userId)
        .order('won_at', { ascending: false });

      // 필터 적용
      if (filters?.partner_id) {
        query = query.eq('partner_id', filters.partner_id);
      }

      if (filters?.sort === 'oldest') {
        query = query.order('won_at', { ascending: true });
      }

      if (filters?.date_from) {
        query = query.gte('won_at', filters.date_from);
      }

      if (filters?.date_to) {
        query = query.lte('won_at', filters.date_to);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[useUserRouletteInventory] 조회 실패:', error);
        throw error;
      }

      return (data || []) as UserRouletteInventoryItem[];
    },
    enabled: !!userId && enabled,
    staleTime: 30000, // 30초
  });

  return {
    items: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

