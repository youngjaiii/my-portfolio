import { Flex } from '@/components'

interface StarRatingProps {
  rating: number
  maxRating?: number
  size?: 'sm' | 'md' | 'lg'
  showRating?: boolean
  readonly?: boolean
  onChange?: (rating: number) => void
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
}

export function StarRating({
  rating,
  maxRating = 5,
  size = 'md',
  showRating = false,
  readonly = true,
  onChange,
}: StarRatingProps) {
  const handleStarClick = (starRating: number) => {
    if (!readonly && onChange) {
      onChange(starRating)
    }
  }

  return (
    <Flex align="center" gap={1}>
      <Flex gap={0}>
        {Array.from({ length: maxRating }, (_, index) => {
          const starValue = index + 1
          const isFilled = starValue <= rating
          const isHalfFilled = starValue - 0.5 <= rating && starValue > rating

          return (
            <button
              key={index}
              type="button"
              className={`${readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110'} transition-transform`}
              onClick={() => handleStarClick(starValue)}
              disabled={readonly}
            >
              <svg
                className={`${sizeClasses[size]} ${
                  isFilled
                    ? 'text-yellow-400'
                    : isHalfFilled
                      ? 'text-yellow-400'
                      : 'text-gray-300'
                }`}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                {isHalfFilled ? (
                  <defs>
                    <linearGradient id={`half-${index}`}>
                      <stop offset="50%" stopColor="currentColor" />
                      <stop offset="50%" stopColor="#D1D5DB" />
                    </linearGradient>
                  </defs>
                ) : null}
                <path
                  d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
                  fill={isHalfFilled ? `url(#half-${index})` : 'currentColor'}
                />
              </svg>
            </button>
          )
        })}
      </Flex>
      {showRating && (
        <span className="text-sm text-gray-600 ml-2">
          {rating.toFixed(1)} / {maxRating}
        </span>
      )}
    </Flex>
  )
}
