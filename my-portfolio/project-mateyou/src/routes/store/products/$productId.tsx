import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect, useCallback } from 'react';
import { ShoppingCart, CreditCard, Loader2, Edit, Check, ChevronRight, Search } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useTimesheetRole } from '@/hooks/useTimesheetRole';
import { storeProductsApi, type SelectedOption, type ProductOption } from '@/api/store/products';
import { storeOrdersApi } from '@/api/store/orders';
import { storeCollaborationApi } from '@/api/store/collaboration';
import { storeSchedulesApi, type StoreSchedule } from '@/api/store/schedules';
import { storeCartApi, type ShippingAddress } from '@/api/store/cart';
import { AvatarWithFallback, Button, Typography, SlideSheet, Input } from '@/components';
import { useUIStore } from '@/store/useUIStore';
import { toast } from 'sonner';
import type { StoreProduct } from '@/api/store';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { MapContainer, TileLayer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin } from 'lucide-react';
import { ProductOptionSelector, calculateOptionsTotalPrice, validateRequiredOptions, formatSelectedOptionsForApi } from '@/components/features/store/ProductOptionSelector';

export const Route = createFileRoute('/store/products/$productId')({
  component: ProductDetailPage,
});

// 전자금융거래 이용약관 내용
const ELECTRONIC_FINANCE_TERMS = `전자금융거래 이용약관 동의

제 1 조 (목적)
이 약관은 주식회사 IKY(이하 '회사'라 합니다)이 제공하는 전자지급결제대행서비스를 이용자가 이용함에 있어 회사와 이용자 사이의 전자금융거래에 관한 기본적인 사항을 정함을 목적으로 합니다.

제 2 조 (용어의 정의)
이 약관에서 정하는 용어의 정의는 다음과 같습니다.

'전자금융거래'라 함은 회사가 전자적 장치를 통하여 전자지급결제대행(이하 '전자금융거래 서비스'라고 합니다)을 제공하고 이용자가 회사의 종사자와 직접 대면하거나 의사소통을 하지 아니하고 자동화된 방식으로 이를 이용하는 거래를 말합니다.

'전자지급결제대행서비스'라 함은 전자적 방법으로 재화의 구입 또는 용역의 이용에 있어서 지급결제정보를 송신하거나 수신하는 것 또는 그 대가의 정산을 대행하거나 매개하는 서비스를 말합니다.

'가맹점'이라 함은 금융기관 또는 전자금융업자와의 계약에 따라 직불전자지급수단이나 선불전자지급수단 또는 전자화폐에 의한 거래에 있어서 이용자에게 재화 또는 용역을 제공하는 자로서 금융기관 또는 전자금융업자가 아닌 자를 말합니다.

'이용자'라 함은 이 약관에 동의하고 회사가 제공하는 전자금융거래 서비스를 이용하는 자를 말합니다.

'접근매체'라 함은 전자금융거래에 있어서 거래지시를 하거나 이용자 및 거래내용의 진실성과 정확성을 확보하기 위하여 사용되는 수단 또는 정보로서 전자식 카드 및 이에 준하는 전자적 정보(신용카드 번호를 포함합니다), '전자서명법'상의 인증서, 회사에 등록된 이용자번호, 이용자의 생체정보, 이상의 수단이나 정보를 사용하는데 필요한 비밀번호 등 전자금융거래법 제2조 제10호에서 정하고 있는 것을 말합니다.

'거래지시'라 함은 이용자가 본 약관에 의하여 체결되는 전자금융거래계약에 따라 회사에 대하여 전자금융거래의 처리를 지시하는 것을 말합니다.

'오류'라 함은 이용자의 고의 또는 과실없이 전자금융거래가 전자금융거래계약 또는 이용자의 거래지시에 따라 이행되지 아니한 경우를 말합니다.

제 3 조 (약관의 명시 및 변경)
회사는 이용자가 전자금융거래 서비스를 이용하기 전에 이 약관을 게시하고 이용자가 이 약관의 중요한 내용을 확인할 수 있도록 합니다.

회사는 이용자의 요청이 있는 경우 전자문서의 전송방식에 의하여 본 약관의 사본을 이용자에게 교부합니다.

회사가 약관을 변경하는 때에는 그 시행일 1개월 이전에 변경되는 약관을 회사가 제공하는 전자금융거래 서비스 이용 초기화면 및 회사의 홈페이지에 게시함으로써 이용자에게 공지합니다.

제 4 조 (전자지급결제대행서비스의 종류)
계좌출금 대행서비스 : 이용자가 결제대금을 회사의 전자결제시스템을 통하여 금융기관의 펌뱅킹실시간출금이체서비스를 이용하여 자신의 계좌에서 출금하여 결제하는 서비스를 말합니다.

신용카드 결제대행서비스 : 이용자가 결제대금의 지급을 위하여 제공한 지급결제수단이 신용카드인 경우로서 회사가 전자결제시스템을 통하여 신용카드 지불정보를 송, 수신하고 결제대금의 정산을 대행하거나 매개하는 서비스를 말합니다.

제 5 조 (이용시간)
회사는 이용자에게 연중무휴 1일 24시간 전자금융거래 서비스를 제공함을 원칙으로 합니다. 단, 금융기관 기타 결제수단 발행업자의 사정에 따라 달리 정할 수 있습니다.

제 6 조 (접근매체의 선정과 사용 및 관리)
회사는 전자금융거래 서비스 제공 시 접근매체를 선정하여 이용자의 신원, 권한 및 거래지시의 내용 등을 확인할 수 있습니다.

이용자는 접근매체를 제3자에게 대여하거나 사용을 위임하거나 양도 또는 담보 목적으로 제공할 수 없습니다.

제 7 조 (거래내역의 확인)
회사는 이용자와 미리 약정한 전자적 방법을 통하여 이용자의 거래내용을 확인할 수 있도록 하며 이용자의 요청이 있는 경우에는 요청을 받은 날로부터 2주 이내에 모사전송 등의 방법으로 거래내용에 관한 서면을 교부합니다.

제 8 조 (오류의 정정 등)
이용자는 전자금융거래 서비스를 이용함에 있어 오류가 있음을 안 때에는 회사에 대하여 그 정정을 요구할 수 있습니다.

회사는 전항의 규정에 따른 오류의 정정요구를 받은 때 또는 스스로 오류가 있음을 안 때에는 이를 즉시 조사하여 처리한 후 정정요구를 받은 날 또는 오류가 있음을 안 날부터 2주 이내에 그 결과를 이용자에게 알려 드립니다.

제 9 조 (회사의 책임)
접근매체의 위조나 변조로 발생한 사고로 인하여 이용자에게 발생한 손해에 대하여 배상책임이 있습니다.

제 10 조 (전자지급거래계약의 효력)
회사는 이용자의 거래지시가 전자지급거래에 관한 경우 그 지급절차를 대행하며 전자지급거래에 관한 거래지시의 내용을 전송하여 지급이 이루어지도록 합니다.

제 11 조 (거래지시의 철회)
이용자는 전자지급거래에 관한 거래지시의 경우 지급의 효력이 발생하기 전까지 거래지시를 철회할 수 있습니다.

제 15 조 (분쟁처리 및 분쟁조정)
이용자는 다음의 분쟁처리 책임자 및 담당자에 대하여 전자금융거래 서비스 이용과 관련한 의견 및 불만의 제기, 손해배상의 청구 등의 분쟁처리를 요구할 수 있습니다.

책임자 : 주식회사 IKY 대표이사 임문상
전화번호 : 010-8712-9811
주소 : 서울시 마포구 독막로6길 27 3층
이메일 : contact@mateyou.me
통신판매업 신고번호 : 2025-서울마포-2780

주식회사 IKY`;

