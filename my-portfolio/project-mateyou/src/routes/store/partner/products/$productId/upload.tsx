import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { Loader2, X, Image as ImageIcon, FileText, CheckCircle, Plus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button, Typography } from '@/components';
import { toast } from 'sonner';
import { edgeApi } from '@/lib/edgeApi';
import { storeProductsApi } from '@/api/store/products';
import type { StoreProduct } from '@/api/store';

export const Route = createFileRoute('/store/partner/products/$productId/upload')({
  component: ProductUploadEditPage,
});

function ProductUploadEditPage() {
  const { productId } = Route.useParams();
  const navigate = useNavigate();
  const { user, isLoading: userLoading } = useAuth();
  const [product, setProduct] = useState<StoreProduct | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    images: [] as File[],
    digitalAssets: [] as File[],
    digitalAssetType: 'images' as 'images' | 'pdf',
  });

  useEffect(() => {
    if (userLoading) {
      return;
    }

    if (!user) {
      navigate({ to: '/login' });
      return;
    }

    if (user.role !== 'partner') {
      navigate({ to: '/mypage' });
      return;
    }

    const fetchProduct = async () => {
      setIsLoading(true);
      try {
        const response = await storeProductsApi.getDetail(productId);
        if (response.success && response.data) {
          setProduct(response.data as StoreProduct);
        } else {
          toast.error(response.error?.message || '상품을 불러오는데 실패했습니다.');
          navigate({ to: '/store/partner/products' });
        }
      } catch (err: any) {
        toast.error(err.message || '상품을 불러오는데 실패했습니다.');
        navigate({ to: '/store/partner/products' });
      } finally {
        setIsLoading(false);
      }
    };

    if (productId) {
      fetchProduct();
    }
  }, [productId, user?.id, user?.role, userLoading, navigate]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const formDataToSend = new FormData();

      // 상세페이지 이미지 추가 (모든 상품 유형)
      formData.images.forEach((image) => {
        formDataToSend.append('images[]', image);
      });

      // 디지털 자산 추가 (디지털 상품만)
      if (formData.digitalAssets.length > 0) {
        formData.digitalAssets.forEach((asset) => {
          formDataToSend.append('digital_assets[]', asset);
        });
      }

      // 이미지나 디지털 자산이 없으면 바로 완료
      if (formData.images.length === 0 && formData.digitalAssets.length === 0) {
        toast.success('변경사항이 저장되었습니다.');
        navigate({ to: '/store/partner/products' });
        return;
      }

      const response = await edgeApi.storeProducts.update(productId, formDataToSend);

      if (response.success) {
        toast.success('이미지가 업로드되었습니다.');
        navigate({ to: '/store/partner/products' });
      } else {
        toast.error(response.error?.message || '이미지 업로드에 실패했습니다.');
      }
    } catch (err: any) {
      toast.error(err.message || '이미지 업로드에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (userLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#FE3A8F]" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Typography variant="h5" className="text-gray-600">
          상품을 찾을 수 없습니다.
        </Typography>
      </div>
    );
  }

    return (
      <div className="min-h-screen pt-16 pb-20">
        <div className="container mx-auto px-4 py-6">
          <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
          {/* 상세페이지 이미지 업로드 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              상세페이지 이미지
            </label>
            <Typography variant="caption" className="text-gray-500 mb-2 block">
              기존 이미지는 새 이미지로 교체됩니다.
            </Typography>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {formData.images.map((image, index) => (
                <div key={index} className="relative">
                  <img
                    src={URL.createObjectURL(image)}
                    alt={`상세 이미지 ${index + 1}`}
                    className="w-full h-24 object-cover rounded-md"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const newImages = formData.images.filter((_, i) => i !== index);
                      setFormData({ ...formData, images: newImages });
                    }}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <label className="relative flex items-center justify-center h-24 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-200 transition-colors">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    setFormData({ ...formData, images: [...formData.images, ...files] });
                  }}
                  className="hidden"
                />
                <Plus className="h-6 w-6 text-gray-400" />
              </label>
            </div>
          </div>

          {/* 디지털 자산 업로드 (디지털 상품만) */}
          {product.product_type === 'digital' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                디지털 자산
              </label>
              <Typography variant="caption" className="text-gray-500 mb-2 block">
                기존 디지털 자산은 새 자산으로 교체됩니다.
              </Typography>
              <div className="mb-3 flex gap-2">
                <Button
                  type="button"
                  variant={formData.digitalAssetType === 'images' ? undefined : 'outline'}
                  onClick={() => setFormData({ ...formData, digitalAssetType: 'images' })}
                  className={formData.digitalAssetType === 'images' ? '!bg-[#FE3A8F] hover:!bg-[#e8a0c0] !text-white' : ''}
                >
                  <ImageIcon className="h-4 w-4 mr-1" />
                  이미지 업로드
                </Button>
                <Button
                  type="button"
                  variant={formData.digitalAssetType === 'pdf' ? undefined : 'outline'}
                  onClick={() => setFormData({ ...formData, digitalAssetType: 'pdf' })}
                  className={formData.digitalAssetType === 'pdf' ? '!bg-[#FE3A8F] hover:!bg-[#e8a0c0] !text-white' : ''}
                >
                  <FileText className="h-4 w-4 mr-1" />
                  PDF 업로드
                </Button>
              </div>
              <div className="mt-2">
                {formData.digitalAssets.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    {formData.digitalAssets.map((asset, index) => (
                      <div key={index} className="relative">
                        {formData.digitalAssetType === 'pdf' ? (
                          <div className="w-full h-24 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-center">
                            <FileText className="h-8 w-8 text-gray-400" />
                          </div>
                        ) : (
                          <img
                            src={URL.createObjectURL(asset)}
                            alt={`디지털 자산 ${index + 1}`}
                            className="w-full h-24 object-cover rounded-md"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            const newAssets = formData.digitalAssets.filter((_, i) => i !== index);
                            setFormData({ ...formData, digitalAssets: newAssets });
                          }}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <label className="relative flex items-center justify-center h-24 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-200 transition-colors">
                  <input
                    type="file"
                    accept={formData.digitalAssetType === 'pdf' ? 'application/pdf' : 'image/*'}
                    multiple={formData.digitalAssetType === 'images'}
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (formData.digitalAssetType === 'pdf') {
                        setFormData({ ...formData, digitalAssets: files.slice(0, 1) });
                      } else {
                        setFormData({ ...formData, digitalAssets: [...formData.digitalAssets, ...files] });
                      }
                    }}
                    className="hidden"
                  />
                  <Plus className="h-6 w-6 text-gray-400" />
                </label>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate({ to: `/store/partner/products/${productId}/edit` })}
              className="flex-1"
            >
              취소
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 !bg-[#FE3A8F] hover:!bg-[#e8a0c0] !text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  업로드 중...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  저장
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
