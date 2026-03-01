import { edgeApi } from '@/lib/edgeApi';
import { supabase } from '@/lib/supabase';

const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL;

export interface CollaborationProductRequest {
  request_id: string;
  product_id: string;
  partner_id: string;
  admin_id: string;
  status: 'pending' | 'accepted' | 'rejected';
  distribution_rate?: number;
  rejection_reason?: string;
  created_at: string;
  updated_at?: string;
  product?: {
    product_id: string;
    name: string;
    description?: string;
    price: number;
    product_type: 'delivery' | 'digital' | 'on_site';
    thumbnail_url?: string;
    stock?: number;
    is_active: boolean;
  };
  partner?: {
    id: string;
    partner_name: string;
    member?: { id: string; name: string; profile_image?: string };
  };
  admin?: { id: string; name: string; email: string };
}

export interface ShipmentRequest {
  request_id: string;
  order_id: string;
  product_id: string;
  partner_id: string;
  status: 'pending' | 'approved' | 'rejected' | 'shipped';
  notes?: string;
  courier?: string;
  tracking_number?: string;
  rejection_reason?: string;
  created_at: string;
  processed_at?: string;
  processed_by?: string;
  shipped_at?: string;
  pickup_date?: string;
  pickup_time?: string;
  order?: {
    order_id: string;
    order_number: string;
    status: string;
    total_amount: number;
    quantity: number;
    shipping_fee?: number;
    recipient_name?: string;
    recipient_phone?: string;
    recipient_address?: string;
    recipient_postal_code?: string;
    delivery_memo?: string;
    buyer?: { id: string; name: string; profile_image?: string };
  };
  product?: {
    product_id: string;
    name: string;
    thumbnail_url?: string;
    price: number;
    product_type: string;
    stock?: number;
  };
  partner?: {
    id: string;
    partner_name: string;
    member?: { id: string; name: string; profile_image?: string };
  };
}

export interface CollaborationStats {
  total_collaboration_products: number;
  pending_product_requests: number;
  pending_shipment_requests: number;
  shipped_this_month: number;
}

export interface CollaborationProduct {
  product_id: string;
  name: string;
  description?: string;
  price: number;
  product_type: 'delivery' | 'digital' | 'on_site';
  thumbnail_url?: string;
  stock?: number;
  is_active: boolean;
  source: string;
  created_at: string;
  partner?: {
    id: string;
    partner_name: string;
    member?: { id: string; name: string; profile_image?: string };
  };
}

export interface OrderFulfillment {
  id: string;
  order_id: string;
  partner_id: string;
  product_type: 'on_site' | 'delivery';
  media_urls: string[];
  note?: string;
  notified_at?: string;
  created_at: string;
  partner?: {
    id: string;
    partner_name: string;
  };
}

