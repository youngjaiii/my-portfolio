import type { Session } from '@supabase/supabase-js'
import { resolveAccessToken } from './sessionToken'

const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export interface FollowAuthContext {
  accessToken?: string | null
  refreshToken?: string | null
  syncSession?: (session: Session | null) => Promise<void> | void
}

async function getTokenOrThrow(ctx: FollowAuthContext): Promise<string> {
  const token = await resolveAccessToken(ctx)
  if (!token) {
    throw new Error('로그인이 필요합니다.')
  }
  return token
}

async function callFollowEndpoint(
  partnerId: string,
  method: 'POST' | 'DELETE',
  ctx: FollowAuthContext,
) {
  const token = await getTokenOrThrow(ctx)
  const response = await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/api-follow`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ partner_id: partnerId }),
  })
  const result = await response.json()
  if (!response.ok || !result.success) {
    throw new Error(result.error || '팔로우 처리에 실패했습니다.')
  }
  return result
}

export async function toggleFollowPartner(
  partnerId: string,
  shouldFollow: boolean,
  ctx: FollowAuthContext,
) {
  return callFollowEndpoint(partnerId, shouldFollow ? 'POST' : 'DELETE', ctx)
}

export async function fetchFollowers(
  partnerId: string,
  ctx: FollowAuthContext,
): Promise<any[]> {
  const token = await getTokenOrThrow(ctx)
  const query = new URLSearchParams({ partner_id: partnerId }).toString()
  const response = await fetch(
    `${EDGE_FUNCTIONS_URL}/functions/v1/api-follow?${query}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
    },
  )
  const result = await response.json()
  if (!response.ok || !result.success) {
    throw new Error(result.error || '팔로워 목록을 불러오지 못했습니다.')
  }

  const data = result.data
  if (Array.isArray(data)) {
    return data
  }
  if (data?.followers && Array.isArray(data.followers)) {
    return data.followers
  }
  return []
}

