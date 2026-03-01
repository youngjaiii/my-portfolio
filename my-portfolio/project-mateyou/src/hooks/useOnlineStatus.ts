import { useEffect } from 'react'
import { useAuthStore } from '@/store/useAuthStore'
import { supabase } from '@/lib/supabase'

/**
 * 사용자의 온라인 상태를 자동으로 관리하는 훅
 * - 브라우저 창 닫힘/새로고침 시 offline으로 설정
 */
export function useOnlineStatus() {
  const user = useAuthStore((state) => state.user)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)

  useEffect(() => {
    if (!user?.id || !isAuthenticated) return

    // 로그인 시 온라인 상태로 설정 (주석 처리)
    // const setOnline = async () => {
    //   try {
    //     await supabase
    //       .from('members')
    //       .update({ current_status: 'online' })
    //       .eq('id', user.id)
    //   } catch (error) {
    //     console.error('온라인 상태 설정 실패:', error)
    //   }
    // }
    // setOnline()

    // 브라우저 창 닫힘/새로고침 감지 (주석 처리)
    // const handleBeforeUnload = async () => {
    //   try {
    //     // sendBeacon API를 사용하여 비동기적으로 오프라인 상태 전송
    //     // 브라우저가 닫히는 순간에도 요청이 전송되도록 보장
    //     const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/members?id=eq.${user.id}`
    //     const body = JSON.stringify({ current_status: 'offline' })

    //     const headers = {
    //       'Content-Type': 'application/json',
    //       'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    //       'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    //       'Prefer': 'return=minimal'
    //     }

    //     // sendBeacon은 POST만 지원하므로 fetch API 사용
    //     // keepalive 옵션으로 페이지가 unload되어도 요청 완료 보장
    //     fetch(url, {
    //       method: 'PATCH',
    //       headers,
    //       body,
    //       keepalive: true, // 중요: 페이지 unload 후에도 요청 유지
    //     }).catch((error) => {
    //       console.error('오프라인 상태 설정 실패:', error)
    //     })
    //   } catch (error) {
    //     console.error('beforeunload 처리 실패:', error)
    //   }
    // }

    // visibilitychange 이벤트로 탭 숨김 감지 (주석 처리)
    // const handleVisibilityChange = async () => {
    //   if (document.visibilityState === 'hidden') {
    //     // 탭이 숨겨질 때 (다른 탭으로 이동, 최소화 등)
    //     try {
    //       await supabase
    //         .from('members')
    //         .update({ current_status: 'offline' })
    //         .eq('id', user.id)
    //     } catch (error) {
    //       console.error('오프라인 상태 설정 실패:', error)
    //     }
    //   } else if (document.visibilityState === 'visible') {
    //     // 탭이 다시 보일 때
    //     try {
    //       await supabase
    //         .from('members')
    //         .update({ current_status: 'online' })
    //         .eq('id', user.id)
    //     } catch (error) {
    //       console.error('온라인 상태 설정 실패:', error)
    //     }
    //   }
    // }

    // 이벤트 리스너 등록 (주석 처리)
    // window.addEventListener('beforeunload', handleBeforeUnload)
    // document.addEventListener('visibilitychange', handleVisibilityChange)

    // 클린업 (주석 처리)
    // return () => {
    //   window.removeEventListener('beforeunload', handleBeforeUnload)
    //   document.removeEventListener('visibilitychange', handleVisibilityChange)
    // }
  }, [user?.id, isAuthenticated])
}
