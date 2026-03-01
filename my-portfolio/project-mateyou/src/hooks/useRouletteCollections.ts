/**
 * useRouletteCollections - 룰렛 컬렉션 관리 훅
 * 
 * Phase 5-B: 디지털 보상 컬렉션 시스템
 * - 컬렉션 CRUD
 * - 유저 진행률 조회
 * - 완성 보상 수령
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ============================================================
// 타입 정의
// ============================================================

/** 디지털 보상 컬렉션 */
export interface RouletteCollection {
  id: string
  partner_id: string
  wheel_id?: string | null
  name: string
  description?: string | null
  total_items: number
  thumbnail_url?: string | null
  completion_reward_type?: string | null
  completion_reward_value?: string | null
  completion_reward_name?: string | null
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

/** 컬렉션 내 아이템 */
export interface CollectionItem {
  id: string
  collection_id: string
  roulette_item_id: string
  item_order: number
  created_at: string
  // 조인된 아이템 정보
  roulette_item?: {
    id: string
    name: string
    reward_value?: string | null
    digital_file_url?: string | null
  }
}

/** 유저 컬렉션 진행 상황 */
export interface UserCollectionProgress {
  collection_id: string
  collection_name: string
  collection_description: string | null
  partner_id: string
  thumbnail_url: string | null
  total_items: number
  collected_count: number
  is_completed: boolean
  completion_reward_claimed: boolean
  has_completion_reward: boolean
}

/** 컬렉션 생성/수정 입력 */
export interface CollectionInput {
  partner_id: string
  wheel_id?: string | null
  name: string
  description?: string | null
  thumbnail_url?: string | null
  completion_reward_type?: string | null
  completion_reward_value?: string | null
  completion_reward_name?: string | null
  item_ids?: string[] // 컬렉션에 포함할 룰렛 아이템 ID 목록
}

// ============================================================
// 파트너용 훅 (컬렉션 관리)
// ============================================================

/**
 * 파트너의 컬렉션 목록 조회
 */
export function usePartnerCollections(partnerId: string | null) {
  return useQuery({
    queryKey: ['roulette', 'collections', 'partner', partnerId],
    queryFn: async (): Promise<RouletteCollection[]> => {
      if (!partnerId) return []

      const { data, error } = await supabase
        .from('roulette_digital_collections')
        .select('*')
        .eq('partner_id', partnerId)
        .order('sort_order')

      if (error) {
        console.error('[usePartnerCollections] Error:', error)
        throw error
      }

      return data || []
    },
    enabled: !!partnerId,
  })
}

/**
 * 컬렉션 상세 조회 (아이템 목록 포함)
 */
export function useCollectionDetail(collectionId: string | null) {
  return useQuery({
    queryKey: ['roulette', 'collection', collectionId],
    queryFn: async () => {
      if (!collectionId) return null

      // 컬렉션 정보 조회
      const { data: collection, error: collectionError } = await supabase
        .from('roulette_digital_collections')
        .select('*')
        .eq('id', collectionId)
        .single()

      if (collectionError) {
        console.error('[useCollectionDetail] Collection Error:', collectionError)
        throw collectionError
      }

      // 컬렉션 아이템 목록 조회
      const { data: items, error: itemsError } = await supabase
        .from('roulette_collection_items')
        .select(`
          *,
          roulette_item:partner_roulette_items(id, name, reward_value, digital_file_url)
        `)
        .eq('collection_id', collectionId)
        .order('item_order')

      if (itemsError) {
        console.error('[useCollectionDetail] Items Error:', itemsError)
      }

      return {
        ...collection,
        items: items || [],
      } as RouletteCollection & { items: CollectionItem[] }
    },
    enabled: !!collectionId,
  })
}

/**
 * 컬렉션 생성
 */
export function useCreateCollection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CollectionInput) => {
      const { item_ids, ...collectionData } = input

      // 컬렉션 생성
      const { data: collection, error: collectionError } = await supabase
        .from('roulette_digital_collections')
        .insert({
          ...collectionData,
          total_items: item_ids?.length || 0,
        })
        .select()
        .single()

      if (collectionError) throw collectionError

      // 아이템 연결
      if (item_ids && item_ids.length > 0) {
        const collectionItems = item_ids.map((itemId, index) => ({
          collection_id: collection.id,
          roulette_item_id: itemId,
          item_order: index,
        }))

        const { error: itemsError } = await supabase
          .from('roulette_collection_items')
          .insert(collectionItems)

        if (itemsError) throw itemsError

        // 아이템에 collection_id 설정 + 중복 방지 활성화
        const { error: updateError } = await supabase
          .from('partner_roulette_items')
          .update({ 
            collection_id: collection.id,
            prevent_duplicate: true, // 컬렉션 아이템은 자동으로 중복 방지
          })
          .in('id', item_ids)

        if (updateError) throw updateError
      }

      return collection as RouletteCollection
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['roulette', 'collections', 'partner', variables.partner_id] 
      })
    },
  })
}

/**
 * 컬렉션 수정
 */
