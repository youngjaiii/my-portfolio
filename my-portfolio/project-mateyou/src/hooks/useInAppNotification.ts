import { useState, useCallback } from 'react'

interface InAppNotification {
  id: string
  title: string
  body: string
  type: 'message' | 'request' | 'system'
  timestamp: number
  read: boolean
}

export function useInAppNotification() {
  const [notifications, setNotifications] = useState<InAppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  // 새 알림 추가
  const addNotification = useCallback((
    title: string,
    body: string,
    type: 'message' | 'request' | 'system' = 'message'
  ) => {
    const newNotification: InAppNotification = {
      id: Date.now().toString(),
      title,
      body,
      type,
      timestamp: Date.now(),
      read: false
    }

    setNotifications(prev => [newNotification, ...prev])
    setUnreadCount(prev => prev + 1)

    // 로컬 스토리지에 저장
    const stored = localStorage.getItem('inapp-notifications')
    const existing = stored ? JSON.parse(stored) : []
    const updated = [newNotification, ...existing].slice(0, 50) // 최대 50개 보관
    localStorage.setItem('inapp-notifications', JSON.stringify(updated))

    return newNotification.id
  }, [])

  // 알림 읽음 처리
  const markAsRead = useCallback((id: string) => {
    setNotifications(prev =>
      prev.map(notif =>
        notif.id === id ? { ...notif, read: true } : notif
      )
    )
    setUnreadCount(prev => Math.max(0, prev - 1))

    // 로컬 스토리지 업데이트
    const stored = localStorage.getItem('inapp-notifications')
    if (stored) {
      const notifications = JSON.parse(stored)
      const updated = notifications.map((notif: InAppNotification) =>
        notif.id === id ? { ...notif, read: true } : notif
      )
      localStorage.setItem('inapp-notifications', JSON.stringify(updated))
    }
  }, [])

  // 모든 알림 읽음 처리
  const markAllAsRead = useCallback(() => {
    setNotifications(prev => prev.map(notif => ({ ...notif, read: true })))
    setUnreadCount(0)

    const stored = localStorage.getItem('inapp-notifications')
    if (stored) {
      const notifications = JSON.parse(stored)
      const updated = notifications.map((notif: InAppNotification) => ({ ...notif, read: true }))
      localStorage.setItem('inapp-notifications', JSON.stringify(updated))
    }
  }, [])

  // 알림 삭제
  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => {
      const notification = prev.find(n => n.id === id)
      if (notification && !notification.read) {
        setUnreadCount(count => Math.max(0, count - 1))
      }
      return prev.filter(notif => notif.id !== id)
    })

    const stored = localStorage.getItem('inapp-notifications')
    if (stored) {
      const notifications = JSON.parse(stored)
      const updated = notifications.filter((notif: InAppNotification) => notif.id !== id)
      localStorage.setItem('inapp-notifications', JSON.stringify(updated))
    }
  }, [])

  // 로컬 스토리지에서 알림 로드
  const loadNotifications = useCallback(() => {
    const stored = localStorage.getItem('inapp-notifications')
    if (stored) {
      const parsed: InAppNotification[] = JSON.parse(stored)
      setNotifications(parsed)
      setUnreadCount(parsed.filter(n => !n.read).length)
    }
  }, [])

  return {
    notifications,
    unreadCount,
    addNotification,
    markAsRead,
    markAllAsRead,
    removeNotification,
    loadNotifications
  }
}