// 개인정보 제공 및 위탁 안내
const PRIVACY_DELEGATION_TERMS = `개인정보 제공 및 위탁 안내

1. 개인정보 제3자 제공

회사는 결제 서비스 제공을 위해 아래와 같이 개인정보를 제3자에게 제공합니다.

제공받는 자: 주식회사 IKY, 각 카드사, 금융결제원
제공 목적: 결제 처리, 결제 대금 정산, 본인 확인
제공 항목: 성명, 연락처, 결제정보(카드번호, 유효기간 등)
보유 기간: 관련 법령에 따른 보존기간

2. 개인정보 처리 위탁

회사는 서비스 제공을 위해 아래와 같이 개인정보 처리를 위탁하고 있습니다.

수탁업체: 주식회사 IKY
위탁 업무: 전자결제대행 서비스
위탁 기간: 위탁 계약 종료 시까지

3. 이용자 권리

이용자는 개인정보 제공에 대한 동의를 거부할 권리가 있습니다. 다만, 동의를 거부할 경우 결제 서비스 이용이 제한될 수 있습니다.

4. 문의처

개인정보 관련 문의사항은 아래로 연락 주시기 바랍니다.

책임자 : 주식회사 IKY 대표이사 임문상
전화번호 : 010-8712-9811
주소: 서울시 마포구 독막로6길 27 3층
이메일: contact@mateyou.me

주식회사 IKY`;

