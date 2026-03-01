/**
 * 파트너 룰렛 설정 관리 훅
 * 
 * 룰렛 활성화 여부만 관리합니다.
 * 룰렛판/아이템 관리는 useRouletteWheels 훅을 사용합니다.
 * 
 * 주의: partnerId는 member_id (user.id)입니다.
 * 내부적으로 partners 테이블의 id로 변환하여 사용합니다.
 */

import type {
    RouletteSettings,
    RouletteWheel,
} from '@/components/features/stream/roulette/types'
import { supabase } from '@/lib/supabase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

interface UsePartnerRouletteSettingsOptions {
  /** member_id (user.id) 또는 partners.id */
  partnerId: string | undefined
  enabled?: boolean
}

interface UsePartnerRouletteSettingsReturn {
  settings: RouletteSettings | null
  isLoading: boolean
  error: Error | null
  refetch: () => void
  updateSettings: (data: {
    is_enabled?: boolean
  }) => Promise<void>
  toggleEnabled: () => Promise<void>
  isUpdating: boolean
}

export function usePartnerRouletteSettings({
  partnerId,
  enabled = true,
}: UsePartnerRouletteSettingsOptions): UsePartnerRouletteSettingsReturn {
  const queryClient = useQueryClient()

  // member_id로 실제 partner_id 조회
  const partnerQuery = useQuery({
    queryKey: ['partner-by-member', partnerId],
    queryFn: async () => {
      if (!partnerId) return null

      // partnerId가 이미 partners.id인지 확인
      const { data: directPartner } = await supabase
        .from('partners')
        .select('id')
        .eq('id', partnerId)
        .single()

      if (directPartner) {
        return directPartner.id
      }

      // member_id로 partner 조회
      const { data: partnerData, error } = await supabase
        .from('partners')
        .select('id')
        .eq('member_id', partnerId)
        .single()

      if (error || !partnerData) {
        console.error('파트너 조회 실패:', error)
        return null
      }

      return partnerData.id
    },
    enabled: !!partnerId && enabled,
    staleTime: 60000,
  })

  const actualPartnerId = partnerQuery.data

  // 설정 조회 (설정 + 룰렛판 + 아이템)
  const query = useQuery({
    queryKey: ['partner-roulette-settings', actualPartnerId],
    queryFn: async (): Promise<RouletteSettings | null> => {
      if (!actualPartnerId) return null

      // 설정 조회
      const { data: settingsData, error: settingsError } = await supabase
        .from('partner_roulette_settings')
        .select('*')
        .eq('partner_id', actualPartnerId)
        .single()

      // 설정이 없으면 기본값 반환
      const is_enabled = settingsError ? false : settingsData?.is_enabled ?? false

      // 룰렛판 + 아이템 조회
      const { data: wheelsData, error: wheelsError } = await supabase
        .from('partner_roulette_wheels')
        .select('*')
        .eq('partner_id', actualPartnerId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

      if (wheelsError) {
        console.error('룰렛판 조회 실패:', wheelsError)
      }

      const wheels: RouletteWheel[] = []
      
      if (wheelsData && wheelsData.length > 0) {
        const wheelIds = wheelsData.map((w) => w.id)
        
        const { data: itemsData, error: itemsError } = await supabase
          .from('partner_roulette_items')
          .select('*, digital_files:roulette_item_digital_files(*)')
          .in('wheel_id', wheelIds)
          .eq('is_active', true)
          .order('sort_order', { ascending: true })

        if (itemsError) {
          console.error('아이템 조회 실패:', itemsError)
        }

        for (const wheel of wheelsData) {
          const items = (itemsData || []).filter((item) => item.wheel_id === wheel.id)
          wheels.push({
            ...wheel,
            items,
          })
        }
      }

      // 유효성: 활성화된 룰렛판이 1개 이상 있고, 각 판에 아이템이 1개 이상
      const validWheels = wheels.filter((w) => (w.items?.length ?? 0) > 0)
      const is_valid = validWheels.length > 0

      return {
        is_enabled,
        wheels,
        is_valid,
      }
    },
    enabled: !!actualPartnerId && enabled,
    staleTime: 30000,
  })

  // 설정 업데이트 (직접 테이블 업데이트)
  const updateMutation = useMutation({
    mutationFn: async (data: { is_enabled?: boolean }) => {
      if (!actualPartnerId) throw new Error('파트너 ID가 없습니다. 파트너 등록이 필요합니다.')

      // upsert
      const { error } = await supabase
        .from('partner_roulette_settings')
        .upsert({
          partner_id: actualPartnerId,
          is_enabled: data.is_enabled,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'partner_id',
        })

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['partner-roulette-settings', actualPartnerId],
      })
      queryClient.invalidateQueries({
        queryKey: ['partner-roulette-wheels', actualPartnerId],
      })
    },
  })

  const updateSettings = useCallback(
    async (data: { is_enabled?: boolean }) => {
      await updateMutation.mutateAsync(data)
    },
    [updateMutation]
  )

  const toggleEnabled = useCallback(async () => {
    const currentEnabled = query.data?.is_enabled ?? false
    await updateSettings({ is_enabled: !currentEnabled })
  }, [query.data?.is_enabled, updateSettings])

  return {
    settings: query.data ?? null,
    isLoading: partnerQuery.isLoading || query.isLoading,
    error: query.error,
    refetch: query.refetch,
    updateSettings,
    toggleEnabled,
    isUpdating: updateMutation.isPending,
  }
}
