/**
 * 룰렛 보상 카드 컴포넌트 (사용형 아이템/쿠폰/디지털 보상)
 */

import { useState } from 'react';
import { Calendar, Clock, Download, Image as ImageIcon, X, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui';
import type { UserRouletteReward } from './types';

interface RouletteRewardCardProps {
  reward: UserRouletteReward;
  onRequestUsage?: (rewardId: string) => void;
  onDownload?: (rewardId: string) => void;
  isRequesting?: boolean;
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
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
};

const getUsableTypeLabel = (type: string): string => {
  switch (type) {
    case 'call_minutes':
      return '전화';
    case 'chat_count':
      return '채팅';
    case 'video_minutes':
      return '영상 통화';
    case 'message_count':
      return '메시지';
    default:
      return type;
  }
};

const getStatusBadge = (status: string, isExpired: boolean) => {
  if (isExpired) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
        <X className="w-3 h-3" />
        만료됨
      </span>
    );
  }

  switch (status) {
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
          <Clock className="w-3 h-3" />
          승인 대기 중
        </span>
      );
    case 'used':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
          <CheckCircle className="w-3 h-3" />
          사용 완료
        </span>
      );
    case 'rejected':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">
          <AlertCircle className="w-3 h-3" />
          거절됨
        </span>
      );
    default:
      return null;
  }
};

export function RouletteRewardCard({
  reward,
  onRequestUsage,
  onDownload,
  isRequesting = false,
}: RouletteRewardCardProps) {
  const [imageError, setImageError] = useState(false);

  const isUsable = reward.reward_type === 'usable' && reward.is_usable;
  const isDigital = reward.reward_type === 'digital';
  const isSingleUse = reward.initial_amount === 1;

  const handleRequestUsage = () => {
    if (onRequestUsage && isUsable) {
      onRequestUsage(reward.id);
    }
  };

  const handleDownload = () => {
    if (onDownload && isDigital && reward.digital_file_url) {
      onDownload(reward.id);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 transition-all hover:shadow-md">
      <div className="flex items-start gap-3">
        {/* 아이템 색상 인디케이터 또는 이미지 미리보기 */}
        {isDigital && reward.digital_file_url && !imageError ? (
          <div className="flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-gray-100">
            <img
              src={reward.digital_file_url}
              alt={reward.reward_name}
              className="w-full h-full object-cover"
              onError={() => setImageError(true)}
            />
          </div>
        ) : (
          <div
            className="flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center text-xl"
            style={{ backgroundColor: reward.item_color || '#FF6B6B' + '20' }}
          >
            {isDigital ? '📷' : isSingleUse ? '🎫' : '🎁'}
          </div>
        )}

        {/* 내용 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-gray-900 truncate">
                {reward.reward_name}
              </h3>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-xs text-gray-500">
                  {reward.partner_name}
                </span>
                {reward.room_title && (
                  <>
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-xs text-gray-500 truncate">
                      {reward.room_title}
                    </span>
                  </>
                )}
              </div>
            </div>
            {getStatusBadge(reward.status, reward.is_expired)}
          </div>

          {/* 사용형 아이템 정보 */}
          {isUsable && (
            <div className="mt-2 space-y-1">
              <div className="text-sm text-gray-700">
                <span className="font-medium">
                  {getUsableTypeLabel(reward.usable_type)}
                </span>
                {isSingleUse ? (
                  <span className="text-gray-500 ml-1">(1회성)</span>
                ) : (
                  <span className="text-gray-500 ml-1">
                    잔여: {reward.remaining_amount} / {reward.initial_amount}
                  </span>
                )}
              </div>
              {reward.usage_requested_at && reward.status === 'pending' && (
                <div className="text-xs text-yellow-600">
                  파트너 승인 대기 중...
                </div>
              )}
              {reward.usage_rejected_at && reward.status === 'rejected' && (
                <div className="text-xs text-red-600">
                  거절됨: {reward.usage_rejection_reason || '사유 없음'}
                </div>
              )}
            </div>
          )}

          {/* 디지털 보상 정보 */}
          {isDigital && (
            <div className="mt-2 text-sm text-gray-700">
              {reward.digital_file_name && (
                <div className="flex items-center gap-1">
                  <ImageIcon className="w-3 h-3" />
                  <span className="truncate">{reward.digital_file_name}</span>
                </div>
              )}
              {reward.digital_file_size && (
                <div className="text-xs text-gray-500 mt-1">
                  {(reward.digital_file_size / 1024 / 1024).toFixed(2)} MB
                </div>
              )}
            </div>
          )}

          {/* 만료일 */}
          {reward.expires_at && (
            <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
              <Calendar className="w-3 h-3" />
              <span>
                만료: {new Date(reward.expires_at).toLocaleDateString('ko-KR')}
              </span>
            </div>
          )}

          {/* 액션 버튼 */}
          <div className="mt-3 flex gap-2">
            {isUsable && reward.is_usable && (
              <Button
                size="sm"
                variant="default"
                onClick={handleRequestUsage}
                disabled={isRequesting}
                className="flex-1"
              >
                {isRequesting ? '요청 중...' : '사용 요청'}
              </Button>
            )}
            {isDigital && reward.digital_file_url && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownload}
                className="flex-1"
              >
                <Download className="w-4 h-4 mr-1" />
                다운로드
              </Button>
            )}
          </div>

          {/* 당첨 날짜 */}
          <div className="flex items-center gap-1 mt-2 text-xs text-gray-400">
            <Calendar className="w-3 h-3" />
            <span>{formatDate(reward.won_at)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

