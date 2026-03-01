/**
 * ViewerMissionPanel - 시청자용 통합 미션 뷰어
 *
 * 모든 발언자(파트너)들에게 온 미션을 통합해서 보여주는 읽기 전용 패널
 * - 발언자별로 그룹핑하여 표시
 * - 미션 상태 확인 가능 (대기/진행/완료)
 * - 관리 버튼 없음
 */

import { SlideSheet } from '@/components/ui/SlideSheet'
import type { StreamDonation } from '@/components/features/stream/donation/types'
import { useDonationQueue } from '@/hooks/useDonationQueue'
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Sparkles,
  Target,
  Trophy,
  User,
  XCircle,
} from 'lucide-react'
import { useMemo, useState } from 'react'

interface ViewerMissionPanelProps {
  roomId: string
  isOpen: boolean
  onClose: () => void
}

// 발언자별 그룹
interface RecipientGroup {
  recipientPartnerId: string
  recipientName: string
  recipientProfileImage: string | null
  missions: StreamDonation[]
}

export function ViewerMissionPanel({
  roomId,
  isOpen,
  onClose,
}: ViewerMissionPanelProps) {
  const {
    pendingDonations,
    acceptedMissions,
    completedDonations,
    skippedDonations,
    stats,
  } = useDonationQueue({
    roomId,
    enabled: isOpen,
    typeFilter: ['mission'],
    enableRealtime: true,
  })

  // 모든 미션 합치기
  const allMissions = useMemo(() => {
    const pending = pendingDonations.filter(d => d.donation_type === 'mission')
    const accepted = acceptedMissions
    const completed = completedDonations.filter(d => d.donation_type === 'mission')
    const skipped = skippedDonations.filter(d => d.donation_type === 'mission')
    return [...pending, ...accepted, ...completed, ...skipped]
  }, [pendingDonations, acceptedMissions, completedDonations, skippedDonations])

  // 발언자별 그룹핑
  const recipientGroups = useMemo((): RecipientGroup[] => {
    const groupMap = new Map<string, RecipientGroup>()

    for (const mission of allMissions) {
      const recipientId = mission.recipient_partner_id
      if (!recipientId) continue

      const existing = groupMap.get(recipientId)
      if (existing) {
        existing.missions.push(mission)
      } else {
        groupMap.set(recipientId, {
          recipientPartnerId: recipientId,
          recipientName: mission.recipient_partner?.partner_name || '파트너',
          recipientProfileImage: mission.recipient_partner?.member?.profile_image || null,
          missions: [mission],
        })
      }
    }

    // 미션 수가 많은 순서로 정렬
    return Array.from(groupMap.values()).sort(
      (a, b) => b.missions.length - a.missions.length
    )
  }, [allMissions])

  const totalMissionCount = allMissions.length

  return (
    <SlideSheet
      isOpen={isOpen}
      onClose={onClose}
      title={`미션 현황 (${totalMissionCount})`}
      initialHeight={0.45}
      minHeight={0.25}
      maxHeight={0.7}
      zIndex={150}
      noPadding
    >
      <div className="flex-1 overflow-y-auto">
        {/* 통계 요약 */}
        <div className="mx-4 mt-2 mb-3 px-4 py-3 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-xl border border-purple-200/50">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-lg font-bold text-amber-600">
                {stats.pendingCount}
              </p>
              <p className="text-[10px] text-gray-500">대기중</p>
            </div>
            <div>
              <p className="text-lg font-bold text-green-600">
                {stats.acceptedMissionCount}
              </p>
              <p className="text-[10px] text-gray-500">진행중</p>
            </div>
            <div>
              <p className="text-lg font-bold text-purple-600">
                {stats.completedCount}
              </p>
              <p className="text-[10px] text-gray-500">완료</p>
            </div>
          </div>
        </div>

        {/* 발언자별 그룹 */}
        {recipientGroups.length > 0 ? (
          recipientGroups.map((group) => (
            <RecipientGroupItem key={group.recipientPartnerId} group={group} />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Target className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm">아직 미션이 없습니다</p>
            <p className="text-xs text-gray-500 mt-1">
              후원 버튼에서 미션을 보내보세요
            </p>
          </div>
        )}
      </div>
    </SlideSheet>
  )
}

function RecipientGroupItem({ group }: { group: RecipientGroup }) {
  const [isExpanded, setIsExpanded] = useState(true)

  // 상태별 분류
  const pendingMissions = group.missions.filter(m => m.status === 'pending')
  const acceptedMissions = group.missions.filter(m => m.status === 'accepted')
  const completedMissions = group.missions.filter(m => 
    m.status === 'completed' || m.status === 'success'
  )
  const failedMissions = group.missions.filter(m => 
    m.status === 'failed' || m.status === 'rejected'
  )

  return (
    <div className="border-b border-gray-100">
      {/* 발언자 헤더 */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        {/* 프로필 이미지 */}
        <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-gray-100">
          {group.recipientProfileImage ? (
            <img
              src={group.recipientProfileImage}
              alt={group.recipientName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-100 to-purple-200 text-purple-600 text-sm font-bold">
              <User className="w-5 h-5" />
            </div>
          )}
        </div>

        {/* 이름 및 통계 */}
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-medium text-[#110f1a] truncate">
            {group.recipientName}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            {pendingMissions.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">
                대기 {pendingMissions.length}
              </span>
            )}
            {acceptedMissions.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded">
                진행 {acceptedMissions.length}
              </span>
            )}
            {completedMissions.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">
                완료 {completedMissions.length}
              </span>
            )}
          </div>
        </div>

        {/* 펼침 아이콘 */}
        <div className="text-gray-400">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </div>
      </button>

      {/* 미션 목록 (펼침) */}
      {isExpanded && (
        <div className="px-4 pb-3 space-y-2">
          {group.missions.map((mission) => (
            <MissionItem key={mission.id} mission={mission} />
          ))}
        </div>
      )}
    </div>
  )
}

function MissionItem({ mission }: { mission: StreamDonation }) {
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getStatusIcon = () => {
    switch (mission.status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-amber-500" />
      case 'accepted':
        return <Sparkles className="w-4 h-4 text-green-500 animate-pulse" />
      case 'success':
      case 'completed':
        return <Trophy className="w-4 h-4 text-yellow-500" />
      case 'failed':
      case 'rejected':
        return <XCircle className="w-4 h-4 text-gray-400" />
      default:
        return <Target className="w-4 h-4 text-purple-500" />
    }
  }

  const getStatusBg = () => {
    switch (mission.status) {
      case 'pending':
        return 'bg-amber-50 border-amber-200'
      case 'accepted':
        return 'bg-green-50 border-green-200'
      case 'success':
      case 'completed':
        return 'bg-yellow-50 border-yellow-200'
      case 'failed':
      case 'rejected':
        return 'bg-gray-50 border-gray-200'
      default:
        return 'bg-gray-50 border-gray-200'
    }
  }

  const getStatusLabel = () => {
    switch (mission.status) {
      case 'pending':
        return '대기중'
      case 'accepted':
        return '진행중'
      case 'success':
        return '성공'
      case 'completed':
        return '완료'
      case 'failed':
        return '실패'
      case 'rejected':
        return '거절됨'
      default:
        return ''
    }
  }

  return (
    <div className={`ml-6 p-3 rounded-lg border ${getStatusBg()}`}>
      <div className="flex items-start gap-2">
        {/* 상태 아이콘 */}
        <div className="flex-shrink-0 mt-0.5">
          {getStatusIcon()}
        </div>

        {/* 미션 내용 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-gray-700">
              {mission.donor?.name || '익명'}
            </span>
            <span className="text-xs font-semibold text-purple-600">
              {mission.amount.toLocaleString()}P
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
              mission.status === 'pending' ? 'bg-amber-100 text-amber-700' :
              mission.status === 'accepted' ? 'bg-green-100 text-green-700' :
              mission.status === 'success' || mission.status === 'completed' ? 'bg-yellow-100 text-yellow-700' :
              'bg-gray-100 text-gray-600'
            }`}>
              {getStatusLabel()}
            </span>
          </div>
          <p className="text-sm text-gray-700">{mission.mission_text}</p>
          <p className="text-[10px] text-gray-400 mt-1">
            {formatTime(mission.created_at)}
          </p>
        </div>
      </div>
    </div>
  )
}

