import { WebPlugin } from '@capacitor/core'
import type { InAppPurchasePlugin, GetProductsResult, PurchaseResult, RestorePurchasesResult } from './inAppPurchase'

export class InAppPurchaseWeb extends WebPlugin implements InAppPurchasePlugin {
  async getProducts(): Promise<GetProductsResult> {
    console.warn('InAppPurchase는 iOS 네이티브 플랫폼에서만 사용 가능합니다')
    return { products: [], invalidProductIds: [] }
  }

  async purchase(): Promise<PurchaseResult> {
    throw new Error('InAppPurchase는 iOS 네이티브 플랫폼에서만 사용 가능합니다')
  }

  async restorePurchases(): Promise<RestorePurchasesResult> {
    console.warn('InAppPurchase는 iOS 네이티브 플랫폼에서만 사용 가능합니다')
    return { restoredProducts: [] }
  }

  async canMakePayments(): Promise<{ canMakePayments: boolean }> {
    return { canMakePayments: false }
  }
}

