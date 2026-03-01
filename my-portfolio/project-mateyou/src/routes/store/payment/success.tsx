import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect, useRef } from 'react';
import { CheckCircle, XCircle, Loader2, ArrowRight, MessageCircle, Clock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { storePaymentsApi } from '@/api/store/payments';
import { storeOrdersApi } from '@/api/store/orders';
import { storeSchedulesApi } from '@/api/store/schedules';
import { Button, Typography } from '@/components';
import { sendPurchaseRequestMessage } from '@/utils/storeChatMessages';

export const Route = createFileRoute('/store/payment/success')({
  component: StorePaymentSuccessPage,
});

function StorePaymentSuccessPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isProcessing, setIsProcessing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [order, setOrder] = useState<any>(null);
  const [schedule, setSchedule] = useState<any>(null);
  const isProcessingRef = useRef(false);

  useEffect(() => {
    if (isProcessingRef.current) {
      return;
    }

    const processPayment = async () => {
      isProcessingRef.current = true;
      setIsProcessing(true);
      setError(null);

      try {
        const urlParams = new URLSearchParams(window.location.search);
        const paymentKey = urlParams.get('paymentKey');
        const orderIdParam = urlParams.get('orderId');
        const amount = urlParams.get('amount');

        if (!paymentKey || !orderIdParam || !amount) {
          throw new Error('결제 정보가 부족합니다.');
        }

        const amountNumber = Number(amount);
        if (Number.isNaN(amountNumber) || amountNumber <= 0) {
          throw new Error('결제 금액을 확인할 수 없습니다.');
        }

        setOrderId(orderIdParam);

        // Store 결제 confirm API 호출
        const response = await storePaymentsApi.confirm({
          order_id: orderIdParam,
          payment_key: paymentKey,
          amount: amountNumber,
        });

        if (!response.success) {
          throw new Error(response.error?.message || '결제 확인에 실패했습니다.');
        }

        // 주문 정보 조회
        const orderResponse = await storeOrdersApi.getDetail(orderIdParam);
        if (orderResponse.success && orderResponse.data) {
          const orderData = orderResponse.data as any;
          setOrder(orderData);

          // 현장수령 상품인 경우 스케줄 정보 조회
          if (orderData.product?.product_type === 'on_site' && orderData.schedule_id) {
            try {
              const scheduleResponse = await storeSchedulesApi.getDetail(orderData.schedule_id);
              if (scheduleResponse.success && scheduleResponse.data) {
                setSchedule(scheduleResponse.data);
              }
            } catch (error) {
              console.error('스케줄 조회 실패:', error);
            }
          }

          // 개인 택배 상품인 경우 구매요청 메시지 자동 발송
          if (
            orderData.product?.product_type === 'delivery' &&
            orderData.product?.source === 'partner' &&
            user
          ) {
            try {
              await sendPurchaseRequestMessage(orderIdParam, orderData, user.id);
            } catch (error) {
              console.error('구매요청 메시지 발송 실패:', error);
              // 메시지 발송 실패해도 결제는 성공한 것으로 처리
            }
          }
        }

        // URL에 processed 플래그 추가 (중복 처리 방지)
        const currentUrl = new URL(window.location.href);
        currentUrl.searchParams.set('processed', 'true');
        window.history.replaceState({}, '', currentUrl.toString());
      } catch (err: any) {
        console.error('결제 처리 오류:', err);
        setError(err.message || '결제 처리 중 오류가 발생했습니다.');
      } finally {
        setIsProcessing(false);
        isProcessingRef.current = false;
      }
    };

    // 이미 처리된 결제인지 확인
    const urlParams = new URLSearchParams(window.location.search);
    const processed = urlParams.get('processed') === 'true';

    if (processed) {
      setIsProcessing(false);
      const orderIdParam = urlParams.get('orderId');
      if (orderIdParam) {
        setOrderId(orderIdParam);
        storeOrdersApi.getDetail(orderIdParam).then((response) => {
          if (response.success && response.data) {
            setOrder(response.data);
          }
        });
      }
      return;
    }

    processPayment();
  }, []);

  const getNextActionLabel = () => {
    if (!order?.product) return null;

    switch (order.product.product_type) {
      case 'digital':
        return '다운로드하기';
      case 'on_site':
        return '채팅으로 일정 확정하기';
      case 'delivery':
        return '배송 정보 확인하기';
      default:
        return null;
    }
  };

  const handleNextAction = () => {
    if (!orderId) return;

    if (order?.product?.product_type === 'digital') {
      if (orderId) {
        navigate({
          to: '/store/digital/orders/$orderId',
          params: { orderId },
        });
      } else {
        navigate({ to: '/store/digital/downloads' });
      }
    } else if (order?.product?.product_type === 'on_site') {
      const partnerId = order.product.partner?.id || order.product.partner_id;
      if (partnerId) {
        navigate({
          to: '/chat',
          search: { partnerId },
        });
      }
    } else {
      navigate({
        to: '/store/orders/$orderId',
        params: { orderId },
      });
    }
  };

  if (isProcessing) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-[#FE3A8F] mx-auto mb-4" />
          <Typography variant="h5" className="text-gray-700 mb-2">
            결제 확인 중...
          </Typography>
          <Typography variant="body2" className="text-gray-500">
            잠시만 기다려주세요
          </Typography>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
          <Typography variant="h5" className="text-gray-700 mb-2">
            결제 확인 실패
          </Typography>
          <Typography variant="body1" className="text-gray-600 mb-6">
            {error}
          </Typography>
          <div className="space-y-2">
            <Button
              onClick={() => {
                if (orderId) {
                  navigate({
                    to: '/store/orders/$orderId',
                    params: { orderId },
                  });
                } else {
                  navigate({ to: '/store/orders' });
                }
              }}
              className="w-full bg-[#FE3A8F] text-white"
            >
              주문 상세로 이동
            </Button>
            <Button
              onClick={() => navigate({ to: '/store/orders' })}
              variant="outline"
              className="w-full"
            >
              주문 목록으로
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
        <Typography variant="h4" className="font-bold text-gray-900 mb-2">
          결제가 완료되었습니다
        </Typography>
        {order && (
          <>
            <Typography variant="body1" className="text-gray-600 mb-2">
              주문번호: {order.order_id}
            </Typography>
            <Typography variant="body1" className="text-gray-600 mb-6">
              결제 금액: {order.total_amount.toLocaleString()}P
            </Typography>

            {order.product && (
              <div className="bg-white rounded-lg p-4 mb-6 text-left">
                <Typography variant="body2" className="font-medium mb-2">
                  {order.product.name}
                </Typography>
                <Typography variant="caption" className="text-gray-500">
                  {order.product.product_type === 'digital' && '결제 후 즉시 다운로드할 수 있습니다.'}
                  {order.product.product_type === 'on_site' && '채팅으로 수령 일정을 확정해주세요.'}
                  {order.product.product_type === 'delivery' && order.product.source === 'partner' && '파트너에게 구매요청 메시지가 전송되었습니다. 채팅에서 배송 진행 상황을 확인하실 수 있습니다.'}
                  {order.product.product_type === 'delivery' && order.product.source === 'collaboration' && '배송 정보를 확인해주세요.'}
                </Typography>

                {/* 현장수령 진행상태 */}
                {order.product.product_type === 'on_site' && schedule && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="h-4 w-4 text-gray-400" />
                      <Typography variant="body2" className="font-medium text-gray-700">
                        현장수령 진행상태
                      </Typography>
                    </div>
                    <div className="text-sm text-gray-600 space-y-1">
                      <div>
                        상태: <span className="font-medium">
                          {schedule.status === 'pending' ? '대기 중' :
                           schedule.status === 'reserved' ? '예약 확정' :
                           schedule.status === 'completed' ? '수령 완료' :
                           schedule.status === 'no_show' ? '노쇼' :
                           schedule.status === 'canceled' ? '취소됨' : schedule.status}
                        </span>
                      </div>
                      {schedule.start_time && (
                        <div>
                          일시: <span className="font-medium">
                            {new Date(schedule.start_time).toLocaleString('ko-KR')}
                          </span>
                        </div>
                      )}
                      {schedule.location && (
                        <div>
                          장소: <span className="font-medium">{schedule.location}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {getNextActionLabel() && (
              <Button
                onClick={handleNextAction}
                className="w-full bg-[#FE3A8F] text-white mb-2"
              >
                {getNextActionLabel()}
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </>
        )}
        <Button
          onClick={() => navigate({ to: '/store/orders' })}
          variant="outline"
          className="w-full"
        >
          주문 목록으로
        </Button>
      </div>
    </div>
  );
}
