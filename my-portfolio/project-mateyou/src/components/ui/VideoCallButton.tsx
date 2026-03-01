import { Video } from 'lucide-react'
import { Button } from './Button'
import { useAuth } from '@/hooks/useAuth'
import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { generateUUID } from '@/lib/utils'

interface VideoCallButtonProps {
  partnerId: string
  partnerName: string
  disabled?: boolean
  className?: string
  variant?: 'default' | 'icon'
  onSendMessage?: (message: string) => Promise<void>
  callId?: string | null
  isSubscribed?: boolean
}

export function VideoCallButton({
  partnerId,
  partnerName,
  disabled = false,
  className = '',
  variant = 'default',
  onSendMessage,
  callId,
  isSubscribed = false,
}: VideoCallButtonProps) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [isProcessing, setIsProcessing] = useState(false)

  const hasCallId = Boolean(callId)
  const isAdmin = user?.role === 'admin'
  // 통화 시작 가능: 관리자, 구독자, 또는 callId가 있으면 누구나 가능
  const canInitiateCall = isAdmin || isSubscribed || hasCallId
  const canReceiveCall = hasCallId || isAdmin || isSubscribed

  const handleStartCall = async () => {
    if (!canInitiateCall || isProcessing || !partnerId) return

    setIsProcessing(true)
    try {
      if (!isAdmin && !isSubscribed && !hasCallId) {
        alert('영상통화 준비 중입니다. 잠시 후 다시 시도해주세요.')
        setIsProcessing(false)
        return
      }

      if (onSendMessage) {
        await onSendMessage('[CALL_START:video]')
      }

      const actualCallId = callId || ((isAdmin || isSubscribed) ? `subscription-video-call-${generateUUID()}` : undefined)

      // 새로운 /call 라우트로 이동
      navigate({
        to: '/call',
        search: {
          mode: 'outgoing',
          partnerId,
          partnerName,
          callType: 'video',
          callId: actualCallId,
        },
      })
    } catch (error) {
      console.error('영상통화 시작 실패:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  if (variant === 'icon') {
    if (!canReceiveCall) {
      return null
    }

    return (
      <div className={`relative flex items-center ${className}`}>
        <Button
          variant="ghost"
          size="md"
          onClick={handleStartCall}
          disabled={disabled || !canInitiateCall || isProcessing}
          className={`!rounded-full h-10 w-10 !px-1 !py-1 flex items-center justify-center transition-all duration-200 shadow-md ${
            !canInitiateCall
              ? 'text-gray-400 opacity-50 cursor-not-allowed border-2 border-gray-200 bg-gray-50'
              : 'text-[#FE3A8F] hover:bg-[#FE3A8F]/10 border-2 border-[#FE3A8F] bg-white hover:shadow-lg'
          } disabled:opacity-50`}
          title={!canInitiateCall ? '파트너가 영상통화를 시작하기를 기다리고 있습니다' : '영상통화 시작'}
        >
          <Video size={22} className="drop-shadow-sm" />
        </Button>
      </div>
    )
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleStartCall}
      disabled={disabled || !canInitiateCall || isProcessing}
      className={`w-full ${className} ${!canInitiateCall ? 'opacity-50 cursor-not-allowed' : ''}`}
      title={!canInitiateCall ? '파트너가 영상통화를 시작하기를 기다리고 있습니다' : '영상통화 시작'}
    >
      <Video size={16} className="mr-2" />
      {!canInitiateCall ? '영상통화 대기 중...' : '영상통화'}
    </Button>
  )
}
