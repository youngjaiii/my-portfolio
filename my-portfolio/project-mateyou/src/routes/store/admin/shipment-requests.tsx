import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { Loader2, Package, CheckCircle, XCircle, Truck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { storeCollaborationApi } from '@/api/store/collaboration';
import { Typography, Button, SlideSheet, Input } from '@/components';
import { useAdminGuard } from '@/hooks/useAdminGuard';

export const Route = createFileRoute('/store/admin/shipment-requests')({
  component: AdminShipmentRequestsPage,
});

function AdminShipmentRequestsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin, isLoading: isAdminLoading } = useAdminGuard();
  const [requests, setRequests] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [selectedRequest, setSelectedRequest] = useState<any>(null);
  const [isActionSheetOpen, setIsActionSheetOpen] = useState(false);
  const [action, setAction] = useState<'approve' | 'reject'>('approve');
  const [courier, setCourier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!user || isAdminLoading) return;
    if (!isAdmin) return;

    const fetchRequests = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const params: any = { limit: 50 };
        if (statusFilter !== 'all') {
          params.status = statusFilter;
        }
        const response = await storeCollaborationApi.getShipmentRequestsAdmin(params);
        if (response.success && response.data) {
          setRequests(Array.isArray(response.data) ? response.data : []);
        } else {
          setError(response.error?.message || '출고요청 목록을 불러오는데 실패했습니다.');
        }
      } catch (err: any) {
        setError(err.message || '출고요청 목록을 불러오는데 실패했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchRequests();
  }, [user?.id, isAdmin, isAdminLoading, statusFilter]);

  const handleRespond = async () => {
    if (!selectedRequest) return;

    if (action === 'approve' && (!courier.trim() || !trackingNumber.trim())) {
      alert('택배사와 송장번호를 모두 입력해주세요.');
      return;
    }

    if (action === 'reject' && !rejectionReason.trim()) {
      alert('거절 사유를 입력해주세요.');
      return;
    }

    setIsProcessing(true);
    try {
      const response = await storeCollaborationApi.respondShipmentRequest(selectedRequest.request_id, {
        status: action === 'approve' ? 'approved' : 'rejected',
        courier: action === 'approve' ? courier.trim() : undefined,
        tracking_number: action === 'approve' ? trackingNumber.trim() : undefined,
      });

      if (response.success) {
        alert(action === 'approve' ? '출고요청이 승인되었습니다.' : '출고요청이 거절되었습니다.');
        
        // 목록 새로고침
        const refreshResponse = await storeCollaborationApi.getShipmentRequestsAdmin({ 
          status: statusFilter !== 'all' ? statusFilter : undefined,
          limit: 50 
        });
        if (refreshResponse.success && refreshResponse.data) {
          setRequests(Array.isArray(refreshResponse.data) ? refreshResponse.data : []);
        }

        setIsActionSheetOpen(false);
        setCourier('');
        setTrackingNumber('');
        setRejectionReason('');
        setSelectedRequest(null);
      } else {
        alert(response.error?.message || '처리에 실패했습니다.');
      }
    } catch (err: any) {
      alert(err.message || '처리에 실패했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return '대기 중';
      case 'approved': return '승인됨';
      case 'shipped': return '출고 완료';
      case 'rejected': return '거절됨';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-700';
      case 'approved': return 'bg-green-100 text-green-700';
      case 'shipped': return 'bg-blue-100 text-blue-700';
      case 'rejected': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  if (isAdminLoading || isLoading) {
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
    <div className="min-h-screen bg-gray-50 pt-16 pb-20">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3 px-4 py-3">
          <Typography variant="h6" className="flex-1 font-bold">
            출고요청 관리
          </Typography>
        </div>
      </div>

      {/* 필터 */}
      <div className="bg-white px-4 py-3 border-b border-gray-200">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {[
            { key: 'all', label: '전체' },
            { key: 'pending', label: '대기 중' },
            { key: 'approved', label: '승인됨' },
            { key: 'shipped', label: '출고 완료' },
            { key: 'rejected', label: '거절됨' },
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

      {/* 출고요청 목록 */}
      {error ? (
        <div className="flex items-center justify-center py-12">
          <Typography variant="body1" className="text-gray-500">
            {error}
          </Typography>
        </div>
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <Package className="h-16 w-16 text-gray-300 mb-4" />
          <Typography variant="body1" className="text-gray-500 mb-2">
            출고요청이 없습니다
          </Typography>
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {requests.map((request) => (
            <div
              key={request.request_id}
              className="bg-white rounded-lg p-4 shadow-sm"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <Typography variant="body2" className="text-gray-500 mb-1">
                    {new Date(request.requested_at || request.created_at).toLocaleDateString('ko-KR')}
                  </Typography>
                  {request.product && (
                    <Typography variant="body1" className="font-medium mb-1">
                      {request.product.name}
                    </Typography>
                  )}
                  {request.order && (
                    <div className="text-sm text-gray-600">
                      주문번호: {request.order.order_number || request.order.order_id}
                    </div>
                  )}
                  {request.partner && (
                    <div className="text-sm text-gray-600">
                      파트너: {request.partner.partner_name || request.partner.member?.name}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(request.status)}`}>
                    {getStatusLabel(request.status)}
                  </span>
                </div>
              </div>

              {/* 배송 정보 */}
              {request.courier && request.tracking_number && (
                <div className="pt-3 border-t border-gray-200">
                  <div className="flex items-center gap-2 text-sm">
                    <Truck className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-600">{request.courier}</span>
                    <span className="text-gray-400">•</span>
                    <span className="text-gray-600">{request.tracking_number}</span>
                  </div>
                </div>
              )}

              {/* 처리 버튼 (대기 중인 경우만) */}
              {request.status === 'pending' && (
                <div className="pt-3 border-t border-gray-200 mt-3 flex gap-2">
                  <Button
                    onClick={() => {
                      setSelectedRequest(request);
                      setAction('approve');
                      setCourier('');
                      setTrackingNumber('');
                      setIsActionSheetOpen(true);
                    }}
                    variant="outline"
                    size="sm"
                    className="flex-1"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    승인
                  </Button>
                  <Button
                    onClick={() => {
                      setSelectedRequest(request);
                      setAction('reject');
                      setRejectionReason('');
                      setIsActionSheetOpen(true);
                    }}
                    variant="outline"
                    size="sm"
                    className="flex-1 text-red-600 border-red-300"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    거절
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 처리 시트 */}
      <SlideSheet
        isOpen={isActionSheetOpen}
        onClose={() => {
          setIsActionSheetOpen(false);
          setCourier('');
          setTrackingNumber('');
          setRejectionReason('');
          setSelectedRequest(null);
        }}
        title={action === 'approve' ? '출고요청 승인' : '출고요청 거절'}
        footer={
          <div className="flex gap-3 px-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsActionSheetOpen(false);
                setCourier('');
                setTrackingNumber('');
                setRejectionReason('');
                setSelectedRequest(null);
              }}
              className="flex-1"
              disabled={isProcessing}
            >
              취소
            </Button>
            <Button
              onClick={handleRespond}
              disabled={isProcessing || (action === 'approve' && (!courier.trim() || !trackingNumber.trim())) || (action === 'reject' && !rejectionReason.trim())}
              className={`flex-1 ${
                action === 'approve' 
                  ? 'bg-green-600 text-white' 
                  : 'bg-red-600 text-white'
              }`}
            >
              {isProcessing ? '처리 중...' : action === 'approve' ? '승인' : '거절'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {selectedRequest && (
            <>
              <div className="p-4 bg-gray-50 rounded-lg">
                <Typography variant="body2" className="text-gray-600 mb-2">
                  출고요청 정보
                </Typography>
                <Typography variant="body1" className="font-medium mb-1">
                  {selectedRequest.product?.name}
                </Typography>
                <Typography variant="body2" className="text-gray-500">
                  요청 ID: {selectedRequest.request_id}
                </Typography>
                {selectedRequest.order && (
                  <Typography variant="body2" className="text-gray-500">
                    주문번호: {selectedRequest.order.order_number || selectedRequest.order.order_id}
                  </Typography>
                )}
              </div>

              {action === 'approve' ? (
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

                  <div className="p-3 bg-green-50 rounded-lg">
                    <Typography variant="caption" className="text-green-700">
                      💡 승인 시 주문 상태가 "배송 중"으로 변경되고 재고가 차감됩니다.
                    </Typography>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      거절 사유 *
                    </label>
                    <textarea
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="거절 사유를 입력하세요"
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
          )}
        </div>
      </SlideSheet>
    </div>
  );
}
