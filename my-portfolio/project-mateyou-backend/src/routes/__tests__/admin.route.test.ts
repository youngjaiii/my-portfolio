/**
 * 파트너 삭제 기능 테스트
 * TDD를 위한 테스트 파일
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { Response } from 'express';
import adminRouter from '../admin.route';

// Mock dependencies - jest.mock() 내부에서 생성하고 전역 객체에 저장
jest.mock('../../lib/utils', () => {
  const actual = jest.requireActual('../../lib/utils') as any;
  
  // Mock 함수들을 여기서 생성
  const mockCreateSupabaseClientFn = jest.fn<any>();
  const mockGetAuthUserFn = jest.fn<() => Promise<{ id: string; role: string }>>();
  
  // Mock을 전역 객체에 저장하여 테스트에서 접근 가능하도록
  (global as any).__mockCreateSupabaseClient = mockCreateSupabaseClientFn;
  (global as any).__mockGetAuthUser = mockGetAuthUserFn;
  
  return {
    ...actual,
    createSupabaseClient: () => mockCreateSupabaseClientFn(),
    getAuthUser: mockGetAuthUserFn,
    successResponse: (res: Response, data: any, meta?: any) => {
      return res.status(200).json({ success: true, data, meta });
    },
    errorResponse: (res: Response, code: string, message: string, details?: any, status: number = 400) => {
      return res.status(status).json({ success: false, error: { code, message, details } });
    },
    asyncHandler: (fn: any) => (req: any, res: any, next: any) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    },
  };
});

jest.mock('../../lib/toss-auth', () => {
  // Mock 함수들을 여기서 생성 (되돌린 버전에 맞춰서)
  const mockGetTossSecretKeyFn = jest.fn<() => string | null>();
  const mockCreateTossHeadersFn = jest.fn<() => Record<string, string>>();
  const mockGetTossPaymentSecretKeyFn = jest.fn<() => string | undefined>();
  const mockGetTossPayoutSecretKeyFn = jest.fn<() => string | undefined>();
  const mockCreateTossPaymentHeadersFn = jest.fn<() => Record<string, string>>();
  const mockCreateTossPayoutHeadersFn = jest.fn<() => Record<string, string>>();
  const mockCreateTossAuthHeaderFn = jest.fn<(secretKey: string | undefined) => string>();
  
  // Mock을 전역 객체에 저장하여 테스트에서 접근 가능하도록
  (global as any).__mockGetTossSecretKey = mockGetTossSecretKeyFn;
  (global as any).__mockCreateTossHeaders = mockCreateTossHeadersFn;
  (global as any).__mockGetTossPaymentSecretKey = mockGetTossPaymentSecretKeyFn;
  (global as any).__mockGetTossPayoutSecretKey = mockGetTossPayoutSecretKeyFn;
  (global as any).__mockCreateTossPaymentHeaders = mockCreateTossPaymentHeadersFn;
  (global as any).__mockCreateTossPayoutHeaders = mockCreateTossPayoutHeadersFn;
  (global as any).__mockCreateTossAuthHeader = mockCreateTossAuthHeaderFn;
  
  return {
    // Deprecated 함수들 (하위 호환성) - mock만 사용
    getTossSecretKey: mockGetTossSecretKeyFn,
    createTossHeaders: mockCreateTossHeadersFn,
    // 새로운 함수들
    getTossPaymentSecretKey: mockGetTossPaymentSecretKeyFn,
    getTossPayoutSecretKey: mockGetTossPayoutSecretKeyFn,
    createTossPaymentHeaders: mockCreateTossPaymentHeadersFn,
    createTossPayoutHeaders: mockCreateTossPayoutHeadersFn,
    createTossAuthHeader: mockCreateTossAuthHeaderFn,
  };
});

const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);

describe('DELETE /api/admin/members/:memberId/partner', () => {
  let mockSupabase: any;
  let mockCreateSupabaseClient: jest.Mock<any>;
  let mockGetAuthUser: jest.Mock<() => Promise<{ id: string; role: string }>>;
  let mockGetTossSecretKey: jest.Mock<() => string | null>;
  let mockCreateTossHeaders: jest.Mock<() => Record<string, string>>;

  // Supabase 쿼리 호출 추적을 위한 헬퍼
  const createMockSupabase = () => {
    const calls: Array<{ table: string; operation: string }> = [];
    
    const createChain = (table: string, operation: string) => {
      calls.push({ table, operation });
      
      const chain: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        single: jest.fn(),
        update: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn(),
        or: jest.fn().mockReturnThis(),
      };
      
      return chain;
    };

    const mockFrom = jest.fn((table: string) => {
      calls.push({ table, operation: 'from' });
      return createChain(table, 'query');
    });

    return {
      from: mockFrom,
      calls,
      // 기존 메서드들도 유지 (하위 호환성)
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn(),
      update: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      or: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn(),
    };
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // 전역 객체에서 mock 함수 가져오기
    mockCreateSupabaseClient = (global as any).__mockCreateSupabaseClient;
    mockGetAuthUser = (global as any).__mockGetAuthUser;
    mockGetTossSecretKey = (global as any).__mockGetTossSecretKey;
    mockCreateTossHeaders = (global as any).__mockCreateTossHeaders;

    // Mock Supabase client
    mockSupabase = createMockSupabase();

    // Mock createSupabaseClient
    mockCreateSupabaseClient.mockReturnValue(mockSupabase);

    // Mock getAuthUser (admin user) - requireAdmin 미들웨어에서 사용
    (mockGetAuthUser as any).mockResolvedValue({
      id: 'admin-user-id',
      role: 'admin',
    });

    // requireAdmin 미들웨어가 admin 체크를 통과하도록 설정
    // requireAdmin은 members 테이블에서 role을 조회함
    mockSupabase.from.mockImplementation((table: string) => {
      // createChain을 직접 사용하여 chain 객체 반환
      const chain: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        single: jest.fn(),
        update: jest.fn().mockReturnThis(),
        delete: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        maybeSingle: jest.fn(),
        or: jest.fn().mockReturnThis(), // .or() 메서드 추가
      };
      
      if (table === 'members') {
        // requireAdmin 미들웨어용
        (chain.single as any) = (jest.fn() as any).mockResolvedValue({
          data: { role: 'admin' },
          error: null,
        });
      }
      
      return chain;
    });

    // Mock Toss functions
    // 되돌린 버전에서는 live_sk 또는 live_gsk만 허용하지만, mock을 사용하므로 어떤 값이든 가능
    (mockGetTossSecretKey as any).mockReturnValue('live_sk_test_key_for_testing');
    (mockCreateTossHeaders as any).mockReturnValue({
      Authorization: 'Basic test',
      'Content-Type': 'application/json',
    });

    // Mock global fetch
    (global.fetch as any) = jest.fn();
  });

  describe('파트너가 존재하지 않는 경우', () => {
    it('member role을 normal로 변경해야 함', async () => {
      // Arrange
      const memberId = 'member-without-partner';
      
      // requireAdmin 미들웨어용 (첫 번째 호출)
      let callCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++;
        const supabaseMock = createMockSupabase();
        const chain = supabaseMock.from(table);
        
        if (table === 'members' && callCount === 1) {
          // requireAdmin 미들웨어용
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { role: 'admin' },
            error: null,
          });
        } else if (table === 'partners' && callCount === 2) {
          // 파트너 조회 (없음)
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: null,
            error: { code: 'PGRST116' },
          });
        } else if (table === 'members' && callCount === 3) {
          // member role 업데이트: .update().eq()
          chain.update = jest.fn().mockReturnThis();
          chain.eq = (jest.fn() as any).mockResolvedValue({ error: null });
        }
        
        return chain;
      });

      // Act
      const response = await request(app)
        .delete(`/api/admin/members/${memberId}/partner`)
        .set('Authorization', 'Bearer admin-token');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toContain('Member role updated to normal');
    });
  });

  describe('파트너가 존재하는 경우', () => {
    const memberId = 'member-with-partner';
    const partnerId = 'partner-id';
    const sellerId = 'toss-seller-id';

    beforeEach(() => {
      // Reset call count for each test
      let callCount = 0;
      
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++;
        const chain = createMockSupabase();
        
        if (table === 'members' && callCount === 1) {
          // requireAdmin 미들웨어용
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { role: 'admin' },
            error: null,
          });
        } else if (table === 'partners' && callCount === 2) {
          // 파트너 조회
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: {
              id: partnerId,
              tosspayments_seller_id: sellerId,
            },
            error: null,
          });
        }
        
        return chain;
      });
    });

    it('토스 셀러가 있으면 삭제해야 함', async () => {
      // Arrange
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      let callCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++;
        
        // call_participants의 경우 특별 처리
        if (table === 'call_participants' && callCount === 3) {
          // call_participants 조회: .select().eq().or() (레코드 없음)
          // 실제 코드: supabase.from("call_participants").select(...).eq(...).or(...)
          const orMock = (jest.fn() as any).mockResolvedValue({ data: [], error: null });
          const eqChain: any = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            in: jest.fn().mockReturnThis(),
            single: jest.fn(),
            update: jest.fn().mockReturnThis(),
            delete: jest.fn().mockReturnThis(),
            insert: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn(),
            or: orMock, // .or()가 최종적으로 resolved value 반환
          };
          const selectChain: any = {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn(() => eqChain), // .eq()가 eqChain을 반환하여 .or() 호출 가능
            in: jest.fn().mockReturnThis(),
            single: jest.fn(),
            update: jest.fn().mockReturnThis(),
            delete: jest.fn().mockReturnThis(),
            insert: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn(),
            or: jest.fn().mockReturnThis(),
          };
          // chain.select()가 호출되면 selectChain을 반환하도록 설정
          const chain: any = {
            select: jest.fn(() => selectChain),
            eq: jest.fn().mockReturnThis(),
            in: jest.fn().mockReturnThis(),
            single: jest.fn(),
            update: jest.fn().mockReturnThis(),
            delete: jest.fn().mockReturnThis(),
            insert: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn(),
            or: jest.fn().mockReturnThis(),
          };
          return chain;
        }
        
        const chain: any = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          in: jest.fn().mockReturnThis(),
          single: jest.fn(),
          update: jest.fn().mockReturnThis(),
          delete: jest.fn().mockReturnThis(),
          insert: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn(),
          or: jest.fn().mockReturnThis(),
        };
        
        if (table === 'members' && callCount === 1) {
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { role: 'admin' },
            error: null,
          });
        } else if (table === 'partners' && callCount === 2) {
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { id: partnerId, tosspayments_seller_id: sellerId },
            error: null,
          });
        } else if (table === 'partner_withdrawals' && callCount === 4) {
          chain.delete = jest.fn().mockReturnThis();
          chain.eq = (jest.fn() as any).mockResolvedValue({ error: null });
        } else if (table === 'partner_requests' && callCount === 5) {
          // partner_requests 조회: .select().eq().in() (active requests 없음)
          chain.select = jest.fn().mockReturnThis();
          chain.eq = jest.fn().mockReturnThis();
          chain.in = (jest.fn() as any).mockResolvedValue({ data: [], error: null });
        } else if (table === 'partners' && callCount === 7) {
          // partners 삭제: .delete().eq().select().single()
          chain.delete = jest.fn().mockReturnThis();
          chain.eq = jest.fn().mockReturnThis();
          chain.select = jest.fn().mockReturnThis();
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { id: partnerId },
            error: null,
          });
        } else if (table === 'members' && callCount === 8) {
          // members 업데이트: .update().eq()
          chain.update = jest.fn().mockReturnThis();
          chain.eq = (jest.fn() as any).mockResolvedValue({ error: null });
        }
        
        return chain;
      });

      // Act
      const response = await request(app)
        .delete(`/api/admin/members/${memberId}/partner`)
        .set('Authorization', 'Bearer admin-token')
        .set('x-is-production', 'false');

      // Assert
      if (response.status !== 200) {
        console.log('Response body:', JSON.stringify(response.body, null, 2));
      }
      expect(global.fetch).toHaveBeenCalledWith(
        `https://api.tosspayments.com/v2/sellers/${sellerId}`,
        expect.objectContaining({
          method: 'DELETE',
        })
      );
      expect(response.status).toBe(200);
    });

    it('partner_withdrawals를 삭제해야 함', async () => {
      // Arrange
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      let callCount = 0;
      let partnerWithdrawalsCalled = false;
      
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++;
        const chain = createMockSupabase();
        
        if (table === 'members' && callCount === 1) {
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { role: 'admin' },
            error: null,
          });
        } else if (table === 'partners' && callCount === 2) {
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { id: partnerId, tosspayments_seller_id: sellerId },
            error: null,
          });
        } else if (table === 'call_participants' && callCount === 3) {
          // call_participants 조회: .select().eq() (레코드 없음)
          const eqMock = (jest.fn() as any).mockResolvedValue({ data: [], error: null });
          const selectChain: any = {
            select: jest.fn().mockReturnThis(),
            eq: eqMock,
            in: jest.fn().mockReturnThis(),
            single: jest.fn(),
            update: jest.fn().mockReturnThis(),
            delete: jest.fn().mockReturnThis(),
            insert: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn(),
            or: jest.fn().mockReturnThis(),
          };
          chain.select = jest.fn(() => selectChain);
        } else if (table === 'partner_withdrawals' && callCount === 4) {
          partnerWithdrawalsCalled = true;
          chain.delete = jest.fn().mockReturnThis();
          (chain.eq as any) = (jest.fn() as any).mockResolvedValue({ error: null });
        } else if (table === 'partners' && callCount >= 4) {
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { id: partnerId },
            error: null,
          });
        } else if (table === 'members' && callCount >= 5) {
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { id: memberId, role: 'normal' },
            error: null,
          });
        }
        
        return chain;
      });

      // Act
      await request(app)
        .delete(`/api/admin/members/${memberId}/partner`)
        .set('Authorization', 'Bearer admin-token');

      // Assert
      expect(partnerWithdrawalsCalled).toBe(true);
    });

    it('pending/in_progress 상태의 partner_requests를 rejected로 변경해야 함', async () => {
      // Arrange
      const requestId1 = 'request-id-1';
      const requestId2 = 'request-id-2';
      const clientId1 = 'client-id-1';
      const clientId2 = 'client-id-2';

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const mockRequestsQuery = {
        data: [
          { id: requestId1, client_id: clientId1, status: 'pending' },
          { id: requestId2, client_id: clientId2, status: 'in_progress' },
        ],
        error: null,
      };

      let callCount = 0;
      let partnerRequestsCalled = false;
      
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++;
        const chain = createMockSupabase();
        
        if (table === 'members' && callCount === 1) {
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { role: 'admin' },
            error: null,
          });
        } else if (table === 'partners' && callCount === 2) {
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { id: partnerId, tosspayments_seller_id: sellerId },
            error: null,
          });
        } else if (table === 'call_participants' && callCount === 3) {
          // call_participants 조회: .select().eq() (레코드 없음)
          // .select()는 chain을 반환하고, 그 chain의 .eq()는 Promise를 반환해야 함
          const eqMock = (jest.fn() as any).mockResolvedValue({ data: [], error: null });
          const selectChain: any = {
            select: jest.fn().mockReturnThis(),
            eq: eqMock,
            in: jest.fn().mockReturnThis(),
            single: jest.fn(),
            update: jest.fn().mockReturnThis(),
            delete: jest.fn().mockReturnThis(),
            insert: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn(),
            or: jest.fn().mockReturnThis(),
          };
          chain.select = jest.fn(() => selectChain);
        } else if (table === 'partner_withdrawals' && callCount === 4) {
          chain.delete = jest.fn().mockReturnThis();
          (chain.eq as any) = (jest.fn() as any).mockResolvedValue({ error: null });
        } else if (table === 'partner_requests') {
          partnerRequestsCalled = true;
          chain.select = jest.fn().mockReturnThis();
          chain.eq = jest.fn().mockReturnThis();
          (chain.in as any) = (jest.fn() as any).mockResolvedValue(mockRequestsQuery);
        } else if (table === 'partner_requests' && callCount > 5) {
          // 상태 업데이트
          chain.update = jest.fn().mockReturnThis();
          (chain.in as any) = (jest.fn() as any).mockResolvedValue({ error: null });
        } else if (table === 'chat_rooms') {
          (chain.maybeSingle as any) = (jest.fn() as any).mockResolvedValue({
            data: { id: 'room-id' },
            error: null,
          });
        } else if (table === 'chat_messages') {
          (chain.insert as any) = (jest.fn() as any).mockResolvedValue({ error: null });
        } else if (table === 'partners' && callCount >= 5) {
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { id: partnerId },
            error: null,
          });
        } else if (table === 'members' && callCount >= 6) {
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { id: memberId, role: 'normal' },
            error: null,
          });
        }
        
        return chain;
      });

      // Act
      await request(app)
        .delete(`/api/admin/members/${memberId}/partner`)
        .set('Authorization', 'Bearer admin-token');

      // Assert
      expect(partnerRequestsCalled).toBe(true);
    });

    it('rejected된 요청에 대해 채팅 메시지를 전송해야 함', async () => {
      // Arrange
      const requestId = 'request-id-1';
      const clientId = 'client-id-1';
      const roomId = 'room-id-1';

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const mockRequestsQuery = {
        data: [{ id: requestId, client_id: clientId, status: 'pending' }],
        error: null,
      };

      let callCount = 0;
      let chatMessagesCalled = false;
      
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++;
        const chain = createMockSupabase();
        
        if (table === 'members' && callCount === 1) {
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { role: 'admin' },
            error: null,
          });
        } else if (table === 'partners' && callCount === 2) {
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { id: partnerId, tosspayments_seller_id: sellerId },
            error: null,
          });
        } else if (table === 'call_participants' && callCount === 3) {
          // call_participants 조회: .select().eq() (레코드 없음)
          // .select()는 chain을 반환하고, 그 chain의 .eq()는 Promise를 반환해야 함
          const eqMock = (jest.fn() as any).mockResolvedValue({ data: [], error: null });
          const selectChain: any = {
            select: jest.fn().mockReturnThis(),
            eq: eqMock,
            in: jest.fn().mockReturnThis(),
            single: jest.fn(),
            update: jest.fn().mockReturnThis(),
            delete: jest.fn().mockReturnThis(),
            insert: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn(),
            or: jest.fn().mockReturnThis(),
          };
          chain.select = jest.fn(() => selectChain);
        } else if (table === 'partner_withdrawals' && callCount === 4) {
          chain.delete = jest.fn().mockReturnThis();
          (chain.eq as any) = (jest.fn() as any).mockResolvedValue({ error: null });
        } else if (table === 'partner_requests' && callCount === 5) {
          chain.select = jest.fn().mockReturnThis();
          chain.eq = jest.fn().mockReturnThis();
          (chain.in as any) = (jest.fn() as any).mockResolvedValue(mockRequestsQuery);
        } else if (table === 'partner_requests' && callCount === 6) {
          // partner_requests 업데이트: .update().in()
          chain.update = jest.fn().mockReturnThis();
          chain.in = (jest.fn() as any).mockResolvedValue({ error: null });
        } else if (table === 'chat_rooms' && callCount === 7) {
          (chain.maybeSingle as any) = (jest.fn() as any).mockResolvedValue({
            data: { id: roomId },
            error: null,
          });
        } else if (table === 'chat_messages' && callCount === 8) {
          chatMessagesCalled = true;
          (chain.insert as any) = (jest.fn() as any).mockResolvedValue({ error: null });
        } else if (table === 'chat_rooms' && callCount === 9) {
          (chain.update as any) = (jest.fn() as any).mockResolvedValue({ error: null });
        } else if (table === 'partners' && callCount >= 10) {
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { id: partnerId },
            error: null,
          });
        } else if (table === 'members' && callCount >= 12) {
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { id: memberId, role: 'normal' },
            error: null,
          });
        }
        
        return chain;
      });

      // Act
      await request(app)
        .delete(`/api/admin/members/${memberId}/partner`)
        .set('Authorization', 'Bearer admin-token');

      // Assert
      expect(chatMessagesCalled).toBe(true);
    });

    it('채팅방이 없으면 생성해야 함', async () => {
      // Arrange
      const requestId = 'request-id-1';
      const clientId = 'client-id-1';
      const newRoomId = 'new-room-id';

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const mockRequestsQuery = {
        data: [{ id: requestId, client_id: clientId, status: 'pending' }],
        error: null,
      };

      let callCount = 0;
      let chatRoomsInsertCalled = false;
      
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++;
        const chain = createMockSupabase();
        
        if (table === 'members' && callCount === 1) {
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { role: 'admin' },
            error: null,
          });
        } else if (table === 'partners' && callCount === 2) {
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { id: partnerId, tosspayments_seller_id: sellerId },
            error: null,
          });
        } else if (table === 'call_participants' && callCount === 3) {
          // call_participants 조회: .select().eq() (레코드 없음)
          // .select()는 chain을 반환하고, 그 chain의 .eq()는 Promise를 반환해야 함
          const eqMock = (jest.fn() as any).mockResolvedValue({ data: [], error: null });
          const selectChain: any = {
            select: jest.fn().mockReturnThis(),
            eq: eqMock,
            in: jest.fn().mockReturnThis(),
            single: jest.fn(),
            update: jest.fn().mockReturnThis(),
            delete: jest.fn().mockReturnThis(),
            insert: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn(),
            or: jest.fn().mockReturnThis(),
          };
          chain.select = jest.fn(() => selectChain);
        } else if (table === 'partner_withdrawals' && callCount === 4) {
          chain.delete = jest.fn().mockReturnThis();
          (chain.eq as any) = (jest.fn() as any).mockResolvedValue({ error: null });
        } else if (table === 'partner_requests' && callCount === 5) {
          chain.select = jest.fn().mockReturnThis();
          chain.eq = jest.fn().mockReturnThis();
          (chain.in as any) = (jest.fn() as any).mockResolvedValue(mockRequestsQuery);
        } else if (table === 'partner_requests' && callCount === 6) {
          // partner_requests 업데이트: .update().in()
          chain.update = jest.fn().mockReturnThis();
          chain.in = (jest.fn() as any).mockResolvedValue({ error: null });
        } else if (table === 'chat_rooms' && callCount === 7) {
          (chain.maybeSingle as any) = (jest.fn() as any).mockResolvedValue({
            data: null, // 채팅방 없음
            error: null,
          });
        } else if (table === 'chat_rooms' && callCount === 8) {
          chatRoomsInsertCalled = true;
          chain.insert = jest.fn().mockReturnThis();
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { id: newRoomId },
            error: null,
          });
        } else if (table === 'chat_messages' && callCount === 9) {
          (chain.insert as any) = (jest.fn() as any).mockResolvedValue({ error: null });
        } else if (table === 'chat_rooms' && callCount === 10) {
          (chain.update as any) = (jest.fn() as any).mockResolvedValue({ error: null });
        } else if (table === 'partners' && callCount >= 11) {
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { id: partnerId },
            error: null,
          });
        } else if (table === 'members' && callCount >= 12) {
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { id: memberId, role: 'normal' },
            error: null,
          });
        }
        
        return chain;
      });

      // Act
      await request(app)
        .delete(`/api/admin/members/${memberId}/partner`)
        .set('Authorization', 'Bearer admin-token');

      // Assert
      expect(chatRoomsInsertCalled).toBe(true);
    });

    it('partners 테이블에서 파트너를 삭제해야 함', async () => {
      // Arrange
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      let callCount = 0;
      let partnersDeleteCalled = false;
      
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++;
        const chain = createMockSupabase();
        
        if (table === 'members' && callCount === 1) {
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { role: 'admin' },
            error: null,
          });
        } else if (table === 'partners' && callCount === 2) {
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { id: partnerId, tosspayments_seller_id: sellerId },
            error: null,
          });
        } else if (table === 'call_participants' && callCount === 3) {
          // call_participants 조회: .select().eq() (레코드 없음)
          // .select()는 chain을 반환하고, 그 chain의 .eq()는 Promise를 반환해야 함
          const eqMock = (jest.fn() as any).mockResolvedValue({ data: [], error: null });
          const selectChain: any = {
            select: jest.fn().mockReturnThis(),
            eq: eqMock,
            in: jest.fn().mockReturnThis(),
            single: jest.fn(),
            update: jest.fn().mockReturnThis(),
            delete: jest.fn().mockReturnThis(),
            insert: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn(),
            or: jest.fn().mockReturnThis(),
          };
          chain.select = jest.fn(() => selectChain);
        } else if (table === 'partner_withdrawals' && callCount === 4) {
          chain.delete = jest.fn().mockReturnThis();
          (chain.eq as any) = (jest.fn() as any).mockResolvedValue({ error: null });
        } else if (table === 'partner_requests' && callCount === 5) {
          // partner_requests 조회: .select().eq().in() (active requests 없음)
          chain.select = jest.fn().mockReturnThis();
          chain.eq = jest.fn().mockReturnThis();
          chain.in = (jest.fn() as any).mockResolvedValue({ data: [], error: null });
        } else if (table === 'partners' && callCount >= 6) {
          if (!partnersDeleteCalled) {
            partnersDeleteCalled = true;
            // partners 삭제: .delete().eq().select().single()
            chain.delete = jest.fn().mockReturnThis();
            chain.eq = jest.fn().mockReturnThis();
            chain.select = jest.fn().mockReturnThis();
            (chain.single as any) = (jest.fn() as any).mockResolvedValue({
              data: { id: partnerId },
              error: null,
            });
          } else {
            (chain.single as any) = (jest.fn() as any).mockResolvedValue({
              data: { id: partnerId },
              error: null,
            });
          }
        } else if (table === 'members' && callCount >= 7) {
          // members 업데이트: .update().eq() (single() 호출 안 함)
          chain.update = jest.fn().mockReturnThis();
          chain.eq = (jest.fn() as any).mockResolvedValue({ error: null });
        }
        
        return chain;
      });

      // Act
      await request(app)
        .delete(`/api/admin/members/${memberId}/partner`)
        .set('Authorization', 'Bearer admin-token');

      // Assert
      expect(partnersDeleteCalled).toBe(true);
    });

    it('member role을 normal로 변경해야 함', async () => {
      // Arrange
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      let callCount = 0;
      
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++;
        const chain: any = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          in: jest.fn().mockReturnThis(),
          single: jest.fn(),
          update: jest.fn().mockReturnThis(),
          delete: jest.fn().mockReturnThis(),
          insert: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn(),
          or: jest.fn().mockReturnThis(),
        };
        
        if (table === 'members' && callCount === 1) {
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { role: 'admin' },
            error: null,
          });
        } else if (table === 'partners' && callCount === 2) {
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { id: partnerId, tosspayments_seller_id: sellerId },
            error: null,
          });
        } else if (table === 'call_participants' && callCount === 3) {
          // call_participants 조회: .select().eq() (레코드 없음)
          // .select()는 chain을 반환하고, 그 chain의 .eq()는 Promise를 반환해야 함
          const eqMock = (jest.fn() as any).mockResolvedValue({ data: [], error: null });
          const selectChain: any = {
            select: jest.fn().mockReturnThis(),
            eq: eqMock,
            in: jest.fn().mockReturnThis(),
            single: jest.fn(),
            update: jest.fn().mockReturnThis(),
            delete: jest.fn().mockReturnThis(),
            insert: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn(),
            or: jest.fn().mockReturnThis(),
          };
          chain.select = jest.fn(() => selectChain);
        } else if (table === 'partner_withdrawals' && callCount === 4) {
          chain.delete = jest.fn().mockReturnThis();
          (chain.eq as any) = (jest.fn() as any).mockResolvedValue({ error: null });
        } else if (table === 'partner_requests' && callCount === 5) {
          // partner_requests 조회: .select().eq().in() (active requests 없음)
          chain.select = jest.fn().mockReturnThis();
          chain.eq = jest.fn().mockReturnThis();
          chain.in = (jest.fn() as any).mockResolvedValue({ data: [], error: null });
        } else if (table === 'partners' && callCount === 7) {
          // partners 삭제: .delete().eq().select().single()
          chain.delete = jest.fn().mockReturnThis();
          chain.eq = jest.fn().mockReturnThis();
          chain.select = jest.fn().mockReturnThis();
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { id: partnerId },
            error: null,
          });
        } else if (table === 'members' && callCount === 8) {
          // members 업데이트: .update().eq() (single() 호출 안 함)
          chain.update = jest.fn().mockReturnThis();
          chain.eq = (jest.fn() as any).mockResolvedValue({ error: null });
        }
        
        return chain;
      });

      // Act
      const response = await request(app)
        .delete(`/api/admin/members/${memberId}/partner`)
        .set('Authorization', 'Bearer admin-token');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.message).toContain('Partner deleted and member role updated to normal');
    });

    it('토스 셀러 삭제 실패 시에도 파트너 삭제는 계속 진행해야 함', async () => {
      // Arrange
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: (jest.fn() as any).mockResolvedValue('Seller not found'),
      });

      let callCount = 0;
      
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++;
        const chain: any = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          in: jest.fn().mockReturnThis(),
          single: jest.fn(),
          update: jest.fn().mockReturnThis(),
          delete: jest.fn().mockReturnThis(),
          insert: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn(),
          or: jest.fn().mockReturnThis(),
        };
        
        if (table === 'members' && callCount === 1) {
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { role: 'admin' },
            error: null,
          });
        } else if (table === 'partners' && callCount === 2) {
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { id: partnerId, tosspayments_seller_id: sellerId },
            error: null,
          });
        } else if (table === 'call_participants' && callCount === 3) {
          // call_participants 조회: .select().eq() (레코드 없음)
          // .select()는 chain을 반환하고, 그 chain의 .eq()는 Promise를 반환해야 함
          const eqMock = (jest.fn() as any).mockResolvedValue({ data: [], error: null });
          const selectChain: any = {
            select: jest.fn().mockReturnThis(),
            eq: eqMock,
            in: jest.fn().mockReturnThis(),
            single: jest.fn(),
            update: jest.fn().mockReturnThis(),
            delete: jest.fn().mockReturnThis(),
            insert: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn(),
            or: jest.fn().mockReturnThis(),
          };
          chain.select = jest.fn(() => selectChain);
        } else if (table === 'partner_withdrawals' && callCount === 4) {
          chain.delete = jest.fn().mockReturnThis();
          (chain.eq as any) = (jest.fn() as any).mockResolvedValue({ error: null });
        } else if (table === 'partner_requests' && callCount === 5) {
          // partner_requests 조회: .select().eq().in() (active requests 없음)
          chain.select = jest.fn().mockReturnThis();
          chain.eq = jest.fn().mockReturnThis();
          chain.in = (jest.fn() as any).mockResolvedValue({ data: [], error: null });
        } else if (table === 'partners' && callCount === 7) {
          // partners 삭제: .delete().eq().select().single()
          chain.delete = jest.fn().mockReturnThis();
          chain.eq = jest.fn().mockReturnThis();
          chain.select = jest.fn().mockReturnThis();
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { id: partnerId },
            error: null,
          });
        } else if (table === 'members' && callCount === 8) {
          // members 업데이트: .update().eq() (single() 호출 안 함)
          chain.update = jest.fn().mockReturnThis();
          chain.eq = (jest.fn() as any).mockResolvedValue({ error: null });
        }
        
        return chain;
      });

      // Act
      const response = await request(app)
        .delete(`/api/admin/members/${memberId}/partner`)
        .set('Authorization', 'Bearer admin-token');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('토스 시크릿 키가 없어도 파트너 삭제는 계속 진행해야 함', async () => {
      // Arrange
      (mockGetTossSecretKey as any).mockReturnValueOnce(null);

      let callCount = 0;
      
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++;
        const chain: any = {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          in: jest.fn().mockReturnThis(),
          single: jest.fn(),
          update: jest.fn().mockReturnThis(),
          delete: jest.fn().mockReturnThis(),
          insert: jest.fn().mockReturnThis(),
          maybeSingle: jest.fn(),
          or: jest.fn().mockReturnThis(),
        };
        
        if (table === 'members' && callCount === 1) {
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { role: 'admin' },
            error: null,
          });
        } else if (table === 'partners' && callCount === 2) {
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { id: partnerId, tosspayments_seller_id: sellerId },
            error: null,
          });
        } else if (table === 'call_participants' && callCount === 3) {
          // call_participants 조회: .select().eq() (레코드 없음)
          // .select()는 chain을 반환하고, 그 chain의 .eq()는 Promise를 반환해야 함
          const eqMock = (jest.fn() as any).mockResolvedValue({ data: [], error: null });
          const selectChain: any = {
            select: jest.fn().mockReturnThis(),
            eq: eqMock,
            in: jest.fn().mockReturnThis(),
            single: jest.fn(),
            update: jest.fn().mockReturnThis(),
            delete: jest.fn().mockReturnThis(),
            insert: jest.fn().mockReturnThis(),
            maybeSingle: jest.fn(),
            or: jest.fn().mockReturnThis(),
          };
          chain.select = jest.fn(() => selectChain);
        } else if (table === 'partner_withdrawals' && callCount === 4) {
          chain.delete = jest.fn().mockReturnThis();
          (chain.eq as any) = (jest.fn() as any).mockResolvedValue({ error: null });
        } else if (table === 'partner_requests' && callCount === 5) {
          // partner_requests 조회: .select().eq().in() (active requests 없음)
          chain.select = jest.fn().mockReturnThis();
          chain.eq = jest.fn().mockReturnThis();
          chain.in = (jest.fn() as any).mockResolvedValue({ data: [], error: null });
        } else if (table === 'partners' && callCount === 7) {
          // partners 삭제: .delete().eq().select().single()
          chain.delete = jest.fn().mockReturnThis();
          chain.eq = jest.fn().mockReturnThis();
          chain.select = jest.fn().mockReturnThis();
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { id: partnerId },
            error: null,
          });
        } else if (table === 'members' && callCount === 8) {
          // members 업데이트: .update().eq() (single() 호출 안 함)
          chain.update = jest.fn().mockReturnThis();
          chain.eq = (jest.fn() as any).mockResolvedValue({ error: null });
        }
        
        return chain;
      });

      // Act
      const response = await request(app)
        .delete(`/api/admin/members/${memberId}/partner`)
        .set('Authorization', 'Bearer admin-token');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('에러 처리', () => {
    it('memberId가 없으면 에러를 반환해야 함', async () => {
      // Arrange
      let callCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++;
        const supabaseMock = createMockSupabase();
        const chain = supabaseMock.from(table);
        
        if (table === 'members' && callCount === 1) {
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { role: 'admin' },
            error: null,
          });
        }
        
        return chain;
      });

      // Act
      const response = await request(app)
        .delete('/api/admin/members//partner')
        .set('Authorization', 'Bearer admin-token');

      // Assert
      // Express는 빈 경로를 404로 처리할 수 있음
      expect([400, 404]).toContain(response.status);
    });

    it('파트너 조회 중 에러가 발생하면 에러를 반환해야 함', async () => {
      // Arrange
      const memberId = 'member-id';
      
      let callCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++;
        const supabaseMock = createMockSupabase();
        const chain = supabaseMock.from(table);
        
        if (table === 'members' && callCount === 1) {
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { role: 'admin' },
            error: null,
          });
        } else if (table === 'partners' && callCount === 2) {
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: null,
            error: { code: 'UNKNOWN_ERROR', message: 'Database error' },
          });
        }
        
        return chain;
      });

      // Act
      const response = await request(app)
        .delete(`/api/admin/members/${memberId}/partner`)
        .set('Authorization', 'Bearer admin-token');

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });
});
