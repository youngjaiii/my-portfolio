import type { ReactNode } from 'react'
import { useDevice } from '@/hooks/useDevice'

interface GridProps {
  children: ReactNode
  cols?: 1 | 2 | 3 | 4 | 5 | 6 | 12 | 'none'
  gap?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12
  smCols?: 1 | 2 | 3 | 4 | 5 | 6 | 12 | 'none'
  mdCols?: 1 | 2 | 3 | 4 | 5 | 6 | 12 | 'none'
  lgCols?: 1 | 2 | 3 | 4 | 5 | 6 | 12 | 'none'
  mobileCols?: 1 | 2 | 3 | 4 | 5 | 6 | 12 | 'none'
  desktopCols?: 1 | 2 | 3 | 4 | 5 | 6 | 12 | 'none'
  className?: string
}

const colsClasses = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
  12: 'grid-cols-12',
  none: 'grid-cols-none',
}

const smColsClasses = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-4',
  5: 'sm:grid-cols-5',
  6: 'sm:grid-cols-6',
  12: 'sm:grid-cols-12',
  none: 'sm:grid-cols-none',
}

const mdColsClasses = {
  1: 'md:grid-cols-1',
  2: 'md:grid-cols-2',
  3: 'md:grid-cols-3',
  4: 'md:grid-cols-4',
  5: 'md:grid-cols-5',
  6: 'md:grid-cols-6',
  12: 'md:grid-cols-12',
  none: 'md:grid-cols-none',
}

const lgColsClasses = {
  1: 'lg:grid-cols-1',
  2: 'lg:grid-cols-2',
  3: 'lg:grid-cols-3',
  4: 'lg:grid-cols-4',
  5: 'lg:grid-cols-5',
  6: 'lg:grid-cols-6',
  12: 'lg:grid-cols-12',
  none: 'lg:grid-cols-none',
}

const gapClasses = {
  0: 'gap-0',
  1: 'gap-1',
  2: 'gap-2',
  3: 'gap-3',
  4: 'gap-4',
  5: 'gap-5',
  6: 'gap-6',
  8: 'gap-8',
  10: 'gap-10',
  12: 'gap-12',
}

export function Grid({
  children,
  cols = 1,
  gap = 0,
  smCols,
  mdCols,
  lgCols,
  mobileCols,
  desktopCols,
  className = '',
}: GridProps) {
  const { isMobile, isDesktop } = useDevice()

  // 디바이스별 우선 적용
  let effectiveCols = cols
  if (isMobile && mobileCols) {
    effectiveCols = mobileCols
  } else if (isDesktop && desktopCols) {
    effectiveCols = desktopCols
  }

  const classes = [
    'grid',
    colsClasses[effectiveCols],
    smCols && smColsClasses[smCols],
    mdCols && mdColsClasses[mdCols],
    lgCols && lgColsClasses[lgCols],
    gapClasses[gap],
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return <div className={classes}>{children}</div>
}
