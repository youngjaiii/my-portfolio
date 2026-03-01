import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { SignInWithApple } from '@capacitor-community/apple-sign-in'
import type { Session } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { supabase } from '@/lib/supabase'
import { generateCreativeNickname } from '@/lib/nicknameGenerator'
import { WebAuth } from '@/plugins/webAuth'

// 플랫폼별 OAuth redirect URL 반환
const getOAuthRedirectUrl = () => {
  const isNative = Capacitor.isNativePlatform()
  const platform = Capacitor.getPlatform()
  const origin = window.location.origin
  
  let redirectUrl: string
  
  if (isNative) {
    if (platform === 'ios') {
      // iOS: capacitor://localhost 스킴 사용
      redirectUrl = 'capacitor://localhost'
    } else {
      // Android: mateyou:// 커스텀 스킴 사용
      redirectUrl = 'mateyou://auth/callback'
    }
  } else {
    // 웹: 현재 origin 사용
    redirectUrl = `${origin}/`
  }
  
  console.log('🔍 [OAuth Debug]', {
    isNative,
    platform,
    origin,
    willUse: redirectUrl
  })
  
  return redirectUrl
}

// iOS: ASWebAuthenticationSession (인앱 Safari), Android: Browser.open
const openOAuthInBrowser = async (url: string): Promise<string | null> => {
  const platform = Capacitor.getPlatform()
  
  if (!Capacitor.isNativePlatform()) return null
  
  if (platform === 'ios') {
    try {
      const result = await WebAuth.authenticate({
        url,
        callbackScheme: 'capacitor'
      })
      return result.url
    } catch (e) {
      console.error('WebAuth error:', e)
      return null
    }
  } else {
    await Browser.open({ 
      url,
      windowName: '_self',
      presentationStyle: 'popover'
    })
    return null
  }
}

// 플랫폼별 skipBrowserRedirect 결정
const shouldSkipBrowserRedirect = () => {
  // 네이티브 앱에서는 항상 수동으로 브라우저 처리
  return Capacitor.isNativePlatform()
}

// iOS 콜백 URL에서 세션 추출 및 설정
const handleiOSCallback = async (callbackUrl: string) => {
  try {
    const url = new URL(callbackUrl)
    const fragment = url.hash.substring(1) // # 제거
    const params = new URLSearchParams(fragment)
    
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    
    if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
      })
      if (error) throw error
      console.log('✅ iOS OAuth session set')
    }
  } catch (e) {
    console.error('❌ iOS callback error:', e)
  }
}

type User = Database['public']['Tables']['members']['Row'] & {
  username?: string
  email?: string
  avatar?: string
  partner_status?: 'none' | 'pending' | 'approved' | 'rejected'
  partner_name?: string | null
  partner_message?: string | null
  partner_applied_at?: string
  partner_reviewed_at?: string | null
  points?: { total: number }
}

