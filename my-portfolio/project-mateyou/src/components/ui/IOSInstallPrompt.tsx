import { useState, useEffect } from 'react'
import { X, Share } from 'lucide-react'
import { useIOSPWA } from '@/hooks/useIOSPWA'

interface IOSInstallPromptProps {
  /** 배너를 언제 표시할지 (기본: 항상) */
  showCondition?: () => boolean
  /** 배너를 닫았을 때 며칠 동안 다시 표시하지 않을지 (기본: 7일) */
  hideDays?: number
}

/**
 * iOS Safari에서 "홈화면에 추가" 안내를 표시하는 배너
 *
 * iOS Safari는 프로그래밍 방식으로 홈화면 추가를 강제할 수 없으므로,
 * 사용자에게 수동으로 추가하는 방법을 안내합니다.
 */
export function IOSInstallPrompt({
  showCondition,
  hideDays = 7,
}: IOSInstallPromptProps) {
  const { isIOS, isInStandaloneMode, canInstall, iosVersion } = useIOSPWA()
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // 조건 확인
    if (!canInstall) {
      setIsVisible(false)
      return
    }

    // 사용자가 이전에 배너를 닫았는지 확인
    const dismissedAt = localStorage.getItem('ios-install-prompt-dismissed')
    if (dismissedAt) {
      const dismissedTime = parseInt(dismissedAt, 10)
      const now = Date.now()
      const daysPassed = (now - dismissedTime) / (1000 * 60 * 60 * 24)

      if (daysPassed < hideDays) {
        setIsVisible(false)
        return
      }
    }

    // 커스텀 조건이 있으면 확인
    if (showCondition && !showCondition()) {
      setIsVisible(false)
      return
    }

    setIsVisible(true)
  }, [canInstall, showCondition, hideDays])

  const handleDismiss = () => {
    setIsVisible(false)
    localStorage.setItem('ios-install-prompt-dismissed', Date.now().toString())
  }

  if (!isVisible) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg animate-slide-up">
      <div className="max-w-2xl mx-auto p-4">
        <div className="flex items-start gap-3">
          {/* 아이콘 */}
          <div className="flex-shrink-0 mt-1">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
              <img src="/favicon.png" alt="Mate You" className="w-8 h-8" />
            </div>
          </div>

          {/* 내용 */}
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-lg mb-1">
              📱 홈화면에 추가하세요
            </div>
            <div className="text-sm text-blue-100 mb-3">
              푸시 알림을 받으려면 Mate You를 홈화면에 추가해야 합니다.
            </div>

            {/* 설치 방법 */}
            <div className="bg-white/10 rounded-lg p-3 text-sm space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex-shrink-0 w-6 h-6 bg-white/20 rounded-full flex items-center justify-center text-xs font-bold">
                  1
                </span>
                <span>
                  Safari 하단의{' '}
                  <Share className="inline w-4 h-4 mx-1" />
                  <strong>공유</strong> 버튼을 누르세요
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex-shrink-0 w-6 h-6 bg-white/20 rounded-full flex items-center justify-center text-xs font-bold">
                  2
                </span>
                <span>
                  <strong>"홈 화면에 추가"</strong>를 선택하세요
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex-shrink-0 w-6 h-6 bg-white/20 rounded-full flex items-center justify-center text-xs font-bold">
                  3
                </span>
                <span>우측 상단의 <strong>"추가"</strong>를 누르세요</span>
              </div>
            </div>

            {/* iOS 버전 정보 */}
            {iosVersion && iosVersion < 16 && (
              <div className="mt-2 text-xs text-yellow-200">
                ⚠️ iOS {iosVersion} 버전에서는 Push 알림이 지원되지 않습니다. iOS 16.4 이상으로 업데이트하세요.
              </div>
            )}
          </div>

          {/* 닫기 버튼 */}
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 p-1 hover:bg-white/10 rounded transition-colors"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}
