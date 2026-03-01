/**
 * 빈 인벤토리 상태 컴포넌트
 */

import { Gift } from 'lucide-react';
import { Typography } from '@/components/ui';

interface RouletteInventoryEmptyProps {
  type?: 'inventory' | 'rewards';
  message?: string;
}

export function RouletteInventoryEmpty({
  type = 'inventory',
  message,
}: RouletteInventoryEmptyProps) {
  const defaultMessage =
    type === 'rewards'
      ? '보유 중인 보상이 없습니다'
      : '당첨 내역이 없습니다';

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <Gift className="w-8 h-8 text-gray-400" />
      </div>
      <Typography variant="body1" className="text-gray-500 text-center">
        {message || defaultMessage}
      </Typography>
      <Typography variant="body2" className="text-gray-400 text-center mt-2">
        룰렛 후원으로 당첨된 아이템이 여기에 표시됩니다
      </Typography>
    </div>
  );
}

