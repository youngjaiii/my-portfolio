import { createFileRoute, useNavigate, Outlet, useMatches, useLocation } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { Loader2, CreditCard, Download, Truck, AlertCircle, CheckCircle, XCircle, RotateCcw, Eye } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { storeOrdersApi } from '@/api/store/orders';
import type { StoreOrder } from '@/api/store/orders';
import { storeSchedulesApi } from '@/api/store/schedules';
import { storeRefundsApi } from '@/api/store/refunds';
import { Button, Typography, SlideSheet, Textarea } from '@/components';
import { loadTossPayments } from '@tosspayments/tosspayments-sdk';

export const Route = createFileRoute('/store/orders/$orderId')({
  component: OrderDetailPage,
});

const clientKey = import.meta.env.DEV
  ? import.meta.env.VITE_TOSS_PAY_CLIENT_KEY || 'test_ck_0RnYX2w532zyw5deoGog3NeyqApQ'
  : import.meta.env.VITE_TOSS_PAY_CLIENT_KEY_REAL || 'live_ck_Ba5PzR0ArnBo5vbKoX6XrvmYnNeD';

function OrderDetailPage() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const { user, isLoading: userLoading } = useAuth();
  const matches = useMatches();
  const location = useLocation();
  
  const [order, setOrder] = useState<StoreOrder | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [schedule, setSchedule] = useState<any>(null);
  const [pickup, setPickup] = useState<any>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isRefundSheetOpen, setIsRefundSheetOpen] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [isRequestingRefund, setIsRequestingRefund] = useState(false);
  const [existingRefund, setExistingRefund] = useState<any>(null);

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

          // 현장수령 상품인 경우 스케줄 및 픽업 정보 조회
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

            // 픽업 정보 조회 (order 상세에 포함되어 있을 수도 있음)
            if (orderData.schedule) {
              setPickup(orderData.schedule);
            }
          }

          // 기존 환불 요청 조회 (API가 없을 수 있으므로 에러 무시)
          try {
            const refundsResponse = await storeRefundsApi.getList({ limit: 100 });
            if (refundsResponse.success && refundsResponse.data) {
              const refunds = Array.isArray(refundsResponse.data) ? refundsResponse.data : (refundsResponse.data as any).refunds || [];
              const orderRefund = refunds.find((r: any) => r.order_id === orderData.order_id);
              if (orderRefund) {
                setExistingRefund(orderRefund);
              }
            }
          } catch (error) {
            // 환불 API가 구현되지 않았거나 CORS 오류가 발생할 수 있으므로 조용히 무시
            // console.error('환불 요청 조회 실패:', error);
          }
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

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return '결제 대기';
      case 'paid': return '결제 완료';
      case 'shipped': return '배송 중';
      case 'delivered': return '배송 완료';
      case 'confirmed': return '구매 확정';
      case 'cancelled': return '취소됨';
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

  // 중첩 라우트 확인 (모든 hooks 선언 후)
  const lastMatch = matches[matches.length - 1];
  const isNestedRouteActive = lastMatch?.routeId && lastMatch.routeId !== Route.id;
  
  // 중첩 라우트가 활성화된 경우 Outlet 렌더링
  if (isNestedRouteActive || location.pathname.includes('/viewer')) {
    return <Outlet />;
  }

  if (userLoading || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#FE3A8F]" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <Typography variant="h5" className="text-gray-600 mb-2">
            {error || '주문을 찾을 수 없습니다.'}
          </Typography>
          <Button
            onClick={() => navigate({ to: '/store/orders' })}
            variant="outline"
            className="mt-4"
          >
            주문 목록으로
          </Button>
        </div>
      </div>
    );
  }

  // order_items가 있으면 첫 번째 아이템 사용, 없으면 기존 product 사용
  const firstOrderItem = order.order_items?.[0];
  const product = order.product || firstOrderItem?.product;
  const productType = product?.product_type || firstOrderItem?.product_type;
  const productSource = product?.source || firstOrderItem?.product_source;
  const itemStatus = firstOrderItem?.status || order.status;
  const isItemConfirmed = firstOrderItem?.is_confirmed || order.is_confirmed;
  
  // 환불 요청 가능 여부: 결제 완료 상태이고, 취소되지 않았으며, 이미 환불 요청이 없고, 디지털 상품이 아닌 경우
  const canRequestRefund = order.status === 'paid' && 
                          order.status !== 'cancelled' && 
                          !existingRefund && 
                          productType !== 'digital';
  const canPay = order.status === 'pending';
  const canDownload = (itemStatus === 'paid' || itemStatus === 'confirmed') && productType === 'digital';
  const canChat = order.status === 'paid' && (productType === 'on_site' || (productType === 'delivery' && productSource === 'partner'));
  const canConfirm = order.status === 'delivered' && productType === 'delivery' && !isItemConfirmed;
  const canCancel = order.status === 'pending';

  // 결제 완료 직후인지 확인 (디지털 상품은 바로보기/다운로드가 필요하므로 제외)
  const isJustPaid = order.status === 'paid' && productType !== 'digital';

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 pt-16 pb-20">

      {/* 결제 완료 메시지 */}
      {isJustPaid && (
        <div className="bg-white px-4 pb-4">
          <Typography variant="h3" className="font-bold text-center text-[#FE3A8F]">
            결제가 완료되었습니다.
          </Typography>
        </div>
      )}

      {/* 주문 정보 */}
      <div className="bg-white px-4 pt-6 pb-18 space-y-4">
        {/* 주문 상태 */}
        <div className="flex items-center justify-between">
          <Typography variant="h5" className="font-bold">
            주문 정보
          </Typography>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-lg text-sm font-medium ${getStatusColor(order.status)}`}>
              {getStatusLabel(order.status)}
            </span>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-200 space-y-3">
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">주문번호</span>
            <span className="font-medium">{(order as any).order_number || order.order_id}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">주문일시</span>
            <span className="font-medium">
              {new Date(order.created_at).toLocaleString('ko-KR')}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-600">주문 금액</span>
            <span className="font-bold text-[#FE3A8F] text-lg">
              {order.total_amount.toLocaleString()}P
            </span>
          </div>
        </div>
      </div>

      {/* 상품 정보 */}
      {(product || firstOrderItem) && (
        <div className="flex-1 bg-white mt-2 px-4 py-6">
          <Typography variant="h6" className="font-bold mb-4">
            상품 정보
          </Typography>
          <div className="flex gap-4">
            {(product?.thumbnail_url || firstOrderItem?.product?.thumbnail_url) ? (
              <img
                src={product?.thumbnail_url || firstOrderItem?.product?.thumbnail_url}
                alt={product?.name || firstOrderItem?.product_name || '상품'}
                className="w-20 h-20 rounded-lg object-cover"
              />
            ) : (
              <div className="w-20 h-20 rounded-lg bg-gray-100 flex items-center justify-center">
                <span className="text-2xl">🛍️</span>
              </div>
            )}
            <div className="flex-1">
              <Typography variant="body1" className="font-medium mb-1">
                {product?.name || firstOrderItem?.product_name || '상품'}
              </Typography>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                  {getProductTypeLabel(productType || '')}
                </span>
                {productSource === 'collaboration' && (
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                    협업
                  </span>
                )}
              </div>
              <Typography variant="body2" className="text-gray-600">
                {(product?.price || firstOrderItem?.unit_price || 0).toLocaleString()}P × {order.quantity}개
              </Typography>
              {/* 선택된 옵션 표시 */}
              {firstOrderItem?.selected_options && (firstOrderItem.selected_options as any[]).length > 0 && (
                <div className="mt-2 space-y-1">
                  {(firstOrderItem.selected_options as any[]).map((opt: any, idx: number) => (
                    <Typography key={idx} variant="caption" className="text-gray-500 block">
                      {opt.option_name}: {opt.value || opt.text_value}
                      {opt.price_adjustment > 0 && (
                        <span className="text-[#FE3A8F]"> (+{opt.price_adjustment.toLocaleString()}P)</span>
                      )}
                    </Typography>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 예약 정보 (현장수령 상품인 경우) */}
      {productType === 'on_site' && ((order as any).reserved_start_time || schedule) && (
        <div className="bg-white mt-2 px-4 py-6">
          <Typography variant="h6" className="font-bold mb-4">
            예약 정보
          </Typography>
          <div className="space-y-2 bg-pink-50 rounded-xl p-4">
            {((order as any).reserved_start_time || schedule?.start_time) && (
              <div>
                <span className="text-gray-600">예약 일시: </span>
                <span className="font-medium">
                  {(() => {
                    const startTime = new Date((order as any).reserved_start_time || schedule?.start_time);
                    const hours = startTime.getHours();
                    const period = hours < 12 ? '오전' : '오후';
                    const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
                    return `${startTime.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })} ${period} ${displayHours}:${startTime.getMinutes().toString().padStart(2, '0')}`;
                  })()}
                </span>
              </div>
            )}
            {((order as any).reserved_location || schedule?.location) && (
              <div>
                <span className="text-gray-600">장소: </span>
                <span className="font-medium">{(order as any).reserved_location || schedule?.location}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 배송 정보 (택배 상품인 경우) */}
      {productType === 'delivery' && (
        <div className="bg-white mt-2 px-4 py-6">
          <Typography variant="h6" className="font-bold mb-4">
            배송 정보
          </Typography>
          <div className="space-y-2">
            {order.recipient_name && (
              <div>
                <span className="text-gray-600">받는 분: </span>
                <span className="font-medium">{order.recipient_name}</span>
              </div>
            )}
            {order.recipient_phone && (
              <div>
                <span className="text-gray-600">연락처: </span>
                <span className="font-medium">{order.recipient_phone}</span>
              </div>
            )}
            {order.recipient_address && (
              <div>
                <span className="text-gray-600">주소: </span>
                <span className="font-medium">{order.recipient_address}</span>
              </div>
            )}
            {order.courier && order.tracking_number && (
              <div className="pt-2 border-t border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <Truck className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-600 font-medium">배송 정보</span>
                  {productSource === 'collaboration' && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                      협업 상품
                    </span>
                  )}
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
            )}
            {productSource === 'collaboration' && order.status === 'paid' && !order.courier && (
              <div className="pt-2 border-t border-gray-200">
                <div className="text-sm text-gray-500">
                  출고요청 대기 중입니다. 관리자 승인 후 배송 정보가 업데이트됩니다.
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 행동 버튼 영역 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white p-4 safe-area-bottom">
        <div className="max-w-2xl mx-auto space-y-2">
          {/* 결제 완료 직후에는 돌아가기 버튼만 표시 */}
          {isJustPaid ? (
            <Button
              onClick={() => navigate({ to: '/mypage/purchases' })}
              className="w-full rounded-full bg-[#FE3A8F] text-white text-md font-medium whitespace-nowrap"
            >
              돌아가기
            </Button>
          ) : (
            <>
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
                onClick={() => {
                  navigate({
                    to: `/store/orders/${order.order_id}/viewer` as any,
                  });
                }}
                className="w-full rounded-full bg-[#FE3A8F] text-white"
              >
                <Eye className="h-4 w-4 mr-2" />
                바로 보기
              </Button>
              <Button
                onClick={() => {
                  navigate({
                    to: '/store/digital/orders/$orderId',
                    params: { orderId: order.order_id },
                  });
                }}
                variant="outline"
                className="w-full rounded-full"
              >
                <Download className="h-4 w-4 mr-2" />
                다운로드
              </Button>
            </>
          )}
{/* 
          {canChat && (
            <Button
              onClick={() => {
                // 채팅으로 이동 (파트너와의 채팅방)
                const partnerId = product.partner?.id || product.partner_id;
                if (partnerId) {
                  navigate({
                    to: '/chat',
                    search: { partnerId },
                  });
                }
              }}
              className="w-full rounded-full bg-blue-600 text-white"
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              {product?.product_type === 'on_site' ? '채팅으로 일정 확정하기' : '채팅으로 문의하기'}
            </Button>
          )} */}

          {/* no_show 버튼 (현장수령, reserved 상태, 조건 충족 시) */}
          {productType === 'on_site' && 
           schedule?.status === 'reserved' && 
           schedule?.start_time && (
            <Button
              onClick={async () => {
                // start_at + grace 시간 확인 (UI에서 안내, 최종 판정은 서버)
                const startTime = new Date(schedule.start_time);
                const graceMinutes = 30; // PRD 기준 grace 시간 (예: 30분)
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
                    // 주문 정보 새로고침
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

          {/* 구매 확정 버튼 (delivery, delivered 상태) */}
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
                    // 주문 정보 새로고침
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

          {/* 취소 버튼 (pending 상태) */}
          {canCancel && (
            <Button
              onClick={async () => {
                if (!confirm('주문을 취소하시겠습니까?')) {
                  return;
                }

                setIsCancelling(true);
                try {
                  const response = await storeOrdersApi.cancel(order.order_id);
                  if (response.success) {
                    alert('주문이 취소되었습니다.');
                    // 주문 정보 새로고침
                    const refreshResponse = await storeOrdersApi.getDetail(order.order_id);
                    if (refreshResponse.success && refreshResponse.data) {
                      setOrder(refreshResponse.data as StoreOrder);
                    }
                  } else {
                    alert(response.error?.message || '주문 취소에 실패했습니다.');
                  }
                } catch (err: any) {
                  alert(err.message || '주문 취소에 실패했습니다.');
                } finally {
                  setIsCancelling(false);
                }
              }}
              disabled={isCancelling}
              variant="outline"
              className="w-full rounded-full border-red-300 text-red-600"
            >
              {isCancelling ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  처리 중...
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 mr-2" />
                  주문 취소
                </>
              )}
            </Button>
          )}

          {/* 환불 요청 버튼 */}
          {canRequestRefund && (
            <Button
              onClick={() => {
                setRefundReason('');
                setIsRefundSheetOpen(true);
              }}
              variant="outline"
              className="w-full rounded-full border-orange-300 text-orange-600"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              환불 요청
            </Button>
          )}

          {/* 디지털 상품 환불 불가 안내 */}
          {productType === 'digital' && order.status !== 'cancelled' && (
            <div className="bg-yellow-50 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-yellow-600" />
                <Typography variant="body2" className="font-medium text-yellow-800">
                  환불 불가 안내
                </Typography>
              </div>
              <Typography variant="body2" className="text-yellow-700">
                디지털 상품은 결제 즉시 다운로드가 가능하여 환불이 불가능합니다.
              </Typography>
            </div>
          )}

          {/* 기존 환불 요청 상태 표시 */}
          {existingRefund && (
            <div className={`rounded-lg p-4 space-y-2 ${
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
                    환불 요청 {existingRefund.status === 'pending' ? '대기 중' :
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
                <Typography variant="body2" className={`${
                  existingRefund.status === 'approved' || existingRefund.status === 'completed' ? 'text-green-700' :
                  existingRefund.status === 'rejected' ? 'text-red-700' :
                  'text-blue-700'
                }`}>
                  사유: {existingRefund.reason}
                </Typography>
              )}
            </div>
          )}
            </>
          )}
        </div>
      </div>

      {/* 환불 요청 시트 */}
      <SlideSheet
        isOpen={isRefundSheetOpen}
        onClose={() => {
          setIsRefundSheetOpen(false);
          setRefundReason('');
        }}
        title="환불 요청"
        footer={
          <div className="flex gap-3 px-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsRefundSheetOpen(false);
                setRefundReason('');
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

                setIsRequestingRefund(true);
                try {
                  const response = await storeRefundsApi.create({
                    order_id: order.order_id,
                    reason: refundReason.trim(),
                  });

                  if (response.success) {
                    alert('환불 요청이 접수되었습니다.');
                    setIsRefundSheetOpen(false);
                    setRefundReason('');
                    
                    // 주문 정보 새로고침
                    const refreshResponse = await storeOrdersApi.getDetail(order.order_id);
                    if (refreshResponse.success && refreshResponse.data) {
                      setOrder(refreshResponse.data as StoreOrder);
                    }

                    // 환불 요청 목록 새로고침 (API가 없을 수 있으므로 에러 무시)
                    try {
                      const refundsResponse = await storeRefundsApi.getList({ limit: 100 });
                      if (refundsResponse.success && refundsResponse.data) {
                        const refunds = Array.isArray(refundsResponse.data) ? refundsResponse.data : (refundsResponse.data as any).refunds || [];
                        const orderRefund = refunds.find((r: any) => r.order_id === order.order_id);
                        if (orderRefund) {
                          setExistingRefund(orderRefund);
                        }
                      }
                    } catch (error) {
                      // 환불 API가 구현되지 않았거나 CORS 오류가 발생할 수 있으므로 조용히 무시
                    }
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
              className="flex-1 bg-orange-600 text-white"
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
          {order && (
            <>
              <div className="p-4 bg-gray-50 rounded-lg">
                <Typography variant="body2" className="text-gray-600 mb-2">
                  주문 정보
                </Typography>
                <Typography variant="body1" className="font-medium mb-1">
                  {order.product?.name || order.order_items?.[0]?.product_name || '상품'}
                </Typography>
                <Typography variant="body2" className="text-gray-500">
                  <span className="whitespace-nowrap">주문번호:</span> {(order as any).order_number || order.order_id}
                </Typography>
                <Typography variant="body2" className="text-gray-500">
                  <span className="whitespace-nowrap">주문 금액:</span> {order.total_amount.toLocaleString()}P
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

              {productType === 'delivery' && order.status === 'shipped' && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <Typography variant="caption" className="text-blue-700">
                    💡 배송 중인 상품은 반품 배송비(3,000P)가 발생할 수 있습니다.
                  </Typography>
                </div>
              )}

              {productType === 'on_site' && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <Typography variant="caption" className="text-blue-700">
                    💡 현장수령 상품은 미수령(no_show)인 경우에만 환불이 가능합니다.
                  </Typography>
                </div>
              )}
            </>
          )}
        </div>
      </SlideSheet>
    </div>
  );
}
