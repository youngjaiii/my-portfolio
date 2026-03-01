/**
 * 음성 통화 기능 테스트
 * TDD를 위한 테스트 파일
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { Response } from 'express';
import voiceCallRouter from '../voice-call.route';

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

const app = express();
app.use(express.json());
app.use('/api/voice-call', voiceCallRouter);

describe('POST /api/voice-call/start', () => {
  let mockSupabase: any;
  let mockCreateSupabaseClient: jest.Mock<any>;
  let mockGetAuthUser: jest.Mock<() => Promise<{ id: string; role: string }>>;

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

    // Mock Supabase client
    mockSupabase = createMockSupabase();

    // Mock createSupabaseClient
    mockCreateSupabaseClient.mockReturnValue(mockSupabase);

    // Mock getAuthUser
    (mockGetAuthUser as any).mockResolvedValue({
      id: 'user-id-123',
      role: 'authenticated',
    });
  });

  describe('클라이언트가 파트너에게 통화를 거는 경우', () => {
    it('call_rooms에 partner_id가 파트너의 member_id로 저장되어야 함', async () => {
      // Arrange
      const clientId = 'user-id-123';
      const partnerMemberId = '5acb683d-7207-4b82-9fd5-500e0afa80d0';
      const partnerName = '이웃집토토123';
      const roomId = 'room-id-123';

      let callCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++;
        const chain = createMockSupabase();
        
        if (table === 'members' && callCount === 1) {
          // Caller의 이름 조회
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { name: '클라이언트' },
            error: null,
          });
        } else if (table === 'partners' && callCount === 2) {
          // Caller가 파트너인지 확인 (아님)
          (chain.maybeSingle as any) = (jest.fn() as any).mockResolvedValue({
            data: null,
            error: null,
          });
        } else if (table === 'partners' && callCount === 3) {
          // Target이 파트너인지 확인 (맞음)
          (chain.maybeSingle as any) = (jest.fn() as any).mockResolvedValue({
            data: { id: 'partner-id-456' },
            error: null,
          });
        } else if (table === 'call_rooms' && callCount === 4) {
          // call_rooms 생성
          chain.insert = jest.fn().mockReturnThis();
          chain.select = jest.fn().mockReturnThis();
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: {
              id: roomId,
              room_code: `call_${clientId}_${partnerMemberId}_1234567890`,
              status: 'waiting',
              member_id: clientId,
              partner_id: partnerMemberId, // 파트너의 member_id
              topic: '클라이언트님과의 음성 통화',
              started_at: new Date().toISOString(),
            },
            error: null,
          });
        } else if (table === 'call_participants' && callCount === 5) {
          // call_participants 생성
          chain.insert = (jest.fn() as any).mockResolvedValue({ error: null });
        }
        
        return chain;
      });

      // Act
      const response = await request(app)
        .post('/api/voice-call/start')
        .set('Authorization', 'Bearer test-token')
        .send({
          partner_id: partnerMemberId,
          partner_name: partnerName,
          call_id: '55963ca3-8880-4cdc-b543-52d4c6485a6a',
          device_info: {
            os: 'MacIntel',
            browser: 'Chrome',
          },
        });

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.room.partner_id).toBe(partnerMemberId); // 파트너의 member_id
      expect(response.body.data.room.member_id).toBe(clientId); // 클라이언트의 member_id
    });

    it('call_participants에 partner_id가 파트너의 member_id로 저장되어야 함', async () => {
      // Arrange
      const clientId = 'user-id-123';
      const partnerMemberId = '5acb683d-7207-4b82-9fd5-500e0afa80d0';
      const partnerName = '이웃집토토123';
      const roomId = 'room-id-123';

      let callCount = 0;
      let participantInsertCalled = false;
      let savedParticipant: any = null;

      mockSupabase.from.mockImplementation((table: string) => {
        callCount++;
        const chain = createMockSupabase();
        
        if (table === 'members' && callCount === 1) {
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { name: '클라이언트' },
            error: null,
          });
        } else if (table === 'partners' && callCount === 2) {
          (chain.maybeSingle as any) = (jest.fn() as any).mockResolvedValue({
            data: null,
            error: null,
          });
        } else if (table === 'partners' && callCount === 3) {
          (chain.maybeSingle as any) = (jest.fn() as any).mockResolvedValue({
            data: { id: 'partner-id-456' },
            error: null,
          });
        } else if (table === 'call_rooms' && callCount === 4) {
          // call_rooms 생성: .insert().select().single()
          const singleResult = (jest.fn() as any).mockResolvedValue({
            data: {
              id: roomId,
              room_code: `call_${clientId}_${partnerMemberId}_1234567890`,
              status: 'waiting',
              member_id: clientId,
              partner_id: partnerMemberId,
              topic: '클라이언트님과의 음성 통화',
              started_at: new Date().toISOString(),
            },
            error: null,
          });
          const selectChain = {
            select: jest.fn().mockReturnValue({ single: singleResult }),
            single: singleResult,
          };
          chain.insert = jest.fn().mockReturnValue(selectChain);
        } else if (table === 'call_participants' && callCount === 5) {
          participantInsertCalled = true;
          chain.insert = jest.fn().mockImplementation((data: any) => {
            savedParticipant = data[0] || data;
            return Promise.resolve({ error: null });
          });
        }
        
        return chain;
      });

      // Act
      const response = await request(app)
        .post('/api/voice-call/start')
        .set('Authorization', 'Bearer test-token')
        .send({
          partner_id: partnerMemberId,
          partner_name: partnerName,
          call_id: '55963ca3-8880-4cdc-b543-52d4c6485a6a',
          device_info: {
            os: 'MacIntel',
            browser: 'Chrome',
          },
        });

      // Assert
      expect(response.status).toBe(200);
      expect(participantInsertCalled).toBe(true);
      expect(savedParticipant).not.toBeNull();
      expect(savedParticipant.partner_id).toBe(partnerMemberId); // 파트너의 member_id
      expect(savedParticipant.member_id).toBe(clientId); // 클라이언트의 member_id
      expect(savedParticipant.actual_member_id).toBe(clientId);
      expect(savedParticipant.participant_type).toBe('member');
    });
  });

  describe('파트너가 클라이언트에게 통화를 거는 경우', () => {
    it('call_rooms에 partner_id가 파트너의 member_id로 저장되어야 함', async () => {
      // Arrange
      const partnerId = 'user-id-123'; // 파트너의 member_id (caller)
      const clientId = 'client-id-456'; // 클라이언트의 member_id (target)
      const roomId = 'room-id-123';

      let callCount = 0;
      mockSupabase.from.mockImplementation((table: string) => {
        callCount++;
        const chain = createMockSupabase();
        
        if (table === 'members' && callCount === 1) {
          (chain.single as any) = (jest.fn() as any).mockResolvedValue({
            data: { name: '파트너' },
            error: null,
          });
        } else if (table === 'partners' && callCount === 2) {
          // Caller가 파트너인지 확인 (맞음)
          (chain.maybeSingle as any) = (jest.fn() as any).mockResolvedValue({
            data: { id: 'partner-id-789' },
            error: null,
          });
        } else if (table === 'partners' && callCount === 3) {
          // Target이 파트너인지 확인 (아님) - 실제로는 사용하지 않지만 코드에서 확인함
          (chain.maybeSingle as any) = (jest.fn() as any).mockResolvedValue({
            data: null,
            error: null,
          });
        } else if (table === 'call_rooms' && callCount === 4) {
          // call_rooms 생성: .insert().select().single()
          const singleResult = (jest.fn() as any).mockResolvedValue({
            data: {
              id: roomId,
              room_code: `call_${partnerId}_${clientId}_1234567890`,
              status: 'waiting',
              member_id: clientId, // 클라이언트의 member_id
              partner_id: partnerId, // 파트너의 member_id
              topic: '파트너님과의 음성 통화',
              started_at: new Date().toISOString(),
            },
            error: null,
          });
          const selectChain = {
            select: jest.fn().mockReturnValue({ single: singleResult }),
            single: singleResult,
          };
          chain.insert = jest.fn().mockReturnValue(selectChain);
        } else if (table === 'call_participants' && callCount === 5) {
          chain.insert = (jest.fn() as any).mockResolvedValue({ error: null });
        }
        
        return chain;
      });

      // Act
      // 파트너가 클라이언트에게 통화를 거는 경우
      // partner_id는 클라이언트의 member_id를 의미 (통화를 받는 사람)
      const response = await request(app)
        .post('/api/voice-call/start')
        .set('Authorization', 'Bearer test-token')
        .send({
          partner_id: clientId, // 통화를 받는 사람 (클라이언트)
          partner_name: '클라이언트',
          call_id: '55963ca3-8880-4cdc-b543-52d4c6485a6a',
          device_info: {
            os: 'MacIntel',
            browser: 'Chrome',
          },
        });

      // Assert
      if (response.status !== 200) {
        console.error('Response error:', JSON.stringify(response.body, null, 2));
        console.error('Response status:', response.status);
        console.error('Response text:', response.text);
      }
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.room.partner_id).toBe(partnerId); // 파트너의 member_id
      expect(response.body.data.room.member_id).toBe(clientId); // 클라이언트의 member_id
    });
  });

  describe('에러 처리', () => {
    it('partner_id가 없으면 에러를 반환해야 함', async () => {
      // Act
      const response = await request(app)
        .post('/api/voice-call/start')
        .set('Authorization', 'Bearer test-token')
        .send({
          partner_name: '파트너',
        });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_BODY');
    });

    it('partner_name이 없으면 에러를 반환해야 함', async () => {
      // Act
      const response = await request(app)
        .post('/api/voice-call/start')
        .set('Authorization', 'Bearer test-token')
        .send({
          partner_id: 'partner-id',
        });

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_BODY');
    });
  });
});

