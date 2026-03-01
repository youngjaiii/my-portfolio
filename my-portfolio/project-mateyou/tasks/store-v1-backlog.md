# /tasks/store-v1-backlog.md
# MateYou Partner Store v1 Backlog (PRD v1.0 기반)

## 0) SoT/결정사항 고정(개발 전제)
- Pickup(on_site)은 슬롯/달력/홀드 예약형이 아니라 “채팅 기반 확정형”이다.
- on_site 주문 시점에는 start_at/location_id는 null 가능하며, 파트너가 채팅 조율 후 reserved로 확정한다.
- timesheet 로직은 “참조만” 하며 기존 timesheet 코드는 수정하지 않는다.
- Digital(digital)은 “상품 선택 → 결제 → 오픈(다운로드)”이며, 결제 성공 시 시스템이 권한을 부여(grant-access)한다.
- Delivery(delivery)은 source별로 플로우가 다르다.
  - collaboration: 파트너 출고요청 → 관리자가 출고/송장 등록 → 사용자 확인
  - partner: 결제 후 채팅 구매요청 자동 → 파트너가 송장/택배사 입력 → 채팅으로 택배정보 발송
- 재고 권한:
  - 협업 상품(source=collaboration): Admin만 재고 수정 가능
  - 개인 상품(source=partner): Partner(및 Admin)가 재고 수정 가능
- 주문 상태: pending / paid / shipped / delivered / confirmed / cancelled
- 현장수령 스케줄 상태: pending / reserved / completed / no_show / canceled(필요 시)
- 환불 정책 고정:
  - digital: 환불 불가
  - on_site: no_show 조건 충족 시 자동 환불
  - delivery: 발송 전 환불 가능 / 발송 후 반품배송비 결제 후 환불(운영 플로우)

---

## 1) 마일스톤(권장 구현 순서)
- M0: 백엔드 스키마/권한/상태전이 기반 구축
- M1: 상품(등록/조회) + 주문 생성 + 결제 승인 + 주문조회
- M2: 디지털 다운로드(권한부여/다운로드URL) 완성
- M3: 개인 택배(채팅 구매요청/송장등록/채팅 발송) 완성
- M4: 협업 택배(출고요청/관리자 승인·출고·송장) 완성
- M5: 현장수령(스케줄 SoT/채팅 확정/reserved/completed/no_show 환불) 완성
- M6: 환불/정산(confirmed 기반) + 알림 + 운영자 화면 최소

---

## 2) Epic / Story / Task

### EPIC A. 데이터 모델/권한/상태전이(기반)
#### Story A1. 핵심 테이블/관계 정의
- [ ] Task A1-1: product_type(digital/on_site/delivery), source(partner/collaboration) 표준 ENUM/상수 정의 (Backend/DB)
  - API/테이블: products
  - AC: 모든 상품/주문 로직에서 product_type/source가 단일 기준으로 동작
- [ ] Task A1-2: 주문/아이템/배송(송장)/현장수령 스케줄/디지털 다운로드/환불/정산 테이블 초안 확정 (DB)
  - 테이블(최소): store, products, product_variants(or options), orders, order_items, shipments, schedules, digital_assets, digital_downloads(or entitlements), refunds, transactions, collaboration_shipment_requests
  - AC: PRD 플로우를 테이블만으로 표현 가능(특히 on_site의 null start_at/location_id 허용)

#### Story A2. 권한(RBAC/RLS) 및 데이터 접근 제약
- [ ] Task A2-1: Partner는 본인 partner_id 범위의 상품/주문/스케줄만 접근 가능하게 서버 권한 체크 구현 (Backend)
  - API: /api-store-products/partner/my, /api-store-orders/partner/orders, /api-store-schedules/partner/my
  - AC: 타 파트너 리소스 접근 시 403
- [ ] Task A2-2: 협업 상품 재고 수정은 Admin 전용으로 강제 (Backend)
  - API: PUT /api-store-collaboration/products/stock?product_id=
  - AC: Partner 호출 시 403, Admin만 성공
- [ ] Task A2-3: 개인 상품 재고 수정은 Partner(본인) 또는 Admin만 가능 (Backend)
  - API: PUT /api-store-products/update?product_id=
  - AC: 다른 Partner 호출 시 403

#### Story A3. 주문/스케줄 상태전이 검증 로직
- [ ] Task A3-1: order.status 전이 규칙 구현(허용/금지 케이스 표 포함) (Backend)
  - API: PUT /api-store-orders/:id/status, PUT /api-store-orders/:id/confirm, PUT /api-store-orders/:id/cancel
  - AC: 불가능 전이는 409(또는 400) 반환
