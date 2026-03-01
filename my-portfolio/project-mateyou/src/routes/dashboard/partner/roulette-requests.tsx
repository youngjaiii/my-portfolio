/**
 * 파트너 룰렛 사용 요청 관리 페이지
 * 모던 미니멀 디자인
 */

import { createFileRoute, useNavigate, Link } from '@tanstack/react-router';
import { ArrowLeft, Inbox } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePartnerRewardUsageRequests } from '@/hooks/usePartnerRewardUsageRequests';
import { PartnerRewardUsageRequestCard } from '@/components/features/inventory/roulette/PartnerRewardUsageRequestCard';
import { LoadingSpinner } from '@/components/ui';
import { toast } from 'sonner';

export const Route = createFileRoute('/dashboard/partner/roulette-requests')({
  component: PartnerRouletteRequestsPage,
});

function PartnerRouletteRequestsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const {
    requests,
    isLoading,
    error,
    approve,
    reject,
    isApproving,
    isRejecting,
    pendingCount,
  } = usePartnerRewardUsageRequests({
    partnerId: user?.id,
    enabled: true,
  });

  const handleApprove = async (usageLogId: string) => {
    try {
      await approve(usageLogId);
      toast.success('수락 완료');
    } catch (error: any) {
      toast.error(error.message || '수락에 실패했습니다');
    }
  };

  const handleReject = async (usageLogId: string, reason?: string) => {
    try {
      await reject({ usageLogId, reason });
      toast.success('거절 완료');
    } catch (error: any) {
      toast.error(error.message || '거절에 실패했습니다');
    }
  };

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-500">로그인이 필요합니다</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-lg border-b border-gray-100">
        <div className="mx-auto max-w-lg px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate({ to: '/dashboard/partner' })}
              className="p-2 -ml-2 rounded-xl hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-gray-900">사용 요청</h1>
            </div>
            {pendingCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 rounded-full">
                <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                <span className="text-sm font-semibold text-amber-700">{pendingCount}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 컨텐츠 */}
      <div className="mx-auto max-w-lg px-4 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <div className="py-20 text-center">
            <p className="text-red-500">오류가 발생했습니다</p>
          </div>
        ) : requests.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-3">
            {requests.map((request) => (
              <PartnerRewardUsageRequestCard
                key={request.id}
                request={request}
                onApprove={handleApprove}
                onReject={handleReject}
                isApproving={isApproving}
                isRejecting={isRejecting}
              />
            ))}
          </div>
        )}

        {/* 하단 링크 */}
        {requests.length > 0 && (
          <div className="mt-6 text-center">
            <Link
              to="/dashboard/partner/inventory/roulette"
              className="text-sm text-gray-500 hover:text-purple-600 transition-colors"
            >
              당첨 관리 바로가기 →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="py-20 text-center">
      <div className="mx-auto mb-5 w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center">
        <Inbox className="h-8 w-8 text-gray-400" />
      </div>
      <h2 className="text-lg font-semibold text-gray-900 mb-2">
        요청이 없어요
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        시청자가 보상 사용을 요청하면<br />여기에 표시됩니다
      </p>
      
      <Link
        to="/dashboard/partner/inventory/roulette"
        className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-purple-600 bg-purple-50 rounded-xl hover:bg-purple-100 transition-colors"
      >
        당첨 관리 보기
      </Link>
    </div>
  );
}
