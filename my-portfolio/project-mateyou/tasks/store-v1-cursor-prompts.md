# /tasks/store-v1-cursor-prompts.md
# MateYou Partner Store v1 - Cursor 실행 프롬프트 세트 (프론트 신규 구현 / 백엔드 API·DB는 이미 존재)

> 목적: requirements/requirement.md + tasks/store-v1-backlog.md 기준으로,
> **이미 구현된 Store 백엔드 API + Store 전용 DB 테이블을 그대로 사용**하여
> 앱(프론트/UX/플로우)을 새로 구현해 “완성된 Store 기능”을 만든다.
>
> 현재 상태 전제:
> - Store 백엔드(API + DB)는 이미 구현됨
> - Store 프론트(화면/플로우)는 “이제부터” 구현
>
> 최우선 원칙:
> - **기존 Store API/DB는 그대로 사용(SoT)**
> - 프론트는 PRD 플로우에 맞춰 신규 구현하되, 연동은 기존 API로만 한다

---

## 0) 절대 규칙(무조건 준수)

### 0.1 절대 금지
- Store 백엔드 **외부 엔드포인트(라우트) 추가/변경/alias 금지**
- Store DB **신규 테이블/컬럼/인덱스 추가 금지**
- 레거시 schedule 시스템(기존 앱 schedule) **touch 0**
  - 레거시 schedule 관련 DB/코드/API/잡/상태전이/연계 로직 전부 수정 금지
  - Store 코드에서 레거시 ScheduleService/Repository import 금지
- timesheet 코드는 **조회(Read-only)만** 허용(수정 금지)

### 0.2 허용 범위(이 안에서만 작업)
- 프론트(웹/앱) **화면 신규 구현** 및 기존 UI에 스토어 섹션 추가
- 기존 Store API를 호출하는 **클라이언트/SDK/API 레이어** 신규 작성(프론트 내부)
- 서버는 원칙적으로 손대지 않는다.
  - 단, “명백한 버그/보안취약점”으로 인해 PRD 플로우가 불가능한 경우에 한해
    **내부 로직만 최소 수정** 가능
  - 그 경우에도: **엔드포인트/요청·응답 스키마/DB 스키마 절대 변경 금지**

---

## 1) 공통 규칙(모든 세션 상단에 그대로 붙이기)

[COMMON RULES]
- SoT(정책/플로우): requirements/requirement.md, tasks/store-v1-backlog.md
- SoT(기술/구현): “이미 구현된 Store 백엔드 API + Store DB”
- 신규 엔드포인트/라우트/alias 금지
- DB 신규 테이블/컬럼/인덱스 금지
- 레거시 schedule touch 0
- timesheet는 조회만
- Digital: 다운로드 URL은 권한 검증 통과 시에만 발급
- Delivery 분기:
  - collaboration: 구매/결제 → Partner 출고요청 → Admin 송장등록/출고 → User 확인
  - partner: 구매/결제 → (자동) 채팅 구매요청 → Partner 송장입력 → (자동) 채팅 발송
- 재고 권한:
  - collaboration 재고: Admin만
  - partner 재고: Partner(본인) 또는 Admin
- 문서/리포트 작성 금지(“프롬프트 실행 결과로 코드 구현”만)
- 충돌/막힘 발생 시:
  1) 어떤 PRD 단계가 막히는지
  2) 어떤 기존 API/데이터가 부족한지
  3) “API/DB 변경 없이” 가능한 해결(프론트 조합/기존 데이터 활용/운영 플로우)
  순으로 즉시 제시하고 구현한다.

[OUTPUT RULES]
- 실제 파일에 반영하고 마지막에만 출력:
  1) 변경 파일 목록
  2) 수동 테스트 방법(앱 플로우 + 필요 시 curl)
  3) 다음 세션 추천

---

## 2) 세션 구성(권장 순서: 프론트 중심)

