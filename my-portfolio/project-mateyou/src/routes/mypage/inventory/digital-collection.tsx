/**
 * 디지털 보상 컬렉션 페이지
 * 당첨받은 디지털 보상 (사진, 영상 등)을 모아 볼 수 있음
 */

import { Button, LoadingSpinner, Typography, WatermarkedImage } from '@/components/ui';
import { useUserRouletteRewards } from '@/hooks/useUserRouletteRewards';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/useAuthStore';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Calendar, ChevronLeft, ChevronRight, Image as ImageIcon, User, Video, X } from 'lucide-react';
import { useMemo, useState } from 'react';

export const Route = createFileRoute('/mypage/inventory/digital-collection')({
  component: DigitalCollectionPage,
});

function DigitalCollectionPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [filter, setFilter] = useState<'all' | 'image' | 'video'>('all');

  const { rewards, isLoading } = useUserRouletteRewards({
    userId: user?.id,
    enabled: true,
  });

  // 유저의 memberCode (워터마크용) - 피드와 동일하게 user?.member_code 사용
  const memberCode = user?.member_code;

  // 디지털 보상만 필터링
  const digitalRewards = useMemo(() => {
    return rewards.filter((r) => r.reward_type === 'digital' && r.digital_file_url);
  }, [rewards]);

  // 타입별 필터링
  const filteredRewards = useMemo(() => {
    if (filter === 'all') return digitalRewards;
    return digitalRewards.filter((r) => {
      const isVideo = r.digital_file_type?.startsWith('video/');
      return filter === 'video' ? isVideo : !isVideo;
    });
  }, [digitalRewards, filter]);

  // 라이트박스 네비게이션
  const goToPrev = () => {
    if (selectedIndex !== null && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  const goToNext = () => {
    if (selectedIndex !== null && selectedIndex < filteredRewards.length - 1) {
      setSelectedIndex(selectedIndex + 1);
    }
  };

  const selectedReward = selectedIndex !== null ? filteredRewards[selectedIndex] : null;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Typography variant="body1" className="text-gray-500">
          로그인이 필요합니다
        </Typography>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50 via-white to-white">
      {/* 헤더 */}
      <div className="bg-white/80 backdrop-blur-lg border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate({ to: '/mypage/inventory/roulette' })}
              className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1 flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-pink-500" />
              <h1 className="text-lg font-bold text-gray-900">디지털 컬렉션</h1>
            </div>
            {digitalRewards.length > 0 && (
              <span className="px-2.5 py-1 bg-pink-100 text-pink-600 rounded-full text-sm font-semibold">
                {digitalRewards.length}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 필터 */}
      <div className="max-w-lg mx-auto px-4 py-3">
        <div className="bg-gray-100 rounded-2xl p-1 flex">
          {(['all', 'image', 'video'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={cn(
                'flex-1 py-2 rounded-xl text-sm font-medium transition-all',
                filter === f
                  ? 'bg-white text-pink-600 shadow-sm'
                  : 'text-gray-500'
              )}
            >
              {f === 'all' && '전체'}
              {f === 'image' && '📷 사진'}
              {f === 'video' && '🎬 영상'}
            </button>
          ))}
        </div>
      </div>

      {/* 컬렉션 그리드 */}
      <div className="max-w-lg mx-auto px-4 pb-24">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <LoadingSpinner />
          </div>
        ) : filteredRewards.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <ImageIcon className="w-10 h-10 text-pink-400" />
            </div>
            <p className="text-gray-600 font-medium mb-1">
              {filter === 'all' ? '아직 디지털 보상이 없어요' : `${filter === 'image' ? '사진' : '영상'} 보상이 없어요`}
            </p>
            <p className="text-sm text-gray-400">
              룰렛에서 디지털 보상을 당첨받으면 여기에 모입니다
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredRewards.map((reward, index) => {
              const isVideo = reward.digital_file_type?.startsWith('video/');
              return (
                <button
                  key={reward.id}
                  type="button"
                  onClick={() => setSelectedIndex(index)}
                  className="group relative aspect-square rounded-2xl overflow-hidden bg-gray-200 hover:ring-2 hover:ring-pink-500 transition-all shadow-md"
                >
                  {isVideo ? (
                    <div className="w-full h-full flex items-center justify-center bg-gray-900">
                      <Video className="w-12 h-12 text-white/60" />
                    </div>
                  ) : (
                    <WatermarkedImage
                      src={reward.digital_file_url!}
                      alt={reward.reward_name}
                      memberCode={memberCode}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  )}
                  
                  {/* 오버레이 */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent">
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <p className="text-white text-xs font-medium truncate">
                        {reward.partner_name}
                      </p>
                      <p className="text-white/60 text-[10px] mt-0.5">
                        {new Date(reward.won_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })}
                      </p>
                    </div>
                  </div>
                  
                  {/* 타입 아이콘 */}
                  {isVideo && (
                    <div className="absolute top-2 right-2 p-1.5 bg-black/50 rounded-lg">
                      <Video className="w-4 h-4 text-white" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 라이트박스 */}
      {selectedReward && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
          {/* 라이트박스 헤더 */}
          <div className="flex items-center justify-between p-4 text-white">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 text-sm text-white/80">
                <User className="w-4 h-4" />
                <span>{selectedReward.partner_name}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-white/60">
                <Calendar className="w-4 h-4" />
                <span>{new Date(selectedReward.won_at).toLocaleDateString('ko-KR')}</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIndex(null)}
              className="text-white hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          {/* 메인 컨텐츠 */}
          <div className="flex-1 flex items-center justify-center relative px-4">
            {/* 이전 버튼 */}
            {selectedIndex !== null && selectedIndex > 0 && (
              <button
                type="button"
                onClick={goToPrev}
                className="absolute left-4 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}

            {/* 이미지/영상 - 워터마크 적용, 우클릭 방지 */}
            <div 
              className="max-w-full max-h-[80vh] rounded-lg overflow-hidden"
              onContextMenu={(e) => e.preventDefault()}
            >
              {selectedReward.digital_file_type?.startsWith('video/') ? (
                <video
                  src={selectedReward.digital_file_url}
                  controls
                  controlsList="nodownload"
                  className="max-w-full max-h-[80vh]"
                  onContextMenu={(e) => e.preventDefault()}
                />
              ) : (
                <WatermarkedImage
                  src={selectedReward.digital_file_url!}
                  alt={selectedReward.reward_name}
                  memberCode={memberCode}
                  className="max-w-full max-h-[80vh] object-contain"
                  draggable={false}
                />
              )}
            </div>

            {/* 다음 버튼 */}
            {selectedIndex !== null && selectedIndex < filteredRewards.length - 1 && (
              <button
                type="button"
                onClick={goToNext}
                className="absolute right-4 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}
          </div>

          {/* 하단 정보 */}
          <div className="p-4 text-center text-white">
            <p className="text-sm font-medium">{selectedReward.reward_name}</p>
            <p className="text-xs text-white/60 mt-1">
              {selectedIndex !== null ? selectedIndex + 1 : 0} / {filteredRewards.length}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
