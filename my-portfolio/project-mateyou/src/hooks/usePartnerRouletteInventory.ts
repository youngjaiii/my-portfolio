/**
 * 파트너 룰렛 인벤토리 훅
 * 본인의 룰렛으로 당첨된 사용자 목록 조회
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { PartnerRouletteInventoryItem, RouletteInventoryFilter } from '@/components/features/inventory/roulette/types';

interface UsePartnerRouletteInventoryOptions {
  partnerId: string | undefined;
  filters?: RouletteInventoryFilter;
  enabled?: boolean;
}

interface UsePartnerRouletteInventoryReturn {
  items: PartnerRouletteInventoryItem[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function usePartnerRouletteInventory({
  partnerId, // members.id (user.id)
  filters,
  enabled = true,
}: UsePartnerRouletteInventoryOptions): UsePartnerRouletteInventoryReturn {
  const query = useQuery({
    queryKey: ['partner-roulette-inventory', partnerId, filters],
    queryFn: async () => {
      if (!partnerId) return [];

      // 먼저 user.id로 partners 테이블에서 실제 partner_id 찾기
      const { data: partnerData, error: partnerError } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', partnerId)
        .single();

      if (partnerError || !partnerData) {
        console.error('[usePartnerRouletteInventory] 파트너 조회 실패:', partnerError);
        // 파트너가 아니면 빈 배열 반환
        return [];
      }

      const actualPartnerId = partnerData.id;

      let query = supabase
        .from('partner_roulette_inventory')
        .select('*')
        .eq('partner_id', actualPartnerId)
        .order('won_at', { ascending: false });

      // 필터 적용
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
        console.error('[usePartnerRouletteInventory] 조회 실패:', error);
        throw error;
      }

      console.log('🎰 [usePartnerRouletteInventory] 조회 결과:', {
        memberId: partnerId,
        actualPartnerId,
        itemsCount: data?.length || 0,
      });

      return (data || []) as PartnerRouletteInventoryItem[];
    },
    enabled: !!partnerId && enabled,
    staleTime: 30000,
  });

  return {
    items: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

