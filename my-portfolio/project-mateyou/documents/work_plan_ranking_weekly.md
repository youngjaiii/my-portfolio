# 방송 후원 랭킹 기준 변경 작업 계획서

**작성일**: 2025-12-25  
**작업 번호**: 4  
**예상 작업 시간**: 5시간  
**우선순위**: 높음

---

## 목차

1. [작업 개요](#1-작업-개요)
2. [현재 상태 분석](#2-현재-상태-분석)
3. [변경 사항](#3-변경-사항)
4. [상세 작업 계획](#4-상세-작업-계획)
5. [테스트 계획](#5-테스트-계획)
6. [배포 계획](#6-배포-계획)

---

## 1. 작업 개요

### 1.1 목적

방송 내부에 표시되는 팬 랭킹(후원 기준)을 다음과 같이 변경합니다:

1. **호스트만 기준**: 호스트에게만 후원한 내역만 집계
2. **1주일 단위 자동 초기화**: 매주 월요일 00:00에 자동 초기화
3. **동일 금액 시 우선순위**: 동일 금액일 경우 먼저 후원한 사람이 우선 순위

### 1.2 영향 범위

- **데이터베이스**: `stream_donation_rankings` 뷰 재생성
- **프론트엔드**: 기존 랭킹 컴포넌트 수정 (주 기간 정보 표시)
- **백엔드**: 변경 없음 (뷰 변경으로 자동 반영)

---

## 2. 현재 상태 분석

### 2.1 현재 랭킹 시스템

**뷰**: `stream_donation_rankings`
- 모든 후원자 포함 (호스트 제외 안 됨)
- 방송 시작부터 현재까지 전체 누적
- 주 단위 초기화 없음
- 동일 금액일 때 순위 결정 기준 불명확

**프론트엔드**:
- `src/hooks/useStreamDonations.ts`: 랭킹 조회 훅
- `src/components/features/stream/DonationRankingTicker.tsx`: 채팅 위쪽 랭킹 표시 컴포넌트
- Top 5만 표시, 30초마다 자동 갱신

### 2.2 문제점

1. 모든 후원자 포함 (호스트에게만 후원한 내역만 집계해야 함)
2. 기간 설정 없음 (1주일 단위로 초기화 필요)
3. 동일 금액일 때 순위 결정 기준 불명확

---

## 3. 변경 사항

### 3.1 데이터베이스 변경

#### 3.1.1 뷰 재생성

**파일**: `documents/migration_stream_donation_rankings_weekly.sql`

**주요 변경사항**:
1. 호스트만 기준 필터 추가: `sd.recipient_partner_id = sr.host_partner_id`
2. 1주일 단위 집계 로직 추가:
   - 현재 주 시작일: `DATE_TRUNC('week', CURRENT_TIMESTAMP)` (월요일 00:00)
   - 방송 시작일이 현재 주보다 이전이면 현재 주 시작일부터 집계
   - 방송 시작일이 현재 주 내이면 방송 시작일부터 집계
3. 동일 금액 시 우선순위: `ORDER BY SUM(amount) DESC, MIN(created_at) ASC`

#### 3.1.2 인덱스 최적화

**인덱스**: `idx_stream_donations_ranking`
- 컬럼: `(room_id, recipient_partner_id, created_at DESC)`
- 목적: 랭킹 조회 성능 향상

### 3.2 프론트엔드 변경

#### 3.2.1 주 기간 정보 표시

**파일**: `src/components/features/stream/DonationRankingTicker.tsx`

**변경사항**:
- 현재 주 기간 정보 표시 (예: "이번 주: 12/25 ~ 12/31")
- 주 기간 정보는 클라이언트에서 계산하거나 API에서 받아옴

#### 3.2.2 타입 정의 확인

**파일**: `src/hooks/useStreamDonations.ts`

**변경사항**:
- `DonationRanking` 타입에 `first_donation_at` 필드 추가 확인
- 주 기간 정보를 계산하는 유틸 함수 추가 (선택사항)

---

## 4. 상세 작업 계획

### 4.1 데이터베이스 작업 (2시간)

#### 작업 1: 마이그레이션 파일 생성 ✅

- [x] `documents/migration_stream_donation_rankings_weekly.sql` 생성
- [x] 뷰 재생성 SQL 작성
- [x] 인덱스 최적화 SQL 작성
- [x] 검증 쿼리 추가

#### 작업 2: 마이그레이션 실행

- [ ] Supabase Dashboard에서 SQL Editor 열기
- [ ] `migration_stream_donation_rankings_weekly.sql` 파일 내용 복사
- [ ] SQL 실행
- [ ] 에러 확인 및 수정

#### 작업 3: 검증

- [ ] 뷰가 정상적으로 생성되었는지 확인
  ```sql
  SELECT * FROM stream_donation_rankings LIMIT 5;
  ```
- [ ] 호스트만 기준으로 필터링되는지 확인
  ```sql
  SELECT 
    sd.room_id,
    sd.recipient_partner_id,
    sr.host_partner_id,
    COUNT(*) as donation_count
  FROM stream_donations sd
  JOIN stream_rooms sr ON sr.id = sd.room_id
  WHERE sd.room_id = '<room_id>'
  GROUP BY sd.room_id, sd.recipient_partner_id, sr.host_partner_id;
  ```
- [ ] 주 단위 집계가 정상적으로 동작하는지 확인
  ```sql
  SELECT 
    DATE_TRUNC('week', CURRENT_TIMESTAMP) AS current_week_start,
    DATE_TRUNC('week', CURRENT_TIMESTAMP) + INTERVAL '7 days' AS next_week_start;
  ```
- [ ] 동일 금액일 경우 먼저 후원한 사람이 우선순위인지 확인
  ```sql
  SELECT 
    donor_id,
    donor_name,
    total_amount,
    first_donation_at,
    rank
  FROM stream_donation_rankings
  WHERE room_id = '<room_id>'
  ORDER BY rank ASC
  LIMIT 10;
  ```

### 4.2 프론트엔드 작업 (2시간)

#### 작업 1: 주 기간 계산 유틸 함수 추가

**파일**: `src/utils/dateUtils.ts` 또는 새 파일 생성

```typescript
/**
 * 현재 주의 시작일과 종료일 계산
 * @returns { start: Date, end: Date } 주의 시작일(월요일 00:00)과 종료일(일요일 23:59:59)
 */
export function getCurrentWeekRange(): { start: Date; end: Date } {
  const now = new Date()
  const day = now.getDay() // 0: 일요일, 1: 월요일, ..., 6: 토요일
  const diff = day === 0 ? -6 : 1 - day // 월요일까지의 차이
  
  const start = new Date(now)
  start.setDate(now.getDate() + diff)
  start.setHours(0, 0, 0, 0)
  
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  
  return { start, end }
}

/**
 * 주 기간을 포맷팅
 * @param start 시작일
 * @param end 종료일
 * @returns "12/25 ~ 12/31" 형식의 문자열
 */
export function formatWeekRange(start: Date, end: Date): string {
  const startStr = `${start.getMonth() + 1}/${start.getDate()}`
  const endStr = `${end.getMonth() + 1}/${end.getDate()}`
  return `${startStr} ~ ${endStr}`
}
```

- [ ] 유틸 함수 생성
- [ ] 테스트 작성 (선택사항)

#### 작업 2: DonationRankingTicker 컴포넌트 수정

**파일**: `src/components/features/stream/DonationRankingTicker.tsx`

**변경사항**:
1. 주 기간 정보 표시 추가
2. 타이틀 배지 옆에 주 기간 표시

```typescript
// 추가할 코드 예시
const weekRange = useMemo(() => {
  const { start, end } = getCurrentWeekRange()
  return formatWeekRange(start, end)
}, [])

// 타이틀 배지 수정
<div className="absolute left-2 top-1/2 -translate-y-1/2 z-20 flex items-center gap-2">
  <div className="flex items-center gap-1 bg-gradient-to-r from-amber-400 to-orange-500 text-white px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm">
    <Trophy className="w-3 h-3" />
    <span>TOP</span>
  </div>
  <span className="text-[9px] text-gray-600 dark:text-gray-300">
    이번 주: {weekRange}
  </span>
</div>
```

- [ ] 주 기간 계산 함수 import
- [ ] 주 기간 정보 표시 UI 추가
- [ ] 스타일 조정 (반응형 고려)

#### 작업 3: 타입 정의 확인

**파일**: `src/hooks/useStreamDonations.ts`

**변경사항**:
- `DonationRanking` 타입에 `first_donation_at` 필드가 있는지 확인
- 없으면 추가

```typescript
export interface DonationRanking {
  room_id: string
  donor_id: string
  donor_name: string
  donor_profile_image: string | null
  total_amount: number
  donation_count: number
  first_donation_at: string  // 추가
  last_donation_at: string
  rank: number
}
```

- [ ] 타입 정의 확인 및 수정
- [ ] 타입 에러 확인

### 4.3 테스트 작업 (1시간)

#### 작업 1: 단위 테스트

- [ ] 주 기간 계산 함수 테스트
- [ ] 랭킹 정렬 테스트 (동일 금액 시 먼저 후원한 사람 우선)

#### 작업 2: 통합 테스트

- [ ] 방송 페이지에서 랭킹 표시 확인
- [ ] 호스트에게만 후원한 내역만 표시되는지 확인
- [ ] 주 기간 정보가 정상적으로 표시되는지 확인
- [ ] 월요일 00:00에 랭킹이 초기화되는지 확인 (다음 주 월요일까지 대기 또는 테스트 데이터로 확인)

---

## 5. 테스트 계획

### 5.1 기능 테스트

#### 테스트 케이스 1: 호스트만 기준 필터링

**전제 조건**:
- 방송 생성 (호스트 A)
- 후원자 1: 호스트 A에게 10,000P 후원
- 후원자 2: 발언자 B에게 5,000P 후원

**실행**:
1. 랭킹 조회
2. 후원자 1만 랭킹에 표시되는지 확인
3. 후원자 2는 랭킹에 표시되지 않는지 확인

**예상 결과**: 후원자 1만 랭킹에 표시됨

#### 테스트 케이스 2: 1주일 단위 집계

**전제 조건**:
- 현재 주: 2025-12-25 (월) ~ 2025-12-31 (일)
- 이전 주 후원: 2025-12-20에 10,000P 후원
- 현재 주 후원: 2025-12-26에 5,000P 후원

**실행**:
1. 랭킹 조회
2. 현재 주 후원(5,000P)만 집계되는지 확인
3. 이전 주 후원(10,000P)은 집계되지 않는지 확인

**예상 결과**: 현재 주 후원만 집계됨

#### 테스트 케이스 3: 동일 금액 시 우선순위

**전제 조건**:
- 후원자 1: 2025-12-25 10:00에 10,000P 후원
- 후원자 2: 2025-12-25 11:00에 10,000P 후원

**실행**:
1. 랭킹 조회
2. 후원자 1이 후원자 2보다 위에 표시되는지 확인

**예상 결과**: 후원자 1이 1위, 후원자 2가 2위

#### 테스트 케이스 4: 주 기간 정보 표시

**전제 조건**:
- 현재 날짜: 2025-12-25 (수)

**실행**:
1. 방송 페이지 접속
2. 채팅 위쪽 랭킹 영역 확인
3. "이번 주: 12/25 ~ 12/31" 형식으로 표시되는지 확인

**예상 결과**: 주 기간 정보가 정상적으로 표시됨

### 5.2 성능 테스트

- [ ] 랭킹 조회 쿼리 실행 시간 확인 (목표: 100ms 이하)
- [ ] 인덱스가 정상적으로 사용되는지 확인
- [ ] 대량 데이터 환경에서 성능 테스트

### 5.3 UI/UX 테스트

- [ ] 주 기간 정보가 가독성 있게 표시되는지 확인
- [ ] 모바일 환경에서 레이아웃이 깨지지 않는지 확인
- [ ] 다크 모드에서도 정상적으로 표시되는지 확인

---

## 6. 배포 계획

### 6.1 배포 순서

1. **데이터베이스 마이그레이션** (1단계)
   - Supabase Dashboard에서 SQL 실행
   - 검증 쿼리 실행

2. **프론트엔드 배포** (2단계)
   - 개발 환경에서 테스트
   - 프로덕션 빌드 및 배포

### 6.2 롤백 계획

**문제 발생 시**:

1. **데이터베이스 롤백**
   ```sql
   -- 기존 뷰로 복원 (백업 필요)
   DROP VIEW IF EXISTS stream_donation_rankings;
   -- 기존 뷰 SQL 실행
   ```

2. **프론트엔드 롤백**
   - 이전 버전으로 배포
   - 또는 Git으로 이전 커밋으로 복원

### 6.3 모니터링

- [ ] 랭킹 조회 쿼리 성능 모니터링
- [ ] 에러 로그 확인
- [ ] 사용자 피드백 수집

---

## 7. 체크리스트

### 데이터베이스
- [ ] 마이그레이션 파일 생성 완료
- [ ] 마이그레이션 실행
- [ ] 뷰 정상 생성 확인
- [ ] 인덱스 생성 확인
- [ ] 검증 쿼리 실행

### 프론트엔드
- [ ] 주 기간 계산 유틸 함수 생성
- [ ] DonationRankingTicker 컴포넌트 수정
- [ ] 타입 정의 확인 및 수정
- [ ] 스타일 조정
- [ ] 반응형 확인

### 테스트
- [ ] 호스트만 기준 필터링 테스트
- [ ] 1주일 단위 집계 테스트
- [ ] 동일 금액 시 우선순위 테스트
- [ ] 주 기간 정보 표시 테스트
- [ ] 성능 테스트
- [ ] UI/UX 테스트

### 배포
- [ ] 데이터베이스 마이그레이션 실행
- [ ] 프론트엔드 배포
- [ ] 모니터링 설정

---

## 8. 참고 자료

- `documents/feature_planning_2025_12.md` - 기능 기획서
- `documents/migration_stream_donation_rankings_weekly.sql` - 마이그레이션 파일
- `src/hooks/useStreamDonations.ts` - 랭킹 조회 훅
- `src/components/features/stream/DonationRankingTicker.tsx` - 랭킹 표시 컴포넌트
- `documents/stream_schema_v2.sql` - 스트림 스키마

---

**작성자**: AI Assistant  
**검토 필요**: 개발팀 리뷰 후 진행

