/**
 * 프론트엔드에서 API 토큰 사용 예제
 * 
 * 이 파일은 프론트엔드 프로젝트에서 참고용으로 사용하세요.
 */

import { createClient } from '@supabase/supabase-js'
import axios from 'axios'

// ============================================
// 1. Supabase 클라이언트 설정
// ============================================

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'YOUR_SUPABASE_URL'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY'

const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ============================================
// 2. API 클라이언트 설정 (Axios)
// ============================================

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 요청 인터셉터: 모든 요청에 토큰 자동 추가
apiClient.interceptors.request.use(async (config) => {
  // 현재 세션에서 토큰 가져오기
  const { data: { session } } = await supabase.auth.getSession()
  
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`
  }
  
  return config
})

// 응답 인터셉터: 401 에러 시 토큰 갱신 시도
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // 토큰 갱신 시도
      const { data: { session } } = await supabase.auth.refreshSession()
      
      if (session?.access_token) {
        // 원래 요청 재시도
        error.config.headers.Authorization = `Bearer ${session.access_token}`
        return apiClient.request(error.config)
      } else {
        // 갱신 실패 시 로그인 페이지로 리다이렉트
        window.location.href = '/login'
      }
    }
    
    return Promise.reject(error)
  }
)

// ============================================
// 3. 인증 관련 함수
// ============================================

/**
 * 로그인
 */
export async function login(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    throw new Error(error.message)
  }

  return {
    user: data.user,
    session: data.session,
    token: data.session?.access_token,
  }
}

/**
 * 회원가입
 */
export async function signUp(email: string, password: string, fullName?: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
      },
    },
  })

  if (error) {
    throw new Error(error.message)
  }

  return {
    user: data.user,
    session: data.session,
    token: data.session?.access_token,
  }
}

/**
 * 로그아웃
 */
export async function logout() {
  const { error } = await supabase.auth.signOut()
  if (error) {
    throw new Error(error.message)
  }
}

/**
 * 현재 토큰 가져오기
 */
export async function getCurrentToken(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.access_token || null
}

/**
 * 현재 사용자 정보 가져오기
 */
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

// ============================================
// 4. API 호출 예제
// ============================================

/**
 * 현재 사용자 정보 조회
 */
export async function getMyInfo() {
  const response = await apiClient.get('/api/auth/me')
  return response.data
}

/**
 * 프로필 업데이트
 */
export async function updateProfile(profileData: {
  name?: string
  favorite_game?: string[]
  current_status?: 'online' | 'offline' | 'matching' | 'in_game'
  profile_image?: string
}) {
  const response = await apiClient.put('/api/auth/profile', profileData)
  return response.data
}

/**
 * 파트너 상태 조회
 */
export async function getPartnerStatus() {
  const response = await apiClient.get('/api/auth/partner-status')
  return response.data
}

/**
 * 파트너 신청
 */
export async function applyPartner(data: {
  partner_name: string
  partner_message?: string
  game_info?: any
}) {
  const response = await apiClient.post('/api/auth/partner-apply', data)
  return response.data
}

/**
 * 파트너 목록 조회
 */
export async function getPartners(params?: {
  page?: number
  limit?: number
  search?: string
  game?: string
}) {
  const response = await apiClient.get('/api/partners/list', { params })
  return response.data
}

/**
 * 파트너 상세 정보 조회
 */
export async function getPartnerDetails(memberCode: string) {
  const response = await apiClient.get(`/api/partners/details/${memberCode}`)
  return response.data
}

/**
 * 채팅방 목록 조회
 */
export async function getChatRooms() {
  const response = await apiClient.get('/api/chat/rooms')
  return response.data
}

/**
 * 메시지 전송
 */
export async function sendMessage(data: {
  room_id: string
  message: string
  message_type?: 'text' | 'image' | 'system'
}) {
  const response = await apiClient.post('/api/chat/messages', data)
  return response.data
}

/**
 * 리뷰 작성
 */
export async function submitReview(data: {
  partner_id: string
  rating: number
  comment?: string
  request_id?: string
  points_earned?: number
}) {
  const response = await apiClient.post('/api/reviews/submit', data)
  return response.data
}

// ============================================
// 5. React Hook 예제 (선택사항)
// ============================================

/**
 * React에서 사용하는 커스텀 훅 예제
 */
export function useAuth() {
  const [user, setUser] = useState<any>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 초기 사용자 정보 로드
    loadUser()

    // 인증 상태 변경 리스너
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user || null)
        setToken(session?.access_token || null)
        setLoading(false)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const loadUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: { session } } = await supabase.auth.getSession()
      
      setUser(user)
      setToken(session?.access_token || null)
    } catch (error) {
      console.error('사용자 로드 실패:', error)
    } finally {
      setLoading(false)
    }
  }

  return {
    user,
    token,
    loading,
    login,
    signUp,
    logout,
  }
}

// ============================================
// 6. 사용 예제
// ============================================

/**
 * 컴포넌트에서 사용 예제
 */
export async function exampleUsage() {
  try {
    // 1. 로그인
    const { token } = await login('user@example.com', 'password123')
    console.log('토큰:', token)

    // 2. 내 정보 조회
    const myInfo = await getMyInfo()
    console.log('내 정보:', myInfo)

    // 3. 프로필 업데이트
    await updateProfile({
      name: '홍길동',
      favorite_game: ['League of Legends', 'Valorant'],
      current_status: 'online',
    })

    // 4. 파트너 목록 조회
    const partners = await getPartners({
      page: 1,
      limit: 10,
      search: '게임',
    })
    console.log('파트너 목록:', partners)

    // 5. 채팅방 목록 조회
    const chatRooms = await getChatRooms()
    console.log('채팅방 목록:', chatRooms)

  } catch (error) {
    console.error('에러:', error)
  }
}

/**
 * Swagger UI에서 사용할 토큰 가져오기
 */
export async function getTokenForSwagger() {
  const token = await getCurrentToken()
  
  if (token) {
    console.log('Swagger UI에 입력할 토큰:')
    console.log(token)
    // 클립보드에 복사 (브라우저 환경)
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(token)
      console.log('토큰이 클립보드에 복사되었습니다!')
    }
  } else {
    console.log('토큰이 없습니다. 먼저 로그인해주세요.')
  }
  
  return token
}

// React import (Hook 예제 사용 시)
import { useState, useEffect } from 'react'

