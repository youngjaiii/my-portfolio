/**
 * 룰렛판(Wheel) CRUD 훅
 * 
 * 각 파트너는 여러 개의 룰렛판을 가질 수 있으며,
 * 각 룰렛판은 고정 금액과 아이템들로 구성됩니다.
 * 
 * 주의: partnerId는 member_id (user.id)입니다.
 * 내부적으로 partners 테이블의 id로 변환하여 사용합니다.
 */

import type {
    CreateRouletteItemInput,
    CreateRouletteWheelInput,
    RouletteItem,
    RouletteWheel,
    UpdateRouletteItemInput,
    UpdateRouletteWheelInput,
} from '@/components/features/stream/roulette/types'
import { supabase } from '@/lib/supabase'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

/** 룰렛판 용도 타입 */
export type WheelType = 'stream' | 'profile' | 'both'

interface UseRouletteWheelsOptions {
  /** member_id (user.id) 또는 partners.id */
  partnerId: string | undefined
  /** 룰렛판 용도 필터 (stream: 방송용, profile: 비방송용, both: 전체) */
  wheelType?: WheelType
  enabled?: boolean
}

interface UseRouletteWheelsReturn {
  wheels: RouletteWheel[]
  isLoading: boolean
  error: Error | null
  refetch: () => void
  // 룰렛판 CRUD
  addWheel: (wheel: CreateRouletteWheelInput) => Promise<string>
  updateWheel: (id: string, data: UpdateRouletteWheelInput) => Promise<void>
  deleteWheel: (id: string) => Promise<void>
  // 아이템 CRUD
  addItem: (item: CreateRouletteItemInput) => Promise<void>
  updateItem: (id: string, data: UpdateRouletteItemInput) => Promise<void>
  deleteItem: (id: string) => Promise<void>
  isUpdating: boolean
}

