import { useGlobalVideoCall } from '@/contexts/GlobalVideoCallProvider'
import { Video, VideoOff } from 'lucide-react'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export function IncomingVideoCallModal() {
  const [isProcessing, setIsProcessing] = useState(false)
  const {
    callState,
    incomingCall,
    answerCall,
    rejectCall,
  } = useGlobalVideoCall()

  // 팝업 표시 시 모든 스크롤 컨테이너 lock
  useEffect(() => {
    if (callState === 'receiving' && incomingCall) {
      // body 스크롤 lock
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.width = '100%'
      document.body.style.height = '100%'
      
      // overflow-y-auto를 가진 모든 요소 lock
      const scrollContainers = document.querySelectorAll('[class*="overflow-y-auto"], [class*="overflow-auto"]')
      scrollContainers.forEach((container) => {
        if (container instanceof HTMLElement) {
          container.style.overflow = 'hidden'
          container.style.touchAction = 'none'
        }
      })
    } else {
      // 모든 스크롤 컨테이너 unlock
      document.body.style.overflow = 'unset'
      document.body.style.position = 'unset'
      document.body.style.width = 'unset'
      document.body.style.height = 'unset'
      
      // overflow-y-auto를 가진 모든 요소 unlock
      const scrollContainers = document.querySelectorAll('[class*="overflow-y-auto"], [class*="overflow-auto"]')
      scrollContainers.forEach((container) => {
        if (container instanceof HTMLElement) {
          container.style.overflow = ''
          container.style.touchAction = ''
        }
      })
    }

    return () => {
      // 컴포넌트 언마운트 시 스크롤 unlock
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
  }, [callState, incomingCall])

  const handleAnswer = async () => {
    if (isProcessing) return
    setIsProcessing(true)
    try {
      await answerCall()
    } catch (error) {
      console.error('영상통화 응답 실패:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleReject = () => {
    if (isProcessing) return
    setIsProcessing(true)
    try {
      rejectCall()
    } finally {
      setIsProcessing(false)
    }
  }

  // 수신 중인 영상통화가 있을 때만 표시
  if (callState !== 'receiving' || !incomingCall) {
    return null
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/90 backdrop-blur-md"
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="w-full max-w-sm mx-4 overflow-hidden rounded-3xl bg-gradient-to-b from-[#1a1825] to-[#110f1a] shadow-2xl border border-white/10"
        >
          {/* 상단 영역 */}
          <div className="pt-10 pb-6 px-6 text-center">
            {/* 비디오 아이콘 애니메이션 */}
            <div className="relative mx-auto w-28 h-28 mb-6">
              <motion.div
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.3, 0.6, 0.3],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="absolute inset-0 rounded-full bg-[#FE3A8F]/30"
              />
              <motion.div
                animate={{
                  scale: [1, 1.1, 1],
                  opacity: [0.5, 0.8, 0.5],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 0.2,
                }}
                className="absolute inset-2 rounded-full bg-[#FE3A8F]/50"
              />
              <div className="absolute inset-4 rounded-full bg-gradient-to-br from-[#FE3A8F] to-[#ff6b9d] flex items-center justify-center shadow-lg shadow-[#FE3A8F]/30">
                <span className="text-3xl font-bold text-white">
                  {incomingCall.fromName?.charAt(0)?.toUpperCase() || 'U'}
                </span>
              </div>
            </div>

            {/* 발신자 정보 */}
            <h3 className="text-xl font-bold text-white mb-2">
              {incomingCall.fromName}
            </h3>
            
            <div className="flex items-center justify-center gap-2">
              <Video size={18} className="text-[#FE3A8F] animate-pulse" />
              <span className="text-gray-400">영상통화 수신 중...</span>
            </div>
          </div>

          {/* 컨트롤 버튼 */}
          <div className="px-6 pb-10 pt-4">
            <div className="flex items-center justify-center gap-8">
              {/* 거절 버튼 */}
              <div className="flex flex-col items-center gap-2">
                <button
                  onClick={handleReject}
                  disabled={isProcessing}
                  className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all duration-200 disabled:opacity-50 shadow-lg shadow-red-500/40"
                >
                  <VideoOff size={28} className="text-white" />
                </button>
                <span className="text-sm text-gray-400">거절</span>
              </div>

              {/* 응답 버튼 */}
              <div className="flex flex-col items-center gap-2">
                <motion.button
                  onClick={handleAnswer}
                  disabled={isProcessing}
                  animate={{
                    scale: [1, 1.05, 1],
                  }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-colors duration-200 disabled:opacity-50 shadow-lg shadow-green-500/40"
                >
                  <Video size={28} className="text-white" />
                </motion.button>
                <span className="text-sm text-gray-400">응답</span>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

