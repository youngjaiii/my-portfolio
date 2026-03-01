/**
 * Jest 테스트 설정 파일
 */

// Mock 환경 변수
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.TOSS_PAY_DEV_SECRET_KEY = 'test_sk_dev';
process.env.TOSS_PAY_PROD_SECRET_KEY = 'test_sk_prod';

// 전역 fetch 모킹 (필요한 경우)
if (!global.fetch) {
  global.fetch = jest.fn();
}

