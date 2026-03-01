// Edge Functions API client
import { supabase } from './supabase';

const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL;

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
  async makeRequest<T>(
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
        // 통화중/동시발신 에러는 메시지 그대로 전달
        if (response.status === 409 && (result.error === 'busy' || result.error === 'concurrent')) {
          throw new Error(result.message || result.error);
        }
        // error가 문자열인 경우와 객체인 경우 모두 처리
        const errorMessage = typeof result.error === 'string' 
          ? result.error 
          : result.error?.message || result.message || `HTTP ${response.status}`;
        throw new Error(errorMessage);
      }

      return result;
    } catch (error) {
      console.error(`Edge API Error (${functionName}${path}):`, error);

      // 인증 관련 에러 메시지를 한글로 변환
      const errorMessage = (error as Error)?.message || '';
      if (
        errorMessage.toLowerCase().includes('authentication required') ||
        errorMessage.toLowerCase().includes('please provide a valid token') ||
        errorMessage.toLowerCase().includes('authorization header')
      ) {
        throw new Error('로그아웃 후 다시 로그인을 시도해주세요.');
      }

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

    getInfo: () =>
      this.makeRequest('api-partner-profile', '/info'),

    updateStoreAgreements: (data: {
      store_terms_agreed?: boolean;
      store_prohibited_items_agreed?: boolean;
      store_fee_settlement_agreed?: boolean;
      store_privacy_agreed?: boolean;
    }) =>
      this.makeRequest('api-partners', '/store-agreements', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    getWelcomeMessage: () =>
      this.makeRequest('api-partners', '/welcome-message'),

    updateWelcomeMessage: (welcomeMessage: string) =>
      this.makeRequest('api-partners', '/welcome-message', {
        method: 'PUT',
        body: JSON.stringify({ welcome_message: welcomeMessage }),
      }),
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

    deleteAccount: () =>
      this.makeRequest('api-auth', '/account', {
        method: 'DELETE',
      }),
  };

  // Chat API
  chat = {
    getRooms: (params?: { sort_by?: 'subscriber' | 'follower' | 'normal' }) => {
      const query = params?.sort_by ? `?sort_by=${params.sort_by}` : ''
      return this.makeRequest('api-chat', `/rooms${query}`)
    },

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

    markAsRead: (roomId: string) =>
      this.makeRequest('api-chat', '/messages/read', {
        method: 'PUT',
        body: JSON.stringify({ room_id: roomId }),
      }),

    getRoomMedia: (roomId: string, page: number = 1, limit: number = 50, mediaType: 'image' | 'video' | 'all' = 'all') =>
      this.makeRequest('api-chat', `/rooms/${roomId}/media?page=${page}&limit=${limit}&media_type=${mediaType}`),

    notifyChat: (data: {
      roomId?: string;
      messageId?: string;
      targetMemberId: string;
      senderId?: string;
      message?: string;
    }) =>
      this.makeRequest('notify-chat', '', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    search: (params: { q: string; type?: 'partner' | 'message' | 'all'; limit?: number }) => {
      const searchParams = new URLSearchParams();
      searchParams.set('q', params.q);
      if (params.type) searchParams.set('type', params.type);
      if (params.limit) searchParams.set('limit', params.limit.toString());
      return this.makeRequest('api-chat', `/search?${searchParams.toString()}`);
    },
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

  nativePush = {
    saveToken: (data: {
      user_id: string;
      device_id: string;
      platform: string;
      token: string;
      voip_token?: string;
      apns_env?: string;
    }) =>
      this.makeRequest('push-native', '', {
        method: 'POST',
        body: JSON.stringify({
          action: 'save_token',
          ...data,
        }),
      }),

    deactivateToken: (data: { device_id: string }) =>
      this.makeRequest('push-native', '', {
        method: 'POST',
        body: JSON.stringify({
          action: 'deactivate_token',
          ...data,
        }),
      }),

    enqueueNotification: (data: {
      user_id?: string;
      target_member_id?: string;
      target_partner_id?: string;
      title: string;
      body: string;
      icon?: string;
      url?: string;
      tag?: string;
      notification_type?: string;
      data?: Record<string, any>;
      scheduled_at?: string;
      process_immediately?: boolean;
      max_retries?: number;
    }) =>
      this.makeRequest('push-native', '', {
        method: 'POST',
        body: JSON.stringify({
          action: 'enqueue_notification',
          ...data,
        }),
      }),

    processQueue: (data: { job_ids?: string[] } = {}) =>
      this.makeRequest('push-native', '', {
        method: 'POST',
        body: JSON.stringify({
          action: 'process_queue',
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
    createJob: (data: { job_name: string; job_description?: string; coins_per_job: number; membership_id?: string; min_tier_rank?: number }) =>
      this.makeRequest('api-partner-dashboard', '/jobs', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    updateJob: (jobId: string, data: { job_name?: string; job_description?: string; job_price?: number; is_active?: boolean; membership_id?: string; min_tier_rank?: number }) =>
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

    updateRequestStatus: (requestId: string, data: { status: string; response_message?: string; call_id?: string }) =>
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
      this.makeRequest('api-members', `/by-code/${memberCode}`),

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

    // 팔로잉한 파트너 목록 조회
    getFollowingPartners: () =>
      this.makeRequest('api-follow', ''),

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

    // 타겟이 나를 차단했는지 확인 (targetId: 타겟의 members.id)
    checkBlockedByTarget: (targetId: string) =>
      this.makeRequest('api-members', `/partner/blocked-users?targetId=${targetId}`),

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
      chat_room_id?: string;
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

    getPartnerRevenue: (partnerId: string) =>
      this.makeRequest('api-admin', `/partner-revenue?partner_id=${encodeURIComponent(partnerId)}`),

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
      call_type?: 'audio' | 'video';
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

  // 차단 관련 API (member_blocks 테이블)
  blocks = {
    // 차단 목록 조회
    getList: () =>
      this.makeRequest('api-blocks', ''),

    // 사용자 차단
    block: (memberCode: string) =>
      this.makeRequest('api-blocks', '', {
        method: 'POST',
        body: JSON.stringify({ blocked_member_code: memberCode }),
      }),

    // 차단 해제
    unblock: (memberCode: string) =>
      this.makeRequest('api-blocks', '', {
        method: 'DELETE',
        body: JSON.stringify({ blocked_member_code: memberCode }),
      }),

    // 차단 상태 확인
    check: (memberCode: string) =>
      this.makeRequest('api-blocks', `/check/${memberCode}`),
  };

  // Partner Profile API
  partnerProfile = {
    // 파트너 프로필 정보 조회
    info: () =>
      this.makeRequest('api-partner-profile', '/info'),

    // 파트너 프로필 업데이트 (FormData 지원)
    update: (formData: FormData) =>
      this.makeRequest('api-partner-profile', '/update', {
        method: 'PUT',
        body: formData,
      }),
  };

  // Stream Room API
  stream = {
    // 방송 후원 (미션 escrow 처리 포함)
    donation: (data: {
      partner_id: string;
      amount: number;
      description: string;
      log_id?: string;
      donation_type?: 'basic' | 'mission' | 'video' | 'roulette';
      room_id?: string;
    }) =>
      this.makeRequest('api-stream', '/donation', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    // 방 생성
    createRoom: (data: {
      title: string;
      description?: string;
      stream_type?: 'video' | 'audio';
      access_type?: 'public' | 'private' | 'subscriber';
      password?: string;
      max_participants?: number;
      category_id?: string;
      thumbnail_url?: string;
    }) =>
      this.makeRequest('api-stream', '/rooms', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    // 방 입장
    joinRoom: (roomId: string, password?: string) =>
      this.makeRequest('api-stream', `/rooms/${roomId}/join`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      }),

    // 방 퇴장
    leaveRoom: (roomId: string) =>
      this.makeRequest('api-stream', `/rooms/${roomId}/leave`, {
        method: 'POST',
      }),

    // 방 종료 (호스트만)
    endRoom: (roomId: string) =>
      this.makeRequest('api-stream', `/rooms/${roomId}/end`, {
        method: 'POST',
      }),

    // 방송 시작 (rehearsal → live, 호스트만)
    startBroadcast: (roomId: string) =>
      this.makeRequest('api-stream', `/rooms/${roomId}/start`, {
        method: 'POST',
      }),

    // 호스트 하트비트 전송 (방송 중 주기적 호출)
    heartbeat: (roomId: string) =>
      this.makeRequest('api-stream', `/rooms/${roomId}/heartbeat`, {
        method: 'POST',
      }),

    // 시청자 하트비트 전송 (방송 시청 중 주기적 호출)
    viewerHeartbeat: (roomId: string) =>
      this.makeRequest('api-stream', `/rooms/${roomId}/viewer-heartbeat`, {
        method: 'POST',
      }),

    // 썸네일 업데이트
    updateThumbnail: (roomId: string, thumbnailUrl: string) =>
      this.makeRequest('api-stream', `/rooms/${roomId}/thumbnail`, {
        method: 'PATCH',
        body: JSON.stringify({ thumbnail_url: thumbnailUrl }),
      }),

    // 썸네일 삭제
    deleteThumbnail: (roomId: string) =>
      this.makeRequest('api-stream', `/rooms/${roomId}/thumbnail`, {
        method: 'DELETE',
      }),

    // 방 설정 수정
    updateSettings: (roomId: string, settings: {
      title?: string;
      description?: string | null;
      category_id?: string | null;
      access_type?: 'public' | 'private' | 'subscriber';
      password?: string | null;
      chat_mode?: 'all' | 'subscriber' | 'disabled';
      thumbnail_url?: string | null;
      tags?: string[] | null;
    }) =>
      this.makeRequest('api-stream', `/rooms/${roomId}/settings`, {
        method: 'PATCH',
        body: JSON.stringify(settings),
      }),

    // 방 상세 조회
    getRoom: (roomId: string) =>
      this.makeRequest('api-stream', `/rooms/${roomId}`),

    // 방 목록 조회
    getRooms: (params: {
      status?: 'live' | 'scheduled' | 'ended' | 'all';
      stream_type?: 'video' | 'audio' | 'all';
      limit?: number;
      offset?: number;
    } = {}) => {
      const searchParams = new URLSearchParams();
      if (params.status) searchParams.set('status', params.status);
      if (params.stream_type) searchParams.set('stream_type', params.stream_type);
      if (params.limit) searchParams.set('limit', params.limit.toString());
      if (params.offset) searchParams.set('offset', params.offset.toString());

      const query = searchParams.toString();
      return this.makeRequest('api-stream', `/rooms${query ? `?${query}` : ''}`);
    },
  };

  // Stream Speaker API (발언권 관리)
  streamSpeaker = {
    // 발언권 요청
    request: (roomId: string, message?: string) =>
      this.makeRequest('api-stream-speaker', '/request', {
        method: 'POST',
        body: JSON.stringify({ room_id: roomId, message }),
      }),

    // 발언권 승인 (호스트만)
    approve: (requestId: string) =>
      this.makeRequest('api-stream-speaker', `/approve/${requestId}`, {
        method: 'POST',
      }),

    // 발언권 거절 (호스트만)
    reject: (requestId: string) =>
      this.makeRequest('api-stream-speaker', `/reject/${requestId}`, {
        method: 'POST',
      }),

    // 발언권 박탈 (호스트만)
    revoke: (hostId: string) =>
      this.makeRequest('api-stream-speaker', `/revoke/${hostId}`, {
        method: 'POST',
      }),

    // 발언권 요청 목록 (호스트만)
    getRequests: (roomId: string) =>
      this.makeRequest('api-stream-speaker', `/requests/${roomId}`),

    // 발언자 목록
    getHosts: (roomId: string) =>
      this.makeRequest('api-stream-speaker', `/hosts/${roomId}`),
  };

  // Stream Chat API (채팅 + Rate Limiting)
  streamChat = {
    // 채팅 전송
    send: (roomId: string, content: string, chatType?: 'text' | 'donation' | 'system') =>
      this.makeRequest('api-stream-chat', '/send', {
        method: 'POST',
        body: JSON.stringify({ room_id: roomId, content, chat_type: chatType }),
      }),

    // 채팅 목록 조회
    getMessages: (roomId: string, limit?: number, before?: number) => {
      const searchParams = new URLSearchParams();
      if (limit) searchParams.set('limit', limit.toString());
      if (before) searchParams.set('before', before.toString());

      const query = searchParams.toString();
      return this.makeRequest('api-stream-chat', `/messages/${roomId}${query ? `?${query}` : ''}`);
    },

    // 사용자 밴 (호스트만)
    ban: (data: {
      room_id: string;
      target_member_id: string;
      ban_type: 'mute' | 'kick' | 'ban';
      reason?: string;
      duration_minutes?: number;
    }) =>
      this.makeRequest('api-stream-chat', '/ban', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    // 사용자 언밴 (호스트만)
    unban: (roomId: string, targetMemberId: string) =>
      this.makeRequest('api-stream-chat', '/unban', {
        method: 'POST',
        body: JSON.stringify({ room_id: roomId, target_member_id: targetMemberId }),
      }),

    // 메시지 삭제 (호스트 또는 본인)
    deleteMessage: (messageId: string) =>
      this.makeRequest('api-stream-chat', `/message/${messageId}`, {
        method: 'DELETE',
      }),

    // 메시지 고정/해제 (호스트만)
    togglePin: (messageId: string) =>
      this.makeRequest('api-stream-chat', `/pin/${messageId}`, {
        method: 'POST',
      }),
  };

  // Follow API
  follow = {
    // 나를 팔로우한 사람들 조회 (파트너 전용)
    getMyFollowers: (partnerId: string) =>
      this.makeRequest('api-follow', `?partner_id=${partnerId}`),
  };

  // Membership Subscriptions API
  membershipSubscriptions = {
    // 내 멤버십 구독 목록 조회 (사용자 전용)
    getMySubscriptions: () =>
      this.makeRequest('api-membership-subscriptions', ''),
    
    // 내 멤버십 구독자 목록 조회 (파트너 전용)
    getMySubscribers: (membershipId?: string) =>
      this.makeRequest('api-membership-subscriptions', 
        membershipId ? `/my-subscribers?membership_id=${membershipId}` : '/my-subscribers'),
    // 특정 사용자가 나(파트너)를 구독중인지 확인 + 구독 상세
    checkSubscriber: (userId: string) =>
      this.makeRequest('api-membership-subscriptions', `/check-subscriber?user_id=${userId}`),
  };

  // Explore API
  explore = {
    // 파트너 랭킹 조회 (sort_by: total_earnings | followers | subscribers, period: realtime|weekly|monthly)
    getPartnerRanking: (opts?: { sort_by?: string; limit?: number; category_id?: number; period?: string }) => {
      const params = new URLSearchParams()
      params.set('sort_by', opts?.sort_by || 'total_earnings')
      params.set('limit', String(opts?.limit || 10))
      if (opts?.category_id) params.set('category_id', String(opts.category_id))
      if (opts?.period) params.set('period', opts.period)
      return this.makeRequest('api-explore-partner-ranking', `?${params.toString()}`)
    },
  };

  // Membership API
  membership = {
    // 내 멤버십 목록 조회 (파트너 전용)
    getMyMemberships: () =>
      this.makeRequest('api-membership', ''),
    // 특정 파트너의 멤버십 목록 조회
    getMembershipsByPartnerId: (partnerId: string) =>
      this.makeRequest('api-membership', `?partner_id=${partnerId}`),
    // 멤버십 수정
    updateMembership: (data: { id: string; paid_message_quota?: number; [key: string]: any }) =>
      this.makeRequest('api-membership', '', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  };

  // LiveKit API
  livekit = {
    // 새 룸 생성 (발신 통화)
    createRoom: (partnerId: string, callType: 'voice' | 'video' = 'voice') =>
      this.makeRequest('api-livekit', '/room', {
        method: 'POST',
        body: JSON.stringify({ partnerId, callType }),
      }),

    // 기존 룸 참여 토큰 발급 (수신 통화)
    getToken: (roomName: string, participantName?: string) =>
      this.makeRequest('api-livekit', '/token', {
        method: 'POST',
        body: JSON.stringify({ roomName, participantName }),
      }),

    // 통화 종료
    endRoom: (roomName: string) =>
      this.makeRequest('api-livekit', '/room/end', {
        method: 'POST',
        body: JSON.stringify({ roomName }),
      }),

    // VoIP 토큰 저장 (iOS)
    saveVoIPToken: (token: string, deviceId: string, apnsEnv?: 'sandbox' | 'production') =>
      this.makeRequest('api-livekit', '/voip-token', {
        method: 'POST',
        body: JSON.stringify({ token, device_id: deviceId, apns_env: apnsEnv }),
      }),
  };

  // Chat Notice API (채팅방 공지)
  chatNotice = {
    // 파트너 ID 기준 공지 조회
    getByPartnerId: (partnerId: string) =>
      this.makeRequest('api-chat', `/notices?partner_id=${partnerId}`),

    // 내가 작성한 공지 조회
    getMy: () =>
      this.makeRequest('api-chat', '/notices/my'),

    // 공지 작성
    create: (content: string) =>
      this.makeRequest('api-chat', '/notices', {
        method: 'POST',
        body: JSON.stringify({ content }),
      }),

    // 공지 수정
    update: (noticeId: string, content: string) =>
      this.makeRequest('api-chat', `/notices/${noticeId}`, {
        method: 'PUT',
        body: JSON.stringify({ content }),
      }),

    // 공지 삭제
    delete: (noticeId: string) =>
      this.makeRequest('api-chat', `/notices/${noticeId}`, {
        method: 'DELETE',
      }),
  };

  // LiveKit Stream API (웹 송출 → 서버 HLS 변환)
  // - 시청은 HLS만 사용 (WebRTC 시청 기능 제거)
  livekitStream = {
    // 방송자 토큰 발급 (룸 입장 + publish)
    getBroadcastToken: (params: { roomId: string; mode?: 'video' | 'audio' }) =>
      this.makeRequest('api-livekit-stream', '/broadcast/token', {
        method: 'POST',
        body: JSON.stringify(params),
      }),

    // Egress 시작 (WebRTC → HLS)
    startEgress: (params: { roomId: string; mode?: 'video' | 'audio' }) =>
      this.makeRequest('api-livekit-stream', '/broadcast/start', {
        method: 'POST',
        body: JSON.stringify(params),
      }),

    // Egress 종료
    stopEgress: (params: { roomId: string }) =>
      this.makeRequest('api-livekit-stream', '/broadcast/stop', {
        method: 'POST',
        body: JSON.stringify(params),
      }),

    // Egress 상태 조회 (선택)
    getEgressStatus: (roomId: string) =>
      this.makeRequest('api-livekit-stream', `/broadcast/status/${roomId}`),
  };

  // Store Products API
  storeProducts = {
    // 상품 목록 조회 (파트너 ID로 필터링 가능)
    getList: (params?: { partner_id?: string; product_type?: string; is_active?: boolean; page?: number; limit?: number }) => {
      const searchParams = new URLSearchParams();
      if (params?.partner_id) searchParams.append('partner_id', params.partner_id);
      if (params?.product_type) searchParams.append('product_type', params.product_type);
      if (params?.is_active !== undefined) searchParams.append('is_active', String(params.is_active));
      if (params?.page) searchParams.append('page', String(params.page));
      if (params?.limit) searchParams.append('limit', String(params.limit));
      const query = searchParams.toString();
      return this.makeRequest('api-store-products', query ? `?${query}` : '');
    },

    // 상품 상세 조회
    getDetail: (productId: string) =>
      this.makeRequest('api-store-products', `/detail?product_id=${productId}`),

    // 파트너 본인 상품 목록
    getMyProducts: (params?: { include_inactive?: boolean; page?: number; limit?: number; source?: string }) => {
      const searchParams = new URLSearchParams();
      if (params?.include_inactive) searchParams.append('include_inactive', 'true');
      if (params?.page) searchParams.append('page', String(params.page));
      if (params?.limit) searchParams.append('limit', String(params.limit));
      if (params?.source) searchParams.append('source', params.source);
      const query = searchParams.toString();
      return this.makeRequest('api-store-products', `/partner/my${query ? `?${query}` : ''}`);
    },

    // 상품 생성
    create: (formData: FormData) =>
      this.makeRequest('api-store-products', '', {
        method: 'POST',
        body: formData,
      }),

    // 상품 수정
    update: (productId: string, formData: FormData) =>
      this.makeRequest('api-store-products', `/update?product_id=${productId}`, {
        method: 'PUT',
        body: formData,
      }),

    // 상품 삭제
    delete: (productId: string) =>
      this.makeRequest('api-store-products', `/delete?product_id=${productId}`, {
        method: 'DELETE',
      }),

    // 스토어 이용약관 동의
    agreeTerms: (data: {
      store_terms_agreed: boolean;
      store_prohibited_items_agreed: boolean;
      store_fee_policy_agreed: boolean;
      store_privacy_policy_agreed: boolean;
    }) =>
      this.makeRequest('api-store-products', '/terms/agree', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    // 찜하기
    addWishlist: (productId: string) =>
      this.makeRequest('api-store-products', '/wishlist', {
        method: 'POST',
        body: JSON.stringify({ product_id: productId }),
      }),

    // 찜 취소
    removeWishlist: (productId: string) =>
      this.makeRequest('api-store-products', `/wishlist?product_id=${productId}`, {
        method: 'DELETE',
      }),

    // 찜 목록 조회
    getWishlist: (params?: { page?: number; limit?: number }) => {
      const searchParams = new URLSearchParams();
      if (params?.page) searchParams.append('page', String(params.page));
      if (params?.limit) searchParams.append('limit', String(params.limit));
      const query = searchParams.toString();
      return this.makeRequest('api-store-products', `/wishlist${query ? `?${query}` : ''}`);
    },

    // 찜 여부 확인
    checkWishlist: (productId: string) =>
      this.makeRequest('api-store-products', `/wishlist/check?product_id=${productId}`),
  };

  // Store Collaboration API
  storeCollaboration = {
    // 파트너 배분율 수정
    updatePartnerDistributionRate: (data: {
      partner_id: string;
      default_distribution_rate?: number;
      collaboration_distribution_rate?: number;
    }) =>
      this.makeRequest('api-store-collaboration', '/partner-default-rate', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  };

  // Posts API
  posts = {
    getPost: (postId: string) =>
      this.makeRequest('api-posts', `/${postId}`),
    getPinned: () =>
      this.makeRequest('api-posts', '/pinned'),
  };
}

export const edgeApi = new EdgeApiClient();