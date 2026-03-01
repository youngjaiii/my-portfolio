/**
 * ObsDefaultSettings - OBS 방송 기본 설정
 * 
 * OBS로 방송 시작 시 자동으로 적용되는 기본 설정을 관리합니다.
 * - 기본 제목
 * - 기본 카테고리
 * - 공개 설정
 */

import { Button, Typography } from '@/components'
import { supabase } from '@/lib/supabase'
import { ChevronRight, Loader2, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

interface Category {
  id: string
  name: string
  slug: string
}

interface ObsDefaultSettingsProps {
  partnerId: string
}

interface DefaultSettings {
  default_stream_title: string | null
  default_category_id: string | null
  default_access_type: 'public' | 'private' | 'subscriber'
}

export function ObsDefaultSettings({ partnerId }: ObsDefaultSettingsProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [categories, setCategories] = useState<Category[]>([])
  const [showCategoryPicker, setShowCategoryPicker] = useState(false)
  
  const [settings, setSettings] = useState<DefaultSettings>({
    default_stream_title: null,
    default_category_id: null,
    default_access_type: 'public',
  })

  // 설정 로드
  useEffect(() => {
    loadSettings()
    loadCategories()
  }, [partnerId])

  const loadSettings = async () => {
    setIsLoading(true)
    try {
      const { data, error } = await supabase
        .from('partners')
        .select('default_stream_title, default_category_id, default_access_type')
        .eq('id', partnerId)
        .single()

      if (error) throw error

      if (data) {
        setSettings({
          default_stream_title: data.default_stream_title || null,
          default_category_id: data.default_category_id || null,
          default_access_type: data.default_access_type || 'public',
        })
      }
    } catch (error) {
      console.error('Failed to load OBS default settings:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadCategories = async () => {
    const { data } = await supabase
      .from('stream_categories')
      .select('id, name, slug')
      .order('name')
    
    if (data) {
      setCategories(data)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const { error } = await supabase
        .from('partners')
        .update({
          default_stream_title: settings.default_stream_title || null,
          default_category_id: settings.default_category_id || null,
          default_access_type: settings.default_access_type,
        })
        .eq('id', partnerId)

      if (error) throw error

      toast.success('기본 설정이 저장되었습니다')
    } catch (error) {
      console.error('Failed to save OBS default settings:', error)
      toast.error('설정 저장에 실패했습니다')
    } finally {
      setIsSaving(false)
    }
  }

  const selectedCategory = categories.find(c => c.id === settings.default_category_id)

  const accessTypeOptions = [
    { value: 'public' as const, label: '공개', description: '모두 참여 가능' },
    { value: 'subscriber' as const, label: '구독자 전용', description: '구독자만 참여' },
    { value: 'private' as const, label: '비공개', description: '비밀번호 필요' },
  ]

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="p-4 rounded-lg bg-purple-50 border border-purple-200">
        <Typography variant="body2" className="text-purple-700">
          💡 OBS로 방송을 시작하면 아래 설정이 자동으로 적용됩니다.
          방송 중에도 설정을 변경할 수 있습니다.
        </Typography>
      </div>

      {/* 기본 제목 */}
      <div>
        <Typography variant="subtitle2" className="mb-2">
          기본 방송 제목
        </Typography>
        <input
          type="text"
          value={settings.default_stream_title || ''}
          onChange={(e) => setSettings(prev => ({ ...prev, default_stream_title: e.target.value || null }))}
          placeholder="설정하지 않으면 '{닉네임}님의 방송'으로 생성됩니다"
          maxLength={50}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-colors"
        />
        <p className="text-xs text-gray-400 mt-1 text-right">
          {(settings.default_stream_title || '').length}/50
        </p>
      </div>

      {/* 기본 카테고리 */}
      <div>
        <Typography variant="subtitle2" className="mb-2">
          기본 카테고리
        </Typography>
        <button
          type="button"
          onClick={() => setShowCategoryPicker(!showCategoryPicker)}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 flex items-center justify-between hover:border-gray-300 transition-colors"
        >
          <span className={selectedCategory ? 'text-[#110f1a]' : 'text-gray-400'}>
            {selectedCategory?.name || '카테고리 선택 (선택)'}
          </span>
          <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${showCategoryPicker ? 'rotate-90' : ''}`} />
        </button>
        
        {showCategoryPicker && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setSettings(prev => ({ ...prev, default_category_id: null }))
                setShowCategoryPicker(false)
              }}
              className={`
                px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${settings.default_category_id === null
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
                  setSettings(prev => ({ ...prev, default_category_id: category.id }))
                  setShowCategoryPicker(false)
                }}
                className={`
                  px-3 py-2 rounded-lg text-sm font-medium transition-colors
                  ${settings.default_category_id === category.id
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

      {/* 기본 공개 설정 */}
      <div>
        <Typography variant="subtitle2" className="mb-3">
          기본 공개 설정
        </Typography>
        <div className="grid grid-cols-3 gap-2">
          {accessTypeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSettings(prev => ({ ...prev, default_access_type: option.value }))}
              className={`
                p-3 rounded-xl border-2 text-center transition-all
                ${settings.default_access_type === option.value
                  ? 'border-purple-500 bg-purple-50'
                  : 'border-gray-200 hover:border-gray-300'
                }
              `}
            >
              <p className="font-medium text-sm text-[#110f1a]">{option.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{option.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* 저장 버튼 */}
      <Button
        variant="primary"
        onClick={handleSave}
        disabled={isSaving}
        className="w-full"
      >
        {isSaving ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            저장 중...
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <Save className="w-4 h-4" />
            설정 저장
          </span>
        )}
      </Button>
    </div>
  )
}

export default ObsDefaultSettings
