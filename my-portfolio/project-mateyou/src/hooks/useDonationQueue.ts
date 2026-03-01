/**
 * 도네이션 큐 관리 훅
 * - 대기 중인 도네이션 조회
 * - 실시간 업데이트
 * - 상태 관리 (완료, 스킵 등)
 * - 미션 관리 (수락, 거절, 성공, 실패)
 */

import type {
  DonationStatus,
  DonationType,
  MissionProcessResult,
  StreamDonation,
} from '@/components/features/stream/donation/types'
import { supabase } from '@/lib/supabase'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'

interface UseDonationQueueOptions {
  roomId: string | undefined
  enabled?: boolean
  /** 특정 상태만 필터링 */
  statusFilter?: DonationStatus[]
  /** 특정 타입만 필터링 */
  typeFilter?: DonationType[]
  /** 특정 파트너에게 온 도네이션만 필터링 (recipient_partner_id) */
  recipientPartnerId?: string | null
  /** 실시간 업데이트 활성화 */
  enableRealtime?: boolean
}

interface UseDonationQueueReturn {
  /** 전체 도네이션 목록 */
  donations: StreamDonation[]
  /** 대기 중인 도네이션 */
  pendingDonations: StreamDonation[]
  /** 수락된 미션 목록 */
  acceptedMissions: StreamDonation[]
  /** 처리 완료된 도네이션 */
  completedDonations: StreamDonation[]
  /** 스킵된 도네이션 */
  skippedDonations: StreamDonation[]
  /** 로딩 상태 */
  isLoading: boolean
  /** 에러 */
  error: Error | null
  /** 새로고침 */
  refetch: () => void
  /** 도네이션 상태 업데이트 */
  updateDonationStatus: (
    donationId: number,
    status: DonationStatus
  ) => Promise<boolean>
  /** 미션 수락 */
  acceptMission: (donationId: number) => Promise<MissionProcessResult>
  /** 미션 거절 (환불 포함) */
  rejectMission: (donationId: number) => Promise<MissionProcessResult>
  /** 미션 성공 */
  completeMissionSuccess: (donationId: number) => Promise<MissionProcessResult>
  /** 미션 실패 */
  completeMissionFailed: (donationId: number) => Promise<MissionProcessResult>
  /** 통계 */
  stats: {
    totalAmount: number
    totalCount: number
    pendingCount: number
    acceptedMissionCount: number
    completedCount: number
    skippedCount: number
    uniqueDonorCount: number
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const streamDonationsTable = () => supabase.from('stream_donations') as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const membersTable = () => supabase.from('members') as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const partnersTable = () => supabase.from('partners') as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const memberPointsLogsTable = () => supabase.from('member_points_logs') as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const partnerPointsLogsTable = () => supabase.from('partner_points_logs') as any

export function useDonationQueue({
  roomId,
  enabled = true,
  statusFilter,
  typeFilter,
  recipientPartnerId,
  enableRealtime = true,
}: UseDonationQueueOptions): UseDonationQueueReturn {
  const queryClient = useQueryClient()
  const [realtimeKey, setRealtimeKey] = useState(0)

  // 오늘 시작 시간
  const getTodayStart = () => {
    const now = new Date()
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    )
    return todayStart.toISOString()
  }

  // 도네이션 목록 조회
  const query = useQuery({
    queryKey: ['donation-queue', roomId, realtimeKey],
    queryFn: async () => {
      if (!roomId) return []

      const todayStart = getTodayStart()

      const { data, error } = await streamDonationsTable()
        .select(
          `
          *,
          donor:members!stream_donations_donor_id_fkey(id, name, profile_image),
          recipient_partner:partners!stream_donations_recipient_partner_id_fkey(
            id, 
            partner_name,
            member:members!partners_member_id_fkey(id, name, profile_image)
          )
        `
        )
        .eq('room_id', roomId)
        .gte('created_at', todayStart)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('도네이션 큐 조회 실패:', error)
        throw error
      }

      return (data as StreamDonation[]) || []
    },
    enabled: !!roomId && enabled,
    staleTime: 5000,
    refetchInterval: 30000,
  })

