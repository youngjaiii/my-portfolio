import { useState, useCallback } from 'react'
import { InAppPurchase, type Product, type PurchaseResult } from '@/lib/inAppPurchase'
import { toast } from '@/lib/toast'

export function useInAppPurchase() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * 제품 목록 가져오기
   */
  const fetchProducts = useCallback(async (productIds: string[]) => {
    setLoading(true)
    setError(null)
    
    try {
      const result = await InAppPurchase.getProducts({ productIds })
      setProducts(result.products)
      
      if (result.invalidProductIds.length > 0) {
        console.warn('유효하지 않은 제품 ID:', result.invalidProductIds)
      }
      
      return result.products
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '제품 정보를 가져오는데 실패했습니다'
      setError(errorMessage)
      toast.error(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * 제품 구매
   */
  const purchase = useCallback(async (productId: string): Promise<PurchaseResult> => {
    setLoading(true)
    setError(null)
    
    try {
      // 결제 가능 여부 확인
      const canPayResult = await InAppPurchase.canMakePayments()
      if (!canPayResult.canMakePayments) {
        throw new Error('이 기기에서는 인앱 구매를 사용할 수 없습니다')
      }

      const result = await InAppPurchase.purchase({ productId })
      
      if (result.deferred) {
        toast.info('구매가 승인 대기 중입니다')
      } else if (result.restored) {
        toast.success('구매가 복원되었습니다')
      } else {
        toast.success('구매가 완료되었습니다')
      }
      
      return result
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '구매에 실패했습니다'
      setError(errorMessage)
      toast.error(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * 구매 복원
   */
  const restore = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      const result = await InAppPurchase.restorePurchases()
      
      if (result.restoredProducts.length === 0) {
        toast.info('복원할 구매 내역이 없습니다')
      } else {
        toast.success(`${result.restoredProducts.length}개의 구매가 복원되었습니다`)
      }
      
      return result
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '구매 복원에 실패했습니다'
      setError(errorMessage)
      toast.error(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  /**
   * 제품 찾기
   */
  const getProduct = useCallback((productId: string): Product | undefined => {
    return products.find((p) => p.productId === productId)
  }, [products])

  return {
    products,
    loading,
    error,
    fetchProducts,
    purchase,
    restore,
    getProduct,
  }
}

