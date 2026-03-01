import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/components/ui/sonner'

interface BackgroundImage {
  id: string
  url: string
  path: string
  uploadedAt: string
}

// partnerId는 이제 members.id를 받습니다 (partners.member_id로 조회)
export function usePartnerBackgrounds(memberId?: string) {
  const [isLoading, setIsLoading] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)

  const updateBackgroundImages = useCallback(
    async (images: BackgroundImage[]) => {
      if (!memberId) return

      setIsUpdating(true)
      try {
        const { error } = await supabase
          .from('partners')
          .update({
            background_images: images,
          })
          .eq('member_id', memberId)  // partners.id → partners.member_id로 변경

        if (error) throw error

        toast.success('배경 이미지가 저장되었습니다')
      } catch (error) {
        console.error('배경 이미지 저장 실패:', error)
        toast.error('배경 이미지 저장에 실패했습니다')
        throw error
      } finally {
        setIsUpdating(false)
      }
    },
    [memberId],
  )

  const getBackgroundImages = useCallback(
    async (memberId: string): Promise<BackgroundImage[]> => {
      setIsLoading(true)
      try {
        const { data, error } = await supabase
          .from('partners')
          .select('background_images')
          .eq('member_id', memberId)  // partners.id → partners.member_id로 변경
          .single()

        if (error) throw error

        return (data?.background_images as BackgroundImage[]) || []
      } catch (error) {
        console.error('배경 이미지 로드 실패:', error)
        return []
      } finally {
        setIsLoading(false)
      }
    },
    [],
  )

  return {
    updateBackgroundImages,
    getBackgroundImages,
    isLoading,
    isUpdating,
  }
}