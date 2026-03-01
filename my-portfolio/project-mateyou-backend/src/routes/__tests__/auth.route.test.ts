/**
 * 파트너 신청 시 members.name 동기화 테스트
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { Response } from 'express';
import authRouter from '../auth.route';

// Mock dependencies
jest.mock('../../lib/utils', () => {
  const actual = jest.requireActual('../../lib/utils') as any;

  const mockCreateSupabaseClientFn = jest.fn<any>();
  const mockGetAuthUserFn = jest.fn<any>();

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
app.use('/api/auth', authRouter);

describe('POST /api/auth/partner-apply', () => {
  let mockSupabase: any;
  let mockCreateSupabaseClient: jest.Mock<any>;
  let mockGetAuthUser: jest.Mock<any>;
  let membersUpdateCalled: boolean;
  let membersUpdateData: any;

  const createMockSupabase = () => {
    membersUpdateCalled = false;
    membersUpdateData = null;

    const mockChain: any = {
      select: jest.fn<any>().mockReturnThis(),
      eq: jest.fn<any>().mockReturnThis(),
      single: jest.fn<any>(),
      maybeSingle: jest.fn<any>(),
      insert: jest.fn<any>().mockReturnThis(),
      update: jest.fn<any>().mockImplementation((data: any) => {
        membersUpdateData = data;
        return mockChain;
      }),
      upsert: jest.fn<any>().mockReturnThis(),
      delete: jest.fn<any>().mockReturnThis(),
    };

    return {
      from: jest.fn<any>().mockImplementation((table: string) => {
        if (table === 'partners') {
          return {
            ...mockChain,
            select: jest.fn<any>().mockReturnValue({
              eq: jest.fn<any>().mockReturnValue({
                maybeSingle: jest.fn<any>().mockResolvedValue({ data: null, error: null }),
              }),
            }),
            insert: jest.fn<any>().mockReturnValue({
              select: jest.fn<any>().mockReturnValue({
                single: jest.fn<any>().mockResolvedValue({
                  data: { id: 'new-partner-id', partner_name: 'Test Partner' },
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'members') {
          return {
            ...mockChain,
            update: jest.fn<any>().mockImplementation((data: any) => {
              membersUpdateCalled = true;
              membersUpdateData = data;
              return {
                eq: jest.fn<any>().mockResolvedValue({ error: null }),
              };
            }),
          };
        }
        if (table === 'partner_business_info') {
          return {
            upsert: jest.fn<any>().mockResolvedValue({ error: null }),
          };
        }
        if (table === 'partner_categories') {
          return {
            upsert: jest.fn<any>().mockResolvedValue({ error: null }),
          };
        }
        return mockChain;
      }),
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateSupabaseClient = (global as any).__mockCreateSupabaseClient;
    mockGetAuthUser = (global as any).__mockGetAuthUser;

    mockGetAuthUser.mockResolvedValue({ id: 'test-user-id' });
    mockSupabase = createMockSupabase();
    mockCreateSupabaseClient.mockReturnValue(mockSupabase);
  });

  it('파트너 신청 시 members.name이 partner_name으로 업데이트되어야 함', async () => {
    const response = await request(app)
      .post('/api/auth/partner-apply')
      .send({
        partner_name: 'New Partner Name',
        partner_message: 'Hello',
      });

    expect(response.status).toBe(200);
    expect(membersUpdateCalled).toBe(true);
    expect(membersUpdateData).toEqual({ name: 'New Partner Name' });
  });

  it('partner_name에 공백이 있으면 trim 처리되어야 함', async () => {
    const response = await request(app)
      .post('/api/auth/partner-apply')
      .send({
        partner_name: '  Trimmed Name  ',
      });

    expect(response.status).toBe(200);
    expect(membersUpdateCalled).toBe(true);
    expect(membersUpdateData).toEqual({ name: 'Trimmed Name' });
  });
});

describe('PUT /api/auth/partner-apply', () => {
  let mockSupabase: any;
  let mockCreateSupabaseClient: jest.Mock<any>;
  let mockGetAuthUser: jest.Mock<any>;
  let membersUpdateCalled: boolean;
  let membersUpdateData: any;

  const createMockSupabase = () => {
    membersUpdateCalled = false;
    membersUpdateData = null;

    return {
      from: jest.fn<any>().mockImplementation((table: string) => {
        if (table === 'partners') {
          return {
            select: jest.fn<any>().mockReturnValue({
              eq: jest.fn<any>().mockReturnValue({
                maybeSingle: jest.fn<any>().mockResolvedValue({
                  data: { id: 'existing-partner-id', partner_status: 'pending' },
                  error: null,
                }),
              }),
            }),
            update: jest.fn<any>().mockReturnValue({
              eq: jest.fn<any>().mockReturnValue({
                select: jest.fn<any>().mockReturnValue({
                  single: jest.fn<any>().mockResolvedValue({
                    data: { id: 'existing-partner-id', partner_name: 'Updated Name' },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'members') {
          return {
            update: jest.fn<any>().mockImplementation((data: any) => {
              membersUpdateCalled = true;
              membersUpdateData = data;
              return {
                eq: jest.fn<any>().mockResolvedValue({ error: null }),
              };
            }),
          };
        }
        if (table === 'partner_business_info') {
          return {
            upsert: jest.fn<any>().mockResolvedValue({ error: null }),
          };
        }
        if (table === 'partner_categories') {
          return {
            delete: jest.fn<any>().mockReturnValue({
              eq: jest.fn<any>().mockResolvedValue({ error: null }),
            }),
            insert: jest.fn<any>().mockResolvedValue({ error: null }),
          };
        }
        return {};
      }),
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateSupabaseClient = (global as any).__mockCreateSupabaseClient;
    mockGetAuthUser = (global as any).__mockGetAuthUser;

    mockGetAuthUser.mockResolvedValue({ id: 'test-user-id' });
    mockSupabase = createMockSupabase();
    mockCreateSupabaseClient.mockReturnValue(mockSupabase);
  });

  it('pending 상태 파트너 신청 수정 시 members.name이 업데이트되어야 함', async () => {
    const response = await request(app)
      .put('/api/auth/partner-apply')
      .send({
        partner_name: 'Updated Partner Name',
      });

    expect(response.status).toBe(200);
    expect(membersUpdateCalled).toBe(true);
    expect(membersUpdateData).toEqual({ name: 'Updated Partner Name' });
  });

  it('partner_name 없이 다른 필드만 수정하면 members.name은 업데이트되지 않아야 함', async () => {
    const response = await request(app)
      .put('/api/auth/partner-apply')
      .send({
        partner_message: 'Updated message only',
      });

    expect(response.status).toBe(200);
    expect(membersUpdateCalled).toBe(false);
  });
});
