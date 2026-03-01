import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { Loader2, Package, Truck, Edit, Send, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { storeOrdersApi } from '@/api/store/orders';
import type { StoreOrder } from '@/api/store/orders';
import { storeCollaborationApi } from '@/api/store/collaboration';
import { storeSchedulesApi } from '@/api/store/schedules';
import { getCurrentAttendanceStatus } from '@/lib/timesheetApi';
import { Typography, Button, SlideSheet, Input } from '@/components';
import { sendShippingInfoMessage } from '@/utils/storeChatMessages';

export const Route = createFileRoute('/store/partner/orders')({
  component: PartnerOrdersPage,
});

function PartnerOrdersPage() {
  const navigate = useNavigate();
  const { user, isLoading: userLoading } = useAuth();
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('paid');
  const [selectedOrder, setSelectedOrder] = useState<StoreOrder | null>(null);
  const [isShippingSheetOpen, setIsShippingSheetOpen] = useState(false);
  const [courier, setCourier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [shipmentRequests, setShipmentRequests] = useState<Record<string, any>>({});
  const [isCreatingShipmentRequest, setIsCreatingShipmentRequest] = useState(false);
  const [schedules, setSchedules] = useState<Record<string, any>>({});
  const [isScheduleConfirmSheetOpen, setIsScheduleConfirmSheetOpen] = useState(false);
  const [selectedOrderForSchedule, setSelectedOrderForSchedule] = useState<StoreOrder | null>(null);
  const [scheduleStartTime, setScheduleStartTime] = useState('');
  const [scheduleEndTime, setScheduleEndTime] = useState('');
  const [scheduleLocation, setScheduleLocation] = useState('');
  const [isConfirmingSchedule, setIsConfirmingSchedule] = useState(false);
  const [isPickupSheetOpen, setIsPickupSheetOpen] = useState(false);
  const [selectedOrderForPickup, setSelectedOrderForPickup] = useState<StoreOrder | null>(null);
  const [timesheetStatus, setTimesheetStatus] = useState<string | null>(null);
  const [isCheckingTimesheet, setIsCheckingTimesheet] = useState(false);
  const [isProcessingPickup, setIsProcessingPickup] = useState(false);

  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      navigate({ to: '/login' });
      return;
    }

    const fetchOrders = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const params: any = { limit: 50 };
        if (statusFilter !== 'all') {
          params.status = statusFilter;
        }
        const response = await storeOrdersApi.getPartnerOrders(params);
        if (response.success && response.data) {
          setOrders(Array.isArray(response.data) ? response.data : (response.data as any).orders || []);
        } else {
          setError(response.error?.message || '주문 목록을 불러오는데 실패했습니다.');
        }
      } catch (err: any) {
        setError(err.message || '주문 목록을 불러오는데 실패했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrders();
  }, [user?.id, userLoading, statusFilter, navigate]);

  // 출고요청 정보 조회
  useEffect(() => {
    if (!user || orders.length === 0) return;

    const fetchShipmentRequests = async () => {
      try {
        const response = await storeCollaborationApi.getShipmentRequests({ limit: 100 });
        if (response.success && response.data) {
          const requests = Array.isArray(response.data) ? response.data : [];
          const requestsMap: Record<string, any> = {};
          requests.forEach((req: any) => {
            if (req.order_id) {
              requestsMap[req.order_id] = req;
            }
          });
          setShipmentRequests(requestsMap);
        }
      } catch (error) {
        console.error('출고요청 조회 실패:', error);
      }
    };

    fetchShipmentRequests();
  }, [user?.id, orders]);

  // 현장수령 주문의 스케줄 정보 조회
  useEffect(() => {
    if (!user || orders.length === 0) return;

    const fetchSchedules = async () => {
      const onSiteOrders = orders.filter(o => o.product?.product_type === 'on_site' && o.schedule_id);
      if (onSiteOrders.length === 0) return;

      try {
        const schedulePromises = onSiteOrders.map(async (order) => {
          if (order.schedule_id) {
            const response = await storeSchedulesApi.getDetail(order.schedule_id);
            if (response.success && response.data) {
              return { orderId: order.order_id, schedule: response.data };
            }
          }
          return null;
        });

        const scheduleResults = await Promise.all(schedulePromises);
        const schedulesMap: Record<string, any> = {};
        scheduleResults.forEach((result) => {
          if (result && result.orderId) {
            schedulesMap[result.orderId] = result.schedule;
          }
        });
        setSchedules(schedulesMap);
      } catch (error) {
        console.error('스케줄 조회 실패:', error);
      }
    };

    fetchSchedules();
  }, [user?.id, orders]);

  const handleUpdateShipping = async () => {
    if (!selectedOrder || !courier.trim() || !trackingNumber.trim()) {
      alert('택배사와 송장번호를 모두 입력해주세요.');
      return;
    }

    setIsUpdating(true);
    try {
      const response = await storeOrdersApi.updateStatus(selectedOrder.order_id, {
        status: 'shipped',
        courier: courier.trim(),
        tracking_number: trackingNumber.trim(),
      });

      if (response.success) {
        // 주문 목록 새로고침
        const refreshResponse = await storeOrdersApi.getPartnerOrders({ status: statusFilter, limit: 50 });
        if (refreshResponse.success && refreshResponse.data) {
          setOrders(Array.isArray(refreshResponse.data) ? refreshResponse.data : (refreshResponse.data as any).orders || []);
        }

        // 배송정보 메시지 자동 발송
        const orderDetailResponse = await storeOrdersApi.getDetail(selectedOrder.order_id);
        if (orderDetailResponse.success && orderDetailResponse.data && user) {
          const orderData = orderDetailResponse.data as any;
          try {
            await sendShippingInfoMessage(selectedOrder.order_id, {
              ...orderData,
              courier: courier.trim(),
              tracking_number: trackingNumber.trim(),
            }, user.id); // 파트너의 member_id 전달
          } catch (error) {
            console.error('배송정보 메시지 발송 실패:', error);
            // 메시지 발송 실패해도 주문 상태 업데이트는 성공한 것으로 처리
          }
        }

        setIsShippingSheetOpen(false);
        setCourier('');
        setTrackingNumber('');
        setSelectedOrder(null);
        alert('배송 정보가 업데이트되었습니다.');
      } else {
        alert(response.error?.message || '배송 정보 업데이트에 실패했습니다.');
      }
    } catch (err: any) {
      alert(err.message || '배송 정보 업데이트에 실패했습니다.');
    } finally {
      setIsUpdating(false);
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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#FE3A8F]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pt-16 pb-20">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3 px-4 py-3">
          <Typography variant="h6" className="flex-1 font-bold">
            주문 관리
          </Typography>
        </div>
      </div>

      {/* 필터 */}
      <div className="bg-white px-4 py-3 border-b border-gray-200">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {[
            { key: 'all', label: '전체' },
            { key: 'paid', label: '결제 완료' },
            { key: 'shipped', label: '배송 중' },
            { key: 'delivered', label: '배송 완료' },
            { key: 'confirmed', label: '구매 확정' },
          ].map((filter) => (
            <button
              key={filter.key}
              onClick={() => setStatusFilter(filter.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                statusFilter === filter.key
                  ? 'bg-[#FE3A8F] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* 주문 목록 */}
      {error ? (
        <div className="flex items-center justify-center py-12">
          <Typography variant="body1" className="text-gray-500">
            {error}
          </Typography>
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <Package className="h-16 w-16 text-gray-300 mb-4" />
          <Typography variant="body1" className="text-gray-500 mb-2">
            주문 내역이 없습니다
          </Typography>
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {orders.map((order) => {
            const orderItems = order.order_items || [];
            const displayProduct = orderItems[0]?.product || order.product;
            
            return (
            <div
              key={order.order_id}
              className="bg-white rounded-lg p-4 shadow-sm"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <Typography variant="body2" className="text-gray-500 mb-1">
                    {new Date(order.created_at).toLocaleDateString('ko-KR')}
                    {order.order_number && (
                      <span className="ml-2 text-gray-400">#{order.order_number}</span>
                    )}
                  </Typography>
                  {orderItems.length > 0 ? (
                    <div className="space-y-1">
                      {orderItems.map((item) => (
                        <div key={item.order_item_id} className="flex items-center gap-2">
                          <Typography variant="body1" className="font-medium">
                            {item.product?.name || '상품명 없음'}
                          </Typography>
                          <span className="text-xs text-gray-500">x{item.quantity}</span>
                          <span className="text-xs text-[#FE3A8F]">{item.total_price?.toLocaleString()}P</span>
                        </div>
                      ))}
                    </div>
                  ) : displayProduct ? (
                    <Typography variant="body1" className="font-medium mb-1">
                      {displayProduct.name}
                    </Typography>
                  ) : null}
                  <div className="flex items-center gap-2 mt-1">
                    {!orderItems.length && (
                      <span className="text-xs text-gray-500">
                        수량: {order.quantity}개
                      </span>
                    )}
                    {order.recipient_name && (
                      <>
                        {!orderItems.length && <span className="text-xs text-gray-400">•</span>}
                        <span className="text-xs text-gray-500">
                          받는 분: {order.recipient_name}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(order.status)}`}>
                    {getStatusLabel(order.status)}
                  </span>
                  <Typography variant="body1" className="font-bold text-[#FE3A8F] mt-2">
                    {order.total_amount.toLocaleString()}P
                  </Typography>
                </div>
              </div>

              {/* 배송 정보 */}
              {order.courier && order.tracking_number && (
                <div className="pt-3 border-t border-gray-200">
                  <div className="flex items-center gap-2 text-sm">
                    <Truck className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-600">{order.courier}</span>
                    <span className="text-gray-400">•</span>
                    <span className="text-gray-600">{order.tracking_number}</span>
                  </div>
                </div>
              )}

              {/* 출고요청/송장 입력 버튼 */}
              {order.status === 'paid' && order.product?.product_type === 'delivery' && (
                <div className="pt-3 border-t border-gray-200 mt-3 space-y-2">
                  {/* 협업 상품: 출고요청 생성 */}
                  {order.product?.source === 'collaboration' && (
                    <>
                      {shipmentRequests[order.order_id] ? (
                        <div className="p-2 bg-blue-50 rounded-lg">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">출고요청 상태:</span>
                            <span className={`font-medium ${
                              shipmentRequests[order.order_id].status === 'pending' ? 'text-yellow-600' :
                              shipmentRequests[order.order_id].status === 'approved' ? 'text-green-600' :
                              shipmentRequests[order.order_id].status === 'shipped' ? 'text-blue-600' :
                              shipmentRequests[order.order_id].status === 'rejected' ? 'text-red-600' : 'text-gray-600'
                            }`}>
                              {shipmentRequests[order.order_id].status === 'pending' ? '대기 중' :
                               shipmentRequests[order.order_id].status === 'approved' ? '승인됨' :
                               shipmentRequests[order.order_id].status === 'shipped' ? '출고 완료' :
                               shipmentRequests[order.order_id].status === 'rejected' ? '거절됨' : shipmentRequests[order.order_id].status}
                            </span>
                          </div>
                          {shipmentRequests[order.order_id].courier && shipmentRequests[order.order_id].tracking_number && (
                            <div className="mt-1 text-xs text-gray-500">
                              {shipmentRequests[order.order_id].courier} {shipmentRequests[order.order_id].tracking_number}
                            </div>
                          )}
                        </div>
                      ) : (
                        <Button
                          onClick={async () => {
                            setIsCreatingShipmentRequest(true);
                            try {
                              const response = await storeCollaborationApi.createShipmentRequest({
                                order_id: order.order_id,
                              });
                              if (response.success) {
                                alert('출고요청이 생성되었습니다.');
                                // 출고요청 목록 새로고침
                                const refreshResponse = await storeCollaborationApi.getShipmentRequests({ limit: 100 });
                                if (refreshResponse.success && refreshResponse.data) {
                                  const requests = Array.isArray(refreshResponse.data) ? refreshResponse.data : [];
                                  const requestsMap: Record<string, any> = {};
                                  requests.forEach((req: any) => {
                                    if (req.order_id) {
                                      requestsMap[req.order_id] = req;
                                    }
                                  });
                                  setShipmentRequests(requestsMap);
                                }
                              } else {
                                alert(response.error?.message || '출고요청 생성에 실패했습니다.');
                              }
                            } catch (err: any) {
                              alert(err.message || '출고요청 생성에 실패했습니다.');
                            } finally {
                              setIsCreatingShipmentRequest(false);
                            }
                          }}
                          disabled={isCreatingShipmentRequest}
                          variant="outline"
                          size="sm"
                          className="w-full"
                        >
                          <Send className="h-4 w-4 mr-2" />
                          {isCreatingShipmentRequest ? '처리 중...' : '출고요청 생성'}
                        </Button>
                      )}
                    </>
                  )}

                  {/* 개인 상품: 송장 입력 */}
                  {order.product?.source === 'partner' && (
                    <Button
                      onClick={() => {
                        setSelectedOrder(order);
                        setCourier(order.courier || '');
                        setTrackingNumber(order.tracking_number || '');
                        setIsShippingSheetOpen(true);
                      }}
                      variant="outline"
                      size="sm"
                      className="w-full"
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      {order.courier && order.tracking_number ? '송장 수정' : '송장 입력'}
                    </Button>
                  )}
                </div>
              )}

              {/* 현장수령 스케줄 확정/수령 완료 */}
              {order.status === 'paid' && order.product?.product_type === 'on_site' && (
                <div className="pt-3 border-t border-gray-200 mt-3 space-y-2">
                  {/* 스케줄 정보 표시 */}
                  {schedules[order.order_id] ? (
                    <div className="p-2 bg-blue-50 rounded-lg mb-2">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="h-4 w-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-700">스케줄 상태:</span>
                        <span className={`text-sm font-medium ${
                          schedules[order.order_id].status === 'pending' ? 'text-yellow-600' :
                          schedules[order.order_id].status === 'reserved' ? 'text-blue-600' :
                          schedules[order.order_id].status === 'completed' ? 'text-green-600' :
                          schedules[order.order_id].status === 'no_show' ? 'text-red-600' : 'text-gray-600'
                        }`}>
                          {schedules[order.order_id].status === 'pending' ? '대기 중' :
                           schedules[order.order_id].status === 'reserved' ? '예약 확정' :
                           schedules[order.order_id].status === 'completed' ? '수령 완료' :
                           schedules[order.order_id].status === 'no_show' ? '노쇼' : schedules[order.order_id].status}
                        </span>
                      </div>
                      {schedules[order.order_id].start_time && (
                        <div className="text-xs text-gray-600">
                          일시: {new Date(schedules[order.order_id].start_time).toLocaleString('ko-KR')}
                        </div>
                      )}
                      {schedules[order.order_id].location && (
                        <div className="text-xs text-gray-600">
                          장소: {schedules[order.order_id].location}
                        </div>
                      )}
                    </div>
                  ) : (
                    <Button
                      onClick={() => {
                        setSelectedOrderForSchedule(order);
                        setScheduleStartTime('');
                        setScheduleEndTime('');
                        setScheduleLocation('');
                        setIsScheduleConfirmSheetOpen(true);
                      }}
                      variant="outline"
                      size="sm"
                      className="w-full mb-2"
                    >
                      <Clock className="h-4 w-4 mr-2" />
                      스케줄 확정
                    </Button>
                  )}

                  {/* 수령 완료 버튼 (reserved 상태인 경우) */}
                  {schedules[order.order_id]?.status === 'reserved' && (
                    <Button
                      onClick={async () => {
                        setSelectedOrderForPickup(order);
                        setIsCheckingTimesheet(true);
                        setTimesheetStatus(null);

                        // timesheet 상태 확인 (파트너의 member_id 필요)
                        try {
                          // 현재 로그인한 파트너의 member_id 사용 (본인이 수령 완료 처리)
                          if (user?.id) {
                            // timesheet 조회 (read-only)
                            // getCurrentAttendanceStatus는 partner_plus_id를 받지만,
                            // timesheet_attendance_records의 partner_plus_id는 members.id를 참조하므로
                            // member_id를 그대로 사용 가능
                            const status = await getCurrentAttendanceStatus(user.id);
                            setTimesheetStatus(status);
                          }
                        } catch (error) {
                          console.error('Timesheet 조회 실패:', error);
                          setTimesheetStatus('OFF'); // 실패 시 기본값
                        } finally {
                          setIsCheckingTimesheet(false);
                        }

                        setIsPickupSheetOpen(true);
                      }}
                      variant="outline"
                      size="sm"
                      className="w-full"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      수령 완료 처리
                    </Button>
                  )}
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}

      {/* 송장 입력 시트 */}
      <SlideSheet
        isOpen={isShippingSheetOpen}
        onClose={() => {
          setIsShippingSheetOpen(false);
          setCourier('');
          setTrackingNumber('');
          setSelectedOrder(null);
        }}
        title="배송 정보 입력"
        footer={
          <div className="flex gap-3 px-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsShippingSheetOpen(false);
                setCourier('');
                setTrackingNumber('');
                setSelectedOrder(null);
              }}
              className="flex-1"
              disabled={isUpdating}
            >
              취소
            </Button>
            <Button
              onClick={handleUpdateShipping}
              disabled={isUpdating || !courier.trim() || !trackingNumber.trim()}
              className="flex-1 bg-[#FE3A8F] text-white"
            >
              {isUpdating ? '처리 중...' : '저장'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {selectedOrder && (
            <>
              <div className="p-4 bg-gray-50 rounded-lg">
                <Typography variant="body2" className="text-gray-600 mb-2">
                  주문 정보
                </Typography>
                <Typography variant="body1" className="font-medium mb-1">
                  {selectedOrder.product?.name}
                </Typography>
                <Typography variant="body2" className="text-gray-500">
                  주문번호: {selectedOrder.order_id}
                </Typography>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    택배사 *
                  </label>
                  <Input
                    type="text"
                    value={courier}
                    onChange={(e) => setCourier(e.target.value)}
                    placeholder="예: CJ대한통운, 한진택배, 로젠택배"
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
                    placeholder="송장번호를 입력하세요"
                    className="w-full"
                  />
                </div>
              </div>

              <div className="p-3 bg-blue-50 rounded-lg">
                <Typography variant="caption" className="text-blue-700">
                  💡 송장 정보 입력 후 고객에게 자동으로 배송 정보가 전송됩니다.
                </Typography>
              </div>
            </>
          )}
        </div>
      </SlideSheet>

      {/* 스케줄 확정 시트 */}
      <SlideSheet
        isOpen={isScheduleConfirmSheetOpen}
        onClose={() => {
          setIsScheduleConfirmSheetOpen(false);
          setScheduleStartTime('');
          setScheduleEndTime('');
          setScheduleLocation('');
          setSelectedOrderForSchedule(null);
        }}
        title="스케줄 확정"
        footer={
          <div className="flex gap-3 px-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsScheduleConfirmSheetOpen(false);
                setScheduleStartTime('');
                setScheduleEndTime('');
                setScheduleLocation('');
                setSelectedOrderForSchedule(null);
              }}
              className="flex-1"
              disabled={isConfirmingSchedule}
            >
              취소
            </Button>
            <Button
              onClick={async () => {
                if (!selectedOrderForSchedule || !scheduleStartTime || !scheduleEndTime) {
                  alert('시작 시간과 종료 시간을 모두 입력해주세요.');
                  return;
                }

                setIsConfirmingSchedule(true);
                try {
                  const response = await storeSchedulesApi.confirmOrder(selectedOrderForSchedule.order_id, {
                    start_time: scheduleStartTime,
                    end_time: scheduleEndTime,
                    location: scheduleLocation || undefined,
                  });

                  if (response.success) {
                    alert('스케줄이 수정되었습니다.');
                    
                    // 주문 목록 새로고침
                    const refreshResponse = await storeOrdersApi.getPartnerOrders({ status: statusFilter, limit: 50 });
                    if (refreshResponse.success && refreshResponse.data) {
                      const refreshedOrders = Array.isArray(refreshResponse.data) ? refreshResponse.data : (refreshResponse.data as any).orders || [];
                      setOrders(refreshedOrders);

                      // 스케줄 정보도 새로고침
                      const onSiteOrders = refreshedOrders.filter((o: StoreOrder) => o.product?.product_type === 'on_site' && o.schedule_id);
                      if (onSiteOrders.length > 0) {
                        const schedulePromises = onSiteOrders.map(async (order: StoreOrder) => {
                          if (order.schedule_id) {
                            const scheduleResponse = await storeSchedulesApi.getDetail(order.schedule_id);
                            if (scheduleResponse.success && scheduleResponse.data) {
                              return { orderId: order.order_id, schedule: scheduleResponse.data };
                            }
                          }
                          return null;
                        });
                        const scheduleResults = await Promise.all(schedulePromises);
                        const schedulesMap: Record<string, any> = {};
                        scheduleResults.forEach((result) => {
                          if (result && result.orderId) {
                            schedulesMap[result.orderId] = result.schedule;
                          }
                        });
                        setSchedules(schedulesMap);
                      }
                    }

                    setIsScheduleConfirmSheetOpen(false);
                    setScheduleStartTime('');
                    setScheduleEndTime('');
                    setScheduleLocation('');
                    setSelectedOrderForSchedule(null);
                  } else {
                    alert(response.error?.message || '스케줄 확정에 실패했습니다.');
                  }
                } catch (err: any) {
                  alert(err.message || '스케줄 확정에 실패했습니다.');
                } finally {
                  setIsConfirmingSchedule(false);
                }
              }}
              disabled={isConfirmingSchedule || !scheduleStartTime || !scheduleEndTime}
              className="flex-1 bg-[#FE3A8F] text-white"
            >
              {isConfirmingSchedule ? '처리 중...' : '확정'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {selectedOrderForSchedule && (
            <>
              <div className="p-4 bg-gray-50 rounded-lg">
                <Typography variant="body2" className="text-gray-600 mb-2">
                  주문 정보
                </Typography>
                <Typography variant="body1" className="font-medium mb-1">
                  {selectedOrderForSchedule.product?.name}
                </Typography>
                <Typography variant="body2" className="text-gray-500">
                  주문번호: {selectedOrderForSchedule.order_id}
                </Typography>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    시작 시간 *
                  </label>
                  <Input
                    type="datetime-local"
                    value={scheduleStartTime}
                    onChange={(e) => setScheduleStartTime(e.target.value)}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    종료 시간 *
                  </label>
                  <Input
                    type="datetime-local"
                    value={scheduleEndTime}
                    onChange={(e) => setScheduleEndTime(e.target.value)}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    장소 (선택)
                  </label>
                  <Input
                    type="text"
                    value={scheduleLocation}
                    onChange={(e) => setScheduleLocation(e.target.value)}
                    placeholder="수령 장소를 입력하세요"
                    className="w-full"
                  />
                </div>
              </div>

              <div className="p-3 bg-blue-50 rounded-lg">
                <Typography variant="caption" className="text-blue-700">
                  💡 스케줄 확정 후 고객에게 알림이 전송됩니다.
                </Typography>
              </div>
            </>
          )}
        </div>
      </SlideSheet>

      {/* 수령 완료 처리 시트 */}
      <SlideSheet
        isOpen={isPickupSheetOpen}
        onClose={() => {
          setIsPickupSheetOpen(false);
          setSelectedOrderForPickup(null);
          setTimesheetStatus(null);
        }}
        title="수령 완료 처리"
        footer={
          <div className="flex gap-3 px-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsPickupSheetOpen(false);
                setSelectedOrderForPickup(null);
                setTimesheetStatus(null);
              }}
              className="flex-1"
              disabled={isProcessingPickup}
            >
              취소
            </Button>
            <Button
              onClick={async () => {
                if (!selectedOrderForPickup || !selectedOrderForPickup.schedule_id) {
                  alert('스케줄 정보가 없습니다.');
                  return;
                }

                // timesheet=IN 조건 확인 (필요한 경우)
                if (timesheetStatus !== 'WORKING' && timesheetStatus !== null) {
                  alert('출근 상태(WORKING)에서만 수령 완료 처리가 가능합니다.');
                  return;
                }

                setIsProcessingPickup(true);
                try {
                  const response = await storeSchedulesApi.pickup(
                    selectedOrderForPickup.schedule_id,
                    selectedOrderForPickup.order_id
                  );

                  if (response.success) {
                    alert('수령 완료 처리가 완료되었습니다.');
                    
                    // 주문 목록 새로고침
                    const refreshResponse = await storeOrdersApi.getPartnerOrders({ status: statusFilter, limit: 50 });
                    if (refreshResponse.success && refreshResponse.data) {
                      const refreshedOrders = Array.isArray(refreshResponse.data) ? refreshResponse.data : (refreshResponse.data as any).orders || [];
                      setOrders(refreshedOrders);

                      // 스케줄 정보도 새로고침
                      const onSiteOrders = refreshedOrders.filter((o: StoreOrder) => o.product?.product_type === 'on_site' && o.schedule_id);
                      if (onSiteOrders.length > 0) {
                        const schedulePromises = onSiteOrders.map(async (order: StoreOrder) => {
                          if (order.schedule_id) {
                            const scheduleResponse = await storeSchedulesApi.getDetail(order.schedule_id);
                            if (scheduleResponse.success && scheduleResponse.data) {
                              return { orderId: order.order_id, schedule: scheduleResponse.data };
                            }
                          }
                          return null;
                        });
                        const scheduleResults = await Promise.all(schedulePromises);
                        const schedulesMap: Record<string, any> = {};
                        scheduleResults.forEach((result) => {
                          if (result && result.orderId) {
                            schedulesMap[result.orderId] = result.schedule;
                          }
                        });
                        setSchedules(schedulesMap);
                      }
                    }

                    setIsPickupSheetOpen(false);
                    setSelectedOrderForPickup(null);
                    setTimesheetStatus(null);
                  } else {
                    alert(response.error?.message || '수령 완료 처리에 실패했습니다.');
                  }
                } catch (err: any) {
                  alert(err.message || '수령 완료 처리에 실패했습니다.');
                } finally {
                  setIsProcessingPickup(false);
                }
              }}
              disabled={isProcessingPickup || (timesheetStatus !== 'WORKING' && timesheetStatus !== null)}
              className="flex-1 bg-green-600 text-white"
            >
              {isProcessingPickup ? '처리 중...' : '수령 완료'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {selectedOrderForPickup && (
            <>
              <div className="p-4 bg-gray-50 rounded-lg">
                <Typography variant="body2" className="text-gray-600 mb-2">
                  주문 정보
                </Typography>
                <Typography variant="body1" className="font-medium mb-1">
                  {selectedOrderForPickup.product?.name}
                </Typography>
                <Typography variant="body2" className="text-gray-500">
                  주문번호: {selectedOrderForPickup.order_id}
                </Typography>
              </div>

              {isCheckingTimesheet ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin text-[#FE3A8F]" />
                  <Typography variant="body2" className="ml-2 text-gray-600">
                    출근 상태 확인 중...
                  </Typography>
                </div>
              ) : timesheetStatus !== null ? (
                <div className={`p-3 rounded-lg ${
                  timesheetStatus === 'WORKING' ? 'bg-green-50' : 'bg-yellow-50'
                }`}>
                  <div className="flex items-center gap-2">
                    {timesheetStatus === 'WORKING' ? (
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-yellow-600" />
                    )}
                    <Typography variant="body2" className={`font-medium ${
                      timesheetStatus === 'WORKING' ? 'text-green-700' : 'text-yellow-700'
                    }`}>
                      출근 상태: {timesheetStatus === 'WORKING' ? '출근 중' : timesheetStatus === 'BREAK' ? '휴게 중' : '미출근'}
                    </Typography>
                  </div>
                  {timesheetStatus !== 'WORKING' && (
                    <Typography variant="caption" className="text-yellow-700 mt-2 block">
                      ⚠️ 출근 상태(WORKING)에서만 수령 완료 처리가 가능합니다.
                    </Typography>
                  )}
                </div>
              ) : (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <Typography variant="caption" className="text-blue-700">
                    💡 출근 상태 확인이 필요합니다. 출근 상태에 따라 수령 완료 처리가 가능합니다.
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
