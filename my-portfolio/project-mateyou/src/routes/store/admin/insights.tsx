import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, TrendingUp, Package, ShoppingBag, Truck, RotateCcw, Users, ChevronRight, Calendar, X, Search } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { storeOrdersApi } from '@/api/store/orders';
import { LoadingSpinner } from '@/components';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format, eachDayOfInterval, eachMonthOfInterval, eachYearOfInterval, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';

export const Route = createFileRoute('/store/admin/insights')({
  component: AdminInsightsPage,
});

interface ShipmentStatus {
  count: number;
  total_shipping_fee: number;
  by_period: Record<string, { count: number; shipping_fee: number }>;
}

interface RefundStatus {
  count: number;
  total_amount: number;
  by_period: Record<string, { count: number; amount: number }>;
}

interface ProductData {
  product_id: string;
  product_name: string;
  total_quantity: number;
  total_amount: number;
  by_period?: Record<string, { quantity: number; amount: number }>;
}

interface PartnerData {
  partner_id: string;
  partner_name: string;
  count: number;
  amount: number;
}

interface AdminStatsData {
  period: string;
  filter: { start_date: string; end_date: string; partner_id: string | null; product_id: string | null };
  summary: {
    total_orders: number;
    total_order_amount: number;
    total_revenue: number;
    total_revenue_count: number;
    total_refund_amount: number;
    net_revenue: number;
  };
  orders: {
    total: { count: number; amount: number };
    by_period: Record<string, { count: number; amount: number }>;
    by_partner?: PartnerData[];
  };
  products: ProductData[];
  partners: Array<{ id: string; partner_name: string }>;
  shipments: {
    pending: ShipmentStatus | number;
    shipped: ShipmentStatus | number;
    delivered: ShipmentStatus | number;
  };
  refunds: {
    pending: RefundStatus | number;
    approved: RefundStatus | number;
    rejected: RefundStatus | number;
    completed: RefundStatus | number;
  };
}

interface ChartDataPoint {
  label: string;
  orders: number;
  products: number;
  shipments: number;
  refunds: number;
}

const SERIES_CONFIG = [
  { key: 'orders', label: '주문', color: '#FE3A8F' },
  { key: 'products', label: '상품', color: '#3B82F6' },
  { key: 'shipments', label: '출고', color: '#10B981' },
  { key: 'refunds', label: '환불', color: '#F59E0B' },
] as const;

function generateAllPeriods(startDate: string, endDate: string, period: string): string[] {
  const start = parseISO(startDate.split('T')[0]);
  const end = parseISO(endDate.split('T')[0]);
  
  if (period === 'day') {
    return eachDayOfInterval({ start, end }).map(d => format(d, 'yyyy-MM-dd'));
  } else if (period === 'month') {
    return eachMonthOfInterval({ start, end }).map(d => format(d, 'yyyy-MM'));
  } else {
    return eachYearOfInterval({ start, end }).map(d => format(d, 'yyyy'));
  }
}

