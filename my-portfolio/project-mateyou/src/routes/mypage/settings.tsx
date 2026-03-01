import { useState, useEffect } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { useAuth } from '@/hooks/useAuth'
import { useDevice } from '@/hooks/useDevice'
import { Button, Typography, SlideSheet } from '@/components'
import { edgeApi } from '@/lib/edgeApi'
import { WEB_VERSION } from '@/constants/app'

export const Route = createFileRoute('/mypage/settings')({
  component: SettingsPage,
})

function SettingsPage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { isMobile } = useDevice()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false)
  const [isDeleteAccountOpen, setIsDeleteAccountOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [appVersion, setAppVersion] = useState<string>(WEB_VERSION)

  useEffect(() => {
    const getAppVersion = async () => {
      if (Capacitor.isNativePlatform()) {
        try {
          const appInfo = await App.getInfo()
          setAppVersion(appInfo.version)
        } catch (error) {
          console.error('앱 버전 가져오기 실패:', error)
        }
      }
    }
    getAppVersion()
  }, [])

  const handleLogout = async () => {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    try {
      await logout()
      navigate({ to: '/login' })
    } catch (error) {
      console.error('로그아웃 실패:', error)
      setIsLoggingOut(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (isDeleting) return
    if (deleteConfirmText !== '탈퇴') {
      alert('탈퇴를 입력해주세요.')
      return
    }

    setIsDeleting(true)
    try {
      console.log('🗑️ 계정 삭제 요청 시작')
      const response = await edgeApi.auth.deleteAccount()
      console.log('🗑️ 계정 삭제 응답:', JSON.stringify(response))
      
      if (response.success) {
        await logout()
        alert('계정이 삭제되었습니다.')
        navigate({ to: '/login' })
      } else {
        const errorMsg = response.error?.message || response.error?.code || JSON.stringify(response.error) || '계정 삭제 실패'
        console.error('🗑️ 삭제 실패 응답:', errorMsg)
        alert(`계정 삭제 실패: ${errorMsg}`)
        setIsDeleting(false)
      }
    } catch (error: any) {
      const errorMsg = error?.message || JSON.stringify(error) || '알 수 없는 오류'
      console.error('🗑️ 계정 삭제 예외:', errorMsg)
      alert(`계정 삭제 실패: ${errorMsg}`)
      setIsDeleting(false)
    }
  }

  const settingsItems = [
    {
      label: '서비스 이용약관',
      path: '/terms',
    },
    {
      label: '개인정보처리방침',
      path: '/privacy',
    },
    {
      label: '앱 버전',
      rightText: appVersion,
      path: '/mypage/version',
    },
  ]

  const handleMenuItemClick = (item: typeof settingsItems[0]) => {
    if (item.path) {
      navigate({ to: item.path })
      return
    }
    item.onClick?.()
  }

  return (
    <div className={`flex flex-col ${isMobile ? 'h-full overflow-hidden' : 'min-h-screen'}`}>
      <div className={`container mx-auto py-6 pb-16 flex flex-col flex-1 ${isMobile ? 'overflow-y-auto pt-16' : 'justify-center items-center'}`}>
        <div className={`w-full ${isMobile ? '' : 'max-w-4xl'}`}>
          {/* 설정 메뉴 - /mypage 스타일 동일 */}
          <div>
            {settingsItems.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => handleMenuItemClick(item)}
                className="flex w-full items-center justify-between border-b border-gray-200 bg-white p-6 text-left transition-colors duration-200 hover:bg-gray-50 cursor-pointer"
              >
                <Typography variant="body1" className="font-semibold text-[#110f1a]">
                  {item.label}
                </Typography>
                <div className="flex items-center gap-3">
                  {item.rightText ? (
                    <Typography variant="body1" className="font-semibold text-[#110f1a]">
                      {item.rightText}
                    </Typography>
                  ) : null}
                  <ChevronRight className="h-5 w-5 text-gray-300" />
                </div>
              </button>
            ))}
          </div>

          {/* 로그아웃 및 계정 탈퇴 - 최하단 작게 */}
          <div className="mt-12 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => setIsLogoutConfirmOpen(true)}
              disabled={isLoggingOut}
              className="text-gray-400 text-sm hover:text-gray-600 transition-colors"
            >
              {isLoggingOut ? '로그아웃 중...' : '로그아웃'}
            </button>
            <button
              type="button"
              className="text-gray-300 text-xs hover:text-gray-500 transition-colors"
              onClick={() => setIsDeleteAccountOpen(true)}
            >
              계정 탈퇴
            </button>
          </div>
        </div>
      </div>

      {/* 로그아웃 확인 팝업 */}
      <SlideSheet
        isOpen={isLogoutConfirmOpen}
        onClose={() => setIsLogoutConfirmOpen(false)}
        title="로그아웃"
        initialHeight={0.3}
        minHeight={0.25}
        maxHeight={0.4}
      >
        <div className="p-4 space-y-4">
          <Typography variant="body1" className="text-center text-gray-700">
            정말 로그아웃 하시겠습니까?
          </Typography>
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => setIsLogoutConfirmOpen(false)}
              className="flex-1"
            >
              취소
            </Button>
            <Button
              variant="primary"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex-1 bg-red-500 hover:bg-red-600"
            >
              {isLoggingOut ? '로그아웃 중...' : '로그아웃'}
            </Button>
          </div>
        </div>
      </SlideSheet>

      {/* 계정 탈퇴 확인 팝업 */}
      <SlideSheet
        isOpen={isDeleteAccountOpen}
        onClose={() => {
          setIsDeleteAccountOpen(false)
          setDeleteConfirmText('')
        }}
        title="계정 탈퇴"
        initialHeight={0.45}
        minHeight={0.4}
        maxHeight={0.5}
      >
        <div className="p-4 space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <Typography variant="body2" className="text-red-700">
              ⚠️ 계정을 탈퇴하면 모든 데이터가 삭제되며 복구할 수 없습니다.
            </Typography>
          </div>
          <Typography variant="body2" className="text-gray-600">
            탈퇴를 원하시면 아래에 <span className="font-bold text-red-500">"탈퇴"</span>를 입력해주세요.
          </Typography>
          <input
            type="text"
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            placeholder="탈퇴"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
          />
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setIsDeleteAccountOpen(false)
                setDeleteConfirmText('')
              }}
              className="flex-1"
            >
              취소
            </Button>
            <Button
              variant="primary"
              onClick={handleDeleteAccount}
              disabled={isDeleting || deleteConfirmText !== '탈퇴'}
              className="flex-1 bg-red-500 hover:bg-red-600 disabled:bg-gray-300"
            >
              {isDeleting ? '삭제 중...' : '계정 삭제'}
            </Button>
          </div>
        </div>
      </SlideSheet>
    </div>
  )
}
