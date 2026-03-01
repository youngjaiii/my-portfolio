import { createFileRoute, useNavigate, Link } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import { Loader2, Package } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { storeOrdersApi } from '@/api/store/orders';
import type { StoreOrder } from '@/api/store/orders';
import { Typography } from '@/components';

export const Route = createFileRoute('/store/orders/')({
  component: OrdersListPage,
});

function OrdersListPage() {
  const navigate = useNavigate();
  const { user, isLoading: userLoading } = useAuth();
  const [orders, setOrders] = useState<StoreOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

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
        
        // 필터 변환 (진행중/완료/취소)
        if (statusFilter === 'in_progress') {
          // 진행중: pending, paid, shipped, delivered
          // 서버에서 여러 상태를 한번에 조회할 수 없으므로 클라이언트에서 필터링
          params.status = undefined; // 모든 상태 조회
        } else if (statusFilter === 'completed') {
          params.status = 'confirmed';
        } else if (statusFilter === 'cancelled') {
          params.status = 'cancelled';
        } else if (statusFilter !== 'all') {
          params.status = statusFilter;
        }
        
        const response = await storeOrdersApi.getList(params);
        if (response.success && response.data) {
          let ordersData = Array.isArray(response.data) ? response.data : (response.data as any).orders || [];
          
          // 진행중 필터 적용
          if (statusFilter === 'in_progress') {
            ordersData = ordersData.filter((order: StoreOrder) => 
              ['pending', 'paid', 'shipped', 'delivered'].includes(order.status)
            );
          }
          
          setOrders(ordersData);
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
            내 주문
          </Typography>
        </div>
      </div>

      {/* 필터 */}
      <div className="bg-white px-4 py-3 border-b border-gray-200">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {[
            { key: 'all', label: '전체' },
            { key: 'in_progress', label: '진행중' },
            { key: 'completed', label: '완료' },
            { key: 'cancelled', label: '취소됨' },
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
          <Link
            to="/partners"
            className="text-[#FE3A8F] font-medium"
          >
            상품 둘러보기
          </Link>
        </div>
      ) : (
        <div className="p-4 space-y-3">
          {orders.map((order) => (
            <Link
              key={order.order_id}
              to="/store/orders/$orderId"
              params={{ orderId: order.order_id }}
              className="block bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <Typography variant="body2" className="text-gray-500 mb-1">
                    {new Date(order.created_at).toLocaleDateString('ko-KR')}
                  </Typography>
                  {order.product && (
                    <Typography variant="body1" className="font-medium mb-1">
                      {order.product.name}
                    </Typography>
                  )}
                  <div className="flex items-center gap-2">
                    {order.product && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                        {getProductTypeLabel(order.product.product_type)}
                      </span>
                    )}
                    <span className="text-xs text-gray-500">
                      수량: {order.quantity}개
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-2 justify-end mb-1">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(order.status)}`}>
                      {getStatusLabel(order.status)}
                    </span>
                    {(order as any).is_confirmed && (
                      <span className="px-2 py-1 rounded text-xs bg-green-100 text-green-700 font-medium">
                        확정
                      </span>
                    )}
                  </div>
                  <Typography variant="body1" className="font-bold text-[#FE3A8F] mt-1">
                    {order.total_amount.toLocaleString()}P
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