function MultiLineChart({ 
  data, 
  period 
}: { 
  data: ChartDataPoint[]; 
  period: string;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  if (data.length === 0) {
    return (
      <div className="h-56 flex items-center justify-center">
        <p className="text-gray-400 text-sm">데이터가 없습니다</p>
      </div>
    );
  }

  const allValues = data.flatMap(d => [d.orders, d.products, d.shipments, d.refunds]);
  const maxValue = Math.max(...allValues, 1);
  
  const chartHeight = 200;
  const chartWidth = 100;
  const padding = { top: 20, right: 10, bottom: 30, left: 10 };
  const innerHeight = chartHeight - padding.top - padding.bottom;
  const innerWidth = chartWidth - padding.left - padding.right;

  const getPoints = (seriesKey: keyof Omit<ChartDataPoint, 'label'>) => {
    return data.map((d, i) => {
      const x = padding.left + (i / Math.max(data.length - 1, 1)) * innerWidth;
      const value = d[seriesKey];
      const y = padding.top + innerHeight - (value / maxValue) * innerHeight;
      return { x, y, value, label: d.label };
    });
  };

  const createPath = (points: { x: number; y: number }[]) => {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  };

  const formatLabel = (label: string) => {
    if (period === 'day') {
      const parts = label.split('-');
      return `${parts[1]}/${parts[2]}`;
    }
    if (period === 'month') {
      const parts = label.split('-');
      return `${parts[0].slice(2)}/${parts[1]}`;
    }
    return label;
  };

  const labelStep = Math.max(1, Math.ceil(data.length / 7));

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * chartWidth;
    const index = Math.round(((x - padding.left) / innerWidth) * (data.length - 1));
    if (index >= 0 && index < data.length) {
      setHoveredIndex(index);
      setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
  };

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-3 mb-3 justify-center">
        {SERIES_CONFIG.map(({ key, label, color }) => (
          <div key={key} className="flex items-center gap-1">
            <div className="w-3 h-0.5 rounded" style={{ backgroundColor: color }} />
            <span className="text-xs text-gray-500">{label}</span>
          </div>
        ))}
      </div>

      <div className="relative">
        <svg 
          viewBox={`0 0 ${chartWidth} ${chartHeight}`} 
          className="w-full h-56" 
          preserveAspectRatio="none"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => (
            <line
              key={i}
              x1={padding.left}
              x2={chartWidth - padding.right}
              y1={padding.top + innerHeight * (1 - ratio)}
              y2={padding.top + innerHeight * (1 - ratio)}
              stroke="#e5e7eb"
              strokeWidth="0.3"
            />
          ))}

          {SERIES_CONFIG.map(({ key, color }) => {
            const points = getPoints(key as keyof Omit<ChartDataPoint, 'label'>);
            return (
              <path 
                key={key}
                d={createPath(points)} 
                fill="none" 
                stroke={color} 
                strokeWidth="0.6" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                opacity={hoveredIndex !== null ? 0.3 : 1}
              />
            );
          })}

          {hoveredIndex !== null && (
            <line
              x1={padding.left + (hoveredIndex / Math.max(data.length - 1, 1)) * innerWidth}
              x2={padding.left + (hoveredIndex / Math.max(data.length - 1, 1)) * innerWidth}
              y1={padding.top}
              y2={chartHeight - padding.bottom}
              stroke="#9CA3AF"
              strokeWidth="0.3"
              strokeDasharray="2,2"
            />
          )}

          {hoveredIndex !== null && SERIES_CONFIG.map(({ key, color }) => {
            const points = getPoints(key as keyof Omit<ChartDataPoint, 'label'>);
            const point = points[hoveredIndex];
            return (
              <circle 
                key={key}
                cx={point.x} 
                cy={point.y} 
                r="1.5" 
                fill={color}
                stroke="white"
                strokeWidth="0.5"
              />
            );
          })}
        </svg>

        {hoveredIndex !== null && (
          <div 
            className="absolute z-10 bg-white rounded-lg shadow-lg border border-gray-200 p-2 pointer-events-none"
            style={{
              left: tooltipPos.x > 150 ? tooltipPos.x - 120 : tooltipPos.x + 10,
              top: Math.max(10, tooltipPos.y - 80),
              minWidth: '100px'
            }}
          >
            <p className="text-xs font-medium text-gray-700 mb-1 border-b pb-1">
              {formatLabel(data[hoveredIndex].label)}
            </p>
            {SERIES_CONFIG.map(({ key, label, color }) => (
              <div key={key} className="flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-gray-500">{label}</span>
                </div>
                <span className="font-medium">{data[hoveredIndex][key as keyof Omit<ChartDataPoint, 'label'>].toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-between px-2 text-[10px] text-gray-400 mt-1">
        {data.map((d, i) => (
          i % labelStep === 0 || i === data.length - 1 ? (
            <span key={i} className="truncate text-center" style={{ width: `${100 / Math.ceil(data.length / labelStep)}%` }}>
              {formatLabel(d.label)}
            </span>
          ) : null
        )).filter(Boolean)}
      </div>
    </div>
  );
}

function AdminInsightsPage() {
  const navigate = useNavigate();
  const { user, isLoading: userLoading } = useAuth();
  const [stats, setStats] = useState<AdminStatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<'day' | 'month' | 'year'>('day');
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [appliedDateRange, setAppliedDateRange] = useState<DateRange | undefined>(undefined);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [showPartnerModal, setShowPartnerModal] = useState(false);
  const [showProductModal, setShowProductModal] = useState(false);
  const [partnerSearch, setPartnerSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: { period?: string; start_date?: string; end_date?: string; partner_id?: string } = { period };
      if (selectedPartnerId) params.partner_id = selectedPartnerId;
      if (appliedDateRange?.from) {
        params.start_date = format(appliedDateRange.from, 'yyyy-MM-dd');
        if (appliedDateRange.to) {
          params.end_date = format(appliedDateRange.to, 'yyyy-MM-dd');
        } else {
          params.end_date = params.start_date;
        }
      }
      const response = await storeOrdersApi.getAdminStats(params);
      if (response.success && response.data) {
        setStats(response.data as AdminStatsData);
      }
    } catch (err) {
      console.error('통계 조회 실패:', err);
    } finally {
      setIsLoading(false);
    }
  }, [period, selectedPartnerId, appliedDateRange]);

  useEffect(() => {
    if (userLoading) return;
    if (!user) {
      navigate({ to: '/login' });
      return;
    }
    fetchStats();
  }, [user?.id, userLoading, fetchStats]);

  const chartData = useMemo<ChartDataPoint[]>(() => {
    if (!stats?.filter?.start_date || !stats?.filter?.end_date) return [];
    
    const allPeriodLabels = generateAllPeriods(stats.filter.start_date, stats.filter.end_date, period);

    const getShipmentByPeriod = (status: ShipmentStatus | number | undefined) => {
      if (typeof status === 'object' && status?.by_period) return status.by_period;
      return {};
    };
    const getRefundByPeriod = (status: RefundStatus | number | undefined) => {
      if (typeof status === 'object' && status?.by_period) return status.by_period;
      return {};
    };
    
    return allPeriodLabels.map(label => {
      const ordersData = stats.orders?.by_period?.[label];
      const ordersAmount = ordersData?.amount || 0;

      let productsAmount = 0;
      stats.products?.forEach(p => {
        if (p.by_period?.[label]) {
          productsAmount += p.by_period[label].amount || 0;
        }
      });

      let shipmentsCount = 0;
      ['pending', 'shipped', 'delivered'].forEach(status => {
        const shipment = stats.shipments?.[status as keyof typeof stats.shipments];
        const byPeriod = getShipmentByPeriod(shipment);
        if (byPeriod[label]) {
          shipmentsCount += byPeriod[label].count || 0;
        }
      });

      let refundsCount = 0;
      ['pending', 'approved', 'rejected', 'completed'].forEach(status => {
        const refund = stats.refunds?.[status as keyof typeof stats.refunds];
        const byPeriod = getRefundByPeriod(refund);
        if (byPeriod[label]) {
          refundsCount += byPeriod[label].count || 0;
        }
      });

      return {
        label,
        orders: ordersAmount,
        products: productsAmount,
        shipments: shipmentsCount,
        refunds: refundsCount,
      };
    });
  }, [stats, period]);

  const partnerMaxAmount = useMemo(() => {
    if (!stats?.orders?.by_partner?.length) return 1;
    return Math.max(...stats.orders.by_partner.map(p => p.amount), 1);
  }, [stats]);

  const getStatusCount = (status: ShipmentStatus | RefundStatus | number | undefined): number => {
    if (typeof status === 'number') return status;
    if (status && typeof status === 'object' && 'count' in status) return status.count;
    return 0;
  };

  const clearDateRange = () => {
    setDateRange(undefined);
    setAppliedDateRange(undefined);
  };

  if (userLoading || isLoading) {
    return <LoadingSpinner />;
  }

  const shipmentPending = getStatusCount(stats?.shipments?.pending);
  const shipmentShipped = getStatusCount(stats?.shipments?.shipped);
  const shipmentDelivered = getStatusCount(stats?.shipments?.delivered);
  const refundPending = getStatusCount(stats?.refunds?.pending);
  const refundCompleted = getStatusCount(stats?.refunds?.completed);
  const refundRejected = getStatusCount(stats?.refunds?.rejected);

  return (
    <div className="min-h-screen bg-gray-50 pb-6 pt-14">
      <div className="p-4 space-y-4">
        {/* 기간 단위 필터 */}
        <div className="flex gap-2 items-center">
          <div className="flex gap-2 flex-1">
          {(['day', 'month', 'year'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                period === p ? 'bg-[#FE3A8F] text-white' : 'bg-white text-gray-600 border border-gray-200'
              }`}
            >
              {p === 'day' ? '일별' : p === 'month' ? '월별' : '연별'}
            </button>
          ))}
          </div>
          <button 
            type="button" 
            onClick={fetchStats} 
            className="p-2.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* 날짜 범위 선택 */}
        <div className="flex gap-2 items-center">
          <Popover open={isDatePickerOpen} onOpenChange={(open) => {
              if (open) setIsDatePickerOpen(true);
            }}>
            <PopoverTrigger asChild>
              <button className="flex-1 flex items-center gap-2 p-3 bg-white border border-gray-200 rounded-lg text-sm text-left">
                <Calendar className="h-4 w-4 text-gray-400" />
                {dateRange?.from ? (
                  <span>
                    {period === 'year' 
                      ? `${format(dateRange.from, 'yyyy')}년${dateRange.to ? ` ~ ${format(dateRange.to, 'yyyy')}년` : ''}`
                      : `${format(dateRange.from, 'yy.MM.dd', { locale: ko })}${dateRange.to ? ` ~ ${format(dateRange.to, 'yy.MM.dd', { locale: ko })}` : ''}`
                    }
                  </span>
                ) : (
                  <span className="text-gray-400">{period === 'year' ? '연도 범위 선택' : '날짜 범위 선택'}</span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent 
              className="w-auto p-0" 
              align="start"
              onPointerDownOutside={(e) => e.preventDefault()}
              onInteractOutside={(e) => e.preventDefault()}
            >
              <div className="p-3">
                {period === 'year' ? (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">시작 연도</label>
                      <select
                        value={dateRange?.from ? format(dateRange.from, 'yyyy') : ''}
                        onChange={(e) => {
                          const year = parseInt(e.target.value);
                          setDateRange(prev => ({
                            from: new Date(year, 0, 1),
                            to: prev?.to
                          }));
                        }}
                        className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                      >
                        <option value="">선택</option>
                        {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map(year => (
                          <option key={year} value={year}>{year}년</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">종료 연도</label>
                      <select
                        value={dateRange?.to ? format(dateRange.to, 'yyyy') : ''}
                        onChange={(e) => {
                          const year = parseInt(e.target.value);
                          setDateRange(prev => ({
                            from: prev?.from,
                            to: new Date(year, 11, 31)
                          }));
                        }}
                        className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                      >
                        <option value="">선택</option>
                        {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map(year => (
                          <option key={year} value={year}>{year}년</option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : (
                  <CalendarComponent
                    mode="range"
                    selected={dateRange}
                    onSelect={setDateRange}
                    locale={ko}
                    numberOfMonths={1}
                  />
                )}
                <div className="flex gap-2 mt-3 border-t pt-2">
                  <button
                    onClick={() => setIsDatePickerOpen(false)}
                    className="flex-1 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded"
                  >
                    취소
                  </button>
                  <button
                    onClick={() => {
                      setAppliedDateRange(dateRange);
                      setIsDatePickerOpen(false);
                    }}
                    disabled={!dateRange?.from || !dateRange?.to}
                    className="flex-1 py-2 text-sm bg-[#FE3A8F] text-white rounded disabled:opacity-50"
                  >
                    적용
                  </button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          {dateRange && (
            <button
              onClick={clearDateRange}
              className="p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              <X className="h-4 w-4 text-gray-400" />
            </button>
          )}
        </div>

        {/* 파트너 필터 */}
        {stats?.partners && stats.partners.length > 0 && (
          <select
            value={selectedPartnerId}
            onChange={(e) => setSelectedPartnerId(e.target.value)}
            className="w-full p-3 rounded-lg border border-gray-200 text-sm bg-white"
          >
            <option value="">전체 파트너</option>
            {stats.partners.map((p) => (
              <option key={p.id} value={p.id}>{p.partner_name}</option>
            ))}
          </select>
        )}

        {/* 조회 기간 표시 */}
        {stats?.filter && (
          <div className="text-xs text-gray-500 text-center">
            조회 기간: {stats.filter.start_date?.split('T')[0]} ~ {stats.filter.end_date?.split('T')[0]}
          </div>
        )}

        {/* 요약 카드 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <ShoppingBag className="h-4 w-4 text-[#FE3A8F]" />
              <span className="text-xs text-gray-500">총 주문</span>
            </div>
            <p className="text-xl font-bold">{stats?.summary?.total_orders || 0}건</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <span className="text-xs text-gray-500">순 매출</span>
            </div>
            <p className="text-xl font-bold text-green-600">{(stats?.summary?.net_revenue || 0).toLocaleString()}P</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <Package className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-gray-500">총 매출</span>
            </div>
            <p className="text-xl font-bold">{(stats?.summary?.total_order_amount || 0).toLocaleString()}P</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <RotateCcw className="h-4 w-4 text-red-500" />
              <span className="text-xs text-gray-500">환불액</span>
            </div>
            <p className="text-xl font-bold text-red-500">{(stats?.summary?.total_refund_amount || 0).toLocaleString()}P</p>
          </div>
        </div>

        {/* 통합 라인 차트 */}
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">기간별 추이</span>
            <span className="text-xs text-gray-400">{chartData.length}개 기간</span>
          </div>
          <MultiLineChart data={chartData} period={period} />
          <div className="grid grid-cols-4 gap-2 pt-3 border-t border-gray-100 mt-2">
            {SERIES_CONFIG.map(({ key, label, color }) => {
              const total = chartData.reduce((sum, d) => sum + d[key as keyof Omit<ChartDataPoint, 'label'>], 0);
              return (
                <div key={key} className="text-center">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-[10px] text-gray-500">{label}</span>
                  </div>
                  <p className="text-xs font-bold">{total.toLocaleString()}</p>
                </div>
              );
            })}
            </div>
        </div>

        {/* 파트너별 매출 */}
        {!selectedPartnerId && stats?.orders?.by_partner && stats.orders.by_partner.length > 0 && (
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium">파트너별 매출</span>
              </div>
              <span className="text-xs text-gray-400">{stats.orders.by_partner.length}명</span>
            </div>
            <div className="space-y-3">
              {stats.orders.by_partner.slice(0, 5).map((partner, idx) => (
                <button
                  key={partner.partner_id}
                  onClick={() => setSelectedPartnerId(partner.partner_id)}
                  className="w-full text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-4">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium truncate">{partner.partner_name}</p>
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-bold">{partner.amount.toLocaleString()}P</span>
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        </div>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-purple-400 rounded-full"
                          style={{ width: `${(partner.amount / partnerMaxAmount) * 100}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{partner.count}건</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            {stats.orders.by_partner.length > 5 && (
              <button
                onClick={() => setShowPartnerModal(true)}
                className="w-full mt-3 py-2 text-sm text-[#FE3A8F] hover:bg-pink-50 rounded-lg transition-colors"
              >
                더보기 ({stats.orders.by_partner.length - 5}명)
              </button>
            )}
          </div>
        )}

        {/* 상품별 매출 */}
        {stats?.products && stats.products.length > 0 && (
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium">상품별 매출</span>
              </div>
              <span className="text-xs text-gray-400">{stats.products.length}개</span>
            </div>
            <div className="space-y-3">
              {stats.products.slice(0, 5).map((product, idx) => {
                const productMax = Math.max(...stats.products.map(p => p.total_amount), 1);
                const widthPercent = (product.total_amount / productMax) * 100;
                return (
                  <div key={product.product_id}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-xs text-gray-400 w-4">{idx + 1}</span>
                        <p className="text-sm truncate">{product.product_name}</p>
                      </div>
                      <span className="text-sm font-bold ml-2">{product.total_amount.toLocaleString()}P</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-pink-400 to-pink-500 rounded-full"
                          style={{ width: `${widthPercent}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400 w-12 text-right">{product.total_quantity}개</span>
                    </div>
                  </div>
                );
              })}
            </div>
            {stats.products.length > 5 && (
              <button
                onClick={() => setShowProductModal(true)}
                className="w-full mt-3 py-2 text-sm text-[#FE3A8F] hover:bg-pink-50 rounded-lg transition-colors"
              >
                더보기 ({stats.products.length - 5}개)
              </button>
            )}
          </div>
        )}

        {/* 출고/환불 현황 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <Truck className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium">출고 현황</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-yellow-600">대기</span>
                <span className="font-medium">{shipmentPending}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-600">발송</span>
                <span className="font-medium">{shipmentShipped}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-600">완료</span>
                <span className="font-medium">{shipmentDelivered}</span>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <RotateCcw className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium">환불 현황</span>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-yellow-600">대기</span>
                <span className="font-medium">{refundPending}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-600">완료</span>
                <span className="font-medium">{refundCompleted}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-red-600">거절</span>
                <span className="font-medium">{refundRejected}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 파트너 전체 보기 모달 */}
      {showPartnerModal && stats?.orders?.by_partner && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setShowPartnerModal(false); setPartnerSearch(''); }} />
          <div className="relative w-full sm:max-w-md max-h-[80vh] bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden">
            <div className="sticky top-0 bg-white border-b p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">파트너별 매출</h3>
                <button onClick={() => { setShowPartnerModal(false); setPartnerSearch(''); }} className="p-1">
                  <X className="h-5 w-5 text-gray-400" />
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="파트너 검색..."
                  value={partnerSearch}
                  onChange={(e) => setPartnerSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
            </div>
            <div className="overflow-y-auto max-h-[60vh] p-4 space-y-3">
              {stats.orders.by_partner
                .filter(p => p.partner_name.toLowerCase().includes(partnerSearch.toLowerCase()))
                .map((partner, idx) => (
                <button
                  key={partner.partner_id}
                  onClick={() => { setSelectedPartnerId(partner.partner_id); setShowPartnerModal(false); setPartnerSearch(''); }}
                  className="w-full text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-4">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-medium truncate">{partner.partner_name}</p>
                        <div className="flex items-center gap-1">
                          <span className="text-sm font-bold">{partner.amount.toLocaleString()}P</span>
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        </div>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-purple-400 rounded-full"
                          style={{ width: `${(partner.amount / partnerMaxAmount) * 100}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{partner.count}건</p>
                    </div>
                  </div>
                </button>
              ))}
              {stats.orders.by_partner.filter(p => p.partner_name.toLowerCase().includes(partnerSearch.toLowerCase())).length === 0 && (
                <p className="text-center text-gray-400 text-sm py-8">검색 결과가 없습니다</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 상품 전체 보기 모달 */}
      {showProductModal && stats?.products && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setShowProductModal(false); setProductSearch(''); }} />
          <div className="relative w-full sm:max-w-md max-h-[80vh] bg-white rounded-t-2xl sm:rounded-2xl overflow-hidden">
            <div className="sticky top-0 bg-white border-b p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">상품별 매출</h3>
                <button onClick={() => { setShowProductModal(false); setProductSearch(''); }} className="p-1">
                  <X className="h-5 w-5 text-gray-400" />
                </button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="상품 검색..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm"
                />
              </div>
            </div>
            <div className="overflow-y-auto max-h-[60vh] p-4 space-y-3">
              {(() => {
                const filteredProducts = stats.products.filter(p => p.product_name.toLowerCase().includes(productSearch.toLowerCase()));
                const productMax = Math.max(...stats.products.map(p => p.total_amount), 1);
                return filteredProducts.length > 0 ? filteredProducts.map((product, idx) => {
                  const widthPercent = (product.total_amount / productMax) * 100;
                  return (
                    <div key={product.product_id}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-xs text-gray-400 w-4">{idx + 1}</span>
                          <p className="text-sm truncate">{product.product_name}</p>
                        </div>
                        <span className="text-sm font-bold ml-2">{product.total_amount.toLocaleString()}P</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-pink-400 to-pink-500 rounded-full"
                            style={{ width: `${widthPercent}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 w-12 text-right">{product.total_quantity}개</span>
                      </div>
                    </div>
                  );
                }) : <p className="text-center text-gray-400 text-sm py-8">검색 결과가 없습니다</p>;
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
