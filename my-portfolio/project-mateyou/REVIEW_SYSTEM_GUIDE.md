# 리뷰 시스템 사용 가이드 (업데이트됨)

## 구현된 기능 ✅

**모든 role(클라이언트, 파트너) 리뷰 작성 가능!**

### 1. 자동 리뷰 모달 (`ReviewNotificationProvider`)

파트너 요청이 완료되면 자동으로 리뷰 작성 모달이 표시됩니다.

**설정 방법:**

```tsx
import { ReviewNotificationProvider } from '@/components/features'

function App() {
  return (
    <ReviewNotificationProvider>{/* 앱 컨텐츠 */}</ReviewNotificationProvider>
  )
}
```

**기능:**

- 요청 완료 시 토스트 알림 + 3초 후 자동 모달 표시
- 24시간 내 리뷰 안 쓴 요청들 자동 감지
- 실시간 요청 상태 변경 감지

### 2. 리뷰 작성/편집 모달 (`ReviewModal`)

파트너에게 리뷰를 작성하거나 기존 리뷰를 편집할 수 있습니다.

**사용 방법:**

```tsx
import { ReviewModal } from '@/components/modals'

;<ReviewModal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  partnerId="partner-uuid"
  partnerName="파트너 이름"
  requestId="request-uuid" // 선택사항
  existingReview={{
    // 편집 시에만
    id: 1,
    rating: 5,
    comment: '기존 리뷰 내용',
  }}
  onReviewSubmitted={() => {
    // 리뷰 작성/수정 완료 후 콜백
  }}
/>
```

**기능:**

- 1-5점 별점 평가
- 리뷰 내용 작성 (최대 500자)
- 신규 리뷰 작성 시 10포인트 지급
- 기존 리뷰 편집 기능

### 3. 최근 파트너 섹션 (`RecentPartnersSection`)

최근 함께한 파트너들을 보여주고 리뷰 작성 버튼을 제공합니다.

**사용 방법:**

```tsx
import { RecentPartnersSection } from '@/components/features'

;<RecentPartnersSection />
```

**기능:**

- 최근 완료된 요청의 파트너 목록 표시
- 리뷰 작성/수정 버튼
- 리뷰 완료 상태 표시 (별 아이콘)
- 요청 타입, 완료 시간, 작업 수 표시

### 4. 내 리뷰 목록 (`MyReviewsSection`)

사용자가 작성한 모든 리뷰를 조회하고 편집할 수 있습니다.

**사용 방법:**

```tsx
import { MyReviewsSection } from '@/components/features'

;<MyReviewsSection />
```

**기능:**

- 작성한 모든 리뷰 목록 표시
- 별점별 필터링 (1-5점)
- 정렬 (최신순, 오래된순, 별점 높은순, 낮은순)
- 리뷰 편집 기능
- 파트너 프로필 이미지와 정보 표시

## 데이터베이스 구조

### Reviews 테이블

```sql
- id: 리뷰 ID
- member_id: 작성자 ID (클라이언트)
- target_partner_id: 대상 파트너 ID
- rating: 별점 (1-5)
- comment: 리뷰 내용
- points_earned: 획득 포인트 (기본 10)
- review_code: 리뷰 코드 (REQ_{request_id} 형식)
- created_at: 작성 시간
```

### Jobs 테이블

```sql
- review_code: 리뷰 코드
- is_reviewed: 리뷰 완료 여부
```

## 통합 예시

### 대시보드에 모든 기능 통합

```tsx
import {
  ReviewNotificationProvider,
  RecentPartnersSection,
  MyReviewsSection,
} from '@/components/features'

function Dashboard() {
  return (
    <ReviewNotificationProvider>
      <div className="space-y-6">
        <RecentPartnersSection />
        <MyReviewsSection />
      </div>
    </ReviewNotificationProvider>
  )
}
```

### 메인 앱에 알림 Provider 추가

```tsx
// App.tsx 또는 main layout
import { ReviewNotificationProvider } from '@/components/features'

function App() {
  return (
    <ReviewNotificationProvider>
      <Router>{/* 라우터 및 페이지들 */}</Router>
    </ReviewNotificationProvider>
  )
}
```

## 주요 특징

1. **자동화**: 요청 완료 시 자동으로 리뷰 모달 표시
2. **실시간**: Supabase 실시간 구독으로 즉시 감지
3. **포인트 보상**: 리뷰 작성 시 10포인트 자동 지급
4. **편집 가능**: 언제든 리뷰 수정 가능
5. **필터링**: 별점별, 시간별 정렬 및 필터링
6. **사용자 경험**: 직관적인 UI와 토스트 알림

## 환경 설정

리뷰 시스템이 올바르게 작동하려면:

1. Supabase 실시간 구독 활성화
2. `reviews`, `jobs`, `partner_requests`, `members` 테이블 권한 설정
3. 포인트 시스템 (`member_points_logs`, `members.total_points`) 연동

모든 컴포넌트는 타입스크립트로 작성되어 있으며, 에러 처리와 로딩 상태를 포함합니다.

---

## 🐛 문제 해결 (Troubleshooting)

### 리뷰 모달이 표시되지 않는 경우:

1. **ReviewNotificationProvider가 App 최상위에 있는지 확인**
2. **완료된 요청이 있는지 확인** (status = 'completed')
3. **브라우저 콘솔에서 [Review Notification] 로그 확인**

### 최근 파트너 목록이 비어있는 경우:

1. **완료된 partner_requests가 있는지 확인**
2. **브라우저 콘솔에서 [Recent Partners] 로그 확인**
3. **데이터베이스 권한 설정 확인**

### 테스트 방법:

모달 컴포넌트를 직접 사용하여 테스트:

```tsx
import { ReviewModal } from '@/components/modals'

// 개발 시 테스트용으로 모달 열기
;<ReviewModal
  isOpen={true}
  onClose={() => {}}
  partnerId="test-partner-id"
  partnerName="테스트 파트너"
/>
```

### 디버깅 팁:

- 개발자 도구 콘솔에서 로그 확인
- Supabase 데이터베이스에서 데이터 직접 확인
- 요청 완료 후 24시간 이내에 리뷰 알림 표시

## 📋 체크리스트

설치 전 확인사항:

- [ ] Supabase 프로젝트 설정 완료
- [ ] 필요한 테이블들 생성 (reviews, partner_requests, jobs, members)
- [ ] Row Level Security (RLS) 정책 설정
- [ ] 실시간 구독 활성화

사용 전 확인사항:

- [ ] ReviewNotificationProvider를 App 최상위에 래핑
- [ ] 완료된 파트너 요청 데이터 존재
- [ ] 사용자 인증 상태 확인
