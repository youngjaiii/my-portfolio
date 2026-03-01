/**
 * usePinChat - 채팅 메시지 고정/해제 훅
 */

import { edgeApi } from '@/lib/edgeApi'
import { useMutation, useQueryClient } from '@tanstack/react-query'

interface PinChatParams {
  messageId: number
  roomId: string
}

export function usePinChat() {
  const queryClient = useQueryClient()

  const togglePin = useMutation({
    mutationFn: async ({ messageId, roomId }: PinChatParams) => {
      const response = await edgeApi.streamChat.togglePin(messageId.toString())
      
      if (!response.success) {
        throw new Error(response.error?.message || '고정 처리에 실패했습니다')
      }

      return response.data as { is_pinned: boolean; message: string }
    },
    onSuccess: (_, variables) => {
      // 채팅 목록 갱신 (Realtime으로도 업데이트되지만 확실하게)
      queryClient.invalidateQueries({ queryKey: ['room-chats', variables.roomId] })
    },
  })

  return {
    togglePin,
  }
}

