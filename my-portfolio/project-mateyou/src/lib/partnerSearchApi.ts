// Partner Search API client (관리자/출근부 매니저 전용)
import { supabase } from './supabase';

const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL;

interface PartnerSearchApiResponse<T = any> {
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

interface PartnerSearchResult {
  id: string;
  member_id: string;
  partner_name: string;
  partner_status: string;
  member_code?: string;
  name?: string;
  profile_image?: string;
  email?: string;
}

class PartnerSearchApiClient {
  private async makeRequest<T>(
    path: string = '',
    options: RequestInit = {}
  ): Promise<PartnerSearchApiResponse<T>> {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      const url = `${EDGE_FUNCTIONS_URL}/functions/v1/api-partner-search${path}`;

      // 인증 필수
      const authToken = session?.access_token;
      if (!authToken) {
        throw new Error('로그인이 필요합니다.');
      }

      const headers: HeadersInit = {
        'Authorization': `Bearer ${authToken}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        ...options.headers,
      };

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
      console.error(`Partner Search API Error (${path}):`, error);

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
   * 파트너 검색 (파트너 이름으로 검색)
   * @param query 검색어 (파트너 이름)
   * @param page 페이지 번호
   * @param limit 페이지당 결과 수
   */
  search = (
    query: string,
    page: number = 1,
    limit: number = 50
  ): Promise<PartnerSearchApiResponse<PartnerSearchResult[]>> => {
    const params = new URLSearchParams({
      q: query,
      page: page.toString(),
      limit: limit.toString(),
    });
    return this.makeRequest(`?${params.toString()}`);
  };

  /**
   * 파트너 ID로 상세 정보 조회
   * @param partnerId 파트너 ID
   */
  getDetails = (partnerId: string): Promise<PartnerSearchApiResponse<PartnerSearchResult>> => {
    return this.makeRequest(`/${partnerId}`);
  };

  /**
   * 전체 파트너 목록 조회 (프론트엔드 필터링용)
   */
  getAll = (): Promise<PartnerSearchApiResponse<PartnerSearchResult[]>> => {
    const params = new URLSearchParams({
      q: '',
      page: '1',
      limit: '1000',
    });
    return this.makeRequest(`?${params.toString()}`);
  };
}

export const partnerSearchApi = new PartnerSearchApiClient();
