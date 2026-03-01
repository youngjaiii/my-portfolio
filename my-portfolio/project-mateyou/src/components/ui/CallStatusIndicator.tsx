import { useGlobalVoiceCall } from '@/contexts/GlobalVoiceCallProvider'
import { Mic, MicOff, Phone, PhoneOff } from 'lucide-react'
import { useState } from 'react'
import { Button } from './Button'

interface CallStatusIndicatorProps {
  className?: string
}

export function CallStatusIndicator({ className = '' }: CallStatusIndicatorProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const {
    callState,
    activeCall,
    formatDuration,
    endCall,
    navigateToChat,
    isMuted,
    toggleMute,
    localStream,
    remoteStream
  } = useGlobalVoiceCall()

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

  if (callState === 'idle' || !activeCall) {
    return null
  }

  // 실제 연결 상태를 더 정확하게 판단
  const isActuallyConnected = callState === 'connected' && remoteStream && localStream
  // 타이머 표시: 'calling' 또는 'connected' 상태이고 activeCall이 있으면 표시
  const showDuration = (callState === 'calling' || callState === 'connected') && activeCall
  const getConnectionStatus = () => {
    if (isActuallyConnected) return 'connected'
    if (callState === 'calling') return 'calling'
    if (callState === 'receiving') return 'receiving'
    return 'connecting'
  }

  const connectionStatus = getConnectionStatus()
  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return '통화 중'
      case 'calling': return '연결 중...'
      case 'receiving': return '응답 중...'
      default: return '연결 중...'
    }
  }

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'bg-green-500 animate-pulse'
      case 'calling': return 'bg-yellow-500 animate-pulse'
      case 'receiving': return 'bg-blue-500 animate-pulse'
      default: return 'bg-gray-400 animate-pulse'
    }
  }

  return (
    <div className={`fixed top-16 right-4 z-40 ${className}`}>
      <div className="bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
        {/* 통화 상대 정보와 시간을 한 줄로 */}
        <div
          className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50"
          onClick={navigateToChat}
          title="채팅방으로 이동"
        >
          <div className="flex items-center space-x-2 min-w-0">
            <Phone size={16} className="text-green-600 flex-shrink-0" />
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getStatusColor()}`} />
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">
                {activeCall.partnerName}
              </div>
            </div>
          </div>

          {/* 통화 시간을 우측에 */}
          {showDuration && (
            <div className="text-sm font-mono font-semibold text-green-600 bg-green-50 rounded px-2 py-1 ml-2 flex-shrink-0">
              {formatDuration(activeCall.duration)}
            </div>
          )}

          {!showDuration && (
            <div className="text-xs text-gray-500 ml-2 flex-shrink-0">
              {getStatusText()}
            </div>
          )}
        </div>

        {/* 컨트롤 버튼들 */}
        <div className="flex items-center justify-center space-x-2 px-3 py-2 bg-gray-50">
          {/* 음소거 버튼 - 통화 중이면 항상 표시 */}
          {showDuration && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleMute}
              disabled={isProcessing}
              className={`h-9 w-9 rounded-full ${
                isMuted ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'bg-green-100 text-green-600 hover:bg-green-200'
              } disabled:opacity-50`}
              title={isMuted ? '음소거 해제' : '음소거'}
            >
              {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
            </Button>
          )}

          {/* 통화 종료 버튼 */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleEndCall}
            disabled={isProcessing}
            className="h-9 w-9 rounded-full bg-red-100 text-red-600 hover:bg-red-200 disabled:opacity-50"
            title="통화 종료"
          >
            <PhoneOff size={16} />
          </Button>
        </div>
      </div>
    </div>
  )
}