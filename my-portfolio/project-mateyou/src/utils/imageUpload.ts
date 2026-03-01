import { mateYouApi } from '@/lib/apiClient'
import { supabase } from '@/lib/supabase'

export interface UploadImageResult {
  success: boolean
  url?: string
  error?: string
  path?: string
}

/**
 * 이미지를 업로드합니다 (Edge Function 실패시 Supabase Storage 직접 사용)
 * @param file - 업로드할 파일
 * @param bucket - Storage 버킷 이름 (예: 'avatars', 'profile-images')
 * @param path - 파일 경로 (예: 'user-123/avatar.jpg')
 * @returns 업로드 결과와 공개 URL
 */
export async function uploadImage(
  file: File,
  bucket: string,
  path: string,
): Promise<UploadImageResult> {
  try {
    // 파일 크기 체크 (10MB 제한)
    if (file.size > 10 * 1024 * 1024) {
      return {
        success: false,
        error: '파일 크기가 10MB를 초과합니다.',
      }
    }

    // 이미지 파일 타입 체크
    if (!file.type.startsWith('image/')) {
      return {
        success: false,
        error: '이미지 파일만 업로드 가능합니다.',
      }
    }

    try {
      // 먼저 Express API를 통해 업로드 시도
      const response = await mateYouApi.storage.upload(file, bucket, path, true)

      if (response.data.success) {
        return {
          success: true,
          url: response.data.data.url,
          path: response.data.data.path,
        }
      }
    } catch (edgeError) {
      console.warn('Edge Function 업로드 실패, Supabase Storage 직접 사용:', edgeError)
    }

    // Edge Function 실패시 Supabase Storage 직접 사용
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(path, file, {
        upsert: true,
        contentType: file.type,
      })

    if (error) {
      return {
        success: false,
        error: error.message || '업로드에 실패했습니다.',
      }
    }

    // 공개 URL 생성
    const { data: urlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(data.path)

    return {
      success: true,
      url: urlData.publicUrl,
      path: data.path,
    }
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : '업로드 중 오류가 발생했습니다.',
    }
  }
}

/**
 * Edge Functions를 통해 이미지를 삭제합니다
 * @param bucket - Storage 버킷 이름
 * @param path - 삭제할 파일 경로
 */
export async function deleteImage(
  bucket: string,
  path: string,
): Promise<boolean> {
  try {
    const response = await mateYouApi.storage.delete({ bucket, path })
    return response.data.success
  } catch (error) {
    console.error('이미지 삭제 실패:', error)
    return false
  }
}

/**
 * 파일명을 고유하게 생성합니다 (Edge Function 실패시 클라이언트에서 생성)
 * @param originalName - 원본 파일명
 * @param memberCode - 멤버 코드 (선택사항)
 * @param userId - 사용자 ID (멤버 코드가 없을 때 대체용)
 * @returns 고유한 파일 경로
 */
export async function generateImagePath(
  originalName: string,
  memberCode?: string,
  userId?: string,
): Promise<string> {
  try {
    const response = await mateYouApi.storage.generatePath({
      originalName,
      memberCode,
      userId,
    })

    if (response.data.success) {
      return response.data.data.path
    }
  } catch (error) {
    console.warn('Edge Function path 생성 실패, 클라이언트에서 생성:', error)
  }

  // Edge Function 실패시 또는 응답이 없을 때 클라이언트에서 생성
  return generateImagePathSync(originalName, memberCode, userId)
}

/**
 * 클라이언트에서 파일명을 고유하게 생성합니다 (동기 함수)
 * @param originalName - 원본 파일명
 * @param memberCode - 멤버 코드 (선택사항)
 * @param userId - 사용자 ID (멤버 코드가 없을 때 대체용)
 * @returns 고유한 파일 경로
 */
export function generateImagePathSync(
  originalName: string,
  memberCode?: string,
  userId?: string,
): string {
  const timestamp = Date.now()
  const randomString = Math.random().toString(36).substring(2, 15)
  const extension = originalName.split('.').pop()

  // 멤버 코드가 있으면 멤버 코드 사용, 없으면 userId 사용
  const folderName = memberCode || userId || 'unknown'

  return `${folderName}/${timestamp}-${randomString}.${extension}`
}

/**
 * 이미지를 리사이즈합니다 (Canvas 사용)
 * @param file - 원본 파일
 * @param maxWidth - 최대 너비
 * @param maxHeight - 최대 높이
 * @param quality - 이미지 품질 (0-1)
 * @returns 리사이즈된 파일
 */
export function resizeImage(
  file: File,
  maxWidth: number,
  maxHeight: number,
  quality: number = 0.8,
): Promise<File> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    const img = new Image()

    img.onload = () => {
      // 비율 계산
      let { width, height } = img

      if (width > height) {
        if (width > maxWidth) {
          height = (height * maxWidth) / width
          width = maxWidth
        }
      } else {
        if (height > maxHeight) {
          width = (width * maxHeight) / height
          height = maxHeight
        }
      }

      canvas.width = width
      canvas.height = height

      // 이미지 그리기
      ctx?.drawImage(img, 0, 0, width, height)

      // Blob으로 변환
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const resizedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: Date.now(),
            })
            resolve(resizedFile)
          } else {
            reject(new Error('이미지 리사이즈 실패'))
          }
        },
        file.type,
        quality,
      )
    }

    img.onerror = () => reject(new Error('이미지 로드 실패'))
    img.src = URL.createObjectURL(file)
  })
}
