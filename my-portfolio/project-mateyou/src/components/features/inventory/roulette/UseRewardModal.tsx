/**
 * 사용형 아이템 사용 요청 모달
 * 파트너에게 보낼 메시지를 입력할 수 있음
 */

import { useState } from 'react';
import { X, Send, Gift, Phone, MessageSquare, Video, Mail } from 'lucide-react';
import { Button } from '@/components/ui';
import type { UserRouletteReward } from './types';
import { cn } from '@/lib/utils';

interface UseRewardModalProps {
  open: boolean;
  onClose: () => void;
  reward: UserRouletteReward | null;
  onSubmit: (params: {
    rewardId: string;
    usageType: string;
    amount: number;
    context: { message: string };
  }) => Promise<void>;
  isSubmitting?: boolean;
}

// 사용형 타입별 아이콘
const usableTypeIcons: Record<string, React.ReactNode> = {
  call_minutes: <Phone className="w-5 h-5" />,
  chat_count: <MessageSquare className="w-5 h-5" />,
  video_minutes: <Video className="w-5 h-5" />,
  message_count: <Mail className="w-5 h-5" />,
};

const usableTypeLabels: Record<string, string> = {
  call_minutes: '전화',
  chat_count: '채팅',
  video_minutes: '영상 통화',
  message_count: '메시지',
};

export function UseRewardModal({
  open,
  onClose,
  reward,
  onSubmit,
  isSubmitting = false,
}: UseRewardModalProps) {
  const [message, setMessage] = useState('');
  const [step, setStep] = useState<'confirm' | 'message'>('confirm');

  if (!open || !reward) return null;

  const typeIcon = usableTypeIcons[reward.usable_type] || <Gift className="w-5 h-5" />;
  const typeLabel = usableTypeLabels[reward.usable_type] || reward.usable_type;
  const isSingleUse = reward.initial_amount === 1;

  const handleSubmit = async () => {
    try {
      await onSubmit({
        rewardId: reward.id,
        usageType: reward.usable_type || 'use',
        amount: 1,
        context: { message: message.trim() },
      });
      // 성공 시 초기화 및 닫기
      setMessage('');
      setStep('confirm');
      onClose();
    } catch (error) {
      // 에러는 상위에서 처리
    }
  };

  const handleClose = () => {
    setMessage('');
    setStep('confirm');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      {/* 배경 */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* 바텀시트 */}
      <div className="relative w-full max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:zoom-in-95">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-bold text-gray-900">사용 요청</h2>
          <button
            type="button"
            onClick={handleClose}
            className="p-2 -mr-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 컨텐츠 */}
        <div className="p-4">
          {step === 'confirm' ? (
            <>
              {/* 보상 정보 */}
              <div className="flex items-center gap-4 p-4 bg-purple-50 rounded-xl mb-4">
                <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600">
                  {typeIcon}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">
                    {reward.reward_name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-sm text-purple-600 font-medium">
                      {typeLabel}
                    </span>
                    {!isSingleUse && (
                      <>
                        <span className="text-gray-300">·</span>
                        <span className="text-sm text-gray-500">
                          남은 횟수: {reward.remaining_amount}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* 파트너 정보 */}
              <div className="text-sm text-gray-600 mb-6">
                <span className="font-medium">{reward.partner_name}</span> 님에게 사용 요청을 보냅니다.
              </div>

              {/* 안내 */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
                <p className="text-sm text-amber-800">
                  💡 파트너가 요청을 수락하면 보상을 사용할 수 있습니다. 
                  거절되면 보상이 인벤토리로 돌아옵니다.
                </p>
              </div>

              {/* 버튼 */}
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={handleClose}
                  className="flex-1"
                >
                  취소
                </Button>
                <Button
                  variant="primary"
                  onClick={() => setStep('message')}
                  className="flex-1"
                >
                  다음
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* 메시지 입력 */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  파트너에게 보낼 메시지 (선택)
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="예: 안녕하세요! 10분 통화 부탁드려요 😊"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  rows={4}
                  maxLength={200}
                  autoFocus
                />
                <div className="flex justify-between mt-1">
                  <p className="text-xs text-gray-400">
                    파트너가 요청 내용을 확인할 수 있어요
                  </p>
                  <span className={cn(
                    "text-xs",
                    message.length > 180 ? "text-amber-500" : "text-gray-400"
                  )}>
                    {message.length}/200
                  </span>
                </div>
              </div>

              {/* 미리보기 */}
              {message.trim() && (
                <div className="bg-gray-50 rounded-xl p-3 mb-4">
                  <p className="text-xs text-gray-500 mb-1">미리보기</p>
                  <p className="text-sm text-gray-700">"{message}"</p>
                </div>
              )}

              {/* 버튼 */}
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setStep('confirm')}
                  className="flex-1"
                >
                  이전
                </Button>
                <Button
                  variant="primary"
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="flex-1"
                >
                  {isSubmitting ? (
                    <>처리 중...</>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-1.5" />
                      요청 보내기
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
