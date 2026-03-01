import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface TokenContext {
  accessToken?: string | null
  refreshToken?: string | null
  syncSession?: (session: Session | null) => Promise<void> | void
}

const AUTH_STORAGE_KEY = 'mate_you_auth'

/**
 * Resolve a valid Supabase access token.
 * Falls back to supabase.auth.getSession(), refreshSession(), and the persisted auth storage.
 */
export async function resolveAccessToken({
  accessToken,
  refreshToken,
  syncSession,
}: TokenContext = {}): Promise<string | null> {
  if (accessToken) {
    return accessToken
  }

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (session?.access_token) {
      await syncSession?.(session)
      return session.access_token
    }
  } catch (error) {
    console.error('세션 조회 실패:', error)
  }

  if (refreshToken) {
    try {
      const { data, error } = await supabase.auth.refreshSession({
        refresh_token: refreshToken,
      })
      if (!error && data.session?.access_token) {
        await syncSession?.(data.session)
        return data.session.access_token
      }
    } catch (error) {
      console.error('세션 갱신 실패:', error)
    }
  }

  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(AUTH_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        const storedAccessToken =
          parsed?.currentSession?.access_token ||
          parsed?.access_token ||
          parsed?.session?.access_token ||
          parsed?.currentSession?.token?.access_token ||
          null
        const storedRefreshToken =
          parsed?.currentSession?.refresh_token ||
          parsed?.refresh_token ||
          parsed?.session?.refresh_token ||
          parsed?.currentSession?.token?.refresh_token ||
          null

        if (storedAccessToken) {
          try {
            const { data } = await supabase.auth.setSession({
              access_token: storedAccessToken,
              refresh_token: storedRefreshToken || '',
            })
            if (data.session) {
              await syncSession?.(data.session)
            }
          } catch (error) {
            console.error('세션 복원 실패:', error)
          }
          return storedAccessToken
        }
      }
    } catch (error) {
      console.error('저장된 토큰 조회 실패:', error)
    }
  }

  return null
}

