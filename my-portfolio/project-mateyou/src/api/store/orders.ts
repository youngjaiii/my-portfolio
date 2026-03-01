import { edgeApi } from '@/lib/edgeApi';

export interface OrderItem {
  order_item_id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  subtotal?: number;
  product_name?: string;
  product_type?: 'digital' | 'on_site' | 'delivery';
  product_source?: string;
  status?: 'pending' | 'paid' | 'shipped' | 'delivered' | 'confirmed' | 'cancelled';
  is_confirmed?: boolean;
  product?: any;
  selected_options?: Array<{
    option_id: string;
    option_name: string;
    option_type: 'select' | 'text';
    value_id?: string;
    value?: string;
    text_value?: string;
    price_adjustment: number;
  }>;
  created_at: string;
}

export interface ShipmentItem {
  shipment_item_id: string;
  shipment_id: string;
  order_item_id: string;
  quantity: number;
  order_item?: OrderItem;
}

export interface Shipment {
  shipment_id: string;
  order_id: string;
  courier?: string;
  tracking_number?: string;
  status: 'pending' | 'shipped' | 'in_transit' | 'delivered';
  shipped_at?: string;
  delivered_at?: string;
  shipping_fee?: number;
  recipient_name?: string;
  recipient_phone?: string;
  recipient_address?: string;
  recipient_address_detail?: string;
  recipient_postal_code?: string;
  delivery_memo?: string;
  delivery_status?: string;
  delivery_status_text?: string;
  delivery_events?: Array<{
    time?: string;
    datetime?: string;
    description?: string;
    status?: string;
    location?: string;
  }>;
  shipment_items?: ShipmentItem[];
  created_at?: string;
  updated_at?: string;
}

export interface StoreOrder {
  order_id: string;
  order_number?: string;
  user_id: string;
  product_id?: string;
  quantity: number;
  total_amount: number;
  subtotal_amount?: number;
  total_shipping_fee?: number;
  status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'confirmed' | 'cancelled';
  schedule_id?: string;
  recipient_name?: string;
  recipient_phone?: string;
  recipient_address?: string;
  recipient_address_detail?: string;
  recipient_postal_code?: string;
  delivery_memo?: string;
  courier?: string;
  tracking_number?: string;
  shipped_at?: string;
  delivered_at?: string;
  is_confirmed?: boolean;
  confirmed_at?: string;
  shipping_fee?: number;
  created_at: string;
  updated_at: string;
  product?: any;
  schedule?: any;
  order_items?: OrderItem[];
  shipments?: Shipment[];
  partner?: {
    id: string;
    name?: string;
    member_code?: string;
    profile_image?: string;
  };
}

export interface CreateOrderParams {
  product_id: string;
  quantity: number;
  schedule_id?: string;
  recipient_name?: string;
  recipient_phone?: string;
  recipient_address?: string;
  recipient_postal_code?: string;
  delivery_memo?: string;
}

export interface UpdateOrderStatusParams {
  status: 'paid' | 'shipped' | 'delivered' | 'confirmed' | 'cancelled';
  courier?: string;
  tracking_number?: string;
  shipment_id?: string;
  order_item_id?: string;
}

export const storeOrdersApi = {
  getList: async (params?: { status?: string; page?: number; limit?: number; includeTracking?: boolean }) => {
    const queryParams: Record<string, string> = {};
    if (params?.status) queryParams.status = params.status;
    if (params?.page) queryParams.page = String(params.page);
    if (params?.limit) queryParams.limit = String(params.limit);
    if (params?.includeTracking) queryParams.includeTracking = 'true';
    const response = await edgeApi.makeRequest('api-store-orders', Object.keys(queryParams).length > 0 ? `?${new URLSearchParams(queryParams).toString()}` : '');
    return response;
  },

  getDetail: async (orderId: string) => {
    const response = await edgeApi.makeRequest('api-store-orders', `/${orderId}`);
    return response;
  },

  create: async (data: CreateOrderParams) => {
    const response = await edgeApi.makeRequest('api-store-orders', '', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response;
  },

  updateStatus: async (orderId: string, data: UpdateOrderStatusParams) => {
    const response = await edgeApi.makeRequest('api-store-orders', `/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return response;
  },

  confirm: async (orderId: string) => {
    const response = await edgeApi.makeRequest('api-store-orders', `/${orderId}/confirm`, {
      method: 'PUT',
    });
    return response;
  },

  cancel: async (orderId: string) => {
    const response = await edgeApi.makeRequest('api-store-orders', `/${orderId}/cancel`, {
      method: 'PUT',
    });
    return response;
  },

  cancelItem: async (orderId: string, orderItemId: string) => {
    const response = await edgeApi.makeRequest('api-store-orders', `/${orderId}/cancel-item`, {
      method: 'PUT',
      body: JSON.stringify({ order_item_id: orderItemId }),
    });
    return response;
  },

  getPartnerOrders: async (params?: { status?: string; page?: number; limit?: number; source?: string }) => {
    const queryParams = { ...params, includeTracking: 'true' };
    const response = await edgeApi.makeRequest('api-store-orders', `/partner/orders?${new URLSearchParams(queryParams as any).toString()}`);
    return response;
  },

  getPartnerStats: async (params?: { period?: string; start_date?: string; end_date?: string; product_id?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.period) queryParams.set('period', params.period);
    if (params?.start_date) queryParams.set('start_date', params.start_date);
    if (params?.end_date) queryParams.set('end_date', params.end_date);
    if (params?.product_id) queryParams.set('product_id', params.product_id);
    const query = queryParams.toString();
    const response = await edgeApi.makeRequest('api-store-orders', `/partner/stats${query ? `?${query}` : ''}`);
    return response;
  },

  getAdminStats: async (params?: { period?: string; start_date?: string; end_date?: string; partner_id?: string; product_id?: string }) => {
    const queryParams = new URLSearchParams();
    if (params?.period) queryParams.set('period', params.period);
    if (params?.start_date) queryParams.set('start_date', params.start_date);
    if (params?.end_date) queryParams.set('end_date', params.end_date);
    if (params?.partner_id) queryParams.set('partner_id', params.partner_id);
    if (params?.product_id) queryParams.set('product_id', params.product_id);
    const query = queryParams.toString();
    const response = await edgeApi.makeRequest('api-store-orders', `/admin/stats${query ? `?${query}` : ''}`);
    return response;
  },
};

