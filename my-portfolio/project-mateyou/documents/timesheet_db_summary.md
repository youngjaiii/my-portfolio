# Timesheet 데이터베이스 스키마 설계 문서

## 개요

Timesheet 시스템은 기존 서비스 내부에 존재하지만 논리적으로 별도 프로그램으로 동작합니다. 모든 테이블은 `timesheet_` 접두사를 사용하여 네임스페이스를 분리합니다.

## 데이터베이스 구조

### ENUM 타입

#### `timesheet_attendance_status`
근태 상태를 나타내는 타입

- `OFF` - 미출근
- `WORKING` - 출근 중
- `BREAK` - 휴게 중

#### `timesheet_request_status`
요청 처리 상태를 나타내는 타입

- `pending` - 대기 중
- `approved` - 승인됨
- `rejected` - 반려됨

#### `timesheet_role_type`
Timesheet 시스템 내 역할 타입

- `partner_plus` - 파트너+ (근태 신청 주체)
- `partner_manager` - 파트너 매니저 (관리자)
- `partner_m` - 파트너M (보조 관리자)

#### `timesheet_audit_action`
감사 로그 액션 타입

- `attendance_request` - 근태 요청
- `attendance_approve` - 근태 승인
- `attendance_reject` - 근태 반려
- `attendance_modify` - 근태 수정
- `partner_plus_add` - 파트너+ 추가
- `partner_plus_remove` - 파트너+ 삭제
- `partner_manager_assign` - 파트너 매니저 지정
- `partner_manager_unassign` - 파트너 매니저 해제
- `store_create` - 가게 생성
- `store_update` - 가게 수정
- `store_deactivate` - 가게 비활성화

## 테이블 구조

### 1. `timesheet_stores` - 가게 정보

가게(매장) 정보를 저장하는 테이블입니다.

| 컬럼명 | 타입 | 설명 | 제약조건 |
|--------|------|------|----------|
| `id` | UUID | 기본 키 | PRIMARY KEY, DEFAULT gen_random_uuid() |
| `name` | TEXT | 가게 이름 | NOT NULL |
| `address` | TEXT | 가게 주소 | |
| `phone` | TEXT | 연락처 | |
| `is_active` | BOOLEAN | 활성화 여부 | NOT NULL, DEFAULT true |
| `created_at` | TIMESTAMPTZ | 생성 시간 | NOT NULL, DEFAULT now() |
| `updated_at` | TIMESTAMPTZ | 수정 시간 | NOT NULL, DEFAULT now() |

**인덱스:**
- `idx_timesheet_stores_is_active` ON `is_active`

### 2. `timesheet_partner_roles` - 파트너 역할 정보

파트너의 Timesheet 시스템 내 역할을 저장하는 테이블입니다.  
모든 사용자가 이 테이블에 등록될 수 있으며, 매니저는 파트너가 아니어도 지정 가능합니다.

| 컬럼명 | 타입 | 설명 | 제약조건 |
|--------|------|------|----------|
| `id` | UUID | 기본 키 | PRIMARY KEY, DEFAULT gen_random_uuid() |
| `member_id` | UUID | 회원 ID | NOT NULL, REFERENCES members(id) |
| `role_type` | ENUM | 역할 타입 | NOT NULL, timesheet_role_type |
| `is_active` | BOOLEAN | 활성화 여부 | NOT NULL, DEFAULT true |
| `created_at` | TIMESTAMPTZ | 생성 시간 | NOT NULL, DEFAULT now() |
| `updated_at` | TIMESTAMPTZ | 수정 시간 | NOT NULL, DEFAULT now() |

**제약조건:**
- `unique_timesheet_partner_roles_member` - `member_id`는 유일해야 함 (한 사용자는 하나의 역할만 가짐)

**인덱스:**
- `idx_timesheet_partner_roles_member_id` ON `member_id`
- `idx_timesheet_partner_roles_role_type` ON `role_type`
- `idx_timesheet_partner_roles_is_active` ON `is_active`

### 3. `timesheet_store_managers` - 가게-매니저 관계

가게에 할당된 파트너 매니저를 관리하는 테이블입니다.

| 컬럼명 | 타입 | 설명 | 제약조건 |
|--------|------|------|----------|
| `id` | UUID | 기본 키 | PRIMARY KEY, DEFAULT gen_random_uuid() |
| `store_id` | UUID | 가게 ID | NOT NULL, REFERENCES timesheet_stores(id) |
| `manager_id` | UUID | 매니저 ID (member_id) | NOT NULL, REFERENCES members(id) |
| `is_active` | BOOLEAN | 활성화 여부 | NOT NULL, DEFAULT true |
| `created_at` | TIMESTAMPTZ | 생성 시간 | NOT NULL, DEFAULT now() |
| `updated_at` | TIMESTAMPTZ | 수정 시간 | NOT NULL, DEFAULT now() |

**제약조건:**
- `unique_timesheet_store_managers` - `store_id`와 `manager_id` 조합은 유일해야 함

**인덱스:**
- `idx_timesheet_store_managers_store_id` ON `store_id`
- `idx_timesheet_store_managers_manager_id` ON `manager_id`
- `idx_timesheet_store_managers_is_active` ON `is_active`

