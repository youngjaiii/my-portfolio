/**
 * 파트너 사용 요청 카드 컴포넌트
 * 상세 정보 포함 모던 디자인
 */

import { useState } from 'react';
import { Check, X, Phone, MessageSquare, Video, Mail, Gift } from 'lucide-react';
import type { RouletteRewardUsageRequest } from './types';
import { cn } from '@/lib/utils';

interface PartnerRewardUsageRequestCardProps {
  request: RouletteRewardUsageRequest;
  onApprove: (usageLogId: string) => void;
  onReject: (usageLogId: string, reason?: string) => void;
  isApproving?: boolean;
  isRejecting?: boolean;
}

// 사용형 타입별 아이콘과 라벨
const usableTypeInfo: Record<string, { icon: React.ReactNode; label: string; unit: string }> = {
  call_minutes: { icon: <Phone className="w-4 h-4" />, label: '전화', unit: '분' },
  chat_count: { icon: <MessageSquare className="w-4 h-4" />, label: '채팅', unit: '회' },
  video_minutes: { icon: <Video className="w-4 h-4" />, label: '영상통화', unit: '분' },
  message_count: { icon: <Mail className="w-4 h-4" />, label: '메시지', unit: '개' },
};

function getTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return '방금';
  if (diffMins < 60) return `${diffMins}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 7) return `${diffDays}일 전`;
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

export function PartnerRewardUsageRequestCard({
  request,
  onApprove,
  onReject,
  isApproving = false,
  isRejecting = false,
}: PartnerRewardUsageRequestCardProps) {
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const userName = request.user?.name || '사용자';
  const userImage = request.user?.profile_image;
  const memberCode = request.user?.member_code;
  const rewardName = request.reward?.reward_name || '보상';
  const rewardType = request.reward?.reward_type;
  const usableType = request.reward?.usable_type;
  const rewardValue = request.reward?.reward_value;
  const userMessage = request.context?.message as string | undefined;
  const timeAgo = getTimeAgo(request.requested_at);

  // 사용형 타입 정보
  const typeInfo = usableType ? usableTypeInfo[usableType] : null;

  const handleApprove = () => onApprove(request.id);
  
  const handleReject = () => {
    if (showRejectInput) {
      onReject(request.id, rejectReason || undefined);
      setShowRejectInput(false);
      setRejectReason('');
    } else {
      setShowRejectInput(true);
    }
  };

  return (
    <div className="group relative">
      <div className={cn(
        "relative bg-white rounded-2xl border transition-all duration-200",
        showRejectInput ? "border-red-200" : "border-gray-100 hover:border-gray-200",
        "hover:shadow-lg hover:shadow-gray-100/50"
      )}>
        <div className="p-4">
          {/* 상단: 프로필 + 시간 */}
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-3 min-w-0">
              {/* 프로필 */}
              <div className="relative flex-shrink-0">
                {userImage ? (
                  <img
                    src={userImage}
                    alt={userName}
                    className="w-12 h-12 rounded-full object-cover ring-2 ring-gray-100"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center text-white font-semibold">
                    {userName[0]}
                  </div>
                )}
              </div>

              {/* 이름 */}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900">{userName}</span>
                </div>
                {memberCode && (
                  <p className="text-sm text-gray-400">@{memberCode}</p>
                )}
              </div>
            </div>

            {/* 시간 */}
            <span className="text-xs text-gray-400 flex-shrink-0 pt-1">
              {timeAgo}
            </span>
          </div>

          {/* 요청 내용 박스 */}
          <div className="bg-purple-50 rounded-xl p-3 mb-3">
            <div className="flex items-center gap-3">
              {/* 아이콘 */}
              <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600 flex-shrink-0">
                {typeInfo?.icon || <Gift className="w-5 h-5" />}
              </div>

              {/* 상세 정보 */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">
                  {rewardName}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  {/* 타입 라벨 */}
                  {typeInfo && (
                    <span className="text-xs px-2 py-0.5 bg-purple-200/50 text-purple-700 rounded-full">
                      {typeInfo.label}
                    </span>
                  )}
                  {/* 사용 요청 수량 */}
                  <span className="text-sm text-purple-600 font-medium">
                    {request.amount_used}{typeInfo?.unit || '회'} 사용 요청
                  </span>
                </div>
              </div>
            </div>

            {/* 추가 정보 */}
            {rewardValue && (
              <div className="mt-2 pt-2 border-t border-purple-100">
                <p className="text-xs text-purple-600">
                  보상 내용: {rewardValue}
                </p>
              </div>
            )}
          </div>

          {/* 사용자 메시지 */}
          {userMessage && (
            <div className="bg-gray-50 rounded-xl p-3 mb-3">
              <p className="text-sm text-gray-600">
                💬 "{userMessage}"
              </p>
            </div>
          )}

          {/* 거절 사유 입력 */}
          {showRejectInput && (
            <div className="mb-3">
              <input
                type="text"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="거절 사유 입력 (선택)"
                className="w-full px-3 py-2.5 text-sm bg-red-50 border border-red-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-200 placeholder:text-red-300"
                autoFocus
              />
            </div>
          )}

          {/* 액션 버튼 */}
          <div className="flex gap-2">
            {showRejectInput ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowRejectInput(false)}
                  className="flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={isRejecting}
                  className="flex-1 py-2.5 text-sm font-medium text-white bg-red-500 rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {isRejecting ? '처리중...' : '거절하기'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={isApproving || isRejecting}
                  className="flex items-center justify-center gap-1.5 flex-1 py-2.5 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  <X className="w-4 h-4" />
                  거절
                </button>
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={isApproving || isRejecting}
                  className="flex items-center justify-center gap-1.5 flex-1 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-emerald-500 to-green-500 rounded-xl hover:from-emerald-600 hover:to-green-600 transition-colors disabled:opacity-50 shadow-sm shadow-emerald-200"
                >
                  <Check className="w-4 h-4" />
                  {isApproving ? '처리중...' : '수락'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
