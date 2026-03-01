import { memo } from 'react'
import { Outlet } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { Capacitor } from '@capacitor/core'

interface ResponsiveMainContentProps {
  // Ref 타입 호환성을 위해 유연한 타입 사용
  scrollContainerRef: { current: HTMLDivElement | null }
  currentPath: string
  pageKey: string
  transitionDirection: number
  shouldHideInstantLoad: boolean
  setIsTransitioning: (value: boolean) => void
  onNavigatePending: () => void
}

const pageVariants = {
  enter: () => ({
    opacity: 1,
  }),
  center: {
    opacity: 1,
  },
  exit: () => ({
    opacity: 1,
  }),
}

// 네이티브 여부는 정적 값이므로 컴포넌트 외부에서 한 번만 계산
const isNative = Capacitor.isNativePlatform()

/**
 * 메인 컨텐츠 영역
 * 웹에서는 항상 트랜지션 비활성화
 * 네이티브에서는 특정 경로에서만 비활성화
 */
export const ResponsiveMainContent = memo(function ResponsiveMainContent({
  scrollContainerRef,
  currentPath,
  pageKey,
  transitionDirection,
  shouldHideInstantLoad,
  setIsTransitioning,
  onNavigatePending,
}: ResponsiveMainContentProps) {
  // 웹에서는 항상 트랜지션 비활성화, 네이티브에서는 특정 경로에서만 비활성화
  const shouldDisableTransition = !isNative
    ? true
    : currentPath.startsWith('/login') ||
      currentPath.startsWith('/mypage') ||
      currentPath.startsWith('/dashboard/partner') ||
      currentPath.startsWith('/timesheet')

  if (shouldDisableTransition) {
    return (
      <div
        ref={scrollContainerRef as unknown as React.RefObject<HTMLDivElement>}
        className="flex-1 overflow-y-auto lg:absolute lg:inset-0 flex w-full flex-col lg:h-full h-full max-h-full lg:max-h-none"
      >
        <Outlet />
      </div>
    )
  }

  return (
    <AnimatePresence initial={false} custom={transitionDirection} mode="wait">
      <motion.div
        ref={scrollContainerRef as unknown as React.RefObject<HTMLDivElement>}
        key={pageKey}
        custom={transitionDirection}
        variants={pageVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{
          duration: 0,
        }}
        className="flex-1 overflow-y-auto lg:absolute lg:inset-0 flex w-full flex-col lg:h-full h-full max-h-full lg:max-h-none"
        style={{
          pointerEvents: 'auto',
          opacity: shouldHideInstantLoad ? 0 : undefined,
        }}
        onAnimationStart={() => {
          if (shouldHideInstantLoad) {
            setTimeout(() => {
              // allow browser to apply initial opacity before transition
            }, 0)
          }
        }}
        onAnimationComplete={() => {
          setIsTransitioning(false)
          onNavigatePending()
        }}
      >
        <Outlet />
      </motion.div>
    </AnimatePresence>
  )
})
