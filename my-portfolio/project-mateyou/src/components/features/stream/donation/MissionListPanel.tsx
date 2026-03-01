/**
 * MissionListPanel - 미션 목록 패널 (보이스룸용)
 *
 * 보이스룸 채팅창 옆이나 모아서 보여주는 미션 목록
 * - 접기/펼치기 가능
 * - 호스트: 수락/거절/성공/실패 버튼
 * - 성공/실패 시 애니메이션 효과
 */

import { SlideSheet } from '@/components/ui/SlideSheet'
import type { StreamDonation } from '@/components/features/stream/donation/types'
import { useDonationQueue } from '@/hooks/useDonationQueue'
import { useToast } from '@/hooks/useToast'
import {
  Check,
  ChevronRight,
  Sparkles,
  Target,
  ThumbsDown,
  ThumbsUp,
  Trophy,
  X,
  XCircle,
} from 'lucide-react'
import { useCallback, useRef, useState } from 'react'

interface MissionListPanelProps {
  roomId: string
  isHost: boolean
  isOpen: boolean
  onClose: () => void
}

// 애니메이션 상태
type AnimState = 'success' | 'failed' | 'fadeOut'

interface AnimatingCard {
  id: number
  state: AnimState
  mission: StreamDonation
}

export function MissionListPanel({
  roomId,
  isHost,
  isOpen,
  onClose,
}: MissionListPanelProps) {
  const toast = useToast()

  // 애니메이션 중인 미션들
  const [animatingCards, setAnimatingCards] = useState<AnimatingCard[]>([])
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
    stats,
  } = useDonationQueue({
    roomId,
    enabled: isOpen,
    typeFilter: ['mission'],
    enableRealtime: true,
  })

  // 애니메이션 시작
  const startAnimation = useCallback(
    (mission: StreamDonation, state: 'success' | 'failed') => {
      if (processedIdsRef.current.has(mission.id)) return
      processedIdsRef.current.add(mission.id)

      setAnimatingCards((prev) => [
        ...prev.filter((m) => m.id !== mission.id),
        { id: mission.id, state, mission },
      ])

      // 2초 후 fadeOut 시작
      setTimeout(() => {
        setAnimatingCards((prev) =>
          prev.map((m) => (m.id === mission.id ? { ...m, state: 'fadeOut' } : m))
        )
      }, 2000)

      // 2.5초 후 완전히 제거
      setTimeout(() => {
        setAnimatingCards((prev) => prev.filter((m) => m.id !== mission.id))
      }, 2500)
    },
    []
  )

  // 대기 중인 미션
  const pendingMissions = pendingDonations.filter(
    (d) => d.donation_type === 'mission'
  )

  // 완료/실패 미션
  const finishedMissions = [
    ...completedDonations.filter((d) => d.donation_type === 'mission'),
    ...skippedDonations.filter(
      (d) => d.donation_type === 'mission' && d.status !== 'rejected'
    ),
  ]

  // 애니메이션 중인 미션 ID
  const animatingIds = new Set(animatingCards.map((a) => a.id))

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

  const totalMissionCount =
    pendingMissions.length + acceptedMissions.length + finishedMissions.length

  return (
    <SlideSheet
      isOpen={isOpen}
      onClose={onClose}
      title={`미션 목록 (${totalMissionCount})`}
      initialHeight={0.6}
      minHeight={0.3}
      maxHeight={0.85}
      zIndex={150}
      noPadding
    >
      <div className="flex-1 overflow-y-auto">
        {/* 애니메이션 중인 미션 카드들 */}
        {animatingCards.length > 0 && (
          <div className="border-b border-gray-100">
            {animatingCards.map((item) => (
              <AnimatedMissionCard
                key={`anim-${item.id}`}
                mission={item.mission}
                state={item.state}
              />
            ))}
          </div>
        )}

        {/* 대기 중인 미션 */}
        {pendingMissions.length > 0 && (
          <MissionSection
            title="대기중"
            missions={pendingMissions.filter((m) => !animatingIds.has(m.id))}
            isHost={isHost}
            status="pending"
            onAccept={handleAccept}
            onReject={handleReject}
            onSuccess={handleSuccess}
            onFailed={handleFailed}
          />
        )}

        {/* 진행 중인 미션 */}
        {acceptedMissions.length > 0 && (
          <MissionSection
            title="진행중"
            missions={acceptedMissions.filter((m) => !animatingIds.has(m.id))}
            isHost={isHost}
            status="accepted"
            onAccept={handleAccept}
            onReject={handleReject}
            onSuccess={handleSuccess}
            onFailed={handleFailed}
          />
        )}

        {/* 완료된 미션 */}
        {finishedMissions.length > 0 && (
          <MissionSection
            title="완료"
            missions={finishedMissions.filter((m) => !animatingIds.has(m.id))}
            isHost={isHost}
            status="completed"
            onAccept={handleAccept}
            onReject={handleReject}
            onSuccess={handleSuccess}
            onFailed={handleFailed}
          />
        )}

        {/* 미션이 없는 경우 */}
        {totalMissionCount === 0 && animatingCards.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Target className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm">아직 미션이 없습니다</p>
            <p className="text-xs text-gray-500 mt-1">
              미션 도네이션을 기다려주세요
            </p>
          </div>
        )}
      </div>

      {/* 통계 푸터 */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
        <div className="flex justify-between text-xs text-gray-500">
          <span>대기: {stats.pendingCount}</span>
          <span>진행: {stats.acceptedMissionCount}</span>
          <span>완료: {stats.completedCount}</span>
        </div>
      </div>
    </SlideSheet>
  )
}

