/**
 * MissionDonationInput - 미션 도네이션 입력 컴포넌트
 */

import { Typography } from '@/components/ui/Typography'
import { Target } from 'lucide-react'

interface MissionDonationInputProps {
  missionText: string
  onMissionTextChange: (text: string) => void
  maxLength?: number
}

export function MissionDonationInput({
  missionText,
  onMissionTextChange,
  maxLength = 100,
}: MissionDonationInputProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Target className="w-4 h-4 text-purple-500" />
        <Typography variant="body2" className="font-medium text-gray-700">
          미션 내용
        </Typography>
      </div>
      <div className="relative">
        <textarea
          value={missionText}
          onChange={(e) => onMissionTextChange(e.target.value.slice(0, maxLength))}
          placeholder="호스트에게 요청할 미션을 입력하세요 (예: 노래 한곡 불러주세요!)"
          rows={3}
          className="w-full px-4 py-3 text-sm border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-purple-400"
        />
        <p className="absolute bottom-2 right-3 text-[10px] text-gray-400">
          {missionText.length}/{maxLength}
        </p>
      </div>
      <p className="text-[11px] text-gray-500">
        💡 미션 도네이션은 호스트가 미션 수행 여부를 결정합니다.
      </p>
    </div>
  )
}

