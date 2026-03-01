/**
 * 파트너 의뢰 상태 전이 테스트
 * - 승인(in_progress): pending → in_progress만 가능
 * - 거절(rejected): pending → rejected만 가능
 * - 완료(completed): in_progress → completed만 가능
 * - 취소(cancelled): pending 또는 in_progress → cancelled만 가능
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { Response } from 'express';
import partnerDashboardRouter from '../partner-dashboard.route';

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
app.use('/api/partner-dashboard', partnerDashboardRouter);

describe('PUT /api/partner-dashboard/requests/:requestId/status - 상태 전이 테스트', () => {
  let mockCreateSupabaseClient: jest.Mock<any>;
  let mockGetAuthUser: jest.Mock<any>;

  const testRequestId = 'test-request-id';
  const testPartnerId = 'test-partner-id';
  const testUserId = 'test-user-id';
  const testClientId = 'test-client-id';

  const createMockSupabase = (currentStatus: string) => {
    return {
      from: jest.fn<any>().mockImplementation((table: string) => {
        if (table === 'partners') {
          return {
            select: jest.fn<any>().mockReturnValue({
              eq: jest.fn<any>().mockReturnValue({
                single: jest.fn<any>().mockResolvedValue({
                  data: { id: testPartnerId, total_points: 100 },
                  error: null,
                }),
              }),
            }),
            update: jest.fn<any>().mockReturnValue({
              eq: jest.fn<any>().mockResolvedValue({ error: null }),
            }),
          };
        }
        if (table === 'partner_requests') {
          return {
            select: jest.fn<any>().mockReturnValue({
              eq: jest.fn<any>().mockImplementation(() => ({
                eq: jest.fn<any>().mockReturnValue({
                  single: jest.fn<any>().mockResolvedValue({
                    data: { id: testRequestId, partner_id: testPartnerId },
                    error: null,
                  }),
                }),
                single: jest.fn<any>().mockResolvedValue({
                  data: {
                    id: testRequestId,
                    partner_id: testPartnerId,
                    client_id: testClientId,
                    status: currentStatus,
                    job_count: 1,
                    coins_per_job: 100,
                    total_coins: 100,
                    partner: { member_id: testUserId },
                    partner_job: { job_name: 'Test Job' },
                    client: { id: testClientId, name: 'Test Client', total_points: 500 },
                  },
                  error: null,
                }),
              })),
            }),
            update: jest.fn<any>().mockReturnValue({
              eq: jest.fn<any>().mockReturnValue({
                select: jest.fn<any>().mockReturnValue({
                  single: jest.fn<any>().mockResolvedValue({
                    data: { id: testRequestId, status: 'updated' },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'partner_points_logs' || table === 'member_points_logs') {
          return {
            select: jest.fn<any>().mockReturnValue({
              eq: jest.fn<any>().mockReturnValue({
                eq: jest.fn<any>().mockReturnValue({
                  eq: jest.fn<any>().mockReturnValue({
                    maybeSingle: jest.fn<any>().mockResolvedValue({ data: null, error: null }),
                  }),
                  maybeSingle: jest.fn<any>().mockResolvedValue({ data: null, error: null }),
                }),
                maybeSingle: jest.fn<any>().mockResolvedValue({ data: null, error: null }),
              }),
            }),
            insert: jest.fn<any>().mockReturnValue({
              select: jest.fn<any>().mockResolvedValue({ data: [{}], error: null }),
            }),
          };
        }
        if (table === 'member_chats') {
          return {
            insert: jest.fn<any>().mockResolvedValue({ error: null }),
          };
        }
        return {};
      }),
      rpc: jest.fn<any>().mockResolvedValue({ error: null }),
    };
  };

  beforeEach(() => {
    mockCreateSupabaseClient = (global as any).__mockCreateSupabaseClient;
    mockGetAuthUser = (global as any).__mockGetAuthUser;
    mockGetAuthUser.mockResolvedValue({ id: testUserId });
  });

  describe('승인(in_progress) 상태 전이', () => {
    it('pending → in_progress: 성공해야 함', async () => {
      mockCreateSupabaseClient.mockReturnValue(createMockSupabase('pending'));

      const res = await request(app)
        .put(`/api/partner-dashboard/requests/${testRequestId}/status`)
        .send({ status: 'in_progress' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('in_progress → in_progress: 실패해야 함', async () => {
      mockCreateSupabaseClient.mockReturnValue(createMockSupabase('in_progress'));

      const res = await request(app)
        .put(`/api/partner-dashboard/requests/${testRequestId}/status`)
        .send({ status: 'in_progress' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS_CHANGE');
      expect(res.body.error.message).toContain('pending');
    });

    it('completed → in_progress: 실패해야 함', async () => {
      mockCreateSupabaseClient.mockReturnValue(createMockSupabase('completed'));

      const res = await request(app)
        .put(`/api/partner-dashboard/requests/${testRequestId}/status`)
        .send({ status: 'in_progress' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS_CHANGE');
    });

    it('rejected → in_progress: 실패해야 함', async () => {
      mockCreateSupabaseClient.mockReturnValue(createMockSupabase('rejected'));

      const res = await request(app)
        .put(`/api/partner-dashboard/requests/${testRequestId}/status`)
        .send({ status: 'in_progress' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS_CHANGE');
    });
  });

  describe('거절(rejected) 상태 전이', () => {
    it('pending → rejected: 성공해야 함', async () => {
      mockCreateSupabaseClient.mockReturnValue(createMockSupabase('pending'));

      const res = await request(app)
        .put(`/api/partner-dashboard/requests/${testRequestId}/status`)
        .send({ status: 'rejected' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('in_progress → rejected: 실패해야 함', async () => {
      mockCreateSupabaseClient.mockReturnValue(createMockSupabase('in_progress'));

      const res = await request(app)
        .put(`/api/partner-dashboard/requests/${testRequestId}/status`)
        .send({ status: 'rejected' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS_CHANGE');
      expect(res.body.error.message).toContain('pending');
    });

    it('completed → rejected: 실패해야 함', async () => {
      mockCreateSupabaseClient.mockReturnValue(createMockSupabase('completed'));

      const res = await request(app)
        .put(`/api/partner-dashboard/requests/${testRequestId}/status`)
        .send({ status: 'rejected' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS_CHANGE');
    });
  });

  describe('완료(completed) 상태 전이', () => {
    it('in_progress → completed: 성공해야 함', async () => {
      mockCreateSupabaseClient.mockReturnValue(createMockSupabase('in_progress'));

      const res = await request(app)
        .put(`/api/partner-dashboard/requests/${testRequestId}/status`)
        .send({ status: 'completed' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('pending → completed: 실패해야 함', async () => {
      mockCreateSupabaseClient.mockReturnValue(createMockSupabase('pending'));

      const res = await request(app)
        .put(`/api/partner-dashboard/requests/${testRequestId}/status`)
        .send({ status: 'completed' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS_CHANGE');
      expect(res.body.error.message).toContain('in_progress');
    });

    it('completed → completed: 실패해야 함 (중복 완료 방지)', async () => {
      mockCreateSupabaseClient.mockReturnValue(createMockSupabase('completed'));

      const res = await request(app)
        .put(`/api/partner-dashboard/requests/${testRequestId}/status`)
        .send({ status: 'completed' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS_CHANGE');
    });

    it('rejected → completed: 실패해야 함', async () => {
      mockCreateSupabaseClient.mockReturnValue(createMockSupabase('rejected'));

      const res = await request(app)
        .put(`/api/partner-dashboard/requests/${testRequestId}/status`)
        .send({ status: 'completed' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS_CHANGE');
    });

    it('cancelled → completed: 실패해야 함', async () => {
      mockCreateSupabaseClient.mockReturnValue(createMockSupabase('cancelled'));

      const res = await request(app)
        .put(`/api/partner-dashboard/requests/${testRequestId}/status`)
        .send({ status: 'completed' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS_CHANGE');
    });
  });

  describe('취소(cancelled) 상태 전이', () => {
    it('pending → cancelled: 성공해야 함', async () => {
      mockCreateSupabaseClient.mockReturnValue(createMockSupabase('pending'));

      const res = await request(app)
        .put(`/api/partner-dashboard/requests/${testRequestId}/status`)
        .send({ status: 'cancelled' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('in_progress → cancelled: 성공해야 함', async () => {
      mockCreateSupabaseClient.mockReturnValue(createMockSupabase('in_progress'));

      const res = await request(app)
        .put(`/api/partner-dashboard/requests/${testRequestId}/status`)
        .send({ status: 'cancelled' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('completed → cancelled: 실패해야 함', async () => {
      mockCreateSupabaseClient.mockReturnValue(createMockSupabase('completed'));

      const res = await request(app)
        .put(`/api/partner-dashboard/requests/${testRequestId}/status`)
        .send({ status: 'cancelled' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS_CHANGE');
    });

    it('rejected → cancelled: 실패해야 함', async () => {
      mockCreateSupabaseClient.mockReturnValue(createMockSupabase('rejected'));

      const res = await request(app)
        .put(`/api/partner-dashboard/requests/${testRequestId}/status`)
        .send({ status: 'cancelled' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS_CHANGE');
    });

    it('cancelled → cancelled: 실패해야 함 (중복 취소 방지)', async () => {
      mockCreateSupabaseClient.mockReturnValue(createMockSupabase('cancelled'));

      const res = await request(app)
        .put(`/api/partner-dashboard/requests/${testRequestId}/status`)
        .send({ status: 'cancelled' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS_CHANGE');
    });
  });
});
