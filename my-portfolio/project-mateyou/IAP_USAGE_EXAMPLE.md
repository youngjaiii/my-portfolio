# iOS ATT 및 IAP 사용 가이드

## 1. ATT (App Tracking Transparency) 권한 요청

ATT 권한은 앱이 활성화될 때 자동으로 요청됩니다. `AppDelegate.swift`에서 구현되어 있습니다.

### 동작 방식
- 앱이 `applicationDidBecomeActive` 상태가 되면 자동으로 ATT 권한 요청
- iOS 14.5 이상에서만 작동
- 사용자가 한 번 거부하면 다시 요청할 수 없음

## 2. IAP (In-App Purchase) 사용 방법

### 기본 사용법

```typescript
import { useInAppPurchase } from '@/hooks/useInAppPurchase'

function PurchaseComponent() {
  const { products, loading, fetchProducts, purchase, restore, getProduct } = useInAppPurchase()

  // 제품 목록 가져오기
  const loadProducts = async () => {
    await fetchProducts([
      'com.mateyou.app.premium_monthly',
      'com.mateyou.app.premium_yearly',
      'com.mateyou.app.points_1000'
    ])
  }

  // 제품 구매
  const handlePurchase = async (productId: string) => {
    try {
      const result = await purchase(productId)
      console.log('구매 완료:', result)
      // 서버에 구매 정보 전송 등 후속 처리
    } catch (error) {
      console.error('구매 실패:', error)
    }
  }

  // 구매 복원
  const handleRestore = async () => {
    try {
      const result = await restore()
      console.log('복원된 구매:', result.restoredProducts)
    } catch (error) {
      console.error('복원 실패:', error)
    }
  }

  return (
    <div>
      <button onClick={loadProducts}>제품 목록 불러오기</button>
      {products.map((product) => (
        <div key={product.productId}>
          <h3>{product.title}</h3>
          <p>{product.description}</p>
          <p>{product.priceString}</p>
          <button onClick={() => handlePurchase(product.productId)}>
            구매하기
          </button>
        </div>
      ))}
      <button onClick={handleRestore}>구매 복원</button>
    </div>
  )
}
```

### 직접 API 사용

```typescript
import { InAppPurchase } from '@/lib/inAppPurchase'

// 제품 정보 가져오기
const result = await InAppPurchase.getProducts({
  productIds: ['com.mateyou.app.premium']
})

// 구매
const purchaseResult = await InAppPurchase.purchase({
  productId: 'com.mateyou.app.premium'
})

// 구매 복원
const restoreResult = await InAppPurchase.restorePurchases()

// 결제 가능 여부 확인
const canPay = await InAppPurchase.canMakePayments()
```

## 3. App Store Connect 설정

1. App Store Connect에 로그인
2. 앱 선택 → 기능 → 인앱 구매
3. 제품 추가:
   - 제품 ID: `com.mateyou.app.premium_monthly`
   - 타입: 자동 갱신 구독 / 소모성 / 비소모성
   - 가격 설정
   - 설명 및 스크린샷 추가

## 4. 테스트

### 샌드박스 테스트 계정
- 설정 → App Store → 샌드박스 계정으로 로그인
- 실제 결제 없이 테스트 가능

### 주의사항
- 실제 결제가 발생하지 않도록 샌드박스 계정 사용
- 제품 ID는 App Store Connect에 등록된 것과 정확히 일치해야 함
- 심사 제출 전에 모든 구매 플로우 테스트

## 5. 트러블슈팅

### 제품을 찾을 수 없음
- App Store Connect에서 제품이 승인되었는지 확인
- 제품 ID가 정확한지 확인
- 샌드박스 환경에서 테스트 중인지 확인

### 구매가 완료되지 않음
- 네트워크 연결 확인
- 샌드박스 계정으로 로그인되어 있는지 확인
- 서버에서 영수증 검증 구현 필요

