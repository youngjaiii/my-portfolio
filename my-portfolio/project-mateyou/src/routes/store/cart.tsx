import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { ShoppingCart, Trash2, Minus, Plus, MapPin, ChevronRight, X, Loader2, Search } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useDevice } from '@/hooks/useDevice'
import { Button, Typography, AvatarWithFallback, SlideSheet, Input } from '@/components'
import { toast } from 'sonner'
import { storeCartApi, type CartItem, type ShippingAddress } from '@/api/store/cart'
import type { SelectedOption } from '@/api/store/products'

export const Route = createFileRoute('/store/cart')({
  component: CartPage,
})

// 아이템의 옵션 추가금액 계산
function calculateItemOptionPrice(item: CartItem): number {
  const selectedOptions = (item as any).selected_options as SelectedOption[] | undefined
  if (!selectedOptions || selectedOptions.length === 0) return 0
  return selectedOptions.reduce((sum, opt) => sum + (opt.price_adjustment || 0), 0)
}

// 필수 옵션 미선택 여부 확인
function hasMissingRequiredOptions(item: CartItem): boolean {
  const options = (item.product as any)?.options as Array<{
    option_id: string;
    is_required: boolean;
  }> | undefined
  if (!options || options.length === 0) return false
  
  const requiredOptions = options.filter(opt => opt.is_required)
  if (requiredOptions.length === 0) return false
  
  const selectedOptions = (item as any).selected_options as Array<{ option_id: string }> | undefined
  if (!selectedOptions || selectedOptions.length === 0) return requiredOptions.length > 0
  
  return requiredOptions.some(reqOpt => 
    !selectedOptions.some(selOpt => selOpt.option_id === reqOpt.option_id)
  )
}

