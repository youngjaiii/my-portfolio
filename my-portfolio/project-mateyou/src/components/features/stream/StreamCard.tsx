import { type CanView, type StreamRoom, type StreamType } from '@/hooks/useStreamRooms'
import { EyeIcon, Lock, Radio, Users } from 'lucide-react'

// 스트림 타입별 뱃지 스타일
export const streamTypeBadge: Record<StreamType, { label: string; bg: string; text: string }> = {
  live: {
    label: '라이브',
    bg: 'bg-red-500',
    text: 'text-white',
  },
  radio: {
    label: '보이스',
    bg: 'bg-purple-500',
    text: 'text-white',
  },
  review: {
    label: '다시보기',
    bg: 'bg-green-500',
    text: 'text-white',
  },
}

// canView 뱃지 스타일
export const canViewBadge: Record<CanView, { label: string; icon: React.ReactNode; bg: string; text: string }> = {
  subscribers: {
    label: '구독자 전용',
    icon: <Users className="w-2.5 h-2.5" />,
    bg: 'bg-purple-100',
    text: 'text-purple-700',
  },
  locked: {
    label: '비공개',
    icon: <Lock className="w-2.5 h-2.5" />,
    bg: 'bg-slate-200',
    text: 'text-slate-600',
  },
  all: {
    label: '공개',
    icon: null,
    bg: 'bg-emerald-100',
    text: 'text-emerald-700',
  },
}

// 스트림 시간 포맷팅
export const formatStreamTime = (isoString: string): string => {
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = date.getTime() - now.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  // 과거 시간 (이미 시작됨)
  if (diffMs < 0) {
    const absDiffMinutes = Math.abs(diffMinutes)
    const absDiffHours = Math.abs(diffHours)
    if (absDiffMinutes < 60) return `${absDiffMinutes}분 전 시작`
    if (absDiffHours < 24) return `${absDiffHours}시간 전 시작`
    return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')} 시작`
  }

  // 미래 시간 (예정됨)
  if (diffMinutes < 60) return `${diffMinutes}분 후 시작`
  if (diffHours < 24) return `${diffHours}시간 후 시작`
  if (diffDays < 7) return `${diffDays}일 후 시작`

  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')} 시작`
}

interface StreamCardProps {
  stream: StreamRoom
  onClick?: () => void
}

export const StreamCard = ({ stream, onClick }: StreamCardProps) => {
  const typeBadge = streamTypeBadge[stream.streamType]
  const viewBadge = canViewBadge[stream.canView]

  return (
    <div className="group cursor-pointer" onClick={onClick}>
      {/* 썸네일 영역 */}
      <div className="relative aspect-video rounded-lg overflow-hidden bg-gradient-to-br from-slate-200 to-slate-300">
        <img
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
          src={stream.streamThumbnail || `https://picsum.photos/seed/${stream.id}/600/400`}
          alt={stream.title}
        />

        {/* 우측 상단 - 타입 뱃지 */}
        <div className="absolute top-1.5 right-1.5 flex gap-1">
          <span
            className={`flex items-center gap-1 ${typeBadge.bg} ${typeBadge.text} text-[10px] font-[900] px-1.5 py-0.5 rounded`}
          >
            {typeBadge.label}
          </span>
        </div>
      </div>

      {/* 정보 영역 */}
      <div className="mt-2">
        {/* 제목 */}
        <h3 className="font-medium text-[13px] text-[#110f1a] line-clamp-2 leading-tight group-hover:text-purple-600 transition-colors">
          {stream.title}
        </h3>

        {/* 호스트 */}
        <div className="flex items-center gap-1.5 mt-1.5">
          <img
            className="w-4 h-4 rounded-full object-cover"
            src={stream.hostList[0]?.userProfile}
            alt={stream.hostList[0]?.userName}
          />
          <span className="text-[11px] text-gray-500 truncate">{stream.hostList[0]?.userName}</span>
        </div>

        {/* 뷰어 · 시작 시간 */}
        <div className="flex items-center gap-1 mt-1 text-[11px] text-gray-400">
          <EyeIcon className="w-3 h-3" />
          <span>{stream.viewerCount.toLocaleString()}</span>
          <span>·</span>
          <span>{formatStreamTime(stream.whenStart)}</span>
        </div>

        {/* 뱃지 영역 */}
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {/* canView 뱃지 */}
          <span
            className={`flex items-center gap-0.5 ${viewBadge.bg} ${viewBadge.text} text-[9px] font-medium px-1.5 py-0.5 rounded`}
          >
            {viewBadge.icon}
            {viewBadge.label}
          </span>
          {/* 카테고리 뱃지 */}
          <span className="bg-gray-100 text-gray-600 text-[9px] font-medium px-1.5 py-0.5 rounded">
            {stream.category}
          </span>
        </div>
      </div>
    </div>
  )
}

// 로딩 스켈레톤 컴포넌트
export const StreamCardSkeleton = () => (
  <div className="animate-pulse">
    <div className="aspect-video rounded-lg bg-slate-200" />
    <div className="mt-2 space-y-2">
      <div className="h-4 bg-slate-200 rounded w-3/4" />
      <div className="flex items-center gap-1.5">
        <div className="w-4 h-4 rounded-full bg-slate-200" />
        <div className="h-3 bg-slate-200 rounded w-16" />
      </div>
      <div className="h-3 bg-slate-200 rounded w-24" />
    </div>
  </div>
)

// 빈 상태 컴포넌트
export const StreamEmptyState = ({ message, icon }: { message: string; icon?: React.ReactNode }) => (
  <div className="col-span-full flex flex-col items-center justify-center py-16 text-gray-400">
    {icon || <Radio className="w-12 h-12 mb-3 opacity-50" />}
    <p className="text-sm">{message}</p>
  </div>
)

