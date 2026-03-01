/**
 * useProfileRoulette - 프로필 룰렛 관련 훅
 * 
 * Phase 5-C: 비방송용 룰렛 (프로필 룰렛)
 * - 파트너의 프로필 룰렛 조회
 * - 프로필 룰렛 실행
 * - 대표 룰렛 조회
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ============================================================
// 타입 정의
// ============================================================

/** 프로필 룰렛 휠 */
export interface ProfileRouletteWheel {
  wheel_id: string
  wheel_name: string
  wheel_description: string | null
  wheel_price: number
  wheel_type: 'stream' | 'profile' | 'both'
  is_featured: boolean
  is_active: boolean
  item_count: number
  items: ProfileRouletteItem[]
}

/** 프로필 룰렛 아이템 */
export interface ProfileRouletteItem {
  id: string
  name: string
  color: string
  reward_type: 'text' | 'usable' | 'digital'
  is_blank: boolean
}

/** 디지털 미리보기 정보 */
export interface DigitalPreview {
  file_url: string
  file_name: string
  file_type: string
}

/** 프로필 룰렛 실행 결과 */
export interface ProfileRouletteResult {
  success: boolean
  error?: string
  result_id?: string
  donation_id?: string
  wheel_name?: string
  wheel_price?: number
  item_id?: string  // 당첨 아이템 ID
  item_name?: string
  item_color?: string
  reward_type?: string
  reward_value?: string
  is_blank?: boolean
  final_rotation?: number
  all_items?: ProfileRouletteItem[]
  required_amount?: number
  current_points?: number
  required_points?: number
  available_items?: number
  // 디지털 당첨 시 미리보기 정보
  digital_preview?: DigitalPreview | null
}

/** 프로필 룰렛 휠 타입 (DB용) */
export type WheelType = 'stream' | 'profile' | 'both'

// ============================================================
// 프로필 룰렛 조회
// ============================================================

/**
 * 파트너의 프로필 룰렛 목록 조회
 */
export function usePartnerProfileWheels(partnerId: string | null) {
  return useQuery({
    queryKey: ['roulette', 'profile', 'wheels', partnerId],
    queryFn: async (): Promise<ProfileRouletteWheel[]> => {
      if (!partnerId) return []

      const { data, error } = await supabase.rpc('get_partner_profile_wheels', {
        p_partner_id: partnerId,
      })

      if (error) {
        console.error('[usePartnerProfileWheels] Error:', error)
        throw error
      }

      return (data || []) as ProfileRouletteWheel[]
    },
    enabled: !!partnerId,
    staleTime: 30 * 1000,
  })
}

/**
 * 파트너의 대표 룰렛 조회
 */
export function useFeaturedWheel(partnerId: string | null) {
  return useQuery({
    queryKey: ['roulette', 'profile', 'featured', partnerId],
    queryFn: async (): Promise<ProfileRouletteWheel | null> => {
      if (!partnerId) return null

      const { data, error } = await supabase
        .from('partner_roulette_wheels')
        .select(`
          id,
          name,
          description,
          price,
          wheel_type,
          is_featured,
          is_active
        `)
        .eq('partner_id', partnerId)
        .eq('is_featured', true)
        .eq('is_active', true)
        .in('wheel_type', ['profile', 'both'])
        .single()

      if (error) {
        if (error.code === 'PGRST116') return null // No rows
        console.error('[useFeaturedWheel] Error:', error)
        return null
      }

      // 아이템 조회
      const { data: items } = await supabase
        .from('partner_roulette_items')
        .select('id, name, color, reward_type, is_blank')
        .eq('wheel_id', data.id)
        .eq('is_active', true)
        .order('sort_order')

      return {
        wheel_id: data.id,
        wheel_name: data.name,
        wheel_description: data.description,
        wheel_price: data.price,
        wheel_type: data.wheel_type,
        is_featured: data.is_featured,
        is_active: data.is_active,
        item_count: items?.length || 0,
        items: (items || []).map(item => ({
          ...item,
          is_blank: item.is_blank ?? false,
        })),
      } as ProfileRouletteWheel
    },
    enabled: !!partnerId,
    staleTime: 30 * 1000,
  })
}

