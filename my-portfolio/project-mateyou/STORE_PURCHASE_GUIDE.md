# 상품 구매 스토어 기능 사용 가이드

## 구현된 기능 ✅

**파트너별 독립 스토어에서 디지털/현장수령/택배 상품 구매 가능!**

### 1. 상품 타입별 구매 플로우

#### 디지털 상품 (digital)
- 상품 선택 → 결제 → 다운로드 오픈
- 결제 성공 직후 자동으로 다운로드 권한 부여
- 환불 불가 정책

#### 현장수령 상품 (on_site)
- 상품 선택 → 결제 → 채팅으로 수령 일정 확정
- 채팅 기반 확정형 (슬롯 예약형 아님)
- 파트너가 최종 확정 권한 보유
- no_show 시 자동 환불

#### 택배 상품 (delivery)
- 협업 제품 (source=collaboration): 관리자 출고 처리
- 개인 제품 (source=partner): 파트너 직접 송장 입력 및 채팅 안내

### 2. 장바구니 시스템 (`useCartStore`)

파트너 단위로 장바구니 관리 (동일 파트너 상품만 결제 가능)

**사용 방법:**

```tsx
import { useCartStore } from '@/store/useCartStore'

const { addItem, removeItem, updateQuantity, clearCart, items } = useCartStore()

// 상품 추가
addItem(product, quantity)

// 상품 제거
removeItem(productId)

// 수량 변경
updateQuantity(productId, newQuantity)

// 장바구니 비우기
clearCart()
```

**기능:**
- 파트너 단위 제한 (다른 파트너 상품 추가 불가)
- 로컬 스토리지 자동 저장
- 수량 관리 (디지털 상품은 수량 1 고정)

### 3. 체크아웃 프로세스

**택배 상품 (delivery):**
- 배송지/연락처/요청사항 필수 입력
- 배송비 자동 계산
- 원격지 추가 배송비 적용

**현장수령 상품 (on_site):**
- 수령자 정보(이름/연락처) 권장 입력
- 채팅으로 수령 일정 조율

**디지털 상품 (digital):**
- 별도 입력 최소화
- 결제 후 즉시 다운로드 오픈

### 4. 주문 생성 및 결제

**주문 생성:**

```tsx
import { storeOrdersApi } from '@/api/store/orders'

const response = await storeOrdersApi.createOrder({
  product_id: 'product-uuid',
  quantity: 1,
  // 택배 상품인 경우
  recipient_name: '수령자 이름',
  recipient_phone: '010-1234-5678',
  recipient_address: '주소',
  recipient_address_detail: '상세주소',
  recipient_postal_code: '12345',
  delivery_memo: '배송 메모',
  // 현장수령인 경우
  pickup_name: '수령자 이름',
  pickup_phone: '010-1234-5678',
})
```

**결제 프로세스:**
1. 주문 생성 (POST /api-store-orders)
2. 포인트 차감
3. Toss Payments 결제 승인 (POST /api-store-payments/confirm)
4. 주문 상태 업데이트 (paid)
5. 상품 타입별 후속 처리:
   - 디지털: 다운로드 권한 부여
   - 택배: 배송 정보 생성
   - 현장수령: 스케줄 생성

### 5. 디지털 상품 다운로드

**권한 부여 (결제 성공 시 자동):**

```tsx
import { storeDigitalApi } from '@/api/store/digital'

// 결제 성공 후 자동 실행
await storeDigitalApi.grantAccess({
  order_id: 'order-uuid',
  user_id: 'user-uuid'
})
```

**다운로드 URL 생성:**

```tsx
// 다운로드 목록 조회
const downloads = await storeDigitalApi.getDownloads({ order_id: 'order-uuid' })

// 다운로드 URL 생성
const downloadUrl = await storeDigitalApi.getDownloadUrl(downloadId)
```

**구매 목록 조회:**

```tsx
const purchased = await storeDigitalApi.getPurchased()
```

### 6. 택배 상품 배송 처리

#### 협업 제품 (source=collaboration)

**파트너: 출고 요청 생성**

```tsx
import { storeCollaborationApi } from '@/api/store/collaboration'

await storeCollaborationApi.createShipmentRequest({
  order_id: 'order-uuid',
  items: [{ order_item_id: 'item-uuid', quantity: 1 }],
  notes: '출고 요청 메모'
})
```

**관리자: 출고 요청 승인/거절**

```tsx
await storeCollaborationApi.respondShipmentRequest({
  request_id: 'request-uuid',
  action: 'approve', // 또는 'reject'
  tracking_number: '송장번호',
  carrier: '택배사',
  notes: '관리자 메모'
})
```

