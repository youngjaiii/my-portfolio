import { useEffect, useState } from 'react'
import type { Database } from '@/types/database'
import {
  Button,
  Flex,
  ImageUpload,
  Input,
  Modal,
  Textarea,
  Typography,
} from '@/components'

type Banner = Database['public']['Tables']['ad_banners']['Row']

interface BannerModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (bannerData: {
    title: string
    description: string
    background_image: string
    mobile_background_image: string
    link_url: string
    display_location: 'main' | 'partner_dashboard'
    start_at: string | null
    end_at: string | null
    is_active: boolean
  }) => Promise<void>
  banner?: Banner
  mode: 'create' | 'edit'
}

export function BannerModal({
  isOpen,
  onClose,
  onSave,
  banner,
  mode,
}: BannerModalProps) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    background_image: '',
    mobile_background_image: '',
    link_url: '',
    display_location: 'main' as 'main' | 'partner_dashboard',
    start_at: '',
    end_at: '',
    is_active: true,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<{
    title?: string
    background_image?: string
  }>({})

  useEffect(() => {
    if (isOpen) {
      if (mode === 'edit' && banner) {
        setFormData({
          title: banner.title,
          description: banner.description || '',
          background_image: banner.background_image || '',
          mobile_background_image: banner.mobile_background_image || '',
          link_url: banner.link_url || '',
          display_location: banner.display_location,
          start_at: banner.start_at
            ? new Date(banner.start_at).toISOString().slice(0, 16)
            : '',
          end_at: banner.end_at
            ? new Date(banner.end_at).toISOString().slice(0, 16)
            : '',
          is_active: banner.is_active,
        })
      } else {
        setFormData({
          title: '',
          description: '',
          background_image: '',
          mobile_background_image: '',
          link_url: '',
          display_location: 'main',
          start_at: '',
          end_at: '',
          is_active: true,
        })
      }
      setErrors({})
    }
  }, [isOpen, mode, banner])

  const validateForm = () => {
    const newErrors: typeof errors = {}

    if (!formData.title.trim()) {
      newErrors.title = '제목을 입력해주세요'
    }

    if (!formData.background_image.trim()) {
      newErrors.background_image = '배경 이미지를 업로드해주세요'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    setIsSubmitting(true)
    try {
      await onSave({
        title: formData.title,
        description: formData.description,
        background_image: formData.background_image,
        mobile_background_image: formData.mobile_background_image,
        link_url: formData.link_url,
        display_location: formData.display_location,
        start_at: formData.start_at
          ? new Date(formData.start_at).toISOString()
          : null,
        end_at: formData.end_at
          ? new Date(formData.end_at).toISOString()
          : null,
        is_active: formData.is_active,
      })
      onClose()
    } catch (error) {
      console.error('배너 저장 실패:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setFormData({
      title: '',
      description: '',
      background_image: '',
      mobile_background_image: '',
      link_url: '',
      display_location: 'main',
      start_at: '',
      end_at: '',
      is_active: true,
    })
    setErrors({})
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={mode === 'create' ? '새 배너 추가' : '배너 편집'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <Input
          label="제목 *"
          type="text"
          placeholder="배너 제목을 입력하세요"
          value={formData.title}
          onChange={(e) => {
            setFormData({ ...formData, title: e.target.value })
            if (errors.title) {
              setErrors({ ...errors, title: '' })
            }
          }}
          error={errors.title}
          disabled={isSubmitting}
        />

        <Textarea
          label="설명"
          placeholder="배너에 대한 설명을 입력하세요"
          value={formData.description}
          onChange={(e) =>
            setFormData({ ...formData, description: e.target.value })
          }
          disabled={isSubmitting}
          rows={3}
        />

        <div>
          <Typography variant="body2" color="text-secondary" className="mb-2">
            웹용 배경 이미지 *
          </Typography>
          <ImageUpload
            bucket="ad-images"
            currentImageUrl={formData.background_image}
            onImageUploaded={(url) => {
              setFormData({ ...formData, background_image: url })
              if (errors.background_image) {
                setErrors({ ...errors, background_image: '' })
              }
            }}
            onImageDeleted={() =>
              setFormData({ ...formData, background_image: '' })
            }
            userId="admin"
            maxWidth={1200}
            maxHeight={200}
            quality={0.9}
            maxSize={10}
          />
          {errors.background_image && (
            <Typography variant="caption" color="error" className="mt-1">
              {errors.background_image}
            </Typography>
          )}
        </div>

        <div>
          <Typography variant="body2" color="text-secondary" className="mb-2">
            모바일용 배경 이미지
          </Typography>
          <ImageUpload
            bucket="ad-images"
            currentImageUrl={formData.mobile_background_image}
            onImageUploaded={(url) =>
              setFormData({ ...formData, mobile_background_image: url })
            }
            onImageDeleted={() =>
              setFormData({ ...formData, mobile_background_image: '' })
            }
            userId="admin-mobile"
            maxWidth={800}
            maxHeight={600}
            quality={0.9}
            maxSize={5}
          />
        </div>

        <Input
          label="링크 URL"
          type="url"
          placeholder="https://example.com"
          value={formData.link_url}
          onChange={(e) =>
            setFormData({ ...formData, link_url: e.target.value })
          }
          disabled={isSubmitting}
        />

        <div>
          <Typography variant="body2" color="text-secondary" className="mb-3">
            노출 위치
          </Typography>
          <div className="flex gap-4">
            <label className="flex items-center">
              <input
                type="radio"
                name="display_location"
                value="main"
                checked={formData.display_location === 'main'}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    display_location: e.target.value as
                      | 'main'
                      | 'partner_dashboard',
                  })
                }
                className="mr-2"
              />
              <span>메인 페이지</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                name="display_location opcity-50"
                value="partner_dashboard"
                checked={formData.display_location === 'partner_dashboard'}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    display_location: e.target.value as
                      | 'main'
                      | 'partner_dashboard',
                  })
                }
                className="mr-2"
                disabled
              />
              <span>파트너 대시보드 (선택불가)</span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="노출 시작 시간"
            type="datetime-local"
            value={formData.start_at}
            onChange={(e) =>
              setFormData({ ...formData, start_at: e.target.value })
            }
            disabled={isSubmitting}
          />

          <Input
            label="노출 종료 시간"
            type="datetime-local"
            value={formData.end_at}
            onChange={(e) =>
              setFormData({ ...formData, end_at: e.target.value })
            }
            disabled={isSubmitting}
          />
        </div>

        <div className="flex items-center">
          <input
            type="checkbox"
            id="is_active"
            checked={formData.is_active}
            onChange={(e) =>
              setFormData({ ...formData, is_active: e.target.checked })
            }
            className="mr-2"
          />
          <label
            htmlFor="is_active"
            className="text-sm font-medium text-gray-700"
          >
            배너 활성화
          </label>
        </div>

        <div className="bg-blue-50 p-4 rounded-lg">
          <Typography variant="caption" color="text-secondary">
            <strong>안내사항:</strong>
            <br />
            • 웹용 배경 이미지는 필수입니다.
            <br />
            • 모바일용 이미지를 별도로 설정하지 않으면 웹용 이미지가 사용됩니다.
            <br />• 노출 시간을 설정하지 않으면 즉시 노출됩니다.
          </Typography>
        </div>

        <Flex justify="end" gap={3}>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            취소
          </Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>
            {isSubmitting
              ? '저장 중...'
              : mode === 'create'
                ? '추가하기'
                : '수정하기'}
          </Button>
        </Flex>
      </form>
    </Modal>
  )
}
