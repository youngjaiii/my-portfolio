import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/useAuthStore'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useCallback, useEffect, useRef } from 'react'
import { useTimesheetRole } from './useTimesheetRole'

export interface UseTimesheetRealtimeOptions {
  // 데이터 변경 시 호출되는 콜백 (Supabase Realtime 페이로드 전달)
  onRequestChange?: (payload: any) => void
  onRecordChange?: (payload: any) => void
  // 매니저가 관리하는 가게 ID 목록 (매니저/어드민용)
  assignedStoreIds?: string[]
}

/**
 * Timesheet 관련 테이블의 실시간 변경을 구독하는 훅
 * - 파트너+: 본인의 요청/기록 변경 감지
 * - 매니저: 담당 가게의 요청/기록 변경 감지
 * - 어드민: 모든 요청/기록 변경 감지
 */
export function useTimesheetRealtime({
  onRequestChange,
  onRecordChange,
  assignedStoreIds,
}: UseTimesheetRealtimeOptions) {
  const { user } = useAuthStore()
  const { role, isAdmin, isPartnerManager, isPartnerPlus } = useTimesheetRole()
  const channelRef = useRef<RealtimeChannel | null>(null)

  // 콜백을 ref로 관리하여 불필요한 재구독 방지
  const onRequestChangeRef = useRef(onRequestChange)
  const onRecordChangeRef = useRef(onRecordChange)

  useEffect(() => {
    onRequestChangeRef.current = onRequestChange
    onRecordChangeRef.current = onRecordChange
  }, [onRequestChange, onRecordChange])

  // 요청 변경 핸들러
  const handleRequestChange = useCallback((payload: any) => {
    console.log('📡 [Timesheet Realtime] 요청 변경 감지:', payload.eventType)
    onRequestChangeRef.current?.(payload)
  }, [])

  // 기록 변경 핸들러
  const handleRecordChange = useCallback((payload: any) => {
    console.log('📡 [Timesheet Realtime] 기록 변경 감지:', payload.eventType)
    onRecordChangeRef.current?.(payload)
  }, [])

  useEffect(() => {
    if (!user?.id || !role) return

    let retryCount = 0
    const maxRetries = 5
    let timeoutId: NodeJS.Timeout

    const setupSubscription = () => {
      // 기존 채널 정리
      if (channelRef.current) {
        channelRef.current.unsubscribe()
      }

      const channelName = `timesheet-realtime-${user.id}-${Date.now()}`
      const channel = supabase.channel(channelName)

      // 파트너+: 본인의 요청 변경 감지
      if (isPartnerPlus) {
        channel.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'timesheet_attendance_requests',
            filter: `partner_plus_id=eq.${user.id}`,
          },
          handleRequestChange
        )

        channel.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'timesheet_attendance_records',
            filter: `partner_plus_id=eq.${user.id}`,
          },
          handleRecordChange
        )
      }

      // 매니저: 담당 가게의 요청/기록 변경 감지 (최적화: in 필터 사용)
      if (isPartnerManager && assignedStoreIds && assignedStoreIds.length > 0) {
        const storeFilter = `store_id=in.(${assignedStoreIds.join(',')})`
        
        channel.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'timesheet_attendance_requests',
            filter: storeFilter,
          },
          handleRequestChange
        )

        channel.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'timesheet_attendance_records',
            filter: storeFilter,
          },
          handleRecordChange
        )
      }

      // 어드민: 모든 요청/기록 변경 감지
      if (isAdmin) {
        channel.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'timesheet_attendance_requests',
          },
          handleRequestChange
        )

        channel.on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'timesheet_attendance_records',
          },
          handleRecordChange
        )
      }

      // 구독 및 재연결 로직
      channel.subscribe((status, err) => {
        console.log(`📡 [Timesheet Realtime] 구독 상태: ${status}`, err || '')
        
        if (status === 'SUBSCRIBED') {
          retryCount = 0 // 성공 시 카운트 초기화
        }

        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          if (retryCount < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, retryCount), 30000)
            console.log(`📡 [Timesheet Realtime] ${delay}ms 후 재연결 시도... (시도 ${retryCount + 1}/${maxRetries})`)
            timeoutId = setTimeout(() => {
              retryCount++
              setupSubscription()
            }, delay)
          } else {
            console.error('📡 [Timesheet Realtime] 최대 재연결 시도 횟수 초과')
          }
        }
      })

      channelRef.current = channel
    }

    setupSubscription()

    // 클린업
    return () => {
      console.log('📡 [Timesheet Realtime] 클린업')
      if (timeoutId) clearTimeout(timeoutId)
      if (channelRef.current) {
        channelRef.current.unsubscribe()
        channelRef.current = null
      }
    }
  }, [user?.id, role, isAdmin, isPartnerManager, isPartnerPlus, assignedStoreIds, handleRequestChange, handleRecordChange])

  return {
    isSubscribed: !!channelRef.current,
  }
}

