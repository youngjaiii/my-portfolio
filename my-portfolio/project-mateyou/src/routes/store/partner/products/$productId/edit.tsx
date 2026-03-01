import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect, useCallback } from 'react';
import { Loader2, Plus, X, Image as ImageIcon, FileText, MapPin } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { storeProductsApi, type ProductOption, type ProductOptionInput } from '@/api/store/products';
import type { StoreProduct } from '@/api/store';
import { Button, StoreLoadingState, StoreErrorState } from '@/components';
import { toast } from 'sonner';
import { edgeApi } from '@/lib/edgeApi';
import { convertPdfToImage } from '@/utils/pdfToImage';
import { LocationPickerSheet, type LocationResult } from '@/components/ui/LocationPickerSheet';
import { ProductOptionEditor } from '@/components/features/store/ProductOptionEditor';

interface ScheduleItem {
  schedule_id?: string;
  start_time: string;
  end_time: string;
  location?: string;
  location_point?: { lat: number; lng: number };
  is_available?: boolean;
  current_bookings?: number;
  isNew?: boolean;
}

export const Route = createFileRoute('/store/partner/products/$productId/edit')({
  component: EditProductPage,
});

function EditProductPage() {
  const { productId } = Route.useParams();
  const navigate = useNavigate();
  const { user, isLoading: userLoading } = useAuth();
  const [product, setProduct] = useState<StoreProduct | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    product_type: 'digital' as 'digital' | 'on_site' | 'delivery',
    stock: '',
    shipping_fee_base: '',
    shipping_fee_remote: '',
    is_bundle_available: false,
    thumbnail: null as File | null,
    is_active: true,
    images: [] as File[],
    digitalAssets: [] as File[],
    digitalAssetType: 'images' as 'images' | 'pdf',
    existingImages: [] as Array<{ image_id: string; image_url: string; display_order: number }>,
    existingDigitalAssets: [] as Array<{ asset_id: string; file_url: string; file_name: string; display_order: number }>,
    pdfPreviews: {} as Record<number, string>,
    options: [] as ProductOptionInput[],
  });
  const [isConvertingPdf, setIsConvertingPdf] = useState(false);
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [removedScheduleIds, setRemovedScheduleIds] = useState<string[]>([]);
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [editingScheduleIndex, setEditingScheduleIndex] = useState<number | null>(null);

  const fetchProduct = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await storeProductsApi.getDetail(productId);
      if (response.success && response.data) {
        const productData = response.data as StoreProduct;
        setProduct(productData);
        const productDataWithAssets = productData as StoreProduct & {
          digital_assets?: Array<{ asset_id: string; file_url: string; file_name: string; display_order: number }>;
          shipping_fee_base?: number;
          shipping_fee_remote?: number;
          is_bundle_available?: boolean;
          schedules?: ScheduleItem[];
          options?: ProductOption[];
        };
            const existingOptions: ProductOptionInput[] = (productDataWithAssets.options || []).map(opt => ({
              name: opt.name,
              option_type: opt.option_type,
              is_required: opt.is_required,
              values: opt.values?.map(v => ({
                value: v.value,
                price_adjustment: v.price_adjustment,
                stock: v.stock ?? undefined,
              })),
            }));
            setFormData({
              name: productDataWithAssets.name,
              description: productDataWithAssets.description || '',
              price: productDataWithAssets.price.toString(),
              product_type: productDataWithAssets.product_type,
              stock: productDataWithAssets.stock?.toString() || '',
              shipping_fee_base: productDataWithAssets.shipping_fee_base?.toString() || '',
              shipping_fee_remote: productDataWithAssets.shipping_fee_remote?.toString() || '',
              is_bundle_available: productDataWithAssets.is_bundle_available || false,
              thumbnail: null,
              is_active: productDataWithAssets.is_active,
              images: [],
              digitalAssets: [],
              digitalAssetType: 'images',
              existingImages: productDataWithAssets.images || [],
              existingDigitalAssets: productDataWithAssets.digital_assets || [],
              pdfPreviews: {},
              options: existingOptions,
            });
            // 기존 스케줄 불러오기 (현장수령 상품)
            if (productDataWithAssets.schedules) {
              setSchedules(productDataWithAssets.schedules);
            }
      } else {
        setError(response.error?.message || '상품을 불러오는데 실패했습니다.');
      }
    } catch (err: any) {
      setError(err.message || '상품을 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      navigate({ to: '/login' });
      return;
    }
    if (user.role !== 'partner') {
      navigate({ to: '/mypage' });
      return;
    }

    fetchProduct();
  }, [productId, user?.id, user?.role, userLoading, fetchProduct]);

  const handleLocationConfirm = (result: LocationResult) => {
    if (editingScheduleIndex === null) return;
    const newSchedules = [...schedules];
    newSchedules[editingScheduleIndex] = {
      ...newSchedules[editingScheduleIndex],
      location: result.address,
      location_point: { lat: result.lat, lng: result.lng },
    };
    setSchedules(newSchedules);
    setEditingScheduleIndex(null);
  };

  const handleAddSchedule = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    const startTime = tomorrow.toISOString().slice(0, 16);
    tomorrow.setHours(18, 0, 0, 0);
    const endTime = tomorrow.toISOString().slice(0, 16);
    setSchedules([...schedules, { start_time: startTime, end_time: endTime, location: '', isNew: true }]);
  };

  const handleRemoveSchedule = (index: number) => {
    const schedule = schedules[index];
    if (schedule.schedule_id && !schedule.isNew) {
      // 기존 스케줄 삭제 시 ID 기록
      setRemovedScheduleIds([...removedScheduleIds, schedule.schedule_id]);
    }
    setSchedules(schedules.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.price || !formData.product_type) {
      toast.error('상품명, 가격, 상품 유형은 필수입니다.');
      return;
    }

    setIsSubmitting(true);
    try {
      // 옵션에 재고가 있으면 옵션 재고 합계 계산
      const optionStockSum = formData.options.reduce((sum: number, opt: any) => {
        if (opt.values) {
          return sum + opt.values.reduce((vSum: number, v: any) => vSum + (v.stock ?? 0), 0);
        }
        return sum;
      }, 0);
      const hasOptionStock = formData.options.some((opt: any) => 
        opt.values?.some((v: any) => v.stock !== undefined && v.stock !== null && v.stock > 0)
      );
      const stockToSend = hasOptionStock ? optionStockSum.toString() : formData.stock;

      const formDataToSend = new FormData();
      formDataToSend.append('name', formData.name);
      formDataToSend.append('description', formData.description);
      formDataToSend.append('price', formData.price);
      formDataToSend.append('product_type', formData.product_type);
      formDataToSend.append('is_active', formData.is_active.toString());
      if (stockToSend) {
        formDataToSend.append('stock', stockToSend);
      }
      // 배송비 (택배배송만)
      if (formData.product_type === 'delivery') {
        formDataToSend.append('shipping_fee_base', formData.shipping_fee_base || '0');
        formDataToSend.append('shipping_fee_remote', formData.shipping_fee_remote || '0');
        formDataToSend.append('is_bundle_available', formData.is_bundle_available.toString());
      }

      // 상품 옵션 (현장수령/택배배송만)
      if (formData.product_type === 'on_site' || formData.product_type === 'delivery') {
        formDataToSend.append('options', JSON.stringify(formData.options));
      }
      
      // 스케줄 추가/삭제 (현장수령만)
      if (formData.product_type === 'on_site') {
        const newSchedules = schedules.filter(s => s.isNew);
        if (newSchedules.length > 0) {
          const schedulesForApi = newSchedules.map(s => ({
            start_time: s.start_time,
            end_time: s.end_time,
            location: s.location,
            location_point: s.location_point,
          }));
          formDataToSend.append('add_schedules', JSON.stringify(schedulesForApi));
        }
        if (removedScheduleIds.length > 0) {
          formDataToSend.append('remove_schedule_ids', JSON.stringify(removedScheduleIds));
        }
      }
      
      if (formData.thumbnail) {
        formDataToSend.append('thumbnail', formData.thumbnail);
      }

      // 상세페이지 이미지 추가
      formData.images.forEach((image) => {
        formDataToSend.append('images[]', image);
      });
      // 기존 이미지 ID 유지
      formData.existingImages.forEach((img) => {
        formDataToSend.append('existing_image_ids', img.image_id);
      });

          // 디지털 자산 추가 (디지털 상품만)
          // PDF는 이미 선택 시 이미지로 변환되어 digitalAssets에 저장되어 있음
          if (formData.product_type === 'digital') {
            formData.digitalAssets.forEach((asset) => {
              formDataToSend.append('digital_assets[]', asset);
            });
            // 기존 디지털 자산 ID 유지
            formData.existingDigitalAssets.forEach((asset) => {
              formDataToSend.append('existing_digital_asset_ids', asset.asset_id);
            });
          }

      const response = await edgeApi.storeProducts.update(productId, formDataToSend);

      if (response.success) {
        toast.success('상품이 수정되었습니다.');
        navigate({ to: '/store/partner/products' });
      } else {
        toast.error(response.error?.message || '상품 수정에 실패했습니다.');
      }
    } catch (err: any) {
      toast.error(err.message || '상품 수정에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (userLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 pt-16 pb-20 flex items-center justify-center">
        <StoreLoadingState />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-gray-50 pt-16 pb-20">
        <div className="container mx-auto px-4 py-6">
          <StoreErrorState message={error || '상품을 찾을 수 없습니다.'} onRetry={fetchProduct} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-16 pb-20">
      <div className="flex flex-col h-full overflow-hidden">
        {/* 스크롤 가능한 콘텐츠 영역 */}
        <div className="flex-1 overflow-y-auto">
          <form onSubmit={handleSubmit}>
            {/* 기본 정보 섹션 */}
            <div className="bg-white p-4 space-y-4">
              <h3 className="text-sm font-semibold text-gray-800">기본 정보</h3>
              {/* 상품명 */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  상품명 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="상품명을 입력하세요"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/50"
                  required
                />
              </div>

              {/* 설명 */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">설명</label>
                <textarea
                  placeholder="상품 설명을 입력하세요"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={5}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/50 resize-none"
                />
              </div>

              {/* 가격 */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  가격 (포인트) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="가격"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="w-full px-3 py-2.5 pr-14 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/50"
                    required 
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">P</span>
                </div> 
              </div>

              {/* 상품 유형 */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">
                  상품 유형 <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.product_type}
                  onChange={(e) => setFormData({ ...formData, product_type: e.target.value as any })}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/50 bg-gray-100"
                  required
                  disabled
                >
                  <option value="digital">디지털</option>
                  <option value="on_site">현장수령</option>
                  <option value="delivery">택배배송</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">상품 유형은 수정할 수 없습니다.</p>
              </div>

              {/* 재고 (현장수령/택배배송만) */}
              {(formData.product_type === 'on_site' || formData.product_type === 'delivery') && (() => {
                // 옵션에 재고가 있는지 확인
                const optionStockSum = formData.options.reduce((sum: number, opt: any) => {
                  if (opt.values) {
                    return sum + opt.values.reduce((vSum: number, v: any) => vSum + (v.stock ?? 0), 0);
                  }
                  return sum;
                }, 0);
                const hasOptionStock = formData.options.some((opt: any) => 
                  opt.values?.some((v: any) => v.stock !== undefined && v.stock !== null && v.stock > 0)
                );
                
                return (
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">
                      재고 {hasOptionStock && <span className="text-pink-500 text-xs">(옵션 재고 합계)</span>}
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        placeholder="입력 안하면 무제한"
                        value={hasOptionStock ? optionStockSum : formData.stock}
                        onChange={(e) => !hasOptionStock && setFormData({ ...formData, stock: e.target.value })}
                        onWheel={(e) => e.currentTarget.blur()}
                        readOnly={hasOptionStock}
                        className={`w-full px-3 py-2.5 pr-10 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/50 ${hasOptionStock ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">개</span>
                    </div>
                    {hasOptionStock && (
                      <p className="text-xs text-pink-500 mt-1">옵션에 재고가 설정되어 자동 계산됩니다</p>
                    )}
                  </div>
                );
              })()}

              {/* 스케줄 설정 (현장수령만) */}
              {formData.product_type === 'on_site' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-gray-500">수령 가능 일정</label>
                    <button
                      type="button"
                      onClick={handleAddSchedule}
                      className="flex items-center gap-1 text-xs text-[#FE3A8F] hover:text-[#e8a0c0]"
                    >
                      <Plus className="h-3 w-3" />
                      일정 추가
                    </button>
                  </div>
                  {schedules.length === 0 ? (
                    <div className="p-4 bg-gray-50 rounded-lg text-center">
                      <p className="text-sm text-gray-500">등록된 일정이 없습니다</p>
                      <p className="text-xs text-gray-400 mt-1">일정을 추가하여 수령 가능한 시간을 설정하세요</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {schedules.map((schedule, index) => (
                        <div key={schedule.schedule_id || `new-${index}`} className="p-3 bg-gray-50 rounded-lg space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-gray-700">
                              일정 {index + 1}
                              {schedule.isNew && <span className="ml-1 text-[#FE3A8F]">(신규)</span>}
                              {schedule.current_bookings && schedule.current_bookings > 0 && (
                                <span className="ml-1 text-blue-500">(예약 {schedule.current_bookings}건)</span>
                              )}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveSchedule(index)}
                              disabled={!schedule.isNew && (schedule.current_bookings || 0) > 0}
                              className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                              title={!schedule.isNew && (schedule.current_bookings || 0) > 0 ? '예약이 있는 스케줄은 삭제할 수 없습니다' : ''}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs text-gray-500 block mb-1">시작 시간</label>
                              <input
                                type="datetime-local"
                                value={schedule.start_time?.slice(0, 16) || ''}
                                onChange={(e) => {
                                  const newSchedules = [...schedules];
                                  newSchedules[index] = { ...newSchedules[index], start_time: e.target.value };
                                  setSchedules(newSchedules);
                                }}
                                disabled={!schedule.isNew && (schedule.current_bookings || 0) > 0}
                                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#FE3A8F]/50 disabled:bg-gray-100"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-500 block mb-1">종료 시간</label>
                              <input
                                type="datetime-local"
                                value={schedule.end_time?.slice(0, 16) || ''}
                                onChange={(e) => {
                                  const newSchedules = [...schedules];
                                  newSchedules[index] = { ...newSchedules[index], end_time: e.target.value };
                                  setSchedules(newSchedules);
                                }}
                                disabled={!schedule.isNew && (schedule.current_bookings || 0) > 0}
                                className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#FE3A8F]/50 disabled:bg-gray-100"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="text-xs text-gray-500 block mb-1">
                              <MapPin className="h-3 w-3 inline mr-1" />
                              장소 (선택)
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingScheduleIndex(index);
                                setLocationPickerOpen(true);
                              }}
                              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded text-left hover:border-[#FE3A8F]/50 focus:outline-none focus:ring-1 focus:ring-[#FE3A8F]/50"
                            >
                              {schedule.location ? (
                                <span className="text-gray-900">{schedule.location}</span>
                              ) : (
                                <span className="text-gray-400">지도에서 장소를 선택하세요</span>
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 배송비 (택배배송만) */}
              {formData.product_type === 'delivery' && (
                <>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">기본 배송비</label>
                    <div className="relative">
                      <input
                        type="number"
                        placeholder="기본 배송비 (0원이면 무료)"
                        value={formData.shipping_fee_base}
                        onChange={(e) => setFormData({ ...formData, shipping_fee_base: e.target.value })}
                        className="w-full px-3 py-2.5 pr-10 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/50"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">원</span>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">도서산간 추가 배송비</label>
                    <div className="relative">
                      <input
                        type="number"
                        placeholder="도서산간 지역 추가 배송비"
                        value={formData.shipping_fee_remote}
                        onChange={(e) => setFormData({ ...formData, shipping_fee_remote: e.target.value })}
                        className="w-full px-3 py-2.5 pr-10 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/50"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">원</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      도서산간 지역 구매 시 기본 배송비 + 추가 배송비가 적용됩니다
                    </p>
                  </div>

                  {/* 묶음 배송 설정 */}
                  <label className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_bundle_available}
                      onChange={(e) => setFormData({ ...formData, is_bundle_available: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300 text-[#FE3A8F] focus:ring-[#FE3A8F]"
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-800">묶음 배송 가능</span>
                      <p className="text-xs text-gray-500">다른 묶음 배송 상품과 함께 배송됩니다 (최대 배송비만 적용)</p>
                    </div>
                  </label>
                </>
              )}

              {/* 상품 옵션 설정 (현장수령/택배배송만) */}
              {(formData.product_type === 'on_site' || formData.product_type === 'delivery') && (
                <ProductOptionEditor
                  options={formData.options}
                  onChange={(options) => setFormData({ ...formData, options })}
                />
              )}
            </div>

            {/* 구분선 */}
            <div className="w-full bg-gray-200 my-4 flex-shrink-0" style={{ height: '4px', minHeight: '4px' }} />

            {/* 이미지 섹션 */}
            <div className="bg-white p-4 space-y-4">
              <h3 className="text-sm font-semibold text-gray-800">이미지</h3>

              {/* 썸네일 */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">썸네일 이미지</label>
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
            ) : product.thumbnail_url ? (
              <div className="mt-2 relative inline-block">
                <img
                  src={product.thumbnail_url}
                  alt="현재 썸네일"
                  className="w-32 h-32 object-cover rounded-md"
                />
                <label className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 hover:bg-opacity-50 rounded-md transition-all cursor-pointer">
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
                  />
                  <Plus className="h-6 w-6 text-white opacity-0 hover:opacity-100 transition-opacity" />
                </label>
              </div>
            ) : (
              <label className="relative flex items-center justify-center w-32 h-32 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-200 transition-colors mt-2">
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
                />
                <Plus className="h-8 w-8 text-gray-400" />
              </label>
            )}
          </div>

              {/* 상세페이지 이미지 */}
              <div>
                <label className="text-xs text-gray-500 mb-1 block">상세페이지 이미지</label>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {formData.existingImages.map((image) => (
                <div key={image.image_id} className="relative">
                  <img
                    src={image.image_url}
                    alt={`상세 이미지 ${image.display_order}`}
                    className="w-full h-24 object-cover rounded-md"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setFormData({
                        ...formData,
                        existingImages: formData.existingImages.filter((img) => img.image_id !== image.image_id),
                      });
                    }}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {formData.images.map((image, index) => (
                <div key={`new-${index}`} className="relative">
                  <img
                    src={URL.createObjectURL(image)}
                    alt={`새 상세 이미지 ${index + 1}`}
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

            </div>

            {/* 구분선 */}
            {formData.product_type === 'digital' && (
              <div className="w-full bg-gray-200 my-4 flex-shrink-0" style={{ height: '4px', minHeight: '4px' }} />
            )}

            {/* 디지털 자산 섹션 (디지털 상품만) */}
            {formData.product_type === 'digital' && (
              <div className="bg-white p-4 space-y-4">
                <h3 className="text-sm font-semibold text-gray-800">디지털 자산</h3>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">디지털 자산</label>
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
                {formData.existingDigitalAssets.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    {formData.existingDigitalAssets.map((asset) => (
                      <div key={asset.asset_id} className="relative">
                        {asset.file_name.toLowerCase().endsWith('.pdf') ? (
                          <div className="w-full h-24 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-center">
                            <FileText className="h-8 w-8 text-gray-400" />
                          </div>
                        ) : (
                          <img
                            src={asset.file_url}
                            alt="기존 디지털 자산"
                            className="w-full h-24 object-cover rounded-md"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setFormData({
                              ...formData,
                              existingDigitalAssets: formData.existingDigitalAssets.filter(
                                (a) => a.asset_id !== asset.asset_id
                              ),
                            });
                          }}
                          className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {formData.digitalAssets.map((asset, index) => (
                  <div key={`new-asset-${index}`} className="relative inline-block mr-2 mb-2">
                    {formData.digitalAssetType === 'pdf' ? (
                      formData.pdfPreviews[index] ? (
                        <img
                          src={formData.pdfPreviews[index]}
                          alt={`PDF 미리보기 ${index + 1}`}
                          className="w-24 h-24 object-cover rounded-md"
                        />
                      ) : (
                        <div className="w-24 h-24 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-center">
                          <FileText className="h-8 w-8 text-gray-400" />
                        </div>
                      )
                    ) : (
                      <img
                        src={URL.createObjectURL(asset)}
                        alt={`새 디지털 자산 ${index + 1}`}
                        className="w-24 h-24 object-cover rounded-md"
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
                <label className="relative flex items-center justify-center h-24 w-24 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-200 transition-colors">
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
              </div>
            )}
          </form>
        </div>

        {/* 하단 버튼 - 스크롤 영역 밖에 고정 */}
        <div className="flex-shrink-0 bg-white p-4 border-t border-gray-100">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate({ to: '/store/partner/products' })}
              className="flex-1"
            >
              취소
            </Button>
            <Button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                const form = document.querySelector('form');
                if (form) {
                  form.requestSubmit();
                }
              }}
              disabled={isSubmitting}
              className="flex-1 !bg-[#FE3A8F] hover:!bg-[#e8a0c0] !text-white"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  수정 중...
                </>
              ) : (
                '수정'
              )}
            </Button>
          </div>
        </div>
      </div>

      <LocationPickerSheet
        isOpen={locationPickerOpen}
        onClose={() => {
          setLocationPickerOpen(false);
          setEditingScheduleIndex(null);
        }}
        onConfirm={handleLocationConfirm}
      />
    </div>
  );
}