export const storeCollaborationApi = {
  getProductRequests: async (params?: { status?: string; page?: number; limit?: number }) => {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    const response = await edgeApi.makeRequest('api-store-collaboration', `/product-requests${query}`);
    return response;
  },

  getProductRequestsAdmin: async (params?: { status?: string; page?: number; limit?: number }) => {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    const response = await edgeApi.makeRequest('api-store-collaboration', `/product-requests/admin${query}`);
    return response;
  },

  createProductRequest: async (data: { product_id: string; partner_id: string; distribution_rate?: number }) => {
    const response = await edgeApi.makeRequest('api-store-collaboration', '/product-requests', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response;
  },

  getPartnersWithRates: async (params?: { page?: number; limit?: number; sort_by?: string; sort_order?: string; partner_name?: string }) => {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    const response = await edgeApi.makeRequest('api-store-collaboration', `/partners-with-rates${query}`);
    return response;
  },

  sendRequests: async (data: { product_id: string; partners: Array<{ partner_id: string; share_rate?: number | null; distribution_rate?: number }> }) => {
    const response = await edgeApi.makeRequest('api-store-collaboration', '/send-requests', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response;
  },

  getProductRequestDetail: async (requestId: string) => {
    const response = await edgeApi.makeRequest('api-store-collaboration', `/product-requests/detail?request_id=${requestId}`);
    return response;
  },

  respondProductRequest: async (requestId: string, data: { action: 'accept' | 'reject'; rejection_reason?: string }) => {
    const response = await edgeApi.makeRequest('api-store-collaboration', `/product-requests/respond?request_id=${requestId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return response;
  },

  createShipmentRequest: async (data: { order_id: string; product_id?: string; notes?: string }) => {
    const response = await edgeApi.makeRequest('api-store-collaboration', '/shipment-requests', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response;
  },

  getShipmentRequests: async (params?: { status?: string; page?: number; limit?: number }) => {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    const response = await edgeApi.makeRequest('api-store-collaboration', `/shipment-requests${query}`);
    return response;
  },

  getShipmentRequestDetail: async (requestId: string) => {
    const response = await edgeApi.makeRequest('api-store-collaboration', `/shipment-requests/detail?request_id=${requestId}`);
    return response;
  },

  getShipmentRequestsAdmin: async (params?: { status?: string; page?: number; limit?: number }) => {
    // Admin은 일반 getShipmentRequests API를 사용 (서버에서 모든 요청 반환)
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    const response = await edgeApi.makeRequest('api-store-collaboration', `/shipment-requests${query}`);
    return response;
  },

  respondShipmentRequest: async (requestId: string, data: { status: 'approved' | 'rejected'; courier?: string; tracking_number?: string; pickup_date?: string; pickup_time?: string }) => {
    const response = await edgeApi.makeRequest('api-store-collaboration', `/shipment-requests/respond?request_id=${requestId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return response;
  },

  getProducts: async (params?: { page?: number; limit?: number; product_type?: string; partner_id?: string }) => {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    const response = await edgeApi.makeRequest('api-store-collaboration', `/products${query}`);
    return response;
  },

  getProductDetail: async (productId: string) => {
    const response = await edgeApi.makeRequest('api-store-collaboration', `/products/detail?product_id=${productId}`);
    return response;
  },

  updateStock: async (productId: string, data: { stock: number }) => {
    const response = await edgeApi.makeRequest('api-store-collaboration', `/products/stock?product_id=${productId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return response;
  },

  getStats: async () => {
    const response = await edgeApi.makeRequest('api-store-collaboration', '/stats');
    return response;
  },

  getPendingOrders: async (params?: { page?: number; limit?: number }) => {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    const response = await edgeApi.makeRequest('api-store-collaboration', `/partner/pending-orders${query}`);
    return response;
  },

  getDistributionRate: async (productId: string) => {
    const response = await edgeApi.makeRequest('api-store-collaboration', `/distribution-rate?product_id=${productId}`);
    return response;
  },

  updateDistributionRate: async (productId: string, partnerId: string, distributionRate: number, shareRate?: number | null) => {
    const data: any = { 
      product_id: productId, 
      partner_id: partnerId,
      distribution_rate: distributionRate,
    };
    if (shareRate !== undefined) data.share_rate = shareRate;
    const response = await edgeApi.makeRequest('api-store-collaboration', '/distribution-rate', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return response;
  },

  getDistributionRates: async (params?: { page?: number; limit?: number }) => {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    const response = await edgeApi.makeRequest('api-store-collaboration', `/distribution-rates${query}`);
    return response;
  },

  adminSearchProducts: async (params: {
    keyword: string;
    product_type?: string;
    source?: string;
    is_active?: boolean;
    page?: number;
    limit?: number;
  }) => {
    const query = `?${new URLSearchParams(params as any).toString()}`;
    const response = await edgeApi.makeRequest('api-store-products', `/admin/search${query}`);
    return response;
  },

  searchPartners: async (query: string = '') => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      params.set('limit', '50');

      const url = `${EDGE_FUNCTIONS_URL}/functions/v1/api-partner-search?${params.toString()}`;
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
      });
      const data = await response.json();
      return { success: true, data: data.data || [] };
    } catch (error) {
      console.error('파트너 검색 실패:', error);
      return { success: false, data: [] };
    }
  },

  fulfillOrder: async (orderId: string, files: File[], note?: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const formData = new FormData();
      files.forEach(file => formData.append('files', file));
      if (note) formData.append('note', note);

      const url = `${EDGE_FUNCTIONS_URL}/functions/v1/api-store-schedules/order/${orderId}/fulfill`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: formData,
      });
      return await response.json();
    } catch (error) {
      console.error('이행완료 등록 실패:', error);
      return { success: false, error: { message: '이행완료 등록에 실패했습니다.' } };
    }
  },

  fulfillOrderWithUrls: async (orderId: string, mediaUrls: string[], note?: string) => {
    const response = await edgeApi.makeRequest('api-store-schedules', `/order/${orderId}/fulfill`, {
      method: 'POST',
      body: JSON.stringify({ media_urls: mediaUrls, note }),
    });
    return response;
  },

  getFulfillment: async (orderId: string) => {
    const response = await edgeApi.makeRequest('api-store-schedules', `/order/${orderId}/fulfillment`);
    return response;
  },
};