  // 실시간 구독
  useEffect(() => {
    if (!roomId || !enableRealtime) return

    const channel = supabase
      .channel(`donation-queue-${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stream_donations',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          // 데이터 변경 시 리패치
          setRealtimeKey((prev) => prev + 1)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId, enableRealtime])

  // 기본값 적용된 도네이션 (DB 마이그레이션 전 호환성)
  const normalizedDonations = useMemo(() => {
    return (query.data || []).map((d) => ({
      ...d,
      donation_type: d.donation_type || 'basic',
      status: d.status || 'completed', // 기존 데이터는 완료 처리
    })) as StreamDonation[]
  }, [query.data])

  // 파트너 필터가 적용된 도네이션 (recipientPartnerId가 주어지면 해당 파트너에게 온 것만)
  const partnerFilteredDonations = useMemo(() => {
    if (!recipientPartnerId) return normalizedDonations
    return normalizedDonations.filter(
      (d) => d.recipient_partner_id === recipientPartnerId
    )
  }, [normalizedDonations, recipientPartnerId])

  // 필터링된 도네이션
  const filteredDonations = useMemo(() => {
    let result = partnerFilteredDonations

    if (statusFilter && statusFilter.length > 0) {
      result = result.filter((d) => statusFilter.includes(d.status))
    }

    if (typeFilter && typeFilter.length > 0) {
      result = result.filter((d) => typeFilter.includes(d.donation_type))
    }

    return result
  }, [partnerFilteredDonations, statusFilter, typeFilter])

  // 상태별 분류 (파트너 필터 적용된 데이터 기준)
  const pendingDonations = useMemo(
    () => partnerFilteredDonations.filter((d) => d.status === 'pending'),
    [partnerFilteredDonations]
  )

  // 수락된 미션 (진행 중인 미션)
  const acceptedMissions = useMemo(
    () =>
      partnerFilteredDonations.filter(
        (d) => d.donation_type === 'mission' && d.status === 'accepted'
      ),
    [partnerFilteredDonations]
  )

  const completedDonations = useMemo(
    () =>
      partnerFilteredDonations.filter(
        (d) => d.status === 'completed' || d.status === 'success'
      ),
    [partnerFilteredDonations]
  )

  const skippedDonations = useMemo(
    () =>
      partnerFilteredDonations.filter(
        (d) =>
          d.status === 'skipped' ||
          d.status === 'rejected' ||
          d.status === 'failed'
      ),
    [partnerFilteredDonations]
  )

  // 통계 (파트너 필터 적용된 데이터 기준)
  const stats = useMemo(() => {
    return {
      totalAmount: partnerFilteredDonations.reduce((sum, d) => sum + d.amount, 0),
      totalCount: partnerFilteredDonations.length,
      pendingCount: partnerFilteredDonations.filter((d) => d.status === 'pending')
        .length,
      acceptedMissionCount: partnerFilteredDonations.filter(
        (d) => d.donation_type === 'mission' && d.status === 'accepted'
      ).length,
      completedCount: partnerFilteredDonations.filter(
        (d) => d.status === 'completed' || d.status === 'success'
      ).length,
      skippedCount: partnerFilteredDonations.filter(
        (d) =>
          d.status === 'skipped' ||
          d.status === 'rejected' ||
          d.status === 'failed'
      ).length,
      uniqueDonorCount: new Set(partnerFilteredDonations.map((d) => d.donor_id))
        .size,
    }
  }, [partnerFilteredDonations])

  // 쿼리 무효화 헬퍼
  const invalidateQueries = useCallback(async () => {
    await query.refetch()
    queryClient.invalidateQueries({
      queryKey: ['today-donations', roomId],
    })
    queryClient.invalidateQueries({
      queryKey: ['mission-list', roomId],
    })
  }, [roomId, queryClient, query])

  // 도네이션 상태 업데이트
  const updateDonationStatus = useCallback(
    async (donationId: number, status: DonationStatus): Promise<boolean> => {
      try {
        const isFinished = [
          'completed',
          'skipped',
          'success',
          'failed',
          'rejected',
        ].includes(status)

        const { error } = await streamDonationsTable()
          .update({
            status,
            processed_at: isFinished ? new Date().toISOString() : null,
          })
          .eq('id', donationId)

        if (error) {
          console.warn(
            '도네이션 상태 업데이트 (마이그레이션 필요):',
            error.message
          )
        }

        await invalidateQueries()
        return true
      } catch (error) {
        console.error('도네이션 상태 업데이트 에러:', error)
        return false
      }
    },
    [invalidateQueries]
  )

  // 미션 수락
  const acceptMission = useCallback(
    async (donationId: number): Promise<MissionProcessResult> => {
      try {
        console.log('🎯 [useDonationQueue] acceptMission 호출:', { donationId })
        
        // RPC 함수 호출
        const { data: result, error: rpcError } = await supabase.rpc(
          'process_mission_accept',
          { p_donation_id: donationId }
        )

        if (rpcError) {
          console.error('🎯 [useDonationQueue] acceptMission RPC 에러:', rpcError)
          return {
            success: false,
            donationId,
            action: 'accept',
            errorCode: rpcError.code || 'RPC_ERROR',
            errorMessage: rpcError.message || '미션 수락 처리에 실패했습니다.',
          }
        }

        if (!result || !result.success) {
          return {
            success: false,
            donationId,
            action: 'accept',
            errorCode: result?.error_code || 'UNKNOWN_ERROR',
            errorMessage: result?.error_message || '미션 수락 처리에 실패했습니다.',
          }
        }

        // 쿼리 무효화 및 강제 리패치
        await invalidateQueries()
        setRealtimeKey((prev) => prev + 1)
        await query.refetch()
        queryClient.invalidateQueries({ queryKey: ['member-points'] })
        queryClient.invalidateQueries({ queryKey: ['user'] })
        
        return {
          success: true,
          donationId,
          action: 'accept',
        }
      } catch (error) {
        console.error('미션 수락 에러:', error)
        return {
          success: false,
          donationId,
          action: 'accept',
          errorCode: 'UNKNOWN_ERROR',
          errorMessage:
            error instanceof Error ? error.message : '알 수 없는 오류',
        }
      }
    },
    [invalidateQueries, query, setRealtimeKey, queryClient]
  )

  // 미션 거절 (환불 포함)
  const rejectMission = useCallback(
    async (donationId: number): Promise<MissionProcessResult> => {
      try {
        // RPC 함수 호출
        const { data: result, error: rpcError } = await supabase.rpc(
          'process_mission_refund',
          {
            p_donation_id: donationId,
            p_reason: '미션 거절',
          }
        )

        if (rpcError) {
          console.error('미션 거절 RPC 에러:', rpcError)
          return {
            success: false,
            donationId,
            action: 'reject',
            errorCode: rpcError.code || 'RPC_ERROR',
            errorMessage: rpcError.message || '미션 거절 처리에 실패했습니다.',
          }
        }

        if (!result || !result.success) {
          return {
            success: false,
            donationId,
            action: 'reject',
            errorCode: result?.error_code || 'UNKNOWN_ERROR',
            errorMessage: result?.error_message || '미션 거절 처리에 실패했습니다.',
          }
        }

        await invalidateQueries()
        setRealtimeKey((prev) => prev + 1)
        await query.refetch()
        queryClient.invalidateQueries({ queryKey: ['member-points'] })
        queryClient.invalidateQueries({ queryKey: ['user'] })

        return {
          success: true,
          donationId,
          action: 'reject',
          refunded: true,
          refundAmount: result.refund_amount || 0,
        }
      } catch (error) {
        console.error('미션 거절 에러:', error)
        return {
          success: false,
          donationId,
          action: 'reject',
          errorCode: 'UNKNOWN_ERROR',
          errorMessage:
            error instanceof Error ? error.message : '알 수 없는 오류',
        }
      }
    },
    [invalidateQueries, queryClient, query, setRealtimeKey]
  )

  // 미션 성공
  const completeMissionSuccess = useCallback(
    async (donationId: number): Promise<MissionProcessResult> => {
      try {
        // RPC 함수 호출
        const { data: result, error: rpcError } = await supabase.rpc(
          'process_mission_success',
          { p_donation_id: donationId }
        )

        if (rpcError) {
          console.error('미션 성공 RPC 에러:', rpcError)
          return {
            success: false,
            donationId,
            action: 'success',
            errorCode: rpcError.code || 'RPC_ERROR',
            errorMessage: rpcError.message || '미션 성공 처리에 실패했습니다.',
          }
        }

        if (!result || !result.success) {
          return {
            success: false,
            donationId,
            action: 'success',
            errorCode: result?.error_code || 'UNKNOWN_ERROR',
            errorMessage: result?.error_message || '미션 성공 처리에 실패했습니다.',
          }
        }

        await invalidateQueries()
        setRealtimeKey((prev) => prev + 1)
        await query.refetch()
        queryClient.invalidateQueries({ queryKey: ['member-points'] })
        queryClient.invalidateQueries({ queryKey: ['user'] })

        return {
          success: true,
          donationId,
          action: 'success',
        }
      } catch (error) {
        console.error('미션 성공 처리 에러:', error)
        return {
          success: false,
          donationId,
          action: 'success',
          errorCode: 'UNKNOWN_ERROR',
          errorMessage:
            error instanceof Error ? error.message : '알 수 없는 오류',
        }
      }
    },
    [invalidateQueries, query, setRealtimeKey, queryClient]
  )

  // 미션 실패
  const completeMissionFailed = useCallback(
    async (donationId: number): Promise<MissionProcessResult> => {
      try {
        // RPC 함수 호출
        const { data: result, error: rpcError } = await supabase.rpc(
          'process_mission_failure',
          { p_donation_id: donationId }
        )

        if (rpcError) {
          console.error('미션 실패 RPC 에러:', rpcError)
          return {
            success: false,
            donationId,
            action: 'fail',
            errorCode: rpcError.code || 'RPC_ERROR',
            errorMessage: rpcError.message || '미션 실패 처리에 실패했습니다.',
          }
        }

        if (!result || !result.success) {
          return {
            success: false,
            donationId,
            action: 'fail',
            errorCode: result?.error_code || 'UNKNOWN_ERROR',
            errorMessage: result?.error_message || '미션 실패 처리에 실패했습니다.',
          }
        }

        await invalidateQueries()
        setRealtimeKey((prev) => prev + 1)
        await query.refetch()
        queryClient.invalidateQueries({ queryKey: ['member-points'] })
        queryClient.invalidateQueries({ queryKey: ['user'] })

        return {
          success: true,
          donationId,
          action: 'fail',
          fee: result.fee,
          refundAmount: result.refund_amount,
        }
      } catch (error) {
        console.error('미션 실패 처리 에러:', error)
        return {
          success: false,
          donationId,
          action: 'fail',
          errorCode: 'UNKNOWN_ERROR',
          errorMessage:
            error instanceof Error ? error.message : '알 수 없는 오류',
        }
      }
    },
    [invalidateQueries, query, setRealtimeKey, queryClient]
  )

  return {
    donations: filteredDonations,
    pendingDonations,
    acceptedMissions,
    completedDonations,
    skippedDonations,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    updateDonationStatus,
    acceptMission,
    rejectMission,
    completeMissionSuccess,
    completeMissionFailed,
    stats,
  }
}
