import { MessageCircle, Home, UserRound, TvIcon, Globe } from 'lucide-react'
import { Link, useLocation, useNavigate, useRouter } from '@tanstack/react-router'
import type { MouseEvent, ReactNode } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { useGlobalRealtime } from '@/contexts/GlobalRealtimeProvider'
import { setPendingTransitionIntent } from '@/utils/navigationTransition'
import { Capacitor } from '@capacitor/core'
import { useCreatePostStore } from '@/store/useCreatePostStore'

export type FeedNavTab = 'home' | 'explore' | 'create' | 'chat' | 'mypage' | 'cart' | 'stream'

export interface MobileTabBarItem {
  key: string
  label: string
  icon: ReactNode
  path?: string
  requiresAuth?: boolean
}

interface MobileTabBarProps {
  items?: Array<MobileTabBarItem>
  activeKey?: string
  onChange?: (key: string) => void
}

// 기본 탭 아이템 - 순서: 홈, 채팅, 탐색, 마이페이지, 장바구니
export const getfeedNavItems = (): Array<MobileTabBarItem & { key: FeedNavTab }> => {
  return [
    { key: 'home', label: '피드', icon: <Home className="h-6 w-6" />, path: '/feed/all' },
    { key: 'explore', label: '탐색', icon: <Globe className="h-6 w-6" />, path: '/explore' },
    { key: 'chat', label: '채팅', icon: <MessageCircle className="h-6 w-6" />, path: '/chat', requiresAuth: true },
    { key: 'stream', label: '스트리밍', icon: <TvIcon className="h-6 w-6" />, path: '/stream' },
    { key: 'mypage', label: '마이', icon: <UserRound className="h-6 w-6" />, path: '/mypage', requiresAuth: true },
  ]
}

// 하위 호환성을 위해 기존 export 유지
export const feedNavItems: Array<MobileTabBarItem & { key: FeedNavTab }> = [
  { key: 'home', label: '피드', icon: <Home className="h-6 w-6" />, path: '/feed/all' },
  { key: 'explore', label: '탐색', icon: <Globe className="h-6 w-6" />, path: '/explore' },
  { key: 'chat', label: '채팅', icon: <MessageCircle className="h-6 w-6" />, path: '/chat', requiresAuth: true },
  { key: 'stream', label: '스트리밍', icon: <TvIcon className="h-6 w-6" />, path: '/stream' },
  { key: 'mypage', label: '마이', icon: <UserRound className="h-6 w-6" />, path: '/mypage', requiresAuth: true },
]

