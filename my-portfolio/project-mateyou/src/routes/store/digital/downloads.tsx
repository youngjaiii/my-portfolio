import { createFileRoute, useNavigate, Link } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { Download, Loader2, FileText, Package, ArrowRight } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { storeDigitalApi } from '@/api/store/digital';
import { Typography, Button, AvatarWithFallback } from '@/components';

export const Route = createFileRoute('/store/digital/downloads')({
  component: DigitalDownloadsPage,
});

interface PurchasedOrder {
  order_id: string;
  order_number: string;
  status: string;
  created_at: string;
  product: {
    product_id: string;
    name: string;
    thumbnail_url?: string;
    partner: {
      id: string;
      partner_name: string;
      member: {
        id: string;
        name: string;
        profile_image?: string;
      };
    };
  };
  downloads: Array<{
    download_id: string;
    download_count: number;
    last_downloaded_at?: string;
    asset: {
      asset_id: string;
      file_name: string;
      display_order: number;
    };
  }>;
  total_files: number;
  last_downloaded_at?: string;
}

function DigitalDownloadsPage() {
  const navigate = useNavigate();
  const { user, isLoading: userLoading } = useAuth();
  const [orders, setOrders] = useState<PurchasedOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      navigate({ to: '/login' });
      return;
    }

    const fetchPurchased = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await storeDigitalApi.getPurchased();
        if (response.success && response.data) {
          setOrders(Array.isArray(response.data) ? response.data : []);
        } else {
          setError(response.error?.message || '구매한 디지털 상품을 불러오는데 실패했습니다.');
        }
      } catch (err: any) {
        setError(err.message || '구매한 디지털 상품을 불러오는데 실패했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPurchased();
  }, [user?.id, userLoading, navigate]);

  if (userLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#FE3A8F]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-16 pb-20">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3 px-4 py-3">
          <Typography variant="h6" className="flex-1 font-bold">
            내 디지털 상품
          </Typography>
        </div>
      </div>

      {/* 콘텐츠 */}
      {error ? (
        <div className="flex items-center justify-center py-12">
          <Typography variant="body1" className="text-gray-500">
            {error}
          </Typography>
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <Package className="h-16 w-16 text-gray-300 mb-4" />
          <Typography variant="body1" className="text-gray-500 mb-2">
            구매한 디지털 상품이 없습니다
          </Typography>
          <Link
            to="/partners"
            className="text-[#FE3A8F] font-medium"
          >
            상품 둘러보기
          </Link>
        </div>
      ) : (
        <div className="p-4 space-y-4">
          {orders.map((order) => (
            <div
              key={order.order_id}
              className="bg-white rounded-lg p-4 shadow-sm"
            >
              <div className="flex gap-4 mb-4">
                {order.product.thumbnail_url ? (
                  <img
                    src={order.product.thumbnail_url}
                    alt={order.product.name}
                    className="w-20 h-20 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-gray-100 flex items-center justify-center">
                    <span className="text-2xl">📥</span>
                  </div>
                )}
                <div className="flex-1">
                  <Typography variant="body1" className="font-medium mb-1">
                    {order.product.name}
                  </Typography>
                  <div className="flex items-center gap-2 mb-2">
                    <AvatarWithFallback
                      src={order.product.partner.member?.profile_image}
                      name={order.product.partner.partner_name || order.product.partner.member?.name}
                      size="xs"
                    />
                    <Typography variant="caption" className="text-gray-500">
                      {order.product.partner.partner_name || order.product.partner.member?.name}
                    </Typography>
                  </div>
                  <Typography variant="caption" className="text-gray-500">
                    {new Date(order.created_at).toLocaleDateString('ko-KR')} 구매
                  </Typography>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <Typography variant="body2" className="font-medium">
                    다운로드 파일 ({order.total_files}개)
                  </Typography>
                  <Button
                    onClick={() => {
                      navigate({
                        to: '/store/digital/orders/$orderId',
                        params: { orderId: order.order_id },
                      });
                    }}
                    variant="outline"
                    size="sm"
                  >
                    상세보기
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
                <div className="space-y-2">
                  {order.downloads.slice(0, 3).map((download) => (
                    <div
                      key={download.download_id}
                      className="flex items-center gap-2 text-sm text-gray-600"
                    >
                      <FileText className="h-4 w-4" />
                      <span className="flex-1">{download.asset.file_name}</span>
                      {download.download_count > 0 && (
                        <span className="text-xs text-gray-400">
                          {download.download_count}회 다운로드
                        </span>
                      )}
                    </div>
                  ))}
                  {order.downloads.length > 3 && (
                    <Typography variant="caption" className="text-gray-400">
                      외 {order.downloads.length - 3}개 파일
                    </Typography>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