- [ ] Task A3-2: schedule.status 전이 규칙 구현(pending→reserved→completed / reserved→no_show 등) (Backend)
  - API: PUT /api-store-schedules/order/:order_id/confirm, PUT /api-store-schedules/order/:order_id/status, PUT /api-store-schedules/:id/pickup
  - AC: 권한/조건 위반 시 거절(특히 completed는 timesheet IN 조건)

---

### EPIC B. 스토어/상품(조회·관리)
#### Story B1. Public 상품 리스트/상세
- [ ] Task B1-1: GET /api-store-products 구현(필터/페이지네이션) (Backend)
  - Params: partner_id, product_type, source, is_active, page, limit
  - AC: 조건 조합별 결과가 정확히 필터링
- [ ] Task B1-2: GET /api-store-products/detail?product_id= 구현 (Backend)
  - AC: 옵션/재고/상품 타입/소스 정보 포함 응답

#### Story B2. Partner/Admin 상품 등록/수정/삭제(soft delete)
- [ ] Task B2-1: POST /api-store-products (form-data) 구현 (Backend)
  - AC: product_type/source에 따라 필수 필드 검증(디지털은 asset 연동, on_site는 스케줄 row 생성은 주문 단계에서)
- [ ] Task B2-2: PUT /api-store-products/update?product_id= (form-data) 구현 (Backend)
  - AC: 개인상품 재고 수정 가능, 협업상품은 재고 필드 변경 시 거절(409/403)
- [ ] Task B2-3: DELETE /api-store-products/delete?product_id= soft delete 구현 (Backend)
  - AC: is_active=false 처리, Public 조회에서 기본적으로 제외
- [ ] Task B2-4: GET /api-store-products/partner/my 구현 (Backend)
  - AC: Partner 본인 상품만 반환

---

### EPIC C. 주문 생성/결제 승인(토스) + 주문 조회
#### Story C1. 주문 생성(장바구니/단건)
- [ ] Task C1-1: POST /api-store-orders 구현(주문/아이템 생성) (Backend)
  - AC: 금액 계산(옵션/수량) 일치, product_type/source 저장
- [ ] Task C1-2: 주문 생성 시 product_type별 후속 작업 트리거 정의 (Backend)
  - digital: 결제 성공 후 grant-access
  - delivery(partner): 결제 성공 후 채팅 구매요청
  - delivery(collaboration): 결제 성공 후 파트너가 출고요청 생성 가능
  - on_site: 결제 성공 후 schedule row 생성 + 채팅방 생성/재사용
  - AC: 결제 성공 직후 각 분기 트리거가 정확히 실행됨

#### Story C2. 결제 승인(토스페이먼츠)
- [ ] Task C2-1: POST /api-store-payments/confirm 구현 (Backend)
  - Body: order_id, payment_key, amount
  - AC: 결제 승인 성공 시 order.status=paid, 실패 시 원복/에러 처리
- [ ] Task C2-2: 결제금액 검증(주문 금액 vs amount) (Backend)
  - AC: 불일치 시 거절(400/409)

#### Story C3. 주문 조회/상세
- [ ] Task C3-1: GET /api-store-orders 구현(User) (Backend)
  - AC: 본인 주문만
- [ ] Task C3-2: GET /api-store-orders/:id 구현(User/Admin) (Backend)
  - AC: 주문 아이템/배송/스케줄/디지털 다운로드 연결 정보 포함
- [ ] Task C3-3: GET /api-store-orders/partner/orders 구현(Partner) (Backend)
  - AC: 파트너 판매 주문만

---

### EPIC D. 디지털 상품(다운로드 오픈)
#### Story D1. 디지털 자산 등록/조회
- [ ] Task D1-1: GET /api-store-digital/assets?product_id= 구현(Partner/Admin) (Backend)
  - AC: 상품에 연결된 디지털 파일 목록 반환

#### Story D2. 결제 후 권한 부여(System) + 다운로드 URL
- [ ] Task D2-1: POST /api-store-digital/grant-access 구현(System) (Backend)
  - 트리거: 결제 승인 성공 시 호출
  - AC: user_id+order_id 기준 다운로드 권한 row 생성
- [ ] Task D2-2: GET /api-store-digital/downloads 구현(User) (Backend)
  - AC: 본인 권한 기반 다운로드 목록 반환
- [ ] Task D2-3: GET /api-store-digital/downloads?order_id= 구현(User) (Backend)
  - AC: 해당 주문에 대한 다운로드 파일만 반환
- [ ] Task D2-4: GET /api-store-digital/downloads?download_id= 구현(User) (Backend)
  - AC: 권한 검증 후 다운로드 URL 생성, 권한 없으면 403
- [ ] Task D2-5: GET /api-store-digital/purchased 구현(User) (Backend)
  - AC: 구매한 디지털 상품 리스트 반환

