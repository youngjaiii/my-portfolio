/**
 * ActiveMissionDisplay - 시청자용 진행 중인 미션 표시
 *
 * 시청자 화면에 실시간으로 진행 중인 미션을 보여주는 컴포넌트
 * - 수락된 미션 목록 표시 (실시간 갱신)
 * - 미션 상태 실시간 업데이트 (Supabase Realtime 직접 구독)
 * - 수락: 파란색 슬라이드인
 * - 성공: 금색 + 오른쪽에서 슬라이드인 + 반짝임
 * - 실패: 빨간색 + 덜덜 떨림 후 사라짐
 * - 라이브룸/보이스룸 공통 사용
 */

import type { StreamDonation } from '@/components/features/stream/donation/types'
import { supabase } from '@/lib/supabase'
import { CheckCircle, ChevronDown, ChevronUp, Sparkles, Target, Trophy, Undo2, XCircle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

interface ActiveMissionDisplayProps {
  roomId: string
  /** 최대 표시 개수 */
  maxItems?: number
  /** 컴팩트 모드 (작은 화면용) */
  compact?: boolean
  /** 전체 패널 열기 콜백 */
  onOpenPanel?: () => void
}

// 애니메이션 상태 타입
type AnimationState = 'entering' | 'accepted' | 'success' | 'failed' | 'rejected' | 'shaking' | 'fadeOut'

// 원본 상태 (entering 이전)
type OriginalState = 'accepted' | 'success' | 'failed' | 'rejected'

// 애니메이션 중인 미션 정보
interface AnimatingMission {
  id: number
  state: AnimationState
  originalState: OriginalState
  mission: StreamDonation
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const streamDonationsTable = () => supabase.from('stream_donations') as any

export function ActiveMissionDisplay({
  roomId,
  maxItems = 5,
  compact = false,
  onOpenPanel,
}: ActiveMissionDisplayProps) {
  // 실시간 수락된 미션 목록 (직접 관리)
  const [acceptedMissions, setAcceptedMissions] = useState<StreamDonation[]>([])
  // 애니메이션 중인 미션들
  const [animatingMissions, setAnimatingMissions] = useState<AnimatingMission[]>([])
  // 처리된 미션 ID-상태 추적 (중복 방지)
  const processedRef = useRef<Map<number, string>>(new Map())
  // 초기 로딩 완료 여부
  const initialLoadedRef = useRef(false)
  // 접기/펼치기 상태
  const [isExpanded, setIsExpanded] = useState(false)

  // 초기 데이터 로드
  useEffect(() => {
    if (!roomId || initialLoadedRef.current) return

    const loadInitialData = async () => {
      const todayStart = new Date()
      todayStart.setHours(0, 0, 0, 0)

      const { data, error } = await streamDonationsTable()
        .select(`
          id,
          room_id,
          donor_id,
          recipient_partner_id,
          amount,
          heart_image,
          message,
          log_id,
          donation_type,
          status,
          mission_text,
          video_url,
          video_title,
          video_thumbnail,
          processed_at,
          processed_by,
          escrow_amount,
          created_at,
          donor:members!stream_donations_donor_id_fkey(id, name, profile_image)
        `)
        .eq('room_id', roomId)
        .eq('donation_type', 'mission')
        .eq('status', 'accepted')
        .gte('created_at', todayStart.toISOString())
        .order('created_at', { ascending: true })

      if (!error && data) {
        setAcceptedMissions(data as StreamDonation[])
        initialLoadedRef.current = true
      }
    }

    loadInitialData()
  }, [roomId])

  // 애니메이션 시작
  const startAnimation = useCallback((mission: StreamDonation, originalState: OriginalState) => {
    // 이미 같은 상태로 처리된 경우 무시
    if (processedRef.current.get(mission.id) === originalState) return
    processedRef.current.set(mission.id, originalState)


    // 진입 애니메이션부터 시작
    setAnimatingMissions((prev) => [
      ...prev.filter((m) => m.id !== mission.id),
      { id: mission.id, state: 'entering', originalState, mission },
    ])

    // 50ms 후 실제 상태로 전환 (슬라이드인 완료)
    setTimeout(() => {
      setAnimatingMissions((prev) =>
        prev.map((m) => (m.id === mission.id ? { ...m, state: originalState } : m))
      )
    }, 50)

    // 실패의 경우 shake 애니메이션 추가
    if (originalState === 'failed' || originalState === 'rejected') {
      setTimeout(() => {
        setAnimatingMissions((prev) =>
          prev.map((m) => (m.id === mission.id ? { ...m, state: 'shaking' } : m))
        )
      }, 1500)
    }

    // 표시 시간 후 fadeOut
    const displayDuration = 2500
    setTimeout(() => {
      setAnimatingMissions((prev) =>
        prev.map((m) => (m.id === mission.id ? { ...m, state: 'fadeOut' } : m))
      )
    }, displayDuration)

    // 완전히 제거
    setTimeout(() => {
      setAnimatingMissions((prev) => prev.filter((m) => m.id !== mission.id))
    }, displayDuration + 600)
  }, [])

  // 직접 Supabase Realtime 구독 (즉각적인 반응을 위해)
  useEffect(() => {
    if (!roomId) return


    const channel = supabase
      .channel(`mission-display-${roomId}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE 모두 감지
          schema: 'public',
          table: 'stream_donations',
          filter: `room_id=eq.${roomId}`,
        },
        async (payload) => {
          const eventType = payload.eventType
          const newData = payload.new as { id: number; status: string; donation_type: string }
          const oldData = payload.old as { id: number; status: string }


          // 미션 타입만 처리
          if (newData?.donation_type !== 'mission') return

          // INSERT: 새 미션이 추가되었을 때 (pending 상태)
          if (eventType === 'INSERT') {
            // pending 상태는 시청자에게 표시하지 않음
            return
          }

          // UPDATE: 상태 변경
          if (eventType === 'UPDATE') {
            const newStatus = newData.status
            const oldStatus = oldData?.status

            // 상태가 변경되지 않았으면 무시
            if (oldStatus === newStatus) return

            // 전체 데이터 조회 (donor 정보 포함)
            const { data: fullDonation, error } = await streamDonationsTable()
              .select(`
                id,
                room_id,
                donor_id,
                recipient_partner_id,
                amount,
                heart_image,
                message,
                log_id,
                donation_type,
                status,
                mission_text,
                video_url,
                video_title,
                video_thumbnail,
                processed_at,
                processed_by,
                escrow_amount,
                created_at,
                donor:members!stream_donations_donor_id_fkey(id, name, profile_image)
              `)
              .eq('id', newData.id)
              .single()

            if (error) {
              console.error('미션 데이터 조회 실패:', error)
              return
            }

            const mission = fullDonation as StreamDonation

            // 상태별 처리
            switch (newStatus) {
              case 'accepted':
                // 수락됨 → 목록에 추가 + 애니메이션
                setAcceptedMissions((prev) => {
                  // 이미 있으면 무시
                  if (prev.some((m) => m.id === mission.id)) return prev
                  return [...prev, mission]
                })
                // 수락 애니메이션
                if (!processedRef.current.has(mission.id)) {
                  startAnimation(mission, 'accepted')
                }
                break

              case 'success':
                // 성공 → 목록에서 제거 + 애니메이션
                setAcceptedMissions((prev) => prev.filter((m) => m.id !== mission.id))
                startAnimation(mission, 'success')
                break

              case 'failed':
                // 실패 → 목록에서 제거 + 애니메이션
                setAcceptedMissions((prev) => prev.filter((m) => m.id !== mission.id))
                startAnimation(mission, 'failed')
                break

              case 'rejected':
                // 거절 → 목록에서 제거 + 애니메이션
                setAcceptedMissions((prev) => prev.filter((m) => m.id !== mission.id))
                startAnimation(mission, 'rejected')
                break

              case 'pending':
                // pending으로 돌아간 경우 (거의 없음) → 목록에서 제거
                setAcceptedMissions((prev) => prev.filter((m) => m.id !== mission.id))
                break
            }
          }
        }
      )
      .subscribe((status) => {
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId, startAnimation])

  // 표시할 미션 (애니메이션 중인 것 제외)
  const animatingIds = new Set(animatingMissions.map((m) => m.id))
  const displayMissions = acceptedMissions
    .filter((m) => !animatingIds.has(m.id))
    .slice(0, maxItems)

  // 미션이 없으면 숨김
  if (displayMissions.length === 0 && animatingMissions.length === 0) {
    return null
  }

  if (compact) {
    return (
      <CompactMissionDisplay
        missions={displayMissions}
        animatingMissions={animatingMissions}
        isExpanded={isExpanded}
        onToggleExpand={() => setIsExpanded(!isExpanded)}
        onOpenPanel={onOpenPanel}
        maxItems={maxItems}
      />
    )
  }

  return (
    <div className="bg-gradient-to-r from-purple-900/80 to-indigo-900/80 backdrop-blur-sm rounded-lg border border-purple-500/30 overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-2.5 py-1.5 bg-purple-800/50 border-b border-purple-500/30">
        <Target className="w-3.5 h-3.5 text-purple-300" />
        <span className="text-[11px] font-semibold text-white">진행 중인 미션</span>
        {displayMissions.length > 0 && (
          <span className="text-[10px] text-purple-300">
            ({displayMissions.length})
          </span>
        )}
      </div>

      {/* 미션 목록 */}
      <div className="divide-y divide-purple-500/20 relative max-h-[120px] overflow-y-auto">
        {/* 애니메이션 중인 미션 */}
        {animatingMissions.map((item) => (
          <AnimatedMissionItem
            key={`anim-${item.id}`}
            mission={item.mission}
            state={item.state}
            originalState={item.originalState}
          />
        ))}

        {/* 진행 중인 미션 */}
        {displayMissions.map((mission) => (
          <MissionItem key={mission.id} mission={mission} />
        ))}
      </div>

      {/* 글로벌 스타일 */}
      <style>{`
        @keyframes slideInFromRight {
          0% { 
            transform: translateX(100%);
            opacity: 0;
          }
          100% { 
            transform: translateX(0);
            opacity: 1;
          }
        }
        @keyframes shimmerGold {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
        @keyframes sparkle {
          0%, 100% { opacity: 0; transform: scale(0) rotate(0deg); }
          50% { opacity: 1; transform: scale(1) rotate(180deg); }
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 5px currentColor; }
          50% { box-shadow: 0 0 20px currentColor, 0 0 30px currentColor; }
        }
        @keyframes fadeOutUp {
          0% { 
            opacity: 1;
            transform: translateY(0);
          }
          100% { 
            opacity: 0;
            transform: translateY(-20px);
          }
        }
        @keyframes fadeOutShake {
          0% { 
            opacity: 1;
            transform: translateX(0);
          }
          20% { transform: translateX(-10px); }
          40% { transform: translateX(10px); }
          60% { transform: translateX(-5px); opacity: 0.7; }
          80% { transform: translateX(5px); opacity: 0.4; }
          100% { 
            opacity: 0;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  )
}

/** 컴팩트 모드 */
function CompactMissionDisplay({
  missions,
  animatingMissions,
  isExpanded,
  onToggleExpand,
  onOpenPanel,
  maxItems = 3,
}: {
  missions: StreamDonation[]
  animatingMissions: AnimatingMission[]
  isExpanded: boolean
  onToggleExpand: () => void
  onOpenPanel?: () => void
  maxItems?: number
}) {
  const hasAnimation = animatingMissions.length > 0
  const firstAnim = animatingMissions[0]

  // 상태별 스타일
  const getAnimationStyle = (state: AnimationState, originalState: OriginalState) => {
    const baseState = state === 'fadeOut' || state === 'shaking' || state === 'entering' ? originalState : state
    
    switch (baseState) {
      case 'accepted':
        return {
          bg: 'bg-gradient-to-r from-blue-500/60 to-indigo-500/60 border-blue-400/60',
          icon: <CheckCircle className="w-4 h-4 text-blue-300 flex-shrink-0" />,
          text: '🎯 미션 수락!',
          textColor: 'text-blue-100',
        }
      case 'success':
        return {
          bg: 'bg-gradient-to-r from-yellow-500/60 via-amber-400/70 to-yellow-500/60 border-yellow-400/60',
          icon: <Trophy className="w-4 h-4 text-yellow-300 flex-shrink-0" />,
          text: '🎉 미션 성공!',
          textColor: 'text-yellow-100',
        }
      case 'failed':
        return {
          bg: 'bg-gradient-to-r from-red-600/60 to-red-500/60 border-red-400/60',
          icon: <XCircle className="w-4 h-4 text-red-300 flex-shrink-0" />,
          text: '❌ 미션 실패',
          textColor: 'text-red-100',
        }
      case 'rejected':
        return {
          bg: 'bg-gradient-to-r from-rose-600/60 to-pink-500/60 border-rose-400/60',
          icon: <Undo2 className="w-4 h-4 text-rose-300 flex-shrink-0" />,
          text: '💸 미션 거절 (환불됨)',
          textColor: 'text-rose-100',
        }
      default:
        return {
          bg: 'bg-purple-900/60 border-purple-500/30',
          icon: <Target className="w-4 h-4 text-purple-300 flex-shrink-0" />,
          text: '',
          textColor: 'text-purple-100',
        }
    }
  }

  const animStyle = hasAnimation ? getAnimationStyle(firstAnim.state, firstAnim.originalState) : null
  const isEntering = hasAnimation && firstAnim.state === 'entering'
  const isFadeOut = hasAnimation && firstAnim.state === 'fadeOut'
  const isShaking = hasAnimation && firstAnim.state === 'shaking'
  const isSuccess = hasAnimation && firstAnim.originalState === 'success'
  const isFailed = hasAnimation && (firstAnim.originalState === 'failed' || firstAnim.originalState === 'rejected')

  const totalCount = missions.length + animatingMissions.length

  return (
    <div
      className={`backdrop-blur-sm rounded-lg border transition-all duration-300 overflow-hidden relative shadow-lg ${
        hasAnimation && animStyle
          ? animStyle.bg
          : 'bg-purple-900/70 border-purple-500/40'
      }`}
      style={{
        animation: isEntering
          ? 'slideInFromRight 0.4s ease-out forwards'
          : isShaking
            ? 'shake 0.5s ease-in-out'
            : isFadeOut
              ? isFailed 
                ? 'fadeOutShake 0.6s ease-out forwards'
                : 'fadeOutUp 0.5s ease-out forwards'
              : undefined,
      }}
    >
      {/* 헤더 (항상 표시) */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-purple-800/30 transition-colors"
      >
        {hasAnimation && animStyle ? (
          <>
            <div 
              className={`flex-shrink-0 ${isSuccess && !isFadeOut ? 'animate-bounce' : ''}`}
              style={{ animation: isSuccess && !isFadeOut ? 'glow 1s ease-in-out infinite' : undefined, color: '#fbbf24' }}
            >
              {animStyle.icon}
            </div>
            <div className="flex-1 min-w-0 overflow-hidden text-left">
              <span className={`text-[11px] font-bold truncate block ${animStyle.textColor}`}>
                {animStyle.text}
              </span>
              <p className="text-[9px] text-white/80 truncate">
                {firstAnim.mission.donor?.name} · {firstAnim.mission.mission_text}
              </p>
            </div>
            {/* 성공 시 반짝이는 별들 */}
            {isSuccess && !isFadeOut && (
              <>
                <Sparkles 
                  className="absolute top-0.5 right-0.5 w-2.5 h-2.5 text-yellow-300" 
                  style={{ animation: 'sparkle 0.8s ease-in-out infinite' }}
                />
                <Sparkles 
                  className="absolute bottom-0.5 right-3 w-2 h-2 text-amber-300" 
                  style={{ animation: 'sparkle 0.8s ease-in-out infinite 0.2s' }}
                />
              </>
            )}
          </>
        ) : (
          <>
            <Target className="w-3.5 h-3.5 text-purple-300 flex-shrink-0" />
            <div className="flex-1 min-w-0 overflow-hidden text-left">
              {missions.length > 0 ? (
                <>
                  <p className="text-[11px] font-medium text-purple-100 truncate">
                    {missions[0].mission_text}
                  </p>
                  <p className="text-[9px] text-purple-200/80 truncate">
                    {missions[0].donor?.name || '익명'} · {missions[0].amount.toLocaleString()}P
                  </p>
                </>
              ) : (
                <p className="text-[11px] font-medium text-purple-100">
                  진행 중인 미션 {totalCount > 0 ? `(${totalCount})` : ''}
                </p>
              )}
            </div>
            {missions.length > 1 && (
              <span className="flex-shrink-0 px-1.5 py-0.5 text-[9px] font-semibold bg-purple-700/80 text-purple-100 rounded-full min-w-[20px] text-center">
                +{missions.length - 1}
              </span>
            )}
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5 text-purple-300 flex-shrink-0" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 text-purple-300 flex-shrink-0" />
            )}
          </>
        )}
      </button>

      {/* 펼쳐진 미션 목록 */}
      {isExpanded && !hasAnimation && missions.length > 0 && (
        <div className="border-t border-purple-500/20 max-h-[200px] overflow-y-auto">
          {missions.slice(0, maxItems).map((mission) => (
            <div
              key={mission.id}
              className="px-2.5 py-2 flex items-start gap-2 hover:bg-purple-800/20 transition-colors"
            >
              <div className="flex-shrink-0 w-6 h-6 rounded-full overflow-hidden bg-purple-700">
                {mission.donor?.profile_image ? (
                  <img
                    src={mission.donor.profile_image}
                    alt={mission.donor.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[9px] font-bold text-purple-300">
                    {(mission.donor?.name || '?').charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-medium text-purple-100 truncate">
                  {mission.donor?.name || '익명'}
                </p>
                <p className="text-[9px] text-purple-200/80 line-clamp-2">
                  {mission.mission_text}
                </p>
                <p className="text-[8px] text-purple-300/70 mt-0.5">
                  {mission.amount.toLocaleString()}P
                </p>
              </div>
            </div>
          ))}
          {missions.length > maxItems && (
            <div className="px-2.5 py-1.5 text-center border-t border-purple-500/20">
              <p className="text-[9px] text-purple-300">
                +{missions.length - maxItems}개 더
              </p>
            </div>
          )}
          {onOpenPanel && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onOpenPanel()
              }}
              className="w-full px-2.5 py-1.5 text-[10px] font-medium text-purple-200 bg-purple-800/40 hover:bg-purple-800/60 transition-colors border-t border-purple-500/20"
            >
              전체 미션 보기
            </button>
          )}
        </div>
      )}
      
      {/* 컴팩트용 스타일 */}
      <style>{`
        @keyframes slideInFromRight {
          0% { transform: translateX(100%); opacity: 0; }
          100% { transform: translateX(0); opacity: 1; }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-3px); }
          20%, 40%, 60%, 80% { transform: translateX(3px); }
        }
        @keyframes sparkle {
          0%, 100% { opacity: 0; transform: scale(0); }
          50% { opacity: 1; transform: scale(1); }
        }
        @keyframes glow {
          0%, 100% { filter: drop-shadow(0 0 2px currentColor); }
          50% { filter: drop-shadow(0 0 8px currentColor); }
        }
        @keyframes fadeOutUp {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-10px); }
        }
        @keyframes fadeOutShake {
          0% { opacity: 1; transform: translateX(0); }
          25% { transform: translateX(-5px); }
          50% { transform: translateX(5px); opacity: 0.6; }
          75% { transform: translateX(-3px); opacity: 0.3; }
          100% { opacity: 0; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}

/** 미션 아이템 */
function MissionItem({ mission }: { mission: StreamDonation }) {
  return (
    <div className="px-2.5 py-2 flex items-start gap-2 transition-all duration-300">
      {/* 후원자 프로필 */}
      <div className="flex-shrink-0 w-7 h-7 rounded-full overflow-hidden bg-purple-700">
        {mission.donor?.profile_image ? (
          <img
            src={mission.donor.profile_image}
            alt={mission.donor.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-purple-300">
            {(mission.donor?.name || '?').charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* 미션 정보 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[11px] font-medium text-white truncate">
            {mission.donor?.name || '익명'}
          </span>
          <span className="text-[9px] text-purple-300">
            {mission.amount.toLocaleString()}P
          </span>
        </div>
        <p className="text-[10px] text-purple-100 line-clamp-1">
          {mission.mission_text}
        </p>
      </div>

      {/* 진행중 표시 */}
      <div className="flex-shrink-0">
        <span className="inline-flex items-center px-1 py-0.5 text-[8px] font-medium bg-green-500/80 text-white rounded animate-pulse">
          진행중
        </span>
      </div>
    </div>
  )
}

/** 애니메이션 중인 미션 아이템 */
function AnimatedMissionItem({
  mission,
  state,
  originalState,
}: {
  mission: StreamDonation
  state: AnimationState
  originalState: OriginalState
}) {
  const isFadeOut = state === 'fadeOut'
  const isEntering = state === 'entering'
  const isShaking = state === 'shaking'
  const isSuccess = originalState === 'success'
  const isFailed = originalState === 'failed' || originalState === 'rejected'

  // 상태별 설정
  const getConfig = () => {
    switch (originalState) {
      case 'accepted':
        return {
          bgGradient: 'from-blue-600/60 via-indigo-500/70 to-blue-600/60',
          iconBg: 'from-blue-400 to-indigo-500',
          iconShadow: 'shadow-blue-400/60',
          icon: <CheckCircle className="w-5 h-5 text-white" />,
          title: '🎯 미션 수락!',
          titleColor: 'text-blue-100',
          subtitle: '미션이 시작되었습니다',
          showSparkle: true,
          sparkleColor: '#60a5fa',
        }
      case 'success':
        return {
          bgGradient: 'from-yellow-500/70 via-amber-400/80 to-yellow-500/70',
          iconBg: 'from-yellow-400 to-amber-500',
          iconShadow: 'shadow-yellow-400/70',
          icon: <Trophy className="w-5 h-5 text-white" />,
          title: '🎉 미션 성공!',
          titleColor: 'text-yellow-100',
          subtitle: '축하합니다!',
          showSparkle: true,
          sparkleColor: '#fbbf24',
        }
      case 'failed':
        return {
          bgGradient: 'from-red-600/70 via-red-500/80 to-red-600/70',
          iconBg: 'from-red-500 to-red-600',
          iconShadow: 'shadow-red-400/60',
          icon: <XCircle className="w-5 h-5 text-white" />,
          title: '❌ 미션 실패',
          titleColor: 'text-red-100',
          subtitle: '다음 기회에...',
          showSparkle: false,
          sparkleColor: null,
        }
      case 'rejected':
        return {
          bgGradient: 'from-rose-600/70 via-pink-500/80 to-rose-600/70',
          iconBg: 'from-rose-500 to-pink-500',
          iconShadow: 'shadow-rose-400/60',
          icon: <Undo2 className="w-5 h-5 text-white" />,
          title: '💸 미션 거절',
          titleColor: 'text-rose-100',
          subtitle: `${mission.amount.toLocaleString()}P 환불됨`,
          showSparkle: false,
          sparkleColor: null,
        }
      default:
        return {
          bgGradient: 'from-purple-500/60 via-indigo-400/70 to-purple-500/60',
          iconBg: 'from-purple-400 to-indigo-500',
          iconShadow: 'shadow-purple-400/50',
          icon: <Target className="w-5 h-5 text-white" />,
          title: '미션',
          titleColor: 'text-purple-100',
          subtitle: '',
          showSparkle: false,
          sparkleColor: null,
        }
    }
  }

  const config = getConfig()

  return (
    <div
      className={`relative overflow-hidden transition-all`}
      style={{
        animation: isEntering
          ? 'slideInFromRight 0.4s ease-out forwards'
          : isShaking
            ? 'shake 0.6s ease-in-out'
            : isFadeOut
              ? isFailed
                ? 'fadeOutShake 0.6s ease-out forwards'
                : 'fadeOutUp 0.5s ease-out forwards'
              : undefined,
        maxHeight: isFadeOut ? 0 : 90,
        opacity: isEntering ? 0 : 1,
      }}
    >
      {/* 배경 그라데이션 */}
      <div
        className={`absolute inset-0 bg-gradient-to-r ${config.bgGradient}`}
        style={{
          backgroundSize: isSuccess ? '200% 100%' : undefined,
          animation: isSuccess && !isFadeOut ? 'shimmerGold 2s linear infinite' : undefined,
        }}
      />

      {/* 성공 시 반짝이는 오버레이 */}
      {isSuccess && !isFadeOut && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent"
            style={{ animation: 'shimmerGold 1.5s linear infinite' }}
          />
        </div>
      )}

      {/* 스파클 효과 */}
      {config.showSparkle && !isFadeOut && (
        <>
          <Sparkles
            className="absolute top-2 right-2 w-4 h-4"
            style={{ 
              color: config.sparkleColor || '#fff',
              animation: 'sparkle 0.8s ease-in-out infinite',
            }}
          />
          <Sparkles
            className="absolute top-4 right-8 w-3 h-3"
            style={{ 
              color: config.sparkleColor || '#fff',
              animation: 'sparkle 0.8s ease-in-out infinite 0.3s',
            }}
          />
          <Sparkles
            className="absolute bottom-2 left-2 w-3 h-3"
            style={{ 
              color: config.sparkleColor || '#fff',
              animation: 'sparkle 0.8s ease-in-out infinite 0.15s',
            }}
          />
        </>
      )}

      {/* 콘텐츠 */}
      <div className="relative px-2.5 py-2.5 flex items-center gap-2.5">
        {/* 아이콘 */}
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center 
            bg-gradient-to-br ${config.iconBg} shadow-lg ${config.iconShadow}`}
          style={{
            animation: !isFadeOut && !isShaking
              ? isSuccess
                ? 'glow 1s ease-in-out infinite, bounce 0.6s ease-in-out infinite'
                : 'bounce 0.6s ease-in-out 3'
              : undefined,
          }}
        >
          {config.icon}
        </div>

        {/* 텍스트 */}
        <div className="flex-1 min-w-0">
          <p
            className={`text-xs font-bold ${config.titleColor}`}
            style={{
              textShadow: isSuccess ? '0 0 10px rgba(251, 191, 36, 0.5)' : undefined,
            }}
          >
            {config.title}
          </p>
          <p className="text-[10px] text-white/90 truncate">
            <span className="font-medium">{mission.donor?.name}</span>
            <span className="mx-1">·</span>
            <span>{mission.mission_text}</span>
          </p>
          <p className="text-[9px] text-white/70">
            {config.subtitle || `${mission.amount.toLocaleString()}P`}
          </p>
        </div>
      </div>

      {/* 스타일 */}
      <style>{`
        @keyframes slideInFromRight {
          0% { transform: translateX(100%); opacity: 0; }
          100% { transform: translateX(0); opacity: 1; }
        }
        @keyframes shimmerGold {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
        @keyframes sparkle {
          0%, 100% { opacity: 0; transform: scale(0) rotate(0deg); }
          50% { opacity: 1; transform: scale(1) rotate(180deg); }
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 8px rgba(251, 191, 36, 0.4); }
          50% { box-shadow: 0 0 20px rgba(251, 191, 36, 0.8), 0 0 30px rgba(251, 191, 36, 0.4); }
        }
        @keyframes bounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes fadeOutUp {
          0% { opacity: 1; transform: translateY(0); max-height: 120px; }
          100% { opacity: 0; transform: translateY(-20px); max-height: 0; }
        }
        @keyframes fadeOutShake {
          0% { opacity: 1; transform: translateX(0); max-height: 120px; }
          20% { transform: translateX(-10px); }
          40% { transform: translateX(10px); }
          60% { transform: translateX(-5px); opacity: 0.6; }
          80% { transform: translateX(5px); opacity: 0.3; }
          100% { opacity: 0; transform: translateX(0); max-height: 0; }
        }
      `}</style>
    </div>
  )
}