### 4. `timesheet_attendance_requests` - 근태 요청

파트너+가 제출한 근태 요청을 저장하는 테이블입니다.

| 컬럼명 | 타입 | 설명 | 제약조건 |
|--------|------|------|----------|
| `id` | UUID | 기본 키 | PRIMARY KEY, DEFAULT gen_random_uuid() |
| `partner_plus_id` | UUID | 파트너+ ID (member_id) | NOT NULL, REFERENCES members(id) |
| `store_id` | UUID | 가게 ID | NOT NULL, REFERENCES timesheet_stores(id) |
| `manager_id` | UUID | 담당 매니저 ID | NOT NULL, REFERENCES members(id) |
| `request_type` | ENUM | 요청 타입 (상태 전이) | NOT NULL, timesheet_attendance_status |
| `status` | ENUM | 요청 상태 | NOT NULL, timesheet_request_status, DEFAULT 'pending' |
| `requested_at` | TIMESTAMPTZ | 요청 시간 | NOT NULL, DEFAULT now() |
| `processed_at` | TIMESTAMPTZ | 처리 시간 | |
| `processed_by` | UUID | 처리한 사람 ID | REFERENCES members(id) |
| `rejection_reason` | TEXT | 반려 사유 | |
| `created_at` | TIMESTAMPTZ | 생성 시간 | NOT NULL, DEFAULT now() |
| `updated_at` | TIMESTAMPTZ | 수정 시간 | NOT NULL, DEFAULT now() |

**인덱스:**
- `idx_timesheet_attendance_requests_partner_plus_id` ON `partner_plus_id`
- `idx_timesheet_attendance_requests_store_id` ON `store_id`
- `idx_timesheet_attendance_requests_manager_id` ON `manager_id`
- `idx_timesheet_attendance_requests_status` ON `status`
- `idx_timesheet_attendance_requests_requested_at` ON `requested_at`

### 5. `timesheet_attendance_records` - 근태 기록

승인된 근태 요청을 기반으로 생성되는 실제 근태 기록입니다.

| 컬럼명 | 타입 | 설명 | 제약조건 |
|--------|------|------|----------|
| `id` | UUID | 기본 키 | PRIMARY KEY, DEFAULT gen_random_uuid() |
| `partner_plus_id` | UUID | 파트너+ ID | NOT NULL, REFERENCES members(id) |
| `store_id` | UUID | 가게 ID | NOT NULL, REFERENCES timesheet_stores(id) |
| `manager_id` | UUID | 담당 매니저 ID | NOT NULL, REFERENCES members(id) |
| `request_id` | UUID | 요청 ID | REFERENCES timesheet_attendance_requests(id) |
| `status` | ENUM | 근태 상태 | NOT NULL, timesheet_attendance_status |
| `started_at` | TIMESTAMPTZ | 시작 시간 | NOT NULL |
| `ended_at` | TIMESTAMPTZ | 종료 시간 | |
| `break_started_at` | TIMESTAMPTZ | 휴게 시작 시간 | |
| `break_ended_at` | TIMESTAMPTZ | 휴게 종료 시간 | |
| `is_modified` | BOOLEAN | 수정 여부 | NOT NULL, DEFAULT false |
| `modification_reason` | TEXT | 수정 사유 | |
| `modified_by` | UUID | 수정한 사람 ID | REFERENCES members(id) |
| `modified_at` | TIMESTAMPTZ | 수정 시간 | |
| `created_at` | TIMESTAMPTZ | 생성 시간 | NOT NULL, DEFAULT now() |
| `updated_at` | TIMESTAMPTZ | 수정 시간 | NOT NULL, DEFAULT now() |

**인덱스:**
- `idx_timesheet_attendance_records_partner_plus_id` ON `partner_plus_id`
- `idx_timesheet_attendance_records_store_id` ON `store_id`
- `idx_timesheet_attendance_records_manager_id` ON `manager_id`
- `idx_timesheet_attendance_records_started_at` ON `started_at`
- `idx_timesheet_attendance_records_status` ON `status`

### 6. `timesheet_audit_logs` - 감사 로그

모든 중요한 행동을 기록하는 감사 로그 테이블입니다.

| 컬럼명 | 타입 | 설명 | 제약조건 |
|--------|------|------|----------|
| `id` | UUID | 기본 키 | PRIMARY KEY, DEFAULT gen_random_uuid() |
| `actor_id` | UUID | 행위자 ID | NOT NULL, REFERENCES members(id) |
| `actor_role` | TEXT | 행위자 역할 | NOT NULL |
| `action` | ENUM | 행동 타입 | NOT NULL, timesheet_audit_action |
| `target_type` | TEXT | 대상 타입 | |
| `target_id` | UUID | 대상 ID | |
| `reason` | TEXT | 사유 | |
| `metadata` | JSONB | 추가 메타데이터 | |
| `created_at` | TIMESTAMPTZ | 생성 시간 | NOT NULL, DEFAULT now() |

