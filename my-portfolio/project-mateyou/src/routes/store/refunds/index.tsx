import { createFileRoute, Link } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { Loader2, Package, RotateCcw } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { storeRefundsApi } from '@/api/store/refunds';
import { Typography } from '@/components';

export const Route = createFileRoute('/store/refunds/')({
  component: RefundsListPage,
});

function RefundsListPage() {
  const { user, isLoading: userLoading } = useAuth();
  const [refunds, setRefunds] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    if (userLoading) return;
    if (!user) return;

    const fetchRefunds = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const params: any = { limit: 50 };
        if (statusFilter !== 'all') {
          params.status = statusFilter;
        }
        const response = await storeRefundsApi.getList(params);
        if (response.success && response.data) {
          const refundsData = Array.isArray(response.data) ? response.data : (response.data as any).refunds || [];
          setRefunds(refundsData);
        } else {
          setError(response.error?.message || '환불 목록을 불러오는데 실패했습니다.');
        }
      } catch (err: any) {
        setError(err.message || '환불 목록을 불러오는데 실패했습니다.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchRefunds();
  }, [user?.id, userLoading, statusFilter]);

  const getStatusLabel = (status: string) => {
    switch (status) {
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

  if (userLoading || isLoading) {
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
            환불 요청 내역
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
            { key: 'completed', label: '완료됨' },
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

      {/* 환불 목록 */}
      {error ? (
        <div className="flex items-center justify-center py-12">
          <Typography variant="body1" className="text-gray-500">
            {error}
          </Typography>
        </div>
      ) : refunds.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12">
          <RotateCcw className="h-16 w-16 text-gray-300 mb-4" />
          <Typography variant="body1" className="text-gray-500 mb-2">
            환불 요청 내역이 없습니다
          </Typography>
          <Link
            to="/store/orders"
            className="text-[#FE3A8F] font-medium"
          >
            주문 목록으로
          </Link>
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {refunds.map((refund) => (
            <Link
              key={refund.refund_id}
              to="/store/refunds/$refundId"
              params={{ refundId: refund.refund_id }}
              className="block bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <Typography variant="body2" className="text-gray-500 mb-1">
                    {new Date(refund.requested_at || refund.created_at).toLocaleDateString('ko-KR')}
                  </Typography>
                  {refund.order?.product && (
                    <Typography variant="body1" className="font-medium mb-1">
                      {refund.order.product.name}
                    </Typography>
                  )}
                  {refund.reason && (
                    <Typography variant="body2" className="text-gray-600 line-clamp-2">
                      {refund.reason}
                    </Typography>
                  )}
                </div>
                <div className="text-right">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(refund.status)}`}>
                    {getStatusLabel(refund.status)}
                  </span>
                  <Typography variant="body1" className="font-bold text-[#FE3A8F] mt-2">
                    {refund.refund_amount?.toLocaleString() || refund.amount?.toLocaleString() || '0'}P
                  </Typography>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