export function useUpdateCollection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ 
      collectionId, 
      input 
    }: { 
      collectionId: string
      input: Partial<CollectionInput> 
    }) => {
      const { item_ids, ...collectionData } = input

      // 컬렉션 업데이트
      const { data: collection, error } = await supabase
        .from('roulette_digital_collections')
        .update({
          ...collectionData,
          ...(item_ids ? { total_items: item_ids.length } : {}),
        })
        .eq('id', collectionId)
        .select()
        .single()

      if (error) throw error

      // 아이템 재설정 (제공된 경우)
      if (item_ids) {
        // 기존 아이템의 collection_id 해제
        await supabase
          .from('partner_roulette_items')
          .update({ collection_id: null })
          .eq('collection_id', collectionId)

        // 기존 연결 삭제
        await supabase
          .from('roulette_collection_items')
          .delete()
          .eq('collection_id', collectionId)

        // 새 연결 생성
        if (item_ids.length > 0) {
          const collectionItems = item_ids.map((itemId, index) => ({
            collection_id: collectionId,
            roulette_item_id: itemId,
            item_order: index,
          }))

          await supabase
            .from('roulette_collection_items')
            .insert(collectionItems)

          // 아이템에 collection_id 설정
          await supabase
            .from('partner_roulette_items')
            .update({ 
              collection_id: collectionId,
              prevent_duplicate: true,
            })
            .in('id', item_ids)
        }
      }

      return collection as RouletteCollection
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ 
        queryKey: ['roulette', 'collections', 'partner', data.partner_id] 
      })
      queryClient.invalidateQueries({ 
        queryKey: ['roulette', 'collection', data.id] 
      })
    },
  })
}

/**
 * 컬렉션 삭제
 */
export function useDeleteCollection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ collectionId, partnerId }: { collectionId: string, partnerId: string }) => {
      // 아이템의 collection_id 해제
      await supabase
        .from('partner_roulette_items')
        .update({ collection_id: null })
        .eq('collection_id', collectionId)

      // 컬렉션 삭제 (CASCADE로 collection_items도 삭제됨)
      const { error } = await supabase
        .from('roulette_digital_collections')
        .delete()
        .eq('id', collectionId)

      if (error) throw error

      return { collectionId, partnerId }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ 
        queryKey: ['roulette', 'collections', 'partner', data.partnerId] 
      })
    },
  })
}

// ============================================================
// 유저용 훅 (컬렉션 진행률)
// ============================================================

/**
 * 유저의 컬렉션 진행률 목록
 */
export function useUserCollections(userId: string | null, partnerId?: string | null) {
  return useQuery({
    queryKey: ['roulette', 'collections', 'user', userId, partnerId],
    queryFn: async (): Promise<UserCollectionProgress[]> => {
      if (!userId) return []

      const { data, error } = await supabase.rpc('get_user_collections', {
        p_user_id: userId,
        p_partner_id: partnerId || null,
      })

      if (error) {
        console.error('[useUserCollections] Error:', error)
        throw error
      }

      return data || []
    },
    enabled: !!userId,
  })
}

/**
 * 특정 컬렉션의 유저 진행 상황 (수집한 아이템 목록 포함)
 */
export function useUserCollectionDetail(userId: string | null, collectionId: string | null) {
  return useQuery({
    queryKey: ['roulette', 'collection', 'user', userId, collectionId],
    queryFn: async () => {
      if (!userId || !collectionId) return null

      // 유저 진행 상황 조회
      const { data: progress, error: progressError } = await supabase
        .from('user_collection_progress')
        .select('*')
        .eq('user_id', userId)
        .eq('collection_id', collectionId)
        .single()

      // 컬렉션 정보 조회
      const { data: collection, error: collectionError } = await supabase
        .from('roulette_digital_collections')
        .select('*')
        .eq('id', collectionId)
        .single()

      if (collectionError) throw collectionError

      // 컬렉션 아이템 목록 조회
      const { data: items, error: itemsError } = await supabase
        .from('roulette_collection_items')
        .select(`
          *,
          roulette_item:partner_roulette_items(id, name, reward_value, digital_file_url)
        `)
        .eq('collection_id', collectionId)
        .order('item_order')

      if (itemsError) throw itemsError

      const collectedSet = new Set(progress?.collected_items || [])

      return {
        collection,
        progress: progress || { collected_items: [], collected_count: 0, is_completed: false },
        items: (items || []).map(item => ({
          ...item,
          is_collected: collectedSet.has(item.roulette_item_id),
        })),
      }
    },
    enabled: !!userId && !!collectionId,
  })
}

/**
 * 컬렉션 완성 보상 수령
 */
export function useClaimCollectionReward() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ userId, collectionId }: { userId: string, collectionId: string }) => {
      const { data, error } = await supabase.rpc('claim_collection_reward', {
        p_user_id: userId,
        p_collection_id: collectionId,
      })

      if (error) throw error
      if (!data.success) throw new Error(data.error)

      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['roulette', 'collections', 'user', variables.userId] 
      })
      queryClient.invalidateQueries({ 
        queryKey: ['roulette', 'collection', 'user', variables.userId, variables.collectionId] 
      })
      // 인벤토리도 갱신
      queryClient.invalidateQueries({ 
        queryKey: ['roulette', 'inventory'] 
      })
    },
  })
}
