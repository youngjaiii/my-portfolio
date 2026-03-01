import { useState, useEffect } from 'react'
import { Typography, Button } from '@/components'
import { useNotification } from '@/hooks/useNotification'
import { useInAppNotification } from '@/hooks/useInAppNotification'
import { usePushNotification } from '@/hooks/usePushNotification'
import { useIOSPWA } from '@/hooks/useIOSPWA'
import { IOSPWAInstallModal } from './IOSPWAInstallModal'
import { Capacitor } from '@capacitor/core'

interface NotificationPermissionBannerProps {
  onDismiss?: () => void
  className?: string
  id?: string // 중복 방지를 위한 고유 ID
}

export function NotificationPermissionBanner({
  onDismiss,
  className = '',
  id = 'default',
}: NotificationPermissionBannerProps) {
  const { permission, requestPermission, isSupported } = useNotification()
  const { addNotification } = useInAppNotification()
  const { registerPushSubscription } = usePushNotification()
  const { isIOS, isPWAInstalled, canInstallPWA } = useIOSPWA()
  const [isDismissed, setIsDismissed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const [showIOSModal, setShowIOSModal] = useState(false)

  // 로컬 스토리지에서 배너 해제 상태 확인 및 타이머 설정
  useEffect(() => {
    const dismissedKey = `notification-banner-dismissed-${id}`
    const dismissedTimeKey = `notification-banner-dismissed-time-${id}`
    const dismissed = localStorage.getItem(dismissedKey)
    const dismissedTime = localStorage.getItem(dismissedTimeKey)

    if (dismissed === 'true' && dismissedTime) {
      const timeDiff = Date.now() - parseInt(dismissedTime)
      const oneMinute = 60 * 1000 // 1분 = 60초 * 1000ms

      if (timeDiff < oneMinute) {
        setIsDismissed(true)

        // 남은 시간 후에 배너 다시 표시
        const remainingTime = oneMinute - timeDiff

        const timer = setTimeout(() => {
          localStorage.removeItem(dismissedKey)
          localStorage.removeItem(dismissedTimeKey)
          setIsDismissed(false)
          setIsVisible(false) // 애니메이션을 위해 먼저 false로 설정

          // 조금 뒤에 애니메이션과 함께 표시
          setTimeout(() => {
            setIsVisible(true)
          }, 100)
        }, remainingTime)

        return () => clearTimeout(timer)
      } else {
        // 1분이 지났으면 다시 표시하고 저장된 값 제거
        localStorage.removeItem(dismissedKey)
        localStorage.removeItem(dismissedTimeKey)
      }
    } else if (dismissed === 'true') {
      // 시간 정보가 없는 기존 데이터는 제거
      localStorage.removeItem(dismissedKey)
    }
  }, [id])

  // 애니메이션을 위한 효과
  useEffect(() => {
    // iOS에서 PWA 설치가 필요한 경우에도 배너 표시
    const shouldShowBanner = !isDismissed && (
      (isSupported && permission !== 'granted') ||
      (isIOS && canInstallPWA)
    )

    if (shouldShowBanner) {
      const timer = setTimeout(() => {
        setIsVisible(true)
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [isDismissed, isSupported, permission, isIOS, canInstallPWA])

  // iOS에서 PWA 미설치 상태면 배너 표시 (푸시 불가 안내)
  const showIOSPWAPrompt = isIOS && canInstallPWA
  
  // 네이티브 앱에서는 배너 숨김 (네이티브 푸시 사용)
  const isNative = Capacitor.isNativePlatform()

  // 알림이 이미 허용되어 있으면 배너 숨김 (denied 상태에서는 보여줌)
  // iOS PWA 미설치 상태에서는 항상 표시
  // 네이티브 앱에서는 항상 숨김
  if (
    isNative ||
    (!isSupported && !showIOSPWAPrompt) ||
    (permission === 'granted' && !showIOSPWAPrompt) ||
    isDismissed
  ) {
    return null
  }

  const handleEnableNotifications = async () => {
    // iOS에서 PWA 미설치 상태면 모달 표시
    if (showIOSPWAPrompt) {
      setShowIOSModal(true)
      return
    }

    setIsLoading(true)
    try {
      const granted = await requestPermission()
      if (granted) {
        // 권한 승인 후 푸시 구독 등록 (서비스 워커 + DB 저장)
        await registerPushSubscription()
        handleDismiss()
      }
    } catch (error) {
      console.warn('Failed to request notification permission:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDismiss = () => {
    setIsVisible(false)
    setTimeout(() => {
      setIsDismissed(true)
      localStorage.setItem(`notification-banner-dismissed-${id}`, 'true')
      localStorage.setItem(`notification-banner-dismissed-time-${id}`, Date.now().toString())
      onDismiss?.()
    }, 300)
  }

  const handleDeniedAction = async () => {
    // denied 상태에서는 바로 인앱 알림 활성화
    if (permission === 'denied') {
      localStorage.setItem('inapp-notifications-enabled', 'true')
      addNotification(
        '인앱 알림 활성화됨!',
        '브라우저 알림 대신 앱 내에서 메시지를 확인할 수 있습니다.',
        'system'
      )
      handleDismiss()
      return
    }

    setIsLoading(true)
    try {
      // default 상태에서만 권한 요청 시도
      const granted = await requestPermission()
      if (granted) {
        handleDismiss()
        return
      }

      // 실패하면 인앱 알림 활성화
      localStorage.setItem('inapp-notifications-enabled', 'true')
      addNotification(
        '인앱 알림 활성화됨!',
        '브라우저 알림이 안 되어 앱 내 알림으로 설정했습니다.',
        'system'
      )
      handleDismiss()
    } catch (error) {
      console.error('Notification setup failed:', error)
      // 에러 시에도 인앱 알림으로 대체
      localStorage.setItem('inapp-notifications-enabled', 'true')
      addNotification(
        '인앱 알림 활성화됨!',
        '브라우저 알림이 안 되어 앱 내 알림으로 설정했습니다.',
        'system'
      )
      handleDismiss()
    } finally {
      setIsLoading(false)
    }
  }

  // iOS용 배너 텍스트
  const bannerText = showIOSPWAPrompt
    ? '푸시 알림을 받으려면 앱을 설치해주세요.'
    : '원만한 소통을 위해 알람을 허용해주세요.'

  const buttonText = showIOSPWAPrompt ? '설치 방법' : '허용'

  return (
    <>
      <div
        className={`
          fixed bottom-18 left-4 right-4 mx-auto max-w-sm
          bg-white border border-gray-200 rounded-lg shadow-md
          transform transition-all duration-300 ease-out
          ${isVisible ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}
          ${className}
        `}
      >
        <div className="flex items-center gap-2 p-3">
          <div className="text-sm">{showIOSPWAPrompt ? '📱' : '🔔'}</div>

          <div className="flex-1">
            <Typography variant="body2" className="text-gray-900 font-medium text-xs">
              {bannerText}
            </Typography>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={permission === 'denied' ? handleDeniedAction : handleEnableNotifications}
              disabled={isLoading}
              className="
                bg-[#FE3A8F] hover:bg-[#FE3A8F]/90 text-white
                px-3 py-1.5 text-xs font-medium rounded-md
                transition-colors duration-200
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              {buttonText}
            </Button>

            <button
              onClick={handleDismiss}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* iOS PWA 설치 안내 모달 */}
      <IOSPWAInstallModal
        isOpen={showIOSModal}
        onClose={() => setShowIOSModal(false)}
      />
    </>
  )
}