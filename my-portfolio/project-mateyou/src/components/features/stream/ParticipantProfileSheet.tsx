/**
 * ParticipantProfileSheet - 참가자 프로필 바텀시트
 *
 * 사이드바에서 프로필 클릭 시 표시
 * 보이스룸/비디오룸 모두에서 사용 가능
 *
 * UI:
 * - 프로필 사진 + 이름 + 역할 뱃지 (중앙 정렬)
 * - 액션 메뉴 리스트 (강퇴, 차단 옵션, 강퇴 내역 보기)
 * - 채팅 히스토리
 * - 현재 방 차단 상태
 */

import { Modal, SlideSheet, Typography } from '@/components'
import {
  BAN_DURATIONS,
  useBanHistory,
  useForceMuteStatus,
  useMemberMessages,
  useStreamModeration,
  type BanScope,
} from '@/hooks/useStreamModeration'
import type { StreamHost, StreamViewer } from '@/hooks/useVoiceRoom'
import { useDevice } from '@/hooks/useDevice'
import { useAuth } from '@/hooks/useAuth'
import { canOpenProfile } from '@/utils/streamProfileAccess'
import {
  AlertTriangle,
  Ban,
  Clock,
  History,
  MessageSquare,
  Mic,
  MicOff,
  Shield,
} from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

interface ParticipantProfileSheetProps {
  isOpen: boolean
  onClose: () => void
  roomId: string
  /** 프로필 대상 - 호스트 또는 시청자 */
  participant: StreamHost | StreamViewer | null
  /** 현재 방의 호스트 partner ID */
  hostPartnerId?: string | null
  /** 현재 방의 호스트 member ID */
  hostMemberId?: string | null
  /** 발언자인지 여부 */
  isSpeaker: boolean
  /** 현재 유저가 호스트인지 */
  isCurrentUserHost: boolean
  /** 현재 유저가 관리자인지 */
  isCurrentUserAdmin?: boolean
  /** 강제 뮤트 콜백 (WebRTC 연동용) */
  onForceMute?: (memberId: string) => void
  /** 강퇴 후 콜백 */
  onKicked?: (memberId: string) => void
}

