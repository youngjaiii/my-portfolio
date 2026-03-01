import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { XCircle } from 'lucide-react';
import { Button, Typography } from '@/components';

export const Route = createFileRoute('/store/payment/fail')({
  component: StorePaymentFailPage,
});

function StorePaymentFailPage() {
  const navigate = useNavigate();

  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  const message = urlParams.get('message');
  const orderId = urlParams.get('orderId');

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
        <Typography variant="h4" className="font-bold text-gray-900 mb-2">
          결제에 실패했습니다
        </Typography>
        {message && (
          <Typography variant="body1" className="text-gray-600 mb-2">
            {message}
          </Typography>
        )}
        {code && (
          <Typography variant="caption" className="text-gray-500 mb-6">
            오류 코드: {code}
          </Typography>
        )}
        <div className="space-y-2">
          {orderId && (
            <Button
              onClick={() => {
                navigate({
                  to: '/store/orders/$orderId',
                  params: { orderId },
                });
              }}
              className="w-full bg-[#FE3A8F] text-white"
            >
              주문 상세로 이동
            </Button>
          )}
          <Button
            onClick={() => navigate({ to: '/store/orders' })}
            variant="outline"
            className="w-full"
          >
            주문 목록으로
          </Button>
        </div>
      </div>
    </div>
  );
}
