/**
 * MultiDigitalFileUploader - 다중 디지털 파일 업로드 컴포넌트
 * 
 * 여러 개의 사진/영상을 한 번에 업로드
 * 드래그로 순서 변경 가능
 */

import { cn } from '@/lib/utils'
import { Film, Image as ImageIcon, Plus, Upload, X } from 'lucide-react'
import { useCallback, useRef } from 'react'
import type { DigitalFileInfo } from '../types'

interface LocalFileInfo {
  id: string // 임시 ID
  file: File
  preview: string | null
  isUploading: boolean
  progress: number
  uploadedInfo?: DigitalFileInfo
  error?: string
}

interface MultiDigitalFileUploaderProps {
  /** 업로드된 파일 목록 (DB에 저장된 것) */
  uploadedFiles: DigitalFileInfo[]
  /** 새로 선택한 파일들 (아직 업로드 안 된 것) */
  localFiles: LocalFileInfo[]
  /** 파일 선택 시 */
  onFilesSelect: (files: File[]) => void
  /** 파일 제거 시 */
  onFileRemove: (fileId: string, isUploaded: boolean) => void
  /** 순서 변경 시 */
  onReorder?: (files: DigitalFileInfo[]) => void
  accept?: string
  maxSizeMB?: number
  maxFiles?: number
  label?: string
  helpText?: string
}

export function MultiDigitalFileUploader({
  uploadedFiles,
  localFiles,
  onFilesSelect,
  onFileRemove,
  onReorder,
  accept = "image/jpeg,image/png,image/gif,image/webp,video/mp4",
  maxSizeMB = 10,
  maxFiles = 20,
  label = "디지털 파일 업로드",
  helpText = "여러 파일을 한 번에 업로드할 수 있습니다. 당첨 시 지급 방식에 따라 지급됩니다.",
}: MultiDigitalFileUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  const totalFiles = uploadedFiles.length + localFiles.length
  const canAddMore = totalFiles < maxFiles

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    if (selectedFiles.length > 0) {
      // 최대 파일 수 체크
      const remainingSlots = maxFiles - totalFiles
      const filesToAdd = selectedFiles.slice(0, remainingSlots)
      onFilesSelect(filesToAdd)
    }
    // input 초기화 (같은 파일 다시 선택 가능하도록)
    e.target.value = ''
  }, [onFilesSelect, totalFiles, maxFiles])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      file => accept.includes(file.type)
    )
    if (droppedFiles.length > 0) {
      const remainingSlots = maxFiles - totalFiles
      const filesToAdd = droppedFiles.slice(0, remainingSlots)
      onFilesSelect(filesToAdd)
    }
  }, [accept, onFilesSelect, totalFiles, maxFiles])

  // accept에서 확장자 추출
  const extensions = accept
    .split(',')
    .map((type) => type.split('/')[1]?.toUpperCase())
    .filter(Boolean)
    .join(', ')

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">
          {label}
        </label>
        <span className="text-xs text-gray-500">
          {totalFiles}/{maxFiles}개
        </span>
      </div>
      
      {/* 파일 목록 그리드 */}
      <div className="grid grid-cols-3 gap-2">
        {/* 업로드된 파일들 */}
        {uploadedFiles.map((file, index) => (
          <FileCard
            key={file.id || file.file_path}
            type="uploaded"
            preview={file.file_url}
            fileName={file.file_name}
            fileType={file.file_type}
            onRemove={() => onFileRemove(file.id || file.file_path, true)}
          />
        ))}
        
        {/* 로컬 파일들 (아직 업로드 안 된 것) */}
        {localFiles.map((file) => (
          <FileCard
            key={file.id}
            type="local"
            preview={file.preview}
            fileName={file.file.name}
            fileType={file.file.type}
            isUploading={file.isUploading}
            progress={file.progress}
            error={file.error}
            onRemove={() => onFileRemove(file.id, false)}
          />
        ))}
        
        {/* 추가 버튼 */}
        {canAddMore && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className={cn(
              "aspect-square rounded-lg border-2 border-dashed border-gray-300",
              "hover:border-purple-400 hover:bg-purple-50/50 transition-colors",
              "flex flex-col items-center justify-center gap-1"
            )}
          >
            <Plus className="w-6 h-6 text-gray-400" />
            <span className="text-xs text-gray-500">추가</span>
          </button>
        )}
      </div>
      
      {/* 파일 없을 때 드롭존 */}
      {totalFiles === 0 && (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="w-full p-8 border-2 border-dashed border-gray-300 rounded-xl hover:border-purple-400 hover:bg-purple-50/50 transition-colors"
        >
          <div className="flex flex-col items-center gap-2 text-gray-500">
            <Upload className="w-8 h-8" />
            <span className="text-sm font-medium">클릭하거나 파일을 드래그하세요</span>
            <span className="text-xs text-gray-400">
              {extensions} (각 {maxSizeMB}MB, 최대 {maxFiles}개)
            </span>
          </div>
        </button>
      )}
      
      {/* 숨겨진 파일 입력 (multiple) */}
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple
        onChange={handleFileChange}
        className="hidden"
      />
      
      <p className="text-xs text-gray-500">{helpText}</p>
    </div>
  )
}

// ============================================================
// 파일 카드 컴포넌트
// ============================================================

interface FileCardProps {
  type: 'uploaded' | 'local'
  preview: string | null
  fileName: string
  fileType?: string
  isUploading?: boolean
  progress?: number
  error?: string
  onRemove: () => void
}

function FileCard({
  type,
  preview,
  fileName,
  fileType,
  isUploading,
  progress = 0,
  error,
  onRemove,
}: FileCardProps) {
  const isImage = fileType?.startsWith('image/')
  const isVideo = fileType?.startsWith('video/')

  return (
    <div className="relative group">
      {/* 미리보기 */}
      <div className={cn(
        "aspect-square rounded-lg overflow-hidden bg-gray-100",
        error && "ring-2 ring-red-500"
      )}>
        {preview && isImage && (
          <img
            src={preview}
            alt={fileName}
            className="w-full h-full object-cover"
          />
        )}
        {preview && isVideo && (
          <video
            src={preview}
            className="w-full h-full object-cover"
            muted
          />
        )}
        {!preview && (
          <div className="w-full h-full flex items-center justify-center">
            {isVideo ? (
              <Film className="w-8 h-8 text-gray-400" />
            ) : (
              <ImageIcon className="w-8 h-8 text-gray-400" />
            )}
          </div>
        )}
        
        {/* 업로드 진행 오버레이 */}
        {isUploading && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="text-center text-white">
              <div className="w-12 h-12 border-2 border-white border-t-transparent rounded-full animate-spin mb-1" />
              <span className="text-xs">{progress}%</span>
            </div>
          </div>
        )}
        
        {/* 에러 오버레이 */}
        {error && (
          <div className="absolute inset-0 bg-red-500/80 flex items-center justify-center p-2">
            <span className="text-xs text-white text-center">{error}</span>
          </div>
        )}
      </div>
      
      {/* 제거 버튼 */}
      <button
        type="button"
        onClick={onRemove}
        className={cn(
          "absolute -top-1.5 -right-1.5 p-1 bg-red-500 text-white rounded-full",
          "opacity-0 group-hover:opacity-100 transition-opacity",
          "hover:bg-red-600 shadow-md"
        )}
      >
        <X className="w-3 h-3" />
      </button>
      
      {/* 파일명 툴팁 */}
      <p className="mt-1 text-[10px] text-gray-500 truncate" title={fileName}>
        {fileName}
      </p>
    </div>
  )
}
