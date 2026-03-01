/**
 * useStreamChat - 스트림룸(보이스/비디오) 공통 채팅 로직
 * 낙관적 UI 업데이트 지원
 */

import { useAuth } from '@/hooks/useAuth'
import { getChatData, setChatData, type StreamChat } from '@/hooks/useVoiceRoom'
import { supabase } from '@/lib/supabase'
import { useCallback, useRef, useState } from 'react'

interface UseStreamChatOptions {
  roomId: string
  enableOptimisticUI?: boolean // 낙관적 UI 활성화 여부
}

export function useStreamChat({ roomId, enableOptimisticUI = false }: UseStreamChatOptions) {
  const { user } = useAuth()
  const [inputValue, setInputValue] = useState('')
  const [isSendingMessage, setIsSendingMessage] = useState(false)
  const isSendingRef = useRef(false)

  // 채팅 메시지 전송
  const sendMessage = useCallback(async () => {
    if (!inputValue.trim() || !user || !roomId || isSendingMessage || isSendingRef.current) return

    const messageContent = inputValue.trim()
    const tempMessageId = enableOptimisticUI
      ? `temp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
      : null

    // 낙관적 UI: 임시 메시지 생성 및 추가
    if (enableOptimisticUI && tempMessageId) {
      const tempMessage: StreamChat = {
        id: tempMessageId as any, // 임시 ID (문자열)
        room_id: roomId,
        sender_id: user.id,
        content: messageContent,
        chat_type: 'text',
        is_pinned: false,
        is_deleted: false,
        is_hidden: false,
        hidden_by: null,
        hidden_at: null,
        created_at: new Date().toISOString(),
        sender: {
          id: user.id,
          name: user.name || '사용자',
          profile_image: user.profile_image || null,
        },
      }

      // 즉시 UI에 임시 메시지 추가
      const currentChats = getChatData(roomId)
      const isDuplicate = currentChats.some(
        (msg) =>
          (typeof msg.id === 'string' && String(msg.id).startsWith('temp-')) &&
          msg.content === messageContent &&
          msg.sender_id === user.id &&
          Math.abs(
            new Date(msg.created_at).getTime() - new Date(tempMessage.created_at).getTime()
          ) < 1000
      )

      if (!isDuplicate) {
        setChatData(roomId, [...currentChats, tempMessage])
      }
    }

    // 입력 필드 즉시 비우기
    setInputValue('')
    setIsSendingMessage(true)
    isSendingRef.current = true

    try {
      // Supabase에 메시지 insert
      const streamChats = () => supabase.from('stream_chats') as any
      const { error } = await streamChats()
        .insert({
          room_id: roomId,
          sender_id: user.id,
          content: messageContent,
          chat_type: 'text',
        })

      if (error) throw error

      // 낙관적 UI: 임시 메시지는 제거하지 않음
      // Realtime에서 실제 메시지가 오면 중복 체크로 자동 처리됨
      // 임시 메시지는 일정 시간 후 자동 정리 (Realtime이 늦게 오는 경우 대비)
      if (enableOptimisticUI && tempMessageId) {
        setTimeout(() => {
          const currentChats = getChatData(roomId)
          // 임시 메시지가 아직 남아있고, 같은 내용의 실제 메시지가 있으면 제거
          const hasRealMessage = currentChats.some(
            (msg) =>
              typeof msg.id === 'number' &&
              msg.content === messageContent &&
              msg.sender_id === user.id
          )
          if (hasRealMessage) {
            const withoutTemp = currentChats.filter((msg) => msg.id !== tempMessageId)
            setChatData(roomId, withoutTemp)
          }
        }, 3000) // 3초 후 정리
      }
    } catch (err) {
      console.error('메시지 전송 실패:', err)

      // 낙관적 UI: 실패 시 임시 메시지 제거 및 입력 필드 복원
      if (enableOptimisticUI && tempMessageId) {
        const currentChats = getChatData(roomId)
        const withoutTemp = currentChats.filter((msg) => msg.id !== tempMessageId)
        setChatData(roomId, withoutTemp)
        setInputValue(messageContent)
      }

      // 사용자에게 에러 메시지 표시
      if (err instanceof Error) {
        alert(err.message || '메시지 전송에 실패했습니다')
      }
      throw err
    } finally {
      setIsSendingMessage(false)
      isSendingRef.current = false
    }
  }, [inputValue, user, roomId, isSendingMessage, enableOptimisticUI])

  return {
    inputValue,
    setInputValue,
    isSendingMessage,
    sendMessage,
  }
}
