import { useEffect, useState } from 'react'
import { Check, ChevronRight, X } from 'lucide-react'
import { loadTossPayments } from '@tosspayments/tosspayments-sdk'
import { Button, Flex, Typography, SlideSheet } from '@/components'
import { useAuth } from '@/hooks/useAuth'
import { useMemberPoints } from '@/hooks/useMemberPoints'
import { PointsHistoryList } from '@/components/modals/PointsHistoryModal'
import { Capacitor } from '@capacitor/core'
import { useInAppPurchase } from '@/hooks/useInAppPurchase'
import { toast } from '@/lib/toast'
import { supabase } from '@/lib/supabase'

// 전자금융거래 이용약관 내용
const ELECTRONIC_FINANCE_TERMS = `전자금융거래 이용약관 동의

제 1 조 (목적)
이 약관은 주식회사 IKY(이하 '회사'라 합니다)이 제공하는 전자지급결제대행서비스를 이용자가 이용함에 있어 회사와 이용자 사이의 전자금융거래에 관한 기본적인 사항을 정함을 목적으로 합니다.

제 2 조 (용어의 정의)
이 약관에서 정하는 용어의 정의는 다음과 같습니다.

'전자금융거래'라 함은 회사가 전자적 장치를 통하여 전자지급결제대행(이하 '전자금융거래 서비스'라고 합니다)을 제공하고 이용자가 회사의 종사자와 직접 대면하거나 의사소통을 하지 아니하고 자동화된 방식으로 이를 이용하는 거래를 말합니다.

'전자지급결제대행서비스'라 함은 전자적 방법으로 재화의 구입 또는 용역의 이용에 있어서 지급결제정보를 송신하거나 수신하는 것 또는 그 대가의 정산을 대행하거나 매개하는 서비스를 말합니다.

'가맹점'이라 함은 금융기관 또는 전자금융업자와의 계약에 따라 직불전자지급수단이나 선불전자지급수단 또는 전자화폐에 의한 거래에 있어서 이용자에게 재화 또는 용역을 제공하는 자로서 금융기관 또는 전자금융업자가 아닌 자를 말합니다.

'이용자'라 함은 이 약관에 동의하고 회사가 제공하는 전자금융거래 서비스를 이용하는 자를 말합니다.

'접근매체'라 함은 전자금융거래에 있어서 거래지시를 하거나 이용자 및 거래내용의 진실성과 정확성을 확보하기 위하여 사용되는 수단 또는 정보로서 전자식 카드 및 이에 준하는 전자적 정보(신용카드 번호를 포함합니다), '전자서명법'상의 인증서, 회사에 등록된 이용자번호, 이용자의 생체정보, 이상의 수단이나 정보를 사용하는데 필요한 비밀번호 등 전자금융거래법 제2조 제10호에서 정하고 있는 것을 말합니다.

'거래지시'라 함은 이용자가 본 약관에 의하여 체결되는 전자금융거래계약에 따라 회사에 대하여 전자금융거래의 처리를 지시하는 것을 말합니다.

'오류'라 함은 이용자의 고의 또는 과실없이 전자금융거래가 전자금융거래계약 또는 이용자의 거래지시에 따라 이행되지 아니한 경우를 말합니다.

제 3 조 (약관의 명시 및 변경)
회사는 이용자가 전자금융거래 서비스를 이용하기 전에 이 약관을 게시하고 이용자가 이 약관의 중요한 내용을 확인할 수 있도록 합니다.

회사는 이용자의 요청이 있는 경우 전자문서의 전송방식에 의하여 본 약관의 사본을 이용자에게 교부합니다.

회사가 약관을 변경하는 때에는 그 시행일 1개월 이전에 변경되는 약관을 회사가 제공하는 전자금융거래 서비스 이용 초기화면 및 회사의 홈페이지에 게시함으로써 이용자에게 공지합니다.

제 4 조 (전자지급결제대행서비스의 종류)
계좌출금 대행서비스 : 이용자가 결제대금을 회사의 전자결제시스템을 통하여 금융기관의 펌뱅킹실시간출금이체서비스를 이용하여 자신의 계좌에서 출금하여 결제하는 서비스를 말합니다.

신용카드 결제대행서비스 : 이용자가 결제대금의 지급을 위하여 제공한 지급결제수단이 신용카드인 경우로서 회사가 전자결제시스템을 통하여 신용카드 지불정보를 송, 수신하고 결제대금의 정산을 대행하거나 매개하는 서비스를 말합니다.

제 5 조 (이용시간)
회사는 이용자에게 연중무휴 1일 24시간 전자금융거래 서비스를 제공함을 원칙으로 합니다. 단, 금융기관 기타 결제수단 발행업자의 사정에 따라 달리 정할 수 있습니다.

제 6 조 (접근매체의 선정과 사용 및 관리)
회사는 전자금융거래 서비스 제공 시 접근매체를 선정하여 이용자의 신원, 권한 및 거래지시의 내용 등을 확인할 수 있습니다.

이용자는 접근매체를 제3자에게 대여하거나 사용을 위임하거나 양도 또는 담보 목적으로 제공할 수 없습니다.

제 7 조 (거래내역의 확인)
회사는 이용자와 미리 약정한 전자적 방법을 통하여 이용자의 거래내용을 확인할 수 있도록 하며 이용자의 요청이 있는 경우에는 요청을 받은 날로부터 2주 이내에 모사전송 등의 방법으로 거래내용에 관한 서면을 교부합니다.

제 8 조 (오류의 정정 등)
이용자는 전자금융거래 서비스를 이용함에 있어 오류가 있음을 안 때에는 회사에 대하여 그 정정을 요구할 수 있습니다.

회사는 전항의 규정에 따른 오류의 정정요구를 받은 때 또는 스스로 오류가 있음을 안 때에는 이를 즉시 조사하여 처리한 후 정정요구를 받은 날 또는 오류가 있음을 안 날부터 2주 이내에 그 결과를 이용자에게 알려 드립니다.

제 9 조 (회사의 책임)
접근매체의 위조나 변조로 발생한 사고로 인하여 이용자에게 발생한 손해에 대하여 배상책임이 있습니다.

제 10 조 (전자지급거래계약의 효력)
회사는 이용자의 거래지시가 전자지급거래에 관한 경우 그 지급절차를 대행하며 전자지급거래에 관한 거래지시의 내용을 전송하여 지급이 이루어지도록 합니다.

제 11 조 (거래지시의 철회)
이용자는 전자지급거래에 관한 거래지시의 경우 지급의 효력이 발생하기 전까지 거래지시를 철회할 수 있습니다.

제 15 조 (분쟁처리 및 분쟁조정)
이용자는 다음의 분쟁처리 책임자 및 담당자에 대하여 전자금융거래 서비스 이용과 관련한 의견 및 불만의 제기, 손해배상의 청구 등의 분쟁처리를 요구할 수 있습니다.

책임자 : 주식회사 IKY 대표이사 임문상
전화번호 : 010-8712-9811
주소 : 서울시 마포구 독막로6길 27 3층
이메일 : contact@mateyou.me
통신판매업 신고번호 : 2025-서울마포-2780

주식회사 IKY`