---

### EPIC E. 택배-개인 상품(source=partner) 플로우
#### Story E1. 결제 후 채팅 구매요청 자동 발송
- [ ] Task E1-1: delivery+source=partner 주문 paid 시 채팅방 생성/재사용 로직 구현 (Backend)
  - AC: 기존 채팅방 있으면 재사용, 없으면 생성
- [ ] Task E1-2: 채팅에 “구매요청/주문요약” 시스템 메시지 발송 (Backend)
  - AC: 주문번호/상품/수량/배송지 요약 포함

#### Story E2. 파트너 송장/택배사 입력 + 채팅 배송정보 발송
- [ ] Task E2-1: PUT /api-store-orders/:id/status 를 통해 shipped 전이 + shipment 정보 저장(택배사/송장) (Partner/Admin) (Backend)
  - AC: 개인 상품만 파트너가 입력 가능(협업 상품이면 거절)
- [ ] Task E2-2: 송장 입력 성공 시 채팅으로 택배정보 자동 발송 (Backend)
  - AC: 택배사/송장번호 포함 메시지 전송

---

### EPIC F. 택배-협업 상품(source=collaboration) 플로우
#### Story F1. 파트너 출고 요청
- [ ] Task F1-1: POST /api-store-collaboration/shipment-requests 구현(Partner) (Backend)
  - AC: paid 상태 주문만 출고요청 가능
- [ ] Task F1-2: GET /api-store-collaboration/shipment-requests 구현(Partner/Admin) (Backend)
  - AC: 파트너는 본인 요청만, Admin은 전체/필터 가능

#### Story F2. 관리자 승인/출고/송장 등록
- [ ] Task F2-1: PUT /api-store-collaboration/shipment-requests/respond?request_id= 구현(Admin) (Backend)
  - AC: 승인/거절 상태 관리
- [ ] Task F2-2: 승인 후 관리자 송장 등록/주문 상태 shipped 반영 (Backend)
  - AC: shipment 저장 + 주문 상태 전이 + 사용자 조회에서 확인 가능
- [ ] Task F2-3: 협업 상품 재고 수정 API 구현/연동(Admin) (Backend)
  - API: PUT /api-store-collaboration/products/stock?product_id=
  - AC: 주문 흐름에서 재고 차감/복구 정책 동작

#### Story F3. 협업 상품 조회/통계(최소)
- [ ] Task F3-1: GET /api-store-collaboration/products (Public) 구현 (Backend)
- [ ] Task F3-2: GET /api-store-collaboration/products/detail?product_id= (Public) 구현 (Backend)
- [ ] Task F3-3: GET /api-store-collaboration/stats (Admin) 구현 (Backend)
- [ ] Task F3-4: GET /api-store-collaboration/partner/pending-orders (Partner) 구현 (Backend)

---

### EPIC G. 현장수령(on_site) 스케줄 SoT + 채팅 확정
#### Story G1. 주문 시 스케줄 row 생성(시간/장소 null 가능)
- [ ] Task G1-1: on_site 주문 paid 시 schedule row 자동 생성(필수) (Backend)
  - AC: order_id 기준 1개 생성, start_at/location_id null 허용
- [ ] Task G1-2: GET /api-store-schedules/chat/:chat_room_id 구현(채팅방 기준 목록) (Backend)
  - AC: chat_room_id 기준 현장수령 주문/스케줄 목록 조회

#### Story G2. 파트너 확정(reserved) 및 수정 권한
- [ ] Task G2-1: PUT /api-store-schedules/order/:order_id/confirm 구현(Partner) (Backend)
  - 기능: start_at/end_at/location_id 입력 + status=reserved
  - AC: 파트너만 가능, 입력값 검증(미래시간 등 정책)
- [ ] Task G2-2: 스케줄 확정/변경 시 채팅 알림 메시지 자동 발송 (Backend)
  - AC: 유저/파트너 모두 확인 가능 메시지

#### Story G3. 수령 완료(completed) + timesheet 연계(근무형 파트너만)
- [ ] Task G3-1: PUT /api-store-schedules/:id/pickup 구현(Partner) (Backend)
  - 기능: status=completed 전이
  - AC: 근무형 파트너는 timesheet=IN일 때만 성공, 비근무형은 제한 없음

#### Story G4. no_show 조건 + 자동 환불
- [ ] Task G4-1: PUT /api-store-schedules/order/:order_id/status 구현(User) (Backend)
  - 허용: no_show (조건 충족 시)
  - AC: now >= start_at + GRACE_MINUTES(기본 30)일 때만 가능
