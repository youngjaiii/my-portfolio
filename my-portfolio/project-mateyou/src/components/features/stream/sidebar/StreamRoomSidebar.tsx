/**
 * StreamRoomSidebar - 스트림 룸 공통 사이드바 컴포넌트
 * 
 * 보이스룸/라이브룸 모두에서 사용하는 공통 사이드바
 * 
 * 역할별 기능:
 * - 관리자: 강제 방송 종료, 호스트/시청자 목록
 * - 호스트: 호스트/시청자 목록, 프로필 클릭 시 모더레이션
 * - 시청자: 사이드바 버튼 자체가 숨겨짐
 */

import { useRoomBans, useStreamModeration } from '@/hooks/useStreamModeration'
import type { StreamHost, StreamViewer } from '@/hooks/useVoiceRoom'
import { canOpenProfile } from '@/utils/streamProfileAccess'
import { Ban, Crown, Power, Users, Video, X } from 'lucide-react'
import { useState } from 'react'
import { ParticipantProfileSheet } from '../ParticipantProfileSheet'
import { BannedListItem } from './BannedListItem'
import { ParticipantListItem, type RoomType } from './ParticipantListItem'

interface StreamRoomSidebarProps {
  /** 사이드바 열림 상태 */
  isOpen: boolean
  /** 닫기 핸들러 */
  onClose: () => void
  /** 방 ID */
  roomId: string
  /** 방 제목 */
  roomTitle: string
  /** 호스트/발언자 목록 */
  hosts: StreamHost[]
  /** 시청자/청취자 목록 */
  viewers: StreamViewer[]
  /** 현재 유저가 관리자인지 */
  isAdmin: boolean
  /** 현재 유저가 호스트인지 */
  isHost: boolean
  /** 룸 타입 (보이스룸/라이브룸) */
  roomType: RoomType
  /** 호스트 파트너 ID */
  hostPartnerId?: string | null
  /** 호스트 멤버 ID */
  hostMemberId?: string | null
  /** 강제 방송 종료 핸들러 (관리자 전용) */
  onForceEndRoom?: () => void
  /** 강제 뮤트 핸들러 (보이스룸 전용) */
  onForceMute?: (memberId: string) => void
  /** 강퇴 후 콜백 */
  onKicked?: (memberId: string) => void
}

