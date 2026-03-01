# Store v1 스키마 설계 후보 (M0-2 세션용)

## 생성된 파일
- `supabase/functions/_shared/store-types.ts` - 도메인 타입/enum/상수 정의
- `supabase/functions/_shared/store-state-transitions.ts` - 상태전이 규칙 및 검증 함수
- `supabase/functions/_shared/store-state-transitions.test.ts` - 단위 테스트 스니펫
- `supabase/functions/_shared/store-state-transitions.example.ts` - 사용 예시

## 다음 세션(M0-2)에서 필요한 스키마 후보

### 1. 핵심 테이블 (PRD 기반)

#### store_products (상품)
- `product_id` UUID PRIMARY KEY
- `partner_id` UUID (FK: partners.id)
- `name` TEXT NOT NULL
- `description` TEXT
- `price` INTEGER NOT NULL
- `product_type` TEXT NOT NULL CHECK (product_type IN ('digital', 'on_site', 'delivery'))
- `source` TEXT NOT NULL CHECK (source IN ('partner', 'collaboration'))
- `stock` INTEGER (NULL 허용: 무제한)
- `thumbnail_url` TEXT
- `is_active` BOOLEAN DEFAULT true
- `created_at` TIMESTAMPTZ DEFAULT now()
- `updated_at` TIMESTAMPTZ DEFAULT now()

#### store_product_images (상품 이미지)
- `image_id` UUID PRIMARY KEY
- `product_id` UUID (FK: store_products.product_id)
- `image_url` TEXT NOT NULL
- `display_order` INTEGER DEFAULT 0

#### store_product_variants (상품 옵션/변형)
- `variant_id` UUID PRIMARY KEY
- `product_id` UUID (FK: store_products.product_id)
- `name` TEXT (예: "사이즈", "색상")
- `value` TEXT (예: "M", "빨강")
- `price_adjustment` INTEGER DEFAULT 0
- `stock` INTEGER (NULL 허용)

#### store_orders (주문)
- `order_id` UUID PRIMARY KEY
- `user_id` UUID (FK: members.id)
- `product_id` UUID (FK: store_products.product_id)
- `variant_id` UUID NULL (FK: store_product_variants.variant_id)
- `quantity` INTEGER NOT NULL DEFAULT 1
- `total_amount` INTEGER NOT NULL
- `status` TEXT NOT NULL CHECK (status IN ('pending', 'paid', 'shipped', 'delivered', 'confirmed', 'cancelled'))
- `schedule_id` UUID NULL (FK: store_partner_schedules.schedule_id, on_site 전용)
- `recipient_name` TEXT (delivery 전용)
- `recipient_phone` TEXT (delivery 전용)
- `recipient_address` TEXT (delivery 전용)
- `recipient_postal_code` TEXT (delivery 전용)
- `delivery_memo` TEXT (delivery 전용)
- `courier` TEXT (택배사, shipped 시)
- `tracking_number` TEXT (송장번호, shipped 시)
- `shipped_at` TIMESTAMPTZ
- `delivered_at` TIMESTAMPTZ
- `created_at` TIMESTAMPTZ DEFAULT now()
- `updated_at` TIMESTAMPTZ DEFAULT now()

#### store_partner_schedules (현장수령 스케줄 - SoT)
- `schedule_id` UUID PRIMARY KEY
- `order_id` UUID (FK: store_orders.order_id)
- `partner_id` UUID (FK: partners.id)
- `start_time` TIMESTAMPTZ NULL (채팅 조율 후 확정)
- `end_time` TIMESTAMPTZ NULL
- `location_id` UUID NULL (FK: locations.id 또는 TEXT, 채팅 조율 후 확정)
- `location_name` TEXT NULL (직접 입력 가능)
- `status` TEXT NOT NULL CHECK (status IN ('pending', 'reserved', 'completed', 'no_show', 'canceled'))
- `created_at` TIMESTAMPTZ DEFAULT now()
- `updated_at` TIMESTAMPTZ DEFAULT now()

#### store_digital_assets (디지털 자산)
- `asset_id` UUID PRIMARY KEY
- `product_id` UUID (FK: store_products.product_id)
- `file_url` TEXT NOT NULL
- `file_name` TEXT NOT NULL
- `file_size` INTEGER
- `display_order` INTEGER DEFAULT 0

#### store_digital_downloads (디지털 다운로드 권한)
- `download_id` UUID PRIMARY KEY
- `user_id` UUID (FK: members.id)
- `order_id` UUID (FK: store_orders.order_id)
- `product_id` UUID (FK: store_products.product_id)
- `asset_id` UUID (FK: store_digital_assets.asset_id)
- `download_url` TEXT (임시 URL, 만료 시간 포함)
- `expires_at` TIMESTAMPTZ
- `downloaded_at` TIMESTAMPTZ NULL
- `created_at` TIMESTAMPTZ DEFAULT now()

