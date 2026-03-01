import { useRef, useState } from 'react'
import { Button, Typography } from '@/components'
import { edgeApi } from '@/lib/edgeApi'
import { toast } from '@/components/ui/sonner'

interface BackgroundImage {
  id: string
  url: string
  path: string
  uploadedAt: string
}

interface PartnerBackgroundUploadProps {
  memberCode: string
  currentImages: BackgroundImage[]
  onImagesUpdated: (images: BackgroundImage[]) => void
  maxImages?: number
}

export function PartnerBackgroundUpload({
  memberCode,
  currentImages,
  onImagesUpdated,
  maxImages = 5,
}: PartnerBackgroundUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadBackgroundImage = async (file: File): Promise<BackgroundImage> => {
    const fileExt = file.name.split('.').pop()
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
    const filePath = `${memberCode}/${fileName}`

    // Edge Function을 통해 partner_backgrounds 버킷에 업로드
    const response = await edgeApi.storage.upload(file, 'partner_backgrounds', filePath, false)

    if (!response.success) {
      console.error('배경 이미지 업로드 에러:', response.error)
      throw new Error(response.error?.message || '업로드에 실패했습니다')
    }

    return {
      id: fileName,
      url: response.data.url,
      path: response.data.path,
      uploadedAt: new Date().toISOString(),
    }
  }

  const deleteBackgroundImage = async (image: BackgroundImage) => {
    try {
      // Edge Function을 통해 Storage에서 파일 삭제
      const response = await edgeApi.storage.delete('partner_backgrounds', image.path)

      if (!response.success) {
        console.error('이미지 삭제 에러:', response.error)
        throw new Error(response.error?.message || '삭제에 실패했습니다')
      }

      // 현재 이미지 목록에서 제거
      const updatedImages = currentImages.filter(img => img.id !== image.id)
      onImagesUpdated(updatedImages)
      toast.success('배경 이미지가 삭제되었습니다')
    } catch (error) {
      console.error('이미지 삭제 실패:', error)
      toast.error('이미지 삭제에 실패했습니다')
    }
  }

  const handleFileSelect = async (files: FileList) => {
    if (currentImages.length >= maxImages) {
      toast.error(`최대 ${maxImages}개의 배경 이미지만 업로드할 수 있습니다`)
      return
    }

    const filesToUpload = Array.from(files).slice(0, maxImages - currentImages.length)

    setIsUploading(true)

    try {
      const uploadPromises = filesToUpload.map(async (file) => {
        // 파일 크기 체크 (10MB 제한)
        if (file.size > 10 * 1024 * 1024) {
          throw new Error(`${file.name}: 파일 크기가 10MB를 초과합니다`)
        }

        // 파일 타입 체크
        if (!file.type.startsWith('image/')) {
          throw new Error(`${file.name}: 이미지 파일만 업로드 가능합니다`)
        }

        return uploadBackgroundImage(file)
      })

      const newImages = await Promise.all(uploadPromises)
      const updatedImages = [...currentImages, ...newImages]
      onImagesUpdated(updatedImages)

      toast.success(`${newImages.length}개의 배경 이미지가 업로드되었습니다`)
    } catch (error) {
      console.error('배경 이미지 업로드 실패:', error)
      toast.error(error instanceof Error ? error.message : '업로드에 실패했습니다')
    } finally {
      setIsUploading(false)
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (files && files.length > 0) {
      handleFileSelect(files)
    }
  }

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault()
    setDragOver(false)

    const files = event.dataTransfer.files
    if (files && files.length > 0) {
      handleFileSelect(files)
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

  const openFileDialog = () => {
    fileInputRef.current?.click()
  }

  const canUploadMore = currentImages.length < maxImages

  return (
    <div className="space-y-6">
      {/* 현재 배경 이미지들 */}
      {currentImages.length > 0 && (
        <div>
          <Typography variant="h6" className="mb-3">
            현재 배경 이미지 ({currentImages.length}/{maxImages})
          </Typography>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {currentImages.map((image) => (
              <div key={image.id} className="relative group">
                <img
                  src={image.url}
                  alt="배경 이미지"
                  className="w-full h-32 object-cover rounded-lg border-2 border-gray-200"
                />
                <button
                  onClick={() => deleteBackgroundImage(image)}
                  className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-600 transition-colors opacity-0 group-hover:opacity-100"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 파일 업로드 영역 */}
      {canUploadMore && (
        <div>
          <Typography variant="h6" className="mb-3">
            배경 이미지 추가
          </Typography>

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
              accept="image/*"
              multiple
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
                    배경 이미지를 클릭하거나 드래그해서 업로드
                  </Typography>
                  <Typography variant="caption" color="text-secondary">
                    최대 10MB, {maxImages - currentImages.length}개 더 추가 가능
                  </Typography>
                  <Typography variant="caption" color="text-secondary" className="block">
                    다중 선택 가능 (Ctrl/Cmd + 클릭)
                  </Typography>
                </div>
              </div>
            )}
          </div>

          {/* 업로드 버튼 */}
          <div className="flex gap-2 mt-4">
            <Button
              variant="secondary"
              onClick={openFileDialog}
              disabled={isUploading}
              className="flex-1"
            >
              파일 선택
            </Button>
          </div>
        </div>
      )}

      {!canUploadMore && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <Typography variant="body2" className="text-yellow-700">
            최대 {maxImages}개의 배경 이미지를 업로드할 수 있습니다. 새 이미지를 추가하려면 기존 이미지를 삭제해주세요.
          </Typography>
        </div>
      )}
    </div>
  )
}