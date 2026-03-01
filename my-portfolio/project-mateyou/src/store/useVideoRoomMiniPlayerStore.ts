import { create } from 'zustand'

interface VideoRoomMiniPlayerState {
  activeRoomId: string | null
  open: (roomId: string) => void
  close: () => void
}

export const useVideoRoomMiniPlayerStore = create<VideoRoomMiniPlayerState>((set) => ({
  activeRoomId: null,
  open: (roomId) => set({ activeRoomId: roomId }),
  close: () => set({ activeRoomId: null }),
}))

