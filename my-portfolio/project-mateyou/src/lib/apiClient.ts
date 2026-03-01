import { useAuthStore } from '@/store/useAuthStore'
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import axios, { AxiosError } from 'axios'
import { edgeApi } from './edgeApi'
import { supabase } from './supabase'
import { globalToast } from './toast'

// edgeApi를 re-export
export { edgeApi }

// API 응답 타입 정의
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: any
  }
  meta?: {
    total?: number
    page?: number
    limit?: number
  }
}

// Axios 인스턴스 생성
const apiClient: AxiosInstance = axios.create({
  baseURL: 'https://api.mateyou.me',
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30초 타임아웃
})

// 공개 API 경로 목록 (인증이 선택적이거나 불필요한 API)
const PUBLIC_API_PATHS = [
  '/api/partners/home',      // 파트너 홈 데이터 (currentUserId는 선택적)
  '/api/rankings',            // 랭킹 데이터 (공개)
  '/api/partners/list',       // 파트너 목록 (공개)
  '/api/partners/recent',     // 최근 파트너 (공개)
  '/api/banners',             // 배너 목록 (공개)
  '/public/',                 // 모든 /public/ 경로
]

// URL이 공개 API인지 확인
const isPublicApi = (url: string | undefined): boolean => {
  if (!url) return false
  return PUBLIC_API_PATHS.some(path => url.includes(path))
}

// 요청 인터셉터: 모든 요청에 토큰 자동 추가
apiClient.interceptors.request.use(
  async (config) => {
    try {
      // Supabase 세션에서 토큰 가져오기
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError) {
        console.warn('⚠️ 세션 조회 실패:', sessionError.message)
      }
      
      if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`
      } else {
        // 토큰이 없을 때 경고 (디버깅용)
        // 공개 API는 경고를 출력하지 않음
        if (config.url && !isPublicApi(config.url)) {
          console.warn('⚠️ 인증 토큰이 없습니다:', {
            url: config.url,
            method: config.method,
            hasSession: !!session,
            sessionError: sessionError?.message
          })
        }
      }

      // 환경 정보 헤더 추가 (백엔드가 적절한 Toss 키를 선택하도록)
      config.headers['x-is-production'] = 'true'

      // apikey 헤더는 새로운 API 서버(https://api.mateyou.me)에서는 필요 없음
      // Supabase Edge Functions를 사용하는 경우에만 필요
      // if (import.meta.env.VITE_SUPABASE_ANON_KEY) {
      //   config.headers.apikey = import.meta.env.VITE_SUPABASE_ANON_KEY
      // }

      return config
    } catch (error) {
      console.error('❌ API 요청 인터셉터 에러:', error)
      return config
    }
  },
  (error) => {
    console.error('❌ API 요청 설정 에러:', error)
    return Promise.reject(error)
  }
)

// 응답 인터셉터: 에러 처리 및 토큰 갱신
apiClient.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    // 성공 응답 처리
    return response
  },
  async (error: AxiosError<ApiResponse>) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean }

    // 401 에러 (인증 실패) 처리
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true

      try {
        // 현재 세션 상태 확인
        const { data: { session: currentSession }, error: sessionError } = await supabase.auth.getSession()
        
        console.log('🔍 [401 에러] 세션 상태 확인:', {
          hasSession: !!currentSession,
          hasToken: !!currentSession?.access_token,
          tokenExpiresAt: currentSession?.expires_at,
          sessionError: sessionError?.message,
          url: originalRequest.url
        })
        
        // 세션이 없으면 토큰 갱신 시도하지 않음
        if (!currentSession) {
          console.warn('⚠️ 세션이 없어 토큰 갱신을 시도하지 않습니다.')
          return Promise.reject(error)
        }

        // 세션이 있지만 토큰이 없거나 만료된 경우 토큰 갱신 시도
        const tokenExpired = currentSession.expires_at 
          ? new Date(currentSession.expires_at * 1000) < new Date()
          : false
        
        if (!currentSession.access_token || tokenExpired) {
          console.log('🔄 토큰이 없거나 만료됨, 토큰 갱신 시도 중...', {
            hasToken: !!currentSession.access_token,
            tokenExpired,
            expiresAt: currentSession.expires_at ? new Date(currentSession.expires_at * 1000).toISOString() : null
          })
        } else {
          console.log('🔄 토큰 갱신 시도 중 (토큰은 있지만 401 에러 발생)...')
        }
        
        const { data: { session }, error: refreshError } = await supabase.auth.refreshSession()

        if (refreshError || !session?.access_token) {
          // 토큰 갱신 실패
          console.error('❌ 토큰 갱신 실패:', {
            error: refreshError?.message,
            errorType: refreshError?.name,
            hasSession: !!session,
            hasToken: !!session?.access_token
          })
          
          // 공개 API가 아닌 경우에만 자동 로그아웃 시도
          // 공개 API는 인증이 선택적이므로 401 에러가 발생해도 자동 로그아웃하지 않음
          const isPublic = originalRequest.url ? isPublicApi(originalRequest.url) : false
          
          if (!isPublic) {
            // 세션이 만료되었거나 유효하지 않은 경우 강제 로그아웃
            console.warn('🚪 토큰 갱신 실패로 인한 자동 로그아웃 처리')
            try {
              // 세션 만료 토스트 표시
              globalToast.warning('세션이 만료되어서 다시 로그인해주세요', 5000)
              await useAuthStore.getState().logout()
              console.log('✅ 자동 로그아웃 완료')
            } catch (logoutError) {
              console.error('❌ 자동 로그아웃 중 에러:', logoutError)
            }
          } else {
            console.log('ℹ️ 공개 API이므로 자동 로그아웃을 시도하지 않습니다.')
          }
          
          // 에러를 그대로 반환 (상위에서 처리하도록)
          return Promise.reject(error)
        }

        console.log('✅ 토큰 갱신 성공, 요청 재시도', {
          newTokenExpiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : null
        })
        // 새 토큰으로 요청 재시도
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${session.access_token}`
        }

        return apiClient(originalRequest)
      } catch (refreshError: any) {
        // AuthSessionMissingError는 세션이 없는 경우이므로 무시
        if (refreshError?.message?.includes('Auth session missing')) {
          console.warn('⚠️ 세션이 없어 토큰 갱신을 시도하지 않습니다.')
          return Promise.reject(error)
        }
        
        console.error('❌ 토큰 갱신 중 에러:', {
          message: refreshError?.message,
          name: refreshError?.name,
          stack: refreshError?.stack
        })
        
        // 예외 발생 시에도 강제 로그아웃 처리
        console.warn('🚪 토큰 갱신 예외 발생으로 인한 자동 로그아웃 처리')
        try {
          // 세션 만료 토스트 표시
          globalToast.warning('세션이 만료되어서 다시 로그인해주세요', 5000)
          await useAuthStore.getState().logout()
          console.log('✅ 자동 로그아웃 완료')
        } catch (logoutError) {
          console.error('❌ 자동 로그아웃 중 에러:', logoutError)
        }
        
        return Promise.reject(error)
      }
    }

    // 에러 응답 처리
    const errorMessage = error.response?.data?.error?.message || error.message || '알 수 없는 에러가 발생했습니다'
    const errorCode = error.response?.data?.error?.code || 'UNKNOWN_ERROR'

    console.error(`❌ API 에러 [${errorCode}]:`, errorMessage)

    // 에러 객체 재구성
    const apiError = {
      ...error,
      message: errorMessage,
      code: errorCode,
      data: error.response?.data,
    }

    return Promise.reject(apiError)
  }
)

