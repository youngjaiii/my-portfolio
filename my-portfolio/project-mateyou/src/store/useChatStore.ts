import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface TempChatRoom {
  partnerId: string
  partnerName: string
  partnerAvatar?: string
  createdAt: string
}

interface ChatState {
  tempChatRooms: Array<TempChatRoom>
  addTempChatRoom: (room: Omit<TempChatRoom, 'createdAt'>) => void
  removeTempChatRoom: (partnerId: string) => void
  clearTempChatRooms: () => void
  getTempChatRoom: (partnerId: string) => TempChatRoom | undefined
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      tempChatRooms: [],

      addTempChatRoom: (room) => {
        const { tempChatRooms } = get()

        // 이미 있는지 확인
        const existing = tempChatRooms.find(
          (r) => r.partnerId === room.partnerId,
        )
        if (existing) return

        const newRoom: TempChatRoom = {
          ...room,
          createdAt: new Date().toISOString(),
        }

        set({
          tempChatRooms: [...tempChatRooms, newRoom],
        })
      },

      removeTempChatRoom: (partnerId) => {
        const { tempChatRooms } = get()
        set({
          tempChatRooms: tempChatRooms.filter(
            (room) => room.partnerId !== partnerId,
          ),
        })
      },

      clearTempChatRooms: () => {
        set({ tempChatRooms: [] })
      },

      getTempChatRoom: (partnerId) => {
        const { tempChatRooms } = get()
        return tempChatRooms.find((room) => room.partnerId === partnerId)
      },
    }),
    {
      name: 'chat-store',
      partialize: (state) => ({
        tempChatRooms: state.tempChatRooms,
      }),
    },
  ),
)
