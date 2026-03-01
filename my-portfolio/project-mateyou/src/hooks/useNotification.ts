import { useCallback, useEffect } from 'react'

export function useNotification() {
  // 브라우저 환경 및 Notification API 지원 여부 체크
  const isSupported = typeof window !== 'undefined' && 'Notification' in window

  // 알림 권한 요청
  const requestPermission = useCallback(async () => {
    if (!isSupported) {
      return false
    }

    if (Notification.permission === 'granted') {
      return true
    }

    if (Notification.permission === 'denied') {
      return false
    }

    try {
      const permission = await Notification.requestPermission()
      return permission === 'granted'
    } catch (error) {
      console.warn('Notification permission request failed:', error)
      return false
    }
  }, [isSupported])

  // 알림 표시
  const showNotification = useCallback(
    async (title: string, options?: NotificationOptions) => {
      if (!isSupported) {
        return
      }

      if (Notification.permission !== 'granted') {
        const granted = await requestPermission()
        if (!granted) return
      }

      try {
        const notification = new Notification(title, {
          icon: '/favicon.png',
          badge: '/favicon.png',
          tag: 'chat-message', // 같은 태그의 알림은 하나만 표시
          ...options,
        })

        // 알림 클릭 시 창 포커스
        notification.onclick = () => {
          window.focus()
          notification.close()
        }

        // 5초 후 자동 닫기
        setTimeout(() => {
          notification.close()
        }, 5000)

        return notification
      } catch (error) {
        console.warn('Failed to show notification:', error)
      }
    },
    [requestPermission, isSupported],
  )

  // 페이지 로드 시 권한 요청
  useEffect(() => {
    if (!isSupported) return

    // 사용자가 이미 상호작용한 후에만 권한 요청
    const handleUserInteraction = () => {
      requestPermission()
      // 한 번만 실행
      document.removeEventListener('click', handleUserInteraction)
      document.removeEventListener('keydown', handleUserInteraction)
    }

    document.addEventListener('click', handleUserInteraction)
    document.addEventListener('keydown', handleUserInteraction)

    return () => {
      document.removeEventListener('click', handleUserInteraction)
      document.removeEventListener('keydown', handleUserInteraction)
    }
  }, [requestPermission, isSupported])

  return {
    showNotification,
    requestPermission,
    isSupported,
    permission:
      typeof window !== 'undefined' && isSupported ? Notification.permission : 'default',
  }
}
