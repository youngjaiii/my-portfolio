/**
 * 파트너 프로필 수정 시 members.name 동기화 테스트
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { Response } from 'express';
import partnerProfileRouter from '../partner-profile.route';

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
app.use('/api/partner-profile', partnerProfileRouter);

describe('PUT /api/partner-profile/update', () => {
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
                single: jest.fn<any>().mockResolvedValue({
                  data: { id: 'existing-partner-id' },
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

  it('partnerName 수정 시 members.name도 함께 업데이트되어야 함', async () => {
    const response = await request(app)
      .put('/api/partner-profile/update')
      .send({
        partnerName: 'New Partner Name',
      });

    expect(response.status).toBe(200);
    expect(membersUpdateCalled).toBe(true);
    expect(membersUpdateData).toHaveProperty('name', 'New Partner Name');
  });

  it('partnerName에 공백이 있으면 trim 처리되어야 함', async () => {
    const response = await request(app)
      .put('/api/partner-profile/update')
      .send({
        partnerName: '  Trimmed Partner  ',
      });

    expect(response.status).toBe(200);
    expect(membersUpdateCalled).toBe(true);
    expect(membersUpdateData).toHaveProperty('name', 'Trimmed Partner');
  });

  it('partnerName 없이 다른 필드만 수정하면 members.name은 업데이트되지 않아야 함', async () => {
    const response = await request(app)
      .put('/api/partner-profile/update')
      .send({
        partnerMessage: 'Updated message only',
      });

    expect(response.status).toBe(200);
    // partnerMessage만 수정했으므로 members 테이블 업데이트가 호출되지 않아야 함
    // (profileImage나 favoriteGame도 없으므로)
    expect(membersUpdateCalled).toBe(false);
  });

  it('partnerName과 profileImage를 함께 수정하면 둘 다 members에 업데이트되어야 함', async () => {
    const response = await request(app)
      .put('/api/partner-profile/update')
      .send({
        partnerName: 'New Name',
        profileImage: 'https://example.com/image.jpg',
      });

    expect(response.status).toBe(200);
    expect(membersUpdateCalled).toBe(true);
    expect(membersUpdateData).toHaveProperty('name', 'New Name');
    expect(membersUpdateData).toHaveProperty('profile_image', 'https://example.com/image.jpg');
  });
});
