import { registerPlugin } from '@capacitor/core'

export interface Product {
  productId: string
  title: string
  description: string
  price: number
  priceLocale: string
  priceString: string
  currencyCode: string
}

export interface PurchaseResult {
  productId: string
  transactionId: string
  transactionDate: number
  restored?: boolean
  deferred?: boolean
}

export interface GetProductsResult {
  products: Product[]
  invalidProductIds: string[]
}

export interface RestorePurchasesResult {
  restoredProducts: Array<{
    productId: string
    transactionId: string
    transactionDate: number
  }>
}

export interface GetProductsOptions {
  productIds: string[]
}

export interface PurchaseOptions {
  productId: string
}

export interface InAppPurchasePlugin {
  getProducts(options: GetProductsOptions): Promise<GetProductsResult>
  purchase(options: PurchaseOptions): Promise<PurchaseResult>
  restorePurchases(): Promise<RestorePurchasesResult>
  canMakePayments(): Promise<{ canMakePayments: boolean }>
}

const InAppPurchase = registerPlugin<InAppPurchasePlugin>('InAppPurchase', {
  web: () => import('./inAppPurchase.web').then((m) => new m.InAppPurchaseWeb()),
})

export { InAppPurchase }

