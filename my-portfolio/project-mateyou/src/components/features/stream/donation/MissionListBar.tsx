/**
 * MissionListBar - 미션 목록 바 (라이브룸 상단용)
 *
 * 영상 상단 (네비게이션 아래)에 표시되는 미션 목록
 * - 최대 4~5개 미션 표시
 * - 호스트: 수락/거절/성공/실패 버튼
 * - 성공/실패 시 애니메이션과 함께 사라짐
 */

import type { StreamDonation } from '@/components/features/stream/donation/types'
import { useDonationQueue } from '@/hooks/useDonationQueue'
import { useToast } from '@/hooks/useToast'
import {
  Check,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Target,
  ThumbsDown,
  ThumbsUp,
  Trophy,
  X,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

interface MissionListBarProps {
  roomId: string
  isHost: boolean
  /** 최대 표시 개수 */
  maxItems?: number
}

// 애니메이션 상태
type AnimState = 'idle' | 'success' | 'failed' | 'fadeOut'

interface AnimatingItem {
  id: number
  state: AnimState
  mission: StreamDonation
}

export function MissionListBar({
  roomId,
  isHost,
  maxItems = 5,
}: MissionListBarProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const toast = useToast()

  // 애니메이션 중인 미션들
  const [animatingItems, setAnimatingItems] = useState<AnimatingItem[]>([])
  const processedIdsRef = useRef<Set<number>>(new Set())

  const {
    pendingDonations,
    acceptedMissions,
    completedDonations,
    skippedDonations,
    acceptMission,
    rejectMission,
    completeMissionSuccess,
    completeMissionFailed,
  } = useDonationQueue({
    roomId,
    enabled: true,
    typeFilter: ['mission'],
    enableRealtime: true,
  })

  // 애니메이션 시작
  const startAnimation = useCallback(
    (mission: StreamDonation, state: 'success' | 'failed') => {
      if (processedIdsRef.current.has(mission.id)) return
      processedIdsRef.current.add(mission.id)

      setAnimatingItems((prev) => [
        ...prev.filter((m) => m.id !== mission.id),
        { id: mission.id, state, mission },
      ])

      // 1.5초 후 fadeOut 시작
      setTimeout(() => {
        setAnimatingItems((prev) =>
          prev.map((m) => (m.id === mission.id ? { ...m, state: 'fadeOut' } : m))
        )
      }, 1500)

      // 2초 후 완전히 제거
      setTimeout(() => {
        setAnimatingItems((prev) => prev.filter((m) => m.id !== mission.id))
      }, 2000)
    },
    []
  )

  // 완료/실패 미션 감지 (실시간)
  useEffect(() => {
    const recentSuccessMissions = completedDonations.filter(
      (d) =>
        d.donation_type === 'mission' &&
        d.status === 'success' &&
        d.processed_at &&
        Date.now() - new Date(d.processed_at).getTime() < 3000 &&
        !processedIdsRef.current.has(d.id)
    )

    const recentFailedMissions = skippedDonations.filter(
      (d) =>
        d.donation_type === 'mission' &&
        d.status === 'failed' &&
        d.processed_at &&
        Date.now() - new Date(d.processed_at).getTime() < 3000 &&
        !processedIdsRef.current.has(d.id)
    )

    recentSuccessMissions.forEach((m) => startAnimation(m, 'success'))
    recentFailedMissions.forEach((m) => startAnimation(m, 'failed'))
  }, [completedDonations, skippedDonations, startAnimation])

  // 대기 중인 미션 + 수락된 미션 (애니메이션 중인 것 제외)
  const pendingMissions = pendingDonations.filter(
    (d) => d.donation_type === 'mission'
  )
  const animatingIds = new Set(animatingItems.map((a) => a.id))
  const activeMissions = [...pendingMissions, ...acceptedMissions]
    .filter((m) => !animatingIds.has(m.id))
    .slice(0, maxItems)

  const handleAccept = async (donation: StreamDonation) => {
    const result = await acceptMission(donation.id)
    if (result.success) {
      toast.success('미션을 수락했습니다! 포인트는 보관 중입니다.')
    } else {
      toast.error(result.errorMessage || '미션 수락에 실패했습니다.')
    }
  }

  const handleReject = async (donation: StreamDonation) => {
    const result = await rejectMission(donation.id)
    if (result.success) {
      toast.success(
        `미션이 거절되었습니다. ${result.refundAmount?.toLocaleString()}P 전액 환불 완료`
      )
    } else {
      toast.error(result.errorMessage || '미션 거절에 실패했습니다.')
    }
  }

  const handleSuccess = async (donation: StreamDonation) => {
    // 즉시 애니메이션 시작
    startAnimation(donation, 'success')
    const result = await completeMissionSuccess(donation.id)
    if (result.success) {
      toast.success(`미션 성공! 🎉 ${donation.amount.toLocaleString()}P 지급 완료`)
    } else {
      toast.error(result.errorMessage || '처리에 실패했습니다.')
    }
  }

  const handleFailed = async (donation: StreamDonation) => {
    // 즉시 애니메이션 시작
    startAnimation(donation, 'failed')
    const result = await completeMissionFailed(donation.id)
    if (result.success) {
      const fee = result.fee || 0
      const refundAmount = result.refundAmount || 0
      toast.info(
        `미션 실패 처리되었습니다. 수수료 ${fee.toLocaleString()}P 제외, ${refundAmount.toLocaleString()}P 환불됨`
      )
    } else {
      toast.error(result.errorMessage || '처리에 실패했습니다.')
    }
  }

  // 미션이 없으면 표시하지 않음
  if (activeMissions.length === 0 && animatingItems.length === 0) {
    return null
  }

  return (
    <div className="bg-gradient-to-r from-purple-900/90 to-purple-800/90 backdrop-blur-sm border-b border-purple-700/50">
      {/* 헤더 */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2"
      >
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-purple-300" />
          <span className="text-xs font-semibold text-white">
            미션 {activeMissions.length + animatingItems.length}개
          </span>
          {pendingMissions.length > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] bg-amber-500 text-white rounded-full animate-pulse">
              대기 {pendingMissions.length}
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-purple-300" />
        ) : (
          <ChevronDown className="w-4 h-4 text-purple-300" />
        )}
      </button>

      {/* 미션 목록 */}
      {isExpanded && (
        <div className="px-2 pb-2 space-y-1.5">
          {/* 애니메이션 중인 미션 */}
          {animatingItems.map((item) => (
            <AnimatedMissionItem
              key={`anim-${item.id}`}
              mission={item.mission}
              state={item.state}
            />
          ))}

          {/* 일반 미션 */}
          {activeMissions.map((mission) => (
            <MissionItem
              key={mission.id}
              mission={mission}
              isHost={isHost}
              onAccept={handleAccept}
              onReject={handleReject}
              onSuccess={handleSuccess}
              onFailed={handleFailed}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface MissionItemProps {
  mission: StreamDonation
  isHost: boolean
  onAccept: (m: StreamDonation) => void
  onReject: (m: StreamDonation) => void
  onSuccess: (m: StreamDonation) => void
  onFailed: (m: StreamDonation) => void
}

function MissionItem({
  mission,
  isHost,
  onAccept,
  onReject,
  onSuccess,
  onFailed,
}: MissionItemProps) {
  const isPending = mission.status === 'pending'
  const isAccepted = mission.status === 'accepted'

  return (
    <div
      className={`rounded-lg p-2 transition-all duration-300 ${
        isAccepted
          ? 'bg-green-900/50 border border-green-500/30'
          : 'bg-purple-800/50 border border-purple-600/30'
      }`}
    >
      <div className="flex items-start gap-2">
        {/* 후원자 정보 */}
        <div className="flex-shrink-0 w-7 h-7 rounded-full overflow-hidden bg-purple-700">
          {mission.donor?.profile_image ? (
            <img
              src={mission.donor.profile_image}
              alt={mission.donor.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs font-bold text-purple-300">
              {(mission.donor?.name || '?').charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* 미션 내용 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[11px] font-medium text-white truncate">
              {mission.donor?.name || '익명'}
            </span>
            <span className="text-[10px] text-purple-300">
              {mission.amount.toLocaleString()}P
            </span>
            {isAccepted && (
              <span className="px-1 py-0.5 text-[9px] bg-green-500 text-white rounded">
                진행중
              </span>
            )}
          </div>
          <p className="text-[11px] text-purple-100 line-clamp-2">
            {mission.mission_text}
          </p>
        </div>

        {/* 호스트 액션 버튼 */}
        {isHost && (
          <div className="flex-shrink-0 flex gap-1">
            {isPending && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onAccept(mission)
                  }}
                  className="p-1.5 rounded-full bg-green-500/80 hover:bg-green-500 text-white transition-colors"
                  title="수락"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onReject(mission)
                  }}
                  className="p-1.5 rounded-full bg-red-500/80 hover:bg-red-500 text-white transition-colors"
                  title="거절 (환불)"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </>
            )}
            {isAccepted && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onSuccess(mission)
                  }}
                  className="p-1.5 rounded-full bg-green-500/80 hover:bg-green-500 text-white transition-colors"
                  title="성공"
                >
                  <ThumbsUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onFailed(mission)
                  }}
                  className="p-1.5 rounded-full bg-gray-500/80 hover:bg-gray-500 text-white transition-colors"
                  title="실패"
                >
                  <ThumbsDown className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/** 애니메이션 중인 미션 아이템 */
function AnimatedMissionItem({
  mission,
  state,
}: {
  mission: StreamDonation
  state: AnimState
}) {
  const isSuccess = state === 'success' || (state === 'fadeOut' && mission.status === 'success')
  const isFadeOut = state === 'fadeOut'

  return (
    <div
      className={`relative overflow-hidden rounded-lg transition-all duration-500 ${
        isFadeOut ? 'opacity-0 max-h-0 py-0 my-0' : 'opacity-100 max-h-24'
      }`}
    >
      {/* 배경 그라데이션 */}
      <div
        className={`absolute inset-0 ${
          isSuccess
            ? 'bg-gradient-to-r from-yellow-500/50 via-amber-400/60 to-yellow-500/50'
            : 'bg-gradient-to-r from-gray-500/50 via-slate-400/60 to-gray-500/50'
        }`}
      />

      {/* 성공 시 shimmer 효과 */}
      {isSuccess && !isFadeOut && (
        <>
          <div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
            style={{
              animation: 'shimmer 1s infinite',
            }}
          />
          <Sparkles className="absolute top-1 right-1 w-4 h-4 text-yellow-300 animate-spin" />
          <style>{`
            @keyframes shimmer {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(100%); }
            }
          `}</style>
        </>
      )}

      {/* 콘텐츠 */}
      <div className="relative p-2 flex items-center gap-2">
        {/* 아이콘 */}
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
            isSuccess
              ? 'bg-gradient-to-br from-yellow-400 to-amber-500 shadow-lg shadow-yellow-500/50'
              : 'bg-gradient-to-br from-gray-400 to-slate-500 shadow-lg shadow-gray-500/50'
          } ${!isFadeOut ? 'animate-bounce' : ''}`}
        >
          {isSuccess ? (
            <Trophy className="w-4 h-4 text-white" />
          ) : (
            <XCircle className="w-4 h-4 text-white" />
          )}
        </div>

        {/* 결과 텍스트 */}
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-bold ${
              isSuccess ? 'text-yellow-200' : 'text-gray-200'
            }`}
          >
            {isSuccess ? '🎉 미션 성공!' : '❌ 미션 실패'}
          </p>
          <p className="text-[10px] text-white/80 truncate">
            {mission.donor?.name} - {mission.mission_text}
          </p>
        </div>
      </div>
    </div>
  )
}
