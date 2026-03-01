import { cn } from '@/lib/utils'
import { Eye, EyeOff } from 'lucide-react'

interface StreamHudControlsProps {
  isHudHidden: boolean
  onToggleHud: () => void
  onOpenGuide: () => void
  className?: string
}

/**
 * StreamHudControls - 라이브 화면 오버레이 컨트롤
 * - UI 숨김/표시 토글
 * - 도움말(가이드) 열기
 */
export function StreamHudControls({
  isHudHidden,
  onToggleHud,
  onOpenGuide,
  className,
}: StreamHudControlsProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <button
        type="button"
        onClick={onOpenGuide}
        className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm text-white/90 hover:bg-black/55 transition-colors flex items-center justify-center"
        aria-label="도움말"
      >
        <span className="text-[15px] font-bold leading-none">?</span>
      </button>

      <button
        type="button"
        onClick={onToggleHud}
        className="w-9 h-9 rounded-full bg-black/40 backdrop-blur-sm text-white/90 hover:bg-black/55 transition-colors flex items-center justify-center"
        aria-label={isHudHidden ? 'UI 표시' : 'UI 숨기기'}
      >
        {isHudHidden ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
      </button>
    </div>
  )
}