// 시간 슬롯 선택 컴포넌트
function TimeSlotSelector({
  schedules,
  selectedDate,
  selectedTimeSlot,
  selectedScheduleId,
  onSelect,
}: {
  schedules: StoreSchedule[];
  selectedDate: Date;
  selectedTimeSlot: string | null;
  selectedScheduleId: string | null;
  onSelect: (timeSlot: string, scheduleId: string, dateTime: Date) => void;
}) {
  // 선택된 날짜의 스케줄 필터링
  const daySchedules = schedules.filter((schedule) => {
    if (!schedule.start_time || !schedule.end_time) return false;
    const scheduleDate = new Date(schedule.start_time);
    return (
      scheduleDate.getFullYear() === selectedDate.getFullYear() &&
      scheduleDate.getMonth() === selectedDate.getMonth() &&
      scheduleDate.getDate() === selectedDate.getDate()
    );
  });

  if (daySchedules.length === 0) {
    return (
      <div className="p-3 bg-gray-50 rounded-lg">
        <Typography variant="caption" className="text-gray-600">
          선택한 날짜에 수령 가능한 스케줄이 없습니다.
        </Typography>
      </div>
    );
  }

  // 30분 단위 시간 슬롯 생성 (현재 시간 이전은 제외)
  const generateTimeSlots = (startTime: Date, endTime: Date, selectedDate: Date): Array<{ time: string; dateTime: Date }> => {
    const slots: Array<{ time: string; dateTime: Date }> = [];
    const current = new Date(startTime);
    const end = new Date(endTime);
    const now = new Date();

    // 선택된 날짜와 현재 날짜가 같은 경우 현재 시간 이후만 표시
    const isToday = 
      selectedDate.getFullYear() === now.getFullYear() &&
      selectedDate.getMonth() === now.getMonth() &&
      selectedDate.getDate() === now.getDate();

    while (current < end) {
      // 선택된 날짜와 시간을 결합한 Date 객체 생성
      const slotDateTime = new Date(selectedDate);
      slotDateTime.setHours(current.getHours(), current.getMinutes(), 0, 0);

      // 오늘 날짜인 경우 현재 시간 이후만 추가
      if (!isToday || slotDateTime > now) {
        const hours = current.getHours();
        const minutes = current.getMinutes().toString().padStart(2, '0');
        const period = hours < 12 ? '오전' : '오후';
        const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
        slots.push({
          time: `${period} ${displayHours}:${minutes}`,
          dateTime: slotDateTime,
        });
      }
      current.setMinutes(current.getMinutes() + 30);
    }

    return slots;
  };

  // 모든 스케줄의 시간 슬롯 합치기
  const allTimeSlots: Array<{ time: string; dateTime: Date; scheduleId: string; schedule: StoreSchedule }> = [];
  daySchedules.forEach((schedule) => {
    if (schedule.start_time && schedule.end_time) {
      const startTime = new Date(schedule.start_time);
      const endTime = new Date(schedule.end_time);
      const slots = generateTimeSlots(startTime, endTime, selectedDate);
      slots.forEach((slot) => {
        allTimeSlots.push({
          time: slot.time,
          dateTime: slot.dateTime,
          scheduleId: schedule.schedule_id,
          schedule,
        });
      });
    }
  });

  // 중복 제거 및 정렬 (dateTime 기준)
  const uniqueTimeSlots = Array.from(
    new Map(allTimeSlots.map((item) => [item.dateTime.getTime(), item])).values()
  ).sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {uniqueTimeSlots.map((slot) => {
          const isSelected = selectedTimeSlot === slot.time && selectedScheduleId === slot.scheduleId;
          return (
            <button
              key={`${slot.scheduleId}-${slot.time}`}
              onClick={() => onSelect(slot.time, slot.scheduleId, slot.dateTime)}
              className={`px-4 py-2 rounded-lg border-2 transition-colors ${
                isSelected
                  ? 'bg-[#FE3A8F] text-white border-[#FE3A8F]'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-[#FE3A8F] hover:text-[#FE3A8F]'
              }`}
            >
              <Typography variant="body2" className={`font-medium ${isSelected ? 'text-white' : 'text-gray-700'}`}>
                {slot.time}
              </Typography>
            </button>
          );
        })}
      </div>
      {selectedTimeSlot && (() => {
        const selectedSchedule = daySchedules.find((s) => s.schedule_id === selectedScheduleId);
        const locationPoint = selectedSchedule?.location_point as { lat: number; lng: number } | undefined;
        return (
          <div className="space-y-2">
            <div className="p-3 bg-pink-50 rounded-lg">
              <Typography variant="caption" className="text-blue-700">
                선택된 시간: {selectedTimeSlot}
                {selectedSchedule?.location && (
                  <span className="block mt-1">
                    장소: {selectedSchedule.location}
                  </span>
                )}
              </Typography>
            </div>
            {locationPoint && (
              <div className="relative rounded-lg overflow-hidden border border-gray-200" style={{ height: '150px' }}>
                <MapContainer
                  // @ts-expect-error react-leaflet types issue
                  center={[locationPoint.lat, locationPoint.lng]}
                  zoom={16}
                  style={{ height: '100%', width: '100%' }}
                  zoomControl={false}
                  attributionControl={false}
                  dragging={false}
                  scrollWheelZoom={false}
                  doubleClickZoom={false}
                  touchZoom={false}
                >
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                </MapContainer>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[1000]">
                  <div className="relative -mt-5">
                    <MapPin className="w-8 h-8 text-[#FE3A8F] drop-shadow-lg" fill="#FE3A8F" />
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

function ProductDetailPage() {
  const { productId } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin } = useTimesheetRole();
  const setPartnerHeaderName = useUIStore((state) => state.setPartnerHeaderName);
  const [product, setProduct] = useState<StoreProduct | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isPurchaseSheetOpen, setIsPurchaseSheetOpen] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [deliveryInfo, setDeliveryInfo] = useState({
    recipient_name: '',
    recipient_phone: '',
    recipient_address: '',
    recipient_address_detail: '',
    recipient_postal_code: '',
    delivery_memo: '',
    is_remote_area: false,
  });
  const [shippingAddresses, setShippingAddresses] = useState<ShippingAddress[]>([]);
  const [selectedShippingAddressId, setSelectedShippingAddressId] = useState<string | null>(null);
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false);
  const [useDirectInput, setUseDirectInput] = useState(false);
  const [isAddAddressSheetOpen, setIsAddAddressSheetOpen] = useState(false);
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [editingAddress, setEditingAddress] = useState<ShippingAddress | null>(null);
  const [newAddressForm, setNewAddressForm] = useState({
    name: '',
    phone: '',
    address: '',
    address_detail: '',
    postal_code: '',
    is_default: false,
  });
  const [isStockEditSheetOpen, setIsStockEditSheetOpen] = useState(false);
  const [stockValue, setStockValue] = useState<string>('');
  const [isUpdatingStock, setIsUpdatingStock] = useState(false);
  
  // 현장 수령 스케줄 관련 state
  const [schedules, setSchedules] = useState<StoreSchedule[]>([]);
  const [isLoadingSchedules, setIsLoadingSchedules] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | null>(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null);
  const [selectedDateTime, setSelectedDateTime] = useState<Date | null>(null);
  
  // 구매 단계 관리
  const [purchaseStep, setPurchaseStep] = useState<'schedule' | 'confirm'>('schedule');
  const [purchaseAgreements, setPurchaseAgreements] = useState({
    purchase: false,
    electronicFinance: false,
    privacy: false,
  });
  const [selectedTermsModal, setSelectedTermsModal] = useState<'electronicFinance' | 'privacy' | null>(null);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);

  // 상품 옵션 관련 state
  const [selectedOptions, setSelectedOptions] = useState<SelectedOption[]>([]);

  // 도서산간 지역 체크 (제주, 울릉도 등)
  const checkIsRemoteArea = useCallback((address: string): boolean => {
    const remoteKeywords = ['제주', '울릉', '독도', '거문도', '백령도', '대청도', '소청도', '연평도', '덕적도', '영흥도', '자월도', '이작도', '승봉도', '사승봉도', '풍도', '대부도', '선재도', '영종도', '무의도', '실미도', '장봉도', '세어도', '볼음도', '아차도', '모도'];
    return remoteKeywords.some(keyword => address.includes(keyword));
  }, []);

  // 다음 주소 검색 완료 핸들러
  const handleAddressComplete = useCallback((data: any) => {
    const fullAddress = data.roadAddress || data.jibunAddress;
    const isRemote = checkIsRemoteArea(fullAddress);
    setDeliveryInfo(prev => ({
      ...prev,
      recipient_address: fullAddress,
      recipient_postal_code: data.zonecode,
      is_remote_area: isRemote,
    }));
    setIsAddressModalOpen(false);
  }, [checkIsRemoteArea]);

  // 다음 주소 검색 모달 열기
  const openDaumPostcode = useCallback(() => {
    setIsAddressModalOpen(true);
  }, []);

  // 다음 주소 검색 embed 초기화
  useEffect(() => {
    if (!isAddressModalOpen) return;

    const loadScript = () => {
      return new Promise<void>((resolve) => {
        if ((window as any).daum?.Postcode) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';
        script.onload = () => resolve();
        document.body.appendChild(script);
      });
    };

    const initPostcode = async () => {
      await loadScript();
      const container = document.getElementById('daum-postcode-container');
      if (container && (window as any).daum?.Postcode) {
        container.innerHTML = '';
        new (window as any).daum.Postcode({
          oncomplete: handleAddressComplete,
          width: '100%',
          height: '100%',
        }).embed(container);
      }
    };

    initPostcode();
  }, [isAddressModalOpen, handleAddressComplete]);

  // 배송비 계산 (도서산간 지역은 기본 배송비 + 추가 배송비)
  const calculateShippingFee = useCallback(() => {
    if (!product || product.product_type !== 'delivery') return 0;
    const baseFee = product.shipping_fee_base ?? 0;
    const remoteFee = product.shipping_fee_remote ?? 0;
    return deliveryInfo.is_remote_area ? baseFee + remoteFee : baseFee;
  }, [product, deliveryInfo.is_remote_area]);

  // 저장된 배송지 조회
  const fetchShippingAddresses = useCallback(async () => {
    if (!user) return;
    setIsLoadingAddresses(true);
    try {
      const response = await storeCartApi.getShippingAddresses();
      if (response.success && response.data) {
        const addresses = Array.isArray(response.data) ? response.data : [];
        setShippingAddresses(addresses);
        const defaultAddr = addresses.find((a: ShippingAddress) => a.is_default);
        if (defaultAddr) {
          setSelectedShippingAddressId(defaultAddr.id);
          // 기본 배송지 정보 자동 입력 (도서산간 지역 체크 포함)
          const isRemote = checkIsRemoteArea(defaultAddr.address);
          setDeliveryInfo({
            recipient_name: defaultAddr.name,
            recipient_phone: defaultAddr.phone,
            recipient_address: defaultAddr.address,
            recipient_address_detail: defaultAddr.address_detail || '',
            recipient_postal_code: defaultAddr.postal_code,
            delivery_memo: '',
            is_remote_area: isRemote,
          });
        }
      }
    } catch (err) {
      console.error('배송지 조회 실패:', err);
    } finally {
      setIsLoadingAddresses(false);
    }
  }, [user?.id, checkIsRemoteArea]);

  // 배송지 선택 시 정보 자동 입력 (도서산간 지역 체크 포함)
  const handleSelectShippingAddress = useCallback((addr: ShippingAddress) => {
    setSelectedShippingAddressId(addr.id);
    const isRemote = checkIsRemoteArea(addr.address);
    setDeliveryInfo({
      recipient_name: addr.name,
      recipient_phone: addr.phone,
      recipient_address: addr.address,
      recipient_address_detail: addr.address_detail || '',
      recipient_postal_code: addr.postal_code,
      delivery_memo: '',
      is_remote_area: isRemote,
    });
    setUseDirectInput(false);
  }, [checkIsRemoteArea]);

  // 배송지 추가
  const handleAddAddress = useCallback(async () => {
    if (!newAddressForm.name || !newAddressForm.phone || !newAddressForm.address || !newAddressForm.postal_code) {
      toast.error('필수 정보를 모두 입력해주세요');
      return;
    }
    setIsSavingAddress(true);
    try {
      const response = await storeCartApi.createShippingAddress(newAddressForm);
      if (response.success) {
        toast.success('배송지가 추가되었습니다');
        setIsAddAddressSheetOpen(false);
        setNewAddressForm({ name: '', phone: '', address: '', address_detail: '', postal_code: '', is_default: false });
        fetchShippingAddresses();
      } else {
        toast.error(response.error?.message || '배송지 추가에 실패했습니다');
      }
    } catch (error) {
      toast.error('배송지 추가에 실패했습니다');
    } finally {
      setIsSavingAddress(false);
    }
  }, [newAddressForm, fetchShippingAddresses]);

  // 배송지 수정
  const handleUpdateAddress = useCallback(async () => {
    if (!editingAddress) return;
    if (!newAddressForm.name || !newAddressForm.phone || !newAddressForm.address || !newAddressForm.postal_code) {
      toast.error('필수 정보를 모두 입력해주세요');
      return;
    }
    setIsSavingAddress(true);
    try {
      const response = await storeCartApi.updateShippingAddress(editingAddress.id, newAddressForm);
      if (response.success) {
        toast.success('배송지가 수정되었습니다');
        setIsAddAddressSheetOpen(false);
        setEditingAddress(null);
        setNewAddressForm({ name: '', phone: '', address: '', address_detail: '', postal_code: '', is_default: false });
        fetchShippingAddresses();
      } else {
        toast.error(response.error?.message || '배송지 수정에 실패했습니다');
      }
    } catch (error) {
      toast.error('배송지 수정에 실패했습니다');
    } finally {
      setIsSavingAddress(false);
    }
  }, [editingAddress, newAddressForm, fetchShippingAddresses]);

  // 배송지 삭제
  const handleDeleteAddress = useCallback(async (addressId: string) => {
    try {
      const response = await storeCartApi.deleteShippingAddress(addressId);
      if (response.success) {
        toast.success('배송지가 삭제되었습니다');
        if (selectedShippingAddressId === addressId) {
          setSelectedShippingAddressId(null);
        }
        fetchShippingAddresses();
      } else {
        toast.error(response.error?.message || '배송지 삭제에 실패했습니다');
      }
    } catch (error) {
      toast.error('배송지 삭제에 실패했습니다');
    }
  }, [selectedShippingAddressId, fetchShippingAddresses]);

  // 배송지 수정 시작
  const startEditAddress = useCallback((addr: ShippingAddress) => {
    setEditingAddress(addr);
    setNewAddressForm({
      name: addr.name,
      phone: addr.phone,
      address: addr.address,
      address_detail: addr.address_detail || '',
      postal_code: addr.postal_code,
      is_default: addr.is_default,
    });
    setIsAddAddressSheetOpen(true);
  }, []);

  useEffect(() => {
    const fetchProduct = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await storeProductsApi.getDetail(productId);
        if (response.success && response.data) {
          const productData = response.data as StoreProduct;
          setProduct(productData);
          // 헤더에 상품명 설정
          setPartnerHeaderName(productData.name);
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

    // 컴포넌트 언마운트 시 헤더 이름 초기화
    return () => {
      setPartnerHeaderName(null);
    };
  }, [productId, setPartnerHeaderName]);

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
          description: product?.source === 'collaboration'
            ? (() => {
                const schedules = (product as any)?.schedules;
                const baseSchedule = schedules?.find((s: any) => !s.start_time);
                const pickupLocation = baseSchedule?.location || (product as any)?.pickup_location;
                return `상품 준비 후 채팅을 통해 수령 일정을 확인할 수 있습니다.`;
              })()
            : '결제 후 채팅을 통해 일정 확정이 가능합니다.',
          icon: '📍',
        };
      case 'delivery':
        return {
          label: '택배',
          description: product?.source === 'collaboration' 
            ? '업체 배송'
            : '파트너 직접 배송',
          icon: '🚚',
        };
      default:
        return { label: type, description: '', icon: '🛍️' };
    }
  };

  const [isAddingToCart, setIsAddingToCart] = useState(false);

  const handleAddToCart = async () => {
    if (!product) return;

    // 재고 확인
    if (product.stock !== null && product.stock !== undefined && product.stock < quantity) {
      toast.error('재고가 부족합니다.');
      return;
    }

    // 필수 옵션 검증
    const productOptions = (product as any).options as ProductOption[] | undefined;
    if (productOptions && productOptions.length > 0) {
      if (!validateRequiredOptions(productOptions, selectedOptions)) {
        toast.error('필수 옵션을 선택해주세요.');
        return;
      }
    }

    setIsAddingToCart(true);
    try {
      const response = await storeCartApi.addItem({
        product_id: product.product_id,
        quantity: quantity,
        selected_options: selectedOptions.length > 0 ? formatSelectedOptionsForApi(selectedOptions) : undefined,
      });
      
      if (response.success) {
        toast.success(
          <div 
            className="flex justify-between items-center gap-2 cursor-pointer" 
            onClick={() => navigate({ to: '/store/cart' })}
          >
            <span>장바구니에 추가되었습니다.</span>
            <span className="flex items-center gap-1 text-[#FE3A8F] font-medium">
              장바구니로 이동 <ChevronRight className="h-4 w-4" />
            </span>
          </div>
        );
      } else {
        toast.error(response.error?.message || '장바구니에 추가할 수 없습니다.');
      }
    } catch (error: any) {
      toast.error(error.message || '장바구니에 추가할 수 없습니다.');
    } finally {
      setIsAddingToCart(false);
    }
  };

  const isCollabOnSite = product?.source === 'collaboration' && product?.product_type === 'on_site';

  // 구매 시트 열 때 스케줄 로드 (협업 현장수령은 스케줄 불필요)
  useEffect(() => {
    const fetchSchedules = async () => {
      if (!isPurchaseSheetOpen || !product || product.product_type !== 'on_site' || isCollabOnSite) {
        return;
      }

      setIsLoadingSchedules(true);
      try {
        const response = await storeSchedulesApi.getList({
          product_id: product.product_id,
          available_only: true,
        });

        if (response.success && response.data) {
          const schedulesData = Array.isArray(response.data) ? response.data : [];
          setSchedules(schedulesData);
        }
      } catch (err: any) {
        console.error('스케줄 조회 실패:', err);
        toast.error('스케줄을 불러오는데 실패했습니다.');
      } finally {
        setIsLoadingSchedules(false);
      }
    };

    fetchSchedules();
  }, [isPurchaseSheetOpen, product]);

  // 구매 시트 닫을 때 초기화
  useEffect(() => {
    if (!isPurchaseSheetOpen) {
      setSelectedDate(null);
      setSelectedTimeSlot(null);
      setSelectedScheduleId(null);
      setSelectedDateTime(null);
      setPurchaseStep(isCollabOnSite ? 'confirm' : 'schedule');
      setPurchaseAgreements({
        purchase: false,
        electronicFinance: false,
        privacy: false,
      });
      setSelectedTermsModal(null);
    }
  }, [isPurchaseSheetOpen, isCollabOnSite]);

  const handlePurchase = async () => {
    if (!user) {
      navigate({ to: '/login' });
      return;
    }

    if (!product) return;

    // 택배 상품은 배송지 정보 필수
    if (product.product_type === 'delivery') {
      if (!deliveryInfo.recipient_name || !deliveryInfo.recipient_phone || !deliveryInfo.recipient_address || !deliveryInfo.recipient_postal_code) {
        alert('배송지 정보를 모두 입력해주세요.');
        return;
      }
    }

    // 현장 수령 상품은 날짜/시간 선택 필수 (협업 현장수령은 스케줄 없이 구매)
    if (product.product_type === 'on_site' && !isCollabOnSite && (!selectedDate || !selectedTimeSlot)) {
      toast.error('수령 일시를 선택해주세요.');
      return;
    }

    // 필수 옵션 검증
    const productOptions = (product as any).options as ProductOption[] | undefined;
    if (productOptions && productOptions.length > 0) {
      if (!validateRequiredOptions(productOptions, selectedOptions)) {
        toast.error('필수 옵션을 선택해주세요.');
        return;
      }
    }

    setIsCreatingOrder(true);
    try {
      const orderData: any = {
        product_id: product.product_id,
        quantity,
        selected_options: selectedOptions.length > 0 ? formatSelectedOptionsForApi(selectedOptions) : undefined,
      };

      // on_site 상품인 경우 schedule_id 전달 (협업 현장수령은 스케줄 없이 구매)
      if (product.product_type === 'on_site' && selectedScheduleId && !isCollabOnSite) {
        orderData.schedule_id = selectedScheduleId;
      }

      if (product.product_type === 'delivery') {
        const fullAddress = deliveryInfo.recipient_address_detail 
          ? `${deliveryInfo.recipient_address} ${deliveryInfo.recipient_address_detail}`
          : deliveryInfo.recipient_address;
        orderData.recipient_name = deliveryInfo.recipient_name;
        orderData.recipient_phone = deliveryInfo.recipient_phone;
        orderData.recipient_address = fullAddress;
        orderData.recipient_postal_code = deliveryInfo.recipient_postal_code;
        orderData.delivery_memo = deliveryInfo.delivery_memo;
        orderData.shipping_fee = calculateShippingFee();
      }

      // 협업 현장수령: schedule의 location 사용 (fallback: product.pickup_location)
      if (isCollabOnSite) {
        const schedules = (product as any)?.schedules;
        const baseSchedule = schedules?.find((s: any) => !s.start_time);
        orderData.reserved_location = baseSchedule?.location || (product as any).pickup_location || '';
        const locationPoint = baseSchedule?.location_point || (product as any).pickup_location_point;
        if (locationPoint) {
          orderData.reserved_location_point = locationPoint;
        }
      }

      // 현장수령 상품: selectedDateTime 사용 (TimeSlotSelector에서 직접 전달받은 Date 객체)
      if (product.product_type === 'on_site' && !isCollabOnSite && selectedDateTime) {
        const endDateTime = new Date(selectedDateTime);
        endDateTime.setMinutes(endDateTime.getMinutes() + 30);
        
        // 로컬 시간 그대로 전송 (UTC 변환 없이)
        const toLocalISOString = (d: Date) => {
          const pad = (n: number) => String(n).padStart(2, '0');
          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
        };
        
        orderData.reserved_start_time = toLocalISOString(selectedDateTime);
        orderData.reserved_end_time = toLocalISOString(endDateTime);
        
        const selectedSchedule = schedules.find(s => s.schedule_id === selectedScheduleId);
        console.log('[현장수령 주문 - 프론트] 스케줄 조회:', { 
          selectedScheduleId, 
          selectedSchedule,
          hasLocationPoint: !!selectedSchedule?.location_point,
          locationPoint: selectedSchedule?.location_point
        });
        orderData.reserved_location = selectedSchedule?.location || '';
        if (selectedSchedule?.location_point) {
          orderData.reserved_location_point = selectedSchedule.location_point;
        }
      }

      console.log('[현장수령 주문 - 프론트] 최종 orderData:', orderData);
      const response = await storeOrdersApi.create(orderData);
      
      if (response.success && response.data) {
        const orderId = (response.data as any).order_id;
        if (orderId) {
          toast.success('주문이 생성되었습니다.');
          // 주문 생성 성공 시 주문 상세 페이지로 이동
          navigate({
            to: '/store/orders/$orderId',
            params: { orderId },
          });
        } else {
          alert('주문 ID를 받지 못했습니다.');
        }
      } else {
        alert(response.error?.message || '주문 생성에 실패했습니다.');
      }
    } catch (err: any) {
      alert(err.message || '주문 생성에 실패했습니다.');
    } finally {
      setIsCreatingOrder(false);
      setIsPurchaseSheetOpen(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#FE3A8F]" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <Typography variant="h5" className="text-gray-600 mb-2">
            {error || '상품을 찾을 수 없습니다.'}
          </Typography>
          <Button
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.history.back();
              }
            }}
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
  const canPurchase = !isOutOfStock && product.is_active;

  return (
    <div className="min-h-screen bg-gray-50 pt-16 pb-20">
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
      <div className="bg-white px-4 pt-6 pb-18 space-y-4">
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
          </div>
        </div>

        <div>
          <div className="flex items-center gap-3">
            <Typography variant="h3" className="font-bold text-[#FE3A8F]">
              {product.price.toLocaleString()}P
            </Typography>
            {(product as any).wishlist_count > 0 && (
              <span className="text-sm text-gray-500">❤️ {(product as any).wishlist_count.toLocaleString()}</span>
            )}
          </div>
          {/* 택배 상품 배송비 안내 */}
          {product.product_type === 'delivery' && (
            <div className="mt-2 text-sm text-gray-600">
              {(product.shipping_fee_base ?? 0) === 0 ? (
                <span className="text-green-600 font-medium">무료배송</span>
              ) : (
                <>
                  <span>배송비 {(product.shipping_fee_base ?? 0).toLocaleString()}P</span>
                  {(product.shipping_fee_remote ?? 0) > 0 && (
                    <span className="text-gray-400 ml-1">(도서산간 +{(product.shipping_fee_remote ?? 0).toLocaleString()}P)</span>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* 상품 옵션 선택 (on_site, delivery 상품) - 장바구니 담기 전에 선택 필요 */}
        {(product.product_type === 'on_site' || product.product_type === 'delivery') && (product as any).options && (product as any).options.length > 0 && (
          <div className="pt-4 border-t border-gray-200">
            <Typography variant="body2" className="font-medium text-gray-900 mb-3">
              상품 옵션
            </Typography>
            <ProductOptionSelector
              options={(product as any).options as ProductOption[]}
              selectedOptions={selectedOptions}
              onChange={setSelectedOptions}
            />
          </div>
        )}

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

        {/* 재고 정보 */}
        {product.stock !== null && (
          <div className="pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <Typography variant="body2" className="text-gray-600">
                재고: {product.stock !== null && product.stock !== undefined && product.stock > 0 ? `${product.stock}개` : '품절'}
              </Typography>
              {/* 협업 상품이고 Admin인 경우에만 재고 수정 버튼 표시 */}
              {product.source === 'collaboration' && isAdmin && (
                <Button
                  onClick={() => {
                    setStockValue(product.stock?.toString() || '0');
                    setIsStockEditSheetOpen(true);
                  }}
                  variant="outline"
                  size="sm"
                >
                  <Edit className="h-4 w-4 mr-1" />
                  재고 수정
                </Button>
              )}
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
              <Typography variant="caption" className="text-blue-700 whitespace-pre-line">
                {typeInfo.description}
              </Typography>
            </div>
          </div>
        </div>

        {/* 현장수령 상품 스케줄 정보 */}
        {product.product_type === 'on_site' && product.schedules && product.schedules.length > 0 && (
          <div className="pt-4 border-t border-gray-200">
            <Typography variant="body2" className="font-medium text-gray-900 mb-3">
              수령 가능 일정
            </Typography>
            <div className="space-y-2">
              {product.schedules.slice(0, 5).map((schedule) => (
                <div key={schedule.schedule_id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <MapPin className="h-4 w-4 text-[#FE3A8F] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    {schedule.start_time && (
                      <Typography variant="body2" className="text-gray-900">
                        {new Date(schedule.start_time).toLocaleDateString('ko-KR', {
                          month: 'long',
                          day: 'numeric',
                          weekday: 'short',
                        })}{' '}
                        {new Date(schedule.start_time).toLocaleTimeString('ko-KR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {schedule.end_time && (
                          <span className="text-gray-500">
                            {' ~ '}
                            {new Date(schedule.end_time).toLocaleTimeString('ko-KR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </Typography>
                    )}
                    {schedule.location && (
                      <Typography variant="caption" className="text-gray-500 truncate">
                        {schedule.location}
                      </Typography>
                    )}
                  </div>
                </div>
              ))}
              {product.schedules.length > 5 && (
                <Typography variant="caption" className="text-gray-500 text-center block">
                  외 {product.schedules.length - 5}건의 일정이 더 있습니다
                </Typography>
              )}
            </div>
          </div>
        )}

        {/* 파트너 정보 */}
        {product.partner && (
          <div className="pt-4 border-t border-gray-200">
            <div className="flex items-center gap-3">
              <AvatarWithFallback
                src={product.partner.member?.profile_image}
                name={product.partner.partner_name || product.partner.member?.name}
                size="sm"
              />
              <div>
                <Typography variant="body2" className="font-medium">
                  {product.partner.partner_name || product.partner.member?.name}
                </Typography>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 구매 버튼 영역 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 safe-area-bottom">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          {product.product_type !== 'digital' && (
            <div className="flex items-center border border-gray-300 rounded-lg">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                disabled={quantity <= 1}
                className="px-3 py-2 disabled:opacity-50"
              >
                -
              </button>
              <span className="px-4 py-2 min-w-[2rem] text-center">{quantity}</span>
              <button
                onClick={() => setQuantity((q) => {
                  const maxQty = product.stock !== null && product.stock !== undefined ? product.stock : 10;
                  return Math.min(maxQty, q + 1);
                })}
                disabled={product.stock !== null && product.stock !== undefined && quantity >= product.stock}
                className="px-3 py-2 disabled:opacity-50"
              >
                +
              </button>
            </div>
          )}
          {product.product_type !== 'on_site' && (
            <Button
              variant="outline"
              onClick={handleAddToCart}
              disabled={!canPurchase || isAddingToCart}
              size="lg"
              className="flex-1 rounded-full !text-sm font-medium whitespace-nowrap"
            >
              {isAddingToCart ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
              <ShoppingCart className="h-4 w-4 mr-2" />
              )}
              {isAddingToCart ? '담는 중...' : '장바구니'}
            </Button>
          )}
          <Button
            onClick={() => {
              setIsPurchaseSheetOpen(true);
              if (product?.product_type === 'delivery') {
                fetchShippingAddresses();
              }
            }}
            disabled={!canPurchase || isCreatingOrder}
            size="lg"
            className="flex-1 rounded-full bg-[#FE3A8F] text-white !text-sm font-medium whitespace-nowrap"
          >
            {isCreatingOrder ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                처리 중...
              </>
            ) : (
              <>
                <CreditCard className="h-4 w-4 mr-2" />
                바로구매
              </>
            )}
          </Button>
        </div>
      </div>

      {/* 구매 시트 */}
      <SlideSheet
        isOpen={isPurchaseSheetOpen}
        onClose={() => setIsPurchaseSheetOpen(false)}
        title={product.product_type === 'on_site' && !isCollabOnSite && purchaseStep === 'schedule' ? '수량 및 일시 선택' : '구매하기'}
        footer={
          product.product_type === 'on_site' && !isCollabOnSite && purchaseStep === 'schedule' ? (
          <div className="flex gap-3 px-4">
            <Button
              variant="outline"
              onClick={() => setIsPurchaseSheetOpen(false)}
              className="flex-1"
            >
              취소
            </Button>
              <Button
                onClick={() => {
                  if (!selectedScheduleId) {
                    toast.error('수령 일시를 선택해주세요.');
                    return;
                  }
                  setPurchaseStep('confirm');
                }}
                disabled={!selectedDate || !selectedTimeSlot}
                className="flex-1 bg-[#FE3A8F] text-white !text-sm font-medium whitespace-nowrap"
              >
                다음
              </Button>
            </div>
          ) : (
            <div className="flex gap-3 px-4">
              <Button
                variant="outline"
                onClick={() => {
                  if (product.product_type === 'on_site' && !isCollabOnSite) {
                    setPurchaseStep('schedule');
                  } else {
                    setIsPurchaseSheetOpen(false);
                  }
                }}
                className="flex-1"
              >
                {product.product_type === 'on_site' && !isCollabOnSite ? '이전' : '취소'}
              </Button>
            <Button
              onClick={handlePurchase}
                disabled={
                  isCreatingOrder ||
                  !canPurchase ||
                  (product.product_type === 'on_site' && !isCollabOnSite && (!selectedDate || !selectedTimeSlot)) ||
                  !purchaseAgreements.purchase ||
                  !purchaseAgreements.electronicFinance ||
                  !purchaseAgreements.privacy
                }
              className="flex-1 bg-[#FE3A8F] text-white !text-sm font-medium whitespace-nowrap"
            >
              {isCreatingOrder ? '처리 중...' : `구매하기 (${((product.price + calculateOptionsTotalPrice(selectedOptions)) * quantity + (product.product_type === 'delivery' ? calculateShippingFee() : 0)).toLocaleString()}P)`}
            </Button>
          </div>
          )
        }
      >
        {product.product_type === 'on_site' && !isCollabOnSite && purchaseStep === 'schedule' ? (
        <div className="space-y-4">
            {/* 수량 선택 */}
            <div className="space-y-3">
              <Typography variant="body2" className="font-medium">
                수량 선택
              </Typography>
              <div className="flex items-center gap-2 border border-gray-300 rounded-lg w-fit">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={quantity <= 1}
                  className="px-3 py-2 disabled:opacity-50"
                >
                  -
                </button>
                <span className="px-4 py-2 min-w-[2rem] text-center">{quantity}</span>
                <button
                  onClick={() => setQuantity((q) => {
                    const maxQty = product.stock !== null && product.stock !== undefined ? product.stock : 10;
                    return Math.min(maxQty, q + 1);
                  })}
                  disabled={product.stock !== null && product.stock !== undefined && quantity >= product.stock}
                  className="px-3 py-2 disabled:opacity-50"
                >
                  +
                </button>
              </div>
            </div>

            {/* 일시 선택 */}
            <div className="space-y-4">
              <Typography variant="body2" className="font-medium">
                수령 일시 선택
              </Typography>

              {isLoadingSchedules ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-[#FE3A8F]" />
                </div>
              ) : schedules.length === 0 ? (
                <div className="p-3 bg-yellow-50 rounded-lg">
                  <Typography variant="caption" className="text-yellow-700">
                    ⚠️ 등록된 스케줄이 없습니다. 파트너에게 문의해주세요.
                  </Typography>
                </div>
              ) : (
                <>
                  {/* 캘린더 */}
                  <div className="bg-white p-4">
                    <Calendar
                      onChange={(value) => {
                        if (value instanceof Date) {
                          setSelectedDate(value);
                          setSelectedTimeSlot(null);
                          setSelectedScheduleId(null);
                          setSelectedDateTime(null);
                        } else if (Array.isArray(value) && value[0] instanceof Date) {
                          setSelectedDate(value[0]);
                          setSelectedTimeSlot(null);
                          setSelectedScheduleId(null);
                          setSelectedDateTime(null);
                        }
                      }}
                      value={selectedDate}
                      formatDay={(_locale, date) => date.getDate().toString()}
                      formatShortWeekday={(_locale, date) => {
                        const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
                        return weekdays[date.getDay()];
                      }}
                      formatMonthYear={(_locale, date) => {
                        return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
                      }}
                      tileContent={({ date }) => {
                        const hasSchedule = schedules.some((schedule) => {
                          if (!schedule.start_time) return false;
                          const scheduleDate = new Date(schedule.start_time);
                          return (
                            scheduleDate.getFullYear() === date.getFullYear() &&
                            scheduleDate.getMonth() === date.getMonth() &&
                            scheduleDate.getDate() === date.getDate()
                          );
                        });
                        if (hasSchedule) {
                          return (
                            <div className="absolute right-1 top-1 flex items-center justify-center">
                              <div className="w-2 h-2 bg-[#FE3A8F] rounded-full" />
                            </div>
                          );
                        }
                        return null;
                      }}
                      className="!border-0 !w-full"
                      locale="ko-KR"
                      minDate={new Date()}
                    />
                    
                    <style>{`
                      .react-calendar {
                        width: 100%;
                        border: none;
                        font-family: inherit;
                      }
                      .react-calendar__navigation {
                        display: flex;
                        height: 40px;
                        margin-bottom: 1em;
                      }
                      .react-calendar__navigation button {
                        min-width: 36px;
                        background: none;
                        font-size: 14px;
                        font-weight: 600;
                        color: #1e293b;
                      }
                      .react-calendar__navigation button:enabled:hover,
                      .react-calendar__navigation button:enabled:focus {
                        background-color: #f1f5f9;
                        border-radius: 6px;
                      }
                      .react-calendar__navigation button[disabled] {
                        background-color: transparent;
                        color: #cbd5e1;
                      }
                      .react-calendar__month-view__weekdays {
                        text-align: center;
                        font-weight: 600;
                        font-size: 0.7em;
                        color: #64748b;
                        margin-bottom: 0.5em;
                      }
                      .react-calendar__month-view__weekdays__weekday {
                        padding: 0.5em;
                      }
                      .react-calendar__month-view__weekdays__weekday abbr {
                        text-decoration: none;
                      }
                      .react-calendar__month-view__days {
                        display: grid !important;
                        grid-template-columns: repeat(7, 1fr);
                      }
                      .react-calendar__tile {
                        max-width: 100%;
                        padding: 0.75em 0.5em;
                        background: none;
                        text-align: center;
                        line-height: 1.5;
                        font-size: 0.9em;
                        color: #1e293b;
                        border-radius: 6px;
                        transition: all 0.15s;
                        position: relative;
                      }
                      .react-calendar__tile:enabled:hover,
                      .react-calendar__tile:enabled:focus {
                        background-color: #f1f5f9;
                        color: #1e293b;
                      }
                      .react-calendar__tile--now {
                        background: #fef3c7;
                        color: #92400e;
                        font-weight: 600;
                      }
                      .react-calendar__tile--now:enabled:hover,
                      .react-calendar__tile--now:enabled:focus {
                        background: #fde68a;
                      }
                      .react-calendar__tile--active {
                        background: #FE3A8F !important;
                        color: white !important;
                        font-weight: 600;
                      }
                      .react-calendar__tile--active:enabled:hover,
                      .react-calendar__tile--active:enabled:focus {
                        background: #e8a0c0 !important;
                      }
                      .react-calendar__tile:disabled {
                        background-color: transparent !important;
                      }
                    `}</style>
                  </div>

                  {/* 선택된 날짜의 시간 슬롯 */}
                  {selectedDate && (
                    <div className="space-y-3">
                      <Typography variant="body2" className="font-medium">
                        {selectedDate.toLocaleDateString('ko-KR', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })} 시간 선택
                      </Typography>
                      <TimeSlotSelector
                        schedules={schedules}
                        selectedDate={selectedDate}
                        selectedTimeSlot={selectedTimeSlot}
                        selectedScheduleId={selectedScheduleId}
                        onSelect={(timeSlot, scheduleId, dateTime) => {
                          setSelectedTimeSlot(timeSlot);
                          setSelectedScheduleId(scheduleId);
                          setSelectedDateTime(dateTime);
                        }}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 상품 옵션 선택 (on_site, delivery만) */}
            {(product.product_type === 'on_site' || product.product_type === 'delivery') && (product as any).options && (product as any).options.length > 0 && (
              <div className="space-y-3">
                <Typography variant="body2" className="font-medium">
                  상품 옵션
                </Typography>
                <ProductOptionSelector
                  options={(product as any).options as ProductOption[]}
                  selectedOptions={selectedOptions}
                  onChange={setSelectedOptions}
                />
              </div>
            )}

            {/* 주문 정보 */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <Typography variant="body2" className="text-gray-600 mb-2">
              주문 정보
            </Typography>
            <div className="flex justify-between">
              <span>{product.name}</span>
              <span className="font-semibold">{product.price.toLocaleString()}P × {quantity}</span>
            </div>
              {/* 선택된 옵션 표시 */}
              {selectedOptions.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
                  {selectedOptions.map((opt, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="text-gray-600">{opt.option_name}: {opt.value || opt.text_value}</span>
                      {opt.price_adjustment > 0 && (
                        <span className="text-gray-500">+{opt.price_adjustment.toLocaleString()}P</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {product.product_type === 'on_site' && selectedTimeSlot && (
                <div className="mt-2 pt-2 border-t border-gray-200">
                  <Typography variant="body2" className="text-gray-600">
                    수령 일시: {selectedDate?.toLocaleDateString('ko-KR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })} {selectedTimeSlot}
                  </Typography>
                </div>
              )}
              {/* 택배 상품: 배송비 표시 */}
              {product.product_type === 'delivery' && (
                <div className="flex justify-between mt-2 pt-2 border-t border-gray-200">
                  <span className="text-gray-600">
                    배송비 {deliveryInfo.is_remote_area && <span className="text-orange-600 text-xs">(도서산간)</span>}
                  </span>
                  <span className="font-semibold">
                    {calculateShippingFee() === 0 ? '무료' : `${calculateShippingFee().toLocaleString()}P`}
                  </span>
                </div>
              )}
            <div className="flex justify-between mt-2 pt-2 border-t border-gray-200">
              <span className="font-semibold">총 금액</span>
              <span className="font-bold text-[#FE3A8F] text-lg">
                {((product.price + calculateOptionsTotalPrice(selectedOptions)) * quantity + (product.product_type === 'delivery' ? calculateShippingFee() : 0)).toLocaleString()}P
              </span>
            </div>
          </div>

            {/* 배송지 정보 (택배 상품) */}
          {product.product_type === 'delivery' && (
            <div className="space-y-3">
              <Typography variant="body2" className="font-medium">
                배송지 정보
              </Typography>

              {/* 저장된 배송지 / 직접 입력 토글 */}
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => {
                    setUseDirectInput(false);
                    if (shippingAddresses.length === 0) {
                      fetchShippingAddresses();
                    }
                  }}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${!useDirectInput ? 'bg-[#FE3A8F] text-white' : 'bg-gray-100 text-gray-600'}`}
                >
                  기존 배송지
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUseDirectInput(true);
                    setSelectedShippingAddressId(null);
                    setDeliveryInfo({
                      recipient_name: '',
                      recipient_phone: '',
                      recipient_address: '',
                      recipient_address_detail: '',
                      recipient_postal_code: '',
                      delivery_memo: '',
                      is_remote_area: false,
                    });
                  }}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${useDirectInput ? 'bg-[#FE3A8F] text-white' : 'bg-gray-100 text-gray-600'}`}
                >
                  직접 입력
                </button>
              </div>

              {/* 저장된 배송지 목록 */}
              {!useDirectInput && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {isLoadingAddresses ? (
                    <div className="text-center py-4 text-gray-500 text-sm">배송지 불러오는 중...</div>
                  ) : shippingAddresses.length === 0 ? (
                    <div className="text-center py-4">
                      <p className="text-gray-500 text-sm mb-2">저장된 배송지가 없습니다</p>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAddress(null);
                          setNewAddressForm({ name: '', phone: '', address: '', address_detail: '', postal_code: '', is_default: false });
                          setIsAddAddressSheetOpen(true);
                        }}
                        className="text-[#FE3A8F] text-sm font-medium"
                      >
                        배송지 추가
                      </button>
                    </div>
                  ) : (
                    <>
                      {shippingAddresses.map((addr) => (
                        <div
                          key={addr.id}
                          className={`p-3 rounded-xl border-2 transition-colors ${selectedShippingAddressId === addr.id ? 'border-[#FE3A8F] bg-pink-50' : 'border-gray-200 bg-white'}`}
                        >
                          <button
                            type="button"
                            onClick={() => handleSelectShippingAddress(addr)}
                            className="w-full text-left"
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-sm">{addr.name}</span>
                              {addr.is_default && (
                                <span className="text-xs bg-[#FE3A8F] text-white px-1.5 py-0.5 rounded-full">기본</span>
                              )}
                            </div>
                            <p className="text-xs text-gray-600">{addr.phone}</p>
                            <p className="text-xs text-gray-600 truncate">{addr.address} {addr.address_detail}</p>
                          </button>
                          <div className="flex gap-2 mt-2 pt-2 border-t border-gray-100">
                            <button
                              type="button"
                              onClick={() => startEditAddress(addr)}
                              className="text-xs text-gray-500 hover:text-[#FE3A8F]"
                            >
                              수정
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteAddress(addr.id)}
                              className="text-xs text-gray-500 hover:text-red-500"
                            >
                              삭제
                            </button>
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => {
                          setEditingAddress(null);
                          setNewAddressForm({ name: '', phone: '', address: '', address_detail: '', postal_code: '', is_default: false });
                          setIsAddAddressSheetOpen(true);
                        }}
                        className="w-full py-2 text-center text-[#FE3A8F] text-sm font-medium border-2 border-dashed border-[#FE3A8F] rounded-xl hover:bg-pink-50"
                      >
                        + 새 배송지 추가
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* 직접 입력 폼 */}
              {useDirectInput && (
                <>
              <input
                type="text"
                placeholder="받는 분 이름 *"
                value={deliveryInfo.recipient_name}
                onChange={(e) => setDeliveryInfo({ ...deliveryInfo, recipient_name: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                required
              />
              <input
                type="tel"
                placeholder="연락처 * (숫자만 입력)"
                value={deliveryInfo.recipient_phone}
                onChange={(e) => {
                  const numericValue = e.target.value.replace(/[^0-9]/g, '');
                  setDeliveryInfo({ ...deliveryInfo, recipient_phone: numericValue });
                }}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                required
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="우편번호 *"
                  value={deliveryInfo.recipient_postal_code}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg bg-gray-50"
                  readOnly
                />
                <button
                  type="button"
                  onClick={openDaumPostcode}
                  className="text-sm p-3 bg-pink-500 text-white rounded-lg flex items-center gap-2 whitespace-nowrap"
                >
                  <Search className="h-4 w-4" />
                  주소 검색
                </button>
              </div>
              <input
                type="text"
                placeholder="주소 *"
                value={deliveryInfo.recipient_address}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-50"
                readOnly
              />
              <input
                type="text"
                placeholder="상세주소 (선택)"
                value={deliveryInfo.recipient_address_detail}
                onChange={(e) => setDeliveryInfo({ ...deliveryInfo, recipient_address_detail: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg"
              />
              {deliveryInfo.is_remote_area && (
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <Typography variant="caption" className="text-orange-700">
                    ⚠️ 도서산간 지역으로, 추가 배송비 {(product.shipping_fee_remote ?? 0).toLocaleString()}P가 발생합니다.
                  </Typography>
                </div>
              )}
                </>
              )}

              {/* 배송 요청사항 (공통) */}
              <textarea
                placeholder="배송 요청사항 (선택)"
                value={deliveryInfo.delivery_memo}
                onChange={(e) => setDeliveryInfo({ ...deliveryInfo, delivery_memo: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                rows={2}
              />
            </div>
          )}

            {/* 구매 약관 */}
            <div className="space-y-2">
              <Typography variant="body2" className="font-medium">
                구매 약관 동의
              </Typography>
              
              {/* 전체 동의 */}
              <button
                type="button"
                onClick={() => {
                  const allChecked = purchaseAgreements.purchase && purchaseAgreements.electronicFinance && purchaseAgreements.privacy;
                  setPurchaseAgreements({
                    purchase: !allChecked,
                    electronicFinance: !allChecked,
                    privacy: !allChecked,
                  });
                }}
                className="w-full flex items-center gap-3 py-2"
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                  purchaseAgreements.purchase && purchaseAgreements.electronicFinance && purchaseAgreements.privacy
                    ? 'bg-blue-500 border-blue-500'
                    : 'border-gray-300'
                }`}>
                  {(purchaseAgreements.purchase && purchaseAgreements.electronicFinance && purchaseAgreements.privacy) && (
                    <Check className="w-3 h-3 text-white" />
                  )}
                </div>
                <span className="text-sm text-black text-left flex-1">
                  전체 동의
                </span>
              </button>

              <div className="space-y-2">
                {/* 1. 구매 동의 */}
                <button
                  type="button"
                  onClick={() => setPurchaseAgreements(prev => ({ ...prev, purchase: !prev.purchase }))}
                  className="w-full flex items-center gap-3 py-2"
                >
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                    purchaseAgreements.purchase ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                  }`}>
                    {purchaseAgreements.purchase && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span className="text-sm text-black text-left flex-1">
                    구매할 상품의 결제 조건을 확인하였으며, 구매에 동의합니다
                    <span className="text-gray-500 ml-1">(필수)</span>
                  </span>
                </button>
                
                {/* 2. 전자금융거래 이용약관 */}
                <div className="flex items-center gap-3 py-2">
                  <button
                    type="button"
                    onClick={() => setPurchaseAgreements(prev => ({ ...prev, electronicFinance: !prev.electronicFinance }))}
                    className="flex items-center gap-3 flex-1"
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      purchaseAgreements.electronicFinance ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                    }`}>
                      {purchaseAgreements.electronicFinance && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className="text-sm text-black text-left">
                      전자금융거래 이용약관 동의
                      <span className="text-gray-500 ml-1">(필수)</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTermsModal('electronicFinance')}
                    className="text-gray-500 text-xs flex items-center gap-0.5 hover:underline flex-shrink-0"
                  >
                    약관 보기
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
                
                {/* 3. 개인정보 제공 및 위탁 안내 */}
                <div className="flex items-center gap-3 py-2">
                  <button
                    type="button"
                    onClick={() => setPurchaseAgreements(prev => ({ ...prev, privacy: !prev.privacy }))}
                    className="flex items-center gap-3 flex-1"
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      purchaseAgreements.privacy ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
                    }`}>
                      {purchaseAgreements.privacy && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <span className="text-sm text-black text-left">
                      개인정보 제공 및 위탁 안내 동의
                      <span className="text-gray-500 ml-1">(필수)</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedTermsModal('privacy')}
                    className="text-gray-500 text-xs flex items-center gap-0.5 hover:underline flex-shrink-0"
                  >
                    약관 보기
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>

          {product.product_type === 'digital' && (
            <div className="p-3 bg-green-50 rounded-lg">
              <Typography variant="caption" className="text-green-700">
                💡 디지털 상품은 결제 후 즉시 다운로드할 수 있습니다.
              </Typography>
            </div>
          )}
          </div>
        )}
      </SlideSheet>

      {/* 약관 모달 */}
      <SlideSheet
        isOpen={selectedTermsModal !== null}
        onClose={() => setSelectedTermsModal(null)}
        title={selectedTermsModal === 'electronicFinance' ? '전자금융거래 이용약관' : '개인정보 제공 및 위탁 안내'}
        footer={
          <div className="flex gap-3 px-4">
            <Button
              variant="outline"
              onClick={() => setSelectedTermsModal(null)}
              className="flex-1"
            >
              닫기
            </Button>
          </div>
        }
      >
        <div className="p-4">
          <div className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
            {selectedTermsModal === 'electronicFinance' ? ELECTRONIC_FINANCE_TERMS : PRIVACY_DELEGATION_TERMS}
          </div>
        </div>
      </SlideSheet>

      {/* 재고 수정 시트 (Admin only) */}
      {product.source === 'collaboration' && isAdmin && (
        <SlideSheet
          isOpen={isStockEditSheetOpen}
          onClose={() => {
            setIsStockEditSheetOpen(false);
            setStockValue('');
          }}
          title="재고 수정"
          footer={
            <div className="flex gap-3 px-4">
              <Button
                variant="outline"
                onClick={() => {
                  setIsStockEditSheetOpen(false);
                  setStockValue('');
                }}
                className="flex-1"
                disabled={isUpdatingStock}
              >
                취소
              </Button>
              <Button
                onClick={async () => {
                  const newStock = parseInt(stockValue, 10);
                  if (isNaN(newStock) || newStock < 0) {
                    alert('유효한 재고 수량을 입력해주세요.');
                    return;
                  }

                  setIsUpdatingStock(true);
                  try {
                    const response = await storeCollaborationApi.updateStock(product.product_id, {
                      stock: newStock,
                    });

                    if (response.success) {
                      alert('재고가 업데이트되었습니다.');
                      // 상품 정보 새로고침
                      const refreshResponse = await storeProductsApi.getDetail(product.product_id);
                      if (refreshResponse.success && refreshResponse.data) {
                        setProduct(refreshResponse.data as StoreProduct);
                      }
                      setIsStockEditSheetOpen(false);
                      setStockValue('');
                    } else {
                      alert(response.error?.message || '재고 업데이트에 실패했습니다.');
                    }
                  } catch (err: any) {
                    alert(err.message || '재고 업데이트에 실패했습니다.');
                  } finally {
                    setIsUpdatingStock(false);
                  }
                }}
                disabled={isUpdatingStock || !stockValue.trim()}
                className="flex-1 bg-[#FE3A8F] text-white"
              >
                {isUpdatingStock ? '처리 중...' : '저장'}
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <Typography variant="body2" className="text-gray-600 mb-2">
                상품 정보
              </Typography>
              <Typography variant="body1" className="font-medium mb-1">
                {product.name}
              </Typography>
              <Typography variant="body2" className="text-gray-500">
                현재 재고: {product.stock !== null ? `${product.stock}개` : '무제한'}
              </Typography>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                재고 수량 *
              </label>
              <Input
                type="number"
                value={stockValue}
                onChange={(e) => setStockValue(e.target.value)}
                placeholder="재고 수량을 입력하세요"
                className="w-full"
                min="0"
              />
            </div>

            <div className="p-3 bg-yellow-50 rounded-lg">
              <Typography variant="caption" className="text-yellow-700">
                ⚠️ 협업 상품의 재고는 관리자만 수정할 수 있습니다.
              </Typography>
            </div>
          </div>
        </SlideSheet>
      )}

      {/* 배송지 추가/수정 시트 */}
      <SlideSheet
        isOpen={isAddAddressSheetOpen}
        onClose={() => {
          setIsAddAddressSheetOpen(false);
          setEditingAddress(null);
          setNewAddressForm({ name: '', phone: '', address: '', address_detail: '', postal_code: '', is_default: false });
        }}
        title={editingAddress ? '배송지 수정' : '새 배송지 추가'}
        initialHeight={0.7}
        minHeight={0.5}
        maxHeight={0.9}
        zIndex={99999}
        footer={
          <div className="flex gap-3 px-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setIsAddAddressSheetOpen(false);
                setEditingAddress(null);
                setNewAddressForm({ name: '', phone: '', address: '', address_detail: '', postal_code: '', is_default: false });
              }}
            >
              취소
            </Button>
            <Button
              className="flex-1 !bg-[#FE3A8F] !text-white"
              onClick={editingAddress ? handleUpdateAddress : handleAddAddress}
              disabled={isSavingAddress}
            >
              {isSavingAddress ? <Loader2 className="h-4 w-4 animate-spin" /> : (editingAddress ? '수정' : '저장')}
            </Button>
          </div>
        }
      >
        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">받는 분 *</label>
            <Input
              value={newAddressForm.name}
              onChange={(e) => setNewAddressForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="이름 입력"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">연락처 *</label>
            <Input
              value={newAddressForm.phone}
              onChange={(e) => setNewAddressForm(prev => ({ ...prev, phone: e.target.value.replace(/[^0-9]/g, '') }))}
              placeholder="01012345678"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">우편번호 *</label>
            <Input
              value={newAddressForm.postal_code}
              onChange={(e) => setNewAddressForm(prev => ({ ...prev, postal_code: e.target.value }))}
              placeholder="12345"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">주소 *</label>
            <Input
              value={newAddressForm.address}
              onChange={(e) => setNewAddressForm(prev => ({ ...prev, address: e.target.value }))}
              placeholder="기본 주소"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">상세주소</label>
            <Input
              value={newAddressForm.address_detail}
              onChange={(e) => setNewAddressForm(prev => ({ ...prev, address_detail: e.target.value }))}
              placeholder="동/호수 등"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={newAddressForm.is_default}
              onChange={(e) => setNewAddressForm(prev => ({ ...prev, is_default: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300 text-[#FE3A8F] focus:ring-[#FE3A8F]"
            />
            <span className="text-sm text-gray-700">기본 배송지로 설정</span>
          </label>
        </div>
      </SlideSheet>

      {/* 주소 검색 모달 */}
      {isAddressModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl w-[90%] max-w-md h-[70vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <Typography variant="h6" className="font-semibold">주소 검색</Typography>
              <button
                onClick={() => setIsAddressModalOpen(false)}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                ✕
              </button>
            </div>
            <div id="daum-postcode-container" className="flex-1" />
          </div>
        </div>
      )}
    </div>
  );
}

