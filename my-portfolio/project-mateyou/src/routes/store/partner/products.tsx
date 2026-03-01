import { createFileRoute, useNavigate, Outlet, useMatches } from '@tanstack/react-router';
import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit, Trash2, Loader2, Eye, EyeOff, ChevronRight, MapPin, Calendar, User, Truck, Search, ChevronDown, ChevronUp, CheckCircle, XCircle, CalendarDays, RefreshCcw, X, ArrowRight, ArrowLeft, FileText, Image as ImageIcon, TrendingUp, Package, Camera } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import { useAuth } from '@/hooks/useAuth';
import { storeProductsApi } from '@/api/store/products';
import { storeOrdersApi } from '@/api/store/orders';
import { storeRefundsApi } from '@/api/store/refunds';
import { storeCollaborationApi, type CollaborationProductRequest, type OrderFulfillment } from '@/api/store/collaboration';
import { storeSchedulesApi, type StoreSchedule } from '@/api/store/schedules';
import type { StoreProduct } from '@/api/store';
import { ProductCard } from '@/components/features/store/ProductCard';
import { Button, Typography, SlideSheet, StoreLoadingState, StoreEmptyState, StoreErrorState, Input } from '@/components';
import { LocationPickerSheet, type LocationResult } from '@/components/ui/LocationPickerSheet';
import { toast } from 'sonner';
import { edgeApi } from '@/lib/edgeApi';
import { productDraftStorage } from '@/utils/productDraftStorage';
import { convertPdfToImage } from '@/utils/pdfToImage';

export const Route = createFileRoute('/store/partner/products')({
  component: PartnerProductsPage,
  validateSearch: (search: Record<string, unknown>) => ({
    tab: search.tab as 'products' | 'orders' | 'refunds' | undefined,
    orderId: search.orderId as string | undefined,
  }),
});

type TabType = 'products' | 'orders' | 'refunds';
type ProductSubTab = 'personal' | 'collaboration';
type OrderSubTab = 'personal' | 'collaboration';
type OrderStatus = 'all' | 'paid' | 'shipped' | 'delivered' | 'confirmed' | 'cancelled';
type RefundStatus = 'all' | 'requested' | 'completed' | 'rejected';

interface OrderItem {
  order_item_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  product_type?: string;
  is_bundle_available?: boolean;
  product?: {
    product_id: string;
    name: string;
    price: number;
    product_type: string;
    thumbnail_url?: string;
    is_bundle_available?: boolean;
  };
}

interface Shipment {
  shipment_id: string;
  order_id?: string;
  status: string;
  courier?: string | null;
  tracking_number?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
  shipping_fee?: number;
  recipient_name?: string;
  recipient_phone?: string;
  recipient_address?: string;
  recipient_address_detail?: string;
  recipient_postal_code?: string;
  delivery_memo?: string;
  delivery_status?: string | null;
  delivery_status_text?: string | null;
  delivery_events?: any[];
  shipment_items?: {
    shipment_item_id: string;
    order_item_id: string;
    quantity: number;
    order_item?: OrderItem;
  }[];
}

interface PartnerOrder {
  order_id: string;
  order_number: string;
  status: string;
  quantity: number;
  total_amount: number;
  subtotal_amount?: number;
  total_shipping_fee?: number;
  created_at: string;
  recipient_name?: string;
  recipient_phone?: string;
  recipient_address?: string;
  recipient_address_detail?: string;
  recipient_postal_code?: string;
  delivery_memo?: string;
  courier?: string;
  tracking_number?: string;
  shipped_at?: string;
  delivered_at?: string;
  reserved_start_time?: string;
  reserved_end_time?: string;
  reserved_location?: string;
  is_confirmed: boolean;
  delivery_tracking?: {
    time?: string;
    status?: {
      code: string;
    };
    description?: string;
    events?: Array<{
      time?: string;
      status?: { code: string };
      description?: string;
    }>;
  };
  product?: {
    product_id: string;
    name: string;
    price: number;
    product_type: string;
    thumbnail_url?: string;
  };
  buyer?: {
    id: string;
    name: string;
    profile_image?: string;
  };
  order_items?: OrderItem[];
  shipments?: Shipment[];
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '결제 대기', color: 'bg-gray-100 text-gray-600' },
  paid: { label: '결제 완료', color: 'bg-blue-100 text-blue-600' },
  shipped: { label: '배송 중', color: 'bg-yellow-100 text-yellow-600' },
  delivered: { label: '배송 완료', color: 'bg-green-100 text-green-600' },
  confirmed: { label: '구매 확정', color: 'bg-purple-100 text-purple-600' },
  cancelled: { label: '취소됨', color: 'bg-red-100 text-red-600' },
  refund_requested: { label: '환불 요청', color: 'bg-orange-100 text-orange-600' },
  refunded: { label: '환불 완료', color: 'bg-red-100 text-red-600' },
};

const REFUND_STATUS_MAP: Record<string, { label: string; color: string }> = {
  requested: { label: '대기 중', color: 'bg-yellow-100 text-yellow-700' },
  completed: { label: '환불 완료', color: 'bg-green-100 text-green-700' },
  rejected: { label: '거절됨', color: 'bg-red-100 text-red-700' },
};

interface PartnerRefund {
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
    product?: {
      product_id: string;
      name: string;
      thumbnail_url?: string;
      product_type: string;
    };
    buyer?: {
      id: string;
      name: string;
      profile_image?: string;
      member_code?: string;
    };
  };
}

const PRODUCT_TYPE_MAP: Record<string, string> = {
  delivery: '택배 배송',
  digital: '디지털',
  on_site: '현장 수령',
  pickup: '픽업',
};