**인덱스:**
- `idx_timesheet_audit_logs_actor_id` ON `actor_id`
- `idx_timesheet_audit_logs_action` ON `action`
- `idx_timesheet_audit_logs_created_at` ON `created_at`
- `idx_timesheet_audit_logs_target` ON `target_type`, `target_id`

### 7. `timesheet_settlements` - 정산 데이터

파트너+의 근태를 기반으로 한 정산 정보를 저장하는 테이블입니다.

| 컬럼명 | 타입 | 설명 | 제약조건 |
|--------|------|------|----------|
| `id` | UUID | 기본 키 | PRIMARY KEY, DEFAULT gen_random_uuid() |
| `partner_plus_id` | UUID | 파트너+ ID | NOT NULL, REFERENCES members(id) |
| `store_id` | UUID | 가게 ID | NOT NULL, REFERENCES timesheet_stores(id) |
| `attendance_record_id` | UUID | 근태 기록 ID | NOT NULL, REFERENCES timesheet_attendance_records(id) |
| `work_date` | DATE | 근무 일자 | NOT NULL |
| `work_hours` | DECIMAL(10,2) | 근무 시간 (시간) | NOT NULL |
| `hourly_rate` | DECIMAL(10,2) | 시급 | |
| `total_amount` | DECIMAL(10,2) | 총 금액 | |
| `is_paid` | BOOLEAN | 지급 여부 | NOT NULL, DEFAULT false |
| `paid_at` | TIMESTAMPTZ | 지급 시간 | |
| `notes` | TEXT | 비고 | |
| `created_at` | TIMESTAMPTZ | 생성 시간 | NOT NULL, DEFAULT now() |
| `updated_at` | TIMESTAMPTZ | 수정 시간 | NOT NULL, DEFAULT now() |

**인덱스:**
- `idx_timesheet_settlements_partner_plus_id` ON `partner_plus_id`
- `idx_timesheet_settlements_store_id` ON `store_id`
- `idx_timesheet_settlements_work_date` ON `work_date`
- `idx_timesheet_settlements_is_paid` ON `is_paid`

## 관계도 (ERD)

```
members (기존)
  ├── timesheet_partner_roles (1:1)
  ├── timesheet_store_managers (1:N)
  ├── timesheet_attendance_requests (1:N) - partner_plus_id
  ├── timesheet_attendance_requests (1:N) - manager_id
  ├── timesheet_attendance_records (1:N) - partner_plus_id
  ├── timesheet_attendance_records (1:N) - manager_id
  ├── timesheet_audit_logs (1:N) - actor_id
  └── timesheet_settlements (1:N) - partner_plus_id

timesheet_stores
  ├── timesheet_store_managers (1:N)
  ├── timesheet_attendance_requests (1:N)
  ├── timesheet_attendance_records (1:N)
  └── timesheet_settlements (1:N)

timesheet_attendance_requests
  └── timesheet_attendance_records (1:1) - request_id

timesheet_attendance_records
  └── timesheet_settlements (1:N) - attendance_record_id
```

## 비즈니스 로직 제약조건

### 1. 상태 전이 규칙

- `OFF` → `WORKING` (출근)
- `WORKING` → `BREAK` (휴게)
- `BREAK` → `WORKING` (휴게 종료)
- `WORKING` → `OFF` (퇴근)
- `BREAK` → `OFF` (퇴근)

이 규칙은 애플리케이션 레벨에서 검증해야 합니다.

### 2. 요청 제약조건

- 동일 상태 요청 중복 불가
- 요청 처리 완료 전 추가 요청 불가

이 제약조건은 애플리케이션 레벨에서 검증해야 합니다.

### 3. 권한 제약조건

- `timesheet_partner_roles`에 등록된 사용자만 시스템 접근 가능
- 모든 사용자가 `timesheet_partner_roles`에 등록 가능 (매니저는 파트너가 아니어도 지정 가능)

## 트리거 및 함수

### 1. `updated_at` 자동 업데이트

모든 테이블의 `updated_at` 컬럼은 레코드가 수정될 때 자동으로 현재 시간으로 업데이트됩니다.

### 2. 감사 로그 자동 기록

중요한 행동(근태 요청, 승인, 반려, 수정 등)이 발생하면 자동으로 `timesheet_audit_logs`에 기록됩니다.

## 보안 고려사항

1. **RLS (Row Level Security)**: Supabase RLS 정책을 통해 권한별 접근 제어
2. **감사 로그**: 모든 중요한 행동은 감사 로그에 기록되어 추적 가능
3. **데이터 무결성**: 외래 키 제약조건으로 데이터 일관성 보장

## 성능 최적화

1. **인덱스**: 자주 조회되는 컬럼에 인덱스 생성
2. **파티셔닝**: `timesheet_audit_logs`는 시간 기반 파티셔닝 고려
3. **아카이빙**: 오래된 감사 로그는 별도 아카이브 테이블로 이동

## 마이그레이션 전략

1. ENUM 타입 생성
2. 테이블 생성 (외래 키 제약조건 포함)
3. 인덱스 생성
4. 트리거 및 함수 생성
5. RLS 정책 설정