export function StreamRoomSidebar({
  isOpen,
  onClose,
  roomId,
  roomTitle,
  hosts,
  viewers,
  isAdmin,
  isHost,
  roomType,
  hostPartnerId,
  hostMemberId,
  onForceEndRoom,
  onForceMute,
  onKicked,
}: StreamRoomSidebarProps) {
  // 선택된 참가자 (프로필 바텀시트용)
  const [selectedParticipant, setSelectedParticipant] = useState<StreamHost | StreamViewer | null>(null)
  const [isProfileSheetOpen, setIsProfileSheetOpen] = useState(false)

  // 방 기준 차단 목록 조회
  const { data: roomBans = [] } = useRoomBans(roomId)

  // 모더레이션 (차단 해제용)
  const { unban } = useStreamModeration(roomId)

  // 프로필 클릭 핸들러 (조건부 접근)
  const handleProfileClick = (participant: StreamHost | StreamViewer) => {
    // 권한 체크 - 열 수 없으면 조용히 무시
    const canOpen = canOpenProfile({
      target: participant,
      hostMemberId,
      isCurrentUserAdmin: isAdmin,
      isCurrentUserHost: isHost,
    })

    if (!canOpen) return

    setSelectedParticipant(participant)
    setIsProfileSheetOpen(true)
  }

  // 프로필 시트 닫기
  const handleCloseProfileSheet = () => {
    setIsProfileSheetOpen(false)
    setSelectedParticipant(null)
  }

  // 선택된 참가자가 발언자인지 확인
  const isSelectedSpeaker = selectedParticipant
    ? 'role' in selectedParticipant // StreamHost면 발언자
    : false

  // 관리자 또는 호스트만 볼 수 있음
  if (!isAdmin && !isHost) return null

  // 호스트(발언자) ID 목록 생성
  const hostMemberIds = new Set(
    hosts.map(h => h.member_id || h.partner?.member?.id).filter(Boolean)
  )

  // 청취자/시청자 목록에서 호스트 및 관리자 제외
  const filteredViewers = viewers.filter(v => {
    // 호스트(발언자)는 제외
    if (hostMemberIds.has(v.member_id)) return false
    // 관리자(role === 'admin')는 제외
    if (v.member?.role === 'admin') return false
    return true
  })

  // 섹션 라벨
  const hostSectionLabel = roomType === 'voice' ? '발언자' : '호스트'
  const viewerSectionLabel = roomType === 'voice' ? '청취자' : '시청자'
  const emptyHostLabel = roomType === 'voice' ? '발언자가 없습니다' : '호스트가 없습니다'
  const emptyViewerLabel = roomType === 'voice' ? '청취자가 없습니다' : '시청자가 없습니다'

  // 호스트 섹션 아이콘
  const HostSectionIcon = roomType === 'voice' ? Crown : Video

  return (
    <div
      className={`fixed inset-0 z-[9999] ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
      onClick={onClose}
    >
      {/* 오버레이 */}
      <div 
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`} 
      />
      
      {/* 오른쪽 슬라이드 메뉴 */}
      <aside
        className={`absolute inset-y-0 right-0 w-72 bg-white flex flex-col transition-transform duration-300 shadow-xl ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h2 className="text-base font-bold text-[#110f1a] truncate flex-1 pr-2">
            {roomTitle}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="닫기"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* 컨텐츠 */}
        <div className="flex-1 overflow-y-auto">
          {/* 호스트(발언자) 섹션 */}
          <section className="p-4 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <HostSectionIcon className="w-4 h-4 text-[#FE3A8F]" />
              <span className="text-sm font-bold text-[#110f1a]">
                {hostSectionLabel} ({hosts.length})
              </span>
            </div>
            <div className="space-y-2">
              {hosts.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">{emptyHostLabel}</p>
              ) : (
                hosts.map((host) => (
                  <ParticipantListItem 
                    key={host.id} 
                    participant={host}
                    type="host"
                    roomType={roomType}
                    onClick={() => handleProfileClick(host)}
                    clickable={isAdmin || isHost}
                  />
                ))
              )}
            </div>
          </section>

          {/* 시청자/청취자 섹션 */}
          <section className="p-4 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-purple-500" />
              <span className="text-sm font-bold text-[#110f1a]">
                {viewerSectionLabel} ({filteredViewers.length})
              </span>
            </div>
            <div className="space-y-2">
              {filteredViewers.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">{emptyViewerLabel}</p>
              ) : (
                filteredViewers.map((viewer) => (
                  <ParticipantListItem 
                    key={viewer.id} 
                    participant={viewer}
                    type="viewer"
                    roomType={roomType}
                    onClick={() => handleProfileClick(viewer)}
                    clickable={isAdmin || isHost}
                  />
                ))
              )}
            </div>
          </section>

          {/* 차단된 사람 섹션 */}
          <section className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Ban className="w-4 h-4 text-red-500" />
              <span className="text-sm font-bold text-[#110f1a]">
                차단됨 ({roomBans.length})
              </span>
            </div>
            <div className="space-y-2">
              {roomBans.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">차단된 사람이 없습니다</p>
              ) : (
                roomBans.map((ban) => (
                  <BannedListItem 
                    key={ban.id} 
                    ban={ban}
                    onUnban={() => {
                      if (confirm(`${ban.target_member?.name || '이 사용자'}의 차단을 해제하시겠습니까?`)) {
                        unban.mutate(ban.id)
                      }
                    }}
                    isUnbanning={unban.isPending}
                  />
                ))
              )}
            </div>
          </section>
        </div>

        {/* 프로필 바텀시트 */}
        <ParticipantProfileSheet
          isOpen={isProfileSheetOpen}
          onClose={handleCloseProfileSheet}
          roomId={roomId}
          participant={selectedParticipant}
          hostPartnerId={hostPartnerId}
          hostMemberId={hostMemberId}
          isSpeaker={isSelectedSpeaker}
          isCurrentUserHost={isHost || isAdmin}
          isCurrentUserAdmin={isAdmin}
          onForceMute={onForceMute}
          onKicked={onKicked}
        />

        {/* 하단 - 관리자 전용 */}
        {isAdmin && onForceEndRoom && (
          <div className="p-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => {
                if (confirm('정말 이 방송을 강제 종료하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.')) {
                  onForceEndRoom()
                }
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors font-medium"
            >
              <Power className="w-4 h-4" />
              강제 방송 종료
            </button>
          </div>
        )}
      </aside>
    </div>
  )
}

