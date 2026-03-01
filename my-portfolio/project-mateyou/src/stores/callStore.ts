import { create } from 'zustand'

interface MiniCallState {
  isMinimized: boolean
  partnerId: string
  partnerName: string
  callState: 'idle' | 'initializing' | 'connecting' | 'ringing' | 'connected' | 'ended'
  duration: number
  position: { x: number; y: number }
  livekitUrl: string
  roomName: string
  token: string
  callType?: 'voice' | 'video'
}

interface CallStore {
  miniCall: MiniCallState | null
  setMiniCall: (call: MiniCallState | null) => void
  updateMiniCall: (updates: Partial<MiniCallState>) => void
  setPosition: (position: { x: number; y: number }) => void
  incrementDuration: () => void
}

export const useCallStore = create<CallStore>((set) => ({
  miniCall: null,
  setMiniCall: (call) => set({ miniCall: call }),
  updateMiniCall: (updates) => set((state) => ({
    miniCall: state.miniCall ? { ...state.miniCall, ...updates } : null
  })),
  setPosition: (position) => set((state) => ({
    miniCall: state.miniCall ? { ...state.miniCall, position } : null
  })),
  incrementDuration: () => set((state) => ({
    miniCall: state.miniCall ? { ...state.miniCall, duration: state.miniCall.duration + 1 } : null
  })),
}))

