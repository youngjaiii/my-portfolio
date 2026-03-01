/**
 * VoiceRoomSpeakerRequestCard - 발언권 요청 카드 (호스트용)
 */

import type { SpeakerRequest } from '@/hooks/useVoiceRoom'
import { Check, X } from 'lucide-react'

interface VoiceRoomSpeakerRequestCardProps {
  request: SpeakerRequest
  onApprove: () => void
  onReject: () => void
}

export function VoiceRoomSpeakerRequestCard({ 
  request, 
  onApprove, 
  onReject 
}: VoiceRoomSpeakerRequestCardProps) {
  const name = request.requester?.name || '알 수 없음'
  const profile = request.requester?.profile_image || ''

  return (
    <div className="flex items-center gap-2 p-2 bg-purple-50 rounded-lg">
      <img
        src={profile || `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`}
        alt={name}
        className="w-8 h-8 rounded-full object-cover"
      />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-[#110f1a] truncate">{name}</p>
        <p className="text-[10px] text-gray-500 truncate">{request.message || '발언권을 요청했습니다'}</p>
      </div>
      <div className="flex gap-1.5">
        <button
          onClick={onReject}
          className="p-1.5 bg-gray-200 hover:bg-gray-300 rounded-full transition-colors"
        >
          <X className="w-3.5 h-3.5 text-gray-600" />
        </button>
        <button
          onClick={onApprove}
          className="p-1.5 bg-emerald-500 hover:bg-emerald-600 rounded-full transition-colors"
        >
          <Check className="w-3.5 h-3.5 text-white" />
        </button>
      </div>
    </div>
  )
}

