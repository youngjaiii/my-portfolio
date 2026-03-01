import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { PartnerStoreAgreementPage } from '@/components/store/PartnerStoreAgreementPage';
import { edgeApi } from '@/lib/edgeApi';
import { Loader2 } from 'lucide-react';

export const Route = createFileRoute('/store/partner/agreement')({
  component: PartnerAgreementPage,
});

function PartnerAgreementPage() {
  const navigate = useNavigate();
  const { user, isLoading: userLoading } = useAuth();

  useEffect(() => {
    if (userLoading) {
      return;
    }

    if (!user) {
      navigate({ to: '/login' });
      return;
    }

    if (user.role !== 'partner') {
      navigate({ to: '/mypage' });
      return;
    }

    let cancelled = false;

    // 동의 상태 확인 - 이미 모두 동의했으면 상품 페이지로 리다이렉트
    const checkAgreement = async () => {
      try {
        const response = await edgeApi.partners.getInfo();
        
        if (cancelled) return;

        if (response.success && response.data) {
          const partnerData = response.data as any;
          const partner = partnerData.partner || partnerData;
          
          // is_seller가 true이면 상품 페이지로 리다이렉트
          if (partner.is_seller === true) {
            navigate({ to: '/store/partner/products' });
            return;
          }
          
          // 모든 동의가 완료되었으면 상품 페이지로 리다이렉트
          const allAgreed = 
            partner.store_terms_agreed &&
            partner.store_prohibited_items_agreed &&
            partner.store_fee_settlement_agreed &&
            partner.store_privacy_agreed;

          if (allAgreed) {
            navigate({ to: '/store/partner/products' });
          }
        }
      } catch (err: any) {
        console.error('동의 상태 확인 실패:', err);
      }
    };

    checkAgreement();

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role, userLoading]);

  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#FE3A8F]" />
      </div>
    );
  }

  const handleComplete = () => {
    navigate({ to: '/store/partner/products' });
  };

  return <PartnerStoreAgreementPage onComplete={handleComplete} />;
}
