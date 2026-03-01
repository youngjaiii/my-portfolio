import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Heart, Check } from 'lucide-react';
import { toast } from 'sonner';
import type { StoreProduct } from '@/api/store';
import { edgeApi } from '@/lib/edgeApi';
import { useAuthStore } from '@/store/useAuthStore';

interface ProductCardProps {
  product: StoreProduct & { is_wishlisted?: boolean; is_purchased?: boolean };
  onClick?: () => void;
  partnerId?: string;
  onWishlistChange?: (productId: string, isWishlisted: boolean) => void;
  hideWishlistButton?: boolean;
}

export function ProductCard({ product, onClick, partnerId, onWishlistChange, hideWishlistButton = false }: ProductCardProps) {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [isWishlisted, setIsWishlisted] = useState(product.is_wishlisted ?? false);
  const [isWishlistLoading, setIsWishlistLoading] = useState(false);

  const getProductTypeLabel = (type: string) => {
    switch (type) {
      case 'digital': return '디지털';
      case 'on_site': return '현장';
      case 'delivery': return '배송';
      default: return type;
    }
  };

  const getSourceLabel = (source: string) => {
    switch (source) {
      case 'partner': return '개인';
      case 'collaboration': return '협업';
      default: return source;
    }
  };

  const isOutOfStock = product.stock !== null && product.stock <= 0;

  const handleWishlistToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    if (!user) {
      navigate({ to: '/login' });
      return;
    }

    if (isWishlistLoading) return;
    
    setIsWishlistLoading(true);
    const newState = !isWishlisted;
    setIsWishlisted(newState);

    try {
      if (newState) {
        const response = await edgeApi.storeProducts.addWishlist(product.product_id);
        if (!response.success) throw new Error(response.error?.message);
        toast.success('찜 목록에 추가되었습니다');
      } else {
        const response = await edgeApi.storeProducts.removeWishlist(product.product_id);
        if (!response.success) throw new Error(response.error?.message);
        toast.success('찜 목록에서 삭제되었습니다');
      }
      onWishlistChange?.(product.product_id, newState);
    } catch (error: any) {
      setIsWishlisted(!newState);
      toast.error(error.message || '찜 처리에 실패했습니다');
    } finally {
      setIsWishlistLoading(false);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    
    const productId = product.product_id;
    
    if (onClick) {
      onClick();
    } else {
      // 협업 상품이고 partnerId가 있으면 쿼리 파라미터로 전달
      navigate({
        to: '/store/products/$productId',
        params: { productId },
        search: { 
          partnerId: (product.source === 'collaboration' && partnerId) ? partnerId : undefined 
        },
        replace: false,
      });
    }
  };

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        
        // 버튼이나 다른 클릭 가능한 요소를 클릭한 경우는 무시
        const target = e.target as HTMLElement;
        if (target.closest('button') || target.closest('a')) {
          return;
        }
        handleClick(e);
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
      className={`rounded-2xl bg-white p-3 shadow-sm transition-transform hover:scale-[1.02] cursor-pointer ${
        isOutOfStock ? 'opacity-60' : ''
      }`}
    >
      <div className="relative aspect-square rounded-xl bg-gray-100 overflow-hidden mb-2">
        {product.thumbnail_url || product.images?.[0]?.image_url ? (
          <img
            src={product.thumbnail_url || product.images?.[0]?.image_url}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <span className="text-2xl">🛍️</span>
          </div>
        )}
        {isOutOfStock && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <span className="text-white font-semibold text-sm">품절</span>
          </div>
        )}
        {product.is_purchased && (
          <div className="absolute top-2 left-2 flex items-center gap-0.5 bg-green-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
            <Check className="h-3 w-3" />
            구매완료
          </div>
        )}
        <div className="absolute top-2 right-2 flex gap-1">
          <span className="text-xs text-white bg-black/50 px-1.5 py-0.5 rounded">
            {getProductTypeLabel(product.product_type)}
          </span>
          {/* {product.source === 'collaboration' && (
            <span className="text-xs text-white bg-purple-500/80 px-1.5 py-0.5 rounded">
              {getSourceLabel(product.source)}
            </span>
          )} */}
        </div>
        {!hideWishlistButton && (
          <button
            type="button"
            onClick={handleWishlistToggle}
            disabled={isWishlistLoading}
            className="absolute bottom-2 right-2 p-1"
          >
            <Heart 
              className={`h-5 w-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)] transition-colors ${
                isWishlisted 
                  ? 'fill-[#FE3A8F] text-[#FE3A8F]' 
                  : 'text-white'
              } ${isWishlistLoading ? 'opacity-50' : ''}`}
            />
          </button>
        )}
      </div>
      <p className="text-sm font-medium text-[#110f1a] line-clamp-2 mb-1">{product.name}</p>
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-[#110f1a]">{product.price?.toLocaleString()}P</p>
        {/* {product.stock !== null && !isOutOfStock && (
          <span className="text-xs text-gray-500">재고 {product.stock}개</span>
        )} */}
      </div>
    </div>
  );
}

