import {
  createRootRouteWithContext,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'
import { useEffect, useRef, useState, useCallback } from 'react'

import { GlobalRealtimeProvider } from '@/contexts/GlobalRealtimeProvider'
import { GlobalVideoCallProvider } from '@/contexts/GlobalVideoCallProvider'
import { GlobalVoiceCallProvider } from '@/contexts/GlobalVoiceCallProvider'
import { LiveKitVoiceCallProvider } from '@/contexts/LiveKitVoiceCallProvider'
import { VideoRoomProvider } from '@/contexts/VideoRoomProvider'
import { VoiceRoomProvider } from '@/contexts/VoiceRoomProvider'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import type { QueryClient } from '@tanstack/react-query'

import { LoadingSpinner, NotificationPermissionBanner } from '@/components'
import { GlobalDonationSheet } from '@/components/features/GlobalDonationSheet'
import { GlobalRankingSheet } from '@/components/features/GlobalRankingSheet'
import { LiveKitIncomingCallModal } from '@/components/features/LiveKitIncomingCallModal'
import { MiniCallUI } from '@/components/features/MiniCallUI'
import {
  ResponsiveDesktopNavRail,
  ResponsiveMainContent,
  ResponsiveMobileTabBar,
  ResponsiveNavigation,
} from '@/components/layouts'
import { saveMembershipNotificationData } from '@/components/modals'
import { GlobalVideoCallUI } from '@/components/ui/GlobalVideoCallUI'
import { GlobalVoiceCallUI } from '@/components/ui/GlobalVoiceCallUI'
import { IncomingCallModal } from '@/components/ui/IncomingCallModal'
import { IncomingVideoCallModal } from '@/components/ui/IncomingVideoCallModal'
import { MobileRequestBanner } from '@/components/ui/MobileRequestBanner'
import { Toaster } from '@/components/ui/sonner'
import { VideoRoomMiniPlayer } from '@/components/ui/VideoRoomMiniPlayer'
import { VoiceRoomMiniPlayer } from '@/components/ui/VoiceRoomMiniPlayer'
import { useAppVersionCheck } from '@/hooks/useAppVersionCheck'
import { requestInitialPermissions, useInitialPermissions } from '@/hooks/useInitialPermissions'
import { useMobileViewport } from '@/hooks/useMobileViewport'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { usePushNotification } from '@/hooks/usePushNotification'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/useAuthStore'
import { consumePendingTransitionIntent, peekPendingTransitionIntent } from '@/utils/navigationTransition'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { SplashScreen } from '@capacitor/splash-screen'

// 전역 플래그: 이미 처리된 OAuth URL 추적 (앱 전체에서 한 번만 처리)
let processedOAuthUrl: string | null = null

// TanStack Devtools

interface MyRouterContext {
  queryClient: QueryClient
}

function RootComponent() {
  return (
    <AuthProvider>
      <GlobalRealtimeProvider>
        <GlobalVoiceCallProvider>
          <GlobalVideoCallProvider>
            <LiveKitVoiceCallProvider>
              <VoiceRoomProvider>
                <VideoRoomProvider>
                  <AppContent />
                </VideoRoomProvider>
              </VoiceRoomProvider>
            </LiveKitVoiceCallProvider>
          </GlobalVideoCallProvider>
        </GlobalVoiceCallProvider>
      </GlobalRealtimeProvider>
    </AuthProvider>
  )
}

function AppContent() {
  const { isAuthenticated, isLoading, initialize, user } = useAuth()
  const isNative = Capacitor.isNativePlatform()
  const router = useRouter()
  const location = useRouterState({
    select: (state) => state.location,
  })
  const { registerPushSubscription, requestPermission: requestNotificationPermission } = usePushNotification()
  
  // 모바일 뷰포트 높이 및 키보드 감지 (CSS 변수로 자동 설정)
  // 웹에서 iOS Safari 100vh 문제 및 가상 키보드 대응
  useMobileViewport()
  
  // 앱 버전 체크 (네이티브 앱만)
  const { needsUpdate, versionInfo, currentVersion } = useAppVersionCheck()
  
  const currentPath = location.pathname
  const searchString = location.search || ''
  const searchParams = new URLSearchParams(searchString)
  const [transitionDirection, setTransitionDirection] = useState(1)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const previousIndexRef = useRef<number>(
    typeof window === 'undefined' ? 0 : window.history.state?.idx ?? 0,
  )
  const pendingNavigateRef = useRef<ReturnType<typeof consumePendingTransitionIntent>>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const locationRef = useRef(location.pathname)
  const hasRedirectedRef = useRef(false)
  
  // location.pathname 변경 시 ref 업데이트 (useEffect 내부에서 최신 값 참조용)
  useEffect(() => {
    locationRef.current = location.pathname
    // 경로가 변경되면 리다이렉트 플래그 초기화
    hasRedirectedRef.current = false
  }, [location.pathname])

  // 네이티브 앱에서 최상위 스크롤 방지 (네이티브는 항상 모바일)
  useEffect(() => {
    if (isNative) {
      // html과 body 스크롤 방지
      document.documentElement.style.overflow = 'hidden'
      document.documentElement.style.height = '100%'
      document.documentElement.style.position = 'fixed'
      document.documentElement.style.width = '100%'
      document.body.style.overflow = 'hidden'
      document.body.style.height = '100%'
      document.body.style.position = 'fixed'
      document.body.style.width = '100%'
      
      return () => {
        document.documentElement.style.overflow = ''
        document.documentElement.style.height = ''
        document.documentElement.style.position = ''
        document.documentElement.style.width = ''
        document.body.style.overflow = ''
        document.body.style.height = ''
        document.body.style.position = ''
        document.body.style.width = ''
      }
    }
  }, [isNative])

  // 네이티브 앱에서 키보드 resize 모드 설정
  useEffect(() => {
    if (!isNative) return
    
    const setupKeyboard = async () => {
      try {
        const { Keyboard, KeyboardResize } = await import('@capacitor/keyboard')
        // Body resize 모드: 키보드가 나타나면 body 높이가 줄어들어 input이 자동으로 보임
        await Keyboard.setResizeMode({ mode: KeyboardResize.Body })
        console.log('✅ Keyboard resize mode set to Body')
      } catch (error) {
        console.warn('Keyboard plugin setup failed:', error)
      }
    }
    
    setupKeyboard()
  }, [isNative])

  // 전역 우클릭 방지
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault()
      return false
    }
    
    document.addEventListener('contextmenu', handleContextMenu)
    
    return () => {
      document.removeEventListener('contextmenu', handleContextMenu)
    }
  }, [])

  // 서비스 워커로부터 멤버십 알림 수신
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    const handleServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === 'MEMBERSHIP_NOTIFICATION') {
        const payload = event.data.payload
        console.log('📬 멤버십 알림 수신 (서비스 워커):', payload)
        
        // 멤버십 알림 저장 (개별 알림을 해당 카테고리에 추가)
        const notificationType = payload.type
        const membershipName = payload.membershipName || '멤버십'
        
        if (notificationType === 'membership_renewed') {
          saveMembershipNotificationData({
            renewed: [{
              subscription_id: `push-${Date.now()}`,
              user_id: '',
              user_name: '',
              membership_id: '',
              membership_name: membershipName,
              price: payload.price || 0,
              new_expired_at: '',
            }],
            renewal_failed: [],
            expiry_notified: [],
            errors: [],
          })
        } else if (notificationType === 'membership_renewal_failed') {
          saveMembershipNotificationData({
            renewed: [],
            renewal_failed: [{
              subscription_id: `push-${Date.now()}`,
              membership_name: membershipName,
              reason: payload.body || '포인트 부족',
            }],
            expiry_notified: [],
            errors: [],
          })
        } else if (notificationType === 'membership_expiry_reminder') {
          saveMembershipNotificationData({
            renewed: [],
            renewal_failed: [],
            expiry_notified: [{
              subscription_id: `push-${Date.now()}`,
              membership_name: membershipName,
              expired_at: '',
            }],
            errors: [],
          })
        }
      }
    }

    navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage)

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage)
    }
  }, [])

  useEffect(() => {
    const pendingIntent = consumePendingTransitionIntent()
    if (pendingIntent && pendingIntent.path !== location.pathname) {
      pendingNavigateRef.current = pendingIntent
      setTransitionDirection(pendingIntent.direction)
      setIsTransitioning(true)
      return
    }

    const currentIdx =
      typeof window === 'undefined' ? previousIndexRef.current : window.history.state?.idx ?? 0

    if (typeof window !== 'undefined') {
      const peekedIntent = peekPendingTransitionIntent()
      if (peekedIntent) {
        setTransitionDirection((prev) => {
          if (prev !== peekedIntent.direction) {
            return peekedIntent.direction
          }
          return prev
        })
      } else {
        const direction = currentIdx >= previousIndexRef.current ? 1 : -1
        setTransitionDirection((prev) => {
          if (prev !== direction) {
            return direction
          }
          return prev
        })
      }
    }

    previousIndexRef.current = currentIdx
    setIsTransitioning(false)
  }, [location.pathname, location.search])

  // 라우터 이동 시 스크롤 초기화
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0
    }
    // 모든 스크롤 가능한 컨테이너 초기화
    if (typeof window !== 'undefined') {
      const scrollableContainers = document.querySelectorAll('[class*="overflow-y-auto"], [class*="overflow-auto"]')
      scrollableContainers.forEach((container) => {
        if (container instanceof HTMLElement) {
          container.scrollTop = 0
        }
      })
    }
  }, [currentPath])

  const pageKey = `${location.pathname}${location.search}`

  // 온라인 상태 자동 관리 (로그인/로그아웃, 브라우저 창 닫힘 감지)
  useOnlineStatus()

  // Auth 초기화 및 네이티브 스플래시 처리
  useEffect(() => {
    const isNative = Capacitor.isNativePlatform()
    
    const initApp = async () => {
      // Auth 초기화
      await initialize()
      
      // 네이티브 환경에서만 스플래시 처리
      if (isNative) {
        // Auth 초기화 완료 후 스플래시 숨기기
        // auth가 없으면 로그인 화면으로 이동 (아래 useEffect에서 처리)
        await SplashScreen.hide().catch(() => {
          // 스플래시가 이미 숨겨졌거나 에러 발생 시 무시
        })
      }
    }
    
    initApp()
  }, [initialize])
  
  // 스플래시 후 최초 1번 카메라/알림 권한 획득
  useInitialPermissions()

  // 네이티브 앱 Deep Link 처리 (OAuth 리다이렉트)
  useEffect(() => {
    const isNative = Capacitor.isNativePlatform()
    if (!isNative) return

    // 처리 중복 방지 플래그
    let isProcessingOAuth = false

    // 앱 시작 시 URL 해시 및 전체 URL 확인 (이미 리다이렉트된 경우)
    const checkInitialUrl = async () => {
      // 이미 처리 중이면 무시
      if (isProcessingOAuth) {
        console.log('⏭️ OAuth 처리 중, 중복 호출 무시')
        return
      }
      
      isProcessingOAuth = true
      console.log('🔍 초기 URL 확인:', JSON.stringify({
        href: window.location.href,
        hash: window.location.hash ? window.location.hash.substring(0, 100) + '...' : '',
        search: window.location.search,
        pathname: window.location.pathname
      }))
      
      // 해시에 access_token이 있는 경우
      if (window.location.hash && window.location.hash.includes('access_token')) {
        console.log('🔗 초기 URL 해시 발견:', window.location.hash.substring(0, 100) + '...')
        
        // 해시에서 직접 토큰 추출하여 Supabase에 설정
        try {
          const hashParams = new URLSearchParams(window.location.hash.substring(1))
          const accessToken = hashParams.get('access_token')
          const refreshToken = hashParams.get('refresh_token')
          
          if (accessToken) {
            console.log('🔑 해시에서 토큰 추출 성공, Supabase 세션 설정 시도...')
            
            // 해시 제거 (무한 루프 방지) - 먼저 제거
            window.history.replaceState(null, '', window.location.pathname + window.location.search)
            console.log('🧹 해시 제거 완료 (setSession 전)')
            
            // Supabase에 직접 세션 설정
            const { data: { session: setSession }, error: setError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken || '',
            })
            
            console.log('📋 setSession 결과:', {
              hasSession: !!setSession,
              hasError: !!setError,
              error: setError?.message || null,
              userId: setSession?.user?.id || null
            })
            
            if (setError) {
              console.error('❌ 세션 설정 실패:', setError)
            } else if (setSession) {
              console.log('✅ 세션 설정 성공:', {
                userId: setSession.user?.id,
                email: setSession.user?.email
              })
              
              // 세션 동기화
              await initialize()
              
              // 인증 상태 업데이트 대기
              let authCheckRetries = 10
              while (authCheckRetries > 0) {
                const currentAuth = useAuthStore.getState().isAuthenticated
                if (currentAuth) {
                  console.log('✅ 인증 상태 업데이트 완료, 리다이렉트 중...')
                  if (locationRef.current === '/login') {
                    router.navigate({ to: '/feed/all', replace: true })
                  }
                  return
                }
                await new Promise(resolve => setTimeout(resolve, 300))
                authCheckRetries--
                if (authCheckRetries === 5 || authCheckRetries === 1) {
                  console.log('🔄 initialize 재호출:', authCheckRetries)
                  await initialize()
                }
              }
              
              if (authCheckRetries === 0) {
                console.warn('⚠️ 인증 상태 업데이트 실패, 강제 리다이렉트 시도')
                if (locationRef.current === '/login' || locationRef.current === '/') {
                  router.navigate({ to: '/feed/all', replace: true })
                }
              }
              isProcessingOAuth = false
              return
            }
          }
        } catch (parseError) {
          console.error('❌ 해시 파싱 실패:', parseError)
          isProcessingOAuth = false
        }
        
        console.log('⏳ setSession 실패, 기존 방식으로 재시도...')
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        let session = null
        let retries = 5
        
        while (retries > 0 && !session) {
          const { data: { session: currentSession }, error } = await supabase.auth.getSession()
          
          if (error) {
            console.error('❌ 초기 해시 세션 확인 실패:', error)
            retries--
            if (retries > 0) {
              await new Promise(resolve => setTimeout(resolve, 1000))
            }
            continue
          }
          
          session = currentSession
          if (session) {
            console.log('✅ 초기 해시에서 세션 확인됨:', {
              userId: session.user?.id,
              email: session.user?.email
            })
            break
          }
          
          retries--
          if (retries > 0) {
            console.log(`⏳ 세션 확인 재시도 중... (${retries}회 남음)`)
            await new Promise(resolve => setTimeout(resolve, 1000))
          }
        }
        
        if (session) {
          console.log('✅ 초기 해시에서 세션 확인됨, 동기화 중...')
          await initialize()
          
          let authCheckRetries = 10
          while (authCheckRetries > 0) {
            const currentAuth = useAuthStore.getState().isAuthenticated
            if (currentAuth) {
              console.log('✅ 인증 상태 업데이트 완료, 리다이렉트 중...')
              if (locationRef.current === '/login') {
                router.navigate({ to: '/feed/all', replace: true })
              }
              break
            }
            await new Promise(resolve => setTimeout(resolve, 300))
            authCheckRetries--
            if (authCheckRetries === 5 || authCheckRetries === 1) {
              console.log('🔄 initialize 재호출:', authCheckRetries)
              await initialize()
            }
          }
          
          if (authCheckRetries === 0) {
            console.warn('⚠️ 인증 상태 업데이트 실패, 강제 리다이렉트 시도')
            if (locationRef.current === '/login' || locationRef.current === '/') {
              router.navigate({ to: '/feed/all', replace: true })
            }
          }
        } else {
          console.warn('⚠️ 초기 해시에서 세션을 확인할 수 없습니다')
        }
      }
      
      // 전체 URL에서 access_token 추출 시도 (해시가 없는 경우)
      const fullUrl = window.location.href
      if (fullUrl.includes('access_token') && !window.location.hash.includes('access_token')) {
        console.log('🔗 전체 URL에서 access_token 발견:', fullUrl)
        
        try {
          // URL에서 토큰 추출
          const urlObj = new URL(fullUrl)
          const hash = urlObj.hash
          const searchParams = urlObj.searchParams
          
          if (hash && hash.includes('access_token')) {
            window.location.hash = hash
          } else if (searchParams.has('access_token')) {
            const accessToken = searchParams.get('access_token')
            const refreshToken = searchParams.get('refresh_token')
            const type = searchParams.get('type') || 'bearer'
            window.location.hash = `#access_token=${accessToken}&refresh_token=${refreshToken || ''}&type=${type}`
          }
          
          // Supabase가 해시를 처리할 시간 확보
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          // 세션 확인 및 동기화
          const { data: { session }, error } = await supabase.auth.getSession()
          
          if (session && !error) {
            console.log('✅ URL에서 세션 확인됨, 동기화 중...')
            await initialize()
            
            let authCheckRetries = 10
            while (authCheckRetries > 0) {
              const currentAuth = useAuthStore.getState().isAuthenticated
              if (currentAuth) {
                console.log('✅ 인증 상태 업데이트 완료, 리다이렉트 중...')
                if (locationRef.current === '/login') {
                  router.navigate({ to: '/feed/all', replace: true })
                }
                break
              }
              await new Promise(resolve => setTimeout(resolve, 300))
              authCheckRetries--
              if (authCheckRetries === 5 || authCheckRetries === 1) {
                await initialize()
              }
            }
          }
        } catch (error) {
          console.error('URL 파싱 실패:', error)
        }
      }
      
      isProcessingOAuth = false
    }
    
    // 초기 URL 확인 (약간의 지연 후)
    setTimeout(() => {
      checkInitialUrl()
    }, 500)

    // 앱이 열릴 때 URL 처리 (OAuth 리다이렉트)
    let isHandlingAppUrl = false
    const handleAppUrl = async (event: { url: string }) => {
      // 이미 처리 중이면 무시
      if (isHandlingAppUrl) {
        console.log('⏭️ App URL 처리 중, 중복 호출 무시')
        return
      }
      
      // 이미 처리된 URL이면 무시
      if (processedOAuthUrl === event.url) {
        console.log('⏭️ 이미 처리된 App URL, 무시')
        return
      }
      
      // OAuth 콜백 URL이고 이미 메인 페이지에 있으면 무시
      if (event.url.includes('access_token') && 
          locationRef.current !== '/login' && 
          locationRef.current !== '/') {
        console.log('⏭️ 이미 메인 페이지에 있음, App URL 무시:', locationRef.current)
        processedOAuthUrl = event.url
        return
      }
      
      isHandlingAppUrl = true
      console.log('🔗 Deep Link URL 이벤트:', event.url)
      
      // capacitor://localhost 또는 mateyou://으로 리다이렉트된 경우
      if (event.url.includes('capacitor://localhost') || event.url.includes('mateyou://')) {
        try {
          let hash = ''
          
          // URL에서 해시/토큰 추출 (여러 방식 시도)
          // 1. #access_token 형태 추출
          const hashMatch = event.url.match(/#(.+)$/)
          if (hashMatch) {
            hash = '#' + hashMatch[1]
            console.log('📋 해시에서 토큰 발견:', hash.substring(0, 50) + '...')
          }
          
          // 2. ?access_token 형태 추출 (쿼리 파라미터)
          if (!hash || !hash.includes('access_token')) {
            const tokenMatch = event.url.match(/[?&]access_token=([^&#]+)/)
            const refreshMatch = event.url.match(/[?&]refresh_token=([^&#]+)/)
            if (tokenMatch) {
              const accessToken = tokenMatch[1]
              const refreshToken = refreshMatch ? refreshMatch[1] : ''
              hash = `#access_token=${accessToken}&refresh_token=${refreshToken}&type=bearer`
              console.log('📋 쿼리에서 토큰 발견:', hash.substring(0, 50) + '...')
            }
          }
          
          // 해시에서 토큰 추출하여 Supabase에 설정
          if (hash && hash.includes('access_token')) {
            console.log('🔑 토큰 추출 성공, Supabase 세션 설정 시도...')
            
              const hashParams = new URLSearchParams(hash.substring(1))
              const accessToken = hashParams.get('access_token')
              const refreshToken = hashParams.get('refresh_token')
              
              if (accessToken) {
                // Supabase에 직접 세션 설정
              const { data: { session: newSession }, error: setError } = await supabase.auth.setSession({
                  access_token: accessToken,
                  refresh_token: refreshToken || '',
                })
                
              console.log('📋 setSession 결과:', {
                hasSession: !!newSession,
                  hasError: !!setError,
                  error: setError?.message || null,
                userId: newSession?.user?.id || null
                })
                
                if (setError) {
                  console.error('❌ 세션 설정 실패:', setError)
                isHandlingAppUrl = false
                return
              }
              
              if (newSession) {
                console.log('✅ 세션 설정 성공! 권한 요청 시작...')
                
                // 처리 완료로 표시 (중복 처리 방지)
                processedOAuthUrl = event.url
                  
                  // 세션 동기화
                  await initialize()
                
                // 권한 요청 (카메라, 푸시 알림)
                try {
                  console.log('🔐 카메라/알림 권한 요청 시작...')
                  await requestInitialPermissions({ force: true })
                  console.log('✅ 권한 요청 완료!')
                } catch (permError) {
                  console.error('❌ 권한 요청 실패:', permError)
                }
                  
                  // 인증 상태 업데이트 대기
                  let authCheckRetries = 10
                  while (authCheckRetries > 0) {
                    const currentAuth = useAuthStore.getState().isAuthenticated
                    if (currentAuth) {
                    console.log('✅ 인증 상태 확인됨, 메인 페이지로 이동...')
                        if (locationRef.current === '/login' || locationRef.current === '/') {
                          router.navigate({ to: '/feed/all', replace: true })
                        }
                      isHandlingAppUrl = false
                      return
                    }
                    await new Promise(resolve => setTimeout(resolve, 300))
                    authCheckRetries--
                  if (authCheckRetries === 5) {
                      await initialize()
                    }
                  }
                  
                console.warn('⚠️ 인증 상태 확인 실패, 강제 리다이렉트')
                    if (locationRef.current === '/login' || locationRef.current === '/') {
                      router.navigate({ to: '/feed/all', replace: true })
                    }
                  isHandlingAppUrl = false
                  return
                }
            }
          }
          
          // 토큰이 없는 경우 기존 세션 확인
          console.log('⏳ 토큰 없음, 기존 세션 확인 중...')
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          // 세션 확인 및 동기화 (여러 번 시도)
          let session = null
          let retries = 3
          
          while (retries > 0 && !session) {
            const { data: { session: currentSession }, error } = await supabase.auth.getSession()
            
            if (error) {
              console.error('OAuth 세션 확인 실패:', error)
              retries--
              if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, 500))
              }
              continue
            }
            
            session = currentSession
            if (session) break
            
            retries--
            if (retries > 0) {
              await new Promise(resolve => setTimeout(resolve, 500))
            }
          }
          
          if (session) {
            console.log('✅ OAuth 세션 확인됨, 동기화 중...')
            await initialize()
            
            let authCheckRetries = 10
            while (authCheckRetries > 0) {
              const currentAuth = useAuthStore.getState().isAuthenticated
              if (currentAuth) {
                console.log('✅ 인증 상태 업데이트 완료, 리다이렉트 중...')
                if (locationRef.current === '/login') {
                  router.navigate({ to: '/feed/all', replace: true })
                }
                break
              }
              await new Promise(resolve => setTimeout(resolve, 300))
              authCheckRetries--
              if (authCheckRetries === 5 || authCheckRetries === 1) {
                await initialize()
              }
            }
            
            if (authCheckRetries === 0) {
              console.warn('⚠️ 인증 상태 업데이트 실패, 강제 리다이렉트 시도')
              if (locationRef.current === '/login' || locationRef.current === '/') {
                router.navigate({ to: '/feed/all', replace: true })
              }
            }
          } else {
            console.warn('⚠️ 세션을 확인할 수 없습니다')
          }
        } catch (error) {
          console.error('OAuth 처리 실패:', error)
        }
      }
    }

    // MainActivity에서 전달된 커스텀 이벤트 처리
    const handleOAuthRedirect = (event: CustomEvent<{ url: string }>) => {
      console.log('🎯 커스텀 OAuth 리다이렉트 이벤트:', event.detail.url)
      handleAppUrl({ url: event.detail.url })
    }
    
    window.addEventListener('oauth-redirect', handleOAuthRedirect as EventListener)
    console.log('📱 커스텀 oauth-redirect 리스너 등록됨')

    // 앱이 포그라운드로 올 때 URL 처리
    const listener = App.addListener('appUrlOpen', handleAppUrl)
    console.log('📱 appUrlOpen 리스너 등록됨')

    // 앱이 시작될 때 URL 처리 (이미 열려있는 경우)
    // Android에서는 App.getLaunchUrl()이 작동하지 않으므로 MainActivity에서 처리
    if (Capacitor.getPlatform() !== 'android') {
      App.getLaunchUrl().then((result) => {
        console.log('🚀 Launch URL:', result?.url)
        if (result?.url) {
          // 이미 처리된 URL이면 무시
          if (processedOAuthUrl === result.url) {
            console.log('⏭️ 이미 처리된 Launch URL, 무시')
            return
          }
          if (result.url.includes('access_token') && 
              locationRef.current !== '/login' && 
              locationRef.current !== '/') {
            console.log('⏭️ 이미 메인 페이지에 있음, Launch URL 무시:', locationRef.current)
            processedOAuthUrl = result.url
            return
          }
          handleAppUrl({ url: result.url })
        } else {
          console.log('⚠️ Launch URL이 없습니다')
        }
      }).catch((error) => {
        console.log('⚠️ Launch URL 가져오기 실패 (무시):', error.message)
      })
    }
    
    return () => {
      window.removeEventListener('oauth-redirect', handleOAuthRedirect as EventListener)
      listener.then(l => l.remove())
      console.log('🧹 Deep Link 리스너 정리됨')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Supabase 인증 상태 변경 감지 (OAuth 리다이렉션 후 세션 변경 감지)
  useEffect(() => {
    const isNative = Capacitor.isNativePlatform()
    if (!isNative) return

    console.log('📡 Supabase 인증 상태 변경 리스너 등록')
    
    // OAuth 처리 플래그 - URL에 access_token이 있을 때만 true
    let isOAuthRedirect = window.location.hash?.includes('access_token') || 
                          window.location.href?.includes('access_token')
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('🔔 Auth State Change:', event, session ? '세션 있음' : '세션 없음')
      
      if (event === 'SIGNED_IN' && session) {
        console.log('✅ SIGNED_IN 이벤트 감지 (__root.tsx)', {
          userId: session.user?.id,
          email: session.user?.email,
          isOAuthRedirect
        })
        
        // 해시에 access_token이 있으면 OAuth 리다이렉트 직후임
        const hasOAuthToken = window.location.hash?.includes('access_token')
        if (hasOAuthToken) {
          isOAuthRedirect = true
          window.history.replaceState(null, '', window.location.pathname + window.location.search)
          console.log('🧹 SIGNED_IN 이벤트에서 해시 제거 완료')
        }
        
        // OAuth 리다이렉트 직후에만 권한 요청 및 리다이렉트 수행
        if (isOAuthRedirect) {
        // 써드파티 로그인 후 권한 요청
        try {
          console.log('🔐 써드파티 로그인 후 권한 요청 시작')
          await requestInitialPermissions({
            force: true,
            onWebNotificationRequest: async () => {
              if ('Notification' in window) {
                const granted = await requestNotificationPermission()
                if (granted && 'serviceWorker' in navigator) {
                  await registerPushSubscription()
                }
              }
            },
          })
          console.log('✅ 권한 요청 완료')
        } catch (error) {
          console.error('❌ 권한 요청 실패:', error)
        }
        
        // 인증 상태가 업데이트될 때까지 잠시 대기
        await new Promise(resolve => setTimeout(resolve, 300))
        
        const currentPath = locationRef.current
        console.log('📍 현재 경로:', currentPath)
        
        if ((currentPath === '/login' || currentPath === '/') && !currentPath.startsWith('/store/products/')) {
          console.log('🚀 /feed/all로 리다이렉트 중...')
            router.navigate({ to: '/feed/all', replace: true })
          }
          
          // OAuth 처리 완료 - 플래그 초기화
          isOAuthRedirect = false
        } else {
          console.log('⏭️ 일반 세션 복원, 리다이렉트 스킵')
        }
      } else if (event === 'TOKEN_REFRESHED' && session) {
        console.log('🔄 TOKEN_REFRESHED 이벤트 감지')
        await initialize()
      }
    })

    return () => {
      subscription.unsubscribe()
      console.log('🧹 Auth State Change 리스너 정리됨')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // 이미 리다이렉트 중이면 무시
    if (hasRedirectedRef.current) return
    
    const isNative = Capacitor.isNativePlatform()
    const path = locationRef.current
    
    const protectedPaths = [
      '/chat',
      '/dashboard',
      '/partner/dashboard',
      '/admin',
      '/mypage',
      '/points',
    ]

    const needsAuth = protectedPaths.some((p) => path.startsWith(p))

    if (!isLoading) {
      if (isNative && !isAuthenticated && path !== '/login') {
        hasRedirectedRef.current = true
        router.navigate({ to: '/login', replace: true })
      } 
      else if (!isNative && !isAuthenticated && needsAuth) {
        hasRedirectedRef.current = true
        router.navigate({ to: '/login' })
      } 
      else if (isAuthenticated && path === '/login' && !path.startsWith('/store/products/')) {
        hasRedirectedRef.current = true
        router.navigate({ to: '/feed/all', replace: true })
      }
    }
  }, [isAuthenticated, isLoading, router])

  // 로그인 상태이며 브라우저 알림 권한이 허용된 경우, 푸시 구독 보장
  useEffect(() => {
    if (
      isAuthenticated &&
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      registerPushSubscription()
    }
  }, [isAuthenticated, registerPushSubscription])

  const isLocalDev =
    typeof window !== 'undefined' &&
    import.meta.env.DEV &&
    (/^(localhost|127(?:\.\d+){3})$/.test(window.location.hostname) ||
      /^172\.(?:1[6-9]|2[0-9]|3[01])\./.test(window.location.hostname) ||
      /^192\.168\./.test(window.location.hostname) ||
      /^10\./.test(window.location.hostname))

  // 출근부 관리 페이지 전용 레이아웃 사용
  const isTimesheetAdminPage = currentPath.startsWith('/timesheet/admin')

  const hideGlobalMobileTab =
    (currentPath === '/chat' && (searchParams.has('partnerId') || searchParams.has('chatRoomId'))) ||
    currentPath.startsWith('/login') ||
    currentPath.startsWith('/feed/create') ||
    currentPath.startsWith('/stream/video/') ||
    currentPath.startsWith('/store/products/') ||
    currentPath.startsWith('/store/orders/') ||
    currentPath.startsWith('/store/partner/agreement') ||
    currentPath.startsWith('/store/partner/collaboration') ||
    currentPath.startsWith('/store/partner/insights') ||
    currentPath.startsWith('/store/admin/collaboration') ||
    currentPath.startsWith('/store/admin/insights') ||
    currentPath.startsWith('/mypage/purchases/') ||
    currentPath.startsWith('/roulette/') ||
    (currentPath.includes('/store/partner/products/') && currentPath.endsWith('/preview')) ||
    currentPath.startsWith('/mypage/tier') ||
    isTimesheetAdminPage

  const shouldHideMobileNav = currentPath.startsWith('/login') || currentPath.startsWith('/stream/video/') || currentPath.startsWith('/mypage/tier') || isTimesheetAdminPage

  const shouldHideInstantLoad =
    currentPath.startsWith('/feed') ||
    currentPath.startsWith('/explore') ||
    currentPath.startsWith('/notifications') ||
    currentPath.startsWith('/chat')

  const shouldHideDesktopNav = currentPath.startsWith('/login') || currentPath.startsWith('/stream/video/') || isTimesheetAdminPage
  const isLoginPage = currentPath.startsWith('/login')

  if (isLoading) {
    return <LoadingSpinner />
  }

  // pendingNavigate 핸들러
  const handleNavigatePending = () => {
    if (pendingNavigateRef.current) {
      router.navigate({ to: pendingNavigateRef.current.path as '/' })
      pendingNavigateRef.current = null
    }
  }

  return (
    <>
      {/* 최상위 컨테이너 - CSS 미디어쿼리로 반응형 처리 */}
      <div 
        className={`flex relative h-[100dvh] overflow-hidden lg:min-h-screen lg:h-auto lg:overflow-visible ${
          isLoginPage ? 'bg-black' : (isNative ? 'bg-[#FE3A8F]' : 'bg-white')
        }`}
        style={isNative ? {
          height: '100dvh',
          maxHeight: '100dvh',
          overflow: 'hidden',
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          touchAction: 'none',
        } : undefined}
      >
      {/* 데스크탑 네비게이션 레일 - memo 컴포넌트로 분리 */}
      <ResponsiveDesktopNavRail shouldHide={shouldHideDesktopNav} />
      <div 
        className={`flex flex-1 flex-col h-full min-h-0 overflow-hidden lg:min-h-screen lg:h-auto lg:overflow-visible ${isLoginPage ? 'bg-transparent' : 'bg-white'}`}
      >
        {/* 헤더 - memo 컴포넌트로 분리 */}
        <ResponsiveNavigation shouldHide={shouldHideMobileNav} />
        {/* 알림 권한 설정 배너 - 로그인한 사용자에게만 표시 */}
        {isAuthenticated && (
          <div className="fixed top-0 left-0 right-0 z-50 p-3">
            <NotificationPermissionBanner id="root" />
          </div>
        )}
        <div 
          className="relative flex-1 min-h-0 flex flex-col overflow-hidden lg:block"
        >
          {/* 메인 컨텐츠 - memo 컴포넌트로 분리 */}
          <ResponsiveMainContent
            scrollContainerRef={scrollContainerRef}
            currentPath={currentPath}
            pageKey={pageKey}
            transitionDirection={transitionDirection}
            shouldHideInstantLoad={shouldHideInstantLoad}
            setIsTransitioning={setIsTransitioning}
            onNavigatePending={handleNavigatePending}
          />
        </div>
        {/* 모바일 탭바 - memo 컴포넌트로 분리 */}
        <ResponsiveMobileTabBar shouldHide={hideGlobalMobileTab} />
          {/* 데스크톱에서만 플로팅 채팅 버튼 표시 */}
        {/* <FloatingChatButton /> */}
          {/* 파트너 의뢰 수락 배너 - 로그인한 파트너에게만 표시 */}
          {isAuthenticated && <MobileRequestBanner />}
          {/* 들어오는 음성통화 모달 - 로그인한 사용자에게만 표시 */}
          {isAuthenticated && <IncomingCallModal />}
          {/* 음성통화 중 UI 모달 - 로그인한 사용자에게만 표시 */}
          {isAuthenticated && <GlobalVoiceCallUI />}
          {/* 보이스룸 미니 플레이어 - 로그인한 사용자에게만 표시 */}
          {isAuthenticated && <VoiceRoomMiniPlayer />}
          {/* 라이브룸 미니 플레이어 - 로그인한 사용자에게만 표시 */}
          {isAuthenticated && <VideoRoomMiniPlayer />}
          {/* 들어오는 영상통화 모달 - 로그인한 사용자에게만 표시 */}
          {isAuthenticated && <IncomingVideoCallModal />}
          {/* 영상통화 중 UI 모달 - 로그인한 사용자에게만 표시 */}
          {isAuthenticated && <GlobalVideoCallUI />}
          {/* 전역 랭킹 슬라이드 */}
          <GlobalRankingSheet />
          {/* 전역 하트 보내기 슬라이드 */}
          <GlobalDonationSheet />
          {/* 미니 통화 UI (전역) */}
          <MiniCallUI />
          
          {/* LiveKit 수신 모달 */}
          <LiveKitIncomingCallModal />
          
          {/* 강제 업데이트 모달 (네이티브 앱만) */}
          {needsUpdate && versionInfo && (
            <div className="fixed inset-0 z-[99999999] flex items-center justify-center bg-black/80">
              <div className="bg-white rounded-2xl p-6 mx-6 max-w-sm w-full text-center">
                <img src="/logo.png" alt="MateYou" className="w-16 h-16 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-[#110f1a] mb-2">새로운 버전이 나왔어요! 😊</h2>
                <p className="text-gray-600 text-sm mb-4">
                  업데이트 해주세요!
                </p>
                {versionInfo.release_notes && (
                  <p className="text-gray-500 text-xs mb-4 p-3 bg-gray-50 rounded-lg text-left">
                    {versionInfo.release_notes}
                  </p>
                )}
                <button
                    onClick={async () => {
                      const storeUrl = Capacitor.getPlatform() === 'ios'
                        ? 'https://apps.apple.com/kr/app/%EB%A9%94%EC%9D%B4%ED%8A%B8%EC%9C%A0/id6755867402'
                        : 'https://play.google.com/store/apps/details?id=com.mateyou.app&hl=ko'
                      try {
                        const { App } = await import('@capacitor/app')
                        await App.openUrl({ url: storeUrl })
                      } catch {
                        window.open(storeUrl, '_blank')
                      }
                    }}
                    className="w-full py-3 bg-[#FE3A8F] text-white rounded-full font-semibold"
                  >
                    확인
                  </button>
              </div>
            </div>
          )}
          {/* DevModeSwitcher - 로컬 개발 환경에서만 표시 (모바일 포함) */}
          {/* {isLocalDev && <DevModeSwitcher />} */}
          {/* TanStack 개발자 도구 - 비활성화 */}
          {/* {isLocalDev && !isMobile && (
            <>
              <TanStackRouterDevtools position="bottom-right" />
              <ReactQueryDevtools initialIsOpen={false} position="left" />
            </>
          )} */}
      </div>
      </div>
      <Toaster />
    </>
  )
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: RootComponent,
})
