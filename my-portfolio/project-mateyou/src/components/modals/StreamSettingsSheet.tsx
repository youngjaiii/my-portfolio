/**
 * StreamSettingsSheet - 방송 설정 수정 바텀시트
 * 
 * 기능:
 * - 방 제목, 설명 수정
 * - 공개/비공개/구독자전용 변경
 * - 비공개 시 비밀번호 변경
 * - 카테고리 변경
 * - 채팅 모드 변경
 * - 썸네일 변경
 */

import { Button, SlideSheet, Typography } from '@/components'
import { StreamThumbnailUpload } from '@/components/features/stream/StreamThumbnailUpload'
import { edgeApi } from '@/lib/edgeApi'
import { supabase } from '@/lib/supabase'
import {
  ChevronRight,
  Globe,
  Loader2,
  Lock,
  MessageSquare,
  MessageSquareOff,
  Users,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

interface StreamRoom {
  id: string
  title: string
  description: string | null
  category_id: string | null
  access_type: 'public' | 'private' | 'subscriber'
  password?: string | null
  chat_mode: 'all' | 'subscriber' | 'disabled'
  thumbnail_url: string | null
  stream_type: 'video' | 'audio'
  tags: string[] | null
}

interface Category {
  id: string
  name: string
  slug: string
}

interface StreamSettingsSheetProps {
  isOpen: boolean
  onClose: () => void
  room: StreamRoom
  onUpdate?: (updatedRoom: Partial<StreamRoom>) => void
}

export function StreamSettingsSheet({ 
  isOpen, 
  onClose, 
  room,
  onUpdate 
}: StreamSettingsSheetProps) {
  const [showCategoryPicker, setShowCategoryPicker] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  
  // 폼 상태
  const [formState, setFormState] = useState({
    title: room.title,
    description: room.description || '',
    categoryId: room.category_id,
    accessType: room.access_type,
    password: '',
    chatMode: room.chat_mode || 'all',
    thumbnailUrl: room.thumbnail_url,
  })

  // room이 변경되면 폼 상태 업데이트
  useEffect(() => {
    setFormState({
      title: room.title,
      description: room.description || '',
      categoryId: room.category_id,
      accessType: room.access_type,
      password: '',
      chatMode: room.chat_mode || 'all',
      thumbnailUrl: room.thumbnail_url,
    })
  }, [room])

  // 카테고리 목록 로드
  useEffect(() => {
    if (isOpen) {
      loadCategories()
    }
  }, [isOpen])

  const loadCategories = async () => {
    const { data } = await supabase
      .from('stream_categories')
      .select('id, name, slug')
      .order('name')
    
    if (data) {
      setCategories(data)
    }
  }

  const updateField = <K extends keyof typeof formState>(
    field: K, 
    value: typeof formState[K]
  ) => {
    setFormState(prev => ({ ...prev, [field]: value }))
  }

  const selectedCategory = categories.find(c => c.id === formState.categoryId)

  // 변경사항 확인
  const hasChanges = () => {
    return (
      formState.title !== room.title ||
      formState.description !== (room.description || '') ||
      formState.categoryId !== room.category_id ||
      formState.accessType !== room.access_type ||
      formState.chatMode !== (room.chat_mode || 'all') ||
      formState.thumbnailUrl !== room.thumbnail_url ||
      (formState.accessType === 'private' && formState.password.length > 0)
    )
  }

  const canSubmit = () => {
    if (!formState.title.trim()) return false
    if (formState.accessType === 'private' && !formState.password && !room.password) {
      return false
    }
    return hasChanges()
  }

  const handleSubmit = async () => {
    if (!canSubmit()) return

    setIsLoading(true)
    try {
      const updateData: Record<string, unknown> = {}

      if (formState.title !== room.title) {
        updateData.title = formState.title.trim()
      }
      if (formState.description !== (room.description || '')) {
        updateData.description = formState.description.trim() || null
      }
      if (formState.categoryId !== room.category_id) {
        updateData.category_id = formState.categoryId
      }
      if (formState.accessType !== room.access_type) {
        updateData.access_type = formState.accessType
        if (formState.accessType === 'private' && formState.password) {
          updateData.password = formState.password
        }
      }
      if (formState.accessType === 'private' && formState.password) {
        updateData.password = formState.password
      }
      if (formState.chatMode !== (room.chat_mode || 'all')) {
        updateData.chat_mode = formState.chatMode
      }
      if (formState.thumbnailUrl !== room.thumbnail_url) {
        updateData.thumbnail_url = formState.thumbnailUrl
      }

      const result = await edgeApi.stream.updateSettings(room.id, updateData as Parameters<typeof edgeApi.stream.updateSettings>[1])

      if (result.error) {
        toast.error(result.error.message || '설정 수정에 실패했습니다')
        return
      }

      toast.success('설정이 수정되었습니다')
      onUpdate?.(updateData as Partial<StreamRoom>)
      onClose()
    } catch (error) {
      console.error('Failed to update settings:', error)
      toast.error('설정 수정에 실패했습니다')
    } finally {
      setIsLoading(false)
    }
  }

  // 공개 설정 옵션
  const accessTypeOptions = [
    { 
      value: 'public' as const, 
      label: '공개', 
      icon: <Globe className="w-4 h-4" />,
      description: '모두 참여 가능',
    },
    { 
      value: 'subscriber' as const, 
      label: '구독자 전용', 
      icon: <Users className="w-4 h-4" />,
      description: '구독자만 참여',
    },
    { 
      value: 'private' as const, 
      label: '비공개', 
      icon: <Lock className="w-4 h-4" />,
      description: '비밀번호 필요',
    },
  ]

  // 채팅 모드 옵션
  const chatModeOptions = [
    {
      value: 'all' as const,
      label: '전체 채팅',
      icon: <MessageSquare className="w-4 h-4" />,
      description: '모두 채팅 가능',
    },
    {
      value: 'subscriber' as const,
      label: '구독자 전용',
      icon: <Users className="w-4 h-4" />,
      description: '구독자만 채팅',
    },
    {
      value: 'disabled' as const,
      label: '채팅 비활성화',
      icon: <MessageSquareOff className="w-4 h-4" />,
      description: '채팅 사용 안함',
    },
  ]

  return (
    <SlideSheet
      isOpen={isOpen}
      onClose={onClose}
      title="방송 설정"
      initialHeight={0.85}
      minHeight={0.5}
      maxHeight={0.95}
      zIndex={9999}
      footer={
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={!canSubmit() || isLoading}
          className="w-full"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              저장 중...
            </span>
          ) : (
            '변경사항 저장'
          )}
        </Button>
      }
    >
      <div className="space-y-6 pb-4">
        {/* 방송 제목 */}
        <div>
          <Typography variant="subtitle2" className="mb-2">
            방송 제목 <span className="text-red-500">*</span>
          </Typography>
          <input
            type="text"
            value={formState.title}
            onChange={(e) => updateField('title', e.target.value)}
            placeholder="어떤 방송인지 알려주세요"
            maxLength={50}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-colors"
          />
          <p className="text-xs text-gray-400 mt-1 text-right">{formState.title.length}/50</p>
        </div>

        {/* 방송 설명 */}
        <div>
          <Typography variant="subtitle2" className="mb-2">설명 (선택)</Typography>
          <textarea
            value={formState.description}
            onChange={(e) => updateField('description', e.target.value)}
            placeholder="방송에 대해 더 자세히 설명해주세요"
            maxLength={200}
            rows={3}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-colors resize-none"
          />
          <p className="text-xs text-gray-400 mt-1 text-right">{formState.description.length}/200</p>
        </div>

        {/* 썸네일 이미지 */}
        <div>
          <Typography variant="subtitle2" className="mb-2">썸네일 이미지</Typography>
          <StreamThumbnailUpload
            roomId={room.id}
            currentThumbnailUrl={formState.thumbnailUrl || undefined}
            onThumbnailUploaded={(url) => updateField('thumbnailUrl', url)}
            onThumbnailDeleted={() => updateField('thumbnailUrl', null)}
            required={false}
          />
        </div>

        {/* 카테고리 선택 */}
        <div>
          <Typography variant="subtitle2" className="mb-2">카테고리</Typography>
          <button
            type="button"
            onClick={() => setShowCategoryPicker(!showCategoryPicker)}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 flex items-center justify-between hover:border-gray-300 transition-colors"
          >
            <span className={selectedCategory ? 'text-[#110f1a]' : 'text-gray-400'}>
              {selectedCategory?.name || '카테고리 선택'}
            </span>
            <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${showCategoryPicker ? 'rotate-90' : ''}`} />
          </button>
          
          {showCategoryPicker && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  updateField('categoryId', null)
                  setShowCategoryPicker(false)
                }}
                className={`
                  px-3 py-2 rounded-lg text-sm font-medium transition-colors
                  ${formState.categoryId === null
                    ? 'bg-purple-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }
                `}
              >
                선택 안함
              </button>
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => {
                    updateField('categoryId', category.id)
                    setShowCategoryPicker(false)
                  }}
                  className={`
                    px-3 py-2 rounded-lg text-sm font-medium transition-colors
                    ${formState.categoryId === category.id
                      ? 'bg-purple-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }
                  `}
                >
                  {category.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 공개 설정 */}
        <div>
          <Typography variant="subtitle2" className="mb-3">공개 설정</Typography>
          <div className="space-y-2">
            {accessTypeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => updateField('accessType', option.value)}
                className={`
                  w-full p-3 rounded-xl border-2 flex items-center gap-3 transition-all
                  ${formState.accessType === option.value
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 hover:border-gray-300'
                  }
                `}
              >
                <div className={`
                  w-8 h-8 rounded-full flex items-center justify-center
                  ${formState.accessType === option.value 
                    ? 'bg-purple-500 text-white' 
                    : 'bg-gray-100 text-gray-600'
                  }
                `}>
                  {option.icon}
                </div>
                <div className="text-left flex-1">
                  <p className="font-medium text-[#110f1a]">{option.label}</p>
                  <p className="text-xs text-gray-500">{option.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 비밀번호 입력 (비공개 선택 시) */}
        {formState.accessType === 'private' && (
          <div>
            <Typography variant="subtitle2" className="mb-2">
              비밀번호 {!room.password && <span className="text-red-500">*</span>}
            </Typography>
            <input
              type="password"
              value={formState.password}
              onChange={(e) => updateField('password', e.target.value)}
              placeholder={room.password ? '변경하려면 입력하세요' : '4자리 이상 입력해주세요'}
              maxLength={20}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-colors"
            />
            {room.password && (
              <p className="text-xs text-gray-400 mt-1">기존 비밀번호가 설정되어 있습니다</p>
            )}
          </div>
        )}

        {/* 채팅 모드 */}
        <div>
          <Typography variant="subtitle2" className="mb-3">채팅 설정</Typography>
          <div className="space-y-2">
            {chatModeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => updateField('chatMode', option.value)}
                className={`
                  w-full p-3 rounded-xl border-2 flex items-center gap-3 transition-all
                  ${formState.chatMode === option.value
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 hover:border-gray-300'
                  }
                `}
              >
                <div className={`
                  w-8 h-8 rounded-full flex items-center justify-center
                  ${formState.chatMode === option.value 
                    ? 'bg-purple-500 text-white' 
                    : 'bg-gray-100 text-gray-600'
                  }
                `}>
                  {option.icon}
                </div>
                <div className="text-left flex-1">
                  <p className="font-medium text-[#110f1a]">{option.label}</p>
                  <p className="text-xs text-gray-500">{option.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </SlideSheet>
  )
}

export default StreamSettingsSheet
