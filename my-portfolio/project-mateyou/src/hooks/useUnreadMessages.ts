import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'

interface UnreadMessage {
  partnerId: string
  count: number
  lastMessageTime: string
}

export function useUnreadMessages() {
  const { user } = useAuth()
  const [unreadMessages, setUnreadMessages] = useState<UnreadMessage[]>([])
  const [totalUnreadCount, setTotalUnreadCount] = useState(0)

  // 로컬 스토리지에서 읽지 않은 메시지 정보 로드
  useEffect(() => {
    if (!user?.id) return

    const storageKey = `unread-messages-${user.id}`
    const stored = localStorage.getItem(storageKey)

    if (stored) {
      try {
        const parsedMessages: UnreadMessage[] = JSON.parse(stored)
        setUnreadMessages(parsedMessages)
        updateTotalCount(parsedMessages)
      } catch (error) {
        console.error('Failed to parse unread messages:', error)
      }
    }
  }, [user?.id])

  // 총 읽지 않은 메시지 수 계산
  const updateTotalCount = (messages: UnreadMessage[]) => {
    const total = messages.reduce((sum, msg) => sum + msg.count, 0)
    setTotalUnreadCount(total)
  }

  // 새 메시지 추가
  const addUnreadMessage = useCallback((partnerId: string, count: number = 1) => {
    if (!user?.id) return

    setUnreadMessages(prev => {
      const existing = prev.find(msg => msg.partnerId === partnerId)
      let newMessages: UnreadMessage[]

      if (existing) {
        // 기존 파트너의 메시지 수를 덮어쓰기 (누적하지 않음)
        newMessages = prev.map(msg =>
          msg.partnerId === partnerId
            ? { ...msg, count: count, lastMessageTime: new Date().toISOString() }
            : msg
        )
      } else {
        // 새 파트너 추가
        newMessages = [
          ...prev,
          {
            partnerId,
            count,
            lastMessageTime: new Date().toISOString()
          }
        ]
      }

      // 로컬 스토리지에 저장
      const storageKey = `unread-messages-${user.id}`
      localStorage.setItem(storageKey, JSON.stringify(newMessages))

      updateTotalCount(newMessages)
      return newMessages
    })
  }, [user?.id])

  // 특정 파트너의 메시지 읽음 처리
  const markAsRead = useCallback((partnerId: string) => {
    if (!user?.id) return

    setUnreadMessages(prev => {
      const newMessages = prev.filter(msg => msg.partnerId !== partnerId)

      // 로컬 스토리지 업데이트
      const storageKey = `unread-messages-${user.id}`
      localStorage.setItem(storageKey, JSON.stringify(newMessages))

      updateTotalCount(newMessages)
      return newMessages
    })
  }, [user?.id])

  // 모든 메시지 읽음 처리
  const markAllAsRead = useCallback(() => {
    if (!user?.id) return

    setUnreadMessages([])
    setTotalUnreadCount(0)

    const storageKey = `unread-messages-${user.id}`
    localStorage.removeItem(storageKey)
  }, [user?.id])

  // 특정 파트너의 읽지 않은 메시지 수 가져오기
  const getUnreadCount = useCallback((partnerId: string) => {
    const message = unreadMessages.find(msg => msg.partnerId === partnerId)
    return message?.count || 0
  }, [unreadMessages])

  return {
    unreadMessages,
    totalUnreadCount,
    addUnreadMessage,
    markAsRead,
    markAllAsRead,
    getUnreadCount
  }
}