export function MobileTabBar({ items, activeKey, onChange }: MobileTabBarProps) {
  const location = useLocation()
  const router = useRouter()
  const navigate = useNavigate()
  const { isAuthenticated, user } = useAuth()
  const { totalUnreadCount } = useGlobalRealtime()
  
  // 탭 아이템 생성
  const dynamicItems = items || getfeedNavItems()

  // 새글 작성 핸들러
  const handleCreatePost = () => {
    if (!isAuthenticated) {
      router.navigate({ to: '/login' })
      return
    }
    
    const isNative = Capacitor.isNativePlatform()
    if (isNative) {
      // 네이티브: /feed/create로 이동
      navigate({ to: '/feed/create' })
    } else {
      // 웹: 파일 드롭다운 띄우기
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = 'image/*,video/*'
      input.multiple = true
      input.onchange = (e) => {
        const target = e.target as HTMLInputElement
        if (target.files && target.files.length > 0) {
          const files = Array.from(target.files)
          const newMedia = files.map((file) => ({
            file,
            preview: URL.createObjectURL(file),
            type: file.type.startsWith('video/') ? 'video' as const : 'image' as const,
          }))
          useCreatePostStore.getState().addSelectedMedia(newMedia)
          useCreatePostStore.getState().addGalleryImages(newMedia)
          useCreatePostStore.getState().setHasRequestedPermission(true)
          navigate({ to: '/feed/create' })
        }
      }
      input.click()
    }
  }

  const getMyPagePath = () => {
    if (!user) {
      return '/login'
    }
    
    // 명확한 분기 처리
    // normal: /mypage
    // admin: /mypage  
    // partner: /partners/$memberCode (member_code가 있을 때만)
    if (user.role === 'normal' || user.role === 'admin' || !user.role) {
      return '/mypage'
    }
    
    if (user.role === 'partner' && user.member_code) {
      return `/partners/${user.member_code}`
    }
    
    // fallback
    return '/mypage'
  }

  const resolveActive = (itemKey: string, itemPath?: string) => {
    if (onChange) {
      return activeKey === itemKey
    }
    if (!itemPath) return false
    if (itemKey === 'home') {
      return location.pathname.startsWith('/feed')
    }
    if (itemKey === 'chat') {
      return location.pathname.startsWith('/chat')
    }
    if (itemKey === 'stream') {
      return location.pathname.startsWith('/stream')
    }
    if (itemKey === 'mypage') {
      if (!user) {
        return location.pathname.startsWith('/login')
      }
      // normal, admin: /mypage에서만 활성화
      // partner: /partners 또는 /mypage에서 활성화
      if (user.role === 'normal' || user.role === 'admin' || !user.role) {
        return location.pathname.startsWith('/mypage')
      }
      if (user.role === 'partner') {
        return location.pathname.startsWith('/partners') || location.pathname.startsWith('/mypage')
      }
      return location.pathname.startsWith('/mypage')
    }
    return itemPath === '/' ? location.pathname === '/' : location.pathname.startsWith(itemPath)
  }

  const resolvedItems = dynamicItems.map((item) => ({
    ...item,
    targetPath: item.key === 'mypage' ? getMyPagePath() : item.path,
  }))

  const activeIndex = resolvedItems.findIndex((item) => resolveActive(item.key, item.targetPath))

  const handleNavigationIntent = (targetKey: string, targetPath?: string) => {
    if (activeIndex === -1) return
    const targetIndex = resolvedItems.findIndex((item) => item.key === targetKey)
    if (targetIndex === -1 || targetIndex === activeIndex) return
    const direction = targetIndex < activeIndex ? 1 : -1
    if (targetPath) {
      setPendingTransitionIntent(targetPath, direction)
    }
  }

  const handleClick = (item: MobileTabBarItem, event: MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => {
    // 새글 버튼은 특별 처리
    if (item.key === 'create') {
      event.preventDefault()
      handleCreatePost()
      return
    }

    if (item.requiresAuth && !isAuthenticated) {
      event.preventDefault()
      router.navigate({ to: '/login' })
      return
    }

    handleNavigationIntent(item.key, resolvedItems.find((entry) => entry.key === item.key)?.targetPath)

    if (onChange) {
      event.preventDefault()
      onChange(item.key)
    }
  }

  return (
    <nav 
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white shadow-[0_-6px_18px_rgba(0,0,0,0.08)] lg:hidden"
    >
      <div className="mx-auto flex max-w-md items-center justify-around px-2 py-4">
        {resolvedItems.map((item) => {
          const targetPath = item.targetPath
          const active = resolveActive(item.key, targetPath)
          const showChatBadge = item.key === 'chat' && totalUnreadCount > 0
          const content = (
            <>
              <span
                className={`relative rounded-full p-1.5 ${
                  active ? 'text-[#110f1a]' : 'text-gray-400'
                }`}
              >
                {item.icon}
                {showChatBadge && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#FE3A8F] px-1 text-[10px] font-bold text-white">
                    {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
                  </span>
                )}
              </span>
            </>
          )

          return onChange ? (
            <button
              key={item.key}
              onClick={(event) => handleClick(item, event)}
              className={`relative flex flex-col items-center gap-1 text-xs font-semibold ${
                active ? 'text-[#110f1a]' : 'text-gray-400'
              }`}
            >
              {content}
            </button>
          ) : (
            <Link
              key={item.key}
              to={targetPath || '#'}
              className={`relative flex flex-col items-center gap-1 text-xs font-semibold ${
                active ? 'text-[#110f1a]' : 'text-gray-400'
              }`}
              onClick={(event) => handleClick(item, event)}
            >
              {content}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
