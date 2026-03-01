/**
 * 후원 룰렛 시스템 타입 정의
 * 
 * 구조:
 * - 파트너는 여러 개의 "룰렛판"을 만들 수 있음
 * - 각 룰렛판은 고정 금액 + 아이템들로 구성
 * - 시청자는 룰렛판을 선택하여 해당 금액으로 후원
 * 
 * 예시:
 * - 룰렛판 A: 1,000P → [꽝, 선물1, 선물2]
 * - 룰렛판 B: 5,000P → [꽝, 대박, 잭팟]
 */

/** 
 * 룰렛 보상 타입 (간소화: 3종)
 * - text: 텍스트만 표시 (꽝, 축하 메시지 등) + 선택적 포인트 지급
 * - usable: 사용형 아이템 (파트너 승인 필요, 전화권/채팅권/쿠폰 등)
 * - digital: 디지털 보상 (사진/파일, 바로 지급)
 */
export type RouletteRewardType = 'text' | 'usable' | 'digital'

/**
 * 디지털 상품 지급 방식
 * - bundle: 일괄 지급 (당첨 시 모든 파일 한꺼번에 지급, 1회 당첨으로 끝)
 * - individual: 개별 지급 (파일 하나씩 랜덤 지급, 모든 파일 받을 때까지 여러 번 당첨 가능)
 */
export type DigitalDistributionType = 'bundle' | 'individual'

/** 디지털 파일 정보 (다중 파일 지원) */
export interface DigitalFileInfo {
  id?: string
  file_url: string
  file_path: string
  file_name: string
  file_size?: number
  file_type?: string
  sort_order?: number
}

/**
 * 룰렛판 용도 타입
 * - stream: 방송용 (라이브 스트리밍 중 사용)
 * - profile: 프로필용 (비방송 시 파트너 페이지에서 사용)
 * - both: 둘 다 사용 가능
 */
export type RouletteWheelType = 'stream' | 'profile' | 'both'

/** 레거시 타입 호환 (마이그레이션 완료 전까지) */
export type LegacyRouletteRewardType = 'text' | 'points' | 'usable' | 'coupon' | 'digital' | 'custom'

/** 룰렛 아이템 (각 룰렛판의 섹션) */
export interface RouletteItem {
  id: string
  /** 소속 룰렛판 ID */
  wheel_id: string
  /** 아이템 이름 (화면에 표시) */
  name: string
  /** 설명 (선택) */
  description?: string
  /** 섹션 색상 */
  color: string
  /** 가중치 (상대값, 1 이상 정수) */
  weight: number
  /** 보상 타입 */
  reward_type: RouletteRewardType
  /** 보상 값 (예: "500", "10분", "사진.jpg") */
  reward_value?: string | null
  /** 정렬 순서 */
  sort_order: number
  /** 활성화 여부 */
  is_active: boolean

  // === 수량 제한 관련 필드 (Phase 5) ===
  /** 
   * 수량 제한 타입: 'global'(전체) 또는 'per_user'(유저별) 중 하나만 선택 
   * null이면 무제한
   */
  stock_limit_type?: 'global' | 'per_user' | null
  /** 수량 제한 값 (stock_limit_type에 따라 전체 또는 유저별 제한) */
  stock_limit?: number | null
  /** 전체 사용량 (당첨된 횟수) */
  global_stock_used?: number
  /** 꽝 여부 (true면 소진 판정에서 제외) */
  is_blank?: boolean

  // === 디지털 파일 관련 필드 ===
  /** 디지털 보상 파일 URL (Supabase Storage) - 레거시 단일 파일 */
  digital_file_url?: string | null
  /** 디지털 보상 파일 Storage 경로 - 레거시 단일 파일 */
  digital_file_path?: string | null
  /** 디지털 보상 파일명 - 레거시 단일 파일 */
  digital_file_name?: string | null
  /** 디지털 보상 파일 크기 (bytes) - 레거시 단일 파일 */
  digital_file_size?: number | null
  /** 디지털 보상 파일 MIME 타입 - 레거시 단일 파일 */
  digital_file_type?: string | null

  // === 다중 파일 지원 필드 ===
  /** 디지털 지급 방식: bundle(일괄), individual(개별) */
  digital_distribution_type?: DigitalDistributionType
  /** 디지털 파일 목록 (다중 파일) */
  digital_files?: DigitalFileInfo[]
}

/** 룰렛판 (고정 금액 + 아이템들) */
export interface RouletteWheel {
  id: string
  /** 소속 파트너 ID */
  partner_id: string
  /** 룰렛판 이름 (예: "1000P 룰렛", "프리미엄 룰렛") */
  name: string
  /** 고정 후원 금액 */
  price: number
  /** 설명 (선택) */
  description?: string
  /** 활성화 여부 */
  is_active: boolean
  /** 정렬 순서 */
  sort_order: number
  /** 용도 타입: stream(방송용), profile(프로필용), both(둘 다) */
  wheel_type: RouletteWheelType
  /** 대표 룰렛 여부 (프로필 페이지에 표시) */
  is_featured: boolean
  /** 생성일 */
  created_at: string
  /** 수정일 */
  updated_at: string
  /** 아이템들 (조회 시 포함) */
  items?: RouletteItem[]
}

