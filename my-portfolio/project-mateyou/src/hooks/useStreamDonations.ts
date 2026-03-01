/**
 * 스트림 후원 관련 훅
 * - 후원 기록 조회
 * - 실시간 후원 이벤트 수신
 * - Top 5 랭킹 관리
 * - 룰렛 이벤트 수신 및 큐 관리
 */

import type {
  DonationRouletteResult,
  RouletteItem,
  RouletteQueueItem,
} from '@/components/features/stream/roulette/types'
import { ROULETTE_ANIMATION_CONFIG } from '@/components/features/stream/roulette/types'
import { useUnifiedStreamChannel } from '@/hooks/useUnifiedStreamChannel'
import { supabase } from '@/lib/supabase'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'

/** 후원 기록 타입 */
export interface StreamDonation {
  id: number
  room_id: string
  donor_id: string
  recipient_partner_id: string
  amount: number
  heart_image: string | null
  message: string | null
  log_id: string | null
  created_at: string
  // JOIN된 데이터
  donor?: {
    id: string
    name: string
    profile_image: string | null
  }
  recipient_partner?: {
    id: string
    partner_name: string
  }
}

/** 후원 랭킹 타입 */
export interface DonationRanking {
  host_partner_id: string // 호스트별 집계
  donor_id: string
  donor_name: string
  donor_profile_image: string | null
  total_amount: number
  donation_count: number
  first_donation_at: string // 동일 금액 시 우선순위용
  last_donation_at: string
  rank: number
}

/** 후원 이펙트 이벤트 타입 */
export interface DonationEffect {
  id: string
  donorName: string
  donorProfileImage: string | null
  recipientName: string
  amount: number
  heartImage: string
  message: string | null
  timestamp: number
}

interface UseStreamDonationsOptions {
  roomId: string | undefined
  /** 실시간 수신 활성화 여부 */
  enableRealtime?: boolean
  /** 이펙트 표시 시간 (ms) */
  effectDuration?: number
  /** 룰렛 이벤트 수신 활성화 */
  enableRoulette?: boolean
}

/**
 * 스트림 후원 관련 훅
 */
