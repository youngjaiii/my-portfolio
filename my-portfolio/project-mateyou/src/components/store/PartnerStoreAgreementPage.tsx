import { useState } from 'react';
import { Button, Typography, SlideSheet } from '@/components';
import { Check } from 'lucide-react';
import { toast } from 'sonner';

interface Agreement {
  id: string;
  title: string;
  content: string;
}

const AGREEMENTS: Agreement[] = [
  {
    id: 'terms',
    title: '파트너(판매자) 스토어 이용약관',
    content: `제1조 (목적)
이 약관은 파트너(판매자)가 스토어 서비스를 이용함에 있어 필요한 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.

제2조 (판매자 책임)
1. 판매자는 판매하는 상품의 품질, 안전성, 적법성에 대한 책임을 집니다.
2. 판매자는 상품 정보를 정확하게 제공해야 하며, 허위·과장 광고를 해서는 안 됩니다.
3. 판매자는 구매자와의 거래에서 발생하는 분쟁에 대해 성실하게 대응해야 합니다.

제3조 (계정 관리)
1. 판매자는 자신의 계정 정보를 안전하게 관리해야 합니다.
2. 계정 정보 유출로 인한 손해는 판매자가 부담합니다.
3. 계정 도용이 의심되는 경우 즉시 고객센터에 신고해야 합니다.

제4조 (제재 근거)
다음과 같은 경우 서비스 이용이 제한되거나 계정이 정지될 수 있습니다:
1. 허위·과장 광고
2. 불법 상품 판매
3. 구매자 사기 행위
4. 기타 관련 법령 위반`,
  },
  {
    id: 'prohibited',
    title: '판매금지·제한 품목 정책(불법 판매 방지)',
    content: `제1조 (금지 품목)
다음과 같은 상품의 판매는 금지됩니다:
1. 마약류, 향정신성 의약품
2. 총기, 폭발물 등 위험물
3. 음란물, 아동 성착취물
4. 저작권 침해 상품 (불법 복제품)
5. 개인정보 불법 수집·판매
6. 기타 관련 법령에 의해 금지된 상품

제2조 (제한 품목)
다음과 같은 상품은 사전 승인 없이 판매할 수 없습니다:
1. 의료기기, 건강기능식품
2. 주류, 담배
3. 화장품, 의약외품
4. 전자담배 및 관련 용품

제3조 (즉시 차단)
다음과 같은 경우 즉시 판매가 차단됩니다:
1. 금지 품목 판매 적발
2. 불법 상품 판매 의심
3. 법적 분쟁 발생

제4조 (정산 보류)
다음과 같은 경우 정산이 보류될 수 있습니다:
1. 판매 금지 품목 판매 의심
2. 구매자 환불 요청
3. 법적 분쟁 진행 중`,
  },
  {
    id: 'fee',
    title: '수수료·정산·환불(거래 운영정책)',
    content: `제1조 (수수료)
1. 거래 성사 시 상품 판매 금액의 10%를 수수료로 차감합니다.
2. 수수료는 정산 시 자동 차감됩니다.

제2조 (정산 주기)
1. 정산은 매주 월요일 진행됩니다.
2. 전주 월요일부터 일요일까지의 판매 실적이 정산 대상입니다.
3. 정산 금액은 판매 금액에서 수수료를 차감한 순수익입니다.

제3조 (수수료 차감)
1. 수수료는 각 거래마다 자동 차감됩니다.
2. 환불 발생 시 해당 거래의 수수료도 함께 환불 처리됩니다.

제4조 (차지백)
1. 구매자 환불 요청 시 판매자는 즉시 환불 처리해야 합니다.
2. 환불 지연 시 추가 제재가 가해질 수 있습니다.

제5조 (취소·환불 기준)
1. 구매자는 상품 수령 전까지 취소 가능합니다.
2. 상품 하자 또는 설명과 다른 경우 환불 가능합니다.
3. 단순 변심에 의한 환불은 판매자와 구매자 간 협의로 결정됩니다.`,
  },
  {
    id: 'privacy',
    title: '개인정보 처리(구매자 정보 제공/처리)',
    content: `제1조 (개인정보 수집 목적)
배송, 현장수령, 고객 서비스(CS) 제공을 위해 구매자의 개인정보를 수집·이용합니다.

제2조 (수집 항목)
1. 배송 상품: 이름, 연락처, 주소, 우편번호
2. 현장수령 상품: 이름, 연락처
3. CS 처리: 주문 정보, 문의 내용

제3조 (이용 기간)
1. 주문 완료 후 배송/수령 완료 시까지
2. CS 처리 완료 후 3개월간 보관
3. 관련 법령에 따라 일정 기간 보관

제4조 (개인정보 보호)
1. 판매자는 구매자의 개인정보를 판매 목적으로만 사용해야 합니다.
2. 제3자에게 제공하거나 외부에 유출해서는 안 됩니다.
3. 개인정보 유출 시 관련 법령에 따라 처벌받을 수 있습니다.

제5조 (동의 철회)
구매자는 언제든지 개인정보 처리 동의를 철회할 수 있으며, 이 경우 해당 주문의 배송/수령이 불가능할 수 있습니다.`,
  },
];

