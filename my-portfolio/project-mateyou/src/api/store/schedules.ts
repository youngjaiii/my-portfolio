import { edgeApi } from '@/lib/edgeApi';

export interface StoreSchedule {
  schedule_id: string;
  order_id?: string;
  partner_id?: string;
  product_id: string;
  start_time?: string;
  end_time?: string;
  location?: string;
  location_id?: string;
  location_point?: { lat: number; lng: number };
  max_bookings?: number;
  current_bookings?: number;
  is_available?: boolean;
  status: 'pending' | 'reserved' | 'completed' | 'no_show' | 'canceled';
  created_at: string;
  updated_at: string;
  product?: {
    product_id: string;
    name: string;
    partner_id: string;
  };
}

export interface LocationPoint {
  lat: number;
  lng: number;
}

export interface CreateScheduleParams {
  product_id: string;
  start_time: string;
  end_time: string;
  location?: string;
  location_point?: LocationPoint;
}

export interface BulkCreateScheduleParams {
  product_id: string;
  schedules: Array<{ start_time: string; end_time: string; location?: string; location_point?: LocationPoint }>;
  location?: string;
}

export interface UpdateScheduleParams {
  start_time?: string;
  end_time?: string;
  location?: string;
  location_id?: string;
  location_point?: LocationPoint;
}

export interface ConfirmScheduleParams {
  schedule_id?: string;
  start_time: string;
  end_time: string;
  location?: string;
  location_point?: LocationPoint;
}

export const storeSchedulesApi = {
  getList: async (params?: { partner_id?: string; product_id?: string; start_date?: string; end_date?: string; available_only?: boolean }) => {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    const response = await edgeApi.makeRequest('api-store-schedules', query);
    return response;
  },

  getDetail: async (scheduleId: string) => {
    const response = await edgeApi.makeRequest('api-store-schedules', `/${scheduleId}`);
    return response;
  },

  create: async (data: CreateScheduleParams) => {
    const response = await edgeApi.makeRequest('api-store-schedules', '', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response;
  },

  bulkCreate: async (data: BulkCreateScheduleParams) => {
    const response = await edgeApi.makeRequest('api-store-schedules', '/bulk', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response;
  },

  update: async (scheduleId: string, data: UpdateScheduleParams) => {
    const response = await edgeApi.makeRequest('api-store-schedules', `/${scheduleId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return response;
  },

  delete: async (scheduleId: string) => {
    const response = await edgeApi.makeRequest('api-store-schedules', `/${scheduleId}`, {
      method: 'DELETE',
    });
    return response;
  },

  getMySchedules: async (params?: { page?: number; limit?: number }) => {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    const response = await edgeApi.makeRequest('api-store-schedules', `/partner/my${query}`);
    return response;
  },

  pickup: async (scheduleId: string, orderId: string) => {
    const response = await edgeApi.makeRequest('api-store-schedules', `/${scheduleId}/pickup`, {
      method: 'PUT',
      body: JSON.stringify({ order_id: orderId, is_picked_up: true }),
    });
    return response;
  },

  updateOrderStatus: async (orderId: string, data: { status: 'completed' | 'no_show' | 'canceled'; reason?: string }) => {
    const response = await edgeApi.makeRequest('api-store-schedules', `/order/${orderId}/status`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return response;
  },

  getReserved: async (params: { product_id: string; date: string }) => {
    const query = `?${new URLSearchParams(params).toString()}`;
    const response = await edgeApi.makeRequest('api-store-schedules', `/reserved${query}`);
    return response;
  },

  confirmOrder: async (orderId: string, data: ConfirmScheduleParams) => {
    const response = await edgeApi.makeRequest('api-store-schedules', `/order/${orderId}/confirm`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return response;
  },

  getByChatRoom: async (chatRoomId: string) => {
    const response = await edgeApi.makeRequest('api-store-schedules', `/chat/${chatRoomId}`);
    return response;
  },
};

