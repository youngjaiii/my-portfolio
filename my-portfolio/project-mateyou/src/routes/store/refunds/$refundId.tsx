import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { ChevronLeft, Loader2, CheckCircle, XCircle, Clock, Copy, Check } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { storeRefundsApi } from '@/api/store/refunds';
import { Button, Typography } from '@/components';
import { toast } from '@/components/ui/sonner';

export const Route = createFileRoute('/store/refunds/$refundId')({
  component: RefundDetailPage,
});

function RefundDetailPage() {
  const { refundId } = Route.useParams();
  const navigate = useNavigate();
  useAuth();
  const [refund, setRefund] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopyRefundId = async () => {
    try {
      await navigator.clipboard.writeText(refund?.refund_id || '');
      setCopied(true);
      toast.success('환불 요청번호가 복사되었습니다');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('복사에 실패했습니다');
    }
  };

  useEffect(() => {
    const fetchRefund = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await storeRefundsApi.getDetail(refundId);
        if (response.success && response.data) {
          setRefund(response.data);
        } else {
          setError(response.error?.message || '환불 요청을 불러오는데 실패했습니다.');
        }
      } catch (err: any) {
        setError(err.message || '환불 요청을 불러오는데 실패했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    if (refundId) {
      fetchRefund();
    }
  }, [refundId]);

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'requested': return '요청됨';
      case 'pending': return '대기 중';
      case 'approved': return '승인됨';
      case 'rejected': return '거절됨';
      case 'completed': return '완료됨';
      default: return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-700';
      case 'approved': return 'bg-blue-100 text-blue-700';
      case 'rejected': return 'bg-red-100 text-red-700';
      case 'completed': return 'bg-green-100 text-green-700';
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

  if (error || !refund) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <Typography variant="h5" className="text-gray-600 mb-2">
            {error || '환불 요청을 찾을 수 없습니다.'}
          </Typography>
          <Button
            onClick={() => navigate({ to: '/store/refunds' })}
            variant="outline"
            className="mt-4"
          >
            환불 목록으로
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* 헤더 */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-100">
        <div className="flex items-center h-14 px-4">
          <button onClick={() => window.history.back()} className="p-2 -ml-2">
            <ChevronLeft className="h-6 w-6" />
          </button>
          <Typography variant="h6" className="flex-1 text-center font-semibold">
            환불 요청 상세
          </Typography>
          <div className="w-10" />
        </div>
      </div>

      <div className="flex-1 pt-14 pb-24">
      {/* 환불 정보 */}
      <div className="bg-white px-4 pt-6 pb-6 space-y-4">
        {/* 환불 상태 */}
        <div className="flex items-center justify-between">
          <Typography variant="h5" className="font-bold">
            환불 정보
          </Typography>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-lg text-sm font-medium ${getStatusColor(refund.status)}`}>
              {getStatusLabel(refund.status)}
            </span>
          </div>
        </div>

        <div className="pt-4 border-t border-gray-200 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-gray-600 flex-shrink-0">환불 요청번호</span>
            <div className="flex items-center gap-2 min-w-0 ml-4">
              <span className="font-medium text-sm truncate">{refund.refund_id}</span>
              <button
                onClick={handleCopyRefundId}
                className="p-1.5 rounded-md hover:bg-gray-100 flex-shrink-0 transition-colors"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4 text-gray-400" />
                )}
              </button>
            </div>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">요청일시</span>
            <span className="font-medium">
              {new Date(refund.requested_at || refund.created_at).toLocaleString('ko-KR')}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">환불 금액</span>
            <span className="font-bold text-[#FE3A8F] text-lg">
              {(refund.refund_amount || refund.amount || 0).toLocaleString()}P
            </span>
          </div>
          {refund.reason && (
            <div className="pt-3 border-t border-gray-200">
              <span className="text-gray-600 block mb-2">환불 사유</span>
              <Typography variant="body2" className="text-gray-800">
                {refund.reason}
              </Typography>
            </div>
          )}
        </div>
      </div>

      {/* 주문 정보 */}
      {refund.order && (
        <div className="bg-white mt-2 px-4 py-6">
          <Typography variant="h6" className="font-bold mb-4">
            주문 정보
          </Typography>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">주문번호</span>
              <span className="font-medium">{refund.order.order_number || refund.order.order_id}</span>
            </div>
            {refund.order.product && (
              <>
                <div className="flex justify-between">
                  <span className="text-gray-600">상품명</span>
                  <span className="font-medium">{refund.order.product.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">주문 금액</span>
                  <span className="font-medium">{refund.order.total_amount.toLocaleString()}P</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 처리 정보 */}
      {refund.responded_at && (
        <div className="bg-white mt-2 px-4 py-6">
          <Typography variant="h6" className="font-bold mb-4">
            처리 정보
          </Typography>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600">처리일시</span>
              <span className="font-medium">
                {new Date(refund.responded_at).toLocaleString('ko-KR')}
              </span>
            </div>
            {refund.notes && (
              <div className="pt-3 border-t border-gray-200">
                <span className="text-gray-600 block mb-2">처리 메모</span>
                <Typography variant="body2" className="text-gray-800">
                  {refund.notes}
                </Typography>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 상태별 안내 */}
      {refund.status === 'pending' && (
        <div className="bg-blue-50 rounded-lg p-4 mx-4 mt-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600" />
            <Typography variant="body2" className="text-blue-700">
              환불 요청이 접수되었습니다. 파트너 또는 관리자의 검토 후 처리됩니다.
            </Typography>
          </div>
        </div>
      )}

      {refund.status === 'approved' && (
        <div className="bg-green-50 rounded-lg p-4 mx-4 mt-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <Typography variant="body2" className="text-green-700">
              환불이 승인되었습니다. 환불 처리가 진행 중입니다.
            </Typography>
          </div>
        </div>
      )}

      {refund.status === 'completed' && (
        <div className="bg-green-50 rounded-lg p-4 mx-4 mt-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <Typography variant="body2" className="text-green-700">
              환불이 완료되었습니다. 환불 금액이 결제 수단으로 반환됩니다.
            </Typography>
          </div>
        </div>
      )}

      {refund.status === 'rejected' && (
        <div className="bg-red-50 rounded-lg p-4 mx-4 mt-4">
          <div className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-600" />
            <Typography variant="body2" className="text-red-700">
              환불 요청이 거절되었습니다. 자세한 사유는 처리 메모를 확인해주세요.
            </Typography>
          </div>
        </div>
      )}
      </div>

      {/* 하단 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 safe-area-bottom">
        <div className="max-w-2xl mx-auto">
          <Button
            onClick={() => navigate({
              to: '/store/orders/$orderId',
              params: { orderId: refund.order_id },
            })}
            variant="outline"
            className="w-full"
          >
            주문 상세로 이동
          </Button>
        </div>
      </div>
    </div>
  );
}
