/**
 * 파트너 대시보드 - 방송 관리 섹션
 * 아코디언 형태로 섹션별 접기/펼치기 지원
 */

import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Bell } from 'lucide-react';
import { AccordionSection, Button, Grid, Typography } from '@/components';
import { RouletteSettingsSheet } from '@/components/features/stream/roulette';
import { ObsDefaultSettings } from '@/components/features/stream/ObsDefaultSettings';
import { StreamKeyManager } from '@/components/features/stream/StreamKeyManager';
import { usePartnerRewardUsageRequests } from '@/hooks/usePartnerRewardUsageRequests';
import { cn } from '@/lib/utils';

interface StreamStats {
  totalDonations: number;
  recentRooms: Array<any>;
  topDonors: Array<{
    id: string;
    name: string;
    profileImage: string | null;
    total: number;
  }>;
  isLoading: boolean;
}

interface StreamManagementSectionProps {
  partnerId: string;
  userId: string;
  streamStats: StreamStats;
  isMobile: boolean;
}

type SectionKey = 'roulette' | 'broadcast' | 'stats';

export function StreamManagementSection({
  partnerId,
  userId,
  streamStats,
  isMobile,
}: StreamManagementSectionProps) {
  const navigate = useNavigate();
  const [isRouletteSettingsOpen, setIsRouletteSettingsOpen] = useState(false);
  
  // 섹션별 열림/닫힘 상태 (기본값: 룰렛만 열림)
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    roulette: true,
    broadcast: false,
    stats: false,
  });

  // 룰렛 사용 요청 대기 수
  const { pendingCount: rouletteRequestCount } = usePartnerRewardUsageRequests({
    partnerId: userId,
    enabled: !!userId,
  });

  const toggleSection = (key: SectionKey) => {
    setOpenSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  return (
    <div className="space-y-3">
      {/* 1. 룰렛 관리 섹션 */}
      <AccordionSection
        title="🎰 룰렛 관리"
        description="후원 룰렛 설정 및 사용 요청 관리"
        isOpen={openSections.roulette}
        onToggle={() => toggleSection('roulette')}
        badge={rouletteRequestCount > 0 ? rouletteRequestCount : undefined}
        badgeColor="red"
        highlight={rouletteRequestCount > 0}
      >
        {/* 사용 요청 알림 배너 */}
        {rouletteRequestCount > 0 && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
            <Bell className="h-5 w-5 flex-shrink-0 text-red-500" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">
                {rouletteRequestCount}건의 사용 요청이 대기 중입니다
              </p>
              <p className="text-xs text-red-600">
                시청자가 룰렛 보상 사용을 요청했습니다
              </p>
            </div>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => navigate({ to: '/dashboard/partner/roulette-requests' })}
            >
              확인하기
            </Button>
          </div>
        )}

        {/* 룰렛 액션 버튼들 */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <ActionButton
            icon="📮"
            label="사용 요청"
            badge={rouletteRequestCount}
            onClick={() => navigate({ to: '/dashboard/partner/roulette-requests' })}
          />
          <ActionButton
            icon="🎁"
            label="당첨 관리"
            onClick={() => navigate({ to: '/dashboard/partner/inventory/roulette' })}
          />
          <ActionButton
            icon="⚙️"
            label="룰렛 설정"
            onClick={() => setIsRouletteSettingsOpen(true)}
            primary
          />
        </div>

        {/* 안내 */}
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
          <p className="text-sm text-amber-800">
            <span className="font-medium">💡 Tip:</span> 룰렛을 활성화하면 시청자가 후원할 때 자동으로 룰렛이 돌아갑니다.
          </p>
        </div>
      </AccordionSection>

      {/* 2. 방송 설정 섹션 */}
      <AccordionSection
        title="📡 방송 설정"
        description="스트림 키, OBS 설정 관리"
        isOpen={openSections.broadcast}
        onToggle={() => toggleSection('broadcast')}
      >
        <div className="space-y-4">
          {/* HLS 스트림 키 */}
          <div className="rounded-lg border bg-gray-50 p-4">
            <Typography variant="body1" className="font-medium mb-3">
              🔑 HLS 스트림 키
            </Typography>
            <StreamKeyManager partnerId={partnerId} />
          </div>

          {/* OBS 기본 설정 */}
          <div className="rounded-lg border bg-gray-50 p-4">
            <Typography variant="body1" className="font-medium mb-3">
              ⚙️ OBS 기본 설정
            </Typography>
            <ObsDefaultSettings partnerId={partnerId} />
          </div>
        </div>
      </AccordionSection>

      {/* 3. 방송 통계 섹션 */}
      <AccordionSection
        title="📊 방송 통계"
        description="수익, 후원자, 방송 기록"
        isOpen={openSections.stats}
        onToggle={() => toggleSection('stats')}
      >
        {/* 통계 카드 */}
        <Grid cols={1} mdCols={isMobile ? 1 : 3} gap={isMobile ? 2 : 3} className="mb-4">
          <StatCard
            label="총 후원 수익"
            value={`${streamStats.totalDonations.toLocaleString()}P`}
            subLabel="방송에서 받은 누적 후원"
            color="pink"
          />
          <StatCard
            label="진행한 방송"
            value={`${streamStats.recentRooms.length}회`}
            subLabel="최근 5개 방송 기준"
          />
          <StatCard
            label="총 시청자 수"
            value={`${streamStats.recentRooms.reduce((sum, r) => sum + (r.total_viewers || 0), 0).toLocaleString()}명`}
            subLabel="누적 방문자 수"
          />
        </Grid>

        {/* 후원자 TOP 10 */}
        <div className="mb-4">
          <Typography variant="body1" className="font-medium mb-3">
            🏆 누적 후원자 TOP 10
          </Typography>
          {streamStats.isLoading ? (
            <div className="text-center py-6">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-pink-500 mx-auto" />
            </div>
          ) : streamStats.topDonors.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              아직 후원 기록이 없습니다
            </p>
          ) : (
            <div className="space-y-2">
              {streamStats.topDonors.slice(0, 5).map((donor, index) => (
                <div
                  key={donor.id}
                  className="flex items-center gap-3 p-2 rounded-lg bg-gray-50"
                >
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                    index === 0 ? "bg-yellow-400 text-yellow-900" :
                    index === 1 ? "bg-gray-300 text-gray-700" :
                    index === 2 ? "bg-amber-600 text-white" :
                    "bg-gray-200 text-gray-600"
                  )}>
                    {index + 1}
                  </div>
                  <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden flex-shrink-0">
                    {donor.profileImage ? (
                      <img src={donor.profileImage} alt={donor.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-500 text-sm">
                        {donor.name?.charAt(0) || '?'}
                      </div>
                    )}
                  </div>
                  <span className="flex-1 text-sm truncate">{donor.name}</span>
                  <span className="text-sm font-medium text-pink-600">
                    {donor.total.toLocaleString()}P
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 최근 방송 */}
        <div>
          <Typography variant="body1" className="font-medium mb-3">
            📺 최근 방송
          </Typography>
          {streamStats.isLoading ? (
            <div className="text-center py-6">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-pink-500 mx-auto" />
            </div>
          ) : streamStats.recentRooms.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">
              아직 방송 기록이 없습니다
            </p>
          ) : (
            <div className="space-y-2">
              {streamStats.recentRooms.slice(0, 3).map((room) => (
                <div
                  key={room.id}
                  className="flex items-center gap-3 p-2 rounded-lg border"
                >
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm",
                    room.stream_type === 'video' ? "bg-red-100" : "bg-blue-100"
                  )}>
                    {room.stream_type === 'video' ? '🎬' : '🎙️'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{room.title}</p>
                    <p className="text-xs text-gray-500">
                      {room.started_at
                        ? new Date(room.started_at).toLocaleDateString('ko-KR', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '시작 전'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-600">👥 {room.total_viewers || 0}</p>
                    <span className={cn(
                      "text-xs px-1.5 py-0.5 rounded-full",
                      room.status === 'live' ? "bg-red-100 text-red-600" :
                      room.status === 'ended' ? "bg-gray-100 text-gray-600" :
                      "bg-yellow-100 text-yellow-600"
                    )}>
                      {room.status === 'live' ? '방송 중' :
                       room.status === 'ended' ? '종료' : '예정'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </AccordionSection>

      {/* 룰렛 설정 시트 */}
      <RouletteSettingsSheet
        open={isRouletteSettingsOpen}
        onOpenChange={setIsRouletteSettingsOpen}
        partnerId={partnerId}
      />
    </div>
  );
}


// 액션 버튼 컴포넌트
interface ActionButtonProps {
  icon: string;
  label: string;
  badge?: number;
  onClick: () => void;
  primary?: boolean;
}

function ActionButton({ icon, label, badge, onClick, primary }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-center justify-center gap-1 p-3 rounded-lg border transition-colors",
        primary
          ? "bg-purple-600 text-white border-purple-600 hover:bg-purple-700"
          : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
      )}
    >
      <span className="text-xl">{icon}</span>
      <span className="text-xs font-medium">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-medium text-white">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

// 통계 카드 컴포넌트
interface StatCardProps {
  label: string;
  value: string;
  subLabel: string;
  color?: 'pink' | 'blue' | 'green';
}

function StatCard({ label, value, subLabel, color }: StatCardProps) {
  const valueColors = {
    pink: 'text-pink-600',
    blue: 'text-blue-600',
    green: 'text-green-600',
  };

  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className={cn(
        "text-xl font-bold mb-0.5",
        color ? valueColors[color] : "text-gray-900"
      )}>
        {value}
      </p>
      <p className="text-xs text-gray-400">{subLabel}</p>
    </div>
  );
}
