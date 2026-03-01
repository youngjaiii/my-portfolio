import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { ArrowLeft, Loader2, FileText, Image as ImageIcon } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { storeProductsApi } from '@/api/store/products';
import { Button, Typography } from '@/components';
import type { StoreProduct } from '@/api/store';

export const Route = createFileRoute('/store/partner/products/$productId/preview')({
  component: ProductPreviewPage,
});

function ProductPreviewPage() {
  const { productId } = Route.useParams();
  const navigate = useNavigate();
  const { user, isLoading: userLoading } = useAuth();
  const [product, setProduct] = useState<StoreProduct & {
    digital_assets?: Array<{ asset_id: string; file_url: string; file_name: string; display_order: number }>;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDigitalAsset, setSelectedDigitalAsset] = useState<number | null>(null);

  useEffect(() => {
    if (userLoading) return;
    if (!user || user.role !== 'partner') {
      navigate({ to: '/mypage' });
      return;
    }

    const fetchProduct = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await storeProductsApi.getDetail(productId);
        if (response.success && response.data) {
          setProduct(response.data as StoreProduct & {
            digital_assets?: Array<{ asset_id: string; file_url: string; file_name: string; display_order: number }>;
          });
        } else {
          setError(response.error?.message || '상품을 불러오는데 실패했습니다.');
        }
      } catch (err: any) {
        setError(err.message || '상품을 불러오는데 실패했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    if (productId) {
      fetchProduct();
    }
  }, [productId, user?.id, user?.role, userLoading, navigate]);

  const getProductTypeInfo = (type: string) => {
    switch (type) {
      case 'digital':
        return {
          label: '디지털',
          description: '결제 후 열람 및 다운로드가 오픈되는 디지털 상품입니다.',
          icon: '📥',
        };
      case 'on_site':
        return {
          label: '현장수령',
          description: '결제 후 채팅을 통해 일정 확정이 가능합니다.',
          icon: '📍',
        };
      case 'delivery':
        return {
          label: '택배',
          description: product?.source === 'collaboration' 
            ? '업체 확인 후 배송'
            : '파트너 직접 배송',
          icon: '🚚',
        };
      default:
        return { label: type, description: '', icon: '🛍️' };
    }
  };

  if (userLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#FE3A8F]" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <Typography variant="h5" className="text-gray-600 mb-2">
            {error || '상품을 찾을 수 없습니다.'}
          </Typography>
          <Button
            onClick={() => navigate({ to: '/store/partner/products' })}
            variant="outline"
            className="mt-4"
          >
            돌아가기
          </Button>
        </div>
      </div>
    );
  }

  const typeInfo = getProductTypeInfo(product.product_type);
  const isOutOfStock = product.stock !== null && product.stock !== undefined && product.stock <= 0;

  return (
    <div className="min-h-screen pt-16 pb-20">

      {/* 썸네일 이미지 */}
      <div className="bg-white">
        {product.thumbnail_url ? (
          <div className="aspect-square w-full">
            <img
              src={product.thumbnail_url}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          </div>
        ) : (
          <div className="aspect-square w-full flex items-center justify-center bg-gray-100">
            <span className="text-6xl">🛍️</span>
          </div>
        )}
      </div>

      {/* 상품 정보 */}
      <div className={`bg-white px-4 pt-6 pb-18 space-y-4 ${product.product_type !== 'digital' ? 'pb-32' : ''}`}>
        <div>
          <Typography variant="h4" className="font-bold text-[#110f1a] mb-2">
            {product.name}
          </Typography>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
              {typeInfo.label}
            </span>
            {isOutOfStock && (
              <span className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded">
                품절
              </span>
            )}
            {!product.is_active && (
              <span className="text-xs bg-gray-500 text-white px-2 py-1 rounded">
                비활성
              </span>
            )}
          </div>
        </div>

        <div>
          <Typography variant="h3" className="font-bold text-[#FE3A8F]">
            {product.price.toLocaleString()}P
          </Typography>
        </div>

        {product.description && (
          <div>
            <Typography variant="body1" className="text-gray-700 whitespace-pre-wrap">
              {product.description}
            </Typography>
          </div>
        )}

        {/* 상세 이미지 */}
        {product.images && product.images.length > 0 && (
          <div className="pt-4 border-t border-gray-200">
            <div>
              {product.images.map((img) => (
                <div key={img.image_id} className="w-full">
                  <img
                    src={img.image_url}
                    alt={`${product.name} 상세 이미지 ${img.display_order}`}
                    className="w-full h-auto"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 배송비 정보 (택배 상품만) */}
        {product.product_type === 'delivery' && (
          <div className="pt-4 border-t border-gray-200">
            <Typography variant="body2" className="font-medium mb-3">배송비 정보</Typography>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between">
                <Typography variant="body2" className="text-gray-500">기본 배송비</Typography>
                <Typography variant="body2" className="font-medium">
                  {(product as any).shipping_fee_base ? `${(product as any).shipping_fee_base.toLocaleString()}P` : '무료'}
                </Typography>
              </div>
              <div className="flex justify-between">
                <Typography variant="body2" className="text-gray-500">도서산간 추가</Typography>
                <Typography variant="body2" className="font-medium">
                  {(product as any).shipping_fee_remote ? `+${(product as any).shipping_fee_remote.toLocaleString()}P` : '없음'}
                </Typography>
              </div>
            </div>
          </div>
        )}

        {/* 상품 타입별 안내 */}
        <div className="pt-4 border-t border-gray-200">
          <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg">
            <span className="text-2xl">{typeInfo.icon}</span>
            <div>
              <Typography variant="body2" className="font-medium text-blue-900 mb-1">
                {typeInfo.label} 상품 안내
              </Typography>
              <Typography variant="caption" className="text-blue-700">
                {typeInfo.description}
              </Typography>
            </div>
          </div>
        </div>
      </div>

      {/* 디지털 상품 미리보기 섹션 */}
      {product.product_type === 'digital' && (
        <div className="bg-white mt-4 px-4 py-6 pb-32">
          <Typography variant="h6" className="font-semibold mb-4">
            디지털 콘텐츠 미리보기
          </Typography>
          {product.digital_assets && product.digital_assets.length > 0 ? (
            <div className="space-y-4">
              {product.digital_assets.map((asset, index) => {
                // PDF는 이미지로 변환되어 저장되므로, 파일 확장자로만 판단
                const isPDF = asset.file_name.toLowerCase().endsWith('.pdf');
                const isSelected = selectedDigitalAsset === index;

                return (
                  <div key={asset.asset_id} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div
                      className="flex items-center justify-between p-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
                      onClick={() => setSelectedDigitalAsset(isSelected ? null : index)}
                    >
                      <div className="flex items-center gap-2">
                        {isPDF ? (
                          <FileText className="h-5 w-5 text-red-500" />
                        ) : (
                          <ImageIcon className="h-5 w-5 text-blue-500" />
                        )}
                        <Typography variant="body2" className="font-medium">
                          {asset.file_name}
                        </Typography>
                      </div>
                      <button className="text-sm text-[#FE3A8F] font-medium">
                        {isSelected ? '접기' : '미리보기'}
                      </button>
                    </div>
                    {isSelected && (
                      <div className="p-4 bg-white border-t border-gray-200">
                        {/* PDF는 이미지로 변환되어 저장되므로, 이미지로 표시 */}
                        {/* 파일 확장자가 .pdf인 경우에도 이미지로 표시 (변환된 이미지) */}
                        <div className="w-full">
                          <img
                            src={asset.file_url}
                            alt={asset.file_name}
                            className="w-full h-auto rounded-lg shadow-sm"
                            onError={(e) => {
                              // 이미지 로드 실패 시 iframe으로 시도 (레거시 PDF 파일인 경우)
                              const target = e.target as HTMLImageElement;
                              const parent = target.parentElement;
                              if (parent && isPDF) {
                                parent.innerHTML = `
                                  <div class="w-full" style="height: 80vh; min-height: 600px;">
                                    <iframe
                                      src="${asset.file_url}"
                                      class="w-full h-full border border-gray-200 rounded-lg"
                                      title="${asset.file_name}"
                                    />
                                  </div>
                                `;
                              }
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <FileText className="h-12 w-12 mx-auto mb-2 text-gray-400" />
              <Typography variant="body2">
                등록된 디지털 콘텐츠가 없습니다.
              </Typography>
            </div>
          )}
        </div>
      )}

      {/* 하단 액션 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 safe-area-bottom">
        <div className="max-w-2xl mx-auto flex gap-3">
          <Button
            onClick={() => navigate({ to: '/store/partner/products/$productId/edit', params: { productId: product.product_id } })}
            variant="outline"
            className="flex-1"
          >
            수정하기
          </Button>
          <Button
            onClick={() => navigate({ to: '/store/products/$productId', params: { productId: product.product_id } })}
            className="flex-1 bg-[#FE3A8F] text-white"
          >
            실제 상품 보기
          </Button>
        </div>
      </div>
    </div>
  );
}
