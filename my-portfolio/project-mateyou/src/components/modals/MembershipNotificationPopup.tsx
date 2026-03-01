import { SlideSheet } from '@/components/ui/SlideSheet'
import { Button } from '@/components/ui/Button'
import { AlertCircle, CheckCircle, XCircle, AlertTriangle, ChevronRight } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { resolveAccessToken } from '@/utils/sessionToken'

const MEMBERSHIP_NOTIFICATION_STORAGE_KEY = 'membership_notification_data'
const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export type MembershipNotificationType = 
  | 'membership_expiry_reminder'
  | 'membership_renewed'
  | 'membership_renewal_failed'

// API 응답에서 받는 각 항목의 타입
export interface RenewedItem {
  subscription_id: string
  user_id: string
  user_name: string
  membership_id: string
  membership_name: string
  price: number
  new_expired_at: string
}

export interface RenewalFailedItem {
  subscription_id: string
  membership_name: string
  reason: string
}

export interface ExpiryNotifiedItem {
  subscription_id: string
  membership_name: string
  expired_at: string
}

// 전체 알림 데이터 구조
export interface MembershipNotificationData {
  renewed: RenewedItem[]
  renewal_failed: RenewalFailedItem[]
  expiry_notified: ExpiryNotifiedItem[]
  errors: string[]
  today?: string
  tomorrow?: string
}

interface MembershipNotificationPopupProps {
  isOpen: boolean
  onClose: () => void
  data: MembershipNotificationData | null
}

