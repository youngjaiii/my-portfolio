# 파트너 티어 — 수수료표

## 기본안 (결제 시 즉시 적용)

기본 수수료(take rate) 25%에서 티어별 %p 할인. 최저 수수료 하한 20%.

| 티어 | 수수료(take rate) | %p 할인 | 파트너 배분 |
|------|-------------------|--------|------------|
| Bronze | 25.0% | 0 | 75.0% |
| Silver | 24.0% | −1.0%p | 76.0% |
| Gold | 23.0% | −2.0%p | 77.0% |
| Platinum | 21.5% | −3.5%p | 78.5% |
| Diamond | 20.0% | −5.0%p | 80.0% |

### 적용 시점
- 구매확정(또는 결제 완료) 시점의 `partner_tier_current.tier_code`로 수수료 결정.
- 주문/정산 레코드에 `applied_take_rate` 저장하여 사후 추적 가능하게 한다.

### 동결 시
- 수수료는 Bronze(25%) 적용.

---

## 리베이트안 (대안 — 월말 환급)

모든 거래를 기본 25% take rate로 정산하고, 월말에 티어별 차액을 리베이트(환급)로 지급.

| 티어 | 기본 take rate | 월말 리베이트 | 실효 take rate |
|------|---------------|-------------|---------------|
| Bronze | 25% | 0%p | 25.0% |
| Silver | 25% | 1.0%p 환급 | 24.0% |
| Gold | 25% | 2.0%p 환급 | 23.0% |
| Platinum | 25% | 3.5%p 환급 | 21.5% |
| Diamond | 25% | 5.0%p 환급 | 20.0% |

### 리베이트 계산
```
rebate_amount = 월간 Net × (기본 take rate − 티어 take rate) / 100
```
예: Diamond, 월 Net 300만 원 → 300만 × 5% = 15만 원 리베이트.

### 리베이트 지급
- 다음 달 첫째 주 정산 시 `partner_tier_rebates` 테이블에 기록.
- 지급 방식: 파트너 포인트 적립 또는 출금 정산에 합산.

---

## fee_policy 테이블 구조

```sql
tier_code       TEXT PRIMARY KEY,  -- bronze/silver/gold/platinum/diamond
take_rate_pct   NUMERIC(4,1),      -- 25.0 ~ 20.0
partner_share_pct NUMERIC(4,1),    -- 75.0 ~ 80.0
effective_from  TIMESTAMPTZ,
effective_to    TIMESTAMPTZ        -- NULL = 현재 유효
```