// 자동결제 서비스 이용약관
const AUTO_PAYMENT_TERMS = `자동결제 서비스 이용약관

제 1 조 (목적)
본 약관은 주식회사 IKY(이하 "회사")가 제공하는 자동결제 서비스의 이용과 관련하여 회사와 이용자 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.

제 2 조 (정의)
1. "자동결제 서비스"란 이용자가 등록한 결제수단을 통해 정기적으로 또는 이용자의 요청에 따라 자동으로 결제가 이루어지는 서비스를 말합니다.
2. "결제수단"이란 신용카드, 체크카드, 계좌이체 등 회사가 허용하는 결제 방법을 말합니다.

제 3 조 (서비스 이용)
1. 이용자는 자동결제 서비스 이용을 위해 결제수단을 등록해야 합니다.
2. 회사는 등록된 결제수단의 유효성을 확인할 수 있습니다.
3. 결제일에 결제가 실패한 경우, 회사는 이용자에게 통지하고 재결제를 시도할 수 있습니다.

제 4 조 (결제 및 취소)
1. 자동결제는 이용자가 지정한 주기에 따라 자동으로 진행됩니다.
2. 이용자는 다음 결제일 전까지 자동결제를 해지할 수 있습니다.
3. 결제 취소 및 환불은 회사의 환불 정책에 따릅니다.

제 5 조 (이용자의 의무)
1. 이용자는 결제수단 정보의 변경 시 즉시 회사에 통지해야 합니다.
2. 이용자는 결제수단의 유효성을 유지할 책임이 있습니다.

제 6 조 (서비스 해지)
1. 이용자는 언제든지 자동결제 서비스를 해지할 수 있습니다.
2. 해지 시 이미 결제된 금액에 대해서는 회사의 환불 정책이 적용됩니다.

책임자 : 주식회사 IKY 대표이사 임문상
전화번호 : 010-8712-9811
주소: 서울시 마포구 독막로6길 27 3층

주식회사 IKY`