interface MissionSectionProps {
  title: string
  missions: StreamDonation[]
  isHost: boolean
  status: 'pending' | 'accepted' | 'completed'
  onAccept: (m: StreamDonation) => void
  onReject: (m: StreamDonation) => void
  onSuccess: (m: StreamDonation) => void
  onFailed: (m: StreamDonation) => void
}

function MissionSection({
  title,
  missions,
  isHost,
  status,
  onAccept,
  onReject,
  onSuccess,
  onFailed,
}: MissionSectionProps) {
  if (missions.length === 0) return null

  return (
    <div className="border-b border-gray-100">
      {/* 섹션 헤더 */}
      <div
        className={`px-4 py-2 flex items-center gap-2 ${
          status === 'pending'
            ? 'bg-amber-50'
            : status === 'accepted'
              ? 'bg-green-50'
              : 'bg-gray-50'
        }`}
      >
        <ChevronRight className="w-4 h-4 text-gray-400" />
        <span
          className={`text-xs font-semibold ${
            status === 'pending'
              ? 'text-amber-700'
              : status === 'accepted'
                ? 'text-green-700'
                : 'text-gray-600'
          }`}
        >
          {title}
        </span>
        <span className="text-[10px] text-gray-500">({missions.length})</span>
      </div>

      {/* 미션 목록 */}
      <div className="divide-y divide-gray-50">
        {missions.map((mission) => (
          <MissionCard
            key={mission.id}
            mission={mission}
            isHost={isHost}
            onAccept={onAccept}
            onReject={onReject}
            onSuccess={onSuccess}
            onFailed={onFailed}
          />
        ))}
      </div>
    </div>
  )
}

interface MissionCardProps {
  mission: StreamDonation
  isHost: boolean
  onAccept: (m: StreamDonation) => void
  onReject: (m: StreamDonation) => void
  onSuccess: (m: StreamDonation) => void
  onFailed: (m: StreamDonation) => void
}

