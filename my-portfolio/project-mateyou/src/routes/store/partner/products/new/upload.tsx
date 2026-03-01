import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { Loader2, X, Image as ImageIcon, FileText, CheckCircle, Plus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components';
import { toast } from 'sonner';
import { edgeApi } from '@/lib/edgeApi';
import { productDraftStorage } from '@/utils/productDraftStorage';
import { convertPdfToImage } from '@/utils/pdfToImage';

export const Route = createFileRoute('/store/partner/products/new/upload')({
  component: ProductUploadPage,
});

function ProductUploadPage() {
  const navigate = useNavigate();
  const { user, isLoading: userLoading } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [draftData, setDraftData] = useState<ReturnType<typeof productDraftStorage.load> | null>(null);
  const [formData, setFormData] = useState({
    thumbnail: null as File | null,
    images: [] as File[],
    digitalAssets: [] as File[],
    digitalAssetType: 'images' as 'images' | 'pdf',
    pdfPreviews: {} as Record<number, string>, // PDF 미리보기 이미지 URL 저장
  });
  const [isConvertingPdf, setIsConvertingPdf] = useState(false);

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
  }, [user?.id, user?.role, userLoading, navigate]);

  // localStorage에서 임시 저장된 데이터 불러오기 (한 번만)
  useEffect(() => {
    const draft = productDraftStorage.load();
    if (!draft) {
      toast.error('상품 정보를 찾을 수 없습니다.');
      navigate({ to: '/store/partner/products/new' });
      return;
    }
    setDraftData(draft);
  }, [navigate]);

  const handleSubmit = async () => {
    if (!draftData) {
      toast.error('상품 정보를 찾을 수 없습니다.');
      return;
    }

    // 썸네일 필수 검증
    if (!formData.thumbnail) {
      toast.error('썸네일 이미지는 필수입니다.');
      return;
    }

    // 디지털 상품은 digital_assets 필수
    if (draftData.product_type === 'digital' && formData.digitalAssets.length === 0) {
      toast.error('디지털 상품은 디지털 자산(PDF 또는 이미지)이 필수입니다.');
      return;
    }

    setIsSubmitting(true);
    try {
      const formDataToSend = new FormData();
      
      // 기본 정보 추가
      formDataToSend.append('name', draftData.name);
      formDataToSend.append('description', draftData.description);
      formDataToSend.append('price', draftData.price);
      formDataToSend.append('product_type', draftData.product_type);
      if (draftData.stock) {
        formDataToSend.append('stock', draftData.stock);
      }
      // 배송비 (택배배송만)
      if (draftData.product_type === 'delivery') {
        formDataToSend.append('shipping_fee_base', draftData.shipping_fee_base || '0');
        formDataToSend.append('shipping_fee_remote', draftData.shipping_fee_remote || '0');
      }

      // 스케줄 정보 (현장수령만)
      if (draftData.product_type === 'on_site' && draftData.schedules && draftData.schedules.length > 0) {
        const schedulesForApi = draftData.schedules.map((s) => ({
          start_time: s.start_time,
          end_time: s.end_time,
          location: s.location,
          location_point: s.location_lat && s.location_lng 
            ? { lat: s.location_lat, lng: s.location_lng } 
            : undefined,
        }));
        formDataToSend.append('schedules', JSON.stringify(schedulesForApi));
      }

      // 상품 옵션 (현장수령/택배배송만)
      if ((draftData.product_type === 'on_site' || draftData.product_type === 'delivery') && draftData.options && draftData.options.length > 0) {
        formDataToSend.append('options', JSON.stringify(draftData.options));
      }
      
      // 썸네일 추가
      if (formData.thumbnail) {
        formDataToSend.append('thumbnail', formData.thumbnail);
      }

      // 상세페이지 이미지 추가 (모든 상품 유형)
      formData.images.forEach((image) => {
        formDataToSend.append('images[]', image);
      });

      // 디지털 자산 추가 (디지털 상품만)
      // PDF는 이미 선택 시 이미지로 변환되어 digitalAssets에 저장되어 있음
      if (draftData.product_type === 'digital' && formData.digitalAssets.length > 0) {
        formData.digitalAssets.forEach((asset) => {
          formDataToSend.append('digital_assets[]', asset);
        });
      }

      const response = await edgeApi.storeProducts.create(formDataToSend);

      if (response.success) {
        // localStorage 데이터 삭제
        productDraftStorage.clear();
        toast.success('상품이 등록되었습니다.');
        navigate({ to: '/store/partner/products' });
      } else {
        toast.error(response.error?.message || '상품 등록에 실패했습니다.');
      }
    } catch (err: any) {
      toast.error(err.message || '상품 등록에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    productDraftStorage.clear();
    navigate({ to: '/store/partner/products' });
  };

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#FE3A8F]" />
      </div>
    );
  }

    return (
      <div className="min-h-screen pt-16 pb-20">
        <div className="container mx-auto px-4 pb-22">
          <div className="bg-white space-y-6">
          {/* 썸네일 업로드 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              썸네일 이미지 <span className="text-red-500">*</span>
            </label>
            {formData.thumbnail ? (
              <div className="mt-2 relative inline-block">
                <img
                  src={URL.createObjectURL(formData.thumbnail)}
                  alt="썸네일 미리보기"
                  className="w-32 h-32 object-cover rounded-md"
                />
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, thumbnail: null })}
                  className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <label className="relative flex items-center justify-center w-32 h-32 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-200 transition-colors">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setFormData({ ...formData, thumbnail: file });
                    }
                  }}
                  className="hidden"
                  required
                />
                <Plus className="h-8 w-8 text-gray-400" />
              </label>
            )}
          </div>

          {/* 상세페이지 이미지 업로드 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              상세페이지 이미지
            </label>
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
          {draftData?.product_type === 'digital' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                디지털 자산
              </label>
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
                          formData.pdfPreviews[index] ? (
                            <img
                              src={formData.pdfPreviews[index]}
                              alt={`PDF 미리보기 ${index + 1}`}
                              className="w-full h-24 object-cover rounded-md"
                            />
                          ) : (
                            <div className="w-full h-24 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-center">
                              <FileText className="h-8 w-8 text-gray-400" />
                            </div>
                          )
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
                            const newPreviews = { ...formData.pdfPreviews };
                            delete newPreviews[index];
                            setFormData({ ...formData, digitalAssets: newAssets, pdfPreviews: newPreviews });
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
                    onChange={async (e) => {
                      const files = Array.from(e.target.files || []);
                      if (formData.digitalAssetType === 'pdf') {
                        const pdfFile = files[0];
                        if (pdfFile) {
                          setIsConvertingPdf(true);
                          try {
                            // PDF를 즉시 PNG 이미지로 변환
                            const imageFile = await convertPdfToImage(pdfFile);
                            // 변환된 이미지의 미리보기 URL 생성
                            const previewUrl = URL.createObjectURL(imageFile);
                            setFormData({
                              ...formData,
                              // 변환된 이미지 File을 digitalAssets에 저장
                              digitalAssets: [imageFile],
                              pdfPreviews: { 0: previewUrl },
                            });
                          } catch (error: any) {
                            toast.error(`PDF 변환 실패: ${error.message}`);
                          } finally {
                            setIsConvertingPdf(false);
                          }
                        }
                      } else {
                        setFormData({ ...formData, digitalAssets: [...formData.digitalAssets, ...files] });
                      }
                    }}
                    className="hidden"
                    disabled={isConvertingPdf}
                  />
                  {isConvertingPdf ? (
                    <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
                  ) : (
                    <Plus className="h-6 w-6 text-gray-400" />
                  )}
                </label>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
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
                  등록 중...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  상품 등록
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