interface PartnerStoreAgreementPageProps {
  onComplete: () => void;
}

export function PartnerStoreAgreementPage({ onComplete }: PartnerStoreAgreementPageProps) {
  const [agreements, setAgreements] = useState<Record<string, boolean>>({
    terms: false,
    prohibited: false,
    fee: false,
    privacy: false,
  });
  const [selectedAgreement, setSelectedAgreement] = useState<Agreement | null>(null);
  const [isTermsSheetOpen, setIsTermsSheetOpen] = useState(false);

  const allAgreed = Object.values(agreements).every((agreed) => agreed);

  const handleAgreementClick = (id: string) => {
    setSelectedAgreement(AGREEMENTS.find((a) => a.id === id) || null);
    setIsTermsSheetOpen(true);
  };

  const handleAgree = (id: string) => {
    setAgreements((prev) => ({ ...prev, [id]: true }));
  };

  const handleComplete = async () => {
    if (!allAgreed) return;
    
    // 동의 정보 업데이트 API 호출
    try {
      const { edgeApi } = await import('@/lib/edgeApi');
      const response = await edgeApi.storeProducts.agreeTerms({
        store_terms_agreed: agreements.terms,
        store_prohibited_items_agreed: agreements.prohibited,
        store_fee_policy_agreed: agreements.fee,
        store_privacy_policy_agreed: agreements.privacy,
      });

      if (response.success && response.data) {
        const data = response.data as any;
        const agreedAt = data.agreed_at ? new Date(data.agreed_at) : new Date();
        const year = agreedAt.getFullYear();
        const month = String(agreedAt.getMonth() + 1).padStart(2, '0');
        const day = String(agreedAt.getDate()).padStart(2, '0');
        const hours = String(agreedAt.getHours()).padStart(2, '0');
        const minutes = String(agreedAt.getMinutes()).padStart(2, '0');
        const formattedDate = `${year}-${month}-${day} ${hours}시 ${minutes}분`;
        
        const message = data.message || '동의가 완료되었습니다.';
        toast.success(`${formattedDate}\n${message}`);
        
        onComplete();
      } else {
        toast.error(response.error?.message || '동의 정보 저장에 실패했습니다.');
      }
    } catch (error) {
      console.error('동의 정보 저장 실패:', error);
      toast.error('동의 정보 저장에 실패했습니다.');
    }
  };

  return (
    <>
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white space-y-6">
          <div className="text-center">
            <Typography variant="h4" className="font-bold text-[#110f1a] mb-2">
              스토어 이용 동의
            </Typography>
            <Typography variant="body2" className="text-gray-600">
              스토어 서비스를 이용하기 위해 아래 약관에 동의해주세요.
            </Typography>
          </div>

          <div className="space-y-4">
            {AGREEMENTS.map((agreement) => (
              <div
                key={agreement.id}
                className="flex items-start gap-3 p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <button
                  onClick={() => handleAgree(agreement.id)}
                  className={`flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                    agreements[agreement.id]
                      ? 'bg-[#FE3A8F] border-[#FE3A8F]'
                      : 'border-gray-300'
                  }`}
                >
                  {agreements[agreement.id] && (
                    <Check className="w-4 h-4 text-white" />
                  )}
                </button>
                <div className="flex-1">
                  <button
                    onClick={() => handleAgreementClick(agreement.id)}
                    className="text-left w-full"
                  >
                    <Typography variant="body1" className="font-medium text-[#110f1a] hover:text-[#FE3A8F]">
                      <span className="underline">{agreement.title}</span>에 동의합니다
                    </Typography>
                  </button>
                </div>
              </div>
            ))}
          </div>

          <Button
            onClick={handleComplete}
            disabled={!allAgreed}
            className="w-full bg-[#FE3A8F] text-white disabled:bg-gray-300 disabled:text-gray-500"
          >
            확인
          </Button>
        </div>
      </div>

      {/* 약관 상세 보기 슬라이드 */}
      <SlideSheet
        isOpen={isTermsSheetOpen}
        onClose={() => {
          setIsTermsSheetOpen(false);
          setSelectedAgreement(null);
        }}
        title={selectedAgreement?.title || '약관'}
        footer={
          <div className="flex gap-3 px-4">
            <Button
              variant="outline"
              onClick={() => {
                setIsTermsSheetOpen(false);
                setSelectedAgreement(null);
              }}
              className="flex-1"
            >
              닫기
            </Button>
            {selectedAgreement && !agreements[selectedAgreement.id] && (
              <Button
                onClick={() => {
                  handleAgree(selectedAgreement.id);
                  setIsTermsSheetOpen(false);
                  setSelectedAgreement(null);
                }}
                className="flex-1 bg-[#FE3A8F] text-white"
              >
                동의하기
              </Button>
            )}
          </div>
        }
      >
        <div className="p-4">
          {selectedAgreement && (
            <div className="whitespace-pre-wrap text-sm text-gray-700 leading-relaxed">
              {selectedAgreement.content}
            </div>
          )}
        </div>
      </SlideSheet>
    </>
  );
}

