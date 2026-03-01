import { useDevice } from '@/hooks/useDevice'
import { useEffect, useState, useRef, useCallback, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export interface SlideSheetProps {
  /** 시트 열림 여부 */
  isOpen: boolean
  /** 시트 닫기 콜백 */
  onClose: () => void
  /** 시트 제목 (선택) */
  title?: string
  /** 시트 내용 */
  children: ReactNode
  /** 하단 고정 영역 (버튼 등) */
  footer?: ReactNode
  /** 초기 높이 비율 (0~1, 기본값 0.6) */
  initialHeight?: number
  /** 최소 높이 비율 (0~1, 기본값 0.3) */
  minHeight?: number
  /** 최대 높이 비율 (0~1, 기본값 0.9) */
  maxHeight?: number
  /** z-index (기본값 130) */
  zIndex?: number
  /** 커스텀 헤더 렌더링 (드래그 핸들 props 제공) */
  renderHeader?: (props: {
    onPointerDown: (event: React.PointerEvent) => void
    onTouchStart: (event: React.TouchEvent) => void
  }) => ReactNode
  /** 패딩 없이 렌더링 */
  noPadding?: boolean
  /** PC에서 모달 너비 (기본값 480px) */
  modalWidth?: number
}

export function SlideSheet({
  isOpen,
  onClose,
  title,
  children,
  footer,
  initialHeight = 0.6,
  minHeight = 0.3,
  maxHeight = 0.9,
  zIndex = 130,
  renderHeader,
  noPadding = false,
  modalWidth = 480,
}: SlideSheetProps) {
  const { isDesktop } = useDevice()
  const [isVisible, setIsVisible] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [sheetHeight, setSheetHeight] = useState(initialHeight)
  const [isDragging, setIsDragging] = useState(false)
  
  const dragStartY = useRef<number>(0)
  const dragStartHeight = useRef<number>(initialHeight)
  const lastY = useRef<number>(0)
  const velocity = useRef<number>(0)
  const lastTime = useRef<number>(0)
  const sheetRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLDivElement>(null)

  // 열림/닫힘 애니메이션
  useEffect(() => {
    if (isOpen) {
      setIsClosing(false)
      setSheetHeight(initialHeight)
      const frame = requestAnimationFrame(() => setIsVisible(true))
      return () => cancelAnimationFrame(frame)
    } else {
      setIsVisible(false)
    }
  }, [isOpen, initialHeight])

  // body 스크롤 방지
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = originalOverflow
      }
    }
  }, [isOpen])

  // 닫기 애니메이션
  const handleClose = useCallback(() => {
    setIsClosing(true)
    setTimeout(() => {
      onClose()
      setIsClosing(false)
      setSheetHeight(initialHeight)
    }, 250)
  }, [onClose, initialHeight])

  // 드래그 시작
  const handleDragStart = useCallback((clientY: number) => {
    setIsDragging(true)
    dragStartY.current = clientY
    dragStartHeight.current = sheetHeight
    lastY.current = clientY
    lastTime.current = Date.now()
    velocity.current = 0
  }, [sheetHeight])

  // 드래그 이동
  const handleDragMove = useCallback((clientY: number) => {
    if (!isDragging) return

    const now = Date.now()
    const dt = now - lastTime.current
    if (dt > 0) {
      velocity.current = (clientY - lastY.current) / dt
    }
    lastY.current = clientY
    lastTime.current = now

    const deltaY = dragStartY.current - clientY
    const deltaHeight = deltaY / window.innerHeight
    const newHeight = Math.min(maxHeight, Math.max(0.1, dragStartHeight.current + deltaHeight))
    
    setSheetHeight(newHeight)
  }, [isDragging, maxHeight])

  // 드래그 종료
  const handleDragEnd = useCallback(() => {
    if (!isDragging) return
    setIsDragging(false)

    // 속도 기반 닫기 (빠르게 아래로 스와이프)
    if (velocity.current > 0.5) {
      handleClose()
      return
    }

    // 속도 기반 최대 높이 (빠르게 위로 스와이프)
    if (velocity.current < -0.5) {
      setSheetHeight(maxHeight)
      return
    }

    // 위치 기반 스냅
    if (sheetHeight < minHeight) {
      handleClose()
    } else if (sheetHeight < (minHeight + initialHeight) / 2) {
      setSheetHeight(minHeight)
    } else if (sheetHeight > (initialHeight + maxHeight) / 2) {
      setSheetHeight(maxHeight)
    } else {
      setSheetHeight(initialHeight)
    }
  }, [isDragging, sheetHeight, minHeight, maxHeight, initialHeight, handleClose])

  // 터치 이벤트
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    if (touch) {
      handleDragStart(touch.clientY)
    }
  }, [handleDragStart])

  // 마우스/터치 이벤트 (window에 등록 - passive: false로 preventDefault 가능)
  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault()
      handleDragMove(e.clientY)
    }

    const handleMouseUp = () => {
      handleDragEnd()
    }

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      const touch = e.touches[0]
      if (touch) {
        handleDragMove(touch.clientY)
      }
    }

    const handleTouchEnd = () => {
      handleDragEnd()
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('touchmove', handleTouchMove, { passive: false })
    window.addEventListener('touchend', handleTouchEnd)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [isDragging, handleDragMove, handleDragEnd])

  // 마우스 드래그 시작
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    handleDragStart(e.clientY)
  }, [handleDragStart])

  if (!isOpen) return null

  // PC: 중앙 모달로 표시
  if (isDesktop) {
    const modalContent = (
      <div
        className="fixed inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        style={{ zIndex }}
        onClick={handleClose}
      >
        <div
          className={`flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden ${noPadding ? '' : 'px-4'}`}
          style={{
            width: `${modalWidth}px`,
            maxWidth: '90vw',
            maxHeight: '85vh',
            transform: isClosing || !isVisible ? 'scale(0.95) opacity(0)' : 'scale(1)',
            opacity: isClosing || !isVisible ? 0 : 1,
            transition: 'transform 0.2s ease-out, opacity 0.2s ease-out',
          }}
          onClick={(event) => event.stopPropagation()}
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-[#110f1a]">{title || ''}</h2>
            <button
              onClick={handleClose}
              className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* 콘텐츠 */}
          <div className="flex-1 overflow-y-auto">
            {children}
          </div>

          {/* 푸터 */}
          {footer && (
            <div className="bg-white border-t border-gray-100 p-4">
              {footer}
            </div>
          )}
        </div>
      </div>
    )

    if (typeof document !== 'undefined') {
      return createPortal(modalContent, document.body)
    }
    return modalContent
  }

  // 모바일: 바텀 시트로 표시
  const content = (
    <div
      className="fixed inset-0 flex flex-col items-center bg-black/40 backdrop-blur-sm"
      style={{ zIndex }}
      onClick={handleClose}
    >
      <div
        ref={sheetRef}
        className={`mt-auto flex w-full flex-col rounded-t-3xl bg-white shadow-2xl ${noPadding ? '' : 'px-4'}`}
        style={{
          height: `${sheetHeight * 100}vh`,
          maxHeight: `calc(${maxHeight * 100}vh - env(safe-area-inset-top, 0px))`,
          maxWidth: '720px',
          // footer가 있으면 footer에서 safe-area 처리, 없으면 시트 전체에서 처리
          paddingBottom: footer ? '0px' : 'env(safe-area-inset-bottom, 0px)',
          transition: isDragging ? 'none' : 'height 0.3s cubic-bezier(0.32, 0.72, 0, 1), transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          transform: isClosing || !isVisible ? 'translateY(110%)' : 'translateY(0)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {/* 드래그 가능한 헤더 영역 */}
        <div
          ref={headerRef}
          className="cursor-grab select-none touch-none active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
        >
          {/* 드래그 핸들 바 */}
          <div className="flex justify-center py-3">
            <div className="h-1 w-10 rounded-full bg-gray-300" />
          </div>

          {/* 헤더 */}
          {renderHeader ? (
            renderHeader({
              onPointerDown: handleMouseDown,
              onTouchStart: handleTouchStart,
            })
          ) : title ? (
            <div className="pb-3 text-center">
              <p className="text-base font-semibold text-[#110f1a]">{title}</p>
            </div>
          ) : null}
        </div>

        {/* 콘텐츠 */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>

        {/* 푸터 */}
        {footer && (
          <div 
            className="bg-white pt-3"
            style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  )

  // Portal을 사용하여 document.body에 렌더링 (부모 요소의 pointer-events 영향을 받지 않도록)
  if (typeof document !== 'undefined') {
    return createPortal(content, document.body)
  }

  return content
}

export default SlideSheet