export function MembershipNotificationPopup({ isOpen, onClose, data }: MembershipNotificationPopupProps) {
  const navigate = useNavigate()

  if (!data) return null

  const hasRenewed = data.renewed && data.renewed.length > 0
  const hasRenewalFailed = data.renewal_failed && data.renewal_failed.length > 0
  const hasExpiryNotified = data.expiry_notified && data.expiry_notified.length > 0
  const hasErrors = data.errors && data.errors.length > 0

  const totalCount = 
    (data.renewed?.length || 0) + 
    (data.renewal_failed?.length || 0) + 
    (data.expiry_notified?.length || 0)

  if (totalCount === 0) return null

  // 알림 확인 처리 (백엔드에 dismiss 요청)
  const dismissNotifications = async () => {
    try {
      const token = await resolveAccessToken()
      if (!token) return

      // 각 알림 타입별 subscription_id 목록 수집
      const expirySubscriptionIds = data.expiry_notified?.map(item => item.subscription_id) || []
      const renewalFailedSubscriptionIds = data.renewal_failed?.map(item => item.subscription_id) || []
      const renewedSubscriptionIds = data.renewed?.map(item => item.subscription_id) || []
      
      const hasAnyNotifications = 
        expirySubscriptionIds.length > 0 || 
        renewalFailedSubscriptionIds.length > 0 || 
        renewedSubscriptionIds.length > 0

      if (hasAnyNotifications) {
        await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/cron-membership-renewal`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            expiry_subscription_ids: expirySubscriptionIds,
            renewal_failed_subscription_ids: renewalFailedSubscriptionIds,
            renewed_subscription_ids: renewedSubscriptionIds,
          }),
        })
        console.log('📬 멤버십 알림 확인 처리 완료:', {
          expiry: expirySubscriptionIds.length,
          renewal_failed: renewalFailedSubscriptionIds.length,
          renewed: renewedSubscriptionIds.length,
        })
      }
    } catch (error) {
      console.error('멤버십 알림 확인 처리 실패:', error)
    }
  }

  const handleClose = () => {
    dismissNotifications()
    onClose()
  }

  const handleGoToSubscriptions = () => {
    dismissNotifications()
    navigate({ to: '/mypage' })
    onClose()
  }

  const handleGoToCharge = () => {
    dismissNotifications()
    navigate({ to: '/mypage' })
    onClose()
  }

  // 가장 중요한 액션 버튼 결정
  const getPrimaryAction = () => {
    if (hasRenewalFailed) {
      return { text: '포인트 충전', action: handleGoToCharge }
    }
    if (hasExpiryNotified) {
      return { text: '구독 관리', action: handleGoToSubscriptions }
    }
    return { text: '확인', action: handleClose }
  }

  const primaryAction = getPrimaryAction()

  return (
    <SlideSheet
      isOpen={isOpen}
      onClose={handleClose}
      title="멤버십 알림"
      initialHeight={0.6}
      minHeight={0.4}
      maxHeight={0.85}
      zIndex={99998}
      footer={
        <div className="flex gap-2 px-4">
          <Button
            variant="outline"
            className="flex-1 rounded-full border-gray-300 text-gray-600"
            onClick={handleClose}
          >
            닫기
          </Button>
          <Button
            className="flex-1 rounded-full bg-[#FE3A8F] text-white hover:bg-[#E0357F]"
            onClick={primaryAction.action}
          >
            {primaryAction.text}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 px-2 pb-4">
        {/* 자동 연장 완료 섹션 */}
        {hasRenewed && (
          <div className="rounded-xl bg-green-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="bg-green-100 rounded-full p-1.5">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <h3 className="font-semibold text-green-800">
                자동 연장 완료 ({data.renewed.length}건)
              </h3>
            </div>
            <div className="space-y-2">
              {data.renewed.map((item) => (
                <div 
                  key={item.subscription_id}
                  className="bg-white rounded-lg p-3 flex items-center justify-between"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {item.membership_name}
                    </p>
                    <p className="text-sm text-gray-500">
                      {item.price.toLocaleString()}P 차감 · 다음 만료일 {item.new_expired_at}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 자동 연장 실패 섹션 */}
        {hasRenewalFailed && (
          <div className="rounded-xl bg-red-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="bg-red-100 rounded-full p-1.5">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
              <h3 className="font-semibold text-red-800">
                자동 연장 실패 ({data.renewal_failed.length}건)
              </h3>
            </div>
            <div className="space-y-2">
              {data.renewal_failed.map((item) => (
                <div 
                  key={item.subscription_id}
                  className="bg-white rounded-lg p-3"
                >
                  <p className="font-medium text-gray-900">
                    {item.membership_name}
                  </p>
                  <p className="text-sm text-red-600">
                    {item.reason}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm text-red-700">
              포인트를 충전하여 멤버십을 유지하세요.
            </p>
          </div>
        )}

        {/* 만료 예정 섹션 */}
        {hasExpiryNotified && (
          <div className="rounded-xl bg-yellow-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="bg-yellow-100 rounded-full p-1.5">
                <AlertCircle className="h-5 w-5 text-yellow-600" />
              </div>
              <h3 className="font-semibold text-yellow-800">
                만료 예정 ({data.expiry_notified.length}건)
              </h3>
            </div>
            <div className="space-y-2">
              {data.expiry_notified.map((item) => (
                <div 
                  key={item.subscription_id}
                  className="bg-white rounded-lg p-3 flex items-center justify-between"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {item.membership_name}
                    </p>
                    <p className="text-sm text-yellow-700">
                      {item.expired_at} 만료 예정
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
                </div>
              ))}
            </div>
            <p className="mt-3 text-sm text-yellow-700">
              자동 연장을 설정하면 편리하게 이용할 수 있습니다.
            </p>
          </div>
        )}

        {/* 에러 섹션 */}
        {hasErrors && (
          <div className="rounded-xl bg-gray-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="bg-gray-200 rounded-full p-1.5">
                <AlertTriangle className="h-5 w-5 text-gray-600" />
              </div>
              <h3 className="font-semibold text-gray-800">
                처리 중 오류 ({data.errors.length}건)
              </h3>
            </div>
            <div className="space-y-2">
              {data.errors.map((error, index) => (
                <div 
                  key={index}
                  className="bg-white rounded-lg p-3"
                >
                  <p className="text-sm text-gray-600">{error}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </SlideSheet>
  )
}

// 멤버십 알림 데이터 저장
export function saveMembershipNotificationData(data: MembershipNotificationData) {
  if (typeof window === 'undefined') return
  
  // 이미 표시된 알림인지 확인 (중복 방지)
  const existingData = getMembershipNotificationData()
  if (existingData) {
    // 기존 데이터와 병합
    const mergedData: MembershipNotificationData = {
      renewed: [...(existingData.renewed || []), ...(data.renewed || [])],
      renewal_failed: [...(existingData.renewal_failed || []), ...(data.renewal_failed || [])],
      expiry_notified: [...(existingData.expiry_notified || []), ...(data.expiry_notified || [])],
      errors: [...(existingData.errors || []), ...(data.errors || [])],
      today: data.today,
      tomorrow: data.tomorrow,
    }
    // 중복 제거
    mergedData.renewed = mergedData.renewed.filter((item, index, self) =>
      index === self.findIndex(t => t.subscription_id === item.subscription_id)
    )
    mergedData.renewal_failed = mergedData.renewal_failed.filter((item, index, self) =>
      index === self.findIndex(t => t.subscription_id === item.subscription_id)
    )
    mergedData.expiry_notified = mergedData.expiry_notified.filter((item, index, self) =>
      index === self.findIndex(t => t.subscription_id === item.subscription_id)
    )
    localStorage.setItem(MEMBERSHIP_NOTIFICATION_STORAGE_KEY, JSON.stringify(mergedData))
  } else {
    localStorage.setItem(MEMBERSHIP_NOTIFICATION_STORAGE_KEY, JSON.stringify(data))
  }
}

// 멤버십 알림 데이터 가져오기
export function getMembershipNotificationData(): MembershipNotificationData | null {
  if (typeof window === 'undefined') return null
  
  try {
    const stored = localStorage.getItem(MEMBERSHIP_NOTIFICATION_STORAGE_KEY)
    if (!stored) return null
    return JSON.parse(stored)
  } catch {
    return null
  }
}

// 멤버십 알림 데이터 삭제
export function clearMembershipNotificationData() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(MEMBERSHIP_NOTIFICATION_STORAGE_KEY)
}

// 알림이 있는지 확인
export function hasMembershipNotificationData(): boolean {
  const data = getMembershipNotificationData()
  if (!data) return false
  
  return (
    (data.renewed?.length || 0) > 0 ||
    (data.renewal_failed?.length || 0) > 0 ||
    (data.expiry_notified?.length || 0) > 0
  )
}