#### 개인 제품 (source=partner)

**자동 처리:**
- 결제 성공 시 유저↔파트너 채팅방 생성/재사용
- 구매 요청 메시지 자동 발송

**파트너: 송장 입력**

```tsx
import { storeOrdersApi } from '@/api/store/orders'

await storeOrdersApi.updateOrderStatus({
  order_id: 'order-uuid',
  status: 'shipped',
  tracking_number: '송장번호',
  carrier: '택배사'
})
```

**사용자: 구매확정**

```tsx
await storeOrdersApi.confirmOrder({
  order_id: 'order-uuid'
})
```

### 7. 현장수령 스케줄 관리

**스케줄 생성 (결제 성공 시 자동):**

```tsx
import { storeSchedulesApi } from '@/api/store/schedules'

// 주문 완료 후 스케줄 생성 (시간/장소 null 가능)
const schedule = await storeSchedulesApi.createSchedule({
  order_id: 'order-uuid',
  product_id: 'product-uuid',
  status: 'pending'
})
```

**파트너: 스케줄 확정 (reserved)**

```tsx
await storeSchedulesApi.confirmSchedule({
  order_id: 'order-uuid',
  start_at: '2024-01-01T10:00:00Z',
  location_id: 'location-uuid'
})
```

**파트너: 수령 완료 (completed)**

```tsx
// 근무형 파트너는 timesheet=IN 상태일 때만 가능
await storeSchedulesApi.completePickup({
  schedule_id: 'schedule-uuid'
})
```

**사용자: no_show 신고**

```tsx
await storeSchedulesApi.updateScheduleStatus({
  order_id: 'order-uuid',
  status: 'no_show'
})
// 조건 충족 시 자동 환불
```

### 8. 주문 조회 및 관리

**내 주문 목록:**

```tsx
const orders = await storeOrdersApi.getMyOrders({
  page: 1,
  limit: 20,
  status: 'paid' // 선택사항
})
```

**주문 상세:**

```tsx
const order = await storeOrdersApi.getOrderDetail('order-uuid')
```

**파트너 주문 관리:**

```tsx
const partnerOrders = await storeOrdersApi.getPartnerOrders({
  page: 1,
  limit: 20,
  status: 'paid'
})
```

### 9. 환불 처리

**환불 요청:**

```tsx
import { storeRefundsApi } from '@/api/store/refunds'

await storeRefundsApi.createRefund({
  order_id: 'order-uuid',
  reason: '환불 사유',
  items: [{ order_item_id: 'item-uuid', quantity: 1 }]
})
```

**환불 목록 조회:**

```tsx
const refunds = await storeRefundsApi.getRefunds({
  page: 1,
  limit: 20
})
```

**파트너/관리자: 환불 승인/거절**

```tsx
await storeRefundsApi.respondRefund({
  refund_id: 'refund-uuid',
  action: 'approve', // 또는 'reject'
  notes: '처리 메모'
})
```

## 데이터베이스 구조

### store_orders 테이블

```sql
- order_id: 주문 ID (UUID)
- user_id: 구매자 ID
- partner_id: 파트너 ID
- total_amount: 총 금액
- shipping_fee: 배송비
- status: 주문 상태 (pending | paid | shipped | delivered | confirmed | cancelled)
- payment_method: 결제 수단
- created_at: 주문 생성 시간
```

### store_order_items 테이블

```sql
- item_id: 아이템 ID
- order_id: 주문 ID
- product_id: 상품 ID
- product_name: 상품명
- product_price: 상품 가격
- product_type: 상품 타입 (digital | on_site | delivery)
- product_source: 상품 출처 (partner | collaboration)
- quantity: 수량
- unit_price: 단가
- subtotal: 소계
- status: 아이템 상태
- is_confirmed: 구매확정 여부
- confirmed_at: 구매확정 시간
```

### store_shipments 테이블

```sql
- shipment_id: 배송 ID
- order_id: 주문 ID
- shipping_fee: 배송비
- recipient_name: 수령자 이름
- recipient_phone: 수령자 전화번호
- recipient_address: 수령자 주소
- recipient_address_detail: 상세 주소
- recipient_postal_code: 우편번호
- delivery_memo: 배송 메모
- tracking_number: 송장번호
- carrier: 택배사
- status: 배송 상태
```

### store_schedules 테이블

