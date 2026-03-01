import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StoreProduct } from '@/api/store';

export interface CartItem {
  product_id: string;
  product: StoreProduct;
  quantity: number;
}

interface CartState {
  items: CartItem[];
  partnerId: string | null; // 현재 장바구니의 파트너 ID (파트너 단위 제한)
  addItem: (product: StoreProduct, quantity: number) => boolean;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  getTotalPrice: () => number;
  getTotalItems: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      partnerId: null,

      addItem: (product: StoreProduct, quantity: number) => {
        const state = get();
        
        // 파트너 단위 제한: 다른 파트너 상품이 이미 있으면 추가 불가
        if (state.partnerId && state.partnerId !== product.partner_id) {
          return false; // 다른 파트너 상품이 있어서 추가 실패
        }

        // 기존 아이템이 있으면 수량 증가
        const existingItem = state.items.find(item => item.product_id === product.product_id);
        
        if (existingItem) {
          set({
            items: state.items.map(item =>
              item.product_id === product.product_id
                ? { ...item, quantity: item.quantity + quantity }
                : item
            ),
          });
        } else {
          // 새 아이템 추가
          set({
            items: [...state.items, { product_id: product.product_id, product, quantity }],
            partnerId: product.partner_id || null,
          });
        }

        return true; // 추가 성공
      },

      removeItem: (productId: string) => {
        const state = get();
        const newItems = state.items.filter(item => item.product_id !== productId);
        
        set({
          items: newItems,
          partnerId: newItems.length === 0 ? null : state.partnerId,
        });
      },

      updateQuantity: (productId: string, quantity: number) => {
        if (quantity <= 0) {
          get().removeItem(productId);
          return;
        }

        const state = get();
        set({
          items: state.items.map(item =>
            item.product_id === productId
              ? { ...item, quantity }
              : item
          ),
        });
      },

      clearCart: () => {
        set({
          items: [],
          partnerId: null,
        });
      },

      getTotalPrice: () => {
        const state = get();
        return state.items.reduce((total, item) => {
          return total + (item.product.price * item.quantity);
        }, 0);
      },

      getTotalItems: () => {
        const state = get();
        return state.items.reduce((total, item) => total + item.quantity, 0);
      },
    }),
    {
      name: 'store-cart-storage',
    }
  )
);