// ============================================================
// 프로필 룰렛 실행
// ============================================================

/**
 * 프로필 룰렛 실행
 */
export function useExecuteProfileRoulette() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      donorId,
      partnerId,
      wheelId,
      amount,
    }: {
      donorId: string
      partnerId: string
      wheelId: string
      amount: number
    }): Promise<ProfileRouletteResult> => {
      const { data, error } = await supabase.rpc('execute_profile_roulette', {
        p_donor_id: donorId,
        p_partner_id: partnerId,
        p_wheel_id: wheelId,
        p_donation_amount: amount,
      })

      if (error) {
        console.error('[useExecuteProfileRoulette] Error:', error)
        throw error
      }

      return data as ProfileRouletteResult
    },
    onSuccess: (result, variables) => {
      if (result.success) {
        // 유저 포인트 갱신
        queryClient.invalidateQueries({ queryKey: ['user'] })
        queryClient.invalidateQueries({ queryKey: ['member'] })
        
        // 인벤토리 갱신
        queryClient.invalidateQueries({ queryKey: ['roulette', 'inventory'] })
        
        // 컬렉션 진행률 갱신
        queryClient.invalidateQueries({ queryKey: ['roulette', 'collections', 'user'] })
        
        // 스핀 가능 여부 갱신
        queryClient.invalidateQueries({ 
          queryKey: ['roulette', 'canSpin', variables.wheelId] 
        })
      }
    },
  })
}

// ============================================================
// 파트너 설정 (휠 타입 변경)
// ============================================================

/**
 * 휠 타입 변경
 */
export function useUpdateWheelType() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      wheelId,
      wheelType,
      isFeatured,
    }: {
      wheelId: string
      wheelType: WheelType
      isFeatured?: boolean
    }) => {
      const updateData: Record<string, any> = { wheel_type: wheelType }
      
      if (isFeatured !== undefined) {
        updateData.is_featured = isFeatured
      }

      const { data, error } = await supabase
        .from('partner_roulette_wheels')
        .update(updateData)
        .eq('id', wheelId)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ 
        queryKey: ['roulette', 'profile', 'wheels', data.partner_id] 
      })
      queryClient.invalidateQueries({ 
        queryKey: ['roulette', 'profile', 'featured', data.partner_id] 
      })
    },
  })
}

/**
 * 대표 룰렛 설정
 */
export function useSetFeaturedWheel() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      partnerId,
      wheelId,
    }: {
      partnerId: string
      wheelId: string
    }) => {
      // 기존 대표 룰렛 해제
      await supabase
        .from('partner_roulette_wheels')
        .update({ is_featured: false })
        .eq('partner_id', partnerId)
        .eq('is_featured', true)

      // 새 대표 룰렛 설정
      const { data, error } = await supabase
        .from('partner_roulette_wheels')
        .update({ is_featured: true })
        .eq('id', wheelId)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ 
        queryKey: ['roulette', 'profile', 'wheels', data.partner_id] 
      })
      queryClient.invalidateQueries({ 
        queryKey: ['roulette', 'profile', 'featured', data.partner_id] 
      })
    },
  })
}

// ============================================================
// 프로필 룰렛 활성화 여부
// ============================================================

/**
 * 파트너가 프로필 룰렛을 활성화했는지 확인
 */
export function useHasProfileRoulette(partnerId: string | null) {
  return useQuery({
    queryKey: ['roulette', 'profile', 'hasActive', partnerId],
    queryFn: async (): Promise<boolean> => {
      if (!partnerId) return false

      const { count, error } = await supabase
        .from('partner_roulette_wheels')
        .select('id', { count: 'exact', head: true })
        .eq('partner_id', partnerId)
        .in('wheel_type', ['profile', 'both'])
        .eq('is_active', true)

      if (error) {
        console.error('[useHasProfileRoulette] Error:', error)
        return false
      }

      return (count || 0) > 0
    },
    enabled: !!partnerId,
    staleTime: 60 * 1000,
  })
}
