/**
 * 배너 생성 및 파일 업로드 기능 테스트
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { Response } from 'express';
import adminRouter from '../admin.route';
import storageRouter from '../storage.route';

// Mock dependencies
jest.mock('../../lib/utils', () => {
  const actual = jest.requireActual('../../lib/utils') as any;
  
  const mockCreateSupabaseClientFn = jest.fn<any>();
  const mockGetAuthUserFn = jest.fn<() => Promise<{ id: string; role: string }>>();
  
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

// Mock toss-auth (admin.route.ts에서 사용하지만 배너 테스트에서는 필요 없음)
jest.mock('../../lib/toss-auth', () => {
  const actual = jest.requireActual('../../lib/toss-auth') as any;
  
  // 되돌린 버전에 맞춰서 모든 함수 mock
  const mockGetTossSecretKeyFn = jest.fn<any>();
  const mockCreateTossHeadersFn = jest.fn<any>();
  const mockGetTossPaymentSecretKeyFn = jest.fn<any>();
  const mockGetTossPayoutSecretKeyFn = jest.fn<any>();
  const mockCreateTossPaymentHeadersFn = jest.fn<any>();
  const mockCreateTossPayoutHeadersFn = jest.fn<any>();
  const mockCreateTossAuthHeaderFn = jest.fn<any>();
  
  return {
    ...actual,
    // Deprecated 함수들 (하위 호환성)
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

// multer는 실제로 사용 (메모리 스토리지 사용)
// multer mock 제거 - 실제 multer를 사용하여 테스트

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/admin', adminRouter);
app.use('/api/storage', storageRouter);

describe('배너 생성 및 파일 업로드 테스트', () => {
  let mockSupabase: any;
  let mockCreateSupabaseClient: jest.Mock<any>;
  let mockGetAuthUser: jest.Mock<() => Promise<{ id: string; role: string }>>;

  // Helper function to create chain
  const createChain = (table: string) => {
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

  beforeEach(() => {
    jest.clearAllMocks();

    // Get mocked functions from global
    mockCreateSupabaseClient = (global as any).__mockCreateSupabaseClient;
    mockGetAuthUser = (global as any).__mockGetAuthUser;

    // Supabase from 메서드가 호출될 때마다 적절한 chain 반환
    const fromMock = jest.fn((table: string) => {
      const chain = createChain(table);
      
      if (table === 'members') {
        // requireAdmin 미들웨어용 - admin role 반환
        chain.single = jest.fn<any>().mockResolvedValue({
          data: { role: 'admin' },
          error: null,
        });
      }
      // ad_banners는 각 테스트에서 개별적으로 설정
      
      return chain;
    });

    mockSupabase = {
      from: fromMock,
      storage: {
        from: jest.fn(),
      },
    };

    mockCreateSupabaseClient.mockReturnValue(mockSupabase);
    mockGetAuthUser.mockResolvedValue({ id: 'test-user-id', role: 'admin' });
  });

  describe('POST /api/storage/upload - 파일 업로드', () => {
    it('이미지 파일 업로드 성공', async () => {
      const mockUpload = jest.fn<any>().mockResolvedValue({
        data: { path: 'admin/test-image.jpg' },
        error: null,
      });

      const mockGetPublicUrl = jest.fn<any>().mockReturnValue({
        data: { publicUrl: 'https://example.com/storage/admin/test-image.jpg' },
      });

      mockSupabase.storage.from.mockReturnValue({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
      });

      const response = await request(app)
        .post('/api/storage/upload')
        .set('Authorization', 'Bearer test-token')
        .field('bucket', 'ad-images')
        .field('path', 'admin/test-image.jpg')
        .field('upsert', 'true')
        .attach('file', Buffer.from('fake-image-data'), 'test-image.jpg');

      // 에러 응답 확인
      if (response.status !== 200) {
        console.error('Upload error:', response.status, JSON.stringify(response.body, null, 2));
      }
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('url');
      expect(response.body.data.path).toBe('admin/test-image.jpg');
      expect(mockSupabase.storage.from).toHaveBeenCalledWith('ad-images');
      expect(mockUpload).toHaveBeenCalledWith(
        'admin/test-image.jpg',
        expect.any(Buffer),
        expect.objectContaining({
          cacheControl: '3600',
          upsert: true,
          contentType: 'image/jpeg',
        })
      );
    });

    it('파일이 없으면 에러 반환', async () => {
      // multer mock을 override하여 file이 없도록 설정
      const multer = require('multer');
      const originalSingle = multer().single;
      multer().single = jest.fn(() => (req: any, res: any, next: any) => {
        req.file = undefined;
        next();
      });

      const response = await request(app)
        .post('/api/storage/upload')
        .set('Authorization', 'Bearer test-token')
        .field('bucket', 'ad-images')
        .field('path', 'admin/test.jpg');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MISSING_FILE');

      // 원래대로 복구
      multer().single = originalSingle;
    });

    it('버킷이 없으면 에러 반환', async () => {
      const response = await request(app)
        .post('/api/storage/upload')
        .set('Authorization', 'Bearer test-token')
        .field('path', 'admin/test.jpg')
        .attach('file', Buffer.from('fake-image-data'), 'test.jpg');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MISSING_BUCKET');
    });

    it('경로가 없으면 에러 반환', async () => {
      const response = await request(app)
        .post('/api/storage/upload')
        .set('Authorization', 'Bearer test-token')
        .field('bucket', 'ad-images')
        .attach('file', Buffer.from('fake-image-data'), 'test.jpg');

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('MISSING_PATH');
    });
  });

  describe('POST /api/admin/banners - 배너 생성', () => {
    it('배너 생성 성공 (image_url을 background_image로 변환)', async () => {
      // ad_banners 테이블에 대한 mock 설정
      const adBannersChain = createChain('ad_banners');
      
      adBannersChain.insert = jest.fn<any>().mockReturnThis();
      adBannersChain.select = jest.fn<any>().mockReturnThis();
      adBannersChain.single = jest.fn<any>().mockResolvedValue({
        data: {
          id: 'banner-id-123',
          title: '테스트 배너',
          description: '테스트 설명',
          background_image: 'https://example.com/image.jpg',
          link_url: 'https://example.com',
          is_active: true,
          created_at: '2025-01-27T00:00:00Z',
          updated_at: '2025-01-27T00:00:00Z',
        },
        error: null,
      });

      // from이 ad_banners를 호출하면 위의 chain 반환
      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'members') {
          const membersChain = createChain('members');
          membersChain.single = jest.fn<any>().mockResolvedValue({
            data: { role: 'admin' },
            error: null,
          });
          return membersChain;
        }
        if (table === 'ad_banners') {
          return adBannersChain;
        }
        return createChain(table);
      });

      const response = await request(app)
        .post('/api/admin/banners')
        .set('Authorization', 'Bearer test-token')
        .send({
          title: '테스트 배너',
          description: '테스트 설명',
          image_url: 'https://example.com/image.jpg',
          link_url: 'https://example.com',
          is_active: true,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.banner).toHaveProperty('id');
      expect(response.body.data.banner.background_image).toBe('https://example.com/image.jpg');
      
      // image_url이 background_image로 변환되었는지 확인
      expect(adBannersChain.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '테스트 배너',
          description: '테스트 설명',
          background_image: 'https://example.com/image.jpg', // image_url이 background_image로 변환됨
          link_url: 'https://example.com',
          is_active: true,
        })
      );
    });

    it('제목이 없으면 에러 반환', async () => {
      const response = await request(app)
        .post('/api/admin/banners')
        .set('Authorization', 'Bearer test-token')
        .send({
          image_url: 'https://example.com/image.jpg',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_BODY');
    });

    it('image_url이 없으면 에러 반환', async () => {
      const response = await request(app)
        .post('/api/admin/banners')
        .set('Authorization', 'Bearer test-token')
        .send({
          title: '테스트 배너',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('INVALID_BODY');
    });

    it('Supabase 에러 처리', async () => {
      // ad_banners 테이블에 대한 mock 설정 (에러 케이스)
      const adBannersChain = createChain('ad_banners');
      
      adBannersChain.insert = jest.fn<any>().mockReturnThis();
      adBannersChain.select = jest.fn<any>().mockReturnThis();
      adBannersChain.single = jest.fn<any>().mockResolvedValue({
        data: null,
        error: { message: 'Database error', code: 'PGRST_ERROR' },
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'members') {
          const membersChain = createChain('members');
          membersChain.single = jest.fn<any>().mockResolvedValue({
            data: { role: 'admin' },
            error: null,
          });
          return membersChain;
        }
        if (table === 'ad_banners') {
          return adBannersChain;
        }
        return createChain(table);
      });

      const response = await request(app)
        .post('/api/admin/banners')
        .set('Authorization', 'Bearer test-token')
        .send({
          title: '테스트 배너',
          image_url: 'https://example.com/image.jpg',
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('BANNER_CREATE_ERROR');
    });
  });

  describe('PUT /api/admin/banners/:bannerId - 배너 수정', () => {
    it('배너 수정 성공 (image_url을 background_image로 변환)', async () => {
      // ad_banners 테이블에 대한 mock 설정
      const adBannersChain = createChain('ad_banners');
      
      adBannersChain.update = jest.fn<any>().mockReturnThis();
      adBannersChain.eq = jest.fn<any>().mockReturnThis();
      adBannersChain.select = jest.fn<any>().mockReturnThis();
      adBannersChain.single = jest.fn<any>().mockResolvedValue({
        data: {
          id: 'banner-id-123',
          title: '수정된 배너',
          background_image: 'https://example.com/new-image.jpg',
          is_active: false,
        },
        error: null,
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'members') {
          const membersChain = createChain('members');
          membersChain.single = jest.fn<any>().mockResolvedValue({
            data: { role: 'admin' },
            error: null,
          });
          return membersChain;
        }
        if (table === 'ad_banners') {
          return adBannersChain;
        }
        return createChain(table);
      });

      const response = await request(app)
        .put('/api/admin/banners/banner-id-123')
        .set('Authorization', 'Bearer test-token')
        .send({
          title: '수정된 배너',
          image_url: 'https://example.com/new-image.jpg',
          is_active: false,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.banner.background_image).toBe('https://example.com/new-image.jpg');
      
      // image_url이 background_image로 변환되었는지 확인
      expect(adBannersChain.update).toHaveBeenCalledWith(
        expect.objectContaining({
          title: '수정된 배너',
          background_image: 'https://example.com/new-image.jpg', // image_url이 background_image로 변환됨
          is_active: false,
        })
      );
    });
  });

  describe('통합 테스트: 파일 업로드 후 배너 생성', () => {
    it('파일 업로드 → 배너 생성 플로우', async () => {
      // 1. 파일 업로드 Mock
      const mockUpload = jest.fn<any>().mockResolvedValue({
        data: { path: 'admin/test-banner.jpg' },
        error: null,
      });

      const mockGetPublicUrl = jest.fn<any>().mockReturnValue({
        data: { publicUrl: 'https://example.com/storage/admin/test-banner.jpg' },
      });

      mockSupabase.storage.from.mockReturnValue({
        upload: mockUpload,
        getPublicUrl: mockGetPublicUrl,
      });

      // 파일 업로드
      const uploadResponse = await request(app)
        .post('/api/storage/upload')
        .set('Authorization', 'Bearer test-token')
        .field('bucket', 'ad-images')
        .field('path', 'admin/test-banner.jpg')
        .field('upsert', 'true')
        .attach('file', Buffer.from('fake-image-data'), 'test-banner.jpg');

      expect(uploadResponse.status).toBe(200);
      const imageUrl = uploadResponse.body.data.url;

      // 2. 배너 생성 Mock
      const adBannersChain = createChain('ad_banners');
      
      adBannersChain.insert = jest.fn<any>().mockReturnThis();
      adBannersChain.select = jest.fn<any>().mockReturnThis();
      adBannersChain.single = jest.fn<any>().mockResolvedValue({
        data: {
          id: 'banner-id-123',
          title: '통합 테스트 배너',
          background_image: imageUrl,
          is_active: true,
        },
        error: null,
      });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === 'members') {
          const membersChain = createChain('members');
          membersChain.single = jest.fn<any>().mockResolvedValue({
            data: { role: 'admin' },
            error: null,
          });
          return membersChain;
        }
        if (table === 'ad_banners') {
          return adBannersChain;
        }
        return createChain(table);
      });

      // 배너 생성
      const bannerResponse = await request(app)
        .post('/api/admin/banners')
        .set('Authorization', 'Bearer test-token')
        .send({
          title: '통합 테스트 배너',
          image_url: imageUrl,
          is_active: true,
        });

      expect(bannerResponse.status).toBe(200);
      expect(bannerResponse.body.data.banner.background_image).toBe(imageUrl);
    });
  });
});

