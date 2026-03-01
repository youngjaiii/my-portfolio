/**
 * DigitalFileUploader - 디지털 파일 업로드 컴포넌트
 * 
 * 드래그앤드롭 스타일의 파일 업로드
 * 이미지 미리보기 및 업로드 진행률 표시
 */

import { useRef } from 'react'
import { Upload, X, Image as ImageIcon, Loader2, CheckCircle } from 'lucide-react'

interface UploadedFileInfo {
  url: string
  path: string
  fileName: string
  fileSize: number
  fileType: string
}

interface DigitalFileUploaderProps {
  file: File | null
  preview: string | null
  uploadedInfo: UploadedFileInfo | null
  isUploading: boolean
  progress: number
  error: string | null
  onFileSelect: (file: File) => void
  onRemove: () => void
  accept?: string
  maxSizeMB?: number
  label?: string
  helpText?: string
}

export function DigitalFileUploader({
  file,
  preview,
  uploadedInfo,
  isUploading,
  progress,
  error,
  onFileSelect,
  onRemove,
  accept = "image/jpeg,image/png,image/gif,image/webp,video/mp4",
  maxSizeMB = 10,
  label = "디지털 파일 업로드",
  helpText = "당첨 시 시청자에게 바로 지급됩니다. 컬렉션에서 모아볼 수 있어요.",
}: DigitalFileUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      onFileSelect(selectedFile)
    }
  }

  const hasFile = !!file || !!preview

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      
      {/* 업로드 영역 */}
      {!hasFile ? (
        <UploadDropzone
          onClick={() => fileInputRef.current?.click()}
          accept={accept}
          maxSizeMB={maxSizeMB}
        />
      ) : (
        <FilePreview
          file={file}
          preview={preview}
          isUploading={isUploading}
          progress={progress}
          uploadedInfo={uploadedInfo}
          onRemove={onRemove}
        />
      )}
      
      {/* 숨겨진 파일 입력 */}
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="hidden"
      />
      
      {/* 업로드 에러 */}
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
      
      <p className="text-xs text-gray-500">{helpText}</p>
    </div>
  )
}

// ============================================================
// 서브 컴포넌트
// ============================================================

interface UploadDropzoneProps {
  onClick: () => void
  accept: string
  maxSizeMB: number
}

function UploadDropzone({ onClick, accept, maxSizeMB }: UploadDropzoneProps) {
  // accept에서 확장자 추출
  const extensions = accept
    .split(',')
    .map((type) => type.split('/')[1]?.toUpperCase())
    .filter(Boolean)
    .join(', ')

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full p-6 border-2 border-dashed border-gray-300 rounded-xl hover:border-purple-400 hover:bg-purple-50/50 transition-colors"
    >
      <div className="flex flex-col items-center gap-2 text-gray-500">
        <Upload className="w-8 h-8" />
        <span className="text-sm font-medium">클릭하여 파일 선택</span>
        <span className="text-xs text-gray-400">
          {extensions} (최대 {maxSizeMB}MB)
        </span>
      </div>
    </button>
  )
}

interface FilePreviewProps {
  file: File | null
  preview: string | null
  isUploading: boolean
  progress: number
  uploadedInfo: UploadedFileInfo | null
  onRemove: () => void
}

function FilePreview({ 
  file, 
  preview, 
  isUploading, 
  progress, 
  uploadedInfo, 
  onRemove 
}: FilePreviewProps) {
  return (
    <div className="relative">
      {/* 미리보기 */}
      <div className="relative rounded-xl overflow-hidden bg-gray-100 aspect-video">
        {preview && (
          <img
            src={preview}
            alt="미리보기"
            className="w-full h-full object-contain"
          />
        )}
        {!preview && file && (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center">
              <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-600">{file.name}</p>
              <p className="text-xs text-gray-400">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          </div>
        )}
        
        {/* 업로드 진행 상태 */}
        {isUploading && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="text-center text-white">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
              <p className="text-sm">업로드 중... {progress}%</p>
            </div>
          </div>
        )}
        
        {/* 업로드 완료 표시 */}
        {uploadedInfo && !isUploading && (
          <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1">
            <CheckCircle className="w-4 h-4" />
          </div>
        )}
      </div>
      
      {/* 제거 버튼 */}
      <button
        type="button"
        onClick={onRemove}
        className="absolute -top-2 -right-2 p-1.5 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-lg"
      >
        <X className="w-4 h-4" />
      </button>
      
      {/* 파일 정보 */}
      {file && (
        <p className="mt-2 text-xs text-gray-500 truncate">
          {file.name}
        </p>
      )}
    </div>
  )
}