// 개인정보 제공 및 위탁 안내
const PRIVACY_DELEGATION_TERMS = `개인정보 제공 및 위탁 안내

1. 개인정보 제3자 제공

회사는 결제 서비스 제공을 위해 아래와 같이 개인정보를 제3자에게 제공합니다.

제공받는 자: 주식회사 IKY, 각 카드사, 금융결제원
제공 목적: 결제 처리, 결제 대금 정산, 본인 확인
제공 항목: 성명, 연락처, 결제정보(카드번호, 유효기간 등)
보유 기간: 관련 법령에 따른 보존기간

2. 개인정보 처리 위탁

회사는 서비스 제공을 위해 아래와 같이 개인정보 처리를 위탁하고 있습니다.

수탁업체: 주식회사 IKY
위탁 업무: 전자결제대행 서비스
위탁 기간: 위탁 계약 종료 시까지

3. 이용자 권리

이용자는 개인정보 제공에 대한 동의를 거부할 권리가 있습니다. 다만, 동의를 거부할 경우 결제 서비스 이용이 제한될 수 있습니다.

4. 문의처

개인정보 관련 문의사항은 아래로 연락 주시기 바랍니다.

책임자 : 주식회사 IKY 대표이사 임문상
전화번호 : 010-8712-9811
주소: 서울시 마포구 독막로6길 27 3층
이메일: contact@mateyou.me

주식회사 IKY`

// 약관 모달 컴포넌트
function TermsModal({ 
  isOpen, 
  onClose, 
  title, 
  content 
}: { 
  isOpen: boolean
  onClose: () => void
  title: string
  content: string 
}) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl w-[90%] max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <Typography variant="h6" className="font-semibold">{title}</Typography>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed">
            {content}
          </pre>
        </div>
        <div className="p-4 border-t">
          <Button variant="primary" onClick={onClose} className="w-full">
            확인
          </Button>
        </div>
      </div>
    </div>
  )
}

interface ChargeModalProps {
  isOpen: boolean
  onClose: () => void
  onCharge: (points: number, amount: number) => Promise<void>
  preselectedPoints?: number | null
}

// 웹용 포인트 옵션 (토스페이먼츠)
const WEB_CHARGE_OPTIONS = [
  { points: 1000, baseAmount: 1000, tax: 100 },
  { points: 3000, baseAmount: 3000, tax: 300 },
  { points: 5000, baseAmount: 5000, tax: 500 },
  { points: 10000, baseAmount: 10000, tax: 1000 },
  { points: 30000, baseAmount: 30000, tax: 3000 },
  { points: 50000, baseAmount: 50000, tax: 5000 },
]

// iOS 네이티브용 포인트 옵션 (IAP)
// 포인트는 기존 값 유지, 결제 금액만 새로운 값으로 변경
const IOS_CHARGE_OPTIONS = [
  { points: 1000, baseAmount: 2000, tax: 200 },  // 1,000 포인트 → 2,200원
  { points: 3000, baseAmount: 5000, tax: 500 },  // 3,000 포인트 → 5,500원
  { points: 5000, baseAmount: 8000, tax: 800 },  // 5,000 포인트 → 8,800원
  { points: 10000, baseAmount: 13636, tax: 1364 }, // 10,000 포인트 → 15,000원
  { points: 30000, baseAmount: 50000, tax: 5000 }, // 30,000 포인트 → 55,000원
  { points: 50000, baseAmount: 90000, tax: 9000 }, // 50,000 포인트 → 99,000원
]

// IAP 제품 ID 매핑 (App Store Connect에 등록된 기존 제품 ID 유지)
const IAP_PRODUCT_IDS: Record<number, string> = {
  1000: 'com.mateyou.app.points.1000',
  3000: 'com.mateyou.app.points.3000',
  5000: 'com.mateyou.app.points.5000',
  10000: 'com.mateyou.app.points.10000',
  30000: 'com.mateyou.app.points.30000',
  50000: 'com.mateyou.app.points.50000',
}

