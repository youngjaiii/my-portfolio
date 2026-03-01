/**
 * DonationControlCenter - 호스트용 도네이션 컨트롤 센터
 *
 * 호스트가 도네이션을 관리하는 바텀시트
 * - 관리 모드: 대기/완료/스킵 탭
 * - 기록 모드: 후원자별/시간순 보기
 * - 타입별 필터링 (일반/미션/영상)
 * - 도네이션 처리 (읽기, 완료, 스킵, 재생)
 */

import { SlideSheet } from '@/components/ui/SlideSheet'
import { useDonationQueue } from '@/hooks/useDonationQueue'
import { useToast } from '@/hooks/useToast'
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Filter,
  Gift,
  LayoutList,
  Loader2,
  Play,
  Settings,
  SkipForward,
  Target,
  Users,
  Video,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type {
  DonationType,
  RoomType,
  StreamDonation,
} from './types'
import { DONATION_TYPE_CONFIGS, getAvailableDonationTypes } from './types'

type TabType = 'pending' | 'inprogress' | 'completed' | 'skipped'
type ViewMode = 'manage' | 'history'
type HistorySortType = 'by_donor' | 'by_time'

/** 후원자별 그룹 */
interface DonorGroup {
  donorId: string
  donorName: string
  donorProfileImage: string | null
  totalAmount: number
  donationCount: number
  donations: StreamDonation[]
}

interface DonationControlCenterProps {
  isOpen: boolean
  onClose: () => void
  roomId: string
  roomType: RoomType
  /** 영상 재생 핸들러 (비디오룸용) */
  onPlayVideo?: (videoUrl: string, donation: StreamDonation) => void
}

