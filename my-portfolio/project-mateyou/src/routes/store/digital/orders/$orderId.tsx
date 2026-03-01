import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect, useRef } from 'react';
import { Loader2, CheckCircle, ArrowLeft } from 'lucide-react';
import JSZip from 'jszip';
import { useAuth } from '@/hooks/useAuth';
import { storeOrdersApi } from '@/api/store/orders';
import { storeDigitalApi } from '@/api/store/digital';
import type { StoreOrder } from '@/api/store/orders';
import { Button, Typography } from '@/components';

export const Route = createFileRoute('/store/digital/orders/$orderId')({
  component: DigitalDownloadPage,
});

interface DownloadItem {
  download_id: string;
  download_count: number;
  last_downloaded_at: string | null;
  expires_at: string | null;
  asset: {
    asset_id: string;
    file_name: string;
    file_url: string;
    display_order: number;
  };
}

function DigitalDownloadPage() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const { user, isLoading: userLoading } = useAuth();
  const [order, setOrder] = useState<StoreOrder | null>(null);
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // 다운로드 상태
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'downloading' | 'done'>('idle');
  const [downloadProgress, setDownloadProgress] = useState(0);
  const downloadStartedRef = useRef(false);

  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      navigate({ to: '/login' });
      return;
    }
  }, [user?.id, userLoading, navigate]);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // 1. GET api-store-orders/$orderId 호출로 상세 정보 가져오기
        const orderResponse = await storeOrdersApi.getDetail(orderId);
        if (!orderResponse.success || !orderResponse.data) {
          throw new Error(orderResponse.error?.message || '주문을 불러오는데 실패했습니다.');
        }

        const orderData = orderResponse.data as StoreOrder;
        setOrder(orderData);

        // 2. order_items에서 디지털 상품인 아이템 찾기
        const digitalOrderItem = orderData.order_items?.find(item => {
          const itemProductType = item.product?.product_type || (item as any)?.product_type;
          return itemProductType === 'digital';
        });

        if (!digitalOrderItem) {
          throw new Error('디지털 상품을 찾을 수 없습니다.');
        }

        const itemStatus = (digitalOrderItem as any)?.status || orderData.status;

        if (!['paid', 'confirmed'].includes(itemStatus)) {
          throw new Error('결제가 완료된 주문만 다운로드할 수 있습니다.');
        }

        // 3. 디지털 상품의 order_item_id로 GET api-store-digital/downloads?order_item_id= 호출
        const orderItemId = digitalOrderItem.order_item_id;
        if (!orderItemId) {
          throw new Error('주문 아이템 정보를 찾을 수 없습니다.');
        }
        const downloadsResponse = await storeDigitalApi.getDownloads({ order_item_id: orderItemId });
        if (!downloadsResponse.success || !downloadsResponse.data) {
          throw new Error(downloadsResponse.error?.message || '파일을 불러오는데 실패했습니다.');
        }

        const downloadsData = downloadsResponse.data as any;
        const downloadsList = downloadsData.downloads || [];
        
        const sortedDownloads = downloadsList.sort((a: DownloadItem, b: DownloadItem) => 
          (a.asset?.display_order || 0) - (b.asset?.display_order || 0)
        );
        
        setDownloads(sortedDownloads);
      } catch (err: any) {
        setError(err.message || '데이터를 불러오는데 실패했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    if (orderId) {
      fetchData();
    }
  }, [orderId]);

  // 데이터 로드 완료 후 자동 다운로드 시작
  useEffect(() => {
    if (!isLoading && downloads.length > 0 && !downloadStartedRef.current && downloadStatus === 'idle') {
      downloadStartedRef.current = true;
      startZipDownload();
    }
  }, [isLoading, downloads, downloadStatus]);

  const startZipDownload = async () => {
    if (downloads.length === 0) return;
    
    setDownloadStatus('downloading');
    setDownloadProgress(0);

    try {
      const zip = new JSZip();
      const total = downloads.length;
      
      for (let i = 0; i < downloads.length; i++) {
        const item = downloads[i];
        setDownloadProgress(Math.round(((i) / total) * 100));
        
        try {
          const response = await fetch(item.asset.file_url);
          if (!response.ok) throw new Error(`Failed to fetch ${item.asset.file_name}`);
          
          const blob = await response.blob();
          const fileName = item.asset.file_name || `file_${i + 1}`;
          zip.file(fileName, blob);
        } catch (err) {
          console.error(`파일 다운로드 실패: ${item.asset.file_name}`, err);
        }
      }
      
      setDownloadProgress(95);
      
      // ZIP 생성
      const zipBlob = await zip.generateAsync({ 
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });
      
      // 다운로드
      const productName = order?.product?.name || '디지털상품';
      const safeName = productName.replace(/[^a-zA-Z0-9가-힣]/g, '_');
      const url = window.URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeName}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      setDownloadProgress(100);
      setDownloadStatus('done');
    } catch (err: any) {
      console.error('ZIP 다운로드 실패:', err);
      setError('다운로드에 실패했습니다. 다시 시도해주세요.');
      setDownloadStatus('idle');
      downloadStartedRef.current = false;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-[#FE3A8F] mx-auto mb-4" />
          <Typography variant="body1" className="text-gray-600">
            파일 정보를 불러오는 중...
          </Typography>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <Typography variant="h6" className="text-gray-900 mb-4">
            {error || '주문을 찾을 수 없습니다'}
          </Typography>
          <Button onClick={() => navigate({ to: `/store/orders/${orderId}` })}>
            돌아가기
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col pt-16 pb-20">
      {/* 헤더 */}
      <div className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate({ to: `/store/orders/${orderId}` })}
              className="p-2"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Typography variant="h6">다운로드</Typography>
          </div>
        </div>
      </div>

      {/* 메인 콘텐츠 */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {downloadStatus === 'downloading' && (
            <div className="bg-white text-center">
              <div className="relative w-24 h-24 mx-auto mb-6">
                <svg className="w-24 h-24 transform -rotate-90">
                  <circle
                    cx="48"
                    cy="48"
                    r="44"
                    stroke="#f3f4f6"
                    strokeWidth="8"
                    fill="none"
                  />
                  <circle
                    cx="48"
                    cy="48"
                    r="44"
                    stroke="#FE3A8F"
                    strokeWidth="8"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 44}`}
                    strokeDashoffset={`${2 * Math.PI * 44 * (1 - downloadProgress / 100)}`}
                    className="transition-all duration-300"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Typography variant="h5" className="font-bold text-[#FE3A8F]">
                    {downloadProgress}%
                  </Typography>
                </div>
              </div>
              
              <Typography variant="h5" className="font-bold mb-2">
                다운로드 중...
              </Typography>
              <Typography variant="body2" className="text-gray-500">
                {order.product?.name}
              </Typography>
              <Typography variant="caption" className="text-gray-400 mt-2 block">
                총 {downloads.length}개 파일
              </Typography>
            </div>
          )}

          {downloadStatus === 'done' && (
            <div className="bg-white text-center">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="h-10 w-10 text-green-500" />
              </div>
              
              <Typography variant="h5" className="font-bold mb-2">
                저장 완료!
              </Typography>
              <Typography variant="body1" className="text-gray-600 mb-1">
                구매하신 파일이 저장되었습니다
              </Typography>
              <Typography variant="body2" className="text-gray-500 mb-6">
                {order.product?.name}
              </Typography>
              
              <div className="space-y-3">
                <Button
                  onClick={() => navigate({ to: `/store/orders/${orderId}` })}
                  className="w-full rounded-full bg-[#FE3A8F] text-white"
                >
                  확인
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    downloadStartedRef.current = false;
                    setDownloadStatus('idle');
                    startZipDownload();
                  }}
                  className="w-full rounded-full"
                >
                  다시 다운로드
                </Button>
              </div>
            </div>
          )}

          {downloadStatus === 'idle' && downloads.length === 0 && (
            <div className="bg-white rounded-3xl p-8 shadow-lg text-center">
              <Typography variant="h6" className="text-gray-600 mb-4">
                다운로드 가능한 파일이 없습니다
              </Typography>
              <Button
                onClick={() => navigate({ to: `/store/orders/${orderId}` })}
                className="rounded-full"
              >
                돌아가기
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