- Session F0: Store API 인벤토리(읽기) + 프론트 연동 레이어 스캐폴딩(코드로 생성)
- Session F1: Store 홈/상품 목록(필터 포함) + 상품 상세(구매 진입)
- Session F2: 장바구니(파트너 단위) + 체크아웃(배송지/수령자 정보)
- Session F3: 결제(토스/결제 confirm) + 주문 생성/조회 + 상태 표시
- Session F4: Digital E2E(구매 후 다운로드 오픈 + URL 발급/권한 검증 플로우)
- Session F5: Delivery partner E2E(자동 채팅 구매요청 + 송장 입력 + 채팅 발송 + 사용자 확인)
- Session F6: Delivery collaboration E2E(출고요청 UI + Admin 처리 UI + 사용자 확인 + 재고 Admin only UI)
- Session F7: Pickup(on_site) E2E(Store schedules 사용, 레거시 schedule touch 0)
- Session F8: 내 주문/주문상세/구매확정(confirmed) + 리뷰/정산 트리거 UX(가능 범위)
- Session F9: 환불(정책 반영: 디지털 환불 불가, 노쇼 환불 플로우 연결)
- Session F10: Smoke Test + 회귀 테스트 체크리스트 기반 버그 픽스

---

## 3) Session F0: Store API 인벤토리(읽기) + 프론트 연동 레이어 스캐폴딩

[CONTEXT: attach]
- #requirements/requirement.md
- #tasks/store-v1-backlog.md
- @Files: 프론트 앱 라우팅/네비게이션 엔트리(Partners 상세 화면 포함)
- @Files: 프론트 API 클라이언트 구조(axios/fetch wrapper), auth 토큰 처리 코드
- @Files: Store 백엔드 라우터 파일들(읽기용): api-store-products / orders / payments / digital / refunds / collaboration / store-schedules

[PROMPT]
[COMMON RULES]
문서/표/리포트 금지. 바로 코드로 작업하세요.

목표:
- “이미 존재하는 Store API”를 호출할 프론트 연동 레이어를 만들고,
- 화면 개발이 가능한 최소 기반(라우팅/네비/상태관리)을 세팅한다.