export function DonationControlCenter({
  isOpen,
  onClose,
  roomId,
  roomType,
  onPlayVideo,
}: DonationControlCenterProps) {
  // 뷰 모드: 관리 / 기록 - 기본값을 'manage'로 변경 (호스트 주요 작업)
  const [viewMode, setViewMode] = useState<ViewMode>('manage')
  
  // 관리 모드 탭 - 기본값을 'pending'으로 변경 (대기 중인 후원 우선)
  const [activeTab, setActiveTab] = useState<TabType>('pending')
  
  // 기록 모드 정렬
  const [historySort, setHistorySort] = useState<HistorySortType>('by_donor')
  
  const [typeFilter, setTypeFilter] = useState<DonationType | 'all'>('all')
  const [showFilters, setShowFilters] = useState(false)

  const toast = useToast()

  const {
    donations: allDonations,
    pendingDonations,
    acceptedMissions,
    completedDonations,
    skippedDonations,
    isLoading,
    stats,
    refetch,
    updateDonationStatus,
    acceptMission,
    rejectMission,
    completeMissionSuccess,
    completeMissionFailed,
  } = useDonationQueue({
    roomId,
    enabled: isOpen,
    enableRealtime: true,
  })

  // 현재 탭에 해당하는 도네이션 (관리 모드)
  const currentDonations =
    activeTab === 'pending'
      ? pendingDonations
      : activeTab === 'inprogress'
        ? acceptedMissions
        : activeTab === 'completed'
          ? completedDonations
          : skippedDonations

  // 타입 필터 적용
  const filteredDonations =
    typeFilter === 'all'
      ? currentDonations
      : currentDonations.filter((d) => d.donation_type === typeFilter)

  // 사용 가능한 도네이션 타입
  const availableTypes = getAvailableDonationTypes(roomType)

  // 후원자별 그룹핑 (기록 모드)
  const donorGroups = useMemo((): DonorGroup[] => {
    const groupMap = new Map<string, DonorGroup>()

    for (const donation of allDonations) {
      const donorId = donation.donor_id
      const existing = groupMap.get(donorId)

      if (existing) {
        existing.totalAmount += donation.amount
        existing.donationCount += 1
        existing.donations.push(donation)
      } else {
        groupMap.set(donorId, {
          donorId,
          donorName: donation.donor?.name || '익명',
          donorProfileImage: donation.donor?.profile_image || null,
          totalAmount: donation.amount,
          donationCount: 1,
          donations: [donation],
        })
      }
    }

    // 총 후원금액 내림차순 정렬
    return Array.from(groupMap.values()).sort(
      (a, b) => b.totalAmount - a.totalAmount
    )
  }, [allDonations])

  // 시간순 정렬 (기록 모드, 최신순)
  const sortedByTime = useMemo(() => {
    return [...allDonations].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }, [allDonations])

  // 도네이션 처리 핸들러
  const handleComplete = async (donation: StreamDonation) => {
    const success = await updateDonationStatus(donation.id, 'completed')
    if (success) {
      toast.success('도네이션을 처리했습니다.')
    } else {
      toast.error('처리에 실패했습니다.')
    }
  }

  const handleSkip = async (donation: StreamDonation) => {
    const success = await updateDonationStatus(donation.id, 'skipped')
    if (success) {
      toast.info('도네이션을 스킵했습니다.')
    } else {
      toast.error('스킵에 실패했습니다.')
    }
  }

  const handlePlay = (donation: StreamDonation) => {
    if (donation.video_url && onPlayVideo) {
      onPlayVideo(donation.video_url, donation)
    }
  }

  // 미션 수락
  const handleAcceptMission = async (donation: StreamDonation) => {
    const result = await acceptMission(donation.id)
    if (result.success) {
      toast.success('미션을 수락했습니다! 포인트는 보관 중입니다.')
    } else {
      toast.error(result.errorMessage || '미션 수락에 실패했습니다.')
    }
  }

  // 미션 거절 (환불)
  const handleRejectMission = async (donation: StreamDonation) => {
    const result = await rejectMission(donation.id)
    if (result.success) {
      toast.success(`미션이 거절되었습니다. ${result.refundAmount?.toLocaleString()}P 전액 환불 완료`)
    } else {
      toast.error(result.errorMessage || '미션 거절에 실패했습니다.')
    }
  }

  // 미션 성공
  const handleMissionSuccess = async (donation: StreamDonation) => {
    const result = await completeMissionSuccess(donation.id)
    if (result.success) {
      toast.success(`미션 성공! 🎉 ${donation.amount.toLocaleString()}P 지급 완료`)
    } else {
      toast.error(result.errorMessage || '처리에 실패했습니다.')
    }
  }

  // 미션 실패
  const handleMissionFailed = async (donation: StreamDonation) => {
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

  // 탭 클릭 핸들러
  const handleTabClick = (tab: TabType) => (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setActiveTab(tab)
  }

  // 뷰 모드 전환 핸들러
  const handleViewModeClick = (mode: ViewMode) => (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setViewMode(mode)
  }

  // 기록 정렬 전환 핸들러
  const handleHistorySortClick = (sort: HistorySortType) => (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setHistorySort(sort)
  }

  return (
    <SlideSheet
      isOpen={isOpen}
      onClose={onClose}
      title="후원 관리"
      initialHeight={0.75}
      minHeight={0.5}
      maxHeight={0.95}
      zIndex={9999}
      noPadding
      modalWidth={560}
      footer={
        <div className="px-4">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isLoading}
            className="w-full py-2 text-sm font-medium text-amber-600 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50"
          >
            {isLoading ? '불러오는 중...' : '새로고침'}
          </button>
        </div>
      }
    >
      {/* 요약 통계 */}
      <div className="mx-4 px-4 py-3 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200/50 mb-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-lg font-bold text-amber-600">
              {stats.totalAmount.toLocaleString()}P
            </p>
            <p className="text-[10px] text-gray-500">총 후원</p>
          </div>
          <div>
            <p className="text-lg font-bold text-orange-500">
              {stats.totalCount}
            </p>
            <p className="text-[10px] text-gray-500">후원 횟수</p>
          </div>
          <div>
            <p className="text-lg font-bold text-pink-500">
              {stats.uniqueDonorCount}
            </p>
            <p className="text-[10px] text-gray-500">후원자 수</p>
          </div>
        </div>
      </div>

      {/* 뷰 모드 전환 - 관리를 먼저 배치 */}
      <div className="flex mx-4 mb-2 bg-gray-100 rounded-lg p-1">
        <button
          type="button"
          onClick={handleViewModeClick('manage')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-md transition-colors ${
            viewMode === 'manage'
              ? 'bg-white text-amber-600 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Settings className="w-4 h-4" />
          관리
          {(stats.pendingCount > 0 || stats.acceptedMissionCount > 0) && (
            <span className="px-1.5 py-0.5 text-[10px] bg-red-500 text-white rounded-full font-bold animate-pulse">
              {stats.pendingCount + stats.acceptedMissionCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={handleViewModeClick('history')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-md transition-colors ${
            viewMode === 'history'
              ? 'bg-white text-amber-600 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <LayoutList className="w-4 h-4" />
          후원 기록
        </button>
      </div>

      {/* 기록 모드 */}
      {viewMode === 'history' && (
        <>
          {/* 정렬 탭 */}
          <div className="flex mx-4 border-b border-gray-100 mb-2">
            <button
              type="button"
              onClick={handleHistorySortClick('by_donor')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors ${
                historySort === 'by_donor'
                  ? 'text-amber-600 border-b-2 border-amber-500'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Users className="w-4 h-4" />
              후원자별
            </button>
            <button
              type="button"
              onClick={handleHistorySortClick('by_time')}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors ${
                historySort === 'by_time'
                  ? 'text-amber-600 border-b-2 border-amber-500'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Clock className="w-4 h-4" />
              시간순
            </button>
          </div>

          {/* 기록 목록 */}
          <div className="px-4 flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
              </div>
            ) : stats.totalCount === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <Gift className="w-12 h-12 mb-3 opacity-50" />
                <p className="text-sm">아직 후원이 없습니다</p>
              </div>
            ) : historySort === 'by_donor' ? (
              <DonorGroupList groups={donorGroups} />
            ) : (
              <TimelineList donations={sortedByTime} />
            )}
          </div>
        </>
      )}

      {/* 관리 모드 */}
      {viewMode === 'manage' && (
        <>
          {/* 상태 탭 - 대기/진행중 강조 */}
          <div className="flex mx-4 border-b border-gray-100 mb-2 overflow-x-auto">
            <button
              type="button"
              onClick={handleTabClick('pending')}
              className={`flex-shrink-0 flex items-center justify-center gap-1 px-4 py-2.5 text-sm font-medium transition-colors relative ${
                activeTab === 'pending'
                  ? 'text-red-600 border-b-2 border-red-500'
                  : stats.pendingCount > 0
                    ? 'text-red-500 hover:text-red-600'
                    : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Clock className="w-4 h-4" />
              대기
              {stats.pendingCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] bg-red-500 text-white rounded-full font-bold animate-pulse">
                  {stats.pendingCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={handleTabClick('inprogress')}
              className={`flex-shrink-0 flex items-center justify-center gap-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'inprogress'
                  ? 'text-green-600 border-b-2 border-green-500'
                  : stats.acceptedMissionCount > 0
                    ? 'text-green-500 hover:text-green-600'
                    : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Target className="w-4 h-4" />
              진행중
              {stats.acceptedMissionCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] bg-green-500 text-white rounded-full font-bold">
                  {stats.acceptedMissionCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={handleTabClick('completed')}
              className={`flex-shrink-0 flex items-center justify-center gap-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'completed'
                  ? 'text-gray-700 border-b-2 border-gray-400'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Check className="w-4 h-4" />
              완료
            </button>
            <button
              type="button"
              onClick={handleTabClick('skipped')}
              className={`flex-shrink-0 flex items-center justify-center gap-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === 'skipped'
                  ? 'text-gray-700 border-b-2 border-gray-400'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <SkipForward className="w-4 h-4" />
              스킵
            </button>
          </div>

          {/* 필터 토글 */}
          <div className="mx-4 mb-2">
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
            >
              <Filter className="w-4 h-4" />
              필터
              {showFilters ? (
                <ChevronUp className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
            </button>

            {/* 필터 옵션 */}
            {showFilters && (
              <div className="flex gap-2 mt-2 overflow-x-auto pb-1">
                <FilterButton
                  active={typeFilter === 'all'}
                  onClick={() => setTypeFilter('all')}
                  label="전체"
                  icon={<Users className="w-3 h-3" />}
                />
                {availableTypes.map((type) => {
                  const config = DONATION_TYPE_CONFIGS[type]
                  return (
                    <FilterButton
                      key={type}
                      active={typeFilter === type}
                      onClick={() => setTypeFilter(type)}
                      label={config.label}
                      icon={
                        type === 'basic' ? (
                          <Gift className="w-3 h-3" />
                        ) : type === 'mission' ? (
                          <Target className="w-3 h-3" />
                        ) : (
                          <Video className="w-3 h-3" />
                        )
                      }
                    />
                  )
                })}
              </div>
            )}
          </div>

          {/* 관리 목록 */}
          <div className="px-4 flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
              </div>
            ) : filteredDonations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <Gift className="w-12 h-12 mb-3 opacity-50" />
                <p className="text-sm">
                  {activeTab === 'pending'
                    ? '대기 중인 도네이션이 없습니다'
                    : activeTab === 'inprogress'
                      ? '진행 중인 미션이 없습니다'
                      : activeTab === 'completed'
                        ? '처리 완료된 도네이션이 없습니다'
                        : '스킵된 도네이션이 없습니다'}
                </p>
              </div>
            ) : (
              <div className="space-y-3 pb-4">
                {filteredDonations.map((donation) => (
                  <DonationQueueItem
                    key={donation.id}
                    donation={donation}
                    roomType={roomType}
                    onComplete={handleComplete}
                    onSkip={handleSkip}
                    onPlay={handlePlay}
                    onAcceptMission={handleAcceptMission}
                    onRejectMission={handleRejectMission}
                    onMissionSuccess={handleMissionSuccess}
                    onMissionFailed={handleMissionFailed}
                    showActions={activeTab === 'pending' || activeTab === 'inprogress'}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </SlideSheet>
  )
}

/** 필터 버튼 */
function FilterButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean
  onClick: () => void
  label: string
  icon: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
        active
          ? 'bg-amber-500 text-white'
          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

/** 후원자별 목록 */
function DonorGroupList({ groups }: { groups: DonorGroup[] }) {
  return (
    <div className="divide-y divide-gray-50">
      {groups.map((group, index) => (
        <DonorGroupItem key={group.donorId} group={group} rank={index + 1} />
      ))}
    </div>
  )
}

/** 후원자 그룹 아이템 */
function DonorGroupItem({ group, rank }: { group: DonorGroup; rank: number }) {
  return (
    <div className="py-2">
      {/* 후원자 헤더 */}
      <div className="flex items-center gap-2 mb-1.5">
        {/* 순위 배지 */}
        <div
          className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
            rank === 1
              ? 'bg-gradient-to-br from-yellow-400 to-amber-500 text-white'
              : rank === 2
                ? 'bg-gradient-to-br from-gray-300 to-gray-400 text-white'
                : rank === 3
                  ? 'bg-gradient-to-br from-amber-600 to-amber-700 text-white'
                  : 'bg-gray-200 text-gray-600'
          }`}
        >
          {rank}
        </div>

        {/* 프로필 이미지 */}
        <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-gray-100">
          {group.donorProfileImage ? (
            <img
              src={group.donorProfileImage}
              alt={group.donorName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-100 to-orange-100 text-amber-600 text-xs font-bold">
              {group.donorName.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* 이름 및 통계 */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-[#110f1a] truncate">
            {group.donorName}
          </p>
          <p className="text-[10px] text-gray-500">{group.donationCount}회 후원</p>
        </div>

        {/* 총 금액 */}
        <div className="text-right flex-shrink-0">
          <p className="text-xs font-bold text-amber-600">
            {group.totalAmount.toLocaleString()}P
          </p>
        </div>
      </div>

      {/* 상세 후원 기록 (항상 표시) */}
      <div className="ml-7 pl-2.5 border-l-2 border-amber-200 space-y-1">
        {group.donations.map((donation) => (
          <DonationDetailItem key={donation.id} donation={donation} />
        ))}
      </div>
    </div>
  )
}

/** 후원 상세 아이템 */
function DonationDetailItem({ donation }: { donation: StreamDonation }) {
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="flex items-center gap-1.5 py-1">
      {/* 하트 이미지 */}
      {donation.heart_image && (
        <img
          src={donation.heart_image}
          alt="heart"
          className="w-4 h-4 flex-shrink-0"
        />
      )}

      {/* 금액 */}
      <span className="text-[10px] font-medium text-amber-600">
        {donation.amount.toLocaleString()}P
      </span>

      {/* 수혜자 */}
      <span className="text-[10px] text-gray-500 truncate flex-1">
        → {donation.recipient_partner?.partner_name || '파트너'}
      </span>

      {/* 시간 */}
      <span className="text-[9px] text-gray-400 flex-shrink-0">
        {formatTime(donation.created_at)}
      </span>
    </div>
  )
}

/** 시간순 목록 */
function TimelineList({ donations }: { donations: StreamDonation[] }) {
  return (
    <div className="divide-y divide-gray-50">
      {donations.map((donation) => (
        <TimelineItem key={donation.id} donation={donation} />
      ))}
    </div>
  )
}

/** 시간순 아이템 */
function TimelineItem({ donation }: { donation: StreamDonation }) {
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  return (
    <div className="py-2 flex items-center gap-2">
      {/* 프로필 이미지 */}
      <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-gray-100">
        {donation.donor?.profile_image ? (
          <img
            src={donation.donor.profile_image}
            alt={donation.donor.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-100 to-orange-100 text-amber-600 text-[10px] font-bold">
            {(donation.donor?.name || '?').charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* 후원 정보 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-[#110f1a] truncate">
            {donation.donor?.name || '익명'}
          </span>
          {donation.heart_image && (
            <img
              src={donation.heart_image}
              alt="heart"
              className="w-3.5 h-3.5 flex-shrink-0"
            />
          )}
        </div>
        <p className="text-[10px] text-gray-500 truncate">
          → {donation.recipient_partner?.partner_name || '파트너'}
        </p>
      </div>

      {/* 금액 및 시간 */}
      <div className="text-right flex-shrink-0">
        <p className="text-xs font-bold text-amber-600">
          {donation.amount.toLocaleString()}P
        </p>
        <p className="text-[9px] text-gray-400">
          {formatTime(donation.created_at)}
        </p>
      </div>
    </div>
  )
}

/** 도네이션 큐 아이템 - 대기/진행중 후원에 최적화된 UI */
function DonationQueueItem({
  donation,
  roomType,
  onComplete,
  onSkip,
  onPlay,
  onAcceptMission,
  onRejectMission,
  onMissionSuccess,
  onMissionFailed,
  showActions,
}: {
  donation: StreamDonation
  roomType: RoomType
  onComplete: (d: StreamDonation) => void
  onSkip: (d: StreamDonation) => void
  onPlay: (d: StreamDonation) => void
  onAcceptMission: (d: StreamDonation) => void
  onRejectMission: (d: StreamDonation) => void
  onMissionSuccess: (d: StreamDonation) => void
  onMissionFailed: (d: StreamDonation) => void
  showActions: boolean
}) {
  const config = DONATION_TYPE_CONFIGS[donation.donation_type || 'basic']
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const isPending = donation.status === 'pending'
  const isVideo = donation.donation_type === 'video'
  const isMission = donation.donation_type === 'mission'

  return (
    <div className={`bg-white border rounded-xl shadow-sm overflow-hidden ${
      isPending && showActions ? 'border-amber-300 ring-1 ring-amber-100' : 'border-gray-100'
    }`}>
      {/* 헤더 */}
      <div className="flex items-center gap-3 p-3">
        {/* 프로필 이미지 */}
        <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-gray-100">
          {donation.donor?.profile_image ? (
            <img
              src={donation.donor.profile_image}
              alt={donation.donor.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-amber-100 to-orange-100 text-amber-600 text-sm font-bold">
              {(donation.donor?.name || '?').charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        {/* 정보 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-[#110f1a] truncate">
              {donation.donor?.name || '익명'}
            </span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                isMission
                  ? 'bg-purple-100 text-purple-700'
                  : isVideo
                    ? 'bg-red-100 text-red-700'
                    : 'bg-amber-100 text-amber-700'
              }`}
            >
              {config.label}
            </span>
            {/* 상태 배지 */}
            {isMission && donation.status === 'accepted' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                진행중
              </span>
            )}
            {donation.status === 'success' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500 text-white font-medium">
                성공
              </span>
            )}
            {donation.status === 'failed' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-400 text-white font-medium">
                실패
              </span>
            )}
            {donation.status === 'rejected' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500 text-white font-medium">
                환불
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {formatTime(donation.created_at)} · {donation.recipient_partner?.partner_name || '파트너'}에게
          </p>
        </div>

        {/* 금액 */}
        <div className="text-right flex-shrink-0">
          <p className="text-base font-bold text-amber-600">
            {donation.amount.toLocaleString()}P
          </p>
          {donation.heart_image && (
            <img
              src={donation.heart_image}
              alt="heart"
              className="w-5 h-5 ml-auto"
            />
          )}
        </div>
      </div>

      {/* 상세 내용 */}
      <div className="px-3 pb-3">
        {/* 미션 텍스트 */}
        {isMission && donation.mission_text && (
          <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
            <p className="text-xs text-purple-700 font-semibold mb-1">🎯 미션 내용</p>
            <p className="text-sm text-purple-900">{donation.mission_text}</p>
          </div>
        )}

        {/* 영상 정보 - 눈에 띄게 */}
        {isVideo && donation.video_url && (
          <div className="p-3 bg-red-50 rounded-lg border border-red-100">
            <p className="text-xs text-red-700 font-semibold mb-2">🎬 영상 도네이션</p>
            {donation.video_thumbnail && (
              <div className="relative rounded-lg overflow-hidden mb-2">
                <img
                  src={donation.video_thumbnail}
                  alt={donation.video_title || '영상'}
                  className="w-full h-24 object-cover"
                />
                {showActions && roomType === 'video' && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onPlay(donation)
                    }}
                    className="absolute inset-0 flex items-center justify-center bg-black/40 hover:bg-black/50 transition-colors"
                  >
                    <div className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center shadow-lg">
                      <Play className="w-6 h-6 text-white ml-0.5" />
                    </div>
                  </button>
                )}
              </div>
            )}
            <p className="text-sm text-red-900 font-medium truncate">
              {donation.video_title || '영상'}
            </p>
          </div>
        )}

        {/* 일반 메시지 */}
        {donation.message && !isMission && !isVideo && (
          <div className="p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500 mb-1">💬 메시지</p>
            <p className="text-sm text-gray-700">{donation.message}</p>
          </div>
        )}

        {/* 액션 버튼 - 더 크고 눈에 띄게 */}
        {showActions && (
          <div className="mt-3 flex gap-2">
            {/* 미션: 대기 중 → 수락/거절 */}
            {isMission && donation.status === 'pending' && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onAcceptMission(donation)
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold text-white bg-green-500 rounded-lg hover:bg-green-600 transition-colors shadow-sm"
                >
                  <Check className="w-4 h-4" />
                  미션 수락
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRejectMission(donation)
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                >
                  <SkipForward className="w-4 h-4" />
                  거절 (환불)
                </button>
              </>
            )}

            {/* 미션: 수락됨 → 성공/실패 */}
            {isMission && donation.status === 'accepted' && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onMissionSuccess(donation)
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold text-white bg-green-500 rounded-lg hover:bg-green-600 transition-colors shadow-sm"
                >
                  <Check className="w-4 h-4" />
                  미션 성공!
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onMissionFailed(donation)
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <SkipForward className="w-4 h-4" />
                  미션 실패
                </button>
              </>
            )}

            {/* 영상: 재생 버튼 (썸네일에 없을 경우 표시) */}
            {isVideo && roomType === 'video' && donation.video_url && !donation.video_thumbnail && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onPlay(donation)
                }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors shadow-sm"
              >
                <Play className="w-4 h-4" />
                영상 재생
              </button>
            )}

            {/* 일반/영상: 완료/스킵 */}
            {!isMission && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onComplete(donation)
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold text-white bg-green-500 rounded-lg hover:bg-green-600 transition-colors shadow-sm"
                >
                  <Check className="w-4 h-4" />
                  완료
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onSkip(donation)
                  }}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <SkipForward className="w-4 h-4" />
                  스킵
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

