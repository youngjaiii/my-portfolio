/**
 * 룰렛 디지털 보상 파일 업로드 훅
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface UploadResult {
  success: boolean;
  url?: string;
  path?: string;
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  error?: string;
}

interface UseRouletteDigitalUploadReturn {
  upload: (file: File, partnerId: string) => Promise<UploadResult>;
  isUploading: boolean;
  progress: number;
  error: string | null;
  reset: () => void;
}

// 허용된 파일 타입
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function useRouletteDigitalUpload(): UseRouletteDigitalUploadReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setProgress(0);
    setError(null);
  }, []);

  const upload = useCallback(async (file: File, partnerId: string): Promise<UploadResult> => {
    reset();

    // 파일 타입 검증
    if (!ALLOWED_TYPES.includes(file.type)) {
      const errMsg = '지원하지 않는 파일 형식입니다. (jpg, png, gif, webp, mp4만 가능)';
      setError(errMsg);
      return { success: false, error: errMsg };
    }

    // 파일 크기 검증
    if (file.size > MAX_FILE_SIZE) {
      const errMsg = '파일 크기가 10MB를 초과합니다.';
      setError(errMsg);
      return { success: false, error: errMsg };
    }

    setIsUploading(true);
    setProgress(10);

    try {
      // 파일명 생성 (중복 방지)
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8);
      const ext = file.name.split('.').pop() || 'jpg';
      const fileName = `${timestamp}_${randomStr}.${ext}`;
      const filePath = `partners/${partnerId}/${fileName}`;

      setProgress(30);

      // Supabase Storage에 업로드
      const { data, error: uploadError } = await supabase.storage
        .from('roulette-rewards')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        console.error('[useRouletteDigitalUpload] 업로드 실패:', uploadError);
        throw new Error(uploadError.message);
      }

      setProgress(80);

      // Public URL 가져오기 (signed URL로 변경 가능)
      const { data: urlData } = supabase.storage
        .from('roulette-rewards')
        .getPublicUrl(filePath);

      setProgress(100);
      setIsUploading(false);

      return {
        success: true,
        url: urlData.publicUrl,
        path: filePath,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      };
    } catch (err: any) {
      const errMsg = err.message || '파일 업로드에 실패했습니다.';
      setError(errMsg);
      setIsUploading(false);
      return { success: false, error: errMsg };
    }
  }, [reset]);

  return {
    upload,
    isUploading,
    progress,
    error,
    reset,
  };
}
