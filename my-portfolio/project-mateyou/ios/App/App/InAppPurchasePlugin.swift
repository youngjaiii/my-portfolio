import Foundation
import Capacitor
import StoreKit

@objc(InAppPurchasePlugin)
public class InAppPurchasePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "InAppPurchasePlugin"
    public let jsName = "InAppPurchase"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "canMakePayments", returnType: CAPPluginReturnPromise)
    ]
    
    private var productsRequest: SKProductsRequest?
    private var products: [String: SKProduct] = [:]
    private var purchaseCallbacks: [String: CAPPluginCall] = [:]
    private var getProductsCall: CAPPluginCall?
    private var restoreCall: CAPPluginCall?
    
    @objc func getProducts(_ call: CAPPluginCall) {
        guard let productIds = call.getArray("productIds", String.self), !productIds.isEmpty else {
            call.reject("productIds 배열이 필요합니다")
            return
        }
        
        print("📦 [IAP] 제품 요청 시작")
        print("📦 [IAP] 요청 제품 ID: \(productIds)")
        
        // Bundle ID 확인
        if let bundleId = Bundle.main.bundleIdentifier {
            print("📱 [IAP] 현재 Bundle ID: \(bundleId)")
        }
        
        // 제품 ID 상세 검증
        for productId in productIds {
            print("🔍 [IAP] 제품 ID 검증: '\(productId)'")
            print("   - 길이: \(productId.count)")
            print("   - 공백 포함: \(productId.contains(" "))")
            print("   - 앞뒤 공백: '\(productId.trimmingCharacters(in: .whitespaces))'")
        }
        
        // 샌드박스 환경 확인
        #if DEBUG
        print("🧪 [IAP] DEBUG 빌드 - 샌드박스 환경")
        #else
        print("🚀 [IAP] RELEASE 빌드 - 프로덕션 환경")
        #endif
        
        let productIdentifiers = Set(productIds)
        productsRequest = SKProductsRequest(productIdentifiers: productIdentifiers)
        productsRequest?.delegate = self
        productsRequest?.start()
        
        print("📦 [IAP] SKProductsRequest 시작됨")
        
        // 콜백 저장
        getProductsCall = call
        call.keepAlive = true
    }
    
    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("productId가 필요합니다")
            return
        }
        
        guard let product = products[productId] else {
            call.reject("제품을 찾을 수 없습니다. 먼저 getProducts를 호출하세요")
            return
        }
        
        // 결제 큐에 관찰자 추가 (중복 추가 방지)
        // StoreKit은 자동으로 중복을 처리하므로 매번 추가해도 안전
        SKPaymentQueue.default().add(self)
        
        // 결제 시작
        let payment = SKPayment(product: product)
        SKPaymentQueue.default().add(payment)
        
        // 콜백 저장
        purchaseCallbacks[productId] = call
        call.keepAlive = true
    }
    
    @objc func restorePurchases(_ call: CAPPluginCall) {
        // 결제 큐에 관찰자 추가
        SKPaymentQueue.default().add(self)
        
        restoreCall = call
        SKPaymentQueue.default().restoreCompletedTransactions()
        
        call.keepAlive = true
    }
    
    @objc func canMakePayments(_ call: CAPPluginCall) {
        let canPay = SKPaymentQueue.canMakePayments()
        call.resolve(["canMakePayments": canPay])
    }
}

// MARK: - SKProductsRequestDelegate
extension InAppPurchasePlugin: SKProductsRequestDelegate {
    public func productsRequest(_ request: SKProductsRequest, didReceive response: SKProductsResponse) {
        print("📦 [IAP] 제품 요청 응답 받음")
        print("📦 [IAP] 유효한 제품 수: \(response.products.count)")
        print("📦 [IAP] 무효한 제품 ID 수: \(response.invalidProductIdentifiers.count)")
        
        var productsArray: [[String: Any]] = []
        
        for product in response.products {
            print("✅ [IAP] 유효한 제품: \(product.productIdentifier) - \(product.localizedTitle)")
            self.products[product.productIdentifier] = product
            
            let formatter = NumberFormatter()
            formatter.numberStyle = .currency
            formatter.locale = product.priceLocale
            
            productsArray.append([
                "productId": product.productIdentifier,
                "title": product.localizedTitle,
                "description": product.localizedDescription,
                "price": product.price.doubleValue,
                "priceLocale": product.priceLocale.identifier,
                "priceString": formatter.string(from: product.price) ?? "",
                "currencyCode": product.priceLocale.currencyCode ?? ""
            ])
        }
        
        var invalidProductIds: [String] = []
        for invalidId in response.invalidProductIdentifiers {
            print("❌ [IAP] 무효한 제품 ID: \(invalidId)")
            invalidProductIds.append(invalidId)
        }
        
        if invalidProductIds.count > 0 {
            print("⚠️ [IAP] 무효한 제품 ID 목록:")
            for id in invalidProductIds {
                print("   - '\(id)' (길이: \(id.count))")
            }
            print("")
            print("💡 [IAP] 가능한 원인 (우선순위 순):")
            print("   1. ⚠️ 제품이 앱과 연결되지 않음 (가장 가능성 높음)")
            print("      → App Store Connect → 인앱 구매 → 각 제품 → '앱 연결' 확인")
            print("   2. ⚠️ 샌드박스 계정으로 로그인하지 않음")
            print("      → 설정 → App Store → 샌드박스 계정으로 로그인")
            print("   3. 제품 ID에 공백이나 오타가 있음")
            print("      → App Store Connect의 제품 ID와 코드의 제품 ID를 정확히 비교")
            print("   4. 앱이 '준비 완료' 상태가 아님")
            print("      → App Store Connect → 내 앱 → 앱 상태 확인")
            print("   5. 제품이 아직 App Store 서버에 반영되지 않음")
            print("      → 제품 생성/수정 후 최대 24시간 소요 가능")
            print("")
            print("🔍 [IAP] 즉시 확인할 사항:")
            print("   1. 실제 기기에서 테스트 중인가? (시뮬레이터는 IAP 불가)")
            print("   2. 설정 → App Store → 샌드박스 계정으로 로그인되어 있는가?")
            print("   3. App Store Connect에서 제품 ID를 복사하여 코드와 정확히 일치하는가?")
            print("   4. 각 제품의 '앱 연결' 섹션에 앱이 연결되어 있는가?")
        }
        
        // 콜백에 응답
        if let call = getProductsCall {
            call.resolve([
                "products": productsArray,
                "invalidProductIds": invalidProductIds
            ])
            call.keepAlive = false
            getProductsCall = nil
        }
    }
    
