import { edgeApi } from '@/lib/edgeApi';

// 상품 생성 시 스케줄 파라미터 타입
export interface CreateProductSchedule {
  start_time: string;
  end_time: string;
  location?: string;
  location_point?: { lat: number; lng: number };
}

// 상품 옵션 값 (select 타입용)
export interface ProductOptionValue {
  value_id: string;
  value: string;
  price_adjustment: number;
  stock?: number | null;
  display_order: number;
}

// 상품 옵션 그룹
export interface ProductOption {
  option_id: string;
  name: string;
  option_type: 'select' | 'text';
  is_required: boolean;
  display_order: number;
  values?: ProductOptionValue[];
}

// 상품 등록/수정 시 옵션 입력 타입
export interface ProductOptionInput {
  name: string;
  option_type: 'select' | 'text';
  is_required: boolean;
  values?: Array<{
    value: string;
    price_adjustment?: number;
    stock?: number;
  }>;
}

// 주문/장바구니용 선택된 옵션
export interface SelectedOption {
  option_id: string;
  option_name?: string;
  option_type?: string;
  value_id?: string;
  value?: string;
  text_value?: string;
  price_adjustment: number;
}

export interface StoreProduct {
  product_id: string;
  partner_id: string;
  name: string;
  description?: string;
  price: number;
  product_type: 'digital' | 'on_site' | 'delivery';
  source: 'partner' | 'collaboration';
  stock?: number;
  thumbnail_url?: string;
  is_active: boolean;
  distribution_rate?: number; // 협업 상품 배분율 (0-100)
  parent_product_id?: string; // 협업 상품 원본 ID
  created_at: string;
  updated_at: string;
  partner?: {
    id: string;
    partner_name: string;
    member?: {
      id: string;
      name: string;
      profile_image?: string;
    };
  };
  images?: Array<{ image_id: string; image_url: string; display_order: number }>;
  digital_assets?: Array<{ asset_id: string; file_url: string; file_name: string; display_order: number }>;
  shipping_fee_base?: number;
  shipping_fee_remote?: number;
  schedules?: Array<{
    schedule_id: string;
    start_time?: string;
    end_time?: string;
    location?: string;
    location_point?: { lat: number; lng: number };
    max_bookings?: number;
    current_bookings?: number;
    is_available?: boolean;
  }>;
  options?: ProductOption[];
}

export interface StoreProductListParams {
  partner_id?: string;
  product_type?: 'digital' | 'on_site' | 'delivery';
  source?: 'partner' | 'collaboration';
  is_active?: boolean;
  page?: number;
  limit?: number;
}

export const storeProductsApi = {
  getList: async (params?: StoreProductListParams) => {
    const response = await edgeApi.storeProducts.getList(params);
    return response;
  },

  getDetail: async (productId: string) => {
    const response = await edgeApi.storeProducts.getDetail(productId);
    return response;
  },

  getMyProducts: async (params?: { include_inactive?: boolean; page?: number; limit?: number; source?: string }) => {
    const response = await edgeApi.storeProducts.getMyProducts(params);
    return response;
  },
};
