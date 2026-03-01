import { createFileRoute, useNavigate, Outlet, useMatches } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { ArrowRight, Loader2, Plus, X, MapPin } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components';
import { toast } from 'sonner';
import { productDraftStorage, type ScheduleDraft, type OptionDraft } from '@/utils/productDraftStorage';
import { LocationPickerSheet, type LocationResult } from '@/components/ui/LocationPickerSheet';
import { ProductOptionEditor } from '@/components/features/store/ProductOptionEditor';
import type { ProductOptionInput } from '@/api/store/products';
import ReactCalendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { ScheduleTimeSlotSelector, CALENDAR_STYLES } from '@/components/ui/ScheduleTimeSlotSelector';

export const Route = createFileRoute('/store/partner/products/new')({
  component: NewProductPage,
});

function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${mo}-${da}T${h}:${mi}`;
}

function NewProductPage() {
  const navigate = useNavigate();
  const matches = useMatches();
  const { user, isLoading: userLoading } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    product_type: 'digital' as 'digital' | 'on_site' | 'delivery',
    stock: '',
    shipping_fee_base: '',
    shipping_fee_remote: '',
    is_bundle_available: false,
    schedules: [] as ScheduleDraft[],
    options: [] as ProductOptionInput[],
  });
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [editingScheduleIndex, setEditingScheduleIndex] = useState<number | null>(null);
  const [scheduleCalendarDates, setScheduleCalendarDates] = useState<Record<number, Date>>({});

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
    if (draft) {
      setFormData({
        name: draft.name,
        description: draft.description,
        price: draft.price,
        product_type: draft.product_type,
        stock: draft.stock || '',
        shipping_fee_base: draft.shipping_fee_base || '',
        shipping_fee_remote: draft.shipping_fee_remote || '',
        is_bundle_available: draft.is_bundle_available || false,
        schedules: draft.schedules || [],
        options: (draft.options || []) as ProductOptionInput[],
      });
    }
  }, []); // 빈 배열로 한 번만 실행

  // 중첩 라우트 확인 (예: /store/partner/products/new/upload)
  const lastMatch = matches[matches.length - 1];
  const isNestedRouteActive = lastMatch?.routeId && lastMatch.routeId !== Route.id;

  // 중첩 라우트가 활성화된 경우 Outlet 렌더링
  if (isNestedRouteActive) {
    return <Outlet />;
  }

  if (userLoading) {
    return (
      <div className="min-h-screen bg-gray-50 pt-16 pb-20 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#FE3A8F]" />
      </div>
    );
  }

  const handleLocationConfirm = (result: LocationResult) => {
    if (editingScheduleIndex === null) return;
    const newSchedules = [...formData.schedules];
    newSchedules[editingScheduleIndex] = {
      ...newSchedules[editingScheduleIndex],
      location: result.address,
      location_lat: result.lat,
      location_lng: result.lng,
    };
    setFormData({ ...formData, schedules: newSchedules });
    setEditingScheduleIndex(null);
  };

  const handleNext = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.price || !formData.product_type) {
      toast.error('상품명, 가격, 상품 유형은 필수입니다.');
      return;
    }

    // 재고는 선택 사항 (입력하지 않으면 무제한)
    // 옵션에 재고가 있으면 옵션 재고 합계를 사용
    const optionStockSum = formData.options.reduce((sum: number, opt: any) => {
      if (opt.values) {
        return sum + opt.values.reduce((vSum: number, v: any) => vSum + (v.stock ?? 0), 0);
      }
      return sum;
    }, 0);
    const hasOptionStock = formData.options.some((opt: any) => 
      opt.values?.some((v: any) => v.stock !== undefined && v.stock !== null && v.stock > 0)
    );
    const stockToSave = hasOptionStock ? optionStockSum.toString() : formData.stock;

    // localStorage에 임시 저장
    productDraftStorage.save({
      name: formData.name,
      description: formData.description,
      price: formData.price,
      product_type: formData.product_type,
      stock: stockToSave || undefined,
      shipping_fee_base: formData.shipping_fee_base || undefined,
      shipping_fee_remote: formData.shipping_fee_remote || undefined,
      is_bundle_available: formData.is_bundle_available,
      schedules: formData.product_type === 'on_site' ? formData.schedules : undefined,
      options: (formData.product_type === 'on_site' || formData.product_type === 'delivery') ? formData.options as OptionDraft[] : undefined,
    });

    // 다음 페이지로 이동
    navigate({ to: '/store/partner/products/new/upload' });
  };

  return (
    <div className="min-h-screen pt-16 pb-20">
      <div className="flex flex-col h-full overflow-hidden">
        {/* 스크롤 가능한 콘텐츠 영역 */}
        <div className="flex-1 overflow-y-auto">
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
                className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/50"
                required
              >
                <option value="digital">디지털</option>
                <option value="on_site">현장수령</option>
                <option value="delivery">택배배송</option>
              </select>
            </div>

            {/* 재고 (현장수령/택배배송만) */}
            {(formData.product_type === 'on_site' || formData.product_type === 'delivery') && (() => {
              // 옵션에 재고가 있는지 확인
              const optionStockSum = formData.options.reduce((sum, opt) => {
                if (opt.values) {
                  return sum + opt.values.reduce((vSum, v) => vSum + (v.stock ?? 0), 0);
                }
                return sum;
              }, 0);
              const hasOptionStock = formData.options.some(opt => 
                opt.values?.some(v => v.stock !== undefined && v.stock !== null && v.stock > 0)
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
                    onClick={() => {
                      setFormData({
                        ...formData,
                        schedules: [...formData.schedules, { start_time: '', end_time: '', location: '' }],
                      });
                    }}
                    className="flex items-center gap-1 text-xs text-[#FE3A8F] hover:text-[#e8a0c0]"
                  >
                    <Plus className="h-3 w-3" />
                    일정 추가
                  </button>
                </div>
                {formData.schedules.length === 0 ? (
                  <div className="p-4 bg-gray-50 rounded-lg text-center">
                    <p className="text-sm text-gray-500">등록된 일정이 없습니다</p>
                    <p className="text-xs text-gray-400 mt-1">일정을 추가하여 수령 가능한 시간을 설정하세요</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {formData.schedules.map((schedule, index) => (
                      <div key={index} className="p-3 bg-gray-50 rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-700">일정 {index + 1}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setFormData({
                                ...formData,
                                schedules: formData.schedules.filter((_, i) => i !== index),
                              });
                            }}
                            className="p-1 text-gray-400 hover:text-red-500"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs text-gray-500 block">날짜 선택</label>
                          <div className="bg-white rounded-lg">
                            <ReactCalendar
                              onChange={(value) => {
                                const date = value instanceof Date ? value : Array.isArray(value) ? value[0] : null;
                                if (!date) return;
                                setScheduleCalendarDates(prev => ({ ...prev, [index]: date }));
                                const newSchedules = [...formData.schedules];
                                const prev = newSchedules[index];
                                const prevTime = prev.start_time ? prev.start_time.slice(11, 16) : '';
                                if (prevTime) {
                                  const [h, m] = prevTime.split(':').map(Number);
                                  date.setHours(h, m, 0, 0);
                                  const endDate = new Date(date);
                                  endDate.setMinutes(endDate.getMinutes() + 30);
                                  newSchedules[index] = { ...prev, start_time: toLocalISO(date), end_time: toLocalISO(endDate) };
                                  setFormData({ ...formData, schedules: newSchedules });
                                }
                              }}
                              value={schedule.start_time ? new Date(schedule.start_time) : (scheduleCalendarDates[index] || null)}
                              formatDay={(_locale, date) => date.getDate().toString()}
                              formatShortWeekday={(_locale, date) => {
                                const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
                                return weekdays[date.getDay()];
                              }}
                              formatMonthYear={(_locale, date) => `${date.getFullYear()}년 ${date.getMonth() + 1}월`}
                              className="!border-0 !w-full"
                              locale="ko-KR"
                              minDate={new Date()}
                            />
                            <style>{CALENDAR_STYLES}</style>
                          </div>
                          {(schedule.start_time || scheduleCalendarDates[index]) && (
                            <div>
                              <label className="text-xs text-gray-500 block mb-1">시간 선택</label>
                              <ScheduleTimeSlotSelector
                                selectedDate={schedule.start_time ? new Date(schedule.start_time) : scheduleCalendarDates[index]}
                                selectedTimeSlot={schedule.start_time ? schedule.start_time.slice(11, 16) : null}
                                onSelect={(timeSlot) => {
                                  const newSchedules = [...formData.schedules];
                                  const prev = newSchedules[index];
                                  const baseDate = prev.start_time ? new Date(prev.start_time) : (scheduleCalendarDates[index] || new Date());
                                  const [h, m] = timeSlot.split(':').map(Number);
                                  baseDate.setHours(h, m, 0, 0);
                                  const endDate = new Date(baseDate);
                                  endDate.setMinutes(endDate.getMinutes() + 30);
                                  newSchedules[index] = { ...prev, start_time: toLocalISO(baseDate), end_time: toLocalISO(endDate) };
                                  setFormData({ ...formData, schedules: newSchedules });
                                }}
                              />
                            </div>
                          )}
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
                  <label className="text-xs text-gray-500 mb-1 block">
                    기본 배송비
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      placeholder="기본 배송비 (0P이면 무료)"
                      value={formData.shipping_fee_base}
                      onChange={(e) => setFormData({ ...formData, shipping_fee_base: e.target.value })}
                      className="w-full px-3 py-2.5 pr-10 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/50"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">P</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-1 block">
                    도서산간 추가 배송비
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      placeholder="도서산간 지역 추가 배송비"
                      value={formData.shipping_fee_remote}
                      onChange={(e) => setFormData({ ...formData, shipping_fee_remote: e.target.value })}
                      className="w-full px-3 py-2.5 pr-10 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/50"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">P</span>
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
        </div>

        {/* 하단 버튼 - 스크롤 영역 밖에 고정 */}
        <div className="flex-shrink-0 bg-white p-4 border-t border-gray-100">
          <form onSubmit={handleNext} className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                productDraftStorage.clear();
                navigate({ to: '/store/partner/products' });
              }}
              className="flex-1"
            >
              취소
            </Button>
            <Button
              type="submit"
              className="flex-1 !bg-[#FE3A8F] hover:!bg-[#e8a0c0] !text-white"
            >
              다음 단계
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </form>
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
