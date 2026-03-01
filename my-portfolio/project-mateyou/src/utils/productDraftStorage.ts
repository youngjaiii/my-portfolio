/**
 * 상품 등록 중인 임시 데이터를 localStorage에 저장/조회/삭제하는 유틸리티
 */

const STORAGE_KEY = 'store_product_draft';

export interface ScheduleDraft {
  start_time: string;
  end_time: string;
  location?: string;
  location_lat?: number;
  location_lng?: number;
}

export interface OptionValueDraft {
  value: string;
  price_adjustment?: number;
  stock?: number;
}

export interface OptionDraft {
  name: string;
  option_type: 'select' | 'text';
  is_required: boolean;
  values?: OptionValueDraft[];
}

export interface ProductDraft {
  name: string;
  description: string;
  price: string;
  product_type: 'digital' | 'on_site' | 'delivery';
  stock?: string;
  shipping_fee_base?: string;
  shipping_fee_remote?: string;
  is_bundle_available?: boolean;
  schedules?: ScheduleDraft[];
  options?: OptionDraft[];
}

export const productDraftStorage = {
  /**
   * 임시 상품 데이터 저장
   */
  save: (draft: ProductDraft): void => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch (error) {
      console.error('Failed to save product draft:', error);
    }
  },

  /**
   * 임시 상품 데이터 조회
   */
  load: (): ProductDraft | null => {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Failed to load product draft:', error);
      return null;
    }
  },

  /**
   * 임시 상품 데이터 삭제
   */
  clear: (): void => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear product draft:', error);
    }
  },

  /**
   * 임시 상품 데이터 존재 여부 확인
   */
  exists: (): boolean => {
    return productDraftStorage.load() !== null;
  },
};


