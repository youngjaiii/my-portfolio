/**
 * Member 테이블 조회 시 사용할 필드 정의
 * 민감한 개인정보(total_points, email, social_id 등)는 제외
 */

// 공개 가능한 멤버 필드 (민감 정보 제외)
export const MEMBER_PUBLIC_FIELDS = [
  'id',
  'member_code',
  'name',
  'profile_image',
  'current_status',
  'favorite_game',
  'created_at',
].join(',')

// 본인 정보 조회 시 사용 (모든 필드 포함)
export const MEMBER_FULL_FIELDS = '*'

// 민감한 필드 목록 (참고용)
export const MEMBER_SENSITIVE_FIELDS = [
  'total_points',
  'email',
  'social_id',
  'phone',
  'birthday',
  'gender',
  'role',
] as const