interface AuthState {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  loginWithDiscord: () => Promise<void>
  loginWithTwitter: () => Promise<void>
  loginWithGoogle: () => Promise<void>
  loginWithApple: () => Promise<void>
  signup: (email: string, password: string, username: string) => Promise<void>
  logout: () => Promise<void>
  updateUserProfile: (updates: Partial<User>) => void
  setLoading: (loading: boolean) => void
  setUserRole: (role: 'normal' | 'partner' | 'admin') => void
  updateUserPoints: (newPoints: number) => void
  refreshUser: () => Promise<void>
  initialize: () => Promise<void>
  syncSession: (session: Session | null) => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => {
      const extractSocialProfile = (session: Session) => {
        const provider = session.user.app_metadata?.provider
        const metadata = session.user.user_metadata || {}

        const displayName =
          metadata.custom_claims?.global_name ||
          metadata.full_name ||
          metadata.name ||
          metadata.user_name ||
          metadata.username ||
          metadata.preferred_username ||
          generateCreativeNickname()

        const socialId =
          metadata.provider_id ||
          metadata.sub ||
          metadata.user_name ||
          metadata.username ||
          session.user.id

        const avatarUrl =
          metadata.avatar_url ||
          metadata.picture ||
          metadata.profile_image_url ||
          null

        return {
          provider,
          displayName,
          socialId,
          avatarUrl,
        }
      }

      const hydrateFromSession = async (session: Session | null) => {
        if (!session?.user) {
          set({
            user: null,
            isAuthenticated: false,
          })
          return
        }

        try {
          let userData = null
          let userDataError = null

          // 새로운 사용자인지 확인 (ID로만 조회)
          const userQuery = await supabase
            .from('members')
            .select('*')
            .eq('id', session.user.id)
            .maybeSingle()

          userData = userQuery.data
          userDataError = userQuery.error

          // 503 에러 감지 (일시적인 서버 오류)
          if (userDataError) {
            const errorStatus = (userDataError as any)?.status || (userDataError as any)?.code
            const errorMessage = userDataError.message || ''

            if (errorStatus === 503 || errorStatus === '503' || errorMessage.includes('503')) {
              console.warn('⚠️ [일시적 서버 오류] 503 에러 감지 - 세션 유지:', userDataError)
              // 503은 일시적인 서버 오류일 수 있으므로 로그아웃하지 않고 현재 세션 유지
              // 실제 인증 에러는 apiClient.ts에서 401 에러로 처리됨
              return
            }
          }

          // 만약 특정 이메일로 기존 계정이 있는지 확인 (소셜 로그인 연동용)
          if (!userData && session.user.email) {
            const existingUserQuery = await supabase
              .from('members')
              .select('*')
              .eq('email', session.user.email)
              .maybeSingle()

            // 503 에러 감지 (일시적인 서버 오류)
            if (existingUserQuery.error) {
              const errorStatus = (existingUserQuery.error as any)?.status || (existingUserQuery.error as any)?.code
              const errorMessage = existingUserQuery.error.message || ''

              if (errorStatus === 503 || errorStatus === '503' || errorMessage.includes('503')) {
                console.warn('⚠️ [일시적 서버 오류] 503 에러 감지 (existingUser) - 세션 유지:', existingUserQuery.error)
                // 503은 일시적인 서버 오류일 수 있으므로 로그아웃하지 않고 현재 세션 유지
                return
              }
            }

            if (existingUserQuery.data) {
              userData = existingUserQuery.data
            }
          }

          const { provider, displayName, socialId, avatarUrl } =
            extractSocialProfile(session)

          // 최초 로그인 정보 로그 출력
          const isFirstLogin = !userData
          if (isFirstLogin) {
            console.log('🆕 [최초 로그인] 로그인 정보:', {
              userId: session.user.id,
              email: session.user.email,
              provider: provider,
              displayName: displayName,
              socialId: socialId,
              avatarUrl: avatarUrl,
              metadata: session.user.user_metadata,
              appMetadata: session.user.app_metadata,
              createdAt: session.user.created_at,
            })
          }

          const isSupportedSocialProvider =
            provider === 'discord' ||
            provider === 'twitter' ||
            provider === 'google' ||
            provider === 'apple'

          // 소셜 로그인이고 사용자 데이터가 없는 경우 새로 생성
          if (!userData && isSupportedSocialProvider) {
            const memberCode = 'MY' + Date.now().toString().slice(-6)

            console.log('🆕 [최초 로그인] 신규 사용자 생성:', {
              id: session.user.id,
              member_code: memberCode,
              social_id: socialId,
              name: displayName,
              profile_image: avatarUrl,
              provider: provider,
            })

            try {
              // insert를 사용하여 신규 회원만 생성 (기존 회원 데이터 보호)
              const { data: newUserData, error: insertError } = await supabase
                .from('members')
                .insert({
                  id: session.user.id,
                  member_code: memberCode,
                  social_id: socialId,
                  name: displayName,
                  profile_image: avatarUrl,
                  role: 'normal',
                  current_status: 'online',
                  total_points: 0,
                })
                .select()
                .single()

              if (insertError) {
                // 중복 에러인 경우 기존 회원으로 처리 (안전장치)
                const isUniqueConstraintError = insertError.message?.includes('duplicate key') ||
                                               insertError.message?.includes('unique constraint') ||
                                               insertError.code === '23505'

                if (isUniqueConstraintError) {
                  console.warn('⚠️ [안전장치] 이미 존재하는 회원, 기존 데이터 조회...')
                  // 기존 사용자 재조회 시도
                  const { data: existingUser } = await supabase
                    .from('members')
                    .select('*')
                    .eq('id', session.user.id)
                    .maybeSingle()

                  if (existingUser) {
                    console.log('✅ 기존 회원 확인:', existingUser)
                    userData = existingUser
                  }
                } else {
                  console.error('❌ 신규 회원 생성 실패:', insertError)
                  throw insertError
                }
              } else {
                console.log('✅ [최초 로그인] 신규 회원 생성 완료:', newUserData)
                userData = newUserData
              }
            } catch (insertError) {
              console.error('❌ 소셜 사용자 생성 실패:', insertError)
            }
          }

          // 테스트/모킹 계정 처리
          if (!userData && (session.user.user_metadata?.test_role || session.user.app_metadata?.test_mode)) {
            const testRole = session.user.user_metadata.test_role

            // 여러 방법으로 테스트 계정 조회
            const testQueries = [
              // 방법 1: 역할과 social_id로 조회
              () => testRole
                ? supabase.from('members').select('*').eq('role', testRole).eq('social_id', `test-social-${testRole}`).single()
                : Promise.resolve({ data: null, error: { message: 'No test role' } }),
              // 방법 2: session.user.id로 직접 조회
              () => supabase.from('members').select('*').eq('id', session.user.id).single(),
              // 방법 3: 테스트 패턴으로 조회
              () => supabase.from('members').select('*').like('social_id', 'test-social-%').limit(1).single(),
            ]

            for (const query of testQueries) {
              try {
                const { data: testUserData, error } = await query()
                if (!error && testUserData) {
                  userData = testUserData
                  break
                }
              } catch (e) {
                continue
              }
            }
          }

          if (!userData) {
            // Supabase 세션도 정리
            try {
              await supabase.auth.signOut()
            } catch (signOutError) {
              console.error('로그아웃 처리 중 에러:', signOutError)
            }

            set({
              user: null,
              isAuthenticated: false,
              isLoading: false
            })
            return
          }

          set({
            user: {
              ...userData,
              username:
                userData.name ||
                userData.member_code ||
                displayName ||
                'Unknown',
              email: session.user.email || '',
              avatar: userData.profile_image,
            },
            isAuthenticated: true,
            isLoading: false
          })

        } catch (error) {
          console.error('❌ Session hydrate error:', error)

          // 503 에러 감지 (일시적인 서버 오류)
          const errorStatus = (error as any)?.status || (error as any)?.code
          const errorMessage = (error as Error)?.message || ''

          if (errorStatus === 503 || errorStatus === '503' || errorMessage.includes('503')) {
            console.warn('⚠️ [일시적 서버 오류] 503 에러 감지 (hydrateFromSession) - 세션 유지:', error)
            // 503은 일시적인 서버 오류일 수 있으므로 로그아웃하지 않고 세션 유지
            return
          }

          // 실제 인증 에러인 경우에만 세션 정리
          try {
            await supabase.auth.signOut()
          } catch (signOutError) {
            console.error('로그아웃 처리 중 에러:', signOutError)
          }

          set({
            user: null,
            isAuthenticated: false,
            isLoading: false
          })
        }
      }

      return {
        user: null,
        isLoading: true,
        isAuthenticated: false,
        syncSession: hydrateFromSession,
        login: async (email: string, password: string) => {
          set({ isLoading: true })
          try {
            const { data, error } = await supabase.auth.signInWithPassword({
              email,
              password,
            })

            if (error) throw error

            if (data.user) {
              const { data: userData, error: userError } = await supabase
                .from('members')
                .select('*')
                .eq('id', data.user.id)
                .maybeSingle()

              if (userError) throw userError

              set({
                user: {
                  ...userData,
                  username: userData.name || userData.member_code || 'Unknown',
                  email: data.user.email || '',
                  avatar: userData.profile_image,
                },
                isAuthenticated: true,
              })
            }
          } catch (error) {
            console.error('Login error:', error)
            throw error
          } finally {
            set({ isLoading: false })
          }
        },
        loginWithDiscord: async () => {
          set({ isLoading: true })
          try {
            const redirectTo = getOAuthRedirectUrl()
            const skipRedirect = shouldSkipBrowserRedirect()
            
            const { data, error } = await supabase.auth.signInWithOAuth({
              provider: 'discord',
              options: {
                redirectTo,
                skipBrowserRedirect: skipRedirect,
              },
            })

            if (error) throw error
            
            if (skipRedirect && data?.url) {
              const callbackUrl = await openOAuthInBrowser(data.url)
              if (callbackUrl) await handleiOSCallback(callbackUrl)
            }
          } catch (error) {
            console.error('Discord login error:', error)
            throw error
          } finally {
            set({ isLoading: false })
          }
        },
        loginWithTwitter: async () => {
          set({ isLoading: true })
          try {
            const redirectTo = getOAuthRedirectUrl()
            const skipRedirect = shouldSkipBrowserRedirect()
            
            const { data, error } = await supabase.auth.signInWithOAuth({
              provider: 'twitter',
              options: {
                redirectTo,
                skipBrowserRedirect: skipRedirect,
              },
            })

            if (error) throw error
            
            if (skipRedirect && data?.url) {
              const callbackUrl = await openOAuthInBrowser(data.url)
              if (callbackUrl) await handleiOSCallback(callbackUrl)
            }
          } catch (error) {
            console.error('Twitter login error:', error)
            throw error
          } finally {
            set({ isLoading: false })
          }
        },
        loginWithGoogle: async () => {
          set({ isLoading: true })
          try {
            const redirectTo = getOAuthRedirectUrl()
            const skipRedirect = shouldSkipBrowserRedirect()
            
            const { data, error } = await supabase.auth.signInWithOAuth({
              provider: 'google',
              options: {
                redirectTo,
                skipBrowserRedirect: skipRedirect,
              },
            })

            if (error) throw error
            
            if (skipRedirect && data?.url) {
              const callbackUrl = await openOAuthInBrowser(data.url)
              if (callbackUrl) await handleiOSCallback(callbackUrl)
            }
          } catch (error) {
            console.error('Google login error:', error)
            throw error
          } finally {
            set({ isLoading: false })
          }
        },
        loginWithApple: async () => {
          set({ isLoading: true })
          try {
            const platform = Capacitor.getPlatform()
            
            // iOS에서는 네이티브 Sign in with Apple 사용
            if (platform === 'ios') {
              // 랜덤 nonce 생성
              const rawNonce = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
              
              // SHA256 해시 생성 (Apple에 보낼 용도)
              const encoder = new TextEncoder()
              const data = encoder.encode(rawNonce)
              const hashBuffer = await crypto.subtle.digest('SHA-256', data)
              const hashArray = Array.from(new Uint8Array(hashBuffer))
              const hashedNonce = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
              
              const options = {
                clientId: 'com.mateyou.app', // 앱의 Bundle ID
                redirectURI: 'https://yzrtuaymdgcmwwsjmkrj.supabase.co/auth/v1/callback',
                scopes: 'email name',
                state: Math.random().toString(36).substring(7),
                nonce: hashedNonce, // Apple에는 해시된 nonce를 보냄
              }
              
              const result = await SignInWithApple.authorize(options)
              
              console.log('🍎 Apple Sign In result:', result)
              
              // Apple에서 받은 identity token으로 Supabase 로그인
              if (result.response?.identityToken) {
                const { data, error } = await supabase.auth.signInWithIdToken({
                  provider: 'apple',
                  token: result.response.identityToken,
                  nonce: rawNonce, // Supabase에는 원본 nonce를 보냄
                })
                
                if (error) throw error
                
                console.log('✅ Supabase Apple login success:', data)
              } else {
                throw new Error('No identity token received from Apple')
              }
            } else {
              // 웹/Android에서는 OAuth flow 사용
              const redirectTo = getOAuthRedirectUrl()
              const skipRedirect = shouldSkipBrowserRedirect()
              
              const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'apple',
                options: {
                  redirectTo,
                  skipBrowserRedirect: skipRedirect,
                },
              })

              if (error) throw error
              
              if (skipRedirect && data?.url) {
                const callbackUrl = await openOAuthInBrowser(data.url)
                if (callbackUrl) await handleiOSCallback(callbackUrl)
              }
            }
          } catch (error) {
            console.error('Apple login error:', error)
            throw error
          } finally {
            set({ isLoading: false })
          }
        },
        signup: async (email: string, password: string, username: string) => {
          set({ isLoading: true })
          try {
            const { data, error } = await supabase.auth.signUp({
              email,
              password,
            })

            if (error) throw error

            if (data.user) {
              const { error: insertError } = await supabase
                .from('members')
                .insert({
                  id: data.user.id,
                  member_code: username,
                  social_id: data.user.email,
                  role: 'normal',
                  current_status: '오프라인',
                })

              if (insertError) throw insertError

              const { data: userData, error: userError } = await supabase
                .from('members')
                .select('*')
                .eq('id', data.user.id)
                .maybeSingle()

              if (userError) throw userError

              set({
                user: {
                  ...userData,
                  username: userData.name || userData.member_code || username,
                  email: data.user.email || email,
                  avatar: userData.profile_image,
                },
                isAuthenticated: true,
              })
            }
          } catch (error) {
            console.error('Signup error:', error)
            throw error
          } finally {
            set({ isLoading: false })
          }
        },
        logout: async () => {
          const { user } = get()

          try {
            // 로그아웃 전에 사용자 상태를 offline으로 변경
            if (user?.id) {
              await supabase
                .from('members')
                .update({ current_status: 'offline' })
                .eq('id', user.id)
            }
          } catch (error) {
            console.error('❌ 사용자 상태 업데이트 에러:', error)
          }

          try {
            // Supabase 세션 정리
            await supabase.auth.signOut()
          } catch (error) {
            console.error('❌ Supabase 로그아웃 에러:', error)
          }

          try {
            // localStorage 정리
            localStorage.removeItem('auth-storage')
          } catch (error) {
            console.error('❌ localStorage 정리 에러:', error)
          }

          // 상태 초기화
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
          })
        },
        updateUserProfile: (updates: Partial<User>) => {
          const { user } = get()
          if (user) {
            set({
              user: { ...user, ...updates },
            })
          }
        },
        setLoading: (loading: boolean) => {
          set({ isLoading: loading })
        },
        setUserRole: async (role: 'normal' | 'partner' | 'admin') => {
          const { user } = get()
          if (!user) return

          try {
            const { error } = await supabase
              .from('members')
              .update({ role })
              .eq('id', user.id)

            if (error) throw error

            set({
              user: { ...user, role },
            })
          } catch (error) {
            console.error('Update role error:', error)
          }
        },
        updateUserPoints: (newPoints: number) => {
          const { user } = get()
          if (user) {
            set({
              user: { ...user, total_points: newPoints },
            })
          }
        },
        refreshUser: async () => {
          const { user } = get()
          if (!user) return

          try {
            const { data: userData, error } = await supabase
              .from('members')
              .select('*')
              .eq('id', user.id)
              .maybeSingle()

            if (error) throw error

            set({
              user: {
                ...userData,
                username: userData.member_code || 'Unknown',
                email: user.email || '',
                avatar: userData.profile_image,
              },
            })
          } catch (error) {
            console.error('Refresh user error:', error)
          }
        },
        initialize: async () => {
          const currentState = get()

          set({ isLoading: true })

          try {
            // Supabase 세션 확인
            const {
              data: { session },
              error: sessionError
            } = await supabase.auth.getSession()

            if (sessionError) {
              // 503 에러 감지 (일시적인 서버 오류)
              const errorStatus = (sessionError as any)?.status || (sessionError as any)?.code
              const errorMessage = sessionError.message || ''

              if (errorStatus === 503 || errorStatus === '503' || errorMessage.includes('503')) {
                console.warn('⚠️ [일시적 서버 오류] 503 에러 감지 (initialize) - 세션 유지:', sessionError)
                // 503은 일시적인 서버 오류일 수 있으므로 로그아웃하지 않고 세션 유지
                set({ isLoading: false })
                return
              }

              // 실제 인증 에러인 경우에만 로그아웃 처리
              console.error('❌ 세션 조회 실패:', sessionError)
              set({
                user: null,
                isAuthenticated: false,
                isLoading: false
              })
              return
            }

            // 실제 Supabase 세션이 있다면 우선 처리
            if (session?.user) {
              await hydrateFromSession(session)
            } else {
              // 세션이 없으면서 localStorage에 저장된 상태가 있는 경우 (테스트 계정 등)
              if (currentState.user && currentState.isAuthenticated) {
                set({
                  user: currentState.user,
                  isAuthenticated: currentState.isAuthenticated,
                  isLoading: false
                })
              } else {
                // 완전히 로그아웃 상태
                set({
                  user: null,
                  isAuthenticated: false,
                  isLoading: false
                })
              }
            }
          } catch (error) {
            console.error('❌ AuthStore initialize error:', error)

            // 503 에러 감지 (일시적인 서버 오류)
            const errorStatus = (error as any)?.status || (error as any)?.code
            const errorMessage = (error as Error)?.message || ''

            if (errorStatus === 503 || errorStatus === '503' || errorMessage.includes('503')) {
              console.warn('⚠️ [일시적 서버 오류] 503 에러 감지 (initialize catch) - 세션 유지:', error)
              // 503은 일시적인 서버 오류일 수 있으므로 로그아웃하지 않고 세션 유지
              set({ isLoading: false })
              return
            }

            // 실제 인증 에러인 경우에만 로그아웃 상태로 설정
            set({
              user: null,
              isAuthenticated: false,
              isLoading: false
            })
          }
        },
      }
    },
    {
      name: 'auth-storage',
      partialize: (state) => ({
        // user는 저장하지 않음 - 항상 서버에서 최신 정보를 가져옴
        // role 불일치 문제 방지 (서버에서 role이 변경되어도 localStorage에 오래된 값이 남는 문제)
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isLoading = false
          // localStorage에서 복원 시 user는 null이므로 서버에서 다시 가져와야 함
          // Supabase 세션이 유효하면 initializeAuth에서 user 정보를 가져옴
        }
      },
    },
  ),
)

// Auth state 변화 리스너를 store 초기화 후에 등록
let authListenerCleanup: (() => void) | null = null

const initializeAuthListener = () => {
  if (authListenerCleanup) {
    authListenerCleanup()
  }

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      useAuthStore.getState().syncSession(null)
      return
    }

    if (
      event === 'SIGNED_IN' ||
      event === 'TOKEN_REFRESHED' ||
      event === 'USER_UPDATED'
    ) {
      useAuthStore.getState().syncSession(session)
    }
  })

  authListenerCleanup = () => subscription.unsubscribe()
}

// Store 생성 후 리스너 등록
initializeAuthListener()
