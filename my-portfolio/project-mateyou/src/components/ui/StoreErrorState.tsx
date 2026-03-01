import { Typography, Button } from '@/components';

interface StoreErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function StoreErrorState({ 
  message = '상품을 불러오는데 실패했습니다',
  onRetry 
}: StoreErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="text-6xl mb-4">⚠️</div>
      <Typography variant="body1" className="text-gray-600 mb-4 text-center">
        {message}
      </Typography>
      {onRetry && (
        <Button
          variant="outline"
          onClick={onRetry}
          className="rounded-full"
        >
          다시 시도
        </Button>
      )}
    </div>
  );
}




