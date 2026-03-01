import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { Loader2, Heart, ShoppingCart, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { edgeApi } from '@/lib/edgeApi';
import { Typography, Button } from '@/components';

export const Route = createFileRoute('/store/wishlist')({
  component: WishlistPage,
});

interface WishlistItem {
  id: string;
  product_id: string;
  member_id: string;
  created_at: string;
  product: {
    product_id: string;
    name: string;
    description?: string;
    price: number;
    product_type: 'digital' | 'on_site' | 'delivery';
    source: 'partner' | 'collaboration';
    thumbnail_url?: string;
    stock?: number;
    is_active: boolean;
    partner?: {
      id: string;
      partner_name: string;
      member?: {
        id: string;
        name: string;
        profile_image?: string;
      };
    };
  };
}

function WishlistPage() {
  const navigate = useNavigate();
  const { user, isLoading: userLoading } = useAuth();
  const [wishlists, setWishlists] = useState<WishlistItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [removingIds, setRemovingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      navigate({ to: '/login' });
      return;
    }

    let mounted = true;

    const fetchWishlist = async () => {
      setIsLoading(true);
      try {
        const response = await edgeApi.storeProducts.getWishlist({ page, limit: 20 });
        if (!mounted) return;
        if (response.success && response.data) {
          setWishlists(Array.isArray(response.data) ? response.data : []);
          if (response.meta) {
            setTotalPages(response.meta.totalPages || 1);
          }
        }
      } catch (err: any) {
        if (!mounted) return;
        toast.error(err.message || '찜 목록을 불러오는데 실패했습니다.');
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    fetchWishlist();

    return () => {
      mounted = false;
    };
  }, [user?.id, userLoading, page]);

  const handleRemoveWishlist = async (productId: string) => {
    if (removingIds.has(productId)) return;

    setRemovingIds((prev) => new Set(prev).add(productId));
    try {
      const response = await edgeApi.storeProducts.removeWishlist(productId);
      if (response.success) {
        setWishlists((prev) => prev.filter((w) => w.product_id !== productId));
        toast.success('찜 목록에서 삭제되었습니다');
      } else {
        throw new Error(response.error?.message);
      }
    } catch (err: any) {
      toast.error(err.message || '삭제에 실패했습니다');
    } finally {
      setRemovingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(productId);
        return newSet;
      });
    }
  };

  const getProductTypeLabel = (type: string) => {
    switch (type) {
      case 'digital': return '디지털';
      case 'on_site': return '현장';
      case 'delivery': return '배송';
      default: return type;
    }
  };

  if (userLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#FE3A8F]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => navigate({ to: '/' })}
            className="p-1 -ml-1"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Typography variant="h6" className="flex-1 font-bold">
            찜 목록
          </Typography>
          <span className="text-sm text-gray-500">{wishlists.length}개</span>
        </div>
      </div>

      <div className="p-4">
        {wishlists.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-500">
            <Heart className="h-12 w-12 mb-4 text-gray-300" />
            <p className="text-center">찜한 상품이 없습니다</p>
            <Link
              to="/"
              className="mt-4 text-[#FE3A8F] text-sm font-medium hover:underline"
            >
              상품 둘러보기
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {wishlists.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-xl p-4 shadow-sm"
              >
                <div className="flex gap-3">
                  <Link
                    to="/store/products/$productId"
                    params={{ productId: item.product.product_id }}
                    className="shrink-0"
                  >
                    <div className="w-20 h-20 rounded-lg bg-gray-100 overflow-hidden">
                      {item.product.thumbnail_url ? (
                        <img
                          src={item.product.thumbnail_url}
                          alt={item.product.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-400">
                          <span className="text-2xl">🛍️</span>
                        </div>
                      )}
                    </div>
                  </Link>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <Link
                          to="/store/products/$productId"
                          params={{ productId: item.product.product_id }}
                          className="block"
                        >
                          <p className="text-sm font-medium text-gray-900 line-clamp-2">
                            {item.product.name}
                          </p>
                        </Link>
                        {item.product.partner && (
                          <p className="text-xs text-gray-500 mt-0.5">
                            {item.product.partner.partner_name}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveWishlist(item.product_id)}
                        disabled={removingIds.has(item.product_id)}
                        className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
                      >
                        <Heart
                          className={`h-5 w-5 fill-[#FE3A8F] text-[#FE3A8F] ${
                            removingIds.has(item.product_id) ? 'opacity-50' : ''
                          }`}
                        />
                      </button>
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-white bg-black/60 px-1.5 py-0.5 rounded">
                        {getProductTypeLabel(item.product.product_type)}
                      </span>
                      {/* 디지털 상품은 stock이 null이어도 품절이 아님 */}
                      {item.product.product_type !== 'digital' && item.product.stock !== undefined && item.product.stock !== null && item.product.stock <= 0 && (
                        <span className="text-xs text-red-500 font-medium">품절</span>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-2">
                      <p className="text-sm font-bold text-gray-900">
                        {item.product.price?.toLocaleString()}P
                      </p>
                      {/* 자기 상품인 경우 구매 버튼 비활성화 */}
                      {item.product.partner?.member?.id === user?.id ? (
                        <span className="text-xs text-gray-400">내 상품</span>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() =>
                            navigate({
                              to: '/store/products/$productId',
                              params: { productId: item.product.product_id },
                            })
                          }
                          className="!h-8 !px-3 !text-xs bg-[#FE3A8F] text-white"
                        >
                          <ShoppingCart className="h-3.5 w-3.5 mr-1" />
                          구매하기
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 rounded-lg text-sm border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  이전
                </button>
                <span className="text-sm text-gray-600">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-3 py-1 rounded-lg text-sm border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  다음
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

