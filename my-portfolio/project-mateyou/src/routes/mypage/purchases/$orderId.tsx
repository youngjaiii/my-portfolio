import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { Loader2, CreditCard, Download, Truck, AlertCircle, CheckCircle, RotateCcw, Eye, ChevronLeft, Package } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { storeOrdersApi } from '@/api/store/orders';
import type { StoreOrder, OrderItem, Shipment } from '@/api/store/orders';
import { storeSchedulesApi } from '@/api/store/schedules';
import { storeRefundsApi } from '@/api/store/refunds';
import { Button, Typography, SlideSheet, Textarea } from '@/components';
import { loadTossPayments } from '@tosspayments/tosspayments-sdk';
import { edgeApi } from '@/lib/edgeApi';

export const Route = createFileRoute('/mypage/purchases/$orderId')({
  component: PurchaseOrderDetailPage,
});

const clientKey = import.meta.env.DEV
  ? import.meta.env.VITE_TOSS_PAY_CLIENT_KEY || 'test_ck_0RnYX2w532zyw5deoGog3NeyqApQ'
  : import.meta.env.VITE_TOSS_PAY_CLIENT_KEY_REAL || 'live_ck_Ba5PzR0ArnBo5vbKoX6XrvmYnNeD';

function PurchaseOrderDetailPage() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const { user, isLoading: userLoading } = useAuth();
  
  const [order, setOrder] = useState<StoreOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [schedule, setSchedule] = useState<any>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isRefundSheetOpen, setIsRefundSheetOpen] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [isRequestingRefund, setIsRequestingRefund] = useState(false);
  const [existingRefund, setExistingRefund] = useState<any>(null);
  const [isTrackingSheetOpen, setIsTrackingSheetOpen] = useState(false);
  const [cancellingItemId, setCancellingItemId] = useState<string | null>(null);
  const [selectedRefundItem, setSelectedRefundItem] = useState<{ order_item_id: string; product_name: string; amount: number } | null>(null);

  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      navigate({ to: '/login' });
      return;
    }
  }, [user?.id, userLoading, navigate]);

  useEffect(() => {
    const fetchOrder = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await storeOrdersApi.getDetail(orderId);
        if (response.success && response.data) {
          const orderData = response.data as StoreOrder;
          setOrder(orderData);

          const orderProductType = orderData.product?.product_type || orderData.order_items?.[0]?.product_type;
          if (orderProductType === 'on_site') {
            if (orderData.schedule_id) {
              try {
                const scheduleResponse = await storeSchedulesApi.getDetail(orderData.schedule_id);
                if (scheduleResponse.success && scheduleResponse.data) {
                  setSchedule(scheduleResponse.data);
                }
              } catch (error) {
                console.error('스케줄 조회 실패:', error);
              }
            }
          }

          try {
            const refundsResponse = await storeRefundsApi.getList({ limit: 100 });
            if (refundsResponse.success && refundsResponse.data) {
              const refunds = Array.isArray(refundsResponse.data) ? refundsResponse.data : (refundsResponse.data as any).refunds || [];
              const orderRefund = refunds.find((r: any) => r.order_id === orderData.order_id);
              if (orderRefund) {
                setExistingRefund(orderRefund);
              }
            }
          } catch (error) {}
        } else {
          setError(response.error?.message || '주문을 불러오는데 실패했습니다.');
        }
      } catch (err: any) {
        setError(err.message || '주문을 불러오는데 실패했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    if (orderId) {
      fetchOrder();
    }
  }, [orderId]);

  const handlePayment = async () => {
    if (!order || !user) return;

    setIsProcessingPayment(true);
    try {
      const tossPayments = await loadTossPayments(clientKey);
      
      const successUrl = new URL(`${window.location.origin}/store/payment/success`);
      successUrl.searchParams.set('orderId', order.order_id);
      
      const failUrl = new URL(`${window.location.origin}/store/payment/fail`);
      failUrl.searchParams.set('orderId', order.order_id);
      
      await tossPayments.requestPayment('카드', {
        amount: order.total_amount,
        orderId: order.order_id,
        orderName: order.product?.name || order.order_items?.[0]?.product_name || '상품 주문',
        customerName: user.name || '고객',
        successUrl: successUrl.toString(),
        failUrl: failUrl.toString(),
      });
    } catch (err: any) {
      console.error('결제 요청 실패:', err);
      alert(err.message || '결제 요청에 실패했습니다.');
      setIsProcessingPayment(false);
    }
  };

  const handleCancelItem = async (orderItemId: string, productName: string) => {
    if (!order || !confirm(`"${productName}" 주문을 취소하시겠습니까?\n\n[확인] 주문 취소 및 환불 진행\n[취소] 창 닫기`)) return;

    setCancellingItemId(orderItemId);
    try {
      const response = await storeOrdersApi.cancelItem(order.order_id, orderItemId);
      if (response.success) {
        const refundedAmount = response.data?.cancelled_item?.refunded_amount || response.data?.refunded_points || 0;
        alert(`상품이 취소되었습니다.\n환불 금액: ${refundedAmount.toLocaleString()}P`);
        // 주문 정보 새로고침
        const updatedOrderResponse = await storeOrdersApi.getDetail(orderId);
        if (updatedOrderResponse.success && updatedOrderResponse.data) {
          setOrder(updatedOrderResponse.data as StoreOrder);
        }
      } else {
        alert(response.error?.message || '상품 취소에 실패했습니다.');
      }
    } catch (err: any) {
      console.error('상품 취소 실패:', err);
      alert(err.message || '상품 취소에 실패했습니다.');
    } finally {
      setCancellingItemId(null);
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return '결제 대기';
      case 'paid': return '결제 완료';
      case 'shipped': return '배송 중';
      case 'delivered': return '배송 완료';
      case 'confirmed': return '구매 확정';
      case 'cancelled': return '취소됨';
      case 'refund_requested': return '환불 요청';
      case 'refunded': return '환불 완료';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-700';
      case 'paid': return 'bg-blue-100 text-blue-700';
      case 'shipped': return 'bg-purple-100 text-purple-700';
      case 'delivered': return 'bg-green-100 text-green-700';
      case 'confirmed': return 'bg-gray-100 text-gray-700';
      case 'cancelled': return 'bg-red-100 text-red-700';
      case 'refund_requested': return 'bg-orange-100 text-orange-700';
      case 'refund': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getProductTypeLabel = (type: string) => {
    switch (type) {
      case 'digital': return '디지털';
      case 'on_site': return '현장수령';
      case 'delivery': return '택배';
      default: return type;
    }
  };

  const goBack = () => navigate({ to: '/mypage/purchases' });

  if (userLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#FE3A8F]" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-100">
          <div className="flex items-center h-14 px-4">
            <button onClick={goBack} className="p-2 -ml-2">
              <ChevronLeft className="h-6 w-6" />
            </button>
            <Typography variant="h6" className="flex-1 text-center font-semibold">
              주문 상세
            </Typography>
            <div className="w-10" />
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-4 pt-14">
          <div className="text-center">
            <Package className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <Typography variant="body1" className="text-gray-600 mb-4">
              {error || '주문을 찾을 수 없습니다.'}
            </Typography>
            <Button onClick={goBack} variant="outline">
              목록으로 돌아가기
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // order_items 기반으로 상품 타입 확인 (여러 상품 타입이 섞여있을 수 있음)
  const firstOrderItem = order.order_items?.[0];
  const product = order.product || firstOrderItem?.product;
  
  // 각 상품 타입 존재 여부 확인
  const hasDigitalItem = order.order_items?.some(item => 
    (item as any).product_type === 'digital' || item.product?.product_type === 'digital'
  ) || product?.product_type === 'digital';
  const hasDeliveryItem = order.order_items?.some(item => 
    (item as any).product_type === 'delivery' || item.product?.product_type === 'delivery'
  ) || product?.product_type === 'delivery';
  const hasOnSiteItem = order.order_items?.some(item => 
    (item as any).product_type === 'on_site' || item.product?.product_type === 'on_site'
  ) || product?.product_type === 'on_site';
  
  // 디지털 상품 중 confirmed 상태인 아이템이 있는지 확인
  const hasConfirmedDigitalItem = order.order_items?.some(item => 
    ((item as any).product_type === 'digital' || item.product?.product_type === 'digital') &&
    ((item as any).status === 'paid' || (item as any).status === 'confirmed')
  ) || (hasDigitalItem && (order.status === 'paid' || order.status === 'confirmed'));

  const canPay = order.status === 'pending';
  const canDownload = hasConfirmedDigitalItem;
  // 배송완료 상태에서만 구매 확정 가능 (결제완료 상태 제외)
  const canConfirm = order.status === 'delivered' && 
                    hasDeliveryItem && 
                    !order.is_confirmed;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* 헤더 */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-100">
        <div className="flex items-center h-14 px-4">
          <button onClick={goBack} className="p-2 -ml-2">
            <ChevronLeft className="h-6 w-6" />
          </button>
          <Typography variant="h6" className="flex-1 text-center font-semibold">
            주문 상세
          </Typography>
          <div className="w-10" />
        </div>
      </div>

      <div className="flex-1 pt-14 pb-24">
        {/* 주문 정보 */}
        <div className="bg-white px-4 py-6 space-y-4">
          <div className="flex items-center justify-between">
            <Typography variant="h6" className="font-bold">
              주문 정보
            </Typography>
            <span className={`px-3 py-1 rounded-lg text-sm font-medium ${getStatusColor(order.status)}`}>
              {getStatusLabel(order.status)}
            </span>
          </div>

          <div className="pt-4 border-t border-gray-200 space-y-3">
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">주문번호</span>
              <span className="font-medium text-sm">{order.order_number || order.order_id.slice(0, 8)}...</span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">주문일시</span>
              <span className="font-medium text-sm">
                {new Date(order.created_at).toLocaleString('ko-KR')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-sm text-gray-600">상품 금액</span>
              <span className="font-medium text-sm">
                {(order.subtotal_amount ?? (order.product?.price ?? firstOrderItem?.unit_price ?? 0) * order.quantity).toLocaleString()}P
              </span>
            </div>
            {(order.total_shipping_fee !== undefined && order.total_shipping_fee > 0) || hasDeliveryItem ? (
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">배송비</span>
                <span className="font-medium text-sm">
                  {(order.total_shipping_fee ?? order.shipping_fee ?? 0) === 0 
                    ? '무료' 
                    : `${(order.total_shipping_fee ?? order.shipping_fee ?? 0).toLocaleString()}P`}
                </span>
              </div>
            ) : null}
            <div className="flex justify-between pt-2 border-t border-gray-100">
              <span className="text-sm text-gray-600 font-medium">총 결제 금액</span>
              <span className="font-bold text-[#FE3A8F]">
                {order.total_amount.toLocaleString()}P
              </span>
            </div>
          </div>
        </div>

        {/* 상품 정보 - order_items 기반 */}
        <div className="bg-white mt-2 px-4 py-6">
          <Typography variant="h6" className="font-bold mb-4">
            주문 상품 {order.order_items && order.order_items.length > 1 && `(${order.order_items.length}건)`}
          </Typography>
          {order.order_items && order.order_items.length > 0 ? (
            <div className="space-y-4">
              {order.order_items.map((item) => {
                const itemProduct = item.product || product;
                const itemStatus = (item as any).status;
                const itemProductType = (item as any).product_type || itemProduct?.product_type;
                const isItemCancelled = itemStatus === 'cancelled';
                const isItemRefunded = itemStatus === 'refund' || itemStatus === 'refund_requested';
                // 개별 취소 가능 조건: 취소 안 됨, 디지털 아님, 주문 상태 paid
                const canCancelItem = !isItemCancelled && !isItemRefunded &&
                  itemProductType !== 'digital' &&
                  order.status === 'paid';
                // 개별 환불 가능 조건: 택배 상품, shipped/delivered 상태, 취소/환불 안 됨
                const canRefundItem = !isItemCancelled && !isItemRefunded &&
                  itemProductType === 'delivery' &&
                  (order.status === 'shipped' || order.status === 'delivered');
                const itemAmount = item.total_price || (item.subtotal ?? item.unit_price * item.quantity);
                return (
                  <div key={item.order_item_id} className={`flex gap-4 ${isItemCancelled || isItemRefunded ? 'opacity-50' : ''}`}>
                    {itemProduct?.thumbnail_url ? (
                      <img
                        src={itemProduct.thumbnail_url}
                        alt={itemProduct.name}
                        className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                        <Package className="h-8 w-8 text-gray-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Typography variant="body1" className="font-medium truncate flex-1">
                          {itemProduct?.name || (item as any).product_name || '상품명 없음'}
                        </Typography>
                        {isItemCancelled && (
                          <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded flex-shrink-0">
                            취소됨
                          </span>
                        )}
                        {isItemRefunded && (
                          <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded flex-shrink-0">
                            {itemStatus === 'refund_requested' ? '환불요청' : '환불완료'}
                          </span>
                        )}
                      </div>
                      <Typography variant="body2" className="text-gray-600">
                        {item.unit_price?.toLocaleString() || itemProduct?.price?.toLocaleString() || 0}P × {item.quantity}개
                      </Typography>
                      {/* 선택된 옵션 표시 */}
                      {item.selected_options && item.selected_options.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {item.selected_options.map((opt, idx) => (
                            <Typography key={idx} variant="caption" className="text-gray-500 block">
                              {opt.option_name}: {opt.value || opt.text_value}
                              {opt.price_adjustment > 0 && (
                                <span className="text-[#FE3A8F]"> (+{opt.price_adjustment.toLocaleString()}P)</span>
                              )}
                            </Typography>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-1">
                        <Typography variant="body2" className={`font-medium ${isItemCancelled || isItemRefunded ? 'line-through text-gray-400' : 'text-[#FE3A8F]'}`}>
                          {itemAmount.toLocaleString()}P
                        </Typography>
                        <div className="flex gap-1">
                          {canCancelItem && (
                            <button
                              onClick={() => handleCancelItem(item.order_item_id, itemProduct?.name || (item as any).product_name || '상품')}
                              disabled={cancellingItemId === item.order_item_id}
                              className="text-xs text-red-500 hover:text-red-600 disabled:opacity-50 border border-red-300 rounded-full px-2 py-0.5"
                            >
                              {cancellingItemId === item.order_item_id ? (
                                <span className="flex items-center gap-1">
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  취소 중...
                                </span>
                              ) : (
                                '주문 취소'
                              )}
                            </button>
                          )}
                          {canRefundItem && (
                            <button
                              onClick={() => {
                                setSelectedRefundItem({
                                  order_item_id: item.order_item_id,
                                  product_name: itemProduct?.name || (item as any).product_name || '상품',
                                  amount: itemAmount,
                                });
                                setRefundReason('');
                                setIsRefundSheetOpen(true);
                              }}
                              className="text-xs text-orange-500 hover:text-orange-600 border border-orange-300 rounded-full px-2 py-0.5"
                            >
                              환불 요청
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : product ? (
            <div className="flex gap-4">
              {product.thumbnail_url ? (
                <img
                  src={product.thumbnail_url}
                  alt={product.name}
                  className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-20 h-20 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Package className="h-8 w-8 text-gray-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <Typography variant="body1" className="font-medium mb-1 truncate">
                  {product.name}
                </Typography>
                {/* <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                    {getProductTypeLabel(product.product_type)}
                  </span>
                  {product.source === 'collaboration' && (
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                      협업
                    </span>
                  )}
                </div> */}
                <Typography variant="body2" className="text-gray-600">
                  {product.price?.toLocaleString()}P × {order.quantity}개
                </Typography>
              </div>
            </div>
          ) : null}
        </div>

        {/* 배송 정보 - shipments 테이블 기반 */}
        {hasDeliveryItem && (() => {
          const recipientInfo = order.recipient_name ? order : order.shipments?.[0];
          return (
          <div className="bg-white mt-2 px-4 py-6">
            <Typography variant="h6" className="font-bold mb-4">
              배송 정보
            </Typography>
            <div className="space-y-2 text-sm">
              {recipientInfo?.recipient_name && (
                <div>
                  <span className="text-gray-600">받는 분: </span>
                  <span className="font-medium">{recipientInfo.recipient_name}</span>
                </div>
              )}
              {recipientInfo?.recipient_phone && (
                <div>
                  <span className="text-gray-600">연락처: </span>
                  <span className="font-medium">{recipientInfo.recipient_phone}</span>
                </div>
              )}
              {recipientInfo?.recipient_address && (
                <div>
                  <span className="text-gray-600">주소: </span>
                  <span className="font-medium">
                    {recipientInfo.recipient_postal_code && `(${recipientInfo.recipient_postal_code}) `}
                    {recipientInfo.recipient_address}
                    {recipientInfo.recipient_address_detail && ` ${recipientInfo.recipient_address_detail}`}
                  </span>
                </div>
              )}
              
              {/* shipments 테이블 기반 배송 추적 */}
              {order.shipments && order.shipments.length > 0 ? (
                order.shipments.map((shipment, idx) => (
                  <div key={shipment.shipment_id} className={`pt-3 mt-3 border-t border-gray-100 ${idx > 0 ? 'mt-4' : ''}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Truck className="h-4 w-4 text-gray-400" />
                        <span className="text-gray-600 font-medium">
                          배송 {order.shipments!.length > 1 ? `#${idx + 1}` : '추적'}
                        </span>
                        {shipment.status === 'delivered' && (
                          <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">배송 완료</span>
                        )}
                        {shipment.status === 'shipped' && (
                          <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">배송 중</span>
                        )}
                      </div>
                      {shipment.tracking_number && (
                        <button
                          onClick={() => setIsTrackingSheetOpen(true)}
                          className="text-sm text-[#FE3A8F] font-medium hover:underline"
                        >
                          배송 추적
                        </button>
                      )}
                    </div>
                    {shipment.courier && (
                      <div>
                        <span className="text-gray-600">택배사: </span>
                        <span className="font-medium">{shipment.courier}</span>
                      </div>
                    )}
                    {shipment.tracking_number && (
                      <div>
                        <span className="text-gray-600">송장번호: </span>
                        <span className="font-medium">{shipment.tracking_number}</span>
                      </div>
                    )}
                    {shipment.delivery_memo && (
                      <div className="mt-2">
                        <span className="text-gray-600">배송메모: </span>
                        <span className="font-medium">{shipment.delivery_memo}</span>
                      </div>
                    )}
                    {shipment.shipment_items && shipment.shipment_items.length > 0 && (
                      <div className="mt-2 text-xs text-gray-500">
                        포함 상품: {shipment.shipment_items.map(si => 
                          si.order_item?.product?.name || '상품'
                        ).join(', ')}
                      </div>
                    )}
                  </div>
                ))
              ) : order.courier && order.tracking_number ? (
                <div className="pt-3 mt-3 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-gray-400" />
                      <span className="text-gray-600 font-medium">배송 추적</span>
                    </div>
                    <button
                      onClick={() => setIsTrackingSheetOpen(true)}
                      className="text-sm text-[#FE3A8F] font-medium hover:underline"
                    >
                      배송 추적
                    </button>
                  </div>
                  <div>
                    <span className="text-gray-600">택배사: </span>
                    <span className="font-medium">{order.courier}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">송장번호: </span>
                    <span className="font-medium">{order.tracking_number}</span>
                  </div>
                </div>
              ) : null}
              
              {(product?.source === 'collaboration' || firstOrderItem?.product_source === 'collaboration') && 
               order.status === 'paid' && 
               !order.courier && (!order.shipments || order.shipments.length === 0) && (
                <div className="pt-3 mt-3 border-t border-gray-100 text-gray-500">
                  출고요청 대기 중입니다. 관리자 승인 후 배송 정보가 업데이트됩니다.
                </div>
              )}
            </div>
          </div>
        );
        })()}

        {/* 환불 상태 표시 */}
        {existingRefund && (
          <div className="bg-white mt-2 px-4 py-6">
            <div className={`rounded-lg p-4 ${
              existingRefund.status === 'approved' || existingRefund.status === 'completed' ? 'bg-green-50' :
              existingRefund.status === 'rejected' ? 'bg-red-50' :
              'bg-blue-50'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RotateCcw className={`h-5 w-5 ${
                    existingRefund.status === 'approved' || existingRefund.status === 'completed' ? 'text-green-600' :
                    existingRefund.status === 'rejected' ? 'text-red-600' :
                    'text-blue-600'
                  }`} />
                  <Typography variant="body1" className={`font-medium ${
                    existingRefund.status === 'approved' || existingRefund.status === 'completed' ? 'text-green-800' :
                    existingRefund.status === 'rejected' ? 'text-red-800' :
                    'text-blue-800'
                  }`}>
                    환불 {existingRefund.status === 'pending' ? '대기 중' :
                          existingRefund.status === 'requested' ? '요청됨' :
                          existingRefund.status === 'approved' ? '승인됨' :
                          existingRefund.status === 'completed' ? '완료됨' :
                          existingRefund.status === 'rejected' ? '거절됨' : existingRefund.status}
                  </Typography>
                </div>
                <Button
                  onClick={() => navigate({
                    to: '/store/refunds/$refundId',
                    params: { refundId: existingRefund.refund_id },
                  })}
                  variant="outline"
                  size="sm"
                >
                  상세보기
                </Button>
              </div>
              {existingRefund.reason && (
                <Typography variant="body2" className="mt-2 text-gray-600">
                  사유: {existingRefund.reason}
                </Typography>
              )}
            </div>
          </div>
        )}

        {/* 디지털 상품 환불 불가 안내 */}
        {hasDigitalItem && order.status !== 'cancelled' && (
          <div className="bg-white mt-2 px-4 py-4">
            <div className="bg-yellow-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <Typography variant="body2" className="font-medium text-yellow-800">
                  환불 불가 안내
                </Typography>
              </div>
              <Typography variant="caption" className="text-yellow-700">
                디지털 상품은 결제 즉시 다운로드가 가능하여 환불이 불가능합니다.
              </Typography>
            </div>
          </div>
        )}
      </div>

      {/* 하단 버튼 영역 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 safe-area-bottom">
        <div className="max-w-2xl mx-auto space-y-2">
          {canPay && (
            <Button
              onClick={handlePayment}
              disabled={isProcessingPayment}
              className="w-full rounded-full bg-[#FE3A8F] text-white"
            >
              {isProcessingPayment ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  결제 처리 중...
                </>
              ) : (
                <>
                  <CreditCard className="h-4 w-4 mr-2" />
                  결제하기 ({order.total_amount.toLocaleString()}P)
                </>
              )}
            </Button>
          )}

          {canDownload && (
            <>
              <Button
                onClick={() => navigate({ to: `/store/orders/${order.order_id}/viewer` as any })}
                className="w-full rounded-full bg-[#FE3A8F] text-white"
              >
                <Eye className="h-4 w-4 mr-2" />
                바로 보기
              </Button>
              <Button
                onClick={() => navigate({
                  to: '/store/digital/orders/$orderId',
                  params: { orderId: order.order_id },
                })}
                variant="outline"
                className="w-full rounded-full"
              >
                <Download className="h-4 w-4 mr-2" />
                다운로드
              </Button>
            </>
          )}

          {/* 노쇼 신고 버튼 */}
          {hasOnSiteItem && 
           schedule?.status === 'reserved' && 
           schedule?.start_time && (
            <Button
              onClick={async () => {
                const startTime = new Date(schedule.start_time);
                const graceMinutes = 30;
                const graceTime = new Date(startTime.getTime() + graceMinutes * 60 * 1000);
                const now = new Date();

                if (now < graceTime) {
                  alert(`아직 노쇼 신고 가능 시간이 아닙니다. (${graceTime.toLocaleString('ko-KR')} 이후 가능)`);
                  return;
                }

                if (!confirm('노쇼로 신고하시겠습니까? 자동 환불이 처리됩니다.')) {
                  return;
                }

                try {
                  const response = await storeSchedulesApi.updateOrderStatus(order.order_id, {
                    status: 'no_show',
                  });

                  if (response.success) {
                    alert('노쇼 신고가 완료되었습니다. 자동 환불이 처리됩니다.');
                    const refreshResponse = await storeOrdersApi.getDetail(orderId);
                    if (refreshResponse.success && refreshResponse.data) {
                      setOrder(refreshResponse.data as StoreOrder);
                      if (refreshResponse.data.schedule_id) {
                        const scheduleResponse = await storeSchedulesApi.getDetail(refreshResponse.data.schedule_id);
                        if (scheduleResponse.success && scheduleResponse.data) {
                          setSchedule(scheduleResponse.data);
                        }
                      }
                    }
                  } else {
                    alert(response.error?.message || '노쇼 신고에 실패했습니다.');
                  }
                } catch (err: any) {
                  alert(err.message || '노쇼 신고에 실패했습니다.');
                }
              }}
              variant="outline"
              className="w-full rounded-full border-red-300 text-red-600"
            >
              <AlertCircle className="h-4 w-4 mr-2" />
              노쇼 신고
            </Button>
          )}

          {canConfirm && (
            <Button
              onClick={async () => {
                if (!confirm('구매를 확정하시겠습니까? 확정 후에는 취소가 불가능합니다.')) {
                  return;
                }

                setIsConfirming(true);
                try {
                  const response = await storeOrdersApi.confirm(order.order_id);
                  if (response.success) {
                    alert('구매 확정되었습니다.');
                    const refreshResponse = await storeOrdersApi.getDetail(order.order_id);
                    if (refreshResponse.success && refreshResponse.data) {
                      setOrder(refreshResponse.data as StoreOrder);
                    }
                  } else {
                    alert(response.error?.message || '구매 확정에 실패했습니다.');
                  }
                } catch (err: any) {
                  alert(err.message || '구매 확정에 실패했습니다.');
                } finally {
                  setIsConfirming(false);
                }
              }}
              disabled={isConfirming}
              className="w-full rounded-full bg-gray-600 text-white"
            >
              {isConfirming ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  처리 중...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                  구매 확정
                </>
              )}
            </Button>
          )}

          {!canPay && !canDownload && !canConfirm && (
            <Button
              onClick={goBack}
              variant="outline"
              className="w-full rounded-full"
            >
              목록으로 돌아가기
            </Button>
          )}
        </div>
      </div>

      {/* 환불 요청 시트 */}
      <SlideSheet
        isOpen={isRefundSheetOpen}
        onClose={() => {
          setIsRefundSheetOpen(false);
          setRefundReason('');
          setSelectedRefundItem(null);
        }}
        title="환불 요청"
        footer={
          <div className="flex gap-3 px-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsRefundSheetOpen(false);
                setRefundReason('');
                setSelectedRefundItem(null);
              }}
              className="flex-1"
              disabled={isRequestingRefund}
            >
              취소
            </Button>
            <Button
              onClick={async () => {
                if (!refundReason.trim()) {
                  alert('환불 사유를 입력해주세요.');
                  return;
                }
                if (!selectedRefundItem) {
                  alert('환불할 상품을 선택해주세요.');
                  return;
                }

                setIsRequestingRefund(true);
                try {
                  const response = await storeRefundsApi.create({
                    order_item_id: selectedRefundItem.order_item_id,
                    reason: refundReason.trim(),
                  });

                  if (response.success) {
                    alert('환불 요청이 접수되었습니다.');
                    setIsRefundSheetOpen(false);
                    setRefundReason('');
                    setSelectedRefundItem(null);
                    
                    // 채팅방이 있으면 환불 요청 알림 메시지 발송
                    const chatRoomId = (order as any).chat_room_id;
                    if (chatRoomId) {
                      try {
                        const refundAmount = (order.status === 'shipped' || order.status === 'delivered')
                          ? Math.max(0, selectedRefundItem.amount - 3000)
                          : selectedRefundItem.amount;
                        
                        await edgeApi.chat.sendMessage(
                          chatRoomId,
                          `📦 환불 요청이 접수되었습니다.\n상품: ${selectedRefundItem.product_name}\n주문번호: ${(order as any).order_number || order.order_id.slice(0, 8)}\n예상 환불 금액: ${refundAmount.toLocaleString()}P\n사유: ${refundReason.trim()}`,
                          'system'
                        );
                      } catch (chatError) {
                        console.error('채팅 메시지 발송 실패:', chatError);
                      }
                    }
                    
                    const refreshResponse = await storeOrdersApi.getDetail(order.order_id);
                    if (refreshResponse.success && refreshResponse.data) {
                      setOrder(refreshResponse.data as StoreOrder);
                    }

                    try {
                      const refundsResponse = await storeRefundsApi.getList({ limit: 100 });
                      if (refundsResponse.success && refundsResponse.data) {
                        const refunds = Array.isArray(refundsResponse.data) ? refundsResponse.data : (refundsResponse.data as any).refunds || [];
                        const orderRefund = refunds.find((r: any) => r.order_id === order.order_id);
                        if (orderRefund) {
                          setExistingRefund(orderRefund);
                        }
                      }
                    } catch (error) {}
                  } else {
                    alert(response.error?.message || '환불 요청에 실패했습니다.');
                  }
                } catch (err: any) {
                  alert(err.message || '환불 요청에 실패했습니다.');
                } finally {
                  setIsRequestingRefund(false);
                }
              }}
              disabled={isRequestingRefund || !refundReason.trim()}
              className="flex-1 bg-[#FE3A8F] text-white"
            >
              {isRequestingRefund ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  처리 중...
                </>
              ) : (
                '환불 요청'
              )}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {order && selectedRefundItem && (
            <>
              <div className="p-4 bg-gray-50 rounded-lg">
                <Typography variant="body2" className="text-gray-600 mb-2">
                  환불 상품 정보
                </Typography>
                <Typography variant="body1" className="font-medium mb-1">
                  {selectedRefundItem.product_name}
                </Typography>
                <Typography variant="body2" className="text-gray-500">
                  주문번호: {(order as any).order_number || order.order_id.slice(0, 8)}...
                </Typography>
                <Typography variant="body2" className="text-gray-500">
                  상품 금액: {selectedRefundItem.amount.toLocaleString()}P
                </Typography>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    환불 사유 *
                  </label>
                  <Textarea
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    placeholder="환불 사유를 입력해주세요"
                    rows={4}
                    className="w-full"
                  />
                </div>
              </div>

              {(order.status === 'shipped' || order.status === 'delivered') && (
                <div className="p-3 bg-blue-50 rounded-lg space-y-2">
                  <Typography variant="caption" className="text-blue-700">
                    💡 {order.status === 'shipped' ? '배송 중인' : '배송 완료된'} 상품은 반품 배송비(3,000P)가 발생합니다.
                  </Typography>
                  <div className="pt-2 border-t border-blue-200">
                    <div className="flex justify-between text-sm">
                      <span className="text-blue-600">상품 금액</span>
                      <span className="text-blue-700">{selectedRefundItem.amount.toLocaleString()}P</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-blue-600">반품 배송비</span>
                      <span className="text-red-500">-3,000P</span>
                    </div>
                    <div className="flex justify-between text-sm font-bold mt-1 pt-1 border-t border-blue-200">
                      <span className="text-blue-800">예상 환불 금액</span>
                      <span className="text-[#FE3A8F]">{Math.max(0, selectedRefundItem.amount - 3000).toLocaleString()}P</span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          {order && !selectedRefundItem && hasOnSiteItem && (
            <div className="p-3 bg-blue-50 rounded-lg">
              <Typography variant="caption" className="text-blue-700">
                💡 현장수령 상품은 미수령(no_show)인 경우에만 환불이 가능합니다.
              </Typography>
            </div>
          )}
        </div>
      </SlideSheet>

      {/* 배송 추적 슬라이드 팝업 - shipments 기반 */}
      <SlideSheet
        isOpen={isTrackingSheetOpen}
        onClose={() => setIsTrackingSheetOpen(false)}
        title="배송 추적"
      >
        <div className="p-4 space-y-4">
          {order?.shipments && order.shipments.length > 0 ? (
            order.shipments.map((shipment, shipIdx) => (
              <div key={shipment.shipment_id} className={shipIdx > 0 ? 'pt-4 border-t border-gray-200' : ''}>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  {order.shipments!.length > 1 && (
                    <Typography variant="body2" className="font-medium text-gray-700 mb-2">
                      배송 #{shipIdx + 1}
                    </Typography>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-600">택배사</span>
                    <span className="font-medium">{shipment.courier || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">송장번호</span>
                    <span className="font-medium">{shipment.tracking_number || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">상태</span>
                    <span className={`font-medium ${
                      shipment.status === 'delivered' ? 'text-green-600' : 
                      shipment.status === 'shipped' || shipment.status === 'in_transit' ? 'text-blue-600' : 'text-gray-600'
                    }`}>
                      {shipment.status === 'delivered' ? '배송 완료' :
                       shipment.status === 'shipped' ? '배송 시작' :
                       shipment.status === 'in_transit' ? '배송 중' : '준비 중'}
                    </span>
                  </div>
                </div>

                {shipment.delivery_events && shipment.delivery_events.length > 0 ? (
                  <div className="space-y-4 mt-4">
                    <Typography variant="body2" className="font-medium text-gray-700">배송 현황</Typography>
                    <div className="relative pl-6 space-y-4">
                      {shipment.delivery_events.map((event, idx) => (
                        <div key={idx} className="relative">
                          <div className={`absolute left-[-18px] w-3 h-3 rounded-full ${idx === 0 ? 'bg-[#FE3A8F]' : 'bg-gray-300'}`} />
                          {idx < shipment.delivery_events!.length - 1 && (
                            <div className="absolute left-[-13px] top-3 w-0.5 h-full bg-gray-200" />
                          )}
                          <div className="pb-2">
                            <Typography variant="caption" className="text-gray-400">
                              {new Date(event.time || event.datetime || '').toLocaleString('ko-KR', {
                                year: 'numeric',
                                month: 'numeric',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </Typography>
                            <Typography variant="body2" className={idx === 0 ? 'font-medium text-gray-900' : 'text-gray-600'}>
                              {event.description || event.status}
                            </Typography>
                            {event.location && (
                              <Typography variant="caption" className="text-gray-400">
                                {event.location}
                              </Typography>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : shipment.tracking_number ? (
                  <div className="text-center py-6 text-gray-500">
                    <Truck className="h-10 w-10 mx-auto mb-2 text-gray-300" />
                    <Typography variant="body2">배송 정보를 불러오는 중입니다.</Typography>
                  </div>
                ) : null}
              </div>
            ))
          ) : order?.courier && order?.tracking_number ? (
            <>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">택배사</span>
                  <span className="font-medium">{order.courier}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">송장번호</span>
                  <span className="font-medium">{order.tracking_number}</span>
                </div>
              </div>

              {(order as any).delivery_events && (order as any).delivery_events.length > 0 ? (
                <div className="space-y-4">
                  <Typography variant="body2" className="font-medium text-gray-700">배송 현황</Typography>
                  <div className="relative pl-6 space-y-4">
                    {(order as any).delivery_events.map((event: any, idx: number) => (
                      <div key={idx} className="relative">
                        <div className={`absolute left-[-18px] w-3 h-3 rounded-full ${idx === 0 ? 'bg-[#FE3A8F]' : 'bg-gray-300'}`} />
                        {idx < (order as any).delivery_events.length - 1 && (
                          <div className="absolute left-[-13px] top-3 w-0.5 h-full bg-gray-200" />
                        )}
                        <div className="pb-2">
                          <Typography variant="caption" className="text-gray-400">
                            {new Date(event.time || event.datetime).toLocaleString('ko-KR', {
                              year: 'numeric',
                              month: 'numeric',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </Typography>
                          <Typography variant="body2" className={idx === 0 ? 'font-medium text-gray-900' : 'text-gray-600'}>
                            {event.description || event.status}
                          </Typography>
                          {event.location && (
                            <Typography variant="caption" className="text-gray-400">
                              {event.location}
                            </Typography>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Truck className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <Typography variant="body2">배송 정보를 불러오는 중입니다.</Typography>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Truck className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <Typography variant="body2">배송 정보가 없습니다.</Typography>
            </div>
          )}
        </div>
      </SlideSheet>
    </div>
  );
}