// 장바구니 아이템 카드 컴포넌트
function CartItemCard({
  item,
  isUpdating,
  onQuantityChange,
  onRemove,
  showShippingFee = false,
}: {
  item: CartItem
  isUpdating: boolean
  onQuantityChange: (delta: number) => void
  onRemove: () => void
  showShippingFee?: boolean
}) {
  const selectedOptions = (item as any).selected_options as SelectedOption[] | undefined
  const optionPrice = calculateItemOptionPrice(item)
  const itemPrice = (item.product?.price || 0) + optionPrice
  const isMissingOptions = hasMissingRequiredOptions(item)

  return (
    <div className={`flex gap-4 p-4 bg-white border rounded-xl ${isMissingOptions ? 'border-red-300 bg-red-50' : 'border-gray-100'}`}>
      <div className="w-20 h-20 flex-shrink-0 bg-gray-100 rounded-lg overflow-hidden">
        {item.product?.thumbnail_url ? (
          <img src={item.product.thumbnail_url} alt={item.product.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-200">
            <ShoppingCart className="h-8 w-8 text-gray-400" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <Typography variant="body2" className="font-medium text-gray-900 line-clamp-2">
            {item.product?.name}
          </Typography>
          <button
            type="button"
            onClick={onRemove}
            disabled={isUpdating}
            className="p-1 text-gray-400 hover:text-red-500 flex-shrink-0 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        {/* 필수 옵션 미선택 경고 */}
        {isMissingOptions && (
          <div className="mt-1 px-2 py-1 bg-red-100 rounded text-xs text-red-600">
            ⚠️ 필수 옵션을 선택해주세요
          </div>
        )}

        {/* 선택된 옵션 표시 */}
        {selectedOptions && selectedOptions.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {selectedOptions.map((opt, idx) => (
              <Typography key={idx} variant="caption" className="text-gray-500 block">
                {opt.option_name}: {opt.value || opt.text_value}
                {opt.price_adjustment && opt.price_adjustment > 0 && (
                  <span className="text-[#FE3A8F]"> (+{opt.price_adjustment.toLocaleString()}P)</span>
                )}
              </Typography>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap mt-1">
          <Typography variant="body1" className="font-bold text-[#FE3A8F]">
            {itemPrice.toLocaleString()}P
          </Typography>
          {item.product?.product_type && (
            <span className={`text-xs px-1.5 py-0.5 rounded ${
              item.product.product_type === 'digital' ? 'bg-blue-100 text-blue-700' :
              item.product.product_type === 'on_site' ? 'bg-green-100 text-green-700' :
              'bg-orange-100 text-orange-700'
            }`}>
              {item.product.product_type === 'digital' ? '디지털' :
               item.product.product_type === 'on_site' ? '현장수령' : '택배'}
            </span>
          )}
          {showShippingFee && (item.product as any)?.shipping_fee_base > 0 && (
            <Typography variant="caption" className="text-gray-500">
              +배송비 {((item.product as any).shipping_fee_base || 0).toLocaleString()}P
            </Typography>
          )}
        </div>

        <div className="flex items-center gap-3 mt-2">
          <button
            type="button"
            onClick={() => onQuantityChange(-1)}
            disabled={isUpdating}
            className="w-7 h-7 flex items-center justify-center border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <Minus className="h-4 w-4 text-gray-600" />
          </button>
          <span className="text-sm font-medium w-6 text-center">
            {isUpdating ? '...' : item.quantity}
          </span>
          <button
            type="button"
            onClick={() => onQuantityChange(1)}
            disabled={isUpdating || item.product?.product_type === 'digital'}
            className="w-7 h-7 flex items-center justify-center border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4 text-gray-600" />
          </button>
        </div>
      </div>
    </div>
  )
}

function CartPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { isMobile } = useDevice()

  const [items, setItems] = useState<CartItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState<string | null>(null)

  // 배송지 관련 상태
  const [shippingAddresses, setShippingAddresses] = useState<ShippingAddress[]>([])
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null)
  const [isAddressSheetOpen, setIsAddressSheetOpen] = useState(false)
  const [isAddAddressSheetOpen, setIsAddAddressSheetOpen] = useState(false)
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false)
  const [isSavingAddress, setIsSavingAddress] = useState(false)

  // 직접 입력 배송지
  const [useDirectInput, setUseDirectInput] = useState(false)
  const [directAddress, setDirectAddress] = useState({
    name: '',
    phone: '',
    address: '',
    address_detail: '',
    postal_code: '',
  })

  // 새 배송지 입력
  const [newAddress, setNewAddress] = useState({
    name: '',
    phone: '',
    address: '',
    address_detail: '',
    postal_code: '',
    is_default: false,
  })

  // 체크아웃 관련
  const [deliveryMemo, setDeliveryMemo] = useState('')
  const [isCheckingOut, setIsCheckingOut] = useState(false)

  // 주소 검색 모달
  const [isAddressSearchOpen, setIsAddressSearchOpen] = useState(false)
  const [addressSearchTarget, setAddressSearchTarget] = useState<'direct' | 'new'>('new')

  // 다음 주소 검색
  const openAddressSearch = useCallback((target: 'direct' | 'new') => {
    setAddressSearchTarget(target)
    setIsAddressSearchOpen(true)
  }, [])

  const handleAddressComplete = useCallback((data: any) => {
    const fullAddress = data.address
    const postalCode = data.zonecode

    if (addressSearchTarget === 'direct') {
      setDirectAddress(prev => ({
        ...prev,
        address: fullAddress,
        postal_code: postalCode,
      }))
    } else {
      setNewAddress(prev => ({
        ...prev,
        address: fullAddress,
        postal_code: postalCode,
      }))
    }
    setIsAddressSearchOpen(false)
  }, [addressSearchTarget])

  useEffect(() => {
    if (!isAddressSearchOpen) return

    const loadScript = () => {
      return new Promise<void>((resolve) => {
        if ((window as any).daum?.Postcode) {
          resolve()
          return
        }
        const script = document.createElement('script')
        script.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'
        script.onload = () => resolve()
        document.body.appendChild(script)
      })
    }

    const initPostcode = async () => {
      await loadScript()
      const container = document.getElementById('daum-postcode-container')
      if (container && (window as any).daum?.Postcode) {
        container.innerHTML = ''
        new (window as any).daum.Postcode({
          oncomplete: handleAddressComplete,
          width: '100%',
          height: '100%',
        }).embed(container)
      }
    }

    initPostcode()
  }, [isAddressSearchOpen, handleAddressComplete])

  // 장바구니 조회
  const fetchCart = useCallback(async () => {
    if (!user?.id) return
    setIsLoading(true)
    try {
      const response = await storeCartApi.getList()
      if (response.success && response.data) {
        const cartItems = Array.isArray(response.data) ? response.data : (response.data as any).items || []
        setItems(cartItems)
      }
    } catch (error) {
      console.error('장바구니 조회 실패:', error)
    } finally {
      setIsLoading(false)
    }
  }, [user?.id])

  // 배송지 조회
  const fetchAddresses = useCallback(async () => {
    if (!user?.id) return
    setIsLoadingAddresses(true)
    try {
      const response = await storeCartApi.getShippingAddresses()
      if (response.success && response.data) {
        const addresses = Array.isArray(response.data) ? response.data : (response.data as any).addresses || []
        setShippingAddresses(addresses)
        const defaultAddr = addresses.find((a: ShippingAddress) => a.is_default)
        if (defaultAddr && !selectedAddressId) {
          setSelectedAddressId(defaultAddr.id)
        }
      }
    } catch (error) {
      console.error('배송지 조회 실패:', error)
    } finally {
      setIsLoadingAddresses(false)
    }
  }, [user?.id, selectedAddressId])

  // 초기 로딩 - 한 번만 실행
  useEffect(() => {
    if (user?.id) {
      fetchCart()
      fetchAddresses()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  // 전역 헤더의 '전체 삭제' 버튼 이벤트 리스너
  useEffect(() => {
    const onClearCart = () => {
      if (items.length > 0) {
        handleClearCart()
      }
    }
    window.addEventListener('clearCart', onClearCart)
    return () => window.removeEventListener('clearCart', onClearCart)
  }, [items.length])

  // 수량 변경
  const handleQuantityChange = async (item: CartItem, delta: number) => {
    const newQuantity = item.quantity + delta
    if (newQuantity <= 0) {
      handleRemoveItem(item.id)
      return
    }

    setIsUpdating(item.id)
    try {
      const response = await storeCartApi.updateItem(item.id, { quantity: newQuantity })
      if (response.success) {
        setItems(prev => prev.map(i => i.id === item.id ? { ...i, quantity: newQuantity } : i))
      } else {
        toast.error(response.error?.message || '수량 변경에 실패했습니다')
      }
    } catch (error) {
      toast.error('수량 변경에 실패했습니다')
    } finally {
      setIsUpdating(null)
    }
  }

  // 상품 삭제
  const handleRemoveItem = async (itemId: string) => {
    setIsUpdating(itemId)
    try {
      const response = await storeCartApi.removeItem(itemId)
      if (response.success) {
        setItems(prev => prev.filter(i => i.id !== itemId))
        toast.success('상품이 삭제되었습니다')
      } else {
        toast.error(response.error?.message || '삭제에 실패했습니다')
      }
    } catch (error) {
      toast.error('삭제에 실패했습니다')
    } finally {
      setIsUpdating(null)
    }
  }

  // 전체 비우기
  const handleClearCart = async () => {
    try {
      const response = await storeCartApi.clearCart()
      if (response.success) {
        setItems([])
      toast.success('장바구니를 비웠습니다')
      } else {
        toast.error(response.error?.message || '장바구니 비우기에 실패했습니다')
      }
    } catch (error) {
      toast.error('장바구니 비우기에 실패했습니다')
    }
  }

  // 배송지 추가
  const handleAddAddress = async () => {
    if (!newAddress.name || !newAddress.phone || !newAddress.address || !newAddress.postal_code) {
      toast.error('필수 정보를 모두 입력해주세요')
      return
    }

    setIsSavingAddress(true)
    try {
      const response = await storeCartApi.createShippingAddress(newAddress)
      if (response.success) {
        toast.success('배송지가 추가되었습니다')
        setIsAddAddressSheetOpen(false)
        setNewAddress({ name: '', phone: '', address: '', address_detail: '', postal_code: '', is_default: false })
        fetchAddresses()
      } else {
        toast.error(response.error?.message || '배송지 추가에 실패했습니다')
      }
    } catch (error) {
      toast.error('배송지 추가에 실패했습니다')
    } finally {
      setIsSavingAddress(false)
    }
  }

  // 배송지 삭제
  const handleDeleteAddress = async (addressId: string) => {
    try {
      const response = await storeCartApi.deleteShippingAddress(addressId)
      if (response.success) {
        toast.success('배송지가 삭제되었습니다')
        if (selectedAddressId === addressId) {
          setSelectedAddressId(null)
        }
        fetchAddresses()
      } else {
        toast.error(response.error?.message || '배송지 삭제에 실패했습니다')
      }
    } catch (error) {
      toast.error('배송지 삭제에 실패했습니다')
    }
  }

  // 필수 옵션 미선택 아이템 검출
  const getItemsMissingRequiredOptions = useCallback(() => {
    return items.filter(item => {
      const options = (item.product as any)?.options as Array<{
        option_id: string;
        name: string;
        option_type: string;
        is_required: boolean;
      }> | undefined
      if (!options || options.length === 0) return false
      
      const requiredOptions = options.filter(opt => opt.is_required)
      if (requiredOptions.length === 0) return false
      
      const selectedOptions = (item as any).selected_options as Array<{ option_id: string }> | undefined
      if (!selectedOptions || selectedOptions.length === 0) return requiredOptions.length > 0
      
      // 필수 옵션 중 선택되지 않은 것이 있는지 확인
      return requiredOptions.some(reqOpt => 
        !selectedOptions.some(selOpt => selOpt.option_id === reqOpt.option_id)
      )
    })
  }, [items])

  // 주문하기
  const handleCheckout = async () => {
    if (items.length === 0) {
      toast.error('장바구니가 비어있습니다')
      return
    }

    // 필수 옵션 미선택 검사
    const itemsMissingOptions = getItemsMissingRequiredOptions()
    if (itemsMissingOptions.length > 0) {
      const productNames = itemsMissingOptions.map(item => item.product?.name).filter(Boolean).join(', ')
      toast.error(`옵션을 선택해주세요: ${productNames}`)
      return
    }

    // 택배 상품이 있는지 확인
    const hasDeliveryItem = items.some(item => item.product?.product_type === 'delivery')

    if (hasDeliveryItem) {
      if (useDirectInput) {
        if (!directAddress.name || !directAddress.phone || !directAddress.address || !directAddress.postal_code) {
          toast.error('배송지 정보를 입력해주세요')
          return
        }
      } else if (!selectedAddressId) {
        toast.error('배송지를 선택해주세요')
        return
      }
    }

    setIsCheckingOut(true)
    try {
      let checkoutData: any = {}

      if (hasDeliveryItem) {
        if (useDirectInput) {
          checkoutData = {
            recipient_name: directAddress.name,
            recipient_phone: directAddress.phone,
            recipient_address: directAddress.address,
            recipient_address_detail: directAddress.address_detail,
            recipient_postal_code: directAddress.postal_code,
            delivery_memo: deliveryMemo,
          }
        } else {
          checkoutData = {
            shipping_address_id: selectedAddressId,
            delivery_memo: deliveryMemo,
          }
        }
      }

      const response = await storeCartApi.checkout(checkoutData)
      if (response.success) {
        toast.success('주문이 완료되었습니다')
        setItems([])
        const orderId = (response.data as any)?.order_id
        if (orderId) {
          navigate({ to: `/store/orders/${orderId}` })
        } else {
          navigate({ to: '/mypage/purchases' })
        }
      } else {
        toast.error(response.error?.message || '주문에 실패했습니다')
      }
    } catch (error: any) {
      toast.error(error.message || '주문에 실패했습니다')
    } finally {
      setIsCheckingOut(false)
    }
  }

  // 도서산간 지역 판별 함수 (우편번호 기준)
  const isRemoteArea = useCallback((postalCode: string | undefined) => {
    if (!postalCode) return false
    const code = postalCode.replace(/[^0-9]/g, '')
    const num = parseInt(code, 10)
    // 제주도: 63000-63644, 울릉도: 40200-40240, 백령도 등 주요 도서지역
    if (num >= 63000 && num <= 63644) return true // 제주
    if (num >= 40200 && num <= 40240) return true // 울릉
    if (num >= 23100 && num <= 23136) return true // 백령도/대청도/소청도
    if (num >= 22386 && num <= 22388) return true // 옹진 연평도
    return false
  }, [])

  // 현재 선택된 배송지 (fallback: 기본 배송지 → 첫 번째 배송지)
  const selectedAddressForShipping = useMemo(() => {
    if (useDirectInput) return null
    const selected = shippingAddresses.find(a => a.id === selectedAddressId)
    if (selected) return selected
    // fallback: 기본 배송지 또는 첫 번째 배송지
    return shippingAddresses.find(a => a.is_default) || shippingAddresses[0] || null
  }, [shippingAddresses, selectedAddressId, useDirectInput])

  // 현재 우편번호 (직접입력 또는 선택된 배송지)
  const currentPostalCode = useMemo(() => {
    if (useDirectInput) return directAddress.postal_code
    return selectedAddressForShipping?.postal_code || ''
  }, [useDirectInput, directAddress.postal_code, selectedAddressForShipping])

  // 도서산간 지역 여부
  const isCurrentRemoteArea = useMemo(() => isRemoteArea(currentPostalCode), [isRemoteArea, currentPostalCode])

  // 묶음 배송 가능한 상품 그룹화 (source별로 분리 - collaboration / 일반)
  const groupedItems = useMemo(() => {
    const collabTempBundle: CartItem[] = []
    const collabNonBundle: CartItem[] = []
    const normalTempBundle: CartItem[] = []
    const normalNonBundle: CartItem[] = []
    const otherItems: CartItem[] = []
    
    items.forEach(item => {
      if (item.product?.product_type === 'delivery') {
        const isCollab = (item.product as any)?.source === 'collaboration'
        const isBundleAvailable = (item.product as any)?.is_bundle_available
        
        if (isCollab) {
          if (isBundleAvailable) {
            collabTempBundle.push(item)
          } else {
            collabNonBundle.push(item)
          }
        } else {
          if (isBundleAvailable) {
            normalTempBundle.push(item)
          } else {
            normalNonBundle.push(item)
          }
        }
      } else {
        otherItems.push(item)
      }
    })
    
    // 묶음 배송 가능 상품이 2개 미만이면 개별 배송에 포함
    const collabBundleItems = collabTempBundle.length >= 2 ? collabTempBundle : []
    if (collabTempBundle.length < 2) {
      collabNonBundle.push(...collabTempBundle)
    }
    
    const normalBundleItems = normalTempBundle.length >= 2 ? normalTempBundle : []
    if (normalTempBundle.length < 2) {
      normalNonBundle.push(...normalTempBundle)
    }
    
    return { 
      collabBundleItems, 
      collabNonBundle, 
      normalBundleItems, 
      normalNonBundle, 
      otherItems 
    }
  }, [items])

  // 상품의 기본배송비 + 도서산간 추가 배송비 계산
  const getItemShippingFee = useCallback((item: CartItem) => {
    const baseFee = (item.product as any)?.shipping_fee_base || 0
    const remoteFee = isCurrentRemoteArea ? ((item.product as any)?.shipping_fee_remote || 0) : 0
    return baseFee + remoteFee
  }, [isCurrentRemoteArea])

  // collaboration 묶음 배송비 (최대 배송비 적용)
  const collabBundleShippingFee = useMemo(() => {
    if (groupedItems.collabBundleItems.length === 0) return 0
    return Math.max(
      ...groupedItems.collabBundleItems.map(item => getItemShippingFee(item))
    )
  }, [groupedItems.collabBundleItems, getItemShippingFee])

  // 일반 묶음 배송비 (최대 배송비 적용)
  const normalBundleShippingFee = useMemo(() => {
    if (groupedItems.normalBundleItems.length === 0) return 0
    return Math.max(
      ...groupedItems.normalBundleItems.map(item => getItemShippingFee(item))
    )
  }, [groupedItems.normalBundleItems, getItemShippingFee])

  // collaboration 개별 배송비 합계
  const collabIndividualShippingFee = useMemo(() => {
    return groupedItems.collabNonBundle.reduce(
      (sum, item) => sum + getItemShippingFee(item),
      0
    )
  }, [groupedItems.collabNonBundle, getItemShippingFee])

  // 일반 개별 배송비 합계
  const normalIndividualShippingFee = useMemo(() => {
    return groupedItems.normalNonBundle.reduce(
      (sum, item) => sum + getItemShippingFee(item),
      0
    )
  }, [groupedItems.normalNonBundle, getItemShippingFee])

  // 총 배송비
  const totalShippingFee = collabBundleShippingFee + normalBundleShippingFee + collabIndividualShippingFee + normalIndividualShippingFee

  // 총 상품 금액 (옵션 가격 포함)
  const getSubtotal = () => {
    return items.reduce((total, item) => {
      const basePrice = item.product?.price || 0
      const optionPrice = calculateItemOptionPrice(item)
      return total + (basePrice + optionPrice) * item.quantity
    }, 0)
  }

  // 총 금액 계산 (상품 + 배송비)
  const getTotalPrice = () => {
    return getSubtotal() + totalShippingFee
  }

  if (!user) {
    return (
      <div className={`flex flex-col items-center justify-center ${isMobile ? 'h-full pt-16' : 'min-h-screen'}`}>
        <Typography variant="body1" className="text-gray-500">
          로그인이 필요합니다
        </Typography>
        <Button className="mt-4" onClick={() => navigate({ to: '/login' })}>
          로그인
        </Button>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className={`flex flex-col items-center justify-center ${isMobile ? 'h-full pt-16' : 'min-h-screen'}`}>
        <Loader2 className="h-8 w-8 animate-spin text-[#FE3A8F]" />
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className={`flex flex-col ${isMobile ? 'h-full pt-14' : 'min-h-screen'}`}>
        <div className="flex flex-1 flex-col items-center justify-center p-6">
          <ShoppingCart className="h-16 w-16 text-gray-300 mb-4" />
          <Typography variant="body1" className="text-gray-500 text-center">
            장바구니가 비어있습니다
          </Typography>
          <Button variant="outline" className="mt-6" onClick={() => navigate({ to: '/feed/all' })}>
            쇼핑하러 가기
          </Button>
        </div>
      </div>
    )
  }

  const totalPrice = getTotalPrice()
  const firstProduct = items[0]?.product as any
  const partner = firstProduct?.partner
  const partnerName = partner?.name || partner?.partner_name || firstProduct?.partner_name || '파트너'
  const partnerAvatar = partner?.profile_image || partner?.avatar || firstProduct?.partner_avatar
  const partnerMemberCode = partner?.member_code
  const hasDeliveryItem = items.some(item => item.product?.product_type === 'delivery')
  const selectedAddress = shippingAddresses.find(a => a.id === selectedAddressId)

  return (
    <div className={`flex flex-col ${isMobile ? 'h-full pt-14' : 'min-h-screen'}`}>
      <div className={`flex-1 overflow-y-auto ${isMobile ? 'pb-62' : 'pb-40'}`}>
        <div className="p-4">
          {/* 파트너 정보 */}
          <div className="flex items-center gap-2 mb-4">
            <AvatarWithFallback
              src={partnerAvatar}
              name={partnerName}
              size="sm"
            />
            <div>
            <Typography variant="body2" className="font-semibold text-gray-700">
              {partnerName}
            </Typography>
              {partnerMemberCode && (
                <Typography variant="caption" className="text-gray-400">
                  @{partnerMemberCode}
                </Typography>
              )}
            </div>
          </div>

          {/* 콜라보 묶음 배송 상품 */}
          {groupedItems.collabBundleItems.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">콜라보 묶음배송</span>
                <Typography variant="caption" className="text-gray-500">
                  배송비 {collabBundleShippingFee.toLocaleString()}P (최대 배송비 적용)
                </Typography>
              </div>
              <div className="space-y-3">
                {groupedItems.collabBundleItems.map((item) => (
                  <CartItemCard
                    key={item.id}
                    item={item}
                    isUpdating={isUpdating === item.id}
                    onQuantityChange={(delta) => handleQuantityChange(item, delta)}
                    onRemove={() => handleRemoveItem(item.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 콜라보 개별 배송 상품 - 묶음배송 가능(1개만 있음) vs 개별배송 전용 */}
          {(() => {
            const collabBundleSingle = groupedItems.collabNonBundle.filter(item => (item.product as any)?.is_bundle_available)
            const collabIndividualOnly = groupedItems.collabNonBundle.filter(item => !(item.product as any)?.is_bundle_available)
            return (
              <>
                {collabBundleSingle.length > 0 && (
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="px-2 py-1 bg-purple-50 text-purple-600 text-xs font-medium rounded-full">콜라보 묶음배송 가능</span>
                      <Typography variant="caption" className="text-gray-500">
                        2개 이상 구매 시 묶음배송 적용
                      </Typography>
                    </div>
                    <div className="space-y-3">
                      {collabBundleSingle.map((item) => (
                        <CartItemCard
                          key={item.id}
                          item={item}
                          isUpdating={isUpdating === item.id}
                          onQuantityChange={(delta) => handleQuantityChange(item, delta)}
                          onRemove={() => handleRemoveItem(item.id)}
                          showShippingFee
                        />
                      ))}
                    </div>
                  </div>
                )}
                {collabIndividualOnly.length > 0 && (
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="px-2 py-1 bg-purple-50 text-purple-600 text-xs font-medium rounded-full">콜라보 개별배송</span>
                      <Typography variant="caption" className="text-gray-500">
                        배송비 각각 부과
                      </Typography>
                    </div>
                    <div className="space-y-3">
                      {collabIndividualOnly.map((item) => (
                        <CartItemCard
                          key={item.id}
                          item={item}
                          isUpdating={isUpdating === item.id}
                          onQuantityChange={(delta) => handleQuantityChange(item, delta)}
                          onRemove={() => handleRemoveItem(item.id)}
                          showShippingFee
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )
          })()}

          {/* 일반 묶음 배송 상품 */}
          {groupedItems.normalBundleItems.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">묶음배송</span>
                <Typography variant="caption" className="text-gray-500">
                  배송비 {normalBundleShippingFee.toLocaleString()}P (최대 배송비 적용)
                </Typography>
              </div>
              <div className="space-y-3">
                {groupedItems.normalBundleItems.map((item) => (
                  <CartItemCard
                    key={item.id}
                    item={item}
                    isUpdating={isUpdating === item.id}
                    onQuantityChange={(delta) => handleQuantityChange(item, delta)}
                    onRemove={() => handleRemoveItem(item.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 일반 개별 배송 상품 - 묶음배송 가능(1개만 있음) */}
          {(() => {
            const normalBundleSingle = groupedItems.normalNonBundle.filter(item => (item.product as any)?.is_bundle_available)
            const normalIndividualOnly = groupedItems.normalNonBundle.filter(item => !(item.product as any)?.is_bundle_available)
            return (
              <>
                {normalBundleSingle.length > 0 && (
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="px-2 py-1 bg-blue-50 text-blue-600 text-xs font-medium rounded-full">묶음배송 가능</span>
                      <Typography variant="caption" className="text-gray-500">
                        2개 이상 구매 시 묶음배송 적용
                      </Typography>
                    </div>
                    <div className="space-y-3">
                      {normalBundleSingle.map((item) => (
                        <CartItemCard
                          key={item.id}
                          item={item}
                          isUpdating={isUpdating === item.id}
                          onQuantityChange={(delta) => handleQuantityChange(item, delta)}
                          onRemove={() => handleRemoveItem(item.id)}
                          showShippingFee
                        />
                      ))}
                    </div>
                  </div>
                )}
                {normalIndividualOnly.length > 0 && (
                  <div className="mb-6">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">개별배송</span>
                      <Typography variant="caption" className="text-gray-500">
                        배송비 각각 부과
                      </Typography>
                    </div>
                    <div className="space-y-3">
                      {normalIndividualOnly.map((item) => (
                        <CartItemCard
                          key={item.id}
                          item={item}
                          isUpdating={isUpdating === item.id}
                          onQuantityChange={(delta) => handleQuantityChange(item, delta)}
                          onRemove={() => handleRemoveItem(item.id)}
                          showShippingFee
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )
          })()}

          {/* 디지털/현장수령 상품 */}
          {groupedItems.otherItems.length > 0 && (
            <div className="mb-6">
              {(groupedItems.collabBundleItems.length > 0 || groupedItems.collabNonBundle.length > 0 || 
                groupedItems.normalBundleItems.length > 0 || groupedItems.normalNonBundle.length > 0) && (
                <div className="flex items-center gap-2 mb-3">
                  <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">디지털/현장수령</span>
                </div>
              )}
              <div className="space-y-3">
                {groupedItems.otherItems.map((item) => (
                  <CartItemCard
                    key={item.id}
                    item={item}
                    isUpdating={isUpdating === item.id}
                    onQuantityChange={(delta) => handleQuantityChange(item, delta)}
                    onRemove={() => handleRemoveItem(item.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 배송지 선택 (택배 상품이 있는 경우) */}
          {hasDeliveryItem && (
            <div className="mt-6">
              <Typography variant="body1" className="font-semibold mb-3">
                배송지
                    </Typography>
                  
              {/* 저장된 배송지 사용 / 직접 입력 토글 */}
              <div className="flex gap-2 mb-3">
                    <button
                  onClick={() => setUseDirectInput(false)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium ${!useDirectInput ? 'bg-[#FE3A8F] text-white' : 'bg-gray-100 text-gray-600'}`}
                    >
                  저장된 배송지
                    </button>
                    <button
                  onClick={() => setUseDirectInput(true)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium ${useDirectInput ? 'bg-[#FE3A8F] text-white' : 'bg-gray-100 text-gray-600'}`}
                    >
                  직접 입력
                    </button>
                  </div>

              {useDirectInput ? (
                <div className="space-y-3 bg-gray-50 p-4 rounded-xl">
                  <Input
                    placeholder="받는 분 *"
                    value={directAddress.name}
                    onChange={(e) => setDirectAddress(prev => ({ ...prev, name: e.target.value }))}
                  />
                  <Input
                    placeholder="연락처 * (숫자만 입력)"
                    value={directAddress.phone}
                    onChange={(e) => {
                      const value = e.target.value.replace(/[^0-9-]/g, '')
                      setDirectAddress(prev => ({ ...prev, phone: value }))
                    }}
                    inputMode="tel"
                  />
                  <div className="flex gap-2">
                    <Input
                      placeholder="우편번호 *"
                      value={directAddress.postal_code}
                      readOnly
                      className="flex-1 bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => openAddressSearch('direct')}
                      className="px-4 py-2 bg-[#FE3A8F] text-white rounded-lg flex items-center gap-2 whitespace-nowrap text-sm font-medium"
                    >
                      <Search className="h-4 w-4" />
                      주소 검색
                    </button>
                  </div>
                  <Input
                    placeholder="주소 *"
                    value={directAddress.address}
                    readOnly
                    className="bg-white"
                  />
                  <Input
                    placeholder="상세주소"
                    value={directAddress.address_detail}
                    onChange={(e) => setDirectAddress(prev => ({ ...prev, address_detail: e.target.value }))}
                  />
                </div>
              ) : (
                <div
                  onClick={() => setIsAddressSheetOpen(true)}
                  className="p-4 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100"
                >
                  {selectedAddress ? (
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <Typography variant="body2" className="font-medium">{selectedAddress.name}</Typography>
                          <Typography variant="caption" className="text-gray-500">{selectedAddress.phone}</Typography>
                        </div>
                        <Typography variant="caption" className="text-gray-600 mt-1">
                          {selectedAddress.address} {selectedAddress.address_detail}
                        </Typography>
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-gray-500">
                        <MapPin className="h-5 w-5" />
                        <span>배송지를 선택해주세요</span>
                      </div>
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    </div>
                  )}
                </div>
              )}

              {/* 배송 메모 */}
              <div className="mt-3 space-y-2">
                <select
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FE3A8F]/50 bg-white"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) setDeliveryMemo(e.target.value)
                  }}
                >
                  <option value="">배송 요청사항 선택</option>
                  <option value="문 앞에 놓아주세요">문 앞에 놓아주세요</option>
                  <option value="경비실에 맡겨주세요">경비실에 맡겨주세요</option>
                  <option value="부재시 연락 부탁드립니다">부재시 연락 부탁드립니다</option>
                  <option value="배송 전 연락 부탁드립니다">배송 전 연락 부탁드립니다</option>
                  <option value="직접 수령할게요">직접 수령할게요</option>
                </select>
                <Input
                  placeholder="직접 입력"
                  value={deliveryMemo}
                  onChange={(e) => setDeliveryMemo(e.target.value)}
                />
              </div>
          </div>
          )}
        </div>
      </div>

      {/* 하단 고정 영역 */}
      <div className={`fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 ${isMobile ? 'pb-24' : 'pb-6'}`}>
        <div className="max-w-lg mx-auto">
          <div className="space-y-2 mb-3">
            <div className="flex items-center justify-between">
              <Typography variant="caption" className="text-gray-500">상품 금액</Typography>
              <Typography variant="body2">{getSubtotal().toLocaleString()}P</Typography>
            </div>
            {totalShippingFee > 0 && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <Typography variant="caption" className="text-gray-500">
                    배송비{isCurrentRemoteArea && ' (도서산간 포함)'}
                  </Typography>
                  <Typography variant="body2">{totalShippingFee.toLocaleString()}P</Typography>
                </div>
                {isCurrentRemoteArea && (
                  <Typography variant="caption" className="text-orange-500">
                    * 도서산간 지역으로 추가 배송비가 적용되었습니다
                  </Typography>
                )}
              </div>
            )}
            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <Typography variant="body1" className="font-semibold">총 결제금액</Typography>
            <Typography variant="h5" className="text-[#FE3A8F]">
              {totalPrice.toLocaleString()}P
            </Typography>
            </div>
          </div>
          <Button
            className="w-full !bg-[#FE3A8F] hover:!bg-[#e8338a] !text-white py-3"
            onClick={handleCheckout}
            disabled={isCheckingOut}
          >
            {isCheckingOut ? <Loader2 className="h-5 w-5 animate-spin" /> : '주문하기'}
          </Button>
        </div>
      </div>

      {/* 배송지 선택 시트 */}
      <SlideSheet
        isOpen={isAddressSheetOpen}
        onClose={() => setIsAddressSheetOpen(false)}
        title="배송지 선택"
      >
        <div className="p-4">
          <Button
            variant="outline"
            className="w-full mb-4"
            onClick={() => {
              setIsAddressSheetOpen(false)
              setIsAddAddressSheetOpen(true)
            }}
          >
            <MapPin className="h-4 w-4 mr-2" />
            새 배송지 추가
          </Button>

          {isLoadingAddresses ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-[#FE3A8F]" />
            </div>
          ) : shippingAddresses.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              저장된 배송지가 없습니다
            </div>
          ) : (
            <div className="space-y-3">
              {shippingAddresses.map((address) => (
                <div
                  key={address.id}
                  onClick={() => {
                    setSelectedAddressId(address.id)
                    setIsAddressSheetOpen(false)
                  }}
                  className={`p-4 rounded-xl cursor-pointer border-2 transition-colors ${
                    selectedAddressId === address.id ? 'border-[#FE3A8F] bg-pink-50' : 'border-gray-100 hover:border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Typography variant="body2" className="font-medium">{address.name}</Typography>
                        {address.is_default && (
                          <span className="px-2 py-0.5 bg-[#FE3A8F] text-white text-xs rounded-full">기본</span>
                        )}
                      </div>
                      <Typography variant="caption" className="text-gray-500">{address.phone}</Typography>
                      <Typography variant="caption" className="text-gray-600 mt-1 block">
                        {address.address} {address.address_detail}
                      </Typography>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteAddress(address.id)
                      }}
                      className="p-1 text-gray-400 hover:text-red-500"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </SlideSheet>

      {/* 배송지 추가 시트 */}
      <SlideSheet
        isOpen={isAddAddressSheetOpen}
        onClose={() => setIsAddAddressSheetOpen(false)}
        title="새 배송지 추가"
        footer={
          <div className="flex gap-3 px-4">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setIsAddAddressSheetOpen(false)}
            >
              취소
            </Button>
            <Button
              className="flex-1 !bg-[#FE3A8F] !text-white"
              onClick={handleAddAddress}
              disabled={isSavingAddress}
            >
              {isSavingAddress ? <Loader2 className="h-4 w-4 animate-spin" /> : '저장'}
            </Button>
          </div>
        }
      >
        <div className="p-4 space-y-3">
          <Input
            placeholder="받는 분 *"
            value={newAddress.name}
            onChange={(e) => setNewAddress(prev => ({ ...prev, name: e.target.value }))}
          />
          <Input
            placeholder="연락처 * (숫자만 입력)"
            value={newAddress.phone}
            onChange={(e) => {
              const value = e.target.value.replace(/[^0-9-]/g, '')
              setNewAddress(prev => ({ ...prev, phone: value }))
            }}
            inputMode="tel"
          />
          <div className="flex gap-2">
            <Input
              placeholder="우편번호 *"
              value={newAddress.postal_code}
              readOnly
              className="flex-1 bg-gray-50"
            />
            <button
              type="button"
              onClick={() => openAddressSearch('new')}
              className="px-4 py-2 bg-[#FE3A8F] text-white rounded-lg flex items-center gap-2 whitespace-nowrap text-sm font-medium"
            >
              <Search className="h-4 w-4" />
              주소 검색
            </button>
          </div>
          <Input
            placeholder="주소 *"
            value={newAddress.address}
            readOnly
            className="bg-gray-50"
          />
          <Input
            placeholder="상세주소"
            value={newAddress.address_detail}
            onChange={(e) => setNewAddress(prev => ({ ...prev, address_detail: e.target.value }))}
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={newAddress.is_default}
              onChange={(e) => setNewAddress(prev => ({ ...prev, is_default: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300 text-[#FE3A8F] focus:ring-[#FE3A8F]"
            />
            <span className="text-sm text-gray-700">기본 배송지로 설정</span>
          </label>
        </div>
      </SlideSheet>

      {/* 주소 검색 모달 */}
      {isAddressSearchOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
          <div className="bg-white w-full max-w-md h-[500px] rounded-xl overflow-hidden flex flex-col mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <Typography variant="body1" className="font-semibold">주소 검색</Typography>
              <button
                type="button"
                onClick={() => setIsAddressSearchOpen(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div id="daum-postcode-container" className="flex-1" />
          </div>
        </div>
      )}
    </div>
  )
}
