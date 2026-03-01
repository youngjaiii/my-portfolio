import { Typography } from '@/components';

interface StoreEmptyStateProps {
  message?: string;
  description?: string;
}

export function StoreEmptyState({ 
  message = '등록된 상품이 없습니다',
  description 
}: StoreEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="text-6xl mb-4">🛍️</div>
      <Typography variant="body1" className="text-gray-600 mb-2">
        {message}
      </Typography>
      {description && (
        <Typography variant="caption" className="text-gray-400 text-center">
          {description}
        </Typography>
      )}
    </div>
  );
}




