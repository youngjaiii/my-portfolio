import { mateYouApi } from './apiClient'
import type { Database } from '@/types/database'

type Banner = Database['public']['Tables']['ad_banners']['Row']
type BannerInsert = Database['public']['Tables']['ad_banners']['Insert']
type BannerUpdate = Database['public']['Tables']['ad_banners']['Update']

export interface ApiResponse<T = any> {
  success: boolean
  message: string
  data?: T
}

// 모든 배너 조회
export async function getAllBanners(): Promise<ApiResponse<Array<Banner>>> {
  try {
    const response = await mateYouApi.admin.getBanners()

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to fetch banners')
    }

    return {
      success: true,
      message: '배너 목록을 성공적으로 불러왔습니다.',
      data: response.data.data || [],
    }
  } catch (error) {
    return {
      success: false,
      message: '배너 목록을 불러오는 중 오류가 발생했습니다.',
    }
  }
}

// 활성 배너 조회 (특정 위치) - Edge Functions 사용
export async function getActiveBanners(
  location?: 'main' | 'partner_dashboard',
): Promise<ApiResponse<Array<Banner>>> {
  try {
    const response = await mateYouApi.banners.getActiveBanners({
      page: 1,
      limit: 20,
      location,
    })

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to fetch active banners')
    }

    // 서버에서 이미 활성 배너와 시간 필터링이 완료되었으므로 그대로 사용
    return {
      success: true,
      message: '활성 배너를 성공적으로 불러왔습니다.',
      data: response.data.data || [],
    }
  } catch (error) {
    console.error('배너 조회 에러:', error)
    return {
      success: false,
      message: '활성 배너를 불러오는 중 오류가 발생했습니다.',
    }
  }
}

// 배너 생성
export async function createBanner(
  bannerData: BannerInsert,
): Promise<ApiResponse<Banner>> {
  try {
    const response = await mateYouApi.admin.createBanner({
      title: bannerData.title || '',
      description: bannerData.description || undefined,
      image_url: (bannerData as any).image_url || (bannerData as any).background_image || '',
      link_url: bannerData.link_url || undefined,
      is_active: bannerData.is_active,
    })

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to create banner')
    }

    return {
      success: true,
      message: '배너가 성공적으로 생성되었습니다.',
      data: response.data.data,
    }
  } catch (error) {
    return {
      success: false,
      message: '배너 생성 중 오류가 발생했습니다.',
    }
  }
}

// 배너 수정
export async function updateBanner(
  id: string,
  bannerData: BannerUpdate,
): Promise<ApiResponse<Banner>> {
  try {
    const response = await mateYouApi.admin.updateBanner(id, {
      title: bannerData.title,
      description: bannerData.description || undefined,
      image_url: (bannerData as any).image_url || (bannerData as any).background_image || undefined,
      link_url: bannerData.link_url || undefined,
      is_active: bannerData.is_active,
    })

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to update banner')
    }

    return {
      success: true,
      message: '배너가 성공적으로 수정되었습니다.',
      data: response.data.data,
    }
  } catch (error) {
    return {
      success: false,
      message: '배너 수정 중 오류가 발생했습니다.',
    }
  }
}

// 배너 삭제
export async function deleteBanner(id: string): Promise<ApiResponse> {
  try {
    const response = await mateYouApi.admin.deleteBanner(id)

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to delete banner')
    }

    return {
      success: true,
      message: '배너가 성공적으로 삭제되었습니다.',
    }
  } catch (error) {
    return {
      success: false,
      message: '배너 삭제 중 오류가 발생했습니다.',
    }
  }
}

// 배너 활성/비활성 토글
export async function toggleBannerStatus(
  id: string,
  isActive: boolean,
): Promise<ApiResponse<Banner>> {
  try {
    const response = await mateYouApi.admin.updateBanner(id, { is_active: isActive })

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to toggle banner status')
    }

    return {
      success: true,
      message: `배너가 성공적으로 ${isActive ? '활성화' : '비활성화'}되었습니다.`,
      data: response.data.data,
    }
  } catch (error) {
    return {
      success: false,
      message: '배너 상태 변경 중 오류가 발생했습니다.',
    }
  }
}

// 특정 배너 조회
export async function getBannerById(id: string): Promise<ApiResponse<Banner>> {
  try {
    const response = await mateYouApi.admin.getBanners()

    if (!response.data.success) {
      throw new Error(response.data.error?.message || 'Failed to fetch banner')
    }

    const banners = response.data.data || []
    const banner = banners.find((b: any) => b.id === id)

    if (!banner) {
      throw new Error('Banner not found')
    }

    return {
      success: true,
      message: '배너 정보를 성공적으로 불러왔습니다.',
      data: banner,
    }
  } catch (error) {
    return {
      success: false,
      message: '배너 정보를 불러오는 중 오류가 발생했습니다.',
    }
  }
}