// API 클라이언트 헬퍼 함수들
export const api = {
  // GET 요청
  get: <T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<ApiResponse<T>>> => {
    return apiClient.get<ApiResponse<T>>(url, config)
  },

  // POST 요청
  post: <T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<ApiResponse<T>>> => {
    return apiClient.post<ApiResponse<T>>(url, data, config)
  },

  // PUT 요청
  put: <T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<ApiResponse<T>>> => {
    return apiClient.put<ApiResponse<T>>(url, data, config)
  },

  // PATCH 요청
  patch: <T = any>(
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ): Promise<AxiosResponse<ApiResponse<T>>> => {
    return apiClient.patch<ApiResponse<T>>(url, data, config)
  },

  // DELETE 요청
  delete: <T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<ApiResponse<T>>> => {
    return apiClient.delete<ApiResponse<T>>(url, config)
  },
}

// API 메서드들을 카테고리별로 그룹화
export const mateYouApi = {
  // Partners API
  partners: {
    /**
     * 멤버 코드로 파트너 상세 정보 조회
     */
    getDetailsByMemberCode: (memberCode: string) =>
      api.get(`/api/partners/details/${memberCode}`),

    /**
     * 파트너의 작업 목록 조회
     */
    getJobs: (memberId: string, active?: boolean) => {
      const params = new URLSearchParams()
      if (active !== undefined) params.set('active', active.toString())
      const query = params.toString()
      return api.get(`/api/partners/jobs/${memberId}${query ? `?${query}` : ''}`)
    },

    /**
     * 파트너 목록 조회 (페이지네이션)
     */
    getList: (params: {
      page?: number
      limit?: number
      search?: string
      game?: string
    } = {}) => {
      const searchParams = new URLSearchParams()
      if (params.page) searchParams.set('page', params.page.toString())
      if (params.limit) searchParams.set('limit', params.limit.toString())
      if (params.search) searchParams.set('search', params.search)
      if (params.game) searchParams.set('game', params.game)
      const query = searchParams.toString()
      return api.get(`/api/partners/list${query ? `?${query}` : ''}`)
    },

    /**
     * 최근 파트너 목록 조회
     */
    getRecent: (limit: number = 6) => api.get(`/api/partners/recent?limit=${limit}`),

    /**
     * 파트너 요청 상태 조회
     */
    getRequestStatus: (currentUserId: string, partnerId: string) => {
      return api.get(`/api/partners/request-status?currentUserId=${currentUserId}&partnerId=${partnerId}`)
    },

    /**
     * 파트너 홈 데이터 조회
     * Express API가 없을 경우 Edge Function으로 자동 fallback
     */
    getHome: async (params: {
      currentUserId?: string
      onlineLimit?: number
      recentLimit?: number
    } = {}) => {
      const searchParams = new URLSearchParams()
      if (params.currentUserId) searchParams.set('currentUserId', params.currentUserId)
      if (params.onlineLimit) searchParams.set('onlineLimit', params.onlineLimit.toString())
      if (params.recentLimit) searchParams.set('recentLimit', params.recentLimit.toString())
      const query = searchParams.toString()
      
      try {
        // Express API 시도
        const response = await api.get(`/api/partners/home${query ? `?${query}` : ''}`)
        return response
      } catch (error: any) {
        // 404 에러 발생 시 Edge Function으로 fallback
        if (error?.response?.status === 404) {
          console.log('⚠️ Express API /api/partners/home가 없어 Edge Function으로 fallback합니다.')
          const edgeResponse = await edgeApi.partners.getHome(params)
          // Edge Function 응답은 이미 ApiResponse<T> 형식이므로 AxiosResponse로 감싸기
          return {
            data: edgeResponse, // edgeResponse는 이미 { success: true, data: {...} } 형식
            status: 200,
            statusText: 'OK',
            headers: {},
            config: {},
          } as AxiosResponse<ApiResponse>
        }
        // 다른 에러는 그대로 throw
        throw error
      }
    },

    /**
     * 멤버 ID로 파트너 ID 조회
     */
    getPartnerIdByMemberId: (memberId: string) =>
      api.get(`/api/partners/lookup-by-member-id/${memberId}`),

    /**
     * 멤버 ID로 파트너 공통 정보 조회
     */
    getCommonInfo: (memberId: string) =>
      api.get(`/api/partners/common-info/${memberId}`),

    /**
     * 파트너 ID로 비즈니스/정산 정보 조회
     */
    getBusinessInfo: (partnerId: string) =>
      api.get(`/api/partners/business-info/${partnerId}`),

    /**
     * 파트너 포인트 내역 조회
     */
    getPointHistory: (partnerId: string) =>
      api.get(`/api/partners/point-history/${partnerId}`),

    /**
     * 대기중인 출금 신청 금액 합계 조회
     */
    getPendingWithdrawals: (partnerId: string) =>
      api.get(`/api/partners/pending-withdrawals/${partnerId}`),

    /**
     * 파트너 상태 업데이트
     */
    updateStatus: (partnerId: string, status: string) =>
      api.put(`/api/partners/${partnerId}/status`, { status }),
  },

  // Auth API
  auth: {
    /**
     * 현재 사용자 정보 조회
     */
    getMe: () => api.get('/api/auth/me'),

    /**
     * 사용자 프로필 업데이트
     */
    updateProfile: (data: {
      name?: string
      favorite_game?: string[]
      current_status?: 'online' | 'offline' | 'matching' | 'in_game'
      profile_image?: string
    }) => api.put('/api/auth/profile', data),

    /**
     * 파트너 상태 조회
     */
    getPartnerStatus: () => api.get('/api/auth/partner-status'),

    /**
     * 파트너 신청
     */
    applyPartner: (data: {
      partner_name: string
      partner_message?: string
      game_info?: any
      legal_name?: string
      legal_email?: string
      legal_phone?: string
      payout_bank_code?: string
      payout_bank_name?: string
      payout_account_number?: string
      payout_account_holder?: string
      business_type?: string
    }) => api.post('/api/auth/partner-apply', data),

    /**
     * 파트너 신청 정보 업데이트 (pending 상태일 때)
     */
    updatePartnerApplication: (data: {
      partner_name?: string
      partner_message?: string
      game_info?: any
      legal_name?: string
      legal_email?: string
      legal_phone?: string
      payout_bank_code?: string
      payout_bank_name?: string
      payout_account_number?: string
      payout_account_holder?: string
      business_type?: string
    }) => api.put('/api/auth/partner-apply', data),
  },

  // Chat API
  chat: {
    /**
     * 채팅방 목록 조회
     */
    getRooms: () => api.get('/api/chat/rooms'),

    /**
     * 채팅방 생성 또는 조회
     */
    createRoom: (data: { partner_id: string }) => api.post('/api/chat/rooms', data),

    /**
     * 채팅방 메시지 목록 조회 (member_chats 테이블)
     */
    getMessages: (roomId: string, page: number = 1, limit: number = 100) => {
      return api.get(`/api/chat-messages/${roomId}?page=${page}&limit=${limit}`)
    },

    /**
     * 텍스트 메시지 전송
     */
    sendMessage: (data: {
      room_id: string
      message: string
      message_type?: 'text' | 'image' | 'system'
    }) => api.post('/api/chat/messages', data),

    /**
     * 텍스트 + 미디어 메시지 전송
     * - 파일은 먼저 uploadFiles로 업로드 후 media_files에 URL 전달
     */
    sendMessageWithMedia: (data: {
      room_id: string
      message?: string
      message_type?: 'text' | 'media'
      media_files: Array<{
        media_url: string
        media_type: 'image' | 'video' | 'file'
        file_name?: string
        thumbnail_url?: string
      }>
    }) => api.post('/api/chat/messages/with-media', data),

    /**
     * 파일 업로드 (채팅용)
     * - room_id: 채팅방 ID
     * - files: 업로드할 파일들
     * - thumbnails: 비디오 썸네일 (같은 인덱스로 매칭)
     */
    uploadFiles: (roomId: string, files: File[], thumbnails?: File[]) => {
      const formData = new FormData()
      formData.append('room_id', roomId)
      files.forEach((file) => formData.append('files', file))
      if (thumbnails) {
        thumbnails.forEach((thumb) => formData.append('thumbnails', thumb))
      }
      return api.post('/api/chat/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },

    /**
     * 채팅방 미디어 리스트 조회
     */
    getRoomMedia: (
      roomId: string,
      page: number = 1,
      limit: number = 50,
      mediaType?: 'image' | 'video' | 'file'
    ) => {
      let url = `/api/chat/rooms/${roomId}/media?page=${page}&limit=${limit}`
      if (mediaType) url += `&media_type=${mediaType}`
      return api.get(url)
    },

    /**
     * 채팅 상대 프로필 + 멤버십 조회
     */
    getProfiles: (partnerId: string) => api.get(`/api/chat/profiles?partnerId=${partnerId}`),

    /**
     * 메시지 읽음 처리
     */
    markAsRead: (roomId: string) => api.put('/api/chat/messages/read', { room_id: roomId }),

    /**
     * 채팅방 나가기 (비활성화)
     */
    deleteRoom: (roomId: string) => api.delete(`/api/chat/rooms/${roomId}`),
  },

  // Storage API
  storage: {
    /**
     * 파일 업로드
     */
    upload: (file: File, bucket: string, path: string, upsert: boolean = true) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('bucket', bucket)
      formData.append('path', path)
      formData.append('upsert', upsert.toString())
      return api.post('/api/storage/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
    },

    /**
     * 파일 삭제
     */
    delete: (data: { bucket: string; path: string }) => api.delete('/api/storage/delete', { data }),

    /**
     * 파일 URL 조회
     */
    getUrl: (bucket: string, path: string) => api.get(`/api/storage/url/${bucket}/${path}`),

    /**
     * 파일 정보 조회
     */
    getInfo: (bucket: string, path: string) => api.get(`/api/storage/info/${bucket}/${path}`),

    /**
     * 고유 파일 경로 생성
     */
    generatePath: (data: {
      originalName: string
      memberCode?: string
      userId?: string
    }) => api.post('/api/storage/generate-path', data),

    /**
     * 파일 목록 조회
     */
    listFiles: (bucket: string, params: {
      prefix?: string
      limit?: number
      offset?: number
    } = {}) => {
      const searchParams = new URLSearchParams()
      if (params.prefix) searchParams.set('prefix', params.prefix)
      if (params.limit) searchParams.set('limit', params.limit.toString())
      if (params.offset) searchParams.set('offset', params.offset.toString())
      const query = searchParams.toString()
      return api.get(`/api/storage/list/${bucket}${query ? `?${query}` : ''}`)
    },
  },

  // Reviews API
  reviews: {
    /**
     * 리뷰 작성/수정
     */
    submit: (data: {
      partner_id: string
      rating: number
      comment?: string
      request_id?: string
      existing_review_id?: string
      points_earned?: number
    }) => api.post('/api/reviews/submit', data),

    /**
     * 파트너 리뷰 목록 조회
     */
    getPartnerReviews: (partnerId: string, page: number = 1, limit: number = 10) =>
      api.get(`/api/reviews/partner/${partnerId}?page=${page}&limit=${limit}`),

    /**
     * 내 리뷰 목록 조회
     */
    getMyReviews: (page: number = 1, limit: number = 10) =>
      api.get(`/api/reviews/my-reviews?page=${page}&limit=${limit}`),

    /**
     * 미완성 리뷰 조회
     */
    getIncompleteReviews: () => api.get('/api/reviews/incomplete'),

    /**
     * 리뷰 삭제
     */
    deleteReview: (reviewId: string) => api.delete(`/api/reviews/${reviewId}`),
  },

  // Partner Dashboard API
  partnerDashboard: {
    /**
     * 파트너 작업 생성
     */
    createJob: (data: {
      job_name: string
      job_description?: string
      coins_per_job: number
    }) => api.post('/api/partner-dashboard/jobs', data),

    /**
     * 파트너 작업 수정
     */
    updateJob: (jobId: string, data: {
      job_name?: string
      job_description?: string
      job_price?: number
      is_active?: boolean
    }) => api.put(`/api/partner-dashboard/jobs/${jobId}`, data),

    /**
     * 파트너 작업 삭제
     */
    deleteJob: (jobId: string) => api.delete(`/api/partner-dashboard/jobs/${jobId}`),

    /**
     * 파트너 요청 목록 조회
     */
    getRequests: (params: {
      page?: number
      limit?: number
      status?: 'pending' | 'accepted' | 'rejected' | 'completed'
    } = {}) => {
      const searchParams = new URLSearchParams()
      if (params.page) searchParams.set('page', params.page.toString())
      if (params.limit) searchParams.set('limit', params.limit.toString())
      if (params.status) searchParams.set('status', params.status)
      const query = searchParams.toString()
      return api.get(`/api/partner-dashboard/requests${query ? `?${query}` : ''}`)
    },

    /**
     * 파트너 요청 상태 업데이트
     */
    updateRequestStatus: (requestId: string, data: {
      status: string
      response_message?: string
    }) => api.put(`/api/partner-dashboard/requests/${requestId}/status`, data),

    /**
     * 파트너 요청 자동 취소 (시간 만료 시)
     */
    autoCancelRequest: (requestId: string) => 
      api.post(`/api/partner-dashboard/requests/${requestId}/auto-cancel`),

    /**
     * 파트너 통계 조회
     */
    getStats: () => api.get('/api/partner-dashboard/stats'),

    /**
     * 월간 클라이언트 랭킹 조회
     */
    getMonthlyClientRanking: (memberId?: string) => {
      const query = memberId ? `?memberId=${memberId}` : ''
      return api.get(`/api/partner-dashboard/monthly-client-ranking${query}`)
    },

    /**
     * 출금 신청
     * Express API 서버 사용 (https://api.mateyou.me/api/partner-dashboard/points/withdraw)
     * 트랜잭션 안전성을 위해 서버에서 원자적으로 처리됨
     */
    submitWithdrawal: (data: {
      amount: number
      bank_info: {
        bank_name: string
        bank_owner: string
        bank_num: string
        bank_code?: string
      }
      notes?: string
      point_type?: 'total_points' | 'store_points' | 'collaboration_store_points'
    }) => api.post('/api/partner-dashboard/points/withdraw', data),

    /**
     * 정산 정보(business info) 업데이트
     * partner_business_info 테이블의 legal/payout 정보만 업데이트
     */
    updateBusinessInfo: (data: {
      legalName?: string
      legalEmail?: string
      legalPhone?: string
      payoutBankCode?: string
      payoutBankName?: string
      payoutAccountNumber?: string
      payoutAccountHolder?: string
    }) => api.put('/api/partner-dashboard/business-info', data),
  },

  // Members API
  members: {
    /**
     * 멤버 검색
     */
    search: (params: {
      q: string
      page?: number
      limit?: number
    }) => {
      const searchParams = new URLSearchParams()
      searchParams.set('q', params.q)
      if (params.page) searchParams.set('page', params.page.toString())
      if (params.limit) searchParams.set('limit', params.limit.toString())
      return api.get(`/api/members/search?${searchParams.toString()}`)
    },

    /**
     * 멤버 상세 정보 조회
     */
    getDetails: (memberId: string) => api.get(`/api/members/member/${memberId}`),

    /**
     * 멤버 코드로 멤버 조회
     */
    getByCode: (memberCode: string) => api.get(`/api/members/code/${memberCode}`),

    /**
     * 파트너 요청 목록 조회 (클라이언트 또는 파트너 관점)
     */
    getRequests: (params: {
      status?: string
      as?: 'client' | 'partner'
      limit?: number
      offset?: number
    } = {}) => {
      const searchParams = new URLSearchParams()
      if (params.status) searchParams.set('status', params.status)
      if (params.as) searchParams.set('as', params.as)
      if (params.limit) searchParams.set('limit', params.limit.toString())
      if (params.offset) searchParams.set('offset', params.offset.toString())
      const query = searchParams.toString()
      return api.get(`/api/members/requests${query ? `?${query}` : ''}`)
    },

    /**
     * 채팅 메시지 전송
     */
    sendChatMessage: (data: {
      receiver_id: string
      message: string
    }) => api.post('/api/members/chat/send', data),

    /**
     * 채팅 메시지 목록 조회
     */
    getChatMessages: (partnerId: string, page: number = 1, limit: number = 50) => {
      return api.get(`/api/members/chat/messages?partner_id=${partnerId}&page=${page}&limit=${limit}`)
    },

    /**
     * 메시지 읽음 처리
     */
    markMessagesAsRead: (senderId: string) =>
      api.put('/api/members/chat/mark-read', { sender_id: senderId }),

    /**
     * 채팅방 목록 조회
     */
    getChatRooms: () => api.get('/api/members/chat/rooms'),

    /**
     * 최근 파트너 목록 조회
     */
    getRecentPartners: (limit: number = 6) =>
      api.get(`/api/members/recent-partners?limit=${limit}`),

    /**
     * 포인트 로그 조회
     */
    getPointsHistory: (params: {
      limit?: number
      offset?: number
    } = {}) => {
      const searchParams = new URLSearchParams()
      if (params.limit) searchParams.set('limit', params.limit.toString())
      if (params.offset) searchParams.set('offset', params.offset.toString())
      const query = searchParams.toString()
      return api.get(`/api/members/points/logs${query ? `?${query}` : ''}`)
    },

    /**
     * 포인트 로그 추가
     */
    addPointsLog: (data: {
      type: 'earn' | 'spend' | 'withdraw'
      amount: number
      description: string
      log_id?: string
    }) => api.post('/api/members/points/log', data),

    /**
     * 포인트 로그 추가 (하위 호환성)
     */
    logPoints: (data: {
      points: number
      reason: string
      reference_type?: string
      reference_id?: string
    }) => api.post('/api/members/points/log', data),

    /**
     * 후원하기
     */
    donation: (data: {
      partner_id: string
      amount: number
      description: string
      log_id?: string
    }) => api.post('/api/members/donation', data),

    /**
     * 파트너 차단
     */
    blockPartner: (partnerId: string) =>
      api.post('/api/members/partner/block', { partner_id: partnerId }),

    /**
     * 파트너 차단 해제
     */
    unblockPartner: (partnerId: string) =>
      api.post('/api/members/partner/unblock', { partner_id: partnerId }),

    /**
     * 차단된 사용자 목록 조회
     */
    getBlockedUsers: () => api.get('/api/members/partner/blocked-users'),

    /**
     * 멤버 ID로 파트너 ID 조회
     */
    getPartnerIdByMemberId: (memberId: string) =>
      api.get(`/api/members/partner/lookup/${memberId}`),

    /**
     * 파트너 요청 생성
     */
    createPartnerRequest: (data: {
      partner_id: string
      job_id: string
      job_name: string
      job_count: number
      coins_per_job: number
      note?: string
    }) => api.post('/api/members/partner/request', data),

    /**
     * 사용자 포인트 조회
     */
    getUserPoints: () => api.get('/api/members/points'),

    /**
     * 포인트 차감
     */
    deductPoints: (data: {
      amount: number
      reason: string
      reference_id?: string
    }) => api.post('/api/members/points/deduct', data),

    /**
     * 포인트 복구
     */
    restorePoints: (data: {
      amount: number
      reason: string
      reference_id?: string
    }) => api.post('/api/members/points/restore', data),
  },

  // Payment API
  payment: {
    /**
     * 결제 승인 (토스페이먼츠)
     * 포인트 충전 시 사용
     * Express API 서버 사용 (https://api.mateyou.me/api/payment/confirm)
     */
    confirm: (data: {
      paymentKey: string
      orderId: string
      amount: number
    }) => api.post('/api/payment/confirm', data),
  },

  // Admin API
  admin: {
    /**
     * 파트너 목록 관리
     */
    getPartners: (params: {
      status?: 'pending' | 'approved' | 'rejected'
      page?: number
      limit?: number
      search?: string
      member_id?: string
    } = {}) => {
      const searchParams = new URLSearchParams()
      if (params.status) searchParams.set('status', params.status)
      if (params.page) searchParams.set('page', params.page.toString())
      if (params.limit) searchParams.set('limit', params.limit.toString())
      if (params.search) searchParams.set('search', params.search)
      if (params.member_id) searchParams.set('member_id', params.member_id)
      const query = searchParams.toString()
      return api.get(`/api/admin/partners${query ? `?${query}` : ''}`)
    },

    /**
     * Pending 상태인 모든 파트너 조회 (limit 없음)
     */
    getPartnersPending: () => api.get('/api/admin/partners/pending'),

    /**
     * 파트너 상세 조회 (partner_business_info 포함)
     */
    getPartnerDetail: (partnerId: string) =>
      api.get(`/api/admin/partners/${partnerId}`),

    /**
     * 파트너 상태 업데이트
     */
    updatePartnerStatus: (partnerId: string, status: 'pending' | 'approved' | 'rejected') =>
      api.put(`/api/admin/partners/${partnerId}/status`, { status }),

    /**
     * 파트너 세금 정보 업데이트
     */
    updatePartnerTax: (partnerId: string, tax: number) =>
      api.put(`/api/admin/partners/${partnerId}/tax`, { tax }),

    /**
     * 파트너 삭제
     */
    deletePartner: (partnerId: string) => api.delete(`/api/admin/partners/${partnerId}`),

    /**
     * 멤버 ID로 파트너 삭제
     */
    deletePartnerByMember: (memberId: string) =>
      api.delete(`/api/admin/members/${memberId}/partner`),

    /**
     * 배너 목록 조회
     */
    getBanners: (params: {
      page?: number
      limit?: number
    } = {}) => {
      const searchParams = new URLSearchParams()
      if (params.page) searchParams.set('page', params.page.toString())
      if (params.limit) searchParams.set('limit', params.limit.toString())
      const query = searchParams.toString()
      return api.get(`/api/admin/banners${query ? `?${query}` : ''}`)
    },

    /**
     * 배너 생성
     */
    createBanner: (data: {
      title: string
      description?: string
      image_url: string
      link_url?: string
      is_active?: boolean
    }) => api.post('/api/admin/banners', data),

    /**
     * 배너 수정
     */
    updateBanner: (bannerId: string, data: {
      title?: string
      description?: string
      image_url?: string
      link_url?: string
      is_active?: boolean
    }) => api.put(`/api/admin/banners/${bannerId}`, data),

    /**
     * 배너 삭제
     */
    deleteBanner: (bannerId: string) => api.delete(`/api/admin/banners/${bannerId}`),

    /**
     * 출금 요청 목록 조회
     */
    getWithdrawals: (params: {
      status?: string
      withdrawal_type?: 'total_points' | 'store_points' | 'collaboration_store_points'
      page?: number
      limit?: number
    } = {}) => {
      const searchParams = new URLSearchParams()
      if (params.status) searchParams.set('status', params.status)
      if (params.withdrawal_type) searchParams.set('withdrawal_type', params.withdrawal_type)
      if (params.page) searchParams.set('page', params.page.toString())
      if (params.limit) searchParams.set('limit', params.limit.toString())
      const query = searchParams.toString()
      return api.get(`/api/admin/withdrawals${query ? `?${query}` : ''}`)
    },

    /**
     * 출금 요청 상태 업데이트
     */
    updateWithdrawalStatus: (withdrawalId: string, data: {
      status: string
      admin_notes?: string
    }) => api.put(`/api/admin/withdrawals/${withdrawalId}/status`, data),

    /**
     * 토스 페이먼츠 잔액 조회
     * Express API 서버 사용 (https://api.mateyou.me/api/toss/balance)
     */
    getTossBalance: () => api.get('/api/toss/balance'),

    /**
     * 관리자 통계 조회
     */
    getStats: () => api.get('/api/admin/stats'),

    /**
     * 회원 포인트 로그 조회
     */
    getMemberPointsLogs: (params: {
      page?: number
      limit?: number
      type?: 'earn' | 'spend'
      search?: string
      member_id?: string
      start_date?: string
      end_date?: string
    } = {}) => {
      const searchParams = new URLSearchParams()
      if (params.page) searchParams.set('page', params.page.toString())
      if (params.limit) searchParams.set('limit', params.limit.toString())
      if (params.type) searchParams.set('type', params.type)
      if (params.search) searchParams.set('search', params.search)
      if (params.member_id) searchParams.set('member_id', params.member_id)
      if (params.start_date) searchParams.set('start_date', params.start_date)
      if (params.end_date) searchParams.set('end_date', params.end_date)
      const query = searchParams.toString()
      return api.get(`/api/admin/member-points-logs${query ? `?${query}` : ''}`)
    },

    /**
     * 파트너 포인트 로그 조회
     */
    getPartnerPointsLogs: (params: {
      page?: number
      limit?: number
      type?: 'earn' | 'spend'
      search?: string
      partner_id?: string
      start_date?: string
      end_date?: string
    } = {}) => {
      const searchParams = new URLSearchParams()
      if (params.page) searchParams.set('page', params.page.toString())
      if (params.limit) searchParams.set('limit', params.limit.toString())
      if (params.type) searchParams.set('type', params.type)
      if (params.search) searchParams.set('search', params.search)
      if (params.partner_id) searchParams.set('partner_id', params.partner_id)
      if (params.start_date) searchParams.set('start_date', params.start_date)
      if (params.end_date) searchParams.set('end_date', params.end_date)
      const query = searchParams.toString()
      return api.get(`/api/admin/partner-points-logs${query ? `?${query}` : ''}`)
    },

    /**
     * 멤버 목록 조회
     */
    getMembers: (params: {
      role?: string
      page?: number
      limit?: number
      search?: string
    } = {}) => {
      const searchParams = new URLSearchParams()
      if (params.role) searchParams.set('role', params.role)
      if (params.page) searchParams.set('page', params.page.toString())
      if (params.limit) searchParams.set('limit', params.limit.toString())
      if (params.search) searchParams.set('search', params.search)
      const query = searchParams.toString()
      return api.get(`/api/admin/members${query ? `?${query}` : ''}`)
    },
  },

  // Banners API (Public)
  banners: {
    /**
     * 활성 배너 목록 조회 (공개)
     */
    getActiveBanners: (params: {
      page?: number
      limit?: number
      location?: 'main' | 'partner_dashboard'
    } = {}) => {
      const searchParams = new URLSearchParams()
      if (params.page) searchParams.set('page', params.page.toString())
      if (params.limit) searchParams.set('limit', params.limit.toString())
      if (params.location) searchParams.set('location', params.location)
      const query = searchParams.toString()
      return api.get(`/api/admin/public/banners${query ? `?${query}` : ''}`)
    },
  },

  // Voice Call API
  voiceCall: {
    /**
     * 통화 시작
     */
    startCall: (data: {
      partner_id: string
      partner_name: string
      call_id?: string
      device_info?: { os: string; browser: string }
    }) => api.post('/api/voice-call/start', data),

    /**
     * 통화 참여
     */
    joinCall: (data: {
      room_id: string
      device_info?: { os: string; browser: string }
    }) => api.post('/api/voice-call/join', data),

    /**
     * 통화 종료
     */
    endCall: (data: { room_id: string }) => api.post('/api/voice-call/end', data),

    /**
     * 통화 상태 조회
     */
    getCallStatus: (roomId: string) => api.get(`/api/voice-call/status/${roomId}`),

    /**
     * 활성 통화 목록 조회
     */
    getActiveCalls: () => api.get('/api/voice-call/active'),
  },

  // Push Notification API (새로운 API)
  push: {
    /**
     * 푸시 알림 구독 저장
     * 앱 시작 시 또는 사용자가 푸시 알림을 허용할 때 한 번만 호출
     */
    subscribe: (data: {
      endpoint: string
      keys: {
        p256dh: string
        auth: string
      }
    }) => api.post('/api/push/subscribe', data),

    /**
     * 푸시 알림 큐에 추가 (권장)
     * 일반적인 푸시 알림을 보낼 때 사용 (메시지, 의뢰, 시스템 알림 등)
     * 백그라운드 워커가 자동으로 처리하므로 비동기적으로 처리됨
     */
    queue: (data: {
      target_member_id?: string | null
      target_partner_id?: string | null
      title: string
      body: string
      notification_type?: 'message' | 'request' | 'payment' | 'system' | 'call' | 'review'
      url?: string
      tag?: string
      icon?: string
      data?: Record<string, any>
    }) => api.post('/api/push/queue', data),

    /**
     * 푸시 알림 즉시 전송 (선택적)
     * 긴급한 알림이 필요할 때 사용 (통화, 긴급 메시지 등)
     * 큐를 거치지 않고 즉시 전송
     */
    send: (data: {
      target_member_id?: string | null
      target_partner_id?: string | null
      title: string
      body: string
      notification_type?: 'message' | 'request' | 'payment' | 'system' | 'call' | 'review'
      url?: string
      tag?: string
      icon?: string
      data?: Record<string, any>
    }) => api.post('/api/push/send', data),
  },

  // Push Notification API (기존 API - 하위 호환성을 위해 유지)
  pushNotification: {
    /**
     * 푸시 알림 구독 저장
     * @deprecated 새로운 API 사용: push.subscribe
     */
    saveSubscription: (data: {
      member_id: string | null
      partner_id: string | null
      endpoint: string
      p256dh: string
      auth: string
      user_agent: string
    }) => api.post('/api/push-notification', {
      action: 'save_subscription',
      ...data,
    }),

    /**
     * 푸시 알림 구독 삭제
     * @deprecated 새로운 API 사용: push.subscribe (구독 해제는 자동 처리)
     */
    removeSubscription: (data: {
      member_id: string | null
      partner_id: string | null
    }) => api.post('/api/push-notification', {
      action: 'remove_subscription',
      ...data,
    }),

    /**
     * 푸시 알림 전송
     * @deprecated 새로운 API 사용: push.queue 또는 push.send
     */
    send: (data: {
      target_member_id?: string | null
      target_partner_id?: string | null
      payload: {
        title: string
        body: string
        icon?: string
        url?: string
        tag?: string
        type?: string
        data?: Record<string, any>
      }
    }) => api.post('/api/push-notification', {
      action: 'send_notification',
      ...data,
    }),
  },

  // Push Notification Auto API (기존 API - 하위 호환성을 위해 유지)
  pushAuto: {
    /**
     * 자동 푸시 알림 전송 (web_push_subscriptions 기반)
     * @deprecated 새로운 API 사용: push.queue 또는 push.send
     */
    send: (data: {
      target_id: string
      notification_type?: string
      title: string
      body: string
      url?: string
      data?: Record<string, any>
    }) => api.post('/api/push-notification-auto', data),
  },

  // Rankings API
  rankings: {
    /**
     * 파트너 랭킹 조회
     * 인기 파트너, 핫한 파트너, 활동이 활발한 회원 랭킹을 조회합니다.
     */
    getRankings: () => api.get<{
      popularPartners: Array<{
        id: string
        name: string
        profileImage?: string | null
        count: number
        memberCode?: string
      }>
      hotPartners: Array<{
        id: string
        name: string
        profileImage?: string | null
        count: number
        memberCode?: string
      }>
      activeMembers: Array<{
        id: string
        name: string
        profileImage?: string | null
        count: number
        memberCode?: string
      }>
    }>('/api/rankings'),
  },

  // Email API
  email: {
    /**
     * 메일 발송
     * @param to 수신자 이메일 주소
     * @param subject 메일 제목
     * @param html 메일 본문 (HTML)
     * @param text 메일 본문 (텍스트, 선택사항)
     */
    send: (params: {
      to: string
      subject: string
      html: string
      text?: string
    }) => api.post('/api/email/send', params),
    /**
     * member_id로 메일 발송
     * @param member_id 수신자 member_id
     * @param subject 메일 제목
     * @param html 메일 본문 (HTML)
     * @param text 메일 본문 (텍스트, 선택사항)
     */
    sendByMemberId: (params: {
      member_id: string
      subject: string
      html: string
      text?: string
    }) => api.post('/api/email/send-by-member-id', params),
  },

  // Stream API
  stream: {
    /**
     * 방송 후원 (미션 escrow 처리 포함)
     * @param partner_id 파트너 ID
     * @param amount 후원 금액 (최소 1,000P)
     * @param description 후원 설명
     * @param log_id 중복 방지 로그 ID (선택)
     * @param donation_type 후원 타입 ('basic' | 'mission' | 'video' | 'roulette')
     * @param room_id 방송방 ID (선택)
     */
    donation: (data: {
      partner_id: string
      amount: number
      description: string
      log_id?: string
      donation_type?: 'basic' | 'mission' | 'video' | 'roulette'
      room_id?: string
    }) => {
      // Edge Function을 사용하므로 edgeApi 사용
      return edgeApi.stream.donation(data).then(result => ({
        data: result,
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {},
      } as AxiosResponse<ApiResponse>))
    },
  },

  // Toss API
  toss: {
    /**
     * 토스 셀러 등록/수정
     * Express API 서버 사용 (https://api.mateyou.me/api/toss/seller)
     */
    syncSeller: (data: {
      mode: 'create' | 'update'
      sellerId?: string | null
      payload: Record<string, unknown>
    }) => api.post('/api/toss/seller', data),

    /**
     * 토스 지급 요청
     * Express API 서버 사용 (https://api.mateyou.me/api/toss/payout)
     */
    requestPayout: (data: {
      payouts: Array<Record<string, unknown>>
      idempotencyKey?: string
    }) => api.post('/api/toss/payout', data),

    /**
     * 토스 지급 요청 (복수형 엔드포인트)
     * Express API 서버 사용 (https://api.mateyou.me/api/toss/payouts)
     */
    requestPayouts: (data: {
      withdrawalIds: Array<string>
      isProductionValue?: boolean
    }) => api.post('/api/toss/payouts', data),

    /**
     * 토스 잔액 조회 (관리자용)
     * Express API 서버 사용 (https://api.mateyou.me/api/toss/balance)
     */
    getBalance: () => api.get('/api/toss/balance'),

    /**
     * 토스 셀러 목록 조회 (관리자용)
     * Express API 서버 사용 (https://api.mateyou.me/api/toss/sellers)
     */
    getSellers: () => api.get('/api/toss/sellers'),

    /**
     * 토스 셀러 상세 조회
     * Express API 서버 사용 (https://api.mateyou.me/api/toss/sellers/{sellerId})
     */
    getSeller: (sellerId: string) => api.get(`/api/toss/sellers/${sellerId}`),

    /**
     * 토스 셀러 삭제
     * Express API 서버 사용 (https://api.mateyou.me/api/toss/sellers/{sellerId})
     */
    deleteSeller: (sellerId: string) => api.delete(`/api/toss/sellers/${sellerId}`),

    /**
     * 토스 셀러 정보 수정
     * Express API 서버 사용 (https://api.mateyou.me/api/toss/sellers/{sellerId})
     */
    updateSeller: (sellerId: string, data: Record<string, unknown>) =>
      api.post(`/api/toss/sellers/${sellerId}`, data),

    /**
     * 토스 지급대행 목록 조회 (관리자용)
     * Express API 서버 사용 (https://api.mateyou.me/api/payouts)
     */
    getPayouts: (params?: {
      limit?: number
      startingAfter?: string
      status?: 'REQUESTED' | 'COMPLETED' | 'FAILED' | 'CANCELED'
      destination?: string
      payoutDateGte?: string
      payoutDateLte?: string
    }) => api.get('/api/payouts', { params }),

    /**
     * 토스 지급대행 단건 조회 (관리자용)
     * Express API 서버 사용 (https://api.mateyou.me/api/payouts/{id})
     */
    getPayout: (payoutId: string) => api.get(`/api/payouts/${payoutId}`),

    /**
     * 토스 지급대행 취소 (관리자용)
     * Express API 서버 사용 (https://api.mateyou.me/api/payouts/{id}/cancel)
     * REQUESTED 상태인 경우에만 취소 가능
     */
    cancelPayout: (payoutId: string) => api.post(`/api/payouts/${payoutId}/cancel`),
  },

  // Partner Profile API
  partnerProfile: {
    /**
     * 파트너 프로필 정보 조회
     */
    info: () => api.get('/api/partner-profile/info'),

    /**
     * 파트너 프로필 업데이트
     * Express API 서버 사용 (https://api.mateyou.me/api/partner-profile/update)
     */
    update: (data: {
      partnerName?: string
      partnerMessage?: string
      gameInfos?: any
      backgroundImages?: string[]
      legalName?: string
      legalEmail?: string
      legalPhone?: string
      profileImage?: string | null // null이면 삭제
      favoriteGame?: string[]
      categories?: Array<{ category_id: number; detail_category_id: number | null }>
    }) => api.put('/api/partner-profile/update', data),
  },
}

// 원본 axios 인스턴스도 export (필요한 경우 직접 사용)
export default apiClient

/**
 * 사용 예시:
 * 
 * // 1. 간단한 GET 요청
 * import { api } from '@/lib/apiClient'
 * 
 * const response = await api.get('/api-auth/me')
 * console.log(response.data.data) // 실제 데이터
 * 
 * // 2. 구조화된 API 사용 (권장)
 * import { mateYouApi } from '@/lib/apiClient'
 * 
 * // Auth API
 * const userInfo = await mateYouApi.auth.getMe()
 * console.log(userInfo.data.data)
 * 
 * // Partners API
 * const partners = await mateYouApi.partners.getList({ page: 1, limit: 10 })
 * const partnerDetails = await mateYouApi.partners.getDetailsByMemberCode('USER123')
 * 
 * // Chat API
 * const rooms = await mateYouApi.chat.getRooms()
 * await mateYouApi.chat.sendMessage({
 *   room_id: 'room-id',
 *   message: '안녕하세요',
 *   message_type: 'text'
 * })
 * 
 * // Storage API
 * const file = new File(['content'], 'image.jpg', { type: 'image/jpeg' })
 * await mateYouApi.storage.upload(file, 'avatars', 'user-123/avatar.jpg')
 * 
 * // 3. 에러 처리
 * try {
 *   const response = await mateYouApi.auth.getMe()
 * } catch (error) {
 *   console.error('에러 코드:', error.code)
 *   console.error('에러 메시지:', error.message)
 * }
 * 
 * // 4. 직접 axios 인스턴스 사용
 * import apiClient from '@/lib/apiClient'
 * 
 * const response = await apiClient.get('/api-auth/me', {
 *   headers: {
 *     'Custom-Header': 'value'
 *   }
 * })
 */