export function ParticipantProfileSheet({
  isOpen,
  onClose,
  roomId,
  participant,
  hostPartnerId,
  hostMemberId,
  isSpeaker,
  isCurrentUserHost,
  isCurrentUserAdmin = false,
  onForceMute,
  onKicked,
}: ParticipantProfileSheetProps) {
  const { isDesktop } = useDevice()
  const { user } = useAuth()

  // 참가자 정보 추출
  const getMemberInfo = () => {
    if (!participant) return { memberId: '', name: '', profileImage: '' }

    // StreamHost인 경우
    if ('role' in participant) {
      const host = participant as StreamHost
      return {
        memberId: host.member_id || host.partner?.member?.id || '',
        name: host.partner?.partner_name || host.member?.name || '알 수 없음',
        profileImage:
          host.partner?.member?.profile_image || host.member?.profile_image || '',
      }
    }

    // StreamViewer인 경우
    const viewer = participant as StreamViewer
    return {
      memberId: viewer.member_id,
      name: viewer.member?.name || '알 수 없음',
      profileImage: viewer.member?.profile_image || '',
    }
  }

  const { memberId, name, profileImage } = getMemberInfo()

  // 권한 체크 - 실제로 모더레이션 권한이 있는지 확인
  const canModerate = participant
    ? canOpenProfile({
        target: participant,
        hostMemberId,
        isCurrentUserAdmin,
        isCurrentUserHost,
      })
    : false

  // 자기 자신인지 확인
  const isSelf = memberId === user?.id

  // 호스트인지 확인 (대상이 호스트인 경우)
  const isTargetHost = participant && 'role' in participant 
    ? (participant as StreamHost).role === 'owner' || 
      (participant as StreamHost).member_id === hostMemberId ||
      (participant as StreamHost).partner?.member?.id === hostMemberId
    : false

  // 차단/강퇴 가능 여부: 자기 자신이 아니고, 호스트가 아니어야 함
  const canBanOrKick = canModerate && !isSelf && !isTargetHost

  // 차단 모달 상태
  const [showBanModal, setShowBanModal] = useState(false)
  const [banDuration, setBanDuration] = useState<number | null>(null)
  const [banScope, setBanScope] = useState<BanScope>('room')
  const [banReason, setBanReason] = useState('')

  // 강퇴 내역 모달 상태
  const [showBanHistory, setShowBanHistory] = useState(false)

  // 훅
  const { data: banHistory = [] } = useBanHistory(
    memberId,
    hostPartnerId,
    hostMemberId
  )
  const { data: messages = [] } = useMemberMessages(
    memberId,
    hostPartnerId,
    hostMemberId
  )
  const { kick, ban, forceMute, forceUnmute } = useStreamModeration(roomId)
  
  // 강제 뮤트 상태 조회 (발언자일 때만)
  const { data: forceMuteStatus } = useForceMuteStatus(
    isSpeaker ? roomId : undefined,
    isSpeaker ? memberId : undefined
  )
  const isForceMuted = forceMuteStatus?.isMuted ?? false

  // 강퇴 처리
  const handleKick = async () => {
    if (!memberId) return

    // 자기 자신은 강퇴 불가
    if (isSelf) {
      toast.error('자기 자신을 강퇴할 수 없습니다')
      return
    }

    // 호스트는 강퇴 불가
    if (isTargetHost) {
      toast.error('호스트는 강퇴할 수 없습니다')
      return
    }

    if (
      !confirm(
        `${name}님을 이 방에서 강퇴하시겠습니까?\n\n강퇴된 유저는 이 방에 다시 들어올 수 없습니다.`
      )
    ) {
      return
    }

    try {
      await kick.mutateAsync({
        roomId,
        targetMemberId: memberId,
        reason: '호스트에 의한 강퇴',
      })
      toast.success(`${name}님을 강퇴했습니다`)
      onKicked?.(memberId)
      onClose()
    } catch (err) {
      console.error('강퇴 실패:', err)
      toast.error('강퇴에 실패했습니다')
    }
  }

  // 차단 처리
  const handleBan = async () => {
    if (!memberId) return

    // 자기 자신은 차단 불가
    if (isSelf) {
      toast.error('자기 자신을 차단할 수 없습니다')
      setShowBanModal(false)
      return
    }

    // 호스트는 차단 불가
    if (isTargetHost) {
      toast.error('호스트는 차단할 수 없습니다')
      setShowBanModal(false)
      return
    }

    try {
      await ban.mutateAsync({
        roomId,
        targetMemberId: memberId,
        banType: 'ban',
        scope: banScope,
        durationMinutes: banDuration,
        reason: banReason || '호스트에 의한 차단',
        hostPartnerId: hostPartnerId || undefined,
        hostMemberId: hostMemberId || undefined,
      })

      const durationLabel = banDuration
        ? BAN_DURATIONS.find((d) => d.minutes === banDuration)?.label ||
          `${banDuration}분`
        : '영구'
      const scopeLabel = banScope === 'global' ? '전체 방송' : '이 방'

      toast.success(`${name}님을 ${scopeLabel}에서 ${durationLabel} 차단했습니다`)
      setShowBanModal(false)
      onKicked?.(memberId)
      onClose()
    } catch (err) {
      console.error('차단 실패:', err)
      toast.error('차단에 실패했습니다')
    }
  }

  // 강제 뮤트 처리
  const handleForceMute = async () => {
    if (!memberId) return

    try {
      await forceMute.mutateAsync({
        roomId,
        targetMemberId: memberId,
        reason: '호스트에 의한 강제 뮤트',
      })
      toast.success(`${name}님의 마이크를 음소거했습니다`)
      onForceMute?.(memberId)
    } catch (err) {
      console.error('강제 뮤트 실패:', err)
      toast.error('음소거에 실패했습니다')
    }
  }

  // 강제 뮤트 해제 처리
  const handleForceUnmute = async () => {
    if (!memberId) return

    try {
      await forceUnmute.mutateAsync({
        roomId,
        targetMemberId: memberId,
      })
      toast.success(`${name}님의 마이크 음소거를 해제했습니다`)
    } catch (err) {
      console.error('강제 뮤트 해제 실패:', err)
      toast.error('음소거 해제에 실패했습니다')
    }
  }

  // 제재 내역 필터 (활성 차단만)
  const activeBans = banHistory.filter((b) => b.is_active)

  if (!participant) return null

  // 공통 콘텐츠
  const content = (
    <div className="pb-4">
          {/* 프로필 헤더 - 심플하고 콤팩트한 스타일 */}
          <div className="flex items-center gap-3 pb-4 mb-3 border-b border-gray-100">
            <div className="relative">
              <img
                src={
                  profileImage ||
                  `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`
                }
                alt={name}
                className="w-12 h-12 rounded-full object-cover ring-2 ring-gray-100"
              />
              {/* 온라인 인디케이터 */}
              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-400 rounded-full border-2 border-white" />
            </div>
            <div className="flex-1 min-w-0">
              <Typography variant="h3" className="text-gray-900 font-semibold text-base truncate">
                {name}
              </Typography>
              <span className={`
                inline-flex items-center gap-1 mt-0.5 px-2 py-0.5 rounded text-xs font-medium
                ${isSpeaker ? 'bg-pink-50 text-pink-600' : 'bg-gray-100 text-gray-500'}
              `}>
                {isSpeaker && <Mic className="w-3 h-3" />}
                {isSpeaker ? '발언자' : '청취자'}
              </span>
            </div>
          </div>

          {/* 호스트 액션 메뉴 - 권한이 있을 때만 표시 */}
          {canModerate && (
            <div className="space-y-1 mb-4">
              {/* 강퇴하기 - 자기 자신과 호스트는 제외 */}
              {canBanOrKick && (
                <button
                  type="button"
                  onClick={handleKick}
                  disabled={kick.isPending}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
                >
                  <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center flex-shrink-0">
                    <Ban className="w-4 h-4 text-red-400" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-gray-700">강퇴하기</p>
                    <p className="text-xs text-gray-400">이 방에서 영구 차단</p>
                  </div>
                </button>
              )}

              {/* 차단 옵션 - 자기 자신과 호스트는 제외 */}
              {canBanOrKick && (
                <button
                  type="button"
                  onClick={() => setShowBanModal(true)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
                    <Shield className="w-4 h-4 text-orange-400" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-gray-700">차단 옵션</p>
                    <p className="text-xs text-gray-400">기간·범위 설정</p>
                  </div>
                </button>
              )}

              {/* 강퇴 내역 보기 */}
              <button
                type="button"
                onClick={() => setShowBanHistory(true)}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 rounded-lg transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <History className="w-4 h-4 text-gray-500" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-gray-700">강퇴 내역</p>
                  <p className="text-xs text-gray-400">{banHistory.length}건</p>
                </div>
                {banHistory.length > 0 && (
                  <span className="w-5 h-5 rounded-full bg-gray-200 text-gray-600 text-xs font-medium flex items-center justify-center">
                    {banHistory.length}
                  </span>
                )}
              </button>

              {/* 뮤트/뮤트해제 (발언자일 때만) */}
              {isSpeaker && (
                isForceMuted ? (
                  <button
                    type="button"
                    onClick={handleForceUnmute}
                    disabled={forceUnmute.isPending}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
                      <Mic className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium text-gray-700">뮤트 해제</p>
                      <p className="text-xs text-gray-400">마이크 활성화</p>
                    </div>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleForceMute}
                    disabled={forceMute.isPending}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
                      <MicOff className="w-4 h-4 text-violet-400" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium text-gray-700">마이크 뮤트</p>
                      <p className="text-xs text-gray-400">발언자 음소거</p>
                    </div>
                  </button>
                )
              )}
            </div>
          )}

          {/* 채팅 히스토리 */}
          <div className="mb-4">
            <div className="flex items-center gap-2 px-1 mb-2">
              <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs font-medium text-gray-500">
                채팅 내역 ({messages.length})
              </span>
            </div>
            
            {messages.length === 0 ? (
              <p className="text-xs text-gray-400 px-1 py-2">메시지 없음</p>
            ) : (
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {messages.slice(0, 50).map((msg) => (
                  <div
                    key={msg.message_id}
                    className="bg-gray-50 rounded-lg px-3 py-2"
                  >
                    <p className="text-sm text-gray-700 break-words">{msg.content}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-gray-400">{msg.room_title}</span>
                      <span className="text-xs text-gray-400">
                        {new Date(msg.created_at).toLocaleDateString('ko-KR', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 현재 방 차단 상태 */}
          <div>
            <div className="flex items-center gap-2 px-1 mb-2">
              <Shield className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-xs font-medium text-gray-500">차단 상태</span>
            </div>
            
            <div className="bg-gray-50 rounded-lg px-3 py-2.5">
              {activeBans.length === 0 ? (
                <p className="text-sm text-gray-500">차단 내역 없음</p>
              ) : (
                <div className="space-y-1.5">
                  {activeBans.slice(0, 3).map((b) => (
                    <div key={b.ban_id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                        <span className="text-sm text-gray-600">
                          {b.ban_type === 'kick'
                            ? '강퇴'
                            : b.ban_type === 'ban'
                              ? '차단'
                              : '뮤트'}
                          {b.ban_scope === 'global' && ' (전체)'}
                        </span>
                      </div>
                      {b.expires_at && (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(b.expires_at).toLocaleDateString('ko-KR')}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
  )

  // PC: Modal, 모바일: SlideSheet
  if (isDesktop) {
    return (
      <>
        <Modal
          isOpen={isOpen}
          onClose={onClose}
          title=""
          size="md"
          showCloseButton={true}
        >
          {content}
        </Modal>

        {/* 강퇴 내역 모달 */}
        <Modal
          isOpen={showBanHistory}
          onClose={() => setShowBanHistory(false)}
          title="강퇴 내역"
          size="md"
        >
          {banHistory.length === 0 ? (
            <div className="py-8 text-center">
              <Shield className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">강퇴 내역이 없습니다</p>
            </div>
          ) : (
            <div className="space-y-2">
              {banHistory.map((b) => (
                <div
                  key={b.ban_id}
                  className={`rounded-lg p-3 border ${
                    b.is_active
                      ? 'bg-red-50 border-red-200'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-sm font-medium ${
                        b.is_active ? 'text-red-600' : 'text-gray-600'
                      }`}
                    >
                      {b.ban_type === 'kick'
                        ? '강퇴'
                        : b.ban_type === 'ban'
                          ? '차단'
                          : '뮤트'}
                      {b.ban_scope === 'global' && ' (전체 방송)'}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                        b.is_active
                          ? 'bg-red-100 text-red-600'
                          : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      {b.is_active ? '활성' : '만료'}
                    </span>
                  </div>
                  {b.reason && (
                    <p className="text-xs text-gray-600 mb-1">{b.reason}</p>
                  )}
                  <p className="text-xs text-gray-400">
                    {b.banned_by_name} · {new Date(b.created_at).toLocaleDateString('ko-KR')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Modal>

        {/* 차단 모달 */}
        <Modal
          isOpen={showBanModal}
          onClose={() => setShowBanModal(false)}
          title="차단 설정"
          size="md"
        >
          <div className="space-y-4">
            {/* 경고 */}
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-orange-700">
                차단된 유저는 설정한 기간 동안 입장할 수 없습니다.
              </p>
            </div>

            {/* 차단 범위 */}
            <div>
              <p className="text-sm font-semibold text-gray-800 mb-2">차단 범위</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setBanScope('room')}
                  className={`py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    banScope === 'room'
                      ? 'border-[#FE3A8F] bg-[#FE3A8F]/5 text-[#FE3A8F]'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  이 방만
                </button>
                <button
                  type="button"
                  onClick={() => setBanScope('global')}
                  className={`py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                    banScope === 'global'
                      ? 'border-[#FE3A8F] bg-[#FE3A8F]/5 text-[#FE3A8F]'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  전체 방송
                </button>
              </div>
            </div>

            {/* 차단 기간 */}
            <div>
              <p className="text-sm font-semibold text-gray-800 mb-2">차단 기간</p>
              <div className="grid grid-cols-3 gap-2">
                {BAN_DURATIONS.map((duration) => (
                  <button
                    key={duration.label}
                    type="button"
                    onClick={() => setBanDuration(duration.minutes)}
                    className={`py-2 rounded-lg border text-sm font-medium transition-colors ${
                      banDuration === duration.minutes
                        ? 'border-[#FE3A8F] bg-[#FE3A8F]/5 text-[#FE3A8F]'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {duration.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 사유 입력 */}
            <div>
              <p className="text-sm font-semibold text-gray-800 mb-2">
                차단 사유 <span className="text-gray-400 font-normal">(선택)</span>
              </p>
              <textarea
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                placeholder="차단 사유를 입력하세요"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#FE3A8F] focus:outline-none resize-none"
                rows={2}
                maxLength={200}
              />
            </div>

            {/* 버튼 */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBanModal(false)}
                className="flex-1 py-2.5 rounded-lg border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleBan}
                disabled={ban.isPending}
                className="flex-1 py-2.5 rounded-lg bg-[#FE3A8F] text-white font-medium hover:bg-[#fe4a9a] transition-colors disabled:opacity-50"
              >
                {ban.isPending ? '처리 중...' : '차단하기'}
              </button>
            </div>
          </div>
        </Modal>
      </>
    )
  }

  // 모바일: SlideSheet
  return (
    <>
      <SlideSheet
        isOpen={isOpen}
        onClose={onClose}
        title=""
        initialHeight={0.75}
        minHeight={0.4}
        maxHeight={0.9}
        zIndex={10000}
      >
        {content}
      </SlideSheet>

      {/* 강퇴 내역 모달 */}
      <SlideSheet
        isOpen={showBanHistory}
        onClose={() => setShowBanHistory(false)}
        title="강퇴 내역"
        initialHeight={0.6}
        minHeight={0.3}
        maxHeight={0.85}
        zIndex={10001}
      >
        <div className="pb-4">
          {banHistory.length === 0 ? (
            <div className="py-8 text-center">
              <Shield className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">강퇴 내역이 없습니다</p>
            </div>
          ) : (
            <div className="space-y-2">
              {banHistory.map((b) => (
                <div
                  key={b.ban_id}
                  className={`rounded-lg p-3 border ${
                    b.is_active
                      ? 'bg-red-50 border-red-200'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-sm font-medium ${
                        b.is_active ? 'text-red-600' : 'text-gray-600'
                      }`}
                    >
                      {b.ban_type === 'kick'
                        ? '강퇴'
                        : b.ban_type === 'ban'
                          ? '차단'
                          : '뮤트'}
                      {b.ban_scope === 'global' && ' (전체 방송)'}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                        b.is_active
                          ? 'bg-red-100 text-red-600'
                          : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      {b.is_active ? '활성' : '만료'}
                    </span>
                  </div>
                  {b.reason && (
                    <p className="text-xs text-gray-600 mb-1">{b.reason}</p>
                  )}
                  <p className="text-xs text-gray-400">
                    {b.banned_by_name} · {new Date(b.created_at).toLocaleDateString('ko-KR')}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </SlideSheet>

      {/* 차단 모달 */}
      <SlideSheet
        isOpen={showBanModal}
        onClose={() => setShowBanModal(false)}
        title="차단 설정"
        initialHeight={0.65}
        minHeight={0.4}
        maxHeight={0.85}
        zIndex={10001}
      >
        <div className="pb-4 space-y-4">
          {/* 경고 */}
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-orange-700">
              차단된 유저는 설정한 기간 동안 입장할 수 없습니다.
            </p>
          </div>

          {/* 차단 범위 */}
          <div>
            <p className="text-sm font-semibold text-gray-800 mb-2">차단 범위</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setBanScope('room')}
                className={`py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                  banScope === 'room'
                    ? 'border-[#FE3A8F] bg-[#FE3A8F]/5 text-[#FE3A8F]'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                이 방만
              </button>
              <button
                type="button"
                onClick={() => setBanScope('global')}
                className={`py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                  banScope === 'global'
                    ? 'border-[#FE3A8F] bg-[#FE3A8F]/5 text-[#FE3A8F]'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                전체 방송
              </button>
            </div>
          </div>

          {/* 차단 기간 */}
          <div>
            <p className="text-sm font-semibold text-gray-800 mb-2">차단 기간</p>
            <div className="grid grid-cols-3 gap-2">
              {BAN_DURATIONS.map((duration) => (
                <button
                  key={duration.label}
                  type="button"
                  onClick={() => setBanDuration(duration.minutes)}
                  className={`py-2 rounded-lg border text-sm font-medium transition-colors ${
                    banDuration === duration.minutes
                      ? 'border-[#FE3A8F] bg-[#FE3A8F]/5 text-[#FE3A8F]'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {duration.label}
                </button>
              ))}
            </div>
          </div>

          {/* 사유 입력 */}
          <div>
            <p className="text-sm font-semibold text-gray-800 mb-2">
              차단 사유 <span className="text-gray-400 font-normal">(선택)</span>
            </p>
            <textarea
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder="차단 사유를 입력하세요"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#FE3A8F] focus:outline-none resize-none"
              rows={2}
              maxLength={200}
            />
          </div>

          {/* 버튼 */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowBanModal(false)}
              className="flex-1 py-2.5 rounded-lg border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleBan}
              disabled={ban.isPending}
              className="flex-1 py-2.5 rounded-lg bg-[#FE3A8F] text-white font-medium hover:bg-[#fe4a9a] transition-colors disabled:opacity-50"
            >
              {ban.isPending ? '처리 중...' : '차단하기'}
            </button>
          </div>
        </div>
      </SlideSheet>
    </>
  )
}
