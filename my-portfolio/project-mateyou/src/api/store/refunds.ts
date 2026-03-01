import { edgeApi } from '@/lib/edgeApi';

export interface CreateRefundParams {
  order_item_id: string;
  reason?: string;
}

export interface Refund {
  refund_id: string;
  order_id: string;
  user_id: string;
  amount: number;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  requested_at: string;
  responded_at?: string;
  responded_by?: string;
  completed_at?: string;
}

export const storeRefundsApi = {
  create: async (data: CreateRefundParams) => {
    const response = await edgeApi.makeRequest('api-store-refunds', '', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response;
  },

  getList: async (params?: { status?: string; page?: number; limit?: number }) => {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    const response = await edgeApi.makeRequest('api-store-refunds', query);
    return response;
  },

  getDetail: async (refundId: string) => {
    const response = await edgeApi.makeRequest('api-store-refunds', `/${refundId}`);
    return response;
  },

  getPartnerList: async (params?: { status?: string; page?: number; limit?: number }) => {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    const response = await edgeApi.makeRequest('api-store-refunds', `/partner/list${query}`);
    return response;
  },

  getAdminList: async (params?: { status?: string; page?: number; limit?: number }) => {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    const response = await edgeApi.makeRequest('api-store-refunds', `/admin/list${query}`);
    return response;
  },

  partnerRespond: async (refundId: string, data: { action: 'accept' | 'reject'; rejection_reason?: string }) => {
    const response = await edgeApi.makeRequest('api-store-refunds', `/${refundId}/partner-respond`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return response;
  },

  adminProcess: async (refundId: string, data: { action: 'approve' | 'reject'; rejection_reason?: string }) => {
    const response = await edgeApi.makeRequest('api-store-refunds', `/${refundId}/process`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return response;
  },
};

