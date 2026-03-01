/**
 * useRouletteItemForm - 룰렛 아이템 폼 상태 관리 훅
 * 
 * 아이템 생성/수정 시 사용되는 폼 상태를 한 곳에서 관리
 * 다중 디지털 파일 및 지급 방식 지원
 */

import { useRouletteDigitalUpload } from '@/hooks/useRouletteDigitalUpload'
import { useCallback, useEffect, useState } from 'react'
import type { StockLimitValues } from '../components/StockLimitSettings'
import {
    ROULETTE_COLORS,
    type CreateRouletteItemInput,
    type DigitalDistributionType,
    type DigitalFileInfo,
    type RouletteItem,
    type RouletteRewardType,
} from '../types'

interface UseRouletteItemFormOptions {
  /** 수정할 아이템 (없으면 추가 모드) */
  item?: RouletteItem
  /** 기존 아이템 목록 (초기 색상 결정용) */
  existingItemsCount?: number
  /** 휠 ID */
  wheelId: string
  /** 파트너 ID (디지털 업로드용) */
  partnerId?: string
}

/** 로컬 파일 상태 (아직 업로드 안 된 것) */
export interface LocalFileInfo {
  id: string
  file: File
  preview: string | null
  isUploading: boolean
  progress: number
  uploadedInfo?: DigitalFileInfo
  error?: string
}

/** 레거시 타입을 새 타입으로 변환 */
const normalizeRewardType = (type: string): RouletteRewardType => {
  switch (type) {
    case 'usable':
    case 'custom':
    case 'coupon':
      return 'usable'
    case 'digital':
      return 'digital'
    case 'text':
    case 'points':
    default:
      return 'text'
  }
}

