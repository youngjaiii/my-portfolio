# Partner 신청 및 Toss Seller 등록 가이드

이 문서는 MateYou Backend에서 Partner 신청부터 Toss Payments Seller 등록까지의 전체 프로세스를 설명합니다.

## 📋 목차

1. [Partner 신청 프로세스](#partner-신청-프로세스)
2. [Partner 승인 (Admin)](#partner-승인-admin)
3. [Toss Seller 등록](#toss-seller-등록)
4. [전체 워크플로우](#전체-워크플로우)
5. [주요 필드 및 상태](#주요-필드-및-상태)

---

## 🚀 Partner 신청 프로세스

### 1. Partner 신청

**엔드포인트**: `POST /api/auth/partner-apply`

**파일**: [src/routes/auth.route.ts:254-317](../src/routes/auth.route.ts#L254-L317)

**인증**: 필수 (Bearer Token)

**Request Body**:
```json
{
  "partner_name": "파트너명 (필수)",
  "partner_message": "메시지/소개 (선택)",
  "game_info": {
    "게임 정보 객체 (선택)"
  }
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "partner_id",
    "member_id": "user_id",
    "partner_name": "파트너명",
    "partner_status": "pending",
    "partner_applied_at": "2024-01-01T00:00:00Z",
    "total_points": 0,
    "coins_per_job": 0
  }
}
```

**특징**:
- 사용자당 1개의 Partner 신청만 가능
- 초기 상태는 `pending`
- Toss Seller는 자동으로 생성되지 않음

**예제**:
```typescript
const response = await fetch('/api/auth/partner-apply', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    partner_name: '메이트 게임즈',
    partner_message: '게임 개발 파트너십 신청합니다.',
    game_info: {
      genre: 'RPG',
      platform: 'Mobile'
    }
  })
});
```

### 2. Partner 상태 조회

**엔드포인트**: `GET /api/auth/partner-status`

**파일**: [src/routes/auth.route.ts:198-223](../src/routes/auth.route.ts#L198-L223)

**Response**:
```json
{
  "success": true,
  "data": {
    "isPartner": false,
    "partnerStatus": "pending",
    "partnerId": "partner_id",
    "partnerName": "파트너명",
    "totalPoints": 0
  }
}
```

---

## 👨‍💼 Partner 승인 (Admin)

### Partner 상태 변경

**엔드포인트**: `PUT /api/admin/partners/:partnerId/status`

**파일**: [src/routes/admin.route.ts:204-295](../src/routes/admin.route.ts#L204-L295)

**인증**: Admin 권한 필수

**Request Body**:
```json
{
  "status": "approved"
}
```

**가능한 상태값**:
- `pending`: 승인 대기
- `approved`: 승인됨
- `rejected`: 거부됨

**Response**:
```json
{
  "success": true,
  "message": "Partner status updated successfully"
}
```

**중요**:
- Partner 승인 시 Toss Seller는 자동으로 생성되지 않음
- 별도로 Toss Seller 등록 API를 호출해야 함

---

## 💳 Toss Seller 등록

### Toss Seller 생성/업데이트

**엔드포인트**: `POST /api/toss/seller`

**파일**: [src/routes/toss.route.ts:1996-2763](../src/routes/toss.route.ts#L1996-L2763)

**인증**: 필수 (Bearer Token)

**Request Body**:
```json
{
  "mode": "create",
  "payload": {
    "businessType": "INDIVIDUAL",
    "individual": {
      "name": "홍길동",
      "email": "seller@example.com",
      "phone": "01012345678"
    },
    "account": {
      "bankCode": "088",
      "accountNumber": "1234567890",
      "holderName": "홍길동"
    },
    "refSellerId": "REF_SELLER_123",
    "metadata": {
      "partnerId": "partner_id"
    }
  }
}
```

### Business Type별 Payload

#### 1. 개인 (INDIVIDUAL)
```json
{
  "mode": "create",
  "payload": {
    "businessType": "INDIVIDUAL",
    "individual": {
      "name": "홍길동",
      "email": "seller@example.com",
      "phone": "01012345678"
    },
    "account": {
      "bankCode": "088",
      "accountNumber": "1234567890",
      "holderName": "홍길동"
    }
  }
}
```

#### 2. 개인사업자 (INDIVIDUAL_BUSINESS)
```json
{
  "mode": "create",
  "payload": {
    "businessType": "INDIVIDUAL_BUSINESS",
    "individual": {
      "name": "홍길동",
      "email": "seller@example.com",
      "phone": "01012345678",
      "businessRegistrationNumber": "123-45-67890"
    },
    "account": {
      "bankCode": "088",
      "accountNumber": "1234567890",
      "holderName": "홍길동"
    }
  }
}
```

#### 3. 법인 (CORPORATION)
```json
{
  "mode": "create",
  "payload": {
    "businessType": "CORPORATION",
    "company": {
      "name": "주식회사 메이트",
      "representativeName": "홍길동",
      "businessRegistrationNumber": "123-45-67890",
      "email": "company@example.com",
      "phone": "0212345678"
    },
    "account": {
      "bankCode": "088",
      "accountNumber": "1234567890",
      "holderName": "주식회사 메이트"
    }
  }
}
```

### Seller ID 생성 규칙

**파일**: [src/routes/toss.route.ts:19-27](../src/routes/toss.route.ts#L19-L27)

- 형식: `MATE` + 8자리 랜덤 문자열
- 문자: A-Z, 0-9
- 예시: `MATEA1B2C3D4`

### Database 업데이트 필드

Toss Seller 생성 성공 시 `partners` 테이블에 저장되는 정보:

| 필드 | 설명 | 예시 |
|------|------|------|
| `tosspayments_seller_id` | Toss Seller ID | `MATEA1B2C3D4` |
| `tosspayments_ref_seller_id` | 참조 Seller ID | `REF_SELLER_123` |
| `tosspayments_status` | Toss Seller 상태 | `APPROVAL_REQUIRED`, `ACTIVE` |
| `tosspayments_synced_at` | 마지막 동기화 시간 | `2024-01-01T00:00:00Z` |
| `legal_name` | 법적 이름 | `홍길동` |
| `legal_email` | 법적 이메일 | `seller@example.com` |
| `legal_phone` | 법적 연락처 | `01012345678` |
| `payout_bank_code` | 은행 코드 | `088` |
| `payout_account_number` | 계좌 번호 | `1234567890` |
| `payout_account_holder` | 예금주명 | `홍길동` |

### 은행 코드 목록

| 은행명 | 코드 |
|--------|------|
| 신한은행 | 088 |
| KB국민은행 | 004 |
| 우리은행 | 020 |
| 하나은행 | 081 |
| NH농협은행 | 011 |
| 기업은행 | 003 |
| SC제일은행 | 023 |
| 카카오뱅크 | 090 |
| 토스뱅크 | 092 |

[전체 은행 코드 보기](https://docs.tosspayments.com/resources/codes/bank-codes)

### Seller 업데이트

기존 Seller 정보를 업데이트하려면 `mode: "update"`와 `sellerId` 제공:

```json
{
  "mode": "update",
  "sellerId": "MATEA1B2C3D4",
  "payload": {
    "businessType": "INDIVIDUAL",
    "individual": {
      "name": "홍길동",
      "email": "newemail@example.com",
      "phone": "01087654321"
    },
    "account": {
      "bankCode": "090",
      "accountNumber": "9876543210",
      "holderName": "홍길동"
    }
  }
}
```

---

## 🔄 전체 워크플로우

```
1. 사용자 Partner 신청
   POST /api/auth/partner-apply
   └─> partners 테이블에 레코드 생성 (partner_status: "pending")
       └─> tosspayments_seller_id: NULL

2. Admin 승인
   PUT /api/admin/partners/:partnerId/status
   └─> partner_status를 "approved"로 변경
       └─> tosspayments_seller_id: 여전히 NULL

3. Toss Seller 등록 (별도 호출 필요)
   POST /api/toss/seller
   └─> Toss Payments API 호출
       └─> 암호화된 Payload 전송 (JWE)
           └─> Toss에서 Seller 생성
               └─> partners 테이블에 Toss 정보 업데이트
                   - tosspayments_seller_id: "MATEA1B2C3D4"
                   - tosspayments_status: "APPROVAL_REQUIRED"
                   - 법적 정보 및 계좌 정보 저장

4. Partner가 정산 기능 사용 가능
   - tosspayments_seller_id가 있어야 출금/정산 가능
```

### 타임라인 예시

```
Day 1, 10:00 - 사용자가 Partner 신청
Day 1, 14:00 - Admin이 Partner 승인
Day 1, 14:30 - Admin/Partner가 Toss Seller 등록
Day 1, 15:00 - Partner가 정산 기능 사용 가능
```

---

## 📊 주요 필드 및 상태

### Partner 상태 (partner_status)

| 상태 | 설명 |
|------|------|
| `pending` | 승인 대기 중 |
| `approved` | 승인됨 (정산 기능 사용 가능) |
| `rejected` | 거부됨 |

### Toss Seller 상태 (tosspayments_status)

| 상태 | 설명 |
|------|------|
| `APPROVAL_REQUIRED` | Toss 심사 대기 중 |
| `ACTIVE` | 활성화됨 (정산 가능) |
| `REJECTED` | Toss에서 거부됨 |
| `SUSPENDED` | 일시 정지 |

### Partners 테이블 주요 필드

```typescript
{
  id: string                          // Partner ID
  member_id: string                   // 회원 ID
  partner_name: string                // 파트너명
  partner_status: string              // Partner 상태
  partner_applied_at: string          // 신청일시
  partner_reviewed_at?: string        // 검토일시
  total_points: number                // 총 포인트
  coins_per_job: number               // Job당 코인

  // Toss Seller 정보
  tosspayments_seller_id?: string     // Toss Seller ID
  tosspayments_ref_seller_id?: string // 참조 Seller ID
  tosspayments_status?: string        // Toss Seller 상태
  tosspayments_synced_at?: string     // 마지막 동기화

  // 법적 정보
  legal_name?: string                 // 법적 이름
  legal_email?: string                // 법적 이메일
  legal_phone?: string                // 법적 연락처

  // 계좌 정보
  payout_bank_code?: string           // 은행 코드
  payout_account_number?: string      // 계좌 번호
  payout_account_holder?: string      // 예금주명
}
```

---

## 🔧 Admin 전용 기능

### Toss Seller 삭제

**엔드포인트**: `DELETE /api/admin/partners/:partnerId/toss-seller`

**파일**: [src/routes/admin.route.ts:381-624](../src/routes/admin.route.ts#L381-L624)

**기능**:
- Toss Payments에서 Seller 삭제
- `partners` 테이블의 Toss 관련 필드 초기화
- 대기 중인 출금 요청 거부

**사용 시나리오**:
- Seller 정보가 잘못 입력된 경우
- Seller를 재등록해야 하는 경우
- Partner 계약 종료 시

---

## 🔗 관련 API 엔드포인트

### Public 엔드포인트

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/partners/details/:memberCode` | GET | Partner 상세 정보 조회 |
| `/api/partners/list` | GET | 승인된 Partner 목록 (페이지네이션) |

### Partner 전용 엔드포인트

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/auth/partner-apply` | POST | Partner 신청 |
| `/api/auth/partner-status` | GET | Partner 상태 조회 |
| `/api/partner-dashboard/...` | * | Partner 대시보드 관련 |

### Admin 전용 엔드포인트

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/admin/partners` | GET | 전체 Partner 관리 |
| `/api/admin/partners/:partnerId/status` | PUT | Partner 상태 변경 |
| `/api/admin/partners/:partnerId/toss-seller` | DELETE | Toss Seller 삭제 |

### Toss Payments 엔드포인트

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/toss/seller` | POST | Seller 생성/업데이트 |

---

## ⚠️ 주의사항

### 1. 프로세스 분리
- Partner 신청과 Toss Seller 생성이 분리되어 있음
- Partner 승인 후 별도로 Toss Seller를 생성해야 함
- 자동화가 필요하면 Admin 승인 엔드포인트에 로직 추가 필요

### 2. 보안
- Toss API 호출 시 JWE 암호화 사용
- 민감한 정보 (계좌번호 등)는 암호화하여 전송
- Admin 권한 필수 확인

### 3. 데이터 검증
- 은행 코드 유효성 확인
- 사업자등록번호 형식 확인
- 이메일/전화번호 형식 확인

### 4. 에러 처리
- Toss API 오류 시 롤백 처리
- Partner 상태와 Toss Seller 상태 불일치 처리
- 중복 신청 방지

---

## 🧪 테스트 시나리오

### 시나리오 1: 개인 Partner 등록

```typescript
// 1. Partner 신청
const applyResponse = await fetch('/api/auth/partner-apply', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${userToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    partner_name: '홍길동 게임즈',
    partner_message: '게임 개발 파트너십 신청'
  })
});

const { data: partner } = await applyResponse.json();

// 2. Admin 승인
const approveResponse = await fetch(`/api/admin/partners/${partner.id}/status`, {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    status: 'approved'
  })
});

// 3. Toss Seller 등록
const sellerResponse = await fetch('/api/toss/seller', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${userToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    mode: 'create',
    payload: {
      businessType: 'INDIVIDUAL',
      individual: {
        name: '홍길동',
        email: 'hong@example.com',
        phone: '01012345678'
      },
      account: {
        bankCode: '088',
        accountNumber: '1234567890',
        holderName: '홍길동'
      },
      metadata: {
        partnerId: partner.id
      }
    }
  })
});
```

---

## 📞 문제 해결

### Q: Partner는 승인되었는데 정산이 안 돼요
A: Toss Seller가 등록되었는지 확인하세요. `tosspayments_seller_id` 필드가 있어야 정산 가능합니다.

### Q: Toss Seller 등록이 실패해요
A:
1. Payload 형식 확인
2. 은행 코드 유효성 확인
3. 이메일/전화번호 형식 확인
4. Toss API 키 설정 확인

### Q: Seller 정보를 수정하고 싶어요
A: `mode: "update"`와 `sellerId`를 사용하여 업데이트 API 호출

### Q: Partner를 삭제하고 싶어요
A: Admin 권한으로 Toss Seller 삭제 후 Partner 상태를 `rejected`로 변경

---

## 🔗 관련 링크

- [Toss Payments 문서](https://docs.tosspayments.com/)
- [은행 코드 목록](https://docs.tosspayments.com/resources/codes/bank-codes)
- [Supabase Auth 가이드](./AUTH_TOKEN_GUIDE.md)