export function useRouletteWheels({
  partnerId,
  wheelType,
  enabled = true,
}: UseRouletteWheelsOptions): UseRouletteWheelsReturn {
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

  // 룰렛판 + 아이템 조회
  const query = useQuery({
    queryKey: ['partner-roulette-wheels', actualPartnerId, wheelType],
    queryFn: async () => {
      if (!actualPartnerId) return []

      // 룰렛판 조회
      let wheelsQuery = supabase
        .from('partner_roulette_wheels')
        .select('*')
        .eq('partner_id', actualPartnerId)
      
      // wheel_type 필터링
      if (wheelType && wheelType !== 'both') {
        if (wheelType === 'stream') {
          // 방송용: wheel_type이 'stream', 'both', 또는 NULL(기존 데이터)인 경우 모두 포함
          wheelsQuery = wheelsQuery.or('wheel_type.eq.stream,wheel_type.eq.both,wheel_type.is.null')
        } else {
          // 프로필용: wheel_type이 'profile' 또는 'both'인 경우만 (NULL 제외)
          wheelsQuery = wheelsQuery.or('wheel_type.eq.profile,wheel_type.eq.both')
        }
      }

      const { data: wheelsData, error: wheelsError } = await wheelsQuery
        .order('sort_order', { ascending: true })

      if (wheelsError) {
        console.error('룰렛판 조회 실패:', wheelsError)
        throw wheelsError
      }

      if (!wheelsData || wheelsData.length === 0) {
        return []
      }

      // 각 룰렛판의 아이템 조회 (디지털 파일 포함)
      const wheelIds = wheelsData.map((w) => w.id)
      const { data: itemsData, error: itemsError } = await supabase
        .from('partner_roulette_items')
        .select('*, digital_files:roulette_item_digital_files(*)')
        .in('wheel_id', wheelIds)
        .order('sort_order', { ascending: true })

      if (itemsError) {
        console.error('룰렛 아이템 조회 실패:', itemsError)
      }

      // 룰렛판에 아이템 매핑
      const wheels: RouletteWheel[] = wheelsData.map((wheel) => ({
        ...wheel,
        items: (itemsData || []).filter((item) => item.wheel_id === wheel.id) as RouletteItem[],
      }))

      return wheels
    },
    enabled: !!actualPartnerId && enabled,
    staleTime: 30000,
  })

  // 쿼리 무효화
  const invalidateQueries = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ['partner-roulette-wheels', actualPartnerId],
    })
    queryClient.invalidateQueries({
      queryKey: ['partner-roulette-settings', partnerId],
    })
    queryClient.invalidateQueries({
      queryKey: ['partner-roulette-settings', actualPartnerId],
    })
  }, [queryClient, partnerId, actualPartnerId])

  // 최소 금액 (stream_donations의 amount 제약과 동일)
  const MIN_WHEEL_PRICE = 1000

  // 룰렛판 추가
  const addWheelMutation = useMutation({
    mutationFn: async (wheel: CreateRouletteWheelInput): Promise<string> => {
      if (!actualPartnerId) throw new Error('파트너 ID가 없습니다. 파트너 등록이 필요합니다.')
      if (wheel.price < MIN_WHEEL_PRICE) {
        throw new Error(`최소 금액은 ${MIN_WHEEL_PRICE.toLocaleString()}P 이상이어야 합니다`)
      }

      const currentWheels = query.data || []
      const maxSortOrder = currentWheels.length > 0
        ? Math.max(...currentWheels.map((w) => w.sort_order))
        : -1

      const { data, error } = await supabase
        .from('partner_roulette_wheels')
        .insert({
          partner_id: actualPartnerId,
          name: wheel.name,
          price: wheel.price,
          description: wheel.description,
          sort_order: wheel.sort_order ?? maxSortOrder + 1,
          is_active: true,
          wheel_type: wheel.wheel_type ?? wheelType ?? 'stream',
          is_featured: wheel.is_featured ?? false,
        })
        .select('id')
        .single()

      if (error) throw error
      return data.id
    },
    onSuccess: invalidateQueries,
  })

  // 룰렛판 수정
  const updateWheelMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateRouletteWheelInput }) => {
      // 금액 변경 시 최소 금액 검증
      if (data.price !== undefined && data.price < MIN_WHEEL_PRICE) {
        throw new Error(`최소 금액은 ${MIN_WHEEL_PRICE.toLocaleString()}P 이상이어야 합니다`)
      }

      const { error } = await supabase
        .from('partner_roulette_wheels')
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: invalidateQueries,
  })

  // 룰렛판 삭제 (아이템도 함께 삭제 - CASCADE)
  const deleteWheelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('partner_roulette_wheels')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: invalidateQueries,
  })

  // 아이템 추가
  const addItemMutation = useMutation({
    mutationFn: async (item: CreateRouletteItemInput) => {
      // 해당 wheel의 현재 아이템 수 조회
      const wheel = query.data?.find((w) => w.id === item.wheel_id)
      const currentItems = wheel?.items || []
      const maxSortOrder = currentItems.length > 0
        ? Math.max(...currentItems.map((i) => i.sort_order))
        : -1

      // 아이템 생성
      const { data: newItem, error } = await supabase.from('partner_roulette_items').insert({
        wheel_id: item.wheel_id,
        name: item.name,
        description: item.description,
        color: item.color,
        weight: item.weight,
        reward_type: item.reward_type || 'text',
        reward_value: item.reward_value || null,
        sort_order: item.sort_order ?? maxSortOrder + 1,
        is_active: true,
        // 수량 제한 (비디지털용)
        stock_limit_type: item.stock_limit_type || null,
        stock_limit: item.stock_limit || null,
        is_blank: item.is_blank || false,
        // 디지털 설정
        digital_distribution_type: item.digital_distribution_type || 'bundle',
        // 레거시 단일 파일 (호환용)
        digital_file_url: item.digital_file_url || null,
        digital_file_path: item.digital_file_path || null,
        digital_file_name: item.digital_file_name || null,
        digital_file_size: item.digital_file_size || null,
        digital_file_type: item.digital_file_type || null,
      }).select('id').single()

      if (error) throw error

      // 다중 디지털 파일 저장
      if (item.digital_files && item.digital_files.length > 0 && newItem?.id) {
        const filesData = item.digital_files.map((file, index) => ({
          item_id: newItem.id,
          file_url: file.file_url,
          file_path: file.file_path,
          file_name: file.file_name,
          file_size: file.file_size || null,
          file_type: file.file_type || null,
          sort_order: index,
        }))

        const { error: filesError } = await supabase
          .from('roulette_item_digital_files')
          .insert(filesData)

        if (filesError) {
          console.error('디지털 파일 저장 실패:', filesError)
          throw filesError
        }
      }
    },
    onSuccess: invalidateQueries,
  })

  // 아이템 수정
  const updateItemMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateRouletteItemInput }) => {
      console.log('🎰 [useRouletteWheels] 아이템 수정:', { id, data })
      
      // digital_files는 별도 테이블이므로 제외
      const { digital_files, ...itemData } = data

      const { error, data: result } = await supabase
        .from('partner_roulette_items')
        .update({
          ...itemData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()

      if (error) {
        console.error('🎰 [useRouletteWheels] 아이템 수정 실패:', error)
        throw error
      }

      // 다중 디지털 파일 업데이트 (있는 경우)
      // ⚠️ 중요: 기존 파일 ID를 유지해야 당첨 기록(user_roulette_digital_file_wins)이 보존됨
      if (digital_files !== undefined) {
        // 1. 기존 DB 파일 목록 조회
        const { data: existingFiles } = await supabase
          .from('roulette_item_digital_files')
          .select('id')
          .eq('item_id', id)

        const existingFileIds = new Set((existingFiles || []).map((f) => f.id))

        // 2. 입력된 파일 중 ID가 있는 것 = 유지할 파일
        const inputFileIds = new Set(
          (digital_files || []).filter((f) => f.id).map((f) => f.id)
        )

        // 3. 삭제할 파일 = DB에 있는데 입력에 없는 것
        const fileIdsToDelete = [...existingFileIds].filter(
          (fileId) => !inputFileIds.has(fileId)
        )

        if (fileIdsToDelete.length > 0) {
          const { error: deleteError } = await supabase
            .from('roulette_item_digital_files')
            .delete()
            .in('id', fileIdsToDelete)

          if (deleteError) {
            console.error('디지털 파일 삭제 실패:', deleteError)
            // 삭제 실패해도 계속 진행 (당첨 기록 보존 우선)
          }
        }

        // 4. 기존 파일 sort_order 업데이트
        const existingFilesToUpdate = (digital_files || []).filter(
          (f) => f.id && existingFileIds.has(f.id)
        )
        for (let i = 0; i < existingFilesToUpdate.length; i++) {
          const file = existingFilesToUpdate[i]
          const newSortOrder = (digital_files || []).findIndex((f) => f.id === file.id)
          await supabase
            .from('roulette_item_digital_files')
            .update({ sort_order: newSortOrder })
            .eq('id', file.id)
        }

        // 5. 새 파일 추가 = ID가 없는 것
        const newFiles = (digital_files || []).filter((f) => !f.id)
        if (newFiles.length > 0) {
          const filesData = newFiles.map((file) => ({
            item_id: id,
            file_url: file.file_url,
            file_path: file.file_path,
            file_name: file.file_name,
            file_size: file.file_size || null,
            file_type: file.file_type || null,
            sort_order: (digital_files || []).findIndex(
              (f) => f.file_path === file.file_path
            ),
          }))

          const { error: filesError } = await supabase
            .from('roulette_item_digital_files')
            .insert(filesData)

          if (filesError) {
            console.error('디지털 파일 추가 실패:', filesError)
            throw filesError
          }
        }
      }

      console.log('🎰 [useRouletteWheels] 아이템 수정 성공:', result)
    },
    onSuccess: invalidateQueries,
  })

  // 아이템 삭제
  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('partner_roulette_items')
        .delete()
        .eq('id', id)

      if (error) throw error
    },
    onSuccess: invalidateQueries,
  })

  const addWheel = useCallback(
    async (wheel: CreateRouletteWheelInput) => {
      return await addWheelMutation.mutateAsync(wheel)
    },
    [addWheelMutation]
  )

  const updateWheel = useCallback(
    async (id: string, data: UpdateRouletteWheelInput) => {
      await updateWheelMutation.mutateAsync({ id, data })
    },
    [updateWheelMutation]
  )

  const deleteWheel = useCallback(
    async (id: string) => {
      await deleteWheelMutation.mutateAsync(id)
    },
    [deleteWheelMutation]
  )

  const addItem = useCallback(
    async (item: CreateRouletteItemInput) => {
      await addItemMutation.mutateAsync(item)
    },
    [addItemMutation]
  )

  const updateItem = useCallback(
    async (id: string, data: UpdateRouletteItemInput) => {
      await updateItemMutation.mutateAsync({ id, data })
    },
    [updateItemMutation]
  )

  const deleteItem = useCallback(
    async (id: string) => {
      await deleteItemMutation.mutateAsync(id)
    },
    [deleteItemMutation]
  )

  return {
    wheels: query.data || [],
    isLoading: partnerQuery.isLoading || query.isLoading,
    error: query.error,
    refetch: query.refetch,
    addWheel,
    updateWheel,
    deleteWheel,
    addItem,
    updateItem,
    deleteItem,
    isUpdating:
      addWheelMutation.isPending ||
      updateWheelMutation.isPending ||
      deleteWheelMutation.isPending ||
      addItemMutation.isPending ||
      updateItemMutation.isPending ||
      deleteItemMutation.isPending,
  }
}