#### store_shipments (배송 정보)
- `shipment_id` UUID PRIMARY KEY
- `order_id` UUID (FK: store_orders.order_id)
- `courier` TEXT NOT NULL
- `tracking_number` TEXT NOT NULL
- `shipped_at` TIMESTAMPTZ DEFAULT now()
- `delivered_at` TIMESTAMPTZ NULL

#### store_refunds (환불)
- `refund_id` UUID PRIMARY KEY
- `order_id` UUID (FK: store_orders.order_id)
- `user_id` UUID (FK: members.id)
- `amount` INTEGER NOT NULL
- `reason` TEXT
- `status` TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'completed'))
- `requested_at` TIMESTAMPTZ DEFAULT now()
- `responded_at` TIMESTAMPTZ NULL
- `responded_by` UUID NULL (FK: members.id, Partner/Admin)
- `completed_at` TIMESTAMPTZ NULL

#### store_collaboration_requests (협업 상품 요청)
- `request_id` UUID PRIMARY KEY
- `product_id` UUID (FK: store_products.product_id)
- `partner_id` UUID (FK: partners.id)
- `admin_id` UUID (FK: members.id)
- `status` TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected'))
- `created_at` TIMESTAMPTZ DEFAULT now()
- `responded_at` TIMESTAMPTZ NULL

#### store_shipment_requests (협업 출고 요청)
- `request_id` UUID PRIMARY KEY
- `order_id` UUID (FK: store_orders.order_id)
- `partner_id` UUID (FK: partners.id)
- `status` TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'shipped'))
- `requested_at` TIMESTAMPTZ DEFAULT now()
- `responded_at` TIMESTAMPTZ NULL
- `responded_by` UUID NULL (FK: members.id, Admin)
- `processed_at` TIMESTAMPTZ NULL

#### store_transactions (정산/거래)
- `transaction_id` UUID PRIMARY KEY
- `order_id` UUID (FK: store_orders.order_id)
- `partner_id` UUID (FK: partners.id)
- `user_id` UUID (FK: members.id)
- `amount` INTEGER NOT NULL
- `transaction_type` TEXT NOT NULL CHECK (transaction_type IN ('sale', 'refund'))
- `status` TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'cancelled'))
- `settled_at` TIMESTAMPTZ NULL
- `created_at` TIMESTAMPTZ DEFAULT now()

### 2. 인덱스 후보
- `store_products.partner_id`
- `store_products.product_type`
- `store_products.source`
- `store_products.is_active`
- `store_orders.user_id`
- `store_orders.status`
- `store_orders.product_id`
- `store_partner_schedules.order_id`
- `store_partner_schedules.partner_id`
- `store_partner_schedules.status`
- `store_digital_downloads.user_id`
- `store_digital_downloads.order_id`

### 3. RLS (Row Level Security) 정책 후보
- `store_products`: Public 조회 가능, Partner는 본인 상품만 수정/삭제
- `store_orders`: User는 본인 주문만 조회, Partner는 본인 상품 주문만 조회
- `store_partner_schedules`: Public 조회 가능, Partner는 본인 스케줄만 수정
- `store_digital_downloads`: User는 본인 다운로드만 조회
- `store_refunds`: User는 본인 환불만 조회, Partner는 본인 상품 환불만 조회

### 4. 외래키 제약조건
- `store_products.partner_id` → `partners.id`
- `store_orders.user_id` → `members.id`
- `store_orders.product_id` → `store_products.product_id`
- `store_partner_schedules.order_id` → `store_orders.order_id`
- `store_digital_downloads.order_id` → `store_orders.order_id`

### 5. 트리거 후보
- `store_orders.status` 변경 시 `updated_at` 자동 갱신
- `store_partner_schedules.status` 변경 시 `updated_at` 자동 갱신
- `store_orders.status = 'paid'` 시:
  - `product_type = 'digital'` → `store_digital_downloads` 권한 부여
  - `product_type = 'on_site'` → `store_partner_schedules` row 생성
  - `product_type = 'delivery' AND source = 'partner'` → 채팅 구매요청 메시지 발송

### 6. 참고사항
- timesheet 연계: `store_partner_schedules.completed` 전이 시 timesheet 상태 참조 (코드 수정 없이 조회만)
- 채팅 연계: `store_orders`와 `chat_rooms` 연결 (별도 테이블 또는 order_id 기반 조회)
- locations: `store_partner_schedules.location_id`는 기존 locations 테이블 참조 또는 TEXT 직접 입력