// 환경변수에서 토스페이먼츠 키 가져오기
// 개발 환경에서는 테스트 키, 프로덕션에서는 라이브 키 사용
const clientKey = import.meta.env.DEV
  ? import.meta.env.VITE_TOSS_PAY_CLIENT_KEY || 'test_ck_0RnYX2w532zyw5deoGog3NeyqApQ'
  : import.meta.env.VITE_TOSS_PAY_CLIENT_KEY_REAL || 'live_ck_Ba5PzR0ArnBo5vbKoX6XrvmYnNeD'
const customerKey = 'KqG_3ZGBRMueof0IA3w2J'

export function ChargeModal({
  isOpen,
  onClose,
  onCharge: _,
  preselectedPoints,
}: ChargeModalProps) {
  const { user } = useAuth()
  const { pointsHistory, isLoading: historyLoading } = useMemberPoints(user?.id || '')
  
  const { products: iapProducts, fetchProducts: fetchIapProducts, purchase: purchaseIap, loading: iapLoading } = useInAppPurchase()
  
  // iOS 네이티브인지 확인 (모든 경로에서 IAP 사용)
  const isIOSNative = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios'
  const shouldUseIAP = isIOSNative
  
  // iOS 네이티브일 때는 iOS 전용 옵션, 웹일 때는 웹 옵션 사용
  const CHARGE_OPTIONS = shouldUseIAP ? IOS_CHARGE_OPTIONS : WEB_CHARGE_OPTIONS
  
  const [selectedOption, setSelectedOption] = useState<
    (typeof IOS_CHARGE_OPTIONS)[0] | (typeof WEB_CHARGE_OPTIONS)[0] | null
  >(null)
  const [isLoading, setIsLoading] = useState(false)
  const [payment, setPayment] = useState<any>(null)
  const [activeTab, setActiveTab] = useState<'charge' | 'history'>('charge')
  
  // 약관 동의 상태
  const [agreements, setAgreements] = useState({
    purchase: false,
    electronicFinance: false,
    autoPayment: false,
    privacyDelegation: false,
  })
  
  // 약관 모달 상태
  const [termsModal, setTermsModal] = useState<{
    isOpen: boolean
    title: string
    content: string
  }>({ isOpen: false, title: '', content: '' })

  useEffect(() => {
    async function initializePayment() {
      // iOS 네이티브이고 대상 경로일 경우 IAP 제품 로드
      if (shouldUseIAP) {
        try {
          const productIds = Object.values(IAP_PRODUCT_IDS)
          await fetchIapProducts(productIds)
        } catch (error) {
          console.error('IAP 제품 로드 실패:', error)
        }
      } else {
        // 웹에서는 토스페이먼츠 초기화
        try {
          const tossPayments = await loadTossPayments(clientKey)
          const paymentInstance = tossPayments.payment({ customerKey })
          setPayment(paymentInstance)
        } catch (error) {
          console.error('토스페이먼츠 초기화 실패:', error)
        }
      }
    }

    if (isOpen) {
      initializePayment()
    }
  }, [isOpen, shouldUseIAP, fetchIapProducts])

  useEffect(() => {
    if (!isOpen) {
      setActiveTab('charge')
    }
  }, [isOpen])

  useEffect(() => {
    if (preselectedPoints && isOpen) {
      // 정확히 일치하는 옵션 찾기
      const exactMatch = CHARGE_OPTIONS.find(
        (option) => option.points === preselectedPoints,
      )

      if (exactMatch) {
        setSelectedOption(exactMatch)
      } else {
        // 필요한 포인트보다 크거나 같은 최소 옵션 찾기
        const recommendedOption = CHARGE_OPTIONS.find(
          (option) => option.points >= preselectedPoints,
        )
        if (recommendedOption) {
          setSelectedOption(recommendedOption)
        }
      }
    }
  }, [preselectedPoints, isOpen])

  const handleCharge = async () => {
    if (!selectedOption) {
      console.warn('선택된 옵션이 없습니다')
      return
    }

    console.log('💰 충전 시작:', { selectedOption, shouldUseIAP, iapProductsCount: iapProducts.length })

    // iOS 네이티브이고 대상 경로일 경우 IAP 사용
    if (shouldUseIAP) {
      try {
        setIsLoading(true)
        
        const productId = IAP_PRODUCT_IDS[selectedOption.points]
        if (!productId) {
          const error = '제품 ID를 찾을 수 없습니다'
          console.error(error, { points: selectedOption.points, IAP_PRODUCT_IDS })
          toast.error(error)
          setIsLoading(false)
          return
        }

        console.log('🔍 제품 ID:', productId)

        // 제품이 로드되지 않은 경우 재시도 또는 경고
        let iapProduct = iapProducts.find(p => p.productId === productId)
        if (!iapProduct) {
          // 제품이 없으면 다시 로드 시도
          console.warn('⚠️ 제품 정보가 없습니다. 다시 로드 시도...', { productId, availableProducts: iapProducts.map(p => p.productId) })
          toast.info('제품 정보를 불러오는 중...')
          
          try {
            const productIds = Object.values(IAP_PRODUCT_IDS)
            const result = await fetchIapProducts(productIds)
            iapProduct = result.find(p => p.productId === productId)
            console.log('🔄 제품 재로드 결과:', { found: !!iapProduct, productsCount: result.length })
          } catch (reloadError) {
            console.error('❌ 제품 재로드 실패:', reloadError)
            toast.error('제품 정보를 불러올 수 없습니다. 네트워크 연결을 확인하거나 잠시 후 다시 시도해주세요.')
            setIsLoading(false)
            return
          }
          
          if (!iapProduct) {
            const errorMsg = '제품 정보를 불러올 수 없습니다. 실제 기기에서 테스트하거나 App Store Connect에서 제품 상태를 확인해주세요.'
            console.error('❌ 제품을 찾을 수 없음:', { productId, allProducts: iapProducts })
            toast.error(errorMsg)
            setIsLoading(false)
            return
          }
        }

        console.log('✅ 제품 확인됨:', { productId, price: iapProduct.priceString })

        // IAP 구매 실행
        let purchaseResult
        try {
          console.log('🛒 구매 시작...')
          purchaseResult = await purchaseIap(productId)
          console.log('✅ 구매 결과:', purchaseResult)
        } catch (purchaseError: any) {
          console.error('❌ IAP 구매 실패:', purchaseError)
          toast.error(purchaseError.message || '구매에 실패했습니다. 다시 시도해주세요.')
          setIsLoading(false)
          return
        }
        
        if (purchaseResult.deferred) {
          // 구매가 승인 대기 중인 경우
          toast.info('구매 승인 대기 중입니다')
          setIsLoading(false)
          return
        }

        // 구매 성공 시 서버에 포인트 충전 요청
        const orderId = `iap_points_${selectedOption.points}_${purchaseResult.transactionId}_${Date.now()}`
        const totalAmount = selectedOption.baseAmount + selectedOption.tax

        try {
          // IAP 영수증 검증 및 포인트 충전을 위한 API 호출
          // 서버에서 App Store 영수증 검증 후 포인트 충전 처리
          const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
          const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
          
          const { data: { session } } = await supabase.auth.getSession()
          if (!session) {
            throw new Error('로그인이 필요합니다')
          }

          const response = await fetch(
            `${EDGE_FUNCTIONS_URL}/functions/v1/api-payment`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${session.access_token}`,
                apikey: SUPABASE_ANON_KEY || '',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                paymentKey: `iap_${purchaseResult.transactionId}`,
                orderId,
                amount: totalAmount,
                transactionId: purchaseResult.transactionId,
                productId: IAP_PRODUCT_IDS[selectedOption.points],
                points: selectedOption.points,
                platform: 'ios',
              }),
            }
          )

          const result = await response.json()
          
          if (!response.ok || !result.success) {
            throw new Error(result.error || result.message || '포인트 충전에 실패했습니다')
          }

          toast.success(`${selectedOption.points.toLocaleString()}P가 충전되었습니다`)
          onClose()
          // 사용자 정보 새로고침
          window.location.reload()
        } catch (apiError: any) {
          console.error('서버 충전 요청 실패:', apiError)
          toast.error(apiError.message || '포인트 충전에 실패했습니다')
        }
      } catch (error: any) {
        console.error('IAP 구매 실패:', error)
        toast.error(error.message || '구매에 실패했습니다')
      } finally {
        setIsLoading(false)
      }
    } else {
      // 웹에서는 기존 토스페이먼츠 로직 사용
      if (!payment) return

      try {
        setIsLoading(true)

        const totalAmount = selectedOption.baseAmount + selectedOption.tax
        const orderId = `order_points_${selectedOption.points}_${Date.now()}_${Math.random().toString(36).substring(4, 10)}`
        // 개발 환경에서는 로컬 도메인, 프로덕션에서는 설정된 도메인 사용
        const baseUrl = import.meta.env.DEV
          ? window.location.origin
          : import.meta.env.VITE_APP_DOMAIN || window.location.origin

        const successUrl = `${baseUrl}/payment/success?points=${selectedOption.points}`
        const failUrl = `${baseUrl}/payment/fail`

        await payment.requestPayment({
          method: 'CARD',
          amount: {
            currency: 'KRW',
            value: totalAmount,
          },
          orderId,
          orderName: `포인트 충전 ${selectedOption.points.toLocaleString()}P`,
          successUrl,
          failUrl,
          customerEmail: user?.email || 'customer@example.com',
          customerName: user?.name || '고객',
          card: {
            useEscrow: false,
            flowMode: 'DEFAULT',
            useCardPoint: false,
            useAppCardOnly: false,
          },
        })
      } catch (error) {
        console.error('포인트 충전 실패:', error)
        setIsLoading(false)
      }
    }
  }

  // 추천 옵션 판단 함수
  const getRecommendedOption = () => {
    if (!preselectedPoints) return null

    // 정확히 일치하는 옵션이 있으면 그것을 추천
    const exactMatch = CHARGE_OPTIONS.find(
      (option) => option.points === preselectedPoints,
    )
    if (exactMatch) return exactMatch

    // 그렇지 않으면 필요한 포인트보다 크거나 같은 최소 옵션
    return CHARGE_OPTIONS.find(
      (option) => option.points >= preselectedPoints,
    ) || null
  }

  const recommendedOption = getRecommendedOption()

  const handleClose = () => {
    if (!isLoading) {
      onClose()
      setSelectedOption(null)
      setActiveTab('charge')
      setAgreements({
        purchase: false,
        electronicFinance: false,
        autoPayment: false,
        privacyDelegation: false,
      })
    }
  }
  
  // 모든 약관에 동의했는지 확인
  const allAgreed = agreements.purchase && agreements.electronicFinance && agreements.autoPayment && agreements.privacyDelegation
  
  // 전체 동의 토글
  const handleAllAgree = () => {
    const newValue = !allAgreed
    setAgreements({
      purchase: newValue,
      electronicFinance: newValue,
      autoPayment: newValue,
      privacyDelegation: newValue,
    })
  }
  
  // 약관 모달 열기
  const openTermsModal = (type: 'electronicFinance' | 'autoPayment' | 'privacyDelegation') => {
    const termsMap = {
      electronicFinance: { title: '전자금융거래 이용약관', content: ELECTRONIC_FINANCE_TERMS },
      autoPayment: { title: '자동결제 서비스 이용약관', content: AUTO_PAYMENT_TERMS },
      privacyDelegation: { title: '개인정보 제공 및 위탁 안내', content: PRIVACY_DELEGATION_TERMS },
    }
    setTermsModal({ isOpen: true, ...termsMap[type] })
  }

  const renderChargeContent = () => {
    return (
    <>
      <Typography variant="body1" color="text-secondary">
        충전할 포인트를 선택해주세요
        {preselectedPoints && (
          <span className="block mt-1 text-orange-600 font-medium">
            💡 {preselectedPoints.toLocaleString()}P가 필요합니다
          </span>
        )}
      </Typography>
      
      {shouldUseIAP && iapProducts.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
          <Typography variant="caption" className="text-yellow-800">
            ⚠️ 제품 정보를 불러오는 중입니다. 제품이 표시되지 않으면 잠시 후 다시 시도해주세요.
          </Typography>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        {CHARGE_OPTIONS.map((option) => {
          const totalAmount = option.baseAmount + option.tax
          const isSelected = selectedOption?.points === option.points
          const isRecommended = recommendedOption?.points === option.points
          
          // iOS IAP일 경우 제품 정보 가져오기
          const iapProduct = shouldUseIAP 
            ? iapProducts.find(p => p.productId === IAP_PRODUCT_IDS[option.points])
            : null
          const displayPrice = iapProduct?.priceString || `${totalAmount.toLocaleString()}원`

          return (
            <button
              key={option.points}
              onClick={() => setSelectedOption(option)}
              className={`
                relative p-4 rounded-lg border-2 transition-all hover:bg-gray-50
                ${
                  isSelected
                    ? isRecommended
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-blue-500 bg-blue-50'
                    : isRecommended
                      ? 'border-orange-300 bg-orange-25'
                      : 'border-gray-200'
                }
                ${shouldUseIAP && !iapProduct ? 'opacity-70' : ''}
              `}
            >
              {isRecommended && (
                <div className="absolute -top-2 -right-2 bg-gradient-to-r from-orange-500 to-red-500 text-white text-xs px-2 py-1 rounded-full font-bold shadow-lg">
                  ✨ 추천
                </div>
              )}
              <Flex justify="between" align="center">
                <div className="text-left">
                  <Typography variant="h6" className="font-semibold">
                    {option.points.toLocaleString()}P
                  </Typography>
                  <Typography variant="caption" color="text-secondary">
                    {shouldUseIAP ? '인앱 구매' : `부가세 ${option.tax.toLocaleString()}원 포함`}
                  </Typography>
                </div>
                <div className="text-right">
                  <Typography
                    variant="h6"
                    className={`font-semibold ${isRecommended ? 'text-orange-600' : 'text-blue-600'}`}
                  >
                    {displayPrice}
                  </Typography>
                </div>
              </Flex>
            </button>
          )
        })}
      </div>

      {selectedOption && (
        <div className="bg-blue-50 p-4 rounded-lg">
          <Flex justify="between" align="center">
            <Typography variant="body2">결제 예정 금액</Typography>
            <Typography variant="h5" className="font-bold text-blue-600">
              {(selectedOption.baseAmount + selectedOption.tax).toLocaleString()}원
            </Typography>
          </Flex>
          <div className="mt-2 text-sm text-gray-600">
            <div className="flex justify-between">
              <span>포인트 금액</span>
              <span>{selectedOption.baseAmount.toLocaleString()}원</span>
            </div>
            <div className="flex justify-between">
              <span>부가세 (10%)</span>
              <span>{selectedOption.tax.toLocaleString()}원</span>
            </div>
          </div>
        </div>
      )}

      {/* 환불 규정 */}
      <div className="bg-gray-100 p-5 rounded-xl">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-5 h-5 bg-gray-400 rounded-full flex items-center justify-center">
            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <Typography variant="h6" className="font-semibold text-gray-600">
            환불 규정
          </Typography>
        </div>
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <div className="w-2 h-2 bg-gray-400 rounded-full mt-2 flex-shrink-0"></div>
            <div>
              <Typography variant="body2" className="font-semibold text-gray-600 mb-1">
                사용하지 않은 경우
              </Typography>
              <Typography variant="caption" className="text-gray-500 leading-relaxed">
                구매 후 사용하지 않고 7일 이내라면 전액 환불이 가능합니다.
              </Typography>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <div className="w-2 h-2 bg-gray-400 rounded-full mt-2 flex-shrink-0"></div>
            <div>
              <Typography variant="body2" className="font-semibold text-gray-600 mb-1">
                이용 조건 변경 시
              </Typography>
              <Typography variant="caption" className="text-gray-500 leading-relaxed">
                가맹점 축소나 이용 조건이 불리해진 경우 수수료 없이 전액 환불받을 수 있습니다.
              </Typography>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <div className="w-2 h-2 bg-gray-400 rounded-full mt-2 flex-shrink-0"></div>
            <div>
              <Typography variant="body2" className="font-semibold text-gray-600 mb-1">
                일부 사용한 경우
              </Typography>
              <Typography variant="caption" className="text-gray-500 leading-relaxed">
                일반적으로 환불이 어려우나, 특별한 경우 사용 금액을 제외한 잔액 환불이 가능합니다.
              </Typography>
            </div>
          </div>
        </div>
      </div>

      {/* 약관 동의 섹션 */}
      <div className="space-y-3">
        <Typography variant="body2" className="font-semibold text-gray-800 mb-2">
          약관 동의
        </Typography>
        
        {/* 전체 동의 */}
        <button
          type="button"
          onClick={handleAllAgree}
          className="w-full flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition"
        >
          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
            allAgreed ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
          }`}>
            {allAgreed && <Check className="w-3 h-3 text-white" />}
          </div>
          <span className="font-semibold text-black">전체 동의</span>
        </button>
        
        <div className="space-y-2 pl-1">
          {/* 1. 구매 동의 */}
          <button
            type="button"
            onClick={() => setAgreements(prev => ({ ...prev, purchase: !prev.purchase }))}
            className="w-full flex items-center gap-3 py-2"
          >
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
              agreements.purchase ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
            }`}>
              {agreements.purchase && <Check className="w-3 h-3 text-white" />}
            </div>
            <span className="text-sm text-black text-left flex-1">
              구매할 상품의 결제 조건을 확인하였으며, 구매에 동의합니다
              <span className="text-black ml-1">(필수)</span>
            </span>
          </button>
          
          {/* 2. 전자금융거래 이용약관 */}
          <div className="flex items-center gap-3 py-2">
            <button
              type="button"
              onClick={() => setAgreements(prev => ({ ...prev, electronicFinance: !prev.electronicFinance }))}
              className="flex items-center gap-3 flex-1"
            >
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                agreements.electronicFinance ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
              }`}>
                {agreements.electronicFinance && <Check className="w-3 h-3 text-white" />}
              </div>
              <span className="text-sm text-black text-left">
                전자금융거래 이용약관 동의
                <span className="text-black ml-1">(필수)</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => openTermsModal('electronicFinance')}
              className="text-gray-500 text-xs flex items-center gap-0.5 hover:underline flex-shrink-0"
            >
              약관 보기
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          
          {/* 3. 자동결제 서비스 이용약관 */}
          <div className="flex items-center gap-3 py-2">
            <button
              type="button"
              onClick={() => setAgreements(prev => ({ ...prev, autoPayment: !prev.autoPayment }))}
              className="flex items-center gap-3 flex-1"
            >
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                agreements.autoPayment ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
              }`}>
                {agreements.autoPayment && <Check className="w-3 h-3 text-white" />}
              </div>
              <span className="text-sm text-black text-left">
                자동결제 서비스 이용약관 동의
                <span className="text-black ml-1">(필수)</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => openTermsModal('autoPayment')}
              className="text-gray-500 text-xs flex items-center gap-0.5 hover:underline flex-shrink-0"
            >
              약관 보기
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          
          {/* 4. 개인정보 제공 및 위탁 안내 */}
          <div className="flex items-center gap-3 py-2">
            <button
              type="button"
              onClick={() => setAgreements(prev => ({ ...prev, privacyDelegation: !prev.privacyDelegation }))}
              className="flex items-center gap-3 flex-1"
            >
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                agreements.privacyDelegation ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
              }`}>
                {agreements.privacyDelegation && <Check className="w-3 h-3 text-white" />}
              </div>
              <span className="text-sm text-black text-left">
                개인정보 제공 및 위탁 안내 동의
                <span className="text-black ml-1">(필수)</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => openTermsModal('privacyDelegation')}
              className="text-gray-500 text-xs flex items-center gap-0.5 hover:underline flex-shrink-0"
            >
              약관 보기
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </>
  )}

  return (
    <SlideSheet
      isOpen={isOpen}
      onClose={handleClose}
      title="포인트 충전"
      initialHeight={0.85}
      minHeight={0.5}
      maxHeight={0.9}
      zIndex={9999}
      footer={
        activeTab === 'charge' && (shouldUseIAP || (!isIOSNative && payment)) ? (
          <Flex gap={2}>
            <Button
              variant="secondary"
              onClick={handleClose}
              disabled={isLoading || iapLoading}
              className="flex-1"
            >
              취소
            </Button>
            <Button
              variant="primary"
              onClick={handleCharge}
              disabled={
                !selectedOption || 
                isLoading || 
                iapLoading || 
                (!shouldUseIAP && !payment) ||
                !allAgreed
              }
              className="flex-1"
            >
              {isLoading || iapLoading ? '결제 처리 중...' : !allAgreed ? '약관에 동의해주세요' : '결제하기'}
            </Button>
          </Flex>
        ) : undefined
      }
    >
      <div className="flex flex-col items-center gap-2 pb-4">
        <Typography variant="body1" className="text-blue-800">
          현재 보유 포인트
        </Typography>
        <Typography variant="h4" className="font-bold text-blue-600">
          {user?.total_points?.toLocaleString() || '0'}P
        </Typography>
      </div>

      <div className="pb-3">
        <div className="flex rounded-full bg-gray-100 p-1">
          {[
            { key: 'charge', label: '충전' },
            { key: 'history', label: '사용 내역' },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as 'charge' | 'history')}
              className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
                activeTab === tab.key
                  ? 'bg-white shadow text-[#110f1a]'
                  : 'text-gray-500'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4 pb-4">
        {activeTab === 'charge' ? (
          renderChargeContent()
        ) : (
          <PointsHistoryList
            pointsHistory={pointsHistory}
            isLoading={historyLoading}
            showLimitNotice
          />
        )}
      </div>
      
      {/* 약관 모달 */}
      <TermsModal
        isOpen={termsModal.isOpen}
        onClose={() => setTermsModal(prev => ({ ...prev, isOpen: false }))}
        title={termsModal.title}
        content={termsModal.content}
      />
    </SlideSheet>
  )
}
