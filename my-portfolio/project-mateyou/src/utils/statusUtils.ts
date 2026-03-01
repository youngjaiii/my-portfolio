import type { Database } from '@/types/database'

type MemberStatus = Database['public']['Enums']['member_status']

// 영어 상태값을 한국어로 변환하는 매핑
export const STATUS_LABELS: Record<MemberStatus, string> = {
  online: '온라인',
  offline: '오프라인',
  matching: '매칭중',
  in_game: '게임중',
} as const

// 상태를 한국어로 변환하는 함수
export function getStatusLabel(status: MemberStatus | string): string {
  return STATUS_LABELS[status as MemberStatus] || status
}

// 상태에 따른 색상 반환
export function getStatusColor(status: MemberStatus | string): string {
  switch (status) {
    case 'online':
      return 'text-green-600'
    case 'offline':
      return 'text-gray-500'
    case 'matching':
      return 'text-blue-600'
    case 'in_game':
      return 'text-purple-600'
    default:
      return 'text-gray-500'
  }
}

// 상태에 따른 배경색 반환
export function getStatusBadgeColor(status: MemberStatus | string): string {
  switch (status) {
    case 'online':
      return 'bg-green-100 text-green-800'
    case 'offline':
      return 'bg-gray-100 text-gray-800'
    case 'matching':
      return 'bg-blue-100 text-blue-800'
    case 'in_game':
      return 'bg-purple-100 text-purple-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}
