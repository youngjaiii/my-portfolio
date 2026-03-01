import { useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { LoadingSpinner } from '@/components'
import { supabase } from '@/lib/supabase'
import { Capacitor } from '@capacitor/core'
import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/store/useAuthStore'

export const Route = createFileRoute('/' as const)({
  component: RootRedirect,
})

function RootRedirect() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading } = useAuth()
  const isNative = Capacitor.isNativePlatform()

  useEffect(() => {
    let isMounted = true
    let hasNavigated = false

    const finalizeNavigation = async () => {
      // 이미 리다이렉트했으면 스킵
      if (hasNavigated) {
        console.log('⏭️ index.tsx: 이미 리다이렉트됨, 스킵')
        return
      }

      try {
        // 해시 파라미터에 포함된 OAuth 세션 처리를 마무리하도록 보장
        // 네이티브 환경에서는 더 긴 대기 시간 필요
        if (isNative) {
          await new Promise(resolve => setTimeout(resolve, 1500))
        }
        
        // 세션 확인 (여러 번 시도)
        let session = null
        let retries = isNative ? 3 : 1
        
        while (retries > 0 && !session) {
          const { data: { session: currentSession }, error } = await supabase.auth.getSession()
          
          if (!error && currentSession) {
            session = currentSession
            break
          }
          
          retries--
          if (retries > 0) {
            await new Promise(resolve => setTimeout(resolve, 500))
          }
        }
        
        // 세션이 있으면 인증 상태 확인
        if (session) {
          // 인증 상태가 업데이트될 때까지 대기
          let authCheckRetries = 5
          while (authCheckRetries > 0) {
            const currentAuth = useAuthStore.getState().isAuthenticated
            if (currentAuth) {
              break
            }
            await new Promise(resolve => setTimeout(resolve, 300))
            authCheckRetries--
          }
        }
      } catch (error) {
        console.error('루트 리다이렉트 세션 확인 실패:', error)
      } finally {
        if (isMounted && !hasNavigated) {
          // 최종 인증 상태 확인
          const finalAuthState = useAuthStore.getState().isAuthenticated
          
          console.log('📍 index.tsx finalizeNavigation:', {
            isNative,
            isLoading,
            finalAuthState,
            currentPath: window.location.pathname
          })
          
          hasNavigated = true
          
          // 네이티브 환경에서 auth가 없으면 로그인 화면으로 이동
          if (isNative && !isLoading && !finalAuthState) {
            console.log('🚀 index.tsx: /login으로 리다이렉트')
            navigate({ to: '/login', replace: true })
          } else if (finalAuthState) {
            // 인증된 상태면 피드로 이동
            console.log('🚀 index.tsx: /feed/all로 리다이렉트 (인증됨)')
            navigate({ to: '/feed/all', replace: true })
          } else {
            // 세션이 없으면 로그인으로
            console.log('🚀 index.tsx: /login으로 리다이렉트 (세션 없음)')
            navigate({ to: '/login', replace: true })
          }
        }
      }
    }

    // Supabase가 URL 해시를 처리할 수 있도록 렌더 후에 실행
    const timer = window.setTimeout(() => {
      finalizeNavigation()
    }, isNative ? 1500 : 0)

    return () => {
      isMounted = false
      window.clearTimeout(timer)
    }
  }, [navigate, isNative, isAuthenticated, isLoading])

  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <LoadingSpinner />
    </div>
  )
}
