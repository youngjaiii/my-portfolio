import { useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { useDevice } from '@/hooks/useDevice'
import { Typography } from '@/components'
import { WEB_VERSION } from '@/constants/app'

export const Route = createFileRoute('/mypage/version')({
  component: VersionPage,
})

interface VersionInfo {
  platform: string
  version: string
  force_update: boolean
  store_url: string | null
  release_notes: string | null
  min_version?: string
}

function VersionPage() {
  const { isMobile } = useDevice()
  const [latestVersion, setLatestVersion] = useState<VersionInfo | null>(null)
  const [currentVersion, setCurrentVersion] = useState<string>(WEB_VERSION)
  const [isLoading, setIsLoading] = useState(true)

  const getPlatform = () => {
    if (Capacitor.isNativePlatform()) {
      const platform = Capacitor.getPlatform()
      return platform === 'ios' ? 'ios' : 'android'
    }
    return 'web'
  }

  useEffect(() => {
    const fetchVersion = async () => {
      try {
        // 네이티브 앱 버전 가져오기
        if (Capacitor.isNativePlatform()) {
          const appInfo = await App.getInfo()
          setCurrentVersion(appInfo.version)
        }
        
        const platform = getPlatform()
        const EDGE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
        const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

        const response = await fetch(
          `${EDGE_FUNCTIONS_URL}/functions/v1/api-app-version?platform=${platform}`,
          {
            headers: {
              apikey: SUPABASE_ANON_KEY,
            },
          }
        )

        const result = await response.json()
        if (result.success && result.data) {
          setLatestVersion(result.data)
        }
      } catch (error) {
        console.error('버전 정보 조회 실패:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchVersion()
  }, [])

  const isUpdateAvailable = latestVersion && currentVersion && latestVersion.version !== currentVersion

  return (
    <div className={`flex flex-col ${isMobile ? 'h-full overflow-hidden' : 'min-h-screen'}`}>
      <div className={`container mx-auto py-6 pb-16 flex flex-col flex-1 ${isMobile ? 'overflow-y-auto pt-16' : 'justify-center items-center'}`}>
        <div className={`w-full ${isMobile ? 'px-6' : 'max-w-lg'}`}>
          {/* 앱 로고 */}
          <div className="flex flex-col items-center mb-8">
            <img 
              src="/logo.png" 
              alt="MateYou" 
              className="w-30 h-30 mb-4 object-contain"
            />
            <Typography variant="h4" className="font-bold text-[#110f1a]">
              메이트유
            </Typography>
          </div>

          {/* 버전 정보 */}
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
            <div className="flex justify-between items-center p-4">
              <Typography variant="body1" className="text-gray-600">
                현재 버전
              </Typography>
              <Typography variant="body1" className="font-semibold text-[#110f1a]">
                {currentVersion || '-'}
              </Typography>
            </div>
            <div className="flex justify-between items-center p-4">
              <Typography variant="body1" className="text-gray-600">
                최신 버전
              </Typography>
              {isLoading ? (
                <div className="w-16 h-5 bg-gray-200 animate-pulse rounded" />
              ) : (
                <Typography variant="body1" className={`font-semibold ${isUpdateAvailable ? 'text-[#FE3A8F]' : 'text-[#110f1a]'}`}>
                  {latestVersion?.version || currentVersion || '-'}
                  {isUpdateAvailable && ' (업데이트 가능)'}
                </Typography>
              )}
            </div>
          </div>

          {/* 업데이트 안내 */}
          {isUpdateAvailable && latestVersion?.store_url && (
            <div className="mt-4 p-4 bg-[#FE3A8F]/10 rounded-lg">
              <Typography variant="body2" className="text-[#FE3A8F] text-center mb-3">
                새로운 버전이 출시되었습니다!
              </Typography>
              <button
                onClick={() => window.open(latestVersion.store_url!, '_blank')}
                className="w-full py-3 bg-[#FE3A8F] text-white rounded-lg font-semibold hover:bg-[#e8338a] transition-colors"
              >
                업데이트하기
              </button>
            </div>
          )}

          {/* 릴리즈 노트 */}
          {latestVersion?.release_notes && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <Typography variant="body2" className="font-semibold text-gray-700 mb-2">
                업데이트 내용
              </Typography>
              <Typography variant="caption" className="text-gray-600 whitespace-pre-wrap">
                {latestVersion.release_notes}
              </Typography>
            </div>
          )}

          {/* 사업자 정보 */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <Typography variant="body2" className="font-semibold text-gray-700 mb-3">
              사업자 정보
            </Typography>
            <div className="space-y-2 text-sm">
              <div className="flex">
                <span className="text-gray-500 w-28 flex-shrink-0">상호명</span>
                <span className="text-gray-700">주식회사 아이케이와이(IKY Co.,Ltd.)</span>
              </div>
              <div className="flex">
                <span className="text-gray-500 w-28 flex-shrink-0">대표자</span>
                <span className="text-gray-700">임문상</span>
              </div>
              <div className="flex">
                <span className="text-gray-500 w-28 flex-shrink-0">사업자등록번호</span>
                <span className="text-gray-700">620-86-03237</span>
              </div>
              <div className="flex">
                <span className="text-gray-500 w-28 flex-shrink-0">통신판매업신고</span>
                <span className="text-gray-700">2025-서울마포-2780</span>
              </div>
              <div className="flex">
                <span className="text-gray-500 w-28 flex-shrink-0">사업장 주소</span>
                <span className="text-gray-700">서울시 마포구 독막로6길 27 3층</span>
              </div>
              <div className="flex">
                <span className="text-gray-500 w-28 flex-shrink-0">전화</span>
                <span className="text-gray-700">010-8712-9811</span>
              </div>
              <div className="flex">
                <span className="text-gray-500 w-28 flex-shrink-0">이메일</span>
                <span className="text-gray-700">iky.co.ltd1015@gmail.com</span>
              </div>
            </div>
          </div>

          {/* 저작권 */}
          <div className="mt-6 text-center">
            <Typography variant="caption" className="text-gray-400">
              © 2025 MateYou. All rights reserved.
            </Typography>
          </div>
        </div>
      </div>
    </div>
  )
}
