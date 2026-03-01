import { useGlobalVoiceCall } from '@/contexts/GlobalVoiceCallProvider'
import { Mic, MicOff, PhoneOff, Minimize2, Maximize2, Volume2, Phone, VolumeX, Volume1 } from 'lucide-react'
import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'

export function GlobalVoiceCallUI() {
  const [isProcessing, setIsProcessing] = useState(false)
  const [callDuration, setCallDuration] = useState(0)
  const [isMinimized, setIsMinimized] = useState(false)
  const [position, setPosition] = useState({ x: 16, y: 100 })
  const [volume, setVolume] = useState(1.0) // 볼륨 상태 (0~1)
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)
  const constraintsRef = useRef<HTMLDivElement>(null)
  const volumeTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const {
    callState,
    activeCall,
    remoteStream,
    endCall,
    isMuted,
    toggleMute,
    isSpeakerOn,
    toggleSpeaker,
  } = useGlobalVoiceCall()

  // 볼륨 변경 핸들러
  const handleVolumeChange = useCallback((newVolume: number) => {
    setVolume(newVolume)
    // 오디오 엘리먼트 볼륨 직접 조절
    const audioElement = document.getElementById('remoteAudio') as HTMLAudioElement
    if (audioElement) {
      audioElement.volume = newVolume
    }
    // 볼륨 슬라이더 자동 숨김 타이머 리셋
    if (volumeTimeoutRef.current) {
      clearTimeout(volumeTimeoutRef.current)
    }
    volumeTimeoutRef.current = setTimeout(() => {
      setShowVolumeSlider(false)
    }, 3000)
  }, [])

  // 볼륨 슬라이더 토글
  const toggleVolumeSlider = useCallback(() => {
    setShowVolumeSlider(prev => !prev)
    if (!showVolumeSlider) {
      // 3초 후 자동 숨김
      if (volumeTimeoutRef.current) {
        clearTimeout(volumeTimeoutRef.current)
      }
      volumeTimeoutRef.current = setTimeout(() => {
        setShowVolumeSlider(false)
      }, 3000)
    }
  }, [showVolumeSlider])

  // 볼륨 아이콘 선택
  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2

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

  const handleToggleSpeaker = async () => {
    if (isProcessing) return
    await toggleSpeaker()
  }

  // 활성 통화 UI (통화 요청 UI는 IncomingCallModal에서 처리)
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
            <div className="flex items-center gap-2 bg-gradient-to-r from-[#1a1825] to-[#110f1a] rounded-full px-3 py-2 shadow-2xl border border-white/20">
              {/* 통화 시간 또는 연결 중 */}
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${callState === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-[#FE3A8F] animate-bounce'}`} />
                <span className="text-white text-sm font-mono">
                  {callState === 'connected' ? formatTime(callDuration) : '연결 중'}
                </span>
              </div>
              
              {/* 스피커폰 토글 */}
              <button
                onClick={handleToggleSpeaker}
                className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  isSpeakerOn ? 'bg-[#FE3A8F] text-white' : 'bg-white/20 text-white'
                }`}
                title={isSpeakerOn ? '스피커폰' : '귀대고 통화'}
              >
                {isSpeakerOn ? <Volume2 size={16} /> : <Phone size={16} />}
              </button>

              {/* 음소거 토글 */}
              <button
                onClick={handleToggleMute}
                className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  isMuted ? 'bg-red-500 text-white' : 'bg-white/20 text-white'
                }`}
              >
                {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
              
              {/* 통화 종료 */}
              <button
                onClick={handleEndCall}
                disabled={isProcessing}
                className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center"
              >
                <PhoneOff size={16} className="text-white" />
              </button>
              
              {/* 확대 버튼 */}
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
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md">
        <div className="relative mx-4 w-full max-w-sm overflow-hidden rounded-3xl bg-gradient-to-b from-[#1a1825] to-[#110f1a] shadow-2xl border border-white/10">
          {/* 최소화 버튼 */}
          <button
            onClick={() => setIsMinimized(true)}
            className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          >
            <Minimize2 size={20} />
          </button>

          {/* 상단 영역 */}
          <div className="pt-8 pb-4 px-6 text-center">
            {/* 프로필 아바타 */}
            <div className="mx-auto w-24 h-24 rounded-full bg-gradient-to-br from-[#FE3A8F] to-[#ff6b9d] flex items-center justify-center mb-4 shadow-lg shadow-[#FE3A8F]/30">
              <span className="text-3xl font-bold text-white">
                {activeCall.partnerName?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            </div>

            <h3 className="text-xl font-bold text-white mb-1">
              {activeCall.partnerName}
            </h3>

            {/* 통화 상태 */}
            <div className="flex items-center justify-center gap-2 mt-2">
              {callState === 'calling' ? (
                <>
                  <div className="flex gap-1">
                    <div className="w-2 h-2 bg-[#FE3A8F] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-[#FE3A8F] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-[#FE3A8F] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-gray-400 text-sm">연결 중</span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-2xl font-mono text-white font-semibold tracking-wider">
                    {formatTime(callDuration)}
                  </span>
                </>
              )}
            </div>

            {/* 연결 상태 표시 */}
            {callState === 'connected' && remoteStream && (
              <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-500/20 border border-green-500/30">
                <div className="w-1.5 h-1.5 bg-green-400 rounded-full" />
                <span className="text-xs text-green-400 font-medium">음성 연결됨</span>
              </div>
            )}
          </div>

          {/* 컨트롤 버튼 */}
          <div className="px-6 pb-8 pt-4">
            <div className="flex items-center justify-center gap-6">
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

              {/* 통화 종료 버튼 */}
              <button
                onClick={handleEndCall}
                disabled={isProcessing}
                className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all duration-200 disabled:opacity-50 shadow-lg shadow-red-500/40"
              >
                <PhoneOff size={28} className="text-white" />
              </button>

              {/* 스피커폰 버튼 */}
              <button
                onClick={handleToggleSpeaker}
                disabled={isProcessing}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all duration-200 disabled:opacity-50 ${
                  isSpeakerOn 
                    ? 'bg-[#FE3A8F]/20 border-2 border-[#FE3A8F] text-[#FE3A8F]' 
                    : 'bg-white/10 border-2 border-white/20 text-white hover:bg-white/20'
                }`}
                title={isSpeakerOn ? '스피커폰 켜짐' : '귀대고 통화'}
              >
                {isSpeakerOn ? <Volume2 size={24} /> : <Phone size={24} />}
              </button>
            </div>

            {/* 볼륨 조절 */}
            <div className="mt-6 px-4">
              <button
                onClick={toggleVolumeSlider}
                className="w-full flex items-center justify-center gap-2 py-2 text-white/70 hover:text-white transition-colors"
              >
                <VolumeIcon size={18} />
                <span className="text-sm">볼륨 조절</span>
              </button>
              
              {showVolumeSlider && (
                <div className="mt-2 px-4">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={volume}
                    onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                    className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-[#FE3A8F]"
                    style={{
                      background: `linear-gradient(to right, #FE3A8F ${volume * 100}%, rgba(255,255,255,0.2) ${volume * 100}%)`
                    }}
                  />
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    )
  }

  return null
}