/** 고유 ID 생성 */
const generateId = () => `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

export function useRouletteItemForm({
  item,
  existingItemsCount = 0,
  wheelId,
  partnerId,
}: UseRouletteItemFormOptions) {
  const isEditMode = !!item

  // 기본 폼 상태
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState(ROULETTE_COLORS[0])
  const [weight, setWeight] = useState(1)
  const [rewardType, setRewardType] = useState<RouletteRewardType>('text')
  const [rewardValue, setRewardValue] = useState('')

  // 수량 제한 상태 (비디지털용)
  const [stockLimits, setStockLimits] = useState<StockLimitValues>({
    stockLimitType: null,
    stockLimit: null,
    isBlank: false,
  })

  // ★ 디지털 상품 전용 상태 ★
  const [distributionType, setDistributionType] = useState<DigitalDistributionType>('bundle')
  const [uploadedFiles, setUploadedFiles] = useState<DigitalFileInfo[]>([])
  const [localFiles, setLocalFiles] = useState<LocalFileInfo[]>([])

  // 저장 상태
  const [isSaving, setIsSaving] = useState(false)

  // 디지털 업로드 훅
  const { 
    upload, 
    isUploading, 
    progress, 
    error: uploadError, 
    reset: resetUpload 
  } = useRouletteDigitalUpload()

  // 총 파일 수
  const totalFileCount = uploadedFiles.length + localFiles.length

  // 초기값 설정
  useEffect(() => {
    if (item) {
      // 수정 모드
      setName(item.name)
      setDescription(item.description || '')
      setColor(item.color)
      setWeight(item.weight)
      setRewardType(normalizeRewardType(item.reward_type || 'text'))
      setRewardValue(item.reward_value || '')
      
      // 수량 제한 - 디지털 타입은 사용 안 함
      const normalizedType = normalizeRewardType(item.reward_type || 'text')
      if (normalizedType !== 'digital') {
        setStockLimits({
          stockLimitType: item.stock_limit_type ?? null,
          stockLimit: item.stock_limit ?? null,
          isBlank: item.is_blank ?? false,
        })
      }

      // 디지털 설정
      if (normalizedType === 'digital') {
        setDistributionType(item.digital_distribution_type || 'bundle')
        
        // 기존 파일 목록 불러오기
        if (item.digital_files && item.digital_files.length > 0) {
          setUploadedFiles(item.digital_files)
        } else if (item.digital_file_path) {
          // 레거시 단일 파일 → 다중 파일 형태로 변환
          setUploadedFiles([{
            id: item.id,
            file_url: item.digital_file_url || '',
            file_path: item.digital_file_path,
            file_name: item.digital_file_name || item.reward_value || 'file',
            file_size: item.digital_file_size || undefined,
            file_type: item.digital_file_type || undefined,
            sort_order: 0,
          }])
        }
      }

      setLocalFiles([])
    } else {
      // 추가 모드 - 초기화
      setName('')
      setDescription('')
      setColor(ROULETTE_COLORS[existingItemsCount % ROULETTE_COLORS.length])
      setWeight(1)
      setRewardType('text')
      setRewardValue('')
      setStockLimits({
        stockLimitType: null,
        stockLimit: null,
        isBlank: false,
      })
      setDistributionType('bundle')
      setUploadedFiles([])
      setLocalFiles([])
    }
    
    resetUpload()
  }, [item, existingItemsCount, resetUpload])

  // ★ 다중 파일 선택 핸들러 ★
  const handleFilesSelect = useCallback((files: File[]) => {
    const newLocalFiles: LocalFileInfo[] = files.map((file) => {
      const localFile: LocalFileInfo = {
        id: generateId(),
        file,
        preview: null,
        isUploading: false,
        progress: 0,
      }
      
      // 이미지 미리보기 생성
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = (e) => {
          setLocalFiles(prev => prev.map(f => 
            f.id === localFile.id 
              ? { ...f, preview: e.target?.result as string }
              : f
          ))
        }
        reader.readAsDataURL(file)
      }
      
      return localFile
    })
    
    setLocalFiles(prev => [...prev, ...newLocalFiles])
  }, [])

  // ★ 파일 제거 핸들러 ★
  const handleFileRemove = useCallback((fileId: string, isUploaded: boolean) => {
    if (isUploaded) {
      setUploadedFiles(prev => prev.filter(f => (f.id || f.file_path) !== fileId))
    } else {
      setLocalFiles(prev => prev.filter(f => f.id !== fileId))
    }
  }, [])

  // 보상 타입 변경 핸들러
  const handleRewardTypeChange = useCallback((type: RouletteRewardType) => {
    setRewardType(type)
    if (type !== 'digital') {
      setRewardValue('')
      setDistributionType('bundle')
      setUploadedFiles([])
      setLocalFiles([])
    }
  }, [])

  // 유효성 검사
  const isDigitalType = rewardType === 'digital'
  const hasDigitalFiles = isDigitalType && totalFileCount > 0
  const isValid = name.trim() !== '' && weight >= 1 && (!isDigitalType || hasDigitalFiles)

  // ★ 저장 데이터 생성 ★
  const buildSaveData = useCallback(async (): Promise<CreateRouletteItemInput | null> => {
    if (!isValid) return null

    let finalRewardValue = rewardValue.trim() || null
    const allUploadedFiles: DigitalFileInfo[] = [...uploadedFiles]

    // 디지털 타입: 로컬 파일들 업로드
    if (rewardType === 'digital' && partnerId) {
      for (const localFile of localFiles) {
        // 업로드 상태 업데이트
        setLocalFiles(prev => prev.map(f => 
          f.id === localFile.id ? { ...f, isUploading: true, progress: 0 } : f
        ))
        
        try {
          const uploadResult = await upload(localFile.file, partnerId)
          
          if (!uploadResult.success) {
            setLocalFiles(prev => prev.map(f => 
              f.id === localFile.id ? { ...f, isUploading: false, error: uploadResult.error } : f
            ))
            throw new Error(uploadResult.error || '파일 업로드에 실패했습니다')
          }
          
          const uploadedFile: DigitalFileInfo = {
            file_url: uploadResult.url || '',
            file_path: uploadResult.path || '',
            file_name: uploadResult.fileName || localFile.file.name,
            file_size: uploadResult.fileSize,
            file_type: uploadResult.fileType,
            sort_order: allUploadedFiles.length,
          }
          
          allUploadedFiles.push(uploadedFile)
          
          // 업로드 완료 상태 업데이트
          setLocalFiles(prev => prev.map(f => 
            f.id === localFile.id 
              ? { ...f, isUploading: false, progress: 100, uploadedInfo: uploadedFile } 
              : f
          ))
        } catch (error: any) {
          setLocalFiles(prev => prev.map(f => 
            f.id === localFile.id ? { ...f, isUploading: false, error: error.message } : f
          ))
          throw error
        }
      }
      
      // reward_value는 파일 개수로 설정
      finalRewardValue = `${allUploadedFiles.length}개 파일`
    }

    // 디지털 타입은 수량 제한 대신 지급 방식 사용
    const result: CreateRouletteItemInput = {
      wheel_id: wheelId,
      name: name.trim(),
      description: description.trim() || undefined,
      color,
      weight,
      reward_type: rewardType,
      reward_value: finalRewardValue,
    }

    if (rewardType === 'digital') {
      // 디지털: 지급 방식 + 파일 목록
      result.digital_distribution_type = distributionType
      result.digital_files = allUploadedFiles
      
      // 레거시 호환: 첫 번째 파일 정보도 저장
      if (allUploadedFiles.length > 0) {
        const first = allUploadedFiles[0]
        result.digital_file_url = first.file_url
        result.digital_file_path = first.file_path
        result.digital_file_name = first.file_name
        result.digital_file_size = first.file_size
        result.digital_file_type = first.file_type
      }
    } else {
      // 비디지털: 수량 제한 설정
      result.stock_limit_type = stockLimits.stockLimitType
      result.stock_limit = stockLimits.stockLimit
      result.is_blank = stockLimits.isBlank
    }

    return result
  }, [
    isValid, 
    name, 
    description, 
    color, 
    weight, 
    rewardType, 
    rewardValue,
    stockLimits, 
    distributionType,
    uploadedFiles,
    localFiles,
    wheelId, 
    partnerId, 
    upload
  ])

  return {
    // 폼 값
    name,
    setName,
    description,
    setDescription,
    color,
    setColor,
    weight,
    setWeight,
    rewardType,
    setRewardType: handleRewardTypeChange,
    rewardValue,
    setRewardValue,
    
    // 수량 제한 (비디지털용)
    stockLimits,
    setStockLimits,
    
    // ★ 디지털 상품 전용 ★
    distributionType,
    setDistributionType,
    uploadedFiles,
    localFiles,
    totalFileCount,
    onFilesSelect: handleFilesSelect,
    onFileRemove: handleFileRemove,
    
    // 업로드 상태
    isUploading,
    uploadProgress: progress,
    uploadError,
    
    // 메타
    isEditMode,
    isValid,
    isDigitalType,
    isSaving,
    setIsSaving,
    buildSaveData,
  }
}
