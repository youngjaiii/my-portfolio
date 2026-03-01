import { useGlobalVideoCall } from '@/contexts/GlobalVideoCallProvider'
import { Mic, MicOff, VideoOff, Video, PhoneOff, Minimize2, Maximize2, SwitchCamera } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'

export function GlobalVideoCallUI() {
  const [isProcessing, setIsProcessing] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  const [isMinimized, setIsMinimized] = useState(false)
  const [position, setPosition] = useState({ x: 16, y: 100 })
  const constraintsRef = useRef<HTMLDivElement>(null)
  
  // 비디오 요소 refs
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const miniRemoteVideoRef = useRef<HTMLVideoElement>(null)

  const {
    callState,
    activeCall,
    localStream,
    remoteStream,
    endCall,
    isMuted,
    toggleMute,
    isCameraOff,
    toggleCamera,
    switchCamera,
  } = useGlobalVideoCall()

  // 로컬 비디오 스트림 연결
  useEffect(() => {
    const video = localVideoRef.current
    if (video && localStream) {
      if (video.srcObject !== localStream) {
        video.srcObject = localStream
      }
      // 이미 재생 중이 아닐 때만 play 호출
      if (video.paused) {
        video.play().catch(() => {})
      }
    }
  }, [localStream, isMinimized])

  // 원격 비디오 스트림 연결 (전체화면)
  useEffect(() => {
    const video = remoteVideoRef.current
    if (video && remoteStream) {
      if (video.srcObject !== remoteStream) {
        video.srcObject = remoteStream
      }
      if (video.paused) {
        video.play().catch(() => {})
      }
    }
  }, [remoteStream, isMinimized])

  // 원격 비디오 스트림 연결 (미니)
  useEffect(() => {
    const video = miniRemoteVideoRef.current
    if (video && remoteStream) {
      if (video.srcObject !== remoteStream) {
        video.srcObject = remoteStream
      }
      if (video.paused) {
        video.play().catch(() => {})
      }
    }
  }, [remoteStream, isMinimized])

  // 통화 시간 타이머
  useEffect(() => {
    if (callState !== 'connected') {
      setCallDuration(0)
      return
    }

    const interval = setInterval(() => {
      setCallDuration(prev => prev + 1)
    }, 1000)

    return () => clearInterval(interval)
  }, [callState])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  const handleEndCall = async () => {
    if (isProcessing) return
    setIsProcessing(true)
    try {
      await endCall()
    } finally {
      setIsProcessing(false)
    }
  }

  const handleToggleMute = () => {
    if (isProcessing) return
    toggleMute()
  }

  const handleToggleCamera = () => {
    if (isProcessing) return
    toggleCamera()
  }

  const handleSwitchCamera = async () => {
    if (isProcessing) return
    await switchCamera()
  }

  // 활성 영상통화 UI
  if (activeCall && (callState === 'calling' || callState === 'connected')) {
    // 최소화된 UI
    if (isMinimized) {
      return (
        <div ref={constraintsRef} className="fixed inset-0 z-[9998] pointer-events-none">
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
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20">
              {/* 미니 비디오 프리뷰 */}
              <div className="w-32 h-24 bg-black relative">
                <video
                  ref={miniRemoteVideoRef}
                  autoPlay
                  playsInline
                  muted={false}
                  className={`w-full h-full object-cover ${!remoteStream ? 'hidden' : ''}`}
                />
                {!remoteStream && (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#1a1825] to-[#110f1a]">
                    <span className="text-white text-lg font-bold">
                      {activeCall.partnerName?.charAt(0)?.toUpperCase() || 'U'}
                    </span>
                  </div>
                )}
                
                {/* 통화 상태 오버레이 */}
                <div className="absolute bottom-1 left-1 flex items-center gap-1 bg-black/60 rounded-full px-2 py-0.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${callState === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-[#FE3A8F] animate-bounce'}`} />
                  <span className="text-white text-xs font-mono">
                    {callState === 'connected' ? formatTime(callDuration) : '연결 중'}
                  </span>
                </div>
              </div>
              
              {/* 하단 컨트롤 */}
              <div className="absolute bottom-0 right-0 flex gap-1 p-1">
                <button
                  onClick={handleEndCall}
                  disabled={isProcessing}
                  className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center"
                >
                  <PhoneOff size={12} className="text-white" />
                </button>
                <button
                  onClick={() => setIsMinimized(false)}
                  className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-white"
                >
                  <Maximize2 size={12} />
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )
    }

    // 전체 화면 UI
    return (
      <div className="fixed inset-0 z-[9999] bg-black">
        {/* 원격 비디오 (전체 화면) */}
        <div className="absolute inset-0">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            muted={false}
            className={`w-full h-full object-cover ${!remoteStream ? 'hidden' : ''}`}
          />
          {!remoteStream && (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#1a1825] to-[#110f1a]">
              {/* 프로필 아바타 */}
              <div className="w-32 h-32 rounded-full bg-gradient-to-br from-[#FE3A8F] to-[#ff6b9d] flex items-center justify-center mb-6 shadow-lg shadow-[#FE3A8F]/30">
                <span className="text-5xl font-bold text-white">
                  {activeCall.partnerName?.charAt(0)?.toUpperCase() || 'U'}
                </span>
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">
                {activeCall.partnerName}
              </h3>
              {callState === 'calling' ? (
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-[#FE3A8F] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-[#FE3A8F] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-[#FE3A8F] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-gray-400">연결 중</span>
                </div>
              ) : (
                <span className="text-gray-400">영상 대기 중</span>
              )}
            </div>
          )}
        </div>

        {/* 로컬 비디오 (PIP) - 항상 거울 모드 */}
        <motion.div
          drag
          dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
          className="absolute top-4 right-4 w-28 h-40 rounded-xl overflow-hidden shadow-2xl border-2 border-white/20 z-10"
        >
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{ transform: 'scaleX(-1)' }}
            className={`w-full h-full object-cover ${(!localStream || isCameraOff) ? 'hidden' : ''}`}
          />
          {(!localStream || isCameraOff) && (
            <div className="w-full h-full flex items-center justify-center bg-gray-800">
              <VideoOff size={24} className="text-gray-400" />
            </div>
          )}
        </motion.div>

        {/* 최소화 버튼 */}
        <button
          onClick={() => setIsMinimized(true)}
          className="absolute top-4 left-4 z-10 w-10 h-10 rounded-full bg-black/40 flex items-center justify-center text-white hover:bg-black/60 transition-colors"
        >
          <Minimize2 size={20} />
        </button>

        {/* 상단 정보 */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
          <div className="flex items-center gap-2 bg-black/40 rounded-full px-4 py-2">
            <div className={`w-2 h-2 rounded-full ${callState === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-[#FE3A8F] animate-bounce'}`} />
            <span className="text-white text-sm font-medium">
              {activeCall.partnerName}
            </span>
            {callState === 'connected' && (
              <>
                <span className="text-white/50">·</span>
                <span className="text-white font-mono">{formatTime(callDuration)}</span>
              </>
            )}
          </div>
        </div>

        {/* 하단 컨트롤 */}
        <div className="absolute bottom-0 left-0 right-0 pb-safe">
          <div className="flex items-center justify-center gap-4 p-6 bg-gradient-to-t from-black/80 to-transparent">
            {/* 음소거 버튼 */}
            <button
              onClick={handleToggleMute}
              disabled={isProcessing}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 disabled:opacity-50 ${
                isMuted 
                  ? 'bg-red-500/20 border-2 border-red-500 text-red-500' 
                  : 'bg-white/10 border-2 border-white/20 text-white hover:bg-white/20'
              }`}
            >
              {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
            </button>

            {/* 카메라 전환 버튼 */}
            <button
              onClick={handleSwitchCamera}
              disabled={isProcessing || isCameraOff}
              className="w-14 h-14 rounded-full flex items-center justify-center bg-white/10 border-2 border-white/20 text-white hover:bg-white/20 transition-all duration-200 disabled:opacity-50"
            >
              <SwitchCamera size={24} />
            </button>

            {/* 통화 종료 버튼 */}
            <button
              onClick={handleEndCall}
              disabled={isProcessing}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all duration-200 disabled:opacity-50 shadow-lg shadow-red-500/40"
            >
              <PhoneOff size={28} className="text-white" />
            </button>

            {/* 카메라 on/off 버튼 */}
            <button
              onClick={handleToggleCamera}
              disabled={isProcessing}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 disabled:opacity-50 ${
                isCameraOff 
                  ? 'bg-red-500/20 border-2 border-red-500 text-red-500' 
                  : 'bg-white/10 border-2 border-white/20 text-white hover:bg-white/20'
              }`}
            >
              {isCameraOff ? <VideoOff size={24} /> : <Video size={24} />}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
