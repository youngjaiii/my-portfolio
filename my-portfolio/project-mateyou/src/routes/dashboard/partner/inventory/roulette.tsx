/**
 * 파트너 룰렛 당첨 관리 페이지
 * 간결한 UI로 당첨자 목록 확인
 */

import type { PartnerRouletteInventoryItem } from '@/components/features/inventory/roulette/types';
import { LoadingSpinner, Typography } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { usePartnerRouletteInventory } from '@/hooks/usePartnerRouletteInventory';
import { cn } from '@/lib/utils';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Gift, Search } from 'lucide-react';
import { useState } from 'react';

export const Route = createFileRoute('/dashboard/partner/inventory/roulette')({
  component: PartnerRouletteInventoryPage,
});

type FilterType = 'all' | 'today' | 'week';

function PartnerRouletteInventoryPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const {
    items: inventoryItems,
    isLoading,
    error,
  } = usePartnerRouletteInventory({
    partnerId: user?.id,
    enabled: !!user?.id,
  });

  // 필터링
  const filteredItems = inventoryItems.filter((item) => {
    // 검색 필터
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (
        !item.donor_name?.toLowerCase().includes(query) &&
        !item.item_name?.toLowerCase().includes(query) &&
        !item.donor_member_code?.toLowerCase().includes(query)
      ) {
        return false;
      }
    }

    // 날짜 필터
    if (filter === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return new Date(item.won_at) >= today;
    }
    if (filter === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      return new Date(item.won_at) >= weekAgo;
    }

    return true;
  });

  // 통계
  const stats = {
    total: inventoryItems.length,
    today: inventoryItems.filter((item) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return new Date(item.won_at) >= today;
    }).length,
    totalDonation: inventoryItems.reduce((sum, item) => sum + (item.donation_amount || 0), 0),
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Typography variant="body1" className="text-gray-500">
          로그인이 필요합니다
        </Typography>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate({ to: '/dashboard/partner' })}
              className="p-2 -ml-2 hover:bg-gray-100 rounded-lg"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <Typography variant="h3" className="font-bold">
              🎁 당첨 관리
            </Typography>
          </div>
        </div>
      </div>

      {/* 통계 요약 */}
      <div className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex gap-4 text-center">
            <div className="flex-1">
              <p className="text-2xl font-bold text-purple-600">{stats.total}</p>
              <p className="text-xs text-gray-500">총 당첨</p>
            </div>
            <div className="flex-1 border-l">
              <p className="text-2xl font-bold text-green-600">{stats.today}</p>
              <p className="text-xs text-gray-500">오늘</p>
            </div>
            <div className="flex-1 border-l">
              <p className="text-2xl font-bold text-pink-600">{stats.totalDonation.toLocaleString()}</p>
              <p className="text-xs text-gray-500">총 후원 P</p>
            </div>
          </div>
        </div>
      </div>

      {/* 필터 & 검색 */}
      <div className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 py-2">
          <div className="flex items-center gap-2">
            {/* 날짜 필터 */}
            <div className="flex gap-1">
              {(['all', 'today', 'week'] as FilterType[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium rounded-full transition-colors",
                    filter === f
                      ? "bg-purple-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  )}
                >
                  {f === 'all' ? '전체' : f === 'today' ? '오늘' : '이번주'}
                </button>
              ))}
            </div>

            {/* 검색 */}
            <div className="flex-1 relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="이름, 아이템 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 당첨자 목록 */}
      <div className="max-w-2xl mx-auto px-4 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <Typography variant="body1" className="text-red-500">
              오류가 발생했습니다
            </Typography>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-12">
            <Gift className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <Typography variant="body1" className="text-gray-500">
              {searchQuery || filter !== 'all' ? '검색 결과가 없습니다' : '아직 당첨자가 없습니다'}
            </Typography>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredItems.map((item) => (
              <CompactInventoryCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// 간결한 당첨자 카드
function CompactInventoryCard({ item }: { item: PartnerRouletteInventoryItem }) {
  const timeAgo = getTimeAgo(item.won_at);

  return (
    <div className="bg-white rounded-lg border p-3 flex items-center gap-3">
      {/* 프로필 */}
      <div className="relative flex-shrink-0">
        <img
          src={
            item.donor_profile_image ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${item.donor_id}`
          }
          alt={item.donor_name}
          className="w-10 h-10 rounded-full object-cover"
        />
        <div
          className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs border-2 border-white"
          style={{ backgroundColor: item.item_color || '#FF6B6B' }}
        >
          🎁
        </div>
      </div>

      {/* 정보 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{item.donor_name}</span>
          {item.donor_member_code && (
            <span className="text-xs text-gray-400">@{item.donor_member_code}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-purple-600 font-medium truncate">
            {item.item_name}
          </span>
          {item.item_reward_value && (
            <>
              <span className="text-gray-300">·</span>
              <span className="text-xs text-gray-500 truncate">{item.item_reward_value}</span>
            </>
          )}
        </div>
      </div>

      {/* 후원 금액 & 시간 */}
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold text-pink-600">
          {(item.donation_amount ?? 0).toLocaleString()}P
        </p>
        <p className="text-xs text-gray-400">{timeAgo}</p>
      </div>
    </div>
  );
}

// 상대 시간 계산
function getTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return '방금';
  if (diffMins < 60) return `${diffMins}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 7) return `${diffDays}일 전`;

  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}
