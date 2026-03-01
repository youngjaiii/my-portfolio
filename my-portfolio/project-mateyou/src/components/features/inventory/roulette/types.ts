/**
 * 룰렛 인벤토리 타입 정의
 */

// 보상 타입 (간소화: 3종)
// - text: 텍스트만 표시 (꽝, 축하 메시지 등) + 선택적 포인트 지급
// - usable: 사용형 아이템 (파트너 승인 필요, 전화권/채팅권 등)
// - digital: 디지털 보상 (사진/파일, 바로 지급)
export type RouletteRewardType = 'text' | 'usable' | 'digital';

// 레거시 타입 호환 (마이그레이션 완료 전까지)
export type LegacyRouletteRewardType = 'text' | 'points' | 'usable' | 'digital' | 'custom' | 'coupon';

// 사용형 아이템 타입 (쿠폰 포함)
export type UsableRewardType = 'call_minutes' | 'chat_count' | 'video_minutes' | 'message_count';

// 사용 요청 상태
export type RewardUsageStatus = 'active' | 'pending' | 'used' | 'expired' | 'rejected';

// 사용자 인벤토리 아이템 (당첨 내역)
export interface UserRouletteInventoryItem {
  id: string;
  donation_id: number;
  partner_id: string;
  room_id: string;
  roulette_item_id: string | null;
  item_name: string;
  item_color: string | null;
  item_reward_type: RouletteRewardType;
  item_reward_value: string | null;
  won_at: string;
  is_processed: boolean; // 처리 완료 여부 (포인트 지급 등)
  partner_name: string;
  room_title: string | null;
  room_started_at: string | null;
  donation_amount: number;
  donation_message: string | null;
}

// 사용형 아이템/쿠폰/디지털 보상 (보유 중인 사용 가능한 아이템)
export interface UserRouletteReward {
  id: string;
  user_id: string;
  roulette_result_id: string;
  partner_id: string;
  reward_type: 'usable' | 'digital';
  reward_name: string;
  reward_value: string | null;
  // 사용형 아이템 정보 (usable 타입일 때만)
  usable_type: UsableRewardType;
  initial_amount: number; // 1회성 쿠폰은 1, 사용형 아이템은 > 1
  remaining_amount: number; // 잔여 수량/시간
  // 디지털 보상 정보 (digital 타입일 때만)
  digital_file_url: string | null;
  digital_file_name: string | null;
  digital_file_size: number | null;
  digital_file_type: string | null;
  digital_file_path: string | null;
  // 상태 관리
  status: RewardUsageStatus;
  expires_at: string | null;
  // 파트너 승인 관련
  usage_requested_at: string | null;
  usage_approved_at: string | null;
  usage_rejected_at: string | null;
  usage_rejection_reason: string | null;
  won_at: string;
  used_at: string | null;
  partner_name: string;
  item_name: string;
  item_color: string | null;
  room_id: string | null;
  room_title: string | null;
  is_expired: boolean;
  is_usable: boolean;
}

// 사용 이력 (기본)
export interface RouletteRewardUsageLog {
  id: string;
  reward_id: string;
  user_id: string;
  partner_id: string;
  usage_type: string;
  amount_used: number;
  remaining_amount: number;
  // 파트너 승인 정보
  status: 'pending' | 'approved' | 'rejected';
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  room_id: string | null;
  context: Record<string, any> | null;
  requested_at: string;
  used_at: string | null; // 승인 후 실제 사용 시점
}

// 사용 요청 (사용자/보상 정보 포함) - 파트너용 UI에서 사용
export interface RouletteRewardUsageRequest extends RouletteRewardUsageLog {
  // 요청자 정보
  user: {
    id: string;
    name: string;
    profile_image: string | null;
    member_code: string | null;
  } | null;
  // 보상 정보
  reward: {
    id: string;
    reward_name: string;
    reward_type: 'usable' | 'digital';
    reward_value: string | null;
    usable_type: string | null;
    initial_amount: number;
  } | null;
}

// 파트너 인벤토리 아이템
export interface PartnerRouletteInventoryItem {
  id: string;
  donation_id: number;
  partner_id: string;
  donor_id: string;
  room_id: string;
  roulette_item_id: string | null;
  item_name: string;
  item_color: string | null;
  item_reward_type: string;
  item_reward_value: string | null;
  won_at: string;
  donor_name: string;
  donor_profile_image: string | null;
  donor_member_code: string | null;
  room_title: string | null;
  room_started_at: string | null;
  donation_amount: number;
  donation_message: string | null;
}

// 통계 아이템
export interface RouletteItemStat {
  partner_id: string;
  item_name: string;
  item_reward_type: string;
  win_count: number;
  unique_winners: number;
  first_win_at: string;
  last_win_at: string;
}

export interface RouletteDateStat {
  partner_id: string;
  win_date: string;
  win_count: number;
  unique_winners: number;
}

export interface RouletteDonorStat {
  donor_id: string;
  donor_name: string;
  donor_profile_image: string | null;
  total_wins: number;
  total_donation_amount: number;
  last_win_at: string;
}

// 필터 옵션
export interface RouletteInventoryFilter {
  partner_id?: string;
  sort: 'latest' | 'oldest';
  date_from?: string;
  date_to?: string;
}

