// Edge Functions API client
import { supabase } from './supabase';

const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL;
const EXPRESS_API_URL = import.meta.env.VITE_API_URL || 'https://api.mateyou.me';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}

class EdgeApiClient {
  private async makeRequest<T>(
    functionName: string,
    path: string = '',
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const url = `${EDGE_FUNCTIONS_URL}/functions/v1/${functionName}${path}`;

      // Admin API requires authentication (except public endpoints)
      const isPublicEndpoint = path.includes('/public/');
      if (functionName === 'api-admin' && !isPublicEndpoint && !session?.access_token) {
        throw new Error('Authentication required for admin API');
      }

      // Use user token for authenticated requests, anon key for public requests
      const authToken = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;

      const headers: HeadersInit = {
        'Authorization': `Bearer ${authToken}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        ...options.headers,
      };

      // FormData인 경우 Content-Type을 설정하지 않음 (브라우저가 자동으로 boundary 포함해서 설정)
      // HeadersInit 타입이 Record<string, string> | Headers 등으로 확장될 수 있어서, 
      // 'Content-Type'을 안전하게 추가할 수 있도록 타입 단언을 활용
      if (!(options.body instanceof FormData)) {
        (headers as Record<string, string>)['Content-Type'] = 'application/json';
      }

      const response = await fetch(url, {
        ...options,
        headers,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || `HTTP ${response.status}`);
      }

      return result;
    } catch (error) {
      console.error(`Edge API Error (${functionName}${path}):`, error);
      throw error;
    }
  }

  // Express API 호출 메서드
  private async makeExpressRequest<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const url = `${EXPRESS_API_URL}${path}`;

      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...options.headers,
      };

      // 인증 토큰이 있으면 추가
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      // FormData인 경우 Content-Type을 설정하지 않음
      if (options.body instanceof FormData) {
        delete (headers as Record<string, string>)['Content-Type'];
      }

      const response = await fetch(url, {
        ...options,
        headers,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || result.message || `HTTP ${response.status}`);
      }

      return result;
    } catch (error) {
      console.error(`Express API Error (${path}):`, error);
      throw error;
    }
  }

  // Partners API
  partners = {
    getDetailsByMemberCode: (memberCode: string) =>
      this.makeRequest('api-partners', `/details/${memberCode}`),

    getJobs: (memberId: string, activeOnly: boolean = false) =>
      this.makeRequest('api-partners', `/jobs/${memberId}?active=${activeOnly}`),

    getList: (params: {
      page?: number;
      limit?: number;
      search?: string;
      game?: string;
    } = {}) => {
      const searchParams = new URLSearchParams();
      if (params.page) searchParams.set('page', params.page.toString());
      if (params.limit) searchParams.set('limit', params.limit.toString());
      if (params.search) searchParams.set('search', params.search);
      if (params.game) searchParams.set('game', params.game);

      const query = searchParams.toString();
      return this.makeRequest('api-partners', `/list${query ? `?${query}` : ''}`);
    },

    getRecent: (limit: number = 6) =>
      this.makeRequest('api-partners', `/recent?limit=${limit}`),

    getRequestStatus: (currentUserId: string, partnerId: string) =>
      this.makeRequest('api-partners', `/request-status?currentUserId=${currentUserId}&partnerId=${partnerId}`),

    getHome: (params: {
      currentUserId?: string;
      onlineLimit?: number;
      recentLimit?: number;
    } = {}) => {
      const searchParams = new URLSearchParams();
      if (params.currentUserId) searchParams.set('currentUserId', params.currentUserId);
      if (params.onlineLimit) searchParams.set('onlineLimit', params.onlineLimit.toString());
      if (params.recentLimit) searchParams.set('recentLimit', params.recentLimit.toString());

      const query = searchParams.toString();
      return this.makeRequest('api-partners', `/home${query ? `?${query}` : ''}`);
    },

    getPartnerIdByMemberId: (memberId: string) =>
      this.makeRequest('api-partners', `/lookup-by-member-id/${memberId}`),
  };

  // Auth API
  auth = {
    getMe: () =>
      this.makeRequest('api-auth', '/me'),

    updateProfile: (data: {
      name?: string;
      favorite_game?: string[];
      current_status?: string;
      profile_image?: string;
    }) =>
      this.makeRequest('api-auth', '/profile', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    getPartnerStatus: () =>
      this.makeRequest('api-auth', '/partner-status'),

    applyPartner: (data: {
      partner_name: string;
      partner_message?: string;
      game_info?: any;
    }) =>
      this.makeRequest('api-auth', '/partner-apply', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  };

  // Chat API
  chat = {
    getRooms: () =>
      this.makeRequest('api-chat', '/rooms'),

    createRoom: (partnerId: string) =>
      this.makeRequest('api-chat', '/rooms', {
        method: 'POST',
        body: JSON.stringify({ partner_id: partnerId }),
      }),

    getMessages: (roomId: string, page: number = 1, limit: number = 50) =>
      this.makeRequest('api-chat', `/messages/${roomId}?page=${page}&limit=${limit}`),

    sendMessage: (roomId: string, message: string, messageType: string = 'text') =>
      this.makeRequest('api-chat', '/messages', {
        method: 'POST',
        body: JSON.stringify({
          room_id: roomId,
          message,
          message_type: messageType,
        }),
      }),

    deleteRoom: (roomId: string) =>
      this.makeRequest('api-chat', `/rooms/${roomId}`, {
        method: 'DELETE',
      }),
  };

  // Storage API
  storage = {
    upload: (file: File, bucket: string, path: string, upsert: boolean = true) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('bucket', bucket);
      formData.append('path', path);
      formData.append('upsert', upsert.toString());

      return this.makeRequest('api-storage', '/upload', {
        method: 'POST',
        body: formData,
      });
    },

    delete: (bucket: string, path: string) =>
      this.makeRequest('api-storage', '/delete', {
        method: 'DELETE',
        body: JSON.stringify({ bucket, path }),
      }),

    getUrl: (bucket: string, path: string) =>
      this.makeRequest('api-storage', `/url/${bucket}/${path}`),

    getInfo: (bucket: string, path: string) =>
      this.makeRequest('api-storage', `/info/${bucket}/${path}`),

    generatePath: (originalName: string, memberCode?: string, userId?: string) =>
      this.makeRequest('api-storage', '/generate-path', {
        method: 'POST',
        body: JSON.stringify({ originalName, memberCode, userId }),
      }),

    listFiles: (bucket: string, prefix?: string, limit?: number, offset?: number) => {
      const params = new URLSearchParams();
      if (prefix) params.set('prefix', prefix);
      if (limit) params.set('limit', limit.toString());
      if (offset) params.set('offset', offset.toString());

      const query = params.toString();
      return this.makeRequest('api-storage', `/list/${bucket}${query ? `?${query}` : ''}`);
    },
  };

  // Push Notification Auto (web_push_subscriptions 기반 전송)
  pushAuto = {
    send: (data: {
      target_id: string;
      notification_type?: string;
      title: string;
      body: string;
      url?: string;
      data?: Record<string, any>;
    }) =>
      this.makeRequest('push-notification-auto', '', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  };

  // Push Notification (구독 저장/삭제 및 직접 전송)
  pushNotification = {
    saveSubscription: (data: {
      member_id: string | null;
      partner_id: string | null;
      endpoint: string;
      p256dh: string;
      auth: string;
      user_agent: string;
    }) =>
      this.makeRequest('push-notification', '', {
        method: 'POST',
        body: JSON.stringify({
          action: 'save_subscription',
          ...data,
        }),
      }),

    removeSubscription: (data: {
      member_id: string | null;
      partner_id: string | null;
    }) =>
      this.makeRequest('push-notification', '', {
        method: 'POST',
        body: JSON.stringify({
          action: 'remove_subscription',
          ...data,
        }),
      }),

    send: (data: {
      target_member_id?: string | null;
      target_partner_id?: string | null;
      payload: {
        title: string;
        body: string;
        icon?: string;
        url?: string;
        tag?: string;
        type?: string;
        data?: Record<string, any>;
      };
    }) =>
      this.makeRequest('push-notification', '', {
        method: 'POST',
        body: JSON.stringify({
          action: 'send_notification',
          ...data,
        }),
      }),
  };

  // Reviews API
  reviews = {
    submit: (data: {
      partner_id: string;
      rating: number;
      comment?: string;
      request_id?: string;
      existing_review_id?: string;
      points_earned?: number;
    }) =>
      this.makeRequest('api-reviews', '/submit', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    getPartnerReviews: (partnerId: string, page: number = 1, limit: number = 10) =>
      this.makeRequest('api-reviews', `/partner/${partnerId}?page=${page}&limit=${limit}`),

    getMyReviews: (page: number = 1, limit: number = 10) =>
      this.makeRequest('api-reviews', `/my-reviews?page=${page}&limit=${limit}`),

    getIncompleteReviews: () =>
      this.makeRequest('api-reviews', '/incomplete'),

    deleteReview: (reviewId: string) =>
      this.makeRequest('api-reviews', `/${reviewId}`, {
        method: 'DELETE',
      }),
  };

  // Partner Dashboard API
  partnerDashboard = {
    createJob: (data: { job_name: string; job_description?: string; coins_per_job: number }) =>
      this.makeRequest('api-partner-dashboard', '/jobs', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    updateJob: (jobId: string, data: { job_name?: string; job_description?: string; job_price?: number; is_active?: boolean }) =>
      this.makeRequest('api-partner-dashboard', `/jobs/${jobId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    deleteJob: (jobId: string) =>
      this.makeRequest('api-partner-dashboard', `/jobs/${jobId}`, {
        method: 'DELETE',
      }),

    getRequests: (page: number = 1, limit: number = 20, status?: string) => {
      const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
      if (status) params.set('status', status);
      return this.makeRequest('api-partner-dashboard', `/requests?${params.toString()}`);
    },

    updateRequestStatus: (requestId: string, data: { status: string; response_message?: string }) =>
      this.makeRequest('api-partner-dashboard', `/requests/${requestId}/status`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    getStats: () =>
      this.makeRequest('api-partner-dashboard', '/stats'),

    getMonthlyClientRanking: (memberId?: string) => {
      const query = memberId ? `?memberId=${memberId}` : ''
      return this.makeRequest('api-partner-dashboard', `/monthly-client-ranking${query}`)
    },

    submitWithdrawal: (data: { amount: number; bank_info: any; notes?: string }) =>
      this.makeRequest('api-partner-dashboard', '/points/withdraw', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  };

  // Members API
  members = {
    search: (query: string, page: number = 1, limit: number = 20) =>
      this.makeRequest('api-members', `/search?q=${encodeURIComponent(query)}&page=${page}&limit=${limit}`),

    getByCode: (memberCode: string) =>
      this.makeExpressRequest(`/api/members/by-code/${memberCode}`),

    getDetails: (memberId: string) =>
      this.makeRequest('api-members', `/member/${memberId}`),

    getRequests: (params: { status?: string; as?: 'client' | 'partner'; limit?: number; offset?: number } = {}) => {
      const searchParams = new URLSearchParams();
      if (params.status) searchParams.set('status', params.status);
      if (params.as) searchParams.set('as', params.as);
      if (params.limit) searchParams.set('limit', params.limit.toString());
      if (params.offset) searchParams.set('offset', params.offset.toString());

      const query = searchParams.toString();
      return this.makeRequest('api-members', `/requests${query ? `?${query}` : ''}`);
    },

    getRequestById: (requestId: string) =>
      this.makeRequest('api-members', `/requests/${requestId}`),

    sendChatMessage: (data: { receiver_id: string; message: string }) =>
      this.makeRequest('api-members', '/chat/send', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    getChatMessages: (partnerId: string, page: number = 1, limit: number = 50) =>
      this.makeRequest('api-members', `/chat/messages?partner_id=${partnerId}&page=${page}&limit=${limit}`),

    markMessagesAsRead: (senderId: string) =>
      this.makeRequest('api-members', '/chat/mark-read', {
        method: 'PUT',
        body: JSON.stringify({ sender_id: senderId }),
      }),

    getChatRooms: () =>
      this.makeRequest('api-members', '/chat/rooms'),

    getRecentPartners: (limit: number = 6) =>
      this.makeRequest('api-members', `/recent-partners?limit=${limit}`),

    // 포인트 로그 조회
    getPointsHistory: (params: { limit?: number; offset?: number } = {}) => {
      const searchParams = new URLSearchParams();
      if (params.limit) searchParams.set('limit', params.limit.toString());
      if (params.offset) searchParams.set('offset', params.offset.toString());

      const query = searchParams.toString();
      return this.makeRequest('api-members', `/points/logs${query ? `?${query}` : ''}`);
    },

    // 포인트 로그 추가
    addPointsLog: (data: { type: 'earn' | 'spend' | 'withdraw'; amount: number; description: string; log_id?: string }) =>
      this.makeRequest('api-members', '/points/log', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    // 기존 메서드 (하위 호환성)
    logPoints: (data: { points: number; reason: string; reference_type?: string; reference_id?: string }) =>
      this.makeRequest('api-members', '/points/log', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    // 파트너 차단 기능
    blockPartner: (partnerId: string) =>
      this.makeRequest('api-members', '/partner/block', {
        method: 'POST',
        body: JSON.stringify({ partner_id: partnerId }),
      }),

    // 파트너 차단 해제 기능
    unblockPartner: (partnerId: string) =>
      this.makeRequest('api-members', '/partner/unblock', {
        method: 'POST',
        body: JSON.stringify({ partner_id: partnerId }),
      }),

    // 차단된 사용자 목록 조회
    getBlockedUsers: () =>
      this.makeRequest('api-members', '/partner/blocked-users'),

    // 멤버 ID로 파트너 ID 조회
    getPartnerIdByMemberId: (memberId: string) =>
      this.makeRequest('api-members', `/partner/lookup/${memberId}`),

    // 파트너 요청 생성
    createPartnerRequest: (data: {
      partner_id: string;
      job_id: string;
      job_name: string;
      job_count: number;
      coins_per_job: number;
      note?: string;
    }) =>
      this.makeRequest('api-members', '/partner/request', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    // 포인트 관련
    getUserPoints: () =>
      this.makeRequest('api-members', '/points'),

    deductPoints: (data: { amount: number; reason: string; reference_id?: string }) =>
      this.makeRequest('api-members', '/points/deduct', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    restorePoints: (data: { amount: number; reason: string; reference_id?: string }) =>
      this.makeRequest('api-members', '/points/restore', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  };

  // Banners API (Public) - Using admin endpoint with public path
  banners = {
    getActiveBanners: (params: { page?: number; limit?: number; location?: 'main' | 'partner_dashboard' } = {}) => {
      const searchParams = new URLSearchParams();
      if (params.page) searchParams.set('page', params.page.toString());
      if (params.limit) searchParams.set('limit', params.limit.toString());
      if (params.location) searchParams.set('location', params.location);

      const query = searchParams.toString();
      return this.makeRequest('api-admin', `/public/banners${query ? `?${query}` : ''}`);
    },
  };

  // Admin API
  admin = {
    getPartners: (status?: string, page: number = 1, limit: number = 20) => {
      const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
      if (status) params.set('status', status);
      return this.makeRequest('api-admin', `/partners?${params.toString()}`);
    },

    updatePartnerStatus: (partnerId: string, data: { status: string; review_notes?: string }) =>
      this.makeRequest('api-admin', `/partners/${partnerId}/status`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    updatePartnerTax: (partnerId: string, tax: number) =>
      this.makeRequest('api-admin', `/partners/${partnerId}/tax`, {
        method: 'PUT',
        body: JSON.stringify({ tax }),
      }),

    deletePartner: (partnerId: string) =>
      this.makeRequest('api-admin', `/partners/${partnerId}`, {
        method: 'DELETE',
      }),

    deletePartnerByMember: (memberId: string) =>
      this.makeRequest('api-admin', `/members/${memberId}/partner`, {
        method: 'DELETE',
      }),

    getBanners: (page: number = 1, limit: number = 20) =>
      this.makeRequest('api-admin', `/banners?page=${page}&limit=${limit}`),

    createBanner: (data: { title: string; description?: string; image_url: string; link_url?: string; is_active?: boolean }) =>
      this.makeRequest('api-admin', '/banners', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    updateBanner: (bannerId: string, data: { title?: string; description?: string; image_url?: string; link_url?: string; is_active?: boolean }) =>
      this.makeRequest('api-admin', `/banners/${bannerId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    deleteBanner: (bannerId: string) =>
      this.makeRequest('api-admin', `/banners/${bannerId}`, {
        method: 'DELETE',
      }),

    getWithdrawals: (status?: string, page: number = 1, limit: number = 20) => {
      const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
      if (status) params.set('status', status);
      return this.makeRequest('api-admin', `/withdrawals?${params.toString()}`);
    },

    updateWithdrawalStatus: (withdrawalId: string, data: { status: string; admin_notes?: string }) =>
      this.makeRequest('api-admin', `/withdrawals/${withdrawalId}/status`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    getStats: () =>
      this.makeRequest('api-admin', '/stats'),

    getMembers: (role?: string, page: number = 1, limit: number = 20) => {
      const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
      if (role) params.set('role', role);
      return this.makeRequest('api-admin', `/members?${params.toString()}`);
    },
  };

  // Voice Call API
  voiceCall = {
    startCall: (data: {
      partner_id: string;
      partner_name: string;
      call_id?: string;
      device_info?: { os: string; browser: string };
    }) =>
      this.makeRequest('api-voice-call', '/start', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    joinCall: (data: { room_id: string; device_info?: { os: string; browser: string } }) =>
      this.makeRequest('api-voice-call', '/join', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    endCall: (data: { room_id: string }) =>
      this.makeRequest('api-voice-call', '/end', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    getCallStatus: (roomId: string) =>
      this.makeRequest('api-voice-call', `/status/${roomId}`),

    getActiveCalls: () =>
      this.makeRequest('api-voice-call', '/active'),
  };

}

export const edgeApi = new EdgeApiClient();