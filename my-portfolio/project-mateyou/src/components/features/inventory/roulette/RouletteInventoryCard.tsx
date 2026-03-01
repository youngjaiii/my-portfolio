/**
 * 룰렛 당첨 내역 카드 컴포넌트
 * 모던하고 타입별 시각적 구분이 명확한 디자인
 */

import { Calendar, MessageCircle, Ticket, Image, FileText, Sparkles } from 'lucide-react';
import type { UserRouletteInventoryItem } from './types';

interface RouletteInventoryCardProps {
  item: UserRouletteInventoryItem;
  onClick?: () => void;
}

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInMinutes = Math.floor(diffInMs / 1000 / 60);
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  if (diffInMinutes < 60) {
    return `${diffInMinutes}분 전`;
  } else if (diffInHours < 24) {
    return `${diffInHours}시간 전`;
  } else if (diffInDays < 7) {
    return `${diffInDays}일 전`;
  } else {
    return date.toLocaleDateString('ko-KR', {
      month: 'short',
      day: 'numeric',
    });
  }
};

/**
 * 보상 타입 정규화 (레거시 타입 → 새 타입)
 */
const normalizeRewardType = (type: string): 'text' | 'usable' | 'digital' => {
  switch (type) {
    case 'usable':
    case 'custom':
    case 'coupon':
      return 'usable';
    case 'digital':
      return 'digital';
    case 'text':
    case 'points':
    default:
      return 'text';
  }
};

// 타입별 스타일 설정
const typeStyles = {
  text: {
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-700',
    borderColor: 'border-gray-200',
    accentColor: 'bg-gray-500',
    label: '텍스트',
    Icon: FileText,
  },
  usable: {
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-700',
    borderColor: 'border-purple-200',
    accentColor: 'bg-purple-500',
    label: '사용형',
    Icon: Ticket,
  },
  digital: {
    bgColor: 'bg-pink-50',
    textColor: 'text-pink-700',
    borderColor: 'border-pink-200',
    accentColor: 'bg-pink-500',
    label: '디지털',
    Icon: Image,
  },
};

export function RouletteInventoryCard({
  item,
  onClick,
}: RouletteInventoryCardProps) {
  const normalizedType = normalizeRewardType(item.item_reward_type);
  const style = typeStyles[normalizedType];
  const IconComponent = style.Icon;

  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden bg-white rounded-2xl border ${style.borderColor} transition-all ${
        onClick ? 'cursor-pointer hover:shadow-lg hover:scale-[1.01] active:scale-[0.99]' : ''
      }`}
    >
      {/* 좌측 타입 인디케이터 */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${style.accentColor}`} />
      
      <div className="p-4 pl-5">
        <div className="flex items-start gap-3">
          {/* 아이콘 */}
          <div
            className={`flex-shrink-0 w-11 h-11 rounded-xl ${style.bgColor} flex items-center justify-center`}
          >
            <IconComponent className={`w-5 h-5 ${style.textColor}`} />
          </div>

          {/* 내용 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 truncate text-[15px]">
                  {item.item_name}
                </h3>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${style.bgColor} ${style.textColor}`}>
                    {style.label}
                  </span>
                  <span className="text-xs text-gray-400">
                    {item.partner_name}
                  </span>
                </div>
              </div>
              
              {/* 날짜 */}
              <span className="text-[11px] text-gray-400 whitespace-nowrap">
                {formatDate(item.won_at)}
              </span>
            </div>

            {/* 보상 정보 */}
            {item.item_reward_value && (
              <p className="mt-2 text-sm text-gray-600 line-clamp-1">
                {item.item_reward_value}
              </p>
            )}

            {/* 하단 정보 */}
            <div className="flex items-center gap-3 mt-2">
              {/* 방송 정보 */}
              {item.room_title && (
                <div className="flex items-center gap-1 text-[11px] text-gray-400">
                  <MessageCircle className="w-3 h-3" />
                  <span className="truncate max-w-[120px]">{item.room_title}</span>
                </div>
              )}
              
              {/* 처리 상태 */}
              {item.is_processed === false && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">
                  <Sparkles className="w-3 h-3" />
                  처리 중
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

