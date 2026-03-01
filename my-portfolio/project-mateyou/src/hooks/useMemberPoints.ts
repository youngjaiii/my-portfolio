import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Database } from '@/types/database'
import { mateYouApi } from '@/lib/apiClient'
import { supabase } from '@/lib/supabase'

type MemberPointsLog = Database['public']['Tables']['member_points_logs']['Row']

interface MemberPointsData {
  totalPoints: number
  pointsHistory: Array<MemberPointsLog>
  isLoading: boolean
  error: string | null
  addPointsLog: (
    type: 'earn' | 'spend' | 'withdraw',
    amount: number,
    description: string,
    logId?: string | null,
  ) => Promise<void>
  refetch: () => void
}

export function useMemberPoints(userId: string): MemberPointsData {
  const queryClient = useQueryClient()

  // 멤버 데이터 쿼리 (직접 supabase 사용 유지 - 기본 정보)
  const {
    data: memberData,
    isLoading: isMemberLoading,
    error: memberError,
  } = useQuery({
    queryKey: ['member-points', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('members')
        .select('*')
        .eq('id', userId)
        .maybeSingle()

      if (error) {
        console.error('Failed to fetch member data:', error)
        return { total_points: 0 }
      }
      if (!data) {
        return { total_points: 0 }
      }
      return data
    },
    enabled: !!userId,
    staleTime: 1000 * 30, // 30초
  })

  // 포인트 히스토리 쿼리
  const {
    data: pointsHistoryResponse,
    isLoading: isHistoryLoading,
    error: historyError,
    refetch,
  } = useQuery({
    queryKey: ['member-points-history', userId],
    queryFn: async () => {
      try {
        const response = await mateYouApi.members.getPointsHistory({ limit: 50 })
        
        // 응답 형식 처리
        let logs: any[] = []
        if (response.data.success && response.data.data) {
          logs = Array.isArray(response.data.data) ? response.data.data : (response.data.data.logs || [])
        } else if (Array.isArray(response.data)) {
          logs = response.data
        } else if (response.data.logs) {
          logs = response.data.logs
        } else if (response.data.error) {
          throw new Error(response.data.error.message || 'Failed to fetch points history')
        }
        
        return logs
      } catch (error) {
        console.error('Failed to fetch points history:', error)
        return []
      }
    },
    enabled: !!userId,
    staleTime: 1000 * 30, // 30초
  })

  const pointsHistory = pointsHistoryResponse || []

  // 포인트 로그 추가 mutation
  const addPointsLogMutation = useMutation({
    mutationFn: async ({
      type,
      amount,
      description,
      logId,
    }: {
      type: 'earn' | 'spend' | 'withdraw'
      amount: number
      description: string
      logId?: string | null
    }) => {
      try {
        const response = await mateYouApi.members.addPointsLog({
          type,
          amount,
          description,
          log_id: logId || undefined,
        })

        if (!response.data.success) {
          throw new Error(response.data.error?.message || 'Failed to add points log')
        }

        // 응답 형식 처리
        const data = response.data.data || response.data
        return {
          log: data.log || data,
          newTotal: data.newTotalPoints || data.newTotal || data.total_points || 0
        }
      } catch (error) {
        console.error('Failed to add points log:', error)
        throw error
      }
    },
    onSuccess: (result) => {
      // useUser 캐시 직접 업데이트
      queryClient.setQueryData(['user'], (oldUser: unknown) => {
        if (!oldUser || typeof oldUser !== 'object') return null
        return { ...oldUser, total_points: result.newTotal }
      })

      // 관련 쿼리들 무효화
      queryClient.invalidateQueries({ queryKey: ['member-points', userId] })
      queryClient.invalidateQueries({
        queryKey: ['member-points-history', userId],
      })
      queryClient.invalidateQueries({ queryKey: ['user'] })
    },
  })

  const addPointsLog = async (
    type: 'earn' | 'spend' | 'withdraw',
    amount: number,
    description: string,
    logId?: string | null,
  ) => {
    await addPointsLogMutation.mutateAsync({ type, amount, description, logId })
  }

  // 총 포인트 - 멤버 테이블의 total_points 사용 (fallback으로 계산된 값 사용)
  const totalPoints =
    memberData?.total_points ??
    pointsHistory.reduce((total, log) => {
      switch (log.type) {
        case 'earn':
          return total + log.amount
        case 'spend':
        case 'withdraw':
          return total - log.amount
        default:
          return total
      }
    }, 0)

  const isLoading = isMemberLoading || isHistoryLoading
  const error =
    memberError || historyError
      ? memberError instanceof Error
        ? memberError.message
        : historyError instanceof Error
          ? historyError.message
          : 'Unknown error'
      : null

  return {
    totalPoints,
    pointsHistory,
    isLoading,
    error,
    addPointsLog,
    refetch,
  }
}
