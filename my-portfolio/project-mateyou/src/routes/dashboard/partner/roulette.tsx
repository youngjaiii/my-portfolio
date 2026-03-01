/**
 * 파트너 룰렛 관리 페이지
 * 
 * - 룰렛 활성화/비활성화
 * - 룰렛판 관리 (추가/수정/삭제)
 * - 아이템 관리
 */

import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { ArrowLeft, Bell, BarChart3 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePartnerRouletteSettings } from '@/hooks/usePartnerRouletteSettings'
import { useRouletteWheels } from '@/hooks/useRouletteWheels'
import { LoadingSpinner } from '@/components/ui'
import { RouletteWheelManager, RouletteSettingsToggle } from '@/components/features/partner/roulette'

export const Route = createFileRoute('/dashboard/partner/roulette')({
  component: PartnerRouletteManagementPage,
})

function PartnerRouletteManagementPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const {
    settings,
    isLoading: isLoadingSettings,
    updateSettings,
    isUpdating: isUpdatingSettings,
  } = usePartnerRouletteSettings({ partnerId: user?.id, enabled: !!user?.id })

  const {
    wheels,
    isLoading: isLoadingWheels,
  } = useRouletteWheels({ partnerId: user?.id || '', enabled: !!user?.id })

  // 유효한 룰렛판 (아이템이 있는 것)
  const validWheels = wheels.filter((w) => w.is_active && (w.items?.length ?? 0) > 0)

  const handleToggleEnabled = async () => {
    if (!settings?.is_enabled && validWheels.length === 0) {
      return // RouletteSettingsToggle에서 alert 처리
    }
    await updateSettings({ is_enabled: !settings?.is_enabled })
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-500">로그인이 필요합니다</p>
      </div>
    )
  }

  const isLoading = isLoadingSettings || isLoadingWheels

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-lg border-b border-gray-100">
        <div className="mx-auto max-w-2xl px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate({ to: '/dashboard/partner' })}
              className="p-2 -ml-2 rounded-xl hover:bg-gray-100 transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </button>
            <div className="flex-1">
              <h1 className="text-lg font-bold text-gray-900">🎰 룰렛 관리</h1>
            </div>
          </div>
        </div>
      </div>

      {/* 컨텐츠 */}
      <div className="mx-auto max-w-2xl px-4 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner />
          </div>
        ) : (
          <div className="space-y-6">
            {/* 활성화 토글 */}
            <RouletteSettingsToggle
              isEnabled={settings?.is_enabled ?? false}
              onToggle={handleToggleEnabled}
              isUpdating={isUpdatingSettings}
              hasValidWheels={validWheels.length > 0}
            />

            {/* 빠른 링크 */}
            <div className="grid grid-cols-2 gap-3">
              <Link
                to="/dashboard/partner/roulette-requests"
                className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                  <Bell className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">사용 요청</p>
                  <p className="text-xs text-gray-500">보상 사용 요청 관리</p>
                </div>
              </Link>
              <Link
                to="/dashboard/partner/inventory/roulette"
                className="flex items-center gap-3 p-4 bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                  <BarChart3 className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">당첨 관리</p>
                  <p className="text-xs text-gray-500">당첨 내역 확인</p>
                </div>
              </Link>
            </div>

            {/* 룰렛판 관리 */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
              <RouletteWheelManager partnerId={user.id} />
            </div>

            {/* 도움말 */}
            <HelpSection />
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// 서브 컴포넌트
// ============================================================

function HelpSection() {
  return (
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
  )
}
