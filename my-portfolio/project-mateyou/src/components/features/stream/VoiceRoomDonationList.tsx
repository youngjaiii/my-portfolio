/**
 * VoiceRoomDonationList - 보이스룸용 오늘 후원 목록 컴포넌트
 * 
 * 호스트가 오늘 받은 후원을 볼 수 있는 바텀시트
 * - 후원자별 보기 (인별 정렬)
 * - 시간순 보기 (기록 정렬)
 */

import { SlideSheet } from '@/components/ui/SlideSheet'
import type { DonorGroup, TodayDonation } from '@/hooks/useTodayDonations'
import { useTodayDonations } from '@/hooks/useTodayDonations'
import { Clock, Gift, Loader2, Users } from 'lucide-react'

type SortTab = 'by_donor' | 'by_time'

interface VoiceRoomDonationListProps {
  isOpen: boolean
  onClose: () => void
  roomId: string
}

export function VoiceRoomDonationList({
  isOpen,
  onClose,
  roomId,
}: VoiceRoomDonationListProps) {
  const [activeTab, setActiveTab] = useState<SortTab>('by_donor')

  const {
    donorGroups,
    sortedByTime,
    isLoading,
    totalAmount,
    totalCount,
    uniqueDonorCount,
    refetch,
  } = useTodayDonations({ roomId, enabled: isOpen })

  // 탭 클릭 핸들러 (드래그 방지)
  const handleTabClick = (tab: SortTab) => (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setActiveTab(tab)
  }

  return (
    <SlideSheet
      isOpen={isOpen}
      onClose={onClose}
      title="오늘 후원"
      initialHeight={0.65}
      minHeight={0.4}
      maxHeight={0.9}
      zIndex={9999}
      noPadding
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
              {totalAmount.toLocaleString()}P
            </p>
            <p className="text-[10px] text-gray-500">총 후원</p>
          </div>
          <div>
            <p className="text-lg font-bold text-orange-500">{totalCount}</p>
            <p className="text-[10px] text-gray-500">후원 횟수</p>
          </div>
          <div>
            <p className="text-lg font-bold text-pink-500">
              {uniqueDonorCount}
            </p>
            <p className="text-[10px] text-gray-500">후원자 수</p>
          </div>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex mx-4 border-b border-gray-100 mb-2">
        <button
          type="button"
          onClick={handleTabClick('by_donor')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'by_donor'
              ? 'text-amber-600 border-b-2 border-amber-500'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users className="w-4 h-4" />
          후원자별
        </button>
        <button
          type="button"
          onClick={handleTabClick('by_time')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'by_time'
              ? 'text-amber-600 border-b-2 border-amber-500'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Clock className="w-4 h-4" />
          시간순
        </button>
      </div>

      <div className="px-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-amber-500 animate-spin" />
          </div>
        ) : totalCount === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Gift className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm">아직 후원이 없습니다</p>
          </div>
        ) : activeTab === 'by_donor' ? (
          <DonorGroupList groups={donorGroups} />
        ) : (
          <TimelineList donations={sortedByTime} />
        )}
      </div>
    </SlideSheet>
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
          <p className="text-[10px] text-gray-500">
            {group.donationCount}회 후원
          </p>
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
function DonationDetailItem({ donation }: { donation: TodayDonation }) {
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
function TimelineList({ donations }: { donations: TodayDonation[] }) {
  return (
    <div className="divide-y divide-gray-50">
      {donations.map((donation) => (
        <TimelineItem key={donation.id} donation={donation} />
      ))}
    </div>
  )
}

/** 시간순 아이템 */
function TimelineItem({ donation }: { donation: TodayDonation }) {
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
