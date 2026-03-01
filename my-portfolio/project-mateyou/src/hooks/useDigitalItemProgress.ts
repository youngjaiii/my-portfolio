/**
 * useDigitalItemProgress - 디지털 상품 수집 진행률 조회 훅
 * 
 * 개별 지급(individual) 디지털 상품의 수집 상태를 조회합니다.
 * - 총 파일 수
 * - 획득한 파일 수
 * - 진행률 (%)
 * - 완료 여부
 */

import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'

export interface DigitalItemProgress {
  itemId: string
  itemName: string
  distributionType: 'bundle' | 'individual'
  totalFiles: number
  wonFiles: number
  wonFileIds: string[]
  isComplete: boolean
  progressPercent: number
}

interface UseDigitalItemProgressOptions {
  userId: string | undefined
  itemId: string | undefined
  enabled?: boolean
}

/**
 * 단일 아이템 진행률 조회
 */
export function useDigitalItemProgress({
  userId,
  itemId,
  enabled = true,
}: UseDigitalItemProgressOptions) {
  return useQuery({
    queryKey: ['digital-item-progress', userId, itemId],
    queryFn: async (): Promise<DigitalItemProgress | null> => {
      if (!userId || !itemId) return null

      const { data, error } = await supabase.rpc('get_user_digital_item_progress', {
        p_user_id: userId,
        p_item_id: itemId,
      })

      if (error) {
        console.error('[useDigitalItemProgress] Error:', error)
        return null
      }

      if (!data || data.error) {
        return null
      }

      return {
        itemId: data.item_id,
        itemName: data.item_name,
        distributionType: data.distribution_type,
        totalFiles: data.total_files,
        wonFiles: data.won_files,
        wonFileIds: data.won_file_ids || [],
        isComplete: data.is_complete,
        progressPercent: data.progress_percent,
      }
    },
    enabled: !!userId && !!itemId && enabled,
    staleTime: 30 * 1000,
  })
}

interface UseMultipleDigitalItemsProgressOptions {
  userId: string | undefined
  itemIds: string[]
  enabled?: boolean
}

/**
 * 여러 아이템 진행률 조회 (휠 전체)
 */
export function useMultipleDigitalItemsProgress({
  userId,
  itemIds,
  enabled = true,
}: UseMultipleDigitalItemsProgressOptions) {
  return useQuery({
    queryKey: ['digital-items-progress', userId, itemIds],
    queryFn: async (): Promise<Map<string, DigitalItemProgress>> => {
      const progressMap = new Map<string, DigitalItemProgress>()
      
      if (!userId || itemIds.length === 0) return progressMap

      // 병렬로 조회
      const results = await Promise.all(
        itemIds.map(async (itemId) => {
          try {
            const { data, error } = await supabase.rpc('get_user_digital_item_progress', {
              p_user_id: userId,
              p_item_id: itemId,
            })

            if (error || !data || data.error) {
              return null
            }

            return {
              itemId: data.item_id,
              itemName: data.item_name,
              distributionType: data.distribution_type,
              totalFiles: data.total_files,
              wonFiles: data.won_files,
              wonFileIds: data.won_file_ids || [],
              isComplete: data.is_complete,
              progressPercent: data.progress_percent,
            } as DigitalItemProgress
          } catch {
            return null
          }
        })
      )

      results.forEach((result) => {
        if (result) {
          progressMap.set(result.itemId, result)
        }
      })

      return progressMap
    },
    enabled: !!userId && itemIds.length > 0 && enabled,
    staleTime: 30 * 1000,
  })
}

/**
 * 휠의 모든 디지털 아이템 진행률 조회
 */
export function useWheelDigitalProgress({
  userId,
  wheelId,
  enabled = true,
}: {
  userId: string | undefined
  wheelId: string | undefined
  enabled?: boolean
}) {
  // 먼저 휠의 디지털 아이템 목록 조회
  const itemsQuery = useQuery({
    queryKey: ['wheel-digital-items', wheelId],
    queryFn: async () => {
      if (!wheelId) return []

      const { data, error } = await supabase
        .from('partner_roulette_items')
        .select('id, name, reward_type, digital_distribution_type')
        .eq('wheel_id', wheelId)
        .eq('reward_type', 'digital')
        .eq('is_active', true)

      if (error) {
        console.error('[useWheelDigitalProgress] Items Error:', error)
        return []
      }

      return data || []
    },
    enabled: !!wheelId && enabled,
    staleTime: 60 * 1000,
  })

  const digitalItemIds = (itemsQuery.data || [])
    .filter((item) => item.digital_distribution_type === 'individual')
    .map((item) => item.id)

  // 진행률 조회
  const progressQuery = useMultipleDigitalItemsProgress({
    userId,
    itemIds: digitalItemIds,
    enabled: !!userId && digitalItemIds.length > 0 && enabled,
  })

  return {
    items: itemsQuery.data || [],
    progress: progressQuery.data || new Map(),
    isLoading: itemsQuery.isLoading || progressQuery.isLoading,
    refetch: () => {
      itemsQuery.refetch()
      progressQuery.refetch()
    },
  }
}