function PartnerProductsPage() {
  const navigate = useNavigate();
  const matches = useMatches();
  const { user, isLoading: userLoading } = useAuth();
  const { tab: searchTab, orderId: searchOrderId } = Route.useSearch();
  
  // 탭 상태
  const [activeTab, setActiveTab] = useState<TabType>('products');
  const [productSubTab, setProductSubTab] = useState<ProductSubTab>('personal');
  const [orderSubTab, setOrderSubTab] = useState<OrderSubTab>('personal');
  
  // 상품 관리 상태
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedProduct, setSelectedProduct] = useState<StoreProduct | null>(null);
  const [isDeleteSheetOpen, setIsDeleteSheetOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCheckingAgreement, setIsCheckingAgreement] = useState(true);
  
  // 상품 수정 팝업 상태
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [editProductDetail, setEditProductDetail] = useState<any>(null);
  const [isLoadingEditDetail, setIsLoadingEditDetail] = useState(false);
  const [editStep, setEditStep] = useState<1 | 2>(1);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStock, setEditStock] = useState('');
  const [editShippingFeeBase, setEditShippingFeeBase] = useState('');
  const [editShippingFeeRemote, setEditShippingFeeRemote] = useState('');
  const [editIsBundleAvailable, setEditIsBundleAvailable] = useState(false);
  const [editThumbnail, setEditThumbnail] = useState<File | null>(null);
  const [editThumbnailDeleted, setEditThumbnailDeleted] = useState(false);
  const [editImages, setEditImages] = useState<File[]>([]);
  const [editDigitalAssets, setEditDigitalAssets] = useState<File[]>([]);
  const [existingImages, setExistingImages] = useState<any[]>([]);
  const [existingDigitalAssets, setExistingDigitalAssets] = useState<any[]>([]);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editDigitalAssetType, setEditDigitalAssetType] = useState<'images' | 'pdf'>('images');
  const [editPdfPreviews, setEditPdfPreviews] = useState<Record<number, string>>({});
  const [isConvertingEditPdf, setIsConvertingEditPdf] = useState(false);
  
  // 스케줄 관련 상태 (현장수령 상품 수정 시)
  const [editSchedules, setEditSchedules] = useState<StoreSchedule[]>([]);
  const [newSchedules, setNewSchedules] = useState<Array<{ start_time: string; end_time: string; location?: string; location_point?: { lat: number; lng: number } }>>([]);
  const [removeScheduleIds, setRemoveScheduleIds] = useState<string[]>([]);
  const [isLoadingSchedules, setIsLoadingSchedules] = useState(false);
  const [scheduleLocationPickerOpen, setScheduleLocationPickerOpen] = useState(false);
  const [editingNewScheduleIndex, setEditingNewScheduleIndex] = useState<number | null>(null);

  // 주문 관리 상태
  const [orders, setOrders] = useState<PartnerOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<OrderStatus>('all');
  const [orderPage, setOrderPage] = useState(1);
  const [orderTotalPages, setOrderTotalPages] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<PartnerOrder | null>(null);
  const [isOrderDetailOpen, setIsOrderDetailOpen] = useState(false);
  const [orderCreatedFrom, setOrderCreatedFrom] = useState<string>('');
  const [orderCreatedTo, setOrderCreatedTo] = useState<string>('');

  // 협업 주문 관련 상태
  const [collabOrders, setCollabOrders] = useState<any[]>([]);
  const [collabOrdersLoading, setCollabOrdersLoading] = useState(false);
  const [collabOrdersError, setCollabOrdersError] = useState<string | null>(null);
  const [collabOrderPage, setCollabOrderPage] = useState(1);
  const [collabOrderTotalPages, setCollabOrderTotalPages] = useState(1);
  const [selectedCollabOrder, setSelectedCollabOrder] = useState<any | null>(null);
  const [isCollabOrderDetailOpen, setIsCollabOrderDetailOpen] = useState(false);
  const [isSubmittingShipment, setIsSubmittingShipment] = useState(false);
  const [shipmentNotes, setShipmentNotes] = useState('');
  
  // 이행완료 관련 상태
  const [fulfillmentFiles, setFulfillmentFiles] = useState<File[]>([]);
  const [fulfillmentNote, setFulfillmentNote] = useState('');
  const [isSubmittingFulfillment, setIsSubmittingFulfillment] = useState(false);
  const [orderFulfillments, setOrderFulfillments] = useState<OrderFulfillment[]>([]);
  const [isFulfillmentLoading, setIsFulfillmentLoading] = useState(false);
  
  // 송장 입력 관련 상태 (상품별)
  const [trackingInputItemId, setTrackingInputItemId] = useState<string | null>(null);
  const [trackingCourier, setTrackingCourier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [isSubmittingTracking, setIsSubmittingTracking] = useState(false);
  
  // 배송 조회 관련 상태
  const [isLoadingTracking, setIsLoadingTracking] = useState(false);
  const [trackingHistory, setTrackingHistory] = useState<any[] | null>(null);
  const [isTrackingExpanded, setIsTrackingExpanded] = useState(false);

  // 환불 관리 상태
  const [refunds, setRefunds] = useState<PartnerRefund[]>([]);
  const [refundsLoading, setRefundsLoading] = useState(false);
  const [refundsError, setRefundsError] = useState<string | null>(null);
  const [refundStatus, setRefundStatus] = useState<RefundStatus>('all');
  const [refundPage, setRefundPage] = useState(1);
  const [refundTotalPages, setRefundTotalPages] = useState(1);
  const [selectedRefund, setSelectedRefund] = useState<PartnerRefund | null>(null);
  const [isRefundDetailOpen, setIsRefundDetailOpen] = useState(false);
  const [isProcessingRefund, setIsProcessingRefund] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [refundCreatedFrom, setRefundCreatedFrom] = useState<string>('');
  const [refundCreatedTo, setRefundCreatedTo] = useState<string>('');

  // 협업 상품 상태 (수락된 협업 요청)
  const [collabProducts, setCollabProducts] = useState<CollaborationProductRequest[]>([]);
  const [collabProductsLoading, setCollabProductsLoading] = useState(false);
  const [collabProductsError, setCollabProductsError] = useState<string | null>(null);
  const [collabProductPage, setCollabProductPage] = useState(1);
  const [collabProductTotalPages, setCollabProductTotalPages] = useState(1);
  const [selectedCollabProduct, setSelectedCollabProduct] = useState<CollaborationProductRequest | null>(null);
  const [isCollabProductDetailOpen, setIsCollabProductDetailOpen] = useState(false);

  const refetchProducts = useCallback(async () => {
    if (!user || user.role !== 'partner') return;

    setIsLoading(true);
    setError(null);
    try {
      const response = await storeProductsApi.getMyProducts({
        include_inactive: includeInactive,
        page,
        limit: 20,
        source: 'partner',
      });

      if (response.success && response.data) {
        setProducts(Array.isArray(response.data) ? response.data : []);
        const pagination = (response as any).pagination;
        if (pagination) {
          setTotalPages(pagination.totalPages || 1);
        }
      } else {
        setError(response.error?.message || '상품 목록을 불러오는데 실패했습니다.');
      }
    } catch (err: any) {
      setError(err.message || '상품 목록을 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, includeInactive, page]);

  const fetchOrders = useCallback(async () => {
    if (!user || user.role !== 'partner') return;

    setOrdersLoading(true);
    setOrdersError(null);
    try {
      const params: { page?: number; limit?: number; status?: string; created_from?: string; created_to?: string; source?: string } = {
        page: orderPage,
        limit: 20,
        source: 'partner',
      };
      if (orderStatus !== 'all') {
        params.status = orderStatus;
      }
      if (orderCreatedFrom) {
        params.created_from = new Date(orderCreatedFrom).toISOString();
      }
      if (orderCreatedTo) {
        params.created_to = new Date(orderCreatedTo + 'T23:59:59').toISOString();
      }
      
      const response = await storeOrdersApi.getPartnerOrders(params);

      if (response.success && response.data) {
        setOrders(Array.isArray(response.data) ? response.data : []);
        const pagination = (response as any).pagination;
        if (pagination) {
          setOrderTotalPages(pagination.totalPages || 1);
        }
      } else {
        setOrdersError(response.error?.message || '주문 목록을 불러오는데 실패했습니다.');
      }
    } catch (err: any) {
      setOrdersError(err.message || '주문 목록을 불러오는데 실패했습니다.');
    } finally {
      setOrdersLoading(false);
    }
  }, [user?.id, orderStatus, orderPage, orderCreatedFrom, orderCreatedTo]);

  // 협업 주문 목록 조회
  const fetchCollabOrders = useCallback(async () => {
    if (!user || user.role !== 'partner') return;

    setCollabOrdersLoading(true);
    setCollabOrdersError(null);
    try {
      const response = await storeCollaborationApi.getPendingOrders({
        page: collabOrderPage,
        limit: 20,
      });

      if (response.success && response.data) {
        setCollabOrders(Array.isArray(response.data) ? response.data : []);
        const meta = (response as any).meta;
        if (meta) {
          setCollabOrderTotalPages(meta.totalPages || 1);
        }
      } else {
        setCollabOrdersError(response.error?.message || '협업 주문 목록을 불러오는데 실패했습니다.');
      }
    } catch (err: any) {
      setCollabOrdersError(err.message || '협업 주문 목록을 불러오는데 실패했습니다.');
    } finally {
      setCollabOrdersLoading(false);
    }
  }, [user?.id, collabOrderPage]);

  // 출고 요청 생성
  const handleCreateShipmentRequest = async (orderId: string, fromPersonalOrder = false, productId?: string) => {
    setIsSubmittingShipment(true);
    try {
      const response = await storeCollaborationApi.createShipmentRequest({
        order_id: orderId,
        product_id: productId,
        notes: shipmentNotes,
      });

      if (response.success) {
        toast.success('출고 요청이 생성되었습니다.');
        setShipmentNotes('');
        if (fromPersonalOrder) {
          setIsOrderDetailOpen(false);
          setSelectedOrder(null);
          fetchOrders();
        } else {
          setIsCollabOrderDetailOpen(false);
          setSelectedCollabOrder(null);
          fetchCollabOrders();
        }
      } else {
        toast.error(response.error?.message || '출고 요청 생성에 실패했습니다.');
      }
    } catch (err: any) {
      toast.error(err.message || '출고 요청 생성에 실패했습니다.');
    } finally {
      setIsSubmittingShipment(false);
    }
  };

  // 이행완료 조회
  const fetchFulfillments = useCallback(async (orderId: string) => {
    setIsFulfillmentLoading(true);
    try {
      const response = await storeCollaborationApi.getFulfillment(orderId);
      if (response.success && response.data) {
        const data = response.data as { fulfillments?: OrderFulfillment[] };
        setOrderFulfillments(data.fulfillments || []);
      }
    } catch (err) {
      console.error('이행완료 조회 실패:', err);
    } finally {
      setIsFulfillmentLoading(false);
    }
  }, []);

  // 이행완료 등록
  const handleSubmitFulfillment = async (orderId: string) => {
    if (fulfillmentFiles.length === 0) {
      toast.error('최소 1개 이상의 인증 사진을 등록해주세요.');
      return;
    }

    setIsSubmittingFulfillment(true);
    try {
      const response = await storeCollaborationApi.fulfillOrder(orderId, fulfillmentFiles, fulfillmentNote);
      if (response.success) {
        toast.success('이행완료가 등록되었습니다.');
        setFulfillmentFiles([]);
        setFulfillmentNote('');
        fetchFulfillments(orderId);
      } else {
        toast.error(response.error?.message || '이행완료 등록에 실패했습니다.');
      }
    } catch (err: any) {
      toast.error(err.message || '이행완료 등록에 실패했습니다.');
    } finally {
      setIsSubmittingFulfillment(false);
    }
  };

  // 이행완료 파일 선택
  const handleFulfillmentFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length !== files.length) {
      toast.error('이미지 파일만 업로드 가능합니다.');
    }
    setFulfillmentFiles(prev => [...prev, ...imageFiles]);
  };

  // 이행완료 파일 제거
  const removeFulfillmentFile = (index: number) => {
    setFulfillmentFiles(prev => prev.filter((_, i) => i !== index));
  };

  const fetchRefunds = useCallback(async () => {
    if (!user || user.role !== 'partner') return;

    setRefundsLoading(true);
    setRefundsError(null);
    try {
      const params: { page?: number; limit?: number; status?: string; created_from?: string; created_to?: string } = {
        page: refundPage,
        limit: 20,
      };
      if (refundStatus !== 'all') {
        params.status = refundStatus;
      }
      if (refundCreatedFrom) {
        params.created_from = new Date(refundCreatedFrom).toISOString();
      }
      if (refundCreatedTo) {
        params.created_to = new Date(refundCreatedTo + 'T23:59:59').toISOString();
      }
      
      const response = await storeRefundsApi.getPartnerList(params);

      if (response.success && response.data) {
        setRefunds(Array.isArray(response.data) ? response.data : []);
        const pagination = (response as any).pagination;
        if (pagination) {
          setRefundTotalPages(pagination.totalPages || 1);
        }
      } else {
        setRefundsError(response.error?.message || '환불 요청 목록을 불러오는데 실패했습니다.');
      }
    } catch (err: any) {
      setRefundsError(err.message || '환불 요청 목록을 불러오는데 실패했습니다.');
    } finally {
      setRefundsLoading(false);
    }
  }, [user?.id, refundStatus, refundPage, refundCreatedFrom, refundCreatedTo]);

  // 협업 상품 목록 조회 (수락된 협업 요청)
  const fetchCollabProducts = useCallback(async () => {
    if (!user || user.role !== 'partner') return;

    setCollabProductsLoading(true);
    setCollabProductsError(null);
    try {
      const response = await storeCollaborationApi.getProductRequests({
        page: collabProductPage,
        limit: 20,
        status: 'accepted',
      });

      if (response.success && response.data) {
        setCollabProducts(Array.isArray(response.data) ? response.data : []);
        const meta = (response as any).meta;
        if (meta) {
          setCollabProductTotalPages(meta.totalPages || 1);
        }
      } else {
        setCollabProductsError(response.error?.message || '협업 상품 목록을 불러오는데 실패했습니다.');
      }
    } catch (err: any) {
      setCollabProductsError(err.message || '협업 상품 목록을 불러오는데 실패했습니다.');
    } finally {
      setCollabProductsLoading(false);
    }
  }, [user?.id, collabProductPage]);

  // 동의 상태 확인
  useEffect(() => {
    if (userLoading || !user || user.role !== 'partner') {
      setIsCheckingAgreement(false);
      return;
    }

    let cancelled = false;

    const checkAgreement = async () => {
      setIsCheckingAgreement(true);
      try {
        const response = await edgeApi.partners.getInfo();
        
        if (cancelled) return;

        if (response.success && response.data) {
          const partnerData = response.data as any;
          const partner = partnerData.partner || partnerData;
          
          if (partner.is_seller === true) return;
          
          const needsAgreement = 
            !partner.store_terms_agreed ||
            !partner.store_prohibited_items_agreed ||
            !partner.store_fee_settlement_agreed ||
            !partner.store_privacy_agreed;

          if (needsAgreement) {
            navigate({ to: '/store/partner/agreement' });
            return;
          }
        }
      } catch (err: any) {
        console.error('동의 상태 확인 실패:', err);
      } finally {
        if (!cancelled) {
          setIsCheckingAgreement(false);
        }
      }
    };

    checkAgreement();

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role, userLoading]);

  // 개인 상품 목록 로드
  useEffect(() => {
    if (userLoading || !user || user.role !== 'partner' || activeTab !== 'products' || productSubTab !== 'personal') return;

    refetchProducts();
  }, [user?.id, user?.role, userLoading, includeInactive, page, activeTab, productSubTab]);

  // 협업 상품 목록 로드
  useEffect(() => {
    if (userLoading || !user || user.role !== 'partner' || activeTab !== 'products' || productSubTab !== 'collaboration') return;

    fetchCollabProducts();
  }, [user?.id, user?.role, userLoading, collabProductPage, activeTab, productSubTab]);

  // 개인 주문 목록 로드
  useEffect(() => {
    if (userLoading || !user || user.role !== 'partner' || activeTab !== 'orders' || orderSubTab !== 'personal') return;

    fetchOrders();
  }, [user?.id, user?.role, userLoading, orderStatus, orderPage, activeTab, orderSubTab, orderCreatedFrom, orderCreatedTo]);

  // 협업 주문 목록 로드
  useEffect(() => {
    if (userLoading || !user || user.role !== 'partner' || activeTab !== 'orders' || orderSubTab !== 'collaboration') return;

    fetchCollabOrders();
  }, [user?.id, user?.role, userLoading, collabOrderPage, activeTab, orderSubTab]);

  // 환불 목록 로드
  useEffect(() => {
    if (userLoading || !user || user.role !== 'partner' || activeTab !== 'refunds') return;

    fetchRefunds();
  }, [user?.id, user?.role, userLoading, refundStatus, refundPage, activeTab, refundCreatedFrom, refundCreatedTo]);

  // 권한 체크
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
  }, [user?.id, user?.role, userLoading]);

  // URL 파라미터로 탭 및 주문 열기 처리
  useEffect(() => {
    if (searchTab) {
      setActiveTab(searchTab);
    }
  }, [searchTab]);

  // URL 파라미터로 특정 주문 열기
  useEffect(() => {
    if (searchOrderId && searchTab === 'orders' && orders.length > 0) {
      const targetOrder = orders.find(o => o.order_id === searchOrderId);
      if (targetOrder) {
        setSelectedOrder(targetOrder);
        setIsOrderDetailOpen(true);
        navigate({ to: '/store/partner/products', search: { tab: 'orders', orderId: undefined }, replace: true });
      }
    }
  }, [searchOrderId, searchTab, orders]);

  // 중첩 라우트 확인
  const lastMatch = matches[matches.length - 1];
  const isNestedRouteActive = lastMatch?.routeId && lastMatch.routeId !== Route.id;

  if (isNestedRouteActive) {
    return <Outlet />;
  }

  if (userLoading || isCheckingAgreement) {
    return (
      <div className="min-h-screen bg-gray-50 pt-16 pb-20">
        <div className="container mx-auto px-4 py-6">
          <StoreLoadingState />
        </div>
      </div>
    );
  }

  const handleDelete = async () => {
    if (!selectedProduct) return;

    setIsDeleting(true);
    try {
      const response = await edgeApi.storeProducts.delete(selectedProduct.product_id);

      if (response.success) {
        toast.success('상품이 삭제되었습니다.');
        setIsDeleteSheetOpen(false);
        setSelectedProduct(null);
        refetchProducts();
      } else {
        toast.error(response.error?.message || '상품 삭제에 실패했습니다.');
      }
    } catch (err: any) {
      toast.error(err.message || '상품 삭제에 실패했습니다.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleActive = async (product: StoreProduct) => {
    try {
      const formData = new FormData();
      formData.append('name', product.name);
      formData.append('description', product.description || '');
      formData.append('price', product.price.toString());
      formData.append('product_type', product.product_type);
      formData.append('stock', product.stock?.toString() || '');
      formData.append('is_active', (!product.is_active).toString());

      const response = await edgeApi.storeProducts.update(product.product_id, formData);

      if (response.success) {
        toast.success(product.is_active ? '상품이 비활성화되었습니다.' : '상품이 활성화되었습니다.');
        refetchProducts();
      } else {
        toast.error(response.error?.message || '상품 상태 변경에 실패했습니다.');
      }
    } catch (err: any) {
      toast.error(err.message || '상품 상태 변경에 실패했습니다.');
    }
  };

  // 상품 수정 팝업 열기
  const openEditSheet = async (product: StoreProduct) => {
    setSelectedProduct(product);
    setIsEditSheetOpen(true);
    setIsLoadingEditDetail(true);
    setEditStep(1);
    
    // 스케줄 관련 상태 초기화
    setEditSchedules([]);
    setNewSchedules([]);
    setRemoveScheduleIds([]);
    
    try {
      const response = await storeProductsApi.getDetail(product.product_id);
      if (response.success && response.data) {
        const detail = response.data as any;
        setEditProductDetail(detail);
        setEditName(detail.name || '');
        setEditPrice(detail.price?.toString() || '');
        setEditDescription(detail.description || '');
        setEditStock(detail.stock?.toString() || '');
        setEditShippingFeeBase(detail.shipping_fee_base?.toString() || '');
        setEditShippingFeeRemote(detail.shipping_fee_remote?.toString() || '');
        setEditIsBundleAvailable(detail.is_bundle_available || false);
        setExistingImages(detail.images || []);
        setExistingDigitalAssets(detail.digital_assets || []);
        setEditThumbnail(null);
        setEditThumbnailDeleted(false);
        setEditImages([]);
        setEditDigitalAssets([]);
        setEditDigitalAssetType('images');
        setEditPdfPreviews({});
        
        // 현장수령 상품인 경우 스케줄 로드
        if (product.product_type === 'on_site') {
          setIsLoadingSchedules(true);
          try {
            const scheduleResponse = await storeSchedulesApi.getList({
              product_id: product.product_id,
            });
            if (scheduleResponse.success && scheduleResponse.data) {
              const schedulesData = Array.isArray(scheduleResponse.data) ? scheduleResponse.data : [];
              setEditSchedules(schedulesData);
            }
          } catch (scheduleErr) {
            console.error('스케줄 로드 실패:', scheduleErr);
          } finally {
            setIsLoadingSchedules(false);
          }
        }
      }
    } catch (err) {
      console.error('상품 상세 로드 실패:', err);
      toast.error('상품 정보를 불러오는데 실패했습니다.');
    } finally {
      setIsLoadingEditDetail(false);
    }
  };

  // URL을 Blob으로 변환
  const urlToBlob = async (url: string): Promise<Blob | null> => {
    try {
      const response = await fetch(url);
      return await response.blob();
    } catch {
      return null;
    }
  };

  // 상품 수정 저장
  const handleSaveEdit = async () => {
    if (!selectedProduct) return;
    
    setIsSavingEdit(true);
    try {
      const formData = new FormData();
      formData.append('name', editName);
      formData.append('description', editDescription);
      formData.append('price', editPrice);
      formData.append('product_type', selectedProduct.product_type);
      
      if (selectedProduct.product_type !== 'digital') {
        formData.append('stock', editStock);
      }
      
      if (selectedProduct.product_type === 'delivery') {
        formData.append('shipping_fee_base', editShippingFeeBase || '0');
        formData.append('shipping_fee_remote', editShippingFeeRemote || '0');
        formData.append('is_bundle_available', editIsBundleAvailable.toString());
      }
      
      if (editThumbnail) {
        formData.append('thumbnail', editThumbnail);
      }
      
      // 기존 이미지를 blob으로 변환 후 새 이미지와 합쳐서 전송
      const existingImageBlobs = await Promise.all(
        existingImages.map(async (img) => {
          const url = img.image_url || img.url;
          if (url) {
            const blob = await urlToBlob(url);
            if (blob) {
              const ext = url.split('.').pop()?.split('?')[0] || 'jpg';
              return new File([blob], `existing_${img.image_id || img.id}.${ext}`, { type: blob.type });
            }
          }
          return null;
        })
      );
      const allImages = [...existingImageBlobs.filter(Boolean) as File[], ...editImages];
      allImages.forEach((file) => {
        formData.append('images[]', file);
      });
      
      // 디지털 자산 (디지털 상품 또는 현장 수령 상품)
      if (selectedProduct.product_type === 'digital' || selectedProduct.product_type === 'on_site') {
        // 기존 디지털 자산을 blob으로 변환 후 새 자산과 합쳐서 전송
        const existingAssetBlobs = await Promise.all(
          existingDigitalAssets.map(async (asset) => {
            const url = asset.asset_url || asset.file_url;
            if (url) {
              const blob = await urlToBlob(url);
              if (blob) {
                const ext = url.split('.').pop()?.split('?')[0] || 'jpg';
                return new File([blob], `existing_${asset.asset_id || asset.id}.${ext}`, { type: blob.type });
              }
            }
            return null;
          })
        );
        const allDigitalAssets = [...existingAssetBlobs.filter(Boolean) as File[], ...editDigitalAssets];
        allDigitalAssets.forEach((file) => {
          formData.append('digital_assets[]', file);
        });
      }
      
      // 스케줄 추가/삭제 (현장수령 상품만)
      if (selectedProduct.product_type === 'on_site') {
        if (newSchedules.length > 0) {
          formData.append('add_schedules', JSON.stringify(newSchedules));
        }
        if (removeScheduleIds.length > 0) {
          formData.append('remove_schedule_ids', JSON.stringify(removeScheduleIds));
        }
      }
      
      const response = await edgeApi.storeProducts.update(selectedProduct.product_id, formData);
      
      if (response.success) {
        toast.success('상품이 수정되었습니다.');
        setIsEditSheetOpen(false);
        setEditStep(1);
        refetchProducts();
      } else {
        toast.error(response.error?.message || '상품 수정에 실패했습니다.');
      }
    } catch (err: any) {
      toast.error(err.message || '상품 수정에 실패했습니다.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatPrice = (price: number) => {
    return price.toLocaleString('ko-KR') + '원';
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

  return (
    <div className="min-h-screen pt-16 pb-20">
      <div className="container mx-auto px-4 pt-4 pb-20">
        {/* 인사이트 버튼 */}
        <div className="flex justify-end mb-4">
          <button
            onClick={() => navigate({ to: '/store/partner/insights' })}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#FE3A8F] to-[#FF6B9D] text-white rounded-full text-sm font-medium shadow-sm hover:shadow-md transition-shadow"
          >
            <TrendingUp className="h-4 w-4" />
            판매 인사이트
          </button>
        </div>

        {/* 탭 헤더 */}
        <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-full">
          <button
            onClick={() => setActiveTab('products')}
            className={`flex-1 py-2 px-3 rounded-full font-medium transition-all text-sm ${
              activeTab === 'products'
                ? 'bg-white text-[#FE3A8F] shadow-sm'
                : 'text-gray-500'
            }`}
          >
            상품
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={`flex-1 py-2 px-3 rounded-full font-medium transition-all text-sm ${
              activeTab === 'orders'
                ? 'bg-white text-[#FE3A8F] shadow-sm'
                : 'text-gray-500'
            }`}
          >
            주문
          </button>
          <button
            onClick={() => setActiveTab('refunds')}
            className={`flex-1 py-2 px-3 rounded-full font-medium transition-all text-sm ${
              activeTab === 'refunds'
                ? 'bg-white text-[#FE3A8F] shadow-sm'
                : 'text-gray-500'
            }`}
          >
            환불
          </button>
        </div>

        {/* 스토어 관리 탭 */}
        {activeTab === 'products' && (
          <>
            {/* 개인/협업 서브탭 */}
            <div className="mb-4 flex gap-2 border-b">
              <button
                onClick={() => setProductSubTab('personal')}
                className={`py-2 px-4 font-medium text-sm border-b-2 transition-all ${
                  productSubTab === 'personal'
                    ? 'border-[#FE3A8F] text-[#FE3A8F]'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                개인 상품
              </button>
              <button
                onClick={() => setProductSubTab('collaboration')}
                className={`py-2 px-4 font-medium text-sm border-b-2 transition-all ${
                  productSubTab === 'collaboration'
                    ? 'border-[#FE3A8F] text-[#FE3A8F]'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                협업 상품
              </button>
            </div>

            {/* 개인 상품 */}
            {productSubTab === 'personal' && (
              <>
                <div className="mb-6 flex items-center justify-between">
                  <Typography variant="body2" className="text-gray-600">
                    내 상품을 등록하고 관리하세요
                  </Typography>
                  <Button
                    onClick={() => {
                      if (productDraftStorage.exists()) {
                        const draft = productDraftStorage.load();
                        if (draft && window.confirm(`등록 중인 상품이 있습니다.\n상품명: ${draft.name}\n\n계속 등록하시겠습니까?`)) {
                          navigate({ to: '/store/partner/products/new' });
                        }
                      } else {
                        navigate({ to: '/store/partner/products/new' });
                      }
                    }}
                    className="!bg-[#FE3A8F] hover:!bg-[#e8a0c0] !text-white"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    상품 등록
                  </Button>
                </div>

                <div className="mb-4 flex items-center gap-2">
                  <Button
                    variant={includeInactive ? undefined : 'outline'}
                    onClick={() => {
                      setIncludeInactive(true);
                      setPage(1);
                    }}
                    className={includeInactive ? '!bg-[#FE3A8F] hover:!bg-[#e8a0c0] !text-white' : ''}
                  >
                    전체 상품
                  </Button>
                  <Button
                    variant={includeInactive ? 'outline' : undefined}
                    onClick={() => {
                      setIncludeInactive(false);
                      setPage(1);
                    }}
                className={!includeInactive ? '!bg-[#FE3A8F] hover:!bg-[#e8a0c0] !text-white' : ''}
              >
                판매중
              </Button>
            </div>

            {isLoading ? (
              <StoreLoadingState />
            ) : error ? (
              <StoreErrorState message={error} onRetry={refetchProducts} />
            ) : products.length === 0 ? (
              <StoreEmptyState
                message="등록된 상품이 없습니다"
                description="새로운 상품을 등록해보세요"
              />
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
                  {products.map((product) => (
                    <div key={product.product_id} className="relative">
                      <ProductCard
                        product={product}
                        onClick={() => navigate({ to: '/store/partner/products/$productId/preview', params: { productId: product.product_id } })}
                        hideWishlistButton
                      />
                      <div className="absolute top-6 left-6 flex gap-1">
                        {!product.is_active && (
                          <span className="text-xs bg-gray-500 text-white px-2 py-1 rounded">
                            비활성
                          </span>
                        )}
                        {product.product_type !== 'digital' && (
                          <span className={`text-xs px-2 py-1 rounded ${
                            (product.stock ?? 0) === 0 
                              ? 'bg-pink-100 text-pink-600' 
                              : 'bg-black/70 text-white'
                          }`}>
                            {(product.stock ?? 0) === 0 ? '품절' : `재고: ${product.stock}`}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditSheet(product);
                          }}
                          className="flex-1"
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          수정
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleActive(product);
                          }}
                          className="flex-1"
                        >
                          {product.is_active ? (
                            <>
                              <EyeOff className="h-4 w-4 mr-1" />
                              비활성화
                            </>
                          ) : (
                            <>
                              <Eye className="h-4 w-4 mr-1" />
                              활성화
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProduct(product);
                            setIsDeleteSheetOpen(true);
                          }}
                          className="text-red-500 hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="flex justify-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      이전
                    </Button>
                    <Typography variant="body2" className="flex items-center px-4">
                      {page} / {totalPages}
                    </Typography>
                    <Button
                      variant="outline"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                    >
                      다음
                    </Button>
                  </div>
                )}
              </>
            )}
              </>
            )}

            {/* 협업 상품 */}
            {productSubTab === 'collaboration' && (
              <>
                {/* 협업 상품 목록 */}
                <div className="mb-6">
                  <Typography variant="body2" className="text-gray-600">
                    협업 중인 상품을 확인하세요
                  </Typography>
                </div>

                    {collabProductsLoading ? (
                      <StoreLoadingState />
                    ) : collabProductsError ? (
                      <StoreErrorState message={collabProductsError} onRetry={fetchCollabProducts} />
                    ) : collabProducts.length === 0 ? (
                      <StoreEmptyState
                        message="협업 상품이 없습니다"
                        description="관리자로부터 협업 요청을 받으면 여기에 표시됩니다"
                      />
                    ) : (
                      <>
                        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-6">
                          {collabProducts.map((item) => (
                            <div
                              key={item.request_id}
                              className="bg-white rounded-lg border p-4 cursor-pointer hover:shadow-md transition-shadow"
                              onClick={() => {
                                setSelectedCollabProduct(item);
                                setIsCollabProductDetailOpen(true);
                              }}
                            >
                              {item.product?.thumbnail_url && (
                                <img
                                  src={item.product.thumbnail_url}
                                  alt={item.product.name}
                                  className="w-full h-40 object-cover rounded-lg mb-3"
                                />
                              )}
                              <Typography variant="body1" className="font-medium mb-1 line-clamp-2">
                                {item.product?.name || '상품 정보 없음'}
                              </Typography>
                              <Typography variant="body2" className="text-[#FE3A8F] font-bold">
                                {(item.product?.price ?? 0).toLocaleString()}원
                              </Typography>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                                  {PRODUCT_TYPE_MAP[item.product?.product_type || ''] || item.product?.product_type}
                                </span>
                                {item.product?.product_type !== 'digital' && (
                                  <span className={`text-xs px-2 py-1 rounded ${
                                    (item.product?.stock ?? 0) === 0 
                                      ? 'bg-pink-100 text-pink-600' 
                                      : 'bg-gray-100 text-gray-600'
                                  }`}>
                                    {(item.product?.stock ?? 0) === 0 ? '품절' : `재고: ${item.product?.stock}`}
                                  </span>
                                )}
                                {item.product?.product_type === 'delivery' && (
                                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                                    배송비 {((item.product as any)?.shipping_fee_base ?? 0).toLocaleString()}원
                                  </span>
                                )}
                                {item.distribution_rate && (
                                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                                    수수료 {item.distribution_rate}%
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        {collabProductTotalPages > 1 && (
                          <div className="flex justify-center gap-2">
                            <Button
                              variant="outline"
                              onClick={() => setCollabProductPage((p) => Math.max(1, p - 1))}
                              disabled={collabProductPage === 1}
                            >
                              이전
                            </Button>
                            <Typography variant="body2" className="flex items-center px-4">
                              {collabProductPage} / {collabProductTotalPages}
                            </Typography>
                            <Button
                              variant="outline"
                              onClick={() => setCollabProductPage((p) => Math.min(collabProductTotalPages, p + 1))}
                              disabled={collabProductPage === collabProductTotalPages}
                            >
                              다음
                            </Button>
                          </div>
                        )}
                      </>
                    )}
              </>
            )}
          </>
        )}

        {/* 주문 관리 탭 */}
        {activeTab === 'orders' && (
          <>

            {/* 개인 주문 */}
            {orderSubTab === 'personal' && (
              <>
                <div className="mb-4 flex items-center gap-2">
                  <div className="flex gap-2 overflow-x-auto scrollbar-hide flex-1">
                    {[
                      { value: 'all', label: '전체' },
                      { value: 'paid', label: '결제 완료' },
                      { value: 'shipped', label: '배송 중' },
                      { value: 'delivered', label: '배송 완료' },
                      { value: 'confirmed', label: '구매 확정' },
                      { value: 'refund_requested', label: '환불 완료' },
                    ].map((item) => (
                      <Button
                        key={item.value}
                        variant={orderStatus === item.value ? undefined : 'outline'}
                        size="sm"
                        onClick={() => {
                          setOrderStatus(item.value as OrderStatus);
                          setOrderPage(1);
                        }}
                        className={`whitespace-nowrap ${orderStatus === item.value ? '!bg-[#FE3A8F] hover:!bg-[#e8a0c0] !text-white' : ''}`}
                      >
                        {item.label}
                      </Button>
                    ))}
                  </div>

              {/* 날짜 필터 */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="flex-shrink-0 gap-1">
                    <CalendarDays className="h-4 w-4" />
                    <span className="hidden sm:inline">{getDateLabel(orderCreatedFrom, orderCreatedTo)}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <div className="flex gap-2 p-2 border-b">
                    {(['1month', '6months', '1year'] as const).map((preset) => {
                      const { fromDate, toDate } = getDateRange(preset);
                      const isActive = orderCreatedFrom === fromDate && orderCreatedTo === toDate;
                      const label = preset === '1month' ? '1개월' : preset === '6months' ? '6개월' : '1년';
                      return (
                        <Button key={preset} variant={isActive ? "default" : "outline"} size="sm" onClick={() => {
                          if (isActive) {
                            setOrderCreatedFrom('');
                            setOrderCreatedTo('');
                          } else {
                            setOrderCreatedFrom(fromDate);
                            setOrderCreatedTo(toDate);
                          }
                          setOrderPage(1);
                        }}>{label}</Button>
                      );
                    })}
                    <Button variant="outline" size="sm" onClick={() => {
                      setOrderCreatedFrom('');
                      setOrderCreatedTo('');
                      setOrderPage(1);
                    }} className={`px-1 ${!(orderCreatedFrom || orderCreatedTo) ? 'invisible' : ''}`}><RefreshCcw className="h-3 w-3" /></Button>
                  </div>
                  <CalendarComponent
                    mode="range"
                    locale={ko}
                    selected={{
                      from: orderCreatedFrom ? new Date(orderCreatedFrom) : undefined,
                      to: orderCreatedTo ? new Date(orderCreatedTo) : undefined,
                    }}
                    onSelect={(range: DateRange | undefined) => {
                      setOrderCreatedFrom(range?.from ? format(range.from, 'yyyy-MM-dd') : '');
                      setOrderCreatedTo(range?.to ? format(range.to, 'yyyy-MM-dd') : '');
                      setOrderPage(1);
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {ordersLoading ? (
              <StoreLoadingState />
            ) : ordersError ? (
              <StoreErrorState message={ordersError} onRetry={fetchOrders} />
            ) : orders.length === 0 ? (
              <StoreEmptyState
                message="주문이 없습니다"
                description={orderStatus === 'all' ? '아직 주문이 들어오지 않았습니다' : `${STATUS_MAP[orderStatus]?.label || ''} 상태의 주문이 없습니다`}
              />
            ) : (
              <>
                <div className="space-y-3">
                  {orders.map((order) => (
                    <div
                      key={order.order_id}
                      onClick={async () => {
                        setIsOrderDetailOpen(true);
                        setSelectedOrder(order);
                        setFulfillmentFiles([]);
                        setFulfillmentNote('');
                        try {
                          const response = await storeOrdersApi.getDetail(order.order_id);
                          if (response.success && response.data) {
                            setSelectedOrder(response.data as PartnerOrder);
                            const orderData = response.data as any;
                            const hasCollabItem = orderData.order_items?.some((item: any) => item.product_source === 'collaboration') ||
                              orderData.product?.source === 'collaboration';
                            if (hasCollabItem) {
                              fetchFulfillments(order.order_id);
                            }
                          }
                        } catch (err) {
                          console.error('Failed to fetch order detail:', err);
                        }
                      }}
                      className="bg-white rounded-2xl p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                    >
                      <div className="flex gap-3">
                        {order.product?.thumbnail_url && (
                          <img
                            src={order.product.thumbnail_url}
                            alt={order.product?.name}
                            className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <Typography variant="body2" className="font-medium truncate">
                                {order.product?.name}
                              </Typography>
                              <Typography variant="caption" className="text-gray-500">
                                {order.order_number}
                              </Typography>
                            </div>
                            {order.delivery_tracking?.status?.code ? (
                              <span className={`text-xs px-2 py-1 rounded-full flex-shrink-0 ${
                                order.delivery_tracking.status.code === 'DELIVERED' ? 'bg-green-100 text-green-600' :
                                order.delivery_tracking.status.code === 'IN_TRANSIT' ? 'bg-blue-100 text-blue-600' :
                                order.delivery_tracking.status.code === 'OUT_FOR_DELIVERY' ? 'bg-purple-100 text-purple-600' :
                                'bg-yellow-100 text-yellow-600'
                              }`}>
                                {order.delivery_tracking.status.code === 'DELIVERED' ? '배송완료' :
                                 order.delivery_tracking.status.code === 'IN_TRANSIT' ? '배송중' :
                                 order.delivery_tracking.status.code === 'OUT_FOR_DELIVERY' ? '배송출발' :
                                 order.delivery_tracking.status.code === 'AT_PICKUP' ? '집하' :
                                 order.delivery_tracking.status.code}
                              </span>
                            ) : (
                              <span className={`text-xs px-2 py-1 rounded-full flex-shrink-0 ${STATUS_MAP[order.status]?.color || 'bg-gray-100'}`}>
                                {STATUS_MAP[order.status]?.label || order.status}
                              </span>
                            )}
                          </div>
                          <div className="mt-2 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {order.buyer?.profile_image ? (
                                <img src={order.buyer.profile_image} alt="" className="w-5 h-5 rounded-full" />
                              ) : (
                                <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center">
                                  <User className="w-3 h-3 text-gray-400" />
                                </div>
                              )}
                              <Typography variant="caption" className="text-gray-600">
                                {order.buyer?.name || order.recipient_name || '구매자'}
                              </Typography>
                            </div>
                            <Typography variant="body2" className="font-semibold text-[#FE3A8F]">
                              {formatPrice(order.total_amount)}
                            </Typography>
                          </div>
                          <Typography variant="caption" className="text-gray-400 mt-1 block">
                            {formatDate(order.created_at)}
                          </Typography>
                        </div>
                        <ChevronRight className="h-5 w-5 text-gray-300 flex-shrink-0 self-center" />
                      </div>
                    </div>
                  ))}
                </div>

                {orderTotalPages > 1 && (
                  <div className="flex justify-center gap-2 mt-6">
                    <Button
                      variant="outline"
                      onClick={() => setOrderPage((p) => Math.max(1, p - 1))}
                      disabled={orderPage === 1}
                    >
                      이전
                    </Button>
                    <Typography variant="body2" className="flex items-center px-4">
                      {orderPage} / {orderTotalPages}
                    </Typography>
                    <Button
                      variant="outline"
                      onClick={() => setOrderPage((p) => Math.min(orderTotalPages, p + 1))}
                      disabled={orderPage === orderTotalPages}
                    >
                      다음
                    </Button>
                  </div>
                )}
              </>
            )}
              </>
            )}

            {/* 협업 주문 */}
            {orderSubTab === 'collaboration' && (
              <>
                <div className="mb-4">
                  <Typography variant="body2" className="text-gray-600">
                    협업 상품 주문을 관리하고 출고 요청을 할 수 있습니다
                  </Typography>
                </div>

                {collabOrdersLoading ? (
                  <StoreLoadingState />
                ) : collabOrdersError ? (
                  <StoreErrorState message={collabOrdersError} onRetry={fetchCollabOrders} />
                ) : collabOrders.length === 0 ? (
                  <StoreEmptyState
                    message="협업 주문이 없습니다"
                    description="협업 상품 주문이 들어오면 여기에 표시됩니다"
                  />
                ) : (
                  <>
                    <div className="space-y-3 mb-6">
                      {collabOrders.map((order) => (
                        <div
                          key={order.order_id}
                          className="bg-white rounded-lg border p-4 cursor-pointer hover:shadow-md transition-shadow"
                          onClick={() => {
                            setSelectedCollabOrder(order);
                            setIsCollabOrderDetailOpen(true);
                            setFulfillmentFiles([]);
                            setFulfillmentNote('');
                            fetchFulfillments(order.order_id);
                          }}
                        >
                          <div className="flex gap-4">
                            {order.product?.thumbnail_url && (
                              <img
                                src={order.product.thumbnail_url}
                                alt={order.product.name}
                                className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                              />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <Typography variant="body2" className="font-medium truncate">
                                  {order.product?.name || '상품 정보 없음'}
                                </Typography>
                                <span className={`text-xs px-2 py-1 rounded-full flex-shrink-0 ${STATUS_MAP[order.status]?.color || 'bg-gray-100'}`}>
                                  {STATUS_MAP[order.status]?.label || order.status}
                                </span>
                              </div>
                              <Typography variant="caption" className="text-gray-500">
                                {order.order_number}
                              </Typography>
                              <div className="mt-2 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  {order.buyer?.profile_image ? (
                                    <img src={order.buyer.profile_image} alt="" className="w-5 h-5 rounded-full" />
                                  ) : (
                                    <div className="w-5 h-5 rounded-full bg-gray-200 flex items-center justify-center">
                                      <User className="w-3 h-3 text-gray-400" />
                                    </div>
                                  )}
                                  <Typography variant="caption" className="text-gray-600">
                                    {order.buyer?.name || order.recipient_name || '구매자'}
                                  </Typography>
                                </div>
                                <Typography variant="body2" className="font-semibold text-[#FE3A8F]">
                                  {formatPrice(order.total_amount)}
                                </Typography>
                              </div>
                              <Typography variant="caption" className="text-gray-400 mt-1 block">
                                {formatDate(order.created_at)}
                              </Typography>
                            </div>
                            <ChevronRight className="h-5 w-5 text-gray-300 flex-shrink-0 self-center" />
                          </div>
                        </div>
                      ))}
                    </div>

                    {collabOrderTotalPages > 1 && (
                      <div className="flex justify-center gap-2 mt-6">
                        <Button
                          variant="outline"
                          onClick={() => setCollabOrderPage((p) => Math.max(1, p - 1))}
                          disabled={collabOrderPage === 1}
                        >
                          이전
                        </Button>
                        <Typography variant="body2" className="flex items-center px-4">
                          {collabOrderPage} / {collabOrderTotalPages}
                        </Typography>
                        <Button
                          variant="outline"
                          onClick={() => setCollabOrderPage((p) => Math.min(collabOrderTotalPages, p + 1))}
                          disabled={collabOrderPage === collabOrderTotalPages}
                        >
                          다음
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* 환불 관리 탭 */}
        {activeTab === 'refunds' && (
          <>
            <div className="mb-4 flex items-center gap-2">
              <div className="flex gap-2 overflow-x-auto scrollbar-hide flex-1">
                {[
                  { value: 'all', label: '전체' },
                  { value: 'requested', label: '대기 중' },
                  { value: 'completed', label: '환불 완료' },
                  { value: 'rejected', label: '거절됨' },
                ].map((item) => (
                  <Button
                    key={item.value}
                    variant={refundStatus === item.value ? undefined : 'outline'}
                    size="sm"
                    onClick={() => {
                      setRefundStatus(item.value as RefundStatus);
                      setRefundPage(1);
                    }}
                    className={`whitespace-nowrap ${refundStatus === item.value ? '!bg-[#FE3A8F] hover:!bg-[#e8a0c0] !text-white' : ''}`}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>

              {/* 날짜 필터 */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="flex-shrink-0 gap-1">
                    <CalendarDays className="h-4 w-4" />
                    <span className="hidden sm:inline">{getDateLabel(refundCreatedFrom, refundCreatedTo)}</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <div className="flex gap-2 p-2 border-b">
                    {(['1month', '6months', '1year'] as const).map((preset) => {
                      const { fromDate, toDate } = getDateRange(preset);
                      const isActive = refundCreatedFrom === fromDate && refundCreatedTo === toDate;
                      const label = preset === '1month' ? '1개월' : preset === '6months' ? '6개월' : '1년';
                      return (
                        <Button key={preset} variant={isActive ? "default" : "outline"} size="sm" onClick={() => {
                          if (isActive) {
                            setRefundCreatedFrom('');
                            setRefundCreatedTo('');
                          } else {
                            setRefundCreatedFrom(fromDate);
                            setRefundCreatedTo(toDate);
                          }
                          setRefundPage(1);
                        }}>{label}</Button>
                      );
                    })}
                    <Button variant="outline" size="sm" onClick={() => {
                      setRefundCreatedFrom('');
                      setRefundCreatedTo('');
                      setRefundPage(1);
                    }} className={`px-1 ${!(refundCreatedFrom || refundCreatedTo) ? 'invisible' : ''}`}><RefreshCcw className="h-3 w-3" /></Button>
                  </div>
                  <CalendarComponent
                    mode="range"
                    locale={ko}
                    selected={{
                      from: refundCreatedFrom ? new Date(refundCreatedFrom) : undefined,
                      to: refundCreatedTo ? new Date(refundCreatedTo) : undefined,
                    }}
                    onSelect={(range: DateRange | undefined) => {
                      setRefundCreatedFrom(range?.from ? format(range.from, 'yyyy-MM-dd') : '');
                      setRefundCreatedTo(range?.to ? format(range.to, 'yyyy-MM-dd') : '');
                      setRefundPage(1);
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            {refundsLoading ? (
              <StoreLoadingState />
            ) : refundsError ? (
              <StoreErrorState message={refundsError} onRetry={fetchRefunds} />
            ) : refunds.length === 0 ? (
              <StoreEmptyState
                message="환불 요청이 없습니다"
                description={refundStatus === 'all' ? '아직 환불 요청이 없습니다' : `${REFUND_STATUS_MAP[refundStatus]?.label || ''} 상태의 환불 요청이 없습니다`}
              />
            ) : (
              <>
                <div className="space-y-3">
                  {refunds.map((refund) => (
                    <div
                      key={refund.refund_id}
                      onClick={() => {
                        setSelectedRefund(refund);
                        setIsRefundDetailOpen(true);
                        setRejectionReason('');
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
                            <span className={`text-xs px-2 py-1 rounded-full flex-shrink-0 ${REFUND_STATUS_MAP[refund.status]?.color || 'bg-gray-100'}`}>
                              {REFUND_STATUS_MAP[refund.status]?.label || refund.status}
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
                              {formatPrice(refund.refund_amount)}
                            </Typography>
                          </div>
                          <Typography variant="caption" className="text-gray-400 mt-1 block">
                            {formatDate(refund.created_at)}
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
          </>
        )}

        {/* 상품 수정 Sheet */}
        <SlideSheet
          isOpen={isEditSheetOpen}
          onClose={() => {
            setIsEditSheetOpen(false);
            setSelectedProduct(null);
            setEditProductDetail(null);
            setEditStep(1);
          }}
          title={`상품 수정 (${editStep}/2)`}
          footer={
            <div className="flex gap-3 px-4">
              {editStep === 1 ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsEditSheetOpen(false);
                      setSelectedProduct(null);
                      setEditProductDetail(null);
                      setEditStep(1);
                    }}
                    className="flex-1"
                  >
                    취소
                  </Button>
                  <Button
                    onClick={() => {
                      if (!editName || !editPrice) {
                        toast.error('상품명과 가격은 필수입니다.');
                        return;
                      }
                      if (selectedProduct?.product_type !== 'digital' && (!editStock || parseInt(editStock) < 0)) {
                        toast.error('재고 수량을 입력해주세요.');
                        return;
                      }
                      setEditStep(2);
                    }}
                    className="flex-1 bg-[#FE3A8F] text-white"
                  >
                    다음 단계
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => setEditStep(1)}
                    className="flex-1"
                    disabled={isSavingEdit}
                  >
                    <ArrowLeft className="h-4 w-4 mr-1" />
                    이전
                  </Button>
                  <Button
                    onClick={handleSaveEdit}
                    disabled={isSavingEdit}
                    className="flex-1 bg-[#FE3A8F] text-white"
                  >
                    {isSavingEdit ? '저장 중...' : '저장'}
                  </Button>
                </>
              )}
            </div>
          }
        >
          {isLoadingEditDetail ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : selectedProduct && (
            <>
              {/* Step 1: 기본 정보 */}
              {editStep === 1 && (
                <div className="space-y-4">
                  {/* 상품 유형 표시 */}
                  <div className="p-3 bg-gray-50 rounded-xl">
                    <Typography variant="caption" className="text-gray-500">상품 유형</Typography>
                    <Typography variant="body2" className="font-medium">
                      {PRODUCT_TYPE_MAP[selectedProduct.product_type]}
                    </Typography>
                  </div>

                  {/* 상품명 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      상품명 <span className="text-red-500">*</span>
                    </label>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="상품명을 입력하세요"
                    />
                  </div>

                  {/* 가격 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      가격 (포인트) <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="number"
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      placeholder="가격을 입력하세요"
                    />
                  </div>

                  {/* 재고 (디지털 상품 제외) */}
                  {selectedProduct.product_type !== 'digital' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        재고 수량 <span className="text-red-500">*</span>
                      </label>
                      <Input
                        type="number"
                        value={editStock}
                        onChange={(e) => setEditStock(e.target.value)}
                        placeholder="재고 수량을 입력하세요"
                        min="0"
                      />
                    </div>
                  )}

                  {/* 배송비 (택배 상품만) */}
                  {selectedProduct.product_type === 'delivery' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">기본 배송비</label>
                        <Input
                          type="number"
                          value={editShippingFeeBase}
                          onChange={(e) => setEditShippingFeeBase(e.target.value)}
                          placeholder="포인트"
                          min="0"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">도서산간 배송비</label>
                        <Input
                          type="number"
                          value={editShippingFeeRemote}
                          onChange={(e) => setEditShippingFeeRemote(e.target.value)}
                          placeholder="도서산간 지역 추가 배송비"
                          min="0"
                        />
                      </div>
                      <label className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg cursor-pointer">
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

                  {/* 스케줄 관리 (현장수령 상품만) */}
                  {selectedProduct.product_type === 'on_site' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="block text-sm font-medium text-gray-700">수령 가능 일정</label>
                        <button
                          type="button"
                          onClick={() => {
                            const tomorrow = new Date();
                            tomorrow.setDate(tomorrow.getDate() + 1);
                            tomorrow.setHours(10, 0, 0, 0);
                            const startTime = tomorrow.toISOString().slice(0, 16);
                            tomorrow.setHours(18, 0, 0, 0);
                            const endTime = tomorrow.toISOString().slice(0, 16);
                            setNewSchedules([...newSchedules, { start_time: startTime, end_time: endTime, location: '' }]);
                          }}
                          className="flex items-center gap-1 text-xs text-[#FE3A8F] hover:text-[#e8a0c0]"
                        >
                          <Plus className="h-3 w-3" />
                          일정 추가
                        </button>
                      </div>
                      
                      {isLoadingSchedules ? (
                        <div className="flex justify-center py-4">
                          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {/* 기존 스케줄 */}
                          {editSchedules.filter(s => !removeScheduleIds.includes(s.schedule_id)).map((schedule) => (
                            <div key={schedule.schedule_id} className="p-3 bg-gray-50 rounded-lg">
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 text-sm text-gray-700">
                                    <Calendar className="h-4 w-4 text-[#FE3A8F]" />
                                    {schedule.start_time && new Date(schedule.start_time).toLocaleString('ko-KR', {
                                      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                    })}
                                    {schedule.end_time && (
                                      <span className="text-gray-400">
                                        ~ {new Date(schedule.end_time).toLocaleTimeString('ko-KR', {
                                          hour: '2-digit', minute: '2-digit'
                                        })}
                                      </span>
                                    )}
                                  </div>
                                  {schedule.location && (
                                    <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                                      <MapPin className="h-3 w-3" />
                                      {schedule.location}
                                    </div>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setRemoveScheduleIds([...removeScheduleIds, schedule.schedule_id])}
                                  className="p-1 text-gray-400 hover:text-red-500"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                          
                          {/* 새로 추가하는 스케줄 */}
                          {newSchedules.map((schedule, index) => (
                            <div key={`new-${index}`} className="p-3 bg-pink-50 rounded-lg space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-[#FE3A8F]">새 일정</span>
                                <button
                                  type="button"
                                  onClick={() => setNewSchedules(newSchedules.filter((_, i) => i !== index))}
                                  className="p-1 text-gray-400 hover:text-red-500"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="text-xs text-gray-500 block mb-1">시작</label>
                                  <input
                                    type="datetime-local"
                                    value={schedule.start_time}
                                    onChange={(e) => {
                                      const updated = [...newSchedules];
                                      updated[index] = { ...updated[index], start_time: e.target.value };
                                      setNewSchedules(updated);
                                    }}
                                    className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#FE3A8F]/50"
                                  />
                                </div>
                                <div>
                                  <label className="text-xs text-gray-500 block mb-1">종료</label>
                                  <input
                                    type="datetime-local"
                                    value={schedule.end_time}
                                    onChange={(e) => {
                                      const updated = [...newSchedules];
                                      updated[index] = { ...updated[index], end_time: e.target.value };
                                      setNewSchedules(updated);
                                    }}
                                    className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-[#FE3A8F]/50"
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
                                    setEditingNewScheduleIndex(index);
                                    setScheduleLocationPickerOpen(true);
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
                          
                          {editSchedules.filter(s => !removeScheduleIds.includes(s.schedule_id)).length === 0 && newSchedules.length === 0 && (
                            <div className="p-4 bg-gray-50 rounded-lg text-center">
                              <p className="text-sm text-gray-500">등록된 일정이 없습니다</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 상품 설명 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">상품 설명</label>
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="상품 설명을 입력하세요"
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl resize-none"
                      rows={4}
                    />
                  </div>
                </div>
              )}

              {/* Step 2: 이미지/파일 */}
              {editStep === 2 && (
                <div className="space-y-6">
                  {/* 썸네일 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">썸네일 이미지</label>
                    {(editProductDetail?.thumbnail_url && !editThumbnail && !editThumbnailDeleted) ? (
                      <div className="relative inline-block">
                        <img src={editProductDetail.thumbnail_url} alt="" className="w-32 h-32 rounded-lg object-cover" />
                        <button
                          type="button"
                          onClick={() => setEditThumbnailDeleted(true)}
                          className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : editThumbnail ? (
                      <div className="relative inline-block">
                        <img src={URL.createObjectURL(editThumbnail)} alt="" className="w-32 h-32 rounded-lg object-cover" />
                        <button
                          type="button"
                          onClick={() => setEditThumbnail(null)}
                          className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="flex items-center justify-center w-32 h-32 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-200">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            setEditThumbnail(e.target.files?.[0] || null);
                            setEditThumbnailDeleted(false);
                          }}
                          className="hidden"
                        />
                        <Plus className="h-8 w-8 text-gray-400" />
                      </label>
                    )}
                  </div>

                  {/* 상세 이미지 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">상세페이지 이미지</label>
                    <div className="grid grid-cols-4 gap-2">
                      {existingImages.map((img, idx) => (
                        <div key={img.image_id || idx} className="relative">
                          <img src={img.image_url || img.url} alt="" className="w-full h-20 rounded-lg object-cover" />
                          <button
                            type="button"
                            onClick={() => setExistingImages(prev => prev.filter((_, i) => i !== idx))}
                            className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      {editImages.map((img, idx) => (
                        <div key={`new-${idx}`} className="relative">
                          <img src={URL.createObjectURL(img)} alt="" className="w-full h-20 rounded-lg object-cover" />
                          <button
                            type="button"
                            onClick={() => setEditImages(prev => prev.filter((_, i) => i !== idx))}
                            className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      <label className="flex items-center justify-center h-20 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-200">
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(e) => setEditImages(prev => [...prev, ...Array.from(e.target.files || [])])}
                          className="hidden"
                        />
                        <Plus className="h-6 w-6 text-gray-400" />
                      </label>
                    </div>
                  </div>

                  {/* 디지털 자산 (디지털 상품 또는 현장 수령 상품) */}
                  {(selectedProduct.product_type === 'digital' || selectedProduct.product_type === 'on_site') && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {selectedProduct.product_type === 'digital' ? '디지털 자산' : '상품 PDF (선택사항)'}
                      </label>
                      <div className="mb-3 flex gap-2">
                        <Button
                          type="button"
                          variant={editDigitalAssetType === 'images' ? undefined : 'outline'}
                          onClick={() => setEditDigitalAssetType('images')}
                          className={editDigitalAssetType === 'images' ? '!bg-[#FE3A8F] hover:!bg-[#e8a0c0] !text-white' : ''}
                          size="sm"
                        >
                          <ImageIcon className="h-4 w-4 mr-1" />
                          이미지
                        </Button>
                        <Button
                          type="button"
                          variant={editDigitalAssetType === 'pdf' ? undefined : 'outline'}
                          onClick={() => setEditDigitalAssetType('pdf')}
                          className={editDigitalAssetType === 'pdf' ? '!bg-[#FE3A8F] hover:!bg-[#e8a0c0] !text-white' : ''}
                          size="sm"
                        >
                          <FileText className="h-4 w-4 mr-1" />
                          PDF
                        </Button>
                      </div>
                      
                      {/* 디지털 자산 목록 (기존 + 새로운) */}
                      {(existingDigitalAssets.length > 0 || editDigitalAssets.length > 0) && (
                        <div className="grid grid-cols-4 gap-2 mb-2">
                          {/* 기존 디지털 자산 */}
                          {existingDigitalAssets.map((asset, idx) => (
                            <div key={asset.asset_id || `existing-${idx}`} className="relative">
                              {asset.asset_url || asset.file_url ? (
                                <img src={asset.asset_url || asset.file_url} alt="" className="w-full h-20 rounded-lg object-cover" />
                              ) : (
                                <div className="w-full h-20 bg-gray-50 border rounded-lg flex items-center justify-center">
                                  <FileText className="h-6 w-6 text-gray-400" />
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => setExistingDigitalAssets(prev => prev.filter((_, i) => i !== idx))}
                                className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                          {/* 새 디지털 자산 */}
                          {editDigitalAssets.map((asset, idx) => (
                            <div key={`new-asset-${idx}`} className="relative">
                              {editDigitalAssetType === 'pdf' && editPdfPreviews[idx] ? (
                                <img src={editPdfPreviews[idx]} alt="" className="w-full h-20 rounded-lg object-cover" />
                              ) : editDigitalAssetType === 'images' ? (
                                <img src={URL.createObjectURL(asset)} alt="" className="w-full h-20 rounded-lg object-cover" />
                              ) : (
                                <div className="w-full h-20 bg-gray-50 border rounded-lg flex items-center justify-center">
                                  <FileText className="h-6 w-6 text-gray-400" />
                                </div>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setEditDigitalAssets(prev => prev.filter((_, i) => i !== idx));
                                  setEditPdfPreviews(prev => {
                                    const newPreviews = { ...prev };
                                    delete newPreviews[idx];
                                    return newPreviews;
                                  });
                                }}
                                className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      <label className="flex items-center justify-center h-20 bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-200">
                        <input
                          type="file"
                          accept={editDigitalAssetType === 'pdf' ? 'application/pdf' : 'image/*'}
                          multiple={editDigitalAssetType === 'images'}
                          onChange={async (e) => {
                            const files = Array.from(e.target.files || []);
                            if (editDigitalAssetType === 'pdf' && files[0]) {
                              setIsConvertingEditPdf(true);
                              try {
                                const imageFile = await convertPdfToImage(files[0]);
                                const previewUrl = URL.createObjectURL(imageFile);
                                setEditDigitalAssets([imageFile]);
                                setEditPdfPreviews({ 0: previewUrl });
                              } catch (error: any) {
                                toast.error(`PDF 변환 실패: ${error.message}`);
                              } finally {
                                setIsConvertingEditPdf(false);
                              }
                            } else {
                              setEditDigitalAssets(prev => [...prev, ...files]);
                            }
                          }}
                          className="hidden"
                          disabled={isConvertingEditPdf}
                        />
                        {isConvertingEditPdf ? (
                          <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
                        ) : (
                          <Plus className="h-6 w-6 text-gray-400" />
                        )}
                      </label>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </SlideSheet>

        {/* 상품 삭제 확인 Sheet */}
        <SlideSheet
          isOpen={isDeleteSheetOpen}
          onClose={() => {
            setIsDeleteSheetOpen(false);
            setSelectedProduct(null);
          }}
          title="상품 삭제"
        >
          <div className="p-6">
            <Typography variant="body1" className="mb-4">
              정말로 "{selectedProduct?.name}" 상품을 삭제하시겠습니까?
            </Typography>
            <Typography variant="body2" className="text-gray-600 mb-6">
              삭제된 상품은 비활성화되며, 복구할 수 없습니다.
            </Typography>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsDeleteSheetOpen(false);
                  setSelectedProduct(null);
                }}
                className="flex-1"
              >
                취소
              </Button>
              <Button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 !bg-red-500 hover:!bg-red-600 !text-white"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    삭제 중...
                  </>
                ) : (
                  '삭제'
                )}
              </Button>
            </div>
          </div>
        </SlideSheet>

        {/* 주문 상세 Sheet */}
        <SlideSheet
          isOpen={isOrderDetailOpen}
          onClose={() => {
            setIsOrderDetailOpen(false);
            setSelectedOrder(null);
            setTrackingHistory(null);
            setIsTrackingExpanded(false);
            setTrackingInputItemId(null);
            setTrackingCourier('');
            setTrackingNumber('');
          }}
          title="주문 상세"
        >
          {selectedOrder && (
            <div className="p-6 space-y-6">
              {/* 주문 상태 표시 */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {selectedOrder.delivery_tracking?.status?.code ? (
                    <span className={`text-sm px-3 py-1.5 rounded-full font-medium ${
                      selectedOrder.delivery_tracking.status.code === 'DELIVERED' ? 'bg-green-100 text-green-600' :
                      selectedOrder.delivery_tracking.status.code === 'IN_TRANSIT' ? 'bg-blue-100 text-blue-600' :
                      selectedOrder.delivery_tracking.status.code === 'OUT_FOR_DELIVERY' ? 'bg-purple-100 text-purple-600' :
                      'bg-yellow-100 text-yellow-600'
                    }`}>
                      {selectedOrder.delivery_tracking.status.code === 'DELIVERED' ? '배송완료' :
                       selectedOrder.delivery_tracking.status.code === 'IN_TRANSIT' ? '배송중' :
                       selectedOrder.delivery_tracking.status.code === 'OUT_FOR_DELIVERY' ? '배송출발' :
                       selectedOrder.delivery_tracking.status.code === 'AT_PICKUP' ? '집하' :
                       selectedOrder.delivery_tracking.status.code}
                    </span>
                  ) : (
                    <span className={`text-sm px-3 py-1.5 rounded-full font-medium ${STATUS_MAP[selectedOrder.status]?.color || 'bg-gray-100'}`}>
                      {STATUS_MAP[selectedOrder.status]?.label || selectedOrder.status}
                    </span>
                  )}
                  {selectedOrder.is_confirmed && selectedOrder.status !== 'confirmed' && (
                    <span className="text-sm px-3 py-1.5 rounded-full font-medium bg-purple-100 text-purple-600">
                      구매확정
                    </span>
                  )}
                </div>
              </div>

              {/* 주문 상품 정보 */}
              {(() => {
                const items = selectedOrder.order_items && selectedOrder.order_items.length > 0
                  ? selectedOrder.order_items
                  : selectedOrder.product ? [{
                      order_item_id: 'single',
                      product_id: selectedOrder.product.product_id,
                      quantity: selectedOrder.quantity,
                      unit_price: selectedOrder.product.price,
                      is_bundle_available: (selectedOrder.product as any).is_bundle_available,
                      product: selectedOrder.product
                    }] : [];

                const shipments = selectedOrder.shipments || [];
                
                // shipment_id 기준으로 그룹화
                // 1. shipment_items가 있으면 그걸로 연결
                // 2. 없으면 is_bundle_available 기준으로 fallback
                const shipmentGroups: { shipment: Shipment; items: typeof items }[] = [];
                const unmatchedItems: typeof items = [...items];

                shipments.forEach((shipment, idx) => {
                  let linkedItems: typeof items = [];
                  
                  // shipment_items로 연결 시도
                  if (shipment.shipment_items && shipment.shipment_items.length > 0) {
                    linkedItems = shipment.shipment_items.map(si => 
                      items.find(item => item.order_item_id === si.order_item_id)
                    ).filter(Boolean) as typeof items;
                  }
                  
                  // shipment_items 없으면 fallback
                  if (linkedItems.length === 0) {
                    if (shipments.length === 1) {
                      // shipment가 1개면 모든 상품 연결
                      linkedItems = [...unmatchedItems];
                    } else if (shipments.length === items.length) {
                      // shipment와 item 개수가 같으면 1:1 매핑
                      if (unmatchedItems[idx]) {
                        linkedItems = [unmatchedItems[idx]];
                      }
                    } else {
                      // is_bundle_available 기준 매칭
                      const bundleItems = unmatchedItems.filter((item: any) => 
                        item.is_bundle_available || item.product?.is_bundle_available
                      );
                      const individualItems = unmatchedItems.filter((item: any) => 
                        !item.is_bundle_available && !item.product?.is_bundle_available
                      );
                      
                      if (idx === 0 && bundleItems.length > 0) {
                        linkedItems = bundleItems;
                      } else {
                        const individualIdx = idx - (bundleItems.length > 0 ? 1 : 0);
                        if (individualItems[individualIdx]) {
                          linkedItems = [individualItems[individualIdx]];
                        }
                      }
                    }
                  }
                  
                  // 매칭된 아이템 제거
                  linkedItems.forEach(li => {
                    const idx = unmatchedItems.findIndex(ui => ui.order_item_id === li.order_item_id);
                    if (idx >= 0) unmatchedItems.splice(idx, 1);
                  });
                  
                  if (linkedItems.length > 0) {
                    shipmentGroups.push({ shipment, items: linkedItems });
                  }
                });

                // 매칭 안 된 상품들 (shipment 없음)
                const noShipmentItems = unmatchedItems;

                // 송장 렌더링 함수
                const renderTrackingSection = (shipment: Shipment) => {
                  const hasTracking = !!shipment.tracking_number;
                  const isInputtingThis = trackingInputItemId === shipment.shipment_id;
                  const deliveryEvents = shipment.delivery_events || [];
                  
                  if (hasTracking && !isInputtingThis) {
                    return (
                      <div className="space-y-3">
                        <div className="bg-white rounded-lg p-3 space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-500">택배사</span>
                            <span className="font-medium">{shipment.courier}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">송장번호</span>
                            <span className="font-medium">{shipment.tracking_number}</span>
                          </div>
                          {!['cancelled', 'confirmed', 'delivered', 'refunded'].includes(selectedOrder.status) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setTrackingInputItemId(shipment.shipment_id);
                                setTrackingCourier(shipment.courier || '');
                                setTrackingNumber(shipment.tracking_number || '');
                              }}
                              className="w-full mt-2"
                            >
                              <Edit className="h-3 w-3 mr-1" />
                              송장번호 수정
                            </Button>
                          )}
                        </div>
                        
                        {/* 배송 추적 정보 */}
                        {isTrackingExpanded && trackingHistory && trackingInputItemId === `tracking_${shipment.shipment_id}` && trackingHistory.length > 0 && (
                          <div className="bg-white rounded-lg p-3">
                            <Typography variant="caption" className="font-medium text-gray-700 mb-2 block">
                              배송 추적 내역
                            </Typography>
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                              {[...trackingHistory].reverse().map((event: any, idx: number) => (
                                <div key={idx} className="flex gap-3 text-sm">
                                  <div className="flex flex-col items-center">
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${idx === 0 ? 'bg-[#FE3A8F]' : 'bg-gray-300'}`} />
                                    {idx < trackingHistory.length - 1 && <div className="w-0.5 flex-1 bg-gray-200 mt-1" />}
                                  </div>
                                  <div className="flex-1 pb-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <Typography variant="caption" className="text-gray-400">
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
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  }
                  
                  if (['cancelled', 'confirmed', 'delivered', 'refunded'].includes(selectedOrder.status)) {
                    return null;
                  }
                  
                  if (isInputtingThis) {
                    return (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">택배사</label>
                          <select
                            value={trackingCourier}
                            onChange={(e) => setTrackingCourier(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F] text-sm"
                          >
                            <option value="">택배사 선택</option>
                            <option value="cj">CJ대한통운</option>
                            <option value="lotte">롯데택배</option>
                            <option value="post">우체국</option>
                            <option value="hanjin">한진택배</option>
                            <option value="logen">로젠택배</option>
                            <option value="kdexp">경동택배</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">송장번호</label>
                          <input
                            type="text"
                            value={trackingNumber}
                            onChange={(e) => setTrackingNumber(e.target.value.replace(/[^0-9]/g, ''))}
                            placeholder="숫자만 입력"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F] text-sm"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setTrackingInputItemId(null);
                              setTrackingCourier('');
                              setTrackingNumber('');
                            }}
                            className="flex-1"
                          >
                            취소
                          </Button>
                          <Button
                            size="sm"
                            onClick={async () => {
                              if (!trackingCourier || !trackingNumber.trim()) {
                                toast.error('택배사와 송장번호를 입력해주세요.');
                                return;
                              }
                              setIsSubmittingTracking(true);
                              try {
                                const response = await storeOrdersApi.updateStatus(selectedOrder.order_id, {
                                  status: 'shipped',
                                  courier: trackingCourier,
                                  tracking_number: trackingNumber.trim(),
                                  shipment_id: shipment.shipment_id
                                });
                                if (response.success) {
                                  toast.success('송장이 등록되었습니다.');
                                  setTrackingInputItemId(null);
                                  setTrackingCourier('');
                                  setTrackingNumber('');
                                  fetchOrders();
                                } else {
                                  toast.error(response.error?.message || '송장 등록 실패');
                                }
                              } catch (error: any) {
                                toast.error(error.message || '송장 등록 실패');
                              } finally {
                                setIsSubmittingTracking(false);
                              }
                            }}
                            disabled={isSubmittingTracking || !trackingCourier || !trackingNumber.trim()}
                            className="flex-1 bg-[#FE3A8F] text-white hover:bg-[#e8a0c0]"
                          >
                            {isSubmittingTracking ? '등록 중...' : '송장 등록'}
                          </Button>
                        </div>
                      </div>
                    );
                  }
                  
                  return (
                    <Button
                      size="sm"
                      onClick={() => {
                        setTrackingInputItemId(shipment.shipment_id);
                        setTrackingCourier('');
                        setTrackingNumber('');
                      }}
                      className="w-full bg-[#FE3A8F] text-white hover:bg-[#e8a0c0]"
                    >
                      <Truck className="h-4 w-4 mr-2" />
                      송장 입력
                    </Button>
                  );
                };

                return (
                  <>
                    {/* 주문 상품 */}
                    <div>
                      <Typography variant="body2" className="font-medium mb-3 flex items-center gap-2">
                        📦 주문 상품 ({items.length}개)
                      </Typography>
                      
                      <div className="space-y-4">
                        {/* shipment 그룹별 상품 표시 */}
                        {shipmentGroups.map(({ shipment, items: groupItems }) => {
                          const isBundleShipment = groupItems.length > 1;
                          
                          return (
                            <div key={shipment.shipment_id} className="bg-gray-50 rounded-xl p-4">
                              <div className="flex items-center gap-2 mb-3">
                                {isBundleShipment && (
                                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                                    묶음배송
                                  </span>
                                )}
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                  shipment.status === 'delivered' ? 'bg-green-100 text-green-600' :
                                  shipment.status === 'shipped' ? 'bg-blue-100 text-blue-600' :
                                  shipment.tracking_number ? 'bg-yellow-100 text-yellow-600' :
                                  'bg-orange-100 text-orange-600'
                                }`}>
                                  {shipment.status === 'delivered' ? '배송완료' :
                                   shipment.status === 'shipped' ? '배송중' :
                                   shipment.tracking_number ? '배송대기' : '송장 미등록'}
                                </span>
                                {shipment.tracking_number && (
                                  <button
                                    onClick={async () => {
                                      if (trackingHistory && trackingInputItemId === `tracking_${shipment.shipment_id}`) {
                                        setIsTrackingExpanded(!isTrackingExpanded);
                                        return;
                                      }
                                      setIsLoadingTracking(true);
                                      setTrackingInputItemId(`tracking_${shipment.shipment_id}`);
                                      try {
                                        const response = await storeOrdersApi.getDetail(selectedOrder.order_id);
                                        if (response.success && response.data) {
                                          const orderData = response.data as any;
                                          const targetShipment = orderData.shipments?.find((s: any) => s.shipment_id === shipment.shipment_id);
                                          const events = targetShipment?.delivery_events || orderData.delivery_events;
                                          if (events && events.length > 0) {
                                            setTrackingHistory(events);
                                            setIsTrackingExpanded(true);
                                          } else {
                                            toast.error('배송 추적 정보가 없습니다.');
                                          }
                                        }
                                      } catch (error) {
                                        toast.error('배송 조회에 실패했습니다.');
                                      } finally {
                                        setIsLoadingTracking(false);
                                      }
                                    }}
                                    className="ml-auto flex items-center gap-1 text-xs text-[#FE3A8F] hover:text-[#e8a0c0]"
                                    disabled={isLoadingTracking && trackingInputItemId === `tracking_${shipment.shipment_id}`}
                                  >
                                    {isLoadingTracking && trackingInputItemId === `tracking_${shipment.shipment_id}` ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <>
                                        <Search className="h-3 w-3" />
                                        배송조회
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>
                              
                              <div className="space-y-3">
                                {groupItems.map((item: any, idx: number) => {
                                  const itemProduct = item.product || selectedOrder.product;
                                  return (
                                    <div key={item.order_item_id} className={`flex gap-3 ${idx > 0 ? 'pt-3 border-t border-gray-200' : ''}`}>
                                      {itemProduct?.thumbnail_url ? (
                                        <img src={itemProduct.thumbnail_url} alt={itemProduct.name} className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                                      ) : (
                                        <div className="w-14 h-14 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
                                          <Truck className="w-5 h-5 text-gray-400" />
                                        </div>
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <Typography variant="body2" className="font-medium truncate">{itemProduct?.name}</Typography>
                                        <Typography variant="caption" className="text-gray-500">
                                          {item.unit_price?.toLocaleString()}P × {item.quantity}개
                                        </Typography>
                                        {item.selected_options && item.selected_options.length > 0 && (
                                          <div className="mt-1 text-xs text-gray-500">
                                            {item.selected_options.map((opt: any, optIdx: number) => (
                                              <span key={optIdx}>
                                                {opt.option_name}: {opt.value || opt.text_value}
                                                {optIdx < item.selected_options.length - 1 && ', '}
                                              </span>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                                {shipment.delivery_memo && (
                                  <div className="mt-2 p-2 bg-yellow-50 rounded-lg">
                                    <Typography variant="caption" className="text-yellow-800">
                                      <span className="font-medium">배송메모:</span> {shipment.delivery_memo}
                                    </Typography>
                                  </div>
                                )}
                              </div>
                              
                              {/* 송장 섹션 또는 출고 요청 */}
                              <div className="mt-3 pt-3 border-t border-gray-200">
                                {(() => {
                                  // 해당 shipment에 속한 아이템 중 collaboration 상품이 있는지 확인
                                  const hasCollabItem = groupItems.some((item: any) => item.product_source === 'collaboration');
                                  
                                  // collaboration 상품이고 아직 송장이 없으면 출고 요청 UI 표시
                                  if (hasCollabItem && !shipment.tracking_number && selectedOrder.status === 'paid') {
                                    return (
                                      <div className="space-y-3">
                                        <div className="p-2 bg-purple-50 rounded-lg">
                                          <Typography variant="caption" className="text-purple-700">
                                            협업 상품은 관리자에게 출고 요청이 필요합니다
                                          </Typography>
                                        </div>
                                        <div>
                                          <label className="block text-xs font-medium text-gray-700 mb-1">메모 (선택)</label>
                                          <textarea
                                            value={shipmentNotes}
                                            onChange={(e) => setShipmentNotes(e.target.value)}
                                            placeholder="출고 요청 시 전달할 메모"
                                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F] resize-none"
                                            rows={2}
                                          />
                                        </div>
                                        <Button
                                          onClick={() => handleCreateShipmentRequest(selectedOrder.order_id, true, groupItems[0]?.product_id)}
                                          disabled={isSubmittingShipment}
                                          className="w-full bg-[#FE3A8F] text-white hover:bg-[#e8a0c0]"
                                          size="sm"
                                        >
                                          {isSubmittingShipment ? (
                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                          ) : (
                                            <Truck className="h-4 w-4 mr-2" />
                                          )}
                                          출고 요청
                                        </Button>
                                      </div>
                                    );
                                  }
                                  
                                  return renderTrackingSection(shipment);
                                })()}
                              </div>
                            </div>
                          );
                        })}

                        {/* shipment 없는 상품 */}
                        {noShipmentItems.map((item: any) => {
                          const itemProduct = item.product || selectedOrder.product;
                          const isCollabDelivery = (item.product_type === 'delivery' || itemProduct?.product_type === 'delivery') && item.product_source === 'collaboration';
                          
                          return (
                            <div key={item.order_item_id} className="bg-gray-50 rounded-xl p-4">
                              <div className="flex gap-3">
                                {itemProduct?.thumbnail_url ? (
                                  <img src={itemProduct.thumbnail_url} alt={itemProduct.name} className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                                ) : (
                                  <div className="w-14 h-14 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
                                    <Package className="w-5 h-5 text-gray-400" />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <Typography variant="body2" className="font-medium truncate">{itemProduct?.name}</Typography>
                                  <Typography variant="caption" className="text-gray-500">
                                    {PRODUCT_TYPE_MAP[itemProduct?.product_type || ''] || itemProduct?.product_type}
                                    {isCollabDelivery && <span className="ml-1 text-[#FE3A8F]">(협업)</span>}
                                  </Typography>
                                  <Typography variant="body2" className="text-gray-600 mt-1">
                                    {item.unit_price?.toLocaleString()}P × {item.quantity}개
                                  </Typography>
                                  {item.selected_options && item.selected_options.length > 0 && (
                                    <div className="mt-1 text-xs text-gray-500">
                                      {item.selected_options.map((opt: any, optIdx: number) => (
                                        <span key={optIdx}>
                                          {opt.option_name}: {opt.value || opt.text_value}
                                          {optIdx < item.selected_options.length - 1 && ', '}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                              
                              {/* 협업 택배 상품: 출고 요청 */}
                              {isCollabDelivery && selectedOrder.status === 'paid' && (
                                <div className="mt-3 pt-3 border-t border-gray-200">
                                  <div className="space-y-3">
                                    <div>
                                      <label className="block text-xs font-medium text-gray-700 mb-1">메모 (선택)</label>
                                      <textarea
                                        value={shipmentNotes}
                                        onChange={(e) => setShipmentNotes(e.target.value)}
                                        placeholder="출고 요청 시 전달할 메모"
                                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F] resize-none"
                                        rows={2}
                                      />
                                    </div>
                                    <Button
                                      onClick={() => handleCreateShipmentRequest(selectedOrder.order_id, true, item.product_id)}
                                      disabled={isSubmittingShipment}
                                      className="w-full bg-[#FE3A8F] text-white hover:bg-[#e8a0c0]"
                                      size="sm"
                                    >
                                      {isSubmittingShipment ? (
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                      ) : (
                                        <Truck className="h-4 w-4 mr-2" />
                                      )}
                                      출고 요청
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* 배송지 정보 (별도 섹션) */}
                    {shipments.length > 0 && shipments[0].recipient_name && (
                      <div>
                        <Typography variant="body2" className="font-medium mb-3 flex items-center gap-2">
                          <MapPin className="h-4 w-4" />
                          배송지 정보
                        </Typography>
                        <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                          <div className="flex gap-2">
                            <span className="text-gray-500 w-14 flex-shrink-0">수령인</span>
                            <span>{shipments[0].recipient_name}</span>
                          </div>
                          {shipments[0].recipient_phone && (
                            <div className="flex gap-2">
                              <span className="text-gray-500 w-14 flex-shrink-0">연락처</span>
                              <span>{shipments[0].recipient_phone}</span>
                            </div>
                          )}
                          {shipments[0].recipient_address && (
                            <div className="flex gap-2">
                              <span className="text-gray-500 w-14 flex-shrink-0">주소</span>
                              <span className="flex-1">
                                [{shipments[0].recipient_postal_code}] {shipments[0].recipient_address}
                                {shipments[0].recipient_address_detail && ` ${shipments[0].recipient_address_detail}`}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* 협업 상품 이행완료 섹션 */}
              {(() => {
                const hasCollabItem = selectedOrder.order_items?.some((item: any) => item.product_source === 'collaboration') ||
                  (selectedOrder.product as any)?.source === 'collaboration';
                
                if (!hasCollabItem) return null;
                
                return (
                  <>
                    {/* 이행완료 등록 (결제 완료 상태에서) */}
                    {selectedOrder.status === 'paid' && orderFulfillments.length === 0 && (
                      <div className="bg-white rounded-xl p-4 border">
                        <Typography variant="body2" className="font-medium mb-3">이행완료 등록</Typography>
                        <div className="space-y-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">인증 사진 (필수)</label>
                            <div className="flex flex-wrap gap-2 mb-2">
                              {fulfillmentFiles.map((file, index) => (
                                <div key={index} className="relative w-20 h-20">
                                  <img
                                    src={URL.createObjectURL(file)}
                                    alt={`인증사진 ${index + 1}`}
                                    className="w-full h-full object-cover rounded-lg"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => removeFulfillmentFile(index)}
                                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                              <label className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-[#FE3A8F] transition-colors">
                                <input
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  onChange={handleFulfillmentFileChange}
                                  className="hidden"
                                />
                                <Camera className="h-6 w-6 text-gray-400" />
                              </label>
                            </div>
                            <Typography variant="caption" className="text-gray-500">
                              서비스 완료를 증명하는 사진을 업로드해주세요
                            </Typography>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">메모 (선택)</label>
                            <textarea
                              value={fulfillmentNote}
                              onChange={(e) => setFulfillmentNote(e.target.value)}
                              placeholder="이행 완료에 대한 메모를 남겨주세요"
                              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F] resize-none"
                              rows={2}
                            />
                          </div>
                          <Button
                            onClick={() => handleSubmitFulfillment(selectedOrder.order_id)}
                            disabled={isSubmittingFulfillment || fulfillmentFiles.length === 0}
                            className="w-full bg-[#FE3A8F] text-white hover:bg-[#e8a0c0]"
                          >
                            {isSubmittingFulfillment ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <CheckCircle className="h-4 w-4 mr-2" />
                            )}
                            이행완료 등록
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* 이행완료 완료 표시 */}
                    {orderFulfillments.length > 0 && (
                      <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                        <div className="flex items-center gap-2 mb-3">
                          <CheckCircle className="h-5 w-5 text-blue-500" />
                          <Typography variant="body2" className="font-medium text-blue-700">
                            이행완료 등록됨
                          </Typography>
                        </div>
                        {orderFulfillments.map((fulfillment) => (
                          <div key={fulfillment.id} className="mt-3">
                            <div className="flex flex-wrap gap-2 mb-2">
                              {fulfillment.media_urls.map((url, idx) => (
                                <img
                                  key={idx}
                                  src={url}
                                  alt={`이행완료 사진 ${idx + 1}`}
                                  className="w-16 h-16 object-cover rounded-lg cursor-pointer"
                                  onClick={() => window.open(url, '_blank')}
                                />
                              ))}
                            </div>
                            {fulfillment.note && (
                              <Typography variant="caption" className="text-blue-600 block">
                                메모: {fulfillment.note}
                              </Typography>
                            )}
                            <Typography variant="caption" className="text-blue-500 mt-1 block">
                              등록일시: {formatDate(fulfillment.created_at)}
                            </Typography>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}

              {/* 주문 정보 */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <div className="flex justify-between">
                  <Typography variant="body2" className="text-gray-500">주문번호</Typography>
                  <Typography variant="body2" className="font-medium">{selectedOrder.order_number}</Typography>
                </div>
                <div className="flex justify-between">
                  <Typography variant="body2" className="text-gray-500">주문일시</Typography>
                  <Typography variant="body2">{formatDate(selectedOrder.created_at)}</Typography>
                </div>
                <div className="flex justify-between">
                  <Typography variant="body2" className="text-gray-500">상품금액</Typography>
                  <Typography variant="body2">
                    {formatPrice(selectedOrder.subtotal_amount ?? ((selectedOrder.product?.price ?? 0) * selectedOrder.quantity))}
                  </Typography>
                </div>
                {(selectedOrder.product?.product_type === 'delivery' || selectedOrder.order_items?.some(item => item.product?.product_type === 'delivery')) && (
                  <>
                    <div className="flex justify-between">
                      <Typography variant="body2" className="text-gray-500">배송비</Typography>
                      <Typography variant="body2">
                        {(selectedOrder.total_shipping_fee ?? 0) === 0 ? '무료' : formatPrice(selectedOrder.total_shipping_fee ?? 0)}
                      </Typography>
                    </div>
                    {selectedOrder.shipments && selectedOrder.shipments.length > 1 && (
                      <div className="pl-4 space-y-1">
                        {selectedOrder.shipments.map((s, idx) => (
                          <div key={s.shipment_id} className="flex justify-between text-xs text-gray-400">
                            <span>ㄴ 배송{idx + 1}</span>
                            <span>{s.shipping_fee?.toLocaleString() || 0}P</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between pt-2 border-t border-gray-200">
                  <Typography variant="body2" className="text-gray-500 font-medium">총 결제금액</Typography>
                  <Typography variant="body1" className="font-bold text-[#FE3A8F]">
                    {formatPrice(selectedOrder.total_amount)}
                  </Typography>
                </div>
              </div>

              {/* 배송지 정보 - shipments에서 가져옴 */}
              {(() => {
                const shipment = selectedOrder.shipments?.[0];
                const recipientName = selectedOrder.recipient_name || shipment?.recipient_name;
                const recipientPhone = selectedOrder.recipient_phone || shipment?.recipient_phone;
                const recipientAddress = selectedOrder.recipient_address || shipment?.recipient_address;
                const recipientAddressDetail = selectedOrder.recipient_address_detail || shipment?.recipient_address_detail;
                
                if (!recipientName && !recipientAddress) return null;
                
                return (
                  <div>
                    <Typography variant="body2" className="font-medium mb-3 flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      배송지 정보
                    </Typography>
                    <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                      {recipientName && (
                        <div className="flex justify-between">
                          <Typography variant="caption" className="text-gray-500">받는 분</Typography>
                          <Typography variant="body2">{recipientName}</Typography>
                        </div>
                      )}
                      {recipientPhone && (
                        <div className="flex justify-between">
                          <Typography variant="caption" className="text-gray-500">연락처</Typography>
                          <Typography variant="body2">{recipientPhone}</Typography>
                        </div>
                      )}
                      {recipientAddress && (
                        <div className="flex justify-between">
                          <Typography variant="caption" className="text-gray-500">주소</Typography>
                          <Typography variant="body2" className="text-right">
                            {recipientAddress}
                            {recipientAddressDetail && ` ${recipientAddressDetail}`}
                          </Typography>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* 구매자 정보 */}
              <div>
                <Typography variant="body2" className="font-medium mb-3 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  구매자 정보
                </Typography>
                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    {selectedOrder.buyer?.profile_image ? (
                      <img src={selectedOrder.buyer.profile_image} alt="" className="w-8 h-8 rounded-full" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                        <User className="w-4 h-4 text-gray-400" />
                      </div>
                    )}
                    <Typography variant="body2" className="font-medium">
                      {selectedOrder.buyer?.name || '구매자'}
                    </Typography>
                  </div>
                </div>
              </div>

              {/* 현장수령/픽업 정보 */}
              {(selectedOrder.product?.product_type === 'on_site' || selectedOrder.product?.product_type === 'pickup') && (
                <div>
                  <Typography variant="body2" className="font-medium mb-3 flex items-center gap-2">
                    <Calendar className="h-4 w-4" />
                    예약 정보
                  </Typography>
                  <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                    {selectedOrder.reserved_location && (
                      <div className="flex gap-2">
                        <Typography variant="body2" className="text-gray-500 w-16">장소</Typography>
                        <Typography variant="body2">{selectedOrder.reserved_location}</Typography>
                      </div>
                    )}
                    {selectedOrder.reserved_start_time && (
                      <div className="flex gap-2">
                        <Typography variant="body2" className="text-gray-500 w-16">일시</Typography>
                        <Typography variant="body2">
                          {formatDate(selectedOrder.reserved_start_time)}
                          {selectedOrder.reserved_end_time && ` ~ ${new Date(selectedOrder.reserved_end_time).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`}
                        </Typography>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </SlideSheet>

        {/* 환불 상세 Sheet */}
        <SlideSheet
          isOpen={isRefundDetailOpen}
          onClose={() => {
            setIsRefundDetailOpen(false);
            setSelectedRefund(null);
            setRejectionReason('');
          }}
          title="환불 요청 상세"
        >
          {selectedRefund && (
            <div className="p-6 space-y-6">
              {/* 상품 정보 */}
              <div className="flex gap-3">
                {selectedRefund.order?.product?.thumbnail_url && (
                  <img
                    src={selectedRefund.order.product.thumbnail_url}
                    alt={selectedRefund.order.product?.name}
                    className="w-20 h-20 rounded-lg object-cover"
                  />
                )}
                <div className="flex-1">
                  <Typography variant="body1" className="font-medium">
                    {selectedRefund.order?.product?.name}
                  </Typography>
                  <Typography variant="caption" className="text-gray-500">
                    {PRODUCT_TYPE_MAP[selectedRefund.order?.product?.product_type || ''] || selectedRefund.order?.product?.product_type}
                  </Typography>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs px-2 py-1 rounded-full ${REFUND_STATUS_MAP[selectedRefund.status]?.color || 'bg-gray-100'}`}>
                      {REFUND_STATUS_MAP[selectedRefund.status]?.label || selectedRefund.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* 환불 정보 */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <div className="flex justify-between">
                  <Typography variant="body2" className="text-gray-500">주문번호</Typography>
                  <Typography variant="body2" className="font-medium">{selectedRefund.order?.order_number}</Typography>
                </div>
                <div className="flex justify-between">
                  <Typography variant="body2" className="text-gray-500">요청일시</Typography>
                  <Typography variant="body2">{formatDate(selectedRefund.created_at)}</Typography>
                </div>
                <div className="flex justify-between">
                  <Typography variant="body2" className="text-gray-500">수량</Typography>
                  <Typography variant="body2">{selectedRefund.order?.quantity || 1}개</Typography>
                </div>
                <div className="flex justify-between">
                  <Typography variant="body2" className="text-gray-500">결제금액</Typography>
                  <Typography variant="body2">{formatPrice(selectedRefund.order?.total_amount || 0)}</Typography>
                </div>
                <div className="flex justify-between border-t pt-3">
                  <Typography variant="body2" className="text-gray-500">환불금액</Typography>
                  <Typography variant="body1" className="font-bold text-[#FE3A8F]">
                    {formatPrice(selectedRefund.refund_amount)}
                  </Typography>
                </div>
              </div>

              {/* 구매자 정보 */}
              <div>
                <Typography variant="body2" className="font-medium mb-3 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  구매자 정보
                </Typography>
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center gap-2">
                    {selectedRefund.order?.buyer?.profile_image ? (
                      <img src={selectedRefund.order.buyer.profile_image} alt="" className="w-8 h-8 rounded-full" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                        <User className="w-4 h-4 text-gray-400" />
                      </div>
                    )}
                    <div>
                      <Typography variant="body2" className="font-medium">
                        {selectedRefund.order?.buyer?.name || '구매자'}
                      </Typography>
                      {selectedRefund.order?.buyer?.member_code && (
                        <Typography variant="caption" className="text-gray-500">
                          {selectedRefund.order.buyer.member_code}
                        </Typography>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 환불 사유 */}
              {selectedRefund.reason && (
                <div>
                  <Typography variant="body2" className="font-medium mb-2">환불 사유</Typography>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <Typography variant="body2" className="text-gray-600">
                      {selectedRefund.reason}
                    </Typography>
                  </div>
                </div>
              )}

              {/* 거절 사유 (거절된 경우) */}
              {selectedRefund.status === 'rejected' && selectedRefund.rejection_reason && (
                <div>
                  <Typography variant="body2" className="font-medium mb-2 text-red-600">거절 사유</Typography>
                  <div className="bg-red-50 rounded-xl p-4">
                    <Typography variant="body2" className="text-red-600">
                      {selectedRefund.rejection_reason}
                    </Typography>
                  </div>
                </div>
              )}

              {/* 처리 완료 날짜 */}
              {selectedRefund.processed_date && (
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="flex justify-between">
                    <Typography variant="body2" className="text-gray-500">처리일시</Typography>
                    <Typography variant="body2">{formatDate(selectedRefund.processed_date)}</Typography>
                  </div>
                </div>
              )}

              {/* 환불 처리 버튼 (대기 중인 경우만) */}
              {selectedRefund.status === 'requested' && (
                <div className="pt-4 border-t space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">거절 사유 (거절 시 필수)</label>
                    <textarea
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="거절하시려면 사유를 입력해주세요"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F] resize-none"
                      rows={3}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={async () => {
                        if (!rejectionReason.trim()) {
                          toast.error('거절 사유를 입력해주세요.');
                          return;
                        }
                        setIsProcessingRefund(true);
                        try {
                          const response = await storeRefundsApi.partnerRespond(selectedRefund.refund_id, {
                            action: 'reject',
                            rejection_reason: rejectionReason.trim(),
                          });
                          if (response.success) {
                            toast.success('환불 요청이 거절되었습니다.');
                            setIsRefundDetailOpen(false);
                            setSelectedRefund(null);
                            setRejectionReason('');
                            fetchRefunds();
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
                          const response = await storeRefundsApi.partnerRespond(selectedRefund.refund_id, {
                            action: 'accept',
                          });
                          if (response.success) {
                            toast.success('환불이 완료되었습니다.');
                            setIsRefundDetailOpen(false);
                            setSelectedRefund(null);
                            fetchRefunds();
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

        {/* 협업 상품 상세 SlideSheet */}
        <SlideSheet
          isOpen={isCollabProductDetailOpen}
          onClose={() => {
            setIsCollabProductDetailOpen(false);
            setSelectedCollabProduct(null);
          }}
          title="협업 상품 상세"
        >
          {selectedCollabProduct && (
            <div className="space-y-6 p-4">
              {/* 상품 이미지 */}
              {selectedCollabProduct.product?.thumbnail_url && (
                <img
                  src={selectedCollabProduct.product.thumbnail_url}
                  alt={selectedCollabProduct.product.name}
                  className="w-full h-48 object-cover rounded-xl"
                />
              )}

              {/* 상품 정보 */}
              <div>
                <Typography variant="h4" className="font-bold mb-2">
                  {selectedCollabProduct.product?.name || '상품 정보 없음'}
                </Typography>
                <Typography variant="h3" className="text-[#FE3A8F] font-bold">
                  {(selectedCollabProduct.product?.price ?? 0).toLocaleString()}원
                </Typography>
              </div>

              {/* 협업 정보 */}
              <div className="bg-green-50 rounded-xl p-4 space-y-2">
                <Typography variant="body2" className="font-medium text-green-700 mb-2">협업 정보</Typography>
                {selectedCollabProduct.distribution_rate && (
                  <div className="flex justify-between">
                    <Typography variant="body2" className="text-gray-500">수수료율</Typography>
                    <Typography variant="body2" className="text-green-700 font-bold">{selectedCollabProduct.distribution_rate}%</Typography>
                  </div>
                )}
                <div className="flex justify-between">
                  <Typography variant="body2" className="text-gray-500">협업 시작일</Typography>
                  <Typography variant="body2">{new Date(selectedCollabProduct.created_at).toLocaleDateString()}</Typography>
                </div>
              </div>

              {/* 상세 정보 */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <div className="flex justify-between">
                  <Typography variant="body2" className="text-gray-500">상품 유형</Typography>
                  <Typography variant="body2">{PRODUCT_TYPE_MAP[selectedCollabProduct.product?.product_type || ''] || selectedCollabProduct.product?.product_type}</Typography>
                </div>
                {selectedCollabProduct.product?.product_type !== 'digital' && (
                  <div className="flex justify-between">
                    <Typography variant="body2" className="text-gray-500">재고</Typography>
                    <Typography variant="body2" className={(selectedCollabProduct.product?.stock ?? 0) === 0 ? 'text-pink-600 font-bold' : ''}>
                      {(selectedCollabProduct.product?.stock ?? 0) === 0 ? '품절' : selectedCollabProduct.product?.stock}
                    </Typography>
                  </div>
                )}
                {selectedCollabProduct.product?.product_type === 'delivery' && (
                  <>
                    <div className="flex justify-between">
                      <Typography variant="body2" className="text-gray-500">기본 배송비</Typography>
                      <Typography variant="body2">{((selectedCollabProduct.product as any)?.shipping_fee_base ?? 0) === 0 ? '무료' : `${((selectedCollabProduct.product as any)?.shipping_fee_base ?? 0).toLocaleString()}원`}</Typography>
                    </div>
                    {((selectedCollabProduct.product as any)?.shipping_fee_remote ?? 0) > 0 && (
                      <div className="flex justify-between">
                        <Typography variant="body2" className="text-gray-500">도서산간 추가 배송비</Typography>
                        <Typography variant="body2">{((selectedCollabProduct.product as any)?.shipping_fee_remote ?? 0).toLocaleString()}원</Typography>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between">
                  <Typography variant="body2" className="text-gray-500">상태</Typography>
                  <span className={`text-xs px-2 py-1 rounded ${selectedCollabProduct.product?.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {selectedCollabProduct.product?.is_active ? '판매중' : '비활성'}
                  </span>
                </div>
              </div>

              {/* 디지털 자산 (디지털 상품인 경우) */}
              {selectedCollabProduct.product?.product_type === 'digital' && (selectedCollabProduct.product as any)?.digital_assets && (selectedCollabProduct.product as any).digital_assets.length > 0 && (
                <div>
                  <Typography variant="body2" className="font-medium mb-2">디지털 자산</Typography>
                  <div className="grid grid-cols-4 gap-2">
                    {(selectedCollabProduct.product as any).digital_assets.map((asset: any, idx: number) => (
                      <div key={asset.asset_id || idx} className="relative">
                        {asset.asset_url || asset.file_url ? (
                          <img src={asset.asset_url || asset.file_url} alt="" className="w-full h-20 rounded-lg object-cover" />
                        ) : (
                          <div className="w-full h-20 bg-gray-100 border rounded-lg flex items-center justify-center">
                            <FileText className="h-6 w-6 text-gray-400" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <Typography variant="caption" className="text-gray-500 mt-2 block">
                    총 {(selectedCollabProduct.product as any).digital_assets.length}개의 디지털 자산
                  </Typography>
                </div>
              )}

              {/* 설명 */}
              {selectedCollabProduct.product?.description && (
                <div>
                  <Typography variant="body2" className="font-medium mb-2">상품 설명</Typography>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <Typography variant="body2" className="text-gray-600 whitespace-pre-wrap">
                      {selectedCollabProduct.product.description}
                    </Typography>
                  </div>
                </div>
              )}
            </div>
          )}
        </SlideSheet>

        {/* 협업 주문 상세 SlideSheet */}
        <SlideSheet
          isOpen={isCollabOrderDetailOpen}
          onClose={() => {
            setIsCollabOrderDetailOpen(false);
            setSelectedCollabOrder(null);
            setShipmentNotes('');
          }}
          title="협업 주문 상세"
        >
          {selectedCollabOrder && (
            <div className="p-4 space-y-6">
              {/* 상품 정보 */}
              <div className="bg-white rounded-xl p-4 border">
                <div className="flex gap-4">
                  {selectedCollabOrder.product?.thumbnail_url && (
                    <img
                      src={selectedCollabOrder.product.thumbnail_url}
                      alt={selectedCollabOrder.product.name}
                      className="w-20 h-20 object-cover rounded-lg"
                    />
                  )}
                  <div className="flex-1">
                    <Typography variant="body2" className="font-semibold">
                      {selectedCollabOrder.product?.name || '상품 정보 없음'}
                    </Typography>
                    <Typography variant="caption" className="text-gray-500 mt-1 block">
                      {selectedCollabOrder.order_number}
                    </Typography>
                    <div className="mt-2 flex items-center gap-2">
                      <span className={`text-xs px-2 py-1 rounded-full ${STATUS_MAP[selectedCollabOrder.status]?.color || 'bg-gray-100'}`}>
                        {STATUS_MAP[selectedCollabOrder.status]?.label || selectedCollabOrder.status}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 주문 정보 */}
              <div className="bg-white rounded-xl p-4 border">
                <Typography variant="body2" className="font-medium mb-3">주문 정보</Typography>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Typography variant="caption" className="text-gray-500">수량</Typography>
                    <Typography variant="body2">{selectedCollabOrder.quantity}개</Typography>
                  </div>
                  <div className="flex justify-between">
                    <Typography variant="caption" className="text-gray-500">주문금액</Typography>
                    <Typography variant="body2" className="font-semibold text-[#FE3A8F]">
                      {formatPrice(selectedCollabOrder.total_amount)}
                    </Typography>
                  </div>
                  <div className="flex justify-between">
                    <Typography variant="caption" className="text-gray-500">주문일시</Typography>
                    <Typography variant="body2">{formatDate(selectedCollabOrder.created_at)}</Typography>
                  </div>
                </div>
              </div>

              {/* 구매자 정보 */}
              <div className="bg-white rounded-xl p-4 border">
                <Typography variant="body2" className="font-medium mb-3">구매자 정보</Typography>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Typography variant="caption" className="text-gray-500">구매자</Typography>
                    <Typography variant="body2">{selectedCollabOrder.buyer?.name || selectedCollabOrder.recipient_name || '-'}</Typography>
                  </div>
                  {selectedCollabOrder.recipient_phone && (
                    <div className="flex justify-between">
                      <Typography variant="caption" className="text-gray-500">연락처</Typography>
                      <Typography variant="body2">{selectedCollabOrder.recipient_phone}</Typography>
                    </div>
                  )}
                  {selectedCollabOrder.recipient_address && (
                    <div className="flex justify-between">
                      <Typography variant="caption" className="text-gray-500">배송지</Typography>
                      <Typography variant="body2" className="text-right max-w-[200px]">
                        {selectedCollabOrder.recipient_address}
                      </Typography>
                    </div>
                  )}
                </div>
              </div>

              {/* 이행완료 등록 (결제 완료 상태에서 먼저 등록) */}
              {selectedCollabOrder.status === 'paid' && orderFulfillments.length === 0 && (
                <div className="bg-white rounded-xl p-4 border">
                  <Typography variant="body2" className="font-medium mb-3">이행완료 등록</Typography>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">인증 사진 (필수)</label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {fulfillmentFiles.map((file, index) => (
                          <div key={index} className="relative w-20 h-20">
                            <img
                              src={URL.createObjectURL(file)}
                              alt={`인증사진 ${index + 1}`}
                              className="w-full h-full object-cover rounded-lg"
                            />
                            <button
                              type="button"
                              onClick={() => removeFulfillmentFile(index)}
                              className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        <label className="w-20 h-20 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center cursor-pointer hover:border-[#FE3A8F] transition-colors">
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleFulfillmentFileChange}
                            className="hidden"
                          />
                          <Camera className="h-6 w-6 text-gray-400" />
                        </label>
                      </div>
                      <Typography variant="caption" className="text-gray-500">
                        서비스 완료를 증명하는 사진을 업로드해주세요
                      </Typography>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">메모 (선택)</label>
                      <textarea
                        value={fulfillmentNote}
                        onChange={(e) => setFulfillmentNote(e.target.value)}
                        placeholder="이행 완료에 대한 메모를 남겨주세요"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F] resize-none"
                        rows={2}
                      />
                    </div>
                    <Button
                      onClick={() => handleSubmitFulfillment(selectedCollabOrder.order_id)}
                      disabled={isSubmittingFulfillment || fulfillmentFiles.length === 0}
                      className="w-full bg-[#FE3A8F] text-white hover:bg-[#e8a0c0]"
                    >
                      {isSubmittingFulfillment ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <CheckCircle className="h-4 w-4 mr-2" />
                      )}
                      이행완료 등록
                    </Button>
                  </div>
                </div>
              )}

              {/* 이행완료 완료 표시 */}
              {orderFulfillments.length > 0 && (
                <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="h-5 w-5 text-blue-500" />
                    <Typography variant="body2" className="font-medium text-blue-700">
                      이행완료 등록됨
                    </Typography>
                  </div>
                  {orderFulfillments.map((fulfillment) => (
                    <div key={fulfillment.id} className="mt-3">
                      <div className="flex flex-wrap gap-2 mb-2">
                        {fulfillment.media_urls.map((url, idx) => (
                          <img
                            key={idx}
                            src={url}
                            alt={`이행완료 사진 ${idx + 1}`}
                            className="w-16 h-16 object-cover rounded-lg cursor-pointer"
                            onClick={() => window.open(url, '_blank')}
                          />
                        ))}
                      </div>
                      {fulfillment.note && (
                        <Typography variant="caption" className="text-blue-600 block">
                          메모: {fulfillment.note}
                        </Typography>
                      )}
                      <Typography variant="caption" className="text-blue-500 mt-1 block">
                        등록일시: {formatDate(fulfillment.created_at)}
                      </Typography>
                    </div>
                  ))}
                </div>
              )}

              {/* 출고 요청 완료 표시 (이행완료 시 자동 생성) */}
              {selectedCollabOrder.shipment_request && (
                <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                    <Typography variant="body2" className="font-medium text-green-700">
                      출고 요청 완료
                    </Typography>
                  </div>
                  <Typography variant="caption" className="text-green-600 mt-2 block">
                    요청일시: {formatDate(selectedCollabOrder.shipment_request.created_at)}
                  </Typography>
                  {selectedCollabOrder.shipment_request.notes && (
                    <Typography variant="caption" className="text-green-600 mt-1 block">
                      메모: {selectedCollabOrder.shipment_request.notes}
                    </Typography>
                  )}
                </div>
              )}
            </div>
          )}
        </SlideSheet>

        {/* 스케줄 장소 선택 모달 */}
        <LocationPickerSheet
          isOpen={scheduleLocationPickerOpen}
          onClose={() => {
            setScheduleLocationPickerOpen(false);
            setEditingNewScheduleIndex(null);
          }}
          onConfirm={(result: LocationResult) => {
            if (editingNewScheduleIndex !== null) {
              const updated = [...newSchedules];
              updated[editingNewScheduleIndex] = {
                ...updated[editingNewScheduleIndex],
                location: result.address,
                location_point: { lat: result.lat, lng: result.lng },
              };
              setNewSchedules(updated);
            }
            setScheduleLocationPickerOpen(false);
            setEditingNewScheduleIndex(null);
          }}
        />
      </div>
    </div>
  );
}
