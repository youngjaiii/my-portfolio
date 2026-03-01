import { Phone, PhoneOff, Minimize2, Maximize2 } from 'lucide-react'
import { useLiveKitCall } from '@/contexts/LiveKitVoiceCallProvider'
import { useEffect, useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from '@tanstack/react-router'
import { stopAllCallSounds } from '@/utils/callSounds'
import { supabase } from '@/lib/supabase'
import { Capacitor } from '@capacitor/core'

const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL

export function LiveKitIncomingCallModal() {
  const { incomingCall, callState, rejectCall } = useLiveKitCall()
  const navigate = useNavigate()
  const [isVisible, setIsVisible] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [position, setPosition] = useState({ x: 16, y: 100 })
  const [isProcessing, setIsProcessing] = useState(false)
  const constraintsRef = useRef<HTMLDivElement>(null)
  const platform = Capacitor.getPlatform()
  
  // 네이티브 환경에서는 시스템 알림 팝업 사용 (앱 내 팝업 표시 안함)
  const isNative = platform === 'android' || platform === 'ios'

  useEffect(() => {
    if (incomingCall && callState === 'receiving') {
      setIsVisible(true)
      setIsMinimized(false)
      
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.width = '100%'
      document.body.style.height = '100%'
      
      const scrollContainers = document.querySelectorAll('[class*="overflow-y-auto"], [class*="overflow-auto"]')
      scrollContainers.forEach((container) => {
        if (container instanceof HTMLElement) {
          container.style.overflow = 'hidden'
          container.style.touchAction = 'none'
        }
      })
    } else {
      setIsVisible(false)
      
      document.body.style.overflow = 'unset'
      document.body.style.position = 'unset'
      document.body.style.width = 'unset'
      document.body.style.height = 'unset'
      
      const scrollContainers = document.querySelectorAll('[class*="overflow-y-auto"], [class*="overflow-auto"]')
      scrollContainers.forEach((container) => {
        if (container instanceof HTMLElement) {
          container.style.overflow = ''
          container.style.touchAction = ''
        }
      })
    }

    return () => {
      document.body.style.overflow = 'unset'
      document.body.style.position = 'unset'
      document.body.style.width = 'unset'
      document.body.style.height = 'unset'
      
      const scrollContainers = document.querySelectorAll('[class*="overflow-y-auto"], [class*="overflow-auto"]')
      scrollContainers.forEach((container) => {
        if (container instanceof HTMLElement) {
          container.style.overflow = ''
          container.style.touchAction = ''
        }
      })
    }
  }, [incomingCall, callState])

  if (isNative || !isVisible || !incomingCall) {
    return null
  }

  const handleAnswer = async () => {
    if (isProcessing) return
    setIsProcessing(true)
    
    try {
      console.log('📞 [LiveKitIncoming] 통화 수락')
      stopAllCallSounds()
      
      // 수신자용 토큰 발급
      const { data: { session } } = await supabase.auth.getSession()
      const roomName = incomingCall.roomName || incomingCall.roomId
      
      const response = await fetch(`${EDGE_FUNCTIONS_URL}/functions/v1/api-livekit/token`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ roomName }),
      })
      
      const result = await response.json()
      if (!response.ok || result.error) {
        throw new Error(result.error || 'Token generation failed')
      }
      
      // /call 라우트로 이동 (incoming 모드)
      navigate({
        to: '/call',
        search: {
          mode: 'incoming',
          partnerId: incomingCall.from,
          partnerName: incomingCall.fromName,
          roomName: roomName,
          token: result.token,
          livekitUrl: incomingCall.url || result.url,
          callType: incomingCall.callType || 'voice',
        },
      })
      setIsVisible(false)
    } catch (error) {
      console.error('통화 응답 실패:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleReject = () => {
    if (isProcessing) return
    setIsProcessing(true)
    try {
      rejectCall()
      setIsVisible(false)
    } finally {
      setIsProcessing(false)
    }
  }

  // 최소화된 UI
  if (isMinimized) {
    return (
      <div ref={constraintsRef} className="fixed inset-0 z-[99999] pointer-events-none">
        <motion.div
          drag
          dragConstraints={constraintsRef}
          dragElastic={0.1}
          dragMomentum={false}
          className="pointer-events-auto absolute"
          style={{ x: position.x, y: position.y }}
          onDragEnd={(_, info) => {
            setPosition(prev => ({
              x: prev.x + info.offset.x,
              y: prev.y + info.offset.y
            }))
          }}
        >
          <div className="flex items-center gap-2 bg-gradient-to-r from-[#1a1825] to-[#110f1a] rounded-full px-3 py-2 shadow-2xl border border-[#FE3A8F]/50">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#FE3A8F] animate-ping" />
              <span className="text-white text-sm">
                {incomingCall.fromName}
              </span>
            </div>
            
            <button
              onClick={handleReject}
              disabled={isProcessing}
              className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center disabled:opacity-50"
            >
              <PhoneOff size={16} className="text-white" />
            </button>
            
            <button
              onClick={handleAnswer}
              disabled={isProcessing}
              className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center animate-pulse disabled:opacity-50"
            >
              <Phone size={16} className="text-white" />
            </button>
            
            <button
              onClick={() => setIsMinimized(false)}
              className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white"
            >
              <Maximize2 size={16} />
            </button>
          </div>
        </motion.div>
      </div>
    )
  }

  // 전체 화면 UI
  console.log('📲 [IncomingModal] RENDERING FULL UI - THIS SHOULD BE VISIBLE!')
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/80" style={{ zIndex: 999999999 }}>
      <div className="relative mx-4 w-full max-w-sm overflow-hidden rounded-3xl bg-[#110f1a] shadow-2xl">
        <button
          onClick={() => setIsMinimized(true)}
          className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
        >
          <Minimize2 size={20} />
        </button>

        <div className="relative h-32 bg-gradient-to-br from-[#FE3A8F] to-[#ff6b9d] flex items-center justify-center">
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 rounded-full bg-white animate-ping" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 rounded-full bg-white/50 animate-pulse" />
          </div>
          <div className="relative w-16 h-16 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
            <Phone size={32} className="text-white animate-bounce" />
          </div>
        </div>

        <div className="p-6 text-center">
          <h3 className="text-xl font-bold text-white mb-1">
            {incomingCall.fromName}
          </h3>
          <p className="text-gray-400 text-sm mb-6">
            {incomingCall.callType === 'video' ? '영상 통화 요청' : '음성 통화 요청'}
          </p>

          <div className="flex gap-4 justify-center">
            <button
              onClick={handleReject}
              disabled={isProcessing}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all duration-200 disabled:opacity-50 shadow-lg shadow-red-500/30"
            >
              <PhoneOff size={28} className="text-white" />
            </button>
            <button
              onClick={handleAnswer}
              disabled={isProcessing}
              className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-all duration-200 disabled:opacity-50 shadow-lg shadow-green-500/30 animate-pulse"
            >
              <Phone size={28} className="text-white" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

