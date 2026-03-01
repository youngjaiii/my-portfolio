import { useRef, useState } from 'react'
import { Button, Typography } from '@/components'
import {
  deleteImage,
  generateImagePath,
  resizeImage,
  uploadImage,
} from '@/utils/imageUpload'

interface ImageUploadProps {
  bucket: string
  currentImageUrl?: string
  onImageUploaded: (url: string) => void
  onImageDeleted?: () => void
  maxWidth?: number
  maxHeight?: number
  quality?: number
  userId?: string
  memberCode?: string
  accept?: string
  maxSize?: number // MB 단위
}

export function ImageUpload({
  bucket,
  currentImageUrl,
  onImageUploaded,
  onImageDeleted,
  maxWidth = 800,
  maxHeight = 600,
  quality = 0.8,
  userId,
  memberCode,
  accept = 'image/*',
  maxSize = 10,
}: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (file: File) => {
    setError(null)
    setIsUploading(true)

    try {
      // 파일 크기 체크
      if (file.size > maxSize * 1024 * 1024) {
        throw new Error(`파일 크기가 ${maxSize}MB를 초과합니다.`)
      }

      // 이미지 리사이즈
      const resizedFile = await resizeImage(file, maxWidth, maxHeight, quality)

      // 파일 경로 생성 (memberCode 우선, 없으면 userId 사용)
      const path = await generateImagePath(file.name, memberCode, userId)

      // 이미지 업로드
      const result = await uploadImage(resizedFile, bucket, path)

      if (result.success && result.url) {
        onImageUploaded(result.url)
      } else {
        throw new Error(result.error || '업로드에 실패했습니다.')
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : '업로드 중 오류가 발생했습니다.',
      )
    } finally {
      setIsUploading(false)
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    setDragOver(false)

    const file = event.dataTransfer.files[0]
    if (file) {
      handleFileSelect(file)
    }
  }

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = (event: React.DragEvent) => {
    event.preventDefault()
    setDragOver(false)
  }

  const handleDeleteImage = async () => {
    if (!currentImageUrl) return

    try {
      // URL에서 파일 경로 추출
      const url = new URL(currentImageUrl)
      const pathParts = url.pathname.split('/')
      const path = pathParts[pathParts.length - 1]

      await deleteImage(bucket, path)
      onImageDeleted?.()
    } catch (err) {
      setError('이미지 삭제에 실패했습니다.')
    }
  }

  const openFileDialog = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className="space-y-4">
      {/* 현재 이미지 미리보기 */}
      {currentImageUrl && (
        <div className="relative inline-block">
          <img
            src={currentImageUrl}
            alt="업로드된 이미지"
            className="w-32 h-32 object-cover rounded-lg border-2 border-gray-200"
          />
          <button
            onClick={handleDeleteImage}
            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-600 transition-colors"
          >
            ×
          </button>
        </div>
      )}

      {/* 파일 업로드 영역 */}
      <div
        className={`
          border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
          ${
            dragOver
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 hover:border-gray-400'
          }
          ${isUploading ? 'opacity-50 pointer-events-none' : ''}
        `}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={openFileDialog}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleFileChange}
          className="hidden"
        />

        {isUploading ? (
          <div className="space-y-3">
            <div className="animate-spin mx-auto w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            <Typography variant="body2" color="text-secondary">
              업로드 중...
            </Typography>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="mx-auto w-12 h-12 text-gray-400">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>
            <div>
              <Typography variant="body2" className="font-medium">
                이미지를 클릭하거나 드래그해서 업로드
              </Typography>
              <Typography variant="caption" color="text-secondary">
                최대 {maxSize}MB, {maxWidth}x{maxHeight}px로 자동 리사이즈
              </Typography>
            </div>
          </div>
        )}
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <Typography variant="body2" className="text-red-700">
            {error}
          </Typography>
        </div>
      )}

      {/* 업로드 버튼 */}
      <div className="flex gap-2">
        <Button
          variant="secondary"
          onClick={openFileDialog}
          disabled={isUploading}
          className="flex-1"
        >
          파일 선택
        </Button>
        {currentImageUrl && (
          <Button
            variant="secondary"
            onClick={handleDeleteImage}
            className="text-red-600 hover:text-red-700"
          >
            삭제
          </Button>
        )}
      </div>
    </div>
  )
}
