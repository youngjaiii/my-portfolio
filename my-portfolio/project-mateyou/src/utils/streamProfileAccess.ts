/**
 * 스트림 프로필 접근 권한 유틸리티
 * 
 * 규칙:
 * - 클릭 대상이 호스트(owner) = 관리자만 열 수 있음
 * - 클릭 대상이 관리자(admin) = 호스트 및 관리자 모두 열 수 없음
 * - 클릭 대상이 일반 참가자/파트너 참가자 = 관리자 및 호스트 모두 열 수 있음
 */

import type { StreamHost, StreamViewer } from '@/hooks/useVoiceRoom'

interface ProfileAccessParams {
  /** 클릭 대상 참가자 */
  target: StreamHost | StreamViewer | null
  /** 방의 호스트 member ID */
  hostMemberId?: string | null
  /** 현재 사용자가 관리자인지 */
  isCurrentUserAdmin: boolean
  /** 현재 사용자가 호스트인지 */
  isCurrentUserHost: boolean
}

/**
 * 프로필 열기 가능 여부 확인
 */
export function canOpenProfile({
  target,
  hostMemberId,
  isCurrentUserAdmin,
  isCurrentUserHost,
}: ProfileAccessParams): boolean {
  if (!target) return false

  // 호스트나 관리자가 아니면 프로필 열 수 없음
  if (!isCurrentUserAdmin && !isCurrentUserHost) return false

  // 대상 정보 추출
  const targetMemberId = getTargetMemberId(target)
  const isTargetHost = checkIsHost(target, hostMemberId)
  const isTargetAdmin = checkIsAdmin(target)

  // 규칙 1: 클릭 대상이 호스트(owner)면 관리자만 열 수 있음
  if (isTargetHost) {
    return isCurrentUserAdmin
  }

  // 규칙 2: 클릭 대상이 관리자(admin)면 호스트 및 관리자 모두 열 수 없음
  if (isTargetAdmin) {
    return false
  }

  // 규칙 3: 일반 참가자/파트너 참가자는 관리자 및 호스트 모두 열 수 있음
  return true
}

/**
 * 대상의 member ID 추출
 */
function getTargetMemberId(target: StreamHost | StreamViewer): string {
  if ('role' in target) {
    // StreamHost
    return target.member_id || target.partner?.member?.id || ''
  }
  // StreamViewer
  return target.member_id
}

/**
 * 대상이 호스트(owner)인지 확인
 */
function checkIsHost(target: StreamHost | StreamViewer, hostMemberId?: string | null): boolean {
  if ('role' in target) {
    // StreamHost - role이 owner인 경우
    return target.role === 'owner'
  }
  // StreamViewer - member_id가 hostMemberId와 같은 경우
  return target.member_id === hostMemberId
}

/**
 * 대상이 관리자(admin)인지 확인
 */
function checkIsAdmin(target: StreamHost | StreamViewer): boolean {
  if ('role' in target) {
    // StreamHost에는 member 정보가 있을 수 있음
    const host = target as StreamHost
    // partner의 member나 직접 member 정보에서 role 확인
    // (현재 StreamHost 타입에는 member.role이 없으므로 추가 데이터 필요)
    return false // StreamHost는 admin role 정보가 없음
  }
  // StreamViewer
  return (target as StreamViewer).member?.role === 'admin'
}

/**
 * 채팅 메시지 발신자로부터 프로필 접근 가능 여부 확인
 */
export interface ChatProfileAccessParams {
  /** 발신자 ID */
  senderId: string
  /** 발신자 역할 (있는 경우) */
  senderRole?: string
  /** 호스트 목록 */
  hosts: StreamHost[]
  /** 시청자 목록 */
  viewers: StreamViewer[]
  /** 방의 호스트 member ID */
  hostMemberId?: string | null
  /** 현재 사용자가 관리자인지 */
  isCurrentUserAdmin: boolean
  /** 현재 사용자가 호스트인지 */
  isCurrentUserHost: boolean
}

export function canOpenProfileFromChat({
  senderId,
  senderRole,
  hosts = [],
  viewers = [],
  hostMemberId,
  isCurrentUserAdmin,
  isCurrentUserHost,
}: ChatProfileAccessParams): boolean {
  // 호스트나 관리자가 아니면 프로필 열 수 없음
  if (!isCurrentUserAdmin && !isCurrentUserHost) return false

  // hosts/viewers가 없거나 배열이 아니면 기본값 사용
  const safeHosts = Array.isArray(hosts) ? hosts : []
  const safeViewers = Array.isArray(viewers) ? viewers : []

  // 발신자가 호스트 목록에 있는지 확인
  const host = safeHosts.find(h => 
    h.member_id === senderId || h.partner?.member?.id === senderId
  )
  
  if (host) {
    // 규칙 1: 호스트(owner)면 관리자만 열 수 있음
    if (host.role === 'owner') {
      return isCurrentUserAdmin
    }
    // co_host나 guest는 일반 참가자로 취급
    return true
  }

  // 시청자에서 찾기
  const viewer = safeViewers.find(v => v.member_id === senderId)
  
  if (viewer) {
    // 규칙 2: 관리자면 열 수 없음
    if (viewer.member?.role === 'admin') {
      return false
    }
    // 일반 시청자
    return true
  }

  // 발신자 역할이 직접 제공된 경우 (메시지 sender 정보에서)
  if (senderRole === 'admin') {
    return false
  }

  // 호스트 member ID와 일치하면 호스트
  if (senderId === hostMemberId) {
    return isCurrentUserAdmin
  }

  // 기본: 일반 참가자로 간주
  return true
}

