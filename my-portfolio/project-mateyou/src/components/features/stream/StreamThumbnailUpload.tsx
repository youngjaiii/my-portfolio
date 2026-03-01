/**
 * StreamThumbnailUpload - 방송 썸네일 업로드 컴포넌트
 * 
 * 기능:
 * - 방송 생성 시 썸네일 업로드 (파트너는 필수)
 * - 방송 중 썸네일 변경 (호스트만)
 * - 이미지 미리보기 (꽉 차는 UI)
 * - 이미지 리사이즈 (최대 1920x1080)
 */

import { useRef, useState } from 'react';
import { edgeApi } from '@/lib/edgeApi';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { generateImagePath, resizeImage, uploadImage, deleteImage } from '@/utils/imageUpload';
import { ImagePlus, Loader2, X } from 'lucide-react';

interface StreamThumbnailUploadProps {
  roomId?: string; // 방송 생성 시는 undefined, 방송 중에는 roomId
  currentThumbnailUrl?: string;
  onThumbnailUploaded?: (url: string) => void;
  onThumbnailDeleted?: () => void;
  disabled?: boolean;
  required?: boolean; // 필수 여부
}

export function StreamThumbnailUpload({
  roomId,
  currentThumbnailUrl,
  onThumbnailUploaded,
  onThumbnailDeleted,
  disabled = false,
  required = false,
}: StreamThumbnailUploadProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File) => {
    if (!file || disabled) return;
    
    setError(null);
    setIsUploading(true);

    try {
      // 파일 크기 체크 (10MB)
      if (file.size > 10 * 1024 * 1024) {
        throw new Error('파일 크기가 10MB를 초과합니다.');
      }

      // 이미지 리사이즈
      const resizedFile = await resizeImage(file, 1920, 1080, 0.85);

      // 파일 경로 생성
      const path = await generateImagePath(file.name, undefined, user?.id);

      // 이미지 업로드
      const result = await uploadImage(resizedFile, 'stream-thumbnails', path);

      if (!result.success || !result.url) {
        throw new Error(result.error || '업로드에 실패했습니다.');
      }

      const url = result.url;

      if (!roomId) {
        // 방송 생성 시: URL만 전달
        onThumbnailUploaded?.(url);
      } else {
        // 방송 중: API를 통해 업데이트
        const response = await edgeApi.stream.updateThumbnail(roomId, url);
        if (response.success) {
          queryClient.invalidateQueries({ queryKey: ['stream-rooms'] });
          queryClient.invalidateQueries({ queryKey: ['stream-rooms-api'] });
          queryClient.invalidateQueries({ queryKey: ['stream-room', roomId] });
          onThumbnailUploaded?.(url);
          toast.success('썸네일이 업데이트되었습니다');
        } else {
          throw new Error(response.error?.message || '썸네일 업데이트에 실패했습니다');
        }
      }
    } catch (err) {
      console.error('썸네일 업로드 실패:', err);
      const message = err instanceof Error ? err.message : '업로드에 실패했습니다';
      setError(message);
      toast.error(message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
    // input 초기화 (같은 파일 재선택 가능하도록)
    event.target.value = '';
  };

  const handleDelete = async () => {
    if (disabled || isDeleting) return;

    setIsDeleting(true);
    try {
      if (currentThumbnailUrl) {
        // URL에서 파일 경로 추출하여 삭제
        try {
          const url = new URL(currentThumbnailUrl);
          const pathParts = url.pathname.split('/');
          const path = pathParts[pathParts.length - 1];
          await deleteImage('stream-thumbnails', path);
        } catch {
          // 파일 삭제 실패해도 계속 진행
        }
      }

      if (!roomId) {
        // 방송 생성 시: 삭제만 처리
        onThumbnailDeleted?.();
      } else {
        // 방송 중: API를 통해 삭제
        const response = await edgeApi.stream.deleteThumbnail(roomId);
        if (response.success) {
          queryClient.invalidateQueries({ queryKey: ['stream-rooms'] });
          queryClient.invalidateQueries({ queryKey: ['stream-rooms-api'] });
          queryClient.invalidateQueries({ queryKey: ['stream-room', roomId] });
          onThumbnailDeleted?.();
          toast.success('썸네일이 삭제되었습니다');
        } else {
          throw new Error(response.error?.message || '썸네일 삭제에 실패했습니다');
        }
      }
    } catch (err) {
      console.error('썸네일 삭제 실패:', err);
      toast.error(err instanceof Error ? err.message : '썸네일 삭제에 실패했습니다');
    } finally {
      setIsDeleting(false);
    }
  };

  const openFileDialog = () => {
    if (!disabled && !isUploading) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled || isUploading}
      />

      {currentThumbnailUrl ? (
        // 썸네일이 있을 때: 꽉 차는 미리보기
        <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-gray-100">
          <img
            src={currentThumbnailUrl}
            alt="방송 썸네일"
            className="w-full h-full object-cover"
          />
          {/* 오버레이: 변경/삭제 버튼 */}
          <div className="absolute inset-0 bg-black/0 hover:bg-black/40 transition-colors group">
            <div className="absolute inset-0 flex items-center justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={openFileDialog}
                disabled={disabled || isUploading}
                className="px-4 py-2 bg-white/90 hover:bg-white text-gray-800 rounded-lg font-medium text-sm transition-colors"
              >
                변경
              </button>
              {!required && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={disabled || isDeleting}
                  className="px-4 py-2 bg-red-500/90 hover:bg-red-500 text-white rounded-lg font-medium text-sm transition-colors"
                >
                  삭제
                </button>
              )}
            </div>
          </div>
          {/* 삭제 버튼 (우상단) */}
          {!required && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={disabled || isDeleting}
              className="absolute top-2 right-2 w-7 h-7 bg-black/60 hover:bg-black/80 text-white rounded-full flex items-center justify-center transition-colors"
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <X className="w-4 h-4" />
              )}
            </button>
          )}
          {/* 로딩 오버레이 */}
          {(isUploading || isDeleting) && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-white animate-spin" />
            </div>
          )}
        </div>
      ) : (
        // 썸네일이 없을 때: 업로드 영역
        <button
          type="button"
          onClick={openFileDialog}
          disabled={disabled || isUploading}
          className={`
            w-full aspect-video rounded-xl border-2 border-dashed transition-all
            flex flex-col items-center justify-center gap-2
            ${disabled 
              ? 'border-gray-200 bg-gray-50 cursor-not-allowed' 
              : 'border-gray-300 hover:border-purple-400 hover:bg-purple-50/50 cursor-pointer'
            }
            ${required ? 'border-purple-300 bg-purple-50/30' : ''}
          `}
        >
          {isUploading ? (
            <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
          ) : (
            <>
              <div className={`w-12 h-12 rounded-full flex items-center justify-center ${required ? 'bg-purple-100 text-purple-500' : 'bg-gray-100 text-gray-400'}`}>
                <ImagePlus className="w-6 h-6" />
              </div>
              <div className="text-center">
                <p className={`text-sm font-medium ${required ? 'text-purple-600' : 'text-gray-500'}`}>
                  {required ? '썸네일을 업로드하세요' : '썸네일 추가 (선택)'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  16:9 비율 권장, 최대 10MB
                </p>
              </div>
            </>
          )}
        </button>
      )}

      {/* 에러 메시지 */}
      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}
    </div>
  );
}

