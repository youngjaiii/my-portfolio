/**
 * 사용자 룰렛 보관함 페이지
 * 새 기획: 2탭 구조 (보유 중 / 히스토리)
 */

import { useState, useMemo } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { 
  ArrowLeft, 
  ChevronRight, 
  Ticket,
  Clock,
  CheckCircle,
  XCircle,
  Trophy,
  Image as ImageIcon,
  FileText,
  ChevronDown,
  Sparkles,
  Send
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useUserRouletteInventory } from '@/hooks/useUserRouletteInventory';
import { useUserRouletteRewards } from '@/hooks/useUserRouletteRewards';
import { UseRewardModal } from '@/components/features/inventory/roulette/UseRewardModal';
import type { UserRouletteReward, UserRouletteInventoryItem } from '@/components/features/inventory/roulette/types';
import { LoadingSpinner, Button } from '@/components/ui';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/mypage/inventory/roulette')({
  component: UserRouletteInventoryPage,
});

type TabType = 'holding' | 'history';

// 상대 시간 포맷
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 60) return `${diffMins}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 7) return `${diffDays}일 전`;
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

// 사용형 아이템 카드 (컴팩트 버전)
function UsableRewardCard({ 
  reward, 
  onRequestUsage,
  isRequesting 
}: { 
  reward: UserRouletteReward;
  onRequestUsage: (id: string) => void;
  isRequesting: boolean;
}) {
  const canUse = reward.status === 'active' && reward.remaining_amount > 0 && !reward.is_expired;
  const isPending = reward.status === 'pending';

  return (
    <div className={cn(
      "rounded-xl border p-3 transition-all",
      isPending ? "border-amber-200 bg-amber-50/30" : "border-purple-100 bg-white"
    )}>
      <div className="flex items-center gap-3">
        <div className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
          isPending ? "bg-amber-100" : "bg-purple-100"
        )}>
          <Ticket className={cn("w-5 h-5", isPending ? "text-amber-600" : "text-purple-600")} />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900 text-sm truncate">{reward.reward_name}</h3>
            {isPending && (
              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-semibold rounded flex-shrink-0">
                대기중
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-400 truncate">{reward.partner_name}</p>
        </div>
        
        {canUse && (
          <button
            type="button"
            onClick={() => onRequestUsage(reward.id)}
            disabled={isRequesting}
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded-lg flex-shrink-0 disabled:opacity-50"
          >
            사용
          </button>
        )}
      </div>
    </div>
  );
}

// 히스토리 아이템 카드 (컴팩트)
function HistoryCard({ item }: { item: UserRouletteInventoryItem }) {
  const typeConfig = {
    text: { color: 'text-gray-400', bg: 'bg-gray-50' },
    usable: { color: 'text-purple-500', bg: 'bg-purple-50' },
    digital: { color: 'text-pink-500', bg: 'bg-pink-50' },
  };
  
  const config = typeConfig[item.item_reward_type as keyof typeof typeConfig] || typeConfig.text;
  
  return (
    <div className="flex items-center gap-2.5 py-2 border-b border-gray-50 last:border-0">
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-sm", config.bg)}>
        {item.item_reward_type === 'usable' ? '🎫' : item.item_reward_type === 'digital' ? '📷' : '🎁'}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{item.item_name}</p>
        <p className="text-[10px] text-gray-400">{item.partner_name} · {formatRelativeTime(item.won_at)}</p>
      </div>
    </div>
  );
}

function UserRouletteInventoryPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [activeTab, setActiveTab] = useState<TabType>('holding');
  const [showTextRewards, setShowTextRewards] = useState(false);
  
  // 사용 요청 모달 상태
  const [selectedReward, setSelectedReward] = useState<UserRouletteReward | null>(null);
  const [isUseModalOpen, setIsUseModalOpen] = useState(false);

  // 인벤토리 조회 (히스토리용)
  const {
    items: inventoryItems,
    isLoading: isLoadingInventory,
  } = useUserRouletteInventory({
    userId: user?.id,
    filters: { sort: 'latest' },
    enabled: true,
  });

  // 보상 조회
  const {
    rewards,
    isLoading: isLoadingRewards,
    requestUsage,
    isRequesting,
    usageLogs,
  } = useUserRouletteRewards({
    userId: user?.id,
    enabled: true,
  });

  // 사용 가능한 아이템 (active + pending만)
  const activeUsableRewards = useMemo(() => {
    return rewards.filter((r) => 
      r.reward_type === 'usable' && 
      (r.status === 'active' || r.status === 'pending')
    );
  }, [rewards]);

  // 사용 완료/거절된 아이템
  const usedRewards = useMemo(() => {
    return rewards.filter((r) => 
      r.reward_type === 'usable' && 
      (r.status === 'used' || r.status === 'rejected')
    );
  }, [rewards]);

  // 디지털 아이템
  const digitalRewards = useMemo(() => {
    return rewards.filter((r) => r.reward_type === 'digital' && r.digital_file_url);
  }, [rewards]);

  // 텍스트 당첨 (히스토리에서 text만)
  const textWins = useMemo(() => {
    return inventoryItems.filter((i) => i.item_reward_type === 'text');
  }, [inventoryItems]);

  // 통계
  const stats = useMemo(() => ({
    total: inventoryItems.length,
    usable: activeUsableRewards.length,
    digital: digitalRewards.length,
    pending: rewards.filter((r) => r.status === 'pending').length,
    used: usedRewards.length,
  }), [inventoryItems, activeUsableRewards, digitalRewards, rewards, usedRewards]);

  // 사용 완료 섹션 접기/펼치기
  const [showUsedRewards, setShowUsedRewards] = useState(false);

  // 사용 요청
  const handleRequestUsage = (rewardId: string) => {
    const reward = rewards.find((r) => r.id === rewardId);
    if (reward) {
      setSelectedReward(reward);
      setIsUseModalOpen(true);
    }
  };

  const handleSubmitUsage = async (params: {
    rewardId: string;
    usageType: string;
    amount: number;
    context: { message: string };
  }) => {
    try {
      await requestUsage({
        rewardId: params.rewardId,
        usageType: params.usageType,
        amount: params.amount,
        context: params.context,
      });
      toast.success('사용 요청이 완료되었습니다!');
    } catch (error: any) {
      toast.error(error.message || '사용 요청에 실패했습니다');
      throw error;
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">로그인이 필요합니다</p>
      </div>
    );
  }

  const isLoading = isLoadingInventory || isLoadingRewards;

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 via-white to-white">
      {/* 헤더 */}
      <div className="bg-white/80 backdrop-blur-lg border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate({ to: '/mypage' })}
              className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-purple-500" />
              <h1 className="text-lg font-bold text-gray-900">내 보관함</h1>
            </div>
          </div>
        </div>
      </div>

      {/* 탭 */}
      <div className="max-w-lg mx-auto px-4 py-2">
        <div className="bg-gray-100 rounded-xl p-0.5 flex">
          <button
            type="button"
            onClick={() => setActiveTab('holding')}
            className={cn(
              "flex-1 py-2 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1.5",
              activeTab === 'holding' 
                ? "bg-white text-purple-600 shadow-sm" 
                : "text-gray-500"
            )}
          >
            보유 중
            {stats.usable + stats.digital > 0 && (
              <span className="px-1.5 py-0.5 bg-purple-100 text-purple-600 text-[9px] font-bold rounded-full">
                {stats.usable + stats.digital}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={cn(
              "flex-1 py-2 text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1.5",
              activeTab === 'history' 
                ? "bg-white text-purple-600 shadow-sm" 
                : "text-gray-500"
            )}
          >
            히스토리
          </button>
        </div>
      </div>

      {/* 컨텐츠 */}
      <div className="max-w-lg mx-auto px-4 pb-24">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner />
          </div>
        ) : activeTab === 'holding' ? (
          /* ===== 보유 중 탭 ===== */
          <div className="space-y-6">
            {/* 사용 가능 아이템 섹션 */}
            <section>
              <div className="flex items-center gap-1.5 mb-2">
                <Ticket className="w-4 h-4 text-purple-600" />
                <h2 className="font-semibold text-gray-800 text-sm">사용 가능</h2>
                {activeUsableRewards.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-purple-100 text-purple-600 text-[10px] font-bold rounded-full">
                    {activeUsableRewards.length}
                  </span>
                )}
              </div>
              
              {activeUsableRewards.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-100 p-6 text-center">
                  <Ticket className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">사용 가능한 아이템이 없어요</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {activeUsableRewards.map((reward) => (
                    <UsableRewardCard
                      key={reward.id}
                      reward={reward}
                      onRequestUsage={handleRequestUsage}
                      isRequesting={isRequesting}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* 사용 완료 섹션 (접혀있음) */}
            {usedRewards.length > 0 && (
              <section>
                <button
                  type="button"
                  onClick={() => setShowUsedRewards(!showUsedRewards)}
                  className="w-full flex items-center justify-between py-1.5"
                >
                  <span className="text-xs text-gray-400">사용 완료 {usedRewards.length}개</span>
                  <ChevronDown className={cn(
                    "w-4 h-4 text-gray-400 transition-transform",
                    showUsedRewards && "rotate-180"
                  )} />
                </button>
                
                {showUsedRewards && (
                  <div className="space-y-1.5 mt-1">
                    {usedRewards.map((reward) => (
                      <div 
                        key={reward.id}
                        className="bg-gray-50 rounded-lg p-2 flex items-center gap-2 opacity-50"
                      >
                        <span className="text-sm">🎫</span>
                        <span className="flex-1 text-xs text-gray-500 truncate">{reward.reward_name}</span>
                        <span className="text-[9px] text-gray-400">
                          {reward.status === 'used' ? '완료' : '거절'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* 디지털 컬렉션 배너 - 컴팩트 */}
            {digitalRewards.length > 0 && (
              <section>
                <button
                  type="button"
                  onClick={() => navigate({ to: '/mypage/inventory/digital-collection' })}
                  className="w-full bg-gradient-to-r from-pink-500 to-purple-500 rounded-xl p-3 text-white flex items-center gap-3 hover:opacity-95 transition-all"
                >
                  <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-semibold text-sm">디지털 컬렉션</p>
                    <p className="text-[11px] text-white/80">사진 · 영상 {digitalRewards.length}개</p>
                  </div>
                  <ChevronRight className="w-5 h-5" />
                </button>
              </section>
            )}

            {/* 텍스트 당첨 (접혀있는 섹션) */}
            {textWins.length > 0 && (
              <section>
                <button
                  type="button"
                  onClick={() => setShowTextRewards(!showTextRewards)}
                  className="w-full flex items-center justify-between py-1.5"
                >
                  <span className="text-xs text-gray-400">기타 당첨 {textWins.length}개</span>
                  <ChevronDown className={cn(
                    "w-4 h-4 text-gray-400 transition-transform",
                    showTextRewards && "rotate-180"
                  )} />
                </button>
                
                {showTextRewards && (
                  <div className="bg-white rounded-lg border border-gray-100 mt-1">
                    {textWins.slice(0, 5).map((item) => (
                      <div key={item.id} className="px-3 py-2 flex items-center justify-between border-b border-gray-50 last:border-0">
                        <span className="text-xs text-gray-600 truncate">{item.item_name}</span>
                        <span className="text-[10px] text-gray-400">{formatRelativeTime(item.won_at)}</span>
                      </div>
                    ))}
                    {textWins.length > 5 && (
                      <div className="px-3 py-2 text-center text-[10px] text-gray-400">
                        +{textWins.length - 5}개 더
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}
          </div>
        ) : (
          /* ===== 히스토리 탭 ===== */
          <div>
            {/* 통계 요약 - 컴팩트 */}
            <div className="flex gap-2 mb-4">
              <div className="flex-1 bg-white rounded-lg p-2 text-center border border-gray-100">
                <p className="text-lg font-bold text-purple-600">{stats.total}</p>
                <p className="text-[9px] text-gray-400">당첨</p>
              </div>
              <div className="flex-1 bg-white rounded-lg p-2 text-center border border-gray-100">
                <p className="text-lg font-bold text-green-600">{stats.used}</p>
                <p className="text-[9px] text-gray-400">사용</p>
              </div>
              <div className="flex-1 bg-white rounded-lg p-2 text-center border border-gray-100">
                <p className="text-lg font-bold text-amber-600">{stats.pending}</p>
                <p className="text-[9px] text-gray-400">대기</p>
              </div>
            </div>

            {/* 당첨 내역 리스트 */}
            {inventoryItems.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 font-medium">아직 당첨 내역이 없어요</p>
                <p className="text-sm text-gray-400 mt-1">룰렛을 돌려 보상을 받아보세요!</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 px-4">
                {inventoryItems.map((item) => (
                  <HistoryCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 사용 요청 모달 */}
      <UseRewardModal
        open={isUseModalOpen}
        onClose={() => {
          setIsUseModalOpen(false);
          setSelectedReward(null);
        }}
        reward={selectedReward}
        onSubmit={handleSubmitUsage}
        isSubmitting={isRequesting}
      />
    </div>
  );
}