구현:
1) 프론트에 store 전용 api 모듈 생성(예: src/api/store/*)
   - products, orders, payments, digital, refunds, collaboration, store-schedules 로 파일 분리
   - 각 함수는 “현재 존재하는 엔드포인트”를 그대로 호출
   - request/response 타입은 서버 응답을 기반으로 최소 타입만 정의(과도한 모델링 금지)
2) Partner 스토어 진입 경로 추가
   - /partners/:partnerId 내에 Store 탭/섹션 추가(라우팅/탭)
3) 공통 UX 유틸
   - 로딩/에러/빈상태 컴포넌트
   - 인증 필요 화면에서 로그인 유도(기존 auth 흐름 사용)

마지막 출력:
- 변경 파일 목록
- 다음 세션(F1) 추천

---

## 4) Session F1: 상품 목록/상세(필터 포함) + 구매 진입

[CONTEXT: attach]
- #requirements/requirement.md
- #tasks/store-v1-backlog.md
- @Files: Partner 상세 페이지(스토어 탭 들어갈 화면)
- @Files: 공통 UI 컴포넌트(리스트/카드/탭/필터)
- @Files: store products API 모듈(방금 만든 것)

[PROMPT]
[COMMON RULES]
문서 금지. 화면을 구현하세요.

목표:
- 파트너 스토어 홈에서 상품 리스트가 뜬다.
- product_type(digital/on_site/delivery), source(partner/collaboration), is_active, 페이지네이션 필터가 동작한다.
- 상품 상세에서 옵션/재고/정책을 표시하고 구매(장바구니/바로구매)로 진입한다.

구현 요구:
1) Store 홈(파트너 기준)
   - 기본 탭: 전체 / 디지털 / 현장수령 / 택배
   - 추가 필터: source(전체/partner/collaboration), 정렬(가능하면)
2) 상품 카드
   - 썸네일, 가격, product_type, source, 품절 상태
3) 상품 상세
   - 이미지/가격/설명/옵션 선택(서버 데이터 구조에 맞춰)
   - 재고 표시
   - “디지털: 결제 후 다운로드 오픈”
   - “현장수령: 결제 후 채팅으로 일정 확정”
   - “택배: 협업/개인 시나리오 안내”
4) 구매 진입
   - 장바구니 담기 또는 바로구매 CTA
   - MVP: 파트너 단위 결제(다른 파트너 상품과 혼합 결제 제한)

마지막 출력:
- 변경 파일 목록
- 수동 테스트(스토어 진입 → 필터 → 상세 → 구매진입)
- 다음 세션(F2) 추천

---

## 5) Session F2: 장바구니(파트너 단위) + 체크아웃(입력 폼)

[CONTEXT: attach]
- #requirements/requirement.md
- #tasks/store-v1-backlog.md
- @Files: 주문 생성 API(store orders)
- @Files: 상품 상세/장바구니 관련 화면(방금 만든 것)
- @Files: 사용자 프로필/배송지/연락처 가져오는 기존 코드(있으면)

[PROMPT]
[COMMON RULES]
문서 금지. 장바구니/체크아웃 화면을 구현하세요.

목표:
- 장바구니에 담긴 항목을 파트너 단위로 결제한다(혼합 방지).
- 체크아웃 입력을 product_type별로 요구한다.
- 주문 생성(POST /api-store-orders)을 기존 스키마로 호출한다.

구현 요구:
1) 장바구니
   - 수량 변경/삭제
   - 총액 계산(프론트 계산은 UI용, 서버 금액이 SoT)
   - 다른 파트너 상품 담기 시 제한 UX
2) 체크아웃 입력
   - delivery: 배송지/연락처/요청사항 필수
   - on_site: 수령자 정보(이름/연락처) 권장
   - digital: 입력 최소화
3) 주문 생성
   - 기존 store orders API 요청 바디 그대로 사용
   - 성공 시 주문 상세/결제 화면으로 이동

마지막 출력:
- 변경 파일 목록
- 수동 테스트(장바구니 → 체크아웃 → 주문생성)
- 다음 세션(F3) 추천

---

## 6) Session F3: 결제 confirm + 주문 상태 표시(내 주문/상세 최소)

[CONTEXT: attach]
- #requirements/requirement.md
- @Files: store payments confirm API
- @Files: 결제 UI/토스 결제 연동(기존 앱 결제 모듈이 있으면 그걸 사용)
- @Files: store orders 조회 API(내 주문 목록/상세)

[PROMPT]
[COMMON RULES]
문서 금지. 결제→confirm→주문상태 반영을 구현하세요.

목표:
- 결제 성공 후 store payments confirm을 호출한다.
- 주문이 paid로 반영되고, 사용자 화면에서 주문 상태가 보인다.
- amount 검증 실패 등 에러 UX를 처리한다(서버 응답 포맷 그대로).

구현 요구:
1) 결제 플로우
   - 결제 성공 콜백 → POST /api-store-payments/confirm 호출
2) 결제 결과 화면
   - 성공: 주문 상세로 이동 + 다음 행동 안내(product_type별)
   - 실패: 재시도/문의 UX
3) 최소 주문 화면
   - 내 주문 목록(최근)
   - 주문 상세(상태, 상품, 배송/수령/다운로드 진입 버튼)

마지막 출력:
- 변경 파일 목록
- 수동 테스트(주문생성 → 결제 → confirm → 주문상태 확인)
- 다음 세션(F4) 추천

---

## 7) Session F4: Digital E2E(구매 후 다운로드 오픈)

[CONTEXT: attach]
- #requirements/requirement.md
- @Files: store digital API(downloads, purchased 등)
- @Files: 주문 상세 화면(다운로드 CTA 들어갈 곳)

[PROMPT]
[COMMON RULES]
문서 금지. 디지털 플로우를 E2E로 완성하세요.

목표:
- 결제 전: 다운로드 CTA 비활성/차단
- 결제 후: 다운로드 목록/파일이 보이고 “다운로드 URL 발급”을 통해 다운로드 가능
- URL 발급은 반드시 서버 권한 검증을 통과해야 함(서버가 SoT)

구현 요구:
1) 구매한 디지털 목록 화면(/api-store-digital/purchased 기반)
2) 주문 상세에서 “다운로드” 진입
3) 다운로드 URL 발급
   - GET /api-store-digital/downloads?download_id= 또는 order_id 기반 엔드포인트를
     “서버 구현 그대로” 호출
4) 에러 UX
   - 권한 없음(미구매) → 차단 메시지
   - 만료/재발급 필요 → 재시도 UX

마지막 출력:
- 변경 파일 목록
- 수동 테스트(미구매 차단 / 구매 후 다운로드 성공)
- 다음 세션(F5) 추천

---

## 8) Session F5: Delivery partner E2E(자동 채팅 구매요청 + 송장 + 채팅 발송)

[CONTEXT: attach]
- #requirements/requirement.md
- @Files: store orders 상세/상태/배송정보 노출 화면
- @Files: 기존 채팅 모듈(채팅방 생성/조회/메시지 전송)
- @Files: 파트너용 주문 관리 화면(있으면) 또는 새로 구현할 파트너 주문 화면

[PROMPT]
[COMMON RULES]
문서 금지. 개인 택배(source=partner) 플로우를 프론트에서 완성하세요.

목표(PRD):
- 결제 완료(paid) 후: 유저↔파트너 채팅에 구매요청 메시지가 자동으로 발송되어야 한다.
- 파트너가 송장/택배사를 입력하면:
  - 주문 상세에 노출
  - 채팅으로 배송정보가 자동 발송된다.

구현 지침(중요: API 추가 금지):
1) “자동 구매요청 메시지”
- 서버가 이미 자동 발송을 한다면: 프론트는 채팅방 진입 CTA/안내만 제공
- 서버가 자동 발송을 안 한다면(현실적으로 흔함):
  - 결제 confirm 성공 직후 프론트에서 기존 채팅 send 로직으로 구매요청 메시지 발송
  - 멱등성: 동일 order_id로 중복 발송되지 않게 기존 메시지 조회/클라 로컬 가드로 방지(신규 DB 금지)

2) “송장 입력/발송”
- 파트너 주문 관리 UI에서 송장/택배사 입력(기존 store API가 제공하는 방식 그대로 사용)
- 입력 성공 후:
  - 주문 상세에 표시
  - 기존 채팅 send 로직으로 배송정보 메시지 발송
  - 멱등성: 이미 같은 송장번호로 발송한 기록을 기존 메시지에서 탐지하거나, UI에서 중복 클릭 방지

마지막 출력:
- 변경 파일 목록
- 수동 테스트(유저 결제 → 채팅 구매요청 확인 → 파트너 송장 입력 → 유저 주문 상세/채팅 확인)
- 다음 세션(F6) 추천

---

## 9) Session F6: Delivery collaboration E2E(출고요청 + Admin 처리 + 재고 Admin only UI)

[CONTEXT: attach]
- #requirements/requirement.md
- @Files: store collaboration API 모듈
- @Files: 파트너 출고요청 화면(없으면 신규 구현)
- @Files: 관리자(Admin) 출고 처리/송장 등록 화면(없으면 신규 구현)
- @Files: 협업 재고 수정 화면(Admin 전용)

[PROMPT]
[COMMON RULES]
문서 금지. 협업 택배(source=collaboration) 플로우를 프론트에서 완성하세요.

목표(PRD):
- 파트너: 출고요청 생성
- 관리자: 출고요청 승인/거절 및 송장 등록/출고 처리
- 사용자: 주문 상세에서 송장/진행 확인
- 협업 재고 수정은 Admin만 가능(프론트에서 확실히 차단)

구현 요구:
1) 파트너 화면
- 주문 상세 또는 파트너 주문관리에서 “출고요청 생성” 액션 제공
- 상태 표시(요청됨/처리중/출고완료 등 서버 상태 그대로 표현)

2) 관리자 화면
- 출고요청 목록/상세
- 승인/거절/송장등록 액션(서버 API 그대로 호출)

3) 사용자 화면
- 주문 상세에서 협업 배송 진행과 송장 확인

4) 재고 Admin only
- 협업 상품 화면에서 재고 수정 UI는 Admin만 노출/활성

마지막 출력:
- 변경 파일 목록
- 운영 테스트(Partner 요청 → Admin 처리 → User 확인)
- 다음 세션(F7) 추천

---

## 10) Session F7: Pickup(on_site) E2E(Store schedules 사용, 레거시 schedule touch 0)

[CONTEXT: attach]
- #requirements/requirement.md
- @Files: api-store-schedules 프론트 연동 모듈(있으면) 또는 F0에서 만든 store-schedules API 모듈
- @Files: 채팅 모듈
- @Files: timesheet 조회(읽기 전용) 코드

[PROMPT]
[COMMON RULES]
문서 금지. 현장수령(on_site)을 “채팅 기반 확정형”으로 프론트에서 완성하세요.
레거시 schedule 시스템은 절대 사용/수정하지 마세요.

목표(PRD):
- 결제 후: 유저가 파트너와 즉시 채팅으로 조율 가능
- 스케줄 SoT는 api-store-schedules(+store 전용 테이블)만 사용
- 파트너가 reserved 확정(시간/장소 입력)
- 수령 완료(completed/pickup)는 정책상 timesheet=IN이 필요한 경우에만 허용(조회만)

구현 요구:
1) 결제 성공 후 UX
- “파트너와 채팅하기” CTA 제공(채팅방 생성/재사용)
- “현장수령 진행상태” 섹션에서 store-schedule 상태를 표시(있다면)

2) 파트너 확정 UI
- 파트너가 start_at/location_id를 채우고 reserved로 확정하는 UI(api-store-schedules 기존 엔드포인트 그대로)

3) 수령 완료 처리
- 파트너가 pickup/completed 처리 시 timesheet=IN 조건이 필요하면,
  timesheet 조회(Read-only) 후 조건 충족 시에만 버튼 활성

4) no_show
- 유저가 조건 충족 시 no_show 액션 가능(서버 API 그대로)
- 조건(예: start_at + grace)은 PRD 기준으로 UI에서 안내(최종 판정은 서버)

마지막 출력:
- 변경 파일 목록
- 테스트(결제 → 채팅 → reserved → pickup/completed → no_show)
- 다음 세션(F8) 추천

---

## 11) Session F8: 내 주문/구매확정(confirmed) UX 완성

[CONTEXT: attach]
- #requirements/requirement.md
- @Files: store orders API
- @Files: 주문 목록/상세 화면

[PROMPT]
[COMMON RULES]
문서 금지. 사용자 “내 주문” 경험을 완성하세요.

목표:
- 주문 목록/상세에서 상태가 명확히 보인다.
- 배송(delivery)은 delivered 이후 구매확정(confirmed) CTA 제공(서버 정책 그대로)
- 확정 후 UX(정산/리뷰/완료 안내)는 가능한 범위에서 제공

구현:
- 내 주문 목록 필터(진행중/완료/취소 등)
- 주문 상세에 액션 버튼:
  - delivery: 구매확정(confirmed), 취소(가능 시)
  - on_site: 진행상태/채팅 진입
  - digital: 다운로드 진입
- 에러/권한 UX 처리

마지막 출력:
- 변경 파일 목록
- 수동 테스트
- 다음 세션(F9) 추천

---

## 12) Session F9: 환불 UX(디지털 환불 불가, 노쇼 환불 연결)

[CONTEXT: attach]
- #requirements/requirement.md
- @Files: store refunds API
- @Files: 주문 상세/환불 화면(없으면 신규 구현)

[PROMPT]
[COMMON RULES]
문서 금지. PRD 환불 정책을 프론트에서 완성하세요(서버 정책이 SoT).

목표(PRD):
- 디지털 환불 불가: UI에서 환불 진입 차단 + 안내
- 택배 환불/취소: 가능 범위에서 기존 store refunds 플로우 연결
- 현장수령 no_show 환불: 서버가 제공하는 범위에서 연결 및 안내

구현:
- 환불 요청 화면/모달(서버 스키마 그대로)
- 환불 상태 표시(목록/상세)
- 디지털 상품 환불 CTA 숨김/비활성 + 사유 안내

마지막 출력:
- 변경 파일 목록
- 수동 테스트(digital 차단 / 일반 환불 요청)
- 다음 세션(F10) 추천

---

## 13) Session F10: Smoke Test + 회귀 테스트 기반 버그 픽스

[CONTEXT: attach]
- #requirements/requirement.md
- #tasks/store-v1-backlog.md
- @Files: 이번 작업에서 변경된 화면/스토어 API 모듈만

[PROMPT]
[COMMON RULES]
문서 금지. QA 체크리스트를 “짧게” 만든 뒤, 깨지는 부분을 즉시 수정하세요.

필수 체크:
- Products: 목록/필터/상세/옵션/재고 표시
- Orders/Payments: 주문 생성 → 결제 confirm → paid 반영
- Digital: 결제 전 다운로드 차단 / 결제 후 다운로드 가능 / URL 발급 권한 통과
- Delivery partner: 결제 후 채팅 구매요청 / 송장 입력 / 채팅 발송 / 사용자 확인
- Delivery collaboration: 출고요청 / Admin 처리 / 사용자 확인 / 재고 Admin only
- Pickup(on_site): 결제 후 채팅 진입 / reserved / pickup(completed) / no_show

마지막 출력:
- 변경 파일 목록
- 회귀 테스트 체크리스트(짧게)
- 남은 TODO(정말 불가한 것만)