export function useStreamDonations({
  roomId,
  enableRealtime = true,
  effectDuration = 5000,
  enableRoulette = true,
}: UseStreamDonationsOptions) {
  const queryClient = useQueryClient()
  
  // 현재 표시 중인 이펙트 목록
  const [activeEffects, setActiveEffects] = useState<DonationEffect[]>([])
  
  // 이펙트 큐 (순차 표시용)
  const effectQueueRef = useRef<DonationEffect[]>([])
  const isProcessingRef = useRef(false)

  // 룰렛 상태
  const [currentRoulette, setCurrentRoulette] = useState<RouletteQueueItem | null>(null)
  const rouletteQueueRef = useRef<RouletteQueueItem[]>([])
  const isProcessingRouletteRef = useRef(false)
  const processedRouletteIdsRef = useRef<Set<string>>(new Set()) // 이미 처리한 룰렛 ID

  // 방 정보 조회 (host_partner_id 가져오기)
  const roomQuery = useQuery({
    queryKey: ['stream-room-host', roomId],
    queryFn: async () => {
      if (!roomId) return null
      
      const { data, error } = await supabase
        .from('stream_rooms')
        .select('host_partner_id')
        .eq('id', roomId)
        .single()
      
      if (error) {
        console.error('방 정보 조회 실패:', error)
        return null
      }
      
      return data
    },
    enabled: !!roomId,
    staleTime: 60000, // 1분
    retry: 2,
  })

  // Top 5 랭킹 조회 (호스트별)
  const rankingsQuery = useQuery({
    queryKey: ['stream-donation-rankings', roomQuery.data?.host_partner_id],
    queryFn: async () => {
      const hostPartnerId = roomQuery.data?.host_partner_id
      if (!hostPartnerId) {
        console.warn('[랭킹] host_partner_id가 없어 랭킹을 조회할 수 없습니다. roomId:', roomId)
        return []
      }
      
      console.log('[랭킹] 호스트별 랭킹 조회 시작. host_partner_id:', hostPartnerId)
      
      const { data, error } = await supabase
        .from('stream_donation_rankings')
        .select('*')
        .eq('host_partner_id', hostPartnerId)
        .lte('rank', 5)
        .order('rank', { ascending: true })
      
      if (error) {
        // 데이터베이스 뷰가 아직 마이그레이션되지 않은 경우를 대비
        console.error('[랭킹] 후원 랭킹 조회 실패:', error)
        // 에러가 'column "host_partner_id" does not exist'인 경우 fallback
        if (error.message?.includes('host_partner_id') || error.message?.includes('does not exist')) {
          console.warn('[랭킹] 데이터베이스 뷰가 아직 마이그레이션되지 않았습니다. documents/migration_stream_donation_rankings_weekly.sql 파일을 실행해주세요.')
        }
        return []
      }
      
      console.log('[랭킹] 랭킹 조회 성공. 결과 개수:', data?.length || 0)
      return (data || []) as DonationRanking[]
    },
    enabled: !!roomId && !!roomQuery.data?.host_partner_id && !roomQuery.isLoading,
    staleTime: 10000,
    refetchInterval: 30000,
  })

  // 최근 후원 조회 (초기 데이터)
  const recentDonationsQuery = useQuery({
    queryKey: ['stream-donations-recent', roomId],
    queryFn: async () => {
      if (!roomId) return []
      
      const { data, error } = await supabase
        .from('stream_donations')
        .select(`
          id,
          room_id,
          donor_id,
          recipient_partner_id,
          amount,
          heart_image,
          message,
          log_id,
          donation_type,
          status,
          mission_text,
          video_url,
          video_title,
          video_thumbnail,
          processed_at,
          processed_by,
          escrow_amount,
          created_at,
          donor:members!stream_donations_donor_id_fkey(id, name, profile_image),
          recipient_partner:partners!stream_donations_recipient_partner_id_fkey(id, partner_name)
        `)
        .eq('room_id', roomId)
        .order('created_at', { ascending: false })
        .limit(20)
      
      if (error) {
        console.error('최근 후원 조회 실패:', error)
        return []
      }
      
      return data as StreamDonation[]
    },
    enabled: !!roomId,
    staleTime: 10000,
  })

  // 이펙트 순차 처리
  const processEffectQueue = useCallback(() => {
    if (isProcessingRef.current || effectQueueRef.current.length === 0) return
    
    isProcessingRef.current = true
    const effect = effectQueueRef.current.shift()!
    
    setActiveEffects(prev => [...prev, effect])
    
    setTimeout(() => {
      setActiveEffects(prev => prev.filter(e => e.id !== effect.id))
      isProcessingRef.current = false
      processEffectQueue()
    }, effectDuration)
  }, [effectDuration])

  // 룰렛 큐 순차 처리
  const processRouletteQueue = useCallback(() => {
    if (isProcessingRouletteRef.current) return
    if (rouletteQueueRef.current.length === 0) return
    
    isProcessingRouletteRef.current = true
    const nextRoulette = rouletteQueueRef.current.shift()!
    
    console.log('🎰 [StreamDonations] 룰렛 표시 시작:', nextRoulette.id)
    setCurrentRoulette(nextRoulette)
    
    // 애니메이션 완료 후 제거
    setTimeout(() => {
      console.log('🎰 [StreamDonations] 룰렛 표시 완료:', nextRoulette.id)
      setCurrentRoulette(null)
      isProcessingRouletteRef.current = false
      
      // 다음 룰렛이 있으면 처리
      if (rouletteQueueRef.current.length > 0) {
        setTimeout(() => {
          processRouletteQueue()
        }, 500)
      }
    }, ROULETTE_ANIMATION_CONFIG.totalDuration)
  }, [])

  // 새 룰렛 결과 추가
  const addRouletteToQueue = useCallback(
    async (result: DonationRouletteResult) => {
      console.log('🎰 [StreamDonations] 룰렛 결과 수신:', result)
      
      // 중복 체크 - 이미 처리한 룰렛이면 무시
      if (processedRouletteIdsRef.current.has(result.id)) {
        console.log('🎰 [StreamDonations] 중복 룰렛 무시:', result.id)
        return
      }
      
      // 필수 필드 검증
      if (!result.id || !result.roulette_item_id || !result.item_name) {
        console.error('🎰 [StreamDonations] 룰렛 결과 필수 필드 누락:', result)
        return
      }
      
      // all_items 검증 및 파싱
      let items: RouletteItem[] = []
      try {
        if (result.all_items) {
          // JSONB는 이미 파싱되어 있을 수 있지만, 문자열일 수도 있음
          if (typeof result.all_items === 'string') {
            items = JSON.parse(result.all_items) as RouletteItem[]
          } else if (Array.isArray(result.all_items)) {
            items = result.all_items as RouletteItem[]
          } else {
            console.error('🎰 [StreamDonations] all_items 형식 오류:', typeof result.all_items, result.all_items)
            return
          }
          
          // 배열이 비어있거나 유효하지 않은 경우
          if (!Array.isArray(items) || items.length === 0) {
            console.error('🎰 [StreamDonations] all_items가 비어있거나 유효하지 않음:', items)
            return
          }
        } else {
          console.error('🎰 [StreamDonations] all_items가 없음:', result)
          return
        }
      } catch (error) {
        console.error('🎰 [StreamDonations] all_items 파싱 실패:', error, result.all_items)
        return
      }
      
      // 처리 완료 표시
      processedRouletteIdsRef.current.add(result.id)
      
      // 후원자 정보 및 후원 금액 조회
      const [donorResult, donationResult] = await Promise.all([
        supabase
          .from('members')
          .select('name, profile_image')
          .eq('id', result.donor_id)
          .single(),
        supabase
          .from('stream_donations')
          .select('amount')
          .eq('id', result.donation_id)
          .single()
      ])

      if (donorResult.error) {
        console.error('🎰 [StreamDonations] 후원자 정보 조회 실패:', donorResult.error)
      }
      if (donationResult.error) {
        console.error('🎰 [StreamDonations] 후원 정보 조회 실패:', donationResult.error)
      }

      const donorData = donorResult.data as { name: string; profile_image: string | null } | null
      const donationAmount = donationResult.data?.amount || 0

      // final_rotation 검증
      const finalRotation = typeof result.final_rotation === 'number' 
        ? result.final_rotation 
        : parseFloat(String(result.final_rotation)) || 0

      const queueItem: RouletteQueueItem = {
        id: result.id,
        donorName: donorData?.name || '익명',
        donorProfileImage: donorData?.profile_image || null,
        wheelName: result.wheel_name || '룰렛',
        wheelPrice: result.wheel_price || donationAmount,
        items: items,
        winningItemId: result.roulette_item_id,
        winningItemName: result.item_name,
        winningItemColor: result.item_color || '#FF6B6B',
        finalRotation: finalRotation,
        createdAt: result.created_at,
      }

      console.log('🎰 [StreamDonations] 룰렛 큐에 추가:', result.id, {
        ...queueItem,
        itemsCount: queueItem.items.length,
      })
      rouletteQueueRef.current.push(queueItem)
      
      // 현재 처리 중이 아니면 시작
      if (!isProcessingRouletteRef.current) {
        processRouletteQueue()
      }
    },
    [processRouletteQueue]
  )

  // 새 후원 이펙트 추가
  const addDonationEffect = useCallback((donation: StreamDonation) => {
    const effect: DonationEffect = {
      id: `effect-${donation.id}-${Date.now()}`,
      donorName: donation.donor?.name || '익명',
      donorProfileImage: donation.donor?.profile_image || null,
      recipientName: donation.recipient_partner?.partner_name || '파트너',
      amount: donation.amount,
      heartImage: donation.heart_image || '/icon/heart.png',
      message: donation.message,
      timestamp: new Date(donation.created_at).getTime(),
    }
    
    effectQueueRef.current.push(effect)
    processEffectQueue()
  }, [processEffectQueue])

  // 통합 채널 사용
  const unifiedChannel = useUnifiedStreamChannel(roomId, {
    enabled: !!roomId && enableRealtime,
    enableDonations: true,
  })

  // 통합 채널을 통한 후원 이벤트 구독
  useEffect(() => {
    if (!roomId || !enableRealtime) return
    if (!unifiedChannel.isConnected) return

    // donation:new 이벤트 리스닝
    const handleNewDonation = async (data: { donation: StreamDonation }) => {
      console.log('🎁 [StreamDonations] 새 후원 수신 (통합 채널):', data.donation)
      
      const newDonation = data.donation
      
      // 상세 정보 조회 (donor, recipient_partner 포함)
      const { data: donationWithDetails } = await supabase
        .from('stream_donations')
        .select(`
          id,
          room_id,
          donor_id,
          recipient_partner_id,
          amount,
          heart_image,
          message,
          log_id,
          donation_type,
          status,
          mission_text,
          video_url,
          video_title,
          video_thumbnail,
          processed_at,
          processed_by,
          escrow_amount,
          created_at,
          donor:members!stream_donations_donor_id_fkey(id, name, profile_image),
          recipient_partner:partners!stream_donations_recipient_partner_id_fkey(id, partner_name)
        `)
        .eq('id', newDonation.id)
        .single()
      
      if (donationWithDetails) {
        addDonationEffect(donationWithDetails as StreamDonation)
      }
      
      queryClient.invalidateQueries({ queryKey: ['stream-donation-rankings', roomId] })
    }

    // donation:roulette 이벤트 리스닝
    const handleRoulette = (data: { result: DonationRouletteResult }) => {
      if (!enableRoulette) {
        console.log('🎰 [StreamDonations] 룰렛 비활성화됨, 이벤트 무시')
        return
      }
      console.log('🎰 [StreamDonations] 룰렛 결과 수신 (통합 채널):', {
        id: data.result?.id,
        donation_id: data.result?.donation_id,
        room_id: data.result?.room_id,
        wheel_name: data.result?.wheel_name,
        wheel_price: data.result?.wheel_price,
        item_name: data.result?.item_name,
        all_items_type: typeof data.result?.all_items,
        all_items_length: Array.isArray(data.result?.all_items) ? data.result.all_items.length : 'N/A',
        full_result: data.result,
      })
      addRouletteToQueue(data.result)
    }

    unifiedChannel.on('donation:new', handleNewDonation)
    if (enableRoulette) {
      unifiedChannel.on('donation:roulette', handleRoulette)
    }

    return () => {
      unifiedChannel.off('donation:new', handleNewDonation)
      if (enableRoulette) {
        unifiedChannel.off('donation:roulette', handleRoulette)
      }
    }
  }, [roomId, enableRealtime, enableRoulette, unifiedChannel, addDonationEffect, addRouletteToQueue, queryClient])

  // 현재 룰렛 스킵 (호스트 전용)
  const skipCurrentRoulette = useCallback(() => {
    if (currentRoulette) {
      console.log('🎰 [StreamDonations] 룰렛 스킵:', currentRoulette.id)
      setCurrentRoulette(null)
      isProcessingRouletteRef.current = false

      // 다음 룰렛 처리
      if (rouletteQueueRef.current.length > 0) {
        setTimeout(() => {
          processRouletteQueue()
        }, 300)
      }
    }
  }, [currentRoulette, processRouletteQueue])

  return {
    // Top 5 랭킹
    rankings: rankingsQuery.data || [],
    isLoadingRankings: rankingsQuery.isLoading,
    refetchRankings: rankingsQuery.refetch,
    
    // 최근 후원
    recentDonations: recentDonationsQuery.data || [],
    isLoadingRecent: recentDonationsQuery.isLoading,
    
    // 활성 이펙트 (Realtime으로 수신)
    activeEffects,

    // 룰렛 관련
    currentRoulette,
    rouletteQueueLength: rouletteQueueRef.current.length,
    skipCurrentRoulette,
  }
}
