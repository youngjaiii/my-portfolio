import { edgeApi } from '@/lib/edgeApi';

export interface CartItemOption {
  option_id: string;
  name: string;
  option_type: 'select' | 'text';
  is_required: boolean;
  display_order: number;
  values?: Array<{
    value_id: string;
    value: string;
    price_adjustment: number;
    stock?: number;
    display_order: number;
  }>;
}

export interface CartItem {
  id: string;
  product_id: string;
  quantity: number;
  selected_options?: Array<{
    option_id: string;
    option_name: string;
    option_type: string;
    value_id?: string;
    value?: string;
    text_value?: string;
    price_adjustment: number;
  }>;
  product?: {
    product_id: string;
    name: string;
    price: number;
    thumbnail_url?: string;
    product_type: 'digital' | 'on_site' | 'delivery';
    partner_id?: string;
    partner_name?: string;
    partner_avatar?: string;
    is_bundle_available?: boolean;
    shipping_fee_base?: number;
    shipping_fee_remote?: number;
    options?: CartItemOption[];
    partner?: {
      id: string;
      name?: string;
      member_code?: string;
      profile_image?: string;
    };
  };
  created_at: string;
  updated_at: string;
}

export interface ShippingAddress {
  id: string;
  name: string;
  phone: string;
  address: string;
  address_detail?: string;
  postal_code: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface AddToCartParams {
  product_id: string;
  quantity: number;
  selected_options?: Array<{ option_id: string; value_id?: string; text_value?: string }>;
}

export interface UpdateCartItemParams {
  quantity: number;
}

export interface CheckoutParams {
  recipient_name?: string;
  recipient_phone?: string;
  recipient_address?: string;
  recipient_address_detail?: string;
  recipient_postal_code?: string;
  delivery_memo?: string;
  shipping_address_id?: string;
}

export interface CreateShippingAddressParams {
  name: string;
  phone: string;
  address: string;
  address_detail?: string;
  postal_code: string;
  is_default?: boolean;
}

export interface UpdateShippingAddressParams {
  name?: string;
  phone?: string;
  address?: string;
  address_detail?: string;
  postal_code?: string;
  is_default?: boolean;
}

export const storeCartApi = {
  // 장바구니 조회
  getList: async () => {
    const response = await edgeApi.makeRequest('api-store-cart', '');
    return response;
  },

  // 장바구니 담기
  addItem: async (data: AddToCartParams) => {
    const response = await edgeApi.makeRequest('api-store-cart', '', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response;
  },

  // 장바구니 수량 변경
  updateItem: async (itemId: string, data: UpdateCartItemParams) => {
    const response = await edgeApi.makeRequest('api-store-cart', `/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return response;
  },

  // 장바구니 상품 삭제
  removeItem: async (itemId: string) => {
    const response = await edgeApi.makeRequest('api-store-cart', `/${itemId}`, {
      method: 'DELETE',
    });
    return response;
  },

  // 장바구니 전체 비우기
  clearCart: async () => {
    const response = await edgeApi.makeRequest('api-store-cart', '', {
      method: 'DELETE',
    });
    return response;
  },

  // 장바구니 주문
  checkout: async (data: CheckoutParams) => {
    const response = await edgeApi.makeRequest('api-store-cart', '/checkout', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response;
  },

  // 배송지 조회
  getShippingAddresses: async () => {
    const response = await edgeApi.makeRequest('api-store-cart', '/shipping-addresses');
    return response;
  },

  // 배송지 추가
  createShippingAddress: async (data: CreateShippingAddressParams) => {
    const response = await edgeApi.makeRequest('api-store-cart', '/shipping-addresses', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return response;
  },

  // 배송지 수정
  updateShippingAddress: async (addressId: string, data: UpdateShippingAddressParams) => {
    const response = await edgeApi.makeRequest('api-store-cart', `/shipping-addresses/${addressId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return response;
  },

  // 배송지 삭제
  deleteShippingAddress: async (addressId: string) => {
    const response = await edgeApi.makeRequest('api-store-cart', `/shipping-addresses/${addressId}`, {
      method: 'DELETE',
    });
    return response;
  },
};

