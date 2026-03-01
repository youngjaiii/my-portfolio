import { edgeApi } from '@/lib/edgeApi';

export interface ConfirmPaymentParams {
  order_id: string;
  payment_key: string;
  amount: number;
}

export const storePaymentsApi = {
  confirm: async (data: ConfirmPaymentParams) => {
    const response = await edgeApi.makeRequest('api-store-payments', '/confirm', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response;
  },
};




