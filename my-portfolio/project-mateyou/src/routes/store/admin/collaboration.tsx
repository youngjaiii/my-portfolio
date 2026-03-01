import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect, useCallback } from 'react';
import { Loader2, Package, CheckCircle, XCircle, Truck, ShoppingBag, Edit, ChevronRight, ChevronLeft, User, Plus, X, ImagePlus, CalendarDays, RefreshCcw, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import { useAuth } from '@/hooks/useAuth';
import { storeCollaborationApi, type CollaborationStats, type CollaborationProduct, type ShipmentRequest, type CollaborationProductRequest, type OrderFulfillment } from '@/api/store/collaboration';
import { storeRefundsApi } from '@/api/store/refunds';
import { storeOrdersApi } from '@/api/store/orders';
import { Typography, Button, SlideSheet, Input, StoreLoadingState, StoreEmptyState } from '@/components';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import { edgeApi } from '@/lib/edgeApi';
import { toast } from 'sonner';
import { ProductOptionEditor } from '@/components/features/store/ProductOptionEditor';
import { LocationPickerSheet, type LocationResult } from '@/components/ui/LocationPickerSheet';
import { MapPin } from 'lucide-react';
import type { ProductOptionInput } from '@/api/store/products';
import ReactCalendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { ScheduleTimeSlotSelector, CALENDAR_STYLES } from '@/components/ui/ScheduleTimeSlotSelector';

export const Route = createFileRoute('/store/admin/collaboration')({
  component: AdminCollaborationPage,
});

type TabType = 'products' | 'orders' | 'requests' | 'refunds';
type ProductTypeFilter = 'all' | 'delivery' | 'digital' | 'on_site';
type ShipmentStatusFilter = 'all' | 'pending' | 'approved' | 'shipped' | 'rejected';
// RequestStatusFilter 제거됨 - 상품이 바로 등록되므로 상태 필터 불필요
type AdminRefundStatus = 'all' | 'requested' | 'completed' | 'rejected';

const PRODUCT_TYPE_LABEL: Record<string, string> = {
  delivery: '택배 배송',
  digital: '디지털',
  on_site: '현장 수령',
};

const SHIPMENT_STATUS_LABEL: Record<string, string> = {
  pending: '대기 중',
  approved: '승인됨',
  shipped: '출고 완료',
  rejected: '거절됨',
};

const SHIPMENT_STATUS_COLOR: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-green-100 text-green-700',
  shipped: 'bg-blue-100 text-blue-700',
  rejected: 'bg-red-100 text-red-700',
};

const REQUEST_STATUS_LABEL: Record<string, string> = {
  pending: '대기 중',
  accepted: '수락됨',
  rejected: '거절됨',
};

const REQUEST_STATUS_COLOR: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

const ADMIN_REFUND_STATUS_LABEL: Record<string, string> = {
  requested: '대기 중',
  completed: '환불 완료',
  rejected: '거절됨',
};

const ADMIN_REFUND_STATUS_COLOR: Record<string, string> = {
  requested: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
};

interface AdminRefund {
  refund_id: string;
  order_id: string;
  refund_amount: number;
  reason?: string;
  status: 'requested' | 'completed' | 'rejected';
  rejection_reason?: string;
  created_at: string;
  processed_date?: string;
  order?: {
    order_id: string;
    order_number: string;
    total_amount: number;
    status: string;
    quantity: number;
    shipping_fee?: number;
    product?: {
      product_id: string;
      name: string;
      thumbnail_url?: string;
      product_type: string;
      source?: string;
      partner?: {
        id: string;
        partner_name: string;
      };
    };
    buyer?: {
      id: string;
      name: string;
      profile_image?: string;
      member_code?: string;
    };
  };
}

const getCourierCode = (courier: string): string | null => {
  const courierMap: Record<string, string> = {
    'CJ대한통운': 'cj',
    'CJ': 'cj',
    '한진택배': 'hanjin',
    '한진': 'hanjin',
    '롯데택배': 'lotte',
    '롯데': 'lotte',
    '우체국택배': 'epost',
    '우체국': 'epost',
    '로젠택배': 'logen',
    '로젠': 'logen',
  };
  return courierMap[courier] || null;
};

function AdminCollaborationPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin, isLoading: isAdminLoading } = useAdminGuard();

  const [activeTab, setActiveTab] = useState<TabType>('products');
  const [stats, setStats] = useState<CollaborationStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  // 상품 관리 상태
  const [products, setProducts] = useState<CollaborationProduct[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [productTypeFilter, setProductTypeFilter] = useState<ProductTypeFilter>('all');
  const [productPage, setProductPage] = useState(1);
  const [productTotalPages, setProductTotalPages] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState<CollaborationProduct | null>(null);
  const [isStockSheetOpen, setIsStockSheetOpen] = useState(false);
  const [newStock, setNewStock] = useState('');
  const [isUpdatingStock, setIsUpdatingStock] = useState(false);
  const [productViewMode, setProductViewMode] = useState<'product' | 'partner'>('product');
  const [partnerList, setPartnerList] = useState<any[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [selectedPartnerName, setSelectedPartnerName] = useState<string>('');
  const [isLoadingPartnerList, setIsLoadingPartnerList] = useState(false);
  const [partnerListSearchQuery, setPartnerListSearchQuery] = useState('');
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [partnerSortKey, setPartnerSortKey] = useState<'rate' | 'name' | 'partner_applied_at'>('name');
  const [partnerSortOrder, setPartnerSortOrder] = useState<'asc' | 'desc'>('asc');
  const [isPartnerSortOpen, setIsPartnerSortOpen] = useState(false);
  const [partnerListPage, setPartnerListPage] = useState(1);
  const [partnerListHasMore, setPartnerListHasMore] = useState(true);
  const [isLoadingMorePartners, setIsLoadingMorePartners] = useState(false);
  
  // 상품 상세 상태
  const [isProductDetailOpen, setIsProductDetailOpen] = useState(false);
  const [productDetail, setProductDetail] = useState<any>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [distributionRate, setDistributionRate] = useState<number | null>(null);
  
  // 상품 수정 상태
  const [isEditMode, setIsEditMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editProductType, setEditProductType] = useState<'delivery' | 'digital' | 'on_site'>('delivery');
  const [editStock, setEditStock] = useState('');
  const [editShippingFeeBase, setEditShippingFeeBase] = useState('');
  const [editShippingFeeRemote, setEditShippingFeeRemote] = useState('');
  const [editIsBundleAvailable, setEditIsBundleAvailable] = useState(false);
  const [editThumbnail, setEditThumbnail] = useState<File | null>(null);
  const [editImages, setEditImages] = useState<File[]>([]);
  const [existingImages, setExistingImages] = useState<Array<{ image_id: string; image_url: string; display_order: number }>>([]);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [editDigitalAssets, setEditDigitalAssets] = useState<File[]>([]);
  const [existingDigitalAssets, setExistingDigitalAssets] = useState<Array<{ asset_id: string; asset_url: string; file_name: string }>>([]);
  const [isTogglingActive, setIsTogglingActive] = useState(false);
  
  // 정산율/배분율 수정 팝업 상태
  const [isRateEditOpen, setIsRateEditOpen] = useState(false);
  const [editingPartnerRate, setEditingPartnerRate] = useState<any>(null);
  const [editRateValue, setEditRateValue] = useState('');
  const [editShareRateValue, setEditShareRateValue] = useState('');
  const [isUpdatingPartnerRate, setIsUpdatingPartnerRate] = useState(false);
  
  // 출고 요청 상세 팝업 상태
  const [isShipmentDetailOpen, setIsShipmentDetailOpen] = useState(false);
  const [selectedShipmentForDetail, setSelectedShipmentForDetail] = useState<ShipmentRequest | null>(null);
  
  // 이행완료 정보 상태
  const [orderFulfillments, setOrderFulfillments] = useState<OrderFulfillment[]>([]);
  const [isFulfillmentLoading, setIsFulfillmentLoading] = useState(false);
  
  // 배송 추적 상태
  const [isLoadingDeliveryEvents, setIsLoadingDeliveryEvents] = useState(false);
  const [deliveryEvents, setDeliveryEvents] = useState<any[] | null>(null);
  const [isDeliveryTrackingExpanded, setIsDeliveryTrackingExpanded] = useState(false);

  // 출고 요청 상태
  const [shipmentRequests, setShipmentRequests] = useState<ShipmentRequest[]>([]);
  const [isLoadingShipments, setIsLoadingShipments] = useState(false);
  const [shipmentStatusFilter, setShipmentStatusFilter] = useState<ShipmentStatusFilter>('pending');
  const [shipmentPage, setShipmentPage] = useState(1);
  const [shipmentTotalPages, setShipmentTotalPages] = useState(1);
  const [selectedShipment, setSelectedShipment] = useState<ShipmentRequest | null>(null);
  const [isShipmentSheetOpen, setIsShipmentSheetOpen] = useState(false);
  const [shipmentAction, setShipmentAction] = useState<'approve' | 'reject'>('approve');
  const [courier, setCourier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [selectedPickupDate, setSelectedPickupDate] = useState<Date | null>(null);
  const [selectedPickupTimeSlot, setSelectedPickupTimeSlot] = useState<string | null>(null);
  const [isProcessingShipment, setIsProcessingShipment] = useState(false);
  const [shipmentRequestedFrom, setShipmentRequestedFrom] = useState<string>('');
  const [shipmentRequestedTo, setShipmentRequestedTo] = useState<string>('');

  // 협업 요청 상태
  const [productRequests, setProductRequests] = useState<CollaborationProductRequest[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  // 상태 필터 제거됨 - 상품이 바로 등록되므로 모든 요청이 accepted 상태
  const [requestPage, setRequestPage] = useState(1);
  const [requestTotalPages, setRequestTotalPages] = useState(1);
  const [requestCreatedFrom, setRequestCreatedFrom] = useState<string>('');
  const [requestCreatedTo, setRequestCreatedTo] = useState<string>('');
  const [selectedRequest, setSelectedRequest] = useState<CollaborationProductRequest | null>(null);
  const [isRequestDetailOpen, setIsRequestDetailOpen] = useState(false);

  // 환불 관리 상태
  const [adminRefunds, setAdminRefunds] = useState<AdminRefund[]>([]);
  const [isLoadingRefunds, setIsLoadingRefunds] = useState(false);
  const [adminRefundStatus, setAdminRefundStatus] = useState<AdminRefundStatus>('requested');
  const [refundPage, setRefundPage] = useState(1);
  const [refundTotalPages, setRefundTotalPages] = useState(1);
  const [selectedAdminRefund, setSelectedAdminRefund] = useState<AdminRefund | null>(null);
  const [isRefundDetailOpen, setIsRefundDetailOpen] = useState(false);
  const [isProcessingRefund, setIsProcessingRefund] = useState(false);
  const [refundRejectionReason, setRefundRejectionReason] = useState('');
  const [refundRequestedFrom, setRefundRequestedFrom] = useState<string>('');
  const [refundRequestedTo, setRefundRequestedTo] = useState<string>('');

  // 협업 요청 생성 상태
  const [isCreateRequestOpen, setIsCreateRequestOpen] = useState(false);
  const [unassignedProducts, setUnassignedProducts] = useState<any[]>([]);
  const [isLoadingUnassigned, setIsLoadingUnassigned] = useState(false);
  const [selectedProductForRequest, setSelectedProductForRequest] = useState<any>(null);
  const [partners, setPartners] = useState<any[]>([]);
  const [isLoadingPartners, setIsLoadingPartners] = useState(false);
  const [partnerSearchQuery, setPartnerSearchQuery] = useState('');
  const [selectedPartners, setSelectedPartners] = useState<any[]>([]);
  const [isShareRateEnabled, setIsShareRateEnabled] = useState(false);
  const [isCreatingRequest, setIsCreatingRequest] = useState(false);

  // 상품 생성 상태
  const [isProductCreateOpen, setIsProductCreateOpen] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductType, setNewProductType] = useState<'delivery' | 'digital' | 'on_site'>('delivery');
  const [newProductDescription, setNewProductDescription] = useState('');
  const [newProductStock, setNewProductStock] = useState('');
  const [newProductShippingFeeBase, setNewProductShippingFeeBase] = useState('');
  const [newProductShippingFeeRemote, setNewProductShippingFeeRemote] = useState('');
  const [newProductIsBundleAvailable, setNewProductIsBundleAvailable] = useState(false);
  const [newProductThumbnail, setNewProductThumbnail] = useState<File | null>(null);
  const [newProductImages, setNewProductImages] = useState<File[]>([]);
  const [newProductDigitalAssets, setNewProductDigitalAssets] = useState<File[]>([]);
  const [newProductOptions, setNewProductOptions] = useState<ProductOptionInput[]>([]);
  const [newProductPickupLocation, setNewProductPickupLocation] = useState('');
  const [newProductPickupLocationPoint, setNewProductPickupLocationPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocationPickerOpen, setIsLocationPickerOpen] = useState(false);
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);

  // 헤더 상품 추가 버튼 이벤트 리스너
  useEffect(() => {
    const handleOpenProductCreate = () => {
      setIsProductCreateOpen(true);
    };
    window.addEventListener('openCollaborationProductCreate', handleOpenProductCreate);
    return () => {
      window.removeEventListener('openCollaborationProductCreate', handleOpenProductCreate);
    };
  }, []);

  // 통계 로드 (최초 1회만)
  useEffect(() => {
    if (!user?.id || isAdminLoading || !isAdmin) return;

    let cancelled = false;
    const fetchStats = async () => {
      setIsLoadingStats(true);
      try {
        const response = await storeCollaborationApi.getStats();
        if (!cancelled && response.success && response.data) {
          setStats(response.data as CollaborationStats);
        }
      } catch (err) {
        console.error('통계 로드 실패:', err);
      } finally {
        if (!cancelled) setIsLoadingStats(false);
      }
    };

    fetchStats();
    return () => { cancelled = true; };
  }, [user?.id, isAdmin, isAdminLoading]);

  // 파트너 목록 로드 (파트너별 뷰용)
  const fetchPartnerList = useCallback(async (page: number = 1, reset: boolean = false, searchQuery?: string) => {
    if (!isAdmin) return;
    
    if (page === 1) {
      setIsLoadingPartnerList(true);
    } else {
      setIsLoadingMorePartners(true);
    }
    
    try {
      const sortByMap: Record<string, string> = {
        'rate': 'default_distribution_rate',
        'name': 'partner_name',
        'partner_applied_at': 'partner_applied_at',
      };
      
      const params: any = { 
        page, 
        limit: 20,
        sort_by: sortByMap[partnerSortKey],
        sort_order: partnerSortOrder,
      };
      
      const query = searchQuery ?? partnerListSearchQuery;
      if (query.trim()) {
        params.partner_name = query.trim();
      }
      
      const response = await storeCollaborationApi.getPartnersWithRates(params);
      
      if (response.success && response.data) {
        const newData = Array.isArray(response.data) ? response.data : [];
        if (page === 1 || reset) {
          setPartnerList(newData);
        } else {
          setPartnerList(prev => [...prev, ...newData]);
        }
        setPartnerListHasMore(newData.length >= 20);
        setPartnerListPage(page);
      }
    } catch (err) {
      console.error('파트너 목록 로드 실패:', err);
    } finally {
      setIsLoadingPartnerList(false);
      setIsLoadingMorePartners(false);
    }
  }, [isAdmin, partnerSortKey, partnerSortOrder, partnerListSearchQuery]);

  // 상품 목록 로드
  const fetchProducts = useCallback(async () => {
    if (!isAdmin) return;
    
    setIsLoadingProducts(true);
    try {
      let response;
      
      // 상품별 뷰에서 검색어가 있으면 검색 API 사용
      if (productViewMode === 'product' && productSearchQuery.trim()) {
        const searchParams: any = {
          keyword: productSearchQuery.trim(),
          page: productPage,
          limit: 20,
        };
        if (productTypeFilter !== 'all') {
          searchParams.product_type = productTypeFilter;
        }
        response = await storeCollaborationApi.adminSearchProducts(searchParams);
      } else {
        // 기존 로직
        const params: any = { page: productPage, limit: 20 };
        if (productTypeFilter !== 'all') {
          params.product_type = productTypeFilter;
        }
        if (productViewMode === 'partner' && selectedPartnerId) {
          params.partner_id = selectedPartnerId;
        }
        response = await storeCollaborationApi.getProducts(params);
      }
      
      if (response.success && response.data) {
        let productList = Array.isArray(response.data) ? response.data : [];
        
        // 파트너별 뷰일 경우 응답 구조가 다름 (product가 중첩됨)
        if (productViewMode === 'partner' && selectedPartnerId && productList.length > 0) {
          // 응답이 { request_id, status, distribution_rate, product: {...} } 형태인지 확인
          if (productList[0].product && productList[0].request_id) {
            productList = productList.map((item: any) => ({
              ...item.product,
              // 협업 요청 정보 추가
              collaboration_request_id: item.request_id,
              collaboration_status: item.status,
              collaboration_distribution_rate: item.distribution_rate,
              collaboration_rate_info: item.rate_info,
            }));
          }
        }
        
        setProducts(productList);
        const meta = (response as any).meta;
        const pagination = (response as any).pagination;
        if (meta) {
          setProductTotalPages(meta.totalPages || 1);
        } else if (pagination) {
          setProductTotalPages(pagination.totalPages || 1);
        }
      }
    } catch (err) {
      console.error('상품 목록 로드 실패:', err);
    } finally {
      setIsLoadingProducts(false);
    }
  }, [isAdmin, productPage, productTypeFilter, productViewMode, selectedPartnerId, productSearchQuery]);

  // 출고 요청 목록 로드
  const fetchShipmentRequests = useCallback(async () => {
    if (!isAdmin) return;

    setIsLoadingShipments(true);
    try {
      const params: any = { page: shipmentPage, limit: 20 };
      if (shipmentStatusFilter !== 'all') {
        params.status = shipmentStatusFilter;
      }
      if (shipmentRequestedFrom) {
        params.requested_from = new Date(shipmentRequestedFrom).toISOString();
      }
      if (shipmentRequestedTo) {
        params.requested_to = new Date(shipmentRequestedTo + 'T23:59:59').toISOString();
      }
      const response = await storeCollaborationApi.getShipmentRequestsAdmin(params);
      if (response.success && response.data) {
        setShipmentRequests(Array.isArray(response.data) ? response.data : []);
        const pagination = (response as any).pagination;
        if (pagination) {
          setShipmentTotalPages(pagination.totalPages || 1);
        }
      }
    } catch (err) {
      console.error('출고 요청 목록 로드 실패:', err);
    } finally {
      setIsLoadingShipments(false);
    }
  }, [isAdmin, shipmentPage, shipmentStatusFilter, shipmentRequestedFrom, shipmentRequestedTo]);

  // 협업 요청 목록 로드
  const fetchProductRequests = useCallback(async () => {
    if (!isAdmin) return;

    setIsLoadingRequests(true);
    try {
      const params: any = { page: requestPage, limit: 20 };
      // 상태 필터 제거 - 상품이 바로 등록되므로 모든 요청이 accepted 상태
      if (requestCreatedFrom) {
        params.requested_from = new Date(requestCreatedFrom).toISOString();
      }
      if (requestCreatedTo) {
        params.requested_to = new Date(requestCreatedTo + 'T23:59:59').toISOString();
      }
      const response = await storeCollaborationApi.getProductRequestsAdmin(params);
      if (response.success && response.data) {
        setProductRequests(Array.isArray(response.data) ? response.data : []);
        const pagination = (response as any).pagination;
        if (pagination) {
          setRequestTotalPages(pagination.totalPages || 1);
        }
      }
    } catch (err) {
      console.error('협업 요청 목록 로드 실패:', err);
    } finally {
      setIsLoadingRequests(false);
    }
  }, [isAdmin, requestPage, requestCreatedFrom, requestCreatedTo]);

  // 환불 요청 목록 로드
  const fetchAdminRefunds = useCallback(async () => {
    if (!isAdmin) return;

    setIsLoadingRefunds(true);
    try {
      const params: any = { page: refundPage, limit: 20 };
      if (adminRefundStatus !== 'all') {
        params.status = adminRefundStatus;
      }
      if (refundRequestedFrom) {
        params.requested_from = new Date(refundRequestedFrom).toISOString();
      }
      if (refundRequestedTo) {
        params.requested_to = new Date(refundRequestedTo + 'T23:59:59').toISOString();
      }
      const response = await storeRefundsApi.getAdminList(params);
      if (response.success && response.data) {
        setAdminRefunds(Array.isArray(response.data) ? response.data : []);
        const pagination = (response as any).pagination;
        if (pagination) {
          setRefundTotalPages(pagination.totalPages || 1);
        }
      }
    } catch (err) {
      console.error('환불 요청 목록 로드 실패:', err);
    } finally {
      setIsLoadingRefunds(false);
    }
  }, [isAdmin, refundPage, adminRefundStatus, refundRequestedFrom, refundRequestedTo]);

  // 협업 상품 목록 로드
  const fetchCollaborationProducts = useCallback(async () => {
    setIsLoadingUnassigned(true);
    try {
      const response = await storeCollaborationApi.getProducts({ page: 1, limit: 100 });
      if (response.success && response.data) {
        setUnassignedProducts(Array.isArray(response.data) ? response.data : []);
      }
    } catch (err) {
      console.error('협업 상품 목록 로드 실패:', err);
    } finally {
      setIsLoadingUnassigned(false);
    }
  }, []);

  // 파트너 목록 (배분 비율 포함)
  const fetchPartners = useCallback(async () => {
    setIsLoadingPartners(true);
    try {
      const response = await storeCollaborationApi.getPartnersWithRates({ page: 1, limit: 100 });
      if (response.success && response.data) {
        setPartners(Array.isArray(response.data) ? response.data : []);
      }
    } catch (err) {
      console.error('파트너 목록 로드 실패:', err);
    } finally {
      setIsLoadingPartners(false);
    }
  }, []);

  // 파트너 선택 시 기본 배분율 설정
  const handleSelectPartner = (partner: any) => {
    if (isShareRateEnabled) {
      const currentTotal = selectedPartners.reduce((sum, p) => sum + (p.share_rate || 0), 0);
      const remainingRate = Math.max(0, 100 - currentTotal);
      setSelectedPartners([
        ...selectedPartners,
        {
          ...partner,
          share_rate: remainingRate,
          collaboration_distribution_rate: partner.collaboration_distribution_rate ?? 100,
        },
      ]);
    } else {
      setSelectedPartners([
        ...selectedPartners,
        {
          ...partner,
          share_rate: null,
          collaboration_distribution_rate: partner.collaboration_distribution_rate ?? 100,
        },
      ]);
    }
  };

  // 파트너별 배분율 변경
  const handlePartnerRateChange = (partnerId: string, rate: number) => {
    setSelectedPartners(
      selectedPartners.map((p) =>
        p.id === partnerId ? { ...p, share_rate: rate } : p
      )
    );
  };

  // 파트너별 정산율 변경
  const handlePartnerDistributionRateChange = (partnerId: string, rate: number) => {
    setSelectedPartners(
      selectedPartners.map((p) =>
        p.id === partnerId ? { ...p, collaboration_distribution_rate: rate } : p
      )
    );
  };

  // 배분율 합계 계산
  const getTotalShareRate = () => {
    return selectedPartners.reduce((sum, p) => sum + (p.share_rate || 0), 0);
  };

  // 협업 요청 생성
  const handleCreateRequest = async () => {
    if (!selectedProductForRequest || selectedPartners.length === 0) {
      toast.error('상품과 파트너를 선택해주세요.');
      return;
    }

    if (isShareRateEnabled) {
      for (const partner of selectedPartners) {
        const rate = partner.share_rate;
        if (isNaN(rate) || rate < 0 || rate > 100) {
          toast.error(`${partner.partner_name}의 배분율이 올바르지 않습니다. (0~100)`);
          return;
        }
      }
      const totalShareRate = getTotalShareRate();
      if (totalShareRate !== 100) {
        toast.error(`모든 파트너의 배분율 합계는 100%여야 합니다. 현재: ${totalShareRate}%`);
        return;
      }
    }

    setIsCreatingRequest(true);
    try {
      const response = await storeCollaborationApi.sendRequests({
        product_id: selectedProductForRequest.product_id,
        partners: selectedPartners.map((p) => ({
          partner_id: p.id,
          share_rate: isShareRateEnabled ? p.share_rate : null,
          distribution_rate: p.collaboration_distribution_rate,
        })),
      });

      if (response.success) {
        const result = response.data as any;
        // API 응답 형식에 따라 처리
        const message = result?.message || `${selectedPartners.length}명의 파트너에게 협업 등록을 완료했습니다.`;
        toast.success(message);
        setIsCreateRequestOpen(false);
        setSelectedProductForRequest(null);
        setSelectedPartners([]);
        fetchProductRequests();
      } else {
        toast.error((response.error as any)?.message || '협업 등록에 실패했습니다.');
      }
    } catch (err: any) {
      toast.error(err.message || '협업 등록에 실패했습니다.');
    } finally {
      setIsCreatingRequest(false);
    }
  };

  // 협업 요청 생성 시트 열기
  const openCreateRequestSheet = () => {
    setIsCreateRequestOpen(true);
    fetchCollaborationProducts();
    fetchPartners();
  };

  // 상품 생성
  const handleCreateProduct = async () => {
    if (!newProductName.trim()) {
      toast.error('상품명을 입력해주세요.');
      return;
    }
    const price = parseInt(newProductPrice);
    if (isNaN(price) || price < 0) {
      toast.error('올바른 가격을 입력해주세요.');
      return;
    }
    if (!newProductThumbnail) {
      toast.error('썸네일 이미지를 선택해주세요.');
      return;
    }

    setIsCreatingProduct(true);
    try {
      const formData = new FormData();
      formData.append('name', newProductName.trim());
      formData.append('price', price.toString());
      formData.append('product_type', newProductType);
      formData.append('description', newProductDescription);
      formData.append('is_collaboration', 'true');
      // 재고 (배송/현장 수령 상품인 경우) - 옵션 재고 자동계산
      if (newProductType === 'delivery' || newProductType === 'on_site') {
        const optionStockSum = newProductOptions.reduce((sum, opt) => {
          if (opt.values) {
            return sum + opt.values.reduce((vSum, v: any) => vSum + (v.stock ?? 0), 0);
          }
          return sum;
        }, 0);
        const hasOptionStock = newProductOptions.some((opt) =>
          opt.values?.some((v: any) => v.stock !== undefined && v.stock !== null && v.stock > 0)
        );
        const stockToSave = hasOptionStock ? optionStockSum.toString() : newProductStock;
        if (stockToSave) {
          formData.append('stock', stockToSave);
        }
      }
      // 택배비 (배송 상품인 경우)
      if (newProductType === 'delivery') {
        if (newProductShippingFeeBase) {
          formData.append('shipping_fee_base', newProductShippingFeeBase);
        }
        if (newProductShippingFeeRemote) {
          formData.append('shipping_fee_remote', newProductShippingFeeRemote);
        }
        formData.append('is_bundle_available', newProductIsBundleAvailable.toString());
      }
      formData.append('thumbnail', newProductThumbnail);
      newProductImages.forEach((img) => {
        formData.append('images[]', img);
      });
      // 디지털 자산 (디지털 상품인 경우)
      if (newProductType === 'digital') {
        newProductDigitalAssets.forEach((asset) => {
          formData.append('digital_assets[]', asset);
        });
      }
      // 상품 옵션 (배송/현장 수령 상품인 경우)
      if ((newProductType === 'delivery' || newProductType === 'on_site') && newProductOptions.length > 0) {
        formData.append('options', JSON.stringify(newProductOptions));
      }
      // 수령 장소 (현장수령 상품)
      if (newProductType === 'on_site' && newProductPickupLocation) {
        formData.append('pickup_location', newProductPickupLocation);
        if (newProductPickupLocationPoint) {
          formData.append('pickup_location_point', JSON.stringify(newProductPickupLocationPoint));
        }
      }

      const response = await edgeApi.storeProducts.create(formData);
      if (response.success) {
        toast.success('상품이 등록되었습니다.');
        resetProductCreateForm();
        setIsProductCreateOpen(false);
        fetchProducts();
      } else {
        toast.error((response.error as any)?.message || '상품 등록에 실패했습니다.');
      }
    } catch (err: any) {
      toast.error(err.message || '상품 등록에 실패했습니다.');
    } finally {
      setIsCreatingProduct(false);
    }
  };

  const resetProductCreateForm = () => {
    setNewProductName('');
    setNewProductPrice('');
    setNewProductType('delivery');
    setNewProductDescription('');
    setNewProductStock('');
    setNewProductShippingFeeBase('');
    setNewProductShippingFeeRemote('');
    setNewProductThumbnail(null);
    setNewProductImages([]);
    setNewProductDigitalAssets([]);
    setNewProductOptions([]);
    setNewProductPickupLocation('');
    setNewProductPickupLocationPoint(null);
  };

  // 상품 활성화/비활성화 토글
  const handleToggleActive = async () => {
    if (!selectedProduct) return;
    
    setIsTogglingActive(true);
    try {
      const currentIsActive = (productDetail as any)?.is_active !== false;
      const formData = new FormData();
      formData.append('is_active', String(!currentIsActive));
      
      const response = await edgeApi.storeProducts.update(selectedProduct.product_id, formData);
      if (response.success) {
        toast.success(currentIsActive ? '상품이 비활성화되었습니다.' : '상품이 활성화되었습니다.');
        fetchProducts();
        const detailRes = await storeCollaborationApi.getProductDetail(selectedProduct.product_id);
        if (detailRes.success && detailRes.data) {
          setProductDetail(detailRes.data);
        }
      } else {
        toast.error(response.error?.message || '상태 변경에 실패했습니다.');
      }
    } catch (err: any) {
      toast.error(err.message || '상태 변경에 실패했습니다.');
    } finally {
      setIsTogglingActive(false);
    }
  };

  // 파트너 정산율/배분율 수정
  const handleUpdatePartnerRate = async () => {
    if (!editingPartnerRate || !selectedProduct) return;
    
    const rate = parseInt(editRateValue);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      toast.error('정산율은 0~100 사이여야 합니다.');
      return;
    }
    
    const shareRate = editShareRateValue ? parseInt(editShareRateValue) : undefined;
    if (shareRate !== undefined && (isNaN(shareRate) || shareRate < 0 || shareRate > 100)) {
      toast.error('배분율은 0~100 사이여야 합니다.');
      return;
    }
    
    const partnerId = editingPartnerRate.partner_id || editingPartnerRate.partner?.id;
    if (!partnerId) {
      toast.error('파트너 정보를 찾을 수 없습니다.');
      return;
    }
    
    setIsUpdatingPartnerRate(true);
    try {
      const response = await storeCollaborationApi.updateDistributionRate(
        selectedProduct.product_id,
        partnerId,
        rate,
        shareRate
      );
      if (response.success) {
        toast.success('정산율/배분율이 수정되었습니다.');
        setIsRateEditOpen(false);
        setEditingPartnerRate(null);
        setEditRateValue('');
        setEditShareRateValue('');
        const detailRes = await storeCollaborationApi.getProductDetail(selectedProduct.product_id);
        if (detailRes.success && detailRes.data) {
          setProductDetail(detailRes.data);
        }
      } else {
        toast.error(response.error?.message || '수정에 실패했습니다.');
      }
    } catch (err: any) {
      toast.error(err.message || '수정에 실패했습니다.');
    } finally {
      setIsUpdatingPartnerRate(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'products') fetchProducts();
  }, [activeTab, fetchProducts]);

  useEffect(() => {
    if (activeTab === 'products' && productViewMode === 'partner') {
      setPartnerListPage(1);
      setPartnerListHasMore(true);
      fetchPartnerList(1, true);
    }
  }, [activeTab, productViewMode, partnerSortKey, partnerSortOrder]);

  // 파트너 검색 debounce
  useEffect(() => {
    if (activeTab !== 'products' || productViewMode !== 'partner') return;
    
    const timer = setTimeout(() => {
      setPartnerListPage(1);
      setPartnerListHasMore(true);
      fetchPartnerList(1, true, partnerListSearchQuery);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [partnerListSearchQuery]);

  useEffect(() => {
    if (activeTab === 'orders') fetchShipmentRequests();
  }, [activeTab, fetchShipmentRequests]);

  useEffect(() => {
    if (activeTab === 'requests') fetchProductRequests();
  }, [activeTab, fetchProductRequests]);

  useEffect(() => {
    if (activeTab === 'refunds') fetchAdminRefunds();
  }, [activeTab, fetchAdminRefunds]);

  // 상품 상세 로드
  const handleProductClick = async (product: CollaborationProduct) => {
    setSelectedProduct(product);
    setIsProductDetailOpen(true);
    setIsLoadingDetail(true);
    setProductDetail(null);
    setDistributionRate(null);
    setIsEditMode(false);
    
    try {
      // 먼저 상품 상세 조회
      const detailRes = await storeCollaborationApi.getProductDetail(product.product_id);
      
      if (detailRes.success && detailRes.data) {
        setProductDetail(detailRes.data);
        const detail = detailRes.data as any;
        setEditName(detail.name || product.name);
        setEditPrice(detail.price?.toString() || product.price.toString());
        setEditDescription(detail.description || '');
        // 상품 유형 매핑
        const productType = detail.product_type || product.product_type;
        if (productType === 'on_site') {
          setEditProductType('on_site');
        } else if (productType === 'digital' || productType === 'digital_photo') {
          setEditProductType('digital');
        } else {
          setEditProductType('delivery');
        }
        // 재고
        setEditStock(detail.stock?.toString() || '');
        // 택배비
        setEditShippingFeeBase(detail.shipping_fee_base?.toString() || '');
        setEditShippingFeeRemote(detail.shipping_fee_remote?.toString() || '');
        setEditIsBundleAvailable(detail.is_bundle_available || false);
        setExistingImages(detail.images || []);
        setEditThumbnail(null);
        setEditImages([]);
        // 디지털 자산
        setExistingDigitalAssets(detail.digital_assets || []);
        setEditDigitalAssets([]);
        
        // collaboration_partners가 있으면 배분 비율 조회 스킵
        const hasCollaborationPartners = detail.collaboration_partners && detail.collaboration_partners.length > 0;
        
        if (!hasCollaborationPartners) {
          const rateRes = await storeCollaborationApi.getDistributionRate(product.product_id);
          if (rateRes.success && rateRes.data) {
            const resData = rateRes.data as any;
            if (resData.collaboration_requests?.length > 0) {
              setDistributionRate(resData.collaboration_requests[0].distribution_rate ?? 70);
            } else if (resData.distribution_rate != null) {
              setDistributionRate(resData.distribution_rate);
            }
          }
        }
      }
    } catch (err) {
      console.error('상품 상세 로드 실패:', err);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  // 상품 수정 저장
  const handleSaveProduct = async () => {
    if (!selectedProduct) return;

    if (!editName.trim()) {
      toast.error('상품명을 입력해주세요.');
      return;
    }

    const priceValue = parseInt(editPrice);
    if (isNaN(priceValue) || priceValue < 0) {
      toast.error('올바른 가격을 입력해주세요.');
      return;
    }

    setIsSavingProduct(true);
    try {
      const formData = new FormData();
      formData.append('name', editName.trim());
      formData.append('price', priceValue.toString());
      formData.append('description', editDescription);
      formData.append('product_type', editProductType);
      
      // 재고 (digital 제외)
      if (editProductType !== 'digital' && editStock) {
        formData.append('stock', editStock);
      }
      // 배송 상품 택배비
      if (editProductType === 'delivery') {
        if (editShippingFeeBase) {
          formData.append('shipping_fee_base', editShippingFeeBase);
        }
        if (editShippingFeeRemote) {
          formData.append('shipping_fee_remote', editShippingFeeRemote);
        }
        formData.append('is_bundle_available', editIsBundleAvailable.toString());
      }

      // 썸네일 추가
      if (editThumbnail) {
        formData.append('thumbnail', editThumbnail);
      }

      // 새 이미지 추가
      editImages.forEach((image) => {
        formData.append('images[]', image);
      });

      // 기존 이미지 ID 유지
      existingImages.forEach((img) => {
        formData.append('existing_image_ids', img.image_id);
      });

      // 디지털 자산 (디지털 상품인 경우)
      if (editProductType === 'digital') {
        editDigitalAssets.forEach((asset) => {
          formData.append('digital_assets[]', asset);
        });
        existingDigitalAssets.forEach((asset) => {
          formData.append('existing_asset_ids', asset.asset_id);
        });
      }

      const response = await edgeApi.storeProducts.update(selectedProduct.product_id, formData);
      if (response.success) {
        toast.success('상품이 수정되었습니다.');
        setIsEditMode(false);
        setEditThumbnail(null);
        setEditImages([]);
        // 상세 정보 새로고침
        const detailRes = await storeCollaborationApi.getProductDetail(selectedProduct.product_id);
        if (detailRes.success && detailRes.data) {
          const detail = detailRes.data as any;
          setProductDetail(detail);
          setExistingImages(detail.images || []);
        }
        // 목록 새로고침
        fetchProducts();
      } else {
        toast.error(response.error?.message || '상품 수정에 실패했습니다.');
      }
    } catch (err: any) {
      toast.error(err.message || '상품 수정에 실패했습니다.');
    } finally {
      setIsSavingProduct(false);
    }
  };


  // 재고 수정
  const handleUpdateStock = async () => {
    if (!selectedProduct) return;

    const stockValue = parseInt(newStock);
    if (isNaN(stockValue) || stockValue < 0) {
      toast.error('올바른 재고 수량을 입력해주세요.');
      return;
    }

    setIsUpdatingStock(true);
    try {
      const response = await storeCollaborationApi.updateStock(selectedProduct.product_id, { stock: stockValue });
      if (response.success) {
        toast.success('재고가 수정되었습니다.');
        setIsStockSheetOpen(false);
        setNewStock('');
        fetchProducts();
        // 상품 상세가 열려있으면 상세 정보도 새로고침
        if (isProductDetailOpen) {
          const detailRes = await storeCollaborationApi.getProductDetail(selectedProduct.product_id);
          if (detailRes.success && detailRes.data) {
            setProductDetail(detailRes.data);
          }
        }
      } else {
        toast.error(response.error?.message || '재고 수정에 실패했습니다.');
      }
    } catch (err: any) {
      toast.error(err.message || '재고 수정에 실패했습니다.');
    } finally {
      setIsUpdatingStock(false);
    }
  };

  // 출고 요청 처리
  const handleShipmentRespond = async () => {
    if (!selectedShipment) return;
    const shipmentOrderItem = (selectedShipment as any)?.order?.order_items?.[0];
    const isOnSiteShipment = shipmentOrderItem?.product_type === 'on_site' || selectedShipment.product?.product_type === 'on_site';

    if (shipmentAction === 'approve') {
      if (isOnSiteShipment && (!selectedPickupDate || !selectedPickupTimeSlot)) {
        toast.error('수령 날짜와 시간을 선택해주세요.');
        return;
      }
      if (!isOnSiteShipment && (!courier.trim() || !trackingNumber.trim())) {
        toast.error('택배사와 송장번호를 모두 입력해주세요.');
        return;
      }
    }

    setIsProcessingShipment(true);
    try {
      const data: any = {
        status: shipmentAction === 'approve' ? 'approved' : 'rejected',
      };
      if (shipmentAction === 'approve') {
        if (isOnSiteShipment) {
          const y = selectedPickupDate!.getFullYear();
          const m = String(selectedPickupDate!.getMonth() + 1).padStart(2, '0');
          const d = String(selectedPickupDate!.getDate()).padStart(2, '0');
          data.pickup_date = `${y}-${m}-${d}`;
          data.pickup_time = selectedPickupTimeSlot;
        } else {
          data.courier = courier.trim();
          data.tracking_number = trackingNumber.trim();
        }
      }
      const response = await storeCollaborationApi.respondShipmentRequest(selectedShipment.request_id, data);

      if (response.success) {
        toast.success(shipmentAction === 'approve' 
          ? (isOnSiteShipment ? '수령 일정이 컨펌되었습니다.' : '출고 요청이 승인되었습니다.')
          : '출고 요청이 거절되었습니다.');
        setIsShipmentSheetOpen(false);
        setCourier('');
        setTrackingNumber('');
        setRejectionReason('');
        setSelectedPickupDate(null);
        setSelectedPickupTimeSlot(null);
        setSelectedShipment(null);
        fetchShipmentRequests();
        
        // 통계 새로고침
        const statsResponse = await storeCollaborationApi.getStats();
        if (statsResponse.success && statsResponse.data) {
          setStats(statsResponse.data as CollaborationStats);
        }
      } else {
        toast.error(response.error?.message || '처리에 실패했습니다.');
      }
    } catch (err: any) {
      toast.error(err.message || '처리에 실패했습니다.');
    } finally {
      setIsProcessingShipment(false);
    }
  };

  const formatPrice = (price: number | null | undefined) => (price ?? 0).toLocaleString('ko-KR') + 'P';
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getDateRange = (preset: string) => {
    const today = new Date();
    const toDate = today.toISOString().split('T')[0];
    let fromDate = toDate;

    switch (preset) {
      case 'today':
        fromDate = toDate;
        break;
      case '1month':
        const oneMonth = new Date(today);
        oneMonth.setMonth(oneMonth.getMonth() - 1);
        fromDate = oneMonth.toISOString().split('T')[0];
        break;
      case '6months':
        const sixMonths = new Date(today);
        sixMonths.setMonth(sixMonths.getMonth() - 6);
        fromDate = sixMonths.toISOString().split('T')[0];
        break;
      case '1year':
        const oneYear = new Date(today);
        oneYear.setFullYear(oneYear.getFullYear() - 1);
        fromDate = oneYear.toISOString().split('T')[0];
        break;
    }
    return { fromDate, toDate };
  };

  const getDateLabel = (from: string, to: string) => {
    if (!from && !to) return '기간 선택';
    if (from && to && from === to) {
      const date = new Date(from);
      const today = new Date().toISOString().split('T')[0];
      if (from === today) return '오늘';
      return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
    }
    if (from && to) {
      return `${new Date(from).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })} ~ ${new Date(to).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}`;
    }
    return '기간 선택';
  };

  if (isAdminLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#FE3A8F]" />
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="bg-gray-50 pt-16 pb-4">
      {/* 통계 카드 */}
      {!isLoadingStats && stats && (
        <div className="p-4 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => navigate({ to: '/store/admin/insights' })}
            className="bg-white rounded-xl p-4 shadow-sm text-left hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-2 mb-2">
              <ShoppingBag className="h-4 w-4 text-[#FE3A8F]" />
              <Typography variant="caption" className="text-gray-500">협업 상품</Typography>
            </div>
            <Typography variant="h5" className="font-bold">{stats.total_collaboration_products}</Typography>
          </button>
          <button
            type="button"
            onClick={() => navigate({ to: '/store/admin/insights' })}
            className="bg-white rounded-xl p-4 shadow-sm text-left hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-2 mb-2">
              <Package className="h-4 w-4 text-yellow-500" />
              <Typography variant="caption" className="text-gray-500">대기 중 출고</Typography>
            </div>
            <Typography variant="h5" className="font-bold text-yellow-600">{stats.pending_shipment_requests}</Typography>
          </button>
          <button
            type="button"
            onClick={() => navigate({ to: '/store/admin/insights' })}
            className="bg-white rounded-xl p-4 shadow-sm text-left hover:shadow-md transition-shadow"
          >
            <div className="flex items-center gap-2 mb-2">
              <Truck className="h-4 w-4 text-green-500" />
              <Typography variant="caption" className="text-gray-500">이번 달 출고</Typography>
            </div>
            <Typography variant="h5" className="font-bold text-green-600">{stats.shipped_this_month}</Typography>
          </button>
        </div>
      )}

      {/* 탭 */}
      <div className="px-4 pb-4">
        <div className="flex gap-2 bg-gray-100 p-1 rounded-full">
          {[
            { key: 'products', label: '상품' },
            { key: 'orders', label: '출고' },
            { key: 'requests', label: '협업' },
            { key: 'refunds', label: '환불' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as TabType)}
              className={`flex-1 py-2 px-3 rounded-full font-medium transition-all text-sm ${
                activeTab === tab.key
                  ? 'bg-white text-[#FE3A8F] shadow-sm'
                  : 'text-gray-500'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 상품 관리 탭 */}
      {activeTab === 'products' && (
        <div className="px-4">
          {/* 필터 + 뷰 스위치 */}
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide flex-1">
              {[
                { key: 'all', label: '전체' },
                { key: 'delivery', label: '택배 배송' },
                { key: 'digital', label: '디지털' },
                { key: 'on_site', label: '현장 수령' },
              ].map((filter) => (
                <button
                  key={filter.key}
                  onClick={() => {
                    setProductTypeFilter(filter.key as ProductTypeFilter);
                    setProductPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    productTypeFilter === filter.key
                      ? 'bg-[#FE3A8F] text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            {/* 상품별/파트너별 스위치 */}
            <div className="flex bg-gray-100 rounded-lg p-0.5 flex-shrink-0">
              <button
                onClick={() => {
                  setProductViewMode('product');
                  setSelectedPartnerId(null);
                  setProductPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  productViewMode === 'product'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500'
                }`}
              >
                상품별
              </button>
              <button
                onClick={() => {
                  setProductViewMode('partner');
                  setProductPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  productViewMode === 'partner'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500'
                }`}
              >
                파트너별
              </button>
            </div>
          </div>

          {/* 상품별 뷰 - 검색 */}
          {productViewMode === 'product' && (
            <div className="mb-4">
              <div className="relative">
                <Input
                  value={productSearchQuery}
                  onChange={(e) => {
                    setProductSearchQuery(e.target.value);
                    setProductPage(1);
                  }}
                  placeholder="상품명 검색..."
                  className="w-full pr-8"
                />
                {productSearchQuery && (
                  <button
                    onClick={() => {
                      setProductSearchQuery('');
                      setProductPage(1);
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
                  >
                    <X className="h-4 w-4 text-gray-400" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 파트너별 뷰 */}
          {productViewMode === 'partner' && !selectedPartnerId && (
            <div className="mb-4">
              {/* 파트너 검색 및 정렬 */}
              <div className="flex gap-2 mb-3">
                <div className="flex-1 min-w-0">
                  <Input
                    value={partnerListSearchQuery}
                    onChange={(e) => setPartnerListSearchQuery(e.target.value)}
                    placeholder="파트너 이름 검색..."
                    className="w-full"
                  />
                </div>
                <Popover open={isPartnerSortOpen} onOpenChange={setIsPartnerSortOpen}>
                  <PopoverTrigger asChild>
                    <button className="flex items-center gap-1 px-3 py-2 bg-white border rounded-lg hover:bg-gray-50 transition-colors flex-shrink-0">
                      <ArrowUpDown className="h-4 w-4 text-gray-500" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-1" align="end">
                    <div className="space-y-1">
                      <button
                        onClick={() => {
                          if (partnerSortKey === 'rate') {
                            setPartnerSortOrder(partnerSortOrder === 'asc' ? 'desc' : 'asc');
                          } else {
                            setPartnerSortKey('rate');
                            setPartnerSortOrder('desc');
                          }
                          setIsPartnerSortOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md hover:bg-gray-100 ${partnerSortKey === 'rate' ? 'bg-gray-100' : ''}`}
                      >
                        <span>배분율</span>
                        {partnerSortKey === 'rate' && (
                          partnerSortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        onClick={() => {
                          if (partnerSortKey === 'name') {
                            setPartnerSortOrder(partnerSortOrder === 'asc' ? 'desc' : 'asc');
                          } else {
                            setPartnerSortKey('name');
                            setPartnerSortOrder('asc');
                          }
                          setIsPartnerSortOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md hover:bg-gray-100 ${partnerSortKey === 'name' ? 'bg-gray-100' : ''}`}
                      >
                        <span>이름</span>
                        {partnerSortKey === 'name' && (
                          partnerSortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                        )}
                      </button>
                      <button
                        onClick={() => {
                          if (partnerSortKey === 'partner_applied_at') {
                            setPartnerSortOrder(partnerSortOrder === 'asc' ? 'desc' : 'asc');
                          } else {
                            setPartnerSortKey('partner_applied_at');
                            setPartnerSortOrder('desc');
                          }
                          setIsPartnerSortOpen(false);
                        }}
                        className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-md hover:bg-gray-100 ${partnerSortKey === 'partner_applied_at' ? 'bg-gray-100' : ''}`}
                      >
                        <span>가입일</span>
                        {partnerSortKey === 'partner_applied_at' && (
                          partnerSortOrder === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              
              {isLoadingPartnerList ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : partnerList.length === 0 ? (
                <StoreEmptyState message="파트너가 없습니다" />
              ) : (
                <div 
                  className="space-y-2 max-h-[60vh] overflow-y-auto"
                  onScroll={(e) => {
                    const target = e.target as HTMLDivElement;
                    if (
                      target.scrollHeight - target.scrollTop <= target.clientHeight + 100 &&
                      partnerListHasMore &&
                      !isLoadingMorePartners
                    ) {
                      fetchPartnerList(partnerListPage + 1);
                    }
                  }}
                >
                  {partnerList.map((partner) => (
                      <button
                        key={partner.id}
                        onClick={() => {
                          setSelectedPartnerId(partner.id);
                          setSelectedPartnerName(partner.partner_name);
                          setProductPage(1);
                        }}
                        className="w-full flex items-center gap-3 p-4 bg-white rounded-xl border hover:border-[#FE3A8F]/50 hover:shadow-sm transition-all text-left"
                      >
                        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {partner.profile_image ? (
                            <img src={partner.profile_image} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <User className="h-6 w-6 text-gray-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <Typography variant="body1" className="font-medium">
                            {partner.partner_name}
                          </Typography>
                          <Typography variant="caption" className="text-gray-500">
                            기본 배분율: {partner.default_distribution_rate ?? 70}%
                          </Typography>
                        </div>
                        <ChevronRight className="h-5 w-5 text-gray-300 flex-shrink-0" />
                      </button>
                    ))}
                  {isLoadingMorePartners && (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 선택된 파트너 헤더 */}
          {productViewMode === 'partner' && selectedPartnerId && (
            <div className="mb-4">
              <button
                onClick={() => {
                  setSelectedPartnerId(null);
                  setSelectedPartnerName('');
                  setProducts([]);
                }}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-3"
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="text-sm">파트너 목록으로</span>
              </button>
              <div className="p-3 bg-[#FE3A8F]/10 rounded-xl border border-[#FE3A8F]/20">
                <Typography variant="body2" className="font-medium text-[#FE3A8F]">
                  {selectedPartnerName}의 협업 상품
                </Typography>
              </div>
            </div>
          )}

          {/* 상품 목록 (상품별 뷰 또는 파트너 선택 후) */}
          {(productViewMode === 'product' || selectedPartnerId) && (
            <>
              {isLoadingProducts ? (
                <StoreLoadingState />
              ) : products.length === 0 ? (
                <StoreEmptyState message={productViewMode === 'partner' ? '해당 파트너의 협업 상품이 없습니다' : '협업 상품이 없습니다'} />
              ) : (
                <>
                  <div className="space-y-3">
                    {products.map((product: any) => (
                      <div
                        key={product.product_id || product.collaboration_request_id}
                        onClick={() => handleProductClick(product)}
                        className="bg-white rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                      >
                        <div className="flex gap-3">
                          {product.thumbnail_url ? (
                            <img
                              src={product.thumbnail_url}
                              alt={product.name}
                              className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                              <ShoppingBag className="h-6 w-6 text-gray-400" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Typography variant="body2" className="font-medium truncate">
                                {product.name}
                              </Typography>
                              {/* 파트너별 뷰: 협업 상태 표시 */}
                              {productViewMode === 'partner' && product.collaboration_status && (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                  product.collaboration_status === 'accepted' ? 'bg-green-100 text-green-700' :
                                  product.collaboration_status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                                  product.collaboration_status === 'rejected' ? 'bg-red-100 text-red-700' :
                                  'bg-gray-100 text-gray-700'
                                }`}>
                                  {product.collaboration_status === 'accepted' ? '수락' :
                                   product.collaboration_status === 'pending' ? '대기' :
                                   product.collaboration_status === 'rejected' ? '거절' : product.collaboration_status}
                                </span>
                              )}
                            </div>
                            <Typography variant="caption" className="text-gray-500">
                              {PRODUCT_TYPE_LABEL[product.product_type] || product.product_type}
                            </Typography>
                            <div className="flex items-center gap-2 mt-1">
                              <Typography variant="body2" className="font-semibold text-[#FE3A8F]">
                                {formatPrice(product.price)}
                              </Typography>
                              {product.product_type !== 'digital' && (
                                <span className={`text-xs px-2 py-0.5 rounded ${
                                  (product.stock ?? 0) === 0 
                                    ? 'bg-pink-100 text-pink-600' 
                                    : 'bg-gray-100 text-gray-600'
                                }`}>
                                  {(product.stock ?? 0) === 0 ? '품절' : `재고: ${product.stock}`}
                                </span>
                              )}
                              {/* 파트너별 뷰: 배분율 표시 */}
                              {productViewMode === 'partner' && product.collaboration_distribution_rate !== undefined && (
                                <span className="text-xs px-2 py-0.5 rounded bg-pink-100 text-[#FE3A8F]">
                                  배분율: {product.collaboration_distribution_rate}%
                                </span>
                              )}
                            </div>
                            {product.partner && productViewMode !== 'partner' && (
                              <div className="flex items-center gap-1 mt-1">
                                <User className="h-3 w-3 text-gray-400" />
                                <Typography variant="caption" className="text-gray-500">
                                  {product.partner.partner_name}
                                </Typography>
                              </div>
                            )}
                          </div>
                          <ChevronRight className="h-5 w-5 text-gray-300 flex-shrink-0 self-center" />
                        </div>
                      </div>
                    ))}
                  </div>

                  {productTotalPages > 1 && (
                    <div className="flex justify-center gap-2 mt-6">
                      <Button
                        variant="outline"
                        onClick={() => setProductPage((p) => Math.max(1, p - 1))}
                        disabled={productPage === 1}
                      >
                        이전
                      </Button>
                      <Typography variant="body2" className="flex items-center px-4">
                        {productPage} / {productTotalPages}
                      </Typography>
                      <Button
                        variant="outline"
                        onClick={() => setProductPage((p) => Math.min(productTotalPages, p + 1))}
                        disabled={productPage === productTotalPages}
                      >
                        다음
                      </Button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* 출고 관리 탭 */}
      {activeTab === 'orders' && (
        <div className="px-4">
          {/* 필터 */}
          <div className="flex items-center gap-2 mb-4">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide flex-1">
              {[
                { key: 'all', label: '전체' },
                { key: 'pending', label: '대기 중' },
                { key: 'shipped', label: '출고 완료' },
                { key: 'rejected', label: '거절됨' },
              ].map((filter) => (
                <button
                  key={filter.key}
                  onClick={() => {
                    setShipmentStatusFilter(filter.key as ShipmentStatusFilter);
                    setShipmentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    shipmentStatusFilter === filter.key
                      ? 'bg-[#FE3A8F] text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {/* 날짜 필터 */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="flex-shrink-0 gap-1">
                  <CalendarDays className="h-4 w-4" />
                  <span className="hidden sm:inline">{getDateLabel(shipmentRequestedFrom, shipmentRequestedTo)}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <div className="flex gap-2 p-2 border-b">
                  {(['1month', '6months', '1year'] as const).map((preset) => {
                    const { fromDate, toDate } = getDateRange(preset);
                    const isActive = shipmentRequestedFrom === fromDate && shipmentRequestedTo === toDate;
                    const label = preset === '1month' ? '1개월' : preset === '6months' ? '6개월' : '1년';
                    return (
                      <Button key={preset} variant={isActive ? "default" : "outline"} size="sm" onClick={() => {
                        if (isActive) {
                          setShipmentRequestedFrom('');
                          setShipmentRequestedTo('');
                        } else {
                          setShipmentRequestedFrom(fromDate);
                          setShipmentRequestedTo(toDate);
                        }
                        setShipmentPage(1);
                      }}>{label}</Button>
                    );
                  })}
                  <Button variant="outline" size="sm" onClick={() => {
                    setShipmentRequestedFrom('');
                    setShipmentRequestedTo('');
                    setShipmentPage(1);
                  }} className={`px-1 ${!(shipmentRequestedFrom || shipmentRequestedTo) ? 'invisible' : ''}`}><RefreshCcw className="h-3 w-3" /></Button>
                </div>
                <CalendarComponent
                  mode="range"
                  locale={ko}
                  selected={{
                    from: shipmentRequestedFrom ? new Date(shipmentRequestedFrom) : undefined,
                    to: shipmentRequestedTo ? new Date(shipmentRequestedTo) : undefined,
                  }}
                  onSelect={(range: DateRange | undefined) => {
                    setShipmentRequestedFrom(range?.from ? format(range.from, 'yyyy-MM-dd') : '');
                    setShipmentRequestedTo(range?.to ? format(range.to, 'yyyy-MM-dd') : '');
                    setShipmentPage(1);
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>

          {isLoadingShipments ? (
            <StoreLoadingState />
          ) : shipmentRequests.length === 0 ? (
            <StoreEmptyState message="출고 요청이 없습니다" />
          ) : (
            <>
              <div className="space-y-3">
                {shipmentRequests.map((request) => (
                  <button
                    key={request.request_id}
                    type="button"
                    onClick={async () => {
                      setSelectedShipmentForDetail(request);
                      setOrderFulfillments([]);
                      setIsShipmentDetailOpen(true);
                      
                      // 상세 정보 조회
                      try {
                        const detailResponse = await storeCollaborationApi.getShipmentRequestDetail(request.request_id);
                        if (detailResponse.success && detailResponse.data) {
                          setSelectedShipmentForDetail(detailResponse.data as ShipmentRequest);
                        }
                      } catch (error) {
                        console.error('출고 요청 상세 조회 실패:', error);
                      }
                      
                      // 이행완료 조회
                      if ((request as any).order_id) {
                        setIsFulfillmentLoading(true);
                        try {
                          const response = await storeCollaborationApi.getFulfillment((request as any).order_id);
                          if (response.success && response.data) {
                            const data = response.data as { fulfillments?: OrderFulfillment[] };
                            setOrderFulfillments(data.fulfillments || []);
                          }
                        } catch (error) {
                          console.error('이행완료 조회 실패:', error);
                        } finally {
                          setIsFulfillmentLoading(false);
                        }
                      }
                    }}
                    className="w-full bg-white rounded-xl p-4 shadow-sm text-left hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <Typography variant="caption" className="text-gray-500 mb-1 block">
                          {formatDate(request.created_at)}
                        </Typography>
                        {request.product && (
                          <Typography variant="body2" className="font-medium mb-1">
                            {request.product.name}
                          </Typography>
                        )}
                        {request.order && (
                          <Typography variant="caption" className="text-gray-600 block">
                            주문번호: {request.order.order_number}
                          </Typography>
                        )}
                        {/* 구매자 정보 */}
                        {(request as any).order?.buyer && (
                          <div className="flex items-center gap-1 mt-1">
                            <User className="h-3 w-3 text-blue-400" />
                            <Typography variant="caption" className="text-blue-600">
                              구매자: {(request as any).order.buyer.name || (request as any).order.buyer.username}
                            </Typography>
                          </div>
                        )}
                        {request.partner && (
                          <div className="flex items-center gap-1 mt-1">
                            <User className="h-3 w-3 text-gray-400" />
                            <Typography variant="caption" className="text-gray-500">
                              파트너: {request.partner.partner_name}
                            </Typography>
                          </div>
                        )}
                      </div>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${SHIPMENT_STATUS_COLOR[request.status]}`}>
                        {SHIPMENT_STATUS_LABEL[request.status]}
                      </span>
                    </div>

                    {request.courier && request.tracking_number && (
                      <div className="pt-3 border-t border-gray-200 mb-3">
                        <div className="flex items-center gap-2 text-sm">
                          <Truck className="h-4 w-4 text-gray-400" />
                          <span className="text-gray-600">{request.courier}</span>
                          <span className="text-gray-400">•</span>
                          <span className="text-gray-600">{request.tracking_number}</span>
                        </div>
                      </div>
                    )}

                    {request.status === 'pending' && (
                      <div className="pt-3 border-t border-gray-200">
                        <Typography variant="caption" className="text-[#FE3A8F]">
                          클릭하여 상세 보기 →
                        </Typography>
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {shipmentTotalPages > 1 && (
                <div className="flex justify-center gap-2 mt-6">
                  <Button
                    variant="outline"
                    onClick={() => setShipmentPage((p) => Math.max(1, p - 1))}
                    disabled={shipmentPage === 1}
                  >
                    이전
                  </Button>
                  <Typography variant="body2" className="flex items-center px-4">
                    {shipmentPage} / {shipmentTotalPages}
                  </Typography>
                  <Button
                    variant="outline"
                    onClick={() => setShipmentPage((p) => Math.min(shipmentTotalPages, p + 1))}
                    disabled={shipmentPage === shipmentTotalPages}
                  >
                    다음
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 협업 요청 탭 */}
      {activeTab === 'requests' && (
        <div className="px-4">
          {/* 헤더 */}
          <div className="flex items-center justify-between mb-4">
            <Typography variant="body2" className="text-gray-600">파트너에게 협업 상품 할당</Typography>
            <Button
              size="sm"
              onClick={openCreateRequestSheet}
              className="bg-[#FE3A8F] text-white"
            >
              <Plus className="h-4 w-4 mr-1" />
              협업 등록
            </Button>
          </div>

          {/* 필터 - 날짜만 유지 (상태 필터는 상품이 바로 등록되므로 제거) */}
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1" />
            {/* 날짜 필터 */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="flex-shrink-0 gap-1">
                  <CalendarDays className="h-4 w-4" />
                  <span className="hidden sm:inline">{getDateLabel(requestCreatedFrom, requestCreatedTo)}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <div className="flex gap-2 p-2 border-b">
                  {(['1month', '6months', '1year'] as const).map((preset) => {
                    const { fromDate, toDate } = getDateRange(preset);
                    const isActive = requestCreatedFrom === fromDate && requestCreatedTo === toDate;
                    const label = preset === '1month' ? '1개월' : preset === '6months' ? '6개월' : '1년';
                    return (
                      <Button key={preset} variant={isActive ? "default" : "outline"} size="sm" onClick={() => {
                        if (isActive) {
                          setRequestCreatedFrom('');
                          setRequestCreatedTo('');
                        } else {
                          setRequestCreatedFrom(fromDate);
                          setRequestCreatedTo(toDate);
                        }
                        setRequestPage(1);
                      }}>{label}</Button>
                    );
                  })}
                  <Button variant="outline" size="sm" onClick={() => {
                    setRequestCreatedFrom('');
                    setRequestCreatedTo('');
                    setRequestPage(1);
                  }} className={`px-1 ${!(requestCreatedFrom || requestCreatedTo) ? 'invisible' : ''}`}><RefreshCcw className="h-3 w-3" /></Button>
                </div>
                <CalendarComponent
                  mode="range"
                  locale={ko}
                  selected={{
                    from: requestCreatedFrom ? new Date(requestCreatedFrom) : undefined,
                    to: requestCreatedTo ? new Date(requestCreatedTo) : undefined,
                  }}
                  onSelect={(range: DateRange | undefined) => {
                    setRequestCreatedFrom(range?.from ? format(range.from, 'yyyy-MM-dd') : '');
                    setRequestCreatedTo(range?.to ? format(range.to, 'yyyy-MM-dd') : '');
                    setRequestPage(1);
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>

          {isLoadingRequests ? (
            <StoreLoadingState />
          ) : productRequests.length === 0 ? (
            <StoreEmptyState message="협업 요청이 없습니다" />
          ) : (
            <>
              <div className="space-y-3">
                {productRequests.map((request) => (
                  <button
                    key={request.request_id}
                    onClick={() => {
                      setSelectedRequest(request);
                      setIsRequestDetailOpen(true);
                    }}
                    className="w-full bg-white rounded-xl p-4 shadow-sm text-left hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <Typography variant="caption" className="text-gray-500 mb-1 block">
                          {formatDate(request.created_at)}
                        </Typography>
                        {request.product && (
                          <>
                            <Typography variant="body2" className="font-medium mb-1">
                              {request.product.name}
                            </Typography>
                            <Typography variant="caption" className="text-gray-600">
                              {PRODUCT_TYPE_LABEL[request.product.product_type]} • {formatPrice(request.product.price)}
                            </Typography>
                          </>
                        )}
                        {request.partner && (
                          <div className="flex items-center gap-1 mt-1">
                            <User className="h-3 w-3 text-gray-400" />
                            <Typography variant="caption" className="text-gray-500">
                              {request.partner.partner_name}
                            </Typography>
                          </div>
                        )}
                        {request.distribution_rate !== undefined && (
                          <Typography variant="caption" className="text-purple-600 mt-1 block">
                            배분율: {request.distribution_rate}%
                          </Typography>
                        )}
                      </div>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${REQUEST_STATUS_COLOR[request.status]}`}>
                        {REQUEST_STATUS_LABEL[request.status]}
                      </span>
                    </div>

                    {request.status === 'rejected' && request.rejection_reason && (
                      <div className="pt-3 border-t border-gray-200">
                        <Typography variant="caption" className="text-red-600">
                          거절 사유: {request.rejection_reason}
                        </Typography>
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {requestTotalPages > 1 && (
                <div className="flex justify-center gap-2 mt-6">
                  <Button
                    variant="outline"
                    onClick={() => setRequestPage((p) => Math.max(1, p - 1))}
                    disabled={requestPage === 1}
                  >
                    이전
                  </Button>
                  <Typography variant="body2" className="flex items-center px-4">
                    {requestPage} / {requestTotalPages}
                  </Typography>
                  <Button
                    variant="outline"
                    onClick={() => setRequestPage((p) => Math.min(requestTotalPages, p + 1))}
                    disabled={requestPage === requestTotalPages}
                  >
                    다음
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 환불 요청 탭 */}
      {activeTab === 'refunds' && (
        <div className="px-4">
          {/* 필터 */}
          <div className="flex items-center gap-2 mb-4">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide flex-1">
              {[
                { key: 'all', label: '전체' },
                { key: 'requested', label: '대기 중' },
                { key: 'completed', label: '환불 완료' },
                { key: 'rejected', label: '거절됨' },
              ].map((filter) => (
                <button
                  key={filter.key}
                  onClick={() => {
                    setAdminRefundStatus(filter.key as AdminRefundStatus);
                    setRefundPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    adminRefundStatus === filter.key
                      ? 'bg-[#FE3A8F] text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {/* 날짜 필터 */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="flex-shrink-0 gap-1">
                  <CalendarDays className="h-4 w-4" />
                  <span className="hidden sm:inline">{getDateLabel(refundRequestedFrom, refundRequestedTo)}</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <div className="flex gap-2 p-2 border-b">
                  {(['1month', '6months', '1year'] as const).map((preset) => {
                    const { fromDate, toDate } = getDateRange(preset);
                    const isActive = refundRequestedFrom === fromDate && refundRequestedTo === toDate;
                    const label = preset === '1month' ? '1개월' : preset === '6months' ? '6개월' : '1년';
                    return (
                      <Button key={preset} variant={isActive ? "default" : "outline"} size="sm" onClick={() => {
                        if (isActive) {
                          setRefundRequestedFrom('');
                          setRefundRequestedTo('');
                        } else {
                          setRefundRequestedFrom(fromDate);
                          setRefundRequestedTo(toDate);
                        }
                        setRefundPage(1);
                      }}>{label}</Button>
                    );
                  })}
                  <Button variant="outline" size="sm" onClick={() => {
                    setRefundRequestedFrom('');
                    setRefundRequestedTo('');
                    setRefundPage(1);
                  }} className={`px-1 ${!(refundRequestedFrom || refundRequestedTo) ? 'invisible' : ''}`}><RefreshCcw className="h-3 w-3" /></Button>
                </div>
                <CalendarComponent
                  mode="range"
                  locale={ko}
                  selected={{
                    from: refundRequestedFrom ? new Date(refundRequestedFrom) : undefined,
                    to: refundRequestedTo ? new Date(refundRequestedTo) : undefined,
                  }}
                  onSelect={(range: DateRange | undefined) => {
                    setRefundRequestedFrom(range?.from ? format(range.from, 'yyyy-MM-dd') : '');
                    setRefundRequestedTo(range?.to ? format(range.to, 'yyyy-MM-dd') : '');
                    setRefundPage(1);
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>

          {isLoadingRefunds ? (
            <StoreLoadingState />
          ) : adminRefunds.length === 0 ? (
            <StoreEmptyState
              message="환불 요청이 없습니다"
              description={adminRefundStatus === 'all' ? '협업 상품에 대한 환불 요청이 없습니다' : `${ADMIN_REFUND_STATUS_LABEL[adminRefundStatus] || ''} 상태의 환불 요청이 없습니다`}
            />
          ) : (
            <>
              <div className="space-y-3">
                {adminRefunds.map((refund) => (
                  <div
                    key={refund.refund_id}
                    onClick={() => {
                      setSelectedAdminRefund(refund);
                      setIsRefundDetailOpen(true);
                      setRefundRejectionReason('');
                    }}
                    className="bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                  >
                    <div className="flex gap-3">
                      {refund.order?.product?.thumbnail_url && (
                        <img
                          src={refund.order.product.thumbnail_url}
                          alt={refund.order.product?.name}
                          className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Typography variant="body2" className="font-medium truncate">
                              {refund.order?.product?.name}
                            </Typography>
                            <Typography variant="caption" className="text-gray-500">
                              {refund.order?.order_number}
                            </Typography>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded-full flex-shrink-0 ${ADMIN_REFUND_STATUS_COLOR[refund.status] || 'bg-gray-100'}`}>
                            {ADMIN_REFUND_STATUS_LABEL[refund.status] || refund.status}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {refund.order?.buyer?.profile_image ? (
                              <img src={refund.order.buyer.profile_image} alt="" className="w-5 h-5 rounded-full" />
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center">
                                <User className="w-3 h-3 text-gray-400" />
                              </div>
                            )}
                            <Typography variant="caption" className="text-gray-600">
                              {refund.order?.buyer?.name || '구매자'}
                            </Typography>
                          </div>
                          <Typography variant="body2" className="font-semibold text-[#FE3A8F]">
                            {refund.refund_amount?.toLocaleString()}P
                          </Typography>
                        </div>
                        {refund.order?.product?.partner && (
                          <Typography variant="caption" className="text-gray-400 mt-1 block">
                            파트너: {refund.order.product.partner.partner_name}
                          </Typography>
                        )}
                        <Typography variant="caption" className="text-gray-400 mt-1 block">
                          {new Date(refund.created_at).toLocaleDateString('ko-KR', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Typography>
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-300 flex-shrink-0 self-center" />
                    </div>
                  </div>
                ))}
              </div>

              {refundTotalPages > 1 && (
                <div className="flex justify-center gap-2 mt-6">
                  <Button
                    variant="outline"
                    onClick={() => setRefundPage((p) => Math.max(1, p - 1))}
                    disabled={refundPage === 1}
                  >
                    이전
                  </Button>
                  <Typography variant="body2" className="flex items-center px-4">
                    {refundPage} / {refundTotalPages}
                  </Typography>
                  <Button
                    variant="outline"
                    onClick={() => setRefundPage((p) => Math.min(refundTotalPages, p + 1))}
                    disabled={refundPage === refundTotalPages}
                  >
                    다음
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 재고 수정 Sheet */}
      <SlideSheet
        isOpen={isStockSheetOpen}
        onClose={() => {
          setIsStockSheetOpen(false);
          setNewStock('');
        }}
        title="재고 수정"
        footer={
          <div className="flex gap-3 px-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsStockSheetOpen(false);
                setNewStock('');
              }}
              className="flex-1"
              disabled={isUpdatingStock}
            >
              취소
            </Button>
            <Button
              onClick={handleUpdateStock}
              disabled={isUpdatingStock || !newStock}
              className="flex-1 bg-[#FE3A8F] text-white"
            >
              {isUpdatingStock ? '수정 중...' : '저장'}
            </Button>
          </div>
        }
      >
        {selectedProduct && (
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <Typography variant="body2" className="font-medium mb-1">
                {selectedProduct.name}
              </Typography>
              <Typography variant="caption" className="text-gray-500">
                현재 재고: {selectedProduct.stock ?? 0}
              </Typography>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                새 재고 수량 *
              </label>
              <Input
                type="number"
                value={newStock}
                onChange={(e) => setNewStock(e.target.value)}
                placeholder="재고 수량 입력"
                min="0"
                className="w-full"
              />
            </div>
          </div>
        )}
      </SlideSheet>

      {/* 출고 요청 처리 Sheet */}
      <SlideSheet
        isOpen={isShipmentSheetOpen}
        onClose={() => {
          setIsShipmentSheetOpen(false);
          setCourier('');
          setTrackingNumber('');
          setRejectionReason('');
          setSelectedPickupDate(null);
          setSelectedPickupTimeSlot(null);
          setSelectedShipment(null);
        }}
        title={(() => {
          const oi = (selectedShipment as any)?.order?.order_items?.[0];
          const isOnSite = oi?.product_type === 'on_site' || selectedShipment?.product?.product_type === 'on_site';
          return shipmentAction === 'approve' ? (isOnSite ? '수령 일정 컨펌' : '출고 요청 승인') : '출고 요청 거절';
        })()}
        footer={
          <div className="flex gap-3 px-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsShipmentSheetOpen(false);
                setCourier('');
                setTrackingNumber('');
                setRejectionReason('');
                setSelectedPickupDate(null);
                setSelectedPickupTimeSlot(null);
                setSelectedShipment(null);
              }}
              className="flex-1"
              disabled={isProcessingShipment}
            >
              취소
            </Button>
            <Button
              onClick={handleShipmentRespond}
              disabled={
                isProcessingShipment ||
                (() => {
                  const oi = (selectedShipment as any)?.order?.order_items?.[0];
                  const isOnSite = oi?.product_type === 'on_site' || selectedShipment?.product?.product_type === 'on_site';
                  return (shipmentAction === 'approve' && isOnSite && (!selectedPickupDate || !selectedPickupTimeSlot)) ||
                    (shipmentAction === 'approve' && !isOnSite && (!courier.trim() || !trackingNumber.trim()));
                })()
              }
              className={`flex-1 ${
                shipmentAction === 'approve' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-red-600 text-white'
              }`}
            >
              {(() => {
                if (isProcessingShipment) return '처리 중...';
                if (shipmentAction !== 'approve') return '거절';
                const oi = (selectedShipment as any)?.order?.order_items?.[0];
                const isOnSite = oi?.product_type === 'on_site' || selectedShipment?.product?.product_type === 'on_site';
                return isOnSite ? '일정 컨펌' : '승인';
              })()}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {selectedShipment && (() => {
            const _oi = (selectedShipment as any)?.order?.order_items?.[0];
            const isOnSiteShipment = _oi?.product_type === 'on_site' || selectedShipment.product?.product_type === 'on_site';
            return (
            <>
              <div className="p-4 bg-gray-50 rounded-lg">
                <Typography variant="body2" className="text-gray-600 mb-2">
                  {isOnSiteShipment ? '수령 확인 정보' : '출고 요청 정보'}
                </Typography>
                <Typography variant="body1" className="font-medium mb-1">
                  {selectedShipment.product?.name}
                </Typography>
                {selectedShipment.order && (
                  <Typography variant="body2" className="text-gray-500">
                    주문번호: {selectedShipment.order.order_number}
                  </Typography>
                )}
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 mt-1 inline-block">
                  {isOnSiteShipment ? '현장수령' : '택배'}
                </span>
              </div>

              {shipmentAction === 'approve' ? (
                isOnSiteShipment ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      수령 날짜 *
                    </label>
                    <div className="bg-white rounded-lg">
                      <ReactCalendar
                        onChange={(value) => {
                          if (value instanceof Date) {
                            setSelectedPickupDate(value);
                            setSelectedPickupTimeSlot(null);
                          } else if (Array.isArray(value) && value[0] instanceof Date) {
                            setSelectedPickupDate(value[0]);
                            setSelectedPickupTimeSlot(null);
                          }
                        }}
                        value={selectedPickupDate}
                        formatDay={(_locale, date) => date.getDate().toString()}
                        formatShortWeekday={(_locale, date) => {
                          const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
                          return weekdays[date.getDay()];
                        }}
                        formatMonthYear={(_locale, date) => {
                          return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
                        }}
                        className="!border-0 !w-full"
                        locale="ko-KR"
                        minDate={new Date()}
                      />
                      <style>{CALENDAR_STYLES}</style>
                    </div>
                  </div>
                  {selectedPickupDate && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        수령 시간 *
                      </label>
                      <ScheduleTimeSlotSelector
                        selectedDate={selectedPickupDate}
                        selectedTimeSlot={selectedPickupTimeSlot}
                        onSelect={(timeSlot) => setSelectedPickupTimeSlot(timeSlot)}
                      />
                    </div>
                  )}
                  <div className="p-3 bg-green-50 rounded-lg">
                    <Typography variant="caption" className="text-green-700">
                      컨펌 시 구매자에게 수령 일정이 안내되고 재고가 차감됩니다.
                    </Typography>
                  </div>
                </div>
                ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      택배사 *
                    </label>
                    <Input
                      type="text"
                      value={courier}
                      onChange={(e) => setCourier(e.target.value)}
                      placeholder="예: CJ대한통운, 한진택배"
                      className="w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      송장번호 *
                    </label>
                    <Input
                      type="text"
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                      placeholder="송장번호 입력"
                      className="w-full"
                    />
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg">
                    <Typography variant="caption" className="text-green-700">
                      승인 시 주문 상태가 "배송 중"으로 변경되고 재고가 차감됩니다.
                    </Typography>
                  </div>
                </div>
                )
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      거절 사유
                    </label>
                    <textarea
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="거절 사유를 입력하세요 (선택)"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                      rows={4}
                    />
                  </div>
                  <div className="p-3 bg-red-50 rounded-lg">
                    <Typography variant="caption" className="text-red-700">
                      ⚠️ 거절 시 파트너에게 알림이 전송됩니다.
                    </Typography>
                  </div>
                </div>
              )}
            </>
            );
          })()}
        </div>
      </SlideSheet>

      {/* 상품 상세 Sheet */}
      <SlideSheet
        isOpen={isProductDetailOpen}
        onClose={() => {
          setIsProductDetailOpen(false);
          setSelectedProduct(null);
          setProductDetail(null);
          setDistributionRate(null);
          setIsEditMode(false);
          setEditThumbnail(null);
          setEditImages([]);
          setExistingImages([]);
        }}
        title={isEditMode ? '상품 수정' : '상품 상세'}
        initialHeight={0.85}
        maxHeight={0.95}
        footer={
          <div className="flex gap-3 px-4">
            {isEditMode ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditMode(false);
                    setEditThumbnail(null);
                    setEditImages([]);
                    if (productDetail) {
                      setEditName(productDetail.name);
                      setEditPrice(productDetail.price?.toString());
                      setEditDescription(productDetail.description || '');
                      setExistingImages(productDetail.images || []);
                    }
                  }}
                  className="flex-1"
                  disabled={isSavingProduct}
                >
                  취소
                </Button>
                <Button
                  onClick={handleSaveProduct}
                  disabled={isSavingProduct}
                  className="flex-1 bg-[#FE3A8F] text-white"
                >
                  {isSavingProduct ? '저장 중...' : '저장'}
                </Button>
              </>
            ) : (
              <Button
                onClick={() => setIsEditMode(true)}
                className="flex-1 bg-[#FE3A8F] text-white"
              >
                <Edit className="h-4 w-4 mr-2" />
                상품 수정
              </Button>
            )}
          </div>
        }
      >
        {isLoadingDetail ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-[#FE3A8F]" />
          </div>
        ) : selectedProduct && (
          <div className="space-y-4 pb-4">
            {/* 상품 기본 정보 */}
            <div className="flex gap-4">
              {isEditMode ? (
                <label className="relative w-24 h-24 rounded-xl overflow-hidden flex-shrink-0 cursor-pointer group">
                  {editThumbnail ? (
                    <img
                      src={URL.createObjectURL(editThumbnail)}
                      alt="새 썸네일"
                      className="w-full h-full object-cover"
                    />
                  ) : (productDetail?.thumbnail_url || selectedProduct.thumbnail_url) ? (
                    <img
                      src={productDetail?.thumbnail_url || selectedProduct.thumbnail_url}
                      alt={selectedProduct.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                      <ShoppingBag className="h-8 w-8 text-gray-400" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <ImagePlus className="h-6 w-6 text-white" />
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) setEditThumbnail(file);
                    }}
                    className="hidden"
                  />
                </label>
              ) : (productDetail?.thumbnail_url || selectedProduct.thumbnail_url) ? (
                <img
                  src={productDetail?.thumbnail_url || selectedProduct.thumbnail_url}
                  alt={selectedProduct.name}
                  className="w-24 h-24 rounded-xl object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-24 h-24 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <ShoppingBag className="h-8 w-8 text-gray-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                {isEditMode ? (
                  <div className="space-y-3">
                    <div>
                      <Typography variant="caption" className="text-gray-500 mb-1 block">상품명</Typography>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="상품명을 입력하세요"
                        className="w-full font-bold"
                      />
                    </div>
                    <div>
                      <Typography variant="caption" className="text-gray-500 mb-1 block">가격</Typography>
                      <div className="relative">
                        <Input
                          type="number"
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                          placeholder="가격"
                          min="0"
                          className="w-full pr-8"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">P</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <Typography variant="body1" className="font-bold mb-1">
                      {productDetail?.name || selectedProduct.name}
                    </Typography>
                    <Typography variant="caption" className="text-gray-500 block">
                      {PRODUCT_TYPE_LABEL[selectedProduct.product_type] || selectedProduct.product_type}
                    </Typography>
                    <Typography variant="h6" className="font-bold text-[#FE3A8F] mt-2">
                      {formatPrice(productDetail?.price || selectedProduct.price)}
                    </Typography>
                  </>
                )}
              </div>
            </div>

            {/* 활성화/비활성화 토글 */}
            {!isEditMode && (
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div>
                  <Typography variant="body2" className="font-medium">상품 상태</Typography>
                  <Typography variant="caption" className="text-gray-500">
                    {(productDetail as any)?.is_active !== false ? '활성화됨' : '비활성화됨'}
                  </Typography>
                </div>
                <button
                  type="button"
                  onClick={handleToggleActive}
                  disabled={isTogglingActive}
                  className={`relative w-12 h-7 rounded-full transition-all border-2 ${
                    (productDetail as any)?.is_active !== false
                      ? 'bg-white border-[#FE3A8F]'
                      : 'bg-white border-gray-300'
                  } ${isTogglingActive ? 'opacity-50' : ''}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full shadow transition-all ${
                    (productDetail as any)?.is_active !== false
                      ? 'bg-[#FE3A8F] left-[calc(100%-22px)]'
                      : 'bg-gray-300 left-0.5'
                  }`} />
                </button>
              </div>
            )}

            {/* 상품 유형 (수정 모드 - 등록 후에는 변경 불가) */}
            {isEditMode && (
              <div className="p-4 bg-gray-50 rounded-xl">
                <Typography variant="caption" className="text-gray-500 mb-2 block">
                  상품 유형 <span className="text-red-500">(변경 불가)</span>
                </Typography>
                <div className="flex gap-2">
                  {[
                    { key: 'delivery', label: '택배 배송' },
                    { key: 'digital', label: '디지털 화보' },
                    { key: 'on_site', label: '현장 수령' },
                  ].map((type) => (
                    <div
                      key={type.key}
                      className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium text-center ${
                        editProductType === type.key
                          ? 'bg-[#FE3A8F] text-white'
                          : 'bg-gray-200 text-gray-400'
                      }`}
                    >
                      {type.label}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 재고 (수정 모드, digital 제외) */}
            {isEditMode && editProductType !== 'digital' && (
              <div className="p-4 bg-gray-50 rounded-xl">
                <Typography variant="caption" className="text-gray-500 mb-2 block">재고</Typography>
                <div className="relative">
                  <Input
                    type="number"
                    value={editStock}
                    onChange={(e) => setEditStock(e.target.value)}
                    placeholder="재고 수량"
                    min="0"
                    className="pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">개</span>
                </div>
              </div>
            )}

            {/* 택배비 (배송 상품 + 수정 모드) */}
            {isEditMode && editProductType === 'delivery' && (
              <>
              <div className="p-4 bg-gray-50 rounded-xl space-y-3">
                <Typography variant="caption" className="text-gray-500 block">택배비</Typography>
                <div>
                  <Typography variant="caption" className="text-gray-400 mb-1 block">기본 택배비</Typography>
                  <div className="relative">
                    <Input
                      type="number"
                      value={editShippingFeeBase}
                      onChange={(e) => setEditShippingFeeBase(e.target.value)}
                      placeholder="0"
                      min="0"
                      className="w-full pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">P</span>
                  </div>
                </div>
                <div>
                  <Typography variant="caption" className="text-gray-400 mb-1 block">도서산간 지역 택배비</Typography>
                  <div className="relative">
                    <Input
                      type="number"
                      value={editShippingFeeRemote}
                      onChange={(e) => setEditShippingFeeRemote(e.target.value)}
                      placeholder="0"
                      min="0"
                      className="w-full pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">P</span>
                  </div>
                </div>
              </div>

                {/* 묶음 배송 설정 */}
                <label className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg cursor-pointer mt-3">
                  <input
                    type="checkbox"
                    checked={editIsBundleAvailable}
                    onChange={(e) => setEditIsBundleAvailable(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-[#FE3A8F] focus:ring-[#FE3A8F]"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-800">묶음 배송 가능</span>
                    <p className="text-xs text-gray-500">다른 묶음 배송 상품과 함께 배송됩니다</p>
                  </div>
                </label>
              </>
            )}

            {/* 디지털 자산 (디지털 상품 + 수정 모드) */}
            {isEditMode && editProductType === 'digital' && (
              <div className="p-4 bg-gray-50 rounded-xl">
                <Typography variant="caption" className="text-gray-500 mb-2 block">디지털 자산</Typography>
                <div className="flex gap-2 flex-wrap">
                  {existingDigitalAssets.map((asset, index) => (
                    <div key={asset.asset_id} className="relative px-3 py-2 bg-white rounded-lg border text-sm flex items-center gap-2">
                      <span className="truncate max-w-[120px]">{asset.file_name || `파일 ${index + 1}`}</span>
                      <button
                        type="button"
                        onClick={() => setExistingDigitalAssets(existingDigitalAssets.filter((_, i) => i !== index))}
                        className="text-red-500 hover:text-red-700"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  {editDigitalAssets.map((file, index) => (
                    <div key={index} className="relative px-3 py-2 bg-blue-50 rounded-lg border border-blue-200 text-sm flex items-center gap-2">
                      <span className="truncate max-w-[120px] text-blue-600">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => setEditDigitalAssets(editDigitalAssets.filter((_, i) => i !== index))}
                        className="text-red-500 hover:text-red-700"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <label className="px-3 py-2 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:bg-gray-100">
                    <input
                      type="file"
                      multiple
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        setEditDigitalAssets([...editDigitalAssets, ...files]);
                      }}
                      className="hidden"
                    />
                    <Plus className="h-4 w-4 text-gray-400" />
                    <span className="ml-1 text-sm text-gray-500">추가</span>
                  </label>
                </div>
              </div>
            )}

            {/* 협업 파트너 정보 */}
            {((productDetail as any)?.collaboration_partners?.length > 0 || productDetail?.partner || selectedProduct.partner) && (
              <div className="p-4 bg-gray-50 rounded-xl">
                <Typography variant="caption" className="text-gray-500 mb-3 block">협업 파트너</Typography>
                {(productDetail as any)?.collaboration_partners?.length > 0 ? (
                  <div className="space-y-3">
                    {(productDetail as any).collaboration_partners.map((collab: any) => (
                      <button
                        key={collab.request_id || collab.partner_id}
                        type="button"
                        onClick={() => {
                          setEditingPartnerRate(collab);
                          setEditRateValue((collab.distribution_rate ?? collab.partner?.default_distribution_rate ?? 70).toString());
                          setEditShareRateValue(collab.share_rate != null ? collab.share_rate.toString() : '');
                          setIsRateEditOpen(true);
                        }}
                        className="w-full flex items-center justify-between p-3 bg-white rounded-lg border hover:border-[#FE3A8F]/50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden">
                            {collab.partner?.member?.profile_image ? (
                              <img
                                src={collab.partner.member.profile_image}
                                alt=""
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <User className="h-5 w-5 text-gray-400" />
                            )}
                          </div>
                          <div>
                            <Typography variant="body2" className="font-medium">
                              {collab.partner?.partner_name}
                            </Typography>
                            <Typography variant="caption" className="text-gray-500">
                              {collab.partner?.member?.email}
                            </Typography>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            collab.status === 'accepted' ? 'bg-green-100 text-green-700' :
                            collab.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                            collab.status === 'rejected' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {collab.status === 'accepted' ? '수락됨' :
                             collab.status === 'pending' ? '대기중' :
                             collab.status === 'rejected' ? '거절됨' : collab.status}
                          </span>
                          <Typography variant="caption" className="text-[#FE3A8F] block mt-1">
                            정산율: {collab.distribution_rate ?? collab.partner?.default_distribution_rate ?? 70}%
                          </Typography>
                          <Typography variant="caption" className="text-blue-500 block">
                            배분율: {collab.share_rate != null ? `${collab.share_rate}%` : '미설정'}
                          </Typography>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (productDetail?.partner || selectedProduct.partner) ? (
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-400" />
                    <Typography variant="body2" className="font-medium">
                      {productDetail?.partner?.partner_name || selectedProduct.partner?.partner_name}
                    </Typography>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <Typography variant="body2" className="text-gray-500 mb-3">
                      아직 협업 파트너가 지정되지 않았습니다
                    </Typography>
                    <Button
                      onClick={() => {
                        setIsProductDetailOpen(false);
                        setSelectedProductForRequest(selectedProduct);
                        setIsCreateRequestOpen(true);
                        fetchPartners();
                      }}
                      className="bg-[#FE3A8F] text-white"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      파트너 협업 등록
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* 협업 파트너가 없을 때 협업 요청 영역 (별도 섹션) */}
            {!isEditMode && (productDetail as any)?.collaboration_partners?.length === 0 && !productDetail?.partner && !selectedProduct.partner && (
              <div className="p-4 bg-pink-50 rounded-xl border border-pink-200">
                <div className="flex items-center gap-2 mb-2">
                  <User className="h-5 w-5 text-[#FE3A8F]" />
                  <Typography variant="body2" className="font-medium text-[#FE3A8F]">
                    파트너 협업 등록
                  </Typography>
                </div>
                <Typography variant="caption" className="text-gray-600 block mb-3">
                  이 상품을 판매할 파트너를 지정하여 협업을 등록하세요.
                </Typography>
                <Button
                  onClick={() => {
                    setIsProductDetailOpen(false);
                    setSelectedProductForRequest(selectedProduct);
                    setIsCreateRequestOpen(true);
                    fetchPartners();
                  }}
                  className="w-full bg-[#FE3A8F] text-white"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  협업 등록하기
                </Button>
              </div>
            )}

            {/* 재고 정보 (digital 제외) */}
            {selectedProduct.product_type !== 'digital' && !isEditMode && (
              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="flex justify-between items-center">
                  <div>
                    <Typography variant="caption" className="text-gray-500 block">현재 재고</Typography>
                    <Typography variant="h6" className="font-bold">
                      {productDetail?.stock ?? selectedProduct.stock ?? 0}개
                    </Typography>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setNewStock((productDetail?.stock ?? selectedProduct.stock ?? 0).toString());
                      setIsStockSheetOpen(true);
                    }}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    수정
                  </Button>
                </div>
              </div>
            )}

            {/* 택배비 정보 (배송 상품 + 뷰 모드) */}
            {selectedProduct.product_type === 'delivery' && !isEditMode && (
              <div className="p-4 bg-gray-50 rounded-xl">
                <Typography variant="caption" className="text-gray-500 mb-3 block">택배비</Typography>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Typography variant="caption" className="text-gray-400 block">기본</Typography>
                    <Typography variant="body2" className="font-medium">
                      {(productDetail as any)?.shipping_fee_base ? formatPrice((productDetail as any).shipping_fee_base) : '무료'}
                    </Typography>
                  </div>
                  <div>
                    <Typography variant="caption" className="text-gray-400 block">도서산간</Typography>
                    <Typography variant="body2" className="font-medium">
                      {(productDetail as any)?.shipping_fee_remote ? formatPrice((productDetail as any).shipping_fee_remote) : '무료'}
                    </Typography>
                  </div>
                </div>
              </div>
            )}

            {/* 배분 비율 - collaboration_partners가 없을 때만 표시 (기존 시스템 호환, 읽기 전용) */}
            {!isEditMode && !((productDetail as any)?.collaboration_partners?.length > 0) && (productDetail?.partner || selectedProduct.partner) && (
              <div className="p-4 bg-gray-50 rounded-xl">
                <Typography variant="caption" className="text-gray-600 mb-3 block font-medium">
                  파트너 배분 비율
                </Typography>
                <Typography variant="body1" className="font-medium">
                  {distributionRate ?? (productDetail?.partner as any)?.default_distribution_rate ?? 70}%
                </Typography>
                <Typography variant="caption" className="text-gray-500 mt-2 block">
                  판매액의 {distributionRate ?? (productDetail?.partner as any)?.default_distribution_rate ?? 70}%가 파트너에게 배분됩니다
                </Typography>
              </div>
            )}

            {/* 상품 설명 */}
            <div>
              <Typography variant="caption" className="text-gray-500 mb-2 block">상품 설명</Typography>
              {isEditMode ? (
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="상품 설명을 입력하세요"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl"
                  rows={4}
                />
              ) : (
                <div className="p-4 bg-gray-50 rounded-xl">
                  <Typography variant="body2" className="text-gray-700 whitespace-pre-wrap">
                    {productDetail?.description || selectedProduct.description || '설명 없음'}
                  </Typography>
                </div>
              )}
            </div>

            {/* 이미지 갤러리 */}
            {isEditMode ? (
              <div>
                <Typography variant="caption" className="text-gray-500 mb-2 block">상품 이미지</Typography>
                <div className="flex gap-2 flex-wrap">
                  {existingImages.map((img) => (
                    <div key={img.image_id} className="relative w-20 h-20">
                      <img
                        src={img.image_url}
                        alt=""
                        className="w-full h-full rounded-lg object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setExistingImages(existingImages.filter((i) => i.image_id !== img.image_id));
                        }}
                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {editImages.map((file, index) => (
                    <div key={`new-${index}`} className="relative w-20 h-20">
                      <img
                        src={URL.createObjectURL(file)}
                        alt=""
                        className="w-full h-full rounded-lg object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setEditImages(editImages.filter((_, i) => i !== index));
                        }}
                        className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <label className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:bg-gray-50">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        setEditImages([...editImages, ...files]);
                      }}
                      className="hidden"
                    />
                    <Plus className="h-6 w-6 text-gray-400" />
                  </label>
                </div>
              </div>
            ) : productDetail?.images && productDetail.images.length > 0 && (
              <div>
                <Typography variant="caption" className="text-gray-500 mb-2 block">상품 이미지</Typography>
                <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                  {productDetail.images.map((img: any) => (
                    <img
                      key={img.image_id}
                      src={img.image_url}
                      alt=""
                      className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* 디지털 에셋 (digital 상품만) */}
            {!isEditMode && selectedProduct.product_type === 'digital' && productDetail?.digital_assets && productDetail.digital_assets.length > 0 && (
              <div>
                <Typography variant="caption" className="text-gray-500 mb-2 block">디지털 파일</Typography>
                <div className="space-y-2">
                  {productDetail.digital_assets.map((asset: any) => (
                    <div key={asset.asset_id} className="p-3 bg-gray-50 rounded-lg flex items-center gap-2">
                      <Package className="h-4 w-4 text-gray-400" />
                      <Typography variant="body2" className="text-gray-700 truncate flex-1">
                        {asset.file_name}
                      </Typography>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </SlideSheet>

      {/* 협업 요청 생성 Sheet */}
      <SlideSheet
        isOpen={isCreateRequestOpen}
        onClose={() => {
          setIsCreateRequestOpen(false);
          setSelectedProductForRequest(null);
          setSelectedPartners([]);
          setPartnerSearchQuery('');
        }}
        title="협업 등록"
        initialHeight={0.85}
        maxHeight={0.95}
        footer={
          <div className="flex gap-3 px-4">
            <Button
              variant="outline"
              onClick={() => setIsCreateRequestOpen(false)}
              className="flex-1"
              disabled={isCreatingRequest}
            >
              취소
            </Button>
            <Button
              onClick={handleCreateRequest}
              disabled={isCreatingRequest || !selectedProductForRequest || selectedPartners.length === 0}
              className="flex-1 bg-[#FE3A8F] text-white"
            >
              {isCreatingRequest ? '등록 중...' : `협업 등록${selectedPartners.length > 0 ? ` (${selectedPartners.length}명)` : ''}`}
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          {/* 상품 선택 */}
          <div>
            <Typography variant="body2" className="font-medium mb-3">상품 선택</Typography>
            {selectedProductForRequest ? (
              <div className="flex items-center gap-3 p-3 bg-[#FE3A8F]/10 rounded-xl border border-[#FE3A8F]/30">
                {selectedProductForRequest.thumbnail_url ? (
                  <img
                    src={selectedProductForRequest.thumbnail_url}
                    alt=""
                    className="w-14 h-14 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center">
                    <ShoppingBag className="h-6 w-6 text-gray-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <Typography variant="body2" className="font-medium truncate">
                    {selectedProductForRequest.name}
                  </Typography>
                  <Typography variant="caption" className="text-gray-600">
                    {formatPrice(selectedProductForRequest.price)}
                  </Typography>
                </div>
                <button
                  onClick={() => setSelectedProductForRequest(null)}
                  className="p-1 hover:bg-gray-200 rounded-full"
                >
                  <X className="h-4 w-4 text-gray-500" />
                </button>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {isLoadingUnassigned ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                  </div>
                ) : unassignedProducts.length === 0 ? (
                  <Typography variant="caption" className="text-gray-500 text-center block py-4">
                    할당 가능한 상품이 없습니다
                  </Typography>
                ) : (
                  unassignedProducts.map((product) => (
                    <button
                      key={product.product_id}
                      onClick={() => setSelectedProductForRequest(product)}
                      className="w-full flex items-center gap-3 p-3 bg-white rounded-xl border hover:border-[#FE3A8F]/50 transition-colors text-left"
                    >
                      {product.thumbnail_url ? (
                        <img
                          src={product.thumbnail_url}
                          alt=""
                          className="w-12 h-12 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                          <ShoppingBag className="h-5 w-5 text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <Typography variant="body2" className="font-medium truncate">
                          {product.name}
                        </Typography>
                        <Typography variant="caption" className="text-gray-600">
                          {PRODUCT_TYPE_LABEL[product.product_type]} • {formatPrice(product.price)}
                        </Typography>
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* 파트너 선택 (다중 선택 + 개별 배분 비율) */}
          <div>
            <Typography variant="body2" className="font-medium mb-3">
              파트너 선택 {selectedPartners.length > 0 && <span className="text-[#FE3A8F]">({selectedPartners.length}명)</span>}
            </Typography>

            <div className="flex items-center justify-between mb-3">
              <Typography variant="caption" className="text-gray-600">배분율 설정</Typography>
              <button
                type="button"
                role="switch"
                aria-checked={isShareRateEnabled}
                onClick={() => {
                  const next = !isShareRateEnabled;
                  setIsShareRateEnabled(next);
                  if (selectedPartners.length > 0) {
                    if (next) {
                      const equal = Math.floor(100 / selectedPartners.length);
                      const remainder = 100 - equal * selectedPartners.length;
                      setSelectedPartners(selectedPartners.map((p, i) => ({
                        ...p,
                        share_rate: i === 0 ? equal + remainder : equal,
                      })));
                    } else {
                      setSelectedPartners(selectedPartners.map((p) => ({ ...p, share_rate: null })));
                    }
                  }
                }}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${isShareRateEnabled ? 'bg-[#FE3A8F]' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${isShareRateEnabled ? 'translate-x-[18px]' : 'translate-x-[3px]'}`} />
              </button>
            </div>
            {isShareRateEnabled && (
              <Typography variant="caption" className="text-pink-500 mb-3 block">
                배분율의 합계는 100을 초과할 수 없습니다
              </Typography>
            )}
            {selectedPartners.length > 0 && (
              <div className="space-y-2 mb-4">
                {selectedPartners.map((partner) => (
                  <div
                    key={partner.id}
                    className="flex items-center gap-3 p-3 bg-[#FE3A8F]/5 rounded-xl border border-[#FE3A8F]/20"
                  >
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {partner.profile_image ? (
                        <img src={partner.profile_image} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <User className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Typography variant="body2" className="font-medium truncate">
                        {partner.partner_name}
                      </Typography>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col items-center">
                        <span className="text-[10px] text-gray-400 mb-0.5">정산율</span>
                        <div className="flex items-center gap-0.5">
                          <input
                            type="number"
                            value={partner.collaboration_distribution_rate ?? 100}
                            onChange={(e) => handlePartnerDistributionRateChange(partner.id, Number(e.target.value))}
                            className="w-14 px-2 py-1 text-sm text-center bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#FE3A8F]"
                            min={0}
                            max={100}
                          />
                          <span className="text-sm text-gray-500">%</span>
                        </div>
                      </div>
                      {isShareRateEnabled && (
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] text-gray-400 mb-0.5">배분율</span>
                          <div className="flex items-center gap-0.5">
                            <input
                              type="number"
                              value={partner.share_rate ?? 0}
                              onChange={(e) => handlePartnerRateChange(partner.id, Number(e.target.value))}
                              className="w-14 px-2 py-1 text-sm text-center bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-[#FE3A8F]"
                              min={0}
                              max={100}
                            />
                            <span className="text-sm text-gray-500">%</span>
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setSelectedPartners(selectedPartners.filter((p) => p.id !== partner.id))}
                      className="p-1 hover:bg-red-100 rounded-full"
                    >
                      <X className="h-4 w-4 text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            {/* 파트너 필터 */}
            <Input
              value={partnerSearchQuery}
              onChange={(e) => setPartnerSearchQuery(e.target.value)}
              placeholder="파트너 이름으로 필터..."
              className="mb-2"
            />
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {isLoadingPartners ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : partners.length === 0 ? (
                <Typography variant="caption" className="text-gray-500 text-center block py-4">
                  파트너가 없습니다
                </Typography>
              ) : (
                partners
                  .filter((partner) => !selectedPartners.some((p) => p.id === partner.id))
                  .filter((partner) => !partnerSearchQuery || partner.partner_name?.toLowerCase().includes(partnerSearchQuery.toLowerCase()))
                  .map((partner) => (
                    <button
                      key={partner.id}
                      onClick={() => handleSelectPartner(partner)}
                      className="w-full flex items-center gap-3 p-3 bg-white rounded-xl border hover:border-[#FE3A8F]/50 transition-colors text-left"
                    >
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
                        {partner.profile_image ? (
                          <img src={partner.profile_image} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <User className="h-5 w-5 text-gray-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <Typography variant="body2" className="font-medium truncate">
                          {partner.partner_name}
                        </Typography>
                        <Typography variant="caption" className="text-gray-500">
                          정산율: {partner.collaboration_distribution_rate ?? 100}%
                        </Typography>
                      </div>
                      <Plus className="h-4 w-4 text-gray-400" />
                    </button>
                  ))
              )}
            </div>
          </div>

          {/* 요약 */}
          {selectedProductForRequest && selectedPartners.length > 0 && (
            <div className="p-4 bg-gray-50 rounded-xl">
              <Typography variant="caption" className="text-gray-600 mb-2 block">협업 등록 요약</Typography>
              <div className="space-y-1">
                <Typography variant="body2">
                  <span className="text-gray-500">상품:</span> {selectedProductForRequest.name}
                </Typography>
                <Typography variant="body2">
                  <span className="text-gray-500">파트너:</span>
                </Typography>
                <div className="pl-2 space-y-0.5">
                  {selectedPartners.map((p) => (
                    <Typography key={p.id} variant="caption" className="text-gray-600 block">
                      • {p.partner_name}{isShareRateEnabled ? ` (배분율: ${p.share_rate}%)` : ''}
                    </Typography>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </SlideSheet>

      {/* 상품 생성 Sheet */}
      <SlideSheet
        isOpen={isProductCreateOpen}
        onClose={() => {
          setIsProductCreateOpen(false);
          resetProductCreateForm();
        }}
        title="새 상품 등록"
        initialHeight={0.9}
        maxHeight={0.95}
        footer={
          <div className="flex gap-3 px-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsProductCreateOpen(false);
                resetProductCreateForm();
              }}
              className="flex-1"
              disabled={isCreatingProduct}
            >
              취소
            </Button>
            <Button
              onClick={handleCreateProduct}
              disabled={isCreatingProduct}
              className="flex-1 bg-[#FE3A8F] text-white"
            >
              {isCreatingProduct ? '등록 중...' : '상품 등록'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* 썸네일 */}
          <div>
            <Typography variant="body2" className="font-medium mb-2">
              썸네일 이미지 <span className="text-red-500">*</span>
            </Typography>
            <label className="relative w-24 h-24 rounded-xl overflow-hidden cursor-pointer group block">
              {newProductThumbnail ? (
                <>
                  <img
                    src={URL.createObjectURL(newProductThumbnail)}
                    alt="썸네일"
                    className="w-full h-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setNewProductThumbnail(null);
                    }}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </>
              ) : (
                <div className="w-full h-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center hover:bg-gray-200">
                  <ImagePlus className="h-8 w-8 text-gray-400" />
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) setNewProductThumbnail(file);
                }}
                className="hidden"
              />
            </label>
          </div>

          {/* 상품명 */}
          <div>
            <Typography variant="body2" className="font-medium mb-2">
              상품명 <span className="text-red-500">*</span>
            </Typography>
            <Input
              value={newProductName}
              onChange={(e) => setNewProductName(e.target.value)}
              placeholder="상품명을 입력하세요"
            />
          </div>

          {/* 가격 */}
          <div>
            <Typography variant="body2" className="font-medium mb-2">
              가격 <span className="text-red-500">*</span>
            </Typography>
            <div className="relative">
              <Input
                type="number"
                value={newProductPrice}
                onChange={(e) => setNewProductPrice(e.target.value)}
                placeholder="가격"
                min="0"
                className="pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">P</span>
            </div>
          </div>

          {/* 상품 유형 */}
          <div>
            <Typography variant="body2" className="font-medium mb-2">
              상품 유형 <span className="text-red-500">*</span>
            </Typography>
            <div className="flex gap-2">
              {[
                { key: 'delivery', label: '택배 배송' },
                { key: 'digital', label: '디지털 화보' },
                { key: 'on_site', label: '현장 수령' },
              ].map((type) => (
                <button
                  key={type.key}
                  type="button"
                  onClick={() => setNewProductType(type.key as 'delivery' | 'digital' | 'on_site')}
                  className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                    newProductType === type.key
                      ? 'bg-[#FE3A8F] text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          {/* 재고 (배송/현장수령 상품) */}
          {(newProductType === 'delivery' || newProductType === 'on_site') && (() => {
            const optionStockSum = newProductOptions.reduce((sum, opt) => {
              if (opt.values) {
                return sum + opt.values.reduce((vSum, v: any) => vSum + (v.stock ?? 0), 0);
              }
              return sum;
            }, 0);
            const hasOptionStock = newProductOptions.some((opt) =>
              opt.values?.some((v: any) => v.stock !== undefined && v.stock !== null && v.stock > 0)
            );
            return (
              <div>
                <Typography variant="body2" className="font-medium mb-2">
                  재고 {hasOptionStock && <span className="text-pink-500 text-xs">(옵션 재고 합계)</span>}
                </Typography>
                <div className="relative">
                  <Input
                    type="number"
                    value={hasOptionStock ? optionStockSum : newProductStock}
                    onChange={(e) => !hasOptionStock && setNewProductStock(e.target.value)}
                    readOnly={hasOptionStock}
                    placeholder="재고 수량"
                    min="0"
                    className={`pr-8 ${hasOptionStock ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">개</span>
                </div>
                {hasOptionStock && (
                  <p className="text-xs text-pink-500 mt-1">옵션에 재고가 설정되어 자동 계산됩니다</p>
                )}
              </div>
            );
          })()}

          {/* 택배비 (배송 상품만) */}
          {newProductType === 'delivery' && (
            <>
            <div className="space-y-3">
              <Typography variant="body2" className="font-medium">택배비</Typography>
              <div>
                <Typography variant="caption" className="text-gray-500 mb-1 block">기본 택배비</Typography>
                <div className="relative">
                  <Input
                    type="number"
                    value={newProductShippingFeeBase}
                    onChange={(e) => setNewProductShippingFeeBase(e.target.value)}
                    placeholder="기본 택배비"
                    min="0"
                    className="pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">P</span>
                </div>
              </div>
              <div>
                <Typography variant="caption" className="text-gray-500 mb-1 block">도서산간 지역 택배비</Typography>
                <div className="relative">
                  <Input
                    type="number"
                    value={newProductShippingFeeRemote}
                    onChange={(e) => setNewProductShippingFeeRemote(e.target.value)}
                    placeholder="도서산간 지역 택배비"
                    min="0"
                    className="pr-8"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">P</span>
                </div>
              </div>
            </div>

              {/* 묶음 배송 설정 */}
              <label className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg cursor-pointer mt-3">
                <input
                  type="checkbox"
                  checked={newProductIsBundleAvailable}
                  onChange={(e) => setNewProductIsBundleAvailable(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-[#FE3A8F] focus:ring-[#FE3A8F]"
                />
                <div>
                  <span className="text-sm font-medium text-gray-800">묶음 배송 가능</span>
                  <p className="text-xs text-gray-500">다른 묶음 배송 상품과 함께 배송됩니다</p>
                </div>
              </label>
            </>
          )}

          {/* 상품 옵션 (배송/현장수령 상품) */}
          {(newProductType === 'delivery' || newProductType === 'on_site') && (
            <ProductOptionEditor
              options={newProductOptions}
              onChange={setNewProductOptions}
            />
          )}

          {/* 수령 장소 (현장수령 상품) */}
          {newProductType === 'on_site' && (
            <div>
              <Typography variant="body2" className="font-medium mb-2">수령 장소</Typography>
              {newProductPickupLocation ? (
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <Typography variant="body2" className="text-blue-700">{newProductPickupLocation}</Typography>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsLocationPickerOpen(true)}
                      className="text-xs text-blue-600 hover:text-blue-800 underline flex-shrink-0"
                    >
                      변경
                    </button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsLocationPickerOpen(true)}
                  className="w-full"
                >
                  <MapPin className="h-4 w-4 mr-2" />
                  지도에서 수령 장소 선택
                </Button>
              )}
            </div>
          )}

          {/* 설명 */}
          <div>
            <Typography variant="body2" className="font-medium mb-2">상품 설명</Typography>
            <textarea
              value={newProductDescription}
              onChange={(e) => setNewProductDescription(e.target.value)}
              placeholder="상품 설명을 입력하세요"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl resize-none"
              rows={4}
            />
          </div>

          {/* 상세 이미지 */}
          <div>
            <Typography variant="body2" className="font-medium mb-2">상세 이미지</Typography>
            <div className="flex gap-2 flex-wrap">
              {newProductImages.map((file, index) => (
                <div key={index} className="relative w-20 h-20">
                  <img
                    src={URL.createObjectURL(file)}
                    alt=""
                    className="w-full h-full rounded-lg object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => setNewProductImages(newProductImages.filter((_, i) => i !== index))}
                    className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <label className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:bg-gray-50">
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    setNewProductImages([...newProductImages, ...files]);
                  }}
                  className="hidden"
                />
                <Plus className="h-6 w-6 text-gray-400" />
              </label>
            </div>
          </div>

          {/* 디지털 자산 (디지털 상품만) */}
          {newProductType === 'digital' && (
            <div>
              <Typography variant="body2" className="font-medium mb-2">
                디지털 자산 <span className="text-red-500">*</span>
              </Typography>
              <Typography variant="caption" className="text-gray-500 mb-2 block">
                구매자가 다운로드할 수 있는 파일을 업로드하세요.
              </Typography>
              <div className="flex gap-2 flex-wrap">
                {newProductDigitalAssets.map((file, index) => (
                  <div key={index} className="relative px-3 py-2 bg-blue-50 rounded-lg border border-blue-200 text-sm flex items-center gap-2">
                    <span className="truncate max-w-[120px] text-blue-600">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => setNewProductDigitalAssets(newProductDigitalAssets.filter((_, i) => i !== index))}
                      className="text-red-500 hover:text-red-700"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <label className="px-3 py-2 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:bg-gray-100">
                  <input
                    type="file"
                    multiple
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      setNewProductDigitalAssets([...newProductDigitalAssets, ...files]);
                    }}
                    className="hidden"
                  />
                  <Plus className="h-4 w-4 text-gray-400" />
                  <span className="ml-1 text-sm text-gray-500">파일 추가</span>
                </label>
              </div>
            </div>
          )}
        </div>
      </SlideSheet>

      {/* 환불 상세 Sheet */}
      <SlideSheet
        isOpen={isRefundDetailOpen}
        onClose={() => {
          setIsRefundDetailOpen(false);
          setSelectedAdminRefund(null);
          setRefundRejectionReason('');
        }}
        title="환불 요청 상세"
      >
        {selectedAdminRefund && (
          <div className="p-6 space-y-6">
            {/* 상품 정보 */}
            <div className="flex gap-3">
              {selectedAdminRefund.order?.product?.thumbnail_url && (
                <img
                  src={selectedAdminRefund.order.product.thumbnail_url}
                  alt={selectedAdminRefund.order.product?.name}
                  className="w-20 h-20 rounded-lg object-cover"
                />
              )}
              <div className="flex-1">
                <Typography variant="body1" className="font-medium">
                  {selectedAdminRefund.order?.product?.name}
                </Typography>
                <Typography variant="caption" className="text-gray-500">
                  {PRODUCT_TYPE_LABEL[selectedAdminRefund.order?.product?.product_type || ''] || selectedAdminRefund.order?.product?.product_type}
                </Typography>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs px-2 py-1 rounded-full ${ADMIN_REFUND_STATUS_COLOR[selectedAdminRefund.status] || 'bg-gray-100'}`}>
                    {ADMIN_REFUND_STATUS_LABEL[selectedAdminRefund.status] || selectedAdminRefund.status}
                  </span>
                </div>
              </div>
            </div>

            {/* 환불 정보 */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <div className="flex justify-between">
                <Typography variant="body2" className="text-gray-500">주문번호</Typography>
                <Typography variant="body2" className="font-medium">{selectedAdminRefund.order?.order_number}</Typography>
              </div>
              <div className="flex justify-between">
                <Typography variant="body2" className="text-gray-500">요청일시</Typography>
                <Typography variant="body2">
                  {new Date(selectedAdminRefund.created_at).toLocaleDateString('ko-KR', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Typography>
              </div>
              <div className="flex justify-between">
                <Typography variant="body2" className="text-gray-500">수량</Typography>
                <Typography variant="body2">{selectedAdminRefund.order?.quantity || 1}개</Typography>
              </div>
              <div className="flex justify-between">
                <Typography variant="body2" className="text-gray-500">결제금액</Typography>
                <Typography variant="body2">{(selectedAdminRefund.order?.total_amount || 0).toLocaleString()}P</Typography>
              </div>
              {selectedAdminRefund.order?.shipping_fee ? (
                <div className="flex justify-between">
                  <Typography variant="body2" className="text-gray-500">배송비 (제외)</Typography>
                  <Typography variant="body2" className="text-red-500">-{selectedAdminRefund.order.shipping_fee.toLocaleString()}P</Typography>
                </div>
              ) : null}
              <div className="flex justify-between border-t pt-3">
                <Typography variant="body2" className="text-gray-500">환불금액</Typography>
                <Typography variant="body1" className="font-bold text-[#FE3A8F]">
                  {selectedAdminRefund.refund_amount?.toLocaleString()}P
                </Typography>
              </div>
            </div>

            {/* 파트너 정보 */}
            {selectedAdminRefund.order?.product?.partner && (
              <div>
                <Typography variant="body2" className="font-medium mb-2">담당 파트너</Typography>
                <div className="bg-gray-50 rounded-xl p-4">
                  <Typography variant="body2">{selectedAdminRefund.order.product.partner.partner_name}</Typography>
                </div>
              </div>
            )}

            {/* 구매자 정보 */}
            <div>
              <Typography variant="body2" className="font-medium mb-3 flex items-center gap-2">
                <User className="h-4 w-4" />
                구매자 정보
              </Typography>
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center gap-2">
                  {selectedAdminRefund.order?.buyer?.profile_image ? (
                    <img src={selectedAdminRefund.order.buyer.profile_image} alt="" className="w-8 h-8 rounded-full" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                      <User className="w-4 h-4 text-gray-400" />
                    </div>
                  )}
                  <div>
                    <Typography variant="body2" className="font-medium">
                      {selectedAdminRefund.order?.buyer?.name || '구매자'}
                    </Typography>
                    {selectedAdminRefund.order?.buyer?.member_code && (
                      <Typography variant="caption" className="text-gray-500">
                        {selectedAdminRefund.order.buyer.member_code}
                      </Typography>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 환불 사유 */}
            {selectedAdminRefund.reason && (
              <div>
                <Typography variant="body2" className="font-medium mb-2">환불 사유</Typography>
                <div className="bg-gray-50 rounded-xl p-4">
                  <Typography variant="body2" className="text-gray-600">
                    {selectedAdminRefund.reason}
                  </Typography>
                </div>
              </div>
            )}

            {/* 거절 사유 (거절된 경우) */}
            {selectedAdminRefund.status === 'rejected' && selectedAdminRefund.rejection_reason && (
              <div>
                <Typography variant="body2" className="font-medium mb-2 text-red-600">거절 사유</Typography>
                <div className="bg-red-50 rounded-xl p-4">
                  <Typography variant="body2" className="text-red-600">
                    {selectedAdminRefund.rejection_reason}
                  </Typography>
                </div>
              </div>
            )}

            {/* 처리 완료 날짜 */}
            {selectedAdminRefund.processed_date && (
              <div className="bg-gray-50 rounded-xl p-4">
                <div className="flex justify-between">
                  <Typography variant="body2" className="text-gray-500">처리일시</Typography>
                  <Typography variant="body2">
                    {new Date(selectedAdminRefund.processed_date).toLocaleDateString('ko-KR', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Typography>
                </div>
              </div>
            )}

            {/* 환불 처리 버튼 (대기 중인 경우만) */}
            {selectedAdminRefund.status === 'requested' && (
              <div className="pt-4 border-t space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">거절 사유 (거절 시 필수)</label>
                  <textarea
                    value={refundRejectionReason}
                    onChange={(e) => setRefundRejectionReason(e.target.value)}
                    placeholder="거절하시려면 사유를 입력해주세요"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F] resize-none"
                    rows={3}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={async () => {
                      if (!refundRejectionReason.trim()) {
                        toast.error('거절 사유를 입력해주세요.');
                        return;
                      }
                      setIsProcessingRefund(true);
                      try {
                        const response = await storeRefundsApi.adminProcess(selectedAdminRefund.refund_id, {
                          action: 'reject',
                          rejection_reason: refundRejectionReason.trim(),
                        });
                        if (response.success) {
                          toast.success('환불 요청이 거절되었습니다.');
                          setIsRefundDetailOpen(false);
                          setSelectedAdminRefund(null);
                          setRefundRejectionReason('');
                          fetchAdminRefunds();
                        } else {
                          toast.error(response.error?.message || '환불 거절에 실패했습니다.');
                        }
                      } catch (error: any) {
                        toast.error(error.message || '환불 거절에 실패했습니다.');
                      } finally {
                        setIsProcessingRefund(false);
                      }
                    }}
                    disabled={isProcessingRefund}
                    className="flex-1 text-red-500 border-red-200 hover:bg-red-50"
                  >
                    {isProcessingRefund ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 mr-1" />
                        거절
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={async () => {
                      setIsProcessingRefund(true);
                      try {
                        const response = await storeRefundsApi.adminProcess(selectedAdminRefund.refund_id, {
                          action: 'approve',
                        });
                        if (response.success) {
                          toast.success('환불이 완료되었습니다.');
                          setIsRefundDetailOpen(false);
                          setSelectedAdminRefund(null);
                          fetchAdminRefunds();
                        } else {
                          toast.error(response.error?.message || '환불 승인에 실패했습니다.');
                        }
                      } catch (error: any) {
                        toast.error(error.message || '환불 승인에 실패했습니다.');
                      } finally {
                        setIsProcessingRefund(false);
                      }
                    }}
                    disabled={isProcessingRefund}
                    className="flex-1 bg-[#FE3A8F] text-white hover:bg-[#e8a0c0]"
                  >
                    {isProcessingRefund ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-1" />
                        환불 승인
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </SlideSheet>

      {/* 정산율 수정 팝업 */}
      <SlideSheet
        isOpen={isRateEditOpen}
        onClose={() => {
          setIsRateEditOpen(false);
          setEditingPartnerRate(null);
          setEditRateValue('');
          setEditShareRateValue('');
        }}
        title="정산율/배분율 수정"
        footer={
          <div className="flex gap-3 px-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsRateEditOpen(false);
                setEditingPartnerRate(null);
                setEditRateValue('');
                setEditShareRateValue('');
              }}
              className="flex-1"
              disabled={isUpdatingPartnerRate}
            >
              취소
            </Button>
            <Button
              onClick={handleUpdatePartnerRate}
              disabled={isUpdatingPartnerRate}
              className="flex-1 bg-[#FE3A8F] text-white"
            >
              {isUpdatingPartnerRate ? '저장 중...' : '저장'}
            </Button>
          </div>
        }
      >
        {editingPartnerRate && (
          <div className="space-y-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <Typography variant="body2" className="font-medium mb-1">
                {editingPartnerRate.partner?.partner_name}
              </Typography>
              <Typography variant="caption" className="text-gray-500">
                현재 정산율: {editingPartnerRate.distribution_rate ?? editingPartnerRate.partner?.default_distribution_rate ?? 70}%
              </Typography>
              {editingPartnerRate.share_rate != null && (
                <Typography variant="caption" className="text-blue-500 block">
                  현재 배분율: {editingPartnerRate.share_rate}%
                </Typography>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                정산율 (0~100) *
              </label>
              <div className="relative">
                <Input
                  type="number"
                  value={editRateValue}
                  onChange={(e) => setEditRateValue(e.target.value)}
                  placeholder="정산율 입력"
                  min="0"
                  max="100"
                  className="w-full pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
              </div>
              <Typography variant="caption" className="text-gray-500 mt-1 block">
                파트너가 받는 수익 비율입니다.
              </Typography>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                배분율 (0~100)
              </label>
              <div className="relative">
                <Input
                  type="number"
                  value={editShareRateValue}
                  onChange={(e) => setEditShareRateValue(e.target.value)}
                  placeholder="배분율 입력 (미설정 시 비워두세요)"
                  min="0"
                  max="100"
                  className="w-full pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">%</span>
              </div>
              <Typography variant="caption" className="text-gray-500 mt-1 block">
                다수 파트너 간 수익 분배 비율입니다. 비워두면 미설정 상태입니다.
              </Typography>
            </div>
          </div>
        )}
      </SlideSheet>

      {/* 협업 요청 상세 팝업 */}
      <SlideSheet
        isOpen={isRequestDetailOpen}
        onClose={() => {
          setIsRequestDetailOpen(false);
          setSelectedRequest(null);
        }}
        title="협업 요청 상세"
      >
        {selectedRequest && (
          <div className="space-y-4">
            {/* 상품 정보 */}
            {selectedRequest.product && (
              <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
                {selectedRequest.product.thumbnail_url && (
                  <img
                    src={selectedRequest.product.thumbnail_url}
                    alt={selectedRequest.product.name}
                    className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <Typography variant="body2" className="font-medium">
                    {selectedRequest.product.name}
                  </Typography>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${REQUEST_STATUS_COLOR[selectedRequest.status]}`}>
                      {REQUEST_STATUS_LABEL[selectedRequest.status]}
                    </span>
                  </div>
                  <Typography variant="caption" className="text-gray-500 mt-1 block">
                    {PRODUCT_TYPE_LABEL[selectedRequest.product.product_type]} • {formatPrice(selectedRequest.product.price)}
                  </Typography>
                </div>
              </div>
            )}

            {/* 요청 정보 */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <div className="flex justify-between">
                <Typography variant="body2" className="text-gray-500">요청일시</Typography>
                <Typography variant="body2">
                  {formatDate(selectedRequest.created_at)}
                </Typography>
              </div>
              {selectedRequest.distribution_rate !== undefined && (
                <div className="flex justify-between">
                  <Typography variant="body2" className="text-gray-500">배분율</Typography>
                  <Typography variant="body2" className="font-medium text-purple-600">
                    {selectedRequest.distribution_rate}%
                  </Typography>
                </div>
              )}
              {selectedRequest.updated_at && (
                <div className="flex justify-between">
                  <Typography variant="body2" className="text-gray-500">처리일시</Typography>
                  <Typography variant="body2">
                    {formatDate(selectedRequest.updated_at)}
                  </Typography>
                </div>
              )}
            </div>

            {/* 파트너 정보 */}
            {selectedRequest.partner && (
              <div>
                <Typography variant="body2" className="font-medium mb-3 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  파트너 정보
                </Typography>
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    {selectedRequest.partner.member?.profile_image ? (
                      <img
                        src={selectedRequest.partner.member.profile_image}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                        <User className="h-5 w-5 text-gray-400" />
                      </div>
                    )}
                    <div>
                      <Typography variant="body2" className="font-medium">
                        {selectedRequest.partner.partner_name}
                      </Typography>
                      {selectedRequest.partner.member?.name && (
                        <Typography variant="caption" className="text-gray-500">
                          {selectedRequest.partner.member.name}
                        </Typography>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 거절 사유 */}
            {selectedRequest.status === 'rejected' && selectedRequest.rejection_reason && (
              <div>
                <Typography variant="body2" className="font-medium mb-3 text-red-600">
                  거절 사유
                </Typography>
                <div className="bg-red-50 rounded-xl p-4">
                  <Typography variant="body2" className="text-red-700">
                    {selectedRequest.rejection_reason}
                  </Typography>
                </div>
              </div>
            )}
          </div>
        )}
      </SlideSheet>

      {/* 출고 요청 상세 팝업 */}
      <SlideSheet
        isOpen={isShipmentDetailOpen}
        onClose={() => {
          setIsShipmentDetailOpen(false);
          setSelectedShipmentForDetail(null);
          setDeliveryEvents(null);
          setIsDeliveryTrackingExpanded(false);
        }}
        title="출고 요청 상세"
        footer={
          selectedShipmentForDetail?.status === 'pending' ? (
            <div className="flex gap-3 px-4">
              <Button
                onClick={() => {
                  setSelectedShipment(selectedShipmentForDetail);
                  setShipmentAction('reject');
                  setRejectionReason('');
                  setIsShipmentDetailOpen(false);
                  setIsShipmentSheetOpen(true);
                }}
                variant="outline"
                className="flex-1 text-red-600 border-red-300"
              >
                <XCircle className="h-4 w-4 mr-2" />
                거절
              </Button>
              <Button
                onClick={() => {
                  setSelectedShipment(selectedShipmentForDetail);
                  setShipmentAction('approve');
                  setCourier('');
                  setTrackingNumber('');
                  setSelectedPickupDate(null);
                  setSelectedPickupTimeSlot(null);
                  setIsShipmentDetailOpen(false);
                  setIsShipmentSheetOpen(true);
                }}
                className="flex-1 bg-[#FE3A8F] text-white"
              >
                <Truck className="h-4 w-4 mr-2" />
                {((selectedShipmentForDetail as any)?.order?.order_items?.[0]?.product_type === 'on_site' || selectedShipmentForDetail?.product?.product_type === 'on_site') ? '일정 컨펌' : '출고 처리'}
              </Button>
            </div>
          ) : undefined
        }
      >
        {selectedShipmentForDetail && (() => {
          const detailData = selectedShipmentForDetail as any;
          const orderItem = detailData.order?.order_items?.[0];
          const shipment = detailData.order?.shipments?.[0];
          const buyer = detailData.order?.buyer;
          const productName = orderItem?.product_name || detailData.product?.name || '상품 정보 로딩 중...';
          const productType = orderItem?.product_type || detailData.product?.product_type;
          
          return (
          <div className="space-y-4">
            {/* 상품 정보 */}
            <div className="flex gap-3">
              {detailData.product?.thumbnail_url ? (
                <img
                  src={detailData.product.thumbnail_url}
                  alt={productName}
                  className="w-20 h-20 rounded-lg object-cover"
                />
              ) : (
                <div className="w-20 h-20 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Package className="h-8 w-8 text-gray-400" />
                </div>
              )}
              <div className="flex-1">
                <Typography variant="body1" className="font-medium">
                  {productName}
                </Typography>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs px-2 py-1 rounded-full ${SHIPMENT_STATUS_COLOR[selectedShipmentForDetail.status]}`}>
                    {SHIPMENT_STATUS_LABEL[selectedShipmentForDetail.status]}
                  </span>
                  {productType && (
                    <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                      {productType === 'delivery' ? '택배' : productType === 'digital' ? '디지털' : '현장수령'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 선택 옵션 */}
            {orderItem?.selected_options && orderItem.selected_options.length > 0 && (
              <div className="bg-purple-50 rounded-xl p-4 space-y-2">
                <Typography variant="body2" className="font-medium text-purple-700 mb-2">선택 옵션</Typography>
                {orderItem.selected_options.map((opt: any, idx: number) => (
                  <div key={idx} className="flex justify-between items-start">
                    <Typography variant="caption" className="text-purple-600">{opt.option_name}</Typography>
                    <div className="text-right">
                      <Typography variant="caption" className="text-gray-700 block">
                        {opt.option_type === 'text' ? opt.text_value : opt.choice_name || opt.text_value}
                      </Typography>
                      {opt.price_adjustment > 0 && (
                        <Typography variant="caption" className="text-purple-500">+{opt.price_adjustment.toLocaleString()}원</Typography>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 주문 정보 */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <div className="flex justify-between">
                <Typography variant="body2" className="text-gray-500">주문번호</Typography>
                <Typography variant="body2" className="font-medium">
                  {selectedShipmentForDetail.order?.order_number}
                </Typography>
              </div>
              <div className="flex justify-between">
                <Typography variant="body2" className="text-gray-500">요청일시</Typography>
                <Typography variant="body2">
                  {formatDate(selectedShipmentForDetail.created_at)}
                </Typography>
              </div>
              <div className="flex justify-between">
                <Typography variant="body2" className="text-gray-500">수량</Typography>
                <Typography variant="body2">{orderItem?.quantity || 1}개</Typography>
              </div>
              {(orderItem?.subtotal != null || detailData.order?.total_amount != null) && (
                <div className="flex justify-between">
                  <Typography variant="body2" className="text-gray-500">상품금액</Typography>
                  <Typography variant="body2">{(orderItem?.subtotal || detailData.order?.total_amount || 0).toLocaleString()}원</Typography>
                </div>
              )}
              {(shipment?.shipping_fee != null && shipment.shipping_fee > 0) && (
                <div className="flex justify-between">
                  <Typography variant="body2" className="text-gray-500">배송비</Typography>
                  <Typography variant="body2" className="text-blue-600 font-medium">+{shipment.shipping_fee.toLocaleString()}원</Typography>
                </div>
              )}
            </div>

            {/* 구매자 정보 */}
            {buyer && (
              <div>
                <Typography variant="body2" className="font-medium mb-3 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  구매자 정보
                </Typography>
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    {buyer.profile_image ? (
                      <img
                        src={buyer.profile_image}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                        <User className="h-5 w-5 text-gray-400" />
                      </div>
                    )}
                    <div>
                      <Typography variant="body2" className="font-medium">
                        {buyer.name || buyer.username}
                      </Typography>
                      {buyer.member_code && (
                        <Typography variant="caption" className="text-gray-500">
                          {buyer.member_code}
                        </Typography>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 배송지 정보 */}
            {shipment && (shipment.recipient_name || shipment.recipient_address) && (
              <div>
                <Typography variant="body2" className="font-medium mb-3">배송지 정보</Typography>
                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  {shipment.recipient_name && (
                    <Typography variant="body2">
                      {shipment.recipient_name}
                    </Typography>
                  )}
                  {shipment.recipient_phone && (
                    <Typography variant="caption" className="text-gray-600 block">
                      {shipment.recipient_phone}
                    </Typography>
                  )}
                  {shipment.recipient_address && (
                    <Typography variant="caption" className="text-gray-600 block">
                      {shipment.recipient_postal_code && `[${shipment.recipient_postal_code}] `}
                      {shipment.recipient_address}
                    </Typography>
                  )}
                  {shipment.delivery_memo && (
                    <Typography variant="caption" className="text-gray-500 block">
                      배송메모: {shipment.delivery_memo}
                    </Typography>
                  )}
                </div>
              </div>
            )}

            {/* 현장수령 위치 정보 (on_site 상품) */}
            {productType === 'on_site' && detailData.order?.reserved_location && (
              <div>
                <Typography variant="body2" className="font-medium mb-3 flex items-center gap-2">
                  📍 수령 위치
                </Typography>
                <div className="bg-blue-50 rounded-xl p-4">
                  <Typography variant="body2" className="text-blue-700">
                    {detailData.order.reserved_location}
                  </Typography>
                </div>
              </div>
            )}

            {/* 수령 일정 정보 (on_site 상품, 컨펌 완료 시) */}
            {productType === 'on_site' && (detailData.order?.reserved_start_time || detailData.pickup_date || detailData.pickup_time) && (
              <div>
                <Typography variant="body2" className="font-medium mb-3">수령 일정 (확정)</Typography>
                <div className="bg-blue-50 rounded-xl p-4 space-y-2">
                  {detailData.order?.reserved_start_time ? (
                    <Typography variant="body2" className="text-blue-700">
                      일시: {new Date(detailData.order.reserved_start_time).toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })}
                      {detailData.order?.reserved_end_time && ` ~ ${new Date(detailData.order.reserved_end_time).toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`}
                    </Typography>
                  ) : (
                    <>
                      {detailData.pickup_date && (
                        <Typography variant="body2" className="text-blue-700">
                          날짜: {new Date(detailData.pickup_date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
                        </Typography>
                      )}
                      {detailData.pickup_time && (
                        <Typography variant="body2" className="text-blue-700">
                          시간: {detailData.pickup_time}
                        </Typography>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* 파트너 정보 */}
            {selectedShipmentForDetail.partner && (
              <div>
                <Typography variant="body2" className="font-medium mb-3">담당 파트너</Typography>
                <div className="bg-gray-50 rounded-xl p-4">
                  <Typography variant="body2">{selectedShipmentForDetail.partner.partner_name}</Typography>
                </div>
              </div>
            )}

            {/* 이행완료 정보 */}
            <div>
              <Typography variant="body2" className="font-medium mb-3 flex items-center gap-2">
                <CheckCircle className="h-4 w-4" />
                이행완료 정보
              </Typography>
              {isFulfillmentLoading ? (
                <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                </div>
              ) : orderFulfillments.length > 0 ? (
                <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                  {orderFulfillments.map((fulfillment) => (
                    <div key={fulfillment.id}>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {fulfillment.media_urls.map((url, idx) => (
                          <img
                            key={idx}
                            src={url}
                            alt={`이행완료 사진 ${idx + 1}`}
                            className="w-20 h-20 object-cover rounded-lg cursor-pointer hover:opacity-80 transition-opacity"
                            onClick={() => window.open(url, '_blank')}
                          />
                        ))}
                      </div>
                      {fulfillment.note && (
                        <Typography variant="body2" className="text-green-700 mb-2">
                          메모: {fulfillment.note}
                        </Typography>
                      )}
                      <Typography variant="caption" className="text-green-600">
                        등록일시: {formatDate(fulfillment.created_at)}
                      </Typography>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-gray-50 rounded-xl p-4">
                  <Typography variant="caption" className="text-gray-500">
                    아직 이행완료가 등록되지 않았습니다
                  </Typography>
                </div>
              )}
            </div>

            {/* 택배 정보 (출고 완료 시) */}
            {selectedShipmentForDetail.courier && selectedShipmentForDetail.tracking_number && (
              <div>
                <Typography variant="body2" className="font-medium mb-3">배송 정보</Typography>
                <div className="bg-blue-50 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Truck className="h-5 w-5 text-blue-600" />
                      <Typography variant="body2" className="text-blue-600 font-medium">
                        {selectedShipmentForDetail.courier}
                      </Typography>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        if (isDeliveryTrackingExpanded && deliveryEvents) {
                          setIsDeliveryTrackingExpanded(false);
                          return;
                        }
                        
                        setIsLoadingDeliveryEvents(true);
                        try {
                          const orderId = (selectedShipmentForDetail as any).order_id;
                          if (orderId) {
                            const response = await storeOrdersApi.getDetail(orderId);
                            if (response.success && response.data) {
                              const orderData = response.data as any;
                              const events = orderData.delivery_events || orderData.shipments?.[0]?.delivery_events || [];
                              if (events.length > 0) {
                                setDeliveryEvents(events);
                                setIsDeliveryTrackingExpanded(true);
                              } else {
                                toast.error('배송 추적 정보가 아직 없습니다.');
                              }
                            }
                          } else {
                            toast.error('주문 정보를 찾을 수 없습니다.');
                          }
                        } catch (error) {
                          console.error('배송 추적 조회 실패:', error);
                          toast.error('배송 추적 조회에 실패했습니다.');
                        } finally {
                          setIsLoadingDeliveryEvents(false);
                        }
                      }}
                      disabled={isLoadingDeliveryEvents}
                      className="text-sm text-[#FE3A8F] font-medium hover:underline disabled:opacity-50"
                    >
                      {isLoadingDeliveryEvents ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : isDeliveryTrackingExpanded ? '접기' : '배송 추적'}
                    </button>
                  </div>
                  <Typography variant="body2" className="mt-2">
                    송장번호: {selectedShipmentForDetail.tracking_number}
                  </Typography>
                  
                  {/* 배송 추적 정보 표시 */}
                  {isDeliveryTrackingExpanded && deliveryEvents && deliveryEvents.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-blue-200">
                      <Typography variant="caption" className="font-medium text-blue-700 mb-3 block">
                        배송 추적 내역
                      </Typography>
                      <div className="space-y-3 max-h-64 overflow-y-auto">
                        {[...deliveryEvents].reverse().map((event: any, idx: number) => (
                          <div key={idx} className="flex gap-3 text-sm">
                            <div className="flex flex-col items-center">
                              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${idx === 0 ? 'bg-[#FE3A8F]' : 'bg-gray-300'}`} />
                              {idx < deliveryEvents.length - 1 && <div className="w-0.5 flex-1 bg-gray-200 mt-1" />}
                            </div>
                            <div className="flex-1 pb-3">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Typography variant="caption" className="text-gray-500">
                                  {event.time ? new Date(event.time).toLocaleString('ko-KR', {
                                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                  }) : ''}
                                </Typography>
                                {event.statusText && (
                                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                                    event.status === 'DELIVERED' ? 'bg-green-100 text-green-600' :
                                    event.status === 'OUT_FOR_DELIVERY' ? 'bg-purple-100 text-purple-600' :
                                    event.status === 'IN_TRANSIT' ? 'bg-blue-100 text-blue-600' :
                                    'bg-yellow-100 text-yellow-600'
                                  }`}>
                                    {event.statusText}
                                  </span>
                                )}
                              </div>
                              <Typography variant="caption" className={idx === 0 ? 'text-gray-900 font-medium' : 'text-gray-600'}>
                                {event.description}
                              </Typography>
                              {event.location && (
                                <Typography variant="caption" className="text-gray-400 block">
                                  {event.location}
                                </Typography>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          );
        })()}
      </SlideSheet>

      {/* 수령 장소 지도 선택 */}
      <LocationPickerSheet
        isOpen={isLocationPickerOpen}
        onClose={() => setIsLocationPickerOpen(false)}
        onConfirm={(result: LocationResult) => {
          setNewProductPickupLocation(result.address);
          setNewProductPickupLocationPoint({ lat: result.lat, lng: result.lng });
          setIsLocationPickerOpen(false);
        }}
        initialAddress={newProductPickupLocation}
      />
    </div>
  );
}
