import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect, useCallback } from 'react';
import { Loader2, Package, CheckCircle, XCircle, Truck, Clock, User, ChevronRight, Send, Eye, Archive, ShoppingBag, MapPin } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { storeCollaborationApi, type CollaborationProductRequest, type ShipmentRequest } from '@/api/store/collaboration';
import { Typography, Button, SlideSheet, StoreLoadingState, StoreEmptyState } from '@/components';
import { toast } from 'sonner';

export const Route = createFileRoute('/store/partner/collaboration')({
  component: PartnerCollaborationPage,
});

type TabType = 'requests' | 'shipments' | 'pending';
type RequestStatusFilter = 'all' | 'pending' | 'accepted' | 'rejected';
type ShipmentStatusFilter = 'all' | 'pending' | 'shipped' | 'rejected';

const PRODUCT_TYPE_LABEL: Record<string, string> = {
  delivery: '택배 배송',
  digital: '디지털',
  on_site: '현장 수령',
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

interface PendingOrder {
  order_id: string;
  order_number: string;
  status: string;
  total_amount: number;
  quantity: number;
  shipping_fee?: number;
  recipient_name?: string;
  recipient_phone?: string;
  recipient_address?: string;
  recipient_postal_code?: string;
  delivery_memo?: string;
  created_at: string;
  product?: {
    product_id: string;
    name: string;
    thumbnail_url?: string;
    price: number;
    product_type: string;
    stock?: number;
  };
  buyer?: {
    id: string;
    name: string;
    profile_image?: string;
  };
}

function PartnerCollaborationPage() {
  const navigate = useNavigate();
  const { user, isLoading: userLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<TabType>('requests');

  // 협업 요청 상태
  const [productRequests, setProductRequests] = useState<CollaborationProductRequest[]>([]);
  const [isLoadingRequests, setIsLoadingRequests] = useState(false);
  const [requestStatusFilter, setRequestStatusFilter] = useState<RequestStatusFilter>('pending');
  const [requestPage, setRequestPage] = useState(1);
  const [requestTotalPages, setRequestTotalPages] = useState(1);
  const [selectedRequest, setSelectedRequest] = useState<CollaborationProductRequest | null>(null);
  const [isRequestDetailOpen, setIsRequestDetailOpen] = useState(false);
  const [isRespondingRequest, setIsRespondingRequest] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  // 출고 요청 상태
  const [shipmentRequests, setShipmentRequests] = useState<ShipmentRequest[]>([]);
  const [isLoadingShipments, setIsLoadingShipments] = useState(false);
  const [shipmentStatusFilter, setShipmentStatusFilter] = useState<ShipmentStatusFilter>('all');
  const [shipmentPage, setShipmentPage] = useState(1);
  const [shipmentTotalPages, setShipmentTotalPages] = useState(1);
  const [selectedShipment, setSelectedShipment] = useState<ShipmentRequest | null>(null);
  const [isShipmentDetailOpen, setIsShipmentDetailOpen] = useState(false);

  // 출고 대기 주문 상태
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [isLoadingPendingOrders, setIsLoadingPendingOrders] = useState(false);
  const [pendingOrderPage, setPendingOrderPage] = useState(1);
  const [pendingOrderTotalPages, setPendingOrderTotalPages] = useState(1);
  const [selectedPendingOrder, setSelectedPendingOrder] = useState<PendingOrder | null>(null);
  const [isCreateShipmentOpen, setIsCreateShipmentOpen] = useState(false);
  const [shipmentNotes, setShipmentNotes] = useState('');
  const [isCreatingShipment, setIsCreatingShipment] = useState(false);

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
  }, [user?.id, user?.role, userLoading, navigate]);

  // 협업 요청 목록 로드
  const fetchProductRequests = useCallback(async () => {
    if (!user?.id || user.role !== 'partner') return;

    setIsLoadingRequests(true);
    try {
      const params: any = { page: requestPage, limit: 20 };
      if (requestStatusFilter !== 'all') {
        params.status = requestStatusFilter;
      }
      const response = await storeCollaborationApi.getProductRequests(params);
      if (response.success && response.data) {
        setProductRequests(Array.isArray(response.data) ? response.data : []);
        const pagination = (response as any).pagination;
        if (pagination) {
          setRequestTotalPages(pagination.totalPages || 1);
        }
      }
    } catch (err) {
      console.error('협업 요청 로드 실패:', err);
    } finally {
      setIsLoadingRequests(false);
    }
  }, [user?.id, user?.role, requestPage, requestStatusFilter]);

  // 출고 요청 목록 로드
  const fetchShipmentRequests = useCallback(async () => {
    if (!user?.id || user.role !== 'partner') return;

    setIsLoadingShipments(true);
    try {
      const params: any = { page: shipmentPage, limit: 20 };
      if (shipmentStatusFilter !== 'all') {
        params.status = shipmentStatusFilter;
      }
      const response = await storeCollaborationApi.getShipmentRequests(params);
      if (response.success && response.data) {
        setShipmentRequests(Array.isArray(response.data) ? response.data : []);
        const pagination = (response as any).pagination;
        if (pagination) {
          setShipmentTotalPages(pagination.totalPages || 1);
        }
      }
    } catch (err) {
      console.error('출고 요청 로드 실패:', err);
    } finally {
      setIsLoadingShipments(false);
    }
  }, [user?.id, user?.role, shipmentPage, shipmentStatusFilter]);

  // 출고 대기 주문 로드
  const fetchPendingOrders = useCallback(async () => {
    if (!user?.id || user.role !== 'partner') return;

    setIsLoadingPendingOrders(true);
    try {
      const response = await storeCollaborationApi.getPendingOrders({ page: pendingOrderPage, limit: 20 });
      if (response.success && response.data) {
        setPendingOrders(Array.isArray(response.data) ? response.data : []);
        const pagination = (response as any).pagination;
        if (pagination) {
          setPendingOrderTotalPages(pagination.totalPages || 1);
        }
      }
    } catch (err) {
      console.error('출고 대기 주문 로드 실패:', err);
    } finally {
      setIsLoadingPendingOrders(false);
    }
  }, [user?.id, user?.role, pendingOrderPage]);

  useEffect(() => {
    if (activeTab === 'requests') fetchProductRequests();
  }, [activeTab, fetchProductRequests]);

  useEffect(() => {
    if (activeTab === 'shipments') fetchShipmentRequests();
  }, [activeTab, fetchShipmentRequests]);

  useEffect(() => {
    if (activeTab === 'pending') fetchPendingOrders();
  }, [activeTab, fetchPendingOrders]);

  // 협업 요청 응답
  const handleRespondRequest = async (action: 'accept' | 'reject') => {
    if (!selectedRequest) return;

    if (action === 'reject' && !rejectionReason.trim()) {
      toast.error('거절 사유를 입력해주세요.');
      return;
    }

    setIsRespondingRequest(true);
    try {
      const response = await storeCollaborationApi.respondProductRequest(selectedRequest.request_id, {
        status: action === 'accept' ? 'approved' : 'rejected',
      });

      if (response.success) {
        toast.success(action === 'accept' ? '협업 요청을 수락했습니다.' : '협업 요청을 거절했습니다.');
        setIsRequestDetailOpen(false);
        setSelectedRequest(null);
        setRejectionReason('');
        fetchProductRequests();
      } else {
        toast.error(response.error?.message || '처리에 실패했습니다.');
      }
    } catch (err: any) {
      toast.error(err.message || '처리에 실패했습니다.');
    } finally {
      setIsRespondingRequest(false);
    }
  };

  // 출고 요청 생성
  const handleCreateShipmentRequest = async () => {
    if (!selectedPendingOrder) return;

    setIsCreatingShipment(true);
    try {
      const response = await storeCollaborationApi.createShipmentRequest({
        order_id: selectedPendingOrder.order_id,
        notes: shipmentNotes.trim() || undefined,
      });

      if (response.success) {
        toast.success('출고 요청이 완료되었습니다.');
        setIsCreateShipmentOpen(false);
        setSelectedPendingOrder(null);
        setShipmentNotes('');
        fetchPendingOrders();
        fetchShipmentRequests();
      } else {
        toast.error(response.error?.message || '출고 요청에 실패했습니다.');
      }
    } catch (err: any) {
      toast.error(err.message || '출고 요청에 실패했습니다.');
    } finally {
      setIsCreatingShipment(false);
    }
  };

  const formatPrice = (price: number) => price.toLocaleString('ko-KR') + '원';
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (userLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#FE3A8F]" />
      </div>
    );
  }

  if (!user || user.role !== 'partner') {
    return null;
  }

  return (
    <div className="bg-gray-50 pb-24">
      {/* 탭 */}
      <div className="px-4 py-4">
        <div className="flex gap-2 bg-gray-100 p-1 rounded-full">
          {[
            { key: 'requests', label: '협업 요청', icon: Archive },
            { key: 'pending', label: '출고 대기', icon: Clock },
            { key: 'shipments', label: '출고 현황', icon: Truck },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as TabType)}
              className={`flex-1 py-2 px-3 rounded-full font-medium transition-all flex items-center justify-center gap-2 text-sm ${
                activeTab === tab.key
                  ? 'bg-white text-[#FE3A8F] shadow-sm'
                  : 'text-gray-500'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 협업 요청 탭 */}
      {activeTab === 'requests' && (
        <div className="px-4">
          {/* 필터 */}
          <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide">
            {[
              { key: 'all', label: '전체' },
              { key: 'pending', label: '대기 중' },
              { key: 'accepted', label: '수락됨' },
              { key: 'rejected', label: '거절됨' },
            ].map((filter) => (
              <button
                key={filter.key}
                onClick={() => {
                  setRequestStatusFilter(filter.key as RequestStatusFilter);
                  setRequestPage(1);
                }}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  requestStatusFilter === filter.key
                    ? 'bg-[#FE3A8F] text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-100'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {isLoadingRequests ? (
            <StoreLoadingState />
          ) : productRequests.length === 0 ? (
            <StoreEmptyState 
              message="협업 요청이 없습니다" 
              description="관리자가 협업 상품 등록 요청을 보내면 여기에 표시됩니다"
            />
          ) : (
            <>
              <div className="space-y-3">
                {productRequests.map((request) => (
                  <div
                    key={request.request_id}
                    onClick={() => {
                      setSelectedRequest(request);
                      setIsRequestDetailOpen(true);
                    }}
                    className="bg-white rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start gap-3">
                      {request.product?.thumbnail_url ? (
                        <img
                          src={request.product.thumbnail_url}
                          alt={request.product.name}
                          className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <ShoppingBag className="h-6 w-6 text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <Typography variant="body2" className="font-medium truncate">
                            {request.product?.name || '상품명 없음'}
                          </Typography>
                          <span className={`px-2 py-1 rounded text-xs font-medium flex-shrink-0 ${REQUEST_STATUS_COLOR[request.status]}`}>
                            {REQUEST_STATUS_LABEL[request.status]}
                          </span>
                        </div>
                        {request.product && (
                          <Typography variant="caption" className="text-gray-500 block">
                            {PRODUCT_TYPE_LABEL[request.product.product_type]} • {formatPrice(request.product.price)}
                          </Typography>
                        )}
                        <Typography variant="caption" className="text-gray-400 block mt-1">
                          {formatDate(request.created_at)}
                        </Typography>
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-300 flex-shrink-0 self-center" />
                    </div>
                  </div>
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

      {/* 출고 대기 탭 */}
      {activeTab === 'pending' && (
        <div className="px-4">
          <div className="mb-4 p-3 bg-blue-50 rounded-lg">
            <Typography variant="caption" className="text-blue-700">
              💡 결제 완료된 택배 배송 협업 상품의 주문입니다. 출고 요청을 통해 관리자에게 배송을 요청하세요.
            </Typography>
          </div>

          {isLoadingPendingOrders ? (
            <StoreLoadingState />
          ) : pendingOrders.length === 0 ? (
            <StoreEmptyState 
              message="출고 대기 주문이 없습니다" 
              description="결제 완료된 택배 배송 협업 상품 주문이 여기에 표시됩니다"
            />
          ) : (
            <>
              <div className="space-y-3">
                {pendingOrders.map((order) => (
                  <div
                    key={order.order_id}
                    className="bg-white rounded-xl p-4 shadow-sm"
                  >
                    <div className="flex items-start gap-3 mb-3">
                      {order.product?.thumbnail_url ? (
                        <img
                          src={order.product.thumbnail_url}
                          alt={order.product.name}
                          className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                          <ShoppingBag className="h-6 w-6 text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <Typography variant="body2" className="font-medium truncate">
                          {order.product?.name}
                        </Typography>
                        <Typography variant="caption" className="text-gray-500">
                          주문번호: {order.order_number}
                        </Typography>
                        <div className="flex items-center gap-2 mt-1">
                          <Typography variant="body2" className="font-semibold text-[#FE3A8F]">
                            {formatPrice(order.total_amount)}
                          </Typography>
                          <span className="text-xs text-gray-400">•</span>
                          <Typography variant="caption" className="text-gray-500">
                            {order.quantity}개
                          </Typography>
                        </div>
                        {order.buyer && (
                          <div className="flex items-center gap-1 mt-1">
                            <User className="h-3 w-3 text-gray-400" />
                            <Typography variant="caption" className="text-gray-500">
                              {order.buyer.name}
                            </Typography>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 배송지 정보 */}
                    {order.recipient_name && (
                      <div className="pt-3 border-t border-gray-100 mb-3">
                        <div className="flex items-start gap-2">
                          <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                          <div className="text-sm text-gray-600">
                            <div>{order.recipient_name} • {order.recipient_phone}</div>
                            <div className="text-gray-500">
                              [{order.recipient_postal_code}] {order.recipient_address}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <Button
                      onClick={() => {
                        setSelectedPendingOrder(order);
                        setShipmentNotes('');
                        setIsCreateShipmentOpen(true);
                      }}
                      className="w-full bg-[#FE3A8F] text-white"
                    >
                      <Send className="h-4 w-4 mr-2" />
                      출고 요청
                    </Button>
                  </div>
                ))}
              </div>

              {pendingOrderTotalPages > 1 && (
                <div className="flex justify-center gap-2 mt-6">
                  <Button
                    variant="outline"
                    onClick={() => setPendingOrderPage((p) => Math.max(1, p - 1))}
                    disabled={pendingOrderPage === 1}
                  >
                    이전
                  </Button>
                  <Typography variant="body2" className="flex items-center px-4">
                    {pendingOrderPage} / {pendingOrderTotalPages}
                  </Typography>
                  <Button
                    variant="outline"
                    onClick={() => setPendingOrderPage((p) => Math.min(pendingOrderTotalPages, p + 1))}
                    disabled={pendingOrderPage === pendingOrderTotalPages}
                  >
                    다음
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 출고 현황 탭 */}
      {activeTab === 'shipments' && (
        <div className="px-4">
          {/* 필터 */}
          <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide">
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
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  shipmentStatusFilter === filter.key
                    ? 'bg-[#FE3A8F] text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-100'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {isLoadingShipments ? (
            <StoreLoadingState />
          ) : shipmentRequests.length === 0 ? (
            <StoreEmptyState 
              message="출고 요청이 없습니다"
              description="관리자에게 보낸 출고 요청 내역이 여기에 표시됩니다"
            />
          ) : (
            <>
              <div className="space-y-3">
                {shipmentRequests.map((request) => (
                  <div
                    key={request.request_id}
                    onClick={() => {
                      setSelectedShipment(request);
                      setIsShipmentDetailOpen(true);
                    }}
                    className="bg-white rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <Typography variant="caption" className="text-gray-500 block mb-1">
                          {formatDate(request.created_at)}
                        </Typography>
                        {request.product && (
                          <Typography variant="body2" className="font-medium truncate">
                            {request.product.name}
                          </Typography>
                        )}
                        {request.order && (
                          <Typography variant="caption" className="text-gray-600">
                            주문번호: {request.order.order_number}
                          </Typography>
                        )}
                      </div>
                      <span className={`px-2 py-1 rounded text-xs font-medium flex-shrink-0 ${SHIPMENT_STATUS_COLOR[request.status]}`}>
                        {SHIPMENT_STATUS_LABEL[request.status]}
                      </span>
                    </div>

                    {request.courier && request.tracking_number && (
                      <div className="pt-2 border-t border-gray-100 mt-2">
                        <div className="flex items-center gap-2 text-sm">
                          <Truck className="h-4 w-4 text-gray-400" />
                          <span className="text-gray-600">{request.courier}</span>
                          <span className="text-gray-400">•</span>
                          <span className="text-gray-600">{request.tracking_number}</span>
                        </div>
                      </div>
                    )}

                    {request.rejection_reason && (
                      <div className="pt-2 border-t border-gray-100 mt-2">
                        <Typography variant="caption" className="text-red-600">
                          거절 사유: {request.rejection_reason}
                        </Typography>
                      </div>
                    )}
                  </div>
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

      {/* 협업 요청 상세 Sheet */}
      <SlideSheet
        isOpen={isRequestDetailOpen}
        onClose={() => {
          setIsRequestDetailOpen(false);
          setSelectedRequest(null);
          setRejectionReason('');
        }}
        title="협업 요청 상세"
      >
        {selectedRequest && (
          <div className="space-y-4">
            {/* 상품 정보 */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex gap-3">
                {selectedRequest.product?.thumbnail_url ? (
                  <img
                    src={selectedRequest.product.thumbnail_url}
                    alt={selectedRequest.product.name}
                    className="w-20 h-20 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-lg bg-gray-200 flex items-center justify-center">
                    <ShoppingBag className="h-8 w-8 text-gray-400" />
                  </div>
                )}
                <div className="flex-1">
                  <Typography variant="body1" className="font-medium mb-1">
                    {selectedRequest.product?.name}
                  </Typography>
                  {selectedRequest.product && (
                    <>
                      <Typography variant="caption" className="text-gray-500 block">
                        {PRODUCT_TYPE_LABEL[selectedRequest.product.product_type]}
                      </Typography>
                      <Typography variant="body2" className="font-semibold text-[#FE3A8F] mt-1">
                        {formatPrice(selectedRequest.product.price)}
                      </Typography>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* 요청 정보 */}
            <div className="space-y-3">
              <div className="flex justify-between">
                <Typography variant="body2" className="text-gray-500">상태</Typography>
                <span className={`px-2 py-1 rounded text-xs font-medium ${REQUEST_STATUS_COLOR[selectedRequest.status]}`}>
                  {REQUEST_STATUS_LABEL[selectedRequest.status]}
                </span>
              </div>
              <div className="flex justify-between">
                <Typography variant="body2" className="text-gray-500">요청일</Typography>
                <Typography variant="body2">{formatDate(selectedRequest.created_at)}</Typography>
              </div>
              {selectedRequest.distribution_rate !== undefined && (
                <div className="flex justify-between">
                  <Typography variant="body2" className="text-gray-500">배분율</Typography>
                  <Typography variant="body2" className="text-purple-600 font-medium">
                    {selectedRequest.distribution_rate}%
                  </Typography>
                </div>
              )}
              {selectedRequest.admin && (
                <div className="flex justify-between">
                  <Typography variant="body2" className="text-gray-500">요청자</Typography>
                  <Typography variant="body2">{selectedRequest.admin.name}</Typography>
                </div>
              )}
            </div>

            {/* 상품 설명 */}
            {selectedRequest.product?.description && (
              <div>
                <Typography variant="body2" className="text-gray-500 mb-2">상품 설명</Typography>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <Typography variant="body2" className="text-gray-700 whitespace-pre-wrap">
                    {selectedRequest.product.description}
                  </Typography>
                </div>
              </div>
            )}

            {/* 거절 사유 입력 (대기 중일 때만) */}
            {selectedRequest.status === 'pending' && (
              <div className="pt-4 border-t space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    거절 사유 (거절 시 필수)
                  </label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="거절 사유를 입력하세요"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                    rows={3}
                  />
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={() => handleRespondRequest('reject')}
                    disabled={isRespondingRequest || !rejectionReason.trim()}
                    variant="outline"
                    className="flex-1 text-red-600 border-red-300"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    {isRespondingRequest ? '처리 중...' : '거절'}
                  </Button>
                  <Button
                    onClick={() => handleRespondRequest('accept')}
                    disabled={isRespondingRequest}
                    className="flex-1 bg-green-600 text-white"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {isRespondingRequest ? '처리 중...' : '수락'}
                  </Button>
                </div>
              </div>
            )}

            {/* 거절 사유 표시 */}
            {selectedRequest.status === 'rejected' && selectedRequest.rejection_reason && (
              <div className="p-3 bg-red-50 rounded-lg">
                <Typography variant="caption" className="text-red-700">
                  거절 사유: {selectedRequest.rejection_reason}
                </Typography>
              </div>
            )}
          </div>
        )}
      </SlideSheet>

      {/* 출고 요청 상세 Sheet */}
      <SlideSheet
        isOpen={isShipmentDetailOpen}
        onClose={() => {
          setIsShipmentDetailOpen(false);
          setSelectedShipment(null);
        }}
        title="출고 요청 상세"
      >
        {selectedShipment && (
          <div className="space-y-4">
            {/* 상품 정보 */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <Typography variant="body2" className="text-gray-500 mb-2">상품 정보</Typography>
              <Typography variant="body1" className="font-medium">
                {selectedShipment.product?.name}
              </Typography>
            </div>

            {/* 주문 정보 */}
            {selectedShipment.order && (
              <div className="space-y-3">
                <div className="flex justify-between">
                  <Typography variant="body2" className="text-gray-500">주문번호</Typography>
                  <Typography variant="body2">{selectedShipment.order.order_number}</Typography>
                </div>
                <div className="flex justify-between">
                  <Typography variant="body2" className="text-gray-500">주문금액</Typography>
                  <Typography variant="body2" className="font-semibold text-[#FE3A8F]">
                    {formatPrice(selectedShipment.order.total_amount)}
                  </Typography>
                </div>
                <div className="flex justify-between">
                  <Typography variant="body2" className="text-gray-500">수량</Typography>
                  <Typography variant="body2">{selectedShipment.order.quantity}개</Typography>
                </div>
              </div>
            )}

            {/* 출고 요청 상태 */}
            <div className="space-y-3 pt-4 border-t">
              <div className="flex justify-between">
                <Typography variant="body2" className="text-gray-500">상태</Typography>
                <span className={`px-2 py-1 rounded text-xs font-medium ${SHIPMENT_STATUS_COLOR[selectedShipment.status]}`}>
                  {SHIPMENT_STATUS_LABEL[selectedShipment.status]}
                </span>
              </div>
              <div className="flex justify-between">
                <Typography variant="body2" className="text-gray-500">요청일</Typography>
                <Typography variant="body2">{formatDate(selectedShipment.created_at)}</Typography>
              </div>
              {selectedShipment.processed_at && (
                <div className="flex justify-between">
                  <Typography variant="body2" className="text-gray-500">처리일</Typography>
                  <Typography variant="body2">{formatDate(selectedShipment.processed_at)}</Typography>
                </div>
              )}
            </div>

            {/* 배송 정보 */}
            {selectedShipment.courier && selectedShipment.tracking_number && (
              <div className="p-4 bg-blue-50 rounded-lg">
                <Typography variant="body2" className="text-blue-700 mb-2 font-medium">배송 정보</Typography>
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-blue-600" />
                  <span className="text-blue-700">{selectedShipment.courier}</span>
                  <span className="text-blue-400">•</span>
                  <span className="text-blue-700">{selectedShipment.tracking_number}</span>
                </div>
              </div>
            )}

            {/* 메모 */}
            {selectedShipment.notes && (
              <div>
                <Typography variant="body2" className="text-gray-500 mb-2">메모</Typography>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <Typography variant="body2" className="text-gray-700">
                    {selectedShipment.notes}
                  </Typography>
                </div>
              </div>
            )}

            {/* 거절 사유 */}
            {selectedShipment.rejection_reason && (
              <div className="p-3 bg-red-50 rounded-lg">
                <Typography variant="caption" className="text-red-700">
                  거절 사유: {selectedShipment.rejection_reason}
                </Typography>
              </div>
            )}
          </div>
        )}
      </SlideSheet>

      {/* 출고 요청 생성 Sheet */}
      <SlideSheet
        isOpen={isCreateShipmentOpen}
        onClose={() => {
          setIsCreateShipmentOpen(false);
          setSelectedPendingOrder(null);
          setShipmentNotes('');
        }}
        title="출고 요청"
        footer={
          <div className="flex gap-3 px-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsCreateShipmentOpen(false);
                setSelectedPendingOrder(null);
                setShipmentNotes('');
              }}
              className="flex-1"
              disabled={isCreatingShipment}
            >
              취소
            </Button>
            <Button
              onClick={handleCreateShipmentRequest}
              disabled={isCreatingShipment}
              className="flex-1 bg-[#FE3A8F] text-white"
            >
              {isCreatingShipment ? '요청 중...' : '출고 요청'}
            </Button>
          </div>
        }
      >
        {selectedPendingOrder && (
          <div className="space-y-4">
            {/* 주문 정보 */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex gap-3">
                {selectedPendingOrder.product?.thumbnail_url ? (
                  <img
                    src={selectedPendingOrder.product.thumbnail_url}
                    alt={selectedPendingOrder.product.name}
                    className="w-16 h-16 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-gray-200 flex items-center justify-center">
                    <ShoppingBag className="h-6 w-6 text-gray-400" />
                  </div>
                )}
                <div className="flex-1">
                  <Typography variant="body2" className="font-medium">
                    {selectedPendingOrder.product?.name}
                  </Typography>
                  <Typography variant="caption" className="text-gray-500">
                    주문번호: {selectedPendingOrder.order_number}
                  </Typography>
                  <div className="flex items-center gap-2 mt-1">
                    <Typography variant="body2" className="font-semibold text-[#FE3A8F]">
                      {formatPrice(selectedPendingOrder.total_amount)}
                    </Typography>
                    <span className="text-xs text-gray-400">•</span>
                    <Typography variant="caption" className="text-gray-500">
                      {selectedPendingOrder.quantity}개
                    </Typography>
                  </div>
                </div>
              </div>
            </div>

            {/* 배송지 정보 */}
            {selectedPendingOrder.recipient_name && (
              <div>
                <Typography variant="body2" className="font-medium mb-2 flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  배송지 정보
                </Typography>
                <div className="p-3 bg-gray-50 rounded-lg space-y-1 text-sm">
                  <div>{selectedPendingOrder.recipient_name} • {selectedPendingOrder.recipient_phone}</div>
                  <div className="text-gray-500">
                    [{selectedPendingOrder.recipient_postal_code}] {selectedPendingOrder.recipient_address}
                  </div>
                  {selectedPendingOrder.delivery_memo && (
                    <div className="text-gray-500">배송메모: {selectedPendingOrder.delivery_memo}</div>
                  )}
                </div>
              </div>
            )}

            {/* 메모 입력 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                요청 메모 (선택)
              </label>
              <textarea
                value={shipmentNotes}
                onChange={(e) => setShipmentNotes(e.target.value)}
                placeholder="관리자에게 전달할 메모를 입력하세요"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                rows={3}
              />
            </div>

            <div className="p-3 bg-blue-50 rounded-lg">
              <Typography variant="caption" className="text-blue-700">
                💡 출고 요청 후 관리자가 승인하면 택배가 발송됩니다.
              </Typography>
            </div>
          </div>
        )}
      </SlideSheet>
    </div>
  );
}
