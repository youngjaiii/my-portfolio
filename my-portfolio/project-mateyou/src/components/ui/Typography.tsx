import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react'

type TypographyVariant =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'body1'
  | 'body2'
  | 'caption'
  | 'overline'
  | 'subtitle1'
  | 'subtitle2'

type TypographyColor =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'error'
  | 'warning'
  | 'info'
  | 'text-primary'
  | 'text-secondary'
  | 'text-disabled'

const variantStyles: Record<TypographyVariant, string> = {
  h1: 'text-4xl font-bold leading-tight',
  h2: 'text-3xl font-bold leading-tight',
  h3: 'text-2xl font-semibold leading-tight',
  h4: 'text-xl font-semibold leading-snug',
  h5: 'text-lg font-semibold leading-snug',
  h6: 'text-base font-semibold leading-normal',
  subtitle1: 'text-lg font-medium leading-relaxed',
  subtitle2: 'text-base font-medium leading-relaxed',
  body1: 'text-base leading-relaxed',
  body2: 'text-sm leading-relaxed',
  caption: 'text-xs leading-normal',
  overline: 'text-xs font-medium uppercase tracking-wider leading-normal',
}

const colorStyles: Record<TypographyColor, string> = {
  primary: 'text-blue-600',
  secondary: 'text-purple-600',
  success: 'text-green-600',
  error: 'text-red-600',
  warning: 'text-yellow-600',
  info: 'text-blue-500',
  'text-primary': 'text-gray-900',
  'text-secondary': 'text-gray-600',
  'text-disabled': 'text-gray-400',
}

const defaultElementMap: Record<TypographyVariant, ElementType> = {
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  h4: 'h4',
  h5: 'h5',
  h6: 'h6',
  subtitle1: 'h6',
  subtitle2: 'h6',
  body1: 'p',
  body2: 'p',
  caption: 'span',
  overline: 'span',
}

interface TypographyOwnProps {
  variant?: TypographyVariant
  color?: TypographyColor
  children: ReactNode
  className?: string
}

type TypographyProps<T extends ElementType> = TypographyOwnProps & {
  as?: T
} & ComponentPropsWithoutRef<T>

export function Typography<T extends ElementType = 'p'>({
  variant = 'body1',
  color = 'text-primary',
  as,
  children,
  className = '',
  ...props
}: TypographyProps<T>) {
  const Component = as || defaultElementMap[variant] || 'p'

  const classes = [variantStyles[variant], colorStyles[color], className]
    .filter(Boolean)
    .join(' ')

  return (
    <Component className={classes} {...props}>
      {children}
    </Component>
  )
}
