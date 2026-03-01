import { edgeApi } from '@/lib/edgeApi';

export interface DigitalDownload {
  download_id: string;
  user_id: string;
  order_id: string;
  product_id: string;
  asset_id: string;
  download_url?: string;
  expires_at?: string;
  downloaded_at?: string;
  download_count: number;
  created_at: string;
  asset?: {
    asset_id: string;
    file_name: string;
    file_url: string;
  };
}

export const storeDigitalApi = {
  getDownloads: async (params?: { download_id?: string; order_id?: string; order_item_id?: string; page?: number; limit?: number }) => {
    const query = params ? `?${new URLSearchParams(params as any).toString()}` : '';
    const response = await edgeApi.makeRequest('api-store-digital', `/downloads${query}`);
    return response;
  },

  getDownloadUrl: async (downloadId: string) => {
    const query = `?download_id=${downloadId}`;
    const response = await edgeApi.makeRequest('api-store-digital', `/downloads${query}`);
    return response;
  },

  getAssets: async (productId: string) => {
    const response = await edgeApi.makeRequest('api-store-digital', `/assets?product_id=${productId}`);
    return response;
  },

  getPurchased: async () => {
    const response = await edgeApi.makeRequest('api-store-digital', '/purchased');
    return response;
  },

  grantAccess: async (data: { order_id: string; user_id: string }) => {
    const response = await edgeApi.makeRequest('api-store-digital', '/grant-access', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response;
  },
};