/** 파트너 룰렛 설정 */
export interface RouletteSettings {
  /** 룰렛 기능 활성화 여부 */
  is_enabled: boolean
  /** 룰렛판 목록 */
  wheels: RouletteWheel[]
  /** 유효성: 활성화된 룰렛판이 1개 이상 있고 각 판에 아이템이 있으면 true */
  is_valid: boolean
}

/** 룰렛 결과 (DB) */
export interface DonationRouletteResult {
  id: string
  donation_id: number
  room_id: string
  donor_id: string
  partner_id: string
  roulette_item_id: string
  item_name: string
  item_color: string
  item_reward_type?: string
  item_reward_value?: string
  all_items: RouletteItem[]
  final_rotation: number
  is_processed: boolean
  created_at: string
  // wheel 관련 필드는 더 이상 사용하지 않음 (optional로 유지하여 호환성 유지)
  wheel_id?: string
  wheel_name?: string
  wheel_price?: number
}

/** 룰렛 큐 아이템 (UI용) */
export interface RouletteQueueItem {
  id: string
  donorName: string
  donorProfileImage: string | null
  wheelName: string
  wheelPrice: number
  items: RouletteItem[]
  winningItemId: string
  winningItemName: string
  winningItemColor: string
  finalRotation: number
  createdAt: string
  // 디지털 당첨 정보 (있는 경우)
  winningItemRewardType?: RouletteRewardType
  winningItemDigitalPreview?: string | null
  winningItemDigitalFileName?: string | null
}

/** 룰렛 RPC 응답 */
export interface ExecuteRouletteResponse {
  success: boolean
  error?: string
  result_id?: string
  wheel_name?: string
  item_name?: string
  item_color?: string
  final_rotation?: number
  detail?: string
}

/** 룰렛판 생성 입력 */
export interface CreateRouletteWheelInput {
  name: string
  price: number
  description?: string
  sort_order?: number
  /** 용도 타입 (기본값: 'stream') */
  wheel_type?: RouletteWheelType
  /** 대표 룰렛 여부 */
  is_featured?: boolean
}

/** 룰렛판 수정 입력 */
export interface UpdateRouletteWheelInput {
  name?: string
  price?: number
  description?: string
  sort_order?: number
  is_active?: boolean
  /** 용도 타입 */
  wheel_type?: RouletteWheelType
  /** 대표 룰렛 여부 */
  is_featured?: boolean
}

/** 룰렛 아이템 생성 입력 */
export interface CreateRouletteItemInput {
  wheel_id: string
  name: string
  description?: string
  color: string
  weight: number
  reward_type?: RouletteRewardType
  reward_value?: string | null
  sort_order?: number
  // 수량 제한 (Phase 5) - 디지털 타입에서는 사용 안 함
  stock_limit_type?: 'global' | 'per_user' | null
  stock_limit?: number | null
  is_blank?: boolean
  // 디지털 파일 (레거시 단일 파일)
  digital_file_url?: string | null
  digital_file_path?: string | null
  digital_file_name?: string | null
  digital_file_size?: number | null
  digital_file_type?: string | null
  // 디지털 다중 파일 지원
  digital_distribution_type?: DigitalDistributionType
  digital_files?: DigitalFileInfo[]
}

/** 룰렛 아이템 수정 입력 */
export interface UpdateRouletteItemInput {
  name?: string
  description?: string
  color?: string
  weight?: number
  reward_type?: RouletteRewardType
  reward_value?: string | null
  sort_order?: number
  is_active?: boolean
  // 수량 제한 (Phase 5) - 디지털 타입에서는 사용 안 함
  stock_limit_type?: 'global' | 'per_user' | null
  stock_limit?: number | null
  is_blank?: boolean
  // 디지털 파일 (레거시 단일 파일)
  digital_file_url?: string | null
  digital_file_path?: string | null
  digital_file_name?: string | null
  digital_file_size?: number | null
  digital_file_type?: string | null
  // 디지털 다중 파일 지원
  digital_distribution_type?: DigitalDistributionType
  digital_files?: DigitalFileInfo[]
}

/** 아이템 수량 상태 (파트너 대시보드용) */
export interface RouletteItemStockStatus {
  item_id: string
  stock_limit_type: 'global' | 'per_user' | null
  stock_limit: number | null
  stock_used: number
  stock_remaining: number | null
  is_blank: boolean
  is_exhausted: boolean
}

/** 휠 스핀 가능 여부 */
export interface WheelSpinStatus {
  can_spin: boolean
  available_items: number
  total_items: number
  has_unlimited: boolean
  reason: 'ALL_EXHAUSTED' | null
}

/** 기본 색상 팔레트 */
export const ROULETTE_COLORS = [
  '#FF6B6B', // 빨강
  '#FF922B', // 주황
  '#FFD43B', // 노랑
  '#51CF66', // 초록
  '#339AF0', // 파랑
  '#845EF7', // 보라
  '#F06595', // 핑크
  '#495057', // 회색
] as const

/** 룰렛 애니메이션 설정 */
export const ROULETTE_ANIMATION_CONFIG = {
  minRotations: 3,
  maxRotations: 5,
  duration: 4000,
  easing: 'cubic-bezier(0.17, 0.67, 0.12, 0.99)',
  totalDuration: 6000, // 회전 + 결과 표시
} as const
