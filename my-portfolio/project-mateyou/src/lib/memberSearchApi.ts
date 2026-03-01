// Member Search API client (독립적인 API 클라이언트)
import { supabase } from './supabase';

const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL;

interface MemberSearchApiResponse<T = any> {
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

class MemberSearchApiClient {
  private async makeRequest<T>(
    path: string = '',
    options: RequestInit = {}
  ): Promise<MemberSearchApiResponse<T>> {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const url = `${EDGE_FUNCTIONS_URL}/functions/v1/api-member-search${path}`;

      // Use user token for authenticated requests, anon key for public requests
      const authToken = session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY;

      const headers: HeadersInit = {
        'Authorization': `Bearer ${authToken}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        ...options.headers,
      };

      // FormData인 경우 Content-Type을 설정하지 않음
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
      console.error(`Member Search API Error (${path}):`, error);

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

  /**
   * 회원 검색
   * @param query 검색어 (이름, 이메일, member_code)
   * @param page 페이지 번호
   * @param limit 페이지당 결과 수
   * @param filterRole 역할 필터 ('partner'인 경우 partner 또는 admin만, 그 외에는 해당 역할만)
   */
  search: (query: string, page?: number, limit?: number, filterRole?: 'partner' | 'admin' | string) => Promise<MemberSearchApiResponse<any[]>> = (
    query: string,
    page: number = 1,
    limit: number = 20,
    filterRole?: 'partner' | 'admin' | string
  ) => {
    const params = new URLSearchParams({
      q: query,
      page: page.toString(),
      limit: limit.toString(),
    });
    if (filterRole) params.set('filterRole', filterRole);
    return this.makeRequest(`?${params.toString()}`);
  };

  /**
   * 회원 ID로 상세 정보 조회
   * @param memberId 회원 ID
   */
  getDetails: (memberId: string) => Promise<MemberSearchApiResponse<any>> = (memberId: string) => {
    return this.makeRequest(`/${memberId}`);
  };

  /**
   * 전체 회원 목록 조회 (프론트엔드 필터링용)
   * @param filterRole 역할 필터
   */
  getAll: (filterRole?: 'partner' | 'admin' | string) => Promise<MemberSearchApiResponse<any[]>> = (
    filterRole?: 'partner' | 'admin' | string
  ) => {
    const params = new URLSearchParams({
      q: '',
      page: '1',
      limit: '1000',
    });
    if (filterRole) params.set('filterRole', filterRole);
    return this.makeRequest(`?${params.toString()}`);
  };
}

export const memberSearchApi = new MemberSearchApiClient();