```sql
- schedule_id: 스케줄 ID
- order_id: 주문 ID
- product_id: 상품 ID
- start_at: 수령 시간 (null 가능)
- location_id: 수령 장소 ID (null 가능)
- status: 스케줄 상태 (pending | reserved | completed | no_show | canceled)
- created_at: 생성 시간
```

### store_digital_downloads 테이블

```sql
- download_id: 다운로드 ID
- user_id: 사용자 ID
- order_id: 주문 ID
- asset_id: 에셋 ID
- download_count: 다운로드 횟수
- created_at: 생성 시간
```

### store_refunds 테이블

```sql
- refund_id: 환불 ID
- order_id: 주문 ID
- user_id: 사용자 ID
- reason: 환불 사유
- amount: 환불 금액
- status: 환불 상태 (pending | approved | rejected)
- responded_at: 처리 시간
- response_notes: 처리 메모
```

## 주요 API 엔드포인트

### 상품 관리 (api-store-products)

- `GET /api-store-products` - 상품 목록 조회
- `GET /api-store-products/detail?product_id=` - 상품 상세 조회
- `POST /api-store-products` - 상품 등록 (Partner/Admin)
- `PUT /api-store-products/update?product_id=` - 상품 수정 (Partner/Admin)
- `DELETE /api-store-products/delete?product_id=` - 상품 삭제 (Partner/Admin)

### 주문 관리 (api-store-orders)

- `GET /api-store-orders` - 내 주문 목록 (User)
- `GET /api-store-orders/:id` - 주문 상세 (User/Admin)
- `POST /api-store-orders` - 주문 생성 (User)
- `PUT /api-store-orders/:id/status` - 주문 상태 변경 (Partner/Admin)
- `PUT /api-store-orders/:id/confirm` - 구매 확정 (User)
- `PUT /api-store-orders/:id/cancel` - 주문 취소 (User)
- `GET /api-store-orders/partner/orders` - 파트너 주문 관리 (Partner)

### 결제 관리 (api-store-payments)

- `POST /api-store-payments/confirm` - 결제 승인 (Toss Payments)

### 환불 관리 (api-store-refunds)

- `POST /api-store-refunds` - 환불 요청 (User)
- `GET /api-store-refunds` - 환불 목록 (User/Partner/Admin)
- `GET /api-store-refunds/detail?refund_id=` - 환불 상세
- `PUT /api-store-refunds/respond?refund_id=` - 환불 승인/거절 (Partner/Admin)

### 스케줄 관리 (api-store-schedules)

- `GET /api-store-schedules` - 스케줄 목록 조회
- `GET /api-store-schedules/:id` - 스케줄 상세
- `POST /api-store-schedules` - 스케줄 생성 (Partner)
- `PUT /api-store-schedules/:id` - 스케줄 수정 (Partner/Admin)
- `PUT /api-store-schedules/:id/pickup` - 현장 수령 처리 (Partner)
- `PUT /api-store-schedules/order/:order_id/status` - 스케줄 상태 변경 (User)
- `PUT /api-store-schedules/order/:order_id/confirm` - 스케줄 확정 (Partner)

### 디지털 상품 (api-store-digital)

- `POST /api-store-digital/grant-access` - 다운로드 권한 부여
- `GET /api-store-digital/downloads?download_id=` - 다운로드 URL 생성
- `GET /api-store-digital/purchased` - 구매 목록 조회

### 협업 상품 (api-store-collaboration)

- `POST /api-store-collaboration/shipment-requests` - 출고 요청 생성 (Partner)
- `PUT /api-store-collaboration/shipment-requests/respond?request_id=` - 출고 요청 승인/거절 (Admin)
- `PUT /api-store-collaboration/products/stock?product_id=` - 재고 변경 (Admin)

## 통합 예시

### 상품 상세 페이지에서 구매

```tsx
import { storeOrdersApi } from '@/api/store/orders'
import { useCartStore } from '@/store/useCartStore'

function ProductDetailPage() {
  const { addItem } = useCartStore()
  const navigate = useNavigate()

  const handlePurchase = async () => {
    // 장바구니에 추가
    const success = addItem(product, 1)
    if (success) {
      navigate({ to: '/store/cart' })
    } else {
      toast.error('다른 파트너 상품이 장바구니에 있습니다.')
    }
  }
}
```

### 체크아웃 프로세스