function MissionCard({
  mission,
  isHost,
  onAccept,
  onReject,
  onSuccess,
  onFailed,
}: MissionCardProps) {
  const isPending = mission.status === 'pending'
  const isAccepted = mission.status === 'accepted'
  const isSuccess = mission.status === 'success'
  const isFailed = mission.status === 'failed'

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="px-4 py-3 transition-all duration-300">
      <div className="flex items-start gap-3">
        {/* 프로필 이미지 */}
        <div className="flex-shrink-0 w-10 h-10 rounded-full overflow-hidden bg-gray-100">
          {mission.donor?.profile_image ? (
            <img
              src={mission.donor.profile_image}
              alt={mission.donor.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-100 to-purple-200 text-purple-600 text-sm font-bold">
              {(mission.donor?.name || '?').charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* 미션 정보 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-[#110f1a]">
              {mission.donor?.name || '익명'}
            </span>
            <span className="text-xs font-semibold text-purple-600">
              {mission.amount.toLocaleString()}P
            </span>
            {isSuccess && (
              <span className="px-1.5 py-0.5 text-[10px] bg-green-100 text-green-700 rounded">
                성공
              </span>
            )}
            {isFailed && (
              <span className="px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-600 rounded">
                실패
              </span>
            )}
          </div>

          <p className="text-sm text-gray-700 mb-1.5">{mission.mission_text}</p>

          <p className="text-[10px] text-gray-400">
            {formatTime(mission.created_at)}
          </p>
        </div>
      </div>

      {/* 호스트 액션 버튼 */}
      {isHost && (isPending || isAccepted) && (
        <div className="flex gap-2 mt-3 ml-13">
          {isPending && (
            <>
              <button
                type="button"
                onClick={() => onAccept(mission)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-green-600 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
              >
                <Check className="w-4 h-4" />
                수락
              </button>
              <button
                type="button"
                onClick={() => onReject(mission)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
              >
                <X className="w-4 h-4" />
                거절
              </button>
            </>
          )}
          {isAccepted && (
            <>
              <button
                type="button"
                onClick={() => onSuccess(mission)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-green-600 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
              >
                <ThumbsUp className="w-4 h-4" />
                성공
              </button>
              <button
                type="button"
                onClick={() => onFailed(mission)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <ThumbsDown className="w-4 h-4" />
                실패
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

/** 애니메이션 중인 미션 카드 */
function AnimatedMissionCard({
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
      className={`relative overflow-hidden transition-all duration-500 ${
        isFadeOut ? 'opacity-0 max-h-0 py-0' : 'opacity-100 max-h-32'
      }`}
    >
      {/* 배경 그라데이션 */}
      <div
        className={`absolute inset-0 ${
          isSuccess
            ? 'bg-gradient-to-r from-yellow-100 via-amber-100 to-yellow-100'
            : 'bg-gradient-to-r from-gray-100 via-slate-100 to-gray-100'
        }`}
      />

      {/* 성공 시 shimmer 효과 */}
      {isSuccess && !isFadeOut && (
        <>
          <div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/60 to-transparent"
            style={{
              animation: 'shimmer 1s infinite',
            }}
          />
          <Sparkles className="absolute top-2 right-2 w-5 h-5 text-yellow-500 animate-spin" />
          <style>{`
            @keyframes shimmer {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(100%); }
            }
          `}</style>
        </>
      )}

      {/* 콘텐츠 */}
      <div className="relative px-4 py-4 flex items-center gap-4">
        {/* 아이콘 */}
        <div
          className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
            isSuccess
              ? 'bg-gradient-to-br from-yellow-400 to-amber-500 shadow-lg shadow-yellow-400/40'
              : 'bg-gradient-to-br from-gray-400 to-slate-500 shadow-lg shadow-gray-400/40'
          } ${!isFadeOut ? 'animate-bounce' : ''}`}
        >
          {isSuccess ? (
            <Trophy className="w-6 h-6 text-white" />
          ) : (
            <XCircle className="w-6 h-6 text-white" />
          )}
        </div>

        {/* 결과 텍스트 */}
        <div className="flex-1 min-w-0">
          <p
            className={`text-lg font-bold ${
              isSuccess ? 'text-yellow-700' : 'text-gray-700'
            } ${!isFadeOut ? 'animate-pulse' : ''}`}
          >
            {isSuccess ? '🎉 미션 성공!' : '❌ 미션 실패'}
          </p>
          <p className="text-sm text-gray-600 truncate">
            <span className="font-medium">{mission.donor?.name}</span>
            <span className="mx-1">·</span>
            <span>{mission.mission_text}</span>
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            {mission.amount.toLocaleString()}P
          </p>
        </div>
      </div>
    </div>
  )
}
