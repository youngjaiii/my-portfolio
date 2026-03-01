/**
 * RouletteManagementSection - 파트너 대시보드 룰렛 관리 섹션
 * 
 * 방송과 별개로 룰렛 전체를 관리하는 독립 섹션
 * - 룰렛 활성화/비활성화
 * - 룰렛판 목록 관리
 * - 사용 요청/당첨 관리 빠른 링크
 */

import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Bell, Gift, BarChart3, Package } from 'lucide-react'
import { AccordionSection, Button } from '@/components'
import { usePartnerRouletteSettings } from '@/hooks/usePartnerRouletteSettings'
import { useRouletteWheels } from '@/hooks/useRouletteWheels'
import { usePartnerRewardUsageRequests } from '@/hooks/usePartnerRewardUsageRequests'
import { RouletteWheelManager, RouletteSettingsToggle } from '@/components/features/partner/roulette'
import { cn } from '@/lib/utils'

interface RouletteManagementSectionProps {
  partnerId: string
  isMobile: boolean
}

type SectionKey = 'overview' | 'wheels' | 'stats'

export function RouletteManagementSection({
  partnerId,
  isMobile,
}: RouletteManagementSectionProps) {
  const navigate = useNavigate()
  
  // 섹션 열림/닫힘 상태
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    overview: true,
    wheels: true,
    stats: false,
  })

  const toggleSection = (key: SectionKey) => {
    setOpenSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  // 데이터 로드
  const {
    settings,
    isLoading: isLoadingSettings,
    updateSettings,
    isUpdating: isUpdatingSettings,
  } = usePartnerRouletteSettings({ partnerId, enabled: !!partnerId })

  const {
    wheels,
    isLoading: isLoadingWheels,
  } = useRouletteWheels({ partnerId, wheelType: 'profile', enabled: !!partnerId })

  const { pendingCount: requestCount } = usePartnerRewardUsageRequests({
    partnerId,
    enabled: !!partnerId,
  })

  // 유효한 룰렛판 (아이템이 있는 것)
  const validWheels = wheels.filter((w) => w.is_active && (w.items?.length ?? 0) > 0)
  const totalItems = wheels.reduce((sum, w) => sum + (w.items?.length ?? 0), 0)

  const handleToggleEnabled = async () => {
    if (!settings?.is_enabled && validWheels.length === 0) {
      return
    }
    await updateSettings({ is_enabled: !settings?.is_enabled })
  }

  return (
    <div className="space-y-3">
      {/* 1. 개요 섹션 */}
      <AccordionSection
        title="🎰 룰렛 개요"
        description="활성화 및 빠른 액션"
        isOpen={openSections.overview}
        onToggle={() => toggleSection('overview')}
        badge={requestCount > 0 ? requestCount : undefined}
        badgeColor="red"
      >
        {/* 활성화 토글 */}
        <div className="mb-4">
          <RouletteSettingsToggle
            isEnabled={settings?.is_enabled ?? false}
            onToggle={handleToggleEnabled}
            isUpdating={isUpdatingSettings}
            hasValidWheels={validWheels.length > 0}
          />
        </div>

        {/* 사용 요청 알림 배너 */}
        {requestCount > 0 && (
          <div className="mb-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
            <Bell className="h-5 w-5 flex-shrink-0 text-red-500" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800">
                {requestCount}건의 사용 요청이 대기 중입니다
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

        {/* 통계 카드 */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <StatCard
            icon={<Package className="h-5 w-5 text-purple-500" />}
            label="룰렛판"
            value={wheels.length}
            subtext={`활성 ${validWheels.length}개`}
          />
          <StatCard
            icon={<Gift className="h-5 w-5 text-pink-500" />}
            label="아이템"
            value={totalItems}
            subtext="전체 상품"
          />
          <StatCard
            icon={<Bell className="h-5 w-5 text-amber-500" />}
            label="대기 요청"
            value={requestCount}
            subtext="사용 요청"
            highlight={requestCount > 0}
          />
        </div>

        {/* 빠른 링크 */}
        <div className="grid grid-cols-2 gap-2">
          <QuickLinkButton
            icon={<Bell className="h-4 w-4" />}
            label="사용 요청"
            badge={requestCount}
            onClick={() => navigate({ to: '/dashboard/partner/roulette-requests' })}
          />
          <QuickLinkButton
            icon={<BarChart3 className="h-4 w-4" />}
            label="당첨 관리"
            onClick={() => navigate({ to: '/dashboard/partner/inventory/roulette' })}
          />
        </div>
      </AccordionSection>

      {/* 2. 룰렛판 관리 섹션 */}
      <AccordionSection
        title="🎡 룰렛판 관리"
        description="룰렛판 및 아이템 설정"
        isOpen={openSections.wheels}
        onToggle={() => toggleSection('wheels')}
      >
        <RouletteWheelManager partnerId={partnerId} wheelType="profile" />
      </AccordionSection>

      {/* 3. 도움말 */}
      <div className="rounded-xl bg-gradient-to-br from-purple-50 to-pink-50 p-4 border border-purple-100">
        <h3 className="font-semibold text-purple-900 mb-2">💡 룰렛 사용 팁</h3>
        <ul className="space-y-1.5 text-sm text-purple-800">
          <li className="flex items-start gap-2">
            <span className="text-purple-400">•</span>
            <span>각 룰렛판은 고정 금액으로 후원 시 사용됩니다</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-purple-400">•</span>
            <span>가중치가 높을수록 당첨 확률이 높아집니다</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-purple-400">•</span>
            <span>수량 제한을 설정하면 특별한 보상을 만들 수 있습니다</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-purple-400">•</span>
            <span>디지털 보상은 당첨 즉시 시청자에게 전달됩니다</span>
          </li>
        </ul>
      </div>
    </div>
  )
}

// ============================================================
// 서브 컴포넌트
// ============================================================

interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: number
  subtext: string
  highlight?: boolean
}

function StatCard({ icon, label, value, subtext, highlight }: StatCardProps) {
  return (
    <div className={cn(
      "p-3 rounded-xl border bg-gray-50 text-center",
      highlight && "bg-amber-50 border-amber-200"
    )}>
      <div className="flex justify-center mb-1">{icon}</div>
      <p className="text-xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500">{subtext}</p>
    </div>
  )
}

interface QuickLinkButtonProps {
  icon: React.ReactNode
  label: string
  badge?: number
  onClick: () => void
}

function QuickLinkButton({ icon, label, badge, onClick }: QuickLinkButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center gap-2 p-3 bg-gray-50 rounded-xl border border-gray-200 hover:bg-gray-100 transition-colors"
    >
      {icon}
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="px-1.5 py-0.5 text-xs font-bold text-white bg-red-500 rounded-full">
          {badge}
        </span>
      )}
    </button>
  )
}
