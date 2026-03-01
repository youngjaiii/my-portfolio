import { Flex } from '@/components'
import { useEffect, useState } from 'react'

interface AvatarProps {
  src?: string
  alt?: string
  name?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

export function Avatar({
  src,
  alt,
  name,
  size = 'md',
  className = '',
}: AvatarProps) {
  const sizeClasses = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-sm',
    md: 'w-12 h-12 text-base',
    lg: 'w-16 h-16 text-lg',
    xl: 'w-24 h-24 text-xl',
  }

  const getInitials = (displayName?: string) => {
    if (!displayName) return '?'
    return displayName
      .split(' ')
      .map((word) => word.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const getBackgroundColor = (displayName?: string) => {
    if (!displayName) return 'bg-gray-400'

    const colors = [
      'bg-red-400',
      'bg-blue-400',
      'bg-green-400',
      'bg-yellow-400',
      'bg-purple-400',
      'bg-pink-400',
      'bg-indigo-400',
      'bg-teal-400',
    ]

    const index = displayName.charCodeAt(0) % colors.length
    return colors[index]
  }

  const [imageError, setImageError] = useState(false)

  useEffect(() => {
    setImageError(false)
  }, [src])

  const showImage = Boolean(src) && !imageError

  if (showImage) {
    return (
      <img
        src={src}
        alt={alt || name || 'Profile'}
        className={`${sizeClasses[size]} rounded-full object-cover ${className}`}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        onError={() => setImageError(true)}
      />
    )
  }

  return (
    <Flex
      align="center"
      justify="center"
      className={`${sizeClasses[size]} rounded-full ${getBackgroundColor(name)} text-white font-semibold ${className}`}
    >
      {getInitials(name)}
    </Flex>
  )
}

interface AvatarWithFallbackProps extends AvatarProps {
  src?: string
}

export function AvatarWithFallback({
  src,
  name,
  ...props
}: AvatarWithFallbackProps) {
  const [imageError, setImageError] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)
  const [currentSrc, setCurrentSrc] = useState<string | undefined>(src)

  // src가 변경되면 즉시 상태 업데이트 및 에러 상태 초기화
  useEffect(() => {
    setCurrentSrc(src)
    setImageError(false)
    setImageLoaded(false)
  }, [src])

  // 이미지가 없거나 에러가 발생했을 때만 fallback 표시
  const showFallback = !currentSrc || imageError
  const showImage = currentSrc && !imageError

  return (
    <div className="relative">
      {showImage && (
        <img
          key={currentSrc} // key를 추가하여 src 변경 시 즉시 재렌더링
          src={currentSrc}
          alt={props.alt || name || 'Profile'}
          className={`${
            props.size
              ? {
                  xs: 'w-6 h-6',
                  sm: 'w-8 h-8',
                  md: 'w-12 h-12',
                  lg: 'w-16 h-16',
                  xl: 'w-24 h-24',
                }[props.size]
              : 'w-12 h-12'
          } rounded-full object-cover border border-gray-200 ${props.className || ''}`}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          crossOrigin="anonymous"
          onError={(e) => {
            console.warn('Avatar image load error (429 or other):', currentSrc)
            setImageError(true)
            setImageLoaded(false)
          }}
          onLoad={(e) => {
            setImageLoaded(true)
          }}
        />
      )}
      {showFallback && (
        <Avatar
          name={name}
          {...props}
          src={undefined}
          className={props.className || ''}
        />
      )}
    </div>
  )
}
