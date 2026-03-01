/**
 * useRouletteStock - 룰렛 수량 상태 관리 훅
 * 
 * Phase 5: 수량 제한 시스템
 * - 휠 스핀 가능 여부 확인
 * - 아이템 수량 상태 조회
 */

import type { RouletteItemStockStatus, WheelSpinStatus } from '@/components/features/stream/roulette/types'
import { supabase } from '@/lib/supabase'
import { useQuery } from '@tanstack/react-query'

/**
 * 특정 휠을 돌릴 수 있는지 확인
 */
export function useCanSpinWheel(wheelId: string | null, userId: string | null) {
  return useQuery({
    queryKey: ['roulette', 'canSpin', wheelId, userId],
    queryFn: async (): Promise<WheelSpinStatus> => {
      if (!wheelId || !userId) {
        return {
          can_spin: false,
          available_items: 0,
          total_items: 0,
          has_unlimited: false,
          reason: null,
        }
      }

      const { data, error } = await supabase.rpc('can_spin_roulette_wheel', {
        p_user_id: userId,
        p_wheel_id: wheelId,
      })

      if (error) {
        console.error('[useCanSpinWheel] Error:', error)
        // 에러 시 기본적으로 스핀 가능하도록 (하위 호환)
        return {
          can_spin: true,
          available_items: 0,
          total_items: 0,
          has_unlimited: true,
          reason: null,
        }
      }

      return data as WheelSpinStatus
    },
    enabled: !!wheelId && !!userId,
    staleTime: 30 * 1000, // 30초
    refetchOnWindowFocus: true,
  })
}

/**
 * 아이템 수량 상태 조회 (파트너 대시보드용)
 */
export function useItemStockStatus(itemId: string | null) {
  return useQuery({
    queryKey: ['roulette', 'itemStock', itemId],
    queryFn: async (): Promise<RouletteItemStockStatus | null> => {
      if (!itemId) return null

      const { data, error } = await supabase.rpc('get_roulette_item_stock_status', {
        p_item_id: itemId,
      })

      if (error) {
        console.error('[useItemStockStatus] Error:', error)
        return null
      }

      return data as RouletteItemStockStatus
    },
    enabled: !!itemId,
    staleTime: 10 * 1000, // 10초
  })
}

/**
 * 휠의 모든 아이템 수량 상태 조회 (파트너 대시보드용)
 */
export function useWheelItemsStockStatus(wheelId: string | null) {
  return useQuery({
    queryKey: ['roulette', 'wheelItemsStock', wheelId],
    queryFn: async (): Promise<Map<string, RouletteItemStockStatus>> => {
      if (!wheelId) return new Map()

      // 휠의 모든 아이템 조회
      const { data: items, error: itemsError } = await supabase
        .from('partner_roulette_items')
        .select('id')
        .eq('wheel_id', wheelId)
        .eq('is_active', true)

      if (itemsError || !items) {
        console.error('[useWheelItemsStockStatus] Items Error:', itemsError)
        return new Map()
      }

      // 각 아이템의 상태 조회
      const statusMap = new Map<string, RouletteItemStockStatus>()
      
      await Promise.all(
        items.map(async (item) => {
          const { data, error } = await supabase.rpc('get_roulette_item_stock_status', {
            p_item_id: item.id,
          })
          
          if (!error && data) {
            statusMap.set(item.id, data as RouletteItemStockStatus)
          }
        })
      )

      return statusMap
    },
    enabled: !!wheelId,
    staleTime: 10 * 1000,
  })
}

/**
 * 유저의 특정 아이템 당첨 가능 여부 확인
 */
export function useCanWinItem(itemId: string | null, userId: string | null) {
  return useQuery({
    queryKey: ['roulette', 'canWin', itemId, userId],
    queryFn: async (): Promise<boolean> => {
      if (!itemId || !userId) return false

      const { data, error } = await supabase.rpc('can_win_roulette_item', {
        p_user_id: userId,
        p_item_id: itemId,
      })

      if (error) {
        console.error('[useCanWinItem] Error:', error)
        return true // 에러 시 기본적으로 당첨 가능 (하위 호환)
      }

      return data as boolean
    },
    enabled: !!itemId && !!userId,
    staleTime: 30 * 1000,
  })
}

/** 아이템 수량 상태 (유저 기준) */
export interface UserItemStatus {
  id: string
  name: string
  color: string
  is_blank: boolean
  remaining: number | null
  total: number | null
  is_exhausted: boolean
  can_win: boolean
  type: 'blank' | 'digital' | 'unlimited' | 'global' | 'per_user'
  distribution_type?: 'bundle' | 'individual'
}

/**
 * 유저 기준 휠의 모든 아이템 수량 상태 조회
 */
export function useUserWheelItemsStatus(wheelId: string | null, userId: string | null) {
  return useQuery({
    queryKey: ['roulette', 'userWheelItemsStatus', wheelId, userId],
    queryFn: async (): Promise<UserItemStatus[]> => {
      if (!wheelId || !userId) return []

      const { data, error } = await supabase.rpc('get_user_wheel_items_status', {
        p_user_id: userId,
        p_wheel_id: wheelId,
      })

      if (error) {
        console.error('[useUserWheelItemsStatus] Error:', error)
        return []
      }

      return (data as UserItemStatus[]) || []
    },
    enabled: !!wheelId && !!userId,
    staleTime: 10 * 1000,
    refetchOnWindowFocus: true,
  })
}