- [ ] Task G4-2: no_show 처리 시 자동 환불 트리거 구현 (Backend)
  - AC: 환불 row 생성 + 결제취소/환불 처리(정책에 따라) + 상태 no_show 유지

---

### EPIC H. 환불(api-store-refunds)
#### Story H1. 환불 요청/조회/응답
- [ ] Task H1-1: POST /api-store-refunds 구현(User) (Backend)
  - AC: digital은 환불 요청 자체 거절(400/403)
- [ ] Task H1-2: GET /api-store-refunds 구현(User/Partner/Admin) (Backend)
  - AC: 권한 범위 내 목록
- [ ] Task H1-3: GET /api-store-refunds/detail?refund_id= 구현(User/Partner/Admin) (Backend)
- [ ] Task H1-4: PUT /api-store-refunds/respond?refund_id= 구현(Partner/Admin) (Backend)
  - AC: 승인/거절 상태 전이 및 주문/정산 반영

---

### EPIC I. 정산/거래(api-store-transactions) (MVP 최소)
#### Story I1. confirmed 기반 정산 확정
- [ ] Task I1-1: 주문 confirmed 시 거래/정산 row 생성 및 상태 확정 로직 구현 (Backend/DB)
  - AC: delivery는 confirmed가 정산 트리거로 동작
- [ ] Task I1-2: 파트너 정산 조회/요약 API 구현(있다면) (Backend)
  - AC: 파트너는 본인 데이터만
- [ ] Task I1-3: 환불 시 정산 롤백/차감 정책 적용 (Backend)
  - AC: 환불 승인 시 거래 내역이 일관되게 수정

---

### EPIC J. 알림/메시징(최소)
#### Story J1. 채팅 자동 메시지(개인 택배, 현장수령)
- [ ] Task J1-1: 개인 택배 paid 시 구매요청 메시지 자동 발송 (Backend)
- [ ] Task J1-2: 현장수령 paid 시 안내 메시지 자동 발송(기본 장소/기본 시간은 초기값 가능) (Backend)
- [ ] Task J1-3: 송장 등록 시 채팅 배송정보 자동 발송 (Backend)

#### Story J2. 스케줄 알림(현장수령)
- [ ] Task J2-1: start_at 30분 전 알림 발송(유저/파트너) 스케줄러 구현 (Backend)
  - AC: reserved 상태일 때만 발송, 취소/변경 반영

---

### EPIC K. 운영자 화면(최소 UI/관리)
#### Story K1. Partner 최소 기능
- [ ] Task K1-1: 파트너 상품 목록/등록/수정/삭제 UI (Front)
- [ ] Task K1-2: 파트너 주문 목록/상세 UI + 개인 택배 송장 입력 UI (Front)
- [ ] Task K1-3: 파트너 현장수령 스케줄 목록 + 확정(reserved) UI + 수령완료 버튼 UI (Front)

#### Story K2. Admin 최소 기능(협업)
- [ ] Task K2-1: 관리자 협업 출고요청 목록/상세 + 승인/거절 UI (Front)
- [ ] Task K2-2: 관리자 송장 등록 UI + 협업 재고 수정 UI (Front)

---

### EPIC L. QA/테스트/운영 점검
#### Story L1. 핵심 플로우 E2E 체크리스트
- [ ] Task L1-1: 디지털(결제→grant-access→다운로드URL→다운로드) 시나리오 테스트 작성
  - AC: 권한 없으면 다운로드 불가(403)
- [ ] Task L1-2: 개인 택배(채팅 구매요청→송장입력→채팅 발송→confirmed) 시나리오 테스트 작성
- [ ] Task L1-3: 협업 택배(출고요청→Admin 승인/송장→사용자 확인) 시나리오 테스트 작성
- [ ] Task L1-4: 현장수령(스케줄 생성 null→파트너 reserved 확정→completed(timesheet 조건)→no_show 환불) 시나리오 테스트 작성
- [ ] Task L1-5: 권한/테넌시(타 파트너 접근 차단) 테스트 작성

---

## 3) 정의/산출물(각 Task 완료 기준 공통)
- AC(수용 기준) 충족
- API는 명세된 엔드포인트/권한/파라미터/상태값을 준수
- 상태전이 실패 케이스는 명확한 에러코드/메시지로 반환
- 로그(주문ID/파트너ID/사용자ID)로 추적 가능

## 4) 리스크/주의(구현 시 강제 확인)
- PRD 결정사항과 상충되는 구현(예: on_site 슬롯예약/홀드)은 금지
- 협업 재고를 파트너가 수정 가능하게 열어두면 운영 붕괴(반드시 Admin 전용)
- 디지털 다운로드 URL은 권한 검증 없이 발급 금지
- on_site no_show는 “아무 때나” 불가(조건 충족 필수)
