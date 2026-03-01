/**
 * Partner 테이블 조회 시 사용할 필드 정의
 * 민감한 toss/payout 정보는 제외
 */

// 공개 가능한 파트너 필드 (toss 정보 제외)
export const PARTNER_PUBLIC_FIELDS = [
  'id',
  'member_id',
  'partner_name',
  'partner_message',
  'partner_status',
  'partner_applied_at',
  'partner_reviewed_at',
  'total_points',
  'game_info',
  'created_at',
  'updated_at',
  'background_images',
  'ben_lists',
  'follow_count',
  'post_count',
].join(',')

// 본인 정보 조회 시 사용 (모든 필드 포함)
export const PARTNER_FULL_FIELDS = '*'

// 민감한 필드 목록 (참고용)
export const PARTNER_SENSITIVE_FIELDS = [
  'tosspayments_seller_id',
  'tosspayments_ref_seller_id',
  'tosspayments_status',
  'tosspayments_synced_at',
  'tosspayments_last_error',
  'tosspayments_business_type',
  'legal_name',
  'legal_email',
  'legal_phone',
  'payout_bank_code',
  'payout_bank_name',
  'payout_account_number',
  'payout_account_holder',
] as const
