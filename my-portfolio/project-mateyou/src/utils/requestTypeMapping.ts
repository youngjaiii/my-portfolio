import type { Database } from '@/types/database'

type RequestType = string
type PointsLogType =
  Database['public']['Tables']['partner_points_logs']['Row']['type']

/**
 * partner_requests의 request_type을 partner_points_logs의 type으로 매핑하는 함수
 */
export function mapRequestTypeToPointsLogType(
  _requestType: RequestType,
): PointsLogType {
  // 의뢰 완료 시에는 모든 request_type에 대해 earn으로 처리
  // 실제 DB에는 earn, spend, withdraw 만 존재
  return 'earn'
}

/**
 * 요청 상태에 따른 포인트 로그 설명 생성
 */
export function generatePointsLogDescription(
  requestType: RequestType,
  status: 'in_progress' | 'completed' | 'cancelled',
  jobCount?: number,
): string {
  const typeMapping: Record<string, string> = {
    voice_chat: '보이스 채팅',
    game_boost: '게임 부스팅',
    coaching: '코칭',
    duo_play: '듀오 플레이',
    refund_request: '환불',
    charge_request: '충전',
    withdrawal_request: '출금',
  }

  const typeName = typeMapping[requestType] || requestType
  const countText = jobCount ? ` ${jobCount}회` : ''

  switch (status) {
    case 'in_progress':
      return `${typeName}${countText} 진행 시작`
    case 'completed':
      return `의뢰 완료 - ${typeName}${countText}`
    case 'cancelled':
      return `${typeName}${countText} 취소`
    default:
      return `${typeName}${countText}`
  }
}