```tsx
import { storeOrdersApi } from '@/api/store/orders'
import { storePaymentsApi } from '@/api/store/payments'

async function handleCheckout() {
  // 1. 주문 생성
  const orderResponse = await storeOrdersApi.createOrder({
    product_id: productId,
    quantity: 1,
    recipient_name: '수령자',
    recipient_phone: '010-1234-5678',
    recipient_address: '주소',
    // ...
  })

  if (!orderResponse.success) {
    toast.error('주문 생성 실패')
    return
  }

  // 2. Toss Payments 결제
  const paymentResponse = await storePaymentsApi.confirmPayment({
    order_id: orderResponse.data.order_id,
    payment_key: paymentKey,
    amount: totalAmount
  })

  if (paymentResponse.success) {
    // 3. 디지털 상품인 경우 권한 부여
    if (productType === 'digital') {
      await storeDigitalApi.grantAccess({
        order_id: orderResponse.data.order_id,
        user_id: user.id
      })
    }

    navigate({ to: '/store/payment/success' })
  }
}
```

## 주요 특징

1. **파트너 단위 장바구니**: 동일 파트너 상품만 결제 가능
2. **상품 타입별 플로우**: 디지털/현장수령/택배 각각 다른 처리
3. **자동화**: 결제 성공 시 상품 타입별 자동 처리
4. **채팅 연동**: 택배(개인)/현장수령 상품은 채팅으로 소통
5. **재고 관리**: 협업/개인 상품별 권한 분리
6. **환불 정책**: 상품 타입별 환불 규정 적용

## 환경 설정

스토어 기능이 올바르게 작동하려면:

1. Supabase Edge Functions 배포:
   - `api-store-products`
   - `api-store-orders`
   - `api-store-payments`
   - `api-store-refunds`
   - `api-store-schedules`
   - `api-store-digital`
   - `api-store-collaboration`
   - `api-store-cart`

2. 데이터베이스 테이블 생성:
   - `store_products`
   - `store_orders`
   - `store_order_items`
   - `store_shipments`
   - `store_schedules`
   - `store_digital_assets`
   - `store_digital_downloads`
   - `store_refunds`
   - `store_shipment_requests`

3. Row Level Security (RLS) 정책 설정

4. Toss Payments 연동 설정

---

## 🐛 문제 해결 (Troubleshooting)

### 주문 생성이 실패하는 경우:

1. **포인트 부족 확인**
   - 사용자 포인트 잔액 확인
   - 충전 모달 표시 여부 확인

2. **재고 부족 확인**
   - 상품 재고 상태 확인
   - 옵션별 재고 확인

3. **배송지 정보 확인** (택배 상품)
   - 필수 필드 입력 확인
   - 주소 형식 확인

### 디지털 상품 다운로드가 안 되는 경우:

1. **권한 부여 확인**
   - 결제 성공 후 `grant-access` API 호출 확인
   - `store_digital_downloads` 테이블에 레코드 존재 확인

2. **다운로드 URL 생성 확인**
   - `download_id` 유효성 확인
   - 에셋 파일 존재 확인

### 택배 상품 배송 정보가 안 보이는 경우:

1. **협업 상품**: 관리자 출고 요청 승인 확인
2. **개인 상품**: 파트너 송장 입력 확인
3. **채팅 메시지**: 자동 발송 메시지 확인

### 현장수령 스케줄이 확정되지 않는 경우:

1. **채팅방 확인**: 유저↔파트너 채팅방 존재 확인
2. **파트너 권한**: 스케줄 확정 API 호출 권한 확인
3. **timesheet 연계**: 근무형 파트너는 출근 상태 확인 (수령 완료 시)

### 테스트 방법:

개별 API를 직접 호출하여 테스트:

```tsx
// 주문 생성 테스트
const testOrder = await storeOrdersApi.createOrder({
  product_id: 'test-product-id',
  quantity: 1,
  // ...
})

// 디지털 권한 부여 테스트
const testAccess = await storeDigitalApi.grantAccess({
  order_id: testOrder.data.order_id,
  user_id: 'test-user-id'
})
```

### 디버깅 팁:

- 개발자 도구 콘솔에서 API 응답 확인
- Supabase 데이터베이스에서 주문/스케줄/다운로드 데이터 직접 확인
- Toss Payments 결제 로그 확인
- 채팅 메시지 자동 발송 여부 확인

## 📋 체크리스트

설치 전 확인사항:

- [ ] Supabase Edge Functions 배포 완료
- [ ] 필요한 테이블들 생성 완료
- [ ] Row Level Security (RLS) 정책 설정
- [ ] Toss Payments 연동 설정
- [ ] 포인트 시스템 연동 확인

사용 전 확인사항:

- [ ] 상품 등록 완료
- [ ] 재고 설정 완료
- [ ] 배송지 관리 기능 확인
- [ ] 채팅 시스템 연동 확인
- [ ] 결제 테스트 완료

