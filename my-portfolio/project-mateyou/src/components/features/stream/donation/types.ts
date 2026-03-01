/**
 * 도네이션 시스템 타입 정의
 */

/** 도네이션 타입 */
export type DonationType = 'basic' | 'mission' | 'video' | 'roulette'

/** 도네이션 상태 */
export type DonationStatus =
  | 'pending'    // 대기 중 (미션: 수락/거절 전)
  | 'accepted'   // 수락됨 (미션만 해당)
  | 'rejected'   // 거절됨 (미션만 해당, 환불)
  | 'playing'    // 재생 중 (영상 도네이션)
  | 'completed'  // 완료
  | 'success'    // 성공 (미션 수행 성공)
  | 'failed'     // 실패 (미션 수행 실패)
  | 'skipped'    // 스킵됨

/** 미션 상태 (미션 도네이션 전용) */
export type MissionStatus =
  | 'pending'    // 대기 중
  | 'accepted'   // 수락됨
  | 'rejected'   // 거절됨 (환불)
  | 'success'    // 성공
  | 'failed'     // 실패

/** 룸 타입 */
export type RoomType = 'voice' | 'video'

/** 도네이션 타입별 설정 */
export interface DonationTypeConfig {
  type: DonationType
  label: string
  icon: string
  minAmount: number
  description: string
  availableIn: RoomType[]
}

/** 도네이션 타입 설정 */
export const DONATION_TYPE_CONFIGS: Record<DonationType, DonationTypeConfig> = {
  basic: {
    type: 'basic',
    label: '일반',
    icon: '💝',
    minAmount: 1000,
    description: '하트 후원으로 응원하세요',
    availableIn: ['voice', 'video'],
  },
  mission: {
    type: 'mission',
    label: '미션',
    icon: '🎯',
    minAmount: 3000,
    description: '미션을 요청하세요',
    availableIn: ['voice', 'video'],
  },
  video: {
    type: 'video',
    label: '영상',
    icon: '🎬',
    minAmount: 5000,
    description: '유튜브 영상을 공유하세요',
    availableIn: ['video'], // 비디오룸에서만 가능
  },
  roulette: {
    type: 'roulette',
    label: '룰렛',
    icon: '🎰',
    minAmount: 1000,
    description: '룰렛을 돌려 행운을 시험하세요',
    availableIn: ['voice', 'video'],
  },
}

/** 룸 타입에 따른 사용 가능한 도네이션 타입 */
export function getAvailableDonationTypes(roomType: RoomType): DonationType[] {
  return Object.values(DONATION_TYPE_CONFIGS)
    .filter((config) => config.availableIn.includes(roomType))
    .map((config) => config.type)
}

/** 스트림 도네이션 데이터 */
export interface StreamDonation {
  id: number
  room_id: string
  donor_id: string
  recipient_partner_id: string
  amount: number
  heart_image: string | null
  message: string | null
  log_id: string | null
  created_at: string
  // 새 필드
  donation_type: DonationType
  status: DonationStatus
  mission_text: string | null
  video_url: string | null
  video_title: string | null
  video_thumbnail: string | null
  processed_at: string | null
  processed_by: string | null
  // JOIN된 데이터
  donor?: {
    id: string
    name: string
    profile_image: string | null
  }
  recipient_partner?: {
    id: string
    partner_name: string
    member?: {
      id: string
      name: string
      profile_image: string | null
    }
  }
}

/** 도네이션 생성 입력 */
export interface CreateDonationInput {
  roomId: string
  recipientPartnerId: string
  amount: number
  donationType: DonationType
  heartImage?: string
  message?: string
  missionText?: string
  videoUrl?: string
  videoTitle?: string
  videoThumbnail?: string
}

/** 도네이션 액션 타입 */
export type DonationAction =
  | 'read'      // 읽기
  | 'complete'  // 완료
  | 'skip'      // 스킵
  | 'play'      // 재생 (영상)
  | 'accept'    // 수락 (미션)
  | 'reject'    // 거절 (미션, 환불)
  | 'success'   // 성공 (미션)
  | 'fail'      // 실패 (미션)

/** 유튜브 영상 정보 */
export interface YoutubeVideoInfo {
  videoId: string
  title: string
  thumbnail: string
  channelTitle: string
  duration: string
}

/** 도네이션 큐 아이템 (UI용) */
export interface DonationQueueItem extends StreamDonation {
  isExpanded?: boolean
}

/** 미션 처리 결과 */
export interface MissionProcessResult {
  success: boolean
  donationId: number
  action: 'accept' | 'reject' | 'success' | 'fail'
  refunded?: boolean
  refundAmount?: number
  errorCode?: string
  errorMessage?: string
}

/** 미션 목록 표시용 데이터 */
export interface MissionDisplayItem {
  id: number
  donorName: string
  donorProfileImage: string | null
  amount: number
  missionText: string
  status: MissionStatus
  createdAt: string
  roomId: string
}