    public func request(_ request: SKRequest, didFailWithError error: Error) {
        print("❌ [IAP] 제품 요청 실패: \(error.localizedDescription)")
        print("❌ [IAP] 에러 상세: \(error)")
        
        // 콜백에 에러 응답
        if let call = getProductsCall {
            call.reject("제품 정보를 가져오는데 실패했습니다: \(error.localizedDescription)")
            call.keepAlive = false
            getProductsCall = nil
        }
    }
}

// MARK: - SKPaymentTransactionObserver
extension InAppPurchasePlugin: SKPaymentTransactionObserver {
    public func paymentQueue(_ queue: SKPaymentQueue, updatedTransactions transactions: [SKPaymentTransaction]) {
        for transaction in transactions {
            let productId = transaction.payment.productIdentifier
            
            switch transaction.transactionState {
            case .purchased:
                // 구매 완료
                if let call = purchaseCallbacks[productId] {
                    call.resolve([
                        "productId": productId,
                        "transactionId": transaction.transactionIdentifier ?? "",
                        "transactionDate": transaction.transactionDate?.timeIntervalSince1970 ?? 0
                    ])
                    call.keepAlive = false
                    purchaseCallbacks.removeValue(forKey: productId)
                }
                
                // 트랜잭션 완료 처리
                SKPaymentQueue.default().finishTransaction(transaction)
                
            case .failed:
                // 구매 실패
                if let call = purchaseCallbacks[productId] {
                    let errorMessage = transaction.error?.localizedDescription ?? "알 수 없는 오류"
                    call.reject("구매 실패: \(errorMessage)")
                    call.keepAlive = false
                    purchaseCallbacks.removeValue(forKey: productId)
                }
                
                SKPaymentQueue.default().finishTransaction(transaction)
                
            case .restored:
                // 복원 완료
                if let call = purchaseCallbacks[productId] {
                    call.resolve([
                        "productId": productId,
                        "transactionId": transaction.original?.transactionIdentifier ?? "",
                        "transactionDate": transaction.transactionDate?.timeIntervalSince1970 ?? 0,
                        "restored": true
                    ])
                    call.keepAlive = false
                    purchaseCallbacks.removeValue(forKey: productId)
                }
                
                SKPaymentQueue.default().finishTransaction(transaction)
                
            case .deferred:
                // 구매 대기 중 (부모 승인 필요)
                if let call = purchaseCallbacks[productId] {
                    call.resolve([
                        "productId": productId,
                        "deferred": true
                    ])
                    call.keepAlive = false
                    purchaseCallbacks.removeValue(forKey: productId)
                }
                
            case .purchasing:
                // 구매 진행 중
                break
                
            @unknown default:
                break
            }
        }
    }
    
    public func paymentQueue(_ queue: SKPaymentQueue, restoreCompletedTransactionsFailedWithError error: Error) {
        // 복원 실패
        if let call = restoreCall {
            call.reject("구매 복원 실패: \(error.localizedDescription)")
            call.keepAlive = false
            restoreCall = nil
        }
    }
    
    public func paymentQueueRestoreCompletedTransactionsFinished(_ queue: SKPaymentQueue) {
        // 복원 완료
        var restoredProducts: [[String: Any]] = []
        
        for transaction in queue.transactions {
            if transaction.transactionState == .restored {
                restoredProducts.append([
                    "productId": transaction.payment.productIdentifier,
                    "transactionId": transaction.original?.transactionIdentifier ?? "",
                    "transactionDate": transaction.transactionDate?.timeIntervalSince1970 ?? 0
                ])
                SKPaymentQueue.default().finishTransaction(transaction)
            }
        }
        
        if let call = restoreCall {
            call.resolve([
                "restoredProducts": restoredProducts
            ])
            call.keepAlive = false
            restoreCall = nil
        }
    }
}

