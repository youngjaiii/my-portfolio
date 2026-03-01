# 🎮 Mate You - 게임 파트너 매칭 플랫폼

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=flat&logo=supabase&logoColor=white)](https://supabase.com/)

**Mate You**는 게이머들이 함께 게임을 즐길 수 있는 파트너를 찾고, 게임 코칭 서비스를 제공하는 현대적인 웹 플랫폼입니다.

## 🚀 프로젝트 소개

Mate You는 Discord OAuth를 통해 게임 파트너를 찾고 매칭할 수 있는 현대적인 웹 플랫폼입니다.

**핵심 가치:**

- 🎯 **간편한 매칭**: Discord 계정으로 즉시 시작
- 💬 **실시간 소통**: Supabase 실시간 구독을 통한 즉시 메시지 동기화
- 🔔 **스마트 알림**: 브라우저 알림으로 놓치지 않는 메시지
- 🏆 **전문 코칭**: 검증된 파트너들의 고품질 서비스
- 💰 **투명한 거래**: 포인트 시스템으로 안전한 결제
- 📱 **모바일 최적화**: 완벽한 모바일 사용자 경험

게이머들이 자신의 실력을 향상시키고, 함께 즐길 수 있는 동료를 찾는 최적의 공간을 제공합니다.

## 📸 주요 화면

### 메인 대시보드

파트너 목록과 실시간 상태를 확인할 수 있습니다.

### 실시간 채팅

인스타그램 스타일의 깔끔한 채팅 인터페이스로 파트너와 소통할 수 있습니다.

### 포인트 관리

직관적인 UI로 포인트 충전, 사용 내역 확인, 결제가 가능합니다.

## ✨ 주요 기능

### 👥 사용자 관리

- **Discord OAuth 로그인** - Discord 계정으로 간편 로그인
- **다중 역할 시스템** - 일반 회원, 파트너, 관리자
- **프로필 관리** - 프로필 이미지 업로드, 이름 변경, 게임 정보, 선호 게임, 인사말 등
- **실시간 상태 관리** - 온라인/오프라인/매칭중/게임중 상태 표시
- **프로필 편집 모달** - 프로필 이미지와 이름 실시간 수정

### 🎯 파트너 시스템

- **파트너 신청** - 게임 코칭/동반 서비스 제공자 신청
- **신청 검토** - 관리자의 파트너 신청 승인/거절
- **파트너 대시보드** - 의뢰 관리, 포인트 현황, 출금 관리
- **실시간 의뢰 관리** - 실시간 의뢰 상태 업데이트 및 알림
- **의뢰 수락/거절** - 디스코드 링크와 함께 클라이언트에게 자동 메시지 전송
- **의뢰 완료 처리** - 완료 버튼으로 포인트 자동 지급 및 상태 변경
- **자기 제외 시스템** - 파트너 목록에서 본인 제외 표시

### 💰 포인트 시스템

- **포인트 충전** - 충전 모달을 통한 포인트 구매 (1,000P ~ 50,000P)
- **포인트 적립** - 의뢰 완료 시 자동 포인트 적립
- **출금 시스템** - 파트너의 포인트 출금 신청 및 관리
- **포인트 내역 조회** - 충전/사용/출금 내역을 모달에서 실시간 확인
- **실시간 잔액** - 보유/대기/출금 완료 포인트 구분 표시
- **포인트 부족 방지** - 의뢰 시 포인트 부족하면 자동으로 충전 모달 표시
- **포인트 로깅** - 모든 포인트 변동 내역 자동 기록 및 추적

### 💬 실시간 채팅 시스템

- **인스타그램 스타일 UI** - 데스크톱에서 사이드바, 모바일에서 전체 화면
- **빠른 채팅** - 파트너 카드에서 바로 채팅 시작
- **실시간 메시지** - Supabase 실시간 구독을 통한 즉시 메시지 동기화
- **브라우저 알림** - 창이 비활성화일 때 새 메시지 데스크톱 알림
- **메시지 중복 방지** - 임시 메시지와 실제 메시지 구분으로 중복 방지
- **읽음 상태 관리** - 창 포커스 시 자동 읽음 처리 및 실시간 읽지 않은 메시지 수 표시
- **의뢰하기 통합** - 채팅 중 바로 의뢰 모달 열기 (포인트 부족 시 자동 충전 모달)
- **모바일 최적화** - 고정 헤더, 의뢰 영역, 채팅 영역, 입력 영역으로 구분된 모바일 UI
- **한글 입력 최적화** - 한글 입력 완성 전 엔터 키 처리 개선
- **차단 시스템** - 파트너 전용 사용자 차단/해제 기능 (채팅방 및 메시지 필터링)
- **서비스 필터링** - 활성화된 파트너 서비스만 표시 (비활성 서비스 자동 숨김)
- **Swiper 통합** - 의뢰 리스트에 Swiper 적용 (PC 3개, 모바일 1개 표시)

### 📊 관리자 기능

- **파트너 관리** - 신청 승인/거절, 파트너 상태 관리
- **출금 관리** - 포인트 출금 요청 승인/거절
- **회원 관리** - 전체 회원 정보 조회 및 관리
- **통계 대시보드** - 플랫폼 운영 현황 조회

## 🛠 기술 스택

### Frontend

- **React 19** - 최신 React 기능을 활용한 현대적 UI 개발
- **TypeScript** - 완전한 타입 안전성과 개발자 경험 향상
- **TanStack Router** - 타입 안전한 파일 기반 라우팅 시스템
- **TanStack Query** - 서버 상태 관리 및 캐싱 (1초 간격 실시간 업데이트)
- **Zustand** - 경량 클라이언트 상태 관리 (채팅, 인증)
- **Tailwind CSS** - 유틸리티 기반 반응형 스타일링
- **Vite** - 고속 개발 서버 및 번들링

### Backend & Database

- **Supabase** - BaaS 플랫폼 (인증, 데이터베이스, 스토리지, 실시간 기능)
- **PostgreSQL** - 안정적이고 확장 가능한 관계형 데이터베이스
- **Row Level Security (RLS)** - 세밀한 데이터 접근 권한 제어
- **Discord OAuth** - 소셜 로그인 통합

### Development Tools

- **Storybook** - 컴포넌트 독립 개발 및 문서화
- **ESLint + TypeScript** - 엄격한 코드 품질 관리
- **Prettier** - 일관된 코드 포맷팅
- **Vitest** - 빠른 유닛 테스트 실행

### 성능 & 최적화

- **Lazy Loading** - 라우트 기반 코드 스플리팅
- **React Query Caching** - 지능적인 데이터 캐싱 및 동기화
- **Barrel Exports** - 체계적인 모듈 구조로 번들 최적화
- **Responsive Design** - 모바일 우선 반응형 디자인
- **Optimistic Updates** - 사용자 경험 향상을 위한 낙관적 업데이트

## ⚡ 빠른 시작

```bash
# 1. 저장소 클론
git clone <repository-url>
cd mate_you

# 2. 의존성 설치
pnpm install

# 3. 환경변수 설정
cp .env.example .env
# .env 파일에서 Supabase 및 Discord 설정 입력

# 4. 개발 서버 실행
pnpm dev
```

🎉 이제 [http://localhost:3000](http://localhost:3000)에서 앱을 확인할 수 있습니다!

## 📦 상세 설치 가이드

### 필수 요구사항

- **Node.js 18.0.0 이상** - [다운로드](https://nodejs.org/)
- **pnpm (권장)** - `npm install -g pnpm`
- **Discord Application** - [Discord Developer Portal](https://discord.com/developers/applications)
- **Supabase Project** - [Supabase Dashboard](https://supabase.com/dashboard)

### 설치

```bash
# 저장소 클론
git clone [repository-url]
cd mate_you

# 의존성 설치
pnpm install
```

### 환경 변수 설정

`.env` 파일을 생성하고 다음 환경 변수를 설정하세요:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_DISCORD_CLIENT_ID=your_discord_client_id
VITE_REDIRECT_URI=your_redirect_uri
```

### Supabase REST 호출 시 주의사항

Supabase REST 엔드포인트를 직접 호출할 때는 `Accept: application/json` 헤더를 명시해야 합니다.  
헤더가 없으면 `406 Not Acceptable` 응답이 내려올 수 있습니다.

```bash
curl 'https://<project>.supabase.co/rest/v1/partners?select=id&member_id=eq.<member_id>' \
  -H "apikey: $SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json"
```

### 개발 서버 실행

```bash
pnpm dev
```

애플리케이션이 [http://localhost:3000](http://localhost:3000)에서 실행됩니다.

### Toss Payments 지급대행 연동 설정

파트너 정산을 Toss Payments 지급대행으로 처리하려면 아래 항목을 추가로 구성하세요.

1. **데이터베이스 스키마 업데이트**  
   `supabase/supabase/migrations/20250302093000_add_toss_payout_fields.sql`을 Supabase 프로젝트에 적용해
   파트너 테이블에 정산/셀러 필드를 추가합니다.

2. **Edge Function 배포**  
   새로 추가된 `supabase/functions/toss-payout-seller`를 배포합니다.

   ```bash
   supabase functions deploy toss-payout-seller
   ```

3. **보안 키 환경 변수 등록**  
   Toss Payments 개발자센터에서 발급한 API 키를 Supabase Edge Function 시크릿으로 설정합니다.

   ```bash
   supabase secrets set \
     TOSS_PAYMENTS_SECRET_KEY=sk_test_xxx \
     TOSS_PAYMENTS_ENCRYPTION_KEY=hex_encoded_security_key \
     TOSS_PAYMENTS_API_BASE_URL=https://api.tosspayments.com
   ```

   `TOSS_PAYMENTS_API_BASE_URL`는 기본값이 Toss 실운영 URL이므로, 샌드박스나 스테이징 환경에서만 변경하세요.

4. **클라이언트 환경 변수**  
   프런트엔드는 기존 `VITE_SUPABASE_*` 설정만 사용하지만, 파트너 신청 화면에서 실명/정산 계좌 정보를
   필수로 입력해야 합니다. 테스트 계정에는 샘플 데이터를 준비하세요.

## 📋 사용 가능한 스크립트

- `pnpm dev` - 개발 서버 실행 (포트 3000)
- `pnpm build` - 프로덕션 빌드
- `pnpm serve` - 빌드된 앱 미리보기
- `pnpm test` - 테스트 실행
- `pnpm lint` - ESLint 실행
- `pnpm format` - Prettier 실행
- `pnpm check` - 포맷팅 및 린팅 자동 수정
- `pnpm storybook` - Storybook 실행

## 🗄 데이터베이스 스키마

### 주요 테이블

#### `members` - 회원 정보

- 기본 회원 정보 (Discord ID, 이름, 역할 등)
- 게임 정보 및 선호 게임
- 현재 상태 (온라인/오프라인/매칭중/게임중)

#### `partners` - 파트너 정보

- 파트너 신청 정보
- 파트너 상태 (대기/승인/거절)
- 총 포인트 보유량

#### `partner_requests` - 의뢰 정보

- 클라이언트와 파트너 간의 의뢰
- 의뢰 상태 및 진행 상황
- 포인트 정보

#### `member_points_logs` - 포인트 로그 (회원용)

- 일반 회원의 포인트 변동 내역 (충전/사용)
- 타입별 구분 (earn/spend/withdraw)

#### `partner_points_logs` - 포인트 로그 (파트너용)

- 파트너의 포인트 변동 내역
- 타입별 구분 (earn/spend/withdraw)
- 은행 정보 (출금시)

#### `member_chats` - 채팅 메시지

- 회원 간 실시간 채팅 메시지
- 발신자, 수신자, 메시지 내용
- 생성 시간 기록

#### `partner_withdrawals` - 출금 요청

- 파트너의 출금 신청 정보
- 계좌 정보 및 상태 관리
- 관리자 검토 정보

#### `reviews` - 리뷰 시스템

- 파트너 평가 및 리뷰
- 평점 시스템 (1-5점)
- 포인트 지급 기록

### ENUM 타입

- `member_role`: 'normal' | 'partner' | 'admin'
- `partner_status`: 'none' | 'pending' | 'approved' | 'rejected'
- `member_status`: 'online' | 'offline' | 'matching' | 'in_game'
- `request_status`: 'pending' | 'in_progress' | 'completed' | 'cancelled'
- `points_log_type`: 'earn' | 'spend' | 'withdraw'
- `withdrawal_status`: 'pending' | 'approved' | 'rejected' | 'cancelled'

## 🎯 주요 컴포넌트

### 인증 및 사용자 관리

- `useAuth` - Discord OAuth 인증 훅
- `Navigation` - 네비게이션 바 (프로필 수정, 포인트 내역 통합)
- `ProfileEditModal` - 프로필 이미지와 이름 수정
- `PointsHistoryModal` - 포인트 내역 조회
- `ChargeModal` - 포인트 충전
- `DevModeSwitcher` - 개발 모드 전환

### 파트너 시스템

- `PartnerDashboard` - 파트너 전용 대시보드
- `PartnerCard` - 파트너 카드 컴포넌트
- `PartnerApplicationForm` - 파트너 신청 폼
- `PartnerApplicationModal` - 파트너 신청 모달
- `PartnerRequestModal` - 파트너 의뢰 모달 (ID 기반으로 리팩토링)
- `PartnerProfileModal` - 파트너 상세 프로필 모달
- `WithdrawModal` - 포인트 출금 신청 모달

### 채팅 시스템

- `SimpleChatInterface` - 인스타그램 스타일 채팅 인터페이스 (모바일 최적화)
- `SimpleChatRoom` - 개별 채팅방 컴포넌트 (실시간 메시지, 의뢰 통합)
- `useSimpleChat` - 채팅방 목록 및 실시간 업데이트 훅
- `useNotification` - 브라우저 알림 관리 훅
- `useDevice` - 모바일/데스크톱 감지 훅

### 관리자 시스템

- `AdminDashboard` - 관리자 전용 대시보드
- 파트너 신청 관리
- 출금 요청 관리
- 회원 관리

### 게임 정보

- `GameInfoInput` - 게임 정보 입력 컴포넌트
- `OnlineIndicator` - 온라인 상태 표시

### UI 컴포넌트

- `Button`, `Input`, `Textarea` - 기본 폼 컴포넌트
- `Modal`, `Toast` - 모달 및 알림
- `Typography`, `Flex`, `Grid` - 레이아웃 컴포넌트
- `Avatar` - 사용자 아바타

## 📱 페이지 구조

- `/` - 메인 페이지 (파트너 목록)
- `/login` - 로그인 페이지
- `/partners` - 전체 파트너 목록
- `/partners/[id]` - 파트너 상세 페이지
- `/partner/apply` - 파트너 신청 페이지
- `/partner/dashboard` - 파트너 대시보드
- `/dashboard/admin` - 관리자 대시보드
- `/admin` - 관리자 페이지 (간단 버전)
- `/chat` - 실시간 채팅 페이지 (파라미터로 파트너 선택)
- `/mypage` - 마이페이지 (포인트 충전 등)
- `/points` - 포인트 관리 페이지

## 🔒 권한 시스템

### 역할 구분

- **normal** - 일반 사용자
- **partner** - 승인된 파트너
- **admin** - 관리자

### 상태 구분

- **none** - 신청 안함
- **pending** - 신청 대기중
- **approved** - 승인됨
- **rejected** - 거절됨

## 🎨 스타일링

- **Tailwind CSS** 사용
- **반응형 디자인** (모바일 우선)
- **다크 모드 지원** 준비
- **일관된 디자인 시스템**

## 🧪 테스팅

```bash
# 단위 테스트 실행
pnpm test

# 테스트 커버리지 확인
pnpm test --coverage
```

## 💎 포인트 시스템 동작 방식

### 포인트 충전 (회원)

1. **충전 모달**: Navigation의 포인트 클릭 → 충전 모달 열기
2. **결제 시뮬레이션**: 1,000P~50,000P 단위로 충전 선택
3. **로그 생성**: `member_points_logs`에 `type: 'earn'` 로그 생성
4. **포인트 증가**: `members.total_points` 증가

### 포인트 사용 (의뢰)

1. **의뢰 신청**: 파트너 의뢰 시 포인트 차감
2. **부족 시 자동 충전**: 포인트 부족하면 자동으로 충전 모달 표시
3. **로그 생성**: `member_points_logs`에 `type: 'spend'` 로그 생성
4. **포인트 차감**: `members.total_points` 감소

### 포인트 적립 (파트너)

1. 파트너가 의뢰를 완료하면 자동으로 포인트 적립
2. `partner_points_logs`에 `type: 'earn'` 로그 생성
3. `partners.total_points` 증가

### 출금 신청 프로세스

1. **신청**: 파트너가 출금 신청 → `partners.total_points`에서 즉시 차감
2. **대기**: `partner_withdrawals`에 `status: 'pending'` 레코드 생성
3. **관리자 검토**:
   - **승인시**: `status: 'approved'` + 출금 완료 로그 생성
   - **거절시**: `status: 'rejected'` + 포인트 복구 + 복구 로그 생성

### 포인트 표시

- **보유 포인트**: `partners.total_points` (현재 사용 가능한 포인트)
- **환전 대기**: `partner_withdrawals`에서 `status: 'pending'`인 금액 합계
- **포인트 히스토리**: `partner_points_logs`의 모든 변동 내역

## 📚 개발 가이드

### 새로운 컴포넌트 추가

1. `src/components/` 디렉토리에 컴포넌트 생성
2. TypeScript 인터페이스 정의
3. Tailwind CSS를 사용한 스타일링
4. 기존 컴포넌트 패턴 따르기

### 새로운 API 추가

1. `src/lib/` 디렉토리에 API 함수 추가
2. Supabase 클라이언트 사용
3. 에러 핸들링 및 타입 안전성 확보

### 새로운 페이지 추가

1. `src/routes/` 디렉토리에 파일 생성
2. TanStack Router 자동 라우트 생성
3. 필요한 로더 및 액션 정의

### 상태 관리

- **서버 상태**: TanStack Query 사용
- **클라이언트 상태**: Zustand 사용
- **폼 상태**: React Hook Form (권장)

### 데이터베이스 스키마 변경

1. Supabase 대시보드에서 스키마 수정
2. `src/types/database.ts` 타입 정의 업데이트
3. 관련 컴포넌트 및 API 수정

## 🚀 배포

### Vercel 배포 (권장)

```bash
# 프로덕션 빌드
npm run build

# Vercel CLI 사용 또는 GitHub 연동
```

### 환경 변수 설정

배포 환경에서 다음 환경 변수들을 설정해야 합니다:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_DISCORD_CLIENT_ID`
- `VITE_REDIRECT_URI`

### 빌드 결과물

빌드 결과물은 `dist/` 디렉토리에 생성됩니다.

## 🤝 기여하기

Mate You 프로젝트에 기여해주셔서 감사합니다!

### 기여 프로세스

1. **Fork & Clone**

   ```bash
   git clone https://github.com/your-username/mate_you.git
   cd mate_you
   ```

2. **개발 환경 설정**

   ```bash
   pnpm install
   cp .env.example .env
   # 환경 변수 설정 후
   pnpm dev
   ```

3. **기능 브랜치 생성**

   ```bash
   git checkout -b feature/amazing-feature
   ```

4. **개발 및 테스트**

   ```bash
   pnpm lint        # 코드 품질 검사
   pnpm test        # 테스트 실행
   pnpm build       # 빌드 확인
   ```

5. **커밋 & 푸시**

   ```bash
   git commit -m "feat: add amazing feature"
   git push origin feature/amazing-feature
   ```

6. **Pull Request 생성**

### 커밋 컨벤션

- `feat:` 새로운 기능
- `fix:` 버그 수정
- `docs:` 문서 수정
- `style:` 코드 포맷팅
- `refactor:` 코드 리팩토링
- `test:` 테스트 추가/수정

### 코드 스타일

- TypeScript strict mode 준수
- ESLint + Prettier 설정 따르기
- 컴포넌트는 적절한 폴더에 분류
- Barrel exports 사용

## 📄 라이선스

이 프로젝트는 MIT 라이선스 하에 배포됩니다.

## 🔒 보안

- **Row Level Security (RLS)**: Supabase RLS를 통한 데이터 접근 제어
- **타입 안전성**: TypeScript를 통한 컴파일 타임 에러 방지
- **입력 검증**: 모든 사용자 입력에 대한 유효성 검사
- **권한 기반 접근**: 사용자 역할에 따른 기능 제한

## 💳 환불 규정

### 📋 기본 원칙

**Mate You**는 공정하고 투명한 환불 정책을 통해 사용자의 권익을 보호합니다.

### ⏰ 이용 기간 및 환불 정책

#### 🗓 **12개월 이용 기간**

- **포인트 유효기간**: 충전일로부터 **12개월**
- **미사용 포인트**: 유효기간 만료 시 자동 소멸
- **기간 연장**: 추가 충전 시 전체 포인트 유효기간이 최신 충전일로부터 12개월로 연장

#### 💰 **환불 가능 조건**

**즉시 환불 (100%)**

- 충전 후 **7일 이내** + 포인트 **미사용**
- 서비스 장애로 인한 이용 불가 (전액 보상)
- 파트너의 서비스 미제공 시 해당 의뢰 금액

**부분 환불 (잔여 포인트)**

- 충전 후 **30일 이내** + 포인트 **부분 사용**
- 환불 수수료 10% 차감 후 잔여 포인트 환불
- 계정 해지 시 잔여 포인트 (유효기간 내)

**환불 불가**

- 충전 후 **30일 경과**
- 포인트 **전체 사용** 완료
- 유효기간 **만료된 포인트**
- 부정 사용이 확인된 경우

#### 🔄 **환불 처리 절차**

1. **신청**: 고객센터 또는 마이페이지에서 환불 신청
2. **검토**: 환불 조건 확인 (영업일 기준 3일)
3. **승인**: 환불 승인 시 원 결제 수단으로 환불
4. **완료**: 환불 처리 완료 (영업일 기준 5-7일)

#### ⚠️ **특별 조건**

**파트너 서비스 관련**

- 파트너가 서비스를 제공하지 않을 경우: **전액 환불**
- 서비스 품질 불만족 시: 리뷰 작성 후 **부분 환불** 검토
- 의뢰 취소 시 (파트너 수락 전): **즉시 포인트 복구**

**시스템 장애 관련**

- 시스템 장애로 인한 서비스 이용 불가: **이용 연장** 또는 **포인트 보상**
- 데이터 손실 시: **손실 포인트 복구** + **추가 보상**

#### 📞 **환불 문의**

- **이메일**: contact@mateyou.me
- **고객센터**: 평일 09:00 - 18:00
- **처리 시간**: 신청 후 영업일 기준 3-7일

#### 📝 **환불 관련 주의사항**

- 환불은 원 결제 수단으로만 가능합니다
- 부분 환불 시 환불 수수료가 차감됩니다
- 허위 신청 시 계정 이용이 제한될 수 있습니다
- 환불 정책은 사전 공지 후 변경될 수 있습니다

## 📞 지원 및 문의

### 버그 리포트 & 기능 요청

- [GitHub Issues](https://github.com/your-repo/mate_you/issues) - 버그 신고 및 기능 제안
- [GitHub Discussions](https://github.com/your-repo/mate_you/discussions) - 질문 및 아이디어 토론

### 개발팀 연락처

- **이메일**: dev@mateyou.com
- **Discord**: [개발자 커뮤니티](https://discord.gg/mateyou)

### 도움이 필요하신가요?

1. 📋 [FAQ 문서](./docs/FAQ.md) 먼저 확인
2. 🔍 [기존 이슈](https://github.com/your-repo/mate_you/issues) 검색
3. 💬 새로운 이슈 생성

---

<div align="center">

### 🎮 **Mate You** 🎮

**게이머들을 위한 최고의 파트너 매칭 플랫폼**

[![GitHub stars](https://img.shields.io/github/stars/your-repo/mate_you?style=social)](https://github.com/your-repo/mate_you)
[![GitHub forks](https://img.shields.io/github/forks/your-repo/mate_you?style=social)](https://github.com/your-repo/mate_you)

Made with ❤️ by the Mate You Team

</div>

## 📁 프로젝트 구조

```
src/
├── components/          # React 컴포넌트들
│   ├── ui/             # 기본 UI 컴포넌트들 (Button, Input, Modal 등)
│   ├── features/       # 기능별 컴포넌트들 (Chat, PartnerCard 등)
│   ├── modals/         # 모달 컴포넌트들
│   ├── forms/          # 폼 관련 컴포넌트들
│   └── layouts/        # 레이아웃 컴포넌트들 (Navigation, Footer)
├── hooks/              # React 커스텀 훅들
├── store/              # Zustand 상태 관리
├── lib/                # 유틸리티 라이브러리들
├── types/              # TypeScript 타입 정의들
├── routes/             # TanStack Router 라우트들
├── utils/              # 헬퍼 함수들
└── integrations/       # 외부 라이브러리 통합
```

### 컴포넌트 분류

#### UI 컴포넌트 (재사용 가능한 기본 컴포넌트)

- Button, Input, Textarea, Modal, Avatar
- Typography, Flex, Grid, LoadingSpinner
- StarRating, OnlineIndicator, GameBadges

#### 기능 컴포넌트 (비즈니스 로직 포함)

- PartnerCard, PartnerDashboard, SimpleChatInterface
- SimpleChatRoom, PointsCard, Banner, ToastContainer
- DeviceInfo, RequestInfo (모바일 전용 컴포넌트)

#### 모달 컴포넌트

- ChargeModal, ProfileEditModal, PointsHistoryModal
- PartnerRequestModal, PartnerProfileModal
- 각종 신청/관리 모달들

#### 폼 컴포넌트

- PartnerApplicationForm, GameInfoInput, ImageUpload

#### 레이아웃 컴포넌트

- Navigation, Footer, MobileMenu, MobileTabBar
- DeviceWrapper, ResponsiveContainer (반응형 래퍼)

### 상태 관리

- **Supabase Realtime**: 실시간 데이터 동기화 (채팅, 의뢰 상태)
- **React Query**: 서버 상태 관리 및 캐싱
- **Zustand**: 클라이언트 상태 관리 (인증, 디바이스 정보)
- **Context**: 테마, 토스트 등 글로벌 상태

### 최근 추가된 훅들

- `useNotification` - 브라우저 알림 권한 관리 및 알림 표시
- `useDevice` - 모바일/데스크톱 감지 및 화면 크기 반응형 처리
- `useSimpleChat` - 채팅방 목록 및 읽지 않은 메시지 수 관리
- `usePartnerRequests` - 파트너 의뢰 수락/거절 처리 및 자동 메시지 전송
