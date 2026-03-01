# 파트너 티어 — 지표 정의서

## 개요

5축 지표(Revenue, Activity, Quality, Volume, Content)로 파트너 티어를 산정한다.
모든 지표는 0~100 으로 정규화하며, TotalScore = 0.40×Revenue + 0.20×Activity + 0.10×Quality + 0.15×Volume + 0.15×Content 으로 산출한다.

---

## 1. Revenue (순매출)

| 항목 | 수식 / 집계 | 기간 | 소스 테이블 |
|------|-----------|------|------------|
| Gross | 스토어 확정 주문 금액 + 멤버십 30일 구간 발생분 + 단건(퀘스트·포스트언락·후원) 금액 합계 | 30일 | `store_orders`(status=confirmed/delivered), `membership_subscriptions`×`memberships`, `partner_requests`(completed), `post_unlocks`, `stream_donations`(completed/success), `member_points_logs`(donation) |
| Refund | 완료된 환불 금액 합계 | 30일 | `store_refunds`(status=completed) |
| Chargeback | 차지백 금액 합계 (2차) | 30일 | `store_chargebacks` (신규) |
| Platform Promo | 플랫폼 부담 프로모션 차감액 (2차) | 30일 | order-level `platform_promo_amount` (신규) |
| **Net** | Gross − Refund − Chargeback − Platform Promo | 30일 | — |
| **RevenueScore** | min(100, Net / RevenueCap × 100). RevenueCap = 5,000,000원 (운영 조정 가능) | — | — |

### 필터
- partner_id 기준, 30일 롤링(평가일 기준)
- 확정된 주문만 (취소/미확정 제외)
- 환불은 완료 건만

---

## 2. Activity (운영 활동)

| 항목 | 가중치 | 집계 | 기간 |
|------|--------|------|------|
| 상품 업로드 | 건수 × 2 | `store_products`(partner_id, created_at) | 30일 |
| 세션 완료 | 건수 × 5 | `partner_requests`(status=completed, completed_at) | 30일 |
| 채팅 응대 | 일 1점 (일별 캡 1) | 채팅 메시지에서 partner 쪽 응답이 있는 일수 | 30일 |
| 포스트 업로드 | 건수 × 1 | `posts`(partner_id, created_at) | 30일 |
| **Raw Activity** | 위 가중 합산 | — | — |

### 캡 & 정규화
- 일별 캡: 30점 / 주별 캡: 150점
- ActivityScore = min(100, CappedActivity / 400 × 100)

### 필터
- 파트너 본인 데이터만, 삭제/비공개 제외

---

## 3. Quality / Risk

| 항목 | 수식 | 집계 | 기간 |
|------|------|------|------|
| 환불률(금액) | RefundRate = RefundAmount / GrossAmount | `store_refunds` / Gross | 30일 |
| 유효 신고/분쟁 | resolved & outcome=valid인 신고 건수 | `post_reports` (파트너 연결) | 30일 |
| 응답 SLA (선택) | 24h 내 첫 응답 비율 | 채팅 응답시간 로그 | 30일 |
| 정책위반 | 중대/경미 구분 | `partner_policy_violations` (신규) | 90일 |

### QualityScore
```
QualityScore = max(0, 100 − RefundRate×50 − ValidReports×10 − MajorViolations×30)
```

---

## 4. Volume (판매량)

포함 범위: 스토어 + 멤버십 + 단건구매.

| 항목 | 정의 | 소스 |
|------|------|------|
| paid_orders_count_30d | 유효거래 건수 (refund/cancel/chargeback 제외) = 스토어 유효 주문 수 + 멤버십 유효 구독 수 + 단건(퀘스트+포스트언락+후원) 건수 | `store_orders`, `membership_subscriptions`, `partner_requests`, `post_unlocks`, `stream_donations` |
| fulfilled_orders_count_30d | 이행완료 건수 (배송/수령/세션/디지털전달) | `store_order_fulfillments` 등 |
| unique_buyers_30d | 유효거래 전체에서 구매자 유니크 수 | 위 테이블들의 user_id/client_id/donor_id distinct |

### VolumeScore
```
score = 100 × log(1 + adjusted_count) / log(1 + cap)
```
- cap = 상위 95%ile (운영 데이터 기반)
- 동일 구매자 반복 감쇠: 1인당 최대 5건/30일

---

## 5. Content (콘텐츠)

| 항목 | 정의 | 소스 |
|------|------|------|
| active_products_30d | 판매가능 상태(공개/재고>0)로 유지된 활성 상품 수 | `store_products`(is_active, status, stock) |
| new_listings_30d | 신규 등록 콘텐츠 중 공개 상태 24h 이상 유지한 건수 | `store_products`, `posts` |
| content_quality_factor (선택) | 이미지≥N, 설명≥M글자, 필수값 충족 시 1.0, 미달 시 0.6~1.0 | — |

### ContentScore
```
ContentScore = quality_factor × (w1×score(active_products) + w2×score(new_listings) + w3×score(views))
```
- 각 score는 로그스케일+캡, 일/주 업로드 캡 적용
- w1=0.4, w2=0.4, w3=0.2 (권장, 운영 조정 가능)

---

## TotalScore

```
TotalScore = 0.40×RevenueScore + 0.20×ActivityScore + 0.10×QualityScore + 0.15×VolumeScore + 0.15×ContentScore
```

범위: 0~100
